import assert from "node:assert/strict";
import fs from "node:fs";
import { armorUnattunedUse, scorpioEquipment, scorpioMovement, scornedArmorBonus, wildskinActive, wildskinUse, prepareConditionalArmorUpdates,
  guardWildskinEffect, finishConditionalArmorUse, prepareConditionalArmorSave, cleanConditionalArmor, refreshScornedArmor, finishWildskinArmorClass } from "../scripts/griffon-conditional-armor.mjs";
import { canUseGriffonItem, griffonUse } from "../scripts/griffon-items.mjs";
import { nativeGriffonArmorClass, nativeGriffonMovement, NativeGriffonEquipment, nativeGriffonCastChanges } from "./data/dnd5e-griffon-native.mjs";
import { nativeUsesConsumption } from "./data/dnd5e-monsters-native.mjs";
const docs = new Map();
for (const f of fs.readdirSync("packs/_source/items")) { const d = JSON.parse(fs.readFileSync(`packs/_source/items/${f}`, "utf8")); if (d.flags?.spikependium?.key) docs.set(d.flags.spikependium.key, d); }
const raw = id => { const d = docs.get(`item:gs2:${id}`); assert.ok(d, id); return d; }, acts = d => Object.values(d.system.activities);
const list = a => Object.assign(a, { get(id) { return this.find(d => d.id === id); } });
const set = (obj, path, value) => { const keys = path.split("."), last = keys.pop(); for (const key of keys) obj = obj[key] ??= {}; if (last.startsWith("-=")) delete obj[last.slice(2)]; else obj[last] = structuredClone(value); };
const apply = (obj, data) => { for (const [key, value] of Object.entries(data)) set(obj, key, value); };
const world = new Map(); let serial = 0, resets = 0;
globalThis.fromUuidSync = uuid => world.get(uuid);
globalThis.game = { actors: [], scenes: [], messages: new Map(), user: { id: "player", isActiveGM: true, targets: new Set() }, users: { activeGM: {} } };
globalThis.canvas = { ready: false, tokens: { controlled: [] } };
globalThis.ui = { notifications: { warn() {} } };
globalThis.foundry = { utils: { randomID: () => `nonce${++serial}`, iterateEntries: Object.entries, deepClone: structuredClone, mergeObject: (a, b) => Object.assign(a, b) } };
globalThis.ActiveEffect = { implementation: { getEffectStart: () => ({ time: 10 }), forApplication: async changes => structuredClone(changes) } };
globalThis.dnd5e = { utils: { convertLength: (value, _from, to) => to === "m" ? value * 0.3 : value } };
globalThis.CONFIG = { DND5E: { equipmentTypes: {}, armorIds: {}, shieldIds: {}, skills: {}, armorTypes: { light: {}, medium: {}, heavy: {} },
  movementTypes: { walk: {}, fly: {}, climb: {}, swim: {}, burrow: {} }, conditionTypes: {}, defaultUnits: { length: { imperial: "ft" } }, encumbrance: { speedReduction: {} }, armorClasses: {} }, Item: { typeLabels: {} } };
function actor(id) {
  const a = { id, uuid: `Actor.${id}`, documentName: "Actor", isOwner: true, items: list([]), effects: list([]), flags: {}, classes: {}, system: { details: { type: { value: "humanoid" } } },
    statuses: Object.assign(new Set(), { reduce(fn, start) { return [...this].reduce(fn, start); } }), getActiveTokens: () => a.tokens ?? [], reset() { resets++; }, sheet: { render() {} }, hasConditionEffect: () => false, getRollData: () => ({}) };
  a.createEmbeddedDocuments = async (_type, data) => {
    const result = data.map(d => ({ ...structuredClone(d), id: `effect${++serial}`, parent: a, active: true }));
    for (const e of result) assert.notEqual(guardWildskinEffect(e), false);
    a.effects.push(...result); return result;
  };
  a.deleteEmbeddedDocuments = async (_type, ids) => { a.effects = list(a.effects.filter(e => !ids.includes(e.id))); };
  world.set(a.uuid, a); game.actors.push(a); return a;
}
function item(owner, id) {
  const d = structuredClone(raw(id)); d.id = d._id; d.uuid = `${owner.uuid}.Item.${d.id}`; d.actor = owner; d.system.equipped = true; d.system.attuned = true;
  d.effects = list(d.effects.map(e => ({ ...e, id: e._id, uuid: `${d.uuid}.ActiveEffect.${e._id}`, toObject: () => structuredClone(e) })));
  d.system.activities = list(acts(d).map(a => ({ ...a, id: a._id, item: d, actor: owner, uuid: `${d.uuid}.Activity.${a._id}`, getAppliedEffectChanges: () => ({}) })));
  d.refresh = () => { d.system.uses.max = Number(d.system.uses.max); d.system.uses.value = d.system.uses.max - d.system.uses.spent; }; d.refresh();
  d.update = async changes => { apply(d, changes); d.refresh(); }; d.setFlag = async (s, key, value) => { set(d, `flags.${s}.${key}`, value); }; d.unsetFlag = async (s, key) => { delete d.flags[s][key]; };
  owner.items.push(d); world.set(d.uuid, d); return d;
}
const owner = actor("druid"); owner.classes.druid = { system: { levels: 5 } };
const scorpio = item(owner, "scorpio-halfplate"), controls = scorpio.system.activities.filter(a => a.flags.spikependium.scorpioLight), pulse = scorpio.system.activities.at(-1);
assert.equal(scorpio.system.uses.recovery[0].period, "dusk"); assert.equal(pulse.activation.type, "bonus"); assert.equal(pulse.flags.spikependium.griffonCommandWord, true);
scorpio.system.attuned = false;
for (const a of controls) { assert.equal(armorUnattunedUse(a), true); assert.equal(canUseGriffonItem(a), true); }
assert.equal(canUseGriffonItem(pulse), false);
scorpio.system.equipped = false; assert.equal(canUseGriffonItem(controls[0]), false); scorpio.system.equipped = true;
await finishConditionalArmorUse(controls[0], {}, { message: {} }); assert.equal(scorpio.flags.spikependium.scorpioLight, "dim");
const sourceProperties = structuredClone(raw("scorpio-halfplate").system.properties);
for (const mode of ["dim", "sun", "other"]) {
 scorpio.flags.spikependium.scorpioLight = mode;
 const equip = Object.assign(new NativeGriffonEquipment(), structuredClone(raw("scorpio-halfplate").system), { equipped: true, parent: Object.assign(scorpio, { getRollData: () => ({}) }), magicAvailable: false,
  prepareDescriptionData() {}, prepareIdentifiable() {}, preparePhysicalData() { this.properties = new Set(this.properties); }, prepareMountableData() {} });
 scorpioEquipment.call(equip, () => equip.prepareDerivedData());
 assert.equal(equip.properties.has("stealthDisadvantage"), mode !== "dim");
 assert.deepEqual(raw("scorpio-halfplate").system.properties, sourceProperties);
}
scorpio.flags.spikependium.scorpioLight = "sun";
for (const [bonus, multiplier] of [[0, 1], [10, 0.5], [-10, 2]]) {
 const movement = { speeds: { walk: 30, fly: 60, swim: 0, climb: 0, burrow: 0 }, bonus, multiplier, units: "ft" };
 const model = { parent: owner, attributes: { movement }, abilities: { str: { value: 16 } }, traits: {}, _source: { attributes: { movement: { speeds: { walk: 30 } } } } };
 scorpioMovement.call(model, () => {
  assert.match(String(movement.bonus), /^\([-\d]+\) - 5$/);
  // The fixture injects a numeric-only formula resolver; evaluate this numeric test expression at that boundary.
  movement.bonus = Function(`return ${movement.bonus}`)(); nativeGriffonMovement.call(model, {});
 });
 assert.equal(movement.speeds.walk, (30 + bonus - 5) * multiplier); assert.equal(movement.speeds.fly, (60 + bonus - 5) * multiplier); assert.equal(movement.speeds.swim, 0); assert.equal(movement.bonus, bonus);
}
scorpio.system.equipped = false; const noChange = { attributes: { movement: { bonus: 10 } }, parent: owner }; scorpioMovement.call(noChange, () => assert.equal(noChange.attributes.movement.bonus, 10)); scorpio.system.equipped = true;
const source = (id, { types = [], statuses = [] } = {}) => game.messages.set(id, { getAssociatedActivity: () => ({ damage: { parts: [{ types: new Set(types) }] }, applicableEffects: [{ statuses: new Set(statuses) }] }) });
source("poison", { types: ["poison"] }); source("charm", { statuses: ["charmed"] }); source("fire", { types: ["fire"] });
const save = (id, mode = 0) => { const config = { subject: owner, rolls: [{ options: { advantageMode: mode } }] }; prepareConditionalArmorSave(config, {}, { data: { system: { origin: id } } }); return config.rolls[0].options; };
assert.equal(save("poison").advantage, undefined); scorpio.system.attuned = true; assert.equal(save("poison").advantageMode, 1); assert.equal(save("poison", -1).advantageMode, 0); assert.equal(save("fire").advantage, undefined);
const heart = item(owner, "scorned-heart"), rebuke = heart.system.activities[0];
assert.equal(rebuke.spell.level, 3); assert.equal(rebuke.activation.type, "reaction"); assert.equal(rebuke.spell.challenge.save, "15");
const changes = nativeGriffonCastChanges.call({ ...rebuke, toObject: () => structuredClone(acts(raw("scorned-heart"))[0]) }); assert.ok(changes.some(c => c.key === "activities[save].save.dc.formula" && c.value === "15"));
await cleanConditionalArmor(); assert.equal(owner.effects.filter(e => e.flags.spikependium?.scornedCurse).length, 1); assert.equal(save("charm").advantageMode, -1); assert.equal(save("charm", 1).advantageMode, 0);
heart.system.attuned = false; heart.system.equipped = false; await cleanConditionalArmor(); assert.equal(owner.effects.filter(e => e.flags.spikependium?.scornedCurse).length, 1); assert.equal(save("charm").advantageMode, -1);
heart.system.attuned = true; await cleanConditionalArmor(); assert.equal(owner.effects.filter(e => e.flags.spikependium?.scornedCurse).length, 1);
owner.effects = list([]); await cleanConditionalArmor(); assert.equal(owner.effects.length, 0, "Remove Curse does not return on refresh");
heart.system.attuned = false; await cleanConditionalArmor(); heart.system.attuned = true; await cleanConditionalArmor(); assert.equal(owner.effects.length, 1, "new attunement curses again");
owner.items.splice(owner.items.indexOf(heart), 1); await cleanConditionalArmor(); assert.equal(owner.effects.length, 1, "deleting armor does not end the curse"); owner.items.push(heart); heart.system.equipped = true;
const scene = { tokens: [], grid: { units: "ft", getCenterPoint: p => p, measurePath: ([a, b]) => ({ distance: Math.hypot(b.x - a.x, b.y - a.y, (b.elevation ?? 0) - (a.elevation ?? 0)) }) } };
canvas.ready = true; canvas.scene = scene;
const token = (id, a, x, elevation = 0) => ({ uuid: `Scene.test.Token.${id}`, actor: a, parent: scene, elevation, getOccupiedGridSpaceOffsets: () => [{ x, y: 0 }], getCenterPoint: () => ({ x, y: 0 }) });
const bearer = token("bearer", owner, 0); owner.tokens = [bearer]; scene.tokens.push(bearer);
const allies = [1, 2, 3, 4, 5].map(n => token(`ally${n}`, actor(`ally${n}`), n)); scene.tokens.push(...allies);
game.user.targets = new Set(allies.map(document => ({ document })));
await finishConditionalArmorUse(heart.system.activities[1], {}, { message: {} }); assert.equal(scornedArmorBonus(owner), 2);
heart.flags.spikependium.scornedAllies = [allies[0].uuid]; assert.equal(scornedArmorBonus(owner), 0);
heart.flags.spikependium.scornedAllies.push(allies[1].uuid); assert.equal(scornedArmorBonus(owner), 1);
allies[1].actor.statuses.add("dead"); assert.equal(scornedArmorBonus(owner), 0); allies[1].actor.statuses.clear();
allies[1].elevation = 11; assert.equal(scornedArmorBonus(owner), 0); allies[1].elevation = 0;
owner.tokens.push(token("duplicate", owner, 0)); assert.equal(scornedArmorBonus(owner), 0, "multiple bearer tokens are ambiguous"); owner.tokens.pop();
refreshScornedArmor(); assert.equal(resets, 1); heart.system.attuned = false; assert.equal(scornedArmorBonus(owner), 0); heart.system.attuned = true;
const skin = item(owner, "wildskin"), activity = skin.system.activities[0], beast = actor("beast"); beast.flags.dnd5e = { originalActor: owner.id, isPolymorphed: true }; beast.system.details.type.value = "beast";
assert.equal(canUseGriffonItem(activity), true); owner.classes = {}; assert.equal(canUseGriffonItem(activity), false); owner.classes.druid = { system: { levels: 5 } };
const empty = { item: [] }; assert.equal(prepareConditionalArmorUpdates(activity, {}, empty), false);
assert.equal(guardWildskinEffect({ parent: owner, flags: { spikependium: { griffonWildskin: true } } }), false);
assert.equal(guardWildskinEffect({ parent: beast, flags: { spikependium: { griffonWildskin: true } } }), false, "old card cannot apply the unbound template");
assert.equal(guardWildskinEffect({ parent: beast, flags: { spikependium: { griffonWildskin: true, wildskinGrant: { target: beast.uuid } } } }), false, "incomplete source receipt is rejected");
assert.equal(guardWildskinEffect({ parent: { documentName: "Item" }, flags: { spikependium: { griffonWildskin: true } } }), undefined, "item effect templates remain importable");
game.user.targets = new Set([{ actor: beast }]); let invoked = 0;
const use = async config => {
 invoked++; const native = await nativeUsesConsumption.call({ resolveCost: async () => ({ total: 1 }) }, config, { uses: skin.system.uses, rolls: [], delta: {}, type: "charge" });
 const updates = { item: [{ _id: skin.id, "system.uses.spent": native.spent }] };
 assert.equal(prepareConditionalArmorUpdates(activity, config, updates), updates); await skin.update(updates.item[0]); return { message: { uuid: "ChatMessage.skin" } };
};
await griffonUse.call(activity, use, {}); assert.equal(invoked, 1); assert.equal(skin.system.uses.spent, 1); assert.equal(beast.effects.length, 1); assert.equal(wildskinActive(beast), true); assert.equal(wildskinActive(owner), false);
skin.system.attuned = false; assert.equal(wildskinActive(beast), false); skin.system.attuned = true; assert.equal(wildskinActive(beast), true);
const clonedHeart = item(beast, "scorned-heart"); clonedHeart.flags.spikependium.scornedAttunedTo = owner.uuid; await cleanConditionalArmor(); assert.equal(beast.effects.length, 1, "native transformation is not a new attunement");
const next = actor("next-beast"); next.flags.dnd5e = { originalActor: owner.id, isPolymorphed: true }; next.system.details.type.value = "beast"; next.effects = list(beast.effects.map(e => ({ ...e, parent: next })));
assert.equal(wildskinActive(next), false); await cleanConditionalArmor(); assert.equal(next.effects.length, 0, "cloned profile does not protect the next form");
for (const [base, dex, expected] of [[12, 4, 16], [18, 1, 18], [8, -2, 12]]) {
 const model = { parent: beast, attributes: { ac: { value: base, override: base } }, abilities: { dex: { mod: dex } } };
 finishWildskinArmorClass(model); assert.equal(model.attributes.ac.value, expected); assert.equal(model.attributes.ac.override, expected, "native flat AC overrides are respected and raised only when lower");
}
beast.flags.dnd5e.isPolymorphed = false; await cleanConditionalArmor(); assert.equal(beast.effects.length, 0);
game.user.targets = new Set(); await wildskinUse.call(activity, () => { throw Error("unexpected use"); }, {});
const formula = raw("wildskin").effects[0].system.changes[0].value;
globalThis.Roll = class { constructor(f) { this.formula = f; } evaluateSync() { assert.match(this.formula, /^[\d\s+().,min-]+$/); this.total = Function(`return ${this.formula.replaceAll("min(", "Math.min(")}`)(); return this; } };
for (const [natural, dex, expected] of [[8, 4, 16], [18, 1, 18], [8, -2, 12]]) {
 CONFIG.DND5E.armorClasses = { natural: { formula: String(natural) } };
 const ac = { calcs: new Set(["natural"]), formulas: [{ formula, label: "Wildskin" }], base: -Infinity, armor: 10, shield: 0, cover: 0, min: 0, bonus: 0, override: null };
 const model = { attributes: { ac }, abilities: { dex: { mod: dex } }, parent: { _preparationWarnings: [], itemTypes: { equipment: [] }, coverBonus: 0 } };
 nativeGriffonArmorClass.call(model, model); assert.equal(ac.value, expected);
}
console.log("Conditional GS2 armor: unattuned light controls/native stealth and pre-multiplier movement, poison/charm scope, persistent curse/removal/reattunement, chosen-allies distances/cap, paid original-druid beast-only form and native best-AC formula passed.");
