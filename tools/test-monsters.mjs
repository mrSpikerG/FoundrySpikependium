import assert from "node:assert/strict";
import fs from "node:fs";
import { recordMonsterMovement, recordMonsterAttack, endMonsterApproach, diveToward, prepareMonsterDamage, useMonsterMultiattack, prepareMonsterAttack, prepareMonsterSave, canUseMonsterWeapon } from "../scripts/monster-actions.mjs";
import { constructParts, getAttackData, processDamagePart, setModificationField } from "./data/dnd5e-making-native.mjs";
import { nativeSpellChanges, nativeUsageConfig, nativeUsageUpdates, nativeMergeUpdates, nativeConsumeActivityUses, nativeUsesConsumption, nativeRecoverUses,
  nativeRollRecharge, nativeFormulaMultiply, nativeConfigureD20Modifiers, nativeNPCBaseData, setNPCContext, nativeCombatRecovery,
  nativeNPCCombatRecovery, nativeNPCResistSave, nativeSaveForceSuccess } from "./data/dnd5e-monsters-native.mjs";
import { nativeConsumeAttribute } from "./data/dnd5e-relentless-native.mjs";
import { monsterLegendaryRecovery } from "../scripts/monster-effects.mjs";
import { canUseArchhag, covenAvailable, isHag, cursedByArchhag, prepareArchhagTargets } from "../scripts/archhag.mjs";

const docs = fs.readdirSync("packs/_source/creatures").filter(f => f.includes("mm25-aarakocra"))
  .map(f => JSON.parse(fs.readFileSync(`packs/_source/creatures/${f}`, "utf8")));
assert.equal(docs.length, 2);
const air = docs.find(d => d.flags.spikependium.key.endsWith("aeromancer")), skirmish = docs.find(d => d.flags.spikependium.key.endsWith("skirmisher"));
for (const actor of docs) {
  assert.equal(actor.system.source.book, "MM25"); assert.equal(actor.system.source.page, "10");
  assert.equal(actor.system.source.rules, "2024"); assert.equal(actor.system.details.type.value, "elemental");
  assert.deepEqual(actor.system.traits.languages.value, ["auran", "aarakocra"]);
  assert.deepEqual(actor.system.attributes.movement.speeds, { walk: "20", fly: "50" });
  for (const item of actor.items) { assert.deepEqual(item.system.source, actor.system.source);
    for (const activity of Object.values(item.system.activities)) assert.ok(item.system.description.value.includes(`activity=${activity._id}`)); }
}
assert.equal(air.system.attributes.hp.max, 66); assert.equal(air.system.attributes.ac.flat, 16);
assert.deepEqual(air.system.skills, { prc: { value: 2 }, arc: { value: 1 }, nat: { value: 2 } });
assert.equal(air.system.abilities.dex.proficient, 1); assert.equal(air.system.abilities.wis.proficient, 1);
assert.equal(skirmish.system.attributes.hp.max, 11); assert.equal(skirmish.system.details.cr, 0.25);
assert.equal(skirmish.system.skills.prc.value, 2);
const talons = skirmish.items.find(i => i.system.identifier === "aarakocra-talons"), javelin = skirmish.items.find(i => i.system.identifier === "wind-javelin");
assert.deepEqual(javelin.system.range, { value: 30, long: 120, reach: 5, units: "ft" });
assert.ok(javelin.system.properties.includes("ret")); assert.equal(javelin.system.weight.value, 2);
assert.equal(talons.system.damage.base.number, 2); assert.equal(talons.system.damage.base.denomination, 4);

const get = (o, p) => p.split(".").reduce((v, k) => v?.[k], o);
const set = (o, p, v) => { const keys = p.split("."); for (const k of keys.slice(0, -1)) o = o[k] ??= {}; o[keys.at(-1)] = v; };
const merge = (a, b, options = {}) => { if (options.inplace === false) a = structuredClone(a);
  for (const [k, v] of Object.entries(b)) { if (v && Object.getPrototypeOf(v) === Object.prototype) merge(a[k] ??= {}, v); else a[k] = v; } return a; };
const list = a => Object.assign(a, { get(id) { return this.find(v => v.id === id); }, has(id) { return this.some(v => v.id === id); } });
class Dialog { constructor(config) { this.config = config; } async _prepareConfigurationContext(c) { return c; } _buildConfig(roll) { return roll; } }
class D20 { constructor(total) { this.total = total; this._evaluated = true; } toJSON() { return { total: this.total }; } }
globalThis.foundry = { utils: { getProperty: get, setProperty: set, mergeObject: merge, deepClone: structuredClone,
  isEmpty: o => !Object.keys(o).length, expandObject: o => { const result = {}; for (const [k, v] of Object.entries(o)) set(result, k, v); return result; },
  getType: o => Array.isArray(o) ? "Array" : o?.constructor?.name ?? typeof o, escapeHTML: s => s },
  data: { fields: { BooleanField: class { constructor(o) { Object.assign(this, o); } } } }, applications: { api: { DialogV2: {} } } };
globalThis.ui = { notifications: { error() {}, warn() {} } };
globalThis.game = { user: { id: "gm" }, i18n: { localize: s => s }, settings: { get: () => false }, time: { worldTime: 10 },
  combat: { id: "combat", started: true, round: 1, turn: 0 }, scenes: [], messages: list([]) };
globalThis.CONFIG = { Dice: { BasicRoll: { constructParts }, D20Roll: D20, DamageRoll: { DefaultConfigurationDialog: Dialog } },
  Token: { movement: { actions: { fly: { measure: true }, walk: { measure: true }, blink: { teleport: true, measure: false } } } },
  DND5E: { activityActivationTypes: {}, spellcasting: {} } };
globalThis.Roll = class { constructor(formula) { this.isDeterministic = !formula.includes("d"); } };
globalThis.dnd5e = { utils: { convertLength: (n, from, to) => from === to ? n : from === "m" ? n / 0.3048 : n * 0.3048 } };
const world = new Map(); globalThis.fromUuidSync = uuid => world.get(uuid);
setModificationField({ combineFields: () => ({ bonus: null }) });
for (const actor of docs) for (const item of actor.items.filter(i => i.type === "weapon")) {
  for (const activity of Object.values(item.system.activities)) {
    const mod = Math.floor((actor.system.abilities[activity.attack.ability].value - 10) / 2);
    const host = { attack: activity.attack, item: { type: "weapon", system: { ...item.system, prof: { term: 2 } } },
      actor: { system: {}, items: new Map(), addConditionRollReduction() {}, getFlag() {} }, getActionType: () => "mwak",
      getRollData: () => ({ mod, roll: { ability: activity.attack.ability } }) };
    const actual = getAttackData.call(host);
    assert.equal(actual.data.mod + actual.data.prof, actor === air ? 5 : 4);
    const base = processDamagePart.call(host, { ...item.system.damage.base, base: true }, {}, { mod }, 0, {},
      d => ({ parts: [`${d.number}d${d.denomination}`], data: { mod } }), v => Number(v));
    assert.equal(base.parts.filter(p => p === "@mod").length, 1);
    for (const part of activity.damage.parts) {
      const extra = processDamagePart.call(host, part, {}, { mod }, 1, {}, d => ({ parts: [`${d.number}d${d.denomination}`], data: { mod } }), v => Number(v));
      assert.ok(!extra.parts.includes("@mod"));
    }
  }
}
const spells = air.items.flatMap(i => Object.values(i.system.activities)).filter(a => a.type === "cast");
assert.equal(spells.length, 6);
for (const data of spells) {
  assert.equal(data.consumption.spellSlot, false); assert.equal(data.spell.ability, "wis");
  const changes = nativeSpellChanges.call({ ...structuredClone(data), toObject: () => structuredClone(data) });
  assert.ok(changes.some(c => c.key === "system.ability" && c.value === "wis"));
  assert.deepEqual(changes.filter(c => c.key === "system.properties").map(c => c.value), ["-material"]);
  const item = { id: "spells", name: "Spells", getFlag: () => null }, actor = { system: { spells: { spell3: { value: 2 } } } };
  const parent = { ...structuredClone(data), id: data._id, relativeUUID: `.Item.spells.Activity.${data._id}`, item, actor,
    _prepareUsageUpdates: nativeUsageUpdates, _mergeActivityUpdates: nativeMergeUpdates };
  Object.defineProperty(parent.uses, "value", { get: () => Number(parent.uses.max) - parent.uses.spent });
  parent.consumption.targets = data.consumption.targets.map(t => ({ ...t, activity: parent, item, hasZeroCost: () => false,
    resolveCost: async () => ({ total: Number(t.value) }), _usesConsumption: nativeUsesConsumption, consume: nativeConsumeActivityUses }));
  const cached = { isSpell: true, getLinkedActivity: () => parent, requiresSpellSlot: true, requiresConcentration: false,
    canScale: false, target: { template: {} }, activation: data.activation, consumption: { spellSlot: true, targets: [] },
    item: { ...item, system: { level: 3, method: "spell" } }, actor,
    _prepareUsageUpdates: nativeUsageUpdates };
  const config = nativeUsageConfig.call(cached, {});
  assert.equal(config.consume.spellSlot, false); assert.equal(config.cause.activity, parent.relativeUUID);
  const updates = await nativeUsageUpdates.call(cached, config, { returnErrors: true });
  assert.deepEqual(updates.actor, {}); assert.equal(actor.system.spells.spell3.value, 2);
  if (data.uses.max === "1") {
    assert.equal(updates.item[0][`system.activities.${parent.id}`].uses.spent, 1);
    parent.uses.spent = 1;
    assert.ok(Array.isArray(await nativeUsageUpdates.call(cached, config, { returnErrors: true })));
    assert.equal(await nativeRecoverUses.call(parent, new Map([["sr", 1]])), false);
    assert.equal(await nativeRecoverUses.call(parent, new Map([["dawn", 1]])), false);
    assert.deepEqual((await nativeRecoverUses.call(parent, new Map([["lr", 1]]))).updates, { spent: 0 });
  } else assert.deepEqual(updates.item, []);
}
assert.equal(spells.find(s => s.name.includes("падение")).activation.type, "reaction");

const grid = { size: 100, distance: 5, units: "ft", measurePath: points => ({ distance: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y,
  (points[1].elevation - points[0].elevation) * grid.size / grid.distance) * grid.distance / grid.size }) };
const scene = { grid }, actor = { uuid: "Actor.skirmish", items: [talons], testUserPermission: () => true };
const token = { uuid: "Token.skirmish", parent: scene, actor, x: 600, y: 0, elevation: 0, level: "level", width: 1, height: 1, depth: 1, shape: 0,
  getCenterPoint(p = this) { return { x: p.x + 50, y: p.y + 50, elevation: p.elevation }; }, getSize: () => ({ width: 100, height: 100 }),
  getOccupiedGridSpaceOffsets: () => [], measureMovementPath: points => grid.measurePath([points[0], points.at(-1)]) };
const target = { ...token, uuid: "Token.target", x: 700, actor: {} }; world.set(target.uuid, target);
const waypoint = (x, extra = {}) => ({ ...Object.fromEntries(["x", "y", "elevation", "level", "width", "height", "depth", "shape"].map(k => [k, token[k]])), x, action: "fly", movementId: "move", ...extra });
const points = [waypoint(0), waypoint(300), waypoint(600)];
assert.equal(diveToward(token, target, points, 30), true);
assert.equal(diveToward(token, target, points, 31), false);
assert.equal(diveToward(token, target, [waypoint(0), waypoint(300, { y: 100 }), waypoint(600)], 30), false);
assert.equal(diveToward(token, target, [waypoint(0), waypoint(600, { action: "blink" })], 30), false);
assert.equal(diveToward(token, { ...target, x: 500 }, points, 30), false);
assert.equal(diveToward(token, { ...target, level: "other" }, points, 30), false);
grid.units = "m"; grid.distance = 1.524; assert.equal(diveToward(token, target, points, 30), true);
grid.units = "ft"; grid.distance = 5;
const attack = { uuid: "Activity.talons", type: "attack", item: talons, actor };
const message = { uuid: "ChatMessage.attack", type: "attack", author: game.user, flags: { spikependium: {} }, rolls: [new D20(16)],
  system: { targets: [{ token: target.uuid, ac: 12 }] }, getAssociatedActivity: () => attack, getAssociatedToken: () => token,
  updateSource(changes) { for (const [k, v] of Object.entries(changes)) set(this, k, v); } };
world.set(message.uuid, message);
token.movementHistory = { recorded: { waypoints: points }, unrecorded: { waypoints: [] } };
recordMonsterMovement(token); recordMonsterAttack(message); assert.deepEqual(message.flags.spikependium.monsterDive.targets, [target.uuid]);
const damageConfig = { subject: attack, rolls: [{ base: true, parts: ["2d4", "@mod"], data: { mod: 2 } }], isCritical: true };
const damageMessage = { data: { flags: { spikependium: { attackSource: { message: message.uuid, signature: JSON.stringify(message.rolls.map(r => r.toJSON())) } } }, system: { targets: message.system.targets } } };
const dialog = {}; prepareMonsterDamage(damageConfig, dialog, damageMessage);
assert.equal(damageConfig.spikependium.dive, true); assert.deepEqual(damageConfig.rolls[0].parts, ["2d4", "@mod", "@spikependiumDive"]);
const instance = new dialog.applicationClass(damageConfig);
const context = await instance._prepareConfigurationContext({ fields: [] }); assert.equal(context.fields.length, 1);
instance._buildConfig(damageConfig.rolls[0], new Map([["spikependium.dive", false]]), 0);
assert.deepEqual(damageConfig.rolls[0].parts, ["2d4", "@mod"]);
instance._buildConfig(damageConfig.rolls[0], new Map([["spikependium.dive", true]]), 0);
instance._buildConfig(damageConfig.rolls[0], new Map([["spikependium.dive", true]]), 0);
assert.equal(damageConfig.rolls[0].parts.filter(p => p === "@spikependiumDive").length, 1);
endMonsterApproach(message); recordMonsterMovement(token);
message.flags.spikependium = {}; recordMonsterAttack(message); assert.equal(message.flags.spikependium.monsterDive, undefined);
token.x = 1200; target.x = 1300;
token.movementHistory.recorded.waypoints.push(waypoint(1200, { movementId: "next" }));
recordMonsterMovement(token); recordMonsterAttack(message); assert.ok(message.flags.spikependium.monsterDive);
game.combat.turn++; message.flags.spikependium = {}; recordMonsterAttack(message); assert.equal(message.flags.spikependium.monsterDive, undefined);

let choices, calls;
function setupMulti(hit = false) {
  choices = ["melee", "ranged"]; calls = [];
  const monster = { uuid: "Actor.air", isOwner: true, statuses: new Set(), system: { attributes: { hp: { value: 66 } } } };
  const weapon = { id: "staff", system: { identifier: "wind-staff", activities: list([]) } };
  const card = { id: "hit", uuid: "ChatMessage.hit", type: "attack", system: message.system, rolls: [new D20(17)], flags: {} };
  for (const id of ["melee", "ranged"]) weapon.system.activities.push({ id, name: id, type: "attack",
    async use(config) { calls.push({ use: id, config }); return { message: { id, getAssociatedRolls: () => hit ? [card] : [] } }; },
    async rollAttack(config, dialog, message) { calls.push({ roll: id, message }); return [new D20(17)]; },
    async rollDamage(config, dialog, message) { calls.push({ damage: id, config, message }); } });
  const rule = air.items[0].system.activities[Object.keys(air.items[0].system.activities)[0]].flags.spikependium.multiattack;
  const spell = { type: "cast", spell: { uuid: rule.optionalSpell }, use(config) { calls.push({ spell: true, config }); } };
  monster.items = list([weapon, { id: "spell", system: { activities: [spell] } }]);
  foundry.applications.api.DialogV2.wait = async () => choices.shift(); foundry.applications.api.DialogV2.confirm = async () => true;
  return { activity: { flags: { spikependium: { multiattack: rule } }, actor: monster }, results: { message: { author: game.user, flags: {},
    async setFlag(module, key, value) { set(this.flags, `${module}.${key}`, value); } } } };
}
let m = setupMulti(); await useMonsterMultiattack(m.activity, {}, m.results);
assert.deepEqual(calls.filter(c => c.roll).map(c => c.roll), ["melee", "ranged"]); assert.equal(calls.filter(c => c.spell).length, 1);
assert.ok(calls.filter(c => c.use || c.spell).every(c => c.config.consume.action === false && c.config.consume.spellSlot === false));
assert.deepEqual(m.results.message.flags.spikependium.multiattack, { state: "complete", completed: 2 });
const count = calls.length; await useMonsterMultiattack(m.activity, {}, m.results); assert.equal(calls.length, count);
m = setupMulti(); m.activity.actor.items.push({ id: "loot", type: "loot", system: {} });
await useMonsterMultiattack(m.activity, {}, m.results); assert.equal(calls.filter(c => c.spell).length, 1, "inventory loot without activities does not break multiattack");
m = setupMulti(true); await useMonsterMultiattack(m.activity, {}, m.results); assert.equal(calls.filter(c => c.damage).length, 2);
assert.ok(calls.filter(c => c.damage).every(c => c.message.data.system.origin === "hit"));
m = setupMulti(); choices = ["melee", null]; await useMonsterMultiattack(m.activity, {}, m.results); assert.equal(calls.filter(c => c.roll).length, 1); assert.ok(!calls.some(c => c.spell));
assert.deepEqual(m.results.message.flags.spikependium.multiattack, { state: "stopped", completed: 1 });
m = setupMulti(); m.activity.actor.isOwner = false; await useMonsterMultiattack(m.activity, {}, m.results); assert.equal(calls.length, 0);
m = setupMulti(); m.activity.actor.statuses.add("incapacitated"); await useMonsterMultiattack(m.activity, {}, m.results); assert.equal(calls.length, 0);
m = setupMulti(); foundry.applications.api.DialogV2.wait = async () => { m.activity.actor.system.attributes.hp.value = 0; return "melee"; };
await useMonsterMultiattack(m.activity, {}, m.results); assert.equal(calls.length, 0);
const animals = fs.readdirSync("packs/_source/creatures").filter(f => /actor-mm25-(hell-hound|ankheg)_/.test(f))
  .map(f => JSON.parse(fs.readFileSync(`packs/_source/creatures/${f}`, "utf8")));
assert.equal(animals.length, 2);
const hound = animals.find(d => d.flags.spikependium.key.endsWith("hell-hound")), ankheg = animals.find(d => d.flags.spikependium.key.endsWith("ankheg"));
assert.equal(hound.system.attributes.hp.max, 58); assert.equal(hound.system.attributes.ac.flat, 15);
assert.equal(hound.system.skills.prc.value, 2); assert.deepEqual(hound.system.traits.di.value, ["fire"]);
assert.deepEqual(hound.system.traits.languages.value, ["infernal"]); assert.ok(hound.system.traits.languages.custom.includes("не говорит"));
assert.equal(hound.system.attributes.movement.speeds.walk, "50");
assert.equal(ankheg.system.attributes.hp.max, 45); assert.equal(ankheg.system.attributes.ac.flat, 14);
assert.deepEqual(ankheg.system.attributes.movement.speeds, { walk: "30", burrow: "10" });
assert.equal(ankheg.system.attributes.senses.ranges.tremorsense, 60); assert.equal(ankheg.system.attributes.senses.ranges.darkvision, 60);
assert.equal(ankheg.prototypeToken.width, 2); assert.equal(ankheg.prototypeToken.height, 2);
CONFIG.DND5E.activityActivationTypes.action = { consume: { property: "attributes.actions" } };
globalThis.Item = class {};
globalThis.ChatMessage = { getSpeaker: () => ({}) };
globalThis.Hooks = { call: () => true, callAll() {} };
for (const [raw, page, dice, type, shape, size, threshold] of [[hound, "13", 5, "fire", "cone", "15", 5], [ankheg, "14", 4, "acid", "line", "30", 6]]) {
  assert.equal(raw.system.source.page, page); assert.equal(raw.system.source.book, "MM25");
  const item = raw.items.find(i => i.type === "weapon"), act = Object.values(item.system.activities)[0];
  const host = { attack: act.attack, item: { type: "weapon", system: { ...item.system, prof: { term: 2 } } },
    actor: { system: {}, items: new Map(), addConditionRollReduction() {}, getFlag() {} }, getActionType: () => "mwak",
    getRollData: () => ({ mod: 3, roll: { ability: "str" } }) };
  const native = getAttackData.call(host); assert.equal(native.data.mod + native.data.prof, 5);
  const base = processDamagePart.call(host, { ...item.system.damage.base, base: true }, {}, { mod: 3 }, 0, {},
    d => ({ parts: [`${d.number}d${d.denomination}`], data: { mod: 3 } }), Number);
  assert.equal(base.parts.filter(p => p === "@mod").length, 1);
  assert.deepEqual(act.damage.parts[0].types, [type]); assert.equal(act.damage.parts[0].number, 1);
  for (const embedded of raw.items) {
    assert.deepEqual(embedded.system.source, raw.system.source);
    for (const a of Object.values(embedded.system.activities)) assert.ok(embedded.system.description.value.includes(`activity=${a._id}`));
  }
  const breathItem = raw.items.find(i => Object.values(i.system.activities).some(a => a.type === "save")), data = Object.values(breathItem.system.activities)[0];
  assert.equal(data.save.dc.formula, "12"); assert.deepEqual(data.save.ability, ["dex"]); assert.equal(data.damage.onSave, "half");
  assert.equal(data.damage.parts[0].number, dice); assert.equal(data.damage.parts[0].denomination, 6); assert.deepEqual(data.damage.parts[0].types, [type]);
  assert.equal(data.target.template.type, shape); assert.equal(data.target.template.size, size);
  if (shape === "line") assert.equal(data.target.template.width, "5");
  const activity = { ...structuredClone(data), id: data._id, actor: { system: { attributes: { actions: { value: 1, spent: 0 } } } },
    item: { id: breathItem._id, getFlag: () => null }, requiresSpellSlot: false, getRollData: () => ({}), messageSources: {},
    async update(updates) { for (const [key, value] of Object.entries(updates)) set(this, key, value); } };
  Object.defineProperty(activity.uses, "value", { get: () => Number(activity.uses.max) - activity.uses.spent });
  activity.consumption.targets = data.consumption.targets.map(t => ({ ...t, activity, item: activity.item, hasZeroCost: () => false,
    resolveCost: async () => ({ total: 1 }), _usesConsumption: nativeUsesConsumption, consume: nativeConsumeActivityUses }));
  const cost = await nativeUsageUpdates.call(activity, { consume: { action: true, resources: true, spellSlot: false } }, { returnErrors: true });
  assert.equal(cost.actor["system.attributes.actions.spent"], 1); assert.equal(cost.activity["uses.spent"], 1);
  activity.uses.spent = 1;
  assert.ok(Array.isArray(await nativeUsageUpdates.call(activity, { consume: { action: true, resources: true, spellSlot: false } }, { returnErrors: true })));
  assert.equal(await nativeRecoverUses.call(activity, new Map([["sr", 1], ["lr", 1]])), false);
  let result = 1, cancelled = false, rollsCalled = 0;
  Object.assign(CONFIG.Dice.BasicRoll, { getMessageMode: () => "publicroll", async buildConfigure(config, dialog) {
    rollsCalled++; assert.deepEqual(config.rolls[0].parts, ["1d6"]); assert.equal(config.rolls[0].options.target, threshold); assert.equal(dialog.configure, false);
    return cancelled ? [] : [{ isSuccess: result >= config.rolls[0].options.target }];
  }, async buildEvaluate() {}, async buildPost() {} });
  await nativeRollRecharge.call(activity); assert.equal(activity.uses.spent, 1, "failed recharge stays spent");
  result = threshold; await nativeRollRecharge.call(activity); assert.equal(activity.uses.spent, 0);
  const calls = rollsCalled; await nativeRollRecharge.call(activity); assert.equal(rollsCalled, calls, "available power does not recharge");
  activity.uses.spent = 1; cancelled = true; await nativeRollRecharge.call(activity); assert.equal(activity.uses.spent, 1, "cancel does not recover");
}
const tunneler = ankheg.items.find(i => i.system.identifier === "ankheg-tunneler"), rockEffect = tunneler.effects[0];
assert.equal(rockEffect.disabled, true); assert.equal(rockEffect.transfer, true);
assert.equal(rockEffect.system.changes[0].key, "system.attributes.movement.speeds.burrow");
globalThis.Roll = class { constructor(formula) { this.terms = /[+*]/.test(formula) ? [1, 2, 3] : [1]; } };
assert.equal(nativeFormulaMultiply("10", "0.5"), "10 * 0.5");
assert.equal(nativeFormulaMultiply("10 + 4", "0.5"), "(10 + 4) * 0.5", "buffed burrow speed is halved as a whole");

function tacticsFixture(kind = "hound") {
  const raw = kind === "hound" ? hound : ankheg, a = { uuid: `Actor.${kind}`, ...structuredClone(raw), isOwner: true, statuses: new Set() };
  a.system.attributes.hp.value = 45;
  const scene = { grid, tokens: [] }, src = { ...token, uuid: `Scene.mm.Token.${kind}`, actor: a, parent: scene, x: 0, disposition: -1 };
  const victimActor = { uuid: "Actor.victim", effects: [] }, victim = { ...token, uuid: "Scene.mm.Token.victim", actor: victimActor, parent: scene, x: 200, disposition: 1 };
  const ally = { ...token, uuid: "Scene.mm.Token.ally", parent: scene, x: 300, disposition: -1,
    actor: { statuses: new Set(), system: { attributes: { hp: { value: 10 } } } } };
  scene.tokens.push(src, victim, ally); for (const t of scene.tokens) world.set(t.uuid, t);
  const it = a.items.find(i => i.type === "weapon"); it.uuid = `${a.uuid}.Item.bite`;
  const activity = { type: "attack", actor: a, item: it };
  const message = { data: { speaker: { scene: "mm", token: kind }, system: { targets: [{ token: victim.uuid }] } } };
  const config = { subject: activity, rolls: [{ options: {} }] };
  return { a, src, victim, ally, config, message, activity };
}
function advantage(f, initial = {}) {
  f.config.rolls = [{ options: { ...initial } }]; prepareMonsterAttack(f.config, {}, f.message);
  const roll = { options: f.config.rolls[0].options, validD20Roll: true, constructor: { ADV_MODE: { ADVANTAGE: 1, NORMAL: 0, DISADVANTAGE: -1 } },
    d20: { options: {}, applyFlag() {}, applyAdvantage(mode) { this.mode = mode; }, applyRange() {} }, resetFormula() {} };
  nativeConfigureD20Modifiers.call(roll); return roll.d20.mode;
}
{
  const f = tacticsFixture(); assert.equal(advantage(f), 1); assert.equal(advantage(f, { disadvantage: true }), 0); assert.equal(advantage(f, { advantageMode: -1 }), 0);
  f.ally.actor.statuses.add("stunned"); assert.equal(advantage(f), 0); f.ally.actor.statuses.clear();
  f.ally.actor.system.attributes.hp.value = 0; assert.equal(advantage(f), 0); f.ally.actor.system.attributes.hp.value = 10;
  f.ally.x = 400; assert.equal(advantage(f), 0); f.ally.x = 300;
  f.ally.disposition = 0; assert.equal(advantage(f), 0); f.ally.disposition = -1;
  f.src.disposition = 0; assert.equal(advantage(f), 0); f.src.disposition = -1;
  f.ally.parent = { grid }; assert.equal(advantage(f), 0); f.ally.parent = f.src.parent;
  f.message.data.system.targets.push({ token: "missing" }); assert.equal(advantage(f), 0); f.message.data.system.targets.pop();
  f.a.isOwner = false; assert.equal(advantage(f), 0); f.a.isOwner = true;
  f.message.data.speaker.token = "missing"; assert.equal(advantage(f), 0);
}
{
  const f = tacticsFixture("ankheg"), grab = { active: true, statuses: new Set(["grappled"]),
    flags: { spikependium: { arcanaSpiritGrab: { source: f.src.uuid, target: f.victim.uuid } } }, system: { origin: { activity: `${f.activity.item.uuid}.Activity.bite` } } };
  assert.equal(advantage(f), 0); f.victim.actor.effects.push(grab); assert.equal(advantage(f), 1); assert.equal(advantage(f, { disadvantage: true }), 0);
  grab.flags.spikependium.arcanaSpiritGrab.source = "another-ankheg"; assert.equal(advantage(f), 0); grab.flags.spikependium.arcanaSpiritGrab.source = f.src.uuid;
  grab.active = false; assert.equal(advantage(f), 0); grab.active = true;
  grab.system.origin.activity = "another-item"; assert.equal(advantage(f), 0);
}
const abolethFile = fs.readdirSync("packs/_source/creatures").find(f => f.startsWith("actor-mm25-aboleth_"));
const aboleth = JSON.parse(fs.readFileSync(`packs/_source/creatures/${abolethFile}`, "utf8"));
assert.equal(aboleth.system.source.page, "12"); assert.equal(aboleth.system.attributes.hp.max, 150); assert.equal(aboleth.system.attributes.ac.flat, 17);
assert.deepEqual(aboleth.system.attributes.movement.speeds, { walk: "10", swim: "40" });
assert.equal(aboleth.system.attributes.init.roll.bonus, "@prof * 2"); assert.equal(aboleth.system.abilities.dex.value, 9);
for (const ability of ["dex", "con", "int", "wis"]) assert.equal(aboleth.system.abilities[ability].proficient, 1);
assert.deepEqual(aboleth.system.skills, { prc: { value: 2 }, his: { value: 2 } });
assert.equal(aboleth.system.traits.languages.communication.telepathy.value, 120);
assert.equal(aboleth.system.attributes.senses.ranges.darkvision, 120);
foundry.utils.hasProperty = (o, p) => get(o, p) !== undefined;
Number.isNumeric ??= n => Number.isFinite(Number(n));
setNPCContext({ Proficiency: { calculateMod: cr => Math.floor((cr - 1) / 4) + 2 },
  AttributesFields: { prepareBaseArmorClass() {}, prepareBaseEncumbrance() {} }, MovementField: { _shim() {} }, SensesField: { _shim() {} } });
CONFIG.DND5E.activityActivationTypes.legendary = { consume: { property: "resources.legact" } };
for (const inLair of [false, true]) {
  const raw = structuredClone(aboleth), actor = { _source: raw, system: structuredClone(raw.system) };
  const system = actor.system; system.parent = { items: [], getCRExp: cr => cr === 10 ? 5900 : 7200 };
  system.shimBonusData = () => {}; system.attributes.hd = {}; system.attributes.spell = {}; system.details.level = 0;
  system.resources.lair.inside = inLair; nativeNPCBaseData.call(system);
  assert.equal(system.resources.legact.max, inLair ? 4 : 3); assert.equal(system.resources.legres.max, inLair ? 4 : 3);
  assert.equal(system.details.xp.value, inLair ? 7200 : 5900); assert.equal(system.attributes.prof, 4);
  for (const k of ["legact", "legres"]) Object.defineProperty(system.resources[k], "value", { get: () => system.resources[k].max - system.resources[k].spent });
  const updates = { actor: {}, rolls: [] };
  await nativeConsumeAttribute.call({ target: "resources.legres.value", actor, item: {}, activity: {}, resolveCost: async () => ({ total: 1 }) }, {}, updates);
  assert.equal(updates.actor["system.resources.legres.spent"], 1); assert.ok(!Object.hasOwn(updates.actor, "system.resources.legres.value"));
  system.resources.legres.spent = system.resources.legres.max;
  await assert.rejects(() => nativeConsumeAttribute.call({ target: "resources.legres.value", actor, item: {}, activity: {}, resolveCost: async () => ({ total: 1 }) }, {}, { actor: {}, rolls: [] }));
  const rawAct = Object.values(aboleth.items.find(it => it.name === "Бич").system.activities)[0];
  const activity = { ...rawAct, actor, item: { getFlag: () => null }, requiresSpellSlot: false };
  const cost = await nativeUsageUpdates.call(activity, { consume: { action: true, resources: true, spellSlot: false } }, { returnErrors: true });
  assert.equal(cost.actor["system.resources.legact.spent"], 1); assert.ok(!Object.hasOwn(cost.actor, "system.attributes.actions.spent"));
  system.resources.legact.spent = system.resources.legact.max;
  assert.ok(Array.isArray(await nativeUsageUpdates.call(activity, { consume: { action: true, resources: true, spellSlot: false } }, { returnErrors: true })));
}
const tentacle = aboleth.items.find(it => it.type === "weapon"), tentacleAct = Object.values(tentacle.system.activities)[0];
const tentacleHost = { attack: tentacleAct.attack, item: { type: "weapon", system: { ...tentacle.system, prof: { term: 4 } } },
  actor: { system: {}, items: new Map(), addConditionRollReduction() {}, getFlag() {} }, getActionType: () => "mwak", getRollData: () => ({ mod: 5, roll: { ability: "str" } }) };
assert.equal(getAttackData.call(tentacleHost).data.mod + getAttackData.call(tentacleHost).data.prof, 9);
const projection = Object.values(aboleth.items.find(it => it.system.identifier === "aboleth-projection").system.activities)[0];
const projectionChanges = nativeSpellChanges.call({ ...projection, toObject: () => structuredClone(projection) });
assert.deepEqual(projectionChanges.filter(c => c.key === "system.properties").map(c => c.value), ["-vocal", "-somatic", "-material"]);
assert.equal(projectionChanges.find(c => c.key === "system.ability").value, "int");
assert.deepEqual(JSON.parse(projectionChanges.find(c => c.key === "system.range").value), { value: "1", units: "mi", special: "" });
assert.equal(projection.consumption.spellSlot, false);
let periods;
const own = { recoverCombatUses: async p => { periods = p; } }, other = { recoverCombatUses() { throw Error("wrong combatant recovered at turn start"); } };
await nativeCombatRecovery.call({ combatants: [own, other] }, { turnStart: own }); assert.deepEqual(periods, ["turnStart"]);
for (const period of ["turnStart", "turnEnd", "encounter", "round"]) {
  const system = { parent: { flags: aboleth.flags }, resources: { legact: { max: 3 } } }, results = { actor: {} };
  await monsterLegendaryRecovery.call(system, (...args) => nativeNPCCombatRecovery.call(system, ...args), [period], results);
  assert.equal(Object.hasOwn(results.actor, "system.resources.legact.spent"), ["turnStart", "encounter"].includes(period), period);
}
{
  const system = { parent: { flags: {} }, resources: { legact: { max: 3 } } }, results = { actor: {} };
  await monsterLegendaryRecovery.call(system, (...args) => nativeNPCCombatRecovery.call(system, ...args), ["turnEnd"], results);
  assert.equal(results.actor["system.resources.legact.spent"], 0, "other NPC recovery is preserved");
  const message = { id: "saved", type: "save", system: { resisted: false } }; let paid;
  const resistance = { resources: { legres: { value: 3, spent: 0 } }, parent: { async performBulkUpdate(data) { paid = data; message.system.resisted = true; } } };
  await nativeNPCResistSave.call(resistance, message); assert.equal(paid.actor["system.resources.legres.spent"], 1);
  assert.equal(paid.operations[0].updates[0]["system.resisted"], true); assert.equal(nativeSaveForceSuccess.call(message.system), true);
  await assert.rejects(() => nativeNPCResistSave.call(resistance, message), /already been resisted/);
}
for (const remaining of [0, 1]) {
  m = setupMulti(); const actor = m.activity.actor, weapon = actor.items[0];
  weapon.system.identifier = "aboleth-tentacle";
  const rule = Object.values(aboleth.items.find(it => it.name === "Мультиатака").system.activities)[0].flags.spikependium.multiattack;
  m.activity.flags.spikependium.multiattack = rule;
  const memory = { id: "memory", name: "Memory", type: "save", async use(config) { calls.push({ finisher: "memory", config }); } };
  const dominate = { id: "dominate", name: "Dominate", type: "save", async use(config) { calls.push({ finisher: "dominate", config }); } };
  actor.items.push({ system: { identifier: "aboleth-consume-memories", uses: { max: "" }, activities: [memory] } },
    { system: { identifier: "aboleth-dominate-mind", uses: { max: "2", value: remaining }, activities: [dominate] } });
  choices = ["melee", "ranged", "dominate"];
  await useMonsterMultiattack(m.activity, {}, m.results);
  assert.equal(calls.filter(c => c.roll).length, 2); assert.equal(calls.filter(c => c.finisher).length, remaining);
  assert.ok(calls.filter(c => c.finisher).every(c => c.config.consume.action === false && c.config.consume.resources === true));
  assert.equal(calls.filter(c => c.spell).length, 0, "aboleth multiattack does not cast Project Image");
}
const tables = fs.readdirSync("packs/_source/tables").filter(file => !file.startsWith("folder_"))
  .map(file => JSON.parse(fs.readFileSync(`packs/_source/tables/${file}`, "utf8")));
assert.equal(tables.filter(t => t.flags.spikependium.source.book === "MM25").length, 4);
for (const [actor, suffix, page, faces] of [[aboleth, "aboleth-schemes", "11", 6], [ankheg, "ankheg-finds", "14", 8]]) {
  const table = tables.find(t => t.flags.spikependium.key.endsWith(suffix)); assert.ok(table);
  assert.equal(table.flags.spikependium.source.book, "MM25"); assert.equal(table.flags.spikependium.source.page, page);
  assert.equal(table.flags.spikependium.source.rules, "2024"); assert.equal(table.formula, `1d${faces}`);
  assert.equal(table.results.length, faces); assert.equal(table.replacement, true); assert.equal(table.displayRoll, true);
  assert.ok(actor.system.details.biography.value.includes(`Compendium.spikependium.tables.RollTable.${table._id}`));
  const descriptions = [...actor.system.details.biography.value.matchAll(/<tr><td>\d+<\/td><td>(.*?)<\/td><\/tr>/g)].map(row => row[1]);
  assert.deepEqual(table.results.map(result => result.description), descriptions, "rollable results preserve source biography exactly");
  for (let rolled = 1; rolled <= faces; rolled++) {
    const results = table.results.filter(result => result.range[0] <= rolled && rolled <= result.range[1]);
    assert.equal(results.length, 1, `one result for every d${faces} face`); assert.equal(results[0].weight, 1); assert.equal(results[0].drawn, false);
    assert.equal(results[0].type, "text"); assert.equal(results[0].documentUuid, null);
  }
}
const finds = tables.find(t => t.flags.spikependium.key.endsWith("ankheg-finds"));
assert.ok(finds.results[2].description.includes("[[/r 1d4]]")); assert.ok(finds.results[5].description.includes("[[/r 2d6]]"));
const performers = fs.readdirSync("packs/_source/creatures").filter(file => file.startsWith("actor-mm25-performer"))
  .map(file => JSON.parse(fs.readFileSync(`packs/_source/creatures/${file}`, "utf8")));
assert.equal(performers.length, 3);
for (const [suffix, hp, ac, pb, dex, attackTotal] of [["performer", 27, 13, 2, 3, 5], ["performer-virtuoso", 110, 18, 3, 4, 7], ["performer-legend", 162, 20, 4, 5, 9]]) {
  const actor = performers.find(a => a.flags.spikependium.key === `actor:mm25:${suffix}`); assert.ok(actor);
  assert.equal(actor.system.attributes.hp.max, hp); assert.equal(actor.system.attributes.ac.flat, ac); assert.equal(actor.system.details.type.value, "humanoid");
  assert.equal(actor.system.source.page, suffix === "performer" ? "16" : "17"); assert.equal(actor.system.source.book, "MM25");
  const weapon = actor.items.find(i => i.type === "weapon"), act = Object.values(weapon.system.activities)[0];
  const host = { attack: act.attack, item: { type: "weapon", system: { ...weapon.system, prof: { term: pb } } },
    actor: { system: {}, items: new Map(), addConditionRollReduction() {}, getFlag() {} }, getActionType: () => "mwak", getRollData: () => ({ mod: dex, roll: { ability: "dex" } }) };
  const roll = getAttackData.call(host); assert.equal(roll.data.mod + roll.data.prof, attackTotal);
  assert.equal(weapon.system.weight.value, 2); assert.ok(weapon.system.price.value > 0);
  for (const item of actor.items) {
    assert.deepEqual(item.system.source, actor.system.source);
    for (const activity of Object.values(item.system.activities)) assert.ok(item.system.description.value.includes(`activity=${activity._id}`));
  }
  if (suffix !== "performer") {
    const multi = actor.items.find(i => i.name === "Мультиатака"); assert.equal(Object.values(multi.system.activities)[0].flags.spikependium.multiattack.count, 3);
    const linked = actor.items.flatMap(item => Object.values(item.system.activities)).filter(a => a.type === "cast"); assert.equal(linked.length, suffix === "performer-virtuoso" ? 3 : 5);
    for (const casting of linked) {
      assert.ok(casting.spell.uuid.startsWith("Compendium.dnd5e.spells24.Item.")); assert.equal(casting.consumption.spellSlot, false); assert.equal(casting.spell.ability, "cha");
      if (casting.uses.max) assert.deepEqual(casting.uses.recovery, [{ period: "day", type: "recoverAll" }]);
      const changes = nativeSpellChanges.call({ ...casting, toObject: () => structuredClone(casting) });
      assert.ok(changes.some(c => c.key === "system.properties" && c.value === "-material"));
    }
    if (suffix === "performer-virtuoso") {
      const laughter = JSON.parse(fs.readFileSync("tools/data/srd.json", "utf8")).spells["Hideous Laughter"];
      assert.equal(linked.find(a => a.spell.uuid.endsWith(`.${laughter.id}`)).spell.level, 3);
    }
    const melody = actor.items.find(i => i.name.includes("мелодия"));
    assert.equal(Object.values(melody.system.activities)[0].target.template.size, "20");
    for (const profile of melody.effects) { assert.equal(profile.duration.expiry, "sourceEnd"); assert.equal(profile.transfer, false); }
  }
}
const arcanaloth = fs.readdirSync("packs/_source/creatures").filter(file => file.startsWith("actor-mm25-arcanaloth"))
  .map(file => JSON.parse(fs.readFileSync(`packs/_source/creatures/${file}`, "utf8")))[0];
assert.ok(arcanaloth); assert.equal(arcanaloth.system.source.page, "15"); assert.equal(arcanaloth.system.attributes.hp.max, 175);
assert.equal(arcanaloth.system.attributes.ac.flat, 18); assert.equal(arcanaloth.system.details.cr, 12);
assert.equal(arcanaloth.system.attributes.init.roll.bonus, "@prof"); assert.equal(arcanaloth.system.attributes.movement.hover, true);
assert.deepEqual(arcanaloth.system.traits.dr.value, ["lightning", "fire", "cold"]);
assert.deepEqual(arcanaloth.system.traits.di.value, ["acid", "poison"]);
assert.deepEqual(arcanaloth.system.traits.ci.value, ["charmed", "poisoned"]);
assert.equal(arcanaloth.system.attributes.senses.ranges.truesight, 120);
for (const item of arcanaloth.items) {
  assert.deepEqual(item.system.source, arcanaloth.system.source);
  for (const a of Object.values(item.system.activities)) assert.ok(item.system.description.value.includes(`activity=${a._id}`));
}
for (const weapon of arcanaloth.items.filter(i => i.type === "weapon")) for (const activity of Object.values(weapon.system.activities).filter(a => a.type === "attack")) {
  const host = { attack: activity.attack, item: { type: "weapon", system: { ...weapon.system, prof: { term: 4 } } },
    actor: { system: {}, items: new Map(), addConditionRollReduction() {}, getFlag() {} }, getActionType: () => activity.attack.type.value === "ranged" ? "rwak" : "mwak",
    getRollData: () => ({ mod: 5, roll: { ability: "int" } }) };
  const rolled = getAttackData.call(host); assert.equal(rolled.data.mod + rolled.data.prof, 9);
  const base = processDamagePart.call(host, { ...weapon.system.damage.base, base: true }, {}, { mod: 5 }, 0, {},
    d => ({ parts: [`${d.number}d${d.denomination}`], data: { mod: 5 } }), v => Number(v));
  assert.equal(base.parts.filter(p => p === "@mod").length, 1);
  assert.equal(base.parts[0], weapon.system.identifier.endsWith("burst") ? "4d12" : "2d4");
}
const soulTome = arcanaloth.items.find(i => i.system.identifier === "arcanaloth-soul-tome");
assert.equal(soulTome.type, "equipment"); assert.equal(soulTome.system.type.value, "wondrous");
assert.equal(soulTome.system.hp.value, 35); assert.equal(soulTome.system.hp.max, 35);
assert.equal(soulTome.system.weight.value, 3); assert.equal(soulTome.system.price.value, 50);
const arcanalothSpells = arcanaloth.items.flatMap(item => Object.values(item.system.activities)).filter(a => a.type === "cast");
assert.equal(arcanalothSpells.length, 10); assert.equal(arcanalothSpells.filter(a => a.uses.max === "1").length, 4);
for (const casting of arcanalothSpells) {
  assert.equal(casting.spell.ability, "int"); assert.equal(casting.consumption.spellSlot, false);
  assert.equal(casting.activation.override, casting.name === "Контрзаклинание", "normal casting times remain inherited from SRD");
  assert.deepEqual(nativeSpellChanges.call({ ...casting, toObject: () => structuredClone(casting) })
    .filter(c => c.key === "system.properties").map(c => c.value), ["-material"]);
  if (casting.uses.max === "1") {
    assert.deepEqual(casting.uses.recovery, [{ period: "day", type: "recoverAll" }]);
    assert.equal(casting.consumption.targets[0].type, "activityUses");
    const host = { uses: { ...casting.uses, value: 0, spent: 1 } };
    assert.equal(await nativeRecoverUses.call(host, new Map([["sr", 1]])), false);
    assert.deepEqual((await nativeRecoverUses.call(host, new Map([["day", 1]]))).updates, { spent: 0 });
  }
}
assert.equal(arcanalothSpells.find(a => a.name === "Контрзаклинание").activation.type, "reaction");
const blink = arcanaloth.items.flatMap(item => Object.values(item.system.activities)).find(a => a.type === "teleport");
assert.equal(blink.activation.type, "bonus"); assert.equal(blink.teleport.value, "30"); assert.equal(blink.teleport.units, "ft");
const claw = arcanaloth.items.find(i => i.system.identifier === "arcanaloth-banishing-claw");
const banish = Object.values(claw.system.activities).find(activity => activity.type === "save");
assert.deepEqual(banish.save.ability, ["cha"]); assert.equal(banish.save.dc.formula, "17");
assert.equal(banish.activation.type, ""); assert.equal(banish.consumption.spellSlot, false);
assert.equal(banish.effects[0].onSave, false); assert.equal(claw.effects[0].transfer, false);
{
  const actor = { flags: arcanaloth.flags, items: [structuredClone(soulTome)] }, activity = { type: "attack", actor, item: claw };
  assert.equal(canUseMonsterWeapon(activity), true);
  for (const field of ["system.equipped", "system.quantity", "system.hp.value"]) {
    const before = get(actor.items[0], field); set(actor.items[0], field, field.endsWith("equipped") ? false : 0);
    assert.equal(canUseMonsterWeapon(activity), false, field); set(actor.items[0], field, before);
  }
}
for (const magic of ["spell", "magical", "mundane", "unknown"]) for (const downside of [false, true]) {
  const actor = { isOwner: true, items: arcanaloth.items }, config = { subject: actor, rolls: [{ options: { disadvantage: downside } }] };
  game.messages = list(magic === "unknown" ? [] : [{ id: "magic", getAssociatedItem: () => ({ type: magic === "spell" ? "spell" : "feat",
    system: { properties: new Set(magic === "magical" ? ["mgc"] : []) } }) }]);
  prepareMonsterSave(config, {}, { data: { system: { origin: "magic" } } });
  const roll = { options: config.rolls[0].options, validD20Roll: true, constructor: { ADV_MODE: { ADVANTAGE: 1, NORMAL: 0, DISADVANTAGE: -1 } },
    d20: { options: {}, applyFlag() {}, applyAdvantage(mode) { this.mode = mode; }, applyRange() {} }, resetFormula() {} };
  nativeConfigureD20Modifiers.call(roll);
  assert.equal(roll.d20.mode, ["spell", "magical"].includes(magic) ? downside ? 0 : 1 : downside ? -1 : 0);
  actor.isOwner = false; config.rolls = [{ options: {} }]; prepareMonsterSave(config, {}, { data: { system: { origin: "magic" } } });
  assert.equal(config.rolls[0].options.advantage, undefined);
}
for (const tomeAvailable of [true, false]) {
  m = setupMulti(); m.activity.actor.flags = arcanaloth.flags;
  const burst = m.activity.actor.items[0]; burst.system.identifier = "arcanaloth-fiendish-burst";
  const clawWeapon = { id: "claw-weapon", system: { identifier: "arcanaloth-banishing-claw", activities: list([
    { ...burst.system.activities[0], id: "claw", async use(config) { calls.push({ use: "claw", config }); return { message: { id: "claw", getAssociatedRolls: () => [] } }; },
      async rollAttack() { calls.push({ roll: "claw" }); return [new D20(17)]; } }]) } };
  m.activity.actor.items.push(clawWeapon, { system: { ...structuredClone(soulTome.system), equipped: tomeAvailable } });
  m.activity.flags.spikependium.multiattack = Object.values(arcanaloth.items.find(i => i.name === "Мультиатака").system.activities)[0].flags.spikependium.multiattack;
  const offered = []; choices = tomeAvailable ? ["claw", "melee", "ranged"] : ["melee", "ranged", "melee"];
  foundry.applications.api.DialogV2.wait = async options => { offered.push(options.content); return choices.shift(); };
  await useMonsterMultiattack(m.activity, {}, m.results);
  assert.equal(calls.filter(c => c.roll).length, 3); assert.equal(calls.filter(c => c.roll === "claw").length, tomeAvailable ? 1 : 0);
  assert.equal(offered[0].includes('value="claw"'), tomeAvailable);
  assert.ok(offered.slice(1).every(content => !content.includes('value="claw"')), "only one claw replaces a burst");
}
console.log("MM25: native creature attacks/spells/resources, Arcanaloth/magic resistance/tome gates/replacement limits, movement/multiattack and RollTables passed.");

const archhag = fs.readdirSync("packs/_source/creatures").filter(f => f.startsWith("actor-mm25-archhag_"))
  .map(f => JSON.parse(fs.readFileSync(`packs/_source/creatures/${f}`, "utf8")))[0];
assert.ok(archhag); assert.equal(archhag.system.source.book, "MM25"); assert.equal(archhag.system.source.page, "19");
assert.equal(archhag.system.attributes.hp.max, 333); assert.equal(archhag.system.attributes.ac.flat, 20);
assert.equal(archhag.system.details.cr, 21); assert.equal(archhag.prototypeToken.width, 2);
assert.deepEqual(archhag.system.traits.dr.value, ["fire", "psychic", "cold"]);
assert.deepEqual(archhag.system.traits.ci.value, ["frightened", "charmed", "exhaustion"]);
for (const item of archhag.items) assert.deepEqual(item.system.source, archhag.system.source);
for (const inLair of [false, true]) {
  const raw = structuredClone(archhag), system = structuredClone(raw.system);
  system.parent = { items: [], getCRExp: cr => cr === 21 ? 33000 : 41000 }; system.shimBonusData = () => {};
  system.attributes.hd = {}; system.attributes.spell = {}; system.details.level = 0; system.resources.lair.inside = inLair;
  nativeNPCBaseData.call(system); assert.equal(system.attributes.prof, 7);
  assert.equal(system.details.xp.value, inLair ? 41000 : 33000);
  assert.equal(system.resources.legact.max, inLair ? 4 : 3); assert.equal(system.resources.legres.max, inLair ? 5 : 4);
}
for (const period of ["turnStart", "turnEnd"]) {
  const results = { actor: {} }, host = { parent: { flags: archhag.flags }, resources: { legact: { max: 3 } } };
  await monsterLegendaryRecovery.call(host, (p, r) => nativeNPCCombatRecovery.call(host, p, r), [period], results);
  assert.equal(results.actor["system.resources.legact.spent"], period === "turnStart" ? 0 : undefined);
}
const hagClaws = archhag.items.find(i => i.system.identifier === "archhag-spectral-claws");
for (const act of Object.values(hagClaws.system.activities)) {
  const host = { attack: act.attack, item: { type: "weapon", system: { ...hagClaws.system, prof: { term: 7 } } },
    actor: { system: {}, items: new Map(), addConditionRollReduction() {}, getFlag() {} }, getActionType: () => "mwak",
    getRollData: () => ({ mod: 7, roll: { ability: "cha" } }) };
  const actual = getAttackData.call(host); assert.equal(actual.data.mod + actual.data.prof, 14);
  const base = processDamagePart.call(host, { ...hagClaws.system.damage.base, base: true }, {}, { mod: 7 }, 0, {},
    d => ({ parts: [`${d.number}d${d.denomination}`], data: { mod: 7 } }), v => Number(v));
  assert.equal(base.parts[0], "3d6"); assert.equal(base.parts.filter(p => p === "@mod").length, 1);
}
const hagSpells = archhag.items.flatMap(i => Object.values(i.system.activities)).filter(a => a.type === "cast");
assert.equal(hagSpells.length, 16); assert.equal(hagSpells.filter(a => a.uses.max === "2").length, 3);
for (const act of hagSpells) {
  assert.equal(act.consumption.spellSlot, false); assert.equal(act.spell.spellbook, false);
  assert.deepEqual(nativeSpellChanges.call({ ...act, toObject: () => structuredClone(act) }).filter(c => c.key === "system.properties").map(c => c.value), ["-material"]);
}
for (const id of ["archhag-coven", "archhag-foul-magic"]) {
  const item = archhag.items.find(i => i.system.identifier === id);
  assert.equal(item.system.uses.max, "1");
  for (const act of Object.values(item.system.activities)) assert.equal(act.consumption.targets[0].type, "itemUses");
  const host = { uses: { ...item.system.uses, spent: 1 }, item: {} };
  const period = id === "archhag-coven" ? "lr" : "turnStart";
  assert.equal(await nativeRecoverUses.call(host, new Map([["turnEnd", 1]])), false);
  assert.deepEqual((await nativeRecoverUses.call(host, new Map([[period, 1]]))).updates, { spent: 0 });
  const uses = { spent: 0, value: 1 }, cost = { resolveCost: async () => ({ total: 1 }) };
  assert.equal((await nativeUsesConsumption.call(cost, {}, { uses, rolls: [], delta: {} })).spent, 1);
  uses.spent = 1; uses.value = 0;
  await assert.rejects(() => nativeUsesConsumption.call(cost, {}, { uses, rolls: [], delta: {} }));
}
const bane = tables.find(t => t.flags.spikependium.key === "table:mm25:archhag-bane");
assert.equal(bane.formula, "1d10"); assert.equal(bane.results.length, 10);
assert.ok(archhag.system.details.biography.value.includes(`Compendium.spikependium.tables.RollTable.${bane._id}`));
{
  const scene = { tokens: [], grid: { units: "ft", measurePath: ([a, b]) => ({ distance: Math.hypot(a.x-b.x, a.elevation-b.elevation) }) } };
  const token = (id, x) => ({ uuid: `Scene.hags.Token.${id}`, parent: scene, disposition: -1,
    getOccupiedGridSpaceOffsets: () => [], getCenterPoint: () => ({ x, elevation: 0 }),
    actor: { uuid: `Actor.${id}`, flags: { spikependium: { key: "actor:mm25:archhag" } }, system: { isCreature: true }, statuses: new Set() } });
  const source = token("source", 0), first = token("first", 10), second = token("second", 30); scene.tokens = [source, first, second];
  assert.equal(covenAvailable(source), true);
  second.disposition = 1; assert.equal(covenAvailable(source), false); second.disposition = -1;
  second.actor.statuses.add("dead"); assert.equal(covenAvailable(source), false); second.actor.statuses.clear();
  second.actor.uuid = first.actor.uuid; assert.equal(covenAvailable(source), false); second.actor.uuid = "Actor.second";
  second.getCenterPoint = () => ({ x: 31, elevation: 0 }); assert.equal(covenAvailable(source), false);
  assert.equal(isHag({ name: "Night Hag", system: { isCreature: true, details: { type: { value: "fiend" } } } }), true);
  assert.equal(isHag({ name: "Каргин", system: { isCreature: true, details: { type: { value: "humanoid" } } } }), false);
  const actor = { uuid: source.actor.uuid, flags: archhag.flags, token: source, effects: [], statuses: new Set(), system: { attributes: { hp: { value: 333 } } } };
  const coven = { actor, item: archhag.items.find(i => i.system.identifier === "archhag-coven") };
  assert.equal(canUseArchhag(coven, {}), false);
  assert.equal(canUseArchhag(coven, { spikependium: { covenManual: true } }), true, "explicit confirmation supports narrative or neutral allies");
  const witch = archhag.items.find(i => i.system.identifier === "archhag-witch-strike"), act = { actor, item: witch };
  first.actor.effects = [{ active: true, duration: {}, flags: { spikependium: { archhagCurse: true } }, statuses: new Set(["cursed"]), system: { origin: { actor: actor.uuid } } }];
  world.set(first.uuid, first); game.user.targets = new Set([first]);
  assert.equal(cursedByArchhag(first.actor, source), true); assert.equal(canUseArchhag(act, {}), true);
  source.actor = actor; source.actor.system.isCreature = true; source.actor.effects = [];
  second.actor.effects = [];
  const usage = { data: {} }, previousTargets = game.user.targets;
  prepareArchhagTargets(act, {}, {}, usage);
  assert.deepEqual(usage.data.system.targets.map(t => t.token), [first.uuid]);
  assert.equal(game.user.targets, previousTargets, "automatic selection preserves user targets");
  first.actor.effects[0].system.origin.actor = "Actor.some-other-hag"; assert.equal(canUseArchhag(act, {}), false);
  first.actor.effects[0].system.origin.actor = actor.uuid; first.actor.effects[0].active = false; assert.equal(canUseArchhag(act, {}), false);
}
{
  const curse = { active: true, duration: {}, flags: { spikependium: { noVerbalSpells: true } } }, actor = { effects: [curse] };
  const activity = { actor, item: { type: "spell", system: { properties: new Set(["vocal", "somatic"]) } } };
  assert.equal(canUseArchhag(activity, {}), false);
  curse.active = false; assert.equal(canUseArchhag(activity, {}), true); curse.active = true;
  activity.item.system.properties.delete("vocal"); assert.equal(canUseArchhag(activity, {}), true);
}
console.log("Archhag: PDF stats, native attacks/casting/shared recovery/lair resources, coven allies/distance, source-owned curses and verbal-component restriction passed.");
