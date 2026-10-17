import { tokensDistance } from "./effects.mjs";
import { familiarCaster as casterOf } from "./familiar-source.mjs";

const KEY="feat:au-soothing-familiar",roots=new WeakSet();
const resolve=uuid=>uuid&&fromUuidSync(uuid,{strict:false});
const actorOf=config=>config.subject?.documentName==="Actor"?config.subject:config.subject?.actor;
const kindOf=(config,message)=>config.hookNames?.includes("hitDie")||message.data?.type==="hitDie"?"hitDie"
  :config.rolls?.some(r=>r.options?.type==="healing")?"healing":null;
const active=e=>e.active&&!e.duration?.expired&&!(Number.isFinite(e.duration?.remaining)&&e.duration.remaining<=0);
const readable=token=>token?.actor&&(game.user.isGM||!token.hidden&&token.actor.testUserPermission(game.user,"LIMITED"));
function within(a,b,feet){if(a.parent!==b.parent||a.level!==b.level)return false;const distance=tokensDistance(a,b);return Number.isFinite(distance)&&distance<=feet+1e-7;}
function choices(config,message){
 const actor=actorOf(config);if(!kindOf(config,message)||!actor?.isOwner||!actor.system.isCreature)return [];
 const out=new Map(),tokens=dnd5e.utils.getSceneTargets(actor).map(t=>t.document??t);
 for(const healer of tokens){if(healer.actor?.uuid!==actor.uuid||!readable(healer))continue;
  for(const familiar of healer.parent.tokens){if(!readable(familiar)||!(familiar.actor.system.attributes?.hp?.value>0)||familiar.actor.statuses.has("dead")||!within(healer,familiar,5))continue;
   const caster=casterOf(familiar);if(!caster||!caster.items.some(i=>i.flags.spikependium?.key===KEY)||!game.user.isGM&&!caster.testUserPermission(game.user,"LIMITED"))continue;
   const effect=(caster.appliedEffects??caster.effects).find(e=>e.flags.spikependium?.soothingBeacon&&active(e));if(!effect)continue;
   for(const owner of healer.parent.tokens){if(owner.actor?.uuid!==caster.uuid||!readable(owner)||!within(owner,familiar,120))continue;
    const key=[familiar.uuid,healer.uuid,owner.uuid].join("|"),mark={healer:actor.uuid,healerToken:healer.uuid,familiar:familiar.uuid,caster:caster.uuid,casterToken:owner.uuid,effect:effect.uuid};
    out.set(key,{key,mark,label:`${familiar.name} · ${healer.name} · ${owner.name}`});
   }
  }
 }return [...out.values()];
}
export function prepareSoothingHealing(config,dialog,message){
 if(!choices(config,message).length)return;
 config.spikependium={...config.spikependium,soothingBeacon:config.spikependium?.soothingBeacon??"none"};
 const Base=dialog.applicationClass??(kindOf(config,message)==="hitDie"?CONFIG.Dice.BasicRoll:CONFIG.Dice.DamageRoll).DefaultConfigurationDialog;
 // An optional ally/cover choice is required even for a normally headless Hit Die roll.
 dialog.configure=true;dialog.applicationClass=class extends Base{
  async _prepareConfigurationContext(context,options){context=await super._prepareConfigurationContext(context,options);
   context.fields.push({name:"spikependium.soothingBeacon",value:this.config.spikependium.soothingBeacon,
    field:new foundry.data.fields.StringField({label:"Исцеляющий маяк",choices:{none:"Не применять",...Object.fromEntries(choices(this.config,message).map(c=>[c.key,c.label]))},
     hint:"Вы — союзник выбранного фамильяра; Эманация не перекрыта Полным укрытием. 1 и 2 на костях восстановления Хитов считаются 3; Временные хиты не изменяются."})});return context;}
  _buildConfig(roll,formData,index){roll=super._buildConfig(roll,formData,index);this.config.spikependium.soothingBeacon=formData?.get("spikependium.soothingBeacon")??this.config.spikependium.soothingBeacon;return roll;}
 };
}
function selected(rolls,config,message){
 const key=config.spikependium?.soothingBeacon;if(!key||key==="none")return;
 const choice=choices(config,message).find(c=>c.key===key),kind=kindOf(config,message);
 const targets=rolls.filter(r=>kind==="hitDie"||r.options.type==="healing");
 return choice&&targets.length&&!rolls.some(r=>r._evaluated)?{...choice,kind,targets}:null;
}
export function finalizeSoothingHealing(rolls,config,_dialog,message){
 if(!rolls.length||config.evaluate===false||!config.spikependium?.soothingBeacon||config.spikependium.soothingBeacon==="none")return;
 const choice=selected(rolls,config,message);if(!choice){ui.notifications.warn("Исцеляющий маяк недоступен: проверьте токены, расстояния и включённый эффект. Повторите бросок без маяка.");return false;}
 for(const roll of choice.targets)roll.options.spikependiumSoothingBeacon={...choice.mark,kind:choice.kind};
 foundry.utils.setProperty(message,"data.flags.spikependium.soothingBeacon",{...choice.mark,kind:choice.kind});
 message.data.flavor=`${message.data.flavor??""}<p>Исцеляющий маяк: 1 и 2 на костях восстановления Хитов считаются 3.</p>`;
 if([choice.mark.healerToken,choice.mark.familiar,choice.mark.casterToken].some(id=>resolve(id)?.hidden)){
  message.rollMode="blind";message.data.whisper=game.users.filter(u=>u.isGM).map(u=>u.id);message.data.blind=true;
 }
}
export async function soothingEvaluate(wrapped,rolls,config={},message={},...args){
 if(!rolls.length||config.evaluate===false||!config.spikependium?.soothingBeacon||config.spikependium.soothingBeacon==="none")return wrapped(rolls,config,message,...args);
 const choice=selected(rolls,config,message);
 if(!choice||choice.targets.some(r=>JSON.stringify(r.options.spikependiumSoothingBeacon)!==JSON.stringify({...choice.mark,kind:choice.kind}))){
  rolls.splice(0);ui.notifications.warn("Условия Исцеляющего маяка изменились до броска. Повторите его с актуальной позицией.");return;
 }
 for(const r of choice.targets)roots.add(r);
 try{return await wrapped(rolls,config,message,...args);}finally{for(const r of choice.targets)roots.delete(r);}
}
export function soothingDie(wrapped,...args){
 if(roots.has(this._root)&&!this._evaluated&&!this.modifiers.some(m=>/^min\d+$/.test(m)&&Number(m.slice(3))>=3))this.modifiers.push("min3");
 return wrapped(...args);
}
