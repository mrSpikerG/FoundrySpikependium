import { arcanaCast } from "./arcana-spells.mjs";
import { tokensDistance } from "./effects.mjs";

const KEY = "spell:au-waves-of-exhaustion", captured = new WeakMap(), prepared = new WeakMap(), queues = new Map(), syncingBase = new WeakMap(), using = new Set();
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const live = e => e?.active && !e.duration.expired && !(Number.isFinite(e.duration.remaining) && e.duration.remaining <= 0);
const pulse = a => a?.type === "save" && a.item?.flags.spikependium?.key === KEY && a.flags.spikependium?.arcanaStage === "waves-of-exhaustion";
const authority = message => game.users.activeGM ? game.user.isActiveGM : message.author?.id === game.user.id;
const conditionId = () => dnd5e.utils.staticID("dnd5eexhaustion");
export async function waveUse(wrapped, ...args) {
  if (!pulse(this)) return wrapped(...args);
  if (using.has(this.actor.uuid)) { ui.notifications.warn("Сначала завершите уже открытую волну этого заклинателя."); return; }
  using.add(this.actor.uuid);
  try { return await wrapped(...args); } finally { using.delete(this.actor.uuid); }
}
function source(uuid) {
  const origin = resolve(uuid), info = arcanaCast(origin);
  return info?.receipt.kind === "waves-of-exhaustion" && live(info.concentration) && game.time.worldTime < info.receipt.time + 60
    ? { ...info, origin } : null;
}
function current(activity) {
  for (const e of activity.actor.effects) {
    if (e.flags.spikependium?.arcanaOngoing !== "waves-of-exhaustion" || !live(e)) continue;
    const info = source(e.system.origin?.message);
    if (info?.caster.uuid === activity.actor.uuid && info.activity.item.uuid === activity.item.uuid) return info;
  }
}
export function waveLevels(actor) {
  return actor?.effects?.filter(e => e.flags.spikependium?.waveExhaustion && live(e)) ?? [];
}
export function waveSuppression(wrapped, ...args) {
  if (!this.flags.spikependium?.waveExhaustionProfile) return wrapped(...args);
  const marker = this.flags.spikependium.waveExhaustion, ci = this.actor?.system.traits?.ci?.value;
  if (!marker || !source(marker.source) || ci?.has("exhaustion") || ci?.has("ALL")) return true;
  return wrapped(...args);
}
export function prepareWaveExhaustion(wrapped, ...args) {
  // shortcut: native transformations snapshot/filter exhaustion separately; reconcile temporary levels manually until transformation handling is added.
  const result = wrapped(...args), actor = this.parent, waves = waveLevels(actor);
  if (!waves.length) return result;
  const normal = actor.effects.get(conditionId()), base = live(normal) ? normal.system.level : 0;
  const config = CONFIG.DND5E.conditionTypes.exhaustion, total = Math.min(config.levels, base + waves.length);
  this.attributes.exhaustion = this.conditions.exhaustion = total;
  actor.statuses.add("exhaustion");
  for (let n = 1; n <= total; n++) for (const status of config.conditions?.[n] ?? []) actor.statuses.add(status);
  if (actor._lazy) delete actor._lazy.conditionRollReductions;
  return result;
}
async function queue(actor, task) {
  const previous = queues.get(actor.uuid) ?? Promise.resolve(), next = previous.catch(() => {}).then(task);
  queues.set(actor.uuid, next);
  try { return await next; } finally { if (queues.get(actor.uuid) === next) queues.delete(actor.uuid); }
}
export async function changeWaveExhaustion(wrapped, status, actor, options = {}) {
  if (status === "exhaustion" && (options.levels ?? 1) < 0 && syncingBase.get(actor)) return;
  if (status !== "exhaustion" || !(options.levels < 0) || !waveLevels(actor).length) return wrapped(status, actor, options);
  return queue(actor, async () => {
    const normal = actor.effects.get(conditionId()), base = live(normal) ? normal.system.level : 0, amount = -options.levels;
    if (base) await wrapped(status, actor, { ...options, levels: -Math.min(base, amount) });
    const remaining = amount - Math.min(base, amount);
    if (remaining > 0) {
      const latest = waveLevels(actor).sort((a, b) => (b.flags.spikependium.waveExhaustion.appliedAt ?? 0) - (a.flags.spikependium.waveExhaustion.appliedAt ?? 0));
      if (latest.length) await actor.deleteEmbeddedDocuments("ActiveEffect", latest.slice(0, remaining).map(e => e.id));
    }
  });
}
export async function syncWaveBaseCondition(wrapped, parent, collection, documents, ...args) {
  if (collection !== "effects" || !documents.some(d => d.id === conditionId()) || !waveLevels(this).length)
    return wrapped(parent, collection, documents, ...args);
  // Native creation/deletion mirrors the ordinary condition into attributes; it must not erase temporary levels.
  syncingBase.set(this, (syncingBase.get(this) ?? 0) + 1);
  try { return await wrapped(parent, collection, documents, ...args); }
  finally { const n = syncingBase.get(this) - 1; if (n) syncingBase.set(this, n); else syncingBase.delete(this); }
}

export function prepareWaveDialog(activity, config, dialog) {
  if (!pulse(activity)) return;
  const Base = dialog.applicationClass; dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      context.fields.push({ name: "spikependium.waveCone", value: this.config.spikependium?.waveCone ?? false,
        field: new foundry.data.fields.BooleanField({ label: "Выбранные существа в 60-футовом конусе, без полного укрытия" }),
        input: context.inputs.createCheckboxInput });
      context.hasConsumption = true; return context;
    }
  };
}
export function captureWavePulse(activity, config, message) {
  captured.delete(activity);
  if (!pulse(activity)) return;
  const info = current(activity), token = activity.getUsageToken?.(), targets = [...game.user.targets].map(t => t.document ?? t);
  if (!info || !activity.actor.isOwner || token?.actor?.uuid !== activity.actor.uuid || message.create === false
    || config.spikependium?.waveCone !== true || !targets.length || new Set(targets.map(t => t.actor?.uuid)).size !== targets.length
    || targets.some(t => { const distance = tokensDistance(token, t); return !t.actor?.system.isCreature || distance == null || distance > 60; })
    || !game.users.activeGM && targets.some(t => !t.actor.isOwner)) {
    ui.notifications.warn("Для волны нужны активное сияние и концентрация, токен заклинателя, цели в конусе и Мастер либо права на цели."); return false;
  }
  const selected = targets.map(t => ({ token: t.uuid, actor: t.actor.uuid })), expected = message.data?.system?.targets;
  if (expected && (expected.length !== selected.length || expected.some(t => !selected.some(v => v.token === t.token && v.actor === t.actor)))) return false;
  captured.set(activity, { source: info.origin.uuid, caster: activity.actor.uuid, activity: activity.uuid, time: game.time.worldTime,
    token: token.uuid, targets: selected, dc: activity.save.dc.value });
  if (info.origin.blind || info.origin.whisper?.length || token.hidden || targets.some(t => t.hidden)) {
    message.data ??= {}; message.data.whisper = info.origin.whisper?.length ? [...info.origin.whisper] : game.users.filter(u => u.isGM).map(u => u.id);
    message.data.blind = !!info.origin.blind || !!token.hidden || targets.some(t => t.hidden);
  }
}
export function prepareWaveUpdates(activity, _config, updates) {
  prepared.delete(activity);
  if (!pulse(activity)) return updates;
  const r = captured.get(activity), info = r && current(activity);
  if (!info || r.source !== info.origin.uuid || r.time !== game.time.worldTime || !Number.isFinite(r.dc) || r.dc <= 0) return false;
  const targets = [...game.user.targets].map(t => t.document ?? t), token = activity.getUsageToken?.();
  if (token?.uuid !== r.token || targets.length !== r.targets.length || r.targets.some(t => !targets.some(v => {
    const distance = token && tokensDistance(token, v);
    return t.token === v.uuid && t.actor === v.actor?.uuid && distance != null && distance <= 60;
  }))) return false;
  const event = foundry.utils.randomID(), receipt = { ...r, event };
  updates.actor[`flags.spikependium.wavePulses.${event}`] = { ...receipt, active: 1 };
  prepared.set(activity, receipt); return updates;
}
export function recordWaveConsumption(activity, _config, message) {
  const r = prepared.get(activity);
  if (!r || activity.actor.flags.spikependium?.wavePulses?.[r.event]?.active !== 1) return;
  const path = `flags.spikependium.wavePulses.${r.event}.active`, deltas = message.data.system.deltas.actor ??= [];
  if (!deltas.some(d => d.keyPath === path)) deltas.push({ keyPath: path, delta: 1 });
}
export function recordWaveUsage(activity, message) {
  const r = prepared.get(activity); prepared.delete(activity);
  if (!r || activity.actor.flags.spikependium?.wavePulses?.[r.event]?.active !== 1) return;
  foundry.utils.setProperty(message, "data.flags.spikependium.wavePulse", r);
  foundry.utils.setProperty(message, "data.flags.dnd5e.item.data", activity.item.toObject());
}
function receiptFor(origin) {
  const r = origin?.flags.spikependium?.wavePulse, info = r && source(r.source), a = origin?.getAssociatedActivity?.({ scaled: true });
  const record = info?.caster.flags.spikependium?.wavePulses?.[r.event];
  if (origin?.type !== "usage" || !info || !pulse(a) || a.uuid !== r.activity || a.actor.uuid !== r.caster || r.caster !== info.caster.uuid
    || !record || record.active !== 1 || !origin.author || !info.caster.testUserPermission(origin.author, "OWNER")
    || !Array.isArray(r.targets) || !r.targets.length || !Number.isFinite(r.dc)
    || JSON.stringify(r) !== JSON.stringify(Object.fromEntries(Object.entries(record).filter(([k]) => k !== "active")))
    || !origin.system.deltas?.actor?.some(d => d.keyPath === `flags.spikependium.wavePulses.${r.event}.active` && d.delta === 1)) return;
  return { ...info, pulseOrigin: origin, receipt: r, pulseActivity: a };
}
function outcome(origin, target, dc) {
  const card = origin.getAssociatedRolls("save").filter(m => m.system.ability === "con" && m.getAssociatedActor()?.uuid === target.actor
    && m.getAssociatedToken()?.uuid === target.token).at(-1), roll = card?.rolls[0], actor = resolve(target.actor);
  if (!actor || !card?.author || !actor.testUserPermission(card.author, "OWNER") || !(roll instanceof CONFIG.Dice.D20Roll)
    || !roll._evaluated || roll.options.target !== dc) return;
  return card.system.forceSuccess || !roll.isFailure ? "success" : "failure";
}
async function apply(origin, target) {
  const info = receiptFor(origin), actor = resolve(target.actor);
  if (!info || !actor?.isOwner || !authority(origin)) return;
  const result = outcome(origin, target, info.receipt.dc), key = actor.uuid.replaceAll(".", "_");
  if (!result || origin.flags.spikependium?.waveResolved?.[key]?.outcome === result) return;
  const existing = actor.effects.find(e => e.flags.spikependium?.waveExhaustion?.pulse === origin.uuid);
  if (result === "success") { if (existing) await existing.delete(); }
  else if (!existing && actor.system.attributes.exhaustion < 4 && !actor.system.traits.ci.value.has("exhaustion")
    && !actor.system.traits.ci.value.has("ALL") && !actor.effects.some(e => e.flags.spikependium?.arcanaSpell === "iron-body" && live(e))) {
    const profile = info.activity.item.effects.find(e => e.flags.spikependium?.waveExhaustionProfile);
    if (!profile) throw Error("Не найден профиль временного истощения");
    const data = profile.toObject(); delete data._key;
    Object.assign(data, { _id: dnd5e.utils.staticID(`spikependium:wave:${origin.uuid}:${actor.uuid}`), transfer: false, disabled: false,
      start: { ...info.origin.flags.spikependium.arcanaCast.start } });
    data.flags.dnd5e = { ...data.flags.dnd5e, dependentOn: info.concentration.uuid };
    data.flags.spikependium.waveExhaustion = { source: info.origin.uuid, pulse: origin.uuid, appliedAt: origin.timestamp };
    data.system.origin = { activity: info.pulseActivity.uuid, message: info.origin.uuid, effect: info.concentration.uuid, profile: profile.id };
    data._stats = { ...data._stats, compendiumSource: null, duplicateSource: null };
    if (!receiptFor(origin) || !authority(origin) || actor.system.attributes.exhaustion >= 4) return;
    await actor.createEmbeddedDocuments("ActiveEffect", [data], { keepId: true });
  }
  if (receiptFor(origin) && authority(origin)) await origin.setFlag("spikependium", `waveResolved.${key}`, { outcome: result });
}
export async function syncWavePulse(message) {
  const origin = message?.type === "usage" ? message : message?.type === "save" ? message.getOriginatingMessage() : null;
  const info = receiptFor(origin);
  if (!info || !authority(origin)) return;
  for (const target of info.receipt.targets) {
    const actor = resolve(target.actor); if (actor) await queue(actor, () => apply(origin, target));
  }
}
let cleaning = false, pending = false;
export async function cleanWaves() {
  pending = true; if (cleaning) return; cleaning = true;
  try { do {
    pending = false;
    const actors = new Map([...game.actors, ...[...game.scenes].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean).map(a => [a.uuid, a]));
    for (const actor of actors.values()) {
      const markers = actor.effects.filter(e => e.flags.spikependium?.waveExhaustion);
      if (!markers.length) continue;
      actor.reset(); actor.sheet?.render(false);
      const expired = markers.filter(e => !source(e.flags.spikependium.waveExhaustion.source)).map(e => e.id);
      if (expired.length && actor.isOwner && (!game.users.activeGM || game.user.isActiveGM)) await actor.deleteEmbeddedDocuments("ActiveEffect", expired);
    }
  } while (pending); } finally { cleaning = false; }
}
export async function resumeWaves() {
  await cleanWaves();
  for (const message of game.messages) if (message.flags.spikependium?.wavePulse && authority(message)) await syncWavePulse(message);
}
