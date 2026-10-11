// Новые заклинания из UA: «Обновление Эберрона» (Гомункул слуга) и «Псионик».
import { save, attack, utility, summon, dmg, effect, change } from "../../tools/lib/core.mjs";
import { spell, folder, ref } from "../../tools/lib/docs.mjs";

const LEVEL_FOLDERS = ["Заговоры", "1 уровень", "2 уровень", "3 уровень", "4 уровень", "5 уровень", "6 уровень", "7 уровень", "8 уровень", "9 уровень"];
const lvlFolder = lvl => folder("spells", LEVEL_FOLDERS[lvl], { sort: (lvl + 1) * 1000 });

export function define() {
  // --- Гомункул слуга -------------------------------------------------------
  spell({
    key: "spell:homunculus-servant", name: "Гомункул слуга", en: "Homunculus Servant",
    book: "UA-EB", page: 8, folder: lvlFolder(2), img: "icons/creatures/magical/construct-iron-stomping-yellow",
    level: 2, school: "con", activation: "hour", activationValue: 1, range: 10,
    components: "ВСМ", materials: "драгоценный камень или кристалл стоимостью 100+ зм, расходуемый заклинанием",
    consumed: true, cost: 100, ritual: true,
    desc: `
*Списки: изобретатель.*

Вы призываете особого гомункула в свободное пространство в пределах дистанции. Это существо использует статблок **Гомункул слуга**. Если у вас уже есть гомункул, созданный этим заклинанием, старый гомункул заменяется новым.

Вы определяете внешний вид гомункула, например, он может выглядеть как механическая птица, крылатые флаконы или миниатюрные оживлённые котлы.

**Бой.** Гомункул дружественен для вас и ваших союзников. В бою он действует по вашей инициативе, но его ход начинается сразу после вашего. Он подчиняется вашим командам (действие не требуется). Если вы не отдаёте команд, то он выполняет действие уклонение и использует своё перемещение, чтобы избегать опасности.

**Накладывание более высокой ячейкой.** Используйте уровень ячейки заклинания как уровень заклинания в статблоке.`,
    acts: [summon("spell:homunculus-servant:summon", [{ uuid: ref("actor:homunculus-servant") }], {
      activation: "hour", hd: "@item.level - 1", hp: "5 * @item.level", attackDamage: "@item.level", name: "Призыв гомункула"
    })]
  });

  // --- Крепость интеллекта --------------------------------------------------
  const fortress = effect("spell:intellect-fortress:effect", {
    name: "Крепость интеллекта", img: "icons/magic/defensive/barrier-shield-dome-blue-purple", transfer: false,
    changes: [
      change("system.traits.dr.value", "psychic"),
      change("system.abilities.int.save.roll.mode", 1),
      change("system.abilities.wis.save.roll.mode", 1),
      change("system.abilities.cha.save.roll.mode", 1)
    ],
    description: "<p>Сопротивление урону психической энергией и преимущество на спасброски Интеллекта, Мудрости и Харизмы.</p>"
  });
  spell({
    key: "spell:intellect-fortress", name: "Крепость интеллекта", en: "Intellect Fortress",
    book: "UA-PU", page: 13, folder: lvlFolder(3), img: "icons/magic/defensive/barrier-shield-dome-blue-purple",
    level: 3, school: "abj", range: 30, components: "В", concentration: true, duration: "hour", durationValue: 1,
    effects: [fortress],
    desc: `
*Списки: изобретатель, бард, волшебник, колдун, чародей, псионик.*

На время действия одно согласное видимое существо в пределах дистанции получает сопротивление урону психической энергией, а также преимущество на спасброски Интеллекта, Мудрости и Харизмы.

**Накладывание более высокой ячейкой.** Вы можете выбрать в качестве цели одно дополнительное существо за каждый уровень ячейки выше 3.`,
    acts: [utility("spell:intellect-fortress:use", {
      activation: "action", range: 30, count: "1 + @scaling", affects: "ally", duration: "hour", durationValue: 1,
      concentration: true, effects: [fortress._id], name: "Наложить"
    })]
  });

  // --- Психический крик -----------------------------------------------------
  const stunned = effect("spell:psychic-scream:stunned", {
    name: "Ошеломлён (Психический крик)", img: "icons/magic/control/hypnosis-mesmerism-swirl", transfer: false,
    statuses: ["stunned"],
    description: "<p>В конце каждого своего хода цель повторяет спасбросок Интеллекта, прекращая эффект при успехе.</p>"
  });
  spell({
    key: "spell:psychic-scream", name: "Психический крик", en: "Psychic Scream",
    book: "UA-PU", page: 14, folder: lvlFolder(9), img: "icons/magic/sonic/scream-wail-shout-teal",
    level: 9, school: "enc", range: 90, components: "С",
    effects: [stunned],
    desc: `
*Списки: бард, колдун, чародей, псионик.*

Вы высвобождаете силу своего разума, чтобы нанести удар по интеллекту до 10 видимых существ на ваш выбор в пределах дистанции. Существа с показателем Интеллекта 2 или ниже не подвергаются эффекту.

Каждая цель должна совершить спасбросок Интеллекта. При провале цель получает 14к6 урона психической энергией и становится <<stunned|ошеломлённой>>. При успешном спасброске цель получает только половину урона.

Если в результате этого урона хиты цели опускаются до 0, то её голова взрывается, если она у неё есть.

В конце каждого своего хода ошеломлённая цель повторяет спасбросок, прекращая состояние при успехе.`,
    acts: [save("spell:psychic-scream:save", {
      activation: "action", range: 90, count: 10, affects: "enemy", ability: "int",
      damage: [dmg("14d6", "psychic")], onSave: "half", effects: [stunned._id]
    })]
  });

  // --- Психическое копьё Раулотима -----------------------------------------
  const lanced = effect("spell:psychic-lance:incapacitated", {
    name: "Недееспособен (Психическое копьё)", img: "icons/magic/perception/third-eye-blue-red", transfer: false,
    statuses: ["incapacitated"], description: "<p>До начала следующего хода заклинателя.</p>"
  });
  spell({
    key: "spell:raulothims-psychic-lance", name: "Психическое копьё Раулотима", en: "Raulothim's Psychic Lance",
    book: "UA-PU", page: 14, folder: lvlFolder(4), img: "icons/magic/perception/third-eye-blue-red",
    level: 4, school: "enc", range: 120, components: "В",
    effects: [lanced],
    desc: `
*Списки: бард, волшебник, колдун, чародей, псионик.*

Вы выпускаете мерцающее копьё психической энергии из своего лба в видимое существо в пределах дистанции. Либо вы можете произнести имя существа (псевдоним, титул или прозвище не сработают). Если названная цель находится в пределах дистанции, то она становится целью заклинания, даже если вы её не видите. Если названная цель вне дистанции или имя некорректно, то копьё рассеивается без эффекта.

Цель должна совершить спасбросок Интеллекта. При провале цель получает 7к6 урона психической энергией и становится <<incapacitated|недееспособной>> до начала вашего следующего хода. При успешном спасброске цель получает половину урона.

**Накладывание более высокой ячейкой.** Урон увеличивается на 1к6 за каждый уровень ячейки выше 4.`,
    acts: [save("spell:raulothims-psychic-lance:save", {
      activation: "action", range: 120, count: 1, affects: "creature", ability: "int",
      damage: [dmg("7d6", "psychic", { scale: 1 })], onSave: "half", effects: [lanced._id]
    })]
  });

  // --- Призыв сущности астрала ----------------------------------------------
  spell({
    key: "spell:summon-astral-entity", name: "Призыв сущности астрала", en: "Summon Astral Entity",
    book: "UA-PU", page: 15, folder: lvlFolder(3), img: "icons/magic/unholy/orb-swirling-teal",
    level: 3, school: "con", range: 90, components: "ВСМ",
    materials: "драгоценный камень или кристалл стоимостью не менее 300 зм", cost: 300,
    concentration: true, duration: "hour", durationValue: 1,
    desc: `
*Списки: волшебник, колдун, чародей, псионик.*

Вы взываете к духу псионики. Он проявляется в свободном пространстве, которое вы видите в пределах дистанции, и использует статблок **Дух псионики**. Когда вы накладываете это заклинание, выберите кристаллическую, эктоплазменную или призрачную сущность. Существо выглядит как астральная сущность выбранного типа, что определяет некоторые параметры его статблока. Существо исчезает, когда его хиты опускаются до 0 или когда заклинание заканчивается.

Существо является союзником вам и вашим союзникам. В бою оно использует ту же инициативу, что и вы, но действует сразу после вас. Оно подчиняется вашим устным приказам (действие не требуется). Если вы не даёте приказов, то оно использует действие уклонение и перемещается, чтобы избегать опасности.

**Накладывание более высокой ячейкой.** Используйте уровень ячейки в качестве уровня заклинания в статблоке.`,
    acts: [summon("spell:summon-astral-entity:summon", [
      { uuid: ref("actor:psionic-spirit-crystal"), name: "Кристаллическая сущность" },
      { uuid: ref("actor:psionic-spirit-ecto"), name: "Эктоплазменная сущность" },
      { uuid: ref("actor:psionic-spirit-phantom"), name: "Призрачная сущность" }
    ], {
      activation: "action", range: 90, concentration: true, duration: "hour", durationValue: 1,
      ac: "@item.level", hp: "10 * (@item.level - 3)", attackDamage: "@item.level", name: "Призыв"
    })]
  });

  // --- Психическая плеть Таши -----------------------------------------------
  const whipped = effect("spell:tashas-mind-whip:effect", {
    name: "Психическая плеть", img: "icons/magic/control/debuff-energy-hold-pink", transfer: false,
    description: "<p>Не может совершать провоцированные атаки до конца своего следующего хода. В свой следующий ход выбирает только одно: действие, бонусное действие или перемещение.</p>"
  });
  spell({
    key: "spell:tashas-mind-whip", name: "Психическая плеть Таши", en: "Tasha's Mind Whip",
    book: "UA-PU", page: 14, folder: lvlFolder(2), img: "icons/magic/control/debuff-energy-hold-pink",
    level: 2, school: "enc", range: 90, components: "В",
    effects: [whipped],
    desc: `
*Списки: волшебник, чародей, псионик.*

Вы ментально хлещете одно видимое существо в пределах дистанции. Цель должна совершить спасбросок Интеллекта. При провале цель получает 3к6 урона психической энергией и не может совершать провоцированные атаки до конца своего следующего хода. Более того, в свой следующий ход она должна выбрать, что делает: действие, бонусное действие или перемещение. При успешном спасброске цель получает только половину урона.

**Накладывание более высокой ячейкой.** За каждый уровень ячейки выше 2 вы можете выбрать дополнительное существо в качестве цели.`,
    acts: [save("spell:tashas-mind-whip:save", {
      activation: "action", range: 90, count: "1 + @scaling", affects: "creature", ability: "int",
      damage: [dmg("3d6", "psychic")], onSave: "half", effects: [whipped._id]
    })]
  });

  // --- Телекинетическое давление --------------------------------------------
  const prone = effect("spell:telekinetic-crush:prone", {
    name: "Сбит с ног", img: "icons/magic/control/silhouette-fall-slip-prone", transfer: false, statuses: ["prone"]
  });
  spell({
    key: "spell:telekinetic-crush", name: "Телекинетическое давление", en: "Telekinetic Crush",
    book: "UA-PU", page: 14, folder: lvlFolder(3), img: "icons/magic/earth/strike-body-stone-crumble",
    level: 3, school: "trs", range: 120, components: "В",
    target: { affects: { type: "creature", count: "", choice: false, special: "" }, template: { type: "cube", size: "30", units: "ft", contiguous: false, count: "" } },
    effects: [prone],
    desc: `
*Списки: колдун, чародей, псионик.*

Вы создаёте поле сокрушающей телекинетической силы в пределах 30-футового куба в зоне действия. Каждое существо в области должно совершить спасбросок Силы. При провале цель получает 5к6 урона силовым полем и получает состояние <<prone|лежащий ничком>>. При успехе цель получает половину урона.

**Накладывание более высокой ячейкой.** Урон увеличивается на 1к6 за каждый уровень ячейки выше 3.`,
    acts: [save("spell:telekinetic-crush:save", {
      activation: "action", range: 120, template: { type: "cube", size: 30 }, affects: "creature", ability: "str",
      damage: [dmg("5d6", "force", { scale: 1 })], onSave: "half", effects: [prone._id]
    })]
  });

  // --- Ментальный бросок ----------------------------------------------------
  spell({
    key: "spell:telekinetic-fling", name: "Ментальный бросок", en: "Telekinetic Fling",
    book: "UA-PU", page: 14, folder: lvlFolder(0), img: "icons/skills/ranged/arrow-flying-spiral-blue",
    level: 0, school: "evo", range: 60, components: "В",
    desc: `
*Списки: псионик.*

Вы выбираете один немагический предмет весом от 1 до 5 фунтов, находящийся в пределах 10 футов от вас, который никто не носит и не несёт. Вы окутываете его псионической энергией и метаете в существо в пределах дистанции. Совершите дальнобойную атаку заклинанием по цели.

При попадании цель получает 1к10 урона силовым полем. При попадании или промахе предмет падает на землю неповреждённым.

**Улучшение заговора.** Урон увеличивается на 1к10, когда вы достигаете уровней 5 (2к10), 11 (3к10) и 17 (4к10).`,
    acts: [attack("spell:telekinetic-fling:attack", {
      activation: "action", range: 60, count: 1, affects: "creature", attackType: "ranged", classification: "spell",
      damage: [dmg("1d10", "force", { cantrip: true })]
    })]
  });
}
