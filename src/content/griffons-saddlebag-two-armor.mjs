import bases from "../../tools/data/griffon-two-armor-bases.json" with { type: "json" };
import { griffonItem } from "./griffons-saddlebag.mjs";
import { utility, cast, form, teleport, save, damage, heal, dmg, effect, change, uses, useSelf, useActivity, DAWN, srdSpellUuid } from "../../tools/lib/core.mjs";

export const GRIFFON_TWO_ARMOR = [
  ["Freerunner's Armor", "freerunner", "common", false, ["padded", "leather", "studded"]],
  ["Angler's Armor", "angler", "uncommon", true, ["scalemail"]],
  ["Armor of Icarus", "icarus", "rare", true, ["breastplate"]],
  ["Mistwalker Armor", "mistwalker", "rare", true, ["leather"]],
  ["Owlbear Leather Armor", "owlbear", "uncommon", true, ["leather"]],
  ["Wildskin Armor", "wildskin", "uncommon", true, ["hide"]],
  ["Scorpio Armor", "scorpio", "uncommon", true, ["halfplate", "plate"]],
  ["Scorned Heart Breastplate", "scorned-heart", "rare", true, ["breastplate"]],
  ["Myceliaweave Armor", "mycelia", "rare", true, ["leather", "studded", "hide"]],
  ["Phoenix Breastplate", "phoenix-armor", "veryRare", true, ["breastplate"]],
  ["Novanite Armor", "novanite", "veryRare", true, ["chainshirt", "scalemail", "breastplate", "halfplate", "ringmail", "chainmail", "splint", "plate"]],
  ["Mourningsteel Half Plate", "mourningsteel", "legendary", true, ["halfplate"]]
];
const tag = (activity, flags) => Object.assign(activity, { flags: { spikependium: flags } });
export function define() {
  for (const [en, id, rarity, attuned, types] of GRIFFON_TWO_ARMOR) {
    const key = `gs2:${id}`, opts = { rarity, attunement: attuned ? "required" : "", effects: [], acts: [] };
    if (id === "freerunner") {
      opts.desc = "Нося доспех, при первом в свой ход прыжке в длину на нескользкую стену или вдоль неё можете двигаться по стене на длину этого прыжка в течение данного перемещения. Если перемещение осталось, со стены можно совершить второй прыжок. Кнопка отмечает применение раз в свой ход. Поверхность, длину прыжка и оставшееся перемещение проверяйте вручную; постоянной скорости лазания и дополнительного перемещения доспех не даёт.";
      opts.acts.push(tag(utility(`${key}:wall`, { name: "Первый прыжок в свой ход: пробежать по стене", activation: "special", spellSlot: false }), { oncePerTurn: true, ownTurn: true }));
    } else if (id === "angler") {
      opts.effects.push(effect(`${key}:swim`, { name: "Доспех рыболова: плавание 30 футов", changes: [change("system.attributes.movement.speeds.swim", 30, "upgrade")] }));
      opts.desc = "Нося настроенный доспех, получаете скорость плавания 30 футов и удвоенные обычную и максимальную дистанции сетей. При рыбалке вылавливаете вдвое больше рыбы. Плавание и дистанции штатных сетей на листе пересчитываются автоматически, пока доспех надет и настроен; бонус нескольких таких доспехов не складывается. Для сети 2024 дистанция спасброска становится 30 футов, для сети-оружия 2014 удваиваются обе дистанции. Дополнительный улов и нестандартные самодельные сети учитывайте вручную.";
    } else if (id === "icarus") {
      opts.magicalBonus = 1; opts.uses = uses(6, DAWN("1d4+2"));
      const glide = effect(`${key}:glide`, { name: "Крылья Икара: горизонтальное планирование", transfer: false, flags: { spikependium: { griffonIcarusGlide: true } }, changes: [change("system.attributes.movement.speeds.fly", 30, "upgrade")] });
      opts.effects.push(glide);
      opts.desc = "Бонус +1 КД. Шесть зарядов; на рассвете восстанавливаются 1к4+2. Действием за заряд расправьте крылья и пролетите до 60 футов по прямой к видимой точке яркого света без провоцированных атак. Крылья остаются до касания земли: снижение 30 футов за раунд и полёт 30 футов для горизонтального планирования, без подъёма, кроме нового оплаченного полёта к свету. При приземлении урона падения нет, крылья складываются. КД, ресурс, действие и включаемый профиль полёта настроены; при снятии доспеха/настройки профиль удаляется. Начальный перелёт, яркий свет, прямую траекторию, отсутствие провоцированных атак именно при этом перелёте, высоту, снижение и посадку разрешайте вручную. При посадке нажмите «Сложить крылья».";
      opts.acts.push(tag(form(`${key}:fly`, { name: "К видимому яркому свету: полёт до 60 футов", activation: "action", effects: [glide._id], consume: [useSelf()], spellSlot: false }), { griffonArmorPaid: true }),
        tag(utility(`${key}:end`, { name: "Посадка: сложить крылья", activation: "special", spellSlot: false }), { icarusEnd: true }));
    } else if (id === "mistwalker") {
      opts.uses = uses(1, DAWN());
      opts.desc = "Нося настроенный доспех, действием раз до рассвета сотворите Туманное облако 2-го круга. Заклинание сохраняет обычную концентрацию. Туман не мешает вам видеть. Находясь в непроглядном тумане, можете потратить перемещение для телепортации в видимое свободное пространство в тумане: стоимость равна расстоянию. Cast-ссылка, круг и расход настроены. Кнопка телепортации открывает штатное размещение; перед ним проверьте оба пространства, видимость и остаток перемещения, после перемещения спишите пройденное расстояние. Ограничение скоростью в кнопке не учитывает уже потраченное движение. Видимость только сквозь туман и цену перемещения пока разрешайте вручную.";
      opts.acts.push(tag(cast(`${key}:fog`, srdSpellUuid("Fog Cloud"), { name: "Туманное облако — 2-й круг", level: 2, activation: "action", consume: [useSelf()], spellSlot: false }), { griffonArmorPaid: true }),
        teleport(`${key}:step`, { name: "Между пространствами в тумане: потратить перемещение", activation: "special", distance: "@attributes.movement.max", spellSlot: false }));
    } else if (id === "owlbear") {
      opts.uses = uses(1, DAWN());
      opts.desc = "Нося настроенный доспех, при провале спасброска Телосложения от враждебного источника можете вместо этого преуспеть. Раз до рассвета. После публикации проваленного штатного спасброска модуль предлагает подтвердить враждебность источника и заменить результат. Подтверждение расходует применение штатным действием доспеха и помечает исходный спасбросок успешным, сохраняя кость. При отмене выбора ресурс не тратится. Если последствия провала уже применены, пересчитайте их вручную; отмена расхода сама не возвращает исходный результат спасброска.";
      opts.acts.push(tag(utility(`${key}:resist`, { name: "Враждебный эффект: заменить провал Телосложения успехом", activation: "special", consume: [useSelf()], spellSlot: false }), { griffonArmorPaid: true, owlbearSuccess: true }));
    } else if (id === "wildskin") {
      opts.uses = uses(1, DAWN());
      const skin = effect(`${key}:skin`, { name: "Дикая шкура: КД звериного облика", transfer: false,
        conditions: { k: "spikependium.wildskinActive", v: true }, flags: { spikependium: { griffonWildskin: true } },
        changes: [change("system.attributes.ac.formulas", "14 + min(2, @abilities.dex.mod)")] });
      opts.effects.push(skin);
      opts.desc = "Настройка друидом. Когда используете Дикий облик, можете раз до рассвета укрепить принятый облик: КД 14 + Ловкость (не более +2), если текущий КД не выше. Работает и при слиянии доспеха с обликом. Сразу после штатного превращения выделите свой звериный токен и нажмите кнопку на доспехе исходного друида: применение списывается там, а профиль КД автоматически накладывается только на выбранный связанный облик. Проверяются зверь, владелец и связь originalActor; подтвердите, что это именно Дикий облик. Профиль не улучшает гуманоидное тело, не переносится на следующий облик и не понижает более высокий КД. Отмена уже оплаченного применения сама не удаляет применённый профиль. Внешние модули превращения без штатной связи обрабатывайте вручную.";
      opts.acts.push(tag(utility(`${key}:skin`, { name: "Только что принят Дикий облик: укрепить выделенного зверя", activation: "special", effects: [skin._id], spellSlot: false, consume: [useSelf()] }), { griffonArmorPaid: true, wildskinGrant: true }));
    } else if (id === "scorpio") {
      opts.uses = uses(1, { period: "dusk", type: "recoverAll", formula: "" });
      opts.desc = "Даже без настройки, пока носите доспех: в тусклом свете или темноте исчезает помеха Скрытности самого доспеха; на солнечном свету скорость −5 футов. Кнопкой выберите текущее освещение: «Тусклый свет/темнота», «Солнце» либо «Прочее». Это ручное подтверждение окружения; свет токена не равен солнечному свету. Пересчитываются штатное свойство брони и скорость до множителей/замедлений; другие причины помехи сохраняются. При настройке дополнительно получаете преимущество спасбросков от яда. Бонусным действием, закрыв глаза и произнеся командное слово, раз до заката мгновенно узнаёте наличие и положение существ на земле в 30 футах, будто по чувству вибрации. Кнопка расходует ресурс, раскрытие допустимых токенов выполняет Мастер: постоянного чувства вибрации доспех не выдаёт. Преимущество автоматически распознаётся по связанному ядовитому урону/профилю Отравлен; неизвестные источники разрешайте вручную.";
      for (const [mode, label] of [["dim", "Тусклый свет или темнота"], ["sun", "Солнечный свет"], ["other", "Прочее освещение"]])
        opts.acts.push(tag(utility(`${key}:${mode}`, { name: label, activation: "special", spellSlot: false }), { scorpioLight: mode }));
      opts.acts.push(tag(utility(`${key}:pulse`, { name: "Закрыть глаза и произнести слово: почувствовать землю 30 футов", activation: "bonus", spellSlot: false, consume: [useSelf()] }), { griffonArmorPaid: true, griffonCommandWord: true }));
    } else if (id === "scorned-heart") {
      opts.uses = uses(1, DAWN());
      opts.effects.push(effect(`${key}:allies`, { name: "Отвергнутое сердце: КД от союзников", changes: [change("system.attributes.ac.bonus", "@spikependium.scornedAC")] }),
        effect(`${key}:curse`, { name: "Проклятие отвергнутого сердца", transfer: false, flags: { spikependium: { scornedCurse: true } }, description: "Помеха спасбросков от очарования и проверок Харизмы при общении с привлекательным для вас существом. Сохраняется после снятия/прекращения настройки. После Снятия проклятия или аналогичной магии удалите этот эффект с персонажа." }));
      opts.desc = "Нося настроенную кирасу, получаете +1 КД за каждых двух союзников в 10 футах, не более +2. Выделите союзников целями и нажмите «Указать союзников»: их токены сохраняются, расстояние/КД пересчитываются автоматически. Цвет токена не определяет союз. Для расчёта нужен один ваш токен на текущей сцене; при нескольких токенах одного персонажа разрешайте бонус вручную. Повторная кнопка с пустыми целями очищает список; выбор союзников и его изменения подтверждает игрок. Реакцией раз до рассвета доступно Адское возмездие 3-го круга, СЛ 15.\n\nПроклятие: настройка создаёт отдельный эффект на персонаже. Снятие кирасы, передача или прекращение настройки его не оканчивают. Пока прокляты, совершаете с помехой спасброски от очарования и проверки Харизмы при взаимодействии с привлекательным для вас существом. Связанные профили Очарован распознаются автоматически; привлекательность и неизвестные причины спасбросков подтверждайте вручную. После Снятия проклятия или подобной магии удалите эффект с персонажа: он не возвращается от обычного обновления листа, но новая настройка снова проклинает.";
      const rebuke = cast(`${key}:rebuke`, srdSpellUuid("Hellish Rebuke"), { name: "Адское возмездие — 3-й круг, СЛ 15", activation: "reaction", level: 3, consume: [useSelf()], spellSlot: false });
      rebuke.spell.challenge = { override: true, attack: "", save: "15" };
      opts.acts.push(tag(rebuke, { griffonArmorPaid: true }), tag(utility(`${key}:allies`, { name: "Указать союзников из выбранных целей (пусто — очистить)", activation: "special", spellSlot: false }), { scornedAllies: true }));
    }
    if (id === "mycelia") {
      opts.effects.push(effect(`${key}:con`, { name: "Мицелий: Телосложение +2, не выше 20", changes: [change("system.abilities.con.value", "+2 <=20")] }),
        effect(`${key}:resistance`, { name: "Мицелий: сопротивление некротическому урону", conditions: { k: "spikependium.myceliaTemp", v: true }, changes: [change("system.traits.dr.value", "necrotic")] }));
      opts.desc = "Нося настроенный доспех, получаете +2 Телосложения, не выше 20; исходное значение выше 20 не понижается. После восстановления хитов заклинанием или магическим эффектом получаете временные хиты: половина фактически восстановленных хитов вниз, максимум 15. Пока сохраняются именно эти временные хиты, имеете сопротивление некротическому урону. Штатное магическое лечение распознаётся по заклинанию или магическому источнику; при неизвестном источнике кнопкой подтвердите последнее зарегистрированное лечение. Она использует сохранённый фактический прирост хитов, без нового броска; подтверждайте сразу после лечения. Сохраняются более высокие временные хиты; при равенстве выбираются новые от мицелия. Остаток мицелиевых хитов отслеживается отдельно от чужих. Ручное увеличение/замена временных хитов сбрасывает их происхождение.\n\nПроклятие: после надевания и настройки нельзя снять или удалить доспех до смерти либо Снятия проклятия. Подтвердив такую магию, нажмите кнопку освобождения; снятие проклятия само по себе не заменяет переключение настройки. При прекращении настройки получаете −2 Телосложения, не ниже 1, на 2к6+6 дней по часам мира или до новой настройки на тот же физический доспех. Долг сохраняется при удалении/передаче предмета, другая копия его не снимает. Повторные одинаковые эффекты отвыкания не складываются: сохраняются сроки каждого доспеха. Отмена уже применённого лечения/ручные изменения исходных хитов требуют ручного пересчёта выданных временных хитов.";
      opts.acts.push(tag(utility(`${key}:healing`, { name: "Подтвердить магический источник последнего лечения", activation: "special", spellSlot: false }), { myceliaHealing: true }),
        tag(utility(`${key}:release`, { name: "После Снятия проклятия: разрешить снятие доспеха", activation: "special", spellSlot: false, requireMagic: false }), { myceliaRelease: true }));
    }
    if (id === "phoenix-armor") {
      opts.magicalBonus = 1; opts.uses = uses(1);
      opts.effects.push(effect(`${key}:fire`, { name: "Феникс: сопротивление огню", changes: [change("system.traits.dr.value", "fire")] }));
      opts.desc = "КД +1 и сопротивление огню. Когда хиты опускаются до 0, но вы не погибаете сразу, можете вместо этого остаться с 1 хитом и вызвать огненный взрыв 30 футов. Враждебные существа: Ловкость СЛ 16, 3к10 огня, успех — половина. Вы и дружественные существа вместо урона восстанавливаете столько же хитов, сколько выпало на этих 3к10. Следующее применение через 1к6+1 день по часам мира, отдых его не восстанавливает. При штатном применении урона модуль предлагает спасение перед записью 0 хитов и списывает ресурс вместе с заменой результата на 1. Мгновенную смерть от особых эффектов и необычные источники урона разрешайте вручную. Бросьте огненный урон оплаченной карточкой; кнопка лечения использует этот сохранённый результат без новых костей. Цели, враждебность/дружественность, дальность и применение лечения каждому получателю подтверждаются вручную. Откат ресурса и уже применённых последствий проверяйте отдельно.";
      opts.acts.push(tag(save(`${key}:burst`, { name: "При снижении до 0: спасение феникса и взрыв", activation: "special", ability: "dex", dc: 16, template: { type: "radius", size: 30 }, damage: [dmg("3d10", "fire")], consume: [useSelf()], spellSlot: false }), { griffonArmorPaid: true, griffonCooldown: 86400, griffonCooldownDaysRoll: "1d6+1", phoenixBurst: true }),
        tag(heal(`${key}:heal`, { name: "Себя и союзников: лечение по сохранённым 3к10", activation: "special", formula: "0", spellSlot: false }), { phoenixHealing: true }));
    } else if (id === "novanite") {
      opts.magicalBonus = 1; opts.uses = uses(1);
      const astral = effect(`${key}:astral`, { name: "Нованит: на Астральном плане до начала следующего хода", transfer: false, expiry: "sourceStart", flags: { spikependium: { novaniteAstral: true } } });
      opts.effects.push(astral);
      opts.desc = "КД +1. Действием с командным словом выберите видимое пространство в 30 футах, исчезните на Астральном плане до начала следующего своего хода, затем появитесь в выбранном месте. Повтор через 12 часов по времени мира. Если место занято существом или предметом: 3к6 силовым полем вам, появление в ближайшем свободном пространстве. При исчезновении и появлении другие существа в 10 футах: Сила СЛ 15, 3к6 силовым полем, половина при успехе; провал также притягивает до 10 футов при исчезновении либо отталкивает на 10 футов при появлении. Настроены КД, оплаченный маркер до следующего своего хода, таймер 12 часов, отдельные испытания и урон столкновения. Выбранное заранее место, перенос между планами, скрытие/возвращение токена, свободное пространство, ближайшая точка и принудительное движение пока выполняются Мастером вручную. Маркер не даёт телу иммунитетов. Кнопку прибытия используйте в начале следующего своего хода; в бою она не доступна раньше. Вне боя последовательность контролирует Мастер.";
      opts.acts.push(tag(form(`${key}:depart`, { name: "Выбрать место в 30 футах: уйти в Астрал", activation: "action", effects: [astral._id], consume: [useSelf()], spellSlot: false }), { griffonArmorPaid: true, griffonCooldown: 43200, griffonCommandWord: true, novaniteDepart: true }),
        tag(teleport(`${key}:arrive`, { name: "Начало следующего хода: прибыть в заранее выбранное место", activation: "special", distance: 30, spellSlot: false }), { novaniteArrival: true }),
        ...["Исчезновение: притянуть", "Появление: оттолкнуть"].map((name, i) => tag(save(`${key}:wave:${i}`, { name: `${name} — другие существа в 10 футах`, activation: "special", ability: "str", dc: 15, template: { type: "radius", size: 10 }, damage: [dmg("3d6", "force")], spellSlot: false }), { novaniteWave: true })),
        tag(damage(`${key}:occupied`, { name: "Место прибытия занято: 3к6 силовым полем себе", activation: "special", damage: [dmg("3d6", "force")], spellSlot: false }), { novaniteWave: true }));
    } else if (id === "mourningsteel") {
      opts.magicalBonus = 1; opts.effects.push(effect(`${key}:radiant`, { name: "Скорбсталь: сопротивление излучению", changes: [change("system.traits.dr.value", "radiant")] }));
      const dusk = { period: "dusk", type: "recoverAll", formula: "" }, paid = a => tag(a, { ...a.flags?.spikependium, griffonArmorActivityPaid: true });
      const aura = effect(`${key}:aura`, { name: "Нечестивая аура скорбстали", transfer: false, seconds: 60, flags: { spikependium: { mourningAura: true, endsOnIncapacitated: true } } }); opts.effects.push(aura);
      opts.desc = "КД +1, сопротивление излучению. Перенос смерти: реакцией раз до заката замените входящий некротический урон временными хитами в половину этого урона. При штатном применении некротического урона модуль предлагает реакцию, списывает её отдельное применение и пересчитывает оставшиеся типы урона; более высокие временные хиты сохраняются. Каждое из заклинаний Проклятие, Божественное слово и Необнаружимость доступно действием отдельно раз до заката, СЛ 17. Поле битвы помнит: действием коснитесь окровавленного битвами оружия/доспеха/подобного предмета для эффекта Знания легенд, отдельно раз в 7 дней по часам мира.\n\nБонусным командным словом раз до заката включите Нечестивую ауру на минуту, до недееспособности или смерти. Небожители атакуют вас с помехой. При первом за ход входе небожителя в 5 футов или начале его хода там он получает 1к10 некротического урона, игнорирующего сопротивление и иммунитет. Раз за ауру при провале спасброска от эффекта небожителя можно вместо этого преуспеть. Настроены профиль/срок, помеха по связанным одиночным целям, исключение сопротивления/иммунитета только для этого урона и предложение заменить связанный провал успехом. Вход/начало хода области и требуемую кость урона пока вызывайте кнопкой; смешанные группы целей, источники без связанной карточки и уже применённые результаты разрешайте вручную. Факт прикосновения к подходящей реликвии и ответ Знания легенд определяет Мастер.";
      opts.acts.push(paid(tag(utility(`${key}:transfer`, { name: "Вместо некротического урона: Перенос смерти", activation: "reaction", usesMax: 1, usesRecovery: [dusk], consume: [useActivity()], spellSlot: false }), { mourningTransfer: true })));
      for (const [enSpell, name] of [["Bestow Curse", "Проклятие"], ["Divine Word", "Божественное слово"], ["Nondetection", "Необнаружимость"]]) {
        const a = cast(`${key}:${enSpell}`, srdSpellUuid(enSpell), { name, activation: "action", properties: [], usesMax: 1, usesRecovery: [dusk], consume: [useActivity()], spellSlot: false }); a.spell.challenge = { override: true, attack: "", save: "17" }; opts.acts.push(paid(a));
      }
      opts.acts.push(paid(tag(cast(`${key}:lore`, srdSpellUuid("Legend Lore"), { name: "Коснуться боевой реликвии: Знание легенд", activation: "action", touch: true, properties: [], usesMax: 1, consume: [useActivity()], spellSlot: false }), { griffonActivityCooldown: 604800 })),
        paid(form(`${key}:aura`, { name: "Нечестивая аура", activation: "bonus", effects: [aura._id], duration: "minute", durationValue: 1, usesMax: 1, usesRecovery: [dusk], consume: [useActivity()], spellSlot: false })),
        tag(damage(`${key}:aura-damage`, { name: "Вход или начало хода небожителя в 5 футах: 1к10", activation: "special", damage: [dmg("1d10", "necrotic")], spellSlot: false }), { mourningAuraDamage: true }));
      opts.acts.at(-2).flags.spikependium.griffonCommandWord = true;
    }
    for (const type of types) {
      const base = bases.records.find(r => r.document.system.type.baseItem === type)?.document;
      if (!base) throw Error(`Нет основы доспеха ${type}`);
      const suffix = types.length > 1 ? `-${type}` : "";
      const doc = griffonItem("GS2", en, id + suffix, { ...opts, equipType: base.system.type.value, baseItem: type,
        category: `Доспехи/${types.length > 1 ? id === "freerunner" ? "Доспех вольного бегуна" : id === "mycelia" ? "Мицелиевый доспех" : id === "novanite" ? "Нованитовый доспех" : "Доспех Скорпиона" : base.system.type.value === "light" ? "Лёгкие" : base.system.type.value === "heavy" ? "Тяжёлые" : "Средние"}`,
        armorValue: base.system.armor.value, properties: [...base.system.properties, "mgc"], weight: base.system.weight.value, img: base.img,
        price: { common: 100, uncommon: 400, rare: 4000, veryRare: 40000, legendary: 200000 }[rarity] + base.system.price.value,
        priceNote: "Цена оценочная: ориентир по редкости 2024 плюс цена базового доспеха.",
        weightNote: "Вес взят у базового доспеха 2024; отдельного веса в источнике нет.",
        ...(suffix ? { name: `${id === "freerunner" ? "Доспех вольного бегуна" : id === "mycelia" ? "Мицелиевый доспех" : id === "novanite" ? "Нованитовый доспех" : "Доспех Скорпиона"} — ${{ padded: "стёганый", leather: "кожаный", studded: "клёпаный кожаный", halfplate: "полулаты", plate: "латы", hide: "шкурный", chainshirt: "кольчужная рубаха", chainmail: "кольчуга", ringmail: "колечный доспех", splint: "наборный доспех" }[type]}`, en: `${en} (${base.name})` } : {}),
        flags: { spikependium: { key: `item:gs2:${id}${suffix}`, originalName: suffix ? `${en} (${base.name})` : en, griffonTwoArmor: id, ...(["phoenix-armor", "novanite"].includes(id) ? { griffonTimedRecovery: true } : {}), ...(id === "wildskin" ? { griffonClass: "druid" } : {}) } } });
      doc.system.armor.dex = base.system.armor.dex; doc.system.strength = base.system.strength;
      doc.flags.spikependium.nativeBase = `Compendium.dnd5e.equipment24.Item.${base._id}`;
    }
  }
}
