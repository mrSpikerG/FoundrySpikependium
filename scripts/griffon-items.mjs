import { griffonTwoUse } from "./griffon-two-items.mjs";
import { finishGriffonWearableUse } from "./griffon-wearables.mjs";
import { finishGriffonArmorUse } from "./griffon-armor.mjs";
import { finishSweetUse, sweetUse } from "./griffon-sweets.mjs";
import { finishGriffonWeaponUse } from "./griffon-weapons.mjs";

export function canUseGriffonItem(activity) {
  activity = activity?.getLinkedActivity?.() ?? activity;
  const key = activity?.item?.flags.spikependium?.key;
  if (!/^item:gs[12]:/.test(key ?? "")) return true;
  const item = activity.item;
  const required = item.flags.spikependium.griffonClass;
  if (required && !(item.actor?.classes?.[required]?.system.levels > 0)) {
    ui.notifications.warn("Предмет требует настройки представителем указанного класса."); return false;
  }
  if (!item.actor?.isOwner || (item.type !== "consumable" && !item.system.equipped) || (item.system.attunement === "required" && !item.system.attuned)) {
    ui.notifications.warn("Наденьте предмет и завершите необходимую настройку перед применением."); return false;
  }
  if (key === "item:gs1:seething" && activity.flags?.spikependium?.seethingType && item.flags.spikependium.seethingType) {
    ui.notifications.warn("Тип существ уже выбран для этой настройки. Новый выбор доступен после её прекращения и новой настройки."); return false;
  }
  if (key === "item:gs2:buoyancy" && !item.actor.statuses.has("prone")) {
    ui.notifications.warn("Эта реакция доступна только при получении состояния Сбитый с ног."); return false;
  }
  return true;
}
export async function finishGriffonUse(activity, config, results) {
  await finishGriffonWearableUse(activity, results);
  await finishGriffonArmorUse(activity, results);
  await finishSweetUse(activity, results);
  await finishGriffonWeaponUse(activity, results);
  const choice = activity?.flags?.spikependium?.seethingType;
  if (activity?.item?.flags.spikependium?.key === "item:gs1:seething" && results?.message && activity.actor?.isOwner
    && !activity.item.flags.spikependium.seethingType
    && ["aberration", "celestial", "dragon", "elemental", "fey", "fiend", "undead"].includes(choice))
    await activity.item.setFlag("spikependium", "seethingType", choice);
  if (activity?.item?.flags.spikependium?.key !== "item:gs2:buoyancy" || !results?.message || !activity.actor?.isOwner) return;
  const relative = foundry.utils.buildRelativeUuid(activity.uuid, activity.actor.uuid);
  if (!activity.actor.effects.some(e => e.active && e.flags.spikependium?.griffonBuoyancy && [activity.uuid, relative].includes(e.system.origin?.activity))) return;
  await activity.actor.toggleStatusEffect("prone", { active: false });
}
export async function griffonUse(wrapped, config, ...args) {
  return sweetUse.call(this, async (...forward) => {
    const results = await griffonTwoUse.call(this, wrapped, ...forward);
    await finishGriffonUse(this, config, results);
    return results;
  }, config, ...args);
}
