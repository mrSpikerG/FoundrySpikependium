import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GRIFFON_STAVES } from '../src/content/griffons-saddlebag-staves.mjs';
import { prepareStaffUpdates, recordStaffConsumption, canUseStaff, stormStaffGlowing, staffDamageParts, recordStaffCalculation, applyStaffLightning, staffAttackConfig, staffAttackRoll } from '../scripts/griffon-staves.mjs';
import { canUseGriffonFocus, guardFocusRoll, guardFocusAttunement, prepareFocusWeapon, prepareFocusUpdates } from '../scripts/griffon-foci.mjs';
import { nativeUsesConsumption, nativeUsageConfig } from './data/dnd5e-monsters-native.mjs';
import { nativeRefund, getDeltas } from './data/dnd5e-reaction-native.mjs';
import { nativeCalculateDamage, nativeApplyDamage } from './data/dnd5e-guardian-native.mjs';
import { NativeStaffProficiency, nativeStaffAttackConfig } from './data/dnd5e-griffon-staves-native.mjs';
import { nativeTwoWeaponScaling } from './data/dnd5e-griffon-two-weapons-native.mjs';
import { syncWeaponLights } from '../scripts/griffon-weapon-lights.mjs';
const clone=structuredClone, read=(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o);
const set=(o,p,v)=>{const keys=p.split('.'),last=keys.pop();keys.reduce((v,k)=>v[k]??={},o)[last]=v;};
const flatten=(o,p='',out={})=>{for(const[k,v]of Object.entries(o)){const key=p?`${p}.${k}`:k;if(v&&Object.getPrototypeOf(v)===Object.prototype)flatten(v,key,out);else out[key]=v;}return out;};
globalThis.foundry={utils:{getProperty:read,setProperty:set,flattenObject:flatten,deepClone:clone,isEmpty:o=>!Object.keys(o).length}};
globalThis.ui={notifications:{warn(){}}};
globalThis.game={time:{worldTime:100},user:{isActiveGM:true},users:{activeGM:true},scenes:[]};
globalThis.dnd5e={settings:{proficiencyModifier:'flat'},utils:{convertLength:n=>n}};
globalThis.CONFIG={DND5E:{activityActivationTypes:{action:{}},spellcasting:{spell:{}},movementUnits:{ft:{}},damageTypes:{lightning:{}},healingTypes:{healing:{}}},Dice:{BasicRoll:class{async evaluate(){this.total=1;return this;}},D20Roll:{mergeOptions:(a,b)=>({...a,...b})}}};
globalThis.D20RollModificationField={combineFields:()=>({})};
globalThis.simplifyBonus=n=>Number(n)||0;
Number.isNumeric??=n=>typeof n==='number'&&Number.isFinite(n);Math.clamp??=(n,min,max)=>Math.min(max,Math.max(min,n));
const all=fs.readdirSync('packs/_source/items').map(f=>JSON.parse(fs.readFileSync(`packs/_source/items/${f}`,'utf8')));
const docs=new Map(all.filter(d=>d.flags?.spikependium?.key).map(d=>[d.flags.spikependium.key,d]));
const folders=new Map(all.filter(d=>d._key.startsWith('!folders!')).map(d=>[d._id,d]));
const bases=JSON.parse(fs.readFileSync('tools/data/griffon-staff-bases.json','utf8'));
const evidence=JSON.parse(fs.readFileSync('tools/data/griffon-staves.json','utf8'));
const inventory=JSON.parse(fs.readFileSync('tools/data/external-content-inventory.json','utf8')).sources.find(s=>s.id==='GS1');
const acts=d=>Object.values(d.system.activities),get=id=>{const d=docs.get(`item:gs1:${id}`);assert.ok(d,id);return d;};
for(const id of GRIFFON_STAVES){
 const d=get(id),e=evidence.entries.find(e=>e.key===d.flags.spikependium.key),base=bases.records.find(r=>r.name===e.base).document;
 assert.equal(d.type,'weapon');assert.match(d.name,/[а-яё]/i);assert.equal(d.system.source.custom,e.url);assert.equal(d.system.source.rules,'2024');assert.equal(d.system.source.page,'');
 assert.equal(inventory.entries.find(s=>s.key===e.key).status,'imported-partial-automation');assert.match(e.sha256,/^[a-f0-9]{64}$/);
 assert.equal(d.system.weight.value,base.system.weight.value);assert.equal(d.system.type.baseItem,'quarterstaff');assert.equal(d.system.price.value,{uncommon:400,rare:4000,veryRare:40000}[e.rarity]+base.system.price.value);
 assert.doesNotMatch(d.system.description.value,/Это шаблон зачарования/);let f=d.folder;const path=[];while(f){assert.ok(folders.has(f));path.push(folders.get(f).name);f=folders.get(f).folder;}
 assert.deepEqual(path.slice(0,2),['Посохи','Сумка грифона — книга 1']);assert.ok(acts(d).some(a=>a.type==='attack'&&a.damage.includeBase));
 for(const a of acts(d)){assert.equal(a.consumption.spellSlot,false);for(const e of a.effects??[])assert.ok(d.effects.some(f=>f._id===e._id));if(a.type==='cast')assert.ok(bases.records.some(r=>r.uuid===a.spell.uuid&&r.document._id===a.spell.uuid.split('.').at(-1)));}
}
assert.equal(evidence.entries.length,7);
for(const[id,max,formula,period]of [['leeching',6,'1d6','dawn'],['thwack',3,'','dawn'],['cratering',5,'1d4+1','dawn'],['shaeden',15,'2d6+3','dusk'],['arcanist-bowstaff',8,'1d6+2','dawn']]){
 assert.equal(get(id).system.uses.max,String(max));assert.equal(get(id).system.uses.recovery[0].period,period);assert.equal(get(id).system.uses.recovery[0].formula,formula);
}
assert.equal(acts(get('thwack')).find(a=>a.flags?.spikependium?.staffParry).roll.formula,'');assert.equal(acts(get('thwack')).find(a=>a.flags?.spikependium?.staffParryManual).roll.formula,'1d6');assert.ok(get('thwack').system.properties.includes('fin'));
assert.ok(!get('thwack').effects.some(e=>e.system.changes?.some(c=>c.key.includes('.ac.'))),'parry never grants blanket AC');
for(const id of ['leeching','shaeden']){const a=acts(get(id)).find(a=>a.flags?.spikependium?.staffHit===id);assert.equal(a.type,'utility');assert.equal(a.consumption.targets[0].value,'1');}
for(const r of bases.records){assert.match(r.sha256,/^[a-f0-9]{64}$/);if(r.source?.includes('/spells24/'))assert.equal(r.uuid,`Compendium.dnd5e.spells24.Item.${r.document._id}`);}
function owned(id){const item=clone(get(id));item.id=item._id;item.uuid=`Actor.hero.Item.${item.id}`;item.effects=[];item.system.equipped=true;item.system.attuned=true;item.system.uses.max=Number(item.system.uses.max)||0;
 Object.defineProperty(item.system.uses,'value',{get(){return this.max-this.spent;}});
 item.actor={uuid:'Actor.hero',isOwner:true,getFlag:()=>undefined,system:{abilities:{int:{value:17},str:{value:17}},attributes:{prof:3}},classes:{wizard:{system:{levels:5}}},items:Object.assign([item],{get(id){return this.find(i=>i.id===id);}})};return item;}
const activity=(item,p)=>{const a=acts(item).find(p);assert.ok(a,item.name);return {...a,id:a._id,item,actor:item.actor,toObject:()=>clone(a)};};
const updates=()=>({item:[],actor:{},activity:{},create:[],delete:[],rolls:[]});
const apply=(item,u)=>{for(const x of u.item)for(const[p,v]of Object.entries(x))if(p!=='_id')set(item,p,v);for(const[p,v]of Object.entries(u.actor))set(item.actor,p,v);};
async function paid(item,a){const u=updates(),cost=Number(a.consumption.targets[0].value);const r=await nativeUsesConsumption.call({resolveCost:async()=>({total:cost})},{},{uses:item.system.uses,type:'staff',rolls:u.rolls,delta:{}});u.item.push({_id:item.id,'system.uses.spent':r.spent});return u;}
{
 const item=owned('braided'),attack=activity(item,a=>a.type==='attack');
 for(const mode of [1,2,1,0]){
  const a=activity(item,a=>a.flags?.spikependium?.staffRopeMode===mode&&(mode!==1||!!a.flags.spikependium.staffReleased===(item.flags.spikependium.staffRopeMode===2))),u=updates();
  const before=item.flags.spikependium.staffRopeMode,m={};assert.notEqual(canUseStaff(a,{}, {},m),false);assert.equal(m.hasConsumption,true);prepareStaffUpdates(a,{},u);assert.equal(item.flags.spikependium.staffRopeMode,before,'cancelled form never mutates source');apply(item,u);
  assert.equal(item.flags.spikependium.staffRopeMode,mode);assert.equal(canUseGriffonFocus(attack)===false,mode!==0);
 }
 const before=clone(item.flags),u=updates();prepareStaffUpdates(activity(item,a=>a.flags?.spikependium?.staffBreak),{},u);
 const delta=getDeltas(item,Object.fromEntries(Object.entries(u.item[0]).filter(([k])=>k!=='_id')));apply(item,u);assert.equal(item.flags.spikependium.focusRuin,1);
 assert.equal(canUseGriffonFocus(activity(item,a=>a.flags?.spikependium?.staffRopeMode===0)),false);
 await nativeRefund.call({item,actor:item.actor},{actor:[],item:{[item.id]:delta}},u=>apply(item,u));assert.deepEqual(item.flags,before);
}
{
 const item=owned('cratering'),a=activity(item,a=>a.type==='save');game.combat={id:'combat',started:true,round:2,turn:1,combatant:{actor:item.actor}};
 assert.equal(a.save.dc.formula,'16');assert.equal(a.target.template.type,'cone');assert.equal(a.target.template.size,'10');assert.equal(a.damage.onSave,'half');assert.equal(a.damage.parts.length,2);
 let u=await paid(item,a);prepareStaffUpdates(a,{},u);assert.equal(read(item.actor,'flags.spikependium.staffCraterTurns.combat'),undefined);
 const message={data:{system:{deltas:{actor:getDeltas(item.actor,u.actor)}}}};apply(item,u);recordStaffConsumption(a,{},message);assert.equal(canUseStaff(a),false);
 assert.equal(message.data.system.deltas.actor.length,1);
 await nativeRefund.call({actor:item.actor},{actor:message.data.system.deltas.actor,item:{}},u=>apply(item,u));assert.notEqual(canUseStaff(a),false,'native refund releases turn');
 game.combat.combatant.actor={uuid:'Actor.other'};assert.equal(canUseStaff(a),false);game.combat=undefined;
}
{
 const item=owned('shaeden'),inflict=activity(item,a=>a.type==='cast'&&a.spell.level===3);assert.equal(inflict.consumption.targets[0].value,'3');
 item.actor.system.spells={spell3:{level:3,value:0}};
 const spell={system:{level:1,method:'spell'},flags:{dnd5e:{}},actor:item.actor,getFlag:()=>undefined,updateSource(u){for(const[p,v]of Object.entries(u))set(this,p,v);},prepareFinalAttributes(){}};
 const cached={getLinkedActivity:()=>inflict,target:{template:{}},consumption:{spellSlot:true,targets:[]},isSpell:true,activation:{type:'action'},actor:item.actor,requiresSpellSlot:true,item:spell};
 const usage=nativeUsageConfig.call(cached,{});assert.equal(usage.spell.slot,'spell3');assert.equal(usage.consume.spellSlot,false);
 await nativeTwoWeaponScaling.call(cached,usage,{},spell);assert.equal(usage.scaling,2);assert.equal(spell.flags.dnd5e.scaling,2);assert.equal(item.actor.system.spells.spell3.value,0);
 item.system.uses.spent=12;let u=await paid(item,inflict);await prepareFocusUpdates(inflict,{},u);assert.equal(u.rolls.length,1);assert.equal(u.item[0]['system.quantity'],0);apply(item,u);assert.equal(canUseGriffonFocus(inflict),false);
}
{
 const item=owned('arcanist-bowstaff');item.system.prof=new NativeStaffProficiency(3,0);
 for(const a of acts(item).filter(a=>a.flags?.spikependium?.staffBow)){
  const host={...a,item,actor:item.actor,getActionType:()=> 'rwak',getAttackData:({ability,ammunition,attackMode})=>{assert.equal(ability,a.attack.ability);assert.equal(ammunition,false);assert.equal(attackMode,'ranged');return {parts:['@mod','@prof','@weaponMagic','@ruleBonus','@exhaustion'],data:{mod:4,prof:'0',weaponMagic:2,ruleBonus:1,exhaustion:-2}};}};
  for(const variant of ['flat','dice']){dnd5e.settings.proficiencyModifier=variant;const config={};staffAttackConfig.call(host,(...args)=>nativeStaffAttackConfig.call(host,...args),{ability:'str',attackMode:'oneHanded',ammunition:'arrows'},config,{get:()=>undefined},0);
   assert.equal(config.options.ability,a.attack.ability);assert.equal(config.options.ammunition,false);assert.equal(config.options.attackMode,'ranged');assert.equal(config.data.prof,variant==='flat'?'3':'1d6');assert.equal(config.data.ruleBonus,1);assert.equal(config.data.exhaustion,-2);assert.equal(config.parts.filter(p=>p==='@prof').length,1);
  }
  assert.equal(a.damage.includeBase,false);assert.equal(a.range.override,false);assert.equal(item.system.range.value,150);assert.equal(item.system.range.long,600);
  staffAttackRoll.call(host,(config,dialog)=>{assert.equal(config.ammunition,false);assert.equal(config.attackMode,'ranged');assert.equal(config.ability,a.attack.ability);assert.deepEqual(dialog.options.attackModeOptions.map(x=>x.value),['ranged']);return 'roll';});
 }
 item.actor.system.abilities.int.value=16;assert.equal(guardFocusAttunement(item,{'system.attuned':true}),false);assert.equal(canUseGriffonFocus(activity(item,a=>a.flags?.spikependium?.staffBow)),false);
 const model={parent:item,properties:new Set(item.system.properties)};prepareFocusWeapon.call(model,()=>{});assert.equal(model.magicalBonus,0);item.actor.system.abilities.int.value=17;prepareFocusWeapon.call(model,()=>{});assert.equal(model.magicalBonus,2);
 item.actor.items.length=0;assert.equal(guardFocusRoll({subject:activity(item,a=>a.type==='attack')}),false);
}
{
 const item=owned('stormstruck'),parts=[{base:true,clone:part=>({...part,base:true})}],extra=()=>staffDamageParts.call({item},()=>parts)[1];
 assert.equal(extra().custom.formula,'1');const u=updates();prepareStaffUpdates(activity(item,a=>a.flags?.spikependium?.staffLightning),{},u);apply(item,u);assert.equal(stormStaffGlowing(item),true);assert.equal(extra().denomination,6);assert.equal(extra().base,false);
 game.time.worldTime=160;assert.equal(stormStaffGlowing(item),false);globalThis.fromUuidSync=()=>({item:{type:'spell',_stats:{compendiumSource:'Compendium.dnd5e.spells24.Item.phbsplShillelagh'}}});
 item.effects=[{type:'enchantment',system:{origin:{activity:'Actor.caster.Item.spell.Activity.enchant'}},duration:{remaining:30}}];assert.equal(stormStaffGlowing(item),true);item.effects[0].disabled=true;assert.equal(stormStaffGlowing(item),false);item.effects=[];
 const actor=item.actor;actor.system.attributes.hp={value:20,temp:0,tempmax:0,damage:0};actor.system._source={attributes:{hp:{tempmax:0}}};actor.system.traits={};actor.getRollData=()=>({});actor.changeIsIgnored=()=>false;
 actor.changeHasEffect=(trait,d)=>trait==='immunity'&&actor.immune&&d.type==='lightning';actor.calculateDamage=(d,o)=>nativeCalculateDamage.call(actor,d,o);actor.update=async u=>{if(actor.fail)throw Error('update failed');for(const[p,v]of Object.entries(u))set(actor,p,v);};item.update=async u=>{for(const[p,v]of Object.entries(u))set(item,p,v);};
 globalThis.Hooks={call:(hook,...args)=>{if(hook==='dnd5e.calculateDamage')recordStaffCalculation(...args);return true;},callAll:(hook,...args)=>{if(hook==='dnd5e.applyDamage')actor.pending=applyStaffLightning(...args);}};
 for(const[immune,self,fail,glows]of [[true,false,false,false],[false,true,false,false],[false,false,true,false],[false,false,false,true]]){
  item.flags.spikependium.staffGlowUntil=0;actor.immune=immune;actor.fail=fail;actor.system.attributes.hp.value=20;actor.pending=null;
  const o={originatingMessage:{getAssociatedActivity:()=>({item:self?item:{uuid:'Actor.enemy.Item.spell'}})}};
  if(fail)await assert.rejects(()=>nativeApplyDamage.call(actor,[{type:'lightning',value:3}],o));else await nativeApplyDamage.call(actor,[{type:'lightning',value:3}],o);
  await actor.pending;assert.equal(stormStaffGlowing(item),glows);
 }
 const token={isOwner:true,actor,light:{bright:2,dim:4,toObject(){return{bright:this.bright,dim:this.dim};}},flags:{spikependium:{}},async update(u){for(const[p,v]of Object.entries(u)){if(p.includes('.-=')){const k=p.split('.');const last=k.pop().slice(2);delete read(this,k.join('.'))[last];}else set(this,p,clone(v));}}};
 game.scenes=[{grid:{units:'ft'},tokens:[token]}];await syncWeaponLights();assert.equal(token.light.bright,10);assert.equal(token.light.dim,20);game.time.worldTime+=60;await syncWeaponLights();assert.equal(token.light.bright,2);assert.equal(token.light.dim,4);
 item.system.equipped=false;assert.equal(staffDamageParts.call({item},()=>parts).length,1);
}
console.log('GS1 staves: seven sources/folders/prices/native bases, charges, native refund and turn limits, spell levels/final-charge destruction, rope forms, ranged proficiency variants without ammo, lightning immunity/source/update guards, Shillelagh and expiring shared light passed.');
