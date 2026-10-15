import { feature, folder, table } from "../../tools/lib/docs.mjs";
import { attack, save, utility, teleport, dmg, effect, change, useItem } from "../../tools/lib/core.mjs";

export const ALCHEMIST_URL = "https://janglep.github.io/homebrew/class/395-alchemist/index.html";
export const ALCHEMIST_SAVE_DC = "8 + @prof + @abilities.int.mod + @spikependium.alchemistBombDC";
// Rules data; specialization-only formulas are granted separately, never offered in this pool.
export const ALCHEMIST_FORMULAS = [
  { id: "stink", name: "Бомба-вонючка", die: 8, type: "poison", save: "con", effect: "checks" },
  { id: "seeking", name: "Бомба поиска", die: 6, type: "fire", save: "dex", pending: "Близкий противник: исключить помеху вручную." },
  { id: "laughing", name: "Бомба с веселящим газом", die: 6, type: "poison", save: "con", effect: "prone", pending: "Иммунитет к падению: 24 часа, вручную." },
  { id: "withering", name: "Бомба увядания", die: 8, type: "necrotic", save: "con", effect: "withering" },
  { id: "smoke", name: "Дымовая бомба", die: null, radius: 10, pending: "Дым: сильная заслонённость; max(1, Интеллект) раундов; ветер ≥10 миль/ч; повтор через минуту. Контроль вручную." },
  { id: "sonic", name: "Звуковая бомба", die: 6, type: "thunder", save: "con", effect: "deafened" },
  { id: "incendiary", name: "Зажигательная бомба", die: 6, type: "fire", save: "dex", pending: "Огонь до начала вашего хода; конец хода внутри: половина исходного урона. Контроль вручную." },
  { id: "acid", name: "Кислотная бомба", die: 4, type: "acid", save: "dex", pending: "Повторить полученный урон в конце следующего хода вручную." },
  { id: "thorns", name: "Колючая бомба", die: null, pending: "Заросли: минута; труднопроходимость; лежащим — Атлетика против Сл бомбы для движения. Контроль вручную." },
  { id: "oil", name: "Маслянистая бомба", die: null, pending: "Масло: следующий огонь +к6/исходную кость, максимум ceil(уровень/2); смывается галлоном воды. Контроль вручную." },
  { id: "freezing", name: "Морозящая бомба", die: 8, type: "cold", save: "con", effect: "slow" },
  { id: "nonlethal", name: "Несмертельная бомба", die: 8, type: "bludgeoning", save: "dex", pending: "0 хитов: без сознания, стабилен; взрыв игнорирует частичное укрытие. Контроль вручную." },
  { id: "fragmentation", name: "Осколочная бомба (EfC)", die: 10, type: "piercing", save: "dex", efc: true },
  { id: "underwater", name: "Подводная бомба (EfC)", die: 10, type: "fire", save: "dex", efc: true, pending: "Водные штрафы исключите вручную." },
  { id: "prismatic", name: "Призматическая бомба", die: 8, type: ["radiant", "acid", "fire", "cold", "lightning", "poison"], save: ["dex", "con", "wis"] },
  { id: "psychic", name: "Псионическая бомба", die: 6, type: "psychic", save: "wis", effect: "concentration" },
  { id: "slashing", name: "Режущая бомба (EfC)", die: 10, type: "slashing", save: "dex", efc: true },
  { id: "holy", name: "Святая бомба", die: 8, type: "radiant", save: "dex" },
  { id: "teleporting", name: "Телепортирующая бомба", die: null },
  { id: "thermobaric", name: "Термобарическая бомба", die: 6, type: "fire", save: "dex", radius: 10 },
  { id: "silent", name: "Тихая бомба", die: 8, type: "fire", save: "dex", pending: "Слышимость: 10 футов; обнаружение места взрыва — помеха. Контроль вручную." },
  { id: "impact", name: "Ударная бомба", die: 8, type: "force", save: "dex", pending: "Оттолкнуть от эпицентра на 5 футов вручную." },
  { id: "enhanced", name: "Усиленная бомба (EfC)", die: 10, type: "bludgeoning", save: "dex", efc: true },
  { id: "electric", name: "Электрическая бомба", die: 8, type: "lightning", save: "dex", effect: "reactions" }
];

const scale = die => `@scale.alchemist.${die === 10 ? "bomb" : `bomb-d${die}`}`;
export function alchemistBombActivity(activity, charged = true) {
  activity.flags = { ...activity.flags, spikependium: { ...activity.flags?.spikependium, alchemistBomb: { charged } } };
  return activity;
}
export function alchemistSplashActivity(activity) {
  activity.flags = { ...activity.flags, spikependium: { ...activity.flags?.spikependium, alchemistSplash: true } };
  return activity;
}
export function define() {
  for (const formula of ALCHEMIST_FORMULAS) {
    const { id, name, die, type } = formula, prefix = `alchemist:formula:${id}`, radius = formula.radius ?? 7.5;
    const properties = {
      checks: { changes: [change("system.rolls.ability.check.mode", -1)] },
      prone: { statuses: ["prone"] },
      withering: { flags: { spikependium: { alchemistWithering: true } } },
      deafened: { statuses: ["deafened"] },
      slow: { changes: [change("system.attributes.movement.bonus", -10)] },
      concentration: { changes: [change("system.attributes.concentration.roll.mode", -1)], conditions: { k: "attributes.concentration.ability", o: "in", v: ["", "con"] } },
      reactions: { flags: { spikependium: { noReactions: true } } }
    }[formula.effect];
    const fx = properties ? effect(prefix, { name, transfer: false, ...(formula.effect === "prone" ? {} : { expiry: "targetEnd" }), ...properties }) : null;
    const costs = { spellSlot: false, consume: [useItem("feat:alchemist-bombs")] };
    const acts = [], effects = fx ? [fx] : [];
    const dice = id === "holy" ? [[8, "Обычная цель"], [6, "Небожитель"], [12, "Нежить или исчадие"]] : [[die, ""]];
    for (const [faces, label] of dice) if (faces) for (const ability of ["dex", "str"]) for (const damageAbility of [ability, "int"]) {
      acts.push(alchemistBombActivity(attack(`${prefix}:${faces}:${ability}:${damageAbility}`, { name: `Заряженная бомба: ${ability === "dex" ? "Ловкость" : "Сила"}${damageAbility === "int" ? " → урон от Интеллекта" : ""}${label ? ` — ${label}` : ""}`,
        activation: "action", ability, attackType: "ranged", range: 30, count: 1, affects: "creature", includeBase: false,
        damage: [dmg(`${scale(faces)} + @abilities.${damageAbility}.mod`, type)], effects: fx ? [fx._id] : [], ...costs })));
    }
    if (!die) acts.push(alchemistBombActivity(id === "teleporting"
      ? teleport(`${prefix}:throw`, { name: "Бросить бомбу и телепортироваться", activation: "action", distance: 30, ...costs })
      : utility(`${prefix}:throw`, { name: "Бросить заряженную бомбу", activation: "action", range: 90, affects: "space", template: { type: "sphere", size: radius }, ...costs })));
    if (formula.save) acts.push(alchemistSplashActivity(save(`${prefix}:splash`, { name: "Взрыв: спасбросок остальных целей", activation: "special", range: 90,
      ability: formula.save, dc: ALCHEMIST_SAVE_DC, template: { type: "sphere", size: radius }, affects: "creature", effects: fx ? [fx._id] : [], onSave: "none", spellSlot: false })));
    if (formula.efc) acts.push(utility(`${prefix}:prepare`, { name: "Подготовить формулу (EfC)", activation: "bonus", self: true, spellSlot: false }));
    let extra = "";
    if (id === "prismatic") {
      acts.push(...["damage", "save"].map(roll => utility(`${prefix}:random:${roll}`, { name: roll === "damage" ? "Случайный вид урона" : "Случайный спасбросок", roll: "1d6", spellSlot: false })));
      extra = table("Случайные параметры: результаты применяются вручную", ["к6", "Урон", "Спасбросок"],
        [[1, "Излучение", "Ловкость"], [2, "Кислота", "Ловкость"], [3, "Огонь", "Телосложение"], [4, "Холод", "Телосложение"], [5, "Электричество", "Мудрость"], [6, "Яд", "Мудрость"]]);
    }
    feature({ key: prefix, identifier: `alchemist-formula-${id}`, name, pack: "classes", level: 2, levelClass: "alchemist", requirements: "Алхимик: известная формула",
      folder: folder("classes", `Алхимик (Valda)/Формулы/${formula.efc ? "Дополнения EfC" : "Общие"}`), book: formula.efc ? "EfC" : "VSS", page: "", sourceUrl: ALCHEMIST_URL,
      img: "icons/tools/laboratory/vials-blue-pink", acts, effects,
      desc: `Штатные кнопки для изученной формулы. Расходуется общий запас бомб. Зарядка имеет общий для всех формул предел раз за ход. Взрыв предлагает выбрать карточку урона оплаченной попавшей бомбы и использует половину исходного результата при провале, ноль при успехе, без нового броска. Основная цель и повторный взрыв исключаются; отмена оплаты делает старую карточку недействительной. Допустимые цели в радиусе, применение формулы и дополнительные условия пока контролируются вручную. Профиль эффекта применяйте к попавшей основной цели и провалившим спасбросок остальным целям.${formula.efc ? " Подготовка требует бонусного действия." : ""}${formula.pending ? `\n\n${formula.pending}` : ""}\n\nПолное правило: <a href="${ALCHEMIST_URL}">${name}</a>.${extra ? `\n\n${extra}` : ""}`
    });
  }
}
