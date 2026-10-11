export function incapacitated(actor) {
  return ["incapacitated", "unconscious", "dead", "paralyzed", "stunned", "petrified"].some(s => actor.statuses.has(s));
}

export function auraActive(effect, origin, distance) {
  if (!origin?.actor || incapacitated(origin.actor)) return false;
  const source = origin.actor;
  const target = effect.parent;
  if (target === source) return true;
  const type = effect.flags.spikependium.aura;
  const selected = source.effects.some(e => !e.disabled && !e.duration.expired && e.flags.spikependium?.aura === type
    && e.system.origin?.activity?.startsWith(`${origin.item.uuid}.Activity.`));
  if (!selected) return false;
  const radius = (source.classes.paladin?.system.levels ?? 0) >= 18 ? 30 : 10;
  // shortcut: без токенов на текущей сцене дистанция не проверяется; применять ауру на сцене боя.
  return distance == null || distance <= radius;
}

export function tokenDistance(a, b) {
  const first = a.getActiveTokens(false, true);
  const second = b.getActiveTokens(false, true);
  if (!first.length || !second.length || !canvas.ready) return null;
  let distance = Infinity;
  for (const source of first) for (const target of second) {
    const measured = canvas.grid.measurePath([source.object.center, target.object.center]).distance;
    const feet = dnd5e.utils.convertLength(measured, canvas.grid.units, "ft");
    const height = dnd5e.utils.convertLength(source.elevation - target.elevation, canvas.grid.units, "ft");
    distance = Math.min(distance, Math.hypot(feet, height));
  }
  return distance;
}

export function prepareAuraCondition(wrapped, data) {
  const effect = this.parent;
  if (!effect.flags.spikependium?.aura || !effect.system.origin?.activity) return wrapped(data);
  const origin = fromUuidSync(effect.system.origin.activity);
  const active = auraActive(effect, origin, origin?.actor ? tokenDistance(origin.actor, effect.parent) : null);
  return wrapped({ ...data, spikependium: { ...data?.spikependium, auraActive: active } });
}

export function refreshSceneAuras() {
  if (!canvas.ready) return;
  const actors = new Set(canvas.scene.tokens.map(t => t.actor).filter(Boolean));
  for (const actor of actors) if (actor.effects.some(e => e.flags.spikependium?.aura)) {
    actor.reset();
    actor.sheet?.render(false);
  }
}

export async function endEffectsOnDamage(actor, damage) {
  if (damage <= 0) return;
  const ids = actor.effects.filter(e => e.flags.spikependium?.endsOnDamage).map(e => e.id);
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
}
