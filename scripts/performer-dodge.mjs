import { attackSource, attackSignature } from "./attack-source.mjs";
import { attackHitTargets } from "./companions.mjs";
import { reactionAvailable } from "./reactions.mjs";

const applying = new Set();
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const isDodge = activity => activity?.actor?.flags?.spikependium?.key === "actor:mm25:performer"
  && activity.type === "utility" && activity.id === "QuImfAi59iGAiAkW" && activity.activation.type === "reaction";
function hit(actor, attack) {
  if (attack?.type !== "attack" || attack.rolls.length !== 1
    || !attack.getAssociatedActor()?.testUserPermission(attack.author, "OWNER")) return;
  const targets = attackHitTargets(attack).filter(h => h.token.actor.uuid === actor.uuid);
  // shortcut: Actor.applyDamage cannot distinguish two linked tokens of the same actor; resolve such damage manually.
  if (targets.length !== 1 || attack.system.targets.filter(t => resolve(t.token)?.actor?.uuid === actor.uuid).length !== 1) return;
  return { attack: attack.uuid, signature: attackSignature(attack), token: targets[0].token.uuid };
}
function same(a, b) {
  return !!a && !!b && ["attack", "signature", "token"].every(k => a[k] === b[k]);
}
function paid(actor, binding) {
  return Object.values(actor.flags.spikependium?.reactionCasts ?? {}).some(record => record.actor === actor.uuid
    && record.spent === 1 && same(record.uncannyDodge, binding));
}
export function prepareDodgeUpdates(activity, config, updates) {
  const binding = config.spikependium?.uncannyDodge;
  if (!isDodge(activity) || !binding) return updates;
  const valid = hit(activity.actor, resolve(binding.attack));
  const id = updates.actor["flags.spikependium.reactionId"];
  const record = updates.actor[`flags.spikependium.reactionCasts.${id}`];
  if (!same(valid, binding) || !record || record.spent !== 1) return false;
  // The attack binding and native reaction expense are saved in the same actor update.
  record.uncannyDodge = valid;
  return updates;
}
export async function performerDodgeUse(wrapped, config = {}, ...args) {
  if (!isDodge(this) || config.consume === false || config.consume?.action === false) return wrapped(config, ...args);
  if (!this.actor.isOwner || !reactionAvailable(this.actor)) return;
  let binding = config.spikependium?.uncannyDodge;
  if (!binding) {
    const choices = [...game.messages].reverse().filter(m => game.user.isGM || m.isContentVisible)
      .map(message => ({ message, binding: hit(this.actor, message) })).filter(c => c.binding).slice(0, 10);
    if (!choices.length) {
      ui.notifications.warn("Нет однозначного штатного попадания по артисту. Разрешите реакцию и половину урона вручную.");
      return;
    }
    const selected = await foundry.applications.api.DialogV2.wait({ window: { title: "Невероятное уклонение: попадание" },
      content: `<p>Выберите ещё не разрешённое попадание, урон которого нужно уменьшить.</p><select name="attack">${choices.map(c =>
        `<option value="${c.message.id}">${foundry.utils.escapeHTML(c.message.getAssociatedActor().name)} — ${foundry.utils.escapeHTML(c.message.getAssociatedActivity()?.name ?? "Атака")} (${c.message.rolls[0].total})</option>`).join("")}</select>`,
      buttons: [{ action: "dodge", label: "Уклониться", callback: (event, button) => button.form.elements.attack.value },
        { action: "cancel", label: "Отмена", callback: () => null }], close: () => null });
    binding = choices.find(c => c.message.id === selected)?.binding;
    if (!binding) return;
  }
  const attack = resolve(binding.attack), target = resolve(binding.token);
  if (!same(binding, hit(this.actor, attack))) return;
  const [dialog = {}, message = {}, ...rest] = args;
  const privateAttack = attack.blind || attack.whisper?.length || target?.hidden || attack.getAssociatedToken?.()?.hidden;
  const card = privateAttack ? { ...message, rollMode: "gm", data: { ...message.data,
    whisper: attack.whisper?.length ? [...attack.whisper] : game.users.filter(u => u.isGM).map(u => u.id), blind: !!attack.blind } } : message;
  return wrapped({ ...config, spikependium: { ...config.spikependium, uncannyDodge: binding } }, dialog, card, ...rest);
}
export async function performerDodgeDamage(wrapped, damages, options = {}) {
  const actor = this, message = options.originatingMessage, attack = attackSource(message);
  if (!actor.isOwner || actor.flags?.spikependium?.key !== "actor:mm25:performer"
    || message?.type !== "damage" || message.system?.isHealing || !Array.isArray(damages)
    || !(options.multiplier === undefined || (Number.isFinite(options.multiplier) && options.multiplier > 0))
    || !damages.length || !damages.some(d => d.value > 0)
    || !damages.every(d => Number.isFinite(d.value) && d.value >= 0 && d.type in CONFIG.DND5E.damageTypes)) return wrapped(damages, options);
  const binding = hit(actor, attack);
  if (!binding) return wrapped(damages, options);
  if (applying.has(actor.uuid)) {
    ui.notifications.warn("Сначала завершите уже открытое применение урона артисту."); return actor;
  }
  applying.add(actor.uuid);
  try {
    if (!paid(actor, binding)) {
      const dodge = [...actor.items].flatMap(item => [...(item.system.activities ?? [])]).find(isDodge);
      if (dodge && actor.system.attributes.hp.value > 0 && reactionAvailable(actor)
        && await foundry.applications.api.DialogV2.confirm({ window: { title: "Невероятное уклонение" },
          content: "<p>Потратить реакцию и получить половину урона этого попадания? Урон будет рассчитан штатными правилами.</p>" })) {
        await dodge.use({ spikependium: { uncannyDodge: binding }, consume: { action: true, resources: true, spellSlot: false } });
        if (!same(binding, hit(actor, attack)) || !paid(actor, binding)) {
          ui.notifications.warn("Уклонение не завершено либо исходное попадание изменилось. Урон пока не применён."); return actor;
        }
      }
    }
    if (paid(actor, binding)) options = { ...options, multiplier: (options.multiplier ?? 1) * 0.5 };
    return await wrapped(damages, options);
  } finally { applying.delete(actor.uuid); }
}
