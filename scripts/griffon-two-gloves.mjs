import translations from './data/griffon-glove-spells.json' with {type:'json'};
import { hasGriffonClass } from './griffon-rings.mjs';
import { isGriffonSpellcaster } from './griffon-two-items.mjs';
const kind=i=>i?.flags?.spikependium?.griffonGlove;
const canonical=i=>i?.actor?.items?.get?.(i.id)??i;
const active=i=>i?.actor?.items?.get?.(i.id)===i&&i?.system.equipped&&(i.system.attunement!=='required'||i.system.attuned)&&i.system.quantity>0;
const root=(a,config={})=>a?.getLinkedActivity?.(config.cause?.activity)??a;
const origin=(e,actor)=>e.system.origin?.activity&&fromUuidSync(e.system.origin.activity,{relative:actor,strict:false});
const badger=item=>[...(item.actor.appliedEffects??item.actor.effects??[])].some(e=>e.active&&!e.duration?.expired&&e.flags.spikependium?.gloveBadger&&origin(e,item.actor)?.item.uuid===item.uuid);
function activitySpent(a,linked,updates){return updates.item.find(i=>i._id===linked.item.id)?.[`system.activities.${linked.id}.uses.spent`]??updates.item.find(i=>i._id===linked.item.id)?.[`system.activities.${linked.id}`]?.uses?.spent??(a===linked?updates.activity?.['uses.spent']??updates.activity?.uses?.spent:undefined);}
export function canUseGauntlet(activity,config={}){
 const r=root(activity,config),item=canonical(r?.item);if(!kind(item))return;
 if(!item.actor?.isOwner||!active(item)||!hasGriffonClass(item)||(item.flags.spikependium.griffonSpellcaster&&!isGriffonSpellcaster(item.actor)))return false;
 if(r.flags?.spikependium?.badgerClaws&&badger(item)!==(r.flags.spikependium.badgerClaws==='empowered')){
  ui.notifications.warn('Выберите профиль когтей, соответствующий действующей мощи барсука.');return false;
 }
}
export function guardGauntletRoll(config){return canUseGauntlet(config.subject);}
export function prepareGauntletUpdates(activity,config,updates){
 const r=root(activity,config),item=canonical(r?.item);if(!kind(item))return updates;
 if(canUseGauntlet(activity,config)===false)return false;
 for(const c of r.consumption.targets){
  if(c.type==='itemUses'&&!c.target&&updates.item.find(i=>i._id===item.id)?.['system.uses.spent']!==item.system.uses.spent+Number(c.value))return false;
  if(c.type==='activityUses'&&!c.target&&activitySpent(activity,r,updates)!==r.uses.spent+Number(c.value))return false;
 }
 return updates;
}
export function gauntletMovement(wrapped,...args){
 const result=wrapped(...args),actor=this.parent;
 if(!actor.items?.some(i=>kind(i)==='great-badger'&&active(i)&&badger(i)))return result;
 const m=this.attributes.movement;m.speeds.burrow*=2;
 m.max=Math.max(0,...Object.keys(CONFIG.DND5E.movementTypes).map(t=>m.speeds[t]??0));return result;
}
export async function gauntletCachedSpell(wrapped,...args){
 const data=await wrapped(...args),item=canonical(this.item),t=kind(item)&&translations[this.spell.uuid];if(!data||!t)return data;
 data.name=t.name;data.system.description={value:`<p>${t.description}</p><p>Источник предмета: <a href="${item.system.source.custom}">${item.name}</a>.</p>`,chat:''};
 data.system.source={...data.system.source,...item.system.source,license:data.system.source.license};
 const labels={'Conjure Mage Hand':'Призвать волшебную руку','Control Mage Hand':'Управлять волшебной рукой','Summon Hand':'Призвать Длань Бигби','Vampiric Touch Attack':'Атака Прикосновением вампира','Evoke Flame Blade to Hand':'Вновь вызвать огненный клинок в руку','Cast':'Применить заклинание'};
 for(const a of Object.values(data.system.activities??{})){
  a.name=labels[a.name]??t.name;
  if(a.description?.value)a.description.value=`<p>${t.description}</p>`;
  if(a.type==='summon'&&t.summon)for(const p of a.profiles)p.uuid=t.summon;
 }
 for(const e of data.effects??[]){const level=e.name?.match(/(\d+)(?:st|nd|rd|th) Level/);e.name=t.name+(level?`: ${level[1]}-й уровень`:'');if(e.description)e.description=`<p>${t.description}</p>`;}
 return data;
}
export function gauntletSpellChanges(wrapped,...args){
 const changes=wrapped(...args);if(!kind(this.item))return changes;
 if(kind(this.item)==='salamander')changes.push({key:'system.properties',type:'add',value:'-concentration'});
 const n=this.flags?.spikependium?.gloveCantripDice;
 if(kind(this.item)==='mourning-gauntlets'&&n)changes.push({key:'activities[attack].damage.parts',type:'override',value:JSON.stringify([{number:n,denomination:8,bonus:'',types:['necrotic'],custom:{enabled:false,formula:''},scaling:{mode:'',number:null,formula:''}}])});
 return changes;
}
function traitorSource(e,item){
 // shortcut: the chosen hand and release are confirmed with the enchantment toggle until grip tracking is available.
 if(!e.flags?.spikependium?.traitorWeapon||e.disabled||e.duration?.expired)return;
 const a=origin(e,item.actor),source=canonical(a?.item);
 return kind(source)==='traitor'&&active(source)&&source.actor?.uuid===item.actor?.uuid?source:undefined;
}
export function gauntletEffectSuppression(wrapped,...args){
 if(this.flags.spikependium?.traitorWeapon&&(!this.parent?.system.equipped||!traitorSource(this,this.parent)))return true;
 return wrapped(...args);
}
export function gauntletDamageParts(wrapped,config={},...args){
 const parts=wrapped(config,...args),item=this.item;
 if(!parts.length||!item.system.equipped||this.getActionType?.(config.attackMode)!=='mwak'||!item.effects?.some(e=>traitorSource(e,item)&&!e.isSuppressed))return parts;
 const first=parts.findIndex(p=>p.base);if(first<0)return parts;
 const result=[...parts];result[first]=parts[first].clone({types:['necrotic']});result[first].base=true;
 const fire=parts[first].clone({number:1,denomination:8,bonus:'',types:['fire'],custom:{enabled:false,formula:''},scaling:{mode:'',number:null,formula:''}});fire.base=false;return [...result,fire];
}
export function markGauntletDamage(config,_dialog,message){
 const a=root(config.subject),item=canonical(a?.item);
 if(kind(item)==='mourning-gauntlets'&&active(item)&&['Chill Touch','Inflict Wounds','Vampiric Touch'].includes(a.flags?.spikependium?.gloveSpell))foundry.utils.setProperty(message,'data.flags.spikependium.ignoreNecroticResistance',true);
 if(kind(item)==='healing-gloves'&&a.flags?.spikependium?.healingGloveBonus)foundry.utils.setProperty(message,'data.flags.spikependium.healingGloveBonus',{item:item.uuid,activity:a.uuid,caster:item.actor.uuid});
}
export function healingGloveApplication(target,_amount,updates,options){
 const card=options.originatingMessage,a=card?.getAssociatedActivity?.()??card?.getOriginatingMessage?.()?.getAssociatedActivity?.(),item=canonical(a?.item);
 const receipt=card?.flags?.spikependium?.healingGloveBonus;
 if(kind(item)!=='healing-gloves'||!a.flags?.spikependium?.healingGloveBonus){if(receipt){ui.notifications.warn('Источник добавочного лечения недоступен. Карточку должен проверить Мастер.');return false;}return;}
 if(receipt&&(receipt.item!==item.uuid||receipt.activity!==a.uuid||receipt.caster!==item.actor.uuid))return false;
 const author=card?.author??card?.getOriginatingMessage?.()?.author;
 if(!active(item)||!author||!item.actor.testUserPermission(author,'OWNER')||target.flags.spikependium?.healingGloveUsed)return false;
 // shortcut: the originating spell/kit and one chosen recipient are confirmed by the user until healing-source receipts exist.
 if(updates['system.attributes.hp.value']>target.system.attributes.hp.value)updates['flags.spikependium.healingGloveUsed']=1;
}
export async function resetHealingGlove(actor,_result,config){
 if(actor.isOwner&&['short','long'].includes(config?.type)&&actor.flags.spikependium?.healingGloveUsed)await actor.update({'flags.spikependium.healingGloveUsed':0});
}
