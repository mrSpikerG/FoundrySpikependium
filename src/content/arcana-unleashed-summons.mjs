import { attack, damage, dmg, effect, summon, utility } from "../../tools/lib/core.mjs";
import { folder, npc, ref, spell } from "../../tools/lib/docs.mjs";

const command = "Дух дружелюбен вам и вашим союзникам. В бою он получает вашу инициативу, но ходит сразу после вас. Он подчиняется устным командам без расхода действия; без команды совершает Уклонение и перемещается, избегая опасностей. Дух исчезает при 0 хитах или окончании заклинания.";
const multi = (key, weapons) => {
  const activity = utility(`${key}:multiattack`, { name: "Мультиатака", activation: "action", spellSlot: false });
  activity.flags = { spikependium: { multiattack: { count: "spell", weapons } } };
  return { name: "Мультиатака", desc: "Дух совершает количество атак, равное половине уровня заклинания, округлённой вниз. Кнопка последовательно предлагает способ атаки и обычные броски.", acts: [activity] };
};
const strike = (key, name, formula, type, reach, extras = {}) => ({ name,
  system: { identifier: key }, desc: `Бонус рукопашной атаки равен модификатору атаки заклинанием призывателя, досягаемость ${reach} футов. Попадание: ${formula} + уровень заклинания урона.`,
  acts: [attack(`${key}:attack`, { name, activation: "action", attackType: "melee", classification: "spell", range: reach,
    includeBase: false, damage: [dmg(formula, type)], spellSlot: false })], ...extras });

export function define() {
  const spirits = folder("creatures", "Призываемые заклинаниями/Неудержимая магия");
  const dino = ["ankylosaurus", "triceratops", "tyrannosaurus"], plants = ["fungus", "tree", "vine"];
  const labels = { ankylosaurus: "Анкилозавр", triceratops: "Трицератопс", tyrannosaurus: "Тираннозавр", fungus: "Гриб", tree: "Дерево", vine: "Лоза" };
  const icons = { dinosaur: "icons/creatures/reptiles/lizard-mouth-glowing-red", plant: "icons/magic/nature/root-vines-grow-brown" };
  for (const [kind, level, variants, cost, material, classes] of [
    ["dinosaur", 6, dino, 600, "отполированная чешуя стоимостью не менее 600 зм", "друид"],
    ["plant", 5, plants, 500, "травы стоимостью не менее 500 зм", "друид, следопыт"]
  ]) {
    const name = kind === "dinosaur" ? "Вызов динозавра" : "Вызов растения", key = `spell:au-summon-${kind}`;
    spell({ key, name, identifier: `summon-${kind}`, book: "AU", page: 38,
      folder: folder("spells", `${level} уровень`, { sort: (level + 1) * 1000 }), img: icons[kind], level, school: "con",
      range: 90, components: "ВСМ", materials: material, cost, duration: "hour", durationValue: 1, concentration: true,
      desc: `*Списки: ${classes}.*\n\nВы призываете дух ${kind === "dinosaur" ? "первобытного динозавра" : "оживлённого растения"} в незанятое пространство, которое вы видите в пределах дистанции. Выберите один из обликов: ${variants.map(v => labels[v]).join(", ")}. Он использует соответствующий статблок духа.\n\n${command}\n\n**Использование ячейки большего уровня.** Уровень ячейки используется как уровень заклинания в статблоке.\n\n**Foundry.** Выбор облика и размещение используют штатное окно призыва. КД, хиты, Бонус мастерства и атаки подставляются автоматически. Условия видимости и свободное пространство подтверждает Мастер.`,
      acts: [summon(`${key}:summon`, variants.map(v => ({ uuid: ref(`actor:au-${kind}-${v}`), name: labels[v] })), {
        name: "Призвать духа", activation: "action", range: 90, concentration: true, duration: "hour", durationValue: 1,
        ac: "@item.level", hp: `10 * (@item.level - ${level})`, attackDamage: "@item.level", sizes: [kind === "dinosaur" ? "huge" : "lg"],
        types: [kind === "dinosaur" ? "beast" : "plant"]
      })] });
  }

  for (const variant of plants) {
    const key = `actor:au-plant-${variant}`, weapons = variant === "fungus" ? ["au-spores"] : ["au-plant-slam"];
    const items = [multi(key, weapons)];
    if (variant === "fungus") {
      const poison = effect("au-spores:poison", { name: "Распыление спор: Отравленный", transfer: false, statuses: ["poisoned"], expiry: "targetEnd" });
      items.push({ name: "Распыление спор", system: { identifier: "au-spores" }, effects: [poison],
        desc: "Бонус рукопашной или дальнобойной атаки равен модификатору атаки заклинанием призывателя. Досягаемость 5 футов или дистанция 30 футов. Попадание: 1к4 + уровень заклинания урона ядом, цель Отравлена до конца своего следующего хода. Если цель уже была Отравленной, вместо нового состояния она получает дополнительно 3к4 урона ядом.",
        acts: ["melee", "ranged"].map(mode => attack(`au-spores:${mode}`, { name: mode === "melee" ? "Рукопашная" : "Дальнобойная", activation: "action",
          attackType: mode, classification: "spell", range: mode === "melee" ? 5 : 30, includeBase: false, spellSlot: false, damage: [dmg("1d4", "poison")], effects: [poison._id] })) });
      items.push({ name: "Споры: уже отравленная цель", desc: "Дополнительные 3к4 урона ядом при попадании, если цель была Отравленной до этой атаки. Этот урон заменяет новое наложение состояния.",
        acts: [damage("au-spores:extra", { name: "Дополнительный урон", activation: "special", spellSlot: false, damage: [dmg("3d4", "poison")], critical: true })] });
    } else items.push(strike("au-plant-slam", "Размашистый удар", "1d10 + 3", "bludgeoning", 5));
    if (variant === "tree") items.push({ name: "Осадное чудовище", desc: "Дух наносит двойной урон объектам и сооружениям." });
    if (variant === "vine") {
      const disengage = effect("au-vine:disengage", { name: "Отход: защита от провоцированных атак", transfer: false,
        flags: { spikependium: { disengageTemplate: true } }, description: "Перемещение не провоцирует атаки до конца текущего хода." });
      const action = utility("au-vine:disengage", { name: "Отход", activation: "bonus", self: true, spellSlot: false, effects: [disengage._id] });
      action.flags = { spikependium: { cunningDisengage: true } };
      items.push({ name: "Изворотливость", effects: [disengage], desc: "Дух может совершить Рывок или Отход бонусным действием. В бою все его бонусные действия используют общий предел одного применения в собственный ход; расход можно отменить через карточку. Отход автоматически защищает от провоцированных атак до конца текущего хода. В окне атаки против духа укажите её тип; отмена расхода убирает защиту. Вне боя эффект заканчивается при продвижении времени. Дополнительное перемещение от Рывка пока разрешает Мастер.",
        acts: [utility("au-vine:dash", { name: "Рывок", activation: "bonus", spellSlot: false }), action] });
    }
    npc({ key, name: `Дух растения (${labels[variant]})`, book: "AU", page: 38, folder: spirits, img: icons.plant,
      creatureType: "plant", cr: null, size: "lg", tokenSize: 2, ac: 11 + (variant === "tree" ? 2 : 0), hp: 50,
      movement: { walk: 40, ...(variant === "vine" ? { climb: 40 } : {}) },
      abilities: { str: 17, dex: 13, con: 14, int: 10, wis: 13, cha: 10 }, dv: [variant === "tree" ? "fire" : "slashing"],
      languagesCustom: "Понимает известные призывателю языки", items,
      bio: `<p>КД: ${variant === "tree" ? 13 : 11} + уровень заклинания. Хиты: 50 + 10 за каждый уровень заклинания выше пятого. Пассивное Восприятие 11. Бонус мастерства равен бонусу призывателя.</p><p>${command}</p>` });
  }
  for (const variant of dino) {
    const key = `actor:au-dinosaur-${variant}`, weapons = ["au-dinosaur-slam"];
    const items = [strike("au-dinosaur-slam", "Размашистый удар", "1d10 + 5", "bludgeoning", 10),
      { name: "Крепкий", desc: "Добавьте половину уровня заклинания, округлённую вниз, к спасброскам Силы и Телосложения. Бонус подставляется при призыве." }];
    if (variant === "ankylosaurus") items.push({ name: "Осадное чудовище", desc: "Дух наносит двойной урон объектам и сооружениям." });
    if (variant === "tyrannosaurus") {
      weapons.push("au-dinosaur-bite");
      const grasp = effect("au-dinosaur:bite:grasp", { name: "Укус: захват и опутывание", transfer: false, statuses: ["grappled", "restrained"] });
      items.push(strike("au-dinosaur-bite", "Укус", "2d10 + 5", "piercing", 10, {
        desc: "Бонус атаки равен модификатору атаки заклинанием призывателя, досягаемость 10 футов. Попадание: 2к10 + 5 + уровень заклинания колющего урона. Большая и меньше цель становится Схваченной; Сл высвобождения равна Сл заклинаний призывателя. Пока длится захват, цель также Опутана. Состояние применяется к допустимой цели после попадания и снимается вместе при прекращении захвата.",
        effects: [grasp], acts: [attack("au-dinosaur-bite:attack", { name: "Укус", activation: "action", range: 10, attackType: "melee", classification: "spell",
          includeBase: false, spellSlot: false, damage: [dmg("2d10 + 5", "piercing")], effects: [grasp._id] })] }));
    }
    if (variant === "triceratops") {
      weapons.push("au-dinosaur-gore");
      const prone = effect("au-dinosaur:gore:prone", { name: "Бодание с разбега: Сбитый с ног", transfer: false, statuses: ["prone"] });
      items.push(strike("au-dinosaur-gore", "Бодание", "1d10 + 5", "piercing", 5, {
        flags: { spikependium: { dive: { feet: 20, formula: "1d10", maxSize: "huge", label: "Бодание: 20 футов по прямой перед попаданием в Огромную или меньшую цель" } } }, effects: [prone],
        desc: "Бонус атаки равен модификатору атаки заклинанием призывателя, досягаемость 5 футов. Попадание: 1к10 + 5 + уровень заклинания колющего урона. Если цель Огромная или меньше и дух переместился минимум на 20 футов по прямой к цели непосредственно перед попаданием, добавляется 1к10 колющего урона, и цель Сбита с ног. Условие разбега подтверждается в обычном окне урона; состояние применяется только при выполнении этого условия.",
        acts: [attack("au-dinosaur-gore:attack", { name: "Бодание", activation: "action", range: 5, attackType: "melee", classification: "spell", includeBase: false, spellSlot: false, damage: [dmg("1d10 + 5", "piercing")] }),
          utility("au-dinosaur-gore:prone", { name: "Сбить с ног после разбега", activation: "special", spellSlot: false, range: 5, count: 1, affects: "creature", effects: [prone._id] })] }));
    }
    items.unshift(multi(key, weapons));
    npc({ key, name: `Дух динозавра (${labels[variant]})`, book: "AU", page: 38, folder: spirits, img: icons.dinosaur,
      creatureType: "beast", creatureSubtype: "Динозавр", cr: null, size: "huge", tokenSize: 3, ac: variant === "ankylosaurus" ? 13 : 11, hp: 60, movement: { walk: 40 },
      abilities: { str: 21, dex: 11, con: 15, int: 4, wis: 12, cha: 9 }, languagesCustom: "Понимает известные призывателю языки", items,
      bio: `<p>КД: ${variant === "ankylosaurus" ? 13 : 11} + уровень заклинания. Хиты: 60 + 10 за каждый уровень заклинания выше шестого. Пассивное Восприятие 11. Бонус мастерства равен бонусу призывателя.</p><p>${command}</p>` });
  }
}
