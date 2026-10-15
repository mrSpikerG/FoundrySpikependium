import assert from "node:assert/strict";
import fs from "node:fs";
import { MAGUS_SUBCLASSES } from "../src/content/subclasses-magus.mjs";
import { conditionalState, magusMaskSpellChanges } from "../scripts/mechanics.mjs";
import { Filter, nativeMagusTraitApply, nativeMagusTraitSelected, setMagusTraitHost } from "./data/dnd5e-magus-native.mjs";
import { nativeRecoverUses, nativeUsesConsumption, nativeItemChoiceCounts, nativeSpellChanges } from "./data/dnd5e-monsters-native.mjs";
const read = pack => fs.readdirSync(`packs/_source/${pack}`).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(`packs/_source/${pack}/${f}`, "utf8")));
const docs = read("subclasses").filter(d => d.system?.source?.book === "MAGUS-PT3"), journals = read("rules");
const find = key => { const doc = docs.find(d => d.flags.spikependium.key === key); assert.ok(doc, key); return doc; };
const feature = (sub, id) => find(`subclass:magus-${sub}:${id}`);
const acts = item => Object.values(item.system.activities ?? {});
const translation = JSON.parse(fs.readFileSync("babele/ru/spikependium.subclasses.json", "utf8")).entries;
assert.equal(docs.filter(d => d.type === "subclass").length, 6);
assert.equal(docs.filter(d => d.type === "feat").length, 37);
const ids = new Map(docs.map(d => [d._id, d]));
for (const sub of MAGUS_SUBCLASSES) {
  const doc = find(`subclass:magus-${sub.id}`);
  assert.equal(translation[doc._id].name, sub.name); assert.equal(doc.system.classIdentifier, "magus");
  const features = doc.system.advancement.filter(a => a.type === "ItemGrant" && !a.configuration.spell);
  assert.deepEqual(features.map(a => a.level), [3, 7, 14, 20]);
  for (const a of features) for (const i of a.configuration.items) assert.equal(ids.get(i.uuid.split(".").at(-1)).system.prerequisites.level, a.level);
  const spellGrants = doc.system.advancement.filter(a => a.type === "ItemGrant" && a.configuration.spell);
  assert.deepEqual(spellGrants.filter(a => a.level !== 7).map(a => a.level), [3, 5, 9, 13, 17]);
  for (const grant of spellGrants) {
    assert.deepEqual(grant.configuration.spell.ability, ["int"]); assert.equal(grant.configuration.spell.prepared, 2);
    assert.ok(grant.configuration.items.every(i => /^Compendium\./.test(i.uuid)));
  }
  const mark = feature(sub.id, "mark");
  assert.equal(acts(mark).length, 0, "unfinished marks cannot grant independent free powers");
  assert.ok(mark.system.description.value.includes("только при действующей"));
  const table = feature(sub.id, "magic").system.description.value;
  assert.equal((table.match(/<tr>/g) ?? []).length, 6); assert.ok(!table.includes("| --- |"));
  const list = journals.find(d => d.flags.spikependium?.key === `journal:spell-list-magus-${sub.id}`).pages[0].system;
  assert.equal(list.identifier, `magus-${sub.id}`); assert.equal(list.spells.length + list.unlinkedSpells.length, 12);
  assert.deepEqual(list.unlinkedSpells.map(s => s.name), ({ "knights-stygian": ["Смертельный ужас", "Стигийский взрыв"], "shadow-court": ["Притворная смерть"], "sylvan-circle": ["Терновый кнут"] })[sub.id] ?? []);
  for (const s of list.unlinkedSpells) assert.ok(!s.source.uuid && /[А-Яа-яЁё]/.test(s.name));
}
for (const doc of docs) {
  assert.ok(doc.folder); assert.equal(doc.system.source.rules, "2024");
  assert.ok(+doc.system.source.page >= 6 && +doc.system.source.page <= 12);
  for (const a of acts(doc)) if (a.save) assert.equal(a.save.dc.calculation, "int");
}
const get = (o, key) => key.split(".").reduce((v, k) => v?.[k], o);
globalThis.foundry = { utils: { getProperty: get, hasProperty: (o, k) => get(o, k) !== undefined, getType: v => Array.isArray(v) ? "Array" : v instanceof Set ? "Set" : typeof v, isEmpty: o => Object.keys(o).length === 0 } };
globalThis.CONFIG = { DND5E: { traits: { skills: { expertise: true } }, tools: {} } };
setMagusTraitHost({ changeKeyPath: key => `system.skills.${key.split(":").at(-1)}.value`, actorValues: async actor => ({ [`skills:${actor.skill}`]: actor.value }), choices: async () => ({ asSet: () => new Set(["skills:arc", "skills:ste", "skills:prc", "skills:nat"]) }) });
for (const [sub, id, skill] of [["arcane-order", "insights", "arc"], ["shadow-court", "training", "ste"], ["sidereal-cabal", "sight", "prc"], ["sylvan-circle", "spirit", "nat"]]) {
  const config = feature(sub, id).system.advancement.find(a => a.configuration.mode === "upgrade").configuration;
  assert.deepEqual(config.grants, [`skills:${skill}`]);
  for (const value of [0, 1, 2]) {
    const actor = { skill, value, system: { skills: { [skill]: { value } } }, updateSource(data) { this.updates = data; } };
    const advance = { actor, configuration: config, value: {}, updateSource() {} };
    await nativeMagusTraitApply.call(advance, 3, { chosen: config.grants });
    assert.equal(actor.updates[`system.skills.${skill}.value`], value === 0 ? 1 : 2);
    const available = await nativeMagusTraitSelected.call(advance); assert.equal(available.selected.has(`skills:${skill}`), value === 2);
  }
}
const wizardChoices = find("subclass:magus-arcane-order").system.advancement.find(a => a.type === "ItemChoice");
assert.equal(wizardChoices.configuration.choices[7].count, 2);
for (let level = 8; level <= 20; level++) assert.deepEqual(wizardChoices.configuration.choices[level], { count: 0, replacement: true });
assert.deepEqual(wizardChoices.configuration.restriction.list, ["class:wizard"]);
assert.equal(nativeItemChoiceCounts.call({ configuration: wizardChoices.configuration, value: { added: {}, replaced: {} } }, 8).max, 0);
for (const [sub, id, lists] of [["arcane-order", "insights", ["class:wizard"]], ["sylvan-circle", "spirit", ["class:magus", "class:druid"]]]) {
  const a = feature(sub, id).system.advancement.find(a => a.type === "ItemChoice");
  assert.equal(a.configuration.choices[3].count, 2); assert.deepEqual(a.configuration.restriction.list, lists);
  assert.equal(a.configuration.restriction.level, "0"); assert.deepEqual(a.configuration.spell.ability, ["int"]);
}
const shieldEffect = feature("heavens-guard", "gifts").effects[0], condition = new Filter(JSON.parse(shieldEffect.system.conditions));
assert.deepEqual(shieldEffect.system.changes.map(c => c.key), ["system.rolls.damage.mwak.bonus", "system.rolls.damage.rwak.bonus"]);
for (const [type, equipped, expected] of [["shield", true, true], ["shield", false, false], ["heavy", true, false], ["trinket", true, false]]) {
  const data = conditionalState({ items: [{ type: "equipment", flags: {}, system: { equipped, type: { value: type } } }] }, {});
  assert.equal(data.equippedShield, expected); assert.equal(condition.check({ spikependium: data }), expected);
}
const darkvision = feature("sidereal-cabal", "sight").effects[0].system.changes[0];
assert.equal(darkvision.key, "system.attributes.senses.ranges.darkvision"); assert.equal(darkvision.type, "add"); assert.equal(+darkvision.value, 60);
const immunity = feature("knights-stygian", "fear").effects.find(e => e.transfer).system.changes[0]; assert.equal(immunity.value, "frightened");
assert.equal(acts(feature("arcane-order", "vortex"))[0].damage.onSave, "none");
for (const sub of MAGUS_SUBCLASSES) {
  const master = feature(sub.id, "master");
  for (const a of acts(master).filter(a => a.type === "cast")) {
    assert.equal(a.consumption.spellSlot, false); assert.equal(a.spell.level, 6);
    assert.deepEqual(a.consumption.targets.map(t => [t.type, t.target, t.value]), [["itemUses", "feat:magus-spell-surge", "1"]]);
  }
  const recharge = acts(master).find(a => a.type === "utility");
  if (sub.id === "sidereal-cabal") assert.equal(recharge, undefined);
  else {
    assert.equal(recharge.uses.max, "1"); assert.deepEqual(recharge.uses.recovery, [{ period: "lr", type: "recoverAll" }]);
    assert.equal(recharge.consumption.targets[0].type, "activityUses"); assert.equal(recharge.consumption.targets[1].value, "-1");
    assert.ok(docs.some(d => d.system.identifier === recharge.consumption.targets[1].target.slice(5)));
  }
}
for (const sub of ["arcane-order", "shadow-court"]) {
  const doc = feature(sub, sub === "arcane-order" ? "insights" : "mirror");
  for (const a of acts(doc).filter(a => a.type === "cast")) { assert.equal(a.consumption.spellSlot, true); assert.equal(a.activation.type, "bonus"); assert.equal(a.consumption.targets[0].value, "1"); }
}
const maskItem = feature("sylvan-circle", "mask"), mask = acts(maskItem)[0];
const changes = magusMaskSpellChanges.call({ item: maskItem }, () => nativeSpellChanges.call({ ...mask, toObject: () => structuredClone(mask) }));
const override = key => changes.find(c => c.key === key);
assert.equal(JSON.parse(override("system.duration").value).units, "hour"); assert.equal(JSON.parse(override("system.duration").value).value, "8");
assert.equal(JSON.parse(override("system.target").value).affects.type, "self");
assert.ok(changes.some(c => c.key === "system.properties" && c.value === "-concentration"));
assert.equal(mask.consumption.spellSlot, false); assert.equal(mask.consumption.targets[0].value, "1");
const normal = [{ key: "system.method", value: "spell" }]; assert.equal(magusMaskSpellChanges.call({ item: { flags: {} } }, () => normal), normal); assert.equal(normal.length, 1);
const falseBody = feature("shadow-court", "false-body"); assert.equal(acts(falseBody)[0].activation.type, "reaction"); assert.equal(acts(falseBody)[0].teleport.value, "300"); assert.equal(falseBody.effects[0].duration.value, 60);
assert.ok(!falseBody.effects[0].flags.spikependium?.endsOnAttack);
const unarmed = acts(feature("shadow-court", "training")).find(a => a.type === "attack"); assert.equal(unarmed.attack.ability, "dex"); assert.equal(unarmed.damage.includeBase, false); assert.equal(unarmed.damage.parts[0].bonus, "@mod");
globalThis.game = { i18n: { localize: x => x } };
globalThis.Item = class Item {};
Math.clamp = (v, min, max) => Math.min(max, Math.max(min, v));
CONFIG.Dice = { BasicRoll: class { constructor(formula) { this.total = Number(formula); this.isDeterministic = true; } async evaluate() { return this; } } };
const seal = feature("sidereal-cabal", "seal"); assert.equal(seal.system.uses.max, "1 + 2 * floor(@classes.magus.levels / 20)");
for (const [max, spent, period, expected] of [[1, 1, "sr", 0], [3, 3, "sr", 2], [3, 1, "sr", 0], [3, 3, "lr", 0]]) {
  const host = { uses: { ...seal.system.uses, max, spent }, parent: new Item(), item: {} };
  const result = await nativeRecoverUses.call(host, new Map([[period, 1]])); assert.equal(result.updates.spent, expected);
}
await assert.rejects(() => nativeUsesConsumption.call({ resolveCost: async () => ({ total: 1 }) }, {}, { uses: { max: 1, spent: 1, value: 0 }, type: "uses", rolls: [], delta: {} }));
console.log("Magus subclasses: six Russian subclasses/37 features, native grants/skill upgrades/spell changes, conditional shield, shared surge and exact rest recovery passed.");
