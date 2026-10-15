import assert from "node:assert/strict";
import fs from "node:fs";
import { ALCHEMIST_GRAFTS } from "../src/content/alchemist-grafts.mjs";
import { ALCHEMIST_URL } from "../src/content/alchemist-formulas.mjs";
import { graftActiveState, guardGraftEquip, canUseGraft } from "../scripts/alchemist-grafts.mjs";
import { Filter } from "./data/dnd5e-magus-native.mjs";
import { nativeGriffonArmorClass, nativeEquipmentProficiency } from "./data/dnd5e-griffon-native.mjs";
const docs = new Map(), uuids = new Map(), folders = new Map();
for (const pack of ["classes", "items", "subclasses", "rules"]) for (const file of fs.readdirSync(`packs/_source/${pack}`)) {
  const d = JSON.parse(fs.readFileSync(`packs/_source/${pack}/${file}`, "utf8"));
  if (d._key.startsWith("!folders!")) folders.set(d._id, d);
  else { docs.set(d.flags.spikependium.key, d); uuids.set(`Compendium.spikependium.${pack}.Item.${d._id}`, d); }
}
const get = key => { assert.ok(docs.has(key), key); return docs.get(key); }, acts = d => Object.values(d.system.activities ?? {});
const evidence = JSON.parse(fs.readFileSync("tools/data/alchemist-grafts.json", "utf8"));
assert.equal(evidence.entries.length, 26); assert.equal(ALCHEMIST_GRAFTS.length, 26);
const gears = [...docs.values()].filter(d => d.flags.spikependium.key.startsWith("item:alchemist-graft:")); assert.equal(gears.length, 61);
for (const row of evidence.entries) {
  const template = get(row.key), advancement = template.system.advancement[0];
  assert.equal(template.system.type.value, "class", "biological grafts must stay out of general ASI feat choices");
  assert.equal(advancement.level, 0);
  const pool = advancement.configuration.pool ?? advancement.configuration.items;
  assert.equal(pool.length, row.variants.length);
  if (row.variants.length > 1) {
    assert.equal(advancement.type, "ItemChoice"); assert.equal(advancement.configuration.type, "equipment");
    assert.equal(advancement.configuration.choices[0].count, 1); assert.equal(advancement.configuration.allowDrops, false);
  } else assert.equal(advancement.type, "ItemGrant");
  for (const variant of row.variants) {
    const item = get(variant.key); assert.ok(pool.some(p => uuids.get(p.uuid) === item));
    assert.equal(item.type, "equipment"); assert.equal(item.system.equipped, false);
    assert.equal(item.system.price.value, row.price); assert.ok(item.system.weight.value > 0);
    assert.match(item.system.description.value, /[Вв]ес оценочный/); assert.equal(item.flags.spikependium.graft.slot, variant.slot);
    assert.equal(nativeEquipmentProficiency.call(item.system), 1);
    for (const a of acts(item).filter(a => a.type === "attack")) {
      assert.equal(a.attack.type.classification, "unarmed"); assert.equal(a.damage.includeBase, false);
      assert.equal(a.damage.parts[0].number, 1); assert.equal(a.damage.parts[0].denomination, 6); assert.equal(a.damage.parts[0].bonus, "@mod");
      assert.equal(a.damage.parts[0].types[0], variant.damage ?? "bludgeoning");
    }
  }
  for (const d of [template, ...row.variants.map(v => get(v.key))]) {
    assert.equal(d.system.source.book, "VSS"); assert.equal(d.system.source.rules, "2014"); assert.equal(d.system.source.custom, ALCHEMIST_URL); assert.equal(d.system.source.page, "");
    let parent = d.folder, found = false; while (parent) { const f = folders.get(parent); assert.ok(f); found ||= f.name === "Трансплантаты"; parent = f.folder; } assert.ok(found);
  }
}
const xeno = get("subclass:alchemist-xenochemist").system.advancement.find(a => a.title === "Два чудовищных трансплантата");
assert.ok(xeno); assert.equal(xeno.configuration.pool.length, 26); assert.equal(xeno.configuration.choices[2].count, 2); assert.equal(xeno.configuration.allowDrops, false);
for (const item of gears.filter(d => d.flags.spikependium.graft.id === "dragon-lungs")) {
  const a = acts(item)[0]; assert.equal(a.type, "save"); assert.deepEqual(a.save.ability, ["dex"]); assert.equal(a.save.dc.calculation, "con");
  assert.equal(a.target.template.type, "cone"); assert.equal(a.target.template.size, "15"); assert.equal(a.damage.parts[0].custom.formula, "@prof d6");
  assert.equal(a.damage.onSave, "half"); assert.equal(a.consumption.targets[0].type, "itemUses"); assert.equal(item.system.uses.recovery[0].period, "sr");
}
const web = acts(get("item:alchemist-graft:web-gland"))[0]; assert.equal(web.type, "cast"); assert.equal(web.spell.ability, "con");
assert.equal(web.consumption.spellSlot, false); assert.deepEqual(web.spell.properties, ["material"], "Cast stores excluded components; verbal/somatic remain required");
const regen = acts(get("item:alchemist-graft:regeneration"))[0]; assert.equal(regen.activation.type, "bonus"); assert.equal(regen.healing.number, 1); assert.equal(regen.healing.denomination, 10); assert.equal(regen.healing.bonus, "@abilities.con.mod");
for (const key of ["alchemist:graft:magic-synapses", "alchemist:graft:magic-synapses-upgrade"]) {
  const a = get(key).system.advancement.find(a => a.type === "ItemChoice");
  assert.equal(a.configuration.type, "spell"); assert.deepEqual(a.configuration.restriction.list, ["class:wizard"]); assert.deepEqual(a.configuration.spell.ability, ["int"]); assert.equal(a.configuration.restriction.level, "0");
}
assert.deepEqual(get("alchemist:graft:magic-synapses-upgrade").system.prerequisites.items, ["feat:alchemist-graft-magic-synapses"]);
globalThis.ui = { notifications: { warn() {} } };
globalThis.foundry = { utils: { isEmpty: x => Object.keys(x).length === 0, getProperty: (x, p) => p.split(".").reduce((v, k) => v?.[k], x), iterateEntries: Object.entries, getType: x => Array.isArray(x) ? "Array" : typeof x } };
const actor = { isOwner: true, items: [], system: { traits: { armorProf: { value: new Set() } } } };
const owned = key => { const d = structuredClone(get(key)); d.id = d._id; d.actor = actor; actor.items.push(d); return d; };
const head = owned("item:alchemist-graft:darkvision"), other = owned("item:alchemist-graft:amphibious");
assert.equal(canUseGraft({ item: head, actor }), false); assert.equal(guardGraftEquip(head, { "system.equipped": true }), undefined);
head.system.equipped = true; assert.equal(canUseGraft({ item: head, actor }), undefined);
assert.equal(guardGraftEquip(other, { system: { equipped: true } }), false);
other.system.equipped = true; assert.equal(graftActiveState(actor)[head.system.identifier], false); assert.equal(graftActiveState(actor)[other.system.identifier], false);
assert.equal(guardGraftEquip(head, { "system.equipped": false }), undefined); other.system.quantity = 0; assert.equal(graftActiveState(actor)[head.system.identifier], true);
for (const active of [true, false]) {
  head.system.equipped = active;
  assert.equal(new Filter(JSON.parse(head.effects[0].system.conditions)).check({ spikependium: { graftActive: graftActiveState(actor) } }), active);
}
const scales = owned("item:alchemist-graft:dragon-scales:fire"); assert.equal(guardGraftEquip(scales, { "system.equipped": true }), false);
actor.system.traits.armorProf.value.add("hvy"); assert.equal(guardGraftEquip(scales, { "system.equipped": true }), undefined);
scales.system.equipped = true; assert.equal(graftActiveState(actor)[scales.system.identifier], true);
actor.system.traits.armorProf.value.clear(); assert.equal(graftActiveState(actor)[scales.system.identifier], false);
const synapses = owned("item:alchemist-graft:magic-synapses"), spell = { type: "spell", system: { sourceItem: "feat:alchemist-graft-magic-synapses" } };
assert.equal(canUseGraft({ item: spell, actor }), false); synapses.system.equipped = true; assert.equal(canUseGraft({ item: spell, actor }), undefined);
head.system.equipped = true; assert.equal(canUseGraft({ item: spell, actor }), false);
spell.system.sourceItem = "class:wizard"; assert.equal(canUseGraft({ item: spell, actor }), undefined);
globalThis.CONFIG = { DND5E: { armorClasses: { unarmored: { formula: "10 + @abilities.dex.mod" }, armored: { formula: "@attributes.ac.armor + @attributes.ac.dex", armored: true } }, armorTypes: { heavy: {}, shield: {} }, armorProficienciesMap: {}, healingTypes: {} } };
globalThis.Roll = class { constructor(formula) { this.formula = formula; } evaluateSync() { assert.match(this.formula, /^[\d\s+(),.min-]+$/); this.total = Function("min", `return (${this.formula})`)(Math.min); return this; } };
for (const [key, dex, armor, shield, expected] of [["beast-hide", 4, 0, 0, 17], ["beast-hide", 0, 18, 0, 18], ["fiend-scales", 5, 0, 2, 19], ["fiend-scales", -1, 0, 0, 14], ["dragon-scales:fire", 4, 0, 2, 19]]) {
  const formula = get(`item:alchemist-graft:${key}`).effects[0].system.changes.find(c => c.key === "system.attributes.ac.formulas").value;
  const ac = { calcs: new Set(["unarmored", "armored"]), formulas: [{ formula, label: "Трансплантат" }], base: -Infinity, armor: 10, shield: 0, cover: 0, min: 0, bonus: 0, override: null };
  const model = { attributes: { ac }, abilities: { dex: { mod: dex } }, parent: { _preparationWarnings: [], coverBonus: 0, itemTypes: { equipment: [
    ...(armor ? [{ name: "Латы", system: { equipped: true, type: { value: "heavy" }, armor: { value: armor }, properties: new Set() } }] : []),
    ...(shield ? [{ name: "Щит", system: { equipped: true, type: { value: "shield" }, armor: { value: shield } } }] : []) ] } } };
  nativeGriffonArmorClass.call(model, model); assert.equal(ac.value, expected); assert.deepEqual(model.parent._preparationWarnings, []);
}
assert.equal(head.effects[0].system.changes[0].type, "upgrade"); assert.equal(head.effects[0].system.changes[0].value, "60");
assert.deepEqual(get("item:alchemist-graft:aberrant-anatomy").effects, [], "critical-only protection must not grant blanket damage immunity");
console.log("Alchemist grafts: 26 source types/61 priced physical variants, native equipment grants, attacks/AC/saves/cantrips, body conflicts, heavy proficiency and installed-only effects/actions passed.");
