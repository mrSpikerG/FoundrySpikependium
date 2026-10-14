import assert from "node:assert/strict";
import fs from "node:fs";
import { performerDodgeDamage, performerDodgeUse, prepareDodgeUpdates } from "../scripts/performer-dodge.mjs";
import { prepareReactionUpdates } from "../scripts/reactions.mjs";
import { attackSignature } from "../scripts/attack-source.mjs";
import { nativeApplyDamage, nativeCalculateDamage } from "./data/dnd5e-guardian-native.mjs";

const docs = new Map();
const get = (o, path) => path.split(".").reduce((v, k) => v?.[k], o);
const set = (o, path, value) => { const keys = path.split("."); for (const k of keys.slice(0, -1)) o = o[k] ??= {}; o[keys.at(-1)] = value; };
const list = a => Object.assign(a, { get(id) { return this.find(d => d.id === id); } });
class D20 { constructor() { this._evaluated = true; this.total = 20; } toJSON() { return { total: this.total }; } }
Math.clamp = (n, min, max) => Math.max(min, Math.min(n, max)); Number.isNumeric = n => typeof n === "number";
globalThis.fromUuidSync = uuid => docs.get(uuid);
globalThis.Hooks = { call: () => true, callAll() {} };
globalThis.ui = { notifications: { warn() {} } };
globalThis.CONFIG = { Dice: { D20Roll: D20 }, DND5E: { damageTypes: { slashing: {}, fire: {}, psychic: {} }, healingTypes: { healing: {}, temphp: {} } } };
globalThis.foundry = { utils: { deepClone: structuredClone, randomID: () => "DODGE00000000001", escapeHTML: s => s } };
globalThis.ActiveEffect = { implementation: { getEffectStart: () => ({ time: 100 }) } };
function setup() {
  docs.clear(); let prompts = 0, uses = 0, writes = 0, reject = false, mutate = false, accept = true;
  const gm = { id: "gm", isGM: true }, users = list([gm]); users.activeGM = gm;
  globalThis.game = { user: gm, users, combats: [], scenes: [], time: { worldTime: 100 }, messages: [] };
  const hp = { value: 27, max: 27, temp: 4, tempmax: 0, damage: 0 };
  const actor = { uuid: "Actor.artist", isOwner: true, flags: { spikependium: { key: "actor:mm25:performer" } },
    statuses: new Set(), effects: list([]), items: [], system: { isCreature: true, attributes: { hp }, _source: { attributes: { hp } }, traits: {} },
    getRollData: () => ({}), changeIsIgnored: () => false, changeHasEffect: () => false,
    async update(updates) { for (const [path, value] of Object.entries(updates)) {
      const keys = path.split("."); if (keys.at(-1).startsWith("-=")) delete get(this, keys.slice(0, -1).join("."))[keys.at(-1).slice(2)];
      else set(this, path, value);
    } hp.damage = hp.max - hp.value; writes++; }
  };
  const token = { uuid: "Scene.scene.Token.artist", actor }, attacker = { name: "Attacker", testUserPermission: user => user === gm };
  const attackActivity = { uuid: "Actor.attacker.Item.sword.Activity.attack", name: "Sword" };
  const attack = { id: "hit", uuid: "ChatMessage.hit", type: "attack", author: gm, rolls: [new D20()],
    system: { targets: [{ token: token.uuid, actor: actor.uuid, ac: 13 }] }, flags: {},
    getAssociatedActivity: () => attackActivity, getAssociatedActor: () => attacker };
  const message = { type: "damage", system: {}, flags: { spikependium: { attackSource: { message: attack.uuid, signature: attackSignature(attack) } } },
    getAssociatedActivity: () => attackActivity };
  const activity = { id: "QuImfAi59iGAiAkW", type: "utility", actor, activation: { type: "reaction" },
    item: { uuid: "Actor.artist.Item.dodge" }, flags: {},
    async use(config) { return performerDodgeUse.call(this, async c => {
      uses++; if (reject) return;
      let updates = prepareReactionUpdates(this, c, { actor: {}, item: [] });
      updates = prepareDodgeUpdates(this, c, updates); if (!updates) return;
      await actor.update(updates.actor); if (mutate) attack.rolls[0].total = 2;
      return { message: {} };
    }, config); }
  };
  actor.items = [{ system: { activities: [activity] } }];
  actor.calculateDamage = (damages, options) => nativeCalculateDamage.call(actor, damages, options);
  for (const d of [actor, token, attack]) docs.set(d.uuid, d);
  game.messages = [attack];
  foundry.applications = { api: { DialogV2: {
    async confirm() { prompts++; return accept; }, async wait() { return accept ? attack.id : null; }
  } } };
  const apply = (damage = [{ value: 11, type: "slashing" }], options = {}) => performerDodgeDamage.call(actor,
    (d, o) => nativeApplyDamage.call(actor, d, o), damage, { originatingMessage: message, ...options });
  return { actor, hp, attack, message, activity, token, apply,
    get prompts() { return prompts; }, get uses() { return uses; }, get writes() { return writes; },
    reject: () => { reject = true; }, mutate: () => { mutate = true; }, decline: () => { accept = false; } };
}
{
  const f = setup(); await f.apply(); assert.equal(f.hp.value, 26); assert.equal(f.hp.temp, 0);
  assert.equal(f.prompts, 1); assert.equal(f.uses, 1); assert.equal(f.writes, 2);
  assert.equal(f.actor.flags.spikependium.reactionCasts.DODGE00000000001.uncannyDodge.attack, f.attack.uuid);
  await f.apply(); assert.equal(f.hp.value, 21); assert.equal(f.uses, 1); assert.equal(f.prompts, 1);
  f.actor.flags.spikependium.reactionCasts.DODGE00000000001.spent = 0;
  f.decline(); await f.apply(); assert.equal(f.hp.value, 10, "refund disables the bound reduction");
}
{
  const f = setup(); f.actor.changeHasEffect = (kind, d) => kind === "resistance" && d.type === "fire";
  await f.apply([{ value: 9, type: "fire" }, { value: 7, type: "psychic" }]);
  assert.equal(f.hp.value, 26); assert.equal(f.hp.temp, 0, "native per-type resistance and aggregate rounding are preserved");
}
{
  const f = setup(); f.actor.changeHasEffect = kind => kind === "immunity";
  await f.apply(); assert.equal(f.hp.value, 27); assert.equal(f.hp.temp, 4);
}
{
  const f = setup(); f.actor.system.attributes.hp.dt = 6;
  await f.apply(); assert.equal(f.hp.value, 27); assert.equal(f.hp.temp, 4, "threshold uses the reduced native damage");
}
for (const reason of ["miss", "changed", "different-activity", "multiple-rolls", "duplicate-token", "unowned", "incapacitated", "no-reactions", "not-native", "heal", "negative", "mixed", "invert", "other-creature", "untrusted-author"]) {
  const f = setup(); let damage = [{ value: 11, type: "slashing" }], options = {};
  if (reason === "miss") f.attack.system.targets[0].ac = 21;
  if (reason === "changed") f.attack.rolls[0].total = 25;
  if (reason === "different-activity") f.message.getAssociatedActivity = () => ({ uuid: "wrong" });
  if (reason === "multiple-rolls") f.attack.rolls.push(new D20());
  if (reason === "duplicate-token") f.attack.system.targets.push({ ...f.attack.system.targets[0] });
  if (reason === "unowned") f.actor.isOwner = false;
  if (reason === "incapacitated") f.actor.statuses.add("incapacitated");
  if (reason === "no-reactions") f.actor.effects.push({ active: true, duration: {}, flags: { spikependium: { noReactions: true } } });
  if (reason === "not-native") f.message.type = "usage";
  if (reason === "heal") { f.message.system.isHealing = true; damage = [{ value: 5, type: "healing" }]; }
  if (reason === "negative") damage[0].value = -11;
  if (reason === "mixed") damage.push({ value: 5, type: "healing" });
  if (reason === "invert") options.multiplier = -1;
  if (reason === "other-creature") f.actor.flags.spikependium.key = "actor:mm25:performer-legend";
  if (reason === "untrusted-author") f.attack.author = { id: "intruder" };
  await f.apply(damage, options); assert.equal(f.uses, 0, reason); assert.equal(f.prompts, 0, reason);
}
for (const reason of ["decline", "cancel-use", "changed-after-use"]) {
  const f = setup(); if (reason === "decline") f.decline(); if (reason === "cancel-use") f.reject(); if (reason === "changed-after-use") f.mutate();
  await f.apply(); assert.equal(f.hp.value, reason === "decline" ? 20 : 27, reason);
}
{
  const f = setup(); await f.activity.use({}); await f.apply(); assert.equal(f.hp.value, 26);
  assert.equal(f.prompts, 0); assert.equal(f.uses, 1, "using the sheet binds the selected attack without a second expense");
}
{
  const f = setup(); f.decline(); await f.activity.use({}); assert.equal(f.uses, 0, "cancel selection before spending");
  assert.equal(prepareDodgeUpdates(f.activity, { spikependium: { uncannyDodge: { attack: "missing" } } }, { actor: {} }), false);
}
for (const reason of ["hidden-token", "blind", "whisper"]) {
  const f = setup(); if (reason === "hidden-token") f.token.hidden = true;
  if (reason === "blind") f.attack.blind = true;
  if (reason === "whisper") f.attack.whisper = ["gm", "recipient"];
  const binding = { attack: f.attack.uuid, signature: attackSignature(f.attack), token: f.token.uuid };
  await performerDodgeUse.call(f.activity, async (config, dialog, message) => {
    assert.equal(message.rollMode, "gm"); assert.equal(message.data.blind, reason === "blind");
    assert.deepEqual(message.data.whisper, reason === "whisper" ? ["gm", "recipient"] : ["gm"]);
  }, { spikependium: { uncannyDodge: binding } });
}
const performer = fs.readdirSync("packs/_source/creatures").filter(f => /^actor-mm25-performer_/.test(f))
  .map(f => JSON.parse(fs.readFileSync(`packs/_source/creatures/${f}`, "utf8")))[0];
assert.ok(performer.items.some(i => i.system.activities.QuImfAi59iGAiAkW));
console.log("Performer dodge: native damage, resistance/immunity/threshold/temp HP, reaction expense/refund, exact hit binding, cancellation and invalid targets passed.");
