import { incapacitated } from "./effects.mjs";

const KEY="feat:au-spell-trickster",prepared=new WeakMap(),captured=new WeakMap(),using=new Set(),applying=new Set(),resolving=new Set();
// shortcut: cover and later discovery have no authoritative scene data; keep the GM confirmation until the scene can prove them.
const resolve=id=>typeof id==="string"?(game.messages.get(id)??(id.includes(".")?fromUuidSync(id,{strict:false}):undefined)):undefined;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),root=event=>`flags.spikependium.spellTrickCasts.${event}`;
const feature=actor=>actor?.items?.find?.(i=>i.flags?.spikependium?.key===KEY);
const escape=a=>a?.item?.flags?.spikependium?.key===KEY&&a.flags.spikependium?.spellTrickEscape;
const resolveAction=a=>a?.item?.flags?.spikependium?.key===KEY&&a.flags.spikependium?.spellTrickResolve;
const live=e=>e.active&&!e.duration?.expired&&!(Number.isFinite(e.duration?.remaining)&&e.duration.remaining<=0);
const writer=actor=>actor?.isOwner&&(game.users.activeGM?game.user.isActiveGM:[...game.users].filter(u=>u.active&&actor.testUserPermission(u,"OWNER")).sort((a,b)=>a.id.localeCompare(b.id))[0]?.id===game.user.id);
const actors=()=>[...new Map([...(game.actors??[]),...[...(game.scenes??[])].flatMap(s=>[...(s.tokens??[])].map(t=>t.actor))].filter(Boolean).map(a=>[a.uuid,a])).values()];
const effectIds=actor=>trickHidingEffects(actor).map(e=>e.uuid);
function ability(item){const a=item?.system.advancement.find(a=>a.type==="AbilityScoreImprovement")?.value.assignments??{};const keys=Object.keys(a).filter(k=>a[k]>0);return keys.length===1&&a[keys[0]]===1&&["int","wis","cha"].includes(keys[0])?keys[0]:null;}
export function trickItemRollData(wrapped,...args){const data=wrapped(...args);if(this.flags.spikependium?.key===KEY)data.spikependiumSpellTrickUses=Math.max(0,this.actor?.system.abilities[ability(this)]?.mod??0);return data;}
function phase(actor){
 const combats=[...game.combats].filter(c=>c.started&&c.getCombatantsByActor(actor).length),c=combats.includes(game.combat)?game.combat:combats.length===1?combats[0]:null;
 if(!c)return combats.length?undefined:null;
 if(c.combatant?.actor?.uuid!==actor.uuid)return;
 return{combat:c.uuid,round:c.round,turn:c.turn,combatant:c.combatant.id};
}
const actionSpell=a=>a?.item?.type==="spell"&&a.item.system.level>0&&a.consumption?.spellSlot===true&&a.activation.type==="action"&&(a.activation.value==null||a.activation.value===1);
function castInfo(message){
 const r=message?.flags.spikependium?.spellTrickCast,a=message?.getAssociatedActivity?.(),actor=a?.actor,saved=actor?.flags.spikependium?.spellTrickCasts?.[r?.event];
 if(message?.type!=="usage"||!r||!saved||saved.active!==1||!/^[A-Za-z0-9]{16}$/.test(r.event)||!actionSpell(a)||actor.uuid!==r.actor||a.uuid!==r.activity
  ||!message.author||!actor.testUserPermission(message.author,"OWNER")||!equal(r,saved.data?.[0])
  ||!message.system.deltas?.actor?.some(d=>d.keyPath===`${root(r.event)}.active`&&d.delta===1)
  ||!message.system.deltas.actor.some(d=>d.keyPath===r.slot&&d.delta===-1))return;
 return{r,saved,a,actor,message};
}
function choices(a){
 if(!escape(a)||!a.actor.isOwner||!a.actor.items.has(a.item.id)||incapacitated(a.actor)||!ability(a.item)||!(a.actor.system.attributes.hp.value>0)||phase(a.actor)===undefined)return [];
 return [...game.messages].map(castInfo).filter(i=>i?.actor.uuid===a.actor.uuid&&i.saved.spent===0&&i.r.time===game.time.worldTime&&equal(i.r.phase,phase(a.actor))
  &&i.message.isContentVisible!==false&&(game.user.isGM||!i.message.blind&&(!i.message.whisper?.length||i.message.whisper.includes(game.user.id)||i.message.author.id===game.user.id)));
}
export function prepareTrickDialog(a,config,dialog,message){
 const sneaky=a?.item?.type==="spell"&&verbal(a)&&sneakyMark(a.actor,a);
 if(!escape(a)&&!sneaky)return;
 const Base=dialog.applicationClass;dialog.configure=true;if(escape(a)){config.hasConsumption=true;message.hasConsumption=true;}
 if(escape(a))config.spikependium={...config.spikependium,spellTrickSource:config.spikependium?.spellTrickSource??choices(a).at(-1)?.message.uuid??""};
 else config.spikependium={...config.spikependium,sneakyCasting:config.spikependium?.sneakyCasting??promised(a.actor)};
 dialog.applicationClass=class extends Base{async _prepareConsumptionContext(context,options){context=await super._prepareConsumptionContext(context,options);
  if(escape(a))context.fields.push({name:"spikependium.spellTrickSource",value:this.config.spikependium.spellTrickSource,field:new foundry.data.fields.StringField({label:"Сотворённое заклинание за ячейку",choices:Object.fromEntries(choices(a).map(i=>[i.message.uuid,i.a.item.name]))})});
  else context.fields.push({name:"spikependium.sneakyCasting",value:this.config.spikependium?.sneakyCasting??false,field:new foundry.data.fields.BooleanField({label:"Подлое сотворение: намерен завершить свой ход за Укрытием на три четверти или Полным укрытием"}),input:context.inputs.createCheckboxInput});
  context.hasConsumption=true;return context;}
 };
}
export function trickRequiresDialog(wrapped,config){return !!(escape(this)||this.item?.type==="spell"&&verbal(this)&&sneakyMark(this.actor,this))||wrapped(config);}
export function captureTrick(a,config,message){
 captured.delete(a);if(!escape(a))return;
 const i=choices(a).find(i=>i.message.uuid===config.spikependium?.spellTrickSource);
 if(!i||config.consume===false||config.consume?.action===false||message.create===false||message.message){ui.notifications.warn("Скрывающие заклинания требуют нового применения, завершённого выбора характеристики и оплаченного заклинания за одно действие в этом же ходу.");return false;}
 if(i.message.whisper?.length){const ids=message.data?.whisper?.length?message.data.whisper.filter(id=>i.message.whisper.includes(id)):[...i.message.whisper];if(!ids.length)return false;foundry.utils.setProperty(message,"data.whisper",ids);message.rollMode="gm";}
 if(i.message.blind){foundry.utils.setProperty(message,"data.blind",true);message.rollMode="blind";}
 captured.set(a,{source:i.message.uuid,event:i.r.event});
}
export function prepareTrickUpdates(a,config,updates){
 prepared.delete(a);
 if(escape(a)){
  const capture=captured.get(a),i=choices(a).find(i=>i.message.uuid===config.spikependium?.spellTrickSource);
  const expense=updates.item.find(u=>u._id===a.item.id)?.["system.uses.spent"];
  if(!capture||!i||capture.source!==i.message.uuid||capture.event!==i.r.event||expense!==a.item.system.uses.spent+1)return false;
  updates.actor[`${root(i.r.event)}.spent`]=1;prepared.set(a,{escape:{source:i.message.uuid,event:i.r.event,actor:a.actor.uuid,activity:a.uuid,phase:i.r.phase,time:game.time.worldTime}});return updates;
 }
 if(!actionSpell(a)||!feature(a.actor)||config.consume===false||config.consume?.spellSlot===false||phase(a.actor)===undefined)return updates;
 const slots=Object.entries(foundry.utils.flattenObject(updates.actor)).filter(([p,n])=>/^system\.spells\.(spell[1-9]|pact)\.value$/.test(p)&&Number.isFinite(n)&&foundry.utils.getProperty(a.actor,p)-n===1);
 if(slots.length!==1)return updates;
 const event=foundry.utils.randomID(),r={event,actor:a.actor.uuid,activity:a.uuid,slot:slots[0][0],phase:phase(a.actor),time:game.time.worldTime};
 updates.actor[root(event)]={active:1,spent:0,data:[r]};prepared.set(a,{cast:r});return updates;
}
export function recordTrickConsumption(a,_config,message){
 const p=prepared.get(a);prepared.delete(a);captured.delete(a);if(!p)return;
 const r=p.cast??p.escape,key=`${root(r.event)}.${p.cast?'active':'spent'}`;
 if(foundry.utils.getProperty(a.actor,key)!==1)return;
 const deltas=((message.data.system??={}).deltas??={}).actor??=[];if(!deltas.some(d=>d.keyPath===key))deltas.push({keyPath:key,delta:1});
 foundry.utils.setProperty(message,`data.flags.spikependium.${p.cast?'spellTrickCast':'spellTrickEscape'}`,r);
}
export function trickHideValid(origin){
 const a=origin?.getAssociatedActivity?.();if(!escape(a))return !origin?.flags.spikependium?.spellTrickEscape;
 const r=origin.flags.spikependium?.spellTrickEscape,i=castInfo(resolve(r?.source));
 return !!(r&&i&&i.r.event===r.event&&i.actor.uuid===a.actor.uuid&&r.actor===a.actor.uuid&&r.activity===a.uuid&&i.saved.spent===1
  &&equal(r.phase,i.r.phase)&&r.time===i.r.time&&origin.author&&a.actor.testUserPermission(origin.author,"OWNER")
  &&origin.system.deltas?.actor?.some(d=>d.keyPath===`${root(r.event)}.spent`&&d.delta===1)
  &&origin.system.deltas.item?.[a.item.id]?.some(d=>d.keyPath==="system.uses.spent"&&d.delta===1));
}
export async function syncTrickDash(origin){
 const a=origin?.getAssociatedActivity?.();if(origin?.type!=="usage"||!escape(a)||!writer(a.actor)||applying.has(origin.uuid))return;
 const actor=a.actor,existing=actor.effects.filter(e=>e.flags.spikependium?.spellTrickDash?.origin===origin.uuid),r=origin.flags.spikependium?.spellTrickEscape;
 if(!trickHideValid(origin)||!r||r.time!==game.time.worldTime||!equal(r.phase,phase(actor))){if(existing.length)await actor.deleteEmbeddedDocuments("ActiveEffect",existing.map(e=>e.id));return;}
 if(existing.length||origin.flags.spikependium?.spellTrickDashApplied)return;
 const source=a.applicableEffects.find(e=>e.flags.spikependium?.spellTrickDashTemplate);if(!source)return;
 applying.add(origin.uuid);
 try{const tray=new dnd5e.applications.components.EffectApplicationElement();tray.chatMessage=origin;const {action,data}=await tray._prepareEffectData(source,actor);
  if(!trickHideValid(origin)||!equal(r.phase,phase(actor)))return;
  data.flags.spikependium??={};data.flags.spikependium.spellTrickDash={origin:origin.uuid};data.system.magical=false;data.duration={value:null,units:"seconds",expiry:null};
  await foundry.documents.modifyBatch([{action,documentName:"ActiveEffect",parent:actor,...(action==="create"?{data:[data]}:{updates:[data]})},
   {action:"update",documentName:"ChatMessage",updates:[{_id:origin.id,"flags.spikependium.spellTrickDashApplied":true}]}]);
 }finally{applying.delete(origin.uuid);}
}
export async function trickUse(wrapped,config={},dialog={},message={}){
 if(resolveAction(this)){await resolveSneaky(this.actor);return;}
 if(!escape(this))return wrapped(config,dialog,message);
 if(using.has(this.actor.uuid)||!choices(this).length){ui.notifications.warn("Нет доступного сотворения за ячейку в этом ходу либо применение уже открыто.");return;}
 using.add(this.actor.uuid);
 try{return await wrapped({...config,consume:config.consume===false?false:{...config.consume,action:config.consume?.action??true}},dialog,message);}finally{using.delete(this.actor.uuid);}
}
export function trickHidingEffects(actor){return actor?.effects?.filter(e=>live(e)&&(e.flags.spikependium?.cunningHide||feature(actor)&&e.statuses?.has?.("hiding")))??[];}
function activeSneaky(actor){return feature(actor)&&(actor.appliedEffects??actor.effects).some(e=>e.flags.spikependium?.spellTrickSneaky&&live(e));}
const verbal=a=>a.item.system.properties?.has?.("vocal")||a.item.system.properties?.includes?.("vocal");
function sneakyMark(actor,a){
 const p=actor&&phase(actor),effects=actor&&effectIds(actor);
 if(!actor?.isOwner||!activeSneaky(actor)||!p||!effects?.length)return;
 return{actor:actor.uuid,activity:a.uuid,phase:p,time:game.time.worldTime,epoch:actor.flags.spikependium?.hideEpoch??0,effects};
}
function promised(actor){const r=actor?.flags.spikependium?.spellTrickSneaky;return !!(r&&!r.resolved&&Array.isArray(r.effects)&&equal(r.phase,phase(actor))&&r.epoch===(actor.flags.spikependium?.hideEpoch??0)&&effectIds(actor).some(id=>r.effects.includes(id)));}
async function keep(actor,mark){
 const current=sneakyMark(actor,{uuid:mark?.activity});if(!mark||!current||!equal(current,mark))return false;
 const previous=actor.flags.spikependium?.spellTrickSneaky;
 const effects=previous&&!previous.resolved&&equal(previous.phase,mark.phase)?[...new Set([...previous.effects,...mark.effects])]:mark.effects;
 await actor.update({"flags.spikependium.spellTrickSneaky":{...mark,effects,resolved:false,decision:null}});return true;
}
export async function keepSneakySpell(a,config,results){
 if(a?.item?.type!=="spell"||!verbal(a)||config?.spikependium?.sneakyCasting!==true||results?.message?.type!=="usage"||!results.message.author
  ||!a.actor.testUserPermission(results.message.author,"OWNER")||results.message.getAssociatedActivity?.()?.uuid!==a.uuid)return false;
 return keep(a.actor,sneakyMark(a.actor,a));
}
const spellAttack=a=>["msak","rsak"].includes(a?.getActionType?.());
export function prepareSneakyAttack(config,dialog){
 const a=config.subject;if(!spellAttack(a)||!sneakyMark(a.actor,a))return;
 config.spikependium={...config.spikependium,sneakyCasting:config.spikependium?.sneakyCasting??promised(a.actor)};
 const Base=dialog.applicationClass??CONFIG.Dice.D20Roll.DefaultConfigurationDialog;dialog.configure=true;
 dialog.applicationClass=class extends Base{async _prepareConfigurationContext(context,options){context=await super._prepareConfigurationContext(context,options);
  context.fields.push({name:"spikependium.sneakyCasting",value:this.config.spikependium?.sneakyCasting??false,field:new foundry.data.fields.BooleanField({label:"Подлое сотворение: завершу свой ход за Укрытием на три четверти или Полным укрытием"}),input:context.inputs.createCheckboxInput});return context;}
  _buildConfig(roll,formData,index){roll=super._buildConfig(roll,formData,index);this.config.spikependium={...this.config.spikependium,sneakyCasting:formData?.get("spikependium.sneakyCasting")??this.config.spikependium?.sneakyCasting};return roll;}
 };
}
export function finalizeSneakyAttack(rolls,config){
 if(config.spikependium?.sneakyCasting!==true){if(config.spikependium?.sneakyCasting===false)for(const roll of rolls)roll.options.spikependiumSneakyCasting=false;return;}
 const a=config.subject,mark=spellAttack(a)&&sneakyMark(a.actor,a);
 if(!mark||rolls.some(r=>r._evaluated)){ui.notifications.warn("Подлое сотворение требует действующей Засады в вашем текущем ходу. Повторите бросок с актуальными условиями.");return false;}
 for(const roll of rolls)roll.options.spikependiumSneakyCasting=structuredClone(mark);
}
export async function keepSneakyAttack(rolls,a){
 const evaluated=rolls.filter(r=>r._evaluated),saved=evaluated[0]?.options?.spikependiumSneakyCasting;
 const mark=saved??(promised(a?.actor)?sneakyMark(a.actor,a):null);
 if(saved===false||evaluated.some(r=>r.options?.spikependiumSneakyCasting===false))return false;
 if(!spellAttack(a)||!mark||mark.activity!==a.uuid||!evaluated.length||saved&&evaluated.some(r=>!equal(r.options?.spikependiumSneakyCasting,mark)))return false;
 return keep(a.actor,mark);
}
export async function resolveSneaky(actor){
 const r=actor?.flags.spikependium?.spellTrickSneaky;if(!writer(actor)||!r||r.resolved||resolving.has(actor.uuid))return;
 if(r.actor!==actor.uuid||!Array.isArray(r.effects)||r.effects.some(id=>typeof id!=="string")||!r.phase||!Number.isInteger(r.phase.round)||r.phase.round<1||!Number.isInteger(r.phase.turn)||r.phase.turn<0)return;
 // Do not resolve the conditional promise before its turn has ended.
 if(equal(r.phase,phase(actor)))return;
 resolving.add(actor.uuid);
 try{
  const existing=()=>trickHidingEffects(actor).filter(e=>r.effects.includes(e.uuid)),signature=JSON.stringify(r);
  let decision=r.decision;
  if(decision===null&&existing().length&&activeSneaky(actor))decision=await foundry.applications.api.DialogV2.confirm({window:{title:"Подлое сотворение: конец хода"},rejectClose:false,
   content:`<p>${foundry.utils.escapeHTML(actor.name)}: раунд ${Number.isInteger(r.phase.round)?r.phase.round:'?'}, ход ${Number.isInteger(r.phase.turn)?r.phase.turn+1:'?'}. В конце этого хода персонаж находился за Укрытием на три четверти или Полным укрытием? Подтвердите условия с Мастером. Подтверждение сохраняет только эту Засаду; отказ или закрытие окна заканчивает её. Уже разрешённые броски при нарушении условия проверяет Мастер.</p>`});
  decision=decision===true;
  if(JSON.stringify(actor.flags.spikependium?.spellTrickSneaky)!==signature)return;
  await actor.update({"flags.spikependium.spellTrickSneaky":{...r,decision}});
  if(!decision&&existing().length)await actor.deleteEmbeddedDocuments("ActiveEffect",existing().map(e=>e.id));
  if(equal(actor.flags.spikependium?.spellTrickSneaky.phase,r.phase))await actor.update({"flags.spikependium.spellTrickSneaky.resolved":true});
 }finally{resolving.delete(actor.uuid);}
}
export async function trickEndTurn(wrapped,combatant){const result=await wrapped(combatant);if(combatant?.actor)await resolveSneaky(combatant.actor);return result;}
export async function cleanTrick(){
 for(const actor of actors()){if(!writer(actor))continue;
  for(const e of [...actor.effects])if(e.flags.spikependium?.spellTrickDash){const origin=resolve(e.flags.spikependium.spellTrickDash.origin);if(origin&&escape(origin.getAssociatedActivity?.()))await syncTrickDash(origin);else await actor.deleteEmbeddedDocuments("ActiveEffect",[e.id]);}
  await resolveSneaky(actor);
 }
}
export function refundTrick(wrapped,consumed,...args){
 if(!escape(this))return wrapped(consumed,...args);
 const r=consumed?.actor?.find(d=>/^flags\.spikependium\.spellTrickCasts\.[A-Za-z0-9]{16}\.spent$/.test(d.keyPath)&&d.delta===1),event=r?.keyPath.split(".").at(-2),saved=this.actor.flags.spikependium?.spellTrickCasts?.[event];
 const fresh=saved&&saved.data[0].time===game.time.worldTime&&equal(saved.data[0].phase,phase(this.actor));
 return wrapped(fresh?consumed:{...consumed,actor:consumed.actor?.filter(d=>d.keyPath!=="system.attributes.actions.bonus.spent")},...args);
}
export function trickDeltaLabel(wrapped,...args){const result=wrapped(...args);if(/^flags\.spikependium\.spellTrickCasts\.[A-Za-z0-9]{16}\.(active|spent)$/.test(this.keyPath))result.label=this.keyPath.endsWith(".active")?"Скрывающие заклинания: исходное сотворение":"Скрывающие заклинания: Рывок и Засада";return result;}
