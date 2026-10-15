import assert from "node:assert/strict";
import fs from "node:fs";
import nativeAmmo from "./data/griffon-two-ammo.json" with { type: "json" };
import { canUseGriffonItem } from "../scripts/griffon-items.mjs";
import { GRIFFON_TWO_RINGS } from "../src/content/griffons-saddlebag-two-rings.mjs";
import { canUseGriffonTwo, guardGriffonCasterAttunement, isGriffonSpellcaster, prepareGriffonTwoUpdates, recordGriffonCooldown,
  recoverGriffonPeriods, syncGriffonTwo, griffonTwoUse, discardVolleyOnMove, prepareImmutability, chooseImmutability,
  prepareSolarAttack, prepareSolarDamage, recordHealerHeroism, applyHealerHeroism } from "../scripts/griffon-two-items.mjs";
import { nativeGriffonCastChanges } from "./data/dnd5e-griffon-native.mjs";
import { nativeUsesConsumption, nativeRecoverUses, nativeSaveForceSuccess } from "./data/dnd5e-monsters-native.mjs";
const docs = new Map(), uuids = new Map(), folders = new Map();
for (const pack of ["items", "spells", "tables"]) for (const f of fs.readdirSync(`packs/_source/${pack}`)) {
  const d = JSON.parse(fs.readFileSync(`packs/_source/${pack}/${f}`, "utf8"));
  if (d._key.startsWith("!folders!")) folders.set(d._id, d);
  else { docs.set(d.flags.spikependium.key, d); uuids.set(`Compendium.spikependium.${pack}.${pack === "tables" ? "RollTable" : "Item"}.${d._id}`, d); }
}
const get = id => { const d = docs.get(`item:gs2:${id}`); assert.ok(d, id); return d; }, acts = d => Object.values(d.system.activities);
const evidence = JSON.parse(fs.readFileSync("tools/data/griffon-two-rings.json", "utf8")), translations = JSON.parse(fs.readFileSync("babele/ru/spikependium.items.json", "utf8")).entries;
assert.equal(evidence.entries.length, 12); assert.equal(GRIFFON_TWO_RINGS.length, 12);
for (const row of evidence.entries) {
  const d = docs.get(row.key); assert.ok(d); assert.equal(d.system.source.rules, "2014"); assert.equal(d.system.source.custom, row.url); assert.equal(d.system.source.page, "");
  assert.equal(d.system.rarity, row.rarity); assert.equal(d.system.attunement, row.attunement.startsWith("Да") ? "required" : "");
  assert.equal(translations[d._id].name, row.name.slice(0, row.name.lastIndexOf(" ["))); assert.ok(d.system.price.value > 0 && d.system.weight.value > 0);
  let parent = d.folder, found = false; while (parent) { const f = folders.get(parent); assert.ok(f); found ||= f.name === "Сумка грифона — книга 2"; parent = f.folder; } assert.ok(found);
  for (const a of acts(d)) { assert.equal(a.consumption.spellSlot, false); for (const e of a.effects ?? []) assert.ok(d.effects.some(p => p._id === e._id)); }
}
const naga = get("spirit-naga"); assert.equal(naga.system.uses.max, "1"); assert.deepEqual(naga.system.uses.recovery, []);
assert.deepEqual(naga.effects[0].system.changes.map(c => c.value), ["poison", "poisoned"]);
assert.equal(acts(naga)[0].healing.custom.formula, "floor(@attributes.hp.max / 2)");
const solarSpell = docs.get("spell:gs2-solar-mark"), solarCast = acts(get("solar-sight"))[0];
assert.equal(uuids.get(solarCast.spell.uuid), solarSpell); assert.equal(solarSpell.system.duration.units, "minute"); assert.equal(solarSpell.system.duration.value, "1"); assert.ok(solarSpell.system.properties.includes("concentration"));
for (const id of ["solar-sight", "gateway"]) {
  const data = acts(get(id))[0], changes = nativeGriffonCastChanges.call({ ...data, toObject: () => structuredClone(data) });
  const duration = JSON.parse(changes.find(c => c.key === "system.duration").value); assert.equal(duration.units, "minute"); assert.equal(duration.value, "1"); assert.equal(duration.concentration, true);
}
const table = docs.get("table:gs2-quick-change"); assert.equal(table.results.length, 12); assert.equal(table.formula, "1d12"); assert.equal(table.results[0].description, "Стёганый"); assert.equal(table.results.at(-1).description, "Латы");
const set = (obj, path, value) => { const keys = path.split("."), last = keys.pop(); let node = obj; for (const k of keys) node = node[k] ??= {}; node[last] = value; };
function apply(obj, changes, prefix = "") { for (const [key, v] of Object.entries(changes)) {
  const path = prefix ? `${prefix}.${key}` : key;
  if (v && typeof v === "object" && !Array.isArray(v)) apply(obj, v, path); else set(obj, path, v);
} }
let next = 0; const world = new Map();
globalThis.fromUuidSync = uuid => world.get(uuid); globalThis.fromUuid = async uuid => world.get(uuid);
globalThis.ui = { notifications: { warn() {} } };
globalThis.foundry = { utils: { randomID: () => `receipt${++next}`, getType: v => Array.isArray(v) ? "Array" : typeof v, isEmpty: v => Object.keys(v).length === 0 }, applications: { api: { DialogV2: { confirm: async () => true } } } };
globalThis.game = { user: { id: "player", isActiveGM: true }, users: { activeGM: null }, actors: [], scenes: [], combats: new Map(), time: { worldTime: 100 }, messages: new Map(), i18n: { localize: v => v } };
globalThis.CONFIG = { DND5E: { healingTypes: { healing: {}, temphp: {} } } };
globalThis.ActiveEffect = { implementation: { getEffectStart: () => ({ time: game.time.worldTime }) } }; Math.clamp ??= (n, min, max) => Math.min(max, Math.max(min, n));
function actor(uuid) {
  const a = { uuid, isOwner: true, items: [], effects: [], statuses: new Set(), classes: {}, flags: { spikependium: {} }, system: { attributes: { hp: { value: 10, max: 20, temp: 0 } } },
    getRollData: () => ({ attributes: { spell: { mod: 3 } } }),
    async setFlag(scope, key, value) { set(this, `flags.${scope}.${key}`, value); }, async update(changes) { apply(this, changes); },
    async createEmbeddedDocuments(type, data) { assert.equal(type, "ActiveEffect"); for (const d of data) this.effects.push({ ...d, active: true, async update(changes) { apply(this, changes); } }); },
    async deleteEmbeddedDocuments(type, ids) { assert.equal(type, "Item"); this.items = this.items.filter(i => !ids.includes(i.id)); } };
  world.set(uuid, a); game.actors.push(a); return a;
}
function item(raw, owner) {
  const d = structuredClone(raw); d.id = d._id ?? `item${++next}`; d.uuid = `${owner.uuid}.Item.${d.id}`; d.actor = owner; d.isOwner = true;
  d.flags ??= {}; d.system.equipped = true; d.system.attuned = true;
  const refresh = () => { if (d.system.uses) { d.system.uses.max = Number(d.system.uses.max || 0); d.system.uses.value = Math.max(0, d.system.uses.max - d.system.uses.spent); } }; refresh();
  d.update = async changes => { apply(d, changes); refresh(); }; d.delete = async () => { owner.items = owner.items.filter(i => i !== d); };
  d.toObject = () => structuredClone({ _id: d.id, name: d.name, type: d.type, img: d.img, system: { ...d.system, properties: [...(d.system.properties ?? [])] }, flags: d.flags, _stats: d._stats ?? {} });
  owner.items.push(d); world.set(d.uuid, d); return d;
}
const empty = () => ({ actor: {}, item: [], create: [], delete: [], rolls: [] });
const activity = (it, index = 0) => { const a = { ...acts(it)[index], item: it, actor: it.actor, uuid: `${it.uuid}.Activity.${acts(it)[index]._id}` }; world.set(a.uuid, a); return a; };
const owner = actor("Actor.owner"), gate = item(get("gateway"), owner), gateUse = activity(gate);
async function pay(a) {
  const uses = a.item.system.uses, paid = await nativeUsesConsumption.call({ resolveCost: async () => ({ total: 1 }) }, {}, { uses, type: "charge", rolls: [], delta: {} });
  const updates = empty(); updates.item.push({ _id: a.item.id, "system.uses.spent": paid.spent });
  assert.equal(await prepareGriffonTwoUpdates(a, {}, updates), updates); await a.item.update(updates.item[0]);
  const message = { data: { system: { deltas: { item: { [a.item.id]: [{ keyPath: "system.uses.spent", delta: 1 }] } } } } };
  recordGriffonCooldown(a, {}, message); const receipt = message.data.system.deltas.item[a.item.id].find(d => d.keyPath.endsWith(".paid")); assert.ok(receipt);
  return receipt;
}
const first = await pay(gateUse); assert.equal(canUseGriffonTwo(gateUse), false);
game.time.worldTime += 863999; await syncGriffonTwo(); assert.equal(gate.system.uses.spent, 1);
game.time.worldTime++; await syncGriffonTwo(); assert.equal(gate.system.uses.spent, 0);
const second = await pay(gateUse); await gate.update({ [first.keyPath]: 0, "system.uses.spent": 0 }); await syncGriffonTwo(); assert.equal(gate.system.uses.spent, 1, "old refund must not unlock a newer use");
assert.equal(canUseGriffonTwo(gateUse), false); await gate.update({ [second.keyPath]: 0, "system.uses.spent": 0 }); await syncGriffonTwo(); assert.equal(canUseGriffonTwo(gateUse), undefined);
// Native Cast prepares the parent first, but consumption hooks run on its cached spell activity.
const gateChild = { type: "utility", actor: owner, item: { type: "spell", uuid: "Item.cachedGate", flags: {}, system: { properties: new Set() } }, flags: {},
  getLinkedActivity: uuid => { assert.ok(uuid === undefined || uuid === gateUse.uuid); return gateUse; } };
const linkedConfig = { cause: { activity: gateUse.uuid } }, linkedUpdates = empty();
assert.equal(await prepareGriffonTwoUpdates(gateChild, linkedConfig, empty()), false, "linked Gate cannot bypass the parent cooldown payment by disabling resources");
linkedUpdates.item.push({ _id: gate.id, "system.uses.spent": 1 });
await prepareGriffonTwoUpdates(gateUse, {}, linkedUpdates);
const parentUpdate = structuredClone(linkedUpdates);
await prepareGriffonTwoUpdates(gateChild, linkedConfig, linkedUpdates);
assert.deepEqual(linkedUpdates, parentUpdate, "cached spell must not create a second cooldown receipt");
await gate.update(linkedUpdates.item[0]);
const linkedMessage = { data: { system: {} } }; recordGriffonCooldown(gateChild, linkedConfig, linkedMessage);
assert.equal(linkedMessage.data.system.deltas.item[gate.id].length, 1);
assert.equal(canUseGriffonTwo(gateChild), false, "cached spell respects parent cooldown");
gate.system.equipped = false; assert.equal(canUseGriffonItem(gateChild), false); gate.system.equipped = true;
const linkedReceipt = linkedMessage.data.system.deltas.item[gate.id][0];
await gate.update({ [linkedReceipt.keyPath]: 0, "system.uses.spent": 0 }); await syncGriffonTwo();
assert.equal(canUseGriffonTwo(gateChild), undefined); assert.equal(canUseGriffonItem(gateChild), true);
let finishLinked, enteredLinked;
const entered = new Promise(resolve => { enteredLinked = resolve; });
const runningLinked = griffonTwoUse.call(gateUse, () => griffonTwoUse.call(gateChild, () => { enteredLinked(); return new Promise(resolve => { finishLinked = resolve; }); }));
await entered;
assert.equal(await griffonTwoUse.call(gateChild, () => assert.fail("concurrent cached cast must be blocked")), undefined);
finishLinked({ message: {} }); assert.ok((await runningLinked).message, "outer Cast must not lock out its own child");
const lycan = item(get("lycanthrope"), owner), lycanUse = activity(lycan); await pay(lycanUse);
const recovered = await recoverGriffonPeriods.call({ parent: lycan }, async periods => ({ updates: { "system.uses": (await nativeRecoverUses.call({ uses: lycan.system.uses }, periods)).updates } }), new Map([["dusk", 1]]));
await lycan.update(recovered.updates); await syncGriffonTwo(); assert.equal(lycan.system.uses.spent, 0, "dusk wins over the remaining 12-hour timer");
const moonUse = activity(lycan, 1); await pay(moonUse); game.time.worldTime += 21600; await syncGriffonTwo(); assert.equal(lycan.system.uses.spent, 0);
const claws = activity(lycan, 2); assert.equal(canUseGriffonTwo(claws), false);
owner.effects.push({ active: true, flags: { spikependium: { griffonLycanForm: true } }, system: { origin: { activity: lycanUse.uuid } }, async delete() { this.active = false; } }); assert.equal(canUseGriffonTwo(claws), undefined);
owner.system.attributes.hp.value = 0; assert.equal(canUseGriffonTwo(claws), false); await syncGriffonTwo(); assert.equal(owner.effects[0].active, false); owner.system.attributes.hp.value = 10;
const nagaItem = item(naga, owner), revive = activity(nagaItem); assert.equal(canUseGriffonTwo(revive), false); owner.statuses.add("dead"); assert.equal(canUseGriffonTwo(revive), undefined); owner.statuses.clear();
const hushed = item(get("hushed"), owner), hushSave = activity(hushed, 1); assert.equal(canUseGriffonTwo(hushSave), false);
owner.effects.push({ active: true, flags: { spikependium: { griffonHushedMute: true } } });
assert.equal(canUseGriffonTwo({ item: { type: "spell", flags: {}, system: { properties: new Set(["vocal"]) } }, actor: owner, flags: {} }), false);
assert.equal(canUseGriffonTwo(gateUse), false, "command words are also blocked"); owner.effects = [];
const immutable = item(get("immutability"), owner), sourceSpell = { type: "spell", system: { school: "trs", level: 4, identifier: "polymorph" } };
game.messages.set("spell", { system: { level: 4 }, getAssociatedActivity: () => ({ item: sourceSpell }) });
const saveConfig = { subject: owner, rolls: [{ options: { advantageMode: -1 } }] }; prepareImmutability(saveConfig, {}, { data: { system: { origin: "spell" } } }); assert.equal(saveConfig.rolls[0].options.advantageMode, 0);
game.messages.get("spell").system.level = 6; const upcast = { subject: owner, rolls: [{ options: {} }] }; prepareImmutability(upcast, {}, { data: { system: { origin: "spell" } } }); assert.equal(upcast.rolls[0].options.advantage, undefined);
const savingMessage = { type: "save", author: { id: "player" }, rolls: [{ isFailure: true }], system: { origin: "spell", resisted: false }, getAssociatedActor: () => owner, async update(changes) { apply(this, changes); } };
await chooseImmutability(savingMessage); assert.equal(nativeSaveForceSuccess.call(savingMessage.system), true, "Polymorph auto-success works even when upcast above 5");
const solar = item(get("solar-sight"), owner), cachedSpell = { ...structuredClone(solarSpell), system: { ...solarSpell.system, sourceItem: "equipment:griffon-solar-sight" } };
const target = actor("Actor.target"), casterActivity = { actor: owner, item: cachedSpell }; world.set("Activity.solar", casterActivity); world.set("Effect.concentration", { active: true });
target.effects.push({ active: true, flags: { spikependium: { griffonSolarMark: true } }, system: { origin: { activity: "Activity.solar", effect: "Effect.concentration" } } });
const attack = { actor: owner, type: "attack", getActionType: () => "mwak" }, targets = { data: { system: { targets: [{ actor: target.uuid }] } } };
const rolls = () => [{ parts: ["base"], data: {}, options: { type: "piercing" } }, { parts: ["extra"], data: {}, options: { type: "fire" } }];
const attackConfig = { subject: attack, rolls: rolls() }; prepareSolarAttack(attackConfig, {}, targets); assert.equal(attackConfig.rolls[0].data.spikependiumSolarAttack, 2);
const damage = { subject: attack, rolls: rolls() }; prepareSolarDamage(damage, {}, targets); prepareSolarDamage(damage, {}, targets);
assert.equal(damage.rolls[0].options.type, "radiant"); assert.equal(damage.rolls[0].data.spikependiumSolarDamage, "1d6"); assert.equal(damage.rolls[1].options.type, "fire"); assert.equal(damage.rolls[0].parts.filter(p => p === "@spikependiumSolarDamage").length, 1);
world.get("Effect.concentration").active = false; prepareSolarDamage(damage, {}, targets); assert.equal(damage.rolls[0].options.type, "piercing"); assert.equal(damage.rolls[0].data.spikependiumSolarDamage, undefined); world.get("Effect.concentration").active = true;
casterActivity.item.flags = { spikependium: { key: "spell:ordinary-hunters-mark" } }; prepareSolarAttack(attackConfig, {}, targets); assert.equal(attackConfig.rolls[0].data.spikependiumSolarAttack, undefined); casterActivity.item.flags = solarSpell.flags;
const wrongSpell = { item: { ...cachedSpell, system: { ...cachedSpell.system, sourceItem: "" } }, actor: owner, flags: {} }; assert.equal(canUseGriffonTwo(wrongSpell), false);
const volleys = item(get("volleys"), owner), conjure = activity(volleys);
for (const row of nativeAmmo.records) { const data = row.document; world.set(`Compendium.dnd5e.equipment24.Item.${data._id}`, { ...data, toObject: () => structuredClone(data) }); }
const created = empty(); await prepareGriffonTwoUpdates(conjure, {}, created); assert.equal(created.create.length, 1); assert.equal(created.create[0].system.quantity, 1); assert.ok(created.create[0].system.properties.includes("mgc")); assert.equal(created.create[0].system.uses.autoDestroy, true); assert.equal(created.create[0].system.source.custom, volleys.system.source.custom);
let ammo = item(created.create[0], owner); const redundant = empty(); await prepareGriffonTwoUpdates(conjure, {}, redundant); assert.ok(redundant.delete.includes(ammo.id), "only one drawn unused projectile remains");
await discardVolleyOnMove({ actor: owner }, { x: 1 }, {}, "player"); assert.ok(!owner.items.includes(ammo));
ammo = item(created.create[0], owner); const otherAction = { item: { uuid: "Item.other", system: {} }, actor: owner, type: "utility", flags: {} }; await griffonTwoUse.call(otherAction, async () => ({ message: {} })); assert.ok(!owner.items.includes(ammo));
ammo = item(created.create[0], owner); game.time.worldTime++; await syncGriffonTwo(); assert.ok(!owner.items.includes(ammo));
owner.classes.wizard = { system: { spellcasting: { progression: "full" } } }; const heroism = item(get("healer-heroism"), owner); assert.equal(isGriffonSpellcaster(owner), true); assert.equal(guardGriffonCasterAttunement(heroism, { "system.attuned": true }), undefined);
const noCaster = actor("Actor.fighter"), borrowed = { ...heroism, actor: noCaster }; assert.equal(guardGriffonCasterAttunement(borrowed, { "system.attuned": true }), false);
const healActivity = { actor: owner, uuid: "Activity.heal", activation: { type: "action" } }, origin = { id: "healing-action", getAssociatedActivity: () => healActivity };
const healingOptions = { originatingMessage: { getOriginatingMessage: () => origin } }; target.system.attributes.hp.value = 5;
recordHealerHeroism(target, -4, { "system.attributes.hp.value": 9 }, healingOptions); target.system.attributes.hp.value = 9; await applyHealerHeroism(target, -4, healingOptions);
assert.equal(owner.system.attributes.hp.temp, 3); const protection = owner.effects.find(e => e.flags.spikependium?.healerHeroismRing); assert.ok(protection); assert.equal(protection.duration.expiry, "sourceEnd");
owner.system.attributes.hp.temp = 0; recordHealerHeroism(target, -1, { "system.attributes.hp.value": 10 }, healingOptions); target.system.attributes.hp.value = 10; await applyHealerHeroism(target, -1, healingOptions); assert.equal(owner.system.attributes.hp.temp, 0, "replaying one healing action does not grant new temporary HP");
origin.id = "no-healing"; recordHealerHeroism(target, -1, { "system.attributes.hp.value": 10 }, healingOptions); await applyHealerHeroism(target, -1, healingOptions); assert.equal(owner.system.attributes.hp.temp, 0);
origin.id = "bonus-healing"; healActivity.activation.type = "bonus"; recordHealerHeroism(target, -1, { "system.attributes.hp.value": 11 }, healingOptions); target.system.attributes.hp.value = 11; await applyHealerHeroism(target, -1, healingOptions); assert.equal(owner.system.attributes.hp.temp, 0);
console.log("GS2 items: 12 source cards/Russian names, one-use revival, native Cast overrides, independent cooldown refunds/dusk, lycan form, verbal suppression, scoped solar damage, temporary magical ammo and actual-healing heroism passed.");
