import { hasGriffonClass } from "./griffon-rings.mjs";
import { isGriffonSpellcaster } from "./griffon-two-items.mjs";

const canonical = item => item?.actor?.items?.get?.(item.id) ?? item;
const flags = item => canonical(item)?.flags?.spikependium ?? {};
const kind = item => /^item:gs1:/.test(flags(item).key ?? "") ? flags(item).griffonFocus : null;
const active = item => { item = canonical(item); return item?.system.equipped && !flags(item).focusRuin
  && (!flags(item).staffIntelligence || item.actor?.system.abilities.int.value >= flags(item).staffIntelligence)
  && (item.system.attunement !== "required" || item.system.attuned); };
const rootOf = activity => activity?.getLinkedActivity?.() ?? activity;
export { canonical as canonicalFocusItem, active as activeFocus, kind as focusKind };
const ordinary = a => a?.item?.type === "weapon" && a.type === "attack";
const orc = actor => [...(actor?.items ?? [])].some(i => i.type === "race" && (i.system.identifier === "orc" || ["орк", "orc"].includes(i.name?.toLowerCase())));
export function focusSeason(item) {
  const f = flags(item);
  return f.focusSeasonUntil > game.time.worldTime ? f.focusSeason : f.focusCalendarSeason;
}
export function guardFocusAttunement(item, changes) {
  if (kind(item) === "arcanist-bowstaff" && item.actor && (changes["system.attuned"] ?? changes.system?.attuned) === true && item.actor.system.abilities.int.value < 17) {
    ui.notifications.warn("Настройка посоха-лука требует Интеллекта 17."); return false;
  }
  if (kind(item) === "warmind" && item.actor && (changes["system.attuned"] ?? changes.system?.attuned) === true && !orc(item.actor)) {
    ui.notifications.warn("Настройка палочки воинствующего разума требует орка."); return false;
  }
}
export function canUseGriffonFocus(activity, _config, _dialog, message) {
  if (activity.item.type === "spell" && activity.item.flags.dnd5e?.cachedFor && /^(equipment|weapon):griffon-/.test(activity.item.system.sourceItem ?? "") && !activity.getLinkedActivity?.()) {
    ui.notifications.warn("Исходный предмет этого заклинания больше недоступен."); return false;
  }
  const root = rootOf(activity), item = canonical(root.item), id = kind(item), f = root.flags?.spikependium ?? {};
  if (!id) return;
  if (item.system.quantity <= 0) { ui.notifications.warn("Предмет уничтожен или отсутствует."); return false; }
  if (flags(item).focusRuin && (!ordinary(root) || item.system.quantity <= 0)) { ui.notifications.warn("Предмет уничтожен или лишился магических свойств."); return false; }
  if (id === "braided" && ordinary(root) && flags(item).staffRopeMode) { ui.notifications.warn("Верёвкой нельзя атаковать как боевым посохом."); return false; }
  if (id === "arcanist-bowstaff" && (!ordinary(root) || f.staffBow || f.staffIntAttack)
    && (!active(item) || item.actor?.system.abilities.int.value < 17)) { ui.notifications.warn("Магические свойства посоха-лука требуют настройки и Интеллекта 17."); return false; }
  if (ordinary(root)) return;
  if (!hasGriffonClass(item) || (flags(item).griffonSpellcaster && !isGriffonSpellcaster(item.actor))) return false;
  if (id === "warmind" && !orc(item.actor)) { ui.notifications.warn("Настройка палочки требует орка."); return false; }
  if (id === "talyard" && root.type === "cast" && !flags(item).focusDrunk) { ui.notifications.warn("Колдовство из палочки Талъярда требует подтверждённого опьянения."); return false; }
  if (id === "four-seasons" && f.focusSeasonSpell && f.focusSeasonSpell !== focusSeason(item)) { ui.notifications.warn("Это заклинание недоступно в действующем сезоне посоха."); return false; }
  if (message && ["focusFlame", "focusDrunk", "focusCalendarSeason", "focusChooseSeason"].some(key => f[key] !== undefined)) message.hasConsumption = true;
}
export function guardFocusRoll(config, _dialog, message = {}) {
  const root = rootOf(config.subject), item = canonical(root?.item);
  if (config.subject?.item?.type === "spell" && root === config.subject && config.subject.item.flags.dnd5e?.cachedFor
    && /^(equipment|weapon):griffon-/.test(config.subject.item.system.sourceItem ?? "")) return false;
  if (!kind(item)) return;
  if (root !== config.subject && config.subject.item.type === "spell") {
    const id = config.event?.target?.closest("[data-message-id]")?.dataset.messageId ?? message.data?.system?.origin;
    const card = typeof id === "string" ? game.messages.get(id) : id, usage = card?.type === "usage" ? card : card?.getOriginatingMessage?.();
    const source = usage?.getAssociatedActivity?.();
    if (usage?.author && item.actor?.testUserPermission?.(usage.author, "OWNER") && source?.actor?.uuid === config.subject.actor?.uuid
      && source.item.id === config.subject.item.id && source.id === config.subject.id) return;
  }
  if (!item.actor?.items?.get?.(item.id) || canUseGriffonFocus(config.subject) === false || !item.actor?.isOwner || !item.system.equipped || (!ordinary(root) && !active(item))) return false;
}
export async function prepareFocusUpdates(activity, _config, updates) {
  const root = rootOf(activity), item = canonical(root.item), id = kind(item), f = root.flags?.spikependium ?? {};
  if (!id) return updates;
  if (!item.actor?.items?.get?.(item.id) || !item.actor.isOwner || canUseGriffonFocus(activity) === false || (!ordinary(root) && !active(item))) return false;
  if (root !== activity) return updates;
  let update = updates.item.find(i => i._id === item.id);
  const changes = {};
  if (f.focusCalendarSeason) changes["flags.spikependium.focusCalendarSeason"] = f.focusCalendarSeason;
  if (f.focusChooseSeason) Object.assign(changes, { "flags.spikependium.focusSeason": f.focusChooseSeason, "flags.spikependium.focusSeasonUntil": game.time.worldTime + 28800 });
  for (const key of ["focusFlame", "focusDrunk"]) if (f[key] !== undefined) changes[`flags.spikependium.${key}`] = f[key];
  if (Object.keys(changes).length) {
    if (!update) updates.item.push(update = { _id: item.id });
    Object.assign(update, changes);
  }
  return finalFocusCharge(item, updates);
}
export async function finalFocusCharge(item, updates) {
  const update = updates.item.find(i => i._id === item.id), spent = update?.["system.uses.spent"] ?? update?.system?.uses?.spent;
  const last = flags(item).focusLastCharge, max = Number(item.system.uses.max);
  if (last && Number.isFinite(spent) && max > 0 && spent === max && item.system.uses.spent < max) {
    const roll = await new CONFIG.Dice.BasicRoll("1d20", {}, { flavor: "Последний заряд магического фокуса" }).evaluate(); updates.rolls.push(roll);
    if (roll.total === 1) { update["flags.spikependium.focusRuin"] = 1; if (last === "destroy") update["system.quantity"] = 0; }
  }
  return updates;
}
export function prepareFocusWeapon(wrapped, ...args) {
  const item = this.parent, id = kind(item);
  if (id) {
    this.magicalBonus = active(item) ? (flags(item).focusWeaponBonus ?? (["reverent", "four-seasons"].includes(id) ? 2 : 0)) : 0;
    if (id === "thwack") { if (active(item)) this.properties.add("fin"); else this.properties.delete("fin"); }
    if (active(item)) this.properties.add("mgc"); else this.properties.delete("mgc");
  }
  return wrapped(...args);
}
export function focusDamageParts(wrapped, config = {}, ...args) {
  const parts = wrapped(config, ...args), item = this.item;
  if (!parts.length || kind(item) !== "four-seasons" || !active(item) || !(item.system.uses.value > 0) || ["thrown", "ranged"].includes(config.attackMode)) return parts;
  const type = ["radiant", "fire", "necrotic", "cold"][focusSeason(item) - 1];
  if (type) {
    const part = { number: 1, denomination: 8, bonus: "", types: [type], custom: { enabled: false, formula: "" }, scaling: { mode: "", number: null, formula: "" } };
    const extra = parts[0].clone(part); extra.base = false; return [...parts, extra];
  }
  return parts;
}
export function focusEffectSuppression(wrapped, ...args) {
  return (kind(this.parent) && !active(this.parent)) || wrapped(...args);
}
export function focusSpellChanges(wrapped, ...args) {
  const changes = wrapped(...args), item = this.item, id = kind(item), f = this.flags?.spikependium ?? {};
  if (!id) return changes;
  if (id === "unbroken-fire" && f.focusCantripDice) changes.push({ key: "activities[attack].damage.parts", type: "override", value: JSON.stringify([{ number: f.focusCantripDice, denomination: 8,
    bonus: "", types: ["fire"], custom: { enabled: false, formula: "" }, scaling: { mode: "", number: null, formula: "" } }]) });
  if (id === "talyard" && f.focusHeroism) changes.push({ key: "activities[heal].healing.custom.formula", type: "override", value: "3" });
  return changes;
}
