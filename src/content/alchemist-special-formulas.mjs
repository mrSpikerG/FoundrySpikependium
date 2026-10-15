import { feature, folder } from "../../tools/lib/docs.mjs";
import { attack, save, heal, utility, dmg, effect, change, useItem } from "../../tools/lib/core.mjs";
import { ALCHEMIST_URL, ALCHEMIST_SAVE_DC, alchemistBombActivity, alchemistSplashActivity } from "./alchemist-formulas.mjs";

export const ALCHEMIST_SPECIAL_FORMULAS = [
  { id: "pheromones", name: "Бомба с феромонами", specialty: "amorist", level: 2, save: "wis", fx: "charm", desc: "Не наносит урон. После попадания основная цель и остальные существа в обычном радиусе проходят Мудрость; провал — очарование вами до конца следующего хода цели либо получения урона. Бросок атаки оплачивает бомбу; испытание, допустимые цели и профиль применяйте отдельно. Срок до следующего хода контролируйте вручную." },
  { id: "painkiller", name: "Болеутоляющая бомба", specialty: "apothecary", level: 2, desc: "Без урона и взрыва. Попавшая бомба даёт на минуту временные хиты по обычному броску урона бомбы. Согласной цели атака не нужна: используйте кнопку временных хитов с расходом бомбы. Для несогласной цели сначала оплатите атаку, затем используйте отдельную кнопку временных хитов без повторного расхода. Общий для этой формулы интервал — 1 минута. Удаление оставшихся временных хитов по истечении минуты пока ручное." },
  { id: "shrapnel", name: "Бомба со шрапнелью", specialty: "mad-bomber", level: 2, die: 8, type: "piercing", save: "dex", radius: 10, desc: "К8 колющего урона, радиус 10 футов; остальное по обычной бомбе." },
  { id: "powder", name: "Пороховая бомба", specialty: "mad-bomber", level: 18, die: 12, type: "fire", save: "dex", desc: "Кости обычной бомбы заменены к12." },
  { id: "mystic", name: "Мистическая бомба", specialty: "dynamo-engineer", level: 6, die: 12, type: "force", save: "dex", extra: "1d12", desc: "К12 силового урона и одна дополнительная к12, как от реагента. Расходуются бомба и неиспользованный динамо-механизм. Списывается общий счётчик механизмов; конкретный настроенный механизм и его заклинание пока учитывайте вручную." },
  { id: "rational", name: "Рациональная бомба", specialty: "researcher", level: 2, die: 6, type: "fire", save: "dex", fullSplash: true, book: "EfC", desc: "К6 огня. Остальные существа в области получают полный исходный урон при провале Ловкости, половину при успехе. Взрыв берёт весь исходный результат оплаченного попадания; повторного броска костей нет." },
  { id: "venom", name: "Ядовитая бомба", specialty: "venomsmith", level: 2, die: 8, type: "poison", save: "con", fx: "physical-save", desc: "К8 яда, испытание Телосложения. Основная цель и провалившие испытание в области получают помеху к следующему испытанию Силы, Ловкости или Телосложения до конца следующего хода. Профиль применяется карточкой; после первого подходящего испытания снимите его вручную." },
  { id: "liquor", name: "Ликёрная бомба", specialty: "mixologist", level: 2, book: "TT", fx: "next-roll", desc: "Не наносит урон, без взрыва. Попадание даёт помеху следующей проверке характеристики, атаке или испытанию до начала вашего следующего хода. Не действует на иммунных к отравлению или опьянению. Профиль примените после попадания и снимите после первого броска; подходящий иммунитет и окончание проверяются вручную." },
  { id: "ooze", name: "Слизевая бомба", specialty: "ooze-rancher", level: 2, fx: "ooze", desc: "Без урона: существа в обычном радиусе покрываются слизью и не могут выполнять Рывок/Отход. Снять слизь можно галлоном воды либо действием. Профиль отмечает покрытие; запрет действий и очистка пока ручные." },
  { id: "paint", name: "Бомба с краской", specialty: "marksman", level: 2, book: "CAB", fx: "paint", desc: "Без урона: все в обычном радиусе покрываются ярко-розовой краской. Ваши проверки обнаружения/выслеживания этих целей с преимуществом. Краску смывает галлон воды. Профиль отмечает цель; контекст преимущества и смывание пока ручные." }
];

export function define() {
  for (const row of ALCHEMIST_SPECIAL_FORMULAS) {
    const key = `alchemist:special-formula:${row.id}`, effects = [], acts = [];
    const properties = {
      charm: { statuses: ["charmed"], expiry: "targetEnd", flags: { spikependium: { endsOnDamage: true } } },
      "physical-save": { expiry: "targetEnd", changes: ["str", "dex", "con"].map(a => change(`system.abilities.${a}.save.roll.mode`, -1)) },
      "next-roll": { expiry: "sourceStart", changes: ["system.rolls.ability.check.mode", "system.rolls.attack.mode", "system.rolls.ability.save.mode"].map(path => change(path, -1)) },
      ooze: {}, paint: {}
    }[row.fx];
    const fx = properties ? effect(key, { name: row.name, transfer: false, ...properties }) : null;
    if (fx) effects.push(fx);
    const costs = [useItem("feat:alchemist-bombs"), ...(row.id === "mystic" ? [useItem("feat:alchemist-dynamo-engineer-magic")] : [])];
    const flag = activity => {
      alchemistBombActivity(activity);
      if (row.id === "painkiller") activity.flags.spikependium.alchemistBomb.cooldown = 60;
      return activity;
    };
    for (const ability of ["str", "dex"]) {
      acts.push(flag(attack(`${key}:${ability}`, { name: `${row.name}: атака ${ability === "str" ? "Силой" : "Ловкостью"}`, activation: "action", ability, attackType: "ranged", range: 30,
        count: 1, affects: "creature", includeBase: false, damage: row.die ? [dmg(`@scale.alchemist.${row.die === 10 ? "bomb" : `bomb-d${row.die}`} + ${row.extra ? `${row.extra} + ` : ""}@abilities.int.mod`, row.type)] : [],
        consume: costs, spellSlot: false, effects: fx && row.die ? [fx._id] : [] })));
    }
    if (row.id === "painkiller") {
      acts.push(flag(heal(`${key}:willing`, { name: "Согласная цель: временные хиты", activation: "action", formula: "@scale.alchemist.bomb + @abilities.int.mod", temp: true, range: 30, count: 1, affects: "creature", consume: costs, spellSlot: false })),
        heal(`${key}:hit`, { name: "После оплаченного попадания: временные хиты", activation: "special", formula: "@scale.alchemist.bomb + @abilities.int.mod", temp: true, count: 1, affects: "creature", spellSlot: false }));
    } else if (row.die) {
      const splash = alchemistSplashActivity(save(`${key}:splash`, { name: "Взрыв: остальные цели", activation: "special", range: 90, affects: "creature", template: { type: "sphere", size: row.radius ?? 7.5 }, ability: row.save, dc: ALCHEMIST_SAVE_DC, onSave: row.fullSplash ? "half" : "none", spellSlot: false, effects: fx ? [fx._id] : [] }));
      if (row.fullSplash) splash.flags.spikependium.alchemistSplash = { fullDamage: true };
      acts.push(splash);
    } else if (row.save) acts.push(save(`${key}:save`, { name: "После попадания: испытание целей", activation: "special", range: 90, ability: row.save, dc: ALCHEMIST_SAVE_DC, affects: "creature", effects: fx ? [fx._id] : [], onSave: "none", spellSlot: false }));
    if (fx && !row.die && !row.save) acts.push(utility(`${key}:apply`, { name: "После попадания: применить профиль", activation: "special", affects: "creature", effects: [fx._id], spellSlot: false }));
    feature({ key, identifier: `alchemist-special-formula-${row.id}`, name: row.name, pack: "classes", folder: folder("classes", "Алхимик (Valda)/Формулы/Специализации"),
      book: row.book ?? "VSS", page: "", sourceUrl: ALCHEMIST_URL, img: "icons/tools/laboratory/vials-blue-pink", level: row.level, levelClass: "alchemist",
      requirements: "Отдельная формула соответствующей специализации", prerequisiteItems: [`subclass:alchemist-${row.specialty}`], acts, effects,
      desc: `${row.desc}\n\nФормула не входит в общий выбор. Бросок атаки/согласная цель расходует бомбу и общий лимит зарядки. При повреждающем взрыве выберите карточку исходного урона; основная цель повторно не поражается. Дальняя дистанция, условия формулы и применение профилей после верного исхода пока требуют проверки игроком.` });
  }
}
