import bases from "../../tools/data/griffon-focus-bases.json" with { type: "json" };
import inventory from "../../tools/data/external-content-inventory.json" with { type: "json" };
import { griffonItem } from "./griffons-saddlebag.mjs";
import { weaponTemplate, folder } from "../../tools/lib/docs.mjs";
import { attack, cast, heal, save, check, utility, damage, dmg, uses, useSelf, DAWN, effect, change } from "../../tools/lib/core.mjs";

export const GRIFFON_FOCI = [
  ["Fire Wand of the Unbroken Circle", "unbroken-fire", "rare", "wand", "druid"],
  ["Warmind Wand", "warmind", "rare", "wand", "orc"],
  ["Talyard the Great's Wand of Power", "talyard", "uncommon", "wand", ""],
  ["Wand of Whispers", "whispers", "rare", "wand", "caster"],
  ["Borboss' Joyous Wand of Color", "borboss", "common", "wand", ""],
  ["Rocborne Rod", "rocborne", "rare", "rod", "any"],
  ["Staff of the Reverent Warrior", "reverent", "rare", "staff", "caster"],
  ["Staff of the Mirage", "mirage", "rare", "staff", "wizard"],
  ["Staff of Favorable Winds", "favorable-winds", "veryRare", "staff", "arcane"],
  ["Staff of the Magpie", "magpie", "rare", "staff", "caster"],
  ["Staff of the Four Seasons", "four-seasons", "veryRare", "staff", "arcane"],
  ["Staff of the Mustang", "mustang", "rare", "staff", "any"]
];
export const FOCUS_SEASONS = [
  ["Весна", "radiant", ["Guiding Bolt", "Направляющий снаряд"], ["Moonbeam", "Лунный луч"], ["Plant Growth", "Рост растений"]],
  ["Лето", "fire", ["Burning Hands", "Огненные ладони"], ["Spike Growth", "Шипы"], ["Fireball", "Огненный шар"]],
  ["Осень", "necrotic", ["Inflict Wounds", "Нанесение ран"], ["Pass without Trace", "Бесследное передвижение"], ["Vampiric Touch", "Прикосновение вампира"]],
  ["Зима", "cold", ["Color Spray", "Сверкающие брызги"], ["Darkvision", "Тёмное зрение"], ["Sleet Storm", "Метель"]]
];
const tag = (activity, flags) => Object.assign(activity, { flags: { spikependium: flags } });
const dusk = formula => ({ period: "dusk", type: "formula", formula });
const ruin = id => ["unbroken-fire", "mirage", "favorable-winds", "mustang"].includes(id) ? "destroy" : "mundane";
export function define() {
  for (const [en, id, rarity, baseName, attunement] of GRIFFON_FOCI) {
    const key = `gs1:${id}`, native = bases.records.find(r => r.name === baseName).document;
    const flags = { key: `item:${key}`, griffonFocus: id, focusRuin: 0,
      ...(attunement === "caster" ? { griffonSpellcaster: true } : {}),
      ...(["druid", "wizard", "arcane"].includes(attunement) ? { griffonClass: attunement === "arcane" ? ["druid", "sorcerer", "warlock", "wizard"] : attunement } : {}) };
    const opts = { rarity, attunement: attunement ? "required" : "", equipType: "focus", category: baseName === "staff" ? "Посохи" : baseName === "wand" ? "Волшебные палочки" : "Жезлы",
      weight: id === "magpie" ? 10 : native.system.weight.value,
      weightNote: id === "magpie" ? "Вес 10 фунтов прямо указан в источнике." : `Вес по обычному ${baseName === "staff" ? "посоху" : baseName === "wand" ? "волшебной палочке" : "жезлу"} 2024; особый вес в источнике не указан.`,
      img: baseName === "staff" ? "icons/weapons/staves/staff-simple.webp" : "icons/weapons/wands/wand-carved-stone-shard.webp", acts: [], flags: { spikependium: flags } };
    const action = (suffix, name, more = {}, f = {}) => tag(utility(`${key}:${suffix}`, { name, activation: "special", spellSlot: false, ...more }), f);
    const linked = (suffix, name, ru, cost, more = {}, f = {}) => {
      const original = bases.records.find(r => r.uuid && r.name === name); if (!original) throw Error(name);
      const a = tag(cast(`${key}:${suffix}`, original.uuid, { name: `${ru}${cost ? ` — ${cost} заряд${cost === 1 ? "" : "а"}` : ""}`, properties: [], spellSlot: false,
        ...(cost ? { consume: [useSelf(cost)] } : {}), ...more }), f);
      opts.acts.push(a); return a;
    };
    if (id === "unbroken-fire") {
      opts.uses = uses(7, DAWN("1d6+1"));
      const blade = linked("blade", "Flame Blade", "Горящий клинок", 2); blade.spell.challenge = { override: true, attack: "5", save: "" };
      for (const [cost, dice] of [[0, 1], [1, 2]]) {
        const flame = linked(`flame:${cost}`, "Produce Flame", cost ? "Сотворение пламени: как на 5-м уровне" : "Сотворение пламени: базовое", cost, {}, { focusCantripDice: dice });
        flame.spell.challenge = { override: true, attack: "5", save: "" };
      }
      opts.acts.push(action("concentration", "После провала концентрации своего Горящего клинка: успех", { activation: "reaction", consume: [useSelf()] }, { focusBladeSuccess: true }));
      opts.desc = "Настройка друидом. Горящий клинок за 2 заряда; Сотворение пламени бесплатно с 1к8 либо за заряд с 2к8, атака +5. Клинок возникает над палочкой. При свежем провале Телосложения для концентрации на Горящем клинке именно этой палочки модуль предлагает потратить реакцию и заряд, заменив исход успехом без изменения костей. Кнопка реакции на листе выбирает тот же свежий провал. Отмена расхода отменяет этот успех. Нужна одна активная концентрация; несколько одновременных концентраций, уже прекращённый эффект и удалённые исходные карточки требуют Мастера. 7 зарядов, рассвет 1к6+1. Последний заряд: при 1 на к20 палочка уничтожена.";
    } else if (id === "warmind") {
      opts.uses = uses(7, DAWN("1d6+1"));
      opts.acts.push(action("endurance", "Союзник падает до 0: оставить 1 хит", { activation: "reaction", range: 30, count: 1, affects: "creature", consume: [useSelf(2)] }),
        heal(`${key}:rally`, { name: "Сомкнуть ряды: 2к4+2 временных хита", activation: "action", formula: "2d4+2", temp: true, count: 1, affects: "creature", spellSlot: false, consume: [useSelf()] }),
        action("critical", "Крит союзника: прибавить исходному урону 2к4", { activation: "reaction", range: 30, roll: "2d4", consume: [useSelf()] }),
        action("strike", "Вместо своей атаки: союзник атакует реакцией", { consume: [useSelf()], count: 1, affects: "creature" }));
      opts.desc = "Настройка орком; 7 зарядов, рассвет 1к6+1. Реакцией за 2 заряда: видящий или слышащий союзник в 30 футах остаётся с 1 хитом вместо 0, если нет мгновенной смерти; повтор по этой цели только после её долгого отдыха. Действием за заряд: союзнику, видящему или слышащему вас, 2к4+2 временных хита и возможность реакцией пройти половину скорости без провоцирования. Реакцией за заряд при крите такого союзника в 30 футах: +2к4 к исходному урону. В свой ход вместо одной атаки за заряд: согласный слышащий/видящий союзник атакует оружием или безоружно реакцией. Кнопки тратят заряды и создают броски; исходные хиты/крит, квоту цели после отдыха, согласие, реакции союзников и движение подтверждайте вручную. Последний заряд, 1 на к20: немагическая рукоять.";
    } else if (id === "talyard") {
      opts.uses = uses(3, dusk("1d3")); flags.focusDrunk = 0;
      linked("heroism", "Heroism", "Героизм", 1, {}, { focusHeroism: true }); linked("restore", "Lesser Restoration", "Малое восстановление", 2); linked("thaumaturgy", "Thaumaturgy", "Чудотворство", 0);
      opts.acts.push(action("drunk", "Подтверждено: я пьян", {}, { focusDrunk: 1 }), action("sober", "Я больше не пьян", {}, { focusDrunk: 0 }));
      opts.desc = "Без настройки. 3 заряда, сумерки 1к3. Держа палочку и будучи пьяным: Героизм за заряд, Малое восстановление за 2, Чудотворство бесплатно; базовый модификатор +3. В Героизме настроены 3 временных хита. Опьянение подтверждается отдельными кнопками: состояние Отравлен само по себе не считается опьянением.";
    } else if (id === "whispers") {
      opts.uses = uses(7, dusk("1d6+1")); flags.focusFlame = 1;
      linked("message", "Message", "Сообщение", 0); linked("sending", "Sending", "Послание", 3);
      opts.acts.push(action("light-on", "Зажечь свечное пламя", { activation: "bonus" }, { focusFlame: 1 }), action("light-off", "Погасить свечное пламя", { activation: "bonus" }, { focusFlame: 0 }));
      opts.desc = "Настройка заклинателем. Пламя: яркий свет 5 футов, тусклый ещё 5; бонусным действием включается/выключается. Свет токена синхронизируется с экипировкой, настройкой и состоянием палочки. Сообщение бесплатно, Послание за 3 заряда. При запуске обычного вербального заклинания с листа выберите эту палочку в появившемся окне: на рабочей копии убирается только вербальный компонент. Списывается по заряду за фактически выбранный уровень ячейки 0–5; заговор бесплатен. Исходная запись заклинания не изменяется. Недостаток зарядов или выбор ячейки выше 5 отменяет применение до записи расходов; возврат расхода возвращает ячейку и заряды, но не откатывает уже сыгранные последствия. 7 зарядов, сумерки 1к6+1. Последний заряд, 1 на к20: немагическая свеча с подсвечником.";
    } else if (id === "borboss") {
      opts.acts.push(action("paint", "Рисовать иллюзорными красками", { duration: "hour", durationValue: 1 }),
        save(`${key}:avoid`, { name: "Несогласная цель: избежать рисунка на носимой вещи", ability: "dex", dc: 10, activation: "special", affects: "creature", spellSlot: false }));
      opts.desc = "Без зарядов и настройки. Палочка создаёт явно магические иллюзорные мазки в воздухе или на поверхности, которой касается. Рисунок существует час и даёт тусклый свет в 5 футах. Несогласный владелец носимой вещи избегает рисования успешной Ловкостью СЛ 10. Рисунок, неподвижный свет и его исчезновение размещаются на сцене вручную.";
    } else if (id === "rocborne") {
      opts.uses = uses(5, DAWN("1d4+1"));
      for (const activation of ["reaction", "action"]) opts.acts.push(action(`glide:${activation}`, `Призвать крылья: ${activation === "reaction" ? "при падении" : "подготовить падение"}`, { activation, consume: [useSelf()] }));
      opts.acts.push(action("end", "Рассеять крылья"), save(`${key}:wind`, { name: "Порыв: подбросить существ", activation: "action", ability: "str", dc: 15, range: 5, template: { type: "cylinder", size: 20, height: 60 }, affects: "creature", spellSlot: false, consume: [useSelf()] }));
      opts.desc = "5 зарядов, рассвет 1к4+1. За заряд реакцией при падении либо действием заранее: держась за рукояти, падаете без урона по 10 футов за раунд (20 при весе более 200 фунтов), планируя горизонтально/вниз со скоростью 40 футов; вверх только с восходящим потоком. Крылья заканчиваются с окончанием падения либо по желанию без действия. Действием за заряд: цилиндр радиусом 20, высотой 60 футов с центром в 5 футах; Большие и меньшие существа проваливают Силу СЛ 15 — подброшены на 30 футов, как и объекты легче 200 фунтов. Свой спасбросок можно выбрать; с немедленными или готовыми крыльями неуспех подбрасывает вас на 60 футов. Геометрию, вес, падение, реакцию и перемещение разрешайте вручную; обычная неограниченная скорость полёта не выдаётся.";
    } else if (id === "reverent") {
      opts.uses = uses(10, DAWN("1d6+4")); opts.magicalBonus = 2;
      linked("strike", "True Strike", "Меткий удар", 0);
      linked("quick-strike", "True Strike", "Меткий удар бонусным действием", 2, { activation: "bonus" });
      opts.acts.push(action("mark", "Меткий удар: следующая атака по цели с преимуществом", { consume: [useSelf()], count: 1, affects: "creature" }),
        damage(`${key}:radiant`, { name: "Попавший Меткий удар: добавить 1к6 излучения", activation: "special", damage: [dmg("1d6", "radiant")], affects: "creature", spellSlot: false, consume: [useSelf()] }));
      opts.desc = "Настройка заклинателем; боевой посох +2. Дробящий, колющий или рубящий урон выбирается при атаке, в том числе без настройки. Пока настроены, знаете Меткий удар; держа посох, за 2 заряда можете сотворить его бонусным действием. Ещё за заряд следующая атака по цели до конца вашего следующего хода получает преимущество; после попадания за заряд добавьте 1к6 излучения. Бонусная версия и отдельный урон доступны штатными кнопками; связь с исходным Метким ударом, комбинации усилений, одно преимущество и его срок пока контролируйте вручную. 10 зарядов, рассвет 1к6+4. Последний заряд, 1 на к20: обычный боевой посох с сохранением трёх типов урона.";
    } else if (id === "mirage") {
      opts.uses = uses(10, DAWN("1d6+4"));
      for (const [name, ru, cost] of [["Disguise Self", "Маскировка", 1], ["Hallucinatory Terrain", "Мираж", 4], ["Invisibility", "Невидимость", 2], ["Mirror Image", "Отражения", 2], ["Mislead", "Фальшивый двойник", 5], ["Silent Image", "Безмолвный образ", 1]]) {
        const a = linked(name, name, ru, cost); a.spell.challenge = { override: true, attack: "", save: "@attributes.spell.dc + 2" };
      }
      opts.desc = "Настройка волшебником. Заклинания используют вашу СЛ с прибавкой +2 только для этого посоха: Маскировка и Безмолвный образ по заряду, Невидимость и Отражения по 2, Мираж 4, Фальшивый двойник 5. 10 зарядов, рассвет 1к6+4. Последний заряд, 1 на к20: посох исчезает.";
    } else if (id === "favorable-winds") {
      opts.uses = uses(10, DAWN("1d6+4"));
      opts.effects = [effect(`${key}:wind`, { name: "Посох: ветер не замедляет", changes: [change("system.attributes.movement.ignoredDifficultTerrain", "wind")] })];
      for (const [name, ru, cost] of [["Cone of Cold", "Конус холода", 5], ["Feather Fall", "Падение пёрышком", 1], ["Gust of Wind", "Порыв ветра", 2], ["Wind Wall", "Стена ветров", 3]]) linked(name, name, ru, cost);
      opts.acts.push(action("air", "Создать безвредный эффект воздуха", { activation: "action" }));
      opts.desc = "Настройка друидом, чародеем, колдуном или волшебником. Держа посох, не тратите дополнительное перемещение из-за труднопроходимости от ветра; если регион обозначает такую местность, она игнорируется. Другие причины замедления сохраняются. Заклинания с вашей СЛ: Конус холода 5 зарядов, Падение пёрышком 1, Порыв ветра 2, Стена ветров 3. Действием создаётся безвредный эффект воздуха. 10 зарядов, рассвет 1к6+4. Последний заряд, 1 на к20: посох обращается в пыль.";
    } else if (id === "magpie") {
      opts.uses = uses(10, DAWN("1d6+4"));
      linked("fly", "Fly", "Полёт", 3); linked("locate", "Locate Object", "Поиск предмета", 2);
      opts.acts.push(check(`${key}:search`, { name: "Поиск сокровища/нужного предмета: Внимательность +1", ability: "wis", associated: ["prc"], bonus: "1", spellSlot: false }));
      opts.desc = "Настройка заклинателем. Вес 10 фунтов. Держа посох, получаете +1 к Мудрости (Внимательность) только при поиске сокровищ или конкретного предмета; отдельная проверка содержит эту прибавку. Полёт за 3 заряда, Поиск предмета за 2. 10 зарядов, рассвет 1к6+4. Последний заряд, 1 на к20: немагический боевой посох; сорока оживает и улетает.";
    } else if (id === "four-seasons") {
      opts.uses = uses(10, DAWN("1d6+2")); opts.magicalBonus = 2; Object.assign(flags, { focusCalendarSeason: 0, focusSeason: 0, focusSeasonUntil: 0 });
      for (const [index, [ru, , ...spells]] of FOCUS_SEASONS.entries()) {
        opts.acts.push(action(`calendar:${index}`, `В мире сейчас: ${ru.toLowerCase()}`, {}, { focusCalendarSeason: index + 1 }),
          action(`season:${index}`, `Облик на 8 часов: ${ru.toLowerCase()}`, { activation: "minute", activationValue: 10 }, { focusChooseSeason: index + 1 }));
        spells.forEach(([name, label], n) => linked(`${index}:${n}`, name, `${ru}: ${label}`, n + 1, {}, { focusSeasonSpell: index + 1 }));
      }
      opts.desc = "Настройка друидом, чародеем, колдуном или волшебником; боевой посох +2. Пока есть заряд, рукопашная атака посохом дополнительно наносит 1к8: весна — излучение, лето — огонь, осень — некротическая энергия, зима — холод. Сначала кнопкой укажите текущий сезон игрового мира. Сосредоточившись 10 минут, можно выбрать другой облик на 8 часов; затем автоматически используется установленный текущий сезон. Заклинания доступны только для действующего сезона: по 1/2/3 заряда в списке. Дополнительная кость зависит от сезона и оставшихся зарядов, не добавляется к метанию и заклинаниям отдельно от атаки посохом. Сезон игрового мира и его смену подтверждает Мастер. 10 зарядов, рассвет 1к6+2. Последний заряд, 1 на к20: немагический боевой посох.";
    } else if (id === "mustang") {
      opts.uses = uses(10, DAWN("1d6+4")); linked("steed", "Phantom Steed", "Призрачный скакун", 1);
      opts.acts.push(action("dash", "Командное слово: Рывок бонусным действием", { activation: "bonus", consume: [useSelf()] }, { griffonCommandWord: true }));
      opts.desc = "Требует настройки. Призрачный скакун за заряд либо командным словом за заряд Рывок бонусным действием. Дополнительный бюджет перемещения Рывка пока учитывайте вручную. 10 зарядов, рассвет 1к6+4. Последний заряд, 1 на к20: посох ломается и уничтожается.";
    }
    if (opts.uses && !["talyard", "rocborne"].includes(id)) flags.focusLastCharge = ruin(id);
    opts.desc += "\n\nЧтобы пользоваться магическими свойствами, отметьте предмет как экипированный и выполните настройку, если она требуется. Проверка последнего заряда выполняется при штатном расходе; уничтоженная запись остаётся с количеством 0 для возврата расхода, утратившая магию — как обычный предмет. Отмена расхода возвращает заряды и состояние; уже применённые последствия разрешайте отдельно.";
    if (baseName !== "staff") { const doc = griffonItem("GS1", en, id, opts); doc.system.type = structuredClone(native.system.type); continue; }
    const entry = bases.records.find(r => r.name === "staff").document;
    opts.acts.unshift(attack(`${key}:attack`, { name: "Атака посохом", activation: "action", range: 5, affects: "creature", includeBase: true, attackType: "", spellSlot: false }));
    const source = inventory.sources.find(s => s.id === "GS1").entries.find(e => e.name.endsWith(`[${en}]`));
    const doc = weaponTemplate({ ...opts, key: `item:${key}`, identifier: `griffon-${id}`, name: source.name.slice(0, source.name.lastIndexOf(" [")), en,
      book: "GS1", page: "", sourceUrl: source.url, baseItem: "quarterstaff", folder: folder("items", "Сумка грифона — книга 1/Посохи"),
      price: { rare: 4000, veryRare: 40000 }[rarity] + entry.system.price.value,
      priceNote: "Цена оценочная: редкость по правилам 2024 плюс стоимость базового посоха; в источнике цена не указана." });
    for (const field of ["type", "range", "damage", "mastery", "properties", "proficient", "ammunition"]) if (entry.system[field] !== undefined) doc.system[field] = structuredClone(entry.system[field]);
    doc.system.properties = [...new Set([...doc.system.properties, "mgc"])]; doc.system.weight.value = opts.weight;
    if (id === "reverent") { doc.system.damage.base.types = ["bludgeoning", "piercing", "slashing"]; doc.system.damage.versatile.types = ["bludgeoning", "piercing", "slashing"]; }
  }
}
