import fs from "node:fs";
import assert from "node:assert/strict";
import { MAGUS_NEW_SPELLS } from "../src/content/magus-spells.mjs";
import { magusDiceChoices, magusDiceLimit, magusDicePlan, prepareMagusDiceDialog, registerMagusDice, recordMagusDice, prepareMagusDiceHealing, canConsumeMagusSpell, guardMagusHealing } from "../scripts/magus-spells.mjs";
import { nativeUsageUpdates, nativeConsumeHitDice, nativeHealingActivity, ConsumptionError } from "./data/dnd5e-monsters-native.mjs";
import { nativeConsume, nativeRefund, getDeltas } from "./data/dnd5e-reaction-native.mjs";
import { nativeSummonChanges } from "./data/dnd5e-summon-native.mjs";
import { registerArcanaMaterials } from "../scripts/arcana-spells.mjs";
const read = pack => fs.readdirSync(`packs/_source/${pack}`).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(`packs/_source/${pack}/${f}`, "utf8")));
const spells = read("spells").filter(d => d.flags?.spikependium?.key?.startsWith("spell:magus-"));
const translations = JSON.parse(fs.readFileSync("babele/ru/spikependium.spells.json", "utf8")).entries;
const spell = id => spells.find(d => d.flags.spikependium.key === `spell:magus-${id}`);
assert.equal(spells.length, 27); assert.equal(MAGUS_NEW_SPELLS.length, 27);
for (const [id, name, en, level, school, page] of MAGUS_NEW_SPELLS) {
  const doc = spell(id); assert.ok(doc, id); assert.equal(translations[doc._id].name, name); assert.equal(doc.flags.spikependium.originalName, en);
  assert.deepEqual([doc.system.level, doc.system.school, doc.system.source.book, doc.system.source.page, doc.system.source.rules], [level, school, "MAGUS-PT3", String(page), "2024"]);
  assert.ok(doc.folder); assert.ok(Object.keys(doc.system.activities).length);
}
assert.deepEqual(spell("ensorcelled-strike").system.properties, ["somatic"], "the actual spell's components override the erroneous table M marker");
assert.equal(spell("waypoint").system.properties.includes("ritual"), false, "the return ritual is not free ritual casting");
for (const id of ["animate-shield", "animate-weapon", "assess-enemy"]) assert.equal(spell(id).system.properties.includes("concentration"), false);
for (const id of ["grave-grasp", "provoke", "spell-aegis", "weapon-aegis"]) assert.ok(spell(id).system.properties.includes("concentration"));
for (const id of ["bitter-wind", "hateful-haunting", "obscuring-prick", "overexposure", "righteous-incitement", "forced-hesitation"]) assert.equal(Object.values(spell(id).system.activities)[0].damage.onSave, "none");
for (const id of ["bitter-wind", "demiplanar-pitch", "hateful-haunting", "misfortunate-missile", "obscuring-prick", "overexposure", "phantasmal-feint", "righteous-incitement"]) {
  const a = Object.values(spell(id).system.activities)[0]; assert.equal(a.damage.parts[0].scaling.mode, "whole");
}
assert.equal(spell("obscuring-prick").effects.length, 0, "blindness to one caster must not become global Blinded");
assert.equal(Object.values(spell("grave-bolt").system.activities).some(a => ["save", "attack"].includes(a.type)), false);
const reflect = spell("reflect-magic"); assert.equal(reflect.system.materials.cost, 100); assert.equal(reflect.system.materials.consumed, true);
assert.equal(Object.values(reflect.system.activities)[0].consumption.targets[0].type, "spikependiumMaterial");
const rules = read("rules");
for (const cls of ["bard", "cleric", "druid", "paladin", "ranger", "sorcerer", "warlock", "wizard"]) {
  const list = rules.find(d => d.flags?.spikependium?.key === `journal:magus-spells-${cls}`).pages[0];
  assert.equal(list.system.identifier, cls); assert.equal(list.system.spells.length, MAGUS_NEW_SPELLS.filter(r => r.slice(6).includes(cls)).length);
}
const main = rules.find(d => d.flags?.spikependium?.key === "journal:spell-list-magus").pages[0].system;
assert.equal(main.unlinkedSpells.length, 4); assert.equal(main.spells.length, 78);
for (const [id, weight, price] of [["astrolabe", 1, 10], ["skull", 2, 1], ["teeth", 1, 2], ["organ", 5, 5]]) {
  const item = read("items").find(d => d.flags?.spikependium?.key === `item:magus:${id}`);
  assert.deepEqual([item.system.weight.value, item.system.price.value, item.system.source.page], [weight, price, "12"]);
  assert.ok(!item.system.properties.includes("mgc")); assert.ok(item.system.properties.includes("foc"));
}
const get = (object, key) => key.split(".").reduce((v, k) => v?.[k], object);
const set = (object, key, value) => { const keys = key.split("."), last = keys.pop(); keys.reduce((v, k) => v[k] ??= {}, object)[last] = value; };
const flatten = (object, prefix = "", result = {}) => { for (const [key, value] of Object.entries(object)) { const path = prefix ? `${prefix}.${key}` : key;
  if (value && Object.getPrototypeOf(value) === Object.prototype) flatten(value, path, result); else result[path] = value; } return result; };
const merge = (a, b) => { for (const [key, value] of Object.entries(b)) {
  if (!key.includes(".") && value && Object.getPrototypeOf(value) === Object.prototype) merge(a[key] ??= {}, value);
  else a[key] = value;
} return a; };
let serial = 0, rolls = 0;
const world = new Map();
globalThis.fromUuidSync = uuid => world.get(uuid);
globalThis.game = { i18n: { localize: value => value }, messages: new Map(), user: { id: "owner" } };
globalThis.ui = { notifications: { warn() {}, error() {} } };
globalThis.foundry = { utils: { getProperty: get, setProperty: set, flattenObject: flatten, mergeObject: merge,
  isEmpty: value => value == null || Object.keys(value).length === 0, randomID: () => String(++serial).padStart(16, "0") }, data: { fields: { NumberField: class { constructor(config) { Object.assign(this, config); } } } } };
class HostRoll {
  constructor(formula, data = {}) { this.formula = formula; this.data = data; }
  async evaluate() { rolls++;
    if (this.formula === "@mod") this.total = this.data.mod;
    else if (this.formula === "10 * (@item.level - 2)") this.total = 10 * (this.data.item.level - 2);
    else this.total = this.formula.split(" + ").map(term => { const m = term.match(/^(\d+)d(\d+)$/); return m ? Number(m[1]) * Number(m[2]) / 2 : Number(term); }).reduce((a, b) => a + b, 0);
    return this;
  }
  static replaceFormulaData(formula) { return formula; }
}
globalThis.CONFIG = { Dice: { BasicRoll: HostRoll }, DND5E: { activityConsumptionTypes: { hitDice: { consume: nativeConsumeHitDice } }, activityActivationTypes: {}, spellcasting: { spell: { getSpellSlotKey: level => `spell${level}` } } } };
globalThis.dnd5e = { dataModels: { activity: { ConsumptionError } } };
globalThis.Hooks = { call(name, activity, config, message) {
  if (name === "dnd5e.preActivityConsumption") return canConsumeMagusSpell(activity, config, message);
  if (name === "dnd5e.postActivityConsumption") return recordMagusDice(activity, config, message);
  return true;
} };
registerMagusDice(); registerArcanaMaterials();
function actor() {
  const classes = { a: { id: "a", system: { hd: { denomination: "d8", spent: 0, value: 3 } } }, b: { id: "b", system: { hd: { denomination: "d6", spent: 0, value: 2 } } } };
  const a = { uuid: `Actor.${++serial}`, isOwner: true, flags: { spikependium: {} }, classes, effects: [], statuses: new Set(),
    system: { isCreature: true, details: { level: 5, type: { value: "humanoid" } }, attributes: { hp: { value: 10, max: 20, temp: 0 } }, spells: { spell2: { level: 2, value: 2, max: 2 }, spell3: { level: 3, value: 2, max: 2 } } }, items: new Map(Object.values(classes).map(c => [c.id, c])) };
  a.apply = updates => {
    for (const [path, value] of Object.entries(updates.actor)) set(a, path, value);
    for (const update of updates.item) { const item = a.items.get(update._id), hd = item.system.hd, max = hd && hd.spent + hd.value;
      for (const [path, value] of Object.entries(update)) if (path !== "_id") set(item, path, value);
      if (hd) hd.value = max - hd.spent;
    }
  };
  world.set(a.uuid, a); return a;
}
function activity(id, caster = actor()) {
  const doc = structuredClone(spell(id));
  const a = { ...Object.values(doc.system.activities)[0], actor: caster, item: { ...doc, id: doc._id, _source: structuredClone(doc), actor: caster },
    uuid: `${caster.uuid}.Item.${doc._id}.Activity.cast`, requiresSpellSlot: doc.system.level > 0,
    _prepareUsageUpdates: nativeUsageUpdates, getRollData: () => ({ mod: 3 }), getUsageToken: () => null };
  caster.items.set(doc._id, a.item); a.item.system.properties = new Set(a.item.system.properties);
  a.consumption.targets = a.consumption.targets.map(t => ({ ...t, activity: a, actor: caster, item: a.item,
    hasZeroCost: () => false, resolveCost: async () => ({ total: Number(t.value) }), consume(config, updates) { return CONFIG.DND5E.activityConsumptionTypes[t.type].consume.call(this, config, updates); } }));
  return a;
}
const caster = actor(), recipient = actor(), a = activity("give-life", caster);
assert.deepEqual(magusDiceChoices(caster), { d8: 3, d6: 2 });
for (const [level, limit] of [[1, 1], [5, 2], [11, 3], [17, 4]]) { caster.system.details.level = level; assert.equal(magusDiceLimit(a), limit); }
caster.system.details.level = 5;
const config = { consume: { resources: true }, spikependium: { magusDice: { d8: 1, d6: 1 } } };
const message = { data: { system: { targets: [{ actor: recipient.uuid }] } } };
let applied;
const updates = await nativeConsume.call(a, config, message, async changes => {
  const deltas = { actor: getDeltas(caster, changes.actor), item: {} };
  for (const update of changes.item) deltas.item[update._id] = getDeltas(caster.items.get(update._id), update);
  caster.apply(changes); applied = changes; return deltas;
});
assert.ok(updates); assert.equal(caster.classes.a.system.hd.spent, 1); assert.equal(caster.classes.b.system.hd.spent, 1);
const receipt = message.data.flags.spikependium.magusDice;
assert.equal(receipt.total, 7); assert.equal(receipt.mod, 0); assert.equal(receipt.target, recipient.uuid);
assert.ok(message.data.system.deltas.actor.some(d => d.keyPath.endsWith(`${receipt.nonce}.spent`)), "receipt participates in native refund");
const origin = { id: "paid", flags: message.data.flags, getAssociatedActivity: () => a };
game.messages.set(origin.id, origin);
const rollConfig = { subject: a, rolls: [{ parts: ["0"], options: { type: "healing" } }] }, rollMessage = { data: { system: { origin: origin.id } } };
const oldRolls = rolls; prepareMagusDiceHealing(rollConfig, {}, rollMessage); assert.deepEqual(rollConfig.rolls[0].parts, ["7"]); assert.equal(rolls, oldRolls);
assert.equal(guardMagusHealing(recipient, -7, {}, { originatingMessage: { getOriginatingMessage: () => origin } }), undefined);
assert.equal(guardMagusHealing(caster, -7, {}, { originatingMessage: { getOriginatingMessage: () => origin } }), false, "Give Life cannot heal the caster");
origin.isContentVisible = false; assert.equal(prepareMagusDiceHealing(rollConfig, {}, rollMessage), false); origin.isContentVisible = true;
const NativeHeal = nativeHealingActivity(class { rollDamage(config, _dialog, msg) { this.lastMessage = msg; return prepareMagusDiceHealing({ subject: a, rolls: config.rolls ?? [{ parts: ["0"] }] }, {}, msg); } });
const nativeHeal = new NativeHeal(); await nativeHeal.rollDamage({}, {}, rollMessage); assert.equal(nativeHeal.lastMessage["data.type"], "healing");
await nativeRefund.call(a, message.data.system.deltas, async changes => caster.apply(changes));
assert.equal(caster.classes.a.system.hd.spent, 0); assert.equal(caster.classes.b.system.hd.spent, 0);
assert.equal(prepareMagusDiceHealing(rollConfig, {}, rollMessage), false, "refunded card cannot generate further healing");
assert.equal(guardMagusHealing(recipient, -7, {}, { originatingMessage: { getOriginatingMessage: () => origin } }), false);
for (const selection of [{}, { d8: 4 }, { d6: 1.5 }, { d8: -1 }, { d20: 1 }, { d8: 2, d6: 1 }]) assert.equal(magusDicePlan(a, { spikependium: { magusDice: selection } }), null);
assert.equal(canConsumeMagusSpell(a, { consume: false }, message), false);
assert.equal(canConsumeMagusSpell(a, config, { data: { system: { targets: [{ actor: caster.uuid }] } } }), false);
const scene = { grid: { units: "ft", measurePath: ([start, end]) => ({ distance: Math.abs(start.x - end.x) }) } };
dnd5e.utils = { convertLength: value => value };
const sourceToken = { parent: scene, getOccupiedGridSpaceOffsets: () => [], getCenterPoint: () => ({ x: 0, y: 0 }) };
const targetToken = { parent: scene, getOccupiedGridSpaceOffsets: () => [], getCenterPoint: () => ({ x: 5, y: 0 }) };
a.getUsageToken = () => sourceToken; world.set("Scene.target.Token.recipient", targetToken);
const touchMessage = { data: { system: { targets: [{ actor: recipient.uuid, token: "Scene.target.Token.recipient" }] } } };
assert.notEqual(canConsumeMagusSpell(a, config, touchMessage), false);
targetToken.getCenterPoint = () => ({ x: 6, y: 0 }); assert.equal(canConsumeMagusSpell(a, config, touchMessage), false);
targetToken.parent = {}; assert.equal(canConsumeMagusSpell(a, config, touchMessage), false); a.getUsageToken = () => null;
const inv = activity("arcane-invigoration"), invConfig = { scaling: 1, spell: { slot: "spell3" }, consume: { resources: true, spellSlot: true }, spikependium: { magusDice: { d8: 2, d6: 1 } } };
assert.equal(magusDiceLimit(inv, invConfig), 3);
inv.item.system.level = 3; inv.item.flags.dnd5e = { scaling: 1 }; assert.equal(magusDiceLimit(inv, invConfig), 3, "already scaled usage clone must not count the slot increase twice");
const invUpdates = await nativeUsageUpdates.call(inv, invConfig);
assert.equal(invUpdates.actor["system.spells.spell3.value"], 1); assert.equal(invUpdates.rolls[0].total, 14, "mixed dice plus caster modifier exactly once");
inv.actor.system.spells.spell3.value = 0; const before = inv.actor.classes.a.system.hd.spent;
assert.equal(await nativeUsageUpdates.call(inv, invConfig), false); assert.equal(inv.actor.classes.a.system.hd.spent, before, "failed slot payment leaves HD unchanged");
const npc = actor(); npc.system.isNPC = true; npc.system.attributes.hd = { denomination: 8, value: 4, spent: 0 };
const npcCast = activity("give-life", npc), npcConfig = { consume: { resources: true }, spikependium: { magusLifeTarget: recipient.uuid, magusDice: { d8: 2 } } };
const npcUpdates = await nativeUsageUpdates.call(npcCast, npcConfig); assert.equal(npcUpdates.actor["system.attributes.hd.spent"], 2);
class Base { async _prepareConsumptionContext(context) { return context; } }
const dialog = { applicationClass: Base }; prepareMagusDiceDialog(a, config, dialog); assert.equal(dialog.configure, true);
const app = new dialog.applicationClass(); app.actor = caster; app.config = config;
const context = await app._prepareConsumptionContext({ fields: [], notes: [] }); assert.equal(context.fields.length, 2); assert.equal(context.fields[0].field.max, 2);
const blocked = actor(); blocked.statuses.add("restrained"); blocked.effects = [{ active: true, flags: { spikependium: { magusGraveGrasp: true } }, statuses: new Set(["restrained"]) }];
assert.equal(guardMagusHealing(blocked, -5, {}), false); assert.equal(guardMagusHealing(blocked, 0, { "system.attributes.hp.temp": 5 }), undefined);
const mixed = { "system.attributes.hp.value": 15, "system.attributes.hp.temp": 5 }; guardMagusHealing(blocked, -5, mixed); assert.equal(mixed["system.attributes.hp.value"], 10); assert.equal(mixed["system.attributes.hp.temp"], 5);
blocked.effects[0].active = false; assert.equal(guardMagusHealing(blocked, -5, {}), undefined);
for (const [type, undead, expected] of [["heal", true, undefined], ["heal", false, false], ["damage", true, false], ["damage", false, undefined]]) {
  const target = actor(); target.system.details.type.value = undead ? "undead" : "humanoid";
  assert.equal(guardMagusHealing(target, type === "heal" ? -5 : 5, {}, { originatingMessage: { getOriginatingMessage: () => ({ getAssociatedActivity: () => ({ type, item: spell("grave-bolt") }) }) } }), expected);
}
const command = spell("strike-order");
for (const [level, concentration, expected] of [[3, false, undefined], [6, true, undefined], [5, true, false], [6, false, false]]) assert.equal(canConsumeMagusSpell({ item: { ...command, system: { level } }, duration: { concentration } }, {}, {}), expected);
const mirror = activity("reflect-magic"); mirror.item.system.materials.supply = 1;
const mirrorUpdates = await nativeUsageUpdates.call(mirror, { consume: { resources: true, spellSlot: false } }); assert.equal(mirrorUpdates.item[0]["system.materials.supply"], 0);
mirror.item.system.materials.supply = 0; assert.equal(await nativeUsageUpdates.call(mirror, { consume: { resources: true, spellSlot: false } }), false);
globalThis.ActiveEffect = class { constructor(data) { this.data = data; } toObject() { return this.data; } };
globalThis.Item = class {};
globalThis.Roll = HostRoll; CONFIG.DND5E.actorSizes = { sm: { token: 1 } };
Set.prototype.first ??= function() { return this.values().next().value; };
for (const id of ["shield", "weapon"]) for (const level of [2, 3, 9]) {
  const summonData = Object.values(spell(`animate-${id}`).system.activities)[0];
  const original = read("creatures").find(d => d.flags?.spikependium?.key === `actor:magus-animated-${id}`);
  assert.equal(original.system.attributes.movement.speeds.walk, "0");
  const creature = { system: { ...original.system, isNPC: true }, prototypeToken: { actorLink: false }, items: [], getRollData: () => ({}) };
  creature.system.attributes.ac.calc = "natural";
  const host = { ...summonData, relevantLevel: level, getApplicableEffects: async () => [],
    actor: { prototypeToken: { disposition: 1 } }, item: { uuid: "Actor.caster.Item.animate" },
    creatureSizes: new Set(summonData.creatureSizes), creatureTypes: new Set(summonData.creatureTypes),
    getRollData: () => ({ mod: 3, item: { level }, attributes: { prof: 3 } }) };
  const changes = await nativeSummonChanges.call(host, creature, summonData.profiles[0], {});
  assert.equal(changes.actorUpdates["system.attributes.hp.max"] ?? 20, 20 + 10 * (level - 2));
  assert.ok(changes.actorUpdates.effects.some(e => e.changes?.some(c => c.key === "system.attributes.ac.bonus" && c.value === 3)));
  assert.equal(changes.actorUpdates["system.details.type.value"], "construct");
}
console.log("Magus appendix: 27 Russian spells, lists/gear, native mixed HD/slots/refund/healing receipts, target/healing guards, materials and summon AC/HP passed.");
