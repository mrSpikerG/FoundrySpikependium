import { feature, equipment, folder, ref, journal, md } from "../../tools/lib/docs.mjs";
import { attack, save, heal, utility, check, cast, form, dmg, effect, change, uses, SR, LR, useSelf, advItemChoice, advItemGrant, spellConfig, srdSpellUuid } from "../../tools/lib/core.mjs";
import { ALCHEMIST_URL } from "./alchemist-formulas.mjs";

export const GRAFT_DAMAGE_TYPES = [
  ["acid", "Кислота"], ["bludgeoning", "Дробящий"], ["cold", "Холод"], ["fire", "Огонь"], ["force", "Силовой"],
  ["lightning", "Электричество"], ["necrotic", "Некротический"], ["piercing", "Колющий"], ["poison", "Яд"],
  ["psychic", "Психический"], ["radiant", "Лучистый"], ["slashing", "Рубящий"], ["thunder", "Звук"]
];
const SLOTS = { arms: "руки", skin: "кожа", head: "голова", organs: "внутренности", legs: "ноги" };
export const ALCHEMIST_GRAFTS = [
  { id: "amphibious", name: "Адаптация амфибии", price: 400, weight: 1, slot: "head", donor: "Существо с особенностью Амфибия", desc: "Дышите воздухом и под водой; скорость плавания равна скорости ходьбы." },
  { id: "shapeshifter", name: "Гибкая форма", price: 750, weight: 0.5, slot: "organs", donor: "Перевёртыш", desc: "Раз за долгий отдых измените внешность на срок до часа: рост, вес, лицо, голос, волосы, кожу и другие внешние признаки. Можно выглядеть другой расой; размер, характеристики и основная схема тела сохраняются. Облик выбирайте и отображайте вручную." },
  { id: "voice", name: "Голосовые связки", price: 150, weight: 0.5, slot: "head", donor: "Существо с Подражанием", desc: "Подражаете уже слышанным звукам и голосам. Слушатель распознаёт подражание встречной Мудростью (Проницательность) против вашей Харизмы (Обман). Кнопка бросает ваш Обман; встречную проверку делает слушатель." },
  { id: "dragon-lungs", name: "Драконьи лёгкие", price: 1000, weight: 2, slot: "organs", donor: "Гуманоид, Дракон или Монстр с атакой Дыхание", damageVariants: true, desc: "Раз за короткий/долгий отдых действием в свой ход выдохните 15-футовый конус. Ловкость против СЛ от Телосложения: число к6 равно вашему бонусу владения, половина урона при успехе. Тип урона фиксируется вариантом по дыханию донора." },
  { id: "replacement", name: "Замена органа", price: 400, weight: 2, donor: "Любое существо", slotVariants: true, desc: "Замена органа или конечности устраняет последствия ампутации/отказа органа, но не оживляет мёртвое. Внешность может сохранить признаки донора. Занимается соответствующая часть тела; функциональное восстановление и внешний вид определяет Мастер." },
  { id: "beast-weapons", name: "Звериное оружие", price: 200, weight: 1, donor: "Дракон, Зверь или Монстр с Укусом либо Когтями", weaponVariants: true, desc: "Природное оружие для безоружного удара: 1к6 + Сила либо Ловкость. Когти рубят и занимают руки, клыки колют и занимают голову. Повторный подходящий донор позволяет получить оба варианта; они занимают разные части тела." },
  { id: "beast-hide", name: "Звериная шкура", price: 250, weight: 10, slot: "skin", donor: "Зверь не меньше Большого", desc: "Природная броня: 13 + Ловкость. Можно использовать лучшую броню; щит даёт обычную пользу. Нативная формула выбирается вместе с остальными формулами КБ." },
  { id: "stench", name: "Зловонная секреция", price: 400, weight: 1, slot: "organs", donor: "Существо с Вонью", desc: "Раз за короткий/долгий отдых бонусным действием: каждое существо в 10 футах проходит Телосложение против СЛ от вашего Телосложения; провал — отравлено до конца своего следующего хода. Профиль применяйте провалившим; срок до следующего хода контролируйте вручную." },
  { id: "aberrant-anatomy", name: "Изменчивая анатомия", price: 1250, weight: 1, slot: "organs", donor: "Аберрация не меньше Среднего", desc: "Критические попадания по вам наносят обычный урон. Уберите добавочные критические кости в карточке урона вручную; постоянный иммунитет к типам урона не выдаётся." },
  { id: "hooves", name: "Копыта", price: 350, weight: 6, slot: "legs", donor: "Существо с Рывком либо атакой Бодание/Копыта", desc: "Раз за ход после движения минимум 15 футов по прямой получите ещё 10 футов движения в том же направлении, не расходуя скорость. Кнопка напоминает о преимуществе; пройденную линию, дополнительное движение и предел хода пока учитывайте вручную." },
  { id: "magic-synapses", name: "Магические синапсы", price: 1000, weight: 0.5, slot: "head", donor: "Существо с Врождённым колдовством", desc: "Изучаете один заговор волшебника от Интеллекта. Шаблон трансплантата предлагает нативный выбор заговора. Второй подходящий донор позволяет улучшить синапсы и изучить ещё один: добавьте отдельное улучшение из библиотеки. Без установленного трансплантата выданные этими записями заговоры блокируются." },
  { id: "venom-sac", name: "Мешочек с ядом", price: 350, weight: 1, slot: "organs", donor: "Существо, способное отравлять или наносить яд без оружия", desc: "Раз за короткий/долгий отдых бонусным действием покройте простым ядом своё природное оружие или оружие, которым владеете. СЛ яда равна 8 + бонус владения + Телосложение. Кнопка расходует применение; выбор оружия, покрытие и последствия простого яда пока ручные." },
  { id: "powerful-legs", name: "Мощные ноги", price: 400, weight: 6, slot: "legs", donor: "Существо с Наскоком или Прыжком с места", desc: "Удваивается дистанция прыжков; для прыжка в длину не нужен разбег. Дистанцию и расход перемещения пока учитывайте вручную." },
  { id: "giant-arms", name: "Огромные руки", price: 1500, weight: 20, slot: "arms", donor: "Великан", desc: "Ближние атаки оружием получают Досягаемость. Маленький носитель, владеющий тяжёлым оружием, игнорирует его штрафы. Преимущество проверок и испытаний Силы для удержания предметов. Досягаемость, конкретное оружие и условные преимущества пока настраивайте вручную." },
  { id: "smell", name: "Обонятельные имплантаты", price: 200, weight: 0.5, slot: "head", donor: "Существо с Тонким нюхом либо Острым слухом и тонким нюхом", desc: "Преимущество Мудрости (Восприятие), только если проверка опирается на обоняние. Выберите преимущество в подходящей проверке; зрительные и слуховые проверки этот трансплантат не усиливает." },
  { id: "web-gland", name: "Паутинная железа", price: 500, weight: 1, slot: "organs", donor: "Существо с атакой Паутина", desc: "Раз за короткий/долгий отдых сотворите Паутину без ячейки и материального компонента; СЛ от Телосложения. Словесный и соматический компоненты сохраняются." },
  { id: "steel-heart", name: "Стальное сердце", price: 2250, weight: 3, slot: "organs", donor: "Конструкт", desc: "Игнорируете один уровень истощения; долгий отдых занимает 4 часа. Эффективный уровень истощения для бросков/движения и длительность отдыха пока учитывайте вручную, не удаляя действительное состояние истощения." },
  { id: "regeneration", name: "Регенерация", price: 500, weight: 1, slot: "organs", donor: "Существо с Регенерацией", desc: "Раз за короткий/долгий отдых бонусным действием восстановите себе 1к10 + Телосложение хитов." },
  { id: "horns", name: "Рога", price: 350, weight: 2, slot: "head", hornVariants: true, donor: "Существо с атакой Бодание, Клыки, Рога или Таран", desc: "Безоружный удар: 1к6 + Сила, дробящий либо колющий по атаке донора. Пройдя минимум 10 футов по прямой к цели и попав рогами в тот же ход, потребуйте Силу против СЛ от вашей Силы; провал сбивает с ног. Предшествующее движение, попадание и соответствие типа донору пока проверяйте вручную." },
  { id: "darkvision", name: "Тёмное зрение", price: 300, weight: 0.5, slot: "head", donor: "Существо с Тёмным зрением", desc: "Тёмное зрение 60 футов: тусклое освещение как яркое, темнота как тусклое, без различения цветов в темноте. Большая существующая дальность не уменьшается." },
  { id: "climbing", name: "Цепкие конечности", price: 1250, weight: 6, slot: "legs", donor: "Гуманоид, Зверь или Монстр со скоростью лазания", desc: "Скорость лазания равна скорости ходьбы." },
  { id: "tail", name: "Цепкий хвост", price: 350, weight: 5, slot: "skin", donor: "Существо с атакой Удар хвостом", desc: "Безоружный удар: 1к6 + Сила либо Ловкость дробящего урона. Хвостом можно держать предметы, оружие без атак им и щит с обычной пользой. Дополнительную занятую конечность/щит и взаимодействия пока учитывайте вручную." },
  { id: "dragon-scales", name: "Чешуя дракона", alias: "Шкура дракона", price: 2250, weight: 15, slot: "skin", donor: "Дракон не меньше Большого", damageVariants: true, heavy: true, desc: "Также названа Шкурой дракона в описании. Базовая КБ 17 и сопротивление типу урона, к которому у дракона-донора иммунитет. Для установки требуется владение тяжёлыми доспехами. Нативная формула КБ участвует в обычном выборе брони/щита; тип сопротивления фиксируется вариантом." },
  { id: "fiend-scales", name: "Чешуя исчадия", price: 1500, weight: 10, slot: "skin", donor: "Исчадие не меньше Среднего", desc: "Природная броня: 15 + Ловкость, максимум добавки Ловкости 2. Нативная формула КБ участвует в обычном выборе брони и щита." },
  { id: "tentacles", name: "Щупальца", price: 500, weight: 4, slot: "arms", donor: "Существо с атакой Щупальце или Ложноножка", desc: "Безоружная ближняя атака в 10 футах: 1к6 + Сила либо Ловкость дробящего урона. После попадания можно бонусным действием попытаться захватить цель. Сам захват разрешите штатным правилом с учётом размера и попадания; кнопка только учитывает бонусное действие." },
  { id: "energy-stitch", name: "Энергетический шов", price: 500, weight: 1, slot: "skin", donor: "Дракон, Исчадие, Небожитель, Фея или Элементаль с подходящим сопротивлением/иммунитетом", energyVariants: true, desc: "Одно сопротивление урону звуком, кислотой, огнём, холодом, электричеством или ядом — по сопротивлению либо иммунитету донора. Тип фиксируется выбранным вариантом." }
];

export function graftVariants(row) {
  if (row.hornVariants) return GRAFT_DAMAGE_TYPES.filter(([type]) => ["bludgeoning", "piercing"].includes(type)).map(([damage, label]) => ({ id: damage, label, damage, slot: row.slot }));
  if (row.damageVariants || row.energyVariants) return GRAFT_DAMAGE_TYPES.filter(([type]) => !row.energyVariants || ["thunder", "acid", "fire", "cold", "lightning", "poison"].includes(type)).map(([damage, label]) => ({ id: damage, label, damage, slot: row.slot }));
  if (row.slotVariants) return Object.entries(SLOTS).map(([slot, label]) => ({ id: slot, label, slot }));
  if (row.weaponVariants) return [{ id: "claws", label: "Когти", slot: "arms", damage: "slashing" }, { id: "fangs", label: "Клыки", slot: "head", damage: "piercing" }];
  return [{ id: "", label: "", slot: row.slot }];
}
export const graftItemKey = (row, variant) => `item:alchemist-graft:${row.id}${variant.id ? `:${variant.id}` : ""}`;
const ICON = "icons/consumables/meat/heart-organ-red";
const common = { book: "VSS", page: "", sourceUrl: ALCHEMIST_URL, img: ICON };
export function define() {
  for (const row of ALCHEMIST_GRAFTS) {
    const variants = graftVariants(row), pool = [];
    for (const variant of variants) {
      const key = graftItemKey(row, variant), identifier = `alchemist-graft-item-${row.id}${variant.id ? `-${variant.id}` : ""}`;
      pool.push(ref(key));
      const name = `${row.name}${variant.label ? ` — ${variant.label}` : ""}`, acts = [], effects = [], other = {};
      const passive = (label, changes) => effects.push(effect(`${key}:passive`, { name: label, conditions: { k: `spikependium.graftActive.${identifier}`, v: true }, changes }));
      const action = (suffix, options) => utility(`${key}:${suffix}`, { spellSlot: false, ...options });
      const punch = (type, range = 5, abilities = ["str", "dex"]) => {
        for (const ability of abilities) acts.push(attack(`${key}:${ability}`, { name: `Безоружный удар: ${ability === "str" ? "Сила" : "Ловкость"}`, activation: "action", ability, classification: "unarmed", includeBase: false, range, count: 1, affects: "creature", damage: [dmg("1d6 + @mod", type)], spellSlot: false }));
      };
      if (row.id === "amphibious") passive("Амфибия: плавание", [change("system.attributes.movement.speeds.swim", "@attributes.movement.speeds.walk", "upgrade")]);
      if (row.id === "climbing") passive("Цепкие конечности: лазание", [change("system.attributes.movement.speeds.climb", "@attributes.movement.speeds.walk", "upgrade")]);
      if (row.id === "darkvision") passive("Тёмное зрение 60 футов", [change("system.attributes.senses.ranges.darkvision", 60, "upgrade")]);
      if (row.id === "beast-hide") passive("Звериная шкура", [change("system.attributes.ac.formulas", "13 + @abilities.dex.mod")]);
      if (row.id === "fiend-scales") passive("Чешуя исчадия", [change("system.attributes.ac.formulas", "15 + min(@abilities.dex.mod, 2)")]);
      if (row.id === "dragon-scales") passive("Чешуя дракона", [change("system.attributes.ac.formulas", "17"), change("system.traits.dr.value", variant.damage)]);
      if (row.id === "energy-stitch") passive("Энергетический шов", [change("system.traits.dr.value", variant.damage)]);
      if (row.id === "beast-weapons") punch(variant.damage);
      if (row.id === "tail") punch("bludgeoning");
      if (row.id === "tentacles") { punch("bludgeoning", 10); acts.push(action("grapple", { name: "После попадания: попытаться захватить", activation: "bonus", range: 10, count: 1, affects: "creature" })); }
      if (row.id === "horns") {
        punch(variant.damage, 5, ["str"]);
        const prone = effect(`${key}:prone`, { name: "Рога: сбит с ног", transfer: false, statuses: ["prone"] }); effects.push(prone);
        acts.push(save(`${key}:charge`, { name: "После разгона и попадания: испытание", activation: "special", ability: "str", dc: "str", count: 1, affects: "creature", effects: [prone._id], spellSlot: false }));
      }
      if (row.id === "voice") acts.push(check(`${key}:mimic`, { name: "Подражание: Обман против Проницательности", ability: "cha", associated: ["dec"], spellSlot: false }));
      if (row.id === "shapeshifter") {
        const shape = effect(`${key}:shape`, { name: "Изменённая внешность (отображение вручную)", transfer: false, seconds: 3600 }); effects.push(shape);
        other.uses = uses(1, LR); acts.push(form(`${key}:shape`, { name: "Изменить внешность", activation: "special", effects: [shape._id], duration: "hour", durationValue: 1, spellSlot: false, consume: [useSelf()] }));
      }
      if (row.id === "dragon-lungs") {
        other.uses = uses(1, SR);
        acts.push(save(`${key}:breath`, { name: `Дыхание: ${variant.label}`, activation: "action", self: true, template: { type: "cone", size: 15 }, affects: "creature", ability: "dex", dc: "con", damage: [dmg("@prof d6", variant.damage)], consume: [useSelf()], spellSlot: false }));
      }
      if (row.id === "stench") {
        const poisoned = effect(`${key}:poisoned`, { name: "Зловонная секреция: отравлен", transfer: false, expiry: "targetEnd", statuses: ["poisoned"] }); effects.push(poisoned);
        other.uses = uses(1, SR); acts.push(save(`${key}:stench`, { name: "Выпустить секрецию", activation: "bonus", self: true, template: { type: "radius", size: 10 }, affects: "creature", ability: "con", dc: "con", effects: [poisoned._id], consume: [useSelf()], spellSlot: false }));
      }
      if (row.id === "regeneration") { other.uses = uses(1, SR); acts.push(heal(`${key}:heal`, { name: "Регенерация", activation: "bonus", self: true, formula: "1d10 + @abilities.con.mod", consume: [useSelf()], spellSlot: false })); }
      if (row.id === "web-gland") { other.uses = uses(1, SR); acts.push(cast(`${key}:web`, srdSpellUuid("Web"), { name: "Паутинная железа", ability: "con", properties: ["vocal", "somatic"], spellSlot: false, consume: [useSelf()] })); }
      if (row.id === "venom-sac") { other.uses = uses(1, SR); acts.push(action("poison", { name: "Покрыть подходящее оружие простым ядом", activation: "bonus", consume: [useSelf()] })); }
      if (row.id === "hooves") acts.push(action("move", { name: "Дополнительные 10 футов по прямой", activation: "special" }));
      equipment({ ...common, key, identifier, name, folder: folder("items", `Алхимик (Valda)/Трансплантаты/${row.name}`), equipType: "trinket", properties: [], proficient: 1, price: row.price, weight: row.weight,
        priceNote: "Цена указана в таблице стоимости трансплантатов источника (2014); доступность продажи определяет Мастер.",
        weightNote: `Вес оценочный: ${row.weight} фунта по размеру заменяемой ткани/части тела; в источнике вес отсутствует. При установке и учёте нагрузки согласуйте его с Мастером.`,
        flags: { spikependium: { key, graft: { id: row.id, slot: variant.slot, heavy: !!row.heavy } } }, acts, effects, ...other,
        desc: `**Донор:** ${row.donor}. **Часть тела:** ${SLOTS[variant.slot]}.\n\n${row.desc}\n\n«Экипирован» означает: установка и обязательное восстановление уже закончены. На одной части тела действует один трансплантат. Подходящий донор, операция, затраты хитов/костей хитов и срок восстановления пока подтверждаются вручную. Вариант типа урона должен соответствовать донору.\n\nДля получения через нативный выбор используйте @UUID[${ref(`alchemist:graft:${row.id}`)}]{шаблон «${row.name}»}; он выдаёт этот физический предмет${row.id === "magic-synapses" ? " и выбор заговора" : ""}.` });
    }
    const advancement = variants.length === 1 ? [advItemGrant(`${row.id}:item`, 0, pool, { title: "Физический трансплантат" })]
      : [advItemChoice(`${row.id}:variant`, 0, { title: "Часть тела и свойства донора", type: "equipment", allowDrops: false, pool, count: 1 })];
    if (row.id === "magic-synapses") advancement.push(advItemChoice(`${row.id}:cantrip`, 0, { title: "Один заговор волшебника", type: "spell", list: ["class:wizard"], spellLevel: "0", count: 1, spell: spellConfig({ abilities: ["int"] }) }));
    feature({ ...common, key: `alchemist:graft:${row.id}`, identifier: `alchemist-graft-${row.id}`, name: row.name, pack: "classes", typeValue: "class", repeatable: row.id !== "magic-synapses",
      folder: folder("classes", "Алхимик (Valda)/Трансплантаты"), desc: `**Донор:** ${row.donor}.\n\n${row.desc}\n\nЭто шаблон получения: продвижение выдаёт физический трансплантат и, если нужно, выбор донора/части тела. После подтверждённой операции и восстановления отметьте выданный предмет экипированным. При замене трансплантата снимите старый предмет и связанный с ним шаблон; возврат уже потраченных ресурсов и хирургические последствия пока ручные.`, advancement });
  }
  feature({ ...common, key: "alchemist:graft:magic-synapses-upgrade", identifier: "alchemist-graft-magic-synapses-upgrade", name: "Магические синапсы — второй заговор", pack: "classes", typeValue: "class", prerequisiteItems: ["feat:alchemist-graft-magic-synapses"], folder: folder("classes", "Алхимик (Valda)/Трансплантаты/Улучшения"),
    desc: "После забора от второго подходящего донора и улучшения установленных Магических синапсов изучаете ещё один заговор волшебника от Интеллекта. Новую часть тела улучшение не занимает. Операцию и наличие второго донора подтверждает Мастер.", advancement: [advItemChoice("magic-synapses:upgrade", 0, { title: "Второй заговор волшебника", type: "spell", list: ["class:wizard"], spellLevel: "0", count: 1, spell: spellConfig({ abilities: ["int"] }) })] });
  journal({ key: "rules:alchemist-grafts", name: "Чудовищные трансплантаты — установка и доноры", folder: folder("rules", "Алхимик (Valda)"), pages: [{ name: "Установка", html: md(`Источник: <a href="${ALCHEMIST_URL}">Алхимик — чудовищные трансплантаты</a>, правила 2014.

Донор должен умереть не больше 48 часов назад либо сохраняться Нетленными останками/подобной магией; допустимы размеры от Среднего до Громадного. Забор занимает 10 минут; с одного трупа берётся не более одного трансплантата. Особые требования донора указаны на каждой записи; размер ткани можно изменить реагентами.

Первая установка занимает 1 час. Нужны набор лекаря, инструменты алхимика и нож либо доступ к ним, а также владеющий инструментами/медицинскими навыками помощник. Теряется половина текущих хитов и все кости хитов; трансплантат недоступен следующие 24 часа. Последующие установка, снятие или замена занимают 30 минут и отнимают половину текущих хитов, но не все кости хитов.

Занятые части: руки, кожа, голова, внутренности, ноги; одна действующая запись на часть тела. Сначала снимите прежний трансплантат. Замена органов не оживляет мёртвого. Ксенохимик с Безумным учёным не теряет хиты/кости хитов и не проходит период восстановления. Его алхимическому голему допустимо до трёх трансплантатов.

Экстрапланарный донор, возвращающийся на родной план после смерти, требует действующих Планарных уз: сначала наложите их, затем убейте донора и заберите ткань до окончания заклинания. Иные трансплантаты и доноров согласуйте с Мастером.

В модуле добавьте шаблон из «Классы → Алхимик → Трансплантаты»: нативный выбор создаст физический предмет с ценой, оценочным весом и механиками. Ксенохимик выбирает два шаблона на 2-м уровне. Пока предмет не экипирован, его действия и пассивные эффекты отключены. Отмечайте экипировку только после завершения операции/восстановления. Конфликт части тела и требование тяжёлых доспехов Чешуи дракона проверяются автоматически.

Забор из трупа, хирургические затраты, течение времени, удаление старых шаблонов и ряд условных эффектов пока ручные. Предел трёх трансплантатов у алхимического голема проверяется автоматически; его усиленные атаки трансплантатами пока настраивайте вручную. Приобретённый отдельно физический предмет Магических синапсов сам не открывает окно заговора: используйте соответствующий шаблон и не оставляйте лишнюю копию физического предмета.`) }] });
}
