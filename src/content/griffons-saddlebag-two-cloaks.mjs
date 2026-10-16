import evidence from '../../tools/data/griffon-two-cloaks.json' with {type:'json'};
import {griffonItem} from './griffons-saddlebag.mjs';
import {folder,npc} from '../../tools/lib/docs.mjs';
import {utility,cast,effect,change,form,teleport,check,damage,save,attack,dmg,uses,DAWN,useSelf,useSorcery} from '../../tools/lib/core.mjs';

export const GRIFFON_TWO_CLOAKS=evidence.entries;
export function define(){
 for(const row of GRIFFON_TWO_CLOAKS){
  const id=row.key.split(':').at(-1),en=row.name.slice(row.name.lastIndexOf(' [')+2,-1),key=`gs2:${id}`;
  const opts={category:'Плащи и мантии',rarity:row.rarity,attunement:row.attunement,equipType:'clothing',weight:id==='wisp'?0.1:4,
   weightNote:id==='wisp'?'Вес оценочный: 0,1 фунта для почти невесомого плаща; точный вес источник не задаёт.':'Вес оценочный: 4 фунта по дорожному плащу; точный вес источник не задаёт.',
   img:'icons/equipment/back/cloak-hooded-blue.webp',effects:[],acts:[],flags:{spikependium:{key:row.key,griffonCloak:id,cloakBlanket:0}}};
  const tag=(a,flags)=>{a.flags={spikependium:flags};opts.acts.push(a);return a;};
  const action=(suffix,name,more={},flags={})=>tag(utility(`${key}:${suffix}`,{name,spellSlot:false,...more}),flags);
  const profile=(suffix,name,more={})=>{const e=effect(`${key}:${suffix}`,{name,...more});opts.effects.push(e);return e;};
  const spell=(suffix,name,more={})=>tag(cast(`${key}:${suffix}`,evidence.spells.find(s=>s.name===name).uuid,{name:evidence.spells.find(s=>s.name===name).ru,properties:[],spellSlot:false,...more}),{});
  if(id==='seer-starlight'){
   opts.flags.spikependium.griffonClass=['cleric','druid','wizard'];opts.uses=uses(1,{period:'dusk',type:'recoverAll'});
   spell('guidance','Guidance',{activation:'action'});spell('augury','Augury',{activation:'action',condition:'Вы видите ночное небо',consume:[useSelf()]});
   opts.desc='Настройка жрецом, друидом или волшебником. Действием: Указание без ограничения применений. Если видно ночное небо, действием: Гадание раз до следующего заката. Предзнаменование показывают падающие звёзды: три и более — благо, одна — беда, две — оба исхода, ни одной — нейтральный исход. Связаны оригинальные заклинания SRD 2014 с русскими предметными копиями; концентрация Указания и расход/возврат Гадания штатные. Ночное небо, тайный ответ и случайность повторного гадания до долгого отдыха проверяет Мастер.';
  }else if(id==='monarch'){
   opts.uses=uses(3,DAWN('1d3'));
   const flight=profile('flight','Мантия монарха: полёт 30 футов до конца своего хода',{transfer:false,expiry:'targetEnd',changes:[change('system.attributes.movement.speeds.fly',30,'upgrade')],flags:{spikependium:{cloakFlight:true}}});
   tag(form(`${key}:flight`,{name:'Крылья бабочки: полёт до конца хода',activation:'bonus',effects:[flight._id],spellSlot:false}),{});
   tag(teleport(`${key}:escape`,{name:'Попадание видимого существа: половина урона и телепортация',activation:'reaction',distance:15,consume:[useSelf()],spellSlot:false}),{griffonCommandWord:false});
   opts.desc='Бонусным действием получите скорость полёта 30 футов до конца своего хода; профиль временный, зависания нет. Три заряда, на рассвете восстанавливается 1к3. Когда видимое существо попадает по вам, реакцией за заряд получите половину урона этой атаки и телепортируйтесь до 15 футов в видимое свободное место. Там до конца текущего хода остаются бабочки: атаки по вам с помехой, только пока вы остаётесь в этом месте. Полёт, реакция, заряд и телепортация штатные. Половину исходного урона, видимость, свободное назначение и помеху бабочек подтверждайте вручную; общий профиль сопротивления не выдаётся.';
  }else if(id==='varion-mantle'){
   opts.flags.spikependium.varionReadyAt=0;
   spell('steed','Find Steed',{activation:'minute',activationValue:10});
   action('dismiss','Отпустить своего связанного скакуна',{activation:'action'},{cloakDismiss:true});
   action('death','Подтвердить гибель скакуна: запретить призыв на двое суток',{activation:'special'},{cloakSteedDeath:true});
   tag(check(`${key}:mounted`,{name:'Верхом: Харизма (Убеждение) с преимуществом',ability:'cha',associated:['per'],self:true,activation:'special',spellSlot:false}),{cloakAdvantage:true});
   opts.desc='Непромокаемый плащ с настройкой. За 10 минут: Поиск скакуна SRD 2014, всегда в облике гигантской жабы. Штатный призыв предлагает только русскую жабу модуля и тип небожителя, феи или исчадия; её Интеллект не ниже 6. Связанный скакун существует до окончания заклинания или настройки. Падение скакуна до 0 хитов запрещает повторный призыв на двое суток; таймер не сбрасывается отдыхом. Верхом проверки Харизмы (Убеждение) с преимуществом: отдельная кнопка проверяет только происхождение проверки, факт езды подтвердите сами. Язык скакуна, телепатию, совместные заклинания и верховой бой разрешает Мастер.';
  }else if(id==='security'){
   profile('cloak','Мантия утешения как плащ: нельзя испугать',{changes:[change('system.traits.ci.value','frightened')],flags:{spikependium:{securityMode:'cloak'}}});
   profile('blanket','Мантия утешения как одеяло: пассивное Восприятие +3',{changes:[change('system.skills.prc.bonuses.passive',3)],flags:{spikependium:{securityMode:'blanket'}}});
   action('blanket','Укрыться как одеялом: сон или отдых',{activation:'special'},{cloakMode:1});action('cloak','Надеть как плащ',{activation:'special'},{cloakMode:0});
   opts.desc='Надетая как плащ мантия даёт иммунитет к Испуганному и не позволяет магии усыпить вас. Как одеяло во сне, на коротком или долгом отдыхе: вы не можете против воли стать целью Вещего сна, пассивная Мудрость (Восприятие) +3, бессознательность не позволяет застать вас врасплох. В обоих случаях выдерживаете холод до −50 °F (около −46 °C) без дополнительной защиты. Кнопки переключают режим: иммунитет к Испуганному действует только у плаща, +3 пассивного Восприятия — у одеяла. Сон/отдых, магическое усыпление, Вещий сон, внезапность и холод проверяет Мастер; иммунитет ко всей Бессознательности не добавлен.';
  }else if(id==='meta-mantle'){
   opts.flags.spikependium.griffonClass='sorcerer';
   const delayed=profile('delay','Отложенное заклинание: выпустить в течение минуты',{transfer:false,seconds:60});
   action('delay','Отложенное заклинание: Готовность, 3 единицы чародейства',{activation:'action',self:true,effects:[delayed._id],consume:[useSorcery(3)]});
   action('emergency','Экстренное заклинание: попадание или урон, 6 единиц чародейства',{activation:'reaction',consume:[useSorcery(6)]});
   for(const [shape,ru,extra]of [['line','линия','+15 футов длины'],['cone','конус','+5 футов'],['cube','куб','+5 футов стороны'],['sphere','сфера','+5 футов радиуса'],['cylinder-width','цилиндр','+5 футов диаметра'],['cylinder-height','цилиндр','+10 футов высоты']])action(`extend:${shape}`,`Расширенное заклинание: ${ru}, ${extra}`,{activation:'special',consume:[useSorcery(2)]});
   opts.desc='Настройка чародеем. После каждого долгого отдыха можно менять известные варианты Метамагии. Три новых варианта используют единицы чародейства Источника магии. Отложенное (3): Готовность заклинания с целью-точкой, заранее выберите видимую точку в дистанции; без концентрации, реакцией выпустите за минуту из исходного пространства, даже потеряв точку из виду; иначе рассеется, одновременно только одно такое заклинание. Экстренное (6): реакцией при попадании по вам или получении урона сотворите заклинание со временем действие/бонусное действие. Расширенное (2): линия +15 футов длины, конус +5 футов, куб +5 футов стороны, сфера +5 футов радиуса, цилиндр +5 футов диаметра либо +10 футов высоты. Кнопки расходуют реальные единицы чародейства и действие/реакцию, возврат штатный. Реальное заклинание, его ячейку, готовность без концентрации, единственность, точку/таймер выпуска и изменение шаблона пока настраивайте вручную; не оплачивайте уже потраченное действие повторно.';
  }else if(id==='wisp'){
   profile('death','Плащ блуждающего огонька: преимущество спасброскам от смерти',{changes:[change('system.attributes.death.roll.mode',1)]});
   tag(save(`${key}:curse`,{name:'Проклятие: дружественное существо с 0 хитов в 10 футах',activation:'special',ability:'con',dc:13,range:10,count:1,affects:'creature',spellSlot:false}),{cloakWispCurse:true});
   opts.desc='Надетый настроенный почти невесомый плащ даёт преимущество спасброскам от смерти. Один раз в каждый свой ход можно беспрепятственно пройти через пространство Среднего или меньшего существа, но нельзя остановиться в нём. Проклятие начинается при надевании: плащ нельзя снять до Снятия проклятия или подобной магии. При первом за свой ход приближении на 10 футов к дружественному существу с 0 хитов, а также при окончании хода там, это существо совершает Телосложение СЛ 13; провал даёт один провал спасброска от смерти. Преимущество и отдельный спасбросок штатные; движение, дружелюбность, моменты проклятия, отметку провала и запрет снятия пока контролирует Мастер.';
  }else if(id==='luna-moth'){
   opts.uses=uses(1);action('jump','В прыжке: взмах в верхней точке, +10 футов вверх',{activation:'bonus',consume:[useSelf()]},{griffonCommandWord:true,cloakJump:true});
   action('landed','Подтвердить приземление на твёрдую поверхность',{activation:'special'},{cloakLanded:true});
   opts.desc='При Рывке переместитесь на 10 футов дальше: это добавочная дистанция именно Рывка, не общий бонус скорости. Во время прыжка бонусным действием произнесите командное слово: в верхней точке плащ подбросит вас ещё на 10 футов вверх. До приземления на твёрдую поверхность повтор невозможен. Кнопка расходует одно невосстанавливаемое отдыхом применение; после подтверждённого приземления отдельная кнопка возвращает его. Прыжок не является телепортацией: доступная кнопка только отмечает бонусное действие и расход, фактическую траекторию перемещайте вручную. Рывок и твёрдую поверхность контролирует игрок.';
  }else if(id==='forecaster'){
   action('weather','Распахнуть плащ: местная погода на следующие 8 часов',{activation:'action',duration:'minute',durationValue:1},{griffonCommandWord:true});
   action('close','Запахнуть плащ: закончить иллюзию',{activation:'special'});
   opts.desc='Тёплый плащ на меху. Действием распахните его и произнесите командное слово: внутри возникает безвредный чувственный образ местной погоды на ближайшие 8 часов. Эффект длится 1 минуту или до закрытия плаща. Есть штатные кнопки действия и завершения; прогноз сообщает Мастер, внешние погодные сервисы не используются.';
  }else if(id==='mimicloak'){
   action('appearance','Изменить фасон, цвет и видимое качество плаща',{activation:'bonus'},{griffonCommandWord:true});
   for(const [ability,skill,ru]of [['str','ath','Сила (Атлетика)'],['dex','acr','Ловкость (Акробатика)']])tag(check(`${key}:escape:${ability}`,{name:`Вырваться из захвата: ${ru} с преимуществом`,activation:'action',ability,associated:[skill],self:true,spellSlot:false}),{cloakAdvantage:true});
   tag(damage(`${key}:bite`,{name:'Проверка высвобождения из захвата/пут: укус удерживающему',activation:'special',rangeUnits:'touch',count:1,affects:'creatureOrObject',damage:[dmg('1d10','piercing')],spellSlot:false}),{});
   opts.desc='Бонусным действием и командным словом измените фасон, цвет и видимое качество плаща. Вес сохраняется; он остаётся плащом с теми же свойствами. Проверки характеристики для высвобождения из захвата совершаются с преимуществом: есть отдельные Атлетика и Акробатика с этой настройкой. При каждой проверке для высвобождения из захвата или пут удерживающее существо либо предмет получает 1к10 колющего урона от зубастой ткани, даже при провале проверки. Преимущество относится только к захвату, не ко всем путам; добавочную проверку для нестандартных пут и цель урона подтвердите вручную. Это проверка по правилам 2014, не общее преимущество всем испытаниям от Захвата 2024.';
  }else{
   profile('climb','Тёмная мантия: лазание без добавочной стоимости',{changes:[change('system.attributes.movement.speeds.climb','@attributes.movement.speeds.walk','upgrade')]});
   tag(check(`${key}:climb`,{name:'Лазание: Сила (Атлетика) с преимуществом',activation:'special',ability:'str',associated:['ath'],self:true,spellSlot:false}),{cloakAdvantage:true});
   opts.uses=uses(1,DAWN());spell('darkness','Darkness',{activation:'action',duration:'minute',durationValue:1,concentration:true,self:true,consume:[useSelf()]});
   opts.acts.at(-1).flags.spikependium.griffonCommandWord=true;
   opts.desc='Надетая настроенная мантия позволяет лазать без дополнительной стоимости перемещения и даёт преимущество Силе (Атлетика) для лазания; есть отдельная проверка и скорость лазания не ниже ходьбы. Действием и командным словом раз до рассвета испустите магическую тьму радиусом 15 футов: она движется с вами и огибает углы, концентрация до минуты. Тёмное зрение и немагический свет её не преодолевают; пересекающийся свет заклинания 2-го уровня или ниже рассеивается. Связана адаптированная копия Тьмы SRD 2014 с русским описанием, минутой и центром на носителе; карта создаёт отдельный движущийся источник. Запрет обычного тёмного зрения, особое зрение, огибание углов и рассеивание чужих заклинаний проверяет Мастер.';
  }
  griffonItem('GS2',en,id,opts);
 }
 const source=GRIFFON_TWO_CLOAKS.find(e=>e.key==='item:gs2:varion-mantle').url;
 const raw=evidence.toad.document,abilities=Object.fromEntries(Object.entries(raw.system.abilities).map(([k,a])=>[k,k==='int'?6:a.value]));
 const toad=npc({key:'actor:gs2-varion-steed',name:'Гигантская жаба — скакун сэра Вариона',book:'GS2',page:'',sourceUrl:source,folder:folder('creatures','Сумка грифона — книга 2/Скакуны'),img:'icons/creatures/amphibians/frog-confused-green-blue.webp',size:'lg',tokenSize:2,creatureType:'celestial',hp:39,hpFormula:'6d10+6',ac:11,cr:1,abilities,movement:{walk:20,swim:40},senses:{darkvision:30},languagesCustom:'Понимает один выбранный язык носителя; телепатия только с носителем в пределах мили.',bio:'Дух из Поиска скакуна SRD 2014 в облике гигантской жабы. Выберите тип небожителя, феи или исчадия при призыве. Амфибия; прыжок с места до 20 футов в длину или 10 в высоту. Интеллект повышен до 6. Язык, совместные заклинания и управление верхом проверяет Мастер. Не более одного связанного скакуна.',items:[
  {name:'Укус',desc:'Попадание: 1к10+2 колющего и 1к10 ядом. Цель Схвачена (высвобождение СЛ 13) и Опутана до окончания захвата; нельзя кусать другую цель. Захват/Опутывание и ограничение одного укушенного пока подтвердите вручную.',acts:[attack('gs2:varion:bite',{name:'Укус',activation:'action',flat:true,bonus:'4',includeBase:false,range:5,count:1,affects:'creature',damage:[dmg('1d10+2','piercing'),dmg('1d10','poison')],spellSlot:false})]},
  {name:'Проглатывание',desc:'Одна атака укусом по уже схваченной Средней или меньшей цели. При попадании захват оканчивается, цель проглочена: Ослеплена и Опутана, полное укрытие от внешних атак/эффектов. Только одна проглоченная цель. В начале каждого хода жабы цель получает 3к6 кислотой. После смерти жабы цель освобождается от Опутывания и может выбраться, потратив 5 футов движения, оказываясь Сбитой с ног. Проверку условий и состояния ведёт Мастер.',acts:[utility('gs2:varion:swallow',{name:'Проглотить: укус по своей схваченной цели',activation:'action',spellSlot:false}),damage('gs2:varion:acid',{name:'Начало хода: проглоченной цели',activation:'special',count:1,affects:'creature',damage:[dmg('3d6','acid')],spellSlot:false})]},
  {name:'Амфибия и прыжок с места',desc:'Дышит воздухом и водой; прыжок до 20 футов в длину или 10 футов в высоту без разбега.'}
 ]});
 toad.system.source.license=raw.system.source.license;
 toad.flags.spikependium.varionSteed=true;if(`Compendium.spikependium.creatures.Actor.${toad._id}`!==evidence.toad.uuid)throw Error('Неверная ссылка на жабу-скакуна');
}
