import {arcanaCast} from "./arcana-spells.mjs";

const KEY="spell:au-distance-distortion",captured=new WeakMap(),prepared=new WeakMap(),using=new Set(),syncing=new Set();
const resolve=uuid=>uuid&&fromUuidSync(uuid,{strict:false});
const stage=a=>a?.item?.type==="spell"&&a.item.flags.spikependium?.key===KEY?a.flags?.spikependium?.distanceStage:null;
const live=e=>e?.active&&!e.duration.expired&&!(Number.isFinite(e.duration.remaining)&&e.duration.remaining<=0);
const authority=origin=>game.users.activeGM?game.user.isActiveGM:origin.author?.id===game.user.id;
const path=id=>`flags.spikependium.distanceUses.${id}.active`;
function paid(origin,allowRefund=false) {
  const r=origin?.flags.spikependium?.distanceUse,a=origin?.getAssociatedActivity?.({scaled:true}),caster=resolve(r?.caster),record=caster?.flags.spikependium?.distanceUses?.[r?.event];
  if(origin?.type!=="usage"||!r||!/^[A-Za-z0-9]{16}$/.test(r.event)||!Number.isFinite(r.time)||!a||!['cast','slow','fast'].includes(r.stage)
    ||stage(a)!==r.stage||a.uuid!==r.activity||a.actor?.uuid!==r.caster||record?.active!==1&&!(allowRefund&&record?.active===0)||JSON.stringify(record.data?.[0])!==JSON.stringify(r)
    ||!origin.author||!caster.testUserPermission(origin.author,"OWNER")||!origin.system.deltas?.actor?.some(d=>d.keyPath===path(r.event)&&d.delta===1))return;
  if(r.stage!=="cast"&&(origin.system.targets?.length!==1||origin.system.targets[0].actor!==r.target||origin.system.targets[0].token!==r.targetToken))return;
  return {r,a,caster,origin,record};
}
export const distanceCastPaid=origin=>{const info=paid(origin);return info?.r.stage==="cast"&&!info.record.ended;};
function source(origin) {
  const info=paid(origin),arcana=arcanaCast(origin);
  return info?.r.stage==="cast"&&!info.record.ended&&arcana?.receipt.kind==="distance-distortion"&&live(arcana.concentration)
    &&game.time.worldTime<info.r.time+600?{...info,...arcana}:undefined;
}
function current(a) {
  for(const effect of a.actor.effects) {
    if(effect.flags.spikependium?.arcanaSpell!=="distance-distortion"||!live(effect))continue;
    const root=source(resolve(effect.system.origin?.message));
    if(root?.a.item.uuid===a.item.uuid)return root;
  }
}
const phase=()=>game.combat?.started?{combat:game.combat.uuid,round:game.combat.round,turn:game.combat.turn}:{time:game.time.worldTime};
const samePhase=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function area(root) {
  const region=resolve(root?.origin.flags.spikependium?.distanceArea);
  return region?.documentName==="Region"&&region.getFlag("dnd5e","activity")===root.a.uuid?region:undefined;
}
function inside(region,token) {
  if(!region||token?.parent!==region.parent)return false;
  const points=token.getOccupiedGridSpaceOffsets().map(o=>token.parent.grid.getCenterPoint(o));
  if(!points.length)points.push(token.getCenterPoint());
  // shortcut: native Regions are planar; the caster confirms spherical height until the platform supports that geometry.
  return points.some(p=>region.testPoint({...p,elevation:token.elevation,level:token.level}));
}
function eligible(a,r) {
  if(!a.actor.isOwner||!samePhase(r.phase,phase()))return false;
  if(r.stage==="cast")return !a.item.flags.spikependium?.distanceRetained;
  const root=source(resolve(r.source)),target=resolve(r.targetToken),region=area(root);
  return !!root&&root.a.item.uuid===a.item.uuid&&target?.actor?.uuid===r.target&&target.actor.system.isCreature&&inside(region,target)
    &&!Object.values(a.actor.flags.spikependium?.distanceUses??{}).some(record=>{const old=record.data?.[0];return record.active===1&&old?.source===r.source&&old.target===r.target&&samePhase(old.phase,r.phase);});
}
export function prepareDistanceDialog(a,config,dialog) {
  if(stage(a)==="cast"&&a.item.flags.spikependium?.distanceRetained){ui.notifications.warn("Временная копия хранит активное искажение. Для нового сотворения нужен новый источник.");return false;}
  if(!['slow','fast'].includes(stage(a)))return;
  const Base=dialog.applicationClass;dialog.configure=true;
  dialog.applicationClass=class extends Base {
    async _prepareConsumptionContext(context,options) {
      context=await super._prepareConsumptionContext(context,options);
      context.fields.push({name:"spikependium.distanceConfirmed",value:this.config.spikependium?.distanceConfirmed??false,
        field:new foundry.data.fields.BooleanField({label:"Вижу цель в Сфере; появление области, вход или конец хода и высота проверены"}),input:context.inputs.createCheckboxInput});
      context.hasConsumption=true;return context;
    }
  };
}
export function captureDistance(a,config,message) {
  captured.delete(a);const kind=stage(a);if(!kind)return;
  // Resource recount restores the same historical payment; it must not create a fresh turn or cast.
  if(message.message){ui.notifications.warn("Искажение дистанции: после возврата запускайте новое применение на листе; старые последствия сверяет Мастер.");return false;}
  const root=kind==="cast"?null:current(a),targets=[...game.user.targets].map(t=>t.document??t),target=targets[0],token=a.getUsageToken?.();
  const r={event:null,stage:kind,caster:a.actor.uuid,activity:a.uuid,time:game.time.worldTime,phase:phase(),start:ActiveEffect.implementation.getEffectStart(),
    source:root?.origin.uuid??null,target:kind==="cast"?null:target?.actor?.uuid,targetToken:kind==="cast"?null:target?.uuid,token:token?.uuid};
  const expected=message.data?.system?.targets;
  if(message.create===false||!token||token.actor?.uuid!==a.actor.uuid||!eligible(a,r)||kind!=="cast"&&(targets.length!==1||config.spikependium?.distanceConfirmed!==true
    ||!game.users.activeGM&&!target.actor.isOwner||expected&&(expected.length!==1||expected[0].actor!==r.target||expected[0].token!==r.targetToken))) {
    ui.notifications.warn("Нужны активная область Искажения дистанции, одна видимая цель в ней и подтверждение события. Воздействовать на неё можно один раз за ход.");return false;
  }
  captured.set(a,r);
  if(token.hidden||target?.hidden||root?.origin.blind||root?.origin.whisper.length) {
    message.data??={};message.data.whisper=root?.origin.whisper.length?[...root.origin.whisper]:game.users.filter(u=>u.isGM).map(u=>u.id);
    message.data.blind=!!token.hidden||!!target?.hidden||!!root?.origin.blind;
  }
}
export function prepareDistanceUpdates(a,_config,updates) {
  prepared.delete(a);if(!stage(a))return updates;const r=captured.get(a);if(!r||!eligible(a,r))return false;
  const receipt={...r,event:foundry.utils.randomID()};updates.actor[`flags.spikependium.distanceUses.${receipt.event}`]={data:[receipt],active:1};
  if(r.stage==="cast"&&updates.delete.includes(a.item.id)) {
    updates.delete=updates.delete.filter(id=>id!==a.item.id);receipt.retained=true;
    let item=updates.item.find(row=>row._id===a.item.id);if(!item)updates.item.push(item={_id:a.item.id});
    item["flags.spikependium.distanceRetained"]=true;item["flags.spikependium.distanceRetainedFor"]=receipt.event;
    item["flags.spikependium.distanceRetainedUntil"]=receipt.time+600;item["flags.dnd5e.-=cachedFor"]=null;item["system.prepared"]=1;
  }
  prepared.set(a,receipt);return updates;
}
export function recordDistanceConsumption(a,_config,message) {
  const r=prepared.get(a);if(!r||foundry.utils.getProperty(a.actor,path(r.event))!==1)return;
  const deltas=((message.data.system??={}).deltas??={}).actor??=[];
  if(!deltas.some(d=>d.keyPath===path(r.event)))deltas.push({keyPath:path(r.event),delta:1});
}
export function recordDistanceUsage(a,message) {
  const r=prepared.get(a);prepared.delete(a);if(!r||foundry.utils.getProperty(a.actor,path(r.event))!==1)return;
  foundry.utils.setProperty(message,"data.flags.spikependium.distanceUse",r);
  foundry.utils.setProperty(message,"data.flags.dnd5e.item.data",a.item.toObject());
}
export async function distanceUse(wrapped,...args) {
  if(!stage(this))return wrapped(...args);if(using.has(this.actor.uuid))return;using.add(this.actor.uuid);
  try{return await wrapped(...args);}finally{using.delete(this.actor.uuid);}
}
export async function recordDistanceArea(a,_config,results) {
  if(stage(a)!=="cast")return;const root=source(results?.message),regions=results?.templates??[];
  if(!root||!a.actor.isOwner||root.origin.author.id!==game.user.id&&!game.user.isGM||regions.length!==1||regions[0].getFlag("dnd5e","activity")!==a.uuid)return;
  await root.origin.setFlag("spikependium","distanceArea",regions[0].uuid);await syncDistanceRegions();
}
export async function bindDistanceArea(a,templates) {
  if(stage(a)!=="cast")return;const root=current(a);if(!root||root.origin.flags.spikependium?.distanceArea)return;
  await recordDistanceArea(a,{}, {message:root.origin,templates});
}
export async function syncDistanceRegions() {
  const actors=new Map([...game.actors,...[...game.scenes].flatMap(s=>[...s.tokens].map(t=>t.actor))].filter(Boolean).map(a=>[a.uuid,a]));
  for(const actor of actors.values()) {
    if(actor.effects.some(e=>e.flags.spikependium?.distanceProfile))actor.reset();
    if(!actor.isOwner)continue;
    for(const item of [...actor.items]) {
      const f=item.flags.spikependium,r=actor.flags.spikependium?.distanceUses?.[f?.distanceRetainedFor]?.data?.[0];
      const origin=r&&game.messages.find(m=>m.flags.spikependium?.distanceUse?.event===r.event&&m.flags.spikependium?.distanceUse?.stage==="cast");
      if(f?.key!==KEY||!f.distanceRetained||!r?.retained||r.stage!=="cast"||r.caster!==actor.uuid||typeof r.activity!=="string"||!r.activity.startsWith(`${item.uuid}.Activity.`)
        ||f.distanceRetainedUntil!==r.time+600||game.time.worldTime<f.distanceRetainedUntil||!paid(origin,true)||!authority(origin)||syncing.has(item.uuid))continue;
      syncing.add(item.uuid);try{await actor.deleteEmbeddedDocuments("Item",[item.id]);}finally{syncing.delete(item.uuid);}
    }
  }
  canvas.tokens?.recalculatePlannedMovementPaths?.();
  if(!game.user.isActiveGM)return;
  for(const origin of game.messages) {
    const historical=paid(origin,true);if(historical?.r.stage!=="cast")continue;
    const region=area(historical);if(!region||syncing.has(region.uuid))continue;syncing.add(region.uuid);
    try {
      if(!historical.caster.effects.get(origin.system.concentration)||game.time.worldTime>=historical.r.time+600) {
        await historical.caster.update({[`flags.spikependium.distanceUses.${historical.r.event}.ended`]:true});
        await region.parent.deleteEmbeddedDocuments("Region",[region.id]);continue;
      }
      const root=source(origin);if(!root)continue;
      if(!region.behaviors.some(b=>b.flags.spikependium?.distanceTerrain===origin.uuid))await region.createEmbeddedDocuments("RegionBehavior",[
        {name:"Искажение дистанции: условная местность",type:"dnd5e.difficultTerrain",system:{magical:true,types:[],ignoredDispositions:[]},flags:{spikependium:{distanceTerrain:origin.uuid}}}]);
    }finally{syncing.delete(region.uuid);}
  }
  canvas.tokens?.recalculatePlannedMovementPaths?.();
}
function stageInfo(effect) {
  const stamp=effect.flags.spikependium?.distanceEffect,info=paid(resolve(stamp?.usage)),root=source(resolve(info?.r.source));
  return root&&info.r.stage===effect.flags.spikependium?.distanceProfile&&stamp.event===info.r.event&&info.r.target===effect.actor?.uuid
    &&!expired(info)?{...info,root}:undefined;
}
function expired(info) {
  if(info.record.expired)return true;
  const combat=resolve(info.r.phase.combat);if(!combat?.started)return false;
  const index=combat.turns.findIndex(c=>c.token?.uuid===info.r.targetToken);if(index<0)return false;
  const p=info.r.phase,round=p.round+(index<p.turn||info.r.stage==="fast"&&index===p.turn?1:0);
  return combat.round>round||combat.round===round&&combat.turn>index;
}
export function distanceSuppression(wrapped,...args) {
  const suppressed=wrapped(...args);if(!this.flags.spikependium?.distanceProfile)return suppressed;
  if(!stageInfo(this))return true;
  if(this.flags.spikependium.distanceProfile==="fast"&&this.actor.effects.some(e=>e!==this&&e.flags.spikependium?.distanceProfile==="fast"
    &&!e.disabled&&!e.duration.expired&&stageInfo(e)&&((e.start?.time??0)>(this.start?.time??0)||(e.start?.time??0)===(this.start?.time??0)&&e.id.localeCompare(this.id)>0)))return true;
  return suppressed;
}
export function distanceTerrain(wrapped,token,segment) {
  const native=wrapped(token,segment),origin=this.behavior.flags.spikependium?.distanceTerrain;if(!origin)return native;
  const root=source(resolve(origin));if(!root||area(root)?.uuid!==this.behavior.parent.uuid)return [];
  return token.actor?.effects.some(e=>e.flags.spikependium?.distanceProfile==="slow"&&live(e)&&stageInfo(e)?.r.source===origin)?native:[];
}
export function distanceExpiry(wrapped,event,context={}) {
  const native=wrapped(event,context);if(this.flags.spikependium?.distanceProfile!=="slow"||event!=="turnEnd")return native;
  const info=paid(resolve(this.flags.spikependium?.distanceEffect?.usage)),combat=context.combat??game.combat;
  if(!info||info.r.phase.combat!==combat?.uuid)return native;
  return combat.combatants.get(combat.previous.combatantId)?.token?.uuid===info.r.targetToken||native;
}
export function distanceSpeedChange(wrapped,model,change,...args) {
  if(model?.documentName==="Actor"&&change.key==="system.attributes.movement.bonus"&&change.effect?.flags.spikependium?.distanceProfile==="fast")
    change={...change,value:String(dnd5e.utils.convertLength(20,"ft",model.system.attributes.movement.units??"ft"))};
  return wrapped(model,change,...args);
}
export async function syncDistanceEffect(origin) {
  const info=paid(origin);if(!info||info.r.stage==="cast"||!source(resolve(info.r.source))||expired(info)||origin.flags.spikependium?.distanceApplied||!authority(origin))return;
  const actor=resolve(info.r.target);if(!actor?.isOwner||syncing.has(origin.uuid))return;
  const saved=origin.getAssociatedRolls("save").filter(m=>m.system.ability==="int"&&m.getAssociatedActor()?.uuid===actor.uuid&&m.getAssociatedToken()?.uuid===info.r.targetToken
    &&m.author&&(m.author.isGM||actor.testUserPermission(m.author,"OWNER"))&&m.rolls[0] instanceof CONFIG.Dice.D20Roll&&m.rolls[0]._evaluated&&Number.isFinite(m.rolls[0].total)
    &&m.rolls[0].options.target===info.a.save.dc.value).at(-1);
  if(info.r.stage==="slow"&&(!saved||saved.system.forceSuccess||!saved.rolls[0].isFailure))return;
  syncing.add(origin.uuid);
  try {
    const profile=info.a.applicableEffects.find(e=>e.flags.spikependium?.distanceProfile===info.r.stage);if(!profile)return;
    const later=actor.effects.some(e=>e._stats?.duplicateSource===profile.uuid&&(resolve(e.system.origin?.message)?.timestamp??0)>origin.timestamp);
    if(!later&&!actor.effects.some(e=>e.flags.spikependium?.distanceEffect?.event===info.r.event)) {
      const tray=new dnd5e.applications.components.EffectApplicationElement();tray.chatMessage=origin;
      const {action,data}=await tray._prepareEffectData(profile,actor);if(!paid(origin)||!source(resolve(info.r.source)))return;
      data.start=info.r.start;foundry.utils.setProperty(data,"flags.spikependium.distanceEffect",{usage:origin.uuid,event:info.r.event});
      if(action==="create")await actor.createEmbeddedDocuments("ActiveEffect",[data]);else await actor.updateEmbeddedDocuments("ActiveEffect",[data]);
    }
    await origin.setFlag("spikependium","distanceApplied",true);
  }finally{syncing.delete(origin.uuid);}
}
export async function resumeDistanceEffects(message) {
  if(message){const origin=message.type==="save"?message.getOriginatingMessage():message;await syncDistanceEffect(origin);}
  else for(const origin of game.messages)await syncDistanceEffect(origin);
}
export async function distanceEndTurn(wrapped,combatant) {
  const result=await wrapped(combatant);if(!game.user.isActiveGM)return result;
  for(const origin of game.messages) {
    const info=paid(origin);if(!info||info.r.stage==="cast"||info.record.expired||info.r.targetToken!==combatant.token?.uuid)continue;
    const p=info.r.phase;if(p.combat!==this.uuid)continue;
    if(info.r.stage==="fast"&&p.round===this.previous.round&&p.turn===this.previous.turn)continue;
    await info.caster.update({[`flags.spikependium.distanceUses.${info.r.event}.expired`]:true});
  }
  return result;
}
export function distanceDeltaLabel(wrapped,...args) {
  const result=wrapped(...args);if(/^flags\.spikependium\.distanceUses\.[A-Za-z0-9]{16}\.active$/.test(this.keyPath))result.label="Искажение дистанции: воздействие";return result;
}
export async function distanceDamage(wrapped,config={},dialog={},message={}) {
  if(stage(this)!=="slow")return wrapped(config,dialog,message);
  const id=config.event?.target?.closest("[data-message-id]")?.dataset.messageId,value=message.data?.system?.origin;
  const origin=id?game.messages.get(id):typeof value==="string"?game.messages.get(value):value,info=paid(origin);
  if(info?.r.stage!=="slow"||info.a.uuid!==this.uuid||!boundRoot(info)||!this.actor.isOwner){ui.notifications.warn("Бросайте урон Искажения дистанции из оплаченной карточки воздействия.");return;}
  message=foundry.utils.deepClone(message);foundry.utils.setProperty(message,"data.flags.spikependium.distanceDamage",{usage:origin.uuid,event:info.r.event});
  foundry.utils.setProperty(message,"data.system.origin",origin.id);foundry.utils.setProperty(message,"data.system.targets",structuredClone(origin.system.targets));
  if(origin.whisper.length){foundry.utils.setProperty(message,"data.whisper",[...origin.whisper]);message.rollMode="gm";}
  if(origin.blind){foundry.utils.setProperty(message,"data.blind",true);message.rollMode="blind";}
  return wrapped(config,dialog,message);
}
function boundRoot(info) {
  const root=paid(resolve(info?.r.source));return root?.r.stage==="cast"&&root.a.item.uuid===info.a.item.uuid&&root.caster.uuid===info.caster.uuid;
}
export function guardDistanceDamage(actor,amount,updates,options) {
  const card=options.originatingMessage,a=card?.getAssociatedActivity?.(),binding=card?.flags.spikependium?.distanceDamage;
  if(stage(a)!=="slow"&&!binding)return;
  const info=paid(resolve(binding?.usage));
  if(card?.type!=="damage"||info?.r.stage!=="slow"||!boundRoot(info)||binding.event!==info.r.event||a?.uuid!==info.a.uuid||actor.uuid!==info.r.target
    ||!card.author||!info.caster.testUserPermission(card.author,"OWNER")||actor.flags.spikependium?.distanceDamageApplied?.[info.r.event]||!Number.isFinite(amount)||amount<0
    ||!card.rolls.length||!card.rolls.every(r=>r instanceof CONFIG.Dice.DamageRoll&&r._evaluated&&Number.isFinite(r.total)&&r.options.type==="psychic")){
    ui.notifications.warn("Искажение дистанции: неверная цель, возвращённый расход или уже применённый урон.");return false;
  }
  updates[`flags.spikependium.distanceDamageApplied.${info.r.event}`]=1;
}
