import { tokensDistance } from "./effects.mjs";

const KEY = "feat:greater-detection", MOD = "eGrjyYf6D9cgi0Bd";
function enhancement(activity) {
  if (activity?.item?.type !== "spell" || activity.item.system.identifier !== "see-invisibility"
    || activity.item.flags.spikependium?.storedSpell || !activity.actor?.isOwner) return;
  const item = activity.actor.items.find(i => i.flags.spikependium?.key === KEY);
  const resource = item?.system.activities.get(MOD);
  return resource ? { item, resource } : undefined;
}

export function canUseDetectionModifier(activity) {
  if (activity?.id !== MOD || activity.item.flags.spikependium?.key !== KEY) return true;
  ui.notifications.warn("Улучшенное обнаружение выбирается при накладывании Видеть невидимое.");
  return false;
}

export function prepareDetectionDialog(activity, config, dialog) {
  if (!(enhancement(activity)?.resource.uses.value > 0)) return;
  config.spikependium = { ...config.spikependium, usageChoice: true };
  const Base = dialog.applicationClass;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      context.fields.push({ name: "spikependium.improvedDetection", value: this.config.spikependium?.improvedDetection ?? false,
        field: new foundry.data.fields.BooleanField({ label: "Улучшенное обнаружение",
          hint: "Расходуется применение усиленной метки: преимущество на инициативу вам, запрет преимущества врагам в пределах 30 футов на время заклинания." }),
        input: context.inputs.createCheckboxInput });
      context.hasConsumption = true;
      return context;
    }
  };
}

export function prepareDetectionUpdates(activity, config, updates) {
  if (!config.spikependium?.improvedDetection) return updates;
  const selected = enhancement(activity), duration = activity.duration?.getEffectData();
  if (!(selected?.resource.uses.value > 0) || !Number.isFinite(duration?.value) || duration.value <= 0) {
    ui.notifications.warn("Улучшенное обнаружение недоступно: проверьте заклинание, длительность и применение усиленной метки.");
    return false;
  }
  const { item, resource } = selected;
  let update = updates.item.find(u => u._id === item.id);
  if (!update) { update = { _id: item.id }; updates.item.push(update); }
  update[`system.activities.${MOD}.uses.spent`] = resource.uses.spent + 1;
  const profile = activity.applicableEffects?.find(e => e.type === "base"
    && e.system.changes.some(c => c.key === "system.attributes.senses.special"));
  const base = profile?.toObject() ?? {};
  const data = { ...base, name: `${activity.item.name}: ${resource.name}`, img: item.img, type: "base", disabled: false, transfer: false,
    start: ActiveEffect.implementation.getEffectStart(), duration: { ...duration, expired: false },
    system: { ...base.system, magical: true, origin: { activity: activity.uuid, ...(profile ? { profile: profile.id } : {}) }, changes: [
      ...(base.system?.changes ?? []),
      { key: "system.attributes.init.roll.mode", value: "1", type: "add", phase: "initial" }
    ] }, flags: { ...base.flags, spikependium: { ...base.flags?.spikependium, improvedDetection: true } },
    _stats: profile ? { compendiumSource: profile.inCompendium ? profile.uuid : null,
      duplicateSource: profile.inCompendium ? null : profile.uuid } : {},
    description: "На время Видеть невидимое: преимущество на инициативу владельцу; враги в пределах 30 футов не получают преимущество на инициативу." };
  delete data._id;
  const previous = activity.actor.effects.filter(e => e.flags.spikependium?.improvedDetection
    || (profile && (e._stats?.duplicateSource === profile.uuid || e._stats?.compendiumSource === profile.uuid)));
  updates.operations ??= [];
  if (previous.length) {
    updates.operations.push({ action: "update", documentName: "ActiveEffect", parent: activity.actor,
      updates: [{ ...data, _id: previous[0].id }] });
    if (previous.length > 1) updates.operations.push({ action: "delete", documentName: "ActiveEffect", parent: activity.actor,
      ids: previous.slice(1).map(e => e.id) });
  } else updates.operations.push({ action: "create", documentName: "ActiveEffect", parent: activity.actor, data: [data] });
  return updates;
}

function activeDetection(actor) {
  return !actor?.statuses.has("antimagic") && actor?.effects.some(e => e.flags.spikependium?.improvedDetection
    && e.active && !e.duration.expired && !(Number.isFinite(e.duration.remaining) && e.duration.remaining <= 0));
}

export function detectionBlocksAdvantage(actor, token) {
  if (actor?.statuses.has("antimagic")) return false;
  if (!token) {
    const tokens = actor?.token ? [actor.token] : actor?.getActiveTokens(false, true) ?? [];
    if (tokens.length !== 1) return false;
    [token] = tokens;
  }
  if (!token.parent || ![-1, 1].includes(token.disposition)) return false;
  return token.parent.tokens.some(source => {
    if (!source.actor || source.actor.uuid === actor.uuid || ![-1, 1].includes(source.disposition)
      || source.disposition * token.disposition >= 0 || !activeDetection(source.actor)) return false;
    const distance = tokensDistance(source, token);
    return distance != null && distance <= 30;
  });
}

export function applyDetectionInitiative(actor, roll, token) {
  if (!roll || roll._evaluated || !detectionBlocksAdvantage(actor, token)) return;
  const { NORMAL, DISADVANTAGE } = CONFIG.Dice.D20Roll.ADV_MODE;
  roll.options.advantage = false;
  roll.options.advantageMode = roll.options.disadvantage || roll.options.advantageMode === DISADVANTAGE ? DISADVANTAGE : NORMAL;
  roll.configureModifiers();
}

export function finalizeDetectionInitiative(rolls, config) {
  for (const roll of rolls) applyDetectionInitiative(config.subject, roll);
}

export function combatantDetectionInitiative(wrapped, ...args) {
  const roll = wrapped(...args);
  if (this.actor) applyDetectionInitiative(this.actor, roll, this.token);
  return roll;
}
