import { arcanaEffectCast, arcanaSpellError } from "./arcana-spells.mjs";

const working = new Set();
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
function tickInfo(effect, request) {
  const info = arcanaEffectCast(effect);
  if (!info || info.receipt.kind !== "putrid-burst" || request?.event !== effect.flags.spikependium?.arcanaTickRequest?.event
    || resolve(request.token)?.actor?.uuid !== info.actor.uuid) return;
  return info;
}
function tickCard(effect, request) {
  return game.messages.find(message => message.type === "damage" && message.author?.isGM
    && message.flags.spikependium?.arcanaTick?.effect === effect.uuid
    && message.flags.spikependium.arcanaTick.event === request.event);
}
async function applyTick(effect, request) {
  if (!game.user.isActiveGM || working.has(effect.uuid)) return;
  const info = tickInfo(effect, request);
  if (!info || !info.actor.isOwner || info.actor.flags.spikependium?.arcanaTicks?.[info.origin.id]?.event === request.event) return;
  working.add(effect.uuid);
  try {
    let message = tickCard(effect, request);
    if (!message) {
      const activity = [...info.activity.item.system.activities].find(a => a.type === "damage" && !a.consumption.spellSlot);
      if (!activity) throw Error("Не найдено действие периодического урона Гнойного взрыва");
      const token = resolve(request.token), hidden = token.hidden || info.origin.blind || info.origin.whisper.length;
      await activity.rollDamage({ scaling: 0, isCritical: false }, { configure: false }, { create: true,
        rollMode: hidden ? "gm" : "public", data: {
          speaker: ChatMessage.getSpeaker({ actor: info.caster }),
          ...(info.origin.whisper.length ? { whisper: [...info.origin.whisper], blind: info.origin.blind } : {}),
          system: { origin: info.origin.id, targets: [{ actor: info.actor.uuid, token: token.uuid, name: token.name, img: token.texture.src }] },
          flags: { spikependium: { arcanaTick: { ...request, effect: effect.uuid, actor: info.actor.uuid, origin: info.origin.uuid } } }
        }
      });
      message = tickCard(effect, request);
    }
    if (!message || !game.user.isActiveGM || !tickInfo(effect, request)) return;
    const rolls = message.rolls;
    if (rolls.length !== 1 || !(rolls[0] instanceof CONFIG.Dice.DamageRoll) || !rolls[0]._evaluated
      || rolls[0].options.type !== "poison" || !Number.isFinite(rolls[0].total) || rolls[0].total < 0) return;
    await info.actor.applyDamage([{ value: rolls[0].total, type: "poison" }], { originatingMessage: message });
    if (game.user.isActiveGM && resolve(effect.uuid) === effect
      && info.actor.flags.spikependium?.arcanaTicks?.[info.origin.id]?.event === request.event)
      await effect.setFlag("spikependium", "arcanaTickRequest", { ...request, pending: false });
  } finally { working.delete(effect.uuid); }
}

export function recordArcanaTickDamage(actor, amount, updates, options) {
  const message = options.originatingMessage, request = message?.flags.spikependium?.arcanaTick;
  if (!request) return;
  const effect = resolve(request.effect), info = effect && tickInfo(effect, request);
  if (!game.user.isActiveGM || !message.author?.isGM || message.type !== "damage" || !info
    || request.origin !== info.origin.uuid || actor.uuid !== info.actor.uuid || request.actor !== actor.uuid
    || message.getOriginatingMessage()?.uuid !== info.origin.uuid || actor.flags.spikependium?.arcanaTicks?.[info.origin.id]?.event === request.event) return false;
  const roll = message.rolls[0];
  if (message.rolls.length !== 1 || !(roll instanceof CONFIG.Dice.DamageRoll) || !roll._evaluated || roll.options.type !== "poison") return false;
  updates[`flags.spikependium.arcanaTicks.${info.origin.id}`] = { event: request.event, applied: 1 };
}

export async function arcanaStartTurn(wrapped, combatant) {
  const result = await wrapped(combatant);
  if (!game.user.isActiveGM || !combatant?.actor || !Number.isInteger(this.current?.round) || this.current.round < 1) return result;
  for (const effect of [...combatant.actor.effects]) {
    if (effect.flags.spikependium?.arcanaSpell !== "putrid-burst" || !arcanaEffectCast(effect)) continue;
    const event = `${this.id}:${this.current.round}:${this.current.turn}:${combatant.id}:${effect.uuid}`;
    const previous = effect.flags.spikependium?.arcanaTickRequest;
    if (previous?.event === event) continue;
    const request = { event, token: combatant.token?.uuid, pending: true };
    try { await effect.setFlag("spikependium", "arcanaTickRequest", request); await applyTick(effect, request); }
    catch (error) { arcanaSpellError(error); }
  }
  return result;
}

export async function resumeArcanaTicks() {
  if (!game.user.isActiveGM) return;
  const actors = new Map([...game.actors, ...[...game.scenes].flatMap(scene => [...scene.tokens].map(t => t.actor))]
    .filter(Boolean).map(actor => [actor.uuid, actor]));
  for (const actor of actors.values()) for (const effect of [...actor.effects]) {
    const request = effect.flags.spikependium?.arcanaTickRequest;
    if (effect.flags.spikependium?.arcanaSpell === "putrid-burst" && request?.pending) {
      if (actor.flags.spikependium?.arcanaTicks?.[resolve(effect.system.origin?.message)?.id]?.event === request.event)
        await effect.setFlag("spikependium", "arcanaTickRequest", { ...request, pending: false });
      else await applyTick(effect, request);
    }
  }
}
