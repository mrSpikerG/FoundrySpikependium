// Существа: призываемые заклинаниями и спутники подклассов.
import { attack, save, utility, dmg, uses, useSelf } from "../../tools/lib/core.mjs";
import { npc, folder } from "../../tools/lib/docs.mjs";

const FOUNDRY_NOTE = "<p><em>Примечание для Foundry: значения, зависящие от уровня заклинания или уровня персонажа, подставляются действием призыва автоматически.</em></p>";

export function define() {
  const fSpell = folder("creatures", "Призываемые заклинаниями", { sort: 1000 });
  const fComp = folder("creatures", "Спутники подклассов", { sort: 2000 });

  // --- Гомункул слуга -------------------------------------------------------
  npc({
    key: "actor:homunculus-servant", name: "Гомункул слуга", en: "Homunculus Servant", book: "UA-EB", page: 8,
    folder: fSpell, img: "icons/creatures/magical/construct-iron-stomping-yellow",
    size: "tiny", creatureType: "construct", alignment: "Нейтральный", ac: 13, hp: 5,
    movement: { walk: 20, fly: 30 }, abilities: { str: 4, dex: 15, con: 12, int: 10, wis: 10, cha: 7 },
    di: ["poison"], ci: ["exhaustion", "poisoned"], senses: { darkvision: 60 },
    languagesCustom: "телепатия 1 миля (работает только с создателем)",
    bio: "<p><strong>КД</strong> 13; <strong>Хиты</strong> 5 + 5 за уровень заклинания (кости хитов [к4] в количестве, равном уровню заклинания). <strong>БМ</strong> равен вашему БМ.</p>" + FOUNDRY_NOTE,
    items: [
      { name: "Уклонение", img: "icons/magic/defensive/illusion-evasion-echo-purple",
        desc: "Если гомункул подвергается эффекту, который позволяет совершить спасбросок Ловкости для получения только половины урона, то гомункул вместо этого не получает урона при успешном спасброске и только половину урона при провале. Он не может использовать эту особенность, если находится в состоянии <<incapacitated|недееспособный>>." },
      { name: "Магическая связь", img: "icons/magic/control/energy-stream-link-teal",
        desc: "Добавьте уровень заклинания к любой проверке характеристики или спасброску, совершаемому гомункулом." },
      { name: "Удар силой", img: "icons/magic/lightning/orb-ball-blue",
        desc: "*Рукопашная или дальнобойная атака:* бонус равен вашему модификатору атаки заклинанием, досягаемость 5 фт. или дистанция 30 фт. *Попадание:* 1к6 + уровень заклинания урона силовым полем.",
        acts: [
          attack("actor:homunculus:force-strike:melee", { name: "Рукопашная", activation: "action", range: 5, attackType: "melee", classification: "spell", damage: [dmg("1d6", "force")] }),
          attack("actor:homunculus:force-strike:ranged", { name: "Дальнобойная", activation: "action", range: 30, attackType: "ranged", classification: "spell", damage: [dmg("1d6", "force")] })
        ] },
      { name: "Направление магии", img: "icons/magic/light/hand-sparks-glow-yellow",
        desc: "*Триггер:* Вы накладываете заклинание с дистанцией «касание», и гомункул находится в пределах 120 футов от вас. *Ответ:* Гомункул передаёт заклинание через своё прикосновение.",
        acts: [utility("actor:homunculus:channel", { activation: "reaction", condition: "Создатель накладывает заклинание с дистанцией «касание» в пределах 120 футов" })] }
    ]
  });

  // --- Спутник пурпурный дракон --------------------------------------------
  npc({
    key: "actor:purple-dragon-companion", name: "Спутник пурпурный дракон", en: "Purple Dragon Companion",
    book: "UA-FR", page: 4, folder: fComp, img: "icons/creatures/abilities/dragon-breath-purple",
    size: "sm", creatureType: "dragon", alignment: "Нейтральный", ac: 13, hp: 4,
    movement: { walk: 30, fly: 30, swim: 30 }, abilities: { str: 16, dex: 16, con: 12, int: 8, wis: 13, cha: 10 },
    senses: { darkvision: 60 }, telepathy: 30, languagesCustom: "понимает языки, которые знаете вы",
    bio: "<p><strong>КД</strong> 13 + ваш модификатор Интеллекта; <strong>Хиты</strong> 4 + пятикратный ваш уровень воина (кости хитов [к6] в количестве, равном вашему уровню воина). <strong>БМ</strong> равен вашему БМ.</p><p>На 7 уровне дракон становится Средним, на 15 — Большим (скорость и скорость полёта 40 футов).</p>"
      + "<p><em>Примечание для Foundry: бонус атаки Разрыванием и Сл. Дыхания гравитации берутся у призывателя (БМ + модификатор Интеллекта воина).</em></p>",
    items: [
      { name: "Амфибия", img: "icons/magic/water/bubbles-air-water-blue", desc: "Дракон может дышать и воздухом, и под водой." },
      { name: "Непоколебимая связь", img: "icons/magic/control/energy-stream-link-large-blue",
        desc: "Добавьте половину вашего бонуса мастерства (округлённого вниз) к любой проверке характеристики или спасброску дракона." },
      { name: "Разрывание", img: "icons/creatures/claws/claw-talons-glowing-orange",
        desc: "*Рукопашная атака:* +3 + ваш модификатор Интеллекта, досягаемость 5 футов. *Попадание:* 1к6 + ваш модификатор Интеллекта урона силовым полем.",
        acts: [attack("actor:purple-dragon:rend", { activation: "action", range: 5, attackType: "melee", classification: "weapon", damage: [dmg("1d6", "force")] })] },
      { name: "Дыхание гравитации (2/день)", img: "icons/magic/air/wind-vortex-swirl-purple",
        uses: uses(2, { period: "lr", type: "recoverAll" }),
        desc: "*Спасбросок Телосложения:* Сл. 8 + ваш БМ + ваш модификатор Интеллекта, каждое существо в 15-футовом конусе. *Провал:* цель либо притягивается к дракону на расстояние до 15 футов, либо отталкивается на 15 футов.\n\nС 7 уровня (Всадник дракона) конус становится 30-футовым, и при провале существо также получает 2к6 урона силовым полем.",
        acts: [
          save("actor:purple-dragon:breath", { name: "Конус 15 фт.", activation: "action", template: { type: "cone", size: 15 }, affects: "creature", ability: "con", consume: [useSelf()] }),
          save("actor:purple-dragon:breath-improved", { name: "Улучшенное (конус 30 фт.)", activation: "action", template: { type: "cone", size: 30 }, affects: "creature", ability: "con", consume: [useSelf()], damage: [dmg("2d6", "force")], onSave: "none" })
        ] }
    ]
  });

  // --- Реанимированный спутник ---------------------------------------------
  npc({
    key: "actor:reanimated-companion", name: "Реанимированный спутник", en: "Reanimated Companion",
    book: "UA-HS", page: 2, folder: fComp, img: "icons/magic/death/hand-dirt-undead-zombie",
    size: "sm", creatureType: "undead", alignment: "Нейтральный", ac: 10, hp: 4,
    movement: { walk: 30 }, abilities: { str: 14, dex: 10, con: 16, int: 4, wis: 10, cha: 6 },
    dr: ["necrotic", "poison"], di: ["lightning"], ci: ["charmed", "exhaustion", "poisoned"],
    senses: { blindsight: 60 }, languagesCustom: "понимает языки, которые знаете вы",
    bio: "<p><strong>КД</strong> 10 + ваш модификатор Интеллекта; <strong>Хиты</strong> 4 + четырёхкратный уровень изобретателя (кости хитов [к6] в количестве, равном вашему уровню изобретателя). <strong>БМ</strong> равен вашему БМ.</p>" + FOUNDRY_NOTE,
    items: [
      { name: "Взрыв при смерти", img: "icons/magic/death/skull-energy-light-purple",
        desc: "Спутник взрывается при смерти. *Спасбросок Ловкости:* Сл. равна вашей Сл. спасброска, каждое существо в пределах 10-футовой эманации от спутника. *Провал:* 2к6 урона некротической энергией (4к6 с 15 уровня изобретателя).",
        acts: [save("actor:reanimated:explosion", { activation: "special", condition: "При смерти спутника", template: { type: "radius", size: 10 }, affects: "creature", ability: "dex", damage: [dmg("2d6", "necrotic")], onSave: "none" })] },
      { name: "Поглощение электричества", img: "icons/magic/lightning/bolt-strike-blue",
        desc: "Каждый раз, когда спутник подвергается урону электричеством, он восстанавливает количество хитов, равное урону электричеством." },
      { name: "Ужасающий удар", img: "icons/magic/death/hand-withered-gray",
        desc: "*Рукопашная атака:* бонус равен вашему модификатору атаки заклинанием, досягаемость 5 фт. *Попадание:* 1к4 + 2 + ваш модификатор Интеллекта урона некротической энергией, и цель не может совершать провоцированные атаки до начала своего следующего хода.",
        acts: [attack("actor:reanimated:strike", { activation: "action", range: 5, attackType: "melee", classification: "spell", damage: [dmg("1d4 + 2", "necrotic")] })] }
    ]
  });

  // --- Дух псионики (три сущности) -----------------------------------------
  const spiritBase = (key, variant, o) => npc({
    key, name: `Дух псионики (${variant})`, en: `Psionic Spirit (${o.en})`, book: "UA-PS", page: 10, folder: fSpell,
    img: o.img, size: "med", creatureType: "aberration", alignment: "Нейтральный", ac: o.ac, hp: 40,
    movement: { walk: 30, fly: o.fly ?? null, hover: !!o.fly }, abilities: { str: 16, dex: 12, con: 11, int: 16, wis: 12, cha: 10 },
    di: ["psychic"], senses: { darkvision: 60 }, languages: ["deep"], telepathy: 60,
    bio: `<p><strong>КД</strong> 11 + уровень заклинания${o.ac === 13 ? " + 2" : ""}; <strong>Хиты</strong> 40 + 10 за каждый уровень заклинания выше 3. <strong>БМ</strong> равен вашему БМ.</p>` + FOUNDRY_NOTE,
    items: [
      ...(o.incorporeal ? [{ name: "Бестелесное перемещение", img: "icons/magic/perception/silhouette-stealth-shadow",
        desc: "Дух может перемещаться сквозь существ и объекты, как если бы они были труднопроходимой местностью. Если дух заканчивает свой ход в таком пространстве, то он перемещается в ближайшее свободное пространство и получает 1к10 урона силовым полем за каждые 5 фт. пути." }] : []),
      { name: "Мультиатака", img: "icons/skills/melee/weapons-crossed-swords-purple",
        desc: "Дух совершает количество атак, равное половине уровня заклинания (с округлением вниз)." },
      ...o.items
    ]
  });

  spiritBase("actor:psionic-spirit-crystal", "кристаллическая сущность", {
    en: "Crystalline", img: "icons/commodities/gems/gem-rough-cushion-purple-pink", ac: 13,
    items: [
      { name: "Удар кристалла", img: "icons/commodities/gems/gem-fragments-teal",
        desc: "*Рукопашная атака:* бонус равен вашему модификатору атаки заклинанием, досягаемость 5 фт. *Попадание:* 1к10 + 3 + уровень заклинания колющего урона.",
        acts: [attack("actor:spirit-crystal:strike", { activation: "action", range: 5, attackType: "melee", classification: "spell", damage: [dmg("1d10 + 3", "piercing")] })] },
      { name: "Рой осколков", img: "icons/magic/defensive/shield-barrier-blades-teal",
        desc: "*Триггер:* по духу попадает рукопашная атака. *Ответ:* дух уменьшает получаемый урон от атаки вдвое (округляя вниз). Затем дух может телепортироваться в свободное видимое пространство в пределах 30 фт.",
        acts: [utility("actor:spirit-crystal:swarm", { activation: "reaction", condition: "По духу попадает рукопашная атака" })] }
    ]
  });
  spiritBase("actor:psionic-spirit-ecto", "эктоплазменная сущность", {
    en: "Ectoplasmic", img: "icons/creatures/slimes/slime-movement-dripping-purple", ac: 11, incorporeal: true,
    items: [
      { name: "Всплеск эктоплазмы", img: "icons/magic/acid/projectile-glowing-bubbles",
        desc: "*Дальнобойная атака:* бонус равен вашему модификатору атаки заклинанием, дистанция 30 фт. *Попадание:* 1к6 + 3 + уровень заклинания урона психической энергией. *Попадание или промах:* у каждого существа в 5-футовой эманации, исходящей из цели и включающей её, скорость уменьшается на 5 фт. до конца следующего хода духа.",
        acts: [attack("actor:spirit-ecto:burst", { activation: "action", range: 30, attackType: "ranged", classification: "spell", damage: [dmg("1d6 + 3", "psychic")] })] }
    ]
  });
  spiritBase("actor:psionic-spirit-phantom", "призрачная сущность", {
    en: "Phantasmal", img: "icons/creatures/magical/spirit-undead-ghost-purple", ac: 11, fly: 30, incorporeal: true,
    items: [
      { name: "Эфемерный луч", img: "icons/magic/light/beam-rays-magenta-large",
        desc: "*Дальнобойная атака:* бонус равен вашему модификатору атаки заклинанием, дистанция 120 фт. *Попадание:* 1к8 + 3 + уровень заклинания урона психической энергией.",
        acts: [attack("actor:spirit-phantom:ray", { activation: "action", range: 120, attackType: "ranged", classification: "spell", damage: [dmg("1d8 + 3", "psychic")] })] }
    ]
  });
}

