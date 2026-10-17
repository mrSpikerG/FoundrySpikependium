import { incapacitated } from "./effects.mjs";
import { trickHideValid, trickHidingEffects, keepSneakySpell, keepSneakyAttack } from "./spell-trickster.mjs";

const applying = new Set(), rolling = new Set();
const isHide = a => a?.type === "check" && (a.actor?.flags.spikependium?.key === "actor:mm25:assassin" || a.item?.flags.spikependium?.key === "feat:au-spell-trickster")
  && a.flags.spikependium?.cunningHide === true;
export function prepareHideDialog(activity, _config, dialog) {
  if (!isHide(activity)) return;
  const Base = dialog.applicationClass; dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      context.fields.push({ name: "spikependium.hideCover", value: this.config.spikependium?.hideCover ?? false,
        field: new foundry.data.fields.BooleanField({ label: "Сильная заслонённость, укрытие на три четверти или полное укрытие; ни один враг не видит вас напрямую" }),
        input: context.inputs.createCheckboxInput }); context.hasConsumption = true; return context;
    }
  };
}
export function canUseHide(activity, config) {
  if (!isHide(activity)) return;
  if (config.spikependium?.hideCover === true && activity.actor.isOwner && !incapacitated(activity.actor)) return;
  ui.notifications.warn("Засада требует подходящего укрытия или заслонённости и отсутствия прямой видимости всех врагов."); return false;
}
export function recordHideUse(activity, message) {
  if (!isHide(activity)) return;
  foundry.utils.setProperty(message, "data.flags.spikependium.cunningHide", {
    actor: activity.actor.uuid, activity: activity.uuid, payment: message.data.flags?.spikependium?.hidePayment ?? null,
    epoch: activity.actor.flags.spikependium?.hideEpoch ?? 0
  });
}
function info(origin) {
  const activity = origin?.getAssociatedActivity?.(), receipt = origin?.flags.spikependium?.cunningHide, actor = activity?.actor;
  if (origin?.type !== "usage" || !receipt || !isHide(activity) || receipt.actor !== actor.uuid || receipt.activity !== activity.uuid
    || !origin.author || !actor.testUserPermission(origin.author, "OWNER")) return;
  const paid = !receipt.payment || (/^flags\.spikependium\.hideCasts\.[A-Za-z0-9]{16}\.spent$/.test(receipt.payment)
    && foundry.utils.getProperty(actor, receipt.payment) === 1);
  return { activity, actor, receipt, paid: paid && trickHideValid(origin), ended: receipt.epoch !== (actor.flags.spikependium?.hideEpoch ?? 0) };
}
export async function rollHide(activity, _config, results) {
  const origin = results?.message;
  if (!isHide(activity) || !origin || origin.author?.id !== game.user.id || !info(origin)?.paid || info(origin)?.ended || rolling.has(origin.uuid)
    || origin.flags.spikependium.hideRolled) return;
  rolling.add(origin.uuid);
  try {
    await activity.actor.rollSkill({ skill: "ste", ability: "dex", target: 15 }, { options: { chooseAbility: false } }, {
      rollMode: origin.blind ? "blind" : origin.whisper?.length ? "gm" : "public",
      data: { system: { origin: origin.id }, ...(origin.whisper?.length ? { whisper: [...origin.whisper], blind: !!origin.blind } : {}) }
    });
  } finally { rolling.delete(origin.uuid); }
}
export function canRollHide(config, _dialog, message) {
  const origin = game.messages.get(message.data?.system?.origin), value = info(origin);
  if (!value) return;
  if (value.paid && !value.ended && !origin.flags.spikependium.hideRolled && config.subject?.uuid === value.actor.uuid
    && config.skill === "ste" && config.ability === "dex") return;
  ui.notifications.warn("Эта Засада уже разрешена или закончилась. Используйте новое действие; переброс вдохновением выполняйте в карточке броска.");
  return false;
}
export async function syncHide(message) {
  const origin = message?.type === "check" ? message.getOriginatingMessage?.() : message?.type === "usage" ? message : null;
  const value = info(origin);
  if (!value || !value.actor.isOwner || (game.users.activeGM ? game.user.id !== game.users.activeGM.id : game.user.id !== origin.author.id)
    || applying.has(origin.uuid)) return;
  const { actor, activity, receipt, paid, ended } = value;
  const existing = actor.effects.filter(e => e.flags.spikependium?.cunningHide?.origin === origin.uuid);
  if (!paid || ended) { if (existing.length) await actor.deleteEmbeddedDocuments("ActiveEffect", existing.map(e => e.id)); return; }
  if (existing.length || origin.flags.spikependium.hideApplied || origin.flags.spikependium.hideEnded) return;
  const check = origin.getAssociatedRolls("check").filter(m => m.getAssociatedActor()?.uuid === actor.uuid && m.author
    && actor.testUserPermission(m.author, "OWNER") && m.system.skill === "ste" && m.system.ability === "dex"
    && m.rolls.length === 1 && m.rolls[0] instanceof CONFIG.Dice.D20Roll && m.rolls[0]._evaluated
    && m.rolls[0].options.target === 15).at(-1);
  if (!check) return;
  const roll = check.rolls[0];
  if (!Number.isFinite(roll.total)) return;
  applying.add(origin.uuid);
  try {
    await origin.setFlag("spikependium", "hideRolled", true);
    if (roll.total < 15) return;
    const source = activity.applicableEffects.find(e => e.flags.spikependium?.hideTemplate);
    if (!source) return;
    const tray = new dnd5e.applications.components.EffectApplicationElement(); tray.chatMessage = origin;
    const { action, data } = await tray._prepareEffectData(source, actor);
    if (!info(origin)?.paid || info(origin)?.ended || origin.flags.spikependium.hideEnded) return;
    data.system.magical = false; data.flags.spikependium ??= {};
    data.flags.spikependium.cunningHide = { origin: origin.uuid, dc: roll.total, payment: receipt.payment, actor: actor.uuid, epoch: receipt.epoch,
      ...(activity.flags.spikependium?.spellTrickEscape ? { spellTrick: true } : {}) };
    data.name = `Засада: Сл обнаружения ${roll.total}`;
    await foundry.documents.modifyBatch([
      { action, documentName: "ActiveEffect", parent: actor, ...(action === "create" ? { data: [data] } : { updates: [data] }) },
      { action: "update", documentName: "ChatMessage", updates: [{ _id: origin.id, "flags.spikependium.hideApplied": true }] }
    ]);
  } finally { applying.delete(origin.uuid); }
}
export async function endHide(actor) {
  if (!actor?.isOwner) return;
  const effects = trickHidingEffects(actor);
  if (!effects.length && actor.flags.spikependium?.key !== "actor:mm25:assassin"
    && !actor.items?.some?.(i=>i.flags?.spikependium?.key==="feat:au-spell-trickster")) return;
  await actor.performBulkUpdate({ actor: { "flags.spikependium.hideEpoch": (actor.flags.spikependium?.hideEpoch ?? 0) + 1 },
    operations: effects.length ? [{ action: "delete", documentName: "ActiveEffect", parent: actor, ids: effects.map(e => e.id) }] : [] });
}
export async function endHideOnAttack(rolls, { subject } = {}) {
  if (rolls.some(r => r._evaluated) && !await keepSneakyAttack(rolls,subject)) await endHide(subject?.actor);
}
export async function endHideOnSpell(activity,config,results) {
  const properties = activity?.item?.system?.properties;
  if (activity?.item?.type === "spell" && (properties?.has?.("vocal") || properties?.includes?.("vocal")) && !await keepSneakySpell(activity,config,results)) await endHide(activity.actor);
}
export async function cleanHide() {
  if (game.users.activeGM && game.user.id !== game.users.activeGM.id) return;
  const actors = new Set([...game.actors, ...[...game.scenes].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean));
  for (const actor of actors) {
    if (!actor.isOwner) continue;
    const invalid = actor.effects.filter(e => {
      const hide = e.flags.spikependium?.cunningHide;
      const origin=hide?.spellTrick ? fromUuidSync(hide.origin,{strict:false}) : null;
      return hide && (hide.epoch !== (actor.flags.spikependium?.hideEpoch ?? 0)
        || (hide.payment && foundry.utils.getProperty(actor, hide.payment) !== 1) || hide.spellTrick && (!origin || !trickHideValid(origin)));
    });
    if (invalid.length) await actor.deleteEmbeddedDocuments("ActiveEffect", invalid.map(e => e.id));
  }
}
export async function resumeHide() {
  await cleanHide();
  for (const message of game.messages) if (message.flags.spikependium?.cunningHide && !message.flags.spikependium.hideApplied)
    await syncHide(message);
}
