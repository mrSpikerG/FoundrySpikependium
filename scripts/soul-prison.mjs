import { occupied } from "./push.mjs";

const rolling = new Set(), settling = new Set(), ending = new Set(), returning = new Set();
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const prison = effect => effect?.flags?.spikependium?.soulPrison;
const actors = () => new Map([...game.actors, ...[...game.scenes].flatMap(scene => [...scene.tokens].map(token => token.actor))]
  .filter(Boolean).map(actor => [actor.uuid, actor]));
const authority = actor => actor?.isOwner && (game.users.activeGM ? game.user.isActiveGM
  : game.users.filter(user => user.active && actor.testUserPermission(user, "OWNER")).sort((a, b) => a.id.localeCompare(b.id))[0]?.id === game.user.id);
const controls = activity => activity?.actor?.flags.spikependium?.key === "actor:mm25:arcanaloth"
  && activity.flags.spikependium?.monsterAction === "arcanaloth-banishing";
function live(effect) {
  const info = prison(effect), tome = resolve(info?.tome);
  return effect?.active && !effect.duration.expired && effect.actor?.isOwner && effect.actor.effects.get(effect.id) === effect
    && tome?.system.identifier === "arcanaloth-soul-tome"
    && tome.actor?.flags.spikependium?.key === "actor:mm25:arcanaloth" && tome.system.hp.value > 0 && tome.system.quantity > 0
    && !tome.flags.spikependium?.soulTome?.destroyed && info.generation === (tome.flags.spikependium?.soulTome?.generation ?? "initial");
}
export function soulPrisonButtons(wrapped, ...args) {
  const buttons = wrapped(...args);
  if (!controls(this)) return buttons;
  return [...buttons,
    { action: "soulPrisonArrived", icon: "fa-solid fa-book", label: { value: "Подтвердить перенос в демиплан" } },
    { action: "soulPrisonRepeat", icon: "fa-solid fa-dice-d20", label: { value: "Повторный спасбросок заточённого" } },
    { action: "soulPrisonReturn", icon: "fa-solid fa-person-walking-arrow-loop-left", label: { value: "Вернуть освобождённого" } }];
}
export async function soulPrisonAction(wrapped, event, target, message) {
  const action = target.dataset.action;
  if (!["soulPrisonArrived", "soulPrisonRepeat", "soulPrisonReturn"].includes(action)) return wrapped(event, target, message);
  if (!controls(this) || !this.actor.isOwner) return;
  const selected = (canvas.tokens?.controlled ?? []).map(token => token.document ?? token);
  const token = selected.length === 1 ? selected[0] : null, actor = token?.actor;
  if (!authority(actor)) { ui.notifications.warn("Выберите один токен заточённого существа с правами владельца."); return; }
  if (action === "soulPrisonReturn") {
    const requests = Object.entries(actor.flags.spikependium?.soulPrisonReturns ?? {}).filter(([, value]) => value.state !== "done" && value.origin === message.uuid);
    if (requests.length !== 1) { ui.notifications.warn("У выбранной цели нет единственного незавершённого возвращения из этой карточки."); return; }
    return returnSoulPrisonToken(actor, requests[0][0]);
  }
  const effects = actor.effects.filter(effect => live(effect) && effect.system.origin?.message === message.uuid
    && prison(effect).tome === message.flags.spikependium?.monsterCast?.tome?.uuid);
  if (effects.length !== 1) { ui.notifications.warn("У выбранной цели нет единственного заточения из этой карточки."); return; }
  const effect = effects[0], info = prison(effect);
  if (rolling.has(effect.uuid) || ending.has(effect.uuid)) return;
  if (action === "soulPrisonArrived") {
    if (info.phase !== "awaiting-transfer") return;
    await effect.update({ name: "Заточение в фолианте душ", "flags.spikependium.soulPrison": {
      ...info, phase: "unbound", target: token.uuid, version: foundry.utils.randomID() } });
    ui.notifications.info?.("Перенос подтверждён. В конце хода будет выполнен спасбросок Харизмы.");
  } else {
    if (info.phase !== "unbound") { ui.notifications.warn("Повторный спасбросок доступен после переноса, пока цель ещё не привязана к фолианту."); return; }
    const existing = effect.flags.spikependium.soulPrisonRepeat;
    const request = existing?.pending ? existing : { event: `manual:${foundry.utils.randomID()}`, token: token.uuid, version: info.version, pending: true, started: false };
    if (!existing?.pending) await effect.setFlag("spikependium", "soulPrisonRepeat", request);
    await repeat(effect, request);
  }
}
function repeatInfo(effect, request) {
  const info = prison(effect), token = resolve(request?.token), current = effect?.flags?.spikependium?.soulPrisonRepeat;
  if (!live(effect) || request?.event !== current?.event || request.version !== info.version || token?.actor?.uuid !== effect.actor.uuid
    || request.token !== info.target || !Number.isFinite(info.dc) || info.dc <= 0) return;
  return { info, token };
}
function validSave(message, effect, request) {
  const value = message?.flags?.spikependium?.soulPrisonRepeat, data = repeatInfo(effect, request), roll = message?.rolls?.[0];
  return !!data && message.type === "save" && value?.effect === effect.uuid && value.event === request.event && value.version === request.version
    && value.token === request.token && value.dc === data.info.dc && message.system.ability === "cha"
    && message.getAssociatedActor()?.uuid === effect.actor.uuid && message.getAssociatedToken()?.uuid === request.token
    && !!message.author && (message.author.isGM || effect.actor.testUserPermission(message.author, "OWNER"))
    && roll instanceof CONFIG.Dice.D20Roll && roll._evaluated && roll.options.target === data.info.dc;
}
export async function syncSoulPrisonRepeat(message) {
  const saved = message?.flags?.spikependium?.soulPrisonRepeat, effect = resolve(saved?.effect), request = effect?.flags?.spikependium?.soulPrisonRepeat;
  if (!authority(effect?.actor) || !validSave(message, effect, request) || settling.has(effect.uuid)) return;
  const info = prison(effect), success = message.system.forceSuccess || !message.rolls[0].isFailure;
  if (info.phase === "bound" && info.boundSave !== message.uuid) return;
  if (!["unbound", "bound"].includes(info.phase)) return;
  settling.add(effect.uuid);
  try {
    if (success) {
      await releaseSoulPrison(effect, "save");
      ui.notifications.info?.("Спасбросок успешен. Верните цель в покинутое или ближайшее свободное пространство.");
    } else if (info.phase === "unbound") await effect.update({ name: "Привязан к фолианту душ", "flags.spikependium.soulPrison": {
      ...info, phase: "bound", boundSave: message.uuid }, "flags.spikependium.soulPrisonRepeat": { ...request, pending: false } });
  } finally { settling.delete(effect.uuid); }
}
export function soulPrisonReturnUpdate(effect, reason) {
  const info = prison(effect);
  return info && ["unbound", "bound"].includes(info.phase) ? { [`flags.spikependium.soulPrisonReturns.${effect.id}`]: {
      state: "pending", reason, version: info.version, tome: info.tome, generation: info.generation,
      target: info.target, origin: effect.system.origin?.message,
      return: structuredClone(info.return), privacy: structuredClone(info.privacy ?? {})
    } } : {};
}
export async function releaseSoulPrison(effect, reason) {
  const info = prison(effect), actor = effect?.actor;
  if (!info || !authority(actor) || actor.effects.get(effect.id) !== effect) return;
  await actor.performBulkUpdate({ actor: soulPrisonReturnUpdate(effect, reason),
    operations: [{ action: "delete", documentName: "ActiveEffect", parent: actor, ids: [effect.id] }]
  });
}
export function nearestSoulPrisonSpace(token, original) {
  const scene = token.parent, grid = scene.grid, bounds = scene.dimensions?.sceneRect, size = token.getSize();
  const inside = point => !bounds || (point.x >= bounds.x && point.y >= bounds.y
    && point.x + size.width <= bounds.x + bounds.width && point.y + size.height <= bounds.y + bounds.height);
  if (inside(original) && !occupied(token, original)) return { ...original };
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return null;
  function* positions() {
    if (grid.isGridless) {
      const xs = new Set([original.x, bounds.x, bounds.x + bounds.width - size.width]);
      const ys = new Set([original.y, bounds.y, bounds.y + bounds.height - size.height]);
      // Границы прямоугольников дают ближайшие допустимые позиции на карте без сетки.
      for (const other of scene.tokens) if (other !== token && other.actor && other.level === original.level) {
        const otherSize = other.getSize();
        xs.add(other.x - size.width); xs.add(other.x + otherSize.width);
        ys.add(other.y - size.height); ys.add(other.y + otherSize.height);
      }
      for (const x of xs) for (const y of ys) yield { ...original, x, y };
    } else {
      const [i0, j0, i1, j1] = grid.getOffsetRange(bounds);
      for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) {
        const point = grid.getTopLeftPoint({ i, j });
        yield { ...original, ...token.getSnappedPosition({ ...original, x: point.x, y: point.y }) };
      }
    }
  }
  const origin = token.getCenterPoint(original), seen = new Set();
  let best = null, bestRank;
  for (const point of positions()) {
    const key = `${point.x}:${point.y}`;
    if (seen.has(key) || !inside(point)) continue;
    seen.add(key);
    const distance = grid.measurePath([origin, token.getCenterPoint(point)]).distance;
    if (!Number.isFinite(distance)) continue;
    const rank = [distance, Math.hypot(point.x - original.x, point.y - original.y), point.y, point.x];
    const difference = bestRank ? rank.findIndex((value, index) => value !== bestRank[index]) : -1;
    const better = !bestRank || (difference >= 0 && rank[difference] < bestRank[difference]);
    if (better && !occupied(token, point)) { best = point; bestRank = rank; }
  }
  return best;
}
export async function returnSoulPrisonToken(actor, id) {
  const key = `${actor.uuid}:${id}`, request = actor.flags.spikependium?.soulPrisonReturns?.[id];
  if (!authority(actor) || !request || request.state === "done" || returning.has(key)) return false;
  const token = resolve(request.target), original = request.return;
  if (!token?.isOwner || token.actor?.uuid !== actor.uuid || !original || ![original.x, original.y, original.elevation].every(Number.isFinite)) return false;
  const scene = token.parent;
  // shortcut: межсценовый перенос требует сохранения ActorDelta и ссылок; пока возвращаем токен только внутри той же сцены.
  if (original.scene !== scene.uuid || !scene.levels.get(original.level)) {
    ui.notifications.warn("Для возвращения нужен перенос на исходную сцену или восстановление её уровня Мастером. Запрос сохранён."); return false;
  }
  if (["planned", "pending", "paused"].includes(token.movement?.state)) return false;
  const point = request.destination ?? nearestSoulPrisonSpace(token, original);
  if (!point || occupied(token, point)) { ui.notifications.warn("На исходном уровне не найдено свободное место. Запрос возвращения сохранён."); return false; }
  returning.add(key);
  try {
    const path = `flags.spikependium.soulPrisonReturns.${id}`;
    const same = () => token.parent === scene && ["x", "y", "elevation", "level"].every(field => token[field] === point[field]);
    if (!same()) {
      if (request.state === "moving") { ui.notifications.warn("Предыдущее возвращение не завершено. Разрешите перемещение вручную; повторного автоматического переноса нет."); return false; }
      await actor.update({ [path]: { ...request, destination: point, state: "moving" } });
      if (!authority(actor) || resolve(request.target) !== token || occupied(token, point)
        || actor.flags.spikependium.soulPrisonReturns[id]?.version !== request.version) return false;
      const moved = await token.move({ x: point.x, y: point.y, elevation: point.elevation, level: point.level,
        hidden: point.hidden ?? token.hidden, action: "blink" }, { constrainOptions: { ignoreWalls: true, ignoreCost: true } });
      if (!moved || !same()) return false;
    }
    if (!authority(actor) || actor.flags.spikependium.soulPrisonReturns[id]?.version !== request.version) return false;
    await actor.update({ [path]: { ...request, destination: point, state: "done" } });
    return true;
  } finally { returning.delete(key); }
}
async function repeat(effect, request) {
  const data = repeatInfo(effect, request);
  if (!authority(effect.actor) || !data || data.info.phase !== "unbound" || rolling.has(effect.uuid)) return;
  rolling.add(effect.uuid);
  try {
    const find = () => game.messages.find(message => validSave(message, effect, request));
    let saved = find();
    if (!saved && !request.started) {
      await effect.setFlag("spikependium", "soulPrisonRepeat", { ...request, started: true });
      if (!authority(effect.actor) || !repeatInfo(effect, request) || prison(effect).phase !== "unbound") return;
      const privacy = data.info.privacy ?? {}, origin = resolve(effect.system.origin?.message), actor = effect.actor, token = data.token;
      const hidden = token.hidden || privacy.hidden || privacy.blind || privacy.whisper?.length;
      await actor.rollSavingThrow({ ability: "cha", target: data.info.dc }, { configure: false }, {
        rollMode: hidden ? "gm" : "public", data: {
          speaker: ChatMessage.getSpeaker({ actor, token, scene: token.parent }),
          ...(privacy.whisper?.length ? { whisper: [...privacy.whisper], blind: !!privacy.blind } : {}),
          flavor: "Фолиант душ — повторный спасбросок заточённого", system: { ...(origin ? { origin: origin.id } : {}) },
          flags: { spikependium: { soulPrisonRepeat: { effect: effect.uuid, event: request.event, version: request.version,
            token: token.uuid, dc: data.info.dc } } }
        }
      });
      saved = find();
    }
    if (saved) await syncSoulPrisonRepeat(saved);
    else ui.notifications.warn("Повторный спасбросок не оставил подтверждённой карточки. Разрешите его вручную; автоматического переброса нет.");
  } finally { rolling.delete(effect.uuid); }
}
export async function soulPrisonEndTurn(wrapped, combatant, ...args) {
  const result = await wrapped(combatant, ...args), actor = combatant?.actor;
  if (!authority(actor) || !Number.isInteger(this.previous?.round) || this.previous.round < 1 || actor.statuses.has("dead")) return result;
  for (const effect of [...actor.effects]) {
    const info = prison(effect);
    if (!live(effect) || info?.phase !== "unbound" || ending.has(effect.uuid)) continue;
    const event = `${this.id}:${this.previous.round}:${this.previous.turn}:${combatant.id}:${effect.uuid}`;
    const current = effect.flags.spikependium.soulPrisonRepeat;
    if (current?.event === event || current?.pending) continue;
    const request = { event, token: info.target, version: info.version, pending: true, started: false };
    ending.add(effect.uuid);
    try {
      await effect.setFlag("spikependium", "soulPrisonRepeat", request);
      await repeat(effect, request);
    } finally { ending.delete(effect.uuid); }
  }
  return result;
}
export async function resumeSoulPrisonRepeats() {
  for (const actor of actors().values()) for (const effect of [...actor.effects]) {
    if (!authority(actor)) continue;
    const request = effect.flags?.spikependium?.soulPrisonRepeat;
    if (request?.pending) await repeat(effect, request);
  }
}
