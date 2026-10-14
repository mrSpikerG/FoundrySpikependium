import assert from "node:assert/strict";
import fs from "node:fs";
import { canUseArcanaSpell, recordArcanaCast, syncArcanaCast, syncArcanaRepeat, cureIronBody,
  guardIronExhaustion, arcanaEndTurn, resumeArcanaSpells, registerArcanaMaterials, consumeArcanaMaterial, arcanaSpellSuppression, canConsumeArcanaSpell } from "../scripts/arcana-spells.mjs";
import { observeCatnap, prepareCatnapRest, finishCatnap, canUseArcanaShake, awakeningChatButtons, awakeningChatAction, finishArcanaShake } from "../scripts/arcana-awakening.mjs";
import { arcanaStartTurn, resumeArcanaTicks, recordArcanaTickDamage } from "../scripts/arcana-periodic.mjs";
import { endEffectsOnDamage } from "../scripts/effects.mjs";
import { prepareEffectData } from "./data/dnd5e-effect-application.mjs";
import { NativeAdvantageModeField, nativeEffectDuration, nativeAppliedEffectChanges, nativeIncreaseExhaustion, nativePrepareMovement, setMovementContext,
  nativeRest, nativePerformBulkUpdate, nativeRestResourceRecovery, nativeRestSpellRecovery, nativeRestItemRecovery,
  nativeD20ConfigureModifiers } from "./data/dnd5e-arcana-native.mjs";
import { prepareAmityCheck, buildAmityCheck, finalizeAmityCheck } from "../scripts/arcana-amity.mjs";
import { prepareEvasionSave, buildEvasionSave, finalizeEvasionSave, evasionAuraApplies } from "../scripts/arcana-evasion.mjs";
import { monsterEvasionDamage } from "../scripts/monster-evasion.mjs";
import { nativeCalculateDamage, nativeApplyDamage } from "./data/dnd5e-guardian-native.mjs";
import { getDeltas, nativeRefund } from "./data/dnd5e-reaction-native.mjs";
import { ConsumptionError, nativeUsageUpdates } from "./data/dnd5e-monsters-native.mjs";
import { restorationPlan, prepareChoiceDialog, applyChoiceConsumption, refundResearch } from "../scripts/choices.mjs";
import { canUseArcanaStage, arcanaStageScaling } from "../scripts/arcana-stages.mjs";

const documents = fs.readdirSync("packs/_source/spells").filter(name => name.startsWith("spell-au-"))
  .map(name => JSON.parse(fs.readFileSync(`packs/_source/spells/${name}`, "utf8"))).filter(doc => doc.effects[0]?.flags.spikependium?.arcanaSpell);
assert.equal(documents.length, 14);
const byKind = Object.fromEntries(documents.map(doc => [doc.effects[0].flags.spikependium.arcanaSpell, doc]));
for (const [kind, level, school, page, duration, cost] of [
  ["iron-body", 8, "trs", 40, ["hour", "1"], 250], ["invulnerability", 9, "abj", 43, ["minute", "10"], 500],
  ["instill-doubt", 3, "enc", 43, ["minute", "1"], 0], ["fractured-perception", 7, "div", 44, ["minute", "1"], 0]
  ,["lightning-ring",8,"evo",43,["minute","10"],0],["grave-ground",5,"nec",42,["minute","1"],0]
]) {
  const doc = byKind[kind], activity = Object.values(doc.system.activities)[0];
  assert.equal(doc.system.level, level); assert.equal(doc.system.school, school);
  assert.equal(doc.system.source.book, "AU"); assert.equal(doc.system.source.page, String(page));
  assert.deepEqual([doc.system.duration.units, doc.system.duration.value], duration);
  assert.ok(doc.system.properties.includes("concentration")); assert.equal(doc.system.materials.cost, cost);
  assert.equal(doc.system.materials.consumed, cost > 0); assert.equal(activity.consumption.spellSlot, true);
  assert.equal(doc.effects[0].system.magical, true); assert.equal(doc.effects[0].transfer, false);
  assert.equal(activity.effects[0]._id, doc.effects[0]._id);
  if (activity.type === "save") assert.equal(activity.effects[0].onSave, false);
}
assert.equal(byKind["iron-body"].system.range.units, "touch");
assert.equal(byKind.invulnerability.system.range.units, "self");
assert.equal(Object.values(byKind["fractured-perception"].system.activities)[0].damage.onSave, "half");
assert.equal(Object.values(byKind["fractured-perception"].system.activities)[0].damage.parts[0].number, 12);
assert.ok(byKind["fractured-perception"].system.description.value.includes("[[/damage 12d10 type=psychic]]"));

const get = (obj, path) => path?.split(".").reduce((value, key) => value?.[key], obj);
const set = (obj, path, value) => { const keys = path.split("."); for (const key of keys.slice(0, -1)) obj = obj[key] ??= {};
  obj[keys.at(-1)] = structuredClone(value); };
const merge = (a, b) => { for (const [key, value] of Object.entries(b)) {
  if (value && Object.getPrototypeOf(value) === Object.prototype) merge(a[key] ??= {}, value);
  else a[key] = structuredClone(value);
} return a; };
const flatten = (obj, prefix = "", out = {}) => { for (const [key, value] of Object.entries(obj)) {
  const path = prefix ? `${prefix}.${key}` : key;
  if (value && Object.getPrototypeOf(value) === Object.prototype) flatten(value, path, out); else out[path] = value;
} return out; };
const list = array => Object.assign(array, { get(id) { return this.find(value => value.id === id); } });
let world, serial = 0, duringTray, duringRepeat, savedTotal, repeatCalls, failRepeat, notices, failBatch, cancelRest, restCalls;
globalThis.fromUuidSync = uuid => world.get(uuid);
globalThis.foundry = { utils: { getProperty: get, setProperty: set, mergeObject: merge, deepClone: structuredClone,
  flattenObject: flatten, getType: value => value && typeof value === "object" ? "Object" : typeof value,
  isEmpty: value => !value || !Object.keys(value).length, escapeHTML: value => value,
  randomID: () => `event${serial++}` } };
globalThis.ui = { notifications: { warn() { notices++; }, error() { notices++; } } };
globalThis.Hooks = { call(name, ...args) {
  if (name === "dnd5e.preApplyDamage") return recordArcanaTickDamage(...args);
  if (name === "dnd5e.preRestCompleted") prepareCatnapRest(...args);
  return true;
}, callAll() {} };
Number.isNumeric = value => typeof value === "number"; Math.clamp = (n, min, max) => Math.min(max, Math.max(min, n));
class D20 { constructor(total, target) { this.total = total; this.options = { target }; this._evaluated = true; }
  get isFailure() { return this.total < this.options.target; } }
class Damage { constructor(total) { this.total = total; this.options = { type: "poison", isCritical: false }; this._evaluated = true; } }
class Effect {
  constructor(data, parent) { Object.assign(this, structuredClone(data)); this.id = data._id; this.statuses = new Set(data.statuses ?? []);
    this.actor = parent; this._stats ??= {}; this.flags ??= {}; this.system ??= {}; this.duration ??= {}; this.parent = parent;
    if (parent) { this.uuid = `${parent.uuid}.ActiveEffect.${this.id}`; world.set(this.uuid, this); } }
  get active() { return !this.disabled && !this.duration.expired && !this.isSuppressed && !arcanaSpellSuppression.call(this, () => false); }
  toObject() { return { _id: this.id, name: this.name, flags: structuredClone(this.flags), type: this.type,
    system: structuredClone(this.system), duration: structuredClone(this.duration), statuses: [...this.statuses], _stats: structuredClone(this._stats) }; }
  static forApplication(changes) { return changes; }
  static getEffectStart() { return { time: 0, round: 1, turn: 0, combat: "combat" }; }
  static expirySupportsDuration() { return true; }
  static async fromStatusEffect(type) { return new Effect({ type: "condition", system: { type, level: 1 }, statuses: [type], duration: {} }); }
  getFlag(module, key) { return get(this.flags, `${module}.${key}`); }
  async setFlag(module, path, value) { set(this.flags, `${module}.${path}`, value); }
  async update(data) { if (guardIronExhaustion(this, data) === false) return this;
    for (const [path, value] of Object.entries(data)) { if (path === "statuses") this.statuses = new Set(value); else set(this, path, value); } return this; }
  async delete() { this.actor.effects.splice(this.actor.effects.indexOf(this), 1); world.delete(this.uuid); }
}
globalThis.ActiveEffect = { implementation: Effect };
globalThis.ChatMessage = { getSpeaker: ({ actor, token }) => ({ actor: actor.id, token: token?.id, scene: token?.parent?.id }) };
globalThis.CONFIG = { Dice: { D20Roll: D20, DamageRoll: Damage }, DND5E: { activityConsumptionTypes: {}, healingTypes: { healing: {}, temphp: {} },
  damageTypes: Object.fromEntries(["fire", "poison", "psychic", "bludgeoning", "piercing", "slashing"].map(type => [type, {}])) } };
globalThis.dnd5e = { dataModels: { activity: { ConsumptionError } }, applications: { components: { EffectApplicationElement: class {
  async _prepareEffectData(effect, actor) {
    if (duringTray) { const callback = duringTray; duringTray = null; await callback(); }
    return prepareEffectData.call(this, effect, actor, key => key);
  }
} } } };
function actor(id) {
  const value = { id, uuid: `Actor.${id}`, isOwner: true, effects: list([]), flags: {},
    system: { isCreature: true, attributes: { exhaustion: 2, hp: { value: 40, temp: 4, tempmax: 0, max: 40, effectiveMax: 40,
      get damage() { return this.max - this.value; } } }, _source: { attributes: { hp: { tempmax: 0 } } },
      traits: { ci: { value: new Set() }, di: { value: new Set() }, dr: { value: new Set() }, dv: { value: new Set() }, dm: {} } },
    testUserPermission: user => !!user?.isGM || user?.id === "player", getRollData: () => ({}), changeIsIgnored: () => false,
    changeHasEffect(type, damage) { return this.system.traits[{ immunity: "di", resistance: "dr", vulnerability: "dv" }[type]]?.value.has(damage.type)
      || this.system.traits[{ immunity: "di", resistance: "dr", vulnerability: "dv" }[type]]?.value.has("ALL"); },
    calculateDamage: nativeCalculateDamage, applyDamage: nativeApplyDamage,
    async update(data) { for (const [path, value] of Object.entries(data)) set(this, path, value); return this; },
    async createEmbeddedDocuments(type, data) { const effects = data.map(d => new Effect({ ...d, _id: `created${serial++}` }, this)); this.effects.push(...effects); return effects; },
    async updateEmbeddedDocuments(type, data) { const out = []; for (const d of data) { const e = this.effects.get(d._id);
      for (const [key, v] of Object.entries(d)) if (key !== "_id") set(e, key, v); out.push(e); } return out; },
    async deleteEmbeddedDocuments(type, ids) { for (const e of [...this.effects]) if (ids.includes(e.id)) await e.delete(); },
    async setFlag(module, path, val) { set(this.flags, `${module}.${path}`, val); },
    performBulkUpdate: nativePerformBulkUpdate, _getRestResourceRecovery: nativeRestResourceRecovery, _getRestSpellRecovery: nativeRestSpellRecovery,
    _getRestItemUsesRecovery: nativeRestItemRecovery, _getRestHitDiceRecovery() {}, _getRestHitPointRecovery() {},
    async _displayRestResultMessage() {}, clone() { return { hasConditionEffect: () => false }; },
    async shortRest(config) {
      assert.equal(config.duration, 0); assert.equal(config.advanceTime, false); restCalls.push(config);
      if (cancelRest) return;
      return nativeRest.call(this, { ...config, type: "short" });
    }, items: list([]), statuses: new Set(),
    async rollSavingThrow(config, dialog, message) {
      assert.deepEqual(config, { ability: config.ability, target: 16 }); assert.equal(dialog.configure, false);
      repeatCalls.push({ config, dialog, message }); if (failRepeat) throw Error("save failed");
      const card = makeMessage({ ...message.data, type: "save", system: { ...message.data.system, ability: config.ability },
        author: game.user, rolls: [new D20(savedTotal, config.target)], actor: this,
        token: world.get(message.data.flags.spikependium.arcanaRepeat.token) });
      if (duringRepeat) { const callback = duringRepeat; duringRepeat = null; await callback(card); }
      await syncArcanaRepeat(card); return card.rolls;
    }
  }; world.set(value.uuid, value); return value;
}
function makeMessage(data) {
  const id = `message${serial++}`;
  const card = { id, uuid: `ChatMessage.${id}`, timestamp: serial, flags: {}, whisper: [], rolls: [], ...data,
    getAssociatedActor() { return this.actor; }, getAssociatedItem() { return this.activity?.item; },
    getAssociatedActivity() { return this.activity; }, getAssociatedToken() { return this.token; },
    getOriginatingMessage() { return game.messages.get(this.system.origin) ?? this; },
    getAssociatedRolls(type) { return game.messages.filter(m => m.type === type && m.system.origin === this.id); },
    async setFlag(module, path, value) { set(this.flags, `${module}.${path}`, value); }
  }; world.set(card.uuid, card); game.messages.push(card); return card;
}
function setup(kind = "instill-doubt") {
  world = new Map(); serial = 0; savedTotal = 8; repeatCalls = []; failRepeat = false; duringTray = null; duringRepeat = null; notices = 0;
  failBatch = false; cancelRest = false; restCalls = [];
  const player = { id: "player", active: true }, gm = { id: "gm", isGM: true, isActiveGM: true };
  globalThis.game = { user: gm, users: { activeGM: gm }, time: { worldTime: 0 }, actors: [], scenes: [], messages: list([]), i18n: { localize: key => key } };
  const caster = actor("caster"), target = actor("target"), doc = structuredClone(byKind[kind]);
  dnd5e.utils = { staticID: () => "exhaustionStatus0", convertLength: value => value };
  dnd5e.settings = { calendarConfig: { manualRecovery: false } };
  CONFIG.DND5E.restTypes = { short: { recoverPeriods: ["sr"], recoverSpellSlotTypes: new Set(["pact"]), expiryEvents: [] }, long: { recoverPeriods: ["lr"], expiryEvents: [] } };
  foundry.documents = { async modifyBatch(operations) {
    if (failBatch) throw Error("batch cancelled");
    for (const op of operations) if (op.documentName === "ActiveEffect") {
      for (const data of op.updates ?? op.data ?? []) {
        const e = op.action === "create" ? { ...data, actor: op.parent } : op.parent.effects.get(data._id);
        if (guardIronExhaustion(e, data) === false) return [];
      }
    }
    for (const op of operations) {
      const parent = op.parent;
      if (op.documentName === "Actor") { for (const d of op.updates) await world.get(`Actor.${d._id}`).update(d); }
      else if (op.documentName === "ChatMessage") for (const d of op.updates) {
        const message = game.messages.get(d._id); for (const [path, value] of Object.entries(d)) if (path !== "_id") set(message, path, value);
      }
      else if (op.documentName === "ActiveEffect") {
        if (op.action === "create") for (const d of op.data) parent.effects.push(new Effect(d, parent));
        else if (op.action === "delete") await parent.deleteEmbeddedDocuments("ActiveEffect", op.ids);
        else for (const d of op.updates) await parent.effects.get(d._id).update(d);
      } else if (op.documentName === "Item") for (const d of op.updates ?? []) {
        const item = parent.items.get(d._id); for (const [path, value] of Object.entries(d)) if (path !== "_id") set(item, path, value);
      }
    }
    return [];
  } };
  const scene = { id: "scene", tokens: [] }; game.scenes.push(scene); game.actors.push(caster, target);
  const token = { id: "token", uuid: "Scene.scene.Token.token", actor: target, parent: scene, hidden: false, name: "Target", texture: { src: "icon" } };
  world.set(token.uuid, token); scene.tokens.push(token); game.user.targets = new Set([token]);
  const item = { type: "spell", flags: doc.flags, uuid: "Actor.caster.Item.spell", name: doc.name, effects: list([]), system: { activities: [], level: doc.system.level }, toObject: () => structuredClone(doc) };
  const profile = new Effect(doc.effects[0]); profile.uuid = `${item.uuid}.ActiveEffect.${profile.id}`; item.effects.push(profile);
  const activity = { id: "cast", uuid: `${item.uuid}.Activity.cast`, actor: caster, item, applicableEffects: [profile], save: { dc: { value: 16 } },
    effects: [{ _id: profile.id }], getAppliedEffectChanges: nativeAppliedEffectChanges,
    duration: { getEffectData: () => nativeEffectDuration.call({ units: doc.system.duration.units, value: Number(doc.system.duration.value) }) } };
  const concentration = new Effect({ _id: "concentration", system: {}, duration: {}, flags: {} }, caster); caster.effects.push(concentration);
  const config = { data: { system: { targets: [{ actor: target.uuid, token: token.uuid }] } } };
  recordArcanaCast(activity, config);
  const origin = makeMessage({ ...config.data, author: player, type: "usage", actor: caster, activity,
    system: { ...config.data.system, concentration: doc.system.properties.includes("concentration") ? concentration.id : null } });
  const combatant = { id: "turnTarget", actor: target, token };
  const combat = { id: "combat", previous: { round: 1, turn: 0 }, current: { round: 1, turn: 0 } };
  const save = (total = 8, dc = 16, ability = kind === "instill-doubt" ? "wis" : "int", author = player) => makeMessage({
    type: "save", author, actor: target, token, system: { origin: origin.id, ability }, rolls: [new D20(total, dc)] });
  return { caster, target, token, player, gm, activity, origin, concentration, combatant, combat, save };
}

// Native advantage counters cover attacks, checks (including initiative, tools and skills), saves and death saves.
for (const kind of ["instill-doubt", "fractured-perception"]) {
  const model = { _source: {} }, field = new NativeAdvantageModeField();
  for (const c of byKind[kind].effects[0].system.changes) {
    assert.equal(c.type, "add"); const path = c.key.slice(7); set(model, path, 0);
    set(model, path, field._applyChangeAdd(0, Number(c.value), model, { key: path }));
  }
  for (const paths of [["rolls.attack.mode", "rolls.attack.rwak.mode"], ["rolls.ability.check.mode", "attributes.init.roll.mode"],
    ["rolls.ability.check.mode", "rolls.ability.skill.mode"], ["rolls.ability.check.mode", "rolls.ability.tool.mode"],
    ["rolls.ability.save.mode", "abilities.con.save.roll.mode"], ["attributes.death.roll.mode"]]) {
    const result = NativeAdvantageModeField.combineFields(model, paths);
    assert.equal(result.disadvantage, true); assert.equal(result.advantage, false);
  }
  const both = NativeAdvantageModeField.combineFields(model, ["rolls.attack.mode"], { advantages: { count: 1 } });
  assert.equal(both.mode, 0); assert.equal(both.advantage, true); assert.equal(both.disadvantage, true);
}

for (const kind of ["iron-body", "invulnerability"]) {
  const { target, caster, origin, concentration } = setup(kind); await syncArcanaCast(origin);
  const actor = kind === "invulnerability" ? caster : target;
  const effect = actor.effects.find(e => e.flags.spikependium?.arcanaSpell === kind); assert.ok(effect);
  assert.equal(effect.flags.dnd5e.dependentOn, concentration.uuid); assert.equal(effect.system.origin.effect, concentration.uuid);
  assert.deepEqual([effect.duration.units, effect.duration.value], kind === "iron-body" ? ["hours", 1] : ["minutes", 10]);
  for (const change of effect.system.changes) {
    if (change.key.startsWith("system.traits.")) {
      const trait = change.key.split(".")[2]; actor.system.traits[trait] ??= { value: new Set() }; actor.system.traits[trait].value.add(change.value);
    }
  }
  for (const [type, expected] of kind === "invulnerability" ? [["fire", 0], ["psychic", 0]] : [["fire", 5], ["slashing", 5], ["poison", 0], ["psychic", 10]]) {
    assert.equal(nativeCalculateDamage.call(actor, [{ value: 10, type, properties: new Set() }]).amount, expected);
  }
  await syncArcanaCast(origin); assert.equal(actor.effects.filter(e => e.flags.spikependium?.arcanaSpell === kind).length, 1);
  await effect.delete(); await resumeArcanaSpells(); assert.equal(actor.effects.some(e => e.flags.spikependium?.arcanaSpell === kind), false);
}

{
  const { target, origin } = setup("iron-body");
  const a = new Effect({ _id: "poison", type: "condition", system: { type: "poisoned" }, statuses: ["poisoned"] }, target);
  const mixed = new Effect({ _id: "mixed", type: "base", system: { changes: [{ key: "bonus" }] }, statuses: ["paralyzed", "petrified", "blinded"] }, target);
  const exhaustion = new Effect({ _id: "exhaustion", type: "condition", system: { type: "exhaustion", level: 2 }, statuses: ["exhaustion"] }, target);
  target.effects.push(a, mixed, exhaustion); await syncArcanaCast(origin);
  assert.ok(!world.has(a.uuid)); assert.deepEqual([...mixed.statuses], ["blinded"]); assert.equal(mixed.system.changes.length, 1);
  assert.equal(exhaustion.system.level, 2);
  const conditionData = { hasLevels: true, level: 2, maxLevel: 6, parent: exhaustion };
  await nativeIncreaseExhaustion.call(conditionData); assert.equal(exhaustion.system.level, 2);
  await exhaustion.update({ "system.level": 1 }); assert.equal(exhaustion.system.level, 1);
  assert.equal(guardIronExhaustion(new Effect({ type: "condition", system: { type: "exhaustion", level: 3 } }, target), {}), false);
  const iron = target.effects.find(e => e.flags.spikependium?.arcanaSpell === "iron-body"); iron.isSuppressed = true;
  assert.equal(guardIronExhaustion(exhaustion, { system: { level: 3 } }), undefined);
  iron.isSuppressed = false; iron.disabled = true; assert.equal(guardIronExhaustion(exhaustion, { "system.level": 3 }), undefined);
}

for (const kind of ["instill-doubt", "fractured-perception"]) {
  const { origin, target, save, concentration, combat, combatant } = setup(kind);
  await syncArcanaCast(origin); assert.equal(target.effects.length, 0);
  await syncArcanaCast(save(8, 17)); assert.equal(target.effects.length, 0);
  await syncArcanaCast(save(8, 16, kind === "instill-doubt" ? "int" : "wis")); assert.equal(target.effects.length, 0);
  await syncArcanaCast(save(8, 16, kind === "instill-doubt" ? "wis" : "int", { id: "outsider" })); assert.equal(target.effects.length, 0);
  await syncArcanaCast(save()); assert.equal(target.effects.length, 1);
  assert.equal(target.effects[0].flags.dnd5e.dependentOn, concentration.uuid);
  const wrapped = async value => { assert.equal(value, combatant); return "native-turn"; };
  assert.equal(await arcanaEndTurn.call(combat, wrapped, combatant), "native-turn"); assert.equal(repeatCalls.length, 1);
  assert.equal(target.effects.length, 1); assert.equal(repeatCalls[0].message.data.system.origin, origin.id);
  await arcanaEndTurn.call(combat, wrapped, combatant); assert.equal(repeatCalls.length, 1);
  savedTotal = 20; combat.previous.turn = 1; await arcanaEndTurn.call(combat, wrapped, combatant);
  assert.equal(target.effects.length, 0); assert.equal(origin.flags.spikependium.arcanaEnded, true);
  await resumeArcanaSpells(); assert.equal(target.effects.length, 0, "успешный повторный спасбросок не возвращает эффект после ready");
}
{
  const { origin, concentration, save, caster, target } = setup("fractured-perception");
  const other = new Effect({ _id: "other", system: {}, duration: {} }, caster); caster.effects.push(other);
  await syncArcanaCast(save(20)); assert.equal(world.has(concentration.uuid), false);
  assert.equal(world.has(other.uuid), true); assert.equal(target.effects.length, 0);
  await syncArcanaCast(origin); assert.equal(target.effects.length, 0);
}
{
  const { origin, save, target, concentration } = setup();
  duringTray = () => concentration.delete(); await syncArcanaCast(save()); assert.equal(target.effects.length, 0);
  assert.equal(origin.flags.spikependium.arcanaApplied, undefined);
}
{
  const { origin, save, target } = setup(); origin.flags.spikependium.arcanaCast.effectUuid = "Actor.other.ActiveEffect.fake";
  await syncArcanaCast(save()); assert.equal(target.effects.length, 0);
}
{
  const { origin, save, target } = setup(); origin.flags.spikependium.arcanaCast.effect.system.changes = [{ key: "system.abilities.str.value", value: "999", type: "override" }];
  await syncArcanaCast(save()); assert.equal(target.effects.length, 1);
  assert.deepEqual(target.effects[0].system.changes, byKind["instill-doubt"].effects[0].system.changes, "флаг карточки не подменяет изменения нативного профиля");
}
{
  const { origin, save, target, player } = setup();
  game.user = player; await syncArcanaCast(save()); assert.equal(target.effects.length, 0);
  game.users.activeGM = null; await syncArcanaCast(origin); assert.equal(target.effects.length, 1);
}
{
  const { origin, save, target, player } = setup();
  game.user = player; game.users.activeGM = null; target.isOwner = false;
  await syncArcanaCast(save()); assert.equal(target.effects.length, 0);
  assert.equal(origin.flags.spikependium.arcanaApplied, undefined);
}
{
  const { origin, save, target, combat, combatant } = setup();
  await syncArcanaCast(save()); combatant.token.hidden = true; origin.whisper = ["gm"]; origin.blind = true;
  failRepeat = true;
  const log = console.error; console.error = () => {};
  try { await arcanaEndTurn.call(combat, async () => {}, combatant); } finally { console.error = log; }
  assert.equal(target.effects[0].flags.spikependium.arcanaRepeatRequest.pending, true);
  failRepeat = false; await resumeArcanaSpells(); assert.equal(repeatCalls.length, 2);
  assert.equal(repeatCalls[1].message.rollMode, "gm"); assert.deepEqual(repeatCalls[1].message.data.whisper, ["gm"]);
  assert.equal(target.effects[0].flags.spikependium.arcanaRepeatRequest.pending, false);
  await resumeArcanaSpells(); assert.equal(repeatCalls.length, 2);
}
{
  const { activity, token } = setup("iron-body"); assert.equal(canUseArcanaSpell(activity), true);
  game.user.targets.clear(); assert.equal(canUseArcanaSpell(activity), false);
  game.user.targets.add(token); game.user.targets.add({ actor: token.actor }); assert.equal(canUseArcanaSpell(activity), false);
  assert.equal(canUseArcanaSpell({ item: { type: "feat" } }), true);
}
{
  const { save, target, combat, combatant, gm } = setup(); await syncArcanaCast(save());
  savedTotal = 20; duringRepeat = () => { game.user = { ...gm, isActiveGM: false }; };
  await arcanaEndTurn.call(combat, async () => {}, combatant);
  assert.equal(target.effects.length, 1); assert.equal(target.effects[0].flags.spikependium.arcanaRepeatRequest.pending, true);
  game.user = { id: "newGM", isGM: true, isActiveGM: true }; game.users.activeGM = game.user;
  await resumeArcanaSpells(); assert.equal(target.effects.length, 0); assert.equal(repeatCalls.length, 1);
}
{
  const { save, origin, target, token, player, combat, combatant } = setup(); await syncArcanaCast(save());
  const effect = target.effects[0], event = `combat:1:0:turnTarget:${effect.uuid}`;
  makeMessage({ type: "save", author: player, actor: target, token, system: { origin: origin.id, ability: "wis" }, rolls: [new D20(20, 16)],
    flags: { spikependium: { arcanaRepeat: { event, effect: effect.uuid, origin: origin.uuid } } } });
  await arcanaEndTurn.call(combat, async () => {}, combatant); assert.equal(repeatCalls.length, 1); assert.equal(target.effects.length, 1);
}

const rules = fs.readdirSync("packs/_source/rules").filter(f => f.startsWith("journal-au-spell-lists_")); assert.equal(rules.length, 1);
const pages = JSON.parse(fs.readFileSync(`packs/_source/rules/${rules[0]}`, "utf8")).pages;
assert.deepEqual(pages.map(p => [p.system.identifier, p.system.spells.length]), [["bard", 8], ["wizard", 18], ["warlock", 13], ["sorcerer", 12], ["artificer", 2], ["druid", 5], ["ranger", 1], ["cleric",1]]);
const auSpells = fs.readdirSync("packs/_source/spells").filter(name => name.startsWith("spell-au-"))
  .map(name => JSON.parse(fs.readFileSync(`packs/_source/spells/${name}`, "utf8")));
for (const page of pages) for (const uuid of page.system.spells) assert.ok(auSpells.some(d => uuid.endsWith(`.Item.${d._id}`)));

for (const [kind, level, page, ability, dice, half] of [["mesmerizing-mirrors", 8, 40, "int", 7, "half"],
  ["confusing-terrain", 2, 44, "int", 0, "none"], ["putrid-burst", 4, 39, "con", 4, "none"]]) {
  const doc = byKind[kind], activity = Object.values(doc.system.activities)[0];
  assert.equal(doc.system.level, level); assert.equal(doc.system.source.book, "AU"); assert.equal(doc.system.source.page, String(page));
  assert.deepEqual(activity.save.ability, [ability]); assert.equal(activity.damage.onSave, half);
  assert.equal(activity.damage.parts[0]?.number ?? 0, dice);
  assert.equal(doc.system.properties.includes("concentration"), kind !== "putrid-burst");
  assert.equal(doc.system.duration.value, "1"); assert.equal(doc.system.duration.units, "minute");
}
{
  const { caster, origin } = setup("invulnerability"); origin.flags.spikependium.arcanaCast.targets.push({ actor: "Actor.other" }, { actor: "Actor.third" });
  await syncArcanaCast(origin); assert.ok(caster.effects.some(effect => effect.flags.spikependium?.arcanaSpell === "invulnerability"));
}
for(const kind of ["lightning-ring","grave-ground"]){
  const f=setup(kind),follow={...f.activity,type:"save",flags:{spikependium:{arcanaStage:kind}}};
  assert.equal(canUseArcanaStage(follow),false,"repeat cannot be used before the caster effect is created");
  await syncArcanaCast(f.origin);
  assert.ok(f.caster.effects.some(e=>e.flags.spikependium?.arcanaOngoing===kind));
  assert.equal(f.target.effects.length,0,"the ongoing area marker belongs to the caster");
  assert.equal(canUseArcanaStage(follow),true);
  if(kind==="grave-ground"){
    f.origin.flags.spikependium.arcanaCast.level=8;
    const config={spell:{slot:"spell5"}},item={_source:{system:{level:5}}};
    await arcanaStageScaling.call(follow,async(c)=>{assert.equal(c.scaling,3);assert.equal(c.spell.slot,null);},config,{},item);
    f.origin.flags.spikependium.arcanaCast.level=10;
    await assert.rejects(()=>arcanaStageScaling.call(follow,async()=>{},config,{},item),/Недопустимый/);
  }
  f.concentration.disabled=true;assert.equal(canUseArcanaStage(follow),false);
}
assert.deepEqual(Object.values(byKind["putrid-burst"].system.activities)[0].target.template, { count: "", contiguous: false,
  type: "line", size: "60", width: "10", height: "", units: "ft" });
const poisonActivity = Object.values(byKind["putrid-burst"].system.activities).find(a => a.type === "damage");
assert.equal(poisonActivity.consumption.spellSlot, false); assert.equal(poisonActivity.damage.parts[0].number, 2);
assert.equal(poisonActivity.damage.parts[0].denomination, 10); assert.equal(poisonActivity.damage.parts[0].scaling.mode, "");
assert.equal(poisonActivity.duration.concentration, false); assert.equal(poisonActivity.damage.critical.allow, false);
{
  setMovementContext({ convertLength: value => value, defaultUnits: () => "ft", simplifyBonus: value => Number(value) || 0,
    ConditionData: { hasLevels: () => false } });
  CONFIG.DND5E.movementTypes = { walk: {}, burrow: {}, climb: {}, fly: {}, swim: {} };
  CONFIG.DND5E.defaultUnits = { length: { imperial: "ft" } }; CONFIG.DND5E.conditionTypes = {};
  const speeds = { walk: 30, burrow: 10, climb: 20, fly: 60, swim: 40 }, model = { attributes: { movement: {
    speeds: structuredClone(speeds), bonus: 0, multiplier: 1, units: "ft" } }, _source: { attributes: { movement: { speeds } } },
    parent: { statuses: { has: () => false, reduce: (callback, value) => value }, hasConditionEffect: () => false, flags: {} }, traits: {} };
  for (const change of byKind["confusing-terrain"].effects[0].system.changes) model.attributes.movement.multiplier *= Number(change.value);
  nativePrepareMovement.call(model, {});
  assert.deepEqual(model.attributes.movement.speeds, { walk: 15, burrow: 5, climb: 10, fly: 30, swim: 20, jump: 0 });
  assert.equal(model.attributes.movement.max, 30); assert.equal(model.attributes.movement.slowed, true);
}

function addTarget(origin, id) {
  const recipient = actor(id), scene = game.scenes[0]; game.actors.push(recipient);
  const token = { id, uuid: `Scene.scene.Token.${id}`, actor: recipient, parent: scene, name: id, texture: { src: "icon" } };
  world.set(token.uuid, token); scene.tokens.push(token); origin.flags.spikependium.arcanaCast.targets.push({ actor: recipient.uuid, token: token.uuid });
  const save = total => makeMessage({ type: "save", author: game.user, actor: recipient, token,
    system: { origin: origin.id, ability: "int" }, rolls: [new D20(total, 16)] });
  return { recipient, token, save };
}
for (const kind of ["mesmerizing-mirrors", "confusing-terrain"]) {
  const { origin, target, save, combat, combatant } = setup(kind), second = addTarget(origin, "second"), third = addTarget(origin, "third");
  await Promise.all([syncArcanaCast(save()), syncArcanaCast(second.save(9)), syncArcanaCast(third.save(20))]);
  assert.equal(target.effects.length, 1); assert.equal(second.recipient.effects.length, 1); assert.equal(third.recipient.effects.length, 0);
  savedTotal = 20; await arcanaEndTurn.call(combat, async () => {}, combatant);
  assert.equal(target.effects.length, 0); assert.equal(second.recipient.effects.length, 1, "успех одной цели не снимает эффект с другой");
  await resumeArcanaSpells(); assert.equal(target.effects.length, 0); assert.equal(second.recipient.effects.length, 1);
  await syncArcanaCast(second.save(20)); assert.equal(second.recipient.effects.length, 0);
}
{
  const { origin, target, save } = setup("mesmerizing-mirrors"); target.system.traits.ci.value.add("stunned");
  await syncArcanaCast(save()); assert.equal(target.effects.length, 0);
  target.system.traits.ci.value.clear(); await resumeArcanaSpells(); assert.equal(target.effects.length, 0, "позднее снятие иммунитета не добавляет старое Ошеломление");
  assert.equal(origin.flags.spikependium.arcanaTargets.Actor_target.Applied, true);
}
{
  const { target, save } = setup("mesmerizing-mirrors"); await syncArcanaCast(save());
  const original = target.effects[0]; original.flags.dnd5e.spellLevel = 8;
  const [newer] = await target.createEmbeddedDocuments("ActiveEffect", [{ ...original.toObject(), start: { time: 3 },
    flags: { ...original.flags, dnd5e: { ...original.flags.dnd5e, spellLevel: 9 } } }]);
  assert.equal(original.active, false); assert.equal(newer.active, true);
  newer.disabled = true; assert.equal(original.active, true);
  newer.disabled = false; target.system.traits.ci.value.add("ALL"); assert.equal(newer.active, false); assert.equal(original.active, false);
}
{
  const { activity, target, save, token } = setup("confusing-terrain"); await syncArcanaCast(save());
  assert.equal(canUseArcanaSpell({ actor: target, item: { system: { identifier: "dash" } }, name: "" }), false);
  assert.equal(canUseArcanaSpell({ actor: target, type: "utility", item: { type: "feat", system: {} }, name: "Рывок", activation: { type: "bonus" } }), false);
  assert.equal(canUseArcanaSpell({ actor: target, type: "attack", item: { type: "weapon", system: {} }, name: "Рывок" }), true);
  assert.equal(canUseArcanaSpell({ actor: target, item: { system: {} }, name: "Атака" }), true);
  game.user.targets.add({ actor: target }); game.user.targets.add({ actor: target }); game.user.targets.add({ actor: target });
  assert.equal(canUseArcanaSpell(activity), false);
  game.user.targets = new Set([token]); target.effects[0].disabled = true;
  assert.equal(canUseArcanaSpell({ actor: target, item: { system: { identifier: "dash" } } }), true);
}

let tickRolls, failTick, duringTick;
function poisonSetup() {
  const values = setup("putrid-burst"); values.origin.system.concentration = null; tickRolls = 0; failTick = false; duringTick = null;
  values.activity.item.system.activities.push({ type: "damage", consumption: { spellSlot: false },
    async rollDamage(config, dialog, message) {
      assert.deepEqual(config, { scaling: 0, isCritical: false }); assert.equal(dialog.configure, false); tickRolls++;
      if (failTick) throw Error("tick failed");
      const card = makeMessage({ ...message.data, type: "damage", author: game.user, rolls: [new Damage(12)], actor: values.caster,
        system: message.data.system }); if (duringTick) { const fn = duringTick; duringTick = null; await fn(card); }
      return card.rolls;
    } });
  values.save = (total = 8) => makeMessage({ type: "save", author: game.user, actor: values.target, token: values.token,
    system: { origin: values.origin.id, ability: "con" }, rolls: [new D20(total, 16)] });
  return values;
}
{
  const { target, save, combat, combatant, origin } = poisonSetup(); target.system.traits.dr.value.add("poison");
  await syncArcanaCast(save()); assert.equal(target.effects.length, 1); assert.equal(target.effects[0].flags.dnd5e.dependentOn, undefined);
  await arcanaStartTurn.call(combat, async () => {}, combatant); assert.equal(tickRolls, 1);
  assert.equal(target.system.attributes.hp.temp, 0); assert.equal(target.system.attributes.hp.value, 38);
  await arcanaStartTurn.call(combat, async () => {}, combatant); await resumeArcanaTicks(); assert.equal(tickRolls, 1);
  assert.equal(target.system.attributes.hp.value, 38);
  const oldCard = game.messages.find(m => m.type === "damage"); await target.applyDamage([{ value: 12, type: "poison" }], { originatingMessage: oldCard });
  assert.equal(target.system.attributes.hp.value, 38, "старая карточка не наносит урон повторно");
  combat.current.turn = 1; game.time.worldTime = 6; await arcanaStartTurn.call(combat, async () => {}, combatant);
  assert.equal(tickRolls, 2); assert.equal(target.system.attributes.hp.value, 32);
  savedTotal = 20; await arcanaEndTurn.call(combat, async () => {}, combatant); assert.equal(target.effects.length, 0);
  await resumeArcanaSpells(); assert.equal(target.effects.length, 0);
  assert.equal(origin.flags.spikependium.arcanaTargets.Actor_target.Ended, true);
}
{
  const { target, save, combat, combatant } = poisonSetup(); target.system.traits.di.value.add("poison");
  await syncArcanaCast(save()); await arcanaStartTurn.call(combat, async () => {}, combatant);
  assert.equal(target.system.attributes.hp.value, 40); assert.equal(target.system.attributes.hp.temp, 4);
  assert.equal(Object.values(target.flags.spikependium.arcanaTicks).length, 1);
  game.time.worldTime = 60; combat.current.turn = 1; await arcanaStartTurn.call(combat, async () => {}, combatant); assert.equal(tickRolls, 1);
}
{
  const { target, save, combat, combatant } = poisonSetup(); target.system.traits.ci.value.add("poisoned");
  await syncArcanaCast(save()); assert.equal(target.effects.length, 0);
  await arcanaStartTurn.call(combat, async () => {}, combatant); assert.equal(tickRolls, 0);
}
{
  const { target, save, combat, combatant, token } = poisonSetup(); token.hidden = true;
  await syncArcanaCast(save()); failTick = true; const log = console.error; console.error = () => {};
  try { await arcanaStartTurn.call(combat, async () => {}, combatant); } finally { console.error = log; }
  assert.equal(target.effects[0].flags.spikependium.arcanaTickRequest.pending, true);
  failTick = false; await resumeArcanaTicks(); assert.equal(tickRolls, 2); assert.equal(target.system.attributes.hp.value, 32);
  await resumeArcanaTicks(); assert.equal(tickRolls, 2);
}
{
  const { target, save, combat, combatant, gm } = poisonSetup(); await syncArcanaCast(save());
  duringTick = () => { game.user = { ...gm, isActiveGM: false }; };
  await arcanaStartTurn.call(combat, async () => {}, combatant); assert.equal(target.system.attributes.hp.value, 40);
  game.user = { id: "newGM", isGM: true, isActiveGM: true }; game.users.activeGM = game.user;
  await resumeArcanaTicks(); assert.equal(tickRolls, 1); assert.equal(target.system.attributes.hp.value, 32);
}
{
  registerArcanaMaterials(); assert.equal(CONFIG.DND5E.activityConsumptionTypes.spikependiumMaterial.consume, consumeArcanaMaterial);
  const item = { id: "spell", type: "spell", system: { materials: { consumed: true, supply: 2 }, properties: new Set(["material"]) } };
  const resource = { item, async resolveCost({ delta }) { assert.deepEqual(delta, { item: "spell", keyPath: "system.materials.supply" }); return { total: 1 }; } };
  const updates = { item: [{ _id: "spell", "system.prepared": 1 }], rolls: [] };
  await consumeArcanaMaterial.call(resource, {}, updates);
  assert.deepEqual(updates.item, [{ _id: "spell", "system.prepared": 1, "system.materials.supply": 1 }]);
  const deltas = getDeltas(item, { "system.materials.supply": 1 }); assert.deepEqual(deltas, [{ keyPath: "system.materials.supply", delta: -1 }]);
  item.system.materials.supply = 1;
  await nativeRefund.call({ actor: { items: list([item]) } }, { item: { spell: deltas } }, async updated => {
    assert.deepEqual(updated.item, [{ "system.materials.supply": 2, _id: "spell" }]);
  });
  item.system.materials.supply = 0; await assert.rejects(() => consumeArcanaMaterial.call(resource, {}, updates), ConsumptionError);
  item.system.properties.clear(); const free = { item: [], rolls: [] }; await consumeArcanaMaterial.call(resource, {}, free);
  assert.deepEqual(free.item, []);
  for (const kind of ["iron-body", "invulnerability"]) assert.equal(Object.values(byKind[kind].system.activities)[0].consumption.targets[0].type, "spikependiumMaterial");

  CONFIG.DND5E.activityActivationTypes = { action: {} };
  CONFIG.DND5E.spellcasting = { spell: { getSpellSlotKey: level => `spell${level}` } };
  game.i18n = { localize: key => key };
  item.system.properties.add("material"); item.system.materials.supply = 1; item.system.level = 8; item.system.method = "spell";
  const subject = { system: { spells: { spell8: { value: 1, max: 1 } } } };
  const target = { ...resource, hasZeroCost: () => false,
    async consume(config, updates) { return CONFIG.DND5E.activityConsumptionTypes.spikependiumMaterial.consume.call(this, config, updates); } };
  const activity = { item, actor: subject, activation: { type: "action" }, consumption: { targets: [target], spellSlot: true }, requiresSpellSlot: true };
  const normal = { consume: { resources: true, spellSlot: true } };
  const paid = await nativeUsageUpdates.call(activity, normal, { returnErrors: true });
  assert.deepEqual(paid.actor, { "system.spells.spell8.value": 0 }); assert.deepEqual(paid.item, [{ _id: "spell", "system.materials.supply": 0 }]);
  item.system.materials.supply = 0;
  const errors = await nativeUsageUpdates.call(activity, normal, { returnErrors: true });
  assert.equal(errors.length, 1); assert.ok(errors[0] instanceof ConsumptionError);
  assert.equal(subject.system.spells.spell8.value, 1, "неоплачиваемый компонент не расходует ячейку");
  const withoutMaterial = await nativeUsageUpdates.call(activity, { consume: { resources: false, spellSlot: true } }, { returnErrors: true });
  assert.deepEqual(withoutMaterial.item, []); assert.deepEqual(withoutMaterial.actor, { "system.spells.spell8.value": 0 });
  const freeCast = await nativeUsageUpdates.call(activity, { consume: false }, { returnErrors: true });
  assert.deepEqual(freeCast.actor, {}); assert.deepEqual(freeCast.item, []);
}
for (const [kind, level, page, duration, status] of [["vision-of-ages", 9, 37, "1", "paralyzed"], ["catnap", 3, 40, "10", "unconscious"]]) {
  const doc = byKind[kind], [cast, shake] = Object.values(doc.system.activities);
  assert.equal(doc.system.level, level); assert.equal(doc.system.source.book, "AU"); assert.equal(doc.system.source.page, String(page));
  assert.equal(doc.system.duration.value, duration); assert.equal(doc.system.properties.includes("concentration"), false);
  assert.deepEqual(doc.effects[0].statuses, [status]); assert.equal(cast.consumption.spellSlot, true);
  assert.equal(shake.activation.type, "action"); assert.equal(shake.range.value, "5");
  assert.equal(shake.consumption.spellSlot, false); assert.equal(shake.flags.spikependium.arcanaShakeTemplate, true);
  if (kind === "vision-of-ages") {
    assert.equal(cast.damage.onSave, "none"); assert.deepEqual(cast.save.ability, ["int"]);
    assert.equal(cast.damage.parts[0].number, 10); assert.equal(cast.damage.parts[0].denomination, 12);
  } else { assert.equal(cast.target.affects.count, "@item.level"); assert.equal(doc.effects[0].flags.spikependium.endsOnDamage, true); }
}
{
  const { target, origin, save, concentration, combat, combatant } = setup("vision-of-ages");
  await syncArcanaCast(save(20)); assert.equal(target.effects.length, 0);
  await syncArcanaCast(save()); const effect = target.effects[0];
  assert.ok(effect.statuses.has("paralyzed")); assert.ok(!effect.flags.dnd5e?.dependentOn);
  await concentration.delete(); assert.equal(effect.active, true);
  await arcanaEndTurn.call(combat, async () => {}, combatant);
  const exhaustion = target.effects.get("exhaustionStatus0"); assert.equal(exhaustion.system.level, 1);
  const card = game.messages.at(-1); await syncArcanaRepeat(card); await resumeArcanaSpells();
  assert.equal(exhaustion.system.level, 1, "one failed save grants exhaustion only once");
  combat.previous.turn++; await arcanaEndTurn.call(combat, async () => {}, combatant); assert.equal(exhaustion.system.level, 2);
  savedTotal = 20; combat.previous.turn++; await arcanaEndTurn.call(combat, async () => {}, combatant);
  assert.equal(world.has(effect.uuid), false); assert.equal(exhaustion.system.level, 2);
  assert.equal(origin.flags.spikependium.arcanaEnded, true);
}
{
  const { target, save, combat, combatant } = setup("vision-of-ages"); await syncArcanaCast(save());
  const effect = target.effects[0]; failBatch = true;
  const log = console.error; console.error = () => {};
  try { await arcanaEndTurn.call(combat, async () => {}, combatant); } finally { console.error = log; }
  assert.equal(target.effects.length, 1); assert.equal(effect.flags.spikependium.arcanaRepeatRequest.pending, true);
  failBatch = false; await resumeArcanaSpells();
  assert.equal(repeatCalls.length, 1, "batch retry reuses the rolled save");
  assert.equal(target.effects.get("exhaustionStatus0").system.level, 1);
  assert.equal(effect.flags.spikependium.arcanaRepeatRequest.pending, false);
}
{
  const { target, save, combat, combatant } = setup("vision-of-ages"); await syncArcanaCast(save());
  target.system.traits.ci.value.add("exhaustion"); await arcanaEndTurn.call(combat, async () => {}, combatant);
  assert.equal(target.effects.length, 1); assert.equal(target.effects[0].flags.spikependium.arcanaRepeatRequest.pending, false);
}
{
  const { target, save, combat, combatant } = setup("vision-of-ages"); await syncArcanaCast(save());
  const exhaustion = new Effect({ _id: "exhaustionStatus0", type: "condition", system: { type: "exhaustion", level: 6 }, statuses: ["exhaustion"] }, target);
  target.effects.push(exhaustion); await arcanaEndTurn.call(combat, async () => {}, combatant); assert.equal(exhaustion.system.level, 6);
}
{
  const { target, origin } = setup("catnap"); await syncArcanaCast(origin); const effect = target.effects[0]; await observeCatnap(effect);
  target.system.resources = { primary: { value: 0, max: 2, sr: true }, secondary: { value: 0, max: 3, lr: true } };
  target.system.spells = { pact: { type: "pact", value: 0, max: 2 }, spell3: { type: "spell", value: 0, max: 1 } };
  target.items.push({ id: "feature", system: { uses: { spent: 1 }, async recoverUses(periods) {
    if (!periods.has("sr")) return { updates: {}, rolls: [] };
    assert.equal(periods.get("sr"), 1); return { updates: { "system.uses.spent": 0 }, rolls: [] };
  } } });
  game.time.worldTime = 599; await finishCatnap(); assert.equal(restCalls.length, 0);
  game.time.worldTime = 600; await Promise.all([finishCatnap(), finishCatnap(true)]);
  assert.equal(target.flags.spikependium.catnap.used, true); assert.equal(target.flags.spikependium.catnap.rest.state, "done");
  assert.equal(restCalls.length, 1); assert.equal(restCalls[0].dialog, true);
  assert.equal(target.system.resources.primary.value, 2); assert.equal(target.system.resources.secondary.value, 0);
  assert.equal(target.system.spells.pact.value, 2); assert.equal(target.system.spells.spell3.value, 0);
  assert.equal(target.items[0].system.uses.spent, 0); assert.equal(world.has(effect.uuid), false);
  await finishCatnap(true); assert.equal(restCalls.length, 1);
  assert.equal(canUseArcanaSpell(origin.activity), false);
  await nativeRest.call(target, { type: "long", chat: false }); assert.equal(target.flags.spikependium.catnap.used, false);
  assert.equal(canUseArcanaSpell(origin.activity), true); assert.deepEqual(target.flags.spikependium.catnap.sleep, {});
}
for (const interruption of ["damage", "disabled", "late", "immunity"]) {
  const { target, origin } = setup("catnap"); await syncArcanaCast(origin); const effect = target.effects[0];
  if (interruption === "late") game.time.worldTime = 1;
  await observeCatnap(effect); game.time.worldTime = 10;
  if (interruption === "damage") {
    await endEffectsOnDamage(target, 0); assert.equal(world.has(effect.uuid), true);
    await endEffectsOnDamage(target, 1); await observeCatnap(effect, true);
  } else if (interruption === "disabled") { effect.disabled = true; await observeCatnap(effect); effect.disabled = false; }
  else if (interruption === "immunity") { target.system.traits.ci.value.add("unconscious"); await observeCatnap(effect); target.system.traits.ci.value.clear(); }
  game.time.worldTime = 600; await finishCatnap(); assert.equal(restCalls.length, 0, interruption);
  assert.notEqual(target.flags.spikependium.catnap.used, true);
}
{
  const { target, origin } = setup("catnap"); origin.whisper = ["gm"]; await syncArcanaCast(origin); const effect = target.effects[0];
  await observeCatnap(effect); game.time.worldTime = 600; await effect.delete(); await observeCatnap(effect, true); await finishCatnap(true);
  assert.equal(target.flags.spikependium.catnap.rest.state, "done"); assert.equal(restCalls[0].chat, false); assert.equal(restCalls[0].dialog, false);
}
{
  const { target, origin } = setup("catnap"); await syncArcanaCast(origin); const effect = target.effects[0]; await observeCatnap(effect);
  game.time.worldTime = 600; failBatch = true; await assert.rejects(() => finishCatnap());
  assert.equal(world.has(effect.uuid), true); assert.notEqual(target.flags.spikependium.catnap.used, true);
  failBatch = false; cancelRest = true; await finishCatnap(); assert.equal(target.flags.spikependium.catnap.rest.state, "awaiting");
  await finishCatnap(); assert.equal(restCalls.length, 1, "cancelled dialog is not reopened by every update");
  cancelRest = false; await finishCatnap(true); assert.equal(restCalls.length, 2); assert.equal(target.flags.spikependium.catnap.rest.state, "done");
}
{
  const { target, origin, activity } = setup("catnap");
  for (const id of ["two", "three", "four"]) addTarget(origin, id);
  const message = { data: { system: { targets: origin.flags.spikependium.arcanaCast.targets } } };
  assert.equal(canConsumeArcanaSpell(activity, {}, message), false);
  activity.item.system.level = 4; origin.flags.spikependium.arcanaCast.level = 4;
  assert.equal(canConsumeArcanaSpell(activity, {}, message), true); await syncArcanaCast(origin);
  assert.equal(game.actors.filter(actor => actor.effects.some(e => e.flags.spikependium?.arcanaSpell === "catnap")).length, 4);
  target.flags.spikependium = { catnap: { used: true } }; assert.equal(canConsumeArcanaSpell(activity, {}, message), false);
}
for (const [kind, usingGM] of [["catnap", true], ["vision-of-ages", true], ["catnap", false]]) {
  const { caster, target, origin, save, token, player } = setup(kind);
  await syncArcanaCast(kind === "catnap" ? origin : save()); const effect = target.effects[0];
  if (kind === "catnap") await observeCatnap(effect);
  if (!usingGM) { game.users.activeGM = null; game.user = player; }
  const scene = token.parent; scene.grid = { units: "ft", measurePath: ([a, b]) => ({ distance: Math.abs(a.x - b.x) }) };
  token.getOccupiedGridSpaceOffsets = () => []; token.getCenterPoint = () => ({ x: 5, y: 0 });
  const source = { id: "source", uuid: "Scene.scene.Token.source", actor: caster, parent: scene,
    getOccupiedGridSpaceOffsets: () => [], getCenterPoint: () => ({ x: 0, y: 0 }) }; world.set(source.uuid, source);
  globalThis.canvas = { ready: true, tokens: { controlled: [source] } }; game.user.targets = new Set([token]);
  const request = { effect: effect.uuid, origin: origin.uuid, source: source.uuid, target: token.uuid };
  const draft = { actor: caster, item: { flags: { spikependium: { arcanaShake: request } } } };
  assert.equal(canUseArcanaShake({ flags: { spikependium: { arcanaShakeTemplate: true } }, item: { flags: {} } }), false, "source template cannot spend the caster's action without a helper");
  assert.equal(canUseArcanaShake(draft), true); caster.statuses.add("stunned"); assert.equal(canUseArcanaShake(draft), false); caster.statuses.clear();
  token.getCenterPoint = () => ({ x: 10, y: 0 }); assert.equal(canUseArcanaShake(draft), false); token.getCenterPoint = () => ({ x: 5, y: 0 });
  assert.equal(awakeningChatButtons(() => [], origin)[0].action, "arcanaShake");
  assert.equal(awakeningChatButtons.call(origin.activity, () => [], { data: {} })[0].action, "arcanaShake", "buttons precede preCreateUsageMessage");
  if (usingGM) {
    const activeGM = game.users.activeGM; game.users.activeGM = null;
    assert.equal(canUseArcanaShake(draft), false, "foreign origin cannot consume a helper action without a GM"); game.users.activeGM = activeGM;
  }
  const templates = Object.values(byKind[kind].system.activities).map(data => ({ ...data, id: data._id, toObject: () => structuredClone(data) }));
  origin.activity.item.system.activities = list(templates);
  CONFIG.DND5E.activityActivationTypes = { action: { consume: { property: "attributes.actions" } } };
  caster.system.attributes.actions = { value: 1, spent: 0 }; let uses = 0;
  CONFIG.Item = { documentClass: class {
    constructor(data, { parent }) {
      Object.assign(this, data); this.toObject = () => structuredClone(data);
      const template = Object.values(data.system.activities)[0], activity = { ...template, id: template._id, item: this, actor: parent, requiresSpellSlot: false };
      activity.use = async (config, dialog, message) => {
        assert.equal(config.subsequentActions, false); assert.equal(canUseArcanaShake(activity), true);
        const updates = await nativeUsageUpdates.call(activity, { consume: { action: true, resources: true, spellSlot: true } }, { returnErrors: true });
        if (Array.isArray(updates)) return;
        await parent.update(updates.actor); uses++;
        const card = makeMessage({ ...message.data, type: "usage", author: player, actor: parent, activity });
        await finishArcanaShake(card); await finishArcanaShake(card);
        assert.equal(card.flags.spikependium.arcanaShakeDone, true);
      };
      this.system = { activities: list([activity]) };
    }
  } };
  if (kind === "vision-of-ages") {
    failBatch = true;
    await assert.rejects(() => awakeningChatAction(() => {}, {}, { dataset: { action: "arcanaShake" } }, origin));
    assert.equal(world.has(effect.uuid), true); assert.equal(origin.flags.spikependium.arcanaEnded, undefined);
    failBatch = false; await finishArcanaShake(game.messages.at(-1));
  } else await awakeningChatAction(() => {}, {}, { dataset: { action: "arcanaShake" } }, origin);
  assert.equal(uses, 1); assert.equal(caster.system.attributes.actions.spent, 1);
  assert.equal(world.has(effect.uuid), false); await resumeArcanaSpells(); assert.equal(world.has(effect.uuid), false);
  if (kind === "catnap") { await observeCatnap(effect, true); game.time.worldTime = 600; await finishCatnap(); assert.equal(restCalls.length, 0); }
}
{
  const {target,origin,save,combat,combatant}=setup("dissonant-tune");
  const first=new Effect({_id:"oldConcentration",system:{type:"concentrating"},flags:{},duration:{}},target);
  target.effects.push(first);origin.flags.spikependium.arcanaCast.targetConcentration=[{actor:target.uuid,effects:[first.uuid]}];
  await syncArcanaCast(save(20,16,"con"));assert.equal(world.has(first.uuid),true);
  await syncArcanaCast(save(8,16,"con"));assert.equal(world.has(first.uuid),false);
  const melody=target.effects.find(e=>e.flags.spikependium?.arcanaSpell==="dissonant-tune");assert.ok(melody);
  const model={attributes:{concentration:{roll:{mode:0}}},_source:{}},field=new NativeAdvantageModeField();
  const mode=byKind["dissonant-tune"].effects[0].system.changes[0];
  model.attributes.concentration.roll.mode=field._applyChangeAdd(0,Number(mode.value),model,{key:"attributes.concentration.roll.mode"});
  assert.equal(NativeAdvantageModeField.combineFields(model,["attributes.concentration.roll.mode"]).disadvantage,true);
  await arcanaEndTurn.call(combat,async()=>{},combatant);assert.equal(repeatCalls.length,0,"no end-turn save for Dissonant Tune");
  const later=new Effect({_id:"newConcentration",system:{type:"concentrating"},flags:{},duration:{}},target);target.effects.push(later);
  await resumeArcanaSpells();assert.equal(world.has(later.uuid),true,"resuming the old card never breaks a later concentration");
  target.system.attributes.concentration={ability:"wis"};assert.equal(arcanaSpellSuppression.call(melody,()=>false),true);
}
{
  const {target,origin,save}=setup("dissonant-tune");
  const first=new Effect({_id:"old",system:{type:"concentrating"},duration:{},flags:{}},target);target.effects.push(first);
  origin.flags.spikependium.arcanaCast.targetConcentration=[{actor:target.uuid,effects:[first.uuid]}];
  const card=save(8,16,"con");failBatch=true;await assert.rejects(()=>syncArcanaCast(card));assert.equal(world.has(first.uuid),true);
  failBatch=false;await syncArcanaCast(card);assert.equal(world.has(first.uuid),false);
}
const research=auSpells.find(s=>s.flags.spikependium.key==="spell:au-mordenkainens-research"),past=auSpells.find(s=>s.flags.spikependium.key==="spell:au-hindsight");
{
  const {caster,origin,concentration,save,target}=setup("dissonant-tune");
  concentration.system.type="concentrating";
  const other=new Effect({_id:"other",system:{type:"concentrating"},duration:{},flags:{}},target);target.effects.push(other);
  origin.flags.spikependium.arcanaCast.targets.push({actor:caster.uuid});
  origin.flags.spikependium.arcanaCast.targetConcentration=[{actor:target.uuid,effects:[other.uuid]},{actor:caster.uuid,effects:[concentration.uuid]}];
  const self=makeMessage({type:"save",author:game.user,actor:caster,system:{origin:origin.id,ability:"con"},rolls:[new D20(8,16)]});
  save(8,16,"con");await syncArcanaCast(self);
  assert.equal(world.has(concentration.uuid),false);assert.equal(world.has(other.uuid),false,"all failed initial targets lose their captured concentration even when the caster is hit");
}
{
  setup();foundry.data={fields:{NumberField:class{constructor(data){Object.assign(this,data);}}}};
  const actor={items:list([]),classes:{},system:{spells:{spell2:{value:0,max:3,level:2},spell4:{value:0,max:2,level:4},spell8:{value:1,max:1,level:8}}}};
  const activity={item:{type:"spell",flags:research.flags,system:{level:5}},actor,flags:{},consumption:{targets:[]}};
  class Base{async _prepareConsumptionContext(context){return context;}}
  const config={spell:{slot:"spell8"},consume:{resources:true,spellSlot:true}},dialog={applicationClass:Base};prepareChoiceDialog(activity,config,dialog);
  const instance=new dialog.applicationClass();instance.actor=actor;instance.config=config;
  const context=await instance._prepareConsumptionContext({fields:[],notes:[]});
  assert.ok(context.fields.some(field=>field.name==="spikependium.restore.spell4"));
  assert.equal(context.fields.find(field=>field.name==="spikependium.restore.spell2").field.max,2);
  config.spell.slot="spell5";const low=await instance._prepareConsumptionContext({fields:[],notes:[]});
  assert.equal(low.fields.some(field=>field.name==="spikependium.restore.spell4"),false,"the slot selector changes eligible recovery fields");
}
assert.equal(research.system.source.page,"41");assert.equal(past.system.source.page,"37");assert.equal(past.system.activation.value,10);
assert.equal(past.system.materials.cost,500);assert.equal(past.system.materials.consumed,true);
assert.equal(Object.values(past.system.activities)[0].consumption.targets[0].type,"spikependiumMaterial");
for(const level of [5,6,7,8,9]){
  setup();const actor={system:{spells:{spell1:{value:1,max:4},spell2:{value:0,max:3},spell3:{value:0,max:2},spell4:{value:0,max:2},pact:{value:0,max:2,level:2}}}};
  const activity={item:{flags:research.flags,system:{level}},actor};
  const key=level>=8?"spell4":level>=6?"spell3":"spell2",updates={actor:{[`system.spells.spell${level}.value`]:0},item:[]};
  assert.equal(applyChoiceConsumption(activity,{spikependium:{restore:{[key]:2}}},{},updates),undefined);
  assert.equal(updates.actor[`system.spells.${key}.value`],2);
  assert.equal(updates.actor[`system.spells.spell${level}.value`],0,"recovery preserves the native casting cost");
  assert.equal(applyChoiceConsumption(activity,{spikependium:{restore:{spell1:3}}},{},{actor:{},item:[]}),false);
  if(level<8)assert.equal(applyChoiceConsumption(activity,{spikependium:{restore:{spell4:1}}},{},{actor:{},item:[]}),false);
  const pact={actor:{},item:[]};applyChoiceConsumption(activity,{spikependium:{restore:{pact:2}}},{},pact);assert.equal(pact.actor["system.spells.pact.value"],2);
  assert.equal(restorationPlan(actor,{spell3:2}),null,"the older lich restoration retains its four-level budget");
}
{
  setup();const actor={system:{spells:{spell2:{value:1,max:3}}}},activity={actor,item:{flags:research.flags}};
  let refunded=0;const consumed={actor:[{keyPath:"system.spells.spell2.value",delta:2}]};
  refundResearch.call(activity,()=>{refunded++;},consumed);assert.equal(refunded,0);
  actor.system.spells.spell2.value=2;refundResearch.call(activity,()=>{refunded++;},consumed);assert.equal(refunded,1);
}
{
  const doc = byKind["zone-of-amity"], action = Object.values(doc.system.activities)[0];
  assert.equal(doc.system.source.page, "44"); assert.equal(doc.system.level, 4); assert.equal(doc.system.school, "enc");
  assert.equal(doc.system.properties.includes("concentration"), false);
  assert.deepEqual([doc.system.duration.value, doc.system.duration.units], ["10", "minute"]);
  assert.equal(action.target.template.type, "emanation"); assert.equal(action.target.template.size, "60");
  assert.equal(action.target.affects.type, "self"); assert.equal(action.consumption.spellSlot, true);
  const { caster, target, origin } = setup("zone-of-amity");
  await syncArcanaCast(origin); await syncArcanaCast(origin);
  const aura = caster.effects.find(e => e.flags.spikependium?.arcanaSpell === "zone-of-amity");
  assert.ok(aura); assert.equal(target.effects.length, 0, "the aura belongs only to its caster");
  assert.equal(caster.effects.filter(e => e.flags.spikependium?.arcanaSpell === "zone-of-amity").length, 1);
  assert.equal(origin.flags.spikependium.arcanaCast.targets.length, 0);
  const scene = game.scenes[0], token = scene.tokens[0];
  let units = "ft";
  scene.grid = { get units() { return units; }, measurePath: ([a, b]) => ({ distance: Math.hypot(a.x - b.x, a.elevation - b.elevation) }) };
  const position = t => Object.assign(t, { x: 0, elevation: 0, getOccupiedGridSpaceOffsets: () => [],
    getCenterPoint() { return { x: this.x, y: 0, elevation: this.elevation }; } });
  position(token); token.x = 60;
  const body = position({ uuid: "Scene.scene.Token.caster", actor: caster, parent: scene }); scene.tokens.push(body); world.set(body.uuid, body);
  dnd5e.utils.getSceneTargets = a => scene.tokens.filter(t => t.actor === a).map(document => ({ document }));
  dnd5e.utils.convertLength = (value, from) => from === "m" ? value / 0.3048 : value;
  foundry.data = { fields: { StringField: class { constructor(o) { Object.assign(this, o); } }, BooleanField: class { constructor(o) { Object.assign(this, o); } } } };
  class Dialog { constructor(config) { this.config = config; } async _prepareConfigurationContext(c) { return c; } _buildConfig(roll) { return roll; } }
  const config = { subject: caster }, dialog = { applicationClass: Dialog };
  prepareAmityCheck(config, dialog); assert.equal(dialog.configure, true);
  const instance = new dialog.applicationClass(config), context = await instance._prepareConfigurationContext({ fields: [] });
  assert.equal(context.fields.length, 2); assert.equal(context.fields[0].field.choices[token.uuid], "Target");
  const roll = { parts: ["@mod", "1d4"], data: { mod: 3 }, options: { advantage: true, maximum: 20, criticalSuccess: 20, target: 17 } };
  instance._buildConfig(roll, new Map([["spikependium.amityTarget", token.uuid], ["spikependium.amityInfluence", true]]));
  buildAmityCheck(config, roll); buildAmityCheck(config, roll);
  assert.equal(roll.options.minimum, 10); assert.deepEqual(roll.parts, ["@mod", "1d4"]);
  assert.equal(finalizeAmityCheck([roll], config), undefined);
  let range, mode, compiled = 0;
  nativeD20ConfigureModifiers.call({ validD20Roll: true, options: roll.options,
    constructor: { ADV_MODE: { NORMAL: 0, ADVANTAGE: 1, DISADVANTAGE: -1 } },
    d20: { options: {}, applyFlag() {}, applyAdvantage(v) { mode = v; }, applyRange(v) { range = v; } }, resetFormula() { compiled++; } });
  assert.deepEqual(range, { minimum: 10, maximum: 20 }); assert.equal(mode, 1); assert.equal(compiled, 1);
  assert.equal(roll.options.target, 17); assert.equal(roll.options.criticalSuccess, 20);
  config.spikependium.amityInfluence = false; buildAmityCheck(config, roll);
  assert.equal(roll.options.minimum, undefined, "deselecting the benefit restores the original minimum");
  config.spikependium.amityInfluence = true;
  roll.options.minimum = 15; buildAmityCheck(config, roll); assert.equal(roll.options.minimum, 15);
  config.spikependium.amityInfluence = false; buildAmityCheck(config, roll); assert.equal(roll.options.minimum, 15);
  config.spikependium.amityInfluence = true; roll.options.minimum = 5; buildAmityCheck(config, roll);
  roll.options.minimum = 18; config.spikependium.amityInfluence = false; buildAmityCheck(config, roll);
  assert.equal(roll.options.minimum, 18, "a later modifier from another source is preserved");
  config.spikependium.amityInfluence = true; buildAmityCheck(config, roll);
  for (const invalidate of [() => { token.x = 61; }, () => { token.elevation = 5; }, () => { token.parent = {}; },
    () => { aura.disabled = true; }, () => { aura.isSuppressed = true; }, () => { game.time.worldTime = 600; },
    () => { caster.isOwner = false; }, () => { origin.author = {}; }]) {
    invalidate(); assert.equal(finalizeAmityCheck([roll], config), false);
    const hidden = { applicationClass: Dialog }; prepareAmityCheck({ subject: caster }, hidden); assert.equal(hidden.configure, undefined);
    token.x = 60; token.elevation = 0; token.parent = scene; aura.disabled = false; aura.isSuppressed = false;
    game.time.worldTime = 0; caster.isOwner = true; origin.author = game.user;
  }
  units = "m"; token.x = 60 * 0.3048; assert.equal(finalizeAmityCheck([roll], config), undefined); units = "ft"; token.x = 60;
  const copy = new Effect(aura.toObject(), target); target.effects.push(copy);
  game.user.targets = new Set([body]); const copied = { applicationClass: Dialog };
  prepareAmityCheck({ subject: target }, copied); assert.equal(copied.configure, undefined, "copying another caster's aura grants nothing");
  game.user.targets.clear(); const empty = { applicationClass: Dialog }; prepareAmityCheck({ subject: caster }, empty); assert.equal(empty.configure, undefined);
  delete roll.options.spikependiumAmity; assert.equal(finalizeAmityCheck([roll], config), false);
  world.set("Item.invalid", { actor: target });
  config.spikependium.amityTarget = "Item.invalid";
  buildAmityCheck(config, roll); assert.equal(finalizeAmityCheck([roll], config), false, "a non-token UUID is rejected");
  config.spikependium.amityTarget = "none"; buildAmityCheck(config, roll);
  assert.equal(finalizeAmityCheck([roll], config), undefined);
  const lists = fs.readdirSync("packs/_source/rules").map(f => JSON.parse(fs.readFileSync(`packs/_source/rules/${f}`, "utf8")))
    .find(d => d.flags?.spikependium?.key === "journal:au-spell-lists");
  const uuid = `Compendium.spikependium.spells.Item.${doc._id}`;
  assert.deepEqual(lists.pages.filter(p => p.system.spells.includes(uuid)).map(p => p.system.identifier).sort(), ["bard", "warlock"]);
}
{
  const doc = byKind["aura-of-evasion"], cast = Object.values(doc.system.activities)[0];
  assert.deepEqual([doc.system.source.book, doc.system.source.page, doc.system.level, doc.system.school], ["AU", "35", 7, "abj"]);
  assert.equal(cast.target.template.size, "30"); assert.equal(cast.duration.concentration, true); assert.equal(cast.consumption.spellSlot, true);
  const { caster, target, token, origin, concentration, player } = setup("aura-of-evasion");
  await syncArcanaCast(origin); await syncArcanaCast(origin);
  assert.equal(target.effects.length, 0); assert.equal(caster.effects.length, 2);
  const aura = caster.effects.find(e => e.flags.spikependium?.arcanaSpell === "aura-of-evasion");
  const scene = game.scenes[0]; let units = "ft";
  scene.grid = { get units() { return units; }, measurePath: ([a, b]) => ({ distance: Math.hypot(a.x - b.x, a.elevation - b.elevation) }) };
  const position = t => Object.assign(t, { x: 0, elevation: 0, getOccupiedGridSpaceOffsets: () => [],
    getCenterPoint() { return { x: this.x, y: 0, elevation: this.elevation }; } });
  position(token); token.x = 30;
  const body = position({ id: "body", uuid: "Scene.scene.Token.body", name: "Caster", actor: caster, parent: scene });
  scene.tokens.push(body); world.set(body.uuid, body);
  dnd5e.utils.getSceneTargets = a => scene.tokens.filter(t => t.actor === a).map(document => ({ document }));
  dnd5e.utils.convertLength = (value, from) => from === "m" ? value / 0.3048 : value;
  foundry.data = { fields: { StringField: class { constructor(o) { Object.assign(this, o); } }, BooleanField: class { constructor(o) { Object.assign(this, o); } } } };
  class Dialog { constructor(config) { this.config = config; } async _prepareConfigurationContext(c) { return c; } _buildConfig(r) { return r; } }
  const config = { subject: target, ability: "dex" }, dialog = { applicationClass: Dialog }, message = { data: {} };
  prepareEvasionSave(config, dialog, message); assert.equal(dialog.configure, true); assert.equal(config.spikependium.evasionConfirmed, false);
  const instance = new dialog.applicationClass(config), context = await instance._prepareConfigurationContext({ fields: [] });
  assert.equal(context.fields[0].field.choices[body.uuid], "Caster");
  const roll = new D20(11, 16); roll.options.advantageMode = -1; roll.options.minimum = 4;
  buildEvasionSave(config, roll); assert.equal(roll.options.advantageMode, -1, "unconfirmed alliance gives no advantage");
  instance._buildConfig(roll, new Map([["spikependium.evasionSource", body.uuid], ["spikependium.evasionConfirmed", true]]));
  buildEvasionSave(config, roll); buildEvasionSave(config, roll);
  assert.equal(roll.options.advantageMode, 0, "native disadvantage cancels aura advantage"); assert.equal(roll.options.minimum, 4);
  let mode;
  nativeD20ConfigureModifiers.call({ validD20Roll: true, options: roll.options, constructor: { ADV_MODE: { NORMAL: 0, ADVANTAGE: 1, DISADVANTAGE: -1 } },
    d20: { options: {}, applyFlag() {}, applyAdvantage(v) { mode = v; }, applyRange() {} }, resetFormula() {} });
  assert.equal(mode, 0);
  assert.equal(finalizeEvasionSave([roll], config, {}, message), undefined);
  const savedRoll = new D20(roll.total, 16); savedRoll.options = structuredClone(roll.options);
  const save = makeMessage({ ...message.data, type: "save", system: { ability: "dex" }, actor: target, token, author: player, rolls: [savedRoll] });
  assert.equal(evasionAuraApplies(target, save), true);
  const attack = { type: "save", actor: caster, save: { ability: new Set(["dex"]) }, damage: { onSave: "half" } };
  const damageOrigin = { author: player, system: { outcomes: new Map([[target.uuid, "failure"]]) },
    getAssociatedActivity: () => attack, getAssociatedRolls: () => [save] };
  const options = { originatingMessage: { flags: {}, getOriginatingMessage: () => damageOrigin }, multiplier: 1 };
  target.calculateDamage = (ds, opts) => monsterEvasionDamage.call(target, (...args) => nativeCalculateDamage.call(target, ...args), ds, opts);
  target.system.traits.dr.value.add("fire");
  assert.equal(target.calculateDamage([{ value: 23, type: "fire" }], options).amount, 5, "aura precedes resistance and rounding");
  await target.applyDamage([{ value: 23, type: "fire" }], options); assert.equal(target.system.attributes.hp.value, 39); assert.equal(target.system.attributes.hp.temp, 0);
  damageOrigin.system.outcomes.set(target.uuid, "success"); options.multiplier = 0.5;
  assert.equal(target.calculateDamage([{ value: 23, type: "fire" }], options).amount, 0);
  target.flags.spikependium = { key: "actor:mm25:assassin" }; target.effects.push({ active: true, flags: { spikependium: { monsterEvasion: true } } });
  damageOrigin.system.outcomes.set(target.uuid, "failure"); options.multiplier = 1;
  assert.equal(target.calculateDamage([{ value: 23, type: "fire" }], options).amount, 5, "Assassin Evasion does not stack with the aura");
  target.flags = {}; target.effects.pop();
  config.spikependium.evasionConfirmed = false; buildEvasionSave(config, roll);
  assert.equal(roll.options.advantageMode, -1, "deselection restores the original disadvantage");
  config.spikependium.evasionConfirmed = true; buildEvasionSave(config, roll);
  token.x = 31; assert.equal(finalizeEvasionSave([roll], config, {}, { data: {} }), false); assert.equal(evasionAuraApplies(target, save), false);
  token.x = 0; token.elevation = 31; assert.equal(evasionAuraApplies(target, save), false); token.elevation = 0;
  units = "m"; token.x = 9.144; assert.equal(evasionAuraApplies(target, save), true); token.x = 9.2; assert.equal(evasionAuraApplies(target, save), false);
  units = "ft"; token.x = 30;
  for (const object of [target, caster]) { object.statuses.add("incapacitated"); assert.equal(evasionAuraApplies(target, save), false); object.statuses.clear(); }
  aura.disabled = true; assert.equal(evasionAuraApplies(target, save), false); aura.disabled = false;
  concentration.disabled = true; assert.equal(evasionAuraApplies(target, save), false); concentration.disabled = false;
  save.author = { id: "outsider" }; assert.equal(evasionAuraApplies(target, save), false); save.author = player;
  save.rolls[0]._evaluated = false; assert.equal(evasionAuraApplies(target, save), false); save.rolls[0]._evaluated = true;
  const other = position({ ...token, id: "other", uuid: "Scene.scene.Token.other" }); scene.tokens.push(other); world.set(other.uuid, other);
  const ambiguous = { subject: target, ability: "dex" }, ambiguousDialog = { applicationClass: Dialog };
  prepareEvasionSave(ambiguous, ambiguousDialog, { data: {} }); assert.equal(ambiguousDialog.configure, undefined, "ambiguous linked tokens require an exact speaker");
  prepareEvasionSave(ambiguous, ambiguousDialog, { data: { speaker: { scene: "scene", token: "token" } } }); assert.equal(ambiguous.spikependium.evasionTarget, token.uuid);
  const own = { subject: caster, ability: "dex" }; prepareEvasionSave(own, { applicationClass: Dialog }, { data: {} }); assert.equal(own.spikependium.evasionConfirmed, true);
  const unrelated = { subject: target, ability: "con" }; prepareEvasionSave(unrelated, {}, { data: {} }); assert.equal(unrelated.spikependium, undefined);
  const lists = fs.readdirSync("packs/_source/rules").map(f => JSON.parse(fs.readFileSync(`packs/_source/rules/${f}`, "utf8")))
    .find(d => d.flags?.spikependium?.key === "journal:au-spell-lists");
  assert.deepEqual(lists.pages.filter(p => p.system.spells.includes(`Compendium.spikependium.spells.Item.${doc._id}`)).map(p => p.system.identifier).sort(), ["sorcerer", "warlock", "wizard"]);
}
console.log("Arcana spells: native mechanics, Evasion aura range/concentration/advantage/damage, Amity minimum, components, saves/recovery/privacy and spell lists passed.");
