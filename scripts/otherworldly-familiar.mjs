import {ELEMENTS,elementalPowerData} from "./elemental-familiar-data.mjs";
const KEY="feat:au-otherworldly-familiar",ELEMENTAL="feat:au-elemental-familiar",TYPES={thunder:"Звук",radiant:"Излучение",necrotic:"Некротическая энергия",psychic:"Психическая энергия",poison:"Яд"};
const prepared=new WeakMap(),casts=new WeakMap(),placing=new WeakSet(),resolve=id=>id&&fromUuidSync(id,{strict:false});
const supported=a=>a?.type==="summon"&&a.item?.type==="spell"&&a.item.system.identifier==="find-familiar";
const feat=(a,key=KEY)=>a.actor?.items.find(i=>i.flags.spikependium?.key===key);
const tracked=a=>supported(a)&&(feat(a)||feat(a,ELEMENTAL)||a.actor?.flags.spikependium?.otherworldlyFamiliarCurrent);
function valid(r,a){
 const caster=resolve(r?.caster),record=caster?.flags.spikependium?.otherworldlyFamiliarCasts?.[r?.event];
 return caster&&record?.active===1&&caster.flags.spikependium.otherworldlyFamiliarCurrent===r.event
  &&JSON.stringify(r)===JSON.stringify(Object.fromEntries(Object.entries(record).filter(([k])=>!['active','token','placement'].includes(k))))
  &&(!a||supported(a)&&a.uuid===r.activity&&a.item.uuid===r.item&&a.actor.uuid===r.caster);
}
export function prepareOtherworldlyDialog(a,_config,dialog){
 if(!supported(a)||!feat(a)&&!feat(a,ELEMENTAL))return;
 const Base=dialog.applicationClass;dialog.configure=true;dialog.applicationClass=class extends Base{
  async _prepareConsumptionContext(context,options){context=await super._prepareConsumptionContext(context,options);
   if(feat(a))context.fields.push({name:"spikependium.otherworldlyFamiliar",value:this.config.spikependium?.otherworldlyFamiliar??"none",
    field:new foundry.data.fields.StringField({label:"Потусторонняя сила фамильяра",choices:{none:"Не усиливать",...TYPES},hint:"Выбранное сопротивление и Фазовое перемещение действуют до следующего сотворения Обретения фамильяра."})});
   if(feat(a,ELEMENTAL))context.fields.push({name:"spikependium.elementalFamiliar",value:this.config.spikependium?.elementalFamiliar??"acid",field:new foundry.data.fields.StringField({label:"Стихийная энергия фамильяра",choices:ELEMENTS})});context.hasConsumption=true;return context;
  }
 };
}
export function canConsumeOtherworldly(a,_config,message){
 if(tracked(a)&&message.create===false){ui.notifications.warn("Для учёта усилений нужна исходная карточка Обретения фамильяра.");return false;}
}
export function prepareOtherworldlyUpdates(a,config,updates){
 prepared.delete(a);if(!tracked(a))return updates;
 const source=feat(a),damage=config.spikependium?.otherworldlyFamiliar??"none";
 if(!a.actor.isOwner||damage!=="none"&&(!source||!Object.hasOwn(TYPES,damage))){ui.notifications.warn("Проверьте черту и выбранный тип Потусторонней силы.");return false;}
 const event=foundry.utils.randomID(),r={event,caster:a.actor.uuid,activity:a.uuid,item:a.item.uuid,feat:source?.uuid??null,damage,time:game.time.worldTime};
 const element=feat(a,ELEMENTAL);if(element){const type=config.spikependium?.elementalFamiliar??"acid",friend=feat(a,"feat:familiar-friend"),granted=a.item.system.sourceItem==="feat:familiar-friend"?friend?.system.advancement.find(s=>s.type==="ItemGrant")?.value.ability:null,ability=granted||a.ability||a.item.system.ability||a.actor.system.attributes.spellcasting;
  if(!Object.hasOwn(ELEMENTS,type)||!["int","wis","cha"].includes(ability)||!Number.isFinite(a.actor.system.abilities[ability]?.mod)||!Number.isFinite(a.actor.system.attributes.prof)){ui.notifications.warn("Проверьте стихию и заклинательную характеристику Обретения фамильяра.");return false;}
  r.elemental={feat:element.uuid,type,ability};
 }
 updates.actor[`flags.spikependium.otherworldlyFamiliarCasts.${event}`]={...r,active:1};
 updates.actor["flags.spikependium.otherworldlyFamiliarCurrent"]=event;prepared.set(a,r);return updates;
}
export function recordOtherworldlyConsumption(a,_config,message){
 const r=prepared.get(a);if(!valid(r,a))return;
 const path=`flags.spikependium.otherworldlyFamiliarCasts.${r.event}.active`,deltas=message.data.system.deltas.actor??=[];
 if(!deltas.some(d=>d.keyPath===path))deltas.push({keyPath:path,delta:1});
}
export function recordOtherworldlyCast(a,message){
 const r=prepared.get(a);prepared.delete(a);if(!valid(r,a))return;
 casts.set(a,r);foundry.utils.setProperty(message,"data.flags.spikependium.otherworldlyFamiliar",r);
}
function placed(r){return resolve(r.caster)?.flags.spikependium?.otherworldlyFamiliarCasts?.[r.event]?.token
 ||[...game.scenes].some(s=>s.tokens.some(t=>t.actor?.flags.spikependium?.otherworldlyFamiliar?.event===r.event));}
export function canPlaceOtherworldly(a){
 if(!tracked(a))return;
 const r=casts.get(a),state=resolve(r?.caster)?.flags.spikependium?.otherworldlyFamiliarCasts?.[r?.event]?.placement;
 if(valid(r,a)&&!placed(r)&&(state!=="placing"||placing.has(a)))return;
 ui.notifications.warn("Карточка фамильяра уже использована, отменена или заменена новым сотворением. Для нового призыва сотворите заклинание заново.");return false;
}
export function prepareOtherworldlyToken(a,profile,config){
 if(!tracked(a))return;
 if(canPlaceOtherworldly(a)===false)return false;
 const r=casts.get(a);if(!a.profiles.some(p=>p._id===profile._id&&p.uuid===profile.uuid))return false;
 config.actorUpdates["flags.spikependium.otherworldlyFamiliar"]=structuredClone(r);
 if(r.elemental){const caster=a.actor,dc=8+caster.system.abilities[r.elemental.ability].mod+caster.system.attributes.prof;
  config.actorUpdates.effects.push({_id:"spikeElemental00",type:"base",name:`Стихийная энергия: ${ELEMENTS[r.elemental.type]}`,img:"icons/magic/fire/explosion-embers-orange.webp",transfer:false,disabled:false,statuses:[],system:{origin:{activity:a.uuid},changes:[{key:"system.traits.dr.value",type:"add",value:r.elemental.type,priority:null}]},flags:{spikependium:{elementalFamiliarTemplate:structuredClone(r)}}});
  config.actorUpdates.items.push(elementalPowerData(r,dc));
 }
 if(!Object.hasOwn(TYPES,r.damage))return;
 config.actorUpdates.effects.push({_id:"spikeOtherworldly",type:"base",name:`Потусторонняя сила: ${TYPES[r.damage]}`,img:"icons/magic/death/undead-ghosts-trio-blue.webp",transfer:false,disabled:false,statuses:[],
  system:{origin:{activity:a.uuid},changes:[{key:"system.traits.dr.value",type:"add",value:r.damage,priority:null}]},flags:{spikependium:{otherworldlyFamiliarTemplate:structuredClone(r)}}});
 config.actorUpdates.items.push({_id:"spikePhaseMove00",name:"Фазовое перемещение",type:"feat",img:"icons/magic/death/undead-ghosts-trio-blue.webp",
  flags:{spikependium:{otherworldlyFamiliarTrait:structuredClone(r)}},system:{identifier:"otherworldly-familiar-phasing",type:{value:"monster",subtype:""},source:{book:"AU",page:"32",rules:"2024"},activities:{},advancement:[],
   description:{value:"<p>Пока действует Потусторонняя сила, фамильяр может перемещаться сквозь других существ и объекты, как если бы они были Труднопроходимой местностью. Если он заканчивает ход внутри объекта, его выталкивает в последнее незанятое пространство, где он был.</p><p>Мастер проверяет объём объектов, стоимость движения и последнее свободное место. Стены и перемещение автоматически не изменяются; не добавляйте урон за выталкивание — эта черта его не наносит.</p>"}}});
}
export async function recordOtherworldlyPlaced(a,_profile,tokens){
 if(!tracked(a)||!a.actor.isOwner)return;
 for(const t of tokens){const r=t.actor?.flags.spikependium?.otherworldlyFamiliar;if(valid(r,a))await a.actor.update({[`flags.spikependium.otherworldlyFamiliarCasts.${r.event}.token`]:t.uuid,[`flags.spikependium.otherworldlyFamiliarCasts.${r.event}.placement`]:"placed"});}
}
export async function placeOtherworldlySummons(wrapped,...args){
 if(!tracked(this))return wrapped(...args);
 if(placing.has(this)||!this.actor.isOwner||canPlaceOtherworldly(this)===false)return [];
 const r=casts.get(this),path=`flags.spikependium.otherworldlyFamiliarCasts.${r.event}.placement`;placing.add(this);
 try{
  await this.actor.update({[path]:"placing"});
  if(!valid(r,this)||placed(r))return [];
  const result=await wrapped(...args);
  if(result?.length)await recordOtherworldlyPlaced(this,null,result);
  else if(valid(r,this)&&!placed(r))await this.actor.update({[path]:"ready"});
  return result;
 }catch(error){
  ui.notifications.warn("Неизвестен итог размещения фамильяра. Проверьте сцену; повтор из той же карточки заблокирован. Если токен не создан, отмените расход и сотворите заклинание заново.");throw error;
 }finally{placing.delete(this);}
}
export async function otherworldlyChatAction(wrapped,event,target,message){
 if(!tracked(this)||target.dataset.action!=="placeSummons")return wrapped(event,target,message);
 const r=message.flags.spikependium?.otherworldlyFamiliar;
 if(message.type!=="usage"||!message.author||!this.actor.testUserPermission(message.author,"OWNER")||!valid(r,this)
  ||!message.system.deltas?.actor?.some(d=>d.keyPath===`flags.spikependium.otherworldlyFamiliarCasts.${r.event}.active`&&d.delta===1))return;
 const previous=casts.get(this);casts.set(this,r);try{return await wrapped(event,target,message);}finally{if(previous)casts.set(this,previous);else casts.delete(this);}
}
function bound(actor,r,elemental=false){const mark=actor?.flags.spikependium?.otherworldlyFamiliar;
 return valid(r)&&(elemental?Object.hasOwn(ELEMENTS,r.elemental?.type):Object.hasOwn(TYPES,r.damage))&&JSON.stringify(mark)===JSON.stringify(r);
}
export function elementalInfusion(actor){const r=actor?.flags.spikependium?.otherworldlyFamiliar;
 return bound(actor,r,true)&&actor.effects.some(e=>e.flags.spikependium?.elementalFamiliarTemplate?.event===r.event&&e.active&&!e.duration?.expired&&!(Number.isFinite(e.duration?.remaining)&&e.duration.remaining<=0))?{r,caster:resolve(r.caster)}:null;
}
export function otherworldlySuppression(wrapped,...args){
 const r=this.flags.spikependium?.otherworldlyFamiliarTemplate??this.flags.spikependium?.elementalFamiliarTemplate;
 return r&&!bound(this.actor,r,!!this.flags.spikependium?.elementalFamiliarTemplate)||wrapped(...args);
}
let running=false,pending=false;
export async function cleanOtherworldlyFamiliars(){
 pending=true;if(running)return;running=true;
 try{do{pending=false;const actors=[...new Map([...game.actors,...[...game.scenes].flatMap(s=>[...s.tokens].map(t=>t.actor))].filter(Boolean).map(a=>[a.uuid,a])).values()];
  for(const actor of actors){const effects=actor.effects.filter(e=>e.flags.spikependium?.otherworldlyFamiliarTemplate||e.flags.spikependium?.elementalFamiliarTemplate),items=actor.items.filter(i=>i.flags.spikependium?.otherworldlyFamiliarTrait||i.flags.spikependium?.elementalFamiliarPower);
   if(!effects.length&&!items.length)continue;actor.reset();actor.sheet?.render(false);
   const writer=game.users.activeGM?game.user.isActiveGM:[...game.users].filter(u=>u.active&&actor.testUserPermission(u,"OWNER")).sort((a,b)=>a.id.localeCompare(b.id))[0]?.id===game.user.id;
   if(!actor.isOwner||!writer)continue;
   const stale=effects.filter(e=>!bound(actor,e.flags.spikependium.otherworldlyFamiliarTemplate??e.flags.spikependium.elementalFamiliarTemplate,!!e.flags.spikependium.elementalFamiliarTemplate)).map(e=>e.id);
   if(stale.length)await actor.deleteEmbeddedDocuments("ActiveEffect",stale);
   const old=items.filter(i=>!bound(actor,i.flags.spikependium.otherworldlyFamiliarTrait??i.flags.spikependium.elementalFamiliarPower,!!i.flags.spikependium.elementalFamiliarPower)).map(i=>i.id);if(old.length)await actor.deleteEmbeddedDocuments("Item",old);
  }
 }while(pending);}finally{running=false;}
}
export function otherworldlyDeltaLabel(wrapped,...args){const result=wrapped(...args);if(/^flags\.spikependium\.otherworldlyFamiliarCasts\.[A-Za-z0-9]{16}\.active$/.test(this.keyPath))result.label="Потусторонняя сила фамильяра";return result;}
