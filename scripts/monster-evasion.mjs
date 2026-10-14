import { incapacitated } from "./effects.mjs";
import { evasionAuraApplies } from "./arcana-evasion.mjs";

export function monsterEvasionDamage(wrapped, damages, options = {}) {
  if (incapacitated(this) || !Array.isArray(damages) || options.only === "healing"
    || damages.some(d => d.type in CONFIG.DND5E.healingTypes)) return wrapped(damages, options);
  const origin = options.originatingMessage?.getOriginatingMessage?.(), activity = origin?.getAssociatedActivity?.();
  const ability = activity?.save?.ability;
  const outcome = origin?.system.outcomes?.get(this.uuid);
  const saves = origin?.getAssociatedRolls?.("save")?.filter(m => m.getAssociatedActor()?.uuid === this.uuid), latest = saves?.at(-1);
  const nativeEvasion = (this.flags.spikependium?.key === "actor:mm25:assassin"
    || this.items?.some(item => item.flags.spikependium?.key === "alchemist:evasion"))
    && (this.appliedEffects ?? this.effects).some(e => e.flags.spikependium?.monsterEvasion && e.active);
  if (!nativeEvasion && !evasionAuraApplies(this, latest)) return wrapped(damages, options);
  if (activity?.type !== "save" || activity.damage?.onSave !== "half"
    || !(ability?.has?.("dex") || ability?.includes?.("dex"))
    || !origin.author || !activity.actor?.testUserPermission?.(origin.author, "OWNER")
    || (latest && (latest.system.ability !== "dex" || !this.testUserPermission(latest.author, "OWNER")))
    || (!latest && (ability.size ?? ability.length) !== 1)
    || !["success", "failure"].includes(outcome)) return wrapped(damages, options);
  const native = outcome === "success" ? 0.5 : 1;
  if (options.multiplier !== undefined && options.multiplier !== native) return wrapped(damages, options);
  return wrapped(damages, { ...options, multiplier: outcome === "success" ? 0 : 0.5 });
}
