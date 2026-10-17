const KEY='subclass:au-conjurer';
const savant=a=>a?.type==='ItemChoice'&&a.item?.flags.spikependium?.key===KEY&&a.id===a.item.flags.spikependium.conjurationSavant;
const feature=(actor,id)=>actor?.items?.find?.(i=>i.flags.spikependium?.key===`${KEY}:${id}`);
const tier=level=>Number(level)===3?2:(Number(level)+1)/2;
export function conjurerSavantMax(wrapped,...args){return savant(this.advancement)?tier(this.level):wrapped(...args);}
export function conjurerSavantContext(wrapped,...args){const a=this.advancement;if(savant(a))a.updateSource({'configuration.restriction.list':['class:wizard'],'configuration.restriction.school':['con'],
 'configuration.restriction.level':Number(this.level)===3?'availableNoCantrips':String(tier(this.level)),'configuration.spell.ability':['int']});return wrapped(...args);}
export async function conjurerSavantApply(wrapped,level,data={},options={}){
 if(!savant(this))return wrapped(level,data,options);
 if(!this.configuration.choices[level]||data.replace||data.retainedData?.replaced||data.ability&&data.ability!=='int')throw Error('Специалист школы Призыва: нет разрешённого шага или замены; используется Интеллект.');
 const selected=data.selected??(options.initial?[]:Object.keys(data.retainedData??{}).filter(k=>!['items','ability','replaced'].includes(k))),counts=this.getCounts(level),max=tier(level);
 if(new Set(selected).size!==selected.length||selected.length>counts.max-counts.current)throw Error('Специалист школы Призыва: превышено число новых заклинаний или повторён выбор.');
 for(const uuid of selected){const s=await fromUuid(uuid);if(s?.type!=='spell'||s.system.school!=='con'||!Number.isInteger(s.system.level)||s.system.level<1
  ||(Number(level)===3?s.system.level>2:s.system.level!==max)||!dnd5e.registry.spellLists.forType('class:wizard')?.has(s))throw Error('Специалист школы Призыва: неверная школа, уровень или список Волшебника.');}
 return wrapped(level,{...data,selected,ability:'int'},options);
}
export function prepareConjurerConcentration(actor,changes,options){
 if(!feature(actor,'focused-conjuration')||(actor.classes?.wizard?.system.levels??0)<10)return;
 const flat=foundry.utils.flattenObject(changes);if(!['system.attributes.hp.value','system.attributes.hp.temp'].some(p=>Object.hasOwn(flat,p)))return;
 const effects=[...(actor.concentration?.effects??[])].filter(e=>e.active&&!e.duration?.expired);if(!effects.length)return;
 // shortcut: the native damage prompt covers all concentrations; mixed or unknown schools need per-effect adjudication.
 if(!effects.every(e=>{const a=e.flags.dnd5e?.activity?.uuid&&fromUuidSync(e.flags.dnd5e.activity.uuid,{strict:false});return a?.actor?.uuid===actor.uuid&&a.item?.type==='spell'&&a.item.system.school==='con';}))return;
 options.dnd5e??={};options.dnd5e.concentrationCheck=false;
}
export function prepareConjurerRecharge(activity,config,updates){
 const recharge=activity.flags?.spikependium?.conjurerRecharge;if(!recharge||!activity.item.flags.spikependium?.key?.startsWith(KEY+':')||config.consume===false)return updates;
 const split=recharge.kind==='split',target=feature(activity.actor,split?'split-summons':'benign-transposition'),level=activity.actor.classes?.wizard?.system.levels??0;
 if(!target||level<(split?14:6)||target.system.uses.spent<1)return false;
 const restored=updates.item.find(u=>u._id===target.id)?.['system.uses.spent'];
 const slots=Object.entries(foundry.utils.flattenObject(updates.actor)).filter(([p,v])=>/^system\.spells\.(spell[1-9]|pact)\.value$/.test(p)&&Number.isFinite(v)&&v<foundry.utils.getProperty(activity.actor,p));
 if(restored!==target.system.uses.spent-1||slots.length!==1)return false;
 const [path,value]=slots[0],pact=path.includes('.pact.'),slotLevel=pact?activity.actor.system.spells.pact.level:Number(path.match(/spell([1-9])/)[1]);
 if(pact!==recharge.pact||(split?slotLevel!==5:slotLevel<3)||foundry.utils.getProperty(activity.actor,path)-value!==1){ui.notifications.warn('Восстановление Призывателя: нужна одна подходящая ячейка и одно израсходованное применение.');return false;}
 return updates;
}
