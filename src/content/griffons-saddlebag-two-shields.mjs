import bases from "../../tools/data/griffon-two-shield-bases.json" with { type: "json" };
import inventory from "../../tools/data/external-content-inventory.json" with { type: "json" };
import { griffonItem } from "./griffons-saddlebag.mjs";
import { folder, npc, ref, md } from "../../tools/lib/docs.mjs";
import { utility, save, damage, cast, form, dmg, effect, change, uses, useSelf, useActivity, DAWN, srdSpellUuid } from "../../tools/lib/core.mjs";

export const GRIFFON_TWO_SHIELDS = [
  ["Forgework Dragon Shield", "forge-dragon", "rare", false], ["Bramble Buckler", "bramble", "uncommon", true],
  ["Arborguard Shield", "arborguard", "veryRare", true], ["Skyglider Shield", "skyglider", "rare", true],
  ["Storm’s Eye Shield", "storm-eye", "rare", true], ["Bane Shield", "bane-shield", "uncommon", true],
  ["Pisces Shield", "pisces", "uncommon", false], ["Sir Varion’s Shield", "varion", "uncommon", true],
  ["Monster Tamer’s Shield", "monster-tamer", "rare", true], ["Feywatch Shield", "feywatch", "uncommon", false],
  ["Shield of the Justicars", "justicars", "rare", false], ["Spiritwalker Breastplate", "spiritwalker", "rare", true]
];
const tag = (activity, flags) => Object.assign(activity, { flags: { spikependium: flags } });
const source = en => inventory.sources.find(s => s.id === "GS2").entries.find(e => e.name.endsWith(`[${en}]`));
export function define() {
  const tree = npc({ key: "actor:gs2:arborguard-tree", name: "Дерево стены древостража", book: "GS2", sourceUrl: source("Arborguard Shield").url, page: "", img: "icons/environment/wilderness/tree-oak.webp",
    folder: folder("creatures", "Сумка грифона — книга 2/Объекты"), creatureType: "custom", size: "med", abilities: {}, cr: 0, ac: 13, hp: 20, movement: { walk: 0 }, dv: ["fire"],
    bio: md("Объект стены: основание 5 футов, высота до 20 футов; КД 13, 20 хитов, уязвимость огню. При 0 хитах или окончании стены исчезает. Дерево не получает собственных атак/ходов; характеристики, спасброски и прочие свойства в исходном описании не заданы — разрешайте их как для объекта. Геометрию/полное укрытие задаёт Мастер."), items: [] });
  tree.system.details.type.custom = "Объект — дерево магической стены";
  for (const [en, id, rarity, attuned] of GRIFFON_TWO_SHIELDS) {
    const key = `gs2:${id}`, opts = { rarity, attunement: attuned ? "required" : "", effects: [], acts: [] };
    const action = (suffix, o = {}, flags = {}) => tag(utility(`${key}:${suffix}`, { spellSlot: false, ...o }), flags);
    const profile = (suffix, name, o = {}) => { const e = effect(`${key}:${suffix}`, { name, ...o }); opts.effects.push(e); return e; };
    const paid = a => tag(a, { ...a.flags?.spikependium, griffonShieldPaid: true });
    if (id === "forge-dragon") {
      opts.magicalBonus = 1; opts.uses = uses(1, DAWN());
      const burning = profile("burning", "Драконий щит: горит, 1к10 в начале хода", { transfer: false, flags: { spikependium: { griffonForgeBurning: true } } });
      opts.desc = "Держа щит, получаете ещё +1 КД сверх обычных +2. Раз до рассвета, когда существо в 5 футах промахивается по вам, реакцией ответьте огнём: Ловкость СЛ 15, 3к10 огня, при успехе половина. Провал также поджигает цель: 1к10 огня в начале каждого её хода, пока действием не собьёт пламя. Настроены КД, ресурс, реакция, испытание/урон и профиль горения только при провале. Исходный промах/дальность, очередные ходы горения и действие тушения пока ручные; при тушении удалите профиль.";
      const retaliate = save(`${key}:fire`, { name: "После промаха в 5 футах: огненная реакция", activation: "reaction", range: 5, count: 1, affects: "creature", ability: "dex", dc: 15, damage: [dmg("3d10", "fire")], effects: [burning._id], spellSlot: false, consume: [useSelf()] }); retaliate.effects[0].onSave = false;
      opts.acts.push(paid(retaliate), damage(`${key}:tick`, { name: "Начало хода горящей цели: 1к10 огня (ручной резерв)", activation: "special", damage: [dmg("1d10", "fire")], spellSlot: false }));
    } else if (id === "bramble") {
      opts.uses = uses(1, DAWN());
      opts.desc = "Настройка друидом или следопытом. Надетые лозы не дают уронить/обезоружить щит против воли; это свойство подтверждайте вручную. Действием с командным словом коснитесь земли у ног: щит снимается и превращается в заметную полосу Шипов 20×15 футов на 10 минут без концентрации. Связанный Cast меняет область/концентрацию штатного заклинания и расходует применение до рассвета; после оплаченного применения щит автоматически снимается и недоступен для экипировки до окончания. Действием с командным словом в 5 футах от области можно окончить её и снова надеть щит; расстояние/свободную руку подтвердите перед кнопкой. По окончании времени щит остаётся ненадетым на месте области. Размещение, события движения, труднопроходимость, снятие самой области при досрочном окончании и перемещение щита пока ручные.";
      const grow = cast(`${key}:grow`, srdSpellUuid("Spike Growth"), { name: "Коснуться земли: шипы 20×15 футов на 10 минут", activation: "action", rangeUnits: "self", template: { type: "line", size: 20, width: 15 }, duration: "minute", durationValue: 10, concentration: false, properties: [], spellSlot: false, consume: [useSelf()] });
      opts.acts.push(tag(paid(grow), { griffonShieldPaid: true, brambleGrow: true, griffonCommandWord: true, griffonCooldown: 600 }), action("end", { name: "В 5 футах от области: свернуть и надеть щит", activation: "action" }, { brambleEnd: true, griffonCommandWord: true }));
    } else if (id === "arborguard") {
      opts.magicalBonus = 1; opts.uses = uses(1, DAWN());
      const wall = profile("wall", "Стена древостража: концентрация до минуты", { transfer: false, seconds: 60, flags: { spikependium: { griffonArborWall: true } } });
      opts.desc = `Держа щит, получаете ещё +1 КД. Действием и командным словом раз до рассвета создайте на твёрдой поверхности в 120 футах стену из 12 смежных деревьев: основание каждого 5 футов, высота до 20; либо кольцо диаметром до 25 футов с центром на вас. Полное укрытие, пройти между деревьями нельзя. При появлении в пространстве существа вытолкните его на сторону стены: Ловкость СЛ 16, 8к6 дробящего либо колющего, успех — половина. Объекты доступны отдельно: @UUID[${ref("actor:gs2:arborguard-tree")}]{Дерево стены древостража}; добавьте не более 12, каждый КД 13/20 хитов/уязвимость огню, при 0 исчезает. В 30 футах видите сквозь деревья и можете совершать свои рукопашные атаки оружием из пространства одного дерева. Стена держится при концентрации до минуты; оканчивается, если перестали держать щит, либо от Рассеивания магии 6+ круга. Ресурс, концентрация/минутный профиль и отдельное испытание настроены. Размещение/удаление деревьев и стен, укрытие, смещение существ, зрение и перенос исходной атаки пока ручные.`;
      opts.acts.push(paid(tag(form(`${key}:wall`, { name: "Вырастить стену из 12 деревьев", activation: "action", range: 120, effects: [wall._id], duration: "minute", durationValue: 1, concentration: true, spellSlot: false, consume: [useSelf()] }), { griffonCommandWord: true })),
        tag(save(`${key}:hit`, { name: "Появление стены: вытолкнуть существо", activation: "special", ability: "dex", dc: 16, count: 1, affects: "creature", damage: [dmg("8d6", "bludgeoning", "piercing")], spellSlot: false }), { arborDamage: true }));
    } else if (id === "skyglider") {
      opts.uses = uses(3, DAWN()); profile("poison", "Планер: сопротивление яду", { changes: [change("system.traits.dr.value", "poison")] });
      const glide = profile("glide", "Крылья щита: планирование", { transfer: false, flags: { spikependium: { griffonSkyglider: true } }, changes: [change("system.attributes.movement.speeds.fly", 30, "override")] });
      opts.desc = "Держа настроенный щит, имеете сопротивление яду. Три заряда, все на рассвете. Падая, реакцией за заряд расправьте крылья: снижение 10 футов/раунд, полёт 30 футов для планирования, подъём стоит 3 фута за 1 фут высоты, при посадке нет урона падения. Нельзя совершать Рывок; эту скорость нельзя увеличить. При посадке либо в конце хода, если пролетели меньше 15 футов, крылья складываются. Настроены сопротивление, реакция/заряд и профиль полёта; итоговая скорость полёта ограничивается сверху 30 без отмены замедлений, штатная активность Рывок блокируется. Падение/посадка, цена подъёма, пройденные 15 футов и урон падения пока ручные; после выполнения условия сложите крылья кнопкой. При снятии щита профиль удаляется.";
      opts.acts.push(paid(form(`${key}:glide`, { name: "Падая: раскрыть крылья", activation: "reaction", effects: [glide._id], spellSlot: false, consume: [useSelf()] })), action("end", { name: "Посадка или недостаточное движение: сложить крылья", activation: "special" }, { skygliderEnd: true }));
    } else if (id === "storm-eye") {
      opts.uses = uses(1, DAWN()); profile("lightning", "Око бури: сопротивление электричеству", { changes: [change("system.traits.dr.value", "lightning")] });
      opts.desc = "Держа настроенный щит, имеете сопротивление электричеству. Получив электрический урон из враждебного источника, реакцией раз до рассвета сотворите Волну грома СЛ 15; исходный урон/враждебность подтвердите сами. Положив щит плашмя на землю, минутным ритуалом сотворите Гадание: спокойные облака — благо, бурлящие — вред, молния — оба, пустой рисунок — ни то ни другое. У Гадания отдельное одноразовое применение, оно не восстанавливается отдыхом/рассветом: только после часа рядом с новой грозой. Подтвердив этот час, восстановите его отдельной кнопкой. Cast-ссылки, раздельные ресурсы и особый сброс настроены; для Гадания снимите щит и освободите его от контейнера. Землю/новую грозу/прошедший час и прорицательный ответ оценивает Мастер.";
      const wave = cast(`${key}:wave`, srdSpellUuid("Thunderwave"), { name: "После враждебного электричества: Волна грома", activation: "reaction", spellSlot: false, properties: [], consume: [useSelf()] }); wave.spell.challenge = { override: true, attack: "", save: "15" };
      const augury = tag(cast(`${key}:augury`, srdSpellUuid("Augury"), { name: "Щит на земле: минутное Гадание", activation: "minute", spellSlot: false, properties: [], usesMax: 1, consume: [useActivity()] }), { stormAugury: true, griffonShieldPaid: true, shieldActivityResource: true });
      opts.acts.push(paid(wave), augury, action("refill", { name: "Подтверждён час у новой грозы: восстановить Гадание" }, { stormRefill: true }));
    } else if (id === "bane-shield") {
      opts.uses = uses(3, DAWN("1d3"));
      const curse = profile("curse", "Щит порчи: следующий бросок −1к4", { transfer: false, expiry: "targetEnd", flags: { spikependium: { griffonShieldBane: true } } });
      opts.desc = "Три заряда, 1к3 на рассвете. Получив урон от существа в 5 футах, реакцией за заряд прокляните его без испытания. До конца следующего хода цели её ближайшая проверка характеристики либо атака получает −1к4; после этого проклятие заканчивается. Профиль автоматически добавляет одну к4 со знаком минус к первому подходящему броску и снимается после выполненного броска; спасброски не затрагивает. Отмена окна не тратит проклятие. Несколько одинаковых профилей не складывают к4 и прекращаются на том же броске. Исходный урон, его виновника и 5 футов пока подтверждает игрок.";
      opts.acts.push(paid(action("curse", { name: "После урона: проклясть нападающего", activation: "reaction", range: 5, count: 1, affects: "creature", effects: [curse._id], consume: [useSelf()] })));
    } else if (id === "pisces") {
      opts.uses = { ...uses(1), spent: 1 };
      opts.desc = "После полного погружения щита в воду не меньше чем на минуту карпы оживают на 24 часа. Подтвердите это минутной кнопкой. Пока держите щит и карпы живы, выпавшую на к20 единицу атаки, проверки или спасброска можно считать двадцаткой. Модуль предлагает выбор перед публикацией результата и меняет именно активную к20 с пересчётом итога/критического результата, сохраняя прочие кости и модификаторы. Отказ не расходует свойство. После применения карпы замирают и не могут ожить 24 часа; срок хранится на самом щите и сохраняется при передаче. Подтверждение воды ручное; откат уже применённых результатов при дальнейшем изменении броска также ручной.";
      opts.acts.push(action("water", { name: "Щит был под водой минуту: оживить карпов на сутки", activation: "minute" }, { piscesWater: true }));
    } else if (id === "varion") {
      opts.magicalBonus = 1; opts.desc = "Держа настроенный щит, получаете ещё +1 КД сверх обычных +2 и игнорируете немагическую труднопроходимую местность. КД учитывается штатно. Происхождение местности проверяет Мастер: модуль не даёт общее игнорирование магической/любой труднопроходимой местности, потому что у регионов нет обязательного признака её магичности.";
    } else if (id === "monster-tamer") {
      profile("animals", "Укротитель: преимущество Ухода за животными", { changes: [change("system.skills.ani.roll.mode", 1)] });
      opts.desc = "Держа настроенный щит, имеете преимущество Ухода за животными. Получая урон от рукопашной атаки зверя или чудовища, наносите нападающему 1к4 психического. Нативное преимущество настроено; обработчик связанного фактического урона проверяет источник/рукопашную атаку/тип и один раз отвечает психическим уроном. Несвязанный урон разрешайте вручную. При одновременной настройке на Меч укротителя монстров пойманное мечом существо получает +1 КД и иммунитет к Очарованному; меч/пойманное существо ещё не перенесены, этот совместный бонус пока ручной.";
      opts.acts.push(damage(`${key}:retaliate`, { name: "Ответ зверю/чудовищу после рукопашного урона: 1к4 психического (ручной резерв)", activation: "special", damage: [dmg("1d4", "psychic")], spellSlot: false }));
    } else if (id === "feywatch") {
      opts.desc = "Держа щит, получаете +5 к проверкам для распознавания/обнаружения иллюзий и к испытаниям против Очарованного. Обработчик добавляет +5 только испытанию по связанной карточке с профилем Очарованного либо проверке по связанному Check-действию заклинания Иллюзии. Для свободной проверки без такого источника прибавьте +5 вручную после подтверждения её цели Мастером. Общего бонуса к любым испытаниям, Магии или Восприятию щит не даёт.";
    } else if (id === "justicars") {
      opts.magicalBonus = 1; opts.uses = uses(4, DAWN("1d4"));
      const pulse = profile("pulse", "Диссонанс юстициаров: атаки заклинанием/СЛ −2 до конца хода", { transfer: false, seconds: 6, flags: { spikependium: { griffonJusticarPulse: true } }, changes: [change("system.rolls.attack.msak.bonus", -2), change("system.rolls.attack.rsak.bonus", -2), change("system.bonuses.spell.dc", -2)] });
      opts.desc = "Щит +1 сверх обычных +2; четыре заряда, 1к4 на рассвете. Когда видимое существо в 30 футах накладывает заклинание, реакцией и командным словом за заряд заставьте его пройти Телосложение СЛ 15. Провал: до конца текущего хода бонус атак заклинанием и СЛ собственных заклинаний −2, включая вызвавшее реакцию заклинание. Настроены заряд/реакция, испытание и профиль со штатными полями атак/СЛ; профиль удаляется при переходе хода. Видимость, исходное сотворение и своевременное вмешательство подтвердите сами; уже открытое окно/карточку исходного заклинания проверьте и исправьте вручную.";
      const a = tag(save(`${key}:pulse`, { name: "Видимое сотворение в 30 футах: диссонанс", activation: "reaction", range: 30, count: 1, affects: "creature", ability: "con", dc: 15, effects: [pulse._id], spellSlot: false, consume: [useSelf()] }), { griffonCommandWord: true }); a.effects[0].onSave = false; opts.acts.push(paid(a));
    } else {
      opts.uses = uses(1, DAWN());
      const spirit = profile("spirit", "Духоход: духовное отделение до минуты", { transfer: false, seconds: 60, flags: { spikependium: { griffonSpiritwalker: true } } });
      opts.desc = "При снижении до 0 хитов в настроенной кирасе раз до рассвета дух выходит на минуту или до возвращения сознания. Всё это время тело не получает провалы испытаний смерти от урона; умереть от урона можно, только если суммарный урон за ход не меньше максимума хитов. Испытания смерти в начале хода сохраняются: порог успеха +1 за каждые полные 5 футов от тела до духа. Дух не дальше 30 футов, имеет ваши чувства, полёт 30/зависание, бестелесен, иммунен всем типам урона, в свой ход может лишь двигаться/Помогать. Изгнание нежити возвращает его и оканчивает эффект. Кнопка при 0 хитов расходует дневное применение и ставит минутный маркер; маркер снимается при восстановлении сознания/окончании срока. Отдельный дух/его движение/Помощь, привязка, порог испытаний смерти, защита тела, суммарный урон и изгнание пока ручные. Маркер не даёт иммунитет/полёт самому телу.";
      opts.acts.push(paid(form(`${key}:spirit`, { name: "При 0 хитах: отделить дух, поставить минутный маркер", activation: "special", effects: [spirit._id], duration: "minute", durationValue: 1, spellSlot: false, consume: [useSelf()] })));
    }
    const base = bases.records.find(r => r.document.system.type.value === (id === "spiritwalker" ? "medium" : "shield")).document;
    const doc = griffonItem("GS2", en, id, { ...opts, equipType: base.system.type.value, baseItem: base.system.type.baseItem, category: id === "spiritwalker" ? "Доспехи" : "Щиты",
      armorValue: base.system.armor.value, properties: [...base.system.properties, "mgc"], weight: base.system.weight.value, img: base.img,
      price: { uncommon: 400, rare: 4000, veryRare: 40000 }[rarity] + base.system.price.value,
      priceNote: "Цена оценочная: ориентир по редкости 2024 плюс обычная основа.", weightNote: "Вес обычного щита/кирасы 2024; отдельного веса источник не задаёт.",
      flags: { spikependium: { key: `item:${key}`, griffonTwoShield: id, nativeBase: `Compendium.dnd5e.equipment24.Item.${base._id}`, ...(id === "bramble" ? { griffonClass: ["druid", "ranger"] } : {}) } } });
    doc.system.armor.dex = base.system.armor.dex; doc.system.strength = base.system.strength;
  }
}
