import { attackHitTargets } from "./companions.mjs";
import { opportunityTargetProtected } from "./cunning-disengage.mjs";

const STRIKE_IDS = new Set(["8FKHvTEMzK92yKo4", "8I7DzW0U2d8CuWql"]);
const PROFILE_ID = "WhVStqtfvQiffom6";
const applying = new Set();
const turnKey = combat => combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : null;

export function noOpportunityAttacks(actor) {
  return (actor?.effects ?? []).some(effect => effect.flags.spikependium?.noOpportunityAttacks
    && !effect.disabled && !effect.duration.expired && !effect.isSuppressed);
}

export function strikeHitSnapshots(message) {
  if (message.type !== "attack") return [];
  const activity = message.getAssociatedActivity();
  const source = message.getAssociatedToken();
  if (!STRIKE_IDS.has(activity?.id) || !activity.actor?.flags.spikependium?.key?.startsWith("actor:reanimated-companion")
    || source?.actor?.uuid !== activity.actor.uuid || source.actor.system.attributes.hp.value <= 0 || source.actor.statuses.has("dead")) return [];
  const profile = activity.item.effects.find(e => e.flags.spikependium?.noOpportunityAttacks);
  // Старый статблок получает только снимок отсутствующего профиля; предмет на листе не перезаписывается.
  const effect = { _id: profile?.id ?? PROFILE_ID, type: "base", name: "Ужасающий удар: нет провоцированных атак",
    img: "icons/magic/death/hand-withered-gray.webp", disabled: false, transfer: false, system: { changes: [] },
    flags: { spikependium: { noOpportunityAttacks: true } }, duration: { value: null, expiry: "targetStart", expired: false } };
  const hits = new Map();
  for (const { token } of attackHitTargets(message)) {
    if (!["character", "npc"].includes(token.actor.type) || token.actor.statuses.has("dead")) continue;
    const combats = game.combats.filter(c => c.started && c.getCombatantsByToken(token).length);
    const combat = combats.includes(game.combat) ? game.combat : combats.length === 1 ? combats[0] : null;
    if (combats.length && !combat) continue;
    hits.set(token.uuid, { token: token.uuid, actor: token.actor.uuid, combat: combat?.uuid, turn: turnKey(combat),
      start: ActiveEffect.implementation.getEffectStart(combat), effect, activity: activity.uuid,
      profile: profile?.uuid ?? `${activity.item.uuid}.ActiveEffect.${PROFILE_ID}` });
  }
  return [...hits.values()];
}

export function recordStrikeHits(message) {
  const hits = strikeHitSnapshots(message);
  if (hits.length) message.updateSource({ "flags.spikependium.strikeHits": hits });
}

export async function applyStrikeHits(message) {
  if (!game.user.isActiveGM || message.type !== "attack") return;
  const activity = message.getAssociatedActivity();
  if (!activity?.actor || !message.author || !activity.actor.testUserPermission(message.author, "OWNER")) return;
  const recorded = message.flags.spikependium?.strikeHits;
  // Мастер сам проверяет попадания и данные правила, а не исполняет профиль эффекта из флагов чужой карточки.
  const hits = strikeHitSnapshots(message).filter(hit => !recorded || recorded.some(old => old.token === hit.token
    && old.actor === hit.actor && old.combat === hit.combat && old.turn === hit.turn));
  for (const hit of hits) {
    const event = `${message.id}:${hit.token}`;
    if (applying.has(event) || message.flags.spikependium?.strikeApplied?.includes(event)) continue;
    const token = fromUuidSync(hit.token);
    const actor = token?.actor;
    const combat = hit.combat ? fromUuidSync(hit.combat) : null;
    if (!actor?.isOwner || actor.uuid !== hit.actor || (hit.combat && (!combat || turnKey(combat) !== hit.turn))) continue;
    applying.add(event);
    try {
      if (!actor.effects.some(e => e.flags.spikependium?.strikeHit === event)) {
        const profile = new ActiveEffect.implementation(hit.effect, { parent: activity.item });
        const tray = new dnd5e.applications.components.EffectApplicationElement();
        tray.chatMessage = message;
        const { action, data } = await tray._prepareEffectData(profile, actor);
        if (fromUuidSync(hit.token)?.actor !== actor || (hit.combat && turnKey(combat) !== hit.turn)) continue;
        data.duration = { ...data.duration, value: null, expiry: "targetStart", expired: false };
        data.type = "base";
        data.statuses = [];
        data.transfer = false;
        data.start = hit.start;
        data.flags = { spikependium: { noOpportunityAttacks: true, strikeHit: event } };
        data.system = { changes: [], origin: { activity: hit.activity, message: message.uuid, profile: hit.effect._id } };
        if (action === "create") {
          data._stats = { ...data._stats, duplicateSource: hit.profile, compendiumSource: null };
          await actor.createEmbeddedDocuments("ActiveEffect", [data]);
        } else await actor.updateEmbeddedDocuments("ActiveEffect", [data]);
      }
      await message.setFlag("spikependium", "strikeApplied", [...(message.flags.spikependium?.strikeApplied ?? []), event]);
    } catch (error) {
      console.error("Spikependium: запрет провоцированных атак", error);
      ui.notifications.error("Не удалось закончить применение Ужасающего удара. Проверьте эффект на цели; при необходимости примените его из карточки умения.");
    } finally { applying.delete(event); }
  }
}

export function prepareOpportunityRoll(config, dialog, message) {
  const actor = config.subject?.actor;
  if (!noOpportunityAttacks(actor) && !opportunityTargetProtected(config, message)) return;
  if (config.spikependium?.attackPurpose === "opportunity") {
    ui.notifications.warn("Провоцированная атака сейчас запрещена: действует Ужасающий удар или цель совершила Отступление.");
    return false;
  }
  config.spikependium = { ...config.spikependium, attackPurpose: "normal" };
  const Base = dialog.applicationClass ?? CONFIG.Dice.D20Roll.DefaultConfigurationDialog;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConfigurationContext(context, options) {
      context = await super._prepareConfigurationContext(context, options);
      context.fields.push({ name: "spikependium.attackPurpose", value: this.config.spikependium.attackPurpose,
        field: new foundry.data.fields.StringField({ label: "Тип атаки: ограничение провоцированных атак", required: true, blank: false,
          hint: "Провоцированные атаки сейчас запрещены. Обычные атаки и другие реакции остаются доступными.",
          choices: { normal: "Обычная атака", opportunity: "Провоцированная атака (запрещена)" } }) });
      return context;
    }
    _buildConfig(roll, formData, index) {
      roll = super._buildConfig(roll, formData, index);
      this.config.spikependium.attackPurpose = formData?.get("spikependium.attackPurpose") ?? this.config.spikependium.attackPurpose;
      roll.options.spikependiumOpportunityAttack = this.config.spikependium.attackPurpose === "opportunity";
      return roll;
    }
  };
}

export function validateOpportunityRoll(rolls, config) {
  if (!rolls.length || (!noOpportunityAttacks(config.subject?.actor) && !opportunityTargetProtected(config))) return;
  if (config.spikependium?.attackPurpose === "opportunity" || rolls.some(r => r.options.spikependiumOpportunityAttack)) {
    ui.notifications.warn("Провоцированная атака отменена: действует Ужасающий удар или цель совершила Отступление.");
    return false;
  }
}
