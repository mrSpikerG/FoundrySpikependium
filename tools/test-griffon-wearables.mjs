import assert from "node:assert/strict";
import fs from "node:fs";
import { GRIFFON_WEARABLES } from "../src/content/griffons-saddlebag-wearables.mjs";
import { cleanGriffonSight, finishGriffonWearableUse, griffonDervishProtected, tectonicMovement } from "../scripts/griffon-wearables.mjs";
import { canUseGriffonItem } from "../scripts/griffon-items.mjs";
import { opportunityTargetProtected } from "../scripts/cunning-disengage.mjs";
import { applyTurnLimit } from "../scripts/mechanics.mjs";
import { nativeGriffonCastChanges, nativeGriffonTerrain, nativeGriffonMovement } from "./data/dnd5e-griffon-native.mjs";
import { nativeUsesConsumption, nativeRecoverUses } from "./data/dnd5e-monsters-native.mjs";
import { prepareEffectData } from "./data/dnd5e-effect-application.mjs";
const docs = new Map(), folders = new Map();
for (const f of fs.readdirSync("packs/_source/items")) {
  const d = JSON.parse(fs.readFileSync(`packs/_source/items/${f}`, "utf8"));
  if (d._key.startsWith("!folders!")) folders.set(d._id, d); else docs.set(d.flags.spikependium.key, d);
}
const get = id => { const d = docs.get(`item:gs1:${id}`); assert.ok(d, id); return d; }, acts = d => Object.values(d.system.activities);
const evidence = JSON.parse(fs.readFileSync("tools/data/griffon-wearables.json", "utf8")), names = JSON.parse(fs.readFileSync("babele/ru/spikependium.items.json", "utf8")).entries;
assert.equal(evidence.entries.length, 12); assert.equal(GRIFFON_WEARABLES.length, 12);
for (const row of evidence.entries) {
  const d = docs.get(row.key); assert.ok(d); assert.equal(d.system.source.rules, "2024"); assert.equal(d.system.source.custom, row.url); assert.equal(d.system.source.page, "");
  assert.equal(names[d._id].name, row.name.slice(0, row.name.lastIndexOf(" ["))); assert.equal(d.system.rarity, row.rarity); assert.equal(d.system.attunement, row.attunement === "Да" ? "required" : "");
  assert.ok(d.system.price.value > 0 && d.system.weight.value > 0);
  let current = d.folder, found = false; while (current) { const f = folders.get(current); assert.ok(f); found ||= f.name === "Сумка грифона — книга 1"; current = f.folder; } assert.ok(found);
  for (const a of acts(d)) { assert.equal(a.consumption.spellSlot, false); for (const e of a.effects ?? []) assert.ok(d.effects.some(p => p._id === e._id)); }
}
const boots = get("dendallen-boots"); assert.equal(boots.system.uses.max, "4"); assert.equal(boots.system.uses.recovery[0].period, "dusk");
assert.equal(boots.effects.find(e => e.transfer).system.changes[0].value, "@attributes.movement.speeds.walk");
assert.ok(boots.effects.find(e => !e.transfer).system.changes.every(c => c.value === "-1"), "curse is an explicit persistent actor profile, not an unconditional equipment penalty");
const flame = acts(get("fireweaver"))[0], flameChanges = nativeGriffonCastChanges.call({ ...flame, toObject: () => structuredClone(flame) });
assert.equal(JSON.parse(flameChanges.find(c => c.key === "system.duration").value).units, "hour");
assert.equal(flameChanges.find(c => c.key === "activities[attack].attack.bonus").value, "5"); assert.equal(flameChanges.find(c => c.key === "activities[attack].attack.flat").value, true);
assert.equal(acts(get("knocking-boots"))[0].range.units, "touch");
const tectonic = get("tectonic"), casting = acts(tectonic).filter(a => a.type === "cast");
assert.deepEqual(casting.map(a => a.consumption.targets[0].value), ["8", "6", "2", "2", "5"]);
for (const a of casting) { const changes = nativeGriffonCastChanges.call({ ...a, toObject: () => structuredClone(a) }); assert.equal(changes.find(c => c.key === "activities[save].save.dc.formula").value, "18"); }
assert.deepEqual(acts(tectonic).filter(a => a.type === "attack").map(a => a.range.value), ["5", "10", "15", "20", "25", "30"]);
const armor = tectonic.effects.find(e => e.flags.spikependium?.griffonTectonicArmor); assert.equal(armor.duration.value, 3600);
assert.deepEqual(armor.system.changes.filter(c => c.key === "system.traits.dr.value").map(c => c.value), ["bludgeoning", "piercing", "slashing"]);
assert.equal(armor.system.changes.find(c => c.key.endsWith(".burrow")).value, "30"); assert.ok(!armor.system.changes.some(c => c.key.endsWith(".multiplier")), "30-foot burrowing must not be halved again");
const armorUse = acts(tectonic).find(a => a.type === "transform" && a.activation.type === "action"); assert.deepEqual(armorUse.uses.recovery.map(r => r.period), ["sr", "lr"]);
const intCurse = tectonic.effects.flatMap(e => e.system.changes).find(c => c.key === "system.abilities.int.value");
assert.equal(intCurse.type, "override"); for (const score of [5, 7, 8, 10, 11, 18]) {
  const formula = intCurse.value.replaceAll("@abilities.int.value", String(score)); assert.match(formula, /^[\d\s,()a-z-]+$/);
  const actual = Function("min", "max", `return ${formula}`)(Math.min, Math.max); assert.equal(actual, score < 7 ? score : Math.max(7, score - 4));
}
assert.ok(!get("volt").effects.some(e => e.flags.spikependium?.noReactions)); assert.ok(get("volt").effects.some(e => e.flags.spikependium?.noOpportunityAttacks));
assert.equal(acts(get("volt")).find(a => a.type === "save").damage.parts.length, 0, "save does not halve the separately paid damage");
const bath = get("bath-potion"); assert.equal(bath.type, "consumable"); assert.equal(bath.system.uses.autoDestroy, true); assert.equal(acts(bath)[0].activation.type, "bonus"); assert.equal(bath.effects[0].duration.value, 86400);
const cloud = get("cloud-jumper"); assert.deepEqual(cloud.system.uses.recovery, []); assert.equal(acts(cloud)[1].consumption.targets[0].value, "-1");

const list = a => Object.assign(a, { get(id) { return this.find(v => v.id === id); } });
const world = new Map(); globalThis.fromUuidSync = uuid => world.get(uuid);
globalThis.ui = { notifications: { warn() {} } }; globalThis.CONST = { TOKEN_DISPOSITIONS: { SECRET: -2 } };
globalThis.game = { user: { id: "player", isGM: true, isActiveGM: true }, users: { activeGM: null }, actors: [], scenes: [], i18n: { localize: s => s } };
const merge = (a, b) => { for (const [k, v] of Object.entries(b)) { if (v && typeof v === "object" && !Array.isArray(v)) { a[k] ??= {}; merge(a[k], v); } else a[k] = v; } return a; };
globalThis.foundry = { utils: { mergeObject: merge, getType: v => Array.isArray(v) ? "Array" : typeof v, isEmpty: v => Object.keys(v).length === 0 }, documents: {} };
globalThis.ActiveEffect = { implementation: { getEffectStart: () => ({ time: 100, combat: "combat", round: 1, turn: 0 }), forApplication: async c => c } };
globalThis.CONFIG = { DND5E: { movementTypes: { walk: {}, fly: {}, swim: {}, climb: {}, burrow: {} }, conditionTypes: {}, defaultUnits: { length: { imperial: "ft" } }, encumbrance: { speedReduction: {} } } };
for (const [bonus, multiplier, expectedWalk, expectedBurrow] of [[0, 1, 15, 30], [-5, 1, 12.5, 25], [10, 1, 20, 40], [0, 2, 30, 60]]) {
  const model = { _source: { attributes: { movement: { speeds: { walk: 30 } } } }, attributes: { movement: { speeds: { walk: 30, fly: 60, swim: 0, climb: 0, burrow: 30 }, bonus, multiplier, units: "ft" } }, abilities: { str: { value: 14 } }, traits: {} };
  model.parent = { effects: [{ active: true, flags: { spikependium: { griffonTectonicArmor: true } } }], statuses: Object.assign(new Set(), { reduce(fn, initial) { return [...this].reduce(fn, initial); } }), flags: {}, hasConditionEffect: () => false, getRollData: () => ({}) };
  tectonicMovement.call(model, () => nativeGriffonMovement.call(model, {}));
  assert.equal(model.attributes.movement.speeds.walk, expectedWalk); assert.equal(model.attributes.movement.speeds.burrow, expectedBurrow);
  assert.equal(model.attributes.movement.speeds.fly, (60 + bonus) * multiplier / 2); assert.equal(model.attributes.movement.speeds.swim, 0);
  assert.equal(model.attributes.movement.speed, expectedWalk); assert.equal(model.attributes.movement.max, Math.max(expectedBurrow, (60 + bonus) * multiplier / 2));
}
const unaffected = { parent: { effects: [] } }; assert.equal(tectonicMovement.call(unaffected, () => "native"), "native", "ordinary actors are unchanged");
globalThis.dnd5e = { applications: { components: { EffectApplicationElement: class { async _prepareEffectData(e, a) { return prepareEffectData.call(this, e, a, s => s); } } } } };
const ignored = new Set(get("mammoth-boots").effects[0].system.changes.map(c => c.value));
const token = { disposition: 1, actor: { system: { attributes: { movement: { ignoredDifficultTerrain: ignored } } } } };
for (const [types, expected] of [[new Set(["ice"]), 0], [new Set(["snow"]), 0], [new Set(["ice", "snow"]), 0], [new Set(["ice", "mud"]), 1], [new Set(["mud"]), 1]]) assert.equal(nativeGriffonTerrain.call({ types, ignoredDispositions: new Set() }, token, {}).length, expected);
assert.equal(get("mammoth-boots").system.weight.value, 2, "external body weight does not encumber wearer");
const cost = value => ({ resolveCost: async () => ({ total: value }) });
const spent = { max: 1, spent: 1, value: 0 };
assert.equal((await nativeUsesConsumption.call(cost(-1), {}, { uses: spent, type: "charge", rolls: [], delta: {} })).spent, 0);
assert.equal((await nativeRecoverUses.call({ uses: { max: 5, spent: 4, recovery: get("fire-dervish").system.uses.recovery } }, new Map([["dawn", 1]]))).updates.spent, 0);
assert.equal((await nativeUsesConsumption.call(cost(3), {}, { uses: { max: 5, value: 5, spent: 0 }, type: "charge", rolls: [], delta: {} })).spent, 3);

function makeActor(uuid) {
  const actor = { uuid, isOwner: true, flags: { spikependium: {} }, effects: list([]), async deleteEmbeddedDocuments(type, ids) { assert.equal(type, "ActiveEffect"); this.effects = list(this.effects.filter(e => !ids.includes(e.id))); } };
  world.set(uuid, actor); game.actors.push(actor); return actor;
}
const owner = makeActor("Actor.owner"), other = makeActor("Actor.other"), attacker = makeActor("Actor.attacker");
const cloak = { ...structuredClone(get("fire-dervish")), uuid: "Item.cloak", actor: owner }; cloak.system.equipped = cloak.system.attuned = true;
cloak.effects = list(cloak.effects.map(e => ({ ...e, id: e._id, uuid: `${cloak.uuid}.ActiveEffect.${e._id}`, toObject: () => structuredClone(e) })));
const spins = acts(cloak); assert.equal(new Set(spins.map(a => a.flags.spikependium.group)).size, 1);
const use = { ...spins[0], id: spins[0]._id, actor: owner, item: cloak, uuid: "Activity.spin", getAppliedEffectChanges: () => ({}) }; world.set(use.uuid, use);
const combat = { id: "combat", started: true, round: 1, turn: 0, combatant: { actor: owner } }, updates = { actor: {} };
assert.equal(applyTurnLimit(use, {}, {}, updates, combat), undefined); merge(owner.flags.spikependium, { turnUses: { [use.flags.spikependium.group]: "combat:1:0" } });
assert.equal(applyTurnLimit({ ...use, ...spins[1], actor: owner, item: cloak }, {}, {}, { actor: {} }, combat), false, "other charge variant shares the same turn limit");
combat.turn++; assert.equal(applyTurnLimit(use, {}, {}, { actor: {} }, combat), undefined); combat.combatant.actor = other; assert.equal(applyTurnLimit(use, {}, {}, { actor: {} }, combat), false);
const message = { id: "spin-message", uuid: "ChatMessage.spin", flags: {}, system: {}, getAssociatedActor: () => owner, getAssociatedItem: () => cloak, getAssociatedActivity: () => use };
let writes = 0;
foundry.documents.modifyBatch = async ops => { writes++; for (const op of ops) { if (op.documentName === "ActiveEffect") for (const data of op.data ?? []) owner.effects.push({ ...data, id: data._id, active: true }); else merge(message.flags, { spikependium: { griffonDervishSpeedApplied: true } }); } };
await finishGriffonWearableUse(use, {}); assert.equal(writes, 0, "cancelled use does not apply speed penalty");
cloak.system.equipped = false;
await finishGriffonWearableUse(use, { message }); await finishGriffonWearableUse(use, { message }); assert.equal(writes, 1);
cloak.system.equipped = true;
const speed = owner.effects.find(e => e.flags.spikependium?.griffonDervishSpeed); assert.equal(speed.system.changes[0].value, "-10"); assert.equal(speed.system.origin.activity, use.uuid); assert.equal(speed.duration.expiry, "sourceEnd"); assert.equal(speed.start.time, 100);
const targetProfile = cloak.effects.find(e => e.flags.spikependium?.griffonDervishTarget); attacker.effects.push({ ...structuredClone(targetProfile.toObject()), active: true, system: { origin: { activity: use.uuid } } });
assert.equal(griffonDervishProtected(attacker, owner), true); assert.equal(griffonDervishProtected(attacker, other), false);
assert.equal(opportunityTargetProtected({ subject: { actor: attacker } }, { data: { system: { targets: [{ actor: owner.uuid }] } } }), true);
assert.equal(opportunityTargetProtected({ subject: { actor: attacker } }, { data: { system: { targets: [{ actor: other.uuid }] } } }), false);
cloak.system.attuned = false; assert.equal(griffonDervishProtected(attacker, owner), true, "already applied restriction lasts until the source turn ends even if the cloak is removed"); cloak.system.attuned = true;
attacker.effects[0].system.origin = { activity: "Activity.deleted", message: "ChatMessage.cachedSpin" }; world.set("ChatMessage.cachedSpin", message);
assert.equal(griffonDervishProtected(attacker, owner), true, "native chat source preserves the effect if the original item is deleted");
attacker.effects[0].duration.expired = true; assert.equal(griffonDervishProtected(attacker, owner), false);
const bathOwned = { ...bath, actor: owner }; assert.equal(canUseGriffonItem({ item: bathOwned }), true, "consumables do not require wearing the bottle");
const otyugh = { ...get("otyugh"), uuid: "Item.otyugh", system: { ...get("otyugh").system, equipped: true, attuned: true } }, sightSource = { item: otyugh };
world.set("Activity.sight", sightSource); owner.effects.push({ id: "sight", flags: { spikependium: { griffonOtyughSight: true } }, system: { origin: { activity: "Activity.sight" } } });
await cleanGriffonSight(); assert.ok(owner.effects.some(e => e.id === "sight")); otyugh.system.equipped = false; await cleanGriffonSight(); assert.ok(!owner.effects.some(e => e.id === "sight"));
otyugh.system.equipped = true; owner.effects.push({ id: "sight", flags: { spikependium: { griffonOtyughSight: true } }, system: { origin: { activity: "Activity.sight" } } });
await finishGriffonWearableUse({ actor: owner, item: otyugh, flags: { spikependium: { griffonEndProfile: "griffonOtyughSight" } } }, { message }); assert.ok(!owner.effects.some(e => e.id === "sight"));
console.log("GS1 wearables: 12 source cards/folders/Russian names, native terrain, Cast attack/DC/duration overrides, charges/ground reset, consumable potion, native self-effect/own-turn limit, caster-scoped opportunity protection and sight cleanup passed.");
