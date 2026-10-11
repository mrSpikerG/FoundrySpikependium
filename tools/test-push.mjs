import assert from "node:assert/strict";
import { registerPushMovement, bigPushSnapshots, recordBigPush, bigPushDestination, chooseBigPush } from "../scripts/push.mjs";

class D20Roll {
  constructor(total = 15) { this.total = total; this._evaluated = true; }
}
globalThis.CONFIG = { Dice: { D20Roll }, Token: { movement: { actions: {} } } };
globalThis.ui = { notifications: { warn() {}, error() {} } };
globalThis.ActiveEffect = { implementation: { getEffectStart: () => ({}) } };
globalThis.dnd5e = { utils: { convertLength: (n, from, to) => from === to ? n : from === "ft" ? n * 0.3048 : n / 0.3048 } };
const gm = { id: "gm", isGM: true, isActiveGM: true, active: true };
const owner = { id: "owner", isGM: false, active: true };
const actor = (uuid, key) => ({ uuid, type: "npc", flags: { spikependium: { key } }, statuses: new Set(),
  system: { attributes: { hp: { value: 20 } }, traits: { size: "med" } }, testUserPermission: u => [gm, owner].includes(u) });
const sourceActor = actor("Actor.source", "actor:reanimated-companion:fury:big-medium");
const targetActor = actor("Actor.target", "");
let gridded = true, moves = 0, prompts = 0, response = { distance: 10 }, whilePrompt, wall = Infinity, moveResult = true;
const scene = { uuid: "Scene.test", tokens: [], grid: { size: 100, distance: 5, units: "ft",
  measurePath: ([a, b]) => ({ distance: Math.hypot((b.x - a.x) / 100 * scene.grid.distance, (b.y - a.y) / 100 * scene.grid.distance, b.elevation - a.elevation) }) } };
const token = (uuid, a, x) => ({ uuid, name: "<target>", actor: a, parent: scene, x, y: 0, elevation: 0, level: "base",
  width: 1, height: 1, depth: 1, shape: 0, isOwner: true,
  getCenterPoint(data = {}) { return { x: (data.x ?? this.x) + this.width * 50, y: (data.y ?? this.y) + this.height * 50,
    elevation: data.elevation ?? this.elevation }; },
  getSize() { return { width: this.width * 100, height: this.height * 100 }; },
  getOccupiedGridSpaceOffsets(data = {}) { return gridded ? [{ i: Math.round((data.y ?? this.y) / 100), j: Math.round((data.x ?? this.x) / 100) }] : []; },
  getSnappedPosition(data) { return gridded ? { ...data, x: Math.round(data.x / 100) * 100, y: Math.round(data.y / 100) * 100 } : data; },
  getCompleteMovementPath(path) {
    if (!path.length) return [];
    const [a, b = a] = path;
    return [a, { ...b, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, elevation: (a.elevation + b.elevation) / 2 }, b];
  },
  async move(point, options) {
    assert.equal(point.action, "spikependiumPush");
    assert.equal(CONFIG.Token.movement.actions[point.action].measure, false);
    assert.equal(options.constrainOptions.ignoreWalls, false);
    assert.equal(options.spikependium.forcedMovement, true);
    moves++; Object.assign(this, point); return moveResult;
  }
});
const source = token("Scene.test.Token.source", sourceActor, 0), target = token("Scene.test.Token.target", targetActor, 100);
source.object = {};
target.object = { constrainMovementPath(path, options) {
  assert.equal(options.ignoreWalls, false); assert.equal(options.ignoreCost, true); assert.equal(options.preview, false);
  const [a, end] = path; const b = { ...a, ...end };
  assert.equal(end.width, a.width, "dnd5e не должен принять неполную точку за изменение размера и пропустить блокирующие токены");
  if (b.x > wall) b.x = wall;
  return [[a, b], b.x !== end.x];
} };
scene.tokens = [source, target];
const combat = { id: "combat", uuid: "Combat.test", started: true, round: 1, turn: 0, getCombatantsByToken: () => [{}] };
globalThis.game = { user: gm, users: [gm, owner], combat, combats: [combat] };
globalThis.canvas = { ready: true, scene };
const docs = new Map([[source.uuid, source], [target.uuid, target], [combat.uuid, combat]]);
globalThis.fromUuidSync = uuid => docs.get(uuid);
globalThis.foundry = { utils: { escapeHTML: s => s.replaceAll("<", "&lt;").replaceAll(">", "&gt;") }, applications: { api: { DialogV2: {
  async query(user, type, config) {
    prompts++; assert.equal(type, "input"); assert.ok(config.content.includes("&lt;target&gt;"));
    assert.equal(user, target.hidden || attack.blind || attack.whisper?.length ? gm : owner);
    if (whilePrompt) await whilePrompt(); return response;
  }
} } } };
const activity = { id: "8FKHvTEMzK92yKo4", actor: sourceActor, item: { effects: [] } };
let attack;
const message = (id, rolls = [new D20Roll()]) => ({ id, type: "attack", flags: {}, author: owner, rolls,
  getAssociatedToken: () => source, getAssociatedActivity: () => activity, system: { targets: [{ token: target.uuid, ac: 15 }] },
  updateSource(data) { for (const [k, v] of Object.entries(data)) this.flags.spikependium = { ...this.flags.spikependium, [k.split(".").at(-1)]: v }; },
  async setFlag(scope, key, value) { (this.flags[scope] ??= {})[key] = value; } });
const reset = id => { target.x = 100; target.y = 0; target.elevation = 0; target.level = "base"; target.isOwner = true;
  targetActor.system.traits.size = "med"; source.x = 0; source.hidden = target.hidden = false; combat.turn = 0; wall = Infinity;
  sourceActor.system.attributes.hp.value = 20; sourceActor.flags.spikependium.key = "actor:reanimated-companion:fury:big-medium";
  scene.tokens = [source, target]; canvas.ready = gridded = gm.isActiveGM = moveResult = true; canvas.scene = scene;
  whilePrompt = undefined; response = { distance: 10 }; attack = message(id); return attack; };

registerPushMovement();
assert.equal(CONFIG.Token.movement.actions.spikependiumPush.teleport, false);
assert.equal(CONFIG.Token.movement.actions.spikependiumPush.measure, false);
assert.equal(CONFIG.Token.movement.actions.spikependiumPush.getCostFunction()(), 0);
assert.equal(CONFIG.Token.movement.actions.spikependiumPush.canSelect, false);
reset("geometry");
assert.equal(bigPushDestination(source, target, 10).x, 300);
assert.equal(bigPushDestination(source, target, 5).x, 200);
for (const n of [0, -1, 11, NaN, Infinity, "5"]) assert.equal(bigPushDestination(source, target, n), null);
wall = 200;
assert.equal(bigPushDestination(source, target, 10).x, 200, "стена сокращает толчок");
wall = 100;
assert.equal(bigPushDestination(source, target, 10), null);
wall = Infinity;
const blocker = token("Scene.test.Token.blocker", actor("Actor.blocker", ""), 300);
scene.tokens.push(blocker);
assert.equal(bigPushDestination(source, target, 10).x, 200, "занятый конец пути сокращает толчок до свободной клетки");
blocker.elevation = 5;
assert.equal(bigPushDestination(source, target, 10).x, 300, "существо выше не занимает пространство на земле");
blocker.elevation = 0; blocker.level = "other";
assert.equal(bigPushDestination(source, target, 10).x, 300);
reset("gridless"); gridded = false;
assert.equal(bigPushDestination(source, target, 2.5).x, 150);
target.elevation = 5;
const elevated = bigPushDestination(source, target, 10);
assert.ok(elevated.x > target.x && elevated.elevation > target.elevation);
scene.grid.units = "m"; scene.grid.distance = 1.524; target.elevation = 0;
assert.ok(Math.abs(bigPushDestination(source, target, 10).x - 300) < 1e-8);
scene.grid.units = "ft"; scene.grid.distance = 5;
reset("size");
for (const size of ["tiny", "sm", "med", "lg"]) { targetActor.system.traits.size = size; assert.equal(bigPushSnapshots(attack).length, 1); }
for (const size of ["huge", "grg", "unknown"]) { targetActor.system.traits.size = size; assert.deepEqual(bigPushSnapshots(attack), []); }
reset("wrong");
sourceActor.flags.spikependium.key = "actor:reanimated-companion:fury:thin";
assert.deepEqual(bigPushSnapshots(attack), []);
reset("miss"); attack.rolls[0].total = 14;
assert.deepEqual(bigPushSnapshots(attack), []);
attack.rolls[0].isCritical = true;
assert.equal(bigPushSnapshots(attack).length, 1);
attack.rolls[0]._evaluated = false;
assert.deepEqual(bigPushSnapshots(attack), []);
reset("record"); recordBigPush(attack);
assert.equal(attack.flags.spikependium.bigPushHits[0].from.x, 100);
await chooseBigPush(attack);
assert.equal(target.x, 300); assert.equal(moves, 1);
await chooseBigPush(attack);
assert.equal(moves, 1, "повтор карточки не двигает второй раз");
reset("cancel"); response = null;
await chooseBigPush(attack); await chooseBigPush(attack); assert.equal(moves, 1);
assert.equal(attack.flags.spikependium.bigPushDecisions.length, 1);
for (const distance of [0, "0", "0.0", 11, -1, true, {}, "", "Infinity"]) {
  reset(`invalid${String(distance)}`); response = { distance }; await chooseBigPush(attack); assert.equal(moves, 1);
}
reset("staleRecorded"); recordBigPush(attack); target.x = 200;
await chooseBigPush(attack); assert.equal(moves, 1);
for (const mutation of [() => { target.x = 200; }, () => { source.x = 100; }, () => { combat.turn++; },
  () => { targetActor.system.traits.size = "huge"; }, () => { attack.rolls[0].total = 1; },
  () => { target.isOwner = false; }, () => { gm.isActiveGM = false; }]) {
  reset(`stale${prompts}`); whilePrompt = mutation; await chooseBigPush(attack); assert.equal(moves, 1);
}
reset("privacy"); target.hidden = true;
await chooseBigPush(attack); assert.equal(moves, 2);
reset("blind"); attack.blind = true;
await chooseBigPush(attack); assert.equal(moves, 3);
reset("withoutGM"); gm.isActiveGM = false;
await chooseBigPush(attack); assert.equal(moves, 3);
reset("stranger"); attack.author = { id: "stranger" };
await chooseBigPush(attack); assert.equal(moves, 3);
reset("inactive"); canvas.ready = false;
await chooseBigPush(attack); assert.equal(moves, 3);
reset("concurrent"); whilePrompt = () => chooseBigPush(attack);
await chooseBigPush(attack); assert.equal(moves, 4);
reset("fury"); activity.id = "8I7DzW0U2d8CuWql"; attack.rolls.push(new D20Roll());
recordBigPush(attack); assert.equal(attack.flags.spikependium.bigPushHits.length, 2);
whilePrompt = () => chooseBigPush(attack);
await chooseBigPush(attack); assert.equal(moves, 6); assert.equal(target.x, 500, "по одному толчку на каждое отдельное попадание");
reset("receiptFailure"); attack.setFlag = async () => { throw Error("receipt failure"); };
const log = console.error; console.error = () => {};
await chooseBigPush(attack); assert.equal(moves, 6, "без квитанции движение не начинается");
reset("partialMove"); moveResult = false;
await chooseBigPush(attack); await chooseBigPush(attack); assert.equal(moves, 7);
reset("moveFailure"); const move = target.move; target.move = async () => { moves++; throw Error("movement failed"); };
await chooseBigPush(attack); await chooseBigPush(attack); assert.equal(moves, 8, "частичная ошибка не запускает движение повторно");
target.move = move; console.error = log;
console.log("Крупный спутник: попадания и размер, выбор и отмена, расстояние/высота/метры, стены/занятые клетки, Ярость, права/приватность, устаревшие окна и отсутствие повторных толчков: OK.");
