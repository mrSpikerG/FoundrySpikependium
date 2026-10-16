import fs from "node:fs";
import assert from "node:assert/strict";
import { NativeAlchemistASI } from "./data/dnd5e-alchemist-advancement-native.mjs";
import { nativeBuildEvaluate, nativeConsume, nativeRefund, getDeltas } from "./data/dnd5e-reaction-native.mjs";
import { nativeD20ConfigureModifiers } from "./data/dnd5e-arcana-native.mjs";
import { prepareOriginGrantedAbility } from "../scripts/arcana-origin.mjs";
import { applyTurnLimit } from "../scripts/mechanics.mjs";
import { prepareFamiliarToken, prepareFamiliarCheck, buildFamiliarCheck, finalizeFamiliarCheck, canUseFamiliarHelp,
  consumeFamiliarHelp, cleanArcanaDodge } from "../scripts/arcana-familiar.mjs";

const clone = structuredClone;
const read = pack => fs.readdirSync(`packs/_source/${pack}`).map(f => JSON.parse(fs.readFileSync(`packs/_source/${pack}/${f}`, "utf8")));
const classes = read("classes"), feats = read("feats"), spells = read("spells"), all = [...classes, ...feats, ...spells];
const doc = key => all.find(d => d.flags?.spikependium?.key === key);
const backgrounds = classes.filter(d => d.type === "background");
assert.equal(backgrounds.length, 10);
const gearIds = new Set(JSON.parse(fs.readFileSync("tools/data/arcana-background-gear.json", "utf8")).gear.map(g => g.uuid));
for (const v of Object.values(JSON.parse(fs.readFileSync("tools/data/srd.json", "utf8")).items)) gearIds.add(`Compendium.dnd5e.equipment24.Item.${v.id}`);
const expected = [
  ["ninth-quill-agent", ["dex", "int", "cha"], ["skills:slt", "skills:arc", "tool:thief"], 17],
  ["phantasmagoria-performer", ["dex", "con", "cha"], ["skills:prf", "skills:dec", "tool:disg"], 12],
  ["familiar-trainer", ["con", "int", "wis"], ["skills:ani", "skills:arc"], 44],
  ["grave-covenant-recruit", ["str", "int", "wis"], ["skills:his", "skills:med", "tool:herb"], 16],
  ["crucible-stormchaser", ["str", "con", "int"], ["skills:ath", "skills:nat", "tool:art:glassblower"], 15],
  ["warding-hands-ward", ["con", "wis", "cha"], ["skills:med", "skills:ins", "tool:art:cook"], 40],
  ["cosmic-dawn-subject", ["str", "dex", "con"], ["skills:ath", "skills:sur"], 30],
  ["horizon-weavers-initiate", ["dex", "con", "wis"], ["skills:acr", "skills:sur", "tool:art:weaver"], 18],
  ["seer-apprentice", ["int", "wis", "cha"], ["skills:his", "skills:ins", "tool:navg"], 11],
  ["gemstone-conclave-spy", ["dex", "wis", "cha"], ["skills:prc", "skills:dec", "tool:disg"], 5]
];
const get = (o, p) => p.split(".").reduce((v, k) => v?.[k], o);
const set = (o, p, v) => { const ks = p.split("."), k = ks.pop(); ks.reduce((v, k) => v[k] ??= {}, o)[k] = v; };
globalThis.foundry = { utils: { getProperty: get, setProperty: set, flattenObject: o => o, isEmpty: o => !o || !Object.keys(o).length },
  data: { fields: { StringField: class { constructor(o) { Object.assign(this, o); } } } } };
globalThis.ui = { notifications: { warn() {}, error() {} } };
for (const [id, allowed, grants, gold] of expected) {
  const b = doc(`background:au-${id}`), adv = b.system.advancement;
  assert.match(b.name, /[А-Яа-яЁё]/); assert.equal(b.system.source.book, "AU"); assert.equal(b.system.source.page, "");
  assert.equal(b.system.source.custom, "https://ruleholder.com/sourcebooks/au/varianty-dlya-personazhey");
  assert.equal(classes.find(f => f._id === b.folder).name, "Предыстории");
  const asiData = adv.find(a => a.type === "AbilityScoreImprovement");
  assert.equal(asiData.configuration.points, 3); assert.equal(asiData.configuration.cap, 2); assert.equal(asiData.configuration.max, 20);
  assert.deepEqual(Object.keys(asiData.configuration.fixed).filter(a => !asiData.configuration.locked.includes(a)),
    Object.keys(asiData.configuration.fixed).filter(a => allowed.includes(a)));
  assert.deepEqual(adv.find(a => a.type === "Trait" && a.title === "Владения предыстории").configuration.grants, grants);
  const grant = adv.find(a => a.type === "ItemGrant").configuration.items[0].uuid;
  assert.ok(feats.find(f => f._id === grant.split(".").at(-1)));
  const gear = b.system.startingEquipment, root = gear.find(e => !e.group);
  for (const e of gear.filter(e => e.type === "linked")) assert.ok(gearIds.has(e.key), `неподтверждённый предмет: ${e.key}`);
  assert.equal(root.type, "OR"); assert.equal(gear.filter(e => e.group === root._id).length, 2);
  assert.equal(gear.find(e => e.type === "currency" && e.group === root._id).count, 50);
  assert.equal(gear.find(e => e.type === "currency" && e.group !== root._id).count, gold);
  assert.equal(b.system.wealth, "", "50 зм не дублируются третьим вариантом");
  for (const assignments of [Object.fromEntries(allowed.map(a => [a, 1])), ...allowed.flatMap(a => allowed.filter(b => b !== a).map(b => ({ [a]: 2, [b]: 1 })))]) {
    const actor = { system: { abilities: Object.fromEntries(Object.keys(asiData.configuration.fixed).map(a => [a, { value: a === allowed[0] ? 19 : 10, max: 20 }])) },
      updateSource(updates) { for (const [p, v] of Object.entries(updates)) set(this, p, v); this.system._source.abilities = clone(this.system.abilities); } };
    actor.system._source = { abilities: clone(actor.system.abilities) }; actor.system.toObject = () => ({ abilities: clone(actor.system.abilities) });
    const before = clone(actor.system.abilities), asi = Object.assign(new NativeAlchemistASI(), clone(asiData), { actor, item: b, allowFeat: false,
      canImprove: () => true, updateSource({ value }) { this.value = value; }, toObject() { return { configuration: clone(this.configuration) }; } });
    asi.value = { toObject() { return {}; } };
    await asi.apply(0, { type: "asi", assignments });
    for (const a of Object.keys(before)) assert.equal(actor.system.abilities[a].value, Math.min(20, before[a].value + (assignments[a] ?? 0)));
    asi.value.toObject = () => ({ assignments: clone(asi.value.assignments), type: asi.value.type });
    await asi.reverse(0); assert.deepEqual(actor.system.abilities, before, "штатная отмена не затрагивает чужие характеристики");
  }
}
const choice = id => doc(`background:au-${id}`).system.advancement.find(a => a.title === "Владения предыстории").configuration.choices;
assert.deepEqual(choice("familiar-trainer"), [{ count: 1, pool: ["tool:game:*"] }]);
assert.deepEqual(choice("cosmic-dawn-subject"), [{ count: 1, pool: ["tool:art:*"] }]);
for (const id of ["familiar-trainer", "cosmic-dawn-subject"]) assert.equal(doc(`background:au-${id}`).system.startingEquipment.find(e => e.type === "tool").requiresProficiency, true);
assert.equal(doc("background:au-phantasmagoria-performer").system.startingEquipment.find(e => e.type === "tool").requiresProficiency, false);
for (const [id, uuid, quantity] of [["warding-hands-ward", "phbagOil00000000", 3], ["seer-apprentice", "phbagCandle00000", 8],
  ["seer-apprentice", "phbagParchment00", 9], ["horizon-weavers-initiate", "phbamoArrows0000", 20]]) {
  assert.equal(doc(`background:au-${id}`).system.startingEquipment.find(e => e.key?.endsWith(uuid))?.count, quantity);
}

const friend = clone(doc("feat:familiar-friend")), free = Object.values(friend.system.activities).find(a => a.type === "cast");
assert.equal(free.spell.uuid, "Compendium.dnd5e.spells24.Item.phbsplFindFamili"); assert.deepEqual(free.spell.properties, ["material"]);
assert.equal(free.consumption.spellSlot, false); assert.equal(free.uses.max, "1"); assert.equal(free.uses.recovery[0].period, "lr");
for (const ability of ["int", "wis", "cha", "dex", ""]) {
  const updates = []; friend.system.advancement[0].value.ability = ability;
  const result = prepareOriginGrantedAbility({ ...free, item: friend, updateSource: u => updates.push(u) });
  assert.equal(result, ["int", "wis", "cha"].includes(ability) ? undefined : false);
  assert.deepEqual(updates, ["int", "wis", "cha"].includes(ability) ? [{ "spell.ability": ability }] : []);
}
const portal = doc("feat:portal-hopper"), step = Object.values(portal.system.activities)[0];
assert.equal(step.type, "teleport"); assert.equal(step.teleport.value, "15"); assert.equal(step.uses.max, "@prof");
assert.deepEqual(portal.system.advancement[0].configuration.choices[0].pool, ["dr:necrotic", "dr:radiant", "dr:psychic"]);
const combat = { id: "battle", started: true, round: 1, turn: 0 }, turnActor = { uuid: "Actor.pc", flags: {} }, turnUpdates = { actor: {} };
const turnStep = { ...step, id: step._id, actor: turnActor, item: { id: portal._id } };
assert.equal(applyTurnLimit(turnStep, {}, {}, turnUpdates, combat), undefined); Object.entries(turnUpdates.actor).forEach(([p, v]) => set(turnActor, p, v));
assert.equal(applyTurnLimit(turnStep, {}, {}, { actor: {} }, combat), false); combat.turn++;
assert.equal(applyTurnLimit(turnStep, {}, {}, { actor: {} }, combat), undefined);
const dodge = doc("feat:arcane-infiltrator"); assert.equal(dodge.effects[0].duration.expiry, "sourceStart"); assert.deepEqual(dodge.effects[0].statuses, ["dodging"]);
assert.equal(Object.values(dodge.system.activities)[0].activation.type, "bonus");
assert.equal(spells.find(s => s._id === dodge.system.advancement[0].configuration.items[0].uuid.split(".").at(-1)).system.identifier, "friends");

const collection = values => Object.assign(values, { get(id) { return this.find(v => v.id === id); } });
const use = Object.values(friend.system.activities).find(a => a.flags?.spikependium?.familiarHelp);
friend.id = friend._id; friend.uuid = `Actor.pc.Item.${friend.id}`;
const pc = { uuid: "Actor.pc", isOwner: true, items: collection([friend]), flags: {}, system: { details: { level: 5 }, skills: { arc: { value: 1 }, his: { value: 0 } } } };
friend.actor = pc;
Object.assign(use, { id: use._id, uuid: `${friend.uuid}.Activity.${use._id}`, actor: pc, item: friend });
const spent = { spent: 0, max: "@prof", get value() { return 3 - this.spent; } }; use.uses = spent;
friend.system.activities = collection(Object.values(friend.system.activities));
const familiarSpell = { uuid: "Actor.pc.Item.familiar", type: "spell", actor: pc, system: { identifier: "find-familiar" } };
const summon = { uuid: `${familiarSpell.uuid}.Activity.summon`, type: "summon", actor: pc, item: familiarSpell };
const world = new Map([[familiarSpell.uuid, familiarSpell]]); globalThis.fromUuidSync = uuid => world.get(uuid);
const grid = { units: "ft", getCenterPoint: p => p, measurePath: ([a, b]) => ({ distance: Math.hypot(a.x - b.x, a.y - b.y, a.elevation - b.elevation) }) };
const scene = { grid, tokens: collection([]) };
const token = (id, actor, x = 0) => ({ uuid: `Scene.scene.Token.${id}`, actor, parent: scene, name: id, elevation: 0, x,
  getOccupiedGridSpaceOffsets() { return [{ x: this.x, y: 0 }]; }, getCenterPoint() { return { x: this.x, y: 0 }; } });
const casterToken = token("caster", pc);
const familiarActor = { system: { attributes: { hp: { max: 2, value: 1 } } }, flags: { dnd5e: { summon: { origin: familiarSpell.uuid } } },
  effects: [], testUserPermission: () => true };
const familiarToken = token("familiar", familiarActor, 5); scene.tokens.push(casterToken, familiarToken);
globalThis.canvas = { ready: true, scene };
globalThis.game = { user: { isGM: true, isActiveGM: true }, users: { activeGM: true }, actors: [], scenes: [scene] };
globalThis.dnd5e = { utils: { getSceneTargets: () => [casterToken], convertLength: n => n } };
const config = { actor: familiarActor, actorUpdates: { effects: [], items: [] }, tokenUpdates: {} };
prepareFamiliarToken(summon, {}, config); prepareFamiliarToken(summon, {}, config);
assert.equal(config.actorUpdates.effects.length, 1); assert.equal(config.actorUpdates.effects[0]._id.length, 16);
assert.equal(config.actorUpdates.effects[0].system.changes[0].value, "10"); assert.equal(config.actorUpdates["system.attributes.hp.value"], 11);
familiarActor.effects = [{ ...config.actorUpdates.effects[0], active: true }]; familiarActor.system.attributes.hp = { max: 12, value: 11 };
pc.system.details.level = 6;
const again = { actor: familiarActor, actorUpdates: { effects: [], items: [] } }; prepareFamiliarToken(summon, {}, again);
assert.equal(again.actorUpdates["system.attributes.hp.value"], 13, "повторный призыв повышает бонус с 10 до 12, не складывая его");
assert.equal(again.actorUpdates.effects[0]._id, config.actorUpdates.effects[0]._id);
familiarActor.classes = { sidekick: {} }; familiarActor._source = { system: { attributes: { hp: {} } } };
const classProfile = { actor: familiarActor, actorUpdates: { effects: [], items: [] } }; prepareFamiliarToken(summon, {}, classProfile);
assert.equal(classProfile.actorUpdates.effects[0].system.changes[0].key, "system.attributes.hp.bonuses.overall", "штатное поле хитов для формы с классами");
delete familiarActor.classes; delete familiarActor._source;

class Dialog { constructor(config) { this.config = config; } async _prepareConfigurationContext(c) { return c; } _buildConfig(r) { return r; } }
globalThis.CONFIG = { Dice: { D20Roll: { DefaultConfigurationDialog: Dialog } } };
globalThis.Hooks = { call: (hook, a, c) => hook !== "dnd5e.preActivityConsumption" || canUseFamiliarHelp(a, c) };
use._prepareUsageUpdates = async () => spent.value > 0 ? { activity: { "uses.spent": spent.spent + 1 } } : false;
let consumed = 0;
use.consume = (c, message) => nativeConsume.call(use, c, message, async updates => {
  const deltas = getDeltas(friend, { [`system.activities.${use.id}.uses.spent`]: updates.activity["uses.spent"] });
  spent.spent = updates.activity["uses.spent"]; consumed++;
  return { actor: [], item: { [friend.id]: deltas } };
});
function build(selected = true, disadvantage = false) {
  const config = { subject: pc, skill: "arc" }, dialog = { applicationClass: Dialog };
  prepareFamiliarCheck(config, dialog); if (selected) config.spikependium.familiarHelp = familiarToken.uuid;
  const roll = { options: { disadvantage }, _evaluated: false, async evaluate() {
    const holder = { options: this.options, validD20Roll: true, constructor: { ADV_MODE: { ADVANTAGE: 1, DISADVANTAGE: -1, NORMAL: 0 } },
      d20: { options: {}, applyFlag() {}, applyAdvantage() {}, applyRange() {} }, resetFormula() {} };
    nativeD20ConfigureModifiers.call(holder); this._evaluated = true;
  } };
  buildFamiliarCheck(config, roll); buildFamiliarCheck(config, roll);
  return { config, dialog, rolls: [roll], message: { data: { system: {} } } };
}
let h = build(); const context = await new h.dialog.applicationClass(h.config)._prepareConfigurationContext({ fields: [] });
assert.equal(context.fields[0].field.choices[familiarToken.uuid], "familiar"); assert.equal(consumed, 0, "открытие и закрытие окна бесплатны");
assert.equal(canUseFamiliarHelp(use, {}), false); assert.equal(finalizeFamiliarCheck(h.rolls, h.config), undefined);
await consumeFamiliarHelp(nativeBuildEvaluate, h.rolls, h.config, h.message); assert.equal(spent.spent, 1);
assert.equal(h.rolls[0].options.advantageMode, 1); assert.equal(h.message.data.system.deltas.item[friend.id][0].delta, 1);
await nativeRefund.call({ actor: pc }, h.message.data.system.deltas, async updates => { spent.spent = updates.item[0][`system.activities.${use.id}.uses.spent`]; });
assert.equal(spent.spent, 0, "штатная отмена карточки возвращает применение");
h = build(true, true); await consumeFamiliarHelp(nativeBuildEvaluate, h.rolls, h.config, h.message); assert.equal(h.rolls[0].options.advantageMode, 0, "помеха отменяет преимущество");
h = build(false); await consumeFamiliarHelp(nativeBuildEvaluate, h.rolls, h.config, h.message); assert.equal(spent.spent, 1);
h = build(); h.config.evaluate = false; await consumeFamiliarHelp(nativeBuildEvaluate, h.rolls, h.config, h.message); assert.equal(spent.spent, 1); assert.equal(h.rolls[0]._evaluated, false);
h = build(); h.config.spikependium.familiarHelp = "none"; buildFamiliarCheck(h.config, h.rolls[0]); assert.equal(h.rolls[0].options.advantage, undefined);
for (const mutate of [() => { familiarToken.x = 6; }, () => { familiarToken.elevation = 6; }, () => { pc.system.skills.arc.value = 0; },
  () => { familiarActor.system.attributes.hp.value = 0; }, () => { pc.isOwner = false; }, () => { spent.spent = 3; },
  () => { familiarSpell.actor = { uuid: "Actor.other" }; }]) {
  h = build(); mutate(); assert.equal(finalizeFamiliarCheck(h.rolls, h.config), false);
  await consumeFamiliarHelp(nativeBuildEvaluate, h.rolls, h.config, h.message); assert.equal(h.rolls.length, 0);
  familiarToken.x = 5; familiarToken.elevation = 0; pc.system.skills.arc.value = 1; familiarActor.system.attributes.hp.value = 11; pc.isOwner = true; spent.spent = 1; familiarSpell.actor = pc;
}
let release; const consume = use.consume; use.consume = async (...args) => { await new Promise(r => { release = r; }); return consume(...args); };
const first = build(), second = build(), running = consumeFamiliarHelp(nativeBuildEvaluate, first.rolls, first.config, first.message);
while (!release) await new Promise(r => setTimeout(r, 0));
await consumeFamiliarHelp(nativeBuildEvaluate, second.rolls, second.config, second.message); assert.equal(second.rolls.length, 0);
release(); await running; assert.equal(spent.spent, 2); use.consume = consume;
const deleted = [];
const dodger = { isOwner: true, statuses: new Set(), system: { attributes: { movement: { max: 0 } } },
  effects: [{ id: "ownDodge", flags: { spikependium: { arcanaDodge: true } } }, { id: "other", flags: {} }],
  deleteEmbeddedDocuments: async (_type, ids) => deleted.push(ids) };
game.actors = [dodger]; game.scenes = []; await cleanArcanaDodge(); assert.deepEqual(deleted, [["ownDodge"]]);
console.log("Неудержимая магия: 10 предысторий, штатные ASI/отмена, владения, комплекты/количества; 3 черты, хиты фамильяра без накопления, выбор помощника, преимущество/помеха, нативный расход/отмена, дистанция/высота, отмена окна и защита от повторного расхода: OK.");
