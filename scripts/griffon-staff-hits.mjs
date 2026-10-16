import { activeFocus, canonicalFocusItem, focusKind, canUseGriffonFocus } from './griffon-foci.mjs';
import { attackSignature, attackSource } from './attack-source.mjs';
import { attackHitTargets } from './companions.mjs';

const resolve=uuid=>uuid&&fromUuidSync(uuid,{strict:false});
const kinds=new Set(['leeching','shaeden']);
const prepared=new WeakMap(), pending=new WeakMap(), calculations=new WeakMap();
const locks=new Set(), delivering=new Set();
const path=nonce=>`flags.spikependium.staffHits.${nonce}.active`;
const records=actor=>Object.values(actor?.flags?.spikependium?.staffHits??{});
const action=activity=>kinds.has(focusKind(activity?.item))&&activity.flags?.spikependium?.staffHit===focusKind(activity.item);
const context=()=>({combat:game.combat?.started?game.combat.id:null,round:game.combat?.round,turn:game.combat?.turn,time:game.time.worldTime});
function current(attack) {
 const c=attack.rolls[0]?.options?.spikependiumStaffHit;
 const now=context();
 return c&&(c.combat?c.combat===now.combat&&c.round===now.round&&c.turn===now.turn:!now.combat&&c.time===now.time);
}
function frame(attack,item) {
 const a=attack?.getAssociatedActivity?.(), kind=focusKind(item), roll=attack?.rolls?.[0], c=roll?.options?.spikependiumStaffHit;
 if(!kinds.has(kind)||attack?.type!=='attack'||attack.rolls.length!==1||attack.system.targets.length!==1||a?.type!=='attack'
  ||a.attack.type.classification!=='weapon'||a.item.uuid!==item.uuid||a.actor.uuid!==item.actor?.uuid
  ||!attack.author||!item.actor.testUserPermission(attack.author,'OWNER')||attack.isContentVisible===false
  ||!c?.active||c.source!==item.uuid||c.kind!==kind||!(roll instanceof CONFIG.Dice.D20Roll)||!roll._evaluated)return;
 const hits=attackHitTargets(attack);if(hits.length!==1)return;
 const target=hits[0].token.actor;
 if(kind==='leeching'&&['undead','construct'].includes(target.system.details?.type?.value))return;
 if(kind==='shaeden'&&a.getActionType(attack.system.mode)!=='mwak')return;
 return {attack:attack.uuid,signature:attackSignature(attack),activity:a.uuid,source:item.uuid,caster:item.actor.uuid,
  target:target.uuid,token:hits[0].token.uuid,kind,critical:!!roll.isCritical};
}
function same(a,b) {return a&&b&&['attack','signature','activity','source','caster','target','token','kind','critical'].every(k=>a[k]===b[k]);}
function source(receipt) {
 const caster=resolve(receipt?.caster), item=caster?.items.get(receipt?.source?.split('.').at(-1)), attack=resolve(receipt?.attack);
 return item&&same(receipt,frame(attack,item))?{caster,item,attack}:undefined;
}
export function paidStaffHit(receipt) {
 if(!receipt||!/^[A-Za-z0-9]{16}$/.test(receipt.nonce))return;
 const origin=source(receipt);if(!origin)return;
 const record=origin.caster.flags.spikependium?.staffHits?.[receipt.nonce];
 if(record?.active!==1||!same(record,receipt))return;
 const usage=[...game.messages].find(m=>m.type==='usage'&&m.flags?.spikependium?.staffHit===receipt.nonce
  &&m.author&&origin.caster.testUserPermission(m.author,'OWNER')&&m.getAssociatedActivity()?.item.uuid===receipt.source
  &&action(m.getAssociatedActivity())&&m.system.deltas?.actor?.some(d=>d.keyPath===path(receipt.nonce)&&d.delta===1)
  &&m.system.deltas.item?.[origin.item.id]?.some(d=>d.keyPath==='system.uses.spent'&&d.delta===1));
 return usage?{...origin,receipt:record,usage}:undefined;
}
function eligible(attack,item) {
 const f=frame(attack,item);
 if(!f||!current(attack)||!item.actor.isOwner||!activeFocus(item)||!(item.system.quantity>0)
  ||canUseGriffonFocus({type:'utility',item})===false||!(item.system.uses.value>0))return;
 const latest=[...game.messages].reverse().find(m=>m.type==='attack'&&m.getAssociatedActivity()?.actor?.uuid===item.actor.uuid);
 if(latest!==attack||records(item.actor).some(r=>same(r,f)&&r.active===1))return;
 return f;
}
function protectAudience(attack,message) {
 message.data??={};
 if(attack.whisper?.length){const audience=message.data.whisper?.length?message.data.whisper.filter(id=>attack.whisper.includes(id)):[...attack.whisper];if(!audience.length)return false;message.data.whisper=audience;}
 message.data.blind=!!message.data.blind||!!attack.blind;return true;
}
export function snapshotStaffHit(activity,config) {
 const item=canonicalFocusItem(activity.item), kind=focusKind(item);if(!kinds.has(kind))return;
 config.options.spikependiumStaffHit={...context(),kind,source:item.uuid,active:!!activeFocus(item)&&canUseGriffonFocus({type:'utility',item})!==false};
}
export function prepareStaffHitUse(activity,config={},_dialog,message={}) {
 if(!action(activity))return;
 const item=canonicalFocusItem(activity.item), selected=config.spikependium?.staffHit;
 const attack=selected?resolve(selected):[...game.messages].reverse().find(m=>m.type==='attack'&&m.getAssociatedActivity()?.actor?.uuid===item.actor.uuid);
 const f=eligible(attack,item);
 if(!f||message.create===false){ui.notifications.warn('Нужно свежее одиночное попадание этим посохом по допустимой цели.');return false;}
 config.spikependium={...config.spikependium,staffHit:attack.uuid,staffHitSignature:f.signature};message.hasConsumption=true;
 if(!protectAudience(attack,message))return false;
}
export function prepareStaffHitUpdates(activity,config,updates) {
 prepared.delete(activity);if(!action(activity))return updates;
 const item=canonicalFocusItem(activity.item), f=eligible(resolve(config.spikependium?.staffHit),item);
 if(!f||f.signature!==config.spikependium.staffHitSignature||updates.item.find(i=>i._id===item.id)?.['system.uses.spent']!==item.system.uses.spent+1)return false;
 const receipt={...f,nonce:foundry.utils.randomID(),active:1};
 updates.actor[`flags.spikependium.staffHits.${receipt.nonce}`]=receipt;prepared.set(activity,receipt);return updates;
}
export function recordStaffHitConsumption(activity,_config,message) {
 const receipt=prepared.get(activity);prepared.delete(activity);
 if(!receipt||foundry.utils.getProperty(activity.actor,path(receipt.nonce))!==1)return;
 const deltas=((message.data.system??={}).deltas??={}).actor??=[];
 if(!deltas.some(d=>d.keyPath===path(receipt.nonce)))deltas.push({keyPath:path(receipt.nonce),delta:1});
 foundry.utils.setProperty(message,'data.flags.spikependium.staffHit',receipt.nonce);
}
export async function staffHitDamage(wrapped,config={},dialog={},message={}) {
 const item=canonicalFocusItem(this.item);if(!kinds.has(focusKind(item)))return wrapped(config,dialog,message);
 const saved=message.data?.flags?.spikependium?.attackSource, attack=resolve(saved?.message), f=frame(attack,item);
 if(!f||saved.signature!==f.signature)return wrapped(config,dialog,message);
 if(!this.actor.isOwner)return;
 message=foundry.utils.deepClone(message);if(!protectAudience(attack,message))return;
 if(locks.has(this.actor.uuid))return;locks.add(this.actor.uuid);
 try {
  let receipt=records(item.actor).find(r=>same(r,f)&&paidStaffHit(r));
  const property=[...item.system.activities.values()].find(action);
  if(!receipt&&property&&eligible(attack,item)) {
   const yes=await foundry.applications.api.DialogV2.confirm({window:{title:'Магическое попадание посохом'},rejectClose:false,
    content:`<p>Потратить 1 заряд и добавить ${f.kind==='leeching'?'1к6':'1к10'} некротического урона к этой атаке?</p>`});
   if(yes){await property.use({configure:false,spikependium:{staffHit:attack.uuid}});receipt=records(item.actor).find(r=>same(r,f)&&paidStaffHit(r));if(!receipt)return;}
  }
  if(!receipt)return wrapped(config,dialog,message);
  pending.set(this,receipt);
  foundry.utils.setProperty(message,'data.flags.spikependium.staffHit',receipt.nonce);
  return await wrapped({...config,isCritical:f.critical,properties:[...new Set([...(config.properties??[]),'mgc'])]},dialog,message);
 } finally {pending.delete(this);locks.delete(this.actor.uuid);}
}
export function allowStaffHitDamage(config,message) {
 const receipt=pending.get(config.subject);
 return config.subject?.actor?.isOwner&&message?.data?.type==='damage'&&message.data.flags?.spikependium?.staffHit===receipt?.nonce&&!!paidStaffHit(receipt);
}
export function staffHitDamageParts(wrapped,config={},...args) {
 const parts=wrapped(config,...args),receipt=pending.get(this);if(!parts.length||!paidStaffHit(receipt))return parts;
 const extra=parts[0].clone({number:1,denomination:receipt.kind==='leeching'?6:10,bonus:'',types:['necrotic'],custom:{enabled:false,formula:''},scaling:{mode:'',number:null,formula:''}});
 extra.base=false;extra.staffHitNonce=receipt.nonce;return [...parts,extra];
}
export function staffHitDamagePart(wrapped,damage,...args) {
 const result=wrapped(damage,...args),receipt=pending.get(this);
 if(damage.staffHitNonce&&damage.staffHitNonce===receipt?.nonce&&paidStaffHit(receipt))result.options.spikependiumStaffHit=receipt.nonce;
 return result;
}
function damageInfo(card) {
 const nonce=card?.flags?.spikependium?.staffHit;if(!nonce||card.type!=='damage')return;
 const caster=card.getAssociatedActivity()?.actor,receipt=caster?.flags.spikependium?.staffHits?.[nonce],paid=paidStaffHit(receipt);
 const extra=card.rolls?.filter(r=>r.options?.spikependiumStaffHit===nonce)??[];
 if(!paid||!card.author||!caster.testUserPermission(card.author,'OWNER')||attackSource(card)?.uuid!==receipt.attack
  ||extra.length!==1||extra[0].options.type!=='necrotic'||!card.rolls.every(r=>r instanceof CONFIG.Dice.DamageRoll&&r._evaluated&&Number.isFinite(r.total)))return;
 return {...paid,extra:extra[0],card};
}
export function recordStaffDrainCalculation(actor,damages,options) {
 const info=damageInfo(options.originatingMessage);let map=calculations.get(options);if(!map)calculations.set(options,map=new Map());map.delete(actor.uuid);
 if(!info||info.receipt.kind!=='leeching'||info.receipt.target!==actor.uuid)return;
 // shortcut: mixed necrotic riders cannot be attributed after native aggregation; resolve their healing manually.
 if(info.card.rolls.filter(r=>r.options.type==='necrotic').length!==1){ui.notifications.warn('В атаке несколько источников некротического урона: лечение посоха определите вручную.');return;}
 const amount=damages.filter(d=>d.type==='necrotic').reduce((n,d)=>n+d.value,0);
 if(Number.isFinite(amount)&&amount>0)map.set(actor.uuid,{nonce:info.receipt.nonce,caster:info.caster.uuid,amount,damage:info.card.uuid,signature:attackSignature(info.card),pending:1});
}
export function guardStaffHitApplication(actor,_amount,updates,options) {
 const healing=options.spikependiumStaffDrain;
 if(healing){const target=resolve(healing.target),r=target?.flags.spikependium?.staffDrains?.[healing.nonce],info=damageInfo(resolve(r?.damage));
  if(!r?.pending||!info||info.caster.uuid!==actor.uuid||info.receipt.nonce!==healing.nonce||info.receipt.target!==target.uuid||r.signature!==attackSignature(info.card)
   ||actor.flags.spikependium?.staffDrainHeals?.[healing.nonce]||healing.amount!==r.amount)return false;
  updates[`flags.spikependium.staffDrainHeals.${healing.nonce}`]=1;return;
 }
 const card=options.originatingMessage;
 if(card?.flags?.spikependium?.staffHit){const info=damageInfo(card);if(!info||info.receipt.target!==actor.uuid){ui.notifications.warn('Усиление посоха отменено, исходное попадание изменено или выбрана другая цель. Повторите бросок урона из актуальной атаки.');return false;}}
 const r=calculations.get(options)?.get(actor.uuid);calculations.get(options)?.delete(actor.uuid);
 if(r&&!actor.flags.spikependium?.staffDrains?.[r.nonce])updates[`flags.spikependium.staffDrains.${r.nonce}`]=r;
}
export async function resumeStaffDrains() {
 if(game.users.activeGM&&!game.user.isActiveGM)return;
 const actors=new Map([...(game.actors??[]),...(game.scenes??[]).flatMap(s=>[...s.tokens].map(t=>t.actor).filter(Boolean))].map(a=>[a.uuid,a]));
 for(const target of actors.values())for(const[nonce,r]of Object.entries(target.flags.spikependium?.staffDrains??{})) {
  const lock=`${target.uuid}:${nonce}`;if(!r.pending||!target.isOwner||delivering.has(lock))continue;
  const info=damageInfo(resolve(r.damage));if(!info||info.receipt.nonce!==nonce||info.receipt.target!==target.uuid||info.caster.uuid!==r.caster||!info.caster.isOwner||r.signature!==attackSignature(info.card)||!(r.amount>0))continue;
  delivering.add(lock);
  try {
   if(!info.caster.flags.spikependium?.staffDrainHeals?.[nonce])await info.caster.applyDamage([{type:'healing',value:r.amount}],{originatingMessage:info.card,spikependiumStaffDrain:{nonce,target:target.uuid,amount:r.amount}});
   if(info.caster.flags.spikependium?.staffDrainHeals?.[nonce])await target.update({[`flags.spikependium.staffDrains.${nonce}.pending`]:0});
  } finally {delivering.delete(lock);}
 }
}
export function staffHitDeltaLabel(wrapped,...args) {
 const result=wrapped(...args);if(/^flags\.spikependium\.staffHits\.[A-Za-z0-9]{16}\.active$/.test(this.keyPath))result.label='Оплаченное усиление попадания посохом';return result;
}
