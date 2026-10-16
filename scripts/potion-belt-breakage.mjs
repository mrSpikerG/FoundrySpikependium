import {potionBeltBottles} from './griffon-two-belts.mjs';
import {attackSignature,guardianRecords} from './attack-source.mjs';
import {attackHitTargets} from './companions.mjs';
import {defensiveCharmWaiting} from './performer-defense.mjs';
const resolve=uuid=>uuid&&fromUuidSync(uuid,{strict:false});
const records=item=>Object.entries(item.flags.spikependium?.potionBreaks??{});
const path=nonce=>`flags.spikependium.potionBreaks.${nonce}`;
const running=new Set(),paid=new WeakMap(),queued=new Map(),observed=new WeakMap(),outdated=new WeakSet(),automatic=Symbol();
function criticalNormal(actor){const properties=actor.system?.attributes?.ac?.equippedArmor?.system?.properties;return !!(properties?.has?.('ada')||properties?.includes?.('ada'));}
function naturalOne(roll){const dice=roll.dice?.filter(d=>d.faces===20)??[],kept=dice.length===1?dice[0].results.filter(r=>r.active!==false&&!r.discarded):[];return kept.length===1&&kept[0].result===1;}
function actualRoll(card,index){const r=card?.rolls?.[index];return r instanceof CONFIG.Dice.D20Roll&&r._evaluated?r:undefined;}
function sourceValid(item,r,hit=true){
 const card=resolve(r.source),roll=actualRoll(card,r.index);if(!card||!roll||attackSignature(card)!==r.signature||item.actor?.uuid!==r.actor||!card.author)return false;
 if(r.kind==='save')return card.type==='save'&&card.system.ability==='dex'&&naturalOne(roll)&&card.getAssociatedActor()?.uuid===r.actor&&item.actor.testUserPermission(card.author,'OWNER');
 const activity=card.getAssociatedActivity(),attacker=activity?.actor;
 return r.kind==='attack'&&card.type==='attack'&&activity?.type==='attack'&&roll.isCritical&&attacker?.testUserPermission(card.author,'OWNER')&&resolve(r.token)?.actor?.uuid===r.actor
  &&(!hit||attackHitTargets(card).some(h=>h.index===r.index&&h.token.uuid===r.token&&h.token.actor.uuid===r.actor));
}
function sameBottles(item,r){const current=potionBeltBottles(item);return r.bottles.length>0&&r.bottles.every(b=>current.some(c=>c.id===b.id&&c.slot===b.slot&&c.spent===b.spent&&c.created===b.created));}
function waiting(r){const card=resolve(r.source);return r.kind==='attack'&&(guardianRecords(card).some(g=>['prompted','moving','stopped'].includes(g.state))||(r.index===0&&defensiveCharmWaiting(card,{token:r.token})));}
function audience(item,r){const source=resolve(r.source);return game.users.filter(u=>u.isGM||item.actor.testUserPermission(u,'OWNER')&&!source.blind&&(!source.whisper?.length||source.whisper.includes(u.id)||source.author.id===u.id)).map(u=>u.id);}
function receipt(item,nonce){
 const r=item.flags.spikependium.potionBreaks?.[nonce];if(!r||r.active!==1||r.value!==1||r.broken||r.choice||!sourceValid(item,r)||!sameBottles(item,r))return;
 const usage=[...game.messages].find(m=>m.type==='usage'&&m.flags?.spikependium?.potionBreakCheck?.item===item.uuid&&m.flags.spikependium.potionBreakCheck.nonce===nonce&&m.author&&item.actor.testUserPermission(m.author,'OWNER'));
 const rolls=usage?.rolls?.filter(d=>d.options?.spikependiumPotionBreak===nonce)??[];
 return usage?.system.deltas?.item?.[item.id]?.some(d=>d.keyPath===`${path(nonce)}.active`&&d.delta===1)&&rolls.length===1&&rolls[0] instanceof CONFIG.Dice.BasicRoll&&rolls[0]._evaluated&&rolls[0].formula==='1d20'&&rolls[0].total===1?r:undefined;
}
export function canUsePotionBreak(activity,config={},_dialog,message){
 const f=activity.flags?.spikependium;if(!f?.potionBreakCheck&&!f?.potionBreakBottle)return;
 const item=activity.actor?.items.get(activity.item.id),nonce=config.spikependium?.potionBreak,r=item?.flags.spikependium?.potionBreaks?.[nonce];
 if(!item?.actor.isOwner||!potionBeltBottles(item).length||!r||r.choice||!sourceValid(item,r)||!sameBottles(item,r))return false;
 if(f.potionBreakCheck&&(r.active!==0||r.value!==undefined))return false;
 if(f.potionBreakBottle&&(!receipt(item,nonce)||!r.bottles.some(b=>b.slot===f.potionBreakBottle)))return false;
 if(message){if(message.create===false)return false;message.hasConsumption=true;message.data??={};Object.assign(message.data,{whisper:audience(item,r),blind:!!resolve(r.source).blind});message.rollMode=message.data.blind?'blind':'gm';}
}
export async function potionBreakUse(wrapped,config={},dialog={},message={}){
 const f=this.flags?.spikependium;if(!f?.potionBreakCheck&&!f?.potionBreakBottle)return wrapped(config,dialog,message);
 const internal=config[automatic];config={...config};delete config[automatic];
 if(!config.spikependium?.potionBreak){
  const item=this.actor?.items.get(this.item.id),choices=records(item??{flags:{}}).filter(([n,r])=>!r.choice&&(f.potionBreakCheck?r.active===0&&r.value===undefined&&sourceValid(item,r)&&sameBottles(item,r):r.bottles.some(b=>b.slot===f.potionBreakBottle)&&receipt(item,n)));
  if(!choices.length){ui.notifications.warn('Подходящей неразрешённой проверки пояса нет. Исходный бросок должен оставаться действующим.');return;}
  let nonce=choices[0][0];if(choices.length>1){const answer=await foundry.applications.api.DialogV2.input({window:{title:'Выбрать событие разбития'},rejectClose:false,content:`<select name="event">${choices.map(([n,r],i)=>`<option value="${n}">${r.kind==='save'?'Испытание Ловкости':'Критическое попадание'} №${i+1}</option>`).join('')}</select>`,ok:{label:'Продолжить'}});if(!answer||!choices.some(([n])=>n===answer.event))return;nonce=answer.event;}
  config={...config,spikependium:{...config.spikependium,potionBreak:nonce}};
 }
 const item=this.actor?.items.get(this.item.id),nonce=config.spikependium.potionBreak;
 if(canUsePotionBreak(this,config,dialog,message)===false)return;
 if(running.has(item.uuid))return internal?wrapped(config,dialog,message):undefined;
 let result;await each(item,async()=>{result=await wrapped(config,dialog,message);if(result&&f.potionBreakCheck)await process(item,nonce);});return result;
}
export async function preparePotionBreakUpdates(activity,config,updates){
 paid.delete(activity);const f=activity.flags?.spikependium;if(!f?.potionBreakCheck&&!f?.potionBreakBottle)return updates;
 if(canUsePotionBreak(activity,config)===false)return false;
 const item=activity.actor.items.get(activity.item.id),nonce=config.spikependium.potionBreak,r=item.flags.spikependium.potionBreaks[nonce];let update=updates.item.find(u=>u._id===item.id);if(!update)updates.item.push(update={_id:item.id});
 if(f.potionBreakCheck){
  const die=await new CONFIG.Dice.BasicRoll('1d20',{}, {spikependiumPotionBreak:nonce,flavor:'Зельевой пояс: проверка разбития'}).evaluate();
  if(!Number.isInteger(die.total)||die.total<1||die.total>20)throw Error('Некорректный к20 разбития бутылки');
  if(canUsePotionBreak(activity,config)===false)return false;
  Object.assign(update,{[`${path(nonce)}.active`]:1,[`${path(nonce)}.value`]:die.total,...(die.total!==1?{[`${path(nonce)}.choice`]:'passed'}:{})});updates.rolls.push(die);paid.set(activity,{item:item.uuid,nonce});
 }else{
  const snapshot=r.bottles.find(b=>b.slot===f.potionBreakBottle),p=snapshot&&item.actor.items.get(snapshot.id);if(!p)return false;
  if(updates.delete.includes(p.id)||updates.item.some(u=>u._id===p.id))return false;
  updates.delete.push(p.id);Object.assign(update,{[`flags.spikependium.potionSlots.${p.id}`]:0,[`${path(nonce)}.broken`]:1,[`${path(nonce)}.choice`]:'resolved'});
 }
 return updates;
}
export function recordPotionBreakConsumption(activity,_config,message){const r=paid.get(activity);paid.delete(activity);if(r)foundry.utils.setProperty(message,'data.flags.spikependium.potionBreakCheck',r);}
async function process(item,nonce,auto=true){
 const r=item.flags.spikependium.potionBreaks?.[nonce];if(!r||r.choice)return;
 if(!sourceValid(item,r,false)||!sameBottles(item,r)){await item.setFlag('spikependium',`potionBreaks.${nonce}.choice`,'changed');ui.notifications.warn('Источник или бутылки зельевого пояса изменились. Разрешите последствия с Мастером; уже разбитую бутылку можно вернуть отменой расхода.');return;}
 if(!sourceValid(item,r)){if(r.active===1&&r.value===1&&!waiting(r)){await item.setFlag('spikependium',`potionBreaks.${nonce}.choice`,'changed');ui.notifications.warn('Критическое попадание отменено. Ожидающее разбитие бутылки больше не применяется.');}return;}
 if(r.active===0&&r.value===undefined){const a=item.system.activities.find(a=>a.flags?.spikependium?.potionBreakCheck);if(!a)return;await a.use({[automatic]:true,spikependium:{potionBreak:nonce}},{configure:false});}
 const current=receipt(item,nonce);if(!current){const latest=item.flags.spikependium.potionBreaks?.[nonce];if(latest?.active===1&&latest.value===1&&!latest.choice){await item.setFlag('spikependium',`potionBreaks.${nonce}.choice`,'manual');ui.notifications.warn('Карточка проверки пояса отсутствует или изменена. Разрешите разбитие с Мастером: повторного броска не будет.');}return;}if(current.prompted||!auto)return;
 await item.setFlag('spikependium',`potionBreaks.${nonce}.prompted`,1);
 let slot=current.bottles[0].slot;
 if(current.bottles.length>1){const escape=foundry.utils.escapeHTML,answer=await foundry.applications.api.DialogV2.input({window:{title:'Зельевой пояс: какая бутылка разбилась?'},rejectClose:false,content:`<p>В проверке выпала 1. Источник не определяет выбор бутылки.</p><select name="slot">${current.bottles.map(b=>`<option value="${b.slot}">Гнездо ${b.slot}: ${escape(item.actor.items.get(b.id).name)}</option>`).join('')}</select>`,ok:{label:'Разбить бутылку'}});if(!answer)return;slot=Number(answer.slot);}
 const a=item.system.activities.find(a=>a.flags?.spikependium?.potionBreakBottle===slot);if(!a)return;
 await a.use({[automatic]:true,spikependium:{potionBreak:nonce}},{configure:false});
}
async function each(item,work){
 if(running.has(item.uuid))return;running.add(item.uuid);
 try{await work();}catch(error){try{for(const[n,r]of records(item))if(r.active===1&&r.value===1&&!r.choice&&!receipt(item,n))await item.setFlag('spikependium',`potionBreaks.${n}.choice`,'manual');}catch(cleanup){console.error('Spikependium: не удалось отметить прерванную проверку пояса',cleanup);}ui.notifications.error('Проверка пояса прервана. Перед повтором проверьте карточку и инвентарь: штатный расход мог уже сохраниться.');throw error;}finally{running.delete(item.uuid);const next=queued.get(item.uuid)?.shift();if(next)await capturePotionBreaks(next,false);if(!queued.get(item.uuid)?.length)queued.delete(item.uuid);}
}
function candidateFrames(card){
 const frames=[];
 for(let index=0;index<(card.rolls?.length??0);index++){const roll=actualRoll(card,index);if(!roll)continue;
  if(card.type==='save'&&card.system.ability==='dex'&&naturalOne(roll)){const actor=card.getAssociatedActor();if(actor&&card.author&&actor.testUserPermission(card.author,'OWNER'))frames.push({actor,kind:'save',index,token:null});}
  if(card.type==='attack'&&roll.isCritical){const activity=card.getAssociatedActivity(),attacker=activity?.actor;if(activity?.type!=='attack'||!card.author||!attacker?.testUserPermission(card.author,'OWNER'))continue;const targets=new Map((card.system.targets??[]).map(t=>{const token=resolve(t.token);return[token?.uuid,token];}));for(const h of attackHitTargets(card).filter(h=>h.index===index))targets.set(h.token.uuid,h.token);for(const token of targets.values())if(token?.actor)frames.push({actor:token.actor,kind:'attack',index,token:token.uuid});}
 }
 return frames;
}
export async function capturePotionBreaks(card,fresh=true){
 if(!game.user.isActiveGM||!['attack','save'].includes(card.type))return;
 if(fresh)observed.set(card,attackSignature(card));
 else if(observed.get(card)!==attackSignature(card)){await resumePotionBreaks(card);return;}
 for(const frame of candidateFrames(card))for(const item of frame.actor.items){
  const bottles=potionBeltBottles(item);if(!bottles.length)continue;if(!item.system.activities.some(a=>a.flags?.spikependium?.potionBreakCheck)){if(!outdated.has(item)){outdated.add(item);ui.notifications.warn('Обновите Зельевой пояс алхимика из компендиума и заново закрепите бутылки: старая карточка не содержит действий разбития.');}continue;}
  if(running.has(item.uuid)){const queue=queued.get(item.uuid)??[];if(!queue.some(c=>c.uuid===card.uuid))queue.push(card);queued.set(item.uuid,queue);continue;}
  await each(item,async()=>{const event=`${card.uuid}:${frame.kind}:${frame.index}:${frame.token??frame.actor.uuid}`;
   let entry=records(item).find(([,r])=>r.event===event);
   if(!entry){const nonce=foundry.utils.randomID(),r={event,source:card.uuid,signature:attackSignature(card),actor:frame.actor.uuid,kind:frame.kind,index:frame.index,token:frame.token,bottles,active:0,broken:0,...(frame.kind==='attack'&&criticalNormal(frame.actor)?{choice:'normal'}:{})};await item.setFlag('spikependium',`potionBreaks.${nonce}`,r);entry=[nonce,r];}
   await process(item,entry[0]);
  });
 }
}
export async function updatePotionBreakSource(card){if(!['attack','save'].includes(card.type)&&!card.flags?.spikependium?.potionBreakCheck)return;if(observed.get(card)===attackSignature(card))await capturePotionBreaks(card,false);await resumePotionBreaks(card);}
export async function resumePotionBreaks(source){
 if(!game.user.isActiveGM)return;
 const actors=new Map([...(game.actors??[]),...[...(game.scenes??[])].flatMap(s=>[...s.tokens].map(t=>t.actor))].filter(Boolean).map(a=>[a.uuid,a]));
 for(const actor of actors.values())for(const item of actor.items)if(item.flags.spikependium?.griffonBelt==='potion-belt'&&item.actor.isOwner)await each(item,async()=>{for(const[nonce,r]of records(item)){
  const check=source?.flags?.spikependium?.potionBreakCheck;
  if(source&&r.source!==source.uuid&&!(check?.item===item.uuid&&check.nonce===nonce))continue;
  if(check&&r.active===1&&r.value===1&&!r.choice&&!receipt(item,nonce)){await item.setFlag('spikependium',`potionBreaks.${nonce}.choice`,'manual');continue;}
  await process(item,nonce);
 }});
}
