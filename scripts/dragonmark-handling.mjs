import { attackHitTargets } from "./companions.mjs";
import { tokensDistance, incapacitated } from "./effects.mjs";
import { reactionAvailable } from "./reactions.mjs";
import { occupied } from "./push.mjs";

const KEY = "feat:greater-handling", MOD = "uuGAVVQ3q2BIf7lv", ACTION = "spikependiumHandling";
const running = new Set(), attacking = new Map();
const movementModes = new Map();
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const turn = () => game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : null;
const position = t => Object.fromEntries(["x", "y", "elevation", "level", "width", "height", "depth", "shape"].map(k => [k, t[k]]));
const same = (t, p) => t && p && Object.entries(position(t)).every(([k, v]) => p[k] === v);
const liveMovement = t => ["planned", "pending", "paused"].includes(t.movement?.state);
const feature = actor => actor?.items.find(i => i.flags.spikependium?.key === KEY && i.system.activities.get(MOD));
const living = t => t?.actor?.system.isCreature && t.actor.system.attributes.hp.value > 0 && !incapacitated(t.actor);
function mountFor(rider, victim, mount) {
  const close = (a, b) => { const d = tokensDistance(a, b); return d != null && d <= 5; };
  return mount !== rider && mount.actor?.uuid !== rider.actor?.uuid && living(mount) && !liveMovement(mount)
    && mount.parent === rider.parent && mount.level === rider.level && victim.parent === rider.parent && close(rider, mount) && close(victim, mount);
}
export function handlingHits(message) {
  const activity = message.getAssociatedActivity(), rider = message.getAssociatedToken();
  if (!feature(activity?.actor) || rider?.actor?.uuid !== activity.actor.uuid || !living(rider) || liveMovement(rider)) return [];
  return attackHitTargets(message).flatMap(({ index, token }) => {
    const roll = message.rolls[index], mode = roll.options.attackMode ?? message.system.mode ?? "";
    if (!["mwak", "msak"].includes(activity.getActionType(mode)) || token.parent !== rider.parent) return [];
    const mounts = [...rider.parent.tokens].filter(t => mountFor(rider, token, t));
    return mounts.length ? [{ index, victim: token.uuid, victimActor: token.actor.uuid, rider: rider.uuid, actor: rider.actor.uuid,
      from: position(rider), victimPosition: position(token), mounts: mounts.map(t => ({ token: t.uuid, actor: t.actor.uuid, from: position(t) })),
      time: game.time.worldTime, turn: turn() }] : [];
  });
}
export function recordHandlingHits(message) {
  if (message.type !== "attack") return;
  const hits = handlingHits(message);
  if (hits.length) message.updateSource({ "flags.spikependium.handlingHits": hits });
}
export function canUseHandlingModifier(activity) {
  if (activity?.id !== MOD || activity.item.flags.spikependium?.key !== KEY) return true;
  ui.notifications.warn("Улучшенное укрощение предлагается после рукопашного попадания рядом с вашим верховым животным.");
  return false;
}
export function registerHandlingMovement() {
  CONFIG.Token.movement.actions[ACTION] = { ...CONFIG.Token.movement.actions.walk, label: "Улучшенное укрощение: движение реакцией",
    canSelect: false, teleport: false, measure: false, walls: "move", getCostFunction: () => () => 0 };
  for (const mode of [...Object.keys(CONFIG.DND5E.movementTypes), "crawl"]) {
    if (!CONFIG.Token.movement.actions[mode]) continue;
    const action = `${ACTION}_${mode}`;
    CONFIG.Token.movement.actions[action] = { ...CONFIG.Token.movement.actions[mode],
      canSelect: false, teleport: false, measure: true, getCostFunction: () => () => 0 };
    movementModes.set(action, mode);
  }
}
export function handlingMovementCost(wrapped, ...args) {
  const native = wrapped(...args);
  return (from, to, distance, segment) => {
    const cost = native?.(from, to, distance, segment) ?? distance;
    return movementModes.has(segment.action) && Number.isFinite(cost) ? 0 : cost;
  };
}
export function handlingFalling(wrapped, movement, ...args) {
  const waypoints = movement?.passed?.waypoints;
  if (!waypoints?.some(p => movementModes.has(p.action))) return wrapped(movement, ...args);
  const options = this.movement?.id === movement.id ? this.movement.updateOptions?.spikependium : undefined;
  const mount = options?.passenger && resolve(options.mount);
  const supported = mount?.actor?.system.isCreature && mount.actor.system.attributes.hp.value > 0
    && !mount.actor.statuses.has("dead") && !mount.actor.statuses.has("falling");
  const distance = mount?.parent === this.parent && supported ? tokensDistance(mount, this) : null;
  const carried = options?.handling && distance != null && distance <= 5;
  const copied = waypoints.map((p, i) => ({ ...p, action: carried && i === waypoints.length - 1 ? "climb" : movementModes.get(p.action) ?? p.action }));
  return wrapped({ ...movement, passed: { ...movement.passed, waypoints: copied } }, ...args);
}
function validHit(message, hit, mount) {
  const rider = resolve(hit.rider), victim = resolve(hit.victim);
  return message.author && rider?.actor?.uuid === hit.actor && victim?.actor?.uuid === hit.victimActor
    && rider.actor.testUserPermission(message.author, "OWNER") && feature(rider.actor) && living(rider)
    && same(rider, hit.from) && same(victim, hit.victimPosition) && mountFor(rider, victim, mount)
    && hit.mounts.some(m => m.token === mount.uuid && m.actor === mount.actor.uuid && same(mount, m.from))
    && hit.time === game.time.worldTime && hit.turn === turn() && handlingHits(message).some(h => h.index === hit.index && h.victim === hit.victim);
}
const attacks = actor => [...actor.items].flatMap(i => [...i.system.activities].filter(a => a.type === "attack" && a.activation.type === "action"
  && i.type !== "spell" && !(i.type === "weapon" && i.system.quantity <= 0) && !i.flags.spikependium?.storedSpell));
function speeds(actor, scene) {
  const movement = actor.system.attributes.movement, walk = Number(movement.speeds.walk);
  const available = Object.fromEntries(Object.entries(CONFIG.DND5E.movementTypes).flatMap(([mode, cfg]) => {
    const value = Number(movement.speeds[mode]) || (cfg.walkFallback ? walk : 0);
    return value > 0 && CONFIG.Token.movement.actions[mode] ? [[mode, dnd5e.utils.convertLength(value, movement.units ?? dnd5e.utils.defaultUnits("length"), scene.grid.units)]] : [];
  }));
  if (walk > 0 && CONFIG.Token.movement.actions.crawl)
    available.crawl = dnd5e.utils.convertLength(walk, movement.units ?? dnd5e.utils.defaultUnits("length"), scene.grid.units);
  return available;
}
function restoreControl(selected, scene) {
  if (!canvas.ready || canvas.scene !== scene) return;
  canvas.tokens.releaseAll();
  for (const token of selected) if (token.document.parent === canvas.scene && token.document.canUserModify(game.user, "update")) token.control({ releaseOthers: false });
}
function selectPair(rider, mount) {
  mount.object.control({ releaseOthers: true }); rider.object.control({ releaseOthers: false });
  return [rider, mount].every(t => canvas.tokens.controlled.includes(t.object));
}
export function handlingPaths(rider, mount, plan, mode) {
  const points = plan?.waypoints;
  if (!Array.isArray(points) || !points.length) return;
  const first = position(mount), seat = position(rider);
  if (plan.origin && !same(mount, { ...first, ...plan.origin })) return;
  const available = speeds(mount.actor, mount.parent);
  let previous = { ...first, action: mode };
  const mounted = points.map(p => {
    previous = { ...previous, ...p, action: p.action ?? previous.action };
    return previous;
  });
  if (!same(mount, mounted[0])) mounted.unshift({ ...first, action: mode });
  if (mounted.some(p => ![p.x, p.y, p.elevation].every(Number.isFinite)
    || !mount.parent.levels.get(p.level) || !Number.isFinite(available[p.action])
    || ["width", "height", "depth", "shape"].some(k => p[k] !== first[k]))) return;
  const passenger = mounted.map(p => ({ ...p, ...Object.fromEntries(["width", "height", "depth", "shape"].map(k => [k, seat[k]])),
    x: p.x + seat.x - first.x, y: p.y + seat.y - first.y, elevation: p.elevation + seat.elevation - first.elevation }));
  for (const [token, path] of [[mount, mounted], [rider, passenger]]) {
    const terrain = token.object.createTerrainMovementPath(path, { preview: false });
    const [, constrained] = token.object.constrainMovementPath(terrain, { ignoreWalls: false, ignoreTokens: false, ignoreCost: true, preview: false });
    if (constrained) return;
  }
  if (occupied(mount, mounted.at(-1), [rider, mount]) || occupied(rider, passenger.at(-1), [rider, mount])) return;
  let cost = 0;
  for (let i = 1; i < mounted.length; i++) {
    if (i < mounted.length - 1 && mounted[i].action === mounted[i + 1].action) continue;
    const path = mount.object.createTerrainMovementPath(mounted.slice(0, i + 1), { preview: false });
    const measured = mount.object.measureMovementPath(path, { preview: false }).cost;
    if (!Number.isFinite(measured) || measured < cost || (measured > cost && measured > available[mounted[i].action] + 1e-8)) return;
    cost = measured;
  }
  if (!(cost > 0)) return;
  return { mounted, passenger };
}
function reactionActivity(rider, mount) {
  const feat = feature(rider.actor), data = feat.toObject(), action = feat.system.activities.get(MOD).toObject();
  Object.assign(data, { _id: foundry.utils.randomID(), name: "Улучшенное укрощение: реакция животного", effects: [], flags: {} });
  Object.assign(data.system, { identifier: "spikependium-handling-reaction", advancement: [], activities: { [MOD]: {
    ...action, activation: { type: "reaction", value: 1, condition: "Рукопашное попадание всадника", override: true },
    consumption: { ...action.consumption, targets: [], spellSlot: false }
  } }, requirements: "", prerequisites: { level: 0, repeatable: false, items: [] },
    description: { value: `<p>Верховое животное использует реакцию после рукопашного попадания всадника в пределах 5 футов от него: перемещается до своей скорости либо совершает одну атаку.</p><p>@UUID[${feat.uuid}]</p>`, chat: "" } });
  const item = new CONFIG.Item.documentClass(data, { parent: mount.actor });
  return item.system.activities.get(MOD);
}
async function payReaction(rider, mount, event) {
  const activity = reactionActivity(rider, mount);
  const result = await activity.use({ consume: { action: true, resources: false, spellSlot: false }, scaling: false, subsequentActions: false },
    { configure: false }, { data: { speaker: ChatMessage.implementation.getSpeaker({ actor: mount.actor, token: mount }),
      flags: { dnd5e: { item: { data: activity.item.toObject() } }, spikependium: { handlingReaction: event } } } });
  const id = result?.message?.flags.spikependium?.reaction?.id;
  return id && mount.actor.flags.spikependium?.reactionId === id && mount.actor.flags.spikependium?.reactionCasts?.[id]?.spent === 1
    ? { activity, message: result.message, id } : undefined;
}
async function refundReaction(mount, paid) {
  if (mount.actor.flags.spikependium?.reactionId !== paid.id || mount.actor.flags.spikependium.reactionCasts[paid.id]?.spent !== 1) return;
  await paid.activity.refund(paid.message.system.deltas);
  await paid.message.update({ "system.deltas": null });
}
function grantLive(activity, config) {
  const grant = attacking.get(activity?.actor?.uuid);
  const record = grant?.mount.actor.flags.spikependium?.reactionCasts?.[grant.paid.id];
  const effect = grant?.mount.actor.effects.get(grant.paid.id);
  const valid = grant && config?.spikependium?.handlingAttack === grant.event && grant.activity === activity.uuid
    && living(grant.mount) && validHit(grant.message, grant.hit, grant.mount)
    && grant.mount.actor.flags.spikependium?.reactionId === grant.paid.id && record?.spent === 1 && !record.reset
    && !effect?.disabled && !effect?.duration.expired
    && !grant.mount.actor.effects.some(e => e.flags.spikependium?.noReactions && e.active);
  return valid ? grant : undefined;
}
export function isHandlingAttack(activity, config) { return !!grantLive(activity, config); }
export async function handlingRollAttack(wrapped, config = {}, dialog = {}, message = {}) {
  const origin = message.data?.system?.origin ?? config.event?.target?.closest("[data-message-id]")?.dataset.messageId;
  const previous = origin && game.messages.get(origin);
  const grant = grantLive(this, config);
  if ((config.spikependium?.handlingAttack || previous?.flags.spikependium?.handlingAttack) && (!grant || grant.rolling)) {
    ui.notifications.warn("Улучшенное укрощение разрешает одну атаку. Старой карточкой нельзя начать её повторно.");
    return null;
  }
  if (grant) grant.rolling = true;
  return wrapped(config, dialog, message);
}
export function validateHandlingAttack(config) {
  if (!config.spikependium?.handlingAttack) return;
  if (!grantLive(config.subject, config) || (config.rolls && config.rolls.length !== 1)) {
    ui.notifications.warn("Атака животного отменена: условия или реакция изменились; допускается один бросок атаки.");
    return false;
  }
}
async function attackOnce(message, hit, rider, mount, event, paid) {
  const choices = attacks(mount.actor), targets = [...mount.parent.tokens].filter(t => t.actor && t.object?.isVisible !== false);
  const options = entries => entries.map(([value, label]) => `<option value="${foundry.utils.escapeHTML(value)}">${foundry.utils.escapeHTML(label)}</option>`).join("");
  if (!choices.length) { await refundReaction(mount, paid); return; }
  const selected = await foundry.applications.api.DialogV2.input({ window: { title: "Одна атака верхового животного" }, rejectClose: false,
    content: '<div class="form-group"><label>Атака</label><select name="attack">' + options(choices.map(a => [a.uuid, `${a.item.name}: ${a.name}`])) + '</select></div>'
      + '<div class="form-group"><label>Цель</label><select name="target"><option value="">Без отмеченной цели</option>' + options(targets.map(t => [t.uuid, t.name])) + '</select></div>', ok: { label: "Атаковать" } });
  const activity = choices.find(a => a.uuid === selected?.attack), target = targets.find(t => t.uuid === selected?.target);
  if (!activity || (selected.target !== "" && !target) || !validHit(message, hit, mount)
    || mount.actor.items.get(activity.item.id)?.system.activities.get(activity.id) !== activity
    || (target && resolve(target.uuid) !== target)) { await refundReaction(mount, paid); return; }
  attacking.set(mount.actor.uuid, { event, activity: activity.uuid, mount, message, hit, paid });
  try {
    const config = { subsequentActions: false, spikependium: { handlingAttack: event } };
    const descriptors = dnd5e.dataModels.chatMessage.fields.TargetsField.getDescriptors(target ? [target] : []);
    const used = await activity.use(config, {}, { data: { system: { targets: descriptors }, flags: { spikependium: { handlingAttack: event } },
      speaker: ChatMessage.implementation.getSpeaker({ actor: mount.actor, token: mount }) } });
    if (!used?.message) { await refundReaction(mount, paid); return; }
    if (!grantLive(activity, config)) return;
    await activity.rollAttack({ spikependium: { handlingAttack: event }, target: descriptors[0]?.ac ?? null }, {},
      { data: { system: { origin: used.message.id, targets: descriptors }, flags: { spikependium: { handlingAttack: event } },
        speaker: ChatMessage.implementation.getSpeaker({ actor: mount.actor, token: mount }) } });
  } finally { attacking.delete(mount.actor.uuid); }
}
export async function chooseHandling(message) {
  if (message.type !== "attack" || !message.flags.spikependium?.handlingHits || !message.author
    || (game.users.activeGM ? !game.user.isActiveGM : message.author.id !== game.user.id) || running.has(message.id)) return;
  const activity = message.getAssociatedActivity();
  if (!activity?.actor.testUserPermission(message.author, "OWNER")) return;
  running.add(message.id);
  try {
    for (const hit of message.flags.spikependium.handlingHits) {
      const event = `${message.id}:${hit.index}:${resolve(hit.victim)?.id}`;
      if (message.flags.spikependium?.handlingDecisions?.[event]) continue;
      const rider = resolve(hit.rider), victim = resolve(hit.victim);
      if (!canvas.ready || canvas.scene !== rider?.parent || !rider.object) continue;
      const mounts = hit.mounts.map(m => resolve(m.token)).filter(m => m && validHit(message, hit, m) && reactionAvailable(m.actor)
        && m.actor.isOwner && m.object && [rider, m].every(t => t.canUserModify(game.user, "update")));
      if (!mounts.length) continue;
      await message.setFlag("spikependium", `handlingDecisions.${event}`, "prompted");
      const owner = !rider.hidden && !victim.hidden && !message.blind && !message.whisper?.length && message.author.active
        ? message.author : game.user;
      const visible = mounts.filter(m => owner.isGM || !m.hidden || m.actor.testUserPermission(owner, "OWNER"));
      const options = visible.map(m => `<option value="${foundry.utils.escapeHTML(m.uuid)}">${foundry.utils.escapeHTML(m.name)}</option>`).join("");
      if (!options) continue;
      const choice = await foundry.applications.api.DialogV2.query(owner, "input", { window: { title: "Улучшенное укрощение" }, rejectClose: false,
        content: '<p>Подтверждаю, что еду верхом на выбранном существе и попадание не отменено реакцией. Животное расходует свою реакцию; следующую цель атаки или путь выбирает управляющий им пользователь.</p>'
          + '<div class="form-group"><label>Верховое животное</label><select name="mount">' + options + '</select></div>'
          + '<div class="form-group"><label>Реакция</label><select name="action"><option value="skip">Пропустить</option><option value="move">Переместиться до скорости</option><option value="attack">Совершить одну атаку</option></select></div>',
        ok: { label: "Подтвердить" } });
      const mount = visible.find(m => m.uuid === choice?.mount);
      if (!mount || !["move", "attack"].includes(choice.action) || !validHit(message, hit, mount) || !reactionAvailable(mount.actor)
        || (game.users.activeGM ? !game.user.isActiveGM : message.author.id !== game.user.id)) continue;
      const selected = [...canvas.tokens.controlled]; let plan, paths;
      try {
        if (choice.action === "move") {
          const available = speeds(mount.actor, mount.parent);
          const mode = Number.isFinite(available[mount.movementAction]) ? mount.movementAction : Object.keys(available)[0];
          if (!Number.isFinite(available[mode])) continue;
          if (!canvas.ready || canvas.scene !== rider.parent || !selectPair(rider, mount)) continue;
          plan = await mount.object.planMovement({ allowedActions: Object.keys(available), maxCost: Math.max(...Object.values(available)), preventDrop: true,
            constrainOptions: { ignoreWalls: false, ignoreTokens: false, ignoreCost: true } });
          if (plan) mount.stopMovement();
          if (!validHit(message, hit, mount) || !reactionAvailable(mount.actor)) continue;
          paths = handlingPaths(rider, mount, plan, mode);
          if (!paths) continue;
        }
        if (choice.action === "attack" && !attacks(mount.actor).length) continue;
        await message.setFlag("spikependium", `handlingDecisions.${event}`, "started");
        const paid = await payReaction(rider, mount, event);
        if (!paid) continue;
        if (!validHit(message, hit, mount) || (game.users.activeGM ? !game.user.isActiveGM : message.author.id !== game.user.id)
          || !mount.actor.isOwner || ![rider, mount].every(t => t.canUserModify(game.user, "update"))) {
          await refundReaction(mount, paid); continue;
        }
        if (choice.action === "attack") await attackOnce(message, hit, rider, mount, event, paid);
        else {
          paths = handlingPaths(rider, mount, plan, paths.mounted[0].action);
          if (!paths) { await refundReaction(mount, paid); continue; }
          const instructions = Object.fromEntries([[mount, paths.mounted], [rider, paths.passenger]].map(([token, points]) =>
            [token.id, { waypoints: points.slice(1).map(p => ({ ...p, action: `${ACTION}_${p.action}` })) }]));
          instructions[rider.id].spikependium = { handling: event, forcedMovement: true, passenger: true, mount: mount.uuid };
          const result = await mount.parent.moveTokens(instructions, { autoRotate: false, showRuler: true,
            constrainOptions: { ignoreWalls: false, ignoreCost: true, ignoreTokens: false }, spikependium: { handling: event } });
          if (result[mount.id] !== true || result[rider.id] !== true) ui.notifications.warn("Движение животного или всадника остановлено. Проверьте оба токена и последствия регионов; автоматического повтора нет.");
        }
        await message.setFlag("spikependium", `handlingDecisions.${event}`, "done");
      } finally { if (plan && mount.movement?.state === "planned") mount.stopMovement(); restoreControl(selected, rider.parent); }
    }
  } finally { running.delete(message.id); }
}
export async function resumeHandling() {
  for (const message of game.messages) if (message.flags.spikependium?.handlingHits) await chooseHandling(message);
}
