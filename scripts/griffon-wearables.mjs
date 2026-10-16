import { finishShieldMovement } from "./griffon-armor.mjs";
import { finishSkygliderMovement } from "./griffon-two-shields.mjs";
import { scorpioMovement, finishWildskinArmorClass } from "./griffon-conditional-armor.mjs";
import { firstLightMovement } from "./griffon-two-weapons.mjs";
const key = item => item?.flags?.spikependium?.key;
const active = item => item?.system.equipped && (item.system.attunement !== "required" || item.system.attuned);
const origin = (effect, actor) => effect.system.origin?.activity && fromUuidSync(effect.system.origin.activity, { relative: actor, strict: false });
const locks = new Set();

// Apply the armor's speed penalty after native bonuses; its separate burrowing speed stays available.
export function tectonicMovement(wrapped, ...args) {
  const result = firstLightMovement.call(this, (...forward) => scorpioMovement.call(this, wrapped, ...forward), ...args), actor = this.parent;
  finishWildskinArmorClass(this);
  if (!(actor.appliedEffects ?? actor.effects ?? []).some(e => e.active && !e.duration?.expired && e.flags.spikependium?.griffonTectonicArmor)) { finishShieldMovement(this); finishSkygliderMovement(this); return result; }
  const movement = this.attributes.movement, types = Object.keys(CONFIG.DND5E.movementTypes);
  for (const type of types) if (type !== "burrow") movement.speeds[type] *= 0.5;
  movement.speed = movement.speeds.walk;
  movement.max = Math.max(0, ...types.map(type => movement.speeds[type]));
  const base = Number(this._source.attributes.movement.speeds.walk || movement.fromSpecies?.walk);
  if (Number.isFinite(base)) movement.slowed = movement.speeds.walk <= base / 2;
  finishShieldMovement(this);
  finishSkygliderMovement(this);
  return result;
}

export function griffonDervishProtected(attacker, target) {
  return !!attacker && (attacker.appliedEffects ?? attacker.effects ?? []).some(e => {
    if (!e.active || e.duration?.expired || !e.flags.spikependium?.griffonDervishTarget) return false;
    const source = origin(e, attacker) ?? (e.system.origin?.message && fromUuidSync(e.system.origin.message, { strict: false })?.getAssociatedActivity());
    return source?.actor?.uuid === target.uuid && key(source.item) === "item:gs1:fire-dervish";
  });
}

export async function finishGriffonWearableUse(activity, results) {
  const actor = activity.actor, item = activity.item, message = results?.message;
  if (!message || !actor?.isOwner || !/^item:gs1:/.test(key(item) ?? "")) return;
  const id = key(item), requested = activity.flags?.spikependium?.griffonEndProfile;
  const end = (id === "item:gs1:tectonic" && requested === "griffonTectonicArmor") || (id === "item:gs1:otyugh" && requested === "griffonOtyughSight") ? requested : null;
  if (end) {
    const ids = actor.effects.filter(e => e.flags.spikependium?.[end] && origin(e, actor)?.item.uuid === item.uuid).map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids); return;
  }
  const profile = activity.flags?.spikependium?.griffonDervishSpeed;
  if (id !== "item:gs1:fire-dervish" || !profile || locks.has(message.uuid)) return;
  if (message.flags.spikependium?.griffonDervishSpeedApplied || actor.effects.some(e => e.system.origin?.message === message.uuid && e.flags.spikependium?.griffonDervishSpeed)) return;
  const source = item.effects.get(profile); if (!source) return;
  locks.add(message.uuid);
  try {
    const tray = new dnd5e.applications.components.EffectApplicationElement(); tray.chatMessage = message;
    const { action, data } = await tray._prepareEffectData(source, actor);
    data.start = ActiveEffect.implementation.getEffectStart();
    data.flags.spikependium ??= {}; data.flags.spikependium.griffonDervishSpeed = true;
    await foundry.documents.modifyBatch([
      { action, documentName: "ActiveEffect", parent: actor, ...(action === "create" ? { data: [data] } : { updates: [data] }) },
      { action: "update", documentName: "ChatMessage", updates: [{ _id: message.id, "flags.spikependium.griffonDervishSpeedApplied": true }] }
    ]);
  } finally { locks.delete(message.uuid); }
}

export async function cleanGriffonSight() {
  if (game.users.activeGM && !game.user.isActiveGM) return;
  const actors = new Map([...(game.actors ?? []), ...[...(game.scenes ?? [])].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean).map(a => [a.uuid, a]));
  for (const actor of actors.values()) {
    if (!actor.isOwner) continue;
    const ids = actor.effects.filter(e => e.flags.spikependium?.griffonOtyughSight && !active(origin(e, actor)?.item)).map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  }
}
