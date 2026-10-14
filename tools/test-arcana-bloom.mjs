import assert from "node:assert/strict";
import fs from "node:fs";
import { prepareBloomDialog, captureBloom, canUseBloom, prepareBloomUpdates, recordBloomConsumption, recordBloomArea,
  registerBloomDice, bloomChatButtons, bloomChatAction, syncBloomHealing, recordBloomHealing, resumeBloomHealing, rollBloomHealing } from "../scripts/arcana-bloom.mjs";
import { nativeConsumeHitDice, nativeUsageUpdates, ConsumptionError, nativeHealingActivity } from "./data/dnd5e-monsters-native.mjs";
import { nativeCalculateDamage, nativeApplyDamage } from "./data/dnd5e-guardian-native.mjs";
import { getDeltas, nativeRefund } from "./data/dnd5e-reaction-native.mjs";
import { nativePerformBulkUpdate } from "./data/dnd5e-arcana-native.mjs";

const doc = fs.readdirSync("packs/_source/spells").filter(f => f.startsWith("spell-au-wither-and-bloom_")).map(f => JSON.parse(fs.readFileSync(`packs/_source/spells/${f}`, "utf8")))[0];
const [castData, healData] = Object.values(doc.system.activities);
assert.equal(healData.type, "heal"); assert.equal(healData.consumption.spellSlot, false); assert.equal(healData.activation.type, "");
assert.equal(healData.flags.spikependium.bloomTemplate, true);
const get = (o, p) => p.split(".").reduce((v, k) => v?.[k], o);
const set = (o, p, v) => { const keys = p.split("."), last = keys.pop(); keys.reduce((a, k) => a[k] ??= {}, o)[last] = structuredClone(v); };
const flatten = (o, prefix = "", result = {}) => { for (const [k, v] of Object.entries(o)) {
  const p = prefix ? `${prefix}.${k}` : k;
  if (v && Object.getPrototypeOf(v) === Object.prototype) flatten(v, p, result); else result[p] = v;
} return result; };
const merge = (a, b) => { for (const [k, v] of Object.entries(b)) {
  if (v && Object.getPrototypeOf(v) === Object.prototype) merge(a[k] ??= {}, v); else a[k] = v;
} return a; };
const world = new Map(), cards = [], paymentCards = [], operationsSeen = [], player = { id: "player" }, gm = { id: "gm", isGM: true, isActiveGM: true };
let serial = 0, chosen = null, dialogs = 0, beforeUse, bloomRollContext;
cards.get = id => cards.find(c => c.id === id);
globalThis.fromUuidSync = uuid => world.get(uuid);
globalThis.foundry = { utils: { getProperty: get, setProperty: set, deepClone: structuredClone, randomID: () => String(++serial).padStart(16, "0"),
  mergeObject: merge, flattenObject: flatten, isEmpty: o => !o || !Object.keys(o).length, getType: o => o && typeof o === "object" ? "Object" : typeof o,
  escapeHTML: text => text.replaceAll("<", "&lt;") }, data: { fields: { StringField: class { constructor(o) { Object.assign(this, o); } } } },
  applications: { api: { DialogV2: { async wait(config) { dialogs++; assert.ok(config.content.includes("модификатор заклинателя")); return chosen; } } } } };
globalThis.ui = { notifications: { warn() {}, error() {} } };
globalThis.game = { user: player, users: { activeGM: gm }, time: { worldTime: 0 }, combat: null, messages: cards,
  i18n: { localize: key => key } };
globalThis.dnd5e = { dataModels: { activity: { ConsumptionError } } };
Number.isNumeric = n => typeof n === "number"; Math.clamp = (n, min, max) => Math.min(max, Math.max(min, n));
globalThis.Hooks = { call(name, ...args) { return name === "dnd5e.preApplyDamage" ? recordBloomHealing(...args) : true; }, callAll() {} };
class DamageRoll { constructor(total) { this.total = total; this.options = { type: "healing" }; this._evaluated = true; } }
globalThis.CONFIG = { Dice: { DamageRoll }, DND5E: { activityConsumptionTypes: { hitDice: { consume: nativeConsumeHitDice } },
  activityActivationTypes: {}, healingTypes: { healing: {}, temphp: {} }, damageTypes: { necrotic: {} } },
  Region: { documentClass: class { constructor(data, options) { this.data = data; this.parent = options.parent; }
    testPoint(p) { return Math.hypot(p.x - this.data.x, p.y - this.data.y) <= this.data.radius; } } } };
globalThis.ChatMessage = { getSpeaker: ({ actor, token }) => ({ actor: actor.id, token: token.id, scene: token.parent.id }) };
const list = values => Object.assign(values, { get(id) { return this.find(v => v.id === id); } });
function actor(id) {
  const hp = { value: 10, max: 40, effectiveMax: 40, temp: 5, tempmax: 0, get damage() { return this.max - this.value; } };
  const result = { id, uuid: `Actor.${id}`, name: id, isOwner: true, flags: {}, classes: {}, items: list([]),
    system: { isCreature: true, attributes: { hp }, _source: { attributes: { hp } }, traits: {} },
    testUserPermission: user => !!user?.isGM || user?.id === (id === "caster" ? "caster" : "player"),
    getRollData: () => ({}), changeIsIgnored: () => false, changeHasEffect: () => false,
    calculateDamage: nativeCalculateDamage, applyDamage: nativeApplyDamage, performBulkUpdate: nativePerformBulkUpdate,
    async update(data) { for (const [p, v] of Object.entries(data)) set(this, p, v); } };
  world.set(result.uuid, result); return result;
}
function cls(owner, id, denomination, max) {
  const data = { id, system: { hd: { denomination, spent: 0, get value() { return max - this.spent; } } } };
  owner.classes[id] = data; owner.items.push(data); return data;
}
const caster = actor("caster"), recipient = actor("recipient"), d6 = cls(recipient, "class6", "d6", 3), d8 = cls(recipient, "class8", "d8", 3);
const casterClass = cls(caster, "casterClass", "d10", 5);
const scene = { id: "s", uuid: "Scene.s", tokens: list([]), grid: {} }; world.set(scene.uuid, scene);
function token(owner, id) { const t = { id, uuid: `Scene.s.Token.${id}`, name: id, actor: owner, parent: scene, elevation: 0, x: 8,
  object: { isVisible: true },
  getOccupiedGridSpaceOffsets: () => [], getCenterPoint() { return { x: this.x, y: 0 }; } };
  scene.tokens.push(t); world.set(t.uuid, t); return t; }
const body = token(caster, "body"), targetToken = token(recipient, "recipient");
foundry.documents = { async modifyBatch(ops) {
  operationsSeen.push(...ops.map(op => op.documentName));
  for (const op of ops) if (op.documentName === "Actor" || op.documentName === "ActorDelta") {
    const owner = op.documentName === "Actor" ? world.get(`Actor.${op.updates[0]._id}`) : op.parent.actor;
    for (const update of op.updates) await owner.update(Object.fromEntries(Object.entries(update).filter(([p]) => p !== "_id")));
  } else if (op.documentName === "Item") for (const update of op.updates) {
    const item = op.parent.items.get(update._id); for (const [p, v] of Object.entries(update)) if (p !== "_id") set(item, p, v);
  }
} };
function message(data) { const m = { id: foundry.utils.randomID(), type: "usage", flags: {}, ...data,
  async setFlag(module, p, v) { set(this, `flags.${module}.${p}`, v); } };
  m.uuid = `ChatMessage.${m.id}`; cards.push(m); world.set(m.uuid, m); return m; }
async function pay(a, config, msg) {
  const updates = prepareBloomUpdates(a, config, await nativeUsageUpdates.call(a, config));
  if (!updates) return;
  const deltas = { actor: getDeltas(a.actor, updates.actor), item: {} };
  for (const update of updates.item) deltas.item[update._id] = getDeltas(a.actor.items.get(update._id), update);
  await a.actor.performBulkUpdate(updates); msg.data.system = { deltas }; recordBloomConsumption(a, config, msg);
  return deltas;
}
registerBloomDice();
let nativeHealingMessage;
const NativeHeal = nativeHealingActivity(class { rollDamage(_config, _dialog, msg) { nativeHealingMessage = msg; return []; } });
await new NativeHeal()._triggerSubsequentActions({}, { message: { id: "paid" } });
assert.equal(nativeHealingMessage["data.type"], "healing"); assert.equal(nativeHealingMessage.data.system.origin, "paid");
CONFIG.Item = { documentClass: class {
  constructor(data, { parent }) { this.data = data; this.flags = data.flags; this.actor = parent;
    this.system = { ...data.system, activities: new Map(Object.entries(data.system.activities).map(([id, entry]) => {
      const a = { ...structuredClone(entry), id, item: this, actor: parent, requiresSpellSlot: false, uuid: `${parent.uuid}.Item.heal.Activity.${id}` };
      a.consumption.targets = a.consumption.targets.map(t => ({ ...t, actor: parent, activity: a, item: this, hasZeroCost: () => false,
        resolveCost: async () => ({ total: Number(t.value) }), consume(config, updates) { return CONFIG.DND5E.activityConsumptionTypes[t.type].consume.call(this, config, updates); } }));
      a.use = async (config, _dialog, msg) => {
        if (beforeUse) beforeUse();
        if (!canUseBloom(a, config)) return;
        const deltas = await pay(a, config, msg); if (!deltas) return;
        paymentCards.push(message({ flags: msg.data.flags, system: msg.data.system, author: player, getAssociatedActivity: () => a }));
      };
      a.toObject = () => structuredClone(entry);
      a.rollDamage = (_config, _dialog, msg) => { bloomRollContext = { actor: parent, type: this.data.type, level: this.system.level, message: msg }; };
      return [id, a];
    })) }; }
  toObject() { return structuredClone(this.data); }
} };
async function castFor(t, level = 4) {
  const template = { ...healData, toObject: () => structuredClone(healData) };
  const item = { flags: doc.flags, system: { level, activities: [template] }, _source: doc, img: doc.img, toObject: () => doc };
  const a = { ...castData, actor: caster, item, uuid: "Actor.caster.Item.spell.Activity.cast", getUsageToken: () => body, getRollData: () => ({ mod: 4 }) };
  const config = { spikependium: { bloomTarget: t.uuid }, consume: false }, msg = { data: {} };
  assert.equal(captureBloom(a, config), undefined);
  const updates = prepareBloomUpdates(a, config, { actor: {} }); await caster.update(updates.actor); recordBloomConsumption(a, config, msg);
  const origin = message({ flags: msg.data.flags, system: msg.data.system, author: { id: "caster" }, getAssociatedActivity: () => a });
  const previous = game.user; game.user = { id: "caster" };
  await recordBloomArea(a, config, { message: origin, templates: [{ parent: scene, toObject: () => ({ x: 0, y: 0, radius: 10 }) }] }); game.user = previous;
  return { origin, a };
}
const { origin, a } = await castFor(targetToken);
class Dialog { constructor(config) { this.config = config; } async _prepareConsumptionContext(c) { return c; } }
const dialog = { applicationClass: Dialog }, dialogConfig = {}; prepareBloomDialog(a, dialogConfig, dialog); assert.equal(dialog.configure, true);
const hidden = token(actor("hidden"), "hidden"); hidden.object.isVisible = false;
const fields = await new dialog.applicationClass(dialogConfig)._prepareConsumptionContext({ fields: [] });
assert.equal(fields.fields[0].field.choices[targetToken.uuid], "recipient"); assert.equal(fields.fields[0].field.choices[hidden.uuid], undefined, "recipient menu does not reveal unseen tokens");
game.user = gm; const gmFields = await new dialog.applicationClass(dialogConfig)._prepareConsumptionContext({ fields: [] });
assert.equal(gmFields.fields[0].field.choices[hidden.uuid], "hidden"); game.user = player;
assert.equal(bloomChatButtons.call(a, () => [], origin)[0].action, "bloomHealing");
assert.equal(canUseBloom({ flags: healData.flags }), false);
const click = card => bloomChatAction.call(a, () => assert.fail("incorrect action routing"), {}, { dataset: { action: "bloomHealing" } }, card);
chosen = null; await click(origin); assert.equal(paymentCards.length, 0); assert.equal(d6.system.hd.spent, 0);
chosen = { d6: 4 }; await click(origin); assert.equal(paymentCards.length, 0);
chosen = { d6: 0.5 }; await click(origin); assert.equal(paymentCards.length, 0);
chosen = { d6: 1, d8: 2 }; targetToken.x = 11; await click(origin); assert.equal(paymentCards.length, 0); targetToken.x = 8;
game.time.worldTime = 1; await click(origin); assert.equal(paymentCards.length, 0); game.time.worldTime = 0;
await click(origin); const first = paymentCards.at(-1);
assert.equal(first.getAssociatedActivity().healing.custom.formula, "max(0, 1d6 + 2d8 + 4)");
assert.equal(first.getAssociatedActivity().item.system.source.book, "AU");
assert.deepEqual([d6.system.hd.spent, d8.system.hd.spent, casterClass.system.hd.spent], [1, 2, 0]);
assert.equal(first.system.deltas.actor.some(d => d.keyPath.endsWith(".spent") && d.delta === 1), true);
await click(origin); assert.equal(paymentCards.length, 1, "paid card resumes the cast without spending more dice");
const refund = card => nativeRefund.call({ actor: card.getAssociatedActivity().actor }, card.system.deltas, updates => card.getAssociatedActivity().actor.performBulkUpdate(updates));
await refund(first); assert.deepEqual([d6.system.hd.spent, d8.system.hd.spent], [0, 0]);
function healing(card, total = 20) { return message({ type: nativeHealingMessage["data.type"], flags: {}, author: player, rolls: [new DamageRoll(total)], getOriginatingMessage: () => card }); }
const old = healing(first); game.user = gm; await syncBloomHealing(old); assert.equal(recipient.system.attributes.hp.value, 10);
game.user = player; await click(origin); const second = paymentCards.at(-1); assert.notEqual(second.flags.spikependium.bloomHealing.attempt, first.flags.spikependium.bloomHealing.attempt);
await rollBloomHealing.call(second.getAssociatedActivity(), () => assert.fail("recipient outgoing healing bonuses must not be used"), {}, {}, { data: { system: { origin: second.id } } });
assert.equal(bloomRollContext.actor, caster); assert.equal(bloomRollContext.type, "spell"); assert.equal(bloomRollContext.level, 4);
assert.equal(bloomRollContext.message.data.speaker.actor, recipient.id); assert.equal(bloomRollContext.message.data.system.origin, second.id);
game.user = gm; await syncBloomHealing(old); assert.equal(recipient.system.attributes.hp.value, 10, "refunded attempt cannot reuse a new payment");
const roll = healing(second); await syncBloomHealing(roll); await syncBloomHealing(roll); await resumeBloomHealing();
assert.deepEqual([recipient.system.attributes.hp.value, recipient.system.attributes.hp.temp], [30, 5]);
await syncBloomHealing(healing(second)); assert.equal(recipient.system.attributes.hp.value, 30, "another roll cannot heal twice");
await refund(second); assert.deepEqual([d6.system.hd.spent, d8.system.hd.spent], [0, 0]); assert.equal(recipient.system.attributes.hp.value, 30, "resource refund does not roll back subsequent HP changes");
game.user = player; await click(origin); assert.equal(paymentCards.length, 2, "finished healing cannot be repeated after resource refund");
const npc = actor("npc"); npc.system.isNPC = true; npc.system.attributes.hd = { denomination: 20, spent: 0, get value() { return 2 - this.spent; } };
const npcToken = token(npc, "npc"), npcCast = await castFor(npcToken, 2); chosen = { d20: 1 };
await click(npcCast.origin); const npcCard = paymentCards.at(-1); assert.equal(npc.system.attributes.hd.spent, 1);
await refund(npcCard); assert.equal(npc.system.attributes.hd.spent, 0);
chosen = { d20: 2 }; await click(npcCast.origin); assert.equal(paymentCards.at(-1), npcCard, "level two permits only one die");
const before = dialogs; npc.isOwner = false; await click(npcCast.origin); assert.equal(dialogs, before); npc.isOwner = true;
chosen = { d20: 1 }; beforeUse = () => { npcToken.x = 11; }; await click(npcCast.origin); assert.equal(npc.system.attributes.hd.spent, 0); beforeUse = null; npcToken.x = 8;
await click(npcCast.origin); const active = paymentCards.at(-1); assert.notEqual(active, npcCard);
await caster.update({ [`flags.spikependium.bloomCasts.${npcCast.origin.flags.spikependium.bloomCast.nonce}.spent`]: 0 });
game.user = gm; await syncBloomHealing(healing(active)); assert.equal(npc.system.attributes.hp.value, 10, "refunded source cast authorizes no healing");
npc.parent = npcToken; npcToken.delta = { id: "delta" };
const syntheticCast = await castFor(npcToken, 2); operationsSeen.length = 0; game.user = player;
await click(syntheticCast.origin); assert.ok(operationsSeen.includes("ActorDelta"), "native spending updates the synthetic actor delta");
game.user = gm; await syncBloomHealing(healing(paymentCards.at(-1), 50));
assert.deepEqual([npc.system.attributes.hp.value, npc.system.attributes.hp.temp], [40, 5], "native healing clamps at maximum and preserves temporary HP");
npc.system.attributes.hp.value = 10;
npc.system.attributes.hd.spent = 1;
const manualCast = await castFor(npcToken, 2); game.user = player; await click(manualCast.origin);
const manualRoll = healing(paymentCards.at(-1), 5);
await npc.applyDamage([{ value: 5, type: "healing" }], { originatingMessage: manualRoll });
game.user = gm; await syncBloomHealing(manualRoll); await resumeBloomHealing();
assert.equal(npc.system.attributes.hp.value, 15, "manual native application prevents later automatic duplicate healing");
console.log("Bloom: native mixed-class/NPC hit dice, source modifier once, area/time/ownership, paid-card recovery, native refund, stale attempts and atomic HP/replay protection passed.");
