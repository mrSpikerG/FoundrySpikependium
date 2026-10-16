import { activeFocus, canonicalFocusItem, focusKind } from './griffon-foci.mjs';
import { attackSource, attackSignature, guardianRawTarget, guardianRecords } from './attack-source.mjs';
import { defensiveCharmOutcome, defensiveCharmWaiting } from './performer-defense.mjs';
import { reactionAvailable } from './reactions.mjs';
import { tokensDistance, incapacitated } from './effects.mjs';
import { attackHitTargets } from './companions.mjs';

const resolve=uuid=>uuid&&fromUuidSync(uuid,{strict:false});
const auto=a=>focusKind(a?.item)==='thwack'&&a.flags?.spikependium?.staffParry;
const counter=a=>focusKind(a?.item)==='thwack'&&a.flags?.spikependium?.staffCounter;
const records=actor=>Object.values(actor?.flags?.spikependium?.thwackParries??{});
const path=nonce=>`flags.spikependium.thwackParries.${nonce}`;
const prepared=new WeakMap(),damageContext=new WeakMap(),using=new Set(),applying=new Set(),marked=Symbol('thwack');
const turn=()=>game.combat?.started?`${game.combat.id}:${game.combat.round}:${game.combat.turn}`:null;
const latestOwn=actor=>[...game.messages].reverse().find(m=>m.type==='attack'&&m.getAssociatedActor?.()?.uuid===actor.uuid)?.uuid??null;
function binding(actor,attack) {
 const a=attack?.getAssociatedActivity?.(),roll=attack?.rolls?.[0],attacker=attack?.getAssociatedToken?.();
 if(attack?.type!=='attack'||attack.rolls.length!==1||attack.system.targets.length!==1||!(roll instanceof CONFIG.Dice.D20Roll)||!roll._evaluated
  ||!Number.isFinite(roll.total)||!a||!['mwak','msak'].includes(a.getActionType(attack.system.mode))||!attacker?.actor?.system.isCreature
  ||!attack.author||!a.actor.testUserPermission(attack.author,'OWNER')||guardianRecords(attack).some(r=>['prompted','moving','stopped'].includes(r.state)))return;
 const target=guardianRawTarget(attack,attack.system.targets[0]),token=resolve(target.token);
 if(token?.actor?.uuid!==actor?.uuid||attacker.parent!==token.parent||!Number.isFinite(target.ac)
  ||(!roll.isCritical&&(roll.isFumble||roll.total<target.ac)))return;
 return {attack:attack.uuid,signature:attackSignature(attack),targets:JSON.stringify(attack.system.targets),actor:actor.uuid,target:token.uuid,
  attacker:attacker.actor.uuid,attackerToken:attacker.uuid,ac:target.ac};
}
const same=(a,b)=>a&&b&&['attack','signature','targets','actor','target','attacker','attackerToken','ac'].every(k=>a[k]===b[k]);
function fresh(actor,attack) {
 const stamp=attack?.flags?.spikependium?.guardianAttack;
 if(!stamp||stamp.time!==game.time.worldTime||stamp.turn!==turn())return false;
 const messages=[...game.messages],index=messages.indexOf(attack);
 if(index<0||messages.slice(index+1).some(m=>m.type==='attack'&&m.getAssociatedActor?.()?.uuid===actor.uuid))return false;
 return messages.reverse().find(m=>m.type==='attack'&&m.system.targets.some(t=>resolve(guardianRawTarget(m,t).token)?.actor?.uuid===actor.uuid))===attack;
}
function ready(activity,attack) {
 const actor=activity.actor,item=canonicalFocusItem(activity.item),b=binding(actor,attack);
 if(!b||!actor.isOwner||actor.items.get(item.id)!==item||!activeFocus(item)||!(item.system.quantity>0)||!(item.system.uses.value>0)
  ||!reactionAvailable(actor)||!fresh(actor,attack)||attack.isContentVisible===false||actor.flags.spikependium?.thwackDamage?.[attack.id]
  ||records(actor).some(r=>r.active===1&&same(r,b))||defensiveCharmOutcome(attack,{token:b.target})==='miss'||defensiveCharmWaiting(attack,{token:b.target}))return;
 return b;
}
function parryInfo(actor,nonce) {
 const r=actor?.flags.spikependium?.thwackParries?.[nonce],attack=resolve(r?.attack);
 if(!r||r.active!==1||!/^[A-Za-z0-9]{16}$/.test(nonce)||!same(r,binding(actor,attack)))return;
 const usage=[...game.messages].find(m=>m.type==='usage'&&m.flags?.spikependium?.staffParry===nonce&&m.author&&actor.testUserPermission(m.author,'OWNER')
  &&auto(m.getAssociatedActivity?.())&&m.getAssociatedActivity().uuid===r.activity&&m.getAssociatedActivity().item.uuid===r.item
  &&m.system.deltas?.actor?.some(d=>d.keyPath===`${path(nonce)}.active`&&d.delta===1)
  &&m.system.deltas.actor.some(d=>d.keyPath===`flags.spikependium.reactionCasts.${r.reaction}.spent`&&d.delta===1)
  &&m.system.deltas.item?.[r.item.split('.').at(-1)]?.some(d=>d.keyPath==='system.uses.spent'&&d.delta===1));
 const dice=usage?.rolls?.filter(d=>d.options.spikependiumThwack===nonce)??[];
 if(dice.length!==1||!(dice[0] instanceof CONFIG.Dice.BasicRoll)||!dice[0]._evaluated||dice[0].formula!=='1d6'||!Number.isInteger(r.value)||r.value<1||r.value>6||dice[0].total!==r.value)return;
 return {r,attack,usage,actor};
}
function infoFor(attack,target) {
 const actor=resolve(target?.token)?.actor;
 for(const r of records(actor))if(r.active===1&&r.attack===attack?.uuid&&r.target===target.token){const info=parryInfo(actor,r.nonce);if(info)return info;}
}
const converted=info=>info&&!info.attack.rolls[0].isCritical&&info.attack.rolls[0].total<info.r.ac+info.r.value;
export function thwackTarget(attack,target,index=0) {
 if(index!==0||target[marked])return target;
 const info=infoFor(attack,target);if(!info)return target;
 const ac=target.ac+info.r.value,result={...target,ac,isMiss:target.isMiss||(!attack.rolls[0].isCritical&&attack.rolls[0].total<ac)};
 Object.defineProperty(result,marked,{value:true,enumerable:true});return result;
}
function counterInfo(activity,nonce) {
 const actor=activity?.actor,info=parryInfo(actor,nonce);
 if(!counter(activity)||!converted(info)||activity.item.uuid!==info.r.item)return;
 return info;
}
function reach(info,activity) {
 const first=resolve(info.r.target),second=resolve(info.r.attackerToken),distance=first&&second&&tokensDistance(first,second);
 const range=activity.item.system.range,feet=dnd5e.utils.convertLength(range.reach??5,range.units||'ft','ft');
 return distance==null?null:distance<=feet;
}
function counterReady(activity,nonce) {
 const info=counterInfo(activity,nonce),item=canonicalFocusItem(activity.item);
 if(!info||info.r.counterSpent!==0||!info.actor.isOwner||info.actor.items.get(item.id)!==item||!(item.system.quantity>0)||!activeFocus(item)||incapacitated(info.actor)
  ||!fresh(info.actor,info.attack)||latestOwn(info.actor)!==info.r.selfAttack||reach(info,activity)===false)return;
 return info;
}
function paidCounter(usage) {
 const nonce=usage?.flags?.spikependium?.staffCounter,a=usage?.getAssociatedActivity?.(),info=counterInfo(a,nonce);
 if(!info||info.r.counterSpent!==1||usage.type!=='usage'||!usage.author||!info.actor.testUserPermission(usage.author,'OWNER')
  ||!usage.system.deltas?.actor?.some(d=>d.keyPath===`${path(nonce)}.counterSpent`&&d.delta===1))return;
 return {...info,counter:a,counterUsage:usage};
}
function origin(config,message) {
 const id=config?.event?.target?.closest('[data-message-id]')?.dataset.messageId??message?.data?.system?.origin;
 return typeof id==='string'?game.messages.get(id)??resolve(id):id;
}
function usageOf(card) {return card?.type==='usage'?card:card?.getOriginatingMessage?.();}
function protect(attack,message) {
 message.data??={};
 if(attack.whisper?.length){const audience=message.data.whisper?.length?message.data.whisper.filter(id=>attack.whisper.includes(id)):[...attack.whisper];if(!audience.length)return false;message.data.whisper=audience;}
 message.data.blind=!!message.data.blind||!!attack.blind;return true;
}
const descriptors=info=>dnd5e.dataModels.chatMessage.fields.TargetsField.getDescriptors([resolve(info.r.attackerToken)]);
export async function thwackUse(wrapped,config={},dialog={},message={}) {
 if(!auto(this)&&!counter(this))return wrapped(config,dialog,message);
 const useKey=`${this.actor.uuid}:${counter(this)?'counter':'parry'}`;
 if(using.has(useKey))return;
 using.add(useKey);
 try {
  if(counter(this)) {
   const nonce=config.spikependium?.staffCounter??records(this.actor).find(r=>counterReady(this,r.nonce))?.nonce,info=counterReady(this,nonce);
   if(!info){ui.notifications.warn('Контратака требует попадания, обращённого парированием в промах, и атакующего в досягаемости.');return;}
   if(reach(info,this)===null&&!config.spikependium?.staffCounterReach&&!await foundry.applications.api.DialogV2.confirm({window:{title:'Колотун-посох: досягаемость'},content:'<p>Подтверждаете, что атакующий находится в досягаемости посоха?</p>'}))return;
   message=foundry.utils.deepClone(message);if(!protect(info.attack,message))return;
   const result=await wrapped({...config,subsequentActions:false,spikependium:{...config.spikependium,staffCounter:nonce,staffCounterReach:true}},dialog,message);
   if(result?.message&&config.subsequentActions!==false)await this.rollAttack({}, {}, {data:{system:{origin:result.message.id}}});
   return result;
  }
  const selected=config.spikependium?.staffParry,attack=selected?resolve(selected):[...game.messages].reverse().find(m=>ready(this,m)),b=ready(this,attack);
  if(!b){ui.notifications.warn('Нужно свежее неразрешённое рукопашное попадание по вам, заряд и свободная реакция. Для неоднозначных случаев есть ручное парирование.');return;}
  // shortcut: observer visibility does not prove the actor can see; ask until actor-specific sight is available.
  if(config.spikependium?.staffParryVisible!==true&&!await foundry.applications.api.DialogV2.confirm({window:{title:'Колотун-посох: парирование'},rejectClose:false,
   content:`<p>Подтверждаете, что видите атакующего? Потратить реакцию и 1 заряд на парирование${attack.rolls[0].isCritical?'? Критическое попадание повышение КБ не отменит.':'?'}</p>`}))return;
  message=foundry.utils.deepClone(message);if(!protect(attack,message))return;
  const result=await wrapped({...config,spikependium:{...config.spikependium,staffParry:attack.uuid,staffParrySignature:b.signature,staffParryVisible:true}},dialog,message);
  const nonce=result?.message?.flags.spikependium?.staffParry,info=parryInfo(this.actor,nonce);
  if(converted(info)) {
   const retaliation=[...this.item.system.activities.values()].find(counter);
   if(retaliation&&counterReady(retaliation,nonce)&&await foundry.applications.api.DialogV2.confirm({window:{title:'Колотун-посох: контратака'},rejectClose:false,
    content:`<p>Удар обращён в промах. Контратаковать посохом в рамках той же реакции? При попадании к урону прибавится сохранённое число ${info.r.value}. Атакующий должен быть в досягаемости.</p>`}))
    await retaliation.use({spikependium:{staffCounter:nonce,staffCounterReach:true}});
  }
  return result;
 } finally {using.delete(useKey);}
}
export function prepareThwackUse(activity,config,_dialog,message) {
 if(auto(activity)) {
  const attack=resolve(config.spikependium?.staffParry),b=ready(activity,attack);
  if(!b||b.signature!==config.spikependium.staffParrySignature||config.spikependium.staffParryVisible!==true||message.create===false)return false;
 }else if(counter(activity)) {
  if(!counterReady(activity,config.spikependium?.staffCounter)||config.spikependium.staffCounterReach!==true||message.create===false)return false;
 }else return;
 message.hasConsumption=true;
}
export async function prepareThwackUpdates(activity,config,updates) {
 prepared.delete(activity);
 if(counter(activity)) {
  const nonce=config.spikependium?.staffCounter;if(!counterReady(activity,nonce))return false;
  updates.actor[`${path(nonce)}.counterSpent`]=1;prepared.set(activity,{counter:nonce});return updates;
 }
 if(!auto(activity))return updates;
 const attack=resolve(config.spikependium?.staffParry),b=ready(activity,attack),reaction=updates.actor['flags.spikependium.reactionId'];
 if(!b||b.signature!==config.spikependium.staffParrySignature||config.spikependium.staffParryVisible!==true||!reaction
  ||updates.actor[`flags.spikependium.reactionCasts.${reaction}`]?.spent!==1||updates.item.find(i=>i._id===activity.item.id)?.['system.uses.spent']!==activity.item.system.uses.spent+1)return false;
 const nonce=foundry.utils.randomID(),die=await new CONFIG.Dice.BasicRoll('1d6',{}, {flavor:'Колотун-посох: парирование',spikependiumThwack:nonce}).evaluate();
 if(!Number.isInteger(die.total)||die.total<1||die.total>6)throw Error('Некорректный результат к6 парирования');
 const r={...b,nonce,item:activity.item.uuid,activity:activity.uuid,reaction,value:die.total,active:1,counterSpent:0,selfAttack:latestOwn(activity.actor)};
 updates.actor[path(nonce)]=r;updates.rolls.push(die);prepared.set(activity,{parry:nonce});return updates;
}
export function recordThwackConsumption(activity,_config,message) {
 const receipt=prepared.get(activity);prepared.delete(activity);if(!receipt)return;
 const nonce=receipt.parry??receipt.counter,field=receipt.parry?'active':'counterSpent',p=`${path(nonce)}.${field}`;
 if(foundry.utils.getProperty(activity.actor,p)!==1)return;
 const deltas=((message.data.system??={}).deltas??={}).actor??=[];if(!deltas.some(d=>d.keyPath===p))deltas.push({keyPath:p,delta:1});
 foundry.utils.setProperty(message,`data.flags.spikependium.${receipt.parry?'staffParry':'staffCounter'}`,nonce);
}
export async function thwackApplyDamage(wrapped,damages,options={}) {
 const card=options.originatingMessage,attack=attackSource(card),b=card?.type==='damage'&&card.getAssociatedActivity?.()?.uuid===attack?.getAssociatedActivity?.()?.uuid?binding(this,attack):undefined;
 if(!b||!this.isOwner||card.system?.isHealing||options.only==='healing'||!Array.isArray(damages)||!damages.some(d=>d.value>0&&d.type in CONFIG.DND5E.damageTypes))return wrapped(damages,options);
 if(applying.has(this.uuid)){ui.notifications.warn('Сначала завершите открытое парирование этого персонажа.');return this;}
 applying.add(this.uuid);
 try {
  const candidates=[...this.items].flatMap(i=>[...(i.system.activities?.values?.()??[]) ]).filter(a=>auto(a)&&ready(a,attack));
  if(!infoFor(attack,{token:b.target})&&candidates.length&&await foundry.applications.api.DialogV2.confirm({window:{title:'Колотун-посох'},rejectClose:false,
   content:`<p>Видите атакующего и хотите потратить реакцию и заряд на парирование этого рукопашного попадания?${attack.rolls[0].isCritical?' Критическое попадание повышение КБ не отменит.':''}</p>`}))await candidates[0].use({spikependium:{staffParry:attack.uuid,staffParryVisible:true}});
  const info=infoFor(attack,{token:b.target});if(converted(info))return this;
  if(records(this).some(r=>r.active===1&&same(r,b))&&!info){ui.notifications.warn('Парирование ещё не опубликовано или его карточка изменилась. Урон пока не применён.');return this;}
  return await wrapped(damages,options);
 }finally{applying.delete(this.uuid);}
}
export function markThwackDamage(actor,amount,updates,options) {
 const card=options.originatingMessage,attack=attackSource(card);
 if(amount<0||options.only==='healing'||card?.type!=='damage'||card.system?.isHealing||card.getAssociatedActivity?.()?.uuid!==attack?.getAssociatedActivity?.()?.uuid||!actor.items.some(i=>focusKind(i)==='thwack'))return;
 const b=binding(actor,attack);if(!b)return;if(converted(infoFor(attack,{token:b.target})))return false;
 updates[`flags.spikependium.thwackDamage.${attack.id}`]=1;
}
export async function thwackCounterAttack(wrapped,config={},dialog={},message={}) {
 if(!counter(this))return wrapped(config,dialog,message);
 const usage=usageOf(origin(config,message)),info=paidCounter(usage);if(!info||info.counter.uuid!==this.uuid||!this.actor.isOwner)return;
 const targets=descriptors(info);message=foundry.utils.deepClone(message);if(!protect(info.attack,message))return;
 foundry.utils.setProperty(message,'data.system.targets',targets);foundry.utils.setProperty(message,'data.flags.spikependium.staffCounter',info.r.nonce);
 return wrapped({...config,target:targets[0]?.ac??null},dialog,message);
}
function counterShot(card) {
 const shot=attackSource(card),info=paidCounter(usageOf(shot));
 return info&&shot?.type==='attack'&&counter(shot.getAssociatedActivity())&&shot.getAssociatedActivity().uuid===info.counter.uuid
  &&shot.flags.spikependium?.staffCounter===info.r.nonce&&shot.rolls.length===1&&shot.system.targets.length===1
  &&attackHitTargets(shot).some(h=>h.token.uuid===info.r.attackerToken)?{...info,shot}:undefined;
}
export async function thwackCounterDamage(wrapped,config={},dialog={},message={}) {
 if(!counter(this))return wrapped(config,dialog,message);
 const saved=message.data?.flags?.spikependium?.attackSource,shot=resolve(saved?.message),info=counterShot(shot);
 if(!info||saved.signature!==attackSignature(shot)||!this.actor.isOwner)return;
 damageContext.set(this,info);
 try {message=foundry.utils.deepClone(message);if(!protect(info.attack,message))return;
  foundry.utils.setProperty(message,'data.flags.spikependium.staffCounter',info.r.nonce);
  return await wrapped({...config,isCritical:!!shot.rolls[0].isCritical},dialog,message);
 }finally{damageContext.delete(this);}
}
export function thwackDamagePart(wrapped,damage,...args) {
 const result=wrapped(damage,...args),info=damageContext.get(this);if(damage.base&&info&&paidCounter(info.counterUsage))result.parts.push(String(info.r.value));return result;
}
export function guardThwackCounterDamage(actor,_amount,_updates,options) {
 const card=options.originatingMessage;if(!counter(card?.getAssociatedActivity?.())&&!card?.flags?.spikependium?.staffCounter)return;
 const info=counterShot(card);if(!info||info.r.attacker!==actor.uuid)return false;
}
export async function refreshThwack(document,changes) {
 if(document?.type==='usage'&&!document.flags.spikependium?.staffParry&&!document.flags.spikependium?.staffCounter)return;
 if(changes&&document?.type!=='usage'&&!foundry.utils.getProperty(changes,'flags.spikependium.thwackParries')&&!Object.keys(changes).some(k=>k.startsWith('flags.spikependium.thwackParries')))return;
 const actor=document?.documentName==='ActorDelta'?document.parent.actor:document?.type==='usage'?document.getAssociatedActor?.():document;
 for(const r of records(actor)){const attack=resolve(r.attack);if(attack)await ui.chat?.updateMessage(attack,{notify:false});}
}
export function thwackDeltaLabel(wrapped,...args) {
 const result=wrapped(...args);if(/^flags\.spikependium\.thwackParries\.[A-Za-z0-9]{16}\.(active|counterSpent)$/.test(this.keyPath))result.label=this.keyPath.endsWith('.active')?'Парирование Колотун-посохом':'Контратака Колотун-посохом';return result;
}
