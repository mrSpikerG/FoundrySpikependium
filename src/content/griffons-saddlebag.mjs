import inventory from "../../tools/data/external-content-inventory.json" with { type: "json" };
import { attack, dmg, effect, change, utility, save, uses, DAWN, useSelf } from "../../tools/lib/core.mjs";
import { equipment, consumable, folder } from "../../tools/lib/docs.mjs";

function item(book, name, key, o) {
  const source = inventory.sources.find(s => s.id === book), entry = source.entries.find(e => e.name.endsWith(`[${name}]`));
  if (!entry) throw Error(`Не найден предмет ${book}/${name}`);
  return (o.consumableType || ["potion", "food"].includes(o.equipType) ? consumable : equipment)({ book, sourceUrl: entry.url, page: "", key: `item:${book.toLowerCase()}:${key}`, identifier: `griffon-${key}`,
    name: entry.name.slice(0, entry.name.lastIndexOf(" [")), en: name,
    folder: folder("items", `${source.title}/${o.category ?? (o.equipType === "ring" ? "Кольца" : o.equipType === "potion" ? "Зелья" : "Чудесные предметы")}`),
    img: "icons/equipment/finger/ring-band-engraved-scrolls-silver", weight: o.equipType === "ring" ? 0.01 : 2,
    price: { common: 100, uncommon: 400, rare: 4000, veryRare: 40000, legendary: 200000 }[o.rarity],
    priceNote: "Цена оценочная: ориентир по редкости из правил 2024 года; в карточке источника цена не указана.",
    weightNote: o.equipType === "ring" ? "Вес оценочный: 0,01 фунта для небольшого кольца; источник не задаёт вес." : "Вес оценочный: 2 фунта; источник не задаёт вес.", ...o });
}
export { item as griffonItem };
export function define() {
  item("GS1", "Ring of Gestures", "gestures", { equipType: "ring", rarity: "common",
    desc: "Надетое кольцо повторяет жест вашей руки своим камнем. Действием Магии можно изменить вид только этого камня с помощью Малой иллюзии: цвет, размер или форму изображённой руки. Другие применения заговора это кольцо не предоставляет.",
    acts: [utility("gs1:gestures", { name: "Малая иллюзия — изменить камень кольца", activation: "action", self: true, spellSlot: false })] });
  item("GS1", "Ring of Roses", "roses", { equipType: "ring", rarity: "common",
    desc: "Действием Магии создайте в своей руке одну розу выбранного цвета: стебель длиной 1 фут, тупые шипы, запах отсутствует. Через 24 часа цветок исчезает. Отмечайте созданные розы и срок их исчезновения; модуль пока не создаёт и не удаляет предметы-розы в инвентаре.",
    acts: [utility("gs1:roses", { name: "Создать розу", activation: "action", self: true, spellSlot: false })] });
  item("GS1", "Starmetal Ring", "starmetal", { equipType: "ring", rarity: "rare",
    desc: "За 1 час прикосновения привяжите один объект массой до 25 фунтов, хотя бы наполовину состоящий из металла; новая связь заменяет предыдущую. Нося кольцо, в свой ход бонусным действием притяните этот объект на расстояние до 20 футов, если он находится в пределах 40 футов и не за полным укрытием. Объект обходит препятствия без вреда. В своём пространстве поймайте его свободной рукой или положите у ног. Связь, положение объекта и перемещение пока отслеживает Мастер.",
    acts: [utility("gs1:starmetal:bind", { name: "Связать металлический объект", activation: "hour", touch: true, spellSlot: false }),
      utility("gs1:starmetal:pull", { name: "Притянуть связанный объект на 20 футов", activation: "bonus", range: 40, spellSlot: false })] });
  const fire = effect("gs1:volcanic:resistance", { name: "Вулканические сапоги: сопротивление огню", changes: [change("system.traits.dr.value", "fire")] });
  item("GS1", "Volcanic Boots", "volcanic-boots", { equipType: "clothing", rarity: "rare", attunement: "required",
    img: "icons/equipment/feet/boots-leather-banded-furred", uses: uses(10, DAWN("1d6+4")), effects: [fire],
    desc: "Надетые и настроенные сапоги дают сопротивление огню. После прохода минимум 5 футов по твёрдой земле потратьте заряды: за каждый выберите одно свободное пространство, которое только что прошли. Там возникает горячий куб со стороной 5 футов на 1 минуту. Существо, кроме вас, при входе или начале хода в кубе совершает спасбросок Ловкости Сл 15: провал наносит 2к6 урона огнём; успех не наносит урон. Бессознательность владельца прекращает кубы; можно закончить их бонусным действием. Из 10 зарядов на рассвете восстанавливается 1к6 + 4. Расход зарядов и сопротивление настроены штатно; выбор пройденных клеток, области и события движения пока подтверждает Мастер.",
    acts: [...Array.from({ length: 10 }, (_, i) => utility(`gs1:volcanic:create:${i + 1}`, { name: `Создать кубы — ${i + 1} заряд${i === 0 ? "" : "ов"}`, activation: "special", spellSlot: false, requireAttunement: true, consume: [useSelf(i + 1)] })),
      save("gs1:volcanic:damage", { name: "Жар куба — спасбросок", activation: "special", ability: "dex", dc: 15, affects: "creature", damage: [dmg("2d6", "fire")], onSave: "none", spellSlot: false, requireAttunement: true }),
      utility("gs1:volcanic:end", { name: "Погасить все кубы", activation: "bonus", spellSlot: false, requireAttunement: true })] });
  item("GS2", "Brawler's Ring", "brawler", { equipType: "ring", rarity: "uncommon", proficient: 1,
    desc: "Нося кольцо, при попадании безоружным ударом нанесите 1к4 + модификатор Силы дробящего урона. На листе есть отдельная штатная атака с этим уроном. Для другого способа безоружного удара используйте его обычное действие; эта запись не увеличивает урон Захвата или Толчка и пока не меняет остальные кнопки безоружного удара.",
    acts: [attack("gs2:brawler:punch", { name: "Безоружный удар кольцом", activation: "action", ability: "str", range: 5, count: 1, affects: "creature", includeBase: false, damage: [dmg("1d4+@mod", "bludgeoning")], spellSlot: false })] });
  const plates = [1, 2, 3].map(n => effect(`gs2:mageplate:${n}`, { name: `Призрачный доспех: базовый КД ${15 + n}`, transfer: false, seconds: 60,
    changes: [change("system.attributes.ac.formulas", String(15 + n), "add")], flags: { spikependium: { griffonMageplate: true } } }));
  item("GS2", "Mageplate Ring", "mageplate", { equipType: "ring", rarity: "rare", attunement: "required", uses: uses(3, DAWN()), effects: plates,
    desc: "Кольцо имеет 3 заряда, восстанавливаемых на рассвете. Бонусным действием потратьте 1, 2 или 3 заряда: базовый КД станет 16, 17 или 18 соответственно на 1 минуту, без добавления Ловкости. Призрачные доспехи дают яркий свет на 20 футов и тусклый ещё на 20 футов. Выбранный профиль включается штатной формой; при пересечении сроков профили не складывают КД; сопротивления и другие бонусы не отключаются. Система использует лучшую доступную формулу КД и учитывает щит. Свет токена пока настраивается вручную; отмена расхода возвращает заряды, но уже применённую форму проверьте отдельно.",
    acts: [1, 2, 3].map(n => utility(`gs2:mageplate:${n}`, { name: `Призрачный доспех: КД ${15 + n}, ${n} заряд${n === 1 ? "" : "а"}`, activation: "bonus", self: true,
      duration: "minute", durationValue: 1, effects: [plates[n - 1]._id], spellSlot: false, requireAttunement: true, consume: [useSelf(n)] })) });
  const half = effect("gs2:buoyancy:half", { name: "Амулет плавучести: половина скорости", transfer: false, expiry: "targetEnd", changes: [change("system.attributes.movement.multiplier", 0.5, "multiply")], flags: { spikependium: { griffonBuoyancy: true } } });
  item("GS2", "Amulet of Buoyancy", "buoyancy", { equipType: "clothing", rarity: "uncommon", weight: 1,
    weightNote: "Вес по обычному амулету 2024 года: 1 фунт.", img: "icons/equipment/neck/amulet-carved-stone-purple", effects: [half],
    desc: "Когда вы получаете состояние Сбитый с ног, можно реакцией немедленно встать; после этого ваша скорость уменьшается вдвое до конца следующего хода. Если в начале своего хода вы под водой с 0 хитов, сразу поднимитесь на 60 футов к поверхности. Реакция и временный штраф скорости настроены штатно. Состояние Сбитый с ног снимается автоматически после успешного применения; момент его получения подтверждает игрок; подъём при 0 хитов также разрешается вручную, поскольку сцена не задаёт универсальную поверхность воды.",
    acts: [utility("gs2:buoyancy:stand", { name: "Встать при падении", activation: "reaction", self: true, effects: [half._id], spellSlot: false, condition: "Только в момент получения состояния Сбитый с ног" })] });
}
