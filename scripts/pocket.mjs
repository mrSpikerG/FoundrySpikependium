import { incapacitated, tokensDistance } from "./effects.mjs";
import { dropVestigeGear } from "./vestige.mjs";

const FEATURE = "subclass:vestige-patron:vestige-companion";
const DISMISS = "OfZsym1ofcJhvmgo", RETURN = "lDQV8IBeLyPyRSZb";
const busy = new Set();
const ending = new Set();
const comparable = data => JSON.stringify(data, (key, value) => key === "_stats" ? undefined : value);
const turn = () => game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : null;
const action = activity => activity?.item.flags.spikependium?.key === FEATURE
  ? activity.id === DISMISS ? "dismiss" : activity.id === RETURN ? "return" : null : null;

export function vestigeTokens(item) {
  return [...game.scenes].flatMap(s => [...s.tokens]).filter(t => t.actor?.flags.spikependium?.key?.startsWith("actor:vestige-")
    && t.actor.flags.dnd5e?.summon?.origin === item.uuid);
}

export function pocketArchives(item) {
  return game.actors.filter(a => {
    const record = a.flags.spikependium?.vestigePocket;
    return record?.origin === item.uuid && ["prepared", "pocket"].includes(record.state)
      && game.users.get(a._stats?.createdBy)?.isGM && game.users.get(record.author)?.isGM
      && !game.users.some(u => !u.isGM && a.testUserPermission(u, "OWNER"));
  });
}

export function vestigeLocked(item) {
  const rest = item.actor.flags.spikependium?.longRest ?? "";
  const saved = item.actor.flags.spikependium?.vestigeSave;
  return (saved?.origin === item.uuid && (saved.state === "pending" || saved.rest === rest))
    || pocketArchives(item).some(a => a.flags.spikependium.vestigePocket.blockedRest === rest);
}

export function pendingVestigeForm(item) {
  return !!item.actor.flags.spikependium?.vestigeFormPending || vestigeTokens(item).some(t => t.flags.spikependium?.vestigeFormPending)
    || game.actors.some(a => {
      const record = a.flags.spikependium?.vestigeForm;
      return record?.origin === item.uuid && ["prepared", "changing"].includes(record.state)
        && game.users.get(a._stats?.createdBy)?.isGM && game.users.get(record.author)?.isGM
        && !game.users.some(u => !u.isGM && a.testUserPermission(u, "OWNER"));
    });
}

export function canUseVestigePocket(activity) {
  if (!action(activity)) return true;
  const owner = activity.actor;
  const tokens = vestigeTokens(activity.item), archives = pocketArchives(activity.item);
  const valid = !incapacitated(owner) && !pendingVestigeForm(activity.item) && !vestigeLocked(activity.item) && !busy.has(activity.item.uuid) && (action(activity) === "dismiss"
    ? tokens.length === 1 && tokens[0].actor.system.attributes.hp.value > 0
    : archives.length === 1 && !fromUuidSync(archives[0].flags.spikependium.vestigePocket.source)
      && (!tokens.length || (tokens.length === 1 && tokens[0].flags.spikependium?.pocketReturn === archives[0].uuid)));
  if (!valid) ui.notifications.warn("Для ухода нужен один живой реликт; для возвращения — один сохранённый реликт в измерении. После спасения аурой требуется продолжительный отдых. Действие недоступно при недееспособности или незавершённой операции.");
  return valid;
}

export function canSummonVestige(activity, profile) {
  if (activity.type !== "summon" || activity.item.flags.spikependium?.key !== FEATURE) return true;
  if (pendingVestigeForm(activity.item)) return false;
  if (vestigeLocked(activity.item)) {
    ui.notifications.warn("После спасения хозяина аурой реликт не может вернуться до продолжительного отдыха.");
    return false;
  }
  if (activity.id === "kUEdPFMFUoHcrJ9w") return true;
  if (incapacitated(activity.actor) || (activity.actor.classes?.warlock?.system.levels ?? 0) < 3
    || activity.actor.flags.spikependium?.vestigeRecovery?.state === "pending") {
    ui.notifications.warn("Для церемонии нужен дееспособный колдун 3 уровня; сначала завершите восстановление божественной силы.");
    return false;
  }
  const type = activity.actor.flags.spikependium?.vestigeFormType;
  if (type && profile?.uuid && profile.uuid !== type) {
    ui.notifications.warn("Церемония возвращает прежний вид реликта. Другой вид выбирается после продолжительного отдыха.");
    return false;
  }
  if (!vestigeTokens(activity.item).length && !pocketArchives(activity.item).length && !busy.has(activity.item.uuid)) return true;
  ui.notifications.warn("Реликт уже существует на сцене или в карманном измерении. Используйте возвращение или выбор новой формы после отдыха.");
  return false;
}

export function canConsumeVestigeSummon(activity, config) {
  return canSummonVestige(activity, activity.profiles?.find(p => p._id === config.summons?.profile));
}

async function savePocket(item, source, stillValid, blockedRest) {
  if (!source || source.actor.system.attributes.hp.value <= 0 || source.actor.statuses.has("dead")) return false;
  if (!await dropVestigeGear(source)) return false;
  await endVestigeAura(item.actor);
  if (!stillValid() || fromUuidSync(source.uuid) !== source || source.actor.system.attributes.hp.value <= 0) return false;
  const snapshot = source.actor.toObject();
  const archives = pocketArchives(item);
  if (archives.length > 1) throw Error("Найдено несколько сохранённых состояний");
  let archive = archives[0];
  if (!archive) {
    const data = foundry.utils.deepClone(snapshot);
    delete data._id; delete data._stats;
    data.ownership = { default: 0 };
    data.prototypeToken = source.toObject();
    delete data.prototypeToken._id; delete data.prototypeToken.delta; delete data.prototypeToken.actorId;
    data.flags.spikependium.vestigePocket = { origin: item.uuid, owner: item.actor.uuid, source: source.uuid, actor: source.actor.uuid, state: "prepared",
      author: game.user.id, token: source.toObject(), ownership: snapshot.ownership, fingerprint: comparable(snapshot),
      ...(blockedRest === undefined ? {} : { blockedRest }) };
    archive = await Actor.implementation.create(data, { keepId: true });
    if (!archive) throw Error("Не удалось сохранить состояние реликта");
  } else if (archive.flags.spikependium.vestigePocket.source !== source.uuid)
    throw Error("Сохранён другой реликт; сначала разрешите незавершённую операцию");
  if (archive.flags.spikependium.vestigePocket.fingerprint !== comparable(snapshot))
    throw Error("Сохранённое состояние устарело; Мастер должен разрешить конфликт с исходным листом");
  if (blockedRest !== undefined && archive.flags.spikependium.vestigePocket.blockedRest !== blockedRest)
    await archive.setFlag("spikependium", "vestigePocket.blockedRest", blockedRest);
  if (!stillValid() || !pocketArchives(item).includes(archive) || fromUuidSync(source.uuid) !== source
    || comparable(source.actor.toObject()) !== comparable(snapshot))
    throw Error("Реликт или условия изменились во время сохранения");
  await source.parent.deleteEmbeddedDocuments("Token", [source.id]);
  if (fromUuidSync(source.uuid)) throw Error("Токен реликта не был удалён");
  await archive.setFlag("spikependium", "vestigePocket.state", "pocket");
  return true;
}

export async function pocketVestigeAfterSurvival(item, record) {
  const valid = () => game.user.isActiveGM && fromUuidSync(item.uuid) === item && item.flags.spikependium?.key === FEATURE
    && item.actor.flags.spikependium?.vestigeSave?.event === record.event
    && item.actor.flags.spikependium.vestigeSave.state === "pending";
  if (!valid() || pendingVestigeForm(item) || busy.has(item.uuid)) return false;
  busy.add(item.uuid);
  try {
    const tokens = vestigeTokens(item);
    if (tokens.length > 1) throw Error("Найдено несколько реликтов");
    const source = tokens[0];
    if (!source) {
      await endVestigeAura(item.actor);
      const archives = pocketArchives(item);
      if (archives.length > 1) throw Error("Найдено несколько сохранённых состояний");
      if (archives[0]) {
        if (archives[0].flags.spikependium.vestigePocket.source !== record.token) return false;
        await archives[0].setFlag("spikependium", "vestigePocket.blockedRest", record.rest);
        await archives[0].setFlag("spikependium", "vestigePocket.state", "pocket");
      }
      return valid();
    }
    if (source.uuid !== record.token) return false;
    return await savePocket(item, source, valid, record.rest);
  } finally { busy.delete(item.uuid); }
}

export async function endVestigeAura(owner) {
  const feature = owner.items.find(i => i.flags.spikependium?.key === "subclass:vestige-patron:aura-of-power");
  if (!feature) return;
  const actors = new Map([...game.actors, ...[...game.scenes].flatMap(s => [...s.tokens].map(t => t.actor))]
    .filter(Boolean).map(a => [a.uuid, a]));
  for (const actor of actors.values()) {
    const ids = actor.effects.filter(e => e.system.origin?.activity?.startsWith(`${feature.uuid}.Activity.`)).map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  }
  for (const scene of game.scenes) {
    const ids = [...(scene.regions ?? [])].filter(r => r.flags.dnd5e?.activity?.startsWith(`${feature.uuid}.Activity.`)).map(r => r.id);
    if (ids.length) await scene.deleteEmbeddedDocuments("Region", ids);
  }
}

export async function endDeadOwnerPockets() {
  if (!game.user.isActiveGM) return;
  for (const archive of game.actors) {
    const record = archive.flags.spikependium?.vestigePocket;
    if (!record || !["prepared", "pocket"].includes(record.state) || ending.has(archive.uuid)) continue;
    const owner = fromUuidSync(record.owner);
    if (!owner?.statuses.has("dead")) continue;
    const item = fromUuidSync(record.origin);
    if (!item || !pocketArchives(item).includes(archive)) continue;
    ending.add(archive.uuid);
    try {
      await endVestigeAura(owner);
      await archive.setFlag("spikependium", "vestigePocket.state", "ended");
    } finally { ending.delete(archive.uuid); }
  }
}

export function validPocketPlacement(origin, candidate, radius = 30) {
  const distance = tokensDistance(origin, candidate);
  if (origin.parent !== candidate.parent || origin.level !== candidate.level || distance == null || distance > radius) return false;
  const spaces = candidate.getOccupiedGridSpaceOffsets();
  return !candidate.parent.tokens.some(t => {
    if (!t.actor?.system.isCreature || t.level !== candidate.level) return false;
    const height = Math.max(candidate.depth, 0.01) * candidate.parent.grid.distance;
    const otherHeight = Math.max(t.depth, 0.01) * candidate.parent.grid.distance;
    if (candidate.elevation + height <= t.elevation || t.elevation + otherHeight <= candidate.elevation) return false;
    const occupied = t.getOccupiedGridSpaceOffsets();
    if (spaces.length && occupied.length) return spaces.some(a => occupied.some(b => a.i === b.i && a.j === b.j));
    const size = candidate.getSize(), other = t.getSize();
    return candidate.x < t.x + other.width && candidate.x + size.width > t.x
      && candidate.y < t.y + other.height && candidate.y + size.height > t.y;
  });
}

export async function handleVestigePocket(message) {
  if (!game.user.isActiveGM || message.type !== "usage" || message.flags.spikependium?.pocketDone) return;
  const activity = message.getAssociatedActivity();
  const mode = action(activity), owner = activity?.actor;
  if (!mode || !message.author || !owner.testUserPermission(message.author, "OWNER") || incapacitated(owner)
    || pendingVestigeForm(activity.item) || vestigeLocked(activity.item)
    || busy.has(activity.item.uuid)) return;
  const item = activity.item;
  busy.add(item.uuid);
  const originalTurn = turn();
  const stillValid = () => game.user.isActiveGM && turn() === originalTurn && !incapacitated(owner)
    && !pendingVestigeForm(item) && !vestigeLocked(item)
    && fromUuidSync(item.uuid) === item && owner.testUserPermission(message.author, "OWNER");
  try {
    const tokens = vestigeTokens(item), archives = pocketArchives(item);
    if (tokens.length > 1 || archives.length > 1) throw Error("Найдено несколько реликтов или сохранённых состояний");
    if (mode === "dismiss") {
      if (!await savePocket(item, tokens[0], stillValid)) return;
    } else {
      const archive = archives[0], record = archive?.flags.spikependium.vestigePocket;
      if (!archive || fromUuidSync(record.source)) return;
      const existing = [...game.scenes].flatMap(s => [...s.tokens]).find(t => t.flags.spikependium?.pocketReturn === archive.uuid);
      if (existing) {
        await archive.setFlag("spikependium", "vestigePocket.state", "returned");
      } else {
        if (tokens.length) return;
        const origin = activity.getUsageToken();
        if (!canvas.ready || !origin || origin.parent !== canvas.scene || origin.actor.uuid !== owner.uuid)
          throw Error("Для возвращения нужен выбранный токен хозяина на активной сцене Мастера");
        const placements = await dnd5e.canvas.TokenPlacement.place({ origin, tokens: [archive.prototypeToken] });
        if (!placements.length) return;
        if (!stillValid() || !pocketArchives(item).includes(archive) || origin.parent !== canvas.scene
          || fromUuidSync(origin.uuid) !== origin || vestigeTokens(item).length) return;
        const { prototypeToken, index, ...placement } = placements[0];
        const candidate = await archive.getTokenDocument(placement, { parent: canvas.scene });
        if (!validPocketPlacement(origin, candidate)) {
          ui.notifications.warn("Выберите свободное пространство в пределах 30 футов на том же уровне сцены.");
          return;
        }
        const saved = archive.toObject();
        delete saved._id; delete saved._stats;
        saved.ownership = record.ownership;
        delete saved.flags.spikependium.vestigePocket;
        saved.flags.spikependium.pocketReturn = archive.uuid;
        const working = await Actor.implementation.create(saved, { keepId: true });
        if (!working) throw Error("Не удалось подготовить возвращение реликта");
        if (!stillValid() || !pocketArchives(item).includes(archive) || vestigeTokens(item).length || !validPocketPlacement(origin, candidate)) return;
        const data = (await working.getTokenDocument(placement, { parent: canvas.scene })).toObject();
        data.actorLink = false;
        data.flags ??= {}; data.flags.spikependium = { ...data.flags.spikependium, pocketReturn: archive.uuid };
        const created = await canvas.scene.createEmbeddedDocuments("Token", [data], { dnd5e: { autoRollNPCHP: "no" } });
        if (!created.length) throw Error("Не удалось разместить возвращённого реликта");
        await archive.setFlag("spikependium", "vestigePocket.state", "returned");
      }
    }
    await message.setFlag("spikependium", "pocketDone", true);
  } catch (error) {
    console.error("Spikependium: карманное измерение реликта", error);
    ui.notifications.error("Операция реликта не завершена. Проверьте токены и сохранённый лист перед повтором; снаряжение остаётся на месте.");
  } finally { busy.delete(item.uuid); }
}
