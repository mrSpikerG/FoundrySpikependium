// Существа из «Злодейских опций» (формы титана) и «Мистических подклассов» (спутник реликт).
import { attack, save, heal, utility, dmg, uses, LR, useSlot, useSelf } from "../../tools/lib/core.mjs";
import { npc, folder } from "../../tools/lib/docs.mjs";

const TITAN_NOTE = "<p><strong>Временные хиты</strong> 2 × ваш уровень друида (выдаются при превращении). <strong>Сила, Ловкость</strong> в этой форме равны вашему значению Мудрости — <em>в Foundry выставьте их вручную после превращения</em>. Интеллект, Мудрость и Харизма сохраняются; Телосложение выставьте равным исходному вручную. Размер: Большой; Огромный (уровень друида 10+); Громадный (уровень друида 14+).</p>";

export function define() {
  const fForms = folder("creatures", "Формы титана", { sort: 3000 });
  const fComp = folder("creatures", "Спутники подклассов", { sort: 2000 });

  const rend = (key, type) => ({
    name: "Разрывание", img: "icons/creatures/claws/claw-curved-jagged-gray",
    desc: `*Рукопашная атака:* бонус равен вашему модификатору атаки заклинанием, досягаемость 10 фт. *Попадание:* 1к8 + ваш модификатор Мудрости ${type === "slashing" ? "рубящего" : type === "piercing" ? "колющего" : "дробящего"} урона.`,
    acts: [attack(key, { activation: "action", range: 10, ability: "wis", attackType: "melee", classification: "spell", damage: [dmg("1d8 + @abilities.wis.mod", type)] })]
  });
  const multi = { name: "Мультиатака (уровень друида 5+)", img: "icons/skills/melee/weapons-crossed-swords-white-blue", desc: "Вы совершаете две атаки Разрывание." };
  const titan = (key, name, en, img, o) => npc({
    key, name, en, book: "UA-VO", page: o.page, folder: fForms, img, size: "lg", creatureType: "monstrosity", alignment: "Мировоззрение не меняется",
    ac: o.ac, acFormula: `${o.ac} + @abilities.wis.mod`, hp: 1,
    movement: { walk: 40, ...o.movement }, abilities: { str: 16, dex: 16, con: 10, int: 10, wis: 10, cha: 10 },
    senses: { darkvision: 60 }, languagesCustom: "ваше знание языков не изменяется", spellcasting: "wis",
    bio: `<p><strong>КД</strong> ${o.ac} + ваш модификатор Мудрости.</p>${TITAN_NOTE}`, tokenSize: 2,
    items: o.items
  });

  titan("actor:titan-behemoth", "Бегемот", "Behemoth", "icons/creatures/abilities/bull-head-horns-glowing", {
    page: 4, ac: 11, movement: { climb: 40 },
    items: [
      { name: "Ярость (уровень друида 10+)", img: "icons/creatures/abilities/bull-head-horns-glowing",
        desc: "Когда вы впервые в ход входите в пространство врага, размер которого меньше вашего минимум на один, это существо подвергается следующему эффекту: *Спасбросок Силы:* Сл. равна вашей Сл. спасброска заклинаний. *Провал:* цель ложится ничком. Если у цели уже есть состояние лежащий ничком, то вместо этого она получает 2к6 дробящего урона.",
        acts: [save("actor:behemoth:rampage", { activation: "special", condition: "Первый вход в пространство меньшего врага за ход", count: 1, affects: "creature", ability: "str" })] },
      { name: "Осадное чудовище", img: "icons/environment/settlement/watchtower-stone", desc: "Вы наносите двойной урон объектам и строениям." },
      multi, rend("actor:behemoth:rend", "slashing"),
      { name: "Раскалённое дыхание", img: "icons/magic/fire/beam-jet-stream-embers",
        desc: "Вы тратите ячейку заклинаний 1+ уровня. *Спасбросок Ловкости:* Сл. равна вашей Сл. спасброска заклинаний, каждое существо в линии шириной 5 футов и длиной 60 футов. *Провал:* 2к8 за каждый уровень потраченной ячейки + ваш модификатор Мудрости урона излучением. *Успех:* половина урона.",
        acts: [save("actor:behemoth:breath", { activation: "action", template: { type: "line", size: 60 }, affects: "creature", ability: "dex", consume: [useSlot(1)], scaling: true, damage: [dmg("2d8 + @abilities.wis.mod", "radiant", { scale: 2 })], onSave: "half" })] }
    ]
  });

  titan("actor:titan-leviathan", "Левиафан", "Leviathan", "icons/creatures/tentacles/tentacles-octopus-black-pink", {
    page: 4, ac: 10, movement: { swim: 40 },
    items: [
      { name: "Амфибия", img: "icons/magic/water/bubbles-air-water-blue", desc: "Вы можете дышать воздухом и водой." },
      { name: "Токсичное зловоние (уровень друида 10+)", img: "icons/magic/air/fog-gas-smoke-dense-green",
        desc: "*Спасбросок Телосложения:* Сл. равна вашей Сл. спасброска заклинаний, существо на ваш выбор, когда начинает свой ход в пределах эманации с радиусом 10 футов, исходящей от вас. *Провал:* 2к4 урона ядом, и цель отравлена до начала своего следующего хода.",
        acts: [save("actor:leviathan:stench", { activation: "special", condition: "Существо начинает ход в 10 футах", template: { type: "radius", size: 10 }, affects: "enemy", ability: "con", damage: [dmg("2d4", "poison")], onSave: "none" })] },
      multi, rend("actor:leviathan:rend", "bludgeoning"),
      { name: "Чернильное облако", img: "icons/magic/air/fog-gas-smoke-dense-gray",
        desc: "*Триггер:* вы получаете урон. *Ответ:* вы тратите ячейку заклинания 1+ уровня и выпускаете чернильное облако, которое заполняет куб со стороной 15 футов с центром на вас, после чего вы перемещаетесь вплоть до своей скорости. Куб является сильно заслонённой местностью. Он длится 1 минуту или пока сильное течение или ветер (например, созданный заклинанием Порыв ветра) не рассеет его.",
        acts: [utility("actor:leviathan:ink", { activation: "reaction", condition: "Вы получаете урон", consume: [useSlot(1)], template: { type: "cube", size: 15 }, duration: "minute", durationValue: 1 })] }
    ]
  });

  titan("actor:titan-insectoid", "Инсектоид", "Insectoid", "icons/creatures/invertebrates/wasp-swarm-attack", {
    page: 5, ac: 8, movement: { fly: 40 },
    items: [
      { name: "Облёт", img: "icons/creatures/abilities/wings-birdlike-blue", desc: "Вы не вызываете провоцированную атаку, когда вылетаете из зоны досягаемости врага." },
      { name: "Ментальный улей (уровень друида 10+)", img: "icons/magic/control/energy-stream-link-spiral-teal",
        desc: "Когда вы принимаете эту форму, вы устанавливаете телепатическую связь с существами на ваш выбор, которых вы видите и которые могут общаться как минимум на одном языке; максимальное число существ равно вашему уровню друида. Вы и выбранные существа можете телепатически общаться друг с другом, независимо от того, есть ли у вас общий язык, пока вы находитесь на одном плане." },
      multi, rend("actor:insectoid:rend", "piercing"),
      { name: "Бодрящая пыльца", img: "icons/magic/nature/plant-seed-hands-glow-yellow",
        desc: "Вы тратите ячейку заклинания 1+ уровня и испускаете облако целительной пыльцы, которое может восстановить 2к8 + 5 × уровень потраченной ячейки заклинания хитов. Выберите любое число существ в пределах 15 футов от себя и распределите эти хиты между ними.",
        acts: [heal("actor:insectoid:pollen", { activation: "action", consume: [useSlot(1)], scaling: true, template: { type: "radius", size: 15 }, affects: "ally", formula: "2d8 + 5 * (1 + @scaling)" })] }
    ]
  });

  // --- Спутник реликт (три вида) --------------------------------------------
  const vestige = (key, variant, en, type, dr, dmgType, img, power) => npc({
    key, name: `Спутник реликт (${variant})`, en: `Vestige Companion (${en})`, book: "UA-MS", page: 5, folder: fComp, img,
    size: "sm", creatureType: type, alignment: "Нейтральный", ac: 13, hp: 4, hpFormula: "1d6",
    movement: { walk: 5, fly: 30, hover: true }, abilities: { str: 1, dex: 14, con: 10, int: 15, wis: 15, cha: 16 },
    dr: [dr], ci: ["charmed", "frightened", "prone"], senses: { darkvision: 60 }, languagesCustom: "говорит на языках, которые знаете вы",
    bio: "<p><strong>КД</strong> 13 + ваш модификатор Харизмы; <strong>Хиты</strong> 4 + 4 × ваш уровень колдуна (кости хитов [к6] в количестве, равном вашему уровню колдуна). <strong>БМ</strong> равен вашему БМ.</p><p><em>Примечание для Foundry: значения, зависящие от уровня и Харизмы колдуна, подставляются действием призыва автоматически.</em></p>",
    items: [
      { name: "Связь договора", img: "icons/magic/control/energy-stream-link-large-blue", desc: "Добавьте свой бонус мастерства к любой проверке характеристики или спасброску, которые совершает реликт." },
      { name: "Удар реликта", img,
        desc: `*Рукопашная или дальнобойная атака:* бонус равен вашему модификатору атаки заклинанием, досягаемость 5 фт. или дистанция 60 фт. *Попадание:* 1к6 + 3 + ваш модификатор Харизмы урона ${dmgType[1]}.`,
        acts: [
          attack(`${key}:strike:melee`, { name: "Рукопашная", activation: "action", range: 5, attackType: "melee", classification: "spell", damage: [dmg("1d6 + 3", dmgType[0])] }),
          attack(`${key}:strike:ranged`, { name: "Дальнобойная", activation: "action", range: 60, attackType: "ranged", classification: "spell", damage: [dmg("1d6 + 3", dmgType[0])] })
        ] },
      { name: `Божественная сила: ${power.name} (1/день)`, img: power.img, uses: uses(1, LR), desc: power.desc, acts: [power.act] }
    ]
  });
  vestige("actor:vestige-undead", "нежить", "Undead", "undead", "necrotic", ["necrotic", "некротической энергией"], "icons/magic/death/skull-energy-light-purple", {
    name: "Проклятое воззвание", img: "icons/magic/unholy/hand-marked-pink",
    desc: "*Бонусное действие.* Реликт накладывает проклятье на видимое существо в пределах 30 футов от реликта на 1 минуту. Пока цель проклята, она совершает атаки по вам и реликту с помехой.",
    act: utility("actor:vestige-undead:power", { activation: "bonus", range: 30, count: 1, affects: "creature", duration: "minute", durationValue: 1, consume: [useSelf()] })
  });
  vestige("actor:vestige-fiend", "исчадие", "Fiend", "fiend", "fire", ["fire", "огнём"], "icons/magic/fire/flame-burning-skull-orange", {
    name: "Дьявольская замена", img: "icons/magic/movement/portal-vortex-orange",
    desc: "*Бонусное действие.* Если вы и реликт находитесь в пределах 60 футов друг от друга, то вы оба телепортируетесь, меняясь местами.",
    act: utility("actor:vestige-fiend:power", { activation: "bonus", range: 60, consume: [useSelf()] })
  });
  vestige("actor:vestige-celestial", "небожитель", "Celestial", "celestial", "radiant", ["radiant", "излучением"], "icons/magic/holy/angel-winged-humanoid-blue", {
    name: "Исцеляющее касание", img: "icons/magic/life/heart-hand-gold-green",
    desc: "*Бонусное действие.* Реликт касается другого существа. Цель восстанавливает 2к8 хитов + ваш модификатор Харизмы и прекращает одно состояние, действующее на неё: ослеплённый, оглохший или отравленный.",
    act: heal("actor:vestige-celestial:power", { activation: "bonus", touch: true, count: 1, affects: "creature", formula: "2d8", consume: [useSelf()] })
  });
}
