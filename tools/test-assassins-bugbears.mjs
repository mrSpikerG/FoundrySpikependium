import fs from "node:fs";
import assert from "node:assert/strict";
import { monsterEvasionDamage } from "../scripts/monster-evasion.mjs";
import { monsterGrappleRule } from "../scripts/monster-actions.mjs";
import { nativeApplyDamage, nativeCalculateDamage } from "./data/dnd5e-guardian-native.mjs";
import { nativeConsumeMaterial } from "./data/dnd5e-monsters-native.mjs";
import { nativeRefund, getDeltas, nativeConsume } from "./data/dnd5e-reaction-native.mjs";
import { prepareCunningUpdates, recordCunningConsumption, cunningUse, cunningDeltaLabel } from "../scripts/cunning-actions.mjs";
import { recordDisengageUse, syncDisengage, protectedFromOpportunity, cleanDisengage } from "../scripts/cunning-disengage.mjs";
import { prepareOpportunityRoll, validateOpportunityRoll } from "../scripts/opportunity.mjs";
import { canUseHide, recordHideUse, syncHide, canRollHide, endHideOnAttack, endHideOnSpell, cleanHide } from "../scripts/cunning-hide.mjs";
import { nativePerformBulkUpdate } from "./data/dnd5e-arcana-native.mjs";
import { constructParts, getAttackData, setModificationField } from "./data/dnd5e-making-native.mjs";

const read = pack => fs.readdirSync(`packs/_source/${pack}`).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(`packs/_source/${pack}/${f}`, "utf8")));
const creatures = read("creatures"), find = key => creatures.find(d => d.flags?.spikependium?.key === `actor:mm25:${key}`);
const specs = [["assassin", 20, 16, 97, 8, "humanoid"], ["bugbear-warrior", 21, 14, 33, 1, "fey"], ["bugbear-stalker", 21, 15, 65, 3, "fey"], ["bandit", 23, 12, 11, 0.125, "humanoid"]];
const gear = JSON.parse(fs.readFileSync("tools/data/mm25-base-gear.json", "utf8")).gear;
const get = (o, p) => p.split(".").reduce((v, k) => v?.[k], o);
const set = (o, p, v) => { const keys = p.split("."), last = keys.pop(); keys.reduce((a, k) => a[k] ??= {}, o)[last] = v; };
const flatten = (o, p = "", r = {}) => { for (const [k, v] of Object.entries(o)) { const path = p + k;
  if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, path + ".", r); else r[path] = v; } return r; };
globalThis.foundry = { utils: { deepClone: structuredClone, getProperty: get, setProperty: set, flattenObject: flatten, mergeObject: Object.assign,
  isEmpty: o => !o || !Object.keys(o).length, randomID: () => "hideTest00000000" } };
globalThis.Hooks = { call: () => true, callAll() {} }; globalThis.game = { i18n: { localize: s => s } };
globalThis.CONFIG = { Dice: { BasicRoll: { constructParts } }, DND5E: { healingTypes: { healing: {}, temphp: {} }, damageTypes: { fire: {}, poison: {} } } };
Math.clamp = (n, lo, hi) => Math.max(lo, Math.min(n, hi)); Number.isNumeric = n => typeof n === "number";
setModificationField({ combineFields: () => ({ bonus: null }) });
for (const [key, page, ac, hp, cr, type] of specs) {
  const doc = find(key); assert.ok(doc); assert.equal(doc.system.source.page, String(page)); assert.equal(doc.system.source.book, "MM25");
  assert.equal(doc.system.attributes.ac.flat, ac); assert.equal(doc.system.attributes.hp.max, hp); assert.equal(doc.system.details.cr, cr);
  assert.equal(doc.system.details.type.value, type); assert.equal(doc.system.source.rules, "2024"); assert.ok(doc.folder);
  for (const item of doc.items.filter(i => ["weapon", "equipment"].includes(i.type))) {
    const base = gear[item.system.type.baseItem];
    if (base) { assert.deepEqual(item.system.price, base.system.price); assert.deepEqual(item.system.weight, base.system.weight); }
    for (const a of Object.values(item.system.activities).filter(a => a.type === "attack")) {
      const mod = Math.floor((doc.system.abilities[a.attack.ability].value - 10) / 2), prof = key === "assassin" ? 3 : 2;
      const host = { attack: a.attack, item: { type: "weapon", system: { ...item.system, prof: { term: prof } } },
        actor: { system: {}, items: new Map(), addConditionRollReduction() {}, getFlag() {} },
        getActionType: () => a.attack.type.value === "ranged" ? "rwak" : "mwak", getRollData: () => ({ mod, roll: { ability: a.attack.ability } }) };
      const actual = getAttackData.call(host); assert.equal(actual.data.mod + actual.data.prof, { assassin: 7, "bugbear-warrior": 4, "bugbear-stalker": 5, bandit: 3 }[key]);
      if (item.system.properties.includes("thr") && a.attack.type.value === "ranged") {
        assert.deepEqual(a.consumption.targets, [{ type: "material", target: item._id, value: "1", scaling: {} }]);
        const carried = { ...structuredClone(item), id: item._id };
        const actor = { items: new Map([[carried.id, carried]]) }, updates = { item: [], delete: [], rolls: [] };
        const consumer = { actor, target: carried.id, activity: a, item: carried, resolveCost: async () => ({ total: 1 }) };
        await nativeConsumeMaterial.call(consumer, {}, updates); assert.equal(updates.item[0]["system.quantity"], carried.system.quantity - 1);
        const deltas = getDeltas(carried, { "system.quantity": carried.system.quantity - 1 }); carried.system.quantity--;
        await nativeRefund.call({ actor }, { item: { [carried.id]: deltas } }, async refund => {
          carried.system.quantity = refund.item[0]["system.quantity"];
        });
        assert.equal(carried.system.quantity, item.system.quantity);
        carried.system.quantity = 0; await assert.rejects(() => nativeConsumeMaterial.call(consumer, {}, { item: [], delete: [], rolls: [] }));
      } else assert.equal(a.consumption.targets.length, 0, "melee weapons are not consumed");
    }
  }
}
const bandit = find("bandit");
assert.deepEqual(bandit.system.traits.languages.value, ["common", "cant"]);
assert.equal(bandit.system.attributes.hp.formula, "2d8+2");
assert.equal(bandit.system.attributes.movement.speeds.walk, "30");
const banditFolder = creatures.find(d => d._id === bandit.folder);
assert.equal(banditFolder.name, "Бандиты");
const banditWeapons = bandit.items.filter(i => i.type === "weapon");
assert.equal(banditWeapons.length, 2);
for (const [item, faces, type, attackType, range] of [[banditWeapons[0], 6, "slashing", "melee", 5], [banditWeapons[1], 8, "piercing", "ranged", 80]]) {
  const action = Object.values(item.system.activities)[0];
  assert.equal(item.system.damage.base.number, 1); assert.equal(item.system.damage.base.denomination, faces);
  assert.deepEqual(item.system.damage.base.types, [type]);
  assert.equal(action.attack.type.value, attackType); assert.equal(action.attack.ability, "dex");
  assert.equal(action.damage.includeBase, true); assert.equal(action.range.value, String(range));
  assert.ok(item.system.description.value.includes(`[[/damage 1d${faces}+1 type=${type}]]`));
}
assert.equal(banditWeapons[1].system.range.long, 320);
assert.equal(banditWeapons[1].system.ammunition.type, "crossbowBolt");
assert.deepEqual(banditWeapons[1].system.properties, ["amm", "lod", "two"]);
const assassin = find("assassin"), hp = { value: 97, max: 97, temp: 4, tempmax: 0, damage: 0 };
const owner = { id: "gm" }, caster = { testUserPermission: u => u === owner };
const actor = { uuid: "Actor.assassin", flags: assassin.flags, statuses: new Set(), effects: [{ active: true, flags: { spikependium: { monsterEvasion: true } } }],
  testUserPermission: u => u === owner, system: { attributes: { hp }, _source: { attributes: { hp } }, traits: {} },
  getRollData: () => ({}), changeIsIgnored: () => false, changeHasEffect: (category, d) => category === "resistance" && d.type === "poison",
  async update(changes) { for (const [k, v] of Object.entries(changes)) set(this, k, v); hp.damage = hp.max - hp.value; } };
actor.calculateDamage = (ds, options) => monsterEvasionDamage.call(actor, (...args) => nativeCalculateDamage.call(actor, ...args), ds, options);
const activity = { type: "save", actor: caster, save: { ability: new Set(["dex"]) }, damage: { onSave: "half" } };
const origin = { author: owner, system: { outcomes: new Map([[actor.uuid, "failure"]]) }, getAssociatedActivity: () => activity };
const options = { originatingMessage: { getOriginatingMessage: () => origin }, multiplier: 1 };
assert.equal(actor.calculateDamage([{ value: 23, type: "fire" }], options).amount, 11);
assert.equal(actor.calculateDamage([{ value: 23, type: "poison" }], options).amount, 5, "evasion precedes native poison resistance and rounding");
await nativeApplyDamage.call(actor, [{ value: 23, type: "poison" }], options); assert.equal(hp.value, 96); assert.equal(hp.temp, 0);
origin.system.outcomes.set(actor.uuid, "success"); options.multiplier = 0.5;
assert.equal(actor.calculateDamage([{ value: 23, type: "fire" }], options).amount, 0);
actor.statuses.add("incapacitated"); assert.equal(actor.calculateDamage([{ value: 23, type: "fire" }], options).amount, 11); actor.statuses.clear();
actor.effects[0].active = false; assert.equal(actor.calculateDamage([{ value: 23, type: "fire" }], options).amount, 11); actor.effects[0].active = true;
activity.damage.onSave = "none"; assert.equal(actor.calculateDamage([{ value: 23, type: "fire" }], options).amount, 11); activity.damage.onSave = "half";
options.multiplier = 2; assert.equal(actor.calculateDamage([{ value: 23, type: "fire" }], options).amount, 46, "manual nonstandard multipliers are preserved");
options.multiplier = 0.5; activity.save.ability.add("con");
assert.equal(actor.calculateDamage([{ value: 23, type: "fire" }], options).amount, 11, "an ambiguous choice of save abilities is not treated as Dexterity");
origin.getAssociatedRolls = () => [{ author: owner, system: { ability: "dex" }, getAssociatedActor: () => actor }];
assert.equal(actor.calculateDamage([{ value: 23, type: "fire" }], options).amount, 0);
origin.getAssociatedRolls = () => [{ author: owner, system: { ability: "con" }, getAssociatedActor: () => actor }];
assert.equal(actor.calculateDamage([{ value: 23, type: "fire" }], options).amount, 11);
assert.equal(actor.calculateDamage([{ value: 10, type: "healing" }], options).amount, -5, "evasion does not modify healing");
const table = read("tables").find(d => d.flags?.spikependium?.key === "table:mm25:assassin-modus"); assert.equal(table.formula, "1d6"); assert.equal(table.results.length, 6);
for (const [key, dc, type] of [["bugbear-warrior", 12, "attack"], ["bugbear-stalker", 13, "save"]]) {
  const doc = find(key), item = doc.items.find(i => i.flags.spikependium?.monsterGrapple), action = Object.values(item.system.activities)[0];
  assert.equal(monsterGrappleRule({ ...action, item, actor: doc }).dc, dc);
  assert.equal(monsterGrappleRule({ ...action, item, actor: doc }).maxSize, "med"); assert.equal(action.type, type);
}
console.log("Assassin/Bugbears: PDF stats, base gear price/weight, native attack bonuses, quantity consumption/refund, native Evasion/resistance/HP and RollTable passed.");
{
  globalThis.ui = { notifications: { warn() {} } };
  const doc = find("assassin"), pc = { uuid: "Actor.cunning", isOwner: true, flags: structuredClone(doc.flags),
    statuses: new Set(), system: { attributes: { hp: { value: 97 } } } };
  const combat = { id: "cunningCombat000", started: true, round: 1, turn: 0, combatant: { actor: pc },
    getCombatantsByActor: a => a === pc ? [combat.combatant] : [] };
  game.combats = [combat]; game.combat = combat;
  const actions = Object.values(doc.items.find(i => i.name === "Хитроумное действие").system.activities)
    .map(a => ({ ...structuredClone(a), actor: pc, item: { id: "cunning", flags: {} } }));
  for (const action of actions) action._prepareUsageUpdates = async config => prepareCunningUpdates(action, config, { actor: {}, item: [] });
  Hooks.call = (hook, ...args) => hook === "dnd5e.postActivityConsumption" ? recordCunningConsumption(...args) : undefined;
  const apply = async updates => {
    const deltas = getDeltas(pc, updates.actor);
    for (const [p, v] of Object.entries(updates.actor)) set(pc, p, v);
    return { actor: deltas, item: {} };
  };
  const message = { data: { system: {} } };
  await nativeConsume.call(actions[0], {}, message, apply);
  assert.equal(message.data.system.deltas.actor[0].delta, 1, "first numeric flag consumption enters native refund deltas");
  assert.equal(await nativeConsume.call(actions[1], {}, { data: { system: {} } }, apply), false, "all three options share one bonus action");
  await nativeRefund.call({ actor: pc }, message.data.system.deltas, async updates => {
    for (const [p, v] of Object.entries(updates.actor)) set(pc, p, v);
  });
  const afterRefund = { data: { system: {} } }; await nativeConsume.call(actions[2], {}, afterRefund, apply);
  assert.equal(afterRefund.data.system.deltas.actor[0].delta, 1);
  assert.equal(cunningDeltaLabel.call({ keyPath: afterRefund.data.system.deltas.actor[0].keyPath }, () => ({})).label, "Бонусное действие");
  combat.turn = 1; combat.combatant = { actor: { uuid: "Actor.other" } };
  assert.equal(prepareCunningUpdates(actions[0], {}, { actor: {}, item: [] }), false, "cannot act on another creature's turn");
  combat.turn = 0; combat.round = 2; combat.combatant = { actor: pc };
  assert.ok(prepareCunningUpdates(actions[0], {}, { actor: {}, item: [] }), "new own turn restores availability");
  pc.statuses.add("incapacitated"); assert.equal(prepareCunningUpdates(actions[0], {}, { actor: {}, item: [] }), false); pc.statuses.clear();
  const free = { actor: {}, item: [] }; assert.equal(prepareCunningUpdates(actions[0], { consume: { action: false } }, free), free);
  assert.deepEqual(free.actor, {}, "explicit free-action use preserves the native consumption override");
  game.combats = []; game.combat = null;
  const outside = { actor: {}, item: [] }; assert.equal(prepareCunningUpdates(actions[2], {}, outside), outside); assert.deepEqual(outside.actor, {});
  let release, called = 0;
  const pending = cunningUse.call(actions[0], async () => { called++; await new Promise(r => { release = r; }); return "done"; }, {});
  await cunningUse.call(actions[1], async () => { called++; }, {}); assert.equal(called, 1);
  release(); assert.equal(await pending, "done");
  pc.flags.spikependium.key = "actor:au-plant-vine"; game.combats = [combat]; game.combat = combat;
  assert.ok(prepareCunningUpdates(actions[0], {}, { actor: {}, item: [] }), "vine shares the same bonus-action budget");
}
console.log("Cunning actions: shared native consumption/refund, own-turn limit, new turns, incapacity, free/outside-combat usage and concurrent-dialog guard passed.");
{
  let serial = 0;
  foundry.utils.randomID = () => `disengage${String(serial++).padStart(7, "0")}`;
  const world = new Map(); globalThis.fromUuidSync = uuid => world.get(uuid);
  const owner = { id: "gm", isGM: true };
  const pc = { uuid: "Actor.disengager", isOwner: true, flags: structuredClone(find("assassin").flags), effects: [],
    statuses: new Set(), system: { attributes: { hp: { value: 97 } } }, testUserPermission: u => u === owner,
    async deleteEmbeddedDocuments(_type, ids) { this.effects = this.effects.filter(e => !ids.includes(e.id)); } };
  const doc = find("assassin"), item = doc.items.find(i => i.name === "Хитроумное действие");
  const data = Object.values(item.system.activities).find(a => a.flags?.spikependium?.cunningDisengage);
  const profile = item.effects.find(e => e.flags.spikependium?.disengageTemplate);
  assert.equal(data.type, "utility", "current-turn receipt owns effect application; no independent self-transform");
  assert.equal(data.target.affects.type, "self"); assert.equal(data.effects[0]._id, profile._id);
  const action = { ...structuredClone(data), uuid: "Actor.disengager.Item.cunning.Activity.disengage", actor: pc,
    item: { id: item._id, flags: {} }, applicableEffects: [{ ...profile, id: profile._id }] };
  const combat = { id: "disengageCombat0", started: true, round: 1, turn: 0, combatant: { actor: pc },
    getCombatantsByActor: a => a === pc ? [combat.combatant] : [] };
  game.combats = Object.assign([combat], { get: id => game.combats.find(c => c.id === id) }); game.combat = combat;
  game.time = { worldTime: 100 }; game.user = owner; game.users = { activeGM: owner }; game.actors = [pc]; game.scenes = [];
  world.set(pc.uuid, pc);
  const updates = prepareCunningUpdates(action, {}, { actor: {}, item: [] });
  for (const [p, v] of Object.entries(updates.actor)) set(pc, p, v);
  const payload = { data: { system: {} } }; recordCunningConsumption(action, {}, payload); recordDisengageUse(action, payload);
  const message = { id: "use", uuid: "ChatMessage.use", type: "usage", author: owner, flags: payload.data.flags,
    system: payload.data.system, getAssociatedActivity: () => action };
  globalThis.dnd5e = { applications: { components: { EffectApplicationElement: class {
    async _prepareEffectData(source) { return { action: "create", data: { ...structuredClone(source),
      system: { ...structuredClone(source.system), origin: { message: this.chatMessage.uuid, activity: action.uuid } } } }; }
  } } } };
  foundry.documents = { async modifyBatch(ops) {
    for (const op of ops) {
      if (op.documentName === "ActiveEffect") for (const d of op.data) pc.effects.push({ ...d, id: d._id, active: true });
      if (op.documentName === "ChatMessage") for (const d of op.updates) for (const [p, v] of Object.entries(d)) if (p !== "_id") set(message, p, v);
    }
  } };
  await syncDisengage(message); await syncDisengage(message); assert.equal(pc.effects.length, 1);
  assert.equal(pc.effects[0].system.magical, false); assert.equal(protectedFromOpportunity(pc), true);
  const attacker = { effects: [] }, config = { subject: { actor: attacker }, spikependium: { attackPurpose: "opportunity" } };
  const target = { data: { system: { targets: [{ actor: pc.uuid }] } } };
  assert.equal(prepareOpportunityRoll(config, {}, target), false, "declared opportunity attack is blocked");
  assert.equal(validateOpportunityRoll([{ options: {} }], config), false);
  config.spikependium.attackPurpose = "normal"; assert.equal(validateOpportunityRoll([{ options: {} }], config), undefined);
  set(pc, message.flags.spikependium.cunningDisengage.payment, 0);
  assert.equal(protectedFromOpportunity(pc), false, "refund immediately removes protection");
  await cleanDisengage(); assert.equal(pc.effects.length, 0);
  const counter = payload.data.system.deltas.actor.find(d => d.keyPath.includes("cunningActions")); set(pc, counter.keyPath, 1);
  await syncDisengage(message); assert.equal(pc.effects.length, 0, "another bonus action cannot restore refunded protection");
  const next = { ...message, id: "second", uuid: "ChatMessage.second", flags: structuredClone(message.flags) };
  delete next.flags.spikependium.disengageApplied;
  set(pc, next.flags.spikependium.cunningDisengage.payment, 1); await syncDisengage(next);
  assert.equal(protectedFromOpportunity(pc), true);
  combat.turn = 1; combat.combatant = { actor: { uuid: "Actor.enemy" } };
  assert.equal(protectedFromOpportunity(pc), false, "ends on this turn's end, not the next own turn");
  await cleanDisengage(); assert.equal(pc.effects.length, 0);
  game.combats.splice(0); game.combat = null;
  const free = { data: { system: {} } }; recordDisengageUse(action, free);
  const outside = { ...message, id: "outside", uuid: "ChatMessage.outside", flags: free.data.flags };
  await syncDisengage(outside); assert.equal(protectedFromOpportunity(pc), true);
  game.time.worldTime++; assert.equal(protectedFromOpportunity(pc), false); await cleanDisengage();
  assert.equal(pc.effects.length, 0);
  const vine = creatures.find(d => d.flags?.spikependium?.key === "actor:au-plant-vine");
  const vineAction = vine.items.flatMap(i => Object.values(i.system.activities)).find(a => a.flags?.spikependium?.cunningDisengage);
  assert.ok(vineAction); assert.equal(vineAction.target.affects.type, "self");
}
console.log("Disengage: self profiles, paid effect, current-turn expiry, opportunity-only gate, native refund isolation, replay guard and outside-combat cleanup passed.");
{
  class D20 { constructor(total) { this.total = total; this.options = { target: 15 }; this._evaluated = true; } }
  CONFIG.Dice.D20Roll = D20;
  const owner = { id: "gm", isGM: true }, doc = find("assassin"), item = doc.items.find(i => i.name === "Хитроумное действие");
  const data = Object.values(item.system.activities).find(a => a.flags?.spikependium?.cunningHide);
  assert.equal(data.type, "check"); assert.equal(data.check.ability, "dex"); assert.deepEqual(data.check.associated, ["ste"]);
  assert.equal(data.check.dc.formula, "15"); assert.equal(data.activation.type, "bonus");
  const source = item.effects.find(e => e.flags.spikependium?.hideTemplate); assert.deepEqual(source.statuses, ["invisible"]);
  const pc = { id: "hidden", uuid: "Actor.hidden", isOwner: true, flags: structuredClone(doc.flags), statuses: new Set(), effects: [],
    testUserPermission: u => u === owner, system: { attributes: { hp: { value: 97 } } }, performBulkUpdate: nativePerformBulkUpdate,
    async deleteEmbeddedDocuments(_type, ids) { this.effects = this.effects.filter(e => !ids.includes(e.id)); } };
  const action = { ...data, uuid: `${pc.uuid}.Item.cunning.Activity.hide`, actor: pc, applicableEffects: [source] };
  game.user = owner; game.users = { activeGM: owner }; game.actors = [pc]; game.scenes = [];
  const messages = []; game.messages = Object.assign(messages, { get: id => messages.find(m => m.id === id) });
  const newUsage = id => {
    const config = { data: { system: {} } }; recordHideUse(action, config);
    const origin = { id, uuid: `ChatMessage.${id}`, type: "usage", author: owner, flags: config.data.flags, system: {},
      getAssociatedActivity: () => action, getAssociatedRolls: () => messages.filter(m => m.system.origin === id),
      async setFlag(module, k, v) { set(this.flags, `${module}.${k}`, v); } };
    messages.push(origin); return origin;
  };
  const check = (origin, total) => {
    const card = { id: `check${messages.length}`, type: "check", author: owner, rolls: [new D20(total)],
      system: { origin: origin.id, skill: "ste", ability: "dex" }, getAssociatedActor: () => pc, getOriginatingMessage: () => origin };
    messages.push(card); return card;
  };
  dnd5e.applications.components.EffectApplicationElement = class {
    async _prepareEffectData(profile) { return { action: "create", data: { ...structuredClone(profile),
      system: { ...structuredClone(profile.system), origin: { message: this.chatMessage.uuid } } } }; }
  };
  foundry.documents.modifyBatch = async operations => {
    for (const op of operations) {
      if (op.documentName === "Actor") for (const u of op.updates) for (const [p, v] of Object.entries(u)) if (p !== "_id") set(pc, p, v);
      if (op.documentName === "ActiveEffect" && op.action === "delete") await pc.deleteEmbeddedDocuments("ActiveEffect", op.ids);
      if (op.documentName === "ActiveEffect" && op.action === "create") for (const d of op.data) pc.effects.push({ ...d, id: `effect${pc.effects.length}`, active: true });
      if (op.documentName === "ChatMessage") for (const u of op.updates) for (const [p, v] of Object.entries(u)) if (p !== "_id") set(messages.get(u._id), p, v);
    }
  };
  assert.equal(canUseHide(action, {}), false); assert.equal(canUseHide(action, { spikependium: { hideCover: true } }), undefined);
  const failed = newUsage("failed"); await syncHide(check(failed, 14)); assert.equal(pc.effects.length, 0);
  assert.equal(canRollHide({ subject: pc, skill: "ste", ability: "dex" }, {}, { data: { system: { origin: failed.id } } }), false);
  const origin = newUsage("success"), saved = check(origin, 23); await syncHide(saved); await syncHide(saved);
  assert.equal(pc.effects.length, 1); assert.equal(pc.effects[0].flags.spikependium.cunningHide.dc, 23);
  assert.equal(pc.effects[0].system.magical, false); assert.deepEqual(pc.effects[0].statuses, ["invisible"]);
  pc.effects.push({ id: "otherInvisible", flags: {}, statuses: ["invisible"], active: true });
  await endHideOnAttack([{ _evaluated: false }], { subject: { actor: pc } }); assert.equal(pc.effects.length, 2, "preview/cancel does not end hiding");
  await endHideOnAttack([new D20(5)], { subject: { actor: pc } });
  assert.equal(pc.effects.length, 1); assert.equal(pc.effects[0].id, "otherInvisible");
  await syncHide(saved); assert.equal(pc.effects.length, 1, "an old successful roll cannot restore hiding after an attack");
  const somatic = newUsage("somatic"), somaticCheck = check(somatic, 18); await syncHide(somaticCheck);
  await endHideOnSpell({ actor: pc, item: { type: "spell", system: { properties: new Set(["somatic"]) } } }); assert.equal(pc.effects.length, 2);
  await endHideOnSpell({ actor: pc, item: { type: "spell", system: { properties: new Set(["vocal"]) } } }); assert.equal(pc.effects.length, 1);
  const refund = newUsage("refunded"); refund.flags.spikependium.cunningHide.payment = "flags.spikependium.hideCasts.hideRefund000000.spent";
  set(pc, refund.flags.spikependium.cunningHide.payment, 1); await syncHide(check(refund, 18)); assert.equal(pc.effects.length, 2);
  set(pc, refund.flags.spikependium.cunningHide.payment, 0); await cleanHide(); assert.equal(pc.effects.length, 1);
  const pending = newUsage("interrupted"), pendingCheck = check(pending, 20);
  await endHideOnAttack([new D20(1)], { subject: { actor: pc } }); await syncHide(pendingCheck);
  assert.equal(pc.effects.length, 1, "attack ends a hide receipt even before its effect is applied");
}
console.log("Hide: native check definition, cover gate, failure/success/DC, attack/verbal expiry, other invisibility preservation, refund and stale/interrupted check guards passed.");
