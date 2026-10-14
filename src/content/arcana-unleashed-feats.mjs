import { advItemGrant, advItemChoice, advASI, advTrait, spellConfig, srdSpellUuid, utility, cast, heal, effect, change, LR, useActivity } from "../../tools/lib/core.mjs";
import { feat, folder } from "../../tools/lib/docs.mjs";

export function define() {
  const resilience = utility("au:spell-resilient:save", { name: "Стойкий к магии", activation: "special", self: true,
    condition: "Вы провалили спасбросок против заклинания или магического эффекта", roll: "1d6", rollName: "Бонус к магическому спасброску",
    usesMax: "@prof", usesRecovery: [LR], consume: [useActivity()], spellSlot: false });
  resilience.flags = { spikependium: { originSaveBoost: true } };
  feat({ key: "feat:spell-resilient", identifier: "spell-resilient", name: "Стойкий к заклинаниям", subtype: "general", level: 4,
    folder: folder("feats", "Неудержимая магия/Универсальные"), book: "AU", page: 32, img: "icons/magic/defensive/shield-barrier-blue",
    desc: `**Повышение характеристики.** Увеличьте Ловкость или Телосложение на 1, максимум до 20.

**Магическая устойчивость.** Выберите сопротивление урону звуком, излучением, некротической или психической энергией.

**Стойкий к магии.** После провала собственного спасброска против заклинания или магического эффекта можно добавить к нему результат 1к6. Эта польза имеет число применений, равное бонусу владения; долгий отдых восстанавливает их. Действие и реакция не требуются.

**Применение.** При добавлении черты штатные шаги предлагают характеристику и один тип сопротивления. Для к6 выберите свежую собственную карточку провала с известной СЛ. Связанное заклинание распознаётся автоматически; прочие магические эффекты подтвердите в окне. Применение расходуется штатно, исходный к20 сохраняется. Отмена расхода возвращает применение и убирает к6. Уже обработанные последствия спасброска, включая урон, эффекты и потерянную концентрацию, проверяет Мастер.`,
    advancement: [advASI("au:spell-resilient:asi", 0, { points: 1, cap: 1, max: 20, locked: ["str", "int", "wis", "cha"], title: "Ловкость или Телосложение +1" }),
      advTrait("au:spell-resilient:resistance", 0, { title: "Магическая устойчивость", choices: [{ count: 1, pool: ["dr:thunder", "dr:radiant", "dr:necrotic", "dr:psychic"] }] })],
    acts: [resilience]
  });
  const wizardCantrips = ["Acid Splash", "Blade Ward", "Chill Touch", "Dancing Lights", "Elementalism", "Fire Bolt", "Friends", "Light", "Mage Hand", "Mending", "Message", "Mind Sliver", "Minor Illusion", "Poison Spray", "Prestidigitation", "Ray of Frost", "Shocking Grasp", "True Strike"];
  feat({ key: "feat:magic-warrior", identifier: "magic-warrior", name: "Магический воин", subtype: "fightingStyle",
    requirements: "Умение Боевой стиль", prerequisiteItems: ["feat:fighting-style"], folder: folder("feats", "Неудержимая магия/Боевые стили"), book: "AU", page: 33,
    img: "icons/skills/melee/hand-grip-sword-red",
    desc: `Вы изучаете два заговора волшебника. Рекомендуемые варианты — [[Волшебная рука]] и [[Луч холода]]. Выберите для обоих одну заклинательную характеристику: Интеллект, Мудрость или Харизму. При каждом получении нового уровня можно заменить один из этих заговоров другим заговором волшебника.

**Применение.** Добавление черты открывает штатный выбор двух заговоров и общей характеристики. Каталог содержит доступные заговоры SRD; другой заговор волшебника можно перетащить из установленной библиотеки. При последующих повышениях уровня штатный мастер продвижения предлагает необязательную замену одного заговора, включая повышение в другом классе. Шаги замены не выдаются задним числом.`,
    advancement: [advItemChoice("au:magic-warrior:cantrips", 0, { title: "Два заговора волшебника", count: 2, type: "spell", restrictType: "spell",
      list: ["class:wizard"], spellLevel: "0", pool: wizardCantrips.map(srdSpellUuid).filter(Boolean), spell: spellConfig({ abilities: ["int", "wis", "cha"], always: false }) })]
  });
  const F = folder("feats", "Неудержимая магия/Происхождение");
  const artist = utility("au:magic-artist:inspiration", { name: "Вдохновляющая магия", activation: "special",
    condition: "Вы накладываете заклинание школы Иллюзии; союзник в пределах 30 футов видит вас", range: 30,
    affects: "ally", count: 1, usesMax: 1, usesRecovery: [LR], consume: [useActivity()], spellSlot: false });
  artist.flags = { spikependium: { artistInspiration: true } };
  feat({ key: "feat:magic-artist", name: "Магический художник", identifier: "magic-artist", subtype: "origin", folder: F,
    book: "AU", page: 28, img: "icons/sundries/gaming/playing-cards",
    desc: `**Заговор.** Вы изучаете заговор [[Малая иллюзия]]. Интеллект, Мудрость или Харизма является вашей заклинательной характеристикой для него (выберите при выборе черты).

**Вдохновляющая магия.** Когда вы накладываете заклинание школы Иллюзии, вы можете выбрать одного союзника в пределах 30 футов, который видит вас. Этот союзник получает Героическое вдохновение. После использования вы должны завершить долгий отдых, чтобы воспользоваться этой пользой снова.

**Применение.** Сразу после накладывания иллюзии отметьте одного союзника и используйте Вдохновляющую магию. Выберите исходную карточку накладывания и подтвердите, что союзник видит вас. Модуль проверяет школу, владельца исходного накладывания, свежесть карточки и расстояние с учётом высоты и единиц карты; применение расходуется штатно. Активный Мастер либо владелец обоих персонажей ставит отметку Героического вдохновения на листе союзника. Вдохновение не накапливается. Отмена расхода восстанавливает применение; уже переданное или потраченное союзником вдохновение при этом проверьте вручную.`,
    advancement: [advItemGrant("au:magic-artist:cantrip", 0, [srdSpellUuid("Minor Illusion")], {
      title: "Заговор: Малая иллюзия", spell: spellConfig({ abilities: ["int", "wis", "cha"] }) })], acts: [artist]
  });
  const anatomySave = utility("au:transformed-anatomy:save", { name: "Устойчивая форма — спасбросок Телосложения", activation: "reaction",
    condition: "Вы провалили спасбросок Телосложения", self: true, roll: "1d4", rollName: "Бонус к спасброску Телосложения",
    usesMax: "@prof", usesRecovery: [LR], consume: [useActivity()] });
  anatomySave.flags = { spikependium: { originSaveBoost: true } };
  feat({ key: "feat:transformed-anatomy", name: "Преобразованная анатомия", identifier: "transformed-anatomy", subtype: "origin", folder: F,
    book: "AU", page: 29, img: "icons/magic/control/buff-strength-muscle-damage-orange",
    desc: `**Удлинённый шаг.** Ваша скорость увеличивается на 5 футов.

**Устойчивая форма.** Вы совершаете с преимуществом спасброски против эффектов, которые принуждают вас к смене формы против вашей воли. Кроме того, когда вы проваливаете спасбросок Телосложения, вы можете реакцией бросить 1к4 и добавить результат к этому спасброску, потенциально превратив провал в успех. Вы можете использовать эту пользу количество раз, равное вашему бонусу владения; потраченные применения восстанавливаются после долгого отдыха.

**Применение.** Скорость увеличивается постоянным активным эффектом с учётом единиц листа. В окне спасброска отметьте, что эффект принудительно меняет форму; для Превращения и Истинного превращения признак выбирается автоматически. Преимущество сочетается с другими источниками и отменяется помехой. Реакция к4 использует только свежую карточку вашего проваленного спасброска Телосложения с известной СЛ, сохраняет к20 и поддерживает штатную отмену расхода. Последствия уже обработанного урона, завершённых эффектов и прерванной концентрации проверяет Мастер.`,
    effects: [effect("au:transformed-anatomy:stride", { name: "Удлинённый шаг (+5 футов)",
      changes: [change("system.attributes.movement.bonus", 5)], flags: { spikependium: { anatomyStride: true } } })], acts: [anatomySave]
  });
  const omen = utility("au:magic-omen:save", { name: "Полезное предчувствие", activation: "reaction",
    condition: "Вы или видимое существо в пределах 30 футов провалили спасбросок", range: 30, roll: "1d4", rollName: "Бонус к спасброску",
    usesMax: "@prof", usesRecovery: [LR], consume: [useActivity()] });
  omen.flags = { spikependium: { originSaveBoost: true } };
  feat({ key: "feat:magic-omen", name: "Магический провидец", identifier: "magic-omen", subtype: "origin", folder: F,
    book: "AU", page: 28, img: "icons/magic/perception/eye-ringed-glow-angry-teal",
    desc: `**Заговор.** Вы изучаете заговор [[Наставление]]. Интеллект, Мудрость или Харизма является вашей заклинательной характеристикой для него (выберите при выборе черты).

**Полезное предчувствие.** Когда вы или существо, которое вы видите в пределах 30 футов, проваливаете спасбросок, вы можете реакцией бросить 1к4 и добавить результат к этому спасброску, потенциально превратив провал в успех. Вы можете использовать эту пользу количество раз, равное вашему бонусу владения; потраченные применения восстанавливаются после долгого отдыха.

**Применение.** В окне реакции выберите свежую карточку проваленного спасброска с известной СЛ и подтвердите видимость другой цели. После расхода реакции и применения модуль бросает к4 и добавляет его в исходную карточку без перебрасывания к20. Отмена расхода убирает добавленный бонус, если исходная карточка не была изменена другим способом. Последствия уже применённого урона, завершённых эффектов, испытания смерти или прерванной концентрации проверяет Мастер; реакцию применяйте до их обработки.`,
    advancement: [advItemGrant("au:magic-omen:cantrip", 0, [srdSpellUuid("Guidance")], {
      title: "Заговор: Наставление", spell: spellConfig({ abilities: ["int", "wis", "cha"] }) })], acts: [omen]
  });
  const surge = utility("au:magic-overloaded:surge", { name: "Всплеск мощи", self: true,
    usesMax: 1, usesRecovery: [LR], consume: [useActivity()] });
  surge.flags = { spikependium: { originSurge: true } };
  feat({ key: "feat:magic-overloaded", name: "Перегруженный магией", identifier: "magic-overloaded", subtype: "origin", folder: F,
    book: "AU", page: 29, img: "icons/magic/fire/projectile-fireball-orange-yellow",
    desc: `**Заговор.** Вы изучаете заговор [[Огненный снаряд]]. Интеллект, Мудрость или Харизма является вашей заклинательной характеристикой для него (выберите при выборе черты).

**Всплеск мощи.** Когда вы накладываете заклинание школы Эвокации и наносите им урон, вы можете добавить свой бонус владения к одному броску урона этого заклинания. После использования вы должны завершить долгий отдых, чтобы воспользоваться этой пользой снова.

**Применение.** Накладывайте заклинание и бросайте урон из его карточки. В обычном окне урона выберите один компонент для Всплеска мощи. Бонус добавляется только к нему; применение расходуется после подтверждения окна и входит в штатную отмену расхода в карточке урона. При закрытии окна без броска применение сохраняется. Это не постоянная прибавка ко всем заклинаниям.`,
    advancement: [advItemGrant("au:magic-overloaded:cantrip", 0, [srdSpellUuid("Fire Bolt")], {
      title: "Заговор: Огненный снаряд", spell: spellConfig({ abilities: ["int", "wis", "cha"] }) })], acts: [surge]
  });
  const ward = cast("au:magic-ward:resistance", srdSpellUuid("Resistance"), { name: "Сопротивление — бонусное действие",
    activation: "bonus", level: 0, spellbook: false, spellSlot: false, usesMax: "@prof", usesRecovery: [LR], consume: [useActivity()] });
  ward.flags = { spikependium: { originGrantedAbility: true } };
  feat({ key: "feat:magic-ward", name: "Магический защитник", identifier: "magic-ward", subtype: "origin", folder: F,
    book: "AU", page: 27, img: "icons/magic/defensive/shield-barrier-blue",
    desc: `**Заговор.** Вы изучаете заговор [[Сопротивление]]. Интеллект, Мудрость или Харизма является вашей заклинательной характеристикой для него (выберите при выборе черты).

Вы можете накладывать Сопротивление бонусным действием количество раз, равное вашему бонусу владения; потраченные применения восстанавливаются после долгого отдыха. Обычное накладывание действием остаётся доступным без расхода этих применений.

**Укрывающая помощь.** Когда вы совершаете действие Помощь, чтобы помочь союзнику в проверке характеристики, этот союзник получает временные хиты в количестве, равном вашему бонусу владения.

**Применение.** Бонусное накладывание использует выбранную при добавлении черты характеристику и штатное заклинание с концентрацией. Выберите нужный тип защиты в его карточке; уменьшение урона на к4 обрабатывается вручную по правилам Сопротивления. Для Помощи выберите союзника; действие «Укрывающая помощь» бросает временные хиты, которые применяются обычной карточкой лечения. Эта польза относится к Помощи в проверке характеристики; временные хиты не складываются.`,
    advancement: [advItemGrant("au:magic-ward:cantrip", 0, [srdSpellUuid("Resistance")], {
      title: "Заговор: Сопротивление", spell: spellConfig({ abilities: ["int", "wis", "cha"] }) })],
    acts: [ward, heal("au:magic-ward:help", { name: "Укрывающая помощь (проверка характеристики)", activation: "action",
      condition: "Вы помогаете союзнику в проверке характеристики действием Помощь", affects: "ally", count: 1, formula: "@prof", temp: true })]
  });
  feat({ key: "feat:magic-speaker", name: "Магический оратор", identifier: "magic-speaker", subtype: "origin", folder: F,
    book: "AU", page: 28, img: "icons/skills/social/diplomacy-handshake-yellow",
    desc: "**Заговор.** Вы изучаете заговор [[Злая насмешка]]. Интеллект, Мудрость или Харизма является вашей заклинательной характеристикой для него (выберите при выборе черты).\n\n**Говорун.** Когда вы совершаете проверку Харизмы (Обман, Запугивание или Убеждение), вы можете бросить 1к4 и добавить результат к этой проверке.",
    advancement: [advItemGrant("au:magic-speaker:cantrip", 0, [srdSpellUuid("Vicious Mockery")], {
      title: "Заговор: Злая насмешка", spell: spellConfig({ abilities: ["int", "wis", "cha"] }) })]
  });
  const inspired = utility("au:magic-undertaker:inspiration", { name: "Понимание смерти", activation: "special",
    condition: "Вы успешно стабилизировали существо с 0 хитами действием Помощь", self: true,
    usesMax: 1, usesRecovery: [LR], consume: [useActivity()] });
  inspired.flags = { spikependium: { heroicInspirationSelf: true } };
  feat({ key: "feat:magic-undertaker", name: "Магический могильщик", identifier: "magic-undertaker", subtype: "origin", folder: F,
    book: "AU", page: 28, img: "icons/magic/death/skull-humanoid-crown-white-blue",
    desc: "**Заговор.** Вы изучаете один заговор школы некромантии из списка Волшебника или Жреца. Интеллект, Мудрость или Харизма является вашей заклинательной характеристикой для него (выберите при выборе черты).\n\n**Знания от мёртвых.** Когда вы совершаете проверку Интеллекта (История) или Мудрости (Медицина), вы можете бросить 1к4 и добавить результат к этой проверке.\n\n**Понимание смерти.** Когда вы совершаете действие Помощь для стабилизации существа с 0 хитами, вы получаете Героическое вдохновение. После использования этого преимущества вы должны завершить долгий отдых, чтобы воспользоваться им снова.",
    advancement: [advItemChoice("au:magic-undertaker:cantrip", 0, { title: "Заговор некромантии Волшебника или Жреца", count: 1,
      type: "spell", restrictType: "spell", list: ["wizard", "cleric"], spellLevel: "0", school: ["nec"],
      pool: [srdSpellUuid("Chill Touch"), srdSpellUuid("Spare the Dying")], spell: spellConfig({ abilities: ["int", "wis", "cha"] }),
      hint: "Выберите подходящий заговор; можно перетащить другой заговор некромантии из указанных списков своей книги." })],
    acts: [inspired]
  });
}
