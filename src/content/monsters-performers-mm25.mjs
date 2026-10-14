import { attack, cast, dmg, effect, save, srdSpellUuid, useActivity, utility } from "../../tools/lib/core.mjs";
import { folder, npc } from "../../tools/lib/docs.mjs";

const bio = "<h2>Художники и мастеры</h2><p>Среда обитания: любая. Сокровища: Инвентарь, Личные. Обзор: страница 16.</p>"
  + "<p>Мастера сцены выступают в величественных дворцовых залах и на скромных рыночных площадях. Они путешествуют, показывая таланты и мистические искусства, или служат при дворах великих держав. Некоторые передают профессиональные секреты и магические приёмы ученикам.</p>"
  + "<p>Профессии и роли: акробат, актёр, артист бурлеска, борец, воздушный гимнаст, глашатай, гуттаперча, джигит, жонглёр, каскадёр, комик, кукловод, менестрель, менталист, мим, певец, плакальщик, поэт, рассказчик, ритуалист, сценический боец, танцор, укротитель животных, уличный музыкант, устный историк, фокусник, хомейжи, циркач, шут.</p>"
  + "<p>Артист может быть Небольшим или Средним; размер по умолчанию Средний, при необходимости измените его на листе. Дополнительные языки выберите там же.</p>";
function multi(key, identifier) {
  const activity = utility(`${key}:multiattack`, { name: "Мультиатака", activation: "action", spellSlot: false });
  activity.flags = { spikependium: { multiattack: { weapon: identifier, count: 3 } } }; return activity;
}
function weapon(key, name, identifier, base, extra, img, price, type, properties, desc) {
  return { name, type: "weapon", img, desc, system: { identifier, type: { value: type, baseItem: type === "natural" ? "" : identifier },
    proficient: 1, equipped: true, identified: true, quantity: 1, weight: { value: 2, units: "lb" }, price: { value: price, denomination: "gp" },
    properties, range: { value: null, long: null, reach: 5, units: "ft" }, damage: { base } },
    acts: [attack(`${key}:attack`, { name, activation: "action", ability: "dex", range: 5, affects: "creature", count: 1,
      spellSlot: false, damage: extra ? [extra] : [] })] };
}
function melody(key, name, formula, dc, status) {
  const profile = effect(`${key}:${status}`, { name: `${name}: ${status === "charmed" ? "Очарование" : "Испуг"}`, statuses: [status],
    transfer: false, expiry: "sourceEnd", flags: { spikependium: { monsterEffect: `performer-${status}` } } });
  const activity = save(`${key}:${status}`, { name: `${name}: ${status === "charmed" ? "Очарование" : "Испуг"}`, activation: "action",
    ability: "wis", dc, range: 120, affects: "creature", template: { type: "sphere", size: 20 },
    spellSlot: false, damage: [dmg(formula, "psychic")], effects: [{ _id: profile._id, onSave: false }] });
  activity.flags = { spikependium: { monsterAction: `performer-${status}` } }; return { profile, activity };
}
function spells(key, specs) {
  return specs.map(([en, name, daily, level]) => cast(`${key}:${en}`, srdSpellUuid(en), { name, ability: "cha", properties: ["vocal", "somatic"],
    spellSlot: false, spellbook: false, ...(level ? { level } : {}),
    ...(daily ? { usesMax: 1, usesRecovery: [{ period: "day", type: "recoverAll" }], consume: [useActivity()] } : {}) }));
}
export function define() {
  const f = folder("creatures", "Энциклопедия чудовищ (2025)");
  const base = { book: "MM25", size: "med", creatureType: "humanoid", alignment: "Нейтральный", disposition: 0, folder: f,
    img: "icons/tools/instruments/lute-gold-brown.webp", movement: { walk: 30 }, languages: ["common"], treasure: ["armaments", "individual"], habitatCustom: "Любая" };
  npc({ ...base, key: "actor:mm25:performer", name: "Артист", en: "Performer", page: 16, ac: 13, hp: 27, hpFormula: "5d8+5", cr: 0.5,
    abilities: { str: 12, dex: 16, con: 12, int: 13, wis: 14, cha: 16 }, saves: ["dex", "cha"], skills: { acr: 1, ath: 1, prf: 2 },
    languagesCustom: "Один дополнительный язык", bio: bio + "<p>Обычные артисты — странствующие рассказчики, трактирные музыканты, местные исполнители и хористы. Часто это самоучки или начинающие студенты. Обычно владеют двумя-тремя инструментами или навыками.</p>",
    items: [
      weapon("mm25:performer:shortsword", "Короткий меч", "shortsword", dmg("1d6", "piercing"), null, "icons/weapons/swords/shortsword-guard-brown.webp", 10, "martialM", ["fin", "lgt"],
        "Бросок атаки в ближнем бою: +5, досягаемость 5 футов. Попадание: 1к6 + 3 колющего урона. Цена и вес — по базовому короткому мечу."),
      { name: "Невероятное уклонение", desc: "Реакция: по артисту попадает бросок атаки. Артист получает половину урона от этой атаки, округлённую вниз. При штатном применении урона связанной атаки предлагается потратить реакцию; уменьшение, сопротивления и временные хиты рассчитывает dnd5e. При использовании с листа выберите карточку ещё не разрешённого попадания. Возврат расхода реакции отменяет уменьшение для последующих применений этой карточки, но не откатывает уже полученный урон. Неизвестный КБ, несколько бросков в карточке, смешанное лечение с уроном и неоднозначные токены требуют ручного разрешения.",
        acts: [utility("mm25:performer:dodge", { name: "Невероятное уклонение", activation: "reaction", spellSlot: false, condition: "По артисту попадает бросок атаки" })] }
    ] });
  const virtuoso = melody("mm25:performer-virtuoso:melody", "Чарующая мелодия", "3d10+4", 15, "charmed");
  npc({ ...base, key: "actor:mm25:performer-virtuoso", name: "Виртуозный артист", en: "Performer Virtuoso", page: 17,
    ac: 18, hp: 110, hpFormula: "17d8+34", cr: 6, initiativeBonus: "@prof", spellcasting: "cha",
    abilities: { str: 12, dex: 18, con: 14, int: 13, wis: 14, cha: 19 }, saves: ["dex", "cha"], skills: { acr: 2, ath: 1, prc: 1, prf: 2, ste: 1 },
    languagesCustom: "Один дополнительный язык", bio: bio + "<p>Виртуозные артисты снискали громкую славу: ведущие театральные актёры, отчаянные каскадёры, придворные шуты с опасными политическими намёками. Некоторые наставляют других и передают секреты профессии.</p>",
    items: [
      { name: "Мультиатака", desc: "Три атаки Рапирой.", acts: [multi("mm25:performer-virtuoso", "rapier")] },
      weapon("mm25:performer-virtuoso:rapier", "Рапира", "rapier", dmg("1d8", "piercing"), dmg("2d6", "psychic"), "icons/weapons/swords/sword-guard-flanged.webp", 25, "martialM", ["fin"],
        "Бросок атаки в ближнем бою: +7, досягаемость 5 футов. Попадание: 1к8 + 4 колющего урона и 2к6 психического урона. Цена и вес — по базовой рапире."),
      { name: "Чарующая мелодия", desc: "Каждое существо в Сфере радиусом 20 футов с центром в пределах 120 футов: спасбросок Мудрости Сл 15. Провал: 3к10 + 4 психического урона и Очарование до конца следующего хода артиста. Успех: половина урона.",
        effects: [virtuoso.profile], acts: [virtuoso.activity] },
      { name: "Заклинания", desc: "Харизма, Сл 15. Материальные компоненты не требуются. Неограниченно: Малая иллюзия, Мелкие фокусы. Один раз в день: Безудержный смех Таши (3-й круг).",
        acts: spells("mm25:performer-virtuoso", [["Minor Illusion", "Малая иллюзия"], ["Prestidigitation", "Мелкие фокусы"], ["Hideous Laughter", "Безудержный смех Таши", true, 3]]) }
    ] });
  const charm = melody("mm25:performer-legend:melody", "Величественная мелодия", "4d8+4", 17, "charmed");
  const fear = melody("mm25:performer-legend:melody", "Величественная мелодия", "4d8+4", 17, "frightened");
  const defense = effect("mm25:performer-legend:defense", { name: "Защитное обворожение", statuses: ["charmed"], transfer: false, expiry: "sourceEnd",
    flags: { spikependium: { monsterEffect: "performer-defense" } } });
  const defensiveSave = save("mm25:performer-legend:defense", { name: "Защитное обворожение", activation: "reaction", spellSlot: false,
    ability: "wis", dc: 17, affects: "creature", count: 1, condition: "Существо попадает по артисту броском атаки", effects: [{ _id: defense._id, onSave: false }] });
  defensiveSave.flags = { spikependium: { monsterAction: "performer-defense" } };
  npc({ ...base, key: "actor:mm25:performer-legend", name: "Легендарный артист", en: "Performer Legend", page: 17,
    ac: 20, hp: 162, hpFormula: "25d8+50", cr: 10, initiativeBonus: "@prof", spellcasting: "cha",
    abilities: { str: 12, dex: 20, con: 14, int: 15, wis: 16, cha: 20 }, saves: ["dex", "int", "wis", "cha"],
    skills: { acr: 2, ath: 1, prc: 1, prf: 2, ste: 1 }, languagesCustom: "Два дополнительных языка",
    bio: bio + "<p>Легендарных артистов знают во многих странах и даже мирах. Их влияние позволяет попасть в высший свет или манипулировать толпой на выступлениях. Их отличают уникальные таланты: голос, невероятная физическая подготовка или непревзойдённый стиль. Они путешествуют с артистами, охранниками и знатными покровителями.</p>",
    items: [
      { name: "Мультиатака", desc: "Три атаки Жезлом с драгоценностями.", acts: [multi("mm25:performer-legend", "performer-jeweled-rod")] },
      weapon("mm25:performer-legend:rod", "Жезл с драгоценностями", "performer-jeweled-rod", dmg("2d4", "bludgeoning"), dmg("3d6", "psychic"), "icons/weapons/wands/wand-gem-red.webp", 10, "natural", [],
        "Бросок атаки в ближнем бою: +9, досягаемость 5 футов. Попадание: 2к4 + 5 дробящего урона и 3к6 психического урона. Отдельная цена и вес не даны; указаны оценочные значения базового жезла-фокуса: 10 зм, 2 фунта."),
      { name: "Величественная мелодия", desc: "Каждое существо в Сфере радиусом 20 футов с центром в пределах 120 футов: спасбросок Мудрости Сл 17. Провал: 4к8 + 4 психического урона, цель Очарована или Испугана (выберите соответствующее действие) до конца следующего хода артиста. Успех: половина урона.",
        effects: [charm.profile, fear.profile], acts: [charm.activity, fear.activity] },
      { name: "Заклинания", desc: "Харизма, Сл 17. Материальные компоненты не требуются. Неограниченно: Магическая рука, Малая иллюзия, Мелкие фокусы. По одному разу в день: Полноценный образ, Проекция образа.",
        acts: spells("mm25:performer-legend", [["Mage Hand", "Магическая рука"], ["Minor Illusion", "Малая иллюзия"], ["Prestidigitation", "Мелкие фокусы"], ["Major Image", "Полноценный образ", true], ["Project Image", "Проекция образа", true]]) },
      { name: "Защитное обворожение", desc: "Реакция после попадания существа по артисту: спасбросок Мудрости Сл 17 у атакующего. При провале атака промахивается, а атакующий Очарован до конца следующего хода артиста. После штатного попадания Мастеру предлагается применить реакцию; действие с листа позволяет выбрать ещё не разрешённое попадание. Атакующий выбирается из исходной карточки, текущие цели пользователя сохраняются. До решения по реакции остальные последствия попадания и урон ожидают. Провал меняет результат на промах и запрещает применение связанного урона; иммунитет к Очарованию предотвращает только состояние. Возврат расходов снимает Очарование и отменяет привязку реакции, а штатная Легендарная устойчивость меняет исход на успешный. Уже применённый урон при пересмотре разрешается вручную. Неизвестный КБ, несколько бросков или неоднозначные связанные токены требуют ручного разрешения. Прерванный спасбросок завершают кнопкой его карточки; автоматического повторного броска нет.",
        effects: [defense], acts: [defensiveSave] }
    ] });
}
