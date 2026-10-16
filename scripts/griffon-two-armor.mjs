const family = item => item?.flags?.spikependium?.griffonTwoArmor;
const worn = item => item?.system.equipped && (item.system.attunement !== "required" || item.system.attuned);
const owned = (actor, id) => actor?.items?.find(i => family(i) === id && worn(i));
const locks = new Set(), ranges = new WeakMap();
const saveActor = message => message?.getAssociatedActor?.();
function failedConstitution(message, actor) {
  return message?.type === "save" && message.system.ability === "con" && !message.system.forceSuccess && !message.system.resisted
    && message.rolls?.some(r => r.isFailure) && saveActor(message)?.uuid === actor?.uuid;
}
export function prepareGriffonTwoArmorUpdates(activity, config, updates) {
  const root = activity.getLinkedActivity?.(config.cause?.activity) ?? activity, flags = root.flags?.spikependium ?? {};
  if (!family(root.item)) return updates;
  if (flags.griffonArmorPaid || flags.griffonArmorActivityPaid) {
    const change = updates.item.find(i => i._id === root.item.id);
    const spent = flags.griffonArmorActivityPaid ? root.uses.spent : root.item.system.uses.spent;
    const value = flags.griffonArmorActivityPaid ? change?.[`system.activities.${root.id}.uses.spent`] ?? change?.[`system.activities.${root.id}`]?.uses?.spent
      ?? (root === activity ? updates.activity?.["uses.spent"] ?? updates.activity?.uses?.spent : undefined) : change?.["system.uses.spent"];
    if (value !== spent + 1) return false;
  }
  if (flags.owlbearSuccess) {
    const message = config.spikependium?.owlbearSave && fromUuidSync(config.spikependium.owlbearSave, { strict: false });
    if (!root.actor?.isOwner || !worn(root.item) || !failedConstitution(message, root.actor)) return false;
  }
  return updates;
}
export async function chooseOwlbearSuccess(message) {
  const actor = saveActor(message);
  if (!actor?.isOwner || message.author?.id !== game.user.id || !failedConstitution(message, actor)) return;
  const item = owned(actor, "owlbear");
  if (!item || !(item.system.uses.value > 0) || locks.has(actor.uuid)) return;
  locks.add(actor.uuid);
  try {
    if (!await foundry.applications.api.DialogV2.confirm({ window: { title: "Доспех из совомеда" }, content: "<p>Этот провал Телосложения вызван враждебным источником? Заменить его успехом и потратить применение доспеха до рассвета?</p>" })) return;
    if (!actor.isOwner || actor.items.get(item.id) !== item || !worn(item) || !(item.system.uses.value > 0) || !failedConstitution(message, actor)) return;
    const activity = item.system.activities.find(a => a.flags.spikependium?.owlbearSuccess);
    if (!activity) return;
    const result = await activity.use({ configure: false, spikependium: { owlbearSave: message.uuid } });
    if (!result?.message) return;
    // shortcut: native resource and original save are separate documents; undoing a published result remains manual.
    await message.update({ "system.resisted": true, "flags.spikependium.owlbearSuccess": { item: item.uuid, usage: result.message.uuid } });
  } finally { locks.delete(actor.uuid); }
}
export function anglerNetRange(wrapped, keyPath, ...args) {
  if (keyPath !== "range") return wrapped(keyPath, ...args);
  const previous = ranges.get(this.range);
  if (previous) for (const [key, values] of Object.entries(previous)) {
    const current = Number(this.range[key]);
    if (current === Number(values.after) || (key === "value" && current === Number(previous.long?.after))) this.range[key] = values.before;
  }
  const result = wrapped(keyPath, ...args);
  ranges.delete(this.range);
  const item = this.item, net = item?.type === "weapon" ? item.system.type.baseItem === "net"
    : item?.type === "equipment" && (item.system.identifier === "net" || item._stats?.compendiumSource === "Compendium.dnd5e.equipment24.Item.phbagNet00000000");
  if (!net || !["attack", "save"].includes(this.type) || !owned(item.actor, "angler") || !["ft", "m"].includes(this.range.units)) return result;
  const changed = {};
  for (const key of ["value", "long"]) {
    const value = Number(this.range[key]);
    if (!(value > 0)) continue;
    changed[key] = { before: this.range[key], after: String(value * 2) }; this.range[key] = changed[key].after;
  }
  ranges.set(this.range, changed);
  return result;
}
const sourceItem = (e, actor) => e.system?.origin?.activity && fromUuidSync(e.system.origin.activity, { relative: actor, strict: false })?.item;
export async function finishGriffonTwoArmorUse(activity, results) {
  if (!results?.message || !activity.actor?.isOwner || family(activity.item) !== "icarus" || !activity.flags?.spikependium?.icarusEnd) return;
  const ids = activity.actor.effects.filter(e => e.flags.spikependium?.griffonIcarusGlide && sourceItem(e, activity.actor)?.uuid === activity.item.uuid).map(e => e.id);
  if (ids.length) await activity.actor.deleteEmbeddedDocuments("ActiveEffect", ids);
}
let cleaning = false;
export async function cleanGriffonTwoArmor() {
  if (cleaning || (game.users.activeGM && !game.user.isActiveGM)) return;
  cleaning = true;
  try {
    const actors = new Map([...game.actors, ...(canvas?.tokens?.placeables ?? []).map(t => t.actor)].filter(Boolean).map(a => [a.uuid, a]));
    for (const actor of actors.values()) {
      if (!actor.isOwner) continue;
      const ids = actor.effects.filter(e => e.flags.spikependium?.griffonIcarusGlide && !worn(sourceItem(e, actor))).map(e => e.id);
      if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    }
  } finally { cleaning = false; }
}
