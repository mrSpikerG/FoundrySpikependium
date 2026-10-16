import { isGriffonSpellcaster } from './griffon-two-items.mjs';
// shortcut: simultaneous owners on separate clients share native non-atomic payment; use GM arbitration if needed.
const attempts=new Map(),using=new Set(),prepared=new WeakMap();
const resolve=uuid=>uuid&&fromUuidSync(uuid,{strict:false});
const budget=(item,level)=>item.system.activities.find(a=>a.flags?.spikependium?.gloveBudget===level);
const owned=item=>!!item&&item.actor?.items.get(item.id)===item&&item.system.equipped&&item.system.attuned&&item.system.quantity>0&&item.flags?.spikependium?.griffonGlove==='arcanist-gauntlets';
const marker=c=>c?.flags?.spikependium?.arcanist;
function ordinary(activity){
 const item=activity?.item;
 return item?.type==='spell'&&item.system.level>0&&item.system.level<=5&&activity.requiresSpellSlot&&activity.consumption.spellSlot
  &&!activity.getLinkedActivity?.()&&!item.flags.dnd5e?.cachedFor&&!item.getFlag?.('dnd5e','spellLevel')&&!/^(equipment|weapon|consumable):/.test(item.system.sourceItem??'');
}
function slots(activity,item){
 const method=activity.item.system.method,model=CONFIG.DND5E.spellcasting[method];
 if(!owned(item)||item.actor.uuid!==activity.actor?.uuid||!isGriffonSpellcaster(activity.actor))return[];
 return Object.entries(activity.actor.system.spells??{}).filter(([key,s])=>/^(spell[1-5]|pact)$/.test(key)&&s.max>0&&s.type
  &&Number.isInteger(s.level)&&s.level>=activity.item.system.level&&s.level<=5&&s.level<=item.system.uses.value&&budget(item,s.level)?.uses.value>0
  &&(!model?.exclusive.spells||method===s.type)&&(!CONFIG.DND5E.spellcasting[s.type]?.exclusive.slots||method===s.type));
}
function ready(activity,config){
 const attempt=attempts.get(config.spikependium?.arcanistAttempt);
 if(!attempt||!ordinary(activity)||!activity.actor.isOwner||activity.actor.uuid!==attempt.actor||activity.uuid!==attempt.activity||activity.item.id!==attempt.spell
  ||config.consume===false||config.consume?.spellSlot!==false||config.spell?.slot!==attempt.slot)return;
 const item=resolve(attempt.glove),entry=slots(activity,item).find(([key])=>key===attempt.slot);
 if(!entry||entry[1].level!==attempt.level||activity.item.system.level+(Number(config.scaling)||0)!==entry[1].level)return;
 return {attempt,item,slot:entry[1],level:entry[1].level,activity:budget(item,entry[1].level)};
}
export async function arcanistSpellUse(wrapped,config={},dialog={},message={}){
 if(!ordinary(this)||!this.actor?.isOwner||config.spikependium?.arcanist===false||config.consume===false
  ||(config.consume?.spellSlot===false&&!config.spikependium?.arcanist))return wrapped(config,dialog,message);
 let selected=config.spikependium?.arcanist;
 if(!selected){
  const choices=[...this.actor.items].flatMap(item=>slots(this,item).map(([slot,data])=>({item,slot,level:data.level,value:data.value})));
  if(!choices.length)return wrapped(config,dialog,message);
  const escape=foundry.utils.escapeHTML,answer=await foundry.applications.api.DialogV2.input({window:{title:'Перчатки арканиста'},rejectClose:false,
   content:`<p>Попробовать сотворить за счёт перчаток? Один к6 будет брошен после подтверждения штатного окна. При неудаче расходуется выбранная личная ячейка; если она пуста, заклинание провалится с расходом запаса перчаток.</p><select name="choice"><option value="">Обычное сотворение</option>${choices.map((c,i)=>`<option value="${i}">${escape(c.item.name)}: ${c.level}-й уровень, ${c.slot==='pact'?'договор, ':''}${c.value?'личных ячеек '+c.value:'личная ячейка пуста'}</option>`).join('')}</select>`,ok:{label:'Продолжить'}});
  if(!answer)return;
  if(answer.choice==='')return wrapped({...config,spikependium:{...config.spikependium,arcanist:false}},dialog,message);
  const choice=choices[Number(answer.choice)];if(!choice||!/^[0-9]+$/.test(String(answer.choice)))return;
  selected={glove:choice.item.uuid,slot:choice.slot};
 }
 if(using.has(this.actor.uuid))return;
 const glove=resolve(selected.glove),entry=slots(this,glove).find(([key])=>key===selected.slot);
 if(!entry||message.create===false){ui.notifications.warn('Перчатки или выбранный уровень ячейки недоступны.');return;}
 const nonce=foundry.utils.randomID(),attempt={nonce,actor:this.actor.uuid,activity:this.uuid,spell:this.item.id,glove:glove.uuid,slot:selected.slot,level:entry[1].level};
 attempts.set(nonce,attempt);using.add(this.actor.uuid);
 try{return await wrapped({...config,spell:{...config.spell,slot:selected.slot},scaling:entry[1].level-this.item.system.level,
  consume:{...(typeof config.consume==='object'?config.consume:{}),spellSlot:false},spikependium:{...config.spikependium,arcanistAttempt:nonce}},
  {...dialog,options:{...dialog.options,display:{...dialog.options?.display,'consume.spellSlot':false,scaling:false}}},message);
 }finally{attempts.delete(nonce);using.delete(this.actor.uuid);}
}
export function prepareArcanistUse(activity,config,_dialog,message){
 if(!config.spikependium?.arcanistAttempt)return;
 if(!ready(activity,config)||message.create===false)return false;
 message.hasConsumption=true;
}
export async function prepareArcanistUpdates(subject,config,updates){
 if(!config.spikependium?.arcanistAttempt)return updates;
 prepared.delete(subject);
 const state=ready(subject,config);if(!state)return false;
 const {attempt,item,level,activity}=state;
 if(attempt.resolved)return false;
 // Native actions, components and other resource helpers have already passed; nothing has been written yet.
 if(!updates||Array.isArray(updates))return updates;
 const slotPath=`system.spells.${attempt.slot}.value`;
 if(updates.actor[slotPath]!==undefined||foundry.utils.getProperty(updates.actor,slotPath)!==undefined)return false;
 const die=await new CONFIG.Dice.BasicRoll('1d6',{}, {flavor:'Перчатки арканиста',spikependiumArcanist:attempt.nonce}).evaluate();
 if(!Number.isInteger(die.total)||die.total<1||die.total>6)throw Error('Некорректный к6 Перчаток арканиста');
 const current=ready(subject,config);if(!current)return false;
 const result=die.total>=level?'gauntlet':current.slot.value>0?'slot':'failed';
 config.consume.spellSlot=result==='slot';
 // Slot updates use dnd5e's own value field and participate in the same native payment/refund as every other resource.
 if(result==='slot')updates.actor[slotPath]=current.slot.value-1;
 else{
  let update=updates.item.find(i=>i._id===item.id);if(!update)updates.item.push(update={_id:item.id});
  if(update['system.uses.spent']!==undefined||foundry.utils.getProperty(update,'system.uses.spent')!==undefined
   ||update[`system.activities.${activity.id}.uses.spent`]!==undefined||foundry.utils.getProperty(update,`system.activities.${activity.id}.uses.spent`)!==undefined)return false;
  Object.assign(update,{'system.uses.spent':current.item.system.uses.spent+level,[`system.activities.${activity.id}.uses.spent`]:current.activity.uses.spent+1});
 }
 const record={...attempt,level,value:die.total,result,active:1};
 updates.actor[`flags.spikependium.arcanistCasts.${attempt.nonce}`]=record;updates.rolls.push(die);
 attempt.resolved=record;prepared.set(subject,record);return updates;
}
export function recordArcanistConsumption(activity,config,message){
 const record=prepared.get(activity);prepared.delete(activity);if(!record)return;
 if(activity.actor.flags.spikependium?.arcanistCasts?.[record.nonce]?.active!==1)return;
 const deltas=((message.data.system??={}).deltas??={}).actor??=[];
 const keyPath=`flags.spikependium.arcanistCasts.${record.nonce}.active`;
 if(!deltas.some(d=>d.keyPath===keyPath))deltas.push({keyPath,delta:1});
 foundry.utils.setProperty(message,'data.flags.spikependium.arcanist',{actor:record.actor,nonce:record.nonce});
}
export async function arcanistConsume(wrapped,config,message){
 const updates=await wrapped(config,message);if(!updates)return updates;
 const record=attempts.get(config.spikependium?.arcanistAttempt)?.resolved;
 if(record?.result!=='failed')return updates;
 const item=resolve(record.glove),helper=item?.clone({}, {keepId:true}).system.activities.find(a=>a.flags?.spikependium?.gloveBudget===record.level);
 if(!helper)throw Error('Расход сохранён, но карточка неудачного сотворения недоступна. Проверьте ресурсы с Мастером.');
 helper.updateSource({name:`Заклинание не сотворено: ${this.item.name}`, 'description.chatFlavor':`К6: ${record.value}; нужен ${record.level}+. Личная ячейка пуста. В суточный запас перчаток засчитан ${record.level}-й уровень.`});
 const failure=foundry.utils.deepClone(message);failure.data.system??={};delete failure.data.system.effects;delete failure.data.system.concentration;
 helper._finalizeMessageConfig(config,failure,{updates});
 try{await helper._createUsageMessage(failure);}catch(error){ui.notifications.error('Попытка не удалась и ресурсы уже списаны, но карточка не создана. Проверьте счётчики с Мастером перед повторением.');throw error;}
 // Stop before native concentration replacement, effects, templates or spell attack/damage actions.
 return false;
}
function usage(card){
 const seen=new Set();while(card&&!seen.has(card)){seen.add(card);if(marker(card))return card;card=card.getOriginatingMessage?.();}
}
function paid(mark){
 const actor=resolve(mark?.actor),r=actor?.flags.spikependium?.arcanistCasts?.[mark.nonce];
 if(!r||r.active!==1||r.nonce!==mark.nonce||!['gauntlet','slot'].includes(r.result)||!Number.isInteger(r.level)||r.level<1||r.level>5
  ||!Number.isInteger(r.value)||r.value<1||r.value>6||(r.result==='gauntlet')!==(r.value>=r.level))return;
 const card=[...game.messages].find(c=>c.type==='usage'&&marker(c)?.actor===actor.uuid&&marker(c)?.nonce===r.nonce&&c.getAssociatedActivity?.()?.uuid===r.activity);
 if(!card?.author||!actor.testUserPermission(card.author,'OWNER')||!card.system.deltas?.actor?.some(d=>d.keyPath===`flags.spikependium.arcanistCasts.${r.nonce}.active`&&d.delta===1))return;
 const dice=card.rolls.filter(d=>d.options.spikependiumArcanist===r.nonce);
 if(dice.length!==1||!(dice[0] instanceof CONFIG.Dice.BasicRoll)||!dice[0]._evaluated||dice[0].formula!=='1d6'||dice[0].total!==r.value)return;
 if(r.result==='slot'){
  if(!card.system.deltas.actor.some(d=>d.keyPath===`system.spells.${r.slot}.value`&&d.delta===-1))return;
 }else{
  const item=resolve(r.glove),a=item&&budget(item,r.level),deltas=card.system.deltas.item?.[r.glove.split('.').at(-1)];
  if(!a||!deltas?.some(d=>d.keyPath==='system.uses.spent'&&d.delta===r.level)||!deltas.some(d=>d.keyPath===`system.activities.${a.id}.uses.spent`&&d.delta===1))return;
 }
 return r;
}
export function guardArcanistRoll(config,_dialog,message){
 const id=config.event?.target?.closest('[data-message-id]')?.dataset.messageId??message.data?.system?.origin;
 const card=typeof id==='string'?game.messages.get(id)??resolve(id):id,source=usage(card),mark=marker(source);if(!mark)return;
 const record=paid(mark);if(!record||record.actor!==config.subject.actor?.uuid||record.activity!==config.subject.uuid){ui.notifications.warn('Попытка через перчатки отменена или относится к другому заклинанию.');return false;}
 foundry.utils.setProperty(message,'data.flags.spikependium.arcanist',mark);
}
export function guardArcanistDamage(_actor,_amount,_updates,options){
 const source=usage(options.originatingMessage);if(marker(source)&&!paid(marker(source)))return false;
}
export function arcanistDeltaLabel(wrapped,...args){
 const result=wrapped(...args);if(/^flags\.spikependium\.arcanistCasts\.[A-Za-z0-9]{16}\.active$/.test(this.keyPath))result.label='Сотворение через Перчатки арканиста';return result;
}
