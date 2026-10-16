import { advItemGrant, advTrait, cast, spellConfig, srdSpellUuid, utility, teleport, save, effect, form, LR, useActivity } from "../../tools/lib/core.mjs";
import { feat, spell, folder, ref } from "../../tools/lib/docs.mjs";
const URL = "https://ruleholder.com/sourcebooks/au/varianty-dlya-personazhey";

export function define() {
  const F = folder("feats", "Неудержимая магия/Происхождение");
  const charm = effect("spell:friends:charmed", { name: "Дружба: очарование", transfer: false, seconds: 60,
    statuses: ["charmed"], flags: { spikependium: { endsOnDamage: true, friendsCharm: true } } });
  spell({ key: "spell:friends", identifier: "friends", name: "Дружба", book: "PHB24", page: "",
    sourceUrl: "https://next.dnd.su/spells/10523-friends/", folder: folder("spells", "Заговоры"),
    img: "icons/skills/social/diplomacy-handshake-yellow", level: 0, school: "enc", range: 10, components: "СМ", materials: "немного грима",
    duration: "minute", durationValue: 1, concentration: true, effects: [charm],
    desc: "Видимое существо в пределах 10 футов совершает спасбросок Мудрости: при провале оно очаровано на время концентрации, до 1 минуты. Не-гуманоид, участник сражения с вами и цель вашего предыдущего применения за последние 24 часа проходят спасбросок автоматически. Урон цели, ваша атака, нанесение вами урона или принуждение кого-либо к спасброску досрочно прекращают заклинание. По окончании цель узнаёт, что была очарована вами.\n\n**Применение.** Спасбросок, концентрация и состояние настроены штатно. Урон цели снимает эффект. Остальные причины досрочного окончания и ограничение 24 часов пока проверяйте вручную; завершите концентрацию на листе заклинателя.",
    acts: [save("spell:friends:save", { name: "Дружба — спасбросок Мудрости", ability: "wis", affects: "creature", count: 1,
      effects: [{ _id: charm._id, onSave: false }] })] });

  const dodge = effect("au:arcane-infiltrator:dodge", { name: "Уклонение", transfer: false, expiry: "sourceStart", statuses: ["dodging"],
    flags: { spikependium: { endsOnIncapacitated: true, arcanaDodge: true } } });
  feat({ key: "feat:arcane-infiltrator", identifier: "arcane-infiltrator", name: "Мистический лазутчик", subtype: "origin", folder: F,
    book: "AU", page: "", sourceUrl: URL, img: "icons/magic/defensive/illusion-evasion-echo-purple", effects: [dodge],
    desc: "Вы изучаете [[Дружба|Дружбу]] и выбираете для неё Интеллект, Мудрость или Харизму.\n\n**Хитрый отвлекающий манёвр.** Уклонение доступно бонусным действием число раз, равное бонусу владения, с восстановлением после долгого отдыха. Польза Уклонения действует до начала следующего вашего хода и теряется при недееспособности или скорости 0.\n\n**Применение.** Заклинательная характеристика выбирается штатным шагом. Уклонение применяет штатное состояние и расходует применение; эффект можно отключить на вкладке эффектов.",
    advancement: [advItemGrant("au:arcane-infiltrator:cantrip", 0, [ref("spell:friends")], { title: "Дружба: заклинательная характеристика",
      spell: spellConfig({ abilities: ["int", "wis", "cha"] }) })],
    acts: [form("au:arcane-infiltrator:dodge", { name: "Хитрый отвлекающий манёвр: Уклонение", activation: "bonus", effects: [dodge._id],
      usesMax: "@prof", usesRecovery: [LR], consume: [useActivity()], spellSlot: false })] });

  const freeFamiliar = cast("au:familiar-friend:cast", srdSpellUuid("Find Familiar"), { name: "Призыв фамильяра без ячейки и материалов", level: 1,
    spellbook: false, spellSlot: false, properties: ["vocal", "somatic"], usesMax: 1, usesRecovery: [LR], consume: [useActivity()] });
  freeFamiliar.flags = { spikependium: { originGrantedAbility: true } };
  const help = utility("au:familiar-friend:help", { name: "Друг-помощник", activation: "special", self: true,
    usesMax: "@prof", usesRecovery: [LR], consume: [useActivity()], spellSlot: false });
  help.flags = { spikependium: { familiarHelp: true } };
  feat({ key: "feat:familiar-friend", identifier: "familiar-friend", name: "Друг фамильяра", subtype: "origin", folder: F,
    book: "AU", page: "", sourceUrl: URL, img: "icons/creatures/mammals/spirit-deer-herd-blue",
    desc: "**Верный спутник.** [[Поиск фамильяра|Призыв фамильяра]] всегда подготовлен. Выберите Интеллект, Мудрость или Харизму. Один раз до следующего долгого отдыха его можно сотворить без ячейки и материальных компонентов; обычное сотворение ячейками остаётся доступным.\n\n**Укреплённый фамильяр.** При сотворении максимум и текущие хиты фамильяра увеличиваются на удвоенный уровень персонажа.\n\n**Друг-помощник.** Для проверки с навыком, которым вы владеете, фамильяр в пределах 5 футов может дать преимущество. Число применений равно бонусу владения; все возвращаются после долгого отдыха.\n\n**Применение.** Штатный призыв добавляет хиты создаваемому фамильяру. В окне проверки выберите фамильяра: проверяются владение навыком и расстояние, применение расходуется вместе с подтверждённым броском и входит в его штатную отмену расхода. Отмена окна не тратит применение.",
    advancement: [advItemGrant("au:familiar-friend:spell", 0, [srdSpellUuid("Find Familiar")], { title: "Призыв фамильяра: заклинательная характеристика",
      spell: spellConfig({ abilities: ["int", "wis", "cha"] }) })], acts: [freeFamiliar, help] });

  const step = teleport("au:portal-hopper:step", { name: "Шаг сквозь портал", distance: 15, activation: "special", spellSlot: false,
    condition: "Потратьте 15 футов перемещения; не чаще одного раза за ход. Выберите видимое свободное место.", usesMax: "@prof", usesRecovery: [LR], consume: [useActivity()] });
  step.flags = { spikependium: { oncePerTurn: true, group: "portal-hopper" } };
  feat({ key: "feat:portal-hopper", identifier: "portal-hopper", name: "Прыгающий через порталы", subtype: "origin", folder: F,
    book: "AU", page: "", sourceUrl: URL, img: "icons/magic/movement/portal-vortex-orange",
    desc: "**Потусторонняя стойкость.** Выберите сопротивление некротическому урону, излучению или психической энергии.\n\n**Шаг сквозь портал.** Потратив 15 футов перемещения, телепортируйтесь в видимое свободное место в пределах 15 футов. Число применений равно бонусу владения, не чаще одного раза за ход; восстановление после долгого отдыха.\n\n**Применение.** Сопротивление выбирается штатным шагом и применяется автоматически. Действие расходует применение, ограничено разом за ход в активном бою и открывает штатное планирование телепортации. Доступные 15 футов перемещения, их расход и видимость места пока подтвердите вручную. Отмена самого планирования после использования не возвращает уже оплаченное применение: используйте штатную отмену расхода в карточке.",
    advancement: [advTrait("au:portal-hopper:resistance", 0, { title: "Потусторонняя стойкость", choices: [{ count: 1, pool: ["dr:necrotic", "dr:radiant", "dr:psychic"] }] })], acts: [step] });
}
