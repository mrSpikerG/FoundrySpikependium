import { tokensDistance } from "./effects.mjs";
import {duelProtects,protectDuelDeath} from "./arcana-duel.mjs";

const KEY = "spell:au-wail-of-the-banshee", captured = new WeakMap(), prepared = new WeakMap(), working = new Set();
const supported = a => a?.type === "save" && a.item?.flags.spikependium?.key === KEY && a.flags.spikependium?.bansheeWail;
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const live = e => e?.active && !e.duration.expired && !(Number.isFinite(e.duration.remaining) && e.duration.remaining <= 0);
const authority = message => game.users.activeGM ? game.user.isActiveGM : message.author?.id === game.user.id;
const selected = () => [...game.user.targets].map(t => t.document ?? t);
const sourceToken = a => { const t = a.getUsageToken?.(); return t?.actor?.uuid === a.actor.uuid ? t : null; };
function eligible(a, targets) {
  const source = sourceToken(a);
  return a.actor.isOwner && source && targets.length > 0 && targets.length <= 10
    && new Set(targets.map(t => t.actor?.uuid)).size === targets.length && targets.every(t => {
      const distance = tokensDistance(source, t);
      return t.actor?.system.isCreature && Number.isFinite(t.actor.system.attributes.hp.value) && t.parent === source.parent
        && !t.actor.statuses.has("deafened") && distance != null && distance <= 60;
    });
}
export function prepareBansheeDialog(activity, config, dialog) {
  if (!supported(activity)) return;
  const Base = dialog.applicationClass; dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      context.fields.push({ name: "spikependium.bansheeAudible", value: this.config.spikependium?.bansheeAudible ?? false,
        field: new foundry.data.fields.BooleanField({ label: "Все выбранные цели слышат вопль (нет тишины и иных препятствий)" }),
        input: context.inputs.createCheckboxInput });
      return context;
    }
  };
}
export function captureBansheeCast(activity, config, message) {
  captured.delete(activity);
  if (!supported(activity)) return;
  const targets = selected(), expected = message.data?.system?.targets;
  if (message.create === false || config.spikependium?.bansheeAudible !== true || !game.users.activeGM && targets.some(t => !t.actor?.isOwner) || !eligible(activity, targets)
    || expected && (expected.length !== targets.length || expected.some(t => !targets.some(v => t.actor === v.actor.uuid && t.token === v.uuid)))) {
    ui.notifications.warn("Вопль банши: выберите до десяти разных слышащих существ в пределах 60 футов; нужны токен заклинателя, подтверждение слышимости и Мастер либо права на все цели.");
    return false;
  }
  captured.set(activity, { caster: activity.actor.uuid, activity: activity.uuid, source: sourceToken(activity).uuid, time: game.time.worldTime,
    targets: targets.map(t => ({ token: t.uuid, actor: t.actor.uuid, hp: t.actor.system.attributes.hp.value })) });
  if (targets.some(t => t.hidden) || sourceToken(activity).hidden) {
    message.data ??= {}; message.data.whisper = game.users.filter(u => u.isGM).map(u => u.id); message.data.blind = true;
  }
}
export function prepareBansheeUpdates(activity, _config, updates) {
  prepared.delete(activity);
  if (!supported(activity)) return updates;
  const saved = captured.get(activity), targets = selected();
  if (!saved || saved.time !== game.time.worldTime || saved.source !== sourceToken(activity)?.uuid || !eligible(activity, targets)
    || saved.targets.length !== targets.length || saved.targets.some(t => !targets.some(v => v.uuid === t.token && v.actor.uuid === t.actor && v.actor.system.attributes.hp.value === t.hp))) return false;
  const event = foundry.utils.randomID(), receipt = { ...saved, event,
    targets: saved.targets.map(({ hp, ...t }) => ({ ...t, fatal: hp <= 50 })) };
  updates.actor[`flags.spikependium.bansheeCasts.${event}`] = { ...receipt, active: 1 };
  prepared.set(activity, receipt); return updates;
}
export function recordBansheeConsumption(activity, _config, message) {
  const r = prepared.get(activity);
  if (!r || activity.actor.flags.spikependium?.bansheeCasts?.[r.event]?.active !== 1) return;
  const path = `flags.spikependium.bansheeCasts.${r.event}.active`, deltas = message.data.system.deltas.actor ??= [];
  if (!deltas.some(d => d.keyPath === path)) deltas.push({ keyPath: path, delta: 1 });
}
export function recordBansheeUsage(activity, message) {
  const r = prepared.get(activity); prepared.delete(activity);
  if (!r || activity.actor.flags.spikependium?.bansheeCasts?.[r.event]?.active !== 1) return;
  foundry.utils.setProperty(message, "data.flags.spikependium.bansheeCast", r);
  message.data.system.targets = (message.data.system.targets ?? []).filter(t => r.targets.some(v => v.actor === t.actor && v.token === t.token && !v.fatal));
}
function receiptFor(message) {
  const r = message?.flags.spikependium?.bansheeCast, caster = resolve(r?.caster), a = message?.getAssociatedActivity?.();
  const record = caster?.flags.spikependium?.bansheeCasts?.[r?.event];
  if (message?.type !== "usage" || !r || !supported(a) || a.uuid !== r.activity || a.actor.uuid !== r.caster || !record || record.active !== 1
    || !Array.isArray(r.targets) || r.targets.length < 1 || r.targets.length > 10 || new Set(r.targets.map(t => t.actor)).size !== r.targets.length
    || !message.author || !caster.testUserPermission(message.author, "OWNER") || !/^[A-Za-z0-9]{16}$/.test(r.event)
    || JSON.stringify(r) !== JSON.stringify(Object.fromEntries(Object.entries(record).filter(([k]) => k !== "active")))
    || !message.system.deltas?.actor?.some(d => d.keyPath === `flags.spikependium.bansheeCasts.${r.event}.active` && d.delta === 1)) return;
  return { r, caster, activity: a };
}
export const bansheeCastPaid = message => !!receiptFor(message);
function ward(actor) {
  return actor.effects.find(e => live(e) && (
    (resolve(e.system.origin?.activity)?.item ?? resolve(e.origin))?.system.identifier === "death-ward"
    || e._stats?.duplicateSource?.startsWith("Compendium.dnd5e.spells24.Item.phbsplDeathWard0.ActiveEffect.")));
}
function fatalTarget(r, target) {
  const token = resolve(target.token), actor = token?.actor, source = resolve(r.source), distance = source && token && tokensDistance(source, token);
  return actor?.isOwner && actor.uuid === target.actor && source?.actor?.uuid === r.caster && source.parent === token.parent
    && distance != null && distance <= 60 && !actor.statuses.has("deafened") && Number.isFinite(actor.system.attributes.hp.value)
    && actor.system.attributes.hp.value <= 50 ? actor : null;
}
export async function resolveBansheeCast(message) {
  const info = receiptFor(message);
  if (!info || !authority(message)) return;
  const { r } = info;
  for (const target of r.targets.filter(t => t.fatal)) {
    const token = resolve(target.token), actor = token?.actor, key = `${r.event}:${target.actor}`;
    if (!actor?.isOwner || actor.uuid !== target.actor || actor.flags.spikependium?.bansheeDeaths?.[r.event]?.done || working.has(key)) continue;
    if (!fatalTarget(r, target)) {
      if (!message.flags.spikependium?.bansheeReview?.[actor.id]) {
        await message.setFlag("spikependium", `bansheeReview.${actor.id}`, true);
        ui.notifications.warn("Вопль банши: условия одной из смертельных целей изменились. Мастер должен разрешить её отдельно.");
      }
      continue;
    }
    working.add(key);
    try {
      let decision = actor.flags.spikependium?.bansheeDeaths?.[r.event];
      if (decision && decision.origin !== message.uuid) continue;
      if (!decision) {
        const protection = ward(actor);
        decision = { done: false, origin: message.uuid, protected: !!protection, ward: protection?.uuid ?? null,duel:!protection&&duelProtects(actor,token) };
        // Keep the decision before deleting the ward, so a partially failed batch cannot kill on retry.
        await actor.update({ [`flags.spikependium.bansheeDeaths.${r.event}`]: decision });
      }
      if(decision.duel){
        if(await protectDuelDeath(actor,token,message.uuid))await actor.update({[`flags.spikependium.bansheeDeaths.${r.event}`]:{...decision,done:true}});
        else ui.notifications.warn("Место для дуэли: условия защиты изменились. Разрешите смертельное воздействие с Мастером.");
        continue;
      }
      const protection = decision.protected && resolve(decision.ward);
      const dead = decision.protected || actor.statuses.has("dead") ? null : (await ActiveEffect.implementation.fromStatusEffect("dead")).toObject();
      if (!authority(message) || !receiptFor(message) || actor.flags.spikependium?.bansheeDeaths?.[r.event]?.done
        || !fatalTarget(r, target)) continue;
      const operations = [];
      if (decision.protected && protection?.parent === actor)
        operations.push({ action: "delete", documentName: "ActiveEffect", parent: actor, ids: [protection.id] });
      else if (!decision.protected && dead)
        operations.push({ action: "create", documentName: "ActiveEffect", parent: actor, data: [{ ...dead, _id: foundry.utils.randomID(), origin: message.uuid }], keepId: true });
      await actor.performBulkUpdate({ actor: { [`flags.spikependium.bansheeDeaths.${r.event}`]: { ...decision, done: true },
        ...(!decision.protected ? { "system.attributes.hp.value": 0, "flags.spikependium.soulInstantDeath": 1,
          ...(actor.system.attributes.death ? { "system.attributes.death.failure": 3 } : {}) } : {}) }, operations });
    } finally { working.delete(key); }
  }
}
export async function resumeBansheeCasts() {
  for (const message of game.messages) if (message.flags.spikependium?.bansheeCast && authority(message)) await resolveBansheeCast(message);
}
export function guardBansheeDamage(actor, _amount, _updates, options) {
  const card = options.originatingMessage, activity = card?.getAssociatedActivity?.();
  if (!supported(activity)) return;
  const origin = card.getOriginatingMessage?.(), info = receiptFor(origin);
  if (card.type === "damage" && info && activity.uuid === info.activity.uuid && card.author
    && info.caster.testUserPermission(card.author, "OWNER")
    && info.r.targets.some(t => t.actor === actor.uuid && !t.fatal && card.system.targets?.some(v => v.actor === t.actor && v.token === t.token))) return;
  ui.notifications.warn("Урон Вопля банши требует оплаченной исходной карточки и цели, у которой при накладывании было больше 50 хитов.");
  return false;
}
