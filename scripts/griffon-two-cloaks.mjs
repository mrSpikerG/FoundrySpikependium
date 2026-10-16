import translations from './data/griffon-cloak-spells.json' with {type:'json'};
import {hasGriffonClass} from './griffon-rings.mjs';
const kind=i=>i?.flags?.spikependium?.griffonCloak;
const resolve=(uuid,actor)=>uuid&&fromUuidSync(uuid,{strict:false,relative:actor});
const canonical=i=>i?.actor?.items?.get(i.id)??i;
const active=i=>!!i&&i.actor?.items.get(i.id)===i&&i.actor.isOwner&&i.system.quantity>0&&i.system.equipped&&(i.system.attunement!=='required'||i.system.attuned)&&hasGriffonClass(i);
const root=(a,config={})=>a?.getLinkedActivity?.(config.cause?.activity)??a;
const allTokens=()=>[...(game.scenes??[])].flatMap(s=>[...s.tokens]);
function source(item,actor=item?.actor){const a=resolve(item?.flags?.dnd5e?.cachedFor,actor);return canonical(a?.item);}
function steedSource(token){const uuid=token.flags?.spikependium?.varionMantle;return uuid?resolve(uuid):source(resolve(token.actor?.flags.dnd5e?.summon?.origin));}
function steeds(item){return allTokens().filter(t=>t.actor?.flags.spikependium?.varionSteed&&steedSource(t)?.uuid===item.uuid);}
export function prepareCloakSummon(activity,profile,config){
 const item=canonical(root(activity)?.item);if(kind(item)!=='varion-mantle')return;
 if(canUseCloak(activity)===false||profile.uuid!==Object.values(translations).find(t=>t.summon)?.summon)return false;
 config.tokenUpdates['flags.spikependium.varionMantle']=item.uuid;
}
export function canUseCloak(activity,config={},_dialog,message){
 const r=root(activity,config),item=canonical(r?.item),id=kind(item);if(!id)return;
 if(!active(item))return false;
 if(id==='varion-mantle'&&r.type==='cast'&&(item.flags.spikependium.varionReadyAt>game.time.worldTime||steeds(item).length)){
  ui.notifications.warn('Скакун уже существует либо после его гибели ещё не прошли двое суток. Существующего скакуна сначала отпустите.');return false;
 }
 if(r.flags?.spikependium?.cloakLanded&&item.system.uses.spent===0)return false;
 if(r.flags?.spikependium?.cloakMode!==undefined&&item.flags.spikependium.cloakBlanket===r.flags.spikependium.cloakMode)return false;
 if(r.flags?.spikependium?.cloakSteedDeath&&item.flags.spikependium.varionReadyAt>game.time.worldTime)return false;
 if(message&&(r.flags?.spikependium?.cloakLanded||r.flags?.spikependium?.cloakSteedDeath||r.flags?.spikependium?.cloakMode!==undefined)){if(message.create===false)return false;message.hasConsumption=true;}
}
export function prepareCloakUpdates(activity,config,updates){
 const r=root(activity,config),item=canonical(r?.item),id=kind(item);if(!id)return updates;
 if(canUseCloak(activity,config)===false)return false;
 for(const c of r.consumption.targets){
  if(c.type!=='itemUses')continue;
  const resource=c.target?item.actor.items.find(i=>`${i.type}:${i.system.identifier}`===c.target):item;
  if(!resource||updates.item.find(i=>i._id===resource.id)?.['system.uses.spent']!==resource.system.uses.spent+Number(c.value))return false;
 }
 const changes={},f=r.flags?.spikependium;
 if(f?.cloakMode!==undefined)changes['flags.spikependium.cloakBlanket']=f.cloakMode;
 if(f?.cloakLanded)changes['system.uses.spent']=0;
 if(f?.cloakSteedDeath)changes['flags.spikependium.varionReadyAt']=game.time.worldTime+172800;
 if(id==='dark-mantle'&&r.type==='cast'){
  const tokens=(item.actor.getActiveTokens?.(false,true)??[]).map(t=>t.document??t).filter(t=>t.parent===canvas.scene),controlled=tokens.filter(t=>t.object?.controlled);
  const token=controlled.length===1?controlled[0]:tokens.length===1?tokens[0]:undefined;
  changes['flags.spikependium.cloakDarkToken']=token?.uuid??'';
  if(!token)ui.notifications.warn('Единственный токен источника тьмы не определён. Расположите тьму вручную.');
 }
 if(Object.keys(changes).length){let update=updates.item.find(i=>i._id===item.id);if(!update)updates.item.push(update={_id:item.id});Object.assign(update,changes);}
 return updates;
}
export function cloakEffectSuppression(wrapped,...args){
 const mode=this.flags.spikependium?.securityMode;
 if(mode&&kind(this.parent)==='security'&&((this.parent.flags.spikependium.cloakBlanket===1)!==(mode==='blanket')))return true;
 return wrapped(...args);
}
export function cloakEffectChange(wrapped,model,change,...args){
 if(model?.documentName==='Actor'&&change.key==='system.attributes.movement.speeds.fly'&&change.effect?.flags.spikependium?.cloakFlight){
  const units=model.system.attributes.movement.units??dnd5e.utils.defaultUnits('length');
  change={...change,value:String(dnd5e.utils.convertLength(30,'ft',units))};
 }
 return wrapped(model,change,...args);
}
export function cloakDeltaLabel(wrapped,...args){
 const result=wrapped(...args),labels={'flags.spikependium.cloakBlanket':'Режим мантии: одеяло','flags.spikependium.varionReadyAt':'Окончание запрета призыва скакуна'};
 if(labels[this.keyPath])result.label=labels[this.keyPath];return result;
}
export function prepareCloakCheck(config,_dialog,message){
 const card=game.messages.get(message.data?.system?.origin),r=root(card?.getAssociatedActivity?.()),item=canonical(r?.item);
 if(!r?.flags?.spikependium?.cloakAdvantage||!kind(item)||!active(item)||r.actor?.uuid!==config.subject?.uuid||r.type!=='check')return;
 for(const roll of config.rolls){const o=roll.options??={};o.disadvantage||=o.advantageMode===-1;o.advantage=true;if(o.advantageMode!==undefined)o.advantageMode=o.disadvantage?0:1;}
}
export async function cloakCachedSpell(wrapped,...args){
 const data=await wrapped(...args),item=canonical(this.item),t=kind(item)&&translations[this.spell.uuid];if(!data||!t)return data;
 data.name=t.name;data.system.description={value:`<p>${t.description}</p><p>Источник предмета: <a href="${item.system.source.custom}">${item.name}</a>.</p>`,chat:''};
 data.system.source={...data.system.source,...item.system.source,license:data.system.source.license};
 for(const a of Object.values(data.system.activities??{})){
  a.name=a.type==='summon'?'Призвать жабу-скакуна':t.name;
  if(a.description?.value)a.description.value=`<p>${t.description}</p>`;
  if(a.type==='summon'&&t.summon)a.profiles=[{...a.profiles[0],uuid:t.summon,name:'Гигантская жаба — скакун',count:'1'}];
 }
 for(const e of data.effects??[])if(e.type!=='enchantment'){e.name=t.name;if(e.description)e.description=`<p>${t.description}</p>`;}
 return data;
}
export async function finishCloakUse(activity,_config,results){
 const item=canonical(activity.item);if(kind(item)!=='varion-mantle'||!activity.flags?.spikependium?.cloakDismiss||!results?.message||!active(item))return;
 for(const token of steeds(item))if(token.isOwner)await token.delete();
}
const deaths=new Set();
export async function recordCloakDeath(document,changes,_options,userId){
 if(game.users.activeGM?!game.user.isActiveGM:!game.user.isGM)return;
 if(changes['system.attributes.hp.value']===undefined&&foundry.utils.getProperty(changes,'system.attributes.hp.value')===undefined)return;
 const actor=document.documentName==='ActorDelta'?document.parent?.actor:document;
 if(!actor?.flags.spikependium?.varionSteed||actor.system.attributes.hp.value>0||actor.flags.spikependium.varionDeathProcessed||deaths.has(actor.uuid))return;
 const token=allTokens().find(t=>t.actor?.uuid===actor.uuid),item=token&&steedSource(token),user=game.users.get(userId);
 if(kind(item)!=='varion-mantle'||!item.isOwner||!actor.isOwner||!user||(!user.isGM&&!item.actor.testUserPermission(user,'OWNER'))
  ||source(resolve(actor.flags.dnd5e?.summon?.origin))?.uuid!==item.uuid)return;
 deaths.add(actor.uuid);
 try{
  const time=actor.flags.spikependium.varionDeathAt??game.time.worldTime;
  if(actor.flags.spikependium.varionDeathAt===undefined)await actor.setFlag('spikependium','varionDeathAt',time);
  await item.setFlag('spikependium','varionReadyAt',Math.max(item.flags.spikependium.varionReadyAt??0,time+172800));
  await actor.setFlag('spikependium','varionDeathProcessed',1);
 }finally{deaths.delete(actor.uuid);}
}
let syncing=false;
function darkness(item){
 return [...(item.actor.concentration?.effects??[])].some(e=>{
  if(!e.active||e.duration?.expired)return false;
  const data=e.getFlag('dnd5e','item'),spell=item.actor.items.get(data?.id)??data?.data;
  return source(spell,item.actor)?.uuid===item.uuid;
 });
}
export async function syncCloaks(){
 if(syncing||(game.users.activeGM?!game.user.isActiveGM:!game.user.isGM))return;syncing=true;
 try{
  const tokens=allTokens();
  for(const token of tokens){
   const actor=token.actor;if(!actor?.flags.spikependium?.varionSteed)continue;
   if(deaths.has(actor.uuid))continue;
   const item=steedSource(token);
   // shortcut: historical death needs the owner's confirmation button; only authorized HP events start the automatic timer.
   if(kind(item)!=='varion-mantle'){if(token.flags?.spikependium?.varionMantle&&token.isOwner)await token.delete();continue;}
   if(item.system.attuned&&actor.system.attributes.hp.value<=0&&!actor.flags.spikependium.varionDeathProcessed&&!(item.flags.spikependium.varionReadyAt>game.time.worldTime))continue;
   if((!item.system.attuned||actor.system.attributes.hp.value<=0)&&token.isOwner)await token.delete();
  }
  const actors=new Map([...(game.actors??[]),...tokens.map(t=>t.actor)].filter(Boolean).map(a=>[a.uuid,a]));
  const cloaks=[...actors.values()].flatMap(a=>[...a.items]).filter(i=>kind(i)==='dark-mantle'&&active(i)&&darkness(i));
  for(const scene of game.scenes??[]){
   const desired=new Map();
   for(const item of cloaks){
    const token=resolve(item.flags.spikependium.cloakDarkToken);if(token?.parent!==scene||token.actor?.uuid!==item.actor.uuid||!(scene.grid.units in CONFIG.DND5E.movementUnits))continue;
    const radius=dnd5e.utils.convertLength(15,'ft',scene.grid.units);
    desired.set(item.uuid,{x:token.x+token.width*scene.grid.size/2,y:token.y+token.height*scene.grid.size/2,config:{negative:true,bright:radius,dim:radius,angle:360,attenuation:0,priority:0},flags:{spikependium:{cloakDarkness:item.uuid}}});
   }
   const seen=new Set();
   for(const light of scene.lights){const key=light.flags.spikependium?.cloakDarkness;if(!key)continue;const data=desired.get(key);if(!data||seen.has(key)){await light.delete();continue;}seen.add(key);if(light.x!==data.x||light.y!==data.y||Object.entries(data.config).some(([k,v])=>light.config[k]!==v))await light.update(data);}
   for(const[key,data]of desired)if(!seen.has(key))await scene.createEmbeddedDocuments('AmbientLight',[data]);
  }
 }finally{syncing=false;}
}
