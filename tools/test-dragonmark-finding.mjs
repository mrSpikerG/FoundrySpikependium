import assert from "node:assert/strict";
import fs from "node:fs";
import { findingEnhancement, canUseFindingModifier, captureFindingTarget, prepareFindingUpdates,
  prepareFindingConcentration, findingBlocksInvisible, prepareFindingActorEffects, refreshFindingTargets,
  observeFindingHp, guardFindingUpdate } from "../scripts/dragonmark-finding.mjs";
import { prepareChoiceDialog } from "../scripts/choices.mjs";
import { prepareResourceUpdates } from "../scripts/resources.mjs";

const mod = "Zf2JSYXjA94dulKh", move = "NQtVK0T5uwfMPGQL";
const doc = JSON.parse(fs.readFileSync(`packs/_source/feats/${fs.readdirSync("packs/_source/feats").find(f => f.startsWith("feat-greater-finding_"))}`, "utf8"));
assert.equal(doc.system.activities[mod].uses.max, "1");
assert.equal(doc.system.activities[mod].uses.recovery[0].period, "lr");
globalThis.ui = { notifications: { warn() {}, error() {} } };
globalThis.foundry = { data: { fields: { BooleanField: class { constructor(data) { Object.assign(this, data); } } } } };
globalThis.dnd5e = { utils: { convertLength(value, from, to) { const units = { ft: 1, m: 10 / 3 }; return value * units[from] / units[to]; } } };
const documents = new Map();
globalThis.fromUuidSync = uuid => documents.get(uuid);
globalThis.game = { actors: [], scenes: [], user: { targets: new Set(), isActiveGM: true }, users: { activeGM: {} } };
const list = items => Object.assign(items, { get(id) { return this.find(i => i.id === id); } });
function setup() {
  documents.clear();
  const scene = { uuid: "Scene.s", tokens: [], grid: { units: "ft", getCenterPoint(offset) { return offset; },
    measurePath([a, b]) { return { distance: Math.hypot(a.x - b.x, a.y - b.y, a.elevation - b.elevation) }; } } };
  function token(actor, id, x) {
    const t = { uuid: `${scene.uuid}.Token.${id}`, parent: scene, actor, x, elevation: 0,
      getOccupiedGridSpaceOffsets() { return [{ x: this.x, y: 0 }]; }, getCenterPoint() { return { x: this.x, y: 0, elevation: this.elevation }; } };
    scene.tokens.push(t); documents.set(t.uuid, t); documents.set(actor.uuid, actor); return t;
  }
  function creature(uuid, hp) {
    const actor = { uuid, isOwner: true, effects: [], statuses: new Set(), system: { isCreature: true, attributes: { hp: { value: hp } } },
      *allApplicableEffects() { yield* this.effects; }, getActiveTokens() { return []; },
      reset() { this.statuses = new Set(this.effects.filter(e => e.active).flatMap(e => [...e.statuses]));
        prepareFindingActorEffects.call(this, () => {}, "initial"); prepareFindingActorEffects.call(this, () => {}, "final"); } };
    return actor;
  }
  const caster = creature("Actor.caster", 20), target = creature("Scene.s.Token.target.Actor.target", 10), next = creature("Actor.next", 10);
  const resource = { id: mod, uses: { max: 1, spent: 0, get value() { return this.max - this.spent; } } };
  const feat = { ...structuredClone(doc), id: doc._id, uuid: `Actor.caster.Item.${doc._id}`, system: { activities: new Map([[mod, resource]]) } };
  caster.items = list([feat]); caster.classes = {}; caster.system.details = { level: 4 };
  const sourceToken = token(caster, "caster", 0), targetToken = token(target, "target", 60), nextToken = token(next, "next", 70);
  const activity = { id: "vxr2JKuQ3jyMDTwb", uuid: "Actor.caster.Item.spell.Activity.vxr2JKuQ3jyMDTwb", flags: {}, actor: caster,
    item: { type: "spell", uuid: "Actor.caster.Item.spell", flags: {}, system: { identifier: "hunters-mark", level: 1, range: { value: 90, units: "ft" } } },
    consumption: { targets: [] }, range: { value: 90, units: "ft" }, duration: { concentration: true, getEffectData() { return { value: 8, units: "hours" }; } },
    getUsageToken() { return sourceToken; } };
  game.actors = [caster, next]; game.scenes = [scene]; game.user.targets = new Set([{ document: targetToken }]);
  game.users.activeGM = {}; game.user.isActiveGM = true;
  function effect(data) {
    const e = { id: "concentration", uuid: "Actor.caster.ActiveEffect.concentration", parent: caster, type: "condition", system: { type: "concentrating" },
      statuses: new Set(["concentrating"]), flags: { spikependium: { improvedFinding: structuredClone(data) } }, active: true,
      duration: { value: 8, units: "hours", remaining: 28800, expired: false },
      async update(changed, options) {
        if (guardFindingUpdate(this, changed, options) === false) return;
        for (const [key, value] of Object.entries(changed)) { const parts = key.split("."); let object = this;
          for (const part of parts.slice(0, -1)) object = object[part]; object[parts.at(-1)] = structuredClone(value); }
      } };
    caster.effects.push(e); documents.set(e.uuid, e); return e;
  }
  return { activity, caster, feat, resource, target, next, sourceToken, targetToken, nextToken, scene, effect };
}
const improved = () => ({ spikependium: { improvedFinding: true }, concentration: { begin: true } });
const updates = () => ({ actor: {}, item: [{ _id: "spell", "system.uses.spent": 1 }], create: [], delete: [], rolls: [] });
function message(token) { return { data: { system: { targets: [{ actor: token.actor.uuid, token: token.uuid }] } } }; }
function paid(s) {
  const config = improved(); assert.notEqual(captureFindingTarget(s.activity, config, message(s.targetToken)), false);
  const plan = prepareFindingUpdates(s.activity, config, updates()); assert(plan); s.resource.uses.spent = 1;
  const native = { type: "condition", system: { type: "concentrating" }, duration: { value: 8, units: "hours" },
    statuses: ["concentrating"], "flags.dnd5e": { item: { uuid: s.activity.item.uuid } } };
  prepareFindingConcentration(s.caster, s.activity.item, native, s.activity);
  assert.deepEqual(native["flags.dnd5e"], { item: { uuid: s.activity.item.uuid } });
  assert.deepEqual(native.duration, { value: 8, units: "hours" }); assert.deepEqual(native.statuses, ["concentrating"]);
  assert.equal(native.system.magical, undefined); return s.effect(native["flags.spikependium.improvedFinding"]);
}
class UsageDialog { async _prepareConsumptionContext() { return { fields: [], notes: [], inputs: { createCheckboxInput() {} } }; } }
{
  const s = setup(), config = {}, dialog = { configure: false, applicationClass: UsageDialog };
  prepareChoiceDialog(s.activity, config, dialog); assert.equal(dialog.configure, true);
  const app = new dialog.applicationClass(); app.config = config; app.actor = s.caster;
  const context = await app._prepareConsumptionContext({});
  assert.equal(context.fields[0].name, "spikependium.improvedFinding"); assert.equal(context.fields[0].value, false);
  assert.equal(context.hasConsumption, true); assert.equal(canUseFindingModifier({ id: mod, item: s.feat }), false);
  assert.equal(canUseFindingModifier(s.activity), true); assert.equal(canUseFindingModifier(undefined), true);
  const ordinary = updates(); assert.equal(prepareFindingUpdates(s.activity, {}, ordinary), ordinary);
  assert.notEqual(captureFindingTarget(s.activity, improved(), message(s.targetToken)), false);
  const plan = await prepareResourceUpdates.call(s.activity, async () => updates(), improved());
  assert.equal(plan.item[0]["system.uses.spent"], 1); assert.equal(plan.item.length, 2);
  assert.equal(plan.item[1][`system.activities.${mod}.uses.spent`], 1); assert.equal(s.resource.uses.spent, 0);
  const unpaid = {}; prepareFindingConcentration(s.caster, s.activity.item, unpaid, s.activity);
  assert.equal(unpaid["flags.spikependium.improvedFinding"], undefined);
}
for (const failure of ["stored", "wrong-spell", "no-owner", "missing-feat", "exhausted", "instant", "not-concentration", "not-beginning"]) {
  const s = setup(), config = improved(); captureFindingTarget(s.activity, config, message(s.targetToken));
  if (failure === "stored") s.activity.item.flags.spikependium = { storedSpell: {} };
  if (failure === "wrong-spell") s.activity.item.system.identifier = "hex";
  if (failure === "no-owner") s.caster.isOwner = false;
  if (failure === "missing-feat") s.caster.items = [];
  if (failure === "exhausted") s.resource.uses.spent = 1;
  if (failure === "instant") s.activity.duration.getEffectData = () => ({ value: 0 });
  if (failure === "not-concentration") s.activity.duration.concentration = false;
  if (failure === "not-beginning") config.concentration.begin = false;
  const plan = updates(); assert.equal(prepareFindingUpdates(s.activity, config, plan), false, failure); assert.equal(plan.item.length, 1);
}
for (const failure of ["none", "two", "object", "range", "height", "other-scene", "changed-target", "changed-actor", "missing-descriptor"]) {
  const s = setup(), config = improved(), msg = message(s.targetToken);
  if (failure === "none") game.user.targets.clear();
  if (failure === "two") game.user.targets.add({ document: s.nextToken });
  if (failure === "object") s.target.system.isCreature = false;
  if (failure === "range") s.targetToken.x = 91;
  if (failure === "height") s.targetToken.elevation = 80;
  if (failure === "other-scene") s.targetToken.parent = {};
  if (failure === "changed-target") game.user.targets = new Set([{ document: s.nextToken }]);
  if (failure === "changed-actor") msg.data.system.targets[0].actor = s.next.uuid;
  if (failure === "missing-descriptor") delete msg.data.system.targets;
  assert.equal(captureFindingTarget(s.activity, config, msg), false, failure);
  assert.equal(prepareFindingUpdates(s.activity, config, updates()), false);
}
{
  const s = setup(); s.targetToken.x = 90; s.targetToken.elevation = 0;
  assert.notEqual(captureFindingTarget(s.activity, improved(), message(s.targetToken)), false, "exact range");
  s.scene.grid.units = "m"; s.targetToken.x = 27; s.activity.range = { value: 27, units: "m" };
  assert.notEqual(captureFindingTarget(s.activity, improved(), message(s.targetToken)), false, "native metric units");
  s.targetToken.x = 27.1; assert.equal(captureFindingTarget(s.activity, improved(), message(s.targetToken)), false);
  s.targetToken.x = 0; s.targetToken.elevation = 15; s.activity.range = { value: 90, units: "ft" };
  assert.notEqual(captureFindingTarget(s.activity, improved(), message(s.targetToken)), false, "nearby elevation permitted");
  s.scene.grid.units = "ft"; s.targetToken.x = 120; s.targetToken.elevation = 0;
  s.targetToken.getOccupiedGridSpaceOffsets = () => [{ x: 120, y: 0 }, { x: 90, y: 0 }];
  assert.notEqual(captureFindingTarget(s.activity, improved(), message(s.targetToken)), false, "occupied space, not just the centre");
  s.sourceToken.x = 150; s.targetToken.getOccupiedGridSpaceOffsets = () => [{ x: 240, y: 0 }];
  assert.notEqual(captureFindingTarget(s.activity, improved(), message(s.targetToken)), false, "actual native casting origin");
}
for (const failure of ["declined", "removed", "unpaid", "foreign-actor", "foreign-item", "swapped-token"]) {
  const s = setup(), config = improved(); captureFindingTarget(s.activity, config, message(s.targetToken));
  prepareFindingUpdates(s.activity, config, updates()); s.resource.uses.spent = 1;
  if (failure === "declined") prepareFindingUpdates(s.activity, {}, updates());
  if (failure === "removed") s.caster.items = [];
  if (failure === "unpaid") s.resource.uses.spent = 0;
  if (failure === "swapped-token") s.targetToken.actor = s.next;
  const native = {}; prepareFindingConcentration(failure === "foreign-actor" ? {} : s.caster,
    failure === "foreign-item" ? {} : s.activity.item, native, s.activity);
  assert.equal(native["flags.spikependium.improvedFinding"], undefined, failure);
}
{
  const s = setup(), e = paid(s), invisibility = { type: "base", system: {}, active: true, statuses: new Set(["invisible"]),
    flags: {}, duration: { value: 3600 } };
  s.target.effects.push(invisibility); const original = structuredClone(invisibility);
  assert.equal(findingBlocksInvisible(s.target), true); assert.equal(findingBlocksInvisible(s.next), false);
  s.caster.statuses.add("antimagic"); assert.equal(findingBlocksInvisible(s.target), true, "caster's antimagic does not end an external target's spell");
  s.target.reset(); assert.equal(s.target.statuses.has("invisible"), false); assert.deepEqual(invisibility, original);
  s.target.statuses.add("poisoned"); prepareFindingActorEffects.call(s.target, () => { s.target.statuses.add("invisible"); }, "final");
  assert.equal(s.target.statuses.has("invisible"), false); assert.equal(s.target.statuses.has("poisoned"), true);
  for (const state of ["disabled", "expired", "remaining", "antimagic", "deleted"]) {
    if (state === "disabled") e.active = false;
    if (state === "expired") e.duration.expired = true;
    if (state === "remaining") e.duration.remaining = 0;
    if (state === "antimagic") s.target.effects.push({ type: "base", system: {}, flags: {}, active: true, statuses: new Set(["antimagic"]) });
    if (state === "deleted") s.caster.effects = [];
    s.target.reset(); assert.equal(s.target.statuses.has("invisible"), true, state); assert.deepEqual(invisibility, original);
    e.active = true; e.duration.expired = false; e.duration.remaining = 28800;
    s.target.effects = [invisibility]; s.caster.effects = [e];
  }
  refreshFindingTargets(); assert.equal(s.target.statuses.has("invisible"), false);
  s.caster.effects = []; refreshFindingTargets(); assert.equal(s.target.statuses.has("invisible"), true);
}
{
  const s = setup(), e = paid(s), transfer = { ...s.activity, id: move, duration: { concentration: false } }, config = { concentration: { begin: false } };
  game.user.targets = new Set([{ document: s.nextToken }]);
  captureFindingTarget(transfer, config, message(s.nextToken)); assert.equal(prepareFindingUpdates(transfer, config, updates()), false);
  s.target.system.attributes.hp.value = 0; await observeFindingHp(s.target); assert.equal(e.flags.spikependium.improvedFinding.hitZero, true);
  s.target.system.attributes.hp.value = 5; await observeFindingHp(s.target); assert.equal(e.flags.spikependium.improvedFinding.hitZero, true, "healing does not undo reaching zero");
  s.caster.items = []; captureFindingTarget(transfer, config, message(s.nextToken));
  const plan = prepareFindingUpdates(transfer, config, updates()); assert.equal(plan.item.length, 1, "transfer consumes no additional feat use");
  assert.equal(plan.operations.length, 1); assert.equal(plan.operations[0].parent, s.caster);
  await e.update(plan.operations[0].updates[0], plan.operations[0]);
  assert.deepEqual(e.duration, { value: 8, units: "hours", remaining: 28800, expired: false });
  assert.equal(e.flags.spikependium.improvedFinding.hitZero, false);
  assert.equal(findingBlocksInvisible(s.target), false); assert.equal(findingBlocksInvisible(s.next), true);
  assert.equal(guardFindingUpdate(e, {}, { spikependiumFindingSource: plan.operations[0].spikependiumFindingSource }), false, "stale old-target HP update blocked");
  const oldTarget = structuredClone(e.flags.spikependium.improvedFinding);
  s.target.system.attributes.hp.value = 0; await observeFindingHp(s.target); assert.deepEqual(e.flags.spikependium.improvedFinding, oldTarget);
}
{
  const s = setup(); s.target.system.attributes.hp.value = 0; const e = paid(s);
  await observeFindingHp(s.target); assert.equal(e.flags.spikependium.improvedFinding.hitZero, false, "initial zero HP is not a later drop");
  s.target.system.attributes.hp.value = 5; await observeFindingHp(s.target);
  s.target.system.attributes.hp.value = 0; const zero = observeFindingHp(s.target);
  s.target.system.attributes.hp.value = 4; const heal = observeFindingHp(s.target);
  await Promise.all([zero, heal]); assert.equal(e.flags.spikependium.improvedFinding.hitZero, true);
  assert.equal(e.flags.spikependium.improvedFinding.lastHp, 4);
  game.user.isActiveGM = false; s.target.system.attributes.hp.value = 3; await observeFindingHp(s.target);
  assert.equal(e.flags.spikependium.improvedFinding.lastHp, 4, "non-GM doesn't compete with the active GM");
  game.users.activeGM = undefined; await observeFindingHp(s.target); assert.equal(e.flags.spikependium.improvedFinding.lastHp, 3);
  s.caster.isOwner = false; s.target.system.attributes.hp.value = 2; await observeFindingHp(s.target);
  assert.equal(e.flags.spikependium.improvedFinding.lastHp, 3, "no writes to an unowned caster");
}
{
  const s = setup(), e = paid(s), update = e.update.bind(e); let fail = true;
  e.update = async (...args) => { if (fail) { fail = false; throw new Error("write failed"); } return update(...args); };
  s.target.system.attributes.hp.value = 0; const zero = observeFindingHp(s.target);
  s.target.system.attributes.hp.value = 5; const heal = observeFindingHp(s.target);
  const result = await Promise.allSettled([zero, heal]); assert.equal(result[0].status, "rejected"); assert.equal(result[1].status, "fulfilled");
  assert.equal(e.flags.spikependium.improvedFinding.hitZero, true, "next snapshot recovers zero history after a failed write");
  assert.equal(e.flags.spikependium.improvedFinding.lastHp, 5);
  s.target.system.attributes.hp.value = 0; const pendingZero = observeFindingHp(s.target);
  e.flags.spikependium.improvedFinding = { spell: s.activity.item.uuid, target: { actor: s.next.uuid, token: s.nextToken.uuid }, lastHp: 10, hitZero: false };
  await pendingZero; assert.equal(e.flags.spikependium.improvedFinding.hitZero, false, "queued old-target snapshot cannot affect a transferred mark");
}
const hooks = new Map(), init = [];
globalThis.Hooks = { on(name, fn) { const callbacks = hooks.get(name) ?? []; callbacks.push(fn); hooks.set(name, callbacks); },
  once(name, fn) { if (name === "init") init.push(fn); } };
await import("../scripts/spikependium.mjs");
assert(hooks.get("dnd5e.preActivityConsumption").findIndex(fn => fn.name === "prepareConduitCasting")
  < hooks.get("dnd5e.preActivityConsumption").indexOf(captureFindingTarget), "casting origin is configured before range validation");
for (const [name, fn] of [["dnd5e.preUseActivity", canUseFindingModifier], ["dnd5e.preActivityConsumption", canUseFindingModifier],
  ["dnd5e.preActivityConsumption", captureFindingTarget], ["dnd5e.preBeginConcentrating", prepareFindingConcentration],
  ["preUpdateActiveEffect", guardFindingUpdate], ["updateActorDelta", refreshFindingTargets], ["updateWorldTime", refreshFindingTargets]]) assert(hooks.get(name).includes(fn));
const registrations = new Map(); globalThis.libWrapper = { register(module, name, fn) { assert(!registrations.has(name)); registrations.set(name, fn); } };
globalThis.CONFIG = { DND5E: { activityConsumptionTypes: {}, activityTypes: {}, sourceBooks: {}, featureTypes: { feat: { subtypes: {} }, class: { subtypes: {} } } } };
dnd5e.registry = { spellLists: { register() {} } }; init.at(-1)();
{
  const s = setup(); paid(s); s.target.statuses.add("invisible");
  const wrapper = registrations.get("CONFIG.Actor.documentClass.prototype.applyActiveEffects");
  assert.equal(wrapper.call(s.target, () => "native", "initial"), "native"); assert.equal(s.target.statuses.has("invisible"), false);
}
console.log("Улучшенный поиск: нативный выбор и общий расход, цель/дистанция/высота/метры, подтверждённая оплата и концентрация, подавление преимуществ невидимости без удаления её эффектов, окончание/антимагия, перенос без повторного расхода и сброса срока, история падения до 0 хитов, быстрое лечение, права и защита устаревших обновлений: OK.");
