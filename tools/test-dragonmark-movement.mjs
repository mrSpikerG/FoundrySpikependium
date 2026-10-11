import assert from "node:assert/strict";
import fs from "node:fs";
import { canUseMovementModifier, prepareMovementDialog, captureMovementTarget, prepareMovementUpdates, recordMovementCast,
  applyMovementCast, resumeMovementCasts, movementMarkCost, refreshMovementMarks } from "../scripts/dragonmark-movement.mjs";
import { prepareResourceUpdates } from "../scripts/resources.mjs";
import { captureShadowSpell, recordShadowSpell, prepareShadowAttack, finalizeShadowAttack, finishShadowAttack,
  applyShadowEndingMessage, recordShadowDamage, finishShadowDamage, prepareShadowConcentrationDelete } from "../scripts/dragonmark-shadow.mjs";
import { nativeMovementCost } from "./data/dnd5e-movement-native.mjs";
import { isExpiryEvent } from "./data/dnd5e-making-native.mjs";

const spells = Object.fromEntries(["shield", "comprehend-languages"].map(id => [id, JSON.parse(fs.readFileSync(`tools/data/dnd5e-${id}.json`, "utf8"))]));
const list = a => Object.assign(a, { get(id) { return this.find(e => e.id === id); } });
const documents = new Map(); let serial = 0, writes = [];
const set = (object, path, value) => { const keys = path.split("."); for (const key of keys.slice(0, -1)) object = object[key] ??= {}; object[keys.at(-1)] = structuredClone(value); };
globalThis.fromUuidSync = uuid => documents.get(uuid);
globalThis.ui = { notifications: { warn() {}, error() {} } };
globalThis.foundry = { utils: { setProperty: set, randomID: () => `MOVE${String(serial++).padStart(12, "0")}` },
  data: { fields: { BooleanField: class { constructor(d) { Object.assign(this, d); } }, StringField: class { constructor(d) { Object.assign(this, d); } } } } };
globalThis.ActiveEffect = { implementation: { getEffectStart() { return { time: game.time.worldTime, round: game.combat?.round, turn: game.combat?.turn }; } } };
globalThis.dnd5e = { utils: {
  convertTime(value, units) { return { value: value * ({ hour: 3600, round: 6, seconds: 1 }[units]) }; },
  convertLength(value, from, to) { const scale = { ft: 1, m: 10 / 3 }; return value * scale[from] / scale[to]; },
  getSceneTargets(actor) { return canvas.scene.tokens.filter(t => t.actor === actor).map(t => ({ document: t })); }
} };
function setup(identifier = "comprehend-languages") {
  documents.clear(); serial = 0; writes = [];
  const player = { id: "player", isGM: false }, gm = { id: "gm", isGM: true, isActiveGM: true };
  const users = list([player, gm]); users.activeGM = gm;
  const scene = { uuid: "Scene.test", flags: {}, tokens: [], canUserModify: user => user.isGM,
    async setFlag(module, key, value) { set(this, `flags.${module}.${key}`, value); },
    grid: { units: "ft", size: 100, distance: 5, isGridless: false,
      getCenterPoint(o) { return "j" in o ? { x: o.j * this.size + (this.isGridless ? 0 : 50), y: o.i * this.size + (this.isGridless ? 0 : 50), elevation: o.k * this.distance }
        : { ...o }; },
      measurePath([a, b]) { return { distance: Math.hypot((a.x - b.x) * this.distance / this.size, (a.y - b.y) * this.distance / this.size, a.elevation - b.elevation) }; } }
  };
  function creature(uuid) {
    const actor = { uuid, isOwner: true, flags: {}, effects: list([]), items: list([]), statuses: new Set(), inCombat: true,
      system: { isCreature: true, attributes: { movement: { ignoredDifficultTerrain: new Set() } } },
      testUserPermission: user => user.id === player.id || user.isGM,
      async setFlag(module, key, value) { set(this, `flags.${module}.${key}`, value); },
      async createEmbeddedDocuments(type, data, options) {
        assert.equal(type, "ActiveEffect"); assert.equal(options.keepId, true);
        for (const d of data) {
          assert.ok(!this.effects.get(d._id));
          const effect = { ...structuredClone(d), id: d._id, uuid: `${this.uuid}.ActiveEffect.${d._id}`, parent: this,
            get active() { return !this.disabled && !this.duration.expired && !actor.statuses.has("antimagic"); } };
          this.effects.push(effect); documents.set(effect.uuid, effect); writes.push({ actor: this.uuid, data: structuredClone(d) });
        }
      },
      async deleteEmbeddedDocuments(type, ids) {
        for (const id of ids) {
          const e = this.effects.get(id);
          if (e) await prepareShadowConcentrationDelete.call(e, async () => { documents.delete(e.uuid); this.effects.splice(this.effects.indexOf(e), 1); });
        }
      }
    };
    documents.set(uuid, actor); return actor;
  }
  function token(actor, id, x, disposition = 1) {
    const t = { uuid: `${scene.uuid}.Token.${id}`, name: id, actor, parent: scene, x, y: 0, elevation: 0, disposition, width: 1, height: 1,
      getCenterPoint() { return { x: this.x + 50, y: this.y + 50, elevation: this.elevation }; },
      getOccupiedGridSpaceOffsets() { return scene.grid.isGridless ? [] : [{ i: this.y / 100, j: this.x / 100, k: this.elevation / scene.grid.distance }]; } };
    scene.tokens.push(t); documents.set(t.uuid, t); return t;
  }
  const caster = creature("Actor.caster"), marked = creature("Actor.marked"), enemy = creature("Scene.test.Token.enemy.Actor.enemy");
  const source = token(caster, "caster", 0), mark = token(marked, "marked", 400), moving = token(enemy, "enemy", 800, -1);
  const rule = identifier === "shield" ? "sentinel" : "scribing", mod = rule === "sentinel" ? "HgsLprG4WQQojeEg" : "CjVbzKrU20bUDbHe";
  const featData = JSON.parse(fs.readFileSync(`packs/_source/feats/${fs.readdirSync("packs/_source/feats").find(f => f.startsWith(`feat-greater-${rule}_`))}`, "utf8"));
  assert.equal(featData.system.activities[mod].uses.max, "");
  const feat = { id: featData._id, uuid: `${caster.uuid}.Item.${featData._id}`, flags: structuredClone(featData.flags), system: { activities: new Map([[mod, {}]]) } };
  caster.items.push(feat);
  const native = spells[identifier];
  const item = { ...structuredClone(native), id: native._id, uuid: `${caster.uuid}.Item.${native._id}`, flags: {} };
  const data = native.system.activities.dnd5eactivity000;
  const activity = { ...structuredClone(data), id: data._id, uuid: `${item.uuid}.Activity.${data._id}`, actor: caster, item, flags: {},
    duration: { getEffectData: () => native.system.duration }, getUsageToken: () => source };
  globalThis.canvas = { ready: true, scene, visibility: { tokenVision: true } };
  globalThis.game = { user: player, users, actors: [caster, marked], scenes: [scene], messages: [], combat: null,
    settings: { get: () => "full" }, time: { worldTime: 100 } };
  game.user.targets = new Set([mark]);
  for (const value of [scene, item, activity]) documents.set(value.uuid, value);
  const config = { spikependium: { movementMark: true, movementTarget: mark.uuid } }, messageConfig = { create: true, data: { system: { targets: [{ actor: caster.uuid, token: source.uuid }] } } };
  return { caster, marked, enemy, source, mark, moving, scene, activity, config, messageConfig, player, gm, feat, mod };
}
const plan = () => ({ actor: {}, item: [{ _id: "spell", "system.uses.spent": 1 }], rolls: [], create: [], delete: [] });
function cast(s) {
  assert.notEqual(captureMovementTarget(s.activity, s.config, s.messageConfig), false);
  const updates = prepareMovementUpdates(s.activity, s.config, plan()); assert.ok(updates);
  assert.equal(updates.item.length, 1); assert.equal(updates.item[0]["system.uses.spent"], 1);
  for (const [key, value] of Object.entries(updates.actor)) set(s.caster, key, value);
  recordMovementCast(s.activity, s.messageConfig);
  const message = { uuid: "ChatMessage.cast", type: "usage", flags: s.messageConfig.data.flags, author: s.player,
    system: structuredClone(s.messageConfig.data.system), getAssociatedActivity: () => s.activity, getAssociatedActor: () => s.caster, getAssociatedItem: () => s.activity.item };
  documents.set(message.uuid, message); game.messages.push(message); return message;
}
const segment = { width: 1, height: 1, level: "ground", action: "walk", teleport: false, actionConfig: { measure: true } };
function cost(s, token = s.moving, extraTerrain = 0) {
  const object = { actor: token.actor, document: token, layer: { isOccupiedGridSpaceDifficult: () => extraTerrain > 0 } };
  const native = options => nativeMovementCost.call(object, options, () => (_a, _b, distance) => distance);
  return movementMarkCost.call(object, native, { preview: false });
}
const o = (j, i = 0, k = 0) => ({ i, j, k });
let s = setup();
assert.equal(canUseMovementModifier({ id: s.mod, item: s.feat }), false); assert.equal(canUseMovementModifier(s.activity), true);
class UsageDialog { async _prepareConsumptionContext(c) { return c; } }
const dialog = { applicationClass: UsageDialog }; prepareMovementDialog(s.activity, s.config, dialog);
const app = new dialog.applicationClass(); app.config = s.config;
const context = await app._prepareConsumptionContext({ fields: [], inputs: { createCheckboxInput() {} } });
assert.deepEqual(context.fields.map(f => f.name), ["spikependium.movementMark", "spikependium.movementTarget"]);
assert.equal(context.fields[1].field.choices[s.mark.uuid], s.mark.name);
captureMovementTarget(s.activity, s.config, s.messageConfig);
const resourceUpdates = await prepareResourceUpdates.call(s.activity, async () => plan(), s.config);
assert.equal(resourceUpdates.item.length, 1); assert.equal(Object.keys(resourceUpdates.actor).length, 1);
recordMovementCast(s.activity, s.messageConfig); assert.equal(s.messageConfig.data.flags, undefined);
s.config.spikependium.movementMark = false;
assert.equal(prepareMovementUpdates(s.activity, s.config, plan()).item.length, 1);
for (const mutate of [s => s.mark.x = 700, s => s.mark.elevation = 40, s => s.mark.parent = {}, s => s.messageConfig.create = false,
  s => s.caster.statuses.add("antimagic"), s => s.caster.statuses.add("stunned"), s => game.user.targets.clear(),
  s => s.activity.item.flags.spikependium = { storedSpell: true }, s => s.caster.items.splice(0),
  s => { game.users.activeGM = null; s.marked.isOwner = false; }]) {
  s = setup(); mutate(s); assert.equal(captureMovementTarget(s.activity, s.config, s.messageConfig), false);
}
s = setup(); captureMovementTarget(s.activity, s.config, s.messageConfig); s.mark.x = 700;
assert.equal(prepareMovementUpdates(s.activity, s.config, plan()), false);
s = setup(); let message = cast(s); game.user = s.gm; await applyMovementCast(message);
assert.equal(writes.length, 1); assert.equal(s.caster.effects.length, 0);
const effect = s.marked.effects[0]; assert.equal(effect.duration.value, 3600); assert.equal(effect.system.magical, true);
assert.deepEqual(effect.system.changes, []); assert.equal(effect.start.time, 100); assert.equal(message.system.targets[0].actor, s.caster.uuid);
await resumeMovementCasts(); assert.equal(writes.length, 1);
let measure = cost(s);
assert.equal(measure(o(8), o(7), 5, segment), 10); assert.equal(measure(o(7), o(8), 5, segment), 5);
assert.equal(measure(o(11), o(10), 5, segment), 5); assert.equal(measure(o(10), o(9), 5, segment), 10);
assert.equal(measure(o(4, 0, 5), o(4, 0, 4), 5, segment), 10);
assert.equal(measure(o(8), o(7), 5, { ...segment, teleport: true }), 5);
assert.equal(measure(o(8), o(7), 5, { ...segment, actionConfig: { costMultiplier: 0 } }), 5);
assert.equal(cost(s, s.moving, 1)(o(8), o(7), 5, segment), 15);
assert.equal(cost(s, s.moving, 1)(o(8), o(7), 5, { ...segment, terrain: { difficultTerrain: true } }), 10);
s.moving.disposition = 1; assert.equal(measure(o(8), o(7), 5, segment), 5);
s.moving.disposition = 0; assert.equal(measure(o(8), o(7), 5, segment), 5); s.moving.disposition = -1;
for (const change of [() => effect.disabled = true, () => effect.duration.expired = true, () => s.marked.statuses.add("antimagic")]) {
  change(); assert.equal(measure(o(8), o(7), 5, segment), 5); effect.disabled = false; effect.duration.expired = false; s.marked.statuses.clear();
}
game.settings.get = () => "none"; assert.equal(cost(s)(o(8), o(7), 5, segment), 5); game.settings.get = () => "full";
s.scene.grid.units = "m"; s.scene.grid.distance = 1.5;
assert.equal(cost(s)(o(8), o(7), 1.5, segment), 3);
s.scene.grid.units = "ft"; s.scene.grid.distance = 5; s.scene.grid.isGridless = true;
measure = cost(s); assert.equal(measure(o(12), o(4), 40, segment), 70);
assert.equal(measure(o(0), o(8), 40, segment), 60); // Passes the anchor: only the approaching half costs extra.
assert.equal(measure(o(4, -4), o(4, 4), 40, segment), 60);
assert.equal(measure(o(4, 0, 8), o(4), 40, segment), 70);
const copy = { ...effect, flags: structuredClone(effect.flags) }; s.enemy.effects.push(copy);
copy.flags.spikependium.movementMark.token = s.moving.uuid;
// Same rule on disjoint sections counts both sections; overlapping sections still cost only one extra foot.
s.moving.x = 2000; assert.equal(measure(o(0), o(24), 120, segment), 170);
s.moving.x = s.mark.x; assert.equal(measure(o(0), o(8), 40, segment), 60);
s.enemy.effects.splice(0); s.moving.x = 800;
let refreshes = 0; s.moving.object = { recalculatePlannedMovementPath() { refreshes++; } };
refreshMovementMarks(); assert.equal(refreshes, 1);
await s.marked.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
assert.equal(s.marked.flags.spikependium.movementReceipts[effect.id], true);
await resumeMovementCasts(); assert.equal(writes.length, 1); assert.equal(s.marked.effects.length, 0);
refreshMovementMarks(); assert.equal(refreshes, 1); refreshMovementMarks(true); assert.equal(refreshes, 2);

s = setup("shield"); message = cast(s); game.user = s.gm; await applyMovementCast(message);
const sentinel = s.marked.effects[0]; assert.equal(sentinel.duration.expiry, "targetEnd"); assert.equal(sentinel.duration.value, null);
measure = cost(s, s.mark);
assert.equal(measure(o(4), o(5), 5, segment), 10); assert.equal(measure(o(5), o(4), 5, segment), 5);
assert.equal(measure(o(10), o(11), 5, segment), 10); assert.equal(cost(s)(o(4), o(5), 5, segment), 5);
s.source.x = 900; assert.equal(measure(o(4), o(5), 5, segment), 5); s.source.x = 0;
s.scene.grid.isGridless = true; assert.equal(measure(o(-4), o(4), 40, segment), 60);
const combatant = { id: "target", actor: s.marked }, other = { id: "other", actor: s.caster };
const combat = { round: 1, turn: 0, combatant: other, previous: { combatantId: "other" }, getCombatantsByActor: actor => actor === s.marked ? [combatant] : [other] };
sentinel.actor = s.marked; sentinel.specialDuration = "targetEnd"; sentinel.start.combat = combat; sentinel.start.round = 1; sentinel.start.turn = 1;
combat.previous.combatantId = "target";
assert.equal(isExpiryEvent.call(sentinel, "turnEnd", { combat, round: 1, turn: 1 }), false);
assert.equal(isExpiryEvent.call(sentinel, "turnEnd", { combat, round: 2, turn: 1 }), true);
assert.equal(isExpiryEvent.call(sentinel, "turnStart", { combat, round: 2, turn: 1 }), false);
s.marked.inCombat = false; assert.equal(isExpiryEvent.call(sentinel, "updateWorldTime"), true);

s = setup("shield"); s.source.x = 2000;
s.caster.classes = { artificer: { system: { levels: 5 } } };
s.enemy.flags = { spikependium: { key: "actor:reanimated-companion:conduit" }, dnd5e: { summon: { origin: "Item.owner" } } };
s.enemy.system.attributes.hp = { value: 10 }; documents.set("Item.owner", { actor: s.caster });
s.activity.item.flags.spikependium = { conduitCasting: { owner: s.caster.uuid, companion: s.moving.uuid } };
s.activity.getUsageToken = () => s.moving;
message = cast(s); game.user = s.gm; await applyMovementCast(message); assert.equal(writes.length, 1);
assert.equal(cost(s, s.mark)(o(9), o(10), 5, segment), 5); // Moves away from conduit but toward actual caster.
assert.equal(cost(s, s.mark)(o(4), o(3), 5, segment), 10);

// Scribing uses the same actual-roll, paid-cast and applied-damage endings as Shadow, except unarmed saves.
async function marked() { const s = setup(); const message = cast(s); game.user = s.gm; await applyMovementCast(message); return s; }
s = await marked();
let config = { subject: { actor: s.marked } }, card = { create: false, data: {} };
prepareShadowAttack(config, {}, card); const roll = { _evaluated: false, options: {} }; finalizeShadowAttack([roll], config);
await finishShadowAttack([roll], { subject: config.subject }); assert.equal(s.marked.effects.length, 1);
roll._evaluated = true; await finishShadowAttack([roll], { subject: config.subject }); assert.equal(s.marked.effects.length, 0);
s = await marked();
const unarmed = { actor: s.marked, type: "save", item: { type: "weapon", system: { identifier: "unarmed-strike" }, flags: {} } };
card = { data: {} }; captureShadowSpell(unarmed); recordShadowSpell(unarmed, card); assert.equal(card.data.flags, undefined);
const spell = { actor: s.marked, type: "utility", item: { type: "spell", flags: {} } };
captureShadowSpell(spell); recordShadowSpell(spell, card); assert.ok(card.data.flags.spikependium.shadowEnding);
await applyShadowEndingMessage({ flags: card.data.flags, author: s.player, type: "usage", getAssociatedActor: () => s.marked, getAssociatedActivity: () => spell });
assert.equal(s.marked.effects.length, 0);
s = await marked();
const damage = { uuid: "ChatMessage.damage", type: "damage", author: s.player, getAssociatedActor: () => s.marked };
documents.set(damage.uuid, damage); let updates = {};
recordShadowDamage(s.enemy, 0, updates, { origin: damage }); assert.deepEqual(updates, {});
recordShadowDamage(s.enemy, 2, updates, { origin: damage });
for (const [key, value] of Object.entries(updates)) set(s.enemy, key, value);
await finishShadowDamage(s.enemy); assert.equal(s.marked.effects.length, 0);
await resumeMovementCasts(); assert.equal(s.marked.effects.length, 0);

// No GM: the caster may apply to their own targets; no writes are delegated to other owners.
s = setup(); game.users.activeGM = null; message = cast(s); await applyMovementCast(message);
assert.equal(writes.length, 1); assert.equal(s.scene.flags.spikependium, undefined); await resumeMovementCasts(); assert.equal(writes.length, 1);
s = setup(); message = cast(s); game.user = s.gm; game.time.worldTime++;
await applyMovementCast(message); assert.equal(writes.length, 0);
s = setup(); message = cast(s); game.user = s.gm; message.author = { id: "stranger", isGM: false };
await applyMovementCast(message); assert.equal(writes.length, 0);
s = setup(); message = cast(s); game.user = s.gm; let fail = true; const write = s.marked.setFlag;
s.marked.setFlag = async function(...args) { if (fail) { fail = false; throw Error("receipt"); } return write.apply(this, args); };
await assert.rejects(applyMovementCast(message), /receipt/); assert.equal(writes.length, 1);
await s.marked.deleteEmbeddedDocuments("ActiveEffect", [s.marked.effects[0].id]);
await resumeMovementCasts(); assert.equal(writes.length, 1); assert.equal(s.marked.effects.length, 0);
s = setup(); message = cast(s); game.user = s.gm; fail = true; const writeAgain = s.marked.setFlag;
s.marked.setFlag = async function(...args) { if (fail) { fail = false; throw Error("receipt"); } return writeAgain.apply(this, args); };
await assert.rejects(applyMovementCast(message), /receipt/);
await resumeMovementCasts(); assert.equal(writes.length, 1);
const main = fs.readFileSync("scripts/spikependium.mjs", "utf8");
for (const text of ['"dnd5e.preActivityConsumption", captureMovementTarget', '"dnd5e.preCreateUsageMessage", recordMovementCast',
  'prepareMovementDialog(activity, config, dialog)', '"CONFIG.Token.objectClass.prototype._getMovementCostFunction", function', 'movementMarkCost.call(this, wrapped']) assert.ok(main.includes(text));
console.log("Movement marks: native spell fees/self targets preserved, 30 feet/height/metres, native movement cost/terrain/teleport, gridless direction and radius, Native targetEnd, actual attack/spell/damage endings, rights, replay and partial failures: OK.");
