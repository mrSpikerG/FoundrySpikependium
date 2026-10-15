import assert from "node:assert/strict";
import fs from "node:fs";
import { ALCHEMIST_SUBCLASSES, DYNAMO_TABLE } from "../src/content/subclasses-alchemist.mjs";
import { ALCHEMIST_SPECIAL_FORMULAS } from "../src/content/alchemist-special-formulas.mjs";
import { ALCHEMIST_SAVE_DC, ALCHEMIST_URL } from "../src/content/alchemist-formulas.mjs";
import { dynamoSlotLevel, dynamoMaxSpellLevel, prepareDynamoChoice, canUseAlchemistSpecialty } from "../scripts/alchemist-subclasses.mjs";
import { alchemistDiscoveryPrerequisites, canUseAlchemistDiscovery } from "../scripts/alchemist-discoveries.mjs";
import { nativeAlchemistPrerequisites } from "./data/dnd5e-alchemist-native.mjs";
import { nativeItemChoiceCounts } from "./data/dnd5e-monsters-native.mjs";
import { nativeMagusASIApply } from "./data/dnd5e-magus-native.mjs";
const docs = new Map(), uuids = new Map(), folders = new Map();
for (const pack of ["classes", "subclasses"]) for (const file of fs.readdirSync(`packs/_source/${pack}`)) {
  const d = JSON.parse(fs.readFileSync(`packs/_source/${pack}/${file}`, "utf8"));
  if (d._key.startsWith("!folders!")) folders.set(d._id, d);
  else { docs.set(d.flags.spikependium.key, d); uuids.set(`Compendium.spikependium.${pack}.Item.${d._id}`, d); }
}
const get = key => { assert.ok(docs.has(key), key); return docs.get(key); }, acts = d => Object.values(d.system.activities ?? {});
const evidence = JSON.parse(fs.readFileSync("tools/data/alchemist-subclasses.json", "utf8"));
const normalize = s => s.toLowerCase().replace(/^формула:\s*/i, "").replace(/\s+/g, " ").trim();
assert.equal(ALCHEMIST_SUBCLASSES.length, 11); assert.equal(evidence.entries.reduce((n, e) => n + e.features.length, 0), 54);
for (const entry of evidence.entries) {
  const root = get(entry.key); assert.equal(root.type, "subclass"); assert.equal(root.system.classIdentifier, "alchemist"); assert.equal(root.system.identifier, entry.identifier);
  assert.equal(root.system.spellcasting.progression, "none", "dynamo mechanisms must not grant ordinary multiclass slots");
  const granted = root.system.advancement.filter(a => a.type === "ItemGrant").flatMap(a => a.configuration.items.map(i => ({ doc: uuids.get(i.uuid), level: a.level })));
  for (const source of entry.features) assert.ok(granted.some(g => g.doc && g.level === source.level && normalize(g.doc.name) === normalize(source.name)), `${entry.name}: ${source.name} on ${source.level}`);
  for (const { doc, level } of granted) { assert.ok(doc); assert.equal(doc.system.prerequisites.level <= level, true); }
}
const specials = ALCHEMIST_SPECIAL_FORMULAS.map(row => get(`alchemist:special-formula:${row.id}`));
assert.equal(specials.length, 10);
const commonChoice = get("class:alchemist").system.advancement.find(a => a.title === "Известные формулы бомб");
for (const doc of specials) {
  assert.ok(!commonChoice.configuration.pool.some(i => i.uuid.endsWith(doc._id)), "specialized formulas never enter the general pool");
  assert.ok(acts(doc).filter(a => a.type === "attack").every(a => a.flags.spikependium.alchemistBomb.charged));
  for (const a of acts(doc).filter(a => a.type === "save")) assert.equal(a.save.dc.formula, ALCHEMIST_SAVE_DC);
}
for (const doc of docs.values()) {
  const key = doc.flags.spikependium.key;
  if (!key.startsWith("subclass:alchemist-") && !key.startsWith("alchemist:special-formula:") && !key.startsWith("alchemist:research-discovery:")) continue;
  assert.equal(doc.system.source.rules, "2014"); assert.equal(doc.system.source.custom, ALCHEMIST_URL); assert.equal(doc.system.source.page, ""); assert.ok(/[а-яё]/i.test(doc.name));
  let parent = doc.folder, found = false; while (parent) { const f = folders.get(parent); assert.ok(f); found ||= f.name === "Алхимик (Valda)"; parent = f.folder; } assert.ok(found);
  for (const a of acts(doc)) for (const t of a.consumption.targets) if (t.type === "itemUses" && t.target.startsWith("feat:alchemist-")) assert.ok([...docs.values()].some(d => `feat:${d.system.identifier}` === t.target), t.target);
}
const dynamo = get("subclass:alchemist-dynamo-engineer"), choices = dynamo.system.advancement.filter(a => a.type === "ItemChoice"); assert.equal(choices.length, 2);
let learned = 0;
for (const [level, known, mechanisms, slot] of DYNAMO_TABLE) {
  learned += choices.reduce((n, a) => n + nativeItemChoiceCounts.call({ configuration: a.configuration, value: { added: {}, replaced: {} } }, level).max, 0);
  assert.equal(learned, known); assert.equal(dynamoSlotLevel(level), slot);
  assert.equal(dynamoMaxSpellLevel.call({ advancement: { item: dynamo }, level }, () => 9), slot, "a high-level wizard multiclass must not unlock higher dynamo spells");
  assert.equal(dynamo.system.advancement.find(a => a.type === "ScaleValue" && a.configuration.identifier === "devices").configuration.scale[level].value, mechanisms);
}
assert.deepEqual(choices[0].configuration.restriction.school, ["con", "trs"]); assert.deepEqual(choices[1].configuration.restriction.school, []);
assert.equal(dynamoMaxSpellLevel.call({ advancement: { item: {} }, level: 20 }, () => 9), 9);
const hostChoices = choices.map((a, i) => ({ ...structuredClone(a), id: a._id, value: { replaced: i ? { 8: { original: "previous" } } : {} }, updateSource(updates) { for (const [path, value] of Object.entries(updates)) this.configuration.choices[8].replacement = value; } }));
const hostRoot = { ...dynamo, system: { advancement: hostChoices } }; for (const a of hostChoices) { a.item = hostRoot; a.type = "ItemChoice"; }
prepareDynamoChoice({ step: { flow: { advancement: hostChoices[0], level: 8 } } }); assert.equal(hostChoices[0].configuration.choices[8].replacement, false);
hostChoices[1].value.replaced = {}; prepareDynamoChoice({ step: { flow: { advancement: hostChoices[0], level: 8 } } }); assert.equal(hostChoices[0].configuration.choices[8].replacement, true);
const researcher = get("subclass:alchemist-researcher"), research = researcher.system.advancement.find(a => a.title === "Междисциплинарные исследования");
assert.equal(research.configuration.choices[6].count, 1); assert.equal(research.configuration.choices[18].count, 1); assert.equal(research.configuration.pool.length, 34);
globalThis.Actor = class {}; globalThis.dnd5e = { settings: { rulesVersion: "modern" }, registry: { items: new Map() } }; globalThis.game = { i18n: { getListFormatter: () => ({ format: v => v.join(", ") }) } };
const variant = get("alchemist:research-discovery:haze"), original = get("alchemist:discovery:haze");
const subject = doc => ({ ...doc.system, parent: { flags: doc.flags, uuid: `Compendium.spikependium.classes.Item.${doc._id}` }, prerequisites: { ...doc.system.prerequisites, items: new Set(doc.system.prerequisites.items) } });
const actor = { items: [{ type: "subclass", system: { identifier: "alchemist-researcher" } }], identifiedItems: new Map([["subclass:alchemist-researcher", new Set(["researcher"])]]), sourcedItems: new Map(), system: { details: { level: 13 } } };
assert.equal(nativeAlchemistPrerequisites.call(subject(variant), { actor, level: 13 }).get("items").valid, true);
assert.equal(nativeAlchemistPrerequisites.call(subject(original), { actor, level: 13 }).get("items").valid, false, "research exception applies to the bonus-choice variant, not general discovery choices");
actor.identifiedItems.set(`feat:${original.system.identifier}`, new Set(["owned-original"]));
const model = subject(variant); assert.equal(alchemistDiscoveryPrerequisites.call(model, ctx => nativeAlchemistPrerequisites.call(model, ctx), { actor, level: 13 }).get("repeatable").valid, false, "one discovery cannot be learned again through a different compendium variant");
globalThis.foundry = { utils: { isEmpty: v => Object.keys(v).length === 0 } };
for (const ability of ["str", "dex", "con"]) {
  const feat = get(`subclass:alchemist-mutagenist:blood:${ability}`), advancement = structuredClone(feat.system.advancement[0]);
  assert.equal(advancement.configuration.points, 0); assert.equal(advancement.configuration.fixed[ability], 2); assert.equal(advancement.configuration.max, 22);
  for (const value of [19, 20, 21, 22]) {
    const values = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map(k => [k, { value, max: 20 }]));
    const host = { configuration: advancement.configuration, value: {}, allowFeat: false, actor: { system: { abilities: values, _source: { abilities: structuredClone(values) } }, updateSource(updates) { this.updates = updates; } }, toObject() { return advancement; }, canImprove: key => !advancement.configuration.locked.includes(key), updateSource(data) { this.value = data.value; } };
    await nativeMagusASIApply.call(host, 0, {}, { initial: true });
    assert.equal(host.actor.updates?.[`system.abilities.${ability}.value`] ?? value, Math.min(22, value + 2));
    assert.equal(Object.keys(host.actor.updates ?? {}).filter(key => !key.includes(`.${ability}.`)).length, 0);
  }
}
const mutagen = get("subclass:alchemist-mutagenist:mutagen"); for (const fx of mutagen.effects) assert.ok(fx.system.changes.some(c => c.value === "+3 <=20"));
globalThis.ui = { notifications: { warn() {} } };
const user = { isOwner: true, classes: { alchemist: { system: { levels: 2 } } }, items: [{ type: "subclass", system: { identifier: "alchemist-mutagenist" } }], effects: [] };
const claws = { ...acts(mutagen).find(a => a.type === "attack"), item: mutagen, actor: user };
assert.equal(canUseAlchemistSpecialty(claws), false); user.effects = [{ active: true, flags: { spikependium: { mutagenAbility: "str" } } }]; assert.equal(canUseAlchemistSpecialty(claws), undefined);
user.items = []; assert.equal(canUseAlchemistSpecialty(claws), false);
const bolt = get("alchemist:discovery:explosive-bolt"), marksman = { isOwner: true, classes: { alchemist: { system: { levels: 2 } } }, items: [{ type: "subclass", system: { identifier: "alchemist-marksman" } }] };
assert.equal(bolt.system.prerequisites.level, 0); assert.equal(canUseAlchemistDiscovery({ item: bolt, actor: marksman, consumption: { targets: [] } }), undefined, "automatic discovery on level 2 must remain usable before general discoveries at level 4");
console.log("Alchemist specializations: all 11 roots/54 source features, exact grants/sources/folders, 10 separate formulas, dynamo table/class-level caps/shared replacements, research exception/deduplication and fixed single-ability blood advancement passed.");
