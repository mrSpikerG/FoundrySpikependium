import assert from "node:assert/strict";
import fs from "node:fs";
import { chooseGuardian, resumeGuardian, recordGuardianAttack, canUseGuardian, guardianApplyDamage, guardianCardDamage,
  registerGuardianMovement } from "../scripts/dragonmark-guardian.mjs";
import { captureAttackDamage, attackSource, guardianEvaluatedTargets, guardianRecords } from "../scripts/attack-source.mjs";
import { attackHitTargets } from "../scripts/companions.mjs";
import { prepareResourceUpdates } from "../scripts/resources.mjs";
import { recordReaction, recordReactionConsumption } from "../scripts/reactions.mjs";
import { nativeConsume, nativeRefund, getDeltas } from "./data/dnd5e-reaction-native.mjs";
import { nativeApplyDamage, nativeCardDamage, nativeCalculateDamage, nativeEvaluatedTargets } from "./data/dnd5e-guardian-native.mjs";

const featData = JSON.parse(fs.readFileSync("packs/_source/feats/feat-sentinel_2D8MxuDmm92912zK.json", "utf8"));
const MOD = "tIDVcbZ4hC7dTkU1";
const get = (o, p) => p.split(".").reduce((v, k) => v?.[k], o);
const set = (o, p, v) => { const keys = p.split("."); const key = keys.pop(); for (const k of keys) o = o[k] ??= {}; o[key] = v; };
const flatten = (o, prefix = "", out = {}) => { for (const [k, v] of Object.entries(o)) { const p = prefix ? `${prefix}.${k}` : k;
  if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, p, out); else out[p] = v; } return out; };
const list = values => Object.assign(values, { get(id) { return this.find(v => v.id === id); } });
let documents, answers, queries, moves, fees, serial, failure, onPaid;
globalThis.fromUuidSync = uuid => documents.get(uuid);
globalThis.foundry = { utils: { getProperty: get, setProperty: set, flattenObject: flatten, deepClone: structuredClone,
  escapeHTML: s => String(s), randomID: () => `GUARD${String(serial++).padStart(11, "0")}`, isEmpty: o => Object.keys(o).length === 0 },
  applications: { api: { DialogV2: { async query(user, type, options) { queries.push({ user, type, options }); const a = answers.shift(); return typeof a === "function" ? a() : a; },
    async input(options) { queries.push({ options }); return answers.shift(); } } } } };
globalThis.CONFIG = { Dice: { D20Roll: class { toJSON() { return { total: this.total, crit: this.isCritical, fumble: this.isFumble }; } } },
  DND5E: { healingTypes: { healing: {} }, damageTypes: { fire: {}, cold: {} } }, Token: { movement: { actions: { blink: {} } } } };
globalThis.ChatMessage = { implementation: { getSpeaker: ({ actor, token }) => ({ actor: actor.uuid, token: token.id, scene: token.parent.id }) } };
globalThis.ActiveEffect = { implementation: { getEffectStart: () => ({ time: game.time.worldTime }) } };
globalThis.Hooks = { call(name, ...args) { if (name === "dnd5e.preActivityConsumption") return canUseGuardian(...args);
  if (name === "dnd5e.postActivityConsumption") recordReactionConsumption(...args); return true; }, callAll() {} };
globalThis.ui = { notifications: { warn() {}, error() {} } };
globalThis.dnd5e = { utils: { convertLength: (n, a, b) => n * ({ ft: 1, m: 10 / 3 }[a]) / ({ ft: 1, m: 10 / 3 }[b]) },
  dataModels: { chatMessage: { fields: { TargetsField: { getDescriptors: tokens => tokens.map(t => ({ token: t.uuid, actor: t.actor.uuid,
    name: t.name, ac: t.actor.system.attributes.ac.value })) } } } } };
globalThis.aggregateDamageRolls = rolls => rolls;
Number.isNumeric = n => typeof n === "number";
Math.clamp = (n, min, max) => Math.min(Math.max(n, min), max);
function setup() {
  documents = new Map(); answers = [true]; queries = []; moves = []; fees = []; serial = 0; failure = null; onPaid = null;
  const gm = { id: "gm", isGM: true, isActiveGM: true, active: true }, player = { id: "player", isGM: false, active: true };
  const users = list([gm, player]); users.activeGM = gm;
  const scene = { uuid: "Scene.scene", id: "scene", flags: {}, tokens: [], canUserModify: u => u.isGM,
    grid: { units: "ft", size: 100, distance: 5, measurePath: ([a, b]) => ({ distance: Math.hypot((a.x - b.x) / 20, (a.y - b.y) / 20, a.elevation - b.elevation) }) },
    async setFlag(module, key, value) { if (failure === key) { failure = null; throw Error("receipt"); } set(this, `flags.${module}.${key}`, structuredClone(value)); },
    async moveTokens(instructions, options) {
      moves.push(instructions); assert.equal(options.constrainOptions.ignoreCost, true); assert.equal(options.constrainOptions.ignoreTokens, true);
      const result = {}; for (const [id, instruction] of Object.entries(instructions)) {
        const token = scene.tokens.find(t => t.id === id); Object.assign(token, instruction.destination); result[id] = failure !== "stop";
        if (failure === "partial") { failure = null; throw Error("partial"); }
      } return result;
    } };
  globalThis.canvas = { ready: true, scene, grid: scene.grid, tokens: { controlled: [] } };
  globalThis.game = { user: gm, users, scenes: [scene], time: { worldTime: 100 }, combats: [], combat: null, messages: list([]) };
  documents.set(scene.uuid, scene);
  function actor(id) {
    const hp = { value: 50, max: 50, temp: 0, tempmax: 0, damage: 0 };
    const actor = { uuid: `Actor.${id}`, type: "npc", isOwner: true, statuses: new Set(), items: list([]), effects: list([]), flags: {},
      system: { isCreature: true, attributes: { hp, ac: { value: 15 } }, _source: { attributes: { hp } } },
      testUserPermission: u => u.isGM || u.id === player.id, getRollData: () => ({}),
      changeIsIgnored: () => false, changeHasEffect: (category, damage) => actor[category]?.has(damage.type) ?? false,
      calculateDamage(damages, options) { actor.calculated = (actor.calculated ?? 0) + 1; return nativeCalculateDamage.call(this, damages, options); },
      async applyDamage(damages, options) { return guardianApplyDamage.call(this, nativeApplyDamage.bind(this), damages, options); },
      async update(changes) { for (const [k, v] of Object.entries(changes)) set(this, k, v); this.system.attributes.hp.damage = 50 - this.system.attributes.hp.value; },
      async applyUpdates(updates) {
        const deltas = { actor: getDeltas(actor, updates.actor), item: {} };
        for (const [k, v] of Object.entries(updates.actor)) { if (k.includes(".-=")) delete get(actor, k.slice(0, k.indexOf(".-=")))[k.split(".-=")[1]]; else set(actor, k, v); }
        for (const change of updates.item) {
          const i = actor.items.get(change._id); deltas.item[i.id] = getDeltas(i, change);
          for (const [path, value] of Object.entries(change)) if (path.startsWith("system.activities.")) set(i.system.activities.get(MOD), path.slice(`system.activities.${MOD}.`.length), value);
        } return deltas;
      } };
    documents.set(actor.uuid, actor); return actor;
  }
  function token(id, actor, x) {
    const token = { id, uuid: `${scene.uuid}.Token.${id}`, actor, parent: scene, name: id, x, y: 0, elevation: 0, level: "ground", width: 1, height: 1, depth: 1, shape: 0,
      getOccupiedGridSpaceOffsets: () => [], getSize() { return { width: this.width * 100, height: this.height * 100 }; },
      getCenterPoint() { return { x: this.x + this.width * 50, y: this.y + this.height * 50, elevation: this.elevation }; } };
    scene.tokens.push(token); documents.set(token.uuid, token); return token;
  }
  const guardian = token("guardian", actor("guardian"), 100), victim = token("victim", actor("victim"), 0), attacker = token("attacker", actor("attacker"), 400);
  const item = { id: featData._id, uuid: `${guardian.actor.uuid}.Item.${featData._id}`, actor: guardian.actor,
    flags: featData.flags, system: { activities: list([]) } };
  const activity = { ...structuredClone(featData.system.activities[MOD]), flags: {}, id: MOD, uuid: `${item.uuid}.Activity.${MOD}`, actor: guardian.actor, item,
    async _prepareUsageUpdates(config) { return prepareResourceUpdates.call(this, async () => ({ actor: {}, item: [{ _id: item.id,
      [`system.activities.${MOD}.uses.spent`]: this.uses.spent + 1 }], create: [], delete: [], rolls: [] }), config); },
    async use(config, dialog, message) {
      assert.equal(canUseGuardian(this, config), true); if (failure === "cancel") return;
      const updates = await nativeConsume.call(this, config, message, guardian.actor.applyUpdates); assert.ok(updates);
      recordReaction(this, message);
      const card = { id: `cost${serial++}`, uuid: `ChatMessage.cost${serial}`, flags: message.data.flags, system: message.data.system,
        async update(changes) { for (const [k, v] of Object.entries(changes)) set(this, k, v); } };
      fees.push(card); if (onPaid) onPaid(); return { message: card };
    }, async refund(deltas) { await nativeRefund.call(this, deltas, guardian.actor.applyUpdates); } };
  Object.defineProperty(activity.uses, "value", { get() { return Math.max(0, Number(this.max) - this.spent); } });
  item.system.activities.push(activity); guardian.actor.items.push(item);
  const attackActivity = { uuid: "Actor.attacker.Item.weapon.Activity.attack", actor: attacker.actor };
  const roll = Object.assign(new CONFIG.Dice.D20Roll(), { total: 18, _evaluated: true, options: {} });
  const attack = { id: "attack", uuid: "ChatMessage.attack", author: player, type: "attack", flags: {}, rolls: [roll],
    system: { targets: dnd5e.dataModels.chatMessage.fields.TargetsField.getDescriptors([victim]) },
    getAssociatedActivity: () => attackActivity, getAssociatedToken: () => attacker, render() {},
    updateSource(changes) { for (const [k, v] of Object.entries(changes)) set(this, k, v); } };
  recordGuardianAttack(attack); documents.set(attack.uuid, attack); game.messages.push(attack);
  const usage = { id: "usage", getAssociatedRolls: () => [attack] }; game.messages.push(usage);
  const damage = async origin => {
    const saved = await captureAttackDamage.call(attackActivity, async (_config, _dialog, message) => message, {}, {}, { data: { system: { origin: origin ?? usage.id } } });
    return { ...saved.data, id: "damage", type: "damage", rolls: [{ total: 20, options: { type: "fire" } }],
      getAssociatedActivity: () => attackActivity, getOriginatingMessage: () => usage };
  };
  return { scene, guardian, victim, attacker, attack, activity, player, gm, roll, damage, token, actor };
}
let s = setup(); registerGuardianMovement(); assert.equal(CONFIG.Token.movement.actions.spikependiumGuardian.getCostFunction()(), 0);
assert.equal(canUseGuardian(s.activity), false);
assert.equal(canUseGuardian(s.activity, { spikependium: { guardianManual: true } }), true);
s.guardian.actor.system.attributes.ac.value = 30;
await chooseGuardian(s.attack);
assert.equal(fees.length, 1); assert.equal(moves.length, 1); assert.equal(s.guardian.x, 0); assert.equal(s.victim.x, 100);
assert.equal(s.activity.uses.spent, 1); assert.equal(guardianRecords(s.attack)[0].state, "done");
assert.equal(queries[0].user, s.player); await chooseGuardian(s.attack); await resumeGuardian(); assert.equal(moves.length, 1);
s.guardian.actor.system.attributes.ac.value = 30;
assert.equal(attackHitTargets(s.attack)[0].token, s.guardian, "перенаправленное попадание сохраняется при высоком КД");
const context = { parent: s.attack, targets: s.attack.system.targets };
assert.equal(guardianEvaluatedTargets.call(context, nativeEvaluatedTargets.bind(context))[0].isMiss, false);
assert.equal(guardianEvaluatedTargets.call(context, nativeEvaluatedTargets.bind(context))[0].ac, 30);
const d = await s.damage(); assert.equal(attackSource(d), s.attack); assert.equal(d.system.targets[0].token, s.guardian.uuid);
s.victim.actor.immunity = new Set(["fire"]); s.guardian.actor.resistance = new Set(["fire"]); s.guardian.actor.system.attributes.hp.temp = 3;
await s.victim.actor.applyDamage([{ type: "fire", value: 20 }], { originatingMessage: d });
assert.equal(s.victim.actor.system.attributes.hp.value, 50); assert.equal(s.victim.actor.calculated, undefined);
assert.equal(s.guardian.actor.system.attributes.hp.value, 43); assert.equal(s.guardian.actor.system.attributes.hp.temp, 0);
for (const order of ["victim-first", "guardian-first"]) {
  s = setup(); await chooseGuardian(s.attack); const d = await s.damage();
  canvas.tokens.controlled = (order === "victim-first" ? [s.victim, s.guardian] : [s.guardian, s.victim]).map(t => ({ actor: t.actor }));
  await guardianCardDamage.call(d, nativeCardDamage.bind(d), null, 0.5);
  assert.equal(s.guardian.actor.system.attributes.hp.value, 40, "оба отмеченных токена получают этот удар один раз");
  assert.equal(s.victim.actor.system.attributes.hp.value, 50);
}
for (const reason of ["skip", "cancel", "far", "height", "incapacitated", "used", "time", "position", "noGM", "unsafe", "multiroll", "duplicateActor", "forged", "receipt"]) {
  s = setup();
  if (reason === "skip") answers = [false]; if (reason === "cancel") failure = "cancel";
  if (reason === "far") s.guardian.x = 101; if (reason === "height") s.guardian.elevation = 5;
  if (reason === "incapacitated") s.guardian.actor.statuses.add("stunned"); if (reason === "used") s.activity.uses.spent = 1;
  if (reason === "time") game.time.worldTime++; if (reason === "position") s.victim.x = 1;
  if (reason === "noGM") game.user = s.player; if (reason === "unsafe") s.scene.canUserModify = () => true;
  if (reason === "multiroll") s.attack.rolls.push(s.roll);
  if (reason === "duplicateActor") s.attack.system.targets.push({ ...s.attack.system.targets[0], token: "other" });
  if (reason === "forged") s.attack.author = { id: "intruder" };
  if (reason === "receipt") { failure = "guardianHits.attack:0:victim"; await assert.rejects(chooseGuardian(s.attack)); }
  else await chooseGuardian(s.attack);
  assert.equal(moves.length, 0, reason);
}
s = setup(); onPaid = () => { game.time.worldTime++; }; await chooseGuardian(s.attack);
assert.equal(s.activity.uses.spent, 0); assert.equal(moves.length, 0, "изменение условий после оплаты возвращает ресурсы");
s = setup(); failure = "partial"; await assert.rejects(chooseGuardian(s.attack)); assert.equal(guardianRecords(s.attack)[0].state, "moving");
const pendingDamage = await s.damage(); await s.victim.actor.applyDamage([{ value: 20, type: "fire" }], { originatingMessage: pendingDamage });
assert.equal(s.victim.actor.calculated, undefined); await resumeGuardian(); assert.equal(moves.length, 2);
assert.deepEqual(Object.keys(moves[1]), ["victim"]); assert.equal(guardianRecords(s.attack)[0].state, "done");
s = setup(); failure = "stop"; await chooseGuardian(s.attack); assert.equal(guardianRecords(s.attack)[0].state, "stopped");
await resumeGuardian(); assert.equal(moves.length, 1);
s = setup(); failure = "stop"; answers.push({ result: "done" }); await chooseGuardian(s.attack); assert.equal(guardianRecords(s.attack)[0].state, "done");
assert.equal(moves.length, 1, "решение Мастера не повторяет остановленное движение");
s = setup(); const early = await s.damage(); game.user = s.player;
await s.victim.actor.applyDamage([{ value: 20, type: "fire" }], { originatingMessage: early }); assert.equal(s.victim.actor.calculated, undefined);
game.user = s.gm; answers = [false]; await chooseGuardian(s.attack);
await s.victim.actor.applyDamage([{ value: 20, type: "fire" }], { originatingMessage: early }); assert.equal(s.victim.actor.system.attributes.hp.value, 30);
s = setup(); let release; answers = [() => new Promise(r => { release = r; })]; const choose = chooseGuardian(s.attack);
await Promise.resolve(); await Promise.resolve(); const during = await s.damage();
const hpTask = s.victim.actor.applyDamage([{ value: 20, type: "fire" }], { originatingMessage: during });
assert.equal(s.victim.actor.calculated, undefined); release(true); await choose; await hpTask; assert.equal(s.guardian.actor.system.attributes.hp.value, 30);
s = setup(); await chooseGuardian(s.attack); const stale = await s.damage(); s.roll.total++;
await s.victim.actor.applyDamage([{ value: 20, type: "fire" }], { originatingMessage: stale }); assert.equal(s.victim.actor.calculated, undefined);
s = setup(); await chooseGuardian(s.attack); const noOwner = await s.damage(); s.guardian.actor.isOwner = false;
await s.victim.actor.applyDamage([{ value: 20, type: "fire" }], { originatingMessage: noOwner }); assert.equal(s.victim.actor.calculated, undefined);
s = setup(); s.attack.blind = true; await chooseGuardian(s.attack); assert.equal(queries[0].user, s.gm, "скрытая атака не раскрывается игроку");
s = setup(); const separate = await captureAttackDamage.call({ uuid: "other" }, async (_c, _d, m) => m, {}, {}, { data: { system: { origin: "usage" } } });
assert.equal(separate.data.flags, undefined, "урон другого действия не связывается с этой атакой");
console.log("Бдительный защитник: штатная оплата/возврат, два токена, попадание, сопротивления и временные хиты новой цели, порядок карточек, права, повтор и остановка: OK.");
