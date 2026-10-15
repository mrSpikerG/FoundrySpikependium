import assert from "node:assert/strict";
import fs from "node:fs";
import { cast, summon, utility, useSlot, makeId, SRD } from "./lib/core.mjs";
import { prepareSummon, canRefuel, hasReanimatedCompanion } from "../scripts/summons.mjs";
import { prepareGrantedSpell, prepareSpiritsGuidance, prepareFeatSave, preparePactUsage, prepareAbilityAdvancement, prepareFormConsumption, radiantLightUpdate, conditionalState, applyTurnLimit, prepareUpdatedSpell } from "../scripts/mechanics.mjs";
import { dragonSlot, restorationPlan, prepareChoiceDialog, applyChoiceConsumption } from "../scripts/choices.mjs";
import { DRAGONMARK_TABLES } from "../scripts/generated.mjs";
import { auraActive, endEffectsOnDamage, endedEffects, tokenDistance, applySelfEffects } from "../scripts/effects.mjs";
import { hitDieChoices, hitDieOutcome, prepareResourceUpdates, postHitDieDamage, limitRestoration, showResourceConsumption } from "../scripts/resources.mjs";
import { commandCompanion, canCompanionAct, companionEnd, updateCompanions, recordCompanionRest, recordCompanionDeath, canUseCompanionDeath, prepareCompanionDeath, explosionTargets, triggerCompanionDeath, recordCompanionStatus, isLifeTransfer, lifeCompanions, appendLifeTransferFields, prepareLifeTransfer, appendLifeTransferRefund, prepareCompanionUsage, rollLifeHealing, canCreateCompanionMessage, prepareCompanionDamage, calculateCompanionDamage, rollCompanionStrike, prepareCompanionAbsorption, companionInt, bigExplosionDamageConfig, prepareExplosionBonus, validateExplosionBonus, wetHitSnapshots, recordWetHits, triggerWetResponses } from "../scripts/companions.mjs";
import { validateMutableForm } from "../scripts/mechanics.mjs";
import { knownBlueprints, forgeBudget, prepareBlueprintAdvancement, prepareForgeCreation, finishForge, obsoleteForgeItems, cleanForgeItems, appendForgeFields, suitableForgeBase } from "../scripts/forge.mjs";
import { BLUEPRINTS, TINKER_ITEMS, FORGE_BASES } from "../scripts/generated.mjs";
import { replicas, prepareTinkering, addDrainedSlots, expireDrainedSlots, recordForgeConsumption, restoreForgeSelection, refundTinkering, appendTinkerFields, prepareSacrifice, recordSoulDamage, resetSoulDeath } from "../scripts/tinker.mjs";
import { ACTIVITY_EFFECTS, inlineRolls, enrichDocument } from "./lib/mechanics.mjs";
import { storageTarget, storageSpell, storableSpells, appendStorageFields, prepareStorage, storedCachedSpell, storedItemRollData, storedActivityRollData, prepareStoredCast, storedCooldownReady, canUseStoredSpell, prepareStoredUsage, appendStorageRefund, preserveStoredCache, cleanStoredCaches } from "../scripts/storage.mjs";
import { md } from "./lib/docs.mjs";
import { canUseConduitActivity, recordConduitCast, conduitEligibility, prepareConduitRoll, buildConduitBonus, finalizeConduitRoll, finishConduitRoll, conduitOrigins, prepareConduitCastingDialog, requireConduitCastingDialog, prepareConduitCasting, describeConduitCasting, restoreConduitActivity, conduitUsageToken, validateConduitTemplate, attachConduitTemplate } from "../scripts/conduit.mjs";
import { isWhispers, whispersChoices, prepareWhispersDialog, prepareWhispersChoice, describeWhispers, chooseWhispersAfterRest } from "../scripts/whispers.mjs";
import { thinSources, thinEffectChanges, chooseThinFear, syncThinFear, prepareThinSave } from "../scripts/thin.mjs";
import { noOpportunityAttacks, strikeHitSnapshots, recordStrikeHits, applyStrikeHits, prepareOpportunityRoll, validateOpportunityRoll } from "../scripts/opportunity.mjs";

assert.equal(inlineRolls('<p>2к6 + 3 и 1d4</p>'), '<p>[[/r 2d6+3]]{2к6 + 3} и [[/r 1d4]]{1d4}</p>');
const protectedMarkup = '<a href="/1d6">[[/r 1d6]]{1к6} @UUID[Item.1d6]{2к6}</a>';
assert.equal(inlineRolls(protectedMarkup), protectedMarkup);
assert.equal(inlineRolls(inlineRolls('1к4')), inlineRolls('1к4'));
assert.equal(inlineRolls('2к6 урона психической энергией'), '[[/damage 2d6 type=psychic]]{2к6} урона психической энергией');
assert.equal(inlineRolls('1к4 рубящего урона'), '[[/damage 1d4 type=slashing]]{1к4} рубящего урона');
assert.equal(inlineRolls('1к6 + 1 режущего урона'), '[[/damage 1d6+1 type=slashing]]{1к6 + 1} режущего урона');
assert.equal(md('[[/r 1d6]]{1к6}'), '<p>[[/r 1d6]]{1к6}</p>');
for (const [deltas, paid] of [
  [{ item: { feat: [{ keyPath: "system.activities.modifier.uses.spent", delta: 1 }] } }, true],
  [{ actor: [{ keyPath: "system.resources.primary.spent", delta: 2 }] }, true],
  [{ item: { feat: [{ keyPath: "system.uses.spent", delta: -1 }] } }, false],
  [{ item: { feat: [{ keyPath: "system.uses.spent", delta: 0 }] } }, false],
  [{ actor: [{ keyPath: "system.attributes.hp.temp", delta: 4 }] }, false],
  [undefined, false]
]) {
  const config = { hasConsumption: false }, message = { hasConsumption: false, data: { system: { deltas } } };
  showResourceConsumption(null, config, message);
  assert.equal(config.hasConsumption, paid);
  assert.equal(message.hasConsumption, paid);
}
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
const secondLight = radiantLightUpdate({ flags: { spikependium: { radiantLight: enabled["flags.spikependium.radiantLight"] } }, light: { bright: 30, dim: 60 } }, "Item.second");
assert.deepEqual(secondLight["flags.spikependium.radiantLight"].items, ["Item.weapon", "Item.second"]);
const firstDisabled = radiantLightUpdate({ flags: { spikependium: { radiantLight: secondLight["flags.spikependium.radiantLight"] } }, light: { bright: 30, dim: 60 } }, "Item.weapon");
assert.equal(firstDisabled["light.bright"], 30);
const allDisabled = radiantLightUpdate({ flags: { spikependium: { radiantLight: firstDisabled["flags.spikependium.radiantLight"] } }, light: { bright: 30, dim: 60 } }, "Item.second");
assert.equal(allDisabled["light.bright"], light.bright);
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
spellChanges = null;
prepareGrantedSpell(granted, { system: { sourceItem: "subclass:spirits", identifier: "guidance" } });
assert.deepEqual(spellChanges, { "system.range.value": 60, "system.range.units": "ft" });
for (const [source, identifier, stored] of [["subclass:spirits", "guidance", false], ["class:bard", "guidance", false],
  ["subclass:spirits", "light", false], ["subclass:spirits", "guidance", true]]) {
  let updated;
  prepareSpiritsGuidance({ item: { type: "spell", system: { sourceItem: source, identifier }, flags: { spikependium: { storedSpell: stored } } },
    updateSource: data => { updated = data; } });
  assert.deepEqual(updated, source === "subclass:spirits" && identifier === "guidance" && !stored
    ? { "range.value": "60", "range.units": "ft", "range.override": true } : undefined);
}
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
assert.equal([...docs.values()].filter(d => d.type === "subclass").length, 69);
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
  assert.ok(allItems.some(i => `${i.type}:${i.system?.identifier}` === identifier)
    || Object.values(SRD.classFeatures).some(i => `${i.type}:${i.identifier}` === identifier), `Не найдена предпосылка ${identifier}`);
for (const key of ["handling", "scribing", "sentinel"]) {
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
  assert.equal(u["flags.spikependium.companionLevel"], levels);
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
prepareChoiceDialog(dragonActivity, { consume: { spellSlot: true, resources: true }, scaling: 0, cause: { resources: true } }, choiceDialog);
const dialogInstance = new choiceDialog.applicationClass();
dialogInstance.item = dragonSpell;
dialogInstance.config = { cause: { activity: "forward" } };
const dragonSubmit = await dialogInstance._prepareSubmitData({}, { object: { spikependium: { dragonSlot: true }, consume: { spellSlot: true, resources: [0] } } });
assert.equal(dragonSubmit.scaling, 3);
assert.equal(dragonSubmit.consume.spellSlot, false);
assert.equal(dragonSubmit.consume.resources, false);
assert.equal(dragonSubmit.cause.resources, false);
dialogInstance.config.spikependium = { dragonSlot: true };
const normalSubmit = await dialogInstance._prepareSubmitData({}, { object: { spikependium: { dragonSlot: false } } });
assert.deepEqual(normalSubmit.consume, { spellSlot: true, resources: true });
assert.equal(normalSubmit.cause.resources, true);
assert.equal(normalSubmit.scaling, 0);

let tableUpdates;
const tableAdvancement = { type: "ItemGrant", item: doc("feat:potent-dragonmark"), updateSource: data => { tableUpdates = data; } };
prepareAbilityAdvancement({ step: { flow: { advancement: tableAdvancement } }, clone: { items: [
  { system: { type: { subtype: "dragonmark" }, identifier: "mark-of-detection", advancement: [{ value: { ability: "wis" } }] } }
] } });
assert.deepEqual(tableUpdates["configuration.items"].map(i => i.uuid), DRAGONMARK_TABLES["mark-of-detection"]);
assert.deepEqual(tableUpdates["configuration.spell.ability"], ["wis"]);

const equipment = type => ({ type: "equipment", flags: {}, system: { equipped: true, type: { value: type } } });
for (const [types, unarmored, lightArmorAllowed] of [[[], true, true], [["shield"], true, true], [["light"], false, true], [["medium"], false, false], [["heavy"], false, false]]) {
  assert.deepEqual(conditionalState({ items: types.map(equipment) }, {}), { unarmored, lightArmorAllowed, alchemistBombDC: 0, graftActive: {}, sweetTurtleAC: false, scornedAC: 0, wildskinActive: false, myceliaTemp: false, myceliaWithdrawal: false, equippedShield: types.includes("shield"), hasSoulToken: false, mutableActive: false, noOpportunityAttacks: false });
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
const groupedActivity = { ...limitedActivity, flags: { spikependium: { oncePerTurn: true, group: "arcane-shot" } } };
const sharedUpdates = { actor: {} };
applyTurnLimit(groupedActivity, {}, {}, sharedUpdates, combat);
turnActor.flags.spikependium.turnUses["arcane-shot"] = sharedUpdates.actor["flags.spikependium.turnUses.arcane-shot"];
assert.equal(applyTurnLimit({ ...groupedActivity, id: "different", item: { id: "other" } }, {}, {}, { actor: {} }, combat), false);
assert.equal(applyTurnLimit({ ...groupedActivity, transform: { mode: "form", formless: true } }, { transform: { profile: "" } }, {}, { actor: {} }, combat), undefined);
const editedSpell = { type: "spell", system: { sourceItem: "feat:lich-ascension" }, _source: { system: { uses: { max: "max(1, @abilities.wis.mod)" } } } };
const editedAbility = { "system.ability": "int" };
prepareUpdatedSpell(editedSpell, editedAbility);
assert.equal(editedAbility["system.uses.max"], "max(1, @abilities.int.mod)");

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
assert.equal(explosionParts[0].bonus, "");
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
const expiredActor = { statuses: new Set(["unconscious"]), effects: [
  { id: "form", flags: { spikependium: { endsOnIncapacitated: true } }, system: {} },
  { id: "hypnosis", flags: { spikependium: { endsOutside: 10 } }, system: { origin: { activity: "source" } } },
  { id: "other", flags: {}, system: {} }
] };
assert.deepEqual(endedEffects(expiredActor, () => ({ actor: {} }), () => 11), ["form", "hypnosis"]);
expiredActor.statuses.clear();
assert.deepEqual(endedEffects(expiredActor, () => ({ actor: {} }), () => 10), []);
globalThis.canvas = { ready: true, grid: { units: "ft", getCenterPoint: o => o,
  measurePath: ([a, b]) => ({ distance: Math.hypot(a.x - b.x, a.y - b.y) }) } };
globalThis.dnd5e = { utils: { convertLength: n => n } };
const tokenActor = points => ({ getActiveTokens: () => [{ elevation: 0, getOccupiedGridSpaceOffsets: () => points,
  getCenterPoint: () => ({ x: 0, y: 0 }) }] });
assert.equal(tokenDistance(tokenActor([{ x: 0, y: 0 }, { x: 5, y: 0 }]), tokenActor([{ x: 15, y: 0 }])), 10);
assert.equal(tokenDistance(tokenActor([]), tokenActor([{ x: 5, y: 0 }])), 5);
console.log("Регрессии действий, источников, выбора ресурсов, эффектов и призывов: OK.");

const hitClasses = [
  { id: "d8class", type: "class", system: { hd: { denomination: "d8", value: 2, spent: 1 } } },
  { id: "d12class", type: "class", system: { hd: { denomination: "d12", value: 1, spent: 0 } } },
  { id: "usedClass", type: "class", system: { hd: { denomination: "d6", value: 0, spent: 1 } } }
];
const hitActor = { classes: Object.fromEntries(hitClasses.map(c => [c.id, c])),
  items: { get: id => hitClasses.find(c => c.id === id) }, system: { attributes: { hp: { temp: 3 } } } };
assert.deepEqual(hitDieChoices(hitActor).map(c => c.value), ["d8", "d12"]);
assert.deepEqual(hitDieOutcome("surge", 4, 7), { value: 4, damage: 0, updates: { "system.attributes.hp.temp": 7 } });
assert.deepEqual(hitDieOutcome("surge", 5, 7), { value: 5, damage: 5, updates: {} });
assert.deepEqual(hitDieOutcome("inspiration", 6, 3), { value: 6, damage: 6, updates: { "system.attributes.hp.temp": 6 } });
assert.equal(hitDieOutcome("inspiration", 0), null);
const hdActivity = { actor: hitActor, item: { flags: {} }, flags: { spikependium: { hitDieOutcome: "inspiration" } },
  consumption: { targets: [{ type: "hitDice", target: "smallest", toObject() { return { type: this.type, target: this.target }; } }] },
  updateSource(data) { this.consumption.targets[0].target = data["consumption.targets"][0].target; }, getRollData: () => ({}) };
let hdRolls = 0;
let hdDamage;
globalThis.CONFIG = { Dice: { BasicRoll: class {
  constructor(formula) { this.formula = formula; this.total = 6; hdRolls++; }
  async evaluate() { return this; }
}, DamageRoll: { build: async (roll, dialog, message) => { hdDamage = { roll, dialog, message }; } } } };
const hdUpdates = { actor: {}, item: [{ _id: "d12class", "system.hd.spent": 1 }], rolls: [] };
const plannedHD = await prepareResourceUpdates.call(hdActivity, async () => hdUpdates, { consume: { resources: [0] }, spikependium: { hitDie: "d12" } });
assert.equal(hdActivity.consumption.targets[0].target, "d12");
assert.equal(plannedHD.rolls[0].formula, "1d12");
assert.equal(plannedHD.actor["system.attributes.hp.temp"], 6);
assert.equal(hdRolls, 1);
await prepareResourceUpdates.call(hdActivity, async () => ({ actor: {}, item: [], rolls: [] }), { consume: false });
assert.equal(hdRolls, 1);
assert.equal(await prepareResourceUpdates.call(hdActivity, () => { throw Error("must not consume"); },
  { consume: true, spikependium: { hitDie: "d6" } }), false);
globalThis.ChatMessage = { getSpeaker: () => ({ actor: "caster" }) };
await postHitDieDamage({ item: { name: "Mark" }, actor: hitActor, messageSources: { actor: "caster" } }, {},
  { updates: plannedHD, message: { id: "origin", system: { targets: [{ uuid: "Actor.target" }] } } });
assert.equal(hdDamage.roll.rolls[0].parts[0], "6");
assert.equal(hdDamage.roll.rolls[0].options.type, "force");
assert.equal(hdDamage.message.data.type, "damage");
assert.equal(hdDamage.message.data.system.origin, "origin");
assert.equal(hdRolls, 1);
assert.equal(Object.values(doc("feat:aberrant-dragonmark").system.activities).find(a => a._id === makeId("activity:aberrant:surge")).flags.spikependium.hitDieOutcome, "surge");
assert.equal(Object.values(doc("feat:greater-aberrant").system.activities).find(a => a._id === makeId("activity:greater-aberrant:inspiration")).flags.spikependium.hitDieOutcome, "inspiration");
console.log("Выбор, расход и единый результат костей хитов: OK.");

const commander = { id: "source", actor: { uuid: "Actor.owner", flags: {}, statuses: new Set() } };
const commanded = { type: "attack", activation: { type: "action" }, actor: { flags: {
  spikependium: { key: "actor:reanimated-companion:fury" }, dnd5e: { summon: { origin: "source" } }
} } };
const orderActivity = { flags: { spikependium: { companionAction: "command" } }, actor: commander.actor, item: commander };
const orderCombat = { started: true, id: "orders", round: 1, turn: 0, combatant: { actor: commander.actor } };
assert.equal(canCompanionAct(commanded, () => commander, orderCombat), false);
const orderUpdates = { actor: {} };
commandCompanion(orderActivity, {}, {}, orderUpdates, orderCombat);
commander.actor.flags.spikependium = { companionCommands: { source: orderUpdates.actor["flags.spikependium.companionCommands.source"] } };
assert.equal(canCompanionAct(commanded, () => commander, orderCombat), true);
assert.equal(canCompanionAct(commanded, () => commander, { ...orderCombat, turn: 1 }), false);
assert.equal(canCompanionAct({ ...commanded, activation: { type: "reaction" } }, () => commander, orderCombat), true);
commander.actor.statuses.add("unconscious");
assert.equal(canCompanionAct(commanded, () => commander, { ...orderCombat, turn: 1 }), true);
commander.actor.statuses.clear();
assert.equal(commandCompanion(orderActivity, {}, {}, { actor: {} }, { ...orderCombat, combatant: { actor: { uuid: "other" } } }), false);
assert.equal(canCompanionAct(commanded, () => commander, null), true);
const reanimatedToken = { id: "undead", actor: { flags: { spikependium: { key: "actor:reanimated-companion", createdLongRest: "" }, dnd5e: { summon: { origin: "source" } } },
  system: { attributes: { hp: { value: 10 } } } } };
assert.equal(companionEnd(reanimatedToken, () => commander), null);
assert.equal(companionEnd(reanimatedToken, () => commander, commander.actor.uuid), "dismiss");
commander.actor.flags.spikependium.longRest = "rest";
assert.equal(companionEnd(reanimatedToken, () => commander), "dismiss");
delete commander.actor.flags.spikependium.longRest;
commander.actor.statuses.add("dead");
assert.equal(companionEnd(reanimatedToken, () => commander), "kill");
reanimatedToken.actor.system.attributes.hp.value = 0;
assert.equal(companionEnd(reanimatedToken, () => commander), null);
const vestigeToken = structuredClone(reanimatedToken);
vestigeToken.actor.flags.spikependium.key = "actor:vestige-celestial";
assert.equal(companionEnd(vestigeToken, () => commander), "dismiss");
commander.actor.statuses.clear();
assert.equal(companionEnd(vestigeToken, () => commander), "dismiss");
vestigeToken.actor.system.attributes.hp.value = 10;
assert.equal(companionEnd(vestigeToken, () => commander), null);
assert.equal(companionEnd({ actor: { flags: {} } }, () => commander), null);
let removedTokens;
globalThis.game = { user: { isActiveGM: true }, scenes: [{ tokens: [reanimatedToken],
  deleteEmbeddedDocuments: async (type, ids) => { removedTokens = ids; } }] };
globalThis.fromUuidSync = uuid => uuid === "source" ? commander : null;
await updateCompanions(commander.actor, { "flags.spikependium.longRest": "rest" });
assert.deepEqual(removedTokens, ["undead"]);
let recordedRest;
await recordCompanionRest({ setFlag: async (...args) => { recordedRest = args; } }, {}, { type: "short" });
assert.equal(recordedRest, undefined);
globalThis.foundry = { utils: { randomID: () => "completed-rest" } };
await recordCompanionRest({ setFlag: async (...args) => { recordedRest = args; } }, {}, { type: "long" });
assert.deepEqual(recordedRest, ["spikependium", "longRest", "completed-rest"]);

const mutableEffect = { flags: { spikependium: { mutableForm: true } }, disabled: false, duration: {} };
const linkedEffect = { id: "linked", flags: { spikependium: { endsWithMutable: true } } };
const linkedActor = { statuses: new Set(), effects: [mutableEffect, linkedEffect] };
const upgradeActivity = { flags: { spikependium: { requiresMutable: true } }, actor: linkedActor, transform: { formless: true } };
assert.equal(validateMutableForm(upgradeActivity, {}), true);
assert.deepEqual(endedEffects(linkedActor, () => null, () => null), []);
mutableEffect.disabled = true;
assert.equal(validateMutableForm(upgradeActivity, {}), false);
assert.equal(validateMutableForm(upgradeActivity, { transform: { profile: "" } }), true);
assert.deepEqual(endedEffects(linkedActor, () => null, () => null), ["linked"]);
const resourceActor = { flags: {}, items: { get: () => ({ system: { uses: { spent: 1 } } }) }, system: { spells: { spell1: { value: 3, max: 4 } } } };
const recoverActivity = { item: { flags: { spikependium: { key: "recovery" } } }, actor: resourceActor };
const recoverUpdates = { actor: { "system.spells.spell1.value": 5 }, item: [{ _id: "resource", "system.uses.spent": -1 }] };
assert.equal(limitRestoration(recoverActivity, recoverUpdates), true);
assert.equal(recoverUpdates.item[0]["system.uses.spent"], 0);
assert.equal(recoverUpdates.actor["system.spells.spell1.value"], 4);
resourceActor.system.spells.spell1.value = 4;
assert.equal(limitRestoration(recoverActivity, { actor: { "system.spells.spell1.value": 5 }, item: [] }), false);
resourceActor.items.get = () => ({ system: { uses: { spent: 0 } } });
assert.equal(limitRestoration(recoverActivity, { actor: {}, item: [{ _id: "resource", "system.uses.spent": -1 }] }), false);
console.log("Приказы, завершение призывов, связанные формы и пределы восстановления: OK.");

globalThis.foundry.utils.mergeObject = (a, b) => ({ ...a, ...b });
globalThis.ActiveEffect = { implementation: { getEffectStart: () => ({ time: 1 }), forApplication: async changes => changes } };
let selfCreated;
let selfRemoved;
let selfUpdated;
const selfActor = { effects: [{ id: "old", system: { origin: { activity: "Item.mutable.Activity.old", profile: "old" } } }],
  deleteEmbeddedDocuments: async (type, ids) => { selfRemoved = ids; },
  createEmbeddedDocuments: async (type, data) => { selfCreated = data; } };
const selfEffect = { id: "long", uuid: "Item.mutable.ActiveEffect.long", toObject: () => ({ _id: "long", duration: { expired: false },
  flags: { spikependium: { mutableForm: true } }, system: { changes: [] }, _stats: {} }) };
const selfActivity = { type: "heal", actor: selfActor, item: { uuid: "Item.mutable", flags: { spikependium: { key: "mutable" } } },
  uuid: "Item.mutable.Activity.new", target: { affects: { type: "self" } }, applicableEffects: [selfEffect], getAppliedEffectChanges: () => ({}) };
await applySelfEffects(selfActivity, {}, { message: { uuid: "ChatMessage.use" } });
assert.deepEqual(selfRemoved, ["old"]);
assert.equal(selfCreated.length, 1);
assert.equal(selfCreated[0].system.origin.profile, "long");
assert.equal(selfCreated[0].flags.spikependium.mutableForm, true);
assert.equal(selfCreated[0]._stats.duplicateSource, selfEffect.uuid);
selfActor.effects = [{ id: "existing", system: { origin: selfCreated[0].system.origin }, update: async data => { selfUpdated = data; } }];
selfCreated = undefined;
await applySelfEffects(selfActivity, {}, { message: {} });
assert.equal(selfCreated, undefined);
assert.equal(selfUpdated._id, "existing");
assert.equal(selfUpdated.disabled, false);
console.log("Автоматическое применение личных форм без дублей: OK.");

const arrayCollection = items => Object.assign(items, { get: id => items.find(i => i.id === id) });
const forgeOwner = { uuid: "Actor.artificer", flags: {}, classes: { artificer: { system: { levels: 2 } } },
  items: arrayCollection([]), system: { attributes: { attunement: { max: 3 } } } };
assert.equal(forgeBudget(forgeOwner).maximum, 2);
for (const [level, max] of [[1, 0], [6, 3], [10, 4], [14, 5], [18, 6]]) {
  forgeOwner.classes.artificer.system.levels = level;
  assert.equal(forgeBudget(forgeOwner).maximum, max);
}
forgeOwner.classes.artificer.system.levels = 2;
let blueprintPool;
prepareBlueprintAdvancement({ step: { flow: { level: 2, advancement: { configuration: { restriction: { subtype: "magicBlueprint" } },
  updateSource: data => { blueprintPool = data["configuration.pool"]; } } } } });
assert.equal(blueprintPool.length, BLUEPRINTS.filter(p => p.minimum <= 2).length);
assert.equal(TINKER_ITEMS.length, 26);
const forgeCatalog = JSON.parse(fs.readFileSync(new URL("./data/artificer-catalog.json", import.meta.url)));
assert.equal(JSON.stringify(FORGE_BASES), JSON.stringify(forgeCatalog.bases), "каталог должен быть пересобран после изменения исходных данных");
assert.equal(suitableForgeBase({ type: "equipment", category: "light" }, "equipment", "wand"), false);
assert.equal(suitableForgeBase({ type: "equipment", category: "wand" }, "equipment", "wand"), true);
assert.equal(suitableForgeBase({ type: "equipment", category: "shield" }, "equipment", "armor"), false);
assert.equal(suitableForgeBase({ type: "equipment", category: "medium" }, "equipment", "armor"), true);
assert.equal(new Set(BLUEPRINTS.map(p => p.id)).size, BLUEPRINTS.length);
const plan2 = BLUEPRINTS.find(p => p.minimum === 2 && !p.moduleKey && !p.profile);
const plan14 = BLUEPRINTS.find(p => p.minimum === 14);
const planItem = { id: "learned", name: "Blueprint", system: {}, flags: { spikependium: { blueprint: plan2 } } };
forgeOwner.items.push(planItem, { id: "locked", flags: { spikependium: { blueprint: plan14 } } });
assert.deepEqual(knownBlueprints(forgeOwner).map(i => i.id), ["learned"]);
const forgeSource = { uuid: plan2.uuid, documentName: "Item", type: "equipment", system: { activities: arrayCollection([]) },
  toObject: () => ({ _id: "source", type: "equipment", system: { quantity: 5, price: { value: 400 }, weight: { value: 1 } }, flags: {}, _stats: {} }) };
globalThis.fromUuid = async uuid => uuid === plan2.uuid || TINKER_ITEMS.some(i => i.uuid === uuid) ? forgeSource : null;
globalThis.foundry.utils.randomID = () => "createdItem";
const replicate = { item: { flags: {} }, actor: forgeOwner, flags: { spikependium: { forge: "replicate" } } };
const emptyForgeUpdates = () => ({ create: [], delete: [], actor: {}, item: [], rolls: [] });
const createdForge = await prepareForgeCreation(replicate, { spikependium: { forge: { plan: "learned" } } }, emptyForgeUpdates());
assert.equal(createdForge.create.length, 1);
assert.equal(createdForge.create[0].system.quantity, 1);
assert.equal(createdForge.create[0].system.price.value, 400);
assert.equal(createdForge.create[0].flags.spikependium.forged.owner, forgeOwner.uuid);
assert.equal(createdForge.actor["flags.spikependium.forgeCrafts.initial.learned"], 1);
forgeOwner.flags.spikependium = { forgeCrafts: { initial: { learned: 1 } } };
assert.equal(await prepareForgeCreation(replicate, { spikependium: { forge: { plan: "learned" } } }, emptyForgeUpdates()), false);
assert.equal(await prepareForgeCreation(replicate, { spikependium: { forge: { plan: "locked" } } }, emptyForgeUpdates()), false);
forgeOwner.flags.spikependium.longRest = "secondRest";
assert.deepEqual(forgeBudget(forgeOwner).plans, []);
assert.ok(await prepareForgeCreation(replicate, { spikependium: { forge: { plan: "learned" } } }, emptyForgeUpdates()));
const mundane = await prepareForgeCreation({ ...replicate, flags: { spikependium: { forge: "mundane" } } },
  { spikependium: { forge: { item: TINKER_ITEMS[0].uuid } } }, emptyForgeUpdates());
assert.equal(mundane.create[0].flags.spikependium.forged.temporary, true);
assert.equal(mundane.actor["flags.spikependium.forgeCrafts.secondRest.learned"], undefined);
const forgedItem = (id, created, extra = {}) => ({ id, flags: { spikependium: { forged: { owner: forgeOwner.uuid, plan: "learned", created, ...extra } } } });
const held = [forgedItem("old", 1), forgedItem("middle", 2), forgedItem("new", 3)];
assert.deepEqual(obsoleteForgeItems(forgeOwner, held).map(i => i.id), ["old"]);
assert.deepEqual(obsoleteForgeItems(forgeOwner, [forgedItem("temporary", 4, { temporary: true, rest: "initial" })]).map(i => i.id), ["temporary"]);
assert.deepEqual(obsoleteForgeItems(forgeOwner, [forgedItem("pending", 4, { pending: true }), ...held.slice(1)]), []);
assert.deepEqual(obsoleteForgeItems(forgeOwner, [forgedItem("replaced", 4, { plan: "deletedBlueprint" })]).map(i => i.id), ["replaced"]);
assert.deepEqual(obsoleteForgeItems(forgeOwner, [forgedItem("someoneElse", 4, { owner: "Actor.other" })]), []);
assert.deepEqual(obsoleteForgeItems(forgeOwner, [forgedItem("expires", 4, { expires: 100 })], 99), []);
assert.deepEqual(obsoleteForgeItems(forgeOwner, [forgedItem("expires", 4, { expires: 100 })], 100).map(i => i.id), ["expires"]);
const weaponPlan = BLUEPRINTS.find(p => p.uuid.endsWith("dmgWeapon12or300") && p.minimum === 2);
forgeOwner.items.push({ id: "weaponPlan", flags: { spikependium: { blueprint: weaponPlan } } });
let appliedEnchantment;
const nativeEnchant = { type: "enchant", effects: [{ _id: weaponPlan.profile }], canEnchant: () => true,
  applyEnchantment: async (profile, item, options) => { appliedEnchantment = { profile, item, options }; return {}; } };
const weaponTemplate = { ...forgeSource, uuid: weaponPlan.uuid, type: "weapon", system: { type: { value: "" }, activities: arrayCollection([nativeEnchant]) } };
const baseID = FORGE_BASES.find(b => b.type === "weapon").uuid;
globalThis.fromUuid = async uuid => uuid === weaponPlan.uuid ? weaponTemplate : uuid === baseID ? forgeSource : null;
const weaponCreated = await prepareForgeCreation(replicate,
  { spikependium: { forge: { plan: "weaponPlan", base: baseID } } }, emptyForgeUpdates());
assert.equal(weaponCreated.spikependium.forge.profile, weaponPlan.profile);
assert.equal(weaponCreated.create[0].flags.spikependium.forged.pending, true);
let pendingSet;
forgeOwner.items.push({ id: "createdItem", setFlag: async (...args) => { pendingSet = args; } });
await finishForge(replicate, {}, { updates: weaponCreated, message: {} });
assert.equal(appliedEnchantment.profile, weaponPlan.profile);
assert.deepEqual(pendingSet, ["spikependium", "forged.pending", false]);
console.log("Чертежи, создание предметов, лимиты после отдыха и нативные зачарования: OK.");

let deathRolls = 0;
let deletedForge;
forgeOwner.statuses = new Set(["dead"]);
forgeOwner.deleteEmbeddedDocuments = async (type, ids) => { deletedForge = ids; forgeOwner.items = arrayCollection(forgeOwner.items.filter(i => !ids.includes(i.id))); };
const doomed = forgedItem("doomed", 5);
doomed.actor = forgeOwner;
doomed.system = {};
doomed.setFlag = async (module, key, value) => { doomed.flags.spikependium.forged.expires = value; };
forgeOwner.items = arrayCollection([planItem, doomed]);
globalThis.game = { user: { isActiveGM: true }, actors: [forgeOwner], scenes: [], time: { worldTime: 100 } };
globalThis.CONFIG.Dice.BasicRoll.build = async () => { deathRolls++; return [{ total: 3 }]; };
await cleanForgeItems();
assert.equal(doomed.flags.spikependium.forged.expires, 100 + 3 * 86400);
assert.equal(deathRolls, 1);
assert.equal(deletedForge, undefined);
await cleanForgeItems();
assert.equal(deathRolls, 1);
forgeOwner.statuses.clear();
game.time.worldTime = 100 + 3 * 86400;
await cleanForgeItems();
assert.deepEqual(deletedForge, ["doomed"]);
const mundaneContext = { fields: [], notes: [], inputs: {} };
globalThis.foundry.data = { fields: { StringField: class { constructor(options) { Object.assign(this, options); } }, BooleanField: class {} } };
await appendForgeFields({ actor: forgeOwner, flags: { spikependium: { forge: "mundane" } } }, {}, mundaneContext);
assert.equal(Object.keys(mundaneContext.fields[0].field.choices).length, 26);
assert.equal(mundaneContext.fields[0].value, TINKER_ITEMS[0].uuid);
console.log("Исчезновение по игровому времени и нативные поля создания: OK.");

const getProperty = (object, path) => path.split(".").reduce((o, k) => o?.[k], object);
const setProperty = (object, path, value) => {
  const parts = path.split(".");
  const key = parts.pop();
  let parent = object;
  for (const part of parts) parent = parent[part] ??= {};
  parent[key] = value;
};
Object.assign(foundry.utils, { getProperty, setProperty });
const itemsWith = items => Object.assign(arrayCollection(items), { has: id => items.some(i => i.id === id) });
const tinkerActor = { uuid: "Actor.tinker", name: "Artificer", isOwner: true, flags: {},
  classes: { artificer: { system: { levels: 6 } } },
  system: { spells: { spell1: { value: 4, max: 4 }, spell2: { value: 2, max: 2 }, pact: { value: 2, max: 2, level: 3 } },
    attributes: { attunement: { max: 3 } } }, getActiveTokens: () => [] };
const ally = { uuid: "Actor.holder", name: "Ally", isOwner: true, items: itemsWith([]),
  getActiveTokens: () => [], system: { attributes: { attunement: { max: 3 } } } };
const replica = { id: "replica", uuid: "Actor.tinker.Item.replica", name: "Wand", actor: tinkerActor, type: "equipment",
  flags: { spikependium: { forged: { owner: tinkerActor.uuid, plan: "learned", created: 123, rest: "original", expires: 999999 } } },
  system: { rarity: "uncommon", uses: { max: 7, spent: 4 }, description: { value: "The wand has 7 charges." }, container: null },
  toObject() { return { _id: this.id, type: this.type, name: this.name, system: structuredClone(this.system), flags: structuredClone(this.flags) }; } };
tinkerActor.items = itemsWith([planItem, replica]);
game.actors = [tinkerActor, ally];
game.scenes = [];
game.time.worldTime = 0;
globalThis.canvas = { ready: false };
const tinkerActivity = mode => ({ item: { flags: { spikependium: { key: "artificer:magic-item-tinker" } } }, actor: tinkerActor,
  flags: { spikependium: { forge: mode } }, consumption: { targets: [] } });
const tinkerConfig = { spikependium: { forge: { replica: replica.uuid } } };
assert.equal(replicas(tinkerActor, "charge").length, 1);
replica.system.description.value = "Once per day.";
assert.equal(replicas(tinkerActor, "charge").length, 0, "ежедневное применение не является зарядом");
replica.system.description.value = "The wand has 7 charges.";
const chargeUpdates = emptyForgeUpdates();
chargeUpdates.actor["system.spells.spell2.value"] = 1;
const charged = await prepareTinkering(tinkerActivity("charge"), tinkerConfig, chargeUpdates);
assert.equal(charged.item[0]["system.uses.spent"], 2);
assert.equal(await prepareTinkering(tinkerActivity("charge"), tinkerConfig, emptyForgeUpdates()), false);
const pactUpdates = emptyForgeUpdates();
pactUpdates.actor["system.spells.pact.value"] = 1;
assert.equal((await prepareTinkering(tinkerActivity("charge"), tinkerConfig, pactUpdates)).item[0]["system.uses.spent"], 1);
replica.system.uses.spent = 1;
assert.equal((await prepareTinkering(tinkerActivity("charge"), tinkerConfig, chargeUpdates)).item.at(-1)["system.uses.spent"], 0);
replica.system.uses.spent = 4;
replica.system.rarity = "veryRare";
assert.equal(await prepareTinkering(tinkerActivity("drain"), tinkerConfig, emptyForgeUpdates()), false);
replica.system.rarity = "uncommon";
const drained = await prepareTinkering(tinkerActivity("drain"), tinkerConfig, emptyForgeUpdates());
assert.equal(drained.actor["system.spells.spell2.value"], 3, "добавляет ячейку даже при полном запасе");
assert.equal(drained.actor["flags.spikependium.drainedSlots.spell2"], 1);
assert.deepEqual(drained.delete, ["replica"]);
assert.equal(limitRestoration(tinkerActivity("drain"), drained), true);
assert.equal(drained.actor["system.spells.spell2.value"], 3);
tinkerActor.flags.spikependium = { drainedSlots: { spell2: 1 } };
assert.equal(await prepareTinkering(tinkerActivity("drain"), tinkerConfig, emptyForgeUpdates()), false);
addDrainedSlots.call(tinkerActor, () => { tinkerActor.system.spells.spell2.max = 3; });
assert.equal(tinkerActor.system.spells.spell2.max, 4, "не блокирует рост базового числа ячеек при повышении уровня");
const shortRest = { updateData: {} };
expireDrainedSlots(tinkerActor, shortRest, { type: "short" });
assert.deepEqual(shortRest.updateData, {});
const longRest = { updateData: { "system.spells.spell2.value": 4 } };
expireDrainedSlots(tinkerActor, longRest, { type: "long" });
assert.equal(longRest.updateData["system.spells.spell2.value"], 3);
assert.equal(longRest.updateData["flags.spikependium.drainedSlots.spell2"], 0);
assert.equal(tinkerActor.system.spells.spell2.override, undefined, "не меняет пользовательский override");
tinkerActor.flags = {};

const content = { id: "content", flags: {}, system: { container: replica.id } };
tinkerActor.items.push(content);
replica.type = "container";
const containerSource = { ...forgeSource, type: "container", system: { activities: arrayCollection([]) },
  toObject: () => ({ type: "container", system: { quantity: 1 }, flags: {}, _stats: {} }) };
globalThis.fromUuid = async uuid => uuid === plan2.uuid ? containerSource : uuid === ally.uuid ? ally : uuid === tinkerActor.uuid ? tinkerActor : null;
const transmuteConfig = { spikependium: { forge: { replica: replica.uuid, plan: "learned" } } };
tinkerActor.flags.spikependium = { forgeCrafts: { initial: { learned: 1, other: 1, third: 1 } } };
const transformed = await prepareTinkering(tinkerActivity("transmute"), transmuteConfig, emptyForgeUpdates());
assert.equal(transformed.create.length, 1, "трансмутация не расходует лимит создания после отдыха");
assert.deepEqual(transformed.delete, ["replica"]);
assert.equal(transformed.create[0].flags.spikependium.forged.created, 123);
assert.equal(transformed.create[0].flags.spikependium.forged.expires, 999999);
assert.equal(transformed.item[0]["system.container"], "createdItem");
assert.equal(transformed.actor["flags.spikependium.forgeCrafts.initial.learned"], undefined);

replica.actor = ally;
replica.uuid = "Actor.holder.Item.replica";
ally.items = itemsWith([replica, content]);
tinkerActor.items = itemsWith([planItem]);
const foreignConfig = { spikependium: { forge: { replica: replica.uuid } } };
const foreignCharge = await prepareTinkering(tinkerActivity("charge"), foreignConfig,
  { ...emptyForgeUpdates(), actor: { "system.spells.spell2.value": 1 } });
assert.equal(foreignCharge.item.length, 0);
assert.equal(foreignCharge.operations[0].parent, ally);
assert.equal(foreignCharge.operations[0].updates[0]["system.uses.spent"], 2);
assert.equal(foreignCharge.spikependium.tinkerUndo.item[0].delta, -2);
ally.isOwner = false;
assert.equal(await prepareTinkering(tinkerActivity("charge"), foreignConfig, emptyForgeUpdates()), false);
ally.isOwner = true;
const foreignTransmuted = await prepareTinkering(tinkerActivity("transmute"),
  { spikependium: { forge: { replica: replica.uuid, plan: "learned" } } }, emptyForgeUpdates());
assert.equal(foreignTransmuted.create.length, 0);
assert.equal(foreignTransmuted.delete.length, 0);
assert.equal(foreignTransmuted.operations.find(o => o.action === "create").parent, ally);
assert.equal(foreignTransmuted.spikependium.tinkerUndo.deleted[0]._id, replica.id);

const consumptionMessage = { data: { system: { deltas: { actor: [] } } } };
recordForgeConsumption(tinkerActivity("drain"), foreignConfig, consumptionMessage, { ...drained,
  spikependium: { ...drained.spikependium, numericFlags: [{ keyPath: "flags.spikependium.drainedSlots.spell2", delta: 1 }] } });
assert.equal(consumptionMessage.data.system.deltas.actor[0].delta, 1);
recordForgeConsumption(tinkerActivity("drain"), foreignConfig, consumptionMessage, { ...drained,
  spikependium: { ...drained.spikependium, numericFlags: [{ keyPath: "flags.spikependium.drainedSlots.spell2", delta: 1 }] } });
assert.equal(consumptionMessage.data.system.deltas.actor.length, 1, "не удваивает нативные дельты");
assert.equal(restoreForgeSelection.call(tinkerActivity("charge"), () => ({ consume: true }), {},
  { flags: consumptionMessage.data.flags }).spikependium.forge.replica, replica.uuid);
const consumedCharge = { actor: [{ keyPath: "system.spells.spell2.value", delta: -1 }] };
game.messages = [{ system: { deltas: consumedCharge }, flags: { spikependium: { tinkerUndo: foreignCharge.spikependium.tinkerUndo } } }];
let refundUpdates;
tinkerActor.system.spells.spell2.value = 1;
replica.system.uses.spent = 2;
tinkerActor.performBulkUpdate = async updates => { refundUpdates = updates; };
await refundTinkering.call(tinkerActivity("charge"), () => { throw Error("must refund together"); }, consumedCharge);
assert.equal(refundUpdates.actor["system.spells.spell2.value"], 2);
assert.equal(refundUpdates.operations[0].updates[0]["system.uses.spent"], 4);
const consumedTransmute = { item: {} };
const newContainer = { id: "createdItem", flags: {}, system: { container: null } };
content.system.container = newContainer.id;
const laterContent = { id: "laterContent", flags: {}, system: { container: newContainer.id } };
ally.items = itemsWith([newContainer, content, laterContent]);
game.messages = [{ system: { deltas: consumedTransmute }, flags: { spikependium: { tinkerUndo: foreignTransmuted.spikependium.tinkerUndo } } }];
await refundTinkering.call(tinkerActivity("transmute"), () => {}, consumedTransmute);
assert.equal(refundUpdates.operations.find(o => o.action === "create").data[0]._id, "replica");
assert.equal(refundUpdates.operations.find(o => o.action === "update").updates.find(i => i._id === "content")["system.container"], "replica");
assert.equal(refundUpdates.operations.find(o => o.action === "update").updates.find(i => i._id === "laterContent")["system.container"], null);
const consumedDrain = { actor: [] };
game.messages = [{ system: { deltas: consumedDrain }, flags: { spikependium: { tinkerUndo: drained.spikependium.tinkerUndo } } }];
tinkerActor.flags.spikependium = { longRest: "later", drainedSlots: { spell2: 0 } };
await assert.rejects(refundTinkering.call(tinkerActivity("drain"), () => {}, consumedDrain), /исчезла/);
const fieldContext = { fields: [], notes: [] };
ally.items = itemsWith([replica]);
appendTinkerFields(tinkerActivity("charge"), foreignConfig, fieldContext);
assert.equal(fieldContext.fields[0].field.choices[replica.uuid], "Wand — Ally");
for (const mode of ["charge", "drain", "transmute"]) assert.equal(Object.values(doc("artificer:magic-item-tinker").system.activities)
  .find(a => a._id === makeId(`activity:artificer:magic-item-tinker:${mode}`)).flags.spikependium.forge, mode);
console.log("Закачка, временная ячейка, трансмутация, содержимое контейнеров и отмена на чужом листе: OK.");

replica.actor = tinkerActor;
replica.uuid = "Actor.tinker.Item.replica";
tinkerActor.items = itemsWith([planItem, replica]);
ally.items = itemsWith([]);
tinkerActor.flags = {};
tinkerActor.system.spells.spell2 = { value: 2, max: 2 };
const plannedDrain = await prepareResourceUpdates.call(tinkerActivity("drain"), async () => emptyForgeUpdates(),
  { ...tinkerConfig, consume: true });
assert.deepEqual(plannedDrain.spikependium.numericFlags, [{ keyPath: "flags.spikependium.drainedSlots.spell2", delta: 1 }]);
replica.system.rarity = "common";
assert.equal((await prepareTinkering(tinkerActivity("drain"), tinkerConfig, emptyForgeUpdates())).actor["system.spells.spell1.value"], 5);
replica.system.rarity = "uncommon";
const plannedReplicate = await prepareResourceUpdates.call({ ...replicate, actor: tinkerActor, consumption: { targets: [] } },
  async () => emptyForgeUpdates(), { consume: true, spikependium: { forge: { plan: "learned" } } });
assert.deepEqual(plannedReplicate.spikependium.numericFlags, [{ keyPath: "flags.spikependium.forgeCrafts.initial.learned", delta: 1 }]);
const ownCharge = await prepareTinkering(tinkerActivity("charge"), tinkerConfig,
  { ...emptyForgeUpdates(), actor: { "system.spells.spell2.value": 1 } });
const ownDeltas = { actor: [{ keyPath: "system.spells.spell2.value", delta: -1 }],
  item: { replica: [{ keyPath: "system.uses.spent", delta: -2 }] } };
game.messages = [{ system: { deltas: ownDeltas }, flags: { spikependium: { tinkerUndo: ownCharge.spikependium.tinkerUndo } } }];
replica.system.uses.spent = 0;
tinkerActor.system.spells.spell2.value = 1;
await refundTinkering.call(tinkerActivity("charge"), () => {}, ownDeltas);
assert.equal(refundUpdates.item[0]["system.uses.spent"], 2);
tinkerActor.items = itemsWith([planItem]);
await assert.rejects(refundTinkering.call(tinkerActivity("charge"), () => {}, ownDeltas), /перемещён/);
let delegatedRefund = false;
await refundTinkering.call(tinkerActivity("charge"), () => { delegatedRefund = true; }, { actor: [] });
assert.equal(delegatedRefund, true, "не изменяет отмену остальных действий");
console.log("Нативные счётчики первой операции и запрет отмены после переноса предмета: OK.");

tinkerActor.classes.artificer.system.levels = 20;
tinkerActor.system.attributes.hp = { value: 0, effectiveMax: 50, temp: 5 };
tinkerActor.system.attributes.death = { success: 1, failure: 2 };
tinkerActor.statuses = new Set();
tinkerActor.flags = {};
const soulFeature = { id: "soul", flags: { spikependium: { key: "artificer:soul-of-artifice" } }, system: {} };
const thirdHolder = { ...ally, uuid: "Actor.third", items: itemsWith([]) };
const rareReplica = { ...replica, id: "rare", uuid: "Actor.holder.Item.rare", actor: ally,
  system: { ...replica.system, rarity: "rare", container: null } };
const otherRareReplica = { ...rareReplica, id: "rare2", uuid: "Actor.third.Item.rare2", actor: thirdHolder };
const commonReplica = { ...replica, id: "common", uuid: "Actor.tinker.Item.common", system: { ...replica.system, rarity: "common" } };
const nestedReplica = { ...rareReplica, id: "nested", uuid: "Actor.holder.Item.nested", system: { ...rareReplica.system, container: rareReplica.id } };
const ownContent = { id: "ownContent", flags: {}, system: { container: replica.id } };
const allyContent = { id: "allyContent", flags: {}, system: { container: rareReplica.id } };
replica.system.container = null;
tinkerActor.items = itemsWith([planItem, soulFeature, replica, commonReplica, ownContent]);
ally.items = itemsWith([rareReplica, nestedReplica, allyContent]);
thirdHolder.items = itemsWith([otherRareReplica]);
game.actors = [tinkerActor, ally, thirdHolder];
globalThis.fromUuid = async uuid => game.actors.find(a => a.uuid === uuid) ?? null;
const sacrificeKey = item => item.uuid.replaceAll(".", "_");
const sacrificeConfig = { spikependium: { forge: { sacrifice: Object.fromEntries([replica, rareReplica, nestedReplica, otherRareReplica]
  .map(i => [sacrificeKey(i), true])) } } };
const sacrifice = await prepareTinkering(tinkerActivity("sacrifice"), sacrificeConfig, emptyForgeUpdates());
assert.equal(sacrifice.actor["system.attributes.hp.value"], 50, "хиты не превышают максимум и дельта совпадает с обновлением");
assert.equal(sacrifice.actor["system.attributes.death.failure"], 0);
assert.deepEqual(sacrifice.delete, [replica.id]);
assert.equal(sacrifice.spikependium.tinkerUndo.additional.length, 2);
assert.deepEqual(sacrifice.operations.filter(o => o.action === "delete").flatMap(o => o.ids).sort(), ["nested", "rare", "rare2"]);
assert.ok(!sacrifice.operations.some(o => o.updates?.some(i => i._id === "nested")), "не обновляет уничтожаемый вложенный предмет после удаления");
assert.equal(sacrifice.item[0]["system.container"], null);
assert.equal(await prepareSacrifice(tinkerActivity("sacrifice"), { spikependium: { forge: { sacrifice: { [sacrificeKey(commonReplica)]: true } } } }, emptyForgeUpdates()), false);
assert.equal(await prepareSacrifice(tinkerActivity("sacrifice"), {}, emptyForgeUpdates()), false);
tinkerActor.system.attributes.hp.value = 1;
assert.equal(await prepareSacrifice(tinkerActivity("sacrifice"), sacrificeConfig, emptyForgeUpdates()), false);
tinkerActor.system.attributes.hp.value = 0;
tinkerActor.statuses.add("dead");
assert.equal(await prepareSacrifice(tinkerActivity("sacrifice"), sacrificeConfig, emptyForgeUpdates()), false);
tinkerActor.statuses.clear();
tinkerActor.system.attributes.death.failure = 3;
assert.equal(await prepareSacrifice(tinkerActivity("sacrifice"), sacrificeConfig, emptyForgeUpdates()), false);
tinkerActor.system.attributes.death.failure = 2;
tinkerActor.flags.spikependium = { soulInstantDeath: 1 };
assert.equal(await prepareSacrifice(tinkerActivity("sacrifice"), sacrificeConfig, emptyForgeUpdates()), false);
tinkerActor.flags = {};
tinkerActor.system.attributes.hp.value = 10;
const massiveDamage = { "system.attributes.hp.value": 0 };
recordSoulDamage(tinkerActor, 65, massiveDamage);
assert.equal(massiveDamage["flags.spikependium.soulInstantDeath"], 1);
const normalDamage = { "system.attributes.hp.value": 0 };
recordSoulDamage(tinkerActor, 64, normalDamage);
assert.equal(normalDamage["flags.spikependium.soulInstantDeath"], 0, "учитывает временные хиты до расчёта остатка урона");
tinkerActor.flags.spikependium = { soulInstantDeath: 1 };
const revived = { system: { attributes: { hp: { value: 1 } } } };
resetSoulDeath(tinkerActor, revived);
assert.equal(revived["flags.spikependium.soulInstantDeath"], 0);
tinkerActor.flags = {};
tinkerActor.system.attributes.hp.value = 50;
tinkerActor.system.attributes.death = { success: 0, failure: 0 };
tinkerActor.items = itemsWith([planItem, soulFeature, commonReplica, ownContent]);
ownContent.system.container = null;
allyContent.system.container = null;
ally.items = itemsWith([allyContent]);
thirdHolder.items = itemsWith([]);
const sacrificedDeltas = { actor: [{ keyPath: "system.attributes.hp.value", delta: 50 }, { keyPath: "system.attributes.death.failure", delta: -2 }],
  deleted: [replica.toObject()], item: {} };
game.messages = [{ system: { deltas: sacrificedDeltas }, flags: { spikependium: { tinkerUndo: sacrifice.spikependium.tinkerUndo } } }];
await refundTinkering.call(tinkerActivity("sacrifice"), () => {}, sacrificedDeltas);
assert.equal(refundUpdates.actor["system.attributes.hp.value"], 0);
assert.equal(refundUpdates.actor["system.attributes.death.failure"], 2);
assert.equal(refundUpdates.create[0]._id, replica.id);
assert.equal(refundUpdates.operations.filter(o => o.action === "create").flatMap(o => o.data).length, 3);
assert.equal(refundUpdates.item.find(i => i._id === "ownContent")["system.container"], replica.id);
assert.equal(refundUpdates.operations.find(o => o.action === "update").updates[0]["system.container"], rareReplica.id);
tinkerActor.system.attributes.hp.value = 45;
await assert.rejects(refundTinkering.call(tinkerActivity("sacrifice"), () => {}, sacrificedDeltas), /хиты уже изменились/);
const flashFeature = { id: "flash", flags: { spikependium: { key: "artificer:flash-of-genius" } } };
const flashActivity = { actor: tinkerActor, item: flashFeature, flags: {}, consumption: { targets: [] } };
tinkerActor.items.push({ id: "attuned", flags: {}, system: { attuned: true } });
const flashUpdates = () => ({ ...emptyForgeUpdates(), actor: { "system.attributes.reaction.spent": 1 },
  item: [{ _id: "flash", "system.uses.spent": 1 }] });
const failedFlash = await prepareResourceUpdates.call(flashActivity, async () => flashUpdates(), { spikependium: { flashFailure: true } });
assert.equal(failedFlash.item.length, 0);
assert.equal(failedFlash.actor["system.attributes.reaction.spent"], 1);
assert.equal((await prepareResourceUpdates.call(flashActivity, async () => flashUpdates(), { spikependium: { flashFailure: false } })).item[0]["system.uses.spent"], 1);
tinkerActor.classes.artificer.system.levels = 19;
assert.equal((await prepareResourceUpdates.call(flashActivity, async () => flashUpdates(), { spikependium: { flashFailure: true } })).item[0]["system.uses.spent"], 1);
tinkerActor.classes.artificer.system.levels = 20;
tinkerActor.items = itemsWith(tinkerActor.items.filter(i => i.id !== "attuned"));
assert.equal((await prepareResourceUpdates.call(flashActivity, async () => flashUpdates(), { spikependium: { flashFailure: true } })).item[0]["system.uses.spent"], 1);
assert.equal(Object.values(doc("artificer:soul-of-artifice").system.activities)[0].flags.spikependium.forge, "sacrifice");
tinkerActor.system.attributes.hp.value = 0;
tinkerActor.flags.spikependium = { soulInstantDeath: 1 };
const damageAfterInstantDeath = { "system.attributes.hp.value": 0 };
recordSoulDamage(tinkerActor, 1, damageAfterInstantDeath);
assert.equal(damageAfterInstantDeath["flags.spikependium.soulInstantDeath"], undefined, "повторный малый урон не отменяет уже наступившую мгновенную смерть");
tinkerActor.items.push(replica);
ally.items = itemsWith([rareReplica, nestedReplica]);
const sacrificeFields = { fields: [], notes: [], inputs: { createCheckboxInput: () => {} } };
appendTinkerFields(tinkerActivity("sacrifice"), sacrificeConfig, sacrificeFields);
assert.equal(sacrificeFields.fields.length, 3);
assert.ok(sacrificeFields.fields.every(f => f.name.includes("sacrifice.") && f.value === true));
const guidanceMessage = { data: {} };
recordForgeConsumption(flashActivity, { spikependium: { flashFailure: true } }, guidanceMessage, failedFlash);
assert.equal(restoreForgeSelection.call(flashActivity, () => ({ consume: true }), {}, { flags: guidanceMessage.data.flags }).spikependium.flashFailure, true);
console.log("Душа изобретения: несколько владельцев, мгновенная смерть, отмена и Магическое руководство: OK.");

const storageOwner = { uuid: "Actor.creator", name: "Creator", isOwner: true, flags: {},
  classes: { artificer: { system: { levels: 11 } } },
  system: { abilities: { int: { mod: 5 } }, attributes: { prof: 4 } }, getActiveTokens: () => [] };
const storageHolder = { uuid: "Actor.carrier", name: "Carrier", isOwner: true, getActiveTokens: () => [] };
storageOwner.concentration = storageHolder.concentration = { effects: [] };
const storageEffect = data => ({ ...data, id: data._id, toObject: () => structuredClone(data) });
const storageWeapon = (id, actor) => ({ id, uuid: `${actor.uuid}.Item.${id}`, actor, type: "weapon", name: id,
  identifier: id, flags: {}, effects: itemsWith([]),
  system: { type: { value: "martialM" }, properties: new Set(), activities: itemsWith([]), weight: { value: 3 },
    price: { value: 15 }, attunement: "required", attuned: false } });
const heldWeapon = storageWeapon("blade", storageHolder);
const oldWeapon = storageWeapon("oldBlade", storageOwner);
const storageFeature = { id: "storage", type: "feat", flags: {}, effects: itemsWith([]), system: { uses: { spent: 0 } } };
const storageClass = { id: "class", type: "class", flags: {}, effects: itemsWith([]), system: { identifier: "artificer" } };
const storageSubclass = { type: "subclass", flags: {}, effects: itemsWith([]), system: { identifier: "alchemist", classIdentifier: "artificer" } };
const storageSpellDoc = (id, level = 2) => ({ id, uuid: `Compendium.spells.Item.${id}`, type: "spell", name: id, img: "spell.svg",
  _stats: { compendiumSource: `Compendium.spells.Item.${id}` }, flags: {}, effects: itemsWith([]),
  system: { level, activation: { type: "action", value: 1 }, materials: { consumed: false }, properties: new Set(["concentration"]),
    uses: { max: "1", spent: 1, recovery: [{ period: "lr" }] }, sourceItem: "" },
  toObject() { return { name: this.name, type: this.type, img: this.img, _stats: this._stats,
    flags: structuredClone(this.flags), effects: [], system: { ...structuredClone(this.system), properties: [...this.system.properties] } }; } });
const storedSpell = storageSpellDoc("web");
const thirdLevelSpell = storageSpellDoc("third", 3);
const wrongClassSpell = { ...storageSpellDoc("wizard"), system: { ...storedSpell.system, sourceItem: "class:wizard" } };
const subclassSpell = storageSpellDoc("alchemist");
const ownedSpell = { ...storedSpell, uuid: "Actor.creator.Item.web", system: { ...storedSpell.system, sourceItem: "class:artificer" } };
storageOwner.items = itemsWith([storageClass, storageSubclass, storageFeature, oldWeapon, ownedSpell, wrongClassSpell]);
storageHolder.items = itemsWith([heldWeapon]);
for (const actor of [storageOwner, storageHolder]) for (const item of actor.items) item.actor = actor;
game.actors = [storageOwner, storageHolder];
game.scenes = [];
game.users = { activeGM: {} };
game.combat = null;
globalThis.dnd5e = { registry: { spellLists: { forType: (type, identifier) => type === "class:artificer"
  ? { getSpells: async () => [storedSpell, thirdLevelSpell, storageSpellDoc("fourth", 4)] }
  : identifier === "alchemist" ? { getSpells: async () => [subclassSpell] } : null } } };
globalThis.fromUuid = async uuid => game.actors.find(a => a.uuid === uuid)
  ?? game.actors.flatMap(a => [...a.items]).find(i => i.uuid === uuid) ?? null;
assert.equal(storageTarget(heldWeapon), true, "ненастроенное магическое оружие допускается как носитель");
assert.equal(storageTarget({ ...heldWeapon, system: { ...heldWeapon.system, type: { value: "natural" } } }), false);
assert.equal(storageTarget({ ...heldWeapon, type: "equipment", system: { ...heldWeapon.system, properties: new Set(["foc"]) } }), true);
assert.equal(storageTarget({ ...heldWeapon, type: "tool", system: { ...heldWeapon.system, type: { value: "art" } } }), true);
assert.equal(storageSpell(storedSpell), true);
assert.equal(storageSpell({ ...storedSpell, system: { ...storedSpell.system, materials: { consumed: true } } }), false);
assert.equal(storageSpell({ ...storedSpell, system: { ...storedSpell.system, activation: { type: "reaction", value: 1 } } }), false);
assert.deepEqual((await storableSpells(storageOwner)).map(s => s.id), ["web", "third", "alchemist"], "список включает неподготовленные и подклассовые заклинания, исключает чужой класс и дубль на листе");
CONFIG.DND5E = { activityTypes: { cast: { documentClass: class {
  constructor(data) { this.data = { ...cast("storage:test", data.spell.uuid), ...data, _id: "storedCast" }; }
  toObject() { return structuredClone(this.data); }
} } } };
CONFIG.Item = { documentClass: class {
  constructor(data) { this.data = structuredClone(data); this.effects = data.effects.map(storageEffect); }
  clone(changes) {
    const data = structuredClone(this.data);
    for (const [key, value] of Object.entries(changes)) {
      if (key.includes(".")) setProperty(data, key, structuredClone(value));
      else if (key === "flags") data.flags = { ...data.flags, ...structuredClone(value) };
      else data[key] = structuredClone(value);
    }
    return { toObject: () => data };
  }
} };
const storageActivity = { uuid: "Actor.creator.Item.storage.Activity.store", flags: { spikependium: { forge: "store-spell" } },
  actor: storageOwner, item: storageFeature, consumption: { targets: [] } };
const storeConfig = { spikependium: { forge: { target: heldWeapon.uuid, spell: storedSpell.uuid } } };
const paidStorage = () => ({ ...emptyForgeUpdates(), item: [{ _id: storageFeature.id, "system.uses.spent": 1 }] });
assert.equal(await prepareStorage(storageActivity, storeConfig, emptyForgeUpdates()), false, "нельзя пропустить расход после отдыха");
storageOwner.classes.artificer.system.levels = 10;
assert.equal(await prepareStorage(storageActivity, storeConfig, paidStorage()), false);
storageOwner.classes.artificer.system.levels = 11;
const plannedStorage = await prepareResourceUpdates.call(storageActivity, async () => paidStorage(), storeConfig);
const storedEffectData = plannedStorage.operations.find(o => o.action === "create").data[0];
const storedCastData = plannedStorage.operations.find(o => o.action === "update").updates[0]["system.activities.storedCast"];
assert.equal(storedCastData.uses.max, "10");
assert.deepEqual(storedCastData.uses.recovery, [], "отдых не пополняет сохранённые применения");
assert.equal(storedCastData.consumption.spellSlot, false);
assert.equal(storedCastData.spell.challenge.save, "17");
assert.equal(storedCastData.spell.challenge.attack, "9");
assert.equal(storedEffectData.system.magical, false, "хранение не даёт магический урон обычному оружию");
assert.equal(heldWeapon.system.activities.length, 0, "подготовка операции не меняет документы");
assert.equal(heldWeapon.system.price.value, 15);
storageOwner.system.abilities.int.mod = -1;
assert.equal((await prepareStorage(storageActivity, storeConfig, paidStorage())).operations
  .find(o => o.action === "update").updates[0]["system.activities.storedCast"].uses.max, "2", "минимум два применения при отрицательном Интеллекте");
storageOwner.system.abilities.int.mod = 5;
const storageContext = { fields: [], notes: [] };
await appendStorageFields(storageActivity, storeConfig, storageContext);
assert.equal(storageContext.fields[0].field.choices[heldWeapon.uuid], "blade — Carrier");
assert.ok(storageContext.fields[1].field.choices[thirdLevelSpell.uuid]);
const previousEffect = storageEffect({ _id: "previousEffect", flags: { spikependium: { storage: { owner: storageOwner.uuid } } } });
const previousCast = { id: "previousCast", flags: { dnd5e: { dependentOn: previousEffect.id } },
  toObject: () => ({ _id: "previousCast", uses: { max: "8", spent: 3 } }) };
oldWeapon.effects.push(previousEffect);
oldWeapon.system.activities.push(previousCast);
const replacedStorage = await prepareStorage(storageActivity, storeConfig, paidStorage());
assert.deepEqual(replacedStorage.operations[0].ids, ["previousEffect"]);
assert.equal(replacedStorage.spikependium.tinkerUndo.storage[0].activities[0].uses.spent, 3, "отмена сохраняет прежний расход");
game.users.activeGM = null;
assert.equal(await prepareStorage(storageActivity, storeConfig, paidStorage()), false);
game.users.activeGM = {};
const liveStoredCast = { ...storedCastData, id: storedCastData._id, item: heldWeapon, actor: storageHolder,
  dependentOrigin: { active: true }, constructor: { ENCHANTMENT_ID: "cacheEffect" },
  relativeUUID: "Item.blade.Activity.storedCast", uuid: `${heldWeapon.uuid}.Activity.storedCast`, getSpellChanges: () => [{ key: "system.ability", value: "int" }],
  uses: { ...storedCastData.uses, max: 10 } };
heldWeapon.effects.push(storageEffect(storedEffectData));
heldWeapon.system.activities.push(liveStoredCast);
const undoStorageUpdates = { ...emptyForgeUpdates(), operations: [] };
oldWeapon.effects = itemsWith([]);
oldWeapon.system.activities = itemsWith([]);
await appendStorageRefund(replacedStorage.spikependium.tinkerUndo, undoStorageUpdates);
assert.equal(undoStorageUpdates.operations.find(o => o.action === "create").data[0]._id, "previousEffect");
liveStoredCast.uses.spent = 1;
await assert.rejects(appendStorageRefund(replacedStorage.spikependium.tinkerUndo, { ...emptyForgeUpdates(), operations: [] }), /уже использовано/);
liveStoredCast.uses.spent = 0;
const cacheData = await storedCachedSpell.call(liveStoredCast, () => assert.fail("снимок не требует исходного заклинания"));
assert.equal(cacheData.flags.dnd5e.cachedFor, liveStoredCast.relativeUUID);
assert.equal(cacheData.flags.spikependium.storedSpell.abilityMod, 5);
assert.deepEqual(cacheData.system.properties, ["concentration"]);
assert.equal(cacheData.system.uses.max, "", "счётчик копии не ограничивает применения предмета");
const holderRollData = { abilities: { int: { mod: 0 } }, attributes: { spell: { mod: 0 } } };
assert.equal(storedItemRollData.call({ flags: cacheData.flags }, () => ({ ...holderRollData })).abilities.int.mod, 5);
assert.equal(holderRollData.abilities.int.mod, 0, "показатели носителя не изменяются");
assert.equal(storedActivityRollData.call({ item: { flags: cacheData.flags } }, () => ({ mod: 0 })).mod, 5);
liveStoredCast.visibility = { requireMagic: true, requireAttunement: true };
prepareStoredCast.call(liveStoredCast, () => {});
assert.equal(liveStoredCast.visibility.requireMagic, false);
assert.equal(liveStoredCast.visibility.requireAttunement, false);
const cachedActivity = { type: "save", actor: storageHolder, item: { flags: cacheData.flags }, consumption: { spellSlot: true },
  flags: {}, getLinkedActivity: () => liveStoredCast };
assert.equal(canUseStoredSpell(cachedActivity), true);
liveStoredCast.dependentOrigin.active = false;
assert.equal(canUseStoredSpell(cachedActivity), false);
liveStoredCast.dependentOrigin.active = true;
assert.equal(canUseStoredSpell({ ...cachedActivity, getLinkedActivity: () => undefined }), false, "осиротевшая копия не даёт бесплатных воспроизведений");
const storedUsageUpdates = () => ({ ...emptyForgeUpdates(), item: [{ _id: heldWeapon.id,
  "system.activities.storedCast": { uses: { spent: liveStoredCast.uses.spent + 1 } } }] });
assert.equal(prepareStoredUsage(cachedActivity, {}, emptyForgeUpdates()), false, "нельзя снять отметку расхода");
assert.ok(prepareStoredUsage(cachedActivity, {}, { ...emptyForgeUpdates(), item: [{ _id: heldWeapon.id,
  system: { activities: { storedCast: { uses: { spent: 1 } } } } }] }), "принимает также полностью вложенные обновления расхода");
const outsideCombatUse = prepareStoredUsage(cachedActivity, {}, storedUsageUpdates());
assert.equal(outsideCombatUse.spikependium.tinkerUndo.storedUse.spent, 1);
liveStoredCast.uses.spent = 1;
await appendStorageRefund(outsideCombatUse.spikependium.tinkerUndo, { ...emptyForgeUpdates(), operations: [] });
liveStoredCast.uses.spent = 2;
await assert.rejects(appendStorageRefund(outsideCombatUse.spikependium.tinkerUndo, { ...emptyForgeUpdates(), operations: [] }), /Предмет или ход/);
liveStoredCast.uses.spent = 0;
game.combat = { started: true, id: "battle", round: 3, turn: 0,
  turns: [{ actor: storageOwner }, { actor: storageHolder }] };
const combatUse = prepareStoredUsage(cachedActivity, {}, storedUsageUpdates());
heldWeapon.flags.spikependium = { storedCooldown: { storedCast: combatUse.spikependium.tinkerUndo.storedUse.after } };
liveStoredCast.uses.spent = 1;
assert.equal(canUseStoredSpell(cachedActivity), false);
game.combat.turn = 1;
assert.equal(canUseStoredSpell(cachedActivity), true, "доступно с начала хода носителя, если применение было до него");
const ownTurnMarker = { combat: "battle", holder: storageHolder.uuid, round: 3, turn: 2 };
assert.equal(storedCooldownReady(ownTurnMarker, game.combat), false);
game.combat.round = 4;
game.combat.turn = 0;
assert.equal(storedCooldownReady(ownTurnMarker, game.combat), false, "новый раунд ещё не равен началу хода носителя");
game.combat.turn = 1;
assert.equal(storedCooldownReady(ownTurnMarker, game.combat), true);
assert.equal(storedCooldownReady(ownTurnMarker, { ...game.combat, turns: [{ actor: storageOwner }] }), false);
assert.equal(storedCooldownReady(ownTurnMarker, null), true);
liveStoredCast.uses.spent = 10;
assert.equal(canUseStoredSpell(cachedActivity), false);
assert.equal(canUseStoredSpell({ ...cachedActivity, consumption: { spellSlot: false } }), true, "повторное действие уже созданного эффекта не требует нового воспроизведения");
liveStoredCast.uses.spent = 1;
const refundStoredUse = { actor: [], item: { blade: [{ keyPath: "system.activities.storedCast.uses.spent", delta: 1 }] } };
game.messages = [{ system: { deltas: refundStoredUse }, flags: { spikependium: { tinkerUndo: combatUse.spikependium.tinkerUndo } } }];
storageHolder.performBulkUpdate = async updates => { refundUpdates = updates; };
await refundTinkering.call(cachedActivity, () => assert.fail("ожидается проверяемая отмена"), refundStoredUse);
assert.equal(refundUpdates.item[0]["system.activities.storedCast.uses.spent"], 0);
assert.equal(refundUpdates.item[1]["flags.spikependium.storedCooldown.-=storedCast"], null);
heldWeapon.actor = storageOwner;
await assert.rejects(appendStorageRefund(combatUse.spikependium.tinkerUndo, { ...emptyForgeUpdates(), operations: [] }), /Предмет или ход/);
assert.equal(doc("artificer:spell-storing-item").system.uses.max, "1");
assert.equal(Object.values(doc("artificer:spell-storing-item").system.activities)[0].flags.spikependium.forge, "store-spell");
const maintainedCache = { id: "maintained", flags: cacheData.flags };
const finishedCache = { id: "finished", flags: cacheData.flags };
const otherCache = { id: "ordinary", flags: { dnd5e: { cachedFor: "ordinary" } } };
storageHolder.items = itemsWith([maintainedCache, finishedCache, otherCache]);
storageHolder.concentration = { effects: [{ flags: { dnd5e: { item: { data: { _id: maintainedCache.id } } } } }] };
const cacheCleanupOptions = { dnd5e: { removedCachedItems: ["maintained", "finished", "ordinary"] } };
await preserveStoredCache.call({ actor: storageHolder }, async () => {}, {}, cacheCleanupOptions);
assert.deepEqual(cacheCleanupOptions.dnd5e.removedCachedItems, ["finished", "ordinary"], "замена хранения сохраняет уже начатую концентрацию и обычную очистку других заклинаний");
game.user = { isActiveGM: true };
globalThis.fromUuidSync = () => null;
let cleanedStoredIds;
storageHolder.deleteEmbeddedDocuments = async (type, ids) => { cleanedStoredIds = ids; };
await cleanStoredCaches(storageHolder);
assert.deepEqual(cleanedStoredIds, ["finished"]);
storageHolder.concentration.effects = [];
await cleanStoredCaches(storageHolder);
assert.deepEqual(cleanedStoredIds, ["maintained", "finished"], "после окончания концентрации осиротевшая копия очищается");
globalThis.fromUuidSync = () => liveStoredCast;
cleanedStoredIds = [];
await cleanStoredCaches(storageHolder);
assert.deepEqual(cleanedStoredIds, [], "актуальная копия остаётся на носителе");
console.log("Хранящий заклинания предмет: выбор, неподготовленные заклинания, замена, показатели создателя, расход, очередность и отмена: OK.");

const burstOwner = { uuid: "Actor.burstOwner", statuses: new Set(), flags: {} };
ui.notifications.error = () => {};
const burstActor = { uuid: "Actor.burst", type: "npc", statuses: new Set(),
  flags: { spikependium: { key: "actor:reanimated-companion:fury:big-large" }, dnd5e: { summon: { origin: "burstOrigin" } } },
  system: { attributes: { hp: { value: 10 }, ac: { value: 15 } } }, items: itemsWith([]) };
const burstOrigin = { actor: burstOwner };
const burstHPChange = { system: { attributes: { hp: { value: 0 } } } };
recordCompanionDeath(burstActor, burstHPChange);
assert.equal(burstHPChange["flags.spikependium.deathExplosion"], "pending");
const notDeadChange = { "system.attributes.hp.value": 1 };
recordCompanionDeath(burstActor, notDeadChange);
assert.equal(notDeadChange["flags.spikependium.deathExplosion"], undefined);
const deadStatusChange = { statuses: ["dead"] };
recordCompanionDeath(burstActor, deadStatusChange);
assert.equal(deadStatusChange["flags.spikependium.deathExplosion"], "pending");
burstActor.system.attributes.hp.value = 0;
const alreadyDeadChange = { "system.attributes.hp.value": 0 };
recordCompanionDeath(burstActor, alreadyDeadChange);
assert.equal(alreadyDeadChange["flags.spikependium.deathExplosion"], undefined, "повторное изменение мёртвого спутника не запускает взрыв");
const reviveBurstChange = { "system.attributes.hp.value": 1 };
recordCompanionDeath(burstActor, reviveBurstChange);
assert.equal(reviveBurstChange["flags.spikependium.deathExplosion"], "");
const otherCompanionDeath = { "system.attributes.hp.value": 0 };
recordCompanionDeath({ ...burstActor, flags: { spikependium: { key: "actor:vestige-celestial" } } }, otherCompanionDeath);
assert.equal(otherCompanionDeath["flags.spikependium.deathExplosion"], undefined);
const burstActivity = { id: makeId("activity:actor:reanimated:explosion"), flags: { spikependium: { companionAction: "death-explosion" } },
  actor: burstActor, item: { id: "burstFeature", flags: {}, toObject: () => ({ _id: "burstFeature", system: { uses: {} } }) },
  type: "save", activation: { type: "special" }, consumption: { targets: [] } };
assert.equal(canUseCompanionDeath(burstActivity), true);
burstActor.system.attributes.hp.value = 10;
assert.equal(canUseCompanionDeath(burstActivity), false);
burstActor.system.attributes.hp.value = 0;
burstActor.flags.spikependium.deathExplosion = "done";
assert.equal(canUseCompanionDeath(burstActivity), false);
assert.equal(prepareCompanionDeath(burstActivity, {}, emptyForgeUpdates()), false);
burstActor.flags.spikependium.deathExplosion = "pending";
assert.equal(canUseCompanionDeath(burstActivity), false, "Мастер уже запускает обязательный взрыв");
assert.equal(canUseCompanionDeath(burstActivity, { spikependium: { deathExplosion: true } }), true);
const tokenForBurst = (id, actor, x, elevation = 0) => ({ id, uuid: `Scene.burst.Token.${id}`, name: id, actor, elevation,
  texture: { src: "token.webp" }, getOccupiedGridSpaceOffsets: () => [], getCenterPoint: () => ({ x, y: 0, elevation }) });
const burstSource = tokenForBurst("source", burstActor, 0);
const nearbyActor = { uuid: "Actor.near", type: "character", flags: {}, statuses: new Set(), system: { attributes: { ac: { value: 16 } } } };
const nearBurstTarget = tokenForBurst("near", nearbyActor, 10);
const farBurstTarget = tokenForBurst("far", nearbyActor, 15);
const highBurstTarget = tokenForBurst("high", nearbyActor, 0, 15);
const burstScene = { id: "burstScene", tokens: [burstSource, nearBurstTarget, farBurstTarget, highBurstTarget],
  deleteEmbeddedDocuments: async () => assert.fail("смерть не равна безвредному отзыву") };
canvas = { ready: true, scene: burstScene, grid: { units: "ft", getCenterPoint: point => point,
  measurePath: ([a, b]) => ({ distance: Math.hypot(a.x - b.x, a.y - b.y, (a.elevation ?? 0) - (b.elevation ?? 0)) }) } };
dnd5e.utils = { convertLength: value => value };
burstScene.grid = canvas.grid;
for (const token of burstScene.tokens) token.parent = burstScene;
ChatMessage.getSpeaker = ({ actor, token, scene }) => ({ actor: actor.uuid, token: token.id, scene: scene.id });
assert.deepEqual(explosionTargets(burstSource, burstScene).map(t => t.token), [nearBurstTarget.uuid], "граница 10 футов, высота, исключение источника и отдельные токены одного актёра");
burstSource.getOccupiedGridSpaceOffsets = () => [{ x: 0, y: 0 }, { x: 5, y: 0 }];
assert.deepEqual(explosionTargets(burstSource, burstScene).map(t => t.token), [nearBurstTarget.uuid, farBurstTarget.uuid], "эманация большого спутника измеряется от занимаемого пространства");
burstSource.getOccupiedGridSpaceOffsets = () => [{ x: 0, y: 0, elevation: 0 }, { x: 0, y: 0, elevation: 5 }];
assert.deepEqual(explosionTargets(burstSource, burstScene).map(t => t.token), [nearBurstTarget.uuid, highBurstTarget.uuid], "нативные объёмные клетки учитывают высоту тела, а высота не прибавляется второй раз");
burstSource.getOccupiedGridSpaceOffsets = () => [];
assert.deepEqual(explosionTargets(burstSource, { tokens: [] }), []);
globalThis.fromUuidSync = uuid => uuid === "burstOrigin" ? burstOrigin : null;
game.user = { isActiveGM: true };
game.users = { activeGM: {} };
game.scenes = [burstScene];
let burstCalls = 0;
let burstUseArgs;
burstActivity.use = async (...args) => {
  burstCalls++;
  burstUseArgs = args;
  const updates = await prepareResourceUpdates.call(burstActivity, async () => emptyForgeUpdates(), args[0]);
  assert.equal(updates.actor["flags.spikependium.deathExplosion"], "done");
  burstActor.flags.spikependium.deathExplosion = "done";
  return { message: { id: "burstCard" } };
};
burstActor.items.push({ system: { activities: itemsWith([burstActivity]) } });
burstActor.setFlag = async (module, key, value) => { await Promise.resolve(); burstActor.flags[module][key] = value; };
await Promise.all([triggerCompanionDeath(burstActor, burstSource, burstScene), triggerCompanionDeath(burstActor, burstSource, burstScene)]);
assert.equal(burstCalls, 1, "одновременные события смерти не создают две карточки");
assert.equal(burstUseArgs[0].create.measuredTemplate, false, "не открывает окно размещения шаблона на чужом клиенте");
assert.equal(burstUseArgs[1].configure, false);
assert.equal(burstUseArgs[2].data.system.targets[0].token, nearBurstTarget.uuid);
assert.equal(burstUseArgs[2].data.speaker.scene, burstScene.id);
assert.equal(burstUseArgs[2].data.speaker.token, burstSource.id);
assert.equal(burstUseArgs[2].data.flags.dnd5e.item.data._id, burstActivity.item.id, "карточка сохраняет снимок действия до последующего удаления токена");
await triggerCompanionDeath(burstActor, burstSource, burstScene);
assert.equal(burstCalls, 1);
burstActor.flags.spikependium.deathExplosion = "pending";
game.user.isActiveGM = false;
await triggerCompanionDeath(burstActor, burstSource, burstScene);
assert.equal(burstCalls, 1, "игроки не дублируют автоматический запуск Мастера");
game.user.isActiveGM = true;
canvas.scene = {};
await updateCompanions();
assert.equal(burstCalls, 2);
assert.equal(burstActor.flags.spikependium.deathExplosion, "done", "взрыв срабатывает и на неактивной сцене");
assert.equal(burstUseArgs[2].data.system.targets[0].token, nearBurstTarget.uuid, "использует сетку сцены спутника");
canvas.scene = burstScene;
await updateCompanions();
assert.equal(burstCalls, 2);
burstActor.system.attributes.hp.value = 10;
burstActor.flags.spikependium.deathExplosion = "";
burstOwner.statuses.add("dead");
burstActor.update = async changed => {
  recordCompanionDeath(burstActor, changed);
  burstActor.system.attributes.hp.value = changed["system.attributes.hp.value"];
  if (changed["flags.spikependium.deathExplosion"]) burstActor.flags.spikependium.deathExplosion = changed["flags.spikependium.deathExplosion"];
  await updateCompanions();
};
await updateCompanions();
assert.equal(burstActor.system.attributes.hp.value, 0);
assert.equal(burstCalls, 3, "смерть хозяина снижает хиты спутника и запускает взрыв");
burstOwner.statuses.clear();
burstActor.flags.spikependium.deathExplosion = "pending";
burstActivity.use = async () => { burstActor.flags.spikependium.deathExplosion = "done"; return undefined; };
const burstErrorLog = console.error;
try {
  console.error = () => {};
  await triggerCompanionDeath(burstActor, burstSource, burstScene);
} finally { console.error = burstErrorLog; }
assert.equal(burstActor.flags.spikependium.deathExplosion, "failed");
assert.equal(canUseCompanionDeath(burstActivity), true, "неудачный запуск допускает ручное восстановление");
burstActor.flags.spikependium.deathExplosion = "pending";
burstActivity.use = async (usage, dialog, message) => {
  game.messages.push({ flags: message.data.flags });
  throw new Error("после создания карточки");
};
try {
  console.error = () => {};
  await triggerCompanionDeath(burstActor, burstSource, burstScene);
} finally { console.error = burstErrorLog; }
assert.equal(burstActor.flags.spikependium.deathExplosion, "done", "ошибка после создания карточки не разрешает повторный взрыв");
burstActor.flags.spikependium.deathExplosion = "failed";
assert.equal(canUseCompanionDeath({ ...burstActivity, flags: {} }), true, "поддерживает уже призванного спутника со старым действием без новой метки");
burstActor.documentName = "Actor";
burstActor.system.attributes.hp.value = 10;
burstActor.flags.spikependium.deathExplosion = "";
burstActor.statuses.add("dead");
const deadCompanionEffect = { parent: burstActor, statuses: new Set(["dead"]) };
await recordCompanionStatus(deadCompanionEffect);
assert.equal(burstActor.flags.spikependium.deathExplosion, "pending", "добавление состояния Мёртвый запускает смерть независимо от числа хитов");
burstActor.flags.spikependium.deathExplosion = "done";
await recordCompanionStatus(deadCompanionEffect);
assert.equal(burstActor.flags.spikependium.deathExplosion, "done", "добавление второго эффекта смерти не повторяет взрыв");
burstActor.statuses.clear();
await recordCompanionStatus(deadCompanionEffect);
assert.equal(burstActor.flags.spikependium.deathExplosion, "", "снятие смерти при положительных хитах разрешает следующую смерть");
const nativeDeltaHPChange = { "system.attributes.hp.value": 0 };
const burstDelta = { parent: { actor: burstActor } };
recordCompanionDeath(burstDelta.parent.actor, nativeDeltaHPChange);
assert.equal(nativeDeltaHPChange["flags.spikependium.deathExplosion"], "pending", "ActorDelta сохраняет событие на призванном нелинкованном токене");
for (const actor of fs.readdirSync("packs/_source/creatures").filter(f => f.endsWith(".json"))
  .map(f => JSON.parse(fs.readFileSync(`packs/_source/creatures/${f}`, "utf8")))
  .filter(a => a.flags?.spikependium?.key?.startsWith("actor:reanimated-companion"))) {
  const explosion = actor.items.flatMap(i => Object.values(i.system.activities)).find(a => a._id === burstActivity.id);
  assert.equal(explosion.flags.spikependium.companionAction, "death-explosion");
}
console.log("Взрыв спутника: смерть, смерть хозяина, граница и высота, неактивная сцена, отсутствие дублей и восстановление после ошибки: OK.");

burstOwner.isOwner = true;
burstOwner.id = "burstOwner";
burstOwner.name = "Reanimator";
burstOwner.img = "owner.webp";
burstOwner.items = itemsWith([]);
burstOwner.classes = { artificer: { system: { levels: 15 } } };
burstOwner.system = { attributes: { hp: { value: 20 }, ac: { value: 15 } } };
burstOwner.getActiveTokens = () => [];
burstActor.id = "burst";
burstActor.name = "Companion";
burstActor.isOwner = true;
burstActor.effects = itemsWith([]);
const transfer = { id: makeId("activity:reanimator:transfer-life"), uuid: "Actor.burstOwner.Item.revival.Activity.transfer",
  type: "heal", actor: burstOwner, flags: { spikependium: { companionAction: "transfer-life" } },
  item: { id: "revival", type: "feat", flags: {}, system: {} }, consumption: { targets: [] } };
assert.equal(isLifeTransfer({ ...transfer, flags: {} }), true, "стабильный ID поддерживает старую черту");
assert.equal(isLifeTransfer(burstActivity), false);
let lifeIds = 0;
foundry.utils.randomID = () => `life${++lifeIds}`;
globalThis.ActiveEffect = { implementation: { fromStatusEffect: async status => ({ toObject: () => ({ statuses: [status], disabled: false }) }) } };
globalThis.fromUuidSync = uuid => uuid === "burstOrigin" ? burstOrigin : uuid === burstActor.uuid ? burstActor : null;
globalThis.fromUuid = async uuid => uuid === burstOwner.uuid ? burstOwner : fromUuidSync(uuid);
const unusedBurst = { ...burstActor, uuid: "Actor.noOrigin", flags: { spikependium: burstActor.flags.spikependium } };
burstScene.tokens.push({ actor: unusedBurst }, { actor: burstActor });
assert.deepEqual(lifeCompanions(burstOwner), [burstActor], "выбор только своего живого призыва, без дублей и шаблонов без источника");
const lifeFields = appendLifeTransferFields(transfer, {}, { fields: [], notes: [] });
assert.equal(lifeFields.fields[0].value, burstActor.uuid);
assert.match(lifeFields.fields[0].field.choices[burstActor.uuid], /10/);
class LifeDialog {
  async _prepareConsumptionContext() { return { fields: [], notes: [] }; }
}
const lifeUsageConfig = { consume: false, scaling: false };
const lifeDialog = { applicationClass: LifeDialog };
prepareChoiceDialog(transfer, lifeUsageConfig, lifeDialog);
assert.equal(lifeUsageConfig.scaling, 0, "выбор спутника открывается и при отключённом расходе ресурсов");
const lifeDialogInstance = new lifeDialog.applicationClass();
lifeDialogInstance.config = lifeUsageConfig;
assert.equal((await lifeDialogInstance._prepareConsumptionContext()).fields[0].name, "spikependium.companion");
assert.equal(await prepareLifeTransfer(transfer, { spikependium: { companion: "Actor.wrong" } }, emptyForgeUpdates()), false);
burstActor.isOwner = false;
assert.equal(await prepareLifeTransfer(transfer, {}, emptyForgeUpdates()), false, "нет прав на чужого спутника");
burstActor.isOwner = true;
burstOwner.classes.artificer.system.levels = 14;
assert.equal(await prepareLifeTransfer(transfer, {}, emptyForgeUpdates()), false);
burstOwner.classes.artificer.system.levels = 15;
burstOwner.statuses.add("incapacitated");
assert.equal(await prepareLifeTransfer(transfer, {}, emptyForgeUpdates()), false);
burstOwner.statuses.clear();
burstActor.statuses.add("dead");
assert.equal(await prepareLifeTransfer(transfer, {}, emptyForgeUpdates()), false);
burstActor.statuses.clear();
const anotherLifeCompanion = { ...burstActor, uuid: "Actor.anotherCompanion", id: "another" };
burstScene.tokens.push({ actor: anotherLifeCompanion });
assert.equal(await prepareLifeTransfer(transfer, {}, emptyForgeUpdates()), false, "несколько призывов требуют явного выбора");
burstScene.tokens.pop();
burstScene.tokens.splice(-2);
const lifeConfig = { consume: false, spikependium: { companion: burstActor.uuid } };
const lifePlan = await prepareResourceUpdates.call(transfer, async () => emptyForgeUpdates(), lifeConfig);
assert.equal(burstActor.system.attributes.hp.value, 10, "подготовка не меняет документы");
assert.equal(lifePlan.operations[0].documentName, "Actor");
assert.equal(lifePlan.operations[0].updates[0]["system.attributes.hp.value"], 0, "жертва обязательна и с consume:false");
assert.deepEqual(lifePlan.operations[1].data[0].statuses, ["dead"], "спутник умирает, а не только теряет хиты");
assert.equal(lifePlan.actor["system.attributes.hp.value"], undefined, "штатное лечение не дублируется изменением хитов");
assert.equal(lifePlan.spikependium.numericFlags[0].delta, 1);
const lifeUndo = lifePlan.spikependium.tinkerUndo;
burstActor.parent = { delta: { id: "delta" } };
const syntheticLifePlan = await prepareLifeTransfer(transfer, lifeConfig, emptyForgeUpdates());
assert.equal(syntheticLifePlan.operations[0].documentName, "ActorDelta");
assert.equal(syntheticLifePlan.operations[0].parent, burstActor.parent);
assert.equal(syntheticLifePlan.operations[0].updates[0]._id, "delta");
burstActor.parent = null;
const lifeMessageConfig = { data: { system: { deltas: { actor: [] } } } };
recordForgeConsumption(transfer, lifeConfig, lifeMessageConfig, lifePlan);
prepareCompanionUsage(transfer, lifeMessageConfig);
assert.equal(lifeMessageConfig.data.system.targets[0].actor, burstOwner.uuid);
assert.equal(lifeMessageConfig.data.system.targets[0].token, undefined, "самолечение работает и без токена владельца");
assert.equal(restoreForgeSelection.call(transfer, () => ({}), {}, { flags: lifeMessageConfig.data.flags }).spikependium.companion, burstActor.uuid);
const lifeCard = { id: "lifeCard", flags: lifeMessageConfig.data.flags, system: lifeMessageConfig.data.system };
game.messages = itemsWith([lifeCard]);
burstOwner.flags.spikependium = { companionLifeUses: { revival: 1 } };
burstActor.system.attributes.hp.value = 0;
burstActor.flags.spikependium.lifeTransfer = lifeUndo.life.event;
burstActor.flags.spikependium.deathExplosion = "pending";
const lifeDeadEffect = { id: lifeUndo.life.deadEffect, disabled: false, statuses: new Set(["dead"]) };
burstActor.effects.push(lifeDeadEffect);
assert.equal(canCreateCompanionMessage(lifeCard), undefined);
assert.equal(await prepareLifeTransfer(transfer, lifeConfig, emptyForgeUpdates()), false, "повторное лечение не расходует уже мёртвого спутника");
await assert.rejects(appendLifeTransferRefund(transfer, lifeUndo, { operations: [] }), /Дождитесь/);
burstActor.flags.spikependium.deathExplosion = "done";
await assert.rejects(appendLifeTransferRefund(transfer, lifeUndo, { operations: [] }), /Дождитесь/, "флаг done до доставки карточки не разрешает опасную отмену");
const linkedBurstConfig = { data: { flags: { spikependium: { deathExplosion: "lifeBurst" } }, system: {} } };
prepareCompanionUsage(burstActivity, linkedBurstConfig);
const lifeBurstCard = { id: "lifeBurstCard", ...linkedBurstConfig.data, canUserModify: () => true };
game.messages.push(lifeBurstCard);
let lifeHealingConfig;
await rollLifeHealing.call(transfer, (config, dialog, message) => { lifeHealingConfig = message; return []; }, {}, {}, { data: { system: { origin: lifeCard.id } } });
assert.equal(lifeHealingConfig.data.system.targets[0].actor, burstOwner.uuid, "выбранный враг не становится целью самолечения");
assert.deepEqual(lifeHealingConfig.data.flags.spikependium.lifeTransfer, lifeMessageConfig.data.flags.spikependium.lifeTransfer);
const lifeButtonEvent = { target: { closest: () => ({ dataset: { messageId: lifeCard.id } }) } };
rollLifeHealing.call(transfer, (config, dialog, message) => { assert.equal(message.data.system.origin, lifeCard.id); }, { event: lifeButtonEvent });
assert.equal(rollLifeHealing.call(transfer, () => assert.fail("нет бесплатного лечения")), undefined);
const unusedLifeRefund = { operations: [] };
await appendLifeTransferRefund(transfer, lifeUndo, unusedLifeRefund);
assert.deepEqual(unusedLifeRefund.operations[0].ids, [lifeBurstCard.id], "неиспользованная карточка взрыва удаляется при отмене");
assert.equal(unusedLifeRefund.operations[2].updates[0]["system.attributes.hp.value"], 10);
lifeBurstCard.canUserModify = () => false;
await assert.rejects(appendLifeTransferRefund(transfer, lifeUndo, { operations: [] }), /права Мастера/);
lifeBurstCard.canUserModify = () => true;
const lifeRollCard = { id: "lifeRoll", flags: {}, rolls: [{}], system: { origin: lifeBurstCard } };
game.messages.push(lifeRollCard);
await assert.rejects(appendLifeTransferRefund(transfer, lifeUndo, { operations: [] }), /выполнены броски/);
game.messages.pop();
lifeBurstCard.system.outcomes = new Map([["target", "failure"]]);
await assert.rejects(appendLifeTransferRefund(transfer, lifeUndo, { operations: [] }), /выполнены броски/);
lifeBurstCard.system.outcomes.clear();
burstOwner.system.attributes.hp.value++;
await assert.rejects(appendLifeTransferRefund(transfer, lifeUndo, { operations: [] }), /хиты хозяина/);
burstOwner.system.attributes.hp.value--;
burstOwner.flags.spikependium.longRest = "after-rest";
await assert.rejects(appendLifeTransferRefund(transfer, lifeUndo, { operations: [] }), /призыв уже изменились/);
delete burstOwner.flags.spikependium.longRest;
burstActor.effects.push({ id: "otherDeath", disabled: false, statuses: new Set(["dead"]) });
await assert.rejects(appendLifeTransferRefund(transfer, lifeUndo, { operations: [] }), /другое состояние смерти/);
burstActor.effects.pop();
let lifeRefundUpdates;
burstOwner.performBulkUpdate = async updates => { lifeRefundUpdates = updates; };
await refundTinkering.call(transfer, () => assert.fail("единая отмена"), lifeCard.system.deltas);
assert.equal(lifeRefundUpdates.actor["flags.spikependium.companionLifeUses.revival"], 0);
assert.equal(lifeRefundUpdates.operations.at(-1).updates[0]["system.attributes.hp.value"], 10);
burstActor.flags.spikependium.lifeTransfer = "";
assert.equal(canCreateCompanionMessage(lifeRollCard), false, "отмена блокирует позднее подтверждение уже открытого броска");
assert.equal(canCreateCompanionMessage({ flags: {}, system: {} }), undefined);
assert.equal(rollLifeHealing.call(transfer, () => assert.fail("отменённое лечение"), {}, {}, { data: { system: { origin: lifeCard.id } } }), undefined);
burstActor.flags.spikependium.lifeTransfer = lifeUndo.life.event;
lifeCard.system.deltas = null;
assert.equal(rollLifeHealing.call(transfer, () => assert.fail("карточка без расхода"), {}, {}, { data: { system: { origin: lifeCard.id } } }), undefined);
game.users.activeGM = null;
game.messages = itemsWith([]);
burstActor.flags.spikependium.deathExplosion = "pending";
await appendLifeTransferRefund(transfer, lifeUndo, { operations: [] });
const lifeRevive = { "system.attributes.hp.value": 10 };
recordCompanionDeath(burstActor, lifeRevive);
assert.equal(lifeRevive["flags.spikependium.lifeTransfer"], "", "оживление делает старые карточки недействительными");
const sourceLifeActivity = Object.values(doc("subclass:reanimator:promethean-revival").system.activities).find(a => a._id === transfer.id);
assert.equal(sourceLifeActivity.flags.spikependium.companionAction, "transfer-life");
assert.equal(sourceLifeActivity.healing.custom.formula, "@classes.artificer.levels");
// Полный путь жертвы: подготовка, изменение документов, запуск Взрыва и маркировка его карточки.
game.users.activeGM = {};
burstActor.system.attributes.hp.value = 10;
burstActor.flags.spikependium.lifeTransfer = "";
burstActor.flags.spikependium.deathExplosion = "";
burstActor.effects = itemsWith([]);
burstActivity.use = async (usage, dialog, message) => {
  prepareCompanionUsage(burstActivity, message);
  assert.equal(canCreateCompanionMessage(message.data), undefined);
  const card = { id: "integratedBurst", ...message.data };
  game.messages.push(card);
  return { message: card };
};
const integratedLife = await prepareResourceUpdates.call(transfer, async () => emptyForgeUpdates(), lifeConfig);
for (const [path, value] of Object.entries(integratedLife.operations[0].updates[0]).filter(([path]) => path !== "_id")) setProperty(burstActor, path, value);
const integratedDead = integratedLife.operations[1].data[0];
burstActor.effects.push({ id: integratedDead._id, statuses: new Set(integratedDead.statuses) });
burstActor.statuses.add("dead");
await updateCompanions();
assert.equal(burstActor.flags.spikependium.deathExplosion, "done");
assert.equal(game.messages.get("integratedBurst").flags.spikependium.lifeTransfer.event, integratedLife.spikependium.tinkerUndo.life.event);
burstActor.flags.spikependium.deathExplosion = "pending";
burstActivity.use = async () => { burstActor.flags.spikependium.deathExplosion = ""; return { message: {} }; };
await triggerCompanionDeath(burstActor, burstSource, burstScene);
assert.equal(burstActor.flags.spikependium.deathExplosion, "", "завершение Взрыва не перезаписывает уже выполненную отмену или оживление");
console.log("Передача жизни: выбор и права, обязательная жертва, ActorDelta, самолечение, единая отмена и защита старых карточек: OK.");

const companionDamageConfig = { data: {} };
burstActor.flags.spikependium.companionLevel = 15;
prepareCompanionDamage({ subject: burstActivity }, {}, companionDamageConfig);
assert.equal(companionDamageConfig.data.flags.spikependium.ignoreNecroticResistance, true);
burstActor.flags.spikependium.companionLevel = 14;
prepareCompanionDamage({ subject: burstActivity }, {}, companionDamageConfig);
assert.equal(companionDamageConfig.data.flags.spikependium.ignoreNecroticResistance, false, "уровень фиксируется при призыве");
delete burstActor.flags.spikependium.companionLevel;
prepareCompanionDamage({ subject: burstActivity }, {}, companionDamageConfig);
assert.equal(companionDamageConfig.data.flags.spikependium.ignoreNecroticResistance, true, "старый спутник без снимка уровня использует уровень создателя");
const conduitDamageConfig = { data: {} };
prepareCompanionDamage({ subject: { ...burstActivity, id: makeId("activity:reanimated:conduit:bonus") } }, {}, conduitDamageConfig);
assert.equal(conduitDamageConfig.data.flags, undefined, "бонус Проводника относится к заклинанию хозяина");
prepareCompanionDamage({ subject: { actor: burstOwner } }, {}, conduitDamageConfig);
assert.equal(conduitDamageConfig.data.flags, undefined);
const resistantTarget = { flags: {}, statuses: new Set(), system: { attributes: { hp: { value: 20 } }, traits: {
  dr: { value: new Set(["ALL"]) }, di: { value: new Set() }, dv: { value: new Set() } } } };
CONFIG.DND5E.damageTypes = { necrotic: {}, fire: {}, cold: {}, lightning: {}, force: {} };
CONFIG.DND5E.healingTypes = { healing: {}, temphp: {} };
const resisted = resistantTarget.system.traits.dr.value;
const mixedDamage = [{ value: 7, type: "necrotic" }, { value: 7, type: "fire" }];
const ignoreOptions = { originatingMessage: companionDamageConfig.data, ignore: { immunity: new Set(["cold"]), resistance: new Set(["cold"]) } };
const verifyNativeDamageInput = (damages, options) => {
  assert.equal(resistantTarget.system.traits.dr.value.has("ALL"), false);
  assert.equal(resistantTarget.system.traits.dr.value.has("necrotic"), false);
  assert.equal(resistantTarget.system.traits.dr.value.has("fire"), true, "смешанный урон сохраняет остальные сопротивления");
  assert.equal(options.ignore.resistance.has("necrotic"), true);
  assert.equal(options.ignore.resistance.has("cold"), true);
  assert.equal(options.ignore.resistance.has("ALL"), false);
  assert.equal(options.ignore.immunity, ignoreOptions.ignore.immunity, "иммунитеты не отключаются");
  return damages;
};
assert.equal(calculateCompanionDamage.call(resistantTarget, verifyNativeDamageInput, mixedDamage, ignoreOptions), mixedDamage);
assert.equal(resistantTarget.system.traits.dr.value, resisted, "подготовленные сопротивления восстанавливаются после расчёта");
assert.equal(ignoreOptions.ignore.resistance.has("necrotic"), false, "не меняет сохранённые ручные настройки карточки");
assert.throws(() => calculateCompanionDamage.call(resistantTarget, () => { throw Error("native failure"); }, mixedDamage, ignoreOptions), /native failure/);
assert.equal(resistantTarget.system.traits.dr.value, resisted, "восстанавливает сопротивления и после ошибки");
calculateCompanionDamage.call(resistantTarget, (damages, options) => {
  assert.equal(resistantTarget.system.traits.dr.value, resisted);
  assert.equal(options.ignore, true);
}, mixedDamage, { ...ignoreOptions, ignore: true });
calculateCompanionDamage.call(resistantTarget, (damages, options) => {
  assert.equal(resistantTarget.system.traits.dr.value, resisted);
  assert.equal(options.ignore.resistance, true);
}, mixedDamage, { ...ignoreOptions, ignore: { resistance: true } });
calculateCompanionDamage.call(resistantTarget, (damages, options) => assert.equal(options, ignoreOptions), [{ value: 5, type: "fire" }], ignoreOptions);
calculateCompanionDamage.call(resistantTarget, (damages, options) => assert.equal(options.originatingMessage, undefined), mixedDamage);
const absorbTarget = { ...resistantTarget, flags: burstActor.flags, statuses: new Set() };
const electricity = [{ value: 9, type: "lightning" }, { value: 4, type: "fire" }];
calculateCompanionDamage.call(absorbTarget, damages => {
  assert.equal(damages[0].type, "healing", "электричество становится штатным лечением до проверки иммунитета");
  assert.equal(damages[0].value, 9);
  assert.equal(damages[1], electricity[1]);
}, electricity);
assert.equal(electricity[0].type, "lightning", "не переписывает исходный бросок");
absorbTarget.statuses.add("dead");
calculateCompanionDamage.call(absorbTarget, damages => assert.equal(damages, electricity), electricity);
absorbTarget.statuses.clear();
absorbTarget.system.attributes.hp.value = 0;
calculateCompanionDamage.call(absorbTarget, damages => assert.equal(damages, electricity), electricity);
absorbTarget.system.attributes.hp.value = 20;
calculateCompanionDamage.call(absorbTarget, damages => assert.equal(damages[0].type, "lightning"), [{ value: -9, type: "lightning" }]);
calculateCompanionDamage.call(resistantTarget, damages => assert.equal(damages, electricity), electricity);
const absorptionSummary = () => Object.assign([
  { type: "healing", value: -9, spikependiumAbsorption: true, active: {} }, { type: "fire", value: 7, active: {} }
], { amount: -2, temp: 0, tempMax: 0 });
const absorptionCalculationOptions = {};
let absorptionCalculation = calculateCompanionDamage.call(absorbTarget, (damages, options) => {
  assert.equal(options.ignore.threshold, true, "порог применяется к оставшемуся урону отдельно от лечения");
  return absorptionSummary();
}, electricity, absorptionCalculationOptions);
assert.deepEqual(absorptionCalculationOptions.spikependiumAbsorption, { damage: 7, healing: 9, temp: 0, tempMax: 0 });
absorbTarget.system.attributes.hp.dt = 10;
absorptionCalculation = calculateCompanionDamage.call(absorbTarget, () => absorptionSummary(), electricity, absorptionCalculationOptions);
assert.equal(absorptionCalculation.amount, -9, "порог не отменяет лечение");
assert.equal(absorptionCalculation[1].value, 0);
assert.equal(absorptionCalculation[1].active.threshold, true);
delete absorbTarget.system.attributes.hp.dt;
calculateCompanionDamage.call(absorbTarget, () => absorptionSummary(), electricity, { ignore: { resistance: true } });
calculateCompanionDamage.call(resistantTarget, () => [], mixedDamage, absorptionCalculationOptions);
assert.equal(absorptionCalculationOptions.spikependiumAbsorption, undefined, "старые данные поглощения не попадают в следующий расчёт");
const absorptionActor = { system: { attributes: { hp: { value: 10, damage: 20, temp: 8 } } } };
const absorptionOptions = { spikependiumAbsorption: { damage: 7, healing: 9, temp: 0, tempMax: 0 } };
const absorbedHP = {};
prepareCompanionAbsorption(absorptionActor, -2, absorbedHP, absorptionOptions);
assert.equal(absorbedHP["system.attributes.hp.temp"], 1, "огонь тратит временные хиты даже при большем лечении электричеством");
assert.equal(absorbedHP["system.attributes.hp.value"], 19, "электричество восстанавливает обычные хиты отдельно от других типов урона");
absorptionActor.system.attributes.hp.value = 29;
absorptionActor.system.attributes.hp.damage = 1;
prepareCompanionAbsorption(absorptionActor, -2, absorbedHP, absorptionOptions);
assert.equal(absorbedHP["system.attributes.hp.value"], 30, "поглощение не превышает максимум хитов");
absorptionActor.system.attributes.hp = { value: 10, damage: 20, temp: 0 };
prepareCompanionAbsorption(absorptionActor, -2, absorbedHP, absorptionOptions);
assert.equal(absorbedHP["system.attributes.hp.value"], 12);
prepareCompanionAbsorption(absorptionActor, 0, absorbedHP, { spikependiumAbsorption: { ...absorptionOptions.spikependiumAbsorption, damage: 90 } });
assert.equal(absorbedHP["system.attributes.hp.value"], 0, "поглощение не отменяет превышающий его смертельный урон");
const ordinaryHP = {};
prepareCompanionAbsorption(absorptionActor, 2, ordinaryHP, {});
assert.deepEqual(ordinaryHP, {});
console.log("Урон спутника: снимок уровня, игнорирование некротического сопротивления и ALL, смешанные типы, восстановление после ошибки и поглощение электричества: OK.");

burstActor.system.attributes.hp.value = 20;
burstActor.statuses.clear();
burstActor.flags.spikependium.lifeTransfer = "";
burstOrigin.id = "origin";
game.combat = { started: true, id: "strikes", round: 1, turn: 0, combatant: { actor: burstOwner } };
burstOwner.flags.spikependium.companionCommands = { origin: "strikes:1:0" };
burstActor.update = async changed => {
  for (const [path, value] of Object.entries(changed)) setProperty(burstActor, path, value);
};
const strikeActivity = { ...burstActivity, id: makeId("activity:actor:reanimated:strike"), type: "attack", activation: { type: "action" } };
const secondStrikeActivity = { ...strikeActivity, id: makeId("activity:reanimated:fury:second"), activation: { type: "special" } };
let rolledStrikes = 0;
const successfulStrike = async (config, dialog, message) => {
  rolledStrikes++;
  assert.equal(message.data.flags.spikependium.companionStrike.turn, "strikes:1:0");
  assert.equal(canCreateCompanionMessage(message.data), undefined);
  return [{ total: 15 }];
};
assert.equal(await rollCompanionStrike.call(secondStrikeActivity, successfulStrike), null, "второй удар требует первого");
await rollCompanionStrike.call(strikeActivity, async () => []);
assert.equal(burstActor.flags.spikependium.strikes, undefined, "отмена окна броска не тратит атаку");
await rollCompanionStrike.call(strikeActivity, successfulStrike);
assert.equal(burstActor.flags.spikependium.strikes.count, 1);
await rollCompanionStrike.call(secondStrikeActivity, successfulStrike);
assert.equal(burstActor.flags.spikependium.strikes.count, 2);
assert.equal(rolledStrikes, 2);
assert.equal(await rollCompanionStrike.call(strikeActivity, successfulStrike), null, "оба действия используют общий предел");
assert.equal(await rollCompanionStrike.call(secondStrikeActivity, successfulStrike), null);
game.combat.turn++;
burstOwner.flags.spikependium.companionCommands.origin = "strikes:1:1";
await rollCompanionStrike.call(strikeActivity, async () => [{}]);
assert.equal(burstActor.flags.spikependium.strikes.count, 1, "в новый ход предел восстанавливается");
await rollCompanionStrike.call(strikeActivity, async () => [{}]);
assert.equal(burstActor.flags.spikependium.strikes.count, 2, "вторую атаку можно сделать и основной кнопкой");
assert.equal(await rollCompanionStrike.call(strikeActivity, async () => assert.fail("три броска"), { rolls: [{}, {}, {}] }), null);
game.combat.turn++;
delete burstOwner.flags.spikependium.companionCommands.origin;
assert.equal(await rollCompanionStrike.call(strikeActivity, async () => assert.fail("нет приказа")), null);
burstOwner.statuses.add("incapacitated");
await rollCompanionStrike.call(strikeActivity, async () => [{}]);
assert.equal(burstActor.flags.spikependium.strikes.count, 1, "недееспособность хозяина разрешает самостоятельный удар");
assert.equal(await rollCompanionStrike.call(secondStrikeActivity, async () => assert.fail("без приказа нет Ярости")), null);
burstOwner.statuses.clear();
game.combat.turn++;
burstOwner.flags.spikependium.companionCommands.origin = "strikes:1:3";
game.combat.combatant.actor = nearbyActor;
assert.equal(await rollCompanionStrike.call(strikeActivity, async () => assert.fail("чужой ход")), null);
game.combat.combatant.actor = burstOwner;
burstActor.statuses.add("stunned");
assert.equal(await rollCompanionStrike.call(strikeActivity, async () => assert.fail("не может действовать")), null);
burstActor.statuses.clear();
burstActor.flags.spikependium.key = "actor:reanimated-companion:conduit";
await rollCompanionStrike.call(strikeActivity, async () => [{}]);
assert.equal(await rollCompanionStrike.call(strikeActivity, async () => assert.fail("Проводник атакует раз")), null);
burstActor.flags.spikependium.key = "actor:reanimated-companion:fury";
game.combat.turn++;
burstOwner.flags.spikependium.companionCommands.origin = "strikes:1:4";
let finishStrike;
const pendingStrike = rollCompanionStrike.call(strikeActivity, () => new Promise(resolve => { finishStrike = resolve; }));
assert.equal(await rollCompanionStrike.call(strikeActivity, async () => assert.fail("два окна")), null);
finishStrike([]);
await pendingStrike;
await assert.rejects(rollCompanionStrike.call(strikeActivity, async () => { throw Error("failed attack"); }), /failed attack/);
await rollCompanionStrike.call(strikeActivity, async () => [{}]);
assert.equal(burstActor.flags.spikependium.strikes.count, 1, "блокировка снимается после отмены и ошибки");
const beforeDeathStrike = { flags: { spikependium: { companionStrike: { actor: burstActor.uuid, turn: "strikes:1:4" } } } };
burstActor.statuses.add("dead");
assert.equal(canCreateCompanionMessage(beforeDeathStrike), false, "смерть во время открытого окна отменяет карточку");
burstActor.statuses.clear();
delete burstOwner.flags.spikependium.companionCommands.origin;
assert.equal(canCreateCompanionMessage(beforeDeathStrike), false, "отменённый приказ не позволяет завершить старый удар");
burstOwner.flags.spikependium.companionCommands.origin = "strikes:1:4";
const staleStrikeMessage = { flags: { spikependium: { companionStrike: { actor: burstActor.uuid, turn: "strikes:1:4" } } } };
game.combat.turn++;
assert.equal(canCreateCompanionMessage(staleStrikeMessage), false, "старое окно не создаёт карточку в новом ходу");
burstOwner.flags.spikependium.companionCommands.origin = "strikes:1:5";
const beforeStaleStrike = structuredClone(burstActor.flags.spikependium.strikes);
await rollCompanionStrike.call(strikeActivity, async () => { game.combat.turn++; return [{}]; });
assert.deepEqual(burstActor.flags.spikependium.strikes, beforeStaleStrike, "завершение старого броска не тратит атаку нового хода");
game.combat.started = false;
await rollCompanionStrike.call(strikeActivity, async (config, dialog, message) => { assert.equal(message.data, undefined); return []; });
assert.deepEqual(burstActor.flags.spikependium.strikes, beforeStaleStrike, "вне боя не вводит постоянный лимит");
game.combat.started = true;
const summonOrigin = burstActor.flags.dnd5e.summon.origin;
delete burstActor.flags.dnd5e.summon.origin;
await rollCompanionStrike.call(strikeActivity, async (config, dialog, message) => { assert.equal(message.data, undefined); return []; });
assert.deepEqual(burstActor.flags.spikependium.strikes, beforeStaleStrike, "сохраняет ручную атаку размещённого NPC без указанного хозяина");
burstActor.flags.dnd5e.summon.origin = summonOrigin;
console.log("Ужасающий удар и Ярость: общий предел, приказ, самостоятельность, отмена, новый ход и защита от повторных окон: OK.");

burstOwner.system.abilities = { int: { mod: 3 } };
burstActor.system.attributes.hp.value = 20;
burstActor.statuses.clear();
burstActor.flags.spikependium.key = "actor:reanimated-companion:conduit:big-large";
const casterToken = tokenForBurst("caster", burstOwner, 120);
casterToken.parent = burstScene;
burstScene.tokens.push(casterToken);
const conduitSpell = { type: "spell", flags: {}, system: { school: "evo", classIdentifier: "artificer" } };
const conduitSpellActivity = { actor: burstOwner, item: conduitSpell };
const castConfig = { data: {} };
recordConduitCast(conduitSpellActivity, castConfig);
const conduitCast = { id: "conduitCast", ...castConfig.data, getAssociatedToken: () => casterToken };
game.messages = itemsWith([conduitCast]);
assert.equal(conduitEligibility(conduitSpellActivity, conduitCast).bonus, 3);
casterToken.getCenterPoint = () => ({ x: 121, y: 0, elevation: 0 });
assert.equal(conduitEligibility(conduitSpellActivity, conduitCast), null, "за границей 120 футов бонус недоступен");
casterToken.getCenterPoint = () => ({ x: 120, y: 0, elevation: 0 });
conduitSpell.system.classIdentifier = "wizard";
assert.equal(conduitEligibility(conduitSpellActivity, conduitCast), null, "общий список не делает заклинание Волшебника заклинанием Изобретателя");
conduitSpell.system.classIdentifier = "artificer";
conduitSpell.system.school = "abj";
assert.equal(conduitEligibility(conduitSpellActivity, conduitCast), null);
conduitSpell.system.school = "nec";
assert.ok(conduitEligibility(conduitSpellActivity, conduitCast));
conduitSpell.flags.spikependium = { storedSpell: {} };
assert.equal(conduitEligibility(conduitSpellActivity, conduitCast), null, "воспроизведение эффекта хранения не является новым накладыванием");
conduitSpell.flags = {};
burstActor.statuses.add("dead");
assert.equal(conduitEligibility(conduitSpellActivity, conduitCast), null);
burstActor.statuses.clear();
burstActor.flags.spikependium.key = "actor:reanimated-companion:fury";
assert.equal(conduitEligibility(conduitSpellActivity, conduitCast), null);
burstActor.flags.spikependium.key = "actor:reanimated-companion:conduit";
assert.equal(canUseConduitActivity({ actor: burstActor, id: makeId("activity:reanimated:conduit:bonus") }), false);
assert.equal(canUseConduitActivity(undefined), true);
class ConduitDialog {
  async _prepareConfigurationContext() { return { fields: [] }; }
  _buildConfig(roll) { return roll; }
}
const conduitProcess = { subject: conduitSpellActivity, rolls: [{ options: { type: "fire" } }, { options: { type: "cold" } }], evaluate: true };
const conduitRollMessage = { data: { system: { origin: conduitCast.id }, type: "damage" } };
const conduitDialog = { applicationClass: ConduitDialog, configure: false };
prepareConduitRoll(conduitProcess, conduitDialog, conduitRollMessage);
assert.equal(conduitDialog.configure, true);
const conduitApp = new conduitDialog.applicationClass();
conduitApp.config = conduitProcess;
const conduitFields = await conduitApp._prepareConfigurationContext({});
assert.equal(conduitFields.fields[0].field.choices.none, "Не добавлять");
assert.ok(conduitFields.fields[0].field.choices["1"]);
const conduitPart = () => ({ parts: ["1d6"], data: {}, options: { type: "cold" } });
const selectedConduitPart = conduitApp._buildConfig(conduitPart(), new Map([["spikependium.conduitPart", "1"]]), 1);
assert.deepEqual(selectedConduitPart.parts, ["1d6", "@spikependiumConduit"]);
assert.equal(selectedConduitPart.data.spikependiumConduit, 3);
assert.deepEqual(buildConduitBonus(conduitProcess, selectedConduitPart, 1).parts, ["1d6", "@spikependiumConduit"], "нет дублей при пересборке окна");
assert.deepEqual(buildConduitBonus(conduitProcess, conduitPart(), 0).parts, ["1d6"]);
const simulatedConduitRolls = [{ options: { type: "fire" } }, { options: selectedConduitPart.options }];
const conduitNoChoice = { ...conduitProcess, spikependium: { conduit: { ...conduitProcess.spikependium.conduit, part: "none" } } };
assert.equal(finalizeConduitRoll(simulatedConduitRolls, conduitNoChoice, {}, {}), undefined);
casterToken.getCenterPoint = () => ({ x: 121, y: 0, elevation: 0 });
assert.equal(finalizeConduitRoll(simulatedConduitRolls, conduitProcess, {}, {}), false, "условия перепроверяются после выбора");
casterToken.getCenterPoint = () => ({ x: 120, y: 0, elevation: 0 });
assert.equal(finalizeConduitRoll(simulatedConduitRolls, conduitProcess, {}, { create: false }), undefined);
assert.equal(conduitProcess.spikependium.conduit.claimed, undefined, "предварительный расчёт не расходует бонус");
burstOwner.setFlag = async (module, key, value) => { burstOwner.flags[module] ??= {}; burstOwner.flags[module][key] = value; };
await finishConduitRoll(async () => {
  assert.equal(finalizeConduitRoll(simulatedConduitRolls, conduitProcess, {}, conduitRollMessage), undefined);
  const competing = structuredClone(conduitProcess.spikependium.conduit);
  assert.equal(finalizeConduitRoll(simulatedConduitRolls, { ...conduitProcess, spikependium: { conduit: competing } }, {}, {}), false);
  conduitRollMessage.document = { id: "conduitDamage", flags: conduitRollMessage.data.flags };
  game.messages.push(conduitRollMessage.document);
  return simulatedConduitRolls;
}, conduitProcess, {}, conduitRollMessage);
assert.equal(burstOwner.flags.spikependium.conduitTurn, conduitCast.flags.spikependium.conduitCast.turn);
assert.equal(conduitEligibility(conduitSpellActivity, conduitCast), null, "повторный бонус в текущий ход блокируется");
delete burstOwner.flags.spikependium.conduitTurn;
assert.equal(conduitEligibility(conduitSpellActivity, conduitCast), null, "карточка сохраняет расход даже при неудачном сохранении флага");
game.combat.turn++;
assert.equal(conduitEligibility(conduitSpellActivity, conduitCast), null, "периодический урон старого заклинания не является новым накладыванием");
const laterCastConfig = { data: {} };
recordConduitCast(conduitSpellActivity, laterCastConfig);
const laterCast = { id: "laterConduitCast", ...laterCastConfig.data, getAssociatedToken: () => casterToken };
game.messages.push(laterCast);
assert.ok(conduitEligibility(conduitSpellActivity, laterCast));
const laterProcess = { ...conduitProcess, spikependium: { conduit: { ...conduitEligibility(conduitSpellActivity, laterCast), part: "1" } } };
await assert.rejects(finishConduitRoll(async () => {
  finalizeConduitRoll(simulatedConduitRolls, laterProcess, {}, {});
  throw Error("posting failed");
}, laterProcess), /posting failed/);
assert.equal(laterProcess.spikependium.conduit.claimed, undefined);
assert.equal(finalizeConduitRoll(simulatedConduitRolls, laterProcess, {}, { create: false }), undefined, "ошибка не оставляет блокировку");
const noCastProcess = { subject: conduitSpellActivity, rolls: conduitProcess.rolls };
prepareConduitRoll(noCastProcess, {}, { data: {} });
assert.equal(noCastProcess.spikependium, undefined, "отдельный бросок без накладывания не получает бонус");
for (const key of ["", ":thin", ":wet", ":big-medium", ":big-large"])
  assert.equal(Object.keys(doc(`actor:reanimated-companion:conduit${key}`).items.at(-1).system.activities).length, 0);
console.log("Магический проводник: источник класса, школы, 120 футов, выбор компонента без дублей, расход на хозяине, новые накладывания и очистка после ошибки: OK.");

// Пространство Проводника меняется у конкретного накладывания; автор карточки и лист сохраняют хозяина.
const resolveBeforeCasting = fromUuidSync;
globalThis.fromUuidSync = uuid => burstScene.tokens.find(t => t.uuid === uuid) ?? resolveBeforeCasting(uuid);
burstSource.name = "Проводник";
Object.assign(burstSource, { x: 0, y: 0, width: 2, height: 2, shape: 0 });
burstActor.system.attributes.hp.value = 20;
burstActor.statuses.clear();
const castingItem = { type: "spell", flags: {}, system: { school: "abj", classIdentifier: "wizard" },
  updateSource(data) {
    if ("flags.spikependium.-=conduitCasting" in data) delete this.flags.spikependium.conduitCasting;
    else setProperty(this, "flags.spikependium.conduitCasting", structuredClone(data["flags.spikependium.conduitCasting"]));
  }
};
const castingActivity = { id: "cast", uuid: "Actor.burstOwner.Item.spell.Activity.cast", actor: burstOwner, item: castingItem,
  target: { template: { stationary: false } },
  getUsageToken() { return conduitUsageToken.call(this, () => casterToken); } };
const unmodifiedItemFlags = structuredClone(castingItem.flags);
assert.deepEqual(conduitOrigins(castingActivity).map(t => t.uuid), [burstSource.uuid], "можно накладывать заклинание любого класса и школы");
casterToken.getCenterPoint = () => ({ x: 200, y: 0, elevation: 0 });
assert.equal(conduitOrigins(castingActivity).length, 1, "120 футов ограничивают бонус урона, а не пространство накладывания");
class CastingDialog {
  async _prepareConsumptionContext() { return { fields: [], notes: [] }; }
}
const castingConfig = { scaling: false, consume: false };
const castingDialog = { configure: false, applicationClass: CastingDialog };
prepareConduitCastingDialog(castingActivity, castingConfig, castingDialog);
assert.equal(castingDialog.configure, true);
assert.equal(requireConduitCastingDialog(() => assert.fail("заговору без расхода тоже нужен выбор"), castingConfig), true);
assert.equal(requireConduitCastingDialog(() => false, {}), false, "обычные действия сохраняют нативное поведение");
const castingApp = new castingDialog.applicationClass();
castingApp.config = castingConfig;
const castingContext = await castingApp._prepareConsumptionContext({});
assert.equal(castingContext.hasConsumption, true);
assert.equal(castingContext.fields[0].value, "self");
assert.equal(castingContext.fields[0].field.choices[burstSource.uuid], burstSource.name);
assert.deepEqual(castingItem.flags, unmodifiedItemFlags, "открытие и отмена выбора не меняют предмет");
castingConfig.spikependium.conduitOrigin = burstSource.uuid;
const castingMessage = { data: { speaker: { actor: burstOwner.uuid }, system: { properties: [] } } };
assert.equal(prepareConduitCasting(castingActivity, castingConfig, castingMessage), undefined);
assert.equal(castingMessage.data.flags.spikependium.conduitCasting.owner, burstOwner.uuid);
assert.equal(castingMessage.data.speaker.actor, burstOwner.uuid, "карточка принадлежит хозяину, а не спутнику");
assert.equal(castingActivity.getUsageToken(), burstSource);
describeConduitCasting(castingActivity, castingMessage);
assert.match(castingMessage.data.system.properties[0].text, /собственные чувства/);
const attachedRegion = { shapes: [{ type: "emanation", base: { x: 999, y: 999, width: 1, height: 1 }, radius: 10 }],
  attachment: { token: nearBurstTarget.id }, flags: { dnd5e: { activity: castingActivity.uuid, origin: casterToken.uuid } } };
assert.equal(attachConduitTemplate(castingActivity, [attachedRegion]), undefined);
assert.equal(attachedRegion.attachment.token, burstSource.id, "эманация привязана к Проводнику, даже если при размещении выбрана другая цель");
assert.equal(attachedRegion.flags.dnd5e.origin, burstSource.uuid);
assert.equal(attachedRegion.flags.dnd5e.activity, castingActivity.uuid, "спасброски и параметры остаются от заклинания хозяина");
assert.deepEqual(attachedRegion.shapes[0].base, { x: 0, y: 0, width: 2, height: 2, shape: 0 });
castingActivity.target.template.stationary = true;
attachConduitTemplate(castingActivity, [attachedRegion]);
assert.equal(attachedRegion.attachment.token, undefined, "неподвижная эманация не следует за спутником");
const freeRegion = { shapes: [{ type: "circle", x: 42, y: 24, radius: 20 }], flags: {} };
attachConduitTemplate(castingActivity, [freeRegion]);
assert.equal(freeRegion.shapes[0].x, 42, "дистанционная область сохраняет выбранное игроком положение");
assert.equal(freeRegion.flags.dnd5e.origin, burstSource.uuid);
burstActor.statuses.add("dead");
assert.equal(prepareConduitCasting(castingActivity, castingConfig, {}), false, "смерть до подтверждения блокирует расход");
assert.equal(castingActivity.getUsageToken(), undefined, "утрата спутника не подменяет его пространством хозяина");
assert.equal(validateConduitTemplate(castingActivity), false);
assert.equal(attachConduitTemplate(castingActivity, [freeRegion]), false);
burstActor.statuses.clear();
const previousScene = canvas.scene;
canvas.scene = { tokens: [] };
assert.equal(validateConduitTemplate(castingActivity), false, "старая карточка не создаёт шаблон на другой сцене");
canvas.scene = previousScene;
castingItem.flags.spikependium.storedSpell = {};
assert.deepEqual(conduitOrigins(castingActivity), [], "воспроизведение эффекта хранения не является накладыванием");
delete castingItem.flags.spikependium.storedSpell;
const restoreReceipt = structuredClone(castingMessage.data.flags.spikependium.conduitCasting);
castingConfig.spikependium.conduitOrigin = "self";
prepareConduitCasting(castingActivity, castingConfig, castingMessage);
assert.equal(castingItem.flags.spikependium.conduitCasting, undefined, "выбор собственного пространства очищает старый выбор на копии");
assert.equal(castingMessage.data.flags.spikependium.conduitCasting, undefined);
assert.equal(castingActivity.getUsageToken(), casterToken);
castingItem.clone = (data, options) => {
  assert.equal(options.keepId, true);
  const clone = { ...castingItem, flags: structuredClone(castingItem.flags) };
  clone.updateSource(data);
  const activity = { ...castingActivity, item: clone };
  clone.system = { ...castingItem.system, activities: new Map([[activity.id, activity]]) };
  return clone;
};
const recoveredActivity = restoreConduitActivity.call({ flags: { spikependium: { conduitCasting: restoreReceipt } } }, () => castingActivity);
assert.notEqual(recoveredActivity, castingActivity);
assert.equal(recoveredActivity.actor, burstOwner);
assert.equal(recoveredActivity.getUsageToken(), burstSource, "кнопка из карточки восстанавливает выбор конкретного накладывания");
assert.equal(castingItem.flags.spikependium.conduitCasting, undefined, "восстановление карточки не меняет исходный предмет");
assert.equal(restoreConduitActivity.call({ flags: { spikependium: { conduitCasting: { ...restoreReceipt, owner: "Actor.other" } } } }, () => castingActivity), castingActivity);
assert.equal(restoreConduitActivity.call({ flags: { spikependium: { conduitCasting: {} } } }, () => undefined), undefined, "удалённая исходная запись не ломает карточку");
burstOwner.classes.artificer.system.levels = 4;
assert.deepEqual(conduitOrigins(castingActivity), []);
burstOwner.classes.artificer.system.levels = 15;
burstActor.flags.spikependium.key = "actor:reanimated-companion:fury";
assert.deepEqual(conduitOrigins(castingActivity), []);
burstActor.flags.spikependium.key = "actor:reanimated-companion:conduit";
console.log("Пространство Проводника: все школы и классы, заговоры без расхода, повторная проверка, собственные чувства и автор карточки, восстановление выбора и привязка эманации: OK.");

const whispersSource = doc("subclass:phantom:whispers-of-the-dead");
const whispersActionSource = Object.values(whispersSource.system.activities)[0];
assert.equal(whispersActionSource._id, makeId("activity:phantom:whispers"));
assert.equal(whispersActionSource.flags.spikependium.whispers, true);
CONFIG.DND5E.skills = { ath: { label: "Атлетика" }, arc: { label: "Аркана" }, prc: { label: "Внимательность" } };
CONFIG.DND5E.tools = { tinker: { ability: "int" }, flute: { ability: "cha" } };
dnd5e.documents = { Trait: { keyLabel: key => key } };
const whispersActor = { uuid: "Actor.phantom", isOwner: true, classes: {},
  system: { skills: { ath: { value: 0 }, arc: { value: 2 }, prc: { value: 0.5 } },
    tools: { flute: { value: 1 }, custom: { value: 0, ability: "wis" }, "bad.path": { value: 0 } } } };
const permanentWhispersEffect = { id: "permanent", flags: {}, toObject() { return { _id: this.id }; } };
const whispersFeature = { id: whispersSource._id, uuid: "Actor.phantom.Item.whispers", name: whispersSource.name,
  img: whispersSource.img, flags: structuredClone(whispersSource.flags), isOwner: true, effects: [permanentWhispersEffect],
  system: { activities: [] } };
whispersActor.items = itemsWith([whispersFeature]);
const whispersActivity = { id: whispersActionSource._id, actor: whispersActor, item: whispersFeature,
  flags: structuredClone(whispersActionSource.flags), consumption: { targets: [] } };
whispersFeature.system.activities = [whispersActivity];
const availableWhispers = whispersChoices(whispersActor);
assert.ok(availableWhispers["skills:ath"]);
assert.ok(availableWhispers["skills:prc"], "половина бонуса не является владением");
assert.ok(availableWhispers["tool:tinker"]);
assert.ok(availableWhispers["tool:custom"]);
assert.equal(availableWhispers["skills:arc"], undefined, "владение и компетентность исключены");
assert.equal(availableWhispers["tool:flute"], undefined);
assert.equal(availableWhispers["tool:bad.path"], undefined, "имя инструмента не превращается в путь к другому свойству");
assert.equal(prepareWhispersDialog(whispersActivity, {}, {}), false, "выбирать новое владение вне отдыха нельзя");
assert.equal(prepareWhispersChoice(whispersActivity, {}, emptyForgeUpdates()), false);
assert.equal(isWhispers({ ...whispersActivity, item: { flags: {} } }), false);
class WhispersDialog {
  async _prepareConsumptionContext() { return { fields: [], notes: [] }; }
}
let whispersUse;
let whispersUseCount = 0;
whispersActivity.use = async config => { whispersUseCount++; return whispersUse(config); };
whispersUse = async config => {
  const dialog = { applicationClass: WhispersDialog, configure: false };
  assert.equal(prepareWhispersDialog(whispersActivity, config, dialog), undefined);
  assert.equal(dialog.configure, true);
  assert.equal(config.scaling, 0, "нативный диалог открывается и без ресурсов");
  const app = new dialog.applicationClass();
  app.config = config;
  const fields = await app._prepareConsumptionContext({});
  assert.equal(fields.fields[0].value, "keep");
  assert.equal(fields.fields[0].field.choices.keep, "Сохранить прежний выбор");
  return undefined;
};
await chooseWhispersAfterRest(whispersActor, {}, { type: "short" });
assert.equal(whispersFeature.effects.length, 1, "закрытие окна не меняет владения");
assert.equal(prepareWhispersDialog(whispersActivity, {}, {}), false, "закрытие окна завершает возможность выбора");
let keptWhispers;
whispersUse = async config => {
  keptWhispers = config;
  const updates = prepareWhispersChoice(whispersActivity, config, emptyForgeUpdates());
  assert.deepEqual(updates.operations ?? [], [], "отказ от нового владения не снимает старое");
  assert.deepEqual(updates.actor, {});
  const message = { data: { system: {} } };
  describeWhispers(whispersActivity, message);
  assert.match(message.data.system.properties[0].text, /сохранено/);
};
await chooseWhispersAfterRest(whispersActor, {}, { type: "long" });
assert.equal(prepareWhispersChoice(whispersActivity, keptWhispers, emptyForgeUpdates()), false, "старую карточку нельзя применить после завершения окна");
let preparedWhispers;
whispersUse = async config => {
  config.spikependium.whispersChoice = "skills:ath";
  preparedWhispers = await prepareResourceUpdates.call(whispersActivity, async () => emptyForgeUpdates(), config);
  const message = { data: { system: {} } };
  describeWhispers(whispersActivity, message);
  assert.match(message.data.system.properties[0].text, /Атлетика/);
  assert.equal(prepareWhispersChoice(whispersActivity, config, emptyForgeUpdates()), false, "в одном окне нельзя провести выбор дважды");
};
await chooseWhispersAfterRest(whispersActor, {}, { type: "short" });
const firstWhispersEffect = preparedWhispers.operations.find(op => op.action === "create").data[0];
assert.equal(firstWhispersEffect.type, "base");
assert.equal(firstWhispersEffect.transfer, true, "эффект принадлежит черте и удаляется вместе с ней");
assert.equal(firstWhispersEffect.system.origin.item, whispersFeature.uuid);
assert.deepEqual(firstWhispersEffect.system.changes, [{ key: "system.skills.ath.value", type: "upgrade", value: "1", phase: "initial" }]);
assert.deepEqual(preparedWhispers.actor, {}, "постоянное владение навыком не перезаписывается");
assert.equal(whispersActor.system.skills.ath.value, 0);
whispersFeature.effects.push({ ...firstWhispersEffect, id: "whispersEffect" });
whispersActor.system.skills.ath.value = 1;
whispersUse = async config => {
  config.spikependium.whispersChoice = "tool:tinker";
  preparedWhispers = await prepareResourceUpdates.call(whispersActivity, async () => emptyForgeUpdates(), config);
};
await chooseWhispersAfterRest(whispersActor, {}, { type: "long" });
assert.equal(preparedWhispers.operations.length, 1, "одно обновление заменяет бонус без удаления старого эффекта заранее");
assert.equal(preparedWhispers.operations[0].action, "update");
assert.equal(preparedWhispers.operations[0].parent, whispersFeature);
assert.equal(preparedWhispers.operations[0].updates[0]._id, "whispersEffect");
assert.equal(preparedWhispers.operations[0].updates[0].system.changes[0].key, "system.tools.tinker.value");
assert.deepEqual(preparedWhispers.actor["system.tools.tinker"], { value: 0, ability: "int" }, "новая запись инструмента имеет нативные настройки, а владение даёт эффект");
assert.equal(whispersFeature.effects[0], permanentWhispersEffect, "не затрагивает другие эффекты черты");
whispersUse = async config => {
  config.spikependium.whispersChoice = "tool:custom";
  preparedWhispers = prepareWhispersChoice(whispersActivity, config, emptyForgeUpdates());
};
await chooseWhispersAfterRest(whispersActor, {}, { type: "short" });
assert.deepEqual(preparedWhispers.actor, {}, "настроенная характеристика существующего инструмента не меняется");
let whispersRetry = 0;
whispersUse = async config => {
  whispersRetry++;
  config.spikependium.whispersChoice = whispersRetry === 1 ? "skills:arc" : "keep";
  if (whispersRetry === 1) assert.equal(prepareWhispersChoice(whispersActivity, config, emptyForgeUpdates()), false);
  else assert.ok(prepareWhispersChoice(whispersActivity, config, emptyForgeUpdates()));
};
await chooseWhispersAfterRest(whispersActor, {}, { type: "short" });
assert.equal(whispersRetry, 2, "устаревший выбор открывает окно заново без снятия прежнего бонуса");
const beforeWhispersSkipped = whispersUseCount;
await chooseWhispersAfterRest(whispersActor, {}, { type: "dawn" });
whispersActor.isOwner = false;
await chooseWhispersAfterRest(whispersActor, {}, { type: "short" });
whispersActor.isOwner = true;
assert.equal(whispersUseCount, beforeWhispersSkipped);
whispersUse = async () => { throw Error("whispers failed"); };
await assert.rejects(chooseWhispersAfterRest(whispersActor, {}, { type: "short" }), /whispers failed/);
assert.equal(prepareWhispersDialog(whispersActivity, keptWhispers, {}), false, "ошибка не оставляет открытое разрешение на выбор");
let finishOldWhispers;
let oldWhispersConfig;
whispersUse = async config => {
  if (!oldWhispersConfig) {
    oldWhispersConfig = config;
    await new Promise(resolve => { finishOldWhispers = resolve; });
    assert.equal(prepareWhispersChoice(whispersActivity, config, emptyForgeUpdates()), false, "новый отдых аннулирует незавершённый выбор прежнего отдыха");
  } else assert.ok(prepareWhispersChoice(whispersActivity, config, emptyForgeUpdates()));
};
const oldWhispersWindow = chooseWhispersAfterRest(whispersActor, {}, { type: "short" });
await chooseWhispersAfterRest(whispersActor, {}, { type: "long" });
finishOldWhispers();
await oldWhispersWindow;
whispersFeature.system.activities = [];
let legacyWhispersClone;
whispersFeature.clone = (data, options) => {
  assert.equal(options.keepId, true);
  const source = data[`system.activities.${makeId("activity:phantom:whispers")}`];
  assert.equal(source._id, makeId("activity:phantom:whispers"));
  legacyWhispersClone = { ...whispersActivity, flags: source.flags };
  legacyWhispersClone.use = async config => {
    assert.ok(isWhispers(legacyWhispersClone));
    assert.ok(prepareWhispersChoice(legacyWhispersClone, config, emptyForgeUpdates()));
  };
  return { ...whispersFeature, system: { activities: [legacyWhispersClone] } };
};
await chooseWhispersAfterRest(whispersActor, {}, { type: "long" });
assert.ok(legacyWhispersClone);
assert.deepEqual(whispersFeature.system.activities, [], "старый экземпляр на листе не перезаписывается");
console.log("Шёпот мёртвых: выбор после обоих отдыхов, отмена и сохранение, исключение владения и компетентности, замена эффекта, инструменты, устаревший выбор и старые экземпляры: OK.");

// Крупный: нативный бросок сохраняет кубики и даёт отказаться от необязательного бонуса.
globalThis.fromUuidSync = uuid => uuid === "burstOrigin" ? burstOrigin : null;
burstOwner.system.abilities.int.mod = 3;
burstActor.flags.spikependium.key = "actor:reanimated-companion:fury:big-large";
burstActor.flags.spikependium.companionInt = 2;
assert.equal(companionInt(burstActor), 3);
const explosionPart = bonus => ({ bonus, custom: { enabled: false },
  scaledFormula: () => `4d6${bonus ? ` + ${bonus}` : ""}`,
  clone: ({ bonus: replacement }) => explosionPart(replacement) });
const bigExplosion = { ...burstActivity, damage: { parts: [explosionPart("")] } };
const explosionConfig = () => ({ subject: bigExplosion, rolls: [
  { parts: ["4d6", "@ruleBonus"], data: {}, options: { type: "necrotic" } },
  { parts: ["1d4"], data: {}, options: { type: "fire" } }
] });
class ExplosionDialog {
  constructor(config) { this.config = config; }
  async _prepareConfigurationContext() { return { fields: [], inputs: { createCheckboxInput: () => {} } }; }
  _buildConfig(roll) { return roll; }
}
foundry.data.fields.BooleanField = class { constructor(options) { Object.assign(this, options); } };
const bonusConfig = explosionConfig();
const bonusDialog = { applicationClass: ExplosionDialog, configure: false };
prepareExplosionBonus(bonusConfig, bonusDialog);
assert.equal(bonusDialog.configure, true);
const bonusWindow = new bonusDialog.applicationClass(bonusConfig);
const bonusContext = await bonusWindow._prepareConfigurationContext();
assert.equal(bonusContext.fields[0].name, "spikependium.explosionBonus");
assert.equal(bonusContext.fields[0].value, false);
assert.match(bonusContext.fields[0].field.label, /\+3/);
const setExplosionBonus = value => new Map([["spikependium.explosionBonus", value]]);
bonusWindow._buildConfig(bonusConfig.rolls[0], setExplosionBonus(false), 0);
assert.deepEqual(bonusConfig.rolls[0].parts, ["4d6", "@ruleBonus"]);
bonusWindow._buildConfig(bonusConfig.rolls[0], setExplosionBonus(true), 0);
bonusWindow._buildConfig(bonusConfig.rolls[0], setExplosionBonus("true"), 0);
assert.deepEqual(bonusConfig.rolls[0].parts, ["4d6", "@ruleBonus", "@spikependiumExplosionInt"]);
assert.equal(bonusConfig.rolls[0].data.spikependiumExplosionInt, 3);
bonusWindow._buildConfig(bonusConfig.rolls[1], setExplosionBonus(true), 1);
assert.deepEqual(bonusConfig.rolls[1].parts, ["1d4"], "не увеличивает вторую часть урона");
assert.equal(validateExplosionBonus(bonusConfig.rolls, bonusConfig), undefined);
burstOwner.system.abilities.int.mod = 4;
assert.equal(validateExplosionBonus(bonusConfig.rolls, bonusConfig), false, "изменение Интеллекта до подтверждения требует нового броска");
assert.equal(validateExplosionBonus([], bonusConfig), undefined, "отмена не выдаёт предупреждение");
burstOwner.system.abilities.int.mod = 3;
bonusWindow._buildConfig(bonusConfig.rolls[0], setExplosionBonus(false), 0);
assert.equal(bonusConfig.rolls[0].data.spikependiumExplosionInt, undefined);
assert.deepEqual(bonusConfig.rolls[0].parts, ["4d6", "@ruleBonus"]);
const legacyExplosion = { ...bigExplosion, damage: { parts: [explosionPart("2")] } };
const legacyConfig = bigExplosionDamageConfig.call(legacyExplosion, () => ({
  rolls: [{ parts: ["4d6 + 2", "@ruleBonus"], data: {}, options: { type: "necrotic" } }]
}));
assert.deepEqual(legacyConfig.rolls[0].parts, ["4d6", "@ruleBonus"]);
assert.equal(legacyConfig.spikependium.explosionInt, 3);
assert.equal(legacyExplosion.damage.parts[0].bonus, "2", "исходный предмет не меняется");
for (const part of [{ ...explosionPart("2"), custom: { enabled: true } }, explosionPart("@abilities.int.mod")]) {
  const unchanged = { rolls: [{ parts: ["custom"] }] };
  assert.equal(bigExplosionDamageConfig.call({ ...bigExplosion, damage: { parts: [part] } }, () => unchanged), unchanged);
  assert.deepEqual(unchanged.rolls[0].parts, ["custom"]);
}
const customConfig = { rolls: [{ parts: ["custom"] }] };
bigExplosionDamageConfig.call(legacyExplosion, () => customConfig);
assert.deepEqual(customConfig.rolls[0].parts, ["custom"]);
const unrelatedDialog = { configure: false };
prepareExplosionBonus({ ...explosionConfig(), subject: { ...bigExplosion, id: "other", flags: {} } }, unrelatedDialog);
assert.equal(unrelatedDialog.configure, false);
globalThis.fromUuidSync = () => null;
assert.equal(companionInt(burstActor, 5), 2, "снимок используется после удаления исходной черты");
delete burstActor.flags.spikependium.companionInt;
assert.equal(companionInt(burstActor, -1), -1, "старый спутник сохраняет отрицательный бонус");
const negativeConfig = { ...explosionConfig(), spikependium: { explosionInt: -1 } };
const negativeDialog = { applicationClass: ExplosionDialog };
prepareExplosionBonus(negativeConfig, negativeDialog);
new negativeDialog.applicationClass(negativeConfig)._buildConfig(negativeConfig.rolls[0], setExplosionBonus(true), 0);
assert.equal(negativeConfig.rolls[0].data.spikependiumExplosionInt, -1);
console.log("Крупный спутник: необязательный Интеллект, отмена, повторное переключение, старые и пользовательские формулы, изменение характеристики: OK.");

// Влажный: попадание фиксируется до применения урона и удаления спутника.
CONFIG.Dice.D20Roll = class { constructor(total, critical = false, fumble = false) {
  Object.assign(this, { total, isCritical: critical, isFumble: fumble, _evaluated: true });
} };
const wetActor = { ...burstActor, flags: { spikependium: { key: "actor:reanimated-companion:fury:wet", companionInt: 2 },
  dnd5e: { summon: { origin: "burstOrigin" } } }, statuses: new Set(),
  system: { attributes: { hp: { value: 10 }, ac: { value: 15 } } }, items: itemsWith([]) };
const wetToken = tokenForBurst("wet", wetActor, 0);
wetToken.parent = burstScene;
const wetAcid = { id: "V1Ih7mjczKLWA8EK", actor: wetActor, item: { toObject: () => ({ _id: "acidItem", system: {} }) },
  damage: { parts: [{ custom: { formula: "2" } }] }, messageSources: { activity: { uuid: "wetAcid" } } };
wetActor.items.push({ system: { activities: [wetAcid] } });
globalThis.fromUuidSync = uuid => uuid === wetToken.uuid ? wetToken : uuid === "burstOrigin" ? burstOrigin : uuid === "wetAcid" ? wetAcid : null;
const wetAttack = { id: "wetAttack", type: "attack", flags: {}, whisper: [], blind: false,
  rolls: [new CONFIG.Dice.D20Roll(15)], system: { targets: [{ token: wetToken.uuid, actor: wetActor.uuid, ac: 15 }] },
  getAssociatedToken: () => nearBurstTarget,
  updateSource(data) { for (const [key, value] of Object.entries(data)) setProperty(this, key, value); } };
assert.equal(wetHitSnapshots(wetAttack).length, 1, "попадание при равенстве КД на границе 10 футов");
for (const roll of [new CONFIG.Dice.D20Roll(14), new CONFIG.Dice.D20Roll(100, false, true), { total: 20 }])
  assert.deepEqual(wetHitSnapshots({ ...wetAttack, rolls: [roll] }), []);
assert.equal(wetHitSnapshots({ ...wetAttack, rolls: [new CONFIG.Dice.D20Roll(1, true)] }).length, 1);
assert.equal(wetHitSnapshots({ ...wetAttack, rolls: [new CONFIG.Dice.D20Roll(15), new CONFIG.Dice.D20Roll(15)] }).length, 2);
assert.deepEqual(wetHitSnapshots({ ...wetAttack, type: "damage" }), []);
assert.deepEqual(wetHitSnapshots({ ...wetAttack, getAssociatedToken: () => null }), []);
for (const ac of [null, undefined])
  assert.deepEqual(wetHitSnapshots({ ...wetAttack, system: { targets: [{ token: wetToken.uuid, ac }] } }), []);
assert.deepEqual(wetHitSnapshots({ ...wetAttack, system: { targets: [{ token: "deleted", actor: wetActor.uuid, ac: 15 }] } }), []);
assert.deepEqual(wetHitSnapshots({ ...wetAttack, getAssociatedToken: () => farBurstTarget }), []);
assert.deepEqual(wetHitSnapshots({ ...wetAttack, getAssociatedToken: () => highBurstTarget }), []);
const activeScene = canvas.scene;
canvas.scene = { id: "anotherScene" };
assert.equal(wetHitSnapshots(wetAttack).length, 1, "использует собственную сетку неактивной сцены");
canvas.scene = activeScene;
wetActor.statuses.add("dead");
assert.deepEqual(wetHitSnapshots(wetAttack), []);
wetActor.statuses.clear();
burstOwner.system.abilities.int.mod = 0;
assert.deepEqual(wetHitSnapshots(wetAttack), [], "нулевой урон не создаёт карточку");
burstOwner.system.abilities.int.mod = 3;
recordWetHits(wetAttack);
assert.equal(wetAttack.flags.spikependium.wetHits[0].bonus, 3);
wetActor.system.attributes.hp.value = 0;
wetToken.getCenterPoint = () => ({ x: 100, y: 0, elevation: 0 });
burstOwner.system.abilities.int.mod = 4;
assert.deepEqual(wetHitSnapshots(wetAttack), []);
game.messages = itemsWith([]);
game.user.isActiveGM = true;
let wetBuilds = 0;
let wetResponse;
CONFIG.Dice.DamageRoll.build = async (config, dialog, message) => {
  wetBuilds++;
  wetResponse = message;
  assert.equal(config.rolls[0].parts[0], "3", "урон фиксируется в момент попадания");
  assert.equal(config.rolls[0].options.type, "acid");
  assert.equal(config.critical.allow, false);
  assert.equal(dialog.configure, false);
  assert.equal(message.data.system.targets[0].token, nearBurstTarget.uuid, "целью становится атакующий");
  await Promise.resolve();
  message.document = { id: `wetResponse${wetBuilds}`, ...message.data };
  game.messages.push(message.document);
};
await Promise.all([triggerWetResponses(wetAttack), triggerWetResponses(wetAttack)]);
assert.equal(wetBuilds, 1, "одновременные события создают одну карточку");
assert.equal(wetResponse.rollMode, "public");
await triggerWetResponses(wetAttack);
assert.equal(wetBuilds, 1, "квитанция в чате предотвращает повтор после перезагрузки");
for (const [blind, mode] of [[false, "gm"], [true, "blind"]]) {
  await triggerWetResponses({ ...wetAttack, id: `wetPrivate${mode}`, whisper: ["player", "gm"], blind });
  assert.deepEqual(wetResponse.data.whisper, ["player", "gm"]);
  assert.equal(wetResponse.data.blind, blind);
  assert.equal(wetResponse.rollMode, mode, "сохраняет видимость исходной атаки");
}
game.user.isActiveGM = false;
await triggerWetResponses({ ...wetAttack, id: "wetOffline" });
assert.equal(wetBuilds, 3);
game.user.isActiveGM = true;
globalThis.fromUuidSync = () => null;
await triggerWetResponses({ ...wetAttack, id: "wetDeleted" });
assert.equal(wetBuilds, 4, "снимок остаётся пригоден после удаления спутника");
const wetBuild = CONFIG.Dice.DamageRoll.build;
const wetConsoleError = console.error;
console.error = () => {};
CONFIG.Dice.DamageRoll.build = async () => { throw Error("wet failed"); };
await triggerWetResponses({ ...wetAttack, id: "wetRetry" });
CONFIG.Dice.DamageRoll.build = wetBuild;
console.error = wetConsoleError;
await triggerWetResponses({ ...wetAttack, id: "wetRetry" });
assert.equal(wetBuilds, 5, "ошибка не блокирует последующую попытку");
assert.equal(wetResponse.data.flags.dnd5e.item.data._id, "acidItem");
console.log("Влажный спутник: попадания, критические и промахи, дистанция и высота, снимок после смерти, отсутствие дублей, скрытые карточки и повтор после ошибки: OK.");

// Тощий: выбор в начале хода, штатный спасбросок и эффект с правильным краем срока.
const thinActor = { ...wetActor, id: "thinActor", uuid: "Actor.thin", isOwner: true,
  flags: { spikependium: { key: "actor:reanimated-companion:conduit:thin" }, dnd5e: { summon: { origin: "burstOrigin" } } },
  statuses: new Set(), system: { attributes: { hp: { value: 10 }, ac: { value: 15 } } }, items: itemsWith([]) };
const thinToken = tokenForBurst("thin", thinActor, 0);
thinToken.parent = burstScene;
const thinEffectData = { _id: "thinEffect", type: "base", name: "Fear", statuses: ["frightened"], disabled: false, transfer: false,
  duration: { value: null, expiry: "turnStart", expired: false }, system: { changes: [] }, flags: {} };
class ThinEffect {
  constructor(data) { Object.assign(this, structuredClone(data)); this.id = data._id; this.statuses = new Set(data.statuses); }
  toObject() { return structuredClone(thinEffectData); }
  static getEffectStart(combat) { return { combat: combat.id, round: combat.round, turn: combat.turn, time: 100 }; }
}
ActiveEffect.implementation = ThinEffect;
const thinProfile = new ThinEffect(thinEffectData);
thinProfile.uuid = "Actor.thin.Item.fear.ActiveEffect.thinEffect";
const thinActivity = { id: "KutWcRCXPHmd74hD", uuid: "Actor.thin.Item.fear.Activity.KutWcRCXPHmd74hD", actor: thinActor,
  save: { dc: { value: 14 } }, item: { effects: [thinProfile], toObject: () => ({ _id: "fearItem", effects: [thinProfile.toObject()] }) } };
thinActor.items.push({ system: { activities: [thinActivity] } });
burstScene.tokens = [thinToken, nearBurstTarget];
nearbyActor.id = "nearActor";
nearbyActor.isOwner = true;
nearbyActor.items = itemsWith([]);
nearbyActor.effects = itemsWith([]);
nearbyActor.system.traits = { ci: { value: new Set() } };
const thinCombat = { id: "thinCombat", uuid: "Combat.thin", started: true, round: 1, turn: 0,
  combatant: { token: nearBurstTarget }, flags: {}, async setFlag(scope, key, value) {
    (this.flags[scope] ??= {})[key] = value;
  } };
const resolveThin = uuid => uuid === thinCombat.uuid ? thinCombat : uuid === thinToken.uuid ? thinToken
  : uuid === nearBurstTarget.uuid ? nearBurstTarget : uuid === "burstOrigin" ? burstOrigin : null;
globalThis.fromUuidSync = resolveThin;
assert.deepEqual(thinSources(nearBurstTarget).map(c => c.source.uuid), [thinToken.uuid]);
assert.deepEqual(thinSources(farBurstTarget), []);
assert.deepEqual(thinSources(highBurstTarget), []);
nearbyActor.system.traits.ci.value.add("frightened");
assert.deepEqual(thinSources(nearBurstTarget), []);
nearbyActor.system.traits.ci.value.clear();
thinActor.statuses.add("dead");
assert.deepEqual(thinSources(nearBurstTarget), []);
thinActor.statuses.clear();
const legacyFearChanges = thinEffectChanges.call(thinActivity, () => ({ custom: 1 }), thinProfile, {});
assert.deepEqual(legacyFearChanges, { custom: 1, duration: { value: null, expiry: "targetStart" } });
assert.deepEqual(thinEffectChanges.call({ ...thinActivity, id: "other" }, () => ({}), thinProfile, {}), {});
foundry.utils.escapeHTML = value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;");
game.user = { id: "gm", isActiveGM: true, isGM: true };
game.users = [{ id: "player", active: true, isGM: false }, game.user];
burstOwner.testUserPermission = user => user.id === "player";
game.messages = itemsWith([]);
let thinQueries = 0;
let thinSelected = true;
let thinRecipient;
foundry.applications ??= {};
foundry.applications.api = { DialogV2: { async query(user, type, config) {
  thinQueries++;
  thinRecipient = user;
  assert.equal(type, "confirm");
  assert.equal(config.no.default, true);
  return thinSelected;
} } };
let thinCards = 0;
let thinCard;
thinActivity.use = async (config, dialog, message) => {
  thinCards++;
  assert.equal(config.consume, false);
  assert.equal(config.subsequentActions, false);
  assert.equal(dialog.configure, false);
  assert.equal(message.data.system.targets[0].token, nearBurstTarget.uuid);
  thinCard = { id: `thinCard${thinCards}`, uuid: `ChatMessage.thinCard${thinCards}`, ...message.data, author: game.user,
    whisper: message.rollMode === "gm" ? ["gm"] : [], blind: false,
    getAssociatedActor: () => thinActor, getAssociatedItem: () => thinActivity.item, getAssociatedActivity: () => thinActivity,
    getAssociatedRolls() { return game.messages.filter(m => m.type === "save" && m.getOriginatingMessage() === this); } };
  game.messages.push(thinCard);
  return { message: thinCard };
};
await Promise.all([chooseThinFear(thinCombat, { turn: 0 }), chooseThinFear(thinCombat, { turn: 0 })]);
assert.equal(thinQueries, 1);
assert.equal(thinCards, 1);
assert.equal(thinRecipient.id, "player", "выбор принадлежит владельцу создателя");
await chooseThinFear(thinCombat, { round: 1 });
assert.equal(thinQueries, 1, "сохраняет решение для защиты от повторного события");
await chooseThinFear(thinCombat, { active: true });
await chooseThinFear(thinCombat, { turn: 0 }, { direction: -1 });
assert.equal(thinQueries, 1);
thinCombat.round++;
thinSelected = null;
await chooseThinFear(thinCombat, { round: 2 });
assert.equal(thinCards, 1, "закрытие окна пропускает применение");
await chooseThinFear(thinCombat, { round: 2 });
assert.equal(thinQueries, 2, "отказ сохраняется на этом ходу");
thinCombat.round++;
thinSelected = true;
nearBurstTarget.hidden = true;
await chooseThinFear(thinCombat, { round: 3 });
assert.equal(thinRecipient.id, "gm", "скрытый токен не раскрывается игроку");
assert.deepEqual(thinCard.whisper, ["gm"]);
nearBurstTarget.hidden = false;
const thinSave = failed => {
  const card = thinCard;
  const roll = new CONFIG.Dice.D20Roll(failed ? 5 : 20);
  Object.assign(roll, { isFailure: failed, isSuccess: !failed, options: { target: 14 } });
  const message = { type: "save", flags: {}, system: { ability: "wis", forceSuccess: false }, speaker: { actor: nearbyActor.id },
    whisper: [], blind: false, rolls: [roll], getOriginatingMessage: () => card, getAssociatedToken: () => nearBurstTarget,
    updateSource(data) { Object.assign(this, data); } };
  game.messages.push(message);
  return message;
};
const failedThinSave = thinSave(true);
prepareThinSave(failedThinSave);
assert.equal(failedThinSave.speaker.token, nearBurstTarget.id);
assert.equal(failedThinSave.speaker.scene, burstScene.id, "сохраняет сцену цели, включая неактивную");
assert.deepEqual(failedThinSave.whisper, ["gm"], "скрытая цель не раскрывается карточкой спасброска");
const wrongActorSave = { ...failedThinSave, speaker: { actor: "someoneElse" } };
prepareThinSave(wrongActorSave);
assert.deepEqual(wrongActorSave.speaker, { actor: "someoneElse" });
let thinEffectWrites = 0;
let delayThinPreparation;
dnd5e.applications = { components: { EffectApplicationElement: class {
  async _prepareEffectData(effect) {
    if (delayThinPreparation) await delayThinPreparation();
    const data = effect.toObject();
    data.system.origin = { activity: this.chatMessage.getAssociatedActivity()?.uuid };
    return { action: "create", data };
  }
} } };
nearbyActor.createEmbeddedDocuments = async (type, data) => {
  assert.equal(type, "ActiveEffect");
  thinEffectWrites++;
  nearbyActor.effects.push({ ...data[0], id: `thinAE${thinEffectWrites}` });
};
nearbyActor.updateEmbeddedDocuments = async () => assert.fail("новый эффект не требует обновления");
nearbyActor.deleteEmbeddedDocuments = async (type, ids) => {
  assert.equal(type, "ActiveEffect");
  for (const id of ids) nearbyActor.effects.splice(nearbyActor.effects.findIndex(e => e.id === id), 1);
};
await Promise.all([syncThinFear(failedThinSave), syncThinFear(failedThinSave)]);
assert.equal(thinEffectWrites, 1);
const automaticThinEffect = nearbyActor.effects[0];
assert.equal(automaticThinEffect.duration.expiry, "targetStart");
assert.equal(automaticThinEffect.start.combat, thinCombat.id);
assert.equal(automaticThinEffect.start.round, 3);
assert.equal(automaticThinEffect.system.origin.message, thinCard.uuid);
nearbyActor.effects.push({ id: "otherFear", flags: {}, duration: {} });
failedThinSave.system.forceSuccess = true;
await syncThinFear(failedThinSave);
assert.deepEqual(nearbyActor.effects.map(e => e.id), ["otherFear"], "легендарное сопротивление снимает только этот испуг");
failedThinSave.system.forceSuccess = false;
await syncThinFear(failedThinSave);
assert.equal(thinEffectWrites, 2);
const successfulThinSave = thinSave(false);
await syncThinFear(successfulThinSave);
assert.deepEqual(nearbyActor.effects.map(e => e.id), ["otherFear"], "новый успешный результат заменяет провал");
await syncThinFear(failedThinSave);
assert.equal(thinEffectWrites, 2, "обновление старой карточки не возвращает испуг");
game.messages.splice(game.messages.indexOf(successfulThinSave), 1);
nearbyActor.system.traits.ci.value.add("ALL");
await syncThinFear(failedThinSave);
assert.equal(thinEffectWrites, 2);
nearbyActor.system.traits.ci.value.clear();
thinCombat.round++;
await syncThinFear(failedThinSave);
assert.equal(thinEffectWrites, 2, "поздний бросок не переносит испуг на новый ход");
await chooseThinFear(thinCombat, { round: 4 });
const racingThinSave = thinSave(true);
delayThinPreparation = async () => { racingThinSave.system.forceSuccess = true; await syncThinFear(racingThinSave); };
await syncThinFear(racingThinSave);
assert.equal(thinEffectWrites, 2, "успех во время подготовки предотвращает наложение эффекта");
delayThinPreparation = undefined;
racingThinSave.system.forceSuccess = false;
thinCard.getAssociatedActivity = () => null;
await syncThinFear(racingThinSave);
assert.equal(thinEffectWrites, 3, "снимок профиля работает после исчезновения спутника");
assert.equal(nearbyActor.effects.at(-1)._stats.duplicateSource, thinProfile.uuid);
const originalThinQuery = foundry.applications.api.DialogV2.query;
let finishThinQuery;
thinCombat.round++;
foundry.applications.api.DialogV2.query = async () => new Promise(resolve => { finishThinQuery = resolve; });
const delayedThinChoice = chooseThinFear(thinCombat, { round: 5 });
await Promise.resolve();
await Promise.resolve();
thinCombat.round++;
finishThinQuery(true);
await delayedThinChoice;
assert.equal(thinCards, 3, "ответ на старое окно не создаёт новую карточку");
foundry.applications.api.DialogV2.query = originalThinQuery;
game.user.isActiveGM = false;
await chooseThinFear(thinCombat, { round: 6 });
assert.equal(thinCards, 3);
game.user.isActiveGM = true;
thinCombat.round++;
const workingThinUse = thinActivity.use;
const thinLogError = console.error;
console.error = () => {};
thinActivity.use = async () => { throw Error("thin use failed"); };
await chooseThinFear(thinCombat, { round: thinCombat.round });
assert.deepEqual(thinCombat.flags.spikependium.thinFear.events, [], "ошибка без карточки позволяет повторить попытку");
thinActivity.use = workingThinUse;
await chooseThinFear(thinCombat, { round: thinCombat.round });
assert.equal(thinCards, 4);
const currentThinSave = thinSave(true);
const thinWritesBeforeWrongSave = thinEffectWrites;
currentThinSave.rolls[0].options.target = 99;
await syncThinFear(currentThinSave);
assert.equal(thinEffectWrites, thinWritesBeforeWrongSave, "не применяет эффект по броску с другой Сл.");
currentThinSave.rolls[0].options.target = 14;
thinCard.author = { isGM: false };
await syncThinFear(currentThinSave);
assert.equal(thinEffectWrites, thinWritesBeforeWrongSave, "автоматический эффект принимает только карточку, созданную Мастером");
thinCard.author = game.user;
delayThinPreparation = async () => { thinCombat.round++; };
await syncThinFear(currentThinSave);
assert.equal(thinEffectWrites, thinWritesBeforeWrongSave, "новый ход во время подготовки не сдвигает срок испуга");
delayThinPreparation = undefined;
thinActivity.use = async (...args) => { await workingThinUse(...args); throw Error("after card"); };
await chooseThinFear(thinCombat, { round: thinCombat.round });
const thinAfterPartialFailure = thinCards;
await chooseThinFear(thinCombat, { round: thinCombat.round });
assert.equal(thinCards, thinAfterPartialFailure, "ошибка после создания карточки не создаёт дубль");
thinActivity.use = workingThinUse;
console.error = thinLogError;
console.log("Тощий спутник: владелец и выбор, начало хода и дистанция, скрытые токены, спасброски, автоматический испуг, иммунитет, легендарное сопротивление, повтор и устаревшие окна: OK.");

const opportunityCombat = { id: "opportunityCombat", uuid: "Combat.opportunity", started: true, round: 1, turn: 0,
  getCombatantsByToken: token => token.uuid === nearBurstTarget.uuid ? [{ token }] : [] };
game.combats = [opportunityCombat];
game.combat = opportunityCombat;
class OpportunityEffect {
  constructor(data, options = {}) {
    this.data = structuredClone(data); this.id = data._id; this.flags = data.flags;
    this.uuid = `${options.parent?.uuid ?? ""}.ActiveEffect.${this.id}`;
  }
  toObject() { return structuredClone(this.data); }
  static getEffectStart(combat) { return { combat: combat?.id ?? null, round: combat?.round ?? null, turn: combat?.turn ?? null, time: 100 }; }
}
ActiveEffect.implementation = OpportunityEffect;
const opportunityStrike = { id: "8FKHvTEMzK92yKo4", uuid: "Actor.thin.Item.strike.Activity.8FKHvTEMzK92yKo4", actor: thinActor,
  item: { uuid: "Actor.thin.Item.strike", effects: [] } };
thinActor.testUserPermission = user => !!user?.isGM;
const resolveOpportunity = uuid => uuid === opportunityCombat.uuid ? opportunityCombat : resolveThin(uuid);
globalThis.fromUuidSync = resolveOpportunity;
const opportunityMessage = { id: "opportunityAttack", uuid: "ChatMessage.opportunityAttack", type: "attack", flags: {}, author: game.user,
  rolls: [new CONFIG.Dice.D20Roll(15), new CONFIG.Dice.D20Roll(15)],
  system: { targets: [{ token: nearBurstTarget.uuid, actor: nearbyActor.uuid, ac: 15 }] },
  getAssociatedActivity: () => opportunityStrike, getAssociatedToken: () => thinToken,
  updateSource(data) { for (const [key, value] of Object.entries(data)) setProperty(this, key, value); },
  async setFlag(scope, key, value) { (this.flags[scope] ??= {})[key] = value; } };
assert.equal(strikeHitSnapshots(opportunityMessage).length, 1, "повторные попадания одного броска оставляют один эффект для токена");
assert.equal(strikeHitSnapshots({ ...opportunityMessage, getAssociatedActivity: () => ({ ...opportunityStrike, id: "8I7DzW0U2d8CuWql" }) }).length, 1, "второй удар Ярости тоже накладывает запрет");
const unevaluatedStrikeRoll = new CONFIG.Dice.D20Roll(15);
unevaluatedStrikeRoll._evaluated = false;
assert.deepEqual(strikeHitSnapshots({ ...opportunityMessage, rolls: [unevaluatedStrikeRoll] }), [], "предпросмотр не является попаданием");
for (const roll of [new CONFIG.Dice.D20Roll(14), new CONFIG.Dice.D20Roll(100, false, true), { total: 20 }])
  assert.deepEqual(strikeHitSnapshots({ ...opportunityMessage, rolls: [roll] }), []);
assert.equal(strikeHitSnapshots({ ...opportunityMessage, rolls: [new CONFIG.Dice.D20Roll(1, true)] }).length, 1);
assert.deepEqual(strikeHitSnapshots({ ...opportunityMessage, system: { targets: [{ token: nearBurstTarget.uuid, ac: null }] } }), []);
assert.deepEqual(strikeHitSnapshots({ ...opportunityMessage, getAssociatedActivity: () => ({ ...opportunityStrike, id: "other" }) }), []);
assert.deepEqual(strikeHitSnapshots({ ...opportunityMessage, getAssociatedToken: () => null }), []);
nearbyActor.type = "vehicle";
assert.deepEqual(strikeHitSnapshots(opportunityMessage), [], "запрет действует на существ");
nearbyActor.type = "character";
const ambiguousCombat = { ...opportunityCombat, id: "another", uuid: "Combat.another" };
game.combats.push(ambiguousCombat);
game.combat = null;
assert.deepEqual(strikeHitSnapshots(opportunityMessage), [], "два боя для одной цели требуют ручного определения срока");
game.combats.pop();
game.combat = opportunityCombat;
recordStrikeHits(opportunityMessage);
assert.equal(opportunityMessage.flags.spikependium.strikeHits[0].effect._id, makeId("effect:reanimated:strike:no-opportunity"));
assert.equal(opportunityMessage.flags.spikependium.strikeHits[0].start.combat, opportunityCombat.id);
nearbyActor.effects = itemsWith([]);
let opportunityWrites = 0;
let opportunityPrepare;
dnd5e.applications.components.EffectApplicationElement = class {
  async _prepareEffectData(effect, actor) {
    if (opportunityPrepare) await opportunityPrepare();
    const data = effect.toObject();
    data.system.origin = {};
    const existing = actor.effects.find(e => e._stats?.duplicateSource === effect.uuid);
    if (existing) data._id = existing.id;
    return { action: existing ? "update" : "create", data };
  }
};
nearbyActor.createEmbeddedDocuments = async (type, data) => {
  assert.equal(type, "ActiveEffect");
  opportunityWrites++;
  await Promise.resolve();
  nearbyActor.effects.push({ ...data[0], id: `opportunityEffect${opportunityWrites}` });
};
nearbyActor.updateEmbeddedDocuments = async (type, data) => {
  assert.equal(type, "ActiveEffect");
  opportunityWrites++;
  Object.assign(nearbyActor.effects.get(data[0]._id), data[0]);
};
await Promise.all([applyStrikeHits(opportunityMessage), applyStrikeHits(opportunityMessage)]);
assert.equal(opportunityWrites, 1);
assert.equal(nearbyActor.effects[0].duration.expiry, "targetStart");
assert.equal(noOpportunityAttacks(nearbyActor), true);
assert.equal(conditionalState(nearbyActor, {}).noOpportunityAttacks, true);
await applyStrikeHits(opportunityMessage);
assert.equal(opportunityWrites, 1);
nearbyActor.effects[0].disabled = true;
assert.equal(noOpportunityAttacks(nearbyActor), false);
nearbyActor.effects[0].disabled = false;
nearbyActor.effects[0].duration.expired = true;
assert.equal(noOpportunityAttacks(nearbyActor), false);
nearbyActor.effects[0].duration.expired = false;
nearbyActor.effects[0].isSuppressed = true;
assert.equal(noOpportunityAttacks(nearbyActor), false);
nearbyActor.effects[0].isSuppressed = false;
const nextOpportunityAttack = { ...opportunityMessage, id: "secondOpportunityAttack", uuid: "ChatMessage.secondOpportunityAttack",
  flags: { spikependium: { strikeHits: opportunityMessage.flags.spikependium.strikeHits } } };
await applyStrikeHits(nextOpportunityAttack);
assert.equal(opportunityWrites, 2);
assert.equal(nearbyActor.effects.length, 1, "следующее попадание обновляет тот же профиль");
assert.equal(nearbyActor.effects[0].system.origin.message, nextOpportunityAttack.uuid);
const lateOpportunityAttack = { ...opportunityMessage, id: "lateOpportunityAttack",
  flags: { spikependium: { strikeHits: opportunityMessage.flags.spikependium.strikeHits } } };
opportunityCombat.turn++;
await applyStrikeHits(lateOpportunityAttack);
assert.equal(opportunityWrites, 2, "поздняя обработка не сдвигает срок запрета");
opportunityCombat.turn--;
opportunityPrepare = async () => { opportunityCombat.turn++; };
await applyStrikeHits(lateOpportunityAttack);
assert.equal(opportunityWrites, 2, "новый ход во время подготовки не накладывает устаревший эффект");
opportunityCombat.turn--;
opportunityPrepare = undefined;
const missingSourceAttack = { ...opportunityMessage, id: "missingSourceAttack",
  flags: { spikependium: { strikeHits: opportunityMessage.flags.spikependium.strikeHits } } };
await applyStrikeHits(missingSourceAttack);
assert.equal(opportunityWrites, 3, "старый статблок без профиля получает штатный эффект правила");
game.user.isActiveGM = false;
await applyStrikeHits({ ...missingSourceAttack, id: "withoutGM", flags: { spikependium: { strikeHits: opportunityMessage.flags.spikependium.strikeHits } } });
assert.equal(opportunityWrites, 3);
game.user.isActiveGM = true;
const failedReceiptAttack = { ...opportunityMessage, id: "failedReceiptAttack",
  flags: { spikependium: { strikeHits: opportunityMessage.flags.spikependium.strikeHits } },
  async setFlag() { throw Error("receipt failed"); } };
console.error = () => {};
await applyStrikeHits(failedReceiptAttack);
assert.equal(opportunityWrites, 4);
failedReceiptAttack.setFlag = opportunityMessage.setFlag;
await applyStrikeHits(failedReceiptAttack);
console.error = thinLogError;
assert.equal(opportunityWrites, 4, "ошибка квитанции не применяет существующий эффект дважды");
class OpportunityDialog {
  constructor(config) { this.config = config; }
  async _prepareConfigurationContext() { return { fields: [] }; }
  _buildConfig(roll) { return roll; }
}
const opportunityConfig = { subject: { actor: nearbyActor } };
const opportunityDialog = { applicationClass: OpportunityDialog, configure: false };
prepareOpportunityRoll(opportunityConfig, opportunityDialog);
assert.equal(opportunityDialog.configure, true);
const opportunityWindow = new opportunityDialog.applicationClass(opportunityConfig);
assert.equal((await opportunityWindow._prepareConfigurationContext()).fields[0].name, "spikependium.attackPurpose");
const opportunityRoll = { options: {} };
opportunityWindow._buildConfig(opportunityRoll, new Map([["spikependium.attackPurpose", "normal"]]), 0);
assert.equal(validateOpportunityRoll([opportunityRoll], opportunityConfig), undefined, "обычная атака остаётся доступна");
opportunityWindow._buildConfig(opportunityRoll, new Map([["spikependium.attackPurpose", "opportunity"]]), 0);
assert.equal(validateOpportunityRoll([opportunityRoll], opportunityConfig), false);
assert.equal(validateOpportunityRoll([], opportunityConfig), undefined, "отмена не выдаёт запрет");
assert.equal(prepareOpportunityRoll(opportunityConfig, {}), false, "явно указанная провоцированная атака блокируется до окна");
nearbyActor.effects[0].duration.expired = true;
assert.equal(validateOpportunityRoll([opportunityRoll], opportunityConfig), undefined, "после истечения запрета атака снова доступна");
const ordinaryDialog = { configure: false };
prepareOpportunityRoll({ subject: { actor: nearbyActor } }, ordinaryDialog);
assert.equal(ordinaryDialog.configure, false);
console.log("Ужасающий удар: эффект при попадании, обновление без дублей, снимок и срок, обычные и провоцированные атаки, отмена и снятие запрета: OK.");

nearbyActor.effects[0].duration.expired = false;
const forgedStrike = { ...opportunityMessage, id: "forgedStrike", author: { id: "stranger", isGM: false },
  flags: { spikependium: { strikeHits: opportunityMessage.flags.spikependium.strikeHits } } };
await applyStrikeHits(forgedStrike);
assert.equal(opportunityWrites, 4, "без владения источником карточка не применяет эффект на чужом листе");
const tamperedStrike = { ...opportunityMessage, id: "tamperedStrike", flags: { spikependium: { strikeHits:
  opportunityMessage.flags.spikependium.strikeHits.map(hit => ({ ...hit,
    effect: { type: "enchantment", statuses: ["dead"], system: { changes: [{ key: "system.attributes.hp.value", value: "0" }] } },
    start: { combat: opportunityCombat.id, round: 999, turn: 999 } })) } } };
await applyStrikeHits(tamperedStrike);
assert.equal(opportunityWrites, 5);
assert.deepEqual(nearbyActor.effects[0].system.changes, [], "данные эффекта из чужих флагов не исполняются");
assert.deepEqual(nearbyActor.effects[0].statuses, []);
assert.equal(nearbyActor.effects[0].start.round, opportunityCombat.round);
const disappearingStrike = { ...opportunityMessage, id: "disappearingStrike", flags: {} };
opportunityPrepare = async () => { disappearingStrike.getAssociatedActivity = () => null; };
await applyStrikeHits(disappearingStrike);
opportunityPrepare = undefined;
assert.equal(opportunityWrites, 6, "уже подтверждённое попадание сохраняется при удалении источника во время применения");
assert.equal(nearbyActor.effects.length, 1);
console.log("Ужасающий удар: владение источником, ограничение данных правила, неизменный край срока и исчезновение источника после проверки: OK.");
const strikeTemplates = [...docs.values()].filter(d => d.flags.spikependium.key.startsWith("actor:reanimated-companion"));
assert.equal(strikeTemplates.length, 11);
for (const template of strikeTemplates) {
  const item = template.items.find(i => i.system.activities["8FKHvTEMzK92yKo4"]);
  const profile = item.effects.find(e => e.flags.spikependium?.noOpportunityAttacks);
  assert.equal(profile._id, "WhVStqtfvQiffom6");
  assert.equal(profile.duration.expiry, "targetStart");
  assert.equal(profile.transfer, false);
  assert.deepEqual(profile.system.changes, []);
  for (const a of Object.values(item.system.activities)) assert.ok(a.effects.some(e => e._id === profile._id));
}
await applyStrikeHits({ ...opportunityMessage, getAssociatedActivity: () => ({ actor: null }) });
await applyStrikeHits({ ...opportunityMessage, author: null });
assert.equal(opportunityWrites, 6);
