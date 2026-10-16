import { reactionAvailable } from "./reactions.mjs";
import { attackHitTargets } from "./companions.mjs";
import { guardianRecords, guardianTarget } from "./attack-source.mjs";
import { defensiveCharmWaiting } from "./performer-defense.mjs";

const captured = new WeakMap(), prepared = new WeakMap(), running = new Set(), again = new Set();
const resolve = uuid => uuid && fromUuidSync(uuid, {strict:false});
const supported = a => a?.type === "utility" && a.item?.flags.spikependium?.key === "spell:au-moment-of-prescience"
  && a.flags.spikependium?.momentOfPrescience && a.activation.type === "reaction";
const signature = card => JSON.stringify(card.rolls.map(r=>r.toJSON()));
const visible = (card,user) => user && (user.isGM || !card.blind && (!card.whisper?.length || card.whisper.includes(user.id) || card.author?.id===user.id));
const authority = origin => game.users.activeGM ? game.user.isActiveGM : origin.author?.id===game.user.id;
function validCard(card) {
  return ["check","save","attack"].includes(card?.type) && !(card.type==="check"&&card.system.type==="initiative");
}
function combatsFor(card) {
  const actor=card.getAssociatedActor?.(),token=card.getAssociatedToken?.();
  return actor?[...game.combats].filter(c=>c.started&&c.getCombatantsByActor(actor).some(row=>!token||!row.token||row.token.uuid===token.uuid)):[];
}
export function recordForeknowledgeWindow(card) {
  if(!validCard(card))return;
  const combats=combatsFor(card),combat=combats.includes(game.combat)?game.combat:combats.length===1?combats[0]:null;
  const phase=combat?{combat:combat.uuid,round:combat.round,turn:combat.turn}:combats.length?{ambiguous:true}:null;
  card.updateSource({"flags.spikependium.foreknowledgeWindow":{time:game.time.worldTime,phase}});
}
function fresh(card) {
  const stamp = card.flags.spikependium?.foreknowledgeWindow,phase=stamp?.phase,combat=resolve(phase?.combat);
  const current=phase?combat?.started&&combat.round===phase.round&&combat.turn===phase.turn:!combatsFor(card).length;
  return stamp?.time===game.time.worldTime && current
    && [...game.messages].filter(m=>validCard(m)&&(m===card||!m.flags.spikependium?.painCastCheck)&&m.getAssociatedActor()?.uuid===card.getAssociatedActor()?.uuid).at(-1)===card;
}
export function foreknowledgeRoll(base,value,origin,target) {
  if (!(base instanceof CONFIG.Dice.D20Roll) || !base._evaluated || !base.validD20Roll || ![1,20].includes(value) || !Number.isFinite(base.total)) return;
  const data = structuredClone(base.toJSON()), die = data.terms?.[0];
  if (die?.faces!==20) return;
  const selected = die.results.filter(r=>r.active!==false&&!r.discarded);
  if (selected.length!==1 || !Number.isInteger(selected[0].result) || selected[0].result<1 || selected[0].result>20) return;
  const counted = selected[0].count??selected[0].result;
  if (!Number.isFinite(counted) || counted<1 || counted>20 || counted!==selected[0].result&&!die.modifiers?.some(m=>/^(min|max)\d/.test(m))) return;
  selected[0].result=value;
  if (selected[0].count!=null) selected[0].count=value;
  data.total+=value-counted;
  if(!Number.isNumeric(base.options.target)&&Number.isInteger(target)&&target>0){
    (data.options??={}).target=target;(die.options??={}).target=target;
  }
  if (origin) (data.options??={}).spikependiumForeknowledge=origin;
  const result = CONFIG.Dice.D20Roll.fromData(data);
  if (!result._evaluated || result.total!==data.total || result.d20?.total!==value) throw Error("Не удалось восстановить изменённую к20");
  return result;
}
function outcome(a,card,index,dc,source=a.getUsageToken?.()) {
  const roll = card.rolls[index];
  if (!foreknowledgeRoll(roll,20)) return;
  if (card.type==="attack") {
    if (guardianRecords(card).some(r=>["prompted","moving","stopped"].includes(r.state))) return;
    const hits = attackHitTargets(card).filter(h=>h.index===index);
    if (hits.some(h=>h.token.actor.uuid===a.actor.uuid&&(!source||h.token.uuid===source.uuid))) return 1;
    const targets = card.system.targets.map(t=>guardianTarget(card,t,index));
    if (card.getAssociatedActor()?.uuid===a.actor.uuid && targets.length && !hits.length
      && targets.every(t=>Number.isFinite(t.ac)&&!(index===0&&defensiveCharmWaiting(card,t)))) return 20;
  } else if (card.getAssociatedActor()?.uuid===a.actor.uuid && !card.system.forceSuccess) {
    const target = Number.isNumeric(roll.options.target)?Number(roll.options.target):Number.isInteger(dc)&&dc>0?dc:null;
    if (Number.isFinite(target) && roll.total<target) return 20;
  }
}
function choices(a,dc) {
  if (!a.actor?.isOwner || !reactionAvailable(a.actor)) return [];
  return [...game.messages].filter(card=>validCard(card)&&fresh(card)&&visible(card,game.user)
    && (game.user.isGM||card.system.displayResult!==false) && card.author
    && card.getAssociatedActor()?.testUserPermission(card.author,"OWNER")).flatMap(card=>card.rolls.flatMap((roll,index)=>{
      const unknown = card.type!=="attack" && card.getAssociatedActor()?.uuid===a.actor.uuid && !card.system.forceSuccess
        && !Number.isNumeric(roll.options.target) && foreknowledgeRoll(roll,20);
      const value = outcome(a,card,index,dc);
      return value||unknown ? [{card,index,value,key:`${card.uuid}:${index}`}]:[];
    }));
}
export function prepareForeknowledgeDialog(a,config,dialog) {
  if (!supported(a)) return;
  const cards = choices(a,config.spikependium?.foreknowledgeDC);
  config.spikependium={...config.spikependium,foreknowledgeRoll:config.spikependium?.foreknowledgeRoll??cards.at(-1)?.key??""};
  const Base=dialog.applicationClass; dialog.configure=true;
  dialog.applicationClass=class extends Base {
    async _prepareConsumptionContext(context,options) {
      context=await super._prepareConsumptionContext(context,options);
      context.fields.push({name:"spikependium.foreknowledgeRoll",value:this.config.spikependium.foreknowledgeRoll,
        field:new foundry.data.fields.StringField({label:"Момент предвидения: исходный бросок",choices:{"":"Выберите свежую карточку",
          ...Object.fromEntries(cards.map(e=>[e.key,`${e.card.getAssociatedActor().name}, бросок ${e.index+1}: ${e.card.rolls[e.index].total} → к20=${e.value??"20 (нужна СЛ)"}`]))}})},
        {name:"spikependium.foreknowledgeDC",value:this.config.spikependium?.foreknowledgeDC??null,
          field:new foundry.data.fields.NumberField({label:"СЛ собственного теста по решению Мастера, если она не указана в карточке",nullable:true,integer:true,min:1})});
      context.hasConsumption=true; return context;
    }
  };
}
export function captureForeknowledge(a,config,message) {
  captured.delete(a); if (!supported(a)) return;
  if (message.data?.flags?.spikependium) delete message.data.flags.spikependium.foreknowledge;
  const dc=config.spikependium?.foreknowledgeDC, entry=choices(a,dc).find(e=>e.key===config.spikependium?.foreknowledgeRoll);
  if (!entry?.value || message.create===false || !game.users.activeGM&&!entry.card.canUserModify(game.user,"update")) {
    ui.notifications.warn("Момент предвидения: нужны свежий собственный провал с известной СЛ либо попадание по вам, доступная реакция и Мастер либо права на исходную карточку."); return false;
  }
  const {card,index,value}=entry;
  captured.set(a,{card:card.uuid,index,value,dc:Number.isNumeric(card.rolls[index].options.target)?Number(card.rolls[index].options.target):dc??null,
    signature:signature(card),caster:a.actor.uuid,activity:a.uuid,time:game.time.worldTime,phase:structuredClone(card.flags.spikependium.foreknowledgeWindow.phase),sourceToken:a.getUsageToken?.()?.uuid??null});
  if (card.whisper?.length||card.blind) {message.data??={};message.data.whisper=[...(card.whisper??[])];message.data.blind=!!card.blind;}
  if (a.getUsageToken?.()?.hidden || card.getAssociatedToken?.()?.hidden) {
    message.data??={};message.data.whisper=game.users.filter(u=>u.isGM).map(u=>u.id);message.data.blind=true;
  }
}
export function prepareForeknowledgeUpdates(a,_config,updates) {
  prepared.delete(a); if (!supported(a)) return updates;
  const r=captured.get(a),card=resolve(r?.card),reaction=updates.actor["flags.spikependium.reactionId"];
  if (!r||!fresh(card)||game.time.worldTime!==r.time||JSON.stringify(card.flags.spikependium.foreknowledgeWindow.phase)!==JSON.stringify(r.phase)
    ||signature(card)!==r.signature||outcome(a,card,r.index,r.dc)!==r.value
    ||(a.getUsageToken?.()?.uuid??null)!==r.sourceToken || !reaction||updates.actor[`flags.spikependium.reactionCasts.${reaction}`]?.spent!==1) return false;
  const event=foundry.utils.randomID(), receipt={...r,reaction,event};
  updates.actor[`flags.spikependium.foreknowledge.${event}`]={...receipt,active:1};prepared.set(a,receipt);return updates;
}
export function recordForeknowledgeConsumption(a,_config,message) {
  const r=prepared.get(a);if(!r||a.actor.flags.spikependium?.foreknowledge?.[r.event]?.active!==1)return;
  const path=`flags.spikependium.foreknowledge.${r.event}.active`,deltas=message.data.system.deltas.actor??=[];
  if(!deltas.some(d=>d.keyPath===path))deltas.push({keyPath:path,delta:1});
}
export function recordForeknowledgeUsage(a,message) {
  const r=prepared.get(a);prepared.delete(a);
  if(r&&a.actor.flags.spikependium?.foreknowledge?.[r.event]?.active===1)foundry.utils.setProperty(message,"data.flags.spikependium.foreknowledge",r);
}
function receiptFor(origin) {
  const r=origin?.flags.spikependium?.foreknowledge,caster=resolve(r?.caster),card=resolve(r?.card),a=origin?.getAssociatedActivity?.();
  const record=caster?.flags.spikependium?.foreknowledge?.[r?.event];
  if(origin?.type!=="usage"||!supported(a)||a.uuid!==r?.activity||a.actor.uuid!==r.caster||!record||![0,1].includes(record.active)
    ||!validCard(card)||!Number.isInteger(r.index)||r.index<0||![1,20].includes(r.value)||!card.rolls[r.index]
    ||!origin.author||!caster.testUserPermission(origin.author,"OWNER")||!visible(card,origin.author)
    ||!card.author||!card.getAssociatedActor()?.testUserPermission(card.author,"OWNER")||!/^[A-Za-z0-9]{16}$/.test(r.event)
    ||JSON.stringify(r)!==JSON.stringify(Object.fromEntries(Object.entries(record).filter(([k])=>!["active","appliedOrigin"].includes(k))))
    ||record.appliedOrigin&&record.appliedOrigin!==origin.uuid||origin.flags.spikependium?.reaction?.id!==r.reaction
    ||!origin.system.deltas?.actor?.some(d=>d.keyPath===`flags.spikependium.foreknowledge.${r.event}.active`&&d.delta===1)
    ||!origin.system.deltas.actor.some(d=>d.keyPath===`flags.spikependium.reactionCasts.${r.reaction}.spent`&&d.delta===1))return;
  return{r,caster,card,a,record};
}
async function needsReview(origin) {
  if(origin.flags.spikependium.foreknowledgeNeedsReview)return;
  await origin.setFlag("spikependium","foreknowledgeNeedsReview",true);
  ui.notifications.warn("Исходный бросок изменился или момент реакции прошёл. Последствия Момента предвидения сверяет Мастер.");
}
async function finish(origin,{caster,r,record}) {
  if(!record.appliedOrigin)await caster.update({[`flags.spikependium.foreknowledge.${r.event}.appliedOrigin`]:origin.uuid});
  if(!origin.flags.spikependium.foreknowledgeApplied){
    await origin.setFlag("spikependium","foreknowledgeApplied",true);
    ui.notifications.warn("К20 изменена с сохранением модификаторов. Уже применённые урон, состояния, испытание смерти и потерю концентрации сверяет Мастер.");
  }
}
async function apply(origin) {
  const info=receiptFor(origin);if(!info||!authority(origin)||!info.card.canUserModify(game.user,"update"))return;
  const {r,caster,card,record}=info,state=card.flags.spikependium?.foreknowledgeState,active=record.active===1;
  if(state?.event===r.event&&state.origin===origin.uuid&&state.active===active){await finish(origin,info);return;}
  if(record.appliedOrigin&&state?.origin!==origin.uuid){await needsReview(origin);return;}
  let roll;
  if(!active){
    if(!record.appliedOrigin&&state?.origin!==origin.uuid)return;
    if(state?.origin!==origin.uuid||state.expected!==signature(card)){await needsReview(origin);return;}
    roll=CONFIG.Dice.D20Roll.fromData(JSON.parse(r.signature)[r.index]);
  }else{
    if(signature(card)!==r.signature||!fresh(card)||game.time.worldTime!==r.time
      ||JSON.stringify(card.flags.spikependium.foreknowledgeWindow.phase)!==JSON.stringify(r.phase)
      ||outcome(info.a,card,r.index,r.dc,resolve(r.sourceToken)??null)!==r.value){await needsReview(origin);return;}
    roll=foreknowledgeRoll(card.rolls[r.index],r.value,{origin:origin.uuid,event:r.event},card.type!=="attack"?r.dc:null);if(!roll)return;
  }
  const rolls=card.rolls.map((old,index)=>index===r.index?roll:old), expected=JSON.stringify(rolls.map(r=>r.toJSON()));
  await card.update({rolls,"flags.spikependium.foreknowledgeState":{event:r.event,origin:origin.uuid,active,expected}});
  await finish(origin,info);
}
export async function resumeForeknowledge(document) {
  const actor=document?.documentName==="ActorDelta"?document.parent?.actor:document;
  for(const origin of game.messages){
    const r=origin.flags.spikependium?.foreknowledge;
    if(!r||!authority(origin)||document&&![origin.uuid,r.card,r.caster].includes(actor?.uuid))continue;
    if(running.has(r.card)){again.add(r.card);continue;}running.add(r.card);
    try{do{again.delete(r.card);await apply(origin);}while(again.delete(r.card));}finally{running.delete(r.card);}
  }
}
export function foreknowledgeDeltaLabel(wrapped,...args) {
  const data=wrapped(...args);
  if(/^flags\.spikependium\.foreknowledge\.[A-Za-z0-9]{16}\.active$/.test(this.keyPath))data.label="Момент предвидения";
  return data;
}
export function foreknowledgeError(error) {
  console.error("Spikependium: Момент предвидения",error);
  ui.notifications.error("Момент предвидения не завершён. Проверьте оплаченную карточку; повторное подключение продолжит обработку без нового расхода.");
}
