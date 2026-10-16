import assert from 'node:assert/strict';
import fs from 'node:fs';
import { snapshotStaffFollowup, staffFollowupUse, prepareStaffFollowupUse, prepareStaffFollowupUpdates, recordStaffFollowupConsumption,
 paidStaffFollowup, guardStaffFollowupRoll, prepareCraterSave, guardStaffFollowupDamage, staffFollowupAttack } from '../scripts/griffon-staff-followups.mjs';
import { prepareStaffUpdates, recordStaffConsumption } from '../scripts/griffon-staves.mjs';
import { prepareFocusUpdates } from '../scripts/griffon-foci.mjs';
import { nativeUsageConfig, nativeUsageUpdates, nativeUsesConsumption, nativeMergeUpdates } from './data/dnd5e-monsters-native.mjs';
import { nativeConsume, nativeRefund, getDeltas } from './data/dnd5e-reaction-native.mjs';
import { nativeStaffCastUse, nativeStaffRollPost, nativeStaffLinkedActivity } from './data/dnd5e-griffon-followups-native.mjs';
import { nativeD20ConfigureModifiers } from './data/dnd5e-arcana-native.mjs';
const docs=fs.readdirSync('packs/_source/items').map(f=>JSON.parse(fs.readFileSync(`packs/_source/items/${f}`,'utf8')));
const clone=structuredClone,get=(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o),set=(o,p,v)=>{const ks=p.split('.'),k=ks.pop();ks.reduce((v,k)=>v[k]??={},o)[k]=v;};
const flat=(o,p='',r={})=>{for(const[k,v]of Object.entries(o)){const key=p?`${p}.${k}`:k;if(v&&Object.getPrototypeOf(v)===Object.prototype)flat(v,key,r);else r[key]=v;}return r;};
const list=a=>Object.assign(a,{get(id){return this.find(v=>v.id===id);}}),update=(o,u)=>{for(const[p,v]of Object.entries(u))if(p!=='_id')set(o,p,clone(v));};
const copy=v=>Array.isArray(v)?v.map(copy):v&&Object.getPrototypeOf(v)===Object.prototype?Object.fromEntries(Object.entries(v).map(([k,v])=>[k,copy(v)])):v;
function merge(a,b,{inplace=true}={}){const out=inplace?a:copy(a);for(const[k,v]of Object.entries(b)){if(v&&Object.getPrototypeOf(v)===Object.prototype)out[k]=merge(out[k]&&typeof out[k]==='object'?out[k]:{},v);else out[k]=copy(v);}return out;}
const world=new Map(),gm={id:'gm',isGM:true,isActiveGM:true};let serial=0,confirm=true,prompts=0,cancel=false,warnings=0;
globalThis.foundry={utils:{getProperty:get,setProperty:set,deepClone:clone,expandObject:o=>o,flattenObject:flat,isEmpty:o=>!Object.keys(o).length,getType:o=>Array.isArray(o)?'Array':o&&typeof o==='object'?'Object':typeof o,
 mergeObject:merge,randomID:()=>String(++serial).padStart(16,'0')},applications:{api:{DialogV2:{async confirm(){prompts++;return confirm;}}}}};
globalThis.game={user:gm,users:list([gm]),messages:list([]),scenes:[],time:{worldTime:100},combat:{id:'combat',started:true,round:1,turn:0},i18n:{localize:k=>k}};game.users.activeGM=gm;
globalThis.ui={notifications:{warn(){warnings++;},error(){warnings++;}}};
globalThis.fromUuidSync=(uuid,options)=>world.get(uuid?.startsWith('.')?`${options.relative.uuid}${uuid}`:uuid)??null;
globalThis.dnd5e={utils:{getSceneTargets:actor=>actor.tokens??[]}};
globalThis.CONFIG={DND5E:{activityActivationTypes:{special:{},bonus:{consume:{property:'attributes.actions.bonus',canConsume:a=>a.actor.inCombat}}},spellcasting:{spell:{getSpellSlotKey:level=>`spell${level}`}}},Dice:{D20Roll:class{
 static ADV_MODE={NORMAL:0,ADVANTAGE:1,DISADVANTAGE:-1};constructor(total=2){this.total=total;this.options={};this._evaluated=true;}toJSON(){return{total:this.total,options:clone(this.options)};}}}};
globalThis.Hooks={call(name,...args){if(name==='dnd5e.activityConsumption'&&cancel)return false;if(name==='dnd5e.postActivityConsumption'){recordStaffConsumption(...args);recordStaffFollowupConsumption(...args);}return true;},callAll(){}};
function actor(id){const bonus={spent:0,max:1};Object.defineProperty(bonus,'value',{get(){return this.max-this.spent;}});const a={id,uuid:`Actor.${id}`,isOwner:true,inCombat:true,flags:{spikependium:{}},items:list([]),
 system:{abilities:{int:{value:17},str:{value:17}},attributes:{actions:{bonus}},spells:{spell1:{level:1,value:0}}},testUserPermission:u=>u?.id==='gm'};world.set(a.uuid,a);return a;}
function message(type,activity,data={}){const id=`message${++serial}`,m={id,uuid:`ChatMessage.${id}`,type,author:gm,activity,flags:{},system:{},rolls:[],whisper:[],...data,
 getAssociatedActivity(){return this.activity;},getAssociatedActor(){return this.activity?.actor;},getOriginatingMessage(){return game.messages.get(this.system.origin)??world.get(this.system.origin);}};game.messages.push(m);world.set(m.uuid,m);return m;}
async function preparation(config,options){let u=await nativeUsageUpdates.call(this,config,options);if(!u||Array.isArray(u))return u;
 u=await prepareFocusUpdates(this,config,u);if(u)u=prepareStaffUpdates(this,config,u);if(u)u=prepareStaffFollowupUpdates(this,config,u);return u;}
async function activate(activity,raw,messageConfig={data:{}}){const config=nativeUsageConfig.call(activity,raw);
 if(prepareStaffFollowupUse(activity,config,{},messageConfig)===false)return;
 const result=await nativeConsume.call(activity,config,messageConfig,async u=>{const deltas={actor:getDeltas(activity.actor,u.actor),item:Object.fromEntries(u.item.map(x=>[x._id,getDeltas(activity.actor.items.get(x._id),Object.fromEntries(Object.entries(x).filter(([k])=>k!=='_id')))]))};update(activity.actor,u.actor);for(const x of u.item)update(activity.actor.items.get(x._id),x);return deltas;});
 if(result)return{message:message('usage',activity,messageConfig.data),updates:result};}
function setup(kind='cratering') {game.messages.length=0;game.time.worldTime=100;game.combat={id:'combat',started:true,round:1,turn:0};confirm=true;cancel=false;
 CONFIG.DND5E.activityActivationTypes.bonus={consume:{property:'attributes.actions.bonus',canConsume:a=>a.actor.inCombat}};
 const caster=actor(`caster${++serial}`),target=actor(`target${serial}`),other=actor(`other${serial}`),item=clone(docs.find(d=>d.flags?.spikependium?.key===`item:gs1:${kind}`));assert.ok(item);item.id=item._id;item.uuid=`${caster.uuid}.Item.${item.id}`;item.actor=caster;item.isOwner=item.isEmbedded=true;item.getFlag=()=>undefined;
 item.system.equipped=item.system.attuned=true;item.system.uses.max=Number(item.system.uses.max);Object.defineProperty(item.system.uses,'value',{get(){return this.max-this.spent;}});
 const activities=Object.values(item.system.activities).map(a=>({...a,id:a._id,uuid:`${item.uuid}.Activity.${a._id}`,relativeUUID:`.Item.${item.id}.Activity.${a._id}`,item,actor:caster,isSpell:false,requiresSpellSlot:false,
  getLinkedActivity:nativeStaffLinkedActivity,_mergeActivityUpdates:nativeMergeUpdates,_prepareUsageUpdates:preparation}));item.system.activities=new Map(activities.map(a=>[a.id,a]));caster.items.push(item);world.set(item.uuid,item);for(const a of activities)world.set(a.uuid,a);
 const root=activities.find(a=>a.flags?.spikependium?.staffCrater||a.flags?.spikependium?.staffMissile);assert.ok(root);root.target.template??={};root.requiresConcentration=false;
 root.consumption.targets=root.consumption.targets.map(t=>({...t,hasZeroCost:()=>false,async consume(config,u){const result=await nativeUsesConsumption.call({resolveCost:async()=>({total:1})},{},{uses:item.system.uses,type:'staff',rolls:u.rolls,delta:{}});u.item.push({_id:item.id,'system.uses.spent':result.spent});}}));
 const attack=activities.find(a=>a.type==='attack'),token={uuid:`Scene.test.Token.target${serial}`,actor:target};target.tokens=[token];world.set(token.uuid,token);game.combat.combatant={actor:caster};
 const roll=new CONFIG.Dice.D20Roll(2);snapshotStaffFollowup(attack,{options:roll.options});const shot=message('attack',attack,{rolls:[roll],system:{mode:'oneHanded',targets:[{actor:target.uuid,token:token.uuid,ac:15,isMiss:true}]}});
 let child;
 if(kind==='arcanist-bowstaff'){
  const spell={id:`cached${serial}`,uuid:`${caster.uuid}.Item.cached${serial}`,actor:caster,type:'spell',flags:{dnd5e:{cachedFor:root.relativeUUID}},system:{level:1,method:'spell'},getFlag:(_scope,key)=>key==='cachedFor'?root.relativeUUID:undefined};caster.items.push(spell);
  child={id:'dart',uuid:`${spell.uuid}.Activity.dart`,item:spell,actor:caster,type:'damage',activation:{type:'bonus',value:1},consumption:{targets:[],spellSlot:true},target:{template:{}},isSpell:true,requiresSpellSlot:true,requiresConcentration:false,
   getLinkedActivity:nativeStaffLinkedActivity,_mergeActivityUpdates:nativeMergeUpdates,_prepareUsageUpdates:preparation};
  child.use=async config=>staffFollowupUse.call(child,c=>activate(child,c),config);
  root.cachedSpell={use:config=>child.use(config)};
  root.use=async config=>staffFollowupUse.call(root,c=>nativeStaffCastUse.call(root,c),config);
 }else root.use=async config=>staffFollowupUse.call(root,c=>activate(root,c),config);
 return{caster,target,other,item,root,child,attack,shot,roll,token};}
const origin=usage=>({data:{system:{origin:usage.id}}});
async function use(s,extra={}){return s.root.use({spikependium:{staffFollowup:s.shot.uuid,...extra}});}
function saving(s,usage,actor=s.target,options={}){const config={subject:actor,ability:'dex',rolls:[{options}]},msg=origin(usage);return{config,msg,result:prepareCraterSave(config,{},msg)};}
function nativeMode(options){let applied;nativeD20ConfigureModifiers.call({validD20Roll:true,options,constructor:CONFIG.Dice.D20Roll,d20:{options:{},applyFlag(){},applyRange(){},applyAdvantage(mode){applied=mode;}},resetFormula(){}});return applied;}
async function refund(s,usage){await nativeRefund.call(s.root,usage.system.deltas,async u=>{update(s.caster,u.actor);for(const x of u.item)update(s.caster.items.get(x._id),x);});}

let s=setup(),r=await use(s),usage=r.message;assert.equal(s.item.system.uses.spent,1);assert.ok(paidStaffFollowup(usage),'a miss still permits the paid crater cone');assert.equal(usage.system.deltas.actor.filter(d=>d.keyPath.startsWith('flags.spikependium.')).length,2);
let save=saving(s,usage);assert.equal(save.result,undefined);assert.equal(nativeMode(save.config.rolls[0].options),-1);
save=saving(s,usage,s.target,{advantageMode:1});assert.equal(nativeMode(save.config.rolls[0].options),0,'original advantage cancels the new disadvantage');
save=saving(s,usage,s.other);assert.deepEqual(save.config.rolls[0].options,{});assert.equal(guardStaffFollowupRoll({subject:s.root},{},origin(usage)),undefined);
const concentration={subject:s.target,ability:'con',saveType:'concentration',isConcentration:true,rolls:[{options:{}}]};assert.equal(prepareCraterSave(concentration,{},origin(usage)),undefined);assert.deepEqual(concentration.rolls[0].options,{});
const dexConcentration={...concentration,ability:'dex'};assert.equal(prepareCraterSave(dexConcentration,{},origin(usage)),undefined);
const extraToken={uuid:'Scene.test.Token.duplicate',actor:s.target};s.target.tokens.push(extraToken);const beforeWarnings=warnings;save=saving(s,usage);assert.deepEqual(save.config.rolls[0].options,{});assert.ok(warnings>beforeWarnings);
const exact=origin(usage);exact.data.speaker={scene:'test',token:s.token.uuid.split('.').at(-1)};const exactConfig={subject:s.target,ability:'dex',rolls:[{options:{}}]};prepareCraterSave(exactConfig,{},exact);assert.equal(nativeMode(exactConfig.rolls[0].options),-1);
const otherSpeaker=origin(usage);otherSpeaker.data.speaker={scene:'test',token:'duplicate'};const otherConfig={subject:s.target,ability:'dex',rolls:[{options:{}}]};prepareCraterSave(otherConfig,{},otherSpeaker);assert.deepEqual(otherConfig.rolls[0].options,{});
const damage=message('damage',s.root,{system:{origin:usage.id}});assert.equal(guardStaffFollowupDamage(s.other,3,{}, {originatingMessage:damage}),undefined);
await refund(s,usage);assert.equal(s.item.system.uses.spent,0);assert.equal(paidStaffFollowup(usage),undefined);assert.equal(guardStaffFollowupRoll({subject:s.root},{},origin(usage)),false);assert.equal(saving(s,usage).result,false);assert.equal(guardStaffFollowupDamage(s.target,3,{}, {originatingMessage:damage}),false);
assert.ok((await use(s)).message,'refund releases the original crater turn');

// Eligibility follows the owned native source roll, never the presence of a hit.
for(const modify of [s=>{game.combat.turn=1;},s=>{game.combat.combatant.actor=s.other;},s=>{s.shot.author={id:'stranger'};},s=>{s.item.system.equipped=false;},s=>{s.caster.isOwner=false;},s=>{s.item.system.uses.spent=s.item.system.uses.max;},s=>{s.caster.items.length=0;}]){
 s=setup();modify(s);const spent=s.item.system.uses.spent;assert.equal(await use(s),undefined);assert.equal(s.item.system.uses.spent,spent);
}
s=setup();message('attack',s.attack,{rolls:[new CONFIG.Dice.D20Roll()],system:{targets:[]}});assert.equal(await use(s),undefined,'an older attack cannot be selected after another attack');
s=setup();s.shot.system.targets=[];r=await use(s);assert.ok(paidStaffFollowup(r.message));assert.equal(paidStaffFollowup(r.message).receipt.primary,null,'attacks on unrepresented objects remain legal with manual direction/target adjudication');assert.deepEqual(saving(s,r.message).config.rolls[0].options,{});
s=setup();s.shot.system.targets.push(clone(s.shot.system.targets[0]));r=await use(s);assert.ok(paidStaffFollowup(r.message));assert.deepEqual(saving(s,r.message).config.rolls[0].options,{});
s=setup();cancel=true;assert.equal(await use(s),undefined);assert.equal(s.item.system.uses.spent,0);assert.equal(s.caster.flags.spikependium.staffFollowups,undefined);
s=setup();s.shot.whisper=['gm'];s.shot.blind=true;s.shot.isContentVisible=false;r=await use(s);assert.ok(paidStaffFollowup(r.message),'followups that do not depend on a hit remain legal after blind attack rolls');assert.deepEqual(r.message.whisper,['gm']);assert.equal(r.message.blind,true);
s=setup();game.combat.started=false;s.caster.inCombat=false;s.shot.rolls[0].options={};snapshotStaffFollowup(s.attack,{options:s.shot.rolls[0].options});r=await use(s);assert.ok(paidStaffFollowup(r.message));
s=setup();game.combat.started=false;s.caster.inCombat=false;s.shot.rolls[0].options={};snapshotStaffFollowup(s.attack,{options:s.shot.rolls[0].options});game.time.worldTime++;assert.equal(await use(s),undefined);

// Native Cast.use forwards the shared payment through a cached spell's linked updates, including the bonus action.
s=setup('arcanist-bowstaff');const before=prompts;r=await use(s);usage=r.message;assert.equal(prompts,before+1);assert.equal(usage.activity,s.child);assert.equal(s.item.system.uses.spent,1);assert.equal(s.caster.system.attributes.actions.bonus.spent,1);assert.equal(s.caster.system.spells.spell1.value,0,'personal slots remain empty');assert.ok(paidStaffFollowup(usage));
assert.equal(await use(s),undefined);assert.equal(s.item.system.uses.spent,1);
const oldUses=s.item.system.uses.spent;const nextRoll=new CONFIG.Dice.D20Roll();snapshotStaffFollowup(s.attack,{options:nextRoll.options});s.shot=message('attack',s.attack,{rolls:[nextRoll],system:{targets:[]}});assert.equal(await use(s),undefined,'a new attack cannot grant a second bonus cast in the same turn');assert.equal(s.item.system.uses.spent,oldUses);
await refund(s,usage);assert.equal(s.caster.system.attributes.actions.bonus.spent,0);assert.equal(s.item.system.uses.spent,0);r=await use(s,{staffAttackAction:true});assert.ok(r.message);
const missile=message('damage',s.child,{system:{origin:r.message.id}});assert.equal(guardStaffFollowupDamage(s.other,5,{}, {originatingMessage:missile}),undefined);
const wrongActivity={uuid:'Actor.someone.Item.other.Activity.damage'};assert.equal(guardStaffFollowupRoll({subject:wrongActivity},{},origin(r.message)),false);
const charges=r.message.system.deltas.item[s.item.id];r.message.system.deltas.item[s.item.id]=[];assert.equal(paidStaffFollowup(r.message),undefined);r.message.system.deltas.item[s.item.id]=charges;
s.shot.rolls[0].total=19;assert.equal(paidStaffFollowup(r.message),undefined);assert.equal(guardStaffFollowupDamage(s.target,5,{}, {originatingMessage:missile}),false);
s=setup('arcanist-bowstaff');confirm=false;assert.equal(await use(s),undefined);assert.equal(s.item.system.uses.spent,0);
s=setup('arcanist-bowstaff');s.caster.system.attributes.actions.bonus.spent=1;assert.equal(await use(s),undefined);assert.equal(s.item.system.uses.spent,0);
s=setup('arcanist-bowstaff');s.caster.system.attributes.actions.bonus.max=2;assert.ok((await use(s)).message);const extraRoll=new CONFIG.Dice.D20Roll();snapshotStaffFollowup(s.attack,{options:extraRoll.options});s.shot=message('attack',s.attack,{rolls:[extraRoll],system:{targets:[]}});assert.ok((await use(s)).message,'a real extra native bonus action allows a new attack to trigger another cast');assert.equal(s.caster.system.attributes.actions.bonus.spent,2);assert.equal(s.item.system.uses.spent,2);
s=setup('arcanist-bowstaff');assert.equal(await s.root.use({consume:{action:false},spikependium:{staffFollowup:s.shot.uuid,staffAttackAction:true}}),undefined);assert.equal(s.item.system.uses.spent,0);assert.equal(s.caster.system.attributes.actions.bonus.spent,0);
s=setup('arcanist-bowstaff');CONFIG.DND5E.activityActivationTypes.bonus={};r=await use(s);assert.ok(r.message);assert.equal(s.item.system.uses.spent,1);assert.equal(s.caster.system.attributes.actions.bonus.spent,0,'untracked bonus availability remains an explicit confirmation');assert.equal(await use(s),undefined);
s=setup('arcanist-bowstaff');s.item.system.attuned=false;assert.equal(await use(s),undefined);
s=setup('arcanist-bowstaff');s.caster.system.abilities.int.value=16;assert.equal(await use(s),undefined);
s=setup('arcanist-bowstaff');r=await s.child.use({});assert.ok(paidStaffFollowup(r.message),'cached spell entry follows the same confirmation and source guards');

// Native BasicRoll.buildPost attaches its published message before the post-attack followup runs.
s=setup();await nativeStaffRollPost.call({toMessage:async()=>s.shot},[s.roll],{}, {create:true,data:{}});assert.equal(s.roll.parent,s.shot);
const source=[s.roll],out=await staffFollowupAttack.call(s.attack,async()=>source);assert.equal(out,source);assert.equal(s.item.system.uses.spent,1);
s=setup('arcanist-bowstaff');s.roll.parent=s.shot;const promptCount=prompts;await staffFollowupAttack.call(s.attack,async()=>[s.roll]);assert.equal(prompts,promptCount+1,'one confirmation for the post-attack cast, including the nested cached spell');assert.equal(s.item.system.uses.spent,1);
s=setup();s.roll.parent=s.shot;confirm=false;await staffFollowupAttack.call(s.attack,async()=>[s.roll]);assert.equal(s.item.system.uses.spent,0);
s=setup();s.roll.parent=s.shot;s.root.use=async()=>{throw Error('cancelled followup write');};const log=console.error;let errors=0;console.error=()=>errors++;try{assert.deepEqual(await staffFollowupAttack.call(s.attack,async()=>[s.roll]),[s.roll]);}finally{console.error=log;}assert.equal(errors,1,'followup failure never discards the completed attack');
s=setup();r=await use(s);const hiddenDamage=message('damage',s.root,{system:{origin:r.message.id}});s.caster.items.length=0;assert.equal(paidStaffFollowup(r.message),undefined);assert.equal(guardStaffFollowupDamage(s.other,3,{}, {originatingMessage:hiddenDamage}),false);
console.log('Staff followups: native attack message association, miss/turn/source/ownership guards, exact paid crater target disadvantage and advantage cancellation, concentration exclusions, native Cast/cached-spell linked charge and bonus-action budgets, refunds/cancel/slot-free casting, fallback turn limits and extra native actions, stale/deleted source guards and preserved attacks after followup failure passed.');
