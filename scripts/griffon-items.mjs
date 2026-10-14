export function canUseGriffonItem(activity) {
  const key = activity?.item?.flags.spikependium?.key;
  if (!/^item:gs[12]:/.test(key ?? "")) return true;
  const item = activity.item;
  if (!item.actor?.isOwner || !item.system.equipped || (item.system.attunement === "required" && !item.system.attuned)) {
    ui.notifications.warn("Наденьте предмет и завершите необходимую настройку перед применением."); return false;
  }
  if (key === "item:gs2:buoyancy" && !item.actor.statuses.has("prone")) {
    ui.notifications.warn("Эта реакция доступна только при получении состояния Сбитый с ног."); return false;
  }
  return true;
}
export async function finishGriffonUse(activity, config, results) {
  if (activity?.item?.flags.spikependium?.key !== "item:gs2:buoyancy" || !results?.message || !activity.actor?.isOwner) return;
  const relative = foundry.utils.buildRelativeUuid(activity.uuid, activity.actor.uuid);
  if (!activity.actor.effects.some(e => e.active && e.flags.spikependium?.griffonBuoyancy && [activity.uuid, relative].includes(e.system.origin?.activity))) return;
  await activity.actor.toggleStatusEffect("prone", { active: false });
}
export async function griffonUse(wrapped, config, ...args) {
  const results = await wrapped(config, ...args);
  await finishGriffonUse(this, config, results);
  return results;
}
