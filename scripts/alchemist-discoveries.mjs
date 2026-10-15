const discoveryKey = item => item?.flags?.spikependium?.key ?? "";

export function alchemistBombDCBonus(actor, data) {
  if (!actor.items.some(item => discoveryKey(item) === "alchemist:discovery:blast-dc")) return 0;
  return (actor.appliedEffects ?? actor.effects ?? []).some(effect => effect.active && effect.flags.spikependium?.alchemistBombDC)
    ? Math.floor(Number(data.prof ?? actor.system?.attributes?.prof ?? 0) / 2) : 0;
}

export function canUseAlchemistDiscovery(activity) {
  if (!/^alchemist:(?:research-)?discovery:/.test(discoveryKey(activity.item))) return;
  const actor = activity.actor, required = activity.item.system.prerequisites;
  if (!actor?.isOwner || (actor.classes?.alchemist?.system.levels ?? 0) < Math.max(1, required.level)) {
    ui.notifications.warn("Для этого открытия нужен указанный уровень именно алхимика."); return false;
  }
  const specialties = [...required.items].filter(id => id.startsWith("subclass:"));
  if (specialties.length && !actor.items.some(item => item.type === "subclass" && specialties.includes(`subclass:${item.system.identifier}`))) {
    ui.notifications.warn("Для этого открытия нужна соответствующая специализация алхимика."); return false;
  }
  if (activity.item.system.identifier === "alchemist-discovery-metabolism") {
    const count = Number([...activity.consumption.targets].find(t => t.target === "feat:alchemist-reagents")?.value);
    if (!Number.isInteger(count) || count < 1 || count > actor.system.attributes.prof) {
      ui.notifications.warn("Нельзя потратить больше костей реагентов, чем бонус владения."); return false;
    }
  }
}

export function alchemistDiscoveryPrerequisites(wrapped, context = {}, options = {}) {
  const result = wrapped(context, options), key = discoveryKey(this.parent), actor = context.actor;
  if (!actor || !/^alchemist:(?:research-)?discovery:/.test(key)) return result;
  const owned = actor.identifiedItems.get(`feat:${this.identifier}`);
  if (owned?.size && !(context.added ?? []).some(i => i.uuid === this.parent.uuid))
    result.set("repeatable", { label: "Это открытие уже изучено", valid: false });
  return result;
}

export function firebrandDamageChanges(wrapped, item, change, changes) {
  if (!this.parent.flags.spikependium?.alchemistFirebrand || change.key !== "system.damage.parts")
    return wrapped(item, change, changes);
  // Native legacy damage enchantments also alter spells and healing on an item; coating affects its weapon attacks.
  const attacks = item.system.activities.getByTypes("attack").filter(activity => activity.attack.type.classification === "weapon");
  return wrapped({ system: { activities: { getByTypes: (...types) => types.includes("attack") ? attacks : [] } } }, change, changes);
}
