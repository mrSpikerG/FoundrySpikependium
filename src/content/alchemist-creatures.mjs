import { npc, consumable, folder, ref, md } from "../../tools/lib/docs.mjs";
import { summon, attack, save, damage, heal, utility, dmg, effect, useSelf } from "../../tools/lib/core.mjs";
import { ALCHEMIST_URL } from "./alchemist-formulas.mjs";

export const ALCHEMIST_CREATURES = [
  { id: "homunculus", name: "Гомункул алхимика", url: "https://dnd.su/bestiary/202-homunculus/", book: "MM14", size: "tiny", creatureType: "construct", ac: 13, hp: 5, hpFormula: "2d4", cr: 0, movement: { walk: 20, fly: 40 }, abilities: { str: 4, dex: 15, con: 11, int: 10, wis: 10, cha: 7 }, senses: { darkvision: 60 }, di: ["poison"], ci: ["charmed", "poisoned"] },
  { id: "golem", name: "Алхимический голем", url: "https://anyflip.com/rfmta/yxdx/basic/", book: "VSS", size: "med", creatureType: "construct", ac: 13, hp: 76, hpFormula: "9d8 + 36", cr: 5, movement: { walk: 30 }, abilities: { str: 17, dex: 9, con: 18, int: 6, wis: 10, cha: 5 }, senses: { darkvision: 60 }, di: ["lightning"], dr: ["bludgeoning", "piercing", "slashing"], ci: ["charmed", "exhaustion", "frightened", "paralyzed", "petrified", "poisoned"] },
  { id: "gray-ooze", name: "Серая слизь", url: "https://dnd.su/bestiary/257-gray-ooze/", book: "MM14", size: "med", ac: 8, hp: 22, hpFormula: "3d8 + 9", cr: 0.5, movement: { walk: 10, climb: 10 }, abilities: { str: 12, dex: 6, con: 16, int: 1, wis: 6, cha: 2 }, dr: ["acid", "fire", "cold"], skills: { ste: 2 } },
  { id: "ochre-jelly", name: "Золотистый студень", url: "https://dnd.su/bestiary/8-ochre-jelly/", book: "MM14", size: "lg", ac: 8, hp: 45, hpFormula: "6d10 + 12", cr: 2, movement: { walk: 10, climb: 10 }, abilities: { str: 15, dex: 6, con: 14, int: 2, wis: 6, cha: 1 }, dr: ["acid"], di: ["lightning", "slashing"] },
  { id: "gelatinous-cube", name: "Студенистый куб", url: "https://dnd.su/bestiary/256-gelatinous-cube/", book: "MM14", size: "lg", ac: 6, hp: 84, hpFormula: "8d10 + 40", cr: 2, movement: { walk: 15 }, abilities: { str: 14, dex: 3, con: 20, int: 1, wis: 6, cha: 1 } },
  { id: "black-pudding", name: "Чёрная слизь", url: "https://dnd.su/bestiary/255-black-pudding/", book: "MM14", size: "lg", ac: 7, hp: 85, hpFormula: "10d10 + 30", cr: 4, movement: { walk: 20, climb: 20 }, abilities: { str: 16, dex: 5, con: 16, int: 1, wis: 6, cha: 1 }, di: ["acid", "cold", "lightning", "slashing"] }
];
export const ALCHEMIST_VESSELS = [
  { id: "bottled-ooze", name: "Бутыль со слизью", creature: "gray-ooze", cost: 2, weight: 0.5 },
  { id: "ooze-jug-ochre", name: "Кувшин слизи — золотистый студень", creature: "ochre-jelly", cost: 4, weight: 4, jug: true },
  { id: "ooze-jug-cube", name: "Кувшин слизи — студенистый куб", creature: "gelatinous-cube", cost: 8, weight: 4, jug: true },
  { id: "ooze-jug-black", name: "Кувшин слизи — чёрная слизь", creature: "black-pudding", cost: 10, weight: 4, jug: true }
];
export function alchemistCompanionSummon(key, id, options = {}) {
  const row = ALCHEMIST_CREATURES.find(c => c.id === id);
  const activity = summon(key, [{ uuid: ref(`actor:alchemist-${id}`), name: row.name }], {
    name: `Создать: ${row.name}`, types: [row.creatureType ?? "ooze"], sizes: [row.size],
    matchAttacks: false, matchSaves: false, matchProficiency: false, spellSlot: false, ...options
  });
  activity.flags = { spikependium: { alchemistCompanion: id } }; return activity;
}
export function alchemistVesselRecipe(activity, id) {
  const row = ALCHEMIST_VESSELS.find(v => v.id === id);
  activity.flags = { ...activity.flags, spikependium: { ...activity.flags?.spikependium,
    alchemistRecipe: { uuid: ref(`item:alchemist-${id}`), cost: row.cost, jug: !!row.jug } } }; return activity;
}
const ICON = "icons/consumables/potions/bottle-bulb-corked-green";
const trait = (name, desc) => ({ name, desc });
function natural(key, name, formula, type, ability = "str", extra = []) {
  return { name, system: { identifier: key },
    desc: "Атака и урон соответствуют блоку 2014 года; дополнительные последствия применяются после подтверждённого попадания.",
    acts: [attack(key, { name, activation: "action", ability, range: 5, count: 1, affects: "creature", classification: "weapon", includeBase: false, spellSlot: false, damage: [dmg(formula, type), ...extra] })] };
}
export function define() {
  for (const row of ALCHEMIST_CREATURES) {
    const key = `actor:alchemist-${row.id}`, ooze = !row.creatureType, items = [];
    if (ooze) {
      if (row.id !== "gelatinous-cube") items.push(trait("Аморфный", "Проходит через щели шириной 1 дюйм без протискивания; геометрию и доступность прохода проверяет Мастер."));
      if (["ochre-jelly", "black-pudding"].includes(row.id)) items.push(trait("Паучье лазание", "Лазает по сложным поверхностям и потолку без проверки; маршрут по стене/потолку выбирайте вручную."));
      if (row.id === "gray-ooze") {
        items.push(trait("Обманчивая внешность", "Неподвижная слизь выглядит лужей или мокрым камнем; обнаружение разрешает Мастер."),
          trait("Разъедание металла", "Попавшее немагическое металлическое оружие получает накопительный −1 к урону и разрушается при −5. Попавшие немагические металлические/деревянные боеприпасы разрушаются. За раунд растворяет 2 дюйма немагического металла. Изменения инвентаря подтверждайте вручную."));
        items.push(natural(`${key}:pseudopod`, "Ложноножка", "1d6 + @mod", "bludgeoning", "str", [dmg("2d6", "acid")]));
      } else if (row.id === "ochre-jelly") items.push(natural(`${key}:pseudopod`, "Ложноножка", "2d6 + @mod", "bludgeoning", "str", [dmg("1d6", "acid")]));
      else if (row.id === "black-pudding") {
        items.push(natural(`${key}:pseudopod`, "Ложноножка", "1d6 + @mod", "bludgeoning", "str", [dmg("4d8", "acid")]),
          { name: "Едкое тело", desc: "При касании или ближнем попадании с 5 футов атакующий получает 1к8 кислоты. Попавшее немагическое металлическое/деревянное оружие получает накопительный −1 к урону (разрушено при −5), такие боеприпасы разрушаются; за раунд растворяет 2 дюйма немагического металла/дерева. Кнопку урона используйте после проверки условия; порчу предметов подтвердите вручную.", acts: [damage(`${key}:corrosive`, { name: "Урон коснувшемуся существу", activation: "special", damage: [dmg("1d8", "acid")], spellSlot: false })] });
      }
      if (["gray-ooze", "black-pudding"].includes(row.id)) items.push(trait("Разъедание доспеха при попадании", "Ложноножка снижает КБ носимого немагического доспеха на 1 (у серой слизи — только металлического). При уменьшении даваемой КБ до 10 доспех разрушается. После попадания измените предмет вручную."));
      if (["ochre-jelly", "black-pudding"].includes(row.id)) items.push({ name: "Разделение", desc: "Реакция на электрический/рубящий урон при размере не меньше Среднего и минимум 10 хитах: вместо исходного существа появляются два на размер меньше, с половиной его текущих хитов вниз. Кнопка учитывает реакцию; токены, их хиты, размер и принадлежность к исходному выпуску пока меняйте вручную.", acts: [utility(`${key}:split`, { name: "Разделиться (токены вручную)", activation: "reaction", spellSlot: false })] });
      if (row.id === "gelatinous-cube") {
        const restrained = effect(`${key}:engulf`, { name: "Поглощён кубом", transfer: false, statuses: ["restrained"], description: "Нельзя дышать; полное укрытие; переносится вместе с кубом. Удалите после освобождения." });
        items.push(natural(`${key}:pseudopod`, "Ложноножка", "3d6", "acid"),
          trait("Куб слизи", "Занимает всё пространство. Вошедший в него подвергается Поглощению с помехой испытанию. Внутри помещается одно Большое либо до четырёх существ не больше Среднего; они видны, но имеют полное укрытие. Перемещение, вместимость и укрытие пока проверяйте вручную."),
          trait("Прозрачный", "Если куб не движется и не атакует, для обнаружения нужна Мудрость (Восприятие) СЛ 15; вошедший, не зная о нём, захвачен врасплох."),
          { name: "Поглощение", desc: "Куб перемещается до своей скорости через существ не больше Большого. Ловкость СЛ 12; успех — можно отойти на 5 футов, иначе последствия провала. Провал — 3к6 кислоты, Опутан и не может дышать; в начале хода куба 6к6 кислоты. Перенос цели вместе с кубом и дыхание пока ручные; успех с отказом от отхода разрешите вручную.", effects: [restrained], acts: [save(`${key}:engulf`, { name: "Войти в пространство цели", activation: "action", ability: "dex", dc: 12, onSave: "none", count: 1, affects: "creature", effects: [restrained._id], damage: [dmg("3d6", "acid")], spellSlot: false }), damage(`${key}:digest`, { name: "Начало хода: урон поглощённому", activation: "special", damage: [dmg("6d6", "acid")], spellSlot: false })] },
          { name: "Освобождение из куба", desc: "Поглощённый действием проходит Силу СЛ 12; успех — выходит в пределах 5 футов. Союзник в 5 футах действием проходит ту же проверку, чтобы вытащить существо/предмет, и в любом случае получает 3к6 кислоты. Проверку бросает освобождающийся либо спасатель; снимите эффект и переместите цель вручную.", acts: [damage(`${key}:rescue`, { name: "Кислота спасателю", activation: "special", damage: [dmg("3d6", "acid")], spellSlot: false })] });
      }
    } else if (row.id === "homunculus") {
      const poisoned = effect(`${key}:poison`, { name: "Укус гомункула: отравлен", transfer: false, seconds: 60, statuses: ["poisoned"] });
      const unconscious = effect(`${key}:sleep`, { name: "Укус: тяжёлое отравление", transfer: false, statuses: ["poisoned", "unconscious"], description: "Длительность 1к10 минут: бросьте и задайте вручную; бессознательность длится, пока отравлен этим укусом." });
      items.push(natural(`${key}:bite`, "Укус", "1", "piercing", "dex"),
        { name: "Яд укуса", desc: "Только после попадания Укусом: Телосложение СЛ 10, провал — Отравлен на минуту. Провал минимум на 5 — вместо этого Отравлен и Без сознания на 1к10 минут. Степень провала проверьте, затем примените ровно один профиль; время тяжёлого отравления задайте вручную.", effects: [poisoned, unconscious], acts: [save(`${key}:poison`, { name: "После укуса: обычный яд", activation: "special", ability: "con", dc: 10, effects: [poisoned._id], spellSlot: false }), utility(`${key}:sleep`, { name: "Провал на 5+: 1к10 минут", activation: "special", roll: "1d10", effects: [unconscious._id], spellSlot: false })] },
        trait("Связь фамильяра алхимика", "Передаёт ощущения и мысли на любом расстоянии в пределах одного плана; понимает языки создателя, не говорит. Может атаковать; не меняет форму и не отпускается. После смерти тело сохраняется; оживление занимает 1 час и может проходить во время отдыха. Условия Поиска фамильяра, передача касаний и действия через чувства пока разрешаются вручную."));
    } else {
      const slam = natural("alchemist-golem-slam", "Размашистый удар", "2d8 + @mod", "bludgeoning"); slam.system.properties = ["mgc"]; items.push(slam);
      const multi = utility(`${key}:multi`, { name: "Две ближние атаки", activation: "action", spellSlot: false }); multi.flags = { spikependium: { multiattack: { weapons: ["alchemist-golem-slam"], count: 2 } } };
      items.push({ name: "Мультиатака", desc: "Две ближние атаки оружием. Кнопка проводит два отдельных броска Размашистым ударом; для комбинации с трансплантатом выберите и выполните атаки вручную.", acts: [multi] },
        { name: "Устойчивость к магии", flags: { spikependium: { magicResistance: true } }, desc: "Преимущество испытаний от заклинаний и магических эффектов. Обработчик распознаёт связанную карточку заклинания или предмета со свойством Магический; прочие магические источники подтвердите вручную." },
        trait("Неизменяемая форма", "Невосприимчив к заклинаниям и эффектам, меняющим форму; такие эффекты не применяйте."),
        { name: "Боязнь огня", desc: "Получив урон огнём, получает помеху атакам и проверкам до конца своего следующего хода. Наложение и снятие помехи пока ручные." },
        { name: "Поглощение электричества", desc: "Электричество не наносит урон, а восстанавливает половину исходного урона вниз. Иммунитет настроен; лечение выполните отдельной кнопкой, введя половину исходного урона вручную.", acts: [heal(`${key}:absorb`, { name: "Исцелить на половину электричества (значение вручную)", activation: "special", self: true, formula: "0", spellSlot: false })] },
        trait("Чудовищные трансплантаты", "Атаки голема магические. Трансплантаты: +6 к попаданию, вдвое больше костей урона и +5 к урону. Не более трёх, по одному на часть тела. Предел и части тела проверяются; усиленные атаки трансплантатов пока настройте вручную. Голем также может использовать Интеллект + бонус владения создателя для атак; этот вариант выбирается вручную."),
        { name: "Восстановление голема", desc: "После короткого/долгого отдыха создатель полностью восстанавливает хиты голема и оживляет его; момент отдыха и удаление состояния смерти подтвердите вручную.", acts: [heal(`${key}:restore`, { name: "После отдыха: полное восстановление", activation: "special", self: true, formula: "@attributes.hp.max", spellSlot: false })] });
    }
    const doc = npc({ ...row, key, sourceUrl: row.url, page: "", folder: folder("creatures", `Алхимик (Valda)/${ooze ? "Слизь" : "Спутники"}`), img: ooze ? "icons/creatures/slimes/slime-face-hollow-green" : "icons/creatures/magical/construct-golem-stone-blue",
      creatureType: row.creatureType ?? "ooze", senses: row.senses ?? { blindsight: 60, special: "Слеп за пределами слепого зрения" },
      ci: row.ci ?? ["blinded", "charmed", "deafened", "exhaustion", "frightened", "prone"], alignment: ooze ? "Без мировоззрения" : "Нейтральный",
      languagesCustom: ooze ? "" : "понимает языки создателя, но не говорит", tokenSize: row.size === "lg" ? 2 : 1,
      bio: md(`Профиль правил 2014. Источник блока: <a href="${row.url}">${row.name}</a>. Связанные умения: <a href="${ALCHEMIST_URL}">Алхимик</a>. ${row.id === "golem" ? "Блок сверен по Valda’s Spire of Secrets, печатная страница 43; русская карточка голема требует входа. Поглощение электричества лечит половину урона, по этому блоку." : ""}\n\n${ooze ? "Бутыль/кувшин создают дружелюбную слизь на час. Вне выпуска из сосуда обычная библиотечная слизь не получает владельца или срока жизни. Поведение ближайшей цели, порча предметов, разделение и совместное перемещение вручную." : "Материалы, прохождение времени, команды и восстановление тела проверяет Мастер."}`), items });
    if (row.id === "golem") { doc.system.traits.dr.bypasses = ["mgc", "ada"]; doc.system.skills = { prc: { value: 1 } }; }
  }
  for (const row of ALCHEMIST_VESSELS) {
    const key = `item:alchemist-${row.id}`, doc = consumable({ key, identifier: `alchemist-${row.id}`, name: row.name, book: "VSS", page: "", sourceUrl: row.jug ? ALCHEMIST_URL : "https://dnd.su/homebrew/items/4653-butyl-so-sliziu/", img: ICON,
      folder: folder("items", "Алхимик (Valda)/Сосуды со слизью"), rarity: "rare", price: row.jug ? 4000 : 2000, weight: row.weight,
      priceNote: row.jug ? "Цена оценочная: 4000 зм для многоразового редкого предмета по правилам 2024 года. Редкость кувшина взята по бутыли; источник не задаёт отдельной цены."
        : "Цена оценочная: 2000 зм — половина стоимости редкого предмета (4000 зм), как для расходника по правилам 2024 года.",
      weightNote: `Вес оценочный: ${row.weight} фунта по обычному ${row.jug ? "глиняному кувшину" : "флакону зелья"}; вес в источнике не указан.`,
      desc: `Действием бросьте сосуд до 20 футов, выпуская ${ALCHEMIST_CREATURES.find(c => c.id === row.creature).name}. Слизь дружелюбна вам и союзникам, нападает на ближайшее допустимое существо, а без него движется к вам; через час становится неживой. Цель и маршрут выбирает Мастер. Призыв создаёт один профиль без замены атак, испытаний и бонуса владения на показатели бросающего.\n\n${row.jug ? "Кувшин вмещает одну Большую слизь; у алхимика может быть только один такой сосуд. После выпуска остаётся пустым с потраченным применением; приготовление пополняет тот же предмет. Передачу и потерю сосуда учитывайте вручную." : "Бутыль расходуется штатной механикой dnd5e; новую можно приготовить за 2 кости реагентов."}\n\nВыпуск требует оплаты и карточки в чате; повторное размещение того же выпуска блокируется. Применяется часовой срок жизни. Слизневый наездник у создавшего слизь алхимика даёт скорость ходьбы не ниже 30 футов и его бонус владения к урону/инициативе. Езду и защиту от непосредственного контакта проверяйте вручную.`,
      acts: [alchemistCompanionSummon(`${key}:release`, row.creature, { name: "Разбить сосуд и выпустить слизь", activation: "action", range: 20, duration: "hour", durationValue: 1, consume: [useSelf()] })] });
    doc.flags.spikependium.alchemistVessel = { jug: !!row.jug, creature: row.creature };
    if (row.jug) doc.system.uses.autoDestroy = false;
  }
}
