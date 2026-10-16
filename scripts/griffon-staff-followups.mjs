import { activeFocus, canonicalFocusItem, focusKind, canUseGriffonFocus } from './griffon-foci.mjs';
import { attackSignature, guardianTarget, guardianRecords } from './attack-source.mjs';

const resolve=uuid=>uuid&&fromUuidSync(uuid,{strict:false});
const rootOf=activity=>activity?.getLinkedActivity?.()??activity;
const roots=new Set(['cratering','arcanist-bowstaff']);
const prepared=new WeakMap(),offering=new Set();
const records=actor=>Object.values(actor?.flags?.spikependium?.staffFollowups??{});
const path=nonce=>`flags.spikependium.staffFollowups.${nonce}.active`;
const turn=()=>({combat:game.combat?.started?game.combat.id:null,round:game.combat?.round??null,turn:game.combat?.turn??null,time:game.time.worldTime});
function kind(activity) {
 const root=rootOf(activity), id=focusKind(root?.item),f=root?.flags?.spikependium;
 return id==='cratering'&&root.type==='save'&&f?.staffCrater?id:id==='arcanist-bowstaff'&&root.type==='cast'&&f?.staffMissile?id:undefined;
}
function frame(attack,item) {
 const a=attack?.getAssociatedActivity?.(),id=focusKind(item),r=attack?.rolls?.[0],c=r?.options?.spikependiumStaffFollowup;
 if(!roots.has(id)||attack?.type!=='attack'||attack.rolls.length!==1||!(r instanceof CONFIG.Dice.D20Roll)||!r._evaluated||!Number.isFinite(r.total)
  ||a?.type!=='attack'||a.attack.type.classification!=='weapon'||a.item.uuid!==item.uuid||a.actor.uuid!==item.actor?.uuid
  ||!attack.author||!item.actor.testUserPermission(attack.author,'OWNER')||!c?.active||c.source!==item.uuid||c.kind!==id)return;
 let primary;
 if(id==='cratering') {
  if(guardianRecords(attack).some(r=>['prompted','moving','stopped'].includes(r.state)))return;
  if(attack.system.targets.length===1)primary=resolve(guardianTarget(attack,attack.system.targets[0]).token);
 }
 return {attack:attack.uuid,signature:attackSignature(attack),targets:JSON.stringify(attack.system.targets),source:item.uuid,caster:item.actor.uuid,kind:id,
  primary:primary?.actor?.uuid??null,token:primary?.actor?primary.uuid:null,combat:c.combat,round:c.round,turn:c.turn,time:c.time};
}
const same=(a,b)=>a&&b&&['attack','signature','targets','source','caster','kind','primary','token','combat','round','turn','time'].every(k=>a[k]===b[k]);
function current(f) {const c=turn();return f.combat?c.combat===f.combat&&c.round===f.round&&c.turn===f.turn:!c.combat&&c.time===f.time;}
function bonusCounter(activity) {
 const consume=CONFIG.DND5E.activityActivationTypes.bonus?.consume;
 if(!consume||(consume.canConsume?.(activity)===false))return;
 const counter=foundry.utils.getProperty(activity.actor.system,consume.property);
 return counter?{path:`system.${consume.property}.spent`,counter}:undefined;
}
function eligible(attack,root) {
 const item=canonicalFocusItem(root.item), f=frame(attack,item);if(!f||!current(f)||!item.actor.isOwner||item.actor.items.get(item.id)!==item||!activeFocus(item)||!(item.system.quantity>0)
  ||!(item.system.uses.value>0)||canUseGriffonFocus(root)===false)return;
 if(game.combat?.started&&game.combat.combatant?.actor?.uuid!==item.actor.uuid)return;
 if([...game.messages].reverse().find(m=>m.type==='attack'&&m.getAssociatedActivity()?.actor?.uuid===item.actor.uuid)!==attack)return;
 if(records(item.actor).some(r=>r.active===1&&(same(r,f)||(f.kind==='arcanist-bowstaff'&&f.combat&&!bonusCounter(root)&&r.kind===f.kind&&r.combat===f.combat&&r.round===f.round&&r.turn===f.turn))))return;
 if(f.kind==='cratering'&&f.combat&&foundry.utils.getProperty(item.actor,`flags.spikependium.staffCraterTurns.${f.combat}.${f.round}.${f.turn}`)===1)return;
 if(f.kind==='arcanist-bowstaff'&&bonusCounter(root)?.counter.value<1)return;
 return f;
}
function protect(attack,message) {
 message.data??={};
 if(attack.whisper?.length){const audience=message.data.whisper?.length?message.data.whisper.filter(id=>attack.whisper.includes(id)):[...attack.whisper];if(!audience.length)return false;message.data.whisper=audience;}
 message.data.blind=!!message.data.blind||!!attack.blind;return true;
}
export function snapshotStaffFollowup(activity,config) {
 const item=canonicalFocusItem(activity.item),id=focusKind(item);if(!roots.has(id))return;
 config.options.spikependiumStaffFollowup={...turn(),source:item.uuid,kind:id,active:!!activeFocus(item)&&item.system.quantity>0};
}
export async function staffFollowupUse(wrapped,config={},...args) {
 const root=rootOf(this),id=kind(root);if(!id)return wrapped(config,...args);
 const selected=config.spikependium?.staffFollowup,attack=selected?resolve(selected):[...game.messages].reverse().find(m=>m.type==='attack'&&m.getAssociatedActivity()?.actor?.uuid===root.actor.uuid);
 const f=eligible(attack,root);if(!f){ui.notifications.warn('Нужно свежее применение атаки этим посохом и доступное особое свойство в свой ход.');return;}
 if(id==='arcanist-bowstaff'&&config.spikependium?.staffAttackAction!==true) {
  const yes=await foundry.applications.api.DialogV2.confirm({window:{title:'Посох-лук арканиста'},rejectClose:false,
   content:'<p>Эта атака была частью действия Атака, и бонусное действие свободно? Потратить 1 заряд на Волшебную стрелу?</p>'});if(!yes)return;
 }
 return wrapped({...config,spikependium:{...config.spikependium,staffFollowup:attack.uuid,staffFollowupSignature:f.signature,staffAttackAction:id==='arcanist-bowstaff'}},...args);
}
export function prepareStaffFollowupUse(activity,config,_dialog,message) {
 const root=rootOf(activity),id=kind(root);if(!id)return;
 const attack=resolve(config.spikependium?.staffFollowup),f=eligible(attack,root);
 if(!f||f.signature!==config.spikependium.staffFollowupSignature||message.create===false||(id==='arcanist-bowstaff'&&config.spikependium.staffAttackAction!==true)||!protect(attack,message))return false;
 if(id==='cratering'&&!f.primary)ui.notifications.warn('У исходной атаки нет однозначной цели: её помеху и направление конуса определите вручную.');
 message.hasConsumption=true;
}
export function prepareStaffFollowupUpdates(activity,config,updates) {
 const root=rootOf(activity),id=kind(root);if(!id)return updates;
 if(root!==activity) {
  const receipt=prepared.get(root);
  if(!receipt)return false;
  if(receipt.bonusPath&&(updates.actor[receipt.bonusPath]??foundry.utils.getProperty(updates.actor,receipt.bonusPath))!==foundry.utils.getProperty(root.actor,receipt.bonusPath)+1)return false;
  return updates;
 }
 prepared.delete(root);
 const item=canonicalFocusItem(root.item),f=eligible(resolve(config.spikependium?.staffFollowup),root);
 if(!f||f.signature!==config.spikependium.staffFollowupSignature||(id==='arcanist-bowstaff'&&config.spikependium.staffAttackAction!==true)
  ||updates.item.find(i=>i._id===item.id)?.['system.uses.spent']!==item.system.uses.spent+1)return false;
 const receipt={...f,nonce:foundry.utils.randomID(),activity:root.uuid,active:1,attackAction:id==='arcanist-bowstaff',bonusPath:id==='arcanist-bowstaff'?bonusCounter(root)?.path??null:null};
 updates.actor[`flags.spikependium.staffFollowups.${receipt.nonce}`]=receipt;prepared.set(root,receipt);return updates;
}
export function recordStaffFollowupConsumption(activity,_config,message) {
 const root=rootOf(activity),r=prepared.get(root);prepared.delete(root);
 if(!r||foundry.utils.getProperty(root.actor,path(r.nonce))!==1)return;
 const deltas=((message.data.system??={}).deltas??={}).actor??=[];
 if(!deltas.some(d=>d.keyPath===path(r.nonce)))deltas.push({keyPath:path(r.nonce),delta:1});
 foundry.utils.setProperty(message,'data.flags.spikependium.staffFollowup',r.nonce);
}
export function paidStaffFollowup(card) {
 const usage=card?.type==='usage'?card:card?.getOriginatingMessage?.(),root=rootOf(usage?.getAssociatedActivity?.());
 const nonce=usage?.flags?.spikependium?.staffFollowup,r=root?.actor?.flags.spikependium?.staffFollowups?.[nonce];
 if(!kind(root)||!r||!root.actor.items.get(root.item.id)||!/^[A-Za-z0-9]{16}$/.test(nonce)||r.active!==1||r.nonce!==nonce||r.activity!==root.uuid||r.source!==root.item.uuid
  ||!same(r,frame(resolve(r.attack),canonicalFocusItem(root.item)))||!usage.author||!root.actor.testUserPermission(usage.author,'OWNER')
  ||!usage.system.deltas?.actor?.some(d=>d.keyPath===path(nonce)&&d.delta===1)||!usage.system.deltas.item?.[root.item.id]?.some(d=>d.keyPath==='system.uses.spent'&&d.delta===1)
  ||r.kind==='arcanist-bowstaff'&&(!r.attackAction||r.bonusPath&&!usage.system.deltas.actor.some(d=>d.keyPath===r.bonusPath&&d.delta===1)))return;
 return {receipt:r,root,usage};
}
function origin(config,message) {
 const id=config.event?.target?.closest('[data-message-id]')?.dataset.messageId??message?.data?.system?.origin;
 return typeof id==='string'?game.messages.get(id)??resolve(id):id;
}
export function guardStaffFollowupRoll(config,_dialog,message) {
 const card=origin(config,message),usage=card?.type==='usage'?card:card?.getOriginatingMessage?.();
 if(!kind(config.subject)&&!usage?.flags?.spikependium?.staffFollowup)return;
 const info=paidStaffFollowup(card);
 if(!info||rootOf(config.subject)?.uuid!==info.root.uuid){ui.notifications.warn('Свойство посоха требует действующего оплаченного применения.');return false;}
}
export function prepareCraterSave(config,_dialog,message) {
 if(config.ability!=='dex'||config.isConcentration||config.saveType==='concentration'||config.rolls?.some(r=>r.options?.isConcentration))return;
 const card=origin(config,message),usage=card?.type==='usage'?card:card?.getOriginatingMessage?.();
 const caster=usage?.getAssociatedActor?.()??usage?.getAssociatedActivity?.()?.actor;
 const saved=caster?.flags.spikependium?.staffFollowups?.[usage?.flags?.spikependium?.staffFollowup];
 if(kind(usage?.getAssociatedActivity?.())!=='cratering'&&saved?.kind!=='cratering')return;
 const info=paidStaffFollowup(usage);if(!info)return false;
 const r=info.receipt,actor=config.subject;if(actor?.uuid!==r.primary)return;
 const speaker=message.data?.speaker,explicit=speaker?.scene&&speaker.token?`Scene.${speaker.scene}.Token.${speaker.token}`:actor.token?.uuid;
 if(explicit&&explicit!==r.token)return;
 if(!explicit){const targets=dnd5e.utils.getSceneTargets(actor).map(t=>t.document??t);if(targets.length!==1||targets[0].uuid!==r.token){ui.notifications.warn('Не удалось однозначно определить токен исходной цели: выставьте помеху вручную.');return;}}
 for(const roll of config.rolls){const o=roll.options??={};o.advantage||=o.advantageMode===1;o.disadvantage=true;if(o.advantageMode!==undefined)o.advantageMode=o.advantage?0:-1;}
}
export function guardStaffFollowupDamage(actor,_amount,_updates,options) {
 const card=options.originatingMessage,usage=card?.type==='usage'?card:card?.getOriginatingMessage?.();if(!card||!kind(card.getAssociatedActivity?.())&&!usage?.flags?.spikependium?.staffFollowup)return;
 const info=paidStaffFollowup(card);
 if(!info||rootOf(card.getAssociatedActivity?.())?.uuid!==info.root.uuid){ui.notifications.warn('Это применение посоха отменено или исходная атака изменилась.');return false;}
}
export async function staffFollowupAttack(wrapped,...args) {
 const rolls=await wrapped(...args),item=canonicalFocusItem(this.item);if(!roots.has(focusKind(item))||!rolls?.length)return rolls;
 const attack=rolls.length===1?rolls[0].parent:undefined,property=[...item.system.activities.values()].find(a=>kind(a));
 if(!property||!eligible(attack,property)||offering.has(attack.uuid))return rolls;
 offering.add(attack.uuid);
 try {
  const bow=focusKind(item)==='arcanist-bowstaff',yes=await foundry.applications.api.DialogV2.confirm({window:{title:bow?'Посох-лук арканиста':'Кратерный боевой посох'},rejectClose:false,
   content:bow?'<p>Эта атака была частью действия Атака, и бонусное действие свободно? Потратить 1 заряд на Волшебную стрелу?</p>':'<p>Потратить 1 заряд и создать кратерный конус в сторону цели этой атаки?</p>'});
  if(yes)await property.use({spikependium:{staffFollowup:attack.uuid,staffAttackAction:bow}});
 } catch(error){console.error('Spikependium: свойство посоха после атаки',error);ui.notifications.warn('Атака сохранена. Применение свойства посоха завершилось ошибкой: проверьте карточку расхода перед повторением.');}
 finally{offering.delete(attack.uuid);}
 return rolls;
}
export function staffFollowupDeltaLabel(wrapped,...args) {
 const result=wrapped(...args);if(/^flags\.spikependium\.staffFollowups\.[A-Za-z0-9]{16}\.active$/.test(this.keyPath))result.label='Свойство посоха после атаки';return result;
}
