import {CONJURER_DURABLE_EFFECT} from './generated.mjs';
const KEY='subclass:au-conjurer:durable-summons',TAG='flags.spikependium.conjurerDurable',TEMP='system.attributes.hp.temp';
const prepared=new WeakMap(),contexts=new WeakMap(),placing=new Set(),calculated=new WeakMap();
const resolve=id=>id&&fromUuidSync(id,{strict:false}),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const root=id=>`flags.spikependium.conjurerDurableCasts.${id}`;
const read=(data,path)=>Object.hasOwn(data,path)?data[path]:foundry.utils.getProperty(data,path);
const feature=actor=>actor?.items?.find?.(i=>i.flags.spikependium?.key===KEY);
const summon=a=>a?.type==='summon'&&a.item?.type==='spell'&&a.item.system.school==='con'&&a.item.system.level>0;
const live=e=>e?.active&&!e.duration?.expired&&!(Number.isFinite(e.duration?.remaining)&&e.duration.remaining<=0);
function saved(r){
 const caster=resolve(r?.caster),record=caster?.flags.spikependium?.conjurerDurableCasts?.[r?.event];
 if(!caster||!record||!/^[A-Za-z0-9]{16}$/.test(r?.event??'')||!Number.isInteger(r.wizard)||r.wizard<6||r.wizard>20||!equal(record.data?.[0],r))return;
 return{caster,record};
}
function current(a,context){
 const r=context?.r,s=saved(r);if(!s||s.record.active!==1||!summon(a)||a.actor.uuid!==r.caster||a.uuid!==r.activity||a.item.uuid!==r.item)return;
 if(r.concentration){const e=resolve(context.concentration);if(!live(e)||e.flags.dnd5e?.activity?.uuid!==a.uuid)return;}
 return s;
}
export function prepareDurableUpdates(a,config,updates){
 prepared.delete(a);if(!summon(a)||!feature(a.actor)||config.consume===false)return updates;
 const wizard=a.actor.classes?.wizard?.system.levels;if(!Number.isInteger(wizard)||wizard<6||wizard>20)return updates;
 const slots=Object.entries(foundry.utils.flattenObject(updates.actor)).filter(([p,n])=>/^system\.spells\.(spell[1-9]|pact)\.value$/.test(p)&&Number.isFinite(n)&&foundry.utils.getProperty(a.actor,p)-n===1);
 if(slots.length!==1)return updates;
 const r={event:foundry.utils.randomID(),caster:a.actor.uuid,activity:a.uuid,item:a.item.uuid,wizard,slot:slots[0][0],time:game.time.worldTime,concentration:!!a.requiresConcentration};
 updates.actor[root(r.event)]={active:1,placement:'ready',data:[r]};prepared.set(a,r);return updates;
}
export function recordDurableConsumption(a,_config,message){
 const r=prepared.get(a);prepared.delete(a);if(!r||saved(r)?.record.active!==1)return;
 const deltas=message.data?.system?.deltas?.actor??[];
 if(!deltas.some(d=>d.keyPath===r.slot&&d.delta===-1))return;
 if(!deltas.some(d=>d.keyPath===`${root(r.event)}.active`))deltas.push({keyPath:`${root(r.event)}.active`,delta:1});
 contexts.set(a,{r});foundry.utils.setProperty(message,'data.flags.spikependium.conjurerDurableCast',r);
}
export function recordDurableUsage(a,message){
 const r=message.data?.flags?.spikependium?.conjurerDurableCast;if(!r||saved(r)?.record.active!==1)return;
 contexts.set(a,{r,concentration:a.actor.effects.get(message.data?.system?.concentration)?.uuid});
 foundry.utils.setProperty(message,'data.flags.dnd5e.item.data',a.item.toObject());
}
export async function durableChatAction(wrapped,event,target,message){
 if(target.dataset.action!=='placeSummons'||!message.flags.spikependium?.conjurerDurableCast)return wrapped(event,target,message);
 const r=message.flags.spikependium.conjurerDurableCast,context={r,concentration:aConcentration(this,message)},deltas=message.system?.deltas?.actor??[];
 if(message.type!=='usage'||!message.author||!this.actor.testUserPermission(message.author,'OWNER')||!current(this,context)
  ||!deltas.some(d=>d.keyPath===`${root(r.event)}.active`&&d.delta===1)||!deltas.some(d=>d.keyPath===r.slot&&d.delta===-1))return;
 const previous=contexts.get(this);contexts.set(this,context);try{return await wrapped(event,target,message);}finally{if(previous)contexts.set(this,previous);else contexts.delete(this);}
}
function aConcentration(a,message){return a.actor.effects.get(message.system?.concentration)?.uuid;}
export async function placeDurableSummons(wrapped,...args){
 const context=contexts.get(this);if(!context)return wrapped(...args);
 const s=current(this,context),key=`${context.r.caster}.${context.r.event}`;
 if(!s||!this.actor.isOwner||placing.has(key)||s.record.placement!=='ready'){ui.notifications.warn('Этот оплаченный призыв уже размещён, выполняется или утратил исходные условия. Для нового призыва сотворите заклинание снова.');return [];}
 const claim=foundry.utils.randomID();placing.add(key);context.claim=claim;context.touched=false;
 // shortcut: native actor updates are not atomic across clients; simultaneous owners still need GM arbitration.
 try{
  await this.actor.update({[`${root(context.r.event)}.placement`]:'placing',[`${root(context.r.event)}.claim`]:claim});
  if(!current(this,context)||saved(context.r)?.record.claim!==claim)return [];
  const result=await wrapped(...args),record=saved(context.r)?.record;
  if(record?.claim===claim){const state=result?.length?'placed':context.touched?'unknown':'ready';await this.actor.update({[`${root(context.r.event)}.placement`]:state});if(state==='unknown')ui.notifications.warn('Неизвестен итог размещения призыва. Проверьте сцену; повтор этой карточки заблокирован.');}
  return result;
 }catch(error){ui.notifications.warn('Неизвестен итог размещения призыва. Проверьте сцену; повтор этой карточки заблокирован.');throw error;}
 finally{placing.delete(key);delete context.claim;delete context.touched;}
}
export async function durableTokenData(wrapped,config,...args){
 const context=contexts.get(this);if(!context?.claim)return wrapped(config,...args);
 const ensure=()=>{const s=current(this,context);if(!s||s.record.claim!==context.claim||s.record.placement!=='placing')throw Error('Надёжные вызовы: исходный призыв изменился во время размещения.');return s;};
 ensure();const amount=2*context.r.wizard,old=Number(read(config.actorUpdates,TEMP)??config.actor.system.attributes.hp.temp??0);
 if(!Number.isFinite(old)||old<0)throw Error('Надёжные вызовы: неизвестен исходный запас Временных хитов.');
 const before=config.actor.system.attributes.hp.temp,previous=config.actor.flags.spikependium?.conjurerDurable;
 const same=previous?.event===context.r.event&&previous.caster===context.r.caster&&previous.remaining===old;
 let choose=!same;
 if(choose&&old>0)choose=await foundry.applications.api.DialogV2.confirm({window:{title:'Надёжные вызовы: Временные хиты'},rejectClose:false,defaultYes:amount>old,
  content:`<p>У призываемого существа уже есть ${old} Временных хитов. Выберите один источник: Надёжные вызовы дают ${amount} Временных хитов и Сопротивления, пока сохраняются именно они. Запасы не складываются.</p>`,yes:{label:`Надёжные вызовы: ${amount}`},no:{label:`Сохранить имеющиеся: ${old}`}});
 ensure();if(config.actor.system.attributes.hp.temp!==before)throw Error('Временные хиты призываемого существа изменились; повторите выбор размещения.');
 if(choose){
  const identity=foundry.utils.randomID(),tag={caster:context.r.caster,event:context.r.event,identity,amount,remaining:amount},effect=foundry.utils.deepClone(CONJURER_DURABLE_EFFECT);
  effect._id='auDurableSummon0';effect.flags.spikependium.conjurerDurable={caster:tag.caster,event:tag.event,identity};delete effect.flags.spikependium.conjurerDurableTemplate;
  effect.system.changes=Object.keys(CONFIG.DND5E.damageTypes).filter(t=>!['force','necrotic','psychic','radiant'].includes(t)).map(t=>({_id:foundry.utils.randomID(),key:'system.traits.dr.value',value:t,type:'add',priority:null,phase:'initial'}));
  config.actorUpdates[TEMP]=amount;config.actorUpdates[TAG]=tag;config.actorUpdates.effects.push(effect);
 }
 context.touched=true;return wrapped(config,...args);
}
export function durableEffectActive(effect){
 const binding=effect?.flags.spikependium?.conjurerDurable,actor=effect?.parent,tag=actor?.flags.spikependium?.conjurerDurable;
 if(!binding||!tag||tag.caster!==binding.caster||tag.event!==binding.event||tag.identity!==binding.identity||!/^[A-Za-z0-9]{16}$/.test(tag.identity??'')
  ||!(tag.remaining>0)||tag.remaining!==actor.system.attributes.hp.temp||tag.remaining>tag.amount)return false;
 const caster=resolve(tag.caster),record=caster?.flags.spikependium?.conjurerDurableCasts?.[tag.event],r=record?.data?.[0];
 return !!(r&&saved(r)&&record.active===1&&tag.amount===2*r.wizard);
}
export function durableCondition(wrapped,data){
 if(!this.parent.flags.spikependium?.conjurerDurable)return wrapped(data);
 return wrapped({...data,spikependium:{...data?.spikependium,conjurerDurableActive:durableEffectActive(this.parent)}});
}
export function recordDurableCalculation(actor,damages,options){
 if(!actor.flags.spikependium?.conjurerDurable)return;
 let map=calculated.get(options);if(!map)calculated.set(options,map=new Map());map.set(actor.uuid,damages.temp??0);
}
export function recordDurableDamage(actor,amount,updates,options){
 const tag=actor.flags.spikependium?.conjurerDurable;if(!tag)return;
 const current=actor.system.attributes.hp.temp,remaining=Math.max(0,current-Math.max(0,amount)),incoming=calculated.get(options)?.get(actor.uuid)??0;calculated.get(options)?.delete(actor.uuid);
 const next=read(updates,TEMP)??remaining;updates[TAG]=tag.remaining===current&&next>0&&incoming<=remaining?{...tag,remaining:next}:null;
}
export function guardDurableHP(actor,changes){
 const tag=actor.flags.spikependium?.conjurerDurable,temp=read(changes,TEMP);if(!tag||temp===undefined)return;
 const next=read(changes,TAG);
 if(next===undefined){const current=actor.system.attributes.hp.temp;changes[TAG]=Number.isFinite(temp)&&temp>0&&temp<current&&tag.remaining===current?{...tag,remaining:temp}:null;}
 else if(next&&next.remaining!==temp)changes[TAG]=null;
}
export function refreshDurable(document,changes){
 if(changes&&!Object.keys(foundry.utils.flattenObject(changes)).some(p=>p.startsWith('flags.spikependium.conjurerDurableCasts')))return;
 const caster=document?.documentName==='Actor'?document:document?.actor;
 const actors=new Map([...(game.actors??[]),...[...(game.scenes??[])].flatMap(s=>[...(s.tokens??[])].map(t=>t.actor))].filter(Boolean).map(a=>[a.uuid,a]));
 for(const actor of actors.values()){const tag=actor.flags.spikependium?.conjurerDurable;if(tag&&(!caster||tag.caster===caster.uuid))actor.reset();}
}
export function durableDeltaLabel(wrapped,...args){const data=wrapped(...args);if(/^flags\.spikependium\.conjurerDurableCasts\.[A-Za-z0-9]{16}\.active$/.test(this.keyPath))data.label='Надёжные вызовы: оплаченный призыв';return data;}
