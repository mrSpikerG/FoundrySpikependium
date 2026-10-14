const applying = new Set();
const keys = new Set(["actor:mm25:assassin", "actor:au-plant-vine"]);
const isDisengage = activity => activity?.type === "utility" && activity.activation.type === "bonus"
  && keys.has(activity.actor?.flags.spikependium?.key) && activity.flags.spikependium?.cunningDisengage === true;
function inTime(frame) {
  if (!frame || !Number.isFinite(frame.time)) return false;
  if (!frame.combat) return game.time.worldTime === frame.time;
  const combat = game.combats.get(frame.combat);
  return combat?.started && combat.round === frame.round && combat.turn === frame.turn
    && combat.combatant?.actor?.uuid === frame.actor;
}
function paid(actor, frame) {
  return !frame.payment || (/^flags\.spikependium\.disengageCasts\.[A-Za-z0-9]{16}\.spent$/.test(frame.payment)
    && foundry.utils.getProperty(actor, frame.payment) === 1);
}
export function protectedFromOpportunity(actor) {
  return keys.has(actor?.flags.spikependium?.key) && actor.effects.some(effect => {
    const frame = effect.flags.spikependium?.cunningDisengage;
    return frame?.actor === actor.uuid && effect.active && inTime(frame) && paid(actor, frame);
  });
}
export function opportunityTargetProtected(config, message) {
  const targets = message?.data?.system?.targets;
  if (targets) config.spikependium = { ...config.spikependium, opportunityTargets: targets.map(t => t.actor).filter(Boolean) };
  const snapshot = config.spikependium?.opportunityTargets;
  const actors = snapshot ? snapshot.map(uuid => fromUuidSync(uuid, { strict: false }))
    : [...(game.user.targets ?? [])].map(t => (t.document ?? t).actor);
  return actors.some(actor => actor && protectedFromOpportunity(actor));
}
export function recordDisengageUse(activity, message) {
  if (!isDisengage(activity) || !activity.actor.isOwner) return;
  const combats = game.combats.filter(c => c.started && c.getCombatantsByActor(activity.actor).length);
  const combat = combats.includes(game.combat) ? game.combat : combats.length === 1 ? combats[0] : undefined;
  if (combats.length && !combat) return;
  const payment = message.data.flags?.spikependium?.disengagePayment;
  foundry.utils.setProperty(message, "data.flags.spikependium.cunningDisengage", {
    actor: activity.actor.uuid, activity: activity.uuid, time: game.time.worldTime,
    combat: combat?.id ?? null, round: combat?.round ?? null, turn: combat?.turn ?? null,
    payment: payment ?? null
  });
}
export async function syncDisengage(message) {
  const frame = message?.flags?.spikependium?.cunningDisengage, activity = message?.getAssociatedActivity?.(), actor = activity?.actor;
  if (message?.type !== "usage" || !frame || !isDisengage(activity) || frame.actor !== actor.uuid || frame.activity !== activity.uuid
    || !actor.isOwner || !message.author || !actor.testUserPermission(message.author, "OWNER")
    || (game.users.activeGM ? game.user.id !== game.users.activeGM.id : game.user.id !== message.author.id)
    || applying.has(message.uuid)) return;
  const old = actor.effects.filter(e => e.flags.spikependium?.cunningDisengage && e.system.origin?.message === message.uuid);
  if (!inTime(frame) || !paid(actor, frame)) {
    if (old.length) await actor.deleteEmbeddedDocuments("ActiveEffect", old.map(e => e.id)); return;
  }
  if (old.length || message.flags.spikependium.disengageApplied) return;
  const source = activity.applicableEffects.find(e => e.flags.spikependium?.disengageTemplate === true);
  if (!source) return;
  applying.add(message.uuid);
  try {
    const tray = new dnd5e.applications.components.EffectApplicationElement(); tray.chatMessage = message;
    const { action, data } = await tray._prepareEffectData(source, actor);
    if (!inTime(frame) || !paid(actor, frame)) return;
    data.flags.spikependium ??= {}; data.flags.spikependium.cunningDisengage = structuredClone(frame);
    data.system.magical = false; data.duration = { value: null, units: "seconds", expiry: null, expired: false };
    await foundry.documents.modifyBatch([
      { action, documentName: "ActiveEffect", parent: actor, ...(action === "create" ? { data: [data] } : { updates: [data] }) },
      { action: "update", documentName: "ChatMessage", updates: [{ _id: message.id, "flags.spikependium.disengageApplied": true }] }
    ]);
  } finally { applying.delete(message.uuid); }
}
export async function cleanDisengage() {
  if (game.users.activeGM && game.user.id !== game.users.activeGM.id) return;
  const actors = new Set([...game.actors, ...[...game.scenes].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean));
  for (const actor of actors) {
    if (!actor.isOwner) continue;
    const expired = actor.effects.filter(e => {
      const frame = e.flags.spikependium?.cunningDisengage;
      return frame && (!inTime(frame) || !paid(actor, frame));
    });
    if (expired.length) await actor.deleteEmbeddedDocuments("ActiveEffect", expired.map(e => e.id));
  }
}
export async function resumeDisengage() {
  await cleanDisengage();
  for (const message of game.messages) {
    if (message.flags.spikependium?.cunningDisengage && inTime(message.flags.spikependium.cunningDisengage)
      && !message.flags.spikependium.disengageApplied) await syncDisengage(message);
  }
}
