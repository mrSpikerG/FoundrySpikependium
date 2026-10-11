import assert from "node:assert/strict";
import fs from "node:fs";
import { prepareEffectData } from "./data/dnd5e-effect-application.mjs";
import { canUseExtraTargetModifier, prepareExtraTargetDialog, captureExtraTargets, prepareExtraTargetUpdates, prepareExtraTargetConcentration,
  recordExtraTargetCast, extraTargetEffectChanges, applyExtraTargetCast, resumeExtraTargetCasts } from "../scripts/dragonmark-targets.mjs";
import { captureShadowSpell, recordShadowSpell, prepareShadowAttack, finalizeShadowAttack, finishShadowAttack,
  applyShadowEndingMessage, recordShadowDamage, finishShadowDamage, prepareShadowConcentrationDelete, endShadowConcentration, resumeShadowEndings } from "../scripts/dragonmark-shadow.mjs";

const mod = "cF798UTeYY6jOIDZ", native = JSON.parse(fs.readFileSync("tools/data/dnd5e-invisibility.json", "utf8"));
const featData = JSON.parse(fs.readFileSync(`packs/_source/feats/${fs.readdirSync("packs/_source/feats").find(f => f.startsWith("feat-greater-shadow_"))}`, "utf8"));
assert.equal(featData.system.activities[mod].uses.max, "1"); assert.equal(featData.system.activities[mod].uses.recovery[0].period, "lr");
const documents = new Map(); let serial = 0, writes = [];
const list = a => Object.assign(a, { get(id) { return this.find(e => e.id === id); } });
const set = (object, path, value) => { const parts = path.split("."); for (const part of parts.slice(0, -1)) object = object[part] ??= {}; object[parts.at(-1)] = structuredClone(value); };
const merge = (object, data) => { for (const [key, value] of Object.entries(data)) {
  if (value && typeof value === "object" && !Array.isArray(value)) merge(object[key] ??= {}, value); else object[key] = structuredClone(value);
} return object; };
globalThis.fromUuidSync = uuid => documents.get(uuid);
globalThis.ui = { notifications: { warn() {}, error() {} } };
globalThis.foundry = { utils: { randomID: () => `SHADOW${String(serial++).padStart(10, "0")}`, setProperty: set, mergeObject: merge },
  data: { fields: { BooleanField: class { constructor(d) { Object.assign(this, d); } }, StringField: class { constructor(d) { Object.assign(this, d); } } } } };
globalThis.ActiveEffect = { implementation: { getEffectStart() { return { time: game.time.worldTime }; }, async forApplication(c) { return structuredClone(c); } } };
globalThis.dnd5e = { utils: { convertLength(value, from, to) { const units = { ft: 1, m: 10 / 3 }; return value * units[from] / units[to]; },
  convertTime(value, units) { return { value: value * ({ hour: 3600, seconds: 1 }[units]), unit: "seconds" }; } },
  applications: { components: { EffectApplicationElement: class {
    async _prepareEffectData(effect, actor) { return prepareEffectData.call(this, effect, actor, k => k); }
  } } } };

function setup(level = 2) {
  documents.clear(); serial = 0; writes = [];
  const player = { id: "player", isGM: false }, otherPlayer = { id: "other", isGM: false }, gm = { id: "gm", isGM: true, isActiveGM: true };
  const users = list([player, otherPlayer, gm]); users.activeGM = gm;
  const creatures = [];
  const scene = { uuid: "Scene.test", flags: {}, tokens: [], canUserModify(user) { return user.isGM; },
    grid: { units: "ft", getCenterPoint(o) { return o; }, measurePath([a, b]) { return { distance: Math.hypot(a.x - b.x, a.y - b.y, a.elevation - b.elevation) }; } },
    async setFlag(module, key, value) { set(this, `flags.${module}.${key}`, value); } };
  function effect(actor, data, id = foundry.utils.randomID()) {
    const e = { ...structuredClone(data), id, _id: id, uuid: `${actor.uuid}.ActiveEffect.${id}`, parent: actor, documentName: "ActiveEffect",
      statuses: new Set(data.statuses ?? []), flags: structuredClone(data.flags ?? {}), duration: structuredClone(data.duration ?? {}),
      get isOwner() { return actor.isOwner; },
      get active() { return !this.disabled && !this.duration.expired && (this.system.magical !== true || !actor.statuses.has("antimagic")); },
      getDependents() { return creatures.flatMap(a => a.effects).filter(child => child.flags.dnd5e?.dependentOn === this.uuid); },
      async delete() { return prepareShadowConcentrationDelete.call(this, async () => {
        if (!game.users.activeGM && this.getDependents().length) return false;
        await actor.deleteEmbeddedDocuments("ActiveEffect", [this.id]); return this;
      }); }
    };
    actor.effects.push(e); documents.set(e.uuid, e); return e;
  }
  function creature(uuid) {
    const actor = { uuid, isOwner: true, owners: [player.id], flags: {}, effects: list([]), items: list([]), armor: null, statuses: new Set(),
      system: { isCreature: true, attributes: { hp: { value: 12 } } },
      testUserPermission(user) { return !!user && (user.isGM || this.owners.includes(user.id)); },
      async setFlag(module, key, value) { assert.ok(this.isOwner); set(this, `flags.${module}.${key}`, value); },
      async createEmbeddedDocuments(type, data) { assert.equal(type, "ActiveEffect"); for (const d of data) { effect(this, d); writes.push({ actor: this.uuid, action: "create", data: structuredClone(d) }); } },
      async updateEmbeddedDocuments(type, data) { assert.equal(type, "ActiveEffect"); for (const d of data) { merge(this.effects.get(d._id), d); writes.push({ actor: this.uuid, action: "update", data: structuredClone(d) }); } },
      async deleteEmbeddedDocuments(type, ids) {
        assert.equal(type, "ActiveEffect"); const remove = this.effects.filter(e => ids.includes(e.id));
        if (game.user.isActiveGM) for (const e of remove) for (const child of e.getDependents()) await child.parent.deleteEmbeddedDocuments(type, [child.id]);
        for (const e of remove) documents.delete(e.uuid); this.effects = list(this.effects.filter(e => !ids.includes(e.id)));
        writes.push({ actor: this.uuid, action: "delete", ids });
      }
    };
    creatures.push(actor); documents.set(uuid, actor); return actor;
  }
  function token(actor, id, x = 5) { const t = { uuid: `${scene.uuid}.Token.${id}`, name: id, actor, parent: scene, x, elevation: 0,
    getOccupiedGridSpaceOffsets() { return [{ x: this.x, y: 0 }]; } }; scene.tokens.push(t); documents.set(t.uuid, t); return t; }
  const caster = creature("Actor.caster"), first = creature("Actor.first"), extra = creature("Scene.test.Token.extra.Actor.extra"), victim = creature("Actor.victim");
  const source = token(caster, "caster", 0), primary = token(first, "first"), additional = token(extra, "extra");
  const resource = { uses: { spent: 0, get value() { return 1 - this.spent; } } };
  const feat = { id: featData._id, flags: structuredClone(featData.flags), system: { activities: new Map([[mod, resource]]) } }; caster.items.push(feat);
  const item = { type: "spell", uuid: `${caster.uuid}.Item.${native._id}`, flags: {}, system: { identifier: "invisibility", level } };
  const profile = { ...structuredClone(native.effects[0]), id: native.effects[0]._id, uuid: `${item.uuid}.ActiveEffect.${native.effects[0]._id}`,
    constructor: ActiveEffect.implementation, toObject() { return structuredClone(native.effects[0]); } };
  const activity = { actor: caster, item, id: "dnd5eactivity000", uuid: `${item.uuid}.Activity.dnd5eactivity000`, applicableEffects: [profile],
    effects: [{ _id: profile.id }], target: { affects: { count: level - 1 } }, duration: { getEffectData: () => ({ value: 1, units: "hour" }) },
    getUsageToken() { return source; }, getAppliedEffectChanges(e, o) { return extraTargetEffectChanges.call(this, () => ({}), e, o); } };
  globalThis.game = { user: gm, users, actors: creatures, scenes: [scene], messages: [], time: { worldTime: 100 }, combat: null };
  gm.targets = new Set([primary, additional]); globalThis.canvas = { ready: true, scene }; documents.set(scene.uuid, scene);
  const config = { concentration: { begin: true }, spikependium: { improvedShadow: true, shadowExtra: additional.uuid } };
  const messageConfig = { data: { system: { targets: [primary, additional].map(t => ({ actor: t.actor.uuid, token: t.uuid })) } } };
  return { caster, first, extra, victim, source, primary, additional, scene, activity, profile, feat, resource, config, messageConfig, player, otherPlayer, gm, creature, token, effect };
}
const plan = () => ({ actor: {}, item: [{ _id: "spell", "system.uses.spent": 1 }], rolls: [], create: [], delete: [] });
function cast(s) {
  assert.notEqual(captureExtraTargets(s.activity, s.config, s.messageConfig), false);
  const data = prepareExtraTargetUpdates(s.activity, s.config, plan()); assert.ok(data);
  s.resource.uses.spent = data.item.find(i => i._id === s.feat.id)[`system.activities.${mod}.uses.spent`];
  for (const [path, value] of Object.entries(data.actor)) set(s.caster, path, value);
  const conctData = { type: "condition", system: { type: "concentrating" }, duration: { value: 3600, units: "seconds", remaining: 3600 }, flags: {} };
  prepareExtraTargetConcentration(s.caster, s.activity.item, conctData, s.activity);
  for (const key of Object.keys(conctData).filter(k => k.startsWith("flags."))) { set(conctData, key, conctData[key]); delete conctData[key]; }
  const conct = s.effect(s.caster, conctData, "concentration"); s.messageConfig.data.system.concentration = conct.id;
  recordExtraTargetCast(s.activity, s.messageConfig);
  const message = { uuid: "ChatMessage.cast", type: "usage", author: s.player, flags: s.messageConfig.data.flags,
    system: { ...s.messageConfig.data.system, deltas: { item: { [s.feat.id]: [{ keyPath: `system.activities.${mod}.uses.spent`, delta: 1 }] } } },
    getAssociatedActivity: () => s.activity, getAssociatedItem: () => s.activity.item, getAssociatedActor: () => s.caster };
  game.messages.push(message); documents.set(message.uuid, message); return { message, conct };
}
let s = setup(); assert.equal(canUseExtraTargetModifier({ id: mod, item: s.feat }), false);
class Dialog { async _prepareConsumptionContext(c) { return c; } }
const dialog = { applicationClass: Dialog }; prepareExtraTargetDialog(s.activity, s.config, dialog);
const app = new dialog.applicationClass(); app.config = s.config;
const context = await app._prepareConsumptionContext({ fields: [], inputs: { createCheckboxInput() {} } });
assert.deepEqual(context.fields.map(f => f.name), ["spikependium.improvedShadow", "spikependium.shadowExtra"]);
s.config.spikependium.improvedShadow = false; assert.equal(prepareExtraTargetUpdates(s.activity, s.config, plan()).item.length, 1);
for (const mutate of [s => { s.additional.x = 6; }, s => { s.primary.x = 6; }, s => { s.additional.elevation = 6; },
  s => { s.additional.parent = {}; }, s => { s.messageConfig.data.system.targets.pop(); }, s => { s.messageConfig.data.system.targets[1].actor = s.first.uuid; },
  s => { s.resource.uses.spent = 1; }, s => { s.caster.statuses.add("antimagic"); }, s => { s.caster.statuses.add("stunned"); },
  s => { s.activity.item.flags.spikependium = { storedSpell: true }; }, s => { s.config.spikependium.shadowExtra = "missing"; },
  s => { game.users.activeGM = null; s.extra.isOwner = false; }
]) { s = setup(); mutate(s); assert.equal(captureExtraTargets(s.activity, s.config, s.messageConfig), false); }
s = setup(); captureExtraTargets(s.activity, s.config, s.messageConfig); s.config.concentration.begin = false;
assert.equal(prepareExtraTargetUpdates(s.activity, s.config, plan()), false);
s = setup(); s.scene.grid.units = "m"; s.primary.x = s.additional.x = 1.5;
assert.notEqual(captureExtraTargets(s.activity, s.config, s.messageConfig), false); s.additional.x = 1.6;
assert.equal(captureExtraTargets(s.activity, s.config, s.messageConfig), false);
s = setup(); s.extra.armor = {}; const { message, conct } = cast(s);
await Promise.all([applyExtraTargetCast(message), applyExtraTargetCast(message)]);
for (const actor of [s.first, s.extra]) {
  const e = actor.effects[0]; assert.ok(e.statuses.has("invisible")); assert.equal(e.system.magical, true);
  assert.equal(e.flags.dnd5e.dependentOn, conct.uuid); assert.equal(e.system.origin.effect, conct.uuid);
  assert.equal(e.start.time, 100); assert.equal(e.duration.value, 3600); assert.equal(e._stats.duplicateSource, s.profile.uuid);
}
assert.equal(writes.filter(w => w.action === "create").length, 2); await resumeExtraTargetCasts(); assert.equal(s.resource.uses.spent, 1);
await conct.delete(); assert.equal(s.first.effects.length, 0); assert.equal(s.extra.effects.length, 0);
s = setup(3); const third = s.creature("Actor.third"), thirdToken = s.token(third, "third");
s.messageConfig.data.system.targets.push({ actor: third.uuid, token: thirdToken.uuid }); let casting = cast(s);
await applyExtraTargetCast(casting.message); assert.equal(writes.filter(w => w.action === "create").length, 3);
s = setup(); const fourth = s.creature("Actor.third"), fourthToken = s.token(fourth, "third");
s.messageConfig.data.system.targets.push({ actor: fourth.uuid, token: fourthToken.uuid }); assert.equal(captureExtraTargets(s.activity, s.config, s.messageConfig), false);
s = setup(); casting = cast(s); const createExtra = s.extra.createEmbeddedDocuments;
s.extra.createEmbeddedDocuments = async () => { throw Error("target failed"); };
await assert.rejects(applyExtraTargetCast(casting.message), /target failed/); assert.equal(s.first.effects.length, 1);
game.time.worldTime = 110; s.extra.createEmbeddedDocuments = createExtra; await resumeExtraTargetCasts(); assert.equal(s.extra.effects[0].start.time, 100);
s = setup(); casting = cast(s); await casting.conct.delete(); await applyExtraTargetCast(casting.message); assert.equal(s.first.effects.length, 0);
s = setup(); game.users.activeGM = null; game.user = s.player; casting = cast(s);
await applyExtraTargetCast(casting.message); assert.equal(s.first.effects.length, 1); await casting.conct.delete();
assert.equal(s.first.effects.length, 0); assert.equal(s.extra.effects.length, 0); assert.equal(s.caster.effects.length, 0);

function invisible(s, actor = s.first, id = "old") { return s.effect(actor, { type: "base", system: { magical: true }, statuses: ["invisible"],
  duration: { value: 3600, units: "seconds" }, flags: { spikependium: { improvedShadow: { id, caster: s.caster.uuid } } } }); }
function attack(s, actor = s.first, create = true) {
  const config = { subject: { actor } }, messageConfig = { create, data: {} };
  prepareShadowAttack(config, {}, messageConfig); const roll = { _evaluated: true, options: {} }; finalizeShadowAttack([roll], config);
  const msg = { type: "attack", author: s.player, flags: messageConfig.data.flags, rolls: [roll], getAssociatedActor: () => actor };
  return { config, roll, msg };
}
s = setup(); let old = invisible(s), attacking = attack(s);
await applyShadowEndingMessage(attacking.msg); assert.equal(s.first.effects.length, 0);
s = setup(); old = invisible(s); attacking = attack(s); attacking.roll._evaluated = false;
await applyShadowEndingMessage(attacking.msg); assert.equal(s.first.effects.length, 1);
s = setup(); old = invisible(s); attacking = attack(s); old.flags.spikependium.improvedShadow.id = "new";
await applyShadowEndingMessage(attacking.msg); assert.equal(s.first.effects.length, 1, "refreshing the same native effect changes the cast identity");
s = setup(); game.users.activeGM = null; game.user = s.player; old = invisible(s); attacking = attack(s, s.first, false);
await finishShadowAttack([attacking.roll], { subject: attacking.config.subject }); assert.equal(s.first.effects.length, 0);
s = setup(); old = invisible(s); attacking = attack(s, s.first, false);
await finishShadowAttack([attacking.roll], { subject: attacking.config.subject }); assert.equal(s.first.effects.length, 0);
s = setup(); old = invisible(s); attacking = attack(s); const newer = invisible(s, s.first, "new");
await applyShadowEndingMessage(attacking.msg); assert.equal(s.first.effects.length, 1); assert.equal(s.first.effects[0], newer);

function spell(s, actor = s.first, stored = false) {
  const activity = { actor, item: { type: "spell", flags: stored ? { spikependium: { storedSpell: true } } : {} } }, config = { data: {} };
  captureShadowSpell(activity); recordShadowSpell(activity, config);
  return { type: "usage", author: s.player, flags: config.data.flags ?? {}, getAssociatedActor: () => actor, getAssociatedActivity: () => activity };
}
s = setup(); old = invisible(s); let spellMessage = spell(s); await applyShadowEndingMessage(spellMessage); assert.equal(s.first.effects.length, 0);
s = setup(); old = invisible(s); spellMessage = spell(s, s.first, true); await applyShadowEndingMessage(spellMessage); assert.equal(s.first.effects.length, 1);
s = setup(); old = invisible(s); spellMessage = spell(s); old.flags.spikependium.improvedShadow.id = "new";
await applyShadowEndingMessage(spellMessage); assert.equal(s.first.effects.length, 1);

function damage(s, amount = 4, source = s.first) {
  const origin = { uuid: "ChatMessage.damage", type: "damage", author: s.player, getAssociatedActor: () => source };
  documents.set(origin.uuid, origin); const update = { "system.attributes.hp.value": 8 };
  recordShadowDamage(s.victim, amount, update, { origin, isDelta: true }); return update;
}
s = setup(); old = invisible(s); const changes = damage(s); assert.equal(s.first.effects.length, 1, "preparing damage does not end invisibility");
for (const [path, value] of Object.entries(changes)) set(s.victim, path, value);
await finishShadowDamage(s.victim); assert.equal(s.first.effects.length, 0); assert.equal(Object.values(s.victim.flags.spikependium.shadowDamage)[0].state, "done");
s = setup(); old = invisible(s); assert.equal(Object.keys(damage(s, 0)).length, 1); assert.equal(Object.keys(damage(s, -4)).length, 1);
s = setup(); old = invisible(s); const delayed = damage(s);
for (const [path, value] of Object.entries(delayed)) set(s.victim, path, value); old.flags.spikependium.improvedShadow.id = "new";
await finishShadowDamage(s.victim); assert.equal(s.first.effects.length, 1);
s = setup(); game.users.activeGM = null; game.user = s.otherPlayer; s.victim.owners = [s.otherPlayer.id]; s.first.isOwner = false;
old = invisible(s); const remote = damage(s); for (const [path, value] of Object.entries(remote)) set(s.victim, path, value);
await finishShadowDamage(s.victim); assert.equal(s.first.effects.length, 1);
game.user = s.player; s.victim.isOwner = false; s.first.isOwner = true; await finishShadowDamage(s.victim); assert.equal(s.first.effects.length, 0);
game.user = s.otherPlayer; s.victim.isOwner = true; s.first.isOwner = false; await finishShadowDamage(s.victim);
assert.equal(Object.values(s.victim.flags.spikependium.shadowDamage)[0].state, "done");

s = setup(); casting = cast(s); await applyExtraTargetCast(casting.message); await invisible(s).delete();
assert.equal(s.first.effects.length, 1, "unrelated invisibility sources survive");
casting.conct.duration.expired = true; await endShadowConcentration(s.caster); assert.equal(s.first.effects.length, 0); assert.equal(s.extra.effects.length, 0);
s = setup(); old = invisible(s); const regular = invisible(s, s.first, "regular"); old.flags.spikependium.improvedShadow.additional = true;
const unarmed = { actor: s.first, type: "save", item: { type: "weapon", system: { identifier: "unarmed-strike" }, flags: {} } }, unarmedMessageConfig = { data: {} };
captureShadowSpell(unarmed); recordShadowSpell(unarmed, unarmedMessageConfig);
await applyShadowEndingMessage({ type: "usage", author: s.player, flags: unarmedMessageConfig.data.flags,
  getAssociatedActor: () => s.first, getAssociatedActivity: () => unarmed });
assert.equal(s.first.effects.length, 1); assert.equal(s.first.effects[0], regular, "ordinary invisibility retains its attack-roll condition");
s = setup(); old = invisible(s); attacking = attack(s); const setFlag = s.first.setFlag;
s.first.setFlag = async function(module, path, value) { await setFlag.call(this, module, path, value); old.flags.spikependium.improvedShadow.id = "new"; };
await applyShadowEndingMessage(attacking.msg); assert.equal(s.first.effects.length, 1, "cast identity is rechecked after receipt writes");
s = setup(); old = invisible(s); attacking = attack(s); const remove = s.first.deleteEmbeddedDocuments;
s.first.deleteEmbeddedDocuments = async () => { throw Error("ending failed"); };
await assert.rejects(applyShadowEndingMessage(attacking.msg), /ending failed/); s.first.deleteEmbeddedDocuments = remove;
await applyShadowEndingMessage(attacking.msg); assert.equal(s.first.effects.length, 0);
s = setup(); casting = cast(s); const nativeCreate = s.first.createEmbeddedDocuments;
s.first.createEmbeddedDocuments = async function(...args) { await nativeCreate.call(this, ...args); const attackNow = attack(s); await applyShadowEndingMessage(attackNow.msg); };
await applyExtraTargetCast(casting.message); assert.equal(s.first.effects.length, 0); assert.equal(s.extra.effects.length, 1);
await resumeExtraTargetCasts(); assert.equal(s.first.effects.length, 0, "an already-ended target is not regranted after partial application");
s = setup(); casting = cast(s); await applyExtraTargetCast(casting.message); game.users.activeGM = null; game.user = s.player;
s.extra.isOwner = false; const before = writes.length; await casting.conct.delete();
assert.equal(writes.length, before); assert.equal(s.first.effects.length, 1); assert.equal(s.extra.effects.length, 1, "no-GM concentration cleanup leaves foreign targets intact");
s = setup(); game.users.activeGM = null; game.user = s.player; casting = cast(s); await applyExtraTargetCast(casting.message);
casting.conct.duration.remaining = 0; await endShadowConcentration(s.caster); assert.equal(s.extra.effects.length, 0); assert.equal(s.caster.effects.length, 0);
s = setup(); old = invisible(s); s.first.statuses.add("antimagic"); attacking = attack(s); await applyShadowEndingMessage(attacking.msg);
assert.equal(s.first.effects.length, 0, "suppression does not postpone the spell's early-ending conditions");
s = setup(); s.caster.classes = { artificer: { system: { levels: 5 } } };
s.first.flags = { spikependium: { key: "actor:reanimated-companion:conduit" }, dnd5e: { summon: { origin: "Item.conduit" } } };
documents.set("Item.conduit", { actor: s.caster }); s.primary.x = 100; s.additional.x = 105;
s.activity.item.flags.spikependium = { conduitCasting: { owner: s.caster.uuid, companion: s.primary.uuid } };
s.activity.getUsageToken = () => s.primary; casting = cast(s); canvas.ready = false; canvas.scene = null;
await applyExtraTargetCast(casting.message); assert.equal(s.first.effects.length, 1); assert.equal(s.extra.effects.length, 1);
const main = fs.readFileSync("scripts/spikependium.mjs", "utf8");
for (const [hook, fn] of [["dnd5e.preBeginConcentrating", "prepareExtraTargetConcentration"], ["dnd5e.preActivityConsumption", "captureShadowSpell"],
  ["dnd5e.preCreateUsageMessage", "recordShadowSpell"], ["dnd5e.preRollAttackV2", "prepareShadowAttack"],
  ["dnd5e.postAttackRollConfiguration", "finalizeShadowAttack"], ["dnd5e.preApplyDamage", "recordShadowDamage"]]) assert.ok(main.includes(`Hooks.on("${hook}", ${fn})`));
assert.ok(main.includes('"CONFIG.ActiveEffect.documentClass.prototype._preDelete", prepareShadowConcentrationDelete'));
console.log("Улучшенная тень: согласная дополнительная цель/5 футов/высота/метры, усиление ячейкой, общий расход, штатная невидимость и концентрация, отказ/отмена/частичные ошибки, атаки и заклинания без снятия новой невидимости, фактически применённый урон со штатным источником, отдельные листы токенов, права и собственные цели без Мастера: OK.");
