import { arcanaEffectCast } from "./arcana-spells.mjs";
import { tokensDistance } from "./effects.mjs";

function aura(actor) {
  if (!actor?.isOwner) return;
  return actor.effects.find(effect => effect.flags.spikependium?.arcanaSpell === "zone-of-amity" && arcanaEffectCast(effect));
}
function eligible(config, uuid) {
  if (!uuid || uuid === "none" || !aura(config.subject)) return;
  const target = uuid && fromUuidSync(uuid, { strict: false });
  const source = dnd5e.utils.getSceneTargets(config.subject)[0]?.document;
  const distance = source && target?.actor?.system?.isCreature && typeof target.getOccupiedGridSpaceOffsets === "function"
    && typeof target.getCenterPoint === "function" ? tokensDistance(source, target) : null;
  return distance != null && distance <= 60 ? target : undefined;
}
function choices(config) {
  return Object.fromEntries([...game.user.targets].map(t => t.document ?? t)
    .filter(t => eligible(config, t.uuid)).map(t => [t.uuid, t.name]));
}
export function prepareAmityCheck(config, dialog) {
  if (!aura(config.subject) || !Object.keys(choices(config)).length) return;
  config.spikependium = { ...config.spikependium, amityTarget: config.spikependium?.amityTarget ?? "none",
    amityInfluence: config.spikependium?.amityInfluence ?? false };
  const Base = dialog.applicationClass ?? CONFIG.Dice.D20Roll.DefaultConfigurationDialog;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConfigurationContext(context, options) {
      context = await super._prepareConfigurationContext(context, options);
      context.fields.push({ name: "spikependium.amityTarget", value: this.config.spikependium.amityTarget,
        field: new foundry.data.fields.StringField({ label: "Область дружелюбия: существо в 60 футах",
          choices: { none: "Не применять", ...choices(this.config) } }) },
      { name: "spikependium.amityInfluence", value: this.config.spikependium.amityInfluence,
        field: new foundry.data.fields.BooleanField({ label: "Эта проверка направлена на влияние на выбранное существо" }) });
      return context;
    }
    _buildConfig(roll, formData, index) {
      roll = super._buildConfig(roll, formData, index);
      this.config.spikependium.amityTarget = formData?.get("spikependium.amityTarget") ?? this.config.spikependium.amityTarget;
      this.config.spikependium.amityInfluence = formData?.get("spikependium.amityInfluence") ?? this.config.spikependium.amityInfluence;
      return roll;
    }
  };
}
export function buildAmityCheck(config, roll) {
  const options = roll.options ??= {}, previous = options.spikependiumAmity;
  if (previous && options.minimum === previous.applied) {
    if (previous.minimum == null) delete options.minimum;
    else options.minimum = previous.minimum;
  }
  delete options.spikependiumAmity;
  const selected = config.spikependium;
  if (selected?.amityInfluence !== true || !eligible(config, selected.amityTarget)) return;
  const minimum = options.minimum, applied = Math.max(minimum ?? -Infinity, 10);
  options.minimum = applied;
  options.spikependiumAmity = { minimum, applied, target: selected.amityTarget };
}
export function finalizeAmityCheck(rolls, config) {
  const selected = config.spikependium;
  if (!rolls.length || selected?.amityInfluence !== true || !selected.amityTarget || selected.amityTarget === "none") return;
  if (!eligible(config, selected.amityTarget) || rolls.some(r => r.options?.spikependiumAmity?.target !== selected.amityTarget
    || !(r.options.minimum >= 10))) {
    ui.notifications.warn("Область дружелюбия или цель проверки изменилась. Повторите проверку с актуальными параметрами.");
    return false;
  }
}
