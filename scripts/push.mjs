import { strikeHitSnapshots } from "./opportunity.mjs";
import { attackHitTargets } from "./companions.mjs";

const pending = new Set();
const ACTION = "spikependiumPush";
const turnKey = combat => combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : null;
const position = token => Object.fromEntries(["x", "y", "elevation", "level", "width", "height", "depth", "shape"].map(k => [k, token[k]]));
const samePosition = (token, snapshot) => !!token && !!snapshot && Object.entries(position(token)).every(([k, v]) => snapshot[k] === v);

export function registerPushMovement() {
  CONFIG.Token.movement.actions[ACTION] = { label: "Толчок Крупного спутника", canSelect: false,
    icon: "fa-solid fa-arrows-left-right", teleport: false, measure: false, walls: "move", terrainAction: null,
    getCostFunction: () => () => 0 };
}

export function bigPushSnapshots(message) {
  if (message.type !== "attack") return [];
  const source = message.getAssociatedToken();
  if (!source?.actor?.flags.spikependium?.key?.includes(":big-")) return [];
  const eligible = strikeHitSnapshots(message);
  return attackHitTargets(message).flatMap(({ index, token: target }) => {
    const hit = eligible.find(h => h.token === target.uuid);
    if (!hit || source.parent !== target.parent || !["tiny", "sm", "med", "lg"].includes(target.actor.system.traits.size)) return [];
    const combat = hit.combat ? fromUuidSync(hit.combat) : game.combat;
    return [{ index, token: hit.token, actor: hit.actor, source: source.uuid, sourceActor: source.actor.uuid,
      from: position(target), origin: position(source), combat: combat?.started ? combat.uuid : null, turn: turnKey(combat) }];
  });
}

export function recordBigPush(message) {
  if (message.type !== "attack") return;
  const hits = bigPushSnapshots(message);
  if (hits.length) message.updateSource({ "flags.spikependium.bigPushHits": hits });
}

export function occupied(target, destination, ignored = [target], tokens = target.parent.tokens) {
  const grid = target.parent.grid;
  const spaces = target.getOccupiedGridSpaceOffsets(destination);
  const size = target.getSize();
  return tokens.some(other => {
    if (ignored.includes(other) || !["character", "npc"].includes(other.actor?.type) || other.level !== (destination.level ?? target.level)) return false;
    const top = destination.elevation + Math.max(target.depth ?? 0, 0.01) * grid.distance;
    const otherTop = other.elevation + Math.max(other.depth ?? 0, 0.01) * grid.distance;
    if (top <= other.elevation || otherTop <= destination.elevation) return false;
    const otherSpaces = other.getOccupiedGridSpaceOffsets();
    if (spaces.length && otherSpaces.length) return spaces.some(a => otherSpaces.some(b => a.i === b.i && a.j === b.j));
    const otherSize = other.getSize();
    return destination.x < other.x + otherSize.width && destination.x + size.width > other.x
      && destination.y < other.y + otherSize.height && destination.y + size.height > other.y;
  });
}

export function bigPushDestination(source, target, feet) {
  if (!Number.isFinite(feet) || feet <= 0 || feet > 10 || source.parent !== target.parent
    || !canvas.ready || canvas.scene !== target.parent || !target.object) return null;
  const grid = target.parent.grid;
  const units = dnd5e.utils.convertLength(feet, "ft", grid.units);
  const start = target.getCenterPoint();
  const origin = source.getCenterPoint();
  const dx = start.x - origin.x, dy = start.y - origin.y;
  const dz = (target.elevation - source.elevation) * grid.size / grid.distance;
  const length = Math.hypot(dx, dy, dz);
  if (!length || !Number.isFinite(units) || units <= 0) return null;
  const scale = units * grid.size / grid.distance / length;
  const end = target.getSnappedPosition({ x: target.x + dx * scale, y: target.y + dy * scale,
    elevation: target.elevation + dz * scale * grid.distance / grid.size });
  const [path] = target.object.constrainMovementPath([{ ...position(target), action: ACTION }, { ...position(target), ...end, action: ACTION }],
    { ignoreCost: true, ignoreWalls: false, ignoreTokens: false, history: false, preview: false });
  // Нативное непромеряемое движение не расходует скорость; предел правила измеряется обычной сеткой отдельно.
  const destination = target.getCompleteMovementPath(path).toReversed().find(point => {
    const moved = grid.measurePath([start, target.getCenterPoint(point)]).distance;
    const away = (point.x - target.x) * dx + (point.y - target.y) * dy
      + (point.elevation - target.elevation) * grid.size / grid.distance * dz;
    return Number.isFinite(moved) && moved > 0 && moved <= units + 1e-8 && away > 0 && !occupied(target, point);
  });
  if (!destination) return null;
  return { x: destination.x, y: destination.y, elevation: destination.elevation, level: destination.level ?? target.level,
    action: ACTION, snapped: destination.snapped ?? false, explicit: true };
}

export async function chooseBigPush(message) {
  if (!game.user.isActiveGM || message.type !== "attack" || !message.author || pending.has(message.id)) return;
  const activity = message.getAssociatedActivity();
  if (!activity?.actor?.testUserPermission(message.author, "OWNER")) return;
  const recorded = message.flags.spikependium?.bigPushHits;
  const hits = bigPushSnapshots(message).filter(hit => !recorded || (Array.isArray(recorded) && recorded.some(old => old?.index === hit.index && old.token === hit.token
    && old.actor === hit.actor && old.source === hit.source && old.sourceActor === hit.sourceActor && old.combat === hit.combat
    && old.turn === hit.turn && samePosition(fromUuidSync(hit.token), old.from) && samePosition(fromUuidSync(hit.source), old.origin))));
  const movedPositions = new Map();
  pending.add(message.id);
  try {
    for (const hit of hits) {
      hit.from = movedPositions.get(hit.token) ?? hit.from;
      const event = `${message.id}:${hit.index}:${hit.token}`;
      const decisions = message.flags.spikependium?.bigPushDecisions;
      if (Array.isArray(decisions) && decisions.includes(event)) continue;
      const source = fromUuidSync(hit.source), target = fromUuidSync(hit.token);
      if (!canvas.ready || canvas.scene !== target.parent || !target.object) {
        ui.notifications.warn("Толчок Крупного спутника: откройте сцену и переместите цель вручную; автоматическая проверка стен требует активной сцены.");
        continue;
      }
      try {
        // Квитанция до окна и движения исключает повторный толчок после перезагрузки или частичной ошибки.
        await message.setFlag("spikependium", "bigPushDecisions", [...(Array.isArray(decisions) ? decisions : []), event]);
        const summonOrigin = source.actor.flags.dnd5e?.summon?.origin;
        const creator = summonOrigin ? fromUuidSync(summonOrigin)?.actor : null;
        const owner = !source.hidden && !target.hidden && !message.blind && !message.whisper?.length
          ? game.users.filter(u => u.active && !u.isGM && (creator ?? source.actor).testUserPermission(u, "OWNER"))
            .sort((a, b) => a.id.localeCompare(b.id))[0] : null;
        const result = await foundry.applications.api.DialogV2.query(owner ?? game.user, "input", {
          window: { title: "Крупный спутник — толчок после попадания" }, rejectClose: false,
          content: `<p>${foundry.utils.escapeHTML(source.name)} попадает по ${foundry.utils.escapeHTML(target.name)}. Отбросить цель от спутника? Если реакция отменяет попадание, пропустите толчок.</p>`
            + '<div class="form-group"><label for="spike-push-distance">Расстояние, футы (0 — пропустить)</label><input id="spike-push-distance" name="distance" type="number" min="0" max="10" step="any" value="0" required></div>',
          ok: { label: "Применить выбор" }
        });
        if (!result || result.distance === 0 || result.distance === "0") continue;
        const distance = typeof result.distance === "number" ? result.distance : typeof result.distance === "string" && result.distance.trim() ? Number(result.distance) : NaN;
        if (distance === 0) continue;
        const combat = hit.combat ? fromUuidSync(hit.combat) : null;
        if (!game.user.isActiveGM || !activity.actor.testUserPermission(message.author, "OWNER")
          || fromUuidSync(hit.source) !== source || fromUuidSync(hit.token) !== target
          || target.actor.uuid !== hit.actor || source.actor.uuid !== hit.sourceActor || !target.isOwner
          || !samePosition(source, hit.origin) || !samePosition(target, hit.from) || (hit.combat && turnKey(combat) !== hit.turn)
          || !bigPushSnapshots(message).some(h => h.index === hit.index && h.token === hit.token)) {
          ui.notifications.warn("Толчок не выполнен: попадание, положение токенов или ход изменились. При необходимости разрешите его вручную.");
          continue;
        }
        const destination = bigPushDestination(source, target, distance);
        if (!destination) {
          ui.notifications.warn("Нет допустимого свободного места для толчка на выбранное расстояние. Проверьте размер, сетку, стены и высоту; при необходимости разрешите перемещение вручную.");
          continue;
        }
        const completed = await target.move(destination, { constrainOptions: { ignoreWalls: false, ignoreCost: true, ignoreTokens: false },
          autoRotate: false, pan: false, showRuler: true,
          spikependium: { forcedMovement: true, bigPush: event } });
        if (completed) movedPositions.set(hit.token, position(target));
        if (!completed) ui.notifications.warn("Толчок остановлен штатной обработкой движения. Проверьте положение цели; повторно он не запускается.");
      } catch (error) {
        console.error("Spikependium: толчок Крупного спутника", error);
        ui.notifications.error("Не удалось закончить толчок. Проверьте положение цели перед ручным перемещением; автоматического повтора нет.");
      }
    }
  } finally { pending.delete(message.id); }
}
