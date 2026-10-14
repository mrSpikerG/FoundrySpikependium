// Энциклопедия чудовищ (2025), перевод Adventure Guys: печатные страницы статблоков.
import { attack, cast, damage, dmg, effect, heal, LR, save, srdSpellUuid, useActivity, utility } from "../../tools/lib/core.mjs";
import { folder, npc, ref, rollTable } from "../../tools/lib/docs.mjs";

const body = {
  book: "MM25", page: 10, size: "med", creatureType: "elemental", alignment: "Нейтральный", disposition: 0,
  img: "icons/creatures/birds/raptor-hawk-flying.webp", movement: { walk: 20, fly: 50 },
  languages: ["auran", "aarakocra"], habitat: [{ type: "mountain" }, { type: "planar", subtype: "Стихийный план Воздуха" }],
  treasure: ["armaments", "individual"],
  bio: "<h2>Ааракокра — крылатые защитники неба</h2><p>Среда обитания: Горы, Планы (Стихийный план Воздуха). Сокровища: Инвентарь, Личные.</p>"
    + "<p>Ааракокры — крылатый народ, который парит в небесах бесчисленных миров и бескрайних просторах Стихийного плана Воздуха. Их внешность обычно напоминает птиц, распространённых в тех краях, где они обитают. Некоторые напоминают ястребов или кондоров, другие же похожи на колибри или археоптериксов. Во многих землях ааракокры рассказывают о славных древних временах, когда они сражались с проклятой Королевой Хаоса бок о бок с таинственными Воздушными герцогами Ааки.</p>"
};

export function define() {
  const f = folder("creatures", "Энциклопедия чудовищ (2025)", { sort: 3000 });
  const tentacleGrab = effect("mm25:aboleth:grapple", { name: "Схвачен щупальцем аболета", statuses: ["grappled"], transfer: false });
  const dominated = effect("mm25:aboleth:dominated", { name: "Порабощение разумом аболета", statuses: ["charmed"], transfer: false,
    flags: { spikependium: { monsterEffect: "aboleth-dominate" } },
    description: "Союзник аболета; под его контролем в пределах 60 футов. Телепатическая связь на любом расстоянии. Эффект заканчивается при смерти аболета, переходе на другой план или успешном повторном спасброске Мудрости Сл 16 после урона либо за 1 милю (не чаще раза в 24 часа для удаления)." });
  const cursed = effect("mm25:aboleth:curse", { name: "Проклятие слизистого облака", statuses: ["cursed"], transfer: false,
    flags: { spikependium: { monsterEffect: "aboleth-curse", abolethCurseDamage: damage("mm25:aboleth:curse-tick", {
      name: "Проклятие аболета: кислотный урон", activation: "", self: true, spellSlot: false, damage: [dmg("1d12", "acid")] }) } },
    description: "Склизкая прозрачная кожа, дыхание воздухом и водой. Восстанавливать ПЗ можно только под водой. Вне воды в конце каждых 10 минут: 1к12 кислотой, если кожа не была увлажнена. Снятие проклятия завершает эффект." });
  const abolethMulti = utility("mm25:aboleth:multiattack", { name: "Мультиатака", activation: "action", spellSlot: false });
  const waterState = utility("mm25:aboleth:water-state", { name: "Вода и увлажнение кожи", activation: "", self: true, spellSlot: false });
  waterState.flags = { spikependium: { abolethWaterControls: true } };
  abolethMulti.flags = { spikependium: { multiattack: { weapon: "aboleth-tentacle", count: 2,
    finishers: ["aboleth-consume-memories", "aboleth-dominate-mind"] } } };
  const lash = utility("mm25:aboleth:lash", { name: "Бич", activation: "legendary", spellSlot: false,
    condition: "Сразу после окончания хода другого существа" });
  lash.flags = { spikependium: { multiattack: { weapon: "aboleth-tentacle", count: 1 } } };
  const memories = activation => save(`mm25:aboleth:memories:${activation}`, { name: activation === "legendary" ? "Психическое истощение" : "Поглощение воспоминаний",
    activation, ability: "int", dc: 16, range: 30, affects: "creature", count: 1, spellSlot: false,
    ...(activation === "legendary" ? { condition: "Сразу после окончания хода другого существа" } : {}), damage: [dmg("3d6", "psychic")] });
  const consume = memories("action"), drain = memories("legendary");
  consume.flags = { spikependium: { monsterAction: "aboleth-memories" } };
  drain.flags = { spikependium: { monsterAction: "aboleth-drain" } };
  const dominate = save("mm25:aboleth:dominate", { name: "Порабощение разума", activation: "action", ability: "wis", dc: 16,
    range: 30, affects: "creature", count: 1, spellSlot: false, effects: [{ _id: dominated._id, onSave: false }] });
  dominate.flags = { spikependium: { monsterAction: "aboleth-dominate" } };
  const mucus = save("mm25:aboleth:mucus", { name: "Облако слизи", activation: "turnEnd", ability: "con", dc: 14,
    rangeUnits: "self", affects: "creature", template: { type: "radius", size: 5 }, spellSlot: false, effects: [{ _id: cursed._id, onSave: false }] });
  mucus.flags = { spikependium: { monsterAction: "aboleth-curse" } };
  const waterPoison = effect("mm25:aboleth:water-poison", { name: "Загрязнённая вода логова", statuses: ["poisoned"], seconds: 3600, transfer: false,
    flags: { spikependium: { monsterEffect: "aboleth-water-poison" } } });
  const poison = save("mm25:aboleth:water", { name: "Выпить загрязнённую воду", activation: "", ability: "con", dc: 15,
    affects: "creature", count: 1, spellSlot: false, duration: "hour", durationValue: 1, effects: [{ _id: waterPoison._id, onSave: false }] });
  poison.flags = { spikependium: { monsterAction: "aboleth-water-poison" } };
  const projection = cast("mm25:aboleth:project-image", srdSpellUuid("Project Image"), { name: "Псионическая проекция",
    ability: "int", properties: [], spellbook: false, spellSlot: false, activation: "action", range: 1, rangeUnits: "mi" });
  projection.flags = { spikependium: { monsterAction: "aboleth-projection" } };
  const aboleth = npc({ key: "actor:mm25:aboleth", name: "Аболет", en: "Aboleth", book: "MM25", page: 12, folder: f,
    img: "icons/creatures/eyes/humanoid-single-blind.webp", size: "lg", tokenSize: 2, creatureType: "aberration", alignment: "Принципиальная злая", disposition: -1,
    ac: 17, hp: 150, hpFormula: "20d10+40", cr: 10, initiativeBonus: "@prof * 2", spellcasting: "int", movement: { walk: 10, swim: 40 },
    abilities: { str: 21, dex: 9, con: 15, int: 18, wis: 15, cha: 18 }, saves: ["dex", "con", "int", "wis"], skills: { prc: 2, his: 2 },
    senses: { darkvision: 120 }, languages: ["deep"], telepathy: 120, habitat: [{ type: "underwater" }, { type: "underdark" }], treasure: ["relics"],
    resources: { legact: { max: 3, spent: 0 }, legres: { max: 3, spent: 0 }, lair: { value: true, initiative: null, inside: false } },
    bio: "<h2>Неподвластный времени инопланетный кукловод</h2><p>Среда обитания: Подводный мир, Подземье. Сокровища: Реликвии. Описание: страница 11; логово и статблок: страница 12.</p>"
      + "<p>В океанских глубинах аболеты видят сны о погибших империях и плетут многовековые интриги. Их амфибийная физиология, ментальное подавление и отвратительная инфекция позволяют превращать жертв в водных слуг. Они помнят противоречивые и невозможные империи древнейших эпох. Их утончённое мышление чуждо смертным.</p>"
      + "<p>Аболеты скрываются в развалинах подводных империй, источниках едкой слизи и на границе реальности. Они собирают толпы порабощённых слуг, подчиняют разум жертв и готовятся восстановить древнюю власть. Их цели можно выбрать или определить броском [[/r 1d6]].</p>"
      + "<table><tr><th>1к6</th><th>Замысел аболета</th></tr><tr><td>1</td><td>Осуществить непостижимый план, действуя будто случайно.</td></tr>"
      + "<tr><td>2</td><td>Узнать больше о мире, похищая существ и поглощая их разум.</td></tr><tr><td>3</td><td>Телепатически манипулировать выходцами из укромного места, заставляя их поклоняться себе как богу.</td></tr>"
      + "<tr><td>4</td><td>Открыть врата в далёкое прошлое или будущее и начать вторжение из другого времени.</td></tr><tr><td>5</td><td>Призвать драконовую черепаху, кракена или другое морское чудовище, чтобы затопить прибрежный город.</td></tr>"
      + "<tr><td>6</td><td>Посулами сокровищ заставить охотников вернуть реликвии давно павшей империи.</td></tr></table>"
      + "<h3>Логово аболета</h3><p>Затопленные развалины и пещеры с отдельными сухими помещениями для слуг и сокровищ. При смерти аболета или переносе логова региональные эффекты сразу исчезают.</p>"
      + "<p>Включите штатное поле «В логове» на листе: лимиты легендарных действий и устойчивости увеличатся с 3 до 4; опыт — с 5900 до 7200. Это открывает Псионическую проекцию и Загрязнённую воду.</p>",
    items: [
      { name: "Амфибия", desc: "Аболет может дышать воздухом и водой. Откройте «Вода и увлажнение кожи», выберите токен и отметьте нахождение под водой или вне воды. Те же кнопки на карточке Облака слизи позволяют отметить состояние пострадавшего существа и увлажнение его кожи.", acts: [waterState] },
      { name: "Зондирующая телепатия", desc: "Если видимое аболету существо общается с ним телепатически, аболет узнаёт его самые большие желания." },
      { name: "Легендарная устойчивость", system: { identifier: "legendary-resistance" },
        desc: "3 применения в день, 4 в логове. При провале спасброска аболет может выбрать успех. Используйте штатную кнопку Легендарной устойчивости на карточке проваленного спасброска: она одновременно расходует счётчик и меняет результат на успех." },
      { name: "Облако слизи", system: { identifier: "aboleth-mucus" }, effects: [cursed],
        desc: "Под водой аболет окружён слизью. В конце его хода каждое существо в 5-футовой Эманации совершает спасбросок Выносливости Сл 14. При провале цель проклята: прозрачная склизкая кожа, дыхание воздухом и водой, восстановление ПЗ только под водой. Перед использованием отметьте аболета под водой в карточке «Вода и увлажнение кожи». В бою активный Мастер автоматически получает карточку облака и спасброски целей: учитываются дистанция, стены и полное укрытие, союзники включаются, сам аболет исключается. Повторное воздействие не сбрасывает уже действующее проклятие. На карточке Облака слизи выберите пострадавший токен и отметьте его состояние воды. Пока у проклятой цели не выбрано «Под водой», восстановление хитов блокируется; временные хиты разрешены. Вне воды автоматически применяется 1к12 кислотой в конце каждых 10 минут. Кнопка «Увлажнить кожу цели» защищает текущий десятиминутный интервал, если нажата до его окончания. Вход под воду прерывает сухой интервал; после выхода отсчёт начинается заново. При сбое используется уже созданная карточка и метка применения хитов; карточка не наносит тот же урон повторно.",
        acts: [mucus, damage("mm25:aboleth:curse-damage", { name: "Проклятие: урон вне воды", activation: "", spellSlot: false, affects: "creature", count: 1, damage: [dmg("1d12", "acid")] })] },
      { name: "Потустороннее восстановление", desc: "Спустя 5к10 дней после уничтожения тела аболет возрождается со всеми ПЗ в Дальнем Пределе или другом месте, выбранном Мастером.",
        acts: [utility("mm25:aboleth:restoration", { name: "Дни до нового тела", activation: "", spellSlot: false, roll: "5d10" })] },
      { name: "Мультиатака", desc: "Две атаки Щупальцем, затем Поглощение воспоминаний или Порабощение разума, если действие доступно.", acts: [abolethMulti] },
      { name: "Щупальце", type: "weapon", effects: [tentacleGrab], flags: { spikependium: { monsterGrapple: { dc: 14, reach: 15, maxSize: "lg", limit: 4 } } },
        desc: "Бросок атаки в ближнем бою: +9, досягаемость 15 футов. Попадание: 2к6 + 5 дробящего урона. Существо не больше Крупного схвачено одним из четырёх щупалец (Сл высвобождения 14).",
        system: { identifier: "aboleth-tentacle", type: { value: "natural", baseItem: "" }, proficient: 1, equipped: true, identified: true, quantity: 1,
          weight: { value: 0, units: "lb" }, price: { value: 0, denomination: "gp" }, range: { value: null, long: null, reach: 15, units: "ft" }, damage: { base: dmg("2d6", "bludgeoning") } },
        acts: [attack("mm25:aboleth:tentacle", { name: "Щупальце", activation: "action", ability: "str", range: 15, affects: "creature", count: 1, spellSlot: false })] },
      { name: "Поглощение воспоминаний", system: { identifier: "aboleth-consume-memories" },
        desc: "Одно существо, схваченное или очарованное именно этим аболетом, в пределах 30 футов: спасбросок Интеллекта Сл 16, 3к6 психического урона при провале, половина при успехе. Если этим действием ПЗ Гуманоида уменьшены до 0, аболет получает его воспоминания.", acts: [consume] },
      { name: "Порабощение разума", system: { identifier: "aboleth-dominate-mind" }, uses: { max: "2", spent: 0, recovery: [{ period: "day", type: "recoverAll" }] }, effects: [dominated],
        desc: "Дважды в день. Видимое существо в пределах 30 футов: спасбросок Мудрости Сл 16. Провал: Очаровано до смерти аболета или перехода на другой план. Оно действует как союзник аболета и находится под его контролем в пределах 60 футов; телепатическая связь действует на любом расстоянии. После каждого применения урона автоматически повторяет спасбросок; ещё один — за каждые сутки, проведённые не ближе 1 мили от аболета. Успех завершает эффект. Для дальнего отсчёта оба токена должны находиться на одной сцене с измеримой сеткой. Смену плана, расстояния между разными сценами и управление союзником разрешает Мастер. Если спасбросок отменён или карточка не создана из-за сбоя, проверьте историю чата и разрешите проверку вручную; модуль не делает слепой повтор.",
        acts: [Object.assign(dominate, { consumption: { ...dominate.consumption, targets: [{ type: "itemUses", target: "", value: "1", scaling: {} }] } })] },
      { name: "Бич", desc: "Легендарное действие (1 использование), сразу после хода другого существа: одна атака Щупальцем. Не расходует обычное действие.", acts: [lash] },
      { name: "Психическое истощение", system: { identifier: "aboleth-psychic-drain" },
        desc: "Легендарное действие (1 использование), сразу после хода другого существа. Если есть существо, Очарованное или Схваченное этим аболетом, он использует Поглощение воспоминаний и восстанавливает 1к10 ПЗ. Лечение открывается отдельной штатной карточкой на самого аболета.",
        acts: [drain, heal("mm25:aboleth:drain-heal", { name: "Восстановление аболета", formula: "1d10", activation: "", self: true, spellSlot: false })] },
      { name: "Загрязнённая вода", system: { identifier: "aboleth-water" }, effects: [waterPoison],
        desc: "Источники воды в пределах 1 мили от логова загрязнены. Существо, выпившее воду, кроме аболета и его союзников, совершает спасбросок Выносливости Сл 15; при провале Отравлено 1 час. При смерти аболета или переносе логова региональный эффект исчезает.", acts: [poison] },
      { name: "Псионическая проекция", system: { identifier: "aboleth-projection" },
        desc: "В логове аболет неограниченно творит Проекцию образа без компонентов, используя Интеллект (Сл 16); дистанция 1 миля. Он может использовать телепатию из места иллюзии. При смерти аболета или переносе логова региональный эффект исчезает.", acts: [projection] }
    ] });
  const houndMulti = utility("mm25:hell-hound:multiattack", { name: "Мультиатака", activation: "action", spellSlot: false });
  houndMulti.flags = { spikependium: { multiattack: { weapon: "hell-hound-bite", count: 2 } } };
  npc({ key: "actor:mm25:hell-hound", name: "Адская гончая", en: "Hell Hound", book: "MM25", page: 13, folder: f,
    img: "icons/creatures/abilities/dragon-fire-breath-orange.webp", size: "med", creatureType: "fiend", alignment: "Принципиальная злая", disposition: -1,
    ac: 15, hp: 58, hpFormula: "9d8+18", cr: 3, movement: { walk: 50 },
    abilities: { str: 17, dex: 12, con: 14, int: 6, wis: 13, cha: 6 }, skills: { prc: 2 }, di: ["fire"], senses: { darkvision: 60 },
    languages: ["infernal"], languagesCustom: "Понимает, но не говорит", habitat: [{ type: "mountain" }, { type: "planar", subtype: "Нижние планы" }, { type: "underdark" }],
    bio: "<h2>Неумолимые стражи Нижних планов</h2><p>Среда обитания: Горы, Планы (Нижние планы), Подземье. Сокровища: нет.</p>"
      + "<p>Адские гончие порождены Ахероном, Геенной и Девятью Преисподними. Они стерегут души и служат жестоким повелителям, не позволяя пленникам укрыться от возмездия. На Материальном плане они часто служат огненным великанам или культистам, разделяющим их нрав. Они подчиняются другим существам, пока те позволяют охотиться и убивать, но восстают против хозяев, обращающихся с ними как с обычными собаками.</p>"
      + "<p>Их нюх превосходит собачий. Гончие выслеживают добычу и нападают стаями из засады. Они наслаждаются криками сожжённых жертв и продлевают последние мгновения охоты.</p>",
    items: [
      { name: "Тактика стаи", system: { identifier: "hell-hound-pack-tactics" }, flags: { spikependium: { packTactics: true } },
        desc: "Гончая совершает бросок атаки по существу с Преимуществом, если хотя бы один её союзник находится в пределах 5 футов от цели и не Выведен из строя. На сцене союзники определяются по одинаковой ненейтральной принадлежности токенов. При иной принадлежности выберите Преимущество в обычном окне броска." },
      { name: "Мультиатака", desc: "Гончая совершает две атаки Укусом.", acts: [houndMulti] },
      { name: "Укус", type: "weapon", desc: "Бросок атаки в ближнем бою: +5, досягаемость 5 футов. Попадание: 1к8 + 3 колющего урона и 1к6 урона огнём.",
        system: { identifier: "hell-hound-bite", type: { value: "natural", baseItem: "" }, proficient: 1, equipped: true, identified: true,
          quantity: 1, weight: { value: 0, units: "lb" }, price: { value: 0, denomination: "gp" },
          range: { value: null, long: null, reach: 5, units: "ft" }, damage: { base: dmg("1d8", "piercing") } },
        acts: [attack("mm25:hell-hound:bite", { name: "Укус", activation: "action", ability: "str", range: 5, count: 1, affects: "creature", spellSlot: false, damage: [dmg("1d6", "fire")] })] },
      { name: "Огненное дыхание", img: "icons/creatures/abilities/dragon-fire-breath-orange.webp",
        desc: "Перезарядка 5–6. Каждое существо в 15-футовом конусе совершает спасбросок Ловкости Сл 12. Провал: 5к6 урона огнём. Успех: половина урона.",
        acts: [save("mm25:hell-hound:fire-breath", { name: "Огненное дыхание", activation: "action", ability: "dex", dc: 12,
          rangeUnits: "self", affects: "creature", template: { type: "cone", size: 15 }, damage: [dmg("5d6", "fire")],
          spellSlot: false, usesMax: 1, usesRecovery: [{ period: "recharge", type: "recoverAll", formula: "5" }], consume: [useActivity()] })] }
    ] });

  const grapple = effect("mm25:ankheg:grapple", { name: "Схвачен анкегом", statuses: ["grappled"], transfer: false });
  const rock = effect("mm25:ankheg:rock", { name: "Рытьё в сплошном камне", disabled: true,
    changes: [{ key: "system.attributes.movement.speeds.burrow", mode: 1, value: "0.5" }] });
  const ankheg = npc({ key: "actor:mm25:ankheg", name: "Анкег", en: "Ankheg", book: "MM25", page: 14, folder: f,
    img: "icons/creatures/invertebrates/spider-beetle-runed-green.webp", size: "lg", tokenSize: 2, creatureType: "monstrosity", alignment: "Без мировоззрения", disposition: -1,
    ac: 14, hp: 45, hpFormula: "6d10+12", cr: 2, movement: { walk: 30, burrow: 10 },
    abilities: { str: 17, dex: 11, con: 14, int: 1, wis: 13, cha: 6 }, senses: { darkvision: 60, tremorsense: 60 }, habitat: [{ type: "forest" }, { type: "grassland" }],
    bio: "<h2>Роющий насекомоподобный хищник</h2><p>Среда обитания: Лес, Степь. Сокровища: нет.</p>"
      + "<p>Анкеги роют лабиринты неглубоко под землёй. Они вырываются из тоннелей, хватают мелких существ жвалами и растворяют их кислотой. Они — бедствие для фермеров, чей скот становится лёгкой добычей. Обычно анкеги охотятся поодиночке, но богатые пищей места способны поддерживать колонию из нескольких десятков особей. Для уничтожения колонии нужно очистить тоннели и уничтожить кладки.</p>"
      + "<p>Цилиндрические тоннели часто заполнены останками добычи и подземными сокровищами. Мастер может бросить [[/r 1d8]] по таблице находок.</p>"
      + "<table><tr><th>1к8</th><th>Находка в тоннеле</th></tr>"
      + "<tr><td>1</td><td>Другой каменный тоннель, рукотворный или природный, ведущий в Подземье.</td></tr>"
      + "<tr><td>2</td><td>Вскрытые тоннелем подземные развалины или могила.</td></tr>"
      + "<tr><td>3</td><td>Кладка из [[/r 1d4]] свежих яиц: их можно разбить или использовать как пузырьки с кислотой.</td></tr>"
      + "<tr><td>4</td><td>Мёртвый анкег и следы более смертоносного подземного хищника.</td></tr>"
      + "<tr><td>5</td><td>Кусок панциря, пригодный в качестве щита.</td></tr>"
      + "<tr><td>6</td><td>Кошелёк с [[/r 2d6]] золотыми монетами рядом с лужей кислоты.</td></tr>"
      + "<tr><td>7</td><td>Заблудившийся скот или лесное животное.</td></tr>"
      + "<tr><td>8</td><td>Сильно изуродованное пугало.</td></tr></table>"
      + "<p><em>«Хотя анкеги и могут питаться всем, что находят под землёй, они предпочитают живое мясо вашего скота, ваших собак или вас самих».</em> — Фейд Дженкинс, мудрец из Кирвада.</p>",
    items: [
      { name: "Прокладывание тоннеля", system: { identifier: "ankheg-tunneler" }, effects: [rock],
        desc: "Анкег перемещается сквозь сплошной камень с половиной Скорости рытья, оставляя тоннель диаметром 10 футов. В сплошном камне включите эффект «Рытьё в сплошном камне» на этой особенности; вне камня отключите его. Эффект изменяет только Скорость рытья. Отрисовка тоннеля на карте остаётся за Мастером." },
      { name: "Укус", type: "weapon", effects: [grapple], flags: { spikependium: { monsterGrapple: { dc: 13, reach: 5, maxSize: "lg", advantage: true } } },
        desc: "Бросок атаки в ближнем бою: +5 (с Преимуществом, если цель уже схвачена этим анкегом), досягаемость 5 футов. Попадание: 2к6 + 3 режущего урона и 1к6 урона кислотой. Существо не больше Крупного становится Схваченным (Сл высвобождения 13). Для высвобождения выберите токен цели и кнопку в карточке укуса: действие цели и проверка Силы (Атлетика) или Ловкости (Акробатика).",
        system: { identifier: "ankheg-bite", type: { value: "natural", baseItem: "" }, proficient: 1, equipped: true, identified: true,
          quantity: 1, weight: { value: 0, units: "lb" }, price: { value: 0, denomination: "gp" },
          range: { value: null, long: null, reach: 5, units: "ft" }, damage: { base: dmg("2d6", "slashing") } },
        acts: [attack("mm25:ankheg:bite", { name: "Укус", activation: "action", ability: "str", range: 5, count: 1, affects: "creature", spellSlot: false, damage: [dmg("1d6", "acid")] })] },
      { name: "Кислотная струя", img: "icons/magic/acid/projectile-stream-bubbles.webp",
        desc: "Перезарядка 6. Каждое существо в линии длиной 30 футов и шириной 5 футов совершает спасбросок Ловкости Сл 12. Провал: 4к6 урона кислотой. Успех: половина урона.",
        acts: [save("mm25:ankheg:acid-spray", { name: "Кислотная струя", activation: "action", ability: "dex", dc: 12,
          rangeUnits: "self", affects: "creature", template: { type: "line", size: 30, width: 5 }, damage: [dmg("4d6", "acid")],
          spellSlot: false, usesMax: 1, usesRecovery: [{ period: "recharge", type: "recoverAll", formula: "6" }], consume: [useActivity()] })] }
    ] });
  const tablesFolder = folder("tables", "Энциклопедия чудовищ (2025)");
  for (const [actor, key, name, page, count] of [
    [aboleth, "table:mm25:aboleth-schemes", "Замыслы аболета", 11, 6],
    [ankheg, "table:mm25:ankheg-finds", "Находки в тоннеле анкега", 14, 8]
  ]) {
    const rows = [...actor.system.details.biography.value.matchAll(/<tr><td>(\d+)<\/td><td>(.*?)<\/td><\/tr>/g)];
    if (rows.length !== count || rows.some((row, index) => Number(row[1]) !== index + 1)) throw Error(`Неверная исходная таблица: ${name}`);
    rollTable({ key, name, book: "MM25", page, folder: tablesFolder, rows: rows.map(row => row[2]),
      description: `<p>Энциклопедия чудовищ (2025), страница ${page}. Результаты можно получать повторно.</p>` });
    actor.system.details.biography.value += `<p>@UUID[${ref(key)}]{${name}: открыть таблицу и бросить}</p>`;
  }
  const multi = utility("mm25:aarakocra:multiattack", { name: "Мультиатака", activation: "action" });
  multi.flags = { spikependium: { multiattack: { weapon: "wind-staff", count: 2, optionalSpell: srdSpellUuid("Gust of Wind") } } };
  const spells = [
    ["Mage Hand", "Магическая рука", "mage-hand"], ["Gust of Wind", "Порыв ветра", "gust-of-wind"],
    ["Message", "Сообщение", "message"], ["Elementalism", "Стихийность", "elementalism"],
    ["Lightning Bolt", "Удар молнии", "lightning-bolt", true], ["Feather Fall", "Плавное падение", "feather-fall", true]
  ].map(([en, name, id, daily]) => cast(`mm25:aarakocra:${id}`, srdSpellUuid(en), {
    name, ability: "wis", properties: ["vocal", "somatic"], spellbook: false, spellSlot: false,
    ...(daily ? { usesMax: 1, usesRecovery: [LR], consume: [useActivity()] } : {}),
    ...(id === "feather-fall" ? { activation: "reaction", condition: "Вы или существо в пределах 60 футов падаете." } : {})
  }));
  npc({ ...body, key: "actor:mm25:aarakocra-aeromancer", name: "Ааракокра-аэромант", en: "Aarakocra Aeromancer", folder: f,
    bio: body.bio + "<p>Ааракокры-аэроманты повелевают волшебными ветрами бесконечных штормов Стихийного плана Воздуха.</p>",
    ac: 16, hp: 66, hpFormula: "12d8+12", cr: 4, spellcasting: "wis",
    abilities: { str: 10, dex: 16, con: 12, int: 13, wis: 17, cha: 12 }, saves: ["dex", "wis"],
    skills: { prc: 2, arc: 1, nat: 2 }, items: [
      { name: "Мультиатака", desc: "Ааракокра совершает две атаки Посохом ветра и может сотворить Порыв ветра.", acts: [multi] },
      { name: "Посох ветра", type: "weapon", img: "icons/weapons/staves/staff-forest-green.webp",
        desc: "Рукопашная или дальнобойная атака: +5, досягаемость 5 футов или дистанция 120 футов. Попадание: 1к8 + 3 дробящего урона и 2к10 урона молнией.\n\nВес и цена указаны по базовому боевому посоху; отдельные значения для Посоха ветра в книге не приведены.",
        system: { identifier: "wind-staff", type: { value: "natural", baseItem: "" }, proficient: 1,
          equipped: true, identified: true, quantity: 1, price: { value: 2, denomination: "sp" }, weight: { value: 4, units: "lb" },
          range: { value: 120, long: null, reach: 5, units: "ft" }, damage: { base: dmg("1d8", "bludgeoning") } },
        acts: ["melee", "ranged"].map(mode => attack(`mm25:aarakocra:wind-staff:${mode}`, {
          name: mode === "melee" ? "Посох: рукопашная" : "Посох: дальнобойная", activation: "action", ability: "dex",
          attackType: mode, range: mode === "melee" ? 5 : 120, affects: "creature", count: 1, damage: [dmg("2d10", "lightning")]
        })) },
      { name: "Заклинания", img: "icons/magic/air/wind-vortex-swirl-blue.webp",
        desc: "Мудрость; Сл. спасброска заклинания 13. Материальные компоненты не требуются.\n\nНеограниченно: Магическая рука, Порыв ветра, Сообщение, Стихийность.\n\nПо одному применению за продолжительный отдых: Удар молнии и Плавное падение. Плавное падение — реакция при наступлении условия заклинания.",
        acts: spells }
    ] });

  npc({ ...body, key: "actor:mm25:aarakocra-skirmisher", name: "Ааракокра-застрельщик", en: "Aarakocra Skirmisher", folder: f,
    bio: body.bio + "<p>Ааракокры-застрельщики искусны в борьбе с летающими в облаках врагами. Они часто атакуют цели на земле, совершая пикирующие удары.</p>",
    ac: 12, hp: 11, hpFormula: "2d8+2", cr: 0.25,
    abilities: { str: 10, dex: 14, con: 12, int: 11, wis: 12, cha: 11 }, skills: { prc: 2 }, items: [
      { name: "Лапы", type: "weapon", img: "icons/creatures/claws/claw-talons-yellow-red.webp",
        desc: "Рукопашная атака: +4, досягаемость 5 футов. Попадание: 2к4 + 2 режущего урона. Если ааракокра переместилась не менее чем на 30 футов по прямой к цели непосредственно перед попаданием, урон становится 3к4 + 2.\n\nПримечание: в книге средний обычный урон указан как 4, что не соответствует формуле 2к4 + 2. Здесь сохранена формула книги.",
        flags: { spikependium: { dive: { feet: 30 } } },
        system: { identifier: "aarakocra-talons", type: { value: "natural", baseItem: "" }, proficient: 1,
          equipped: true, identified: true, range: { value: null, long: null, reach: 5, units: "ft" },
          damage: { base: dmg("2d4", "slashing") } },
        acts: [attack("mm25:aarakocra:talons", { name: "Лапы", activation: "action", ability: "dex", range: 5, count: 1, affects: "creature" })] },
      { name: "Пилум ветра", type: "weapon", img: "icons/weapons/polearms/javelin-flared.webp",
        desc: "Рукопашная или дальнобойная атака: +4, досягаемость 5 футов или дистанция 30/120 футов. Попадание: 1к6 + 2 колющего урона и 1к4 урона громом. После попадания или промаха при дистанционной атаке пилум сразу магически возвращается в руку.\n\nВес и цена указаны по базовому метательному копью; отдельные значения для Пилума ветра в книге не приведены.",
        system: { identifier: "wind-javelin", type: { value: "simpleM", baseItem: "javelin" }, proficient: 1,
          equipped: true, identified: true, quantity: 1, price: { value: 5, denomination: "sp" }, weight: { value: 2, units: "lb" },
          properties: ["thr", "ret"], range: { value: 30, long: 120, reach: 5, units: "ft" }, damage: { base: dmg("1d6", "piercing") } },
        acts: ["melee", "ranged"].map(mode => attack(`mm25:aarakocra:wind-javelin:${mode}`, {
          name: mode === "melee" ? "Пилум: рукопашная" : "Пилум: бросок", activation: "action", ability: "dex",
          attackType: mode, affects: "creature", count: 1, damage: [dmg("1d4", "thunder")],
          ...(mode === "melee" ? { range: 5 } : {})
        })) }
    ] });
}
