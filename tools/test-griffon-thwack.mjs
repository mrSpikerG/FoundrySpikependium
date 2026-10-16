import assert from 'node:assert/strict';
import fs from 'node:fs';
import { thwackUse, prepareThwackUse, prepareThwackUpdates, recordThwackConsumption, thwackApplyDamage, markThwackDamage, thwackTarget,
 thwackCounterAttack, thwackCounterDamage, thwackDamagePart, guardThwackCounterDamage, refreshThwack } from '../scripts/griffon-thwack.mjs';
import { guardianTarget, attackSignature, attackSource } from '../scripts/attack-source.mjs';
import { reactionAvailable, prepareReactionUpdates, recordReactionConsumption } from '../scripts/reactions.mjs';
import { prepareFocusUpdates } from '../scripts/griffon-foci.mjs';
import { nativeConsume, nativeRefund, getDeltas } from './data/dnd5e-reaction-native.mjs';
import { nativeUsesConsumption } from './data/dnd5e-monsters-native.mjs';
import { nativeApplyDamage, nativeCalculateDamage } from './data/dnd5e-guardian-native.mjs';
import { nativeThwackMessageConfig } from './data/dnd5e-thwack-native.mjs';
import { nativeAmmoBaseDamagePart } from './data/dnd5e-griffon-weapons-native.mjs';
import { nativeAlchemistDamageRoll } from './data/dnd5e-alchemist-reagents-native.mjs';
const source=JSON.parse(fs.readFileSync(fs.readdirSync('packs/_source/items').map(f=>`packs/_source/items/${f}`).find(f=>f.includes('item-gs1-thwack_')),'utf8'));
const clone=structuredClone,get=(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o),set=(o,p,v)=>{const ks=p.split('.'),key=ks.pop(),parent=ks.reduce((v,k)=>v[k]??={},o);if(key.startsWith('-='))delete parent[key.slice(2)];else parent[key]=clone(v);};
const apply=(o,u)=>{for(const[p,v]of Object.entries(u))if(p!=='_id')set(o,p,v);};
const flat=(o,p='',out={})=>{for(const[k,v]of Object.entries(o)){const key=p?`${p}.${k}`:k;if(v&&Object.getPrototypeOf(v)===Object.prototype)flat(v,key,out);else out[key]=v;}return out;};
const list=a=>Object.assign(a,{get(id){return this.find(v=>v.id===id);},has(id){return !!this.get(id);}});
const world=new Map(),gm={id:'gm',isGM:true,isActiveGM:true};let serial=0,die=4,diceRolled=0,answers=[],cancelPayment=false,counterCancel=false,counterCritical=false,refreshes=0,warnings=0;
globalThis.game={user:gm,users:list([gm]),actors:[],scenes:[],messages:list([]),time:{worldTime:100},combats:[]};game.users.activeGM=gm;
globalThis.fromUuidSync=uuid=>world.get(uuid);
globalThis.foundry={utils:{getProperty:get,setProperty:set,deepClone:clone,flattenObject:flat,isEmpty:o=>!Object.keys(o).length,randomID:()=>String(++serial).padStart(16,'0'),mergeObject:(a,b,{inplace=true}={})=>Object.assign(inplace?a:clone(a),clone(b))},applications:{api:{DialogV2:{async confirm(){return answers.length?answers.shift():false;}}}}};
globalThis.ui={notifications:{warn(){warnings++;}},chat:{async updateMessage(){refreshes++;}}};
globalThis.canvas={ready:false};globalThis.ActiveEffect={implementation:{getEffectStart:()=>({time:game.time.worldTime})}};
globalThis.dnd5e={utils:{convertLength:(v,unit)=>unit==='m'?v/0.3048:v},dataModels:{chatMessage:{fields:{TargetsField:{getDescriptors:tokens=>tokens.map(t=>({actor:t.actor.uuid,token:t.uuid,ac:t.actor.system.attributes.ac.value}))}}}}};
class BasicRoll{constructor(formula,data={},options={}){this.formula=formula;this.data=data;this.options=options;}async evaluate(){assert.equal(this.formula,'1d6');diceRolled++;this.total=die;this._evaluated=true;return this;}toJSON(){return{formula:this.formula,total:this.total,options:clone(this.options)};}}
class D20{constructor(total=16,critical=false){this.total=total;this.isCritical=critical;this.isFumble=false;this._evaluated=true;this.options={};}toJSON(){return{total:this.total,critical:this.isCritical,options:clone(this.options)};}}
globalThis.CONFIG={DND5E:{healingTypes:{healing:{},temphp:{}},damageTypes:{bludgeoning:{},fire:{}}},Dice:{BasicRoll,D20Roll:D20}};
globalThis.simplifyBonus=n=>Number(n)||0;Number.isNumeric??=n=>typeof n==='number'&&Number.isFinite(n);Math.clamp??=(v,min,max)=>Math.min(max,Math.max(min,v));
class Term{constructor(){this.options={};}get isDeterministic(){return false;}}
class Die extends Term{constructor(number,faces){super();this.number=number;this.faces=faces;this.modifiers=[];}alter(m,b){this.number=this.number*m+b;}get formula(){return`${this.number}d${this.faces}`;}}
class Numeric extends Term{constructor({number}){super();this.number=number;}get formula(){return String(this.number);}}
class Operator extends Term{constructor({operator}){super();this.operator=operator;}get formula(){return this.operator;}}
class BaseRoll{constructor(formula,data,options){this.options=options;this.data=data;this._evaluated=true;this.terms=formula.split(/\s*\+\s*/).flatMap((p,i)=>{const d=/^(\d+)d(\d+)$/.exec(p),term=d?new Die(+d[1],+d[2]):new Numeric({number:+p});return i?[new Operator({operator:'+'}),term]:[term];});}resetFormula(){this.formula=this.terms.map(t=>t.formula).join(' ');}get total(){return this.terms.reduce((n,t)=>n+(t instanceof Die?t.number*3:t instanceof Numeric?t.number:0),0);}toJSON(){return{formula:this.formula,total:this.total,options:clone(this.options)};}}
CONFIG.Dice.DamageRoll=nativeAlchemistDamageRoll(BaseRoll,{DiceTerm:Die,NumericTerm:Numeric,OperatorTerm:Operator,ParentheticalTerm:class{},RollTerm:Term,Roll:class{}});
globalThis.Hooks={call(name,...args){if(name==='dnd5e.activityConsumption'&&cancelPayment)return false;if(name==='dnd5e.postActivityConsumption'){recordReactionConsumption(...args);recordThwackConsumption(...args);}if(name==='dnd5e.preApplyDamage'){if(markThwackDamage(...args)===false)return false;return guardThwackCounterDamage(...args);}return true;},callAll(){}};
function actor(id,ac){const a={id,uuid:`Actor.${id}`,documentName:'Actor',isOwner:true,flags:{spikependium:{}},effects:list([]),statuses:new Set(),items:list([]),testUserPermission:u=>u?.id==='gm',getRollData:()=>({}),changeIsIgnored:()=>false,
 system:{isCreature:true,attributes:{ac:{value:ac},hp:{value:30,max:30,temp:0,tempmax:0,damage:0}},_source:{attributes:{hp:{tempmax:0}}},traits:{}}};
 a.changeHasEffect=(kind,d)=>kind==='resistance'&&a.resist&&d.type==='bludgeoning';a.calculateDamage=(d,o)=>nativeCalculateDamage.call(a,d,o);a.applyDamage=(d,o)=>thwackApplyDamage.call(a,(...args)=>nativeApplyDamage.call(a,...args),d,o);
 a.update=async u=>{if(a.fail){a.fail=false;throw Error('failed HP write');}apply(a,u);a.system.attributes.hp.damage=30-a.system.attributes.hp.value;};game.actors.push(a);world.set(a.uuid,a);return a;}
function message(type,activity,data={}){const id=`card${++serial}`,m={id,uuid:`ChatMessage.${id}`,type,activity,author:gm,flags:{},system:{},rolls:[],whisper:[],...data,
 getAssociatedActivity(){return this.activity;},getAssociatedActor(){return this.activity?.actor;},getAssociatedToken(){return this.activity?.actor.token;},getOriginatingMessage(){return game.messages.get(this.system.origin)??world.get(this.system.origin);},
 getAssociatedRolls(kind){return game.messages.filter(m=>m.type===kind&&m.system.origin===this.id);}};
 if(type==='attack'){m.flags.spikependium??={};m.flags.spikependium.guardianAttack={time:game.time.worldTime,turn:`combat:1:0`};}
 game.messages.push(m);world.set(m.uuid,m);return m;}
async function activate(activity,config,dialog,messageConfig={data:{}}){messageConfig.data??={};if(prepareThwackUse(activity,config,dialog,messageConfig)===false)return;
 const result=await nativeConsume.call(activity,config,messageConfig,async u=>{const delta={actor:getDeltas(activity.actor,u.actor),item:Object.fromEntries(u.item.map(x=>[x._id,getDeltas(activity.actor.items.get(x._id),Object.fromEntries(Object.entries(x).filter(([k])=>k!=='_id')))]))};apply(activity.actor,u.actor);for(const x of u.item)apply(activity.actor.items.get(x._id),x);return delta;});
 if(!result)return;nativeThwackMessageConfig.call(activity,config,messageConfig,{updates:result});return{message:message('usage',activity,messageConfig.data),updates:result};}
function setup(total=16,critical=false){game.messages.length=0;game.actors.length=0;game.time.worldTime=100;die=4;answers=[];cancelPayment=false;counterCancel=false;counterCritical=false;
 const defender=actor(`defender${++serial}`,14),attacker=actor(`attacker${serial}`,12),scene={id:'test',grid:{units:'ft',measurePath:([a,b])=>({distance:Math.hypot(b.x-a.x,b.y-a.y)})}};
 const token=(id,a,x)=>({id,uuid:`Scene.test.Token.${id}`,actor:a,parent:scene,x,y:0,elevation:0,getOccupiedGridSpaceOffsets:()=>[],getCenterPoint(){return{x:this.x,y:0,elevation:0};}});
 defender.token=token(`defender${serial}`,defender,0);attacker.token=token(`attacker${serial}`,attacker,5);world.set(defender.token.uuid,defender.token);world.set(attacker.token.uuid,attacker.token);
 game.combat={id:'combat',uuid:'Combat.combat',started:true,round:1,turn:0,turns:[{actor:attacker},{actor:defender}],getCombatantsByActor:a=>[{actor:a}]};game.combats=[game.combat];world.set(game.combat.uuid,game.combat);
 const item=clone(source);item.id=item._id;item.uuid=`${defender.uuid}.Item.${item.id}`;item.actor=defender;item.getFlag=()=>undefined;item.system.equipped=item.system.attuned=true;item.system.uses.max=3;
 Object.defineProperty(item.system.uses,'value',{get(){return this.max-this.spent;}});defender.items.push(item);world.set(item.uuid,item);
 const activities=Object.values(item.system.activities).map(a=>({...a,id:a._id,uuid:`${item.uuid}.Activity.${a._id}`,actor:defender,item,metadata:{usage:{applyEffectsInChat:false}}}));item.system.activities=new Map(activities.map(a=>[a.id,a]));
 for(const a of activities){a._prepareUsageUpdates=async config=>{const u={actor:{},item:[],activity:{},rolls:[],create:[],delete:[]};
  if(a.consumption.targets.length){const cost=await nativeUsesConsumption.call({resolveCost:async()=>({total:1})},{},{uses:item.system.uses,type:'staff',rolls:u.rolls,delta:{}});u.item.push({_id:item.id,'system.uses.spent':cost.spent});}
  let next=prepareReactionUpdates(a,config,u);if(next)next=await prepareFocusUpdates(a,config,next);if(next)next=await prepareThwackUpdates(a,config,next);return next;};
  a.use=(config={})=>thwackUse.call(a,(c,d,m)=>activate(a,c,d,m),config);world.set(a.uuid,a);}
 const parry=activities.find(a=>a.flags?.spikependium?.staffParry),counter=activities.find(a=>a.flags?.spikependium?.staffCounter);assert.ok(parry);assert.ok(counter);
 counter.getActionType=()=> 'mwak';counter.rollAttack=(config={},dialog={},msg={})=>thwackCounterAttack.call(counter,async(c,_d,m)=>{if(counterCancel)return;assert.equal(c.target,12);assert.equal(m.data.system.targets[0].token,attacker.token.uuid);const roll=new D20(18,counterCritical);const shot=message('attack',counter,{...m.data,rolls:[roll]});roll.parent=shot;return[roll];},config,dialog,msg);
 const attackActivity={id:'incoming',uuid:`${attacker.uuid}.Item.weapon.Activity.incoming`,actor:attacker,item:{uuid:`${attacker.uuid}.Item.weapon`},type:'attack',getActionType:()=> 'mwak'};
 const attack=message('attack',attackActivity,{rolls:[new D20(total,critical)],system:{mode:'oneHanded',targets:[{actor:defender.uuid,token:defender.token.uuid,ac:14,isMiss:false}]}});
 const damage=message('damage',attackActivity,{flags:{spikependium:{attackSource:{message:attack.uuid,signature:attackSignature(attack)}}},system:{origin:attack.id,isHealing:false}});
 return{defender,attacker,item,parry,counter,attack,damage};}
const pay=s=>s.parry.use({spikependium:{staffParry:s.attack.uuid,staffParryVisible:true}});
const raw=s=>({...s.attack.system.targets[0],isMiss:false});
async function refund(s,usage){await nativeRefund.call(usage.getAssociatedActivity(),usage.system.deltas,async u=>{apply(s.defender,u.actor);for(const x of u.item)apply(s.defender.items.get(x._id),x);});}
const incoming=s=>s.defender.applyDamage([{type:'bludgeoning',value:10}],{originatingMessage:s.damage});
function part(){return{base:true,types:Object.assign(new Set(['bludgeoning']),{first(){return this.values().next().value;}}),scaledFormula:()=> '1d6 + 3'};}
async function counterDamage(s,shot){const messageConfig={data:{flags:{spikependium:{attackSource:{message:shot.uuid,signature:attackSignature(shot)}}},system:{origin:shot.id}}};
 return thwackCounterDamage.call(s.counter,async(config,_dialog,msg)=>{const spec=thwackDamagePart.call(s.counter,(...args)=>nativeAmmoBaseDamagePart.call(s.counter,...args),part(),config,{roll:{properties:['mgc']}},0);
  const roll=new CONFIG.Dice.DamageRoll(spec.parts.join(' + '),spec.data,{...spec.options,isCritical:config.isCritical});return message('damage',s.counter,{...msg.data,rolls:[roll]});},{},{},messageConfig);}

let s=setup();const ac=s.defender.system.attributes.ac.value,beforeDice=diceRolled;let used=await pay(s),r=used.message;
assert.equal(diceRolled,beforeDice+1);assert.equal(r.rolls.length,1);assert.equal(r.rolls[0].total,4);assert.equal(s.item.system.uses.spent,1);assert.equal(reactionAvailable(s.defender),false);
let target=guardianTarget(s.attack,raw(s));assert.equal(target.ac,18);assert.equal(target.isMiss,true);assert.equal(s.defender.system.attributes.ac.value,ac);assert.equal(guardianTarget(s.attack,target).ac,18,'the per-target bonus is idempotent');
assert.equal(guardianTarget(s.attack,{...target}).ac,18,'native target copies retain the applied bonus marker');
await incoming(s);assert.equal(s.defender.system.attributes.hp.value,30);assert.equal(await pay(s),undefined);assert.equal(game.messages.filter(m=>m.type==='attack'&&m.activity===s.counter).length,0,'declining the counterattack creates no free roll');
await refund(s,r);assert.equal(s.item.system.uses.spent,0);assert.equal(reactionAvailable(s.defender),true);assert.equal(guardianTarget(s.attack,raw(s)).ac,14);assert.equal(guardianTarget(s.attack,raw(s)).isMiss,false);

s=setup();answers=[true];const diceBeforeCounter=diceRolled;used=await pay(s);const counterShot=game.messages.find(m=>m.type==='attack'&&m.activity===s.counter);assert.ok(counterShot);assert.equal(diceRolled,diceBeforeCounter+1,'the counterattack never rerolls the parry die');assert.equal(s.item.system.uses.spent,1);assert.equal(Object.values(s.defender.flags.spikependium.reactionCasts).length,1,'the counterattack spends no second reaction');
let counterCard=await counterDamage(s,counterShot);assert.equal(counterCard.rolls[0].total,10);assert.equal(counterCard.rolls[0].terms.filter(t=>t instanceof Die).length,1);assert.equal(counterCard.rolls[0].terms.filter(t=>t instanceof Numeric).at(-1).number,4);
await s.attacker.applyDamage([{type:'bludgeoning',value:counterCard.rolls[0].total}],{originatingMessage:counterCard});assert.equal(s.attacker.system.attributes.hp.value,20);
assert.equal(await s.counter.use(),undefined,'a paid parry grants only one counterattack activation');
const counterUsage=game.messages.find(m=>m.type==='usage'&&m.activity===s.counter);await refund(s,counterUsage);assert.equal(guardThwackCounterDamage(s.attacker,10,{}, {originatingMessage:counterCard}),false);assert.equal(guardianTarget(s.attack,raw(s)).isMiss,true,'counter refund preserves the parry');

s=setup();die=3;counterCritical=true;answers=[true];await pay(s);counterCard=await counterDamage(s,game.messages.find(m=>m.type==='attack'&&m.activity===s.counter));assert.equal(counterCard.rolls[0].terms.find(t=>t instanceof Die).number,2);assert.deepEqual(counterCard.rolls[0].terms.filter(t=>t instanceof Numeric).map(t=>t.number),[3,3],'critical doubles weapon dice but keeps the saved flat value');s.attacker.resist=true;
await s.attacker.applyDamage([{type:'bludgeoning',value:counterCard.rolls[0].total}],{originatingMessage:counterCard});assert.equal(s.attacker.system.attributes.hp.value,24,'one native resistance applies to the combined counter damage');

s=setup();answers=[true];counterCancel=true;used=await pay(s);assert.equal(game.messages.filter(m=>m.type==='usage'&&m.activity===s.counter).length,1);assert.equal(game.messages.filter(m=>m.type==='attack'&&m.activity===s.counter).length,0);counterCancel=false;
const retryUsage=game.messages.find(m=>m.type==='usage'&&m.activity===s.counter);await s.counter.rollAttack({}, {}, {data:{system:{origin:retryUsage.id}}});assert.equal(s.item.system.uses.spent,1);assert.equal(game.messages.filter(m=>m.type==='attack'&&m.activity===s.counter).length,1);
s=setup();die=1;await pay(s);assert.equal(guardianTarget(s.attack,raw(s)).isMiss,false);await incoming(s);assert.equal(s.defender.system.attributes.hp.value,20);assert.equal(await s.counter.use(),undefined);
s=setup(20,true);die=6;await pay(s);assert.equal(guardianTarget(s.attack,raw(s)).isMiss,false);assert.equal(await s.counter.use(),undefined,'an automatic critical hit is not cancelled by AC');await incoming(s);assert.equal(s.defender.system.attributes.hp.value,20);
s=setup();s.attacker.token.x=10;answers=[true];await pay(s);assert.equal(game.messages.filter(m=>m.activity===s.counter).length,0,'no counterattack against an attacker beyond staff reach');

// Failure/cancellation and source provenance never manufacture an AC bonus or free attack.
s=setup();cancelPayment=true;const cancelledDice=diceRolled;assert.equal(await pay(s),undefined);assert.equal(s.item.system.uses.spent,0);assert.equal(s.defender.flags.spikependium.thwackParries,undefined);assert.equal(guardianTarget(s.attack,raw(s)).ac,14);
for(const modify of [s=>{s.item.system.attuned=false;},s=>{s.item.system.equipped=false;},s=>{s.attack.activity.getActionType=()=> 'rwak';},s=>{s.attack.rolls[0].total=1;},s=>{game.time.worldTime++;},s=>{s.attack.author={id:'other'};},s=>{s.attack.system.targets[0].ac=null;},s=>{s.attack.system.targets.push(clone(s.attack.system.targets[0]));},s=>{s.defender.statuses.add('incapacitated');}]){
 s=setup();modify(s);assert.equal(await pay(s),undefined);assert.equal(s.item.system.uses.spent,0);
}
s=setup();answers=[false];assert.equal(await s.parry.use({}),undefined);assert.equal(s.item.system.uses.spent,0);
s=setup();message('attack',{...s.counter,actor:s.defender},{rolls:[new D20(18)],system:{targets:[{actor:s.attacker.uuid,token:s.attacker.token.uuid,ac:12}]}});assert.equal(await pay(s),undefined,'taking an attack closes the earlier defensive reaction window');
s=setup();answers=[false];await incoming(s);assert.equal(s.defender.system.attributes.hp.value,20);assert.equal(await pay(s),undefined,'resolved damage closes the automatic parry window');
s=setup();answers=[false];s.defender.fail=true;await assert.rejects(()=>incoming(s));assert.equal(s.defender.flags.spikependium.thwackDamage,undefined);used=await pay(s);assert.ok(used.message,'a failed HP update has not resolved the hit');
s=setup();answers=[true,false];await incoming(s);assert.equal(s.defender.system.attributes.hp.value,30);assert.equal(s.item.system.uses.spent,1,'damage application offers and waits for parry');
s=setup();used=await pay(s);s.attack.rolls[0].total=17;assert.equal(guardianTarget(s.attack,raw(s)).ac,14,'changed source dice invalidate the saved defense');
s=setup();used=await pay(s);used.message.rolls[0].total=5;assert.equal(guardianTarget(s.attack,raw(s)).ac,14,'editing the saved d6 cannot change its paid value');
s=setup();used=await pay(s);const changed=used.message.system.deltas.item[s.item.id];used.message.system.deltas.item[s.item.id]=[];assert.equal(guardianTarget(s.attack,raw(s)).ac,14);used.message.system.deltas.item[s.item.id]=changed;
const refreshBefore=refreshes;await refreshThwack(s.defender,{'flags.spikependium.thwackParries':{}});assert.equal(refreshes,refreshBefore+1);await refreshThwack(s.defender,{'system.attributes.hp.value':20});assert.equal(refreshes,refreshBefore+1,'ordinary HP updates do not repaint old defenses');
assert.ok(Object.values(source.system.activities).some(a=>a.flags?.spikependium?.staffParryManual&&a.roll.formula==='1d6'));
console.log('Thwackstaff: native embedded single d6 and reaction/charge refunds, per-attack AC without actor mutation, hit-to-miss damage prevention, same-reaction targeted counterattack and saved flat critical/resistance damage, cancellation/retry, reach/critical/stale/resolved-source guards and manual fallback passed.');
