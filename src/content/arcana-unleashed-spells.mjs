import { utility, save, damage, dmg, effect, change } from "../../tools/lib/core.mjs";
import { spell, folder } from "../../tools/lib/docs.mjs";

const lvlFolder = level => folder("spells", `${level} уровень`, { sort: (level + 1) * 1000 });
const profile = (kind, name, img, changes) => {
  const data = effect(`spell:au:${kind}`, { name, img, transfer: false, changes,
    flags: { spikependium: { arcanaSpell: kind } } });
  data.system.magical = true;
  return data;
};
const disadvantage = () => ["rolls.attack.mode", "rolls.ability.check.mode", "rolls.ability.save.mode", "attributes.death.roll.mode"]
  .map(path => change(`system.${path}`, -1));
const material = () => [{ type: "spikependiumMaterial", target: "", value: "1", scaling: {} }];

export function define() {
  spell({ key: "spell:au-mordenkainens-research", identifier: "mordenkainens-research", name: "Изыскания Морденкайнена", book: "AU", page: 41,
    folder: lvlFolder(5), img: "icons/magic/symbols/runes-star-pentagon-magenta", level: 5, school: "div", rangeUnits: "self", components: "ВС",
    desc: `*Списки: волшебник.*

Вы восстанавливаете не более двух потраченных ячеек заклинаний 2-го уровня и ниже.

**Использование ячейки большего уровня.** Максимальный уровень восстанавливаемых ячеек увеличивается до третьего при накладывании ячейкой 6–7-го уровня или до четвёртого при накладывании ячейкой 8-го уровня и выше.

**Foundry.** В обычном окне применения выберите одну или две потраченные ячейки. Накладывание расходует выбранную ячейку, а восстановление входит в ту же штатную операцию. Повтор кнопки отмены обрабатывается обычной системой ресурсов.`,
    acts: [utility("spell:au-mordenkainens-research:cast", { name: "Восстановить ячейки", activation: "action", self: true })] });
  spell({ key: "spell:au-hindsight", identifier: "hindsight", name: "Взгляд в прошлое", book: "AU", page: 37,
    folder: lvlFolder(9), img: "icons/magic/time/hourglass-tilted-gray", level: 9, school: "div", activation: "minute", activationValue: 10,
    range: 500, components: "ВСМ", materials: "крошечные песочные часы стоимостью не менее 500 зм, расходуемые заклинанием", cost: 500, consumed: true,
    concentration: true, duration: "hour", durationValue: 1,
    desc: `*Списки: волшебник.*

Вы смотрите назад сквозь ткань времени. Вы видите события, произошедшие в пределах дистанции за последние 10 лет, со скоростью примерно один день в секунду. Пока заклинание активно, вы можете свободно замедлять, останавливать, перематывать назад или ускорять эти видения.

**Foundry.** Укажите число комплектов песочных часов в поле запаса материалов. На накладывание расходуются одна ячейка и один комплект; концентрация длится до часа. События прошлого описывает Мастер.`,
    acts: [utility("spell:au-hindsight:cast", { name: "Увидеть прошлое", activation: "minute", activationValue: 10, range: 500,
      concentration: true, duration: "hour", durationValue: 1, consume: material() })] });
  const melody = profile("dissonant-tune", "Сбивающий мотив", "icons/magic/symbols/runes-star-pentagon-magenta", [change("system.attributes.concentration.roll.mode", -1)]);
  spell({ key: "spell:au-dissonant-tune", identifier: "dissonant-tune", name: "Сбивающий мотив", book: "AU", page: 45,
    folder: lvlFolder(2), img: melody.img, level: 2, school: "abj", range: 120, components: "ВС", concentration: true,
    duration: "minute", durationValue: 1, effects: [melody],
    desc: `*Списки: бард, волшебник, чародей.*

Отвлекающая мелодия заполняет сферу радиусом 20 футов с центром в выбранной точке в пределах дистанции. Каждое существо в сфере совершает спасбросок Телосложения. При провале цель теряет концентрацию и совершает с помехой спасброски Телосложения для поддержания концентрации, пока заклинание активно.

**Foundry.** Выберите токены существ в сфере перед накладыванием. При провале снимается их исходная концентрация; помеха связана с данным накладыванием. Повторного спасброска в конце хода это заклинание не даёт.`,
    acts: [save("spell:au-dissonant-tune:cast", { name: "Сбить концентрацию", activation: "action", range: 120, ability: "con",
      template: { type: "sphere", size: 20 }, affects: "creature", effects: [{ _id: melody._id, onSave: false }] })] });
  const iron = profile("iron-body", "Железное тело", "icons/magic/defensive/armor-shield-barrier-steel", [
    ...["bludgeoning", "piercing", "slashing", "fire"].map(type => change("system.traits.dr.value", type)),
    change("system.traits.di.value", "poison"),
    ...["paralyzed", "petrified", "poisoned"].map(type => change("system.traits.ci.value", type))
  ]);
  spell({ key: "spell:au-iron-body", identifier: "iron-body", name: "Железное тело", book: "AU", page: 40,
    folder: lvlFolder(8), img: iron.img, level: 8, school: "trs", rangeUnits: "touch", components: "ВСМ",
    materials: "алмазная пыль стоимостью не менее 250 зм, расходуемая заклинанием", cost: 250, consumed: true,
    concentration: true, duration: "hour", durationValue: 1, effects: [iron],
    desc: `*Списки: волшебник, колдун, чародей.*

Одно согласное существо, к которому вы прикасаетесь, превращается в живой металл. Пока заклинание активно, уровень Истощения цели не может увеличиться. Цель получает сопротивление дробящему, колющему, рубящему урону и урону огнём, иммунитет к урону ядом и состояниям <<paralyzed|Парализованный>>, <<petrified|Окаменевший>> и <<poisoned|Отравленный>>.

Если цель находится в одном из этих трёх состояний при накладывании заклинания, эти состояния немедленно заканчиваются. Уже накопленное истощение сохраняется.

**Применение.** Выберите токен согласной цели и наложите заклинание. Эффект применяется автоматически; штатная концентрация управляет его длительностью. Расходуемый компонент учитывается через запас материалов заклинания.`,
    acts: [utility("spell:au-iron-body:cast", { name: "Железное тело", activation: "action", touch: true,
      count: 1, affects: "creature", effects: [iron._id], consume: material() })]
  });

  const invulnerable = profile("invulnerability", "Неуязвимость", "icons/magic/defensive/shield-barrier-blue", [change("system.traits.di.value", "ALL")]);
  spell({ key: "spell:au-invulnerability", identifier: "invulnerability", name: "Неуязвимость", book: "AU", page: 43,
    folder: lvlFolder(9), img: invulnerable.img, level: 9, school: "abj", rangeUnits: "self", components: "ВСМ",
    materials: "кусок адамантина стоимостью не менее 500 зм, расходуемый заклинанием", cost: 500, consumed: true,
    concentration: true, duration: "minute", durationValue: 10, effects: [invulnerable],
    desc: `*Список: волшебник.*

Пока заклинание активно, вы получаете иммунитет ко всем типам урона.

**Применение.** Защитный эффект автоматически накладывается на заклинателя и зависит от штатной концентрации. Расходуемый компонент учитывается через запас материалов заклинания.`,
    acts: [utility("spell:au-invulnerability:cast", { name: "Неуязвимость", activation: "action", self: true,
      effects: [invulnerable._id], consume: material() })]
  });

  const doubt = profile("instill-doubt", "Насаждение сомнений", "icons/commodities/biological/organ-brain-pink-purple", disadvantage());
  spell({ key: "spell:au-instill-doubt", identifier: "instill-doubt", name: "Насаждение сомнений", book: "AU", page: 43,
    folder: lvlFolder(3), img: doubt.img, level: 3, school: "enc", range: 120, components: "ВС",
    concentration: true, duration: "minute", durationValue: 1, effects: [doubt],
    desc: `*Списки: бард, волшебник, колдун, чародей.*

Вы заставляете сомневаться в себе одно существо, которое видите в пределах дистанции. Цель совершает спасбросок Мудрости. При провале она совершает все тесты к20 с помехой, пока заклинание активно.

В конце каждого своего хода цель повторяет спасбросок, заканчивая на себе этот эффект при успехе.

**Применение.** После штатного спасброска модуль накладывает помеху при провале. В бою подключённый Мастер автоматически обрабатывает повторный спасбросок в конце хода цели. Эффект зависит от концентрации; помеха учитывается штатными бросками системы.`,
    acts: [save("spell:au-instill-doubt:cast", { name: "Насаждение сомнений", activation: "action", range: 120,
      count: 1, affects: "creature", ability: "wis", effects: [{ _id: doubt._id, onSave: false }] })]
  });

  const fractured = profile("fractured-perception", "Расколотое восприятие", "icons/commodities/biological/organ-brain-red", disadvantage());
  spell({ key: "spell:au-fractured-perception", identifier: "fractured-perception", name: "Расколотое восприятие", book: "AU", page: 44,
    folder: lvlFolder(7), img: fractured.img, level: 7, school: "div", range: 120, components: "ВС",
    concentration: true, duration: "minute", durationValue: 1, effects: [fractured],
    desc: `*Списки: бард, волшебник, колдун, чародей.*

Вы заставляете одно видимое существо в пределах дистанции получать противоречивые видения множества возможных вариантов будущего. Цель совершает спасбросок Интеллекта. При провале она получает 12к10 урона психической энергией и совершает все тесты к20 с помехой, пока заклинание активно. При успехе цель получает половину урона, и заклинание заканчивается.

В конце каждого своего хода цель повторяет спасбросок, заканчивая на себе эффект заклинания при успехе.

**Применение.** Начальный урон бросается и применяется штатной карточкой dnd5e. Эффект помехи накладывается после провала. Повторный спасбросок в конце хода не наносит урон и не расходует ячейку. При начальном успехе завершается концентрация именно на этом накладывании.`,
    acts: [save("spell:au-fractured-perception:cast", { name: "Расколотое восприятие", activation: "action", range: 120,
      count: 1, affects: "creature", ability: "int", damage: [dmg("12d10", "psychic")], onSave: "half",
      effects: [{ _id: fractured._id, onSave: false }] })]
  });

  const mirrors = profile("mesmerizing-mirrors", "Завораживающие зеркала", "icons/sundries/survival/mirror-plain", [
    change("system.attributes.movement.multiplier", 0.5, "multiply")
  ]);
  mirrors.statuses = ["stunned"];
  spell({ key: "spell:au-mesmerizing-mirrors", identifier: "mesmerizing-mirrors", name: "Завораживающие зеркала", book: "AU", page: 40,
    folder: lvlFolder(8), img: mirrors.img, level: 8, school: "ill", range: 90, components: "ВСМ", materials: "осколок зеркала",
    concentration: true, duration: "minute", durationValue: 1, effects: [mirrors],
    desc: `*Списки: бард, волшебник, колдун, чародей.*

Вы создаёте десятки иллюзорных зеркал, чтобы запутать не более трёх существ по вашему выбору, которых вы видите в пределах дистанции. Каждая цель совершает спасбросок Интеллекта. При провале цель получает 7к6 урона психической энергией и становится <<stunned|Ошеломлённой>>. Пока цель Ошеломлена, её скорость уменьшается вдвое. При успехе цель получает только половину урона.

Ошеломлённая цель повторяет спасбросок в конце каждого своего хода, заканчивая действие заклинания на себе при успехе.

**Применение.** Выберите от одной до трёх целей. Эффекты и повторные спасброски обрабатываются отдельно для каждой цели. Урон применяется штатной карточкой. Иммунитет к Ошеломлению исключает этот эффект, а повторные накладывания одного заклинания не умножают штраф скорости.`,
    acts: [save("spell:au-mesmerizing-mirrors:cast", { name: "Завораживающие зеркала", activation: "action", range: 90,
      count: 3, affects: "creature", ability: "int", damage: [dmg("7d6", "psychic")], onSave: "half",
      effects: [{ _id: mirrors._id, onSave: false }] })]
  });

  const terrain = profile("confusing-terrain", "Неясная местность", "icons/environment/wilderness/terrain-rocks-brown", [
    change("system.attributes.movement.multiplier", 0.5, "multiply")
  ]);
  spell({ key: "spell:au-confusing-terrain", identifier: "confusing-terrain", name: "Неясная местность", book: "AU", page: 44,
    folder: lvlFolder(2), img: terrain.img, level: 2, school: "ill", range: 120, components: "ВСМ", materials: "искривлённая линза",
    concentration: true, duration: "minute", durationValue: 1, effects: [terrain],
    desc: `*Списки: бард, волшебник, изобретатель, колдун.*

Вы создаёте иллюзорные препятствия, например камни или шипы, чтобы сбить с толку не более трёх существ, которых вы видите в пределах дистанции. Каждая цель совершает спасбросок Интеллекта. При провале скорость цели уменьшается вдвое, и она не может совершать действие Рывок.

Сбитая с толку цель повторяет спасбросок в конце каждого своего хода, заканчивая на себе эффект при успехе.

**Применение.** Выберите от одной до трёх целей. Скорости всех видов передвижения изменяются штатным множителем. Модуль блокирует отдельные действия Рывок, включая бонусные; выбор Рывка внутри комбинированного умения подтверждается Мастером.`,
    acts: [save("spell:au-confusing-terrain:cast", { name: "Неясная местность", activation: "action", range: 120,
      count: 3, affects: "creature", ability: "int", effects: [{ _id: terrain._id, onSave: false }] })]
  });

  const putrid = profile("putrid-burst", "Гнойный взрыв — Отравлен", "icons/magic/unholy/orb-glowing-purple", []);
  putrid.statuses = ["poisoned"];
  spell({ key: "spell:au-putrid-burst", identifier: "putrid-burst", name: "Гнойный взрыв", book: "AU", page: 39,
    folder: lvlFolder(4), img: putrid.img, level: 4, school: "nec", rangeUnits: "self", components: "ВС",
    duration: "minute", durationValue: 1, effects: [putrid],
    desc: `*Списки: волшебник, друид, колдун, чародей.*

От вас исходит линия миазмов длиной 60 футов и шириной 10 футов в выбранном направлении. Все существа в линии совершают спасбросок Телосложения. При провале цель получает 4к10 урона некротической энергией и становится <<poisoned|Отравленной>>, пока заклинание активно. При успехе начальный урон не наносится.

Существо, Отравленное этим заклинанием, получает 2к10 урона ядом в начале каждого своего хода. В конце каждого своего хода Отравленная цель повторяет спасбросок, заканчивая действие заклинания на себе при успехе.

**Использование ячейки большего уровня.** Начальный урон увеличивается на 1к10 за каждый уровень ячейки выше четвёртого. Периодический урон остаётся 2к10.

**Применение.** Перед накладыванием выберите токены существ в линии; шаблон создаётся штатным действием. Заклинание не требует концентрации. Подключённый Мастер автоматически обрабатывает периодический урон и повторные спасброски. Иммунитет к состоянию Отравленный исключает продолжающийся эффект, но не начальный некротический урон. Если бросок уже начат, но его карточка не сохранилась, модуль не перебрасывает его. Утраченный результат и пропущенное начало хода разрешает Мастер.`,
    acts: [save("spell:au-putrid-burst:cast", { name: "Гнойный взрыв", activation: "action", self: true,
      affects: "creature", count: "", template: { type: "line", size: 60, width: 10 }, ability: "con",
      damage: [dmg("4d10", "necrotic", { scale: 1 })], onSave: "none", effects: [{ _id: putrid._id, onSave: false }] }),
    damage("spell:au-putrid-burst:tick", { name: "Ядовитые миазмы (начало хода)", activation: "special",
      condition: "Цель Отравлена именно этим заклинанием", spellSlot: false, count: 1, affects: "creature",
      duration: "inst", concentration: false, damage: [dmg("2d10", "poison")] })]
  });

  const ages = profile("vision-of-ages", "Видение уходящих эпох", "icons/magic/time/hourglass-tilted-gray", []);
  ages.statuses = ["paralyzed"];
  const shake = utility("spell:au:shake", { name: "Встряхнуть цель (действие)", activation: "action", range: 5,
    count: 1, affects: "creature", spellSlot: false, duration: "inst", concentration: false });
  shake.flags = { spikependium: { arcanaShakeTemplate: true } };
  spell({ key: "spell:au-vision-of-ages", identifier: "vision-of-ages", name: "Видение уходящих эпох", book: "AU", page: 37,
    folder: lvlFolder(9), img: ages.img, level: 9, school: "ill", range: 120, components: "ВС",
    duration: "minute", durationValue: 1, effects: [ages],
    desc: `*Списки: бард, волшебник, колдун, чародей.*

Вы заставляете одно видимое существо в пределах дистанции поверить, что оно и его окружение за мгновения рассыпаются в прах, словно проходят целые эпохи. Цель совершает спасбросок Интеллекта. При провале она получает 10к12 урона психической энергией и становится <<paralyzed|Парализованной>>, пока заклинание активно. При успехе начального урона нет.

Пока цель Парализована, она повторяет спасбросок в конце каждого своего хода. При провале она получает один уровень Истощения. При успехе заклинание заканчивается. Оно также заканчивается, если другое существо в пределах 5 футов от цели действием потрясёт её и вырвет из иллюзии.

**Применение.** Повторные спасброски в бою обрабатывает подключённый Мастер. Провал повышает штатный уровень истощения один раз за этот спасбросок; накопленное истощение сохраняется после окончания заклинания. Для встряхивания выберите токен помогающего существа и воспользуйтесь кнопкой в карточке заклинания. Заклинание не требует концентрации.`,
    acts: [save("spell:au-vision-of-ages:cast", { name: "Видение уходящих эпох", activation: "action", range: 120,
      count: 1, affects: "creature", ability: "int", damage: [dmg("10d12", "psychic")], onSave: "none",
      effects: [{ _id: ages._id, onSave: false }] }), structuredClone(shake)]
  });

  const sleep = profile("catnap", "Дрёма", "icons/magic/time/hourglass-brown-orange", []);
  sleep.statuses = ["unconscious"];
  sleep.flags.spikependium.endsOnDamage = true;
  spell({ key: "spell:au-catnap", identifier: "catnap", name: "Дрёма", book: "AU", page: 40,
    folder: lvlFolder(3), img: sleep.img, level: 3, school: "enc", range: 30, components: "СМ", materials: "щепотка песка",
    duration: "minute", durationValue: 10, effects: [sleep],
    desc: `*Списки: бард, волшебник, изобретатель, чародей.*

Вы показываете успокаивающий жест. Не более трёх согласных существ, которых вы видите в пределах дистанции, становятся <<unconscious|Бессознательными>>, пока заклинание активно. Заклинание заканчивается на цели, если она получает урон или другое существо действием встряхивает её.

Если цель остаётся Бессознательной всю длительность заклинания, она получает преимущества короткого отдыха и не может снова стать целью этого заклинания до завершения долгого отдыха.

**Использование ячейки большего уровня.** Вы можете выбрать одно дополнительное существо за каждый уровень ячейки выше третьего.

**Применение.** После десяти минут непрерывного сна модуль предлагает штатный короткий отдых без дополнительного продвижения времени. Преждевременное прекращение эффекта отменяет это преимущество. Полученный отдых блокирует повторное применение до долгого отдыха. Для пробуждения действием используется кнопка встряхивания в карточке заклинания.`,
    acts: [utility("spell:au-catnap:cast", { name: "Дрёма", activation: "action", range: 30,
      count: "@item.level", affects: "creature", effects: [sleep._id] }), structuredClone(shake)]
  });
}
