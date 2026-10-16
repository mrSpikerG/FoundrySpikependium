import assert from "node:assert/strict";
import fs from "node:fs";
import { canUseGriffonTwoShield, prepareGriffonShieldUpdates, guardBrambleEquip, finishGriffonShieldUse, finishSkygliderMovement, cleanGriffonTwoShields,
  prepareFeywatchSave, prepareFeywatchCheck, prepareShieldBane, piscesTwentyData, shieldD20Evaluate, recordMonsterTamerDamage, recordMonsterTamerReturn, applyMonsterTamerDamage } from "../scripts/griffon-two-shields.mjs";
import { guardGriffonAttunement } from "../scripts/griffon-rings.mjs";
import { canUseGriffonItem } from "../scripts/griffon-items.mjs";
import { prepareGriffonTwoUpdates, recordGriffonCooldown } from "../scripts/griffon-two-items.mjs";
import { magusMaskSpellChanges } from "../scripts/mechanics.mjs";
import { nativeGriffonCastChanges } from "./data/dnd5e-griffon-native.mjs";
import { nativeBuildEvaluate } from "./data/dnd5e-reaction-native.mjs";
import { nativeUsesConsumption } from "./data/dnd5e-monsters-native.mjs";
import { nativeApplyDamage, nativeCalculateDamage } from "./data/dnd5e-guardian-native.mjs";
import { nativeShieldIsCriticalSuccess, nativeShieldIsCriticalFailure, nativeShieldIsValid, nativeShieldIsCritical, nativeShieldIsFumble } from "./data/dnd5e-griffon-two-shields-native.mjs";
const docs = new Map(), folders = new Map();
for (const pack of ["items", "creatures"]) for (const file of fs.readdirSync(`packs/_source/${pack}`)) { const d = JSON.parse(fs.readFileSync(`packs/_source/${pack}/${file}`, "utf8")); if (d._key.startsWith("!folders!")) folders.set(d._id, d); else docs.set(d.flags.spikependium.key, d); }
const raw = id => { const d = docs.get(`item:gs2:${id}`); assert.ok(d); return d; }, acts = d => Object.values(d.system.activities);
const evidence = JSON.parse(fs.readFileSync("tools/data/griffon-two-shields.json", "utf8")), names = JSON.parse(fs.readFileSync("babele/ru/spikependium.items.json", "utf8")).entries;
assert.equal(evidence.entries.length, 12);
for (const row of evidence.entries) {
  const d = docs.get(row.key); assert.ok(d); assert.equal(d.system.source.rules, "2014"); assert.equal(d.system.source.custom, row.url); assert.equal(d.system.source.page, ""); assert.equal(d.system.rarity, row.rarity);
  assert.ok(/[а-яё]/i.test(names[d._id].name)); assert.ok(d.system.price.value > 0 && d.system.weight.value > 0); assert.ok(d.flags.spikependium.nativeBase.startsWith("Compendium.dnd5e.equipment24.Item."));
  assert.equal(d.system.weight.value, row.key.endsWith("spiritwalker") ? 20 : 6); let parent = d.folder, found = false; while (parent) { const f = folders.get(parent); assert.ok(f); found ||= f.name === "Сумка грифона — книга 2"; parent = f.folder; } assert.ok(found);
  for (const a of acts(d)) { assert.equal(a.consumption.spellSlot, false); for (const e of a.effects ?? []) assert.ok(d.effects.some(p => p._id === e._id)); }
}
const tree = docs.get("actor:gs2:arborguard-tree"); assert.equal(tree.system.attributes.ac.flat, 13); assert.equal(tree.system.attributes.hp.max, 20); assert.deepEqual(tree.system.traits.dv.value, ["fire"]); assert.equal(tree.system.details.type.value, "custom"); assert.equal(tree.system.attributes.movement.speeds.walk, "0"); assert.ok(tree.folder); assert.ok(raw("arborguard").system.description.value.includes(`@UUID[Compendium.spikependium.creatures.Actor.${tree._id}]`));
for (const id of ["forge-dragon", "arborguard", "varion", "justicars"]) assert.equal(raw(id).system.armor.magicalBonus, 1);
assert.equal(acts(raw("forge-dragon"))[0].damage.parts[0].number, 3); assert.equal(acts(raw("forge-dragon"))[0].effects[0].onSave, false);
const world = new Map(); let serial = 0, confirm = true, confirmationCalls = 0, damageCards = 0;
const list = a => Object.assign(a, { get(id) { return this.find(d => d.id === id); }, has(id) { return this.some(d => d.id === id); } });
const set = (obj, path, value) => { const keys = path.split("."), last = keys.pop(); for (const k of keys) obj = obj[k] ??= {}; if (last.startsWith("-=")) delete obj[last.slice(2)]; else obj[last] = structuredClone(value); };
const apply = (obj, data) => { for (const [key, value] of Object.entries(data)) set(obj, key, value); };
globalThis.fromUuidSync = (uuid, opts) => world.get(uuid?.startsWith(".") ? `${opts?.relative.uuid}${uuid}` : uuid);
globalThis.game = { user: { id: "gm", isGM: true, isActiveGM: true }, users: { activeGM: { id: "gm" } }, time: { worldTime: 100 }, messages: list([]), actors: [], scenes: [], combat: null, i18n: { localize: v => v } };
globalThis.ui = { notifications: { warn() {} } }; globalThis.ChatMessage = { getSpeaker: ({ actor }) => ({ actor: actor.id }) };
globalThis.foundry = { utils: { randomID: () => `nonce${++serial}`, deepClone: structuredClone, getProperty: (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj) }, applications: { api: { DialogV2: { confirm: async () => { confirmationCalls++; return confirm; } } } } };
Math.clamp ??= (n, min, max) => Math.min(max, Math.max(min, n)); Number.isNumeric ??= Number.isFinite;
globalThis.Hooks = { call(name, ...args) { if (name === "dnd5e.preApplyDamage") return recordMonsterTamerDamage(...args) !== false && recordMonsterTamerReturn(...args) !== false; return true; }, callAll() {} };
class Die {
  constructor(data) { Object.assign(this, structuredClone(data)); this._evaluated = true; this.options ??= { criticalSuccess: 20, criticalFailure: 1 }; }
  get total() { return this.results.filter(r => r.active !== false && !r.discarded).reduce((n, r) => n + (r.count ?? r.result), 0); }
  get isValid() { return nativeShieldIsValid.call(this); } get isCriticalSuccess() { return nativeShieldIsCriticalSuccess.call(this); } get isCriticalFailure() { return nativeShieldIsCriticalFailure.call(this); }
}
class D20 {
  constructor(face = 1, options = {}) { this.options = options; this._evaluated = false; this.total = face + 8; this.terms = [new Die({ class: "D20Die", number: 1, faces: 20, results: [{ result: face, active: true }], options: { criticalSuccess: 20, criticalFailure: 1 } }), { class: "OperatorTerm", operator: "+" }, { class: "NumericTerm", number: 5 }, { class: "OperatorTerm", operator: "+" }, new Die({ class: "Die", number: 1, faces: 4, results: [{ result: 3, active: true }] })]; }
  get d20() { return this.terms[0]; } get isCritical() { return nativeShieldIsCritical.call(this); } get isFumble() { return nativeShieldIsFumble.call(this); }
  get isFumbleForHit() { return this.isFumble; } get dice() { return this.terms.filter(t => t instanceof Die); }
  async evaluate() { this._evaluated = true; return this; }
  toJSON() { return structuredClone({ class: "D20Roll", options: this.options, evaluated: this._evaluated, formula: "1d20 + 5 + 1d4", total: this.total, terms: this.terms }); }
  static fromData(data) { const r = new D20(); Object.assign(r, { options: data.options, _evaluated: data.evaluated, total: data.total, terms: data.terms.map(t => t.faces ? new Die(t) : t) }); return r; }
}
class Damage { constructor(type, total) { this.total = total; this.options = { type }; this._evaluated = true; } static async build(config, _dialog, message) { damageCards++; assert.equal(config.isCritical, false); makeMessage({ ...message.data, rolls: [new Damage("psychic", 4)] }); } }
globalThis.Roll = { fromData: D20.fromData };
globalThis.CONFIG = { Dice: { D20Roll: D20, DamageRoll: Damage }, DND5E: { movementTypes: { walk: {}, fly: {}, swim: {} }, healingTypes: { healing: {}, temphp: {} }, damageTypes: { slashing: { isPhysical: true }, psychic: {} } } };
function actor(id, type = "humanoid") {
  const a = { id, uuid: `Actor.${id}`, documentName: "Actor", isOwner: true, flags: { spikependium: {} }, classes: {}, items: list([]), effects: list([]), statuses: new Set(),
    system: { attributes: { hp: { value: 100, max: 100, effectiveMax: 100, temp: 0, tempmax: 0, damage: 0 } }, details: { type: { value: type } }, _source: { attributes: { hp: { tempmax: 0 } } } },
    getRollData() { return this.system; }, async setFlag(scope, key, value) { set(this, `flags.${scope}.${key}`, value); },
    async update(changes) { if (this.failUpdate) { this.failUpdate = false; throw Error("simulated failed actor update"); } apply(this, changes); this.system.attributes.hp.damage = 100 - this.system.attributes.hp.value; },
    async deleteEmbeddedDocuments(type, ids) { assert.equal(type, "ActiveEffect"); for (const e of [...this.effects]) if (ids.includes(e.id)) { world.delete(e.uuid); this.effects.splice(this.effects.indexOf(e), 1); } },
    changeHasEffect(kind, d) { return kind === "resistance" && this.resist?.has(d.type); }, changeIsIgnored: () => false,
    calculateDamage(d, o) { return nativeCalculateDamage.call(this, d, o); }, applyDamage(d, o) { return nativeApplyDamage.call(this, d, o); } };
  game.actors.push(a); world.set(a.uuid, a); return a;
}
function item(id, owner) {
  const i = structuredClone(raw(id)); i.id = `item${++serial}`; i.uuid = `${owner.uuid}.Item.${i.id}`; i.actor = owner; i.system.equipped = true; i.system.attuned = true;
  i.refresh = () => { i.system.uses.max = Number(i.system.uses.max || 0); i.system.uses.value = Math.max(0, i.system.uses.max - i.system.uses.spent); };
  i.update = async changes => { if (i.failUpdate) { i.failUpdate = false; throw Error("simulated failed item update"); } apply(i, changes); i.refresh(); };
  i.refresh(); i.effects = list(i.effects.map(e => ({ ...e, statuses: new Set(e.statuses) })));
  i.system.activities = list(acts(i).map(a => ({ ...a, id: a._id, actor: owner, item: i, uuid: `${i.uuid}.Activity.${a._id}`, toObject: () => structuredClone(a) })));
  for (const a of i.system.activities) world.set(a.uuid, a); owner.items.push(i); world.set(i.uuid, i); i.setFlag = async (s, k, v) => { set(i, `flags.${s}.${k}`, v); }; return i;
}
function fx(owner, flags, activity, extra = {}) {
  const e = { id: `fx${++serial}`, active: true, flags: { spikependium: flags }, duration: { expired: false }, system: { origin: { activity: activity?.uuid } }, ...extra };
  e.uuid = `${owner.uuid}.ActiveEffect.${e.id}`; owner.effects.push(e); world.set(e.uuid, e); return e;
}
function makeMessage(data) {
  const id = `msg${++serial}`, m = { id, uuid: `ChatMessage.${id}`, author: game.user, flags: {}, system: {}, rolls: [], whisper: [], ...data,
    getAssociatedActivity: () => m.activity, getAssociatedActor: () => m.activity?.actor,
    getOriginatingMessage: () => game.messages.get(m.system.origin) ?? m };
  game.messages.push(m); world.set(m.uuid, m); return m;
}
const owner = actor("owner"), enemy = actor("enemy", "beast"), friend = actor("friend");
const bramble = item("bramble", owner), grow = bramble.system.activities.find(a => a.flags.spikependium.brambleGrow), end = bramble.system.activities.find(a => a.flags.spikependium.brambleEnd);
assert.equal(guardGriffonAttunement(bramble, { "system.attuned": true }), false); owner.classes.ranger = { system: { levels: 1 } }; assert.equal(guardGriffonAttunement(bramble, { "system.attuned": true }), undefined); assert.equal(canUseGriffonItem(grow), true);
owner.classes = { druid: { system: { levels: 1 } } }; assert.equal(canUseGriffonItem(grow), true);
const changes = magusMaskSpellChanges.call(grow, () => nativeGriffonCastChanges.call(grow)); assert.ok(changes.some(c => c.key === "system.properties" && c.value === "-concentration")); const template = JSON.parse(changes.find(c => c.key === "system.target").value).template; assert.equal(template.size, "20"); assert.equal(template.width, "15");
assert.equal(changes.find(c => c.key === "name").value, "Шипы тернового баклера"); assert.ok(changes.find(c => c.key === "system.description.value").value.includes("[[/damage 2d4 type=piercing]]")); assert.equal(changes.find(c => c.key === "system.source.custom").value, bramble.system.source.custom);
const empty = () => ({ actor: {}, activity: {}, item: [], create: [], delete: [], rolls: [] });
assert.equal(prepareGriffonShieldUpdates(grow, {}, empty()), false); const paid = empty(); paid.item.push({ _id: bramble.id, "system.uses.spent": 1 }); await prepareGriffonTwoUpdates(grow, {}, paid); assert.equal(prepareGriffonShieldUpdates(grow, {}, paid), paid);
const linked = { getLinkedActivity: () => grow }; assert.equal(prepareGriffonShieldUpdates(linked, {}, empty()), false); assert.equal(prepareGriffonShieldUpdates(linked, {}, paid), paid);
const data = { data: { system: {} } }; recordGriffonCooldown(grow, {}, data); await bramble.update(paid.item[0]); await finishGriffonShieldUse(grow, { message: { system: data.data.system } }); assert.equal(bramble.system.equipped, false); assert.ok(bramble.flags.spikependium.brambleArea); assert.equal(guardBrambleEquip(bramble, { "system.equipped": true }), false); assert.equal(canUseGriffonItem(end), true);
await finishGriffonShieldUse(end, { message: {} }); assert.equal(bramble.system.equipped, true); assert.equal(bramble.flags.spikependium.brambleArea, undefined); assert.equal(bramble.system.uses.spent, 1);
const storm = item("storm-eye", owner), augury = storm.system.activities.find(a => a.flags.spikependium.stormAugury), refill = storm.system.activities.find(a => a.flags.spikependium.stormRefill);
assert.equal(augury.uses.max, "1"); assert.deepEqual(augury.uses.recovery, []); assert.equal(canUseGriffonTwoShield(augury), false); storm.system.equipped = false; assert.equal(canUseGriffonItem(augury), true); assert.equal(canUseGriffonTwoShield(augury), undefined);
const activityCost = empty(); activityCost.activity["uses.spent"] = 1; assert.equal(prepareGriffonShieldUpdates(augury, {}, activityCost), activityCost); const nestedCost = empty(); nestedCost.item.push({ _id: storm.id, [`system.activities.${augury.id}`]: { uses: { spent: 1 } } }); assert.equal(prepareGriffonShieldUpdates({ getLinkedActivity: () => augury }, {}, nestedCost), nestedCost);
augury.uses.spent = 1; const refillUpdates = prepareGriffonShieldUpdates(refill, {}, empty()); assert.equal(refillUpdates.item[0][`system.activities.${augury.id}.uses.spent`], 0); assert.equal(refillUpdates.activity["uses.spent"], undefined); assert.equal(storm.system.uses.spent, 0); augury.uses.spent = 0; assert.equal(prepareGriffonShieldUpdates(refill, {}, empty()), false);
const charge = await nativeUsesConsumption.call({ resolveCost: async () => ({ total: 1 }) }, {}, { uses: { max: 3, value: 3, spent: 0 }, rolls: [], delta: {}, type: "charge" }); assert.equal(charge.spent, 1);
const sky = item("skyglider", owner), skyAct = sky.system.activities[0], wings = fx(owner, { griffonSkyglider: true }, skyAct);
const model = { parent: owner, attributes: { movement: { speeds: { walk: 30, fly: 70, swim: 0, jump: 100 }, max: 100 } } }; finishSkygliderMovement(model); assert.equal(model.attributes.movement.speeds.fly, 30); assert.equal(model.attributes.movement.max, 30); model.attributes.movement.speeds.fly = 15; finishSkygliderMovement(model); assert.equal(model.attributes.movement.speeds.fly, 15); assert.equal(canUseGriffonTwoShield({ actor: owner, item: { system: { identifier: "dash" } } }), false);
sky.system.equipped = false; await cleanGriffonTwoShields(); assert.equal(owner.effects.includes(wings), false);
const arbor = item("arborguard", owner), wall = fx(owner, { griffonArborWall: true }, arbor.system.activities[0]); arbor.system.equipped = false; let ended = 0;
owner.endConcentration = async target => { assert.equal(target, arbor); ended++; }; await cleanGriffonTwoShields(); assert.equal(ended, 1); assert.equal(owner.effects.includes(wall), false, "releasing the shield ends only its concentration and wall profile");
const fey = item("feywatch", owner), charm = makeMessage({ activity: { applicableEffects: [{ statuses: new Set(["charmed"]) }] } });
const save = { subject: owner, rolls: [{ parts: [], data: {} }] }; prepareFeywatchSave(save, {}, { data: { system: { origin: charm.id } } }); assert.deepEqual(save.rolls[0].parts, ["@spikependiumFeywatch"]); assert.equal(save.rolls[0].data.spikependiumFeywatch, 5); prepareFeywatchSave(save, {}, { data: {} }); assert.deepEqual(save.rolls[0].parts, []);
const illusion = makeMessage({ activity: { type: "check", item: { type: "spell", system: { school: "ill" } } } }); prepareFeywatchCheck(save, {}, { data: { system: { origin: illusion.id } } }); assert.equal(save.rolls[0].data.spikependiumFeywatch, 5); fey.system.equipped = false; prepareFeywatchCheck(save, {}, { data: { system: { origin: illusion.id } } }); assert.deepEqual(save.rolls[0].parts, []);
const curse1 = fx(owner, { griffonShieldBane: true }), curse2 = fx(owner, { griffonShieldBane: true }), check = { subject: owner, rolls: [{ parts: [], data: {}, options: {} }], hookNames: ["abilityCheck"] };
prepareShieldBane(check); prepareShieldBane(check); assert.deepEqual(check.rolls[0].parts, ["@spikependiumShieldBane"]); assert.equal(check.rolls[0].data.spikependiumShieldBane, "-1d4");
const cursedRolls = [new D20(10, check.rolls[0].options)]; await shieldD20Evaluate.call(D20, nativeBuildEvaluate, cursedRolls, check); assert.ok(!owner.effects.includes(curse1) && !owner.effects.includes(curse2));
const canceledCurse = fx(owner, { griffonShieldBane: true }); await shieldD20Evaluate.call(D20, nativeBuildEvaluate, [], check); assert.ok(owner.effects.includes(canceledCurse)); await owner.deleteEmbeddedDocuments("ActiveEffect", [canceledCurse.id]);
const fish = item("pisces", owner), water = fish.system.activities[0]; fish.system.equipped = false; assert.equal(canUseGriffonItem(water), true); await finishGriffonShieldUse(water, { message: {} }); fish.system.equipped = true;
const original = new D20(1); await original.evaluate(); const before = original.toJSON(), replaced = piscesTwentyData(original); assert.equal(replaced.total, 28); assert.equal(replaced.terms[0].results[0].result, 20); assert.deepEqual(original.toJSON(), before); assert.equal(replaced.terms[4].results[0].result, 3);
const aliased = new D20(1); await aliased.evaluate(); aliased.toJSON = () => ({ terms: aliased.terms, options: aliased.options, total: aliased.total, evaluated: true }); piscesTwentyData(aliased); assert.equal(aliased.d20.total, 1, "serialized results may alias the immutable Roll; offering the choice must not mutate it");
const reliable = new D20(1); await reliable.evaluate(); reliable.terms[0].modifiers = ["min10"]; reliable.terms[0].results[0].count = 10; reliable.total = 18; const reliableData = piscesTwentyData(reliable); assert.equal(reliableData.total, 28, "a counted minimum is replaced rather than added again"); assert.equal(reliableData.terms[0].results[0].count, 20); assert.equal(reliable.total, 18);
const declined = [new D20(1)]; confirm = false; await shieldD20Evaluate.call(D20, nativeBuildEvaluate, declined, { subject: owner, hookNames: ["attack"] }); assert.equal(declined[0].total, 9); assert.equal(fish.system.uses.spent, 0);
confirm = true; const lucky = [new D20(1)]; await shieldD20Evaluate.call(D20, nativeBuildEvaluate, lucky, { subject: owner, hookNames: ["attack"] }); assert.equal(lucky[0].total, 28); assert.equal(lucky[0].isCritical, true); assert.equal(lucky[0].isFumble, false); assert.equal(fish.system.uses.value, 0); assert.equal(fish.flags.spikependium.piscesCooldown, game.time.worldTime + 86400); assert.equal(canUseGriffonTwoShield(water), false);
const transferred = item("pisces", friend); transferred.flags.spikependium = structuredClone(fish.flags.spikependium); assert.equal(canUseGriffonTwoShield(transferred.system.activities[0]), false);
game.time.worldTime += 86400; await finishGriffonShieldUse(water, { message: {} }); const discarded = new D20(12); discarded.terms[0].results.push({ result: 1, active: false, discarded: true }); const offers = confirmationCalls; await shieldD20Evaluate.call(D20, nativeBuildEvaluate, [discarded], { subject: owner, hookNames: ["savingThrow"] }); assert.equal(confirmationCalls, offers);
const failedPayment = [new D20(1)]; fish.failUpdate = true; await assert.rejects(shieldD20Evaluate.call(D20, nativeBuildEvaluate, failedPayment, { subject: owner, hookNames: ["savingThrow"] })); assert.equal(failedPayment[0].total, 9); assert.equal(fish.system.uses.spent, 0);
game.time.worldTime += 86400; await cleanGriffonTwoShields(); assert.equal(fish.system.uses.spent, 1);
const spirit = item("spiritwalker", owner); assert.equal(canUseGriffonTwoShield(spirit.system.activities[0]), false); owner.system.attributes.hp.value = 0; assert.equal(canUseGriffonTwoShield(spirit.system.activities[0]), undefined); assert.ok(!spirit.effects[0].system.changes.length); owner.system.attributes.hp.value = 100;
const justicar = fx(owner, { griffonJusticarPulse: true }, null, { start: { combat: { id: "test", started: true, round: 2, turn: 1 }, round: 2, turn: 0 } }); await cleanGriffonTwoShields(); assert.equal(owner.effects.includes(justicar), false);
const tamer = item("monster-tamer", owner), enemyActivity = { uuid: "Actor.enemy.Item.weapon.Activity.hit", actor: enemy, item: { flags: {}, system: {} }, getActionType: () => "mwak" }, targetToken = { uuid: "Scene.test.Token.owner", actor: owner }; world.set(targetToken.uuid, targetToken);
const attackRoll = new D20(15); await attackRoll.evaluate(); const attack = makeMessage({ type: "attack", activity: enemyActivity, rolls: [attackRoll], system: { targets: [{ actor: owner.uuid, token: targetToken.uuid, ac: 10 }] } });
const damage = makeMessage({ type: "damage", activity: enemyActivity, flags: { spikependium: { attackSource: { message: attack.uuid, signature: JSON.stringify(attack.rolls.map(r => r.toJSON())) } } }, system: { origin: attack.id } });
game.user = { id: "player", isGM: false, isActiveGM: false }; enemy.isOwner = false; await owner.applyDamage([{ type: "slashing", value: 10 }], { originatingMessage: damage }); assert.ok(owner.flags.spikependium.monsterTamerPending[attack.id]); await applyMonsterTamerDamage(owner); assert.equal(enemy.system.attributes.hp.value, 100);
game.user = { id: "gm", isGM: true, isActiveGM: true }; enemy.isOwner = true; enemy.resist = new Set(["psychic"]); enemy.failUpdate = true; await assert.rejects(applyMonsterTamerDamage(owner)); const cards = damageCards; await applyMonsterTamerDamage(owner); assert.equal(damageCards, cards); assert.equal(enemy.system.attributes.hp.value, 98); await applyMonsterTamerDamage(owner); assert.equal(enemy.system.attributes.hp.value, 98);
console.log("GS2 shields: 12 sources/object/folders/native bases, paid linked casts/activity resources, OR attunement, bramble lifecycle, independent storm recharge, scoped Feywatch, one-shot Bane, native critical Pisces/clock/payment/transfer, flight cap, spirit marker and atomic GM retaliation passed.");
