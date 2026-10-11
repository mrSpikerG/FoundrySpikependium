import assert from "node:assert/strict";
import fs from "node:fs";
import { registerPassageMovement, canUsePassageModifier, preparePassageDialog, capturePassage, preparePassageUpdates,
  recordPassageCast, passageChatButtons, applyPassageCast, resumePassageCasts, canActDuringPassage } from "../scripts/dragonmark-passage.mjs";
import { prepareResourceUpdates } from "../scripts/resources.mjs";
import { requireConduitCastingDialog } from "../scripts/conduit.mjs";

const MOD = "Vl0oFwi704F3L2mp", clone = structuredClone;
const fixture = JSON.parse(fs.readFileSync("tools/data/dnd5e-misty-step.json", "utf8"));
assert.equal(fixture.system.identifier, "misty-step");
assert.equal(fixture.system.activities.dnd5eactivity000.type, "teleport");
assert.deepEqual(fixture.system.activities.dnd5eactivity000.teleport, { override: true, value: "30", units: "ft" });
const featDoc = JSON.parse(fs.readFileSync(`packs/_source/feats/${fs.readdirSync("packs/_source/feats").find(f => f.startsWith("feat-greater-passage_"))}`, "utf8"));
assert.equal(featDoc.system.activities[MOD].uses.max, "1");
assert.deepEqual(featDoc.system.activities[MOD].uses.recovery, [{ period: "lr", type: "recoverAll" }]);
const set = (obj, path, value) => { const parts = path.split("."); for (const key of parts.slice(0, -1)) obj = obj[key] ??= {}; obj[parts.at(-1)] = clone(value); };
const list = array => Object.assign(array, { get(id) { return this.find(e => e.id === id); } });
let docs, scene, source, ally, feat, resource, activity, player, gm, config, placements, moves, fail, stop, duringChoice, duringMove, placementInputs;
globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
globalThis.foundry = { utils: { setProperty: set, randomID: () => "AbCdEfGhIjKlMnOp" }, data: { fields: {
  BooleanField: class { constructor(data) { Object.assign(this, data); } }, StringField: class { constructor(data) { Object.assign(this, data); } }
} } };
globalThis.fromUuidSync = uuid => docs.get(uuid);
class Token {
  constructor(data, { parent }) { Object.assign(this, data); this.parent = parent; this.actor = docs.get(this.actorUuid); }
  getCenterPoint() { return { x: this.x + this.width * 50, y: this.y + this.height * 50, elevation: this.elevation }; }
  getOccupiedGridSpaceOffsets(p = {}) { return Array.from({ length: this.width * this.height }, (_, n) => ({
    i: (p.y ?? this.y) / 100 + Math.floor(n / this.width), j: (p.x ?? this.x) / 100 + n % this.width })); }
  getSize() { return { width: this.width * 100, height: this.height * 100 }; }
  toObject() { return Object.fromEntries(Object.entries(this).filter(([k]) => !["parent", "actor", "movement"].includes(k))); }
  canUserModify(user) { return this.actor.testUserPermission(user, "OWNER"); }
}
globalThis.CONFIG = { Token: { documentClass: Token, movement: { actions: { blink: { teleport: true } } } } };
globalThis.dnd5e = { utils: { getSceneTargets: actor => [{ document: scene.tokens.find(t => t.actor === actor) }],
  convertLength: (v, from, to) => v * ({ ft: 1, m: 10 / 3 }[from]) / ({ ft: 1, m: 10 / 3 }[to]) } };
function setup() {
  docs = new Map(); placements = [{ x: 600 }, { x: 700 }]; placementInputs = []; moves = []; fail = null; stop = false; duringChoice = duringMove = undefined;
  player = { id: "player", isGM: false, targets: new Set() }; gm = { id: "gm", isGM: true, isActiveGM: true, targets: new Set() };
  const users = list([player, gm]); users.activeGM = gm;
  globalThis.game = { user: player, users, scenes: [], actors: [], messages: [], time: { worldTime: 100 }, combat: null };
  scene = { id: "scene", uuid: "Scene.scene", flags: {}, tokens: [], levels: new Map([["base", {}], ["upper", {}]]), canUserModify: u => u.isGM,
    grid: { units: "ft", distance: 5, getCenterPoint: ({ i, j }) => ({ x: j * 100 + 50, y: i * 100 + 50 }),
      measurePath: ([a, b]) => ({ distance: Math.hypot((a.x - b.x) / 100 * scene.grid.distance, (a.y - b.y) / 100 * scene.grid.distance, (a.elevation ?? 0) - (b.elevation ?? 0)) }) },
    async setFlag(scope, key, value) { if (fail === key) { fail = null; throw Error("flag failed"); } set(this.flags, `${scope}.${key}`, value); },
    async moveTokens(instructions, options) {
      moves.push(clone(instructions)); assert.equal(options.autoRotate, false); assert.equal(options.showRuler, false);
      assert.deepEqual(options.constrainOptions, { ignoreWalls: true, ignoreCost: true, ignoreTokens: true });
      const results = {};
      for (const [id, { destination }] of Object.entries(instructions)) {
        assert.equal(destination.action, "spikependiumPassage");
        if (stop) { results[id] = false; continue; }
        Object.assign(scene.tokens.find(t => t.id === id), destination); results[id] = true;
        if (fail === "partial") { fail = null; throw Error("partial movement"); }
      }
      await duringMove?.(); return results;
    } };
  docs.set(scene.uuid, scene); game.scenes = [scene];
  function actor(id) {
    const a = { id, uuid: `Actor.${id}`, type: "character", flags: {}, items: [], statuses: new Set(), isOwner: true,
      system: { isCreature: true, attributes: { hp: { value: 20 } } },
      testUserPermission(u) { return u?.isGM || u?.id === this.owner; }, owner: player.id,
      async setFlag(scope, key, value) { if (fail === key) { fail = null; throw Error("actor flag failed"); } set(this.flags, `${scope}.${key}`, value); } };
    docs.set(a.uuid, a); game.actors.push(a); return a;
  }
  function token(id, a, x) {
    const t = new Token({ id, uuid: `${scene.uuid}.Token.${id}`, actorUuid: a.uuid, x, y: 0, elevation: 0,
      level: "base", width: 1, height: 1, depth: 1, shape: 0, rotation: 29, hidden: false }, { parent: scene });
    scene.tokens.push(t); docs.set(t.uuid, t); return t;
  }
  source = token("caster", actor("caster"), 0); ally = token("ally", actor("ally"), 100);
  resource = { uses: { max: 1, spent: 0, get value() { return this.max - this.spent; } } };
  feat = { id: featDoc._id, flags: clone(featDoc.flags), system: { activities: new Map([[MOD, resource]]) } };
  source.actor.items = list([feat]);
  activity = { id: "dnd5eactivity000", type: "teleport", actor: source.actor, activation: { type: "bonus" }, flags: {}, consumption: { targets: [] },
    item: { uuid: "Actor.caster.Item.misty", type: "spell", flags: {}, system: clone(fixture.system) }, getUsageToken: () => source };
  config = { spikependium: { improvedPassage: true, passageCompanion: ally.uuid } };
  player.targets.add(ally);
  globalThis.canvas = { ready: true, scene, tokens: { controlled: [], async placeTokens(data, options) {
    assert.equal(options.create, false); placementInputs.push(clone(data));
    const next = placements.shift(); if (!next) return [];
    const document = new Token({ ...data[0], ...next }, { parent: scene }); await duringChoice?.(document);
    options.preConfirm({ document }); return [document];
  } } };
  return { token, actor };
}
async function prepare() {
  assert.notEqual(capturePassage(activity, config, { create: true }), false);
  return preparePassageUpdates(activity, config, { actor: {}, item: [] });
}
function paid(updates) {
  for (const [path, value] of Object.entries(updates.actor)) set(activity.actor, path, value);
  resource.uses.spent = updates.item.find(i => i._id === feat.id)[`system.activities.${MOD}.uses.spent`];
  const data = { data: { system: { buttons: [{ action: "planTeleport" }, { action: "refundResource" }] } } };
  recordPassageCast(activity, data);
  const message = { id: "message", uuid: "ChatMessage.message", author: player, type: "usage", flags: data.data.flags ?? {},
    system: { ...data.data.system, deltas: { item: { [feat.id]: [{ keyPath: `system.activities.${MOD}.uses.spent`, delta: 1 }] } } }, getAssociatedActivity: () => activity };
  game.messages.push(message); return message;
}
const originalError = console.error; console.error = () => {};
registerPassageMovement();
assert.equal(CONFIG.Token.movement.actions.spikependiumPassage.teleport, true);
assert.equal(CONFIG.Token.movement.actions.spikependiumPassage.getCostFunction()(), 0);
assert.equal(CONFIG.Token.movement.actions.spikependiumPassage.canSelect, false);
setup();
assert.equal(canUsePassageModifier({ id: MOD, item: feat }), false);
const dialog = { applicationClass: class { async _prepareConsumptionContext(c) { return c; } } }, dialogConfig = {};
preparePassageDialog(activity, dialogConfig, dialog); assert.equal(requireConduitCastingDialog(() => false, dialogConfig), true);
const uiDialog = new dialog.applicationClass(); uiDialog.config = dialogConfig;
const fields = (await uiDialog._prepareConsumptionContext({ fields: [], inputs: { createCheckboxInput() {} } })).fields;
assert.equal(fields[0].value, false); assert.equal(fields[1].value, ally.uuid); assert.equal(fields[1].field.choices[ally.uuid], ally.name);
const updates = await prepare(); assert.equal(resource.uses.spent, 0); assert.deepEqual(activity.actor.flags, {});
assert.equal(placementInputs.length, 2); assert.equal(placementInputs[0][0].rotation, 29);
assert.deepEqual(passageChatButtons.call(activity, () => [{ action: "planTeleport" }, { action: "refundResource" }], {}), [{ action: "refundResource" }]);
const message = paid(updates); assert.deepEqual(message.system.buttons, [{ action: "refundResource" }]);
assert.deepEqual(passageChatButtons.call(activity, () => [{ action: "planTeleport" }], message), []);
game.user = gm; await applyPassageCast(message); assert.equal(source.x, 600); assert.equal(ally.x, 700); assert.equal(source.rotation, 29);
assert.equal(moves.length, 1); assert.equal(scene.flags.spikependium.passages.AbCdEfGhIjKlMnOp.state, "done");
await applyPassageCast(message); await resumePassageCasts(); assert.equal(moves.length, 1);
for (const choices of [[], [{ x: 600 }], [{ x: 700 }, { x: 800 }], [{ x: 600 }, { x: 800 }], [{ x: 600 }, { x: 600 }], [{ x: 600, elevation: 1 }, { x: 700 }], [{ x: 600, level: "missing" }, { x: 700 }]]) {
  setup(); placements = choices; assert.equal(await prepare(), false); assert.equal(resource.uses.spent, 0); assert.deepEqual(activity.actor.flags, {}); assert.equal(moves.length, 0);
}
setup(); scene.grid.units = "m"; scene.grid.distance = 1.5; assert.notEqual(await prepare(), false);
setup(); ally.width = 2; ally.height = 2; placements = [{ x: 600 }, { x: 700 }]; assert.notEqual(await prepare(), false, "размер спутника сохраняется");
setup(); source.width = 2; placements = [{ x: 600 }, { x: 700 }]; assert.equal(await prepare(), false, "места двух разных размеров пересекаются");
setup(); const blocker = new Token({ ...ally.toObject(), id: "blocker", x: 600 }, { parent: scene }); scene.tokens.push(blocker);
assert.equal(await prepare(), false, "место назначения занято третьим существом");
for (const reason of ["distance", "height", "level", "self", "spent", "caster-antimagic", "ally-antimagic", "dead", "incapacitated", "moving", "stored", "wrongspell", "wrongtype", "noGMrights"]) {
  setup(); if (reason === "distance") ally.x = 201; if (reason === "height") ally.elevation = 1; if (reason === "level") ally.level = "upper";
  if (reason === "self") config.spikependium.passageCompanion = source.uuid; if (reason === "spent") resource.uses.spent = 1;
  if (reason === "caster-antimagic") source.actor.statuses.add("antimagic"); if (reason === "ally-antimagic") ally.actor.statuses.add("antimagic");
  if (reason === "dead") ally.actor.statuses.add("dead"); if (reason === "incapacitated") source.actor.statuses.add("incapacitated");
  if (reason === "moving") ally.movement = { state: "paused" }; if (reason === "stored") activity.item.flags.spikependium = { storedSpell: true };
  if (reason === "wrongspell") activity.item.system.identifier = "other"; if (reason === "wrongtype") activity.type = "utility";
  if (reason === "noGMrights") { game.users.activeGM = null; ally.actor.owner = "foreign"; }
  assert.equal(capturePassage(activity, config, { create: true }), false, reason); assert.equal(resource.uses.spent, reason === "spent" ? 1 : 0);
}
setup(); assert.equal(capturePassage(activity, config, { create: false }), false, "карточка обязательна");
setup(); const ordinary = { actor: {}, item: [] }; assert.equal(await preparePassageUpdates(activity, {}, ordinary), ordinary);
assert.deepEqual(passageChatButtons.call(activity, () => [{ action: "planTeleport" }], {}), [{ action: "planTeleport" }]);
for (const change of [() => { ally.x = 200; }, () => { game.time.worldTime++; }, () => { game.combat = { started: true, id: "fight", round: 1, turn: 1 }; },
  () => { resource.uses.spent = 1; }, () => { game.users.activeGM = null; }, () => { source.actor.items = []; }]) {
  setup(); let once = false; duringChoice = () => { if (!once) { once = true; change(); } }; assert.equal(await prepare(), false);
}
setup(); let release; const waiting = new Promise(r => { release = r; }); duringChoice = () => waiting;
capturePassage(activity, config, { create: true }); const first = preparePassageUpdates(activity, config, { actor: {}, item: [] });
await Promise.resolve(); assert.equal(await preparePassageUpdates(activity, config, { actor: {}, item: [] }), false); release(); assert.notEqual(await first, false);
setup(); capturePassage(activity, config, { create: true }); const merged = await prepareResourceUpdates.call(activity, async () => ({
  actor: { "system.spells.spell2.value": 1 }, item: [{ _id: feat.id, "flags.other": true }] }), config);
assert.equal(merged.actor["system.spells.spell2.value"], 1); assert.equal(merged.item.length, 1); assert.equal(merged.item[0]["flags.other"], true);
for (const kind of ["time", "position", "cost", "author", "missing-feat", "payload", "paid-missing"]) {
  setup(); const u = await prepare(); const m = paid(u); game.user = gm;
  if (kind === "time") game.time.worldTime++; if (kind === "position") ally.x = 200; if (kind === "cost") m.system.deltas.item = {};
  if (kind === "author") m.author = { id: "intruder" }; if (kind === "missing-feat") source.actor.items = [];
  if (kind === "payload") source.actor.flags.spikependium.passageCasts.AbCdEfGhIjKlMnOp.toCaster.x = 9999;
  if (kind === "paid-missing") delete source.actor.flags.spikependium.passageCasts.AbCdEfGhIjKlMnOp;
  await applyPassageCast(m); assert.equal(moves.length, 0, kind);
}
setup(); const unpaid = await prepare(); const data = { data: { system: {} } }; recordPassageCast(activity, data); assert.equal(data.data.flags, undefined);
setup(); const delayed = paid(await prepare()); game.user = gm; canvas.scene = {}; await applyPassageCast(delayed); assert.equal(moves.length, 0);
canvas.scene = scene; await resumePassageCasts(); assert.equal(moves.length, 1);
setup(); game.users.activeGM = null; const local = paid(await prepare()); await applyPassageCast(local);
assert.equal(source.x, 600); assert.equal(source.actor.flags.spikependium.passageCasts.AbCdEfGhIjKlMnOp.state, "done"); await resumePassageCasts(); assert.equal(moves.length, 1);
setup(); scene.canUserModify = () => true; const editable = paid(await prepare()); await applyPassageCast(editable); assert.equal(moves.length, 1);
setup(); fail = "partial"; const partial = paid(await prepare()); game.user = gm; await applyPassageCast(partial);
assert.equal(source.x, 600); assert.equal(ally.x, 100); assert.equal(scene.flags.spikependium.passages.AbCdEfGhIjKlMnOp.state, "moving");
assert.equal(canActDuringPassage(activity), false); assert.equal(canActDuringPassage({ actor: source.actor, activation: { type: "reaction" } }), true);
game.time.worldTime += 60; await resumePassageCasts(); assert.equal(ally.x, 700); assert.deepEqual(Object.keys(moves[1]), ["ally"]);
setup(); fail = "passages.AbCdEfGhIjKlMnOp.state"; const receipt = paid(await prepare()); game.user = gm; await applyPassageCast(receipt);
await resumePassageCasts(); assert.equal(moves.length, 1, "ошибка квитанции не повторяет движение");
setup(); stop = true; const stopped = paid(await prepare()); game.user = gm; await applyPassageCast(stopped); stop = false;
await resumePassageCasts(); assert.equal(moves.length, 1); assert.equal(scene.flags.spikependium.passages.AbCdEfGhIjKlMnOp.state, "stopped");
setup(); fail = "partial"; const changed = paid(await prepare()); game.user = gm; await applyPassageCast(changed); ally.x = 400;
await resumePassageCasts(); assert.equal(moves.length, 1); assert.equal(scene.flags.spikependium.passages.AbCdEfGhIjKlMnOp.state, "stopped");
setup(); fail = "partial"; const paused = paid(await prepare()); game.user = gm; await applyPassageCast(paused); ally.movement = { state: "paused" };
await resumePassageCasts(); assert.equal(moves.length, 1); ally.movement = { state: "stopped", updateOptions: { spikependium: { passage: "AbCdEfGhIjKlMnOp" } } };
await resumePassageCasts(); assert.equal(scene.flags.spikependium.passages.AbCdEfGhIjKlMnOp.state, "stopped");
setup(); game.users.activeGM = null; fail = "partial"; const localPartial = paid(await prepare()); await applyPassageCast(localPartial);
game.users.activeGM = gm; await resumePassageCasts(); assert.equal(ally.x, 700, "автор заканчивает собственное начатое движение после подключения Мастера");
for (const local of [false, true]) {
  setup(); if (local) game.users.activeGM = null;
  fail = "partial"; const removedCard = paid(await prepare()); if (!local) game.user = gm;
  await applyPassageCast(removedCard); assert.equal(ally.x, 100);
  game.messages = []; source.actor.items = []; docs.delete(activity.item.uuid);
  await resumePassageCasts(); assert.equal(ally.x, 700, "зафиксированное движение заканчивается без карточки, заклинания и черты");
  await resumePassageCasts(); assert.equal(moves.length, 2);
}
setup(); fail = "partial"; const refunded = paid(await prepare()); game.user = gm; await applyPassageCast(refunded);
refunded.system.deltas = {}; await resumePassageCasts(); assert.equal(ally.x, 700, "возврат ресурсов не прерывает уже начатое перемещение");
setup(); const conduit = new Token({ ...ally.toObject(), id: "conduit", uuid: "Scene.scene.Token.conduit", actorUuid: "Actor.conduit", x: 2000 }, { parent: scene });
conduit.actor = { uuid: "Actor.conduit", flags: { spikependium: { key: "actor:reanimated-companion:conduit" }, dnd5e: { summon: { origin: "Actor.caster.Item.companion" } } },
  statuses: new Set(), system: { attributes: { hp: { value: 10 } } } };
scene.tokens.push(conduit); docs.set(conduit.uuid, conduit); docs.set("Actor.caster.Item.companion", { actor: source.actor });
source.actor.classes = { artificer: { system: { levels: 5 } } }; activity.item.flags.spikependium = { conduitCasting: { owner: source.actor.uuid, companion: conduit.uuid } };
activity.getUsageToken = () => conduit; ally.x = 2100; placements = [{ x: 2600 }, { x: 2700 }];
const throughConduit = paid(await prepare()); game.user = gm; await applyPassageCast(throughConduit);
assert.equal(source.x, 2600); assert.equal(conduit.x, 2000); assert.equal(ally.x, 2700, "пространство накладывания принадлежит Проводнику, перемещается сам заклинатель");
const main = fs.readFileSync("scripts/spikependium.mjs", "utf8"), resources = fs.readFileSync("scripts/resources.mjs", "utf8");
for (const handler of ["capturePassage", "recordPassageCast", "applyPassageCast", "resumePassageCasts", "preparePassageDialog", "registerPassageMovement", "passageChatButtons", "canActDuringPassage"]) assert.ok(main.includes(handler));
assert.ok(main.indexOf('"dnd5e.preActivityConsumption", capturePassage') > main.indexOf('"dnd5e.preActivityConsumption", prepareConduitCasting'));
assert.ok(resources.includes("await preparePassageUpdates(this, config, updates)"));
console.error = originalError;
console.log("Вдохновлённый путь: штатные места/движение без расхода скорости, выбор до оплаты и отмена, касание/30/5/метры/высота/размер, обе цели, Проводник, права, единая оплата, карточка без повторной телепортации, частичное движение/квитанция/остановка/продолжение: OK.");
