const RULES = { "feat:magic-speaker": { dec: "cha", itm: "cha", per: "cha" }, "feat:magic-undertaker": { his: "int", med: "wis" } };
const BONUS = "@spikependiumOriginIntuition", applying = new Set();
export function prepareOriginGrantedAbility(activity) {
  if (!["feat:magic-ward", "feat:familiar-friend"].includes(activity?.item?.flags.spikependium?.key) || activity.type !== "cast"
    || !activity.flags.spikependium?.originGrantedAbility) return;
  const ability = activity.item.system.advancement.find(a => a.type === "ItemGrant"
    && a.configuration.items.some(i => i.uuid === activity.spell.uuid))?.value.ability;
  if (!["int", "wis", "cha"].includes(ability)) {
    ui.notifications.warn(`Выберите Интеллект, Мудрость или Харизму в продвижении черты ${activity.item.name ?? "происхождения"}.`);
    return false;
  }
  activity.updateSource({ "spell.ability": ability });
}
function choices(config, ability = null) {
  if (!config.subject?.isOwner || !config.skill || config.tool) return [];
  return config.subject.items.filter(item => {
    const required = RULES[item.flags.spikependium?.key]?.[config.skill];
    return required && (ability === null || ability === required);
  });
}
export function prepareOriginCheck(config, dialog) {
  const available = choices(config);
  if (!available.length) return;
  config.spikependium = { ...config.spikependium, originIntuition: config.spikependium?.originIntuition ?? "none" };
  const Base = dialog.applicationClass ?? CONFIG.Dice.D20Roll.DefaultConfigurationDialog;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConfigurationContext(context, options) {
      context = await super._prepareConfigurationContext(context, options);
      context.fields.push({ name: "spikependium.originIntuition", value: this.config.spikependium.originIntuition,
        field: new foundry.data.fields.StringField({ label: "Черта происхождения: дополнительный к4",
          choices: { none: "Не применять", ...Object.fromEntries(choices(this.config).map(i => [i.uuid, i.name])) },
          hint: "Бонус добавляется к результату этой проверки; выбранная характеристика должна соответствовать правилу черты." }) });
      return context;
    }
    _buildConfig(roll, formData, index) {
      roll = super._buildConfig(roll, formData, index);
      this.config.spikependium.originIntuition = formData?.get("spikependium.originIntuition") ?? this.config.spikependium.originIntuition;
      return roll;
    }
  };
}
export function buildOriginCheck(config, roll) {
  if (!config.spikependium?.originIntuition && !roll.options.spikependiumOriginIntuition) return;
  roll.parts = (roll.parts ?? []).filter(p => p !== BONUS);
  delete roll.data.spikependiumOriginIntuition; delete roll.options.spikependiumOriginIntuition;
  const item = choices(config, roll.data.abilityId ?? config.ability ?? "").find(i => i.uuid === config.spikependium?.originIntuition);
  if (!item) return;
  roll.parts.push(BONUS); roll.data.spikependiumOriginIntuition = "1d4"; roll.options.spikependiumOriginIntuition = item.uuid;
}
export function finalizeOriginCheck(rolls, config) {
  const selected = config.spikependium?.originIntuition;
  if (!rolls.length || !selected || selected === "none") return;
  if (rolls.some(r => !choices(config, r.data.abilityId ?? config.ability ?? "").some(i => i.uuid === selected)
    || r.options.spikependiumOriginIntuition !== selected || r.data.spikependiumOriginIntuition !== "1d4")) {
    ui.notifications.warn("Бонус черты происхождения недоступен для этой характеристики или черта изменилась. Повторите проверку."); return false;
  }
}
const isInspiration = a => a?.item?.flags.spikependium?.key === "feat:magic-undertaker" && a.flags.spikependium?.heroicInspirationSelf;
export function prepareOriginInspirationDialog(activity, config, dialog) {
  if (!isInspiration(activity)) return;
  const Base = dialog.applicationClass;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      context.fields.push({ name: "spikependium.stabilizedWithHelp", value: this.config.spikependium?.stabilizedWithHelp ?? false,
        field: new foundry.data.fields.BooleanField({ label: "Подтверждаю стабилизацию существа с 0 хитами действием Помощь" }), input: context.inputs.createCheckboxInput });
      return context;
    }
  };
}
export function canUseOriginInspiration(activity, config = {}) {
  if (!isInspiration(activity) || config.spikependium?.stabilizedWithHelp === true) return true;
  ui.notifications.warn("Понимание смерти требует подтверждения стабилизации действием Помощь."); return false;
}
export async function applyOriginInspiration(activity, _config, results) {
  if (!isInspiration(activity) || !activity.actor.isOwner || !results?.message || applying.has(activity.actor.uuid)) return;
  const message = results.message, actor = activity.actor;
  const cost = message.system.deltas?.item?.[activity.item.id];
  if (!cost?.some(d => d.keyPath === `system.activities.${activity.id}.uses.spent` && d.delta === 1)
    || actor.flags.spikependium?.originInspiration === message.id) return;
  applying.add(actor.uuid);
  try { await actor.update({ "system.attributes.inspiration": true, "flags.spikependium.originInspiration": message.id }); }
  finally { applying.delete(actor.uuid); }
}
