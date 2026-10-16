import assert from "node:assert/strict";
import { vestigeTokens, pocketArchives, canUseVestigePocket, canSummonVestige, validPocketPlacement, handleVestigePocket, endVestigeAura, endDeadOwnerPockets, vestigeLocked } from "../scripts/pocket.mjs";
import { vestigeAuraActive, prepareVestigeAuraCondition, canUseVestigeAura, vestigeAuraUsageToken, validateVestigeAuraTemplate, attachVestigeAuraTemplate, recordVestigeAuraUsage, vestigeAuraEffectChanges, activateVestigeAura, recordVestigeSurvival, finishVestigeSurvival, upgradeVestigeAuraEffects, endExpiredVestigeAuras } from "../scripts/vestige-aura.mjs";

const list = data => Object.assign(data, { get(id) { return this.find(d => d.id === id); } });
const gm = { id: "gm", isGM: true, isActiveGM: true }, player = { id: "player", isGM: false };
let owner, item, source, scene, caller, mode, placement, duringPlacement, failDelete, failCreate, failReceipt, actorsMade, tokensMade;
globalThis.ui = { notifications: { warn() {}, error() {} } };
const setProperty = (object, path, value) => {
  const keys = path.split(".");
  for (const key of keys.slice(0, -1)) object = object[key] ??= {};
  object[keys.at(-1)] = value;
};
const mergeObject = (target, source) => {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === "object" && !Array.isArray(value)) mergeObject(target[key] ??= {}, value);
    else target[key] = value;
  }
  return target;
};
globalThis.foundry = { utils: { deepClone: structuredClone, setProperty, mergeObject, randomID: () => "event" } };
globalThis.dnd5e = { utils: { convertLength: n => n }, canvas: { TokenPlacement: { async place(config) {
  assert.equal(config.tokens.length, 1); if (duringPlacement) await duringPlacement(); return placement;
} } } };
const actor = (data, id) => {
  const raw = structuredClone(data);
  const result = { id, uuid: `Actor.${id}`, isOwner: true, _stats: { createdBy: gm.id }, name: raw.name, ownership: raw.ownership,
    flags: raw.flags ?? {}, system: raw.system, items: raw.items ?? [], effects: list([]), statuses: new Set(),
    prototypeToken: { toObject: () => raw.prototypeToken, parent: { id } },
    testUserPermission(u) { return u.isGM || (this.ownership?.[u.id] ?? this.ownership?.default ?? 0) >= 3; },
    toObject() { return structuredClone({ ...raw, _id: id, flags: this.flags, system: this.system, ownership: this.ownership }); },
    async setFlag(scope, key, value) {
      if (failReceipt) throw Error("receipt failed"); setProperty(this.flags, `${scope}.${key}`, value);
    },
    async getTokenDocument(data, options) { return tokenDoc({ ...raw.prototypeToken, ...data, actorId: this.id }, this, options?.parent); }
  };
  return result;
};
const tokenDoc = (data, a, parent) => ({ ...data, parent, actor: a, depth: data.depth ?? 1, width: data.width ?? 1, height: data.height ?? 1,
  uuid: data._id ? `Scene.test.Token.${data._id}` : null, id: data._id, flags: data.flags ?? {},
  getCenterPoint() { return { x: this.x + 50, y: this.y + 50, elevation: this.elevation }; },
  getOccupiedGridSpaceOffsets() { return [{ i: this.y / 100, j: this.x / 100 }]; },
  getSize() { return { width: 100, height: 100 }; },
  toObject() { return structuredClone({ ...data, depth: this.depth, width: this.width, height: this.height }); }
});
globalThis.Actor = { implementation: { async create(data) {
  if (failCreate) throw Error("create failed");
  const a = actor(data, `created${++actorsMade}`); game.actors.push(a); return a;
} } };
const reset = () => {
  actorsMade = tokensMade = 0; failDelete = failCreate = failReceipt = false; duringPlacement = undefined;
  globalThis.game = { user: gm, users: list([gm, player]), actors: list([]), combat: { started: true, id: "c", round: 1, turn: 0 } };
  gm.isActiveGM = true;
  scene = { tokens: list([]), grid: { units: "ft", distance: 5, size: 100,
    getCenterPoint: o => ({ x: o.j * 100 + 50, y: o.i * 100 + 50, elevation: 0 }),
    measurePath: ([a, b]) => ({ distance: Math.hypot(a.x - b.x, a.y - b.y) / 100 * 5 }) },
    async deleteEmbeddedDocuments(type, ids) { if (failDelete) throw Error("delete failed"); this.tokens = list(this.tokens.filter(t => !ids.includes(t.id))); },
    async createEmbeddedDocuments(type, data) {
      if (failCreate) throw Error("token failed");
      tokensMade++;
      const a = game.actors.get(data[0].actorId);
      assert.equal(a.system.attributes.hp.value, 7, "возвращение не восстанавливает хиты");
      assert.equal(a.items[0].system.uses.spent, 1, "возвращение не восстанавливает Божественную силу");
      const t = tokenDoc({ ...data[0], _id: `returned${tokensMade}` }, a, scene); this.tokens.push(t); return [t];
    }
  };
  game.scenes = [scene]; globalThis.canvas = { ready: true, scene };
  owner = actor({ name: "Owner", flags: {}, ownership: { player: 3 }, system: { isCreature: true }, items: [] }, "owner");
  item = { uuid: "Actor.owner.Item.vestige", actor: owner, flags: { spikependium: { key: "subclass:vestige-patron:vestige-companion" } } };
  const raw = { name: "Vestige", type: "npc", ownership: { player: 3 }, flags: { spikependium: { key: "actor:vestige-celestial" },
    dnd5e: { summon: { origin: item.uuid } } }, system: { isCreature: true, attributes: { hp: { value: 7, max: 20 } }, currency: { gp: 0 } },
    items: [{ _id: "power", type: "feat", flags: {}, system: { uses: { spent: 1 } } }], effects: [], prototypeToken: {} };
  const sourceActor = actor(raw, "source");
  source = tokenDoc({ _id: "source", x: 100, y: 0, elevation: 0, level: "base", actorId: sourceActor.id }, sourceActor, scene);
  caller = tokenDoc({ _id: "owner", x: 0, y: 0, elevation: 0, level: "base" }, owner, scene);
  scene.tokens.push(source, caller);
  globalThis.fromUuidSync = uuid => uuid === item.uuid ? item : uuid === owner.uuid ? owner
    : [...scene.tokens, ...game.actors].find(d => d.uuid === uuid);
  mode = { id: "OfZsym1ofcJhvmgo", item, actor: owner, type: "utility", getUsageToken: () => caller };
  placement = [{ x: 200, y: 0, elevation: 0, level: "base" }];
};
const message = () => ({ type: "usage", author: player, flags: {}, getAssociatedActivity: () => mode,
  async setFlag(scope, key, value) { (this.flags[scope] ??= {})[key] = value; } });
const toReturn = () => { mode = { ...mode, id: "lDQV8IBeLyPyRSZb" }; };
const log = console.error; console.error = () => {};
reset();
assert.equal(canUseVestigePocket(mode), true);
assert.equal(canSummonVestige({ ...mode, type: "summon" }), false);
const dismiss = message(); await handleVestigePocket(dismiss);
assert.equal(vestigeTokens(item).length, 0); assert.equal(pocketArchives(item).length, 1);
assert.equal(game.actors[0].flags.spikependium.vestigePocket.state, "pocket");
assert.deepEqual(game.actors[0].ownership, { default: 0 });
await handleVestigePocket(dismiss); assert.equal(actorsMade, 1);
toReturn(); assert.equal(canUseVestigePocket(mode), true);
const returning = message(); await handleVestigePocket(returning);
assert.equal(tokensMade, 1); assert.equal(vestigeTokens(item).length, 1); assert.equal(pocketArchives(item).length, 0);
assert.deepEqual(vestigeTokens(item)[0].actor.ownership, { player: 3 });
await handleVestigePocket(returning); assert.equal(tokensMade, 1);
for (const interruption of ["cancel", "far", "occupied", "turn", "dead", "scene"]) {
  reset(); await handleVestigePocket(message()); toReturn();
  if (interruption === "cancel") placement = [];
  if (interruption === "far") placement[0].x = 800;
  if (interruption === "occupied") placement[0].x = 0;
  if (interruption === "turn") duringPlacement = () => { game.combat.turn++; };
  if (interruption === "dead") duringPlacement = () => { owner.statuses.add("dead"); };
  if (interruption === "scene") duringPlacement = () => { canvas.scene = {}; };
  await handleVestigePocket(message()); assert.equal(tokensMade, 0); assert.equal(pocketArchives(item).length, 1);
}
reset(); failDelete = true;
await handleVestigePocket(message()); assert.equal(vestigeTokens(item).length, 1); assert.equal(pocketArchives(item).length, 1);
failDelete = false;
await handleVestigePocket(message()); assert.equal(vestigeTokens(item).length, 0); assert.equal(actorsMade, 1);
reset(); failDelete = true; await handleVestigePocket(message()); failDelete = false;
source.actor.system.attributes.hp.value = 3;
await handleVestigePocket(message()); assert.equal(vestigeTokens(item).length, 1, "устаревшее сохранение не удаляет изменённый исходный лист");
reset(); await handleVestigePocket(message()); toReturn(); failReceipt = true;
await handleVestigePocket(message()); assert.equal(tokensMade, 1);
failReceipt = false;
assert.equal(canUseVestigePocket(mode), true, "незавершённая квитанция разрешает безопасно закончить возврат");
await handleVestigePocket(message()); assert.equal(tokensMade, 1); assert.equal(pocketArchives(item).length, 0);
reset(); const foreign = message(); foreign.author = { id: "stranger", isGM: false };
await handleVestigePocket(foreign); assert.equal(actorsMade, 0);
reset(); gm.isActiveGM = false;
await handleVestigePocket(message()); assert.equal(actorsMade, 0);
reset(); await handleVestigePocket(message());
game.actors[0].ownership.player = 3;
assert.equal(pocketArchives(item).length, 0, "Мастер не исполняет сохранение, доступное для изменения игроком");
reset(); await handleVestigePocket(message()); owner.statuses.add("dead");
await endDeadOwnerPockets(); assert.equal(pocketArchives(item).length, 0);
assert.equal(game.actors[0].flags.spikependium.vestigePocket.state, "ended");
owner.statuses.delete("dead"); toReturn();
assert.equal(canUseVestigePocket(mode), false, "воскрешение хозяина не возвращает исчезнувшего реликта");
reset(); await handleVestigePocket(message()); toReturn();
duringPlacement = async () => { owner.statuses.add("dead"); await endDeadOwnerPockets(); owner.statuses.delete("dead"); };
await handleVestigePocket(message()); assert.equal(tokensMade, 0, "смерть и воскрешение во время выбора точки прекращают возврат");
reset(); failCreate = true;
await handleVestigePocket(message()); assert.equal(vestigeTokens(item).length, 1, "ошибка сохранения не удаляет исходного реликта");
assert.equal(canUseVestigePocket(mode), true, "после ошибки блокировка снимается");
reset();
const aura = { uuid: "Actor.owner.Item.aura", flags: { spikependium: { key: "subclass:vestige-patron:aura-of-power" } } };
owner.items.push(aura);
const affected = [owner, source.actor, actor({ flags: {}, system: {}, ownership: {} }, "remote")];
game.actors.push(owner, affected[2]);
game.scenes.push({ tokens: [tokenDoc({ _id: "remote" }, affected[2])] });
for (const a of affected) {
  a.effects = list([
    { id: "aura", system: { origin: { activity: `${aura.uuid}.Activity.main` } } },
    { id: "other", system: { origin: { activity: "Actor.other.Item.aura.Activity.main" } } }
  ]);
  a.deleteEmbeddedDocuments = async (type, ids) => {
    assert.equal(type, "ActiveEffect"); assert.deepEqual(ids, ["aura"]);
    a.effects = list(a.effects.filter(e => !ids.includes(e.id)));
  };
}
await endVestigeAura(owner);
for (const a of affected) assert.deepEqual(a.effects.map(e => e.id), ["other"], "окончание ауры снимает только её эффекты на всех сценах");
console.log("Карманное измерение: сохранение хитов/расхода и прав, уход/возврат, размещение/дистанция, отмена и смена хода/сцены, частичные ошибки без дублей, защита сохранения и смерть хозяина: OK.");

let auraActivity, auraMessage, auraEffects;
globalThis.ActiveEffect = { implementation: { getEffectStart: () => ({ time: game.time.worldTime }) } };
const enableEffects = a => {
  a.createEmbeddedDocuments = async (type, data) => {
    assert.equal(type, "ActiveEffect");
    for (const raw of data) {
      const e = { ...structuredClone(raw), id: `effect${++auraEffects}`, parent: a };
      e.uuid = `${a.uuid}.ActiveEffect.${e.id}`;
      Object.defineProperty(e.duration, "remaining", { get() { return this.value - (game.time.worldTime - e.start.time); } });
      e.update = async changed => { for (const [key, value] of Object.entries(changed)) setProperty(e, key, value); };
      a.effects.push(e);
    }
  };
  a.updateEmbeddedDocuments = async (type, data) => {
    assert.equal(type, "ActiveEffect");
    for (const raw of data) mergeObject(a.effects.find(e => e.id === raw._id), raw);
  };
  a.deleteEmbeddedDocuments = async (type, ids) => {
    assert.equal(type, "ActiveEffect"); a.effects = list(a.effects.filter(e => !ids.includes(e.id)));
  };
};
const resetAura = () => {
  reset(); auraEffects = 0;
  game.time = { worldTime: 100 };
  scene.grid.getCenterPoint = o => ({ x: o.j * 100 + 50, y: o.i * 100 + 50 });
  scene.grid.measurePath = ([a, b]) => ({ distance: Math.hypot((a.x - b.x) / 100 * 5, (a.y - b.y) / 100 * 5, (a.elevation ?? 0) - (b.elevation ?? 0)) });
  owner.classes = { warlock: { system: { levels: 10 } } };
  owner.system.attributes = { hp: { value: 12, max: 30, effectiveMax: 30 }, death: { success: 2, failure: 1 } };
  owner.system.abilities = { cha: { mod: 3 } };
  owner.items = list([item]);
  enableEffects(owner); enableEffects(source.actor); game.actors.push(owner);
  const auraItem = { id: "aura", uuid: `${owner.uuid}.Item.aura`, actor: owner,
    flags: { spikependium: { key: "subclass:vestige-patron:aura-of-power" } }, effects: [{ id: "profile", uuid: `${owner.uuid}.Item.aura.ActiveEffect.profile` }] };
  auraActivity = { id: "YpjaiBgRIFECoh2H", uuid: `${auraItem.uuid}.Activity.YpjaiBgRIFECoh2H`, item: auraItem, actor: owner, effects: [{ _id: "profile" }] };
  owner.items.push(auraItem);
  const previousResolve = fromUuidSync;
  globalThis.fromUuidSync = uuid => uuid === auraActivity.uuid ? auraActivity : previousResolve(uuid);
  const config = { data: {} }; recordVestigeAuraUsage(auraActivity, config);
  auraMessage = { ...message(), id: "aura-message", uuid: "ChatMessage.aura", flags: config.data.flags,
    system: { targets: [] }, getAssociatedActivity: () => auraActivity };
  dnd5e.applications = { components: { EffectApplicationElement: class {
    async _prepareEffectData(profile, target) {
      assert.equal(profile, auraActivity.item.effects[0]);
      const changes = vestigeAuraEffectChanges.call(auraActivity, () => ({}), profile, { chatMessage: this.chatMessage, target });
      const existing = target.effects.find(e => e.system.origin?.activity === auraActivity.uuid);
      const data = mergeObject({ disabled: false, transfer: false, duration: { expired: false }, system: { changes: [] } }, changes);
      data.system.origin = { activity: auraActivity.uuid };
      if (existing) data._id = existing.id;
      return { action: existing ? "update" : "create", data };
    }
  } } };
};
resetAura();
assert.equal(canUseVestigeAura(auraActivity), true);
assert.equal(vestigeAuraUsageToken.call(auraActivity, () => caller), source);
const regions = [{ shapes: [{ type: "emanation", base: {} }] }]; attachVestigeAuraTemplate(auraActivity, regions);
assert.equal(regions[0].attachment.token, source.id);
assert.equal(regions[0].shapes[0].base.x, source.x, "эманация начинается от реликта");
await activateVestigeAura(auraMessage);
assert.equal(owner.effects.length, 1); assert.equal(source.actor.effects.length, 1);
await activateVestigeAura(auraMessage); assert.equal(auraEffects, 2, "повторное событие не дублирует ауру");
const ownerAura = owner.effects[0];
assert.equal(ownerAura.duration.value, 10800); assert.equal(ownerAura.system.magical, true);
assert.equal(vestigeAuraActive(ownerAura), true);
assert.equal(prepareVestigeAuraCondition.call({ parent: ownerAura }, data => data.spikependium.vestigeAuraActive, {}), true);
caller.x = 700; assert.equal(vestigeAuraActive(ownerAura), true, "граница 30 футов включена");
caller.x = 800; assert.equal(vestigeAuraActive(ownerAura), false); caller.x = 0;
caller.elevation = 35; assert.equal(vestigeAuraActive(ownerAura), false, "аура учитывает высоту и на сетке"); caller.elevation = 0;
caller.level = "other"; assert.equal(vestigeAuraActive(ownerAura), false); caller.level = "base";
owner.statuses.add("unconscious"); assert.equal(vestigeAuraActive(ownerAura), true, "недееспособность хозяина не заканчивает ауру"); owner.statuses.clear();
owner.statuses.add("antimagic"); assert.equal(vestigeAuraActive(ownerAura), false); owner.statuses.clear();
ownerAura.disabled = true; assert.equal(vestigeAuraActive(ownerAura), false); ownerAura.disabled = false;
game.time.worldTime += 10800; assert.equal(vestigeAuraActive(ownerAura), false); game.time.worldTime -= 10800;
const changed = { "system.attributes.hp.value": 0, "system.attributes.hp.temp": 0 };
recordVestigeSurvival(owner, changed);
assert.equal(changed["system.attributes.hp.value"], 13); assert.equal(changed["system.attributes.hp.temp"], 0);
assert.deepEqual(changed.system.attributes.death, { success: 0, failure: 0 });
owner.flags = changed.flags; owner.system.attributes.hp.value = 13;
assert.equal(vestigeLocked(item), true); assert.equal(vestigeAuraActive(ownerAura), false);
assert.equal(canUseVestigeAura({ actor: source.actor, item: { flags: {} }, id: "strike" }), false, "уходящий реликт не может действовать");
assert.equal(canSummonVestige({ ...mode, type: "summon" }), false);
await finishVestigeSurvival();
assert.equal(vestigeTokens(item).length, 0); assert.equal(owner.effects.length, 0);
assert.equal(pocketArchives(item).length, 1); assert.equal(owner.flags.spikependium.vestigeSave.state, "done");
await finishVestigeSurvival(); assert.equal(actorsMade, 1);
toReturn(); assert.equal(canUseVestigePocket(mode), false);
delete owner.flags.spikependium.vestigeSave;
assert.equal(vestigeLocked(item), true, "защищённый архив сохраняет запрет независимо от флага владельца");
owner.flags.spikependium.longRest = "next-rest";
assert.equal(vestigeLocked(item), false); assert.equal(canUseVestigePocket(mode), true);
await handleVestigePocket(message()); assert.equal(tokensMade, 1);
for (const invalid of ["outside", "expired", "zero", "dead", "low-level", "unowned", "disabled"]) {
  resetAura(); await activateVestigeAura(auraMessage);
  if (invalid === "outside") caller.x = 800;
  if (invalid === "expired") game.time.worldTime += 10800;
  if (invalid === "zero") owner.system.attributes.hp.value = 0;
  if (invalid === "dead") owner.statuses.add("dead");
  if (invalid === "low-level") owner.classes.warlock.system.levels = 9;
  if (invalid === "unowned") owner.isOwner = false;
  if (invalid === "disabled") owner.effects[0].disabled = true;
  const data = { "system.attributes.hp.value": 0 };
  recordVestigeSurvival(owner, data);
  assert.deepEqual(data, { "system.attributes.hp.value": 0 }, `спасение недоступно: ${invalid}`);
}
resetAura(); await activateVestigeAura(auraMessage);
const nested = { system: { attributes: { hp: { value: 0 } } } };
recordVestigeSurvival(owner, nested); assert.equal(nested.system.attributes.hp.value, 13, "поддерживается вложенное обновление ActorDelta");
owner.flags = nested.flags; owner.system.attributes.hp.value = 13;
failCreate = true; await finishVestigeSurvival();
assert.equal(vestigeTokens(item).length, 1); assert.equal(owner.flags.spikependium.vestigeSave.state, "pending");
const repeated = { "system.attributes.hp.value": 0 }; recordVestigeSurvival(owner, repeated);
assert.equal(repeated["system.attributes.hp.value"], 0, "ошибка ухода не позволяет повторно спастись");
failCreate = false; await finishVestigeSurvival(); assert.equal(pocketArchives(item).length, 1);
resetAura(); await activateVestigeAura(auraMessage);
const delayed = { "system.attributes.hp.value": 0 }; recordVestigeSurvival(owner, delayed); owner.flags = delayed.flags;
owner.flags.spikependium.longRest = "rest-without-gm";
assert.equal(vestigeLocked(item), true, "отдых не обходит незавершённый уход при отсутствовавшем Мастере");
await finishVestigeSurvival();
assert.equal(pocketArchives(item).length, 1); assert.equal(vestigeLocked(item), false, "завершение после отдыха сохраняет право вернуть реликта");
resetAura(); await activateVestigeAura(auraMessage);
delete owner.effects[0].flags.spikependium.vestigeAura;
owner.effects[0].system.conditions = "";
await upgradeVestigeAuraEffects();
assert.deepEqual(JSON.parse(owner.effects[0].system.conditions), { k: "spikependium.vestigeAuraActive", v: true });
assert.equal(owner.effects[0].flags.spikependium.vestigeAura.token, source.uuid);
assert.equal(canUseVestigeAura({ ...auraActivity, id: "OYs3klGoRTdWQLNp" }), false, "старое действие лечения блокируется");
resetAura();
const ally = actor({ ownership: {}, flags: {}, system: { isCreature: true } }, "ally"); enableEffects(ally);
const allyToken = tokenDoc({ _id: "ally", x: 200, y: 0, elevation: 0, level: "base" }, ally, scene); scene.tokens.push(allyToken);
auraMessage.system.targets = [{ token: allyToken.uuid }];
await activateVestigeAura(auraMessage); assert.equal(ally.effects.length, 1); assert.equal(vestigeAuraActive(ally.effects[0]), true);
allyToken.x = 900; assert.equal(vestigeAuraActive(ally.effects[0]), false);
allyToken.x = 200; assert.equal(vestigeAuraActive(ally.effects[0]), true, "возврат выбранного союзника в ауру возвращает бонусы");
resetAura(); owner.flags.spikependium = { longRest: "new" };
await activateVestigeAura(auraMessage); assert.equal(auraEffects, 0, "старая карточка до отдыха не проявляет ауру заново");
resetAura(); auraMessage.author = { id: "stranger", isGM: false };
await activateVestigeAura(auraMessage); assert.equal(auraEffects, 0);
resetAura(); await activateVestigeAura(auraMessage);
const retrySave = { "system.attributes.hp.value": 0 }; recordVestigeSurvival(owner, retrySave); owner.flags = retrySave.flags;
failReceipt = true; await finishVestigeSurvival();
assert.equal(vestigeTokens(item).length, 0); assert.equal(owner.flags.spikependium.vestigeSave.state, "pending");
failReceipt = false; await finishVestigeSurvival();
assert.equal(actorsMade, 1); assert.equal(owner.flags.spikependium.vestigeSave.state, "done");
assert.equal(pocketArchives(item)[0].flags.spikependium.vestigePocket.state, "pocket");
resetAura();
canvas.scene = {}; assert.equal(validateVestigeAuraTemplate(auraActivity), false); canvas.scene = scene;
await activateVestigeAura(auraMessage);
const auraUuid = auraActivity.uuid;
scene.regions = [{ id: "aura-region", flags: { dnd5e: { activity: auraUuid } } },
  { id: "other-region", flags: { dnd5e: { activity: "Actor.other.Item.aura.Activity.main" } } }];
const deleteTokens = scene.deleteEmbeddedDocuments;
scene.deleteEmbeddedDocuments = async (type, ids) => {
  if (type === "Token") return deleteTokens.call(scene, type, ids);
  assert.equal(type, "Region"); assert.deepEqual(ids, ["aura-region"]);
  scene.regions = scene.regions.filter(r => !ids.includes(r.id));
};
owner.effects[0].disabled = true; await endExpiredVestigeAuras();
assert.equal(scene.regions.length, 2, "отключение не уничтожает шаблон и позволяет включить ауру обратно");
owner.effects[0].disabled = false; game.time.worldTime += 10800;
await endExpiredVestigeAuras();
assert.equal(owner.effects.length, 0); assert.equal(source.actor.effects.length, 0);
assert.deepEqual(scene.regions.map(r => r.id), ["other-region"], "истечение снимает только эффекты и шаблоны этой ауры");
console.error = log;
console.log("Аура реликта: нативные эффекты и эманация, дистанция/высота/уровень, длительность и переключение, спасение/ActorDelta, обязательный уход, запрет до отдыха, частичные ошибки и старые эффекты: OK.");
const init = [], registrations = new Map(), listeners = new Map();
globalThis.Hooks = { on(event, callback) { if (!listeners.has(event)) listeners.set(event, []); listeners.get(event).push(callback); }, once(event, callback) { if (event === "init") init.push(callback); } };
globalThis.CONFIG = { DND5E: { activityConsumptionTypes: {}, activityTypes: Object.fromEntries(["utility", "save", "heal", "attack", "cast", "summon", "teleport"].map(type => [type, {}])),
  sourceBooks: {}, featureTypes: { feat: { subtypes: {} }, class: { subtypes: {} } } } };
globalThis.libWrapper = { register(module, target, callback) {
  assert.equal(registrations.has(target), false, `дублирующая регистрация libWrapper: ${target}`);
  registrations.set(target, callback);
} };
dnd5e.registry = { spellLists: { register() {} } };
await import("../scripts/spikependium.mjs"); init.at(-1)();
assert(registrations.has("CONFIG.ActiveEffect.dataModels.base.prototype.evaluateCondition"));
assert(registrations.has("CONFIG.DND5E.activityTypes.utility.documentClass.prototype.getAppliedEffectChanges"));
const { prepareFocusCasting } = await import("../scripts/griffon-focus-casting.mjs"), { canUseGriffonTwo } = await import("../scripts/griffon-two-items.mjs");
assert.ok(listeners.get("dnd5e.preUseActivity").indexOf(prepareFocusCasting) < listeners.get("dnd5e.preUseActivity").indexOf(canUseGriffonTwo), "снятие вербального компонента должно предшествовать проверке немоты");
console.log("Инициализация интеграции: регистрации libWrapper без конфликтов: OK.");
