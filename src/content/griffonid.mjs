import { speciesItem, feature, folder, ref } from "../../tools/lib/docs.mjs";
import { advItemChoice, advItemGrant, advTrait, spellConfig, srdSpellUuid, cast, attack, dmg, makeId, LR, useActivity } from "../../tools/lib/core.mjs";

export const GRIFFON_CHARACTERS_URL = "https://ruleholder.com/sourcebooks/tgs1/chast-ii-varianty-dlya-personazhey";
const CATS = [
  ["lion", "Лев, пантера или саблезубый тигр", "Detect Evil and Good", "Обнаружение добра и зла"],
  ["tiger", "Гепард, сервал или тигр", "Detect Poison and Disease", "Обнаружение яда и болезней"],
  ["lynx", "Ягуар, рысь или снежный барс", "Detect Magic", "Обнаружение магии"]
];
export function define() {
  const root = folder("species", "Хоумбрю/Сумка грифона — книга 1/Грифонид");
  const options = folder("species", "Хоумбрю/Сумка грифона — книга 1/Грифонид/Выбор наследия");
  const base = { pack: "species", book: "GS1", page: "", sourceUrl: GRIFFON_CHARACTERS_URL,
    img: "icons/creatures/birds/raptor-hawk-flying.webp", folder: options, typeValue: "feat" };
  const grant = (key, level, en, ability) => advItemGrant(key, level, [srdSpellUuid(en)], {
    title: "Заклинание наследия: всегда подготовлено", spell: spellConfig({ abilities: [ability] })
  });
  const free = (key, en, ability, name, minLevel = 1) => cast(key, srdSpellUuid(en), {
    name: `${name}: без ячейки и материалов`, ability, minLevel, properties: ["vocal", "somatic"],
    spellSlot: false, usesMax: 1, usesRecovery: [LR], consume: [useActivity()]
  });
  const heritage = [];
  for (const [ability, label] of [["int", "Интеллект"], ["wis", "Мудрость"], ["cha", "Харизма"]]) {
    const key = `species:griffonid:${ability}`, cats = [];
    for (const [id, name, en, ru] of CATS) {
      const cat = `${key}:${id}`; cats.push(ref(cat));
      feature({ ...base, key: cat, identifier: `griffonid-${ability}-${id}`, name: `Кошачье наследие: ${name} (${label})`,
        desc: `На 3-м уровне персонажа получаете всегда подготовленное заклинание ${ru}. Характеристика — ${label}. Кнопка на этой особенности даёт одно сотворение без ячейки и материального компонента за долгий отдых; выданное заклинание позволяет расходовать обычные ячейки.`,
        advancement: [grant(`${cat}:spell`, 3, en, ability)], acts: [free(cat, en, ability, ru, 3)] });
    }
    heritage.push(ref(key));
    feature({ ...base, key, identifier: `griffonid-${ability}`, name: `Наследие грифонидов: ${label}`,
      desc: `Выбранная характеристика (${label}) общая для всей магии вида. При добавлении выберите птичье и кошачье происхождение. Сойка/сова/ворон: Чудотворство; орёл/сокол/ястреб: Сообщение; кардинал/пересмешник/попугай: Фокусы. Кошачий выбор даёт своё заклинание на 3-м уровне. Опознание доступно сразу, Улучшение характеристики — с 5-го уровня. Все заклинания всегда подготовлены. Каждое уровневое заклинание можно сотворить один раз за долгий отдых без ячейки и материалов или обычным способом за ячейку. Для бесплатного сотворения используйте кнопки наследия.`,
      advancement: [
        advItemChoice(`${key}:bird`, 0, { title: "Птичье наследие: выберите заговор", allowDrops: false, type: "spell", count: 1,
          pool: ["Thaumaturgy", "Message", "Prestidigitation"].map(srdSpellUuid), spell: spellConfig({ abilities: [ability] }) }),
        advItemChoice(`${key}:cat`, 0, { title: "Кошачье наследие", allowDrops: false, pool: cats, count: 1 }),
        grant(`${key}:identify`, 0, "Identify", ability), grant(`${key}:enhance`, 5, "Enhance Ability", ability)
      ], acts: [free(`${key}:identify`, "Identify", ability, "Опознание"), free(`${key}:enhance`, "Enhance Ability", ability, "Улучшение характеристики", 5)] });
  }
  const claws = "species:griffonid:claws", speech = "species:griffonid:speech";
  feature({ ...base, folder: root, typeValue: "race", key: claws, identifier: "griffonid-claws", name: "Когти грифонида",
    desc: "Ваш безоружный удар может наносить 1к6 колющего урона плюс модификатор Силы. Это отдельная штатная атака; иные особенности, разрешающие другую характеристику, учитывайте при броске.",
    acts: [attack(claws, { name: "Когти — безоружный удар", activation: "action", ability: "str", classification: "unarmed", includeBase: false, range: 5, count: 1, affects: "creature", damage: [dmg("1d6 + @mod", "piercing")], spellSlot: false })] });
  feature({ ...base, folder: root, typeValue: "race", key: speech, identifier: "griffonid-kindred", name: "Родственная речь и прирождённый творец",
    desc: "Вы передаёте простые понятия птицам и кошачьим размером не больше Большого, включая грифонов; обратного понимания это не даёт. Преимущество к Мудрости (Уход за животными) и проверкам Харизмы для влияния на них выбирайте только в подходящей ситуации. Получаете владение двумя ремесленными инструментами; обучение новому инструменту занимает вдвое меньше времени. Срок обучения и подходящих существ определяет Мастер." });
  speciesItem({ key: "species:griffonid", identifier: "griffonid", name: "Грифонид", book: "GS1", page: "", sourceUrl: GRIFFON_CHARACTERS_URL,
    folder: folder("species", "Хоумбрю/Сумка грифона — книга 1"), img: base.img,
    desc: "Авторский вид из Сумки грифона, книга 1 (редакция 2024). Гуманоид, Средний, скорость 30 футов, тёмное зрение 60 футов. При добавлении выберите общую характеристику магического наследия, затем птицу, кошку и два ремесленных инструмента. Наследие выдаёт заклинания на уровнях персонажа 1, 3 и 5; отдельные бесплатные сотворения восстанавливаются после долгого отдыха. Полные правила и внешний вид приведены по ссылке источника.",
    advancement: [
      { _id: makeId("adv:griffonid:size"), type: "Size", configuration: { sizes: ["med"] }, value: { size: "" }, level: 0, title: "Средний размер", hint: "" },
      advItemGrant("griffonid:traits", 0, [ref(claws), ref(speech)], { title: "Особенности грифонида" }),
      advItemChoice("griffonid:ability", 0, { title: "Характеристика наследия: Интеллект, Мудрость или Харизма", allowDrops: false, pool: heritage, count: 1 }),
      advTrait("griffonid:tools", 0, { title: "Два ремесленных инструмента", choices: [{ count: 2, pool: ["tool:art:*"] }] })
    ] });
}
