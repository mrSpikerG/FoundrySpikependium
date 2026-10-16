import { activeFocus, canonicalFocusItem, focusKind, canUseGriffonFocus } from './griffon-foci.mjs';
import { snapshotStaffHit } from './griffon-staff-hits.mjs';
import { snapshotStaffFollowup } from './griffon-staff-followups.mjs';

const flags = item => canonicalFocusItem(item)?.flags?.spikependium ?? {};
const state = activity => activity.flags?.spikependium ?? {};
const rootOf = activity => activity.getLinkedActivity?.() ?? activity;
const calculated = new WeakMap();
const prepared = new WeakMap();
const ownTurn = actor => game.combat?.started && game.combat.combatant?.actor?.uuid === actor.uuid;
const turnPath = () => `flags.spikependium.staffCraterTurns.${game.combat.id}.${game.combat.round}.${game.combat.turn}`;
function craterUsed(actor) {
 return foundry.utils.getProperty(actor,turnPath()) === 1;
}
export function canUseStaff(activity, _config, _dialog, message) {
 const root=rootOf(activity), item=canonicalFocusItem(root.item), f=state(root), id=focusKind(item);
 if(!['braided','cratering','stormstruck'].includes(id))return;
 if(f.staffCrater && game.combat?.started && (!ownTurn(item.actor)||craterUsed(item.actor))) {
  ui.notifications.warn('Кратерный конус доступен один раз в свой ход.');return false;
 }
 if(id==='cratering' && root.type==='attack' && item.actor.system.abilities.str.value<17)
  ui.notifications.warn('Сила ниже 17: правила владения Кратерным посохом уточните у Мастера.');
 if(id==='braided' && f.staffRopeMode!==undefined) {
  const mode=flags(item).staffRopeMode;
  if((f.staffRopeMode===1&&mode!==(f.staffReleased?2:0))||(f.staffRopeMode===0&&mode!==1)||(f.staffRopeMode===2&&mode!==1)) {
   ui.notifications.warn('Это превращение недоступно в текущей форме верёвки.');return false;
  }
 }
 if(message&&(f.staffRopeMode!==undefined||f.staffLightning||f.staffBreak||f.staffCrater))message.hasConsumption=true;
}
export function prepareStaffUpdates(activity, _config, updates) {
 prepared.delete(activity);
 const root=rootOf(activity), item=canonicalFocusItem(root.item), f=state(root);
 if(!focusKind(item)||root!==activity)return updates;
 if(canUseStaff(activity)===false)return false;
 const changes={};
 if(f.staffRopeMode!==undefined)changes['flags.spikependium.staffRopeMode']=f.staffRopeMode;
 if(f.staffBreak)Object.assign(changes,{'flags.spikependium.focusRuin':1,'flags.spikependium.staffRopeMode':1});
 if(f.staffLightning)changes['flags.spikependium.staffGlowUntil']=game.time.worldTime+60;
 if(f.staffCrater) {
  const spent=updates.item.find(i=>i._id===item.id)?.['system.uses.spent'];
  if(spent!==item.system.uses.spent+1)return false;
  if(game.combat?.started){const path=turnPath();updates.actor[path]=1;prepared.set(activity,path);}
 }
 if(Object.keys(changes).length){let update=updates.item.find(i=>i._id===item.id);if(!update)updates.item.push(update={_id:item.id});Object.assign(update,changes);}
 return updates;
}
export function recordStaffConsumption(activity, _config, message) {
 const path=prepared.get(activity);prepared.delete(activity);
 if(!path||foundry.utils.getProperty(activity.actor,path)!==1)return;
 const deltas=((message.data.system??={}).deltas??={}).actor??=[];
 if(!deltas.some(d=>d.keyPath===path))deltas.push({keyPath:path,delta:1});
}
export function stormStaffGlowing(item) {
 if(focusKind(item)!=='stormstruck'||!activeFocus(item))return false;
 if(flags(item).staffGlowUntil>game.time.worldTime)return true;
 return [...(item.effects??[])].some(e=>{
  if(e.type!=='enchantment'||e.disabled||e.isSuppressed||e.duration?.remaining<=0)return false;
  const origin=e.system?.origin?.activity??e.origin, doc=origin&&fromUuidSync(origin,{relative:item,strict:false}), spell=doc?.item??doc;
  return spell?.type==='spell'&&spell._stats?.compendiumSource==='Compendium.dnd5e.spells24.Item.phbsplShillelagh';
 });
}
export function staffDamageParts(wrapped, config={}, ...args) {
 const parts=wrapped(config,...args), item=canonicalFocusItem(this.item);
 if(!parts.length||focusKind(item)!=='stormstruck'||!activeFocus(item))return parts;
 const glowing=stormStaffGlowing(item), extra=parts[0].clone({number:glowing?1:null,denomination:glowing?6:null,bonus:'',types:['lightning'],
  custom:{enabled:!glowing,formula:glowing?'':'1'},scaling:{mode:'',number:null,formula:''}});
 extra.base=false;return [...parts,extra];
}
export function recordStaffCalculation(actor, damages, options) {
 if(!actor.isOwner)return;
 let map=calculated.get(options);if(!map)calculated.set(options,map=new Map());
 map.set(actor.uuid,damages.some(d=>d.type==='lightning'&&d.value>0));
}
export async function applyStaffLightning(actor, _amount, options) {
 const hit=calculated.get(options)?.get(actor.uuid);calculated.get(options)?.delete(actor.uuid);
 if(!hit||!actor.isOwner)return;
 const card=options.originatingMessage, root=card?.getOriginatingMessage?.()??card;
 const activity=root?.getAssociatedActivity?.(), source=canonicalFocusItem((activity?.getLinkedActivity?.()??activity)?.item??root?.getAssociatedItem?.());
 for(const item of actor.items)if(focusKind(item)==='stormstruck'&&activeFocus(item)&&source?.uuid!==item.uuid)
  await item.update({'flags.spikependium.staffGlowUntil':game.time.worldTime+60});
}
export function staffAttackConfig(wrapped, process, config, formData, ...args) {
 const item=canonicalFocusItem(this.item), bow=focusKind(item)==='arcanist-bowstaff'&&state(this).staffBow;
 if(bow) {
  if(canUseGriffonFocus(this)===false)throw Error('Магический лук недоступен.');
  process={...process,ability:this.attack.ability,attackMode:'ranged',ammunition:false};
  if(formData){const original=formData;formData={get:key=>key==='attackMode'?'ranged':key==='ammunition'?false:key==='ability'?this.attack.ability:original.get(key)};}
 }
 const result=wrapped(process,config,formData,...args);
 snapshotStaffHit(this,config);
 snapshotStaffFollowup(this,config);
 if(bow){config.data.prof=new item.system.prof.constructor(this.actor.system.attributes.prof,1).term;if(!config.parts.includes('@prof'))config.parts.push('@prof');}
 return result;
}
export function staffAttackRoll(wrapped, config={}, dialog={}, ...args) {
 if(focusKind(this.item)!=='arcanist-bowstaff'||!state(this).staffBow)return wrapped(config,dialog,...args);
 return wrapped({...config,ability:this.attack.ability,attackMode:'ranged',ammunition:false},
  {...dialog,options:{...dialog.options,ammunitionOptions:[],attackModeOptions:[{value:'ranged',label:'Длинный лук: две руки'}]}},...args);
}
export function staffDeltaLabel(wrapped, ...args) {
 const result=wrapped(...args),key=this.keyPath;
 if(/^flags\.spikependium\.staffCraterTurns\.[A-Za-z0-9]+\.\d+\.\d+$/.test(key))result.label='Кратерный конус в этот ход';
 const labels={staffRopeMode:'Форма плетёного посоха',staffGlowUntil:'Свечение Громобойного посоха',focusRuin:'Утрата магических свойств'};
 if(key?.startsWith('flags.spikependium.')&&labels[key.slice(19)])result.label=labels[key.slice(19)];
 return result;
}
