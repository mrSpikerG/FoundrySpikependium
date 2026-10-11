// Spikependium — интеграция с системой dnd5e и модулем Babele.
import { SPELL_LISTS, SOURCE_BOOKS } from "./generated.mjs";
import { prepareSummon, canRefuel, hasReanimatedCompanion } from "./summons.mjs";
import { prepareFeatSave, preparePactUsage, prepareGrantedSpell, prepareAbilityAdvancement, prepareFormConsumption, toggleRadiantLight, conditionalState, applyTurnLimit } from "./mechanics.mjs";
import { prepareChoiceDialog, applyChoiceConsumption } from "./choices.mjs";
import { prepareAuraCondition, refreshSceneAuras, endEffectsOnDamage } from "./effects.mjs";

const MODULE_ID = "spikependium";

Hooks.on("dnd5e.preSummonToken", prepareSummon);
Hooks.on("preCreateItem", prepareGrantedSpell);
Hooks.on("dnd5e.preAdvancementManagerRender", prepareAbilityAdvancement);
Hooks.on("dnd5e.preActivityConsumption", prepareFormConsumption);
Hooks.on("updateToken", refreshSceneAuras);
Hooks.on("canvasReady", refreshSceneAuras);
for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) Hooks.on(hook, refreshSceneAuras);
Hooks.on("dnd5e.applyDamage", (actor, damage) => {
  endEffectsOnDamage(actor, damage).catch(error => console.error("Spikependium: снятие эффектов после урона", error));
});
Hooks.on("dnd5e.activityConsumption", (activity, config, message, updates) => {
  if (applyChoiceConsumption(activity, config, message, updates) === false) return false;
  return applyTurnLimit(activity, config, message, updates);
});
Hooks.on("dnd5e.postUseActivity", activity => {
  if (activity.flags?.spikependium?.action !== "radiant-light") return;
  toggleRadiantLight(activity).catch(error => {
    console.error("Spikependium: не удалось переключить свет оружия", error);
    ui.notifications.error("Не удалось переключить свет оружия. Подробности в консоли.");
  });
});
Hooks.on("dnd5e.preUseActivity", (activity, config, dialog) => {
  if (activity.type === "summon" && hasReanimatedCompanion(activity, game.scenes)) {
    ui.notifications.warn("У вас уже есть живой Реанимированный спутник. Сначала отзовите его.");
    return false;
  }
  prepareChoiceDialog(activity, config, dialog);
  prepareFeatSave(activity);
  if (!preparePactUsage(activity, config)) {
    ui.notifications.warn("Уровень ячейки Магии договора ниже требуемого для этого действия.");
    return false;
  }
  if (canRefuel(activity)) return;
  ui.notifications.warn("Кольцо восстанавливает только потраченную ячейку 1–3 уровня.");
  return false;
});

Hooks.once("init", () => {
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.getRollData", function(wrapped, ...args) {
    const data = wrapped(...args);
    data.spikependium = conditionalState(this, data);
    return data;
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.ActiveEffect.dataModels.base.prototype.evaluateCondition", prepareAuraCondition, "WRAPPER");
  const cfg = CONFIG.DND5E;

  // Источники (книги) для поля «Источник» на листах предметов.
  Object.assign(cfg.sourceBooks, SOURCE_BOOKS);

  // Новые категории черт из UA.
  cfg.featureTypes.feat.subtypes.dragonmark = `${MODULE_ID}.FeatType.Dragonmark`;
  cfg.featureTypes.feat.subtypes.wildTalent = `${MODULE_ID}.FeatType.WildTalent`;
  cfg.featureTypes.feat.subtypes.villainousPath = `${MODULE_ID}.FeatType.VillainousPath`;
  cfg.featureTypes.class.subtypes.psionicDiscipline = `${MODULE_ID}.FeatureType.PsionicDiscipline`;

  // Спутники-конструкты/нежить из подклассов используют стандартные типы, дополнительных не требуется.

  // Списки заклинаний Изобретателя и Псионика (и дополнения к спискам других классов).
  for ( const uuid of SPELL_LISTS ) dnd5e.registry.spellLists.register(uuid);
});

// Регистрация переводов компендиумов в Babele: базовые имена хранятся на английском (оригинал UA),
// Babele подставляет русские названия и умеет показывать оригинал рядом (настройка Babele «Показывать оригинальное имя»).
Hooks.once("babele.init", babele => {
  babele.register({ module: MODULE_ID, lang: "ru", dir: "babele/ru" });
});
