import fs from "node:fs";
import assert from "node:assert/strict";
import { prepareBansheeDialog, captureBansheeCast, prepareBansheeUpdates, recordBansheeConsumption, recordBansheeUsage,
  resolveBansheeCast, resumeBansheeCasts, guardBansheeDamage } from "../scripts/arcana-banshee.mjs";
import { arcanaStageDeltaLabel } from "../scripts/arcana-stages.mjs";
import { nativeConsume, nativeRefund, getDeltas } from "./data/dnd5e-reaction-native.mjs";
import { nativePerformBulkUpdate } from "./data/dnd5e-arcana-native.mjs";

const read = pack => fs.readdirSync(`packs/_source/${pack}`).map(f => JSON.parse(fs.readFileSync(`packs/_source/${pack}/${f}`, "utf8")));
const doc = read("spells").find(d => d.flags?.spikependium?.key === "spell:au-wail-of-the-banshee");
assert.ok(doc); assert.equal(doc.name, "Вопль банши"); assert.equal(doc.system.source.page, "37"); assert.equal(doc.system.level, 9);
assert.equal(doc.system.school, "nec"); assert.deepEqual(doc.system.properties, ["vocal"]); assert.equal(doc.system.range.value, "60");
const action = Object.values(doc.system.activities)[0];
assert.equal(action.type, "save"); assert.deepEqual(action.save.ability, ["con"]); assert.equal(action.target.affects.count, "10");
assert.equal(action.damage.parts[0].number, 12); assert.equal(action.damage.parts[0].denomination, 10); assert.deepEqual(action.damage.parts[0].types, ["psychic"]);
assert.equal(action.damage.onSave, "half"); assert.equal(doc.effects[0].duration.value, 3600); assert.deepEqual(doc.effects[0].statuses, ["deafened"]);
assert.equal(doc.system.properties.includes("concentration"), false);
const lists = read("rules").find(d => d.flags?.spikependium?.key === "journal:au-spell-lists");
assert.deepEqual(lists.pages.filter(p => p.system.spells.includes(`Compendium.spikependium.spells.Item.${doc._id}`)).map(p => p.system.identifier).sort(), ["sorcerer", "warlock", "wizard"]);
const clone = structuredClone, get = (o, p) => p.split(".").reduce((v, k) => v?.[k], o);
const set = (o, p, v) => { const ks = p.split("."), k = ks.pop(); ks.reduce((v, k) => v[k] ??= {}, o)[k] = clone(v); };
function flatten(o, prefix = "", out = {}) { for (const [k, v] of Object.entries(o)) {
  const p = prefix ? `${prefix}.${k}` : k; if (v && Object.getPrototypeOf(v) === Object.prototype) flatten(v, p, out); else out[p] = v;
} return out; }
const list = values => Object.assign(values, { get(id) { return this.find(v => v.id === id); } });
let serial, world, mutations, fail, duringDead, notices;
globalThis.fromUuidSync = uuid => world.get(uuid);
globalThis.ui = { notifications: { warn: m => notices.push(m) } };
globalThis.foundry = { utils: { getProperty: get, setProperty: set, flattenObject: flatten, isEmpty: o => !o || !Object.keys(o).length,
  randomID: () => String(++serial).padStart(16, "0") }, data: { fields: { BooleanField: class {} } }, documents: { async modifyBatch(operations) {
  if (fail === "before") { fail = null; throw Error("before batch"); }
  for (const op of operations) {
    mutations++;
    if (op.documentName === "Actor") for (const u of op.updates) await world.get(`Actor.${u._id}`).update(u);
    else if (op.documentName === "ActorDelta") {
      assert.equal(op.updates[0]._id, op.parent.delta.id); await op.parent.actor.update(op.updates[0]);
    } else if (op.documentName === "ActiveEffect") {
      if (op.action === "delete") {
        for (const id of op.ids) { const e = op.parent.effects.get(id); if (e) { op.parent.effects.splice(op.parent.effects.indexOf(e), 1); world.delete(e.uuid); } }
        if (fail === "after-ward") { fail = null; throw Error("ward deleted but actor marker not written"); }
      } else if (op.action === "create") for (const d of op.data) {
        op.parent.effects.push({ ...clone(d), id: d._id, parent: op.parent }); d.statuses.forEach(s => op.parent.statuses.add(s));
      } else assert.fail(op.action);
    } else assert.fail(op.documentName);
  }
  if (fail === "after") { fail = null; throw Error("after batch"); }
} } };
globalThis.ActiveEffect = { implementation: { async fromStatusEffect(status) {
  assert.equal(status, "dead"); if (duringDead) { const f = duringDead; duringDead = null; f(); }
  return { toObject: () => ({ type: "condition", system: { type: "dead" }, statuses: ["dead"], disabled: false }) };
} } };
globalThis.dnd5e = { utils: { convertLength: (n, from, to) => from === "m" && to === "ft" ? n / 0.3048 : n } };
class Dialog { constructor(c) { this.config = c; } async _prepareConsumptionContext(c) { return c; } }

function setup(hp = [50, 51], synthetic = false) {
  serial = 0; world = new Map(); mutations = 0; notices = []; fail = null; duringDead = null;
  const gm = { id: "gm", isGM: true, isActiveGM: true }, owner = { id: "owner" };
  const users = list([gm, owner]); users.activeGM = gm;
  globalThis.game = { user: gm, users, time: { worldTime: 100 }, messages: list([]) };
  function actor(id, value) {
    const a = { id, uuid: `Actor.${id}`, isOwner: true, flags: {}, effects: list([]), statuses: new Set(),
      system: { isCreature: true, spells: { spell9: { value: 1 } }, attributes: { hp: { value, max: 150, temp: 100 }, death: { success: 1, failure: 0 } } },
      testUserPermission: u => u.isGM || u.id === "owner", performBulkUpdate: nativePerformBulkUpdate,
      async update(updates) { for (const [p, v] of Object.entries(updates)) if (p !== "_id") set(this, p, v); } };
    world.set(a.uuid, a); return a;
  }
  const caster = actor("caster", 100), targets = hp.map((h, i) => actor(`victim${i}`, h));
  if (synthetic) { const a = targets[0]; world.delete(a.uuid); a.uuid = "Scene.scene.Token.victim0.Actor.synthetic"; a.parent = { actor: a, delta: { id: "delta" } }; world.set(a.uuid, a); }
  const scene = { grid: { units: "ft", getCenterPoint: p => p, measurePath: ([a, b]) => ({ distance: Math.hypot(a.x - b.x, a.y - b.y, a.elevation - b.elevation) }) } };
  function token(id, a, x = 0) {
    const t = { id, name: id, uuid: `Scene.scene.Token.${id}`, parent: scene, actor: a, x, y: 0, elevation: 0,
      getOccupiedGridSpaceOffsets() { return [{ x: this.x, y: this.y }]; } };
    world.set(t.uuid, t); return t;
  }
  const source = token("caster", caster), tokens = targets.map((a, i) => token(`victim${i}`, a, 60));
  scene.tokens = [source, ...tokens]; game.user.targets = new Set(tokens);
  globalThis.canvas = { ready: true, scene };
  const item = { ...clone(doc), id: doc._id, uuid: `${caster.uuid}.Item.spell`, actor: caster };
  const activity = { ...clone(action), id: action._id, uuid: `${item.uuid}.Activity.${action._id}`, item, actor: caster, getUsageToken: () => source };
  world.set(activity.uuid, activity);
  function fresh() { return { data: { system: { targets: tokens.map(t => ({ actor: t.actor.uuid, token: t.uuid })) } } }; }
  const config = { spikependium: { bansheeAudible: true } };
  globalThis.Hooks = { call(hook, a, c, m) {
    if (hook === "dnd5e.preActivityConsumption") return captureBansheeCast(a, c, m);
    if (hook === "dnd5e.postActivityConsumption") recordBansheeConsumption(a, c, m);
    return true;
  } };
  activity._prepareUsageUpdates = async c => caster.system.spells.spell9.value > 0
    ? prepareBansheeUpdates(activity, c, { actor: { "system.spells.spell9.value": caster.system.spells.spell9.value - 1 }, item: [] }) : false;
  activity.consume = (c, m) => nativeConsume.call(activity, c, m, async updates => {
    const deltas = getDeltas(caster, updates.actor); await caster.update(updates.actor); return { actor: deltas, item: {} };
  });
  async function pay(c = config, m = fresh()) {
    const updates = await activity.consume(c, m); if (!updates) return { updates, m };
    recordBansheeUsage(activity, m);
    const message = { ...m.data, type: "usage", id: `message${++serial}`, uuid: `ChatMessage.message${serial}`, author: owner,
      getAssociatedActivity: () => activity, async setFlag(module, p, v) { set(this.flags, `${module}.${p}`, v); } };
    game.messages.push(message); world.set(message.uuid, message); return { updates, message, m };
  }
  function addWard(a, sourceField = "activity") {
    const spell = { system: { identifier: "death-ward" } }, origin = { item: spell }; world.set("Actor.cleric.Item.ward.Activity.cast", origin);
    const e = { id: "ward", uuid: `${a.uuid}.ActiveEffect.ward`, parent: a, active: true, duration: { expired: false }, system: { origin: {} }, flags: {},
      ...(sourceField === "activity" ? { system: { origin: { activity: "Actor.cleric.Item.ward.Activity.cast" } } }
        : { _stats: { duplicateSource: "Compendium.dnd5e.spells24.Item.phbsplDeathWard0.ActiveEffect.profile" } }) };
    a.effects.push(e); world.set(e.uuid, e); return e;
  }
  return { caster, targets, tokens, source, activity, config, fresh, pay, addWard, scene, owner };
}

{
  const h = setup(), dialog = { applicationClass: Dialog }; prepareBansheeDialog(h.activity, h.config, dialog);
  assert.equal(dialog.configure, true); const fields = await new dialog.applicationClass(h.config)._prepareConsumptionContext({ fields: [], inputs: {} });
  assert.equal(fields.fields[0].name, "spikependium.bansheeAudible"); assert.equal(h.caster.system.spells.spell9.value, 1);
  const { message } = await h.pay(); assert.equal(h.caster.system.spells.spell9.value, 0);
  const damage = { type: "damage", author: h.owner, system: { targets: clone(message.system.targets) }, getAssociatedActivity: () => h.activity, getOriginatingMessage: () => message };
  assert.equal(guardBansheeDamage(h.targets[1], 10, {}, { originatingMessage: damage }), undefined);
  assert.equal(guardBansheeDamage(h.targets[0], 10, {}, { originatingMessage: damage }), false, "смертельной ветке не добавляется 12к10");
  damage.author = { id: "outsider" }; assert.equal(guardBansheeDamage(h.targets[1], 10, {}, { originatingMessage: damage }), false); damage.author = h.owner;
  assert.equal(message.system.targets.length, 1); assert.equal(message.system.targets[0].actor, h.targets[1].uuid, "51 хитов: только штатные спасбросок и урон");
  assert.equal(message.flags.spikependium.bansheeCast.targets[0].fatal, true); assert.equal(message.flags.spikependium.bansheeCast.targets[0].hp, undefined);
  assert.equal(arcanaStageDeltaLabel.call({ keyPath: `flags.spikependium.bansheeCasts.${message.flags.spikependium.bansheeCast.event}.active` }, () => ({})).label, "Вопль банши: накладывание");
  await resolveBansheeCast(message); assert.equal(h.targets[0].system.attributes.hp.value, 0); assert.equal(h.targets[0].statuses.has("dead"), true);
  assert.equal(h.targets[0].system.attributes.hp.temp, 100, "мгновенная смерть не является уроном и не тратит временные хиты");
  assert.equal(h.targets[1].system.attributes.hp.value, 51); const mutationsBefore = mutations;
  await resolveBansheeCast(message); await resumeBansheeCasts(); assert.equal(mutations, mutationsBefore);
  await nativeRefund.call(h.activity, message.system.deltas, updates => h.caster.update(updates.actor));
  assert.equal(h.caster.system.spells.spell9.value, 1); assert.equal(h.targets[0].statuses.has("dead"), true, "отмена расхода не воскрешает");
  assert.equal(guardBansheeDamage(h.targets[1], 10, {}, { originatingMessage: damage }), false, "отменённая оплата не даёт применять урон");
}
for (const type of ["activity", "duplicateSource"]) {
  const h = setup([25]), ward = h.addWard(h.targets[0], type), { message } = await h.pay();
  await resolveBansheeCast(message); assert.equal(h.targets[0].system.attributes.hp.value, 25); assert.equal(world.has(ward.uuid), false);
  assert.equal(h.targets[0].statuses.has("dead"), false); assert.equal(h.targets[0].flags.spikependium.bansheeDeaths[message.flags.spikependium.bansheeCast.event].protected, true);
}
for (const failure of ["before", "after", "after-ward"]) {
  const h = setup([20]); h.addWard(h.targets[0]); const { message } = await h.pay(); fail = failure;
  await assert.rejects(resolveBansheeCast(message)); await resumeBansheeCasts();
  assert.equal(h.targets[0].system.attributes.hp.value, 20); assert.equal(h.targets[0].statuses.has("dead"), false, `${failure}: повтор после сбоя не убивает защищённую цель`);
}
for (const synthetic of [false, true]) {
  const h = setup([0], synthetic), { message } = await h.pay(); fail = "after";
  await assert.rejects(resolveBansheeCast(message)); await resolveBansheeCast(message);
  assert.equal(h.targets[0].effects.filter(e => e.statuses.includes("dead")).length, 1);
}
{
  const h = setup([20]); delete h.targets[0].system.attributes.death;
  const { message } = await h.pay(); await resolveBansheeCast(message);
  assert.equal(h.targets[0].statuses.has("dead"), true); assert.equal(h.targets[0].system.attributes.death, undefined, "существу без испытаний смерти не добавляется чужое поле");
}
for (const mutate of [h => { h.config.spikependium.bansheeAudible = false; }, h => { h.tokens[0].x = 61; },
  h => { h.tokens[0].elevation = 1; }, h => { h.targets[0].statuses.add("deafened"); }, h => { game.user.targets.clear(); },
  h => { h.fresh = () => ({ create: false }); }, h => { h.activity.getUsageToken = () => null; },
  h => { game.users.activeGM = null; h.targets[0].isOwner = false; }]) {
  const h = setup([50]); mutate(h); assert.equal(captureBansheeCast(h.activity, h.config, h.fresh()), false); assert.equal(h.caster.system.spells.spell9.value, 1);
}
{
  const h = setup(Array(11).fill(20)); assert.equal(captureBansheeCast(h.activity, h.config, h.fresh()), false);
}
{
  const h = setup([20]); captureBansheeCast(h.activity, h.config, h.fresh()); h.targets[0].system.attributes.hp.value = 30;
  assert.equal(prepareBansheeUpdates(h.activity, h.config, { actor: {} }), false, "изменение до расхода не списывает ячейку");
}
for (const mutate of [h => { h.targets[0].system.attributes.hp.value = 51; }, h => { h.tokens[0].x = 61; }, h => { h.targets[0].statuses.add("deafened"); }]) {
  const h = setup([20]), { message } = await h.pay(); mutate(h); await resolveBansheeCast(message); assert.equal(h.targets[0].statuses.has("dead"), false);
}
{
  const h = setup([20]), { message } = await h.pay(); duringDead = () => { h.targets[0].system.attributes.hp.value = 51; };
  await resolveBansheeCast(message); assert.equal(h.targets[0].statuses.has("dead"), false, "повторная проверка после асинхронной подготовки");
}
for (const mutate of [(h, m) => { m.author = { id: "outsider" }; }, (h, m) => { m.system.deltas.actor = []; },
  (h, m) => { m.flags.spikependium.bansheeCast.targets[0].actor = "Actor.other"; }, (h, m) => { game.user = h.owner; },
  (h, m) => { h.caster.flags.spikependium.bansheeCasts[m.flags.spikependium.bansheeCast.event].active = 0; }]) {
  const h = setup([20]), { message } = await h.pay(); mutate(h, message); await resolveBansheeCast(message); assert.equal(h.targets[0].statuses.has("dead"), false);
}
{
  const h = setup([20]); h.tokens[0].hidden = true; const { m } = await h.pay(); assert.deepEqual(m.data.whisper, ["gm"]); assert.equal(m.data.blind, true);
}
{
  const h = setup([20]); game.users.activeGM = null; game.user = h.owner;
  game.user.targets = new Set(h.tokens);
  const { message } = await h.pay(); await resolveBansheeCast(message); assert.equal(h.targets[0].statuses.has("dead"), true);
}
console.log("Вопль банши: PDF/списки/12к10/глухота; порог 50, выбор целей/дальность/высота/слышимость, штатный расход/отмена, Death Ward, защита от дублей и поддельных карточек, приватность, ActorDelta и восстановление после частично удалённого Оберега: OK.");
