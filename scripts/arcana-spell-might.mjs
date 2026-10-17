import { attackSignature } from "./attack-source.mjs";

const KEY="feat:au-boon-of-spell-might",captured=new WeakMap(),prepared=new WeakMap(),using=new Set(),falling=new Set();
const resolve=uuid=>uuid&&fromUuidSync(uuid,{strict:false});
const path=event=>`flags.spikependium.spellMight.${event}.active`;
const phase=()=>game.combat?.started?{combat:game.combat.uuid,round:game.combat.round,turn:game.combat.turn}:null;
const featFor=a=>a?.item?.type==="spell"&&a.item.system.level>0&&a.consumption?.spellSlot===true
  ?a.actor?.items.find(i=>i.type==="feat"&&i.flags.spikependium?.key===KEY):null;
const writer=actor=>actor.isOwner&&(game.users.activeGM?game.user.isActiveGM:game.users.find(u=>u.active&&actor.testUserPermission(u,"OWNER"))?.id===game.user.id);
function linkedCast(card){
 const a=card.getAssociatedActivity?.(),f=card.flags.spikependium;
 for(const[key,field,ledger]of [["spell:au-enervation","enervationUse","enervationUses"],["spell:au-spirit-lantern","lanternUse","lanternUses"],
  ["spell:au-distance-distortion","distanceUse","distanceUses"],["spell:au-illusory-dragon","dragonUse","dragonUses"],["spell:au-enthrallment","enthrallmentUse","enthrallmentUses"]]){
  const r=f?.[field],record=a?.actor?.flags.spikependium?.[ledger]?.[r?.event];
  if(a?.item.flags.spikependium?.key===key&&r?.source&&r.caster===a.actor.uuid&&r.activity===a.uuid&&record?.active===1&&JSON.stringify(record.data?.[0])===JSON.stringify(r)
   &&card.system.deltas?.actor?.some(d=>d.keyPath===`flags.spikependium.${ledger}.${r.event}.active`&&d.delta===1)&&card.author&&a.actor.testUserPermission(card.author,"OWNER"))return resolve(r.source);
 }
}
function rootOf(card){const seen=new Set();while(card&&!seen.has(card.uuid)){seen.add(card.uuid);if(card.type==="usage"&&card.flags.spikependium?.spellMight)return card;
  const next=linkedCast(card)??card.getOriginatingMessage?.();card=next&&next!==card?next:typeof card.system?.origin==="string"?game.messages.get(card.system.origin):card.system?.origin;}}
function info(origin){
 const r=origin?.flags.spikependium?.spellMight,caster=resolve(r?.caster),record=caster?.flags.spikependium?.spellMight?.[r?.event],a=origin?.getAssociatedActivity?.({scaled:true}),feat=resolve(r?.feat);
 if(origin?.type!=="usage"||!r||!record||record.active!==1||!/^[A-Za-z0-9]{16}$/.test(r.event)||JSON.stringify(record.data?.[0])!==JSON.stringify(r)
  ||a?.item.type!=="spell"||a.actor?.uuid!==r.caster||a.uuid!==r.activity||a.item.uuid!==r.item||feat?.flags.spikependium?.key!==KEY||feat.actor?.uuid!==r.caster||!caster.items.has(feat.id)
  ||!origin.author||!caster.testUserPermission(origin.author,"OWNER")||r.minimum!=null&&typeof r.minimum!=="boolean"||!Number.isInteger(r.level)||r.level<1||r.level>9||!/^(spell[1-9]|pact)$/.test(r.slot)
  ||r.slot!=="pact"&&Number(r.slot.slice(5))!==r.level||!origin.system.deltas?.actor?.some(d=>d.keyPath===path(r.event)&&d.delta===1)
  ||!origin.system.deltas.actor.some(d=>d.keyPath===`system.spells.${r.slot}.value`&&d.delta===-1)
  ||!origin.system.deltas.item?.[feat.id]?.some(d=>d.keyPath==="system.uses.spent"&&d.delta===1))return;
 return {origin,r,caster,feat,a};
}
export function prepareSpellMight(a,config,dialog){
 const feat=featFor(a);if(!feat||feat.system.uses.value<1)return;const Base=dialog.applicationClass;dialog.configure=true;
 dialog.applicationClass=class extends Base{async _prepareConsumptionContext(context,options){context=await super._prepareConsumptionContext(context,options);
  context.fields.push({name:"spikependium.spellMight",value:this.config.spikependium?.spellMight??false,field:new foundry.data.fields.BooleanField({label:"Перегрузка заклинания — Дар сокрушительной силы",
   hint:"Подтверждаю, что заклинание наносит урон. Расходуется применение дара и ячейка; получившие урон существа Сбиты с ног."}),input:context.inputs.createCheckboxInput},
   {name:"spikependium.spellMightMinimum",value:this.config.spikependium?.spellMightMinimum??true,field:new foundry.data.fields.BooleanField({label:"Перегрузка: минимум 3 на костях урона по умолчанию",
    hint:"Сохраняется для автоматического периодического урона. В обычном окне урона можно изменить выбор для отдельного броска."}),input:context.inputs.createCheckboxInput});context.hasConsumption=true;return context;}};
}
export function captureSpellMight(a,config,message){
 captured.delete(a);prepared.delete(a);if(message.data?.flags?.spikependium)delete message.data.flags.spikependium.spellMight;
 if(!config.spikependium?.spellMight)return;const feat=featFor(a);
 if(!feat||!a.actor.isOwner||feat.system.uses.value<1||config.consume===false||config.consume?.spellSlot===false||message.message||message.create===false
  ||config.spikependium.spellMightMinimum!=null&&typeof config.spikependium.spellMightMinimum!=="boolean"){
  ui.notifications.warn("Перегрузка требует нового сотворения за ячейку, исходной карточки и доступного применения дара.");return false;}
 captured.set(a,{caster:a.actor.uuid,item:a.item.uuid,activity:a.uuid,feat:feat.uuid,time:game.time.worldTime,minimum:config.spikependium.spellMightMinimum??true});
}
export function prepareSpellMightUpdates(a,config,updates){
 prepared.delete(a);const old=captured.get(a);if(!old)return updates;const feat=featFor(a);
 const entries=Object.entries(foundry.utils.flattenObject(updates.actor)).filter(([p,v])=>/^system\.spells\.(spell[1-9]|pact)\.value$/.test(p)&&Number.isFinite(v)&&foundry.utils.getProperty(a.actor,p)-v===1);
 const entry=config.spell?.slot?entries.find(([p])=>p===`system.spells.${config.spell.slot}.value`):entries.length===1?entries[0]:null;
 if(!feat||feat.uuid!==old.feat||feat.system.uses.value<1||game.time.worldTime!==old.time||!entry)return false;
 const slot=entry[0].split(".")[2],level=slot==="pact"?a.actor.system.spells.pact.level:Number(slot.slice(5));if(!Number.isInteger(level)||level<1||level>9)return false;
 const r={...old,event:foundry.utils.randomID(),slot,level};updates.actor[`flags.spikependium.spellMight.${r.event}`]={data:[r],active:1};
 let row=updates.item.find(i=>i._id===feat.id);if(!row)updates.item.push(row={_id:feat.id});
 if(row["system.uses.spent"]!=null&&row["system.uses.spent"]!==feat.system.uses.spent)return false;
 row["system.uses.spent"]=feat.system.uses.spent+1;row["flags.spikependium.spellMightCurrent"]=r.event;prepared.set(a,r);return updates;
}
export function recordSpellMightConsumption(a,_config,message){const r=prepared.get(a);if(!r||foundry.utils.getProperty(a.actor,path(r.event))!==1)return;
 const deltas=((message.data.system??={}).deltas??={}).actor??=[];if(!deltas.some(d=>d.keyPath===path(r.event)))deltas.push({keyPath:path(r.event),delta:1});}
export function recordSpellMightUsage(a,message){const r=prepared.get(a);prepared.delete(a);if(r&&foundry.utils.getProperty(a.actor,path(r.event))===1)foundry.utils.setProperty(message,"data.flags.spikependium.spellMight",r);}
export async function spellMightUse(wrapped,...args){if(!featFor(this))return wrapped(...args);if(using.has(this.actor.uuid))return;using.add(this.actor.uuid);
 // shortcut: native cross-client spending is not atomic; add GM arbitration if owners need simultaneous independent spending.
 try{return await wrapped(...args);}finally{using.delete(this.actor.uuid);}}
export function prepareSpellMightDamage(config,dialog,message){
 const id=config.event?.target?.closest("[data-message-id]")?.dataset.messageId,value=message.data?.system?.origin;
 const root=rootOf(id?game.messages.get(id):typeof value==="string"?game.messages.get(value):value),i=info(root);
 if(!i||config.subject?.actor?.uuid!==i.r.caster||config.subject.item?.uuid!==i.r.item)return;
 config.spikependium={...config.spikependium,spellMightSource:root.uuid,spellMightMinimum:config.spikependium?.spellMightMinimum??i.r.minimum??true};
 if(dialog.configure===false)return;
 const Base=dialog.applicationClass??CONFIG.Dice.DamageRoll.DefaultConfigurationDialog;
 dialog.applicationClass=class extends Base{
  async _prepareConfigurationContext(context,options){context=await super._prepareConfigurationContext(context,options);
   context.fields.push({name:"spikependium.spellMightMinimum",value:this.config.spikependium.spellMightMinimum,field:new foundry.data.fields.BooleanField({label:"Перегрузка: считать 1 и 2 на костях урона как 3",hint:"Можно отключить для этого броска. Получившие урон существа всё равно Сбиты с ног."})});return context;}
  _buildConfig(roll,formData,index){roll=super._buildConfig(roll,formData,index);this.config.spikependium.spellMightMinimum=formData?.get("spikependium.spellMightMinimum")??this.config.spikependium.spellMightMinimum;return roll;}
 };
}
export function finalizeSpellMightDamage(rolls,config,_dialog,message){
 const source=config.spikependium?.spellMightSource;if(!source||config.evaluate===false||!rolls.length)return;
 const i=info(resolve(source));if(!i||config.subject?.actor?.uuid!==i.r.caster||config.subject.item?.uuid!==i.r.item||rolls.some(r=>r._evaluated)){
  ui.notifications.warn("Перегрузка заклинания отменена или исходное сотворение изменилось. Повторите бросок.");return false;}
 const damage=rolls.filter(r=>!(r.options.type in CONFIG.DND5E.healingTypes));if(!damage.length)return;
 const minimum=config.spikependium.spellMightMinimum===true;
 if(minimum)for(const roll of damage){for(const die of roll.dice)if(!die.modifiers.some(m=>/^min\d+$/.test(m)&&Number(m.slice(3))>=3))die.modifiers.push("min3");roll.resetFormula();}
 foundry.utils.setProperty(message,"data.flags.spikependium.spellMightDamage",{source,event:foundry.utils.randomID(),minimum});
 if(i.origin.blind||i.origin.whisper?.length){message.data.whisper=[...i.origin.whisper];message.data.blind=!!i.origin.blind;}
}
function damageInfo(card){const mark=card?.flags.spikependium?.spellMightDamage,i=info(resolve(mark?.source)),a=card?.getAssociatedActivity?.();
 if(card?.type!=="damage"||!i||!/^[A-Za-z0-9]{16}$/.test(mark.event)||typeof mark.minimum!=="boolean"||a?.actor?.uuid!==i.r.caster||a.item?.uuid!==i.r.item||!card.author||!i.caster.testUserPermission(card.author,"OWNER")
  ||!card.rolls.length||!card.rolls.every(r=>r instanceof CONFIG.Dice.DamageRoll&&r._evaluated&&Number.isFinite(r.total))
  ||!card.rolls.some(r=>!(r.options.type in CONFIG.DND5E.healingTypes))||mark.minimum&&card.rolls.some(r=>!(r.options.type in CONFIG.DND5E.healingTypes)
   &&r.dice.some(d=>!d.modifiers.some(m=>/^min\d+$/.test(m)&&Number(m.slice(3))>=3))))return;
 return {...i,card,mark};}
export function spellMightCalculateDamage(wrapped,damages,options={}){
 delete options.spikependiumSpellMightDamage;const result=wrapped(damages,options),i=damageInfo(options.originatingMessage);
 if(i&&Array.isArray(result)&&Number.isFinite(result.amount)){
  const damage=result.filter(d=>!(d.type in CONFIG.DND5E.healingTypes)&&d.type!=="maximum").reduce((n,d)=>n+Math.max(0,d.value),0);
  const healing=result.filter(d=>d.type in CONFIG.DND5E.healingTypes&&d.type!=="maximum").reduce((n,d)=>n-Math.min(0,d.value),0);
  options.spikependiumSpellMightDamage={event:i.mark.event,amount:Math.max(0,Math.min(damage,result.amount+healing))};
 }return result;
}
export function recordSpellMightDamage(actor,amount,updates,options){
 const i=damageInfo(options.originatingMessage),part=options.spikependiumSpellMightDamage;if(!i||!((part?.event===i.mark.event?part.amount:amount)>0)||!actor.system.isCreature||actor.flags.spikependium?.spellMightFalls?.[i.mark.event])return;
 updates[`flags.spikependium.spellMightFalls.${i.mark.event}`]={data:[{actor:actor.uuid,source:i.origin.uuid,damage:i.card.uuid,event:i.mark.event,signature:attackSignature(i.card),time:game.time.worldTime,phase:phase()}],state:"pending"};
}
export async function resumeSpellMightFalls(document){
 const actor=document?.documentName==="Actor"?document:document?.actor??document?.parent?.actor;
 const actors=actor?[actor]:new Map([...game.actors,...[...game.scenes].flatMap(s=>[...s.tokens].map(t=>t.actor))].filter(Boolean).map(a=>[a.uuid,a])).values();
 for(const target of actors){if(!writer(target))continue;for(const[event,request]of Object.entries(target.flags.spikependium?.spellMightFalls??{})){
  const r=request.data?.[0],lock=`${target.uuid}:${event}`;if(!["pending","applying"].includes(request.state)||falling.has(lock)||r?.event!==event||r.actor!==target.uuid)continue;
  const i=damageInfo(resolve(r.damage));if(!i||i.mark.event!==event||i.origin.uuid!==r.source||attackSignature(i.card)!==r.signature)continue;
  falling.add(lock);try{
   const at=`flags.spikependium.spellMightFalls.${event}.state`,existing=target.effects.some(e=>e.flags.spikependium?.spellMightFall===event);
   if(existing||target.statuses.has("prone")||["prone","ALL","all"].some(s=>target.system.traits?.ci?.value.has(s))){await target.update({[at]:"done"});continue;}
   if(request.state==="applying"){await target.update({[at]:"review"});ui.notifications.warn("Исход создания Сбит с ног от Перегрузки неизвестен. Мастер проверяет состояние вручную; повторного наложения нет.");continue;}
   if(r.time!==game.time.worldTime||JSON.stringify(r.phase)!==JSON.stringify(phase())){await target.update({[at]:"review"});ui.notifications.warn("Сбит с ног от Перегрузки не было разрешено в исходный момент. Мастер сверяет прошлые последствия вручную.");continue;}
   const effect=await ActiveEffect.implementation.fromStatusEffect("prone"),data=effect.toObject();data.flags??={};data.flags.spikependium={...data.flags.spikependium,spellMightFall:event};
   await target.update({[at]:"applying"});
   await target.createEmbeddedDocuments("ActiveEffect",[data]);await target.update({[at]:"done"});
  }finally{falling.delete(lock);}
 }}
}
export function refundSpellMight(wrapped,consumed,...args){
 const delta=consumed.actor?.find(d=>/^flags\.spikependium\.spellMight\.[A-Za-z0-9]{16}\.active$/.test(d.keyPath)&&d.delta===1),event=delta?.keyPath.split(".").at(-2),record=this.actor.flags.spikependium?.spellMight?.[event],r=record?.data?.[0],feat=resolve(r?.feat);
 if(r?.caster===this.actor.uuid&&r.item===this.item.uuid){consumed=foundry.utils.deepClone(consumed);
  if(record.active!==1)consumed.actor=consumed.actor.filter(d=>d.keyPath!==delta.keyPath);
  if(feat&&consumed.item?.[feat.id]&&(!feat.system.uses.spent||feat.flags.spikependium?.spellMightCurrent!==event||record.active!==1))consumed.item[feat.id]=consumed.item[feat.id].filter(d=>d.keyPath!=="system.uses.spent");
 }
 return wrapped(consumed,...args);
}
export function spellMightDeltaLabel(wrapped,...args){const data=wrapped(...args);if(/^flags\.spikependium\.spellMight\.[A-Za-z0-9]{16}\.active$/.test(this.keyPath))data.label="Перегрузка заклинания";return data;}
export function spellMightError(error){console.error("Spikependium: Перегрузка заклинания",error);ui.notifications.error("Перегрузка заклинания не завершена. Проверьте исходную карточку и состояние цели перед повтором.");}
