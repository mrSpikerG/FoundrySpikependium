const casts = new WeakMap(), ending = new Set(), clearing = new Set();
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const actors = () => new Set([...game.actors, ...[...game.scenes].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean));
const marker = (effect, saved) => saved?.rule === "scribing"
  ? (effect?.flags.spikependium?.movementMark?.rule === "scribing" ? effect.flags.spikependium.movementMark : undefined)
  : effect?.flags.spikependium?.improvedShadow;
const receipt = effect => effect.flags.spikependium?.movementMark ? "movementReceipts" : "shadowReceipts";
function snapshot(actor, mode) {
  return actor?.effects.flatMap(e => {
    const shadow = e.flags.spikependium?.improvedShadow, scribing = e.flags.spikependium?.movementMark;
    if (e.duration.expired || (Number.isFinite(e.duration.remaining) && e.duration.remaining <= 0)) return [];
    if (shadow && (mode !== "unarmed" || shadow.additional === true)) return [{ uuid: e.uuid, id: shadow.id }];
    return scribing?.rule === "scribing" && mode !== "unarmed" ? [{ uuid: e.uuid, id: scribing.id, rule: "scribing" }] : [];
  }) ?? [];
}
function record(actor, mode) {
  const effects = snapshot(actor, mode);
  return effects.length ? { actor: actor.uuid, mode, event: foundry.utils.randomID(), effects } : undefined;
}
async function endSnapshot(data) {
  const actor = resolve(data?.actor);
  if (!actor?.isOwner || !Array.isArray(data.effects) || ending.has(data.event)) return;
  const effects = data.effects.flatMap(saved => {
    const effect = resolve(saved.uuid);
    return effect?.parent === actor && marker(effect, saved)?.id === saved.id ? [effect] : [];
  });
  if (!effects.length) return;
  ending.add(data.event);
  try {
    for (const effect of effects) {
      const saved = data.effects.find(s => s.uuid === effect.uuid), key = receipt(effect);
      if (!actor.flags.spikependium?.[key]?.[saved.id]) await actor.setFlag("spikependium", `${key}.${saved.id}`, true);
    }
    const current = effects.filter(e => data.effects.some(saved => saved.uuid === e.uuid && saved.id === marker(e, saved)?.id));
    const casters = new Set(current.flatMap(e => e.flags.spikependium?.improvedShadow ? [e.flags.spikependium.improvedShadow.caster] : []));
    if (current.length) await actor.deleteEmbeddedDocuments("ActiveEffect", current.map(e => e.id));
    for (const uuid of casters) await endShadowConcentration(resolve(uuid));
  } finally { ending.delete(data.event); }
}

export function captureShadowSpell(activity) {
  casts.delete(activity);
  const unarmed = activity.type === "save" && activity.item.system?.identifier === "unarmed-strike";
  if ((!unarmed && activity.item.type !== "spell") || activity.item.flags.spikependium?.storedSpell || !activity.actor?.isOwner) return;
  const data = record(activity.actor, unarmed ? "unarmed" : "spell");
  if (data) casts.set(activity, data);
}
export function recordShadowSpell(activity, message) {
  const data = casts.get(activity);
  casts.delete(activity);
  if (data) foundry.utils.setProperty(message, "data.flags.spikependium.shadowEnding", data);
}
export function prepareShadowAttack(config, dialog, message) {
  const actor = config.subject?.actor;
  if (!actor?.isOwner) return;
  const data = record(actor, "attack");
  if (!data) return;
  config.spikependium = { ...config.spikependium, shadowEnding: data, shadowLocalAttack: message.create === false };
  foundry.utils.setProperty(message, "data.flags.spikependium.shadowEnding", data);
}
export function finalizeShadowAttack(rolls, config) {
  const data = config.spikependium?.shadowEnding;
  if (!data || data.actor !== config.subject?.actor?.uuid) return;
  for (const roll of rolls) roll.options.spikependium = { ...roll.options.spikependium,
    shadowEnding: data, shadowLocalAttack: config.spikependium.shadowLocalAttack };
}
export async function finishShadowAttack(rolls, { subject }) {
  for (const roll of rolls) {
    const data = roll.options.spikependium?.shadowEnding;
    if (!roll._evaluated || data?.actor !== subject?.actor?.uuid
      || (game.users.activeGM && !roll.options.spikependium.shadowLocalAttack)) continue;
    await endSnapshot(data);
  }
}
export async function applyShadowEndingMessage(message) {
  const data = message.flags.spikependium?.shadowEnding, actor = message.getAssociatedActor();
  if (!data || !message.author || actor?.uuid !== data.actor || !actor.testUserPermission(message.author, "OWNER")
    || (game.users.activeGM ? !game.user.isActiveGM : !actor.isOwner)) return;
  if (["spell", "unarmed"].includes(data.mode)) {
    const activity = message.getAssociatedActivity();
    if (message.type !== "usage" || !activity || activity.item.flags.spikependium?.storedSpell
      || (data.mode === "spell" ? activity.item.type !== "spell"
        : activity.type !== "save" || activity.item.system?.identifier !== "unarmed-strike")) return;
  } else if (data.mode !== "attack" || message.type !== "attack" || !message.rolls.some(r => r._evaluated)) return;
  await endSnapshot(data);
}

export function recordShadowDamage(actor, amount, updates, options) {
  const message = typeof options.origin === "string" ? resolve(options.origin) : options.origin;
  if (!(amount > 0) || !Number.isFinite(amount) || options.isDelta === false || message?.type !== "damage") return;
  const source = message.getAssociatedActor(), data = record(source, "damage");
  if (!data || !message.author || !source.testUserPermission(message.author, "OWNER")) return;
  updates[`flags.spikependium.shadowDamage.${data.event}`] = { ...data, origin: message.uuid, applier: game.user.id, state: "pending" };
}
export async function finishShadowDamage(target) {
  for (const actor of target ? [target] : actors()) for (const [id, data] of Object.entries(actor.flags.spikependium?.shadowDamage ?? {})) {
    const message = resolve(data.origin), source = resolve(data.actor), applier = game.users.get(data.applier);
    if (data.state !== "pending" || ending.has(id) || (!actor.isOwner && !source?.isOwner)
      || (game.users.activeGM && !game.user.isActiveGM) || message?.type !== "damage" || message.getAssociatedActor()?.uuid !== data.actor
      || !message.author || !source?.testUserPermission(message.author, "OWNER") || !applier || !actor.testUserPermission(applier, "OWNER")) continue;
    await endSnapshot(data);
    if (actor.isOwner && !data.effects.some(saved => marker(resolve(saved.uuid), saved)?.id === saved.id))
      await actor.setFlag("spikependium", `shadowDamage.${id}.state`, "done");
  }
}

// dnd5e requires a GM to delete concentration with dependents; own marked targets can be cleared first.
export async function prepareShadowConcentrationDelete(wrapped, ...args) {
  const reaction = this.flags.spikependium?.reaction;
  if (reaction?.id === this.id && this.parent?.isOwner && this.parent.flags.spikependium?.reactionId === this.id
    && this.parent.flags.spikependium?.reactionCasts?.[this.id])
    await this.parent.setFlag("spikependium", `reactionCasts.${this.id}.reset`, true);
  for (const [flag, key] of [["improvedShadow", "shadowReceipts"], ["improvedWarding", "wardingReceipts"], ["movementMark", "movementReceipts"]]) {
    const target = this.flags.spikependium?.[flag];
    if (target?.id && this.parent?.isOwner && !this.parent.flags.spikependium?.[key]?.[target.id])
      await this.parent.setFlag("spikependium", `${key}.${target.id}`, true);
  }
  const id = this.flags.spikependium?.improvedShadowCaster?.id;
  if (!game.users.activeGM && id && this.isOwner) {
    const dependents = this.getDependents();
    if (dependents.every(e => e.documentName === "ActiveEffect" && e.parent?.isOwner
      && e.flags.spikependium?.improvedShadow?.id === id && e.flags.spikependium.improvedShadow.caster === this.parent.uuid)) {
      const parents = new Set(dependents.map(e => e.parent));
      for (const actor of parents) await actor.deleteEmbeddedDocuments("ActiveEffect", dependents.filter(e => e.parent === actor).map(e => e.id));
    }
  }
  return wrapped(...args);
}
export async function endShadowConcentration(actor) {
  if (game.users.activeGM && !game.user.isActiveGM) return;
  for (const source of actor ? [actor] : actors()) {
    if (!source.isOwner || clearing.has(source.uuid)) continue;
    clearing.add(source.uuid);
    try {
      for (const effect of source.effects.filter(e => e.flags.spikependium?.improvedShadowCaster)) {
        const id = effect.flags.spikependium.improvedShadowCaster.id, cast = source.flags.spikependium?.shadowCasts?.[id];
        const complete = cast?.completed || resolve(cast?.scene)?.flags.spikependium?.shadow?.[id]?.state === "done";
        if ((effect.duration.expired || (Number.isFinite(effect.duration.remaining) && effect.duration.remaining <= 0)
          || (complete && !effect.getDependents().length)) && source.effects.get(effect.id) === effect) await effect.delete();
      }
    } finally { clearing.delete(source.uuid); }
  }
}
export async function resumeShadowEndings() {
  for (const message of game.messages) if (message.flags.spikependium?.shadowEnding) await applyShadowEndingMessage(message);
  await finishShadowDamage();
  await endShadowConcentration();
}
