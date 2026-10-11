import assert from "node:assert/strict";
import fs from "node:fs";
import { canUseVestigeRestForm, recordVestigeFormConfig, prepareVestigeRestConfig, createVestigeRestForm, finishVestigeForms, resumeVestigeFormRequests, canModifyVestigeForm, placeVestigeRestForm, endDeletedVestigeForm } from "../scripts/vestige-forms.mjs";
import { recordVestigeRest, finishVestigeRecovery, recordVestigeCunning, recordVestigePowerSpent } from "../scripts/vestige-rest.mjs";
import { vestigeTokens, pocketArchives, canSummonVestige, canConsumeVestigeSummon } from "../scripts/pocket.mjs";
import { updateCompanions } from "../scripts/companions.mjs";
import { isVestigePower } from "../scripts/summons.mjs";
import { dropVestigeGear } from "../scripts/vestige.mjs";

const clone = structuredClone, list = a => Object.assign(a, { get(id) { return this.find(d => d.id === id); }, has(id) { return !!this.get(id); } });
const set = (data, path, value) => {
  const keys = path.split("."); for (const key of keys.slice(0, -1)) data = data[key] ??= {};
  if (keys.at(-1).startsWith("-=")) delete data[keys.at(-1).slice(2)]; else data[keys.at(-1)] = value;
};
const merge = (a, b) => {
  for (const [key, value] of Object.entries(b)) {
    if (value && typeof value === "object" && !Array.isArray(value)) merge(a[key] ??= {}, value);
    else a[key] = clone(value);
  }
  return a;
};
const gm = { id: "gm", isGM: true, isActiveGM: true }, player = { id: "player", isGM: false };
let count, fail, owner, item, activity, scene, source, caller, placement, duringPlacement, restores;
globalThis.foundry = { utils: { deepClone: clone, mergeObject: merge, setProperty: set, randomID: () => `event${++count}` } };
globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
const failOnce = stage => { if (fail === stage) { fail = null; throw Error(stage); } };
class TestActor {
  constructor(data) { this.raw = clone(data); this.raw._stats = { createdBy: "gm" }; this.statuses = new Set(); }
  get id() { return this.raw._id; } get uuid() { return `Actor.${this.id}`; } get type() { return this.raw.type; }
  get name() { return this.raw.name; }
  get flags() { return this.raw.flags ??= {}; } get ownership() { return this.raw.ownership; } get isOwner() { return true; }
  get _stats() { return this.raw._stats; } get token() { return this._token; }
  get system() { const s = this.raw.system; s.isCreature = true; s.currency ??= { gp: 0 }; if (s.attributes?.hp) s.attributes.hp.effectiveMax = s.attributes.hp.max; return s; }
  get items() { return list((this.raw.items ?? []).map(i => ({ id: i._id, actor: this, flags: i.flags ?? {},
    system: { ...i.system, activities: new Map(Object.values(i.system.activities ?? {}).map(a => [a._id, { ...a, id: a._id }])) }, toObject: () => clone(i) }))); }
  get effects() { return list((this.raw.effects ?? []).map(e => ({ id: e._id, toObject: () => clone(e) }))); }
  get prototypeToken() { return this.raw.prototypeToken; }
  toObject() { return clone(this.raw); }
  clone() { return new TestActor(this.raw); }
  updateSource(data) { for (const [key, value] of Object.entries(data)) {
    if (key === "items" || key === "effects") {
      const documents = new Map((this.raw[key] ?? []).map(d => [d._id,d]));
      for (const update of value) {
        const doc = documents.get(update._id) ?? {};
        for (const [path, v] of Object.entries(update)) if (path.includes(".")) set(doc,path,clone(v)); else doc[path]=clone(v);
        documents.set(update._id,doc);
      }
      this.raw[key]=[...documents.values()];
    } else if (key.includes(".")) set(this.raw, key, clone(value)); else this.raw[key] = clone(value);
  } }
  testUserPermission(u) { return u.isGM || (this.ownership?.[u.id] ?? this.ownership?.default ?? 0) >= 3; }
  async update(data) { if (Object.hasOwn(data, "ownership")) failOnce("ownership"); this.updateSource(data); }
  async setFlag(scope, key, value) { if (key === "vestigeForm.state" && value === "done") failOnce("done"); if(key==="vestigeForm.created")failOnce("created");set(this.raw, `flags.${scope}.${key}`, value); }
  async unsetFlag(scope, key) { const keys = key.split("."); const parent = keys.length === 1 ? this.flags[scope] : keys.slice(0,-1).reduce((p,k) => p[k],this.flags[scope]); delete parent[keys.at(-1)]; }
  async updateEmbeddedDocuments(type, updates) {
    assert.equal(type, "Item"); for (const update of updates) {
      const data = this.raw.items.find(i => i._id === update._id);
      for (const [key, value] of Object.entries(update)) if (key !== "_id") set(data, key, value);
    }
  }
  async deleteEmbeddedDocuments(type, ids) { assert.equal(type,"Item"); this.raw.items = this.raw.items.filter(i=>!ids.includes(i._id)); }
  async getTokenDocument(point, options = {}) { return token({ ...this.prototypeToken, ...point, actorId: this.id }, this, options.parent ?? scene); }
}
const token = (data, actor, parent) => {
  let override = actor;
  const t = { ...data, id: data._id, uuid: `${parent.uuid}.Token.${data._id}`, parent, flags: data.flags ?? {}, depth: 1, width: 1, height: 1,
    get actor() { const a = override ?? game.actors.get(this.actorId); if (a) a._token = this; return a; },
    getOccupiedGridSpaceOffsets: () => [], getCenterPoint() { return { x: this.x + 50, y: this.y + 50, elevation: this.elevation }; },
    getSize: () => ({ width: 100, height: 100 }), toObject() { return clone({ ...data, actorId: this.actorId, flags: this.flags }); },
    async setFlag(scope, key, value) { set(this.flags, `${scope}.${key}`, value); },
    async unsetFlag(scope, key) { delete this.flags[scope][key]; },
    async update(changed) { failOnce("actorId"); Object.assign(this, changed); },
    delta: { async restore() { failOnce("restore"); restores++; override = undefined; } }
  }; return t;
};
const templates = new Map(fs.readdirSync("packs/_source/creatures").filter(f => f.startsWith("actor-vestige-")).map(f => {
  const data = JSON.parse(fs.readFileSync(`packs/_source/creatures/${f}`)); return [`Compendium.spikependium.creatures.Actor.${data._id}`, new TestActor(data)];
}));
const celestial = [...templates.values()].find(a => a.flags.spikependium.key.endsWith("celestial"));
const fiend = [...templates.values()].find(a => a.flags.spikependium.key.endsWith("fiend"));
const fiendUuid = [...templates].find(([, a]) => a === fiend)[0];
globalThis.Actor = { implementation: { async create(data) { failOnce("create"); const a = new TestActor({ ...data, _id: `made${++count}` }); game.actors.push(a); return a; } } };
globalThis.dnd5e = { utils: { convertLength: (n,units) => units==="m"?n/0.3048:n }, canvas: { TokenPlacement: { async place() { if (duringPlacement) await duringPlacement(); return placement; } } } };
const reset = mode => {
  count = restores = 0; fail = null; duringPlacement = undefined; placement = [{ x: 100, y: 0, elevation: 0, level: "base" }];
  globalThis.game = { user: gm, users: list([gm, player]), actors: list([]), messages: [], combats: [], time: { worldTime: 100 } };
  scene = { id: "scene", uuid: "Scene.scene", tokens: list([]), grid: { units: "ft", distance: 5,
    measurePath: ([a,b]) => ({ distance: Math.hypot((a.x-b.x)/100*scene.grid.distance,(a.y-b.y)/100*scene.grid.distance,(a.elevation??0)-(b.elevation??0)) }) },
    async createEmbeddedDocuments(type, data, options) {
      assert.equal(type,"Token"); assert.equal(options.dnd5e.autoRollNPCHP,"no"); failOnce("token");
      const made = data.map(d => token({ ...d, _id: d._id ?? `new${++count}` }, undefined, scene)); scene.tokens.push(...made); return made;
    },
    async deleteEmbeddedDocuments(type, ids) { assert.equal(type,"Token"); failOnce("delete-token"); scene.tokens=list(scene.tokens.filter(t=>!ids.includes(t.id))); }
  };
  game.scenes = [scene]; globalThis.canvas = { ready: true, scene };
  owner = new TestActor({ _id: "owner", type: "character", flags: { spikependium: { longRest: "rest", vestigeFormWindow: { rest: "rest", time: 100, turn: null } } }, ownership: { player: 3 }, items: [], effects: [],
    system: { abilities: { cha: { mod: 3 } }, attributes: { prof: 4 } } });
  owner.classes = { warlock: { system: { levels: 10 } } };
  item = { id: "vestige", uuid: "Actor.owner.Item.vestige", actor: owner, flags: { spikependium: { key: "subclass:vestige-patron:vestige-companion" } } };
  owner.raw.items.push({ _id: item.id, system: {}, flags: item.flags });
  Object.defineProperty(owner, "items", { get: () => list([item]) });
  game.actors.push(owner);
  const base = new TestActor(celestial.toObject()); base.flags.dnd5e = { summon: { origin: item.uuid } }; game.actors.push(base);
  const old = new TestActor(celestial.toObject()); old.raw.ownership = { player: 3 };
  old.flags.dnd5e = { summon: { origin: item.uuid } }; old.system.attributes.hp.value = 7; old.system.attributes.hp.temp = 2; old.system.currency.gp = 9;
  old.raw.items.find(i => i.system.uses?.max === "1").system.uses.spent = 1;
  old.raw.items.push({ _id: "bag", type: "container", flags: {}, system: { quantity: 1 } },
    { _id: "gear", type: "weapon", flags: {}, system: { quantity: 1, container: "bag" }, effects: [{ _id: "enchantment", origin: `${old.uuid}.Item.custom` }] },
    { _id: "custom", type: "feat", flags: {}, system: { uses: { max: "1", spent: 1 }, activities: {} } });
  old.raw.effects.push({ _id: "external", start: { time: 42 }, system: { origin: { activity: "external" } } });
  source = token({ _id: "source", actorId: base.id, actorLink: false, x: 700, y: 0, elevation: 0, level: "base" }, old, scene);
  caller = token({ _id: "owner", x: 0, y: 0, elevation: 0, level: "base" }, owner, scene); scene.tokens.push(caller);
  if (mode !== "none" && mode !== "pocket") scene.tokens.push(source);
  if (mode === "pocket") {
    const archive = new TestActor({ ...old.toObject(), _id: "archive", ownership: { default: 0 } });
    archive.flags.spikependium.vestigePocket = { origin: item.uuid, source: source.uuid, actor: old.uuid, owner: owner.uuid, state: "pocket", author: "gm", ownership: { player: 3 } };
    game.actors.push(archive);
  }
  activity = { id: "kUEdPFMFUoHcrJ9w", item, actor: owner, type: "summon", profiles: [{ _id: "fiend", uuid: fiendUuid }], getUsageToken: () => caller,
    async getChanges(a) { return { actorUpdates: { effects: [], items: [], "flags.dnd5e.summon": { origin: item.uuid, activity: this.id, profile: "fiend" },
      "system.attributes.hp.max": 44, "system.attributes.hp.value": 44 }, tokenUpdates: {} }; }
  };
  globalThis.fromUuidSync = uuid => uuid === item.uuid ? item : uuid === scene.uuid ? scene : game.actors.find(a => a.uuid === uuid) ?? scene.tokens.find(t => t.uuid === uuid);
  globalThis.fromUuid = async uuid => templates.get(uuid);
};
const message = () => ({ id: "message", uuid: "ChatMessage.message", type: "usage", author: player,
  flags: { spikependium: { vestigeForm: { rest: "rest", profile: "fiend" } } }, getAssociatedActivity: () => activity, getAssociatedToken: () => caller,
  async setFlag(scope,key,value) { set(this.flags,`${scope}.${key}`,value); } });
const log = console.error; console.error = () => {};
reset(); assert.equal(canUseVestigeRestForm(activity), true);
const config = { create: { summons: true }, summons: { profile: "fiend" } }, outgoing = { data: {} };
recordVestigeFormConfig.call(activity, () => {}, config, outgoing, {}); assert.equal(config.create.summons,false); assert.equal(outgoing.data.flags.spikependium.vestigeForm.profile,"fiend");
assert.equal(prepareVestigeRestConfig.call(activity, c => ({ ...c, create: { summons: false } }), {}).create.summons,true);
await createVestigeRestForm(message());
assert.equal(scene.tokens.length,2); assert.equal(scene.tokens.get("source"),source); assert.equal(source.x,700);
assert.equal(source.actor.flags.spikependium.key,"actor:vestige-fiend"); assert.equal(source.actor.system.attributes.hp.value,7); assert.equal(source.actor.system.attributes.hp.temp,2);
assert.equal(source.actor.system.currency.gp,9); assert.equal(source.actor.items.get("gear").system.container,"bag"); assert.equal(source.actor.items.get("gear").toObject().effects[0]._id,"enchantment");
assert.equal(source.actor.items.get("gear").toObject().effects[0].origin,`${source.actor.uuid}.Item.custom`,"внутренние ссылки зачарований переходят на новый лист");
assert(source.actor.items.has("custom")); assert.equal(source.actor.effects.get("external").toObject().start.time,42);
assert.equal(source.actor.items.get("custom").system.uses.spent,1,"смена формы не восстанавливает заряды пользовательской черты");
assert.equal(source.actor.items.find(i=>i.system.uses.max).system.uses.spent,0); assert.deepEqual(source.actor.ownership,{player:3}); assert.equal(restores,1);
await createVestigeRestForm(message()); assert.equal(restores,1); assert.equal(canUseVestigeRestForm(activity),false);
assert.equal(canSummonVestige({ ...activity,id:"ceremony" },{uuid:"wrong-type"}),false);
for (const stage of ["restore","actorId","ownership","done"]) {
  reset(); fail = stage; await createVestigeRestForm(message());
  assert.equal(scene.tokens.length,2); assert(game.actors.some(a=>a.flags.spikependium?.vestigeForm));
  if (stage === "ownership" || stage === "done") source.actor.system.attributes.hp.value = 3;
  await finishVestigeForms();
  assert.equal(source.actor.flags.spikependium.key,"actor:vestige-fiend"); assert.equal(scene.tokens.length,2);
  if (stage === "ownership" || stage === "done") assert.equal(source.actor.system.attributes.hp.value,3,"повтор после смены листа не восстанавливает хиты");
  assert.equal(owner.flags.spikependium.vestigeFormPending,undefined);
}
for (const mode of ["none","pocket"]) {
  reset(mode); await createVestigeRestForm(message()); assert.equal(vestigeTokens(item).length,1); assert.equal(pocketArchives(item).length,0);
  assert.equal(vestigeTokens(item)[0].x,100); await createVestigeRestForm(message()); assert.equal(vestigeTokens(item).length,1);
  assert.equal(vestigeTokens(item)[0].actor.system.attributes.hp.value,mode==="pocket"?7:44);
}
for (const scenario of ["cancel","far","occupied","new-rest"]) {
  reset("pocket"); if(scenario==="cancel")placement=[]; if(scenario==="far")placement[0].x=200; if(scenario==="occupied")placement[0].x=0;
  if(scenario==="new-rest")duringPlacement=()=>{owner.flags.spikependium.longRest="next";};
  await createVestigeRestForm(message()).catch(()=>{}); assert.equal(vestigeTokens(item).length,0); assert.equal(pocketArchives(item).length,1);
}
reset(); owner.classes.warlock.system.levels=3; await createVestigeRestForm(message()); assert.equal(source.actor.items.find(i=>i.system.uses.max).system.uses.spent,1,"смена вида сама не возвращает потраченную силу до 6 уровня");
reset(); await recordVestigePowerSpent(source.actor.items.find(i=>i.system.uses.max),{"system.uses.spent":1}); assert.equal(owner.flags.spikependium.vestigePowerSpent,1);
await recordVestigeRest(owner,{}, {type:"short"}); await finishVestigeRecovery(); assert.equal(source.actor.items.find(i=>i.system.uses.max).system.uses.spent,0); assert.equal(owner.flags.spikependium.vestigePowerSpent,0);
reset("pocket"); await recordVestigeRest(owner,{}, {type:"long"}); await finishVestigeRecovery(); assert.equal(pocketArchives(item)[0].items.find(i=>i.system.uses.max).system.uses.spent,0);
reset(); const cunning={actor:owner,item:{system:{identifier:"magical-cunning"}}}, cunningResult={message:{uuid:"ChatMessage.cunning"}};
await recordVestigeCunning(cunning,{},cunningResult); await finishVestigeRecovery(); assert.equal(source.actor.items.find(i=>i.system.uses.max).system.uses.spent,0);
source.actor.raw.items.find(i=>i.system.uses.max).system.uses.spent=1; await recordVestigeCunning(cunning,{},cunningResult); await finishVestigeRecovery(); assert.equal(source.actor.items.find(i=>i.system.uses.max).system.uses.spent,1);
await recordVestigeCunning(cunning,{},{}); await finishVestigeRecovery(); assert.equal(source.actor.items.find(i=>i.system.uses.max).system.uses.spent,0,"Магическая хитрость работает и без карточки чата");
reset(); owner.classes.warlock.system.levels=5; await recordVestigeRest(owner,{}, {type:"short"}); assert.equal(owner.flags.spikependium.vestigeRecovery,undefined);
reset(); fail="restore"; await createVestigeRestForm(message()); game.user=player; assert.equal(canModifyVestigeForm(source.actor),false); game.user=gm;
reset(); game.time.worldTime++; assert.equal(canUseVestigeRestForm(activity),false,"окно выбора закрывается после продвижения игрового времени");
reset(); game.combat={started:true,id:"combat",round:1,turn:0}; assert.equal(canUseVestigeRestForm(activity),false,"новая форма не переносится с отдыха в другой ход боя");
reset(); source.actorLink=true;
const linked=source.actor; game.actors.splice(game.actors.findIndex(a=>a.id===linked.id),1,linked);
game.combats=[{scene,combatants:[{id:"combatant",tokenId:source.id}],async updateEmbeddedDocuments(type,data){assert.equal(type,"Combatant");assert.equal(data[0].actorId,source.actorId);}}];
await createVestigeRestForm(message());
assert.equal(source.actor.flags.spikependium.key,"actor:vestige-fiend"); assert.deepEqual(linked.ownership,{default:0,player:0}); assert.equal(linked.flags.dnd5e.summon,undefined);
assert.equal(linked.items.get("gear").system.container,"bag","прежний связанный лист остаётся защищённой резервной копией");
reset();
await Promise.all([createVestigeRestForm(message()),createVestigeRestForm({...message(),id:"other",uuid:"ChatMessage.other"})]);
assert.equal(game.actors.filter(a=>a.flags.spikependium?.vestigeForm).length,1,"одновременные карточки не расходуют один отдых дважды");
for (const stage of ["restore","actorId","ownership"]) {
  reset(); fail=stage; await createVestigeRestForm(message()); owner.statuses.add("dead");
  await updateCompanions(owner);
  assert(scene.tokens.get("source"),"общая очистка спутников не удаляет токен посреди замены ActorDelta");
  await finishVestigeForms();
  const loot=game.actors.filter(a=>a.type==="group");
  assert.equal(loot.length,1); assert.equal(loot[0].system.currency.gp,9); assert.equal(loot[0].items.get("gear").system.container,"bag");
  assert.equal(scene.tokens.get("source"),undefined); assert.equal(owner.flags.spikependium.vestigeFormPending,undefined);
  await finishVestigeForms(); assert.equal(game.actors.filter(a=>a.type==="group").length,1,"снаряжение при смерти не дублируется");
}
reset(); fail="actorId"; await createVestigeRestForm(message());
await scene.deleteEmbeddedDocuments("Token",[source.id]); owner.statuses.add("dead");
fail="token"; await finishVestigeForms(); assert.equal(game.actors.filter(a=>a.type==="group").length,1);
await finishVestigeForms();
assert.equal(game.actors.filter(a=>a.type==="group").length,1,"прерывание размещения оставленных вещей использует ту же копию");
assert.equal(scene.tokens.filter(t=>t.actor.type==="group").length,1); assert.equal(owner.flags.spikependium.vestigeFormPending,undefined);
reset(); game.user=player; game.messages.push(message()); await createVestigeRestForm(game.messages[0]);
assert.equal(source.actor.flags.spikependium.key,"actor:vestige-celestial");
game.user=gm; await resumeVestigeFormRequests(); assert.equal(source.actor.flags.spikependium.key,"actor:vestige-fiend");
await resumeVestigeFormRequests(); assert.equal(game.actors.filter(a=>a.flags.spikependium?.vestigeForm).length,1);
reset(); game.messages.push(message()); game.time.worldTime++; await resumeVestigeFormRequests();
assert.equal(source.actor.flags.spikependium.key,"actor:vestige-celestial","позднее подключение Мастера не даёт сменить форму из старого отдыха");

const ceremony = () => {
  activity.id="bG67zHh7Ntnw9qKp";
  const config={create:{summons:true},summons:{profile:"fiend"}},outgoing={data:{}};
  recordVestigeFormConfig.call(activity,()=>{},config,outgoing,{});assert.equal(config.create.summons,false);
  return {...message(),flags:outgoing.data.flags};
};
reset("none");delete owner.flags.spikependium.longRest;owner.flags.spikependium.vestigePowerSpent=1;
const initial=ceremony();await createVestigeRestForm(initial);
assert.equal(vestigeTokens(item).length,1);assert.equal(vestigeTokens(item)[0].actor.system.attributes.hp.value,44);
assert.equal(vestigeTokens(item)[0].id,game.actors.find(a=>a.flags.spikependium?.vestigeForm)?.flags.spikependium.vestigeForm.createdTokenId);
assert.equal(vestigeTokens(item)[0].actor.items.find(isVestigePower)?.system.uses.spent,1,"церемония восстанавливает хиты, но не силу");
assert.equal(owner.flags.spikependium.vestigeRestForm,undefined,"церемония не расходует выбор вида после отдыха");
await createVestigeRestForm(initial);assert.equal(vestigeTokens(item).length,1);
scene.tokens=list(scene.tokens.filter(t=>t.actor.uuid===owner.uuid));await createVestigeRestForm(initial);assert.equal(vestigeTokens(item).length,0,"старая карточка не воскрешает исчезнувшего реликта заново");
const next={...ceremony(),id:"next",uuid:"ChatMessage.next"};await createVestigeRestForm(next);assert.equal(vestigeTokens(item).length,1);
for(const reason of ["cancel","far","occupied","level","height","dead","incapacitated","low-level","unowned","time","turn","rest","recovery","token","type"]){
  reset("none");const request=ceremony();
  if(reason==="cancel")placement=[];if(reason==="far")placement[0].x=200;if(reason==="occupied")placement[0].x=0;
  if(reason==="level")placement[0].level="upper";if(reason==="height")placement[0].elevation=6;
  if(reason==="dead"||reason==="incapacitated")owner.statuses.add(reason);
  if(reason==="low-level")owner.classes.warlock.system.levels=2;if(reason==="unowned")request.author={isGM:false,id:"intruder"};
  if(reason==="time")game.time.worldTime++;if(reason==="turn")game.combat={started:true,id:"combat",round:1,turn:0};
  if(reason==="rest")owner.flags.spikependium.longRest="next";if(reason==="recovery")owner.flags.spikependium.vestigeRecovery={event:"next"};
  if(reason==="token")request.flags.spikependium.vestigeForm.ownerToken="other";if(reason==="type")owner.flags.spikependium.vestigeFormType="other";
  await createVestigeRestForm(request).catch(()=>{});assert.equal(vestigeTokens(item).length,0,reason);
  assert.equal(game.actors.length,2,`${reason}: не создаёт лишние рабочие листы`);
}
reset("none");const delayed=ceremony();game.messages.push(delayed);game.user=player;await createVestigeRestForm(delayed);assert.equal(vestigeTokens(item).length,0);
game.user=gm;await resumeVestigeFormRequests();assert.equal(vestigeTokens(item).length,1);
reset("none");fail="token";const retry=ceremony();await createVestigeRestForm(retry);assert.equal(vestigeTokens(item).length,0);await finishVestigeForms();assert.equal(vestigeTokens(item).length,1);
reset("none");fail="done";const receipt=ceremony();await createVestigeRestForm(receipt);await finishVestigeForms();assert.equal(vestigeTokens(item).length,1,"ошибка квитанции не создаёт второй токен");
for(const stage of ["created","ownership","done"]){
  reset("none");fail=stage;const interrupted=ceremony();await createVestigeRestForm(interrupted);const born=vestigeTokens(item)[0];assert(born);
  scene.tokens=list(scene.tokens.filter(t=>t!==born));await endDeletedVestigeForm(born);await finishVestigeForms();await createVestigeRestForm(interrupted);
  assert.equal(vestigeTokens(item).length,0,`${stage}: удаление после появления не приводит к новому появлению`);assert.equal(owner.flags.spikependium.vestigeFormPending,undefined);
}
reset("none");scene.grid.units="m";scene.grid.distance=1.524;await createVestigeRestForm(ceremony());assert.equal(vestigeTokens(item).length,1,"5 футов на метрической сцене");
reset("none");const sceneLater=ceremony();game.messages.push(sceneLater);canvas.scene={};await createVestigeRestForm(sceneLater);assert.equal(game.actors.length,2);canvas.scene=scene;await resumeVestigeFormRequests();assert.equal(vestigeTokens(item).length,1);
reset("none");const authority=ceremony();duringPlacement=()=>{game.user=player;};await createVestigeRestForm(authority);assert.equal(game.actors.length,2,"потеря полномочий Мастера до размещения не создаёт листы");
reset("none");const concurrent=ceremony();await Promise.all([createVestigeRestForm(concurrent),createVestigeRestForm({...concurrent,id:"other",uuid:"ChatMessage.other"})]);assert.equal(vestigeTokens(item).length,1);
reset("none");const moved=ceremony();duringPlacement=()=>{owner.flags.spikependium.vestigeRecovery={event:"next"};};await createVestigeRestForm(moved);assert.equal(vestigeTokens(item).length,0);
reset("none");ceremony();assert.deepEqual(await placeVestigeRestForm.call(activity,()=>{throw Error("native second summon");},{}),[]);
assert.equal(prepareVestigeRestConfig.call(activity,c=>({...c,create:{summons:false}}),{}).create.summons,true);
const noSummons={data:{}};recordVestigeFormConfig.call(activity,()=>{},{create:false,summons:{profile:"fiend"}},noSummons,{});assert.equal(noSummons.data.flags,undefined);
owner.flags.spikependium.vestigeFormType=fiendUuid;activity.profiles.unshift({_id:"celestial",uuid:celestial.uuid});
const defaultForm=prepareVestigeRestConfig.call(activity,c=>({...c,create:{summons:false},summons:{profile:"celestial"}}),{});assert.equal(defaultForm.summons.profile,"fiend");
assert.equal(canConsumeVestigeSummon(activity,{summons:{profile:"celestial"}}),false,"другой вид блокируется до расхода и создания карточки");
assert.equal(canConsumeVestigeSummon(activity,{summons:{profile:"fiend"}}),true);
reset();source.actor.raw.items=source.actor.raw.items.filter(i=>i.system.quantity==null);source.actor.system.currency={gp:0};
assert.equal(await dropVestigeGear(source),true);assert.equal(owner.flags.spikependium.vestigePowerSpent,1,"перед исчезновением сохраняется сила старого реликта без прежнего зеркала счётчика");
owner.flags.spikependium.vestigeRecovery={state:"pending"};assert.equal(await dropVestigeGear(source),true);assert.equal(owner.flags.spikependium.vestigePowerSpent,0,"незаконченный отдых хозяина не отменяется старым счётчиком спутника");
reset();owner.setFlag=async()=>{throw Error("power snapshot failed");};assert.equal(await dropVestigeGear(source),false,"ошибка сохранения силы останавливает исчезновение");
console.error=log;
console.log("Реликт: смена формы и церемония 5 футов с восстановлением только хитов, сохранение токена/снаряжения/эффектов, ActorDelta и повторы ошибок без дублей, выбор вида/заряды, отдых хозяина и Магическая хитрость: OK.");
