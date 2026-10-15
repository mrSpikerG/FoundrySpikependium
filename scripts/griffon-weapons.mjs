import { attackSource, attackSignature } from "./attack-source.mjs";
import { attackHitTargets } from "./companions.mjs";
import { tokenDistance } from "./effects.mjs";
import { griffonHitFrame } from "./griffon-hit-triggers.mjs";

const kind = item => item?.flags?.spikependium?.griffonAmmo;
const weapon = item => item?.flags?.spikependium?.griffonWeapon;
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const live = item => item?.system.equipped && (item.system.attunement !== "required" || item.system.attuned);
const turn = () => game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : null;
const fresh = frame => frame && (frame.turn ? frame.turn === turn() : frame.time === game.time.worldTime);
const locks = new Set(), applying = new Set(), drains = new WeakMap();
let cleaning = false;
const actors = () => new Set([...(game.actors ?? []), ...[...(game.scenes ?? [])].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean));

export function canUseGriffonWeapon(activity) {
  if (weapon(activity.item) === "purging-dagger" && activity.type === "attack" && activity.item.flags.spikependium?.purgingEmbedded) {
    ui.notifications.warn("Кинжал оставлен в цели: сначала извлеките его."); return false;
  }
  if (!activity.flags?.spikependium?.griffonPhoenixIgnite) return;
  if (kind(activity.item) !== "phoenix" || !(activity.item.system.quantity > 0)
    || (game.combat?.started && game.combat.combatant?.actor?.uuid !== activity.actor.uuid)) {
    ui.notifications.warn("Воспламенить можно только доступный боеприпас в свой ход."); return false;
  }
}
export async function finishGriffonWeaponUse(activity, results) {
  if (!results?.message || !activity.actor?.isOwner || !activity.flags?.spikependium?.griffonPhoenixIgnite) return;
  if (kind(activity.item) === "phoenix" && activity.item.system.quantity > 0)
    await activity.item.setFlag("spikependium", "phoenixIgnited", { time: game.time.worldTime, turn: turn() });
}

export function griffonAmmoAttackConfig(wrapped, process, config, formData, ...args) {
  const result = wrapped(process, config, formData, ...args);
  const ammo = this.actor?.items.get(config.options?.ammunition);
  if (weapon(this.item) || kind(ammo)) {
    const c = game.combat;
    config.options.spikependiumWeaponContext = { combat: c?.started ? c.id : null, round: c?.round, turn: c?.turn,
      own: c?.started && c.combatant?.actor?.uuid === this.actor.uuid, time: game.time.worldTime, start: ActiveEffect.implementation.getEffectStart() };
  }
  if (weapon(this.item) === "bloodmage-dagger" && this.flags?.spikependium?.griffonBloodDrain) {
    config.parts = config.parts.filter(p => !["@prof", "@weaponMagic", "@spikependiumBloodProficiency"].includes(p));
    config.parts.push("@spikependiumBloodProficiency");
    (config.data ??= {}).spikependiumBloodProficiency = this.actor.system.attributes.prof;
  }
  if (!kind(ammo)) return result;
  const ignited = kind(ammo) === "phoenix" && fresh(ammo.flags.spikependium.phoenixIgnited);
  const distances = ignited ? [...(game.user.targets ?? [])].map(t => t.actor && tokenDistance(this.actor, t.actor)) : [];
  config.options.spikependiumGriffonAmmo = { kind: kind(ammo), ignited: !!ignited, rangeLost: distances.length > 0 && distances.every(d => Number.isFinite(d) && d > 30) };
  return result;
}
export async function griffonWeaponAttack(wrapped, ...args) {
  if (weapon(this.item) && (!this.actor?.isOwner || !live(this.item))) return null;
  if (weapon(this.item) === "purging-dagger" && this.item.flags.spikependium?.purgingEmbedded) return null;
  const tracked = this.actor?.items?.some(i => kind(i) === "phoenix"), lock = tracked && this.actor.uuid;
  if (lock && locks.has(lock)) return null;
  if (lock) locks.add(lock);
  try {
    const rolls = await wrapped(...args), roll = rolls?.[0];
    const ammo = this.actor?.items.get(roll?.options?.ammunition), frame = roll?.options?.spikependiumGriffonAmmo;
    if (kind(ammo) === "phoenix" && frame?.kind === "phoenix" && this.actor.isOwner) {
      const changes = { "flags.spikependium.-=phoenixIgnited": null };
      if (frame.ignited) changes["system.quantity"] = ammo.system.quantity + 1;
      else changes["flags.spikependium.phoenixReturn"] = { owner: this.actor.uuid, time: game.time.worldTime, turn: turn(), count: (ammo.flags.spikependium.phoenixReturn?.count ?? 0) + 1 };
      await ammo.update(changes);
    }
    return rolls;
  } finally { if (lock) locks.delete(lock); }
}
export async function cleanGriffonWeapons() {
  if (cleaning || (game.users.activeGM && !game.user.isActiveGM)) return;
  cleaning = true;
  try {
    for (const actor of actors()) {
      if (!actor.isOwner || locks.has(actor.uuid)) continue;
      locks.add(actor.uuid);
      try {
        for (const item of actor.items) {
          if (kind(item) !== "phoenix") continue;
          const returning = item.flags.spikependium.phoenixReturn, ignited = item.flags.spikependium.phoenixIgnited;
          const ready = returning?.owner === actor.uuid && (returning.turn && game.combat?.started && game.combat.id === returning.turn.split(":")[0]
            ? turn() !== returning.turn && game.combat.combatant?.actor?.uuid === actor.uuid
            : game.time.worldTime >= returning.time + 6);
          const changes = {};
          if (ready) Object.assign(changes, { "system.quantity": item.system.quantity + (returning.count ?? 1), "flags.spikependium.-=phoenixReturn": null });
          if (ignited && !fresh(ignited)) changes["flags.spikependium.-=phoenixIgnited"] = null;
          if (Object.keys(changes).length) await item.update(changes);
        }
      } finally { locks.delete(actor.uuid); }
    }
  } finally { cleaning = false; }
}
export async function griffonWeaponDamage(wrapped, config = {}, dialog = {}, message = {}) {
  const saved = message.data?.flags?.spikependium?.attackSource, origin = resolve(saved?.message);
  if (origin?.getAssociatedActivity()?.uuid === this.uuid && saved.signature === attackSignature(origin)) {
    config = { ...config, ammunition: origin.system.ammunitionItem ?? config.ammunition,
      spikependiumGriffonAmmo: origin.rolls[0]?.options?.spikependiumGriffonAmmo,
      spikependiumWeaponTargets: message.data?.system?.targets ?? [] };
  }
  if (kind(config.ammunition) === "healing-ammo") config = { ...config, isCritical: false };
  return wrapped(config, dialog, message);
}
export function griffonWeaponDamageParts(wrapped, config = {}, ...args) {
  const parts = wrapped(config, ...args), ammo = config.ammunition, id = kind(ammo);
  if (id === "fanfare" || (id === "phoenix" && config.spikependiumGriffonAmmo?.rangeLost)) return [];
  if (id === "healing-ammo") {
    if (!parts.length) return [];
    const part = parts[0].clone({ number: null, denomination: null, bonus: "", types: ["healing"],
      custom: { enabled: true, formula: "2d4 + max(1, @abilities.dex.mod + @abilities.wis.mod)" } });
    part.base = false; part.ammo = true; return [part];
  }
  let result = parts;
  if (["void-ammo", "phoenix"].includes(id)) result = parts.map(part => {
    if (!part.base || !part.types.has("piercing")) return part;
    const copy = part.clone({ types: [...part.types].map(t => t === "piercing" ? id === "phoenix" ? "fire" : "psychic" : t) });
    copy.base = true; return copy;
  });
  if (id === "phoenix" && config.spikependiumGriffonAmmo?.ignited && parts.length) {
    const extra = parts[0].clone({ number: 1, denomination: 6, bonus: "", types: ["fire"], custom: { enabled: false } });
    extra.base = false; extra.ammo = true; result = [...result, extra];
  }
  const targets = config.spikependiumWeaponTargets ?? [];
  if (weapon(this.item) === "purging-dagger" && targets.length && targets.every(t => (resolve(t.token)?.actor ?? resolve(t.actor))?.system.details.type?.value === "undead"))
    result = result.map(p => p.types.has("radiant") && p.number === 1 && p.denomination === 4 ? p.clone({ number: 2 }) : p);
  return result;
}
export function griffonAmmoDamagePart(wrapped, damage, config, ...args) {
  const result = wrapped(damage, config, ...args);
  // Лечебная стрела не наследует общие бонусы урона атаки, добавляемые базовым обработчиком системы.
  if (kind(config.ammunition) === "healing-ammo" && damage.types.has("healing")) result.parts = result.parts.slice(0, 1);
  return result;
}

function sourceAttack(message) {
  const attack = attackSource(message);
  if (attack) return attack;
  return message?.type === "damage" ? attackSource(message.getOriginatingMessage?.()) : undefined;
}
export function prepareRunicConcentration(config, _dialog, message) {
  if (!(config.isConcentration || config.saveType === "concentration" || config.rolls?.some(r => r.options?.isConcentration))) return;
  const origin = game.messages.get(message.data?.system?.origin), attack = sourceAttack(origin);
  if (kind(attack?.system.ammunitionItem) !== "runic-ammo" && attack?.rolls[0]?.options?.spikependiumGriffonAmmo?.kind !== "runic-ammo") return;
  if (!attackHitTargets(attack).some(hit => hit.token.actor.uuid === config.subject?.uuid)) return;
  for (const roll of config.rolls) {
    roll.options ??= {}; roll.options.advantage ||= roll.options.advantageMode === 1; roll.options.disadvantage = true;
    if (roll.options.advantageMode !== undefined) roll.options.advantageMode = roll.options.advantage ? 0 : -1;
  }
}
export function guardHealingAmmunition(target, _amount, _updates, options) {
  const attack = sourceAttack(options.originatingMessage);
  if (target.uuid === attack?.getAssociatedActivity()?.actor?.uuid
    && (kind(attack.system.ammunitionItem) === "healing-ammo" || attack.rolls[0]?.options?.spikependiumGriffonAmmo?.kind === "healing-ammo")) {
    ui.notifications.warn("Исцеляющий боеприпас не может лечить самого стрелка."); return false;
  }
}
export async function applyGriffonAmmoHits(message) {
  if (message.type !== "attack" || (game.users.activeGM ? !game.user.isActiveGM : message.author?.id !== game.user.id)) return;
  const ammo = message.system.ammunitionItem;
  if (kind(ammo) !== "acidlight") return;
  const profile = [...ammo.effects].find(e => e.flags.spikependium?.griffonAcidlight);
  if (!profile) return;
  for (const hit of attackHitTargets(message)) {
    const { token } = hit;
    if (!Number.isFinite(message.rolls[hit.index]?.options?.spikependiumWeaponContext?.time)) continue;
    const frame = griffonHitFrame(message, hit, "acidlight", ammo);
    if (game.time.worldTime >= frame.time + 60) continue;
    const actor = token.actor, receipt = `${message.uuid}:${actor.uuid}`;
    if (!actor.isOwner || applying.has(receipt)) continue;
    const existing = actor.effects.find(e => e.flags.spikependium?.griffonAcidlightHit === receipt);
    if (existing) {
      if (actor.id && existing.uuid && !message.flags.spikependium?.acidlightEffects?.[actor.id])
        await message.setFlag("spikependium", `acidlightEffects.${actor.id}`, existing.uuid);
      continue;
    }
    if (message.flags.spikependium?.acidlightApplied?.includes(actor.uuid)) continue;
    applying.add(receipt);
    try {
      const data = profile.toObject(); delete data._id; delete data._key;
      Object.assign(data, { transfer: false, disabled: false, start: frame.start,
        flags: { spikependium: { griffonAcidlight: true, griffonAcidlightHit: receipt, weaponHit: frame } },
        system: { ...data.system, origin: { activity: message.getAssociatedActivity().uuid, message: message.uuid, effect: profile.uuid } } });
      const created = await actor.createEmbeddedDocuments("ActiveEffect", [data]);
      if (actor.id && created?.[0]?.uuid) await message.setFlag("spikependium", `acidlightEffects.${actor.id}`, created[0].uuid);
      await message.setFlag("spikependium", "acidlightApplied", [...(message.flags.spikependium?.acidlightApplied ?? []), actor.uuid]);
    } finally { applying.delete(receipt); }
  }
}
export function recordBloodDrain(target, amount, _updates, options) {
  const origin = options.originatingMessage?.getOriginatingMessage?.(), activity = origin?.getAssociatedActivity(), caster = activity?.actor;
  if (!(amount > 0) || !Number.isFinite(amount) || !caster?.isOwner || !origin?.id || !activity.flags?.spikependium?.griffonBloodDrain
    || weapon(activity.item) !== "bloodmage-dagger" || ["construct", "plant", "undead"].includes(target.system.details.type?.value)) return;
  let map = drains.get(options); if (!map) drains.set(options, map = new Map());
  map.set(target.uuid, { caster, amount, origin: origin.id });
}
export async function applyBloodDrain(target, amount, options) {
  const frame = drains.get(options)?.get(target.uuid); drains.get(options)?.delete(target.uuid);
  if (!frame || !(amount > 0)) return;
  const receipt = `${frame.origin}:${target.id}`, lock = `${frame.caster.uuid}:${receipt}`;
  if (frame.caster.flags.spikependium?.bloodDrains?.[receipt] || applying.has(lock)) return;
  applying.add(lock);
  try {
    await frame.caster.setFlag("spikependium", `bloodDrains.${receipt}`, true);
    await frame.caster.applyDamage([{ type: "healing", value: frame.amount }]);
  } finally { applying.delete(lock); }
}
