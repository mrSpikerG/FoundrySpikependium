import baseGear from "../../tools/data/mm25-base-gear.json" with { type: "json" };
import { attack, check, dmg, effect, save, utility } from "../../tools/lib/core.mjs";
import { folder, npc, ref, rollTable } from "../../tools/lib/docs.mjs";

export function weapon(key, name, identifier, baseItem, formula, type, ability, reach, ranged, quantity = 1, extra = null) {
  const gear = baseItem && structuredClone(baseGear.gear[baseItem]);
  const melee = attack(`${key}:melee`, { name, activation: "action", ability, range: reach, affects: "creature", count: 1,
    spellSlot: false, damage: extra ? [extra] : [] });
  const acts = ranged ? [attack(`${key}:ranged`, { name: `${name} — дистанционно`, activation: "action", ability,
    attackType: "ranged", range: ranged[0], affects: "creature", count: 1, spellSlot: false, damage: extra ? [extra] : [] })] : [];
  if (reach) acts.unshift(melee);
  return { name, type: "weapon", img: gear?.img ?? "icons/skills/melee/unarmed-punch-fist.webp", desc: "Атака по блоку Энциклопедии чудовищ (2025). Цена и вес обычного оружия — из штатных данных 2024 года; кости урона и досягаемость отражают возможности этого чудовища.",
    system: { ...gear?.system, identifier, type: gear?.system.type ?? { value: "natural", baseItem: "" },
      equipped: true, identified: true, proficient: 1, quantity, weight: gear?.system.weight ?? { value: 0, units: "lb" },
      price: gear?.system.price ?? { value: 0, denomination: "gp" },
      range: { value: ranged?.[0] ?? null, long: ranged?.[1] ?? null, reach: reach || null, units: "ft" },
      damage: { base: dmg(formula, type) } }, acts };
}
export const armor = (base, name) => ({ ...structuredClone(baseGear.gear[base]), name,
  system: { ...structuredClone(baseGear.gear[base].system), identifier: base, quantity: 1, equipped: true, identified: true },
  desc: "Штатный доспех 2024 года: цена и вес по базовому предмету. КБ чудовища задан в соответствии с его блоком." });
function multi(key, weapons, count) {
  const action = utility(`${key}:multiattack`, { name: "Мультиатака", activation: "action", spellSlot: false });
  action.flags = { spikependium: { multiattack: { weapons, count } } };
  return { name: "Мультиатака", desc: `${count} атаки в любой комбинации; цели и способ выбираются перед каждой атакой.`, acts: [action] };
}
export function define() {
  const f = folder("creatures", "Энциклопедия чудовищ (2025)");
  const poison = effect("mm25:assassin:poison", { name: "Яд короткого меча ассасина", transfer: false,
    statuses: ["poisoned"], expiry: "sourceStart" });
  const evasion = effect("mm25:assassin:evasion", { name: "Изворотливость", transfer: false,
    flags: { spikependium: { monsterEvasion: true } } });
  const disengage = effect("mm25:assassin:disengage", { name: "Отступление: защита от провоцированных атак", transfer: false,
    flags: { spikependium: { disengageTemplate: true } }, description: "Перемещение не провоцирует атаки до конца текущего хода." });
  const hidden = effect("mm25:assassin:hide", { name: "Засада: Невидимость при скрытности", transfer: false, statuses: ["invisible"],
    flags: { spikependium: { hideTemplate: true } }, description: "Скрытность: условия сохранения и обнаружение разрешает Мастер; состояние заканчивается после атаки или заклинания с вербальным компонентом." });
  const sword = weapon("mm25:assassin:shortsword", "Короткий меч", "assassin-shortsword", "shortsword", "1d6", "piercing", "dex", 5, null, 1, dmg("5d6", "poison"));
  sword.effects = [poison]; sword.desc += " Бросок атаки +7; попадание: 1к6 + 4 колющего урона и 5к6 урона ядом. После подтверждённого попадания цель Отравлена до начала следующего хода ассасина; учитывается иммунитет к состоянию.";
  const crossbow = weapon("mm25:assassin:crossbow", "Лёгкий арбалет", "assassin-light-crossbow", "lightcrossbow", "1d8", "piercing", "dex", 0, [80, 320], 1, dmg("6d6", "poison"));
  crossbow.desc += " Бросок атаки +7; попадание: 1к8 + 4 колющего урона и 6к6 урона ядом. Состояние Отравленный эта атака не накладывает. Запас болтов в книге не задан: выберите доступные боеприпасы в окне атаки.";
  npc({ key: "actor:mm25:assassin", name: "Ассасин", en: "Assassin", book: "MM25", page: 20, folder: f,
    img: "icons/skills/melee/strike-sword-dagger-runes-red", creatureType: "humanoid", size: "med", alignment: "Нейтральный", disposition: 0,
    ac: 16, hp: 97, hpFormula: "15d8+30", cr: 8, initiativeBonus: "@prof * 2", movement: { walk: 30 },
    abilities: { str: 11, dex: 18, con: 14, int: 16, wis: 11, cha: 10 }, saves: ["dex", "int"], skills: { acr: 1, prc: 2, ste: 2 },
    dr: ["poison"], languages: ["common", "cant"], habitatCustom: "Любая", treasure: ["armaments", "individual"], effects: [evasion],
    bio: `<h2>Наёмный убийца</h2><p>Среда обитания: любая. Сокровища: Инвентарь, Личные. Размер: Средний или Небольшой; выбран Средний, при необходимости измените его на листе.</p><p>Ассасины — профессиональные убийцы, способные тихо приблизиться к своей жертве и нанести незаметный удар. Большинство убивает за деньги богатых нанимателей или участвуя в сомнительных делах. Они используют яды, другие смертоносные инструменты и разнообразную экипировку для проникновения в охраняемые области и побега.</p><p>Многие придерживаются кредо или имеют фирменный почерк. Выберите особенность или бросьте по таблице ${ref("table:mm25:assassin-modus", "Modus operandi ассасина")}.</p>`,
    items: [multi("mm25:assassin", ["assassin-shortsword", "assassin-light-crossbow"], 3), sword, crossbow, armor("studded", "Клёпаный кожаный доспех"),
      { name: "Изворотливость", system: { identifier: "evasion", properties: ["trait"] },
        desc: "Если эффект позволяет совершить спасбросок Ловкости для половины урона, ассасин получает половину при провале и не получает урона при успехе. Не работает при Недееспособности. При штатном применении урона проверяются исходное действие, тип спасброска и результат именно ассасина; сопротивления и временные хиты обрабатываются системой. Неизвестные исходы и нестандартные множители разрешите вручную. Для отключения выключите эффект Изворотливость на листе." },
      { name: "Хитроумное действие", effects: [disengage, hidden], desc: "Бонусным действием ассасин совершает Засаду, Отступление или Рывок. Все бонусные действия в бою имеют общий предел одного применения в собственный ход и штатную отмену расхода. Отступление защищает от провоцированных атак до конца текущего хода. Засада требует проверки Ловкости (Скрытность) Сл 15: подтвердите сильную заслонённость, укрытие на три четверти или полное укрытие и отсутствие прямой видимости всех врагов. Успех даёт Невидимость, пока ассасин скрыт; итог проверки сохраняется как Сл обнаружения. Эффект заканчивается после броска атаки или заклинания с вербальным компонентом. Громкий звук, обнаружение врагом и прекращение возможности оставаться скрытым разрешает Мастер: снимите эффект Засады на листе. Невидимость из других источников сохраняется. Добавочное перемещение Рывка пока разрешает Мастер.",
        acts: ["Засада", "Отступление", "Рывок"].map((name, i) => i === 0 ? {
          ...check("mm25:assassin:cunning:0", { name, activation: "bonus", self: true, ability: "dex", associated: ["ste"], dc: "15",
            spellSlot: false, effects: [hidden._id] }), flags: { spikependium: { cunningHide: true } }
        } : ({ ...utility(`mm25:assassin:cunning:${i}`, {
          name, activation: "bonus", self: true, spellSlot: false, ...(i === 1 ? { effects: [disengage._id] } : {}) }),
          ...(i === 1 ? { flags: { spikependium: { cunningDisengage: true } } } : {}) })) }
    ] });
  rollTable({ key: "table:mm25:assassin-modus", name: "Modus operandi ассасина", book: "MM25", page: 20,
    folder: folder("tables", "Энциклопедия чудовищ (2025)"), rows: [
      "Создаёт с помощью трупов своих жертв живописные сцены.", "Прячется внутри крупных предметов, таких как набор доспехов или полая мебель.",
      "Оставляет на месте преступления сувенир: визитную карточку, цветок, морскую ракушку или зуб.", "Выдаёт себя за знаменитость, святого или слугу.",
      "Собирает трофеи у своих жертв.", "Использует яд с характерным цветом или запахом."
    ] });
  const bio = "<h2>Неуловимые гоблиноиды-силачи</h2><p>Среда обитания: Лес, Степь, Планы (Страна Фей), Подземье. Сокровища: Вооружение, Личные.</p><p>Багберы воплощают страх перед дикими землями и опасность, затаившуюся в тени леса. Они славятся незаметностью, и враги, осмелившиеся ступить на их землю, часто исчезают без следа.</p>";
  const base = { book: "MM25", page: 21, folder: f, creatureType: "fey", creatureSubtype: "Гоблиноид", size: "med", disposition: -1,
    img: "icons/creatures/abilities/mouth-teeth-long-red", alignment: "Хаотичная Злая", movement: { walk: 30 }, senses: { darkvision: 60 },
    languages: ["common", "goblin"], habitat: [{ type: "forest" }, { type: "grassland" }, { type: "planar", subtype: "Страна Фей" }, { type: "underdark" }], treasure: ["armaments", "individual"] };
  const abduction = { name: "Похищение", system: { identifier: "bugbear-abduction" }, desc: "Багбер не тратит дополнительные футы перемещения при движении со схваченным им существом. Перенос второго токена вместе с багбером пока выполняет Мастер; штраф за этот перенос не добавляйте." };
  const grab = effect("mm25:bugbear-warrior:grab", { name: "Схвачен багбером-воителем", transfer: false, statuses: ["grappled"] });
  const fist = weapon("mm25:bugbear-warrior:grab", "Захват", "bugbear-warrior-grab", null, "2d6", "bludgeoning", "str", 10, null);
  fist.effects = [grab]; fist.flags = { spikependium: { monsterGrapple: { dc: 12, reach: 10, maxSize: "med" } } };
  fist.desc += " Попадание: 2к6 + 2 дробящего урона. Существо не больше Среднего становится Схваченным; Сл высвобождения 12.";
  const hammer = weapon("mm25:bugbear-warrior:hammer", "Лёгкий молот", "bugbear-warrior-hammer", "lighthammer", "3d4", "bludgeoning", "str", 10, [20, 60], 3);
  hammer.flags = { spikependium: { ownGrappleAdvantage: true } }; hammer.desc += " Бросок атаки +4, с преимуществом, если цель схвачена именно этим багбером; попадание: 3к4 + 2 дробящего урона. При броске молота расходуется один предмет; расход можно отменить штатной карточкой.";
  const warrior = npc({ ...base, key: "actor:mm25:bugbear-warrior", name: "Багбер-воитель", en: "Bugbear Warrior", ac: 14, hp: 33, hpFormula: "6d8+6", cr: 1,
    abilities: { str: 15, dex: 14, con: 13, int: 8, wis: 11, cha: 9 }, skills: { sur: 1, ste: 2 },
    bio: bio + "<p>Багберы-воители готовы служить тем, кто предложит им сокровища, пищу или шанс поохотиться на опасную добычу.</p>",
    items: [abduction, fist, hammer, armor("hide", "Сыромятный доспех")] });
  const quick = effect("mm25:bugbear-stalker:grab", { name: "Схвачен багбером-ловчим", transfer: false, statuses: ["grappled"],
    flags: { spikependium: { monsterEffect: "bugbear-grab" } } });
  const quickAction = save("mm25:bugbear-stalker:grab", { name: "Быстрый захват", activation: "bonus", ability: "dex", dc: 13,
    range: 10, count: 1, affects: "creature", spellSlot: false, effects: [{ _id: quick._id, onSave: false }] });
  quickAction.flags = { spikependium: { monsterAction: "bugbear-grab" } };
  const star = weapon("mm25:bugbear-stalker:morningstar", "Моргенштерн", "bugbear-stalker-morningstar", "morningstar", "2d8", "piercing", "str", 10, null);
  star.flags = { spikependium: { ownGrappleAdvantage: true } }; star.desc += " Бросок атаки +5, с преимуществом, если цель схвачена именно этим багбером; попадание: 2к8 + 3 колющего урона.";
  const pilum = weapon("mm25:bugbear-stalker:javelin", "Пилум", "bugbear-stalker-javelin", "javelin", "3d6", "piercing", "str", 10, [30, 120], 6);
  pilum.desc += " Бросок атаки +5; попадание: 3к6 + 3 колющего урона. При дистанционной атаке расходуется один пилум; в ближнем бою он сохраняется.";
  const stalker = npc({ ...base, key: "actor:mm25:bugbear-stalker", name: "Багбер-ловчий", en: "Bugbear Stalker", ac: 15, hp: 65, hpFormula: "10d8+20", cr: 3,
    abilities: { str: 17, dex: 14, con: 14, int: 11, wis: 12, cha: 11 }, saves: ["con", "wis"], skills: { sur: 1, ste: 2 },
    bio: bio + "<p>Багберы-ловчие часто берут жертв в заложники и используют их для захвата или запугивания других существ.</p>",
    items: [abduction, multi("mm25:bugbear-stalker", ["bugbear-stalker-morningstar", "bugbear-stalker-javelin"], 2), star, pilum,
      { name: "Быстрый захват", system: { identifier: "bugbear-stalker-grab" },
        flags: { spikependium: { monsterGrapple: { dc: 13, reach: 10, maxSize: "med" } } }, effects: [quick],
        desc: "Бонусное действие; спасбросок Ловкости Сл 13: одно видимое существо не больше Среднего в пределах 10 футов. При провале цель Схвачена (Сл высвобождения 13). Подтвердите видимость в окне применения. Для высвобождения используйте кнопку в карточке: действие цели, Сила (Атлетика) или Ловкость (Акробатика).", acts: [quickAction] }, armor("chainshirt", "Кольчужная рубаха")] });
  for (const actor of [warrior, stalker]) for (const item of actor.items) for (const action of Object.values(item.system.activities)) {
    if (item.system.properties.includes("thr") && action.attack?.type.value === "ranged") {
      action.consumption.targets = [{ type: "material", target: item._id, value: "1", scaling: {} }];
    }
  }
}
