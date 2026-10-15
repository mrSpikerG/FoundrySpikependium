import assert from "node:assert/strict";
import fs from "node:fs";
import { ALCHEMIST_CREATURES, ALCHEMIST_VESSELS } from "../src/content/alchemist-creatures.mjs";
import { prepareAlchemistCreation, prepareAlchemistSummonUpdates, recordAlchemistSummon, requireAlchemistSummonMessage,
  canPlaceAlchemistCompanion, prepareAlchemistCompanion, recordAlchemistCompanionPlaced, placeAlchemistSummons,
  alchemistSummonChatAction, canUseAlchemistCompanion, cleanAlchemistCompanions, alchemistCreationUse } from "../scripts/alchemist-creatures.mjs";
import { nativeConsumeItemUses, nativeUsesConsumption } from "./data/dnd5e-monsters-native.mjs";
import { graftActiveState, guardGraftEquip } from "../scripts/alchemist-grafts.mjs";
const docs = new Map(), uuids = new Map(), folders = new Map();
for (const pack of ["items", "classes", "subclasses", "creatures"]) for (const file of fs.readdirSync(`packs/_source/${pack}`)) {
  const d = JSON.parse(fs.readFileSync(`packs/_source/${pack}/${file}`, "utf8"));
  if (d._key.startsWith("!folders!")) folders.set(d._id, d);
  else { docs.set(d.flags.spikependium.key, d); uuids.set(`Compendium.spikependium.${pack}.${pack === "creatures" ? "Actor" : "Item"}.${d._id}`, d); }
}
const get = key => { assert.ok(docs.has(key), key); return docs.get(key); }, acts = d => Object.values(d.system.activities);
assert.equal(ALCHEMIST_CREATURES.length, 6); assert.equal(ALCHEMIST_VESSELS.length, 4);
const sourceStats = {
  homunculus: [13, 5, 0, [4, 15, 11, 10, 10, 7]], golem: [13, 76, 5, [17, 9, 18, 6, 10, 5]],
  "gray-ooze": [8, 22, 0.5, [12, 6, 16, 1, 6, 2]], "ochre-jelly": [8, 45, 2, [15, 6, 14, 2, 6, 1]],
  "gelatinous-cube": [6, 84, 2, [14, 3, 20, 1, 6, 1]], "black-pudding": [7, 85, 4, [16, 5, 16, 1, 6, 1]]
};
for (const [id, [ac, hp, cr, abilities]] of Object.entries(sourceStats)) {
  const d = get(`actor:alchemist-${id}`); assert.equal(d.system.attributes.ac.flat, ac); assert.equal(d.system.attributes.hp.max, hp); assert.equal(d.system.details.cr, cr);
  assert.deepEqual(Object.values(d.system.abilities).map(a => a.value), abilities);
  assert.equal(d.system.source.rules, "2014"); assert.ok(d.system.source.custom.startsWith("https://"));
  let parent = d.folder, found = false; while (parent) { const f = folders.get(parent); assert.ok(f); found ||= f.name === "Алхимик (Valda)"; parent = f.folder; } assert.ok(found);
  for (const item of d.items) { assert.deepEqual(item.system.source, d.system.source); for (const a of acts(item)) if (a.type === "attack") assert.equal(a.damage.includeBase, false); }
}
assert.deepEqual(get("actor:alchemist-golem").system.traits.dr.bypasses, ["mgc", "ada"]);
assert.deepEqual(get("actor:alchemist-golem").system.traits.di.value, ["lightning"]);
assert.equal(get("actor:alchemist-gray-ooze").system.skills.ste.value, 2);
for (const row of ALCHEMIST_VESSELS) {
  const d = get(`item:alchemist-${row.id}`), a = acts(d)[0]; assert.equal(d.type, "consumable"); assert.equal(d.system.uses.autoDestroy, !row.jug);
  assert.equal(d.system.price.value, row.jug ? 4000 : 2000); assert.ok(d.system.weight.value > 0); assert.match(d.system.description.value, /[Цц]ена оценочная/);
  assert.equal(a.type, "summon"); assert.equal(a.profiles.length, 1); assert.equal(uuids.get(a.profiles[0].uuid), get(`actor:alchemist-${row.creature}`));
  assert.equal(a.range.value, "20"); assert.equal(a.duration.value, "1"); assert.equal(a.duration.units, "hour");
  assert.deepEqual([a.match.attacks, a.match.saves, a.match.proficiency], [false, false, false]);
}
const getProperty = (obj, path) => path.split(".").reduce((v, k) => v?.[k], obj);
const setProperty = (obj, path, value) => { const keys = path.split("."), last = keys.pop(); let at = obj; for (const key of keys) at = at[key] ??= {}; at[last] = value; };
let nonce = 0;
globalThis.foundry = { utils: { getProperty, setProperty, randomID: () => `receipt${++nonce}`, mergeObject: Object.assign } };
globalThis.ui = { notifications: { warn() {} } };
globalThis.game = { scenes: [], time: { worldTime: 100 }, users: { activeGM: null }, user: { isActiveGM: true }, i18n: { localize: v => v } };
const world = new Map(); globalThis.fromUuidSync = uuid => world.get(uuid); globalThis.fromUuid = async uuid => world.get(uuid);
for (const [uuid, d] of uuids) world.set(uuid, { ...d, uuid, toObject: () => structuredClone(d) });
const actor = { uuid: "Actor.alchemist", isOwner: true, items: [], flags: { spikependium: {} }, classes: { alchemist: { system: { levels: 18 } } }, system: { attributes: { prof: 6 } }, async setFlag(scope, key, value) { setProperty(this, `flags.${scope}.${key}`, value); } };
world.set(actor.uuid, actor);
const reagent = { id: "reagents", system: { identifier: "alchemist-reagents", uses: { spent: 0, max: 18, value: 18 } } }; actor.items.push(reagent);
const empty = () => ({ actor: {}, item: [], create: [], delete: [], rolls: [] });
const own = d => ({ ...structuredClone(d), id: d._id, uuid: `${actor.uuid}.Item.${d._id}`, actor, toObject: () => structuredClone(d) });
const bottle = own(get("item:alchemist-bottled-ooze")); bottle.system.uses.max = 1; bottle.system.uses.value = 1;
const activity = { ...acts(bottle)[0], actor, item: bottle, id: acts(bottle)[0]._id, uuid: `${bottle.uuid}.Activity.${acts(bottle)[0]._id}` };
activity.item.flags.spikependium.alchemistMaker = actor.uuid;
const recipe = acts(get("subclass:alchemist-ooze-rancher:bottle"))[0]; recipe.actor = actor;
let updates = empty(); assert.equal(await prepareAlchemistCreation(recipe, {}, updates), false); assert.equal(updates.create.length, 0);
updates.item.push({ _id: reagent.id, "system.uses.spent": 2 }); assert.equal(await prepareAlchemistCreation(recipe, {}, updates), updates);
assert.equal(updates.create.length, 1); assert.equal(updates.create[0].flags.spikependium.alchemistMaker, actor.uuid); assert.equal(updates.create[0].system.quantity, 1);
const jugRecipe = acts(get("subclass:alchemist-ooze-rancher:jug"))[0]; jugRecipe.actor = actor;
const jug = own(get("item:alchemist-ooze-jug-black")); actor.items.push(jug);
updates = empty(); updates.item.push({ _id: reagent.id, "system.uses.spent": 4 }); assert.equal(await prepareAlchemistCreation(jugRecipe, {}, updates), false);
jug.system.uses.spent = 1; assert.equal(await prepareAlchemistCreation(jugRecipe, {}, updates), updates); assert.equal(updates.create.length, 0);
assert.equal(updates.item.at(-1)._id, jug.id); assert.equal(updates.item.at(-1).system.uses.spent, 0); assert.equal(updates.item.at(-1).system.identifier, "alchemist-ooze-jug-ochre");
const duplicate = own(get("item:alchemist-ooze-jug-cube")); duplicate.system.uses.spent = 1; actor.items.push(duplicate);
const duplicateUpdates = empty(); duplicateUpdates.item.push({ _id: reagent.id, "system.uses.spent": 4 });
assert.equal(await prepareAlchemistCreation(jugRecipe, {}, duplicateUpdates), false); actor.items = [reagent];
let finishUse; const concurrentUse = alchemistCreationUse.call(recipe, () => new Promise(resolve => { finishUse = resolve; }));
assert.equal(await alchemistCreationUse.call(recipe, () => assert.fail("concurrent brewing")), undefined); finishUse(false); await concurrentUse;
assert.equal(await alchemistCreationUse.call(recipe, async () => 7), 7, "cancellation releases the brewing lock");
async function consume(item) {
  const u = empty(), target = { item, actor, activity, resolveCost: async () => ({ total: 1 }) };
  target._usesConsumption = (...args) => nativeUsesConsumption.call(target, ...args);
  await nativeConsumeItemUses.call(target, {}, u); return u;
}
updates = await consume(bottle); assert.deepEqual(updates.delete, [bottle.id]);
const stacked = { ...bottle, system: { ...bottle.system, quantity: 2 } }, stackUse = await consume(stacked);
assert.equal(stackUse.item[0]["system.quantity"], 1); assert.equal(stackUse.item[0]["system.uses.spent"], 0);
const jugUse = await consume({ ...jug, system: { ...jug.system, uses: { ...jug.system.uses, max: 1, spent: 0, value: 1 } } });
assert.equal(jugUse.item[0]["system.uses.spent"], 1); assert.equal(jugUse.delete.length, 0);
assert.equal(prepareAlchemistSummonUpdates(activity, {}, empty()), false);
assert.equal(requireAlchemistSummonMessage(activity, {}, { create: false }), false);
prepareAlchemistSummonUpdates(activity, {}, updates); for (const [p, value] of Object.entries(updates.actor)) setProperty(actor, p, value);
const message = { data: {} }; recordAlchemistSummon(activity, {}, message); const frame = message.data.flags.spikependium.alchemistCompanion;
assert.ok(frame); assert.equal(frame.end, 3700); assert.equal(message.data.system.deltas.actor.length, 1);
const profile = activity.profiles[0]; assert.equal(canPlaceAlchemistCompanion(activity, profile), undefined);
game.time.worldTime = 3700; assert.equal(canPlaceAlchemistCompanion(activity, profile), false, "an expired unused release cannot be placed later"); game.time.worldTime = 100;
assert.equal(canPlaceAlchemistCompanion(activity, { ...profile, count: "2" }), false);
const model = raw => { const d = structuredClone(raw); d.items = d.items.map(i => ({ ...i, id: i._id, system: { ...i.system, activities: acts(i).map(a => ({ ...a, id: a._id, toObject: () => structuredClone(a) })) } })); return d; };
const makeConfig = () => ({ actor: model(get("actor:alchemist-gray-ooze")), actorUpdates: { items: [], effects: [] }, tokenUpdates: {} });
let config = makeConfig(); prepareAlchemistCompanion(activity, profile, config);
assert.equal(config.actorUpdates["system.attributes.movement.speeds.walk"], undefined, "no discovery means no rider bonuses");
actor.items.push({ system: { identifier: "alchemist-discovery-ooze-rider" } }); config = makeConfig();
prepareAlchemistCompanion(activity, profile, config); assert.equal(config.actorUpdates["system.attributes.movement.speeds.walk"], "30"); assert.equal(config.actorUpdates["system.attributes.init.roll.bonus"], "6");
const changed = Object.entries(config.actorUpdates.items[0]).find(([p]) => p.endsWith(".damage.parts"))[1]; assert.match(changed[0].bonus, /6/); assert.equal(changed[1].bonus, "", "one damage roll receives one proficiency bonus, not one per type");
assert.equal(get("actor:alchemist-gray-ooze").system.attributes.movement.speeds.walk, "10", "the library profile remains unchanged");
const stranger = { ...actor, uuid: "Actor.thrower", items: [], flags: { spikependium: {} } }; world.set(stranger.uuid, stranger);
const oldActor = activity.actor; activity.actor = stranger; assert.equal(canPlaceAlchemistCompanion(activity, profile), false); activity.actor = oldActor;
let done; const running = placeAlchemistSummons.call(activity, () => new Promise(resolve => { done = resolve; }), {});
assert.equal(await placeAlchemistSummons.call(activity, () => assert.fail("concurrent placement"), {}), undefined); done([]); await running;
const token = { flags: { spikependium: { alchemistCompanion: frame } }, actor: { flags: { spikependium: { alchemistCompanion: frame } } }, async delete() { this.deleted = true; } };
await recordAlchemistCompanionPlaced(activity, profile, [token]); assert.equal(canPlaceAlchemistCompanion(activity, profile), false);
game.scenes = [{ tokens: [token] }]; await cleanAlchemistCompanions(); assert.equal(token.deleted, undefined);
game.time.worldTime = 3700; await cleanAlchemistCompanions(); assert.equal(token.deleted, true); token.deleted = false;
game.time.worldTime = 100; setProperty(actor, `flags.spikependium.alchemistSummons.${frame.id}.paid`, 0); await cleanAlchemistCompanions(); assert.equal(token.deleted, true);
await alchemistSummonChatAction.call(activity, async () => assert.equal(canPlaceAlchemistCompanion(activity, profile), false), {}, { dataset: { action: "placeSummons" } }, { flags: message.data.flags });
const transferredItem = { ...bottle, actor: stranger, uuid: `${stranger.uuid}.Item.${bottle.id}` };
const transferred = { ...activity, actor: stranger, item: transferredItem, uuid: `${transferredItem.uuid}.Activity.${activity.id}` };
const transferredUpdates = empty(); transferredUpdates.delete.push(transferredItem.id);
prepareAlchemistSummonUpdates(transferred, {}, transferredUpdates);
for (const [p, value] of Object.entries(transferredUpdates.actor)) setProperty(stranger, p, value);
recordAlchemistSummon(transferred, {}, { data: {} }); const transferredConfig = makeConfig();
prepareAlchemistCompanion(transferred, profile, transferredConfig);
assert.equal(transferredConfig.actorUpdates["system.attributes.init.roll.bonus"], "6", "a recipient without the discovery uses the maker's rider bonus");
const golemCreate = { ...acts(get("subclass:alchemist-xenochemist:alive"))[0], actor };
token.actor.flags.spikependium.alchemistCompanion = { ...frame, kind: "golem" }; token.actor.system = { attributes: { hp: { value: 0 } } };
assert.equal(canUseAlchemistCompanion(golemCreate), false, "a saved dead body blocks creation of a second golem");
game.scenes = [];
const graftOwner = { flags: { spikependium: { key: "actor:alchemist-golem" } }, system: {}, items: [] };
for (const id of ["darkvision", "tail", "climbing", "regeneration"]) {
  const item = structuredClone(get(`item:alchemist-graft:${id}`)); item.id = item._id; item.actor = graftOwner;
  if (graftOwner.items.length === 3) assert.equal(guardGraftEquip(item, { "system.equipped": true }), false);
  item.system.equipped = true; graftOwner.items.push(item);
}
assert.ok(Object.values(graftActiveState(graftOwner)).every(v => v === false), "four imported grafts fail closed until corrected");
graftOwner.items.pop(); assert.ok(Object.values(graftActiveState(graftOwner)).every(Boolean));
console.log("Alchemist creatures: six 2014 profiles, native vessel destruction/stacks/refill, paid creation and release, replay/concurrency/refund/expiry, maker-scoped rider bonuses, exact summon profiles and three-graft cap passed.");
