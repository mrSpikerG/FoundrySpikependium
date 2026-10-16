import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prepareAlchemistReagentDialog, prepareAlchemistReagentUpdates } from '../scripts/alchemist-reagents.mjs';
import { prepareAlchemistBombUpdates, recordAlchemistBomb, paidAlchemistBomb, prepareAlchemistReagentDamage,
  alchemistBlastShieldDamage, alchemistBlastShieldSuccess, validateAlchemistSplashTargets, restoreAlchemistSplash, guardAlchemistBombRoll } from '../scripts/alchemist-bombs.mjs';
import { nativeConsume, nativeRefund, getDeltas } from './data/dnd5e-reaction-native.mjs';
import { nativeUsageUpdates, nativeUsesConsumption, nativeSaveForceSuccess } from './data/dnd5e-monsters-native.mjs';
import { nativeCalculateDamage } from './data/dnd5e-guardian-native.mjs';
import { nativeAlchemistDamageRoll } from './data/dnd5e-alchemist-reagents-native.mjs';
const docs=fs.readdirSync('packs/_source/classes').map(f=>JSON.parse(fs.readFileSync(`packs/_source/classes/${f}`,'utf8')));
const read=key=>docs.find(d=>d.flags?.spikependium?.key===key), clone=structuredClone;
const get=(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o);
const set=(o,p,v)=>{const keys=p.split('.'),last=keys.pop();keys.reduce((v,k)=>v[k]??={},o)[last]=v;};
const flat=(o,p='',result={})=>{for(const[k,v]of Object.entries(o)){const name=p?`${p}.${k}`:k;if(v&&Object.getPrototypeOf(v)===Object.prototype)flat(v,name,result);else result[name]=v;}return result;};
let serial=0,cancel=false;
globalThis.foundry={utils:{getProperty:get,setProperty:set,flattenObject:flat,deepClone:clone,randomID:()=>String(++serial).padStart(16,'0'),isEmpty:o=>!Object.keys(o).length,
  mergeObject:(target,source,{inplace=true}={})=>Object.assign(inplace?target:clone(target),clone(source))},data:{fields:{NumberField:class{constructor(options){Object.assign(this,options);}}}}};
globalThis.game={combats:[],messages:new Map(),scenes:[],users:[],time:{worldTime:0}};
globalThis.ui={notifications:{warn(){}}};
globalThis.CONFIG={DND5E:{activityActivationTypes:{action:{}},damageTypes:{fire:{},poison:{},force:{}},healingTypes:{healing:{},temphp:{}}},Dice:{}};
globalThis.Hooks={call(name,...args){if(name==='dnd5e.postActivityConsumption')return recordAlchemistBomb(...args);if(name==='dnd5e.activityConsumption'){if(cancel)return false;return validateAlchemistSplashTargets(...args);}},callAll(){}};
const resources=['alchemist:bombs','alchemist:reagents'].map(key=>{const d=clone(read(key));d.id=d._id;d.system.uses.max=20;Object.defineProperty(d.system.uses,'value',{get(){return this.max-this.spent;}});return d;});
const[bombs,reagents]=resources;
const shield=read('alchemist:blast-shield');assert.ok(shield.effects.some(e=>e.flags.spikependium?.alchemistBlastShield));
const actor={uuid:'Actor.alchemist',isOwner:true,classes:{alchemist:{system:{levels:17}}},flags:{spikependium:{}},system:{attributes:{prof:6},traits:{}},
  items:Object.assign([...resources,shield],{get(id){return this.find(i=>i.id===id||i._id===id);}}),effects:shield.effects.map(e=>({...clone(e),active:true})),
  testUserPermission:author=>author?.allowed!==false,getRollData:()=>({}),changeHasEffect:()=>false,changeIsIgnored:()=>false};
function activity(key='alchemist:bombs',charged=true){
  const item=key==='alchemist:bombs'?bombs:{...clone(read(key)),id:read(key)._id};
  const d=Object.values(item.system.activities).find(a=>a.flags?.spikependium?.alchemistBomb?.charged===charged&&a.type==='attack');
  const a={...clone(d),id:d._id,actor,item};a.uuid=`${actor.uuid}.Item.${item.id}.Activity.${a.id}`;
  a.consumption.targets=[{hasZeroCost:()=>false,async consume(config,updates){const result=await nativeUsesConsumption.call({resolveCost:async()=>({total:1})},config,{uses:bombs.system.uses,type:'bomb',rolls:updates.rolls,delta:{}});updates.item.push({_id:bombs.id,'system.uses.spent':result.spent});}}];
  a._prepareUsageUpdates=async config=>{const updates=await nativeUsageUpdates.call(a,config);return updates&&prepareAlchemistBombUpdates(a,config,updates);};
  return a;
}
const charged=activity(),normal=activity('alchemist:bombs',false),formula=activity('alchemist:formula:stink');
const config={consume:{resources:true},scaling:0,spikependium:{bombReagents:3}};
async function apply(updates){for(const[p,v]of Object.entries(updates.actor))set(actor,p,v);for(const update of updates.item??[])for(const[p,v]of Object.entries(flat(update)))if(p!=='_id')set(actor.items.get(update._id),p,v);}
async function pay(a,c=config,targets){const message={data:{system:targets?{targets}:{}}};const result=await nativeConsume.call(a,c,message,async updates=>{const deltas={actor:getDeltas(actor,updates.actor),item:{}};for(const u of updates.item){const{_id,...changes}=u;deltas.item[_id]=getDeltas(actor.items.get(_id),changes);}await apply(updates);return deltas;});return{result,message};}
function usage(a,paid){const m={id:`usage${++serial}`,uuid:`ChatMessage.usage${serial}`,type:'usage',author:{},flags:paid.message.data.flags,system:paid.message.data.system,getAssociatedActivity:()=>a};m.getOriginatingMessage=()=>m;game.messages.set(m.id,m);return m;}
for(const n of [-1,1.5,7,'1.1','NaN',Infinity,{},true]){
  const before=[bombs.system.uses.spent,reagents.system.uses.spent];
  const p=await pay(charged,{...config,spikependium:{bombReagents:n}});assert.equal(p.result,false,`invalid count ${n}`);assert.deepEqual([bombs.system.uses.spent,reagents.system.uses.spent],before);
}
assert.equal((await pay(normal)).result,false,'ordinary bombs cannot spend reagent dice');
actor.classes.alchemist.system.levels=2;assert.equal((await pay(charged)).result,false,'class level rather than character level gates reagents');actor.classes.alchemist.system.levels=17;
actor.isOwner=false;assert.equal((await pay(charged)).result,false);actor.isOwner=true;
reagents.system.uses.spent=19;assert.equal((await pay(charged)).result,false,'all resources remain unchanged if too few reagents remain');reagents.system.uses.spent=0;
cancel=true;assert.equal((await pay(charged)).result,false);assert.equal(bombs.system.uses.spent,0);assert.equal(reagents.system.uses.spent,0);cancel=false;
const initialCombat={id:'combat',started:true,round:1,turn:0,getCombatantsByActor:()=>[{}]};game.combats=[initialCombat];game.combat=initialCombat;
const payment=await pay(formula),card=usage(formula,payment);assert.ok(payment.result);assert.equal(bombs.system.uses.spent,1);assert.equal(reagents.system.uses.spent,3);
assert.equal(card.system.deltas.item[reagents.id][0].delta,3);assert.equal(paidAlchemistBomb(formula,card).reagents.count,3);
const rollConfig={subject:formula,rolls:[{parts:['2d8','3'],options:{type:'poison'}}]};
const rollMessage={data:{system:{origin:card.id}}};prepareAlchemistReagentDamage(rollConfig,{},rollMessage);
assert.deepEqual(rollConfig.rolls[0].parts,['2d8','3','3d10'],'reagents keep their own d10 and inherit the formula damage type');
prepareAlchemistReagentDamage(rollConfig,{},rollMessage);assert.deepEqual(rollConfig.rolls[0].parts,['2d8','3','3d10'],'repeated preparation cannot duplicate the dice');
const buttonConfig={subject:formula,event:{target:{closest:()=>({dataset:{messageId:card.id}})}},rolls:[{parts:['2d8','3'],options:{type:'poison'}}]};
assert.equal(guardAlchemistBombRoll(buttonConfig,{},{}),undefined,'native card event resolves its payment before buildPost assigns message origin');
prepareAlchemistReagentDamage(buttonConfig,{},{});assert.deepEqual(buttonConfig.rolls[0].parts,['2d8','3','3d10']);
assert.equal(reagents.system.uses.spent,3,'damage rolls do not pay a second time, including repeated or cancelled roll dialogs');
const ambiguous={subject:formula,rolls:[...clone(rollConfig.rolls),{parts:['1d6'],options:{type:'fire'}}]};assert.equal(prepareAlchemistReagentDamage(ambiguous,{},rollMessage),false);
const corrupt=clone(card.system.deltas.item[reagents.id]);card.system.deltas.item[reagents.id]=[];assert.equal(paidAlchemistBomb(formula,card),undefined);card.system.deltas.item[reagents.id]=corrupt;
// Real critical processing doubles the added dice along with the base dice, once.
class RollTerm{constructor(){this.options={};}get isDeterministic(){return false;}}
class Die extends RollTerm{constructor(number,faces){super();this.number=number;this.faces=faces;this.modifiers=[];}alter(m,b){this.number=this.number*m+b;}get formula(){return`${this.number}d${this.faces}`;}}
class NumericTerm extends RollTerm{constructor({number}){super();this.number=number;}get formula(){return String(this.number);}}
class OperatorTerm extends RollTerm{constructor({operator}){super();this.operator=operator;}get formula(){return this.operator;}}
class BaseRoll{constructor(formula,data,options){this.options=options;this.data=data;this.terms=formula.split(/\s*\+\s*/).flatMap((p,i)=>{const d=/^(\d+)d(\d+)$/.exec(p),term=d?new Die(+d[1],+d[2]):new NumericTerm({number:+p});return i?[new OperatorTerm({operator:'+'}),term]:[term];});}resetFormula(){this.formula=this.terms.map(t=>t.formula).join(' ');}}
const NativeDamage=nativeAlchemistDamageRoll(BaseRoll,{DiceTerm:Die,NumericTerm,OperatorTerm,ParentheticalTerm:class{},RollTerm,Roll:class{}});
const nativeCritical=new NativeDamage(rollConfig.rolls[0].parts.join(' + '),{},{...rollConfig.rolls[0].options,isCritical:true});
assert.deepEqual(nativeCritical.terms.filter(t=>t instanceof Die).map(t=>[t.number,t.faces]),[[4,8],[6,10]]);
nativeCritical.configureDamage();assert.deepEqual(nativeCritical.terms.filter(t=>t instanceof Die).map(t=>t.number),[4,6]);
assert.equal(nativeCritical.terms.find(t=>t instanceof NumericTerm).number,3,'numeric ability bonus remains single');
// Native damage application and force-success retain healing and normal legendary resistance.
const damageCard={type:'damage',getOriginatingMessage:()=>card};
const calculate=(entries,options)=>nativeCalculateDamage.call(actor,entries,options);
const damage=[{type:'poison',value:23},{type:'fire',value:4},{type:'healing',value:5},{type:'temphp',value:7}];
let result=alchemistBlastShieldDamage.call(actor,calculate,damage,{originatingMessage:damageCard});
assert.equal(result.amount,-5);assert.equal(result.temp,7);assert.equal(damage[0].value,23,'source damage entries stay unchanged');
assert.equal(alchemistBlastShieldDamage.call(actor,calculate,[{value:23}],{originatingMessage:damageCard}).amount,0,'untyped manual application from the same bomb is protected');
actor.system.traits.dm={amount:{poison:'3'}};globalThis.simplifyBonus=Number;
result=alchemistBlastShieldDamage.call(actor,calculate,[{type:'poison',value:23}],{originatingMessage:damageCard});assert.equal(result.amount,0,'positive flat damage changes cannot bypass own-bomb protection');actor.system.traits={};
const save={type:'ability',ability:'con',resisted:false,parent:{getAssociatedActor:()=>actor,getOriginatingMessage:()=>card}};
formula.save={ability:new Set(['con'])};
assert.equal(alchemistBlastShieldSuccess.call(save,()=>nativeSaveForceSuccess.call(save)),true);
save.ability='dex';assert.equal(alchemistBlastShieldSuccess.call(save,()=>false),false);save.ability='con';
save.type='concentration';assert.equal(alchemistBlastShieldSuccess.call(save,()=>false),false);save.type='ability';
actor.effects[0].active=false;assert.equal(alchemistBlastShieldSuccess.call(save,()=>false),false);assert.equal(alchemistBlastShieldDamage.call(actor,calculate,[{type:'poison',value:23}],{originatingMessage:damageCard}).amount,23);
assert.equal(alchemistBlastShieldSuccess.call(save,()=>true),true,'native legendary resistance is retained');actor.effects[0].active=true;
card.author.allowed=false;assert.equal(alchemistBlastShieldSuccess.call(save,()=>false),false);card.author.allowed=true;
const foreign={...formula,actor:{...actor,uuid:'Actor.other'}};card.getAssociatedActivity=()=>foreign;assert.equal(alchemistBlastShieldSuccess.call(save,()=>false),false);card.getAssociatedActivity=()=>formula;
// A real secondary splash keeps the combined original total and pays no extra reagents.
class AttackRoll{constructor(total){this.total=total;this._evaluated=true;}toJSON(){return{total:this.total};}}
class DamageResult{constructor(total,type){this.total=total;this.options={type};this._evaluated=true;}}
CONFIG.Dice.D20Roll=AttackRoll;CONFIG.Dice.DamageRoll=DamageResult;
const world=new Map(),victim={uuid:'Scene.test.Token.primary',actor:{uuid:'Actor.victim',flags:{}}};world.set(victim.uuid,victim);globalThis.fromUuidSync=uuid=>world.get(uuid);
const hit={uuid:'ChatMessage.hit',type:'attack',flags:{},rolls:[new AttackRoll(19)],system:{targets:[{token:victim.uuid,ac:10}]},getAssociatedActivity:()=>formula};world.set(hit.uuid,hit);
const combined={id:'combined',type:'damage',author:{},flags:{spikependium:{attackSource:{message:hit.uuid,signature:JSON.stringify(hit.rolls.map(r=>r.toJSON()))}}},rolls:[new DamageResult(23,'poison')],getAssociatedActivity:()=>formula,getOriginatingMessage:()=>card};game.messages.set(combined.id,combined);
const splashData=Object.values(formula.item.system.activities).find(a=>a.flags?.spikependium?.alchemistSplash);
const splash={...clone(splashData),id:splashData._id,actor,item:formula.item,updateSource(changes){for(const[p,v]of Object.entries(changes))set(this,p,v);}};
formula.item.toObject=()=>({...clone(read('alchemist:formula:stink')),system:{...clone(read('alchemist:formula:stink').system),activities:{[splash.id]:{...clone(splashData),damage:clone(splash.damage)}}}});
splash._prepareUsageUpdates=async c=>{const u=await nativeUsageUpdates.call(splash,c);return u&&prepareAlchemistBombUpdates(splash,c,u);};
const splashPayment=await pay(splash,{consume:{resources:true},spikependium:{bombDamage:combined.id}},[{token:'Scene.test.Token.self'}]);assert.notEqual(splashPayment.result,false);
const splashCard=usage(splash,splashPayment);assert.equal(reagents.system.uses.spent,3);assert.equal(splash.damage.parts[0].custom.formula,'11');
assert.equal(splash.save.dc.formula,'8 + @prof + @abilities.int.mod + @spikependium.alchemistBombDC');
const splashButton={subject:splash,event:{target:{closest:()=>({dataset:{messageId:splashCard.id}})}},rolls:[{parts:['99d20'],options:{type:'poison',isCritical:true}}]};
assert.equal(guardAlchemistBombRoll(splashButton,{},{}),undefined);prepareAlchemistReagentDamage(splashButton,{},{});assert.deepEqual(splashButton.rolls[0].parts,['11']);assert.equal(splashButton.rolls[0].options.isCritical,false);
const realSave={type:'ability',ability:'con',parent:{getAssociatedActor:()=>actor,getOriginatingMessage:()=>splashCard}};
combined.isContentVisible=false;
assert.equal(alchemistBlastShieldSuccess.call(realSave,()=>false),true);
const splashDamage={type:'damage',getOriginatingMessage:()=>splashCard};
assert.equal(alchemistBlastShieldDamage.call(actor,calculate,[{type:'poison',value:11}],{originatingMessage:splashDamage}).amount,0);
assert.equal(card.flags.spikependium.alchemistBomb.turn,'combat-r1-t0');initialCombat.round=2;
assert.equal(alchemistBlastShieldSuccess.call(realSave,()=>false),true,'shield is retained after the original turn ends, including blind damage cards');game.combats=[];game.combat=null;combined.isContentVisible=true;
await nativeRefund.call(splash,splashCard.system.deltas,apply);assert.equal(alchemistBlastShieldSuccess.call(realSave,()=>false),false,'refunded splash cannot claim another payment');
await nativeRefund.call(formula,card.system.deltas,apply);assert.equal(bombs.system.uses.spent,0);assert.equal(reagents.system.uses.spent,0);assert.equal(paidAlchemistBomb(formula,card),undefined);
assert.equal(prepareAlchemistReagentDamage(rollConfig,{},rollMessage),false);assert.equal(alchemistBlastShieldSuccess.call(save,()=>false),false);
// Ordinary bomb splashes use DC 11; charged splashes recover their original class DC.
const ordinaryPayment=await pay(normal,{consume:{resources:true}}),ordinaryCard=usage(normal,ordinaryPayment);
combined.id='ordinaryDamage';combined.getAssociatedActivity=()=>normal;combined.getOriginatingMessage=()=>ordinaryCard;
hit.getAssociatedActivity=()=>normal;game.messages.set(combined.id,combined);
const normalSplashData=Object.values(bombs.system.activities).find(a=>a.flags?.spikependium?.alchemistSplash);
const normalSplash={...clone(normalSplashData),id:normalSplashData._id,actor,item:bombs,updateSource:splash.updateSource};
bombs.toObject=()=>({...clone(read('alchemist:bombs')),system:{...clone(read('alchemist:bombs').system),activities:{[normalSplash.id]:{...clone(normalSplashData),save:clone(normalSplash.save),damage:clone(normalSplash.damage)}}}});
normalSplash._prepareUsageUpdates=async c=>{const u=await nativeUsageUpdates.call(normalSplash,c);return u&&prepareAlchemistBombUpdates(normalSplash,c,u);};
const ordinarySplash=await pay(normalSplash,{consume:{resources:true},spikependium:{bombDamage:combined.id}},[{token:'Scene.test.Token.self'}]);assert.notEqual(ordinarySplash.result,false);assert.equal(normalSplash.save.dc.formula,'11');
const boostedPayment=await pay(charged,{consume:{resources:true}}),boostedCard=usage(charged,boostedPayment);
combined.id='boostedDamage';combined.getAssociatedActivity=()=>charged;combined.getOriginatingMessage=()=>boostedCard;hit.getAssociatedActivity=()=>charged;game.messages.set(combined.id,combined);
const boostedSplash=await pay(normalSplash,{consume:{resources:true},spikependium:{bombDamage:combined.id}},[{token:'Scene.test.Token.self'}]);assert.notEqual(boostedSplash.result,false);assert.equal(normalSplash.save.dc.formula,'8 + @prof + @abilities.int.mod + @spikependium.alchemistBombDC');
const oldSplashCard=usage(normalSplash,ordinarySplash);oldSplashCard.getFlag=(scope,path)=>get(oldSplashCard.flags[scope],path);
const live={...normalSplash,item:{...bombs,clone(changes){const restored={...normalSplash,damage:{parts:changes[`system.activities.${normalSplash.id}.damage.parts`]},save:{dc:changes[`system.activities.${normalSplash.id}.save.dc`]}};return{system:{activities:new Map([[normalSplash.id,restored]])}};}}};
assert.equal(restoreAlchemistSplash.call(oldSplashCard,()=>live,{}).save.dc.formula,'11','old chat cards restore their own DC rather than the latest splash settings');
assert.notEqual(live.save.dc.formula,'11');
const painkillerDoc=read('alchemist:special-formula:painkiller'),healData=Object.values(painkillerDoc.system.activities).find(a=>a.type==='heal'&&a.flags?.spikependium?.alchemistBomb);
const willing={...clone(healData),id:healData._id,actor,item:{...clone(painkillerDoc),id:painkillerDoc._id}};
willing.consumption.targets=charged.consumption.targets;willing._prepareUsageUpdates=async c=>{const u=await nativeUsageUpdates.call(willing,c);return u&&prepareAlchemistBombUpdates(willing,c,u);};
const willingCard=usage(willing,await pay(willing)),healingConfig={subject:willing,rolls:[{parts:['4d10','3'],options:{type:'temphp'}}]};
prepareAlchemistReagentDamage(healingConfig,{},{data:{system:{origin:willingCard.id}}});assert.deepEqual(healingConfig.rolls[0].parts,['4d10','3','3d10'],'willing painkiller target uses its paid reagent dice for temporary HP');
// Consumption-dialog bounds and pending native resource changes use the shared pool.
class Dialog{async _prepareConsumptionContext(c){return c;}}
const dialog={applicationClass:Dialog};prepareAlchemistReagentDialog(charged,{},dialog);assert.equal(dialog.configure,true);
const instance=new dialog.applicationClass();instance.config={};const fields=(await instance._prepareConsumptionContext({fields:[]})).fields;
assert.equal(fields[0].field.max,6);assert.equal(fields[0].field.integer,true);
const pending={item:[{_id:reagents.id,system:{uses:{spent:reagents.system.uses.spent+2}}}]};const charge=prepareAlchemistReagentUpdates(charged,config,pending);
assert.equal(charge.cost,5);assert.equal(pending.item.length,1);assert.equal(pending.item[0].system.uses.spent,reagents.system.uses.spent+5);
prepareAlchemistReagentDialog({flags:{}},{},{applicationClass:Dialog});
console.log('Alchemist reagents: native shared payment/refund/cancel, class/proficiency/resource guards, typed combined damage and real critical scaling; own-bomb native success and zero damage with toggles, healing, permissions and refunded-source guards passed.');
