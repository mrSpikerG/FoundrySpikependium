import bases from '../../tools/data/griffon-staff-bases.json' with { type: 'json' };
import evidence from '../../tools/data/griffon-staves.json' with { type: 'json' };
import { weaponTemplate, folder } from '../../tools/lib/docs.mjs';
import { attack, cast, check, save, utility, dmg, effect, uses, useSelf, DAWN } from '../../tools/lib/core.mjs';

export const GRIFFON_STAVES = ['leeching','stormstruck','thwack','cratering','braided','shaeden','arcanist-bowstaff'];
const tag = (activity, flags) => Object.assign(activity,{ flags:{spikependium:flags} });
export function define() {
 for (const id of GRIFFON_STAVES) {
  const key=`gs1:${id}`, source=evidence.entries.find(e=>e.key===`item:${key}`);
  const native=bases.records.find(r=>r.name===(id==='shaeden'?'staff':'quarterstaff')).document;
  const flags={key:`item:${key}`,griffonFocus:id,focusRuin:0,focusWeaponBonus:['leeching','stormstruck','cratering'].includes(id)?1:id==='arcanist-bowstaff'?2:0};
  const acts=[attack(`${key}:attack`,{name:'Атака боевым посохом',activation:'action',attackType:'melee',range:5,affects:'creature',spellSlot:false})];
  const opts={};
  const action=(suffix,name,more={},state={})=>tag(utility(`${key}:${suffix}`,{name,activation:'special',spellSlot:false,...more}),state);
  const linked=(suffix,en,ru,cost,more={})=>{
   const record=bases.records.find(r=>r.name===en&&r.uuid);if(!record)throw Error(en);
   const activity=cast(`${key}:${suffix}`,record.uuid,{name:`${ru}: ${cost} зар.`,properties:[],spellSlot:false,consume:[useSelf(cost)],...more});acts.push(activity);return activity;
  };
  if(id==='leeching') {
   opts.uses=uses(6,DAWN('1d6'));
   acts.push(action('drain','Попадание: высосать жизнь',{consume:[useSelf()]},{staffHit:'leeching'}));
   opts.desc='Настройка; боевой посох +1. 6 зарядов, рассвет 1к6. После попадания по цели, кроме нежити и конструктов, за заряд добавьте 1к6 некротического урона и восстановите хиты в размере фактически нанесённой добавки после уменьшений. При броске урона из карточки одиночного попадания модуль предлагает заряд и добавляет некротическую кость к исходной атаке с её критом. Кнопка свойства заранее оплачивает усиление свежего попадания, затем бросьте урон из его карточки. После применения урона цели лечение проходит автоматически по фактической некротической добавке; повторно та же оплата не лечит. Если в атаке несколько источников некротического урона, лечение определите вручную. Неоднозначные несколько атак/целей и старые карточки без контекста требуют Мастера. Отмена расхода возвращает заряд и запрещает неоплаченный дополнительный урон, но уже применённые хиты отдельно не откатывает.';
  } else if(id==='stormstruck') {
   flags.staffGlowUntil=0;
   acts.push(action('lightning','Посох получил электрический урон: свечение на минуту',{}, {staffLightning:true}));
   opts.desc='Без настройки; боевой посох +1, при попадании дополнительно 1 урон электричеством. Получив электрический урон сам или будучи в руках владельца, получившего такой урон от другого источника, светится минуту: яркий свет 10 футов, тусклый ещё 10, дополнительный урон становится 1к6 электричеством. Такое же свечение действует под Шиллейлой. Урон владельцу отслеживается после уменьшений; собственный урон посоха не включает свечение. Урон самому объекту подтверждайте кнопкой. Нативное зачарование Шиллейлы определяется по исходному заклинанию. Свечение меняет свет токена и дополнительный урон, истекает по игровому времени.';
  } else if(id==='thwack') {
   opts.uses=uses(3,DAWN());
   acts.push(check(`${key}:performance`,{name:'Представление с посохом: Выступление +1',ability:'cha',associated:['prf'],bonus:'1',spellSlot:false}),
    action('parry','Парирование: к6 к КБ против одной атаки',{activation:'reaction',consume:[useSelf()]},{staffParry:true}),
    tag(attack(`${key}:counter`,{name:'Контратака в рамках парирования',activation:'special',attackType:'melee',range:5,affects:'creature',spellSlot:false}),{staffCounter:true}),
    action('parry-manual','Парирование вручную: сложная ситуация',{activation:'reaction',roll:'1d6',consume:[useSelf()]},{staffParryManual:true}));
   opts.desc='Настройка; магический фехтовальный боевой посох. +1 к Харизме (Выступление) только при занимательном представлении с ним: отдельная проверка. 3 заряда, все на рассвете. Реакция за заряд, когда видимое существо попало по вам рукопашной атакой: 1к6 к КБ только против этого удара. После подтверждения видимости к6 бросается один раз и сохраняется в оплаченной карточке; общий КБ не меняется. Если именно прибавка обратила попадание в промах, предлагается немедленная атака тем же посохом по атакующему в досягаемости, в рамках той же реакции. При попадании к основному урону добавляется сохранённое число, без переброса к6. Критическое входящее попадание повышение КБ не отменяет. При применении урона неподходящее парирование не отменяет попадание; успешное парирование блокирует урон этого удара. Возврат расходов снимает защиту и право контратаки, но не откатывает уже применённые последствия. Для нескольких атак/целей, неизвестного КБ, отсутствия токенов и иных неоднозначностей есть ручное парирование: оно тратит заряд и реакцию, а изменение попадания и обычный бросок контратаки без нового расхода действия или реакции разрешает Мастер.';
  } else if(id==='cratering') {
   opts.uses=uses(5,DAWN('1d4+1'));
   acts.push(tag(save(`${key}:cone`,{name:'После атаки: кратерный конус',activation:'special',ability:'dex',dc:16,template:{type:'cone',size:10},damage:[dmg('1d8','bludgeoning'),dmg('1d8','fire')],onSave:'half',affects:'creature',consume:[useSelf()],spellSlot:false}),{staffCrater:true}));
   opts.desc='Без настройки; боевой посох +1. Для уверенного владения нужна Сила 17; источник не задаёт штрафа при меньшей Силе, модуль предупреждает, решение принимает Мастер. 5 зарядов, рассвет 1к4+1. Раз в каждый свой ход сразу после броска атаки этим посохом (попадание не требуется) за заряд, без действия: конус 10 футов в сторону цели, Ловкость СЛ 16, по 1к8 дробящего урона и огня, половина при успехе. После свежего одиночного броска атаки модуль предлагает свойство; его можно запустить и с листа до другой атаки. Оплаченная карточка сохраняет исходную цель, её спасбросок Ловкости получает помеху; прочие цели конуса бросают обычно. В активном бою действует ограничение своим ходом и одним расходом; возврат расхода освобождает применение и отключает прежнюю карточку. Направление конуса, его расположение и попадание существ в область проверяйте вручную. При нескольких целях, неоднозначном перенаправлении или токенах исходной цели решение принимает Мастер.';
  } else if(id==='braided') {
   flags.staffRopeMode=0;
   const restrained=effect(`${key}:restrained`,{name:'Затянутая плетёная верёвка',transfer:false,statuses:['restrained']});opts.effects=[restrained];
   acts.push(action('rope','Командное слово: верёвка 50 футов',{activation:'bonus'},{staffRopeMode:1,griffonCommandWord:true}),
    action('staff','Командное слово: боевой посох',{activation:'bonus'},{staffRopeMode:0,griffonCommandWord:true}),
    action('bind','Командное слово: затянуть вокруг уже Опутанной цели',{activation:'bonus',count:1,affects:'creature',effects:[restrained._id]},{staffRopeMode:2,griffonCommandWord:true}),
    action('released','После освобождения: свободная верёвка',{}, {staffRopeMode:1,staffReleased:true}),
    check(`${key}:escape`,{name:'Действие: освободить из затянутой верёвки',activation:'action',ability:'str',associated:['ath'],dc:'15',range:5,count:1,affects:'creature',spellSlot:false}),
    action('broken','Подтверждено: верёвка разорвана магией',{}, {staffBreak:true}));
   opts.desc='Без настройки; магический боевой посох. Бонусным действием командное слово превращает его в верёвку 50 футов и обратно. Атаки посохом в форме верёвки блокируются. Если верёвка уже держит Опутанное существо, командное слово вместо превращения затягивает её без урона; отдельный профиль накладывает Опутанный. Цель или другое существо в 5 футах действием освобождает её успешной Силой (Атлетика) СЛ 15. Прикреплённый предмет не больше 6 дюймов в каждом измерении не мешает превращению. Разрыв возможен только магией: подтвердите кнопкой, верёвка теряет магию и больше не превращается. Исходную связанность, размеры предметов, успешное освобождение и удаление профиля разрешайте вручную. Возврат расхода отменяет смену формы/утрату магии, но отдельно применённое состояние снимайте отдельно.';
  } else if(id==='shaeden') {
   flags.griffonClass=['sorcerer','warlock','wizard'];flags.focusLastCharge='destroy';opts.uses=uses(15,{period:'dusk',type:'formula',formula:'2d6+3'});
   for(const[en,ru,cost,level]of [['Calm Emotions','Умиротворение',1],['Darkness','Тьма',2],['Dispel Evil and Good','Рассеивание зла и добра',5],['Inflict Wounds','Нанесение ран',3,3],['Circle of Death','Круг смерти',6]])linked(en,en,ru,cost,level?{level}:{});
   acts.push(action('hit','Рукопашное попадание: уничтожающий удар',{consume:[useSelf()]},{staffHit:'shaeden'}));
   opts.desc='Настройка чародеем, колдуном или волшебником; магический боевой посох. Преимущество на спасброски против эффектов, вызывающих душевное потрясение: выбирайте в подходящем броске вручную, это не общее преимущество по Мудрости. 15 зарядов, сумерки 2к6+3. После рукопашного попадания за заряд дополнительно 1к10 некротического урона. При броске урона из карточки одиночного попадания модуль предлагает расход и добавляет кость к исходному урону с его критом. Кнопка свойства заранее оплачивает свежее попадание; затем бросьте урон из той же карточки. Промах, другая атака/цель, старый бросок или возврат расхода не дают усиление. Штатные заклинания с вашей СЛ: Умиротворение 1 заряд, Тьма 2, Рассеивание зла и добра 5, Нанесение ран 3-го уровня 3, Круг смерти 6. Последний заряд: при 1 на к20 уничтожается в иссиня-чёрном дыму с воплем, слышимым в 300 футах; уже оплаченное попадание может разрешить свой урон. Проверка уничтожения и возврат расходов автоматизированы. Несколько атак/целей в одной карточке и последствия уже применённого урона требуют Мастера.';
  } else {
   flags.staffIntelligence=17;opts.uses=uses(8,DAWN('1d6+2'));
   acts.push(tag(attack(`${key}:int`,{name:'Боевой посох: Интеллект',ability:'int',activation:'action',range:5,affects:'creature',spellSlot:false}),{staffIntAttack:true}));
   const bow=bases.records.find(r=>r.name==='longbow').document;
   for(const[ability,label]of [['dex','Ловкость'],['int','Интеллект']]) {
    const a=tag(attack(`${key}:bow:${ability}`,{name:`Длинный лук: ${label}`,ability,attackType:'ranged',activation:'action',condition:'Две руки; только собственная магическая стрела',range:bow.system.range.value,includeBase:false,damage:[dmg('1d8 + @mod + 2','piercing')],affects:'creature',spellSlot:false}),{staffBow:true});
    a.range.override=false;acts.push(a);
   }
   tag(linked('missile','Magic Missile','Волшебная стрела после атаки',1,{activation:'bonus',condition:'Сразу после броска атаки этим оружием в рамках действия Атака'}),{staffMissile:true});
   opts.desc='Настройка существом с Интеллектом 17+. Боевой посох +2; вместо Силы или Ловкости можно использовать Интеллект. Для каждой атаки можно придать ему форму длинного лука без свойства Тяжёлое, с владением: две руки, дистанция 150/600 футов, 1к8 колющего урона. Отдельные кнопки ближней атаки и лука используют обычную характеристику либо Интеллект. Лук создаёт свою магическую стрелу, обычные боеприпасы не расходует и не принимает; стрела исчезает после попадания/промаха, оружие сразу снова становится посохом. 8 зарядов, рассвет 1к6+2. Сразу после броска атаки этим оружием в рамках действия Атака можно за заряд сотворить Волшебную стрелу бонусным действием. После броска модуль предлагает сотворение, также доступна кнопка Cast. Подтвердите, что атака входила в действие Атака и бонусное действие свободно. Модуль связывает сотворение со свежим броском, списывает заряд и использует штатный счётчик бонусного действия, если он настроен системой. Один бросок атаки не даёт повторного сотворения; без общего счётчика свойство ограничено одним применением за собственный ход. Возврат расхода освобождает применение. Другие бонусные действия при отсутствии системного счётчика и особые исключения контролируйте вручную.';
  }
  const doc=weaponTemplate({...opts,key:`item:${key}`,identifier:`griffon-${id}`,name:source.name.slice(0,source.name.lastIndexOf(' [')),book:'GS1',page:'',sourceUrl:source.url,baseItem:'quarterstaff',
   folder:folder('items','Сумка грифона — книга 1/Посохи'),img:'icons/weapons/staves/staff-simple.webp',rarity:source.rarity,attunement:source.attunement?'required':'',magicalBonus:flags.focusWeaponBonus,
   price:{uncommon:400,rare:4000,veryRare:40000}[source.rarity]+native.system.price.value,priceNote:'Цена оценочная: редкость по правилам 2024 плюс стоимость базового предмета; цена в источнике не указана.',
   weight:native.system.weight.value,weightNote:'Вес по обычному боевому посоху 2024; особый вес в источнике не указан.',acts,flags:{spikependium:flags}});
  for(const field of ['type','range','damage','mastery','properties','proficient','ammunition'])if(native.system[field]!==undefined)doc.system[field]=structuredClone(native.system[field]);
  doc.system.properties=[...new Set([...doc.system.properties,'mgc',...(id==='thwack'?['fin']:[])])];doc.system.weight.value=native.system.weight.value;
  if(id==='arcanist-bowstaff'){const bow=bases.records.find(r=>r.name==='longbow').document;doc.system.range.value=bow.system.range.value;doc.system.range.long=bow.system.range.long;}
 }
}
