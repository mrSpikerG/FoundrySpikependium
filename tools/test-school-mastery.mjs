import fs from 'node:fs';import assert from 'node:assert/strict';
import {schoolMasteryDrop,schoolMasteryCreate,schoolMasteryContext,schoolMasteryMaxLevel,schoolMasteryApply,prepareSchoolMastery,schoolMasteryUse,schoolMasteryCachedSpell} from '../scripts/school-mastery.mjs';
import {schoolASICanImprove,schoolASIApply} from '../scripts/arcana-schools.mjs';
import {grantedSpellUsageConfig} from '../scripts/resources.mjs';
import {consumeArcanaMaterial} from '../scripts/arcana-spells.mjs';
import {NativeAlchemistChoice,NativeAlchemistASI,_del} from './data/dnd5e-alchemist-advancement-native.mjs';
import {nativeSchoolSpellChanges,nativeSchoolCreateItemData} from './data/dnd5e-schools-native.mjs';
import {nativeGloveCachedSpellData,nativeGloveSpellChanges} from './data/dnd5e-gloves-native.mjs';
import {nativeStaffCastUse,nativeStaffLinkedActivity,nativeMasteryForwardUse} from './data/dnd5e-griffon-followups-native.mjs';
import {nativeUsageConfig,nativeUsageUpdates,nativeConsumeItemUses,nativeUsesConsumption,nativeRecoverUses,ConsumptionError} from './data/dnd5e-monsters-native.mjs';
import {nativeRefund,getDeltas} from './data/dnd5e-reaction-native.mjs';
const KEY='feat:au-boon-of-school-mastery',clone=structuredClone;
const doc=fs.readdirSync('packs/_source/feats').map(f=>JSON.parse(fs.readFileSync(`packs/_source/feats/${f}`,'utf8'))).find(d=>d.flags?.spikependium?.key===KEY);assert.ok(doc);
assert.equal(doc.name,'Дар освоения школы магии');assert.equal(doc.system.source.book,'AU');assert.equal(doc.system.source.page,'33');assert.equal(doc.system.prerequisites.level,19);assert.equal(doc.system.type.subtype,'epicBoon');assert.equal(doc.system.prerequisites.repeatable,true);assert.ok(doc.folder);
const asi=doc.system.advancement.find(a=>a.type==='AbilityScoreImprovement');assert.equal(asi.configuration.max,30);assert.equal(asi.configuration.points,1);assert.deepEqual(asi.configuration.locked,['str','dex','con']);
const get=(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o);
const flat=(o,p='',out={})=>{for(const[k,v]of Object.entries(o)){const path=p?`${p}.${k}`:k;if(v&&Object.getPrototypeOf(v)===Object.prototype)flat(v,path,out);else out[path]=v;}return out;};
function merge(o,u,{inplace=true}={}){if(!inplace)o=clone(o);for(const[p,v]of Object.entries(u)){const keys=p.split('.'),leaf=keys.pop(),host=keys.reduce((v,k)=>v[k]??={},o);if(v===_del)delete host[leaf];else if(v&&Object.getPrototypeOf(v)===Object.prototype)merge(host[leaf]??={},v);else host[leaf]=v?.next?v:clone(v);}return o;}
class Collection extends Map{[Symbol.iterator](){return this.values();}filter(f){return [...this.values()].filter(f);}some(f){return [...this.values()].some(f);}find(f){return [...this.values()].find(f);}get contents(){return [...this.values()];}}
Set.prototype.first??=function(){return this.values().next().value;};Math.clamp??=(n,min,max)=>Math.max(min,Math.min(max,n));
let serial=0,answer,dialogHook,dialogCount=0,warnings=[],world=new Map();
globalThis._loc=k=>k;globalThis.Item=class{};
globalThis.foundry={utils:{deepClone:clone,getProperty:get,setProperty:(o,p,v)=>{merge(o,{[p]:v});return true;},mergeObject:merge,isEmpty:o=>!o||!Object.keys(o).length,getType:o=>o&&Object.getPrototypeOf(o)===Object.prototype?'Object':Array.isArray(o)?'Array':typeof o,randomID:()=>String(++serial).padStart(16,'0'),escapeHTML:s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;')},applications:{api:{DialogV2:{input:async o=>{dialogCount++;await dialogHook?.(o);return answer;}}}}};
globalThis.fromUuid=async uuid=>world.get(uuid);globalThis.fromUuidSync=(uuid,{relative}={})=>world.get(uuid?.startsWith('Item.')&&relative?`${relative.uuid}.${uuid}`:uuid);
foundry.utils.flattenObject=flat;
globalThis.ui={notifications:{warn:m=>warnings.push(m),error:m=>warnings.push(m)}};
const lists=new Map(['wizard','druid'].map(k=>[`class:${k}`,{name:k,has:s=>s.system.lists?.includes(`class:${k}`)}]));
globalThis.dnd5e={registry:{spellLists:{forType:k=>lists.get(k)}},dataModels:{activity:{ConsumptionError}}};
globalThis.CONFIG={DND5E:{activityActivationTypes:{action:{},bonus:{},reaction:{}},spellcasting:{spell:{slots:true,getSpellSlotKey:n=>`spell${n}`}},spellLevels:Object.fromEntries(Array.from({length:10},(_,i)=>[i,String(i)]))}};
globalThis.game={settings:{get:()=>false},items:{fromCompendium:()=>({_stats:{}})},i18n:{localize:k=>k}};
globalThis.Hooks={call:(_hook,a,c)=>prepareSchoolMastery(a,c),callAll:()=>{}};
class Source{constructor(data){Object.assign(this,clone(data));this.uuid=`Compendium.test.spells.Item.${this._id}`;}clone(u){const d=merge(this.toObject(),u);return{toObject:()=>d};}toObject(){return clone({_id:this._id,name:this.name,type:this.type,flags:this.flags??{},system:this.system,effects:this.effects??[]});}}
for(const[level,id,list,school]of [[1,'one','wizard','evo'],[1,'other','wizard','evo'],[1,'druid1','druid','evo'],[1,'wrongSchool','wizard','nec'],[0,'zero','druid','evo'],[7,'seven','druid','evo'],[8,'eight','wizard','evo']]){
 const s=new Source({_id:id,name:`Заклинание ${id}`,type:'spell',system:{level,school,lists:[`class:${list}`],activation:{type:'action',value:1},properties:['vocal','somatic','material'],materials:{value:'компонент за 50 зм',consumed:true,cost:50,supply:0},uses:{spent:0,recovery:[]},activities:{action:{_id:'action',type:'utility',name:'Сотворить',activation:{type:'action',value:1},consumption:{spellSlot:level>0,targets:[{type:'spikependiumMaterial',value:'1'}]}}}}});world.set(s.uuid,s);
}
const uuid=id=>`Compendium.test.spells.Item.${id}`;
class Owned{
 constructor(d,actor){Object.assign(this,clone(d),{id:d._id,actor,isOwner:true,isEmbedded:true,uuid:`${actor.uuid}.Item.${d._id}`});this.flags??={};this.effects??=[];this.identifier=this.system.identifier;world.set(this.uuid,this);this.buildActivities();}
 buildActivities(){if(this.system.activities instanceof Collection)return;const data=this.system.activities??{};this.system.activities=new Collection();for(const d of Object.values(data))this.system.activities.set(d._id,new Activity(d,this));}
 getFlag(n,k){return this.flags[n]?.[k];}
 updateSource(u){for(const[p,v]of Object.entries(u)){if(p==='system.activities'){this.system.activities=clone(v);this.buildActivities();}else if(p.startsWith('system.activities.')){const id=p.split('.')[2];this.system.activities.set(id,new Activity(v,this));}else merge(this,{[p]:v});}}
 toObject(){return{_id:this.id,name:this.name,type:this.type,img:this.img,flags:clone(this.flags),_stats:clone(this._stats??{}),effects:clone(this.effects),system:{...clone({...this.system,activities:undefined,advancement:undefined}),properties:[...(this.system.properties??[])],activities:Object.fromEntries([...this.system.activities].map(a=>[a.id,a.toObject()])),advancement:(this.system.advancement??[]).map(a=>a instanceof Choice?a.data():clone(a))}};}
 clone(u){const d=merge(this.toObject(),u);d._id=foundry.utils.randomID();return{toObject:()=>d};}
 async use(c,d,m){const a=this.system.activities.find(a=>a.type!=='forward');return a.use(c,d,m);}
}
class Activity{
 static ENCHANTMENT_ID='nativeEnchantId0';
 constructor(d,item){this.data=clone(d);Object.assign(this,{activation:{type:'action',value:1},consumption:{targets:[],spellSlot:false,scaling:{allowed:false}},target:{template:{type:''}},duration:{override:false},range:{override:false},flags:{}},clone(d),{id:d._id,item,actor:item.actor,uuid:`${item.uuid}.Activity.${d._id}`,relativeUUID:`Item.${item.id}.Activity.${d._id}`});this.consumption.scaling??={allowed:false};if(this.type==='cast'){this.spell.challenge??={override:false};this.spell.properties=new Set(this.spell.properties);}
  this.consumption.targets=this.consumption.targets.map(t=>({...t,item,actor:item.actor,activity:this,hasZeroCost:()=>false,resolveCost:async()=>({total:1}),_usesConsumption:nativeUsesConsumption,consume(c,u){return this.type==='itemUses'?nativeConsumeItemUses.call(this,c,u):consumeArcanaMaterial.call(this,c,u);}}));world.set(this.uuid,this);
 }
 toObject(){return clone(this.data);}updateSource(u){merge(this,u);merge(this.data,u);}
 get isSpell(){return this.item.type==='spell';}get requiresSpellSlot(){return this.isSpell&&this.item.system.level>0;}get requiresConcentration(){return false;}get canScale(){return true;}
 getLinkedActivity(uuid){return nativeStaffLinkedActivity.call(this,uuid);}
 _prepareUsageConfig(c){return grantedSpellUsageConfig.call(this,c=>nativeUsageConfig.call(this,c),c);}
 _prepareUsageUpdates(c,o){return nativeUsageUpdates.call(this,c,o);}_mergeActivityUpdates(){}
 getSpellChanges(){return nativeGloveSpellChanges.call(this);}
 getCachedSpellData(){return schoolMasteryCachedSpell.call(this,()=>nativeGloveCachedSpellData.call(this));}
 get cachedSpell(){return this.actor.items.find(i=>i.flags.dnd5e?.cachedFor===this.relativeUUID);}
 async use(c={},d={},m={}){return schoolMasteryUse.call(this,async(c,d,m)=>{if(this.type==='cast')return nativeStaffCastUse.call(this,c,d,m);if(this.type==='forward')return nativeMasteryForwardUse.call(this,c,d,m);const config=this._prepareUsageConfig(c);if(prepareSchoolMastery(this,config)===false)return;return{config,updates:await this._prepareUsageUpdates(config)};},c,d,m);}
}
class Choice extends NativeAlchemistChoice{
 constructor(d,item){super();Object.assign(this,clone(d),{id:d._id,item,actor:item.actor});this.configure();}
 configure(){const c=this.configuration;c.restriction.list=new Set(c.restriction.list);c.restriction.school=new Set(c.restriction.school);c.spell.ability=new Set(c.spell.ability);c.spell.item=this.item;c.spell.applySpellChanges=nativeSchoolSpellChanges;}
 updateSource(u){merge(this,u);this.configure();}data(){return{_id:this.id,type:this.type,configuration:{...this.configuration,spell:undefined},value:clone(this.value)};}toObject(){return{value:clone(this.value)};}
 createItemData(...a){return nativeSchoolCreateItemData.call(this,...a);}apply(l,d,o){return schoolMasteryApply.call(this,(...a)=>super.apply(...a),l,d,o);}
}
function setup(){answer={school:'evo',classSource:'0'};dialogHook=null;warnings=[];const actor={uuid:`Actor.hero${++serial}`,isOwner:true,items:new Collection(),system:{details:{level:19},spells:{spell1:{value:4,max:4},spell7:{value:0,max:0}}},reset(){},updateSource(u){for(const d of u.items??[])this.items.set(d._id,new Owned(d,this));merge(this,Object.fromEntries(Object.entries(u).filter(([k])=>k!=='items')));},async createEmbeddedDocuments(_type,rows){return rows.map(d=>{const i=new Owned(d,this);for(const e of i.effects)for(const ch of e.system?.changes??[]){if(ch.key==='system.properties')i.system.properties=i.system.properties.filter(p=>p!==ch.value.slice(1));else merge(i,{[ch.key]:ch.value});}this.items.set(i.id,i);return i;});}};
 const c=new Owned({_id:'wizard',name:'Волшебник',type:'class',system:{identifier:'wizard',spellcasting:{progression:'full',ability:'int'}}},actor);actor.items.set(c.id,c);return{actor,c,sheet:{inventorySource:actor}};
}
async function prepare(s){return schoolMasteryDrop.call(s.sheet,async(_e,d)=>d,{},doc);}
async function harness(){const s=setup(),data=await prepare(s),feat=new Owned({...data,_id:'boon'},s.actor);s.actor.items.set(feat.id,feat);feat.system.advancement=feat.system.advancement.map(a=>a.type==='ItemChoice'?new Choice(a,feat):a);return{...s,feat,r:feat.system.advancement.find(a=>a.id===feat.flags.spikependium.schoolMasteryChoices.routine),s:feat.system.advancement.find(a=>a.id===feat.flags.spikependium.schoolMasteryChoices.signature)};}
const grant=(h,kind)=>h.actor.items.get(Object.keys(h[kind].value.added[0])[0]);
let h=await harness();assert.deepEqual(h.feat.flags.spikependium.schoolMastery,{caster:h.actor.uuid,school:'evo',class:'wizard',list:'class:wizard',ability:'int'});assert.equal(doc.flags.spikependium.schoolMastery,undefined);
assert.equal(schoolMasteryMaxLevel.call({advancement:h.s},()=>0),7);assert.equal(schoolMasteryMaxLevel.call({advancement:h.r},()=>3),3);
for(const a of [h.r,h.s])await schoolMasteryContext.call({advancement:a},()=>{assert.deepEqual([...a.configuration.restriction.school],['evo']);assert.deepEqual([...a.configuration.spell.ability],['int']);});assert.equal(h.r.configuration.restriction.level,'1');assert.equal(h.s.configuration.restriction.level,'available');assert.equal(h.s.configuration.restriction.list.size,0);
for(const id of ['druid1','zero','seven','wrongSchool','eight'])await assert.rejects(h.r.apply(0,{selected:[uuid(id)]}),/не подходит/);
for(const id of ['wrongSchool','eight'])await assert.rejects(h.s.apply(0,{selected:[uuid(id)]}),/не подходит/);
await assert.rejects(h.r.apply(0,{selected:[uuid('one'),uuid('other')]}),/одно/);await assert.rejects(h.r.apply(1,{selected:[uuid('one')]}),/замен/);await assert.rejects(h.r.apply(0,{ability:'wis'}),/характеристику/);
await h.r.apply(0,{selected:[uuid('one')]});await h.s.apply(0,{selected:[uuid('seven')]});const routine=grant(h,'r'),signature=grant(h,'s');
for(const spell of [routine,signature]){assert.equal(spell.system.prepared,2);assert.equal(spell.system.ability,'int');assert.equal(spell.flags.dnd5e.advancementOrigin.startsWith('boon.'),true);assert.equal(prepareSchoolMastery(spell.system.activities.get('action')),undefined);}
await assert.rejects(h.r.apply(0,{selected:[uuid('other')]}),/одно/);assert.equal(routine.system.uses.max??'','');assert.equal(signature.system.uses.max,'1');assert.deepEqual(signature.system.uses.recovery,[{period:'lr',type:'recoverAll'}]);
const free=h.feat.system.activities.find(a=>a.flags.spikependium?.schoolMasteryRoutine);assert.equal(free.spell.uuid,routine.uuid);assert.equal(free.consumption.scaling.allowed,false);
const cacheData=await free.getCachedSpellData();assert.equal(cacheData._stats.compendiumSource,routine.uuid);assert.deepEqual(cacheData.system.materials,{value:'',consumed:false,cost:0,supply:0});assert.equal(cacheData.system.activities.action.consumption.targets.length,0);assert.deepEqual(cacheData.effects[0].system.changes.filter(c=>c.key==='system.properties').map(c=>c.value),['-vocal','-somatic','-material']);
assert.equal(routine.system.materials.cost,50);assert.equal(routine.system.materials.consumed,true);assert.equal(routine.system.activities.get('action').consumption.targets.length,1);
let result=await free.use({scaling:6});assert.ok(result?.updates,JSON.stringify(warnings));assert.deepEqual(result.updates.actor,{});assert.equal(result.config.consume.spellSlot,false);assert.equal(result.config.scaling,false);assert.equal(result.config.consume.action,true);const cache=free.cachedSpell;assert.equal(cache.system.level,1);assert.equal(cache.system.ability,'int');assert.deepEqual(cache.system.properties,[]);
result=await free.use();assert.ok(result.updates);assert.equal(h.actor.items.filter(i=>i.flags.dnd5e?.cachedFor===free.relativeUUID).length,1);
// Both ordinary provided copies retain components; only the Routine Cast cache waives them.
for(const spell of [routine,signature]){spell.system.properties=new Set(spell.system.properties);const base=spell.system.activities.get('action');assert.equal((await base.use()).updates,false);spell.system.materials.supply=2;}
result=await routine.system.activities.get('action').use();assert.equal(get(result.updates.actor,'system.spells.spell1.value'),3);assert.equal(result.updates.item[0]['system.materials.supply'],1);
// Real native Forward-linked configuration/update bodies must consume the original component and the free-use budget, without a slot.
const forward=signature.system.activities.find(a=>a.type==='forward'),base=signature.system.activities.get('action');signature.system.uses.spent=0;Object.defineProperty(signature.system.uses,'value',{get(){return Number(this.max)-this.spent;}});
result=await forward.use();assert.ok(result?.updates,JSON.stringify(warnings));assert.deepEqual(result.updates.actor,{});assert.equal(result.config.consume.resources,true);assert.equal(result.config.cause.resources,true);assert.equal(result.updates.item.find(i=>i['system.materials.supply']!==undefined)['system.materials.supply'],1);assert.equal(result.updates.item.find(i=>i['system.uses.spent']!==undefined)['system.uses.spent'],1);
const usage=result.updates.item.find(i=>i['system.uses.spent']!==undefined),deltas=getDeltas(signature,usage);merge(signature,{'system.uses.spent':usage['system.uses.spent']});assert.equal((await base.use({consume:{resources:false,spellSlot:false},cause:{activity:forward.relativeUUID}})).updates,false);
await nativeRefund.call({actor:h.actor},{item:{[signature.id]:deltas}},async u=>{for(const row of u.item)merge(signature,Object.fromEntries(Object.entries(row).filter(([k])=>k!=='_id')));});assert.equal(signature.system.uses.spent,0);signature.system.uses.spent=1;
assert.equal(await nativeRecoverUses.call({uses:signature.system.uses},new Map([['sr',1]])),false);const recovery=await nativeRecoverUses.call({uses:signature.system.uses},new Map([['lr',1]]));assert.equal(recovery.updates.spent,0);signature.system.uses.spent=0;signature.system.materials.supply=0;
assert.equal((await base.use({consume:{resources:false,spellSlot:false},cause:{activity:forward.relativeUUID}})).updates,false,'free arcanum cannot skip a consumed component');assert.equal(signature.system.uses.spent,0);
// The shared fix applies to module ItemGrant/ItemChoice grants; ordinary casts, external grants, and resource-free Cast caches keep native settings.
signature.system.materials.supply=2;
for(const key of [KEY,'feat:au-magic-expert','feat:au-warlike-familiar']){h.feat.flags.spikependium.key=key;const c=base._prepareUsageConfig({consume:{resources:false},cause:{activity:forward.relativeUUID}});assert.equal(c.consume.resources,true);}
h.feat.flags.spikependium.key=KEY;let c=base._prepareUsageConfig({});assert.equal(c.consume.spellSlot,true);assert.equal(c.cause,undefined);delete h.feat.flags.spikependium.key;c=base._prepareUsageConfig({consume:{resources:false},cause:{activity:forward.relativeUUID}});assert.equal(c.consume.resources,false);h.feat.flags.spikependium.key=KEY;
const added=h.s.value.added;h.s.value.added={};c=base._prepareUsageConfig({consume:{resources:false},cause:{activity:forward.relativeUUID}});assert.equal(c.consume.resources,false);h.s.value.added=added;
const type=h.s.type;h.s.type='ItemGrant';h.s.value.added=added[0];assert.equal(base._prepareUsageConfig({consume:{resources:false},cause:{activity:forward.relativeUUID}}).consume.resources,true);h.s.type=type;h.s.value.added=added;
const oldSchool=h.feat.flags.spikependium.schoolMastery.school;h.feat.flags.spikependium.schoolMastery.school='nec';assert.equal(prepareSchoolMastery(base),false);h.feat.flags.spikependium.schoolMastery.school=oldSchool;
h.actor.items.delete('wizard');assert.equal(prepareSchoolMastery(base),false);assert.equal(prepareSchoolMastery(free),false);assert.equal(h.actor.items.has(routine.id),true);h.actor.items.set('wizard',h.c);
const oldOrigin=signature.flags.dnd5e.advancementOrigin;signature.flags.dnd5e.advancementOrigin='missing.advancement';assert.equal(prepareSchoolMastery(base),false);signature.flags.dnd5e.advancementOrigin=oldOrigin;
cache._stats.compendiumSource='Actor.foreign.Item.foreign';assert.equal(prepareSchoolMastery(cache.system.activities.get('action')),false);
// A chosen cantrip is still limited by the one-use arcanum; independently learned cantrips remain untouched.
h=await harness();await h.s.apply(0,{selected:[uuid('zero')]});const cantrip=grant(h,'s'),cantripBase=cantrip.system.activities.get('action'),cantripForward=cantrip.system.activities.find(a=>a.type==='forward');assert.ok(cantripForward);assert.equal(cantripBase.consumption.spellSlot,true);assert.equal(cantripBase.requiresSpellSlot,false);assert.equal(prepareSchoolMastery(cantripBase),false);assert.equal(prepareSchoolMastery(cantripBase,{cause:{activity:cantripForward.relativeUUID}}),undefined);assert.equal(prepareSchoolMastery(cantripBase,{cause:{activity:cantripForward.relativeUUID,resources:false}}),false);assert.equal(prepareSchoolMastery(new Activity({_id:'learned',type:'utility'},new Owned({_id:'learned',type:'spell',system:{level:0}},h.actor))),undefined);
// Choice dialogs, repeatability, subclass spell lists, cancellation and ASI/ItemGrant creation entry point.
cantrip.system.properties=new Set(cantrip.system.properties);cantrip.system.materials.supply=1;cantrip.system.uses.spent=0;Object.defineProperty(cantrip.system.uses,'value',{get(){return Number(this.max)-this.spent;}});result=await cantripForward.use();assert.ok(result.updates);assert.deepEqual(result.updates.actor,{});assert.equal(result.updates.item.find(i=>i['system.uses.spent']!==undefined)['system.uses.spent'],1);cantrip.system.uses.spent=1;assert.equal((await cantripForward.use()).updates,false);
let s=setup();dialogHook=o=>{assert.equal((o.content.match(/<option value="(?:evo|ill|nec|abj|enc|trs|con|div)">/g)??[]).length,8);};await prepare(s);
s=setup();answer=undefined;await assert.rejects(prepare(s),/отменён/);assert.equal(s.actor.items.size,1);
s=setup();dialogHook=()=>s.actor.items.delete('wizard');await assert.rejects(prepare(s),/изменились/);
s=setup();s.c.system.spellcasting.ability='str';await assert.rejects(prepare(s),/не найден/);
s=setup();s.c.system.identifier='fighter';s.c.spellcasting={progression:'third',ability:'int'};s.c.subclass={id:'knight',system:{advancement:[{type:'ItemChoice',configuration:{type:'spell',restriction:{level:'available',list:new Set(['class:wizard'])}}}]}};assert.equal((await prepare(s)).flags.spikependium.schoolMastery.list,'class:wizard');
s=setup();const prior=new Owned({...clone(doc),_id:'prior'},s.actor);prior.flags.spikependium.schoolMastery={school:'evo'};s.actor.items.set(prior.id,prior);answer={school:'evo',classSource:'0'};await assert.rejects(prepare(s),/отменён/);answer={school:'nec',classSource:'0'};assert.equal((await prepare(s)).flags.spikependium.schoolMastery.school,'nec');
s=setup();const source=new Source(doc);world.set(source.uuid,source);const host=Object.assign(new NativeAlchemistASI(),{actor:s.actor,item:{id:'parent',getFlag:()=>undefined},id:'asi19',value:{type:null},updateSource:u=>merge(host,u),createItemData(...a){return schoolMasteryCreate.call(this,(...next)=>nativeSchoolCreateItemData.call(this,...next),...a);}});await host.apply(19,{type:'feat',uuid:source.uuid});const given=s.actor.items.get(Object.keys(host.value.feat)[0]);assert.equal(given.flags.spikependium.schoolMastery.ability,'int');assert.equal(given.flags.dnd5e.advancementOrigin,'parent.asi19');const count=dialogCount;assert.equal(await schoolMasteryCreate.call({actor:s.actor},async()=>given),given);assert.equal(dialogCount,count);
for(const ability of ['int','wis','cha']){const actor={system:{abilities:{[ability]:{value:29,max:30}},_source:{abilities:{[ability]:{value:29,max:30}}}},updateSource:u=>merge(actor,u)},host={item:doc,actor,configuration:asi.configuration,value:{},allowFeat:false,canImprove(a){return schoolASICanImprove.call(this,()=>true,a);},updateSource:u=>merge(host,u)};assert.equal(host.canImprove(ability),true);await schoolASIApply.call(host,(...a)=>NativeAlchemistASI.prototype.apply.call(host,...a),0,{assignments:{[ability]:1}},{initial:true});assert.equal(actor.system.abilities[ability].value,30);actor.system._source.abilities[ability].value=30;host.value={};assert.equal(host.canImprove(ability),false);assert.throws(()=>schoolASIApply.call(host,()=>assert.fail(),0,{assignments:{[ability]:1}}),/30/);}
const main=fs.readFileSync('scripts/spikependium.mjs','utf8');for(const symbol of ['schoolMasteryDrop.call','schoolMasteryCreate.call','schoolMasteryApply.call','schoolMasteryContext.call','schoolMasteryMaxLevel.call','schoolMasteryUse.call','schoolMasteryCachedSpell.call','grantedSpellUsageConfig, "WRAPPER"'])assert.ok(main.includes(symbol),symbol);
console.log('Дар освоения школы магии: русский AU33/папка, выбор класса/новой школы/ASI30, native ItemChoice/ASI-grant/фильтры, характеристика класса, рутинный Cast/cache без компонентов и повышения, арканум 0–7/Forward с компонентами/лимитом/LR, ячейки и утраченные связи: OK.');








