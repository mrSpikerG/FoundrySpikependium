import { feature, folder, ref, table, enchantActivity, enchantEffect } from "../../tools/lib/docs.mjs";
import { utility, save, damage, heal, attack, dmg, effect, change, advTrait, advItemChoice, spellConfig, uses, SR, LR, useSelf, useItem } from "../../tools/lib/core.mjs";
import { ALCHEMIST_URL, ALCHEMIST_FORMULAS, ALCHEMIST_SAVE_DC, alchemistBombActivity } from "./alchemist-formulas.mjs";
import { alchemistCompanionSummon } from "./alchemist-creatures.mjs";

// Только игровые параметры и короткие памятки; полный текст — по ссылке источника.
export const ALCHEMIST_DISCOVERIES = [
  { id: "coagulation", name: "Адепт коагуляции", desc: "Максимум хитов увеличен на уровень алхимика + Телосложение. Бонус пересчитывается с уровнем класса и характеристикой; его можно отключить на вкладке эффектов." },
  { id: "influence", name: "Алхимия воздействия", level: 13, recipes: [["Зелье дружбы с животными", 1], ["Любовное зелье", 2], ["Зелье чтения мыслей", 3], ["Зелье ясновидения", 3]] },
  { id: "domination", name: "Алхимия господства", level: 17, recipes: [["Зелье силы каменного великана", 4], ["Зелье скорости", 4], ["Масло эфирности", 4], ["Напиток некроманта", 4]] },
  { id: "transmutation", name: "Алхимия преобразования", level: 13, recipes: [["Масло ускользания", 2], ["Раствор песчаника", 2], ["Дюжая вода", 3], ["Зелье газообразной формы", 3], ["Эликсир хамелеона", 3]] },
  { id: "combat-training", name: "Боевая подготовка", desc: "Получаете владение воинским оружием и щитами через штатное продвижение." },
  { id: "explosive-bolt", name: "Взрывной снаряд", desc: "Бонусным действием прикрепите одну бомбу к одному арбалетному болту. Попадание наносит урон заряженной бомбы вместо обычного урона болта, без взрыва по области. Нельзя стрелять таким снарядом в тот же ход, когда бросаете бомбу. Кнопка расходует бомбу при подготовке; измените урон конкретного болта, отметьте его и проверяйте несовместимость с броском бомбы вручную." },
  { id: "precision", name: "Высокоточное взрывчатое вещество", desc: "При взрыве своей бомбы выберите одно существо в области: оно автоматически успешно проходит спасбросок и не получает урона. Исключите его из целей урона вручную; эта особенность не меняет исходы остальных целей." },
  { id: "hemoreagent", name: "Гемореагент", level: 17, desc: "При зарядке и броске бомбы можно добавить до пяти бесплатных костей реагентов. За каждую получите 1к6 некротического урона, который нельзя уменьшить или избежать. Добавку включайте в исходный бросок бомбы; стоимость здоровьем и запрет уменьшения пока разрешайте вручную, обычная карточка урона не обеспечивает этот запрет." },
  { id: "reaction-sip", name: "Глоток на реакции", level: 17, desc: "Получив урон от видимого существа, можете реакцией выпить зелье. Кнопка занимает реакцию; само зелье примените и израсходуйте его карточкой, исключив повторную оплату действия." },
  { id: "grenadier", name: "Гренадёр", desc: "После зарядки и броска бомбы можете бонусным действием атаковать оружием без свойства Двуручное. Кнопка отмечает бонусное действие; бросок выполните конкретным оружием, не расходуя действие повторно. Предшествующий бросок бомбы и свойство оружия проверяются вручную." },
  { id: "charger", name: "Зарядное устройство", level: 13, specialty: "dynamo-engineer", specialtyName: "Динамо-инженер", desc: "Один раз за день при завершении короткого отдыха восстановите две потраченные ячейки в динамо-заклинательных механизмах и немедленно настройтесь на них. Кнопка отмечает использование; конкретные механизмы, ячейки и настройка пока выбираются и изменяются вручную." },
  { id: "ballistics", name: "Исследование баллистики", desc: "Изучаете две дополнительные общие формулы бомб. Выбор привязан к этому открытию и не расходует обычные формулы класса; при замене открытия его выдача удаляется штатным продвижением." },
  { id: "haze", name: "Манящая дымка", level: 13, specialty: "amorist", specialtyName: "Аморист", desc: "Когда очаровываете существо, можете сделать его невраждебным и считающим себя очарованным всеми видимыми существами, пока длится исходное очарование. Раз за короткий/долгий отдых. Кнопка расходует применение; связь с исходным очарованием и отношение к существам ведите вручную." },
  { id: "crow-mask", name: "Маска ворона (EfC)", book: "EfC", desc: "Создаёте обработанную кожаную маску с клювом. Пока носите её, невосприимчивы к вдыхаемым ядам, газам и болезням, включая магические. Это не общий иммунитет к яду и состоянию Отравлен. Маску и подходящий путь воздействия учитывайте вручную; постоянный полный иммунитет к яду не выдаётся." },
  { id: "enriched-serum", name: "Обогащённая сыворотка", level: 13, specialty: "apothecary", specialtyName: "Апотекарий", desc: "Восстановление хитов от питья вашего зелья дополнительно даёт сопротивление дробящему, колющему и рубящему урону немагических атак до конца следующего хода получателя. Профиль лишь отмечает эту защиту: подходящий урон делите пополам вручную. Проверка источника зелья и срок до следующего хода пока ручные." },
  { id: "firebrand", name: "Огненное клеймо", desc: "Бонусным действием вылейте содержимое бомбы на одно ближнее оружие: до конца вашего хода оно наносит дополнительно 1к6 огня при попадании, 2к6 с 5-го уровня, 3к6 с 11-го, 4к6 с 17-го. Штатное зачарование добавляет огонь в урон выбранного оружия, фиксируя уровень алхимика при нанесении покрытия, расходует бомбу и заканчивается в конце вашего хода. Основной урон оружия от покрытия не становится магическим." },
  { id: "expert-poisoner", name: "Опытный отравитель", level: 13, specialty: "venomsmith", specialtyName: "Мастер ядов", recipes: [["Дым жжёного отура", 3], ["Слизь ползающего падальщика", 3], ["Яд дроу", 3], ["Бледная настойка", 4], ["Полуночные слёзы", 5], ["Яд виверны", 6]] },
  { id: "expert-healer", name: "Опытный целитель (EfC)", level: 9, book: "EfC", desc: "Ваши лечебные зелья восстанавливают дополнительно Интеллект хитов, минимум 1. За 2 кости реагентов можно изготовить исцелин: лечение 2к4 + 2, а также одна болезнь или одно из состояний: испуг, глухота, слепота, отравление, очарование, паралич. Неиспользованный исцелин теряет силу через 24 часа. Существующие зелья, создание исцелина и снятие выбранного состояния пока ручные; кнопка добавочного лечения доступна для применения после подходящего зелья." },
  { id: "poisoner", name: "Отравитель", recipes: [["Простой яд, 2 дозы", 1], ["Противоядие, 2 дозы", 1], ["Зелье яда", 2], ["Змеиный яд", 2], ["Масло таггита", 2], ["Сыворотка правды", 2]], desc: "Получаете владение инструментами отравителя. СЛ изготовленных ядов равна СЛ ваших бомб." },
  { id: "recycling", name: "Переработка зелий", level: 9, desc: "Зельеварением можно дистиллировать собственные созданные зелья обратно в реагенты, затем использовать их для новых зелий. Нельзя превысить максимум реагентов. Подлинность зелья, его удаление и возврат ровно исходной цены пока контролируются вручную; не возвращайте цену одного зелья дважды." },
  { id: "fire-eater", name: "Пожиратель огня", desc: "Вместо броска выпейте бомбу и действием выдохните 15-футовый конус. Ловкость против СЛ бомб: полный урон заряженной бомбы огнём при провале, половина при успехе. Вы получаете 1к4 огня за каждую кость урона бомбы: используйте отдельную кнопку ожога на себе. Расходуется одна бомба и общий лимит зарядки за ход. Ожог, попадание всех существ в область и применение формулы дополнительно проверяйте вручную." },
  { id: "alcoholic", name: "Привычка-алкоголичка (T&T)", level: 13, book: "TT", specialty: "mixologist", specialtyName: "Миксолог", desc: "При завершении короткого отдыха можно изготовить один волшебный напиток без расхода реагентов. Напиток, допустимый рецепт и его срок пока отслеживайте вручную; это не восстановление потраченных реагентов." },
  { id: "destructive-fun", name: "Разрушительное веселье", level: 13, specialty: "mad-bomber", specialtyName: "Безумный бомбометатель", desc: "При зарядке вместо одной можно бросить бомбы в количестве костей урона исходной бомбы. Каждая наносит 1к10 + Интеллект; цели или пространства должны различаться. Реагенты оплачиваются отдельно для каждой, формула применяется только к одной выбранной бомбе. Пакет атак, раздельный расход и связь исходного взрыва пока ручные." },
  { id: "lazarus", name: "Разряд Лазаря", level: 9, desc: "Действием в 5 футах введите металлический болт в тело умершего не более минуты назад: оно оживает с 1 хитом. Нужны сердце и остальные жизненно важные органы, смерть от старости не подходит. Раз за короткий/долгий отдых. Кнопка расходует применение; допустимость цели, возврат к жизни и установка ровно 1 хита выполняются вручную, это не обычное лечение." },
  { id: "reflex", name: "Рефлексная смесь (EfC)", book: "EfC", desc: "За короткий/долгий отдых приготовьте одну дозу. Бонусным действием получатель вводит её себе: КБ становится 14 + Ловкость на 10 минут. После попадания по себе можно реакцией получить +5 КБ до начала следующего хода, включая исходную атаку; тогда вся смесь заканчивается в начале следующего хода. Приготовление дозы, исходную атаку и раннее завершение пока отслеживайте вручную; профиль базового КБ применяйте только после введения реально имеющейся дозы." },
  { id: "blast-dc", name: "Сейчас рванёт", level: 9, desc: "СЛ спасбросков ваших бомб увеличена на половину бонуса владения вниз. Пассивный эффект учитывается в карточках бомб и формулах; выключение эффекта убирает прибавку. Она не распространяется на посторонние заклинания или способности." },
  { id: "ooze-rider", name: "Слизневый наездник", level: 13, specialty: "ooze-rancher", specialtyName: "Разводчик слизи", desc: "У созданной вами слизи скорость ходьбы не ниже 30 футов, к урону и инициативе добавляется ваш бонус владения. При выпуске из изготовленного вами сосуда эти бонусы берутся у создателя, даже если бросает другой персонаж. Средняя или крупнее слизь подходит вам как скакун; вы и снаряжение не страдаете от непосредственного контакта с ней. Езда, контакт и последующие изменения уровня создателя пока учитываются вручную." },
  { id: "metabolism", name: "Смягчающий метаболизм", level: 13, specialty: "xenochemist", specialtyName: "Ксенохимик", desc: "Получив урон, можете реакцией потратить до бонуса владения костей реагентов и уменьшить этот урон на сумму выпавших к10. Кнопки списывают выбранное число костей и занимают реакцию; предел и исходный урон пока проверьте и измените вручную." },
  { id: "homunculus", name: "Создание гомункула", desc: "За 8 часов, в том числе во время долгого отдыха, создайте гомункула-фамильяра: конструкт, не меняет форму и не отпускается, может атаковать. Телепатия без ограничения расстояния на одном плане. Кнопка создаёт точный профиль гомункула 2014; наличие другого своего гомункула на сценах блокирует повтор. После смерти тело сохраняется; оживление занимает 1 час и допустимо во время отдыха. Материалы, время процедуры и оживление прежнего тела пока подтверждаются вручную." },
  { id: "arcane", name: "Тайное знание", desc: "Изучаете три заговора волшебника по выбору, заклинательная характеристика — Интеллект. Выбор и выдача связаны с открытием штатным продвижением." },
  { id: "tri-mutation", name: "Три-мутация", level: 13, specialty: "mutagenist", specialtyName: "Мутагенетик", desc: "Вводя себе мутаген, можете выбрать три-мутаген со всеми преимуществами ваших мутагенов на 1 минуту либо до следующего введения мутагена. Раз за долгий отдых. Кнопка расходует применение; действительные эффекты мутагенов и их взаимное завершение ещё переносятся." },
  { id: "larger-blast", name: "Увеличенный Взрыв", level: 17, desc: "Добавляя кости реагентов к урону бомбы, можно увеличить радиус до 5 футов за каждые две потраченные кости. Выбор радиуса и связь с фактически потраченными костями пока ручные; дополнительного расхода за это открытие нет." },
  { id: "flechette", name: "Флешетта (CA:B)", level: 13, book: "CAB", specialty: "marksman", specialtyName: "Стрелок", desc: "При завершении долгого отдыха за каждую кость реагентов создайте 4 болта: ребристый даёт +2 к атаке, пронзающий +2 к урону. Неиспользованные теряют силу через 24 часа. Тип, создание боеприпасов, источник бонуса и срок пока ведите вручную; кнопка подготовки списывает одну кость за четыре болта." },
  { id: "syringe", name: "Шприц", desc: "Бонусным действием введите зелье себе или согласной цели в 5 футах. Несогласной цели требуется успешная ближняя атака шприцем со свойством Фехтовальное. Нативные атаки Силой/Ловкостью не наносят выдуманного урона. Расход конкретного зелья/яда и эффект после подтверждённого попадания выполняйте его карточкой; избегайте повторного расхода действия." }
];

const BOMB = useItem("feat:alchemist-bombs"), REAGENTS = n => useItem("feat:alchemist-reagents", n);
export function define() {
  for (const row of ALCHEMIST_DISCOVERIES) {
    const key = `alchemist:discovery:${row.id}`, id = `alchemist-discovery-${row.id}`, acts = [], effects = [], advancement = [];
    const action = (suffix, options) => utility(`${key}:${suffix}`, { spellSlot: false, ...options });
    const other = {};
    if (row.id === "coagulation") effects.push(effect(key, { name: row.name, changes: [change("system.attributes.hp.bonuses.overall", "+ @classes.alchemist.levels + @abilities.con.mod")] }));
    if (row.id === "combat-training") advancement.push(advTrait(key, 0, { grants: ["weapon:mar", "armor:shl"], title: "Воинское оружие и щиты" }));
    if (row.id === "poisoner") advancement.push(advTrait(key, 0, { grants: ["tool:pois"], title: "Инструменты отравителя" }));
    if (row.id === "ballistics") advancement.push(advItemChoice(key, 0, { title: "Две дополнительные общие формулы", count: 2, allowDrops: false, pool: ALCHEMIST_FORMULAS.map(f => ref(`alchemist:formula:${f.id}`)) }));
    if (row.id === "arcane") advancement.push(advItemChoice(key, 0, { title: "Три заговора волшебника", count: 3, type: "spell", spellLevel: "0", list: ["class:wizard"], spell: spellConfig({ abilities: ["int"] }) }));
    if (row.id === "blast-dc") effects.push(effect(key, { name: row.name, flags: { spikependium: { alchemistBombDC: true } } }));
    if (row.id === "explosive-bolt") acts.push(action("prepare", { name: "Прикрепить бомбу к болту", activation: "bonus", consume: [BOMB] }));
    if (row.id === "reaction-sip") acts.push(action("sip", { name: "Реакция: выпить выбранное зелье", activation: "reaction" }));
    if (row.id === "grenadier") acts.push(action("attack", { name: "После бомбы: бонусная атака оружием", activation: "bonus" }));
    if (row.id === "charger") { other.uses = uses(1, LR); acts.push(action("charge", { name: "После короткого отдыха: восстановить два механизма", activation: "special", consume: [useSelf()] })); }
    if (row.id === "haze") { other.uses = uses(1, SR); acts.push(action("haze", { name: "Усилить исходное очарование", activation: "special", count: 1, affects: "creature", consume: [useSelf()] })); }
    if (row.id === "enriched-serum") {
      // shortcut: профиль отмечает условное сопротивление; автоматизировать после привязки к исходной немагической атаке.
      const fx = effect(key, { name: `${row.name}: немагические атаки (сопротивление вручную)`, transfer: false, expiry: "targetEnd", flags: { spikependium: { alchemistSerum: true } } });
      effects.push(fx); acts.push(action("apply", { name: "После вашего лечебного зелья: сопротивление", activation: "special", count: 1, affects: "creature", effects: [fx._id] }));
    }
    if (row.id === "firebrand") {
      const extraFire = { ...change("system.damage.parts", JSON.stringify(dmg("@scale.alchemist.bomb-d6", "fire"))), replacement: "origin" };
      const fx = enchantEffect(key, row.name, [extraFire], "icons/magic/fire/flame-burning-fist-strike");
      fx.system.magical = false;
      fx.flags.spikependium = { alchemistFirebrand: true };
      fx.duration.expiry = "sourceEnd";
      const enchant = enchantActivity(key, fx._id, { name: "Облить выбранное ближнее оружие", activation: "bonus", allowMagical: true, categories: ["simpleM", "martialM"] });
      enchant.consumption.targets = [BOMB]; enchant.consumption.spellSlot = false;
      effects.push(fx); acts.push(enchant);
    }
    if (row.id === "expert-healer") acts.push(heal(`${key}:bonus`, { name: "Дополнительное лечение вашего зелья", activation: "special", formula: "max(1, @abilities.int.mod)", count: 1, affects: "creature", spellSlot: false }));
    if (row.id === "fire-eater") {
      acts.push(alchemistBombActivity(save(key, { name: "Выдох бомбы", activation: "action", self: true, template: { type: "cone", size: 15 }, affects: "creature", ability: "dex", dc: ALCHEMIST_SAVE_DC, damage: [dmg("@scale.alchemist.bomb + @abilities.int.mod", "fire")], spellSlot: false, consume: [BOMB] })), damage(`${key}:burn`, { name: "Ожог на себе после выдоха", activation: "special", self: true, damage: [dmg("@scale.alchemist.bomb.number d4", "fire")], spellSlot: false }));
    }
    if (row.id === "lazarus") { other.uses = uses(1, SR); acts.push(action("revive", { name: "Вернуть допустимую цель к жизни с 1 хитом", activation: "action", range: 5, count: 1, affects: "creature", consume: [useSelf()] })); }
    if (row.id === "reflex") {
      // shortcut: до переноса расходника профиль хранит срок; КБ получателя и его реакцию настраивает игрок.
      const fx = effect(key, { name: "Рефлексная смесь: настройте КБ 14 + Ловкость вручную", transfer: false, seconds: 600 });
      effects.push(fx); acts.push(action("apply", { name: "После введения дозы: отметить 10 минут", activation: "special", count: 1, affects: "creature", effects: [fx._id] }));
    }
    if (row.id === "metabolism") for (let n = 1; n <= 6; n++) acts.push(action(`reduce:${n}`, { name: `Уменьшить исходный урон: ${n}к10`, activation: "reaction", roll: `${n}d10`, consume: [REAGENTS(n)] }));
    if (row.id === "homunculus") acts.push(alchemistCompanionSummon("alchemist:homunculus:create", "homunculus", { name: "Создать гомункула (8 часов)", activation: "hour", activationValue: 8 }), action("revive", { name: "Оживить своего гомункула (1 час, прежнее тело)", activation: "hour" }));
    if (row.id === "tri-mutation") { other.uses = uses(1, LR); acts.push(action("inject", { name: "Три-мутаген", activation: "special", duration: "minute", durationValue: 1, consume: [useSelf()] })); }
    if (row.id === "flechette") acts.push(action("craft", { name: "После долгого отдыха: реагент за 4 флешетты", activation: "special", consume: [REAGENTS(1)] }));
    if (row.id === "syringe") {
      acts.push(action("inject", { name: "Ввести зелье согласной цели", activation: "bonus", range: 5, count: 1, affects: "creature" }));
      for (const ability of ["str", "dex"]) acts.push(attack(`${key}:${ability}`, { name: `Шприц: ${ability === "str" ? "Сила" : "Ловкость"}`, activation: "bonus", ability, range: 5, count: 1, affects: "creature", includeBase: false, damage: [], spellSlot: false }));
    }
    const recipeText = row.recipes ? `Зельеварением можно изготовить следующие составы за указанное число костей реагентов. Само создание, расход и 24-часовой срок пока выполняйте вручную; эту таблицу нельзя считать автоматическим производством.\n\n${table("Дополнительные рецепты", ["Состав", "Кости реагентов"], row.recipes)}` : "";
    const data = { key, identifier: id, name: row.name, pack: "classes", folder: folder("classes", `Алхимик (Valda)/Открытия/${row.specialtyName ?? (row.book ? `Дополнения ${row.book === "CAB" ? "CA:B" : row.book === "TT" ? "T&T" : row.book}` : "Общие")}`),
      book: row.book ?? "VSS", page: "", sourceUrl: ALCHEMIST_URL, typeValue: "class", level: row.level ?? 0, levelClass: "alchemist",
      requirements: `Алхимик${row.level ? ` ${row.level}-го уровня` : ""}${row.specialtyName ? `, ${row.specialtyName}` : ""}`,
      prerequisiteItems: row.specialty ? [`subclass:alchemist-${row.specialty}`] : [],
      img: "icons/tools/laboratory/vials-blue-pink", desc: [row.desc, recipeText].filter(Boolean).join("\n\n"), acts, effects, advancement, ...other };
    feature(data);
    if (row.specialty) feature({ ...data, key: `alchemist:research-discovery:${row.id}`, name: `${row.name} — междисциплинарное`, prerequisiteItems: ["subclass:alchemist-researcher"],
      requirements: `Исследователь, алхимик ${row.level}-го уровня`, folder: folder("classes", "Алхимик (Valda)/Открытия/Междисциплинарные"),
      flags: { spikependium: { key: `alchemist:research-discovery:${row.id}`, researchDiscovery: true } } });
  }
}
