// Spikependium — интеграция с системой dnd5e и модулем Babele.
import { SPELL_LISTS, SOURCE_BOOKS } from "./generated.mjs";
import { prepareSummon, canRefuel } from "./summons.mjs";

const MODULE_ID = "spikependium";

Hooks.on("dnd5e.preSummonToken", prepareSummon);
Hooks.on("dnd5e.preUseActivity", activity => {
  if (canRefuel(activity)) return;
  ui.notifications.warn("Кольцо восстанавливает только потраченную ячейку 1–3 уровня.");
  return false;
});

Hooks.once("init", () => {
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
