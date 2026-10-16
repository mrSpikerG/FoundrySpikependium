import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GRIFFON_TWO_WEAPONS } from '../src/content/griffons-saddlebag-two-weapons.mjs';
import { canUseTwoWeapon, canEnchantKinetic, prepareTwoWeaponUpdates, finishTwoWeaponUse, prepareTwoWeaponModel,
  firstLightMovement, twoWeaponAttackConfig, twoWeaponAttack, twoWeaponDamage, twoWeaponDamageParts, twoWeaponDamagePart, twoWeaponEndTurn, cleanTwoWeapons, recordEruptionHit } from '../scripts/griffon-two-weapons.mjs';
import { prepareGriffonTwoUpdates } from '../scripts/griffon-two-items.mjs';
import { nativeUsesConsumption, nativeConsumeMaterial, nativeUsageConfig } from './data/dnd5e-monsters-native.mjs';
import { nativeTwoWeaponScaling, nativeTwoWeaponDamageConfig } from './data/dnd5e-griffon-two-weapons-native.mjs';
import { processTwoWeaponHits, recordCovoltDamage, resumeTwoWeaponHits } from '../scripts/griffon-two-weapon-hits.mjs';
import { prepareEffectData } from './data/dnd5e-effect-application.mjs';
import { nativeApplyDamage, nativeCalculateDamage } from './data/dnd5e-guardian-native.mjs';
import { canUseGriffonItem } from '../scripts/griffon-items.mjs';
import { processMedzoDamage, recordMedzoDamage, chooseMedzoDie, prepareMedzoAdvantage, medzoAttackEvaluate, medzoDamageEvaluate, consumeMedzoAdvantage, resumeMedzo, cleanMedzoProfiles } from '../scripts/griffon-medzo.mjs';
import { radiantLightUpdate } from '../scripts/mechanics.mjs';
import { syncWeaponLights } from '../scripts/griffon-weapon-lights.mjs';
import { validRiptideWave, recordRiptideConsumption, finishRiptideUse, useRiptideWave, riptideStartTurn, syncRiptide } from '../scripts/griffon-riptide.mjs';
import { nativeRefund } from './data/dnd5e-reaction-native.mjs';
import { groundDamage } from '../scripts/arcana-stages.mjs';
const records=fs.readdirSync('packs/_source/items').map(f=>JSON.parse(fs.readFileSync(`packs/_source/items/${f}`,'utf8')));
const docs=new Map(records.filter(d=>d.flags?.spikependium?.key).map(d=>[d.flags.spikependium.key,d]));
const folders=new Map(records.filter(d=>d._key.startsWith('!folders!')).map(d=>[d._id,d]));
const get=id=>{const d=docs.get(`item:gs2:${id}`);assert.ok(d,id);return d;};
const bases=JSON.parse(fs.readFileSync('tools/data/griffon-two-weapon-bases.json','utf8'));
const provenance=JSON.parse(fs.readFileSync('tools/data/griffon-two-weapons.json','utf8'));
assert.equal(GRIFFON_TWO_WEAPONS.length,12);assert.equal(provenance.entries.length,12);
for(const [en,id,,,baseId] of GRIFFON_TWO_WEAPONS){
 const d=get(id), row=provenance.entries.find(r=>r.key===d.flags.spikependium.key);assert.ok(row.name.endsWith(`[${en}]`));
 assert.match(d.name,/[а-яё]/i);assert.equal(d.system.source.custom,row.url);assert.equal(d.system.source.rules,'2014');assert.equal(d.system.source.page,'');
 assert.ok(d.system.price.value>0);assert.ok(d.system.weight.value>=0);
 let current=d.folder,parts=[],seen=new Set();while(current){assert.ok(!seen.has(current));seen.add(current);const f=folders.get(current);assert.ok(f);parts.push(f.name);current=f.folder;}
 assert.ok(parts.includes('Сумка грифона — книга 2')&&parts.includes('Оружие'));
 if(baseId){const base=bases.records.find(r=>r.document.system.type.baseItem===baseId).document;assert.equal(d.type,'weapon');assert.equal(d.system.weight.value,base.system.weight.value);assert.equal(d.system.mastery,base.system.mastery);assert.ok(Object.values(d.system.activities).some(a=>a.type==='attack'));}
 if(baseId)assert.equal(Object.values(d.system.activities).find(a=>a.type==='attack').attack.type.value,'','main attack inherits native melee/ranged/thrown weapon modes');
 for(const a of Object.values(d.system.activities)){assert.equal(a.consumption.spellSlot,false);for(const e of a.effects??[])assert.ok(d.effects.some(p=>p._id===e._id));}
}
for(const id of ['priest','eclipse'])for(const a of Object.values(get(id).system.activities).filter(a=>a.type==='cast'))assert.ok(bases.spells.some(s=>s.uuid===a.spell.uuid),'exact pinned legacy spell exists');
assert.equal(get('greatbow').system.damage.base.denomination,10);assert.equal(get('priest').system.magicalBonus,1);
assert.deepEqual(get('eclipse').system.damage.base.types,['piercing','slashing']);
assert.equal(get('medzo').system.damage.base.number,3);assert.equal(Object.values(get('medzo').system.activities).find(a=>a.type==='attack').damage.includeBase,true);
const list=a=>Object.assign(a,{get(id){return this.find(i=>i.id===id);},has(id){return this.some(i=>i.id===id);}});
const set=(obj,path,value)=>{const keys=path.split('.'),last=keys.pop();for(const k of keys)obj=obj[k]??={};if(last.startsWith('-='))delete obj[last.slice(2)];else obj[last]=structuredClone(value);};
const world=new Map();let selected={projectile:'0'}, rolls=0, casts=0;
globalThis.game={user:{id:'gm',isGM:true,isActiveGM:true},users:{activeGM:{id:'gm'}},time:{worldTime:0},actors:[],scenes:[],combat:null,messages:list([])};
globalThis.ui={notifications:{warn(){},info(){}}};globalThis.fromUuidSync=uuid=>world.get(uuid);
globalThis.foundry={utils:{escapeHTML:s=>s,randomID:()=>`nonce${++rolls}`},applications:{api:{DialogV2:{async input(){return selected;}}}}};
globalThis.ActiveEffect={implementation:{getEffectStart:()=>({time:game.time.worldTime})}};
globalThis.CONFIG={Dice:{BasicRoll:class{constructor(formula){assert.equal(formula,'2d6');}async evaluate(){this.total=7;return this;}}}};
const owner={uuid:'Actor.hero',isOwner:true,items:list([]),effects:[],classes:{cleric:{system:{levels:1}}},system:{abilities:{str:{value:15}}},statuses:new Set()};game.actors.push(owner);
function item(id){const d=structuredClone(get(id));d.id=d._id;d.uuid=`${owner.uuid}.Item.${d.id}`;d.actor=owner;d.system.equipped=true;d.system.attuned=true;
 d.system.properties=new Set(d.system.properties);d.system.uses.value=Number(d.system.uses.max)-d.system.uses.spent;
 d.update=async changes=>{for(const [k,v]of Object.entries(changes))set(d,k,v);d.system.uses.value=Number(d.system.uses.max)-d.system.uses.spent;};
 d.setFlag=async(scope,key,value)=>set(d,`flags.${scope}.${key}`,value);d.delete=async()=>{owner.items.splice(owner.items.indexOf(d),1);world.delete(d.uuid);};
 d.system.activities=list(Object.values(d.system.activities).map(a=>({...a,id:a._id,actor:owner,item:d,uuid:`${d.uuid}.Activity.${a._id}`,async use(){casts++;}})));
 owner.items.push(d);world.set(d.uuid,d);for(const a of d.system.activities)world.set(a.uuid,a);return d;}
const flagAct=(i,flag)=>i.system.activities.find(a=>a.flags?.spikependium?.[flag]);const attack=i=>i.system.activities.find(a=>a.type==='attack');
const combatant={id:'hero',actor:owner,initiative:20};game.combat={id:'battle',started:true,round:1,turn:0,turns:[combatant],combatant,previous:{round:1,turn:0}};
const greatbow=item('greatbow'), spear={id:'spear',type:'weapon',name:'Копьё',system:{type:{baseItem:'spear'},quantity:2},async update(c){for(const[k,v]of Object.entries(c))set(this,k,v);}};owner.items.push(spear);
const shot=flagAct(greatbow,'greatbowSpearShot');
await twoWeaponAttack.call(shot,async config=>{assert.equal(config.ammunition,false);return null;});assert.equal(spear.system.quantity,2);assert.equal(greatbow.flags.spikependium.greatbowShot,undefined);
await twoWeaponAttack.call(shot,async config=>{assert.equal(config.ammunition,false);return[{options:{}}];});assert.equal(spear.system.quantity,1);
assert.equal(canUseTwoWeapon(shot),false);game.combat.round++;assert.equal(canUseTwoWeapon(shot),undefined);
selected=null;await twoWeaponAttack.call(shot,async()=>{rolls++;});assert.equal(rolls,0);selected={projectile:'0'};
owner.system.abilities.str.value=12;assert.equal(canUseTwoWeapon(attack(greatbow)),false);owner.system.abilities.str.value=15;
const wardancer=item('wardancer'), model={...wardancer.system,parent:wardancer};prepareTwoWeaponModel.call(model,()=>{});assert.ok(model.properties.has('fin'));
assert.equal(await twoWeaponAttack.call(attack(wardancer),async()=>{throw Error('should not roll');},{attackMode:'twoHanded'}),null);
assert.equal(canUseTwoWeapon(flagAct(wardancer,'wardancerBonus')),false);
await twoWeaponAttack.call(attack(wardancer),async()=>[{options:{attackMode:'thrown'}}]);assert.equal(canUseTwoWeapon(flagAct(wardancer,'wardancerBonus')),false);
await twoWeaponAttack.call(attack(wardancer),async()=>[{options:{attackMode:'oneHanded'}}]);assert.equal(canUseTwoWeapon(flagAct(wardancer,'wardancerBonus')),undefined);
await finishTwoWeaponUse(flagAct(wardancer,'wardancerGrip'),{message:{}});await wardancer.setFlag('spikependium','wardancerGrip','two');prepareTwoWeaponModel.call(model,()=>{});assert.equal(model.properties.has('fin'),false);
const medzo=item('medzo');await twoWeaponAttack.call(attack(medzo),async()=>[{options:{},dice:[{faces:20,results:[{result:1,active:true}]}]}]);assert.equal(canUseTwoWeapon(attack(medzo)),false);
await twoWeaponEndTurn.call(game.combat,async()=>{},combatant);assert.equal(canUseTwoWeapon(attack(medzo)),false);await twoWeaponEndTurn.call(game.combat,async()=>{},combatant);assert.equal(canUseTwoWeapon(attack(medzo)),false,'duplicate turn end does not advance jam');
game.combat.previous.round++;await twoWeaponEndTurn.call(game.combat,async()=>{},combatant);assert.equal(canUseTwoWeapon(attack(medzo)),undefined);
const priest=item('priest'), transform=flagAct(priest,'priestForm'), oldPrice=priest.system.price.value;
await finishTwoWeaponUse(transform,{});assert.equal(priest.system.type.baseItem,'mace');await finishTwoWeaponUse(transform,{message:{}});assert.equal(priest.system.type.baseItem,'quarterstaff');assert.equal(priest.system.price.value,oldPrice);assert.equal(priest.system.magicalBonus,1);
await finishTwoWeaponUse(transform,{message:{}});assert.equal(priest.system.type.baseItem,'mace');
const charge=flagAct(priest,'gs2Charge'), updates={item:[{_id:priest.id,'system.uses.spent':1}],rolls:[]};assert.equal(await prepareTwoWeaponUpdates(charge,{},updates),updates);
const cloneActivity={...charge,item:{...priest,system:{...priest.system,uses:{...priest.system.uses}}}};assert.notEqual(cloneActivity.item,priest);assert.equal(await prepareTwoWeaponUpdates(cloneActivity,{},updates),updates,'native usage clones are resolved to the real owned resource');
priest.system.attuned=false;assert.equal(await prepareTwoWeaponUpdates(cloneActivity,{},updates),false,'stale clone cannot retain attunement');priest.system.attuned=true;
assert.equal(await prepareTwoWeaponUpdates(charge,{consume:false},{item:[],rolls:[]}),false);
const heal=flagAct(priest,'priestDestroy'), cached={item:{system:{sourceItem:'weapon:griffon-gs2-priest'}},actor:owner,getLinkedActivity:()=>heal};assert.equal(canUseTwoWeapon(cached),undefined);
await finishTwoWeaponUse({...cached,getLinkedActivity:()=>heal},{message:{}});assert.equal(owner.items.has(priest.id),false);assert.equal(canUseTwoWeapon(cached),false);
const kinetic=item('kinetic'), ordinary={id:'bow',uuid:'Actor.hero.Item.bow',actor:owner,effects:[{active:true,flags:{spikependium:{kineticBowstring:true}}}],flags:{spikependium:{}},system:{equipped:true,attunement:'',range:{value:80,long:320},properties:new Set(['amm']),damage:{base:{types:new Set(['piercing'])}}}}, bowModel={...ordinary.system,parent:ordinary};
ordinary.update=async c=>{for(const[k,v]of Object.entries(c))set(ordinary,k,v);};
prepareTwoWeaponModel.call(bowModel,()=>{});assert.equal(bowModel.range.value,160);prepareTwoWeaponModel.call(bowModel,()=>{});assert.equal(bowModel.range.value,160);assert.equal(bowModel.range.long,320);
const errors=[];canEnchantKinetic({item:kinetic},{system:{type:{baseItem:'sling'}}},errors);assert.equal(errors.length,1);
const activity={item:ordinary,actor:owner,type:'attack',flags:{}},config={options:{}};
twoWeaponAttackConfig.call(activity,()=>{},null,config);assert.equal(config.options.spikependiumTwoWeapon.kinetic,true);
await twoWeaponAttack.call(activity,async()=>null);prepareTwoWeaponModel.call(bowModel,()=>{});assert.equal(bowModel.range.value,160);
await twoWeaponAttack.call(activity,async()=>[{options:config.options}]);prepareTwoWeaponModel.call(bowModel,()=>{});assert.equal(bowModel.range.value,80);
const part={base:true,number:1,denomination:8,types:new Set(['piercing']),clone(c){return{...this,...c,types:new Set(c.types??this.types)};}};
assert.equal(twoWeaponDamageParts.call(activity,()=>[part],{spikependiumTwoWeapon:config.options.spikependiumTwoWeapon}).length,2,'saved first-shot context survives resource consumption');
const first=item('first-light'), lightModel={...first.system,parent:first};lightModel.damage.base.types=new Set(lightModel.damage.base.types);
await finishTwoWeaponUse(flagAct(first,'firstLightOn'),{message:{}});prepareTwoWeaponModel.call(lightModel,()=>{});assert.ok(lightModel.damage.base.types.has('radiant'));
globalThis.dnd5e={utils:{convertLength:(value,_from,to)=>to==='m'?value/5:value}};
game.combat.round=1;const movement={parent:owner,attributes:{movement:{bonus:0}}};firstLightMovement.call(movement,()=>assert.equal(movement.attributes.movement.bonus,'(0) + 15'));assert.equal(movement.attributes.movement.bonus,0);
movement.attributes.movement.bonus='@abilities.str.mod';movement.attributes.movement.units='m';firstLightMovement.call(movement,()=>assert.equal(movement.attributes.movement.bonus,'(@abilities.str.mod) + 3'));assert.equal(movement.attributes.movement.bonus,'@abilities.str.mod');
game.combat.round=2;movement.attributes.movement.bonus=0;firstLightMovement.call(movement,()=>{});assert.equal(movement.attributes.movement.bonus,0);
const hammer=item('eruptions'), erupt=flagAct(hammer,'gs2Erupt');assert.equal(canUseTwoWeapon(erupt),false);
hammer.system.attuned=false;assert.equal(canUseGriffonItem(attack(hammer)),true,'plain weapon attack remains available before attunement');
assert.equal(canUseGriffonItem(erupt),false);const coldAttack={options:{}};twoWeaponAttackConfig.call(attack(hammer),()=>{},null,coldAttack);assert.equal(coldAttack.options.spikependiumTwoWeapon.eruption,false);hammer.system.attuned=true;
await hammer.setFlag('spikependium','eruptionWarm',{combat:game.combat.id,ends:0});
for(let n=1;n<=3;n++){game.combat.previous.round=10+n;await twoWeaponEndTurn.call(game.combat,async()=>{},combatant);}
assert.equal(casts,1);assert.equal(canUseTwoWeapon(erupt),undefined);assert.equal(canUseTwoWeapon(attack(hammer)),false);
const cooldown={item:[{_id:hammer.id,'system.uses.spent':1}],rolls:[]};assert.equal(await prepareGriffonTwoUpdates(erupt,{},cooldown),cooldown);
assert.equal(Object.values(cooldown.item[0]).includes(25200),true);assert.equal(cooldown.rolls.length,1);
await finishTwoWeaponUse(erupt,{message:{}});assert.equal(hammer.flags.spikependium.eruptionReady,undefined);
await hammer.setFlag('spikependium','eruptionWarm',{combat:game.combat.id,ends:0});hammer.system.equipped=false;await cleanTwoWeapons();assert.equal(hammer.flags.spikependium.eruptionWarm,undefined);
let damageCritical;await twoWeaponDamage.call(attack(medzo),config=>{damageCritical=config.isCritical;},{isCritical:true});assert.equal(damageCritical,true,'other damage parts retain the critical');
const baseCritical=twoWeaponDamagePart.call(attack(medzo),()=>({parts:['3d4','@mod','@magicalBonus'],options:{}}),{base:true}, {}, {},0);assert.equal(baseCritical.options.critical.multiplier,1);assert.equal(baseCritical.options.critical.powerfulCritical,false);assert.deepEqual(baseCritical.parts,['3d4','@magicalBonus']);
const otherCritical=twoWeaponDamagePart.call(attack(medzo),()=>({parts:['1d6'],options:{}}),{}, {}, {},1);assert.equal(otherCritical.options.critical,undefined);
const bonusParts=twoWeaponDamagePart.call(flagAct(wardancer,'wardancerBonus'),()=>({parts:['1d6','@mod','@magicalBonus'],options:{}}),{base:true},{},{},0);assert.deepEqual(bonusParts.parts,['1d6','min(0, @mod)','@magicalBonus']);
const useTarget={resolveCost:async()=>({total:1})};assert.deepEqual(await nativeUsesConsumption.call(useTarget,{}, {uses:{value:3,spent:1},rolls:[]}),{spent:2});
console.log('GS2 weapons: 12 sources/folders/native bases, legacy spell references, charge guards, native forms, first-shot snapshot/cancel/range, spear quantity/turn limit, jam/end-turn deduplication, dynamic finesse/radiant damage, initiative speed and eruption cooldown passed.');
const riptide=item('riptide'), pull=flagAct(riptide,'riptideStart'), bolt={id:'bolt',type:'consumable',system:{quantity:1,type:{value:'ammo',subtype:'crossbowBolt'},uses:{autoDestroy:true}}};owner.items.push(bolt);
const paid={item:[{_id:riptide.id,'system.uses.spent':1}],delete:[],rolls:[]};
await nativeConsumeMaterial.call({actor:owner,target:bolt.id,resolveCost:async()=>({total:1})},{},paid);assert.deepEqual(paid.delete,['bolt']);assert.equal(await prepareTwoWeaponUpdates(pull,{},paid),paid);
assert.equal(await prepareTwoWeaponUpdates(pull,{}, {item:[{_id:riptide.id,'system.uses.spent':1}],delete:[],rolls:[]}),false,'a charge alone does not pay the special bolt');
const merge=(a,b,options={})=>{if(options.inplace===false)a=structuredClone(a);for(const[k,v]of Object.entries(b)){if(v&&Object.getPrototypeOf(v)===Object.prototype)merge(a[k]??={},v);else a[k]=structuredClone(v);}return a;};
foundry.utils.mergeObject=merge;foundry.utils.deepClone=structuredClone;foundry.utils.getType=v=>Array.isArray(v)?'Array':typeof v;
let serial=0,damageCalls=0,saveCalls=0,saveTotal=8;
class D20{constructor(face,target=10,total=face+3){this.total=total;this.options={target};this._evaluated=true;this.dice=[{faces:20,results:[{result:face,active:true}]}];this.isCritical=face>=19;this.isFumble=face===1;}get isFailure(){return this.total<this.options.target;}toJSON(){return{total:this.total,options:this.options,dice:this.dice};}}
function message(data){const id=`gs2msg${++serial}`,m={id,uuid:`ChatMessage.${id}`,author:game.user,flags:{},system:{},rolls:[],whisper:[],...data,
 getAssociatedActivity(){return this.activity;},getAssociatedActor(){return this.activity?.actor??this.actor;},getAssociatedItem(){return this.activity?.item;},async setFlag(scope,key,value){set(this,`flags.${scope}.${key}`,value);}};world.set(m.uuid,m);game.messages.push(m);return m;}
class Damage{constructor(type,total){this.options={type};this.total=total;this._evaluated=true;}static async build(config,_dialog,chat){assert.equal(config.isCritical,false);assert.equal(config.rolls[0].parts[0],'1d8');damageCalls++;message({...chat.data,rolls:[new Damage('lightning',8)]});}}
CONFIG.Dice.D20Roll=D20;CONFIG.Dice.DamageRoll=Damage;CONFIG.DND5E={healingTypes:{healing:{},temphp:{}},damageTypes:{lightning:{}}};
globalThis.ChatMessage={getSpeaker:({actor})=>({actor:actor.uuid})};Math.clamp??=(n,min,max)=>Math.min(max,Math.max(min,n));Number.isNumeric??=n=>Number.isFinite(n);
globalThis.Hooks={call(name,...args){return name==='dnd5e.preApplyDamage'?recordCovoltDamage(...args)!==false:true;},callAll(){}};
class FX{constructor(data,parent){Object.assign(this,structuredClone(data));this.parent=parent;this.id=data._id;this.uuid=`${parent.uuid}.ActiveEffect.${this.id}`;this.statuses=new Set(data.statuses??[]);this._stats??={};world.set(this.uuid,this);}toObject(){const {parent,statuses,...data}=this;return structuredClone({...data,statuses:[...statuses]});}static getEffectStart(){return{time:game.time.worldTime};}}
ActiveEffect.implementation.forApplication=async changes=>changes;
globalThis.dnd5e={applications:{components:{EffectApplicationElement:class{async _prepareEffectData(e,actor){return prepareEffectData.call(this,e,actor,s=>s);}}}}};
foundry.documents={modifyBatch:async ops=>{for(const op of ops)for(const data of op.data??[])op.parent.effects.push(new FX({...data,_id:`gs2fx${++serial}`},op.parent));}};
owner.effects=list(owner.effects);
const victim={id:'victim',uuid:'Actor.victim',name:'Цель',flags:{spikependium:{}},isOwner:true,effects:list([]),items:list([]),statuses:new Set(),
 system:{attributes:{hp:{value:100,max:100,effectiveMax:100,temp:0,tempmax:0,damage:0}},details:{type:{value:'humanoid'}},abilities:{int:{value:10}},traits:{ci:{value:new Set()},languages:{value:new Set(['common'])}},_source:{attributes:{hp:{tempmax:0}}}},
 async update(c){if(this.failUpdate){this.failUpdate=false;throw Error('interrupted HP update');}for(const[k,v]of Object.entries(c))set(this,k,v);this.system.attributes.hp.damage=100-this.system.attributes.hp.value;},
 getRollData(){return this.system;},changeHasEffect(kind,damage){return kind==='resistance'&&damage.type==='lightning';},changeIsIgnored:()=>false,
 calculateDamage(d,options){return nativeCalculateDamage.call(this,d,options);},applyDamage(d,options){return nativeApplyDamage.call(this,d,options);},
 async rollSavingThrow(config,_dialog,chat){assert.equal(config.ability,'wis');saveCalls++;return message({...chat.data,type:'save',actor:this,rolls:[new D20(10,config.target,saveTotal)]}).rolls;}};
const token={id:'victim',uuid:'Scene.test.Token.victim',actor:victim};world.set(victim.uuid,victim);world.set(token.uuid,token);game.actors.push(victim);
game.combat.turns.push({id:'victim',actor:victim,initiative:10});
function shotCard(i,face){const a=attack(i),roll=new D20(face);a.attack.type.classification='weapon';a.getAppliedEffectChanges=()=>({});
 roll.options.spikependiumWeaponContext={combat:game.combat.id,round:game.combat.round,turn:game.combat.turn,own:true,time:game.time.worldTime,start:{time:game.time.worldTime}};
 roll.options.spikependiumTwoWeapon={pumpkinNight:true};return message({type:'attack',activity:a,rolls:[roll],system:{targets:[{token:token.uuid,actor:victim.uuid,ac:10}]}});}
const covolt=item('covolt');covolt.effects=list(covolt.effects.map(e=>new FX(e,covolt)));
const critical=shotCard(covolt,19);await Promise.all([processTwoWeaponHits(critical),processTwoWeaponHits(critical)]);assert.equal(damageCalls,1);assert.equal(victim.system.attributes.hp.value,96,'native lightning resistance halves one non-doubled d8');assert.equal(victim.effects.length,1);assert.equal(victim.effects[0].duration.expiry,'targetStart');
await processTwoWeaponHits(critical);await resumeTwoWeaponHits();assert.equal(victim.system.attributes.hp.value,96);assert.equal(damageCalls,1);
const retry=shotCard(covolt,20);victim.failUpdate=true;await assert.rejects(processTwoWeaponHits(retry),/interrupted HP/);const before=damageCalls;await resumeTwoWeaponHits();assert.equal(damageCalls,before,'retry reuses the original rolled d8');assert.equal(victim.system.attributes.hp.value,92);
const pumpkin=item('pumpkin');pumpkin.effects=list(pumpkin.effects.map(e=>new FX(e,pumpkin)));
await processTwoWeaponHits(shotCard(pumpkin,19));assert.equal(saveCalls,0,'expanded critical range does not trigger natural-20-only fear');
await processTwoWeaponHits(shotCard(pumpkin,20));assert.equal(saveCalls,1);assert.ok(victim.effects.some(e=>e.statuses.has('frightened')&&e.duration.expiry==='sourceStart'));
const hammerShot=shotCard(hammer,20);hammer.system.equipped=true;hammerShot.rolls[0].options.spikependiumTwoWeapon={eruption:true,turn:`${game.combat.id}:${game.combat.round}:${game.combat.turn}`};await recordEruptionHit(hammerShot);assert.equal(hammer.flags.spikependium.eruptionWarm.ends,0);
const oldDamage=damageCalls;critical.rolls[0].total=2;await processTwoWeaponHits(critical);assert.equal(damageCalls,oldDamage,'changed source roll cannot repeat damage');
game.user.isActiveGM=false;await processTwoWeaponHits(shotCard(covolt,20));assert.equal(damageCalls,oldDamage);game.user.isActiveGM=true;
console.log('GS2 critical hits: native d8/resistance, expanded critical range, native Wisdom save/fear profiles, atomic HP receipts, interrupted-update retry without reroll, changed-source and non-GM guards; native last-bolt consumption passed.');
const processCritical={critical:{multiplier:2,powerfulCritical:true}};
assert.equal(nativeTwoWeaponDamageConfig(baseCritical,processCritical,c=>c).options.critical.multiplier,1);
assert.equal(nativeTwoWeaponDamageConfig(otherCritical,processCritical,c=>c).options.critical.multiplier,2);assert.equal(processCritical.critical.multiplier,2);
CONFIG.DND5E.activityActivationTypes={action:{}};CONFIG.DND5E.spellcasting={spell:{}};foundry.utils.setProperty=set;
const linked={relativeUUID:'.Item.priest.Activity.cure',spell:{level:3},consumption:{scaling:{allowed:false},targets:[{}]}};
const caster={system:{spells:{spell3:{level:3,value:0}}}}, spell={system:{level:1,method:'spell'},flags:{dnd5e:{}},actor:caster,getFlag:()=>undefined,
 updateSource(c){for(const[k,v]of Object.entries(c))set(this,k,v);},prepareFinalAttributes(){assert.equal(this.flags.dnd5e.scaling,2);}};
const nativeActivity={getLinkedActivity:()=>linked,target:{template:{}},consumption:{spellSlot:true,targets:[]},isSpell:true,activation:{type:'action'},actor:caster,requiresSpellSlot:true,item:spell};
const usage=nativeUsageConfig.call(nativeActivity,{});assert.equal(usage.spell.slot,'spell3');assert.equal(usage.consume.spellSlot,false);
const scalingMessage={};await nativeTwoWeaponScaling.call(nativeActivity,usage,scalingMessage,spell);assert.equal(usage.scaling,2);assert.equal(spell.flags.dnd5e.scaling,2);assert.equal(scalingMessage.data.system.scaling,2);assert.equal(caster.system.spells.spell3.value,0);
console.log('Native dnd5e: fixed third-level linked casting scales by two without a personal slot; Medzo overrides only its own critical multiplier, preserving other rolls.');
class MedzoDie {
 constructor(data){Object.assign(this,structuredClone(data));this.options??={};this._evaluated=true;}
 get total(){return this.results.filter(r=>r.active!==false&&!r.discarded).reduce((n,r)=>n+(r.count??r.result),0);}get flavor(){return this.options.flavor;}
 toJSON(){return{class:'MedzoDie',number:this.number,faces:this.faces,results:this.results,options:this.options,evaluated:true};}static fromData(d){return new this(d);}
}
class MedzoNumber{constructor(d){Object.assign(this,d);this.options??={};}get total(){return this.number;}get flavor(){return this.options.flavor;}toJSON(){return{class:'MedzoNumber',number:this.number,options:this.options};}static fromData(d){return new this(d);}}
class MedzoOperator{constructor(d){Object.assign(this,d);}toJSON(){return{class:'MedzoOperator',operator:this.operator,options:{}};}static fromData(d){return new this(d);}}
const medzoTerm=d=>d.class==='MedzoDie'?MedzoDie.fromData(d):d.class==='MedzoNumber'?MedzoNumber.fromData(d):MedzoOperator.fromData(d);
let extraDice=0,rerollDice=0;
class MedzoRoll{
 constructor(terms,options={}){if(typeof terms==='string'){assert.equal(terms,'1d6');terms=[new MedzoDie({number:1,faces:6,results:[{result:6,active:true}]})];}this.terms=terms;this.options={configured:true,...options};this._evaluated=true;}
 async evaluate(){return this;}
 async toMessage(data){return message({...data,rolls:[this]});}
 get dice(){return this.terms.filter(t=>t instanceof MedzoDie);}get total(){let total=0,sign=1;for(const t of this.terms){if(t instanceof MedzoOperator)sign=t.operator==='-'?-1:1;else total+=sign*t.total;}return total;}
 toJSON(){return{class:'DamageRoll',evaluated:true,total:this.total,formula:this.terms.map(t=>t instanceof MedzoDie?`${t.number}d${t.faces}`:t.operator??t.number).join(' '),options:this.options,terms:this.terms.map(t=>t.toJSON())};}
 static fromData(d){return new this(d.terms.map(medzoTerm),d.options);}static fromTerms(terms,options){return new this(terms,options);}
 static async build(config,_dialog,chat){const formula=config.rolls[0].parts[0],faces=formula==='1d6'?6:4;assert.ok(['1d6','1d4'].includes(formula));if(faces===6)extraDice++;else rerollDice++;
  assert.deepEqual(config.hookNames,['formula'],'replacement dice must not invoke damage modifiers twice');assert.equal(chat.data.type,'generic');
  const die=new MedzoDie({number:1,faces,results:[{result:faces===6?1:4,active:true}]});message({...chat.data,rolls:[new this([die],config.rolls[0].options)]});}
}
CONFIG.Dice.DamageRoll=MedzoRoll;CONFIG.DND5E.damageTypes.piercing={};
CONFIG.Dice.BasicRoll=MedzoRoll;
foundry.dice={terms:{DiceTerm:MedzoDie,NumericTerm:MedzoNumber,OperatorTerm:MedzoOperator,PoolTerm:class{},RollTerm:{fromData:medzoTerm}}};
const {default:aggregateMedzo}=await import('./data/dnd5e-damage-aggregation-native.mjs');
Object.defineProperty(FX.prototype,'active',{get(){return !this.disabled&&!this.duration?.expired;}});
FX.prototype.delete=async function(){this.parent.effects.splice(this.parent.effects.indexOf(this),1);world.delete(this.uuid);};
medzo.effects=list(get('medzo').effects.map(e=>new FX(e,medzo)));
function medzoCard(value){const origin=shotCard(medzo,15),roll=new MedzoRoll([new MedzoDie({number:3,faces:4,results:[value,value,value].map(result=>({result,active:true}))})],{type:'piercing',properties:['mgc'],spikependiumMedzoBase:true});
 const card=message({type:'damage',activity:origin.activity,isOwner:true,rolls:[roll],system:{targets:origin.system.targets,origin:origin.id},flags:{spikependium:{attackSource:{message:origin.uuid,signature:JSON.stringify(origin.rolls.map(r=>r.toJSON()))}}}});
 card.update=async changes=>{if(card.failUpdate){card.failUpdate=false;throw Error('interrupted Medzo card update');}for(const[k,v]of Object.entries(changes)){if(k==='rolls')card.rolls=v.map(MedzoRoll.fromData.bind(MedzoRoll));else set(card,k,v);}};return card;}
const twos=medzoCard(2);assert.equal(recordMedzoDamage(victim,0,{}, {originatingMessage:twos}),false,'pending triple cannot apply incomplete damage');
await Promise.all([processMedzoDamage(twos),processMedzoDamage(twos)]);assert.equal(extraDice,1);assert.equal(twos.rolls.length,2);assert.equal(twos.rolls[1].options.properties[0],'mgc');assert.equal(twos.flags.spikependium.medzoTriple.done,true);
await processMedzoDamage(twos);await resumeMedzo();assert.equal(extraDice,1,'original d6 is appended exactly once');
const aggregated=aggregateMedzo(twos.rolls,{respectProperties:true});assert.equal(aggregated.length,1);assert.equal(aggregated[0].total,7,'3d4 and extra d6 combine before resistance rounding');
victim.changeHasEffect=(kind,d)=>kind==='resistance'&&d.type==='piercing';const resisted=nativeCalculateDamage.call(victim,[{type:'piercing',value:aggregated[0].total,properties:new Set(['mgc'])}],{});assert.equal(resisted.amount,3);
const advantage=victim.effects.find(e=>e.flags.spikependium?.medzoNextAttack);assert.ok(advantage);assert.equal(advantage.duration.expiry,'sourceEnd');
const attackConfig={subject:{type:'attack'},rolls:[{options:{disadvantage:true,advantageMode:-1}}]},targetMessage={data:{system:{targets:twos.system.targets}}};
prepareMedzoAdvantage(attackConfig,{},targetMessage);assert.equal(attackConfig.rolls[0].options.advantageMode,0,'advantage cancels existing disadvantage');
const cancelled=[];await medzoAttackEvaluate(async()=>{},cancelled,attackConfig,targetMessage);assert.ok(world.has(advantage.uuid),'cancelled roll leaves the profile available');
const nextD20=new D20(5);nextD20._evaluated=false;nextD20.options={...nextD20.options,...attackConfig.rolls[0].options};
await medzoAttackEvaluate(async rolls=>{rolls[0]._evaluated=true;},[nextD20],attackConfig,targetMessage);
const stale=new D20(10);stale.options={...nextD20.options};const rejected=[stale];await medzoAttackEvaluate(async()=>{throw Error('stale benefit should not evaluate');},rejected,attackConfig,targetMessage);assert.equal(rejected.length,0);
await consumeMedzoAdvantage(message({type:'attack',activity:attack(medzo),rolls:[nextD20],system:{targets:twos.system.targets}}));assert.equal(world.has(advantage.uuid),false);
const ones=medzoCard(1);await processMedzoDamage(ones);assert.equal(recordMedzoDamage(victim,0,{}, {originatingMessage:ones}),false);
ones.failUpdate=true;await assert.rejects(chooseMedzoDie(ones,'reroll'),/interrupted Medzo/);assert.equal(ones.rolls[0].total,3,'failed update must not mutate original evaluated dice');assert.equal(ones.rolls[0].dice[0].results.length,3);
await chooseMedzoDie(ones,'reroll');assert.equal(rerollDice,1,'retry uses the saved replacement die');assert.equal(ones.rolls[0].total,6);assert.equal(ones.rolls[1].total,1);assert.equal(ones.flags.spikependium.medzoTriple.choice,'reroll');
assert.equal(ones.rolls[0].dice[0].results.filter(r=>r.active!==false).length,3);await chooseMedzoDie(ones,'reroll');await processMedzoDamage(ones);assert.equal(rerollDice,1);assert.equal(ones.rolls.length,2);assert.equal(recordMedzoDamage(victim,0,{}, {originatingMessage:ones}),undefined);
const auxiliary=game.messages.find(m=>m.flags.spikependium?.medzoDamage);assert.equal(recordMedzoDamage(victim,0,{}, {originatingMessage:auxiliary}),false);
const keep=medzoCard(1);await processMedzoDamage(keep);await chooseMedzoDie(keep,'keep');assert.equal(keep.rolls[0].total,3);assert.equal(recordMedzoDamage(victim,0,{}, {originatingMessage:keep}),undefined);
const retryMedzo=medzoCard(3);retryMedzo.failUpdate=true;await assert.rejects(processMedzoDamage(retryMedzo),/interrupted Medzo/);const beforeExtraRetry=extraDice;await resumeMedzo();assert.equal(extraDice,beforeExtraRetry);assert.equal(retryMedzo.rolls.length,2);assert.ok(victim.effects.some(e=>e.flags.spikependium?.medzoDisadvantage));
const malformed=medzoCard(4);malformed.rolls[0].dice[0].results[1].result=3;const beforeMalformed=extraDice;await processMedzoDamage(malformed);assert.equal(extraDice,beforeMalformed);
game.user.isActiveGM=false;await processMedzoDamage(medzoCard(4));assert.equal(extraDice,beforeMalformed);game.user.isActiveGM=true;
game.combat.round+=2;await cleanMedzoProfiles();assert.equal(victim.effects.some(e=>e.flags.spikependium?.medzoDisadvantage),false,'Medzo profiles are removed after the source turn boundary');
console.log('Medzo: original 3d4, one persisted extra d6, native combined resistance/properties, optional one-die replacement/keep, preserved extra die, pending-damage guard, expiry, next-attack advantage/cancellation/stale selections and interrupted-card retries passed.');
// Real token light updates share the existing Radiant Weapon ledger.
const mergeTokenFlags=(target,changes)=>{for(const[k,v]of Object.entries(changes)){if(k.startsWith('-='))delete target[k.slice(2)];else if(v&&Object.getPrototypeOf(v)===Object.prototype)mergeTokenFlags(target[k]??={},v);else target[k]=structuredClone(v);}return target;};
const lightToken={uuid:'Scene.lights.Token.hero',actor:owner,isOwner:true,flags:{spikependium:{}},light:{bright:5,dim:10,color:'#abc',toObject(){return{bright:this.bright,dim:this.dim,color:this.color};}},writes:0,
 async update(c){this.writes++;for(const[k,v]of Object.entries(c)){const old=k.split('.').reduce((o,key)=>o?.[key],this);set(this,k,v&&Object.getPrototypeOf(v)===Object.prototype?mergeTokenFlags(old??{},v):v);}}};
const scene={grid:{units:'ft'},tokens:[lightToken]};game.scenes=[scene];CONFIG.DND5E.movementUnits={ft:{},m:{}};dnd5e.utils={convertLength:(value,_from,to)=>to==='m'?value/5:value};
await first.setFlag('spikependium','firstLightOn',true);await syncWeaponLights();assert.equal(lightToken.light.bright,20);assert.equal(lightToken.light.dim,40);const writes=lightToken.writes;await syncWeaponLights();assert.equal(lightToken.writes,writes,'unchanged flags must not loop token updates');
assert.ok(Object.keys(lightToken.flags.spikependium.radiantLight.radii).every(k=>!k.includes('.')),'UUID keys must survive Foundry dotted-path expansion');
await lightToken.update(radiantLightUpdate(lightToken,'Item.other-radiance',30,60));await lightToken.update(radiantLightUpdate(lightToken,'Item.other-radiance',30,60));assert.equal(lightToken.light.bright,20,'removing the stronger source leaves the smaller light');
const smallWrites=lightToken.writes;await syncWeaponLights();assert.equal(lightToken.writes,smallWrites,'native merged flags remove stale provider keys');
await lightToken.update(radiantLightUpdate(lightToken,'Item.other-radiance',30,60));await first.setFlag('spikependium','firstLightOn',false);await syncWeaponLights();assert.equal(lightToken.light.bright,30);
await lightToken.update(radiantLightUpdate(lightToken,'Item.other-radiance',30,60));assert.equal(lightToken.light.bright,5);assert.equal(lightToken.light.color,'#abc');
await first.setFlag('spikependium','firstLightOn',true);await syncWeaponLights();await lightToken.update({'light.bright':90});await first.setFlag('spikependium','firstLightOn',false);await syncWeaponLights();assert.equal(lightToken.light.bright,90,'manual changes to baseline survive weapon switch-off');
lightToken.light.bright=5;scene.grid.units='m';await first.setFlag('spikependium','firstLightOn',true);await syncWeaponLights();assert.equal(lightToken.light.bright,5);assert.equal(lightToken.light.dim,10,'brighter existing source remains intact in metric scene');
first.system.equipped=false;await syncWeaponLights();assert.equal(lightToken.light.bright,5);assert.equal(lightToken.flags.spikependium.radiantLight,undefined);first.system.equipped=true;
console.log('Weapon lights: native token radii, stable repeated sync, shared sources, baseline restoration, manual edits, equipment changes and scene units passed.');
owner.flags??={spikependium:{}};owner.update=async c=>{for(const[k,v]of Object.entries(c))set(owner,k,v);};world.set(owner.uuid,owner);
foundry.utils.getProperty=(o,path)=>path.split('.').reduce((v,k)=>v?.[k],o);foundry.utils.isEmpty=o=>Object.keys(o).length===0;
const waterScene={uuid:'Scene.water',grid:{units:'ft'},tokens:[]};world.set(waterScene.uuid,waterScene);globalThis.canvas={scene:waterScene};
game.combats=new Map([[game.combat.id,game.combat]]);game.combat.current={round:game.combat.round,turn:game.combat.turn};
riptide.toObject=()=>{const d=structuredClone(get('riptide'));d.system.attuned=true;d.system.equipped=true;return d;};pull.getUsageToken=()=>({parent:waterScene});
let waveCalls=0,cancelWave=false,failWave=false;
CONFIG.Item={documentClass:class{
 constructor(data,{parent}){Object.assign(this,structuredClone(data));this.actor=parent;this.id=data._id;this.uuid=`${parent.uuid}.Item.${this.id}`;this.toObject=()=>structuredClone(data);
  this.system.activities=list(Object.values(this.system.activities).map(a=>({...a,id:a._id,item:this,actor:parent,async use(config){
   if(cancelWave)return;assert.equal(validRiptideWave(this,config),true);assert.equal(canUseGriffonItem(this,config),true);
   const updates={actor:{},item:[],rolls:[]};assert.equal(await prepareTwoWeaponUpdates(this,config,updates),updates);await owner.update(updates.actor);
   if(failWave){failWave=false;throw Error('failed before wave card');}
   const chat={data:{system:{},flags:{}}};recordRiptideConsumption(this,config,chat);const card=message({...chat.data,type:'save',activity:this});waveCalls++;await finishRiptideUse(this,{message:card});return{message:card};
  }})));}
}};
async function paidWater(){
 const updates={actor:{},item:[{_id:riptide.id,'system.uses.spent':riptide.system.uses.spent+1},{_id:bolt.id,'system.quantity':0}],delete:[],rolls:[]};
 assert.equal(await prepareTwoWeaponUpdates(pull,{},updates),updates);await owner.update(updates.actor);
 const chat={data:{system:{deltas:{actor:[{keyPath:Object.keys(updates.actor)[0],delta:NaN}]}},flags:{}}};recordRiptideConsumption(pull,{},chat);assert.equal(chat.data.system.deltas.actor[0].delta,1,'new numeric flags have a reversible delta');
 const card=message({...chat.data,type:'save',activity:pull,isOwner:true}),template={uuid:`${waterScene.uuid}.MeasuredTemplate.${++serial}`,isOwner:true,parent:waterScene,x:100,y:200,flags:{spikependium:{}},async setFlag(scope,k,v){set(this,`flags.${scope}.${k}`,v);},async delete(){world.delete(this.uuid);this.deleted=true;}};
 world.set(template.uuid,template);await finishRiptideUse(pull,{message:card,templates:[template]});return{card,template};
}
const firstWater=await paidWater(),earlyWave=flagAct(riptide,'riptideWave');assert.equal(validRiptideWave(earlyWave,{spikependium:{riptideShot:firstWater.card.uuid}}),false);
await riptideStartTurn.call(game.combat,async()=>{},combatant);assert.equal(waveCalls,0,'same starting turn is not the next turn');
await riptide.delete();game.combat.current.round++;game.combat.round++;await riptideStartTurn.call(game.combat,async()=>{},combatant);assert.equal(waveCalls,1,'paid water bursts from saved rules even after weapon deletion');assert.equal(firstWater.template.deleted,true);
await useRiptideWave(firstWater.card);assert.equal(waveCalls,1,'one paid shot permits one wave');
owner.items.push(riptide);world.set(riptide.uuid,riptide);const refundedWater=await paidWater();
await nativeRefund.call({actor:owner},refundedWater.card.system.deltas,updates=>owner.update(updates.actor));await syncRiptide();assert.equal(refundedWater.template.deleted,true,'refunding the original shot removes only its water marker');
game.combat.current.round++;game.combat.round++;await riptideStartTurn.call(game.combat,async()=>{},combatant);assert.equal(waveCalls,1,'refunded charge cannot produce a wave');
const cancelledWater=await paidWater();cancelWave=true;game.combat.current.round++;game.combat.round++;await riptideStartTurn.call(game.combat,async()=>{},combatant);assert.equal(waveCalls,1);assert.equal(validRiptideWave(earlyWave,{spikependium:{riptideShot:cancelledWater.card.uuid}}),true);
cancelWave=false;failWave=true;await assert.rejects(useRiptideWave(cancelledWater.card),/before wave card/);assert.equal(validRiptideWave(earlyWave,{spikependium:{riptideShot:cancelledWater.card.uuid}}),true,'failed card creation restores only the uncommitted wave receipt');
await useRiptideWave(cancelledWater.card);assert.equal(waveCalls,2);await useRiptideWave(cancelledWater.card);assert.equal(waveCalls,2);
assert.equal(validRiptideWave(earlyWave,{}),false);assert.equal(validRiptideWave({...earlyWave,actor:victim},{spikependium:{riptideShot:cancelledWater.card.uuid}}),false);
console.log('Riptide: paid next-turn queue, no early/unpaid/duplicate wave, saved rule snapshot after weapon deletion, native numeric refund, water-marker cleanup, cancelled dialogs and card-failure retry passed.');
foundry.applications.api.DialogV2.confirm=async()=>false;dnd5e.dice={aggregateDamageRolls:aggregateMedzo};
const nativeMedzo=medzoCard(1),groundEffect={uuid:'Actor.hero.ActiveEffect.ground',active:true,duration:{},flags:{spikependium:{graveGroundWeakness:true}}};owner.effects.push(groundEffect);
const nativeConfig={subject:nativeMedzo.activity,spikependium:{groundDamage:{actor:owner.uuid,first:0}}},nativeMessage={data:{flags:nativeMedzo.flags,system:nativeMedzo.system,type:'damage'}};
const beforeNativeExtra=extraDice;await groundDamage(async(...args)=>medzoDamageEvaluate(async()=>{},...args),nativeMedzo.rolls,nativeConfig,nativeMessage);
assert.equal(extraDice,beforeNativeExtra+1);assert.equal(nativeMedzo.rolls.length,2);assert.equal(nativeMedzo.rolls.reduce((n,r)=>n+r.total,0),0,'the shared six-point penalty sees all four raw damage points before clamping');
await processMedzoDamage(nativeMedzo);assert.equal(extraDice,beforeNativeExtra+1);assert.equal(nativeMedzo.flags.spikependium.medzoTriple.choice,'keep');assert.equal(nativeMedzo.flags.spikependium.medzoTriple.done,true);
owner.effects.splice(owner.effects.indexOf(groundEffect),1);
foundry.applications.api.DialogV2.confirm=async()=>true;const nativeReroll=medzoCard(1),beforeNativeReroll=rerollDice;
await medzoDamageEvaluate(async()=>{},nativeReroll.rolls,{subject:nativeReroll.activity},{data:{flags:nativeReroll.flags,system:nativeReroll.system}});
assert.equal(rerollDice,beforeNativeReroll+1);assert.equal(nativeReroll.rolls[0].total,6);await processMedzoDamage(nativeReroll);assert.equal(nativeReroll.flags.spikependium.medzoTriple.choice,'reroll');assert.equal(nativeReroll.rolls.length,2);
console.log('Native Medzo damage stage: optional choice and one extra d6 precede the shared Grave Ground penalty, preserve its one roll/clamping, and never duplicate when the final chat card is processed.');
owner.testUserPermission=user=>user?.id===game.user.id;const unauthorizedMedzo=medzoCard(2);unauthorizedMedzo.author={id:'unrelated-player'};const beforeUnauthorized=extraDice;await processMedzoDamage(unauthorizedMedzo);assert.equal(extraDice,beforeUnauthorized,'unrelated chat author cannot trigger effects from another character');
