import assert from "node:assert/strict";
import fs from "node:fs";
import { magicWarriorAdd } from "../scripts/arcana-warrior.mjs";
import { nativeAdvancementLevelSteps, nativeItemChoiceCounts, nativeFeatClassLinked } from "./data/dnd5e-monsters-native.mjs";

const file = fs.readdirSync("packs/_source/feats").find(f => f.startsWith("feat-magic-warrior_"));
const doc = JSON.parse(fs.readFileSync(`packs/_source/feats/${file}`, "utf8"));
assert.deepEqual([doc.system.source.book, doc.system.source.page, doc.system.type.subtype], ["AU", "33", "fightingStyle"]);
assert.deepEqual(doc.system.prerequisites.items, ["feat:fighting-style"]);
const choice = doc.system.advancement[0];
assert.equal(choice.type, "ItemChoice"); assert.deepEqual(choice.configuration.choices, { 0: { count: 2, replacement: false } });
assert.deepEqual(choice.configuration.spell.ability, ["int", "wis", "cha"]);
assert.deepEqual(choice.configuration.restriction, { type: "spell", subtype: "", list: ["class:wizard"], level: "0", school: [] });
assert.ok(choice.configuration.pool.some(i => i.uuid.endsWith("phbsplMageHand00")));
assert.ok(choice.configuration.pool.some(i => i.uuid.endsWith("phbsplRayofFrost")));
assert.equal(new Set(choice.configuration.pool.map(p => p.uuid)).size, choice.configuration.pool.length);
globalThis.foundry = { utils: { deepClone: structuredClone } };
const actor = { system: { details: { level: 4 } } };
let prepared;
const options = { token: "unchanged" };
const sentinel = magicWarriorAdd((a, data, opts) => { assert.equal(a, actor); assert.equal(opts, options); prepared = data; return "manager"; }, actor, doc, options);
assert.equal(sentinel, "manager"); assert.notEqual(prepared, doc);
const choices = prepared.system.advancement[0].configuration.choices;
assert.equal(choices[1], undefined); assert.equal(choices[4], undefined); assert.equal(Object.keys(choices).length, 17);
assert.deepEqual(choices[0], { count: 2, replacement: false }); assert.deepEqual(choices[5], { count: 0, replacement: true });
assert.deepEqual(choices[20], { count: 0, replacement: true });
assert.deepEqual(doc.system.advancement[0].configuration.choices, { 0: { count: 2, replacement: false } }, "compendium source is never mutated");
globalThis.Item = class {};
function manager(changedClass, delta) {
  const warrior = { id: "warrior", type: "feat", system: { type: prepared.system.type, advancementRootItem: { type: "class", id: "fighter" } },
    advancement: { choices } };
  warrior.system.advancementClassLinked = nativeFeatClassLinked.call(warrior.system);
  assert.equal(warrior.system.advancementClassLinked, false, "fighting style feat uses character-level advancements");
  const cls = { id: changedClass, type: "class", system: { levels: changedClass === "fighter" ? 4 : 0 } };
  const m = { actor: { system: { details: { level: 4 } } }, clone: { system: { details: {} }, items: { contents: [warrior, cls] } }, steps: [],
    constructor: { flowsForLevel(item, level) { return item?.type === "feat" && item.advancement.choices[level]
      ? [{ item, level, replacement: item.advancement.choices[level].replacement }] : []; } } };
  nativeAdvancementLevelSteps.call(m, cls, delta); return m;
}
for (const cls of ["fighter", "wizard"]) {
  const m = manager(cls, 1); assert.equal(m.steps.length, 2);
  assert.equal(m.steps[0].flow.level, 5); assert.equal(m.steps[0].flow.replacement, true);
  assert.equal(m.steps[0].flow.item.id, "warrior"); assert.equal(m.steps[1].level, 5);
}
const multiple = manager("wizard", 2);
assert.deepEqual(multiple.steps.filter(s => s.flow).map(s => s.flow.level), [5, 6]);
const counts = { configuration: { choices }, value: { added: { 0: { a: "Mage Hand", b: "Ray of Frost" } }, replaced: {} } };
assert.equal(nativeItemChoiceCounts.call(counts, 0).max, 2);
assert.deepEqual(nativeItemChoiceCounts.call(counts, 5), { current: 0, max: 0, replacement: false, full: true });
counts.value.replaced[5] = { original: "a" };
assert.equal(nativeItemChoiceCounts.call(counts, 5).max, 1, "replacement cannot add two new spells");
counts.value.added[5] = { c: "Fire Bolt" }; assert.equal(nativeItemChoiceCounts.call(counts, 5).full, true);
let atCap; magicWarriorAdd((_a, data) => { atCap = data; }, { system: { details: { level: 20 } } }, doc);
assert.deepEqual(atCap.system.advancement[0].configuration.choices, { 0: { count: 2, replacement: false } });
const other = { flags: { spikependium: { key: "feat:other" } } };
magicWarriorAdd((_a, data) => assert.equal(data, other), actor, other);
assert.throws(() => magicWarriorAdd(() => {}, { system: { details: { level: NaN } } }, doc));
console.log("Magic Warrior: native wizard-cantrip/ability choices, one optional replacement per future character level, multiclass native manager and immutable source passed.");
