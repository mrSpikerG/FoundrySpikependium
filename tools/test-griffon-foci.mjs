import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GRIFFON_FOCI, FOCUS_SEASONS } from '../src/content/griffons-saddlebag-foci.mjs';
import { canUseGriffonFocus, guardFocusAttunement, guardFocusRoll, prepareFocusUpdates, prepareFocusWeapon, focusDamageParts, focusSpellChanges, focusSeason, focusEffectSuppression } from '../scripts/griffon-foci.mjs';
import { canUseGriffonItem } from '../scripts/griffon-items.mjs';
import { canUseGriffonTwo } from '../scripts/griffon-two-items.mjs';
import { nativeUsesConsumption } from './data/dnd5e-monsters-native.mjs';
import { nativeRefund, getDeltas } from './data/dnd5e-reaction-native.mjs';
import { nativeGriffonCastChanges } from './data/dnd5e-griffon-native.mjs';
import { syncWeaponLights } from '../scripts/griffon-weapon-lights.mjs';
const records=fs.readdirSync('packs/_source/items').map(f=>JSON.parse(fs.readFileSync(`packs/_source/items/${f}`,'utf8')));
const docs=new Map(records.filter(d=>d.flags?.spikependium?.key).map(d=>[d.flags.spikependium.key,d]));
const folders=new Map(records.filter(d=>d._key.startsWith('!folders!')).map(d=>[d._id,d]));
const evidence=JSON.parse(fs.readFileSync('tools/data/griffon-foci.json','utf8'));
const bases=JSON.parse(fs.readFileSync('tools/data/griffon-focus-bases.json','utf8'));
const get=id=>{const d=docs.get(`item:gs1:${id}`);assert.ok(d,id);return d;},acts=d=>Object.values(d.system.activities);
assert.equal(GRIFFON_FOCI.length,12);assert.equal(evidence.entries.length,12);assert.equal(bases.records.filter(r=>r.uuid).length,33);
for(const[en,id,rarity,base,attunement]of GRIFFON_FOCI){
 const d=get(id),source=evidence.entries.find(r=>r.key===d.flags.spikependium.key);assert.ok(source.name.endsWith(`[${en}]`));
 assert.equal(d.system.source.custom,source.url);assert.equal(d.system.source.rules,'2024');assert.equal(d.system.rarity,rarity);assert.equal(d.system.attunement,attunement?'required':'');
 assert.match(d.name,/[а-яё]/i);assert.ok(d.system.price.value>0);assert.equal(d.system.weight.value,id==='magpie'?10:bases.records.find(r=>r.name===base).document.system.weight.value);
 const ancestry=[];let f=d.folder;while(f){const parent=folders.get(f);assert.ok(parent);assert.ok(!ancestry.includes(f));ancestry.push(f);f=parent.folder;}
 assert.ok(ancestry.some(f=>folders.get(f).name==='Сумка грифона — книга 1'));
 assert.ok(ancestry.some(f=>folders.get(f).name===(base==='staff'?'Посохи':base==='wand'?'Волшебные палочки':'Жезлы')));
 if(base==='staff'){assert.equal(d.type,'weapon');assert.equal(d.system.type.baseItem,'quarterstaff');assert.equal(d.system.mastery,bases.records.find(r=>r.name==='staff').document.system.mastery);assert.ok(acts(d).some(a=>a.type==='attack'));assert.doesNotMatch(d.system.description.value,/Это шаблон зачарования/);}
 for(const a of acts(d)){
  assert.equal(a.consumption.spellSlot,false);
  if(a.type==='cast'){const original=bases.records.find(r=>r.uuid===a.spell.uuid);assert.ok(original,a.name);assert.equal(original.document._id,a.spell.uuid.split('.').at(-1));}
  for(const e of a.effects??[])assert.ok(d.effects.some(f=>f._id===e._id));
 }
}
for(const[id,max,formula,period]of [['unbroken-fire',7,'1d6+1','dawn'],['warmind',7,'1d6+1','dawn'],['talyard',3,'1d3','dusk'],['whispers',7,'1d6+1','dusk'],['rocborne',5,'1d4+1','dawn'],['reverent',10,'1d6+4','dawn'],['mirage',10,'1d6+4','dawn'],['favorable-winds',10,'1d6+4','dawn'],['magpie',10,'1d6+4','dawn'],['four-seasons',10,'1d6+2','dawn'],['mustang',10,'1d6+4','dawn']]){
 const uses=get(id).system.uses;assert.equal(uses.max,String(max));assert.deepEqual(uses.recovery,[{period,type:'formula',formula}]);
}
const clone=structuredClone,read=(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o);
const set=(o,p,v)=>{const keys=p.split('.'),last=keys.pop();keys.reduce((v,k)=>v[k]??={},o)[last]=v;};
const flatten=(o,p='',out={})=>{for(const[k,v]of Object.entries(o)){const key=p?`${p}.${k}`:k;if(v&&Object.getPrototypeOf(v)===Object.prototype)flatten(v,key,out);else out[key]=v;}return out;};
globalThis.foundry={utils:{getProperty:read,flattenObject:flatten,deepClone:clone,isEmpty:o=>!Object.keys(o).length}};
globalThis.ui={notifications:{warn(){}}};globalThis.game={time:{worldTime:0},user:{isActiveGM:true},users:{activeGM:true},scenes:[]};
let die=1;
globalThis.CONFIG={Dice:{BasicRoll:class{constructor(formula){assert.equal(formula,'1d20');}async evaluate(){this.total=die;return this;}}},DND5E:{healingTypes:{},movementUnits:{ft:{}}}};
function owned(id){const item=clone(get(id));item.id=item._id;item.uuid=`Actor.hero.Item.${item.id}`;item.system.equipped=true;item.system.attuned=true;item.system.uses.max=Number(item.system.uses.max)||0;
 Object.defineProperty(item.system.uses,'value',{get(){return this.max-this.spent;}});
 item.actor={isOwner:true,uuid:'Actor.hero',statuses:new Set(),effects:[],items:Object.assign([item,{type:'race',name:'Орк',system:{identifier:'orc'}}],{get(id){return this.find(i=>i.id===id);}}),classes:{wizard:{system:{levels:5,spellcasting:{progression:'full'}}},druid:{system:{levels:5,spellcasting:{progression:'full'}}}}};
 return item;
}
const activity=(item,predicate)=>{const a=acts(item).find(predicate);assert.ok(a,item.name);return {...a,item,actor:item.actor,id:a._id,toObject:()=>clone(a)};};
const updates=()=>({item:[],actor:{},activity:{},create:[],delete:[],rolls:[]});
async function charged(item,cost=1){const u=updates(),result=await nativeUsesConsumption.call({resolveCost:async()=>({total:cost})},{},{uses:item.system.uses,type:'focus',rolls:u.rolls,delta:{}});u.item.push({_id:item.id,'system.uses.spent':result.spent});return u;}
const apply=(item,u)=>{for(const update of u.item)for(const[p,v]of Object.entries(update))if(p!=='_id')set(item,p,v);};
for(const[id,destroy]of [['unbroken-fire',true],['warmind',false],['whispers',false],['reverent',false],['mirage',true],['favorable-winds',true],['magpie',false],['four-seasons',false],['mustang',true]]){
 const item=owned(id);
 const a=activity(item,a=>a.consumption.targets.some(t=>Number(t.value)>0)),cost=Number(a.consumption.targets[0].value);item.system.uses.spent=item.system.uses.max-cost;if(id==='four-seasons')item.flags.spikependium.focusCalendarSeason=1;
 const u=await charged(item,cost);await prepareFocusUpdates(a,{},u);assert.equal(u.rolls.length,1);assert.equal(item.flags.spikependium.focusRuin,0,'preparation/cancellation leaves the owned item intact');
 const deltas={actor:[],item:{[item.id]:getDeltas(item,Object.fromEntries(Object.entries(u.item[0]).filter(([k])=>k!=='_id')))}};
 apply(item,u);assert.equal(item.flags.spikependium.focusRuin,1);assert.equal(item.system.quantity,destroy?0:1);
 assert.equal(canUseGriffonFocus(a),false);
 await nativeRefund.call(a,deltas,async restored=>apply(item,restored));assert.equal(item.flags.spikependium.focusRuin,0);assert.equal(item.system.quantity,1);assert.equal(item.system.uses.spent,item.system.uses.max-cost);
 die=2;const lucky=await charged(item,cost);await prepareFocusUpdates(a,{},lucky);assert.equal(lucky.item[0]['flags.spikependium.focusRuin'],undefined);die=1;
}
{
 const item=owned('four-seasons'),spring=activity(item,a=>a.flags?.spikependium?.focusSeasonSpell===1),summer=activity(item,a=>a.flags?.spikependium?.focusSeasonSpell===2);
 assert.equal(canUseGriffonFocus(spring),false,'unknown calendar season never silently selects a spell list');
 let u=updates();const calendar=activity(item,a=>a.flags?.spikependium?.focusCalendarSeason===1),message={};canUseGriffonFocus(calendar,{}, {},message);assert.equal(message.hasConsumption,true);
 await prepareFocusUpdates(calendar,{},u);apply(item,u);assert.equal(focusSeason(item),1);assert.equal(canUseGriffonFocus(spring),undefined);assert.equal(canUseGriffonFocus(summer),false);
 u=updates();await prepareFocusUpdates(activity(item,a=>a.flags?.spikependium?.focusChooseSeason===2),{},u);apply(item,u);assert.equal(focusSeason(item),2);
 game.time.worldTime=28799;assert.equal(canUseGriffonFocus(summer),undefined);game.time.worldTime=28800;assert.equal(focusSeason(item),1);assert.equal(canUseGriffonFocus(summer),false);game.time.worldTime=0;
 const base={base:true,clone(data){return {...data,base:true};}},host={item};
 for(const[index,[,type]]of FOCUS_SEASONS.entries()){item.flags.spikependium.focusCalendarSeason=index+1;item.flags.spikependium.focusSeasonUntil=0;const parts=focusDamageParts.call(host,()=>[base],{});assert.equal(parts.length,2);assert.deepEqual(parts[1].types,[type]);assert.equal(parts[1].base,false);assert.equal(parts[1].denomination,8);}
 assert.equal(focusDamageParts.call(host,()=>[base],{attackMode:'thrown'}).length,1);item.system.uses.spent=item.system.uses.max;assert.equal(focusDamageParts.call(host,()=>[base],{}).length,1);
 item.system.attuned=false;const attack=activity(item,a=>a.type==='attack');item.actor.classes={};assert.equal(canUseGriffonItem(attack),true);assert.notEqual(canUseGriffonTwo(attack),false);assert.equal(guardFocusRoll({subject:attack}),undefined);
 const model={parent:item,magicalBonus:2,properties:new Set(item.system.properties)};prepareFocusWeapon.call(model,()=>{},{});assert.equal(model.magicalBonus,0);assert.equal(model.properties.has('mgc'),false);
 item.system.attuned=true;prepareFocusWeapon.call(model,()=>{},{});assert.equal(model.magicalBonus,2);item.flags.spikependium.focusRuin=1;prepareFocusWeapon.call(model,()=>{},{});assert.equal(model.magicalBonus,0);assert.equal(model.properties.has('mgc'),false);
}
{
 const item=owned('warmind'),a=activity(item,a=>a.type==='heal');item.actor.items.pop();assert.equal(guardFocusAttunement(item,{'system.attuned':true}),false);assert.equal(canUseGriffonFocus(a),false);
 const talyard=owned('talyard'),spell=activity(talyard,a=>a.type==='cast');assert.equal(canUseGriffonFocus(spell),false);
 const u=updates();await prepareFocusUpdates(activity(talyard,a=>a.flags?.spikependium?.focusDrunk===1),{},u);apply(talyard,u);assert.equal(canUseGriffonFocus(spell),undefined);
 talyard.system.equipped=false;assert.equal(guardFocusRoll({subject:spell}),false);guardFocusRoll({});
 talyard.system.equipped=true;talyard.actor.items.shift();assert.equal(guardFocusRoll({subject:spell}),false,'a cached old card cannot use a deleted focus');
}
{
 for(const id of ['unbroken-fire','talyard','mirage']){
  const item=owned(id);for(const a of acts(item).filter(a=>a.type==='cast')){
   const host={...a,item,toObject:()=>clone(a)};const changes=focusSpellChanges.call(host,()=>nativeGriffonCastChanges.call(host));
   if(a.flags?.spikependium?.focusCantripDice){const d=JSON.parse(changes.find(c=>c.key==='activities[attack].damage.parts').value)[0];assert.equal(d.number,a.flags.spikependium.focusCantripDice);assert.equal(d.scaling.mode,'');assert.equal(changes.find(c=>c.key==='activities[attack].attack.bonus').value,'5');}
   if(a.flags?.spikependium?.focusHeroism)assert.equal(changes.find(c=>c.key==='activities[heal].healing.custom.formula').value,'3');
   if(id==='mirage')assert.equal(changes.find(c=>c.key==='activities[save].save.dc.formula').value,'@attributes.spell.dc + 2');
  }
 }
 const item=owned('favorable-winds');assert.equal(focusEffectSuppression.call({parent:item},()=>false),false);item.flags.spikependium.focusRuin=1;assert.equal(focusEffectSuppression.call({parent:item},()=>false),true);
}
// Shared light ledger: a ruined focus loses only its own light, restoring the token baseline.
{
 const item=owned('whispers'),token={isOwner:true,actor:{items:[item]},light:{bright:3,dim:6},flags:{spikependium:{}},async update(changes){for(const[p,v]of Object.entries(changes)){const keys=p.split('.');if(keys.at(-1).startsWith('-=')){const last=keys.pop().slice(2);delete read(this,keys.join('.'))[last];}else set(this,p,clone(v));}}};
 Object.defineProperty(token.light,'toObject',{value(){return{bright:this.bright,dim:this.dim};}});
 globalThis.dnd5e={utils:{convertLength:n=>n}};game.scenes=[{grid:{units:'ft'},tokens:[token]}];
 await syncWeaponLights();assert.equal(token.light.bright,5);assert.equal(token.light.dim,10);item.flags.spikependium.focusRuin=1;await syncWeaponLights();assert.equal(token.light.bright,3);assert.equal(token.light.dim,6);
}
console.log('GS1 foci: 12 sources and native bases, 33 exact spell links, Russian folders/prices/weights, native charge payment/refund, final-charge ruin, cast overrides, calendar/8-hour seasons and typed melee damage, attunement, old-card guards and shared lights passed.');
