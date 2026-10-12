import { attackHitTargets } from "./companions.mjs";
import { hollowTransformation } from "./hollow-warden.mjs";
import { incapacitated } from "./effects.mjs";

const KEY = "subclass:hollow-warden:ravenous-might", using = new Map(), running = new Set(), healing = new Set();
const prepared = new WeakMap();
const turn = () => game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : `time:${game.time.worldTime}`;
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const feature = actor => actor?.items.find(i => i.flags.spikependium?.key === KEY)?.system.activities.find(a => a.type === "heal");
const isRavenous = a => a?.type === "heal" && a.item.flags.spikependium?.key === KEY;
const bloodied = actor => { const hp = actor.system.attributes.hp; return hp.value > 0 && hp.value <= (hp.effectiveMax ?? hp.max) / 2; };
export function recordRavenousHit(message) {
  if (message.type !== "attack" || !attackHitTargets(message).length) return;
  const actor = message.getAssociatedActivity()?.actor, form = hollowTransformation(actor);
  if (!feature(actor) || !form || !bloodied(actor)) return;
  message.updateSource({ "flags.spikependium.ravenousHit": { actor: actor.uuid, form: form.uuid, turn: turn(), time: game.time.worldTime } });
}
function eligible(actor, record, message) {
  return actor.isOwner && actor.system.attributes.hp.value > 0 && !incapacitated(actor) && feature(actor)
    && hollowTransformation(actor)?.uuid === record.form && record.actor === actor.uuid && record.turn === turn()
    && record.time === game.time.worldTime && actor.flags.spikependium?.ravenousTurn !== turn()
    && message.getAssociatedActivity()?.actor?.uuid === actor.uuid && attackHitTargets(message).length > 0;
}
export function canUseRavenous(activity, config = {}) {
  if (!isRavenous(activity)) return true;
  const grant = using.get(activity.actor.uuid);
  if (grant?.activity === activity && config.spikependium?.ravenousHit === grant.message.uuid && eligible(activity.actor, grant.record, grant.message)) return true;
  if (config.spikependium?.ravenousManual === true && bloodied(activity.actor) && hollowTransformation(activity.actor)
    && activity.actor.flags.spikependium?.ravenousTurn !== turn()) return true;
  ui.notifications.warn("Голодающая мощь требует попадания в трансформации, окровавленного состояния на момент попадания и свободного применения в текущем ходу.");
  return false;
}
export function prepareRavenousDialog(activity, config, dialog) {
  if (!isRavenous(activity) || using.get(activity.actor.uuid)?.activity === activity) return;
  const Base = dialog.applicationClass;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      context.fields.push({ name: "spikependium.ravenousManual", value: this.config.spikependium?.ravenousManual ?? false,
        field: new foundry.data.fields.BooleanField({ label: "Подтверждаю попадание в трансформации, будучи окровавленным",
          hint: "Для атак, разрешённых вручную. Счётчик общий с автоматическим предложением: один раз в ход." }), input: context.inputs.createCheckboxInput });
      context.hasConsumption = true;
      return context;
    }
  };
}
export function prepareRavenousUpdates(activity, config, updates) {
  prepared.delete(activity);
  if (!isRavenous(activity)) return updates;
  if (!canUseRavenous(activity, config)) return false;
  const actor = activity.actor, id = foundry.utils.randomID();
  const record = { id, actor: actor.uuid, turn: turn(), time: game.time.worldTime, healed: false,
    previous: actor.flags.spikependium?.ravenousTurn ?? null };
  updates.actor["flags.spikependium.ravenousTurn"] = record.turn;
  updates.actor["flags.spikependium.ravenousUse"] = record;
  prepared.set(activity, record);
  return updates;
}
export function recordRavenousUse(activity, message) {
  const record = prepared.get(activity); prepared.delete(activity);
  if (record && activity.actor.flags.spikependium?.ravenousUse?.id === record.id)
    foundry.utils.setProperty(message, "data.flags.spikependium.ravenousUse", { id: record.id, actor: record.actor });
}
export async function rollRavenousHealing(wrapped, config = {}, dialog = {}, message = {}) {
  if (!isRavenous(this)) return wrapped(config, dialog, message);
  const value = message.data?.system?.origin ?? config.event?.target?.closest("[data-message-id]")?.dataset.messageId;
  const origin = typeof value === "string" ? game.messages.get(value) : value;
  const paid = origin?.flags.spikependium?.ravenousUse, current = this.actor.flags.spikependium?.ravenousUse;
  if (!paid || paid.id !== current?.id || paid.actor !== this.actor.uuid || current.healed
    || current.turn !== turn() || origin.getAssociatedActivity()?.uuid !== this.uuid) {
    ui.notifications.warn("Лечение Голодающей мощью выполняется из её текущей карточки применения. Старые карточки не дают нового лечения."); return;
  }
  foundry.utils.setProperty(message, "data.flags.spikependium.ravenousHealing", { id: paid.id, actor: paid.actor });
  foundry.utils.setProperty(message, "data.system.targets", dnd5e.dataModels.chatMessage.fields.TargetsField.getDescriptors(
    this.actor.getActiveTokens(false, true)));
  const rolls = await wrapped(config, dialog, message);
  if (!rolls?.length) {
    if (this.actor.flags.spikependium?.ravenousUse?.id === paid.id && !this.actor.flags.spikependium.ravenousUse.healed) {
      await this.actor.update({ "flags.spikependium.ravenousTurn": current.previous,
        "flags.spikependium.ravenousUse": null,
        ...(game.combat?.started ? { [`flags.spikependium.turnUses.-=${this.flags.spikependium?.group ?? this.item.id + this.id}`]: null } : {}) });
    }
    return rolls;
  }
  const card = game.messages.find(m => m.type === "healing" && m.author?.id === game.user.id
    && m.flags.spikependium?.ravenousHealing?.id === paid.id && m.getAssociatedActivity()?.uuid === this.uuid);
  if (!card || rolls.some(r => !r._evaluated || r.options.type !== "healing")) {
    ui.notifications.warn("Проверьте карточку Голодающей мощи: штатный бросок лечения не найден. Автоматической записи хитов нет."); return rolls;
  }
  await this.actor.applyDamage([{ type: "healing", value: Math.max(0, rolls.reduce((sum, r) => sum + r.total, 0)) }], { originatingMessage: card });
  return rolls;
}
export function recordRavenousHealing(actor, _amount, updates, options = {}) {
  const saved = options.originatingMessage?.flags.spikependium?.ravenousHealing;
  if (saved?.actor === actor.uuid && actor.flags.spikependium?.ravenousUse?.id === saved.id)
    updates["flags.spikependium.ravenousUse.healed"] = true;
}
export async function ravenousApplyDamage(wrapped, damages, options = {}) {
  const message = options.originatingMessage, saved = message?.flags.spikependium?.ravenousHealing;
  if (!saved) return wrapped(damages, options);
  const current = this.flags.spikependium?.ravenousUse;
  if (saved.actor !== this.uuid || saved.id !== current?.id || current.healed || healing.has(this.uuid) || message.type !== "healing"
    || !message.author || !this.testUserPermission(message.author, "OWNER")) {
    ui.notifications.warn("Это лечение уже применено, устарело или относится к другому персонажу."); return;
  }
  healing.add(this.uuid);
  try { return await wrapped(damages, options); } finally { healing.delete(this.uuid); }
}
export async function chooseRavenousHeal(message) {
  const record = message.flags.spikependium?.ravenousHit;
  if (message.type !== "attack" || !record || !message.author || running.has(message.id)
    || (game.users.activeGM ? !game.user.isActiveGM : message.author.id !== game.user.id)) return;
  const actor = resolve(record.actor);
  if (!actor || !actor.testUserPermission(message.author, "OWNER") || !eligible(actor, record, message)
    || message.flags.spikependium?.ravenousDecision) return;
  running.add(message.id);
  try {
    await message.setFlag("spikependium", "ravenousDecision", "prompted");
    const owner = message.author.active && !message.blind && !message.whisper?.length ? message.author : game.user;
    const accepted = await foundry.applications.api.DialogV2.query(owner, "confirm", { window: { title: "Голодающая мощь" }, rejectClose: false,
      content: "<p>Попадание в трансформации, будучи окровавленным: восстановить 1к10 + модификатор Мудрости хитов? Доступно один раз в ход. Хиты запишутся после штатного броска лечения.</p>" });
    if (!accepted || !eligible(actor, record, message)) return;
    const activity = feature(actor);
    using.set(actor.uuid, { activity, record, message });
    try {
      const used = await activity.use({ consume: { action: true, resources: true, spellSlot: false }, subsequentActions: false,
        spikependium: { ravenousHit: message.uuid } }, { configure: false }, {});
      if (used?.message) await activity.rollDamage({}, {}, { data: { system: { origin: used.message.id } } });
    } finally { using.delete(actor.uuid); }
  } finally { running.delete(message.id); }
}
