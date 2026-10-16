import { tokensDistance } from "./effects.mjs";
import { reactionAvailable } from "./reactions.mjs";

const captured = new WeakMap(), prepared = new WeakMap(), rolling = new Set(), applying = new Set(), pending = new Set(), using = new Set();
// shortcut: different clients share native non-atomic resource updates; coordinate simultaneous uses with the GM.
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const turn = () => game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : null;
const signature = card => JSON.stringify(card.rolls.map(r => r.toJSON()));
const resilient = a => a?.item?.flags.spikependium?.key === "feat:spell-resilient";
const sides = a => resilient(a) ? 6 : 4;
const isBoost = a => ["feat:magic-omen","feat:transformed-anatomy","feat:spell-resilient"].includes(a?.item?.flags.spikependium?.key) && a.type === "utility"
  && a.flags.spikependium?.originSaveBoost && a.activation.type === (resilient(a) ? "special" : "reaction") && a.roll.formula === `1d${sides(a)}`;
const anatomy = a => a?.item?.flags.spikependium?.key === "feat:transformed-anatomy";
const visibleTo = (card,user) => !!user && (user.isGM || (!card.blind
  && (!card.whisper?.length || card.whisper.includes(user.id) || card.author?.id === user.id)));
function sourceToken(activity) {
  const token = activity.getUsageToken?.();
  return token?.actor?.uuid === activity.actor.uuid ? token : undefined;
}
function selfTarget(activity,card) {
  if(card.getAssociatedActor?.()?.uuid!==activity.actor.uuid)return false;
  const source=sourceToken(activity),target=card.getAssociatedToken?.();
  return !source||!target||source.uuid===target.uuid;
}
function inRange(activity, card) {
  if(resilient(activity))return selfTarget(activity,card);
  if(anatomy(activity))return selfTarget(activity,card)&&card.system.ability==="con";
  if (selfTarget(activity,card)) return true;
  const source = sourceToken(activity), token = card.getAssociatedToken?.();
  const distance = source && token && tokensDistance(source, token);
  return !!source && source.parent === token?.parent && distance != null && distance <= 30;
}
function failed(card) {
  const roll = card?.rolls?.[0], actor = card?.getAssociatedActor?.();
  return card?.type === "save" && card.rolls.length === 1 && actor && card.author
    && (card.author.isGM || actor.testUserPermission(card.author,"OWNER"))
    && roll instanceof CONFIG.Dice.D20Roll && roll._evaluated && Number.isNumeric(roll.options.target)
    && roll.isFailure && !card.system.forceSuccess;
}
function fresh(card) {
  const stamp = card?.flags.spikependium?.originSaveWindow;
  if (!stamp || stamp.time !== game.time.worldTime || stamp.turn !== turn()) return false;
  const actor = card.getAssociatedActor?.();
  return [...game.messages].filter(m => m.type === "save" && m.getAssociatedActor?.()?.uuid === actor?.uuid).at(-1)?.uuid === card.uuid;
}
export { fresh as originSaveFresh };
export function recordOriginSaveWindow(card) {
  if (card.type === "save") card.updateSource({ "flags.spikependium.originSaveWindow": { time:game.time.worldTime,turn:turn() } });
  const origin=card.type==="usage"?card:card.getOriginatingMessage?.();
  const source=resolve(origin?.flags.spikependium?.originSaveBoost?.save);
  if(source?.whisper?.length || source?.blind)card.updateSource({whisper:[...(source.whisper??[])],blind:!!source.blind});
}
function choices(activity) {
  if (!activity.actor?.isOwner || (!resilient(activity) && !reactionAvailable(activity.actor))) return [];
  return [...game.messages].filter(card => failed(card) && fresh(card) && inRange(activity,card) && visibleTo(card,game.user)
    && !usedResilience(activity,card)
    && (game.user.isGM || card.system.displayResult !== false));
}
function usedResilience(activity, card) {
  return resilient(activity) && Object.values(activity.actor.flags.spikependium?.saveBoosts??{})
    .some(record=>record.active===1&&record.feature===activity.item.uuid&&record.save===card?.uuid);
}
export async function resilientSaveUse(wrapped,config={},...args) {
  if(!isBoost(this)||!resilient(this))return wrapped(config,...args);
  if(using.has(this.actor.uuid))return;
  using.add(this.actor.uuid);
  try{return await wrapped(config,...args);}finally{using.delete(this.actor.uuid);}
}
export function prepareOriginSaveBoost(activity,config,dialog) {
  if (!isBoost(activity)) return;
  const cards = choices(activity);
  config.spikependium = { ...config.spikependium, originSave: config.spikependium?.originSave ?? cards.at(-1)?.uuid ?? "" };
  const Base=dialog.applicationClass; dialog.configure=true;
  dialog.applicationClass=class extends Base {
    async _prepareConsumptionContext(context,options) {
      context=await super._prepareConsumptionContext(context,options);
      context.fields.push({name:"spikependium.originSave",value:this.config.spikependium.originSave,
        field:new foundry.data.fields.StringField({label:"Проваленный спасбросок",choices:{"":"Выберите свежую карточку",
          ...Object.fromEntries(cards.map(c=>[c.uuid,c.getAssociatedActor().name]))},
          hint:"Карточка текущего момента с известной СЛ; к20 не перебрасывается."})},
      ...(resilient(activity)?[{name:"spikependium.originSaveMagical",value:this.config.spikependium?.originSaveMagical??false,
        field:new foundry.data.fields.BooleanField({label:"Если это не связанное заклинание: подтверждаю магический эффект"}),
        input:context.inputs.createCheckboxInput}]:[]),
      ...(!anatomy(activity)&&!resilient(activity)?[{name:"spikependium.originSaveVisible",value:this.config.spikependium?.originSaveVisible??false,
        field:new foundry.data.fields.BooleanField({label:"Подтверждаю, что вижу другую цель в пределах 30 футов"}),
        input:context.inputs.createCheckboxInput}]:[]));
      context.hasConsumption=true; return context;
    }
  };
}
export function captureOriginSaveBoost(activity,config,message) {
  captured.delete(activity);
  if (!isBoost(activity)) return;
  const card=resolve(config.spikependium?.originSave);
  const magical=card?.getOriginatingMessage?.()?.getAssociatedItem?.()?.type==="spell"||config.spikependium?.originSaveMagical===true;
  if (!choices(activity).some(c=>c===card) || (!selfTarget(activity,card)
      && config.spikependium?.originSaveVisible!==true) || message.create===false
      || (!game.users.activeGM && !card.canUserModify(game.user,"update")) || (resilient(activity)&&!magical)) {
    ui.notifications.warn(resilient(activity)?"Нужен свежий собственный провал спасброска против заклинания или подтверждённого магического эффекта.":"Нужна свежая карточка провала, доступная реакция и видимость другой цели. Для изменения чужой карточки нужен Мастер.");
    return false;
  }
  captured.set(activity,{save:card.uuid,signature:signature(card),actor:activity.actor.uuid,...(resilient(activity)?{magical}:{}),
    target:card.getAssociatedActor().uuid,sourceToken:sourceToken(activity)?.uuid??null,targetToken:card.getAssociatedToken?.()?.uuid??null});
  message.data??={};
  if(card.whisper?.length || card.blind){message.data.whisper=[...(card.whisper??[])];message.data.blind=!!card.blind;}
}
export function prepareOriginSaveBoostUpdates(activity,config,updates) {
  prepared.delete(activity);
  if (!isBoost(activity)) return updates;
  const data=captured.get(activity),card=resolve(data?.save),reaction=resilient(activity)?null:updates.actor["flags.spikependium.reactionId"];
  if (!data || !failed(card) || !fresh(card) || !inRange(activity,card) || usedResilience(activity,card) || signature(card)!==data.signature
      || (resilient(activity)?data.magical!==true:!reaction||updates.actor[`flags.spikependium.reactionCasts.${reaction}`]?.spent!==1)
      || updates.activity?.["uses.spent"]!==activity.uses.spent+1) return false;
  const event=foundry.utils.randomID();
  const receipt={...data,event,reaction,activity:activity.uuid,feature:activity.item.uuid};
  updates.actor[`flags.spikependium.saveBoosts.${event}`]={...receipt,active:1};
  prepared.set(activity,receipt); return updates;
}
export function recordOriginSaveBoostConsumption(activity,_config,message) {
  const receipt=prepared.get(activity);
  if (!receipt || activity.actor.flags.spikependium?.saveBoosts?.[receipt.event]?.active!==1) return;
  const path=`flags.spikependium.saveBoosts.${receipt.event}.active`;
  const deltas=message.data.system.deltas.actor??=[];
  if(!deltas.some(d=>d.keyPath===path))deltas.push({keyPath:path,delta:1});
}
export function recordOriginSaveBoostUsage(activity,message) {
  const receipt=prepared.get(activity); prepared.delete(activity);
  if(receipt && activity.actor.flags.spikependium?.saveBoosts?.[receipt.event]?.active===1)
    foundry.utils.setProperty(message,"data.flags.spikependium.originSaveBoost",receipt);
}
function receiptFor(origin) {
  const receipt=origin?.flags.spikependium?.originSaveBoost,actor=resolve(receipt?.actor),card=resolve(receipt?.save);
  const record=actor?.flags.spikependium?.saveBoosts?.[receipt?.event];
  if(origin?.type!=="usage" || !actor || card?.type!=="save" || !record || !origin.author || !actor.testUserPermission(origin.author,"OWNER")
    || !visibleTo(card,origin.author) || record.save!==receipt.save || record.signature!==receipt.signature
    || record.feature!==receipt.feature || record.activity!==receipt.activity || record.reaction!==receipt.reaction
    || card.getAssociatedActor()?.uuid!==receipt.target
    || (receipt.reaction===null?record.magical!==true:origin.flags.spikependium?.reaction?.id!==receipt.reaction)) return;
  const charged=origin.system.deltas?.actor?.some(d=>d.keyPath===`flags.spikependium.saveBoosts.${receipt.event}.active`&&d.delta===1);
  const applied=origin.flags.spikependium.originSaveBoostApplied
    && card.flags.spikependium?.originSaveBoostState?.entries?.[origin.id]?.origin===origin.uuid;
  if (!charged && !applied) return;
  return {receipt,actor,card,record};
}
function dieFor(origin) {
  const activity=origin.getAssociatedActivity?.(),die=sides(activity);
  return [...game.messages].find(m=>m.type==="generic" && (m.system.origin?.id??m.system.origin)===origin.id && m.author
    && (m.author.isGM || m.author.id===origin.author.id) && m.rolls?.length===1 && m.rolls[0]._evaluated
    && m.getAssociatedActivity?.()?.uuid===origin.flags.spikependium.originSaveBoost.activity
    && m.rolls[0].formula===`1d${die}` && Number.isInteger(m.rolls[0].total) && m.rolls[0].total>=1 && m.rolls[0].total<=die);
}
export function canRollOriginSaveBoost(config,_dialog,message) {
  if (!isBoost(config.subject)) return;
  const id=message.data?.system?.origin??config.event?.target?.closest("[data-message-id]")?.dataset.messageId;
  const origin=typeof id==="string"?game.messages.get(id):id;
  const info=receiptFor(origin);
  if (!info || info.record.active!==1 || dieFor(origin) || origin.flags.spikependium.originSaveBoostApplied) {
    ui.notifications.warn("Нужна оплаченная карточка бонуса спасброска; её кубик бросается один раз.");return false;
  }
}
export function originSaveBoostRoll(base,bonuses) {
  const data=JSON.parse(base);
  for(const bonus of bonuses){
    data.formula+=` + ${bonus.formula??"1d4"}`;
    data.terms.push(new foundry.dice.terms.OperatorTerm({operator:"+"}).toJSON(),...bonus.terms);
    data.total+=bonus.total;
  }
  const roll=CONFIG.Dice.D20Roll.fromData(data);
  if (!roll._evaluated || !Number.isFinite(roll.total) || roll.total!==data.total) throw Error("Не удалось сохранить результат спасброска");
  return roll;
}
function authorized(origin) {return game.users.activeGM?game.user.isActiveGM:origin.author?.id===game.user.id;}
async function needsReview(origin,card) {
  const changed=signature(card);
  if(origin.flags.spikependium.originSaveBoostNeedsReview!==changed){
    await origin.setFlag("spikependium","originSaveBoostNeedsReview",changed);
    ui.notifications.warn("Карточка спасброска изменена другим способом; проверьте бонус предчувствия вручную.");
  }
}
export async function applyOriginSaveBoost(origin) {
  const info=receiptFor(origin);
  if (!info || !authorized(origin) || !info.card.canUserModify(game.user,"update")) return;
  if (applying.has(info.card.uuid)) {pending.add(info.card.uuid);return;}
  applying.add(info.card.uuid);
  try {
    const {receipt,card,record}=info, state=card.flags.spikependium?.originSaveBoostState;
    const entries=structuredClone(state?.entries??{}), prior=entries[origin.id];
    if (origin.flags.spikependium.originSaveBoostApplied && !prior) return;
    if (!prior) {
      const activity=resolve(receipt.activity)??origin.getAssociatedActivity?.(),die=dieFor(origin);
      if (record.active!==1 || !isBoost(activity) || !die) return;
      if(state ? !state.signatures.includes(receipt.signature) : signature(card)!==receipt.signature){
        await needsReview(origin,card);return;
      }
      entries[origin.id]={origin:origin.uuid,active:true,total:die.rolls[0].total,formula:die.rolls[0].formula,terms:die.rolls[0].toJSON().terms};
    } else if (prior.active===(record.active===1)) return;
    else entries[origin.id].active=record.active===1;
    const base=state?.base??JSON.stringify(card.rolls[0].toJSON());
    if (state && state.expected!==signature(card)) {
      await needsReview(origin,card);return;
    }
    const roll=originSaveBoostRoll(base,Object.values(entries).filter(e=>e.active));
    const expected=JSON.stringify([roll.toJSON()]);
    const next={base,entries,expected,signatures:[...new Set([...(state?.signatures??[signature(card)]),expected])]};
    await foundry.documents.modifyBatch([{action:"update",documentName:"ChatMessage",updates:[
      {_id:card.id,rolls:[roll],"flags.spikependium.originSaveBoostState":next},
      {_id:origin.id,"flags.spikependium.originSaveBoostApplied":true}
    ]}]);
    if (card.system.type==="death" || card.system.concentrationBroken)
      ui.notifications.warn("Бонус добавлен к броску. Последствия уже обработанного испытания смерти или прерванной концентрации проверяет Мастер.");
  } finally {
    applying.delete(info.card.uuid);
    if(pending.delete(info.card.uuid))await resumeOriginSaveBoosts(info.card);
  }
}
export async function rollOriginSaveBoost(activity,_config,results) {
  const origin=results?.message,info=receiptFor(origin);
  if (!isBoost(activity) || !info || origin.author.id!==game.user.id || rolling.has(origin.uuid)) return;
  rolling.add(origin.uuid);
  try {
    if (!dieFor(origin) && !origin.flags.spikependium.originSaveBoostStarted && info.record.active===1) {
      await origin.setFlag("spikependium","originSaveBoostStarted",true);
      await activity.rollFormula({}, {configure:false}, {data:{system:{origin:origin.id},
        whisper:[...(origin.whisper??[])],blind:!!origin.blind}});
    }
    await applyOriginSaveBoost(origin);
  } finally {rolling.delete(origin.uuid);}
}
export function originSaveBoostDeltaLabel(wrapped,...args) {
  const data=wrapped(...args);
  if(/^flags\.spikependium\.saveBoosts\.[A-Za-z0-9]{16}\.active$/.test(this.keyPath))data.label="Бонус спасброска";
  return data;
}
export function originSaveBoostError(error) {
  console.error("Spikependium: Полезное предчувствие",error);
  ui.notifications.error("Бонус спасброска не завершён. Проверьте оплаченную карточку и кубик; повторный расход не требуется.");
}
export async function resumeOriginSaveBoosts(document) {
  const actor=document?.documentName==="ActorDelta"?document.parent?.actor:document;
  const filter=document?.type==="usage" ? o=>o===document
    : document?.type==="generic" ? o=>o.id===(document.system.origin?.id??document.system.origin)
    : document?.type==="save" ? o=>o.flags.spikependium?.originSaveBoost?.save===document.uuid
    : actor?.uuid ? o=>o.flags.spikependium?.originSaveBoost?.actor===actor.uuid : ()=>true;
  for(const origin of game.messages)if(origin.flags.spikependium?.originSaveBoost&&filter(origin))await applyOriginSaveBoost(origin);
}
