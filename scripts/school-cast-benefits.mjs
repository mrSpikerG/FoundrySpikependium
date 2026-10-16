import { tokensDistance } from "./effects.mjs";
import { SCHOOL_SPEED_PROFILE_UUID } from "./generated.mjs";

const captured = new WeakMap(), prepared = new WeakMap(), queues = new Map();
const resolve = uuid => uuid && fromUuidSync(uuid,{strict:false});
const featFor = a => a?.item?.type === "spell" && a.item.system.level>0 && a.consumption?.spellSlot===true && ["abj","trs"].includes(a.item.system.school)
  && a.actor?.items.find(i => i.type==="feat" && i.flags.spikependium?.key===`feat:au-school-adept-${a.item.system.school}`);
const authority = origin => game.users.activeGM ? game.user.isActiveGM : origin.author?.id === game.user.id;
const phase = () => game.combat?.started ? {combat:game.combat.uuid,round:game.combat.round,turn:game.combat.turn} : null;
function samePhase(r) {
  if (!r.phase) return !game.combat?.started;
  const combat = resolve(r.phase.combat);
  return !!combat?.started && combat.round===r.phase.round && combat.turn===r.phase.turn;
}
function ownTurn(a) {
  const source = a.getUsageToken?.(), available = [...game.combats].filter(c => c.started && c.combatant?.actor?.uuid === a.actor.uuid
    && source?.actor?.uuid === a.actor.uuid && c.combatant.token?.uuid === source.uuid);
  const combat = available.includes(game.combat) ? game.combat : available.length === 1 ? available[0] : null;
  return combat ? { combat:combat.uuid,round:combat.round,turn:combat.turn } : null;
}
function inTurn(r) {
  const c = resolve(r.frame?.combat);
  return !!c?.started && c.round === r.frame.round && c.turn === r.frame.turn && c.combatant?.actor?.uuid === r.caster;
}
function recipient(a, uuid, source=a.getUsageToken?.()) {
  if (!uuid || uuid === a.actor.uuid) return {actor:a.actor.uuid,token:a.getUsageToken?.()?.uuid??null};
  const token = resolve(uuid), distance = token && source && tokensDistance(source,token);
  return token?.actor?.system.isCreature && !token.actor.statuses.has("dead") && source?.actor?.uuid === a.actor.uuid
    && source.parent === token.parent && distance != null && distance <= 30 ? {actor:token.actor.uuid,token:token.uuid} : null;
}
export function prepareSchoolBenefitDialog(a,config,dialog) {
  if (!featFor(a) || a.item.system.school !== "abj" || config.consume===false || config.consume?.spellSlot===false) return;
  config.spikependium = {...config.spikependium,schoolWardTarget:config.spikependium?.schoolWardTarget??a.actor.uuid};
  const Base = dialog.applicationClass; dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context,options) {
      context = await super._prepareConsumptionContext(context,options);
      const targets = [...game.user.targets].map(t=>t.document??t).filter(t=>recipient(a,t.uuid));
      context.fields.push({name:"spikependium.schoolWardTarget",value:this.config.spikependium.schoolWardTarget,
        field:new foundry.data.fields.StringField({label:"Защитные чары: получатель временных хитов",choices:{[a.actor.uuid]:"Сам заклинатель",
          ...Object.fromEntries(targets.filter(t=>t.actor.uuid!==a.actor.uuid).map(t=>[t.uuid,t.name]))},hint:"Бонус равен удвоенному уровню реально потраченной ячейки. Для другой цели отметьте её до открытия окна."})},
      {name:"spikependium.schoolWardVisible",value:this.config.spikependium?.schoolWardVisible??false,
        field:new foundry.data.fields.BooleanField({label:"Вижу выбранное другое существо в пределах 30 футов"}),input:context.inputs.createCheckboxInput});
      context.hasConsumption = true; return context;
    }
  };
}
export function captureSchoolBenefit(a,config,message) {
  if (message.data?.flags?.spikependium) delete message.data.flags.spikependium.schoolBenefit;
  captured.delete(a); const feat = featFor(a); if (!feat) return;
  if (config.consume===false || config.consume?.spellSlot===false) return;
  const kind = a.item.system.school, frame = kind === "trs" ? ownTurn(a) : null;
  if (kind === "trs" && !frame) return;
  const target = kind === "abj" ? recipient(a,config.spikependium?.schoolWardTarget) : {actor:a.actor.uuid,token:a.getUsageToken?.()?.uuid??null};
  if (!target || !a.actor.isOwner || message.create === false || target.actor !== a.actor.uuid && config.spikependium?.schoolWardVisible !== true
    || !game.users.activeGM && !resolve(target.actor)?.isOwner) {
    ui.notifications.warn("Адепт школы: нужны исходная карточка, подходящий получатель, видимость другой цели и Мастер либо права на неё."); return false;
  }
  captured.set(a,{caster:a.actor.uuid,activity:a.uuid,feat:feat.uuid,kind,target,time:game.time.worldTime,phase:kind==="trs"?frame:phase(),frame,
    start:frame?ActiveEffect.implementation.getEffectStart(resolve(frame.combat)):null,sourceToken:a.getUsageToken?.()?.uuid??null});
  if (a.getUsageToken?.()?.hidden || resolve(target.token)?.hidden) {
    message.data ??= {}; message.data.whisper = game.users.filter(u=>u.isGM).map(u=>u.id); message.data.blind = true;
  }
}
function paidSlot(a,config,updates) {
  const entries = Object.entries(foundry.utils.flattenObject(updates.actor)).filter(([path,value]) => /^system\.spells\.(spell[1-9]|pact)\.value$/.test(path)
    && Number.isFinite(value) && foundry.utils.getProperty(a.actor,path)-value===1);
  const entry = config.spell?.slot ? entries.find(([path])=>path===`system.spells.${config.spell.slot}.value`) : entries.length===1?entries[0]:null;
  if (!entry) return;
  const slot = entry[0].split(".")[2], level = slot === "pact" ? a.actor.system.spells.pact.level : Number(slot.slice(5));
  return Number.isInteger(level) && level>=1 && level<=9 ? {slot,level} : null;
}
export function prepareSchoolBenefitUpdates(a,config,updates) {
  prepared.delete(a); const r = captured.get(a); if (!r || !featFor(a)) return updates;
  const slot = paidSlot(a,config,updates); if (!slot) return updates;
  const target = r.kind === "abj" && recipient(a,r.target.actor===a.actor.uuid?a.actor.uuid:r.target.token);
  if (game.time.worldTime!==r.time || !samePhase(r) || r.feat!==featFor(a).uuid || (a.getUsageToken?.()?.uuid??null)!==r.sourceToken
    || r.kind === "trs" && JSON.stringify(ownTurn(a))!==JSON.stringify(r.frame)
    || r.kind === "abj" && (!target || JSON.stringify(target)!==JSON.stringify(r.target))) return false;
  const event = foundry.utils.randomID(), receipt = {...r,...slot,event,amount:slot.level*(r.kind==="abj"?2:5)};
  updates.actor[`flags.spikependium.schoolBenefits.${event}`] = {...receipt,active:1}; prepared.set(a,receipt); return updates;
}
export function recordSchoolBenefitConsumption(a,_config,message) {
  const r = prepared.get(a); if (!r || a.actor.flags.spikependium?.schoolBenefits?.[r.event]?.active!==1) return;
  const path = `flags.spikependium.schoolBenefits.${r.event}.active`, deltas = message.data.system.deltas.actor ??= [];
  if (!deltas.some(d=>d.keyPath===path)) deltas.push({keyPath:path,delta:1});
}
export function recordSchoolBenefitUsage(a,message) {
  const r = prepared.get(a); prepared.delete(a);
  if (r && a.actor.flags.spikependium?.schoolBenefits?.[r.event]?.active===1) {
    foundry.utils.setProperty(message,"data.flags.spikependium.schoolBenefit",r);
    const label = r.kind==="abj"?`Защитные чары: ${foundry.utils.escapeHTML(resolve(r.target.actor)?.name??"выбранная цель")}, ${r.amount} временных хитов`
      :`Магическое усиление: +${r.amount} футов Скорости до конца своего хода`;
    message.data.flavor = `${message.data.flavor??""}<p>${label}</p>`;
  }
}
function info(origin) {
  const r = origin?.flags.spikependium?.schoolBenefit, caster = resolve(r?.caster), a = origin?.getAssociatedActivity?.({scaled:true});
  const record = caster?.flags.spikependium?.schoolBenefits?.[r?.event], feat = resolve(r?.feat);
  if (origin?.type!=="usage" || !r || !record || record.active!==1 || !["abj","trs"].includes(r.kind) || !/^[A-Za-z0-9]{16}$/.test(r.event)
    || !Number.isInteger(r.level) || r.level<1 || r.level>9 || !/^(spell[1-9]|pact)$/.test(r.slot)
    || r.slot!=="pact"&&Number(r.slot.slice(5))!==r.level || r.amount!==r.level*(r.kind==="abj"?2:5)
    || r.kind==="trs"&&r.target.actor!==r.caster
    || a?.actor?.uuid!==r.caster || a.uuid!==r.activity || a.item.type!=="spell" || a.item.system.school!==r.kind
    || feat?.actor?.uuid!==r.caster || feat.flags.spikependium?.schoolAdept?.school!==r.kind || !caster.items.has(feat.id)
    || !origin.author || !caster.testUserPermission(origin.author,"OWNER")
    || JSON.stringify(r)!==JSON.stringify(Object.fromEntries(Object.entries(record).filter(([k])=>!["active","applied"].includes(k))))
    || !origin.system.deltas?.actor?.some(d=>d.keyPath===`flags.spikependium.schoolBenefits.${r.event}.active`&&d.delta===1)
    || !origin.system.deltas.actor.some(d=>d.keyPath===`system.spells.${r.slot}.value`&&d.delta===-1)) return;
  return {r,caster,feat,activity:a};
}
async function queue(actor, task) {
  // shortcut: cross-client writes follow native document saves; arbitrate simultaneous unrelated temporary-HP changes with the GM.
  const old = queues.get(actor.uuid) ?? Promise.resolve(), next = old.catch(()=>{}).then(task); queues.set(actor.uuid,next);
  try {return await next;} finally {if(queues.get(actor.uuid)===next)queues.delete(actor.uuid);}
}
async function late(origin) {
  if (origin.flags.spikependium.schoolBenefitNeedsReview) return;
  await origin.setFlag("spikependium","schoolBenefitNeedsReview",true);
  ui.notifications.warn("Польза Адепта школы не была разрешена в исходный момент. Мастер сверяет последствия вручную.");
}
async function apply(origin) {
  const value = info(origin); if (!value || !authority(origin) || origin.flags.spikependium.schoolBenefitProcessed) return;
  const {r,caster,feat} = value, target = resolve(r.target.actor); if (!target?.isOwner) return;
  if (r.kind === "abj") {
    if (!target.flags.spikependium?.schoolWardGrants?.[r.event]) {
      if (game.time.worldTime!==r.time || !samePhase(r) || !recipient(value.activity,r.target.actor===r.caster?r.caster:r.target.token,resolve(r.sourceToken))) {
        await late(origin); return;
      }
      await target.update({"system.attributes.hp.temp":Math.max(target.system.attributes.hp.temp??0,r.amount),
        [`flags.spikependium.schoolWardGrants.${r.event}`]:{source:origin.uuid,amount:r.amount}});
    }
  } else {
    if (!inTurn(r)) { await late(origin); return; }
    if (caster.flags.spikependium.schoolBenefits[r.event].applied) {
      await origin.setFlag("spikependium","schoolBenefitProcessed",true); return;
    }
    let existing = caster.effects.find(e=>e.flags.spikependium?.schoolSpeed?.event===r.event);
    if (!existing) {
      let template = feat.effects.find(e=>e.flags.spikependium?.schoolSpeedTemplate);
      if (!template) template = (await fromUuid(SCHOOL_SPEED_PROFILE_UUID))?.effects.find(e=>e.flags.spikependium?.schoolSpeedTemplate);
      if (!template) throw Error("Не найден профиль скорости Адепта школы");
      if (!info(origin) || !authority(origin)) return;
      if (!inTurn(r)) { await late(origin); return; }
      const data = template.toObject(); delete data._key;
      Object.assign(data,{_id:dnd5e.utils.staticID(`spikependium:schoolSpeed:${r.caster}:${r.event}`),disabled:false,transfer:false,start:r.start,
        description:`Скорость увеличена на ${r.amount} футов до конца текущего своего хода.`});
      data.flags.spikependium.schoolSpeed = {source:origin.uuid,event:r.event,amount:r.amount};
      for (const change of data.system.changes) if (change.key==="system.attributes.movement.bonus") change.value=String(r.amount);
      data.system.origin = {activity:r.activity,message:origin.uuid,effect:template.uuid,profile:template.id}; data.system.magical = true;
      data._stats = {...data._stats,compendiumSource:null,duplicateSource:null};
      [existing] = await caster.createEmbeddedDocuments("ActiveEffect",[data],{keepId:true});
    }
    await caster.update({[`flags.spikependium.schoolBenefits.${r.event}.applied`]:{source:existing.flags.spikependium.schoolSpeed.source,effect:existing.id}});
  }
  await origin.setFlag("spikependium","schoolBenefitProcessed",true);
}
export async function resumeSchoolBenefits(document) {
  const actor = document?.documentName==="ActorDelta"?document.parent?.actor:document?.actor??document;
  for (const origin of game.messages) {
    const r = origin.flags.spikependium?.schoolBenefit;
    if (!r || !authority(origin) || document && document.uuid!==origin.uuid && ![r.caster,r.target.actor].includes(actor?.uuid)) continue;
    const target = resolve(r.target.actor); if (target) await queue(target,()=>apply(origin));
  }
}
function speedValid(effect) {
  const mark = effect.flags.spikependium?.schoolSpeed, value = mark && info(resolve(mark.source));
  return !effect.disabled && !effect.duration.expired && !(Number.isFinite(effect.duration.remaining)&&effect.duration.remaining<=0)
    && value?.r.kind==="trs" && value.r.caster===effect.actor?.uuid && inTurn(value.r) ? value : null;
}
export function schoolSpeedSuppression(wrapped,...args) {
  if (!this.flags.spikependium?.schoolSpeedTemplate) return wrapped(...args);
  if (!speedValid(this)) return true;
  const candidates = this.actor.effects.map(effect=>({effect,value:effect.flags.spikependium?.schoolSpeed&&speedValid(effect)})).filter(e=>e.value)
    .sort((a,b)=>b.value.r.amount-a.value.r.amount||b.effect.id.localeCompare(a.effect.id));
  return candidates[0]?.effect!==this || wrapped(...args);
}
export function schoolSpeedChange(wrapped,model,change,...args) {
  if (model?.documentName==="Actor" && change.key==="system.attributes.movement.bonus" && change.effect?.flags.spikependium?.schoolSpeed) {
    const value = info(resolve(change.effect.flags.spikependium.schoolSpeed.source));
    if (value) change = {...change,value:String(dnd5e.utils.convertLength(value.r.amount,"ft",model.system.attributes.movement.units??dnd5e.utils.defaultUnits("length")))};
  }
  return wrapped(model,change,...args);
}
export async function cleanSchoolSpeed() {
  const actors = [...new Map([...game.actors,...[...game.scenes].flatMap(s=>[...s.tokens].map(t=>t.actor))].filter(Boolean).map(a=>[a.uuid,a])).values()];
  for (const actor of actors) {
    const effects = actor.effects.filter(e=>e.flags.spikependium?.schoolSpeed); if (!effects.length) continue;
    actor.reset(); actor.sheet?.render(false);
    const stale = effects.filter(e=>{const value=info(resolve(e.flags.spikependium.schoolSpeed.source));
      return !value||!inTurn(value.r)||e.duration.expired||(Number.isFinite(e.duration.remaining)&&e.duration.remaining<=0);}).map(e=>e.id);
    const writer = game.users.activeGM?game.user.isActiveGM:[...game.users].filter(u=>u.active&&actor.testUserPermission(u,"OWNER")).sort((a,b)=>a.id.localeCompare(b.id))[0]?.id===game.user.id;
    if (stale.length && actor.isOwner && writer)
      await actor.deleteEmbeddedDocuments("ActiveEffect",stale);
  }
}
export function schoolBenefitDeltaLabel(wrapped,...args) {
  const data = wrapped(...args);
  if (/^flags\.spikependium\.schoolBenefits\.[A-Za-z0-9]{16}\.active$/.test(this.keyPath)) data.label = "Польза Адепта школы";
  return data;
}
export function schoolBenefitError(error) {
  console.error("Spikependium: польза Адепта школы",error);
  ui.notifications.error("Не удалось завершить пользу Адепта школы. Проверьте исходную карточку; повторное подключение продолжит сохранённое применение без новой ячейки.");
}
