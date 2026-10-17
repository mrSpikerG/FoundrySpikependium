import { familiarCaster } from "./familiar-source.mjs";
import { tokensDistance } from "./effects.mjs";
import { reactionAvailable } from "./reactions.mjs";
import { attackSource, attackSignature, guardianRawTarget, guardianRecords, guardianTarget } from "./attack-source.mjs";
import { defensiveCharmWaiting } from "./performer-defense.mjs";

const KEY="feat:au-warlike-familiar",ITEM="spikeWarFamFeat0",ACTIVITY="spikeWarReact000";
// shortcut: dnd5e resource updates are not atomic across clients; simultaneous reactions need GM arbitration.
const prepared=new WeakMap(),captured=new WeakMap(),using=new Set(),marked=Symbol("warlike");
const resolve=id=>typeof id==="string"?(game.messages.get(id)??(id.includes(".")?fromUuidSync(id,{strict:false}):undefined)):undefined;
const feat=actor=>actor?.items.find(i=>i.flags.spikependium?.key===KEY);
const supported=a=>a?.type==="utility"&&a.id===ACTIVITY&&a.item.id===ITEM&&a.item.flags.spikependium?.warlikeFamiliar;
const root=id=>`flags.spikependium.warlikeIntercepts.${id}`;
const turn=()=>game.combat?.started?`${game.combat.id}:${game.combat.round}:${game.combat.turn}`:null;
const actors=()=>[...new Map([...(game.actors??[]),...[...(game.scenes??[])].flatMap(s=>[...(s.tokens??[])].map(t=>t.actor))].filter(Boolean).map(a=>[a.uuid,a])).values()];
const entries=actor=>Object.entries(actor?.flags?.spikependium?.warlikeIntercepts??{});
const same=(a,b)=>a&&b&&["attack","signature","targets","target","actor","attacker","attackerToken","ac"].every(k=>a[k]===b[k]);
const readable=t=>t?.actor&&(game.user.isGM||!t.hidden&&t.actor.testUserPermission(game.user,"LIMITED"));
function friendAbility(actor){
 const friends=actor?.items.filter(i=>i.flags.spikependium?.key==="feat:familiar-friend")??[];
 const ability=friends.length===1?friends[0].system.advancement.find(a=>a.type==="ItemGrant"&&a.configuration.items.some(i=>i.uuid==="Compendium.dnd5e.spells24.Item.phbsplFindFamili"))?.value.ability:null;
 return ["int","wis","cha"].includes(ability)?ability:null;
}
export function prepareWarlikeAdvancement(manager){
 const a=manager.step?.flow?.advancement,ability=friendAbility(a?.actor);
 if(a?.type==="ItemGrant"&&a.item.flags.spikependium?.key===KEY&&ability)a.updateSource({"configuration.spell.ability":[ability]});
}
export function warlikeGrantApply(wrapped,level,data={},options={}){
 if(this.item.flags.spikependium?.key!==KEY)return wrapped(level,data,options);
 const ability=friendAbility(this.actor);
 if(!ability)throw Error("Сначала выберите характеристику Верного спутника в продвижении Друга фамильяра.");
 this.updateSource({"configuration.spell.ability":[ability]});
 return wrapped(level,{...data,ability},options);
}
export function prepareWarlikeSpell(a){
 const item=a?.item;if(item?.type!=="spell"||item.system.sourceItem!=="feat:warlike-familiar")return;
 const origin=item.flags.dnd5e?.advancementOrigin,source=a.actor?.items.get(origin?.split(".")[0]),ability=friendAbility(a.actor);
 if(!ability||source?.flags.spikependium?.key!==KEY||!source.system.advancement.some(v=>`${source.id}.${v.id}`===origin&&v.type==="ItemGrant"
  &&v.value.added?.[item.id]===(item.flags.dnd5e?.sourceId??item._stats?.compendiumSource))){ui.notifications.warn("Боевой фамильяр не связан с Воинственным фамильяром и характеристикой Друга фамильяра.");return false;}
 if(item.system.ability!==ability){item.updateSource({"system.ability":ability});item.prepareFinalAttributes();}
}
function helperData(caster){return{_id:ITEM,type:"feat",name:"Перехват атаки",img:"icons/magic/defensive/shield-barrier-glowing-triangle-blue.webp",
 flags:{spikependium:{warlikeFamiliar:caster.uuid}},system:{identifier:"warlike-familiar-intercept",type:{value:"monster",subtype:""},source:{book:"AU",page:"31",rules:"2024"},advancement:[],
 description:{value:"<p>Когда по существу в пределах 5 футов от фамильяра попадают атакой, фамильяр может Реакцией добавить Бонус владения своего владельца к КБ цели против этого попадания. Используйте до применения урона и выберите исходную атаку. Натуральная 20 остаётся попаданием; общий КБ не меняется. Для возврата используйте карточку расхода; уже применённые последствия проверяет Мастер.</p>"},
 activities:{[ACTIVITY]:{_id:ACTIVITY,type:"utility",name:"Перехват атаки",activation:{type:"reaction",value:1,override:true},consumption:{targets:[],spellSlot:false},
 range:{units:"self",override:true},target:{affects:{type:"self"},template:{},prompt:false,override:true}}}}};}
let syncing=false,again=false;
export async function syncWarlikeFamiliars(){
 if(syncing){again=true;return;}syncing=true;
 try{do{again=false;
  const all=[...new Map([...game.actors,...actors()].map(a=>[a.uuid,a])).values()];
  for(const actor of all){if(!actor.isOwner||!(game.users.activeGM?game.user.isActiveGM:[...game.users].filter(u=>u.active&&actor.testUserPermission(u,"OWNER")).sort((a,b)=>a.id.localeCompare(b.id))[0]?.id===game.user.id))continue;
   const tokens=[...game.scenes].flatMap(s=>[...s.tokens]).filter(t=>t.actor?.uuid===actor.uuid),casters=[...new Map(tokens.map(t=>familiarCaster(t)).filter(c=>feat(c)).map(c=>[c.uuid,c])).values()];
   const caster=casters.length===1?casters[0]:null,item=actor.items.get(ITEM),own=item?.flags.spikependium?.warlikeFamiliar;
   if(caster&&!item)await actor.createEmbeddedDocuments("Item",[helperData(caster)],{keepId:true});
   else if(own&&own!==caster?.uuid){if(caster)await item.update({"flags.spikependium.warlikeFamiliar":caster.uuid});else await item.delete();}
   const ability=friendAbility(actor),updates=[];
   if(ability)for(const i of actor.items){if(i.type!=="spell"||i.system.sourceItem!=="feat:warlike-familiar"||i.system.ability===ability)continue;
    const f=actor.items.get(i.flags.dnd5e?.advancementOrigin?.split(".")[0]);if(f?.flags.spikependium?.key===KEY)updates.push({_id:i.id,"system.ability":ability});
   }if(updates.length)await actor.updateEmbeddedDocuments("Item",updates);
  }
 }while(again);}finally{syncing=false;}
}
function binding(attack,target){
 const a=attack?.getAssociatedActivity?.(),roll=attack?.rolls?.[0],attacker=attack?.getAssociatedToken?.();
 if(attack?.type!=="attack"||attack.rolls.length!==1||!(roll instanceof CONFIG.Dice.D20Roll)||!roll._evaluated||!roll.validD20Roll||!Number.isFinite(roll.total)
  ||!a||!attacker?.actor?.system.isCreature||!attack.author||!a.actor.testUserPermission(attack.author,"OWNER")
  ||guardianRecords(attack).some(r=>["prompted","moving","stopped"].includes(r.state)))return;
 const raw=attack.system.targets.map(t=>guardianRawTarget(attack,t)),t=raw.find(t=>t.token===target),token=resolve(t?.token);
 if(!token?.actor?.system.isCreature||token.actor.uuid!==t.actor||raw.filter(v=>v.actor===t.actor).length!==1||!Number.isFinite(t.ac)
  ||attacker.parent!==token.parent||roll.isFumble||!roll.isCritical&&roll.total<t.ac)return;
 return{attack:attack.uuid,signature:attackSignature(attack),targets:JSON.stringify(attack.system.targets),target,actor:token.actor.uuid,
  attacker:attacker.actor.uuid,attackerToken:attacker.uuid,ac:t.ac};
}
function fresh(attack,target){
 const stamp=attack?.flags.spikependium?.guardianAttack;
 return stamp?.time===game.time.worldTime&&stamp.turn===turn()
  &&[...game.messages].filter(m=>m.type==="attack"&&m.system.targets.some(t=>guardianRawTarget(m,t).token===target)).at(-1)===attack;
}
function claims(attack,target){return actors().flatMap(actor=>entries(actor).filter(([,r])=>r.active===1&&r.attack===attack?.uuid&&r.target===target&&same(r,binding(attack,target))).map(([id,r])=>({actor,id,r})));}
function paid(c){
 const {actor,id,r}=c;
 if(!/^[A-Za-z0-9]{16}$/.test(id)||r.event!==id||!Number.isSafeInteger(r.bonus)||r.bonus<0||r.familiarActor!==actor.uuid)return;
 const usage=[...game.messages].find(m=>m.type==="usage"&&m.flags.spikependium?.warlikeIntercept===id&&m.getAssociatedActor?.()?.uuid===actor.uuid
  &&m.author&&actor.testUserPermission(m.author,"OWNER")&&m.getAssociatedActivity?.()?.uuid===r.activity
  &&m.system.deltas?.actor?.some(d=>d.keyPath===`${root(id)}.active`&&d.delta===1)
  &&m.system.deltas.actor.some(d=>d.keyPath===`flags.spikependium.reactionCasts.${r.reaction}.spent`&&d.delta===1));
 return usage?c:null;
}
function candidates(a){
 const familiar=a.getUsageToken?.(),caster=familiar?.actor?.uuid===a.actor?.uuid?familiarCaster(familiar):null;
 if(!supported(a)||!a.actor.isOwner||!readable(familiar)||!caster||!feat(caster)||a.item.flags.spikependium.warlikeFamiliar!==caster.uuid
  ||!reactionAvailable(a.actor)||!(a.actor.system.attributes.hp.value>0)||a.actor.statuses.has("dead"))return [];
 const bonus=caster.system.attributes.prof;if(!Number.isSafeInteger(bonus)||bonus<0)return [];
 const out=[];
 for(const attack of game.messages){if(attack.type!=="attack"||attack.isContentVisible===false||!game.user.isGM&&(attack.blind||attack.whisper?.length&&!attack.whisper.includes(game.user.id)&&attack.author?.id!==game.user.id))continue;
  for(const t of attack.system.targets){const raw=guardianRawTarget(attack,t),token=resolve(raw.token),b=binding(attack,raw.token);
   if(!b||!readable(token)||token.parent!==familiar.parent||token.level!==familiar.level||!fresh(attack,raw.token)
    ||token.actor.flags.spikependium?.warlikeResolved===attack.uuid||claims(attack,raw.token).length
    ||guardianTarget(attack,t).isMiss||defensiveCharmWaiting(attack,raw))continue;
   const d=tokensDistance(familiar,token);if(!Number.isFinite(d)||d>5+1e-7)continue;
   out.push({key:`${attack.uuid}|${token.uuid}`,label:`${attack.getAssociatedActor()?.name??"Атака"} → ${token.name} (${attack.rolls[0].total} против КБ ${guardianTarget(attack,t).ac}; бонус +${bonus})`,
    attack,b,bonus,caster:caster.uuid,familiar:familiar.uuid,familiarActor:a.actor.uuid,activity:a.uuid});
  }
 }return out;
}
export function prepareWarlikeDialog(a,config,dialog,message){
 if(!supported(a))return;
 config.hasConsumption=true;message.hasConsumption=true;dialog.configure=true;
 config.spikependium={...config.spikependium,warlikeIntercept:config.spikependium?.warlikeIntercept??candidates(a).at(-1)?.key??""};
 const Base=dialog.applicationClass;dialog.applicationClass=class extends Base{
  async _prepareConsumptionContext(context,options){context=await super._prepareConsumptionContext(context,options);
   context.fields.push({name:"spikependium.warlikeIntercept",value:this.config.spikependium.warlikeIntercept,field:new foundry.data.fields.StringField({label:"Попадание для перехвата",
    choices:Object.fromEntries(candidates(a).map(c=>[c.key,c.label])),hint:"Расходуется Реакция фамильяра. Бонус КБ действует только против выбранного попадания; натуральная 20 остаётся попаданием."})});context.hasConsumption=true;return context;
  }
 };
}
export function warlikeRequiresDialog(wrapped,...args){return !!supported(this)||wrapped(...args);}
export async function warlikeUse(wrapped,config={},dialog={},message={}){
 if(!supported(this))return wrapped(config,dialog,message);
 if(using.has(this.actor.uuid)||!candidates(this).length){ui.notifications.warn("Нет свежего попадания в пределах 5 футов от фамильяра с доступной Реакцией.");return;}
 using.add(this.actor.uuid);
 try{return await wrapped({...config,consume:config.consume===false?false:{...config.consume,action:config.consume?.action??true}},dialog,message);}
 finally{using.delete(this.actor.uuid);}
}
export function captureWarlike(a,config,message){
 if(!supported(a))return;captured.delete(a);
 const c=candidates(a).find(c=>c.key===config.spikependium?.warlikeIntercept);
 if(!c||config.consume===false||config.consume?.action===false||message.create===false||message.message){ui.notifications.warn("Перехват требует свежего попадания, расхода Реакции и новой сохранённой карточки.");return false;}
 if(c.attack.whisper?.length){const audience=message.data?.whisper?.length?message.data.whisper.filter(id=>c.attack.whisper.includes(id)):[...c.attack.whisper];if(!audience.length)return false;foundry.utils.setProperty(message,"data.whisper",audience);message.rollMode="gm";}
 if(c.attack.blind){foundry.utils.setProperty(message,"data.blind",true);message.rollMode="blind";}
 if(resolve(c.familiar)?.hidden){foundry.utils.setProperty(message,"data.whisper",game.users.filter(u=>u.isGM).map(u=>u.id));foundry.utils.setProperty(message,"data.blind",true);message.rollMode="blind";}
 captured.set(a,{...c,b:structuredClone(c.b)});
}
export function prepareWarlikeUpdates(a,config,updates){
 prepared.delete(a);if(!supported(a))return updates;
 const saved=captured.get(a),c=candidates(a).find(c=>c.key===config.spikependium?.warlikeIntercept),reaction=updates.actor["flags.spikependium.reactionId"];
 if(!saved||!c||!same(saved.b,c.b)||saved.bonus!==c.bonus||saved.familiar!==c.familiar||saved.caster!==c.caster||!reaction||updates.actor[`flags.spikependium.reactionCasts.${reaction}`]?.spent!==1)return false;
 const event=foundry.utils.randomID(),r={...c.b,event,bonus:c.bonus,caster:c.caster,familiar:c.familiar,familiarActor:c.familiarActor,activity:c.activity,reaction,active:1};
 updates.actor[root(event)]=r;prepared.set(a,r);return updates;
}
export function recordWarlikeConsumption(a,_config,message){
 const r=prepared.get(a);prepared.delete(a);captured.delete(a);if(!r||a.actor.flags.spikependium?.warlikeIntercepts?.[r.event]?.active!==1)return;
 const p=`${root(r.event)}.active`,deltas=((message.data.system??={}).deltas??={}).actor??=[];
 if(!deltas.some(d=>d.keyPath===p))deltas.push({keyPath:p,delta:1});foundry.utils.setProperty(message,"data.flags.spikependium.warlikeIntercept",r.event);
}
export function warlikeTarget(attack,target,index=0){
 if(index!==0||target[marked])return target;
 const bonus=Math.max(0,...claims(attack,target.token).filter(paid).map(c=>c.r.bonus));if(!bonus)return target;
 const ac=target.ac+bonus,result={...target,ac,isMiss:target.isMiss||!attack.rolls[0].isCritical&&(attack.rolls[0].isFumble||attack.rolls[0].total<ac)};
 Object.defineProperty(result,marked,{value:true,enumerable:true});return result;
}
export function guardWarlikeDamage(actor,amount,updates,options){
 const card=options.originatingMessage,attack=attackSource(card);
 if(amount<0||options.only==="healing"||attack?.type!=="attack"||card?.type!=="damage"||card.system?.isHealing||card.getAssociatedActivity?.()?.uuid!==attack?.getAssociatedActivity?.()?.uuid)return;
 const targets=attack.system.targets.map(t=>guardianRawTarget(attack,t)).filter(t=>t.actor===actor.uuid);if(targets.length!==1)return;
 const t=targets[0],cs=claims(attack,t.token),target=guardianTarget(attack,t);
 if(cs.some(c=>!paid(c))){ui.notifications.warn("Расход Перехвата атаки ещё не опубликован или карточка изменилась. Проверьте Реакцию фамильяра; урон пока не применён.");return false;}
 if(target.isMiss)return false;
 updates["flags.spikependium.warlikeResolved"]=attack.uuid;
}
export async function refreshWarlike(document){
 if(document?.type==="usage"&&!document.flags.spikependium?.warlikeIntercept)return;
 const actor=document?.documentName==="ActorDelta"?document.parent.actor:document?.type==="usage"?document.getAssociatedActor?.():document;
 for(const [,r]of entries(actor)){const attack=resolve(r.attack);if(attack)await ui.chat?.updateMessage(attack,{notify:false});}
}
export function refundWarlike(wrapped,consumed,...args){
 if(!supported(this))return wrapped(consumed,...args);
 const delta=consumed?.actor?.find(d=>/^flags\.spikependium\.warlikeIntercepts\.[A-Za-z0-9]{16}\.active$/.test(d.keyPath)&&d.delta===1),id=delta?.keyPath.split(".").at(-2),r=this.actor.flags.spikependium?.warlikeIntercepts?.[id];
 const adjusted=r&&(r.reaction!==this.actor.flags.spikependium?.reactionId||reactionAvailable(this.actor))?{...consumed,actor:consumed.actor.filter(d=>d.keyPath!=="system.attributes.actions.reaction.spent")}:consumed;
 return wrapped(adjusted,...args);
}
export function warlikeDeltaLabel(wrapped,...args){const result=wrapped(...args);if(/^flags\.spikependium\.warlikeIntercepts\.[A-Za-z0-9]{16}\.active$/.test(this.keyPath))result.label="Перехват атаки фамильяром";return result;}
