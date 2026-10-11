import { incapacitated } from "./effects.mjs";
import { prepareSummon, isVestigePower } from "./summons.mjs";
import { vestigeTokens, pocketArchives, vestigeLocked, validPocketPlacement, endVestigeAura, canSummonVestige } from "./pocket.mjs";
import { dropVestigeGear } from "./vestige.mjs";

const KEY = "subclass:vestige-patron:vestige-companion", REST = "kUEdPFMFUoHcrJ9w", CEREMONY = "bG67zHh7Ntnw9qKp";
const TYPES = {
  "actor:vestige-celestial": "Compendium.spikependium.creatures.Actor.ygdgcDsAyn9Cyfee",
  "actor:vestige-fiend": "Compendium.spikependium.creatures.Actor.IpgOEVZ6ks2N1zdt",
  "actor:vestige-undead": "Compendium.spikependium.creatures.Actor.AJDrnK3LLsKHkyBG"
};
const running = new Set();
const preparing = new Set();
const turn = () => game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : null;
const windowOpen = owner => {
  const window = owner.flags.spikependium?.vestigeFormWindow;
  return window?.rest === owner.flags.spikependium?.longRest && window.time === game.time.worldTime && window.turn === turn();
};
const comparable = data => JSON.stringify(data, (key, value) => key === "_stats" ? undefined : value);
const isRestForm = a => a?.id === REST && a.item.flags.spikependium?.key === KEY;
const isCeremony = a => a?.id === CEREMONY && a.item.flags.spikependium?.key === KEY;
const restJob = (a, rest) => a.flags.spikependium.vestigeForm.mode !== "ceremony" && a.flags.spikependium.vestigeForm.rest === rest;
const ceremonyContext = activity => ({ time: game.time.worldTime, turn: turn(),
  rest: activity.actor.flags.spikependium?.longRest ?? "", recovery: activity.actor.flags.spikependium?.vestigeRecovery?.event ?? "" });
const ceremonyCurrent = (activity, request) => Object.entries(ceremonyContext(activity)).every(([k,v]) => request[k] === v)
  && !incapacitated(activity.actor) && (activity.actor.classes.warlock?.system.levels ?? 0) >= 3;
const trusted = a => game.users.get(a._stats?.createdBy)?.isGM && game.users.get(a.flags.spikependium.vestigeForm.author)?.isGM
  && !game.users.some(u => !u.isGM && a.testUserPermission(u, "OWNER"));
const jobs = item => game.actors.filter(a => a.flags.spikependium?.vestigeForm?.origin === item.uuid && trusted(a));

export function canUseVestigeRestForm(activity) {
  if (!isRestForm(activity)) return true;
  const rest = activity.actor.flags.spikependium?.longRest;
  const tokens = vestigeTokens(activity.item), archives = pocketArchives(activity.item);
  const valid = !!rest && windowOpen(activity.actor) && (activity.actor.classes.warlock?.system.levels ?? 0) >= 3 && !incapacitated(activity.actor) && !vestigeLocked(activity.item)
    && !activity.actor.flags.spikependium?.vestigeFormPending && tokens.length + archives.length <= 1
    && activity.actor.flags.spikependium?.vestigeRestForm?.rest !== rest
    && (!tokens[0] || tokens[0].actor.type === "npc" && tokens[0].actor.system.attributes.hp.value > 0 && !tokens[0].actor.statuses.has("dead"))
    && !jobs(activity.item).some(a => restJob(a, rest));
  if (!valid) ui.notifications.warn("Новая форма доступна один раз после продолжительного отдыха. Сначала завершите незаконченный уход или замену реликта.");
  return valid;
}

export function recordVestigeFormConfig(wrapped, config, message, results) {
  const result = wrapped(config, message, results);
  if (!isRestForm(this) && !isCeremony(this)) return result;
  if (config.create !== false && config.create?.summons !== false) foundry.utils.setProperty(message, "data.flags.spikependium.vestigeForm", {
    rest: this.actor.flags.spikependium?.longRest, profile: config.summons.profile,
    ...(isCeremony(this) ? { mode: "ceremony", ...ceremonyContext(this), ownerToken: this.getUsageToken()?.uuid } : {})
  });
  if (config.create) config.create.summons = false;
  return result;
}

export function prepareVestigeRestConfig(wrapped, config) {
  const requested = config.create?.summons;
  const requestedProfile = config.summons?.profile;
  const result = wrapped(config);
  if ((isRestForm(this) || isCeremony(this)) && config.create !== false && requested === undefined) result.create.summons = true;
  if (isCeremony(this) && requestedProfile == null) {
    const selected = this.profiles.find(p => p.uuid === this.actor.flags.spikependium?.vestigeFormType);
    if (selected) result.summons.profile = selected._id;
  }
  return result;
}

export async function rememberVestigeType(token) {
  if (!game.user.isActiveGM) return;
  const profile = TYPES[token.actor?.flags.spikependium?.key];
  const uuid = token.actor?.flags.dnd5e?.summon?.origin;
  const item = uuid && fromUuidSync(uuid);
  if (!profile || item?.flags.spikependium?.key !== KEY || item.actor.flags.spikependium?.vestigeFormType) return;
  await item.actor.setFlag("spikependium", "vestigeFormType", profile);
}

export async function placeVestigeRestForm(wrapped, options) {
  if (!isRestForm(this) && !isCeremony(this)) return wrapped(options);
  ui.notifications.info("Появление реликта обрабатывается Мастером по карточке действия. Для новой церемонии или формы используйте действие на листе.");
  return [];
}

export function canModifyVestigeForm(actor) {
  if (!actor?.token?.flags.spikependium?.vestigeFormPending || game.user.isGM) return;
  ui.notifications.warn("Мастер завершает замену формы реликта; подождите окончания операции.");
  return false;
}

export async function offerVestigeFormAfterRest(owner) {
  if (!owner.isOwner) return;
  const item = owner.items.find(i => i.flags.spikependium?.key === KEY);
  const activity = item?.system.activities.get(REST);
  if (!activity) return;
  await owner.setFlag("spikependium", "vestigeFormWindow", { rest: owner.flags.spikependium?.longRest, time: game.time.worldTime, turn: turn() });
  if (canUseVestigeRestForm(activity)) await activity.use({}, { configure: true });
}

async function leaveInterruptedGear(backup, target, record) {
  const items = target.items.filter(i => i.system.quantity != null).map(i => i.toObject());
  const currency = foundry.utils.deepClone(target.system.currency);
  if (!items.length && !Object.values(currency).some(n => n > 0)) return;
  const scene = fromUuidSync(record.location?.scene);
  if (!scene) throw Error("Сцена прежнего реликта удалена; снаряжение сохранено в резервной копии");
  let loot = game.actors.find(a => (a.flags.spikependium?.vestigeDrop?.source === record.token || a.flags.spikependium?.vestigeFormLoot === backup.uuid)
    && game.users.get(a._stats?.createdBy)?.isGM);
  if (!loot) loot = await Actor.implementation.create({ name: `${target.name} — оставленное снаряжение`, type: "group",
    ownership: { default: 0 }, items, system: { currency }, flags: { spikependium: { vestigeFormLoot: backup.uuid } },
    prototypeToken: { name: "Оставленное снаряжение", actorLink: true, width: 1, height: 1,
      texture: { src: "icons/containers/bags/pack-engraved-leather-tan.webp" } } }, { keepId: true });
  if (!loot) throw Error("Не удалось сохранить оставленное снаряжение");
  if (!scene.tokens.some(t => t.actorId === loot.id)) {
    const { scene: ignored, ...position } = record.location;
    const data = (await loot.getTokenDocument(position, { parent: scene })).toObject();
    if (!(await scene.createEmbeddedDocuments("Token", [data], { dnd5e: { autoRollNPCHP: "no" } })).length) throw Error("Не удалось оставить снаряжение на сцене");
  }
}

async function finishJob(backup) {
  if (!game.user.isActiveGM || !trusted(backup) || running.has(backup.uuid)) return;
  const record = backup.flags.spikependium.vestigeForm;
  if (!["prepared", "changing"].includes(record.state)) return;
  const item = fromUuidSync(record.origin), target = fromUuidSync(record.target);
  if (!item || item.flags.spikependium?.key !== KEY || !target) return;
  const wasDead = item.actor.statuses.has("dead");
  running.add(backup.uuid);
  try {
    const owner = item.actor;
    let token = record.token ? fromUuidSync(record.token) : [...game.scenes].flatMap(s => [...s.tokens])
      .find(t => t.flags.spikependium?.vestigeNewForm === backup.uuid && (!record.createdTokenId || t.id === record.createdTokenId));
    if (token && !record.token && token.actorId !== target.id) throw Error("Созданный токен заменён другим существом");
    if (owner.statuses.has("dead")) {
      if (token) {
        if (![record.actorId, target.id].includes(token.actorId)) throw Error("Токен заменён другим существом");
        if (record.state === "changing" && token.actorId !== target.id) {
          await token.delta.restore();
          await token.update({ actorId: target.id, actorLink: false });
        }
        await endVestigeAura(owner);
        if (!await dropVestigeGear(token)) return;
        await token.parent.deleteEmbeddedDocuments("Token", [token.id]);
      } else if (record.token && record.state === "changing") await leaveInterruptedGear(backup, target, record);
      await backup.setFlag("spikependium", "vestigeForm.state", "ended");
      if (owner.flags.spikependium?.vestigeFormPending === backup.uuid) await owner.unsetFlag("spikependium", "vestigeFormPending");
      return;
    }
    if (record.token) {
      if (!token || ![record.actorId, target.id].includes(token.actorId)) throw Error("Исходный токен изменён или удалён");
      if (record.state === "prepared") {
        if (comparable(token.actor.toObject()) !== record.fingerprint) throw Error("Исходный лист изменился до замены");
        await token.setFlag("spikependium", "vestigeFormPending", backup.uuid);
        await backup.setFlag("spikependium", "vestigeForm.state", "changing");
      }
      if (token.actorId !== target.id && token.flags.spikependium?.vestigeFormPending !== backup.uuid) throw Error("Отметка незавершённой замены снята");
      if (token.actorId !== target.id) {
        if (record.linked) {
          const old = game.actors.get(record.actorId);
          if (!old) throw Error("Прежний связанный лист не найден");
          const ownership = Object.fromEntries([...new Set(["default", ...Object.keys(old.ownership)])].map(id => [id, 0]));
          await old.update({ ownership, "flags.spikependium.vestigeRetired": backup.uuid, "flags.dnd5e.-=summon": null });
        }
        // Штатное очищение ActorDelta не переносит прежние врождённые действия на новый базовый лист.
        await token.delta.restore();
        await token.update({ actorId: target.id, actorLink: false });
      }
      for (const combat of game.combats) {
        const combatants = combat.combatants.filter(c => (c.sceneId ?? combat.scene?.id) === token.parent.id && c.tokenId === token.id);
        if (combatants.length) await combat.updateEmbeddedDocuments("Combatant", combatants.map(c => ({ _id: c.id, actorId: target.id })));
      }
    } else if (!token) {
      if (record.created) throw Error("Созданный токен удалён; повторное появление из этой операции запрещено");
      if (vestigeTokens(item).length || (record.archive && !pocketArchives(item).some(a => a.uuid === record.archive)))
        throw Error("Реликт появился или сохранённое состояние изменилось");
      const scene = fromUuidSync(record.scene), origin = fromUuidSync(record.ownerToken);
      const candidate = scene && await target.getTokenDocument(record.placement, { parent: scene });
      if (!origin || origin.actor.uuid !== owner.uuid || !candidate || !validPocketPlacement(origin, candidate, 5))
        throw Error("Место появления больше недоступно в пределах 5 футов");
      const data = candidate.toObject(); data.actorLink = false;
      foundry.utils.setProperty(data, "flags.spikependium.vestigeNewForm", backup.uuid);
      foundry.utils.setProperty(data, "flags.spikependium.vestigeFormPending", backup.uuid);
      if (record.createdTokenId) data._id = record.createdTokenId;
      const created = await scene.createEmbeddedDocuments("Token", [data], { keepId: true, dnd5e: { autoRollNPCHP: "no" } });
      token = created[0];
      if (!token) throw Error("Не удалось разместить новую форму");
    }
    if (!record.token && !record.created) await backup.setFlag("spikependium", "vestigeForm.created", true);
    if (backup.flags.spikependium.vestigeForm.state === "ended" || !fromUuidSync(token.uuid)) return;
    if (record.archive) {
      const archive = fromUuidSync(record.archive);
      if (archive && pocketArchives(item).includes(archive)) await archive.setFlag("spikependium", "vestigePocket.state", "replaced");
    }
    if (record.actorUuid && record.actorUuid !== token.actor.uuid) {
      const serialized = JSON.stringify(target.toObject());
      const remapped = serialized.replaceAll(record.actorUuid, token.actor.uuid);
      if (remapped !== serialized) {
        const data = JSON.parse(remapped);
        await target.update({ flags: data.flags, system: data.system, items: data.items, effects: data.effects });
      }
    }
    await target.update({ ownership: record.ownership });
    const spent = token.actor.items.find(isVestigePower)?.system.uses.spent ?? 0;
    await owner.setFlag("spikependium", "vestigePowerSpent", spent);
    await owner.setFlag("spikependium", "vestigeFormType", record.profile);
    if (record.mode !== "ceremony") await owner.setFlag("spikependium", "vestigeRestForm", { rest: record.rest });
    await owner.unsetFlag("spikependium", "vestigeFormPending");
    await token.unsetFlag("spikependium", "vestigeFormPending");
    await backup.setFlag("spikependium", "vestigeForm.state", "done");
  } catch (error) {
    console.error("Spikependium: новая форма реликта", error);
    ui.notifications.error("Замена формы не закончена. Прежний лист сохранён у Мастера; не удаляйте резервную копию до разрешения операции.");
  } finally {
    running.delete(backup.uuid);
    if (!wasDead && item.actor.statuses.has("dead") && ["prepared", "changing"].includes(backup.flags.spikependium.vestigeForm.state))
      queueMicrotask(() => finishJob(backup).catch(error => console.error("Spikependium: смерть во время замены формы", error)));
  }
}

export async function finishVestigeForms() {
  if (!game.user.isActiveGM) return;
  for (const actor of game.actors) if (actor.flags.spikependium?.vestigeForm) await finishJob(actor);
}

export async function endDeletedVestigeForm(token) {
  if (!game.user.isActiveGM) return;
  const uuid = token.flags.spikependium?.vestigeNewForm, backup = uuid && fromUuidSync(uuid);
  if (!backup || !trusted(backup)) return;
  const record = backup.flags.spikependium.vestigeForm, target = fromUuidSync(record.target);
  if (!["prepared", "changing"].includes(record.state) || record.token || token.actorId !== target?.id
    || token.parent.uuid !== record.scene || record.createdTokenId && token.id !== record.createdTokenId) return;
  await backup.setFlag("spikependium", "vestigeForm.state", "ended");
  const owner = fromUuidSync(record.origin)?.actor;
  if (owner?.flags.spikependium?.vestigeFormPending === backup.uuid) await owner.unsetFlag("spikependium", "vestigeFormPending");
}

export async function resumeVestigeFormRequests() {
  if (!game.user.isActiveGM) return;
  for (const message of game.messages) if (message.flags.spikependium?.vestigeForm) await createVestigeRestForm(message);
}

export async function createVestigeRestForm(message) {
  const request = message.flags.spikependium?.vestigeForm;
  if (!game.user.isActiveGM || message.type !== "usage" || !request || running.has(message.uuid)) return;
  const activity = message.getAssociatedActivity(), owner = activity?.actor;
  const ceremony = isCeremony(activity);
  if ((!isRestForm(activity) && !ceremony) || !message.author || !owner.testUserPermission(message.author, "OWNER")
    || ceremony !== (request.mode === "ceremony")) return;
  if (preparing.has(activity.item.uuid)) return;
  const rest = owner.flags.spikependium?.longRest ?? "";
  const prior = jobs(activity.item).find(a => ceremony ? a.flags.spikependium.vestigeForm.event === message.uuid : restJob(a, rest));
  if (prior) return finishJob(prior);
  if (ceremony ? !ceremonyCurrent(activity, request) || !canSummonVestige(activity) : !rest || request.rest !== rest || !canUseVestigeRestForm(activity)) return;
  const profile = activity.profiles.find(p => p._id === request.profile && Object.values(TYPES).includes(p.uuid));
  if (!profile || ceremony && !canSummonVestige(activity, profile)) return;
  if (ceremony && (!request.ownerToken || message.getAssociatedToken()?.uuid !== request.ownerToken
    || !canvas.ready || fromUuidSync(request.ownerToken)?.parent !== canvas.scene)) return;
  running.add(message.uuid);
  preparing.add(activity.item.uuid);
  try {
    const tokens = vestigeTokens(activity.item), archives = pocketArchives(activity.item);
    const source = tokens[0], archive = archives[0], previous = source?.actor ?? archive;
    const original = previous?.toObject();
    const valid = () => game.user.isActiveGM && (owner.flags.spikependium?.longRest ?? "") === rest && !incapacitated(owner)
      && (ceremony ? ceremonyCurrent(activity, request) && canSummonVestige(activity, profile) : windowOpen(owner))
      && !vestigeLocked(activity.item) && !jobs(activity.item).some(a => ceremony ? a.flags.spikependium.vestigeForm.event === message.uuid : restJob(a, rest))
      && (source ? vestigeTokens(activity.item).length === 1 && fromUuidSync(source.uuid) === source && comparable(source.actor.toObject()) === comparable(original)
        : !vestigeTokens(activity.item).length && (!archive || (pocketArchives(activity.item).includes(archive)
          && comparable(archive.toObject()) === comparable(original))));
    const template = await fromUuid(profile.uuid);
    if (!template || TYPES[template.flags.spikependium?.key] !== profile.uuid || !valid()) return;
    const { actorUpdates, tokenUpdates } = await activity.getChanges(template, profile, {});
    prepareSummon(activity, profile, { actor: template, actorUpdates, tokenUpdates });
    const prepared = template.clone({}, { keepId: true }); prepared.updateSource(actorUpdates);
    if (ceremony) prepared.updateSource({ "system.attributes.hp.value": prepared.system.attributes.hp.effectiveMax });
    if (previous) {
      const oldTemplate = await fromUuid(TYPES[previous.flags.spikependium?.key]);
      if (!oldTemplate) throw Error("Не найден прежний статблок");
      const innate = new Set(oldTemplate.items.map(i => i.id));
      const extra = original.items.filter(i => !innate.has(i._id));
      if (extra.some(i => prepared.items.has(i._id))) throw Error("ID снаряжения конфликтует с новой формой");
      const effects = new Map(prepared.effects.map(e => [e.id, e.toObject()]));
      for (const effect of original.effects) if (!effects.has(effect._id)) effects.set(effect._id, effect);
      prepared.updateSource({ items: [...prepared.items.map(i => i.toObject()), ...extra], effects: [...effects.values()],
        "system.attributes.hp.value": Math.min(previous.system.attributes.hp.value, prepared.system.attributes.hp.effectiveMax),
        "system.attributes.hp.temp": previous.system.attributes.hp.temp, "system.currency": original.system.currency });
    }
    const data = prepared.toObject(); delete data._id; delete data._stats;
    if (original) {
      data.flags = foundry.utils.mergeObject(foundry.utils.deepClone(original.flags), data.flags);
      delete data.flags.spikependium.vestigePocket; delete data.flags.spikependium.vestigeForm;
      delete data.flags.spikependium.pocketReturn;
      if ((owner.classes.warlock?.system.levels ?? 0) < 6) {
        const spent = previous.items.find(isVestigePower)?.system.uses.spent ?? 0;
        for (const item of prepared.items.filter(isVestigePower)) data.items.find(i => i._id === item.id).system.uses.spent = spent;
      }
    }
    if (!ceremony && (owner.classes.warlock?.system.levels ?? 0) >= 6)
      for (const item of prepared.items.filter(isVestigePower)) data.items.find(i => i._id === item.id).system.uses.spent = 0;
    const ownership = archive?.flags.spikependium.vestigePocket.ownership ?? original?.ownership ?? owner.ownership;
    data.ownership = { default: 0 };
    let placement, origin;
    if (!source) {
      origin = ceremony ? fromUuidSync(request.ownerToken) : message.getAssociatedToken() ?? activity.getUsageToken();
      if (!canvas.ready || origin?.parent !== canvas.scene || origin.actor.uuid !== owner.uuid) throw Error("Нужен токен хозяина на активной сцене");
      const placements = await dnd5e.canvas.TokenPlacement.place({ origin, tokens: [prepared.prototypeToken] });
      if (!placements.length || !valid()) return;
      const { prototypeToken, index, ...point } = placements[0]; placement = point;
      const candidate = await prepared.getTokenDocument(placement, { parent: canvas.scene });
      if (!validPocketPlacement(origin, candidate, 5)) throw Error("Выберите свободное место в пределах 5 футов");
    }
    if (!valid()) return;
    const target = await Actor.implementation.create(data, { keepId: true });
    if (!target || !valid()) return;
    const saved = foundry.utils.deepClone(original ?? data); delete saved._id; delete saved._stats;
    saved.ownership = { default: 0 };
    delete saved.flags.spikependium.vestigePocket; delete saved.flags.spikependium.pocketReturn;
    foundry.utils.setProperty(saved, "flags.spikependium.vestigeForm", {
      origin: activity.item.uuid, rest, profile: profile.uuid, state: "prepared", author: game.user.id,
      ...(ceremony ? { mode: "ceremony", event: message.uuid } : {}),
      ...(!source ? { createdTokenId: foundry.utils.randomID() } : {}),
      target: target.uuid, ownership, token: source?.uuid, actorId: source?.actorId,
      linked: source?.actorLink === true,
      actorUuid: source?.actor.uuid ?? archive?.flags.spikependium.vestigePocket.actor,
      location: source && { scene: source.parent.uuid, x: source.x, y: source.y, elevation: source.elevation, level: source.level, hidden: source.hidden },
      fingerprint: original && comparable(original), archive: archive?.uuid,
      scene: origin?.parent.uuid, ownerToken: origin?.uuid, placement
    });
    const backup = await Actor.implementation.create(saved, { keepId: true });
    if (!backup) throw Error("Не удалось сохранить прежний лист");
    await owner.setFlag("spikependium", "vestigeFormPending", backup.uuid);
    await finishJob(backup);
  } finally { running.delete(message.uuid); preparing.delete(activity.item.uuid); }
}
