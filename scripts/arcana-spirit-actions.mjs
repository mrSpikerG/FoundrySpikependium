import { arcanaSpiritDC } from "./arcana-summons.mjs";
import { incapacitated, tokensDistance } from "./effects.mjs";
import { attackSignature } from "./attack-source.mjs";
import { monsterGrappleRule } from "./monster-actions.mjs";

const choosing = new Set(), paying = new Set(), queued = new Map();
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const abilities = { ath: "str", acr: "dex" };
const version = effect => JSON.stringify([effect.system.origin?.message, effect.flags.spikependium.arcanaSpiritGrab]);
export function escapePaymentButtons(wrapped, ...args) {
  const buttons = wrapped(...args);
  return this.item.flags.spikependium?.arcanaEscapePay ? buttons.filter(button => button.action !== "refundResource") : buttons;
}
export function refundArcanaEscape(wrapped, ...args) {
  if (!this.item.flags.spikependium?.arcanaEscapePay) return wrapped(...args);
  ui.notifications.warn("Проверка высвобождения уже выполнена. Изменение её результата и расхода действия разрешает Мастер.");
}
function grabInfo(effect) {
  const grab = effect?.flags.spikependium?.arcanaSpiritGrab, actor = effect?.actor;
  const source = resolve(grab?.source), target = resolve(grab?.target), dc = grab?.dc ?? arcanaSpiritDC(source);
  const activity = resolve(effect?.system.origin?.activity), rule = monsterGrappleRule(activity);
  if (!effect?.active || !actor || !effect.statuses.has("grappled") || !target?.actor || target.actor.uuid !== actor.uuid
    || !source?.actor || (!rule && source.actor.flags.spikependium?.key !== "actor:au-dinosaur-tyrannosaurus") || source.parent !== target.parent
    || (rule && (dc !== rule.dc || grab.reach !== rule.reach || activity.actor.uuid !== source.actor.uuid))
    || incapacitated(source.actor) || source.actor.system.attributes.hp.value <= 0 || !Number.isFinite(dc) || dc <= 0) return;
  const distance = tokensDistance(source, target);
  return distance != null && distance <= (rule?.reach ?? 10) ? { actor, source, target, dc, effect } : undefined;
}
function candidate(message) {
  const request = message?.flags.spikependium?.arcanaEscape, actor = message?.getAssociatedActor(), roll = message?.rolls?.[0];
  if (message?.type !== "check" || !request || !abilities[request.skill] || actor?.uuid !== request.actor || !message.author
    || !/^[A-Za-z0-9]{16}$/.test(request.event ?? "") || typeof request.version !== "string" || !Number.isFinite(request.dc) || request.dc <= 0
    || !actor.testUserPermission(message.author, "OWNER") || message.system.skill !== request.skill || message.system.ability !== abilities[request.skill]
    || !(roll instanceof CONFIG.Dice.D20Roll) || !roll._evaluated || !Number.isFinite(roll.total) || roll.options.target !== request.dc) return;
  return { actor, request, roll };
}
export function escapeChatButtons(wrapped, message) {
  const buttons = wrapped(message);
  return (this.item.system.identifier === "au-dinosaur-bite" && this.actor.flags.spikependium?.key === "actor:au-dinosaur-tyrannosaurus") || monsterGrappleRule(this)
    ? [...buttons, { action: "arcanaEscape", icon: "fa-solid fa-person-running", label: { value: "Высвободиться (действие цели)" } }] : buttons;
}
export async function escapeChatAction(wrapped, event, target, message) {
  if (target.dataset.action !== "arcanaEscape") return wrapped(event, target, message);
  const tokens = canvas.tokens.controlled.map(token => token.document ?? token), token = tokens[0];
  if (tokens.length !== 1 || !token?.actor?.isOwner || incapacitated(token.actor) || token.actor.system.attributes.hp.value <= 0) {
    ui.notifications.warn("Выберите один токен способной действовать схваченной цели, лист которой вам доступен."); return;
  }
  const available = token.actor.system.attributes.actions?.value;
  if (Number.isFinite(available) && available < 1) { ui.notifications.warn("Высвобождение требует доступного действия цели."); return; }
  const item = message.getAssociatedItem(), effect = token.actor.effects.find(effect => effect.system.origin?.activity?.startsWith(`${item?.uuid}.Activity.`) && grabInfo(effect)?.target.uuid === token.uuid);
  const info = grabInfo(effect);
  if (!info || choosing.has(info.actor.uuid)) { ui.notifications.warn("Подходящий захват не найден или проверка уже открыта."); return; }
  choosing.add(info.actor.uuid);
  try {
    const skill = await foundry.applications.api.DialogV2.wait({ window: { title: "Высвободиться из укуса" },
      content: `<p>Проверка цели против Сл ${info.dc}. При успехе захват и связанное опутывание заканчиваются.</p>`,
      buttons: [{ action: "ath", label: "Сила (Атлетика)", callback: () => "ath" }, { action: "acr", label: "Ловкость (Акробатика)", callback: () => "acr" }], close: () => null });
    if (!abilities[skill] || !grabInfo(effect) || !info.actor.isOwner || incapacitated(info.actor)) return;
    const request = { event: foundry.utils.randomID(), actor: info.actor.uuid, token: token.uuid, effect: effect.uuid, version: version(effect), skill, dc: info.dc };
    await info.actor.rollSkill({ skill, ability: abilities[skill], target: info.dc }, { options: { chooseAbility: false } }, {
      rollMode: message.blind ? "blind" : message.whisper?.length || token.hidden ? "gm" : "public",
      data: { speaker: ChatMessage.getSpeaker({ actor: info.actor, token, scene: token.parent }),
        ...(message.whisper?.length ? { whisper: [...message.whisper], blind: message.blind } : {}), flags: { spikependium: { arcanaEscape: request } } }
    });
  } finally { choosing.delete(info.actor.uuid); }
}
export function canPayArcanaEscape(activity, config) {
  const payment = activity?.item.flags.spikependium?.arcanaEscapePay;
  if (!payment) return true;
  const check = resolve(payment.check), value = candidate(check), info = grabInfo(resolve(value?.request.effect));
  const available = value?.actor.system.attributes.actions?.value;
  return !!value && !!info && activity.item.type === "feat" && activity.item.flags.spikependium.key === "arcana:escape"
    && activity.activation.type === "action" && activity.activation.value === 1 && activity.consumption.spellSlot === false
    && value.actor.uuid === activity.actor.uuid && info.target.uuid === value.request.token && value.actor.isOwner && !incapacitated(value.actor)
    && value.actor.system.attributes.hp.value > 0 && (!Number.isFinite(available) || available >= 1)
    && info.dc === value.request.dc && version(info.effect) === value.request.version && attackSignature(check) === payment.signature
    && JSON.stringify(payment.request) === JSON.stringify(value.request) && !value.actor.flags.spikependium?.arcanaEscapes?.[value.request.event]
    && (game.users.activeGM ? game.user.isActiveGM : check.author.id === game.user.id) && config.consume !== false && config.consume?.action !== false;
}
export function recordArcanaEscapePayment(activity, config, message, updates) {
  const payment = activity.item.flags.spikependium?.arcanaEscapePay;
  if (!payment) return;
  if (!canPayArcanaEscape(activity, config)) return false;
  updates.actor[`flags.spikependium.arcanaEscapes.${payment.request.event}`] = { ...payment, state: "paid" };
}
export async function finishArcanaEscape(message) {
  const value = candidate(message);
  if (!value || message.flags.spikependium.arcanaEscapeSettled || !value.actor.isOwner
    || (game.users.activeGM ? !game.user.isActiveGM : message.author.id !== game.user.id)) return;
  const { actor, request, roll } = value;
  if (paying.has(actor.uuid)) { queued.set(message.uuid, message); return; }
  paying.add(actor.uuid);
  try {
    let payment = actor.flags.spikependium?.arcanaEscapes?.[request.event];
    if (!payment) {
      const data = { check: message.uuid, signature: attackSignature(message), request };
      const id = foundry.utils.randomID(), item = new CONFIG.Item.documentClass({ name: "Высвободиться из укуса", type: "feat",
        flags: { spikependium: { key: "arcana:escape", arcanaEscapePay: data } }, system: { identifier: "arcana-escape", activities: { [id]: {
          _id: id, type: "utility", name: "Высвободиться", activation: { type: "action", value: 1, override: true }, consumption: { spellSlot: false }
        } } } }, { parent: actor });
      const activity = item.system.activities.get(id), config = { consume: { action: true, resources: false, spellSlot: false }, subsequentActions: false };
      if (!canPayArcanaEscape(activity, config)) { await message.setFlag("spikependium", "arcanaEscapeSettled", "unpaid"); return; }
      await activity.use(config, { configure: false }, { rollMode: message.blind ? "blind" : message.whisper?.length ? "gm" : "public", data: {
        speaker: message.speaker, whisper: [...(message.whisper ?? [])], blind: message.blind,
        flags: { spikependium: { arcanaEscapePayment: message.uuid }, dnd5e: { item: { data: item.toObject() } } }
      } });
      payment = actor.flags.spikependium?.arcanaEscapes?.[request.event];
      if (!payment) { await message.setFlag("spikependium", "arcanaEscapeSettled", "unpaid"); ui.notifications.warn("Высвобождение не оплатило действие. Захват сохраняется."); return; }
    }
    if (payment.check !== message.uuid || payment.signature !== attackSignature(message) || JSON.stringify(payment.request) !== JSON.stringify(request)) return;
    const effect = resolve(request.effect), info = grabInfo(effect), success = roll.total >= request.dc || (message.author.isGM && message.system.forceSuccess);
    const operations = [];
    const current = info?.actor.uuid === actor.uuid && info.dc === request.dc && version(effect) === request.version;
    if (success && current)
      operations.push({ action: "delete", documentName: "ActiveEffect", parent: actor, ids: [effect.id] });
    await actor.performBulkUpdate({ actor: { [`flags.spikependium.arcanaEscapes.${request.event}.state`]: "done" }, operations: [
      ...operations, { action: "update", documentName: "ChatMessage", updates: [{ _id: message.id, "flags.spikependium.arcanaEscapeSettled": success ? (current ? "success" : "stale") : "failure" }] }
    ] });
  } finally {
    paying.delete(actor.uuid);
    for (const [id, next] of queued) if (next.getAssociatedActor()?.uuid === actor.uuid) { queued.delete(id); await finishArcanaEscape(next); }
  }
}
