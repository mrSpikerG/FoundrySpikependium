import { canonicalFocusItem, activeFocus, focusKind, finalFocusCharge } from "./griffon-foci.mjs";
import { reactionAvailable } from "./reactions.mjs";
import { originSaveFresh } from "./arcana-save-boost.mjs";
import { isGriffonSpellcaster } from "./griffon-two-items.mjs";

const resolve = (uuid, actor) => typeof uuid === "string" && uuid ? fromUuidSync(uuid, { strict: false, relative: actor }) : undefined;
const signature = card => JSON.stringify(card.rolls.map(r => r.toJSON()));
const blade = "Compendium.dnd5e.spells24.Item.phbsplFlameBlade";
const choosing = new Set(), prepared = new WeakMap();
const path = nonce => `flags.spikependium.focusCasting.${nonce}.active`;
const actorRecords = actor => Object.values(actor?.flags.spikependium?.focusCasting ?? {});
function paid(record, actor, usage) {
  if (typeof record?.wand !== "string" || !/^[A-Za-z0-9]{16}$/.test(record.nonce ?? "")) return false;
  usage ??= [...game.messages].find(m => m.type === "usage" && m.flags.spikependium?.focusCasting?.nonce === record.nonce);
  if (usage?.type !== "usage" || usage.flags.spikependium?.focusCasting?.actor !== actor.uuid || usage.flags.spikependium.focusCasting.kind !== record.kind || !usage.author || !actor.testUserPermission(usage.author, "OWNER")
    || !usage.system.deltas?.actor?.some(d => d.keyPath === path(record.nonce) && d.delta === 1)) return false;
  const cost = record.kind === "blade" ? 1 : record.level, itemId = record.wand.split(".").at(-1);
  return (!cost || usage.system.deltas.item?.[itemId]?.some(d => d.keyPath === "system.uses.spent" && d.delta >= cost))
    && (record.kind !== "blade" || usage.system.deltas.actor.some(d => d.keyPath === `flags.spikependium.reactionCasts.${record.reaction}.spent` && d.delta === 1));
}
function held(item, id) {
  return focusKind(item) === id && item.actor?.items.get(item.id) === item && item.actor.isOwner && item.system.quantity > 0 && activeFocus(item);
}
function bladeSource(actor, wand) {
  const effects = [...(actor.concentration?.effects ?? [])];
  if (effects.length !== 1 || !effects[0].active) return;
  const data = effects[0].getFlag("dnd5e", "item"), spell = actor.items.get(data?.id) ?? data?.data;
  const cached = spell?.flags?.dnd5e?.cachedFor, source = resolve(cached, actor);
  if (spell?.type !== "spell" || source?.type !== "cast" || source.item.id !== wand.id || source.actor?.uuid !== actor.uuid || source.spell.uuid !== blade) return;
  return effects[0];
}
function failedBladeSave(card, wand) {
  const actor = wand?.actor, roll = card?.rolls?.[0];
  return held(wand, "unbroken-fire") && actor.classes?.druid?.system.levels > 0 && card?.type === "save" && card.system.type === "concentration"
    && card.isContentVisible !== false
    && card.system.ability === "con" && card.system.outcome !== "broken" && !card.system.forceSuccess && !card.system.resisted
    && card.getAssociatedActor()?.uuid === actor.uuid && card.author && actor.testUserPermission(card.author, "OWNER")
    && card.rolls.length === 1 && roll instanceof CONFIG.Dice.D20Roll && roll._evaluated && roll.isFailure && originSaveFresh(card)
    && bladeSource(actor, wand);
}
const bladeAction = activity => activity?.item?.flags.spikependium?.key === "item:gs1:unbroken-fire" && activity.flags?.spikependium?.focusBladeSuccess;
export function prepareFocusCasting(activity, config, _dialog, message) {
  if (bladeAction(activity)) {
    const wand = canonicalFocusItem(activity.item), selected = config.spikependium?.focusBladeSave;
    const card = selected ? resolve(selected) : [...game.messages].reverse().find(c => failedBladeSave(c, wand));
    if (!failedBladeSave(card, wand) || !reactionAvailable(activity.actor) || message.create === false) {
      ui.notifications.warn("Нужен свежий собственный провал Телосложения для концентрации только на Горящем клинке этой палочки и доступная реакция."); return false;
    }
    config.spikependium = { ...config.spikependium, focusBladeSave: card.uuid, focusBladeSignature: signature(card), focusBladeEffect: bladeSource(activity.actor, wand).uuid };
    message.data ??= {};
    if (card.whisper?.length) {
      const audience = message.data.whisper?.length ? message.data.whisper.filter(id => card.whisper.includes(id)) : [...card.whisper];
      if (!audience.length) { ui.notifications.warn("Аудитории исходного спасброска и реакции не пересекаются."); return false; }
      message.data.whisper = audience;
    }
    message.data.blind = !!message.data.blind || !!card.blind;
    return;
  }
  const selected = config.spikependium?.focusWhispers;
  if (!selected || activity.item.type !== "spell") return;
  const wand = resolve(selected), item = activity.item, original = activity.actor?.items.get(item.id);
  if (!held(wand, "whispers") || wand.actor.uuid !== activity.actor?.uuid || !isGriffonSpellcaster(activity.actor) || item === original
    || !item.system.properties.has("vocal") || item.system.level > 5 || message.create === false) {
    ui.notifications.warn("Для безвербального колдовства нужна действующая Палочка шёпотов и рабочая копия заклинания уровня 0–5."); return false;
  }
  item.updateSource({ "system.properties": [...item.system.properties].filter(p => p !== "vocal"),
    "flags.spikependium.focusWhispers": { wand: wand.uuid, actor: activity.actor.uuid, spell: item.id } });
  message.hasConsumption = true;
}
export async function whispersCastingUse(wrapped, config = {}, ...args) {
  const item = this.item, actor = this.actor;
  if (item?.type !== "spell" || !actor?.isOwner || !item.system.properties.has("vocal") || item.system.level > 5 || config.spikependium?.focusWhispers === false) return wrapped(config, ...args);
  let selected = config.spikependium?.focusWhispers;
  if (!selected) {
    const wands = actor.items.filter(i => held(i, "whispers"));
    if (!wands.length) return wrapped(config, ...args);
    const choice = await foundry.applications.api.DialogV2.input({ window: { title: "Палочка шёпотов" }, rejectClose: false,
      content: `<div class="form-group"><label>Убрать вербальный компонент?</label><select name="wand"><option value="">Обычное колдовство</option>${wands.map(i => `<option value="${foundry.utils.escapeHTML(i.uuid)}">${foundry.utils.escapeHTML(i.name)}</option>`).join("")}</select></div>`, ok: { label: "Продолжить" } });
    if (!choice) return;
    selected = choice.wand || false;
  }
  return wrapped({ ...config, spikependium: { ...config.spikependium, focusWhispers: selected } }, ...args);
}
export async function prepareFocusCastingUpdates(activity, config, updates) {
  prepared.delete(activity);
  const actor = activity.actor;
  if (bladeAction(activity)) {
    const wand = canonicalFocusItem(activity.item), card = resolve(config.spikependium?.focusBladeSave), reaction = updates.actor["flags.spikependium.reactionId"];
    if (!failedBladeSave(card, wand) || signature(card) !== config.spikependium.focusBladeSignature || bladeSource(actor, wand).uuid !== config.spikependium.focusBladeEffect
      || updates.item.find(i => i._id === wand.id)?.["system.uses.spent"] !== wand.system.uses.spent + 1
      || !reaction || updates.actor[`flags.spikependium.reactionCasts.${reaction}`]?.spent !== 1) return false;
    const nonce = foundry.utils.randomID(), receipt = { nonce, kind: "blade", actor: actor.uuid, save: card.uuid, signature: signature(card),
      wand: wand.uuid, reaction, effect: config.spikependium.focusBladeEffect, author: game.user.id, active: 1 };
    updates.actor[`flags.spikependium.focusCasting.${nonce}`] = receipt; prepared.set(activity, receipt); return updates;
  }
  const selected = config.spikependium?.focusWhispers, stamp = activity.item.flags.spikependium?.focusWhispers;
  if (!selected || activity.item.type !== "spell") return updates;
  const wand = resolve(selected), item = activity.item;
  const slot = actor.system.spells?.[config.spell?.slot];
  const level = item.system.level === 0 ? 0 : slot?.level ?? item.flags.dnd5e?.spellLevel?.value ?? item.system.level + (config.scaling ?? 0);
  if (!held(wand, "whispers") || wand.actor.uuid !== actor.uuid || !isGriffonSpellcaster(actor) || stamp?.wand !== wand.uuid || stamp.actor !== actor.uuid || stamp.spell !== item.id
    || item.system.properties.has("vocal") || !Number.isInteger(level) || level < 0 || level > 5 || config.consume === false || config.consume?.resources === false) {
    ui.notifications.warn("Палочка, уровень ячейки или подтверждение безвербального колдовства изменились. Повторите применение."); return false;
  }
  let update = updates.item.find(i => i._id === wand.id);
  const pending = update?.["system.uses.spent"] ?? update?.system?.uses?.spent ?? wand.system.uses.spent;
  if (!Number.isFinite(pending) || pending < wand.system.uses.spent || pending + level > Number(wand.system.uses.max)) { ui.notifications.warn("Для выбранного уровня ячейки не хватает зарядов Палочки шёпотов."); return false; }
  if (level) {
    if (!update) updates.item.push(update = { _id: wand.id });
    if (update.system?.uses?.spent !== undefined) update.system.uses.spent = pending + level; else update["system.uses.spent"] = pending + level;
    await finalFocusCharge(wand, updates);
  }
  const nonce = foundry.utils.randomID(), receipt = { nonce, kind: "whispers", actor: actor.uuid, wand: wand.uuid, spell: item.id, activity: activity.id, level, active: 1 };
  updates.actor[`flags.spikependium.focusCasting.${nonce}`] = receipt; prepared.set(activity, receipt); return updates;
}
export function recordFocusCasting(activity, _config, message) {
  const receipt = prepared.get(activity); prepared.delete(activity);
  if (!receipt || foundry.utils.getProperty(activity.actor, path(receipt.nonce)) !== 1) return;
  const deltas = ((message.data.system ??= {}).deltas ??= {}).actor ??= [];
  if (!deltas.some(d => d.keyPath === path(receipt.nonce))) deltas.push({ keyPath: path(receipt.nonce), delta: 1 });
  foundry.utils.setProperty(message, "data.flags.spikependium.focusCasting", receipt);
}
export function focusBladeSuccess(wrapped, ...args) {
  const card = this.parent, actor = card.getAssociatedActor?.();
  if (this.type === "concentration" && this.ability === "con" && card.type === "save" && card.rolls?.length === 1 && card.author && actor?.testUserPermission(card.author, "OWNER")
    && actorRecords(actor).some(r => r.kind === "blade" && r.active === 1 && r.actor === actor.uuid && r.save === card.uuid && r.signature === signature(card)
      && /^[A-Za-z0-9]{16}$/.test(r.nonce) && actor.testUserPermission(game.users.get(r.author), "OWNER") && paid(r, actor))) return true;
  return wrapped(...args);
}
export async function chooseFireWandSave(card) {
  const actor = card.getAssociatedActor?.();
  if (!actor?.isOwner || card.author?.id !== game.user.id || choosing.has(actor.uuid) || !reactionAvailable(actor)) return;
  const wand = actor.items.find(i => failedBladeSave(card, i) && i.system.uses.value > 0);
  if (!wand) return;
  choosing.add(actor.uuid);
  try {
    if (!await foundry.applications.api.DialogV2.confirm({ window: { title: "Огненная палочка Нерушимого круга" }, content: "<p>Потратить реакцию и 1 заряд, чтобы сохранить концентрацию на Горящем клинке этой палочки?</p>" }) || !failedBladeSave(card, wand)) return;
    const action = wand.system.activities.find(a => a.flags.spikependium?.focusBladeSuccess);
    if (action) await action.use({ configure: false, spikependium: { focusBladeSave: card.uuid } });
  } finally { choosing.delete(actor.uuid); }
}
export async function refreshFocusSaves(document, changes) {
  if (changes && !foundry.utils.getProperty(changes, "flags.spikependium.focusCasting")
    && !Object.keys(changes).some(k => k.startsWith("flags.spikependium.focusCasting"))) return;
  const actor = document?.type === "usage" ? document.getAssociatedActor?.()
    : document?.documentName === "ActorDelta" ? document.parent.actor : document;
  for (const record of actorRecords(actor).filter(r => r.kind === "blade")) {
    const card = resolve(record.save); if (card) await ui.chat?.updateMessage(card, { notify: false });
  }
}
export function guardWhispersRoll(config, _dialog, message) {
  const id = config.event?.target?.closest("[data-message-id]")?.dataset.messageId ?? message.data?.system?.origin;
  const card = typeof id === "string" ? game.messages.get(id) : id, origin = card?.type === "usage" ? card : card?.getOriginatingMessage?.(), r = origin?.flags.spikependium?.focusCasting;
  if (r?.kind !== "whispers") return;
  const actor = config.subject?.actor, record = actor?.flags.spikependium?.focusCasting?.[r.nonce];
  if (!actor || r.actor !== actor.uuid || record?.active !== 1 || record.wand !== r.wand || record.spell !== config.subject.item.id || record.activity !== config.subject.id || !paid(record, actor, origin)) {
    ui.notifications.warn("Исходное безвербальное колдовство отменено или относится к другому заклинанию."); return false;
  }
}
function whisperedItem(card, item) {
  const origin = card.type === "usage" ? card : card.getOriginatingMessage?.(), r = origin?.flags.spikependium?.focusCasting;
  const actor = item?.actor, record = actor?.flags.spikependium?.focusCasting?.[r?.nonce];
  if (r?.kind !== "whispers" || item?.type !== "spell" || item.id !== r.spell || actor?.uuid !== r.actor || record?.active !== 1
    || record.wand !== r.wand || record.spell !== r.spell || !paid(record, actor, origin)) return item;
  return item.clone({ "system.properties": [...item.system.properties].filter(p => p !== "vocal") }, { keepId: true });
}
export function restoreWhispersItem(wrapped, options) { return whisperedItem(this, wrapped(options)); }
export function restoreWhispersActivity(wrapped, options) {
  const activity = wrapped(options), item = whisperedItem(this, activity?.item);
  return item && item !== activity?.item ? item.system.activities.get(activity.id) : activity;
}
export function focusCastingDeltaLabel(wrapped, ...args) {
  const result = wrapped(...args);
  if (/^flags\.spikependium\.focusCasting\.[A-Za-z0-9]{16}\.active$/.test(this.keyPath)) result.label = "Применение свойства палочки";
  return result;
}
