import assert from "node:assert/strict";
import fs from "node:fs";
import { hospitalityAbility, canUseHospitalityModifier, prepareHospitalityDialog, captureHospitalityTargets,
  prepareHospitalityUpdates, recordHospitalityCast, applyHospitalityCast, resumeHospitalityCasts } from "../scripts/dragonmark-hospitality.mjs";
import { prepareResourceUpdates } from "../scripts/resources.mjs";
import { requireConduitCastingDialog } from "../scripts/conduit.mjs";

const mod = "oojjUEphFaXcEJ6Z", abilityId = "Fz3gJ2wsGQjsGvqN";
const doc = JSON.parse(fs.readFileSync(`packs/_source/feats/${fs.readdirSync("packs/_source/feats").find(f => f.startsWith("feat-greater-hospitality_"))}`, "utf8"));
const choice = doc.system.advancement.find(a => a._id === abilityId);
assert.equal(choice.type, "ItemGrant"); assert.deepEqual(choice.configuration.items, []);
assert.deepEqual(choice.configuration.spell.ability, ["int", "wis", "cha"]); assert.deepEqual(choice.value, {});
assert.equal(doc.system.activities[mod].uses.max, "1"); assert.equal(doc.system.activities[mod].uses.recovery[0].period, "lr");
const making = JSON.parse(fs.readFileSync(`packs/_source/feats/${fs.readdirSync("packs/_source/feats").find(f => f.startsWith("feat-greater-making_"))}`, "utf8"));
assert.equal(making.system.activities.XmyjP2cH9CkBmdgy.uses.max, "1");
assert.equal(making.system.activities.XmyjP2cH9CkBmdgy.uses.recovery[0].period, "lr");
assert.deepEqual(making.system.activities.XmyjP2cH9CkBmdgy.consumption.targets[0], { type: "activityUses", value: "1", target: "", scaling: {} });

const set = (object, path, value) => { const parts = path.split("."); for (const part of parts.slice(0, -1)) object = object[part] ??= {}; object[parts.at(-1)] = structuredClone(value); };
globalThis.ui = { notifications: { warn() {}, error() {} } };
globalThis.foundry = { data: { fields: { BooleanField: class { constructor(d) { Object.assign(this, d); } }, StringField: class { constructor(d) { Object.assign(this, d); } } } },
  utils: { setProperty: set, randomID: () => "AbCdEfGhIjKlMnOp" } };
globalThis.dnd5e = { utils: { convertLength(value, from, to) { const units = { ft: 1, m: 10 / 3 }; return value * units[from] / units[to]; } } };
globalThis.CONFIG = { DND5E: { abilities: { int: { label: "INT" }, wis: { label: "WIS" }, cha: { label: "CHA" } } } };
const documents = new Map(); globalThis.fromUuidSync = uuid => documents.get(uuid);
const list = entries => Object.assign(entries, { get(id) { return this.find(e => e.id === id); } });
let writes, conditionChanges;
function setup(selected = "wis") {
  documents.clear(); writes = []; conditionChanges = [];
  const player = { id: "player", isGM: false }, gm = { id: "gm", isGM: true, isActiveGM: true };
  const users = list([player, gm]); users.activeGM = gm;
  const scene = { uuid: "Scene.test", flags: {}, tokens: [], canUserModify(user) { return user.isGM; },
    grid: { units: "ft", getCenterPoint(o) { return o; }, measurePath([a, b]) { return { distance: Math.hypot(a.x - b.x, a.y - b.y, a.elevation - b.elevation) }; } },
    async setFlag(module, key, value) { set(this, `flags.${module}.${key}`, value); } };
  function creature(uuid, level = 0, temp = 0) {
    const actor = { uuid, flags: {}, effects: [], items: [], isOwner: true, statuses: new Set(),
      system: { isCreature: true, abilities: { int: { mod: 2 }, wis: { mod: 4 }, cha: { mod: 1 } }, attributes: { prof: 3, hp: { value: 12, temp }, exhaustion: level } },
      testUserPermission(user) { return user.id === player.id || user.isGM; },
      getActiveTokens() { return scene.tokens.filter(t => t.actor === this); },
      async update(data) {
        writes.push({ actor: this.uuid, data: structuredClone(data) });
        for (const [path, value] of Object.entries(data)) set(this, path, value);
        if (Object.hasOwn(data, "system.attributes.exhaustion")) {
          conditionChanges.push({ actor: this.uuid, level: data["system.attributes.exhaustion"] });
          const e = this.effects.find(e => e.system.type === "exhaustion");
          if (data["system.attributes.exhaustion"] === 0) { this.effects = this.effects.filter(i => i !== e); documents.delete(e?.uuid); }
          else if (e) e.system.level = data["system.attributes.exhaustion"];
        }
        return this;
      }, async setFlag(module, key, value) { await this.update({ [`flags.${module}.${key}`]: value }); } };
    if (level) { const e = { uuid: `${uuid}.ActiveEffect.dnd5eexhaustion`, parent: actor, type: "condition", system: { type: "exhaustion", level }, _stats: { createdTime: 123 } };
      actor.effects.push(e); documents.set(e.uuid, e); }
    documents.set(uuid, actor); return actor;
  }
  function token(actor, id, x) { const t = { uuid: `${scene.uuid}.Token.${id}`, actor, parent: scene, x, elevation: 0,
    getOccupiedGridSpaceOffsets() { return [{ x: this.x, y: 0 }]; } }; scene.tokens.push(t); documents.set(t.uuid, t); return t; }
  const caster = creature("Actor.caster", 2), target = creature("Scene.test.Token.target.Actor.target", 1, 10), other = creature("Actor.other", 0);
  const source = token(caster, "caster", 0), first = token(target, "target", 30), second = token(other, "other", 20);
  const resource = { id: mod, uses: { max: 1, spent: 0, get value() { return this.max - this.spent; } } };
  const feat = { ...structuredClone(doc), id: doc._id, flags: structuredClone(doc.flags), system: { activities: new Map([[mod, resource]]),
    advancement: [{ ...structuredClone(choice), value: selected ? { ability: selected } : {} }] } };
  caster.items = list([feat]);
  const activity = { id: "purifyActivity", uuid: "Actor.caster.Item.purify.Activity.purifyActivity", actor: caster, flags: {}, consumption: { targets: [] },
    item: { uuid: "Actor.caster.Item.purify", type: "spell", flags: {}, system: { identifier: "purify-food-and-drink" } }, getUsageToken() { return source; } };
  globalThis.canvas = { ready: true, scene, tokens: { controlled: [] } };
  globalThis.game = { user: gm, users, actors: [caster, other], scenes: [scene], messages: [], time: { worldTime: 100 }, combat: null };
  documents.set(scene.uuid, scene);
  const config = { spikependium: { improvedHospitality: true } };
  const messageConfig = { data: { system: { targets: [source, first, second].map(t => ({ token: t.uuid, actor: t.actor.uuid })) } } };
  return { caster, target, other, source, first, second, scene, feat, resource, activity, config, messageConfig, gm, player };
}
const updates = () => ({ actor: {}, item: [{ _id: "purify", "system.uses.spent": 1 }], create: [], delete: [], rolls: [] });
function pay(s, plan) {
  s.resource.uses.spent = plan.item.find(i => i._id === s.feat.id)[`system.activities.${mod}.uses.spent`];
  for (const [path, value] of Object.entries(plan.actor)) set(s.caster, path, value);
  const ability = plan.item.find(i => i._id === s.feat.id)["flags.spikependium.hospitalityAbility"];
  if (ability) set(s.feat, "flags.spikependium.hospitalityAbility", ability);
  recordHospitalityCast(s.activity, s.messageConfig);
  const msg = { id: "msg", uuid: "ChatMessage.msg", author: s.player, type: "usage", flags: s.messageConfig.data.flags,
    system: { deltas: { item: { [s.feat.id]: [{ keyPath: `system.activities.${mod}.uses.spent`, delta: 1 }] } } },
    getAssociatedActivity() { return s.activity; } };
  game.messages.push(msg); return msg;
}
function cast(s) { assert.notEqual(captureHospitalityTargets(s.activity, s.config, s.messageConfig), false);
  const plan = prepareHospitalityUpdates(s.activity, s.config, updates()); assert(plan); return pay(s, plan); }
class UsageDialog { async _prepareConsumptionContext() { return { fields: [], inputs: { createCheckboxInput() {} } }; } }
{
  const s = setup(), dialog = { applicationClass: UsageDialog, configure: false };
  const config = {}; prepareHospitalityDialog(s.activity, config, dialog); assert.equal(dialog.configure, true);
  assert.equal(requireConduitCastingDialog(() => false, config), true, "native dialog is required even without ordinary consumption");
  assert.equal(requireConduitCastingDialog(() => false, {}), false, "unrelated activities keep native behavior");
  const app = new dialog.applicationClass(); app.config = config;
  const context = await app._prepareConsumptionContext({}); assert.equal(context.fields.length, 1);
  assert.equal(context.fields[0].name, "spikependium.improvedHospitality"); assert.equal(context.fields[0].value, false);
  assert.equal(hospitalityAbility(s.feat), "wis"); assert.equal(canUseHospitalityModifier({ id: mod, item: s.feat }), false);
  assert.equal(canUseHospitalityModifier(s.activity), true); assert.equal(canUseHospitalityModifier(undefined), true);
  captureHospitalityTargets(s.activity, s.config, s.messageConfig);
  const plan = await prepareResourceUpdates.call(s.activity, async () => updates(), s.config);
  assert.equal(plan.item.length, 2); assert.equal(plan.item[0]["system.uses.spent"], 1); assert.equal(s.resource.uses.spent, 0);
  const before = {}; recordHospitalityCast(s.activity, before); assert.equal(before.data, undefined, "no marker before confirmed payment");
}
{
  const s = setup(null), dialog = { applicationClass: UsageDialog };
  prepareHospitalityDialog(s.activity, {}, dialog); const app = new dialog.applicationClass(); app.config = {};
  assert.deepEqual((await app._prepareConsumptionContext({})).fields[1].field.choices, { "": "Выберите характеристику", int: "INT", wis: "WIS", cha: "CHA" });
  captureHospitalityTargets(s.activity, s.config, s.messageConfig); assert.equal(prepareHospitalityUpdates(s.activity, s.config, updates()), false);
  s.config.spikependium.hospitalityAbility = "cha"; const plan = prepareHospitalityUpdates(s.activity, s.config, updates());
  assert.equal(plan.item[1]["flags.spikependium.hospitalityAbility"], "cha"); const msg = pay(s, plan); await applyHospitalityCast(msg);
  assert.equal(s.other.system.attributes.hp.temp, 4); assert.equal(hospitalityAbility(s.feat), "cha");
}
for (const failure of ["wrong-spell", "stored", "no-owner", "missing-feat", "spent", "invalid-ability", "changed-ability", "missing-token", "out-of-range", "antimagic"]) {
  const s = setup(); captureHospitalityTargets(s.activity, s.config, s.messageConfig);
  if (failure === "wrong-spell") s.activity.item.system.identifier = "create-food-and-water";
  if (failure === "stored") s.activity.item.flags.spikependium = { storedSpell: {} };
  if (failure === "no-owner") s.caster.isOwner = false;
  if (failure === "missing-feat") s.caster.items = [];
  if (failure === "spent") s.resource.uses.spent = 1;
  if (failure === "invalid-ability") s.feat.system.advancement[0].value.ability = "str";
  if (failure === "changed-ability") s.config.spikependium.hospitalityAbility = "int";
  if (failure === "missing-token") documents.delete(s.source.uuid);
  if (failure === "out-of-range") s.first.x = 31;
  if (failure === "antimagic") s.caster.statuses.add("antimagic");
  const plan = updates(); assert.equal(prepareHospitalityUpdates(s.activity, s.config, plan), false, failure);
  assert.equal(plan.item.length, 1); assert.deepEqual(plan.actor, {});
}
for (const failure of ["no-targets", "object", "range", "height", "scene", "target-antimagic", "dead", "unprotected", "no-GM-unowned"]) {
  const s = setup();
  if (failure === "no-targets") s.messageConfig.data.system.targets = [];
  if (failure === "object") s.target.system.isCreature = false;
  if (failure === "range") s.first.x = 31;
  if (failure === "height") s.first.elevation = 20;
  if (failure === "scene") s.first.parent = {};
  if (failure === "target-antimagic") s.target.statuses.add("antimagic");
  if (failure === "dead") s.target.statuses.add("dead");
  if (failure === "unprotected") { s.scene.canUserModify = () => true; game.user = s.player; s.target.isOwner = false; }
  if (failure === "no-GM-unowned") { game.users.activeGM = undefined; game.user = s.player; s.target.isOwner = false; }
  assert.equal(captureHospitalityTargets(s.activity, s.config, s.messageConfig), false, failure);
}
{
  const s = setup(), msg = cast(s); s.target.statuses.add("dead");
  await applyHospitalityCast(msg); assert.equal(conditionChanges.length, 0, "no deferred revival of a creature that died before processing");
}
{
  const s = setup(); s.caster.classes = { artificer: { system: { levels: 5 } } };
  s.other.flags = { spikependium: { key: "actor:reanimated-companion:conduit" }, dnd5e: { summon: { origin: "Actor.caster.Item.conduit" } } };
  documents.set("Actor.caster.Item.conduit", { actor: s.caster });
  s.activity.item.flags.spikependium = { conduitCasting: { owner: s.caster.uuid, companion: s.second.uuid } };
  s.second.x = 100; s.first.x = 120; s.activity.getUsageToken = () => s.second;
  s.messageConfig.data.system.targets = [{ token: s.first.uuid, actor: s.target.uuid }];
  const msg = cast(s); await applyHospitalityCast(msg); assert.equal(s.target.system.attributes.exhaustion, 0, "uses selected conduit space and native owner relation");
}
{
  const s = setup(); s.scene.grid.units = "m"; s.first.x = 9; s.second.x = 6;
  assert.notEqual(captureHospitalityTargets(s.activity, s.config, s.messageConfig), false, "native metric conversion");
  s.first.x = 9.1; assert.equal(captureHospitalityTargets(s.activity, s.config, s.messageConfig), false);
  s.scene.grid.units = "ft"; s.first.x = 0; s.first.elevation = 30;
  assert.notEqual(captureHospitalityTargets(s.activity, s.config, s.messageConfig), false, "vertical distance boundary");
  s.first.elevation = 31; assert.equal(captureHospitalityTargets(s.activity, s.config, s.messageConfig), false);
}
{
  const s = setup(), msg = cast(s); await Promise.all([applyHospitalityCast(msg), applyHospitalityCast(msg)]);
  assert.deepEqual(conditionChanges, [{ actor: s.caster.uuid, level: 1 }, { actor: s.target.uuid, level: 0 }]);
  assert.equal(s.target.effects.length, 0); assert.equal(s.target.system.attributes.hp.temp, 10, "higher existing temp HP preserved");
  assert.equal(s.other.system.attributes.hp.temp, 7); assert.equal(s.other.system.attributes.hp.value, 12);
  assert.equal(s.scene.flags.spikependium.hospitality.AbCdEfGhIjKlMnOp.state, "done");
  await resumeHospitalityCasts(); assert.equal(conditionChanges.length, 2);
  s.target.system.attributes.exhaustion = 1; await applyHospitalityCast(msg); assert.equal(s.target.system.attributes.exhaustion, 1, "same card cannot remove new exhaustion");
}
{
  const s = setup(), msg = cast(s); const update = s.other.update.bind(s.other); let fail = true;
  s.other.update = async data => { if (fail) { fail = false; throw Error("write failure"); } return update(data); };
  await assert.rejects(applyHospitalityCast(msg)); assert.equal(conditionChanges.length, 2);
  await resumeHospitalityCasts(); assert.equal(s.other.system.attributes.hp.temp, 7); assert.equal(conditionChanges.length, 2, "successful targets aren't processed again");
}
{
  const s = setup(), msg = cast(s); const setFlag = s.scene.setFlag.bind(s.scene); let fail = true;
  s.scene.setFlag = async (...args) => { if (fail && args[1].endsWith(".done")) { fail = false; throw Error("progress failure"); } return setFlag(...args); };
  await assert.rejects(applyHospitalityCast(msg)); assert.equal(conditionChanges.length, 1);
  await resumeHospitalityCasts(); assert.equal(conditionChanges.length, 2, "atomic target receipt prevents a repeat after progress write failure");
}
for (const failure of ["no-author", "wrong-author", "no-delta", "old-time", "inflated-amount", "wrong-ability", "unprotected", "target-moved"]) {
  const s = setup(), msg = cast(s), record = s.caster.flags.spikependium.hospitalityCasts.AbCdEfGhIjKlMnOp;
  if (failure === "no-author") delete msg.author;
  if (failure === "wrong-author") msg.author = { id: "outsider" };
  if (failure === "no-delta") delete msg.system.deltas;
  if (failure === "old-time") game.time.worldTime++;
  if (failure === "inflated-amount") record.amount = 99;
  if (failure === "wrong-ability") record.ability = "str";
  if (failure === "unprotected") s.scene.canUserModify = () => true;
  if (failure === "target-moved") s.first.x = 31;
  await applyHospitalityCast(msg); assert.equal(writes.length, 0, failure); assert.equal(s.scene.flags.spikependium?.hospitality, undefined);
}
{
  const s = setup(), msg = cast(s); s.target.effects[0]._stats.createdTime++;
  await applyHospitalityCast(msg); assert.equal(s.target.system.attributes.exhaustion, 1, "does not cure a replacement exhaustion condition");
  assert.equal(s.target.system.attributes.hp.temp, 10);
}
{
  const s = setup(); game.user = s.player; game.users.activeGM = undefined; const msg = cast(s);
  await applyHospitalityCast(msg); assert.equal(s.other.system.attributes.hp.temp, 7); assert.equal(conditionChanges.length, 2);
  await applyHospitalityCast(msg); assert.equal(conditionChanges.length, 2); assert.equal(s.caster.flags.spikependium.hospitalityCasts.AbCdEfGhIjKlMnOp.completed, true);
}
{
  const s = setup(); game.user = s.player; game.users.activeGM = undefined; const msg = cast(s);
  const update = s.other.update.bind(s.other); let fail = true;
  s.other.update = async data => { if (fail) { fail = false; throw Error("owner write failure"); } return update(data); };
  await assert.rejects(applyHospitalityCast(msg)); assert.equal(conditionChanges.length, 2);
  game.users.activeGM = s.gm; game.user = s.gm; await applyHospitalityCast(msg);
  assert.equal(s.other.system.attributes.hp.temp, 0, "GM doesn't race a cast being processed by its owner");
  game.user = s.player; await resumeHospitalityCasts(); assert.equal(s.other.system.attributes.hp.temp, 7);
  assert.equal(conditionChanges.length, 2, "owner resumes its own local job after a GM joins");
}
const hooks = new Map(); globalThis.Hooks = { on(name, fn) { const callbacks = hooks.get(name) ?? []; callbacks.push(fn); hooks.set(name, callbacks); }, once() {} };
await import("../scripts/spikependium.mjs");
for (const [name, fn] of [["dnd5e.preUseActivity", canUseHospitalityModifier], ["dnd5e.preActivityConsumption", canUseHospitalityModifier],
  ["dnd5e.preActivityConsumption", captureHospitalityTargets], ["dnd5e.preCreateUsageMessage", recordHospitalityCast]]) assert(hooks.get(name).includes(fn));
console.log("Улучшенное радушие: нативный выбор характеристики при добавлении черты и совместный расход при накладывании, старые черты с выбором один раз, 30 футов/метры/высота, временные хиты без сложения и снижение нативного истощения, выбранные цели/сам заклинатель/NPC/ActorDelta, оплата, права, защищённые квитанции, повторы/конкурентные карточки, продолжение частичных ошибок и работа на собственных целях без Мастера: OK.");
