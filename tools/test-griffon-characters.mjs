import assert from "node:assert/strict";
import fs from "node:fs";
import { srdSpellUuid } from "./lib/core.mjs";
import { GRIFFON_SUBCLASSES } from "../src/content/subclasses-griffon.mjs";
import { GRIFFON_CHARACTERS_URL } from "../src/content/griffonid.mjs";
import { auraActive, prepareAuraCondition } from "../scripts/effects.mjs";
const docs = new Map(), uuids = new Map(), folders = new Map();
for (const pack of ["species", "subclasses"]) for (const name of fs.readdirSync(`packs/_source/${pack}`)) {
  const doc = JSON.parse(fs.readFileSync(`packs/_source/${pack}/${name}`, "utf8"));
  if (doc._key.startsWith("!folders!")) folders.set(doc._id, doc);
  else { docs.set(doc.flags.spikependium.key, doc); uuids.set(`Compendium.spikependium.${pack}.Item.${doc._id}`, doc); }
}
const get = key => { assert.ok(docs.has(key), key); return docs.get(key); };
const species = get("species:griffonid");
assert.equal(species.type, "race"); assert.equal(species.system.type.value, "humanoid");
assert.equal(species.system.movement.speeds.walk, 30); assert.equal(species.system.senses.ranges.darkvision, 60);
assert.deepEqual(species.system.advancement.find(a => a.type === "Size").configuration.sizes, ["med"]);
assert.equal(species.system.advancement.find(a => a.type === "Trait").configuration.choices[0].count, 2);
const ability = species.system.advancement.find(a => a.type === "ItemChoice"); assert.equal(ability.configuration.pool.length, 3);
for (const [index, chosenAbility] of ["int", "wis", "cha"].entries()) for (let bird = 0; bird < 3; bird++) for (let cat = 0; cat < 3; cat++) {
  for (const level of [1, 3, 5]) {
    const selectedSpells = [], casts = [];
    const add = doc => {
      if (doc.type === "feat" && doc.system.advancement.length) assert.equal(doc.system.type.value, "feat", "nested heritage advances with character level even in multiclass characters");
      for (const activity of Object.values(doc.system.activities ?? {})) if (activity.type === "cast" && (activity.visibility.level.min ?? 0) <= level) casts.push(activity);
      for (const advancement of doc.system.advancement ?? []) {
        if ((advancement.level ?? 0) > level) continue;
        const config = advancement.configuration;
        const include = uuid => {
          if (uuids.has(uuid)) add(uuids.get(uuid));
          else { assert.ok(uuid.startsWith("Compendium.dnd5e.spells24.Item.")); selectedSpells.push({ uuid, ability: config.spell.ability }); }
        };
        if (advancement.type === "ItemGrant") config.items.forEach(i => include(i.uuid));
        if (advancement.type === "ItemChoice") {
          assert.equal(config.allowDrops, false); assert.equal(config.choices["0"].count, 1);
          const choice = doc === species ? index : config.type === "spell" ? bird : cat;
          include(config.pool[choice].uuid);
        }
      }
    };
    add(species);
    assert.equal(selectedSpells.length, level === 1 ? 2 : level === 3 ? 3 : 4);
    assert.equal(new Set(selectedSpells.map(s => s.uuid)).size, selectedSpells.length);
    for (const spell of selectedSpells) assert.deepEqual(spell.ability, [chosenAbility], "all heritage spells use the one selected ability");
    assert.ok(selectedSpells.some(s => s.uuid === srdSpellUuid("Identify")));
    assert.equal(casts.length, level === 1 ? 1 : level === 3 ? 2 : 3);
    assert.equal(new Set(casts.map(a => a._id)).size, casts.length, "each free spell has an independent resource");
    for (const cast of casts) {
      assert.equal(cast.spell.ability, chosenAbility); assert.ok(selectedSpells.some(s => s.uuid === cast.spell.uuid));
      assert.deepEqual(cast.spell.properties, ["material"], "free casting removes materials");
      assert.equal(cast.consumption.spellSlot, false); assert.equal(cast.uses.max, "1");
      assert.equal(cast.uses.recovery[0].period, "lr"); assert.equal(cast.consumption.targets[0].type, "activityUses");
    }
  }
}
const levels = {
  choreography: { 3: 2, 6: 1, 14: 1 }, glacier: { 3: 2, 6: 1, 10: 1, 14: 1 }, "couatl-herald": { 3: 2, 7: 1, 10: 1, 15: 1, 18: 1 },
  materializer: { 3: 2, 6: 1, 10: 1, 14: 1 }, unbroken: { 3: 3, 6: 1, 10: 1, 14: 1 }, "astral-domain": { 3: 3, 6: 1, 17: 1 },
  "astral-griffon": { 3: 3, 6: 1, 10: 1, 14: 1 }, heavens: { 3: 2, 6: 1, 11: 1, 17: 1 }, hearth: { 3: 2, 7: 1, 15: 1, 20: 1 },
  runetagger: { 3: 2, 9: 1, 13: 1, 17: 1 }, "winter-trapper": { 3: 2, 7: 1, 11: 1, 15: 1 }, frost: { 3: 3, 6: 1, 14: 1, 18: 1 }
};
assert.equal(GRIFFON_SUBCLASSES.length, 12);
const characterSource = JSON.parse(fs.readFileSync("tools/data/external-content-inventory.json", "utf8")).sources.find(s => s.id === "GS1").characterOptions;
assert.equal(characterSource.url, GRIFFON_CHARACTERS_URL);
assert.deepEqual(characterSource.sourceHeadings, ["Грифонид", ...GRIFFON_SUBCLASSES.map(([, name, , cls]) => `${name} [${cls}]`)], "fresh source chapter has no missing species or subclass");
const assigned = new Set();
for (const [id, , cls] of GRIFFON_SUBCLASSES) {
  const root = get(`subclass:gs1-${id}`); assert.equal(root.type, "subclass"); assert.equal(root.system.classIdentifier, cls);
  const counts = {};
  for (const advancement of root.system.advancement.filter(a => a.type === "ItemGrant")) {
    for (const { uuid } of advancement.configuration.items) {
      if (!uuids.has(uuid)) continue;
      const feat = uuids.get(uuid); assert.equal(feat.type, "feat"); assert.ok(!assigned.has(uuid)); assigned.add(uuid);
      assert.equal(feat.system.prerequisites.level, advancement.level);
      counts[advancement.level] = (counts[advancement.level] ?? 0) + 1;
    }
  }
  assert.deepEqual(counts, levels[id], `${id}: every source feature is granted at the correct class level`);
}
for (const doc of docs.values()) {
  if (!doc.flags.spikependium.key.startsWith("species:griffonid") && !doc.flags.spikependium.key.startsWith("subclass:gs1-")) continue;
  assert.equal(doc.system.source.custom, GRIFFON_CHARACTERS_URL); assert.equal(doc.system.source.rules, "2024"); assert.equal(doc.system.source.page, "");
  assert.ok(/[а-яё]/i.test(doc.name)); assert.ok(!doc.system.description.value.includes("Перевод: Koroz"));
  let current = doc.folder, parts = [];
  while (current) { assert.ok(folders.has(current)); const f = folders.get(current); parts.push(f.name); current = f.folder; }
  assert.ok(parts.includes("Хоумбрю")); assert.ok(parts.includes("Сумка грифона — книга 1"));
  for (const match of doc.system.description.value.matchAll(/@UUID\[[^\]]+\]\{([^}]+)\}/g)) assert.match(match[1], /[а-яё]/i);
  for (const activity of Object.values(doc.system.activities ?? {})) {
    for (const target of activity.consumption.targets) {
      assert.notEqual(target.target, "feat:channel-divinity", "resource uses class-specific identifiers");
      if (target.type === "itemUses" && target.target.startsWith("feat:gs1-")) assert.ok([...docs.values()].some(d => d.system.identifier === target.target.slice(5)), target.target);
    }
    for (const profile of activity.effects ?? []) assert.ok(doc.effects.some(e => e._id === profile._id));
    if (activity.flags?.spikependium?.ownTurn) assert.equal(activity.flags.spikependium.oncePerTurn, true);
  }
}
assert.ok(get("subclass:gs1-frost:body").effects[0].system.changes.some(c => c.key === "system.attributes.hp.bonuses.overall" && c.value.includes("@classes.sorcerer.levels")));
assert.equal(get("subclass:gs1-runetagger:runes").effects[0].flags.spikependium.noReactions, true);
assert.equal(get("subclass:gs1-astral-domain:void").system.activities[Object.keys(get("subclass:gs1-astral-domain:void").system.activities)[0]].consumption.targets[0].target, "feat:channel-divinity-cleric");
const warmth = get("subclass:gs1-hearth:warmth"), source = { uuid: "Actor.paladin", statuses: new Set(), classes: { paladin: { system: { levels: 7 } } }, effects: [], getActiveTokens: () => [] };
const origin = { actor: source, item: { id: warmth._id, uuid: `Actor.paladin.Item.${warmth._id}` } };
source.effects = [{ ...warmth.effects[0], system: { origin: { activity: `.Item.${warmth._id}.Activity.self` } }, duration: {} }];
const allyEffect = { ...warmth.effects[0], parent: {} };
assert.equal(auraActive(allyEffect, origin, 10), true); assert.equal(auraActive(allyEffect, origin, 11), false);
source.classes.paladin.system.levels = 18; assert.equal(auraActive(allyEffect, origin, 30), true);
source.statuses.add("unconscious"); assert.equal(auraActive(allyEffect, origin, 1), false); source.statuses.clear();
globalThis.fromUuidSync = (uuid, options) => { assert.equal(options.relative, source); assert.equal(options.strict, false); return origin; };
assert.equal(prepareAuraCondition.call({ parent: { ...source.effects[0], parent: source } }, data => data.spikependium.auraActive, {}), true);
console.log("GS1 characters: 27 heritage combinations at levels 1/3/5, independent free casts, 12 subclasses and all 63 feature levels, sources/folders/resource links, relative-origin aura suppression passed.");
