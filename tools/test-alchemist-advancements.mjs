import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NativeAlchemistASI, NativeAlchemistChoice, _del } from './data/dnd5e-alchemist-advancement-native.mjs';
import { nativeAlchemistPrerequisites } from './data/dnd5e-alchemist-native.mjs';
import { alchemistDiscoveryPrerequisites } from '../scripts/alchemist-discoveries.mjs';
import { alchemistAllowFeat, alchemistASIContext, alchemistASIDrop, chooseExtraDiscovery, clearExtraDiscovery,
  alchemistReplacementContext, alchemistReplaceDiscovery, alchemistRestoreDiscovery, alchemistASIRender } from '../scripts/alchemist-advancements.mjs';

const read = pack => fs.readdirSync(`packs/_source/${pack}`).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(`packs/_source/${pack}/${f}`, 'utf8')));
const docs = read('classes'), clsData = docs.find(d => d.flags?.spikependium?.key === 'class:alchemist');
const choiceData = clsData.system.advancement.find(a => a._id === clsData.flags.spikependium.alchemistDiscoveryChoice);
assert.equal(choiceData.title, 'Известные открытия');
assert.equal(choiceData.configuration.pool.length, 34);
assert.deepEqual(clsData.system.advancement.filter(a => a.type === 'AbilityScoreImprovement').map(a => a.level), [4,8,12,16,19]);
const clone = structuredClone;
const value = data => Object.defineProperty(data, 'toObject', { value() { return clone({ ...this }); }, configurable: true });
const get = (obj, path) => path.split('.').reduce((o,k) => o?.[k], obj);
function merge(target, changes) {
  for (const [key,v] of Object.entries(changes)) {
    const keys = key.split('.'), leaf = keys.pop(); let o = target;
    for (const k of keys) o = o[k] ??= {};
    if (v === _del) delete o[leaf];
    else if (v && typeof v === 'object' && !Array.isArray(v)) merge(o[leaf] ??= {}, v);
    else o[leaf] = clone(v);
  }
}
let selection, selectHook, fails, id = 0, allowFeats = false, warnings = [];
globalThis.Actor = class {};
globalThis.dnd5e = { settings: { rulesVersion: 'legacy' }, registry: { items: new Map() } };
globalThis.game = { settings: { get: () => allowFeats }, i18n: { getListFormatter: () => ({ format: a => a.join(', ') }) } };
globalThis.ui = { notifications: { warn: message => warnings.push(message), error: message => warnings.push(message) } };
globalThis.foundry = { utils: { isEmpty: o => !o || !Object.keys(o).length, getProperty: get, escapeHTML: s => s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;') },
  applications: { api: { DialogV2: { async input(options) { await selectHook?.(options); return selection; } } } } };
const sources = new Map(choiceData.configuration.pool.map(({uuid}) => {
  const data = docs.find(d => d._id === uuid.split('.').at(-1)), source = { ...clone(data), id: data._id, uuid };
  source.system.prerequisites.items = new Set(source.system.prerequisites.items);
  source.system.parent = source;
  source.system.validatePrerequisites = context => alchemistDiscoveryPrerequisites.call(source.system, c => nativeAlchemistPrerequisites.call(source.system, c), context);
  return [uuid,source];
}));
globalThis.fromUuid = async uuid => fails === uuid ? null : sources.get(uuid);
globalThis.fromUuidSync = uuid => sources.get(uuid);
const source = key => [...sources.values()].find(s => s.flags.spikependium.key === `alchemist:discovery:${key}`);
const basic = [...sources.values()].filter(s => s.system.prerequisites.level <= 4 && !s.system.prerequisites.items.size);
assert.ok(basic.length >= 4);
function harness(level = 4) {
  const actor = { isOwner: true, items: new Map(), system: { details: { level: 20 }, abilities: { str: { value: 10, max: 20 }, int: { value: 16, max: 20 } } },
    identifiedItems: new Map(), sourcedItems: new Map(), reset() { this.reindex(); },
    reindex() {
      this.identifiedItems = new Map(); this.sourcedItems = new Map();
      for (const i of this.items.values()) {
        const key = `feat:${i.system.identifier}`, uuid = i.flags.dnd5e.sourceId;
        (this.identifiedItems.get(key) ?? this.identifiedItems.set(key,new Set()).get(key)).add(i.id);
        (this.sourcedItems.get(uuid) ?? this.sourcedItems.set(uuid,new Set()).get(uuid)).add(i.id);
      }
    },
    updateSource(changes) {
      const { items, ...other } = changes; merge(this, other);
      for (const data of items ?? []) {
        const s = sources.get(data.flags.dnd5e.sourceId);
        this.items.set(data._id, { ...clone(data), id: data._id, system: { ...clone(data.system), assertPrerequisites: () => true },
          toObject() { const { system, id, toObject, ...rest } = this; const { assertPrerequisites, ...plain } = system; return clone({ ...rest, system: plain }); } });
      }
      this.system._source.abilities = clone(this.system.abilities); this.reindex();
    } };
  actor.system._source = { abilities: clone(actor.system.abilities) };
  actor.system.toObject = () => ({ abilities: clone(actor.system.abilities) });
  const item = { id: 'alchemist', flags: clone(clsData.flags), system: { advancement: [] }, getFlag: () => undefined };
  function configure(a, data) {
    Object.assign(a, { ...clone(data), id: data._id, actor, item });
    a.value = value(a.type === 'ItemChoice' ? { added: {}, replaced: {} } : { assignments: null, feat: null, type: null });
    a.toObject = () => ({ value: a.value.toObject(), configuration: clone(a.configuration) });
    a.updateSource = (changes, options = {}) => { if (options.recursive === false && changes.value) a.value = value(clone(changes.value)); else merge(a,changes); };
    a.createItemData = async (uuid, originalId) => {
      if (uuid && fails === uuid) throw Error('fixture create failure');
      const s = sources.get(uuid); if (!s) return null;
      const d = clone(docs.find(d => d._id === s.id)); d._id = originalId ?? `owned-${++id}`;
      d.flags.dnd5e = { sourceId: uuid, advancementOrigin: `${item.id}.${a.id}`, advancementRoot: `${item.id}.${a.id}` }; return d;
    };
    item.system.advancement.push(a); return a;
  }
  const asi = configure(new NativeAlchemistASI(), clsData.system.advancement.find(a => a.type === 'AbilityScoreImprovement' && a.level === level));
  asi.canImprove = () => true; Object.defineProperty(asi,'allowFeat',{ get() { return alchemistAllowFeat.call(this, () => allowFeats); } });
  const choice = configure(new NativeAlchemistChoice(), choiceData);
  const apply = choice.apply.bind(choice), restore = choice._restoreReplacedItem.bind(choice);
  choice.apply = (...args) => alchemistReplaceDiscovery.call(choice,apply,...args);
  choice._restoreReplacedItem = (...args) => alchemistRestoreDiscovery.call(choice,restore,...args);
  const flow = { advancement: asi, level, render() { this.renders = (this.renders ?? 0) + 1; } };
  return { actor, item, asi, choice, flow };
}
async function choose(h,s) { selection = { discovery: s.uuid }; await chooseExtraDiscovery(h.flow); }

for (const level of [4,8,12,16,19]) {
  const h = harness(level);
  await h.asi.apply(level,{ type: 'asi', assignments: { int: 2 } }); assert.equal(h.actor.system.abilities.int.value,18);
  await choose(h,basic[0]); assert.equal(h.actor.system.abilities.int.value,16); assert.equal(h.actor.items.size,1);
  assert.equal(h.asi.value.type,'feat'); assert.equal(h.asi.value.assignments,null);
  const doc = [...h.actor.items.values()][0]; assert.equal(doc.flags.dnd5e.advancementOrigin,`alchemist.${h.asi.id}`);
  await choose(h,basic[1]); assert.equal(h.actor.items.size,1); assert.equal(h.actor.system.abilities.int.value,16);
  await clearExtraDiscovery(h.flow); assert.equal(h.actor.items.size,0); assert.equal(h.asi.value.type,null);
  await h.asi.apply(level,{type:'asi',assignments:{int:2}}); assert.equal(h.actor.system.abilities.int.value,18);
}
{
  const h = harness(); await h.asi.apply(4,{type:'asi',assignments:{int:2}});
  selection = null; await chooseExtraDiscovery(h.flow); assert.equal(h.actor.system.abilities.int.value,18); assert.equal(h.asi.value.type,'asi');
  h.actor.isOwner=false; await choose(h,basic[0]); assert.equal(h.asi.value.type,'asi'); h.actor.isOwner=true;
  const high = [...sources.values()].find(s => s.system.prerequisites.level>4);
  await choose(h,high); assert.equal(h.asi.value.type,'asi','multiclass total level cannot unlock a high-level discovery');
  const specialty = [...sources.values()].find(s => s.system.prerequisites.items.size);
  await choose(h,specialty); assert.equal(h.asi.value.type,'asi','specialty restriction');
  selection={discovery:basic[0].uuid}; selectHook=()=>{ h.asi.value.type=null; };
  await chooseExtraDiscovery(h.flow); assert.equal(h.actor.items.size,0,'stale dialog changes no items'); selectHook=undefined;
  h.asi.value.type='asi';
  selectHook=()=>{ fails=basic[0].uuid; };
  await assert.rejects(choose(h,basic[0]),/fixture create failure/); selectHook=undefined; fails=undefined;
  assert.equal(h.asi.value.type,'asi'); assert.equal(h.actor.system.abilities.int.value,18,'failed creation restores the prior ASI exactly');
  await choose(h,basic[0]); const previous=Object.keys(h.asi.value.feat)[0];
  selectHook=()=>{ fails=basic[1].uuid; };
  await assert.rejects(choose(h,basic[1]),/fixture create failure/); selectHook=undefined; fails=undefined;
  assert.equal(h.actor.items.size,1); assert.equal(h.actor.items.has(previous),true,'failed change restores the same owned discovery and nested advancement data');
  assert.equal(Object.keys(h.asi.value.feat)[0],previous);
}
{
  const h=harness(); await h.choice.apply(4,{selected:[basic[0].uuid,basic[1].uuid]});
  await choose(h,basic[0]); assert.equal(h.asi.value.type,null,'duplicate discovery blocked');
  await choose(h,basic[2]); assert.equal(h.actor.items.size,3); assert.equal(h.choice.getCounts(4).max,2);
  const original=Object.keys(h.asi.value.feat)[0];
  const context={}, flow={advancement:h.choice,level:5,pool:[...sources.values()]};
  await alchemistReplacementContext.call(flow,async c => { c.sections=new Map([[4,{items:[]}],[5,{isCurrentLevel:true,items:[]}]]).values(); return c; },context);
  const row=context.sections.flatMap(s=>s.items).find(i=>i.id===original);
  assert.equal(row.previouslyReplaced,false); assert.equal(flow.retained[4][original].id,original);
  await h.choice.apply(5,{replace:original,previousItems:flow.retained});
  assert.equal(h.actor.items.has(original),false); assert.deepEqual(h.choice.getCounts(5),{current:0,max:1,replacement:true,full:false});
  assert.equal(h.choice.value.added[4][original],undefined,'temporary mirror never inflates regular discovery counts');
  await h.choice.apply(5,{selected:[basic[3].uuid]}); assert.equal(h.actor.items.size,3); assert.equal(h.choice.getCounts(5).full,true);
  assert.equal(h.choice.value.replaced[5].original,original);
  assert.equal(h.choice.value.replaced[5].level,4);
  let nativeDrops=0; allowFeats=true;
  await alchemistASIDrop.call(h.flow,()=>nativeDrops++); assert.equal(nativeDrops,0,'native feat drops cannot bypass a dependent later replacement'); allowFeats=false;
  await clearExtraDiscovery(h.flow); assert.equal(h.asi.value.type,'feat','cannot redeem ASI while its discovery was replaced');
  await choose(h,basic[4]??basic[0]); assert.equal(Object.keys(h.asi.value.feat)[0],original);
  await h.choice.reverse(5,{clearReplacement:true,previousItems:flow.retained});
  assert.equal(h.actor.items.size,3); assert.equal(h.actor.items.has(original),true);
  assert.equal(h.actor.items.get(original).flags.dnd5e.advancementOrigin,`alchemist.${h.asi.id}`,'undo keeps the ASI ownership for nested advancements');
  assert.equal(h.choice.getCounts(5).max,0);
  await clearExtraDiscovery(h.flow); assert.equal(h.actor.items.size,2); assert.equal(h.asi.value.type,null);
  await choose(h,basic[2]); const restored=Object.keys(h.asi.value.feat)[0];
  await h.choice.apply(6,{replace:restored,selected:[basic[3].uuid]});
  assert.deepEqual(h.choice.getCounts(6),{current:1,max:2,replacement:true,full:false});
  await h.choice.reverse(6); assert.equal(h.actor.items.has(restored),true,'undo without retained UI documents recreates discovery with original ASI origin');
  assert.equal(h.actor.items.get(restored).flags.dnd5e.advancementOrigin,`alchemist.${h.asi.id}`);
}
{
  const h=harness(); assert.equal(h.asi.allowFeat,true); assert.equal(alchemistAllowFeat.call({item:{},type:'AbilityScoreImprovement'},()=>false),false);
  let nativeDrops=0; const flow={advancement:h.asi};
  const context={showBrowseButton:true}; await alchemistASIContext.call(flow,async c=>c,context); assert.equal(context.showBrowseButton,false);
  await alchemistASIDrop.call(flow,()=>nativeDrops++); assert.equal(nativeDrops,0);
  flow.feat={uuid:'generalFeat'}; await alchemistASIContext.call(flow,async c=>c,context); assert.equal(context.showBrowseButton,true,'existing general feat can be removed');
  allowFeats=true; await alchemistASIDrop.call(flow,()=>nativeDrops++); assert.equal(nativeDrops,1);
  allowFeats=false; dnd5e.settings.rulesVersion='modern'; await alchemistASIDrop.call(flow,()=>nativeDrops++); assert.equal(nativeDrops,2);
  dnd5e.settings.rulesVersion='legacy';
  // Minimal host DOM verifies idempotent controls and native render ordering.
  class Element {
    children=[]; constructor(tag){this.tag=tag;} append(...nodes){ for(const n of nodes){n.parent=this;this.children.push(n);} }
    remove(){this.parent.children=this.parent.children.filter(n=>n!==this);}
    querySelector(selector){const name=selector.slice(1);return this.children.find(n=>n.className?.split(' ').includes(name))??null;}
    addEventListener(type,fn){(this.events??={})[type]=fn;}
  }
  globalThis.document={createElement:tag=>new Element(tag)};
  h.flow.element=new Element('form');
  await alchemistASIRender.call(h.flow,async()=>42); await alchemistASIRender.call(h.flow,async()=>42);
  assert.equal(h.flow.element.children.length,1); assert.equal(h.flow.element.children[0].children[1].type,'button');
}
console.log('Alchemist ASI: all five native levels, exclusive rewards, rollback, prerequisite/duplicate checks, extra discovery replacement and reversal, feat settings and UI controls passed.');
