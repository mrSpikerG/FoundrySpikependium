import inventory from "../../tools/data/arcana-background-gear.json" with { type: "json" };
import { advASI, advTrait, advItemGrant, makeId, srdItemUuid } from "../../tools/lib/core.mjs";
import { backgroundItem, folder, ref, startingEquipmentAB } from "../../tools/lib/docs.mjs";

const URL = "https://ruleholder.com/sourcebooks/au/varianty-dlya-personazhey";
const ABILITIES = { str: "Сила", dex: "Ловкость", con: "Телосложение", int: "Интеллект", wis: "Мудрость", cha: "Харизма" };
// Выбор типа инструмента использует тот же фильтр владения, что штатное стартовое снаряжение.
const gaming = { category: "game", name: "Игровой набор на выбор" };
const artisan = { category: "art", name: "Инструменты ремесленника на выбор" };
export const ARCANA_BACKGROUNDS = [
  { id: "ninth-quill-agent", name: "Агент Девятого пера", abilities: ["dex", "int", "cha"], feat: "arcane-infiltrator",
    skills: ["slt", "arc"], tools: ["tool:thief"], gold: 17,
    gear: ["Dagger", "Light Hammer", "Thieves' Tools", "Spikes, Iron", "Rope", "Clothes, Traveler's"],
    story: "Вы обучались краже магических секретов и реликвий, сочетая взлом с магическими уловками." },
  { id: "phantasmagoria-performer", name: "Артист Фантасмагорического цирка", abilities: ["dex", "con", "cha"], feat: "magic-artist",
    skills: ["prf", "dec"], tools: ["tool:disg"], gold: 12,
    gear: ["Disguise Kit", gaming, "Costume", "Mirror", "Clothes, Traveler's"],
    story: "Работа в странствующем магическом цирке научила вас выступать, обманывать зрение и создавать иллюзии." },
  { id: "familiar-trainer", name: "Дрессировщик фамильяров", abilities: ["con", "int", "wis"], feat: "familiar-friend",
    skills: ["ani", "arc"], toolChoice: "tool:game:*", gold: 44,
    gear: ["Quarterstaff", { ...gaming, proficient: true }, "Bedroll", "Bell", "String", "Tinderbox", "Clothes, Traveler's", "Waterskin"],
    story: "Фамильяр сопровождает вас с детства; вы привыкли заботиться о нём и действовать вместе." },
  { id: "grave-covenant-recruit", name: "Новобранец Могильного завета", abilities: ["str", "int", "wis"], feat: "magic-undertaker",
    skills: ["his", "med"], tools: ["tool:herb"], gold: 16,
    gear: ["Dagger", "Herbalism Kit", "Book", "Shovel"],
    story: "Вы исследовали анатомию, некромантию и способы лечения в обществе учёных, посвятивших себя тайнам смерти. Стартовая книга посвящена анатомии." },
  { id: "crucible-stormchaser", name: "Охотник за бурями Горнила", abilities: ["str", "con", "int"], feat: "magic-overloaded",
    skills: ["ath", "nat"], tools: ["tool:art:glassblower"], gold: 15,
    gear: ["Glassblower's Tools", "Backpack", "Rope", "Clothes, Traveler's"],
    story: "Опасные опыты и изучение магических катастроф стали вашим обычным занятием среди Хранителей горнила." },
  { id: "warding-hands-ward", name: "Подопечный Оберегающих дланей", abilities: ["con", "wis", "cha"], feat: "magic-ward",
    skills: ["med", "ins"], tools: ["tool:art:cook"], gold: 40,
    gear: ["Cook's Utensils", "Blanket", "Healer's Kit", "Lamp", ["Oil", 3], "Tinderbox", "Clothes, Traveler's", "Waterskin"],
    story: "Получив помощь Оберегающих дланей, вы освоили защитную магию и теперь можете помогать другим." },
  { id: "cosmic-dawn-subject", name: "Подопытный Космического рассвета", abilities: ["str", "dex", "con"], feat: "transformed-anatomy",
    skills: ["ath", "sur"], toolChoice: "tool:art:*", gold: 30,
    gear: [{ ...artisan, proficient: true }, "Backpack", "Robe", "Clothes, Traveler's"],
    story: "Опыты с превращением изменили ваше тело. Добровольно или случайно оказавшись их участником, вы научились пользоваться необычной анатомией." },
  { id: "horizon-weavers-initiate", name: "Посвящённый Ткачей горизонта", abilities: ["dex", "con", "wis"], feat: "portal-hopper",
    skills: ["acr", "sur"], tools: ["tool:art:weaver"], gold: 18,
    gear: ["Shortbow", ["Arrows", 20], "Weaver's Tools", "Map", "Quiver", "Rope", "Clothes, Traveler's"],
    story: "В странствиях вы встретили Ткачей горизонта и освоили у них основы телепортации." },
  { id: "seer-apprentice", name: "Ученик провидца", abilities: ["int", "wis", "cha"], feat: "magic-omen",
    skills: ["his", "ins"], tools: ["tool:navg"], gold: 11,
    gear: ["Navigator's Tools", ["Candle", 8], "Ink", "Ink Pen", ["Parchment", 9], "Pouch", "Tinderbox", "Clothes, Traveler's"],
    story: "Провидцы моря и неба обучили вас толкованию знамений. Знания из их библиотек помогают вам давать советы в путешествиях." },
  { id: "gemstone-conclave-spy", name: "Шпион Самоцветного конклава", abilities: ["dex", "wis", "cha"], feat: "magic-speaker",
    skills: ["prc", "dec"], tools: ["tool:disg"], gold: 5,
    gear: ["Disguise Kit", "Clothes, Fine", "Perfume"],
    story: "Под личиной придворного, артиста или посредника вы собираете сведения, применяя обаяние и магию очарования." }
];

export function define() {
  const F = folder("classes", "Неудержимая магия/Предыстории");
  for (const b of ARCANA_BACKGROUNDS) {
    const key = `background:au-${b.id}`;
    const gear = b.gear.map(entry => {
      if (entry.category) return { category: entry.category, proficient: !!entry.proficient };
      const [name, count] = Array.isArray(entry) ? entry : [entry];
      const uuid = inventory.gear.find(g => g.name === name)?.uuid ?? srdItemUuid(name);
      if (!uuid) throw Error(`Не найден стартовый предмет предыстории: ${name}`);
      return { uuid, count };
    });
    const equipment = startingEquipmentAB(key, gear, b.gold, 50);
    gear.forEach((g, i) => {
      if (!g.category) return;
      const e = equipment.find(e => e._id === makeId(`start:${key}:a${i}`));
      Object.assign(e, { type: "tool", key: g.category, requiresProficiency: g.proficient });
    });
    backgroundItem({ key, identifier: `au-${b.id}`, name: b.name, book: "AU", page: "", sourceUrl: URL,
      folder: F, img: "icons/sundries/books/book-open-brown", startingEquipment: equipment,
      desc: `**Характеристики.** ${b.abilities.map(a => ABILITIES[a]).join(", ")}. Распределите между ними +2 и +1 либо по +1 каждой; максимум 20.

**Черта происхождения.** @UUID[${ref(`feat:${b.feat}`)}].

${b.story}

**Применение.** При добавлении предыстории штатные шаги предлагают распределение характеристик, владения и черту. Снаряжение выбирается штатным окном начального снаряжения: комплект А с ${b.gold} зм либо 50 зм. Инструмент, которым вы должны владеть, выбирайте после шага владений.`,
      advancement: [advASI(`${key}:asi`, 0, { points: 3, cap: 2, max: 20, locked: Object.keys(ABILITIES).filter(a => !b.abilities.includes(a)),
        title: "Характеристики предыстории", hint: "+2 и +1 к разным характеристикам либо +1 ко всем трём; не выше 20." }),
      advTrait(`${key}:proficiencies`, 0, { grants: [...b.skills.map(s => `skills:${s}`), ...(b.tools ?? [])],
        choices: b.toolChoice ? [{ count: 1, pool: [b.toolChoice] }] : [], title: "Владения предыстории" }),
      advItemGrant(`${key}:feat`, 0, [ref(`feat:${b.feat}`)], { title: "Черта происхождения" }),
      advTrait(`${key}:languages`, 0, { grants: ["languages:standard:common"], choices: [{ count: 2, pool: ["languages:standard:*"] }],
        title: "Языки персонажа", hint: "Общий шаг создания персонажа по правилам 2024: Всеобщий и два стандартных языка. Дополнительных языков сверх этого предыстория не даёт." })]
    });
  }
}
