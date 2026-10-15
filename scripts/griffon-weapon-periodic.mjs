import { griffonHitInfo, weaponDamageCard } from "./griffon-hit-triggers.mjs";

const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const working = new Set();
const actors = () => new Set([...(game.actors ?? []), ...[...(game.scenes ?? [])].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean));
const path = (effect, request) => `flags.spikependium.weaponTicks.${effect.id}.${request.key}`;
const paid = (effect, request) => effect.parent.flags.spikependium?.weaponTicks?.[effect.id]?.[request.key];
function info(effect, request) {
  const value = griffonHitInfo(effect);
  if (!value || request?.event !== effect.flags.spikependium?.weaponTickRequest?.event || request.effect !== effect.uuid
    || request.actor !== value.actor.uuid || request.token !== value.token.uuid || request.attack !== value.message.uuid) return;
  return value;
}
async function applyTick(effect, request) {
  if (!game.user.isActiveGM || working.has(effect.uuid)) return;
  const value = info(effect, request); if (!value || !value.actor.isOwner) return;
  working.add(effect.uuid);
  try {
    if (!paid(effect, request)) {
      const acid = value.frame.kind === "acidlight", card = await weaponDamageCard(value.frame, acid ? "1d4" : "3d4", acid ? "acid" : "radiant", "weaponTick", request);
      const roll = card?.rolls[0];
      if (!info(effect, request) || !roll || card.rolls.length !== 1 || !(roll instanceof CONFIG.Dice.DamageRoll) || !roll._evaluated
        || !Number.isFinite(roll.total) || roll.total < 0 || roll.options.type !== (acid ? "acid" : "radiant")) return;
      await value.actor.applyDamage([{ type: roll.options.type, value: roll.total }], { originatingMessage: card });
    }
    if (game.user.isActiveGM && paid(effect, request) && resolve(effect.uuid) === effect)
      await effect.setFlag("spikependium", "weaponTickRequest", { ...request, pending: false });
  } finally { working.delete(effect.uuid); }
}
export function recordGriffonWeaponTick(actor, _amount, updates, options) {
  const card = options.originatingMessage, request = card?.flags.spikependium?.weaponTick;
  if (!request) return;
  const effect = resolve(request.effect), value = effect && info(effect, request), roll = card.rolls[0];
  if (!game.user.isActiveGM || !card.author?.isGM || card.type !== "damage" || !value || paid(effect, request)
    || actor.uuid !== value.actor.uuid || card.system.origin !== value.message.id || card.rolls.length !== 1
    || !(roll instanceof CONFIG.Dice.DamageRoll) || !roll._evaluated || !Number.isFinite(roll.total) || roll.total < 0
    || roll.options.type !== (value.frame.kind === "acidlight" ? "acid" : "radiant")) return false;
  updates[path(effect, request)] = true;
}
export async function griffonWeaponStartTurn(wrapped, combatant) {
  const result = await wrapped(combatant);
  if (!game.user.isActiveGM || !combatant?.actor || !Number.isInteger(this.current?.round) || this.current.round < 1) return result;
  for (const effect of [...combatant.actor.effects]) {
    const value = griffonHitInfo(effect); if (!value || value.token.uuid !== combatant.token?.uuid) continue;
    const key = `${this.id}:${this.current.round}:${this.current.turn}:${combatant.id}`, event = `${key}:${effect.uuid}`;
    if (effect.flags.spikependium.weaponTickRequest?.event === event) continue;
    const request = { key, event, effect: effect.uuid, actor: value.actor.uuid, token: value.token.uuid, attack: value.message.uuid, pending: true };
    try { await effect.setFlag("spikependium", "weaponTickRequest", request); await applyTick(effect, request); }
    catch (error) { console.error("Spikependium: периодический урон оружия", error); }
  }
  return result;
}
export async function resumeGriffonWeaponTicks() {
  if (!game.user.isActiveGM) return;
  for (const actor of actors()) for (const effect of [...actor.effects]) {
    const request = effect.flags.spikependium?.weaponTickRequest;
    if (request?.pending) await applyTick(effect, request);
  }
}
export async function returnPurgingDaggers() {
  if (game.users.activeGM && !game.user.isActiveGM) return;
  for (const actor of actors()) {
    if (!actor.isOwner) continue;
    for (const item of actor.items) {
      const frame = item.flags.spikependium?.purgingEmbedded;
      if (!frame || working.has(item.uuid)) continue;
      const effect = resolve(frame.effect);
      if (effect && !effect.duration.expired) continue;
      working.add(item.uuid);
      try { await item.update({ "flags.spikependium.-=purgingEmbedded": null, ...(frame.thrown ? { "system.quantity": item.system.quantity + 1 } : {}) }); }
      finally { working.delete(item.uuid); }
    }
  }
}
