import assert from "node:assert/strict";
import fs from "node:fs";
import { naturalWeaponTwenty, griffonHitFrame, griffonHitInfo, processGriffonWeaponHits, requestPurgingEmbed, recordWeaponBiteDamage, resumeGriffonWeaponHits } from "../scripts/griffon-hit-triggers.mjs";
import { griffonWeaponStartTurn, recordGriffonWeaponTick, resumeGriffonWeaponTicks, returnPurgingDaggers } from "../scripts/griffon-weapon-periodic.mjs";
import { canUseGriffonWeapon, griffonWeaponAttack, applyGriffonAmmoHits } from "../scripts/griffon-weapons.mjs";
import { prepareEffectData } from "./data/dnd5e-effect-application.mjs";
import { nativeApplyDamage, nativeCalculateDamage } from "./data/dnd5e-guardian-native.mjs";

const raw = new Map(fs.readdirSync("packs/_source/items").map(f => JSON.parse(fs.readFileSync(`packs/_source/items/${f}`, "utf8"))).filter(d => d.flags?.spikependium?.key).map(d => [d.flags.spikependium.key, d]));
const get = id => { const doc = raw.get(`item:gs1:${id}`); assert.ok(doc); return doc; };
const list = values => Object.assign(values, { get(id) { return this.find(d => d.id === id); }, has(id) { return this.some(d => d.id === id); } });
const set = (obj, path, value) => { const keys = path.split("."), last = keys.pop(); for (const key of keys) obj = obj[key] ??= {}; if (last.startsWith("-=")) delete obj[last.slice(2)]; else obj[last] = structuredClone(value); };
const merge = (a, b) => { for (const [key, value] of Object.entries(b)) { if (value && Object.getPrototypeOf(value) === Object.prototype) merge(a[key] ??= {}, value); else a[key] = structuredClone(value); } return a; };
const world = new Map(); let serial = 0, saveTotal = 8, saveCalls = 0, damageCalls = 0, damageTotal = 4;
globalThis.game = { user: { id: "gm", isGM: true, isActiveGM: true }, users: { activeGM: { id: "gm" } }, messages: list([]), actors: [], scenes: [], time: { worldTime: 0 }, combat: null };
globalThis.fromUuidSync = uuid => world.get(uuid);
globalThis.foundry = { utils: { deepClone: structuredClone, mergeObject: merge, getType: value => Array.isArray(value) ? "Array" : typeof value }, documents: {} };
globalThis.ui = { notifications: { warn() {} } }; globalThis.ChatMessage = { getSpeaker: ({ actor }) => ({ actor: actor.id }) };
Math.clamp ??= (n, min, max) => Math.min(max, Math.max(min, n)); Number.isNumeric ??= n => Number.isFinite(n);
globalThis.Hooks = { call(name, ...args) { if (name === "dnd5e.preApplyDamage") { const a = recordWeaponBiteDamage(...args), b = recordGriffonWeaponTick(...args); return a !== false && b !== false; } return true; }, callAll() {} };
class D20 {
  constructor(face, target = 10, total = face + 3) { this.total = total; this.options = { target }; this._evaluated = true; this.dice = [{ faces: 20, results: [{ result: face, active: true }] }]; this.isCritical = face >= 19; this.isFumble = face === 1; }
  get isFailure() { return this.total < this.options.target; }
  toJSON() { return { total: this.total, options: this.options, dice: this.dice }; }
}
class Damage {
  constructor(type, total) { this.options = { type }; this.total = total; this._evaluated = true; }
  static async build(config, dialog, message) {
    damageCalls++; assert.equal(config.subject, undefined, "periodic damage must not inherit attack-only bonuses"); assert.equal(config.isCritical, false);
    makeMessage({ ...message.data, rolls: [new Damage(config.rolls[0].options.type, damageTotal)] });
  }
}
globalThis.CONFIG = { Dice: { D20Roll: D20, DamageRoll: Damage }, DND5E: { healingTypes: { healing: {}, temphp: {} }, damageTypes: { acid: {}, poison: {}, radiant: {} } } };
class FX {
  constructor(data, parent) { Object.assign(this, structuredClone(data)); this.parent = parent; this.id = data._id; this.uuid = `${parent.uuid}.ActiveEffect.${this.id}`; this.statuses = new Set(data.statuses ?? []); this._stats ??= {}; world.set(this.uuid, this); }
  get active() { return !this.disabled && !this.duration.expired; }
  toObject() { const { _id, name, type, system, duration, flags, disabled, transfer, start, img, _stats } = this; return structuredClone({ _id, name, type, system, duration, flags, disabled, transfer, start, img, _stats, statuses: [...this.statuses] }); }
  async update(data) { for (const [k, v] of Object.entries(data)) set(this, k, v); }
  async setFlag(scope, key, value) { if (this.failPending && key === "weaponTickRequest" && !value.pending) { this.failPending = false; throw Error("simulated interrupted final marker"); } set(this, `flags.${scope}.${key}`, value); }
  async delete() { this.parent.effects.splice(this.parent.effects.indexOf(this), 1); world.delete(this.uuid); }
  static getEffectStart() { return { time: game.time.worldTime, ...(game.combat ? { combat: game.combat.uuid, round: game.combat.round, turn: game.combat.turn } : {}) }; }
}
globalThis.ActiveEffect = { implementation: { getEffectStart: FX.getEffectStart, forApplication: async changes => changes } };
globalThis.dnd5e = { applications: { components: { EffectApplicationElement: class { async _prepareEffectData(e, actor) { return prepareEffectData.call(this, e, actor, s => s); } } } } };
foundry.documents.modifyBatch = async ops => { for (const op of ops) if (op.action === "create") await op.parent.createEmbeddedDocuments(op.documentName, op.data); else await op.parent.updateEmbeddedDocuments(op.documentName, op.updates); };
function actor(id, type = "humanoid") {
  const a = { id, uuid: `Actor.${id}`, isOwner: true, effects: list([]), items: list([]), flags: { spikependium: {} }, statuses: new Set(),
    system: { attributes: { hp: { value: 100, max: 100, effectiveMax: 100, temp: 0, tempmax: 0, damage: 0 } }, details: { type: { value: type } }, traits: { size: "med", ci: { value: new Set() } }, _source: { attributes: { hp: { tempmax: 0 } } } },
    getRollData() { return this.system; },
    async update(data) { if (this.failUpdate) { this.failUpdate = false; throw Error("simulated interrupted actor update"); } for (const [k, v] of Object.entries(data)) set(this, k, v); this.system.attributes.hp.damage = 100 - this.system.attributes.hp.value; },
    async createEmbeddedDocuments(type, data) { assert.equal(type, "ActiveEffect"); const out = data.map(d => new FX({ ...d, _id: `fx${++serial}` }, this)); this.effects.push(...out); return out; },
    async updateEmbeddedDocuments(type, data) { assert.equal(type, "ActiveEffect"); for (const d of data) await this.effects.get(d._id).update(d); },
    changeHasEffect(kind, damage) { return kind === "resistance" && this.resist?.has(damage.type) || kind === "immunity" && this.immune?.has(damage.type); }, changeIsIgnored: () => false,
    calculateDamage(d, options) { return nativeCalculateDamage.call(this, d, options); }, applyDamage(d, options) { return nativeApplyDamage.call(this, d, options); },
    async rollSavingThrow(config, _dialog, message) { saveCalls++; const card = makeMessage({ ...message.data, type: "save", actor: this, system: { ...message.data.system, ability: config.ability }, rolls: [new D20(10, config.target, saveTotal)] }); return card.rolls; } };
  game.actors.push(a); world.set(a.uuid, a); return a;
}
function item(id, owner) {
  const raw = structuredClone(get(id)), i = { ...raw, id: `item${++serial}`, actor: owner, isOwner: true, inCompendium: false };
  i.uuid = `${owner.uuid}.Item.${i.id}`; i.system.equipped = true; i.system.attuned = true; i.system.magicAvailable = true;
  i.effects = list(raw.effects.map(e => new FX(e, i))); i.toObject = () => raw;
  i.setFlag = async (scope, key, value) => set(i, `flags.${scope}.${key}`, value); i.update = async data => { for (const [k, v] of Object.entries(data)) set(i, k, v); };
  owner.items.push(i); world.set(i.uuid, i); return i;
}
function token(id, a) { const t = { id, uuid: `Scene.test.Token.${id}`, actor: a }; world.set(t.uuid, t); return t; }
function activity(i) { const a = { id: "attack", uuid: `${i.uuid}.Activity.attack`, type: "attack", actor: i.actor, item: i, flags: {}, attack: { type: { classification: "weapon" } }, effects: [], getAppliedEffectChanges: () => ({}) }; world.set(a.uuid, a); return a; }
function makeMessage(data) {
  const id = `msg${++serial}`, card = { id, uuid: `ChatMessage.${id}`, author: game.user, timestamp: serial, flags: {}, whisper: [], blind: false, rolls: [], system: {}, ...data,
    getAssociatedActor() { return this.actor ?? this.activity?.actor; }, getAssociatedActivity() { return this.activity; }, getAssociatedItem() { return this.activity?.item; },
    async setFlag(scope, key, value) { set(this, `flags.${scope}.${key}`, value); } };
  world.set(card.uuid, card); game.messages.push(card); return card;
}
const attacker = actor("attacker"), victim = actor("victim"), undead = actor("undead", "undead"), other = actor("other");
const attackerToken = token("attacker", attacker), victimToken = token("victim", victim), undeadToken = token("undead", undead), otherToken = token("other", other);
const combatants = [attackerToken, victimToken, undeadToken, otherToken].map((t, i) => ({ id: `c${i}`, actor: t.actor, token: t }));
game.combat = { id: "combat", uuid: "Combat.combat", started: true, round: 1, turn: 0, turns: combatants, combatant: combatants[0], current: { round: 1, turn: 0 } };
function shot(i, target = victimToken, face = 20, extra = {}) {
  const roll = new D20(face); roll.options.spikependiumWeaponContext = { combat: game.combat?.id ?? null, round: game.combat?.round, turn: game.combat?.turn,
    own: game.combat?.combatant.actor.uuid === i.actor.uuid, time: game.time.worldTime, start: FX.getEffectStart() };
  Object.assign(roll.options, extra);
  return makeMessage({ type: "attack", activity: activity(i), rolls: [roll], system: { targets: [{ token: target.uuid, actor: target.actor.uuid, ac: 10 }] } });
}
async function start(index, round = game.combat.round) { game.combat.round = round; game.combat.turn = index; game.combat.current = { round, turn: index }; game.combat.combatant = combatants[index]; await griffonWeaponStartTurn.call(game.combat, async () => {}, combatants[index]); }
const frozen = item("frozen-dagger", attacker), basilisk = item("basilisk-dagger", attacker), left = item("spiderbite-left", attacker), right = item("spiderbite-right", attacker), purging = item("purging-dagger", attacker);
const expanded = shot(frozen, victimToken, 19); assert.equal(expanded.rolls[0].isCritical, true); assert.equal(naturalWeaponTwenty(expanded.rolls[0]), false); await processGriffonWeaponHits(expanded); assert.equal(saveCalls, 0);
const dropped = new D20(20); dropped.dice[0].results = [{ result: 20, active: false, discarded: true }, { result: 11, active: true }]; assert.equal(naturalWeaponTwenty(dropped), false);
const freezing = shot(frozen); await Promise.all([processGriffonWeaponHits(freezing), processGriffonWeaponHits(freezing)]); assert.equal(saveCalls, 1); assert.equal(victim.effects.filter(e => e.statuses.has("paralyzed")).length, 1);
await processGriffonWeaponHits(freezing); assert.equal(saveCalls, 1); assert.equal(victim.effects[0].duration.expiry, "targetEnd");
saveTotal = 20; const slowed = shot(frozen, otherToken); await processGriffonWeaponHits(slowed); assert.equal(Number(other.effects[0].system.changes[0].value), 0.5); assert.equal(other.effects[0].duration.expiry, "targetEnd");
other.system.traits.ci.value.add("paralyzed"); await processGriffonWeaponHits(shot(frozen, otherToken)); assert.equal(other.effects.length, 1, "paralysis immunity also prevents successful-save slowing");
other.system.traits.ci.value.clear(); await processGriffonWeaponHits(shot(item("frozen-dagger", attacker), otherToken)); assert.equal(other.effects.filter(e => e.flags.spikependium?.weaponFrozenSlow).length, 1, "two Frozen Daggers do not multiply the same slowing effect");
saveTotal = 8; victim.system.traits.size = "huge"; const beforeHuge = saveCalls; await processGriffonWeaponHits(shot(basilisk)); assert.equal(saveCalls, beforeHuge); victim.system.traits.size = "lg";
await processGriffonWeaponHits(shot(basilisk)); assert.ok(victim.effects.some(e => e.statuses.has("restrained") && e.duration.expiry === "sourceEnd"));
const retryingSave = shot(frozen), oldBatch = foundry.documents.modifyBatch, beforeSaveRetry = saveCalls;
foundry.documents.modifyBatch = async () => { throw Error("simulated interrupted effect creation"); }; await assert.rejects(processGriffonWeaponHits(retryingSave)); foundry.documents.modifyBatch = oldBatch;
await processGriffonWeaponHits(retryingSave); assert.equal(saveCalls, beforeSaveRetry + 1, "saved result is not rerolled after interrupted effect application");
const a = shot(left, victimToken, 15), b = shot(left, victimToken, 16); await processGriffonWeaponHits(a); await processGriffonWeaponHits(b); const beforePair = saveCalls;
const c = shot(right, victimToken, 17); await Promise.all([processGriffonWeaponHits(c), processGriffonWeaponHits(c)]); assert.equal(saveCalls, beforePair + 1); assert.equal(victim.system.attributes.hp.value, 96); assert.ok(victim.effects.some(e => e.statuses.has("poisoned")));
await processGriffonWeaponHits(shot(right, victimToken, 18)); assert.equal(saveCalls, beforePair + 2, "four hits produce two pairs; no invented once-per-turn limit"); assert.equal(victim.system.attributes.hp.value, 92);
await processGriffonWeaponHits(c); assert.equal(victim.system.attributes.hp.value, 92, "replaying a completed pair never deals damage twice");
await start(1); const reactionL = shot(left, otherToken, 15), reactionR = shot(right, otherToken, 15); await processGriffonWeaponHits(reactionL); await processGriffonWeaponHits(reactionR); assert.equal(other.system.attributes.hp.value, 100);
await start(0, 2); const differentL = shot(left, victimToken, 15), differentR = shot(right, otherToken, 15); await processGriffonWeaponHits(differentL); await processGriffonWeaponHits(differentR); assert.equal(victim.system.attributes.hp.value, 92); assert.equal(other.system.attributes.hp.value, 100);
const delayed = shot(frozen); await start(2, 3); const oldSaves = saveCalls; await processGriffonWeaponHits(delayed); assert.equal(saveCalls, oldSaves, "expired old attack does not create a fresh next-turn condition");

await start(0, 4); const bow = item("basilisk-dagger", attacker); bow.flags.spikependium = {}; const acid = item("acidlight-arrow", attacker), acidAttack = shot(bow, victimToken, 15); acidAttack.system.ammunitionItem = acid;
await applyGriffonAmmoHits(acidAttack); const burning = victim.effects.find(e => e.flags.spikependium?.weaponHit?.kind === "acidlight"); assert.ok(griffonHitInfo(burning));
const duplicate = (await victim.createEmbeddedDocuments("ActiveEffect", [burning.toObject()]))[0]; assert.equal(griffonHitInfo(duplicate), undefined, "copying a profile does not create another arrow"); await duplicate.delete();
acidAttack.rolls[0].total++; assert.equal(griffonHitInfo(burning), undefined, "changed original roll stops its automatic follow-up"); acidAttack.rolls[0].total--;
burning.disabled = true; assert.equal(griffonHitInfo(burning), undefined); burning.disabled = false;
victim.resist = new Set(["acid"]); const hp = victim.system.attributes.hp.value; await start(1, 4); assert.equal(victim.system.attributes.hp.value, hp - 2, "native resistance applies to automatic 1d4 acid"); const ticks = damageCalls;
await start(1, 4); await resumeGriffonWeaponTicks(); assert.equal(damageCalls, ticks); assert.equal(victim.system.attributes.hp.value, hp - 2);
await start(1, 5); assert.equal(victim.system.attributes.hp.value, hp - 4); await start(1, 4); assert.equal(victim.system.attributes.hp.value, hp - 4, "initiative rewind cannot reapply an old tick");
const tickCard = game.messages.find(m => m.flags.spikependium?.weaponTick); await victim.applyDamage([{ type: "acid", value: 4 }], { originatingMessage: tickCard }); assert.equal(victim.system.attributes.hp.value, hp - 4);
assert.equal(tickCard.speaker.actor, attacker.id, "damage speaker identifies the source, not the victim as damaging itself");
burning.failPending = true; const log = console.error; console.error = () => {}; try { await start(1, 6); } finally { console.error = log; } const afterInterruptedMarker = victim.system.attributes.hp.value; await resumeGriffonWeaponTicks(); assert.equal(victim.system.attributes.hp.value, afterInterruptedMarker, "atomic HP receipt survives interruption before clearing the pending marker");
victim.failUpdate = true; console.error = () => {}; try { await start(1, 7); } finally { console.error = log; } const beforeRetry = victim.system.attributes.hp.value, cardsBeforeRetry = damageCalls; await resumeGriffonWeaponTicks(); assert.equal(victim.system.attributes.hp.value, beforeRetry - 2); assert.equal(damageCalls, cardsBeforeRetry, "interrupted actor update reuses its existing damage roll");
victim.immune = new Set(["acid"]); const beforeImmune = victim.system.attributes.hp.value, beforeImmuneCard = damageCalls; await start(1, 8); assert.equal(victim.system.attributes.hp.value, beforeImmune); assert.equal(damageCalls, beforeImmuneCard + 1); victim.immune.clear(); await start(1, 8); assert.equal(victim.system.attributes.hp.value, beforeImmune, "even a zero-damage immune tick is committed once");
game.time.worldTime = 60; const beforeExpiry = damageCalls; await start(1, 8); assert.equal(damageCalls, beforeExpiry, "acid ends after 60 seconds");
await burning.delete(); assert.equal(griffonHitInfo(burning), undefined);
game.time.worldTime = 61; await start(0, 9); const embeddedAttack = shot(purging, undeadToken, 20); await processGriffonWeaponHits(embeddedAttack); assert.equal(undead.effects.length, 0, "optional embedding never happens without the owner's choice");
await requestPurgingEmbed(embeddedAttack, 0, undeadToken.uuid); const blade = undead.effects.find(e => e.flags.spikependium?.weaponHit?.kind === "purging-dagger"); assert.ok(blade); assert.equal(canUseGriffonWeapon(embeddedAttack.activity), false); assert.equal(await griffonWeaponAttack.call(embeddedAttack.activity, async () => { throw Error("embedded weapon must not attack"); }), null);
damageTotal = 12; const beforeRadiant = undead.system.attributes.hp.value; await start(2, 9); assert.equal(undead.system.attributes.hp.value, beforeRadiant - 12); assert.equal(undead.system.attributes.hp.value, 88);
await blade.delete(); await Promise.all([returnPurgingDaggers(), returnPurgingDaggers()]); assert.equal(purging.flags.spikependium.purgingEmbedded, undefined); await start(2, 10); assert.equal(undead.system.attributes.hp.value, 88);
await start(0, 11); const thrown = shot(purging, undeadToken, 20, { attackMode: "thrown" }); purging.system.quantity = 0; await requestPurgingEmbed(thrown, 0, undeadToken.uuid); const thrownFX = undead.effects.find(e => e.flags.spikependium?.weaponHit?.kind === "purging-dagger"); await thrownFX.delete(); await returnPurgingDaggers(); await returnPurgingDaggers(); assert.equal(purging.system.quantity, 1, "extracted thrown dagger returns once");
const unchanged = saveCalls; game.user = { id: "player", isGM: false, isActiveGM: false }; await processGriffonWeaponHits(shot(frozen)); await resumeGriffonWeaponHits(); assert.equal(saveCalls, unchanged);
console.log("GS1 weapon triggers: actual natural 20/active die, native saves/effect profiles/immunities/expiry, multiple paired hits only on own turn, native poison/acid/radiant damage, atomic tick receipts/retries/rewinds, chosen embedding/unavailable blade/one-time return passed.");
