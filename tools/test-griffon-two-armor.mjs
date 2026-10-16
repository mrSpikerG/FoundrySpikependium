import assert from "node:assert/strict";
import fs from "node:fs";
import { GRIFFON_TWO_ARMOR } from "../src/content/griffons-saddlebag-two-armor.mjs";
import { prepareGriffonTwoArmorUpdates, chooseOwlbearSuccess, anglerNetRange, finishGriffonTwoArmorUse, cleanGriffonTwoArmor } from "../scripts/griffon-two-armor.mjs";
import { canUseGriffonItem } from "../scripts/griffon-items.mjs";
import { nativeArmorSetOverride } from "./data/dnd5e-griffon-two-armor-native.mjs";
import { nativeUsesConsumption, nativeSaveForceSuccess } from "./data/dnd5e-monsters-native.mjs";
const docs = new Map(), folders = new Map();
for (const f of fs.readdirSync("packs/_source/items")) {
  const d = JSON.parse(fs.readFileSync(`packs/_source/items/${f}`, "utf8"));
  if (d._key.startsWith("!folders!")) folders.set(d._id, d); else docs.set(d.flags.spikependium.key, d);
}
const get = id => { const d = docs.get(`item:gs2:${id}`); assert.ok(d, id); return d; }, acts = d => Object.values(d.system.activities);
const evidence = JSON.parse(fs.readFileSync("tools/data/griffon-two-armor.json", "utf8"));
const bases = JSON.parse(fs.readFileSync("tools/data/griffon-two-armor-bases.json", "utf8"));
const names = JSON.parse(fs.readFileSync("babele/ru/spikependium.items.json", "utf8")).entries;
assert.equal(evidence.entries.length, 12); assert.equal(bases.records.length, 12);
assert.equal(GRIFFON_TWO_ARMOR.flatMap(([, id, , , types]) => types.map(t => id + (types.length > 1 ? `-${t}` : ""))).length, 24);
for (const row of evidence.entries) for (const key of row.variants) {
  const d = docs.get(key), base = bases.records.find(r => d.flags.spikependium.nativeBase.endsWith(r.document._id)).document;
  assert.ok(/[а-яё]/i.test(names[d._id].name)); assert.equal(d.system.source.custom, row.url); assert.equal(d.system.source.rules, "2014"); assert.equal(d.system.source.page, "");
  assert.equal(d.system.armor.value, base.system.armor.value); assert.equal(d.system.armor.dex, base.system.armor.dex); assert.equal(d.system.strength, base.system.strength);
  assert.equal(d.system.weight.value, base.system.weight.value); assert.ok(d.system.price.value > base.system.price.value); assert.equal(d.system.rarity, row.rarity);
  let parent = d.folder, seen = new Set(), parts = [];
  while (parent) { assert.ok(!seen.has(parent)); seen.add(parent); const f = folders.get(parent); assert.ok(f); parts.push(f.name); parent = f.folder; }
  assert.ok(parts.includes("Сумка грифона — книга 2") && parts.includes("Доспехи"));
  for (const a of acts(d)) { assert.equal(a.consumption.spellSlot, false); for (const e of a.effects ?? []) assert.ok(d.effects.some(p => p._id === e._id)); }
}
for (const type of ["padded", "leather", "studded"]) { const d = get(`freerunner-${type}`), a = acts(d)[0]; assert.equal(a.flags.spikependium.oncePerTurn, true); assert.equal(a.flags.spikependium.ownTurn, true); assert.equal(d.effects.length, 0); }
assert.equal(get("icarus").system.armor.magicalBonus, 1); assert.equal(get("icarus").system.uses.max, "6"); assert.equal(get("icarus").system.uses.recovery[0].formula, "1d4+2");
const fog = acts(get("mistwalker")).find(a => a.type === "cast"); assert.equal(fog.spell.level, 2); assert.ok(fog.spell.uuid.endsWith("phbsplFogCloud00")); assert.equal(fog.consumption.targets[0].type, "itemUses");
assert.equal(get("angler").effects[0].system.changes[0].type, "upgrade"); assert.equal(get("mistwalker").effects.length, 0, "fog vision must not become global blindsight");
const set = (obj, path, value) => { const keys = path.split("."), last = keys.pop(); for (const k of keys) obj = obj[k] ??= {}; obj[last] = value; };
const apply = (obj, data) => { for (const [key, value] of Object.entries(data)) set(obj, key, value); };
const list = a => Object.assign(a, { get(id) { return this.find(d => d.id === id); } });
const world = new Map(); let confirm = true, calls = 0, beforeConfirm, serial = 0;
globalThis.game = { user: { id: "player", isActiveGM: true }, users: { activeGM: { id: "player" } }, actors: [] };
globalThis.canvas = { tokens: { placeables: [] } };
globalThis.fromUuidSync = (uuid, options) => world.get(uuid?.startsWith(".") ? `${options?.relative.uuid}${uuid}` : uuid);
globalThis.ui = { notifications: { warn() {} } };
globalThis.foundry = { utils: { getProperty: (obj, p) => p.split(".").reduce((v, k) => v?.[k], obj), mergeObject: (a, b) => Object.assign(a, b) }, applications: { api: { DialogV2: { async confirm() { calls++; await beforeConfirm?.(); return confirm; } } } } };
const owner = { uuid: "Actor.hero", isOwner: true, items: list([]), effects: [], async deleteEmbeddedDocuments(_type, ids) { this.effects = this.effects.filter(e => !ids.includes(e.id)); } };
game.actors.push(owner);
function item(id) {
  const d = structuredClone(get(id)); d.id = d._id; d.uuid = `${owner.uuid}.Item.${d.id}`; d.actor = owner; d.system.equipped = true; d.system.attuned = true;
  d.refresh = () => { d.system.uses.max = Number(d.system.uses.max); d.system.uses.value = d.system.uses.max - d.system.uses.spent; };
  d.update = async changes => { apply(d, changes); d.refresh(); }; d.refresh();
  d.system.activities = list(acts(d).map(a => ({ ...a, id: a._id, actor: owner, item: d, uuid: `${d.uuid}.Activity.${a._id}` })));
  for (const a of d.system.activities) world.set(a.uuid, a); owner.items.push(d); return d;
}
const angler = item("angler"), net = { type: "equipment", actor: owner, system: { identifier: "net" } };
const a = { type: "save", item: net, range: { units: "ft", value: "15", override: false } };
const prepare = a => anglerNetRange.call(a, nativeArmorSetOverride.bind(a), "range");
prepare(a); assert.equal(a.range.value, "30"); a.range.value = Number(a.range.value); prepare(a); assert.equal(a.range.value, "30", "native numeric formula preparation must not stack");
angler.system.attuned = false; prepare(a); assert.equal(a.range.value, "15"); angler.system.attuned = true;
const old = { type: "attack", item: { type: "weapon", actor: owner, system: { type: { baseItem: "net" }, range: { value: 5, long: 15, units: "ft" } } }, range: { override: false } };
prepare(old); assert.equal(old.range.value, "10"); assert.equal(old.range.long, "30"); assert.equal(old.item.system.range.value, 5, "stored base remains untouched");
old.range.value = 30; prepare(old); assert.equal(old.range.value, "10"); assert.equal(old.range.long, "30", "native final range=max(value,long) must not stack");
const unrelated = { ...a, item: { ...net, system: { identifier: "rope" } }, range: { units: "ft", value: "15" } }; prepare(unrelated); assert.equal(unrelated.range.value, "15");
angler.system.equipped = false; prepare(old); assert.equal(old.range.value, 5); assert.equal(old.range.long, 15); angler.system.equipped = true;
const owlbear = item("owlbear"), resist = owlbear.system.activities[0];
function message(ability = "con") {
  const m = { uuid: `ChatMessage.save${++serial}`, type: "save", author: game.user, system: { ability, resisted: false }, rolls: [{ total: 4, isFailure: true }], getAssociatedActor: () => owner, async update(changes) { apply(this, changes); } };
  world.set(m.uuid, m); return m;
}
let paid = 0, cancelUse = false;
resist.use = async config => {
  if (cancelUse) return;
  assert.equal(canUseGriffonItem(resist), true);
  const native = await nativeUsesConsumption.call({ resolveCost: async () => ({ total: 1 }) }, config, { uses: owlbear.system.uses, rolls: [], delta: {}, type: "charge" });
  const updates = { item: [{ _id: owlbear.id, "system.uses.spent": native.spent }] };
  assert.equal(prepareGriffonTwoArmorUpdates(resist, config, updates), updates);
  await owlbear.update(updates.item[0]); paid++; return { message: { uuid: "ChatMessage.payment" } };
};
const failed = message(); await chooseOwlbearSuccess(failed); assert.equal(paid, 1); assert.equal(failed.rolls[0].total, 4); assert.equal(nativeSaveForceSuccess.call(failed.system), true); assert.equal(failed.flags.spikependium.owlbearSuccess.item, owlbear.uuid);
await chooseOwlbearSuccess(failed); await chooseOwlbearSuccess(message()); assert.equal(paid, 1);
await owlbear.update({ "system.uses.spent": 0 }); confirm = false; const cancelled = message(); await chooseOwlbearSuccess(cancelled); assert.equal(paid, 1); assert.equal(cancelled.system.resisted, false);
confirm = true; cancelUse = true; await chooseOwlbearSuccess(cancelled); assert.equal(cancelled.system.resisted, false); cancelUse = false;
const before = calls; await chooseOwlbearSuccess(message("wis")); assert.equal(calls, before);
const other = message(); other.author = { id: "someone" }; await chooseOwlbearSuccess(other); assert.equal(calls, before);
const changed = message(); beforeConfirm = async () => { owlbear.system.equipped = false; }; await chooseOwlbearSuccess(changed); assert.equal(paid, 1); assert.equal(changed.system.resisted, false); beforeConfirm = null; owlbear.system.equipped = true;
await Promise.all([chooseOwlbearSuccess(message()), chooseOwlbearSuccess(message())]); assert.equal(paid, 2, "one wearer cannot concurrently spend the last charge twice");
assert.equal(prepareGriffonTwoArmorUpdates(resist, {}, { item: [{ _id: owlbear.id, "system.uses.spent": 2 }] }), false, "save replacement requires the original save");
const icarus = item("icarus"), fly = icarus.system.activities[0], end = icarus.system.activities[1];
assert.equal(prepareGriffonTwoArmorUpdates(fly, { consume: false }, { item: [] }), false, "cannot turn off charge consumption");
assert.equal(prepareGriffonTwoArmorUpdates({ ...fog, item: { type: "spell" }, getLinkedActivity: () => ({ ...fog, item: item("mistwalker") }) }, {}, { item: [] }), false, "linked fog cast cannot bypass parent resource");
const fx = (id, source) => ({ id, flags: { spikependium: { griffonIcarusGlide: true } }, system: { origin: { activity: source } } });
owner.effects.push(fx("mine", fly.uuid), fx("other", "Other.Activity"));
await finishGriffonTwoArmorUse(end, {}); assert.equal(owner.effects.length, 2);
await finishGriffonTwoArmorUse(end, { message: {} }); assert.deepEqual(owner.effects.map(e => e.id), ["other"]);
owner.effects = [fx("mine", fly.uuid)]; icarus.system.attuned = false; await cleanGriffonTwoArmor(); assert.equal(owner.effects.length, 0);
const source = fs.readFileSync("scripts/spikependium.mjs", "utf8"); assert.ok(source.includes('chooseOwlbearSuccess(message)')); assert.ok(source.includes('documentClass.prototype._setOverride`, anglerNetRange'));
console.log("GS2 armor: twelve sources/twenty-four variants, native bases/folders/resources, net 2014/2024 range without stacking, paid linked casts, failed-Constitution success/cancel/concurrency and wing cleanup passed.");
