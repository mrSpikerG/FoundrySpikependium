export const ELEMENTS={acid:"Кислота",cold:"Холод",fire:"Огонь",lightning:"Электричество",thunder:"Звук"};
export const ELEMENTAL_POWER="spikeElemPulse00",ELEMENTAL_REACTION="spikeElemReact00",ELEMENTAL_PRONE="spikeElemProne00";
export function elementalPowerData(r,dc){return{
 _id:ELEMENTAL_POWER,type:"feat",name:"Энергетический импульс",img:"icons/magic/fire/explosion-embers-orange.webp",
 flags:{spikependium:{elementalFamiliarPower:structuredClone(r)}},
 system:{identifier:"elemental-familiar-pulse",type:{value:"monster",subtype:""},source:{book:"AU",page:"32",rules:"2024"},advancement:[],
  description:{value:`<p>После приказа владельца Бонусным действием фамильяр в пределах 120 футов расходует Реакцию. Каждое существо в его 5-футовой Эманации совершает спасбросок Ловкости. При провале — [[/damage 2d4 ${r.elemental.type}]] урона; цель размера Средний или меньше Сбита с ног. Успех не наносит урона и не сбивает.</p><p>СЛ равна 8 + модификатор характеристики владельца для Обретения фамильяра + его Бонус владения. Отметьте все затронутые существа и подтвердите область без Полного укрытия. Приказ открывает это действие автоматически; после бросков применяйте урон и состояние штатными кнопками карточки.</p>`},
  activities:{[ELEMENTAL_REACTION]:{_id:ELEMENTAL_REACTION,type:"save",name:"Энергетический импульс",activation:{type:"reaction",value:1,override:true},consumption:{targets:[],spellSlot:false},
   range:{units:"self",override:true},target:{template:{type:"radius",size:"5",units:"ft"},affects:{type:"creature"},prompt:false,override:true},
   save:{ability:["dex"],dc:{calculation:"",formula:String(dc)},bonus:""},damage:{onSave:"none",parts:[{custom:{enabled:false,formula:""},number:2,denomination:4,bonus:"",types:[r.elemental.type],scaling:{mode:"",number:null,formula:""}}]},effects:[{_id:ELEMENTAL_PRONE,onSave:false}]}}},
 effects:[{_id:ELEMENTAL_PRONE,name:"Энергетический импульс: Сбит с ног",type:"base",img:"systems/dnd5e/icons/svg/statuses/prone.svg",transfer:false,disabled:false,statuses:["prone"],duration:{value:null,units:"seconds",expiry:null},system:{changes:[],magical:false},flags:{spikependium:{elementalPulseProne:true}}}]
};}
