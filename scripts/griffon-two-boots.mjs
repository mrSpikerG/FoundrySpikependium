const kind=i=>i?.flags?.spikependium?.griffonBoots;
const canonical=i=>i?.actor?.items?.get?.(i.id)??i;
const root=(a,c={})=>a?.getLinkedActivity?.(c.cause?.activity)??a;
const active=i=>i?.actor?.items.get(i.id)===i&&i.system.quantity===1&&i.system.equipped&&(i.system.attunement!=='required'||i.system.attuned)&&i.system.magicAvailable!==false;
const flags=i=>i.flags.spikependium;
const origin=(e,actor)=>e.system.origin?.activity&&fromUuidSync(e.system.origin.activity,{relative:actor,strict:false});
const using=new Set();let syncing=false;
export function bootsUnattunedUse(a){const i=canonical(a?.item);return kind(i)==='dramus'&&a.flags?.spikependium?.bootDance&&i.system.equipped;}
export function xornSpent(i,now=game.time.worldTime){const f=flags(i);return f.bootOn?Math.min(600,Math.max(i.system.uses.spent,f.bootBase+Math.max(60,Math.ceil(Math.max(0,now-f.bootSince))))):i.system.uses.spent;}
function xornOn(i){const f=flags(i);return active(i)&&f.bootOn===1&&game.time.worldTime<f.bootSince+600-f.bootBase;}
export function canUseBoots(activity,config={},_dialog,message){
 const r=root(activity,config),i=canonical(r?.item),id=kind(i);if(!id)return;
 const dance=bootsUnattunedUse(r),equipped=i.actor?.isOwner&&i.actor.items.get(i.id)===i&&i.system.quantity===1&&i.system.equipped&&i.system.magicAvailable!==false;
 if(!equipped||!dance&&!active(i))return false;
 const c=r.flags?.spikependium?.bootCommand;if(c==='on'&&(flags(i).bootOn||id==='xorn-sole'&&xornSpent(i)>540)||c==='off'&&!flags(i).bootOn)return false;
 if(message&&c){if(message.create===false)return false;message.hasConsumption=true;}
}
export async function bootsUse(wrapped,...args){const i=canonical(root(this)?.item);if(!kind(i)||this.type==='cast')return wrapped(...args);if(using.has(i.uuid))return;using.add(i.uuid);try{return await wrapped(...args);}finally{using.delete(i.uuid);}}
export function prepareBootsUpdates(activity,config,updates){
 const r=root(activity,config),i=canonical(r?.item),id=kind(i);if(!id)return updates;
 if(canUseBoots(activity,config)===false)return false;
 for(const c of r.consumption.targets)if(c.type==='itemUses'&&!c.target&&updates.item.find(u=>u._id===i.id)?.['system.uses.spent']!==i.system.uses.spent+Number(c.value))return false;
 const c=r.flags?.spikependium?.bootCommand;if(!c)return updates;
 let update=updates.item.find(u=>u._id===i.id);if(!update)updates.item.push(update={_id:i.id});
 update['flags.spikependium.bootOn']=c==='on'?1:0;
 if(id==='xorn-sole')Object.assign(update,{'system.uses.spent':c==='on'?i.system.uses.spent+60:xornSpent(i),'flags.spikependium.bootBase':c==='on'?i.system.uses.spent:flags(i).bootBase,'flags.spikependium.bootSince':c==='on'?game.time.worldTime:flags(i).bootSince});
 // Native UsesField is integer-only: count seconds, with a 60-second minimum per interval.
 return updates;
}
export async function recoverBootsPeriods(wrapped,periods,...args){const result=await wrapped(periods,...args),i=this.parent;if(kind(i)!=='xorn-sole'||!(periods instanceof Map)||!(periods.get('lr')>0))return result;const r=result||{updates:{},rolls:[]};Object.assign(r.updates,{'flags.spikependium.bootOn':0,'flags.spikependium.bootBase':0,'flags.spikependium.bootSince':0});return r;}
export function bootsEffectSuppression(wrapped,...args){if(this.flags.spikependium?.bootXorn&&!xornOn(this.parent))return true;return wrapped(...args);}
export function bootsEffectChange(wrapped,model,change,...args){if(model?.documentName==='Actor'&&change.effect?.flags.spikependium?.bootXorn&&change.key==='system.attributes.senses.tremorsense'){const units=model.system.attributes.senses.units??dnd5e.utils.defaultUnits('length');change={...change,value:String(dnd5e.utils.convertLength(30,'ft',units))};}return wrapped(model,change,...args);}
export function prepareBootsCheck(config,_dialog,message){
 const r=root(game.messages.get(message.data?.system?.origin)?.getAssociatedActivity?.()),i=canonical(r?.item);if(!r?.flags?.spikependium?.bootDance||!bootsUnattunedUse(r)||canUseBoots(r)===false||r.actor.uuid!==config.subject?.uuid)return;
 for(const roll of config.rolls){const o=roll.options??={};o.disadvantage||=o.advantageMode===-1;o.advantage=true;if(o.advantageMode!==undefined)o.advantageMode=o.disadvantage?0:1;}
}
export function bootsLight(i){if(kind(i)!=='lightscreen'||!active(i))return 0;const flare=[...(i.actor.appliedEffects??i.actor.effects??[])].some(e=>e.active&&!e.duration?.expired&&e.flags.spikependium?.bootFlare&&canonical(origin(e,i.actor)?.item)?.uuid===i.uuid);return flare?40:flags(i).bootOn?5:0;}
export async function bootsCachedSpell(wrapped,...args){
 const data=await wrapped(...args),i=canonical(this.item);if(!data||kind(i)!=='wind-riders'||this.spell.uuid!=='Compendium.dnd5e.spells.Item.2IWiZAJtOGDoKjiz')return data;
 data.name='Газообразная форма: облако листьев';const text='Облако пара и листьев: концентрация до 1 минуты, только на себе. Собственное перемещение — полёт 10 футов только по вертикали. Горизонтальный снос зависит от ветра. Сопротивление немагическому урону, преимущество испытаний Силы, Ловкости и Телосложения; нельзя говорить, применять предметы, атаковать и сотворять заклинания. Можно просачиваться в узкие проходы, если листья способны следовать за вами. Облик оканчивается при 0 хитов или потере листьев. Геометрию, снос и особые ограничения подтверждает Мастер.';
 data.system.description={value:`<p>${text}</p>`,chat:''};data.system.source={...data.system.source,...i.system.source,license:data.system.source.license};
 for(const a of Object.values(data.system.activities??{})){a.name=data.name;if(a.description?.value)a.description.value=`<p>${text}</p>`;}
 for(const e of data.effects??[]){if(e.type==='enchantment')continue;e.name=data.name;e.description=`<p>${text}</p>`;e.duration={...e.duration,value:60,units:'seconds'};for(const c of e.system.changes??[])c.key=c.key.replace(/^system\.attributes\.movement\.(fly|walk|swim|climb|burrow)$/,'system.attributes.movement.speeds.$1');e.system.changes.push({key:'system.attributes.movement.hover',type:'override',value:'true'});}
 return data;
}
export function bootsDeltaLabel(wrapped,...args){const r=wrapped(...args),labels={bootOn:'Свойство обуви включено',bootSince:'Начало отрезка работы подошвы зорна',bootBase:'Секунды, потраченные до текущего отрезка'};if(this.keyPath?.startsWith('flags.spikependium.')&&labels[this.keyPath.slice(19)])r.label=labels[this.keyPath.slice(19)];return r;}
export async function syncBoots(){
 if(syncing||(game.users.activeGM?!game.user.isActiveGM:!game.user.isGM))return;syncing=true;
 try{const actors=new Map([...(game.actors??[]),...[...(game.scenes??[])].flatMap(s=>[...s.tokens].map(t=>t.actor))].filter(Boolean).map(a=>[a.uuid,a]));for(const a of actors.values())for(const i of a.items){if(!kind(i)||!i.actor.isOwner||using.has(i.uuid)||!flags(i).bootOn)continue;const changes={};if(kind(i)==='xorn-sole'){const spent=xornSpent(i);if(spent!==i.system.uses.spent)changes['system.uses.spent']=spent;if(!xornOn(i))changes['flags.spikependium.bootOn']=0;}if(!active(i))changes['flags.spikependium.bootOn']=0;if(Object.keys(changes).length)await i.update(changes);}}finally{syncing=false;}
}
