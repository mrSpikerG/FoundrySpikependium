import { hollowTransformation } from "./hollow-warden.mjs";
import { tokensDistance, incapacitated } from "./effects.mjs";

const AURA = "ecemB0adIQPJprFQ", DAMAGE = "DvHqI92KOqKrJqGx", KEY = "subclass:hollow-warden:wrath-of-the-wilds";
const TYPES = ["necrotic", "poison", "psychic"], processing = new Set(), starting = new Set(), syncing = new Map(), using = new Set(), prepared = new WeakMap();
// shortcut: владельцы на разных клиентах используют неатомарные обновления dnd5e; для одновременных активаций нужен арбитраж Мастера.
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const turn = c => c?.started ? `${c.id}:${c.round}:${c.turn}` : null;
const live = e => e.active && !e.duration.expired && !(Number.isFinite(e.duration.remaining) && e.duration.remaining <= 0);
const isAura = a => a?.id === AURA && a.item.flags.spikependium?.key === KEY;
function current(receipt) {
  const combat = resolve(receipt.combat), target = resolve(receipt.target);
  return turn(combat) === receipt.turn && combat.combatant?.token?.uuid === receipt.target && target?.actor?.uuid === receipt.actor ? target : undefined;
}
function restriction(actor) {
  return actor?.effects?.some(e => e.flags?.spikependium?.hollowAuraRestriction && live(e)
    && (!e.flags.spikependium.hollowAura || current(e.flags.spikependium.hollowAura)?.actor === actor));
}
const counts = (activity, config) => ["action", "bonus"].includes(activity?.activation?.type)
  && activity.type !== "cast" && config?.consume !== false && config?.consume?.action !== false;
function used(actor) {
  const combat = game.combats.find(c => c.started && c.combatant?.actor?.uuid === actor.uuid);
  if (!combat) return;
  return Object.values(actor.flags.spikependium?.hollowActions ?? {}).find(r => r.turn === turn(combat) && r.spent > 0);
}
export function canUseHollowAction(activity, config = {}) {
  if (!counts(activity, config)) return true;
  if (game.users?.activeGM && game.messages?.some(origin => {
    const receipt = origin.flags.spikependium?.hollowAura;
    if (!origin.author?.isGM || !receipt || origin.flags.spikependium.hollowAuraManualResolved
      || receipt.actor !== activity.actor?.uuid || !current(receipt)) return false;
    const save = latestSave(origin), roll = save?.rolls[0];
    return !(roll instanceof CONFIG.Dice.D20Roll) || !roll._evaluated || roll.options.target !== receipt.dc
      || (!!failed(origin) && !!receipt.sinister && !activity.actor.flags.spikependium?.hollowSinister?.[origin.id]?.applied);
  })) { ui.notifications.warn("Сначала завершите спасбросок и последствия Тревожной ауры в карточке начала хода."); return false; }
  if (!restriction(activity.actor)) return true;
  const previous = used(activity.actor);
  if (!previous || previous.kind === activity.activation.type) return true;
  ui.notifications.warn("Тревожная аура: в этом ходу уже использовано действие другого вида. Реакция остаётся доступной.");
  return false;
}
export async function hollowActionUse(wrapped, config = {}, ...args) {
  if (!counts(this, config)) return wrapped(config, ...args);
  if (!canUseHollowAction(this, config)) return;
  if (!restriction(this.actor)) return wrapped(config, ...args);
  if (using.has(this.actor.uuid)) return;
  using.add(this.actor.uuid);
  try { return await wrapped(config, ...args); } finally { using.delete(this.actor.uuid); }
}
export function prepareHollowActionUpdates(activity, config, updates) {
  prepared.delete(activity);
  if (!counts(activity, config)) return updates;
  if (!canUseHollowAction(activity, config)) return false;
  if (!restriction(activity.actor)) return updates;
  if (!activity.actor.isOwner) return false;
  const combat = game.combats.find(c => c.started && c.combatant?.actor?.uuid === activity.actor.uuid);
  if (!combat) return updates;
  const record = { id: foundry.utils.randomID(), kind: activity.activation.type, turn: turn(combat), spent: 1 };
  for (const [id, old] of Object.entries(activity.actor.flags.spikependium?.hollowActions ?? {}))
    if (old.turn !== record.turn) updates.actor[`flags.spikependium.hollowActions.-=${id}`] = null;
  updates.actor[`flags.spikependium.hollowActions.${record.id}`] = record;
  prepared.set(activity, record);
  return updates;
}
export function recordHollowActionConsumption(activity, config, message) {
  const record = prepared.get(activity); prepared.delete(activity);
  if (!record || activity.actor.flags.spikependium?.hollowActions?.[record.id]?.spent !== 1) return;
  const path = `flags.spikependium.hollowActions.${record.id}.spent`;
  const deltas = (message.data.system.deltas ??= { actor: [], item: {} }).actor ??= [];
  if (!deltas.some(d => d.keyPath === path)) deltas.push({ keyPath: path, delta: 1 });
}
export function hollowActionDeltaLabel(wrapped, ...args) {
  const data = wrapped(...args);
  if (/^flags\.spikependium\.hollowActions\.[A-Za-z0-9]{16}\.spent$/.test(this.keyPath)) data.label = "Тревожная аура: выбор вида действия";
  return data;
}
export function hollowAuraSources(target) {
  if (!target?.actor?.system.isCreature || target.actor.statuses.has("dead")) return [];
  const seen = new Set();
  // shortcut: стены и полное укрытие проверяет Мастер; подключить общую нативную проверку линии эффекта эманаций.
  return [...target.parent.tokens].flatMap(source => {
    const actor = source.actor, form = hollowTransformation(actor);
    if (source === target || source.actor === target.actor || !form || actor.system.attributes.hp.value <= 0 || incapacitated(actor)
      || ([1, -1].includes(source.disposition) && source.disposition === target.disposition)) return [];
    const activity = actor.items.find(i => i.flags.spikependium?.key === KEY)?.system.activities.get(AURA);
    const distance = activity && tokensDistance(source, target);
    return distance != null && distance <= 10 && Number.isFinite(activity.save.dc.value) ? [{ source, activity, form }] : [];
  }).filter(({ source }) => { if (seen.has(source.actor.uuid)) return false; seen.add(source.actor.uuid); return true; });
}
function ownerFor(source, target, combat) {
  if (source.hidden || target.hidden || combat.combatant.hidden) return game.user;
  return game.users.filter(u => u.active && !u.isGM && source.actor.testUserPermission(u, "OWNER")).sort((a, b) => a.id.localeCompare(b.id))[0] ?? game.user;
}
export async function startHollowAuras(combat, changed, options = {}) {
  if (!game.user.isActiveGM || (!Object.hasOwn(changed, "round") && !Object.hasOwn(changed, "turn")) || options.direction < 0) return;
  const key = turn(combat), target = combat.combatant?.token;
  if (!key || combat.round < 1 || !target || starting.has(key)) return;
  starting.add(key);
  try {
  for (const { source, activity, form } of hollowAuraSources(target)) {
    const event = `${key}:${source.uuid}:${target.uuid}`, state = combat.flags.spikependium?.hollowAuras;
    if (processing.has(event) || (state?.turn === key && state.events.includes(event))
      || game.messages.some(m => m.flags.spikependium?.hollowAura?.event === event)) continue;
    processing.add(event);
    try {
      await combat.setFlag("spikependium", "hollowAuras", { turn: key, events: [...(state?.turn === key ? state.events : []), event] });
      if (![1, -1].includes(source.disposition) || ![1, -1].includes(target.disposition)) {
        const enemy = await foundry.applications.api.DialogV2.query(ownerFor(source, target, combat), "confirm", {
          window: { title: "Тревожная аура: отношение к цели" }, rejectClose: false,
          content: `<p>Считать ${foundry.utils.escapeHTML(target.name)} врагом для ауры ${foundry.utils.escapeHTML(source.name)}?</p>` });
        if (enemy !== true) continue;
      }
      if (!game.user.isActiveGM || turn(combat) !== key || !hollowAuraSources(target).some(s => s.source === source && s.form === form)) continue;
      let effect = activity.item.effects.find(e => e.flags.spikependium?.hollowAuraRestriction);
      if (!effect) {
        const updated = await fromUuid("Compendium.spikependium.subclasses.Item.3cMiDKhuk0lRx5dv");
        const template = updated?.effects.find(e => e.flags.spikependium?.hollowAuraRestriction);
        if (template) effect = new ActiveEffect.implementation(template.toObject(), { parent: activity.item });
      }
      if (!effect) throw Error("Отсутствует профиль ограничения Тревожной ауры");
      if (!game.user.isActiveGM || turn(combat) !== key || resolve(target.uuid) !== target
        || !hollowAuraSources(target).some(s => s.source === source && s.form === form)) continue;
      const sinister = source.actor.items.find(i => i.flags.spikependium?.key === "subclass:hollow-warden:rot-and-ruin")?.system.activities.get(DAMAGE);
      const level = source.actor.classes.ranger?.system.levels ?? 0;
      const receipt = { event, turn: key, combat: combat.uuid, target: target.uuid, actor: target.actor.uuid, source: source.uuid,
        sourceActor: source.actor.uuid, sourceHidden: !!source.hidden,
        activity: activity.uuid, effect: effect.toObject(), effectUuid: effect.uuid, dc: activity.save.dc.value,
        sinister: sinister && level >= 11 ? sinister.uuid : null, level: sinister && level >= 11 ? level : 0 };
      const results = await activity.use({ consume: false, subsequentActions: false, create: { measuredTemplate: false } }, { configure: false }, {
        rollMode: source.hidden || target.hidden || combat.combatant.hidden ? "gm" : "public",
        data: { speaker: ChatMessage.implementation.getSpeaker({ actor: source.actor, token: source }),
          system: { targets: dnd5e.dataModels.chatMessage.fields.TargetsField.getDescriptors([target]) },
          flags: { spikependium: { hollowAura: receipt }, dnd5e: { item: { data: activity.item.toObject() } } } }
      });
      if (!results?.message) throw Error("Тревожная аура не создала карточку спасброска");
    } catch (error) {
      if (!game.messages.some(m => m.flags.spikependium?.hollowAura?.event === event)) {
        const state = combat.flags.spikependium?.hollowAuras;
        if (state?.turn === key) await combat.setFlag("spikependium", "hollowAuras", { turn: key, events: state.events.filter(e => e !== event) });
      }
      console.error("Spikependium: начало хода Тревожной ауры", error);
      ui.notifications.error("Не удалось создать спасбросок Тревожной ауры. Используйте действие на листе следопыта.");
    } finally { processing.delete(event); }
  }
  } finally { starting.delete(key); }
}
function latestSave(origin) {
  const receipt = origin.flags.spikependium?.hollowAura;
  return origin.getAssociatedRolls("save").filter(m => m.getAssociatedToken()?.uuid === receipt.target && m.system.ability === "wis"
    && resolve(receipt.target)?.actor?.testUserPermission(m.author, "OWNER")).at(-1);
}
function failed(origin) {
  const latest = latestSave(origin), roll = latest?.rolls[0];
  return roll instanceof CONFIG.Dice.D20Roll && roll._evaluated && roll.options.target === origin.flags.spikependium.hollowAura.dc
    && !!resolve(origin.flags.spikependium.hollowAura.target)?.actor?.testUserPermission(latest.author, "OWNER")
    && roll.isFailure && !latest.system.forceSuccess ? latest : undefined;
}
export function prepareHollowSave(message) {
  if (message.type !== "save") return;
  const origin = message.getOriginatingMessage(), receipt = origin?.flags.spikependium?.hollowAura;
  if (!receipt || !origin.author?.isGM || message.system.ability !== "wis") return;
  const target = resolve(receipt.target);
  if (!target?.actor || message.speaker.actor !== target.actor.id) return;
  const data = { speaker: ChatMessage.implementation.getSpeaker({ actor: target.actor, token: target }) };
  if (origin.whisper.length) { data.whisper = [...origin.whisper]; data.blind = origin.blind || message.blind; }
  message.updateSource(data);
}
export async function syncHollowAura(message) {
  if (!game.user.isActiveGM || message.type !== "save") return;
  const origin = message.getOriginatingMessage(), receipt = origin?.flags.spikependium?.hollowAura;
  if (!receipt || !origin.author?.isGM || message.getAssociatedToken()?.uuid !== receipt.target) return;
  const task = syncing.get(origin.uuid);
  if (task) { task.pending = true; return; }
  const target = resolve(receipt.target), actor = target?.actor;
  if (!actor?.isOwner) return;
  const job = { pending: false }; syncing.set(origin.uuid, job);
  try {
    const existing = actor.effects.filter(e => e.flags.spikependium?.hollowAura?.event === receipt.event), latest = failed(origin);
    if (!latest) { if (existing.length) await actor.deleteEmbeddedDocuments("ActiveEffect", existing.map(e => e.id)); return; }
    if (!current(receipt)) return;
    if (!existing.some(live)) {
      const activity = origin.getAssociatedActivity(), effect = activity?.item.effects.find(e => e.uuid === receipt.effectUuid)
        ?? new ActiveEffect.implementation(receipt.effect, { parent: activity?.item });
      const tray = new dnd5e.applications.components.EffectApplicationElement(); tray.chatMessage = origin;
      const { action, data } = await tray._prepareEffectData(effect, actor);
      if (!current(receipt) || failed(origin) !== latest) return;
      data.duration = { value: 1, units: "turns", expiry: "turnEnd", expired: false };
      data.start = ActiveEffect.implementation.getEffectStart(resolve(receipt.combat));
      data.flags = { ...data.flags, spikependium: { ...data.flags?.spikependium, hollowAuraRestriction: true, hollowAura: receipt } };
      data.system.origin = { ...data.system.origin, activity: receipt.activity, message: origin.uuid, profile: receipt.effect._id };
      if (action === "create") await actor.createEmbeddedDocuments("ActiveEffect", [data]);
      else await actor.updateEmbeddedDocuments("ActiveEffect", [data]);
    }
    if (!receipt.sinister || origin.flags.spikependium.hollowAuraManualResolved || actor.flags.spikependium?.hollowSinister?.[origin.id]?.applied) return;
    const combat = resolve(receipt.combat), source = resolve(receipt.source)
      ?? { actor: resolve(receipt.sourceActor), hidden: receipt.sourceHidden }, sinister = resolve(receipt.sinister);
    let damage = game.messages.find(m => m.author?.isGM && m.flags.spikependium?.hollowSinister?.origin === origin.uuid);
    if (!damage) {
      const selected = await foundry.applications.api.DialogV2.query(source.actor ? ownerFor(source, target, combat) : game.user, "input", {
        window: { title: "Зловещая аура: тип урона" }, rejectClose: false,
        content: `<p>${foundry.utils.escapeHTML(target.name)} проваливает спасбросок. Выберите тип ${receipt.level} единиц урона.</p><select name="damage"><option value="necrotic">Некротическая энергия</option><option value="poison">Яд</option><option value="psychic">Психическая энергия</option></select>` });
      if (!TYPES.includes(selected?.damage) || !current(receipt) || failed(origin) !== latest || !game.user.isActiveGM) return;
      await CONFIG.Dice.DamageRoll.build({ subject: sinister, hookNames: ["damage"],
        rolls: [{ parts: [String(receipt.level)], data: {}, options: { isCritical: false, type: selected.damage, types: [selected.damage] } }] }, { configure: false }, {
        create: true, rollMode: origin.whisper.length ? "gm" : "public", data: { type: "damage", flavor: "Зловещая аура",
          speaker: origin.speaker, system: { ...(sinister?.messageSources ?? { activity: origin.system.activity, item: origin.system.item }), origin: origin.id, targets: origin.system.targets },
          flags: { spikependium: { ignoreResistanceTypes: TYPES, hollowSinister: { origin: origin.uuid, save: latest.uuid, type: selected.damage } } } }
      });
      damage = game.messages.find(m => m.author?.isGM && m.flags.spikependium?.hollowSinister?.origin === origin.uuid);
    }
    if (!damage || !current(receipt) || failed(origin) !== latest || !game.user.isActiveGM) return;
    const roll = damage.rolls[0];
    if (roll?._evaluated && Number.isFinite(roll.total) && roll.total >= 0)
      await actor.applyDamage([{ value: roll.total, type: roll.options.type }], { originatingMessage: damage });
  } finally {
    syncing.delete(origin.uuid);
    if (job.pending) await syncHollowAura(message);
  }
}
export function prepareHollowDamage(config, dialog, message) {
  if (config.subject?.id === DAMAGE && config.subject.item.flags.spikependium?.key === "subclass:hollow-warden:rot-and-ruin")
    foundry.utils.setProperty(message, "data.flags.spikependium.ignoreResistanceTypes", TYPES);
}
export function recordHollowDamage(actor, amount, updates, options) {
  const damage = options.originatingMessage, saved = damage?.flags.spikependium?.hollowSinister;
  if (!saved) return;
  const origin = resolve(saved.origin), receipt = origin?.flags.spikependium?.hollowAura;
  if (!game.user.isActiveGM || !damage.author?.isGM || !origin?.author?.isGM || !receipt || !current(receipt) || receipt.actor !== actor.uuid
    || origin.flags.spikependium.hollowAuraManualResolved || !failed(origin) || !TYPES.includes(saved.type)
    || actor.flags.spikependium?.hollowSinister?.[origin.id]?.applied) return false;
  for (const [id, record] of Object.entries(actor.flags.spikependium?.hollowSinister ?? {}))
    if (record.turn !== receipt.turn) updates[`flags.spikependium.hollowSinister.-=${id}`] = null;
  updates[`flags.spikependium.hollowSinister.${origin.id}`] = { turn: receipt.turn, applied: 1 };
}
export async function resumeHollowAuras() {
  if (!game.user.isActiveGM) return;
  for (const message of game.messages) if (message.type === "save" && message.getOriginatingMessage()?.flags.spikependium?.hollowAura) await syncHollowAura(message);
}
export async function endHollowAuraEffects() {
  if (!game.user.isActiveGM) return;
  const actors = new Set([...game.actors, ...[...game.scenes].flatMap(s => [...s.tokens].map(t => t.actor))]);
  for (const actor of actors) if (actor?.isOwner) {
    const expired = actor.effects.filter(e => e.flags.spikependium?.hollowAura && !current(e.flags.spikependium.hollowAura));
    if (expired.length) await actor.deleteEmbeddedDocuments("ActiveEffect", expired.map(e => e.id));
  }
}
export function hollowAuraChatButtons(wrapped, message) {
  const buttons = wrapped(message);
  if (!game.user.isActiveGM || !isAura(this) || !(message.flags ?? message.data?.flags)?.spikependium?.hollowAura) return buttons;
  return [...buttons, { action: "hollowFinishAura", label: { value: "Завершить последствия ауры" }, icon: "fa-solid fa-tree" },
    { action: "hollowManualAura", label: { value: "Разрешено вручную" }, icon: "fa-solid fa-check" }];
}
export async function hollowAuraChatAction(wrapped, event, target, message) {
  if (!["hollowFinishAura", "hollowManualAura"].includes(target.dataset.action)) return wrapped(event, target, message);
  if (!game.user.isActiveGM || !isAura(this) || !message.author?.isGM || !message.flags.spikependium?.hollowAura) return;
  if (target.dataset.action === "hollowManualAura") return message.setFlag("spikependium", "hollowAuraManualResolved", true);
  const save = latestSave(message);
  if (save) await syncHollowAura(save);
  else ui.notifications.warn("Сначала выполните спасбросок Мудрости в этой карточке.");
}
