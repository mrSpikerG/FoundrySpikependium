import { arcanaCast } from "./arcana-spells.mjs";
import { tokensDistance } from "./effects.mjs";

const resolve=uuid=>uuid&&fromUuidSync(uuid,{strict:false});
const captured=new WeakMap(),prepared=new WeakMap();
const stage=activity=>activity?.item?.type==="spell"?activity.flags?.spikependium?.arcanaStage:undefined;
const live=e=>e?.active&&!e.duration.expired&&!(Number.isFinite(e.duration.remaining)&&e.duration.remaining<=0);
const keys={"lightning-ring":"spell:au-lightning-ring","grave-ground":"spell:au-grave-ground",
  "negative-energy-living":"spell:au-negative-energy-flood","negative-energy-undead":"spell:au-negative-energy-flood","detonate-burst":"spell:au-detonate"};
function ongoing(activity){
  const kind=stage(activity),actor=activity.actor;
  if(!["lightning-ring","grave-ground"].includes(kind)||activity.item.flags.spikependium?.key!==keys[kind])return;
  for(const effect of actor.effects){
    const origin=resolve(effect.system.origin?.message),info=arcanaCast(origin);
    if(effect.flags.spikependium?.arcanaOngoing===kind&&live(effect)&&info?.caster.uuid===actor.uuid
      &&info.receipt.kind===kind&&info.activity.item.uuid===activity.item.uuid&&live(info.concentration))return info;
  }
}
export function canUseArcanaStage(activity){
  if(activity?.item?.flags.spikependium?.key==="spell:au-detonate"&&activity.type==="save"&&!stage(activity)){
    const targets=[...game.user.targets].map(t=>t.document??t);
    if(targets.length===1&&targets[0].actor?.system.isCreature)return true;
    ui.notifications.warn("Для семени Детонации выберите ровно одно существо.");return false;
  }
  const kind=stage(activity);if(!kind||activity.item.flags.spikependium?.key!==keys[kind])return true;
  if(["lightning-ring","grave-ground"].includes(kind)){
    if(ongoing(activity))return true;
    ui.notifications.warn("Сначала создайте область этого заклинания и сохраняйте её концентрацию.");return false;
  }
  if(kind.startsWith("negative-energy-")){
    const targets=[...game.user.targets].map(t=>t.document??t);
    const undead=kind==="negative-energy-undead";
    if(targets.length===1&&targets[0].actor?.system.isCreature
      &&(targets[0].actor.system.details.type.value==="undead")===undead)return true;
    ui.notifications.warn(undead?"Выберите ровно одно существо-нежить для временных хитов.":"Выберите ровно одно существо, не являющееся нежитью.");return false;
  }
  return true;
}
function detonateOrigins(activity){
  return [...game.messages].filter(m=>m.type==="usage"&&m.flags.spikependium?.detonateCast?.actor===activity.actor.uuid
    &&m.getAssociatedActivity()?.item.uuid===activity.item.uuid&&m.getAssociatedActivity()?.type==="save"
    &&!stage(m.getAssociatedActivity())&&m.author&&activity.actor.testUserPermission(m.author,"OWNER"));
}
export function prepareArcanaStage(activity,config,dialog){
  if(stage(activity)!=="detonate-burst"||activity.item.flags.spikependium?.key!==keys["detonate-burst"])return;
  const origins=detonateOrigins(activity);
  config.spikependium={...config.spikependium,detonateOrigin:config.spikependium?.detonateOrigin??origins.at(-1)?.uuid??""};
  const Base=dialog.applicationClass;dialog.configure=true;
  dialog.applicationClass=class extends Base{
    async _prepareConsumptionContext(context,options){
      context=await super._prepareConsumptionContext(context,options);
      context.fields.push({name:"spikependium.detonateOrigin",value:this.config.spikependium.detonateOrigin,
        field:new foundry.data.fields.StringField({label:"Исходная Детонация",choices:{"":"Сначала наложите семя",
          ...Object.fromEntries(origins.map(m=>[m.uuid,resolve(m.flags.spikependium.detonateCast.target)?.name??m.id]))}})},
      {name:"spikependium.detonateDowned",value:this.config.spikependium?.detonateDowned??false,
        field:new foundry.data.fields.BooleanField({label:"Урон семени снизил хиты первичной цели до 0: помеха Ловкости"}),
        input:context.inputs.createCheckboxInput});context.hasConsumption=true;return context;
    }
  };
}
export function captureArcanaStage(activity,config,message){
  captured.delete(activity);
  if(!canUseArcanaStage(activity))return false;
  if(stage(activity)?.startsWith("negative-energy-")){
    const targets=message.data?.system?.targets;
    if(targets){
      const token=[...game.user.targets][0]?.document??[...game.user.targets][0];
      if(targets.length!==1||targets[0].actor!==token?.actor?.uuid||(targets[0].token&&targets[0].token!==token.uuid)){
        ui.notifications.warn("Цель Потока негативной энергии изменилась. Повторите накладывание.");return false;
      }
    }
  }
  if(stage(activity)!=="detonate-burst"||activity.item.flags.spikependium?.key!==keys["detonate-burst"])return;
  const origin=resolve(config.spikependium?.detonateOrigin),receipt=origin?.flags.spikependium?.detonateCast;
  const target=resolve(receipt?.target);
  const tokens=[...game.user.targets].map(t=>t.document??t);
  if(!detonateOrigins(activity).includes(origin)||activity.actor.flags.spikependium?.detonateBursts?.[origin?.id]?.spent===1
    ||!target?.actor||!tokens.length||tokens.some(token=>!token.actor?.system.isCreature
    ||token.actor.uuid===receipt.victim||token.parent!==target.parent||tokensDistance(target,token)==null||tokensDistance(target,token)>60)){
    ui.notifications.warn("Для взрыва выберите исходную Детонацию и существ в 60 футах от её первичной цели, исключая эту цель.");return false;
  }
  foundry.utils.setProperty(message,"data.flags.spikependium.detonateBurst",{origin:origin.uuid,downed:config.spikependium?.detonateDowned===true});
  captured.set(activity,origin);
}
export function prepareArcanaStageUpdates(activity,_config,updates){
  prepared.delete(activity);
  if(stage(activity)!=="detonate-burst"||activity.item.flags.spikependium?.key!==keys["detonate-burst"])return updates;
  const origin=captured.get(activity);
  if(!origin||activity.actor.flags.spikependium?.detonateBursts?.[origin.id]?.spent===1)return false;
  const path=`flags.spikependium.detonateBursts.${origin.id}.spent`;
  updates.actor[path]=1;prepared.set(activity,path);return updates;
}
export function recordArcanaStageConsumption(activity,_config,message){
  const path=prepared.get(activity);prepared.delete(activity);
  if(!path||foundry.utils.getProperty(activity.actor,path)!==1)return;
  const deltas=message.data.system.deltas.actor??=[];
  if(!deltas.some(d=>d.keyPath===path))deltas.push({keyPath:path,delta:1});
}
export function arcanaStageDeltaLabel(wrapped,...args){
  const data=wrapped(...args);
  if(/^flags\.spikependium\.detonateBursts\.[A-Za-z0-9]{16}\.spent$/.test(this.keyPath))data.label="Взрыв Детонации";
  if(/^flags\.spikependium\.bloom(Casts|Healing)\.[A-Za-z0-9]{16}\.spent$/.test(this.keyPath))data.label="Увядание и цветение: лечение";
  return data;
}
export function recordDetonateCast(activity,message){
  if(activity?.item?.flags.spikependium?.key!=="spell:au-detonate"||activity.type!=="save"||stage(activity))return;
  const targets=message.data?.system?.targets??[];
  if(targets.length===1)foundry.utils.setProperty(message,"data.flags.spikependium.detonateCast",{
    actor:activity.actor.uuid,target:targets[0].token,victim:targets[0].actor});
}
export function prepareDetonateSave(config,_dialog,message){
  const id=message.data?.system?.origin,origin=typeof id==="string"?game.messages.get(id):id;
  const activity=origin?.getAssociatedActivity?.(),receipt=origin?.flags.spikependium?.detonateBurst;
  const initial=resolve(receipt?.origin),saved=initial?.flags.spikependium?.detonateCast;
  if(config.ability!=="dex"||stage(activity)!=="detonate-burst"||!receipt?.downed
    ||activity.item.flags.spikependium?.key!=="spell:au-detonate"||saved?.actor!==activity.actor.uuid
    ||!origin.author||!activity.actor.testUserPermission(origin.author,"OWNER"))return;
  for(const roll of config.rolls){roll.options??={};roll.options.advantage||=roll.options.advantageMode===1;
    roll.options.disadvantage=true;if(roll.options.advantageMode!==undefined)roll.options.advantageMode=roll.options.advantage?0:-1;}
}
export async function arcanaStageScaling(wrapped,config,message,item){
  if(stage(this)==="grave-ground"){
    const info=ongoing(this);if(!info)throw Error("Кладбищенская земля больше не активна");
    if(!Number.isInteger(info.receipt.level)||info.receipt.level<5||info.receipt.level>9)throw Error("Недопустимый уровень исходной Кладбищенской земли");
    config.spell={...config.spell,slot:null};config.scaling=info.receipt.level-item._source.system.level;
  }
  return wrapped(config,message,item);
}

function damageActor(config, message) {
  const subject = config.subject;
  if (subject?.actor) return subject.actor;
  if (subject?.documentName === "Actor") return subject;
  const speaker = message.data?.speaker;
  return speaker?.scene && speaker?.token ? resolve(`Scene.${speaker.scene}.Token.${speaker.token}`)?.actor
    : speaker?.actor ? resolve(`Actor.${speaker.actor}`) : undefined;
}
function groundWeakness(actor) {
  return actor?.effects?.find(effect => {
    if (!live(effect)) return false;
    if (effect.flags?.spikependium?.graveGroundWeakness) return true;
    const origin = resolve(effect.system?.origin?.activity);
    return origin?.type === "save" && stage(origin) === "grave-ground" && origin.item.flags.spikependium?.key === keys["grave-ground"];
  });
}
const damagePart = roll => !(roll.options?.type in CONFIG.DND5E.healingTypes);
export function prepareGroundDamage(config, dialog, message) {
  const actor = damageActor(config, message), effect = groundWeakness(actor);
  if (!effect || config.subject?.type === "heal" || message.data?.type === "healing") return;
  const parts = config.rolls.map((roll, index) => damagePart(roll) ? [String(index), roll.parts?.join(" + ") ?? String(index + 1)] : null).filter(Boolean);
  if (!parts.length) return;
  config.spikependium = { ...config.spikependium, groundDamage: { actor: actor.uuid, effect: effect.uuid,
    first: config.spikependium?.groundDamage?.first ?? parts[0][0] } };
  if (parts.length === 1) return;
  const Base = dialog.applicationClass ?? CONFIG.Dice.DamageRoll.DefaultConfigurationDialog;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConfigurationContext(context, options) {
      context = await super._prepareConfigurationContext(context, options);
      context.fields.push({ name: "spikependium.groundDamageFirst", value: this.config.spikependium.groundDamage.first,
        field: new foundry.data.fields.StringField({ label: "Кладбищенская земля: первый уменьшаемый компонент", choices: Object.fromEntries(parts) }) });
      return context;
    }
    _buildConfig(roll, formData, index) {
      roll = super._buildConfig(roll, formData, index);
      this.config.spikependium.groundDamage.first = formData?.get("spikependium.groundDamageFirst") ?? this.config.spikependium.groundDamage.first;
      return roll;
    }
  };
}
export async function groundDamage(wrapped, rolls, config = {}, message = {}, ...args) {
  const selected = config.spikependium?.groundDamage, actor = damageActor(config, message), effect = groundWeakness(actor);
  if (!selected || actor?.uuid !== selected.actor || !effect || config.evaluate === false
    || config.subject?.type === "heal" || message.data?.type === "healing") return wrapped(rolls, config, message, ...args);
  const result = await wrapped(rolls, config, message, ...args);
  const parts = new Map(rolls.flatMap((roll, index) => roll instanceof CONFIG.Dice.DamageRoll && roll._evaluated
    && Number.isFinite(roll.total) ? [[index, dnd5e.dice.aggregateDamageRolls([roll], { respectProperties: true })
      .filter(part => damagePart(part) && Number.isFinite(part.total) && part.total > 0)]] : []));
  const indexes = [...parts].filter(([, values]) => values.length).map(([index]) => index);
  if (!indexes.length || rolls.some(roll => roll.options?.spikependiumGroundDamage)) return result;
  const first = Number(selected.first), order = indexes.includes(first) ? [first, ...indexes.filter(i => i !== first)] : indexes;
  const penalty = await new CONFIG.Dice.BasicRoll("1d6").evaluate();
  if (!Number.isInteger(penalty.total) || penalty.total < 1 || penalty.total > 6) throw Error("Кладбищенская земля: недопустимый результат к6");
  let remaining = penalty.total;
  const changes = [];
  // shortcut: raw Roll.reroll retains the allocated constant; use the usage card for a fresh penalty, or extend the grouped reroll workflow.
  for (const index of order) {
    const roll = rolls[index], data = roll.toJSON(), allocations = [];
    for (const part of parts.get(index)) {
      const amount = Math.min(part.total, remaining);
      if (!amount) continue;
      const type = part.options.type;
      data.formula += ` - ${amount}${type ? `[${type}]` : ""}`;
      data.terms.push(new foundry.dice.terms.OperatorTerm({ operator: "-" }).toJSON(),
        new foundry.dice.terms.NumericTerm({ number: amount, options: type ? { flavor: type } : {} }).toJSON());
      data.total -= amount; remaining -= amount; allocations.push({ type, amount });
    }
    if (!allocations.length) continue;
    data.options.configured = true; data.options.preprocessed = true;
    data.options.spikependiumGroundDamage = { effect: effect.uuid, allocations, penalty: penalty.toJSON() };
    const reduced = CONFIG.Dice.DamageRoll.fromData(data);
    if (!reduced._evaluated || reduced.total !== data.total) throw Error("Кладбищенская земля: не удалось сохранить уменьшенный урон");
    changes.push([index, reduced]);
  }
  for (const [index, roll] of changes) rolls[index] = roll;
  foundry.utils.setProperty(message, "data.flags.spikependium.groundDamage", { actor: actor.uuid, effect: effect.uuid,
    penalty: penalty.toJSON(), applied: penalty.total - remaining, first: order[0] });
  if (message.create !== false) await penalty.toMessage({ type: "generic", flavor: "Кладбищенская земля: уменьшение урона на 1к6",
    speaker: message.data?.speaker, system: { origin: message.data?.system?.origin },
    ...(message.data?.whisper ? { whisper: message.data.whisper, blind: message.data.blind } : {}) }, { rollMode: message.rollMode });
  return result;
}
