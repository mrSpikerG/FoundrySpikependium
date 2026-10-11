import { incapacitated, tokensDistance } from "./effects.mjs";
import { vestigeTokens, vestigeLocked, pendingVestigeForm } from "./pocket.mjs";
import { occupied } from "./push.mjs";

const ID = "rD9bLz1LEKGMNjZ9", FEATURE = "subclass:vestige-patron:vestige-companion";
const ACTION = "spikependiumSwap", running = new Set(), starting = new Set();
const isSwap = a => a?.id === ID && a.actor?.flags.spikependium?.key === "actor:vestige-fiend";
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const position = token => Object.fromEntries(["x", "y", "elevation", "level", "width", "height", "depth", "shape"].map(k => [k, token[k]]));
const same = (token, point) => !!token && !!point && Object.entries(position(token)).every(([k,v]) => point[k] === v);
const turn = () => game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : null;
const protectedScene = scene => !game.users.some(u => !u.isGM && scene.canUserModify(u, "update"));
const liveMovement = token => ["planned", "pending", "paused"].includes(token.movement?.state);

export function canActDuringVestigeSwap(activity) {
  if (activity?.activation?.type === "reaction") return true;
  const uuid = activity?.actor?.uuid;
  if (!uuid || ![...game.scenes].some(s => protectedScene(s) && Object.values(s.flags.spikependium?.vestigeSwaps ?? {})
    .some(r => r.state === "moving" && game.users.get(r.author)?.isGM && [r.actor, r.caster].includes(uuid)))) return true;
  ui.notifications.warn("Сначала завершите незаконченный обмен местами реликта. Реакции и последствия телепортации остаются доступны.");
  return false;
}

export function registerVestigeSwapMovement() {
  CONFIG.Token.movement.actions[ACTION] = { ...CONFIG.Token.movement.actions.blink,
    label: "Дьявольская замена", canSelect: false, teleport: true, measure: false,
    terrainAction: null, costMultiplier: 0, getCostFunction: () => () => 0 };
}

function pair(activity, ownerToken) {
  const source = activity.getUsageToken(), item = resolve(activity.actor.flags.dnd5e?.summon?.origin);
  if (item?.flags.spikependium?.key !== FEATURE || source?.actor.uuid !== activity.actor.uuid
    || !vestigeTokens(item).includes(source) || source.actor.system.attributes.hp.value <= 0 || incapacitated(source.actor)
    || source.actor.statuses.has("antimagic") || item.actor.statuses.has("dead") || item.actor.statuses.has("antimagic")
    || vestigeLocked(item) || pendingVestigeForm(item)) return;
  const owners = source.parent.tokens.filter(t => t.actor?.uuid === item.actor.uuid);
  const selected = owners.filter(t => [...game.user.targets].some(target => (target.document ?? target) === t));
  const owner = ownerToken ? owners.find(t => t.uuid === ownerToken) : owners.length === 1 ? owners[0] : selected.length === 1 ? selected[0] : null;
  const distance = owner && tokensDistance(source, owner);
  if (!owner || source === owner || distance == null || distance > 60 || liveMovement(source) || liveMovement(owner)) return;
  return { source, owner, item };
}

function destinations(source, owner) {
  const first = position(source), second = position(owner);
  const relocate = (a,b) => ({ ...a, x: b.x, y: b.y, elevation: b.elevation, level: b.level });
  return { first, second, toSource: relocate(first, second), toOwner: relocate(second, first) };
}

export function canUseVestigeSwap(activity) {
  if (!isSwap(activity)) return true;
  if (!canActDuringVestigeSwap(activity)) return false;
  const result = pair(activity);
  if (result) {
    const { toSource, toOwner } = destinations(result.source, result.owner);
    if (!occupied(result.source, toSource, [result.source, result.owner]) && !occupied(result.owner, toOwner, [result.source, result.owner])) return true;
  }
  ui.notifications.warn("Дьявольская замена: нужен живой реликт и токен его хозяина на одной сцене в пределах 60 футов, с местом для обоих размеров. Если токенов хозяина несколько, отметьте нужный как цель. Сначала завершите текущее движение.");
  return false;
}

export function recordVestigeSwap(activity, message) {
  if (!isSwap(activity)) return;
  const result = pair(activity);
  if (!result) return;
  const { source, owner, item } = result;
  foundry.utils.setProperty(message, "data.flags.spikependium.vestigeSwapRequest", {
    scene: source.parent.uuid, source: source.uuid, owner: owner.uuid, origin: item.uuid,
    actor: source.actor.uuid, caster: owner.actor.uuid, ...destinations(source, owner), time: game.time.worldTime, turn: turn(),
    rest: item.actor.flags.spikependium?.longRest ?? "", recovery: item.actor.flags.spikependium?.vestigeRecovery?.event ?? ""
  });
}

async function finishSwap(scene, id, record) {
  const key = `${scene.uuid}:${id}`;
  if (!game.user.isActiveGM || !protectedScene(scene) || running.has(key) || record.state !== "moving"
    || !game.users.get(record.author)?.isGM || !canvas.ready || canvas.scene !== scene) return;
  running.add(key);
  let validating = true;
  try {
    const source = resolve(record.source), owner = resolve(record.owner), item = resolve(record.origin);
    if (!source || !owner || source.parent !== scene || owner.parent !== scene || source.actor.uuid !== record.actor || owner.actor.uuid !== record.caster
      || item?.flags.spikependium?.key !== FEATURE || item.actor.uuid !== record.caster || source.actor.flags.dnd5e?.summon?.origin !== item.uuid
      || source.actor.flags.spikependium?.key !== "actor:vestige-fiend" || owner.actor.statuses.has("dead")
      || source.actor.system.attributes.hp.value <= 0 || incapacitated(source.actor) || source.actor.statuses.has("antimagic")
      || owner.actor.statuses.has("antimagic") || pendingVestigeForm(item) || vestigeLocked(item))
      throw Error("Участники или условия телепортации изменились");
    if (liveMovement(source) || liveMovement(owner)) return;
    if ([source, owner].some(t => t.movement?.state === "stopped" && t.movement.updateOptions?.spikependium?.vestigeSwap === id)) {
      await scene.setFlag("spikependium", `vestigeSwaps.${id}.state`, "stopped");
      return;
    }
    const instructions = {};
    for (const [token, from, to] of [[source, record.first, record.toSource], [owner, record.second, record.toOwner]]) {
      if (same(token, to)) continue;
      if (!same(token, from)) throw Error("Токен уже перемещён другим действием");
      if (occupied(token, to, [source, owner])) throw Error("Место назначения занято");
      instructions[token.id] = { destination: { x: to.x, y: to.y, elevation: to.elevation, level: to.level, action: ACTION, explicit: true } };
    }
    if (Object.keys(instructions).length) {
      validating = false;
      const results = await scene.moveTokens(instructions, { autoRotate: false, showRuler: false,
        constrainOptions: { ignoreWalls: true, ignoreCost: true, ignoreTokens: true }, spikependium: { vestigeSwap: id } });
      if (Object.keys(instructions).some(tokenId => results[tokenId] !== true) || !same(source, record.toSource) || !same(owner, record.toOwner)) {
        await scene.setFlag("spikependium", `vestigeSwaps.${id}.state`, "stopped");
        ui.notifications.warn("Дьявольская замена остановлена штатным движением. Проверьте оба токена и последствия регионов; автоматического повтора нет.");
        return;
      }
    }
    validating = false;
    await scene.setFlag("spikependium", `vestigeSwaps.${id}.state`, "done");
  } catch (error) {
    if (validating && game.user.isActiveGM) await scene.setFlag("spikependium", `vestigeSwaps.${id}.state`, "stopped");
    console.error("Spikependium: Дьявольская замена", error);
    ui.notifications.error(validating ? "Условия обмена изменились; операция остановлена. Проверьте оба токена вручную."
      : "Обмен местами не завершён. Запись сохранена на сцене; не перемещайте участников до разрешения ошибки. При подключении Мастера операция проверяется повторно.");
  } finally { running.delete(key); }
}

export async function handleVestigeSwap(message) {
  if (!game.user.isActiveGM || message.type !== "usage" || !message.author || !/^[A-Za-z0-9]+$/.test(message.id)) return;
  const activity = message.getAssociatedActivity(), request = message.flags.spikependium?.vestigeSwapRequest;
  if (!isSwap(activity) || !request || !activity.actor.testUserPermission(message.author, "OWNER")) return;
  const scene = resolve(request.scene);
  if (!scene || !protectedScene(scene)) return;
  const saved = scene.flags.spikependium?.vestigeSwaps?.[message.id];
  if (saved) return finishSwap(scene, message.id, saved);
  const result = pair(activity, request.owner);
  if (!result || result.source.parent !== scene || result.source.uuid !== request.source || result.source.actor.uuid !== request.actor
    || result.owner.actor.uuid !== request.caster || result.item.uuid !== request.origin
    || request.time !== game.time.worldTime || request.turn !== turn()
    || request.rest !== (result.item.actor.flags.spikependium?.longRest ?? "")
    || request.recovery !== (result.item.actor.flags.spikependium?.vestigeRecovery?.event ?? "")
    || !same(result.source, request.first) || !same(result.owner, request.second)) return;
  const plan = destinations(result.source, result.owner);
  if (occupied(result.source, plan.toSource, [result.source, result.owner]) || occupied(result.owner, plan.toOwner, [result.source, result.owner])) return;
  const key = `${scene.uuid}:${message.id}`;
  if (running.has(key) || starting.has(result.item.uuid) || !canActDuringVestigeSwap(activity)) return;
  starting.add(result.item.uuid);
  running.add(key);
  try {
    await scene.setFlag("spikependium", `vestigeSwaps.${message.id}`, { source: result.source.uuid, owner: result.owner.uuid,
      actor: result.source.actor.uuid, caster: result.owner.actor.uuid, origin: result.item.uuid,
      ...plan, author: game.user.id, state: "moving" });
    running.delete(key);
    await finishSwap(scene, message.id, scene.flags.spikependium.vestigeSwaps[message.id]);
  } finally { running.delete(key); starting.delete(result.item.uuid); }
}

export async function resumeVestigeSwaps() {
  if (!game.user.isActiveGM) return;
  for (const scene of game.scenes) for (const [id, record] of Object.entries(scene.flags.spikependium?.vestigeSwaps ?? {})) await finishSwap(scene, id, record);
  for (const message of game.messages) if (message.flags.spikependium?.vestigeSwapRequest) await handleVestigeSwap(message);
}
