import { attack, cast, change, damage, dmg, effect, LR, save, srdSpellUuid, useActivity, useSelf, utility } from "../../tools/lib/core.mjs";
import { folder, npc, ref, rollTable } from "../../tools/lib/docs.mjs";

const key = "mm25:archhag", magical = { properties: ["mgc"] };
function spell(en, name, options = {}) {
  return cast(`${key}:${en}:${options.activation ?? "normal"}`, srdSpellUuid(en), { name, ability: "cha",
    properties: ["vocal", "somatic"], spellSlot: false, spellbook: false, ...options });
}
export function define() {
  const f = folder("creatures", "Энциклопедия чудовищ (2025)");
  const waveCurse = effect(`${key}:wave-curse`, { name: "Проклятие Трескучей волны", statuses: ["cursed"], transfer: false, expiry: "sourceEnd",
    flags: { spikependium: { monsterEffect: "archhag-wave", archhagCurse: true, noReactions: true } },
    description: "Нельзя совершать реакции до конца следующего хода архикарги. Успешный спасбросок не предотвращает это проклятие." });
  const verbalCurse = effect(`${key}:verbal-curse`, { name: "Проклятие Скороговорки", statuses: ["cursed"], transfer: false, expiry: "targetEnd",
    flags: { spikependium: { archhagCurse: true, noVerbalSpells: true } },
    description: "Нельзя накладывать заклинания со словесным компонентом; при разговоре существо говорит противоположное желаемому. До конца следующего хода цели." });
  const escapeCurse = effect(`${key}:escape-curse`, { name: "Проклятие Мстительного побега", statuses: ["cursed"], transfer: false,
    changes: ["rolls.ability.check.mode", "rolls.ability.save.mode", "attributes.death.roll.mode"].map(path => change(`system.${path}`, -1)),
    flags: { spikependium: { archhagCurse: true } },
    description: "Помеха проверкам характеристик и спасброскам. Архикарга знает местонахождение существа в мультивселенной. Пока проклятие не снято." });
  for (const profile of [waveCurse, verbalCurse, escapeCurse]) profile.system.magical = true;
  const prone = effect(`${key}:claws-prone`, { name: "Сбит Призрачными когтями", statuses: ["prone"], transfer: false });
  const wave = save(`${key}:wave`, { name: "Трескучая волна", activation: "action", spellSlot: false,
    ability: "dex", dc: 22, rangeUnits: "self", affects: "creature", template: { type: "cone", size: 60 },
    damage: [dmg("5d12", "lightning")], effects: [{ _id: waveCurse._id, onSave: true }] });
  wave.flags = { spikependium: { monsterAction: "archhag-wave" } };
  const multi = utility(`${key}:multiattack`, { name: "Мультиатака", activation: "action", spellSlot: false });
  multi.flags = { spikependium: { multiattack: { weapon: "archhag-spectral-claws", count: 2, finishers: ["archhag-crackling-wave"] } } };
  const swipe = utility(`${key}:swipe`, { name: "Взмах карги", activation: "legendary", spellSlot: false,
    condition: "Сразу после хода другого существа" });
  swipe.flags = { spikependium: { multiattack: { weapon: "archhag-spectral-claws", count: 1 } } };
  const baneKey = "table:mm25:archhag-bane";
  const actor = npc({ key: "actor:mm25:archhag", name: "Архикарга", en: "Archhag", book: "MM25", page: 19, folder: f,
    img: "icons/magic/control/debuff-energy-snare-purple-pink.webp", size: "lg", tokenSize: 2, creatureType: "fey",
    alignment: "Нейтральная злая", disposition: -1, ac: 20, hp: 333, hpFormula: "29d10+174", cr: 21,
    initiativeBonus: "@prof * 2", spellcasting: "cha", movement: { walk: 40 },
    abilities: { str: 24, dex: 15, con: 23, int: 19, wis: 19, cha: 25 }, saves: ["dex", "wis"], skills: { prc: 1, dec: 1, per: 2 },
    dr: ["fire", "psychic", "cold"], ci: ["frightened", "charmed", "exhaustion"], senses: { truesight: 60 }, languages: ["all"],
    habitatCustom: "Любая", treasure: ["arcana"],
    resources: { legact: { max: 3, spent: 0 }, legres: { max: 4, spent: 0 }, lair: { value: true, initiative: null, inside: false } },
    bio: "<h2>Ведьма запретных тайн и магического коварства</h2><p>Среда обитания: любая. Сокровища: Магия. Описание и слабости: страница 18; статблок и логово: страница 19.</p>"
      + "<p>Бессмертные, непредсказуемые архикарги собирают тайны и заключают волшебные сделки, управляя чужими судьбами по своей прихоти. Они стремятся разгадать тайны мультивселенной и используют странную магию для непостижимых целей. Эгоизм и жадность сочетаются с экстравагантными манерами и очарованием.</p>"
      + "<p>Архикарга может поделиться запретным знанием в обмен на поручение, ценный магический предмет, воспоминания, год жизни или способность плакать. Обычно она избегает боя; прижатая к стене, сражается призрачными когтями, молниями и завораживающими заклинаниями, проклинает речь других заклинателей и ищет способ ускользнуть ради будущей мести.</p>"
      + "<p>У каждой архикарги есть уникальная погибель — предмет, существо или явление, связанное с судьбоносным прошлым либо противоположное её магии. Мастер определяет слабость; её нужно принести в пределах 30 футов, чтобы убить архикаргу. @UUID[" + ref(baneKey) + "]{Погибель архикарги: выбрать или бросить}</p>"
      + "<h3>Логово</h3><p>Тайный демиплан, особняк на грозовой туче или избушка на гигантских куриных ногах; интерьер меняется и обладает удивительными особенностями.</p>"
      + "<p>В пределах 1 мили существа, кроме карги и её союзников, вычитают [[/r 1d10]] из проверки характеристики при действии Влияние. Завершившие здесь долгий отдых при первом последующем заклинании с ячейкой также накладывают Замешательство с центром на себе, используя собственную заклинательную характеристику и без концентрации. После смерти карги или переноса логова оба эффекта немедленно прекращаются. Центр логова, союзников и региональные последствия пока определяет Мастер.</p>",
    items: [
      { name: "Легендарная устойчивость", desc: "4 применения в день, 5 в логове. На карточке проваленного спасброска нажмите штатную кнопку Легендарной устойчивости: расход и успешный результат учитывает dnd5e." },
      { name: "Магия ковена", system: { identifier: "archhag-coven", ...magical }, uses: { max: "1", spent: 0, recovery: [LR] },
        desc: "Пока в 30 футах есть минимум две союзные карги: можно накладывать одно из перечисленных заклинаний с обычным временем, без материальных компонентов, используя Интеллект (Сл 19). Все шесть вариантов расходуют одно общее применение, восстанавливаемое после долгого отдыха. Союзные карги распознаются по записи модуля или имени карги и одинаковой ненейтральной принадлежности токенов. Для нейтральных и необычных союзов либо игры без карты подтвердите условие в штатном окне применения.",
        acts: [["Divination", "Гадание"], ["Unseen Servant", "Невидимый слуга"], ["Identify", "Опознание"], ["Locate Object", "Поиск предмета"],
          ["Find Familiar", "Призыв фамильяра"], ["Scrying", "Тайновидение"]].map(([en, name]) => spell(en, name, { ability: "int", consume: [useSelf()] })) },
      // shortcut: побег и межпланарный перенос разрешает Мастер; заменить при добавлении перехвата 0 ПЗ и сохранения исходной эманации.
      { name: "Мстительный побег", system: { identifier: "archhag-vengeful-escape", ...magical }, effects: [escapeCurse],
        desc: "При падении до 0 ПЗ архикарга умирает только при наличии погибели в 30 футах. Иначе её ПЗ становятся 1, и она телепортируется в безопасный демиплан, откуда может вернуться через 2к6 дней. После телепортации каждое существо в 60 футах от покинутого пространства проклято: помеха проверкам характеристик и спасброскам; карга знает его местонахождение в мультивселенной. Пока Мастер проверяет погибель, изменяет ПЗ и переносит токен; проклятие примените кнопкой эффектов к выбранным существам. Мастер проверяет расстояние до 60 футов от исходного пространства карги.",
        acts: [utility(`${key}:return-days`, { name: "Дни до возвращения", activation: "", spellSlot: false, roll: "2d6" }),
          utility(`${key}:escape-curse-apply`, { name: "Проклятие после побега", activation: "", spellSlot: false, range: 60, affects: "creature", effects: [escapeCurse._id] })] },
      { name: "Устойчивость к магии", system: { identifier: "magic-resistance" }, flags: { spikependium: { magicResistance: true } },
        desc: "Преимущество спасброскам против заклинаний и других магических эффектов. Для связанной карточки заклинания или магической способности оно выбирается автоматически; несвязанный магический источник подтвердите в окне." },
      { name: "Мультиатака", desc: "Две атаки Призрачными когтями и Трескучая волна.", acts: [multi] },
      { name: "Призрачные когти", type: "weapon", img: "icons/magic/unholy/hand-claw-fire-blue.webp", effects: [prone],
        desc: "Атака +14: досягаемость 10 футов или дистанция 60 футов. Урон 3к6 + 7 силой. Существо не больше Крупного сбито с ног при попадании. Естественная магическая атака не является продаваемым предметом.",
        system: { identifier: "archhag-spectral-claws", type: { value: "natural", baseItem: "" }, proficient: 1, equipped: true, identified: true,
          quantity: 1, ...magical, weight: { value: 0, units: "lb" }, price: { value: 0, denomination: "gp" },
          range: { value: 60, long: null, reach: 10, units: "ft" }, damage: { base: dmg("3d6", "force") } },
        acts: ["melee", "ranged"].map(type => attack(`${key}:claws:${type}`, { name: `Когти: ${type === "melee" ? "ближний бой" : "дистанционная"}`,
          activation: "action", ability: "cha", attackType: type, range: type === "melee" ? 10 : 60, affects: "creature", count: 1, spellSlot: false })) },
      { name: "Трескучая волна", system: { identifier: "archhag-crackling-wave", ...magical }, effects: [waveCurse], acts: [wave],
        desc: "60-футовый конус: спасбросок Ловкости Сл 22, 5к12 молнией, половина при успехе. При любом результате существо проклято и не может совершать реакции до конца следующего хода карги. Выберите цели конуса перед применением; проклятие применяется после штатного спасброска." },
      { name: "Заклинания", system: magical, desc: "Харизма, Сл 22; материальные компоненты и ячейки не требуются. Неограниченно: Дверь в пространстве, Завораживающий узор, Обнаружение мыслей, Рассеивание магии. По 2 применения в день: Манипуляция памятью, Массовое внушение, Планарный переход.",
        acts: [["Dimension Door", "Дверь в пространстве"], ["Hypnotic Pattern", "Завораживающий узор"], ["Detect Thoughts", "Обнаружение мыслей"], ["Dispel Magic", "Рассеивание магии"],
          ["Modify Memory", "Манипуляция памятью", true], ["Mass Suggestion", "Массовое внушение", true], ["Plane Shift", "Планарный переход", true]]
          .map(([en, name, daily]) => spell(en, name, daily ? { usesMax: 2, usesRecovery: [{ period: "day", type: "recoverAll" }], consume: [useActivity()] } : {})) },
      { name: "Удар ведьмы", system: { identifier: "archhag-witch-strike", ...magical },
        desc: "Каждое проклятое именно этой каргой существо в пределах 60 футов получает 4к6 молнией. Цели на сцене автоматически выбираются по источнику действующего проклятия и расстоянию; текущие цели пользователя сохраняются. Урон применяется штатной кнопкой. Для проклятий вне этого модуля источник и получателей проверяет Мастер.",
        acts: [damage(`${key}:witch-strike`, { name: "Удар ведьмы", activation: "bonus", spellSlot: false, range: 60, affects: "creature", damage: [dmg("4d6", "lightning")] })] },
      // shortcut: проклятие после Контрзаклинания применяется кнопкой; связать с подтверждённым исходным спасброском.
      { name: "Скороговорка", system: { identifier: "archhag-counterspell", ...magical }, effects: [verbalCurse],
        desc: "Реакция: Контрзаклинание (Харизма, Сл 22), когда срабатывает условие заклинания. При провале спасброска цель также проклята до конца своего следующего хода: не может накладывать заклинания со словесным компонентом и говорит противоположное желаемому. После подтверждённого провала используйте отдельную кнопку проклятия: дополнительную реакцию она не расходует. Автоматическая привязка проклятия к исходному Контрзаклинанию ещё дорабатывается.",
        acts: [spell("Counterspell", "Скороговорка: Контрзаклинание", { activation: "reaction" }),
          utility(`${key}:verbal-curse-apply`, { name: "Проклятие после провала Контрзаклинания", activation: "", spellSlot: false, affects: "creature", count: 1, effects: [verbalCurse._id] })] },
      { name: "Взмах карги", desc: "Легендарное действие: одна атака Призрачными когтями.", acts: [swipe] },
      { name: "Подлая магия", system: { identifier: "archhag-foul-magic", ...magical }, uses: { max: "1", spent: 0, recovery: [{ period: "turnStart", type: "recoverAll" }] },
        desc: "Легендарное действие: Дверь в пространстве или Завораживающий узор. Оба варианта расходуют общее применение; оно восстанавливается в начале следующего хода карги. Вне боя восстановление отмечает Мастер.",
        acts: [["Dimension Door", "Подлая магия: Дверь в пространстве"], ["Hypnotic Pattern", "Подлая магия: Завораживающий узор"]]
          .map(([en, name]) => spell(en, name, { activation: "legendary", consume: [useSelf()], condition: "Сразу после хода другого существа" })) },
      // shortcut: регион логова разрешает Мастер; заменить при добавлении координат логова, отметок отдыха и scoped-проверок Влияния.
      { name: "Оговорка логова", desc: "Существа, кроме карги и её союзников, в пределах 1 мили вычитают 1к10 из проверки характеристики при действии Влияние. Мастер проверяет границы логова, союзников и подходящее действие.",
        acts: [utility(`${key}:influence-penalty`, { name: "Штраф к действию Влияние", activation: "", spellSlot: false, roll: "1d10" })] },
      { name: "Назойливая магия логова", desc: `После долгого отдыха в 1 миле от логова первое последующее заклинание с ячейкой также накладывает @UUID[${srdSpellUuid("Confusion")}]{Замешательство} с центром на существе, с его заклинательной характеристикой и без концентрации. Карга и союзники исключены. Отдых, первое применение, выбор исключений и прекращение региональных эффектов после смерти или переноса логова пока отслеживает Мастер.` }
    ] });
  rollTable({ key: baneKey, name: "Погибель архикарги", book: "MM25", page: 18,
    folder: folder("tables", "Энциклопедия чудовищ (2025)"), description: "<p>Выберите уникальную слабость архикарги или совершите бросок 1к10.</p>",
    rows: ["Кости её первого возлюбленного.", "Слеза дьявола.", "Яйцо с миниатюрным замком внутри.", "Цветок, распускающийся только при остановке времени.",
      "Подарок от близнеца карги.", "Худший каламбур в мультивселенной.", "Один из выпавших зубов карги.", "Снег с вершины Горы Целестия.",
      "Упавшая с неба звезда.", "Нитка из мантии Леди Боли."] });
  return actor;
}
