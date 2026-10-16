import {arcanaEffectCast} from "./arcana-spells.mjs";
import {tokensDistance} from "./effects.mjs";

const casting=a=>a?.item?.flags.spikependium?.key==="spell:au-power-word-pain"&&a.consumption?.spellSlot===true;
const actorOf=config=>config.subject?.actor??config.subject;
const pains=actor=>actor?.effects?.filter(e=>e.flags.spikependium?.arcanaSpell==="power-word-pain"&&arcanaEffectCast(e))??[];
const d20Windows=new WeakMap();
export function preparePainTarget(a,config,dialog) {
  if(!casting(a))return;
  const Base=dialog.applicationClass;dialog.configure=true;
  dialog.applicationClass=class extends Base {
    async _prepareConsumptionContext(context,options) {
      context=await super._prepareConsumptionContext(context,options);
      context.fields.push({name:"spikependium.painVisible",value:this.config.spikependium?.painVisible??false,
        field:new foundry.data.fields.BooleanField({label:"Слово силы: боль — вижу отмеченную цель в пределах 60 футов"}),input:context.inputs.createCheckboxInput});
      context.hasConsumption=true;return context;
    }
  };
}
export function capturePainTarget(a,config,message) {
  if(!casting(a))return;
  const selected=[...game.user.targets].map(t=>t.document??t),target=selected[0],source=a.getUsageToken?.()??(target?.actor?.uuid===a.actor.uuid?target:null);
  const distance=source&&target&&tokensDistance(source,target),targets=message.data?.system?.targets;
  if(selected.length!==1||!target.actor?.system.isCreature||source?.actor?.uuid!==a.actor.uuid||source.parent!==target.parent
    ||distance==null||distance>60||config.spikependium?.painVisible!==true||message.create===false
    ||targets&&(targets.length!==1||targets[0].actor!==target.actor.uuid||targets[0].token!==target.uuid)) {
    ui.notifications.warn("Слово силы: боль — нужны исходная карточка, один токен существа, подтверждённая видимость и расстояние до 60 футов.");return false;
  }
  if(source.hidden||target.hidden){message.data??={};message.data.whisper=game.users.filter(u=>u.isGM).map(u=>u.id);message.data.blind=true;}
}
export function painMovement(wrapped,...args) {
  const result=wrapped(...args),actor=this.parent;
  if(!pains(actor).length)return result;
  const movement=this.attributes.movement,limit=dnd5e.utils.convertLength(10,"ft",movement.units??dnd5e.utils.defaultUnits("length"));
  const types=Object.keys(CONFIG.DND5E.movementTypes);
  for(const type of types)if(Number.isFinite(movement.speeds[type]))movement.speeds[type]=Math.min(movement.speeds[type],limit);
  movement.max=Math.max(0,...types.map(t=>movement.speeds[t]).filter(Number.isFinite));
  movement.slowed=movement.speeds.walk<=dnd5e.utils.simplifyBonus(this._source.attributes.movement.speeds.walk,actor.getRollData())/2;
  return result;
}
export function preparePainD20(config) {
  d20Windows.set(config,pains(actorOf(config)).map(e=>e.uuid).sort());
}
export function preparePainSave(config) {if(config.ability!=="con")preparePainD20(config);}
export function finalizePainD20(rolls,config) {
  const current=pains(actorOf(config)).map(e=>e.uuid).sort(),prior=d20Windows.get(config)??[];
  if(JSON.stringify(prior)!==JSON.stringify(current)){
    ui.notifications.warn("Слово силы: боль изменилось. Повторите Тест к20 с актуальными условиями.");return false;
  }
}
export function finalizePainSave(rolls,config) {if(config.ability!=="con")return finalizePainD20(rolls,config);}
export function refreshPainActors() {
  const actors=[...new Map([...game.actors,...[...game.scenes].flatMap(s=>[...s.tokens].map(t=>t.actor))].filter(Boolean).map(a=>[a.uuid,a])).values()];
  for(const actor of actors)if(actor.effects.some(e=>e.flags.spikependium?.arcanaSpell==="power-word-pain")){
    actor.reset();actor.sheet?.render(false);
  }
}
