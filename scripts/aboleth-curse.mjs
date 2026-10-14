const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const working = new Set();
let running = false, pending = false;
const curse = actor => [...actor.effects].filter(effect => effect.flags.spikependium?.monsterEffect === "aboleth-curse"
  && effect.active && !effect.duration.expired && effect.statuses.has("cursed"))
  .sort((a, b) => (a.start?.time ?? 0) - (b.start?.time ?? 0) || a.id.localeCompare(b.id))[0];
const scope = effect => JSON.stringify([effect.uuid, effect.system.origin?.message]);
const authority = actor => game.users.activeGM ? game.user.isActiveGM
  : game.users.filter(user => user.active && actor.testUserPermission(user, "OWNER")).sort((a, b) => a.id.localeCompare(b.id))[0]?.id === game.user.id;
function history(actor, now) {
  const values = [...(actor.flags.spikependium?.abolethWaterHistory ?? [])];
  const current = actor.flags.spikependium?.abolethWater;
  if (current && !values.some(value => value.changed === current.changed && value.underwater === current.underwater)) values.push(current);
  return values.filter(value => typeof value.underwater === "boolean" && Number.isFinite(value.changed) && value.changed <= now)
    .sort((a, b) => a.changed - b.changed);
}
function cardFor(actor, timer) {
  return game.messages.find(message => message.type === "damage" && message.flags.spikependium?.abolethCurseTick?.id === timer.request.id
    && message.flags.spikependium.abolethCurseTick.actor === actor.uuid && message.flags.spikependium.abolethCurseTick.scope === timer.scope);
}
function validCard(actor, timer, message) {
  const data = message?.flags.spikependium?.abolethCurseTick, roll = message?.rolls?.[0];
  return !!data && data.id === timer.request?.id && data.actor === actor.uuid && data.scope === timer.scope && data.due === timer.request.due
    && message.author && (message.author.isGM || actor.testUserPermission(message.author, "OWNER")) && message.type === "damage"
    && message.rolls.length === 1 && roll instanceof CONFIG.Dice.DamageRoll && roll._evaluated && roll.options.type === "acid"
    && Number.isFinite(roll.total) && roll.total >= 0;
}
export function recordAbolethCurseDamage(actor, amount, updates, options = {}) {
  const message = options.originatingMessage;
  if (!message?.flags?.spikependium?.abolethCurseTick) return;
  const timer = actor.flags.spikependium?.abolethCurseTimer, effect = curse(actor);
  if (!actor.isOwner || !authority(actor) || !effect || scope(effect) !== timer?.scope || !validCard(actor, timer, message)
    || timer.applied === timer.request.id) return false;
  updates["flags.spikependium.abolethCurseTimer.applied"] = timer.request.id;
}
async function applyTick(actor, timer, effect) {
  const id = timer.request.id;
  if (working.has(`${actor.uuid}:${id}`) || !authority(actor)) return;
  working.add(`${actor.uuid}:${id}`);
  try {
    let card = cardFor(actor, timer);
    if (!card && timer.request.state === "pending") {
      await actor.update({ "flags.spikependium.abolethCurseTimer.request.state": "awaiting" });
      const template = effect.flags.spikependium.abolethCurseDamage;
      if (!template || template.type !== "damage" || template.damage.parts.length !== 1
        || template.damage.parts[0].number !== 1 || template.damage.parts[0].denomination !== 12
        || template.damage.parts[0].types[0] !== "acid") throw Error("Нет штатного шаблона 1к12 кислотного урона проклятия");
      const item = new CONFIG.Item.documentClass({ _id: foundry.utils.randomID(), type: "feat", name: "Проклятие слизистого облака",
        flags: { spikependium: { abolethCurseTick: true } }, system: { activities: { [template._id]: structuredClone(template) } } }, { parent: actor });
      const activity = item.system.activities.get(template._id), origin = resolve(effect.system.origin?.message);
      const privacy = effect.flags.spikependium.abolethCursePrivacy ?? origin;
      const tokens = actor.getActiveTokens?.(false, true) ?? [], token = actor.token ?? (tokens.length === 1 ? tokens[0] : undefined);
      const hidden = !token || token.hidden || privacy?.hidden || privacy?.blind || privacy?.whisper?.length;
      const message = { create: true, rollMode: privacy?.blind ? "blind" : hidden ? "gm" : "public", data: {
        type: "damage", flavor: "Проклятие аболета — 10 минут вне воды", speaker: ChatMessage.getSpeaker({ actor, token, scene: token?.parent }),
        ...(privacy?.whisper?.length ? { whisper: [...privacy.whisper], blind: !!privacy.blind } : {}),
        system: { ...activity.messageSources, targets: [{ actor: actor.uuid, ...(token ? { token: token.uuid } : {}), name: actor.name, img: actor.img }] },
        flags: { spikependium: { abolethCurseTick: { id, actor: actor.uuid, scope: timer.scope, due: timer.request.due } }, dnd5e: { item: { data: item.toObject() } } }
      } };
      await CONFIG.Dice.DamageRoll.build({ subject: activity, hookNames: ["damage"], critical: { allow: false },
        rolls: [{ parts: ["1d12"], data: {}, options: { type: "acid", types: ["acid"] } }] }, { configure: false }, message);
      card = cardFor(actor, timer);
      if (!card) ui.notifications.warn("Проклятие аболета: карточка урона не создана. Проверьте чат и разрешите этот интервал вручную.");
    }
    const current = actor.flags.spikependium.abolethCurseTimer;
    if (!card || !validCard(actor, current, card) || !curse(actor) || scope(curse(actor)) !== current.scope || !authority(actor)) return;
    if (current.applied !== id) await actor.applyDamage([{ type: "acid", value: card.rolls[0].total }], { originatingMessage: card });
    if (actor.flags.spikependium.abolethCurseTimer.applied === id && authority(actor)) {
      await actor.update({ "flags.spikependium.abolethCurseTimer": { scope: current.scope, cursor: current.request.due, seen: game.time.worldTime } });
      pending = true;
    }
  } finally { working.delete(`${actor.uuid}:${id}`); }
}
async function advance(actor) {
  if (!actor.isOwner || !authority(actor)) return;
  const effect = curse(actor), now = game.time.worldTime;
  if (!effect || !Number.isFinite(now)) return;
  let timer = actor.flags.spikependium?.abolethCurseTimer;
  if (!timer || timer.scope !== scope(effect) || !Number.isFinite(timer.cursor) || now < timer.seen) {
    const first = actor.flags.spikependium?.abolethWater;
    const origin = resolve(effect.system.origin?.message);
    const start = effect.start?.time ?? origin?.flags.spikependium?.monsterCast?.time ?? now;
    const values = history(actor, now), atStart = values.filter(value => value.changed <= start).at(-1);
    const begin = atStart ? start : values.find(value => value.changed > start)?.changed ?? now;
    const cursor = timer ? now : Math.min(now, begin);
    if (timer && now < timer.seen && typeof first?.underwater === "boolean") {
      await actor.update({ "flags.spikependium.abolethWater": { underwater: first.underwater, changed: now },
        "flags.spikependium.abolethWaterHistory": [{ underwater: first.underwater, changed: now }],
        "flags.spikependium.abolethWetHistory": [], "flags.spikependium.abolethWetAt": null });
    }
    timer = { scope: scope(effect), cursor, seen: now };
    await actor.update({ "flags.spikependium.abolethCurseTimer": timer });
  }
  if (timer.request) { await applyTick(actor, timer, effect); return; }
  const values = history(actor, now);
  const state = values.filter(value => value.changed <= timer.cursor).at(-1);
  if (state?.underwater !== false) {
    const next = values.find(value => value.changed > timer.cursor && value.underwater === false);
    if (next) { await actor.update({ "flags.spikependium.abolethCurseTimer": { ...timer, cursor: next.changed, seen: now } }); pending = true; }
    if (!next && timer.seen !== now) await actor.update({ "flags.spikependium.abolethCurseTimer.seen": now });
    return;
  }
  const due = timer.cursor + 600, enters = values.find(value => value.changed > timer.cursor && value.changed <= due && value.underwater);
  if (enters) { await actor.update({ "flags.spikependium.abolethCurseTimer": { ...timer, cursor: enters.changed, seen: now } }); pending = true; return; }
  if (due > now) { if (timer.seen !== now) await actor.update({ "flags.spikependium.abolethCurseTimer.seen": now }); return; }
  const wet = [...(actor.flags.spikependium?.abolethWetHistory ?? []), actor.flags.spikependium?.abolethWetAt]
    .some(time => Number.isFinite(time) && time >= timer.cursor && time < due);
  if (wet) {
    await actor.update({ "flags.spikependium.abolethCurseTimer": { ...timer, cursor: due, seen: now } }); pending = true; return;
  }
  timer = { ...timer, request: { id: foundry.utils.randomID(), due, state: "pending" }, seen: now };
  await actor.update({ "flags.spikependium.abolethCurseTimer": timer });
  await applyTick(actor, timer, effect);
}
export async function resumeAbolethCurse() {
  pending = true;
  if (running) return;
  running = true;
  try {
    do {
      pending = false;
      const actors = new Map([...game.actors, ...[...game.scenes].flatMap(scene => [...scene.tokens].map(token => token.actor))]
        .filter(Boolean).map(actor => [actor.uuid, actor]));
      for (const actor of actors.values()) await advance(actor);
    } while (pending);
  } finally { running = false; }
}
