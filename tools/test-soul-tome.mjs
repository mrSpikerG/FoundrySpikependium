import fs from "node:fs";
import assert from "node:assert/strict";
import { recordSoulTomeDestruction, finishSoulTomeDestruction, resumeSoulTomes, soulTomeEndTurn, prepareSoulTomeRest, applySoulTomeDamage, renderSoulTomeDamage } from "../scripts/soul-tome.mjs";
import { canUseMonsterWeapon } from "../scripts/monster-actions.mjs";
import { nativePerformBulkUpdate } from "./data/dnd5e-arcana-native.mjs";
import { nativeCalculateDamage } from "./data/dnd5e-guardian-native.mjs";

const source = fs.readdirSync("packs/_source/creatures").filter(file => file.startsWith("actor-mm25-arcanaloth"))
  .map(file => JSON.parse(fs.readFileSync(`packs/_source/creatures/${file}`, "utf8")))[0];
assert.ok(source);
const get = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
const set = (object, path, value) => { const keys = path.split("."); for (const key of keys.slice(0, -1)) object = object[key] ??= {}; object[keys.at(-1)] = value; };
const expand = changed => { const result = {}; for (const [path, value] of Object.entries(changed)) set(result, path, value); return result; };
const list = array => Object.assign(array, { get(id) { return this.find(item => item.id === id); } });
let serial = 0, failBefore = false, failAfter = false, batches = [], actors = new Map();
globalThis.foundry = { utils: { getProperty: get, expandObject: expand, deepClone: structuredClone, escapeHTML: text => String(text).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'), randomID: () => String(++serial).padStart(16, "0"),
  isEmpty: value => !value || !Object.keys(value).length }, documents: { async modifyBatch(operations) {
  if (failBefore) throw Error("before commit");
  batches.push(operations);
  for (const op of operations) {
    if (op.documentName === "Actor") for (const update of op.updates) await actors.get(update._id).update(update);
    else if (op.documentName === "ActorDelta") {
      assert.equal(op.updates[0]._id, op.parent.delta.id); await op.parent.actor.update(op.updates[0]);
    } else if (op.documentName === "Item") {
      assert.equal(op.action, "update");
      for (const update of op.updates) await op.parent.items.get(update._id).update(update);
    } else if (op.documentName === "ActiveEffect") {
      assert.equal(op.action, "create");
      for (const data of op.data) { op.parent.effects.push(data); for (const status of data.statuses) op.parent.statuses.add(status); }
    } else assert.fail(`unexpected operation ${op.documentName}`);
  }
  if (failAfter) throw Error("after commit");
} } };
globalThis.ActiveEffect = { implementation: { async fromStatusEffect(status) {
  assert.equal(status, "dead"); return { toObject: () => ({ type: "condition", system: { type: "dead" }, statuses: ["dead"], disabled: false }) };
} } };
globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
class NumericTerm {
  constructor({ number, options = {} }) { this.number = number; this.options = options; }
  get total() { return this.number; } get flavor() { return this.options.flavor; }
  toJSON() { return { class: "NumericTerm", number: this.number, options: this.options }; }
}
class OperatorTerm {
  constructor({ operator }) { this.operator = operator; }
  toJSON() { return { class: "OperatorTerm", operator: this.operator }; }
}
class DamageRoll {
  constructor(total, type, terms = [new NumericTerm({ number: total })]) { this.total = total; this.options = { type }; this.terms = terms; this._evaluated = true; }
  toJSON() { return { total: this.total, options: this.options, terms: this.terms.map(term => term.toJSON()) }; }
  static fromTerms(terms, options) {
    let total = 0, sign = 1;
    for (const term of terms) { if (term instanceof OperatorTerm) sign = term.operator === "-" ? -1 : 1; else total += sign * term.total; }
    const roll = new DamageRoll(total, options.type, terms); roll.options = options; return roll;
  }
}
foundry.dice = { terms: { NumericTerm, OperatorTerm, DiceTerm: class {}, PoolTerm: class {}, RollTerm: {
  fromData(data) { return data.class === "OperatorTerm" ? new OperatorTerm(data) : new NumericTerm(data); }
} } };
const { default: aggregateDamageRolls } = await import("./data/dnd5e-damage-aggregation-native.mjs");
globalThis.CONFIG = { Dice: { DamageRoll }, DND5E: { damageTypes: Object.fromEntries(
  ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"].map(type => [type, {}])),
  healingTypes: { healing: {}, temphp: {}, maximum: {} } }, Actor: { documentClass: class {
    constructor(data) {
      assert.equal(data.type, "npc"); assert.equal(data.system.details.type.custom, "Магический объект");
      this.system = data.system; this.flags = {}; this.effects = [];
      assert.deepEqual(data.system.traits.di.value, ["necrotic", "psychic", "poison"]);
    }
    getRollData() { return {}; }
    changeHasEffect(kind, damage) { return kind === "immunity" && this.system.traits.di.value.includes(damage.type); }
    changeIsIgnored() { return false; }
    calculateDamage(...args) { return nativeCalculateDamage.call(this, ...args); }
  } } };
globalThis.dnd5e = { dice: { aggregateDamageRolls } };
globalThis.Hooks = { call() { return true; } };
function setup({ synthetic = false } = {}) {
  serial = 0; failBefore = failAfter = false; batches = []; actors = new Map();
  const gm = { id: "gm", active: true, isGM: true, isActiveGM: true }, users = list([gm]); users.activeGM = gm;
  globalThis.game = { user: gm, users, actors: [], scenes: [], messages: list([]) };
  const actor = { ...structuredClone(source), id: "arcanaloth", uuid: "Actor.arcanaloth", isOwner: true,
    effects: [], statuses: new Set(), testUserPermission: user => user.isGM || user.owner,
    performBulkUpdate: nativePerformBulkUpdate, async update(changed) { for (const [path, value] of Object.entries(changed)) if (path !== "_id") set(this, path, value); } };
  if (synthetic) {
    actor.uuid = "Scene.scene.Token.arcanaloth.Actor.synthetic";
    actor.parent = { actor, delta: { id: "delta" } };
  }
  actor.items = list(source.items.map(data => {
    const item = { ...structuredClone(data), id: data._id, actor, uuid: `${actor.uuid}.Item.${data._id}`,
      async update(changed) {
        changed = { ...changed }; recordSoulTomeDestruction(this, changed);
        for (const [path, value] of Object.entries(changed)) if (path !== "_id") set(this, path, value);
        await finishSoulTomeDestruction(this);
      } };
    return item;
  }));
  actors.set(actor.id, actor); game.actors = synthetic ? [] : [actor];
  game.scenes = [{ tokens: [{ actor }] }];
  const tome = actor.items.find(item => item.system.identifier === "arcanaloth-soul-tome");
  const claw = { type: "attack", actor, item: actor.items.find(item => item.system.identifier === "arcanaloth-banishing-claw") };
  const ally = { id: "ally", actor: { uuid: "Actor.ally", flags: {}, items: [] } };
  const combat = { id: "combat", previous: { round: 1, turn: 0 }, combatants: [{ id: "arcanaloth", actor }, ally] };
  return { actor, tome, claw, ally, combat,
    async end() { return soulTomeEndTurn.call(combat, async () => "native-result", ally); },
    async rest(type) { const result = { updateItems: [] }; assert.notEqual(prepareSoulTomeRest(actor, result, { type }), false);
      await actor.performBulkUpdate({ item: result.updateItems }); return result; } };
}
{
  const f = setup(); await f.tome.update({ "system.hp.value": 7 }); assert.equal(canUseMonsterWeapon(f.claw), true);
  assert.equal(await f.end(), "native-result"); assert.equal(f.tome.system.hp.value, 35, "any combatant turn end restores the tome");
  await f.tome.update({ "system.hp.value": 9 }); await f.end(); assert.equal(f.tome.system.hp.value, 9, "repeated turn event does not heal later damage");
  f.combat.previous.turn = 1; await f.end(); assert.equal(f.tome.system.hp.value, 35);
  const writeCount = batches.length; await f.end(); assert.equal(batches.length, writeCount, "same event has no extra writes");
}
for (const synthetic of [false, true]) {
  const f = setup({ synthetic });
  await Promise.all([f.tome.update({ "system.hp.value": 0 }), finishSoulTomeDestruction(f.tome)]);
  assert.equal(f.actor.system.attributes.hp.value, 0); assert.equal(f.actor.statuses.has("dead"), true);
  assert.equal(f.actor.effects.filter(effect => effect.statuses.includes("dead")).length, 1);
  assert.equal(f.tome.system.quantity, 0); assert.equal(f.tome.flags.spikependium.soulTome.deathProcessed, true);
  assert.equal(canUseMonsterWeapon(f.claw), false); await f.end(); assert.equal(f.tome.system.hp.value, 0, "destroyed tome never regenerates");
  await resumeSoulTomes(); assert.equal(f.actor.effects.length, 1, "world/token deduplication never repeats death");
  const deathBatch = batches.find(batch => batch.some(op => op.documentName === "ActiveEffect"));
  assert.ok(deathBatch.some(op => op.documentName === (synthetic ? "ActorDelta" : "Actor")));
  assert.ok(deathBatch.some(op => op.documentName === "Item"), "HP, death condition and receipt share the native batch");
  await f.tome.update({ "system.hp.value": 35, "system.quantity": 1 });
  assert.equal(canUseMonsterWeapon(f.claw), false, "manual HP refill cannot silently recreate a destroyed tome");
}
for (const type of ["short", "long"]) {
  const f = setup(); await f.tome.update({ "system.hp.value": 0 });
  const oldGeneration = f.tome.flags.spikependium.soulTome.generation;
  const result = { updateItems: [{ _id: f.tome.id, "system.uses.spent": 2 }], updateData: { "system.attributes.hp.value": 7 } };
  prepareSoulTomeRest(f.actor, result, { type }); assert.equal(result.updateItems.length, 1); assert.equal(result.updateItems[0]["system.uses.spent"], 2);
  assert.equal(result.updateData["system.attributes.hp.value"], 7, "rest HP updates are preserved");
  await f.actor.performBulkUpdate({ item: result.updateItems });
  assert.equal(f.tome.system.hp.value, 35); assert.equal(f.tome.system.quantity, 1); assert.equal(f.tome.system.equipped, true);
  assert.notEqual(f.tome.flags.spikependium.soulTome.generation, oldGeneration); assert.equal(canUseMonsterWeapon(f.claw), true);
  assert.equal(f.actor.statuses.has("dead"), true, "a new book does not revive the arcanaloth");
  await f.actor.update({ "system.attributes.hp.value": 175 }); f.actor.statuses.clear();
  await finishSoulTomeDestruction(f.tome); assert.equal(f.actor.system.attributes.hp.value, 175, "old destruction cannot kill a restored body");
  await f.tome.update({ "system.hp.value": 0 }); assert.equal(f.actor.system.attributes.hp.value, 0, "new generation can be destroyed independently");
}
{
  const f = setup(); await f.tome.update({ "system.hp.value": 0 });
  const result = { updateItems: [] }; prepareSoulTomeRest(f.actor, result, { type: "day" }); assert.deepEqual(result.updateItems, []);
  f.actor.isOwner = false; prepareSoulTomeRest(f.actor, result, { type: "short" }); assert.deepEqual(result.updateItems, []);
}
for (const committed of [false, true]) {
  const f = setup(); failBefore = !committed; failAfter = committed;
  await assert.rejects(() => f.tome.update({ "system.hp.value": 0 }), committed ? /after commit/ : /before commit/);
  failBefore = failAfter = false; await resumeSoulTomes();
  assert.equal(f.actor.system.attributes.hp.value, 0); assert.equal(f.actor.effects.length, 1);
  assert.equal(f.tome.flags.spikependium.soulTome.deathProcessed, true, "resume finishes once even if the server committed before network failure");
}
{
  const f = setup(); f.tome.system.hp.value = 0; await resumeSoulTomes();
  assert.equal(f.actor.statuses.has("dead"), true, "legacy zero-HP tome is recovered after loading");
}
{
  const f = setup(); await f.tome.update({ "system.hp.value": 0 }); await f.rest("short");
  f.actor.statuses.clear(); f.actor.system.attributes.hp.value = 175;
  f.tome.system.hp.value = 0; await resumeSoulTomes();
  assert.equal(f.actor.statuses.has("dead"), true, "damage applied with the module disabled is recovered even after a previous recreation");
}
{
  const f = setup(); f.tome.system.hp.value = 8; failBefore = true;
  await assert.rejects(() => f.end(), /before commit/); assert.equal(f.tome.system.hp.value, 8);
  failBefore = false; await f.end(); assert.equal(f.tome.system.hp.value, 35, "failed turn transaction can resume");
}
{
  const f = setup(); f.tome.system.hp.value = 8; let interrupted = false;
  f.actor.performBulkUpdate = async function(updates) {
    if (!interrupted && updates.item?.some(update => update["flags.spikependium.soulTomeLastEnd"])) {
      interrupted = true; f.tome.system.hp.value = 0;
      f.tome.flags.spikependium ??= {}; f.tome.flags.spikependium.soulTome = { generation: "during-regen", destroyed: true, deathProcessed: false };
      await finishSoulTomeDestruction(f.tome);
    }
    return nativePerformBulkUpdate.call(this, updates);
  };
  await f.end();
  assert.equal(f.actor.statuses.has("dead"), true); assert.equal(f.actor.system.attributes.hp.value, 0);
  assert.equal(f.tome.system.hp.value, 0, "destruction arriving during regeneration wins and is not lost while the actor is locked");
}
for (const reason of ["not-owner", "other-gm", "other-actor", "zero-quantity", "not-in-combat", "before-first-round"]) {
  const f = setup(); f.tome.system.hp.value = 8;
  if (reason === "not-owner") f.actor.isOwner = false;
  if (reason === "other-gm") game.user = { id: "other", isGM: true, isActiveGM: false };
  if (reason === "other-actor") f.actor.flags.spikependium.key = "actor:other";
  if (reason === "zero-quantity") f.tome.system.quantity = 0;
  if (reason === "not-in-combat") f.combat.combatants = [f.ally];
  if (reason === "before-first-round") f.combat.previous.round = 0;
  await f.end(); assert.equal(f.tome.system.hp.value, 8, reason);
}
{
  const f = setup(); const owner = { id: "a", active: true, owner: true }, other = { id: "b", active: true, owner: true };
  game.users = list([other, owner]); game.user = other; f.tome.system.hp.value = 8; await f.end(); assert.equal(f.tome.system.hp.value, 8);
  game.user = owner; await f.end(); assert.equal(f.tome.system.hp.value, 35, "one active owner handles the book without a GM");
}
{
  const f = setup(); f.actor.statuses.add("dead"); await f.tome.update({ "system.hp.value": 0 }); assert.equal(f.actor.effects.length, 0, "already dead actor gets no duplicate condition");
}
{
  const f = setup(); f.tome.system.hp.value = 0;
  f.tome.flags.spikependium ??= {}; f.tome.flags.spikependium.soulTome = { generation: "pending", destroyed: true, deathProcessed: false };
  game.user = { id: "inactive", isGM: true, isActiveGM: false };
  const result = { updateItems: [] };
  assert.equal(prepareSoulTomeRest(f.actor, result, { type: "short" }), false, "rest cannot erase unresolved destruction");
  assert.deepEqual(result.updateItems, []); game.user = game.users.activeGM; await resumeSoulTomes();
  assert.equal(f.actor.statuses.has("dead"), true); await f.rest("short"); assert.equal(f.tome.system.hp.value, 35);
}
{
  const f = setup(); f.tome.system.hp.value = 0; game.user = { id: "inactive", isGM: true, isActiveGM: false };
  const result = { updateItems: [] };
  assert.equal(prepareSoulTomeRest(f.actor, result, { type: "long" }), false, "legacy destruction cannot be skipped by starting a rest before recovery");
  assert.deepEqual(result.updateItems, []);
}
{
  const f = setup(); f.tome.system.hp.value = 0;
  f.tome.flags.spikependium ??= {}; f.tome.flags.spikependium.soulTome = { generation: "old", destroyed: true, deathProcessed: false };
  const original = ActiveEffect.implementation.fromStatusEffect;
  ActiveEffect.implementation.fromStatusEffect = async status => {
    f.tome.flags.spikependium.soulTome = { generation: "new", destroyed: false, deathProcessed: false };
    f.tome.system.hp.value = 35;
    return original(status);
  };
  try { await finishSoulTomeDestruction(f.tome); } finally { ActiveEffect.implementation.fromStatusEffect = original; }
  assert.equal(f.actor.system.attributes.hp.value, 175, "a generation changed while preparing death cannot be killed by a stale receipt");
  assert.equal(batches.length, 0);
}
{
  const f = setup(); const result = { updateItems: [] }; prepareSoulTomeRest(f.actor, result, { type: "long" });
  assert.deepEqual(result.updateItems, [], "intact tome is not recreated on rest");
  f.actor.items.splice(f.actor.items.indexOf(f.tome), 1); prepareSoulTomeRest(f.actor, result, { type: "short" });
  assert.deepEqual(result.updateItems, [], "a missing tome does not prove destruction");
}
function card(rolls) {
  const message = { id: String(++serial).padStart(16, "0"), type: "damage", isContentVisible: true, rolls,
    system: { isHealing: false }, _stats: { createdTime: Date.now() }, flags: {} };
  game.messages.push(message); return message;
}
for (const [type, value, expected] of [["fire", 13, 22], ["acid", 13, 22], ["necrotic", 40, 35], ["psychic", 40, 35], ["poison", 40, 35]]) {
  const f = setup(); const message = card([new DamageRoll(value, type)]);
  assert.equal(await applySoulTomeDamage(message, f.tome), true);
  assert.equal(f.tome.system.hp.value, expected, type); assert.equal(f.actor.system.attributes.hp.value, 175, "object damage does not damage its owner");
  assert.equal(f.tome.flags.spikependium.soulTomeDamage[message.id], true);
  assert.equal(await applySoulTomeDamage(message, f.tome), false, "every card is consumed once, including immune damage");
  await f.end(); assert.equal(f.tome.system.hp.value, 35); assert.equal(await applySoulTomeDamage(message, f.tome), false, "regeneration does not reset the damage receipt");
}
{
  const f = setup(); const mixed = new DamageRoll(22, "fire", [new NumericTerm({ number: 13, options: { flavor: "fire" } }),
    new OperatorTerm({ operator: "+" }), new NumericTerm({ number: 9, options: { flavor: "psychic" } })]);
  const message = card([mixed, new DamageRoll(30, "poison"), new DamageRoll(20, "healing"), new DamageRoll(10, "temphp")]);
  await applySoulTomeDamage(message, f.tome, .5);
  assert.equal(f.tome.system.hp.value, 29, "native aggregation splits typed terms; native calculation ignores immune/healing types and rounds half down");
}
{
  const f = setup(); const roll = new DamageRoll(30, "slashing"); roll.options.isCritical = true;
  await applySoulTomeDamage(card([roll]), f.tome); assert.equal(f.tome.system.hp.value, 5, "critical damage has already been rolled and is not doubled again");
}
for (const multiplier of [.25, .5, 1, 2]) {
  const f = setup(); await applySoulTomeDamage(card([new DamageRoll(7, "fire"), new DamageRoll(3, "cold")]), f.tome, multiplier);
  assert.equal(f.tome.system.hp.value, 35 - Math.trunc(10 * multiplier));
}
for (const synthetic of [false, true]) {
  const f = setup({ synthetic }); const message = card([new DamageRoll(40, "force")]);
  assert.equal(await applySoulTomeDamage(message, f.tome), true); assert.equal(f.tome.system.hp.value, 0);
  assert.equal(f.actor.statuses.has("dead"), true); assert.equal(f.actor.system.attributes.hp.value, 0);
  assert.equal(f.tome.flags.spikependium.soulTomeDamage[message.id], true);
}
for (const committed of [false, true]) {
  const f = setup(); const message = card([new DamageRoll(8, "fire")]); const update = f.tome.update;
  f.tome.update = async function(changed) { if (!committed) throw Error("damage before commit"); await update.call(this, changed); throw Error("damage after commit"); };
  await assert.rejects(() => applySoulTomeDamage(message, f.tome), /damage/); f.tome.update = update;
  assert.equal(await applySoulTomeDamage(message, f.tome), !committed);
  assert.equal(f.tome.system.hp.value, 27, "retry applies once regardless of when the update failed");
}
{
  const f = setup(); const message = card([new DamageRoll(4, "fire")]);
  assert.deepEqual(await Promise.all([applySoulTomeDamage(message, f.tome), applySoulTomeDamage(message, f.tome)]), [true, false]);
  assert.equal(f.tome.system.hp.value, 31);
}
for (const reason of ["private", "not-live", "not-damage", "unevaluated", "not-native", "unknown-type", "nonfinite", "not-owner", "other-gm", "changed-roll", "changed-tome", "invalid-multiplier"]) {
  const f = setup(); const message = card([new DamageRoll(7, "fire")]); const expected = {}; let multiplier = 1;
  if (reason === "private") message.isContentVisible = false;
  if (reason === "not-live") game.messages.length = 0;
  if (reason === "not-damage") message.type = "healing";
  if (reason === "unevaluated") message.rolls[0]._evaluated = false;
  if (reason === "not-native") message.rolls = [{ total: 7, _evaluated: true }];
  if (reason === "unknown-type") message.rolls[0].options.type = "unknown";
  if (reason === "nonfinite") message.rolls[0].total = NaN;
  if (reason === "not-owner") f.actor.isOwner = false;
  if (reason === "other-gm") game.user = { id: "other", isActiveGM: false };
  if (reason === "changed-roll") expected.signature = "old";
  if (reason === "changed-tome") expected.generation = "old";
  if (reason === "invalid-multiplier") multiplier = -1;
  assert.equal(await applySoulTomeDamage(message, f.tome, multiplier, expected), false, reason);
  assert.equal(f.tome.system.hp.value, 35, reason);
}
{
  const f = setup(); const old = card([new DamageRoll(7, "fire")]); old._stats.createdTime = 1;
  await f.tome.update({ "system.hp.value": 0 }); await f.rest("short");
  assert.equal(await applySoulTomeDamage(old, f.tome), false, "old unused card cannot damage the newly created tome");
  const fresh = card([new DamageRoll(7, "fire")]); fresh._stats.createdTime = f.tome.flags.spikependium.soulTome.damageCutoff.time;
  assert.equal(await applySoulTomeDamage(fresh, f.tome), true);
}
{
  const f = setup(); const old = card([new DamageRoll(7, "fire")]);
  await f.tome.update({ "system.hp.value": 0 }); await f.rest("short");
  assert.equal(old._stats.createdTime, f.tome.flags.spikependium.soulTome.damageCutoff.time);
  assert.equal(await applySoulTomeDamage(old, f.tome), false, "an existing card at the timestamp boundary is still old");
  const fresh = card([new DamageRoll(7, "fire")]); fresh._stats.createdTime = old._stats.createdTime;
  assert.equal(await applySoulTomeDamage(fresh, f.tome), true, "a new card in the same millisecond remains usable without trusting the client clock");
}
{
  const f = setup(); const message = card([new DamageRoll(8, "fire")]); let release;
  const gate = new Promise(resolve => { release = resolve; }), original = f.tome.update;
  f.tome.update = async function(...args) { await gate; return original.apply(this, args); };
  const damage = applySoulTomeDamage(message, f.tome), end = f.end();
  assert.equal(prepareSoulTomeRest(f.actor, { updateItems: [] }, { type: "short" }), false, "rest cannot race an in-flight damage update");
  release(); await Promise.all([damage, end]); assert.equal(f.tome.system.hp.value, 35, "turn-end regeneration waits for current damage");
}
function htmlFixture() {
  const children = [], html = { querySelector(selector) { return selector === ".spikependium-tome-damage" ? children.find(child => child.className === "spikependium-tome-damage") : null; },
    append(element) { children.push(element); } };
  globalThis.document = { createElement(tag) { assert.equal(tag, "button"); const element = { type: "", textContent: "", className: "", disabled: false,
    classList: { add(name) { element.className = name; } }, addEventListener(type, fn) { assert.equal(type, "click"); element.click = fn; } }; return element; } };
  return { html, children };
}
for (const outcome of ["apply", "cancel", "card-edited", "tome-recreated"]) {
  const f = setup(); const message = card([new DamageRoll(7, "fire")]); const view = htmlFixture();
  foundry.applications = { api: { DialogV2: { async wait(options) {
    assert.ok(options.content.includes("КБ 17")); assert.ok(options.content.includes(f.tome.uuid));
    if (outcome === "cancel") return options.close();
    if (outcome === "card-edited") message.rolls[0].total = 20;
    if (outcome === "tome-recreated") { await f.tome.update({ "system.hp.value": 0 }); await f.rest("short"); }
    return options.buttons[0].callback(null, { form: { elements: { tome: { value: f.tome.uuid }, multiplier: { value: "1" } } } });
  } } } };
  renderSoulTomeDamage(message, view.html); renderSoulTomeDamage(message, view.html); assert.equal(view.children.length, 1, "render does not add duplicate buttons");
  await view.children[0].click(); assert.equal(view.children[0].disabled, false);
  assert.equal(f.tome.system.hp.value, outcome === "apply" ? 28 : 35, outcome);
}
{
  const f = setup(); const message = card([new DamageRoll(7, "fire")]); message.isContentVisible = false;
  const view = htmlFixture(); renderSoulTomeDamage(message, view.html); assert.equal(view.children.length, 0, "private roll exposes no button or object choice");
}
console.log("Soul Tome: native typed/critical/mixed damage and rounding, immunity, UI/cancellation/privacy, HP/death/rest, permissions, stale cards and concurrent/recovery events passed.");
