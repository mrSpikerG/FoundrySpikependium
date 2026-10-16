import {attackSignature} from './attack-source.mjs';
import {attackHitTargets} from './companions.mjs';
const kind=i=>i?.flags?.spikependium?.griffonBelt;
const resolve=uuid=>uuid&&fromUuidSync(uuid,{strict:false});
const canonical=i=>i?.actor?.items?.get(i.id)??i;
const root=(a,c={})=>a?.getLinkedActivity?.(c.cause?.activity)??a;
const active=i=>i?.actor?.isOwner&&i.actor.items.get(i.id)===i&&i.system.quantity===1&&i.system.equipped&&(i.system.attunement!=='required'||i.system.attuned)&&i.system.magicAvailable!==false;
const bottle=i=>i?.type==='consumable'&&i.system.type.value==='potion'&&i.system.quantity===1&&!i.system.container;
const slots=i=>i.flags.spikependium.potionSlots??{};
const bound=(i,p)=>active(i)&&kind(i)==='potion-belt'&&[1,2].includes(slots(i)[p.id]);
const belts=a=>[...(a?.items??[])].filter(i=>kind(i)&&active(i));
const occupied=(i,slot)=>Object.entries(slots(i)).find(([id,n])=>n===slot&&bottle(i.actor.items.get(id)))?.[0]??'';
export function potionBeltBottles(item){const bottles=active(item)&&kind(item)==='potion-belt'?Object.entries(slots(item)).filter(([id,n])=>[1,2].includes(n)&&bottle(item.actor.items.get(id))).map(([id,slot])=>{const p=item.actor.items.get(id);return{id,slot,spent:p.system.uses.spent,created:p._stats?.createdTime??null};}):[];return new Set(bottles.map(b=>b.slot)).size===bottles.length?bottles:[];}
function pendingBreak(item){return Object.values(item.flags.spikependium.potionBreaks??{}).some(r=>r.active===1&&r.value===1&&!r.broken&&!r.choice);}
const ownCost=a=>a.consumption.targets.find(c=>c.type==='itemUses'&&!c.target&&Number.isFinite(Number(c.value))&&Number(c.value)>0);
const turn=()=>game.combat?.started?`${game.combat.id}:${game.combat.current?.round??game.combat.round}:${game.combat.current?.turn??game.combat.turn}`:null;
const starting=new Map(),pending=new WeakMap(),calculations=new WeakMap(),applying=new Set(),recoveries=new WeakMap();
function available(item,p){return bottle(p)&&![...item.actor.items].some(i=>i!==item&&kind(i)==='potion-belt'&&[1,2].includes(slots(i)[p.id]));}
function trollReady(i){const a=i?.actor,hp=a?.system.attributes.hp,s=a?.flags.spikependium?.trollSuppression?.[i?.id];return active(i)&&kind(i)==='mosshide-troll-belt'&&turn()&&game.combat.combatant?.actor?.uuid===a.uuid&&hp.value>0&&hp.value<hp.max/2&&!(s?.acidUntil>game.time.worldTime)&&s?.zeroEpoch!==(i.flags.spikependium.trollDawnEpoch??0);}
export function canUseBelt(activity,config={},_dialog,message){
 const r=root(activity,config),i=canonical(r?.item),f=r?.flags?.spikependium;if(!kind(i))return;
 if(!active(i))return false;
 if((f?.potionAttach||f?.potionDetach)&&pendingBreak(i)){ui.notifications.warn('Сначала разрешите ожидающее разбитие бутылки на поясе.');return false;}
 if(f?.trollRegenerate&&(!trollReady(i)||starting.get(i.actor.uuid)!==turn()||i.actor.flags.spikependium?.trollAppliedTurn===turn()))return false;
 if(f?.potionDetach&&!occupied(i,f.potionDetach))return false;
 if(message&&(f?.potionAttach||f?.potionDetach||f?.trollRegenerate)){if(message.create===false)return false;message.hasConsumption=true;}
 if(f?.trollRegenerate&&message)foundry.utils.setProperty(message,'data.flags.spikependium.trollRegeneration',{item:i.uuid,actor:i.actor.uuid,turn:turn()});
}
export async function beltUse(wrapped,config={},...args){
 const item=canonical(this.item),slot=this.flags?.spikependium?.potionAttach;
 if(kind(item)!=='potion-belt'||!slot)return wrapped(config,...args);
 if(canUseBelt(this)===false)return;
 const candidates=[...item.actor.items].filter(p=>available(item,p));
 if(!candidates.length){ui.notifications.warn('Нужна отдельная бутылка зелья вне контейнера, не закреплённая на другом поясе.');return;}
 const escape=foundry.utils.escapeHTML,answer=await foundry.applications.api.DialogV2.input({window:{title:`Зельевой пояс: гнездо ${slot}`},rejectClose:false,content:`<p>Закрепление расходует действие. Прежняя бутылка, если есть, освобождается.</p><select name="potion">${candidates.map(p=>`<option value="${p.id}">${escape(p.name)}</option>`).join('')}</select>`,ok:{label:'Закрепить'}});
 if(!answer)return;
 return wrapped({...config,spikependium:{...config.spikependium,potionAttachment:{potion:answer.potion,previous:occupied(item,slot)}}},...args);
}
export function preparePotionUse(activity,_config,_dialog,message){
 const r=root(activity),p=canonical(r?.item);if(!bottle(p)||!ownCost(r))return;
 const attached=belts(p.actor).filter(i=>bound(i,p));if(attached.length!==1)return;
 const belt=attached[0];
 if(pendingBreak(belt)){ui.notifications.warn('Сначала разрешите ожидающее разбитие бутылки на поясе.');return false;}
 if(Object.entries(slots(belt)).some(([id,n])=>id!==p.id&&n===slots(belt)[p.id]&&bottle(p.actor.items.get(id))))return false;
 activity.updateSource({'activation.type':'bonus','activation.value':1,'activation.override':true,'range.units':'self','range.override':true,'target.affects.type':'self','target.affects.count':'1','target.override':true,'flags.spikependium.potionBeltUse':belt.uuid});
 if(message)message.hasConsumption=true;
}
export function prepareBeltUpdates(activity,config,updates){
 pending.delete(activity);
 const r=root(activity,config),i=canonical(r?.item),mark=activity.flags?.spikependium?.potionBeltUse;
 if(mark){const belt=resolve(mark),cost=ownCost(r);if(!bottle(i)||!cost||!bound(belt,i)||belt.actor.uuid!==i.actor.uuid||pendingBreak(belt))return false;
  const payment=updates.item.find(u=>u._id===i.id);if(!updates.delete.includes(i.id)&&payment?.['system.uses.spent']!==i.system.uses.spent+Number(cost.value))return false;
 }
 if(!kind(i))return updates;
 if(canUseBelt(activity,config)===false)return false;
 for(const c of r.consumption.targets)if(c.type==='itemUses'&&!c.target&&updates.item.find(u=>u._id===i.id)?.['system.uses.spent']!==i.system.uses.spent+Number(c.value))return false;
 if(r.flags?.spikependium?.trollRegenerate){const update=updates.item.find(u=>u._id===i.id),spent=update?.[`system.activities.${r.id}.uses.spent`]??update?.[`system.activities.${r.id}`]?.uses?.spent??updates.activity['uses.spent']??updates.activity.uses?.spent;if(spent!==r.uses.spent+1)return false;}
 const f=r.flags?.spikependium,slot=f?.potionAttach??f?.potionDetach;if(!slot)return updates;
 const selected=config.spikependium?.potionAttachment,p=f.potionAttach&&i.actor.items.get(selected?.potion);
 if(f.potionAttach&&(!available(i,p)||selected.previous!==occupied(i,slot)))return false;
 let update=updates.item.find(u=>u._id===i.id);if(!update)updates.item.push(update={_id:i.id});
 for(const[id,n]of Object.entries(slots(i)))if(n===slot)update[`flags.spikependium.potionSlots.${id}`]=0;
 if(p){const path=`flags.spikependium.potionSlots.${p.id}`;update[path]=slot;if(slots(i)[p.id]===undefined)pending.set(activity,{item:i,path,value:slot});}
 return updates;
}
export function recordBeltConsumption(activity,_config,message){
 const r=pending.get(activity);pending.delete(activity);if(!r||foundry.utils.getProperty(r.item,r.path)!==r.value)return;
 const deltas=((((message.data.system??={}).deltas??={}).item??={})[r.item.id]??=[]);
 if(!deltas.some(d=>d.keyPath===r.path))deltas.push({keyPath:r.path,delta:r.value});
}
export function prepareHellHoundAttack(config){
 const item=belts(config.subject?.actor).find(i=>kind(i)==='hell-hound-belt');if(!item)return;
 for(const roll of config.rolls)(roll.options??={}).spikependiumHellHound=item.uuid;
}
export async function hellHoundDamage(wrapped,config={},dialog={},message={}){
 const stamp=message.data?.flags?.spikependium?.attackSource,card=stamp&&resolve(stamp.message);
 const roll=card?.rolls?.[0],item=resolve(roll?.options?.spikependiumHellHound),hits=card&&attackHitTargets(card);
 const eligible=active(item)&&kind(item)==='hell-hound-belt'&&item.actor.uuid===this.actor?.uuid&&card.type==='attack'&&card.getAssociatedActivity()?.uuid===this.uuid
  &&card.author&&item.actor.testUserPermission(card.author,'OWNER')&&roll instanceof CONFIG.Dice.D20Roll&&roll._evaluated&&roll.options.advantageMode===1
  &&['mwak','msak'].includes(this.getActionType(card.system.mode))&&stamp?.signature===attackSignature(card)&&hits.length&&hits.every(h=>h.token.actor?.type==='character'||h.token.actor?.system?.details?.type?.value);
 return wrapped({...config,spikependiumHellHound:eligible?item.uuid:null},dialog,message);
}
export function beltDamageParts(wrapped,config={},...args){
 const parts=wrapped(config,...args),i=resolve(config.spikependiumHellHound);if(!parts.length||!active(i)||kind(i)!=='hell-hound-belt'||i.actor.uuid!==this.actor?.uuid)return parts;
 const fire=parts[0].clone({number:1,denomination:6,bonus:'',types:['fire'],custom:{enabled:false,formula:''},scaling:{mode:'',number:null,formula:''}});fire.base=false;return[...parts,fire];
}
export function recordTrollCalculation(actor,damages,options){
 let map=calculations.get(options);if(!map)calculations.set(options,map=new Map());map.set(actor.uuid,damages.amount>0&&damages.some(d=>['acid','fire'].includes(d.type)&&d.value>0));
}
export function beltCalculateDamage(wrapped,damages,options={}){
 const result=wrapped(damages,options);if(result)recordTrollCalculation(this,result,options);return result;
}
export function recordTrollZero(actor,changes){
 const v=changes['system.attributes.hp.value']??foundry.utils.getProperty(changes,'system.attributes.hp.value');if(v===undefined||v===null||!Number.isFinite(Number(v))||Number(v)>0||!(actor.system.attributes.hp.value>0))return;
 for(const i of belts(actor).filter(i=>kind(i)==='mosshide-troll-belt'))changes[`flags.spikependium.trollSuppression.${i.id}.zeroEpoch`]=i.flags.spikependium.trollDawnEpoch??0;
}
function regenCard(card){const seen=new Set();while(card&&!seen.has(card)){seen.add(card);if(card.flags?.spikependium?.trollRegeneration)return card;card=card.getOriginatingMessage?.();}}
function validRegen(card,actor){
 const first=regenCard(card),r=first?.flags.spikependium.trollRegeneration,i=resolve(r?.item),seen=new Set();let origin=first;
 while(origin&&origin.type!=='usage'&&!seen.has(origin)){seen.add(origin);origin=game.messages.get(origin.system?.origin)??origin.getOriginatingMessage?.();}
 const paid=origin?.flags?.spikependium?.trollRegeneration;
 return r&&r.turn===turn()&&r.actor===actor?.uuid&&i?.actor?.uuid===actor.uuid&&trollReady(i)&&actor.flags.spikependium?.trollAppliedTurn!==r.turn
  &&first.author&&actor.testUserPermission(first.author,'OWNER')
  &&origin?.type==='usage'&&paid?.actor===r.actor&&paid.item===r.item&&paid.turn===r.turn
  &&origin.system.deltas?.item?.[i.id]?.some(d=>d.keyPath===`system.activities.${root(origin.getAssociatedActivity?.())?.id}.uses.spent`&&d.delta===1)
  &&origin.author&&actor.testUserPermission(origin.author,'OWNER')&&root(origin.getAssociatedActivity?.())?.flags?.spikependium?.trollRegenerate?{item:i,receipt:r,origin}:undefined;
}
export function prepareTrollHealing(config,_dialog,message){
 if(!root(config.subject)?.flags?.spikependium?.trollRegenerate)return;
 const id=config.event?.target?.closest('[data-message-id]')?.dataset.messageId??message.data?.system?.origin,card=typeof id==='string'?game.messages.get(id)??resolve(id):id;
 const valid=validRegen(card,config.subject.actor);if(!valid)return false;
 foundry.utils.setProperty(message,'data.flags.spikependium.trollRegeneration',valid.receipt);foundry.utils.setProperty(message,'data.system.origin',valid.origin.id);
}
export function applyBeltDamage(actor,amount,updates,options){
 const acid=calculations.get(options)?.get(actor.uuid);calculations.get(options)?.delete(actor.uuid);
 if(acid)for(const i of belts(actor).filter(i=>kind(i)==='mosshide-troll-belt'))updates[`flags.spikependium.trollSuppression.${i.id}.acidUntil`]=game.time.worldTime+3600;
 recordTrollZero(actor,updates);
 if(!regenCard(options.originatingMessage))return;
 const valid=validRegen(options.originatingMessage,actor);if(!valid||!(amount<0)||!(updates['system.attributes.hp.value']>actor.system.attributes.hp.value))return false;
 updates['flags.spikependium.trollAppliedTurn']=valid.receipt.turn;
}
export async function applyTrollHealing(card){
 if(card.type!=='healing'||!card.flags?.spikependium?.trollRegeneration||(game.users.activeGM?!game.user.isActiveGM:card.author?.id!==game.user.id))return;
 const actor=resolve(card.flags.spikependium.trollRegeneration.actor),valid=validRegen(card,actor);if(!actor?.isOwner||!valid||!card.author||!actor.testUserPermission(card.author,'OWNER'))return;
 const rolls=card.rolls;if(rolls.length!==1||!(rolls[0] instanceof CONFIG.Dice.DamageRoll)||!rolls[0]._evaluated||rolls[0].options.type!=='healing'||!Number.isFinite(rolls[0].total)||rolls[0].total<=0)return;
 const lock=`${actor.uuid}:${valid.receipt.turn}`;if(applying.has(lock))return;applying.add(lock);
 try{await actor.applyDamage([{type:'healing',value:rolls[0].total}],{originatingMessage:card});}finally{applying.delete(lock);}
}
export async function beltStartTurn(wrapped,combatant){
 const result=await wrapped(combatant),actor=combatant?.actor,recovery=combatant&&recoveries.get(combatant);
 if(recovery){try{await recovery;}finally{if(recoveries.get(combatant)===recovery)recoveries.delete(combatant);}}
 if(!game.user.isActiveGM||!actor||starting.has(actor.uuid)||this.id!==game.combat?.id)return result;
 const item=belts(actor).find(trollReady),a=item?.system.activities.find(a=>a.flags?.spikependium?.trollRegenerate);
 if(!a||a.uses.value<=0||actor.flags.spikependium?.trollAppliedTurn===turn())return result;
 starting.set(actor.uuid,turn());
 try{const used=await a.use({subsequentActions:false},{configure:false});if(used?.message)await a.rollDamage({},{configure:false},{data:{system:{origin:used.message.id}}});}finally{starting.delete(actor.uuid);}
 return result;
}
export function beltCombatRecovery(wrapped,types){
 const result=wrapped(types);if(types.turnStart?.actor){const promise=Promise.resolve(result);promise.catch(()=>{});recoveries.set(types.turnStart,promise);}return result;
}
export async function recoverBeltPeriods(wrapped,periods,...args){
 const result=await wrapped(periods,...args),item=this.parent;if(kind(item)!=='mosshide-troll-belt'||!(periods instanceof Map)||!(periods.get('dawn')>0))return result;
 const recovered=result||{updates:{},rolls:[]};recovered.updates['flags.spikependium.trollDawnEpoch']=(item.flags.spikependium.trollDawnEpoch??0)+periods.get('dawn');return recovered;
}
export function beltDeltaLabel(wrapped,...args){
 const result=wrapped(...args);if(/^flags\.spikependium\.potionSlots\.[A-Za-z0-9]{16}$/.test(this.keyPath))result.label='Гнездо зельевого пояса';if(/^flags\.spikependium\.potionBreaks\.[A-Za-z0-9]{16}\.active$/.test(this.keyPath))result.label='Проверка разбития бутылки';if(/^flags\.spikependium\.potionBreaks\.[A-Za-z0-9]{16}\.broken$/.test(this.keyPath))result.label='Разбитая бутылка';return result;
}
