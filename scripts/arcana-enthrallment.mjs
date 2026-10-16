import {arcanaCast,arcanaEffectCast,syncArcanaCast,arcanaSpellError} from "./arcana-spells.mjs";
import {tokensDistance} from "./effects.mjs";

const KEY="spell:au-enthrallment",captured=new WeakMap(),prepared=new WeakMap(),working=new Set();
// shortcut: movement and opportunity attacks need table rulings; automate when scene data identifies approved routes and hazards.
const resolve=uuid=>uuid&&fromUuidSync(uuid,{strict:false});
const stage=a=>a?.item?.flags.spikependium?.key===KEY&&a.type==="save"?(a.flags?.spikependium?.arcanaStage==="enthrallment-target"?"select":!a.flags?.spikependium?.arcanaStage?"cast":null):null;
const live=e=>e?.active&&!e.duration.expired&&!(Number.isFinite(e.duration.remaining)&&e.duration.remaining<=0);
const path=event=>`flags.spikependium.enthrallmentUses.${event}.active`;
const frame=()=>({combat:game.combat?.started?game.combat.id:null,round:game.combat?.round??null,turn:game.combat?.turn??null,time:game.time.worldTime});
const sameFrame=(a,b)=>a.combat===b.combat&&(a.combat?a.round===b.round&&a.turn===b.turn:a.time===b.time);
const actorKey=a=>a.replaceAll(".","_");
const authority=origin=>game.users.activeGM?game.user.isActiveGM:origin.author?.id===game.user.id;
function paid(origin,allowRefund=false) {
  const r=origin?.flags.spikependium?.enthrallmentUse,a=origin?.getAssociatedActivity?.({scaled:true}),caster=resolve(r?.caster),record=caster?.flags.spikependium?.enthrallmentUses?.[r?.event];
  if(origin?.type!=="usage"||!r||!a||!["cast","select"].includes(r.stage)||!r.frame||!Number.isFinite(r.frame.time)||!/^[A-Za-z0-9]{16}$/.test(r.event)
    ||stage(a)!==r.stage||a.uuid!==r.activity||a.actor?.uuid!==r.caster||!record||record.active!==1&&!(allowRefund&&record.active===0)
    ||!origin.author||!caster.testUserPermission(origin.author,"OWNER")||JSON.stringify(r)!==JSON.stringify(record.data?.[0])
    ||origin.system.targets?.length!==1||origin.system.targets[0].actor!==r.target||origin.system.targets[0].token!==r.targetToken
    ||!origin.system.deltas?.actor?.some(d=>d.keyPath===path(r.event)&&d.delta===1))return;
  return {r,a,caster,origin};
}
function source(origin) {
  const info=paid(origin);if(!info)return;
  const root=info.r.stage==="cast"?info:paid(resolve(info.r.source));
  if(!root||root.r.stage!=="cast"||root.r.caster!==info.r.caster||root.a.item.uuid!==info.a.item.uuid
    ||info.r.stage==="select"&&origin.system.concentration!==root.origin.system.concentration)return;
  return {...info,root};
}
export const enthrallmentCastPaid=origin=>!!source(origin);
export function enthrallmentImmune(origin) {
  const info=source(origin);
  return !!info?.caster.flags.spikependium?.enthrallmentSaves?.[info.root.r.event]?.[actorKey(info.r.target)];
}
function active(root) {
  const concentration=root?.caster.effects.get(root.origin.system.concentration);
  return live(concentration)&&game.time.worldTime<root.r.frame.time+60;
}
function current(a) {
  for(const origin of [...game.messages].reverse()) {
    const info=paid(origin);
    if(info?.r.stage==="cast"&&info.caster.uuid===a.actor.uuid&&info.a.item.uuid===a.item.uuid&&active(info))return info;
  }
}
function subsequent(root) {
  const now=frame(),r=root.r;
  if(!now.combat)return now.time>r.frame.time;
  const turn=game.combat.combatant;
  return turn?.actor?.uuid===r.caster&&turn.token?.uuid===r.token&&(now.combat===r.frame.combat
    ?now.round>r.frame.round||now.round===r.frame.round&&now.turn>r.frame.turn:now.time>r.frame.time);
}
function eligible(a,r) {
  const token=resolve(r.token),target=resolve(r.targetToken),distance=token&&target&&tokensDistance(token,target);
  if(!a.actor.isOwner||a.getUsageToken?.()?.uuid!==r.token||token?.actor?.uuid!==r.caster||target?.actor?.uuid!==r.target
    ||!target.actor.system.isCreature||distance==null||distance>60)return false;
  if(r.stage==="cast")return true;
  const root=paid(resolve(r.source));
  return root?.r.stage==="cast"&&active(root)&&root.caster.uuid===r.caster&&root.r.token===r.token&&root.a.item.uuid===a.item.uuid&&subsequent(root)
    &&!root.caster.flags.spikependium?.enthrallmentSaves?.[root.r.event]?.[actorKey(r.target)]
    &&!Object.values(a.actor.flags.spikependium?.enthrallmentUses??{}).some(v=>v.active===1&&v.data?.[0]?.stage==="select"
      &&v.data[0].source===r.source&&sameFrame(v.data[0].frame,r.frame))
    &&!target.actor.effects.some(e=>e.flags.spikependium?.arcanaSpell==="enthrallment"&&arcanaEffectCast(e)
      &&source(resolve(e.system.origin?.message))?.root.origin.uuid===root.origin.uuid);
}
export function prepareEnthrallment(a,config,dialog,message) {
  if(a?.item?.flags.spikependium?.key===KEY&&a.flags?.spikependium?.arcanaStage==="enthrallment-damage") {
    ui.notifications.warn("Урон Заворожения разрешается в конце хода цели автоматически; для ручной игры используйте число в описании.");return false;
  }
  if(!stage(a))return;
  const Base=dialog.applicationClass;dialog.configure=true;message.hasConsumption=true;
  dialog.applicationClass=class extends Base {
    async _prepareConsumptionContext(context,options) {
      context=await super._prepareConsumptionContext(context,options);
      context.fields.push({name:"spikependium.enthrallmentVisible",value:this.config.spikependium?.enthrallmentVisible??false,
        field:new foundry.data.fields.BooleanField({label:stage(a)==="cast"?"Я вижу выбранное существо":"Я вижу новую цель; наступил мой последующий ход"}),input:context.inputs.createCheckboxInput});
      context.hasConsumption=true;return context;
    }
  };
}
export function captureEnthrallment(a,config,message) {
  captured.delete(a);const mode=stage(a);if(!mode)return;
  const targets=[...game.user.targets].map(t=>t.document??t),token=a.getUsageToken?.(),target=targets[0],root=mode==="select"?current(a):null;
  const r={stage:mode,caster:a.actor.uuid,activity:a.uuid,token:token?.uuid,target:target?.actor?.uuid,targetToken:target?.uuid,frame:frame(),source:root?.origin.uuid??null,level:mode==="cast"?a.item.system.level:root?.r.level};
  const expected=message.data?.system?.targets;
  if(message.create===false||config.spikependium?.enthrallmentVisible!==true||targets.length!==1||!Number.isInteger(r.level)||r.level<7||r.level>9
    ||!eligible(a,r)||!game.users.activeGM&&!target.actor.isOwner
    ||expected&&(expected.length!==1||expected[0].actor!==r.target||expected[0].token!==r.targetToken)) {
    ui.notifications.warn("Заворожение: выберите одно видимое существо в 60 футах. Для новой цели нужны последующий свой ход, активная Концентрация и отсутствие успешного спасброска против этого сотворения.");return false;
  }
  captured.set(a,r);
  if(token.hidden||target.hidden||root?.origin.blind||root?.origin.whisper.length) {
    message.data??={};message.data.whisper=root?.origin.whisper.length?[...root.origin.whisper]:game.users.filter(u=>u.isGM).map(u=>u.id);
    message.data.blind=!!token.hidden||!!target.hidden||!!root?.origin.blind;
  }
}
export function prepareEnthrallmentUpdates(a,_config,updates) {
  prepared.delete(a);if(!stage(a))return updates;
  const r=captured.get(a),targets=[...game.user.targets].map(t=>t.document??t);
  if(!r||!sameFrame(frame(),r.frame)||!eligible(a,r)||targets.length!==1||targets[0].uuid!==r.targetToken)return false;
  const receipt={...r,event:foundry.utils.randomID()};
  updates.actor[`flags.spikependium.enthrallmentUses.${receipt.event}`]={active:1,data:[receipt]};prepared.set(a,receipt);return updates;
}
export function recordEnthrallmentConsumption(a,_config,message) {
  const r=prepared.get(a);if(!r||foundry.utils.getProperty(a.actor,path(r.event))!==1)return;
  const deltas=((message.data.system??={}).deltas??={}).actor??=[];
  if(!deltas.some(d=>d.keyPath===path(r.event)))deltas.push({keyPath:path(r.event),delta:1});
}
export function recordEnthrallmentUsage(a,message) {
  const r=prepared.get(a);prepared.delete(a);if(!r||foundry.utils.getProperty(a.actor,path(r.event))!==1)return;
  foundry.utils.setProperty(message,"data.flags.spikependium.enthrallmentUse",r);
  if(r.stage==="select") {
    foundry.utils.setProperty(message,"data.system.concentration",resolve(r.source)?.system.concentration);
    foundry.utils.setProperty(message,"data.system.scaling",r.level-Number(a.item._source?.system?.level??a.item.system.level));
  }
  foundry.utils.setProperty(message,"data.flags.dnd5e.item.data",a.item.toObject());
}
export async function syncEnthrallmentSave(message) {
  if(message?.type!=="save")return;
  const origin=message.getOriginatingMessage(),info=source(origin),target=resolve(info?.r.target),dc=arcanaCast(origin)?.receipt.dc,roll=message.rolls[0];
  if(!info||!target||!authority(origin)||!info.caster.isOwner||!message.author||!target.testUserPermission(message.author,"OWNER")
    ||message.system.ability!=="cha"||message.getAssociatedActor()?.uuid!==target.uuid||message.getAssociatedToken()?.uuid!==info.r.targetToken
    ||!(roll instanceof CONFIG.Dice.D20Roll)||!roll._evaluated||!Number.isFinite(dc)||roll.options.target!==dc||!message.system.forceSuccess&&roll.isFailure)return;
  if(!enthrallmentImmune(origin))await info.caster.update({[`flags.spikependium.enthrallmentSaves.${info.root.r.event}.${actorKey(target.uuid)}`]:true});
  await syncArcanaCast(origin);
}
function tickInfo(effect,request,initial=false) {
  const spell=arcanaEffectCast(effect),info=spell?.receipt.kind==="enthrallment"&&source(spell.origin);
  const saved=effect?.flags.spikependium?.enthrallmentTick;
  if(!info||!request||!initial&&!["event","combat","round","turn","origin","token"].every(k=>request[k]===saved?.[k])||request.origin!==spell.origin.uuid
    ||request.token!==info.r.targetToken||!active(info.root)||enthrallmentImmune(spell.origin))return;
  const token=resolve(info.r.targetToken),caster=resolve(info.root.r.token),distance=token&&caster&&tokensDistance(token,caster);
  if(token?.actor?.uuid!==spell.actor.uuid||caster?.actor?.uuid!==spell.caster.uuid||distance==null||distance>5)return;
  return {...spell,root:info.root};
}
function currentTick(r) {
  const combat=resolve(r.combat);
  return combat?.started&&combat.previous?.round===r.round&&combat.previous?.turn===r.turn;
}
function tickCard(effect,r) {
  return game.messages.find(m=>m.type==="damage"&&m.author?.isGM&&m.flags.spikependium?.enthrallmentTick?.effect===effect.uuid
    &&m.flags.spikependium.enthrallmentTick.event===r.event&&m.flags.spikependium.enthrallmentTick.origin===r.origin);
}
async function applyTick(effect,request) {
  if(!game.user.isActiveGM||working.has(effect.uuid))return;
  const info=tickInfo(effect,request);if(!info||!info.actor.isOwner||info.actor.flags.spikependium?.enthrallmentTicks?.[request.event])return;
  working.add(effect.uuid);
  try {
    if(!currentTick(request)) {
      await effect.setFlag("spikependium","enthrallmentTick",{...request,pending:false,manual:true});
      ui.notifications.warn("Не завершён урон Заворожения из прошлого конца хода. Мастер должен разрешить его вручную.");return;
    }
    let card=tickCard(effect,request);
    if(!card) {
      if(request.started) {
        if(!request.warned) {
          await effect.setFlag("spikependium","enthrallmentTick",{...request,warned:true});
          ui.notifications.warn("Бросок урона Заворожения был начат, но не сохранён. Восстановите исход вручную; автоматического переброска нет.");
        }
        return;
      }
      request={...request,started:true};await effect.setFlag("spikependium","enthrallmentTick",request);
      const activity=[...info.activity.item.system.activities].find(a=>a.type==="damage"&&a.flags.spikependium?.arcanaStage==="enthrallment-damage"),token=resolve(request.token);
      if(!activity)throw Error("Не найдено действие урона Заворожения");
      const blind=!!info.origin.blind||!!token.hidden||!!resolve(info.root.r.token)?.hidden;
      await activity.rollDamage({scaling:info.root.r.level-7,isCritical:false},{configure:false},{create:true,rollMode:blind?"blind":info.origin.whisper.length?"gm":"public",data:{
        ...(info.origin.whisper.length?{whisper:[...info.origin.whisper],blind}:blind?{whisper:game.users.filter(u=>u.isGM).map(u=>u.id),blind}:{}),
        speaker:ChatMessage.getSpeaker({actor:info.caster}),system:{origin:info.origin.id,targets:[{actor:info.actor.uuid,token:token.uuid,name:token.name,img:token.texture.src}]},
        flags:{spikependium:{enthrallmentTick:{...request,effect:effect.uuid}}}}});
      card=tickCard(effect,request);
    }
    if(!card||!tickInfo(effect,request)||!currentTick(request)||!game.user.isActiveGM)return;
    if(card.rolls.length!==1||!(card.rolls[0] instanceof CONFIG.Dice.DamageRoll)||!card.rolls[0]._evaluated||card.rolls[0].options.type!=="psychic"||!Number.isFinite(card.rolls[0].total)||card.rolls[0].total<0)return;
    await info.actor.applyDamage([{type:"psychic",value:card.rolls[0].total}],{originatingMessage:card});
    if(info.actor.flags.spikependium?.enthrallmentTicks?.[request.event])await effect.setFlag("spikependium","enthrallmentTick",{...request,pending:false});
  }finally{working.delete(effect.uuid);}
}
export function guardEnthrallmentDamage(actor,_amount,updates,options) {
  const card=options.originatingMessage,r=card?.flags.spikependium?.enthrallmentTick;
  if(!r&&!(card?.getAssociatedActivity?.()?.item?.flags.spikependium?.key===KEY&&card.getAssociatedActivity().type==="damage"))return;
  const effect=resolve(r?.effect),info=effect&&tickInfo(effect,r),activity=card?.getAssociatedActivity?.();
  if(!info||!game.user.isActiveGM||!card.author?.isGM||card.type!=="damage"||!currentTick(r)||actor.uuid!==info.actor.uuid||!Number.isFinite(_amount)||_amount<0
    ||actor.flags.spikependium?.enthrallmentTicks?.[r.event]||card.getOriginatingMessage()?.uuid!==info.origin.uuid
    ||activity?.item.uuid!==info.activity.item.uuid||activity?.flags.spikependium?.arcanaStage!=="enthrallment-damage"
    ||card.rolls.length!==1||!(card.rolls[0] instanceof CONFIG.Dice.DamageRoll)||!card.rolls[0]._evaluated||card.rolls[0].options.type!=="psychic")return false;
  updates[`flags.spikependium.enthrallmentTicks.${r.event}`]=1;
}
export async function enthrallmentEndTurn(wrapped,combatant) {
  const result=await wrapped(combatant);
  if(!game.user.isActiveGM||!combatant?.actor||!Number.isInteger(this.previous?.round)||this.previous.round<1)return result;
  for(const effect of [...combatant.actor.effects]) {
    if(effect.flags.spikependium?.arcanaSpell!=="enthrallment")continue;
    const info=source(resolve(effect.system.origin?.message));if(!info||combatant.token?.uuid!==info.r.targetToken)continue;
    const old=effect.flags.spikependium?.enthrallmentTick;
    if(old?.combat===this.uuid&&old.round===this.previous.round&&old.turn===this.previous.turn)continue;
    const request={event:foundry.utils.randomID(),combat:this.uuid,round:this.previous.round,turn:this.previous.turn,origin:info.origin.uuid,token:combatant.token.uuid,pending:true};
    if(!tickInfo(effect,request,true))continue;
    try {await effect.setFlag("spikependium","enthrallmentTick",request);await applyTick(effect,request);}
    catch(error){arcanaSpellError(error);}
  }
  return result;
}
export async function resumeEnthrallment() {
  if(!game.user.isActiveGM)return;
  const actors=new Map([...game.actors,...[...game.scenes].flatMap(s=>[...s.tokens].map(t=>t.actor))].filter(Boolean).map(a=>[a.uuid,a]));
  for(const actor of actors.values())for(const effect of [...actor.effects]) {
    if(effect.flags.spikependium?.arcanaSpell!=="enthrallment")continue;
    const r=effect.flags.spikependium.enthrallmentTick;
    if(r?.pending) {
      if(actor.flags.spikependium?.enthrallmentTicks?.[r.event])await effect.setFlag("spikependium","enthrallmentTick",{...r,pending:false});
      else await applyTick(effect,r);
    }
  }
  for(const origin of game.messages) {
    const info=paid(origin,true);if(info?.r.stage!=="cast"||!info.caster.isOwner)continue;
    const concentration=info.caster.effects.get(origin.system.concentration);
    if(live(concentration)&&concentration.system.type==="concentrating"&&(!paid(origin)||game.time.worldTime>=info.r.frame.time+60))await concentration.delete();
  }
}
export function enthrallmentDeltaLabel(wrapped,...args) {
  const result=wrapped(...args);if(/^flags\.spikependium\.enthrallmentUses\.[A-Za-z0-9]{16}\.active$/.test(this.keyPath))result.label="Оплаченное действие Заворожения";return result;
}
