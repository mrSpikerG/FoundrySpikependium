import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prepareStaffHitUse, prepareStaffHitUpdates, recordStaffHitConsumption, paidStaffHit, staffHitDamage, allowStaffHitDamage,
 staffHitDamageParts, staffHitDamagePart, snapshotStaffHit, recordStaffDrainCalculation, guardStaffHitApplication, resumeStaffDrains } from '../scripts/griffon-staff-hits.mjs';
import { prepareFocusUpdates, guardFocusRoll } from '../scripts/griffon-foci.mjs';
import { nativeConsume, nativeRefund, getDeltas } from './data/dnd5e-reaction-native.mjs';
import { nativeUsesConsumption } from './data/dnd5e-monsters-native.mjs';
import { nativeCalculateDamage, nativeApplyDamage } from './data/dnd5e-guardian-native.mjs';
import { nativeAmmoBaseDamagePart } from './data/dnd5e-griffon-weapons-native.mjs';
import { nativeAlchemistDamageRoll } from './data/dnd5e-alchemist-reagents-native.mjs';
import { attackSignature } from '../scripts/attack-source.mjs';
const docs=fs.readdirSync('packs/_source/items').map(f=>JSON.parse(fs.readFileSync(`packs/_source/items/${f}`,'utf8')));
const clone=structuredClone,get=(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o),set=(o,p,v)=>{const ks=p.split('.'),k=ks.pop();ks.reduce((v,k)=>v[k]??={},o)[k]=v;};
const flat=(o,p='',r={})=>{for(const[k,v]of Object.entries(o)){const key=p?`${p}.${k}`:k;if(v&&Object.getPrototypeOf(v)===Object.prototype)flat(v,key,r);else r[key]=v;}return r;};
let serial=0,prompt=true,prompts=0,cancelPay=false,lastDie=2,warnings=0,cancelHP=false;
const world=new Map(),list=values=>Object.assign(values,{get(id){return this.find(v=>v.id===id);}});
const gm={id:'gm',isGM:true,isActiveGM:true};
globalThis.game={user:gm,users:list([gm]),actors:[],scenes:[],messages:list([]),time:{worldTime:100},combat:{id:'combat',started:true,round:1,turn:0}};game.users.activeGM=gm;
globalThis.fromUuidSync=uuid=>world.get(uuid);
globalThis.foundry={utils:{deepClone:clone,getProperty:get,setProperty:set,flattenObject:flat,isEmpty:o=>!Object.keys(o).length,randomID:()=>String(++serial).padStart(16,'0'),
 mergeObject:(a,b,{inplace=true}={})=>Object.assign(inplace?a:clone(a),clone(b))},applications:{api:{DialogV2:{async confirm(){prompts++;return prompt;}}}}};
globalThis.ui={notifications:{warn(){warnings++;}}};
globalThis.CONFIG={DND5E:{damageTypes:{bludgeoning:{},necrotic:{}},healingTypes:{healing:{},temphp:{}}},Dice:{BasicRoll:class{async evaluate(){this.total=lastDie;return this;}toJSON(){return{total:this.total};}},D20Roll:class{constructor(critical=false){this.options={};this._evaluated=true;this.total=critical?20:18;this.isCritical=critical;this.isFumble=false;}toJSON(){return{options:clone(this.options),total:this.total,critical:this.isCritical};}}}};
Number.isNumeric??=n=>typeof n==='number'&&Number.isFinite(n);Math.clamp??=(v,min,max)=>Math.min(max,Math.max(min,v));
globalThis.simplifyBonus=n=>Number(n)||0;
class RollTerm{constructor(){this.options={};}get isDeterministic(){return false;}}
class Die extends RollTerm{constructor(number,faces){super();this.number=number;this.faces=faces;this.modifiers=[];}alter(m,b){this.number=this.number*m+b;}get formula(){return`${this.number}d${this.faces}`;}}
class NumericTerm extends RollTerm{constructor({number}){super();this.number=number;}get formula(){return String(this.number);}}
class OperatorTerm extends RollTerm{constructor({operator}){super();this.operator=operator;}get formula(){return this.operator;}}
class BaseRoll{constructor(formula,data,options){this.options=options;this.data=data;this.terms=formula.split(/\s*\+\s*/).flatMap((p,i)=>{const d=/^(\d+)d(\d+)$/.exec(p),term=d?new Die(+d[1],+d[2]):new NumericTerm({number:+p});return i?[new OperatorTerm({operator:'+'}),term]:[term];});this._evaluated=true;}
 resetFormula(){this.formula=this.terms.map(t=>t.formula).join(' ');}get total(){return this.terms.reduce((n,t)=>n+(t instanceof Die?t.number*3:t instanceof NumericTerm?t.number:0),0);}toJSON(){return{formula:this.formula,total:this.total,options:clone(this.options)};}}
CONFIG.Dice.DamageRoll=nativeAlchemistDamageRoll(BaseRoll,{DiceTerm:Die,NumericTerm,OperatorTerm,ParentheticalTerm:class{},RollTerm,Roll:class{}});
globalThis.Hooks={call(hook,...args){if(hook==='dnd5e.activityConsumption'&&cancelPay)return false;if(hook==='dnd5e.postActivityConsumption')recordStaffHitConsumption(...args);
 if(hook==='dnd5e.calculateDamage')recordStaffDrainCalculation(...args);if(hook==='dnd5e.preApplyDamage')return guardStaffHitApplication(...args);if(hook==='modifyTokenAttribute'&&cancelHP)return false;return true;},callAll(){}};
const update=(o,u)=>{for(const[p,v]of Object.entries(u))if(p!=='_id')set(o,p,clone(v));};
function actor(id){const a={id,uuid:`Actor.${id}`,isOwner:true,flags:{spikependium:{}},items:list([]),classes:{wizard:{system:{levels:5}}},
 system:{isCreature:true,details:{type:{value:'humanoid'}},attributes:{hp:{value:10,max:100,damage:90,temp:0,tempmax:0}},_source:{attributes:{hp:{tempmax:0}}},traits:{}},testUserPermission:u=>u?.id==='gm',getRollData:()=>({}),changeIsIgnored:()=>false};
 a.changeHasEffect=(kind,d)=>kind==='resistance'&&a.resist&&d.type==='necrotic'||kind==='immunity'&&a.immune&&d.type==='necrotic';
 a.calculateDamage=(d,o)=>nativeCalculateDamage.call(a,d,o);a.applyDamage=(d,o)=>nativeApplyDamage.call(a,d,o);
 a.update=async u=>{if(a.fail){a.fail=false;throw Error('failed HP write');}if(a.failReceipt&&Object.keys(u).some(k=>k.endsWith('.pending'))){a.failReceipt=false;throw Error('failed receipt write');}update(a,u);a.system.attributes.hp.damage=a.system.attributes.hp.max-a.system.attributes.hp.value;};
 game.actors.push(a);world.set(a.uuid,a);return a;}
function message(type,activity,data={}){const id=`card${++serial}`,m={id,uuid:`ChatMessage.${id}`,type,activity,author:gm,flags:{},system:{},rolls:[],whisper:[],...data,
 getAssociatedActivity(){return this.activity;},getAssociatedActor(){return this.activity?.actor;},getOriginatingMessage(){return world.get(this.flags.spikependium?.attackSource?.message);}};game.messages.push(m);world.set(m.uuid,m);return m;}
function setup(kind='leeching',critical=false){game.messages.length=0;game.actors.length=0;game.time.worldTime=100;game.combat.round=1;game.combat.turn=0;game.user=gm;prompt=true;cancelPay=false;lastDie=2;cancelHP=false;
 const caster=actor(`caster${++serial}`),target=actor(`target${serial}`),item=clone(docs.find(d=>d.flags?.spikependium?.key===`item:gs1:${kind}`));assert.ok(item,kind);item.id=item._id;item.uuid=`${caster.uuid}.Item.${item.id}`;item.actor=caster;item.getFlag=()=>undefined;
 item.system.uses.max=Number(item.system.uses.max);Object.defineProperty(item.system.uses,'value',{get(){return this.max-this.spent;}});item.system.equipped=item.system.attuned=true;
 const activities=Object.values(item.system.activities).map(a=>({...a,id:a._id,uuid:`${item.uuid}.Activity.${a._id}`,item,actor:caster}));item.system.activities=new Map(activities.map(a=>[a.id,a]));caster.items.push(item);world.set(item.uuid,item);
 const property=activities.find(a=>a.flags?.spikependium?.staffHit===kind);assert.ok(property,'updated property must be a paid utility');const attack=activities.find(a=>a.type==='attack');attack.getActionType=mode=>mode==='ranged'?'rwak':'mwak';
 property._prepareUsageUpdates=async config=>{const u={item:[],actor:{},rolls:[],activity:{},create:[],delete:[]};const used=await nativeUsesConsumption.call({resolveCost:async()=>({total:1})},{},{uses:item.system.uses,type:'staff',rolls:u.rolls,delta:{}});u.item.push({_id:item.id,'system.uses.spent':used.spent});await prepareFocusUpdates(property,config,u);return prepareStaffHitUpdates(property,config,u);};
 property.use=async config=>{const msg={data:{}};if(prepareStaffHitUse(property,config,{},msg)===false)return;const result=await nativeConsume.call(property,config,msg,async u=>{const delta={actor:getDeltas(caster,u.actor),item:Object.fromEntries(u.item.map(x=>[x._id,getDeltas(item,Object.fromEntries(Object.entries(x).filter(([k])=>k!=='_id')))]))};update(caster,u.actor);for(const uitem of u.item)update(item,uitem);return delta;});
  if(result)return{message:message('usage',property,{...msg.data,system:msg.data.system})};};
 const token={uuid:`Scene.test.Token.target${serial}`,actor:target};world.set(token.uuid,token);
 const roll=new CONFIG.Dice.D20Roll(critical);snapshotStaffHit(attack,{options:roll.options});const shot=message('attack',attack,{rolls:[roll],system:{mode:'oneHanded',targets:[{actor:target.uuid,token:token.uuid,ac:15,isMiss:false}]}});
 return{caster,target,item,property,attack,shot,token};}
const saved=shot=>({data:{flags:{spikependium:{attackSource:{message:shot.uuid,signature:attackSignature(shot)}}}}});
function part(data){return {...data,types:Object.assign(new Set(data.types??['bludgeoning']),{first(){return this.values().next().value;}}),clone(d){return part({...this,...d});},scaledFormula(){return this.custom?.enabled?this.custom.formula:`${this.number}d${this.denomination}${this.bonus?' + '+this.bonus:''}`;}};}
async function damage(s,{cancel=false,mixed=false,fail=false}={}){let card;
 const result=await staffHitDamage.call(s.attack,async(config,_dialog,msg)=>{
  const m={...msg,data:{...msg.data,type:'damage'}};const allowed=allowStaffHitDamage({subject:s.attack},m);if(!allowed&&guardFocusRoll({subject:s.attack},{},m)===false)return;
  const parts=staffHitDamageParts.call(s.attack,()=>[part({base:true,number:1,denomination:8,bonus:'3'})],config);
  if(mixed)parts.push(part({base:false,number:1,denomination:4,types:['necrotic']}));
  const rolls=parts.map((p,i)=>{const spec=staffHitDamagePart.call(s.attack,(...args)=>nativeAmmoBaseDamagePart.call(s.attack,...args),p,config,{roll:{properties:config.properties??[]}},i);
   return new CONFIG.Dice.DamageRoll(spec.parts.join(' + '),spec.data,{...spec.options,isCritical:config.isCritical});});
  if(cancel)return;if(fail)throw Error('failed chat write');card=message('damage',s.attack,{...msg.data,rolls});return rolls;
 },{},{},saved(s.shot));return{result,card};}
function amounts(card){const map=new Map();for(const r of card.rolls){const key=r.options.type;map.set(key,(map.get(key)??0)+r.total);}return [...map].map(([type,value])=>({type,value,properties:new Set(['mgc'])}));}
async function apply(s,card){await s.target.applyDamage(amounts(card),{originatingMessage:card});await resumeStaffDrains();}

// Native payment and critical processing add the rider to the same damage card.
let s=setup('leeching',true);s.target.resist=true;const beforePrompts=prompts;
let rolled=await damage(s);assert.equal(prompts,beforePrompts+1);assert.equal(s.item.system.uses.spent,1);assert.equal(rolled.card.rolls.length,2);
assert.deepEqual(rolled.card.rolls.map(r=>r.terms.filter(t=>t instanceof Die).map(t=>[t.number,t.faces])),[[[2,8]],[[2,6]]]);assert.equal(rolled.card.rolls[0].terms.find(t=>t instanceof NumericTerm).number,3);
const nonce=rolled.card.flags.spikependium.staffHit;assert.ok(paidStaffHit(s.caster.flags.spikependium.staffHits[nonce]));
await apply(s,rolled.card);assert.equal(s.caster.system.attributes.hp.value,13,'resistance halves the actual 6 necrotic to 3 healing');assert.equal(s.target.flags.spikependium.staffDrains[nonce].pending,0);
await apply(s,rolled.card);assert.equal(s.caster.system.attributes.hp.value,13,'reapplying a damage card cannot duplicate its healing');
const payCard=game.messages.find(m=>m.type==='usage');await nativeRefund.call(s.property,payCard.system.deltas,async u=>{update(s.caster,u.actor);for(const x of u.item)update(s.item,x);});
assert.equal(s.item.system.uses.spent,0);assert.equal(paidStaffHit(s.caster.flags.spikependium.staffHits[nonce]),undefined);const hp=s.target.system.attributes.hp.value;await s.target.applyDamage(amounts(rolled.card),{originatingMessage:rolled.card});assert.equal(s.target.system.attributes.hp.value,hp,'refunded rider damage is rejected');

// Misses, ineligible types, missing attunement and stale source attacks never offer payment.
for(const type of ['undead','construct']){s=setup();s.target.system.details.type.value=type;assert.equal(prepareStaffHitUse(s.property,{}, {},{}),false);}
s=setup();s.target.system.details.type.value='plant';assert.notEqual(prepareStaffHitUse(s.property,{}, {},{}),false);
s=setup();s.shot.rolls[0].total=2;assert.equal(prepareStaffHitUse(s.property,{}, {},{}),false);
s=setup();s.item.system.attuned=false;assert.equal(prepareStaffHitUse(s.property,{}, {},{}),false);
s=setup();game.combat.turn=1;assert.equal(prepareStaffHitUse(s.property,{}, {},{}),false);
s=setup();message('attack',s.attack,{rolls:[new CONFIG.Dice.D20Roll()],system:{targets:[]}});assert.equal(prepareStaffHitUse(s.property,{spikependium:{staffHit:s.shot.uuid}}, {},{}),false);
s=setup();s.shot.author={id:'stranger'};assert.equal(prepareStaffHitUse(s.property,{}, {},{}),false);
s=setup();s.item.system.uses.spent=6;assert.equal(prepareStaffHitUse(s.property,{}, {},{}),false);
s=setup();s.shot.system.targets.push(clone(s.shot.system.targets[0]));assert.equal(prepareStaffHitUse(s.property,{}, {},{}),false);
s=setup('shaeden');s.shot.system.mode='ranged';assert.equal(prepareStaffHitUse(s.property,{}, {},{}),false);
s=setup('shaeden');s.caster.classes={};assert.equal(prepareStaffHitUse(s.property,{}, {},{}),false);
s=setup();s.caster.isOwner=false;assert.equal((await damage(s)).card,undefined);
s=setup();s.shot.whisper=['gm'];s.shot.blind=true;rolled=await damage(s);assert.deepEqual(rolled.card.whisper,['gm']);assert.equal(rolled.card.blind,true);assert.deepEqual(game.messages.find(m=>m.type==='usage').whisper,['gm']);assert.equal(prepareStaffHitUse(s.property,{}, {},{}),false,'one hit cannot buy a second active enhancement');

// Cancellation has no hidden extra roll or charge, and paid damage retries reuse the original payment.
s=setup();prompt=false;rolled=await damage(s);assert.equal(s.item.system.uses.spent,0);assert.equal(rolled.card.rolls.length,1);
s=setup();cancelPay=true;rolled=await damage(s);assert.equal(s.item.system.uses.spent,0);assert.equal(s.caster.flags.spikependium.staffHits,undefined);assert.equal(rolled.card,undefined);
s=setup();await damage(s,{cancel:true});assert.equal(s.item.system.uses.spent,1);const count=prompts;rolled=await damage(s);assert.equal(prompts,count);assert.equal(s.item.system.uses.spent,1);assert.equal(rolled.card.rolls.length,2);
s=setup();await assert.rejects(()=>damage(s,{fail:true}));rolled=await damage(s);assert.equal(s.item.system.uses.spent,1);assert.equal(rolled.card.rolls.length,2);

// One native calculation applies a shared ALL reduction before the remaining necrotic healing is recorded.
s=setup();s.target.system.traits.dm={amount:{ALL:'-4'}};rolled=await damage(s);await apply(s,rolled.card);assert.equal(s.caster.system.attributes.hp.value,13);assert.equal(s.target.system.attributes.hp.value,5);
s=setup();s.target.immune=true;rolled=await damage(s);await apply(s,rolled.card);assert.equal(s.caster.system.attributes.hp.value,10);assert.equal(s.target.flags.spikependium.staffDrains,undefined);
s=setup();s.target.system.attributes.hp.dt=100;rolled=await damage(s);await apply(s,rolled.card);assert.equal(s.caster.system.attributes.hp.value,10);
s=setup();rolled=await damage(s);cancelHP=true;await apply(s,rolled.card);assert.equal(s.target.flags.spikependium.staffDrains,undefined);assert.equal(s.caster.system.attributes.hp.value,10);cancelHP=false;
s=setup();rolled=await damage(s,{mixed:true});const beforeWarnings=warnings;await apply(s,rolled.card);assert.equal(s.caster.system.attributes.hp.value,10);assert.ok(warnings>beforeWarnings,'ambiguous mixed necrotic healing is explicit');

// Atomic healing receipt survives failed HP writes and a later failed queue acknowledgement.
s=setup();rolled=await damage(s);s.target.fail=true;await assert.rejects(()=>apply(s,rolled.card));assert.equal(s.target.flags.spikependium.staffDrains,undefined);assert.equal(s.caster.system.attributes.hp.value,10);
await s.target.applyDamage(amounts(rolled.card),{originatingMessage:rolled.card});s.caster.fail=true;await assert.rejects(()=>resumeStaffDrains());assert.equal(s.caster.system.attributes.hp.value,10);await resumeStaffDrains();assert.equal(s.caster.system.attributes.hp.value,13);
s=setup();rolled=await damage(s);await s.target.applyDamage(amounts(rolled.card),{originatingMessage:rolled.card});s.target.failReceipt=true;await assert.rejects(()=>resumeStaffDrains());assert.equal(s.caster.system.attributes.hp.value,13);await resumeStaffDrains();assert.equal(s.caster.system.attributes.hp.value,13);

// Destruction by Shaedenstaff's last charge preserves this paid hit, never a fresh weapon attack.
s=setup('shaeden',true);s.item.system.uses.spent=14;lastDie=1;rolled=await damage(s);assert.equal(s.item.system.quantity,0);assert.equal(s.item.flags.spikependium.focusRuin,1);assert.equal(rolled.card.rolls[1].terms.find(t=>t instanceof Die).number,2);assert.equal(rolled.card.rolls[1].terms.find(t=>t instanceof Die).faces,10);
assert.equal(guardFocusRoll({subject:s.attack},{},{}),false);assert.equal(allowStaffHitDamage({subject:s.attack},{data:{type:'damage',flags:{spikependium:{staffHit:rolled.card.flags.spikependium.staffHit}}}}),false,'exception ends with the paid damage call');
await apply(s,rolled.card);assert.equal(s.caster.system.attributes.hp.value,10,'Shaedenstaff never heals');s.shot.rolls[0].total=3;const oldHp=s.target.system.attributes.hp.value;await s.target.applyDamage(amounts(rolled.card),{originatingMessage:rolled.card});assert.equal(s.target.system.attributes.hp.value,oldHp,'changed original attack invalidates the rider');
console.log('Staff hits: native paid single-target hit provenance, typed combined damage and real criticals, last-charge destruction, native refund/cancel/retry, ineligible/stale/forged source guards, actual resistance/immunity/threshold healing, atomic HP receipts and failed-write recovery passed.');
