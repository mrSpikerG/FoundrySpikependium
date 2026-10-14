import { arcanaCast, arcanaEffectCast, endArcanaEffect } from "./arcana-spells.mjs";
import { tokensDistance, incapacitated } from "./effects.mjs";

const recording = new Set(), resting = new Set(), shaking = new Set();
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const authority = actor => actor?.isOwner && (game.users.activeGM ? game.user.isActiveGM : true);
const actors = () => new Map([...game.actors, ...[...game.scenes].flatMap(scene => [...scene.tokens].map(token => token.actor))]
  .filter(Boolean).map(actor => [actor.uuid, actor]));

export async function observeCatnap(effect, deleted = false) {
  const actor = effect?.actor;
  if (!authority(actor) || effect.flags.spikependium?.arcanaSpell !== "catnap" || recording.has(actor.uuid)) return;
  const origin = resolve(effect.system.origin?.message), info = arcanaCast(origin);
  if (!info || info.receipt.kind !== "catnap" || !info.receipt.targets.some(target => target.actor === actor.uuid)) return;
  if (actor.flags.spikependium?.catnap?.ignored?.includes(origin.uuid)) return;
  recording.add(actor.uuid);
  try {
    let record = actor.flags.spikependium?.catnap?.sleep?.[effect.id];
    if (!record || record.origin !== origin.uuid) {
      if (deleted || !arcanaEffectCast(effect) || actor.flags.spikependium?.catnap?.used) return;
      // shortcut: поздно замеченный сон не доказывает непрерывность; отдых подтверждает Мастер, пока нет серверного журнала эффектов.
      record = { effect: effect.uuid, origin: origin.uuid, end: info.receipt.time + 600,
        interrupted: game.time.worldTime > info.receipt.time, ended: false,
        private: !!(origin.blind || origin.whisper.length || info.receipt.targets.some(target => target.actor === actor.uuid && resolve(target.token)?.hidden)) };
    }
    if (deleted || !effect.active) {
      record = { ...record, interrupted: record.interrupted || game.time.worldTime < record.end,
        ended: deleted && game.time.worldTime >= record.end && !record.interrupted };
    }
    const old = actor.flags.spikependium?.catnap?.sleep?.[effect.id];
    if (JSON.stringify(old) !== JSON.stringify(record)) await actor.setFlag("spikependium", `catnap.sleep.${effect.id}`, record);
  } finally { recording.delete(actor.uuid); }
}

export function prepareCatnapRest(actor, result, config) {
  if (config.type === "long") {
    Object.assign(result.updateData, { "flags.spikependium.catnap.used": false,
      "flags.spikependium.catnap.sleep": {}, "flags.spikependium.catnap.rest": null,
      "flags.spikependium.catnap.ignored": actor.effects.filter(effect => effect.flags.spikependium?.arcanaSpell === "catnap")
        .map(effect => effect.system.origin?.message).filter(Boolean) });
    return;
  }
  const rest = actor.flags.spikependium?.catnap?.rest;
  if (config.type === "short" && rest && ["pending", "awaiting"].includes(rest.state))
    result.updateData["flags.spikependium.catnap.rest"] = { ...rest, state: "done" };
}

export async function finishCatnap(retry = false) {
  for (const actor of actors().values()) {
    if (!authority(actor) || resting.has(actor.uuid) || recording.has(actor.uuid)) continue;
    resting.add(actor.uuid);
    try {
      let rest = actor.flags.spikependium?.catnap?.rest;
      if (!actor.flags.spikependium?.catnap?.used) {
        for (const [id, record] of Object.entries(actor.flags.spikependium?.catnap?.sleep ?? {})) {
          if (record.interrupted) continue;
          const effect = resolve(record.effect);
          if (game.time.worldTime < record.end) {
            if (!effect?.active) await actor.setFlag("spikependium", `catnap.sleep.${id}.interrupted`, true);
            continue;
          }
          const origin = resolve(record.origin), info = arcanaCast(origin);
          if (!info || info.receipt.kind !== "catnap" || (!record.ended && (!effect || effect.disabled || effect.isSuppressed
            || !effect.statuses.has("unconscious")))) continue;
          rest = { origin: origin.uuid, event: foundry.utils.randomID(), state: "pending", private: record.private };
          await actor.performBulkUpdate({ actor: { "flags.spikependium.catnap.used": true, "flags.spikependium.catnap.rest": rest },
            operations: effect ? [{ action: "delete", documentName: "ActiveEffect", parent: actor, ids: [effect.id] }] : [] });
          rest = actor.flags.spikependium?.catnap?.rest;
          break;
        }
      }
      if (!rest || (rest.state !== "pending" && !(retry && rest.state === "awaiting"))) continue;
      await actor.setFlag("spikependium", "catnap.rest", { ...rest, state: "awaiting" });
      await actor.shortRest({ dialog: !rest.private, chat: !rest.private, autoHD: false, duration: 0, advanceTime: false, advanceBastionTurn: false });
      if (actor.flags.spikependium?.catnap?.rest?.event === rest.event && actor.flags.spikependium.catnap.rest.state !== "done")
        ui.notifications.warn("Дрёма: короткий отдых ещё не завершён. Его можно закончить штатной кнопкой отдыха на листе цели.");
    } finally { resting.delete(actor.uuid); }
  }
}

function shakeValid(request, helper, user = game.user) {
  const effect = resolve(request?.effect), info = effect && arcanaEffectCast(effect), source = resolve(request?.source), target = resolve(request?.target);
  if (!info || !["vision-of-ages", "catnap"].includes(info.receipt.kind) || info.origin.uuid !== request.origin
    || source?.actor?.uuid !== helper?.uuid || !helper.testUserPermission(user, "OWNER") || incapacitated(helper)
    || helper.system.attributes.hp.value <= 0 || target?.actor?.uuid !== info.actor.uuid || source.actor.uuid === target.actor.uuid
    || source.parent !== target.parent) return;
  const distance = tokensDistance(source, target);
  return distance != null && distance <= 5 ? info : undefined;
}

export function canUseArcanaShake(activity) {
  const request = activity?.item?.flags.spikependium?.arcanaShake;
  if (!request && activity?.flags?.spikependium?.arcanaShakeTemplate) {
    ui.notifications.warn("Для встряхивания используйте кнопку в карточке накладывания: действие выполнит выбранное помогающее существо."); return false;
  }
  if (!request) return true;
  if (!game.users.activeGM && (!resolve(request.effect)?.actor.isOwner || resolve(request.origin)?.author?.id !== game.user.id)) {
    ui.notifications.warn("Встряхнуть цель: для чужого заклинания или листа нужен подключённый Мастер."); return false;
  }
  if (shakeValid(request, activity.actor)) return true;
  ui.notifications.warn("Встряхнуть цель: выберите способное действовать существо в пределах 5 футов от ещё действующей цели заклинания.");
  return false;
}

export function awakeningChatButtons(wrapped, message) {
  const buttons = wrapped(message), flags = message?.flags ?? message?.data?.flags;
  const supported = ["spell:au-vision-of-ages", "spell:au-catnap"].includes(this?.item?.flags.spikependium?.key)
    && !this?.flags?.spikependium?.arcanaShakeTemplate;
  if (!supported && !["vision-of-ages", "catnap"].includes(flags?.spikependium?.arcanaCast?.kind)) return buttons;
  return [...buttons, { action: "arcanaShake", label: { value: "Встряхнуть цель (действие)" }, icon: "fa-solid fa-hand" }];
}

export async function awakeningChatAction(wrapped, event, target, message) {
  if (target.dataset.action !== "arcanaShake") return wrapped(event, target, message);
  const info = arcanaCast(message);
  if (!info || !["vision-of-ages", "catnap"].includes(info.receipt.kind)) return;
  const selected = [...game.user.targets].map(token => token.document ?? token), controlled = canvas.tokens.controlled.map(token => token.document ?? token);
  if (selected.length !== 1 || controlled.length !== 1) { ui.notifications.warn("Выберите один токен помогающего существа и отметьте одну цель для встряхивания."); return; }
  const recipient = selected[0], source = controlled[0], effect = recipient.actor.effects.find(effect => effect.system.origin?.message === message.uuid && arcanaEffectCast(effect));
  const request = { origin: message.uuid, source: source.uuid, target: recipient.uuid, effect: effect?.uuid };
  if (shaking.has(source.actor?.uuid) || !canUseArcanaShake({ actor: source.actor, item: { flags: { spikependium: { arcanaShake: request } } } })) return;
  const template = [...info.activity.item.system.activities].find(activity => activity.flags?.spikependium?.arcanaShakeTemplate);
  if (!template) return;
  shaking.add(source.actor.uuid);
  try {
    const item = new CONFIG.Item.documentClass({ name: "Встряхнуть цель", type: "feat", img: info.activity.item.img,
      system: { identifier: "arcana-shake", activities: { [template.id]: template.toObject() } },
      flags: { spikependium: { key: "arcana:shake", arcanaShake: request } } }, { parent: source.actor });
    await item.system.activities.get(template.id).use({ subsequentActions: false }, {}, { data: {
      speaker: ChatMessage.getSpeaker({ actor: source.actor, token: source, scene: source.parent }),
      flags: { spikependium: { arcanaShake: request }, dnd5e: { item: { data: item.toObject() } } }
    } });
  } finally { shaking.delete(source.actor.uuid); }
}

export async function finishArcanaShake(message) {
  const request = message?.flags.spikependium?.arcanaShake;
  if (message?.type !== "usage" || !request || message.flags.spikependium.arcanaShakeDone) return;
  const helper = message.getAssociatedActor(), activity = message.getAssociatedActivity();
  if (game.users.activeGM ? !game.user.isActiveGM : message.author?.id !== game.user.id) return;
  if (activity?.item.flags.spikependium?.key !== "arcana:shake" || JSON.stringify(activity.item.flags.spikependium.arcanaShake) !== JSON.stringify(request)
    || !message.author || !shakeValid(request, helper, message.author)) return;
  const effect = resolve(request.effect);
  if (!effect?.actor.isOwner || (!game.users.activeGM && resolve(request.origin)?.author?.id !== game.user.id)) return;
  await endArcanaEffect(effect);
  await message.setFlag("spikependium", "arcanaShakeDone", true);
}

