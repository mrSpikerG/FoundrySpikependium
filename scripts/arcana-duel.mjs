import {nearestSoulPrisonSpace} from './soul-prison.mjs';
import {occupied} from './push.mjs';

const KEY='spell:au-dueling-ground',captured=new WeakMap(),prepared=new WeakMap(),using=new Set(),syncing=new Set(),applying=new Set();
const resolve=id=>id&&fromUuidSync(id,{strict:false}),stage=a=>a?.item?.type==='spell'&&a.item.flags.spikependium?.key===KEY?a.flags?.spikependium?.duelStage:null;
const live=e=>e?.active&&!e.duration.expired&&!(Number.isFinite(e.duration.remaining)&&e.duration.remaining<=0);
const alreadyDead=actor=>actor?.effects.some(e=>e.statuses.has('dead')&&live(e));
const actors=()=>new Map([...game.actors,...[...game.scenes].flatMap(s=>[...s.tokens].map(t=>t.actor))].filter(Boolean).map(a=>[a.uuid,a]));
const authority=a=>a?.isOwner&&(game.users.activeGM?game.user.isActiveGM:game.users.filter(u=>u.active&&a.testUserPermission(u,'OWNER')).sort((a,b)=>a.id.localeCompare(b.id))[0]?.id===game.user.id);
const value=(o,p)=>Object.hasOwn(o,p)?o[p]:foundry.utils.getProperty(o,p),path=id=>`flags.spikependium.duelUses.${id}.active`;
function paid(origin,refund=false){
 const r=origin?.flags.spikependium?.duelUse,a=origin?.getAssociatedActivity?.({scaled:true}),caster=resolve(r?.caster),record=caster?.flags.spikependium?.duelUses?.[r?.event];
 if(origin?.type!=='usage'||!r||!/^[A-Za-z0-9]{16}$/.test(r.event)||!['cast','protect','end'].includes(r.stage)||!a||stage(a)!==r.stage||a.uuid!==r.activity||a.actor?.uuid!==r.caster
  ||!caster||!origin.author||!caster.testUserPermission(origin.author,'OWNER')||record?.active!==1&&!(refund&&record?.active===0)||JSON.stringify(record.data?.[0])!==JSON.stringify(r)
  ||!Number.isFinite(r.time)||!origin.system.deltas?.actor?.some(d=>d.keyPath===path(r.event)&&d.delta===1)||!Array.isArray(r.targets)||!r.targets.every(t=>t&&typeof t.actor==='string'&&typeof t.token==='string')||origin.system.targets?.length!==r.targets.length
  ||!origin.system.targets.every(t=>r.targets.some(v=>v.actor===t.actor&&v.token===t.token)))return;
 return {r,a,caster,record,origin};
}
function source(origin){const i=paid(origin);return i?.r.stage==='cast'&&!i.record.ended&&game.time.worldTime<i.r.time+3600?i:undefined;}
function region(i){const r=resolve(i?.origin.flags.spikependium?.duelArea);return r?.documentName==='Region'&&r.getFlag('dnd5e','activity')===i.a.uuid?r:undefined;}
function geometry(i){const r=region(i),s=r?.shapes?.[0];if(!r||r.shapes.length!==1||s.type!=='circle'||s.hole||![s.x,s.y,s.radius].every(Number.isFinite)||s.radius<=0)return;
 return {scene:r.parent.uuid,x:s.x,y:s.y,radius:s.radius,elevation:i.r.elevation,level:i.r.sceneLevel};}
export function insideDuel(g,token,position=token){
 if(!g||token?.parent?.uuid!==g.scene||(position.level??token.level)!==g.level)return false;
 const grid=token.parent.grid,dz=((position.elevation??token.elevation)-g.elevation)*grid.size/grid.distance;
 if(!Number.isFinite(dz)||Math.abs(dz)>g.radius)return false;
 const points=token.getOccupiedGridSpaceOffsets(position).map(o=>grid.getCenterPoint(o));if(!points.length)points.push(token.getCenterPoint(position));
 return points.some(p=>(p.x-g.x)**2+(p.y-g.y)**2+dz**2<=g.radius**2+1e-8);
}
function member(actor,origin=null){
 if(!actor||alreadyDead(actor))return;
 for(const e of actor.effects){const stamp=e.flags.spikependium?.duelParticipant;if(!stamp||origin&&stamp.source!==origin||!live(e))continue;const i=source(resolve(stamp.source)),token=resolve(stamp.token),g=geometry(i);
  if(i&&i.r.targets.some(t=>t.actor===actor.uuid&&t.token===token?.uuid)&&token?.actor?.uuid===actor.uuid&&insideDuel(g,token))return {i,token,g};
 }
}
function current(a){return [...game.messages].toReversed().map(m=>source(m)).find(i=>i?.caster.uuid===a.actor.uuid&&i.a.item.uuid===a.item.uuid&&region(i));}
function eligible(a,r){
 if(!a.actor.isOwner||!resolve(r.token)||resolve(r.token).actor?.uuid!==a.actor.uuid)return false;
 if(r.stage==='cast')return !a.item.flags.spikependium?.duelRetained&&Number.isFinite(r.elevation)&&Number.isInteger(r.level)&&r.level>=2&&r.level<=9&&r.targets.length>=2&&r.targets.length<=r.level
  &&new Set(r.targets.map(t=>t.actor)).size===r.targets.length&&r.targets.every(t=>{const token=resolve(t.token);return token?.actor?.uuid===t.actor&&token.actor.system.isCreature&&!token.actor.statuses.has('dead')&&token.parent===resolve(r.token).parent;});
 const i=source(resolve(r.source));if(!i||i.a.item.uuid!==a.item.uuid)return false;if(r.stage==='end')return true;
 const target=r.targets[0],actor=resolve(target?.actor),m=actor&&member(actor,i.origin.uuid);return r.stage==='protect'&&r.targets.length===1&&m?.i.origin.uuid===i.origin.uuid&&m.token.uuid===target.token;
}
export function prepareDuel(a,config,dialog){
 const kind=stage(a);if(!kind)return;if(kind==='cast'&&a.item.flags.spikependium?.duelRetained){ui.notifications.warn('Временная копия хранит действующую площадку, но не позволяет нового сотворения.');return false;}
 if(kind!=='cast')config.spikependium={...config.spikependium,duelOrigin:config.spikependium?.duelOrigin??current(a)?.origin.uuid??''};
 const Base=dialog.applicationClass;dialog.configure=true;dialog.applicationClass=class extends Base{async _prepareConsumptionContext(context,options){context=await super._prepareConsumptionContext(context,options);
  if(kind!=='cast')context.fields.push({name:'spikependium.duelOrigin',value:this.config.spikependium?.duelOrigin??'',field:new foundry.data.fields.StringField({label:'Исходная площадка',choices:{'':'Выберите площадку',...Object.fromEntries(game.messages.map(m=>source(m)).filter(i=>i?.caster.uuid===a.actor.uuid&&i.a.item.uuid===a.item.uuid&&region(i)).map((i,n)=>[i.origin.uuid,`Площадка ${n+1}`]))}})});
  context.fields.push({name:'spikependium.duelConfirmed',value:this.config.spikependium?.duelConfirmed??false,field:new foundry.data.fields.BooleanField({label:kind==='cast'?'Все выбранные существа согласны; касаюсь земли и имею шёлковое знамя не дешевле 100 ЗМ':kind==='protect'?'Участника мгновенно убил бы эффект БЕЗ нанесения урона':'Завершить исходную площадку без возврата её прежних последствий'}),input:context.inputs.createCheckboxInput});context.hasConsumption=true;return context;
 }};
}
export function captureDuel(a,config,message){
 captured.delete(a);const kind=stage(a);if(!kind)return;if(message.message){ui.notifications.warn('Новое Место для дуэли создавайте на листе; старые последствия возврата сверяет Мастер.');return false;}
 const token=a.getUsageToken?.(),root=kind==='cast'?null:source(resolve(config.spikependium?.duelOrigin))??current(a),targets=kind==='end'?(message.data?.system?.targets??[]).map(t=>({actor:t.actor,token:t.token})):[...game.user.targets].map(t=>{t=t.document??t;return{actor:t.actor?.uuid,token:t.uuid};});
 const r={event:null,stage:kind,caster:a.actor.uuid,activity:a.uuid,time:game.time.worldTime,start:ActiveEffect.implementation.getEffectStart(),token:token?.uuid,source:root?.origin.uuid??null,targets,level:a.item.system.level,elevation:token?.elevation,sceneLevel:token?.level};
 if(message.create===false||config.spikependium?.duelConfirmed!==true||!eligible(a,r)||!game.users.activeGM&&targets.some(t=>!resolve(t.actor)?.isOwner)
  ||message.data?.system?.targets&&(message.data.system.targets.length!==targets.length||!message.data.system.targets.every(t=>targets.some(v=>v.actor===t.actor&&v.token===t.token)))){
  ui.notifications.warn('Выберите от двух согласных существ до уровня ячейки либо одного участника активной площадки и подтвердите условия. Нужен Мастер или права на цели.');return false;
 }
 captured.set(a,r);
 if(token.hidden||targets.some(t=>resolve(t.token)?.hidden)||root?.origin.blind||root?.origin.whisper.length){message.data??={};message.data.whisper=root?.origin.whisper.length?[...root.origin.whisper]:game.users.filter(u=>u.isGM).map(u=>u.id);message.data.blind=!!token.hidden||targets.some(t=>resolve(t.token)?.hidden)||!!root?.origin.blind;}
}
export function prepareDuelUpdates(a,_config,updates){
 prepared.delete(a);if(!stage(a))return updates;const old=captured.get(a);if(!old||!eligible(a,old))return false;const r={...old,event:foundry.utils.randomID()};updates.actor[`flags.spikependium.duelUses.${r.event}`]={data:[r],active:1};
 if(r.stage==='cast'&&updates.delete.includes(a.item.id)){updates.delete=updates.delete.filter(id=>id!==a.item.id);r.retained=true;let row=updates.item.find(i=>i._id===a.item.id);if(!row)updates.item.push(row={_id:a.item.id});
  Object.assign(row,{'flags.spikependium.duelRetained':true,'flags.spikependium.duelRetainedFor':r.event,'flags.spikependium.duelRetainedUntil':r.time+3600,'flags.dnd5e.-=cachedFor':null,'system.prepared':1});
 }
 prepared.set(a,r);return updates;
}
export function recordDuelConsumption(a,_config,message){const r=prepared.get(a);if(!r||foundry.utils.getProperty(a.actor,path(r.event))!==1)return;const deltas=((message.data.system??={}).deltas??={}).actor??=[];if(!deltas.some(d=>d.keyPath===path(r.event)))deltas.push({keyPath:path(r.event),delta:1});}
export function recordDuelUsage(a,message){const r=prepared.get(a);prepared.delete(a);if(!r||foundry.utils.getProperty(a.actor,path(r.event))!==1)return;foundry.utils.setProperty(message,'data.flags.spikependium.duelUse',r);foundry.utils.setProperty(message,'data.flags.dnd5e.item.data',a.item.toObject());}
export async function duelUse(wrapped,...args){if(!stage(this))return wrapped(...args);if(using.has(this.actor.uuid))return;using.add(this.actor.uuid);try{return await wrapped(...args);}finally{using.delete(this.actor.uuid);}}
async function applyParticipants(i){
 if(!i||!authority(i.caster)||!i.record.bound||applying.has(i.origin.uuid))return;const g=geometry(i);if(!g)return;applying.add(i.origin.uuid);
 try{
 for(const target of i.r.targets){const token=resolve(target.token),actor=token?.actor;if(actor?.uuid!==target.actor||!actor.isOwner||!insideDuel(g,token)||i.origin.flags.spikependium?.duelApplied?.includes(target.token))continue;
  if(!actor.effects.some(e=>e.flags.spikependium?.duelParticipant?.source===i.origin.uuid&&e.flags.spikependium.duelParticipant.token===target.token)){
   const profile=i.a.applicableEffects.find(e=>e.flags.spikependium?.duelParticipantProfile);if(!profile)continue;const tray=new dnd5e.applications.components.EffectApplicationElement();tray.chatMessage=i.origin;const prepared=await tray._prepareEffectData(profile,actor),data=foundry.utils.mergeObject(profile.toObject(),prepared.data);
   delete data._id;data._stats={...data._stats,duplicateSource:profile.uuid};
   data.start=i.r.start;data.duration={value:3600,units:'seconds',expiry:null,expired:false};foundry.utils.setProperty(data,'flags.spikependium.duelParticipant',{source:i.origin.uuid,token:target.token});
   await actor.createEmbeddedDocuments('ActiveEffect',[data]);
  }
  await i.origin.setFlag('spikependium','duelApplied',[...new Set([...(i.origin.flags.spikependium?.duelApplied??[]),target.token])]);
 }
 }finally{applying.delete(i.origin.uuid);}
}
async function activate(i){const r=region(i),g=geometry(i);if(!r||!g||i.r.targets.some(t=>!insideDuel(g,resolve(t.token))))return false;
 await i.origin.setFlag('spikependium','duelInside',[...r.parent.tokens].filter(t=>t.actor?.system.isCreature&&insideDuel(g,t)).map(t=>t.uuid));
 await i.caster.update({[`flags.spikependium.duelUses.${i.r.event}.bound`]:true});return true;
}
export async function finishDuel(origin){const i=paid(origin,true);if(i?.r.stage!=='cast'||!authority(i.caster))return;await i.caster.update({[`flags.spikependium.duelUses.${i.r.event}.ended`]:true});const r=region(i);if(r)await r.parent.deleteEmbeddedDocuments('Region',[r.id]);}
export async function recordDuelArea(a,_config,result){
 if(stage(a)==='protect'){const i=paid(result?.message);if(i){const t=resolve(i.r.targets[0]?.token);if(t)await protectDuelDeath(t.actor,t,i.origin.uuid,i.r.source);}return;}
 if(stage(a)==='end'){const i=paid(result?.message);if(i)await finishDuel(resolve(i.r.source));return;}
 if(stage(a)!=='cast')return;const i=source(result?.message),r=result?.templates?.[0];if(!i||!r||result.templates.length!==1||r.getFlag('dnd5e','activity')!==a.uuid||!a.actor.isOwner)return;
 await i.origin.setFlag('spikependium','duelArea',r.uuid);if(!await activate(i)){ui.notifications.warn('Все выбранные участники должны находиться в Сфере. Исправьте область: защита пока не выдана.');return;}
 await applyParticipants(source(i.origin));
}
export async function bindDuelArea(a,templates){if(stage(a)!=='cast')return;const i=[...game.messages].toReversed().map(m=>source(m)).find(i=>i?.a.uuid===a.uuid&&!i.origin.flags.spikependium?.duelArea);if(i)await recordDuelArea(a,{}, {message:i.origin,templates});}
export function duelSuppression(wrapped,...args){const native=wrapped(...args),f=this.flags.spikependium;
 if(f?.duelParticipantProfile){const stamp=f.duelParticipant,i=source(resolve(stamp?.source)),token=resolve(stamp?.token);return !i||!i.record.bound||this.system.origin?.message!==i.origin.uuid||token?.actor?.uuid!==this.actor?.uuid||!i.r.targets.some(t=>t.token===token.uuid&&t.actor===this.actor.uuid)||!insideDuel(geometry(i),token)||native;}
 if(f?.duelStabilized)return this.actor.system.attributes.hp.value>0||this.actor.flags.spikependium?.duelBroken?.[f.duelStabilized]===true||this.actor.statuses.has('dead')||native;
 return native;
}
function rescueFrame(m,reason){return {event:foundry.utils.randomID(),actor:m.token.actor.uuid,source:m.i.origin.uuid,sourceEvent:m.i.r.event,token:m.token.uuid,geometry:m.g,from:Object.fromEntries(['x','y','elevation','level'].map(k=>[k,m.token[k]])),reason,time:game.time.worldTime,state:'pending'};}
function pending(actor){return Object.values(actor.flags.spikependium?.duelRescues??{}).filter(r=>{if(!r||!/^[A-Za-z0-9]{16}$/.test(r.event)||!Number.isFinite(r.time)||![r.geometry?.x,r.geometry?.y,r.geometry?.radius,r.geometry?.elevation,r.from?.x,r.from?.y,r.from?.elevation].every(Number.isFinite))return false;const i=paid(resolve(r.source),true);return ['pending','moving'].includes(r.state)&&r.actor===actor.uuid&&i?.r.stage==='cast'&&i.r.event===r.sourceEvent&&i.r.targets.some(t=>t.actor===actor.uuid&&t.token===r.token);});}
function zeroUpdates(actor,updates,frame){updates[`flags.spikependium.duelRescues.${frame.event}`]=frame;updates['system.attributes.death.success']=3;updates['system.attributes.death.failure']=0;updates['flags.spikependium.soulInstantDeath']=0;return updates;}
export function recordDuelZero(actor,changes){
 if(!actor?.isOwner||value(changes,'system.attributes.hp.value')!==0||!(actor.system.attributes.hp.value>0)||actor.statuses.has('dead'))return;
 if(Object.keys(changes).some(k=>k.startsWith('flags.spikependium.duelRescues.'))||foundry.utils.getProperty(changes,'flags.spikependium.duelRescues'))return;
 const m=member(actor);if(m)zeroUpdates(actor,changes,rescueFrame(m,'zero'));
}
export const duelProtects=(actor,token)=>member(actor)?.token.uuid===token?.uuid;
export async function protectDuelDeath(actor,token,cause=null,origin=null){
 if(cause&&Object.values(actor.flags.spikependium?.duelRescues??{}).some(r=>r.cause===cause&&r.actor===actor.uuid&&r.token===token?.uuid))return true;
 const m=member(actor,origin);if(!actor?.isOwner||m?.token.uuid!==token?.uuid)return false;const request=pending(actor).find(r=>r.token===token.uuid)??{...rescueFrame(m,'instant'),cause};await actor.update(zeroUpdates(actor,{'system.attributes.hp.value':0},request));return true;
}
export async function duelDeadCreation(wrapped,data,options,user){const result=await wrapped(data,options,user);if(result===false)return false;const actor=this.parent;if(actor?.documentName!=='Actor'||alreadyDead(actor)||!(actor.system.attributes.hp.value>0)||!(this.statuses.has('dead')||this.system?.type==='dead'))return result;const m=member(actor);if(m&&await protectDuelDeath(actor,m.token))return false;return result;}
export function breakDuelStable(actor,amount,updates){const hp=actor.system.attributes?.hp;if(!hp||!(amount>hp.temp)||hp.value!==0)return;
 for(const e of actor.effects)if(e.flags.spikependium?.duelStabilized&&live(e)){updates[`flags.spikependium.duelBroken.${e.flags.spikependium.duelStabilized}`]=true;updates['system.attributes.death.success']=0;}}
export async function duelDowned(wrapped,...args){const waiting=pending(this).length;if(this.system.attributes?.hp?.value===0&&(waiting||this.system.attributes.death?.failure<3&&this.effects.some(e=>e.flags.spikependium?.duelStabilized&&live(e))))return;return wrapped(...args);}
async function stabilize(actor,r){
 for(const status of ['stable','unconscious']){
  if(status==='stable'&&actor.effects.some(e=>e.flags.spikependium?.duelStabilized===r.event)||status==='unconscious'&&actor.statuses.has(status))continue;
  const effect=await ActiveEffect.implementation.fromStatusEffect(status),data=effect.toObject();data.flags={...data.flags,dnd5e:{...data.flags?.dnd5e,autoDowned:true},spikependium:{...data.flags?.spikependium,...(status==='stable'?{duelStabilized:r.event}:{})}};await actor.createEmbeddedDocuments('ActiveEffect',[data]);
 }
}
export async function finishDuelRescues(){
 for(const actor of actors().values())if(authority(actor))for(const r of pending(actor)){
  if(syncing.has(r.event))continue;syncing.add(r.event);
  try{
   const key=`flags.spikependium.duelRescues.${r.event}`,token=resolve(r.token);
   if(actor.system.attributes.hp.value>0){await actor.update({[`${key}.state`]:'cancelled'});continue;}
   await stabilize(actor,r);
   if(!token||token.actor?.uuid!==actor.uuid){await actor.update({[`${key}.state`]:'manual'});continue;}
   const same=p=>['x','y','elevation','level'].every(k=>token[k]===p[k]);
   if(r.destination&&same(r.destination)){await actor.update({[key]:{...r,state:'done'}});continue;}
   if(!insideDuel(r.geometry,token)){await actor.update({[`${key}.state`]:'manual'});continue;}
   if(!token?.isOwner||token.actor?.uuid!==actor.uuid||token.parent.uuid!==r.geometry.scene||!token.parent.levels.get(r.from.level)||['pending','paused','planned'].includes(token.movement?.state))continue;
   // shortcut: unknown floors and gridless curved boundaries need GM placement; the normal scene grid stays exhaustive at the original elevation.
   if(token.parent.grid.isGridless||token.elevation!==r.from.elevation)continue;
   const destination=r.destination??nearestSoulPrisonSpace(token,r.from,p=>!insideDuel(r.geometry,token,p));
   if(!destination||occupied(token,destination)||insideDuel(r.geometry,token,destination))continue;
   if(!same(destination)){
    if(r.state==='moving')continue;
    await actor.update({[key]:{...r,destination,state:'moving'}});
    const moved=await token.move({...destination,action:'blink'},{constrainOptions:{ignoreWalls:true,ignoreCost:true}});if(!moved||!same(destination))continue;
   }
   await actor.update({[key]:{...r,destination,state:'done'}});
  }finally{syncing.delete(r.event);}
 }
}
export async function duelRegionEvent(wrapped,event){const result=await wrapped(event);if(event.name!==CONST.REGION_EVENTS.TOKEN_ENTER||!game.user.isActiveGM)return result;
 const token=event.data?.token;if(!token?.actor?.system.isCreature)return result;
 for(const origin of game.messages){const i=source(origin);if(!i||region(i)?.uuid!==this.uuid||i.r.targets.some(t=>t.actor===token.actor.uuid&&t.token===token.uuid))continue;
  if(!i.record.bound||!event.data?.movement&&i.origin.flags.spikependium?.duelInside?.includes(token.uuid))continue;
  if(token.elevation===i.r.elevation||insideDuel(geometry(i),token))await finishDuel(origin);
 }
 return result;
}
export async function syncDuels(){
 await finishDuelRescues();
 for(const origin of game.messages){const i=paid(origin,true);if(i?.r.stage!=='cast'||!authority(i.caster)||syncing.has(origin.uuid))continue;syncing.add(origin.uuid);
  try{
   const r=region(i);if(i.record.ended||game.time.worldTime>=i.r.time+3600){if(!i.record.ended)await i.caster.update({[`flags.spikependium.duelUses.${i.r.event}.ended`]:true});if(r)await r.parent.deleteEmbeddedDocuments('Region',[r.id]);continue;}
   if(!r&&origin.flags.spikependium?.duelArea){await i.caster.update({[`flags.spikependium.duelUses.${i.r.event}.ended`]:true});continue;}
   if(!source(origin)||!r)continue;const g=geometry(i);if(!g)continue;
   if(!i.record.bound&&!await activate(i))continue;
   await applyParticipants(source(origin));
   const now=[...r.parent.tokens].filter(t=>t.actor?.system.isCreature&&insideDuel(g,t)).map(t=>t.uuid),previous=origin.flags.spikependium?.duelInside;
   if(previous&&now.some(id=>!previous.includes(id)&&!i.r.targets.some(t=>t.token===id))){await finishDuel(origin);continue;}
   if(JSON.stringify(previous)!==JSON.stringify(now))await origin.setFlag('spikependium','duelInside',now);
  }finally{syncing.delete(origin.uuid);}
 }
 for(const actor of actors().values()){
  if(actor.effects.some(e=>e.flags.spikependium?.duelParticipantProfile||e.flags.spikependium?.duelStabilized))actor.reset();
  if(!authority(actor))continue;
  for(const item of [...actor.items]){const f=item.flags.spikependium,r=actor.flags.spikependium?.duelUses?.[f?.duelRetainedFor]?.data?.[0];if(f?.key!==KEY||!f.duelRetained||!r?.retained||r.stage!=='cast'||r.caster!==actor.uuid||typeof r.activity!=='string'||!r.activity.startsWith(`${item.uuid}.Activity.`)||f.duelRetainedUntil!==r.time+3600||game.time.worldTime<f.duelRetainedUntil||syncing.has(item.uuid))continue;
   syncing.add(item.uuid);try{await actor.deleteEmbeddedDocuments('Item',[item.id]);}finally{syncing.delete(item.uuid);}
  }
 }
}
export function duelDeltaLabel(wrapped,...args){const result=wrapped(...args);if(/^flags\.spikependium\.duelUses\.[A-Za-z0-9]{16}\.active$/.test(this.keyPath))result.label='Место для дуэли: применение';return result;}
