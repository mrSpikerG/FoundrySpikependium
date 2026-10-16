import assert from "node:assert/strict";
import fs from "node:fs";
import { artifactCalculateDamage, mourningApplyDamage, recordPhoenixDrop, phoenixActorUpdate, prepareArtifactArmorUpdates, canUseArtifactArmor,
  preparePhoenixHealing, guardPhoenixHealing, finishArtifactArmorUse, recordPhoenixRoll, prepareMourningAttack, mourningAuraDamage, chooseMourningSave, cleanArtifactArmor, recoverArtifactPeriods } from "../scripts/griffon-artifact-armor.mjs";
import { prepareGriffonTwoUpdates, recordGriffonCooldown, canUseGriffonTwo, syncGriffonTwo } from "../scripts/griffon-two-items.mjs";
import { prepareGriffonTwoArmorUpdates } from "../scripts/griffon-two-armor.mjs";
import { nativeApplyDamage, nativeCalculateDamage } from "./data/dnd5e-guardian-native.mjs";
import { nativeUsesConsumption } from "./data/dnd5e-monsters-native.mjs";
const docs = new Map(); for (const f of fs.readdirSync("packs/_source/items")) { const d = JSON.parse(fs.readFileSync(`packs/_source/items/${f}`, "utf8")); if (d.flags?.spikependium?.key) docs.set(d.flags.spikependium.key, d); }
const raw = id => { const d = docs.get(`item:gs2:${id}`); assert.ok(d, id); return d; }, acts = d => Object.values(d.system.activities);
assert.equal([...docs.keys()].filter(k => k.startsWith("item:gs2:novanite-")).length, 8); assert.ok(!docs.has("item:gs2:novanite-hide"));
for (const id of ["phoenix-armor", "mourningsteel", "novanite-chainshirt", "novanite-plate"]) assert.equal(raw(id).system.armor.magicalBonus, 1);
for (const a of acts(raw("mourningsteel")).filter(a => a.type === "cast")) { assert.equal(a.uses.max, "1"); assert.equal(a.consumption.targets[0].type, "activityUses"); if (!a.flags.spikependium.griffonActivityCooldown) assert.equal(a.uses.recovery[0].period, "dusk"); }
const world = new Map(); let serial = 0, confirm = true, beforeConfirm, afterPhoenixUse, calculations = 0, drops = 0;
const list = a => Object.assign(a, { get(id) { return this.find(d => d.id === id); } });
const set = (obj, path, value) => { const keys = path.split("."), last = keys.pop(); for (const key of keys) obj = (Array.isArray(obj) ? obj.get?.(key) : undefined) ?? (obj[key] ??= {}); if (last.startsWith("-=")) delete obj[last.slice(2)]; else obj[last] = structuredClone(value); };
const apply = (obj, data) => { for (const [key, value] of Object.entries(data)) set(obj, key, value); };
Number.isNumeric ??= value => typeof value === "number" && Number.isFinite(value); Math.clamp ??= (v, min, max) => Math.min(max, Math.max(min, v));
globalThis.fromUuidSync = (uuid, options) => world.get(uuid?.startsWith(".") ? `${options?.relative.uuid}${uuid}` : uuid);
globalThis.game = { user: { id: "gm", isActiveGM: true }, users: { activeGM: {} }, time: { worldTime: 100 }, messages: list([]), actors: [], scenes: [], combat: null };
globalThis.ui = { notifications: { warn() {} } };
globalThis.foundry = { utils: { randomID: () => `nonce${++serial}`, deepClone: structuredClone }, applications: { api: { DialogV2: { async confirm() { await beforeConfirm?.(); return confirm; } } } } };
globalThis.ActiveEffect = { implementation: { getEffectStart: () => ({ time: game.time.worldTime }) } };
class Damage { constructor(total, type, dice = []) { this.total = total; this._evaluated = true; this.options = { type }; this.dice = dice; } toJSON() { return { total: this.total, options: this.options, dice: this.dice }; } }
globalThis.CONFIG = { Dice: { DamageRoll: Damage, BasicRoll: class { constructor(formula) { assert.equal(formula, "1d6+1"); } async evaluate() { this.total = 4; return this; } } }, DND5E: { healingTypes: { healing: {}, temphp: {} }, damageTypes: { fire: {}, necrotic: {}, radiant: {}, slashing: {}, force: {} } } };
globalThis.Hooks = { call(name, ...args) { if (name === "dnd5e.preCalculateDamage") return mourningAuraDamage(...args) !== false; if (name === "dnd5e.preApplyDamage") { drops++; recordPhoenixDrop(...args); return guardPhoenixHealing(...args) !== false; } return true; }, callAll() {} };
const scene = { grid: { units: "ft", getCenterPoint: p => p, measurePath: ([a, b]) => ({ distance: Math.abs(a.x - b.x) }) }, tokens: [] };
globalThis.canvas = { ready: true, scene, tokens: { placeables: [] } }; globalThis.dnd5e = { utils: { convertLength: value => value } };
function actor(id, type = "humanoid") {
 const a = { id, uuid: `Actor.${id}`, isOwner: true, documentName: "Actor", flags: { spikependium: {} }, statuses: new Set(), items: list([]), effects: list([]),
 system: { attributes: { hp: { value: 20, max: 50, effectiveMax: 50, temp: 0, tempmax: 0, damage: 30 } }, _source: { attributes: { hp: { tempmax: 0 } } }, traits: {}, details: { type: { value: type } } }, getRollData: () => ({}), changeIsIgnored: () => false };
 a.rawUpdate = async changes => { apply(a, changes); a.system.attributes.hp.damage = a.system.attributes.hp.max - a.system.attributes.hp.value; if (a.system.attributes.hp.value === 0) a.zeroWrites = (a.zeroWrites ?? 0) + 1; };
 a.update = (data, options) => phoenixActorUpdate.call(a, a.rawUpdate, data, options); a.setFlag = async (s, k, v) => a.update({ [`flags.${s}.${k}`]: v });
 a.calculateDamage = (damages, options) => artifactCalculateDamage.call(a, (...args) => { calculations++; return nativeCalculateDamage.call(a, ...args); }, damages, options);
 a.applyDamage = (damages, options) => mourningApplyDamage.call(a, (...args) => nativeApplyDamage.call(a, ...args), damages, options);
 a.changeHasEffect = (kind, damage, { options }) => { if (options.ignore === true || options.ignore?.[kind] === true || options.ignore?.[kind]?.has(damage.type) || options.ignore?.[kind]?.has("ALL")) return false; return kind === "immunity" ? !!a.immune : kind === "resistance" && !!a.resistant; };
 a.deleteEmbeddedDocuments = async (_type, ids) => { a.effects = list(a.effects.filter(e => !ids.includes(e.id))); };
 const token = { uuid: `Scene.test.Token.${id}`, actor: a, parent: scene, x: 0, getOccupiedGridSpaceOffsets() { return [{ x: this.x, y: 0 }]; } };
 a.getActiveTokens = () => [token]; a.token = token; world.set(token.uuid, token); world.set(a.uuid, a); game.actors.push(a); scene.tokens.push(token); return a;
}
function message(activity, data = {}) {
 const id = `message${++serial}`, m = { id, uuid: `ChatMessage.${id}`, author: game.user, type: "item", flags: {}, system: {}, rolls: [], whisper: [], ...data, getAssociatedActivity: () => activity, getAssociatedActor: () => activity?.actor, getOriginatingMessage: () => game.messages.get(m.system.origin) ?? m, async update(changes) { apply(this, changes); } };
 world.set(m.uuid, m); game.messages.push(m); return m;
}
function item(owner, id) {
 const d = structuredClone(raw(id)); d.id = `${d._id}${++serial}`; d.uuid = `${owner.uuid}.Item.${d.id}`; d.actor = owner; d.system.equipped = true; d.system.attuned = true;
 d.effects = list(d.effects.map(e => ({ ...e, id: e._id })));
 d.system.activities = list(acts(d).map(a => ({ ...a, id: a._id, actor: owner, item: d, uuid: `${d.uuid}.Activity.${a._id}` })));
 d.refresh = () => { d.system.uses.value = Math.max(0, Number(d.system.uses.max || 0) - d.system.uses.spent); for (const a of d.system.activities) a.uses.value = Math.max(0, Number(a.uses.max || 0) - a.uses.spent); };
 d.update = async data => { if (d.fail) { d.fail = false; throw Error("failed item write"); } apply(d, data); d.refresh(); }; d.setFlag = (s, k, v) => d.update({ [`flags.${s}.${k}`]: v }); d.refresh();
 owner.items.push(d); world.set(d.uuid, d); for (const a of d.system.activities) {
 world.set(a.uuid, a);
 a.use = async (config = {}, _dialog = {}, msg = {}) => {
  const data = { data: { system: {}, ...msg.data } }; if (canUseGriffonTwo(a) === false || canUseArtifactArmor(a, config, {}, data) === false || a.cancel) return;
  const update = { actor: {}, item: [], activity: {}, rolls: [] }, own = a.flags.spikependium?.griffonArmorActivityPaid, uses = own ? a.uses : d.system.uses;
  const cost = await nativeUsesConsumption.call({ resolveCost: async () => ({ total: 1 }) }, config, { uses, rolls: [], delta: {}, type: "charge" });
  if (own) update.activity["uses.spent"] = cost.spent; else update.item.push({ _id: d.id, "system.uses.spent": cost.spent });
  assert.equal(await prepareGriffonTwoUpdates(a, config, update), update); assert.equal(prepareGriffonTwoArmorUpdates(a, config, update), update); assert.equal(prepareArtifactArmorUpdates(a, config, update), update);
  for (const i of update.item) await d.update(i);
  if (update.activity["uses.spent"] !== undefined) await d.update({ [`system.activities.${a.id}.uses.spent`]: update.activity["uses.spent"] });
  if (Object.keys(update.actor).length) await owner.update(update.actor);
  recordGriffonCooldown(a, config, data); const m = message(a, data.data);
  await finishArtifactArmorUse(a, config, { message: m }); if (a.flags.spikependium?.phoenixBurst) await afterPhoenixUse?.(owner); return { message: m };
 };
 } return d;
}
const hero = actor("hero"), phoenix = item(hero, "phoenix-armor"), burst = phoenix.system.activities[0], healing = phoenix.system.activities[1];
assert.equal(canUseArtifactArmor(burst, {}, {}, {}), false); assert.equal(prepareArtifactArmorUpdates(burst, {}, { actor: {} }), false);
assert.equal(canUseArtifactArmor({ ...burst, actor: undefined }, {}, {}, {}), false, "unowned compendium activity is rejected safely");
await hero.applyDamage([{ type: "fire", value: 25 }]); assert.equal(hero.system.attributes.hp.value, 1); assert.equal(hero.zeroWrites ?? 0, 0, "native update must never publish 0 before survival"); assert.equal(phoenix.system.uses.spent, 1);
const cooldown = Object.values(phoenix.flags.spikependium.griffonCooldowns)[0]; assert.equal(cooldown.until, 100 + 4 * 86400); assert.ok(hero.flags.spikependium.phoenixBurst);
const usage = world.get(hero.flags.spikependium.phoenixBurst.usage), fire = message(burst, { type: "damage", system: { origin: usage.id }, rolls: [new Damage(18, "fire", [{ faces: 10, number: 3 }])], whisper: ["gm"], blind: true });
await recordPhoenixRoll(fire); const hconfig = { data: {} }; assert.notEqual(canUseArtifactArmor(healing, {}, {}, hconfig), false); assert.deepEqual(hconfig.data.whisper, ["gm"]); assert.equal(hconfig.data.blind, true);
const huse = message(healing, hconfig.data), rollConfig = { subject: healing, rolls: [{ parts: ["0"], options: {} }] }; preparePhoenixHealing(rollConfig, {}, { data: { system: { origin: huse.id } } }); assert.deepEqual(rollConfig.rolls[0].parts, ["18"]);
const hcard = message(healing, { type: "damage", system: { origin: huse.id, isHealing: true }, rolls: [new Damage(18, "healing")] });
const ally = actor("ally"); await ally.applyDamage([{ type: "healing", value: 18 }], { originatingMessage: hcard }); assert.equal(ally.system.attributes.hp.value, 38); await ally.applyDamage([{ type: "healing", value: 18 }], { originatingMessage: hcard }); assert.equal(ally.system.attributes.hp.value, 38, "same burst heals each recipient once");
fire.rolls[0].total = 19; assert.equal(canUseArtifactArmor(healing, {}, {}, { data: {} }), false); fire.rolls[0].total = 18;
const receipt = Object.keys(phoenix.flags.spikependium.griffonCooldowns)[0]; phoenix.flags.spikependium.griffonCooldowns[receipt].paid = 0; assert.equal(canUseArtifactArmor(healing, {}, {}, { data: {} }), false, "undoing payment invalidates healing"); phoenix.flags.spikependium.griffonCooldowns[receipt].paid = 1;
game.time.worldTime = cooldown.until - 1; await syncGriffonTwo(); assert.equal(phoenix.system.uses.spent, 1); game.time.worldTime++; await syncGriffonTwo(); assert.equal(phoenix.system.uses.spent, 0);
await hero.rawUpdate({ "system.attributes.hp.value": 20 }); confirm = false; await hero.applyDamage([{ type: "fire", value: 25 }]); assert.equal(hero.system.attributes.hp.value, 0); assert.equal(phoenix.system.uses.spent, 0); confirm = true;
await hero.rawUpdate({ "system.attributes.hp.value": 20 }); await hero.applyDamage([{ type: "fire", value: 70 }]); assert.equal(hero.system.attributes.hp.value, 0); assert.equal(phoenix.system.uses.spent, 0, "instant massive death does not offer survival");
hero.system.attributes.hp.effectiveMax = 30; await hero.rawUpdate({ "system.attributes.hp.value": 20 }); await hero.applyDamage([{ type: "fire", value: 50 }]); assert.equal(hero.system.attributes.hp.value, 0); assert.equal(phoenix.system.uses.spent, 0, "massive death uses the reduced effective HP maximum"); hero.system.attributes.hp.effectiveMax = 50;
await hero.rawUpdate({ "system.attributes.hp.value": 20 }); beforeConfirm = async () => hero.rawUpdate({ "system.attributes.hp.value": 30 }); await hero.applyDamage([{ type: "fire", value: 25 }]); assert.equal(hero.system.attributes.hp.value, 30, "stale survival dialog cannot overwrite a new HP update"); beforeConfirm = null;
await hero.rawUpdate({ "system.attributes.hp.value": 20 }); afterPhoenixUse = a => a.rawUpdate({ "system.attributes.hp.value": 7 }); await hero.applyDamage([{ type: "fire", value: 25 }]); assert.equal(hero.system.attributes.hp.value, 7, "later legitimate healing survives final source flags update"); afterPhoenixUse = null;
const wearer = actor("mourner"), steel = item(wearer, "mourningsteel"), transfer = steel.system.activities.find(a => a.flags.spikependium.mourningTransfer), lore = steel.system.activities.find(a => a.flags.spikependium.griffonActivityCooldown);
assert.equal(canUseArtifactArmor(transfer, {}, {}, {}), false);
await wearer.applyDamage([{ type: "necrotic", value: 12 }, { type: "slashing", value: 8 }]); assert.equal(wearer.system.attributes.hp.value, 18); assert.equal(wearer.system.attributes.hp.temp, 0); assert.equal(transfer.uses.spent, 1, "other damage is recalculated after granting 6 temporary HP");
await wearer.rawUpdate({ "system.attributes.hp.value": 20, "system.attributes.hp.temp": 0 }); await wearer.applyDamage([{ type: "necrotic", value: 4 }]); assert.equal(wearer.system.attributes.hp.value, 16, "second event has no free transfer");
transfer.uses.spent = 0; steel.refresh(); confirm = false; calculations = 0; await wearer.applyDamage([{ type: "necrotic", value: 4 }]); assert.equal(calculations, 1, "declining reuses the one native calculation"); assert.equal(transfer.uses.spent, 0); confirm = true;
const loreResult = await lore.use({}); assert.ok(loreResult.message); assert.equal(lore.uses.spent, 1); assert.equal(canUseGriffonTwo(lore), false); assert.equal(canUseGriffonTwo(steel.system.activities.find(a => a.type === "cast" && a !== lore)), undefined);
game.time.worldTime += 604799; await syncGriffonTwo(); assert.equal(lore.uses.spent, 1); game.time.worldTime++; await syncGriffonTwo(); assert.equal(lore.uses.spent, 0);
const nested = { actor: {}, item: [{ _id: steel.id, [`system.activities.${lore.id}`]: { uses: { spent: 1 } } }], activity: {}, rolls: [] };
const cachedSpell = { item: { flags: {} }, actor: wearer, flags: {}, getLinkedActivity: () => lore }; assert.equal(await prepareGriffonTwoUpdates(cachedSpell, {}, nested), nested);
const nova = item(wearer, "novanite-plate"), depart = nova.system.activities[0], arrive = nova.system.activities[1];
game.combat = { id: "combat", started: true, round: 1, turn: 0, combatant: { actor: wearer } }; await depart.use({}); assert.equal(canUseArtifactArmor(arrive, {}, {}, {}), false); game.combat.round = 2; assert.notEqual(canUseArtifactArmor(arrive, {}, {}, {}), false); game.combat = null;
const auraActivity = steel.system.activities.find(a => a.type === "transform"), aura = { id: "aura", uuid: `${wearer.uuid}.ActiveEffect.aura`, active: true, flags: { spikependium: { mourningAura: true } }, duration: { expired: false }, system: { origin: { activity: auraActivity.uuid, message: "ChatMessage.aura-one" } }, parent: wearer, async update(changes) { apply(this, changes); } };
wearer.effects.push(aura); const celestial = actor("celestial", "celestial"), enemyActivity = { actor: celestial };
assert.equal(canUseArtifactArmor(auraActivity, {}, {}, {}), false, "an active aura cannot be activated again");
const auraRecoveryPath = `system.activities.${auraActivity.id}.uses`, loreRecoveryPath = `system.activities.${lore.id}.uses`;
const recovery = async () => ({ updates: { [auraRecoveryPath]: { spent: 0 }, [loreRecoveryPath]: { spent: 0 } }, rolls: [] });
assert.equal((await recoverArtifactPeriods.call({ parent: steel }, recovery, new Map([["dusk", 1]]))).updates[auraRecoveryPath], undefined, "dusk while aura is active does not restore it");
assert.ok((await recoverArtifactPeriods.call({ parent: steel }, recovery, new Map([["dusk", 1], ["lr", 1]]))).updates[auraRecoveryPath], "elapsed rest outlasts the minute-long aura");
aura.start = { time: game.time.worldTime - 60 }; aura.duration = { value: 60, units: "seconds", expired: false };
assert.ok((await recoverArtifactPeriods.call({ parent: steel }, recovery, new Map([["dusk", 1]]))).updates[auraRecoveryPath], "expired aura does not block later dusk even before native expiry refresh");
aura.start.time = game.time.worldTime;
const attackConfig = { subject: enemyActivity, rolls: [{ options: { advantageMode: 1 } }] }; prepareMourningAttack(attackConfig, {}, { data: { system: { targets: [{ actor: wearer.uuid }] } } }); assert.equal(attackConfig.rolls[0].options.advantageMode, 0);
const auraDamage = steel.system.activities.find(a => a.flags.spikependium.mourningAuraDamage), auraCard = message(auraDamage, { type: "damage" }); celestial.immune = true; celestial.resistant = true;
await celestial.applyDamage([{ type: "necrotic", value: 6 }], { originatingMessage: auraCard }); assert.equal(celestial.system.attributes.hp.value, 14, "aura bypasses both immunity and resistance only for its damage");
const normal = actor("normal"); await normal.applyDamage([{ type: "necrotic", value: 6 }], { originatingMessage: auraCard }); assert.equal(normal.system.attributes.hp.value, 20, "aura cannot damage non-celestials");
celestial.token.x = 10; await celestial.applyDamage([{ type: "necrotic", value: 6 }], { originatingMessage: auraCard }); assert.equal(celestial.system.attributes.hp.value, 14, "range is checked"); celestial.token.x = 0;
const sourceMessage = message(enemyActivity), save = () => message({ actor: wearer }, { type: "save", system: { origin: sourceMessage.id }, rolls: [{ isFailure: true }] });
const firstSave = save(); await chooseMourningSave(firstSave); assert.equal(firstSave.system.resisted, true); const secondSave = save(); await chooseMourningSave(secondSave); assert.equal(secondSave.system.resisted, undefined);
aura.system.origin.message = "ChatMessage.aura-two"; const newSave = save(); await chooseMourningSave(newSave); assert.equal(newSave.system.resisted, true, "reapplied native profile has a fresh per-aura save");
wearer.statuses.add("unconscious"); await cleanArtifactArmor(); assert.equal(wearer.effects.length, 0);
console.log("Artifact GS2 armor: 10 variants, native charges/independent activity clocks, Phoenix pre-zero survival/instant death/cancel/stale state/one shared roll/paid one-time healing, native mixed necrotic replacement, next-turn arrival, celestial aura scope/bypasses/per-use save passed.");
