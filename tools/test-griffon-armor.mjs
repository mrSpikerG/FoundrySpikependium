import assert from "node:assert/strict";
import fs from "node:fs";
import bases from "./data/griffon-armor-bases.json" with { type: "json" };
import { GRIFFON_ARMOR } from "../src/content/griffons-saddlebag-armor.mjs";
import { canUseGriffonArmor, guardGriffonShieldEquip, prepareGriffonArmorUpdates, prepareBattlechefSave, prepareStarmetalThrow,
  recordFrostReturn, applyFrostReturn, griffonShortRest, prepareMoonHitDie, finishShieldMovement, finishGriffonArmorUse, cleanGriffonArmorProfiles,
  endBarricadeOnMove, guardDarkFathomSave, guardDarkFathomDamage, guardDarkFathomEffect } from "../scripts/griffon-armor.mjs";
import { magusMaskSpellChanges } from "../scripts/mechanics.mjs";
import { limitRestoration } from "../scripts/resources.mjs";
import { nativeGriffonArmorClass, nativeGriffonCastChanges, NativeGriffonEquipment, nativeGriffonRollHitDie, nativeGriffonBasicConfigure } from "./data/dnd5e-griffon-native.mjs";
import { nativeUsesConsumption } from "./data/dnd5e-monsters-native.mjs";
import { nativeApplyDamage, nativeCalculateDamage } from "./data/dnd5e-guardian-native.mjs";
import { getDeltas as nativeGetDeltas } from "./data/dnd5e-reaction-native.mjs";
const docs = new Map(), folders = new Map();
for (const file of fs.readdirSync("packs/_source/items")) { const d = JSON.parse(fs.readFileSync(`packs/_source/items/${file}`, "utf8")); if (d._key.startsWith("!folders!")) folders.set(d._id, d); else docs.set(d.flags.spikependium.key, d); }
const get = id => { const d = docs.get(`item:gs1:${id}`); assert.ok(d, id); return d; }, acts = d => Object.values(d.system.activities);
const evidence = JSON.parse(fs.readFileSync("tools/data/griffon-armor.json", "utf8")), translations = JSON.parse(fs.readFileSync("babele/ru/spikependium.items.json", "utf8")).entries;
assert.equal(evidence.entries.length, 13); assert.equal(GRIFFON_ARMOR.length, 13); assert.equal(evidence.entries.flatMap(e => e.variants).length, 17);
for (const row of evidence.entries) for (const key of row.variants) {
  const d = docs.get(key); assert.ok(d, key); assert.equal(d.type, "equipment"); assert.equal(d.system.source.custom, row.url); assert.equal(d.system.source.rules, "2024"); assert.equal(d.system.source.page, "");
  assert.ok(translations[d._id].name.startsWith(row.name.slice(0, row.name.lastIndexOf(" [")))); assert.equal(d.system.rarity, row.rarity); assert.equal(d.system.attunement, row.attunement.startsWith("Да") ? "required" : "");
  const base = bases.records.find(r => d.flags.spikependium.nativeBase.endsWith(r.document._id)).document;
  assert.equal(d.system.weight.value, base.system.weight.value); assert.equal(d.system.price.value, { uncommon: 400, rare: 4000, veryRare: 40000, legendary: 200000 }[row.rarity] + base.system.price.value);
  assert.equal(d.system.type.baseItem, base.system.type.baseItem); assert.equal(d.system.type.value, base.system.type.value); assert.equal(d.system.properties.includes("stealthDisadvantage"), base.system.properties.includes("stealthDisadvantage"));
  let current = d.folder, found = false; while (current) { const f = folders.get(current); assert.ok(f); found ||= f.name === "Сумка грифона — книга 1"; current = f.folder; } assert.ok(found);
  for (const a of acts(d)) { assert.equal(a.consumption.spellSlot, false); for (const e of a.effects ?? []) assert.ok(d.effects.some(p => p._id === e._id)); }
}
assert.deepEqual(get("ink-shield").system.properties, []); assert.equal(get("ironleaf").flags.spikependium.griffonClass, "druid");
assert.equal(acts(get("dragon-turtle"))[0].target.template.size, "22.5"); assert.equal(acts(get("dragon-turtle"))[0].duration.value, "1");
assert.equal(get("bloom-shield").system.uses.recovery[0].period, "dusk"); assert.equal(get("ink-shield").system.uses.recovery.length, 0);
assert.equal(acts(get("bloom-shield"))[0].damage.onSave, "half"); assert.equal(acts(get("festerwood-buckler"))[0].damage.onSave, "none");
assert.ok(get("barricade").effects[0].system.changes.some(c => c.key.endsWith(".multiplier") && c.value === "0"));

const set = (obj, path, value) => { const keys = path.split("."), last = keys.pop(); for (const k of keys) obj = obj[k] ??= {}; obj[last] = value; };
const merge = (a, b) => { for (const [k, v] of Object.entries(b)) { if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Set)) { a[k] ??= {}; merge(a[k], v); } else a[k] = v; } return a; };
const list = a => Object.assign(a, { get(id) { return this.find(d => d.id === id); } });
const world = new Map(), listeners = new Map(), pending = [];
globalThis.fromUuidSync = (uuid, options = {}) => world.get(uuid?.startsWith(".") ? `${options.relative.uuid}${uuid}` : uuid);
globalThis.ui = { notifications: { warn() {}, error() {} } };
globalThis.Hooks = { call(name, ...args) { for (const fn of listeners.get(name) ?? []) if (fn(...args) === false) return false; return true; }, callAll(name, ...args) { for (const fn of listeners.get(name) ?? []) pending.push(Promise.resolve(fn(...args))); } };
globalThis.foundry = { utils: { mergeObject: merge, deepClone: structuredClone, flattenObject: flat => flat, isEmpty: o => Object.keys(o).length === 0, iterateEntries: Object.entries, getProperty: (o, path) => path.split(".").reduce((v, k) => v?.[k], o) }, applications: { instances: new Map() } };
globalThis.game = { user: { id: "player", isActiveGM: true }, users: { activeGM: null }, actors: [], scenes: [], messages: new Map() };
globalThis.dnd5e = { settings: { rulesVersion: "modern" } }; globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}) } };
Math.clamp ??= (n, min, max) => Math.max(min, Math.min(max, n)); Number.isNumeric ??= n => typeof n === "number" && Number.isFinite(n);
String.prototype.capitalize ??= function() { return this.charAt(0).toUpperCase() + this.slice(1); };
globalThis.CONFIG = { DND5E: { equipmentTypes: { light: "Light", shield: "Shield" }, shieldIds: {}, armorIds: {}, armorTypes: { light: {}, shield: {} }, skills: {},
  armorClasses: { unarmored: { formula: "10 + @abilities.dex.mod" }, armored: { formula: "@attributes.ac.armor + @attributes.ac.dex", armored: true } },
  damageTypes: { cold: {}, fire: {} }, healingTypes: { healing: {}, temphp: {} }, movementTypes: { walk: {}, fly: {}, swim: {}, climb: {}, burrow: {} } }, Item: { typeLabels: { equipment: "Equipment" } }, Dice: {} };
globalThis.Roll = class { constructor(formula) { this.formula = formula; } evaluateSync() { assert.match(this.formula, /^[\d\s+.()-]+$/); this.total = Function(`return ${this.formula}`)(); return this; } };
for (const [id, expected] of [["battlechef", 14], ["ironleaf", 15], ["yggdrasil", 15], ["starmetal-shield", 13], ["dark-fathom", 15], ["moonswaddled-padded", 13], ["moonswaddled-studded", 14]]) {
  const raw = get(id), equip = Object.assign(new NativeGriffonEquipment(), { ...structuredClone(raw.system), magicAvailable: true, parent: { getRollData: () => ({}) },
    prepareDescriptionData() {}, prepareIdentifiable() {}, preparePhysicalData() {}, prepareMountableData() {} });
  equip.prepareDerivedData(); equip.properties = new Set(equip.properties);
  const ac = { calcs: new Set(["unarmored", "armored"]), formulas: [], base: -Infinity, armor: 10, shield: 0, cover: 0, min: 0, bonus: 0, override: null };
  const model = { attributes: { ac }, abilities: { dex: { mod: 2 } }, parent: { _preparationWarnings: [], coverBonus: 0, itemTypes: { equipment: [{ system: { ...equip, equipped: true } }] } } };
  nativeGriffonArmorClass.call(model, model); assert.equal(ac.value, expected, `${id}: native prepared equipment and native AC`);
}
const tentacles = acts(get("dark-fathom"))[0], castChanges = magusMaskSpellChanges.call({ item: get("dark-fathom") }, () => nativeGriffonCastChanges.call({ ...tentacles, toObject: () => structuredClone(tentacles) }));
assert.ok(castChanges.some(c => c.key === "system.properties" && c.value === "-concentration")); assert.equal(castChanges.find(c => c.key === "activities[save].save.dc.formula").value, "15");
assert.equal(JSON.parse(castChanges.find(c => c.key === "system.target").value).template.size, "15");

function actor(uuid) {
  const a = { uuid, isOwner: true, flags: { spikependium: {} }, statuses: new Set(), items: list([]), effects: list([]), system: { attributes: { prof: 3, hp: { value: 10, effectiveMax: 30, max: 30, temp: 0, tempmax: 0, damage: 20 } }, abilities: { str: { value: 18 } }, traits: {}, _source: { attributes: { hp: { tempmax: 0 } } } },
    getRollData: () => ({ abilities: { con: { mod: 2 } } }), changeHasEffect(kind) { return kind === "immunity" ? !!this.immune : kind === "resistance" && !!this.resistant; }, changeIsIgnored: () => false,
    calculateDamage(data, options) { return nativeCalculateDamage.call(this, data, options); }, async update(changes) { for (const [k, v] of Object.entries(changes)) set(this, k, v); this.system.attributes.hp.damage = this.system.attributes.hp.max - this.system.attributes.hp.value; },
    async deleteEmbeddedDocuments(type, ids) { assert.equal(type, "ActiveEffect"); this.effects = list(this.effects.filter(e => !ids.includes(e.id))); } };
  world.set(uuid, a); game.actors.push(a); return a;
}
function ownedItem(id, a) { const i = structuredClone(get(id)); i.id = i._id; i.uuid = `${a.uuid}.Item.${i.id}`; i.actor = a; i.system.equipped = i.system.attuned = true; i.effects = list(i.effects.map(e => ({ ...e, id: e._id }))); a.items.push(i); return i; }
function activity(i, index = 0) { const a = { ...acts(i)[index], actor: i.actor, item: i, uuid: `${i.uuid}.Activity.${acts(i)[index]._id}` }; world.set(a.uuid, a); return a; }
const owner = actor("Actor.owner"), target = actor("Actor.target"), other = actor("Actor.other"), chef = ownedItem("battlechef", owner);
const saving = () => ({ subject: owner, rolls: [{ options: { advantageMode: -1 } }] });
game.messages.set("fire", { getAssociatedActivity: () => ({ damage: { parts: [{ types: new Set(["fire"]) }] } }) }); const fireSave = saving();
prepareBattlechefSave(fireSave, {}, { data: { system: { origin: "fire" } } }); assert.equal(fireSave.rolls[0].options.advantageMode, 0, "advantage cancels the existing disadvantage");
game.messages.set("choice", { getAssociatedActivity: () => ({ damage: { parts: [{ types: new Set(["fire", "cold"]) }] } }) }); const choiceSave = saving(); prepareBattlechefSave(choiceSave, {}, { data: { system: { origin: "choice" } } }); assert.equal(choiceSave.rolls[0].options.advantage, undefined);
chef.system.equipped = false; const unheldSave = saving(); prepareBattlechefSave(unheldSave, {}, { data: { system: { origin: "fire" } } }); assert.equal(unheldSave.rolls[0].options.advantage, undefined); chef.system.equipped = true;
const star = ownedItem("starmetal-shield", owner), starThrow = activity(star, 2), starConfig = { subject: starThrow, rolls: [{ parts: ["@mod", "@prof", "@ruleBonus"], data: { prof: 0 } }] };
prepareStarmetalThrow(starConfig); prepareStarmetalThrow(starConfig); assert.deepEqual(starConfig.rolls[0].parts, ["@mod", "@ruleBonus", "@spikependiumStarmetalProficiency"]); assert.equal(starConfig.rolls[0].data.spikependiumStarmetalProficiency, 3);
const ink = ownedItem("ink-shield", owner), inkShots = acts(ink).filter(a => a.flags?.spikependium?.griffonInkDC), squid = { ...inkShots[1], item: ink, actor: owner };
assert.equal(canUseGriffonArmor(squid), false); ink.system.uses.spent = 1;
const refill = { ...acts(ink).find(a => a.flags?.spikependium?.griffonInkRefill === 13), item: ink, actor: owner };
const paid = await nativeUsesConsumption.call({ resolveCost: async () => ({ total: -3 }) }, {}, { uses: { ...ink.system.uses, max: 3, value: 2 }, type: "charge", rolls: [], delta: {} });
const refillUpdates = { item: [{ _id: ink.id, "system.uses.spent": paid.spent }], actor: {} }; assert.equal(prepareGriffonArmorUpdates(refill, {}, refillUpdates), refillUpdates); assert.equal(limitRestoration(refill, refillUpdates), true); assert.equal(refillUpdates.item[0]["system.uses.spent"], 0);
const inkDeltas = nativeGetDeltas(ink, refillUpdates.item[0]); assert.deepEqual(inkDeltas, [{ keyPath: "system.uses.spent", delta: -1 }, { keyPath: "flags.spikependium.griffonInkDC", delta: 3 }], "native refund records both resource and selected ink without extra receipts");
ink.flags.spikependium.griffonInkDC = 13; assert.equal(canUseGriffonArmor(squid), undefined); assert.equal(prepareGriffonArmorUpdates(refill, {}, { item: [], actor: {} }), false, "no free mode switch when consumption is disabled");
ink.system.uses.spent = 0;
const ordinaryRefill = { ...refill, flags: { spikependium: { griffonInkRefill: 10 } } }, fullRefill = { item: [{ _id: ink.id, "system.uses.spent": -3 }], actor: {} };
assert.equal(prepareGriffonArmorUpdates(ordinaryRefill, {}, fullRefill), fullRefill); assert.equal(fullRefill.item[0]["system.uses.spent"], undefined); assert.equal(limitRestoration(ordinaryRefill, fullRefill), true, "full reservoir can be replaced with another ink without creating extra charges");
assert.deepEqual(nativeGetDeltas(ink, fullRefill.item[0]), [{ keyPath: "flags.spikependium.griffonInkDC", delta: -3 }]);
assert.equal(prepareGriffonArmorUpdates(refill, {}, { item: [{ _id: ink.id, "system.uses.spent": -3 }], actor: {} }), false, "already full matching ink needs no refill");

const frostItem = ownedItem("frostbitten", owner), cold = activity(frostItem), origin = { id: "cold1", getAssociatedActivity: () => cold };
listeners.set("dnd5e.preApplyDamage", [recordFrostReturn]); listeners.set("dnd5e.applyDamage", [applyFrostReturn]);
const coldOptions = () => ({ originatingMessage: { getOriginatingMessage: () => origin } });
target.resistant = true; target.system.attributes.hp.temp = 10; await nativeApplyDamage.call(target, [{ type: "cold", value: 8 }], coldOptions()); await Promise.all(pending.splice(0)); assert.equal(owner.system.attributes.hp.temp, 4); assert.equal(target.system.attributes.hp.value, 10);
owner.system.attributes.hp.temp = 0; await nativeApplyDamage.call(target, [{ type: "cold", value: 8 }], coldOptions()); await Promise.all(pending.splice(0)); assert.equal(owner.system.attributes.hp.temp, 0, "same source card cannot grant temporary HP twice");
origin.id = "cold2"; target.resistant = false; target.system.attributes.hp.value = 1; target.system.attributes.hp.temp = 0; await nativeApplyDamage.call(target, [{ type: "cold", value: 8 }], coldOptions()); await Promise.all(pending.splice(0)); assert.equal(owner.system.attributes.hp.temp, 8, "overkill damage is not capped by remaining HP");
origin.id = "immune"; owner.system.attributes.hp.temp = 0; target.immune = true; await nativeApplyDamage.call(target, [{ type: "cold", value: 8 }], coldOptions()); await Promise.all(pending.splice(0)); assert.equal(owner.system.attributes.hp.temp, 0); target.immune = false;

const moon = ownedItem("moonswaddled-leather", owner), moonSource = activity(moon), night = { id: "night", active: true, flags: { spikependium: { griffonMoonNight: true } }, system: { origin: { activity: moonSource.uuid } } }; owner.effects.push(night);
const cls = { system: { hd: { value: 2, spent: 0, denomination: "d8" } }, async update(changes) { this.system.hd.spent = changes["system.hd.spent"]; this.system.hd.value = 2 - this.system.hd.spent; } }; owner.system.attributes.hd = { classes: [cls] }; owner.system.attributes.hp.value = 1;
listeners.set("dnd5e.preRollHitDieV2", [prepareMoonHitDie]);
CONFIG.Dice.BasicRoll = { getMessageMode: () => "publicroll", applyKeybindings() {}, fromConfig(r) { const formula = r.parts.join(" + "); return { parts: r.parts, options: {}, total: formula.includes("1d") ? 2 : 10 }; },
  async build(config, dialog, message) { return nativeGriffonBasicConfigure.call(this, config, dialog, message); } };
const hitDice = await griffonShortRest.call(owner, () => nativeGriffonRollHitDie.call(owner, { denomination: "d8", rolls: [{ parts: ["1d4"], data: {} }] }), { type: "short" });
assert.equal(hitDice[0].parts[0], "max(1, 8 + @abilities.con.mod)"); assert.equal(hitDice[1].parts[0], "1d4"); assert.equal(cls.system.hd.spent, 1); assert.equal(owner.system.attributes.hp.value, 13);
const outside = { subject: owner, rolls: [{ parts: ["1d8 + @abilities.con.mod"] }] }; prepareMoonHitDie(outside); assert.match(outside.rolls[0].parts[0], /1d8/);
await assert.rejects(() => griffonShortRest.call(owner, async () => { throw Error("cancelled"); }, { type: "short" })); prepareMoonHitDie(outside); assert.match(outside.rolls[0].parts[0], /1d8/);
await griffonShortRest.call(owner, async () => prepareMoonHitDie(outside), { type: "long" }); assert.match(outside.rolls[0].parts[0], /1d8/);
moon.system.equipped = false; await cleanGriffonArmorProfiles(); assert.ok(!owner.effects.includes(night)); moon.system.equipped = true;
const ygg = ownedItem("yggdrasil", owner), brace = activity(ygg), braced = { id: "brace", active: true, flags: { spikependium: { griffonYggdrasilBraced: true } }, system: { origin: { activity: brace.uuid } } }; owner.effects.push(braced);
const model = { parent: owner, attributes: { movement: { speeds: { walk: 60, fly: 120, burrow: 0, swim: 0, climb: 2 }, max: 120 } } }; finishShieldMovement(model); assert.deepEqual(model.attributes.movement.speeds, { walk: 5, fly: 5, burrow: 0, swim: 0, climb: 2 }); assert.equal(model.attributes.movement.max, 5);
owner.system.abilities.str.value = 16; assert.equal(guardGriffonShieldEquip(ygg, { "system.equipped": true }), false); owner.system.abilities.str.value = 18;
const roots = { id: "roots", active: true, flags: { spikependium: { griffonYggdrasilRoots: true } }, system: { origin: { activity: brace.uuid } } }; owner.effects.push(roots); owner.statuses.add("unconscious"); await cleanGriffonArmorProfiles(); assert.ok(!owner.effects.includes(braced) && !owner.effects.includes(roots)); owner.statuses.clear();
const wall = ownedItem("barricade", owner), held = { id: "wall", flags: { spikependium: { griffonBarricadeHeld: true } }, system: { origin: { activity: activity(wall).uuid } } }; owner.effects.push(held);
await endBarricadeOnMove({ actor: owner }, { x: 1 }, {}, "player"); assert.ok(!owner.effects.includes(held)); owner.effects.push(held);
await finishGriffonArmorUse({ actor: owner, item: wall, flags: { spikependium: { griffonEndShieldProfile: "griffonBarricadeHeld" } } }, { message: {} }); assert.ok(!owner.effects.includes(held));
const privateTentacles = { actor: owner, item: { type: "spell", system: { sourceItem: "equipment:griffon-dark-fathom" } } }; game.messages.set("tentacles", { getAssociatedActivity: () => privateTentacles }); world.set("Activity.tentacles", privateTentacles);
assert.equal(guardDarkFathomSave({ subject: owner }, {}, { data: { system: { origin: "tentacles" } } }), false); assert.equal(guardDarkFathomSave({ subject: other }, {}, { data: { system: { origin: "tentacles" } } }), undefined);
const tentacleOptions = { originatingMessage: { getOriginatingMessage: () => game.messages.get("tentacles") } }; assert.equal(guardDarkFathomDamage(owner, 8, {}, tentacleOptions), false); assert.equal(guardDarkFathomDamage(other, 8, {}, tentacleOptions), undefined);
assert.equal(guardDarkFathomEffect({ parent: owner, system: { origin: { activity: "Activity.tentacles" } } }), false); privateTentacles.item.system.sourceItem = ""; assert.equal(guardDarkFathomDamage(owner, 8, {}, tentacleOptions), undefined);
console.log("GS1 armor: 13 source entries/17 Russian variants, native base weights/prices/AC, paid ink modes, scoped fire saves, actual cold damage temporary HP, native short-rest maximum HD, shield speed/lifecycle and concentration-free self-immune tentacles passed.");
