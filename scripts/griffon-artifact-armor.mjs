import { incapacitated, tokenDistance } from "./effects.mjs";
const family = item => item?.flags?.spikependium?.griffonTwoArmor;
const worn = item => item?.system.equipped && item.system.attuned;
const owned = (actor, id) => actor?.items?.find(i => family(i) === id && worn(i));
const effects = actor => actor?.appliedEffects ?? actor?.effects ?? [];
const live = e => {
  const end = Number(e?.start?.time) + Number(e?.duration?.value);
  return e?.active && !e.duration?.expired && !(e.duration?.units === "seconds" && Number(e.duration.value) > 0 && Number.isFinite(end) && end <= game.time.worldTime);
};
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const rootOf = activity => activity?.getLinkedActivity?.() ?? activity;
const source = e => e.system?.origin?.activity && fromUuidSync(e.system.origin.activity, { relative: e.parent, strict: false });
const tickets = new Map(), cached = new WeakMap(), busy = new Set(), choices = new Set();
const snapshot = actor => JSON.stringify({ time: game.time.worldTime, turn: game.combat?.started ? [game.combat.id, game.combat.round, game.combat.turn] : null, hp: actor.system.attributes.hp, traits: actor.system.traits, statuses: [...actor.statuses], effects: effects(actor).map(e => [e.uuid, e.active, e._stats?.modifiedTime]) }, (_key, value) => value instanceof Set ? [...value] : value);
const privacy = options => { const m = options?.originatingMessage; return { data: { ...(m?.whisper ? { whisper: [...m.whisper] } : {}), ...(m?.blind ? { blind: true } : {}) } }; };
const ready = (item, activity) => item && activity && (activity.flags.spikependium?.griffonArmorActivityPaid ? activity.uses.value : item.system.uses.value) > 0
  && !Object.values(item.flags.spikependium.griffonCooldowns ?? {}).some(c => c.paid === 1 && !c.activity && c.until > game.time.worldTime);
export function artifactCalculateDamage(wrapped, damages, options = {}) {
  const pending = cached.get(this);
  if (pending?.damages === damages && pending.options === options) { cached.delete(this); return pending.result; }
  return wrapped(damages, options);
}
export async function mourningApplyDamage(wrapped, damages, options = {}, ...args) {
  const item = owned(this, "mourningsteel"), activity = item?.system.activities.find(a => a.flags.spikependium?.mourningTransfer);
  if (!this.isOwner || !Array.isArray(damages) || !damages.some(d => d.type === "necrotic" && d.value > 0) || !ready(item, activity) || busy.has(this.uuid)) return wrapped(damages, options, ...args);
  busy.add(this.uuid);
  try {
    const result = this.calculateDamage(damages, options); if (!result) return this;
    const necrotic = result.filter(d => d.type === "necrotic").reduce((n, d) => n + Math.max(0, d.value), 0);
    const before = snapshot(this);
    if (necrotic > 0 && await foundry.applications.api.DialogV2.confirm({ window: { title: "Перенос смерти" }, content: `<p>Заменить ${necrotic} некротического урона временными хитами (${Math.floor(necrotic / 2)})? Применение восстановится на закате.</p>` })) {
      if (snapshot(this) !== before || !worn(item) || !ready(item, activity)) { ui.notifications.warn("Состояние изменилось во время выбора. Повторите применение урона."); return this; }
      const ticket = { kind: "mourning", nonce: foundry.utils.randomID(), item: item.uuid, before, necrotic };
      tickets.set(this.uuid, ticket);
      try {
        const used = await activity.use({ configure: false, spikependium: { artifactTicket: ticket.nonce } }, {}, privacy(options));
        if (used?.message) return wrapped(damages.filter(d => d.type !== "necrotic"), options, ...args);
      } finally { tickets.delete(this.uuid); }
    }
    if (snapshot(this) !== before) { ui.notifications.warn("Состояние изменилось во время выбора. Повторите применение урона."); return this; }
    cached.set(this, { damages, options, result });
    return await wrapped(damages, options, ...args);
  } finally { cached.delete(this); busy.delete(this.uuid); }
}
function phoenixInstantDeath(actor, amount, updates) {
  const hp = actor.system.attributes.hp, raw = actor.system._source.attributes.hp;
  const maximum = Math.max(0, (hp.effectiveMax ?? hp.max) + (updates["system.attributes.hp.tempmax"] ?? raw.tempmax) - raw.tempmax
    + (updates["system.attributes.hp.max"] ?? hp.max) - hp.max);
  return maximum <= 0 || amount - Math.min(hp.temp, Math.max(0, amount)) >= hp.value + maximum
    || updates["flags.spikependium.soulInstantDeath"] > 0 || updates.statuses?.includes?.("dead") || updates.statuses?.has?.("dead");
}
export function recordPhoenixDrop(actor, amount, updates, options) {
  const item = owned(actor, "phoenix-armor"), activity = item?.system.activities.find(a => a.flags.spikependium?.phoenixBurst);
  const hp = actor.system.attributes?.hp;
  if (!actor.isOwner || !ready(item, activity) || actor.statuses.has("dead") || !(hp?.value > 0) || updates["system.attributes.hp.value"] !== 0
    || !(amount > 0) || phoenixInstantDeath(actor, amount, updates)) return;
  updates["flags.spikependium.phoenixPending"] = { nonce: foundry.utils.randomID(), item: item.uuid, before: snapshot(actor), amount, privacy: privacy(options) };
}
export async function phoenixActorUpdate(wrapped, changes, options = {}, ...args) {
  const frame = changes?.["flags.spikependium.phoenixPending"];
  if (!frame) return wrapped(changes, options, ...args);
  delete changes["flags.spikependium.phoenixPending"];
  const item = resolve(frame.item), activity = item?.system.activities.find(a => a.flags.spikependium?.phoenixBurst);
  if (!this.isOwner || changes["system.attributes.hp.value"] !== 0 || phoenixInstantDeath(this, frame.amount, changes)
    || !ready(item, activity) || !worn(item) || busy.has(`phoenix:${this.uuid}`)) return wrapped(changes, options, ...args);
  busy.add(`phoenix:${this.uuid}`);
  try {
    const accepted = await foundry.applications.api.DialogV2.confirm({ window: { title: "Спасение феникса" }, content: "<p>Остаться с 1 хитом вместо падения до 0 и вызвать взрыв 3к10? Подтвердите, что особого эффекта мгновенной смерти нет. Восстановление: 1к6+1 день.</p>" });
    if (snapshot(this) !== frame.before || !ready(item, activity) || !worn(item)) { ui.notifications.warn("Состояние изменилось во время выбора. Повторите применение урона."); return this; }
    if (!accepted) return wrapped(changes, options, ...args);
    const ticket = { kind: "phoenix", nonce: frame.nonce, before: frame.before, item: item.uuid, incoming: changes };
    tickets.set(this.uuid, ticket);
    try {
      const used = await activity.use({ configure: false, spikependium: { artifactTicket: ticket.nonce } }, {}, frame.privacy);
      if (used?.message) {
        for (const key of ["system.attributes.hp.value", "system.attributes.hp.temp", "system.attributes.hp.tempmax"]) delete changes[key];
        return Object.keys(changes).length ? wrapped(changes, options, ...args) : this;
      }
      if (snapshot(this) !== frame.before) { ui.notifications.warn("Состояние изменилось во время применения. Повторите исходное применение урона."); return this; }
      return wrapped(changes, options, ...args);
    } finally { tickets.delete(this.uuid); }
  } finally { busy.delete(`phoenix:${this.uuid}`); }
}
export function prepareArtifactArmorUpdates(activity, config, updates) {
  const root = activity.getLinkedActivity?.(config.cause?.activity) ?? activity, flags = root.flags?.spikependium ?? {};
  if (!flags.phoenixBurst && !flags.mourningTransfer) return updates;
  if (!root.actor?.isOwner) return false;
  const ticket = tickets.get(root.actor.uuid);
  if (!root.actor.isOwner || !ticket || ticket.nonce !== config.spikependium?.artifactTicket || ticket.item !== root.item.uuid || ticket.before !== snapshot(root.actor)) return false;
  if (flags.phoenixBurst && ticket.kind === "phoenix") {
    updates.actor["system.attributes.hp.value"] = 1;
    for (const key of ["system.attributes.hp.temp", "system.attributes.hp.tempmax"]) if (Number.isFinite(ticket.incoming[key])) updates.actor[key] = ticket.incoming[key];
  } else if (flags.mourningTransfer && ticket.kind === "mourning") updates.actor["system.attributes.hp.temp"] = Math.max(root.actor.system.attributes.hp.temp, Math.floor(ticket.necrotic / 2));
  else return false;
  return updates;
}
const damageSignature = card => JSON.stringify(card?.rolls?.map(r => r.toJSON()));
const originCard = card => game.messages.get(card?.system?.origin) ?? card?.getOriginatingMessage?.();
function phoenixRoll(card) {
  const activity = rootOf(card?.getAssociatedActivity?.()), roll = card?.rolls?.[0];
  return activity?.flags?.spikependium?.phoenixBurst && family(activity.item) === "phoenix-armor" && card.rolls.length === 1
    && roll instanceof CONFIG.Dice.DamageRoll && roll._evaluated && roll.options.type === "fire" && roll.dice?.length === 1
    && roll.dice[0].faces === 10 && roll.dice[0].number === 3 && Number.isInteger(roll.total) && roll.total >= 3 && roll.total <= 30;
}
function phoenixHealingFrame(actor) {
  const frame = actor?.flags?.spikependium?.phoenixBurst, card = resolve(frame?.damage);
  const item = resolve(frame?.item);
  return frame && item?.flags.spikependium?.griffonCooldowns?.[frame.cooldown]?.paid === 1 && phoenixRoll(card)
    && damageSignature(card) === frame.signature && originCard(card)?.uuid === frame.usage ? frame : undefined;
}
export async function recordPhoenixRoll(card) {
  if (!phoenixRoll(card)) return;
  const actor = card.getAssociatedActivity().actor, frame = actor.flags.spikependium?.phoenixBurst;
  if (!actor.isOwner || !frame || frame.damage || originCard(card)?.uuid !== frame.usage) return;
  await actor.setFlag("spikependium", "phoenixBurst", { ...frame, damage: card.uuid, signature: damageSignature(card), amount: card.rolls[0].total });
}
export function canUseArtifactArmor(activity, _config, _dialog, message) {
  const root = rootOf(activity), flags = root?.flags?.spikependium ?? {}, actor = root?.actor;
  if (flags.phoenixBurst || flags.mourningTransfer) {
    if (!actor?.isOwner) return false;
    const ticket = tickets.get(actor.uuid);
    if (!ticket || ticket.nonce !== _config?.spikependium?.artifactTicket || ticket.item !== root.item.uuid) return false;
  }
  if (flags.phoenixHealing) {
    const frame = phoenixHealingFrame(actor); if (!frame || !worn(root.item)) { ui.notifications.warn("Сначала бросьте 3к10 огня оплаченной карточкой Феникса. Изменённый исходный бросок требует ручного пересчёта."); return false; }
    message.data ??= {}; message.data.flags ??= {}; message.data.flags.spikependium ??= {}; message.data.flags.spikependium.phoenixHealing = { ...frame };
    const card = resolve(frame.damage); message.data.whisper = [...(card.whisper ?? [])]; message.data.blind = !!card.blind;
  }
  if (flags.novaniteArrival) {
    const frame = root.item.flags.spikependium.novaniteTrip, combat = game.combat;
    if (!frame || frame.arrived || (combat?.started && (frame.combat !== combat.id || (frame.round === combat.round && frame.turn === combat.turn) || combat.combatant?.actor?.uuid !== actor.uuid))) return false;
  }
  if (flags.novaniteWave && !root.item.flags.spikependium.novaniteTrip) return false;
  if (flags.mourningAuraDamage && !mourningAura(actor)) return false;
  if (family(root?.item) === "mourningsteel" && root.type === "transform" && mourningAura(actor)) return false;
}
export function preparePhoenixHealing(config, _dialog, message) {
  if (!config.subject?.flags?.spikependium?.phoenixHealing) return;
  const usage = game.messages.get(message.data?.system?.origin), frame = usage?.flags.spikependium?.phoenixHealing;
  const current = phoenixHealingFrame(config.subject.actor);
  if (!frame || current?.nonce !== frame.nonce || current?.damage !== frame.damage || current.signature !== frame.signature) return false;
  for (const roll of config.rolls) { roll.parts = [String(frame.amount)]; roll.options ??= {}; roll.options.type = "healing"; roll.options.isCritical = false; }
}
export function guardPhoenixHealing(target, _amount, updates, options) {
  const card = options.originatingMessage, activity = rootOf(card?.getAssociatedActivity?.());
  if (!activity?.flags?.spikependium?.phoenixHealing) return;
  const usage = originCard(card), frame = usage?.flags.spikependium?.phoenixHealing, current = phoenixHealingFrame(activity.actor);
  if (!frame || frame.nonce !== current?.nonce || frame.damage !== current?.damage || frame.signature !== current?.signature
    || target.flags.spikependium?.phoenixHealed?.[frame.nonce] || card.rolls.length !== 1 || card.rolls[0].options.type !== "healing" || card.rolls[0].total !== frame.amount) return false;
  updates[`flags.spikependium.phoenixHealed.${frame.nonce}`] = true;
}
export async function finishArtifactArmorUse(activity, _config, results) {
  if (!results?.message || !activity.actor?.isOwner) return;
  const flags = activity.flags?.spikependium ?? {}, item = activity.item;
  if (flags.phoenixBurst) {
    const ticket = tickets.get(activity.actor.uuid); if (!ticket) return;
    const paid = results.message.system.deltas?.item?.[item.id]?.find(d => d.keyPath.startsWith("flags.spikependium.griffonCooldowns.") && d.keyPath.endsWith(".paid") && d.delta === 1);
    if (!paid) return;
    await activity.actor.setFlag("spikependium", "phoenixBurst", { usage: results.message.uuid, nonce: ticket.nonce, item: item.uuid, cooldown: paid.keyPath.split(".")[3] });
    for (const card of game.messages) await recordPhoenixRoll(card);
  }
  if (flags.novaniteDepart) await item.setFlag("spikependium", "novaniteTrip", { usage: results.message.uuid, combat: game.combat?.id ?? "", round: game.combat?.round ?? 0, turn: game.combat?.turn ?? 0, arrived: false });
  if (flags.novaniteArrival && item.flags.spikependium.novaniteTrip) await item.setFlag("spikependium", "novaniteTrip", { ...item.flags.spikependium.novaniteTrip, arrived: true });
}
function mourningAura(actor) {
  if (!actor || incapacitated(actor)) return;
  return effects(actor).find(e => live(e) && e.flags.spikependium?.mourningAura && worn(source(e)?.item));
}
export async function recoverArtifactPeriods(wrapped, periods, ...args) {
  const result = await wrapped(periods, ...args), item = this.parent;
  if (family(item) !== "mourningsteel" || !(periods instanceof Map) || !(periods.get("dusk") > 0)) return result;
  // A normal rest or several elapsed dusks outlast the one-minute aura.
  if (periods.has("lr") || periods.has("sr") || periods.get("dusk") > 1) return result;
  const aura = mourningAura(item.actor);
  if (!aura || source(aura)?.item.uuid !== item.uuid) return result;
  const activity = source(aura), path = `system.activities.${activity.id}`;
  delete result.updates[`${path}.uses`]; delete result.updates[`${path}.uses.spent`];
  if (result.updates[path]?.uses) delete result.updates[path].uses.spent;
  if (result.updates.system?.activities?.[activity.id]?.uses) delete result.updates.system.activities[activity.id].uses.spent;
  return result;
}
export function prepareMourningAttack(config, _dialog, message) {
  if (config.subject?.actor?.system.details?.type?.value !== "celestial") return;
  const targets = message.data?.system?.targets ?? [];
  if (!targets.length || !targets.every(t => mourningAura(resolve(t.token)?.actor ?? resolve(t.actor)))) return;
  for (const roll of config.rolls) { const o = roll.options ??= {}; o.advantage ||= o.advantageMode === 1; o.disadvantage = true; if (o.advantageMode !== undefined) o.advantageMode = o.advantage ? 0 : -1; }
}
export function mourningAuraDamage(actor, damages, options) {
  const activity = rootOf(options.originatingMessage?.getAssociatedActivity?.());
  if (!activity?.flags?.spikependium?.mourningAuraDamage) return;
  const distance = tokenDistance(activity.actor, actor);
  if (!mourningAura(activity.actor) || actor.system.details?.type?.value !== "celestial" || distance === null || distance > 5 || !damages.every(d => d.type === "necrotic")) return false;
  if (options.ignore !== true) {
    options.ignore = { ...options.ignore };
    for (const key of ["resistance", "immunity"]) if (options.ignore[key] !== true) options.ignore[key] = new Set([...(options.ignore[key] ?? []), "necrotic", "ALL"]);
  }
}
export async function chooseMourningSave(message) {
  if (message.type !== "save" || message.author?.id !== game.user.id || message.system.forceSuccess || !message.rolls.some(r => r.isFailure)) return;
  const actor = message.getAssociatedActor(), aura = mourningAura(actor), sourceActor = game.messages.get(message.system.origin)?.getAssociatedActivity()?.actor;
  const use = aura && (aura.system.origin.message ?? `${aura.id}:${aura.start?.time ?? 0}`);
  if (!actor?.isOwner || !aura || aura.flags.spikependium.mourningSavedFor === use || sourceActor?.system.details?.type?.value !== "celestial" || choices.has(actor.uuid)) return;
  choices.add(actor.uuid);
  try {
    if (!await foundry.applications.api.DialogV2.confirm({ window: { title: "Нечестивая аура" }, content: "<p>Заменить этот провал от эффекта небожителя успехом? Раз за текущую ауру.</p>" }) || mourningAura(actor) !== aura || aura.flags.spikependium.mourningSavedFor === use || message.system.forceSuccess) return;
    await aura.update({ "flags.spikependium.mourningSavedFor": use }); await message.update({ "system.resisted": true });
  } finally { choices.delete(actor.uuid); }
}
let cleaning = false;
export async function cleanArtifactArmor() {
  if (cleaning || (game.users.activeGM && !game.user.isActiveGM)) return;
  cleaning = true;
  try {
  const actors = new Map([...(game.actors ?? []), ...[...(game.scenes ?? [])].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean).map(a => [a.uuid, a]));
  for (const actor of actors.values()) {
    if (!actor.isOwner) continue;
    const ids = actor.effects.filter(e => e.flags.spikependium?.mourningAura && (!live(e) || incapacitated(actor) || !worn(source(e)?.item))).map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  }
  } finally { cleaning = false; }
}
