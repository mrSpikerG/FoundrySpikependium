import { attackHitTargets } from "./companions.mjs";
import { attackSignature } from "./attack-source.mjs";
import { naturalWeaponTwenty, griffonHitFrame, applyGriffonHitProfile, nativeGriffonHitSave, weaponDamageCard } from "./griffon-hit-triggers.mjs";

const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const kind = item => item?.flags?.spikependium?.griffonTwoWeapon;
const requests = message => message.flags?.spikependium?.twoWeaponHits ?? {};
const locks = new Set();
function valid(frame) {
  const message = resolve(frame.attack), a = message?.getAssociatedActivity(), roll = message?.rolls[frame.index];
  return message?.type === "attack" && message.system.targets.length === 1 && attackSignature(message) === frame.signature
    && a?.type === "attack" && a.attack?.type.classification === "weapon" && a.item.uuid === frame.source && kind(a.item) === frame.kind
    && attackHitTargets(message).some(h => h.index === frame.index && h.token.uuid === frame.token && h.token.actor.uuid === frame.actor)
    && (frame.kind === "covolt" ? roll.isCritical : naturalWeaponTwenty(roll))
    && (frame.kind !== "pumpkin" || roll.options?.spikependiumTwoWeapon?.pumpkinNight);
}
function current(roll) {
  const state = roll.options?.spikependiumWeaponContext, c = game.combat;
  return state && (state.combat ? c?.started && c.id === state.combat && c.round === state.round && c.turn === state.turn : state.time === game.time.worldTime);
}
async function finish(message, id) {
  const frame = requests(message)[id];
  if (!game.user.isActiveGM || !frame || frame.done || locks.has(frame.event) || !valid(frame)) return;
  locks.add(frame.event);
  try {
    const actor = resolve(frame.actor), item = message.getAssociatedActivity().item;
    if (frame.kind === "covolt") {
      if (!actor.flags.spikependium?.covoltHits?.[message.id]?.[id]) {
        const card = await weaponDamageCard(frame, "1d8", "lightning", "covoltDamage", { event: frame.event, attack: frame.attack, id });
        if (!card || !valid(frame)) return;
        await actor.applyDamage([{ type: "lightning", value: card.rolls[0].total }], { originatingMessage: card });
        if (!actor.flags.spikependium?.covoltHits?.[message.id]?.[id]) return;
      }
      await applyGriffonHitProfile(frame, item, e => e.flags.spikependium?.noReactions);
    } else if (frame.kind === "pumpkin") {
      const success = await nativeGriffonHitSave(frame, 13, "wis");
      if (success === undefined || !valid(frame)) return;
      if (!success && !actor.system.traits.ci?.value?.has("frightened")) await applyGriffonHitProfile(frame, item, e => e.statuses.has("frightened"));
    } else if (frame.kind === "prying") {
      const language = actor.system.traits.languages, type = actor.system.details.type?.value;
      if (actor.system.abilities.int.value >= 6 && (language?.value?.size || language?.custom?.trim()) && !["undead", "construct"].includes(type))
        ui.notifications.info(`${item.name}: натуральная 20 по ${actor.name}. Мастер, сообщите владельцу последнюю произнесённую целью ложь; подтвердите, что цель живая.`);
    }
    await message.setFlag("spikependium", `twoWeaponHits.${id}.done`, true);
  } finally { locks.delete(frame.event); }
}
export async function processTwoWeaponHits(message) {
  if (!game.user.isActiveGM || message.type !== "attack" || message.system.targets.length !== 1) return;
  const a = message.getAssociatedActivity(), id = kind(a?.item);
  if (a?.type !== "attack" || a.attack?.type.classification !== "weapon" || !["covolt", "pumpkin", "prying"].includes(id)) return;
  const lock = `seed:${message.uuid}`; if (locks.has(lock)) return; locks.add(lock);
  try {
    for (const hit of attackHitTargets(message)) {
      const key = `${id}-${hit.index}-${hit.token.id}`, frame = griffonHitFrame(message, hit, id);
      if (!requests(message)[key] && current(message.rolls[hit.index]) && valid(frame)) await message.setFlag("spikependium", `twoWeaponHits.${key}`, frame);
    }
  } finally { locks.delete(lock); }
  for (const key of Object.keys(requests(message))) await finish(message, key);
}
export function recordCovoltDamage(actor, _amount, updates, options) {
  const card = options.originatingMessage, receipt = card?.flags.spikependium?.covoltDamage;
  if (!receipt) return;
  const origin = resolve(receipt.attack), frame = origin && requests(origin)[receipt.id], roll = card.rolls[0];
  if (!game.user.isActiveGM || !card.author?.isGM || card.type !== "damage" || frame?.kind !== "covolt" || !valid(frame)
    || frame.event !== receipt.event || frame.actor !== actor.uuid || actor.flags.spikependium?.covoltHits?.[origin.id]?.[receipt.id]
    || card.system.origin !== origin.id || card.rolls.length !== 1 || !(roll instanceof CONFIG.Dice.DamageRoll) || !roll._evaluated
    || !Number.isFinite(roll.total) || roll.total < 0 || roll.options.type !== "lightning" || roll.options.isCritical) return false;
  updates[`flags.spikependium.covoltHits.${origin.id}.${receipt.id}`] = true;
}
export async function resumeTwoWeaponHits() {
  if (!game.user.isActiveGM) return;
  for (const message of game.messages) for (const id of Object.keys(requests(message))) await finish(message, id);
}
