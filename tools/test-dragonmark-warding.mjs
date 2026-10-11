import assert from "node:assert/strict";
import fs from "node:fs";
import { prepareEffectData as nativePrepare } from "./data/dnd5e-effect-application.mjs";
import { canUseExtraTargetModifier, prepareExtraTargetDialog, captureExtraTargets, prepareExtraTargetUpdates, recordExtraTargetCast,
  extraTargetEffectChanges, applyExtraTargetCast, resumeExtraTargetCasts, endWardingOnArmor } from "../scripts/dragonmark-targets.mjs";
import { prepareResourceUpdates } from "../scripts/resources.mjs";
import { requireConduitCastingDialog } from "../scripts/conduit.mjs";

const mod = "r15h7ywiYnc99k2h";
const featData = JSON.parse(fs.readFileSync(`packs/_source/feats/${fs.readdirSync("packs/_source/feats").find(f => f.startsWith("feat-greater-warding_"))}`, "utf8"));
assert.equal(featData.system.activities[mod].uses.max, "1"); assert.equal(featData.system.activities[mod].uses.recovery[0].period, "lr");
assert.equal(featData.system.activities[mod].consumption.targets[0].type, "activityUses");

// Run the actual dnd5e 6 effect preparation method, including its source/refresh behavior.
const nativeSpell = JSON.parse(fs.readFileSync(new URL("./data/dnd5e-mage-armor.json", import.meta.url), "utf8"));
const merge = (target, source) => {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === "object" && !Array.isArray(value)) merge(target[key] ??= {}, value);
    else target[key] = structuredClone(value);
  }
  return target;
};
const set = (object, path, value) => { const parts = path.split("."); for (const part of parts.slice(0, -1)) object = object[part] ??= {}; object[parts.at(-1)] = structuredClone(value); };
const list = entries => Object.assign(entries, { get(id) { return this.find(e => e.id === id); } });
const documents = new Map(); let counter = 0, creates, updates, deletes;
globalThis.fromUuidSync = uuid => documents.get(uuid);
globalThis.ui = { notifications: { warn() {}, error() {} } };
globalThis.foundry = { utils: { mergeObject: merge, setProperty: set, randomID: () => `WARDING${String(counter++).padStart(9, "0")}` },
  data: { fields: { BooleanField: class { constructor(d) { Object.assign(this, d); } }, StringField: class { constructor(d) { Object.assign(this, d); } } } } };
globalThis.ActiveEffect = { implementation: {
  getEffectStart() { return { time: game.time.worldTime }; },
  async forApplication(changes) { return structuredClone(changes); }
} };
globalThis.dnd5e = { utils: {
  convertLength(value, from, to) { const scale = { ft: 1, m: 10 / 3 }; return value * scale[from] / scale[to]; },
  convertTime(value, units) { return { value: value * ({ seconds: 1, hour: 3600 }[units]), unit: "seconds" }; }
}, applications: { components: { EffectApplicationElement: class {
  async _prepareEffectData(effect, actor) { return nativePrepare.call(this, effect, actor, key => key); }
} } } };

function setup() {
  documents.clear(); counter = 0; creates = []; updates = []; deletes = [];
  const player = { id: "player", isGM: false }, gm = { id: "gm", isGM: true, isActiveGM: true };
  const users = list([player, gm]); users.activeGM = gm;
  const scene = { uuid: "Scene.test", flags: {}, tokens: [], canUserModify(user) { return user.isGM; },
    grid: { units: "ft", getCenterPoint(o) { return o; }, measurePath([a, b]) { return { distance: Math.hypot(a.x - b.x, a.y - b.y, a.elevation - b.elevation) }; } },
    async setFlag(module, key, value) { set(this, `flags.${module}.${key}`, value); } };
  function creature(uuid) {
    const actor = { uuid, flags: {}, effects: list([]), items: list([]), isOwner: true, armor: null, statuses: new Set(),
      system: { isCreature: true, attributes: { hp: { value: 12 } } }, testUserPermission(user) { return user.id === player.id || user.isGM; },
      async setFlag(module, key, value) { set(this, `flags.${module}.${key}`, value); },
      async createEmbeddedDocuments(type, data) {
        assert.equal(type, "ActiveEffect");
        for (const value of data) { const effect = structuredClone(value); effect.id = `effect${this.effects.length}`; effect._id = effect.id;
          effect.uuid = `${this.uuid}.ActiveEffect.${effect.id}`; effect.parent = this; this.effects.push(effect); documents.set(effect.uuid, effect);
          creates.push({ actor: this.uuid, data: structuredClone(value) }); }
      }, async updateEmbeddedDocuments(type, data) {
        assert.equal(type, "ActiveEffect");
        for (const value of data) { merge(this.effects.get(value._id), value); updates.push({ actor: this.uuid, data: structuredClone(value) }); }
      }, async deleteEmbeddedDocuments(type, ids) {
        assert.equal(type, "ActiveEffect"); deletes.push({ actor: this.uuid, ids });
        this.effects = list(this.effects.filter(e => !ids.includes(e.id)));
      }
    };
    documents.set(uuid, actor); return actor;
  }
  function token(actor, id, x) { const t = { uuid: `${scene.uuid}.Token.${id}`, name: id, actor, parent: scene, x, elevation: 0,
    getOccupiedGridSpaceOffsets() { return [{ x: this.x, y: 0 }]; } }; scene.tokens.push(t); documents.set(t.uuid, t); return t; }
  const caster = creature("Actor.caster"), primary = creature("Actor.primary"), extra = creature("Scene.test.Token.extra.Actor.extra");
  const source = token(caster, "caster", 0), first = token(primary, "primary", 5), second = token(extra, "extra", 30);
  const resource = { id: mod, uses: { spent: 0, get value() { return 1 - this.spent; } } };
  const feat = { id: featData._id, flags: structuredClone(featData.flags), system: { activities: new Map([[mod, resource]]) } };
  caster.items.push(feat);
  const item = { type: "spell", id: nativeSpell._id, uuid: `${caster.uuid}.Item.${nativeSpell._id}`, flags: {}, system: { identifier: "mage-armor" } };
  const effect = { ...structuredClone(nativeSpell.effects[0]), id: nativeSpell.effects[0]._id,
    uuid: `${item.uuid}.ActiveEffect.${nativeSpell.effects[0]._id}`, inCompendium: false,
    constructor: ActiveEffect.implementation, toObject() { return structuredClone(nativeSpell.effects[0]); } };
  const activity = { id: "dnd5eactivity000", uuid: `${item.uuid}.Activity.dnd5eactivity000`, actor: caster, item, flags: {}, consumption: { targets: [] },
    applicableEffects: [effect], effects: [{ _id: effect.id }], duration: { getEffectData: () => ({ value: 8, units: "hour" }) },
    getUsageToken() { return source; }, getAppliedEffectChanges(e, options) { return extraTargetEffectChanges.call(this, () => ({}), e, options); } };
  globalThis.canvas = { ready: true, scene };
  globalThis.game = { user: gm, users, actors: [caster, primary], scenes: [scene], messages: [], time: { worldTime: 100 }, combat: null };
  game.user.targets = new Set([first, second]);
  documents.set(scene.uuid, scene); documents.set(activity.uuid, activity); documents.set(item.uuid, item);
  const config = { spikependium: { improvedWarding: true, wardingPrimary: first.uuid } };
  const messageConfig = { data: { system: { targets: [first, second].map(t => ({ actor: t.actor.uuid, token: t.uuid })) } } };
  return { caster, primary, extra, source, first, second, scene, activity, effect, feat, resource, config, messageConfig, player, gm };
}
const plan = () => ({ actor: {}, item: [{ _id: "spell", "system.uses.spent": 1 }], rolls: [], create: [], delete: [] });
function pay(s, data) {
  s.resource.uses.spent = data.item.find(i => i._id === s.feat.id)[`system.activities.${mod}.uses.spent`];
  for (const [key, value] of Object.entries(data.actor)) set(s.caster, key, value);
}
function cast(s) {
  assert.notEqual(captureExtraTargets(s.activity, s.config, s.messageConfig), false);
  const data = prepareExtraTargetUpdates(s.activity, s.config, plan()); assert.ok(data); pay(s, data); recordExtraTargetCast(s.activity, s.messageConfig);
  const message = { uuid: "ChatMessage.cast", type: "usage", author: s.player, flags: s.messageConfig.data.flags,
    system: { targets: s.messageConfig.data.system.targets, deltas: { item: { [s.feat.id]: [{ keyPath: `system.activities.${mod}.uses.spent`, delta: 1 }] } } },
    getAssociatedActivity: () => s.activity, getAssociatedActor: () => s.caster, getAssociatedItem: () => s.activity.item };
  game.messages.push(message); documents.set(message.uuid, message); return message;
}

let s = setup();
assert.equal(canUseExtraTargetModifier({ id: mod, item: s.feat }), false);
assert.equal(canUseExtraTargetModifier(s.activity), true);
class UsageDialog { async _prepareConsumptionContext(c) { return c; } }
const dialog = { applicationClass: UsageDialog }; prepareExtraTargetDialog(s.activity, s.config, dialog);
const application = new dialog.applicationClass(); application.config = s.config;
const context = await application._prepareConsumptionContext({ fields: [], inputs: { createCheckboxInput() {} } });
assert.deepEqual(context.fields.map(f => f.name), ["spikependium.improvedWarding", "spikependium.wardingPrimary"]);
assert.deepEqual(Object.keys(context.fields[1].field.choices), ["", s.first.uuid, s.second.uuid]);
assert.equal(requireConduitCastingDialog(() => false, s.config), true);
s.config.spikependium.improvedWarding = false;
assert.equal(prepareExtraTargetUpdates(s.activity, s.config, plan()).item.length, 1); assert.equal(s.resource.uses.spent, 0);
s = setup(); captureExtraTargets(s.activity, s.config, s.messageConfig);
const merged = await prepareResourceUpdates.call(s.activity, async () => plan(), s.config);
assert.equal(merged.item[0]["system.uses.spent"], 1); assert.equal(merged.item[1][`system.activities.${mod}.uses.spent`], 1);
assert.equal(s.resource.uses.spent, 0); recordExtraTargetCast(s.activity, s.messageConfig); assert.equal(s.messageConfig.data.flags, undefined);

for (const mutate of [
  s => { s.second.x = 31; }, s => { s.first.x = 6; }, s => { s.second.elevation = 31; },
  s => { s.second.parent = {}; }, s => { s.extra.armor = {}; }, s => { s.primary.armor = {}; },
  s => { s.extra.statuses.add("antimagic"); }, s => { s.caster.statuses.add("antimagic"); }, s => { s.caster.statuses.add("stunned"); },
  s => { s.messageConfig.data.system.targets.pop(); }, s => { s.messageConfig.data.system.targets.push(s.messageConfig.data.system.targets[0]); },
  s => { s.messageConfig.data.system.targets[1].actor = s.primary.uuid; }, s => { s.messageConfig.data.system.targets[1] = null; },
  s => { s.config.spikependium.wardingPrimary = "missing"; }, s => { s.resource.uses.spent = 1; },
  s => { s.activity.item.flags.spikependium = { storedSpell: true }; }, s => { s.activity.item.system.identifier = "shield"; },
  s => { game.users.activeGM = null; game.user = s.player; s.extra.isOwner = false; },
  s => { s.scene.canUserModify = () => true; game.user = s.player; s.primary.isOwner = false; }
]) { s = setup(); mutate(s); assert.equal(captureExtraTargets(s.activity, s.config, s.messageConfig), false); }
for (const mutate of [s => { s.extra.armor = {}; }, s => { s.first.x = 10; }, s => { s.activity.applicableEffects = []; },
  s => { s.activity.duration.getEffectData = () => ({ value: 0, units: "hour" }); }, s => { s.config.spikependium.wardingPrimary = s.second.uuid; },
  s => { s.caster.items = []; }, s => { s.resource.uses.spent = 1; }, s => { s.caster.statuses.add("stunned"); }
]) { s = setup(); captureExtraTargets(s.activity, s.config, s.messageConfig); mutate(s); assert.equal(prepareExtraTargetUpdates(s.activity, s.config, plan()), false); }

s = setup(); s.scene.grid.units = "m"; s.first.x = 1.5; s.second.x = 9;
assert.notEqual(captureExtraTargets(s.activity, s.config, s.messageConfig), false); s.second.x = 9.1;
assert.equal(captureExtraTargets(s.activity, s.config, s.messageConfig), false);
s = setup(); s.primary.shield = {}; s.extra.shield = {};
let message = cast(s); await Promise.all([applyExtraTargetCast(message), applyExtraTargetCast(message)]);
assert.equal(creates.length, 2); assert.equal(s.resource.uses.spent, 1);
for (const actor of [s.primary, s.extra]) {
  const effect = actor.effects[0]; assert.equal(effect.system.changes[0].key, "system.attributes.ac.calc"); assert.equal(effect.system.changes[0].value, "mage");
  assert.equal(effect.system.magical, true); assert.equal(effect.system.origin.activity, s.activity.uuid); assert.equal(effect.system.origin.message, message.uuid);
  assert.equal(effect.system.origin.profile, s.effect.id); assert.equal(effect._stats.duplicateSource, s.effect.uuid);
  assert.equal(effect.duration.value, 28800); assert.equal(effect.duration.units, "seconds"); assert.equal(effect.start.time, 100);
  assert.equal(effect.flags.dnd5e.dependentOn, undefined); assert.equal(effect.flags.spikependium.improvedWarding.id, message.flags.spikependium.wardingCast.id);
}
await resumeExtraTargetCasts(); assert.equal(creates.length, 2);
s.extra.armor = {}; await endWardingOnArmor(s.extra); assert.equal(s.extra.effects.length, 0); assert.equal(s.primary.effects.length, 1);
s.extra.armor = null; await applyExtraTargetCast(message); assert.equal(s.extra.effects.length, 0);
assert.throws(() => s.activity.getAppliedEffectChanges(s.effect, { chatMessage: message, target: s.extra }), /Доспехи мага/);

// Refresh the native effect instead of adding a second armor calculation.
s = setup(); const previous = structuredClone(nativeSpell.effects[0]); previous.id = "existing"; previous._id = "existing";
previous._stats.duplicateSource = s.effect.uuid; previous.disabled = true; s.extra.effects.push(previous);
message = cast(s); await applyExtraTargetCast(message);
assert.equal(s.extra.effects.length, 1); assert.equal(s.extra.effects[0].disabled, false); assert.equal(updates.length, 1);
assert.equal(s.extra.effects[0].start.time, 100); assert.equal(s.extra.effects[0].duration.value, 28800);

// Partially applied casts resume without recreating the first effect or moving their start time.
s = setup(); message = cast(s); const originalCreate = s.extra.createEmbeddedDocuments;
s.extra.createEmbeddedDocuments = async () => { throw Error("write failed"); };
await assert.rejects(applyExtraTargetCast(message), /write failed/); assert.equal(creates.length, 1);
game.time.worldTime = 110; s.extra.createEmbeddedDocuments = originalCreate; s.second.x = 100;
await resumeExtraTargetCasts(); assert.equal(creates.length, 2); assert.equal(s.extra.effects[0].start.time, 100); assert.equal(s.resource.uses.spent, 1);
s = setup(); message = cast(s); const setScene = s.scene.setFlag;
s.scene.setFlag = async function(module, key, value) { if (key.endsWith(".done")) throw Error("progress failed"); return setScene.call(this, module, key, value); };
await assert.rejects(applyExtraTargetCast(message), /progress failed/); assert.equal(creates.length, 1);
s.primary.effects = list([]); s.scene.setFlag = setScene; await resumeExtraTargetCasts(); assert.equal(creates.length, 2); assert.equal(s.primary.effects.length, 0);
s = setup(); message = cast(s); const setActor = s.primary.setFlag;
s.primary.setFlag = async () => { throw Error("receipt failed"); };
await assert.rejects(applyExtraTargetCast(message), /receipt failed/); assert.equal(creates.length, 1);
s.primary.setFlag = setActor; await resumeExtraTargetCasts(); assert.equal(creates.length, 2);

for (const mutate of [
  (s, m) => { m.author = null; }, (s, m) => { m.author = { id: "outsider" }; }, (s, m) => { m.system.deltas = {}; },
  () => { game.time.worldTime = 101; }, s => { s.second.x = 31; }, s => { s.extra.armor = {}; },
  s => { s.scene.canUserModify = () => true; }, s => { const record = Object.values(s.caster.flags.spikependium.wardingCasts)[0]; record.seconds++; }
]) { s = setup(); message = cast(s); mutate(s, message); await applyExtraTargetCast(message); assert.equal(creates.length, 0); }

s = setup(); game.user = s.player; game.users.activeGM = null; message = cast(s); await applyExtraTargetCast(message);
assert.equal(creates.length, 2); assert.equal(s.scene.flags.spikependium, undefined);
assert.equal(Object.values(s.caster.flags.spikependium.wardingCasts)[0].completed, true); await resumeExtraTargetCasts(); assert.equal(creates.length, 2);
s.extra.armor = {}; await endWardingOnArmor(s.extra); assert.equal(s.extra.effects.length, 0);
s = setup(); game.user = s.player; game.users.activeGM = null; message = cast(s);
const localCreate = s.extra.createEmbeddedDocuments; s.extra.createEmbeddedDocuments = async () => { throw Error("local failed"); };
await assert.rejects(applyExtraTargetCast(message), /local failed/); assert.equal(creates.length, 1);
game.users.activeGM = s.gm; game.user = s.gm; s.extra.createEmbeddedDocuments = localCreate; await resumeExtraTargetCasts(); assert.equal(creates.length, 1);
game.user = s.player; game.time.worldTime = 110; await resumeExtraTargetCasts(); assert.equal(creates.length, 2); assert.equal(s.extra.effects[0].start.time, 100);

s = setup(); s.caster.classes = { artificer: { system: { levels: 5 } } };
s.primary.flags = { spikependium: { key: "actor:reanimated-companion:conduit" }, dnd5e: { summon: { origin: "Item.owner" } } };
documents.set("Item.owner", { actor: s.caster }); s.first.x = 100; s.second.x = 130;
s.activity.item.flags.spikependium = { conduitCasting: { owner: s.caster.uuid, companion: s.first.uuid } };
s.activity.getUsageToken = () => s.first; message = cast(s); await applyExtraTargetCast(message); assert.equal(creates.length, 2);

const main = fs.readFileSync("scripts/spikependium.mjs", "utf8");
for (const [hook, handler] of [["dnd5e.preUseActivity", "canUseExtraTargetModifier"], ["dnd5e.preActivityConsumption", "captureExtraTargets"],
  ["dnd5e.preCreateUsageMessage", "recordExtraTargetCast"], ["updateActor", "checkWardingArmor"]]) assert.ok(main.includes(`Hooks.on("${hook}", ${handler})`));
assert.ok(main.includes("prepareExtraTargetDialog(activity, config, dialog)")); assert.ok(main.includes("extraTargetEffectChanges.call(this"));
s = setup(); message = cast(s); canvas.ready = false; canvas.scene = null;
await applyExtraTargetCast(message); assert.equal(creates.length, 2, "GM can process the protected casting scene while viewing another scene");
s = setup(); s.config.spikependium.wardingPrimary = s.source.uuid;
s.messageConfig.data.system.targets[0] = { actor: s.caster.uuid, token: s.source.uuid };
message = cast(s); await applyExtraTargetCast(message); assert.equal(s.caster.effects.length, 1); assert.equal(s.extra.effects.length, 1);
assert.equal(s.primary.effects.length, 0);
s = setup(); message = cast(s); const createThenFail = s.extra.createEmbeddedDocuments;
s.extra.createEmbeddedDocuments = async () => { throw Error("late resume"); };
await assert.rejects(applyExtraTargetCast(message), /late resume/); game.time.worldTime = 100 + 28800;
s.extra.createEmbeddedDocuments = createThenFail; await resumeExtraTargetCasts(); assert.equal(creates.length, 1);
s = setup(); game.user = s.player; game.users.activeGM = null; message = cast(s); const createLocalThenFail = s.extra.createEmbeddedDocuments;
s.extra.createEmbeddedDocuments = async () => { throw Error("late local resume"); };
await assert.rejects(applyExtraTargetCast(message), /late local resume/); game.time.worldTime = 100 + 28800;
s.extra.createEmbeddedDocuments = createLocalThenFail; await resumeExtraTargetCasts(); assert.equal(creates.length, 1);
s = setup(); message = cast(s);
Object.values(s.caster.flags.spikependium.wardingCasts)[0].started = true;
await applyExtraTargetCast(message); assert.equal(creates.length, 0, "unaccepted GM jobs cannot bypass initial validation with an owner flag");
assert.throws(() => s.activity.getAppliedEffectChanges(s.effect, { chatMessage: message, target: s.caster }), /Доспехи мага/);
message.flags.spikependium.wardingCast.id = "missing";
assert.throws(() => s.activity.getAppliedEffectChanges(s.effect, { chatMessage: message, target: s.extra }), /Доспехи мага/);
message.flags.spikependium = {};
assert.deepEqual(s.activity.getAppliedEffectChanges(s.effect, { chatMessage: message, target: s.extra }), {});
console.log("Улучшенное ограждение: две разные согласные цели, касание/30 футов/высота/метры/Проводник, совместный расход, штатная подготовка Доспехов мага без дублей, срок накладывания, надевание доспеха/щит, повтор старой карточки, NPC/ActorDelta, права, собственные цели без Мастера и продолжение частичных ошибок: OK.");
