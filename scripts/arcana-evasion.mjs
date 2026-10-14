import { arcanaEffectCast } from "./arcana-spells.mjs";
import { tokensDistance, incapacitated } from "./effects.mjs";

const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
function eligible(actor, targetUuid, sourceUuid) {
  const target = resolve(targetUuid), source = resolve(sourceUuid);
  if (!actor || incapacitated(actor) || target?.actor?.uuid !== actor.uuid || !source?.actor
    || target.parent !== source.parent || incapacitated(source.actor)) return;
  const distance = tokensDistance(source, target);
  if (distance == null || distance > 30) return;
  const effect = source.actor.effects.find(e => e.flags.spikependium?.arcanaSpell === "aura-of-evasion" && arcanaEffectCast(e));
  return effect && { source, target, effect };
}
function choices(config) {
  const target = resolve(config.spikependium?.evasionTarget);
  return Object.fromEntries([...(target?.parent?.tokens ?? [])]
    .filter(t => eligible(config.subject, target.uuid, t.uuid)).map(t => [t.uuid, t.name]));
}
function selected(config) {
  const data = config.spikependium;
  return config.ability === "dex" && data?.evasionConfirmed === true
    ? eligible(config.subject, data.evasionTarget, data.evasionSource) : undefined;
}
function receipt(info) {
  return { source: info.source.uuid, target: info.target.uuid, effect: info.effect.uuid, origin: info.effect.system.origin.message };
}

export function prepareEvasionSave(config, dialog, message) {
  if (config.ability !== "dex" || !config.subject?.isOwner || incapacitated(config.subject)) return;
  const targets = dnd5e.utils.getSceneTargets(config.subject).map(t => t.document ?? t);
  const speaker = message.data?.speaker;
  const exact = targets.find(t => t.id === speaker?.token && t.parent.id === speaker?.scene);
  const target = exact ?? (targets.length === 1 ? targets[0] : null);
  if (!target) return;
  config.spikependium = { ...config.spikependium, evasionTarget: target.uuid };
  const sources = choices(config), own = Object.keys(sources).find(uuid => resolve(uuid).actor.uuid === config.subject.uuid);
  if (!Object.keys(sources).length) return;
  config.spikependium.evasionSource ??= own ?? Object.keys(sources)[0];
  config.spikependium.evasionConfirmed ??= resolve(config.spikependium.evasionSource)?.actor.uuid === config.subject.uuid;
  const Base = dialog.applicationClass ?? CONFIG.Dice.D20Roll.DefaultConfigurationDialog;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConfigurationContext(context, options) {
      context = await super._prepareConfigurationContext(context, options);
      context.fields.push({ name: "spikependium.evasionSource", value: this.config.spikependium.evasionSource,
        field: new foundry.data.fields.StringField({ label: "Аура увёртливости в 30 футах",
          choices: { none: "Не применять", ...choices(this.config) } }) },
      { name: "spikependium.evasionConfirmed", value: this.config.spikependium.evasionConfirmed,
        field: new foundry.data.fields.BooleanField({ label: "Это моя аура или аура союзника; эманация достигает моего токена" }) });
      return context;
    }
    _buildConfig(roll, formData, index) {
      roll = super._buildConfig(roll, formData, index);
      this.config.spikependium.evasionSource = formData?.get("spikependium.evasionSource") ?? this.config.spikependium.evasionSource;
      this.config.spikependium.evasionConfirmed = formData?.get("spikependium.evasionConfirmed") ?? this.config.spikependium.evasionConfirmed;
      return roll;
    }
  };
}
export function buildEvasionSave(config, roll) {
  const options = roll.options ??= {}, previous = options.spikependiumEvasion;
  if (previous && options.advantage === true && options.advantageMode === previous.appliedMode) {
    for (const [key, value] of Object.entries(previous.before)) {
      if (value === undefined) delete options[key]; else options[key] = value;
    }
  }
  delete options.spikependiumEvasion;
  const info = selected(config);
  if (!info) return;
  const before = { advantage: options.advantage, disadvantage: options.disadvantage, advantageMode: options.advantageMode };
  options.disadvantage ||= options.advantageMode === -1;
  options.advantage = true;
  if (options.advantageMode !== undefined) options.advantageMode = options.disadvantage ? 0 : 1;
  options.spikependiumEvasion = { ...receipt(info), before, appliedMode: options.advantageMode };
}
export function finalizeEvasionSave(rolls, config, _dialog, message) {
  if (message.data?.flags?.spikependium) delete message.data.flags.spikependium.evasionAura;
  if (!rolls.length || config.spikependium?.evasionConfirmed !== true || config.spikependium.evasionSource === "none") return;
  const info = selected(config), data = info && receipt(info);
  if (!info || rolls.some(r => !(r instanceof CONFIG.Dice.D20Roll)
    || Object.entries(data).some(([key, value]) => r.options.spikependiumEvasion?.[key] !== value))) {
    ui.notifications.warn("Аура увёртливости или положение токенов изменились. Повторите спасбросок с актуальными параметрами.");
    return false;
  }
  foundry.utils.setProperty(message, "data.flags.spikependium.evasionAura", data);
}
export function evasionAuraApplies(actor, save) {
  const data = save?.flags?.spikependium?.evasionAura;
  if (!data || save.system.ability !== "dex" || save.getAssociatedActor()?.uuid !== actor.uuid
    || !actor.testUserPermission(save.author, "OWNER") || !save.rolls?.length
    || save.rolls.some(r => !(r instanceof CONFIG.Dice.D20Roll) || !r._evaluated
      || ["source", "target", "effect", "origin"].some(key => r.options.spikependiumEvasion?.[key] !== data[key]))) return false;
  const info = eligible(actor, data.target, data.source);
  return !!info && info.effect.uuid === data.effect && info.effect.system.origin.message === data.origin;
}
