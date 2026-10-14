import { tokensDistance } from "./effects.mjs";

const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const damaging = new Map(), calculations = new WeakMap(), rolling = new Set(), settling = new Set();
let running = false, pending = false;
const actors = () => new Map([...game.actors, ...[...game.scenes].flatMap(scene => [...scene.tokens].map(token => token.actor))]
  .filter(Boolean).map(actor => [actor.uuid, actor]));
const tagged = effect => effect.flags.spikependium?.monsterEffect === "aboleth-dominate";
const signature = info => JSON.stringify([info.origin.uuid, info.receipt.activity, info.receipt.effect, info.receipt.actor, info.receipt.dc]);
function infoFor(effect) {
  if (!effect || !tagged(effect) || !effect.active || effect.duration.expired || !effect.statuses.has("charmed")) return;
  const actor = effect.actor, origin = resolve(effect.system.origin?.message), receipt = origin?.flags.spikependium?.monsterCast;
  const activity = resolve(effect.system.origin?.activity), caster = activity?.actor;
  const target = receipt?.targets?.find(target => target.actor === actor?.uuid);
  const sourceEffect = activity?.applicableEffects.find(source => source.uuid === receipt?.effect && tagged(source));
  if (!actor?.isOwner || receipt?.kind !== "aboleth-dominate" || !target || !origin.author
    || caster?.flags.spikependium?.key !== "actor:mm25:aboleth" || caster.uuid !== receipt.actor || caster.statuses.has("dead")
    || activity.uuid !== receipt.activity || activity.flags.spikependium?.monsterAction !== receipt.kind
    || !sourceEffect || !caster.testUserPermission(origin.author, "OWNER") || !Number.isFinite(receipt.dc) || receipt.dc <= 0) return;
  const source = resolve(receipt.sourceToken) ?? origin.getAssociatedToken?.();
  const token = resolve(target.token);
  return { actor, effect, origin, receipt, activity, caster,
    source: source?.actor?.uuid === caster.uuid ? source : undefined,
    token: token?.actor?.uuid === actor.uuid ? token : undefined, tokenUUID: target.token };
}
function authority(actor) {
  if (game.users.activeGM) return game.user.isActiveGM;
  const owner = game.users.filter(user => user.active && actor.testUserPermission(user, "OWNER")).sort((a, b) => a.id.localeCompare(b.id))[0];
  return !!actor.isOwner && owner?.id === game.user.id;
}
function request(info, reason, due) {
  return { effect: info.effect.uuid, origin: info.origin.uuid, version: signature(info), actor: info.actor.uuid,
    token: info.tokenUUID, dc: info.receipt.dc, reason, author: game.user.id, state: "pending",
    ...(due != null ? { due } : {}) };
}
function validRequest(info, id, value) {
  const author = game.users.get?.(value?.author) ?? (value?.author === game.user.id ? game.user : undefined);
  return !!info && /^[A-Za-z0-9]{16}$/.test(id) && value?.actor === info.actor.uuid && value.origin === info.origin.uuid
    && value.effect === info.effect.uuid && value.version === signature(info) && value.token === info.tokenUUID
    && value.dc === info.receipt.dc && ["damage", "distance"].includes(value.reason)
    && (value.reason !== "distance" || Number.isFinite(value.due))
    && !!author && (author.isGM || info.actor.testUserPermission(author, "OWNER"));
}
export function recordAbolethCalculation(actor, damages) {
  const context = calculations.get(actor);
  if (context) context.damages = damages;
}
export function recordAbolethDamage(actor, amount, updates, options = {}) {
  const damages = calculations.get(actor)?.damages;
  const healing = damages?.filter(damage => damage.type === "healing" && damage.value < 0).reduce((total, damage) => total - damage.value, 0) ?? 0;
  const actual = amount + healing - Math.max(0, -(damages?.tempMax ?? 0));
  if (!actor.isOwner || !Number.isFinite(actual) || actual <= 0) return;
  for (const effect of actor.effects) {
    const info = infoFor(effect);
    if (!info) continue;
    const id = foundry.utils.randomID(), value = request(info, "damage");
    const message = options.originatingMessage ?? (typeof options.origin === "string" ? resolve(options.origin) : options.origin);
    if (message?.uuid) value.damageMessage = message.uuid;
    updates[`flags.spikependium.abolethRepeats.${id}`] = value;
  }
}
export async function abolethApplyDamage(wrapped, damages, options = {}) {
  if (!this.effects.some(effect => infoFor(effect))) return wrapped(damages, options);
  const previous = damaging.get(this.uuid) ?? Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    calculations.set(this, {});
    try { return await wrapped(damages, options); }
    finally { calculations.delete(this); }
  });
  damaging.set(this.uuid, task);
  try { return await task; }
  finally { if (damaging.get(this.uuid) === task) damaging.delete(this.uuid); }
}
function candidate(message, actor, id, value, info) {
  const data = message?.flags.spikependium?.abolethRepeat, roll = message?.rolls?.[0];
  return message?.type === "save" && data?.id === id && data.actor === actor.uuid && data.effect === value.effect
    && data.version === value.version && message.getOriginatingMessage()?.uuid === info.origin.uuid
    && message.getAssociatedActor()?.uuid === actor.uuid && message.system.ability === "wis"
    && message.author && (message.author.isGM || actor.testUserPermission(message.author, "OWNER"))
    && roll instanceof CONFIG.Dice.D20Roll && roll._evaluated && Number.isFinite(roll.total) && roll.options.target === value.dc;
}
export async function syncAbolethRepeat(message) {
  const data = message?.flags.spikependium?.abolethRepeat, actor = message?.getAssociatedActor?.();
  if (!data || !actor || !authority(actor)) return;
  const value = actor.flags.spikependium?.abolethRepeats?.[data.id], info = infoFor(resolve(value?.effect));
  if (!validRequest(info, data.id, value) || !candidate(message, actor, data.id, value, info)
    || !["pending", "awaiting", "failed"].includes(value.state) || (value.card && value.card !== message.uuid)) return;
  const key = `${actor.uuid}:${data.id}`;
  if (settling.has(key)) return;
  settling.add(key);
  try {
    const success = message.system.forceSuccess || !message.rolls[0].isFailure;
    if (value.state === "failed" && !success) return;
    await actor.performBulkUpdate({ actor: {
      [`flags.spikependium.abolethRepeats.${data.id}`]: { ...value, card: message.uuid, state: success ? "succeeded" : "failed" }
    }, operations: success ? [{ action: "delete", documentName: "ActiveEffect", parent: actor, ids: [info.effect.id] }] : [] });
  } finally { settling.delete(key); }
}
async function rollRequest(actor, id, value) {
  if (!authority(actor) || !["pending", "awaiting"].includes(value.state)) return;
  const info = infoFor(resolve(value.effect));
  const key = `${actor.uuid}:${id}`;
  if (rolling.has(key)) return;
  if (!validRequest(info, id, value) || (value.reason === "distance" && game.time.worldTime < value.due)) {
    await actor.update({ [`flags.spikependium.abolethRepeats.${id}.state`]: "stale" }); return;
  }
  const findCard = () => (value.card ? resolve(value.card) : null) ?? game.messages.find(card => candidate(card, actor, id, value, info));
  rolling.add(key);
  try {
    let card = findCard();
    if (!card && value.state === "pending") {
      // shortcut: после неопределённого сбоя без карточки нужен ручной спасбросок; добавить явную кнопку безопасного повторения.
      await actor.update({ [`flags.spikependium.abolethRepeats.${id}.state`]: "awaiting" });
      const damage = resolve(value.damageMessage), origin = info.origin;
      const privateMessage = origin.blind || origin.whisper?.length ? origin : damage;
      const hidden = !info.token || !info.source || info.token.hidden || info.source.hidden || privateMessage?.blind || privateMessage?.whisper?.length;
      await actor.rollSavingThrow({ ability: "wis", target: value.dc }, { configure: false }, {
        rollMode: privateMessage?.blind ? "blind" : hidden ? "gm" : "public", data: {
          speaker: ChatMessage.getSpeaker({ actor, token: info.token, scene: info.token?.parent }),
          flavor: value.reason === "damage" ? "Порабощение разума — спасбросок после урона" : "Порабощение разума — сутки не ближе мили",
          ...(privateMessage?.whisper?.length ? { whisper: [...privateMessage.whisper], blind: !!privateMessage.blind } : {}),
          system: { origin: origin.id }, flags: { spikependium: { abolethRepeat: { id, actor: actor.uuid, effect: value.effect, version: value.version } } }
        }
      });
      card = findCard();
      if (!card) ui.notifications.warn("Порабощение разума: спасбросок не создал карточку. Бросьте Мудрость против Сл, указанной в эффекте; при успехе снимите эффект.");
    }
    if (card) await syncAbolethRepeat(card);
  } finally { rolling.delete(key); }
}
async function distanceRequest(info) {
  const now = game.time.worldTime;
  if (!Number.isFinite(now) || !authority(info.actor)) return;
  const distance = info.source && info.token ? tokensDistance(info.source, info.token) : null;
  const far = info.effect.flags.spikependium?.abolethFar;
  const version = signature(info);
  if (!Number.isFinite(distance) || distance < 5280) {
    if (far?.since != null) await info.effect.setFlag("spikependium", "abolethFar", { version, since: null, next: null, seen: now });
    return;
  }
  if (far?.version !== version || !Number.isFinite(far.since) || !Number.isFinite(far.next) || !Number.isFinite(far.seen) || now < far.seen) {
    await info.effect.setFlag("spikependium", "abolethFar", { version, since: now, next: now + 86400, seen: now }); return;
  }
  if (now < far.next) {
    if (now !== far.seen) await info.effect.setFlag("spikependium", "abolethFar", { ...far, seen: now });
    return;
  }
  const outstanding = Object.values(info.actor.flags.spikependium?.abolethRepeats ?? {}).some(value => value.effect === info.effect.uuid
    && value.version === version && ["pending", "awaiting"].includes(value.state));
  if (outstanding) return;
  const id = foundry.utils.randomID(), value = request(info, "distance", far.next);
  await info.actor.performBulkUpdate({ actor: { [`flags.spikependium.abolethRepeats.${id}`]: value }, operations: [
    { action: "update", documentName: "ActiveEffect", parent: info.actor, updates: [{ _id: info.effect.id,
      "flags.spikependium.abolethFar": { ...far, next: far.next + 86400, seen: now } }] }
  ] });
  pending = true;
}
export async function resumeAbolethDomination() {
  pending = true;
  if (running) return;
  running = true;
  try {
    do {
      pending = false;
      for (const actor of actors().values()) {
        if (!actor.isOwner || !authority(actor)) continue;
        for (const [id, value] of Object.entries(actor.flags.spikependium?.abolethRepeats ?? {})) await rollRequest(actor, id, value);
        for (const effect of [...actor.effects]) { const info = infoFor(effect); if (info) await distanceRequest(info); }
      }
    } while (pending);
  } finally { running = false; }
}
