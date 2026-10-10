// Магические предметы UA 2024 «Обновление Эберрона».
import { utility, save, teleport, effect, change, uses, DAWN, useSelf } from "../../tools/lib/core.mjs";
import { equipment, weaponTemplate, enchantActivity, enchantEffect, folder, ref } from "../../tools/lib/docs.mjs";

const BOOK = "UA-EB";

/** Изменения зачарования, общие для оружия-шаблонов. */
function enchantChanges(key, nameTpl, rarity, attunement, img, extra = []) {
  return [
    change("name", nameTpl, "override"),
    change("system.rarity", rarity, "override"),
    ...(attunement ? [change("system.attunement", attunement, "override")] : []),
    change("system.magicalBonus", 1, "override"),
    change("system.properties", "mgc", "add"),
    change("system.description.value", `{}<p>@Embed[${ref(key)} caption=false]</p>`, "override"),
    change("img", img, "override"),
    ...extra
  ];
}

export function define() {
  const F = folder("items", "UA: Обновление Эберрона", { sort: 1000 });

  equipment({
    key: "item:boots-of-the-winding-path", folder: F, book: BOOK, page: 9, name: "Сапоги извилистого пути", en: "Boots of the Winding Path",
    img: "icons/equipment/feet/boots-leather-banded-furred", equipType: "clothing", rarity: "uncommon", attunement: "required",
    desc: "*Чудесный предмет, необычный (требуется настройка).*\n\nПока вы носите эти сапоги, вы можете бонусным действием телепортироваться на расстояние до 15 футов в свободное пространство, которое вы видите. Вы должны были занимать это пространство в какой-то момент в течение текущего хода.",
    acts: [teleport("item:winding-path:teleport", { activation: "bonus", distance: 15, condition: "В пространство, которое вы занимали в этот ход", requireAttunement: true })]
  });

  equipment({
    key: "item:helm-of-awareness", folder: F, book: BOOK, page: 9, name: "Шлем бдительности", en: "Helm of Awareness",
    img: "icons/equipment/head/helm-norman-engraved", equipType: "clothing", rarity: "uncommon", attunement: "required",
    desc: "*Чудесный предмет, необычный (требуется настройка).*\n\nПока вы носите этот шлем, вы совершаете броски инициативы с преимуществом.",
    effects: [effect("item:helm-of-awareness:init", { name: "Преимущество на инициативу", img: "icons/equipment/head/helm-norman-engraved", changes: [change("system.attributes.init.roll.mode", 1)] })]
  });

  equipment({
    key: "item:manifold-tool", folder: F, book: BOOK, page: 9, name: "Мультиинструмент", en: "Manifold Tool",
    img: "icons/tools/hand/wrench-steel", equipType: "wondrous", rarity: "common", attunement: "required",
    desc: "*Чудесный предмет, обычный (требуется настройка).*\n\nЭтот инструмент принимает форму гаечного ключа, отвёртки или другого простого инструмента. Действием магия вы можете коснуться предмета и преобразовать его в выбранные вами инструменты ремесленника. В какой бы форме ни находился этот инструмент, вы владеете им при использовании.",
    acts: [utility("item:manifold-tool:transform", { name: "Преобразовать", activation: "action", requireAttunement: true })]
  });

  equipment({
    key: "item:mind-sharpener", folder: F, book: BOOK, page: 9, name: "Усилитель разума", en: "Mind Sharpener",
    img: "icons/equipment/finger/ring-eye-silver-green", equipType: "ring", rarity: "uncommon", attunement: "required",
    uses: uses(4, DAWN("1d4")),
    desc: "*Кольцо, необычное (требуется настройка).*\n\nЭтот предмет имеет 4 заряда. Когда вы проваливаете спасбросок Телосложения для поддержания концентрации, вы можете реакцией потратить 1 заряд предмета, чтобы вместо этого преуспеть. Предмет восстанавливает 1к4 потраченных зарядов ежедневно на рассвете.",
    acts: [utility("item:mind-sharpener:use", { activation: "reaction", condition: "Провален спасбросок концентрации", consume: [useSelf()], requireAttunement: true })]
  });

  // --- Излучающее свет оружие ----------------------------------------------
  const radiantLight = utility("item:radiant-weapon:light", { name: "Свет", activation: "bonus", self: true, duration: "perm", img: "icons/magic/light/explosion-star-glow-yellow" });
  const radiantBlind = save("item:radiant-weapon:blind", {
    name: "Ослепляющая вспышка", activation: "reaction", condition: "Сразу после того, как по вам попали атакой",
    count: 1, affects: "creature", ability: "con", dc: "15", consume: [useSelf()], img: "icons/magic/light/beam-rays-yellow"
  });
  const radiantEnchant = enchantEffect("item:radiant-weapon:enchant", "Излучающее свет оружие",
    enchantChanges("item:radiant-weapon", "{} (излучающее свет)", "rare", "required", "icons/weapons/swords/sword-gold-holy",
      [change("system.uses.max", "4", "override")]), "icons/weapons/swords/sword-gold-holy");
  weaponTemplate({
    key: "item:radiant-weapon", folder: F, book: BOOK, page: 9, name: "Излучающее свет оружие", en: "Radiant Weapon",
    img: "icons/weapons/swords/sword-gold-holy", rarity: "rare", attunement: "required", magicalBonus: 1,
    uses: uses(4, DAWN("1d4")), effects: [radiantEnchant],
    desc: "*Оружие (любое простое или воинское), редкое (требуется настройка заклинателем).*\n\nЭто магическое оружие даёт бонус +1 к броскам атаки и урона, совершённым с его помощью. Пока вы держите его, вы можете бонусным действием заставить его излучать яркий свет в радиусе 30 футов и тусклый свет на дополнительные 30 футов. Вы можете погасить свет бонусным действием.\n\nОружие имеет 4 заряда. Вы можете реакцией сразу после того, как по вам попали атакой, потратить 1 заряд оружия и заставить атакующего совершить спасбросок Телосложения со Сл. 15. При провале атакующий получает состояние <<blinded|ослеплённый>> до конца своего следующего хода. Оружие восстанавливает 1к4 израсходованных зарядов ежедневно на рассвете.\n\n*Чтобы создать конкретное оружие, используйте действие «Зачаровать оружие» и выберите обычное оружие в инвентаре.*",
    acts: [
      enchantActivity("item:radiant-weapon:enchant", radiantEnchant._id, { name: "Зачаровать оружие", riders: [radiantLight._id, radiantBlind._id] }),
      radiantLight, radiantBlind
    ]
  });

  // --- Самозарядный выстрел -------------------------------------------------
  const repeatingEnchant = enchantEffect("item:repeating-shot:enchant", "Самозарядный выстрел",
    enchantChanges("item:repeating-shot", "{} (самозарядное)", "uncommon", "required", "icons/weapons/crossbows/crossbow-loaded-black"),
    "icons/weapons/crossbows/crossbow-loaded-black");
  weaponTemplate({
    key: "item:repeating-shot", folder: F, book: BOOK, page: 9, name: "Самозарядный выстрел", en: "Repeating Shot",
    img: "icons/weapons/crossbows/crossbow-loaded-black", rarity: "uncommon", attunement: "required", magicalBonus: 1,
    effects: [repeatingEnchant],
    desc: "*Оружие (любое простое или воинское со свойством боеприпасы), необычное (требуется настройка).*\n\nЭто магическое оружие даёт бонус +1 к броскам атаки и урона при использовании для дальнобойной атаки, а также игнорирует свойство перезарядка, если оно имеется.\n\nЕсли оружию не хватает боеприпасов, то оно создаёт их само, автоматически производя 1 магический боеприпас, когда владелец совершает дальнобойную атаку с его помощью. Созданный боеприпас исчезает сразу после того, как попадает или промахивается по цели.\n\n*Чтобы создать конкретное оружие, используйте действие «Зачаровать оружие» и выберите обычное оружие со свойством боеприпасы.*",
    acts: [enchantActivity("item:repeating-shot:enchant", repeatingEnchant._id, { name: "Зачаровать оружие", properties: ["amm"] })]
  });

  // --- Возвращающееся оружие -----------------------------------------------
  const returningEnchant = enchantEffect("item:returning-weapon:enchant", "Возвращающееся оружие",
    enchantChanges("item:returning-weapon", "{} (возвращающееся)", "uncommon", "", "icons/weapons/axes/axe-battle-black"),
    "icons/weapons/axes/axe-battle-black");
  weaponTemplate({
    key: "item:returning-weapon", folder: F, book: BOOK, page: 9, name: "Возвращающееся оружие", en: "Returning Weapon",
    img: "icons/weapons/axes/axe-battle-black", rarity: "uncommon", magicalBonus: 1,
    effects: [returningEnchant],
    desc: "*Оружие (любое простое или воинское со свойством метательное), необычное.*\n\nЭто магическое оружие даёт бонус +1 к броскам атаки и урона, совершённым с его помощью, и возвращается в вашу руку сразу после использования для выполнения дальнобойной атаки.\n\n*Чтобы создать конкретное оружие, используйте действие «Зачаровать оружие» и выберите обычное метательное оружие.*",
    acts: [enchantActivity("item:returning-weapon:enchant", returningEnchant._id, { name: "Зачаровать оружие", properties: ["thr"] })]
  });

  // --- Отталкивающий щит ----------------------------------------------------
  equipment({
    key: "item:repulsion-shield", folder: F, book: BOOK, page: 9, name: "Отталкивающий щит", en: "Repulsion Shield",
    img: "icons/equipment/shield/heater-crystal-blue", equipType: "shield", baseItem: "shield", rarity: "uncommon",
    armorValue: 2, magicalBonus: 1, weight: 6, uses: uses(4, DAWN("1d4")),
    desc: "*Доспехи (щит), необычный.*\n\nВы получаете +1 к КД, пока используете этот щит.\n\nЩит имеет 4 заряда. Пока вы держите его, вы можете реакцией сразу после попадания по вам рукопашной атакой потратить 1 заряд щита и оттолкнуть атакующего на расстояние до 15 футов. Щит восстанавливает 1к4 потраченных зарядов ежедневно на рассвете.",
    acts: [utility("item:repulsion-shield:push", { name: "Оттолкнуть", activation: "reaction", condition: "По вам попали рукопашной атакой", count: 1, affects: "creature", consume: [useSelf()] })]
  });

  // --- Закло-заправительное кольцо -----------------------------------------
  equipment({
    key: "item:spell-refueling-ring", folder: F, book: BOOK, page: 9, name: "Закло-заправительное кольцо", en: "Spell-Refueling Ring",
    img: "icons/equipment/finger/ring-cabochon-gold-purple", equipType: "ring", rarity: "uncommon", attunement: "required",
    uses: uses(1, DAWN()),
    desc: "*Кольцо, необычное (требуется настройка заклинателем).*\n\nПока вы носите это кольцо, вы можете восстановить 1 потраченную ячейку заклинаний бонусным действием. Восстановленная ячейка может быть 3 уровня или ниже. После использования кольцо нельзя использовать снова до следующего рассвета.",
    acts: [utility("item:spell-refueling:use", { name: "Восстановить ячейку", activation: "bonus", consume: [useSelf()], requireAttunement: true })]
  });
}

