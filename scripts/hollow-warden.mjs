const KEY = "subclass:hollow-warden:wrath-of-the-wilds";
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const live = e => !e.disabled && !e.duration.expired && !(Number.isFinite(e.duration.remaining) && e.duration.remaining <= 0);
function huntersMark(effect) {
  if (effect.system.type !== "concentrating" || !live(effect)) return false;
  const item = resolve(effect.flags.dnd5e?.item?.uuid) ?? effect.flags.dnd5e?.item?.data;
  return item?.type === "spell" && item.system.identifier === "hunters-mark";
}
export function prepareHollowConcentration(actor, item, data, activity) {
  if (activity?.actor !== actor || activity.item !== item || !actor.isOwner || item.type !== "spell"
    || item.system.identifier !== "hunters-mark" || item.flags.spikependium?.storedSpell
    || !actor.items.some(i => i.flags.spikependium?.key === KEY)) return;
  data.system ??= {}; data.system.changes ??= [];
  data.system.changes.push({ key: "system.attributes.ac.bonus", value: "+ max(1, @abilities.wis.mod)", type: "add", phase: "base",
    conditions: JSON.stringify({ o: "NOT", v: { k: "statuses.antimagic", v: 1 } }) });
  data["flags.spikependium.hollowWrath"] = true;
}
export function hollowArmorSuppression(wrapped, ...args) {
  const source = resolve(this.system.origin?.activity)?.item;
  if (source?.flags.spikependium?.key !== KEY || !this.system.changes.some(c => c.key === "system.attributes.ac.bonus")) return wrapped(...args);
  const actor = this.parent?.actor ?? this.parent;
  const concentrating = actor?.effects?.find(huntersMark);
  // Legacy manual armor works only with an older unmarked Hunter's Mark; new casts already include the bonus.
  return !concentrating || !!concentrating.flags.spikependium?.hollowWrath || actor.statuses.has("antimagic") || wrapped(...args);
}
