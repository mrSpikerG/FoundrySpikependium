// Новые заклинания из UA 2025 «Обновление псионика».
import { save, attack, heal, damage, utility, dmg, effect, change } from "../../tools/lib/core.mjs";
import { spell, folder } from "../../tools/lib/docs.mjs";

const BOOK = "UA-PU";
const LEVEL_FOLDERS = ["Заговоры", "1 уровень", "2 уровень", "3 уровень", "4 уровень", "5 уровень", "6 уровень", "7 уровень", "8 уровень", "9 уровень"];
const lvlFolder = lvl => folder("spells", LEVEL_FOLDERS[lvl], { sort: (lvl + 1) * 1000 });
const status = (key, name, img, statuses, description = "") =>
  effect(key, { name, img, transfer: false, statuses, description: description ? `<p>${description}</p>` : "" });
const area = (type, size) => ({ affects: { type: "creature", count: "", choice: false, special: "" }, template: { type, size: String(size), units: "ft", contiguous: false, count: "" } });

export function define() {
  // --- Жуткое иссушение Аби-Далзима ----------------------------------------
  spell({
    key: "spell:abi-dalzims-horrid-wilting", name: "Жуткое иссушение Аби-Далзима", en: "Abi-Dalzim's Horrid Wilting",
    book: BOOK, page: 12, folder: lvlFolder(8), img: "icons/magic/unholy/strike-body-explode-disintegrate",
    level: 8, school: "nec", range: 150, components: "ВСМ", materials: "кусочек губки", target: area("cube", 30),
    desc: `
*Списки: волшебник, псионик, чародей.*

Вы высасываете влагу из каждого существа в пределах куба со стороной 30 футов, центр которого находится в точке в пределах дистанции. Каждое существо в этой области должно совершить спасбросок Телосложения. При провале оно получает 12к8 урона некротической энергией, а при успехе — половину этого урона.

Конструкты автоматически преуспевают в спасброске, а растения автоматически его проваливают.

Немагические растения в области, не являющиеся существами, такие как деревья и кустарники, мгновенно иссыхают и умирают.`,
    acts: [save("spell:horrid-wilting:save", { activation: "action", range: 150, template: { type: "cube", size: 30 }, affects: "creature", ability: "con", damage: [dmg("12d8", "necrotic")], onSave: "half" })]
  });

  // --- Кровоточащая тьма ----------------------------------------------------
  const blinded = status("spell:bleeding-darkness:blind", "Ослеплён (Кровоточащая тьма)", "icons/magic/perception/shadow-stealth-eyes-purple", ["blinded"], "До конца своего следующего хода.");
  spell({
    key: "spell:bleeding-darkness", name: "Кровоточащая тьма", en: "Bleeding Darkness",
    book: BOOK, page: 12, folder: lvlFolder(3), img: "icons/magic/unholy/orb-glowing-purple",
    level: 3, school: "evo", range: 60, components: "ВСМ", materials: "фиал редких чернил стоимостью 50+ зм", cost: 50,
    concentration: true, duration: "minute", durationValue: 1, target: area("cylinder", 10), effects: [blinded],
    desc: `
*Списки: псионик, колдун, волшебник.*

Вы создаёте чернильную пустоту с радиусом 10 футов в видимой точке, которая выше вас в пределах дистанции. Когда вы накладываете это заклинание, из сферы вырывается магическая тьма, заполняющая цилиндр радиусом 10 футов и высотой 40 футов, исходящий от сферы, до начала вашего следующего хода.

Этот цилиндр является труднопроходимой местностью, и свет (магический или обычный) не может осветить эту область.

Когда тьма появляется, каждое существо в области должно совершить спасбросок Телосложения. При провале существо получает 3к8 урона холодом и <<blinded|ослеплено>> до конца своего следующего хода. Существо также совершает этот спасбросок, когда впервые за ход входит в область заклинания или заканчивает там свой ход. Существо совершает этот спасбросок не более одного раза за ход.

До окончания действия заклинания вы можете действием магия переместить сферу горизонтально на расстояние до 20 футов и заставить её снова изливать магическую тьму до начала вашего следующего хода.

**Накладывание более высокой ячейкой.** Урон увеличивается на 1к8 за каждый уровень ячейки выше 3.`,
    acts: [save("spell:bleeding-darkness:save", { activation: "action", range: 60, template: { type: "cylinder", size: 10, height: 40 }, affects: "creature", ability: "con", damage: [dmg("3d8", "cold", { scale: 1 })], onSave: "none", effects: [blinded._id], concentration: true, duration: "minute", durationValue: 1 })]
  });

  // --- След эктоплазмы ------------------------------------------------------
  spell({
    key: "spell:ectoplasmic-trail", name: "След эктоплазмы", en: "Ectoplasmic Trail",
    book: BOOK, page: 12, folder: lvlFolder(2), img: "icons/creatures/slimes/slime-movement-dripping-pseudopods-green",
    level: 2, school: "nec", activation: "bonus", rangeUnits: "self", components: "ВС",
    desc: `
*Списки: псионик, колдун.*

Вы окутываете себя духами, которые оставляют за вами след из эктоплазмы до конца вашего хода. Пока вы окутаны, вы можете перемещаться через занятые пространства, как если бы они были труднопроходимой местностью, и такое перемещение не вызывает провоцированные атаки. Если вы заканчиваете свой ход в таком пространстве, то вы возвращаетесь в последнее свободное пространство, в котором находились.

Пока вы окутаны, каждый раз, когда вы входите в пространство существа, это существо покрывается эктоплазмой до конца вашего следующего хода. Скорость существа, покрытого эктоплазмой, уменьшается на 10 футов, и в начале своего хода оно получает 2к8 урона некротической энергией. Существо может быть покрыто эктоплазмой только один раз за ход.

**Накладывание более высокой ячейкой.** Пока вы окутаны, ваша скорость увеличивается на 10 футов за каждый уровень ячейки заклинания выше второго.`,
    acts: [
      utility("spell:ectoplasmic-trail:cast", { name: "Окутаться", activation: "bonus", self: true, duration: "turn" }),
      damage("spell:ectoplasmic-trail:damage", { name: "Урон эктоплазмы", activation: "special", condition: "Начало хода покрытого существа", count: 1, affects: "creature", spellSlot: false, damage: [dmg("2d8", "necrotic")] })
    ]
  });

  // --- Удар по эго ----------------------------------------------------------
  spell({
    key: "spell:ego-whip", name: "Удар по эго", en: "Ego Whip",
    book: BOOK, page: 13, folder: lvlFolder(2), img: "icons/magic/control/debuff-energy-snare-purple-pink",
    level: 2, school: "enc", activation: "reaction", range: 120, components: "В",
    desc: `
*Списки: псионик.*

*Время накладывания: реакция, совершаемая, когда существо, которое вы видите в пределах 30 футов от вас, совершает проверку или спасбросок Харизмы.*

Существо совершает спасбросок Харизмы. При провале цель должна вычесть 1к8 из своей проверки характеристики или спасброска.`,
    acts: [save("spell:ego-whip:save", { activation: "reaction", condition: "Существо в пределах 30 футов совершает проверку или спасбросок Харизмы", range: 120, count: 1, affects: "creature", ability: "cha" }),
      utility("spell:ego-whip:penalty", { name: "Штраф цели", activation: "special", spellSlot: false, roll: "1d8", rollName: "Вычесть из броска цели" })]
  });

  // --- Везде враги ----------------------------------------------------------
  const abound = status("spell:enemies-abound:fear", "Везде враги", "icons/magic/control/fear-fright-monster-grin-purple-blue", ["frightened"],
    "Не отличает друзей от врагов; выбирает цели случайно; совершает все возможные провоцированные атаки. После получения урона повторяет спасбросок Интеллекта.");
  spell({
    key: "spell:enemies-abound", name: "Везде враги", en: "Enemies Abound",
    book: BOOK, page: 13, folder: lvlFolder(3), img: "icons/magic/control/fear-fright-monster-grin-purple-blue",
    level: 3, school: "enc", range: 120, components: "ВС", concentration: true, duration: "minute", durationValue: 1, effects: [abound],
    desc: `
*Списки: колдун, чародей, псионик, бард, волшебник.*

Вы выбираете существо, которое видите в пределах дистанции. Цель должна совершить спасбросок Интеллекта. При провале цель <<frightened|испугана>> на всё время действия заклинания.

Пока цель испугана, она теряет способность отличать друзей от врагов и подвергается следующим эффектам:

- Цель воспринимает всех существ, которых видит, как врагов.
- Каждый раз, когда цель выбирает существо, отличное от себя, для атаки, заклинания или другого действия, она должна выбирать случайным образом среди существ, которых видит в пределах дистанции этого действия.
- Цель должна совершать провоцированные атаки каждый раз, когда имеет такую возможность.

Каждый раз, когда цель получает урон, она совершает новый спасбросок Интеллекта. При успешном спасброске действие заклинания оканчивается.`,
    acts: [save("spell:enemies-abound:save", { activation: "action", range: 120, count: 1, affects: "creature", ability: "int", effects: [abound._id], concentration: true, duration: "minute", durationValue: 1 })]
  });

  // --- Поле инверсии жизни --------------------------------------------------
  spell({
    key: "spell:life-inversion-field", name: "Поле инверсии жизни", en: "Life Inversion Field",
    book: BOOK, page: 13, folder: lvlFolder(4), img: "icons/magic/life/heart-shadow-red",
    level: 4, school: "abj", rangeUnits: "self", components: "ВС", concentration: true, duration: "minute", durationValue: 1,
    target: area("radius", 30),
    desc: `
*Списки: жрец, чародей, псионик.*

Аура в форме эманации с радиусом 30 футов исходит от вас на всю длительность. Когда вы создаёте эту ауру, вы восстанавливаете 4к8 хитов.

Каждый раз, когда вы восстанавливаете хиты, вы можете выбрать видимое существо в пределах ауры и заставить его совершить спасбросок Телосложения. При провале существо получает урон некротической энергией, равный половине восстановленных вами хитов (округляя в большую сторону). Существо совершает этот спасбросок не более одного раза за ход.

**Накладывание более высокой ячейкой.** Восстанавливаемое количество хитов увеличивается на 1к8 за каждый уровень ячейки заклинания выше 4.`,
    acts: [
      { ...heal("spell:life-inversion:heal", { name: "Создать ауру", activation: "action", self: true, concentration: true, duration: "minute", durationValue: 1, formula: "4d8" }), healing: dmg("4d8", "healing", { scale: 1 }) },
      save("spell:life-inversion:save", { name: "Инверсия", activation: "special", condition: "Вы восстановили хиты", spellSlot: false, count: 1, affects: "creature", ability: "con", flavor: "При провале: урон некротической энергией, равный половине восстановленных вами хитов (округляя вверх)" })
    ]
  });

  // --- Истощение жизни ------------------------------------------------------
  spell({
    key: "spell:life-siphon", name: "Истощение жизни", en: "Life Siphon",
    book: BOOK, page: 13, folder: lvlFolder(1), img: "icons/magic/unholy/orb-beam-pink",
    level: 1, school: "evo", range: 120, components: "В",
    desc: `
*Списки: псионик.*

Вы выпускаете сферу псионической энергии, подпитанной вашей жизненной силой, в видимое существо в пределах дистанции. Совершите дальнобойную атаку заклинанием по цели. При попадании цель получает 1к10 урона психической энергией, и вы можете потратить одну кость хитов, чтобы увеличить урон на 1к10.

**Накладывание более высокой ячейкой.** Урон увеличивается на 1к10, а количество костей хитов, которые вы можете потратить, — на одну за каждый уровень ячейки заклинания выше первого.`,
    acts: [
      attack("spell:life-siphon:attack", { activation: "action", range: 120, count: 1, affects: "creature", attackType: "ranged", classification: "spell", damage: [dmg("1d10", "psychic", { scale: 1 })] }),
      damage("spell:life-siphon:hd", { name: "Потратить кость хитов (+1к10)", activation: "special", spellSlot: false, consume: [{ type: "hitDice", value: "1", target: "smallest", scaling: {} }], damage: [dmg("1d10", "psychic")] })
    ]
  });

  // --- Ментальная тюрьма ----------------------------------------------------
  const prison = status("spell:mental-prison:charm", "Ментальная тюрьма", "icons/magic/control/encase-creature-humanoid-hold", ["charmed", "restrained"],
    "Цель видит вокруг себя опасную иллюзию. Если она выходит из иллюзии, атакует сквозь неё или протягивает через неё часть тела — получает 5к10 урона психической энергией, и заклинание оканчивается.");
  spell({
    key: "spell:mental-prison", name: "Ментальная тюрьма", en: "Mental Prison",
    book: BOOK, page: 13, folder: lvlFolder(6), img: "icons/magic/control/encase-creature-humanoid-hold",
    level: 6, school: "ill", range: 60, components: "С", concentration: true, duration: "minute", durationValue: 1, effects: [prison],
    desc: `
*Списки: бард, чародей, псионик, волшебник.*

Вы пытаетесь заключить существо в иллюзорную клетку, которую оно воспринимает как реальную. Одно видимое существо в пределах дистанции должно совершить спасбросок Интеллекта. При провале цель получает 8к10 урона психической энергией и получает состояние <<charmed|очарованный>> на всё время действия заклинания. При успешном спасброске цель получает половину урона, и действие заклинания оканчивается.

Пока цель очарована, она также находится в состоянии <<restrained|опутанный>> и воспринимает пространство вокруг себя как опасное в каком-то виде, который вы создаёте. Вы можете заставить цель видеть себя окружённой пламенем, парящими лезвиями или чудовищными пастями, полными капающих зубов. Независимо от формы иллюзии цель не может видеть или слышать ничего за её пределами.

Если цель перемещается из иллюзии, совершает рукопашную атаку сквозь неё или протягивает любую часть своего тела через её границы, то она получает 5к10 урона психической энергией, и действие заклинания оканчивается.`,
    acts: [
      save("spell:mental-prison:save", { activation: "action", range: 60, count: 1, affects: "creature", ability: "int", damage: [dmg("8d10", "psychic")], onSave: "half", effects: [prison._id], concentration: true, duration: "minute", durationValue: 1 }),
      damage("spell:mental-prison:escape", { name: "Выход из иллюзии", activation: "special", spellSlot: false, count: 1, affects: "creature", damage: [dmg("5d10", "psychic")] })
    ]
  });

  // --- Псионический взрыв ---------------------------------------------------
  const blastStun = status("spell:psionic-blast:stun", "Ошеломлён (Псионический взрыв)", "icons/magic/sonic/explosion-shock-wave-teal", ["stunned"], "До начала следующего хода заклинателя.");
  spell({
    key: "spell:psionic-blast", name: "Псионический взрыв", en: "Psionic Blast",
    book: BOOK, page: 14, folder: lvlFolder(6), img: "icons/magic/sonic/explosion-shock-wave-teal",
    level: 6, school: "evo", rangeUnits: "self", components: "ВСМ", target: area("cone", 60), effects: [blastStun],
    desc: `
*Списки: псионик, волшебник.*

Вы высвобождаете ударную волну псионической энергии. Каждое существо в конусе длиной 60 футов, исходящем от вас, должно совершить спасбросок Интеллекта.

При провале существо получает 6к8 урона психической энергией и <<stunned|ошеломлено>> до начала вашего следующего хода. При успешном спасброске существо получает только половину урона.

**Накладывание более высокой ячейкой.** Урон увеличивается на 1к8 за каждый уровень ячейки выше 6.

*В переводе указано «выше 8» — вероятно, опечатка: базовый уровень заклинания 6.*`,
    acts: [save("spell:psionic-blast:save", { activation: "action", template: { type: "cone", size: 60 }, affects: "creature", ability: "int", damage: [dmg("6d8", "psychic", { scale: 1 })], onSave: "half", effects: [blastStun._id] })]
  });

  // --- Форма мысли ----------------------------------------------------------
  const thought = effect("spell:thought-form:effect", {
    name: "Форма мысли", img: "icons/creatures/magical/spirit-undead-ghost-purple", transfer: false, seconds: 60,
    changes: [
      change("system.traits.di.value", "poison"), change("system.traits.di.value", "psychic"), change("system.traits.ci.value", "exhaustion"),
      change("system.attributes.movement.speeds.fly", 60, "upgrade"), change("system.attributes.movement.hover", "true", "override")
    ]
  });
  spell({
    key: "spell:thought-form", name: "Форма мысли", en: "Thought Form",
    book: BOOK, page: 15, folder: lvlFolder(6), img: "icons/creatures/magical/spirit-undead-ghost-purple",
    level: 6, school: "trs", activation: "bonus", rangeUnits: "self", components: "ВМ",
    materials: "мозговое вещество в сосуде стоимостью 500+ зм", cost: 500, concentration: true, duration: "minute", durationValue: 1,
    effects: [thought],
    desc: `
*Списки: псионик.*

Вы на короткое время превращаетесь в псионического духа. До окончания заклинания вы получаете следующие преимущества:

**Призрачная форма.** Вы получаете иммунитет к урону ядом и урону психической энергией, а также иммунитет к состоянию <<exhaustion|истощённый>>.

**Бестелесное перемещение.** Ваша скорость полёта составляет 60 футов, и вы можете парить. Вы можете перемещаться через занятые пространства, как если бы это была труднопроходимая местность. Если вы заканчиваете свой ход в таком пространстве, то получаете 1к10 урона силовым полем. Если заклинание оканчивается, пока вы находитесь в таком пространстве, вы перемещаетесь в последнее незанятое пространство, в котором находились.

**Псионная перезарядка.** Совершая действие магия, вы можете коснуться существа (включая себя) и бросить 1к6. Существо восстанавливает 1 потраченную ячейку заклинания, уровень которой равен половине результата броска (округляя вверх) или меньше. После того как существо восстановило ячейку заклинания этим заклинанием, оно не может сделать это снова, пока не завершит продолжительный отдых.`,
    acts: [
      utility("spell:thought-form:cast", { name: "Принять форму", activation: "bonus", self: true, concentration: true, duration: "minute", durationValue: 1, effects: [thought._id] }),
      utility("spell:thought-form:recharge", { name: "Псионная перезарядка", activation: "action", touch: true, spellSlot: false, duration: "inst", concentration: false, count: 1, affects: "creature", roll: "ceil(1d6 / 2)", rollName: "Максимальный уровень ячейки" })
    ]
  });
}
