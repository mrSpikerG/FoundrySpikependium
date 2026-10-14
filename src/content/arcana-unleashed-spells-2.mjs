import { utility, save, heal, dmg, effect } from "../../tools/lib/core.mjs";
import { spell, folder } from "../../tools/lib/docs.mjs";

const F = level => folder("spells", `${level} уровень`, { sort:(level+1)*1000 });
const tag = (activity,kind) => { activity.flags={spikependium:{arcanaStage:kind}};return activity; };
export function define(){
  const detonate=save("spell:au-detonate:cast",{name:"Взрывающееся семя",activation:"action",range:500,count:1,affects:"creature",
    ability:"con",damage:[dmg("10d10","fire")],onSave:"half"});
  const burst=tag(save("spell:au-detonate:burst",{name:"Взрыв вокруг первичной цели",activation:"",range:500,affects:"creature",
    template:{type:"sphere",size:60},ability:"dex",damage:[dmg("10d10","fire")],onSave:"half",spellSlot:false}),"detonate-burst");
  spell({key:"spell:au-detonate",identifier:"detonate",name:"Детонация",book:"AU",page:39,folder:F(9),level:9,school:"evo",
    img:"icons/magic/fire/explosion-fireball-medium-orange",range:500,components:"ВСМ",materials:"кусок трута",
    desc:`*Списки: волшебник, колдун, чародей.*

Вы создаёте магическое взрывающееся семя внутри существа, которое видите в пределах дистанции. Цель совершает спасбросок Телосложения, получая 10к10 урона огнём при провале или половину при успехе.

Затем происходит взрыв с центром на цели. Каждое существо в 60-футовой эманации, исходящей от первичной цели (исключая её), совершает спасбросок Ловкости. Если это заклинание снизило хиты первичной цели до 0, эти спасброски совершаются с помехой. Существо получает 10к10 урона огнём при провале или половину при успехе.

Заклинание наносит урон немагическим объектам в эманации, которые никто не несёт и не носит, и воспламеняет горючие объекты.

**Применение.** Сначала выберите первичную цель и примените урон семени. Для взрыва выберите исходную карточку накладывания и отметьте существ вокруг первичной цели, исключая её. Взрыв не тратит вторую ячейку. Помеха выбирается по подтверждённому снижению хитов первичной цели до 0; размещение области и урон объектам проверяет Мастер.`,acts:[detonate,burst]});

  const ringEffect=effect("spell:au-lightning-ring:ring",{name:"Круговая молния",transfer:false,flags:{spikependium:{arcanaOngoing:"lightning-ring",arcanaSpell:"lightning-ring"}}});
  ringEffect.system.magical=true;
  const deaf=effect("spell:au-lightning-ring:deaf",{name:"Круговая молния — Оглохший",transfer:false,seconds:60,statuses:["deafened"]});deaf.system.magical=true;
  spell({key:"spell:au-lightning-ring",identifier:"lightning-ring",name:"Круговая молния",book:"AU",page:43,folder:F(8),level:8,school:"evo",
    img:"icons/magic/lightning/orb-ball-blue",activation:"bonus",rangeUnits:"self",components:"ВСМ",materials:"клочок меха и стеклянное кольцо",
    concentration:true,duration:"minute",durationValue:10,effects:[ringEffect,deaf],
    desc:`*Списки: волшебник, друид, колдун, чародей.*

Кольцо потрескивающего электричества заполняет 10-футовую эманацию, исходящую от вас. Когда эманация входит в пространство существа, либо существо входит в эманацию или заканчивает там свой ход, вы можете заставить его совершить спасбросок Телосложения. При провале цель получает 3к6 урона электричеством плюс 3к6 урона звуком и становится Оглохшей на 1 минуту. При успехе цель получает половину урона.

Пока заклинание активно, вы можете действием Магия выпустить линию длиной 60 футов и шириной 5 футов в выбранном направлении. Все существа в линии совершают спасбросок Ловкости, получая 6к6 урона электричеством при провале или половину при успехе.

**Применение.** Создайте кольцо бонусным действием. Воздействие эманации и выпуск линии доступны только при активном кольце и его концентрации, без повторного расхода ячейки. Существа для воздействия выбираются перед действием; событие входа/конца хода подтверждает Мастер. Оглохший накладывается штатной карточкой эффектов на провалившие цели.`,
    acts:[utility("spell:au-lightning-ring:cast",{name:"Создать кольцо",activation:"bonus",self:true,concentration:true,duration:"minute",durationValue:10,
      template:{type:"emanation",size:10},effects:[ringEffect._id]}),
    tag(save("spell:au-lightning-ring:pulse",{name:"Воздействие эманации",activation:"",range:10,ability:"con",affects:"creature",spellSlot:false,
      duration:"inst",concentration:false,damage:[dmg("3d6","lightning"),dmg("3d6","thunder")],onSave:"half",effects:[{_id:deaf._id,onSave:false}]}),"lightning-ring"),
    tag(save("spell:au-lightning-ring:line",{name:"Выпустить линию",activation:"action",self:true,template:{type:"line",size:60,width:5},affects:"creature",
      ability:"dex",spellSlot:false,duration:"inst",concentration:false,damage:[dmg("6d6","lightning")],onSave:"half"}),"lightning-ring")]});

  const groundEffect=effect("spell:au-grave-ground:area",{name:"Кладбищенская земля",transfer:false,flags:{spikependium:{arcanaOngoing:"grave-ground",arcanaSpell:"grave-ground"}}});
  groundEffect.system.magical=true;
  const weakened=effect("spell:au-grave-ground:weakness",{name:"Кладбищенская земля — уменьшение урона",transfer:false,expiry:"targetEnd",
    flags:{spikependium:{graveGroundWeakness:true}},
    description:"Из каждого штатного броска урона автоматически вычитается 1к6 до конца следующего хода цели. Лечение не уменьшается. При нескольких типах выберите, какой уменьшить первым; остаток уменьшает следующие компоненты. К6 не удваивается при критическом попадании."});weakened.system.magical=true;
  spell({key:"spell:au-grave-ground",identifier:"grave-ground",name:"Кладбищенская земля",book:"AU",page:42,folder:F(5),level:5,school:"nec",
    img:"icons/magic/death/hand-undead-skeleton-fire-pink",range:120,components:"ВСМ",materials:"горсть могильной земли",
    concentration:true,duration:"minute",durationValue:1,effects:[groundEffect,weakened],
    desc:`*Списки: волшебник, жрец, колдун.*

Костлявые руки вырываются из области на земле в пределах дистанции. Область состоит из не более четырёх квадратов со стороной 10 футов, расположенных по вашему усмотрению. Каждый квадрат имеет хотя бы одну общую грань с другим квадратом. Для ваших врагов область является труднопроходимой местностью.

Когда руки появляются, каждый враг в области совершает спасбросок Силы. При провале он получает 6к6 урона некротической энергией и вычитает 1к6 из всех своих бросков урона до конца своего следующего хода. Враг также совершает этот спасбросок, если входит в область или заканчивает там свой ход. Существо совершает его только один раз за ход.

**Использование ячейки большего уровня.** Урон увеличивается на 1к6 за каждый уровень ячейки выше пятого.

**Применение.** Разместите до четырёх соприкасающихся квадратов и отметьте врагов в области. После создания области примените «Костлявые руки» к начальным целям; это действие не расходует вторую ячейку и использует уровень исходного накладывания. На провалившие цели примените эффект уменьшения урона штатной карточкой. Пока он активен, модуль бросает один к6 на штатный бросок урона и уменьшает итог до применения сопротивлений. При нескольких типах выберите первый уменьшаемый компонент; остаток уменьшает следующие компоненты. Итог не становится отрицательным; лечение, временные хиты и кости самого критического попадания сохраняются. Несколько эффектов Кладбищенской земли не складываются. Для нового броска используйте обычную кнопку урона в карточке действия. Вход, конец хода, повтор на одну цель в одном ходу и труднопроходимую местность пока обрабатывает Мастер.`,
    acts:[utility("spell:au-grave-ground:cast",{name:"Создать область",activation:"action",self:true,range:120,concentration:true,duration:"minute",durationValue:1,
      template:{type:"square",size:10},effects:[groundEffect._id]}),
    tag(save("spell:au-grave-ground:hands",{name:"Костлявые руки",activation:"",range:120,affects:"enemy",ability:"str",spellSlot:false,
      duration:"inst",concentration:false,damage:[dmg("6d6","necrotic",{scale:1})],onSave:"none",effects:[{_id:weakened._id,onSave:false}]}),"grave-ground")]});

  const living=tag(save("spell:au-negative-energy-flood:living",{name:"Цель не является нежитью",activation:"action",range:60,count:1,affects:"creature",
    ability:"con",damage:[dmg("3d10+25","necrotic",{scale:1})],onSave:"half"}),"negative-energy-living");
  const undead=tag(heal("spell:au-negative-energy-flood:undead",{name:"Нежить: временные хиты",activation:"action",range:60,count:1,affects:"creature",
    formula:"3d10",temp:true}),"negative-energy-undead");
  spell({key:"spell:au-negative-energy-flood",identifier:"negative-energy-flood",name:"Поток негативной энергии",book:"AU",page:44,folder:F(5),level:5,school:"nec",
    img:"icons/magic/unholy/projectile-missile-green",range:60,components:"ВМ",materials:"сломанная кость и квадратный лоскут чёрного шёлка",
    desc:`*Списки: волшебник, колдун.*

Вы направляете ленты тёмной энергии на одно существо, которое видите в пределах дистанции. Если цель не является Нежитью, она совершает спасбросок Телосложения, получая 3к10 + 25 урона некротической энергией при провале или половину при успехе.

Гуманоид, убитый этим заклинанием, воскресает в начале вашего следующего хода как Зомби, выполняющий ваши устные приказы в течение 24 часов, после чего действует согласно своей природе.

Если цель — Нежить, она получает 3к10 временных хитов.

**Использование ячейки большего уровня.** Урон увеличивается на 1к10 за каждый уровень ячейки выше пятого. Временные хиты нежити не увеличиваются.

**Применение.** Выберите ровно одну цель и соответствующий вариант действия. Тип цели проверяется до расхода ячейки. Урон и временные хиты применяются штатными карточками; временные хиты не складываются. Превращение убитого гуманоида в зомби в следующий ход, его приказы и окончание контроля через 24 часа пока обрабатывает Мастер.`,acts:[living,undead]});

  spell({key:"spell:au-wither-and-bloom",identifier:"wither-and-bloom",name:"Увядание и цветение",book:"AU",page:45,folder:F(2),level:2,school:"nec",
    img:"icons/magic/nature/leaf-juggle-humanoid-green",range:60,components:"ВСМ",materials:"увядшая лоза, скрученная в петлю",
    desc:`*Списки: волшебник, друид, чародей.*

Вы пробуждаете смерть и жизнь в сфере радиусом 10 футов с центром в точке в пределах дистанции. Все существа по вашему выбору в области совершают спасбросок Телосложения, получая 3к6 урона некротической энергией при провале или половину при успехе. Немагические растения в области, не являющиеся существами, увядают.

Кроме того, одно существо по вашему выбору в этой области может бросить одну из своих непотраченных костей хитов и восстановить количество хитов, равное результату броска плюс модификатор вашей заклинательной характеристики. После этого кость тратится.

**Использование ячейки большего уровня.** Урон увеличивается на 1к6 за каждый уровень ячейки выше второго. Допустимое количество костей хитов увеличивается на единицу за каждый уровень ячейки выше второго. Модификатор заклинательной характеристики добавляется к восстановлению только один раз, независимо от количества костей.

**Применение.** В окне накладывания выберите получателя лечения, затем разместите сферу и отметьте выбранные цели урона. В исходной карточке нажмите «Лечение: кости получателя». Получатель или Мастер выбирает, какие собственные кости потратить, вплоть до количества, разрешённого уровнем исходной ячейки. Кости разных классов можно смешивать. Лечение прибавляет сохранённый модификатор заклинателя один раз и автоматически применяется штатным способом, без повторной ячейки. Получатель должен находиться в исходной сфере в момент расхода костей. При закрытии броска после расхода используйте уже оплаченную карточку лечения. Отмена расхода возвращает кости, но уже восстановленные хиты не откатывает. Увядание растений, высоту сферы и препятствия проверяет Мастер.`,
    acts:[save("spell:au-wither-and-bloom:cast",{name:"Увядание и цветение",activation:"action",range:60,affects:"creature",choice:true,
      template:{type:"sphere",size:10},ability:"con",damage:[dmg("3d6","necrotic",{scale:1})],onSave:"half"}),
      Object.assign(heal("spell:au-wither-and-bloom:heal",{name:"Цветение: кости получателя",activation:"",self:true,formula:"0",spellSlot:false}),
        {flags:{spikependium:{bloomTemplate:true}}})]});
}
