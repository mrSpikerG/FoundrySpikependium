import {arcanaEffectCast,arcanaSpellError} from "./arcana-spells.mjs";
import {tokensDistance,incapacitated} from "./effects.mjs";
import {radiantLightUpdate} from "./mechanics.mjs";

const KEY="spell:au-spirit-lantern",captured=new WeakMap(),prepared=new WeakMap(),recounting=new WeakMap(),using=new Set(),consuming=new Set(),syncing=new Map(),guarding=new Set();
const resolve=uuid=>uuid&&fromUuidSync(uuid,{strict:false});
const mode=a=>a?.item?.flags.spikependium?.key===KEY?a.flags?.spikependium?.lanternStage:null;
const stages=new Set(["cast","collect","drain","restore","protect","end"]),spentStages=new Set(["drain","restore","protect"]);
const actors=()=>new Map([...game.actors,...[...game.scenes].flatMap(s=>[...s.tokens].map(t=>t.actor))].filter(Boolean).map(a=>[a.uuid,a]));
const live=e=>e?.active&&!e.duration.expired&&!(Number.isFinite(e.duration.remaining)&&e.duration.remaining<=0);
const path=event=>`flags.spikependium.lanternUses.${event}.active`;
const authority=actor=>game.users.activeGM?game.user.isActiveGM:game.users.filter(u=>u.active&&actor.testUserPermission(u,"OWNER")).sort((a,b)=>a.id.localeCompare(b.id))[0]?.id===game.user.id;
const claimedPath=(root,death)=>`flags.spikependium.lanternClaims.${root}.${death}`;
function paid(origin,allowRefund=false) {
  const r=origin?.flags.spikependium?.lanternUse,a=origin?.getAssociatedActivity?.({scaled:true}),caster=resolve(r?.caster),record=caster?.flags.spikependium?.lanternUses?.[r?.event];
  if(origin?.type!=="usage"||!r||!a||!stages.has(r.stage)||!/^[A-Za-z0-9]{16}$/.test(r.event)||mode(a)!==r.stage||a.uuid!==r.activity||a.actor?.uuid!==r.caster
    ||!Number.isFinite(r.time)||!record||record.active!==1&&!(allowRefund&&record.active===0)||!origin.author||!caster.testUserPermission(origin.author,"OWNER")
    ||JSON.stringify(record.data?.[0])!==JSON.stringify(r)||!origin.system.deltas?.actor?.some(d=>d.keyPath===path(r.event)&&d.delta===1))return;
  if(!["cast","end"].includes(r.stage)&&(origin.system.targets?.length!==1||origin.system.targets[0].actor!==r.target||origin.system.targets[0].token!==r.targetToken))return;
  return {r,a,caster,origin,record};
}
function source(origin) {
  const info=paid(origin);if(!info)return;
  const root=info.r.stage==="cast"?info:paid(resolve(info.r.source));
  if(root?.r.stage!=="cast"||root.caster.uuid!==info.caster.uuid||root.a.item.uuid!==info.a.item.uuid)return;
  return {...info,root};
}
function rootFor(actor,allowRefund=false) {
  const key=actor.flags.spikependium?.lanternCurrent;if(typeof key!=="string"||!/^lantern:[A-Za-z0-9]{16}$/.test(key))return;
  const event=key.slice(8);
  const origin=game.messages.find(m=>m.flags.spikependium?.lanternUse?.event===event&&m.flags.spikependium.lanternUse.stage==="cast");
  return paid(origin,allowRefund);
}
export function lanternCastPaid(origin) {
  const info=paid(origin);
  return info?.r.stage==="cast"&&info.caster.flags.spikependium?.lanternCurrent===`lantern:${info.r.event}`&&info.record.ended!==1;
}
function ongoing(actor) {
  const info=rootFor(actor);
  if(!info||info.record.ended===1||game.time.worldTime>=info.r.time+600)return;
  const effect=actor.effects.find(e=>e.flags.spikependium?.arcanaSpell==="spirit-lantern"&&e.system.origin?.message===info.origin.uuid&&arcanaEffectCast(e));
  return effect?info:undefined;
}
const capacity=info=>Math.max(0,Math.trunc(Number(info.a.getRollData().mod)||0));
function deathCandidate(root,token,r) {
  if(!r||!/^[A-Za-z0-9]{16}$/.test(r.event)||!Number.isFinite(r.time)||!Array.isArray(r.candidates))return;
  return r.candidates.find(c=>c?.root===root.r.event&&c.origin===root.origin.uuid&&c.sourceToken===root.r.token&&c.victimToken===token.uuid
    &&Number.isInteger(c.free)&&c.free>0&&Number.isInteger(c.claims)&&c.claims>=0&&Number.isInteger(c.spends)&&c.spends>=0);
}
function deathFor(root,token) {
  return token?.actor?.effects.find(e=>live(e)&&e.statuses.has("dead")&&deathCandidate(root,token,e.flags.spikependium?.lanternDeath));
}
export function recordLanternDeath(effect,changes={}) {
  const actor=effect.parent;if(actor?.documentName!=="Actor")return;
  const existing=actor.effects.get(effect.id),statuses=new Set(changes.statuses??effect.statuses);
  if((changes.disabled??effect.disabled)||!statuses.has("dead")||existing&&live(existing)&&existing.statuses.has("dead")
    ||actor.effects.some(e=>e!==existing&&live(e)&&e.statuses.has("dead")))return;
  const tokens=[...game.scenes].flatMap(s=>[...s.tokens]).filter(t=>t.actor?.uuid===actor.uuid),candidates=[];
  for(const caster of actors().values()) {
    const root=ongoing(caster);if(!root)continue;
    const token=resolve(root.r.token);if(token?.actor?.uuid!==caster.uuid)continue;
    for(const victim of tokens) {
      const distance=tokensDistance(token,victim);
      const free=capacity(root)-root.a.item.system.uses.value;
      if(distance!=null&&distance<=60&&free>0)candidates.push({root:root.r.event,origin:root.origin.uuid,sourceToken:token.uuid,victimToken:victim.uuid,
        free,claims:root.record.claims??0,spends:root.record.spends??0});
    }
  }
  if(candidates.length) {
    const receipt={event:foundry.utils.randomID(),time:game.time.worldTime,candidates};
    if(existing)changes["flags.spikependium.lanternDeath"]=receipt;
    else effect.updateSource({"flags.spikependium.lanternDeath":receipt});
  }
}
export function prepareLanternDialog(a,config,dialog,message) {
  const stage=mode(a);
  if(stage==="cast"&&a.item.flags.spikependium?.lanternRetained) {ui.notifications.warn("Эта временная копия хранит уже призванный фонарь. Для нового сотворения нужно известное заклинание или новый источник.");return false;}
  if(!stages.has(stage)||stage==="cast"||stage==="end")return;
  const Base=dialog.applicationClass;dialog.configure=true;message.hasConsumption=true;
  dialog.applicationClass=class extends Base {
    async _prepareConsumptionContext(context,options) {
      context=await super._prepareConsumptionContext(context,options);
      context.fields.push({name:"spikependium.lanternConfirmed",value:this.config.spikependium?.lanternConfirmed??false,
        field:new foundry.data.fields.BooleanField({label:stage==="collect"?"Это был враг, погибший именно в Тусклом свете моего фонаря":"Я вижу выбранную цель в пределах 60 футов"}),input:context.inputs.createCheckboxInput});
      context.hasConsumption=true;return context;
    }
  };
}
function eligible(a,r) {
  const token=resolve(r.token);if(!a.actor.isOwner||a.actor.items.get(a.item.id)?.uuid!==a.item.uuid||token?.actor?.uuid!==r.caster||a.getUsageToken?.()?.uuid!==r.token)return false;
  if(r.stage==="cast")return !a.item.flags.spikependium?.lanternRetained;
  const root=ongoing(a.actor);if(!root||root.origin.uuid!==r.source||root.r.token!==r.token||root.a.item.uuid!==a.item.uuid)return false;
  if(r.stage==="end")return true;
  const target=resolve(r.targetToken);if(target?.actor?.uuid!==r.target||!target.actor.system.isCreature)return false;
  if(r.stage==="collect") {
    const death=deathFor(root,target),receipt=death?.flags.spikependium?.lanternDeath;
    const candidate=deathCandidate(root,target,receipt);
    return death?.uuid===r.death&&receipt?.event===r.deathEvent&&receipt.time>=root.r.time&&receipt.time<=game.time.worldTime
      &&candidate?.spends===(root.record.spends??0)&&(root.record.claims??0)-candidate.claims<candidate.free
      &&!foundry.utils.getProperty(a.actor,claimedPath(root.r.event,r.deathEvent))&&a.item.system.uses.value<capacity(root);
  }
  const distance=tokensDistance(token,target);
  return spentStages.has(r.stage)&&!incapacitated(a.actor)&&distance!=null&&distance<=60&&a.item.system.uses.value>=1
    &&(r.stage!=="restore"||target.actor.system.details.type.value==="undead");
}
function recountInfo(a,origin) {
  const info=paid(origin,true);if(!info||info.record.active!==0||info.a.uuid!==a.uuid||!a.actor.isOwner||a.actor.items.get(a.item.id)?.uuid!==a.item.uuid)return;
  const root=info.r.stage==="cast"?info:paid(resolve(info.r.source));
  if(root?.r.stage!=="cast"||root.caster.uuid!==a.actor.uuid||root.a.item.uuid!==a.item.uuid||root.record.ended===1
    ||a.actor.flags.spikependium?.lanternCurrent!==`lantern:${root.r.event}`||game.time.worldTime>=root.r.time+600)return;
  if(info.r.stage==="collect"&&(foundry.utils.getProperty(a.actor,claimedPath(root.r.event,info.r.deathEvent))||a.item.system.uses.value>=capacity(root)))return;
  return {...info,root};
}
export function captureLantern(a,config,message) {
  captured.delete(a);recounting.delete(a);const stage=mode(a);if(!stages.has(stage))return;
  if(message.message) {
    const info=recountInfo(a,message.message);
    if(!info){ui.notifications.warn("Повторный расход Фонаря духов требует отменённую карточку текущего незавершённого сотворения. Новое применение запускайте на листе персонажа.");return false;}
    captured.set(a,structuredClone(info.r));recounting.set(a,info.origin.uuid);return;
  }
  const token=a.getUsageToken?.(),root=stage==="cast"?null:ongoing(a.actor),targets=[...game.user.targets].map(t=>t.document??t),target=targets[0];
  const death=stage==="collect"&&root?deathFor(root,target):null,r={stage,event:null,caster:a.actor.uuid,activity:a.uuid,token:token?.uuid,time:game.time.worldTime,start:ActiveEffect.implementation.getEffectStart(),
    source:root?.origin.uuid??null,target:["cast","end"].includes(stage)?null:target?.actor?.uuid,targetToken:["cast","end"].includes(stage)?null:target?.uuid,
    death:death?.uuid??null,deathEvent:death?.flags.spikependium?.lanternDeath?.event??null};
  const expected=message.data?.system?.targets;
  if(message.create===false||!eligible(a,r)||!["cast","end"].includes(stage)&&(targets.length!==1||config.spikependium?.lanternConfirmed!==true
    ||!game.users.activeGM&&!target.actor.isOwner||expected&&(expected.length!==1||expected[0].actor!==r.target||expected[0].token!==r.targetToken))) {
    ui.notifications.warn("Фонарь духов: нужны активный фонарь, допустимая цель и подтверждение условий. Для фрагмента требуется зафиксированная смерть в его свете; для Бонусного действия — непустой запас, а для лечения — Нежить.");return false;
  }
  captured.set(a,r);
  if(token.hidden||target?.hidden||root?.origin.blind||root?.origin.whisper.length) {
    message.data??={};message.data.whisper=root?.origin.whisper.length?[...root.origin.whisper]:game.users.filter(u=>u.isGM).map(u=>u.id);
    message.data.blind=!!token.hidden||!!target?.hidden||!!root?.origin.blind;
  }
}
export function prepareLanternUpdates(a,_config,updates) {
  prepared.delete(a);const stage=mode(a);if(!stages.has(stage))return updates;
  const saved=captured.get(a),recount=recounting.get(a),history=recount&&recountInfo(a,resolve(recount));
  if(!saved||(recount?!history:!eligible(a,saved)))return false;
  const r=recount?saved:{...saved,event:foundry.utils.randomID()},root=stage==="cast"?null:source(resolve(r.source))?.root;
  let item=updates.item.find(i=>i._id===a.item.id);
  if(!item)updates.item.push(item={_id:a.item.id});
  if(stage==="cast") {
    const count=Math.max(0,Math.trunc(Number(a.getRollData().mod)||0));
    item["system.uses.max"]=String(count);item["system.uses.spent"]=count;updates.actor["flags.spikependium.lanternCurrent"]=`lantern:${r.event}`;
    if(updates.delete.includes(a.item.id)||a.item.flags.spikependium?.lanternRetained) {
      updates.delete=updates.delete.filter(id=>id!==a.item.id);r.retained=true;
      item["flags.spikependium.lanternRetained"]=true;item["flags.spikependium.lanternRetainedFor"]=r.event;
      item["flags.spikependium.lanternRetainedUntil"]=r.time+600;item["flags.dnd5e.-=cachedFor"]=null;item["system.prepared"]=1;
    }
  }else if(stage==="collect") {
    if(!root||item["system.uses.spent"]!==undefined)return false;
    item["system.uses.spent"]=a.item.system.uses.spent-1;
    updates.actor[claimedPath(root.r.event,r.deathEvent)]=1;
    updates.actor[`flags.spikependium.lanternUses.${root.r.event}.claims`]=(root.record.claims??0)+1;
  }else if(stage==="end") {
    if(!root)return false;updates.actor[`flags.spikependium.lanternUses.${root.r.event}.ended`]=1;
    item["system.uses.spent"]=a.item.system.uses.max;
  }else {
    if(!root||item["system.uses.spent"]!==a.item.system.uses.spent+1)return false;
    updates.actor[`flags.spikependium.lanternUses.${root.r.event}.spends`]=(root.record.spends??0)+1;
  }
  updates.actor[`flags.spikependium.lanternUses.${r.event}`]={...(history?.record??{}),data:[r],active:1,...(stage==="cast"&&!recount?{ended:0,claims:0,spends:0}:{})};
  prepared.set(a,r);return updates;
}
export function recordLanternConsumption(a,_config,message) {
  const r=prepared.get(a);if(!r||foundry.utils.getProperty(a.actor,path(r.event))!==1)return;
  const deltas=((message.data.system??={}).deltas??={}).actor??=[];
  const paths=[path(r.event),...(r.stage==="collect"?[claimedPath(source(resolve(r.source)).root.r.event,r.deathEvent)]:[])];
  for(const keyPath of paths)if(!deltas.some(d=>d.keyPath===keyPath))deltas.push({keyPath,delta:1});
  if(message.message){foundry.utils.setProperty(message,"data.flags.spikependium.lanternUse",r);prepared.delete(a);}
}
export function recordLanternUsage(a,message) {
  const r=prepared.get(a);prepared.delete(a);if(!r||foundry.utils.getProperty(a.actor,path(r.event))!==1)return;
  foundry.utils.setProperty(message,"data.flags.spikependium.lanternUse",r);
  foundry.utils.setProperty(message,"data.flags.dnd5e.item.data",a.item.toObject());
}
export async function lanternUse(wrapped,...args) {
  if(!stages.has(mode(this)))return wrapped(...args);
  if(using.has(this.actor.uuid))return;using.add(this.actor.uuid);
  try {await reconcileLantern(this.actor);return await wrapped(...args);}finally{using.delete(this.actor.uuid);}
}
export async function lanternConsume(wrapped,config,message) {
  if(!stages.has(mode(this)))return wrapped(config,message);
  if(consuming.has(this.actor.uuid))return false;consuming.add(this.actor.uuid);
  try {
    await reconcileLantern(this.actor);
    return await wrapped(config,message);
  }finally{consuming.delete(this.actor.uuid);}
}
async function reconcileLantern(actor) {
  const previous=syncing.get(actor.uuid)??Promise.resolve(),next=previous.catch(()=>{}).then(async()=>{
    if(!actor.isOwner||!authority(actor))return;
    const info=rootFor(actor,true);if(!info)return;
    const item=actor.items.get(info.a.item.id);if(!item||item.uuid!==info.a.item.uuid)return;
    const end=info.record.active!==1||info.record.ended===1||game.time.worldTime>=info.r.time+600;
    if(game.time.worldTime>=info.r.time+600&&info.record.ended!==1)await actor.update({[`flags.spikependium.lanternUses.${info.r.event}.ended`]:1});
    const cap=end?Math.max(0,Number(item.system.uses.max)||0):capacity(info),count=end?0:Math.min(cap,item.system.uses.value);
    const spent=cap-count;
    if(Number(item.system.uses.max)!==cap||item.system.uses.spent!==spent)await item.update({"system.uses.max":String(cap),"system.uses.spent":spent});
  });syncing.set(actor.uuid,next);
  try{return await next;}finally{if(syncing.get(actor.uuid)===next)syncing.delete(actor.uuid);}
}
export async function endDeletedLantern(effect) {
  if(effect.flags.spikependium?.arcanaSpell!=="spirit-lantern")return;
  const info=paid(resolve(effect.system.origin?.message),true);
  if(info?.r.stage!=="cast"||!info.caster.isOwner||!authority(info.caster)||info.caster.flags.spikependium?.lanternCurrent!==`lantern:${info.r.event}`)return;
  if(info.record.ended!==1)await info.caster.update({[`flags.spikependium.lanternUses.${info.r.event}.ended`]:1});
  await syncLanterns();
}
let lighting=false;
export async function syncLanterns() {
  for(const actor of actors().values()) {
    await reconcileLantern(actor);
    if(!actor.isOwner||!authority(actor))continue;
    for(const item of [...actor.items]) {
      const f=item.flags.spikependium,r=actor.flags.spikependium?.lanternUses?.[f?.lanternRetainedFor]?.data?.[0];
      if(f?.key!==KEY||!f.lanternRetained||!r?.retained||r.stage!=="cast"||r.caster!==actor.uuid||typeof r.activity!=="string"||!r.activity.startsWith(`${item.uuid}.Activity.`)
        ||f.lanternRetainedUntil!==r.time+600||game.time.worldTime<f.lanternRetainedUntil)continue;
      await actor.deleteEmbeddedDocuments("Item",[item.id]);
    }
  }
  if(lighting||game.users.activeGM&&!game.user.isActiveGM)return;lighting=true;
  try {
    for(const scene of game.scenes)for(const token of scene.tokens) {
      if(!token.isOwner||!token.actor)continue;
      const root=ongoing(token.actor),desired=root?.r.token===token.uuid?`au-lantern:${root.r.event}`:null;
      const old=token.flags.spikependium?.radiantLight?.items??[];
      for(const id of new Set([...old.filter(id=>id.startsWith("au-lantern:")),...(desired?[desired]:[])])) {
        const on=id===desired,dim=on?dnd5e.utils.convertLength(60,"ft",scene.grid.units):0;
        const update=radiantLightUpdate(token,id,0,dim,on,{bright:0,dim:dnd5e.utils.convertLength(60,"ft",scene.grid.units)});
        if(update["light.bright"]===token.light.bright&&update["light.dim"]===token.light.dim&&JSON.stringify(update["flags.spikependium.radiantLight"])===JSON.stringify(token.flags.spikependium?.radiantLight))continue;
        await token.update(update);
      }
    }
  }finally{lighting=false;}
}

export async function refundLantern(wrapped,consumed,...args) {
  if(!stages.has(mode(this)))return wrapped(consumed,...args);
  const delta=consumed.actor?.find(d=>/^flags\.spikependium\.lanternUses\.[A-Za-z0-9]{16}\.active$/.test(d.keyPath)&&d.delta===1);
  const event=delta?.keyPath.split(".").at(-2),r=this.actor.flags.spikependium?.lanternUses?.[event]?.data?.[0];
  const root=r?.stage==="cast"?r:paid(resolve(r?.source))?.r;
  if(r&&`lantern:${root?.event}`!==this.actor.flags.spikependium?.lanternCurrent) {
    consumed=foundry.utils.deepClone(consumed);
    const deltas=consumed.item?.[this.item.id];
    if(deltas)consumed.item[this.item.id]=deltas.filter(d=>!d.keyPath.startsWith("system.uses."));
    ui.notifications.warn("Возврат старого Фонаря духов не меняет запас нового сотворения. Уже разрешённые последствия сверяет Мастер.");
  }
  return wrapped(consumed,...args);
}
export async function lanternRollDamage(wrapped,config={},dialog={},message={}) {
  if(!["drain","restore"].includes(mode(this)))return wrapped(config,dialog,message);
  const id=config.event?.target?.closest("[data-message-id]")?.dataset.messageId,value=message.data?.system?.origin;
  const origin=id?game.messages.get(id):typeof value==="string"?game.messages.get(value):value,info=source(origin);
  if(!info||info.a.uuid!==this.uuid||!this.actor.isOwner) {ui.notifications.warn("Бросайте урон или лечение из оплаченной карточки Фонаря духов.");return;}
  message=foundry.utils.deepClone(message);
  foundry.utils.setProperty(message,"data.flags.spikependium.lanternRoll",{usage:origin.uuid,event:info.r.event});
  foundry.utils.setProperty(message,"data.system.origin",origin.id);
  foundry.utils.setProperty(message,"data.system.targets",structuredClone(origin.system.targets));
  if(origin.whisper.length){foundry.utils.setProperty(message,"data.whisper",[...origin.whisper]);message.rollMode="gm";}
  if(origin.blind){foundry.utils.setProperty(message,"data.blind",true);message.rollMode="blind";}
  return wrapped(config,dialog,message);
}
export function guardLanternApplication(actor,amount,updates,options) {
  const card=options.originatingMessage,activity=card?.getAssociatedActivity?.();
  if(!["drain","restore"].includes(mode(activity))&&!card?.flags.spikependium?.lanternRoll)return;
  const binding=card.flags.spikependium?.lanternRoll,info=source(resolve(binding?.usage)),type=info?.r.stage==="restore"?"healing":"necrotic";
  if(card.type!=="damage"||!info||binding.event!==info.r.event||activity?.uuid!==info.a.uuid||actor.uuid!==info.r.target||!card.author||!info.caster.testUserPermission(card.author,"OWNER")
    ||actor.flags.spikependium?.lanternApplications?.[info.r.event]||!Number.isFinite(amount)||info.r.stage==="restore"&&(amount>0||actor.system.details.type.value!=="undead")
    ||info.r.stage==="drain"&&amount<0||!card.rolls.length||!card.rolls.every(r=>r instanceof CONFIG.Dice.DamageRoll&&r._evaluated&&Number.isFinite(r.total)&&r.options.type===type)) {
    ui.notifications.warn("Фонарь духов: неверная цель, возвращённый расход или уже применённая активация. Для лечения нужна Нежить.");return false;
  }
  updates[`flags.spikependium.lanternApplications.${info.r.event}`]=1;
}
export function lanternGuardInfo(effect) {
  const stamp=effect?.flags.spikependium?.lanternGuard,info=source(resolve(stamp?.usage));
  return effect?.flags.spikependium?.lanternGuardProfile&&info?.r.stage==="protect"&&info.record.guardExpired!==1&&stamp.event===info.r.event&&info.r.target===effect.actor?.uuid?info:undefined;
}
export function lanternGuardSuppression(wrapped,...args) {
  if(this.flags.spikependium?.lanternGuardProfile&&!lanternGuardInfo(this))return true;
  return wrapped(...args);
}
export async function syncLanternGuard(origin) {
  const info=source(origin);if(info?.r.stage!=="protect"||info.record.guardExpired===1||origin.flags.spikependium?.lanternGuardApplied||!authority(info.caster))return;
  const actor=resolve(info.r.target);if(!actor?.isOwner)return;
  const lock=`${actor.uuid}:${info.r.event}`;if(guarding.has(lock))return;guarding.add(lock);
  try {
    const profile=info.a.applicableEffects.find(e=>e.flags.spikependium?.lanternGuardProfile);if(!profile)return;
    const exists=actor.effects.find(e=>e.flags.spikependium?.lanternGuard?.event===info.r.event&&e.system.origin?.message===origin.uuid);
    const later=actor.effects.some(e=>e._stats?.duplicateSource===profile.uuid&&(resolve(e.system.origin?.message)?.timestamp??0)>origin.timestamp);
    if(!exists&&!later) {
      const tray=new dnd5e.applications.components.EffectApplicationElement();tray.chatMessage=origin;
      const {action,data}=await tray._prepareEffectData(profile,actor);
      if(!source(origin)||!authority(info.caster))return;
      foundry.utils.setProperty(data,"flags.spikependium.lanternGuard",{usage:origin.uuid,event:info.r.event});
      data.start=origin.flags.spikependium.lanternUse.start??ActiveEffect.implementation.getEffectStart();
      if(action==="create")await actor.createEmbeddedDocuments("ActiveEffect",[data]);else await actor.updateEmbeddedDocuments("ActiveEffect",[data]);
    }
    await origin.setFlag("spikependium","lanternGuardApplied",true);
  }finally{guarding.delete(lock);}
}
export async function resumeLanternGuards() {
  for(const origin of game.messages)if(origin.flags.spikependium?.lanternUse?.stage==="protect")await syncLanternGuard(origin);
}
export async function lanternStartTurn(wrapped,combatant) {
  const result=await wrapped(combatant),actor=combatant?.actor;
  if(!actor?.isOwner||!authority(actor))return result;
  const updates={};
  for(const[event,record]of Object.entries(actor.flags.spikependium?.lanternUses??{})) {
    const r=record.data?.[0];
    if(record.guardExpired===1||r?.stage!=="protect"||r.token!==combatant.token?.uuid)continue;
    const combatId=typeof r.start?.combat==="string"?r.start.combat.split(".").at(-1):r.start?.combat?.id;
    if(combatId&&combatId!==this.id||r.start?.round===this.current?.round&&r.start?.turn===this.current?.turn)continue;
    updates[`flags.spikependium.lanternUses.${event}.guardExpired`]=1;
  }
  if(Object.keys(updates).length)try{await actor.update(updates);}catch(error){arcanaSpellError(error);}
  return result;
}
const attackWindows=new WeakMap();
function guardedTargets(activity,targets) {
  return targets.map(t=>{
    const token=resolve(t.token),actor=token?.actor??resolve(t.actor);
    const effects=actor?.uuid!==activity.actor?.uuid?actor?.effects.filter(e=>live(e)&&lanternGuardInfo(e))??[]:[];
    return {token:t.token,actor:actor?.uuid,effects:effects.map(e=>`${e.uuid}:${e.flags.spikependium.lanternGuard.event}`).sort()};
  });
}
function disadvantage(options) {
  options.advantage||=options.advantageMode===1;options.disadvantage=true;
  if(options.advantageMode!==undefined)options.advantageMode=options.advantage?0:-1;
}
export function prepareLanternAttack(config,_dialog,message) {
  if(config.subject?.type!=="attack")return;
  const targets=structuredClone(message.data?.system?.targets??[]),state=guardedTargets(config.subject,targets);
  attackWindows.set(config,{signature:JSON.stringify(state),targets});
  if(!state.some(t=>t.effects.length))return;
  if(state.some(t=>!t.effects.length)){ui.notifications.warn("Охрана Фонаря духов: для целей с разными условиями Помехи совершите отдельные броски атаки.");return false;}
  config.spikependium={...config.spikependium,lanternTargets:targets};
  for(const roll of config.rolls)disadvantage(roll.options??={});
}
export function buildLanternAttack(wrapped,process,config,...args) {
  const result=wrapped(process,config,...args),targets=process.spikependium?.lanternTargets;
  if(targets?.length&&guardedTargets(this,targets).every(t=>t.effects.length))disadvantage(config.options??={});
  return result;
}
export function finalizeLanternAttack(_rolls,config,_dialog,message) {
  if(config.subject?.type!=="attack")return;
  const prior=attackWindows.get(config);if(!prior)return;
  const current=JSON.stringify(guardedTargets(config.subject,message?.data?.system?.targets??prior.targets));
  if(current!==prior.signature){ui.notifications.warn("Охрана Фонаря духов или цели атаки изменились. Повторите бросок.");return false;}
}
export function lanternDeltaLabel(wrapped,...args) {
  const result=wrapped(...args);
  if(/^flags\.spikependium\.lanternUses\.[A-Za-z0-9]{16}\.active$/.test(this.keyPath))result.label="Оплаченный эффект Фонаря духов";
  if(/^flags\.spikependium\.lanternUses\.[A-Za-z0-9]{16}\.ended$/.test(this.keyPath))result.label="Окончание Фонаря духов";
  if(/^flags\.spikependium\.lanternClaims\.[A-Za-z0-9]{16}\.[A-Za-z0-9]{16}$/.test(this.keyPath))result.label="Фрагмент за эту смерть";
  if(/^flags\.spikependium\.lanternUses\.[A-Za-z0-9]{16}\.claims$/.test(this.keyPath))result.label="Полученный фрагмент души";
  if(/^flags\.spikependium\.lanternUses\.[A-Za-z0-9]{16}\.spends$/.test(this.keyPath))result.label="Израсходованный фрагмент души";
  return result;
}
