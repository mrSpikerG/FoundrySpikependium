const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
export const attackSignature = message => JSON.stringify(message.rolls.map(r => r.toJSON()));
export function attackSource(message) {
  const saved = message?.flags.spikependium?.attackSource;
  const attack = saved ? resolve(saved.message) : message?.type === "attack" ? message : message?.getOriginatingMessage?.();
  if (attack?.type !== "attack") return;
  if (saved && (saved.signature !== attackSignature(attack)
    || message.getAssociatedActivity()?.uuid !== attack.getAssociatedActivity()?.uuid)) return;
  return attack;
}
export function guardianRecords(attack) {
  if (attack?.type !== "attack") return [];
  return [...(game.scenes ?? [])].filter(scene => scene.flags?.spikependium?.guardianHits
    && !game.users.some(u => !u.isGM && scene.canUserModify(u, "update")))
    .flatMap(scene => Object.values(scene.flags.spikependium?.guardianHits ?? {}))
    .filter(r => r.attack === attack.uuid && game.users.get(r.author)?.isGM);
}
export function guardianTarget(attack, target, index = 0) {
  const record = guardianRecords(attack).find(r => r.state === "done" && r.victim === target.token && r.index === index
    && r.signature === attackSignature(attack));
  return record ? { ...record.target, isMiss: false } : target;
}
export function guardianEvaluatedTargets(wrapped, ...args) {
  return wrapped(...args).map(target => guardianTarget(this.parent, target));
}
export async function captureAttackDamage(wrapped, config = {}, dialog = {}, message = {}) {
  const id = config.event?.target?.closest("[data-message-id]")?.dataset.messageId;
  const value = message.data?.system?.origin;
  const origin = id ? game.messages.get(id) : typeof value === "string" ? game.messages.get(value) : value;
  // Match the same association used by AttackActivity's native damage button; never guess from an item's last attack.
  const attack = origin?.type === "attack" ? origin : origin?.getAssociatedRolls?.("attack").at(-1);
  if (attack?.type === "attack" && attack.getAssociatedActivity()?.uuid === this.uuid) {
    message = foundry.utils.deepClone(message);
    foundry.utils.setProperty(message, "data.flags.spikependium.attackSource", { message: attack.uuid, signature: attackSignature(attack) });
    foundry.utils.setProperty(message, "data.system.targets", attack.system.targets.map(t => {
      const { isMiss, ...target } = guardianTarget(attack, t);
      return target;
    }));
  }
  return wrapped(config, dialog, message);
}
