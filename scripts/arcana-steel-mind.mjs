const ending = new Set();
export const hasSteelMind = actor => (actor?.appliedEffects ?? actor?.effects ?? []).some(e =>
  e.flags.spikependium?.steelMind === true && e.active && !e.duration?.expired);
const losesConcentration = actor => ["petrified", "unconscious", "dead"].some(s => actor.statuses.has(s));
const authority = actor => actor.isOwner && (game.users.activeGM ? game.user.isActiveGM
  : game.users.find(u => u.active && actor.testUserPermission(u, "OWNER"))?.id === game.user.id);

export function steelMindChallenge(wrapped, ...args) {
  return hasSteelMind(this) ? null : wrapped(...args);
}
export function steelMindRoll(wrapped, ...args) {
  if (!hasSteelMind(this)) return wrapped(...args);
  ui.notifications.info("Дар стального разума: бросок для поддержания Концентрации не требуется.");
  return null;
}
export function guardSteelMindSave(config) {
  if (hasSteelMind(config.subject) && (config.isConcentration || config.saveType === "concentration"
    || config.rolls?.some(r => r.options?.isConcentration))) {
    ui.notifications.info("Дар стального разума: бросок для поддержания Концентрации не требуется.");
    return false;
  }
}
export async function steelMindPrompt(wrapped, ...args) {
  if (!hasSteelMind(this)) return wrapped(...args);
  await endSteelMindConcentration(this);
  return null;
}
async function endSteelMindConcentration(actor) {
  if (!hasSteelMind(actor) || !losesConcentration(actor) || !authority(actor) || ending.has(actor.uuid)) return;
  ending.add(actor.uuid);
  try {
    while (hasSteelMind(actor) && losesConcentration(actor) && authority(actor) && actor.concentration.effects.size) {
      const before = new Set(actor.concentration.effects);
      await actor.endConcentration();
      // A third-party veto must not create an endless retry loop.
      if ([...actor.concentration.effects].every(e => before.has(e))) break;
    }
  } finally { ending.delete(actor.uuid); }
}
export async function syncSteelMind(document) {
  const actor = document?.documentName === "Actor" ? document : document?.actor ?? document?.parent?.actor;
  const actors = actor ? [actor] : new Map([...game.actors, ...[...game.scenes].flatMap(s => [...s.tokens].map(t => t.actor))]
    .filter(Boolean).map(a => [a.uuid, a])).values();
  for (const target of actors) await endSteelMindConcentration(target);
}
export function steelMindError(error) {
  console.error("Spikependium: Дар стального разума", error);
  ui.notifications.error("Не удалось завершить Концентрацию Дара стального разума. Проверьте эффекты; повторное подключение повторит обработку.");
}
