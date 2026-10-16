import {PAIN_FAILURE_ACTIVITY} from "./generated.mjs";
import {arcanaEffectCast} from "./arcana-spells.mjs";
import {canUseReaction,finishReaction} from "./reactions.mjs";

const usages=new WeakMap(),prepared=new WeakMap(),casting=new Set(),publishing=new Set();
// shortcut: native document payment is not atomic across clients; coordinate simultaneous casts by different owners with the GM.
const resolve=uuid=>uuid&&fromUuidSync(uuid,{strict:false});
const request=a=>a?.item?.flags.spikependium?.painFailure;
const primary=a=>a?.item?.type==="spell"&&a.consumption?.spellSlot===true&&!["cast","forward"].includes(a.type);
const records=actor=>actor.flags.spikependium?.painAttempts??{};
const mark=(actor,event,path)=>`flags.spikependium.painAttempts.${event}.${path}`;
function pain(actor){
  return actor.effects.map(e=>{const info=e.flags.spikependium?.arcanaSpell==="power-word-pain"&&arcanaEffectCast(e);return info&&{...info,effect:e};})
    .filter(i=>i&&Number.isFinite(i.receipt.dc)&&i.receipt.dc>0).sort((a,b)=>b.receipt.dc-a.receipt.dc)[0];
}
function phase(actor,token){
  const combats=[...game.combats].filter(c=>c.started&&c.getCombatantsByActor(actor).some(row=>!token||!row.token||row.token.uuid===token.uuid));
  const combat=combats.includes(game.combat)?game.combat:combats.length===1?combats[0]:null;
  if(!combat&&combats.length)return false;
  return combat?{combat:combat.uuid,round:combat.round,turn:combat.turn}:null;
}
function fresh(r){
  const actor=resolve(r.actor),token=resolve(r.token),p=r.phase;
  if(game.time.worldTime!==r.time||!actor)return false;
  if(!p)return phase(actor,token)===null;
  const c=resolve(p.combat);return !!c?.started&&c.round===p.round&&c.turn===p.turn;
}
function saveFor(actor,r){
  return [...game.messages].find(m=>m.type==="save"&&m.flags.spikependium?.painCastCheck?.event===r.event
    &&m.flags.spikependium.painCastCheck.actor===actor.uuid&&m.flags.spikependium.painCastCheck.source===r.source
    &&m.getAssociatedActor()?.uuid===actor.uuid&&m.system.ability==="con"&&m.author&&actor.testUserPermission(m.author,"OWNER")
    &&m.rolls.length===1&&m.rolls[0] instanceof CONFIG.Dice.D20Roll&&m.rolls[0]._evaluated
    &&Number.isFinite(m.rolls[0].total)&&m.rolls[0].options.target===r.dc);
}
const failed=card=>!card.system.forceSuccess&&card.rolls[0].isFailure;
const modeFor=r=>r.blind?"blind":r.whisper.length?"gm":"public";
function helper(actor,r){
  const activity=structuredClone(PAIN_FAILURE_ACTIVITY);activity.activation={...r.activation,override:true};
  const item=new CONFIG.Item.documentClass({_id:dnd5e.utils.staticID(`pain-failure:${r.event}`),type:"feat",name:`Заклинание не сотворено: ${r.name}`,img:r.img,
    system:{identifier:"pain-failed-cast",source:{book:"AU",page:"45",rules:"2024"},activities:{[activity._id]:activity}},flags:{spikependium:{painFailure:{actor:actor.uuid,event:r.event}}}},{parent:actor});
  return item.system.activities.get(activity._id);
}
function failureMessage(a,r){
  const token=resolve(r.token);
  return{hasConsumption:true,rollMode:modeFor(r),data:{speaker:ChatMessage.getSpeaker({actor:a.actor,token,scene:token?.parent}),
    flavor:`Слово силы: боль — при попытке спасбросок Телосложения провален (${r.result?.[0]?.total??"—"}, СЛ ${r.dc}). Заклинание не действует; ячейка, компоненты и заряды сохранены. Использованное ${r.activation.type==="bonus"?"Бонусное действие":r.activation.type==="reaction"?"Реакция":"Действие"} по правилу тратится впустую.${r.skipAction?" Штатный учёт действия отключён для этой попытки.":""}`,
    whisper:[...r.whisper],blind:r.blind,flags:{dnd5e:{item:{data:a.item.toObject()}},spikependium:{painCasting:{actor:a.actor.uuid,event:r.event,failed:true},
      ...(r.reaction?{reaction:{id:r.reaction,actor:a.actor.uuid}}:{})}}}};
}
function writer(actor){
  return game.users.activeGM?game.user.isActiveGM:[...game.users].filter(u=>u.active&&actor.testUserPermission(u,"OWNER")).sort((a,b)=>a.id.localeCompare(b.id))[0]?.id===game.user.id;
}
async function publish(actor,r){
  if(!writer(actor)||!actor.isOwner||r.spent!==1||r.card||publishing.has(`${actor.uuid}:${r.event}`))return;
  if(r.failed!==true||!r.save?.startsWith("ChatMessage.")||!r.receipt?.actor?.some(d=>d.keyPath===mark(actor,r.event,"spent")&&d.delta===1))return;
  const key=`${actor.uuid}:${r.event}`;publishing.add(key);
  try{
    const existing=[...game.messages].find(m=>m.type==="usage"&&m.flags.spikependium?.painCasting?.actor===actor.uuid
      &&m.flags.spikependium.painCasting.event===r.event&&m.flags.spikependium.painCasting.failed&&m.author&&actor.testUserPermission(m.author,"OWNER"));
    let card=existing;
    if(!card){
      const a=helper(actor,r),message=failureMessage(a,r);message.data.system={deltas:structuredClone(r.receipt)};
      a._finalizeMessageConfig({},message,{updates:{rolls:[]}});
      if(!writer(actor)||records(actor)[r.event]?.spent!==1)return;
      card=await a._createUsageMessage(message);
    }
    if(card)await actor.update({[mark(actor,r.event,"card")]:card.uuid});
  }finally{publishing.delete(key);}
}
export function preparePainCasting(a,config,dialog,message){
  if(a?.item?.type!=="spell"||["cast","forward"].includes(a.type))return;
  usages.set(config,a.uuid);
  if(primary(a)||!pain(a.actor)||a.flags?.spikependium?.arcanaStage||!dialog)return;
  config.spikependium={...config.spikependium,painNewSpell:config.spikependium?.painNewSpell??false};
  config.hasConsumption=true;if(message)message.hasConsumption=true;
  const Base=dialog.applicationClass;dialog.configure=true;
  dialog.applicationClass=class extends Base{
    async _prepareConsumptionContext(context,options){
      context=await super._prepareConsumptionContext(context,options);
      context.fields.push({name:"spikependium.painNewSpell",value:this.config.spikependium.painNewSpell,
        field:new foundry.data.fields.BooleanField({label:"Это новое сотворение заклинания",
          hint:"Повторное действие уже действующего заклинания новым сотворением не считается."}),input:context.inputs.createCheckboxInput});
      context.hasConsumption=true;return context;
    }
  };
}
export async function painConsume(wrapped,config,message){
  if(usages.get(config)!==this.uuid||!primary(this)&&config.spikependium?.painNewSpell!==true)return wrapped(config,message);
  const actor=this.actor;if(!actor.isOwner||casting.has(actor.uuid))return false;
  const pending=Object.values(records(actor)).filter(r=>r?.spent===0&&!r.abandoned&&!r.card);
  const info=pain(actor);if(!info&&!pending.length)return wrapped(config,message);
  if(this.activation.type==="reaction"&&!canUseReaction(this,config))return false;
  const action=CONFIG.DND5E.activityActivationTypes[this.activation.type]?.consume;
  const resource=action&&foundry.utils.getProperty(actor.system,action.property);
  if(config.consume!==false&&config.consume?.action!==false&&resource&&resource.value<(this.activation.value??1)){
    ui.notifications.warn("Для этой попытки нет доступного действия. Проверка под болью не проводится.");return false;
  }
  if(message.create===false){ui.notifications.warn("Для проверки сотворения под болью нужны сохранённые карточки спасброска и расхода.");return false;}
  casting.add(actor.uuid);
  try{
    let r;
    for(const old of pending){
      const card=saveFor(actor,old);
      if(!fresh(old)){
        await actor.update({[mark(actor,old.event,"abandoned")]:true});
        ui.notifications.warn("Незавершённая попытка под болью относится к прошлому моменту. Мастер сверяет её потраченное действие; нынешние ресурсы за неё не списываются.");continue;
      }
      if(!card&&old.started||card&&failed(card)||old.activity===this.uuid&&info?.receipt.dc===old.dc&&info.origin.uuid===old.origin){r=old;break;}
      await actor.update({[mark(actor,old.event,"abandoned")]:true});
    }
    if(!r){
      if(!info||!arcanaEffectCast(info.effect))return await wrapped(config,message);
      const token=this.getUsageToken?.(),frame=phase(actor,token);if(frame===false){ui.notifications.warn("Выберите однозначный бой для попытки сотворения под болью.");return false;}
      const mode=message.rollMode??CONFIG.Dice.BasicRoll?.getMessageMode?.(),privateRoll=!!(message.data?.blind||message.data?.whisper?.length||info.origin.blind||info.origin.whisper?.length||token?.hidden);
      const blind=privateRoll||["blind","blindroll"].includes(mode),gmRoll=blind||["gm","gmroll"].includes(mode),selfRoll=["self","selfroll"].includes(mode);
      r={event:foundry.utils.randomID(),actor:actor.uuid,activity:this.uuid,name:this.item.name,img:this.item.img,
        activation:{type:this.activation.type,value:this.activation.value??1,condition:"Слово силы: боль — неудачное сотворение"},
        source:info.effect.uuid,
        origin:info.origin.uuid,dc:info.receipt.dc,token:token?.uuid??null,time:game.time.worldTime,phase:frame,
        author:game.user.id,whisper:gmRoll?game.users.filter(u=>u.isGM).map(u=>u.id):selfRoll?[game.user.id]:[],blind,started:false,spent:0};
      await actor.update({[`flags.spikependium.painAttempts.${r.event}`]:r});r=records(actor)[r.event];
    }
    let save=saveFor(actor,r);
    if(!save){
      if(r.started){ui.notifications.warn("Бросок Телосложения был начат, но не сохранился. Мастер восстанавливает этот исход вручную; нового автоматического броска нет.");return false;}
      await actor.update({[mark(actor,r.event,"started")]:true});
      const token=resolve(r.token);
      const rolls=await actor.rollSavingThrow({ability:"con",target:r.dc},{configure:false},{rollMode:modeFor(r),data:{
        speaker:ChatMessage.getSpeaker({actor,token,scene:token?.parent}),flavor:`Слово силы: боль — попытка сотворить ${foundry.utils.escapeHTML(r.name)}`,
        whisper:[...r.whisper],blind:r.blind,system:{origin:resolve(r.origin)?.id},flags:{spikependium:{painCastCheck:{actor:actor.uuid,event:r.event,source:r.source}}}}});
      save=saveFor(actor,r);
      if(!save){if(!rolls?.length)await actor.update({[mark(actor,r.event,"abandoned")]:true});else ui.notifications.warn("Результат проверки не сохранился. Мастер разрешает эту попытку вручную.");return false;}
    }
    if(!fresh(r)){ui.notifications.warn("Момент попытки изменился во время спасброска. Проверьте расход действия с Мастером.");return false;}
    if(failed(save)){
      const a=helper(actor,r),consumesAction=config.consume!==false&&config.consume?.action!==false;
      if(!consumesAction)await actor.update({[mark(actor,r.event,"skipAction")]:true});
      await a.consume(a._prepareUsageConfig({consume:{action:consumesAction,resources:false,spellSlot:false,usage:false}}),failureMessage(a,r));
      await finishReaction(a);
      await publish(actor,records(actor)[r.event]);return false;
    }
    config.spikependium={...config.spikependium,painCasting:r.event};
    return await wrapped(config,message);
  }catch(error){console.error("Spikependium: проверка сотворения под болью",error);
    ui.notifications.error("Попытка под болью не завершена. Повторное применение использует сохранённый результат; если он утрачен, исход разрешает Мастер. Проверьте карточки и расход.");return false;
  }finally{casting.delete(actor.uuid);}
}
export function preparePainCastingUpdates(a,config,updates){
  prepared.delete(a);const req=request(a),event=req?.event??config.spikependium?.painCasting;if(!event)return updates;
  const r=records(a.actor)[event],save=r&&saveFor(a.actor,r);
  if(!req&&r&&r.activity!==a.uuid)return updates;
  if(!r||r.actor!==a.actor.uuid||r.spent!==0||r.abandoned||!fresh(r)||!save||!!req!==failed(save)
    ||req&&(req.actor!==a.actor.uuid||a.item.type!=="feat")||!req&&r.activity!==a.uuid)return false;
  updates.actor[mark(a.actor,event,"spent")]=1;
  updates.actor[mark(a.actor,event,"failed")]=!!req;
  updates.actor[mark(a.actor,event,"save")]=save.uuid;
  updates.actor[mark(a.actor,event,"result")]=[{total:save.rolls[0].total,dc:r.dc,forced:!!save.system.forceSuccess}];
  if(req){
    if(updates.item.length||updates.create?.length||updates.delete?.length)return false;
    const deltas=Object.entries(foundry.utils.flattenObject(updates.actor)).flatMap(([keyPath,value])=>{
      const current=foundry.utils.getProperty(a.actor,keyPath);return typeof value==="number"&&typeof current==="number"&&value!==current?[{keyPath,delta:value-current}]:[];
    });
    const reaction=updates.actor["flags.spikependium.reactionId"];
    if(reaction){deltas.push({keyPath:`flags.spikependium.reactionCasts.${reaction}.spent`,delta:1});updates.actor[mark(a.actor,event,"reaction")]=reaction;}
    updates.actor[mark(a.actor,event,"receipt")]={actor:deltas,item:{}};
  }
  prepared.set(a,{actor:a.actor.uuid,event,failed:!!req});return updates;
}
export function recordPainCastingConsumption(a,_config,message){
  const r=prepared.get(a);prepared.delete(a);if(!r||records(a.actor)[r.event]?.spent!==1)return;
  foundry.utils.setProperty(message,"data.flags.spikependium.painCasting",r);
  const deltas=message.data.system.deltas.actor??=[],path=mark(a.actor,r.event,"spent");
  if(!deltas.some(d=>d.keyPath===path))deltas.push({keyPath:path,delta:1});
}
export async function recordPainCastingCard(a,card){
  const marker=card?.flags?.spikependium?.painCasting,r=marker&&records(a.actor)[marker.event];
  if(!card?.uuid||card.type!=="usage"||!r||r.card||r.spent!==1||marker.actor!==a.actor.uuid
    ||!card.author||!a.actor.testUserPermission(card.author,"OWNER")
    ||!card.system.deltas?.actor?.some(d=>d.keyPath===mark(a.actor,r.event,"spent")&&d.delta===1))return;
  await a.actor.update({[mark(a.actor,r.event,"card")]:card.uuid});
}
export async function resumePainFailures(document){
  const actor=document?.documentName==="ActorDelta"?document.parent?.actor:document;
  const actors=actor?.documentName==="Actor"?[actor]:[...new Map([...game.actors,...[...game.scenes].flatMap(s=>[...s.tokens].map(t=>t.actor))].filter(Boolean).map(a=>[a.uuid,a])).values()];
  for(const a of actors)for(const r of Object.values(records(a)))if(r?.spent===1&&r.receipt&&!r.card)await publish(a,r);
}
export function painCastingDeltaLabel(wrapped,...args){
  const data=wrapped(...args);if(/^flags\.spikependium\.painAttempts\.[A-Za-z0-9]{16}\.spent$/.test(this.keyPath))data.label="Попытка сотворения под болью";return data;
}
