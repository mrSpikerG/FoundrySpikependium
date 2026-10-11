import { tokensDistance, incapacitated } from "./effects.mjs";
import { castingToken } from "./conduit.mjs";

const RULES = {
  "mage-armor": { id: "warding", mod: "r15h7ywiYnc99k2h", toggle: "improvedWarding", selection: "wardingPrimary", label: "Улучшенное ограждение",
    hint: "Подтверждаю согласие двух отмеченных существ без доспеха и видимость дополнительной цели. Основная цель — касание (5 футов), дополнительная — 30 футов от пространства накладывания. Расходуется применение усиленной метки.",
    selectLabel: "Основная цель касания" },
  invisibility: { id: "shadow", mod: "cF798UTeYY6jOIDZ", toggle: "improvedShadow", selection: "shadowExtra", label: "Улучшенная тень",
    hint: "Подтверждаю согласие дополнительной отмеченной цели в пределах 5 футов от пространства накладывания. Отметьте также обычные цели касания; усиление ячейкой сохраняется. Расходуется применение усиленной метки, необходима концентрация.",
    selectLabel: "Дополнительная согласная цель" }
};
const captured = new WeakMap(), prepared = new WeakMap(), running = new Set();
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const protectedScene = scene => !game.users.some(u => !u.isGM && scene.canUserModify(u, "update"));
const turn = () => game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : null;
function enhancement(activity) {
  const rule = RULES[activity?.item?.system.identifier];
  if (!rule || activity.item.type !== "spell"
    || activity.item.flags.spikependium?.storedSpell || !activity.actor?.isOwner) return;
  const item = activity.actor.items.find(i => i.flags.spikependium?.key === `feat:greater-${rule.id}`), resource = item?.system.activities.get(rule.mod);
  return resource ? { item, resource, rule } : undefined;
}
function profile(activity) {
  return activity?.applicableEffects?.find(e => e.type === "base"
    && (activity.item.system.identifier === "invisibility" ? [...e.statuses].includes("invisible")
      : e.system.changes.some(c => c.key === "system.attributes.ac.calc" && c.value === "mage")));
}
function duration(activity) {
  const data = activity.duration?.getEffectData();
  return data && dnd5e.utils.convertTime(data.value, data.units, { to: "seconds" }).value;
}
function target(source, descriptor, primary, rule) {
  const token = resolve(descriptor.token), distance = source && token && tokensDistance(source, token);
  return token?.actor?.system.isCreature && token.actor.uuid === descriptor.actor && token.parent === source?.parent
    && (rule.id === "shadow" || !token.actor.armor) && !token.actor.statuses.has("antimagic") && !token.actor.statuses.has("dead")
    && distance != null && distance <= (rule.id === "shadow" || primary ? 5 : 30) ? token : undefined;
}
function validTargets(activity, source, targets, selection, rule) {
  const count = rule.id === "shadow" ? Number(activity.target.affects.count) + 1 : 2;
  return Number.isInteger(count) && count >= 2 && Array.isArray(targets) && targets.length >= 2 && targets.length <= count
    && targets.every(d => d?.actor && d.token) && new Set(targets.map(d => d.actor)).size === targets.length
    && targets.some(d => d.token === selection) && targets.every(d => target(source, d, d.token === selection, rule));
}
function concentration(activity, message, id) {
  const effect = activity?.actor.effects.get(message?.system?.concentration ?? message?.data?.system?.concentration);
  return effect?.flags.spikependium?.improvedShadowCaster?.id === id && effect.active && !effect.duration.expired
    && !(Number.isFinite(effect.duration.remaining) && effect.duration.remaining <= 0) ? effect : undefined;
}

export function canUseExtraTargetModifier(activity) {
  const rule = Object.values(RULES).find(r => activity?.id === r.mod && activity.item.flags.spikependium?.key === `feat:greater-${r.id}`);
  if (!rule) return true;
  ui.notifications.warn(`${rule.label} выбирается при накладывании заклинания, а не отдельной кнопкой.`);
  return false;
}
export function prepareExtraTargetDialog(activity, config, dialog) {
  const selected = enhancement(activity);
  if (!(selected?.resource.uses.value > 0)) return;
  const { rule } = selected;
  const targets = [...game.user.targets].map(t => t.document ?? t);
  config.spikependium = { ...config.spikependium, usageChoice: true };
  const Base = dialog.applicationClass;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      context.fields.push({ name: `spikependium.${rule.toggle}`, value: this.config.spikependium?.[rule.toggle] ?? false,
        field: new foundry.data.fields.BooleanField({ label: rule.label, hint: rule.hint }),
        input: context.inputs.createCheckboxInput },
      { name: `spikependium.${rule.selection}`, value: this.config.spikependium?.[rule.selection] ?? targets[0]?.uuid ?? "",
        field: new foundry.data.fields.StringField({ label: rule.selectLabel,
          choices: { "": "Отметьте две цели до открытия окна", ...Object.fromEntries(targets.map(t => [t.uuid, t.name])) } }) });
      context.hasConsumption = true;
      return context;
    }
  };
}
export function captureExtraTargets(activity, config, message) {
  captured.delete(activity);
  const selected = enhancement(activity), rule = RULES[activity.item.system?.identifier];
  const request = Object.values(RULES).filter(r => config.spikependium?.[r.toggle]);
  if (!request.length) return;
  if (request.length !== 1 || request[0] !== rule) return false;
  const source = castingToken(activity, activity.getUsageToken()), targets = message?.data?.system?.targets;
  const primary = config.spikependium[rule.selection];
  if (!(selected?.resource.uses.value > 0) || activity.actor.statuses.has("antimagic") || incapacitated(activity.actor)
    || !source || !validTargets(activity, source, targets, primary, rule)
    || ((!game.users.activeGM || !protectedScene(source.parent)) && !targets.every(d => resolve(d.actor)?.isOwner))) {
    ui.notifications.warn(`${rule.label}: проверьте отмеченные цели, выбор цели в окне и дистанции. Нужен активный Мастер либо права на все цели.`);
    return false;
  }
  captured.set(activity, { source: source.uuid, primary, targets: targets.map(d => ({ actor: d.actor, token: d.token })) });
}
export function prepareExtraTargetUpdates(activity, config, updates) {
  prepared.delete(activity);
  const rule = RULES[activity.item.system?.identifier];
  const request = Object.values(RULES).filter(r => config.spikependium?.[r.toggle]);
  if (!request.length) return updates;
  if (request.length !== 1 || request[0] !== rule) return false;
  const selected = enhancement(activity), snapshot = captured.get(activity), source = resolve(snapshot?.source), seconds = duration(activity);
  const effect = profile(activity);
  if (!(selected?.resource.uses.value > 0) || !snapshot || !castingToken(activity, source) || !effect
    || config.spikependium[rule.selection] !== snapshot.primary || !validTargets(activity, source, snapshot.targets, snapshot.primary, rule)
    || (rule.id === "shadow" && config.concentration?.begin !== true)
    || activity.actor.statuses.has("antimagic") || incapacitated(activity.actor) || !Number.isFinite(seconds) || seconds <= 0) {
    ui.notifications.warn(`${rule.label} недоступна: проверьте цели, дистанции, эффект заклинания, концентрацию и применение метки.`);
    return false;
  }
  const { item, resource } = selected, id = foundry.utils.randomID(), local = !game.users.activeGM || !protectedScene(source.parent);
  if (local && !snapshot.targets.every(d => resolve(d.actor)?.isOwner)) return false;
  const data = { ...snapshot, caster: activity.actor.uuid, spell: activity.item.uuid, feat: item.id, scene: source.parent.uuid,
    profile: effect.id, seconds, local, time: game.time.worldTime, turn: turn(), start: ActiveEffect.implementation.getEffectStart() };
  let update = updates.item.find(u => u._id === item.id);
  if (!update) { update = { _id: item.id }; updates.item.push(update); }
  const spent = resource.uses.spent + 1;
  update[`system.activities.${rule.mod}.uses.spent`] = spent;
  updates.actor[`flags.spikependium.${rule.id}Casts.${id}`] = data;
  prepared.set(activity, { id, data, spent, rule });
  return updates;
}
export function prepareExtraTargetConcentration(actor, item, data, activity) {
  const pending = prepared.get(activity);
  if (pending?.rule.id !== "shadow") return;
  const selected = enhancement(activity);
  if (actor === activity.actor && item === activity.item && selected?.item.id === pending.data.feat
    && selected.resource.uses.spent === pending.spent) data["flags.spikependium.improvedShadowCaster"] = { id: pending.id };
}
export function recordExtraTargetCast(activity, message) {
  const pending = prepared.get(activity);
  if (!pending) return;
  prepared.delete(activity);
  const { rule } = pending, selected = enhancement(activity), record = activity.actor.flags.spikependium?.[`${rule.id}Casts`]?.[pending.id];
  if (selected?.resource.uses.spent !== pending.spent || selected.item.id !== pending.data.feat
    || JSON.stringify(record) !== JSON.stringify(pending.data) || (rule.id === "shadow" && !concentration(activity, message, pending.id))) return;
  foundry.utils.setProperty(message, `data.flags.spikependium.${rule.id}Cast`, { id: pending.id, caster: activity.actor.uuid });
}

function paidRecord(activity, message) {
  const rule = RULES[activity.item.system?.identifier], request = rule && message?.flags.spikependium?.[`${rule.id}Cast`];
  const record = request && activity.actor.flags.spikependium?.[`${rule.id}Casts`]?.[request.id];
  const receipt = record && message.system.deltas?.item?.[record.feat];
  return request && /^[A-Za-z0-9]{16}$/.test(request.id) && request.caster === activity.actor.uuid
    && record?.caster === request.caster && record.spell === activity.item.uuid && message.author
    && activity.actor.testUserPermission(message.author, "OWNER")
    && receipt?.some(d => d.keyPath === `system.activities.${rule.mod}.uses.spent` && d.delta === 1) ? { id: request.id, record, rule } : undefined;
}
export function extraTargetEffectChanges(wrapped, effect, options = {}) {
  const changes = wrapped(effect, options);
  if (!options.chatMessage?.flags.spikependium?.wardingCast && !options.chatMessage?.flags.spikependium?.shadowCast) return changes;
  const paid = paidRecord(this, options.chatMessage), actor = options.target, scene = resolve(paid?.record.scene);
  const record = paid?.record, rule = paid?.rule, job = scene?.flags.spikependium?.[rule?.id]?.[paid?.id];
  const delegated = record && scene && !record.local && protectedScene(scene) && game.user.isActiveGM && game.users.get(job?.author)?.isGM;
  const local = record?.local && options.chatMessage.author.id === game.user.id && record.started;
  if (!paid || effect.id !== record.profile || !actor?.system.isCreature || (rule.id === "warding" && actor.armor)
    || (rule.id === "shadow" && !concentration(this, options.chatMessage, paid.id))
    || !record.targets.some(d => d.actor === actor.uuid) || (!delegated && !local)
    || actor.flags.spikependium?.[`${rule.id}Receipts`]?.[paid.id] || job?.done?.includes(actor.uuid)
    || game.time.worldTime < record.time || game.time.worldTime - record.time >= record.seconds)
    throw Error("Доспехи мага / Невидимость доступны только целям оплаченного улучшения в пределах срока этого накладывания");
  const marker = { id: paid.id, caster: record.caster, ...(rule.id === "shadow"
    ? { additional: record.targets.find(d => d.token === record.primary)?.actor === actor.uuid } : {}) };
  return foundry.utils.mergeObject(changes, { flags: { spikependium: { [rule.toggle]: marker } },
    system: { magical: true }, start: record.start, duration: { value: record.seconds, units: "seconds", expiry: null, expired: false } });
}
async function applyToTarget(message, id, record, entry, rule) {
  const actor = resolve(entry.actor), token = resolve(entry.token);
  if (!actor?.system.isCreature || token?.actor?.uuid !== actor.uuid || token.parent.uuid !== record.scene
    || actor.flags.spikependium?.[`${rule.id}Receipts`]?.[id]) return;
  if (!actor.isOwner) throw Error("Улучшение: нет права изменять цель");
  if ((rule.id === "shadow" || !actor.armor) && !actor.effects.some(e => e.flags.spikependium?.[rule.toggle]?.id === id)) {
    const activity = message.getAssociatedActivity({ scaled: true }), effect = profile(activity);
    if (!effect || effect.id !== record.profile) throw Error("Улучшение: исходный эффект заклинания больше недоступен");
    const tray = new dnd5e.applications.components.EffectApplicationElement(); tray.chatMessage = message;
    const { action, data } = await tray._prepareEffectData(effect, actor);
    if (rule.id === "shadow" || !actor.armor) {
      if (action === "create") await actor.createEmbeddedDocuments("ActiveEffect", [data]);
      else await actor.updateEmbeddedDocuments("ActiveEffect", [data]);
      if (!actor.effects.some(e => e.flags.spikependium?.[rule.toggle]?.id === id)
        && !actor.flags.spikependium?.[`${rule.id}Receipts`]?.[id]) throw Error("Улучшение: изменение эффекта отклонено");
    }
  }
  await actor.setFlag("spikependium", `${rule.id}Receipts.${id}`, true);
  if (!actor.flags.spikependium?.[`${rule.id}Receipts`]?.[id]) throw Error("Улучшение: запись цели отклонена");
  await endWardingOnArmor(actor);
}
async function finishTargets(scene, id, job, rule) {
  if (job.state !== "pending" || !protectedScene(scene) || !game.user.isActiveGM || !game.users.get(job.author)?.isGM || running.has(id)) return;
  const message = resolve(job.message);
  if (!message || game.time.worldTime < job.time || game.time.worldTime - job.time >= job.seconds
    || (rule.id === "shadow" && !concentration(message.getAssociatedActivity({ scaled: true }), message, id))) return;
  running.add(id);
  try {
    for (const entry of job.targets) {
      if (!game.user.isActiveGM) return;
      if (scene.flags.spikependium[rule.id][id].done.includes(entry.actor)) continue;
      await applyToTarget(message, id, job, entry, rule);
      await scene.setFlag("spikependium", `${rule.id}.${id}.done`, [...new Set([...scene.flags.spikependium[rule.id][id].done, entry.actor])]);
    }
    await scene.setFlag("spikependium", `${rule.id}.${id}.state`, "done");
  } finally { running.delete(id); }
}
export async function applyExtraTargetCast(message) {
  if (message.type !== "usage" || (!message.flags.spikependium?.wardingCast && !message.flags.spikependium?.shadowCast)) return;
  const activity = message.getAssociatedActivity({ scaled: true });
  if (!activity) return;
  const paid = paidRecord(activity, message);
  if (!paid) return;
  const { id, record, rule } = paid, scene = resolve(record.scene);
  if (!scene || record.completed || (record.local ? message.author.id !== game.user.id : !game.user.isActiveGM)) return;
  const previous = scene.flags.spikependium?.[rule.id]?.[id];
  if (previous) return finishTargets(scene, id, previous, rule);
  const source = resolve(record.source), selected = enhancement(activity);
  if ((!record.local && !protectedScene(scene)) || selected?.item.id !== record.feat || !castingToken(activity, source) || source.parent !== scene
    || !Number.isFinite(record.seconds) || record.seconds <= 0 || record.start?.time !== record.time || record.profile !== profile(activity)?.id
    || (!record.local && record.started) || game.time.worldTime < record.time || game.time.worldTime - record.time >= record.seconds
    || !Array.isArray(record.targets) || record.targets.length < 2 || record.targets.some(d => !d?.actor || !d.token)
    || (rule.id === "warding" && record.targets.length !== 2)
    || new Set(record.targets.map(d => d.actor)).size !== record.targets.length || !record.targets.some(d => d.token === record.primary)
    || (rule.id === "shadow" && !concentration(activity, message, id))
    || (!record.started && (record.time !== game.time.worldTime || record.turn !== turn() || record.seconds !== duration(activity)
      || !validTargets(activity, source, record.targets, record.primary, rule))) || running.has(id)) return;
  running.add(id);
  try {
    if (record.local) {
      if (!record.targets.every(d => resolve(d.actor)?.isOwner)) return;
      await activity.actor.setFlag("spikependium", `${rule.id}Casts.${id}.started`, true);
      for (const entry of record.targets) await applyToTarget(message, id, record, entry, rule);
      await activity.actor.setFlag("spikependium", `${rule.id}Casts.${id}.completed`, true);
    } else await scene.setFlag("spikependium", `${rule.id}.${id}`, { ...record, message: message.uuid, author: game.user.id, state: "pending", done: [] });
  } finally { running.delete(id); }
  if (!record.local) await finishTargets(scene, id, scene.flags.spikependium[rule.id][id], rule);
}
export async function endWardingOnArmor(actor) {
  const actors = actor ? [actor] : new Set([...game.actors, ...[...game.scenes].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean));
  for (const a of actors) {
    if (!a.armor || (game.users.activeGM ? !game.user.isActiveGM : !a.isOwner)) continue;
    const ids = a.effects.filter(e => e.flags.spikependium?.improvedWarding).map(e => e.id);
    if (ids.length) await a.deleteEmbeddedDocuments("ActiveEffect", ids);
  }
}
export async function resumeExtraTargetCasts() {
  if (game.user.isActiveGM) for (const scene of game.scenes) for (const rule of Object.values(RULES))
    for (const [id, job] of Object.entries(scene.flags.spikependium?.[rule.id] ?? {})) await finishTargets(scene, id, job, rule);
  for (const message of game.messages) if (message.flags.spikependium?.wardingCast || message.flags.spikependium?.shadowCast) await applyExtraTargetCast(message);
  await endWardingOnArmor();
}
