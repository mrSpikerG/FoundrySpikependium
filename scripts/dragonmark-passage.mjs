import { incapacitated, tokensDistance } from "./effects.mjs";
import { castingToken } from "./conduit.mjs";
import { occupied } from "./push.mjs";

const KEY = "feat:greater-passage", MOD = "Vl0oFwi704F3L2mp", ACTION = "spikependiumPassage";
const captured = new WeakMap(), prepared = new WeakMap(), running = new Set(), choosing = new Set();
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const turn = () => game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : null;
const protectedScene = scene => !game.users.some(u => !u.isGM && scene.canUserModify(u, "update"));
const position = token => Object.fromEntries(["x", "y", "elevation", "level", "width", "height", "depth", "shape"].map(k => [k, token[k]]));
const same = (token, point) => !!token && !!point && Object.entries(position(token)).every(([k, v]) => point[k] === v);
const liveMovement = token => ["planned", "pending", "paused"].includes(token.movement?.state);
function enhancement(activity) {
  if (activity?.item?.type !== "spell" || activity.item.system.identifier !== "misty-step"
    || activity.item.flags.spikependium?.storedSpell || activity.type !== "teleport" || !activity.actor?.isOwner) return;
  const item = activity.actor.items.find(i => i.flags.spikependium?.key === KEY), resource = item?.system.activities.get(MOD);
  return resource ? { item, resource } : undefined;
}
export function registerPassageMovement() {
  CONFIG.Token.movement.actions[ACTION] = { ...CONFIG.Token.movement.actions.blink,
    label: "Вдохновлённый путь", canSelect: false, teleport: true, measure: false,
    terrainAction: null, costMultiplier: 0, getCostFunction: () => () => 0 };
}
export function canUsePassageModifier(activity) {
  if (activity?.id !== MOD || activity.item.flags.spikependium?.key !== KEY) return true;
  ui.notifications.warn("Вдохновлённый путь выбирается при накладывании Туманного шага.");
  return false;
}
export function preparePassageDialog(activity, config, dialog) {
  if (!(enhancement(activity)?.resource.uses.value > 0)) return;
  config.spikependium = { ...config.spikependium, usageChoice: true };
  const choices = Object.fromEntries([...game.user.targets].map(t => t.document ?? t)
    .filter(t => t.actor?.system.isCreature && t.actor.uuid !== activity.actor.uuid).map(t => [t.uuid, t.name]));
  const Base = dialog.applicationClass;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      context.fields.push({ name: "spikependium.improvedPassage", value: this.config.spikependium?.improvedPassage ?? false,
        field: new foundry.data.fields.BooleanField({ label: "Вдохновлённый путь",
          hint: "Вы подтверждаете согласие спутника, касание и видимость места для себя собственными чувствами. До расхода выберите два свободных места: для себя в пределах 30 футов, затем для спутника в пределах 5 футов от вас." }),
        input: context.inputs.createCheckboxInput });
      context.fields.push({ name: "spikependium.passageCompanion", value: this.config.spikependium?.passageCompanion ?? Object.keys(choices)[0] ?? "",
        field: new foundry.data.fields.StringField({ label: "Согласный спутник — отметьте до открытия окна", choices: { "": "Выберите спутника", ...choices } }) });
      context.hasConsumption = true;
      return context;
    }
  };
}
function validParticipants(activity, record, initial = true) {
  if (!activity?.actor) return;
  const origin = resolve(record?.origin), caster = resolve(record?.casterToken), ally = resolve(record?.allyToken), scene = resolve(record?.scene);
  if (!scene || !origin || !caster || !ally || caster === ally || caster.actor?.uuid !== activity.actor.uuid
    || ally.actor?.uuid !== record.ally || ally.actor.uuid === activity.actor.uuid || !ally.actor.system.isCreature
    || [origin, caster, ally].some(t => t.parent !== scene || (initial && liveMovement(t))) || !castingToken(activity, origin)
    || incapacitated(activity.actor) || activity.actor.statuses.has("antimagic") || ally.actor.statuses.has("antimagic")
    || ally.actor.statuses.has("dead")) return;
  if (initial) {
    const distance = tokensDistance(origin, ally);
    if (origin.level !== ally.level || distance == null || distance > 5
      || !same(origin, record.originPosition) || !same(caster, record.first) || !same(ally, record.second)) return;
  }
  return { origin, caster, ally, scene };
}
export function canActDuringPassage(activity) {
  if (activity?.activation?.type === "reaction") return true;
  const uuid = activity?.actor?.uuid;
  if (!uuid) return true;
  const pending = [...game.scenes].some(s => protectedScene(s) && Object.values(s.flags.spikependium?.passages ?? {})
    .some(r => r.state === "moving" && game.users.get(r.author)?.isGM && [r.caster, r.ally].includes(uuid)))
    || [...game.actors, ...[...game.scenes].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean)
      .some(a => Object.values(a.flags.spikependium?.passageCasts ?? {}).some(r => r.local && r.state === "moving" && [r.caster, r.ally].includes(uuid)));
  if (pending) ui.notifications.warn("Сначала завершите незаконченный Вдохновлённый путь. Реакции и последствия телепортации остаются доступны.");
  return !pending;
}
export function capturePassage(activity, config, message) {
  captured.delete(activity);
  if (!config.spikependium?.improvedPassage) return;
  const origin = castingToken(activity, activity.getUsageToken());
  const caster = dnd5e.utils.getSceneTargets(activity.actor)[0]?.document;
  const ally = resolve(config.spikependium.passageCompanion);
  const record = origin && caster && ally && { origin: origin.uuid, originPosition: position(origin),
    caster: activity.actor.uuid, casterToken: caster.uuid, ally: ally.actor?.uuid, allyToken: ally.uuid,
    first: position(caster), second: position(ally), scene: origin.parent.uuid, time: game.time.worldTime, turn: turn() };
  const local = origin && (!game.users.activeGM || !protectedScene(origin.parent));
  if (!(enhancement(activity)?.resource.uses.value > 0) || message.create === false || !canvas.ready || canvas.scene !== origin?.parent
    || !validParticipants(activity, record) || !canActDuringPassage(activity)
    || (local && ![caster, ally].every(t => t.canUserModify(game.user, "update")))) {
    ui.notifications.warn("Вдохновлённый путь: нужны ваш токен, согласный спутник в пределах касания, активная сцена и Мастер либо права управления обоими токенами. Проверьте антимагию и текущее движение.");
    return false;
  }
  captured.set(activity, { ...record, local });
}
function destinationsValid(pair, record) {
  const { caster, ally, origin, scene } = pair;
  const points = [record.toCaster, record.toAlly];
  if (points.some(p => !p || ![p.x, p.y, p.elevation].every(Number.isFinite)
    || !scene.levels.get(p.level)) || ["width", "height", "depth", "shape"].some(k => points[0][k] !== caster[k] || points[1][k] !== ally[k])) return false;
  const first = new CONFIG.Token.documentClass({ ...caster.toObject(), ...points[0] }, { parent: scene });
  const second = new CONFIG.Token.documentClass({ ...ally.toObject(), ...points[1] }, { parent: scene });
  const distance = tokensDistance(origin, first), separation = tokensDistance(first, second);
  return distance != null && distance <= 30 && separation != null && separation <= 5
    && !occupied(caster, points[0], [caster, ally]) && !occupied(ally, points[1], [caster, ally])
    && !occupied(ally, points[1], [], [first]);
}
async function choose(token) {
  let destination;
  await canvas.tokens.placeTokens([token.toObject()], { create: false,
    preConfirm: ({ document }) => { destination = position(document); } });
  return destination;
}
export async function preparePassageUpdates(activity, config, updates) {
  prepared.delete(activity);
  if (!config.spikependium?.improvedPassage) return updates;
  const snapshot = captured.get(activity), selected = enhancement(activity), pair = validParticipants(activity, snapshot);
  if (!(selected?.resource.uses.value > 0) || !pair || choosing.has(activity.actor.uuid)) return false;
  choosing.add(activity.actor.uuid);
  try {
    ui.notifications.info("Вдохновлённый путь: выберите видимое свободное место для себя в пределах 30 футов.");
    const toCaster = await choose(pair.caster);
    if (!toCaster) return false;
    ui.notifications.info("Выберите свободное место для спутника в пределах 5 футов от выбранного места для себя.");
    const toAlly = await choose(pair.ally);
    if (!toAlly) return false;
    const current = validParticipants(activity, snapshot), data = { ...snapshot, toCaster, toAlly, spell: activity.item.uuid,
      conduit: activity.item.flags.spikependium?.conduitCasting ?? null,
      feat: selected.item.id, author: game.user.id, state: "pending" };
    if (!current || !destinationsValid(current, data) || snapshot.time !== game.time.worldTime || snapshot.turn !== turn()
      || enhancement(activity)?.item !== selected.item || selected.resource.uses.value <= 0 || !canActDuringPassage(activity)
      || snapshot.local !== (!game.users.activeGM || !protectedScene(pair.scene))
      || (snapshot.local && ![pair.caster, pair.ally].every(t => t.canUserModify(game.user, "update")))) {
      ui.notifications.warn("Условия или места Вдохновлённого пути изменились. Ресурсы не списаны; повторите выбор.");
      return false;
    }
    const id = foundry.utils.randomID(), spent = selected.resource.uses.spent + 1;
    let update = updates.item.find(u => u._id === selected.item.id);
    if (!update) { update = { _id: selected.item.id }; updates.item.push(update); }
    update[`system.activities.${MOD}.uses.spent`] = spent;
    updates.actor[`flags.spikependium.passageCasts.${id}`] = data;
    prepared.set(activity, { id, data, spent });
    return updates;
  } finally { choosing.delete(activity.actor.uuid); }
}
export function recordPassageCast(activity, message) {
  const selected = prepared.get(activity);
  if (!selected) return;
  prepared.delete(activity);
  const current = enhancement(activity), record = activity.actor.flags.spikependium?.passageCasts?.[selected.id];
  if (current?.item.id !== selected.data.feat || current.resource.uses.spent !== selected.spent
    || JSON.stringify(record) !== JSON.stringify(selected.data)) return;
  foundry.utils.setProperty(message, "data.flags.spikependium.passageCast", { id: selected.id, caster: activity.actor.uuid });
  (message.data.system.properties ??= []).push({ type: "text", text: `Вдохновлённый путь: ${resolve(selected.data.allyToken)?.name ?? "согласный спутник"}` });
  message.data.system.buttons = (message.data.system.buttons ?? []).filter(b => b.action !== "planTeleport");
}
export function passageChatButtons(wrapped, message) {
  const buttons = wrapped(message);
  return prepared.has(this) || message?.flags?.spikependium?.passageCast || message?.data?.flags?.spikependium?.passageCast
    ? buttons.filter(b => b.action !== "planTeleport") : buttons;
}
async function finishPassage(activity, record, id, save) {
  const key = `${record.scene}:${id}`;
  if (running.has(key) || record.state !== "moving" || !canvas.ready || canvas.scene?.uuid !== record.scene) return;
  running.add(key);
  let validating = true;
  try {
    const pair = validParticipants(activity, record, false);
    if (pair && [pair.origin, pair.caster, pair.ally].some(liveMovement)) return;
    if (!pair || !destinationsValid(pair, record)) throw Error("Участники или свободное место изменились");
    if (!record.local && (!game.user.isActiveGM || !protectedScene(pair.scene) || !game.users.get(record.author)?.isGM)) return;
    if (record.local && (game.user.id !== record.author || ![pair.caster, pair.ally].every(t => t.canUserModify(game.user, "update")))) return;
    const instructions = {};
    for (const [token, from, to] of [[pair.caster, record.first, record.toCaster], [pair.ally, record.second, record.toAlly]]) {
      if (same(token, to)) continue;
      if (!same(token, from)) throw Error("Токен уже перемещён другим действием");
      if (token.movement?.state === "stopped" && token.movement.updateOptions?.spikependium?.passage === id) {
        await save("state", "stopped"); return;
      }
      instructions[token.id] = { destination: { x: to.x, y: to.y, elevation: to.elevation, level: to.level, action: ACTION, explicit: true } };
    }
    validating = false;
    if (Object.keys(instructions).length) {
      const results = await pair.scene.moveTokens(instructions, { autoRotate: false, showRuler: false,
        constrainOptions: { ignoreWalls: true, ignoreCost: true, ignoreTokens: true }, spikependium: { passage: id } });
      if (Object.keys(instructions).some(tokenId => results[tokenId] !== true)
        || !same(pair.caster, record.toCaster) || !same(pair.ally, record.toAlly)) {
        await save("state", "stopped");
        ui.notifications.warn("Вдохновлённый путь остановлен штатным движением. Проверьте участников и последствия регионов; автоматического повтора нет.");
        return;
      }
    }
    await save("state", "done");
  } catch (error) {
    if (validating) await save("state", "stopped");
    console.error("Spikependium: Вдохновлённый путь", error);
    ui.notifications.error(validating ? "Условия телепортации изменились. Операция остановлена; проверьте участников."
      : "Вдохновлённый путь не завершён. Запись сохранена; не перемещайте участников до разрешения ошибки. Повтор продолжит незавершённую операцию.");
  } finally { running.delete(key); }
}
export async function applyPassageCast(message) {
  const ticket = message.flags.spikependium?.passageCast;
  if (message.type !== "usage" || !ticket || !/^[A-Za-z0-9]{16}$/.test(ticket.id) || !message.author) return;
  const activity = message.getAssociatedActivity(), actor = resolve(ticket.caster), record = actor?.flags.spikependium?.passageCasts?.[ticket.id];
  if (!activity || activity.actor !== actor || !record || record.caster !== actor.uuid || record.spell !== activity.item.uuid
    || activity.item.type !== "spell" || activity.item.system.identifier !== "misty-step" || activity.type !== "teleport"
    || activity.item.flags.spikependium?.storedSpell || record.author !== message.author.id || !actor.testUserPermission(message.author, "OWNER")
    || !message.system.deltas?.item?.[record.feat]?.some(d => d.keyPath === `system.activities.${MOD}.uses.spent` && d.delta === 1)) return;
  const scene = resolve(record.scene);
  if (!scene) return;
  const saved = !record.local && scene.flags.spikependium?.passages?.[ticket.id];
  if (saved) {
    if (saved.message !== message.uuid || !game.user.isActiveGM || !protectedScene(scene) || !game.users.get(saved.author)?.isGM) return;
    return finishPassage(activity, saved, ticket.id, (key, value) => scene.setFlag("spikependium", `passages.${ticket.id}.${key}`, value));
  }
  if (record.local) {
    if (game.user.id !== message.author.id || !actor.isOwner || ![resolve(record.casterToken), resolve(record.allyToken)]
      .every(t => t?.canUserModify(game.user, "update"))) return;
    const save = (key, value) => actor.setFlag("spikependium", `passageCasts.${ticket.id}.${key}`, value);
    if (record.state === "moving") return finishPassage(activity, record, ticket.id, save);
  } else if (!game.user.isActiveGM || !protectedScene(scene)) return;
  if (record.state !== "pending" || record.time !== game.time.worldTime || record.turn !== turn()
    || !canvas.ready || canvas.scene !== scene || !canActDuringPassage(activity)) return;
  const pair = validParticipants(activity, record);
  if (!pair || !destinationsValid(pair, record) || !actor.items.some(i => i.id === record.feat && i.flags.spikependium?.key === KEY)) return;
  const key = `${scene.uuid}:${ticket.id}`;
  if (running.has(key)) return;
  running.add(key);
  try {
    if (record.local) {
      await actor.setFlag("spikependium", `passageCasts.${ticket.id}.state`, "moving");
      running.delete(key);
      await finishPassage(activity, actor.flags.spikependium.passageCasts[ticket.id], ticket.id,
        (k, v) => actor.setFlag("spikependium", `passageCasts.${ticket.id}.${k}`, v));
    } else {
      await scene.setFlag("spikependium", `passages.${ticket.id}`, { ...record, state: "moving", author: game.user.id, message: message.uuid });
      running.delete(key);
      await finishPassage(activity, scene.flags.spikependium.passages[ticket.id], ticket.id,
        (k, v) => scene.setFlag("spikependium", `passages.${ticket.id}.${k}`, v));
    }
  } finally { running.delete(key); }
}
export async function resumePassageCasts() {
  // A sealed partial move must also finish after its chat card or spell has been deleted.
  const savedActivity = record => ({ actor: resolve(record.caster), item: { flags: { spikependium: { conduitCasting: record.conduit } } } });
  if (game.user.isActiveGM) for (const scene of game.scenes) {
    if (!protectedScene(scene)) continue;
    for (const [id, record] of Object.entries(scene.flags.spikependium?.passages ?? {})) {
      if (record.local || !game.users.get(record.author)?.isGM) continue;
      await finishPassage(savedActivity(record), record, id, (k, v) => scene.setFlag("spikependium", `passages.${id}.${k}`, v));
    }
  }
  const actors = new Map([...game.actors, ...[...game.scenes].flatMap(s => [...s.tokens].map(t => t.actor))]
    .filter(Boolean).map(a => [a.uuid, a]));
  for (const actor of actors.values()) for (const [id, record] of Object.entries(actor.flags.spikependium?.passageCasts ?? {})) {
    if (!record.local || record.caster !== actor.uuid || record.author !== game.user.id || !actor.isOwner) continue;
    await finishPassage(savedActivity(record), record, id, (k, v) => actor.setFlag("spikependium", `passageCasts.${id}.${k}`, v));
  }
  for (const message of game.messages) if (message.flags.spikependium?.passageCast) await applyPassageCast(message);
}
