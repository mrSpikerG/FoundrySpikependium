import assert from "node:assert/strict";
import fs from "node:fs";
import { recordRavenousHit, chooseRavenousHeal, canUseRavenous, prepareRavenousUpdates, recordRavenousUse,
  rollRavenousHealing, ravenousApplyDamage, recordRavenousHealing } from "../scripts/hollow-ravenous.mjs";
import { nativeConsume, getDeltas } from "./data/dnd5e-reaction-native.mjs";
import { nativeApplyDamage, nativeCalculateDamage } from "./data/dnd5e-guardian-native.mjs";
import { applyTurnLimit } from "../scripts/mechanics.mjs";

const feat = JSON.parse(fs.readFileSync("packs/_source/subclasses/subclass-hollow-warden-ravenous-might_GBG90muJmAXfzEfw.json", "utf8"));
const original = Object.values(feat.system.activities).find(a => a.type === "heal");
const get = (o, p) => p.split(".").reduce((v, k) => v?.[k], o);
const set = (o, p, v) => { const keys = p.split("."); const key = keys.pop(); for (const k of keys) o = o[k] ??= {}; o[key] = v; };
const flatten = (o, prefix = "", out = {}) => { for (const [k, v] of Object.entries(o)) { const p = prefix ? `${prefix}.${k}` : k;
  if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, p, out); else out[p] = v; } return out; };
const list = values => Object.assign(values, { get(id) { return this.find(v => v.id === id); } });
let docs, serial, answers, dice, uses, queries, cancel, failUpdate;
globalThis.fromUuidSync = uuid => docs.get(uuid);
globalThis.foundry = { utils: { getProperty: get, setProperty: set, flattenObject: flatten, deepClone: structuredClone,
  isEmpty: o => Object.keys(o).length === 0, randomID: () => `RAVEN${String(serial++).padStart(11, "0")}` },
  applications: { api: { DialogV2: { async query(user, type, options) { queries.push({ user, type, options }); const result = answers.shift(); return typeof result === "function" ? result() : result; } } } } };
globalThis.CONFIG = { Dice: { D20Roll: class {} }, DND5E: { healingTypes: { healing: {} }, damageTypes: {} } };
globalThis.Hooks = { call(name, ...args) { if (name === "dnd5e.preActivityConsumption") return canUseRavenous(...args);
  if (name === "dnd5e.activityConsumption") return applyTurnLimit(...args);
  if (name === "dnd5e.preApplyDamage") recordRavenousHealing(...args); return true; }, callAll() {} };
globalThis.ui = { notifications: { warn() {}, error() {} } };
globalThis.dnd5e = { dataModels: { chatMessage: { fields: { TargetsField: { getDescriptors: ts => ts.map(t => ({ token: t.uuid, actor: t.actor.uuid })) } } } } };
Number.isNumeric = n => typeof n === "number";
Math.clamp = (n, min, max) => Math.min(Math.max(n, min), max);
function setup() {
  docs = new Map(); serial = 0; answers = [true]; dice = []; uses = []; queries = []; cancel = false; failUpdate = false;
  const gm = { id: "gm", isGM: true, isActiveGM: true }, player = { id: "player", isGM: false, active: true };
  const users = [gm, player]; users.activeGM = gm;
  globalThis.game = { user: gm, users, scenes: [], combat: { id: "combat", started: true, round: 1, turn: 0 }, time: { worldTime: 100 }, messages: list([]) };
  const hp = { value: 15, max: 40, effectiveMax: 40, temp: 7, tempmax: 0, damage: 25 };
  const actor = { uuid: "Actor.pc", isOwner: true, statuses: new Set(), flags: {}, effects: [], items: [],
    system: { attributes: { hp }, _source: { attributes: { hp } } },
    testUserPermission: user => user.isGM || user.id === player.id,
    getActiveTokens: () => [{ uuid: "Scene.scene.Token.pc", actor }], getRollData: () => ({}), changeHasEffect: () => false, changeIsIgnored: () => false,
    calculateDamage: nativeCalculateDamage,
    applyDamage(damages, options) { return ravenousApplyDamage.call(this, nativeApplyDamage.bind(this), damages, options); },
    async update(changes) {
      if (failUpdate) { failUpdate = false; throw Error("update"); }
      for (const [k, v] of Object.entries(changes)) {
        if (k.includes(".-=")) delete get(actor, k.slice(0, k.indexOf(".-=")))[k.split(".-=")[1]];
        else set(actor, k, structuredClone(v));
      }
      hp.damage = hp.max - hp.value;
    },
    async applyUpdates(updates) { const consumed = { actor: getDeltas(actor, updates.actor), item: {} }; await actor.update(updates.actor); return consumed; } };
  docs.set(actor.uuid, actor);
  const mark = { type: "spell", system: { identifier: "hunters-mark" } }; docs.set("Item.mark", mark);
  const form = { uuid: "Actor.pc.ActiveEffect.mark", disabled: false, duration: { expired: false },
    system: { type: "concentrating" }, flags: { dnd5e: { item: { uuid: "Item.mark" } }, spikependium: { hollowWrath: true } } };
  actor.effects.push(form);
  const item = { id: feat._id, uuid: `Actor.pc.Item.${feat._id}`, flags: feat.flags, system: {} };
  const activity = { ...structuredClone(original), id: original._id, uuid: `${item.uuid}.Activity.${original._id}`, item, actor,
    async _prepareUsageUpdates(config) { return prepareRavenousUpdates(this, config, { actor: {}, item: [] }); },
    async use(config, dialog, message) {
      const updates = await nativeConsume.call(this, config, message, actor.applyUpdates); if (!updates) return;
      recordRavenousUse(this, message);
      const used = { id: `usage${serial++}`, uuid: `ChatMessage.usage${serial}`, type: "usage", flags: message.data.flags,
        author: game.user, getAssociatedActivity: () => this }; uses.push(used); game.messages.push(used); return { message: used };
    },
    rollDamage(config, dialog, message) {
      return rollRavenousHealing.call(this, async (_config, _dialog, outgoing) => {
        if (cancel) return;
        const rolls = [{ _evaluated: true, total: 9, options: { type: "healing" } }]; dice.push(rolls);
        const card = { id: `healing${serial++}`, type: "healing", author: game.user, flags: outgoing.data.flags,
          system: { isHealing: true }, getAssociatedActivity: () => this }; game.messages.push(card); return rolls;
      }, config, dialog, message);
    } };
  item.system.activities = list([activity]); actor.items.push(item);
  const victim = { uuid: "Scene.scene.Token.victim", actor: { uuid: "Actor.victim" } }; docs.set(victim.uuid, victim);
  const roll = Object.assign(new CONFIG.Dice.D20Roll(), { total: 20, _evaluated: true });
  const attackActivity = { actor };
  function message(id = "attack") {
    const m = { id, uuid: `ChatMessage.${id}`, type: "attack", author: player, flags: {}, rolls: [roll], system: { targets: [{ ac: 15, token: victim.uuid }] },
      getAssociatedActivity: () => attackActivity,
      updateSource(changes) { for (const [k, v] of Object.entries(changes)) set(this, k, v); },
      async setFlag(module, key, value) { set(this, `flags.${module}.${key}`, value); } };
    recordRavenousHit(m); return m;
  }
  return { actor, activity, form, hp, message, roll, player, gm };
}
let s = setup(); assert.equal(canUseRavenous(s.activity), false); const attack = s.message();
await chooseRavenousHeal(attack);
assert.equal(uses.length, 1); assert.equal(dice.length, 1); assert.equal(s.hp.value, 24); assert.equal(s.hp.temp, 7);
assert.equal(s.actor.flags.spikependium.ravenousUse.healed, true); assert.equal(queries[0].user, s.player);
const card = game.messages.find(m => m.type === "healing");
await s.actor.applyDamage([{ type: "healing", value: 9 }], { originatingMessage: card }); assert.equal(s.hp.value, 24, "повторная карточка не лечит повторно");
await chooseRavenousHeal(attack); await chooseRavenousHeal(s.message("second")); assert.equal(uses.length, 1, "один общий лимит на ход");
for (const reason of ["miss", "healthy", "antimagic", "inactive-form", "declined", "time", "new-form", "dead", "forged", "other-client"]) {
  s = setup();
  if (reason === "miss") s.roll.total = 1; if (reason === "healthy") s.hp.value = 21;
  if (reason === "antimagic") s.actor.statuses.add("antimagic"); if (reason === "inactive-form") s.form.disabled = true;
  const m = s.message();
  if (reason === "declined") answers = [false]; if (reason === "time") game.time.worldTime++;
  if (reason === "new-form") s.form.uuid = "different"; if (reason === "dead") s.hp.value = 0;
  if (reason === "forged") m.author = { id: "intruder" }; if (reason === "other-client") game.user = s.player;
  await chooseRavenousHeal(m); assert.equal(uses.length, 0, reason);
}
s = setup(); const snapshot = s.message(); s.hp.value = 30; await chooseRavenousHeal(snapshot);
assert.equal(s.hp.value, 39, "учитывается окровавленное состояние на момент попадания, а не после других последствий");
s = setup(); cancel = true; await chooseRavenousHeal(s.message()); assert.equal(s.hp.value, 15);
assert.equal(s.actor.flags.spikependium.ravenousTurn, null); cancel = false; answers = [true]; await chooseRavenousHeal(s.message("after-cancel"));
assert.equal(s.hp.value, 24, "отмена штатного броска возвращает доступность в ходу");
s = setup(); await chooseRavenousHeal(s.message()); const oldCard = game.messages.find(m => m.type === "healing");
game.combat.turn++; s.hp.value = 15; answers = [true]; await chooseRavenousHeal(s.message("next-turn")); assert.equal(uses.length, 2);
await s.actor.applyDamage([{ value: 9, type: "healing" }], { originatingMessage: oldCard }); assert.equal(s.hp.value, 24);
s = setup(); game.users.activeGM = null; game.user = s.player; await chooseRavenousHeal(s.message()); assert.equal(s.hp.value, 24);
s = setup(); game.combat = null; await chooseRavenousHeal(s.message()); s.hp.value = 15; answers = [true]; await chooseRavenousHeal(s.message("same-time")); assert.equal(uses.length, 1);
game.time.worldTime++; answers = [true]; await chooseRavenousHeal(s.message("new-time")); assert.equal(uses.length, 2);
s = setup(); assert.equal(canUseRavenous(s.activity, { spikependium: { ravenousManual: true } }), true);
s.hp.value = 21; assert.equal(canUseRavenous(s.activity, { spikependium: { ravenousManual: true } }), false);
s = setup(); answers = [() => { game.combat.turn++; return true; }]; await chooseRavenousHeal(s.message()); assert.equal(uses.length, 0, "устаревший выбор не оплачивается");
console.log("Голодающая мощь: попадание/форма/окровавленность, нативная оплата и лечение, временные хиты, общий лимит, отмена, права, новые ходы и защита карточек: OK.");
