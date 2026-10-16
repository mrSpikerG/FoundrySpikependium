import fs from "node:fs";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { recordArcanaCast, guardIronExhaustion } from "../scripts/arcana-spells.mjs";
import { waveLevels, waveUse, waveSuppression, prepareWaveExhaustion, changeWaveExhaustion, syncWaveBaseCondition,
  prepareWaveDialog, captureWavePulse, prepareWaveUpdates, recordWaveConsumption, recordWaveUsage, syncWavePulse, cleanWaves, resumeWaves } from "../scripts/arcana-waves.mjs";
import { NativeWaveCondition, NativeWaveActor, nativeWaveExhaustion, nativeWaveReductions, nativeWaveRollParts, setWaveNativeContext } from "./data/dnd5e-waves-native.mjs";
import { nativePrepareMovement, setMovementContext } from "./data/dnd5e-arcana-native.mjs";
import { nativeConsume, nativeRefund, getDeltas } from "./data/dnd5e-reaction-native.mjs";
const read = pack => fs.readdirSync(`packs/_source/${pack}`).map(f => JSON.parse(fs.readFileSync(`packs/_source/${pack}/${f}`, "utf8")));
const doc = read("spells").find(d => d.flags?.spikependium?.key === "spell:au-waves-of-exhaustion");
assert.ok(doc); assert.equal(doc.name, "Волны истощения"); assert.equal(doc.system.source.page, "37"); assert.equal(doc.system.level, 5);
assert.equal(doc.system.activation.type, "bonus"); assert.equal(doc.system.duration.value, "1"); assert.ok(doc.system.properties.includes("concentration"));
const [initial, pulseData] = Object.values(doc.system.activities);
assert.equal(initial.type, "utility"); assert.equal(pulseData.type, "save"); assert.equal(pulseData.activation.type, "action");
assert.equal(pulseData.target.template.type, "cone"); assert.equal(pulseData.target.template.size, "60"); assert.equal(pulseData.target.affects.count, "");
assert.deepEqual(pulseData.save.ability, ["con"]); assert.equal(pulseData.consumption.spellSlot, false); assert.equal(pulseData.duration.concentration, false);
assert.equal(pulseData.damage.parts.length, 0); assert.equal(pulseData.effects.length, 0, "профиль добавляется обработчиком с проверкой предела");
const ruleList = read("rules").find(d => d.flags?.spikependium?.key === "journal:au-spell-lists");
assert.deepEqual(ruleList.pages.filter(p => p.system.spells.includes(`Compendium.spikependium.spells.Item.${doc._id}`)).map(p => p.system.identifier).sort(), ["sorcerer", "warlock", "wizard"]);
const clone = structuredClone, get = (o, p) => p.split(".").reduce((v, k) => v?.[k], o);
const set = (o, p, v) => { const ks = p.split("."), k = ks.pop(); ks.reduce((v, k) => v[k] ??= {}, o)[k] = v; };
const merge = (a, b) => { for (const [k, v] of Object.entries(b)) { if (k.includes(".")) set(a, k, v);
  else if (v && Object.getPrototypeOf(v) === Object.prototype) merge(a[k] ??= {}, v); else a[k] = clone(v); } return a; };
const flat = (o, p = "", out = {}) => { for (const [k, v] of Object.entries(o)) { const q = p ? `${p}.${k}` : k;
  if (v && Object.getPrototypeOf(v) === Object.prototype) flat(v, q, out); else out[q] = v; } return out; };
const list = a => Object.assign(a, { get(id) { return this.find(v => v.id === id); } });
class StatusSet extends Set { difference(other) { return new StatusSet([...this].filter(v => !other.has(v))); } reduce(fn, value) { return [...this].reduce(fn, value); } }
const id = text => crypto.createHash("sha256").update(text).digest("hex").slice(0, 16), BASE = id("dnd5eexhaustion");
let world, serial, pending, failCreate, failFlag, notices;
globalThis.fromUuidSync = uuid => world.get(uuid);
globalThis.foundry = { utils: { getProperty: get, setProperty: set, mergeObject: merge, flattenObject: flat, isEmpty: o => !o || !Object.keys(o).length,
  randomID: () => String(++serial).padStart(16, "0") }, data: { fields: { BooleanField: class {} } } };
globalThis.ui = { notifications: { warn: m => notices.push(m) } };
globalThis.ActiveEffect = { implementation: { getEffectStart: () => ({ time: game.time.worldTime }) } };
Math.clamp = (v, min, max) => Math.min(max, Math.max(min, v));
class D20 { constructor(value, dc) { this.total = value; this.options = { target: dc }; this._evaluated = true; } get isFailure() { return this.total < this.options.target; } }
globalThis.CONFIG = { Dice: { D20Roll: D20 }, DND5E: { conditionTypes: { exhaustion: { levels: 6, reduction: { rolls: 2, speed: 5 }, conditions: { 6: ["dead"] } } },
  conditionEffects: {}, movementTypes: { walk: {}, fly: {}, swim: {}, climb: {}, burrow: {} }, defaultUnits: { length: { imperial: "ft" } }, encumbrance: { speedReduction: { encumbered: {}, heavilyEncumbered: {} } } } };
const convert = (n, from, to) => from === to ? n : from === "ft" && to === "m" ? n * 0.3048 : n / 0.3048;
globalThis.dnd5e = { utils: { staticID: id, convertLength: convert } };
setMovementContext({ convertLength: convert, defaultUnits: () => "ft", simplifyBonus: n => Number(n) || 0, ConditionData: NativeWaveCondition });
const nativeDelta = NativeWaveCondition._applyDelta;
NativeWaveCondition._applyDelta = (...args) => { const task = changeWaveExhaustion(nativeDelta, ...args); pending.push(task); return task; };
setWaveNativeContext({ ActiveEffect5e: { ID: { EXHAUSTION: BASE } }, ConditionData: NativeWaveCondition });
async function flush() { while (pending.length) { const work = pending.splice(0); await Promise.all(work); } }

class Effect {
  constructor(data, parent) {
    this._source = clone(data); this.id = data._id ?? id(`effect${++serial}`); this.uuid = `${parent.uuid}.ActiveEffect.${this.id}`;
    this.parent = parent; this.actor = parent.documentName === "Actor" ? parent : parent.actor;
    this.flags = clone(data.flags ?? {}); this.duration = clone(data.duration ?? {}); this.disabled = !!data.disabled;
    this.type = data.type; this.statuses = new StatusSet(data.statuses ?? []); this.start = clone(data.start ?? {});
    this.system = data.type === "condition" ? Object.assign(new NativeWaveCondition(), clone(data.system), { parent: this }) : clone(data.system ?? {});
    world.set(this.uuid, this);
  }
  get active() { return !this.disabled && !this.duration.expired && !waveSuppression.call(this, () => false); }
  toObject() { const d = clone(this._source); d._id = this.id; return d; }
  async update(data) { merge(this, data); merge(this._source, data); this.actor.reset(); return this; }
  async delete() { await this.actor.deleteEmbeddedDocuments("ActiveEffect", [this.id]); }
}
globalThis.getDocumentClass = () => ({ fromStatusEffect: async status => ({ toObject: () => ({ type: "condition", system: { type: status, level: 1 }, statuses: [status], flags: {}, duration: {} }) }),
  create: async (data, { parent }) => (await parent.createEmbeddedDocuments("ActiveEffect", [data]))[0] });

class Actor extends NativeWaveActor {
  constructor(name, base = 0) {
    super(); this.id = name; this.uuid = `Actor.${name}`; this.documentName = "Actor"; this.isOwner = true; this.flags = {}; this.effects = list([]);
    this._source = { system: { attributes: { exhaustion: base, movement: { speeds: { walk: 30 } } } } };
    this.system = { parent: this, isCreature: true, traits: { ci: { value: new StatusSet() } }, conditions: {}, attributes: {}, abilities: { str: { value: 10 } }, _source: this._source.system };
    this.units = "ft";
    if (base) this.effects.push(new Effect({ _id: BASE, type: "condition", system: { type: "exhaustion", level: base }, statuses: ["exhaustion"], duration: {} }, this));
    world.set(this.uuid, this); this.reset();
  }
  testUserPermission(u) { return u?.isGM || u?.id === "owner"; }
  get conditionRollReductions() { return nativeWaveReductions.call(this); }
  hasConditionEffect(k) { return [...this.statuses].some(s => CONFIG.DND5E.conditionEffects[k]?.has(s)); }
  reset() {
    this._lazy = {}; this.statuses = new StatusSet(); this.system.conditions = {};
    for (const e of this.effects) if (e.active) { e.statuses.forEach(s => this.statuses.add(s)); if (e.type === "condition") this.system.conditions[e.system.type] = e.system.level; }
    prepareWaveExhaustion.call(this.system, nativeWaveExhaustion.bind(this.system));
    this.system.attributes.movement = { speeds: { walk: convert(30, "ft", this.units), fly: 0, swim: 0, climb: 0, burrow: 0 }, bonus: 0, multiplier: 1, units: this.units };
    nativePrepareMovement.call(this.system, {});
  }
  async update(data) {
    const before = this.system.attributes.exhaustion; merge(this, data); merge(this._source, data); this.reset();
    await super._onUpdateExhaustion(merge({}, data), { dnd5e: { originalExhaustion: before } }); return this;
  }
  async createEmbeddedDocuments(_type, data) {
    if (failCreate) { failCreate = false; throw Error("create"); }
    const created = data.map(d => { assert.ok(!this.effects.get(d._id), "нет повторного временного уровня"); const e = new Effect(d, this); this.effects.push(e); return e; });
    this.reset(); await syncWaveBaseCondition.call(this, super._onCreateDescendantDocuments.bind(this), this, "effects", created, data, {}, game.userId);
    return created;
  }
  async deleteEmbeddedDocuments(_type, ids) {
    const docs = this.effects.filter(e => ids.includes(e.id));
    for (const e of docs) { this.effects.splice(this.effects.indexOf(e), 1); world.delete(e.uuid); }
    this.reset(); await syncWaveBaseCondition.call(this, super._onDeleteDescendantDocuments.bind(this), this, "effects", docs, ids, {}, game.userId);
    return docs;
  }
}
class Dialog { constructor(c) { this.config = c; } async _prepareConsumptionContext(c) { return c; } }
function setup(base = 0) {
  world = new Map(); serial = 0; pending = []; failCreate = failFlag = false; notices = [];
  const gm = { id: "gm", isGM: true, isActiveGM: true }, owner = { id: "owner" }; const users = list([gm, owner]); users.activeGM = gm;
  globalThis.game = { user: gm, userId: "gm", users, time: { worldTime: 100 }, actors: [], scenes: [], messages: list([]) };
  const caster = new Actor("caster"), target = new Actor("target", base); game.actors.push(caster, target);
  const scene = { grid: { units: "ft", getCenterPoint: p => p, measurePath: ([a, b]) => ({ distance: Math.hypot(a.x - b.x, a.y - b.y, a.elevation - b.elevation) }) } };
  const token = (actor, x) => { const t = { id: actor.id, uuid: `Scene.scene.Token.${actor.id}`, parent: scene, actor, x, y: 0, elevation: 0,
    getOccupiedGridSpaceOffsets() { return [{ x: this.x, y: this.y }]; } }; world.set(t.uuid, t); return t; };
  const casterToken = token(caster, 0), targetToken = token(target, 60); scene.tokens = [casterToken, targetToken]; game.scenes = [scene];
  globalThis.canvas = { ready: true, scene }; game.user.targets = new Set([targetToken]);
  const item = { type: "spell", uuid: `${caster.uuid}.Item.spell`, actor: caster, flags: clone(doc.flags), system: clone(doc.system), toObject: () => clone(doc) };
  item.effects = list(doc.effects.map(d => new Effect(d, item)));
  const init = { ...clone(initial), uuid: `${item.uuid}.Activity.${initial._id}`, item, actor: caster, applicableEffects: [item.effects[0]] };
  const pulse = { ...clone(pulseData), uuid: `${item.uuid}.Activity.${pulseData._id}`, item, actor: caster, getUsageToken: () => casterToken,
    save: { dc: { value: 16 } } };
  function message(data) {
    const id = String(++serial).padStart(16, "0"); const card = { id, uuid: `ChatMessage.${id}`, timestamp: serial, whisper: [], blind: false, flags: {}, rolls: [], ...data,
      getAssociatedActivity: () => data.activity, getAssociatedActor: () => data.actor, getAssociatedToken: () => data.token,
      getAssociatedRolls: type => game.messages.filter(m => m.type === type && m.system.origin === id),
      getOriginatingMessage() { return game.messages.get(this.system.origin) ?? this; },
      async setFlag(module, p, value) { if (failFlag) { failFlag = false; throw Error("card update"); } set(this.flags, `${module}.${p}`, value); } };
    world.set(card.uuid, card); game.messages.push(card); return card;
  }
  const concentration = new Effect({ _id: "concentration", type: "base", duration: {}, flags: {}, system: {} }, caster); caster.effects.push(concentration);
  const initialConfig = { data: { system: { targets: [] } } }; recordArcanaCast(init, initialConfig);
  const origin = message({ ...initialConfig.data, type: "usage", activity: init, actor: caster, author: owner,
    system: { ...initialConfig.data.system, concentration: concentration.id } });
  const aura = new Effect({ ...clone(doc.effects[0]), system: { ...clone(doc.effects[0].system), origin: { message: origin.uuid } } }, caster); caster.effects.push(aura);
  const config = { spikependium: { waveCone: true } };
  globalThis.Hooks = { call: (hook, a, c, m) => {
    if (hook === "dnd5e.preActivityConsumption") return captureWavePulse(a, c, m);
    if (hook === "dnd5e.postActivityConsumption") recordWaveConsumption(a, c, m);
    return true;
  } };
  function consumeFor(a) {
    a._prepareUsageUpdates = async c => prepareWaveUpdates(a, c, { actor: {}, item: [] });
    a.consume = (c, m) => nativeConsume.call(a, c, m, async updates => { const delta = getDeltas(a.actor, updates.actor); await a.actor.update(updates.actor); return { actor: delta, item: {} }; });
  }
  consumeFor(pulse);
  function otherSource() {
    const other = new Actor("other"), otherToken = token(other, 0); game.actors.push(other); scene.tokens.push(otherToken);
    const otherItem = { ...item, uuid: `${other.uuid}.Item.spell`, actor: other };
    otherItem.effects = list(doc.effects.map(d => new Effect(d, otherItem)));
    const a = { ...init, uuid: `${otherItem.uuid}.Activity.${initial._id}`, actor: other, item: otherItem, applicableEffects: [otherItem.effects[0]] };
    const conc = new Effect({ _id: "otherConc", type: "base", flags: {}, duration: {}, system: {} }, other); other.effects.push(conc);
    const m = { data: { system: { targets: [] } } }; recordArcanaCast(a, m);
    const source = message({ ...m.data, type: "usage", activity: a, author: owner, actor: other, system: { ...m.data.system, concentration: conc.id } });
    other.effects.push(new Effect({ ...clone(doc.effects[0]), system: { ...clone(doc.effects[0].system), origin: { message: source.uuid } } }, other));
    const p = { ...pulse, uuid: `${otherItem.uuid}.Activity.${pulseData._id}`, actor: other, item: otherItem, getUsageToken: () => otherToken }; consumeFor(p);
    return { pulse: p, concentration: conc };
  }
  async function use(value = 8, c = clone(config), defer = false, activity = pulse) {
    const m = { data: { system: { targets: [{ actor: target.uuid, token: targetToken.uuid }] } } };
    const updates = await activity.consume(c, m); if (!updates) return null;
    recordWaveUsage(activity, m); const p = message({ ...m.data, type: "usage", author: owner, activity, actor: activity.actor });
    const save = message({ type: "save", author: owner, actor: target, token: targetToken, system: { origin: p.id, ability: "con" }, rolls: [new D20(value, 16)] });
    if (!defer) await syncWavePulse(save); return { pulse: p, save, updates };
  }
  return { caster, target, targetToken, casterToken, concentration, aura, pulse, config, origin, use, message, otherSource };
}

{
  const h = setup(2), dialog = { applicationClass: Dialog }; prepareWaveDialog(h.pulse, h.config, dialog);
  assert.equal(dialog.configure, true); const ctx = await new dialog.applicationClass(h.config)._prepareConsumptionContext({ fields: [], inputs: {} }); assert.equal(ctx.fields[0].name, "spikependium.waveCone");
  const first = await h.use(); assert.equal(h.target.system.attributes.exhaustion, 3); assert.equal(h.target.effects.get(BASE).system.level, 2);
  assert.equal(waveLevels(h.target).length, 1); assert.equal(h.target.system.attributes.movement.speeds.walk, 15);
  const parts = [], data = {}; nativeWaveRollParts.call(h.target, parts, data); assert.deepEqual(parts, ["@reductions.exhaustion"]); assert.equal(data.reductions.exhaustion, -6);
  await syncWavePulse(first.save); assert.equal(waveLevels(h.target).length, 1);
  await h.use(); assert.equal(h.target.system.attributes.exhaustion, 4); await h.use(); assert.equal(h.target.system.attributes.exhaustion, 4);
  h.target.units = "m"; h.target.reset(); assert.ok(Math.abs(h.target.system.attributes.movement.speeds.walk - 3.048) < 1e-8);
  h.concentration.disabled = true; await cleanWaves(); assert.equal(waveLevels(h.target).length, 0); assert.equal(h.target.effects.get(BASE).system.level, 2);
  assert.equal(h.target.system.attributes.exhaustion, 2);
}
{
  const h = setup(), first = await h.use(); await h.use();
  first.save.system.forceSuccess = true; await syncWavePulse(first.save); assert.equal(waveLevels(h.target).length, 1);
  first.save.system.forceSuccess = false; await syncWavePulse(first.save); assert.equal(waveLevels(h.target).length, 2);
  await NativeWaveCondition._applyDelta("exhaustion", h.target, { levels: -1 }); await flush();
  assert.equal(waveLevels(h.target).length, 1); await resumeWaves(); assert.equal(waveLevels(h.target).length, 1, "снятый лечением уровень не возвращается из старой карточки");
}
{
  const h = setup(1); await h.use(); await h.use();
  await NativeWaveCondition._applyDelta("exhaustion", h.target, { levels: -1 }); await flush();
  assert.equal(h.target.effects.get(BASE), undefined); assert.equal(waveLevels(h.target).length, 2, "штатное удаление обычного эффекта не удаляет временные уровни");
  await NativeWaveCondition._applyDelta("exhaustion", h.target, { levels: 1 }); await flush();
  assert.equal(h.target.effects.get(BASE).system.level, 1); assert.equal(waveLevels(h.target).length, 2, "штатная инициализация обычного эффекта не стирает временные уровни");
  await h.target.effects.get(BASE).delete(); await flush(); assert.equal(waveLevels(h.target).length, 2);
}
{
  const h = setup(2); await h.use(); await h.use(); await NativeWaveCondition._applyDelta("exhaustion", h.target, { levels: -3 }); await flush();
  assert.equal(h.target.effects.get(BASE), undefined); assert.equal(waveLevels(h.target).length, 1);
}
{
  const h = setup(1); await h.use(); const other = h.otherSource(); await h.use(8, undefined, false, other.pulse);
  assert.equal(h.target.system.attributes.exhaustion, 3);
  h.concentration.disabled = true; await cleanWaves(); assert.equal(waveLevels(h.target).length, 1); assert.equal(h.target.system.attributes.exhaustion, 2);
  other.concentration.disabled = true; await cleanWaves(); assert.equal(h.target.system.attributes.exhaustion, 1);
}
{
  const h = setup(1); await h.use(); await h.use(); await h.target.update({ "system.attributes.exhaustion": 0 }); await flush();
  assert.equal(waveLevels(h.target).length, 0); assert.equal(h.target.effects.get(BASE), undefined, "штатное изменение общего счётчика снимает нужное количество уровней");
}
{
  const h = setup(); await h.use(); await h.use();
  h.target.effects.push(new Effect({ _id: "iron", flags: { spikependium: { arcanaSpell: "iron-body" } }, duration: {} }, h.target));
  const proposed = { actor: h.target, type: "condition", system: { type: "exhaustion", level: 1 }, flags: {}, duration: {} };
  assert.equal(guardIronExhaustion(proposed, {}), false, "Железное тело запрещает обычный уровень даже при двух временных");
}
for (const immunity of ["exhaustion", "ALL", "iron-body"]) {
  const h = setup(); if (immunity === "iron-body") h.target.effects.push(new Effect({ _id: "iron", flags: { spikependium: { arcanaSpell: "iron-body" } }, duration: {} }, h.target));
  else h.target.system.traits.ci.value.add(immunity);
  await h.use(); assert.equal(waveLevels(h.target).length, 0);
}
{
  const h = setup(4); await h.use(); assert.equal(h.target.system.attributes.exhaustion, 4); assert.equal(waveLevels(h.target).length, 0);
}
{
  const h = setup(); await h.use(20); assert.equal(waveLevels(h.target).length, 0);
  const waves = []; for (let i = 0; i < 5; i++) waves.push(await h.use(8, undefined, true));
  await Promise.all(waves.map(w => syncWavePulse(w.save))); assert.equal(waveLevels(h.target).length, 4, "параллельная обработка волн не превышает общий предел");
}
for (const type of ["effect", "card"]) {
  const h = setup(); if (type === "effect") failCreate = true; else failFlag = true;
  await assert.rejects(h.use()); await resumeWaves(); assert.equal(waveLevels(h.target).length, 1, `${type}: повтор после сбоя не добавляет второй уровень`);
}
{
  const h = setup(); const first = await h.use();
  await nativeRefund.call(h.pulse, first.pulse.system.deltas, updates => h.caster.update(updates.actor)); await syncWavePulse(first.save);
  assert.equal(waveLevels(h.target).length, 1, "отмена расхода не отменяет ранее разрешённый спасбросок");
  game.time.worldTime = 160; await cleanWaves(); assert.equal(waveLevels(h.target).length, 0);
}
for (const mutate of [h => { h.config.spikependium.waveCone = false; }, h => { h.targetToken.x = 61; }, h => { h.targetToken.elevation = 1; },
  h => { h.concentration.disabled = true; }, h => { h.aura.disabled = true; }]) {
  const h = setup(); mutate(h); assert.equal(await h.use(), null);
}
{
  const h = setup(); let release;
  const first = waveUse.call(h.pulse, () => new Promise(r => { release = r; }));
  assert.equal(await waveUse.call(h.pulse, () => assert.fail("вторая волна не открывается")), undefined);
  release("закрыто"); assert.equal(await first, "закрыто"); assert.equal(await waveUse.call(h.pulse, () => "новая волна"), "новая волна");
}
{
  const h = setup(); const card = { data: { system: {} } }; captureWavePulse(h.pulse, h.config, card);
  h.targetToken.x = 61; assert.equal(prepareWaveUpdates(h.pulse, h.config, { actor: {} }), false);
}
console.log("Волны истощения: конус 60 футов, штатные источники/концентрация/расход/отмена; отдельные временные уровни и предел 4, иммунитет/Железное тело, native D20/скорость/метры, обычное снятие/создание/удаление истощения без потери временных уровней, повторные карточки/исправление спасброска/сбои и параллельные волны: OK.");
