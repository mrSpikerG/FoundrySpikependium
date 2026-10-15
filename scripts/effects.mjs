export function incapacitated(actor) {
  return ["incapacitated", "unconscious", "dead", "paralyzed", "stunned", "petrified"].some(s => actor.statuses.has(s));
}

export function auraActive(effect, origin, distance) {
  if (!origin?.actor || incapacitated(origin.actor)) return false;
  const source = origin.actor;
  const target = effect.parent;
  if (target === source) return true;
  const type = effect.flags.spikependium.aura;
  const prefixes = [`${origin.item.uuid}.Activity.`, `.Item.${origin.item.id}.Activity.`];
  const selected = source.effects.some(e => !e.disabled && !e.duration.expired && e.flags.spikependium?.aura === type
    && prefixes.some(prefix => e.system.origin?.activity?.startsWith(prefix)));
  if (!selected) return false;
  const radius = (source.classes.paladin?.system.levels ?? 0) >= 18 ? 30 : 10;
  // shortcut: без токенов на текущей сцене дистанция не проверяется; применять ауру на сцене боя.
  return distance == null || distance <= radius;
}

export function tokenDistance(a, b) {
  const first = a.getActiveTokens(false, true);
  const second = b.getActiveTokens(false, true);
  if (!first.length || !second.length || !canvas.ready) return null;
  return Math.min(...first.flatMap(source => second.map(target => tokensDistance(source, target))));
}

export function tokensDistance(source, target) {
  const grid = source.parent?.grid ?? (canvas.ready ? canvas.grid : null);
  if (!grid || (source.parent && source.parent !== target.parent)) return null;
  const points = token => {
    const offsets = token.getOccupiedGridSpaceOffsets();
    return offsets.length ? offsets.map(o => {
      const point = grid.getCenterPoint(o);
      return { ...point, elevation: point.elevation ?? token.elevation ?? 0 };
    }) : [token.getCenterPoint()];
  };
  let distance = Infinity;
  for (const start of points(source)) for (const end of points(target)) {
    const measured = grid.measurePath([start, end]).distance;
    const feet = dnd5e.utils.convertLength(measured, grid.units, "ft");
    distance = Math.min(distance, feet);
  }
  return distance;
}

export function prepareAuraCondition(wrapped, data) {
  const effect = this.parent;
  if (!effect.flags.spikependium?.aura || !effect.system.origin?.activity) return wrapped(data);
  const origin = fromUuidSync(effect.system.origin.activity, { relative: effect.parent, strict: false });
  const active = auraActive(effect, origin, origin?.actor ? tokenDistance(origin.actor, effect.parent) : null);
  return wrapped({ ...data, spikependium: { ...data?.spikependium, auraActive: active } });
}

export function refreshSceneAuras() {
  if (!canvas.ready) return;
  const actors = new Set([...game.actors, ...[...game.scenes].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean));
  for (const actor of actors) if (actor.effects.some(e => e.flags.spikependium?.vestigeAura
    || (e.flags.spikependium?.aura && canvas.scene.tokens.some(t => t.actor === actor)))) {
    actor.reset();
    actor.sheet?.render(false);
  }
}

export async function endEffectsOnDamage(actor, damage) {
  if (damage <= 0) return;
  const ids = actor.effects.filter(e => e.flags.spikependium?.endsOnDamage).map(e => e.id);
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
}

export async function applySelfEffects(activity, config, results) {
  if (!activity.item.flags.spikependium?.key || activity.type !== "heal" || activity.target.affects.type !== "self"
    || activity.applicableEffects.length !== 1) return;
  for (const effect of activity.applicableEffects) {
    const actor = activity.actor;
    const changes = activity.getAppliedEffectChanges(effect, { chatMessage: results.message, target: actor });
    const data = foundry.utils.mergeObject(effect.toObject(), changes);
    Object.assign(data, { disabled: false, transfer: false, start: ActiveEffect.implementation.getEffectStart() });
    data.duration.expired = false;
    data._stats = { ...data._stats, compendiumSource: null, duplicateSource: effect.uuid };
    data.system.origin = { activity: activity.uuid, profile: effect.id, message: results.message?.uuid };
    data.system.changes = await ActiveEffect.implementation.forApplication(data.system.changes, activity, actor);
    const old = actor.effects.filter(e => e.system.origin?.activity?.startsWith(`${activity.item.uuid}.Activity.`));
    const existing = old.find(e => e.system.origin.profile === effect.id);
    const replace = old.filter(e => e.id !== existing?.id).map(e => e.id);
    if (replace.length) await actor.deleteEmbeddedDocuments("ActiveEffect", replace);
    if (existing) {
      data._id = existing.id;
      await existing.update(data);
    } else {
      delete data._id;
      await actor.createEmbeddedDocuments("ActiveEffect", [data]);
    }
  }
}

export function endedEffects(actor, resolve, distance) {
  return actor.effects.filter(e => {
    const rules = e.flags.spikependium;
    if (!rules) return false;
    if (rules.endsWithMutable && !actor.effects.some(form => form.flags.spikependium?.mutableForm
      && !form.disabled && !form.duration.expired)) return true;
    if (rules.endsOnIncapacitated && incapacitated(actor)) return true;
    if (!rules.endsOutside || !e.system.origin?.activity) return false;
    const source = resolve(e.system.origin.activity)?.actor;
    const measured = source ? distance(source, actor) : null;
    return measured != null && measured > rules.endsOutside;
  }).map(e => e.id);
}

let checking = false;
let pending = false;
export async function endSceneEffects() {
  if (!canvas.ready || game.users.find(u => u.active && u.isGM)?.id !== game.user.id) return;
  pending = true;
  if (checking) return;
  checking = true;
  try {
    do {
      pending = false;
      const actors = new Set([...game.actors, ...canvas.scene.tokens.map(t => t.actor)].filter(Boolean));
      for (const actor of actors) {
        const ids = endedEffects(actor, fromUuidSync, tokenDistance);
        if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
      }
    } while (pending);
  } catch (error) {
    console.error("Spikependium: досрочное снятие эффектов", error);
    ui.notifications.error("Не удалось снять завершившийся эффект. Подробности в консоли.");
  } finally {
    checking = false;
  }
}
