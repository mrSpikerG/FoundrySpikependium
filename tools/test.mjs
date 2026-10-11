import assert from "node:assert/strict";
import fs from "node:fs";
import { cast, summon, utility } from "./lib/core.mjs";
import { prepareSummon, canRefuel } from "../scripts/summons.mjs";

// Контракт dnd5e 6: properties у cast — исключённые компоненты.
assert.deepEqual(cast("normal", "uuid").spell.properties, []);
assert.deepEqual(cast("silent", "uuid", { properties: [] }).spell.properties, ["vocal", "somatic", "material"]);
assert.deepEqual(cast("material-free", "uuid", { properties: ["vocal", "somatic"] }).spell.properties, ["material"]);
assert.equal(cast("bonus", "uuid", { activation: "bonus" }).activation.override, true);
assert.equal(cast("inherit", "uuid").duration.override, false);
const self = utility("self", { self: true });
assert.equal(self.target.affects.type, "self");
assert.equal(self.target.override, true);
assert.equal(summon("companion", [{ uuid: "actor" }], { ability: "int", identifier: "fighter" }).match.ability, "int");

const docs = new Map();
for (const pack of fs.readdirSync(new URL("../packs/_source/", import.meta.url))) {
  const dir = new URL(`../packs/_source/${pack}/`, import.meta.url);
  for (const file of fs.readdirSync(dir)) {
    const doc = JSON.parse(fs.readFileSync(new URL(file, dir)));
    if (doc.flags?.spikependium?.key) docs.set(doc.flags.spikependium.key, doc);
  }
}
const doc = key => { assert.ok(docs.has(key), key); return docs.get(key); };
const act = key => Object.values(doc(key).system.activities)[0];
assert.equal([...docs.values()].filter(d => d.type === "subclass").length, 40);
for (const [key, book, page] of [
  ["feat:greater-handling", "UA-EB", "14"], ["feat:greater-warding", "UA-EB", "15"],
  ["spell:intellect-fortress", "UA-PU", "13"], ["spell:summon-astral-entity", "UA-PU", "15"],
  ["subclass:metamorph:greater-mutable-form", "UA-PU", "9"],
  ["subclass:reanimator:promethean-revival", "UA-HS", "2"], ["subclass:vestige-patron:aura-of-power", "UA-MS", "6"]
]) assert.deepEqual([doc(key).system.source.book, doc(key).system.source.page], [book, page]);
for (const key of ["spell:intellect-fortress", "spell:tashas-mind-whip"]) assert.equal(act(key).target.affects.count, "1 + @scaling");
assert.equal(act("spell:bleeding-darkness").target.template.height, "40");
const ring = doc("item:spell-refueling-ring");
for (const [key, price] of Object.entries({ "boots-of-the-winding-path": 400, "helm-of-awareness": 400, "manifold-tool": 100, "mind-sharpener": 400, "radiant-weapon": 4000, "repeating-shot": 400, "returning-weapon": 400, "repulsion-shield": 410, "spell-refueling-ring": 400 })) assert.equal(doc(`item:${key}`).system.price.value, price);
for (const [key, weight] of Object.entries({ "boots-of-the-winding-path": 2, "helm-of-awareness": 3, "manifold-tool": 1, "mind-sharpener": 0.1, "spell-refueling-ring": 0.1, "repulsion-shield": 6 })) {
  const item = doc(`item:${key}`);
  assert.deepEqual(item.system.weight, { value: weight, units: "lb" });
  assert.ok(item.system.description.value.includes(key === "repulsion-shield" ? "Вес взят у базового предмета" : "Вес оценочный"));
  assert.ok(!item.system.description.value.includes("значение 0 — техническое"));
}
for (const key of ["radiant-weapon", "repeating-shot", "returning-weapon"]) {
  const item = doc(`item:${key}`);
  assert.ok(item.system.description.value.includes("вес и урон берутся от выбранного оружия"));
  assert.ok(item.effects.every(e => e.system.changes.every(c => !c.key.startsWith("system.weight"))));
}
assert.deepEqual(Object.values(ring.system.activities).map(a => a.consumption.targets[1].target), ["1", "2", "3", "spells.pact.value"]);
assert.ok(Object.values(ring.system.activities).every(a => a.consumption.targets[1].value === "-1"));
assert.ok(Object.values(ring.system.activities).every(a => a.visibility.requireMagic && a.visibility.requireAttunement));
for (const [pact, level, value, max, allowed] of [[false, 1, 0, 2, true], [false, 3, 2, 2, false], [false, 2, 0, 0, false], [true, 3, 0, 2, true], [true, 4, 0, 2, false]]) {
  const target = pact ? { type: "attribute", target: "spells.pact.value" } : { type: "spellSlots", target: String(level) };
  assert.equal(canRefuel({ item: ring, consumption: { targets: [target] }, actor: { system: { spells: { [pact ? "pact" : `spell${level}`]: { level, value, max } } } } }), allowed);
}
const titan = act("subclass:circle-of-the-titan:titanic-form");
assert.equal(titan.settings.tempFormula, "2 * @classes.druid.levels");
assert.deepEqual(titan.settings.spellLists, ["subclass:titan"]);
assert.ok(!titan.settings.keep.includes("type"));

// Имитируем данные, передаваемые нативным preSummonToken, включая его зачарование атак.
function summoned(key, classId, levels, prof = 4) {
  const data = structuredClone(doc(key));
  const items = data.items.map(item => ({ ...item, id: item._id, system: { ...item.system,
    activities: new Map(Object.entries(item.system.activities).map(([id, a]) => [id, { ...a, id, toObject: () => structuredClone(a) }])) } }));
  const actor = { ...data, items };
  const caster = { classes: { [classId]: { system: { levels } } }, system: { attributes: { prof }, abilities: { int: { mod: 2 } } } };
  const config = { actor, actorUpdates: { items: items.map(i => ({ _id: i.id, effects: [{ system: { changes: [{ key: "activities[attack].attack.bonus", value: "6" }] } }] })), effects: [] }, tokenUpdates: {} };
  prepareSummon({ actor: caster, item: { system: { level: levels } } }, {}, config);
  return config;
}
for (const levels of [3, 6, 7, 14, 15, 20]) {
  const { actorUpdates: u, tokenUpdates: t } = summoned("actor:purple-dragon-companion", "fighter", levels);
  assert.equal(u["system.traits.size"], levels >= 15 ? "lg" : levels >= 7 ? "med" : "sm");
  assert.equal(t.width, levels >= 15 ? 2 : 1);
  assert.equal(u["system.abilities.dex.save.roll.bonus"], "2");
  assert.equal(u.items[0].effects[0].system.changes[0].value, "5");
  const breath = doc("actor:purple-dragon-companion").items.at(-1);
  const removed = Object.values(breath.system.activities).find(a => !!a.damage.parts.length !== (levels >= 7));
  assert.ok(Object.hasOwn(u.items.at(-1), `system.activities.-=${removed._id}`));
  assert.equal(u["system.attributes.movement.speeds.fly"], levels >= 15 ? "40" : undefined);
}
for (const levels of [14, 15]) {
  const u = summoned("actor:reanimated-companion", "artificer", levels).actorUpdates;
  const damage = Object.entries(u.items[0]).find(([k]) => k.endsWith("damage.parts"));
  assert.equal(damage?.[1][0].number, levels >= 15 ? 4 : undefined);
}
for (const levels of [5, 6]) {
  const u = summoned("actor:vestige-celestial", "warlock", levels).actorUpdates;
  assert.equal(u["system.abilities.cha.check.roll.bonus"], "4");
  assert.equal(u.items.at(-1)["system.uses.recovery"]?.[0].period, levels >= 6 ? "sr" : undefined);
}
assert.equal(summoned("actor:homunculus-servant", "artificer", 5).actorUpdates["system.abilities.int.save.roll.bonus"], "5");
assert.equal(summoned("actor:psionic-spirit-crystal", "psion", 5).actorUpdates["system.abilities.int.save.roll.bonus"], undefined);
console.log("Регрессии действий, источников и призывов: OK.");
