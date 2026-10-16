import { griffonTwoUse } from "./griffon-two-items.mjs";
import { finishGriffonWearableUse } from "./griffon-wearables.mjs";
import { finishGriffonArmorUse } from "./griffon-armor.mjs";
import { finishSweetUse, sweetUse } from "./griffon-sweets.mjs";
import { finishGriffonWeaponUse } from "./griffon-weapons.mjs";
import { hasGriffonClass } from "./griffon-rings.mjs";
import { shieldUnheldUse, finishGriffonShieldUse } from "./griffon-two-shields.mjs";
import { finishGriffonTwoArmorUse } from "./griffon-two-armor.mjs";
import { armorUnattunedUse, wildskinUse, finishConditionalArmorUse } from "./griffon-conditional-armor.mjs";
import { myceliaUnattunedUse, finishMyceliaUse } from "./griffon-mycelia.mjs";
import { finishArtifactArmorUse } from "./griffon-artifact-armor.mjs";
import { finishTwoWeaponUse } from "./griffon-two-weapons.mjs";
import { validRiptideWave } from "./griffon-riptide.mjs";
import { whispersCastingUse } from "./griffon-focus-casting.mjs";
import { staffFollowupUse } from "./griffon-staff-followups.mjs";
import { thwackUse } from "./griffon-thwack.mjs";
import { arcanistSpellUse } from "./arcanist-casting.mjs";
import { finishCloakUse } from "./griffon-two-cloaks.mjs";
import { potionBreakUse } from "./potion-belt-breakage.mjs";
import { beltUse } from "./griffon-two-belts.mjs";
import { bootsUnattunedUse, bootsUse } from "./griffon-two-boots.mjs";
import { homewardUse } from "./homeward-boots.mjs";

export function canUseGriffonItem(activity, config = {}) {
  if (validRiptideWave(activity, config)) return true;
  activity = activity?.getLinkedActivity?.() ?? activity;
  const key = activity?.item?.flags.spikependium?.key;
  if (!/^item:gs[12]:/.test(key ?? "")) return true;
  const item = activity.item;
  const ordinaryWeapon = !!(item.flags.spikependium?.griffonTwoWeapon || item.flags.spikependium?.griffonFocus) && item.type === "weapon" && activity.type === "attack";
  if (!ordinaryWeapon && !bootsUnattunedUse(activity) && !hasGriffonClass(item)) {
    ui.notifications.warn("Предмет требует настройки представителем указанного класса."); return false;
  }
  const unheld = shieldUnheldUse(activity), refill = item.flags.spikependium.griffonTwoShield === "storm-eye" && activity.flags?.spikependium?.stormRefill;
  if (!item.actor?.isOwner || (item.type !== "consumable" && !item.system.equipped && !unheld) || (item.system.attunement === "required" && !item.system.attuned && !refill && !ordinaryWeapon && !armorUnattunedUse(activity) && !myceliaUnattunedUse(activity) && !bootsUnattunedUse(activity))) {
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
  await finishCloakUse(activity, config, results);
  await finishGriffonWearableUse(activity, results);
  await finishGriffonArmorUse(activity, results);
  await finishSweetUse(activity, results);
  await finishGriffonWeaponUse(activity, results);
  await finishGriffonShieldUse(activity, results);
  await finishGriffonTwoArmorUse(activity, results);
  await finishConditionalArmorUse(activity, config, results);
  await finishMyceliaUse(activity, config, results);
  await finishArtifactArmorUse(activity, config, results);
  await finishTwoWeaponUse(activity, results);
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
  const use = async (...forward) => {
    const results = await griffonTwoUse.call(this, wrapped, ...forward);
    await finishGriffonUse(this, config, results);
    return results;
  };
  const preparedUse=(...forward)=>thwackUse.call(this, (...parry) => staffFollowupUse.call(this, (...followup) => whispersCastingUse.call(this, (...casting) => wildskinUse.call(this, (...next) => sweetUse.call(this, use, ...next), ...casting), ...followup), ...parry), ...forward);
  return homewardUse.call(this,(...home)=>bootsUse.call(this,(...boots)=>potionBreakUse.call(this,(...breakage)=>beltUse.call(this,(...belt)=>arcanistSpellUse.call(this,preparedUse,...belt),...breakage),...boots),...home),config,...args);
}
