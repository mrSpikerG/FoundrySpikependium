import assert from "node:assert/strict";
import fs from "node:fs";
import { relentlessApplyDamage, relentlessUpdate, relentlessOnUpdate, recordRelentlessDamage, canUseRelentless, resumeRelentless } from "../scripts/hollow-relentless.mjs";
import { nativeApplyDamage, nativeCalculateDamage } from "./data/dnd5e-guardian-native.mjs";
import { nativeUsageUpdates } from "./data/dnd5e-monsters-native.mjs";
import { nativeConsumeSpellSlots, nativeConsumeAttribute, nativePreUpdateHP, nativeOnUpdateHP } from "./data/dnd5e-relentless-native.mjs";
import { nativeRefund } from "./data/dnd5e-reaction-native.mjs";

const data = JSON.parse(fs.readFileSync(`packs/_source/subclasses/${fs.readdirSync("packs/_source/subclasses").find(f => f.startsWith("subclass-hollow-warden-ancient-endurance_"))}`, "utf8"));
assert.equal(data.system.activities.zdFRWJNT6dAXUTOU.consumption.targets[0].target, "4");
const get = (o, p) => p.split(".").reduce((v, k) => v?.[k], o);
const set = (o, p, v) => { const keys = p.split("."); for (const k of keys.slice(0, -1)) o = o[k] ??= {}; const last = keys.at(-1);
  if (last.startsWith("-=")) delete o[last.slice(2)]; else o[last] = structuredClone(v); };
const merge = (a, b) => { for (const [k, v] of Object.entries(b)) {
  if (v && Object.getPrototypeOf(v) === Object.prototype) merge(a[k] ??= {}, v); else a[k] = v; } return a; };
const list = a => Object.assign(a, { get(id) { return this.find(v => v.id === id); } });
const flatten = (o, prefix = "", out = {}) => { for (const [k, v] of Object.entries(o)) { const p = prefix ? `${prefix}.${k}` : k;
  if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, p, out); else out[p] = v; } return out; };
let documents, replies, queries, writes, signals, serial, failCard;
globalThis.foundry = { utils: { getProperty: get, setProperty: set, mergeObject: merge, deepClone: structuredClone,
  hasProperty: (o, p) => get(o, p) !== undefined,
  flattenObject: flatten, isEmpty: o => !Object.keys(o).length, randomID: () => `RH${String(serial++).padStart(14, "0")}`, escapeHTML: s => s },
  applications: { api: { DialogV2: { async query(user, type, options) { queries.push({ user, type, options });
    const reply = replies.shift(); return typeof reply === "function" ? reply() : reply; } } } } };
globalThis.fromUuidSync = uuid => documents.get(uuid);
globalThis.ui = { notifications: { warn() {}, error() {} } };
globalThis.Hooks = { call(name, ...args) { if (name === "dnd5e.preApplyDamage") recordRelentlessDamage(...args); return true; },
  callAll(name, ...args) { signals.push({ name, args }); } };
globalThis.CONFIG = { DND5E: { activityActivationTypes: {}, spellLevels: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i, i])),
  healingTypes: { healing: {}, temphp: {} }, damageTypes: { slashing: {}, necrotic: {} } } };
Number.isNumeric = n => typeof n === "number"; Math.clamp = (n, a, b) => Math.min(Math.max(n, a), b);
function setup() {
  documents = new Map(); replies = [{ slot: "spell4" }]; queries = []; writes = []; signals = []; serial = 0; failCard = false;
  const gm = { id: "gm", isGM: true, isActiveGM: true }, player = { id: "player", active: true, isGM: false };
  const users = [gm, player]; users.activeGM = gm;
  globalThis.game = { user: gm, userId: "gm", users, actors: [], scenes: [], messages: [], settings: { get: () => false } };
  const hp = { value: 10, max: 50, temp: 4, tempmax: 0, effectiveMax: 50, get damage() { return this.max - this.value; } };
  const spells = { spell4: { max: 1, value: 1 }, spell5: { max: 1, value: 1 }, spell9: { max: 1, value: 1 }, pact: { level: 5, max: 1, value: 1 } };
  const actor = { id: "pc", uuid: "Actor.pc", name: "Ranger", isOwner: true, flags: {}, statuses: new Set(), items: list([]), classes: { ranger: { system: { levels: 15 } } },
    effects: list([]), concentration: { effects: new Set() }, testUserPermission: u => u.isGM || u.id === "player", getRollData: () => ({}),
    system: { attributes: { hp }, spells, _source: { attributes: { hp: { tempmax: 0 } } }, traits: { dm: {} } },
    changeHasEffect: () => false, changeIsIgnored: () => false, calculateDamage: nativeCalculateDamage,
    applyDamage(d, opts) { return relentlessApplyDamage.call(this, (...args) => nativeApplyDamage.call(this, ...args), d, opts); },
    _displayTokenEffect(change) { signals.push({ name: "display", change }); },
    async updateBloodied() {}, async updateDowned() { if (this.system.attributes.hp.value === 0) { this.effects.length = 0; this.concentration.effects.clear(); } },
    getConcentrationDC: damage => Math.min(30, Math.max(10, Math.floor(damage / 2))),
    async challengeConcentration(config) { signals.push({ name: "concentration", config }); },
    async setFlag(module, key, value) { return this.update({ [`flags.${module}.${key}`]: value }); },
    async update(changed, opts = {}) { return relentlessUpdate.call(this, async (changed, options) => {
      const expanded = {}; for (const [k, v] of Object.entries(flatten(changed))) set(expanded, k, v);
      const system = { attributes: this.system.attributes, parent: this };
      await nativePreUpdateHP.call(system, expanded, options, game.user);
      writes.push(structuredClone(expanded));
      for (const [k, v] of Object.entries(flatten(expanded))) set(this, k, v);
      await relentlessOnUpdate.call(this, (...args) => nativeOnUpdateHP.call(system, ...args), expanded, options, game.userId);
      return this;
    }, changed, opts); }
  };
  const mark = { uuid: "Effect.mark", system: { type: "concentrating" }, flags: { spikependium: { hollowWrath: true },
    dnd5e: { item: { data: { type: "spell", system: { identifier: "hunters-mark" } } } } }, active: true, isSuppressed: false, disabled: false, duration: { expired: false } };
  actor.effects.push(mark); actor.concentration.effects.add(mark); documents.set(mark.uuid, mark);
  const item = { uuid: "Actor.pc.Item.endurance", id: "endurance", flags: structuredClone(data.flags), system: { activities: new Map() }, toObject: () => structuredClone(data) };
  actor.items.push(item);
  for (const source of Object.values(data.system.activities)) {
    const activity = { ...structuredClone(source), id: source._id, uuid: `${item.uuid}.Activity.${source._id}`, actor, item,
      _prepareUsageUpdates: nativeUsageUpdates, async use(config, dialog, message) {
        assert.equal(canUseRelentless(this, config), true); assert.equal(config.consume, false);
        if (failCard) throw Error("card failed");
        const card = { ...message.data, id: `card${serial++}`, author: game.user }; game.messages.push(card); return { message: card };
      } };
    activity.consumption.targets = source.consumption.targets.map(t => ({ ...t, actor, activity, hasZeroCost: () => false,
      resolveLevel: ({ config }) => Number(t.target) + (config.scaling ?? 0), resolveCost: async () => ({ total: Number(t.value) }),
      consume: t.type === "spellSlots" ? nativeConsumeSpellSlots : nativeConsumeAttribute }));
    item.system.activities.set(activity.id, activity); documents.set(activity.uuid, activity);
  }
  documents.set(actor.uuid, actor); game.actors.push(actor);
  return { actor, item, mark, main: item.system.activities.get("zdFRWJNT6dAXUTOU") };
}
let s = setup();
await s.actor.applyDamage([{ type: "slashing", value: 20 }]);
assert.equal(s.actor.system.attributes.hp.value, 20); assert.equal(s.actor.system.attributes.hp.temp, 0);
assert.equal(s.actor.system.spells.spell4.value, 0); assert.equal(s.actor.effects.length, 1);
assert.equal(writes[0].system.attributes.hp.value, 20); assert.equal(writes[0].system.spells.spell4.value, 0, "HP and slot are one update");
assert.equal(queries[0].user.id, "player"); assert.equal(queries[0].type, "input");
assert.equal(signals.filter(s => s.name === "dnd5e.healActor").length, 0);
assert.equal(signals.find(s => s.name === "dnd5e.damageActor").args[1].total, -20, "replacement is actual damage, not healing");
assert.equal(signals.find(s => s.name === "concentration").config.dc, 10);
assert.equal(game.messages.length, 1); await resumeRelentless(); assert.equal(game.messages.length, 1);
assert.equal(canUseRelentless(s.main), false);
const card = game.messages[0]; await nativeRefund.call(s.main, card.system.deltas, updates => s.actor.update(updates.actor));
assert.equal(s.actor.system.spells.spell4.value, 1); assert.equal(s.actor.system.attributes.hp.value, 0);
assert.equal(s.actor.effects.length, 0); assert.equal(queries.length, 1, "refund does not prompt another rescue");

for (const slot of ["spell5", "spell9", "pact"]) {
  s = setup(); replies = [{ slot }]; await s.actor.applyDamage([{ type: "slashing", value: 20 }]);
  assert.equal(s.actor.system.spells[slot].value, 0); assert.equal(s.actor.system.spells.spell4.value, 1);
  assert.equal(s.actor.system.attributes.hp.value, slot === "spell9" ? 45 : 25);
}
for (const amount of [64, 100]) { s = setup(); await s.actor.applyDamage([{ type: "slashing", value: amount }]);
  assert.equal(queries.length, 0, "massive damage instantly kills, no rescue"); assert.equal(s.actor.system.attributes.hp.value, 0); assert.equal(s.actor.system.spells.spell4.value, 1); }
s = setup(); await s.actor.applyDamage([{ type: "slashing", value: 63 }]); assert.equal(s.actor.system.attributes.hp.value, 20, "just below instant-death threshold");
for (const reply of [null, { slot: "" }, { slot: "spell1" }]) {
  s = setup(); replies = [reply]; await s.actor.applyDamage([{ type: "slashing", value: 20 }]);
  assert.equal(s.actor.system.attributes.hp.value, 0); assert.equal(s.actor.system.spells.spell4.value, 1);
}
s = setup(); for (const slot of Object.values(s.actor.system.spells)) slot.value = 0;
await s.actor.applyDamage([{ type: "slashing", value: 20 }]); assert.equal(queries.length, 0); assert.equal(s.actor.system.attributes.hp.value, 0);
s = setup(); s.actor.classes.ranger.system.levels = 14; await s.actor.applyDamage([{ type: "slashing", value: 20 }]); assert.equal(queries.length, 0);
s = setup(); s.actor.statuses.add("antimagic"); await s.actor.applyDamage([{ type: "slashing", value: 20 }]); assert.equal(queries.length, 0);
s = setup(); s.mark.duration.expired = true; await s.actor.applyDamage([{ type: "slashing", value: 20 }]); assert.equal(queries.length, 0);
s = setup(); replies = [{ slot: "spell4", instant: true }]; await s.actor.update({ "system.attributes.hp.value": 0 });
assert.equal(s.actor.system.attributes.hp.value, 0); assert.equal(s.actor.system.spells.spell4.value, 1);
s = setup(); await s.actor.update({ system: { attributes: { hp: { value: 0 } } } }); assert.equal(s.actor.system.attributes.hp.value, 20);
s = setup(); replies = [{ slot: "spell9" }]; await s.actor.update({ "system.attributes.hp.value": 0, "system.attributes.hp.max": 20 });
assert.equal(s.actor.system.attributes.hp.value, 20, "replacement respects a maximum changed in the same update");
s = setup(); replies = [async () => { await s.actor.update({ "system.attributes.hp.value": 30 }); return { slot: "spell4" }; }];
await s.actor.applyDamage([{ type: "slashing", value: 20 }]); assert.equal(s.actor.system.attributes.hp.value, 30); assert.equal(s.actor.system.spells.spell4.value, 1);
s = setup(); replies = [() => { s.actor.system.spells.spell4.value = 0; return { slot: "spell4" }; }];
await s.actor.applyDamage([{ type: "slashing", value: 20 }]); assert.equal(s.actor.system.attributes.hp.value, 0); assert.equal(game.messages.length, 0);
s = setup(); s.actor.items.push({ system: { identifier: "relentless-hunter" }, flags: {} });
await s.actor.applyDamage([{ type: "slashing", value: 20 }]); assert.ok(!signals.some(s => s.name === "concentration"));
s = setup(); failCard = true; const prior = console.error; console.error = () => {};
await s.actor.applyDamage([{ type: "slashing", value: 20 }]); console.error = prior;
assert.equal(s.actor.system.attributes.hp.value, 20); assert.equal(s.actor.system.spells.spell4.value, 0);
failCard = false; await resumeRelentless(); assert.equal(game.messages.length, 1);
s = setup(); s.main._prepareUsageUpdates = async () => { throw Error("native preparation failed"); }; console.error = () => {};
await s.actor.applyDamage([{ type: "slashing", value: 20 }]); console.error = prior;
assert.equal(s.actor.system.attributes.hp.value, 0); assert.equal(s.actor.system.spells.spell4.value, 1);
s = setup(); let release; const waiting = new Promise(r => { release = r; }); replies = [async () => { await waiting; return { slot: "spell4" }; }];
const first = s.actor.applyDamage([{ type: "slashing", value: 20 }]), second = s.actor.applyDamage([{ type: "slashing", value: 5 }]);
await Promise.resolve(); release(); await Promise.all([first, second]); assert.equal(s.actor.system.attributes.hp.value, 15); assert.equal(queries.length, 1);
console.log("Relentless Hunt: atomic HP/slot before downed, native regular/pact costs/refund and HP hooks, temp HP/instant death, cancel/stale/serialized damage, card recovery and concentration passed.");
