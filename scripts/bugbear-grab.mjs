import { tokensDistance, incapacitated } from "./effects.mjs";
import { monsterGrappleRule } from "./monster-actions.mjs";

const isGrab = a => a?.type === "save" && a.actor?.flags.spikependium?.key === "actor:mm25:bugbear-stalker"
  && a.flags.spikependium?.monsterAction === "bugbear-grab" && !!monsterGrappleRule(a);
export function prepareBugbearGrab(activity, _config, dialog) {
  if (!isGrab(activity)) return;
  const Base = dialog.applicationClass; dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      context.fields.push({ name: "spikependium.bugbearVisible", value: this.config.spikependium?.bugbearVisible ?? false,
        field: new foundry.data.fields.BooleanField({ label: "Багбер видит выбранное существо" }), input: context.inputs.createCheckboxInput });
      context.hasConsumption = true; return context;
    }
  };
}
export function canUseBugbearGrab(activity, config, message) {
  if (!isGrab(activity)) return;
  const source = activity.getUsageToken(), tokens = [...game.user.targets].map(t => t.document ?? t), target = tokens[0];
  const descriptors = message.data?.system?.targets;
  if (activity.actor.isOwner && activity.actor.system.attributes.hp.value > 0 && !incapacitated(activity.actor) && config.spikependium?.bugbearVisible === true
    && source?.actor?.uuid === activity.actor.uuid && tokens.length === 1 && target?.actor?.system?.isCreature
    && target.actor.uuid !== activity.actor.uuid && ["tiny", "sm", "med"].includes(target.actor.system.traits.size)
    && tokensDistance(source, target) != null && tokensDistance(source, target) <= 10
    && (!descriptors || (descriptors.length === 1 && descriptors[0].actor === target.actor.uuid
      && (!descriptors[0].token || descriptors[0].token === target.uuid)))) return;
  ui.notifications.warn("Быстрый захват: выберите одно видимое существо не больше Среднего в пределах 10 футов."); return false;
}
