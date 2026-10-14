import assert from "node:assert/strict";
import fs from "node:fs";
import { startHollowAuras, syncHollowAura, hollowAuraSources, prepareHollowSave, canUseHollowAction, hollowActionUse,
  prepareHollowActionUpdates, recordHollowActionConsumption, hollowActionDeltaLabel, prepareHollowDamage, recordHollowDamage,
  endHollowAuraEffects, resumeHollowAuras, hollowAuraChatButtons, hollowAuraChatAction } from "../scripts/hollow-aura.mjs";
import { calculateCompanionDamage } from "../scripts/companions.mjs";
import { nativeApplyDamage, nativeCalculateDamage } from "./data/dnd5e-guardian-native.mjs";
import { prepareEffectData } from "./data/dnd5e-effect-application.mjs";
import { nativeConsume, nativeRefund, getDeltas } from "./data/dnd5e-reaction-native.mjs";

const feat = JSON.parse(fs.readFileSync(`packs/_source/subclasses/${fs.readdirSync("packs/_source/subclasses").find(f => f.startsWith("subclass-hollow-warden-wrath-"))}`, "utf8"));
const profile = feat.effects.find(e => e.flags.spikependium?.hollowAuraRestriction);
assert.deepEqual(profile.duration, { value: 1, units: "turns", expiry: "turnEnd", expired: false });
assert.equal(feat.system.activities.ecemB0adIQPJprFQ.effects[0]._id, profile._id);
assert.equal(feat.system.activities.ecemB0adIQPJprFQ.effects[0].onSave, false);

const get = (o, p) => p.split(".").reduce((v, k) => v?.[k], o);
const set = (o, p, v) => { const keys = p.split("."); for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  const last = keys.at(-1); if (last.startsWith("-=")) delete o[last.slice(2)]; else o[last] = structuredClone(v); };
const flatten = (o, prefix = "", out = {}) => { for (const [k, v] of Object.entries(o)) { const p = prefix ? `${prefix}.${k}` : k;
  if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, p, out); else out[p] = v; } return out; };
const merge = (a, b) => { for (const [k, v] of Object.entries(b)) {
  if (v && Object.getPrototypeOf(v) === Object.prototype) merge(a[k] ??= {}, v); else a[k] = structuredClone(v);
} return a; };
const list = a => Object.assign(a, { get(id) { return this.find(v => v.id === id); } });
let serial, world, queries, answers, saves, failCreation, duringEffect;
globalThis.foundry = { utils: { getProperty: get, setProperty: set, flattenObject: flatten, mergeObject: merge, deepClone: structuredClone,
  isEmpty: o => !Object.keys(o).length, randomID: () => `HA${String(serial++).padStart(14, "0")}`, escapeHTML: s => s }, applications: { api: { DialogV2: {
    async query(user, type, options) { queries.push({ user, type, options }); const result = answers.shift(); return typeof result === "function" ? result() : result; }
  } } } };
globalThis.fromUuidSync = uuid => world.get(uuid);
globalThis.fromUuid = async uuid => world.get(uuid);
globalThis.ui = { notifications: { warn() {}, error() {} } };
globalThis.Hooks = { call(name, ...args) { if (name === "dnd5e.preApplyDamage") return recordHollowDamage(...args);
  if (name === "dnd5e.preActivityConsumption") return canUseHollowAction(...args);
  if (name === "dnd5e.postActivityConsumption") recordHollowActionConsumption(...args); return true; }, callAll() {} };
Number.isNumeric = n => typeof n === "number"; Math.clamp = (n, a, b) => Math.min(Math.max(n, a), b);
class D20 { constructor(total, target) { this.total = total; this.options = { target }; this._evaluated = true; }
  get isFailure() { return this.total < this.options.target; } }
class Effect {
  constructor(data, context = {}) { Object.assign(this, structuredClone(data)); this.id = data._id; this._stats ??= {};
    if (context.parent) this.uuid = `${context.parent.uuid}.ActiveEffect.${this.id}`; }
  get active() { return !this.disabled && !this.duration.expired; }
  toObject() { return Object.fromEntries(Object.entries(this).filter(([k]) => !["parent", "actor", "uuid", "id"].includes(k))); }
  static forApplication(changes) { return changes; }
  static getEffectStart(c = game.combat) { return { combat: c.id, round: c.round, turn: c.turn, time: game.time.worldTime }; }
}
globalThis.ActiveEffect = { implementation: Effect };
globalThis.ChatMessage = { implementation: { getSpeaker: ({ actor, token }) => ({ actor: actor.id, token: token.id, scene: token.parent.id }) } };
globalThis.dnd5e = { utils: { convertLength: (n, from, to) => from === to ? n : from === "m" ? n / 0.3048 : n * 0.3048 },
  dataModels: { chatMessage: { fields: { TargetsField: { getDescriptors: ts => ts.map(t => ({ token: t.uuid, actor: t.actor.uuid, name: t.name })) } } } },
  applications: { components: { EffectApplicationElement: class { async _prepareEffectData(effect, actor) {
    if (duringEffect) { const f = duringEffect; duringEffect = null; await f(); }
    return prepareEffectData.call(this, effect, actor, key => key);
  } } } } };
globalThis.CONFIG = { Dice: { D20Roll: D20, DamageRoll: { async build(config, dialog, message) {
  assert.equal(config.rolls[0].options.isCritical, false); assert.equal(dialog.configure, false);
  prepareHollowDamage(config, dialog, message);
  const id = `damage${serial++}`, card = { ...message.data, id, uuid: `ChatMessage.${id}`, author: game.user,
    rolls: [{ _evaluated: true, total: Number(config.rolls[0].parts[0]), options: config.rolls[0].options }] };
  game.messages.push(card); world.set(card.uuid, card); return card.rolls;
} } }, DND5E: { healingTypes: { healing: {}, temphp: {} }, damageTypes: { necrotic: {}, poison: {}, psychic: {}, fire: {}, slashing: {} } } };
function actor(id) {
  const hp = { value: 40, max: 40, temp: 4, tempmax: 0, effectiveMax: 40, get damage() { return this.max - this.value; } };
  const a = { id, uuid: `Actor.${id}`, isOwner: true, statuses: new Set(), effects: list([]), items: list([]), flags: {}, classes: {},
    testUserPermission: u => u?.isGM || u?.id === "owner", getRollData: () => ({}), changeIsIgnored: () => false,
    system: { isCreature: true, attributes: { hp, ac: { value: 14 } }, _source: { attributes: { hp: { tempmax: 0 } } },
      traits: { dr: { value: new Set() }, di: { value: new Set() }, dv: { value: new Set() }, dm: {} } },
    changeHasEffect(kind, damage, { options }) {
      if (options.ignore === true || options.ignore?.[kind] === true || options.ignore?.[kind]?.has(damage.type)) return false;
      const values = this.system.traits[{ resistance: "dr", immunity: "di", vulnerability: "dv" }[kind]]?.value;
      return values?.has(damage.type) || values?.has("ALL");
    },
    calculateDamage(d, options) { return calculateCompanionDamage.call(this, (...args) => nativeCalculateDamage.call(this, ...args), d, options); },
    applyDamage: nativeApplyDamage,
    async update(updates) { for (const [k, v] of Object.entries(updates)) set(this, k, v); return this; },
    async createEmbeddedDocuments(type, data) { for (const d of data) { const e = new Effect({ ...d, _id: foundry.utils.randomID() }); this.effects.push(e); } },
    async updateEmbeddedDocuments(type, data) { for (const d of data) Object.assign(this.effects.get(d._id), structuredClone(d)); },
    async deleteEmbeddedDocuments(type, ids) { this.effects.splice(0, this.effects.length, ...this.effects.filter(e => !ids.includes(e.id))); }
  }; world.set(a.uuid, a); return a;
}
function setup(level = 11) {
  serial = 0; world = new Map(); queries = []; answers = [{ damage: "necrotic" }]; saves = []; failCreation = false; duringEffect = null;
  const gm = { id: "gm", isGM: true, isActiveGM: true }, owner = { id: "owner", active: true, isGM: false };
  const users = [gm, owner]; users.activeGM = gm;
  globalThis.game = { user: gm, users, messages: list([]), actors: [], scenes: [], combats: [], time: { worldTime: 100 } };
  const caster = actor("caster"), enemy = actor("enemy"); caster.classes.ranger = { system: { levels: level } };
  const grid = { size: 100, distance: 5, units: "ft", measurePath: ([a, b]) => ({ distance: Math.hypot(a.x - b.x, a.y - b.y, (a.elevation - b.elevation) * 20) / 20 }) };
  const scene = { id: "scene", grid, tokens: [] }; game.scenes.push(scene); game.actors.push(caster, enemy);
  const token = (id, a, x, disposition) => { const t = { id, uuid: `Scene.scene.Token.${id}`, name: id, actor: a, x, y: 0, elevation: 0, disposition, parent: scene,
    getOccupiedGridSpaceOffsets: () => [], getCenterPoint() { return { x: this.x, y: this.y, elevation: this.elevation }; } };
    scene.tokens.push(t); world.set(t.uuid, t); return t; };
  const source = token("caster", caster, 0, 1), target = token("enemy", enemy, 100, -1);
  const combat = { id: "combat", uuid: "Combat.combat", round: 1, turn: 0, started: true, flags: {}, combatant: { token: target, actor: enemy },
    async setFlag(module, key, value) { set(this.flags, `${module}.${key}`, value); } };
  game.combat = combat; game.combats.push(combat); world.set(combat.uuid, combat);
  caster.effects.push({ system: { type: "concentrating" }, flags: { spikependium: { hollowWrath: true }, dnd5e: { item: { data: { type: "spell", system: { identifier: "hunters-mark" } } } } },
    uuid: "Effect.mark", disabled: false, duration: { expired: false }, isSuppressed: false });
  const item = { uuid: "Actor.caster.Item.wrath", flags: { spikependium: { key: feat.flags.spikependium.key } }, effects: list([]), system: { activities: new Map() }, toObject: () => structuredClone(feat) };
  const effect = new Effect(profile); effect.uuid = `${item.uuid}.ActiveEffect.${profile._id}`; item.effects.push(effect);
  world.set("Compendium.spikependium.subclasses.Item.3cMiDKhuk0lRx5dv", { effects: [effect] });
  const activity = { id: "ecemB0adIQPJprFQ", uuid: `${item.uuid}.Activity.ecemB0adIQPJprFQ`, actor: caster, item, save: { dc: { value: 16 } },
    effects: [{ _id: profile._id }], getAppliedEffectChanges: () => ({}),
    async use(config, dialog, message) {
      if (failCreation) return;
      assert.equal(config.consume, false); assert.equal(config.subsequentActions, false);
      const id = foundry.utils.randomID(), origin = { ...message.data, id, uuid: `ChatMessage.${id}`, type: "usage", author: game.user,
        whisper: message.rollMode === "gm" ? ["gm"] : [], blind: false, getAssociatedActor: () => caster,
        getAssociatedItem: () => item, getAssociatedActivity: () => activity, getAssociatedRolls: () => saves.filter(s => s.getOriginatingMessage() === origin),
        async setFlag(module, key, value) { set(this.flags, `${module}.${key}`, value); } };
      game.messages.push(origin); world.set(origin.uuid, origin); return { message: origin };
    } };
  item.system.activities.set(activity.id, activity); caster.items.push(item);
  const sinisterItem = { flags: { spikependium: { key: "subclass:hollow-warden:rot-and-ruin" } }, system: { activities: new Map() } };
  const sinister = { id: "DvHqI92KOqKrJqGx", uuid: "Activity.sinister", actor: caster, item: sinisterItem, messageSources: { activity: { uuid: "Activity.sinister" } } };
  sinisterItem.system.activities.set(sinister.id, sinister); caster.items.push(sinisterItem); world.set(sinister.uuid, sinister);
  return { caster, enemy, source, target, activity, combat, sinister };
}
async function save(s, total = 8) {
  const origin = game.messages.find(m => m.flags.spikependium?.hollowAura);
  const id = foundry.utils.randomID(), m = { id, uuid: `ChatMessage.${id}`, type: "save", author: game.users[1], flags: {}, system: { ability: "wis" },
    rolls: [new D20(total, 16)], getAssociatedToken: () => s.target, getOriginatingMessage: () => origin,
    speaker: { actor: s.enemy.id }, whisper: [], blind: false,
    updateSource(update) { Object.assign(this, update); } };
  saves.push(m); game.messages.push(m); world.set(m.uuid, m); prepareHollowSave(m); return m;
}
let s = setup();
assert.equal(hollowAuraSources(s.target).length, 1);
const linked = { ...s.source, id: "linked", uuid: "Scene.scene.Token.linked" }; s.source.parent.tokens.push(linked);
assert.equal(hollowAuraSources(s.target).length, 1, "linked duplicate tokens are one source"); s.source.parent.tokens.pop();
s.source.x = -200; assert.equal(hollowAuraSources(s.target).length, 0); s.source.x = 0;
s.source.elevation = 20; assert.equal(hollowAuraSources(s.target).length, 0); s.source.elevation = 0;
s.source.disposition = -1; assert.equal(hollowAuraSources(s.target).length, 0); s.source.disposition = 1;
s.caster.statuses.add("antimagic"); assert.equal(hollowAuraSources(s.target).length, 0); s.caster.statuses.clear();
s.caster.statuses.add("incapacitated"); assert.equal(hollowAuraSources(s.target).length, 0); s.caster.statuses.clear();
await startHollowAuras(s.combat, { turn: 0 }); await startHollowAuras(s.combat, { turn: 0 }); assert.equal(game.messages.length, 1);
const action = { actor: s.enemy, type: "utility", activation: { type: "action" }, item: {} };
assert.equal(canUseHollowAction(action), false, "unresolved mandatory save blocks actions");
let m = await save(s); await syncHollowAura(m);
assert.equal(s.enemy.effects.length, 1); assert.equal(s.enemy.effects[0].duration.units, "turns"); assert.equal(s.enemy.effects[0].duration.value, 1);
assert.equal(s.enemy.system.attributes.hp.value, 33); assert.equal(s.enemy.system.attributes.hp.temp, 0);
assert.equal(queries[0].user.id, "owner"); assert.equal(queries[0].type, "input");
assert.equal(canUseHollowAction(action), true);
const damage = game.messages.find(m => m.type === "damage");
await s.enemy.applyDamage([{ type: "necrotic", value: 11 }], { originatingMessage: damage });
assert.equal(s.enemy.system.attributes.hp.value, 33, "same aura damage cannot be reapplied");
await resumeHollowAuras(); assert.equal(game.messages.filter(m => m.type === "damage").length, 1);
await save(s, 20); await syncHollowAura(saves.at(-1)); assert.equal(s.enemy.effects.length, 0, "changed success removes restriction");
s.combat.turn++; await endHollowAuraEffects(); assert.equal(s.enemy.effects.length, 0);

for (const type of ["necrotic", "poison", "psychic"]) for (const trait of ["resistance", "ALL", "immunity", "vulnerability"]) {
  s = setup(); answers = [{ damage: type }];
  s.enemy.system.traits[trait === "immunity" ? "di" : trait === "vulnerability" ? "dv" : "dr"].value.add(trait === "ALL" ? "ALL" : type);
  await startHollowAuras(s.combat, { turn: 0 }); m = await save(s); await syncHollowAura(m);
  assert.equal(s.enemy.system.attributes.hp.value, trait === "immunity" ? 40 : trait === "vulnerability" ? 22 : 33, `${type}/${trait}`);
  assert.equal(s.enemy.system.attributes.hp.temp, trait === "immunity" ? 4 : 0);
  if (trait === "ALL") assert.ok(s.enemy.system.traits.dr.value.has("ALL"), "resistance trait is restored");
}
s = setup(7); await startHollowAuras(s.combat, { turn: 0 }); m = await save(s); await syncHollowAura(m);
assert.equal(game.messages.filter(m => m.type === "damage").length, 0); assert.equal(s.enemy.effects.length, 1);
s.combat.turn++; await endHollowAuraEffects(); assert.equal(s.enemy.effects.length, 0, "restriction removed at end of the same turn");
s = setup(); answers = [null]; await startHollowAuras(s.combat, { turn: 0 }); m = await save(s); await syncHollowAura(m);
assert.equal(s.enemy.system.attributes.hp.value, 40); assert.equal(canUseHollowAction({ ...action, actor: s.enemy }), false);
const parent = m.getOriginatingMessage();
const buttons = hollowAuraChatButtons.call(s.activity, () => [], parent); assert.equal(buttons.length, 2);
answers = [{ damage: "poison" }]; await hollowAuraChatAction.call(s.activity, () => {}, {}, { dataset: { action: "hollowFinishAura" } }, parent);
assert.equal(s.enemy.system.attributes.hp.value, 33);
s = setup(); answers = [null]; await startHollowAuras(s.combat, { turn: 0 }); m = await save(s); await syncHollowAura(m);
await hollowAuraChatAction.call(s.activity, () => {}, {}, { dataset: { action: "hollowManualAura" } }, m.getOriginatingMessage());
assert.equal(canUseHollowAction({ ...action, actor: s.enemy }), true); await resumeHollowAuras(); assert.equal(s.enemy.system.attributes.hp.value, 40);
s = setup(); s.source.hidden = true; await startHollowAuras(s.combat, { turn: 0 }); m = await save(s);
assert.deepEqual(m.whisper, ["gm"]); await syncHollowAura(m); assert.equal(queries[0].user.id, "gm");
s = setup(); s.target.disposition = 0; answers = [false]; await startHollowAuras(s.combat, { turn: 0 }); assert.equal(game.messages.length, 0);
s = setup(); game.user = game.users[1]; await startHollowAuras(s.combat, { turn: 0 }); assert.equal(game.messages.length, 0);
s = setup(); await startHollowAuras(s.combat, { turn: 0 }, { direction: -1 }); assert.equal(game.messages.length, 0);
s = setup(); failCreation = true; const priorError = console.error; console.error = () => {};
await startHollowAuras(s.combat, { turn: 0 }); console.error = priorError; assert.equal(s.combat.flags.spikependium.hollowAuras.events.length, 0);
s = setup(); await startHollowAuras(s.combat, { turn: 0 }); m = await save(s, 20); await syncHollowAura(m);
assert.equal(s.enemy.effects.length, 0); assert.equal(s.enemy.system.attributes.hp.value, 40);
s = setup(); await startHollowAuras(s.combat, { turn: 0 }); m = await save(s); m.author = { id: "intruder" }; await syncHollowAura(m);
assert.equal(s.enemy.effects.length, 0); assert.equal(canUseHollowAction({ ...action, actor: s.enemy }), false);
s = setup(); await startHollowAuras(s.combat, { turn: 0 }); m = await save(s);
duringEffect = async () => { m.system.forceSuccess = true; await syncHollowAura(m); };
await syncHollowAura(m); assert.equal(s.enemy.effects.length, 0); assert.equal(s.enemy.system.attributes.hp.value, 40);
s = setup(); await startHollowAuras(s.combat, { turn: 0 }); m = await save(s);
answers = [() => { s.combat.turn++; return { damage: "psychic" }; }]; await syncHollowAura(m);
assert.equal(s.enemy.system.attributes.hp.value, 40); await endHollowAuraEffects(); assert.equal(s.enemy.effects.length, 0);
s = setup(); await startHollowAuras(s.combat, { turn: 0 }); m = await save(s); world.delete(s.source.uuid); world.delete(s.sinister.uuid);
await syncHollowAura(m); assert.equal(s.enemy.system.attributes.hp.value, 33, "captured trigger survives deleted source token/activity");
s = setup(); s.activity.item.effects.length = 0; await startHollowAuras(s.combat, { turn: 0 }); m = await save(s); await syncHollowAura(m);
assert.equal(s.enemy.effects.length, 1); assert.equal(s.enemy.system.attributes.hp.value, 33, "legacy feat borrows current profile without replacing its item");
s = setup(); await startHollowAuras(s.combat, { turn: 0 }); m = await save(s); answers = [{ damage: "fire" }]; await syncHollowAura(m);
assert.equal(s.enemy.system.attributes.hp.value, 40, "untrusted damage type is rejected");
const unrelated = actor("other");
assert.equal(recordHollowDamage(unrelated, 11, {}, { originatingMessage: { author: game.user, flags: { spikependium: { hollowSinister: { origin: m.getOriginatingMessage().uuid, type: "necrotic" } } } } }), false);
const badMarker = { flags: { spikependium: { ignoreResistanceTypes: "necrotic" } } };
s.enemy.system.traits.dr.value.add("necrotic");
assert.equal(s.enemy.calculateDamage([{ type: "necrotic", value: 10 }], { originatingMessage: badMarker }).amount, 5);

// Native consumption/refund: two actions still forbid a bonus until both consumptions are refunded.
s = setup(7); await startHollowAuras(s.combat, { turn: 0 }); m = await save(s); await syncHollowAura(m);
const base = { actor: s.enemy, item: {}, type: "utility", activation: { type: "action" },
  _prepareUsageUpdates: async function(config) { return prepareHollowActionUpdates(this, config, { actor: {}, item: [], create: [], delete: [], rolls: [] }); } };
const apply = async updates => { const deltas = getDeltas(s.enemy, updates.actor); await s.enemy.update(updates.actor); return { actor: deltas, item: {} }; };
const messages = [];
for (let i = 0; i < 2; i++) { const message = { data: { system: {} } }; await nativeConsume.call(base, {}, message, apply); messages.push(message); }
const bonus = { ...base, activation: { type: "bonus" } };
assert.equal(canUseHollowAction(bonus), false); assert.equal(canUseHollowAction({ ...base, activation: { type: "reaction" } }), true);
await nativeRefund.call(base, messages[0].data.system.deltas, apply); assert.equal(canUseHollowAction(bonus), false);
await nativeRefund.call(base, messages[1].data.system.deltas, apply); assert.equal(canUseHollowAction(bonus), true);
const bonusMessage = { data: { system: {} } }; await nativeConsume.call(bonus, {}, bonusMessage, apply); assert.equal(canUseHollowAction(base), false);
assert.equal(canUseHollowAction(base, { consume: { action: false } }), true); assert.equal(canUseHollowAction({ ...base, type: "cast" }), true);
assert.equal(hollowActionDeltaLabel.call({ keyPath: bonusMessage.data.system.deltas.actor[0].keyPath }, () => ({})).label, "Тревожная аура: выбор вида действия");
await nativeRefund.call(bonus, bonusMessage.data.system.deltas, apply);
let release; const wait = new Promise(r => { release = r; });
const running = hollowActionUse.call(base, async () => { await wait; return "first"; }, {});
assert.equal(await hollowActionUse.call(base, async () => "second", {}), undefined); release(); assert.equal(await running, "first");
s.combat.turn++; assert.equal(canUseHollowAction(base), true); await endHollowAuraEffects(); assert.equal(s.enemy.effects.length, 0);
console.log("Hollow auras: turn-start sources, native effect application, action/bonus consumption/refund, typed damage/resistance/immunity/temp HP, cancellation/resume, privacy and stale/repeated cards passed.");
