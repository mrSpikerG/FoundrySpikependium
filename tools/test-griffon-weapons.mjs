import assert from "node:assert/strict";
import fs from "node:fs";
import { canUseGriffonWeapon, finishGriffonWeaponUse, griffonAmmoAttackConfig, griffonWeaponAttack, cleanGriffonWeapons,
  griffonWeaponDamage, griffonWeaponDamageParts, griffonAmmoDamagePart, prepareRunicConcentration, guardHealingAmmunition, applyGriffonAmmoHits,
  recordBloodDrain, applyBloodDrain } from "../scripts/griffon-weapons.mjs";
import { nativeAmmoRollAttack, nativeAmmoBuildConfig, nativeAmmoDamageParts, nativeAmmoBaseDamagePart, setNativeAmmoContext } from "./data/dnd5e-griffon-weapons-native.mjs";
import { getAttackData, constructParts, processDamagePart, setModificationField } from "./data/dnd5e-making-native.mjs";
import { nativeUsesConsumption } from "./data/dnd5e-monsters-native.mjs";
const raw = new Map(), folders = new Map();
for (const file of fs.readdirSync("packs/_source/items")) {
  const d = JSON.parse(fs.readFileSync(`packs/_source/items/${file}`, "utf8"));
  if (d._key.startsWith("!folders!")) folders.set(d._id, d); else raw.set(d.flags.spikependium.key, d);
}
const get = id => { const d = raw.get(`item:gs1:${id}`); assert.ok(d, id); return d; };
const evidence = JSON.parse(fs.readFileSync("tools/data/griffon-weapons.json", "utf8"));
assert.equal(evidence.entries.length, 12); assert.equal(evidence.entries.flatMap(r => r.variants).length, 35);
for (const row of evidence.entries) for (const key of row.variants) {
  const d = raw.get(key); assert.ok(d, key); assert.equal(d.system.source.custom, row.url); assert.equal(d.system.source.rules, "2024");
  assert.equal(d.system.source.page, ""); assert.equal(d.system.rarity, row.rarity);
  assert.ok(/[а-яё]/i.test(d.name)); assert.ok(d.system.price.value > 0 && d.system.weight.value > 0);
  assert.ok(!d.system.description.value.includes("шаблон зачарования"));
  let parent = d.folder, found = false; while (parent) { const f = folders.get(parent); assert.ok(f); found ||= f.name === "Сумка грифона — книга 1"; parent = f.folder; } assert.ok(found);
  for (const a of Object.values(d.system.activities)) { assert.equal(a.consumption.spellSlot, false); for (const e of a.effects) assert.ok(d.effects.some(p => p._id === e._id)); }
  if (d.type === "weapon") { assert.equal(d.system.type.baseItem, "dagger"); assert.equal(d.system.damage.base.number, 1); assert.equal(d.system.damage.base.denomination, 4); assert.equal(d.system.weight.value, 1); assert.equal(d.system.range.long, 60); assert.ok(d.system.properties.includes("fin")); assert.ok(d.system.properties.includes("lgt")); assert.ok(d.system.properties.includes("thr")); }
  else { assert.equal(d.system.type.value, "ammo"); assert.equal(d.system.quantity, 1); assert.equal(d.system.uses.max, ""); }
}
assert.deepEqual(get("frozen-dagger").system.damage.base.types, ["cold"]);
assert.equal(get("basilisk-dagger").effects[0].duration.expiry, "sourceEnd");
assert.equal(get("spiderbite-left").effects[0].duration.expiry, "targetEnd");
assert.notEqual(get("spiderbite-left")._id, get("spiderbite-right")._id);
assert.equal(Object.values(get("fanfare-arrow").system.activities)[0].check.associated[0], "inv");
const blood = get("bloodmage-dagger"); assert.equal(blood.system.uses.max, "5"); assert.deepEqual(blood.system.uses.recovery, [{ period: "dusk", type: "formula", formula: "1d3 + 2" }]);
assert.deepEqual(Object.values(blood.system.activities).filter(a => a.flags?.spikependium?.griffonBloodDrain).map(a => a.attack.ability), ["int", "wis", "cha"]);
const cost = await nativeUsesConsumption.call({ resolveCost: async () => ({ total: 1 }) }, {}, { uses: { ...blood.system.uses, max: 5, value: 5 }, type: "charge", rolls: [], delta: {} }); assert.equal(cost.spent, 1);

const world = new Map(); let next = 0, cancel = false;
const merge = (base, update) => { const out = { ...base }; for (const [k, v] of Object.entries(update ?? {})) out[k] = v && Object.getPrototypeOf(v) === Object.prototype && out[k] && Object.getPrototypeOf(out[k]) === Object.prototype ? merge(out[k], v) : v; return out; };
function set(obj, path, value) { const keys = path.split("."), last = keys.pop(); let node = obj; for (const key of keys) node = node[key] ??= {}; if (last.startsWith("-=")) delete node[last.slice(2)]; else node[last] = value; }
function apply(obj, changes) { for (const [path, value] of Object.entries(changes)) set(obj, path, value); }
const list = () => Object.assign([], { get(id) { return this.find(i => i.id === id); }, has(id) { return this.some(i => i.id === id); } });
globalThis.fromUuidSync = uuid => world.get(uuid);
globalThis.foundry = { utils: { mergeObject: merge, setProperty: set, deepClone: structuredClone, getProperty: (o, path) => path.split(".").reduce((v, k) => v?.[k], o), isEmpty: x => Object.keys(x).length === 0 } };
globalThis.window = { innerWidth: 1000 }; globalThis.ui = { notifications: { warn() {} } };
globalThis.game = { time: { worldTime: 100 }, user: { id: "user", isActiveGM: true, targets: new Set() }, users: { activeGM: null }, actors: [], scenes: [], messages: new Map(), combat: null };
globalThis.ChatMessage = { getSpeaker: () => ({}) };
globalThis.Hooks = { callAll() {} };
globalThis.ActiveEffect = { implementation: { getEffectStart: () => ({ time: game.time.worldTime }) } };
globalThis.Roll = class { constructor(formula) { this.isDeterministic = !/d\d/.test(formula); } };
class Part {
  constructor(data) { Object.assign(this, data); this.types = new Set(data.types ?? []); this.types.first = () => [...this.types][0]; }
  clone(changes = {}) { return new Part({ ...this, ...changes, types: changes.types ?? [...this.types] }); }
  get formula() { return this.custom?.enabled ? this.custom.formula : this.number && this.denomination ? `${this.number}d${this.denomination}${this.bonus ? ` + ${this.bonus}` : ""}` : ""; }
  scaledFormula() { return this.formula; }
}
class D20 {
  constructor(options) { this.options = options; this.total = 24; this._evaluated = true; this.isCritical = false; this.isFumble = false; }
  toJSON() { return { total: this.total, options: this.options }; }
  static mergeConfigs(a, b) { return merge(a, b); }
  static mergeOptions(a, b) { return merge(a, b); }
  static async buildConfigure(config, dialog) { if (cancel) return []; return config.rolls.map((r, i) => { dialog.options.buildConfig(config, r, undefined, i); return new D20(r.options); }); }
  static async buildEvaluate() {}
  static async buildPost(rolls, config, message) {
    const activity = config.subject, ammoId = rolls[0].options.ammunition, ammo = activity.actor.items.get(ammoId);
    const id = `msg${++next}`, msg = { id, uuid: `ChatMessage.${id}`, type: "attack", rolls, flags: {}, author: game.user,
      system: { ...message.data.system }, getAssociatedActivity: () => activity, async update(changes) { apply(this, changes); },
      async setFlag(scope, key, value) { set(this, `flags.${scope}.${key}`, value); } };
    Object.defineProperty(msg.system, "ammunitionItem", { get: () => activity.actor.items.get(ammoId) ?? ammo });
    game.messages.set(id, msg); world.set(msg.uuid, msg); latest = msg;
  }
}
let latest;
globalThis.CONFIG = { Dice: { D20Roll: D20, BasicRoll: { constructParts } }, DND5E: { characterFlags: {}, healingTypes: { healing: {}, temphp: {} } } };
globalThis.dnd5e = { registry: { messages: { get: () => [latest] } } };
const modification = { combineFields: () => ({}) }; setModificationField(modification);
setNativeAmmoContext({ TargetsField: { getDescriptors: () => [...game.user.targets].map(t => ({ token: t.document.uuid, actor: t.actor.uuid, ac: 10 })) }, D20RollModificationField: modification, AttackRollConfigurationDialog: class {}, _loc: v => v });
function actor(id, type = "humanoid") {
  const a = { id, uuid: `Actor.${id}`, isOwner: true, flags: { spikependium: {} }, items: list(), effects: [], statuses: new Set(),
    system: { attributes: { prof: 3, hp: { value: 10, max: 30, temp: 0 } }, details: { type: { value: type } } },
    getRollData: () => ({ mod: 3, abilities: { dex: { mod: 3 }, wis: { mod: 2 } }, roll: { ability: "dex" } }),
    addConditionRollReduction() {}, getFlag() {}, getActiveTokens: () => [],
    async setFlag(scope, key, value) { set(this, `flags.${scope}.${key}`, value); },
    async updateEmbeddedDocuments(_type, data) { for (const d of data) await this.items.get(d._id).update(d); },
    async deleteEmbeddedDocuments(_type, ids) { for (const id of ids) this.items.splice(this.items.findIndex(i => i.id === id), 1); },
    async createEmbeddedDocuments(type, data) { assert.equal(type, "ActiveEffect"); this.effects.push(...data); },
    async applyDamage(damages) { for (const d of damages) { assert.equal(d.type, "healing"); this.system.attributes.hp.value = Math.min(30, this.system.attributes.hp.value + d.value); } } };
  game.actors.push(a); world.set(a.uuid, a); return a;
}
function item(data, owner) {
  const raw = structuredClone(data), i = { ...raw, id: `item${++next}`, actor: owner, isOwner: true, inCompendium: false };
  i.uuid = `${owner.uuid}.Item.${i.id}`; i.system.properties = new Set(i.system.properties); i.system.magicAvailable = true;
  i.system.damage.base = new Part(i.system.damage.base); i.system.equipped = true; i.system.attuned = true;
  i.system.prof = { term: 3 }; i.system.isVersatile = false;
  i.effects = raw.effects.map(e => ({ ...e, uuid: `${i.uuid}.ActiveEffect.${e._id}`, toObject: () => structuredClone(e) }));
  i.getFlag = (scope, path) => path.split(".").reduce((o, k) => o?.[k], i.flags[scope]);
  i.setFlag = async (scope, key, value) => set(i, `flags.${scope}.${key}`, value);
  i.update = async changes => apply(i, changes); i.toObject = () => ({ ...raw, system: { ...raw.system, quantity: i.system.quantity } });
  owner.items.push(i); world.set(i.uuid, i); return i;
}
function bow(owner) {
  const i = item({ ...get("frozen-dagger"), flags: {}, system: { ...get("frozen-dagger").system, magicalBonus: 2, damage: { base: { number: 1, denomination: 8, types: ["piercing"], custom: { enabled: false } } } } }, owner);
  const a = { uuid: `${i.uuid}.Activity.attack`, id: "attack", item: i, actor: owner, criticalThreshold: 20, attack: { bonus: "", type: { classification: "weapon" } },
    getRollData: owner.getRollData, _getAbilityOptions: () => [{ value: "dex" }], getActionType: () => "rwak", messageSources: {},
    _buildAttackConfig(...args) { return griffonAmmoAttackConfig.call(this, (...next) => nativeAmmoBuildConfig.call(this, ...next), ...args); },
    getAttackData(...args) { return getAttackData.call(this, ...args); } };
  world.set(a.uuid, a); i.system.ammunitionOptions = []; i.system.attackModes = []; i.system.masteryOptions = []; return a;
}
const owner = actor("owner"), target = actor("target"), undead = actor("undead", "undead");
const attack = bow(owner), basic = () => [new Part({ base: true, number: 1, denomination: 8, types: ["piercing"], custom: { enabled: false } }), new Part({ number: 1, denomination: 6, types: ["radiant"], custom: { enabled: false } })];
const parts = config => griffonWeaponDamageParts.call(attack, c => nativeAmmoDamageParts.call(attack, c, basic), config);
for (const id of ["void-ammo-arrow", "healing-ammo-arrow", "fanfare-arrow", "runic-ammo-arrow"]) {
  const ammo = item(get(id), owner); attack.item.system.ammunitionOptions = [{ value: ammo.id }];
  await griffonWeaponAttack.call(attack, (...args) => nativeAmmoRollAttack.call(attack, ...args), { ammunition: ammo.id }, { configure: false }, {});
  if (!ammo.system.uses.autoDestroy) assert.equal(ammo.system.quantity, 0, "native attack consumes exactly one selected ammunition");
  assert.equal(owner.items.includes(ammo), !ammo.system.uses.autoDestroy, "native autoDestroy matches source recovery policy");
  assert.equal(latest.system.ammunitionItem, ammo, "deleted ammunition remains available to its native message");
  const d = parts({ ammunition: ammo });
  if (id.startsWith("void")) { assert.ok(d[0].types.has("psychic")); assert.ok(d[1].types.has("radiant")); assert.ok(basic()[0].types.has("piercing")); }
  if (id.startsWith("healing")) { assert.equal(d.length, 1); assert.ok(d[0].types.has("healing")); assert.equal(d[0].base, false); assert.ok(d[0].formula.includes("max(1,")); }
  if (id.startsWith("fanfare")) assert.equal(d.length, 0);
}
const phoenix = item(get("phoenix-arrow"), owner); attack.item.system.ammunitionOptions = [{ value: phoenix.id }];
game.combat = { id: "combat", started: true, round: 1, turn: 0, combatant: { actor: owner } };
const ignite = { actor: owner, item: phoenix, flags: { spikependium: { griffonPhoenixIgnite: true } } };
assert.equal(canUseGriffonWeapon(ignite), undefined); await finishGriffonWeaponUse(ignite, { message: {} });
await griffonWeaponAttack.call(attack, (...args) => nativeAmmoRollAttack.call(attack, ...args), { ammunition: phoenix.id }, { configure: false }, {});
assert.equal(phoenix.system.quantity, 1, "ignited ammunition returns immediately after native consumption"); assert.equal(phoenix.flags.spikependium.phoenixIgnited, undefined);
const ignitionAttack = latest, snapshot = ignitionAttack.rolls[0].options.spikependiumGriffonAmmo;
assert.equal(snapshot.ignited, true); const flaming = parts({ ammunition: phoenix, spikependiumGriffonAmmo: snapshot }); assert.equal(flaming.length, 3); assert.ok(flaming[0].types.has("fire")); assert.equal(flaming[2].formula, "1d6");
assert.equal(parts({ ammunition: phoenix, spikependiumGriffonAmmo: { ...snapshot, rangeLost: true } }).length, 0);
await griffonWeaponAttack.call(attack, (...args) => nativeAmmoRollAttack.call(attack, ...args), { ammunition: phoenix.id }, { configure: false }, {});
assert.equal(phoenix.system.quantity, 0); assert.equal(canUseGriffonWeapon(ignite), false);
game.combat.turn = 1; game.combat.combatant.actor = target; await cleanGriffonWeapons(); assert.equal(phoenix.system.quantity, 0);
game.combat.round = 2; game.combat.turn = 0; game.combat.combatant.actor = owner; await cleanGriffonWeapons(); assert.equal(phoenix.system.quantity, 1);
cancel = true; await griffonWeaponAttack.call(attack, (...args) => nativeAmmoRollAttack.call(attack, ...args), { ammunition: phoenix.id }, {}, {}); cancel = false; assert.equal(phoenix.system.quantity, 1); assert.equal(phoenix.flags.spikependium.phoenixReturn, undefined);
game.combat = null; await griffonWeaponAttack.call(attack, (...args) => nativeAmmoRollAttack.call(attack, ...args), { ammunition: phoenix.id }, {}, {});
game.time.worldTime += 5; await cleanGriffonWeapons(); assert.equal(phoenix.system.quantity, 0); game.time.worldTime++; await cleanGriffonWeapons(); assert.equal(phoenix.system.quantity, 1);
phoenix.system.quantity = 3;
await griffonWeaponAttack.call(attack, (...args) => nativeAmmoRollAttack.call(attack, ...args), { ammunition: phoenix.id }, {}, {});
await griffonWeaponAttack.call(attack, (...args) => nativeAmmoRollAttack.call(attack, ...args), { ammunition: phoenix.id }, {}, {});
assert.equal(phoenix.system.quantity, 1); assert.equal(phoenix.flags.spikependium.phoenixReturn.count, 2);
await finishGriffonWeaponUse(ignite, { message: {} }); await griffonWeaponAttack.call(attack, (...args) => nativeAmmoRollAttack.call(attack, ...args), { ammunition: phoenix.id }, {}, {});
assert.equal(phoenix.system.quantity, 1); assert.equal(phoenix.flags.spikependium.phoenixReturn.count, 2, "immediate return preserves other outstanding projectiles");
game.time.worldTime += 6; await Promise.all([cleanGriffonWeapons(), cleanGriffonWeapons()]); assert.equal(phoenix.system.quantity, 3, "stacked projectiles all return once");
game.combat = { id: "ending", started: true, round: 1, turn: 0, combatant: { actor: owner } };
await griffonWeaponAttack.call(attack, (...args) => nativeAmmoRollAttack.call(attack, ...args), { ammunition: phoenix.id }, {}, {});
game.combat = null; game.time.worldTime += 6; await cleanGriffonWeapons(); assert.equal(phoenix.system.quantity, 3, "ending combat does not strand ammunition forever");
const saved = { message: ignitionAttack.uuid, signature: JSON.stringify(ignitionAttack.rolls.map(r => r.toJSON())) };
let damageConfig; await griffonWeaponDamage.call(attack, async c => { damageConfig = c; }, {}, {}, { data: { flags: { spikependium: { attackSource: saved } }, system: { targets: [] } } }); assert.equal(damageConfig.spikependiumGriffonAmmo.ignited, true);
ignitionAttack.rolls[0].total++; await griffonWeaponDamage.call(attack, async c => { damageConfig = c; }, {}, {}, { data: { flags: { spikependium: { attackSource: saved } } } }); assert.equal(damageConfig.spikependiumGriffonAmmo, undefined, "changed attack cannot reuse a saved ignition snapshot");
const healing = item(get("healing-ammo-arrow"), owner); await griffonWeaponDamage.call(attack, async c => { damageConfig = c; }, { ammunition: healing, isCritical: true }); assert.equal(damageConfig.isCritical, false);
const bloodItem = item(blood, owner), bloodActivity = { ...attack, item: bloodItem, flags: { spikependium: { griffonBloodDrain: true } } };
const bloodRoll = { options: {}, parts: ["@mod", "@prof", "@weaponMagic"], data: {} }; griffonAmmoAttackConfig.call(bloodActivity, () => {}, {}, bloodRoll); assert.deepEqual(bloodRoll.parts, ["@mod", "@spikependiumBloodProficiency"]); assert.equal(bloodRoll.data.spikependiumBloodProficiency, 3);
const purging = item(get("purging-dagger"), owner); const radiant = [new Part({ number: 1, denomination: 4, types: ["radiant"] })];
const purged = griffonWeaponDamageParts.call({ item: purging }, () => radiant, { spikependiumWeaponTargets: [{ actor: undead.uuid }] }); assert.equal(purged[0].number, 2); assert.equal(radiant[0].number, 1);
assert.equal(griffonWeaponDamageParts.call({ item: purging }, () => radiant, { spikependiumWeaponTargets: [{ actor: target.uuid }] })[0].number, 1);
const baseProcess = p => ({ parts: [p.formula], options: { type: [...p.types][0] }, data: { mod: 3 } });
const ordinaryDamage = processDamagePart.call(attack, basic()[0], { ammunition: { system: { magicAvailable: true, magicalBonus: 1 } } }, {}, 0, {}, baseProcess, value => value);
assert.ok(ordinaryDamage.parts.includes("@mod")); assert.ok(ordinaryDamage.parts.includes("@magicalBonus")); assert.ok(ordinaryDamage.parts.includes("@ammoBonus"));
const healingPart = parts({ ammunition: healing })[0]; assert.deepEqual(processDamagePart.call(attack, healingPart, { ammunition: healing }, {}, 0, {}, baseProcess, value => value).parts, [healingPart.formula], "healing does not inherit bow/modifier/ammunition damage bonuses");
owner.system.rolls = { damage: { rwak: { bonus: "5" } } }; attack.item.system.damage.bonus = "2";
const nativeBase = (...args) => nativeAmmoBaseDamagePart.call(attack, ...args);
assert.deepEqual(nativeBase(healingPart, {}, {}, 0).parts, [healingPart.formula, "5", "2"], "native base handler would otherwise add global weapon damage bonuses to healing");
assert.deepEqual(griffonAmmoDamagePart.call(attack, nativeBase, healingPart, { ammunition: healing }, {}, 0).parts, [healingPart.formula]);
const hit = { uuid: "Scene.test.Token.target", actor: target }; world.set(hit.uuid, hit);
const runicMessage = { id: "runic", uuid: "ChatMessage.runic", type: "attack", rolls: [new D20({ spikependiumGriffonAmmo: { kind: "runic-ammo" } })], flags: {}, system: { targets: [{ token: hit.uuid, actor: target.uuid, ac: 10 }] }, getAssociatedActivity: () => attack };
game.messages.set("runic", runicMessage); world.set(runicMessage.uuid, runicMessage);
const conc = { subject: target, isConcentration: true, rolls: [{ options: { advantage: true, advantageMode: 1 } }] };
prepareRunicConcentration(conc, {}, { data: { system: { origin: "runic" } } }); assert.equal(conc.rolls[0].options.disadvantage, true); assert.equal(conc.rolls[0].options.advantageMode, 0);
const otherSave = { subject: target, rolls: [{ options: {} }] }; prepareRunicConcentration(otherSave, {}, { data: { system: { origin: "runic" } } }); assert.equal(otherSave.rolls[0].options.disadvantage, undefined);
const healingMessage = { ...runicMessage, system: { targets: [], ammunitionItem: healing } }; assert.equal(guardHealingAmmunition(owner, -5, {}, { originatingMessage: healingMessage }), false); assert.equal(guardHealingAmmunition(target, -5, {}, { originatingMessage: healingMessage }), undefined);
const acid = item(get("acidlight-arrow"), owner), acidMessage = { ...runicMessage, id: "acid", uuid: "ChatMessage.acid", author: game.user, flags: {}, system: { ...runicMessage.system, ammunitionItem: acid }, async setFlag(scope, key, value) { set(this, `flags.${scope}.${key}`, value); } };
acidMessage.rolls[0].options.spikependiumWeaponContext = { time: game.time.worldTime, start: ActiveEffect.implementation.getEffectStart() };
await Promise.all([applyGriffonAmmoHits(acidMessage), applyGriffonAmmoHits(acidMessage)]); assert.equal(target.effects.length, 1); assert.equal(target.effects[0].duration.value, 60); assert.equal(target.effects[0].system.changes[0].key, "system.skills.ste.roll.mode"); await applyGriffonAmmoHits(acidMessage); assert.equal(target.effects.length, 1);
const origin = { id: "bloodUse", getAssociatedActivity: () => bloodActivity }, options = { originatingMessage: { getOriginatingMessage: () => origin } };
recordBloodDrain(target, 7, {}, options); await Promise.all([applyBloodDrain(target, 7, options), applyBloodDrain(target, 7, options)]); assert.equal(owner.system.attributes.hp.value, 17);
recordBloodDrain(target, 7, {}, options); await applyBloodDrain(target, 7, options); assert.equal(owner.system.attributes.hp.value, 17);
const undeadOptions = { originatingMessage: options.originatingMessage }; recordBloodDrain(undead, 8, {}, undeadOptions); await applyBloodDrain(undead, 8, undeadOptions); assert.equal(owner.system.attributes.hp.value, 17);
console.log("GS1 weapons: 12 sources/35 variants, folders/native bases, native shot consumption/deletion, healing/no-damage/type replacement, Phoenix timing/critical/source signatures, runic concentration, acid profiles, dagger bonuses/charges/blood healing passed.");
