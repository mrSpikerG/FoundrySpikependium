import assert from "node:assert/strict";
import fs from "node:fs";
import { prepareSummon } from "../scripts/summons.mjs";
import { recordArcanaSummonCast, arcanaSummonChatAction, canPlaceArcanaSpirit, prepareArcanaSpirit, sortArcanaSpirits, updateArcanaSpirits,
  recordArcanaSpiritAttack, prepareArcanaSpiritDamage, applyArcanaSpiritHits, recordArcanaSpiritPlaced } from "../scripts/arcana-summons.mjs";
import { applyArcanaCharge } from "../scripts/arcana-summons.mjs";
import { escapeChatButtons, escapeChatAction, canPayArcanaEscape, recordArcanaEscapePayment, finishArcanaEscape, escapePaymentButtons, refundArcanaEscape } from "../scripts/arcana-spirit-actions.mjs";
import { useMonsterMultiattack, prepareMonsterDamage, canUseMonsterWeapon, prepareMonsterAttack } from "../scripts/monster-actions.mjs";
import { canUseBugbearGrab } from "../scripts/bugbear-grab.mjs";
import { nativeSummonChanges, nativeBaseDamagePart, nativeSortCombatants } from "./data/dnd5e-summon-native.mjs";
import { constructParts, getAttackData, isExpiryEvent } from "./data/dnd5e-making-native.mjs";
import { nativeAppliedEffectChanges } from "./data/dnd5e-arcana-native.mjs";
import { prepareEffectData } from "./data/dnd5e-effect-application.mjs";
import { attackSignature } from "../scripts/attack-source.mjs";
import { nativeSkillConfig, nativeSkillProficiency, nativeAbilityProficiency, setSkillModificationField } from "./data/dnd5e-spirit-actions-native.mjs";
import { nativeUsageUpdates, nativeSaveForceSuccess } from "./data/dnd5e-monsters-native.mjs";
import { nativePerformBulkUpdate } from "./data/dnd5e-arcana-native.mjs";
import { abolethMemoryTarget, canUseMonsterActivity, recordMonsterEffect, syncMonsterEffects, monsterDrainHealing, endDeadAbolethCharms } from "../scripts/monster-effects.mjs";
import { recordAbolethCalculation, recordAbolethDamage, abolethApplyDamage, syncAbolethRepeat, resumeAbolethDomination } from "../scripts/aboleth-domination.mjs";
import { nativeApplyDamage, nativeCalculateDamage } from "./data/dnd5e-guardian-native.mjs";
import { abolethWaterButtons, abolethWaterAction, restrictAbolethHealing, guardAbolethHPUpdate, hasAbolethCurse } from "../scripts/aboleth-water.mjs";
import { recordAbolethCurseDamage, resumeAbolethCurse } from "../scripts/aboleth-curse.mjs";
import { mucusTargets, abolethEndTurn, resumeMucusCloud } from "../scripts/aboleth-cloud.mjs";
import { releaseSoulTomePrisons } from "../scripts/soul-tome.mjs";
import { recordSoulClawAttack, syncSoulClawAttack, resumeSoulClawAttacks, automaticSoulClawTargets } from "../scripts/soul-claw.mjs";
import { soulPrisonButtons, soulPrisonAction, soulPrisonEndTurn, syncSoulPrisonRepeat, resumeSoulPrisonRepeats, releaseSoulPrison, returnSoulPrisonToken, nearestSoulPrisonSpace } from "../scripts/soul-prison.mjs";
import { chooseDefensiveCharm, defensiveCharmUse, prepareDefenseUpdates, recordDefenseConsumption, recordDefenseUsage,
  defensiveCharmOutcome, defensiveCharmWaiting, defensiveCharmEnabled, defensiveCharmDamage } from "../scripts/performer-defense.mjs";
import { prepareReactionUpdates, recordReaction, recordReactionConsumption, reactionAvailable } from "../scripts/reactions.mjs";
import { nativeRefund } from "./data/dnd5e-reaction-native.mjs";
import { attackHitTargets } from "../scripts/companions.mjs";
import { guardianEvaluatedTargets, captureAttackDamage } from "../scripts/attack-source.mjs";
import { nativeEvaluatedTargets } from "./data/dnd5e-guardian-native.mjs";

const read = pack => fs.readdirSync(`packs/_source/${pack}`).filter(f => f.endsWith(".json"))
  .map(f => JSON.parse(fs.readFileSync(`packs/_source/${pack}/${f}`, "utf8")));
const actors = read("creatures").filter(d => /^actor:au-(plant|dinosaur)-/.test(d.flags?.spikependium?.key ?? ""));
const spells = read("spells").filter(d => /^spell:au-summon-/.test(d.flags?.spikependium?.key ?? ""));
assert.equal(actors.length, 6); assert.equal(spells.length, 2);
const get = (o, path) => path.split(".").reduce((v, k) => v?.[k], o);
const set = (o, path, value) => { const keys = path.split("."); for (const k of keys.slice(0, -1)) o = o[k] ??= {}; o[keys.at(-1)] = value; };
const merge = (a, b) => { for (const [k, v] of Object.entries(b)) {
  if (v && Object.getPrototypeOf(v) === Object.prototype) merge(a[k] ??= {}, v); else a[k] = v;
} return a; };
const list = a => Object.defineProperty(Object.assign(a, { get(id) { return this.find(v => v.id === id); }, has(id) { return !!this.get(id); },
  getByType(type) { return this.filter(v => v.type === type); } }), "size", { get() { return this.length; } });
Set.prototype.first ??= function() { return this.values().next().value; };
let world = new Map(), serial = 0, failBatch = false;
globalThis.fromUuidSync = uuid => world.get(uuid);
globalThis.foundry = { utils: { getProperty: get, setProperty: set, mergeObject: merge, deepClone: structuredClone,
  isEmpty: o => !o || !Object.keys(o).length, escapeHTML: value => value, randomID: () => `event${String(serial++).padStart(11,"0")}` }, data: { fields: { BooleanField: class {} } }, applications: { api: { DialogV2: {} } } };
globalThis.ui = { notifications: { warn() {} } };
const replace = (formula, data) => String(formula).replace(/@([\w.]+)/g, (_, path) => String(get(data, path) ?? 0));
const evaluate = (formula, data = {}) => { const text = replace(formula, data); assert.match(text, /^[\d\s.+*/()-]+$/); return Function(`return (${text})`)(); };
globalThis.Roll = class { constructor(formula, data) { this.formula = formula; this.data = data; } async evaluate() { this.total = evaluate(this.formula, this.data); return this; } };
class D20 { constructor(total = 20, options = {}) { this.total = total; this.options = options; this._evaluated = true; this.isCritical = false; } toJSON() { return { total: this.total, options: this.options }; } }
class Damage { constructor(options = {}) { this.options = options; this._evaluated = true; } }
class Dialog { constructor(config) { this.config = config; } async _prepareConfigurationContext(c) { return c; } _buildConfig(r) { return r; } }
globalThis.CONFIG = { DND5E: { actorSizes: { lg: { token: 2 }, huge: { token: 3 } } }, Dice: { D20Roll: D20, BasicRoll: { constructParts, replaceFormulaData: replace }, DamageRoll: { DefaultConfigurationDialog: Dialog } } };
CONFIG.Dice.D20Roll.constructParts = constructParts; CONFIG.Dice.D20Roll.mergeOptions = merge;
globalThis.ChatMessage = { getSpeaker: ({ actor, token, scene }) => ({ actor: actor.id, token: token?.id, scene: scene?.id }) };
globalThis.game = { user: { id: "gm", isGM: true, isActiveGM: true }, users: { activeGM: {} }, i18n: { lang: "ru" }, time: { worldTime: 0 }, actors: [], scenes: [], combats: [], messages: [] };
class Effect {
  constructor(data, actor) { this.data = structuredClone(data); this.id = data._id ?? `effect${serial++}`; this.flags = this.data.flags ??= {}; this.system = this.data.system ??= {};
    this.duration = this.data.duration ??= {}; this.start = this.data.start; this.name = data.name; this._stats = this.data._stats ??= {}; this.statuses = new Set(data.statuses ?? []);
    if (data.changes) this.system.changes = data.changes; this.actor = actor; this.active = true; this.uuid = `${actor?.uuid ?? ""}.ActiveEffect.${this.id}`; }
  toObject() { return { ...structuredClone(this.data), _id: this.id, statuses: [...this.statuses] }; }
  static getEffectStart() { return { time: game.time.worldTime, combat: null, round: null, turn: null }; }
  static expirySupportsDuration() { return true; }
  static forApplication(changes) { return changes; }
  async delete() { this.actor.effects.splice(this.actor.effects.indexOf(this), 1); world.delete(this.uuid); }
  async setFlag(module, key, value) { set(this.flags, `${module}.${key}`, value); }
  async update(changed) { for (const [path, value] of Object.entries(changed)) set(this.data, path, value);
    this.flags = this.data.flags; this.system = this.data.system; this.duration = this.data.duration; this.name = this.data.name; }
}
globalThis.ActiveEffect = Object.assign(Effect, { implementation: Effect });
globalThis.Item = class {};
globalThis.dnd5e = { utils: { convertLength: n => n }, applications: { components: { EffectApplicationElement: class {
  async _prepareEffectData(effect, actor) { return prepareEffectData.call(this, effect, actor, key => key); }
} } } };
foundry.documents = { async modifyBatch(operations) {
  if (failBatch) throw Error("batch rejected");
  for (const op of operations) {
    if (op.documentName === "ChatMessage") for (const data of op.updates) { const m = world.get(`ChatMessage.${data._id}`); for (const [k,v] of Object.entries(data)) if (k !== "_id") set(m, k, v); }
    else if (op.documentName === "Actor") for (const data of op.updates) await world.get(`Actor.${data._id}`).update(data);
    else if (op.documentName === "ActorDelta") for (const data of op.updates) { assert.equal(data._id, op.parent.delta.id); await op.parent.actor.update(data); }
    else if (op.action === "delete") for (const id of op.ids) await op.parent.effects.get(id).delete();
    else if (op.action === "create") for (const data of op.data) { const e = new Effect(data, op.parent); op.parent.effects.push(e); world.set(e.uuid, e); }
    else for (const data of op.updates) { const e = op.parent.effects.get(data._id); for (const [k, v] of Object.entries(data)) if (k !== "_id") {
      if (k.includes(".")) set(e.data, k, v); else merge(e.data, { [k]: v });
    } }
  }
} };
function actorDoc(data) {
  const actor = { ...structuredClone(data), id: data._id, uuid: `Actor.${data._id}`, isOwner: true, classes: {}, _source: data,
    statuses: new Set(), effects: list([]), testUserPermission: () => true, getRollData: () => ({}), changeIsIgnored: () => false,
    performBulkUpdate: nativePerformBulkUpdate, async update(data) { for(const[k,v]of Object.entries(data))if(k!=="_id")set(this,k,v); } };
  actor.system.isNPC = true; actor.system.isCreature = true; actor.system.attributes.ac.calc = "natural"; actor.system.traits.ci.value = new Set(actor.system.traits.ci.value);
  actor.items = list(data.items.map(it => {
    const item = { ...structuredClone(it), id: it._id, uuid: `${actor.uuid}.Item.${it._id}`, actor, getFlag: () => null };
    item.system.hasAttack = Object.values(it.system.activities).some(a => a.type === "attack"); item.hasAttack = item.system.hasAttack;
    item.system.activities = list(Object.values(it.system.activities).map(a => ({ flags: {}, ...structuredClone(a), id: a._id, uuid: `${item.uuid}.Activity.${a._id}`, item, actor,
      toObject: () => structuredClone(a), applicableEffects: [], getAppliedEffectChanges: nativeAppliedEffectChanges,
      duration: { getEffectData: () => ({}) } })));
    item.effects = list(it.effects.map(e => { const result = new Effect(e); result.uuid = `${item.uuid}.ActiveEffect.${e._id}`; return result; }));
    return item;
  }));
  return actor;
}

for (const spell of spells) {
  const baseLevel = spell.system.level, activity = Object.values(spell.system.activities)[0];
  assert.equal(spell.system.source.book, "AU"); assert.equal(spell.system.source.page, "38"); assert.equal(spell.system.range.value, "90");
  assert.equal(spell.system.duration.units, "hour"); assert.equal(spell.system.duration.value, "1"); assert.equal(spell.system.materials.cost, baseLevel * 100);
  assert.equal(spell.system.materials.consumed, false); assert.ok(spell.system.properties.includes("concentration")); assert.equal(activity.profiles.length, 3);
  for (const profile of activity.profiles) {
    const original = actors.find(a => profile.uuid.endsWith(`.${a._id}`)); assert.ok(original);
    assert.equal(original.system.details.cr, null); assert.equal(original.prototypeToken.actorLink, false);
    assert.equal(original.system.attributes.movement.speeds.walk, "40");
    for (const it of original.items) assert.deepEqual(it.system.source, original.system.source);
    for (let level = baseLevel; level <= 9; level++) {
      const actor = actorDoc(original), caster = { classes: {}, system: { attributes: { prof: 3 }, abilities: { int: { mod: 2 } } }, prototypeToken: { disposition: 1 } };
      const host = { ...activity, actor: caster, item: { uuid: "Actor.caster.Item.summon", system: { level } }, relevantLevel: level, ability: "wis", match: activity.match,
        creatureSizes: new Set(activity.creatureSizes), creatureTypes: new Set(activity.creatureTypes), getApplicableEffects: async () => [],
        getRollData: () => ({ item: { level }, mod: 4, attributes: { prof: 3, spell: { dc: 15 } }, abilities: { wis: { mod: 4, dc: 15 } }, rolls: {} }) };
      const config = { actor, ...await nativeSummonChanges.call(host, actor, profile, {}) }; prepareSummon(host, profile, config);
      const updates = config.actorUpdates;
      assert.equal(updates["flags.dnd5e.summon"].level, level);
      assert.equal(updates["system.attributes.hp.max"] ?? original.system.attributes.hp.max, original.system.attributes.hp.max + 10 * (level - baseLevel));
      assert.equal(updates.effects.find(e => e._id === "dnd5eACBonus").system.changes[0].value, level);
      assert.equal(updates.effects.find(e => e.system.changes[0].key === "system.attributes.prof").system.changes[0].value, 3);
      if (baseLevel === 6) {
        assert.equal(updates["system.abilities.str.save.roll.bonus"], String(Math.floor(level / 2)));
        assert.equal(updates["system.abilities.con.save.roll.bonus"], String(Math.floor(level / 2)));
        assert.equal(updates["system.abilities.dex.save.roll.bonus"], undefined);
      }
      for (const update of updates.items) {
        const item = actor.items.get(update._id), changes = update.effects[0].system.changes;
        for (const a of item.system.activities.filter(a => a.type === "attack")) {
          const attack = { ...a.attack, flat: true, bonus: changes.find(c => c.key === "activities[attack].attack.bonus").value };
          const actual = getAttackData.call({ attack, getRollData: () => ({ mod: 99 }) });
          assert.equal(evaluate(actual.parts.join("+"), actual.data), 7, "native flat caster attack excludes creature ability modifier");
          item.system.damage = { bonus: changes.find(c => c.key === "system.damage.bonus").value };
          const part = a.damage.parts[0], damage = { types: new Set(part.types), scaledFormula: () => `${part.number}d${part.denomination}${part.bonus ? "+"+part.bonus : ""}` };
          const result = nativeBaseDamagePart.call({ item, actor, id: a.id, getActionType: () => "msak" }, damage, {}, {}, 0);
          assert.equal(result.parts.at(-1), String(level)); assert.equal(result.parts.filter(p => p === "@mod").length, 0);
        }
      }
    }
  }
}
assert.deepEqual(actors.find(a=>a.flags.spikependium.key.endsWith("plant-tree")).system.traits.dv.value, ["fire"]);
assert.deepEqual(actors.find(a=>a.flags.spikependium.key.endsWith("plant-fungus")).system.traits.dv.value, ["slashing"]);

function fixture(kind = "plant", variant = "fungus") {
  world = new Map(); game.actors = []; game.combats = []; game.scenes = []; game.messages = []; game.time.worldTime = 0; failBatch = false;
  const spell = spells.find(s => s.flags.spikependium.key.endsWith(kind)), source = actorDoc(actors.find(a => a.flags.spikependium.key.endsWith(`${kind}-${variant}`)));
  const caster = { id: "caster", uuid: "Actor.caster", isOwner: true, flags: {}, effects: list([]), statuses: new Set(), testUserPermission: () => true };
  const activity = { type: "summon", uuid: "Actor.caster.Item.spell.Activity.summon", actor: caster,
    item: { uuid: "Actor.caster.Item.spell", flags: spell.flags, system: { level: spell.system.level } }, getRollData: () => ({ attributes: { spell: { dc: 15 } } }) };
  const concentration = { id: "concentration", uuid: "Actor.caster.ActiveEffect.concentration", active: true, isOwner: true, flags: { dnd5e: { activity: { uuid: activity.uuid } } }, async setFlag(module,key,value){set(this.flags,`${module}.${key}`,value);} };
  caster.effects.push(concentration); world.set(concentration.uuid, concentration);
  const message = { data: { speaker: { scene: "scene", token: "caster" }, system: { concentration: concentration.id } } }; recordArcanaSummonCast(activity, message);
  const scene = { id: "scene", tokens: list([]), grid: { units: "ft", measurePath: ([a,b]) => ({ distance: Math.abs(a.x-b.x) }) },
    async deleteEmbeddedDocuments(type, ids) { for (const token of [...this.tokens]) if (ids.includes(token.id)) { this.tokens.splice(this.tokens.indexOf(token),1); world.delete(token.uuid); } } };
  const token = (id, actor, x = 0) => { const t = { id, uuid: `Scene.scene.Token.${id}`, actor, parent: scene, flags: {}, getOccupiedGridSpaceOffsets: () => [], getCenterPoint: () => ({ x, y:0 }) };
    scene.tokens.push(t); world.set(t.uuid,t); return t; };
  const casterToken = token("caster",caster), spirit = token("spirit",source); source.flags.dnd5e = { summon: { origin: activity.item.uuid, level: spell.system.level } };
  const config = { tokenUpdates: {} }; assert.equal(canPlaceArcanaSpirit(activity), true); prepareArcanaSpirit(activity, {}, config);
  for (const [k,v] of Object.entries(config.tokenUpdates)) set(spirit,k,v);
  const target = actorDoc(actors[0]); target.id = "target"; target.uuid = "Actor.target"; target.items = []; target.effects = list([]); target.system.traits.size = "med";
  const recipient = token("target", target, 5);
  game.actors.push(caster,source,target); game.scenes.push(scene); world.set(target.uuid,target);
  return { activity, source, caster, concentration, message, scene, spirit, casterToken, target, recipient };
}
{
  const f = fixture(); assert.equal(canPlaceArcanaSpirit(f.activity), false);
  f.scene.tokens.splice(f.scene.tokens.indexOf(f.spirit),1); f.concentration.active = false; assert.equal(canPlaceArcanaSpirit(f.activity), false);
  f.concentration.active = true;
  await arcanaSummonChatAction.call(f.activity, async () => { assert.equal(canPlaceArcanaSpirit(f.activity), false); }, {}, { dataset: { action: "placeSummons" } }, { flags: { spikependium: { arcanaSummon: { ...f.message.data.flags.spikependium.arcanaSummon, concentration: "old" } } } });
  assert.equal(canPlaceArcanaSpirit(f.activity), true, "chat receipt is restored after use");
}
for (const ending of ["zero", "concentration", "time"]) {
  const f = fixture(); if (ending === "zero") f.source.system.attributes.hp.value = 0;
  if (ending === "concentration") f.concentration.active = false; if (ending === "time") game.time.worldTime = 3600;
  await updateArcanaSpirits(); assert.equal(f.scene.tokens.has("spirit"), false, ending);
  assert.equal(canPlaceArcanaSpirit(f.activity),false,"a dead spirit cannot be summoned again from the same cast");
}
{
  const f=fixture();await recordArcanaSpiritPlaced(f.activity,{},[f.spirit]);f.scene.tokens.splice(f.scene.tokens.indexOf(f.spirit),1);
  assert.equal(canPlaceArcanaSpirit(f.activity),false,"placement receipt survives token removal");
}
{
  const f = fixture(); const combat = { id: "combat", scene: f.scene, combatants: list([]), baseSort: (a,b) => b.initiative-a.initiative,
    async createEmbeddedDocuments(type,data) { for (const d of data) {
      const c = { ...d, id: "spiritCombatant", uuid: "Combat.combat.Combatant.spirit", parent: this, actor:f.source, token:f.spirit,
        async update(data) { for(const[k,v]of Object.entries(data))set(this,k,v); } }; this.combatants.push(c); world.set(c.uuid,c);
    } } };
  const caster = { id: "casterCombatant", uuid: "Combat.combat.Combatant.caster", actor:f.caster, token:f.casterToken, initiative:15, parent:combat, flags:{}, name:"Caster" };
  f.casterToken.baseActor={name:"Z caster",id:"caster"}; f.spirit.baseActor={name:"A spirit",id:"spirit"}; world.set(caster.uuid,caster);
  combat.combatants.push(caster); game.combats.push(combat); await updateArcanaSpirits(); assert.equal(combat.combatants.length,2);
  const spirit=combat.combatants[1]; assert.equal(spirit.initiative,15);
  assert.equal(sortArcanaSpirits.call(combat,(a,b)=>nativeSortCombatants.call(combat,a,b),caster,spirit),-1);
  const other={id:"other",initiative:15,flags:{},token:{baseActor:{name:"M other",id:"other"}},name:"Other"};
  const sorted=[spirit,other,caster].sort((a,b)=>sortArcanaSpirits.call(combat,(a,b)=>nativeSortCombatants.call(combat,a,b),a,b));
  assert.deepEqual(sorted.map(c=>c.id),["other","casterCombatant","spiritCombatant"]);
  caster.initiative=18; await updateArcanaSpirits(); assert.equal(spirit.initiative,18); assert.equal(combat.combatants.length,2);
}

function hit(f, identifier) {
  const item = f.source.items.find(i=>i.system.identifier===identifier), activity=item.system.activities.find(a=>a.type==="attack");
  const origin={uuid:"ChatMessage.usage",system:{},getAssociatedActor:()=>f.source,getAssociatedActivity:()=>activity,getAssociatedItem:()=>item};
  const message={id:`hit${serial++}`,type:"attack",flags:{},author:game.user,rolls:[new D20()],
    system:{targets:[{actor:f.target.uuid,token:f.recipient.uuid,ac:10}]},getAssociatedActivity:()=>activity,getAssociatedToken:()=>f.spirit,getOriginatingMessage:()=>origin,
    updateSource(data){for(const[k,v]of Object.entries(data))set(this,k,v);} };
  message.uuid=`ChatMessage.${message.id}`;world.set(message.uuid,message);recordArcanaSpiritAttack(message);return {message,activity};
}
{
  const f=fixture(), {message,activity}=hit(f,"au-spores"); assert.deepEqual(Object.keys(message.flags.spikependium.arcanaSpiritAttack.poisoned),[f.target.uuid]);
  await applyArcanaSpiritHits(message); assert.equal(f.target.effects.length,1); f.target.statuses.add("poisoned");
  assert.ok(f.target.effects[0].statuses.has("poisoned")); await f.target.effects[0].delete(); await applyArcanaSpiritHits(message); assert.equal(f.target.effects.length,0);
  const config={subject:activity,rolls:[{parts:["1d4"],data:{}}]}, data={data:{system:{targets:message.system.targets},flags:{spikependium:{attackSource:{message:message.uuid,signature:attackSignature(message)}}}}};
  prepareArcanaSpiritDamage(config,{},data); assert.deepEqual(config.rolls[0].parts,["1d4"]);
  f.target.statuses.add("poisoned"); const next=hit(f,"au-spores"); await applyArcanaSpiritHits(next.message); assert.equal(f.target.effects.length,0);
  data.data.flags.spikependium.attackSource={message:next.message.uuid,signature:attackSignature(next.message)};
  prepareArcanaSpiritDamage(config,{},data); prepareArcanaSpiritDamage(config,{},data);
  assert.equal(config.rolls[0].parts.filter(p=>p==="@spikependiumSpores").length,1); assert.equal(config.rolls[0].data.spikependiumSpores,"3d4");
}
for(const size of ["lg","huge"]){const f=fixture("dinosaur","tyrannosaurus");f.target.system.traits.size=size;const{message}=hit(f,"au-dinosaur-bite");
  await applyArcanaSpiritHits(message);assert.equal(f.target.effects.length,size==="lg"?1:0);
  if(size==="lg"){assert.deepEqual([...f.target.effects[0].statuses],["grappled","restrained"]);f.source.statuses.add("stunned");await updateArcanaSpirits();assert.equal(f.target.effects.length,0);}}
{
  const f=fixture("dinosaur","triceratops"), {message,activity}=hit(f,"au-dinosaur-gore");message.flags.spikependium.monsterDive={targets:[f.recipient.uuid]};
  await applyArcanaSpiritHits(message);assert.ok(f.target.effects[0].statuses.has("prone"));
  const config={subject:activity,rolls:[{parts:["1d10+5"],data:{}}],spikependium:{dive:true}},dialog={};prepareMonsterDamage(config,dialog,{});
  assert.equal(config.rolls[0].data.spikependiumDive,"1d10","feature damage has no weapon base part");
  f.target.system.traits.size="grg";const blocked={subject:activity,rolls:[{parts:["1d10+5"],data:{}}],spikependium:{dive:true}};
  prepareMonsterDamage(blocked,{}, {data:{system:{targets:message.system.targets}}});assert.equal(blocked.rolls[0].data.spikependiumDive,undefined);
}
for(const immunity of ["grappled","restrained"]){const f=fixture("dinosaur","tyrannosaurus");f.target.system.traits.ci.value.add(immunity);const{message}=hit(f,"au-dinosaur-bite");
  await applyArcanaSpiritHits(message);assert.equal(f.target.effects.length,immunity==="grappled"?0:1);
  if(immunity==="restrained")assert.deepEqual([...f.target.effects[0].statuses],["grappled"]);}
for(const ending of ["move","delete","otherScene"]){const f=fixture("dinosaur","tyrannosaurus"),{message}=hit(f,"au-dinosaur-bite");await applyArcanaSpiritHits(message);
  if(ending==="move")f.recipient.getCenterPoint=()=>({x:20,y:0});if(ending==="delete")world.delete(f.recipient.uuid);if(ending==="otherScene")f.recipient.parent={id:"other"};
  await updateArcanaSpirits();assert.equal(f.target.effects.length,0,ending);}
{
  const f=fixture(),{message}=hit(f,"au-spores");f.target.system.traits.ci.value.add("poisoned");await applyArcanaSpiritHits(message);assert.equal(f.target.effects.length,0);
}
{
  const f=fixture(), {message}=hit(f,"au-spores");failBatch=true;await assert.rejects(()=>applyArcanaSpiritHits(message));assert.equal(f.target.effects.length,0);
  failBatch=false;await applyArcanaSpiritHits(message);assert.equal(f.target.effects.length,1);
}
{
  const f=fixture("dinosaur","tyrannosaurus"), activity=f.source.items[0].system.activities[0];let attacks=0;
  for(const item of f.source.items)for(const a of item.system.activities)if(a.type==="attack"){
    a.use=async()=>({message:{id:"use",getAssociatedRolls:()=>[]}});a.rollAttack=async()=>{attacks++;return[new D20()];};}
  foundry.applications.api.DialogV2.wait=async()=>f.source.items.find(i=>i.system.identifier==="au-dinosaur-bite").system.activities[0].id;
  const results={message:{author:game.user,flags:{},async setFlag(module,key,value){set(this.flags,`${module}.${key}`,value);}}};
  f.source.flags.dnd5e.summon.level=9;await useMonsterMultiattack(activity,{},results);assert.equal(attacks,4);
  await useMonsterMultiattack(activity,{},results);assert.equal(attacks,4);assert.equal(results.message.flags.spikependium.multiattack.state,"complete");
}
function escapeFixture({ skill = "ath", total = 20, cancel = false, monster = false } = {}) {
  const state = { skill, total, cancel, checks: 0, payments: 0 }, f = fixture("dinosaur", "tyrannosaurus");
  if (monster) {
    const file = fs.readdirSync("packs/_source/creatures").find(f => f.startsWith(monster === "aboleth" ? "actor-mm25-aboleth_" : "actor-mm25-ankheg_"));
    const original = f.source;
    f.source = actorDoc(JSON.parse(fs.readFileSync(`packs/_source/creatures/${file}`, "utf8")));
    f.spirit.actor = f.source; delete f.spirit.flags.spikependium.arcanaSummon;
    game.actors.splice(game.actors.indexOf(original), 1, f.source);
  }
  const pending = hit(f, monster === "aboleth" ? "aboleth-tentacle" : monster ? "ankheg-bite" : "au-dinosaur-bite");
  world.set(pending.activity.uuid, pending.activity);
  CONFIG.DND5E.activityActivationTypes = { action: { consume: { property: "attributes.actions" } } };
  CONFIG.Dice.D20Roll.mergeOptions = (a,b) => merge(a,b);
  dnd5e.settings = { rulesVersion: "modern" };
  dnd5e.dataModels = { actor: { CommonTemplate: { calculateSkillToolProficiency: nativeSkillProficiency } } };
  setSkillModificationField({ combineFields(model,paths) { assert.ok(paths[0].startsWith("abilities.")); return { bonus: "1" }; } });
  f.target.system.attributes.actions = { max:1, spent:0, get value(){return this.max-this.spent;} };
  f.target.system.attributes.prof = 3;
  f.target.system.abilities.str.mod = 2; f.target.system.abilities.dex.mod = 4;
  f.target.system.skills = { ath: { effectValue:2 }, acr: { effectValue:0 } };
  f.target.system.parent = f.target; f.target.system.calculateAbilityCheckProficiency = nativeAbilityProficiency;
  f.target._isRemarkableAthlete = () => false; f.target.addConditionRollReduction = () => {};
  f.target.getRollData = () => ({ roll:{} });
  globalThis.canvas = { tokens: { controlled: [f.recipient] } };
  foundry.applications.api.DialogV2.wait = async () => state.skill;
  f.target.rollSkill = async (config,dialog,message) => {
    state.skillMessage = message;
    state.checks++; assert.equal(config.skill,state.skill); assert.equal(config.target,monster === "aboleth" ? 14 : monster ? 13 : 15); assert.equal(dialog.options.chooseAbility,false);
    const native={}; nativeSkillConfig.call(f.target,"skill",null,config,native,null,0);
    assert.equal(evaluate(native.parts.join("+"),native.data),config.skill==="ath"?9:5,"target ability/proficiency and native modifiers are used");
    if (state.cancel) return null;
    const card={ ...message.data, id:`escape${serial++}`, type:"check", author:game.user,
      system:{skill:config.skill,ability:config.ability}, rolls:[new D20(state.total,{target:config.target})],
      getAssociatedActor:()=>f.target, async setFlag(module,key,value){set(this.flags,`${module}.${key}`,value);} };
    card.uuid=`ChatMessage.${card.id}`; world.set(card.uuid,card);game.messages.push(card);state.card=card;
    if(state.beforePayment)state.beforePayment(card);
    await finishArcanaEscape(card); return card.rolls;
  };
  CONFIG.Item = { documentClass: class {
    constructor(data,{parent}) {
      Object.assign(this,data); this.toObject=()=>structuredClone(data);
      const raw=Object.values(data.system.activities)[0], activity={...raw,id:raw._id,item:this,actor:parent,requiresSpellSlot:false,
        consumption:{targets:[],spellSlot:false}};
      activity.use=async(config,dialog,message)=>{
        state.paymentMessage = message;
        assert.equal(dialog.configure,false);assert.equal(config.subsequentActions,false);assert.equal(config.consume.action,true);
        if(!canPayArcanaEscape(activity,config))return;
        assert.deepEqual(escapePaymentButtons.call(activity,()=>[{action:"refundResource"},{action:"other"}]),[{action:"other"}]);
        let refunded=false;refundArcanaEscape.call(activity,()=>{refunded=true;});assert.equal(refunded,false);
        assert.equal(canPayArcanaEscape(activity,{consume:false}),false,"free use cannot record a paid action");
        assert.equal(canPayArcanaEscape({...activity,activation:{type:"bonus",value:1}},config),false,"the escape uses an action");
        const updates=await nativeUsageUpdates.call(activity,config,{returnErrors:true});
        if(Array.isArray(updates))return;
        assert.notEqual(recordArcanaEscapePayment(activity,config,message,updates),false);
        await parent.performBulkUpdate({actor:updates.actor});state.payments++;
        if(state.afterPayment)await state.afterPayment();
        if(state.failAfterPayment)throw Error("payment card failed after consumption");
        if(state.failSettlement)failBatch=true;
        return {message:{id:"payment"}};
      };
      this.system={activities:list([activity])};
    }
  } };
  const origin=pending.message.getOriginatingMessage();origin.getAssociatedItem=()=>pending.activity.item;origin.whisper=[];
  return { ...f, ...pending, origin, state, click:()=>escapeChatAction(()=>{}, {}, {dataset:{action:"arcanaEscape"}},origin) };
}
for(const skill of ["ath","acr"]){
  const f=escapeFixture({skill});await applyArcanaSpiritHits(f.message);
  assert.equal(escapeChatButtons.call(f.activity,()=>[],{})[0].action,"arcanaEscape");
  await f.click();assert.equal(f.state.checks,1);assert.equal(f.state.payments,1);assert.equal(f.target.system.attributes.actions.spent,1);
  assert.equal(f.target.effects.length,0);assert.equal(f.state.card.flags.spikependium.arcanaEscapeSettled,"success");
  await finishArcanaEscape(f.state.card);assert.equal(f.state.payments,1);
}
{
  const f=escapeFixture({total:8});await applyArcanaSpiritHits(f.message);await f.click();
  assert.equal(f.target.effects.length,1);assert.equal(f.state.payments,1);assert.equal(f.state.card.flags.spikependium.arcanaEscapeSettled,"failure");
  await f.click();assert.equal(f.state.checks,1,"no extra roll when the target action is exhausted");
}
{
  const f=escapeFixture({cancel:true});await applyArcanaSpiritHits(f.message);await f.click();
  assert.equal(f.state.payments,0);assert.equal(f.target.system.attributes.actions.spent,0);assert.equal(f.target.effects.length,1);
}
for(const failure of ["failSettlement","failAfterPayment"]){
  const f=escapeFixture();await applyArcanaSpiritHits(f.message);f.state[failure]=true;
  await assert.rejects(()=>f.click());assert.equal(f.state.payments,1);assert.equal(f.target.effects.length,1);
  f.state[failure]=false;failBatch=false;await finishArcanaEscape(f.state.card);
  assert.equal(f.state.payments,1,"recovery uses the persisted payment receipt");assert.equal(f.target.effects.length,0);
}
{
  const f=escapeFixture();await applyArcanaSpiritHits(f.message);
  f.state.afterPayment=()=>{f.target.effects[0].system.origin.message="new-grapple";};await f.click();
  assert.equal(f.target.effects.length,1,"an old success cannot delete a refreshed grapple");assert.equal(f.state.payments,1);
  assert.equal(f.state.card.flags.spikependium.arcanaEscapeSettled,"stale");
}
{
  const f=escapeFixture();await applyArcanaSpiritHits(f.message);f.target.isOwner=false;await f.click();assert.equal(f.state.checks,0);f.target.isOwner=true;
  f.target.statuses.add("stunned");await f.click();assert.equal(f.state.checks,0);
}
{
  const f=escapeFixture();await applyArcanaSpiritHits(f.message);f.state.beforePayment=card=>{card.system.skill="prc";};await f.click();
  assert.equal(f.state.payments,0);assert.equal(f.target.effects.length,1);
}
{
  const f=escapeFixture();await applyArcanaSpiritHits(f.message);const savedUser=game.user,savedGM=game.users.activeGM;
  game.user={id:"owner",isGM:false,isActiveGM:false};game.users.activeGM=null;
  try{await f.click();assert.equal(f.target.effects.length,0);assert.equal(f.state.payments,1);}finally{game.user=savedUser;game.users.activeGM=savedGM;}
}
{
  const f=escapeFixture();f.origin.whisper=["gm"];f.origin.blind=true;await applyArcanaSpiritHits(f.message);await f.click();
  assert.equal(f.state.skillMessage.rollMode,"blind");assert.deepEqual(f.state.skillMessage.data.whisper,["gm"]);
  assert.equal(f.state.paymentMessage.rollMode,"blind");assert.deepEqual(f.state.paymentMessage.data.whisper,["gm"]);
}
{
  const f=escapeFixture();f.activity.getRollData=()=>({attributes:{spell:{dc:25}}});await applyArcanaSpiritHits(f.message);
  assert.equal(f.target.effects[0].flags.spikependium.arcanaSpiritGrab.dc,15,"casting DC is a snapshot");await f.click();assert.equal(f.target.effects.length,0);
}
{
  const f=escapeFixture();delete f.spirit.flags.spikependium.arcanaSummon.dc;f.source.flags.dnd5e.summon.mod=4;f.source.system.attributes.prof=3;
  await applyArcanaSpiritHits(f.message);assert.equal(f.target.effects[0].flags.spikependium.arcanaSpiritGrab.dc,15,"legacy summons use their stored modifier and proficiency");
}
{
  const f=fixture("dinosaur","triceratops"),{message,activity}=hit(f,"au-dinosaur-gore");
  await applyArcanaSpiritHits(message);assert.equal(f.target.effects.length,0);
  CONFIG.Dice.DamageRoll=Damage; CONFIG.Dice.DamageRoll.DefaultConfigurationDialog=Dialog;
  const config={subject:activity,rolls:[{parts:["1d10+5"],data:{},options:{}}],spikependium:{dive:false}},dialog={};
  prepareMonsterDamage(config,dialog,{data:{system:{targets:message.system.targets}}});
  const instance=new dialog.applicationClass(config);instance._buildConfig(config.rolls[0],new Map([["spikependium.dive",true]]),0);
  assert.equal(config.rolls[0].options.spikependiumCharge,true);
  const card={type:"damage",author:game.user,flags:{spikependium:{attackSource:{message:message.uuid,signature:attackSignature(message)}}},
    rolls:[new Damage(config.rolls[0].options)],system:{targets:message.system.targets},getAssociatedActivity:()=>activity};
  await applyArcanaCharge(card);assert.ok(f.target.effects[0].statuses.has("prone"));
  await f.target.effects[0].delete();await applyArcanaCharge(card);assert.equal(f.target.effects.length,0,"old charge cards do not knock down again");
  instance._buildConfig(config.rolls[0],new Map([["spikependium.dive",false]]),0);assert.equal(config.rolls[0].options.spikependiumCharge,undefined);
}
{
  const f=fixture("dinosaur","triceratops"),{message,activity}=hit(f,"au-dinosaur-gore");message.rolls[0].total=1;
  const card={type:"damage",author:game.user,flags:{spikependium:{attackSource:{message:message.uuid,signature:attackSignature(message)}}},
    rolls:[new Damage({spikependiumCharge:true})],system:{targets:message.system.targets},getAssociatedActivity:()=>activity};
  await applyArcanaCharge(card);assert.equal(f.target.effects.length,0,"a confirmed movement does not turn a miss into a hit");
}
for (const skill of ["ath", "acr"]) {
  const f = escapeFixture({ monster: true, skill }); await applyArcanaSpiritHits(f.message);
  assert.equal(f.target.effects.length, 1); assert.deepEqual([...f.target.effects[0].statuses], ["grappled"], "ankheg does not restrain");
  assert.deepEqual(f.target.effects[0].flags.spikependium.arcanaSpiritGrab, { source: f.spirit.uuid, target: f.recipient.uuid, dc: 13, reach: 5 });
  assert.equal(escapeChatButtons.call(f.activity, () => [], {})[0].action, "arcanaEscape");
  await f.click(); assert.equal(f.state.payments, 1); assert.equal(f.target.effects.length, 0);
  await finishArcanaEscape(f.state.card); assert.equal(f.state.payments, 1, "ankheg escape pays once");
  await applyArcanaSpiritHits(f.message); assert.equal(f.target.effects.length, 0, "old hit does not grab again");
}
{
  const f = escapeFixture({ monster: true, total: 12 }); await applyArcanaSpiritHits(f.message); await f.click();
  assert.equal(f.state.payments, 1); assert.equal(f.target.effects.length, 1, "failed escape spends action and preserves grapple");
}
for (const reason of ["huge", "immune", "miss", "not-owner"]) {
  const f = escapeFixture({ monster: true });
  if (reason === "huge") f.target.system.traits.size = "huge";
  if (reason === "immune") f.target.system.traits.ci.value.add("grappled");
  if (reason === "miss") f.message.rolls[0].total = 1;
  if (reason === "not-owner") f.source.testUserPermission = () => false;
  await applyArcanaSpiritHits(f.message); assert.equal(f.target.effects.length, 0, reason);
}
{
  const f = escapeFixture({ monster: true }); await applyArcanaSpiritHits(f.message);
  world.delete(f.spirit.uuid); await f.click(); assert.equal(f.state.checks, 0, "missing source prevents escape payment safely");
}
{
  const f = escapeFixture({ monster: true }); await applyArcanaSpiritHits(f.message);
  f.recipient.getCenterPoint = () => ({ x: 6, y: 0 }); await updateArcanaSpirits();
  assert.equal(f.target.effects.length, 0, "ankheg grapple ends beyond 5 feet");
}
{
  const f = escapeFixture({ monster: true }), second = actorDoc(actors[0]); second.id = "second"; second.uuid = "Actor.second";
  const token = { ...f.recipient, id: "second", uuid: "Scene.scene.Token.second", actor: second };
  second.system.traits.size = "lg"; f.scene.tokens.push(token); game.actors.push(second); world.set(token.uuid, token); world.set(second.uuid, second);
  f.message.system.targets.push({ actor: second.uuid, token: token.uuid, ac: 10 });
  await applyArcanaSpiritHits(f.message); assert.equal(f.target.effects.length, 1); assert.equal(second.effects.length, 1, "book imposes no one-target grapple cap");
}
{
  const f = escapeFixture({ monster: "aboleth" }); await applyArcanaSpiritHits(f.message);
  assert.equal(f.target.effects[0].flags.spikependium.arcanaSpiritGrab.dc, 14);
  assert.equal(f.target.effects[0].flags.spikependium.arcanaSpiritGrab.reach, 15);
  f.recipient.getCenterPoint = () => ({ x: 15, y: 0 }); await updateArcanaSpirits(); assert.equal(f.target.effects.length, 1);
  await f.click(); assert.equal(f.state.payments, 1); assert.equal(f.target.effects.length, 0);
}
{
  const f = escapeFixture({ monster: "aboleth" }), cards = [];
  for (let i = 0; i < 6; i++) {
    const actor = actorDoc(actors[0]); actor.id = `grapple${i}`; actor.uuid = `Actor.grapple${i}`; actor.system.traits.size = "med";
    const token = { ...f.recipient, id: actor.id, uuid: `Scene.scene.Token.${actor.id}`, actor };
    game.actors.push(actor); f.scene.tokens.push(token); world.set(token.uuid, token); world.set(actor.uuid, actor);
    const { message } = hit(f, "aboleth-tentacle"); message.system.targets = [{ actor: actor.uuid, token: token.uuid, ac: 10 }];
    cards.push({ actor, token, message });
  }
  await Promise.all(cards.map(card => applyArcanaSpiritHits(card.message)));
  assert.equal(cards.reduce((n, c) => n + c.actor.effects.length, 0), 4, "concurrent hits never occupy more than four tentacles");
  await cards[0].actor.effects[0].delete(); await applyArcanaSpiritHits(cards[4].message);
  assert.equal(cards[4].actor.effects.length, 0, "old hit rejected at capacity cannot grab after a tentacle frees up");
  const next = hit(f, "aboleth-tentacle"); next.message.system.targets = cards[4].message.system.targets;
  await applyArcanaSpiritHits(next.message); assert.equal(cards[4].actor.effects.length, 1, "a new hit can use the released tentacle");
}
function monsterCastFixture(action = "aboleth-dominate", total = 10, sourceKey = "actor:mm25:aboleth") {
  const f = escapeFixture({ monster: "aboleth" });
  if (sourceKey !== "actor:mm25:aboleth") {
    const original = f.source;
    f.source = actorDoc(read("creatures").find(actor => actor.flags?.spikependium?.key === sourceKey));
    f.spirit.actor = f.source; f.source.token = f.spirit; world.set(f.source.uuid, f.source);
    game.actors.splice(game.actors.indexOf(original), 1, f.source);
  }
  for (const item of f.source.items) world.set(item.uuid, item);
  const activity = f.source.items.flatMap(item => [...item.system.activities]).find(a => a.flags.spikependium?.monsterAction === action);
  activity.save.dc.value = Number(activity.save.dc.formula); activity.applicableEffects = activity.item.effects;
  world.set(activity.uuid, activity);
  const payload = { data: { system: { targets: [{ actor: f.target.uuid, token: f.recipient.uuid }] } } };
  recordMonsterEffect(activity, payload);
  const saves = [], origin = { id: `origin${serial++}`, type: "usage", author: game.user, flags: payload.data.flags, system: {}, whisper: [],
    getAssociatedRolls: () => saves, getAssociatedActor: () => f.source, getAssociatedActivity: () => activity, getAssociatedItem: () => activity.item,
    getAssociatedToken: () => f.spirit, async setFlag(module, key, value) { set(this.flags, `${module}.${key}`, value); } };
  origin.uuid = `ChatMessage.${origin.id}`; world.set(origin.uuid, origin);
  const roll = new D20(total, { target: activity.save.dc.value }); roll.isFailure = total < activity.save.dc.value;
  const saved = { type: "save", author: game.user, system: { ability: activity.save.ability[0] }, rolls: [roll],
    getAssociatedActor: () => f.target, getAssociatedToken: () => f.recipient, getOriginatingMessage: () => origin };
  saves.push(saved); return { ...f, activity, origin, saved, saves };
}
for (const outcome of ["failed", "success", "immune-incapacitated", "immune-all", "unauthorized", "wrong-dc", "destroyed", "new-tome"]) {
  const f = monsterCastFixture("arcanaloth-banishing", outcome === "success" ? 20 : 10, "actor:mm25:arcanaloth");
  const tome = f.source.items.find(item => item.system.identifier === "arcanaloth-soul-tome");
  if (outcome === "immune-incapacitated") f.target.system.traits.ci.value.add("incapacitated");
  if (outcome === "immune-all") f.target.system.traits.ci.value.add("ALL");
  if (outcome === "unauthorized") { f.saved.author = { id: "stranger", isGM: false }; f.target.testUserPermission = () => false; }
  if (outcome === "wrong-dc") f.saved.rolls[0].options.target = 16;
  if (outcome === "destroyed") tome.system.hp.value = 0;
  if (outcome === "new-tome") { tome.flags.spikependium ??= {}; tome.flags.spikependium.soulTome = { generation: "new" }; }
  await syncMonsterEffects(f.saved);
  const imprisoned = ["failed", "immune-incapacitated", "immune-all"].includes(outcome);
  assert.equal(f.target.effects.length, imprisoned ? 1 : 0, outcome);
  if (!imprisoned) continue;
  const effect = f.target.effects[0]; assert.equal(effect.flags.spikependium.soulPrison.tome, tome.uuid);
  assert.equal(effect.flags.spikependium.soulPrison.generation, "initial"); assert.equal(effect.flags.spikependium.soulPrison.dc, 17);
  assert.equal(effect.flags.spikependium.soulPrison.phase, "awaiting-transfer");
  assert.equal(effect.statuses.has("incapacitated"), outcome === "failed", "condition immunity does not prevent the planar imprisonment marker");
  await syncMonsterEffects(f.saved); assert.equal(f.target.effects.length, 1);
  await releaseSoulTomePrisons(tome); assert.equal(f.target.effects.length, 1, "intact original tome preserves imprisonment");
  f.source.statuses.add("dead"); await releaseSoulTomePrisons(tome); assert.equal(f.target.effects.length, 1, "body death alone does not destroy the tome");
  tome.system.hp.value = 0; await Promise.all([releaseSoulTomePrisons(tome), releaseSoulTomePrisons(tome)]);
  assert.equal(f.target.effects.length, 0, "destruction releases the condition once");
  await syncMonsterEffects(f.saved); assert.equal(f.target.effects.length, 0, "old save cannot imprison again after destruction");
}
{
  const f = monsterCastFixture("arcanaloth-banishing", 10, "actor:mm25:arcanaloth");
  f.source.token = f.spirit; game.user.targets = new Set([f.recipient]);
  assert.equal(canUseMonsterActivity(f.activity), true);
  f.recipient.getCenterPoint = () => ({ x: 6, y: 0 }); assert.equal(canUseMonsterActivity(f.activity), false, "save requires a melee target");
  f.recipient.getCenterPoint = () => ({ x: 5, y: 0 });
  const tome = f.source.items.find(item => item.system.identifier === "arcanaloth-soul-tome");
  tome.system.equipped = false; assert.equal(canUseMonsterActivity(f.activity), false); tome.system.equipped = true;
  await syncMonsterEffects(f.saved); assert.equal(f.target.effects.length, 1);
  tome.flags.spikependium ??= {}; tome.flags.spikependium.soulTome = { generation: "replacement" };
  await releaseSoulTomePrisons(tome); assert.equal(f.target.effects.length, 0, "recovered new tome cannot retain an old prison effect");
}
{
  const f = monsterCastFixture("arcanaloth-banishing", 10, "actor:mm25:arcanaloth");
  await syncMonsterEffects(f.saved); assert.equal(f.target.effects.length, 1);
  f.saved.system.resisted = true; Object.defineProperty(f.saved.system, "forceSuccess", { get() { return nativeSaveForceSuccess.call(this); } });
  await syncMonsterEffects(f.saved); assert.equal(f.target.effects.length, 0, "native Legendary Resistance can turn the initial failed save into success");
  f.saved.system.resisted = false; await syncMonsterEffects(f.saved); assert.equal(f.target.effects.length, 0, "removed imprisonment does not return from the old card");
}
console.log("Arcanaloth claw: native Charisma save, condition immunity, tome generation, destruction/replacement cleanup and duplicate protection passed.");
for (const [sourceKey, action, status] of [
  ["actor:mm25:performer-virtuoso", "performer-charmed", "charmed"],
  ["actor:mm25:performer-legend", "performer-charmed", "charmed"],
  ["actor:mm25:performer-legend", "performer-frightened", "frightened"],
  ["actor:mm25:performer-legend", "performer-defense", "charmed"]
]) {
  for (const outcome of ["failed", "success", "immune", "unauthorized"]) {
    const f = monsterCastFixture(action, outcome === "success" ? 20 : 10, sourceKey);
    if (outcome === "immune") f.target.system.traits.ci.value.add(status);
    if (outcome === "unauthorized") { f.saved.author = { id: "stranger", isGM: false }; f.target.testUserPermission = () => false; }
    await syncMonsterEffects(f.saved);
    assert.equal(f.target.effects.length, outcome === "failed" ? 1 : 0, `${sourceKey}/${action}/${outcome}`);
    if (outcome !== "failed") continue;
    const applied = f.target.effects[0]; assert.deepEqual([...applied.statuses], [status]);
    assert.equal(applied.duration.expiry, "sourceEnd"); assert.equal(applied.system.origin.activity, f.activity.uuid);
    await syncMonsterEffects(f.saved); assert.equal(f.target.effects.length, 1, "duplicate save cannot duplicate performer effect");
    const casterTurn = { id: "performer", actor: f.source }, targetTurn = { id: "target", actor: f.target };
    const combat = { previous: { combatantId: casterTurn.id }, getCombatantsByActor: actor => [actor === f.source ? casterTurn : targetTurn] };
    const host = { specialDuration: applied.duration.expiry, actor: f.target, getSourceActor: () => f.source,
      start: { combat, round: 1, turn: 0 } };
    assert.equal(isExpiryEvent.call(host, "turnStart", { combat, round: 2, turn: 0 }), false);
    assert.equal(isExpiryEvent.call(host, "turnEnd", { combat, round: 1, turn: 0 }), false, "application turn does not expire charm");
    combat.previous.combatantId = targetTurn.id;
    assert.equal(isExpiryEvent.call(host, "turnEnd", { combat, round: 1, turn: 1 }), false, "target turn does not expire source effect");
    combat.previous.combatantId = casterTurn.id;
    assert.equal(isExpiryEvent.call(host, "turnEnd", { combat, round: 2, turn: 0 }), true, "native expiry at end of next caster turn");
    await applied.delete(); await syncMonsterEffects(f.saved); assert.equal(f.target.effects.length, 0, "expired performer effect cannot return from old save");
  }
}
console.log("MM25 performers: failed saves, immunity/ownership, effect provenance, duplicate protection and native next-source-turn expiry passed.");
for (const action of ["aboleth-dominate", "aboleth-curse", "aboleth-water-poison"]) {
  const f = monsterCastFixture(action); await syncMonsterEffects(f.saved);
  assert.equal(f.target.effects.length, 1); assert.equal(f.target.effects[0].flags.spikependium.monsterEffect, action);
  await syncMonsterEffects(f.saved); assert.equal(f.target.effects.length, 1);
  await f.target.effects[0].delete(); await syncMonsterEffects(f.saved); assert.equal(f.target.effects.length, 0, "old save does not recreate removed effect");
}
{
  const f = monsterCastFixture(); await syncMonsterEffects(f.saved); assert.equal(f.target.effects.length, 1);
  f.saved.system.resisted = true; Object.defineProperty(f.saved.system, "forceSuccess", { get() { return nativeSaveForceSuccess.call(this); } });
  await syncMonsterEffects(f.saved); assert.equal(f.target.effects.length, 0, "native legendary resistance removes the initial charm");
  await syncMonsterEffects(f.saved); assert.equal(f.target.effects.length, 0);
}
for (const reason of ["success", "immune", "unauthorized", "expired-poison"]) {
  const f = monsterCastFixture(reason === "expired-poison" ? "aboleth-water-poison" : "aboleth-dominate", reason === "success" ? 20 : 10);
  if (reason === "immune") f.target.system.traits.ci.value.add("charmed");
  if (reason === "unauthorized") { f.saved.author = { id: "stranger", isGM: false }; f.target.testUserPermission = () => false; }
  if (reason === "expired-poison") game.time.worldTime = 3600;
  await syncMonsterEffects(f.saved); assert.equal(f.target.effects.length, 0, reason);
}
{
  const f = monsterCastFixture(); failBatch = true; await assert.rejects(() => syncMonsterEffects(f.saved)); assert.equal(f.target.effects.length, 0);
  failBatch = false; await syncMonsterEffects(f.saved); assert.equal(f.target.effects.length, 1, "failure can resume without duplicate effects");
  f.source.system.attributes.hp.value = 0; await endDeadAbolethCharms(); assert.equal(f.target.effects.length, 1, "zero HP is not death when NPC death saves are enabled");
  f.source.statuses.add("dead"); await endDeadAbolethCharms(); assert.equal(f.target.effects.length, 0);
  f.source.system.attributes.hp.value = 150; f.source.statuses.delete("dead");
  await syncMonsterEffects(f.saved); assert.equal(f.target.effects.length, 0, "reviving aboleth does not restore an old charm");
}
{
  const f = monsterCastFixture("aboleth-curse"); await syncMonsterEffects(f.saved); f.source.system.attributes.hp.value = 0; f.source.statuses.add("dead");
  await endDeadAbolethCharms(); assert.equal(f.target.effects.length, 1, "curse survives aboleth death");
}
{
  const f = monsterCastFixture(); game.user.targets = new Set([f.recipient]); f.source.token = f.spirit;
  const memories = f.source.items.flatMap(item => [...item.system.activities]).find(a => a.flags.spikependium?.monsterAction === "aboleth-memories");
  assert.equal(canUseMonsterActivity(memories), false); await syncMonsterEffects(f.saved); assert.equal(canUseMonsterActivity(memories), true);
  assert.equal(abolethMemoryTarget(memories, f.spirit, f.recipient), true);
  f.recipient.getCenterPoint = () => ({ x: 31, y: 0 }); assert.equal(canUseMonsterActivity(memories), false);
  f.recipient.getCenterPoint = () => ({ x: 5, y: 0 }); f.target.effects[0].system.origin.activity = "foreign-activity";
  assert.equal(canUseMonsterActivity(memories), false, "another caster's charm does not qualify");
  const projection = f.source.items.flatMap(item => [...item.system.activities]).find(a => a.flags.spikependium?.monsterAction === "aboleth-projection");
  assert.equal(canUseMonsterActivity(projection), false); f.source.system.resources.lair.inside = true; assert.equal(canUseMonsterActivity(projection), true);
}
{
  const f = escapeFixture({ monster: "aboleth" }); f.source.token = f.spirit; game.user.targets = new Set([f.recipient]);
  const drain = f.source.items.flatMap(item => [...item.system.activities]).find(a => a.flags.spikependium?.monsterAction === "aboleth-drain");
  await applyArcanaSpiritHits(f.message); assert.equal(canUseMonsterActivity(drain), true);
  game.combat = { started: true, combatant: { actor: f.source } }; assert.equal(canUseMonsterActivity(drain), false); game.combat = null;
  const heal = drain.item.system.activities.find(a => a.type === "heal"); let rolls = 0;
  heal.rollDamage = async (config, dialog, message) => { rolls++; assert.equal(config.isCritical, false); assert.equal(message.data.system.targets[0].actor, f.source.uuid); };
  const message = { id: "drain", uuid: "ChatMessage.drain", author: game.user, flags: {}, async setFlag(module, key, value) { set(this.flags, `${module}.${key}`, value); } };
  await monsterDrainHealing(drain, {}, { message }); await monsterDrainHealing(drain, {}, { message }); assert.equal(rolls, 1, "legendary drain opens self healing once");
}
async function dominationFixture({ total = 10, synthetic = false, action = "aboleth-dominate" } = {}) {
  const f = monsterCastFixture(action);
  if (synthetic) {
    world.delete(f.target.uuid); f.target.parent = f.recipient; f.recipient.delta = { id: "delta" };
    f.target.uuid = "Scene.scene.Token.target.Actor.synthetic";
    f.origin.flags.spikependium.monsterCast.targets[0].actor = f.target.uuid; world.set(f.target.uuid, f.target);
  }
  await syncMonsterEffects(f.saved); assert.equal(f.target.effects.length, 1);
  f.source.token = f.spirit;
  const hp = f.target.system.attributes.hp; hp.value = hp.max = hp.effectiveMax = 50; hp.temp = 0; hp.tempmax = 0;
  Object.defineProperty(hp, "damage", { get: () => hp.effectiveMax - hp.value });
  f.target.system._source = { attributes: { hp: { tempmax: 0 } } };
  for (const name of ["di", "dr", "dv"]) f.target.system.traits[name].value = new Set();
  f.target.changeHasEffect = (kind, damage, { options }) => options.ignore !== true
    && f.target.system.traits[{ immunity: "di", resistance: "dr", vulnerability: "dv" }[kind]]?.value.has(damage.type);
  f.target.calculateDamage = nativeCalculateDamage;
  f.target.applyDamage = (...args) => abolethApplyDamage.call(f.target, (...forward) => nativeApplyDamage.call(f.target, ...forward), ...args);
  const state = { total, cards: [], failBefore: false, failAfter: false, cancel: false, during: null, cancelledDamage: false, afterUpdate: null };
  globalThis.Hooks = { call(name, ...args) {
    if (name === "dnd5e.preCalculateDamage") restrictAbolethHealing(...args);
    if (name === "dnd5e.calculateDamage") recordAbolethCalculation(...args);
    if (name === "dnd5e.preApplyDamage") { recordAbolethDamage(...args); if (recordAbolethCurseDamage(...args) === false) return false; }
    if (name === "modifyTokenAttribute" && state.cancelledDamage) return false;
    return true;
  }, callAll() {} };
  Math.clamp ??= (n, min, max) => Math.min(Math.max(n, min), max); Number.isNumeric ??= n => typeof n === "number";
  CONFIG.DND5E.damageTypes = { fire: {}, acid: {}, psychic: {} }; CONFIG.DND5E.healingTypes = { healing: {}, temphp: {} };
  const update = f.target.update;
  f.target.update = async data => { await update.call(f.target, data); if (state.afterUpdate) await state.afterUpdate(data); };
  f.target.rollSavingThrow = async function(config, dialog, message) {
    assert.equal(this, f.target); assert.equal(config.ability, "wis"); assert.equal(config.target, 16); assert.equal(dialog.configure, false);
    if (state.failBefore) throw Error("save failed before card");
    if (state.cancel) return [];
    const roll = new D20(state.total, { target: config.target }); roll.isFailure = state.total < config.target;
    const card = { ...message.data, id: `repeat${serial++}`, uuid: `ChatMessage.repeat${serial - 1}`, type: "save", author: game.user, rolls: [roll],
      system: { ...message.data.system, ability: "wis" }, getAssociatedActor: () => f.target, getAssociatedToken: () => f.recipient,
      getOriginatingMessage: () => f.origin, rollMode: message.rollMode };
    state.cards.push(card); game.messages.push(card); world.set(card.uuid, card); f.saves.push(card);
    if (state.during) await state.during(card);
    if (state.failAfter) throw Error("save card posted before failure");
    await syncAbolethRepeat(card); return [roll];
  };
  return { ...f, state, damage: (n = 5, options = {}) => f.target.applyDamage([{ type: "fire", value: n }], options) };
}
{
  const f = await dominationFixture(); await f.damage(); assert.equal(f.target.system.attributes.hp.value, 45);
  assert.equal(Object.keys(f.target.flags.spikependium.abolethRepeats).length, 1, "damage and its request share the native update");
  await resumeAbolethDomination(); assert.equal(f.state.cards.length, 1); assert.equal(f.target.effects.length, 1);
  await resumeAbolethDomination(); assert.equal(f.state.cards.length, 1, "a processed damage request does not reroll");
  await f.damage(); await resumeAbolethDomination(); assert.equal(f.state.cards.length, 2, "another actual application earns another save");
}
{
  const f = await dominationFixture({ total: 20, synthetic: true }); await f.damage(); await resumeAbolethDomination();
  assert.equal(f.target.effects.length, 0); assert.equal(f.state.cards.length, 1, "native ActorDelta update handles unlinked token actor");
  await syncAbolethRepeat(f.state.cards[0]); assert.equal(f.state.cards.length, 1);
}
for (const reason of ["immune", "healing", "temphp", "maximum", "zero", "cancel", "threshold"]) {
  const f = await dominationFixture();
  if (reason === "immune") f.target.system.traits.di.value.add("fire");
  if (reason === "cancel") f.state.cancelledDamage = true;
  if (reason === "threshold") f.target.system.attributes.hp.dt = 10;
  if (["healing", "temphp", "maximum"].includes(reason)) await f.target.applyDamage([{ type: reason, value: reason === "maximum" ? -5 : 5 }]);
  else await f.damage(reason === "zero" ? 0 : 5);
  await resumeAbolethDomination(); assert.equal(f.state.cards.length, 0, reason);
}
{
  const f = await dominationFixture(); f.target.system.attributes.hp.temp = 10;
  await f.damage(); await resumeAbolethDomination(); assert.equal(f.target.system.attributes.hp.value, 50);
  assert.equal(f.target.system.attributes.hp.temp, 5); assert.equal(f.state.cards.length, 1, "temporary HP damage also triggers");
}
{
  const f = await dominationFixture(); f.target.system.traits.dr.value.add("fire");
  await f.damage(1); await resumeAbolethDomination(); assert.equal(f.state.cards.length, 0, "resistance reducing damage to zero does not trigger");
  await f.damage(3); await resumeAbolethDomination(); assert.equal(f.state.cards.length, 1);
}
{
  const f = await dominationFixture(); await f.target.applyDamage([{ type: "fire", value: 5 }, { type: "healing", value: 5 }]);
  await resumeAbolethDomination(); assert.equal(f.target.system.attributes.hp.value, 50); assert.equal(f.state.cards.length, 1, "mixed damage/healing still includes actual damage");
}
{
  const f = await dominationFixture(); await Promise.all([f.damage(), f.damage()]); await resumeAbolethDomination();
  assert.equal(f.target.system.attributes.hp.value, 40, "same-client concurrent applications are serialized"); assert.equal(f.state.cards.length, 2);
}
{
  const f = await dominationFixture(); await f.damage(); f.target.effects[0].system.origin.message = "new-cast";
  await resumeAbolethDomination(); assert.equal(f.state.cards.length, 0); assert.equal(f.target.effects.length, 1, "old damage cannot free a new charm");
}
{
  const f = await dominationFixture({ total: 20 }); await f.damage(); failBatch = true; await assert.rejects(() => resumeAbolethDomination());
  assert.equal(f.state.cards.length, 1); assert.equal(f.target.effects.length, 1);
  failBatch = false; await resumeAbolethDomination(); assert.equal(f.state.cards.length, 1); assert.equal(f.target.effects.length, 0, "settlement retries its existing card");
}
for (const before of [false, true]) {
  const f = await dominationFixture(); await f.damage(); f.state[before ? "failBefore" : "failAfter"] = true;
  await assert.rejects(() => resumeAbolethDomination()); f.state.failBefore = f.state.failAfter = false;
  await resumeAbolethDomination(); assert.equal(f.state.cards.length, before ? 0 : 1, "uncertain missing card is not blindly rerolled");
}
{
  const f = await dominationFixture(); await f.damage(); await resumeAbolethDomination();
  const card = f.state.cards[0]; card.system.resisted = true;
  Object.defineProperty(card.system, "forceSuccess", { get() { return nativeSaveForceSuccess.call(this); } });
  await syncAbolethRepeat(card); assert.equal(f.target.effects.length, 0, "native legendary resistance can turn a repeat failure into success");
}
{
  const f = await dominationFixture(); await f.damage(); f.origin.whisper = ["gm"]; f.origin.blind = true;
  await resumeAbolethDomination(); assert.deepEqual(f.state.cards[0].whisper, ["gm"]); assert.equal(f.state.cards[0].rollMode, "blind");
}
{
  const f = await dominationFixture(); await f.damage(); f.state.cancel = true; await resumeAbolethDomination();
  f.state.cancel = false; await resumeAbolethDomination(); assert.equal(f.state.cards.length, 0, "cancel does not automatically replay an uncertain save");
}
{
  const f = await dominationFixture({ total: 20 }); f.recipient.getCenterPoint = () => ({ x: 5280, y: 0 });
  await resumeAbolethDomination(); assert.equal(f.state.cards.length, 0);
  game.time.worldTime = 86399; await resumeAbolethDomination(); assert.equal(f.state.cards.length, 0);
  game.time.worldTime = 86400; await resumeAbolethDomination(); assert.equal(f.state.cards.length, 1); assert.equal(f.target.effects.length, 0);
}
{
  const f = await dominationFixture(); f.recipient.getCenterPoint = () => ({ x: 5280, y: 0 });
  await resumeAbolethDomination(); game.time.worldTime = 3 * 86400; await resumeAbolethDomination(); assert.equal(f.state.cards.length, 3, "time skip catches up each completed far day");
  await resumeAbolethDomination(); assert.equal(f.state.cards.length, 3); await f.damage(); await resumeAbolethDomination();
  assert.equal(f.state.cards.length, 4, "daily distance saves do not throttle damage saves");
}
{
  const f = await dominationFixture(); f.recipient.getCenterPoint = () => ({ x: 5280, y: 0 }); await resumeAbolethDomination();
  game.time.worldTime = 40000; f.recipient.getCenterPoint = () => ({ x: 5279, y: 0 }); await resumeAbolethDomination();
  game.time.worldTime = 50000; f.recipient.getCenterPoint = () => ({ x: 5280, y: 0 }); await resumeAbolethDomination();
  game.time.worldTime = 86400; await resumeAbolethDomination(); assert.equal(f.state.cards.length, 0, "approach interrupts a continuous far day");
  game.time.worldTime = 136400; await resumeAbolethDomination(); assert.equal(f.state.cards.length, 1);
}
{
  const f = await dominationFixture(); f.recipient.getCenterPoint = () => ({ x: 6000, y: 0 }); await resumeAbolethDomination();
  game.time.worldTime = 40000; f.recipient.parent = { grid: f.scene.grid }; await resumeAbolethDomination();
  game.time.worldTime = 86400; f.recipient.parent = f.scene; await resumeAbolethDomination(); assert.equal(f.state.cards.length, 0, "unmeasurable scene separation cannot prove distance");
}
{
  const f = await dominationFixture(); game.time.worldTime = 1000; f.recipient.getCenterPoint = () => ({ x: 5280, y: 0 }); await resumeAbolethDomination();
  game.time.worldTime = 0; await resumeAbolethDomination(); game.time.worldTime = 86399; await resumeAbolethDomination(); assert.equal(f.state.cards.length, 0);
  game.time.worldTime = 86400; await resumeAbolethDomination(); assert.equal(f.state.cards.length, 1, "clock rewind resets the observation interval");
}
{
  const f = await dominationFixture(); await f.damage(); game.user.isActiveGM = false;
  try { await resumeAbolethDomination(); assert.equal(f.state.cards.length, 0, "only active GM dispatches when present"); }
  finally { game.user.isActiveGM = true; }
  await resumeAbolethDomination(); assert.equal(f.state.cards.length, 1);
}
{
  const f = await dominationFixture(), oldUsers = game.users, oldUser = game.user;
  const owner = { id: "a", active: true, isGM: false }, second = { id: "b", active: true, isGM: false }, gm = oldUser;
  const users = list([owner, second, gm]); users.activeGM = null; gm.active = false;
  f.target.testUserPermission = user => user?.isGM || ["a", "b"].includes(user?.id);
  game.users = users; game.user = owner;
  try {
    await f.damage(); game.user = second; await resumeAbolethDomination(); assert.equal(f.state.cards.length, 0, "multiple owners choose one dispatcher");
    game.user = owner; await resumeAbolethDomination(); assert.equal(f.state.cards.length, 1);
  } finally { game.users = oldUsers; game.user = oldUser; }
}
{
  const f = await dominationFixture({ total: 20 }); await f.damage();
  f.state.during = card => { card.system.ability = "con"; };
  await resumeAbolethDomination(); assert.equal(f.target.effects.length, 1, "wrong saving ability cannot settle a request");
  const card = f.state.cards[0]; card.system.ability = "wis";
  card.rolls[0].options.target = 12; await syncAbolethRepeat(card); assert.equal(f.target.effects.length, 1, "wrong DC is rejected");
  card.rolls[0].options.target = 16; await syncAbolethRepeat(card); assert.equal(f.target.effects.length, 0);
}
{
  const f = await dominationFixture(); f.spirit.hidden = true; await f.damage(); await resumeAbolethDomination();
  assert.equal(f.state.cards[0].rollMode, "gm", "hidden caster does not create a public repeat card");
}
{
  const f = await dominationFixture(), damage = { uuid: "ChatMessage.private-damage", whisper: ["gm"], blind: true };
  world.set(damage.uuid, damage); await f.damage(5, { originatingMessage: damage }); await resumeAbolethDomination();
  assert.equal(f.state.cards[0].rollMode, "blind"); assert.deepEqual(f.state.cards[0].whisper, ["gm"]);
}
{
  const f = await dominationFixture(); const convert = dnd5e.utils.convertLength;
  f.scene.grid.units = "m"; dnd5e.utils.convertLength = (n, from, to) => from === "m" && to === "ft" ? n / 0.3048 : n;
  try { f.recipient.getCenterPoint = () => ({ x: 1609.345, y: 0 }); await resumeAbolethDomination();
    game.time.worldTime = 86400; await resumeAbolethDomination(); assert.equal(f.state.cards.length, 1, "mile threshold also works on metric scene");
  } finally { dnd5e.utils.convertLength = convert; }
}
{
  const f = await dominationFixture(); await f.damage(); await resumeAbolethDomination();
  const old = f.target.effects[0], id = old.id;
  old.system.origin.message = "refresh"; f.state.cards[0].system.forceSuccess = true;
  await syncAbolethRepeat(f.state.cards[0]); assert.equal(f.target.effects[0].id, id, "late success cannot remove a refreshed effect sharing its ID");
}
for (const underwater of [undefined, false, true]) {
  const f = await dominationFixture({ action: "aboleth-curse" });
  f.target.flags.spikependium ??= {}; if (underwater !== undefined) f.target.flags.spikependium.abolethWater = { underwater, changed: 0 };
  f.target.system.attributes.hp.value = 30;
  await f.target.applyDamage([{ type: "healing", value: 5 }]);
  assert.equal(f.target.system.attributes.hp.value, underwater === true ? 35 : 30);
  await f.target.applyDamage(-5); assert.equal(f.target.system.attributes.hp.value, underwater === true ? 40 : 30, "numeric healing obeys the same restriction");
  await f.target.applyDamage([{ type: "fire", value: 5 }], { multiplier: -1 });
  assert.equal(f.target.system.attributes.hp.value, underwater === true ? 45 : 30, "healing by inverse multiplier is covered");
  await f.target.applyDamage([{ type: "temphp", value: 7 }]); assert.equal(f.target.system.attributes.hp.temp, 7);
  const updates = { "system.attributes.hp.value": 50, "flags.spikependium.other": 1 };
  guardAbolethHPUpdate(f.target, updates); assert.equal(updates["system.attributes.hp.value"], underwater === true ? 50 : 30);
  assert.equal(updates["flags.spikependium.other"], 1, "blocked healing preserves the rest of the update");
  const rest = { system: { attributes: { hp: { value: 50, max: 60 } } } };
  guardAbolethHPUpdate(f.target, rest); assert.equal(rest.system.attributes.hp.value, underwater === true ? 50 : 30);
  assert.equal(rest.system.attributes.hp.max, 60, "max HP changes are preserved");
}
{
  const f = await dominationFixture({ action: "aboleth-curse" }); f.target.system.attributes.hp.value = 30;
  f.target.effects[0].disabled = true; f.target.effects[0].active = false;
  await f.target.applyDamage([{ type: "healing", value: 5 }]); assert.equal(f.target.system.attributes.hp.value, 35, "disabled curse does not block healing");
  f.target.effects[0].active = true; f.target.effects[0].disabled = false; await f.target.effects[0].delete();
  await f.target.applyDamage([{ type: "healing", value: 5 }]); assert.equal(f.target.system.attributes.hp.value, 40, "removed curse restores healing");
}
{
  const f = await dominationFixture({ action: "aboleth-curse" }); f.target.flags.spikependium ??= {}; f.target.flags.spikependium.abolethWater = { underwater: false };
  f.target.system.attributes.hp.value = 30; await f.target.applyDamage([{ type: "fire", value: 5 }, { type: "healing", value: 5 }]);
  assert.equal(f.target.system.attributes.hp.value, 25, "curse strips only healing, preserving damage in a mixed application");
  const changes = { "system.attributes.hp.value": 20 }; guardAbolethHPUpdate(f.target, changes); assert.equal(changes["system.attributes.hp.value"], 20);
}
{
  const f = await dominationFixture({ action: "aboleth-curse" }); f.source.token = f.spirit;
  game.user.targets = new Set([f.recipient]);
  assert.equal(canUseMonsterActivity(f.activity), false, "unknown water state does not allow mucus cloud");
  globalThis.canvas = { tokens: { controlled: [f.spirit] } };
  const buttons = abolethWaterButtons.call(f.activity, () => [{ action: "other" }]);
  assert.deepEqual(buttons.map(button => button.action), ["other", "abolethEnterWater", "abolethLeaveWater", "abolethMoistenSkin"]);
  const click = action => abolethWaterAction.call(f.activity, () => {}, {}, { dataset: { action } }, {});
  await click("abolethEnterWater"); assert.equal(canUseMonsterActivity(f.activity), true);
  await click("abolethLeaveWater"); assert.equal(canUseMonsterActivity(f.activity), false);
  canvas.tokens.controlled = [f.recipient]; game.time.worldTime = 500;
  await click("abolethEnterWater"); assert.deepEqual(f.target.flags.spikependium.abolethWater, { underwater: true, changed: 500 });
  assert.equal(f.source.flags.spikependium.abolethWater.underwater, false, "selected target state does not alter caster state");
  await click("abolethMoistenSkin"); assert.equal(f.target.flags.spikependium.abolethWetAt, 500);
  f.target.isOwner = false; await click("abolethLeaveWater"); assert.equal(f.target.flags.spikependium.abolethWater.underwater, true);
  f.target.isOwner = true; canvas.tokens.controlled = [f.recipient, f.spirit]; await click("abolethLeaveWater");
  assert.equal(f.target.flags.spikependium.abolethWater.underwater, true, "ambiguous multiple-token selection is rejected");
  canvas.tokens.controlled = [f.recipient]; await f.target.effects[0].delete(); assert.equal(hasAbolethCurse(f.target), false);
  game.time.worldTime = 1000; await click("abolethMoistenSkin"); assert.equal(f.target.flags.spikependium.abolethWetAt, 500, "no curse means no moisture receipt");
  let delegated = false; await abolethWaterAction.call(f.activity, () => { delegated = true; }, {}, { dataset: { action: "other" } }, {});
  assert.equal(delegated, true);
}
async function curseTickFixture({ synthetic = false } = {}) {
  const f = await dominationFixture({ synthetic, action: "aboleth-curse" });
  f.target.token = f.recipient; f.target.flags.spikependium ??= {};
  f.target.flags.spikependium.abolethWater = { underwater: false, changed: 0 };
  const state = { cards: [], failBefore: false, failAfter: false, failAfterHP: false, rolls: 0, beforePost: null };
  CONFIG.Dice.DamageRoll = Damage;
  CONFIG.Dice.DamageRoll.build = async (config, dialog, message) => {
    state.rolls++; assert.deepEqual(config.rolls[0].parts, ["1d12"]); assert.equal(config.rolls[0].options.type, "acid");
    assert.equal(config.critical.allow, false); assert.equal(dialog.configure, false); assert.equal(config.subject.actor, f.target);
    if (state.failBefore) throw Error("tick failed before card");
    const roll = new Damage({ type: "acid" }); roll.total = 6;
    const card = { ...message.data, id: `tick${serial++}`, uuid: `ChatMessage.tick${serial - 1}`, type: "damage", author: game.user,
      rolls: [roll], rollMode: message.rollMode, getAssociatedActor: () => f.target, getAssociatedToken: () => f.recipient };
    if (state.beforePost) await state.beforePost(card);
    state.cards.push(card); game.messages.push(card); world.set(card.uuid, card); message.document = card;
    if (state.failAfter) throw Error("tick failed after card"); return [roll];
  };
  f.state.afterUpdate = async data => { if (state.failAfterHP && Object.hasOwn(data, "system.attributes.hp.value")) throw Error("tick HP saved before error"); };
  return { ...f, tick: state };
}
{
  const f = await curseTickFixture(); await resumeAbolethCurse(); game.time.worldTime = 599; await resumeAbolethCurse();
  assert.equal(f.tick.cards.length, 0); game.time.worldTime = 600; await resumeAbolethCurse();
  assert.equal(f.tick.cards.length, 1); assert.equal(f.target.system.attributes.hp.value, 44);
  await resumeAbolethCurse(); assert.equal(f.tick.cards.length, 1); assert.equal(f.target.system.attributes.hp.value, 44);
  await f.target.applyDamage([{ type: "acid", value: 6 }], { originatingMessage: f.tick.cards[0] });
  assert.equal(f.target.system.attributes.hp.value, 44, "already applied tick card cannot deal damage again");
  game.time.worldTime = 1200; await resumeAbolethCurse(); assert.equal(f.tick.cards.length, 2); assert.equal(f.target.system.attributes.hp.value, 38);
}
for (const protection of ["immune", "resistant", "temporary"]) {
  const f = await curseTickFixture({ synthetic: true });
  if (protection === "immune") f.target.system.traits.di.value.add("acid");
  if (protection === "resistant") f.target.system.traits.dr.value.add("acid");
  if (protection === "temporary") f.target.system.attributes.hp.temp = 10;
  await resumeAbolethCurse(); game.time.worldTime = 600; await resumeAbolethCurse();
  assert.equal(f.target.system.attributes.hp.value, protection === "resistant" ? 47 : 50, protection);
  if (protection === "temporary") assert.equal(f.target.system.attributes.hp.temp, 4);
  await resumeAbolethCurse(); assert.equal(f.tick.cards.length, 1, "even immunity settles the interval");
}
{
  const f = await curseTickFixture(); await resumeAbolethCurse();
  f.target.flags.spikependium.abolethWetHistory = [500]; game.time.worldTime = 600; await resumeAbolethCurse(); assert.equal(f.tick.cards.length, 0);
  game.time.worldTime = 1200; await resumeAbolethCurse(); assert.equal(f.tick.cards.length, 1, "moisture protects only the interval it occurred in");
}
{
  const f = await curseTickFixture(); await resumeAbolethCurse();
  f.target.flags.spikependium.abolethWetHistory = [600]; game.time.worldTime = 600; await resumeAbolethCurse();
  assert.equal(f.tick.cards.length, 1, "moisture after the full ten minutes does not retroactively protect the interval");
  game.time.worldTime = 1200; await resumeAbolethCurse(); assert.equal(f.tick.cards.length, 1);
}
{
  const f = await curseTickFixture(); await resumeAbolethCurse();
  f.target.flags.spikependium.abolethWaterHistory = [{ underwater: false, changed: 0 }, { underwater: true, changed: 500 }, { underwater: false, changed: 1000 }];
  f.target.flags.spikependium.abolethWater = { underwater: false, changed: 1000 };
  game.time.worldTime = 1599; await resumeAbolethCurse(); assert.equal(f.tick.cards.length, 0);
  game.time.worldTime = 1600; await resumeAbolethCurse(); assert.equal(f.tick.cards.length, 1, "outside-water interval starts again after resurfacing");
}
{
  const f = await curseTickFixture(); await resumeAbolethCurse(); game.time.worldTime = 1800; await resumeAbolethCurse();
  assert.equal(f.tick.cards.length, 3); assert.equal(f.target.system.attributes.hp.value, 32, "time skip catches up completed dry intervals");
}
{
  const f = await curseTickFixture(); await resumeAbolethCurse();
  f.target.flags.spikependium.abolethWetHistory = [100, 1300]; game.time.worldTime = 1800; await resumeAbolethCurse();
  assert.equal(f.tick.cards.length, 1); assert.equal(f.target.system.attributes.hp.value, 44, "moisture history protects earlier intervals during a time skip");
}
for (const failure of ["failBefore", "failAfter", "failAfterHP"]) {
  const f = await curseTickFixture(); await resumeAbolethCurse(); game.time.worldTime = 600; f.tick[failure] = true;
  await assert.rejects(() => resumeAbolethCurse()); f.tick[failure] = false; await resumeAbolethCurse();
  assert.equal(f.tick.rolls, 1, "uncertain failure does not blindly roll a second card");
  assert.equal(f.target.system.attributes.hp.value, failure === "failBefore" ? 50 : 44, failure);
}
{
  const f = await curseTickFixture(); await resumeAbolethCurse(); game.time.worldTime = 600;
  f.tick.beforePost = () => { f.target.effects[0].system.origin.message = "another-curse"; };
  await resumeAbolethCurse(); assert.equal(f.target.system.attributes.hp.value, 50, "old tick cannot apply to a refreshed curse");
}
for (const disabled of [false, true]) {
  const f = await curseTickFixture(); await resumeAbolethCurse();
  if (disabled) f.target.effects[0].active = false; else await f.target.effects[0].delete();
  game.time.worldTime = 600; await resumeAbolethCurse(); assert.equal(f.tick.cards.length, 0);
}
{
  const f = await curseTickFixture(); await resumeAbolethCurse(); f.source.statuses.add("dead"); world.delete(f.activity.uuid); world.delete(f.origin.uuid);
  game.time.worldTime = 600; await resumeAbolethCurse(); assert.equal(f.tick.cards.length, 1, "curse damage survives removal of caster and cast card");
}
{
  const f = await curseTickFixture(); f.origin.whisper = ["gm"]; f.origin.blind = true;
  f.target.effects[0].flags.spikependium.abolethCursePrivacy = { whisper: ["gm"], blind: true, hidden: false };
  await resumeAbolethCurse(); game.time.worldTime = 600; await resumeAbolethCurse();
  assert.equal(f.tick.cards[0].rollMode, "blind"); assert.deepEqual(f.tick.cards[0].whisper, ["gm"]);
}
{
  const f = await curseTickFixture(); f.target.effects[0].flags.spikependium.abolethCursePrivacy = { whisper: ["gm"], blind: true, hidden: true };
  world.delete(f.origin.uuid); await resumeAbolethCurse(); game.time.worldTime = 600; await resumeAbolethCurse();
  assert.equal(f.tick.cards[0].rollMode, "blind"); assert.deepEqual(f.tick.cards[0].whisper, ["gm"], "privacy survives removal of original card");
}
{
  const f = await curseTickFixture(); f.target.flags.spikependium.abolethWater = { underwater: true, changed: 0 };
  await resumeAbolethCurse(); game.time.worldTime = 1200; await resumeAbolethCurse(); assert.equal(f.tick.cards.length, 0);
}
{
  const f = await curseTickFixture(); await resumeAbolethCurse(); game.time.worldTime = 500; await resumeAbolethCurse();
  game.time.worldTime = 100; await resumeAbolethCurse(); game.time.worldTime = 600; await resumeAbolethCurse(); assert.equal(f.tick.cards.length, 0);
  game.time.worldTime = 700; await resumeAbolethCurse(); assert.equal(f.tick.cards.length, 1, "clock rewind restarts dry interval without undoing HP");
}
{
  const f = await curseTickFixture(); f.target.flags.spikependium.abolethWaterHistory = [
    { underwater: false, changed: 0 }, { underwater: true, changed: 1000 }, { underwater: false, changed: 2000 }
  ]; f.target.flags.spikependium.abolethWater = { underwater: false, changed: 2000 };
  game.time.worldTime = 3000; await resumeAbolethCurse(); assert.equal(f.tick.cards.length, 2, "first resume reconstructs earlier water intervals from history");
}
{
  const f = await curseTickFixture(); await resumeAbolethCurse(); game.time.worldTime = 600;
  const oldUser = game.user, oldUsers = game.users;
  const owner = { id: "owner", active: true, isGM: false }; const users = list([owner, oldUser]); users.activeGM = null;
  game.user = owner; game.users = users;
  try { await resumeAbolethCurse(); assert.equal(f.tick.cards.length, 1, "an active owner can dispatch without an active GM"); }
  finally { game.user = oldUser; game.users = oldUsers; }
}
function cloudFixture() {
  const f = monsterCastFixture("aboleth-curse"), state = { origins: [], cards: [], blocked: new Set(), failBeforeUsage: false,
    failAfterUsage: false, failAfterSave: false, total: 10 };
  f.scene.tokens.splice(f.scene.tokens.indexOf(f.casterToken), 1);
  game.actors.splice(game.actors.indexOf(f.caster), 1);
  f.source.flags.spikependium.abolethWater = { underwater: true, changed: 0 };
  for (const token of f.scene.tokens) { token.getVisibilityTestPoints = () => [token.getCenterPoint()]; token.texture = { src: "icon" }; }
  CONFIG.Canvas = { polygonBackends: { move: { testCollision(start, end, config) {
    assert.equal(config.mode, "any"); assert.equal(config.type, "move"); assert.equal(config.scene, f.scene); return state.blocked.has(end.x);
  } } } };
  const combatant = { id: "aboleth", actor: f.source, token: f.spirit, flags: {},
    async setFlag(module, key, value) { set(this.flags, `${module}.${key}`, value); } };
  const combat = { id: "combat", previous: { round: 1, turn: 0 }, combatants: [combatant] }; game.combats = [combat];
  f.activity.use = async (config, dialog, message) => {
    assert.equal(config.consume, false); assert.equal(config.subsequentActions, false); assert.equal(dialog.configure, false);
    assert.equal(config.create.measuredTemplate, false); assert.equal(canUseMonsterActivity(f.activity, config), true, "automatic targets do not use unrelated user selection");
    if (state.failBeforeUsage) throw Error("cloud failed before usage card");
    recordMonsterEffect(f.activity, message);
    const saves = [], origin = { ...message.data, id: `cloud${serial++}`, uuid: `ChatMessage.cloud${serial - 1}`, type: "usage", author: game.user,
      getAssociatedActor: () => f.source, getAssociatedActivity: () => f.activity, getAssociatedItem: () => f.activity.item,
      getAssociatedToken: () => f.spirit, getAssociatedRolls: () => saves };
    state.origins.push(origin); world.set(origin.uuid, origin); game.messages.push(origin); origin.saves = saves;
    origin.rollMode = message.rollMode;
    if (state.failAfterUsage) throw Error("cloud failed after usage card"); return { message: origin };
  };
  const roll = (actor, token) => async (config, dialog, message) => {
    assert.equal(config.ability, "con"); assert.equal(config.target, 14); assert.equal(dialog.configure, false);
    const origin = state.origins.find(origin => origin.id === message.data.system.origin);
    const r = new D20(state.total, { target: config.target }); r.isFailure = state.total < config.target;
    const card = { ...message.data, id: `cloudsave${serial++}`, uuid: `ChatMessage.cloudsave${serial - 1}`, type: "save", author: game.user,
      system: { ...message.data.system, ability: "con" }, rolls: [r], rollMode: message.rollMode,
      getAssociatedActor: () => actor, getAssociatedToken: () => token, getOriginatingMessage: () => origin };
    state.cards.push(card); game.messages.push(card); world.set(card.uuid, card); origin.saves.push(card);
    if (state.failAfterSave) throw Error("cloud save posted before error"); await syncMonsterEffects(card); return [r];
  };
  f.target.rollSavingThrow = roll(f.target, f.recipient);
  game.user.targets = new Set();
  const addTarget = (id, x = 5) => {
    const actor = actorDoc(actors[0]); actor.id = id; actor.uuid = `Actor.${id}`;
    const token = { ...f.recipient, id, uuid: `Scene.scene.Token.${id}`, actor, getCenterPoint: () => ({ x, y: 0 }) };
    token.getVisibilityTestPoints = () => [token.getCenterPoint()];
    actor.rollSavingThrow = roll(actor, token); f.scene.tokens.push(token); game.actors.push(actor); world.set(actor.uuid, actor); world.set(token.uuid, token);
    return { actor, token };
  };
  return { ...f, cloud: state, combat, combatant, addTarget,
    end: () => abolethEndTurn.call(combat, async () => "native-end", combatant) };
}
{
  const f = cloudFixture(), ally = f.addTarget("ally"); ally.token.disposition = f.spirit.disposition;
  const far = f.addTarget("far", 6), blocked = f.addTarget("blocked", 4); f.cloud.blocked.add(4);
  assert.deepEqual(mucusTargets(f.spirit).map(t => t.uuid), [f.recipient.uuid, ally.token.uuid], "allies are included; out-of-range and walls excluded");
  assert.equal(await f.end(), "native-end"); assert.equal(f.cloud.origins.length, 1); assert.equal(f.cloud.cards.length, 2);
  assert.equal(f.target.effects.length, 1); assert.equal(ally.actor.effects.length, 1); assert.equal(far.actor.effects.length, 0); assert.equal(blocked.actor.effects.length, 0);
  await f.end(); await resumeMucusCloud(); assert.equal(f.cloud.cards.length, 2, "same end-of-turn event is not replayed");
  const first = f.target.effects[0], start = first.start;
  f.combat.previous.round = 2; await f.end(); assert.equal(f.cloud.cards.length, 4);
  assert.equal(f.target.effects.length, 1); assert.equal(f.target.effects[0], first); assert.deepEqual(first.start, start, "repeat curse does not restart its duration/dry timer");
}
for (const reason of ["dry", "incapacitated", "zero-hp", "not-gm", "covered", "other-scene"]) {
  const f = cloudFixture();
  if (reason === "dry") f.source.flags.spikependium.abolethWater.underwater = false;
  if (reason === "incapacitated") f.source.statuses.add("stunned");
  if (reason === "zero-hp") f.source.system.attributes.hp.value = 0;
  if (reason === "not-gm") game.user.isActiveGM = false;
  if (reason === "covered") f.target.statuses.add("coverTotal");
  if (reason === "other-scene") f.recipient.parent = { grid: f.scene.grid };
  try { await f.end(); assert.equal(f.cloud.cards.length, 0, reason); }
  finally { game.user.isActiveGM = true; }
}
{
  const f = cloudFixture(); f.spirit.hidden = true; await f.end();
  assert.equal(f.cloud.origins[0].rollMode, "gm"); assert.equal(f.cloud.cards[0].rollMode, "gm");
}
for (const reason of ["success", "immune"]) {
  const f = cloudFixture(); if (reason === "success") f.cloud.total = 20; else f.target.system.traits.ci.value.add("cursed");
  await f.end(); assert.equal(f.cloud.cards.length, 1); assert.equal(f.target.effects.length, 0, reason);
}
for (const failure of ["failBeforeUsage", "failAfterUsage", "failAfterSave"]) {
  const f = cloudFixture(); f.cloud[failure] = true;
  await assert.rejects(() => f.end()); f.cloud[failure] = false; await resumeMucusCloud();
  assert.equal(f.cloud.origins.length, failure === "failBeforeUsage" ? 0 : 1, "uncertain missing card is not blindly recreated");
  assert.equal(f.cloud.cards.length, failure === "failBeforeUsage" ? 0 : 1);
  if (failure === "failAfterSave") await syncMonsterEffects(f.cloud.cards[0]);
}
{
  const f = cloudFixture(); f.cloud.failBeforeUsage = true; await assert.rejects(() => f.end());
  f.cloud.failBeforeUsage = false; f.combat.previous.round = 2; await f.end();
  assert.equal(Object.keys(f.combatant.flags.spikependium.mucusCloudEvents).length, 2, "unfinished old event survives the next round");
}
console.log("Arcana/MM: native summons/effects, repeats/water/acid lifecycle, end-turn mucus targets/walls/saves, immunity, privacy and recovery passed.");

function clawHitFixture({ total = 18, ac = 12 } = {}) {
  game.user = { id: "gm", isGM: true, isActiveGM: true };
  game.users.activeGM = game.user;
  const f = monsterCastFixture("arcanaloth-banishing", 10, "actor:mm25:arcanaloth");
  game.messages = [];
  const attackActivity = f.activity.item.system.activities.find(a => a.type === "attack"), roll = new D20(total);
  const state = { uses: 0, rolls: 0, origins: [], saves: [], failBeforeUsage: false, failAfterUsage: false,
    failBeforeSave: false, failAfterSave: false, saveTotal: 10, messages: [] };
  const attack = { id: `claw${serial++}`, type: "attack", flags: {}, author: game.user, whisper: [], blind: false,
    rolls: [roll], system: { targets: [{ actor: f.target.uuid, token: f.recipient.uuid, ac }] },
    getAssociatedActivity: () => attackActivity, getAssociatedToken: () => f.spirit,
    updateSource(changed) { for (const [key, value] of Object.entries(changed)) set(this, key, value); },
    async setFlag(module, key, value) { set(this.flags, `${module}.${key}`, value); } };
  attack.uuid = `ChatMessage.${attack.id}`; world.set(attack.uuid, attack); game.messages.push(attack);
  f.activity.use = async function(config, dialog, payload) {
    assert.equal(config.consume, false); assert.equal(config.subsequentActions, false); assert.equal(dialog.configure, false);
    const automatic = automaticSoulClawTargets(this, config); assert.equal(automatic?.targets[0]?.uuid, payload.data.system.targets[0].token);
    assert.equal(canUseMonsterWeapon(this), true, "weapon-use guard applies to the attack, not its already-triggered save");
    assert.equal(canUseMonsterActivity(this, config, payload), true);
    if (state.failBeforeUsage) throw Error("before usage");
    recordMonsterEffect(this, payload); state.uses++; state.messages.push(payload);
    const saves = [], origin = { ...payload.data, id: `clawUse${serial++}`, type: "usage", author: game.user,
      getAssociatedRolls: () => saves, getAssociatedActivity: () => this, getAssociatedActor: () => f.source,
      getAssociatedItem: () => this.item, getAssociatedToken: () => f.spirit };
    origin.uuid = `ChatMessage.${origin.id}`; origin.saved = saves;
    state.origins.push(origin); world.set(origin.uuid, origin); game.messages.push(origin);
    if (state.failAfterUsage) throw Error("after usage");
    return { message: origin };
  };
  f.target.rollSavingThrow = async function(config, dialog, payload) {
    assert.equal(config.ability, "cha"); assert.equal(config.target, 17); assert.equal(dialog.configure, false);
    if (state.failBeforeSave) throw Error("before save");
    const origin = world.get(`ChatMessage.${payload.data.system.origin}`), rolled = new D20(state.saveTotal, { target: config.target });
    const actor = this, token = world.get(`Scene.${payload.data.speaker.scene}.Token.${payload.data.speaker.token}`);
    assert.equal(token.actor, actor);
    rolled.isFailure = state.saveTotal < config.target;
    const saved = { ...payload.data, id: `clawSave${serial++}`, type: "save", author: game.user,
      system: { ...payload.data.system, ability: config.ability }, rolls: [rolled],
      getAssociatedActor: () => actor, getAssociatedToken: () => token, getOriginatingMessage: () => origin };
    saved.uuid = `ChatMessage.${saved.id}`; world.set(saved.uuid, saved); game.messages.push(saved); origin.saved.push(saved);
    state.rolls++; state.saves.push(saved); state.messages.push(payload);
    if (state.failAfterSave) throw Error("after save");
    return [rolled];
  };
  recordSoulClawAttack(attack);
  return { ...f, attack, state, tome: f.source.items.find(item => item.system.identifier === "arcanaloth-soul-tome") };
}
for (const saved of [false, true]) {
  const f = clawHitFixture(); f.state.saveTotal = saved ? 20 : 10;
  await Promise.all([syncSoulClawAttack(f.attack), syncSoulClawAttack(f.attack)]);
  assert.equal(f.state.uses, 1); assert.equal(f.state.rolls, 1); assert.equal(f.target.effects.length, saved ? 0 : 1);
  assert.ok(Object.values(f.attack.flags.spikependium.soulClawCasts).every(request => request.state === "done"));
  await resumeSoulClawAttacks(); assert.equal(f.state.rolls, 1, "resume never rerolls a completed initial save");
  if (!saved) { await f.target.effects[0].delete(); await resumeSoulClawAttacks(); assert.equal(f.target.effects.length, 0); }
}
for (const reason of ["miss", "unknown-ac", "no-gm", "changed-roll", "changed-target", "book-destroyed", "book-replaced", "unauthorized", "dead-target"]) {
  const f = clawHitFixture({ total: reason === "miss" ? 8 : 18, ac: reason === "unknown-ac" ? null : 12 });
  if (reason === "no-gm") game.user.isActiveGM = false;
  if (reason === "changed-roll") f.attack.rolls[0].total = 19;
  if (reason === "changed-target") f.attack.system.targets[0].token = "Scene.scene.Token.other";
  if (reason === "book-destroyed") f.tome.system.hp.value = 0;
  if (reason === "book-replaced") { f.tome.flags.spikependium ??= {}; f.tome.flags.spikependium.soulTome = { generation: "new" }; }
  if (reason === "unauthorized") { f.attack.author = { id: "stranger" }; f.source.testUserPermission = () => false; }
  if (reason === "dead-target") f.target.statuses.add("dead");
  await syncSoulClawAttack(f.attack); assert.equal(f.state.uses, 0, reason); assert.equal(f.state.rolls, 0, reason);
  game.user.isActiveGM = true;
}
for (const reason of ["source-hidden", "target-hidden", "private", "blind"]) {
  const f = clawHitFixture();
  if (reason === "source-hidden") f.spirit.hidden = true;
  if (reason === "target-hidden") f.recipient.hidden = true;
  if (reason === "private" || reason === "blind") f.attack.whisper = ["gm"];
  if (reason === "blind") f.attack.blind = true;
  await syncSoulClawAttack(f.attack); assert.equal(f.state.rolls, 1);
  for (const payload of f.state.messages) {
    assert.equal(payload.rollMode, "gm", reason);
    if (f.attack.whisper.length) { assert.deepEqual(payload.data.whisper, ["gm"]); assert.equal(payload.data.blind, f.attack.blind); }
  }
}
for (const failure of ["failBeforeUsage", "failAfterUsage", "failBeforeSave", "failAfterSave"]) {
  const f = clawHitFixture(); f.state[failure] = true;
  await assert.rejects(() => syncSoulClawAttack(f.attack)); f.state[failure] = false;
  await resumeSoulClawAttacks();
  assert.equal(f.state.uses, failure === "failBeforeUsage" ? 0 : 1);
  assert.equal(f.state.rolls, ["failBeforeUsage", "failBeforeSave"].includes(failure) ? 0 : 1,
    "uncertain failure without a card does not blindly reroll; an existing usage/save resumes");
  if (f.state.rolls) assert.equal(f.target.effects.length, 1);
}
{
  const f = clawHitFixture(); f.recipient.getCenterPoint = () => ({ x: 100, y: 0 }); f.tome.system.equipped = false;
  f.source.statuses.add("stunned");
  const targets = new Set([f.casterToken]); game.user.targets = targets;
  await syncSoulClawAttack(f.attack); assert.equal(f.state.rolls, 1, "confirmed hit remains valid after movement or loss of ability to act");
  assert.equal(game.user.targets, targets, "automatic save does not replace the user's selected targets");
  assert.equal(automaticSoulClawTargets(f.activity, { spikependium: { soulClawEvent: "forged" } }), undefined);
}
{
  const f = clawHitFixture(), guardian = actorDoc(actors[0]); guardian.id = "guardian"; guardian.uuid = "Actor.guardian"; guardian.effects = list([]);
  const token = { ...f.recipient, id: "guardian", uuid: "Scene.scene.Token.guardian", actor: guardian };
  f.scene.tokens.push(token); world.set(token.uuid, token); world.set(guardian.uuid, guardian); game.actors.push(guardian);
  guardian.rollSavingThrow = f.target.rollSavingThrow;
  game.users = list([game.user]); game.users.activeGM = game.user;
  f.scene.flags = { spikependium: { guardianHits: { redirect: { author: "gm", state: "prompted", attack: f.attack.uuid,
    signature: JSON.stringify(f.attack.rolls.map(roll => roll.toJSON())), victim: f.recipient.uuid, index: 0,
    target: { actor: guardian.uuid, token: token.uuid, ac: 12 } } } } };
  await syncSoulClawAttack(f.attack); assert.equal(f.state.rolls, 0, "unresolved Guardian reaction prevents premature save");
  f.scene.flags.spikependium.guardianHits.redirect.state = "done";
  await syncSoulClawAttack(f.attack); assert.equal(f.state.rolls, 1);
  assert.equal(f.target.effects.length, 0); assert.equal(guardian.effects.length, 1, "save and prison follow the actual redirected hit");
}
for (const ownsTarget of [true, false]) {
  const f = clawHitFixture(); delete game.users.activeGM; game.user.isGM = game.user.isActiveGM = false;
  f.target.isOwner = ownsTarget;
  await syncSoulClawAttack(f.attack); assert.equal(f.state.rolls, ownsTarget ? 1 : 0, "without a GM the attack author needs ownership of both creatures");
  if (ownsTarget) { assert.equal(f.target.effects.length, 1); await resumeSoulClawAttacks(); assert.equal(f.state.rolls, 1); }
}
console.log("Soul Claw: confirmed-hit native save/use, captured target/tome, effect outcomes, privacy and interrupted/repeated event recovery passed.");

async function prisonFixture() {
  game.user = { id: "gm", active: true, isGM: true, isActiveGM: true }; game.users = list([game.user]); game.users.activeGM = game.user;
  const f = monsterCastFixture("arcanaloth-banishing", 10, "actor:mm25:arcanaloth");
  f.scene.uuid = "Scene.scene"; f.scene.grid.distance = 5;
  f.scene.levels = new Map([["ground", {}]]);
  Object.assign(f.recipient, { x: 20, y: 40, elevation: 0, level: "ground", hidden: false, isOwner: true, depth: 1,
    getSize: () => ({ width: 100, height: 100 }) });
  await syncMonsterEffects(f.saved); const effect = f.target.effects[0];
  const state = { rolls: 0, total: 10, messages: [], cards: [], failBefore: false, failAfter: false };
  const book = f.source.items.find(item => item.system.identifier === "arcanaloth-soul-tome");
  const combatant = { id: "prisoner", actor: f.target, token: f.recipient }, combat = { id: "combat", previous: { round: 1, turn: 0 } };
  globalThis.canvas = { tokens: { controlled: [f.recipient] } };
  f.target.rollSavingThrow = async (config, dialog, payload) => {
    assert.equal(config.ability, "cha"); assert.equal(config.target, 17); assert.equal(dialog.configure, false);
    state.messages.push(payload);
    if (state.failBefore) throw Error("prison before card");
    const roll = new D20(state.total, { target: config.target }); roll.isFailure = state.total < config.target;
    const saved = { ...payload.data, id: `prisonSave${serial++}`, type: "save", author: game.user,
      system: { ...payload.data.system, ability: "cha" }, rolls: [roll],
      getAssociatedActor: () => f.target, getAssociatedToken: () => f.recipient, getOriginatingMessage: () => f.origin };
    saved.uuid = `ChatMessage.${saved.id}`; world.set(saved.uuid, saved); game.messages.push(saved); f.saves.push(saved);
    state.rolls++; state.cards.push(saved);
    if (state.failAfter) throw Error("prison after card");
    return [roll];
  };
  const confirm = () => soulPrisonAction.call(f.activity, () => assert.fail("handled button must not delegate"), {},
    { dataset: { action: "soulPrisonArrived" } }, f.origin);
  const end = () => soulPrisonEndTurn.call(combat, async () => "native-end", combatant);
  return { ...f, effect, state, book, combat, combatant, confirm, end };
}
for (const success of [true, false]) {
  const f = await prisonFixture(); f.state.total = success ? 20 : 10;
  await f.end(); assert.equal(f.state.rolls, 0, "no repeat until the target's transfer is confirmed");
  const buttons = soulPrisonButtons.call(f.activity, () => [{ action: "native" }]); assert.equal(buttons.length, 4);
  await f.confirm(); assert.equal(f.effect.flags.spikependium.soulPrison.phase, "unbound");
  const version = f.effect.flags.spikependium.soulPrison.version; await f.confirm(); assert.equal(f.effect.flags.spikependium.soulPrison.version, version);
  assert.equal(await f.end(), "native-end"); assert.equal(f.state.rolls, 1);
  assert.equal(f.target.effects.length, success ? 0 : 1);
  if (!success) {
    assert.equal(f.effect.flags.spikependium.soulPrison.phase, "bound"); assert.equal(f.effect.name, "Привязан к фолианту душ");
    f.combat.previous.round = 2; await f.end(); assert.equal(f.state.rolls, 1, "a failed repeat binds and stops further attempts");
    await syncMonsterEffects(f.origin); assert.equal(f.effect.flags.spikependium.soulPrison.phase, "bound", "repeat is never treated as another initial save");
    f.book.system.hp.value = 0; await releaseSoulTomePrisons(f.book); assert.equal(f.target.effects.length, 0);
  }
  await syncMonsterEffects(f.origin); assert.equal(f.target.effects.length, 0, "old initial save does not recreate a released prison");
}
{
  const f = await prisonFixture(); await f.confirm(); await Promise.all([f.end(), f.end()]);
  assert.equal(f.state.rolls, 1, "concurrent copies of the same end-turn event roll once");
  const saved = f.state.cards[0]; saved.system.resisted = true;
  Object.defineProperty(saved.system, "forceSuccess", { get() { return nativeSaveForceSuccess.call(this); } });
  await syncSoulPrisonRepeat(saved); assert.equal(f.target.effects.length, 0, "late Legendary Resistance reverses the binding from that save");
  saved.system.resisted = false; await syncSoulPrisonRepeat(saved); assert.equal(f.target.effects.length, 0);
}
for (const failure of ["failBefore", "failAfter"]) {
  const f = await prisonFixture(); await f.confirm(); f.state[failure] = true;
  await assert.rejects(() => f.end()); f.state[failure] = false;
  await resumeSoulPrisonRepeats(); assert.equal(f.state.rolls, failure === "failBefore" ? 0 : 1);
  if (failure === "failBefore") { f.combat.previous.round = 2; await f.end(); assert.equal(f.state.rolls, 0, "unresolved old request blocks a new blind reroll"); }
  else assert.equal(f.effect.flags.spikependium.soulPrison.phase, "bound");
}
for (const reason of ["disabled", "not-owner", "other-gm", "dead", "tome-gone", "version-changed"]) {
  const f = await prisonFixture(); await f.confirm();
  if (reason === "disabled") f.effect.active = false;
  if (reason === "not-owner") f.target.isOwner = false;
  if (reason === "other-gm") game.user.isActiveGM = false;
  if (reason === "dead") f.target.statuses.add("dead");
  if (reason === "tome-gone") f.book.system.hp.value = 0;
  if (reason === "version-changed") { f.book.flags.spikependium ??= {}; f.book.flags.spikependium.soulTome = { generation: "new" }; }
  await f.end(); assert.equal(f.state.rolls, 0, reason);
}
{
  const f = await prisonFixture(); f.effect.flags.spikependium.soulPrison.privacy = { whisper: ["gm"], blind: true, hidden: true };
  world.delete(f.origin.uuid); await f.confirm(); await f.end();
  assert.equal(f.state.rolls, 1); assert.equal(f.state.messages[0].rollMode, "gm");
  assert.deepEqual(f.state.messages[0].data.whisper, ["gm"]); assert.equal(f.state.messages[0].data.blind, true);
  assert.equal(f.state.messages[0].data.system.origin, undefined, "repeat survives deletion of the original usage card");
}
{
  const f = await prisonFixture(); await f.confirm();
  await soulPrisonAction.call(f.activity, () => assert.fail(), {}, { dataset: { action: "soulPrisonRepeat" } }, f.origin);
  assert.equal(f.state.rolls, 1, "manual repeat supports out-of-combat resolution after confirmed transfer");
}
{
  const f = await prisonFixture(); canvas.tokens.controlled = []; await f.confirm();
  assert.equal(f.effect.flags.spikependium.soulPrison.phase, "awaiting-transfer");
  let forwarded = false; await soulPrisonAction.call(f.activity, () => { forwarded = true; }, {}, { dataset: { action: "native" } }, f.origin);
  assert.equal(forwarded, true, "unrelated native chat actions remain intact");
}
console.log("Soul Prison: confirmed transfer, native end-turn/manual repeats, success/binding/Legendary Resistance, privacy and duplicate/failure recovery passed.");
for (const reason of ["effect-deleted", "book-destroyed"]) {
  const f = await prisonFixture(); await f.confirm(); const original = f.effect.setFlag;
  f.effect.setFlag = async function(module, key, value) {
    await original.call(this, module, key, value);
    if (key === "soulPrisonRepeat" && value.started) {
      if (reason === "effect-deleted") await this.delete(); else f.book.system.hp.value = 0;
    }
  };
  await f.end(); assert.equal(f.state.rolls, 0, "request changed before the native saving throw is revalidated");
}
for (const reason of ["save", "tome", "initial-save"]) {
  const f = await prisonFixture(); await f.confirm();
  const snapshot = structuredClone(f.effect.flags.spikependium.soulPrison.return); const id = f.effect.id;
  if (reason === "save") { f.state.total = 20; await f.end(); }
  else if (reason === "tome") { f.book.system.hp.value = 0; await releaseSoulTomePrisons(f.book); }
  else { f.saved.system.forceSuccess = true; await syncMonsterEffects(f.saved); }
  assert.equal(f.target.effects.length, 0);
  const request = f.target.flags.spikependium.soulPrisonReturns[id];
  assert.equal(request.state, "pending"); assert.equal(request.reason, reason);
  assert.deepEqual(request.return, snapshot); assert.equal(request.return.scene, "Scene.scene");
  assert.equal(request.return.token, f.recipient.uuid); assert.equal(request.origin, f.origin.uuid);
}
{
  const f = await prisonFixture(); await f.confirm(); failBatch = true;
  await assert.rejects(() => releaseSoulPrison(f.effect, "save"));
  assert.equal(f.target.effects.length, 1); assert.equal(f.target.flags.spikependium?.soulPrisonReturns, undefined,
    "failed atomic release keeps both the effect and its return coordinates");
  failBatch = false; await releaseSoulPrison(f.effect, "save"); assert.equal(f.target.effects.length, 0);
}
for (const failure of ["none", "before-move", "after-move", "stopped"]) {
  const f = await prisonFixture(); await f.confirm(); const id = f.effect.id;
  await releaseSoulPrison(f.effect, "save"); Object.assign(f.recipient, { x: 220, y: 240 });
  let moves = 0;
  f.recipient.move = async (point, options) => {
    moves++; assert.equal(point.action, "blink"); assert.equal(options.constrainOptions.ignoreWalls, true);
    if (failure === "before-move") throw Error("move before arrival");
    if (failure === "stopped") return false;
    for (const key of ["x", "y", "elevation", "level", "hidden"]) f.recipient[key] = point[key];
    if (failure === "after-move") throw Error("move after arrival");
    return true;
  };
  if (["before-move", "after-move"].includes(failure)) await assert.rejects(() => returnSoulPrisonToken(f.target, id));
  else assert.equal(await returnSoulPrisonToken(f.target, id), failure === "none");
  if (failure === "none") {
    assert.equal(f.recipient.x, 20); assert.equal(f.recipient.y, 40);
    assert.equal(f.target.flags.spikependium.soulPrisonReturns[id].state, "done");
  } else if (failure === "after-move") {
    assert.equal(await returnSoulPrisonToken(f.target, id), true, "arrival observed after error completes the receipt without moving twice");
  } else {
    assert.equal(await returnSoulPrisonToken(f.target, id), false, "unknown/stopped movement is not automatically restarted");
    assert.equal(f.target.flags.spikependium.soulPrisonReturns[id].state, "moving");
  }
  await returnSoulPrisonToken(f.target, id); assert.equal(moves, 1);
}
for (const reason of ["other-scene", "occupied", "missing-level", "not-owner", "pending-movement"]) {
  const f = await prisonFixture(); await f.confirm(); const id = f.effect.id;
  await releaseSoulPrison(f.effect, "save"); f.recipient.x = 220; let moves = 0; f.recipient.move = async () => { moves++; return true; };
  if (reason === "other-scene") f.target.flags.spikependium.soulPrisonReturns[id].return.scene = "Scene.other";
  if (reason === "occupied") f.scene.tokens.push({ actor: { type: "npc" }, level: "ground", x: 20, y: 40, elevation: 0, depth: 1,
    getOccupiedGridSpaceOffsets: () => [], getSize: () => ({ width: 100, height: 100 }) });
  if (reason === "missing-level") f.scene.levels.clear();
  if (reason === "not-owner") f.target.isOwner = false;
  if (reason === "pending-movement") f.recipient.movement = { state: "pending" };
  assert.equal(await returnSoulPrisonToken(f.target, id), false, reason); assert.equal(moves, 0);
  assert.equal(f.target.flags.spikependium.soulPrisonReturns[id].state, "pending");
}
console.log("Soul Prison return: atomic coordinate preservation, native blink, scene/occupancy/ownership checks and interrupted movement recovery passed.");
function returnGrid(f, mode = "square") {
  f.scene.dimensions = { sceneRect: { x: 0, y: 0, width: 600, height: 500 } };
  f.scene.grid.isGridless = mode === "gridless";
  f.scene.grid.getOffsetRange = () => [0, 0, 5, 6];
  f.scene.grid.getTopLeftPoint = ({ i, j }) => ({ x: j * 100 + (mode === "hex" && i % 2 ? 50 : 0), y: i * 100 });
  f.scene.grid.measurePath = ([a, b]) => ({ distance: mode === "square" ? Math.max(Math.abs(a.x-b.x), Math.abs(a.y-b.y)) / 20
    : Math.hypot(a.x-b.x, a.y-b.y) / 20 });
  f.recipient.getCenterPoint = (point = f.recipient) => ({ x: point.x + 50, y: point.y + 50, elevation: point.elevation });
  f.recipient.getSnappedPosition = point => ({ ...point });
  return (x, y, options = {}) => {
    const obstacle = { actor: { type: "npc" }, x, y, elevation: 0, level: "ground", depth: 1, ...options,
      getOccupiedGridSpaceOffsets: () => [], getSize: () => options.size ?? { width: 100, height: 100 } };
    f.scene.tokens.push(obstacle); return obstacle;
  };
}
for (const mode of ["square", "hex", "gridless"]) {
  const f = await prisonFixture(); const block = returnGrid(f, mode);
  const original = { scene: f.scene.uuid, x: 200, y: 200, elevation: 0, level: "ground", hidden: false };
  assert.deepEqual(nearestSoulPrisonSpace(f.recipient, original), original, "exact unoccupied original position wins before snapping");
  block(200, 200);
  const next = nearestSoulPrisonSpace(f.recipient, original); assert.ok(next);
  assert.equal(Math.hypot(next.x-original.x, next.y-original.y), 100, `${mode}: nearest free adjacent location`);
  assert.equal(next.level, "ground"); assert.equal(next.elevation, 0);
  block(next.x, next.y, { elevation: 20 });
  assert.deepEqual(nearestSoulPrisonSpace(f.recipient, original), next, "obstacle at another elevation does not block the return");
}
{
  const f = await prisonFixture(); const block = returnGrid(f); block(0, 0);
  const original = { x: 0, y: 0, elevation: 0, level: "ground" }, point = nearestSoulPrisonSpace(f.recipient, original);
  assert.equal(point.x, 100); assert.equal(point.y, 0, "nearest search stays entirely inside scene boundaries");
  f.recipient.getSize = () => ({ width: 200, height: 200 });
  const large = nearestSoulPrisonSpace(f.recipient, original); assert.ok(large.x + 200 <= 600 && large.y + 200 <= 500);
  for (let y = 0; y < 500; y += 100) for (let x = 0; x < 600; x += 100) block(x, y);
  assert.equal(nearestSoulPrisonSpace(f.recipient, original), null, "no free placement for the full footprint leaves return unresolved");
}
{
  const f = await prisonFixture(); const block = returnGrid(f); await f.confirm(); const id = f.effect.id;
  await releaseSoulPrison(f.effect, "save"); const request = f.target.flags.spikependium.soulPrisonReturns[id];
  request.return.x = request.return.y = 200; Object.assign(f.recipient, { x: 0, y: 0 }); block(200, 200);
  let moves = 0;
  f.recipient.move = async point => { moves++; Object.assign(f.recipient, point); throw Error("nearest move after arrival"); };
  await assert.rejects(() => returnSoulPrisonToken(f.target, id));
  const chosen = f.target.flags.spikependium.soulPrisonReturns[id].destination;
  assert.equal(Math.hypot(chosen.x-200, chosen.y-200), 100);
  assert.equal(await returnSoulPrisonToken(f.target, id), true, "resume recognizes arrival at the persisted alternative destination");
  assert.equal(moves, 1);
}
console.log("Soul Prison nearest return: square/hex/gridless candidates, native distance, footprint/bounds, elevation and persisted destination recovery passed.");

function defenseFixture({ total = 10, accept = true, cancelSave = false, cancelUse = false } = {}) {
  const f = monsterCastFixture("performer-defense", total, "actor:mm25:performer-legend");
  const users = list([game.user]); users.activeGM = game.user; game.users = users; game.combat = null;
  game.messages = list(game.messages);
  globalThis.Hooks = { call: () => true, callAll() {} };
  const state = { prompts: 0, payments: 0, saves: 0, writes: [] };
  f.source.token = f.spirit;
  for (const actor of [f.source, f.target]) actor.setFlag = async (module, key, value) => set(actor.flags, `${module}.${key}`, value);
  f.source.system.attributes.hp.temp = 4; f.source.system.attributes.hp.tempmax = 0;
  f.source.system.attributes.hp.damage = 0; f.source.system._source = { attributes: { hp: structuredClone(f.source.system.attributes.hp) } };
  f.source.changeHasEffect = () => false; f.source.calculateDamage = (d, o) => nativeCalculateDamage.call(f.source, d, o);
  const attackActivity = { uuid: "Actor.target.Item.weapon.Activity.attack", name: "Attack", actor: f.target };
  const attack = { id: `defenseAttack${serial++}`, type: "attack", isOwner: true, author: game.user,
    flags: { spikependium: { guardianAttack: { time: game.time.worldTime, turn: null } } }, rolls: [new D20(25)],
    system: { targets: [{ actor: f.source.uuid, token: f.spirit.uuid, ac: 20 }] },
    getAssociatedActor: () => f.target, getAssociatedToken: () => f.recipient, getAssociatedActivity: () => attackActivity,
    async setFlag(module, key, value) { set(this.flags, `${module}.${key}`, value); } };
  attack.uuid = `ChatMessage.${attack.id}`; world.set(attack.uuid, attack); game.messages.push(attack);
  f.saves.length = 0;
  foundry.applications.api.DialogV2.confirm = async () => { state.prompts++; return accept; };
  foundry.applications.api.DialogV2.wait = async () => accept ? attack.id : null;
  f.activity.use = async (config, dialog, message) => defensiveCharmUse.call(f.activity, async (cfg, dlg, payload) => {
    if (cancelUse) return;
    let updates = prepareReactionUpdates(f.activity, cfg, { actor: {}, item: [] });
    updates = prepareDefenseUpdates(f.activity, cfg, updates); assert.notEqual(updates, false);
    state.writes.push(structuredClone(updates.actor));
    await f.source.update(updates.actor); state.payments++;
    payload.data.system ??= {};
    recordReactionConsumption(f.activity, cfg, payload); recordDefenseConsumption(f.activity, cfg, payload);
    recordMonsterEffect(f.activity, payload); recordDefenseUsage(f.activity, payload); recordReaction(f.activity, payload);
    f.origin.flags = payload.data.flags; f.origin.system = payload.data.system;
    f.origin.whisper = payload.data.whisper ?? []; f.origin.blind = payload.data.blind ?? false;
    state.payload = payload; world.set(f.origin.uuid, f.origin); game.messages.push(f.origin);
    return { message: f.origin };
  }, config, dialog, message);
  f.target.rollSavingThrow = async (config, dialog, message) => {
    assert.equal(config.ability, "wis"); assert.equal(config.target, 17); assert.equal(dialog.configure, false);
    state.saves++; state.saveMessage = message;
    if (cancelSave) return;
    f.saved.rolls[0].total = total; f.saved.rolls[0].isFailure = total < 17;
    f.saved.uuid = `ChatMessage.defenseSave${serial++}`; f.saved.system.forceSuccess = false;
    f.saves.push(f.saved); return f.saved.rolls;
  };
  const damage = { type: "damage", flags: { spikependium: { attackSource: { message: attack.uuid, signature: attackSignature(attack) } } },
    getAssociatedActivity: () => attackActivity };
  const apply = () => defensiveCharmDamage.call(f.source, (d, o) => nativeApplyDamage.call(f.source, d, o),
    [{ value: 11, type: "fire" }], { originatingMessage: damage });
  return { ...f, attack, attackActivity, state, damage, apply };
}
{
  const f = defenseFixture(); assert.equal(attackHitTargets(f.attack).length, 0, "on-hit effects wait for the reaction");
  assert.equal(attackHitTargets(f.attack, { ignoreDefense: true }).length, 1, "Guardian can resolve before the defensive reaction");
  await chooseDefensiveCharm(f.attack);
  assert.equal(f.state.payments, 1); assert.equal(f.state.saves, 1); assert.equal(f.target.effects.length, 1);
  const expense = f.state.writes[0]; assert.ok(expense["flags.spikependium.reactionId"]);
  assert.equal(expense[`flags.spikependium.defensiveCharms.${f.attack.id}`].active, 1, "binding and reaction cost are saved atomically");
  assert.equal(defensiveCharmOutcome(f.attack, f.attack.system.targets[0]), "miss");
  assert.equal(guardianEvaluatedTargets.call({ parent: f.attack }, () => nativeEvaluatedTargets.call({ parent: f.attack, targets: f.attack.system.targets }))[0].isMiss, true);
  assert.equal(attackHitTargets(f.attack).length, 0); assert.equal(attackHitTargets(f.attack, { ignoreDefense: true }).length, 0);
  await f.apply(); assert.equal(f.source.system.attributes.hp.value, 162); assert.equal(f.source.system.attributes.hp.temp, 4);
  await captureAttackDamage.call(f.attackActivity, async (config, dialog, message) => assert.deepEqual(message.data.system.targets, []), {}, {}, { data: { system: { origin: f.attack.id } } });
  await chooseDefensiveCharm(f.attack); assert.equal(f.state.payments, 1); assert.equal(f.state.saves, 1);
  await f.target.effects[0].delete(); await chooseDefensiveCharm(f.attack);
  assert.equal(f.target.effects.length, 0, "expired charm does not return from an old card");
  assert.equal(defensiveCharmOutcome(f.attack, f.attack.system.targets[0]), "miss", "ending charm does not undo the original miss");
  await nativeRefund.call(f.activity, f.origin.system.deltas, updates => f.source.update(updates.actor));
  await chooseDefensiveCharm(f.attack);
  assert.equal(defensiveCharmEnabled(f.origin), false); assert.equal(defensiveCharmOutcome(f.attack, f.attack.system.targets[0]), "hit");
  await f.apply(); assert.equal(f.source.system.attributes.hp.value, 155); assert.equal(f.source.system.attributes.hp.temp, 0);
}
for (const options of [{ total: 20 }, { accept: false }]) {
  const f = defenseFixture(options); await f.apply();
  assert.equal(f.source.system.attributes.hp.value, 155); assert.equal(f.source.system.attributes.hp.temp, 0);
  assert.equal(f.target.effects.length, 0); assert.equal(attackHitTargets(f.attack).length, 1);
  assert.equal(f.state.payments, options.accept === false ? 0 : 1);
  await chooseDefensiveCharm(f.attack); assert.equal(f.state.prompts, 1, "resolved choice is not offered twice");
}
{
  const f = defenseFixture(); f.target.system.traits.ci.value.add("charmed"); await chooseDefensiveCharm(f.attack);
  assert.equal(f.target.effects.length, 0); assert.equal(defensiveCharmOutcome(f.attack, f.attack.system.targets[0]), "miss",
    "condition immunity prevents charm, not the separate attack cancellation after a failed save");
}
{
  const f = defenseFixture(); await chooseDefensiveCharm(f.attack); assert.equal(f.target.effects.length, 1);
  f.saved.system.resisted = true; Object.defineProperty(f.saved.system, "forceSuccess", { get() { return nativeSaveForceSuccess.call(this); } });
  await chooseDefensiveCharm(f.attack); assert.equal(f.target.effects.length, 0);
  assert.equal(defensiveCharmOutcome(f.attack, f.attack.system.targets[0]), "hit", "native Legendary Resistance restores the attack result");
}
{
  const f = defenseFixture(); await chooseDefensiveCharm(f.attack);
  await nativeRefund.call(f.activity, f.origin.system.deltas, updates => f.source.update(updates.actor));
  await chooseDefensiveCharm(f.attack); assert.equal(f.target.effects.length, 0, "refund removes the associated charm");
  await syncMonsterEffects(f.saved); assert.equal(f.target.effects.length, 0, "old saves cannot recreate a refunded charm");
}
{
  const f = defenseFixture({ cancelSave: true }); await f.apply();
  assert.equal(f.source.system.attributes.hp.value, 162); assert.equal(f.state.payments, 1); assert.equal(f.state.saves, 1);
  await f.apply(); assert.equal(f.state.saves, 1, "an interrupted save is not automatically rerolled");
  assert.equal(defensiveCharmWaiting(f.attack, f.attack.system.targets[0]), true);
  f.saved.uuid = "ChatMessage.manualSave"; f.saves.push(f.saved); await chooseDefensiveCharm(f.attack);
  assert.equal(defensiveCharmOutcome(f.attack, f.attack.system.targets[0]), "miss", "a later explicit native save completes the pending reaction");
}
{
  const f = defenseFixture(); await f.activity.use({}); assert.equal(f.state.payments, 1);
  assert.equal(f.origin.flags.spikependium.monsterCast.targets[0].token, f.recipient.uuid, "sheet use targets the original attacker");
  await f.apply(); assert.equal(f.state.payments, 1); assert.equal(f.source.system.attributes.hp.value, 162);
}
for (const reason of ["miss", "multiple-rolls", "unknown-ac", "duplicate-actor", "untrusted-author", "deleted-attack", "stale-time"]) {
  const f = defenseFixture();
  if (reason === "miss") f.attack.rolls[0].total = 1;
  if (reason === "multiple-rolls") f.attack.rolls.push(new D20());
  if (reason === "unknown-ac") f.attack.system.targets[0].ac = null;
  if (reason === "duplicate-actor") f.attack.system.targets.push({ ...f.attack.system.targets[0] });
  if (reason === "untrusted-author") { f.attack.author = { id: "stranger" }; f.target.testUserPermission = user => user.id === "gm"; }
  if (reason === "deleted-attack") world.delete(f.attack.uuid);
  if (reason === "stale-time") game.time.worldTime++;
  await chooseDefensiveCharm(f.attack); assert.equal(f.state.payments, 0, reason); assert.equal(f.state.prompts, 0, reason);
}
for (const reason of ["hidden", "blind", "whisper"]) {
  const f = defenseFixture(); if (reason === "hidden") f.spirit.hidden = true;
  if (reason === "blind") f.attack.blind = true;
  if (reason === "whisper") f.attack.whisper = ["gm", "owner"];
  await chooseDefensiveCharm(f.attack); assert.equal(f.state.payload.rollMode, "gm");
  assert.equal(f.state.saveMessage.rollMode, "gm");
  assert.deepEqual(f.origin.whisper, reason === "whisper" ? ["gm", "owner"] : ["gm"]);
}
for (const reason of ["wrong-dc", "unauthorized-save", "deleted-save", "deleted-usage"]) {
  const f = defenseFixture(); await chooseDefensiveCharm(f.attack);
  if (reason === "wrong-dc") f.saved.rolls[0].options.target = 16;
  if (reason === "unauthorized-save") { f.saved.author = { id: "stranger" }; f.target.testUserPermission = user => user.id === "gm"; }
  if (reason === "deleted-save") f.saves.length = 0;
  if (reason === "deleted-usage") game.messages.splice(game.messages.indexOf(f.origin), 1);
  assert.equal(defensiveCharmOutcome(f.attack, f.attack.system.targets[0]), "pending", reason);
  await f.apply(); assert.equal(f.state.saves, 1, reason); assert.equal(f.state.payments, 1, reason);
  assert.equal(f.source.system.attributes.hp.value, 162, reason);
}
{
  const f = defenseFixture(); await chooseDefensiveCharm(f.attack);
  delete f.source.flags.spikependium.reactionCasts;
  assert.equal(defensiveCharmOutcome(f.attack, f.attack.system.targets[0]), "miss", "a later reaction's cleanup does not undo the old miss");
  await nativeRefund.call(f.activity, f.origin.system.deltas, updates => f.source.update(updates.actor));
  assert.equal(defensiveCharmOutcome(f.attack, f.attack.system.targets[0]), "hit", "old-card refund restores this hit without touching a later reaction");
}
{
  const f = defenseFixture(); await chooseDefensiveCharm(f.attack);
  world.delete(f.attack.uuid); game.messages.splice(game.messages.indexOf(f.attack), 1);
  await syncMonsterEffects(f.saved); assert.equal(f.target.effects.length, 1, "deleting the original attack card does not end the native charm");
}
{
  const f = defenseFixture(); let release;
  const decision = new Promise(resolve => { release = resolve; });
  foundry.applications.api.DialogV2.confirm = async () => { f.state.prompts++; return decision; };
  const first = chooseDefensiveCharm(f.attack); await Promise.resolve(); await Promise.resolve();
  await chooseDefensiveCharm(f.attack); release(true); await first;
  assert.equal(f.state.prompts, 1); assert.equal(f.state.payments, 1); assert.equal(f.state.saves, 1);
}
console.log("Defensive Charm: native hit/miss and damage cancellation, effect immunity/expiry, reaction expense/refund, Legendary Resistance, privacy, sheet/automatic use and interrupted-save recovery passed.");

for (const total of [10, 25]) {
  const f = monsterCastFixture("archhag-wave", total, "actor:mm25:archhag");
  assert.equal(reactionAvailable(f.target), true);
  await syncMonsterEffects(f.saved); assert.equal(f.target.effects.length, 1, "wave curses on failed and successful saves");
  const curse = f.target.effects[0]; assert.ok(curse.statuses.has("cursed")); assert.equal(curse.duration.expiry, "sourceEnd");
  assert.equal(curse.flags.spikependium.noReactions, true); assert.equal(reactionAvailable(f.target), false);
  await syncMonsterEffects(f.saved); assert.equal(f.target.effects.length, 1, "repeated save event cannot duplicate the curse");
  curse.active = false; assert.equal(reactionAvailable(f.target), true, "disabled or suppressed curse does not prohibit reactions");
  await curse.delete(); await syncMonsterEffects(f.saved); assert.equal(f.target.effects.length, 0, "old save does not recreate an ended curse");
}
for (const size of ["tiny", "med", "lg", "huge", "grg"]) for (const immune of [false, true]) {
  const f = monsterCastFixture("archhag-wave", 10, "actor:mm25:archhag");
  f.target.system.traits.size = size; if (immune) f.target.system.traits.ci.value.add("prone");
  const attack = hit(f, "archhag-spectral-claws");
  await applyArcanaSpiritHits(attack.message);
  const expected = !immune && !["huge", "grg"].includes(size) ? 1 : 0;
  assert.equal(f.target.effects.length, expected, `spectral claw size ${size}, immunity ${immune}`);
  if (expected) assert.ok(f.target.effects[0].statuses.has("prone"));
  await applyArcanaSpiritHits(attack.message); assert.equal(f.target.effects.length, expected, "duplicate attack event cannot apply prone twice");
}
console.log("Archhag wave/claws: native effect application, both save outcomes, no-reaction state, native duration, size/immunity and duplicate/old-card guards passed.");

function npcHitFixture(key) {
  const f = fixture(), previous = f.source;
  f.source = actorDoc(read("creatures").find(d => d.flags?.spikependium?.key === key));
  f.spirit.actor = f.source; f.source.token = f.spirit; world.set(f.source.uuid, f.source);
  game.actors.splice(game.actors.indexOf(previous), 1, f.source);
  for (const item of f.source.items) {
    world.set(item.uuid, item);
    for (const activity of item.system.activities) { world.set(activity.uuid, activity); activity.applicableEffects = item.effects; }
  }
  return f;
}
for (const size of ["tiny", "sm", "med", "lg", "huge"]) {
  const f = npcHitFixture("actor:mm25:bugbear-warrior"); f.target.system.traits.size = size;
  const pending = hit(f, "bugbear-warrior-grab");
  await applyArcanaSpiritHits(pending.message);
  const expected = ["tiny", "sm", "med"].includes(size) ? 1 : 0;
  assert.equal(f.target.effects.length, expected);
  await applyArcanaSpiritHits(pending.message); assert.equal(f.target.effects.length, expected);
  if (expected) {
    const grip = f.target.effects[0]; assert.equal(grip.flags.spikependium.arcanaSpiritGrab.dc, 12);
    assert.equal(grip.flags.spikependium.arcanaSpiritGrab.reach, 10); assert.ok(grip.statuses.has("grappled"));
    const attack = f.source.items.find(i => i.system.identifier === "bugbear-warrior-hammer").system.activities[0];
    const config = { subject: attack, rolls: [{ options: { disadvantage: true } }] };
    prepareMonsterAttack(config, {}, { data: { system: { targets: pending.message.system.targets } } });
    assert.equal(config.rolls[0].options.advantage, true, "the hammer uses a grapple caused by another weapon");
    grip.flags.spikependium.arcanaSpiritGrab.source = "Scene.other.Token.other";
    const foreign = { subject: attack, rolls: [{ options: {} }] };
    prepareMonsterAttack(foreign, {}, { data: { system: { targets: pending.message.system.targets } } });
    assert.equal(foreign.rolls[0].options.advantage, undefined);
  }
}
for (const immune of [false, true]) for (const poisoned of [false, true]) {
  const f = npcHitFixture("actor:mm25:assassin");
  if (immune) f.target.system.traits.ci.value.add("poisoned"); if (poisoned) f.target.statuses.add("poisoned");
  const pending = hit(f, "assassin-shortsword"); await applyArcanaSpiritHits(pending.message);
  assert.equal(f.target.effects.length, immune ? 0 : 1, "the sword can poison an already poisoned target but respects immunity");
  if (!immune) { assert.ok(f.target.effects[0].statuses.has("poisoned")); assert.equal(f.target.effects[0].duration.expiry, "sourceStart"); }
  await applyArcanaSpiritHits(pending.message); assert.equal(f.target.effects.length, immune ? 0 : 1);
  const crossbow = hit(f, "assassin-light-crossbow"); await applyArcanaSpiritHits(crossbow.message);
  assert.equal(f.target.effects.length, immune ? 0 : 1, "the crossbow adds no poisoned condition");
}
for (const total of [10, 20]) for (const size of ["med", "lg"]) {
  const f = monsterCastFixture("bugbear-grab", total, "actor:mm25:bugbear-stalker");
  f.target.system.traits.size = size; await syncMonsterEffects(f.saved);
  assert.equal(f.target.effects.length, total < 13 && size === "med" ? 1 : 0);
  if (f.target.effects.length) {
    const grip = f.target.effects[0]; assert.equal(grip.flags.spikependium.arcanaSpiritGrab.source, f.spirit.uuid);
    assert.equal(grip.flags.spikependium.arcanaSpiritGrab.dc, 13); assert.equal(grip.flags.spikependium.arcanaSpiritGrab.reach, 10);
    assert.ok(escapeChatButtons.call(f.activity, () => []).some(b => b.action === "arcanaEscape"));
  }
  f.activity.getUsageToken = () => f.spirit; game.user.targets = new Set([f.recipient]);
  const message = { data: { system: { targets: [{ actor: f.target.uuid, token: f.recipient.uuid }] } } };
  assert.equal(canUseBugbearGrab(f.activity, { spikependium: { bugbearVisible: true } }, message), size === "med" ? undefined : false);
  assert.equal(canUseBugbearGrab(f.activity, {}, message), false);
}
console.log("Assassin/Bugbears: native confirmed-hit poison, immunity/expiry, medium-size grapples, own-grapple advantage, quick-grab saves/visibility and escape buttons passed.");
{
  const f = monsterCastFixture("bugbear-grab", 10, "actor:mm25:bugbear-stalker");
  f.source.system.attributes.hp.value = 0; await syncMonsterEffects(f.saved); assert.equal(f.target.effects.length, 0);
  f.source.system.attributes.hp.value = 65; await syncMonsterEffects(f.saved);
  assert.equal(f.target.effects.length, 0, "an invalid finished grab is not applied from an old card after revival");
}
