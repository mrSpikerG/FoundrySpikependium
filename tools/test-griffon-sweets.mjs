import assert from "node:assert/strict";
import fs from "node:fs";
import { canUseGriffonSweet, canConsumeGriffonSweet, prepareSweetUpdates, recordSweetUse, finishSweetUse, sweetUse, sweetActive, sweetTurtleAC, prepareSweetDamage, prepareSweetCheck, prepareSweetSave, guardSweetMissiles, cleanSweets } from "../scripts/griffon-sweets.mjs";
import { isGriffonSpellcaster } from "../scripts/griffon-two-items.mjs";
import { nativeUsesConsumption } from "./data/dnd5e-monsters-native.mjs";
import { nativeConsumeSpellSlots } from "./data/dnd5e-relentless-native.mjs";
import { nativeApplyDamage, nativeCalculateDamage } from "./data/dnd5e-guardian-native.mjs";
import { prepareEffectData } from "./data/dnd5e-effect-application.mjs";
import { limitRestoration } from "../scripts/resources.mjs";
const raw = new Map(), uuidRaw = new Map(), folders = new Map();
for (const pack of ["items", "feats", "spells", "tables"]) for (const name of fs.readdirSync(`packs/_source/${pack}`)) {
  const d = JSON.parse(fs.readFileSync(`packs/_source/${pack}/${name}`, "utf8")); if (d._key.startsWith("!folders!")) { folders.set(d._id, d); continue; }
  raw.set(d.flags.spikependium.key, d); uuidRaw.set(`Compendium.spikependium.${pack}.${pack === "tables" ? "RollTable" : "Item"}.${d._id}`, d);
}
const get = key => { assert.ok(raw.has(key), key); return raw.get(key); }, sweet = id => get(`item:gs1:${id}`), aux = id => get(`aux:gs1:sweet-${id}`), acts = d => Object.values(d.system.activities);
const evidence = JSON.parse(fs.readFileSync("tools/data/griffon-sweets.json", "utf8")), names = JSON.parse(fs.readFileSync("babele/ru/spikependium.items.json", "utf8")).entries;
assert.equal(evidence.entries.length, 12); assert.equal(evidence.entries.flatMap(e => e.variants).length, 34);
for (const row of evidence.entries) for (const key of row.variants) {
  const d = get(key); assert.equal(d.type, "consumable"); assert.equal(d.system.source.rules, "2024"); assert.equal(d.system.source.custom, row.url); assert.equal(d.system.source.page, "");
  assert.ok(/[а-яё]/i.test(names[d._id]?.name ?? d.name)); assert.ok(d.system.price.value > 0 && d.system.weight.value > 0); assert.equal(d.system.uses.autoDestroy, true); assert.deepEqual(d.system.uses.recovery, []);
  if (row.rarity !== "varies") assert.equal(d.system.rarity, row.rarity);
  let parent = d.folder, found = false; while (parent) { const f = folders.get(parent); assert.ok(f); found ||= f.name === "Сумка грифона — книга 1"; parent = f.folder; } assert.ok(found);
}
for (const [id, count] of [["everlasting", 30], ["tongue-twisty", 12], ["levibubble", 5], ["shielding-turtle", 2]]) { assert.equal(sweet(id).system.uses.max, String(count)); assert.equal(sweet(id).system.type.value, "food"); }
for (const [id, count] of [["ooze", 8], ["ancestry", 10], ["fate", 20], ["trick", 20]]) { const t = get(`table:gs1:sweet-${id}`); assert.equal(t.results.length, count); assert.equal(t.formula, `1d${count}`); }
const bubbleSpell = get("spell:gs1:levibubble"); assert.ok(!bubbleSpell.system.properties.includes("concentration")); assert.equal(acts(bubbleSpell).find(a => a.type === "save").save.dc.formula, "13"); assert.deepEqual(acts(bubbleSpell).find(a => a.type === "save").save.ability, ["dex"]);
assert.equal(aux("tricky-open").effects.length, 20); assert.equal(aux("paper").flags.spikependium.sweetFates.length, 20);

let next = 0, queue = [], randomRolls = 0;
const world = new Map(), list = a => Object.assign(a, { get(id) { return this.find(i => i.id === id); } });
const set = (o, path, v) => { const keys = path.split("."), last = keys.pop(); for (const k of keys) o = o[k] ??= {}; o[last] = v; };
const merge = (a, b) => { for (const [k, v] of Object.entries(b)) { if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Set)) { a[k] ??= {}; merge(a[k], v); } else a[k] = v; } return a; };
const apply = (o, changes) => { for (const [k, v] of Object.entries(changes)) { if (k.includes(".")) set(o, k, v); else if (v && typeof v === "object" && !Array.isArray(v)) merge(o[k] ??= {}, v); else o[k] = v; } };
globalThis.game = { user: { id: "gm", isGM: true, isActiveGM: true }, users: { activeGM: null }, time: { worldTime: 100 }, actors: [], scenes: [], messages: new Map(), i18n: { localize: s => s } };
globalThis.ui = { notifications: { warn() {}, error() {} } };
globalThis.fromUuidSync = uuid => world.get(uuid); globalThis.fromUuid = async uuid => world.get(uuid);
globalThis.foundry = { utils: { randomID: () => `sweet${String(++next).padStart(11, "0")}`, escapeHTML: s => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;"), setProperty: set, mergeObject: merge, deepClone: structuredClone, isEmpty: o => Object.keys(o).length === 0, getProperty: (o, path) => path.split(".").reduce((v, k) => v?.[k], o), hasProperty: (o, path) => path.split(".").reduce((v, k) => v?.[k], o) !== undefined }, documents: {} };
globalThis.CONFIG = { DND5E: { armorProficienciesMap: { shield: "shl" }, spellLevels: { 0: "0", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9" }, damageTypes: { piercing: { isPhysical: true }, force: {}, fire: {}, cold: {} }, healingTypes: { healing: {}, temphp: {} } }, Dice: { BasicRoll: class { constructor(formula) { this.formula = formula; } async evaluate() { randomRolls++; this.total = queue.length ? queue.shift() : { "1d3 + 3": 5, "1d8 + 4": 9, "1d8": 3, "1d20": 17, "5d8 + 10": 32, "1d6": 4 }[this.formula]; return this; } } } };
globalThis.Hooks = { call(name, ...args) { return name === "dnd5e.preApplyDamage" ? guardSweetMissiles(...args) !== false : true; }, callAll() {} };
Math.clamp ??= (n, min, max) => Math.max(min, Math.min(max, n)); Number.isNumeric ??= n => typeof n === "number" && Number.isFinite(n);
class FX {
  constructor(data, parent) { Object.assign(this, structuredClone(data)); this.parent = parent; this.id = data._id; this.uuid = `${parent.uuid}.ActiveEffect.${this.id}`; this.statuses = new Set(data.statuses ?? []); this.inCompendium = !!parent.inCompendium; this._stats ??= {}; }
  get active() { return !this.disabled && !this.duration?.expired; }
  toObject() { const { _id, name, type, system, duration, flags, disabled, transfer, start, img, _stats } = this; return structuredClone({ _id, name, type, system, duration, flags, disabled, transfer, start, img, _stats, statuses: [...this.statuses] }); }
  async update(changes) { apply(this, changes); }
  static getEffectStart() { return { time: game.time.worldTime }; }
}
globalThis.ActiveEffect = { implementation: { getEffectStart: FX.getEffectStart, forApplication: async changes => changes } };
globalThis.dnd5e = { applications: { components: { EffectApplicationElement: class { async _prepareEffectData(e, a) { return prepareEffectData.call(this, e, a, s => s); } } } } };
function item(data, actor, compendiumUuid) {
  const d = structuredClone(data); d.id = d._id; d.actor = actor; d.uuid = compendiumUuid ?? `${actor.uuid}.Item.${d.id}`; d.inCompendium = !!compendiumUuid;
  d.effects = list((d.effects ?? []).map(e => new FX(e, d)));
  d.toObject = () => structuredClone({ _id: d.id, name: d.name, type: d.type, img: d.img, system: d.system, flags: d.flags, _stats: d._stats, effects: d.effects.map(e => e.toObject()) });
  d.sheet = { render() { d.opened = true; } }; d.getRollData = () => actor?.getRollData() ?? {};
  if (actor) { actor.items.push(d); world.set(d.uuid, d); } return d;
}
for (const [uuid, data] of uuidRaw) world.set(uuid, item(data, null, uuid));
function actor(uuid) {
  const a = { uuid, isOwner: true, flags: { spikependium: {} }, items: list([]), effects: list([]), classes: {}, statuses: new Set(), saves: 0,
    system: { attributes: { hp: { value: 30, max: 30, effectiveMax: 30, temp: 0, tempmax: 0, damage: 0 }, prof: 3 }, traits: { armorProf: { value: new Set(["shl"]) }, ci: { value: new Set() } }, skills: { prf: { value: 0 } }, spells: { spell1: { value: 0, max: 4 }, spell2: { value: 0, max: 3 }, spell3: { value: 0, max: 2 }, spell4: { value: 0, max: 1 }, spell5: { value: 0, max: 1 }, pact: { level: 3, value: 0, max: 2 } }, _source: { attributes: { hp: { tempmax: 0 } } } },
    getRollData() { return { ...this.system, mod: 3 }; }, async update(changes) { apply(this, changes); this.system.attributes.hp.damage = this.system.attributes.hp.max - this.system.attributes.hp.value; },
    async deleteEmbeddedDocuments(type, ids) { if (type === "Item") { for (const i of this.items.filter(i => ids.includes(i.id))) { world.delete(i.uuid); for (const a of acts(i)) world.delete(`${i.uuid}.Activity.${a._id}`); } this.items = list(this.items.filter(i => !ids.includes(i.id))); } else this.effects = list(this.effects.filter(e => !ids.includes(e.id))); },
    async rollSavingThrow() { this.saves++; return [{ isFailure: !!this.failSave }]; }, changeHasEffect(kind, d) { return kind === "resistance" && this.resist?.has(d.type); }, changeIsIgnored: () => false,
    calculateDamage(d, options) { return nativeCalculateDamage.call(this, d, options); }, async applyDamage(d, options) { return nativeApplyDamage.call(this, d, options); } };
  world.set(uuid, a); game.actors.push(a); return a;
}
foundry.documents.modifyBatch = async ops => { for (const op of ops) { if (op.action === "delete") await op.parent.deleteEmbeddedDocuments(op.documentName, op.ids); else if (op.action === "create") for (const raw of op.data) { const d = structuredClone(raw); d._id = foundry.utils.randomID(); op.parent.effects.push(new FX(d, op.parent)); } else for (const d of op.updates) await op.parent.effects.get(d._id).update(d); } };
const own = (id, a) => { const d = structuredClone(sweet(id)); d._id = foundry.utils.randomID(); return item(d, a); };
function activity(i, index = 0) { const a = { ...acts(i)[index], item: i, actor: i.actor, uuid: `${i.uuid}.Activity.${acts(i)[index]._id}`, getRollData: () => i.actor.getRollData(), getAppliedEffectChanges: () => ({}) }; world.set(a.uuid, a); return a; }
const empty = () => ({ actor: {}, item: [], create: [], delete: [], rolls: [] });
async function payments(a, cost = 1) {
  const u = empty(), max = Number(a.item.system.uses.max), spent = a.item.system.uses.spent;
  const result = await nativeUsesConsumption.call({ resolveCost: async () => ({ total: cost }) }, {}, { uses: { ...a.item.system.uses, max, value: max - spent }, type: "charge", rolls: [], delta: {} });
  if (a.item.system.uses.autoDestroy && result.spent >= max) u.delete.push(a.item.id); else u.item.push({ _id: a.item.id, "system.uses.spent": result.spent }); return u;
}
async function commit(a, updates, config = {}) {
  await a.actor.update(updates.actor); for (const u of updates.item) { const i = a.actor.items.get(u._id); if (i) apply(i, u); }
  for (const d of updates.create) item(d, a.actor); if (updates.delete.length) await a.actor.deleteEmbeddedDocuments("Item", updates.delete);
  const rawMessage = { data: { system: {}, flags: {} } }; recordSweetUse(a, config, rawMessage);
  const message = { id: foundry.utils.randomID(), uuid: `ChatMessage.${next}`, flags: rawMessage.data.flags, system: {}, getAssociatedActor: () => a.actor, getAssociatedItem: () => a.item, getAssociatedActivity: () => a, async update(changes) { apply(this, changes); } };
  await finishSweetUse(a, { message }); return { message, updates, frame: message.flags.spikependium?.sweetUse };
}
async function eat(a, config = {}) { const u = await payments(a); assert.equal(await prepareSweetUpdates(a, config, u), u); return commit(a, u, config); }
const owner = actor("Actor.owner"), friend = actor("Actor.friend");
assert.equal(canUseGriffonSweet({ item: { ...aux("breath"), actor: owner }, actor: owner, flags: {} }), false);
const drink = activity(own("spell-recovery", owner)); assert.equal(await prepareSweetUpdates(drink, {}, empty()), false, "no loan without native payment");
queue = [5]; const recovery = await eat(drink), credit = owner.items.find(i => i.flags.spikependium?.sweetTemplate === "recovery"); assert.equal(credit.system.uses.max, "5"); assert.equal(credit.opened, true);
const restore2 = activity(credit, 1), restoreUpdates = await payments(restore2, 2);
await nativeConsumeSpellSlots.call({ actor: owner, resolveLevel: () => 2, resolveCost: async () => ({ total: -1 }) }, {}, restoreUpdates);
assert.equal(await prepareSweetUpdates(restore2, {}, restoreUpdates), restoreUpdates); assert.equal(limitRestoration(restore2, restoreUpdates), true); await commit(restore2, restoreUpdates); assert.equal(owner.system.spells.spell2.value, 1); assert.equal(credit.system.uses.spent, 2);
const hastyA = activity(own("hasty", owner)); const fast = await eat(hastyA); assert.equal(owner.effects.find(e => e.flags.spikependium?.sweetReceipt === fast.frame.nonce).system.changes[0].value, "5"); assert.equal(canUseGriffonSweet(restore2), false, "other action closes restoration credit");
const oldMarker = sweetActive(owner, "hasty"); owner.failSave = true; const fire = await eat(activity(own("kindle-egg", owner))); assert.equal(owner.saves, 1); assert.ok(!owner.effects.includes(oldMarker)); assert.ok(owner.effects.some(e => e.statuses.has("poisoned"))); const countSaves = owner.saves;
await finishSweetUse(activity(own("hasty", owner)), { message: fire.message }); assert.equal(owner.saves, countSaves, "repeated completion never rerolls the stomach save");
queue = [1, 1, 8, 5]; const opened = await eat(activity(own("oozebeans", owner))); const beans = owner.items.filter(i => i.flags.spikependium?.sweetOrigin?.receipt === opened.frame.nonce); assert.equal(beans.length, 4); assert.deepEqual(beans.map(i => keyOf(i).split("-").at(-1)), ["white", "white", "yellow", "gold"]); assert.ok(sweetActive(owner, "kindle-egg"), "opening a package does not eat it or replace an active sweet");
function keyOf(i) { return i.flags.spikependium.key; }
const whiteData = beans[0].toObject(); whiteData._id = foundry.utils.randomID(); const transferred = item(whiteData, friend); const white = await eat(activity(transferred)); assert.ok(sweetActive(friend, "ooze-white"));
await owner.update({ [`flags.spikependium.sweetReceipts.${opened.frame.nonce}.paid`]: 0 }); await cleanSweets(); assert.ok(!sweetActive(friend, "ooze-white")); assert.ok(!owner.items.some(i => i.flags.spikependium?.sweetOrigin?.receipt === opened.frame.nonce), "refunding an opened bag removes its surviving beans and dependent effects across owners");
const dragon = await eat(activity(own("dragon-breath-veryRare-cold", owner))); const breath = owner.items.find(i => i.flags.spikependium?.sweetLoan?.receipt === dragon.frame.nonce); assert.equal(acts(breath)[0].damage.parts[0].number, 4); assert.deepEqual(acts(breath)[0].damage.parts[0].types, ["cold"]); assert.equal(acts(breath)[1].save.dc.formula, "16");
assert.equal(canUseGriffonSweet(activity(breath)), undefined); assert.equal(await prepareSweetUpdates(activity(breath), {}, empty()), false, "one-use breath cannot skip its native resource cost"); game.time.worldTime += 60; assert.equal(canUseGriffonSweet(activity(breath)), false); await cleanSweets(); assert.ok(!owner.items.includes(breath));
const bubble = await eat(activity(own("levibubble", friend))), bubbleLoan = friend.items.find(i => i.flags.spikependium?.sweetLoan?.receipt === bubble.frame.nonce), bubbleCast = activity(bubbleLoan); assert.equal(canUseGriffonSweet(bubbleCast), false); game.time.worldTime += 60; assert.equal(canUseGriffonSweet(bubbleCast), undefined);
const bubbleChild = { type: "utility", flags: {}, actor: friend, item: { ...bubbleSpell, system: { ...bubbleSpell.system, sourceItem: "feat:griffon-sweet-bubble" } }, getLinkedActivity: () => bubbleCast };
assert.equal(await prepareSweetUpdates(bubbleChild, {}, empty()), false, "native linked spell cannot ignore its parent's payment"); const bubblePay = await payments(bubbleCast); assert.equal(await prepareSweetUpdates(bubbleChild, {}, bubblePay), bubblePay);
assert.equal(isGriffonSpellcaster({ items: [{ type: "feat", flags: { spikependium: { sweetLoan: {} } }, system: { activities: { cast: { type: "cast" } } } }, { type: "spell", system: { sourceItem: "feat:griffon-sweet-bubble" } }, { type: "spell", system: { sourceItem: "consumable:griffon-cookie-paper" } }] }), false, "temporary magic-item effects do not qualify as innate spellcasting");
assert.equal(isGriffonSpellcaster({ items: [aux("bubble")] }), false, "unpaid service template also cannot qualify for caster attunement");
queue = [3]; const cookie = await eat(activity(own("doomsday-cookie", friend))), firstRolls = randomRolls; await eat(activity(own("doomsday-cookie", friend))); assert.equal(randomRolls, firstRolls); assert.equal(friend.flags.spikependium.doomsdayFate, 3);
const paper = friend.items.find(i => i.flags.spikependium?.sweetLoan?.receipt === cookie.frame.nonce), charge = activity(paper); assert.equal(canUseGriffonSweet(charge), false); friend.statuses.add("dead"); assert.equal(canUseGriffonSweet(charge), undefined);
const charged = empty(); assert.equal(await prepareSweetUpdates(charge, {}, charged), charged); apply(paper, charged.item[0]); const revive = activity(paper, 1);
assert.equal(canUseGriffonSweet(charge), false, "activation is one-time and cannot extend the scroll's deadline");
assert.equal(canConsumeGriffonSweet(revive, {}, { data: { system: { targets: [{ actor: friend.uuid }] } } }), undefined); assert.equal(canConsumeGriffonSweet(revive, {}, { data: { system: { targets: [{ actor: owner.uuid }] } } }), false);
game.time.worldTime += 60; assert.equal(canUseGriffonSweet(revive), false); await cleanSweets(); assert.ok(!friend.items.includes(paper));
owner.failSave = false; const mint = await eat(activity(own("peppermince", owner))), mintState = owner.items.find(i => i.flags.spikependium?.sweetLoan?.receipt === mint.frame.nonce), crush = activity(mintState, 0); assert.equal(crush.flags.spikependium.sweetCrush, true);
queue = [4]; owner.resist = new Set(["piercing"]); const crunched = await eat(crush); assert.equal(owner.system.attributes.hp.value, 28); assert.equal(canUseGriffonSweet(crush), false);
const damageConfig = { subject: { actor: owner, attack: { type: { classification: "weapon" } } }, rolls: [{ parts: ["base"], data: {}, options: { type: "piercing" } }, { parts: ["extra"], data: {}, options: { type: "slashing" } }] }; prepareSweetDamage(damageConfig); prepareSweetDamage(damageConfig); assert.equal(damageConfig.rolls[0].data.spikependiumPeppermince, 2); assert.equal(damageConfig.rolls[1].data.spikependiumPeppermince, undefined);
await finishSweetUse(crush, { message: crunched.message }); assert.equal(owner.system.attributes.hp.value, 28, "same crushing card never damages twice");
const shieldRaw = { _id: foundry.utils.randomID(), name: "Щит", type: "equipment", flags: {}, effects: [], system: { type: { value: "shield" }, equipped: false, container: null, uses: { max: "", spent: 0 } } }, backShield = item(shieldRaw, owner);
const turtle = await eat(activity(own("shielding-turtle", owner)), { spikependium: { sweetShield: backShield.id } }); assert.equal(sweetTurtleAC(owner), true); backShield.system.equipped = true; assert.equal(sweetTurtleAC(owner), false); backShield.system.equipped = false; owner.system.traits.armorProf.value.clear(); assert.equal(sweetTurtleAC(owner), false); owner.system.isNPC = true; assert.equal(sweetTurtleAC(owner), true); owner.system.isNPC = false;
queue = [20]; const tricks = await eat(activity(own("tricky-treats", friend))), bag = friend.items.find(i => i.flags.spikependium?.sweetLoan?.receipt === tricks.frame.nonce); assert.equal(bag.system.uses.max, "20"); assert.equal(bag.effects.length, 20);
queue = [19]; const vision = await eat(activity(bag)); assert.equal(sweetActive(friend, "trick-19").system.changes[0].value, "30");
queue = [17]; await eat(activity(bag)); const songState = friend.items.find(i => i.flags.spikependium?.sweetTemplate === "state" && i.flags.spikependium.sweetLoan.kind === "trick-17"), singing = activity(songState); game.messages.set("song", { getAssociatedActivity: () => singing });
const checkConfig = { subject: friend, rolls: [{ parts: ["@mod", "@prof"], data: {}, options: {} }] }; prepareSweetCheck(checkConfig, {}, { data: { system: { origin: "song" } } }); assert.equal(checkConfig.rolls[0].data.spikependiumSugarSinging, 3); friend.system.skills.prf.value = 1; prepareSweetCheck(checkConfig, {}, { data: { system: { origin: "song" } } }); assert.equal(checkConfig.rolls[0].data.spikependiumSugarSinging, 6);
await eat(activity(own("oozebean-yellow", friend))); const missile = { item: { type: "spell", system: { identifier: "magic-missile" } } }, missileOptions = { originatingMessage: { getOriginatingMessage: () => ({ getAssociatedActivity: () => missile }) } }; assert.equal(guardSweetMissiles(friend, 5, {}, missileOptions), false); missile.item.system.identifier = "eldritch-blast"; assert.equal(guardSweetMissiles(friend, 5, {}, missileOptions), undefined);
await eat(activity(own("oozebean-gray", friend))); game.messages.set("fear", { getAssociatedActivity: () => ({ applicableEffects: [{ statuses: new Set(["frightened"]) }] }) }); const fear = { subject: friend, rolls: [{ options: { advantageMode: -1 } }] }; prepareSweetSave(fear, {}, { data: { system: { origin: "fear" } } }); assert.equal(fear.rolls[0].options.advantageMode, 0);
let release, entered; const gate = new Promise(resolve => { entered = resolve; }); const locked = sweetUse.call({ actor: friend, flags: { spikependium: { sweetEat: "hasty" } } }, async () => { entered(); return new Promise(resolve => { release = resolve; }); }); await gate;
assert.equal(await sweetUse.call({ actor: friend, flags: { spikependium: { sweetEat: "kindle-egg" } } }, () => assert.fail("concurrent candy use")), undefined); release(); await locked;
const pendingActor = actor("Actor.pendingSave"); await eat(activity(own("hasty", pendingActor)));
let resolveSave, announce; const saveStarted = new Promise(resolve => { announce = resolve; });
pendingActor.rollSavingThrow = async () => { pendingActor.saves++; if (pendingActor.saves > 1) throw Error("duplicate mandatory save"); announce(); return new Promise(resolve => { resolveSave = resolve; }); };
const eating = eat(activity(own("kindle-egg", pendingActor))); await saveStarted;
const pendingState = pendingActor.items.find(i => i.flags.spikependium?.sweetLoan?.kind === "kindle-egg"), retry = { ...activity(pendingState), flags: { spikependium: { sweetRetry: true } } };
await finishSweetUse(retry, { message: { uuid: "ChatMessage.retry", flags: {} } }); assert.equal(pendingActor.saves, 1); resolveSave([{ isFailure: false }]); await eating;
console.log("GS1 sweets: 12 source entries/34 physical variants, fixed stock/colours, native resource payment, linked-spell guard, timed loans, exact recovery budget, exclusive stomach profiles/saves, scoped bonuses, permanent cookie fate and one-minute target-only scroll passed.");
