import {utility,save,dmg,effect,change} from "../../tools/lib/core.mjs";
import {spell,folder} from "../../tools/lib/docs.mjs";

export function define() {
  const aura=effect("spell:au-distance-distortion:area",{name:"Искажение дистанции",transfer:false,
    flags:{spikependium:{arcanaSpell:"distance-distortion"}}});
  const slow=effect("spell:au-distance-distortion:slow",{name:"Головокружительное удлинение",transfer:false,expiry:"targetEnd",
    flags:{spikependium:{distanceProfile:"slow"}}});
  const fast=effect("spell:au-distance-distortion:fast",{name:"Укороченное пространство: +20 футов",transfer:false,expiry:"targetEnd",
    changes:[change("system.attributes.movement.bonus",20)],flags:{spikependium:{distanceProfile:"fast"}}});
  for(const e of [aura,slow,fast])e.system.magical=true;
  const tag=(a,stage)=>{a.flags={spikependium:{distanceStage:stage,...(stage==="cast"?{}:{arcanaStage:"distance-distortion"})}};return a;};
  spell({key:"spell:au-distance-distortion",identifier:"distance-distortion",name:"Искажение дистанции",book:"AU",page:42,
    folder:folder("spells","4 уровень",{sort:5000}),level:4,school:"ill",range:120,components:"ВС",concentration:true,duration:"minute",durationValue:10,
    img:"icons/magic/control/debuff-energy-hold-levitate-pink",effects:[aura,slow,fast],acts:[
      tag(utility("spell:au-distance-distortion:cast",{name:"Создать искажение",activation:"action",self:true,range:120,
        template:{type:"sphere",size:60},concentration:true,duration:"minute",durationValue:10,effects:[aura._id]}),"cast"),
      tag(save("spell:au-distance-distortion:slow",{name:"Головокружительное удлинение",activation:"",rangeUnits:"spec",rangeSpecial:"В активной Сфере",affects:"creature",count:1,
        ability:"int",damage:[dmg("2d10","psychic")],onSave:"none",spellSlot:false,concentration:false,duration:"inst",effects:[{_id:slow._id,onSave:false}]}),"slow"),
      tag(utility("spell:au-distance-distortion:fast",{name:"Укороченное пространство",activation:"",rangeUnits:"spec",rangeSpecial:"В активной Сфере",affects:"creature",count:1,
        spellSlot:false,concentration:false,duration:"inst",effects:[fast._id]}),"fast")],desc:`*Списки: бард, волшебник, изобретатель, колдун.*

Вы создаёте иллюзорное пространственное искажение, заполняющее Сферу радиусом 60 футов с центром в точке в пределах дистанции. Для каждого существа, которое вы можете видеть в Сфере, вы можете выбрать один из следующих эффектов.

**Головокружительное удлинение.** Существо совершает спасбросок Интеллекта. При провале оно получает 2к10 урона Психической энергией, а Сфера становится для него Труднопроходимой местностью до конца его хода. При успехе урона и Труднопроходимой местности нет.

**Укороченное пространство.** Скорость существа увеличивается на 20 футов до конца его следующего хода.

Пока заклинание активно, каждый раз, когда существо входит в Сферу или заканчивает в ней свой ход, вы можете выбрать заставить его получить один из эффектов заклинания. Заклинание может воздействовать на каждое существо только один раз за ход.

**Применение.** Создайте и разместите одну штатную область. Затем выбирайте по одному видимому существу и нужному варианту; в окне подтвердите появление области, вход или конец хода и проверенную геометрию Сферы. Повторные воздействия бесплатны и не расходуют новую ячейку. Ограничение раз за ход общее для обоих вариантов данного сотворения и действует даже при успешном INT. Вне боя продвигайте игровое время и подтверждайте новый ход вручную.

На провалившую INT цель накладывается отдельный эффект: штатная область становится Труднопроходимой только для неё, сохраняя обычную скорость вне области и штатное игнорирование местности. Для этого нужен активный Мастер и включённый штатный учёт перемещения. Эффект удлинения заканчивается в конце текущего своего хода, ускорение — в конце следующего; ускорения одного заклинания не складываются. Ускорение учитывает единицы скорости персонажа. Вне боя сроки подтверждает Мастер.

Вход, видимость и высоту настоящей Сферы проверяет Мастер: штатная область сцены отображает её плоский срез. При объёмном перемещении настройте высоты области и сверяйте маршрут вручную. После расхода свитка временная копия заклинания сохраняет повторные действия до исходного срока, не позволяет нового сотворения и затем удаляется. Числа урона кликабельны; автоматическая связь эффектов использует оплаченные карточки. Изменение уже применённого урона, утраченные события и превращения требуют ручной сверки.`});
}
