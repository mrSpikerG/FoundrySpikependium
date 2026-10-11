import assert from "node:assert/strict";
import fs from "node:fs";
import { cast, summon, utility, useSlot, makeId } from "./lib/core.mjs";
import { prepareSummon, canRefuel, hasReanimatedCompanion } from "../scripts/summons.mjs";
import { prepareGrantedSpell, prepareFeatSave, preparePactUsage, prepareAbilityAdvancement, prepareFormConsumption, radiantLightUpdate, conditionalState, applyTurnLimit } from "../scripts/mechanics.mjs";
import { dragonSlot, restorationPlan, prepareChoiceDialog, applyChoiceConsumption } from "../scripts/choices.mjs";
import { DRAGONMARK_TABLES } from "../scripts/generated.mjs";
import { auraActive, endEffectsOnDamage } from "../scripts/effects.mjs";
import { ACTIVITY_EFFECTS, inlineRolls, enrichDocument } from "./lib/mechanics.mjs";
import { md } from "./lib/docs.mjs";

assert.equal(inlineRolls('<p>2к6 + 3 и 1d4</p>'), '<p>[[/r 2d6+3]]{2к6 + 3} и [[/r 1d4]]{1d4}</p>');
const protectedMarkup = '<a href="/1d6">[[/r 1d6]]{1к6} @UUID[Item.1d6]{2к6}</a>';
assert.equal(inlineRolls(protectedMarkup), protectedMarkup);
assert.equal(inlineRolls(inlineRolls('1к4')), inlineRolls('1к4'));
assert.equal(inlineRolls('2к6 урона психической энергией'), '[[/damage 2d6 type=psychic]]{2к6} урона психической энергией');
assert.equal(inlineRolls('1к4 рубящего урона'), '[[/damage 1d4 type=slashing]]{1к4} рубящего урона');
assert.equal(md('[[/r 1d6]]{1к6}'), '<p>[[/r 1d6]]{1к6}</p>');
const own = utility("own", { self: true, effects: ["effectId"], consume: [{ type: "itemUses" }] });
const fixture = { type: "feat", flags: { spikependium: { key: "test" } }, system: { description: { value: "<p>1к6</p>" }, activities: { [own._id]: own } }, effects: [{ _id: "effectId", transfer: false }] };
enrichDocument(fixture);
assert.equal(own.type, "transform");
assert.equal(own.transform.formless, true);
assert.ok(fixture.system.description.value.includes(`[[/item activity=${own._id}]]`));
for (const profile of ["", "effectId"]) {
  const config = { transform: { profile }, consume: { resources: true } };
  prepareFormConsumption({ ...own, item: fixture }, config);
  assert.deepEqual(config.consume, profile ? { resources: true } : false);
}
const light = { bright: 10, dim: 20, color: "#abcdef", animation: { type: "torch" } };
const enabled = radiantLightUpdate({ flags: {}, light: { ...light, toObject: () => structuredClone(light) } }, "Item.weapon");
assert.equal(enabled["light.bright"], 30);
assert.equal(enabled["light.dim"], 60);
const restored = radiantLightUpdate({ flags: { spikependium: { radiantLight: enabled["flags.spikependium.radiantLight"] } } }, "Item.weapon");
assert.equal(restored["light.bright"], light.bright);
assert.equal(restored["light.dim"], light.dim);
assert.equal(restored["flags.spikependium.-=radiantLight"], null);
assert.equal(radiantLightUpdate({ flags: {}, light: { bright: 100, dim: 200, toObject: () => ({ bright: 100, dim: 200 }) } }, "Item.weapon")["light.bright"], 100);

// Контракт dnd5e 6: properties у cast — исключённые компоненты.
assert.deepEqual(cast("normal", "uuid").spell.properties, []);
assert.deepEqual(cast("silent", "uuid", { properties: [] }).spell.properties, ["vocal", "somatic", "material"]);
assert.deepEqual(cast("material-free", "uuid", { properties: ["vocal", "somatic"] }).spell.properties, ["material"]);
assert.equal(cast("bonus", "uuid", { activation: "bonus" }).activation.override, true);
assert.equal(cast("inherit", "uuid").duration.override, false);
const self = utility("self", { self: true });
assert.equal(self.target.affects.type, "self");
assert.equal(self.target.override, true);
const scaledSlot = utility("slot", { consume: [useSlot(4)] }).consumption;
assert.equal(scaledSlot.scaling.allowed, true);
assert.equal(scaledSlot.scaling.max, "6");
assert.equal(scaledSlot.targets[0].scaling.mode, "level");
// Диалог dnd5e передаёт scaling = scalingValue - 1: проверяем доступ к ячейке 9 уровня.
for (let minimum = 1; minimum <= 9; minimum++) {
  const c = utility(`slot-${minimum}`, { consume: [useSlot(minimum)] }).consumption;
  const selectedValues = Array.from({ length: Number(c.scaling.max) }, (_, i) => i + 1);
  assert.deepEqual(selectedValues.map(value => minimum + value - 1), Array.from({ length: 10 - minimum }, (_, i) => minimum + i));
}
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
const allItems = [...docs.values()].flatMap(d => d.items ?? [d]);
for (const item of allItems) for (const a of Object.values(item.system?.activities ?? {})) {
  const pact = a.flags?.spikependium?.pact;
  if (!pact) continue;
  const linked = item.system.activities[a.activity.id];
  assert.ok(linked);
  assert.ok(a.consumption.targets.some(t => t.type === "attribute" && t.target === "spells.pact.value" && t.value === "1"));
  assert.ok(!a.consumption.targets.some(t => t.type === "spellSlots"));
  assert.equal(a.consumption.scaling.allowed, false);
  for (const level of [1, 2, 3, 4, 5]) {
    const config = { cause: { activity: "forward" } };
    const activity = { actor: { system: { spells: { pact: { level } } } }, getLinkedActivity: () => a };
    assert.equal(preparePactUsage(activity, config), level >= pact.minimum);
    assert.equal(config.scaling, level >= pact.minimum ? level - pact.minimum : undefined);
  }
}
assert.equal(preparePactUsage({}, {}), true);
let spellChanges;
const granted = { type: "spell", system: {}, updateSource: data => { spellChanges = data; } };
prepareGrantedSpell(granted, { system: { sourceItem: "feat:pyrokinesis", properties: ["vocal", "somatic", "material", "concentration"] } });
assert.deepEqual(spellChanges, { "system.properties": ["somatic", "concentration"] });
spellChanges = null;
prepareGrantedSpell(granted, { system: { sourceItem: "class:wizard", properties: ["vocal", "material"] } });
assert.equal(spellChanges, null);
prepareGrantedSpell(granted, { system: { sourceItem: "feat:lich-ascension", ability: "cha", uses: { max: "max(1, @attributes.spell.mod)" } } });
assert.deepEqual(spellChanges, { "system.uses.max": "max(1, @abilities.cha.mod)" });
let saveChanges;
prepareFeatSave({ type: "save", item: { flags: { spikependium: { key: "feat:undead-grasp" } }, system: {
  advancement: [{ type: "ItemGrant", value: { ability: "wis" } }]
} }, updateSource: data => { saveChanges = data; } });
assert.deepEqual(saveChanges, { "save.dc.calculation": "wis" });
for (const [key, rule] of Object.entries(ACTIVITY_EFFECTS)) {
  const id = makeId(`activity:${key}`);
  const items = allItems.filter(d => d.system?.activities?.[id]);
  assert.ok(items.length, `effect rule without activity: ${key}`);
  for (const item of items) {
    const a = item.system.activities[id];
    const profile = a.effects.find(p => item.effects.some(e => e._id === p._id && e._id === makeId(`effect:automation:${key}`)));
    assert.ok(profile, key);
    const e = item.effects.find(e => e._id === profile._id);
    assert.deepEqual(e.statuses, rule.statuses ?? []);
    assert.equal(e.duration.expiry, rule.expiry ?? null);
    assert.equal(e.duration.value, rule.seconds ?? null);
    assert.equal(e.transfer, false);
    assert.ok(e._key.endsWith(`.${e._id}`));
    if (a.type === "save") assert.equal(profile.onSave, false);
  }
}
for (const [key, choices] of [
  ["class:artificer", { 1: 2, 10: 1, 14: 1 }], ["class:psion", { 1: 2, 4: 1, 10: 1 }]
]) {
  const cantrips = doc(key).system.advancement.find(a => a.type === "ItemChoice" && a.configuration.restriction.level === "0");
  assert.ok(cantrips, key);
  assert.deepEqual(Object.fromEntries(Object.entries(cantrips.configuration.choices).map(([level, c]) => [level, c.count])), choices);
  assert.deepEqual(cantrips.configuration.restriction.list, [key]);
}
const asiFeats = [...docs.values()].filter(d => d.type === "feat" && d.system.type?.value === "feat"
  && /<strong>Увеличение характеристики\.<\/strong>/.test(d.system.description.value));
assert.equal(asiFeats.length, 26);
for (const feat of asiFeats) {
  const advancements = feat.system.advancement.filter(a => a.type === "AbilityScoreImprovement");
  assert.equal(advancements.length, 1, feat.name);
  const c = advancements[0].configuration;
  assert.equal(c.cap, 1);
  assert.equal(c.max, feat.flags.spikependium.key === "feat:boon-of-siberys" ? 30 : 20);
  assert.equal(c.points + Object.values(c.fixed).reduce((sum, n) => sum + n, 0), 1);
  assert.deepEqual(advancements[0].value, {});
}
assert.equal(doc("feat:greater-aberrant").system.advancement[0].configuration.points, 0);
assert.equal(doc("feat:greater-aberrant").system.advancement[0].configuration.fixed.con, 1);
assert.deepEqual(doc("feat:death-knight-initiate").system.advancement[0].configuration.locked, ["dex", "con", "int", "wis"]);
assert.deepEqual(doc("feat:lich-initiate").system.advancement[0].configuration.locked, ["str", "dex", "con"]);
for (const [mark, expected] of [
  [{ type: { subtype: "dragonmark" }, advancement: [{ type: "ItemGrant", value: { ability: "wis" } }] }, ["str", "dex", "con", "int", "cha"]],
  [{ type: { subtype: "dragonmark" }, identifier: "aberrant-dragonmark", advancement: [] }, ["str", "dex", "int", "wis", "cha"]],
  [{ type: { subtype: "wildTalent" }, advancement: [{ type: "ItemGrant", value: { ability: "int" } }] }, null],
  [{ type: { subtype: "dragonmark" }, advancement: [{ type: "ItemGrant", value: {} }] }, null]
]) {
  let updates = null;
  const advancement = { type: "AbilityScoreImprovement", item: doc("feat:potent-dragonmark"), updateSource: data => { updates = data; } };
  prepareAbilityAdvancement({ step: { flow: { advancement } }, clone: { items: [{ system: mark }] } });
  assert.deepEqual(updates, expected ? { "configuration.locked": expected } : null);
}
prepareAbilityAdvancement({ step: {} });
const manifold = doc("item:manifold-tool");
assert.equal(manifold.type, "tool");
const toolTransform = Object.values(manifold.system.activities).find(a => a.type === "enchant");
const toolCheck = Object.values(manifold.system.activities).find(a => a.type === "check");
assert.equal(toolTransform.enchant.self, true);
assert.equal(toolTransform.activation.type, "action");
assert.equal(toolTransform.effects.length, 17);
assert.equal(manifold.flags.dnd5e.riders.effect.length, 17);
assert.equal(toolCheck.check.bonus, "@prof");
for (const profile of toolTransform.effects) {
  const shape = manifold.effects.find(e => e._id === profile._id);
  const tool = shape.system.changes.find(c => c.key === "system.type.baseItem").value;
  const grant = manifold.effects.find(e => e._id === profile.riders.effect[0]);
  assert.ok(grant.transfer);
  assert.ok(grant.system.changes.some(c => c.key === `system.tools.${tool}.value` && c.type === "upgrade" && c.value === "1"));
  assert.ok(shape.system.changes.some(c => c.key === `system.activities.${toolCheck._id}.check.bonus` && c.value === ""));
}
assert.equal(manifold.effects.find(e => e.name === "Инструменты кузнеца").system.changes.find(c => c.key === "system.weight.value").value, "8");
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
assert.equal(doc("item:radiant-weapon").flags.dnd5e.riders.activity.length, 2);
assert.ok(Object.values(doc("item:radiant-weapon").system.activities).some(a => a.flags?.spikependium?.action === "radiant-light"));
assert.equal(doc("item:radiant-weapon").effects.find(e => e.statuses.includes("blinded")).duration.expiry, "targetEnd");
assert.equal(act("subclass:bladesinging:bladesong").transform.mode, "form");
assert.equal(act("tattoo:horse").transform.mode, "form");
assert.equal(doc("tattoo:horse").effects[0].duration.expiry, "sourceStart");
assert.equal(doc("tattoo:horse").effects[0].duration.value, null);
assert.equal(act("spell:thought-form").type, "utility");
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
assert.ok(titan.settings.keep.includes("physical"));
assert.equal(titan.visibility.identifier, "druid");
assert.equal(titan.profiles.length, 9);
for (const level of [3, 9, 10, 13, 14, 20]) assert.equal(titan.profiles.filter(p => p.level.min <= level).length, level >= 14 ? 9 : level >= 10 ? 6 : 3);
for (const profile of titan.profiles) {
  const actor = [...docs.values()].find(d => d._id === profile.uuid.split(".").at(-1));
  const changes = actor.effects[0].system.changes;
  assert.deepEqual(changes.map(c => c.key), ["system.abilities.str.value", "system.abilities.dex.value"]);
  assert.ok(changes.every(c => c.type === "override" && c.value === "@abilities.wis.value"));
  assert.equal(actor.prototypeToken.width, { lg: 2, huge: 3, grg: 4 }[actor.system.traits.size]);
}
for (const key of ["banishing", "beguiling", "enfeebling", "grasping", "shadow"]) assert.equal(act(`arcane-archer:shot:${key}`).damage.onSave, "full");
for (const key of ["piercing", "seeking"]) assert.equal(act(`arcane-archer:shot:${key}`).damage.onSave, "half");
for (const key of ["subclass:hexblade-patron:master-of-hexes", "subclass:demonic-sorcery:abyssal-aura"]) {
  const item = doc(key);
  assert.equal(item.system.uses.max, "1");
  assert.ok(Object.values(item.system.activities).some(a => a.consumption.targets.some(t => t.type === "itemUses" && t.value === "-1" && t.target === "")));
}
for (const key of ["subclass:knowledge-domain:divine-foresight", "subclass:oath-of-the-noble-genies:noble-scion",
  "subclass:oath-of-the-spellguard:eternal-spellguard", "subclass:conjurer:split-summons", "subclass:primordial-patron:elemental-node"]) {
  const item = doc(key);
  assert.equal(item.system.uses.max, "1");
  const recovery = Object.values(item.system.activities).find(a => a.consumption.targets.some(t => t.type === "itemUses" && t.value === "-1"));
  assert.equal(recovery.type, "utility");
  assert.equal(recovery.activation.type, "special");
  assert.equal(recovery.effects.length, 0);
}
for (const [key, ability] of [["psion:psionic-power", "int"], ["subclass:demonic-sorcery:abyssal-aura", "cha"],
  ["subclass:oath-of-the-noble-genies:elemental-smite", "cha"], ["subclass:circle-of-the-titan:dreadful-impact", "wis"]]) {
  const saves = Object.values(doc(key).system.activities).filter(a => a.type === "save");
  assert.ok(saves.length);
  assert.ok(saves.every(a => a.save.dc.calculation === ability));
}
const mutable = doc("subclass:metamorph:mutable-form");
const mutableActivities = Object.values(mutable.system.activities);
assert.deepEqual(mutableActivities.map(a => [a.visibility.identifier, a.visibility.level.min, a.visibility.level.max, a.duration.value]),
  [["psion", null, 9, "1"], ["psion", 10, null, "10"]]);
assert.deepEqual(mutable.effects.map(e => e.duration.value), [60, 600]);
assert.deepEqual(mutable.effects[1].system.changes.map(c => [c.key, c.value]), mutable.effects[0].system.changes.map(c => [c.key, c.value]));
const improved = doc("subclass:metamorph:greater-mutable-form");
const form = Object.values(improved.system.activities).find(a => a.type === "transform");
assert.equal(form.transform.formless, true);
assert.equal(form.effects.length, 11);
assert.equal(improved.effects.filter(e => e.system.changes.some(c => c.key === "system.traits.dr.value")).length, 9);
assert.ok(improved.effects.every(e => !e.transfer && e.duration.value === 600));
const techniques = doc("subclass:psykinetic:telekinetic-techniques");
const missile = Object.values(techniques.system.activities).find(a => a.type === "damage");
assert.equal(missile.damage.parts[0].custom.formula, "1 + @scaling");
assert.equal(missile.consumption.scaling.max, "@scale.psion.die.faces");
for (const name of ["slime", "screams", "foliage"]) {
  const a = Object.values(doc("subclass:demonic-sorcery:abyssal-aura").system.activities).find(a => a._id === makeId(`activity:demonic:aura:${name}`));
  assert.equal(a.damage.onSave, "full");
}
for (const type of ["ItemGrant", "ItemChoice"]) {
  let change;
  const advancement = { id: "second", type, updateSource: data => { change = data; } };
  advancement.item = { flags: { spikependium: { key: "feat:empath" } }, system: { type: { subtype: "wildTalent" },
    advancement: [{ id: "first", value: { ability: "wis" } }, { id: "second", value: {} }] } };
  prepareAbilityAdvancement({ step: { flow: { advancement } } });
  assert.deepEqual(change, { "configuration.spell.ability": ["wis"] });
  change = undefined;
  advancement.id = "first";
  advancement.item.system.advancement = [{ id: "first", value: {} }, { id: "second", value: { ability: "cha" } }];
  prepareAbilityAdvancement({ step: { flow: { advancement } } });
  assert.equal(change, undefined, "поздний шаг не должен блокировать повторный выбор на первом шаге");
}
for (const key of ["biofeedback", "destructive-thoughts"])
  assert.equal(act(`psion:discipline:${key}`).consumption.scaling.max, "max(1, @abilities.int.mod)");
assert.equal(act("feat:death-knight-ascension").consumption.scaling.max, "5");
const stolenDamage = allItems.map(i => i.system?.activities?.[makeId("activity:magic-stealer:damage")]).find(Boolean);
assert.ok(stolenDamage);
assert.equal(stolenDamage.consumption.scaling.max, "9");
const slotToFocus = Object.values(doc("subclass:warrior-of-mystic-arts:mystic-focus").system.activities).find(a => a._id === makeId("activity:mystic-arts:slot-to-focus"));
assert.equal(slotToFocus.consumption.scaling.max, "9");
for (const item of allItems) for (const identifier of item.system?.prerequisites?.items ?? [])
  assert.ok(allItems.some(i => `${i.type}:${i.system?.identifier}` === identifier), `Не найдена предпосылка ${identifier}`);
for (const key of ["handling", "healing", "making", "scribing", "sentinel"]) {
  const modifier = Object.values(doc(`feat:greater-${key}`).system.activities).find(a => a._id === makeId(`activity:greater:${key}:mod`));
  assert.equal(modifier.uses.max, "");
  assert.equal(modifier.consumption.targets.length, 0);
}
const greaterFortitude = Object.values(doc("feat:greater-aberrant").system.activities).find(a => a._id === makeId("activity:greater-aberrant:fortitude"));
assert.equal(greaterFortitude.roll.formula, "1d6");
assert.equal(greaterFortitude.consumption.targets[0].target, "feat:aberrant-dragonmark");
const shieldAura = doc("subclass:oath-of-the-noble-genies:aura-of-elemental-shielding");
assert.equal(shieldAura.effects.length, 5);
assert.equal(Object.values(shieldAura.system.activities).find(a => a.type === "transform").effects.length, 5);
assert.equal(Object.values(shieldAura.system.activities).filter(a => a.type === "utility").length, 5);

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
  assert.equal(damage?.[1][0].number, levels >= 15 ? 4 : 2);
}
for (const levels of [5, 6]) {
  const u = summoned("actor:vestige-celestial", "warlock", levels).actorUpdates;
  assert.equal(u["system.abilities.cha.check.roll.bonus"], "4");
  assert.equal(u.items.at(-1)["system.uses.recovery"]?.[0].period, levels >= 6 ? "sr" : undefined);
}
assert.equal(summoned("actor:homunculus-servant", "artificer", 5).actorUpdates["system.abilities.int.save.roll.bonus"], "5");
assert.equal(summoned("actor:psionic-spirit-crystal", "psion", 5).actorUpdates["system.abilities.int.save.roll.bonus"], undefined);
globalThis.ui = { notifications: { warn: () => {} } };
const slotActor = { system: { spells: { spell1: { value: 0, max: 4 }, spell2: { value: 0, max: 3 },
  spell3: { value: 0, max: 2 }, spell4: { value: 0, max: 1 }, pact: { value: 0, max: 2, level: 2 } } } };
for (const selection of [{ spell1: 4 }, { spell2: 2 }, { spell1: 1, spell3: 1 }, { spell2: 1, pact: 1 }, { pact: 2 }])
  assert.ok(restorationPlan(slotActor, selection));
for (const selection of [{}, { spell1: 5 }, { spell2: 2, spell1: 1 }, { spell1: -1 }, { spell1: 1.5 }, { bogus: 1 }])
  assert.equal(restorationPlan(slotActor, selection), null);
const restoredUpdates = { actor: {}, item: [] };
applyChoiceConsumption({ actor: slotActor, item: { flags: { spikependium: { key: "feat:arcane-restoration" } } } },
  { spikependium: { restore: { spell1: 2, pact: 1 } } }, {}, restoredUpdates);
assert.deepEqual(restoredUpdates.actor, { "system.spells.spell1.value": 2, "system.spells.pact.value": 1 });
assert.equal(restorationPlan({ system: { spells: { spell1: { value: 4, max: 4 } } } }, { spell1: 1 }), null);

const markResource = { id: "potent", flags: {}, system: { identifier: "potent-dragonmark", uses: { max: 1, spent: 0 } } };
const dragonActor = { system: { details: { level: 8 } }, items: [markResource,
  { flags: {}, system: { type: { subtype: "dragonmark" }, identifier: "mark-of-detection" } }] };
const dragonSpell = { type: "spell", flags: {}, _source: { system: { level: 1 } },
  system: { level: 1, sourceItem: "feat:mark-of-detection" } };
const dragonActivity = { item: dragonSpell, actor: dragonActor };
assert.equal(dragonSlot(dragonActivity).level, 4);
assert.equal(dragonSlot({ ...dragonActivity, item: { ...dragonSpell, system: { level: 1, sourceItem: "class:wizard" } } }), null);
assert.equal(dragonSlot({ ...dragonActivity, item: { ...dragonSpell, _source: { system: { level: 5 } } } }), null);
const selectedDragon = { actor: {}, item: [] };
applyChoiceConsumption(dragonActivity, { scaling: 3, spikependium: { dragonSlot: true } }, {}, selectedDragon);
assert.deepEqual(selectedDragon.item, [{ _id: "potent", "system.uses.spent": 1 }]);
markResource.system.uses.spent = 1;
assert.equal(applyChoiceConsumption(dragonActivity, { scaling: 3, spikependium: { dragonSlot: true } }, {}, { actor: {}, item: [] }), false);
markResource.system.uses.spent = 0;
class FakeDialog {
  async _prepareSubmitData(event, formData) { return structuredClone(formData.object); }
}
const choiceDialog = { applicationClass: FakeDialog };
prepareChoiceDialog(dragonActivity, {}, choiceDialog);
const dialogInstance = new choiceDialog.applicationClass();
dialogInstance.item = dragonSpell;
dialogInstance.config = { cause: { activity: "forward" } };
const dragonSubmit = await dialogInstance._prepareSubmitData({}, { object: { spikependium: { dragonSlot: true }, consume: { spellSlot: true, resources: [0] } } });
assert.equal(dragonSubmit.scaling, 3);
assert.equal(dragonSubmit.consume.spellSlot, false);
assert.equal(dragonSubmit.consume.resources, false);
assert.equal(dragonSubmit.cause.resources, false);

let tableUpdates;
const tableAdvancement = { type: "ItemGrant", item: doc("feat:potent-dragonmark"), updateSource: data => { tableUpdates = data; } };
prepareAbilityAdvancement({ step: { flow: { advancement: tableAdvancement } }, clone: { items: [
  { system: { type: { subtype: "dragonmark" }, identifier: "mark-of-detection", advancement: [{ value: { ability: "wis" } }] } }
] } });
assert.deepEqual(tableUpdates["configuration.items"].map(i => i.uuid), DRAGONMARK_TABLES["mark-of-detection"]);
assert.deepEqual(tableUpdates["configuration.spell.ability"], ["wis"]);

const equipment = type => ({ type: "equipment", flags: {}, system: { equipped: true, type: { value: type } } });
for (const [types, unarmored, lightArmorAllowed] of [[[], true, true], [["shield"], true, true], [["light"], false, true], [["medium"], false, false], [["heavy"], false, false]]) {
  assert.deepEqual(conditionalState({ items: types.map(equipment) }, {}), { unarmored, lightArmorAllowed, hasSoulToken: false });
}
const tokenResource = { flags: { spikependium: { key: "subclass:phantom:tokens-of-the-departed" } }, system: { uses: { max: "@scale.phantom.trinkets", spent: 1 } } };
assert.equal(conditionalState({ items: [tokenResource] }, { scale: { phantom: { trinkets: 2 } } }).hasSoulToken, true);
tokenResource.system.uses.spent = 2;
assert.equal(conditionalState({ items: [tokenResource] }, { scale: { phantom: { trinkets: 2 } } }).hasSoulToken, false);

const combat = { started: true, id: "combat", round: 1, turn: 0 };
const turnActor = { flags: {} };
const limitedActivity = { id: "act", item: { id: "feat" }, actor: turnActor, flags: { spikependium: { oncePerTurn: true } } };
const limitUpdates = { actor: {} };
applyTurnLimit(limitedActivity, {}, {}, limitUpdates, combat);
turnActor.flags.spikependium = { turnUses: { featact: limitUpdates.actor["flags.spikependium.turnUses.featact"] } };
assert.equal(applyTurnLimit(limitedActivity, {}, {}, { actor: {} }, combat), false);
assert.equal(applyTurnLimit(limitedActivity, {}, {}, { actor: {} }, { ...combat, turn: 1 }), undefined);

const companionFeature = doc("subclass:reanimator:reanimated-companion");
const companionActivity = { item: { ...companionFeature, uuid: "Actor.caster.Item.companion" } };
const companionToken = { actor: { flags: { spikependium: { key: "actor:reanimated-companion:fury:wet" }, dnd5e: { summon: { origin: companionActivity.item.uuid } } }, system: { attributes: { hp: { value: 10 } } } } };
assert.equal(hasReanimatedCompanion(companionActivity, [{ tokens: [companionToken] }]), true);
companionToken.actor.system.attributes.hp.value = 0;
assert.equal(hasReanimatedCompanion(companionActivity, [{ tokens: [companionToken] }]), false);
const profiles = Object.values(companionFeature.system.activities).find(a => a.type === "summon").profiles;
for (const [level, count] of [[3, 1], [5, 2], [8, 2], [9, 8], [15, 8]])
  assert.equal(profiles.filter(p => (!p.level.min || p.level.min <= level) && (!p.level.max || p.level.max >= level)).length, count);
const largeCompanion = doc("actor:reanimated-companion:fury:big-large");
assert.equal(largeCompanion.system.traits.size, "lg");
assert.equal(largeCompanion.prototypeToken.width, 2);
const bigUpdates = summoned("actor:reanimated-companion:fury:big-large", "artificer", 15).actorUpdates.items[0];
const explosionParts = Object.entries(bigUpdates).find(([k]) => k.endsWith("damage.parts"))[1];
assert.equal(explosionParts[0].number, 4);
assert.equal(explosionParts[0].bonus, "2");
const thinCompanion = doc("actor:reanimated-companion:conduit:thin");
assert.equal(thinCompanion.system.attributes.movement.speeds.climb, "45");
assert.ok(thinCompanion.items.at(-2).effects.some(e => e.statuses.includes("frightened")));

const auraSource = { statuses: new Set(), classes: { paladin: { system: { levels: 7 } } }, effects: [
  { disabled: false, duration: {}, flags: { spikependium: { aura: "fire" } }, system: { origin: { activity: "Item.aura.Activity.self" } } }
] };
const aura = { parent: {}, flags: { spikependium: { aura: "fire" } } };
const auraOrigin = { actor: auraSource, item: { uuid: "Item.aura" } };
assert.equal(auraActive(aura, auraOrigin, 10), true);
assert.equal(auraActive(aura, auraOrigin, 11), false);
auraSource.classes.paladin.system.levels = 18;
assert.equal(auraActive(aura, auraOrigin, 30), true);
auraSource.statuses.add("incapacitated");
assert.equal(auraActive(aura, auraOrigin, 1), false);
auraSource.statuses.clear();
aura.flags.spikependium.aura = "cold";
assert.equal(auraActive(aura, auraOrigin, 1), false);
let deletedEffects;
const damagedActor = { effects: [{ id: "hypnotic", flags: { spikependium: { endsOnDamage: true } } }, { id: "other", flags: {} }],
  deleteEmbeddedDocuments: async (type, ids) => { deletedEffects = ids; } };
await endEffectsOnDamage(damagedActor, 0);
assert.equal(deletedEffects, undefined);
await endEffectsOnDamage(damagedActor, 1);
assert.deepEqual(deletedEffects, ["hypnotic"]);
console.log("Регрессии действий, источников, выбора ресурсов, эффектов и призывов: OK.");
