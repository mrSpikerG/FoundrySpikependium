import assert from "node:assert/strict";
import fs from "node:fs";
import { canUseMakingModifier, prepareMakingDialog, prepareMakingUpdates, recordMakingCast, applyMakingEnchantment,
  prepareMakingEnchantment, makingSuppression, makingEffectChange, makingArmorState, prepareMakingAttack, buildMakingAttack,
  finalizeMakingAttack, consumeMakingAttack, refreshMaking } from "../scripts/dragonmark-making.mjs";
import { constructParts, getAttackData, fromConfig, processDamagePart, isExpiryEvent, setModificationField } from "./data/dnd5e-making-native.mjs";
import { prepareResourceUpdates } from "../scripts/resources.mjs";
import { requireConduitCastingDialog } from "../scripts/conduit.mjs";

const fixture = JSON.parse(fs.readFileSync("tools/data/dnd5e-magic-weapon.json", "utf8")), MOD = "XmyjP2cH9CkBmdgy";
const featDoc = JSON.parse(fs.readFileSync(`packs/_source/feats/${fs.readdirSync("packs/_source/feats").find(f => f.startsWith("feat-greater-making_"))}`, "utf8"));
assert.equal(featDoc.system.activities[MOD].uses.max, "1"); assert.equal(featDoc.system.activities[MOD].uses.recovery[0].period, "lr");
assert.equal(fixture.system.activities.dnd5eactivity000.type, "enchant");
const list = a => Object.assign(a, { get(id) { return this.find(e => e.id === id); } });
const clone = structuredClone, set = (obj, path, value) => { const parts = path.split("."); for (const key of parts.slice(0, -1)) obj = obj[key] ??= {}; obj[parts.at(-1)] = clone(value); };
let documents, actor, weapon, spell, feat, uses, spellActivity, attack, fail, duringWrite, nonce, resets;
globalThis.fromUuidSync = uuid => documents.get(uuid);
globalThis.ui = { notifications: { warn() {}, error() {} } };
globalThis.foundry = { utils: { setProperty: set, randomID: () => String(++nonce).padStart(16, "A") }, data: { fields: {
  BooleanField: class { constructor(data) { Object.assign(this, data); } }, StringField: class { constructor(data) { Object.assign(this, data); } }
} } };
globalThis.CONFIG = { Dice: { BasicRoll: { constructParts }, D20Roll: { DefaultConfigurationDialog: class {} }, D20Die: class { formula = "1d20"; static CRITICAL_SUCCESS_TOTAL = 20; static CRITICAL_FAILURE_TOTAL = 1; } },
  ActiveEffect: { documentClass: { getEffectStart: () => ({ time: game.time.worldTime, round: game.combat?.round, turn: game.combat?.turn }) } } };
setModificationField({ combineFields: () => ({ bonus: null }) });
globalThis.Roll = class { constructor(formula) { this.isDeterministic = !formula.includes("d"); } };
// The host parses the formula at construction, before buildEvaluate; native fromConfig supplies the formula and data.
class HostRoll {
  static fromConfig = fromConfig;
  constructor(formula, data, options) { this.data = clone(data); this.options = clone(options); this.formula = formula.replace(/@(\w+)/g, (_, k) => String(data[k])); this._evaluated = false; }
}
class Effect {
  constructor(data, parent) { Object.assign(this, clone(data)); this.id = data._id; this.parent = parent; this.uuid = `${parent.uuid}.ActiveEffect.${this.id}`;
    this.flags ??= {}; this.duration ??= { expired: false }; this.disabled ??= false;
    const start = data.start ?? CONFIG.ActiveEffect.documentClass.getEffectStart(); this.start = { ...start, combat: game.combat?.started ? game.combat : null };
    this.specialDuration = this.duration.expiry; documents.set(this.uuid, this); }
  get active() { return !this.disabled && !this.duration.expired && !makingSuppression.call(this, () => this.system.magical !== false && this.parent.actor?.statuses.has("antimagic")); }
  isExpiryEvent = isExpiryEvent;
  async delete() { if (fail === "delete") { fail = null; throw Error("delete failed"); } this.parent.effects.splice(this.parent.effects.indexOf(this), 1); documents.delete(this.uuid); this.parent.reset(); }
}
class Weapon {
  documentName = "Item"; type = "weapon"; isOwner = true; name = "Sword"; id = "sword";
  constructor(parent) { this.actor = parent; this.uuid = `${parent.uuid}.Item.${this.id}`; this.flags = {}; this.effects = list([]); this.rawBonus = 0; this.otherBonus = 0; this.system = { quantity: 1, equipped: true, prof: { term: 2 }, type: { value: "simpleM" } };
    this.system.activities = new Map([["attack", new Attack(this)]]); this.reset(); }
  reset() { resets++; let bonus = this.rawBonus, magical = false;
    for (const e of this.effects) if (e.active) {
      for (const c of e.system.changes) if (c.key === "system.magicalBonus") {
        makingEffectChange((model, change) => { bonus = Math.max(bonus, Number(change.value)); }, this, { ...c, effect: e });
      } else if (c.key === "system.properties" && c.value === "mgc") magical = true;
    }
    this.system.magicalBonus = Math.max(bonus, this.otherBonus); this.system.magicAvailable = magical; this.system.properties = new Set(magical ? ["mgc"] : []);
  }
  clone(data) { const copy = new Weapon(this.actor); copy.id = this.id; copy.uuid = this.uuid; copy.system = { ...this.system, activities: undefined }; copy.effects = list([...this.effects]); copy.flags = clone(this.flags);
    copy.rawBonus = this.rawBonus; copy.otherBonus = this.otherBonus; for (const [k, v] of Object.entries(data)) set(copy, k, v);
    copy.system.activities = new Map([["attack", new Attack(copy)]]); copy.reset(); return copy; }
  async deleteEmbeddedDocuments(type, ids) { assert.equal(type, "ActiveEffect"); for (const e of [...this.effects]) if (ids.includes(e.id)) await e.delete(); }
}
class Attack {
  type = "attack"; id = "attack";
  constructor(item) { this.item = item; this.actor = item.actor; this.attack = { flat: false, bonus: null, type: { classification: "weapon" } }; }
  getRollData() { return { mod: 3, roll: { ability: "str" } }; }
  getActionType() { return "mwak"; }
  getAttackData = getAttackData;
}
function setup() {
  documents = new Map(); nonce = 0; resets = 0; fail = duringWrite = undefined;
  const player = { id: "player", isGM: false }, gm = { id: "gm", isGM: true, isActiveGM: true }, users = list([player, gm]); users.activeGM = gm;
  globalThis.game = { user: player, users, actors: [], scenes: [], items: [], time: { worldTime: 100 }, combat: null };
  actor = { uuid: "Actor.caster", flags: {}, items: list([]), effects: list([]), statuses: new Set(), isOwner: true,
    system: { attributes: { ac: { value: 10 } } }, testUserPermission: u => u?.isGM || u?.id === player.id,
    getFlag: () => 0, addConditionRollReduction() {}, reset() { resets++; for (const i of this.items) i.reset?.(); this.system.attributes.ac.value = 10;
      const state = makingArmorState(this); for (const e of this.effects) if (e.active && !e.duration.expired && state[e.flags.spikependium?.makingAllocation?.id]) this.system.attributes.ac.value += Number(e.system.changes[0].value); },
    async setFlag(module, key, value) { if (fail === "flag") { fail = undefined; throw Error("flag failed"); } set(this.flags, `${module}.${key}`, value); await duringWrite?.(); this.reset(); },
    async createEmbeddedDocuments(type, data) { assert.equal(type, "ActiveEffect"); if (fail === "create") { fail = undefined; throw Error("effect failed"); }
      const effects = data.map(d => new Effect(d, this)); this.effects.push(...effects); this.reset(); return effects; },
    async deleteEmbeddedDocuments(type, ids) { assert.equal(type, "ActiveEffect"); for (const e of [...this.effects]) if (ids.includes(e.id)) await e.delete(); }
  };
  documents.set(actor.uuid, actor); game.actors.push(actor);
  weapon = new Weapon(actor); documents.set(weapon.uuid, weapon); actor.items.push(weapon); attack = weapon.system.activities.get("attack");
  uses = { uses: { spent: 0, get value() { return 1 - this.spent; } } };
  feat = { id: featDoc._id, flags: clone(featDoc.flags), effects: list([]), system: { activities: new Map([[MOD, uses]]) } }; actor.items.push(feat);
  spell = { uuid: "Actor.caster.Item.magic", type: "spell", system: clone(fixture.system), flags: {} };
  spellActivity = { id: "dnd5eactivity000", type: "enchant", actor, item: spell, flags: {}, consumption: { targets: [] },
    canEnchant: () => [], duration: { getEffectData: () => ({ value: 1, convertTime: () => ({ value: 3600 }) }) } };
  return { player, gm };
}
function ownTurn(round = 1, index = 0) {
  if (!game.combat) { game.combat = { uuid: "Combat.test", started: true, getCombatantsByActor: a => a === actor ? [game.combat.combatant] : [] }; documents.set(game.combat.uuid, game.combat); }
  Object.assign(game.combat, { round, turn: index, combatant: { id: "caster", actor }, previous: { combatantId: "other" } });
}
function paid(improved = true) {
  const updates = prepareMakingUpdates(spellActivity, { spikependium: { improvedMaking: improved } }, { actor: {}, item: [] }); assert.notEqual(updates, false);
  for (const [key, value] of Object.entries(updates.actor)) set(actor, key, value);
  if (improved) uses.uses.spent = updates.item[0][`system.activities.${MOD}.uses.spent`];
  const message = { data: { system: {} } }; recordMakingCast(spellActivity, message);
  return { ...message.data, type: "usage", author: game.users[0], system: { ...message.data.system, deltas: { item: improved ? { [feat.id]: [{ keyPath: `system.activities.${MOD}.uses.spent`, delta: 1 }] } : {} } } };
}
async function enchant(message, bonus = 2, target = weapon) {
  return applyMakingEnchantment.call(spellActivity, async (profile, item, options) => {
    const data = clone(fixture.effects.find(e => e.system.changes.some(c => c.key === "system.magicalBonus" && Number(c.value) === bonus)));
    data.transfer = true; data.system.origin = { activity: `${spell.uuid}.Activity.${spellActivity.id}`, profile: data._id };
    if (prepareMakingEnchantment(item, data, { activity: spellActivity, chatMessage: options.chatMessage }) === false) return null;
    const effect = new Effect(data, item); item.effects.push(effect); item.reset(); return effect;
  }, "profile", target, { chatMessage: message });
}
function configured(amount = 1, outside = false) {
  const config = { subject: attack }, dialog = {};
  prepareMakingAttack(config, dialog); assert.ok(config.spikependium?.makingCast);
  config.spikependium.making = String(amount); config.spikependium.makingFirstTurn = outside;
  const built = { ...attack.getAttackData(), options: { ability: "str", advantageMode: 1, attackMode: "oneHanded", ammunition: "ammo" } };
  buildMakingAttack(config, built);
  const roll = HostRoll.fromConfig(built, config);
  assert.notEqual(finalizeMakingAttack([roll], config), false);
  return { config, rolls: [roll], dialog };
}
const evaluate = async rolls => { for (const r of rolls) r._evaluated = true; };
const baseDamage = () => ({ parts: ["1d8"], data: { mod: 3 }, options: {} });
const damage = () => processDamagePart.call(attack, { base: true }, {}, {}, 0, {}, baseDamage, Number);
const originalError = console.error; console.error = () => {};
setup(); assert.equal(canUseMakingModifier({ id: MOD, item: feat }), false);
const dialog = { applicationClass: class { async _prepareConsumptionContext(c) { return c; } } }, config = {};
prepareMakingDialog(spellActivity, config, dialog); assert.equal(requireConduitCastingDialog(() => false, config), true);
const uiDialog = new dialog.applicationClass(); uiDialog.config = config;
assert.equal((await uiDialog._prepareConsumptionContext({ fields: [], inputs: { createCheckboxInput() {} } })).fields[0].value, false);
const ordinary = { actor: {}, item: [] }; assert.equal(prepareMakingUpdates({ ...spellActivity, item: { ...spell, type: "weapon" } }, {}, ordinary), ordinary);
assert.equal(prepareMakingUpdates({ ...spellActivity, item: { ...spell, flags: { spikependium: { storedSpell: true } } } }, { spikependium: { improvedMaking: true } }, ordinary), false);
uses.uses.spent = 1; assert.equal(prepareMakingUpdates(spellActivity, { spikependium: { improvedMaking: true } }, ordinary), false);
setup(); const unpaid = prepareMakingUpdates(spellActivity, { spikependium: { improvedMaking: true } }, { actor: {}, item: [] });
assert.equal(uses.uses.spent, 0); assert.deepEqual(actor.flags, {}); const failedCard = { data: { system: {} } }; recordMakingCast(spellActivity, failedCard); assert.equal(failedCard.data.flags, undefined);
setup(); const m = paid(); const enchantment = await enchant(m); assert.equal(weapon.system.magicalBonus, 2);
assert.equal(enchantment.duration.value, 3600); assert.equal(enchantment.start.time, 100); assert.equal(enchantment.flags.spikependium.magicWeapon.improved, true);
assert.equal(await enchant(m), null, "старой карточкой не зачаровываем второе оружие");
ownTurn(); const first = configured(1); assert.ok(first.rolls[0].formula.endsWith(" + 1"), "формула первой атаки построена с перенесённым бонусом до оценки");
assert.equal(first.rolls[0].parts, undefined, "после построения Native Roll уже не имеет массива parts");
await consumeMakingAttack(evaluate, first.rolls, first.config); assert.equal(first.rolls[0]._evaluated, true); assert.equal(weapon.system.magicalBonus, 1);
assert.equal(actor.system.attributes.ac.value, 11); assert.equal(damage().data.magicalBonus, 1); assert.equal(weapon.system.properties.has("mgc"), true);
assert.equal(first.rolls[0].options.advantageMode, 1); assert.equal(first.rolls[0].options.ammunition, "ammo");
const sourceAllocation = actor.effects[0]; assert.equal(sourceAllocation.duration.expiry, "targetStart"); assert.equal(sourceAllocation.system.magical, true);
assert.equal(JSON.parse(sourceAllocation.system.changes[0].conditions).k, `spikependium.makingArmor.${m.flags.spikependium.makingCast.id}`);
const later = {}; prepareMakingAttack({ subject: attack }, later); assert.equal(later.configure, undefined);
assert.equal(attack.getAttackData().data.weaponMagic, 1); const reaction = { subject: attack }; game.combat.combatant = { actor: { uuid: "Actor.enemy" } }; game.combat.turn = 1;
prepareMakingAttack(reaction, {}); assert.equal(reaction.spikependium, undefined); assert.equal(attack.getAttackData().data.weaponMagic, 1, "перенос действует и на реакции до следующего своего хода");
weapon.system.equipped = false; actor.reset(); assert.equal(actor.system.attributes.ac.value, 10); assert.equal(weapon.system.magicalBonus, 1, "снятие оружия убирает только КД");
weapon.system.equipped = true; actor.reset(); assert.equal(actor.system.attributes.ac.value, 11);
sourceAllocation.disabled = true; actor.reset(); assert.equal(weapon.system.magicalBonus, 2); assert.equal(actor.system.attributes.ac.value, 10);
sourceAllocation.disabled = false; actor.reset(); ownTurn(2); game.user = game.users[1]; assert.equal(sourceAllocation.isExpiryEvent("turnStart", { combat: game.combat, round: 2, turn: 0 }), true);
await refreshMaking(); assert.equal(actor.effects.length, 0); assert.equal(weapon.system.magicalBonus, 2); assert.equal(actor.system.attributes.ac.value, 10);
for (const bonus of [1, 2, 3]) for (let amount = 0; amount <= bonus; amount++) {
  setup(); await enchant(paid(), bonus); ownTurn(); const r = configured(amount); await consumeMakingAttack(evaluate, r.rolls, r.config);
  assert.equal(weapon.system.magicalBonus, bonus - amount); assert.equal(actor.system.attributes.ac.value, 10 + amount);
  assert.equal(damage().data.magicalBonus ?? 0, bonus - amount); assert.equal(weapon.system.properties.has("mgc"), true);
  assert.equal(actor.effects.length, amount > 0 ? 1 : 0);
  const again = configured.bind(null, 0); assert.throws(again, "даже выбор нуля расходует первую атаку своего хода");
}
setup(); await enchant(paid()); ownTurn(); weapon.otherBonus = 5; weapon.reset(); const stacked = configured(2); await consumeMakingAttack(evaluate, stacked.rolls, stacked.config);
assert.equal(weapon.system.magicalBonus, 5); assert.equal(stacked.rolls[0].data.weaponMagic, 5, "перенос меняет только исходное зачарование и сохраняет другие улучшения");
setup(); await enchant(paid()); ownTurn(); const preview = configured(2); await consumeMakingAttack(evaluate, preview.rolls, { ...preview.config, evaluate: false });
assert.equal(actor.effects.length, 0); assert.equal(actor.flags.spikependium.makingAttacks, undefined); assert.equal(weapon.system.magicalBonus, 2);
setup(); await enchant(paid()); ownTurn(); const cancelled = configured(1); await consumeMakingAttack(async () => {}, cancelled.rolls, cancelled.config);
assert.equal(actor.effects.length, 0); assert.equal(actor.flags.spikependium.makingAttacks[actor.flags.spikependium.makingGeneration], null);
for (const failure of ["flag", "create", "evaluate"]) {
  setup(); await enchant(paid()); ownTurn(); const r = configured(1); fail = failure;
  await consumeMakingAttack(failure === "evaluate" ? async () => { throw Error("dice failed"); } : evaluate, r.rolls, r.config);
  assert.equal(r.rolls.length, 0, failure); assert.equal(actor.effects.length, 0); assert.equal(weapon.system.magicalBonus, 2);
  assert.notEqual(configured(1).config.spikependium.makingCast, undefined, "не выполненная атака не расходует первую атаку");
}
for (const changed of ["turn", "enchantment", "stats"]) {
  setup(); await enchant(paid()); ownTurn(); const r = configured(1);
  if (changed === "turn") ownTurn(2); if (changed === "enchantment") weapon.effects[0].disabled = true;
  if (changed === "stats") { weapon.otherBonus = 5; weapon.reset(); }
  await consumeMakingAttack(evaluate, r.rolls, r.config); assert.equal(r.rolls.length, 0); assert.equal(actor.effects.length, 0);
}
setup(); await enchant(paid()); ownTurn(); const a = configured(1), b = configured(2); let release;
const waiting = new Promise(r => { release = r; }); duringWrite = () => waiting;
const running = consumeMakingAttack(evaluate, a.rolls, a.config); await Promise.resolve();
await consumeMakingAttack(evaluate, b.rolls, b.config); assert.equal(b.rolls.length, 0); release(); await running; assert.equal(actor.effects.length, 1);
setup(); await enchant(paid()); ownTurn(); const movedTurn = configured(1); duringWrite = () => ownTurn(2);
await consumeMakingAttack(evaluate, movedTurn.rolls, movedTurn.config); assert.equal(movedTurn.rolls.length, 0); assert.equal(actor.effects.length, 0);
setup(); await enchant(paid()); const outside = configured(1, true); await consumeMakingAttack(evaluate, outside.rolls, outside.config);
assert.equal(actor.system.attributes.ac.value, 11); game.time.worldTime++;
assert.equal(actor.effects[0].isExpiryEvent("updateWorldTime", {}), true); game.user = game.users[1]; await refreshMaking(); assert.equal(actor.effects.length, 0);
setup(); await enchant(paid()); const noConfirmation = configured(1); await consumeMakingAttack(evaluate, noConfirmation.rolls, noConfirmation.config); assert.equal(noConfirmation.rolls.length, 0);
setup(); await enchant(paid()); const outsideZero = configured(0); await consumeMakingAttack(evaluate, outsideZero.rolls, outsideZero.config); assert.equal(outsideZero.rolls[0]._evaluated, true);
assert.equal(actor.flags.spikependium.makingAttacks, undefined);
setup(); const firstMessage = paid(); await enchant(firstMessage); ownTurn(); const allocated = configured(2); await consumeMakingAttack(evaluate, allocated.rolls, allocated.config);
uses.uses.spent = 0; const nextMessage = paid(false); assert.equal(makingSuppression.call(weapon.effects[0], () => false), true);
game.user = game.users[1]; await refreshMaking(); assert.equal(actor.effects.length, 0); assert.equal(weapon.effects.length, 0); assert.equal(await enchant(firstMessage), null);
const normal = await enchant(nextMessage, 3); assert.equal(normal.flags.spikependium.magicWeapon.improved, false); assert.equal(weapon.system.magicalBonus, 3);
const normalConfig = { subject: attack }; prepareMakingAttack(normalConfig, {}); assert.equal(normalConfig.spikependium, undefined);
setup(); const paidMessage = paid(); paidMessage.system.deltas = {}; assert.equal(await enchant(paidMessage), null, "возвращённый ресурс не выдаёт улучшение");
setup(); const delayed = paid(); game.time.worldTime += 300; const old = await enchant(delayed); assert.equal(old.start.time, 100); assert.equal(old.duration.value, 3600, "позднее зачарование не начинает новый час");
setup(); const expiredCast = paid(); game.time.worldTime += 3600; assert.equal(await enchant(expiredCast), null, "истёкшее накладывание не зачаровывает оружие");
setup(); const dispelledCard = paid(); const dispelled = await enchant(dispelledCard); await dispelled.delete();
assert.equal(await enchant(dispelledCard), null, "удаление зачарования не позволяет выдавать его снова старой карточкой");
setup(); const failedEnchantCard = paid(); fail = "flag"; assert.equal(await enchant(failedEnchantCard), null);
assert.notEqual(await enchant(failedEnchantCard), null, "ошибка до создания зачарования позволяет повторить без второго расхода");
setup(); const slotUpdates = await prepareResourceUpdates.call(spellActivity, async () => ({ actor: { "system.spells.spell2.value": 1 },
  item: [{ _id: feat.id, "flags.test": true }] }), { spikependium: { improvedMaking: true } });
assert.equal(slotUpdates.actor["system.spells.spell2.value"], 1); assert.equal(slotUpdates.item.length, 1);
assert.equal(slotUpdates.item[0]["flags.test"], true); assert.equal(slotUpdates.item[0][`system.activities.${MOD}.uses.spent`], 1);
setup(); await enchant(paid()); ownTurn(); const hold = configured(1); await consumeMakingAttack(evaluate, hold.rolls, hold.config);
actor.items = list([feat]); weapon.actor = { uuid: "Actor.friend", statuses: new Set() }; actor.reset(); weapon.reset(); assert.equal(actor.system.attributes.ac.value, 10);
assert.equal(weapon.system.magicalBonus, 1, "переданное оружие сохраняет уменьшенный бонус до следующего хода заклинателя");
actor.items.push(weapon); weapon.actor = actor; actor.reset(); assert.equal(actor.system.attributes.ac.value, 11);
const actual = actor.effects[0]; actor.statuses.add("antimagic"); actual.system.magical = true;
assert.equal(makingArmorState(actor)[actual.flags.spikependium.makingAllocation.id], 0); actor.statuses.delete("antimagic");
const main = fs.readFileSync("scripts/spikependium.mjs", "utf8"), resourceSource = fs.readFileSync("scripts/resources.mjs", "utf8");
assert.ok(main.includes('"dnd5e.postBuildAttackRollConfig", buildMakingAttack'));
assert.ok(main.includes("consumeMakingAttack.call(this")); assert.ok(main.includes("data.spikependium.makingArmor = makingArmorState(this)"));
assert.ok(resourceSource.includes("prepareMakingUpdates(this, config, updates)"));
console.error = originalError;
console.log("Улучшенное создание: нативная оплата/зачарование +1/+2/+3, первая атака и формула до броска, уменьшение атаки/урона и КД, следующий ход/реакции/вне боя, удержание/передача/переключение, другие зачарования, отмена/ошибки/конкурентные окна, срок исходного накладывания и окончание при повторном Магическом оружии: OK.");
