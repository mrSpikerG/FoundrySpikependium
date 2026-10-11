import { tokensDistance, incapacitated } from "./effects.mjs";
import { castingToken } from "./conduit.mjs";

const RULES = {
  "comprehend-languages": { id: "scribing", mod: "CjVbzKrU20bUDbHe", label: "Улучшенное письмо" },
  shield: { id: "sentinel", mod: "HgsLprG4WQQojeEg", label: "Улучшенный страж" }
};
const captured = new WeakMap(), prepared = new WeakMap(), running = new Set();
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const turn = () => game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : null;
const protectedScene = scene => !game.users.some(u => !u.isGM && scene.canUserModify(u, "update"));
function enhancement(activity) {
  const rule = RULES[activity?.item?.system.identifier];
  if (!rule || activity.item.type !== "spell" || activity.type !== "utility"
    || activity.item.flags.spikependium?.storedSpell || !activity.actor?.isOwner) return;
  const feat = activity.actor.items.find(i => i.flags.spikependium?.key === `feat:greater-${rule.id}`);
  return feat?.system.activities.get(rule.mod) ? { rule, feat } : undefined;
}
function target(source, uuid) {
  const token = resolve(uuid), distance = source && token && tokensDistance(source, token);
  return token?.actor?.system.isCreature && source.parent === token.parent && distance != null && distance <= 30 ? token : undefined;
}
export function canUseMovementModifier(activity) {
  if (!Object.values(RULES).some(r => activity?.id === r.mod && activity.item.flags.spikependium?.key === `feat:greater-${r.id}`)) return true;
  ui.notifications.warn("Метка движения выбирается в окне накладывания Понимания языков или Щита.");
  return false;
}
export function prepareMovementDialog(activity, config, dialog) {
  const selected = enhancement(activity);
  if (!selected) return;
  const { rule } = selected, targets = [...game.user.targets].map(t => t.document ?? t);
  config.spikependium = { ...config.spikependium, usageChoice: true };
  const Base = dialog.applicationClass;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      context.fields.push({ name: "spikependium.movementMark", value: this.config.spikependium?.movementMark ?? false,
        field: new foundry.data.fields.BooleanField({ label: rule.label,
          hint: "Подтверждаю, что вижу выбранное существо в пределах 30 футов от пространства накладывания. Дополнительное применение метки не расходуется; обычные ресурсы заклинания сохраняются." }),
        input: context.inputs.createCheckboxInput },
      { name: "spikependium.movementTarget", value: this.config.spikependium?.movementTarget ?? targets[0]?.uuid ?? "",
        field: new foundry.data.fields.StringField({ label: "Существо со знаком",
          choices: { "": "Отметьте цель до открытия окна", ...Object.fromEntries(targets.map(t => [t.uuid, t.name])) } }) });
      context.hasConsumption = true;
      return context;
    }
  };
}
export function captureMovementTarget(activity, config, message) {
  captured.delete(activity);
  if (!config.spikependium?.movementMark) return;
  const selected = enhancement(activity), source = castingToken(activity, activity.getUsageToken());
  const token = target(source, config.spikependium.movementTarget);
  const caster = dnd5e.utils.getSceneTargets(activity.actor).find(t => (t.document ?? t).parent === source?.parent);
  if (!selected || !token || !caster || message?.create === false || activity.actor.statuses.has("antimagic") || incapacitated(activity.actor)
    || (!game.user.targets.has(token.object ?? token) && ![...game.user.targets].some(t => (t.document ?? t).uuid === token.uuid))
    || ((!game.users.activeGM || !protectedScene(source.parent)) && !token.actor.isOwner)) {
    ui.notifications.warn("Для знака нужна отмеченная видимая цель в пределах 30 футов, токен заклинателя и Мастер либо права на цель.");
    return false;
  }
  captured.set(activity, { source: source.uuid, casterToken: (caster.document ?? caster).uuid, target: token.uuid, actor: token.actor.uuid });
}
export function prepareMovementUpdates(activity, config, updates) {
  prepared.delete(activity);
  if (!config.spikependium?.movementMark) return updates;
  const selected = enhancement(activity), snapshot = captured.get(activity), source = resolve(snapshot?.source);
  const token = target(source, snapshot?.target), caster = resolve(snapshot?.casterToken);
  const data = activity.duration?.getEffectData(), seconds = data && dnd5e.utils.convertTime(data.value, data.units, { to: "seconds" }).value;
  if (!selected || !token || token.actor.uuid !== snapshot.actor || caster?.actor?.uuid !== activity.actor.uuid || caster.parent !== source.parent
    || snapshot.target !== config.spikependium.movementTarget || !castingToken(activity, source) || !Number.isFinite(seconds) || seconds <= 0
    || activity.actor.statuses.has("antimagic") || incapacitated(activity.actor)
    || ((!game.users.activeGM || !protectedScene(source.parent)) && !token.actor.isOwner)) return false;
  const id = foundry.utils.randomID(), record = { ...snapshot, caster: activity.actor.uuid, spell: activity.item.uuid,
    activity: activity.id, feat: selected.feat.id, rule: selected.rule.id, seconds, scene: source.parent.uuid,
    local: !game.users.activeGM || !protectedScene(source.parent), time: game.time.worldTime, turn: turn(),
    start: ActiveEffect.implementation.getEffectStart() };
  updates.actor[`flags.spikependium.movementCasts.${id}`] = record;
  prepared.set(activity, { id, record });
  return updates;
}
export function recordMovementCast(activity, message) {
  const pending = prepared.get(activity);
  prepared.delete(activity);
  if (!pending || JSON.stringify(activity.actor.flags.spikependium?.movementCasts?.[pending.id]) !== JSON.stringify(pending.record)) return;
  foundry.utils.setProperty(message, "data.flags.spikependium.movementCast", { id: pending.id, caster: activity.actor.uuid });
}
function castRecord(message) {
  const activity = message.getAssociatedActivity({ scaled: true }), request = message.flags.spikependium?.movementCast;
  const record = request && activity?.actor.flags.spikependium?.movementCasts?.[request.id], selected = activity && enhancement(activity);
  return message.type === "usage" && request && /^[A-Za-z0-9]{16}$/.test(request.id) && selected
    && message.author && activity.actor.testUserPermission(message.author, "OWNER") && request.caster === activity.actor.uuid
    && record?.caster === request.caster && record.spell === activity.item.uuid && record.activity === activity.id
    && selected.rule.id === record.rule && selected.feat.id === record.feat ? { id: request.id, record, activity, rule: selected.rule } : undefined;
}
async function applyMark(message, id, record, rule) {
  const token = resolve(record.target), actor = resolve(record.actor);
  if (!actor?.isOwner || token?.actor?.uuid !== actor.uuid || token.parent.uuid !== record.scene) throw Error("Нет права изменять цель знака");
  if (actor.flags.spikependium?.movementReceipts?.[id]) return;
  if (!actor.effects.some(e => e.flags.spikependium?.movementMark?.id === id)) {
    const activity = message.getAssociatedActivity({ scaled: true });
    const data = { _id: id, name: rule.label, img: activity.item.img, type: "base", transfer: false,
      origin: activity.item.uuid, start: record.start, description: `@UUID[${activity.actor.items.get(record.feat).uuid}]`,
      system: { magical: true, changes: [], origin: { activity: activity.uuid, message: message.uuid } },
      duration: { value: rule.id === "sentinel" ? null : record.seconds, units: "seconds", expiry: rule.id === "sentinel" ? "targetEnd" : null },
      flags: { spikependium: { movementMark: { id, rule: rule.id, caster: record.caster, casterToken: record.casterToken, token: record.target } } } };
    await actor.createEmbeddedDocuments("ActiveEffect", [data], { keepId: true });
    if (!actor.effects.some(e => e.flags.spikependium?.movementMark?.id === id)
      && !actor.flags.spikependium?.movementReceipts?.[id]) throw Error("Создание знака отклонено");
  }
  await actor.setFlag("spikependium", `movementReceipts.${id}`, true);
}
async function finishMark(scene, id, job) {
  if (job.state !== "pending" || !game.user.isActiveGM || !protectedScene(scene) || !game.users.get(job.author)?.isGM || running.has(id)) return;
  const message = resolve(job.message), selected = message && castRecord(message);
  if (!selected || selected.id !== id || game.time.worldTime < job.time || game.time.worldTime - job.time >= job.seconds) return;
  running.add(id);
  try {
    await applyMark(message, id, job, selected.rule);
    await scene.setFlag("spikependium", `movementMarks.${id}.state`, "done");
  } finally { running.delete(id); }
}
export async function applyMovementCast(message) {
  if (!message.flags.spikependium?.movementCast) return;
  const selected = castRecord(message);
  if (!selected) return;
  const { id, record, activity, rule } = selected, scene = resolve(record.scene);
  if (!scene || record.completed || (record.local ? message.author.id !== game.user.id : !game.user.isActiveGM)) return;
  const previous = scene.flags.spikependium?.movementMarks?.[id];
  if (previous) return finishMark(scene, id, previous);
  const source = resolve(record.source), token = target(source, record.target), caster = resolve(record.casterToken);
  const duration = activity.duration?.getEffectData();
  if ((!record.local && !protectedScene(scene)) || !castingToken(activity, source) || source.parent !== scene || token?.actor?.uuid !== record.actor
    || caster?.actor?.uuid !== record.caster || caster.parent !== scene || !Number.isFinite(record.seconds) || record.seconds <= 0
    || record.start?.time !== record.time || game.time.worldTime < record.time || game.time.worldTime - record.time >= record.seconds
    || record.seconds !== dnd5e.utils.convertTime(duration?.value, duration?.units, { to: "seconds" }).value
    || (!record.started && (record.time !== game.time.worldTime || record.turn !== turn())) || running.has(id)) return;
  running.add(id);
  try {
    if (record.local) {
      if (!token.actor.isOwner) return;
      await activity.actor.setFlag("spikependium", `movementCasts.${id}.started`, true);
      await applyMark(message, id, record, rule);
      await activity.actor.setFlag("spikependium", `movementCasts.${id}.completed`, true);
    } else await scene.setFlag("spikependium", `movementMarks.${id}`, { ...record, message: message.uuid, author: game.user.id, state: "pending" });
  } finally { running.delete(id); }
  if (!record.local) await finishMark(scene, id, scene.flags.spikependium.movementMarks[id]);
}
export async function resumeMovementCasts() {
  if (game.user.isActiveGM) for (const scene of game.scenes)
    for (const [id, job] of Object.entries(scene.flags.spikependium?.movementMarks ?? {})) await finishMark(scene, id, job);
  for (const message of game.messages) if (message.flags.spikependium?.movementCast) await applyMovementCast(message);
}
export function refreshMovementMarks(force = false) {
  if (!canvas.ready || (!force && !canvas.scene.tokens.some(t => t.actor?.effects.some(e => e.flags.spikependium?.movementMark)))) return;
  for (const token of canvas.scene.tokens) token.object?.recalculatePlannedMovementPath();
}

function live(effect) {
  return effect.active && !effect.duration.expired && !(Number.isFinite(effect.duration.remaining) && effect.duration.remaining <= 0);
}
function points(token) {
  const grid = token.parent.grid, offsets = token.getOccupiedGridSpaceOffsets();
  return offsets.length ? offsets.map(o => ({ ...grid.getCenterPoint(o), elevation: token.elevation })) : [token.getCenterPoint()];
}
// Gridless segments can pass an anchor and cross a radius in a single measured move.
function gridlessInterval(grid, from, to, anchor, approaching, radius) {
  const scale = grid.distance / grid.size;
  const a = [(from.x - anchor.x) * scale, (from.y - anchor.y) * scale, from.elevation - anchor.elevation];
  const v = [(to.x - from.x) * scale, (to.y - from.y) * scale, to.elevation - from.elevation];
  const dot = (x, y) => x.reduce((n, value, i) => n + value * y[i], 0), length = dot(v, v);
  if (!length) return;
  const closest = -dot(a, v) / length;
  let lower = approaching ? 0 : Math.max(0, closest), upper = approaching ? Math.min(1, closest) : 1;
  if (radius != null) {
    const b = dot(a, v), discriminant = b * b - length * (dot(a, a) - radius * radius);
    if (discriminant < 0) return;
    lower = Math.max(lower, (-b - Math.sqrt(discriminant)) / length);
    upper = Math.min(upper, (-b + Math.sqrt(discriminant)) / length);
  }
  return upper > lower ? [lower, upper] : undefined;
}
function covered(intervals) {
  let total = 0, end = 0;
  for (const [a, b] of intervals.sort((x, y) => x[0] - y[0])) {
    total += Math.max(0, b - Math.max(end, a));
    end = Math.max(end, b);
  }
  return total;
}
export function movementMarkCost(wrapped, options) {
  const native = wrapped(options);
  if (game.settings.get("dnd5e", "movementAutomation") === "none" || !this.actor?.system.isCreature) return native;
  const mover = this.document, scene = mover.parent, grid = scene.grid;
  return (from, to, distance, segment) => {
    const cost = native?.(from, to, distance, segment) ?? distance;
    if (!(cost > 0) || !Number.isFinite(cost) || !(distance > 0) || segment.teleport || segment.actionConfig?.measure === false
      || segment.actionConfig?.costMultiplier === 0 || segment.actionConfig?.teleport) return cost;
    const first = grid.getCenterPoint(from), second = grid.getCenterPoint(to);
    if (grid.isGridless) for (const p of [first, second]) { p.x += segment.width * grid.size / 2; p.y += segment.height * grid.size / 2; }
    const scribing = [], sentinel = [];
    for (const token of scene.tokens) for (const effect of token.actor?.effects ?? []) {
      const mark = effect.flags.spikependium?.movementMark;
      if (!mark || mark.token !== token.uuid || !live(effect)) continue;
      const caster = resolve(mark.casterToken);
      if (caster?.parent !== scene || caster.actor?.uuid !== mark.caster) continue;
      const approaching = mark.rule === "scribing";
      if (approaching ? ![1, -1].includes(mover.disposition) || mover.disposition !== -caster.disposition
        : mark.rule !== "sentinel" || mark.token !== mover.uuid) continue;
      const anchor = approaching ? token : caster;
      let interval;
      if (grid.isGridless) interval = gridlessInterval(grid, first, second, anchor.getCenterPoint(), approaching,
        approaching ? dnd5e.utils.convertLength(30, "ft", grid.units) : null);
      else {
        const distanceTo = p => Math.min(...points(anchor).map(a => dnd5e.utils.convertLength(grid.measurePath([p, a]).distance, grid.units, "ft")));
        const before = distanceTo(first), after = distanceTo(second);
        if (approaching ? after < before && before <= 30 : after > before) interval = [0, 1];
      }
      if (interval) (approaching ? scribing : sentinel).push(interval);
    }
    return cost + distance * (covered(scribing) + covered(sentinel));
  };
}
