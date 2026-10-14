import assert from "node:assert/strict";
import fs from "node:fs";
import { reactionAvailable, canUseReaction, reactionUse, prepareReactionUpdates, recordReaction,
  recordReactionConsumption, reactionDeltaLabel, finishReaction, resumeReactions } from "../scripts/reactions.mjs";
import { prepareResourceUpdates, showResourceConsumption } from "../scripts/resources.mjs";
import { prepareShadowConcentrationDelete } from "../scripts/dragonmark-shadow.mjs";
import { getDeltas, nativeConsume, nativeRefund, nativeEffectChanges } from "./data/dnd5e-reaction-native.mjs";
import { isExpiryEvent } from "./data/dnd5e-making-native.mjs";

const documents = new Map(); let counter = 0, writes = [], rejectCreate = false, rejectFlag = false;
const list = a => Object.assign(a, { get(id) { return this.find(e => e.id === id); }, has(id) { return !!this.get(id); } });
const get = (object, path) => path.split(".").reduce((o, k) => o?.[k], object);
const set = (object, path, value) => { const keys = path.split("."); for (const key of keys.slice(0, -1)) object = object[key] ??= {}; object[keys.at(-1)] = structuredClone(value); };
const flatten = (object, prefix = "", result = {}) => { for (const [k, v] of Object.entries(object)) {
  const path = prefix ? `${prefix}.${k}` : k;
  if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, path, result); else result[path] = v;
} return result; };
globalThis.fromUuidSync = uuid => documents.get(uuid);
globalThis.ui = { notifications: { warn() {}, error() {} } };
globalThis.foundry = { utils: { getProperty: get, setProperty: set, flattenObject: flatten, isEmpty: o => Object.keys(o).length === 0,
  randomID: () => `REACT${String(counter++).padStart(11, "0")}` } };
globalThis.ActiveEffect = { implementation: { getEffectStart(combat) { return { time: game.time.worldTime, combat: combat?.uuid, round: combat?.round, turn: combat?.turn }; } } };
globalThis.Hooks = { call(name, ...args) {
  if (name === "dnd5e.preActivityConsumption") return canUseReaction(...args);
  if (name === "dnd5e.postActivityConsumption") { recordReactionConsumption(...args); showResourceConsumption(...args); }
  return true;
} };
function setup() {
  documents.clear(); counter = 0; writes = []; rejectCreate = false; rejectFlag = false;
  const gm = { id: "gm", isGM: true, isActiveGM: true }, player = { id: "player", isGM: false };
  const users = [player, gm]; users.activeGM = null;
  const actor = { uuid: "Scene.test.Token.mount.Actor.mount", isOwner: true, inCombat: true, statuses: new Set(), flags: {}, effects: list([]), items: list([]),
    system: { isCreature: true, spells: { spell1: { value: 3 } } },
    async setFlag(module, key, value) { if (rejectFlag) { rejectFlag = false; throw Error("flag"); } set(this, `flags.${module}.${key}`, value); },
    async createEmbeddedDocuments(type, data, options) {
      assert.equal(type, "ActiveEffect"); assert.equal(options.keepId, true); if (rejectCreate) { rejectCreate = false; throw Error("create"); }
      for (const d of data) { assert.ok(!this.effects.has(d._id)); const effect = { ...structuredClone(d), id: d._id, parent: this,
        uuid: `${this.uuid}.ActiveEffect.${d._id}`, actor: this, specialDuration: d.duration.expiry };
        effect.start.combat = documents.get(effect.start.combat); this.effects.push(effect); documents.set(effect.uuid, effect); writes.push(effect.id); }
    },
    async deleteEmbeddedDocuments(type, ids) { assert.equal(type, "ActiveEffect"); for (const id of ids) {
      const effect = this.effects.get(id); if (effect) await prepareShadowConcentrationDelete.call(effect, async () => {
        this.effects.splice(this.effects.indexOf(effect), 1); documents.delete(effect.uuid);
      });
    } }
  };
  const other = { uuid: "Actor.other" }, combatant = { id: "mount", actor }, another = { id: "other", actor: other };
  const combat = { uuid: "Combat.test", id: "test", started: true, round: 1, turn: 0, turns: [another, combatant],
    getCombatantsByActor(a) { return this.turns.filter(c => c.actor === a); } };
  globalThis.game = { user: player, users, actors: [], scenes: [{ tokens: [{ actor }] }], combats: [combat], combat, time: { worldTime: 100 } };
  const item = { uuid: `${actor.uuid}.Item.shield`, id: "shield", flags: {}, type: "spell", system: { identifier: "shield" } };
  const activity = { id: "utility", item, actor, activation: { type: "reaction" }, type: "utility", flags: {}, consumption: { targets: [] },
    _mergeActivityUpdates() {}, async _prepareUsageUpdates(config) { return prepareResourceUpdates.call(this, async () => ({ actor: { "system.spells.spell1.value": actor.system.spells.spell1.value - 1 }, item: [], create: [], delete: [], rolls: [] }), config); } };
  documents.set(actor.uuid, actor); documents.set(combat.uuid, combat); documents.set(item.uuid, item);
  const apply = async updates => {
    const consumed = { actor: getDeltas(actor, updates.actor), item: {}, created: [], deleted: [] };
    for (const [key, value] of Object.entries(updates.actor)) {
      const parts = key.split(".");
      if (parts.at(-1).startsWith("-=")) delete get(actor, parts.slice(0, -1).join("."))[parts.at(-1).slice(2)];
      else set(actor, key, value);
    }
    return consumed;
  };
  const config = { consume: { action: true, resources: true } }, message = { create: true, data: { system: {} } };
  const use = async (cfg = config) => reactionUse.call(activity, async actual => {
    const updates = await nativeConsume.call(activity, actual, message, apply); if (!updates) return;
    recordReaction(activity, message); await finishReaction(activity); return { message, updates };
  }, cfg);
  return { actor, activity, combat, combatant, another, config, message, apply, use, player, gm };
}
let s = setup(); assert.equal(reactionAvailable(s.actor), true);
await s.use(); assert.equal(s.actor.system.spells.spell1.value, 2); assert.equal(reactionAvailable(s.actor), false); assert.equal(s.actor.effects.length, 1);
const id = s.actor.flags.spikependium.reactionId, effect = s.actor.effects.get(id);
assert.equal(effect.duration.expiry, "targetStart"); assert.equal(effect.system.magical, false); assert.equal(effect.start.time, 100);
assert.equal(effect.start.combat, s.combat); assert.equal(s.message.data.flags.spikependium.reaction.id, id);
assert.equal(s.message.hasConsumption, true);
assert.deepEqual(s.message.data.system.deltas.actor, [{ keyPath: "system.spells.spell1.value", delta: -1 }, { keyPath: `flags.spikependium.reactionCasts.${id}.spent`, delta: 1 }]);
const data = reactionDeltaLabel.call({ keyPath: `flags.spikependium.reactionCasts.${id}.spent` }, () => ({ label: "technical", delta: "-1" }));
assert.deepEqual(data, { label: "Реакция", delta: "-1" });
assert.deepEqual(reactionDeltaLabel.call({ keyPath: "system.spells.spell1.value" }, () => ({ label: "Slot" })), { label: "Slot" });
await s.use(); assert.equal(s.actor.system.spells.spell1.value, 2); assert.equal(writes.length, 1);
await resumeReactions(); assert.equal(writes.length, 1);
s.combat.turn = 1; assert.equal(reactionAvailable(s.actor), true);
s.combat.combatant = s.combatant; assert.equal(isExpiryEvent.call(effect, "turnStart", { combat: s.combat, round: 1, turn: 1 }), true);
await resumeReactions(); assert.equal(s.actor.effects.length, 0);
await s.actor.deleteEmbeddedDocuments("ActiveEffect", [id]); await s.use(); assert.equal(s.actor.system.spells.spell1.value, 1);
assert.equal(Object.keys(s.actor.flags.spikependium.reactionCasts).length, 1);
assert.equal(reactionAvailable(s.actor), false); s.combat.round = 2; s.combat.turn = 0; assert.equal(reactionAvailable(s.actor), false);
s.combat.turn = 1; assert.equal(reactionAvailable(s.actor), true);

s = setup(); await s.use();
await nativeRefund.call(s.activity, s.message.data.system.deltas, s.apply); assert.equal(s.actor.system.spells.spell1.value, 3); assert.equal(reactionAvailable(s.actor), true);
await resumeReactions(); assert.equal(s.actor.effects.length, 0);
await s.use(); const current = s.actor.flags.spikependium.reactionId;
await nativeRefund.call(s.activity, { actor: [{ keyPath: `flags.spikependium.reactionCasts.${id}.spent`, delta: 1 }], item: {}, created: [], deleted: [] }, s.apply);
assert.equal(s.actor.flags.spikependium.reactionId, current); assert.equal(reactionAvailable(s.actor), false);
s = setup(); s.activity._prepareUsageUpdates = config => prepareResourceUpdates.call(s.activity,
  async () => ({ actor: {}, item: [], create: [], delete: [], rolls: [] }), config);
await s.use(); assert.equal(s.actor.system.spells.spell1.value, 3); assert.equal(s.message.hasConsumption, true);
assert.equal(s.message.data.system.deltas.actor.length, 1); assert.equal(reactionAvailable(s.actor), false);

for (const cancel of [() => undefined, () => { throw Error("cancel"); }]) {
  s = setup(); try { await reactionUse.call(s.activity, async () => cancel(), s.config); } catch (e) { assert.equal(e.message, "cancel"); }
  assert.equal(s.actor.flags.spikependium, undefined); assert.equal(s.actor.effects.length, 0); await s.use(); assert.equal(writes.length, 1);
}
s = setup(); let release; const wait = new Promise(r => { release = r; });
const running = reactionUse.call(s.activity, async () => { await wait; return "first"; }, s.config);
assert.equal(await reactionUse.call(s.activity, async () => "second", s.config), undefined); release(); assert.equal(await running, "first");
await s.use(); assert.equal(writes.length, 1);
for (const status of ["incapacitated", "stunned", "paralyzed", "unconscious", "dead"]) {
  s = setup(); s.actor.statuses.add(status); assert.equal(canUseReaction(s.activity, s.config), false); assert.equal(await s.use(), undefined);
  assert.equal(s.actor.system.spells.spell1.value, 3);
}
s = setup(); await s.use({ consume: false }); assert.equal(s.actor.effects.length, 0); assert.equal(reactionAvailable(s.actor), true);
s = setup(); await s.use({ consume: { action: false } }); assert.equal(s.actor.effects.length, 0);
s = setup(); s.activity.activation.type = "action"; await s.use(); assert.equal(s.actor.effects.length, 0);
s = setup(); s.activity.type = "cast"; await s.use(); assert.equal(s.actor.effects.length, 0); // Linked Spell usage tracks its own reaction.
s = setup(); s.actor.inCombat = false; game.combats = []; game.combat = null; await s.use(); assert.equal(reactionAvailable(s.actor), false);
game.time.worldTime++; assert.equal(reactionAvailable(s.actor), true); await resumeReactions(); assert.equal(s.actor.effects.length, 0);
s = setup(); await s.use(); s.combat.started = false; assert.equal(reactionAvailable(s.actor), true);
s = setup(); s.combat.started = false; await s.use(); assert.equal(s.actor.effects.length, 1);
assert.equal(s.actor.flags.spikependium.reactionCasts[s.actor.flags.spikependium.reactionId].combat, null);
s = setup(); game.combats.push({ ...s.combat, uuid: "Combat.second" }); game.combat = null;
assert.equal(prepareReactionUpdates(s.activity, s.config, { actor: {}, item: [] }), false);
s = setup(); await s.use(); const otherView = { id: "view", started: true }; game.combat = otherView;
assert.equal(reactionAvailable(s.actor), false); s.combat.turn = 1; assert.equal(reactionAvailable(s.actor), true);

s = setup(); rejectCreate = true; await assert.rejects(s.use(), /create/); assert.equal(reactionAvailable(s.actor), false);
await resumeReactions(); assert.equal(s.actor.effects.length, 1); assert.equal(s.actor.system.spells.spell1.value, 2);
s = setup(); rejectFlag = true; await assert.rejects(s.use(), /flag/); assert.equal(s.actor.effects.length, 1);
await s.actor.deleteEmbeddedDocuments("ActiveEffect", [s.actor.effects[0].id]); assert.equal(reactionAvailable(s.actor), true);
await resumeReactions(); assert.equal(s.actor.effects.length, 0);
s = setup(); await s.use(); s.actor.effects[0].disabled = true; assert.equal(reactionAvailable(s.actor), true);
s.actor.effects[0].disabled = false; assert.equal(reactionAvailable(s.actor), false);
s = setup(); const blocker = { id: "blocker", flags: { spikependium: { noReactions: true } }, active: true, duration: {} };
s.actor.effects.push(blocker); assert.equal(reactionAvailable(s.actor), false); assert.equal(await s.use(), undefined);
blocker.active = false; assert.equal(reactionAvailable(s.actor), true); blocker.active = true;
blocker.duration.expired = true; assert.equal(reactionAvailable(s.actor), true); blocker.duration.expired = false;
blocker.duration.remaining = 0; assert.equal(reactionAvailable(s.actor), true);
s = setup(); game.users.activeGM = s.gm; await s.use(); assert.equal(s.actor.effects.length, 0); assert.equal(reactionAvailable(s.actor), false);
game.user = s.gm; await resumeReactions(); assert.equal(s.actor.effects.length, 1);
game.user = s.player; await resumeReactions(); assert.equal(s.actor.effects.length, 1);
const main = fs.readFileSync("scripts/spikependium.mjs", "utf8");
const classes = fs.readdirSync("packs/_source/subclasses").filter(f => f.endsWith(".json"))
  .map(f => JSON.parse(fs.readFileSync(`packs/_source/subclasses/${f}`, "utf8")));
for (const key of ["subclass:hell-knight:advanced-wounds", "subclass:warrior-of-venom:poison-weapon"]) {
  const feat = classes.find(d => d.flags.spikependium?.key === key); assert.ok(feat);
  const profile = feat.effects.find(e => e.flags.spikependium?.noReactions); assert.ok(profile);
  assert.ok(Object.values(feat.system.activities).some(a => a.effects.some(e => e._id === profile._id)));
  assert.equal(profile.duration.expiry, key.includes("hell-knight") ? "targetStart" : "sourceStart");
  assert.deepEqual(nativeEffectChanges.call({ duration: { getEffectData: () => ({ value: 1, units: "round" }) } }, profile), {});
}
for (const text of ['"dnd5e.preUseActivity", canUseReaction', '"dnd5e.preActivityConsumption", canUseReaction',
  '"dnd5e.postActivityConsumption", recordReactionConsumption', '"dnd5e.preCreateUsageMessage", recordReaction',
  'reactionUse.call(this,', 'reactionDeltaLabel.call(this,']) assert.ok(main.includes(text));
console.log("Reactions: native consume/refund and deltas, one reaction to next own turn, other combat/ActorDelta, no fee on cancel, same-client reservation, sourceStart semantics, outside combat/time, nonmagical effect, manual reset and partial failures, active GM priority: OK.");
