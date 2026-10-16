import { arcanaCast, arcanaEffectCast } from "./arcana-spells.mjs";
import { tokensDistance } from "./effects.mjs";
import { attackSignature } from "./attack-source.mjs";

const KEY="spell:au-enervation", captured=new WeakMap(), prepared=new WeakMap(), queues=new Map(), delivering=new Set();
const resolve=uuid=>uuid&&fromUuidSync(uuid,{strict:false});
const stage=a=>a?.item?.flags.spikependium?.key===KEY?(a.type==="save"&&!a.flags?.spikependium?.arcanaStage?"cast":a.type==="damage"&&a.flags?.spikependium?.arcanaStage==="enervation"?"drain":null):null;
const live=e=>e?.active&&!e.duration.expired&&!(Number.isFinite(e.duration.remaining)&&e.duration.remaining<=0);
const path=event=>`flags.spikependium.enervationUses.${event}.active`;
const actors=()=>new Map([...game.actors,...[...game.scenes].flatMap(s=>[...s.tokens].map(t=>t.actor))].filter(Boolean).map(a=>[a.uuid,a]));
const frame=()=>({combat:game.combat?.started?game.combat.id:null,round:game.combat?.round??null,turn:game.combat?.turn??null,time:game.time.worldTime});
function paid(origin,allowRefund=false) {
  const r=origin?.flags.spikependium?.enervationUse,a=origin?.getAssociatedActivity?.({scaled:true}),caster=resolve(r?.caster),record=caster?.flags.spikependium?.enervationUses?.[r?.event];
  if(origin?.type!=="usage"||!r||!a||!["cast","drain"].includes(r.stage)||!r.frame||!Number.isFinite(r.frame.time)
    ||!/^[A-Za-z0-9]{16}$/.test(r.event)||stage(a)!==r.stage||a.uuid!==r.activity||a.actor?.uuid!==r.caster
    ||!record||record.active!==1&&!(allowRefund&&record.active===0)||!origin.author||!caster.testUserPermission(origin.author,"OWNER")
    ||JSON.stringify(r)!==JSON.stringify(record.data?.[0])
    ||origin.system.targets?.length!==1||origin.system.targets[0].actor!==r.target||origin.system.targets[0].token!==r.targetToken
    ||!origin.system.deltas?.actor?.some(d=>d.keyPath===path(r.event)&&d.delta===1))return;
  return {r,a,caster,origin};
}
export const enervationCastPaid=origin=>paid(origin)?.r.stage==="cast";
function inRange(r) {
  const source=resolve(r.token),target=resolve(r.targetToken),distance=source&&target&&tokensDistance(source,target);
  return source?.actor?.uuid===r.caster&&target?.actor?.uuid===r.target&&source.parent===target.parent&&distance!=null&&distance<=60;
}
function saved(info) {
  const target=resolve(info.r.target),dc=arcanaCast(info.origin)?.receipt.dc;
  const card=info.origin.getAssociatedRolls("save").filter(m=>m.system.ability==="dex"&&m.getAssociatedActor()?.uuid===info.r.target
    &&m.getAssociatedToken()?.uuid===info.r.targetToken).at(-1),roll=card?.rolls[0];
  if(!target||!card?.author||!target.testUserPermission(card.author,"OWNER")||!(roll instanceof CONFIG.Dice.D20Roll)||!roll._evaluated||!Number.isFinite(dc)||roll.options.target!==dc)return;
  return card.system.forceSuccess||!roll.isFailure?"success":"failure";
}
function tether(info) {
  if(!info||info.r.stage!=="cast"||!inRange(info.r)||saved(info)!=="failure")return;
  const target=resolve(info.r.target);
  return target?.effects.find(e=>e.flags.spikependium?.arcanaSpell==="enervation"&&e.system.origin?.message===info.origin.uuid&&arcanaEffectCast(e));
}
function current(a) {
  for(const origin of [...game.messages].reverse()) {
    const info=paid(origin);
    if(info?.r.stage==="cast"&&info.caster.uuid===a.actor.uuid&&info.a.item.uuid===a.item.uuid&&tether(info))return info;
  }
}
function subsequent(info) {
  const now=frame(),r=info.r;
  if(now.combat) {
    const turn=game.combat.combatant;
    if(turn?.actor?.uuid!==r.caster||turn.token?.uuid!==r.token)return false;
    return now.combat===r.frame.combat?now.round>r.frame.round||now.round===r.frame.round&&now.turn>r.frame.turn:now.time>r.frame.time;
  }
  return now.time>r.frame.time;
}
const sameFrame=(a,b)=>a.combat===b.combat&&(a.combat?a.round===b.round&&a.turn===b.turn:a.time===b.time);
function eligible(a,r) {
  if(!a.actor.isOwner||!inRange(r)||a.getUsageToken?.()?.uuid!==r.token)return false;
  if(r.stage==="cast")return true;
  const root=paid(resolve(r.source));
  return root&&tether(root)&&root.r.caster===r.caster&&root.r.targetToken===r.targetToken&&root.a.item.uuid===a.item.uuid
    &&subsequent(root)&&sameFrame(frame(),r.frame)
    &&!Object.values(a.actor.flags.spikependium?.enervationUses??{}).some(v=>v.active===1&&v.data?.[0]?.stage==="drain"&&v.data[0].source===r.source&&sameFrame(v.data[0].frame,r.frame));
}
export function prepareEnervationDialog(a,config,dialog,message) {
  if(!stage(a))return;
  const Base=dialog.applicationClass;dialog.configure=true;message.hasConsumption=true;
  dialog.applicationClass=class extends Base {
    async _prepareConsumptionContext(context,options) {
      context=await super._prepareConsumptionContext(context,options);
      context.fields.push({name:"spikependium.enervationClear",value:this.config.spikependium?.enervationClear??false,
        field:new foundry.data.fields.BooleanField({label:stage(a)==="cast"?"Цель видна и не имеет Полного укрытия":"Наступил мой последующий ход; цель не получила Полного укрытия"}),input:context.inputs.createCheckboxInput});
      context.hasConsumption=true;return context;
    }
  };
}
export function captureEnervation(a,config,message) {
  captured.delete(a);const mode=stage(a);if(!mode)return;
  const targets=[...game.user.targets].map(t=>t.document??t),token=a.getUsageToken?.(),target=targets[0],root=mode==="drain"?current(a):null;
  const r={stage:mode,caster:a.actor.uuid,activity:a.uuid,token:token?.uuid,target:target?.actor?.uuid,targetToken:target?.uuid,frame:frame(),source:root?.origin.uuid??null};
  const expected=message.data?.system?.targets;
  if(message.create===false||config.spikependium?.enervationClear!==true||targets.length!==1||!target.actor?.system.isCreature
    ||!game.users.activeGM&&!target.actor.isOwner||!eligible(a,r)
    ||expected&&(expected.length!==1||expected[0].actor!==r.target||expected[0].token!==r.targetToken)) {
    ui.notifications.warn("Обессиливание: нужны один допустимый токен в 60 футах, подтверждение условий и Мастер либо права на цель. Повторный урон доступен только по прежней цели в последующий свой ход.");return false;
  }
  captured.set(a,r);
  const origin=root?.origin;
  if(token.hidden||target.hidden||origin?.blind||origin?.whisper?.length) {
    message.data??={};message.data.whisper=origin?.whisper?.length?[...origin.whisper]:game.users.filter(u=>u.isGM).map(u=>u.id);
    message.data.blind=!!origin?.blind||!!token.hidden||!!target.hidden;
  }
}
export function prepareEnervationUpdates(a,_config,updates) {
  prepared.delete(a);if(!stage(a))return updates;
  const r=captured.get(a),targets=[...game.user.targets].map(t=>t.document??t);
  if(!r||!sameFrame(frame(),r.frame)||!eligible(a,r)||targets.length!==1||targets[0].uuid!==r.targetToken)return false;
  const receipt={...r,event:foundry.utils.randomID()};
  // Native deltas traverse numeric object fields; keep metadata in an array so refund changes only active.
  updates.actor[`flags.spikependium.enervationUses.${receipt.event}`]={data:[receipt],active:1};prepared.set(a,receipt);return updates;
}
export function recordEnervationConsumption(a,_config,message) {
  const r=prepared.get(a);if(!r||foundry.utils.getProperty(a.actor,path(r.event))!==1)return;
  const deltas=((message.data.system??={}).deltas??={}).actor??=[];
  if(!deltas.some(d=>d.keyPath===path(r.event)))deltas.push({keyPath:path(r.event),delta:1});
}
export function recordEnervationUsage(a,message) {
  const r=prepared.get(a);prepared.delete(a);if(!r||foundry.utils.getProperty(a.actor,path(r.event))!==1)return;
  foundry.utils.setProperty(message,"data.flags.spikependium.enervationUse",r);
  foundry.utils.setProperty(message,"data.flags.dnd5e.item.data",a.item.toObject());
}
export async function enervationDamage(wrapped,config={},dialog={},message={}) {
  if(!stage(this))return wrapped(config,dialog,message);
  const id=config.event?.target?.closest("[data-message-id]")?.dataset.messageId,value=message.data?.system?.origin;
  const origin=id?game.messages.get(id):typeof value==="string"?game.messages.get(value):value,info=paid(origin);
  if(!info||info.a.uuid!==this.uuid||!this.actor.isOwner||info.r.stage==="drain"&&(!tether(paid(resolve(info.r.source)))||!sameFrame(frame(),info.r.frame))) {
    ui.notifications.warn("Бросайте урон из действительной оплаченной карточки Обессиливания.");return;
  }
  message=foundry.utils.deepClone(message);
  foundry.utils.setProperty(message,"data.flags.spikependium.enervationDamage",{usage:origin.uuid,event:info.r.event});
  foundry.utils.setProperty(message,"data.system.origin",origin.id);
  foundry.utils.setProperty(message,"data.system.targets",structuredClone(origin.system.targets));
  if(origin.whisper.length)foundry.utils.setProperty(message,"data.whisper",[...origin.whisper]);
  if(origin.blind){foundry.utils.setProperty(message,"data.blind",true);message.rollMode="blind";}
  else if(origin.whisper.length)message.rollMode="gm";
  return wrapped(config,dialog,message);
}
function damageInfo(card) {
  const r=card?.flags.spikependium?.enervationDamage,info=paid(resolve(r?.usage));
  if(card?.type!=="damage"||!info||r.event!==info.r.event||card.getAssociatedActivity()?.uuid!==info.a.uuid
    ||!card.author||!info.caster.testUserPermission(card.author,"OWNER")||!card.rolls.length
    ||!card.rolls.every(r=>r instanceof CONFIG.Dice.DamageRoll&&r._evaluated&&Number.isFinite(r.total)&&r.options.type==="necrotic"))return;
  return {...info,card};
}
export function guardEnervationDamage(actor,amount,updates,options) {
  const heal=options.spikependiumEnervationHeal;
  if(heal) {
    const target=resolve(heal.target),r=target?.flags.spikependium?.enervationDrains?.[heal.event],info=damageInfo(resolve(r?.damage));
    if(!r?.pending||!info||info.caster.uuid!==actor.uuid||info.r.target!==target.uuid||info.r.event!==heal.event||r.signature!==attackSignature(info.card)
      ||heal.amount!==r.heal||actor.flags.spikependium?.enervationHeals?.[heal.event])return false;
    updates[`flags.spikependium.enervationHeals.${heal.event}`]=1;return;
  }
  const card=options.originatingMessage;
  if(card?.getAssociatedActivity?.()?.item?.flags.spikependium?.key!==KEY&&!card?.flags.spikependium?.enervationDamage)return;
  const info=damageInfo(card),root=info?.r.stage==="cast"?info:paid(resolve(info?.r.source));
  if(!info||actor.uuid!==info.r.target||!root||!saved(root)||!Number.isFinite(amount)||amount<0
    ||info.r.stage==="drain"&&(!tether(root)||!sameFrame(frame(),info.r.frame))||actor.flags.spikependium?.enervationDrains?.[info.r.event]) {
    ui.notifications.warn("Урон Обессиливания требует исходную карточку, её спасбросок и прежнюю цель; повторное применение одной активации недоступно.");return false;
  }
  updates[`flags.spikependium.enervationDrains.${info.r.event}`]={caster:info.caster.uuid,damage:card.uuid,signature:attackSignature(card),heal:Math.floor(amount/2),pending:amount>=2?1:0};
}
export async function serializeEnervationDamage(wrapped,damages,options={}) {
  if(!options.spikependiumEnervationHeal&&!options.originatingMessage?.flags.spikependium?.enervationDamage&&!options.originatingMessage?.flags.spikependium?.lanternRoll&&!options.originatingMessage?.flags.spikependium?.distanceDamage&&!options.originatingMessage?.flags.spikependium?.dragonDamage)return wrapped(damages,options);
  const previous=queues.get(this.uuid)??Promise.resolve(),next=previous.catch(()=>{}).then(()=>wrapped(damages,options));queues.set(this.uuid,next);
  try{return await next;}finally{if(queues.get(this.uuid)===next)queues.delete(this.uuid);}
}
export async function resumeEnervationHealing() {
  if(game.users.activeGM&&!game.user.isActiveGM)return;
  for(const target of actors().values())for(const[event,r]of Object.entries(target.flags.spikependium?.enervationDrains??{})) {
    const lock=`${target.uuid}:${event}`;if(!r.pending||!target.isOwner||delivering.has(lock))continue;
    const info=damageInfo(resolve(r.damage));
    if(!info||info.r.event!==event||info.r.target!==target.uuid||!info.caster.isOwner||info.caster.uuid!==r.caster||r.signature!==attackSignature(info.card)||!(r.heal>0))continue;
    if(!game.users.activeGM&&info.origin.author.id!==game.user.id)continue;
    delivering.add(lock);
    try {
      if(!info.caster.flags.spikependium?.enervationHeals?.[event]&&!info.caster.statuses.has("dead"))
        await info.caster.applyDamage([{type:"healing",value:r.heal}],{originatingMessage:info.card,spikependiumEnervationHeal:{target:target.uuid,event,amount:r.heal}});
      if(!info.caster.flags.spikependium?.enervationHeals?.[event])ui.notifications.warn("Лечение Обессиливания остановлено правилом или другим модулем. При необходимости разрешите его вручную.");
      await target.update({[`flags.spikependium.enervationDrains.${event}.pending`]:0});
    }finally{delivering.delete(lock);}
  }
}
export async function cleanEnervation() {
  if(game.users.activeGM&&!game.user.isActiveGM)return;
  for(const origin of game.messages) {
    const info=paid(origin,true),r=info?.r;if(r?.stage!=="cast")continue;
    if(!game.users.activeGM&&origin.author?.id!==game.user.id)continue;
    const caster=resolve(r.caster),concentration=caster?.effects.get(origin.system.concentration);
    if(!caster?.isOwner||!live(concentration)||concentration.system.type!=="concentrating")continue;
    // shortcut: walls and visibility do not prove full cover; the caster ends concentration when the table confirms it.
    if(!enervationCastPaid(origin)||!inRange(r)||game.time.worldTime>=r.frame.time+60)await concentration.delete();
  }
}
export function enervationDeltaLabel(wrapped,...args) {
  const result=wrapped(...args);if(/^flags\.spikependium\.enervationUses\.[A-Za-z0-9]{16}\.active$/.test(this.keyPath))result.label="Оплаченная активация Обессиливания";return result;
}

