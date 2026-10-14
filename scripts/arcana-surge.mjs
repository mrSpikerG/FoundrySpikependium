// shortcut: native consumption is non-atomic between different clients; add GM arbitration if simultaneous owners need it.
const BONUS = "@spikependiumOriginSurge", reservations = new Map();
const key = "feat:magic-overloaded";
function usage(config, message) {
  const id = message.data?.system?.origin ?? config.event?.target?.closest("[data-message-id]")?.dataset.messageId;
  let card = typeof id === "string" ? game.messages.get(id) : id;
  const seen = new Set();
  while (card && !seen.has(card)) {
    seen.add(card);
    if (card.type === "usage") return card;
    card = typeof card.system?.origin === "string" ? game.messages.get(card.system.origin) : card.system?.origin;
  }
}
function available(activity, card) {
  const actor = activity?.actor, spell = activity?.item;
  if (!actor?.isOwner || spell?.type !== "spell" || spell.system.school !== "evo" || card?.type !== "usage"
    || !card.author || !actor.testUserPermission(card.author, "OWNER")
    || card.getAssociatedActor()?.uuid !== actor.uuid || card.getAssociatedActivity()?.uuid !== activity.uuid) return;
  const feat = actor.items.find(i => i.flags.spikependium?.key === key);
  const resource = feat?.system.activities.find(a => a.flags.spikependium?.originSurge);
  const bonus = actor.system.attributes.prof;
  return resource?.uses.value > 0 && Number.isFinite(bonus) && bonus > 0 ? { feat, resource, bonus } : undefined;
}
export function canUseOriginSurge(activity, config = {}) {
  if (activity?.item?.flags.spikependium?.key !== key || !activity.flags.spikependium?.originSurge) return true;
  if (config.spikependium?.originSurgeReservation === reservations.get(activity.actor?.uuid)
    && reservations.has(activity.actor?.uuid)) return true;
  ui.notifications.warn("Всплеск мощи выбирается в окне урона заклинания школы Эвокации.");
  return false;
}
export function prepareOriginSurge(config, dialog, message) {
  const card = usage(config, message), benefit = available(config.subject, card);
  if (!benefit || message.data?.type === "healing") return;
  const choices = Object.fromEntries((config.rolls ?? []).flatMap((r, i) => r.options?.type in CONFIG.DND5E.healingTypes ? []
    : [[String(i), `${i + 1}: ${CONFIG.DND5E.damageTypes[r.options?.type]?.label ?? r.options?.type ?? "урон"}`]]));
  if (!Object.keys(choices).length) return;
  config.spikependium = { ...config.spikependium, originSurge: { feat: benefit.feat.uuid, bonus: benefit.bonus, cast: card.id,
    part: config.spikependium?.originSurge?.part ?? "none" } };
  const Base = dialog.applicationClass ?? CONFIG.Dice.DamageRoll.DefaultConfigurationDialog;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConfigurationContext(context, options) {
      context = await super._prepareConfigurationContext(context, options);
      context.fields.push({ name: "spikependium.originSurgePart", value: this.config.spikependium.originSurge.part,
        field: new foundry.data.fields.StringField({ label: `Всплеск мощи (+${benefit.bonus})`,
          choices: { none: "Не применять", ...choices }, hint: "Один компонент урона; одно применение до долгого отдыха." }) });
      return context;
    }
    _buildConfig(roll, formData, index) {
      roll = super._buildConfig(roll, formData, index);
      this.config.spikependium.originSurge.part = formData?.get("spikependium.originSurgePart") ?? this.config.spikependium.originSurge.part;
      return buildOriginSurge(this.config, roll, index);
    }
  };
}
export function buildOriginSurge(config, roll, index) {
  roll.parts = (roll.parts ?? []).filter(p => p !== BONUS);
  delete roll.data.spikependiumOriginSurge; delete roll.options.spikependiumOriginSurge;
  const selected = config.spikependium?.originSurge;
  if (selected?.part === String(index) && !(roll.options.type in CONFIG.DND5E.healingTypes)) {
    roll.parts.push(BONUS); roll.data.spikependiumOriginSurge = selected.bonus;
    roll.options.spikependiumOriginSurge = selected.feat;
  }
  return roll;
}
function valid(rolls, config) {
  const selected = config.spikependium?.originSurge;
  const benefit = available(config.subject, game.messages.get(selected?.cast));
  const roll = rolls[Number(selected?.part)];
  return benefit && /^\d+$/.test(selected.part) && benefit.feat.uuid === selected.feat && benefit.bonus === selected.bonus
    && rolls.every(r => !r._evaluated) && roll && !(roll.options.type in CONFIG.DND5E.healingTypes)
    && rolls.filter(r => r.options.spikependiumOriginSurge).length === 1
    && roll.options.spikependiumOriginSurge === selected.feat && roll.data.spikependiumOriginSurge === benefit.bonus ? benefit : undefined;
}
export function finalizeOriginSurge(rolls, config) {
  const selected = config.spikependium?.originSurge;
  if (!rolls.length || !selected || selected.part === "none") return;
  if (valid(rolls, config)) return;
  ui.notifications.warn("Всплеск мощи недоступен или условия изменились. Повторите бросок без него.");
  return false;
}
export async function consumeOriginSurge(wrapped, rolls, config = {}, message = {}, ...args) {
  const selected = config.spikependium?.originSurge;
  if (!rolls.length || !selected || selected.part === "none" || config.evaluate === false) return wrapped(rolls, config, message, ...args);
  const actor = config.subject?.actor, benefit = valid(rolls, config);
  if (!benefit || reservations.has(actor.uuid)) {
    rolls.splice(0); ui.notifications.warn("Всплеск мощи недоступен или уже используется."); return;
  }
  const reservation = Symbol(); reservations.set(actor.uuid, reservation);
  try {
    const updates = await benefit.resource.consume({ consume: { resources: true, spellSlot: false, action: false },
      spikependium: { originSurgeReservation: reservation } }, message);
    if (!updates) { rolls.splice(0); return; }
    foundry.utils.setProperty(message, "data.flags.spikependium.originSurge", { feat: selected.feat, cast: selected.cast,
      part: Number(selected.part), bonus: benefit.bonus });
    return await wrapped(rolls, config, message, ...args);
  } catch (error) {
    rolls.splice(0); console.error("Spikependium: Всплеск мощи", error);
    ui.notifications.error("Не удалось завершить бросок со Всплеском мощи. Проверьте расход применения перед повтором.");
  } finally { reservations.delete(actor.uuid); }
}
