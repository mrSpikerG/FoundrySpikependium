import assert from "node:assert/strict";
import fs from "node:fs";
import { ALCHEMIST_FORMULAS, ALCHEMIST_URL, ALCHEMIST_SAVE_DC } from "../src/content/alchemist-formulas.mjs";
import { Filter } from "./data/dnd5e-magus-native.mjs";
import { nativeItemChoiceCounts, nativeUsesConsumption } from "./data/dnd5e-monsters-native.mjs";
import { guardMagusHealing } from "../scripts/magus-spells.mjs";
const docs = fs.readdirSync("packs/_source/classes").filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(`packs/_source/classes/${f}`, "utf8")));
const get = key => { const item = docs.find(d => d.flags?.spikependium?.key === key); assert.ok(item, key); return item; };
const acts = item => Object.values(item.system.activities ?? {});
const cls = get("class:alchemist"), advances = cls.system.advancement;
const formulaDocs = docs.filter(d => d.flags?.spikependium?.key?.startsWith("alchemist:formula:"));
assert.equal(formulaDocs.length, 24); assert.equal(ALCHEMIST_FORMULAS.length, 24);
const choice = advances.find(a => a.type === "ItemChoice" && a.title === "Известные формулы бомб");
assert.equal(choice.configuration.allowDrops, false); assert.equal(choice.configuration.pool.length, 24);
assert.deepEqual(new Set(choice.configuration.pool.map(i => i.uuid.split(".").at(-1))), new Set(formulaDocs.map(d => d._id)));
const expected = { 2: 3, 5: 1, 7: 1, 9: 1, 11: 1, 13: 1, 15: 1, 17: 1, 19: 1 };
assert.equal(Object.values(choice.configuration.choices).reduce((sum, c) => sum + c.count, 0), 11);
for (let level = 2; level <= 20; level++) {
  assert.deepEqual(choice.configuration.choices[level], { count: expected[level] ?? 0, replacement: level > 2 });
  const host = { configuration: choice.configuration, value: { added: {}, replaced: {} } };
  assert.equal(nativeItemChoiceCounts.call(host, level).max, expected[level] ?? 0);
  host.value.replaced[level] = { previous: "previous" };
  assert.equal(nativeItemChoiceCounts.call(host, level).max, (expected[level] ?? 0) + (level > 2 ? 1 : 0));
}
const scales = new Map(advances.filter(a => a.type === "ScaleValue").map(a => [a.configuration.identifier, a.configuration]));
assert.deepEqual(Object.fromEntries(Object.entries(scales.get("discoveries-known").scale).map(([k, v]) => [k, v.value])), { 4: 2, 6: 3, 9: 4, 13: 5, 17: 6 });
assert.equal(scales.get("formulas-known").scale[19].value, 11);
const scaleAt = (name, level) => Object.entries(scales.get(name).scale).filter(([key]) => Number(key) <= level).at(-1)[1];
for (const f of ALCHEMIST_FORMULAS) {
  const doc = get(`alchemist:formula:${f.id}`);
  assert.equal(doc.name, f.name); assert.ok(doc.folder); assert.equal(doc.type, "feat"); assert.equal(doc.system.prerequisites.level, 2);
  assert.equal(doc.system.source.custom, ALCHEMIST_URL); assert.equal(doc.system.source.page, "");
  assert.equal(doc.system.source.book, f.efc ? "EfC" : "VSS"); assert.equal(doc.system.source.rules, "2014");
  const attacks = acts(doc).filter(a => a.type === "attack");
  assert.equal(attacks.length, f.die ? f.id === "holy" ? 12 : 4 : 0);
  for (const a of acts(doc).filter(a => ["attack", "teleport"].includes(a.type) || a.name === "Бросить заряженную бомбу")) {
    assert.equal(a.activation.type, "action"); assert.equal(a.consumption.spellSlot, false);
    assert.deepEqual(a.consumption.targets.map(t => [t.type, t.target, t.value]), [["itemUses", "feat:alchemist-bombs", "1"]]);
  }
  for (const a of attacks) {
    assert.ok(["str", "dex"].includes(a.attack.ability)); assert.equal(a.attack.type.classification, "weapon"); assert.equal(a.attack.type.value, "ranged");
    assert.equal(a.damage.includeBase, false); assert.equal(a.range.value, "30");
    const part = a.damage.parts[0]; assert.equal(part.custom.enabled, true);
    const damageAbility = a.name.includes("урон от Интеллекта") ? "int" : a.attack.ability;
    assert.equal((part.custom.formula.match(/@abilities\.\w+\.mod/g) ?? []).length, 1);
    assert.ok(part.custom.formula.endsWith(`@abilities.${damageAbility}.mod`)); assert.ok(!part.custom.formula.includes("@mod"));
    const identifier = part.custom.formula.match(/@scale\.alchemist\.([\w-]+)/)[1];
    const faces = Number(identifier.match(/d(\d+)$/)?.[1] ?? 10);
    for (const [level, number] of [[2, 1], [5, 2], [11, 3], [17, 4], [20, 4]]) {
      const scale = scaleAt(identifier, level); assert.equal(scale.number, number); assert.equal(scale.faces, faces);
    }
    assert.deepEqual(part.types, [f.type].flat());
  }
  for (const a of acts(doc).filter(a => a.type === "save")) {
    assert.deepEqual(a.save.ability, [f.save].flat()); assert.equal(a.save.dc.formula, ALCHEMIST_SAVE_DC);
    assert.deepEqual(a.damage.parts, [], "splash uses the original damage, never rolls a second set of dice"); assert.equal(a.damage.onSave, "none");
    assert.equal(a.target.template.size, String(f.radius ?? 7.5)); assert.deepEqual(a.consumption.targets, []);
  }
  if (f.efc) assert.equal(acts(doc).find(a => a.name === "Подготовить формулу (EfC)").activation.type, "bonus");
}
const dataset = JSON.parse(fs.readFileSync("tools/data/alchemist-starting-gear.json", "utf8"));
const gear = new Map(dataset.gear.map(g => [g.name, g.uuid]));
assert.equal(dataset.gear.filter(g => g.simple).length, 14); assert.ok(dataset.gear.every(g => !g.path.endsWith("_folder.yml")));
const equipment = cls.system.startingEquipment, byId = new Map(equipment.map(e => [e._id, e]));
assert.equal(equipment.length, 28); assert.equal(byId.size, 28);
for (const e of equipment) { if (e.group) assert.ok(["OR", "AND"].includes(byId.get(e.group).type)); if (e.type === "linked") assert.ok([...gear.values()].includes(e.key)); }
const children = group => equipment.filter(e => e.group === group._id);
const roots = equipment.filter(e => !e.group);
assert.equal(roots.length, 6); assert.equal(roots.filter(e => e.type === "OR").length, 3);
assert.deepEqual(new Set(roots.filter(e => e.type === "linked").map(e => e.key)), new Set(["Alchemist's Supplies", "Leather Armor", "Dagger"].map(name => gear.get(name))));
const crossbow = equipment.find(e => e.type === "AND"); assert.equal(byId.get(crossbow.group).type, "OR");
assert.deepEqual(children(crossbow).map(e => [e.key, e.count]), [[gear.get("Light Crossbow"), null], [gear.get("Bolts"), 20]]);
const weaponOptions = children(byId.get(crossbow.group)).filter(e => e.type === "linked");
assert.deepEqual(new Set(weaponOptions.map(e => e.key)), new Set(dataset.gear.filter(g => g.simple).map(g => g.uuid)));
assert.ok(roots.some(e => e.type === "OR" && children(e).length === 2 && children(e).some(c => c.key === gear.get("Explorer's Pack"))));
assert.ok(roots.some(e => e.type === "OR" && children(e).length === 3 && children(e).some(c => c.key === gear.get("Poison, Basic"))));
assert.equal(acts(get("alchemist:flash"))[0].consumption.targets[0].target, "feat:alchemist-bombs");
globalThis.ui = { notifications: { warn() {} } };
globalThis.foundry = { utils: { isEmpty: o => Object.keys(o).length === 0, getType: v => Array.isArray(v) ? "Array" : typeof v, getProperty: (o, k) => k.split(".").reduce((v, key) => v?.[key], o) } };
const effect = id => get(`alchemist:formula:${id}`).effects[0];
assert.deepEqual(effect("stink").system.changes.map(c => [c.key, c.value]), [["system.rolls.ability.check.mode", "-1"]]);
assert.equal(effect("stink").duration.expiry, "targetEnd");
assert.deepEqual(effect("laughing").statuses, ["prone"]); assert.equal(effect("laughing").duration.expiry, null, "prone is not automatically removed next turn");
assert.equal(effect("freezing").system.changes[0].key, "system.attributes.movement.bonus"); assert.equal(effect("freezing").system.changes[0].value, "-10");
assert.equal(effect("electric").flags.spikependium.noReactions, true); assert.equal(effect("electric").duration.expiry, "targetEnd");
const filter = new Filter(JSON.parse(effect("psychic").system.conditions));
for (const [ability, result] of [["", true], ["con", true], ["wis", false]]) assert.equal(filter.check({ attributes: { concentration: { ability } } }), result);
const target = { effects: [{ active: true, flags: effect("withering").flags }], statuses: new Set(), system: { attributes: { hp: { value: 10, temp: 0 } } } };
assert.equal(guardMagusHealing(target, -5, {}), false); assert.equal(guardMagusHealing(target, 5, {}), undefined);
assert.equal(guardMagusHealing(target, 0, { "system.attributes.hp.temp": 7 }), undefined);
const mixed = { "system.attributes.hp.temp": 7, "system.attributes.hp.value": 15 }; guardMagusHealing(target, -5, mixed); assert.equal(mixed["system.attributes.hp.value"], 10);
target.effects[0].active = false; assert.equal(guardMagusHealing(target, -5, {}), undefined);
const teleport = acts(get("alchemist:formula:teleporting"))[0]; assert.equal(teleport.type, "teleport"); assert.equal(teleport.teleport.value, "30");
assert.equal(acts(get("alchemist:formula:prismatic")).filter(a => a.type === "utility" && a.roll.formula === "1d6").length, 2);
assert.deepEqual(new Set(acts(get("alchemist:formula:holy")).filter(a => a.type === "attack").map(a => a.damage.parts[0].custom.formula.match(/bomb-d(\d+)/)[1])), new Set(["6", "8", "12"]));
globalThis.game = { i18n: { localize: key => key } };
await assert.rejects(() => nativeUsesConsumption.call({ resolveCost: async () => ({ total: 1 }) }, {}, { uses: { max: 20, spent: 20, value: 0 }, type: "uses", rolls: [], delta: {} }));
console.log("Alchemist: 24 general formulas, level/replacement counts, exact native gear choices, damage scaling, effects/healing guard and shared bombs passed.");
