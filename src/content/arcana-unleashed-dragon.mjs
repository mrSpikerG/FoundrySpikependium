import {utility,save,check,dmg,effect} from "../../tools/lib/core.mjs";
import {spell,feature,folder,ref} from "../../tools/lib/docs.mjs";

export const DRAGON_ELEMENTS={acid:"Кислота",cold:"Холод",fire:"Огонь",lightning:"Электричество",necrotic:"Некротическая энергия",poison:"Яд"};
export function define(){
 const aura=effect("spell:au-illusory-dragon:aura",{name:"Иллюзорный дракон",transfer:false,flags:{spikependium:{arcanaSpell:"illusory-dragon"}}});
 const fear=effect("spell:au-illusory-dragon:fear",{name:"Иллюзорный дракон: Испуганный",transfer:false,seconds:60,statuses:["frightened"],flags:{spikependium:{arcanaSpell:"illusory-dragon-fear"}}});
 const knowledge=effect("spell:au-illusory-dragon:knowledge",{name:"Иллюзорный дракон распознан",transfer:false,flags:{spikependium:{dragonKnowledgeProfile:true}}});
 for(const e of [aura,fear,knowledge])e.system.magical=true;
 const tag=(a,stage,extra={})=>{a.flags={spikependium:{dragonStage:stage,...(stage==='cast'?{}:{arcanaStage:"illusory-dragon"}),...extra}};return a;};
 spell({key:"spell:au-illusory-dragon",identifier:"illusory-dragon",name:"Иллюзорный дракон",book:"AU",page:41,folder:folder("spells","8 уровень",{sort:9000}),
  level:8,school:"ill",range:120,components:"С",concentration:true,duration:"minute",durationValue:1,img:"icons/creatures/abilities/dragon-breath-purple",
  effects:[aura,fear,knowledge],acts:[
   tag(utility("spell:au-illusory-dragon:cast",{name:"Создать иллюзорного дракона",activation:"action",self:true,range:120,template:{type:"cube",size:15},concentration:true,duration:"minute",durationValue:1,effects:[aura._id]}),'cast'),
   tag(save("spell:au-illusory-dragon:fear",{name:"Страх при появлении дракона",activation:"",rangeUnits:"spec",rangeSpecial:"Любой враг, видящий появление иллюзии",affects:"creature",count:1,ability:"wis",spellSlot:false,concentration:false,duration:"inst",effects:[{_id:fear._id,onSave:false}]}),'fear'),
   tag(utility("spell:au-illusory-dragon:move",{name:"Переместить дракона без дыхания",activation:"bonus",self:true,spellSlot:false,concentration:false,duration:"inst"}),'move'),
   ...Object.entries(DRAGON_ELEMENTS).map(([type,name])=>tag(save(`spell:au-illusory-dragon:breath:${type}`,{name:`Перемещение и дыхание: ${name}`,activation:"bonus",rangeUnits:"self",template:{type:"cone",size:60},affects:"creature",ability:"int",damage:[dmg("6d6",type)],onSave:"half",spellSlot:false,concentration:false,duration:"inst"}),'breath',{dragonElement:type}))
  ],desc:`*Список: волшебник.*

Собирая нити теневой материи из Царства Теней, вы создаёте Огромного дымчатого дракона в незанятом пространстве, которое видите в пределах 120 футов. Иллюзия существует на время Концентрации, до минуты, и занимает пространство, как если бы была существом. Она осязаема благодаря теневой материи, но обладает Иммунитетом ко всем типам урона и состояниям.

При появлении иллюзии каждый враг, который может её видеть, совершает спасбросок Мудрости. При провале он роняет всё, что несёт, и становится Испуганным на время заклинания. Если Испуганное таким образом существо заканчивает ход в пространстве, откуда не видит иллюзию, оно повторяет спасбросок, заканчивая состояние при успехе. Обычного повторного спасброска каждый ход нет.

Бонусным действием вы можете переместить иллюзию не более чем на 60 футов. В любой момент этого перемещения она может выдохнуть заряд энергии 60-футовым Конусом. Каждое существо в Конусе совершает спасбросок Интеллекта, получая 6к6 урона Кислотой, Холодом, Огнём, Электричеством, Некротической энергией или Ядом при провале либо половину при успехе. Тип выбирается при создании дракона и впоследствии не меняется.

Существо может действием Изучение совершить проверку Интеллекта (Расследование) против Сл спасбросков заклинателя. При успехе оно понимает, что дракон — иллюзия. Понимающее это существо видит сквозь дракона и совершает с Преимуществом спасброски для окончания вызванного им страха и против его дыхания. Первоначальный спасбросок от появления не получает этого Преимущества.

**Применение.** При сотворении выберите стихию и разместите штатную область 15 × 15 футов для Огромной иллюзии. Это область, а не существо с выдуманными характеристиками или Хитами. Для каждого видящего её появление врага отдельно используйте бесплатный страх и подтвердите условия. Успешный WIS прекращает страх, повторное первоначальное воздействие на ту же цель заблокировано. Повторяйте WIS из исходной карточки только в конце хода цели, если она не видит дракона; подтвердите это в окне спасброска. В окнах атак и проверок Испуганной цели подтвердите видимость источника страха: тогда применяется Помеха с обычным сочетанием с Преимуществом.

Для Изучения добавьте наблюдателю @UUID[${ref("feature:au-dragon-study")}]{действие исследования иллюзии} из папки «Неудержимая магия → Действия». Оно расходует его собственное Действие и предлагает штатный INT (Расследование) против Сл выбранного дракона. Успех создаёт на наблюдателе переключаемый эффект распознавания; он даёт нужное Преимущество только для данного сотворения.

Для перемещения с дыханием используйте соответствующее Бонусное действие: новая ячейка не тратится, другая стихия не допускается. Перемещайте область вручную не более чем на 60 футов; разместите Конус из положения иллюзии в выбранный момент пути. Дыхание уже включает расход этого Бонусного действия, отдельное перемещение дополнительно не оплачивайте. Путь, занятость пространства, видимость, конец хода, бросаемые предметы и взаимодействие с реальным зрением разрешает Мастер. По окончании Концентрации или минуты исходная область удаляется. Автоматического блокирования прохода и перемещения области пока нет.`});
 const study=tag(check("feature:au-dragon-study:check",{name:"Изучить иллюзорного дракона",activation:"action",self:true,spellSlot:false,ability:"int",associated:["inv"],dc:"0"}),'study');
 feature({key:"feature:au-dragon-study",pack:"feats",typeValue:"monster",identifier:"study-illusory-dragon",name:"Изучить иллюзорного дракона",book:"AU",page:41,
  folder:folder("feats","Неудержимая магия/Действия"),img:"icons/magic/perception/eye-ringed-glow-angry-teal",acts:[study],flags:{spikependium:{key:"feature:au-dragon-study",dragonStudy:true}},
  desc:"Вспомогательное действие наблюдателя для Иллюзорного дракона. Выберите активное сотворение и подтвердите, что можете исследовать его иллюзию. Используйте на собственном листе: расходуется ваше Действие Изучение, а не действие заклинателя. Одна оплата даёт одну проверку; повторная попытка требует нового Действия. Отменённое окно можно продолжить, утраченный несохранённый исход восстанавливает Мастер. Кнопка карточки бросает Интеллект (Расследование) против сохранённой Сл заклинателя. Успех даёт отдельный эффект распознавания этого дракона. Распознавание не меняет первоначальный WIS, но даёт Преимущество INT против дыхания и повторному WIS для окончания страха. Внештатное понимание иллюзии и последствия возврата уже разрешённого исследования сверяет Мастер."});
}
