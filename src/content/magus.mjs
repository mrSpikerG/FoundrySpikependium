import { classItem, feature, feat, folder, ref, journal, startingEquipmentAB, loot, table, spellUuid } from "../../tools/lib/docs.mjs";
import { advTrait, advScale, advItemChoice, advASI, spellConfig, srdSpellUuid, utility, effect, change, uses, LR, SR, useSelf } from "../../tools/lib/core.mjs";
import { SPELL_NAMES } from "../names.mjs";

// Уровни из таблицы стр. 3 выбраны пользователем вместо противоречащих ей заголовков.
export const MAGUS_SPELLS = {
  0: ["Acid Splash", "Blade Ward", "Chill Touch", "Fire Bolt", "Mage Hand", "Mind Sliver", "Poison Spray", "Ray of Frost", "Shocking Grasp", "Thunderclap", "True Strike"],
  1: ["Burning Hands", "Chromatic Orb", "Color Spray", "Detect Magic", "Ensorcelled Strike", "False Life", "Grease", "Ice Knife", "Identify", "Jump", "Longstrider", "Mage Armor", "Provoke", "Shield", "Spell Aegis", "Towerfall Tactic", "Weapon Aegis"],
  2: ["Acid Arrow", "Animate Shield", "Animate Weapon", "Arcane Invigoration", "Blur", "Cloud of Daggers", "Dragon's Breath", "Enlarge/Reduce", "Flame Blade", "Hold Person", "Magic Weapon", "Mind Spike", "Misty Step", "Ray of Enfeeblement"],
  3: ["Counterspell", "Dispel Magic", "Fireball", "Fly", "Haste", "Lightning Bolt", "Magic Circle", "Phantom Steed", "Protection from Energy", "Slow", "Strike Order", "Vampiric Touch"],
  4: ["Assess Enemy", "Banishment", "Black Tentacles", "Charm Monster", "Conjure Minor Elementals", "Death Ward", "Fire Shield", "Ice Storm", "Locate Creature", "Secret Chest", "Stoneskin", "Vitriolic Sphere", "Wall of Fire"],
  5: ["Cloudkill", "Conjure Elemental", "Contact Other Plane", "Dispel Evil and Good", "Hold Monster", "Legend Lore", "Planar Binding", "Reflect Magic", "Teleportation Circle", "Wall of Force"],
  6: ["Blade Barrier", "Disintegrate", "Globe of Invulnerability", "Planar Ally", "Sunbeam"]
};
const CUSTOM_NAMES = {
  "Color Spray": "Цветные брызги", "Acid Arrow": "Кислотная стрела", "Flame Blade": "Огненный клинок", "Black Tentacles": "Чёрные щупальца",
  "Planar Binding": "Планарные узы", "Globe of Invulnerability": "Сфера неуязвимости", "Sunbeam": "Солнечный луч",
  "Ensorcelled Strike": "Зачарованный удар", "Provoke": "Провокация", "Spell Aegis": "Эгида заклинаний", "Towerfall Tactic": "Тактика падения башни",
  "Weapon Aegis": "Эгида оружия", "Animate Shield": "Оживление щита", "Animate Weapon": "Оживление оружия", "Arcane Invigoration": "Арканное подкрепление",
  "Strike Order": "Приказ атаковать", "Assess Enemy": "Оценка врага", "Reflect Magic": "Отражение магии"
};
const russian = name => CUSTOM_NAMES[name] ?? Object.entries(SPELL_NAMES).find(([, en]) => en === name)?.[0];

export function define() {
  const root = folder("classes", "Магус (Playtest 3)");
  const F = folder("classes", "Магус (Playtest 3)/Умения класса");
  const make = (id, level, name, page, desc, other = {}) => feature({ key: `magus:${id}`, identifier: `magus-${id}`,
    book: "MAGUS-PT3", page, name, folder: F, img: "icons/skills/melee/sword-damaged-broken-glow-red", levelClass: "magus", level, desc, ...other });
  make("mystic-mark", 1, "Мистическая метка", 2, `Бонусным действием выберите подготовленное заклинание магуса 1-го уровня или выше со временем накладывания «Действие» или «Бонусное действие». Потратьте ячейку не ниже уровня заклинания. Выберите силовой урон либо один из видов урона, наносимых выбранным заклинанием, и один из вариантов метки.

**Эгида.** Вы получаете сопротивление выбранному виду урона.

**Зачарование.** Нанося урон оружием или безоружным ударом, вы можете заменить обычный вид урона атаки выбранным.

Одновременно можно иметь не более одной Эгиды и одного Зачарования; за каждым закреплено своё заклинание. Пока у вас есть соответствующая метка, бонусным действием можно высвободить закреплённое заклинание, как если бы вы только что наложили его. Все преимущества этого умения прекращаются после продолжительного отдыха.

Автоматизация выбора, резервирования ячейки, замены метки и выпуска заклинания ещё разрабатывается. Пока отслеживайте метки и заранее потраченную ячейку вручную.`);
  make("spellcasting", 1, "Использование заклинаний", 2, `Заклинательная характеристика — Интеллект. Сложность спасброска равна 8 + бонус владения + модификатор Интеллекта; бонус атаки заклинанием — бонус владения + модификатор Интеллекта.

**Заговоры.** Выберите два заговора магуса. На 10-м и 16-м уровнях вы изучаете ещё по одному. На каждом новом уровне магуса можно заменить один заговор другим из этого списка.

**Подготовленные заклинания.** На 1-м уровне выберите два заклинания магуса 1-го уровня. На каждом уровне со 2-го по 19-й добавляйте по одному; максимум — 20. Выбирайте только заклинания тех уровней, для которых класс даёт ячейки. На каждом новом уровне магуса можно заменить одно подготовленное заклинание. Это замена при повышении уровня, а не свободная смена списка после отдыха. Всегда подготовленные заклинания других умений не учитываются в этом количестве.

Ячейки восстанавливаются после продолжительного отдыха. Выбор и замена заговоров и заклинаний выполняются в штатном окне продвижений. В расхождениях оригинала используются уровни из таблицы класса на стр. 3.`);
  make("weapon-mastery", 1, "Мастерство оружия", 3, "Выберите два вида оружия, которыми владеете: вы можете использовать их свойства мастерства. После продолжительного отдыха можно заменить выбранные виды оружия. Начальный выбор настроен штатным продвижением; смените выбор после отдыха в управлении продвижениями.", {
    advancement: [advTrait("magus:mastery", 1, { mode: "mastery", allowReplacements: true,
      choices: [{ count: 2, pool: ["weapon:*"] }], title: "Два вида оружия с мастерством" })]
  });
  make("arcane-ability", 2, "Арканное усилие", 3, "После провала проверки характеристики можно добавить модификатор Интеллекта и наивысший уровень оставшейся непотраченной ячейки; результат может стать успешным. Одно применение восстанавливается после короткого или продолжительного отдыха. Можно потратить ячейку любого уровня, чтобы восстановить применение. Изменение уже сделанного броска и восстановление применения за ячейку пока выполняются вручную.", { uses: uses(1, SR, LR) });
  make("fighting-style", 2, "Боевой стиль", 3, "Получите черту боевого стиля по своему выбору. Вместо обычного боевого стиля можно выбрать Мистического воина. Выбор появляется в штатном окне продвижений.", {
    identifier: "fighting-style",
    advancement: [advItemChoice("magus:style", 2, { title: "Боевой стиль магуса", count: 1, type: "feat", restrictType: "feat", restrictSubtype: "fightingStyle", pool: [ref("feat:magus-mystic-warrior")] })]
  });
  feat({ key: "feat:magus-mystic-warrior", identifier: "magus-mystic-warrior", name: "Мистический воин (Magus)", book: "MAGUS-PT3", page: 3,
    folder: folder("feats", "Магус (Playtest 3)/Боевые стили"), subtype: "fightingStyle", img: "icons/skills/melee/sword-damaged-broken-glow-red",
    desc: "Вы получаете преимущество на спасброски Телосложения для поддержания концентрации. При провале такого спасброска для заклинания вы получаете временные хиты: удвоенный уровень заклинания + модификатор заклинательной характеристики. Преимущество настроено пассивным эффектом. Получение временных хитов после провала пока отслеживается вручную; преимущество относится к концентрации с Телосложением.",
    effects: [effect("magus:mystic-warrior", { name: "Мистический воин: концентрация", changes: [change("system.attributes.concentration.roll.mode", 1)], conditions: { k: "attributes.concentration.ability", o: "in", v: ["", "con"] } })]
  });
  make("sword-sorcery", 5, "Меч и магия", 4, "Совершая действие Атака в свой ход, вы можете в рамках того же действия наложить заговор со временем накладывания «Действие». Совершив действие Магия в свой ход, вы можете бонусным действием выполнить одну атаку оружием или безоружным ударом. Совместный расход действия и условный доступ к бонусной атаке пока контролируются вручную.");
  make("magical-recovery", 6, "Восстановление магии", 4, "Завершив короткий отдых, можно восстановить потраченные ячейки. Сумма их уровней не должна превышать половину уровня магуса с округлением вверх; ни одна ячейка не может быть 6-го уровня или выше. Одно применение за продолжительный отдых, на 20-м уровне — два. Кнопка открывает выбор ячеек и проверяет суммарный предел; используйте её только после короткого отдыха.", {
    uses: uses("1 + floor(@classes.magus.levels / 20)", LR),
    acts: [utility("magus:magical-recovery", { name: "Восстановить ячейки после короткого отдыха", activation: "special", consume: [useSelf()], spellSlot: false })]
  });
  make("sigil-surge", 9, "Усиление печати", 4, "При создании Мистической метки вы получаете дополнительный эффект: Эгида даёт +1 к КД и спасброскам; Зачарование даёт +1 к броскам атаки и урона оружием и безоружными ударами. При расходе ячейки 3-го или 4-го уровня бонус равен +2, 5-го или выше — +3. Бонус не суммируется с бонусом магического предмета к той же КД или тому же броску: используется больший. Учитывайте сравнение и выбранный уровень ячейки вручную до завершения автоматизации меток.");
  make("mass-mark", 10, "Массовая метка", 4, "При использовании Мистической метки можно усилить согласных существ в пределах 30 футов, числом не больше уровня магуса. На 10 минут они получают один выбранный вариант: Массовая эгида — сопротивление виду урона метки; Массовое зачарование — возможность заменять урон оружия и безоружных ударов этим видом. Одно применение за короткий или продолжительный отдых. Это дополнение к созданию метки, а не отдельная метка или дополнительная трата ячейки. Выбор целей, привязка к метке и эффекты пока отслеживаются вручную.", { uses: uses(1, SR, LR) });
  make("extra-attack", 11, "Дополнительная атака", 4, "Совершая действие Атака в свой ход, вы можете атаковать дважды вместо одного раза. Число атак и общий расход действия пока контролируются вручную.");
  make("spell-resistance", 15, "Сопротивление заклинаниям", 4, "Вы получаете сопротивление силовому урону. Спасброски против заклинаний выполняются с преимуществом, атаки заклинаниями против вас — с помехой. Сопротивление силовому урону включено пассивным эффектом; условные преимущества и помехи против заклинаний пока отмечайте в окне броска.", {
    effects: [effect("magus:force-resistance", { name: "Сопротивление силовому урону", changes: [change("system.traits.dr.value", "force")] })]
  });
  make("spell-surge", 18, "Магический всплеск", 4, "Выберите одно заклинание магуса 6-го уровня. Один раз за продолжительный отдых вы можете наложить его без расхода ячейки. При этом восстановите одну потраченную ячейку не выше 5-го уровня по своему выбору. Штатное продвижение сохраняет выбранное заклинание; свободное накладывание, общий расход применения и восстановление ячейки ещё связываются, пока отслеживайте их вручную.", {
    uses: uses(1, LR), advancement: [advItemChoice("magus:surge-spell", 18, { title: "Заклинание Магического всплеска", type: "spell", spellLevel: "6", list: ["class:magus"], spell: spellConfig({ abilities: ["int"] }) })]
  });
  const archPool = ["str", "dex"].map(ability => {
    const label = ability === "str" ? "Сила" : "Ловкость";
    make(`archmagus-${ability}`, 20, `Архимагус: Интеллект и ${label} +2`, 4, `Интеллект и ${label} увеличиваются на 2, максимум до 23. Это два фиксированных увеличения; свободного распределения или замены чертой нет.`, {
      advancement: [advASI(`magus:archmagus:${ability}`, 0, { points: 0, fixed: { int: 2, [ability]: 2 }, max: 23, locked: ["str", "dex", "con", "int", "wis", "cha"], title: `Интеллект и ${label} +2 (максимум 23)` })]
    });
    return ref(`magus:archmagus-${ability}`);
  });
  make("archmagus", 20, "Архимагус", 4, "Интеллект и одна характеристика на выбор — Сила или Ловкость — увеличиваются на 2, максимум до 23. Выбор варианта и фиксированные прибавки настроены штатными продвижениями. Кроме того, Восстановление магии получает два применения за продолжительный отдых.", {
    advancement: [advItemChoice("magus:archmagus-choice", 20, { title: "Выберите Силу или Ловкость для Архимагуса", allowDrops: false, pool: archPool })]
  });
  const features = { 1: ["mystic-mark", "spellcasting", "weapon-mastery"], 2: ["arcane-ability", "fighting-style"], 5: ["sword-sorcery"], 6: ["magical-recovery"], 9: ["sigil-surge"], 10: ["mass-mark"], 11: ["extra-attack"], 15: ["spell-resistance"], 18: ["spell-surge"], 20: ["archmagus"] };
  loot({ key: "item:magus:diamond-50", name: "Алмаз стоимостью 50 зм", identifier: "magus-diamond-50", book: "MAGUS-PT3", page: 2,
    folder: folder("items", "Магус (Playtest 3)/Компоненты"), img: "icons/commodities/gems/gem-faceted-teardrop-blue", weight: 0.01, price: 50,
    priceNote: "Стоимость 50 зм прямо указана в стартовом снаряжении класса.", weightNote: "Вес 0,01 фунта — оценочный: в PDF вес алмаза не указан.", desc: "Обычный немагический алмаз из стартового снаряжения магуса. Может служить материальным компонентом подходящего заклинания." });
  classItem({ key: "class:magus", identifier: "magus", name: "Магус (Playtest 3)", book: "MAGUS-PT3", page: 3, folder: root,
    img: "icons/skills/melee/sword-damaged-broken-glow-red", hd: "d8", primaryAbility: ["int"], wealth: "200",
    desc: "Магус сочетает оружие и заклинания. Это тестовый класс для правил 2024 года. Подклассы выбираются на 3-м уровне и дают умения на 3-м, 7-м, 14-м и 20-м. При расхождениях PDF используются уровни таблицы класса на стр. 3: Восстановление магии — 6-й, Усиление печати — 9-й, дополнительные заговоры — 10-й и 16-й. Шесть подклассов и все 27 описанных в приложении заклинаний перенесены; условная автоматизация и отсутствующие в предоставленном источнике заклинания ещё дорабатываются.",
    features: Object.fromEntries(Object.entries(features).map(([level, ids]) => [level, ids.map(id => `magus:${id}`)])),
    spellcasting: { progression: "half", ability: "int", preparation: { formula: "@scale.magus.max-prepared" } },
    startingEquipment: startingEquipmentAB("magus", ["phbarmStuddedLea", "phbwepLongbow000", "phbamoArrows0000", "phbagQuiver00000", "phbwepRapier0000", "phbagComponentPo"].map(id => ({ uuid: `Compendium.dnd5e.equipment24.Item.${id}`, count: id === "phbamoArrows0000" ? 20 : null })).concat([{ uuid: ref("item:magus:diamond-50") }]), 4, 200),
    traits: [advTrait("magus:saves", 1, { classRestriction: "primary", title: "Спасброски Телосложения и Интеллекта", grants: ["saves:con", "saves:int"] }),
      advTrait("magus:skills", 1, { classRestriction: "primary", title: "Два навыка магуса", choices: [{ count: 2, pool: ["acr", "arc", "ath", "his", "ins", "inv", "nat", "prc", "rel"].map(s => `skills:${s}`) }] }),
      advTrait("magus:weapons", 1, { classRestriction: "primary", title: "Простое и воинское оружие", grants: ["weapon:sim", "weapon:mar"] }),
      advTrait("magus:armor", 1, { classRestriction: "primary", title: "Лёгкие и средние доспехи, щиты", grants: ["armor:lgt", "armor:med", "armor:shl"] })],
    scales: [advScale("magus:max-prepared", "max-prepared", "Подготовленные заклинания", "number", Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, Math.min(20, i + 2)]))),
      advScale("magus:cantrips", "cantrips-known", "Известные заговоры", "number", { 1: 2, 10: 3, 16: 4 })],
    extraAdvancement: [advItemChoice("magus:cantrip-choice", null, { title: "Заговоры магуса", type: "spell", list: ["class:magus"], spellLevel: "0",
      choices: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, { count: i === 0 ? 2 : [9, 15].includes(i) ? 1 : 0, replacement: i > 0 }])), spell: spellConfig({ abilities: ["int"], always: false }) }),
      advItemChoice("magus:prepared-spells", null, { title: "Подготовленные заклинания магуса", type: "spell", list: ["class:magus"], spellLevel: "availableNoCantrips",
        choices: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, { count: i === 0 ? 2 : i < 19 ? 1 : 0, replacement: i > 0 }])), spell: { ...spellConfig({ abilities: ["int"] }), prepared: 1 } }),
      advASI("magus:epic-boon", 19, { title: "Эпическая черта", hint: "Выберите эпическую или другую подходящую черту; рекомендуется Дар памяти заклинаний." })]
  });
  const uuids = [], unlinked = [], rows = [];
  for (const [level, names] of Object.entries(MAGUS_SPELLS)) for (const en of names) {
    const name = russian(en); if (!name) throw Error(`Magus: нет русского названия ${en}`);
    const uuid = spellUuid(name) ?? srdSpellUuid(en);
    if (uuid) uuids.push(uuid); else unlinked.push({ name, level: Number(level), school: "", custom: "Документ ещё не перенесён; добавьте из своей книги" });
    rows.push([level, uuid ? `@UUID[${uuid}]{${name}}` : name]);
  }
  journal({ key: "journal:spell-list-magus", name: "Заклинания магуса", folder: folder("rules", "Магус (Playtest 3)"), pages: [
    { name: "Магус", html: "<p>Список со стр. 4–6 Magus 2024, Playtest 3. Новые заклинания приложения связаны с русскими документами модуля; оставшиеся заклинания вне SRD перечислены отдельно. Заклинания 6-го уровня доступны через Магический всплеск.</p>", spells: { type: "class", identifier: "magus", uuids, unlinked } },
    { name: "Полный перечень", html: table("Заклинания магуса — стр. 4–6", ["Уровень", "Заклинание"], rows) }
  ] });
}
