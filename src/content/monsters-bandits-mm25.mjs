import { folder, npc } from "../../tools/lib/docs.mjs";
import { armor, weapon } from "./monsters-assassins-bugbears-mm25.mjs";

export function define() {
  const scimitar = weapon("mm25:bandit:scimitar", "Скимитар", "bandit-scimitar", "scimitar", "1d6", "slashing", "dex", 5, null);
  scimitar.desc += " Бросок атаки +3; попадание: 1к6 + 1 режущего урона.";
  const crossbow = weapon("mm25:bandit:crossbow", "Лёгкий арбалет", "bandit-crossbow", "lightcrossbow", "1d8", "piercing", "dex", null, [80, 320]);
  crossbow.desc += " Бросок атаки +3; попадание: 1к8 + 1 колющего урона. Запас болтов в книге не задан: выберите имеющиеся боеприпасы в штатном окне атаки. Система расходует выбранный болт; обычная отмена расхода возвращает его.";
  npc({ key: "actor:mm25:bandit", name: "Бандит", en: "Bandit", book: "MM25", page: 23,
    folder: folder("creatures", "Энциклопедия чудовищ (2025)/Бандиты"), img: "icons/skills/melee/strike-sword-slashing-red",
    creatureType: "humanoid", size: "med", alignment: "Нейтральный", disposition: 0,
    ac: 12, hp: 11, hpFormula: "2d8+2", cr: 0.125, movement: { walk: 30 },
    abilities: { str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10 }, languages: ["common", "cant"],
    habitatCustom: "Любая", treasure: ["any"],
    bio: "<p>Преступники, головорезы и наёмники вне закона добиваются своего угрозами. Их мотивами могут быть жадность, несправедливые законы, нужда или принуждение главаря.</p><p>Блок допускает Средний или Небольшой размер: по умолчанию выбран Средний. Для Небольшого измените размер существа и токена на листе. КБ 12; ПЗ 11 (2к8 + 2); инициатива +1 (11); пассивное Внимание 10. Скимитар, лёгкий арбалет и кожаный доспех имеют цену и вес обычных предметов 2024 года.</p>",
    items: [scimitar, crossbow, armor("leather", "Кожаный доспех")] });
}
