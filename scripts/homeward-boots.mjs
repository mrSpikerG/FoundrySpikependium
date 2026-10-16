const home=i=>i?.flags?.spikependium?.griffonBoots==='homeward';
const canonical=i=>i?.actor?.items?.get?.(i.id)??i;
const resolve=uuid=>uuid&&fromUuidSync(uuid,{strict:false});
const f=i=>i.flags.spikependium;
const requests=i=>Object.entries(f(i).homeRequests??{});
const path=n=>`flags.spikependium.homeRequests.${n}`;
const command=a=>a.flags?.spikependium?.homewardCommand;
const allTokens=()=>[...(game.scenes??[])].flatMap(s=>[...s.tokens]);
const actors=()=>new Map([...(game.actors??[]),...allTokens().map(t=>t.actor)].filter(Boolean).map(a=>[a.uuid,a]));
const items=()=>[...actors().values()].flatMap(a=>[...a.items]).filter(home);
const regionTag=r=>r?.flags?.spikependium?.homeward;
const regions=()=>[...(game.scenes??[])].flatMap(s=>[...(s.regions??[])]);
const worn=i=>i?.actor?.isOwner&&i.actor.items.get(i.id)===i&&i.system.quantity===1&&i.system.equipped&&i.system.attuned&&i.system.magicAvailable!==false;
const unique=i=>!f(i).homeKey||items().filter(p=>f(p).homeKey===f(i).homeKey).length===1;
const pending=i=>requests(i).some(([,r])=>r.key===f(i).homeKey&&r.paid===1&&!['done','cancelled'].includes(r.state));
const signature=r=>JSON.stringify([r.shapes,r.levels instanceof Set?[...r.levels]:r.levels,r.elevation]);
const prepared=new WeakMap(),using=new Set();let syncing=false,again=false;
function tokenFor(actor){
 const tokens=(actor.getActiveTokens?.(false,true)??[]).map(t=>t.document??t).filter(t=>t.parent===canvas.scene&&t.actor?.uuid===actor.uuid);
 if(actor.token?.parent===canvas.scene&&!tokens.includes(actor.token))tokens.push(actor.token);
 const selected=tokens.filter(t=>t.object?.controlled);return selected.length===1?selected[0]:tokens.length===1?tokens[0]:undefined;
}
function frame(t){const scene=t?.parent;if(!scene?.levels.get(t.level)||!Number.isFinite(scene.grid.size)||!(scene.grid.distance>0)||!(scene.grid.units in CONFIG.DND5E.movementUnits))return;
 const center=t.getCenterPoint({x:t.x,y:t.y});if(![center.x,center.y,t.x,t.y,t.elevation].every(Number.isFinite))return;
 return{token:t.uuid,scene:scene.uuid,level:t.level,x:center.x,y:center.y,left:t.x,top:t.y,elevation:t.elevation,actor:t.actor.id};
}
function sameToken(t,p){return t?.isOwner&&t.actor?.id===p.actor&&t.parent.uuid===p.scene&&t.level===p.level&&t.x===p.left&&t.y===p.top&&t.elevation===p.elevation&&!['planned','pending','paused'].includes(t.movement?.state);}
function anchor(i,uuid=f(i).homeAnchor){const r=resolve(uuid);return r&&r.parent?.regions.get(r.id)===r&&regionTag(r)?.key===f(i).homeKey&&regionTag(r).kind==='anchor'?r:undefined;}
function validPlan(i,p){
 if(!p?.frame||!/^[A-Za-z0-9]{16}$/.test(p.key)||!/^[A-Za-z0-9]{16}$/.test(p.nonce)||!['anchor','return'].includes(p.command))return false;
 if(!worn(i)||!unique(i)||(f(i).homeKey&&p.key!==f(i).homeKey)||!sameToken(resolve(p.frame.token),p.frame)||pending(i))return false;
 if(p.command==='anchor')return p.prior===(f(i).homeAnchor??'');
 const a=anchor(i,p.anchor);return p.command==='return'&&game.time.worldTime===p.time&&a&&signature(a)===p.anchorSignature&&p.anchor===(f(i).homeAnchor??'');
}
export function canUseHomeward(activity,config={},_dialog,message){
 const i=canonical(activity?.item),c=command(activity);if(!home(i)||!c)return;
 const p=config.spikependium?.homeward;
 if(!game.users.activeGM&&!game.user.isGM){ui.notifications.warn('Для создания круга и возвращения нужен подключённый Мастер.');return false;}
 if(p?.command!==c||!validPlan(i,p)){ui.notifications.warn('Нужны надетые настроенные сапоги, один выбранный токен и действующий собственный круг; незавершённое возвращение сначала разрешает Мастер.');return false;}
 if(message){if(message.create===false)return false;message.hasConsumption=true;message.rollMode='gm';message.data??={};message.data.whisper=game.users.filter(u=>u.isGM||i.actor.testUserPermission(u,'OWNER')).map(u=>u.id);}
}
export async function homewardUse(wrapped,config={},dialog={},message={}){
 const i=canonical(this.item),c=command(this);if(!home(i)||!c)return wrapped(config,dialog,message);
 if(using.has(i.uuid))return;using.add(i.uuid);
 try{
  const token=tokenFor(i.actor),point=frame(token);if(!point){ui.notifications.warn('Выберите единственный токен носителя на текущей сцене с корректным уровнем и единицами.');return;}
  const a=anchor(i),plan={key:f(i).homeKey||foundry.utils.randomID(),nonce:foundry.utils.randomID(),command:c,frame:point,prior:f(i).homeAnchor??'',anchor:a?.uuid??'',anchorSignature:a?signature(a):'',time:game.time.worldTime};
  config={...config,spikependium:{...config.spikependium,homeward:plan}};
  if(canUseHomeward(this,config,dialog,message)===false)return;
  const result=await wrapped(config,dialog,message);if(result?.message)await resumeHomeward();return result;
 }catch(error){ui.notifications.error('Применение Сапог возвращения прервано. Перед повтором проверьте карточку, круг и расход: часть операции могла сохраниться.');throw error;}finally{using.delete(i.uuid);}
}
export function prepareHomewardUpdates(activity,config,updates){
 prepared.delete(activity);const i=canonical(activity.item),c=command(activity);if(!home(i)||!c)return updates;
 if(canUseHomeward(activity,config)===false)return false;const p=config.spikependium.homeward;
 let update=updates.item.find(u=>u._id===i.id);if(!update)updates.item.push(update={_id:i.id});
 let cooldown='',days=0;
 if(c==='return'){
  const rolls=updates.rolls.filter(r=>r instanceof CONFIG.Dice.BasicRoll&&r._evaluated&&r.formula==='1d3');
  if(update['system.uses.spent']!==i.system.uses.spent+1||rolls.length!==1||!Number.isInteger(rolls[0].total)||rolls[0].total<1||rolls[0].total>3)return false;
  days=rolls[0].total;cooldown=Object.keys(update).find(k=>/^flags\.spikependium\.griffonCooldowns\.[A-Za-z0-9]{16}\.paid$/.test(k)&&update[k]===1)??'';if(!cooldown)return false;
 }
 Object.assign(update,{'flags.spikependium.homeKey':p.key,[path(p.nonce)]:{...p,paid:1,state:'pending',item:i.id,activity:activity.id,cooldown,days}});prepared.set(activity,{key:p.key,nonce:p.nonce,item:i.id});return updates;
}
export function recordHomewardConsumption(activity,_config,message){
 const p=prepared.get(activity);prepared.delete(activity);if(!p)return;
 foundry.utils.setProperty(message,'data.flags.spikependium.homeward',p);const deltas=(((message.data.system??={}).deltas??={}).item??={})[p.item]??=[];
 if(!deltas.some(d=>d.keyPath===`${path(p.nonce)}.paid`))deltas.push({keyPath:`${path(p.nonce)}.paid`,delta:1});
}
function receipt(i,n,r){
 if(r.paid!==1)return;
 return [...game.messages].find(m=>m.type==='usage'&&m.flags?.spikependium?.homeward?.key===r.key&&m.flags.spikependium.homeward.nonce===n&&m.flags.spikependium.homeward.item===i.id&&m.author&&i.actor.testUserPermission(m.author,'OWNER')
  &&m.system.deltas?.item?.[i.id]?.some(d=>d.keyPath===`${path(n)}.paid`&&d.delta===1)
  &&(r.command!=='return'||m.system.deltas.item[i.id].some(d=>d.keyPath===r.cooldown&&d.delta===1)&&m.rolls?.filter(d=>d instanceof CONFIG.Dice.BasicRoll&&d._evaluated&&d.formula==='1d3'&&d.total===r.days).length===1));
}
function regionData(i,n,r,kind){
 const scene=resolve(r.frame.scene),point=r.frame,feet=kind==='anchor'?5:2.5,radius=dnd5e.utils.convertLength(feet,'ft',scene.grid.units)*scene.grid.size/scene.grid.distance;
 return{name:kind==='anchor'?'Сапоги возвращения: постоянный круг':'Сапоги возвращения: портал 5 футов',color:'#8b6543',levels:[point.level],shapes:[{type:'circle',x:point.x,y:point.y,radius}],elevation:{bottom:point.elevation,top:point.elevation,topInclusive:true},flags:{spikependium:{homeward:{key:r.key,nonce:n,kind,created:game.time.worldTime}}}};
}
async function materialize(i,n,r,kind){
 const existing=regions().filter(a=>regionTag(a)?.key===r.key&&regionTag(a).nonce===n&&regionTag(a).kind===kind);if(existing.length>1)throw Error('Найдено несколько кругов одного применения');if(existing.length)return existing[0];
 const scene=resolve(r.frame.scene);if(!scene?.levels.get(r.frame.level))throw Error('Исходная сцена или уровень недоступны');
 const [a]=await scene.createEmbeddedDocuments('Region',[regionData(i,n,r,kind)]);if(!a)throw Error('Круг не создан');return a;
}
function expiry(i){
 const combat=game.combat,turns=combat?.turns??[],index=turns.findIndex(c=>c.actor?.uuid===i.actor.uuid);
 return combat?.started&&index>=0?{combat:combat.id,round:combat.round+(index<=combat.turn?1:0),combatant:turns[index].id,fallback:game.time.worldTime+6}:{time:game.time.worldTime+6};
}
function expired(expires){
 if(expires.time!==undefined)return game.time.worldTime>=expires.time;
 const combat=game.combats?.get(expires.combat),index=combat?.turns.findIndex(c=>c.id===expires.combatant)??-1;if(!combat?.started||index<0)return game.time.worldTime>=expires.fallback;return combat.round>expires.round||combat.round===expires.round&&combat.turn>index;
}
async function finishArrival(i,n,r,token){
 const current=token.actor.items.get(i.id);if(!home(current)||f(current).homeKey!==r.key||f(current).homeRequests?.[n]?.paid!==1)throw Error('После переноса не найдены исходные сапоги');
 const cooldown=r.cooldown.slice(0,-5),portal=regions().find(a=>regionTag(a)?.key===r.key&&regionTag(a).nonce===n&&regionTag(a).kind==='portal'),a=anchor(current,r.anchor);
 if(portal&&a&&!portal.behaviors.some(b=>b.type==='teleportToken'))await portal.createEmbeddedDocuments('RegionBehavior',[{name:'В свой постоянный круг',type:'teleportToken',system:{destinations:[a.uuid]}}]);
 const at=token.flags.spikependium.homeArrival.at;
 await current.update({[`${path(n)}.state`]:'done',[`${path(n)}.arrived`]:token.uuid,[`${path(n)}.arrivedAt`]:at,[`${cooldown}.until`]:at+r.days*86400,'system.uses.spent':1});
}
async function process(i,n,r){
 if(['done','cancelled','manual'].includes(r.state))return;
 if(r.paid!==1){await i.update({[`${path(n)}.state`]:'cancelled'});return;}
 if(!receipt(i,n,r)){
  // Item updates reach other clients before the usage card; absence alone is not a failed publication.
  if(![...game.messages].some(m=>m.author&&i.actor.testUserPermission(m.author,'OWNER')&&m.flags?.spikependium?.homeward?.key===r.key&&m.flags.spikependium.homeward.nonce===n))return;
  await i.update({[`${path(n)}.state`]:'manual'});ui.notifications.warn('Карточка Сапог возвращения изменена или не подтверждает расход. Круг и перенос автоматически не повторяются; проверьте применение с Мастером.');return;
 }
 if(r.command==='anchor'){
  const a=await materialize(i,n,r,'anchor');if(f(i).homeAnchor!==a.uuid||r.state!=='anchorCleanup')await i.update({'flags.spikependium.homeAnchor':a.uuid,[`${path(n)}.state`]:'anchorCleanup'});
  const previous=resolve(r.prior);if(previous&&previous!==a&&regionTag(previous)?.key===r.key&&regionTag(previous).kind==='anchor')await previous.delete();await i.update({[`${path(n)}.state`]:'done'});return;
 }
 const arrived=allTokens().filter(t=>t.flags.spikependium?.homeArrival?.key===r.key&&t.flags.spikependium.homeArrival.nonce===n);
 if(arrived.length===1){const old=resolve(r.frame.token);if(old&&old!==arrived[0]&&old.parent.tokens.get(old.id)===old)throw Error('Исходный токен всё ещё существует после межсценового переноса');await finishArrival(i,n,r,arrived[0]);return;}
 if(arrived.length||r.state==='moving')throw Error('Результат предшествующего переноса не подтверждён; повторный перенос отключён');
 const source=resolve(r.frame.token),a=anchor(i,r.anchor);if(!worn(i)||!a||signature(a)!==r.anchorSignature||!sameToken(source,r.frame)||game.time.worldTime!==r.time)throw Error('Круг, токен или время применения изменились до переноса');
 const portal=await materialize(i,n,r,'portal');if(!portal.flags.spikependium.homeward.expires)await portal.setFlag('spikependium','homeward.expires',expiry(i));
 if(!anchor(i,r.anchor)||signature(a)!==r.anchorSignature||!sameToken(source,r.frame))throw Error('Круг или токен изменились при создании портала');
 await i.update({[`${path(n)}.state`]:'moving'});
 // Core owns cross-scene Token/ActorDelta preservation; the arrival marker is part of its token update.
 const moved=await a.teleportTokens([source],{level:[...a.levels][0],placement:'random',snap:true,avoidOccupied:true,pan:true,updateData:new Map([[source,{flags:{spikependium:{homeArrival:{key:r.key,nonce:n,at:game.time.worldTime}}}}]])});
 const target=moved?.get(source);if(!target)throw Error('Foundry не подтвердил перенос');await finishArrival(i,n,r,target);
}
export async function resumeHomeward(){
 if(game.users.activeGM?!game.user.isActiveGM:!game.user.isGM)return;if(syncing){again=true;return;}syncing=true;
 try{do{again=false;
  for(const i of items())if(i.actor.isOwner&&unique(i))for(const[n,r]of requests(i))if(r.key===f(i).homeKey&&!['done','cancelled','manual'].includes(r.state)){
   try{await process(i,n,r);}catch(error){
    const current=items().find(p=>f(p).homeKey===r.key)??i,arrived=allTokens().filter(t=>t.flags.spikependium?.homeArrival?.key===r.key&&t.flags.spikependium.homeArrival.nonce===n),old=resolve(r.frame.token);
    const resumable=r.command==='anchor'&&regions().some(a=>regionTag(a)?.key===r.key&&regionTag(a).nonce===n&&regionTag(a).kind==='anchor')||arrived.length===1&&(!old||old===arrived[0]);
    if(!resumable)try{await current.update({[`${path(n)}.state`]:'manual'});}catch(write){console.error('Spikependium: отметка прерванного возвращения',write);}
    ui.notifications.error('Круг или возвращение не завершены. Перенос и расход могли сохраниться: проверьте токены и карточку с Мастером перед повтором.');console.error('Spikependium: Сапоги возвращения',error);
   }
  }
  for(const portal of regions())if(regionTag(portal)?.kind==='portal'&&regionTag(portal).expires&&expired(regionTag(portal).expires))await portal.delete();
 }while(again);}finally{syncing=false;}
}
export function homewardDeltaLabel(wrapped,...args){const result=wrapped(...args);if(/^flags\.spikependium\.homeRequests\.[A-Za-z0-9]{16}\.paid$/.test(this.keyPath))result.label='Применение Сапог возвращения';return result;}
export async function forgetHomewardCard(card){
 const tag=card.flags?.spikependium?.homeward;if(!tag||(game.users.activeGM?!game.user.isActiveGM:!game.user.isGM))return;
 for(const i of items())if(f(i).homeKey===tag.key&&card.author&&i.actor.testUserPermission(card.author,'OWNER')&&card.system.deltas?.item?.[i.id]?.some(d=>d.keyPath===`${path(tag.nonce)}.paid`&&d.delta===1)){const r=f(i).homeRequests?.[tag.nonce];if(r?.paid===1&&!['done','cancelled','manual'].includes(r.state)){await i.update({[`${path(tag.nonce)}.state`]:'manual'});ui.notifications.warn('Исходная карточка Сапог возвращения удалена. Незавершённое применение проверьте с Мастером; автоматического повторного переноса нет.');}}
}
