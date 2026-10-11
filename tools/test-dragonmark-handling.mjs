import assert from "node:assert/strict";
import fs from "node:fs";
import { handlingHits, recordHandlingHits, canUseHandlingModifier, registerHandlingMovement, handlingPaths,
  chooseHandling, resumeHandling, isHandlingAttack, validateHandlingAttack, handlingRollAttack, handlingFalling, handlingMovementCost } from "../scripts/dragonmark-handling.mjs";
import { reactionUse, recordReaction, recordReactionConsumption, finishReaction, reactionAvailable } from "../scripts/reactions.mjs";
import { prepareResourceUpdates } from "../scripts/resources.mjs";
import { nativeConsume, nativeRefund, getDeltas } from "./data/dnd5e-reaction-native.mjs";
import { getActionType, nativeOccupyingTokens, nativeAssociatedItem, nativeShouldFall } from "./data/dnd5e-handling-native.mjs";
import { prepareShadowConcentrationDelete } from "../scripts/dragonmark-shadow.mjs";
import { nativeMovementCost } from "./data/dnd5e-movement-native.mjs";

const nativeHorse = JSON.parse(fs.readFileSync("tools/data/dnd5e-warhorse.json", "utf8"));
const featData = JSON.parse(fs.readFileSync(`packs/_source/feats/${fs.readdirSync("packs/_source/feats").find(f => f.startsWith("feat-greater-handling_"))}`, "utf8"));
const MOD = "uuGAVVQ3q2BIf7lv";
const list = a => Object.assign(a, { get(id) { return this.find(v => v.id === id); }, has(id) { return !!this.get(id); } });
const get = (o, path) => path.split(".").reduce((a, k) => a?.[k], o);
const set = (o, path, value) => { const keys = path.split("."); for (const k of keys.slice(0, -1)) o = o[k] ??= {}; o[keys.at(-1)] = structuredClone(value); };
const flatten = (o, prefix = "", out = {}) => { for (const [k, v] of Object.entries(o)) {
  const key = prefix ? `${prefix}.${k}` : k; if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out); else out[key] = v;
} return out; };
let documents = new Map(), serial, answers, queries, attacks, fees, movements, cancelAttack, onRoll, failure, roles;
globalThis.fromUuidSync = uuid => documents.get(uuid);
globalThis.foundry = { utils: { randomID: () => `HAND${String(serial++).padStart(12, "0")}`, escapeHTML: s => String(s).replaceAll('"', "&quot;"),
  getProperty: get, setProperty: set, flattenObject: flatten, isEmpty: o => Object.keys(o).length === 0 },
  applications: { api: { DialogV2: {
    async query(user, type, options) { queries.push({ user, type, options }); const answer = answers.shift(); if (typeof answer === "function") return answer(); return answer; },
    async input(options) { queries.push({ options }); const answer = answers.shift(); if (typeof answer === "function") return answer(); return answer; }
  } } } };
globalThis.ui = { notifications: { warn() {}, error() {} } };
globalThis.ActiveEffect = { implementation: { getEffectStart(combat) { return { time: game.time.worldTime, combat: combat?.uuid, round: combat?.round, turn: combat?.turn }; } } };
globalThis.ChatMessage = { implementation: { getSpeaker({ actor, token }) { return { actor: actor.uuid, token: token.id, scene: token.parent.id }; } } };
globalThis.PIXI = { Rectangle: class { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } } };
globalThis.CONST = { TOKEN_DISPOSITIONS: { SECRET: -2 } };
globalThis.CONFIG = { Dice: { D20Roll: class {} }, Token: { movement: { actions: { walk: {}, fly: {}, swim: {}, climb: {}, crawl: {} } } },
  DND5E: { movementTypes: { walk: { label: "Walk" }, fly: { label: "Fly" }, swim: { label: "Swim", walkFallback: true }, climb: { label: "Climb", walkFallback: true } } } };
globalThis.dnd5e = { utils: { convertLength(value, from, to) { const unit = { ft: 1, m: 10 / 3 }; return value * unit[from] / unit[to]; }, defaultUnits: () => "ft" },
  dataModels: { chatMessage: { fields: { TargetsField: { getDescriptors: tokens => tokens.map(t => ({ token: t.uuid, actor: t.actor.uuid, ac: t.actor.system.attributes.ac.value })) } } } } };
globalThis.Hooks = { call(name, ...args) { if (name === "dnd5e.postActivityConsumption") recordReactionConsumption(...args); return true; } };

function item(actor, data) {
  const value = { id: data._id, uuid: `${actor.uuid}.Item.${data._id}`, actor, flags: data.flags ?? {}, type: data.type, name: data.name, img: data.img,
    system: { ...structuredClone(data.system), activities: list([]) }, toObject: () => structuredClone(data), scaledClone() { return this; } };
  value.system.activities = list(Object.values(data.system.activities).map(a => {
    const activity = { ...structuredClone(a), id: a._id, uuid: `${value.uuid}.Activity.${a._id}`, item: value, actor,
      toObject: () => structuredClone(a), flags: {}, consumption: { targets: [] }, _mergeActivityUpdates() {},
      async _prepareUsageUpdates(config) { return prepareResourceUpdates.call(this, async () => ({ actor: {}, item: [], create: [], delete: [], rolls: [] }), config); },
      async use(config, dialog, message) {
        if (this.type === "attack") {
          assert.equal(isHandlingAttack(this, config), true); if (cancelAttack) return;
          const card = { id: `usage${serial++}`, flags: structuredClone(message.data.flags), system: message.data.system };
          game.messages.push(card); return { message: card };
        }
        return reactionUse.call(this, async cfg => {
          message.data.system = {};
          const updates = await nativeConsume.call(this, cfg, message, actor.applyUpdates); if (!updates) return;
          recordReaction(this, message); await finishReaction(this);
          const card = { id: `cost${serial++}`, flags: message.data.flags, system: { ...message.data.system, item: { uuid: value.uuid } },
            getAssociatedActor: () => actor, getOriginatingMessage() { return this; },
            async update(changes) { for (const [k, v] of Object.entries(changes)) set(this, k, v); } };
          assert.ok(card.flags.dnd5e.item.data); game.messages.push(card); fees.push(card); return { message: card };
        }, config);
      }, async refund(deltas) { await nativeRefund.call(this, deltas, actor.applyUpdates); },
      async rollAttack(config, dialog, message) {
        return handlingRollAttack.call(this, async actual => {
          assert.equal(validateHandlingAttack({ ...actual, subject: this, rolls: [{}] }), undefined);
          assert.equal(isHandlingAttack(this, actual), true);
          assert.equal(validateHandlingAttack({ ...actual, subject: this, rolls: [{}, {}] }), false);
          if (onRoll) await onRoll(this, actual);
          if (failure === "roll") throw Error("roll");
          attacks.push({ config: actual, message, activity: this }); return [{}];
        }, config, dialog, message);
      }
    };
    return activity;
  }));
  return value;
}
CONFIG.Item = { documentClass: class { constructor(data, { parent }) { return item(parent, data); } } };
globalThis.Item = { implementation: CONFIG.Item.documentClass };
function setup() {
  documents = new Map(); serial = 0; answers = []; queries = []; attacks = []; fees = []; movements = []; cancelAttack = false; onRoll = null; failure = null;
  const player = { id: "player", isGM: false, active: true }, gm = { id: "gm", isGM: true, isActiveGM: true, active: true };
  const users = [player, gm]; users.activeGM = gm; roles = { player, gm };
  const scene = { id: "scene", uuid: "Scene.scene", tokens: [], levels: new Map([["ground", {}]]),
    grid: { units: "ft", size: 100, distance: 5, getCenterPoint: o => ({ x: o.j * 100 + 50, y: o.i * 100 + 50 }),
      getTopLeftPoint: o => ({ x: o.j * 100, y: o.i * 100 }),
      measurePath([a, b]) { return { distance: Math.hypot((a.x - b.x) / 20, (a.y - b.y) / 20, a.elevation - b.elevation) }; } },
    async moveTokens(instructions, options) {
      movements.push({ instructions, options }); assert.equal(options.constrainOptions.ignoreWalls, false); assert.equal(options.constrainOptions.ignoreTokens, false);
      if (failure === "move") throw Error("move");
      const results = {}; for (const [id, instruction] of Object.entries(instructions)) {
        const token = scene.tokens.find(t => t.id === id); assert.ok(canvas.tokens.controlled.includes(token.object));
        assert.ok(instruction.waypoints.every(p => p.action.startsWith("spikependiumHandling_")));
        Object.assign(token, instruction.waypoints.at(-1)); results[id] = failure !== "stop";
      } return results;
    } };
  function actor(uuid, data = {}) {
    const a = { uuid, type: "npc", isOwner: true, inCombat: false, statuses: new Set(), classes: {}, flags: {}, effects: list([]), items: list([]),
      system: { ...data, isCreature: true, attributes: { hp: { value: 20 }, ac: { value: 15 }, movement: { speeds: { walk: 60, fly: 0, swim: 0 }, units: "ft" } } },
      testUserPermission: user => user.id === player.id || user.isGM,
      async setFlag(module, key, val) { set(this, `flags.${module}.${key}`, val); },
      async createEmbeddedDocuments(type, data) { assert.equal(type, "ActiveEffect"); for (const d of data) this.effects.push({ ...structuredClone(d), id: d._id, parent: this }); },
      async deleteEmbeddedDocuments(type, ids) { for (const id of ids) { const e = this.effects.get(id); if (e) await prepareShadowConcentrationDelete.call(e, async () => this.effects.splice(this.effects.indexOf(e), 1)); } },
      applyUpdates: async updates => {
        const deltas = { actor: getDeltas(a, updates.actor), item: {}, created: [], deleted: [] };
        for (const [k, v] of Object.entries(updates.actor)) { const parts = k.split("."); if (parts.at(-1).startsWith("-=")) delete get(a, parts.slice(0, -1).join("."))[parts.at(-1).slice(2)]; else set(a, k, v); }
        return deltas;
      } };
    documents.set(uuid, a); return a;
  }
  function token(a, id, x, width = 1) {
    const t = { id, uuid: `${scene.uuid}.Token.${id}`, actor: a, parent: scene, name: id, x, y: 0, elevation: 0, level: "ground", width, height: width, depth: 1, shape: 0,
      get _source() { return this; }, getCenterPoint() { return { x: this.x + 50 * this.width, y: this.y + 50 * this.height, elevation: this.elevation }; },
      getSize() { return { width: this.width * 100, height: this.height * 100 }; },
      getOccupiedGridSpaceOffsets(p = this) { const cells = []; for (let i = 0; i < this.height; i++) for (let j = 0; j < this.width; j++) cells.push({ i: p.y / 100 + i, j: p.x / 100 + j }); return cells; },
      canUserModify: () => a.isOwner, stopMovement() { this.movement = { state: "stopped" }; return true; } };
    t.object = { document: t, isVisible: true,
      control({ releaseOthers } = {}) { if (releaseOthers) canvas.tokens.releaseAll(); if (!canvas.tokens.controlled.includes(this)) canvas.tokens.controlled.push(this); },
      createTerrainMovementPath: path => path,
      constrainMovementPath(path) { return [path, failure === `wall:${id}`]; },
      measureMovementPath(path) { const cost = path.slice(1).reduce((sum, p, i) => sum + Math.hypot((p.x - path[i].x) / 20, (p.y - path[i].y) / 20, p.elevation - path[i].elevation)
        * (failure === "terrain" ? 3 : p.action === "crawl" || (p.action === "swim" && !a.system.attributes.movement.speeds.swim)
          || (p.action === "climb" && !a.system.attributes.movement.speeds.climb) ? 2 : 1), 0); return { cost }; },
      async planMovement(options) { assert.equal(options.maxCost, 60); assert.equal(options.constrainOptions.ignoreCost, true);
        if (failure === "plan") return null;
        const waypoint = { ...position(t), x: t.x + 600 }; t.movement = { state: "planned" };
        return { id: "plan", origin: position(t), waypoints: [position(t), waypoint] };
      } };
    scene.tokens.push(t); documents.set(t.uuid, t); return t;
  }
  globalThis.canvas = { ready: true, scene, grid: scene.grid, tokens: { controlled: [], releaseAll() { this.controlled.splice(0); },
    quadtree: { getObjects(_rect, { collisionTest }) { return new Set(scene.tokens.map(t => t.object).filter(t => collisionTest({ t }))); } } } };
  globalThis.game = { user: gm, users, actors: [], scenes: [scene], combats: [], combat: null, messages: list([]), time: { worldTime: 100 }, canvas, i18n: { localize: k => k } };
  const hero = actor("Actor.rider"), horse = actor("Scene.scene.Token.mount.Actor.mount", nativeHorse.system), victim = actor("Actor.victim");
  const rider = token(hero, "rider", 0), mount = token(horse, "mount", 0, 2), target = token(victim, "victim", 200);
  const feat = item(hero, featData); hero.items.push(feat);
  const weapon = item(horse, nativeHorse.items[0]); horse.items.push(weapon); for (const a of weapon.system.activities) a.item.system.quantity ??= 1;
  const activity = { actor: hero, item: { flags: {} }, actionType: "mwak", getActionType }; hero.items.push({ flags: {}, system: { activities: list([]) } });
  const roll = new CONFIG.Dice.D20Roll(); Object.assign(roll, { total: 20, _evaluated: true, options: {} });
  const message = { id: "hit", uuid: "ChatMessage.hit", type: "attack", author: player, flags: {}, rolls: [roll], system: { targets: [{ ac: 15, token: target.uuid }] },
    getAssociatedActivity: () => activity, getAssociatedToken: () => rider,
    updateSource(changes) { for (const [k, v] of Object.entries(changes)) set(this, k, v); },
    async setFlag(module, key, value) { if (failure === "receipt") throw Error("receipt"); set(this, `flags.${module}.${key}`, value); } };
  game.messages.push(message); recordHandlingHits(message); const attack = weapon.system.activities[0];
  const options = (action = "move") => { answers.push({ mount: mount.uuid, action }); if (action === "attack") answers.push({ attack: attack.uuid, target: target.uuid }); };
  return { hero, horse, victim, rider, mount, target, message, activity, roll, feat, attack, scene, options };
}
function position(t) { return Object.fromEntries(["x", "y", "elevation", "level", "width", "height", "depth", "shape"].map(k => [k, t[k]])); }
let s = setup(); assert.equal(handlingHits(s.message).length, 1); assert.equal(canUseHandlingModifier(s.feat.system.activities.get(MOD)), false);
registerHandlingMovement(); assert.equal(CONFIG.Token.movement.actions.spikependiumHandling.getCostFunction()(), 0);
assert.equal(CONFIG.Token.movement.actions.spikependiumHandling_walk.measure, true);
s.rider.object.control(); s.options(); await chooseHandling(s.message);
assert.equal(fees.length, 1); assert.equal(movements.length, 1); assert.equal(s.mount.x, 600); assert.equal(s.rider.x, 600);
assert.deepEqual(canvas.tokens.controlled, [s.rider.object]); assert.equal(reactionAvailable(s.horse), false); assert.equal(reactionAvailable(s.hero), true);
await chooseHandling(s.message); await resumeHandling(); assert.equal(movements.length, 1); assert.equal(queries.length, 1);
assert.equal(s.message.flags.spikependium.handlingDecisions["hit:0:victim"], "done");
const reconstructed = nativeAssociatedItem.call({ ...fees[0], getAssociatedActor: () => s.horse }, {}, msg => msg.flags.dnd5e.item.data);
assert.equal(reconstructed.system.activities.get(MOD).activation.type, "reaction"); assert.equal(s.horse.items.length, 1);

for (const mutate of [s => s.roll.total = 10, s => s.roll.isFumble = true, s => s.roll._evaluated = false,
  s => s.roll.options.attackMode = "thrown", s => s.activity.actionType = "rsak", s => s.mount.x = 900,
  s => s.mount.elevation = 40, s => s.mount.level = "upper", s => s.horse.statuses.add("stunned"), s => s.hero.items.splice(0)]) {
  s = setup(); mutate(s); assert.equal(handlingHits(s.message).length, 0);
}
s = setup(); s.activity.actionType = "msak"; assert.equal(handlingHits(s.message).length, 1);
s = setup(); s.roll.isCritical = true; s.roll.total = 2; assert.equal(handlingHits(s.message).length, 1);
for (const fail of ["plan", "wall:rider", "wall:mount", "terrain"]) {
  s = setup(); failure = fail; s.options(); await chooseHandling(s.message); assert.equal(fees.length, 0); assert.equal(movements.length, 0);
}
s = setup(); s.options("skip"); await chooseHandling(s.message); assert.equal(fees.length, 0); await chooseHandling(s.message); assert.equal(queries.length, 1);
s = setup(); answers.push(() => { s.rider.x = 100; return { mount: s.mount.uuid, action: "move" }; }); await chooseHandling(s.message); assert.equal(fees.length, 0);
s = setup(); s.options(); game.time.worldTime++; await chooseHandling(s.message); assert.equal(queries.length, 0);
s = setup(); game.user = roles.player; await chooseHandling(s.message); assert.equal(queries.length, 0);
s = setup(); game.users.activeGM = null; game.user = roles.player; s.options(); await chooseHandling(s.message); assert.equal(movements.length, 1);
s = setup(); game.users.activeGM = null; game.user = roles.player; s.horse.isOwner = false; s.options(); await chooseHandling(s.message); assert.equal(fees.length, 0);
s = setup(); failure = "receipt"; s.options(); await assert.rejects(chooseHandling(s.message), /receipt/); assert.equal(fees.length, 0);
s = setup(); failure = "stop"; s.options(); await chooseHandling(s.message); await chooseHandling(s.message); assert.equal(movements.length, 1); assert.equal(fees.length, 1);
s = setup(); failure = "move"; s.options(); await assert.rejects(chooseHandling(s.message), /move/); failure = null; await chooseHandling(s.message); assert.equal(movements.length, 1);

s = setup(); s.options("attack"); onRoll = async (activity, config) => {
  const repeat = await handlingRollAttack.call(activity, async () => "duplicate", config); assert.equal(repeat, null);
};
await chooseHandling(s.message); assert.equal(attacks.length, 1); assert.equal(fees.length, 1); assert.equal(movements.length, 0);
assert.equal(isHandlingAttack(s.attack, { spikependium: { handlingAttack: "whatever" } }), false);
const used = game.messages.find(m => m.id.startsWith("usage"));
assert.equal(await handlingRollAttack.call(s.attack, async () => "repeat", {}, {}, { data: { system: { origin: used.id } } }), null);
s = setup(); cancelAttack = true; s.options("attack"); await chooseHandling(s.message); assert.equal(attacks.length, 0); assert.equal(reactionAvailable(s.horse), true);
s = setup(); s.options("attack"); answers[1].target = ""; await chooseHandling(s.message); assert.equal(attacks.length, 1);
assert.deepEqual(attacks[0].message.data.system.targets, []); assert.equal(attacks[0].config.target, null);
s = setup(); s.options("attack"); answers[1] = () => { s.horse.items.splice(0); return { attack: s.attack.uuid, target: s.target.uuid }; };
await chooseHandling(s.message); assert.equal(attacks.length, 0); assert.equal(reactionAvailable(s.horse), true);
s = setup(); s.options("attack"); answers[1] = null; await chooseHandling(s.message); assert.equal(reactionAvailable(s.horse), true);
s = setup(); failure = "roll"; s.options("attack"); await assert.rejects(chooseHandling(s.message), /roll/); failure = null; await chooseHandling(s.message); assert.equal(fees.length, 1);

s = setup(); s.rider.object.control(); s.mount.object.control({ releaseOthers: false });
assert.equal(nativeOccupyingTokens({ i: 0, j: 0, k: 0 }, s.mount.object).has(s.rider.object), false);
assert.equal(nativeOccupyingTokens({ i: 0, j: 2, k: 0 }, s.mount.object).has(s.target.object), true);
const simplePlan = { origin: position(s.mount), waypoints: [{ ...position(s.mount), x: 600 }] };
assert.ok(handlingPaths(s.rider, s.mount, simplePlan, "walk"));
CONFIG.Token.movement.actions.crawl = { label: "Crawl" };
assert.ok(handlingPaths(s.rider, s.mount, simplePlan, "crawl"));
assert.equal(handlingPaths(s.rider, s.mount, { origin: position(s.mount), waypoints: [{ ...position(s.mount), x: 800 }] }, "crawl"), undefined);
// 2024 example: Fly 10, walk 10, then fly 20 with Speed 30/Fly 40. Speeds don't create separate budgets.
s.horse.system.attributes.movement.speeds.walk = 30; s.horse.system.attributes.movement.speeds.fly = 40;
const waypoint = (x, action) => ({ ...position(s.mount), x, action });
let mixed = { origin: position(s.mount), waypoints: [waypoint(0, "fly"), waypoint(200, "fly"), waypoint(400, "walk"), waypoint(800, "fly")] };
assert.ok(handlingPaths(s.rider, s.mount, mixed, "walk"));
assert.deepEqual(handlingPaths(s.rider, s.mount, mixed, "walk").mounted.map(p => p.action), ["fly", "fly", "walk", "fly"]);
assert.equal(handlingPaths(s.rider, s.mount, { ...mixed, waypoints: [waypoint(0, "fly"), waypoint(700, "fly"), waypoint(800, "walk")] }, "walk"), undefined);
assert.equal(handlingPaths(s.rider, s.mount, { ...mixed, waypoints: [waypoint(0, "walk"), waypoint(700, "walk"), waypoint(800, "fly")] }, "walk"), undefined);
assert.equal(handlingPaths(s.rider, s.mount, { ...mixed, waypoints: [waypoint(800, "blink")] }, "walk"), undefined);
assert.equal(handlingPaths(s.rider, s.mount, { ...mixed, waypoints: [waypoint(800, "burrow")] }, "walk"), undefined);
s.horse.system.attributes.movement.speeds.fly = 30; assert.equal(handlingPaths(s.rider, s.mount, mixed, "walk"), undefined);
s.horse.system.attributes.movement.speeds.walk = 60; s.horse.system.attributes.movement.speeds.fly = 0;
assert.ok(handlingPaths(s.rider, s.mount, { ...mixed, waypoints: [waypoint(0, "walk"), waypoint(300, "walk"), waypoint(700, "swim")] }, "walk"));
assert.equal(handlingPaths(s.rider, s.mount, { ...mixed, waypoints: [waypoint(0, "walk"), waypoint(300, "walk"), waypoint(800, "swim")] }, "walk"), undefined);
// Endpoint cannot overlap a third creature, including an ally; passengers sharing the mount are permitted.
assert.equal(handlingPaths(s.rider, s.mount, { ...mixed, waypoints: [waypoint(200, "walk")] }, "walk"), undefined);
const operation = { id: "move", passed: { waypoints: [waypoint(0, "spikependiumHandling_climb"), waypoint(0, "spikependiumHandling_climb")] }, destination: position(s.mount) };
const raw = structuredClone(operation), fall = data => nativeShouldFall.call({ _isFalling: () => true }, data, () => false);
assert.equal(fall(operation), true); assert.equal(handlingFalling.call(s.mount, fall, operation), false); assert.deepEqual(operation, raw);
s.rider.movement = { id: "move", updateOptions: { spikependium: { passenger: true, mount: s.mount.uuid, handling: "event" } } };
operation.passed.waypoints[1].action = "spikependiumHandling_fly";
assert.equal(handlingFalling.call(s.rider, fall, operation), false);
s.mount.x = 1000; assert.equal(handlingFalling.call(s.rider, fall, operation), true); s.mount.x = 0;
s.horse.system.attributes.hp.value = 0; assert.equal(handlingFalling.call(s.rider, fall, operation), true); s.horse.system.attributes.hp.value = 20;
s.horse.statuses.add("falling"); assert.equal(handlingFalling.call(s.rider, fall, operation), true); s.horse.statuses.clear();
s.horse.statuses.add("stunned"); assert.equal(handlingFalling.call(s.rider, fall, operation), false); s.horse.statuses.clear();
assert.equal(handlingFalling.call(s.mount, () => "ordinary", { id: "normal", passed: { waypoints: [waypoint(0, "walk")] } }), "ordinary");
game.settings = { get: () => "full" }; s.horse.system.attributes.movement.ignoredDifficultTerrain = new Set();
const tokenObject = { actor: s.horse, layer: { isOccupiedGridSpaceDifficult: () => true } };
const wrappedCost = options => nativeMovementCost.call(tokenObject, options, () => () => 0);
const free = handlingMovementCost.call(tokenObject, wrappedCost, {});
assert.equal(wrappedCost({})({}, {}, 5, {}), 5);
assert.equal(free({}, {}, 5, { action: "spikependiumHandling_walk" }), 0);
assert.equal(free({}, {}, 5, { action: "walk" }), 5);
assert.equal(handlingMovementCost(() => () => Infinity)({}, {}, 5, { action: "spikependiumHandling_walk" }), Infinity);
s.scene.grid.units = "m"; s.horse.system.attributes.movement.units = "m"; s.horse.system.attributes.movement.speeds.walk = 18;
assert.ok(handlingPaths(s.rider, s.mount, { origin: position(s.mount), waypoints: [{ ...position(s.mount), x: 300 }] }, "walk"));
const main = fs.readFileSync("scripts/spikependium.mjs", "utf8");
for (const text of ['"preCreateChatMessage", recordHandlingHits', 'chooseHandling(message)', '!isHandlingAttack(activity, config)', 'handlingRollAttack.call(this',
  '"dnd5e.preRollAttackV2", validateHandlingAttack', '"init", registerHandlingMovement']) assert.ok(main.includes(text));
console.log("Handling: native Warhorse, melee/crit/fumble/thrown, 5 feet/height/levels, confirmed mount, native reaction/deltas/refund, paired constrained movement and cost limit, one native attack and stale-card guard, owner/GM rights, cancel/stale/partial failure/control restore: OK.");
