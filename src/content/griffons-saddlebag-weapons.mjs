import bases from "../../tools/data/griffon-weapon-bases.json" with { type: "json" };
import inventory from "../../tools/data/external-content-inventory.json" with { type: "json" };
import { griffonItem } from "./griffons-saddlebag.mjs";
import { weaponTemplate, folder } from "../../tools/lib/docs.mjs";
import { attack, damage, dmg, effect, change, utility, save, check, uses, useSelf } from "../../tools/lib/core.mjs";

export const GRIFFON_WEAPONS = [
  ["Acidlight Ammunition", "acidlight", "rare", false], ["Phoenix Ammunition", "phoenix", "rare", false],
  ["Healing Ammunition", "healing-ammo", "uncommon", false], ["Void Ammunition", "void-ammo", "uncommon", false],
  ["Runic Ammunition", "runic-ammo", "rare", false], ["Torpedo Ammunition", "torpedo", "common", false],
  ["Fanfare Ammunition", "fanfare", "common", false], ["Frozen Dagger", "frozen-dagger", "uncommon", true],
  ["Basilisk Dagger", "basilisk-dagger", "rare", false], ["Bloodmage Dagger", "bloodmage-dagger", "veryRare", true],
  ["Purging Dagger", "purging-dagger", "veryRare", true], ["Spiderbite Daggers", "spiderbite", "rare", false]
];
const names = { arrow: "стрела", crossbowBolt: "арбалетный болт", firearmBullet: "пуля огнестрельного оружия", slingBullet: "пращная пуля", blowgunNeedle: "игла духовой трубки" };
const tag = (a, flags) => Object.assign(a, { flags: { spikependium: flags } });
const prices = { common: 100, uncommon: 400, rare: 4000, veryRare: 40000 };
const source = en => inventory.sources.find(s => s.id === "GS1").entries.find(e => e.name.endsWith(`[${en}]`));
export function define() {
  for (const [en, id, rarity, attuned] of GRIFFON_WEAPONS) {
    const key = `gs1:${id}`, opts = { rarity, effects: [], acts: [] };
    const action = (suffix, o = {}) => utility(`${key}:${suffix}`, { spellSlot: false, ...o });
    if (!id.includes("dagger") && id !== "spiderbite") {
      if (id === "acidlight") {
        const burning = effect(`${key}:burning`, { name: "Кислотный свет: горящий боеприпас", transfer: false, seconds: 60,
          flags: { spikependium: { griffonAcidlight: true } }, changes: [change("system.skills.ste.roll.mode", -1)] }); opts.effects.push(burning);
        opts.desc = "При попадании горит минуту: яркий свет в пространстве цели, тусклый ещё в 5 футах; в начале каждого хода цель получает 1к4 кислоты, Скрытность с помехой, преимущества Невидимого недоступны. Существо действием Использование может извлечь и погасить боеприпас. После выстрела вернуть его нельзя. Обычное оружие списывает одну единицу. При подтверждённом попадании связанной карточки модуль накладывает минутный профиль помехи Скрытности. При активном Мастере профиль автоматически наносит 1к4 кислоты в начале хода именно поражённого токена, со штатными сопротивлениями и минутным сроком. Повторная обработка/возврат инициативы не повторяет урон. Свет, преимущества невидимости и извлечение пока ручные; при извлечении удалите профиль с цели. Отдельный бросок — ручной резерв.";
        opts.acts.push(action("burning", { name: "При попадании: горящий кислотный свет", range: 600, count: 1, affects: "creature", effects: [burning._id] }),
          damage(`${key}:tick`, { name: "Начало хода цели: 1к4 кислоты", activation: "special", damage: [dmg("1d4", "acid")], spellSlot: false }));
      } else if (id === "phoenix") {
        opts.desc = "Магическая стрела/болт +1 к атаке и урону; колющий урон заменяется огненным. После выстрела возвращается в привязанный маленький колчан/футляр в начале вашего следующего хода. Бонусным действием командным словом можно воспламенить её: при выстреле в тот же ход +1к6 огня, но дальше 30 футов боеприпас сгорает до попадания; такой боеприпас возвращается немедленно. Модуль ведёт доступность, срок воспламенения, возвращение и тип/дополнительную кость в связанной карточке урона. Дистанция свыше 30 футов при доступных токенах блокирует весь урон горящей стрелы. Вне инициативы обычное возвращение происходит после 6 секунд мирового времени. Сам вместительный футляр (ещё до десяти стрел/болтов), связь с ним и появление через 24 часа после уничтожения вне антимагии пока учитываются вручную; документ с количеством 0 до возвращения не удаляйте.";
        opts.acts.push(tag(action("ignite", { name: "Командное слово: воспламенить до конца этого хода", activation: "bonus", self: true }), { griffonPhoenixIgnite: true, griffonCommandWord: true }));
      } else if (id === "healing-ammo") {
        opts.desc = "При попадании по другому существу обычный урон отсутствует: цель восстанавливает 2к4 + сумму ваших модификаторов Ловкости и Мудрости (прибавка минимум +1). По союзнику бросок атаки с преимуществом: включите его в штатном диалоге, подтвердив союз. Выберите этот боеприпас в обычном выстреле: модуль заменяет все части урона оружия одним лечебным броском без бонусов оружия, критического удвоения и урона других свойств. Лечение себя по связанной карточке блокируется. При попадании боеприпас уничтожается; после промаха возможность найти его решает Мастер, восстанавливая количество вручную.";
      } else if (id === "void-ammo") {
        opts.desc = "Колющий урон выстрела заменяется психическим с сохранением костей и обычных прибавок; другие типы урона не меняются. Выстрел и удар о поверхность беззвучны, заметных ран нет. После попадания или промаха исчезает. Выберите боеприпас в обычной атаке: тип базового колющего урона меняется автоматически, одна единица списывается и исчерпанная запись удаляется. Беззвучность и незаметность раны оцениваются по ситуации; это не общее преимущество Скрытности и не немота стрелка.";
      } else if (id === "runic-ammo") {
        opts.desc = "Магический боеприпас +1 к атакам и урону. Попадание по концентрирующейся цели даёт помеху испытанию для сохранения концентрации именно от этого попадания. Для испытания по связанной карточке урона помеха добавляется автоматически; несвязанное испытание отметьте вручную. Сразу после попадания боеприпас становится немагическим. Выстрел штатно списывает одну единицу; найденный после попадания добавляйте как обычный боеприпас, не возвращайте ему магическое свойство. Промах/поиск и превращение найденного снаряда в обычный пока учитывает Мастер.";
      } else if (id === "torpedo") {
        opts.desc = "Стрела/болт игнорирует обычные ограничения подводной стрельбы. В воздухе обычная и максимальная дальности оружия вдвое меньше. Штатный диалог оружия выбирает и расходует одну единицу. Подводный режим, помеху подводного боя и половинные дальности в воздухе проверяйте вручную: в системе нет универсального признака погружения цели/стрелка. Боеприпас не отменяет стен, укрытия, невидимость и прочие причины помехи.";
      } else {
        opts.desc = "При попадании обычный урон отсутствует: боеприпас исчезает и создаёт мгновенный выбранный звук от шёпота до крика. Слышащее существо без действия может распознать иллюзию проверкой Интеллекта (Расследование) СЛ 10. Выберите этот боеприпас в штатной атаке: расход работает, все части урона выстрела подавляются. Звук и слышимость разрешает Мастер; отдельная кнопка создаёт проверку распознавания. Это не автоматическое очарование/испуг и не универсальное преимущество отвлечения.";
        opts.acts.push(check(`${key}:recognize`, { name: "Слышащее существо: распознать звук, Расследование СЛ 10", activation: "special", ability: "int", associated: ["inv"], dc: "10", count: 1, affects: "creature", spellSlot: false }));
      }
      const selected = bases.records.filter(r => r.document.type === "consumable" && (!["phoenix", "torpedo"].includes(id) || ["arrow", "crossbowBolt"].includes(r.document.system.type.subtype)));
      for (const { document: base } of selected) {
        const subtype = base.system.type.subtype;
        const doc = griffonItem("GS1", en, `${id}-${subtype}`, { ...opts, consumableType: "ammo", category: `Боеприпасы/${source(en).name.split(" [")[0]}`,
          name: `${source(en).name.split(" [")[0]} — ${names[subtype]}`, en: undefined, img: base.img,
          price: Math.floor(prices[rarity] / (id === "phoenix" ? 1 : 2)), weight: base.system.weight.value,
          priceNote: `Цена оценочная за одну единицу: редкость 2024${id === "phoenix" ? "; возвращающийся предмет не получает скидку расходника" : ", половина цены из-за расходуемости"}.`,
          weightNote: "Вес одной единицы взят у обычного боеприпаса 2024 года.",
          uses: { max: "", autoDestroy: !["phoenix", "runic-ammo", "healing-ammo", "torpedo"].includes(id) },
          flags: { spikependium: { key: `item:gs1:${id}-${subtype}`, griffonAmmo: id } } });
        doc.system.type = structuredClone(base.system.type); doc.system.damage = structuredClone(base.system.damage);
        doc.system.magicalBonus = ["phoenix", "runic-ammo"].includes(id) ? 1 : null;
      }
      continue;
    }
    const base = bases.records.find(r => r.document.type === "weapon").document;
    const physical = attack(`${key}:attack`, { name: "Атака кинжалом", activation: "action", includeBase: true, count: 1, affects: "creature", spellSlot: false });
    opts.acts.push(physical);
    if (id === "frozen-dagger") {
      const paralyzed = effect(`${key}:ice`, { name: "Скован льдом: паралич", transfer: false, expiry: "targetEnd", statuses: ["paralyzed"] });
      const slow = effect(`${key}:slow`, { name: "Замёрзший кинжал: половина скорости", transfer: false, expiry: "targetEnd", changes: [change("system.attributes.movement.multiplier", 0.5, "multiply")] }); opts.effects.push(paralyzed, slow);
      opts.desc = "Кинжал с настройкой; вместо колющего наносит холод. При натуральной 20 цели нужно испытание Телосложения СЛ 12. Провал: Парализованный до конца следующего хода цели. Успех: до того же срока скорость вдвое меньше, если цель не иммунна к Парализованному. Есть обычная атака и отдельные кнопки испытания/успешного замедления с нативными сроками. Активный Мастер автоматически проверяет именно сохранённую натуральную 20, бросает испытание цели и применяет нужный профиль до конца следующего хода цели; иммунитет к параличу исключает и паралич, и замедление. Критический диапазон 19–20 не заменяет натуральную 20. Для старых/несвязанных карточек сохранены ручные кнопки.";
      opts.acts.push(save(`${key}:freeze`, { name: "Натуральная 20: Телосложение СЛ 12, провал — паралич", activation: "special", ability: "con", dc: 12, count: 1, affects: "creature", effects: [paralyzed._id], spellSlot: false }),
        tag(action("slow", { name: "Успех без иммунитета к параличу: половина скорости", count: 1, affects: "creature", effects: [slow._id] }), { griffonFrozenSlow: true }));
    } else if (id === "basilisk-dagger") {
      physical.damage.parts.push(dmg("1d4", "poison"));
      const restrained = effect(`${key}:stone`, { name: "Кинжал василиска: опутан", transfer: false, expiry: "sourceEnd", statuses: ["restrained"] }); opts.effects.push(restrained);
      opts.desc = "Обычный кинжал с дополнительными 1к4 яда при каждом попадании. Натуральная 20 по существу Большого размера или меньше: Телосложение СЛ 15; провал — Опутанный до конца вашего следующего хода. Дополнительная часть урона включена в штатную атаку. При активном Мастере исходная натуральная 20 и размер цели проверяются автоматически, затем выполняется штатное испытание и применяется Опутанный при провале с окончанием в конце вашего следующего хода. Ручная кнопка оставлена для несвязанных/старых карточек.";
      opts.acts.push(save(`${key}:stone`, { name: "Натуральная 20, размер не больше Большого: Телосложение СЛ 15", activation: "special", ability: "con", dc: 15, count: 1, affects: "creature", effects: [restrained._id], spellSlot: false }));
    } else if (id === "bloodmage-dagger") {
      opts.uses = uses(5, { period: "dusk", type: "formula", formula: "1d3 + 2" });
      opts.desc = "Кинжал +1, фокусировка, настройка заклинателем; 5 зарядов, в сумерках восстанавливается 1к3+2. Держа кинжал, действием Магии за заряд совершите ближнюю атаку заклинанием по видимому живому существу в 5 футах: 3к6 некротического + заклинательная характеристика. Восстанавливаете хиты по фактически нанесённому некротическому урону, кроме урона конструкту, растению или нежити. Отдельная атака расходует заряд; при штатном применении её урона модуль лечит владельца с учётом сопротивлений цели и без повторного лечения от одной карточки. Видимость и допустимость живой цели проверьте сами; отмену уже применённого лечения исправляйте вручную. Второе свойство: при сотворении за ячейку 1–3 по себе/одному существу можно потратить заряды и столько же Костей хитов; каждый заряд повышает круг на 1, максимум до 5. Бросьте потраченные кости: сумма — некротический урон себе, игнорирующий иммунитет и сопротивление. При снижении до 0 заклинание проваливается. Это повышение, выбор/расход костей, самоповреждение и отмена заклинания пока выполняются вручную.";
      // Явный выбор поддерживает и заклинателей от вида/черты без класса с магией.
      for (const [ability, label] of [["int", "Интеллект"], ["wis", "Мудрость"], ["cha", "Харизма"]])
        opts.acts.push(tag(attack(`${key}:drain:${ability}`, { name: `Багровый кинжал: ${label}, ваша заклинательная характеристика`, activation: "action", classification: "spell", ability, range: 5, count: 1, affects: "creature", includeBase: false, damage: [dmg("3d6 + @mod", "necrotic")], spellSlot: false, consume: [useSelf()] }), { griffonBloodDrain: true }));
    } else if (id === "purging-dagger") {
      physical.damage.parts.push(dmg("1d4", "radiant"));
      opts.effects.push(effect(`${key}:embedded`, { name: "Очищающий кинжал оставлен в нежити", transfer: false, flags: { spikependium: { griffonPurgingEmbedded: true } } }));
      opts.desc = "Кинжал +1; при попадании +1к4 лучистого, по нежити вместо этого +2к4. Связанная карточка урона автоматически выбирает 2к4, если все указанные цели — нежить; смешанные и неуказанные цели разделяйте вручную. При натуральной 20 по нежити можно оставить клинок в ней: солнечный свет 15/ещё 15 футов и 3к4 лучистого в начале каждого её хода. Существо в 5 футах может действием пройти Силу (Атлетику) СЛ 16 и извлечь кинжал; после этого он появляется у ваших ног/в свободной руке. В карточке подходящего попадания есть кнопка «Оставить клинок в цели»: выбор владельца запускает профиль на нежити и блокирует повторные атаки этим кинжалом. При активном Мастере 3к4 автоматически наносится в начале ходов именно поражённого токена. После успешной Атлетики вручную удалите профиль: кинжал снова доступен, метательный экземпляр возвращается в количество один раз. Солнечный свет, сама попытка/расход действия извлечения, свободная рука/положение на земле и перенос между сценами пока ручные.";
      opts.acts.push(damage(`${key}:tick`, { name: "Начало хода пронзённой нежити: 3к4 лучистого", activation: "special", damage: [dmg("3d4", "radiant")], spellSlot: false }), check(`${key}:remove`, { name: "Извлечь клинок: Атлетика СЛ 16", activation: "action", ability: "str", associated: ["ath"], dc: "16", range: 5, count: 1, affects: "creature", spellSlot: false }));
    } else {
      const poisoned = effect(`${key}:poisoned`, { name: "Паучий укус: отравлен", transfer: false, expiry: "targetEnd", statuses: ["poisoned"] }); opts.effects.push(poisoned);
      opts.desc = "Пара отдельных кинжалов. Если в свой ход попали обоими по одному существу, цель проходит Телосложение СЛ 13. Провал: ещё 2к4 яда и Отравленный до конца следующего хода цели; успех без дополнительного урона и состояния. В библиотеке есть левый и правый кинжал с обычными атаками. Активный Мастер сопоставляет сохранённые попадания левым и правым кинжалами по одному токену в ваш ход; пара вызывает штатное испытание, 2к4 яда и профиль только при провале. Каждое попадание входит в одну пару: четыре подходящих попадания могут дать две пары, а одиночный удар не даёт яд. Свой ход и момент атаки берутся из сохранённого броска; реакции в чужой ход не считаются. Отдельная кнопка — ручной резерв. Цена каждого — половина оценочной цены пары.";
      opts.acts.push(save(`${key}:bite`, { name: "Оба кинжала попали в свой ход: Телосложение СЛ 13", activation: "special", ability: "con", dc: 13, count: 1, affects: "creature", damage: [dmg("2d4", "poison")], onSave: "none", effects: [poisoned._id], spellSlot: false }));
    }
    for (const side of id === "spiderbite" ? ["left", "right"] : [""]) {
      const docKey = `item:gs1:${id}${side ? `-${side}` : ""}`, entry = source(en);
      const doc = weaponTemplate({ ...opts, key: docKey, identifier: `griffon-${id}${side ? `-${side}` : ""}`, book: "GS1", sourceUrl: entry.url, page: "", baseItem: "dagger", attunement: attuned ? "required" : "",
        name: `${entry.name.split(" [")[0]}${side ? ` — ${side === "left" ? "левый" : "правый"}` : ""}`, img: base.img,
        folder: folder("items", "Сумка грифона — книга 1/Оружие/Кинжалы"), price: (prices[rarity] + (side ? 4 : 2)) / (side ? 2 : 1),
        priceNote: `Цена оценочная: редкость 2024 плюс базовый кинжал${side ? ", половина цены пары" : ""}.`, weight: 1, weightNote: "Вес по обычному кинжалу 2024 года: 1 фунт.",
        flags: { spikependium: { key: docKey, griffonWeapon: id, ...(id === "bloodmage-dagger" ? { griffonSpellcaster: true } : {}) } } });
      for (const field of ["type", "range", "damage", "mastery", "properties", "weight", "proficient"]) doc.system[field] = structuredClone(base.system[field]);
      doc.system.properties = [...new Set([...doc.system.properties, "mgc", ...(id === "bloodmage-dagger" ? ["foc"] : [])])];
      doc.system.magicalBonus = ["purging-dagger", "bloodmage-dagger"].includes(id) ? 1 : null;
      if (id === "frozen-dagger") doc.system.damage.base.types = ["cold"];
    }
  }
}
