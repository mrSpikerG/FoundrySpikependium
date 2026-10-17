import {ELEMENTAL_POWER,ELEMENTAL_REACTION} from "./elemental-familiar-data.mjs";
import {elementalInfusion} from "./otherworldly-familiar.mjs";
import {incapacitated,tokensDistance} from "./effects.mjs";
import {reactionAvailable} from "./reactions.mjs";
const KEY="feat:au-elemental-familiar",prepared=new WeakMap(),captured=new WeakMap(),using=new Set(),resolve=id=>typeof id==="string"?(game.messages.get(id)??(id.includes('.')?fromUuidSync(id,{strict:false}):undefined)):undefined;
const command=a=>a?.type==="utility"&&a.item?.flags.spikependium?.key===KEY&&a.flags.spikependium?.elementalFamiliarCommand;
const pulse=a=>a?.type==="save"&&a.id===ELEMENTAL_REACTION&&!!a.item?.flags.spikependium?.elementalFamiliarPower;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),root=(a,event)=>`flags.spikependium.${a?'elementalCommands':'elementalPulseCasts'}.${event}`;
const without=(r,keys)=>Object.fromEntries(Object.entries(r??{}).filter(([k])=>!keys.includes(k)));
function moment(token){
 if(!token?.actor)return;
 const combats=[...game.combats].filter(c=>c.started&&c.getCombatantsByActor(token.actor).length),combat=combats.includes(game.combat)?game.combat:combats.length===1?combats[0]:null;
 if(combats.length&&!combat)return;
 if(combat&&(combat.combatant?.token?.uuid!==token.uuid||combat.combatant?.actor?.uuid!==token.actor.uuid))return;
 return{time:game.time.worldTime,combat:combat?.uuid??null,round:combat?.round??null,turn:combat?.turn??null,combatant:combat?.combatant?.id??null};
}
function near(a,b,feet){const d=a?.parent===b?.parent&&a?.level===b?.level?tokensDistance(a,b):null;return d!==null&&Number.isFinite(d)&&d<=feet+1e-7;}
function ownerToken(a){const t=a.getUsageToken?.();return t?.actor?.uuid===a.actor.uuid?t:null;}
function candidates(a){
 const owner=ownerToken(a);if(!owner||!a.actor.isOwner||incapacitated(a.actor)||!moment(owner))return [];
 return [...owner.parent.tokens].filter(t=>{const info=elementalInfusion(t.actor);return info?.caster?.uuid===a.actor.uuid&&t.actor.isOwner&&near(owner,t,120)&&!incapacitated(t.actor)&&t.actor.system.attributes.hp.value>0&&reactionAvailable(t.actor)&&(game.user.isGM||!t.hidden);});
}
function commandRecord(message){const r=message?.flags.spikependium?.elementalCommand,actor=resolve(r?.caster),saved=actor?.flags.spikependium?.elementalCommands?.[r?.event];
 return message?.type==="usage"&&r&&saved?.active===1&&equal(r,without(saved,['active','state']))&&message.author&&actor.testUserPermission(message.author,"OWNER")
  &&message.system.deltas?.actor?.some(d=>d.keyPath===`${root(true,r.event)}.active`&&d.delta===1)?{r,actor,saved,message}:null;
}
function fresh(c){const owner=resolve(c?.r.ownerToken),familiar=resolve(c?.r.familiar),info=elementalInfusion(familiar?.actor);
 return c&&owner?.actor?.uuid===c.actor.uuid&&familiar?.actor?.uuid===c.r.familiarActor&&c.actor.isOwner&&familiar.actor.isOwner&&!incapacitated(c.actor)
  &&!incapacitated(familiar.actor)&&familiar.actor.system.attributes.hp.value>0&&info?.caster?.uuid===c.actor.uuid&&info.r.event===c.r.generation&&info.r.elemental.type===c.r.element
  &&info.r.elemental.ability===c.r.ability&&near(owner,familiar,120)&&equal(moment(owner),c.r.moment)?{owner,familiar,info}:null;
}
function dc(c){return 8+c.actor.system.abilities[c.r.ability].mod+c.actor.system.attributes.prof;}
function targets(c,message){const f=fresh(c)?.familiar;if(!f)return;
 const out=[];for(const target of message.data?.system?.targets??[]){const t=resolve(target.token);
  if(!t?.actor?.system.isCreature||t.actor.uuid!==target.actor||!near(f,t,5))return;
  out.push({actor:t.actor.uuid,token:t.uuid,size:t.actor.system.traits.size});
 }return out;
}
export function prepareElementalDialog(a,config,dialog,message){
 if(!command(a)&&!pulse(a))return;
 config.hasConsumption=true;if(message)message.hasConsumption=true;
 const Base=dialog.applicationClass;dialog.configure=true;
 dialog.applicationClass=class extends Base{
  async _prepareConsumptionContext(context,options){context=await super._prepareConsumptionContext(context,options);
   if(command(a)){const choices=candidates(a);context.fields.push({name:"spikependium.elementalFamiliarToken",value:this.config.spikependium?.elementalFamiliarToken??choices[0]?.uuid,
    field:new foundry.data.fields.StringField({label:"Фамильяр для Энергетического импульса",choices:Object.fromEntries(choices.map(t=>[t.uuid,t.name]))})});}
   else context.fields.push({name:"spikependium.elementalAreaConfirmed",value:this.config.spikependium?.elementalAreaConfirmed??false,
    field:new foundry.data.fields.BooleanField({label:"Отмечены все существа в 5-футовой Эманации фамильяра; учтено Полное укрытие и включение самого фамильяра"}),input:context.inputs.createCheckboxInput});
   context.hasConsumption=true;return context;
  }
 };
 if(pulse(a)){const c=commandRecord(resolve(config.spikependium?.elementalCommand));if(fresh(c)){a.updateSource({"save.dc.calculation":"","save.dc.formula":String(dc(c))});a.prepareFinalData();}}
}
export function elementalRequiresDialog(wrapped,config){return !!(command(this)||pulse(this))||wrapped(config);}
export function canUseElemental(a,config={},_dialog,message){
 if(command(a)){
  if(!candidates(a).length||Object.values(a.actor.flags.spikependium?.elementalCommands??{}).some(r=>r.active===1&&['pending','invoking','unknown'].includes(r.state))){ui.notifications.warn("Нет подходящего фамильяра с доступной Реакцией либо прежний приказ ещё не разрешён. Проверьте его карточку.");return false;}
 }else if(pulse(a)){
  const c=commandRecord(resolve(config.spikependium?.elementalCommand)),f=fresh(c);
  if(!f||f.familiar.actor.uuid!==a.actor.uuid||c.saved.state!=="invoking"||!reactionAvailable(a.actor)||a.actor.flags.spikependium?.elementalPulseCasts?.[c.r.event]){ui.notifications.warn("Импульс требует свежего приказа владельца, действующей стихийной силы и доступной Реакции фамильяра.");return false;}
 }
 if((command(a)||pulse(a))&&(message?.message||message?.create===false||config.consume===false||config.consume?.action===false)){ui.notifications.warn("Приказ и импульс требуют нового применения с листа, учёта действий и сохранённых карточек. Старый приказ не запускается повторным расходом.");return false;}
}
export function captureElemental(a,config,message){captured.delete(a);if(canUseElemental(a,config,null,message)===false)return false;if(command(a)||pulse(a))captured.set(a,{config,message});}
export function prepareElementalUpdates(a,config,updates){
 prepared.delete(a);if(!command(a)&&!pulse(a))return updates;
 const capture=captured.get(a);captured.delete(a);if(capture?.config!==config)return false;const message=capture.message;
 if(canUseElemental(a,config,null,message)===false)return false;
 let r;
 if(command(a)){const choices=candidates(a),token=choices.find(t=>t.uuid===config.spikependium?.elementalFamiliarToken)??(choices.length===1?choices[0]:null),owner=ownerToken(a),i=elementalInfusion(token?.actor);
  if(!token||!owner||!i)return false;
  r={event:foundry.utils.randomID(),caster:a.actor.uuid,activity:a.uuid,item:a.item.uuid,ownerToken:owner.uuid,familiar:token.uuid,familiarActor:token.actor.uuid,generation:i.r.event,element:i.r.elemental.type,ability:i.r.elemental.ability,moment:moment(owner)};
  updates.actor[root(true,r.event)]={...r,active:1,state:"pending"};
 }else{const c=commandRecord(resolve(config.spikependium?.elementalCommand)),selected=targets(c,message),reaction=updates.actor['flags.spikependium.reactionId'];
  if(!c||!selected||config.spikependium?.elementalAreaConfirmed!==true||!Number.isFinite(dc(c))||!reaction||updates.actor[`flags.spikependium.reactionCasts.${reaction}`]?.spent!==1||a.save.dc.value!==dc(c))return false;
  r={event:c.r.event,command:c.message.uuid,caster:c.actor.uuid,actor:a.actor.uuid,activity:a.uuid,item:a.item.uuid,familiar:c.r.familiar,generation:c.r.generation,element:c.r.element,dc:dc(c),targets:selected,reaction};
  updates.actor[root(false,r.event)]={...r,active:1};
 }
 prepared.set(a,{r,command:!!command(a)});return updates;
}
export function recordElementalConsumption(a,_config,message){const p=prepared.get(a);if(!p)return;const path=`${root(p.command,p.r.event)}.active`;
 if(foundry.utils.getProperty(a.actor,path)!==1)return;const deltas=message.data.system.deltas.actor??=[];if(!deltas.some(d=>d.keyPath===path))deltas.push({keyPath:path,delta:1});
}
export function recordElementalUsage(a,message){const p=prepared.get(a);prepared.delete(a);if(p&&foundry.utils.getProperty(a.actor,`${root(p.command,p.r.event)}.active`)===1)
 foundry.utils.setProperty(message,`data.flags.spikependium.${p.command?'elementalCommand':'elementalPulse'}`,p.r);
}
export async function elementalUse(wrapped,config={},...args){
 if((command(this)||pulse(this))&&config.consume!==false&&config.consume?.action!==false)config={...config,consume:{...config.consume,action:true}};
 if(!command(this))return wrapped(config,...args);
 if(using.has(this.actor.uuid))return;using.add(this.actor.uuid);
 try{const used=await wrapped(config,...args),c=commandRecord(used?.message);if(!c)return used;
  const f=fresh(c),activity=f?.familiar.actor.items.get(ELEMENTAL_POWER)?.system.activities.get(ELEMENTAL_REACTION);
  if(!f||!activity){ui.notifications.warn("После приказа изменились условия. Проверьте карточку и при необходимости отмените её расход.");return used;}
  await c.actor.update({[`${root(true,c.r.event)}.state`]:'invoking'});
  const blind=f.owner.hidden||f.familiar.hidden||c.message.blind,whisper=blind?game.users.filter(u=>u.isGM).map(u=>u.id):c.message.whisper??[];
  const result=await activity.use({consume:{action:true,resources:true,spellSlot:false},scaling:false,create:{measuredTemplate:false},spikependium:{elementalCommand:c.message.uuid}}, {},
   {rollMode:blind?'blind':whisper.length?'gm':'public',data:{speaker:ChatMessage.implementation.getSpeaker({actor:f.familiar.actor,token:f.familiar}),system:{targets:c.message.system.targets??[]},blind,whisper}});
  const paid=f.familiar.actor.flags.spikependium?.elementalPulseCasts?.[c.r.event];
  if(result?.message&&paid?.active===1)await c.actor.update({[`${root(true,c.r.event)}.state`]:'used'});
  else if(!paid&&equal(moment(resolve(c.r.ownerToken)),c.r.moment)){
   await this.refund(c.message.system.deltas);await c.message.update({'system.deltas':null});
  }else{await c.actor.update({[`${root(true,c.r.event)}.state`]:'unknown'});ui.notifications.warn("Не удалось однозначно завершить импульс. Проверьте обе карточки и расходы; автоматического повтора нет.");}
  return used;
 }catch(error){ui.notifications.warn("Приказ прерван: проверьте расход Бонусного действия и Реакции перед повтором.");throw error;}finally{using.delete(this.actor.uuid);}
}
function pulseReceipt(message){const r=message?.flags.spikependium?.elementalPulse,actor=resolve(r?.actor),stored=actor?.flags.spikependium?.elementalPulseCasts?.[r?.event],c=commandRecord(resolve(r?.command));
 return message?.type==="usage"&&r&&stored?.active===1&&equal(r,without(stored,['active']))&&c?.r.event===r.event&&c.r.familiarActor===actor.uuid&&c.r.generation===r.generation&&c.r.element===r.element
  &&message.author&&actor.testUserPermission(message.author,"OWNER")&&message.system.deltas?.actor?.some(d=>d.keyPath===`${root(false,r.event)}.active`&&d.delta===1)
  &&message.system.deltas.actor.some(d=>d.keyPath===`flags.spikependium.reactionCasts.${r.reaction}.spent`&&d.delta===1)?r:null;
}
function rollOrigin(config,message){const id=message.data?.system?.origin??config.event?.target?.closest?.('[data-message-id]')?.dataset.messageId;return resolve(id);}
export function guardElementalRoll(config,_dialog,message){const origin=rollOrigin(config,message),activity=config.subject?.documentName==='Actor'?null:config.subject;
 if(!origin?.flags.spikependium?.elementalPulse&&!pulse(activity))return;
 const r=pulseReceipt(origin);if(!r||config.subject?.documentName==='Actor'&&(!r.targets.some(t=>t.actor===config.subject.uuid)||config.target!==undefined&&config.target!==r.dc)
  ||config.rolls?.some(roll=>roll.options?.type&&roll.options.type!==r.element)){ui.notifications.warn("Нет действующей оплаченной карточки Энергетического импульса либо изменились цель, СЛ или стихия броска.");return false;}
 foundry.utils.setProperty(message,'data.flags.spikependium.elementalPulseSource',origin.uuid);
 if(origin.whisper?.length)foundry.utils.setProperty(message,'data.whisper',[...origin.whisper]);
 if(origin.blind){foundry.utils.setProperty(message,'data.blind',true);message.rollMode='blind';}else if(origin.whisper?.length)message.rollMode='gm';
}
export function guardElementalDamage(_actor,_damage,_updates,options){const id=options?.originatingMessage?.flags?.spikependium?.elementalPulseSource;
 if(id&&!pulseReceipt(resolve(id))){ui.notifications.warn("Расход Энергетического импульса отменён или исходная карточка недоступна; урон не применён.");return false;}
}
export async function refundElemental(wrapped,consumed,...args){
 const isCommand=!!command(this);if(!isCommand&&!pulse(this))return wrapped(consumed,...args);
 const prefix=isCommand?'elementalCommands':'elementalPulseCasts',delta=consumed?.actor?.find(d=>new RegExp(`^flags\\.spikependium\\.${prefix}\\.[A-Za-z0-9]{16}\\.active$`).test(d.keyPath)&&d.delta===1),event=delta?.keyPath.split('.').at(-2),record=this.actor.flags.spikependium?.[prefix]?.[event];
 if(!record)return wrapped(consumed,...args);
 const freshAction=isCommand?equal(moment(resolve(record.ownerToken)),record.moment):this.actor.flags.spikependium?.reactionId===record.reaction&&!reactionAvailable(this.actor);
 const actionPath=`system.attributes.actions.${isCommand?'bonus':'reaction'}.spent`,adjusted=freshAction?consumed:{...consumed,actor:consumed.actor.filter(d=>d.keyPath!==actionPath)};
 let linked;
 if(isCommand&&freshAction){const child=[...game.messages].find(m=>m.flags.spikependium?.elementalPulse?.event===event),r=pulseReceipt(child),actor=resolve(r?.actor),activity=child?.getAssociatedActivity?.();
  if(r&&actor?.isOwner&&pulse(activity)&&actor.flags.spikependium?.reactionId===r.reaction&&!reactionAvailable(actor))linked={child,r,actor,activity};
 }
 const result=await wrapped(adjusted,...args);
 if(linked&&this.actor.flags.spikependium.elementalCommands[event]?.active===0&&equal(moment(resolve(record.ownerToken)),record.moment)
  &&linked.actor.flags.spikependium?.elementalPulseCasts?.[event]?.active===1&&linked.actor.flags.spikependium?.reactionId===linked.r.reaction&&!reactionAvailable(linked.actor)){
  await linked.activity.refund(linked.child.system.deltas);await linked.child.update({'system.deltas':null});
 }
 return result;
}
export function elementalEffectChanges(wrapped,effect,options={}){
 const result=wrapped(effect,options);if(!effect.flags.spikependium?.elementalPulseProne)return result;
 const {chatMessage,target}=options,r=pulseReceipt(chatMessage);if(!r)throw Error("Нет действующей оплаченной карточки Энергетического импульса.");
 const selected=r.targets.filter(t=>t.actor===target?.uuid),ci=target?.system.traits.ci.value;
 if(!selected.length||!selected.every(t=>['tiny','sm','med'].includes(t.size))||ci?.has('ALL')||ci?.has('prone'))return{...result,statuses:[]};
 return result;
}
export function elementalDeltaLabel(wrapped,...args){const result=wrapped(...args);if(/^flags\.spikependium\.(elementalCommands|elementalPulseCasts)\.[A-Za-z0-9]{16}\.active$/.test(this.keyPath))result.label="Энергетический импульс";return result;}
