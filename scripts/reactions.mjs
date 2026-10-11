import { incapacitated } from "./effects.mjs";

// shortcut: concurrent owners on different clients share dnd5e's non-atomic updates; use GM arbitration if required.
const using = new Set(), prepared = new WeakMap(), applying = new Map();
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
function isReaction(activity) {
  return activity?.activation?.type === "reaction" && activity.actor?.system.isCreature;
}
const exempt = config => config?.consume === false || config?.consume?.action === false;
function combatFor(actor) {
  const combats = game.combats.filter(c => c.started && c.getCombatantsByActor(actor).length);
  return combats.includes(game.combat) ? game.combat : combats.length === 1 ? combats[0] : undefined;
}
function currentRecord(actor) {
  const id = actor?.flags.spikependium?.reactionId, record = actor?.flags.spikependium?.reactionCasts?.[id];
  if (!record || record.id !== id || record.actor !== actor.uuid || record.spent !== 1 || !Number.isFinite(record.time)
    || !/^[A-Za-z0-9]{16}$/.test(id ?? "")) return;
  const effect = actor.effects.get(record.id);
  if (record.reset || effect?.disabled || effect?.duration.expired
    || (Number.isFinite(effect?.duration.remaining) && effect.duration.remaining <= 0)) return;
  return inTime(actor, record) ? record : undefined;
}
function inTime(actor, record) {
  if (record.combat) {
    const combat = resolve(record.combat);
    if (!combat?.started) return false;
    const ownTurn = combat.turns.findIndex(c => c.actor?.uuid === actor.uuid);
    if (ownTurn < 0) return combat.round <= record.round;
    const nextRound = record.round + (ownTurn <= record.turn ? 1 : 0);
    return combat.round < nextRound || (combat.round === nextRound && combat.turn < ownTurn);
  }
  return !combatFor(actor) && game.time.worldTime <= record.time;
}
export function reactionAvailable(actor) {
  return !!actor?.system.isCreature && !incapacitated(actor) && !currentRecord(actor)
    && !actor.effects.some(e => e.flags.spikependium?.noReactions && e.active && !e.duration.expired
      && !(Number.isFinite(e.duration.remaining) && e.duration.remaining <= 0));
}
export function canUseReaction(activity, config = {}) {
  if (!isReaction(activity) || exempt(config) || reactionAvailable(activity.actor)) return true;
  ui.notifications.warn("Реакция уже израсходована до начала вашего следующего хода либо персонаж не может реагировать.");
  return false;
}
export async function reactionUse(wrapped, config = {}, ...args) {
  if (!isReaction(this) || this.type === "cast" || exempt(config)) return wrapped(config, ...args);
  const actor = this.actor;
  if (using.has(actor.uuid)) {
    ui.notifications.warn("Сначала завершите уже открытое действие реакции этого персонажа.");
    return;
  }
  if (!canUseReaction(this, config)) return;
  using.add(actor.uuid);
  try {
    const result = await wrapped(config, ...args);
    await applyReaction(actor);
    return result;
  } finally { using.delete(actor.uuid); }
}
export function prepareReactionUpdates(activity, config, updates) {
  prepared.delete(activity);
  if (!isReaction(activity) || activity.type === "cast" || exempt(config)) return updates;
  if (!activity.actor.isOwner || !canUseReaction(activity, config)) return false;
  const combat = combatFor(activity.actor);
  if (!combat && game.combats.some(c => c.started && c.getCombatantsByActor(activity.actor).length)) {
    ui.notifications.warn("Нельзя однозначно определить бой для реакции. Выберите бой этого персонажа.");
    return false;
  }
  const record = { id: foundry.utils.randomID(), actor: activity.actor.uuid, item: activity.item.uuid, activity: activity.id,
    time: game.time.worldTime, combat: combat?.uuid ?? null, round: combat?.round ?? null, turn: combat?.turn ?? null,
    start: ActiveEffect.implementation.getEffectStart(combat), applied: false, spent: 1 };
  for (const id of Object.keys(activity.actor.flags.spikependium?.reactionCasts ?? {}))
    updates.actor[`flags.spikependium.reactionCasts.-=${id}`] = null;
  updates.actor["flags.spikependium.reactionId"] = record.id;
  updates.actor[`flags.spikependium.reactionCasts.${record.id}`] = record;
  prepared.set(activity, record);
  return updates;
}
export function recordReaction(activity, message) {
  const record = prepared.get(activity);
  prepared.delete(activity);
  if (record && activity.actor.flags.spikependium?.reactionId === record.id
    && activity.actor.flags.spikependium?.reactionCasts?.[record.id]?.spent === 1)
    foundry.utils.setProperty(message, "data.flags.spikependium.reaction", { id: record.id, actor: record.actor });
}
export function recordReactionConsumption(activity, config, message) {
  const record = prepared.get(activity);
  if (!record || activity.actor.flags.spikependium?.reactionId !== record.id
    || activity.actor.flags.spikependium?.reactionCasts?.[record.id]?.spent !== 1) return;
  const keyPath = `flags.spikependium.reactionCasts.${record.id}.spent`;
  message.data.system.deltas ??= { actor: [], item: {} };
  const deltas = message.data.system.deltas.actor ??= [];
  if (!deltas.some(d => d.keyPath === keyPath)) deltas.push({ keyPath, delta: 1 });
}
export function reactionDeltaLabel(wrapped, ...args) {
  const data = wrapped(...args);
  if (/^flags\.spikependium\.reactionCasts\.[A-Za-z0-9]{16}\.spent$/.test(this.keyPath)) data.label = "Реакция";
  return data;
}
async function applyReaction(actor) {
  if (!actor.isOwner || (game.users.activeGM && !game.user.isActiveGM)) return;
  if (applying.has(actor.uuid)) return applying.get(actor.uuid);
  const task = (async () => {
    const id = actor.flags.spikependium?.reactionId;
    const old = actor.effects.filter(e => e.flags.spikependium?.reaction?.id === e.id
      && (e.id !== id || actor.flags.spikependium?.reactionCasts?.[id]?.spent !== 1 || e.duration.expired
        || !inTime(actor, actor.flags.spikependium.reactionCasts[id])));
    if (old.length) await actor.deleteEmbeddedDocuments("ActiveEffect", old.map(e => e.id));
    const record = currentRecord(actor);
    if (!record || record.applied) return;
    if (!actor.effects.get(record.id)) {
      await actor.createEmbeddedDocuments("ActiveEffect", [{ _id: record.id, name: "Реакция израсходована",
        img: "icons/svg/clockwork.svg", type: "base", transfer: false, start: record.start,
        description: "Реакция восстанавливается в начале следующего хода. Вне боя продвиньте игровое время. Отключение или удаление этого эффекта вручную восстанавливает реакцию.",
        duration: { value: null, units: "seconds", expiry: "targetStart" }, system: { magical: false, changes: [], origin: { actor: actor.uuid } },
        flags: { spikependium: { reaction: { id: record.id } } } }], { keepId: true });
      if (!actor.effects.get(record.id)) throw Error("Создание отметки реакции отклонено");
    }
    if (actor.flags.spikependium?.reactionId === record.id) await actor.setFlag("spikependium", `reactionCasts.${record.id}.applied`, true);
  })();
  applying.set(actor.uuid, task);
  try { return await task; } finally { applying.delete(actor.uuid); }
}
export async function finishReaction(activity) {
  if (isReaction(activity) && activity.actor?.isOwner) await applyReaction(activity.actor);
}
export async function resumeReactions() {
  const actors = new Set([...game.actors, ...[...game.scenes].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean));
  for (const actor of actors) await applyReaction(actor);
}
