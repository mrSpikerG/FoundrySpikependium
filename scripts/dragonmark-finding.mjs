import { tokensDistance } from "./effects.mjs";

const KEY = "feat:greater-finding", MOD = "Zf2JSYXjA94dulKh", MOVE = "NQtVK0T5uwfMPGQL";
const targets = new WeakMap(), prepared = new WeakMap(), pending = new Map();
function huntersMark(activity) {
  return activity?.item?.type === "spell" && activity.item.system.identifier === "hunters-mark"
    && !activity.item.flags.spikependium?.storedSpell && activity.actor?.isOwner;
}
export function findingEnhancement(activity) {
  if (!huntersMark(activity) || !activity.duration?.concentration) return;
  const item = activity.actor.items.find(i => i.flags.spikependium?.key === KEY);
  const resource = item?.system.activities.get(MOD);
  return resource ? { item, resource } : undefined;
}
export function canUseFindingModifier(activity) {
  if (activity?.id !== MOD || activity.item.flags.spikependium?.key !== KEY) return true;
  ui.notifications.warn("Улучшенный поиск выбирается при накладывании Метки охотника.");
  return false;
}
function actors() {
  return new Set([...(game.actors ?? []), ...[...(game.scenes ?? [])].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean));
}
function live(effect) {
  return effect.type === "condition" && effect.system.type === "concentrating" && effect.active && !effect.duration.expired
    && !(Number.isFinite(effect.duration.remaining) && effect.duration.remaining <= 0);
}
function identity(data) { return JSON.stringify([data?.spell, data?.target?.actor, data?.target?.token]); }
function record(effect) {
  const data = effect.flags.spikependium?.improvedFinding, queued = pending.get(effect.uuid);
  return queued && identity(queued.data) === identity(data) ? queued.data : data;
}
function concentration(activity) {
  return huntersMark(activity) && activity.actor.effects.find(e => live(e) && record(e)?.spell === activity.item.uuid);
}
function selectedTarget(activity, descriptor) {
  const token = descriptor ? fromUuidSync(descriptor.token) : [...game.user.targets].map(t => t.document ?? t)[0];
  if (!descriptor && game.user.targets.size !== 1) return;
  const source = activity.getUsageToken(), range = activity.id === MOVE ? activity.item.system.range : activity.range;
  const maximum = dnd5e.utils.convertLength(Number(range?.value), range?.units, "ft");
  if (!token?.actor?.system.isCreature || (descriptor && token.actor.uuid !== descriptor.actor)
    || !source?.parent || source.parent !== token.parent || !Number.isFinite(maximum) || maximum < 0) return;
  const distance = tokensDistance(source, token);
  return distance != null && distance <= maximum ? token : undefined;
}
function targetData(activity, token) {
  return { spell: activity.item.uuid, target: { actor: token.actor.uuid, token: token.uuid },
    lastHp: token.actor.system.attributes.hp.value, hitZero: false };
}

export function captureFindingTarget(activity, config, message) {
  targets.delete(activity);
  const transfer = activity?.id === MOVE && concentration(activity);
  if (!config.spikependium?.improvedFinding && !transfer) return;
  if (config.spikependium?.improvedFinding && !(findingEnhancement(activity)?.resource.uses.value > 0)) {
    ui.notifications.warn("Улучшенный поиск недоступен для этого действия или не осталось применений.");
    return false;
  }
  const target = selectedTarget(activity), descriptors = message?.data?.system?.targets;
  if (!target || !Array.isArray(descriptors) || descriptors.length !== 1
    || descriptors[0].token !== target.uuid || descriptors[0].actor !== target.actor.uuid) {
    ui.notifications.warn("Для улучшенной Метки охотника выберите одну цель в пределах дистанции до открытия окна. При смене цели откройте действие заново; видимость проверяет игрок.");
    return false;
  }
  targets.set(activity, { actor: target.actor.uuid, token: target.uuid });
}

export function prepareFindingUpdates(activity, config, updates) {
  prepared.delete(activity);
  const transfer = activity.id === MOVE && concentration(activity);
  if (!config.spikependium?.improvedFinding && !transfer) return updates;
  const descriptor = targets.get(activity), token = descriptor && selectedTarget(activity, descriptor);
  if (!token) {
    ui.notifications.warn("Цель улучшенной Метки охотника изменилась или вышла из дистанции. Ресурсы не списаны.");
    return false;
  }
  const data = targetData(activity, token);
  if (transfer && !config.spikependium?.improvedFinding) {
    const previous = record(transfer);
    if (!previous.hitZero || previous.target.actor === token.actor.uuid || config.concentration?.begin) {
      ui.notifications.warn("Улучшенную метку можно перенести на новую цель после падения прежней до 0 хитов, сохраняя текущую концентрацию.");
      return false;
    }
    updates.operations ??= [];
    updates.operations.push({ action: "update", documentName: "ActiveEffect", parent: activity.actor,
      updates: [{ _id: transfer.id, "flags.spikependium.improvedFinding": data }], spikependiumFindingSource: identity(previous) });
    return updates;
  }
  const selected = findingEnhancement(activity), duration = activity.duration?.getEffectData();
  if (!(selected?.resource.uses.value > 0) || config.concentration?.begin !== true
    || !Number.isFinite(duration?.value) || duration.value <= 0) {
    ui.notifications.warn("Улучшенный поиск недоступен: проверьте заклинание, применение метки, длительность и начало концентрации.");
    return false;
  }
  const { item, resource } = selected, spent = resource.uses.spent + 1;
  let update = updates.item.find(u => u._id === item.id);
  if (!update) { update = { _id: item.id }; updates.item.push(update); }
  update[`system.activities.${MOD}.uses.spent`] = spent;
  prepared.set(activity, { item: item.uuid, spent, data });
  return updates;
}

export function prepareFindingConcentration(actor, item, data, activity) {
  const selected = prepared.get(activity);
  if (!selected) return;
  prepared.delete(activity);
  const current = findingEnhancement(activity), token = fromUuidSync(selected.data.target.token);
  if (actor !== activity.actor || item !== activity.item || current?.item.uuid !== selected.item
    || current.resource.uses.spent !== selected.spent || token?.actor?.uuid !== selected.data.target.actor) return;
  selected.data.lastHp = token.actor.system.attributes.hp.value;
  data["flags.spikependium.improvedFinding"] = selected.data;
}

export function findingBlocksInvisible(actor) {
  if (actor?.statuses.has("antimagic")) return false;
  for (const source of actors()) if (source.effects.some(e => live(e)
    && e.flags.spikependium?.improvedFinding?.target.actor === actor.uuid)) return true;
  return false;
}
export function prepareFindingActorEffects(wrapped, phase, ...args) {
  const result = wrapped(phase, ...args);
  if (this.statuses.has("invisible") && findingBlocksInvisible(this)) this.statuses.delete("invisible");
  return result;
}
export function refreshFindingTargets() {
  for (const actor of actors()) if ([...actor.allApplicableEffects()].some(e => e.statuses.has("invisible"))) {
    const wasInvisible = actor.statuses.has("invisible");
    actor.reset();
    actor.sheet?.render(false);
    if (wasInvisible !== actor.statuses.has("invisible")) for (const token of actor.getActiveTokens()) {
      token._onApplyStatusEffect("invisible", actor.statuses.has("invisible"));
    }
  }
}

export function guardFindingUpdate(effect, changed, options) {
  if (options.spikependiumFindingSource && (!live(effect)
    || options.spikependiumFindingSource !== identity(effect.flags.spikependium?.improvedFinding))) return false;
}
export async function observeFindingHp(actor) {
  const jobs = [];
  for (const source of actors()) for (const effect of source.effects) {
    const data = record(effect);
    if (!live(effect) || !data || (actor && data.target.actor !== actor.uuid)
      || (game.users?.activeGM ? !game.user.isActiveGM : !source.isOwner)) continue;
    const target = actor ?? fromUuidSync(data.target.actor), hp = target?.system.attributes.hp.value;
    if (!Number.isFinite(hp) || hp === data.lastHp) continue;
    const next = { ...data, lastHp: hp, hitZero: data.hitZero || (data.lastHp > 0 && hp <= 0) };
    const previous = pending.get(effect.uuid), entry = { data: next };
    // Serialize snapshots so a rapid heal cannot erase an observed drop to zero.
    entry.promise = (previous?.promise.catch(() => {}) ?? Promise.resolve()).then(async () => {
      if (!live(effect) || identity(effect.flags.spikependium?.improvedFinding) !== identity(next)) return;
      await effect.update({ "flags.spikependium.improvedFinding.lastHp": next.lastHp,
        "flags.spikependium.improvedFinding.hitZero": next.hitZero }, { spikependiumFindingSource: identity(next) });
    }).finally(() => { if (pending.get(effect.uuid) === entry) pending.delete(effect.uuid); });
    pending.set(effect.uuid, entry);
    jobs.push(entry.promise);
  }
  await Promise.all(jobs);
}
