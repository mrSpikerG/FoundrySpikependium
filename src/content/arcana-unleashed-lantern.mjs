import {utility,save,heal,dmg,effect,useSelf} from "../../tools/lib/core.mjs";
import {spell,folder} from "../../tools/lib/docs.mjs";

export function define() {
  const aura=effect("spell:au-spirit-lantern:aura",{name:"Фонарь духов",transfer:false,seconds:600,
    flags:{spikependium:{arcanaSpell:"spirit-lantern"}}});aura.system.magical=true;
  const guard=effect("spell:au-spirit-lantern:guard",{name:"Фонарь духов: охрана союзника",transfer:false,expiry:"sourceStart",
    flags:{spikependium:{lanternGuardProfile:true}}});guard.system.magical=true;
  const tagged=(a,stage)=>{a.flags={spikependium:{lanternStage:stage,...(stage==="cast"?{}:{arcanaStage:"spirit-lantern"})}};return a;};
  const doc=spell({key:"spell:au-spirit-lantern",identifier:"spirit-lantern",name:"Фонарь духов",book:"AU",page:45,
    folder:folder("spells","5 уровень",{sort:6000}),level:5,school:"nec",rangeUnits:"self",components:"ВСМ",materials:"чёрный фонарь",duration:"minute",durationValue:10,
    img:"icons/sundries/lights/lantern-iron-yellow",effects:[aura,guard],acts:[
      tagged(utility("spell:au-spirit-lantern:cast",{name:"Призвать Фонарь духов",activation:"action",self:true,duration:"minute",durationValue:10,effects:[aura._id]}),"cast"),
      tagged(utility("spell:au-spirit-lantern:collect",{name:"Подтвердить фрагмент погибшего врага",activation:"",range:60,affects:"creature",count:1,spellSlot:false,duration:"inst"}),"collect"),
      tagged(save("spell:au-spirit-lantern:drain",{name:"Вытягивание жизни",activation:"bonus",range:60,affects:"creature",count:1,ability:"con",spellSlot:false,
        damage:[dmg("4d8 + @mod","necrotic")],onSave:"half",duration:"inst",consume:[useSelf()]}),"drain"),
      tagged(heal("spell:au-spirit-lantern:restore",{name:"Восстановление нежити",activation:"bonus",range:60,affects:"creature",count:1,spellSlot:false,
        formula:"4d8 + @mod",duration:"inst",consume:[useSelf()]}),"restore"),
      tagged(utility("spell:au-spirit-lantern:protect",{name:"Охрана союзника",activation:"bonus",range:60,affects:"creature",count:1,spellSlot:false,
        duration:"inst",consume:[useSelf()],effects:[guard._id]}),"protect"),
      tagged(utility("spell:au-spirit-lantern:end",{name:"Погасить Фонарь духов",activation:"",self:true,spellSlot:false,duration:"inst"}),"end")],
    desc:`*Списки: волшебник, жрец, изобретатель, колдун.*

На 10 минут вы призываете чёрный парящий призрачный фонарь, висящий над вами и испускающий Тусклый свет в пределах 60 футов. Концентрация не требуется. Когда в этом Тусклом свете умирает враг, фрагмент его души влетает в фонарь. Фонарь вмещает число фрагментов, равное модификатору вашей заклинательной характеристики. Фрагменты исчезают при окончании заклинания.

Бонусным действием потратьте один фрагмент для одного из следующих эффектов. В каждом случае выберите видимое существо в пределах 60 футов.

**Вытягивание жизни.** Цель совершает спасбросок Телосложения, получая 4к8 урона Некротической энергией плюс ваш модификатор заклинательной характеристики при провале или половину этого урона при успехе. Этот эффект не лечит заклинателя.

**Восстановление нежити.** Выбранная Нежить восстанавливает Хиты в количестве 4к8 плюс ваш модификатор заклинательной характеристики.

**Охрана союзника.** До начала вашего следующего хода другие существа совершают с Помехой броски атаки по выбранному существу. Эффект не даёт Преимущества спасброскам Ловкости и не является действием Уклонение.

**Применение.** Сначала призовите фонарь: запас начинается пустым, свет связан с исходным токеном. Модуль фиксирует положение токенов при добавлении штатного состояния смерти. Для фрагмента выберите погибшего и подтвердите, что это был враг и он находился именно в Тусклом свете фонаря; координаты сами по себе этого не доказывают. Подтверждение не расходует игрового действия; выполните его до следующего расхода фрагмента. Нулевые Хиты без смерти не подходят. Повторное подтверждение той же смерти не добавляет ещё один фрагмент.

Три Бонусных действия используют общий штатный запас заклинания и не расходуют новую ячейку. Подтвердите видимость цели. Лечение ограничено Нежитью, все броски и расход связаны с оплаченной карточкой. Успех CON уменьшает только урон Вытягивания жизни. Охрана использует отдельный эффект до начала следующего хода заклинателя; для атаки по нескольким целям с разными условиями совершайте отдельные броски. Вне боя срок охраны подтверждает Мастер.

«Погасить Фонарь духов» завершает фонарь и очищает оставшиеся фрагменты. Свет снимается с сохранением других источников и исходного освещения токена. При израсходованном свитке временная копия заклинания хранит фонарь и его действия до окончания исходных 10 минут; она не даёт нового сотворения без источника. Изменение уже применённых хитов, перенос души при превращении, пересечение нескольких фонарей одного заклинателя и возврат уже использованного фрагмента требуют сверки Мастером.`});
  doc.system.uses={max:"0",spent:0,recovery:[]};
}
