const family = item => item?.flags?.spikependium?.griffonArmorFamily;
const active = item => item?.system.equipped && (item.system.attunement !== "required" || item.system.attuned);
const effects = actor => actor?.appliedEffects ?? actor?.effects ?? [];
const source = (e, actor) => e.system.origin?.activity && fromUuidSync(e.system.origin.activity, { relative: actor, strict: false });
const owned = (actor, id) => actor?.items?.some(i => family(i) === id && active(i));
const live = e => e.active && !e.duration?.expired;
const frost = new WeakMap(), granting = new Set(), resting = new WeakMap();
let cleaning = false;

export function canUseGriffonArmor(activity) {
  const root = activity.getLinkedActivity?.() ?? activity, item = root.item, flags = root.flags?.spikependium ?? {};
  if (family(item) === "ink-shield" && flags.griffonInkDC && flags.griffonInkDC !== (item.flags.spikependium.griffonInkDC ?? 10)) {
    ui.notifications.warn("Эта СЛ требует соответствующей заправки щита."); return false;
  }
  if (family(item) === "yggdrasil" && !flags.griffonEndShieldProfile && root.actor.system.abilities.str.value < 17) {
    ui.notifications.warn("Для полноценного владения щитом Иггдрасиля нужна Сила 17."); return false;
  }
  if (family(item) === "yggdrasil" && root.type === "transform" && root.effects.some(e => item.effects.get(e._id)?.flags.spikependium?.griffonYggdrasilRoots)
    && !effects(root.actor).some(e => live(e) && e.flags.spikependium?.griffonYggdrasilBraced && source(e, root.actor)?.item.uuid === item.uuid)) {
    ui.notifications.warn("Сначала установите и удерживайте щит; оставленный на сцене щит контролирует Мастер."); return false;
  }
}
export function guardGriffonShieldEquip(item, changes) {
  if (family(item) === "yggdrasil" && item.actor && (changes["system.equipped"] ?? changes.system?.equipped) === true && item.actor.system.abilities.str.value < 17) {
    ui.notifications.warn("Для полноценного владения щитом Иггдрасиля нужна Сила 17."); return false;
  }
}
export function prepareGriffonArmorUpdates(activity, _config, updates) {
  const dc = activity.flags?.spikependium?.griffonInkRefill, item = activity.item;
  if (family(item) !== "ink-shield" || ![10, 13].includes(dc)) return updates;
  const update = updates.item.find(i => i._id === item.id);
  if (!activity.actor.isOwner || !(update?.["system.uses.spent"] < item.system.uses.spent)) return false;
  if (item.system.uses.spent === 0) {
    if (dc === (item.flags.spikependium.griffonInkDC ?? 10)) return false;
    delete update["system.uses.spent"];
  }
  update["flags.spikependium.griffonInkDC"] = dc;
  return updates;
}
export function prepareBattlechefSave(config, _dialog, message) {
  if (!config.subject?.isOwner || !owned(config.subject, "battlechef")) return;
  const origin = game.messages.get(message.data?.system?.origin)?.getAssociatedActivity();
  const parts = [...(origin?.damage?.parts ?? []), ...(origin?.damage?.includeBase ? [origin.item.system.damage?.base].filter(Boolean) : [])];
  if (!parts.some(p => { const types = [...(p.types ?? [])]; return types.length === 1 && types[0] === "fire"; })) return;
  for (const roll of config.rolls) {
    roll.options ??= {}; roll.options.disadvantage ||= roll.options.advantageMode === -1; roll.options.advantage = true;
    if (roll.options.advantageMode !== undefined) roll.options.advantageMode = roll.options.disadvantage ? 0 : 1;
  }
}
export function prepareStarmetalThrow(config) {
  if (family(config.subject?.item) !== "starmetal-shield" || !config.subject.flags?.spikependium?.griffonStarmetalThrow) return;
  const prof = config.subject.actor?.system.attributes.prof; if (!Number.isFinite(prof)) return;
  for (const r of config.rolls) {
    r.parts = r.parts.filter(p => p !== "@prof" && p !== "@spikependiumStarmetalProficiency");
    (r.data ??= {}).spikependiumStarmetalProficiency = prof; r.parts.push("@spikependiumStarmetalProficiency");
  }
}
export function recordFrostReturn(target, amount, _updates, options) {
  const origin = options.originatingMessage?.getOriginatingMessage?.(), activity = origin?.getAssociatedActivity(), caster = activity?.actor;
  if (!Number.isFinite(amount) || !(amount > 0) || !caster?.isOwner || !origin.id || !activity.flags?.spikependium?.griffonFrostReturn || family(activity.item) !== "frostbitten") return;
  let targets = frost.get(options); if (!targets) frost.set(options, targets = new Map());
  targets.set(target.uuid, { caster, amount, origin: origin.id });
}
export async function applyFrostReturn(target, amount, options) {
  const frame = frost.get(options)?.get(target.uuid); frost.get(options)?.delete(target.uuid); if (!frame || !(amount > 0)) return;
  const { caster, origin } = frame, lock = `${caster.uuid}:${origin}`;
  if (caster.flags.spikependium?.frostReturn?.[origin] || granting.has(lock)) return;
  granting.add(lock);
  try {
    await caster.update({ [`flags.spikependium.frostReturn.${origin}`]: true, "system.attributes.hp.temp": Math.max(caster.system.attributes.hp.temp, frame.amount) });
  } finally { granting.delete(lock); }
}
export async function griffonShortRest(wrapped, config = {}, ...args) {
  if (config.type !== "short") return wrapped(config, ...args);
  resting.set(this, (resting.get(this) ?? 0) + 1);
  try { return await wrapped(config, ...args); }
  finally { const count = resting.get(this) - 1; if (count) resting.set(this, count); else resting.delete(this); }
}
export function prepareMoonHitDie(config) {
  const actor = config.subject;
  if (!actor?.isOwner || !resting.has(actor) || !effects(actor).some(e => live(e) && e.flags.spikependium?.griffonMoonNight && active(source(e, actor)?.item))) return;
  const part = config.rolls?.[0]?.parts;
  if (typeof part?.[0] === "string") part[0] = part[0].replace(/\b1d(\d+)\b/i, "$1");
}
export function finishShieldMovement(model) {
  if (!effects(model.parent).some(e => live(e) && e.flags.spikependium?.griffonYggdrasilBraced && active(source(e, model.parent)?.item))) return;
  const movement = model.attributes.movement, types = Object.keys(CONFIG.DND5E.movementTypes);
  for (const type of types) movement.speeds[type] = Math.min(movement.speeds[type], 5);
  movement.speed = movement.speeds.walk; movement.max = Math.max(0, ...types.map(t => movement.speeds[t])); movement.slowed = true;
}
const profileFlags = ["griffonMoonNight", "griffonYggdrasilBraced", "griffonYggdrasilRoots", "griffonBarricadeHeld", "griffonStarmetalDefense"];
export async function finishGriffonArmorUse(activity, results) {
  const flag = activity.flags?.spikependium?.griffonEndShieldProfile, actor = activity.actor;
  if (!results?.message || !actor?.isOwner || !profileFlags.includes(flag)) return;
  const ids = actor.effects.filter(e => (e.flags.spikependium?.[flag] || (flag === "griffonYggdrasilBraced" && e.flags.spikependium?.griffonYggdrasilRoots)) && source(e, actor)?.item.uuid === activity.item.uuid).map(e => e.id);
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
}
export async function cleanGriffonArmorProfiles() {
  if (cleaning || (game.users.activeGM && !game.user.isActiveGM)) return;
  cleaning = true;
  try {
  const actors = new Map([...(game.actors ?? []), ...[...(game.scenes ?? [])].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean).map(a => [a.uuid, a]));
  for (const actor of actors.values()) {
    if (!actor.isOwner) continue;
    const ids = actor.effects.filter(e => {
      if (!profileFlags.some(f => e.flags.spikependium?.[f])) return false;
      const item = source(e, actor)?.item;
      if (!active(item)) return true;
      if ((e.flags.spikependium.griffonYggdrasilBraced || e.flags.spikependium.griffonYggdrasilRoots) && actor.statuses.has("unconscious")) return true;
      return e.flags.spikependium.griffonYggdrasilRoots && !effects(actor).some(b => live(b) && b.flags.spikependium?.griffonYggdrasilBraced && source(b, actor)?.item.uuid === item.uuid);
    }).map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  }
  } finally { cleaning = false; }
}
export async function endBarricadeOnMove(token, changes, _options, userId) {
  if (userId !== game.user.id || !token.actor?.isOwner || !["x", "y", "elevation", "level"].some(k => k in changes)) return;
  const ids = token.actor.effects.filter(e => e.flags.spikependium?.griffonBarricadeHeld).map(e => e.id);
  if (ids.length) await token.actor.deleteEmbeddedDocuments("ActiveEffect", ids);
}
const darkOrigin = (actor, activity) => actor?.uuid === activity?.actor?.uuid && activity.item?.type === "spell" && activity.item.system.sourceItem === "equipment:griffon-dark-fathom";
export function guardDarkFathomSave(config, _dialog, message) {
  if (darkOrigin(config.subject, game.messages.get(message.data?.system?.origin)?.getAssociatedActivity())) return false;
}
export function guardDarkFathomDamage(actor, _amount, _updates, options) {
  if (darkOrigin(actor, options.originatingMessage?.getOriginatingMessage?.()?.getAssociatedActivity())) return false;
}
export function guardDarkFathomEffect(effect) {
  const actor = effect.parent;
  const activity = source(effect, actor) ?? (effect.system.origin?.message && fromUuidSync(effect.system.origin.message, { strict: false })?.getAssociatedActivity());
  if (darkOrigin(actor, activity)) return false;
}
