import assert from "node:assert/strict";
import fs from "node:fs";
import {prepareEnervationDialog,captureEnervation,prepareEnervationUpdates,recordEnervationConsumption,recordEnervationUsage,
 enervationCastPaid,enervationDamage,guardEnervationDamage,serializeEnervationDamage,resumeEnervationHealing,cleanEnervation} from "../scripts/arcana-enervation.mjs";
import {recordArcanaCast,syncArcanaCast,arcanaEffectCast,arcanaEndTurn} from "../scripts/arcana-spells.mjs";
import {nativeApplyDamage,nativeCalculateDamage} from "./data/dnd5e-guardian-native.mjs";
import {nativeConsume,nativeRefund,getDeltas} from "./data/dnd5e-reaction-native.mjs";
import {prepareEffectData} from "./data/dnd5e-effect-application.mjs";
import {nativeAppliedEffectChanges} from "./data/dnd5e-arcana-native.mjs";
const read=pack=>fs.readdirSync(`packs/_source/${pack}`).map(f=>JSON.parse(fs.readFileSync(`packs/_source/${pack}/${f}`,"utf8")));
const doc=read("spells").find(d=>d.flags?.spikependium?.key==="spell:au-enervation");assert.ok(doc);
assert.equal(doc.name,"Обессиливание");assert.equal(doc.system.source.page,"44");assert.equal(doc.system.level,5);
assert.equal(doc.system.school,"nec");assert.ok(doc.system.properties.includes("concentration"));assert.equal(doc.system.duration.value,"1");
const [initial,drain]=Object.values(doc.system.activities);
assert.deepEqual(initial.save.ability,["dex"]);assert.equal(initial.damage.onSave,"half");assert.equal(initial.damage.parts[0].number,6);
assert.equal(initial.damage.parts[0].scaling.number,1);assert.equal(drain.damage.parts[0].number,2);assert.equal(drain.damage.parts[0].scaling.mode,"");
assert.equal(drain.consumption.spellSlot,false);assert.equal(drain.activation.type,"bonus");assert.equal(drain.duration.concentration,false);
assert.ok(doc.system.description.value.includes("[[/damage 2d8 type=necrotic]]"));
const lists=read("rules").find(d=>d.flags?.spikependium?.key==="journal:au-spell-lists");
assert.deepEqual(lists.pages.filter(p=>p.system.spells.includes(`Compendium.spikependium.spells.Item.${doc._id}`)).map(p=>p.system.identifier).sort(),["sorcerer","warlock","wizard"]);
const clone=structuredClone,get=(o,p)=>p.split(".").reduce((v,k)=>v?.[k],o),set=(o,p,v)=>{const ks=p.split("."),k=ks.pop();ks.reduce((v,k)=>v[k]??={},o)[k]=v;};
const merge=(a,b)=>{for(const[k,v]of Object.entries(b)){if(k.includes("."))set(a,k,clone(v));else if(v&&Object.getPrototypeOf(v)===Object.prototype)merge(a[k]??={},v);else a[k]=clone(v);}return a;};
const flat=(o,p="",r={})=>{for(const[k,v]of Object.entries(o)){const key=p?`${p}.${k}`:k;if(v&&Object.getPrototypeOf(v)===Object.prototype)flat(v,key,r);else r[key]=v;}return r;};
const list=a=>Object.assign(a,{get(id){return this.find(v=>v.id===id);}});
let serial=0,world,cancelPayment=false,cancelHP=false,blockHeal=false,notices=[];
const gm={id:"gm",isGM:true,isActiveGM:true,active:true};
globalThis.fromUuidSync=uuid=>world.get(uuid);
globalThis.foundry={utils:{getProperty:get,setProperty:set,mergeObject:merge,deepClone:clone,flattenObject:flat,isEmpty:o=>!Object.keys(o).length,randomID:()=>String(++serial).padStart(16,"0")},data:{fields:{BooleanField:class{constructor(o){Object.assign(this,o);}}}}};
globalThis.ui={notifications:{warn:m=>notices.push(m)}};
class D20{constructor(total){this.total=total;this.options={target:16};this._evaluated=true;}get isFailure(){return this.total<16;}}
class Damage{constructor(total,type="necrotic"){this.total=total;this.options={type};this._evaluated=true;}toJSON(){return {total:this.total,options:this.options};}}
globalThis.CONFIG={Dice:{D20Roll:D20,DamageRoll:Damage},DND5E:{damageTypes:{necrotic:{},fire:{}},healingTypes:{healing:{},temphp:{}}}};
Math.clamp=(v,min,max)=>Math.min(max,Math.max(min,v));Number.isNumeric=n=>typeof n==="number"&&Number.isFinite(n);globalThis.simplifyBonus=n=>Number(n)||0;
globalThis.Hooks={call(h,...args){
 if(h==="dnd5e.preActivityConsumption")return captureEnervation(...args);
 if(h==="dnd5e.activityConsumption"&&cancelPayment)return false;
 if(h==="dnd5e.postActivityConsumption")recordEnervationConsumption(...args);
 if(h==="dnd5e.preApplyDamage"){if(blockHeal&&args[3].spikependiumEnervationHeal)return false;return guardEnervationDamage(...args);}
 if(h==="modifyTokenAttribute"&&cancelHP)return false;return true;
},callAll(){}};
class Effect{
 constructor(data,parent){Object.assign(this,clone(data));this.id=data._id??`effect${++serial}`;this.uuid=`${parent.uuid}.ActiveEffect.${this.id}`;this.parent=parent;this.actor=parent.actor??parent;
 this.flags??={};this.system??={};this.duration??={};this.statuses=new Set(data.statuses??[]);this._stats??={};world.set(this.uuid,this);}
 get active(){return !this.disabled&&!this.duration.expired;}
 toObject(){return {_id:this.id,name:this.name,flags:clone(this.flags),system:clone(this.system),duration:clone(this.duration),statuses:[...this.statuses]};}
 static getEffectStart(){return {time:game.time.worldTime};}static forApplication(c){return c;}
 async delete(){this.actor.effects.splice(this.actor.effects.indexOf(this),1);world.delete(this.uuid);}
}
globalThis.ActiveEffect={implementation:Effect};
globalThis.dnd5e={utils:{convertLength:n=>n},applications:{components:{EffectApplicationElement:class{async _prepareEffectData(e,a){return prepareEffectData.call(this,e,a,x=>x);}}}}};
function actor(id){const a={id,uuid:`Actor.${id}`,documentName:"Actor",flags:{},effects:list([]),items:list([]),isOwner:true,statuses:new Set(),testUserPermission:u=>u?.isGM||u?.id==="owner",
 system:{isCreature:true,attributes:{hp:{value:10,max:100,damage:90,temp:0,tempmax:0}},_source:{attributes:{hp:{tempmax:0}}},traits:{}},getRollData:()=>({}),changeIsIgnored:()=>false};
 a.changeHasEffect=(kind,d)=>d.type==="necrotic"&&(kind==="immunity"&&a.immune||kind==="resistance"&&a.resist||kind==="vulnerability"&&a.vulnerable);
 a.calculateDamage=(d,o)=>nativeCalculateDamage.call(a,d,o);a.applyDamage=(d,o)=>serializeEnervationDamage.call(a,(...args)=>nativeApplyDamage.call(a,...args),d,o);
 a.update=async u=>{if(a.fail){a.fail=false;throw Error("HP write failed");}if(a.failAck&&Object.keys(u).some(k=>k.endsWith(".pending"))){a.failAck=false;throw Error("ack failed");}merge(a,u);a.system.attributes.hp.damage=a.system.attributes.hp.max-a.system.attributes.hp.value;return a;};
 a.createEmbeddedDocuments=async(_type,rows)=>rows.map(d=>{const e=new Effect(d,a);a.effects.push(e);return e;});
 a.updateEmbeddedDocuments=async(_type,rows)=>rows.map(d=>{const e=a.effects.get(d._id);merge(e,d);return e;});
 a.deleteEmbeddedDocuments=async(_type,ids)=>{for(const e of [...a.effects])if(ids.includes(e.id))await e.delete();};
 game.actors.push(a);world.set(a.uuid,a);return a;}
function message(type,a,data={}){const id=`message${++serial}`,m={id,uuid:`ChatMessage.${id}`,timestamp:serial,type,activity:a,author:gm,flags:{},system:{},rolls:[],whisper:[],...data,
 getAssociatedActivity(){return this.activity;},getAssociatedActor(){return this.actor??this.activity.actor;},getAssociatedItem(){return this.activity.item;},getAssociatedToken(){return this.token;},
 getOriginatingMessage(){return game.messages.get(this.system.origin);},
 getAssociatedRolls(kind){return game.messages.filter(c=>c.type===kind&&c.system.origin===this.id);},async setFlag(scope,key,v){set(this.flags,`${scope}.${key}`,v);}};
 world.set(m.uuid,m);game.messages.push(m);return m;}
function setup(){world=new Map();cancelPayment=cancelHP=blockHeal=false;notices=[];
 globalThis.game={user:gm,users:list([gm]),actors:[],scenes:[],messages:list([]),time:{worldTime:100},combat:{id:"fight",started:true,round:1,turn:0}};game.users.activeGM=gm;
 const caster=actor("caster"),target=actor("target");const scene={grid:{units:"ft",getCenterPoint:o=>({x:o.x,y:0}),measurePath:([a,b])=>({distance:Math.hypot(a.x-b.x,a.elevation-b.elevation)})},tokens:list([])};
 const token=(name,actor,x)=>{const t={uuid:`Scene.test.Token.${name}`,actor,parent:scene,x,elevation:0,getOccupiedGridSpaceOffsets(){return[{x:this.x}];}};world.set(t.uuid,t);scene.tokens.push(t);return t;};
 const sourceToken=token("caster",caster,0),targetToken=token("target",target,60);game.scenes.push(scene);game.user.targets=new Set([targetToken]);game.combat.combatant={actor:caster,token:sourceToken};
 const item=clone(doc);item.id=item._id;item.uuid=`${caster.uuid}.Item.${item.id}`;item.actor=caster;item.toObject=()=>clone(doc);item.effects=list(doc.effects.map(d=>new Effect(d,item)));world.set(item.uuid,item);caster.items.push(item);
 const acts=Object.values(doc.system.activities).map(d=>({...clone(d),uuid:`${item.uuid}.Activity.${d._id}`,actor:caster,item,applicableEffects:item.effects,getUsageToken:()=>sourceToken}));
 for(const a of acts){a.save??={};a.save.dc={value:16};a.getAppliedEffectChanges=nativeAppliedEffectChanges;a.duration.getEffectData=()=>({value:60,units:"seconds"});world.set(a.uuid,a);a._prepareUsageUpdates=async cfg=>prepareEnervationUpdates(a,cfg,{actor:{},item:[],activity:{},create:[],delete:[],rolls:[]});}
 const concentration=new Effect({_id:"concentration",system:{type:"concentrating"},duration:{},flags:{}},caster);caster.effects.push(concentration);
 return {caster,target,sourceToken,targetToken,item,cast:acts[0],drain:acts[1],concentration};}
async function use(s,a=s.cast,config={spikependium:{enervationClear:true}}){const msg={data:{system:{targets:[{actor:s.target.uuid,token:s.targetToken.uuid}]}}};
 const ok=await nativeConsume.call(a,config,msg,async u=>{const deltas={actor:getDeltas(s.caster,u.actor)};await s.caster.update(u.actor);return deltas;});if(!ok)return;
 recordEnervationUsage(a,msg);recordArcanaCast(a,msg);const card=message("usage",a,msg.data);if(a===s.cast)card.system.concentration=s.concentration.id;return card;}
async function save(s,origin,total=8){const card=message("save",s.cast,{actor:s.target,token:s.targetToken,system:{ability:"dex",origin:origin.id},rolls:[new D20(total)]});await syncArcanaCast(card);return card;}
async function roll(s,origin,total=15,click=false){let result;await enervationDamage.call(origin.activity,async(_cfg,_dlg,msg)=>{result=message("damage",origin.activity,{...msg.data,rolls:[new Damage(total)]});return result.rolls;},click?{event:{target:{closest:()=>({dataset:{messageId:origin.id}})}}}:{},{},click?{}:{data:{system:{origin:origin.id}}});return result;}
async function apply(s,card,opts={}){return s.target.applyDamage([{type:"necrotic",value:card.rolls[0].total}],{originatingMessage:card,...opts});}
function next(s){game.combat.round++;game.time.worldTime+=6;game.combat.combatant={actor:s.caster,token:s.sourceToken};}

// Native effect application links exactly the failed target to the native concentration.
let s=setup(),origin=await use(s);assert.ok(enervationCastPaid(origin));
assert.deepEqual(origin.system.deltas.actor.map(d=>d.keyPath),[`flags.spikependium.enervationUses.${origin.flags.spikependium.enervationUse.event}.active`],"metadata is not refundable resources");
await save(s,origin);assert.equal(s.target.effects.length,1);assert.ok(arcanaEffectCast(s.target.effects[0]));assert.equal(s.target.effects[0].flags.dnd5e.dependentOn,s.concentration.uuid);
let card=await roll(s,origin);s.target.resist=true;await apply(s,card);await resumeEnervationHealing();assert.equal(s.caster.system.attributes.hp.value,13,"floor(floor(15/2)/2)=3");
const hp=s.target.system.attributes.hp.value;await apply(s,card);await resumeEnervationHealing();assert.equal(s.target.system.attributes.hp.value,hp);assert.equal(s.caster.system.attributes.hp.value,13);
assert.equal(await use(s,s.drain),undefined,"no bonus damage during the casting turn");next(s);let pulse=await use(s,s.drain);assert.ok(pulse);assert.equal(pulse.flags.spikependium.enervationUse.source,origin.uuid);
card=await roll(s,pulse,9,true);await apply(s,card);await resumeEnervationHealing();assert.equal(s.caster.system.attributes.hp.value,15);
game.time.worldTime++;assert.equal(await use(s,s.drain),undefined,"advancing seconds cannot allow two activations in one combat turn");
next(s);assert.ok(await use(s,s.drain));
// Success ends concentration but still heals from actual halved initial damage.
s=setup();origin=await use(s);await save(s,origin,20);assert.equal(s.caster.effects.length,0);card=await roll(s,origin,15);await apply(s,card,{multiplier:.5});await resumeEnervationHealing();assert.equal(s.caster.system.attributes.hp.value,13);assert.equal(await use(s,s.drain),undefined);
// No periodic save is invented for this tether.
s=setup();origin=await use(s);await save(s,origin);let baseCalls=0;await arcanaEndTurn.call({id:"fight",previous:{round:1,turn:0}},async()=>baseCalls++,{id:"targetTurn",actor:s.target,token:s.targetToken});assert.equal(baseCalls,1);assert.equal(origin.getAssociatedRolls("save").length,1);assert.equal(s.target.effects[0].flags.spikependium.arcanaRepeatRequest,undefined);
// Initial application requires the corresponding real DEX save; exact target and pure evaluated necrotic card.
s=setup();origin=await use(s);card=await roll(s,origin);await apply(s,card);assert.equal(s.target.system.attributes.hp.value,10);await save(s,origin);card.author={id:"intruder"};await apply(s,card);assert.equal(s.target.system.attributes.hp.value,10);card.author=gm;
card.rolls[0].options.type="fire";await apply(s,card);assert.equal(s.target.system.attributes.hp.value,10);card.rolls[0].options.type="necrotic";
const other=actor("other");await other.applyDamage([{type:"necrotic",value:15}],{originatingMessage:card});assert.equal(other.system.attributes.hp.value,10);
delete card.flags.spikependium.enervationDamage;await apply(s,card);assert.equal(s.target.system.attributes.hp.value,10);
// Native immunity, vulnerability, damage threshold, temp HP, overkill and maximum healing.
for(const [mode,heal] of [["immune",0],["vulnerable",15],["threshold",0],["temp",7],["overkill",7],["cap",1]]){
 s=setup();origin=await use(s);await save(s,origin);card=await roll(s,origin,15);
 if(mode==="threshold")s.target.system.attributes.hp.dt=20;else if(mode==="temp")s.target.system.attributes.hp.temp=20;else if(mode==="overkill")s.target.system.attributes.hp.value=1;else if(mode==="cap"){s.caster.system.attributes.hp.value=99;s.caster.system.attributes.hp.damage=1;}else s.target[mode]=true;
 const before=s.caster.system.attributes.hp.value;await apply(s,card);await resumeEnervationHealing();assert.equal(s.caster.system.attributes.hp.value,before+heal,mode);
}
// Cancellation and failed writes cannot issue phantom HP; retries do not heal twice.
s=setup();cancelPayment=true;assert.equal(await use(s),undefined);assert.equal(s.caster.flags.spikependium,undefined);cancelPayment=false;
origin=await use(s);await save(s,origin);card=await roll(s,origin);cancelHP=true;await apply(s,card);await resumeEnervationHealing();assert.equal(s.caster.system.attributes.hp.value,10);cancelHP=false;
s.target.fail=true;await assert.rejects(()=>apply(s,card));assert.equal(s.target.flags.spikependium,undefined);await apply(s,card);s.caster.fail=true;await assert.rejects(()=>resumeEnervationHealing());await resumeEnervationHealing();assert.equal(s.caster.system.attributes.hp.value,17);
s=setup();origin=await use(s);await save(s,origin);card=await roll(s,origin);await apply(s,card);s.target.failAck=true;await assert.rejects(()=>resumeEnervationHealing());await resumeEnervationHealing();assert.equal(s.caster.system.attributes.hp.value,17);
s=setup();origin=await use(s);await save(s,origin);card=await roll(s,origin);await Promise.all([apply(s,card),apply(s,card)]);await resumeEnervationHealing();assert.equal(s.caster.system.attributes.hp.value,17);assert.equal(s.target.system.attributes.hp.value,0);
// A blocked heal does not become delayed healing when the prohibition later disappears.
s=setup();origin=await use(s);await save(s,origin);card=await roll(s,origin);await apply(s,card);blockHeal=true;await resumeEnervationHealing();blockHeal=false;await resumeEnervationHealing();assert.equal(s.caster.system.attributes.hp.value,10);
s=setup();origin=await use(s);await save(s,origin);card=await roll(s,origin);await apply(s,card);s.caster.statuses.add("dead");await resumeEnervationHealing();assert.equal(s.caster.system.attributes.hp.value,10);
// Wrong/changed targets, cover confirmation, another token/turn, expired concentration, height, scene loss and refunds.
s=setup();assert.equal(await use(s,s.cast,{}),undefined);s.targetToken.x=61;assert.equal(await use(s),undefined);s.targetToken.x=0;s.targetToken.elevation=61;assert.equal(await use(s),undefined);
s=setup();origin=await use(s);await save(s,origin);next(s);game.combat.combatant.actor=s.target;assert.equal(await use(s,s.drain),undefined);game.combat.combatant.actor=s.caster;
s.targetToken.x=61;await cleanEnervation();assert.equal(s.caster.effects.length,0);s.targetToken.x=60;assert.equal(await use(s,s.drain),undefined,"returning within range cannot restore concentration");
s=setup();origin=await use(s);await save(s,origin);world.delete(s.sourceToken.uuid);await cleanEnervation();assert.equal(s.caster.effects.length,0);
s=setup();origin=await use(s);await save(s,origin);game.time.worldTime+=60;await cleanEnervation();assert.equal(s.caster.effects.length,0);
s=setup();origin=await use(s);await save(s,origin);const forged=message("usage",s.cast,{author:{id:"intruder"},system:clone(origin.system),flags:clone(origin.flags)});forged.flags.spikependium.enervationUse.token="Scene.other.Token.missing";await cleanEnervation();assert.equal(s.caster.effects.length,1,"unpaid forged cards cannot end another caster's concentration");
forged.flags.spikependium.enervationUse.stage=null;assert.equal(enervationCastPaid(forged),false);delete forged.flags.spikependium.enervationUse.frame;await cleanEnervation();assert.equal(s.caster.effects.length,1);
s=setup();origin=await use(s);await save(s,origin);card=await roll(s,origin);await nativeRefund.call(s.cast,origin.system.deltas,async u=>s.caster.update(u.actor));assert.equal(enervationCastPaid(origin),false);await apply(s,card);assert.equal(s.target.system.attributes.hp.value,10);await cleanEnervation();assert.equal(s.caster.effects.length,0);
s=setup();origin=await use(s);await save(s,origin);next(s);pulse=await use(s,s.drain);await nativeRefund.call(s.drain,pulse.system.deltas,async u=>s.caster.update(u.actor));assert.ok(await use(s,s.drain),"refunded bonus activation can be used anew");
s=setup();origin=await use(s);await save(s,origin);next(s);pulse=await use(s,s.drain);card=await roll(s,pulse);await s.concentration.delete();await apply(s,card);assert.equal(s.target.system.attributes.hp.value,10,"a delayed bonus damage card needs the original live concentration");
s=setup();origin=await use(s);await save(s,origin);next(s);const otherToken={...s.targetToken,uuid:"Scene.test.Token.other"};world.set(otherToken.uuid,otherToken);game.user.targets=new Set([otherToken]);assert.equal(await use(s,s.drain),undefined,"another token for the same actor cannot replace the bound target");
s=setup();s.sourceToken.parent.grid.units="m";s.targetToken.x=18.288;dnd5e.utils.convertLength=(n,from)=>from==="m"?n/0.3048:n;assert.ok(await use(s));s.targetToken.x=18.6;assert.equal(await use(s),undefined);dnd5e.utils.convertLength=n=>n;
// Native button privacy and no-guess provenance; plain inventory damage has no cast receipt.
s=setup();origin=await use(s);origin.whisper=["gm"];origin.blind=true;card=await roll(s,origin,15,true);assert.deepEqual(card.whisper,["gm"]);assert.equal(card.blind,true);assert.equal((await enervationDamage.call(s.cast,()=>{throw Error("must not roll");})),undefined);
// Outside combat the table advances time; casts on an earlier creature's turn permit the next own turn in the same round.
s=setup();game.combat.turn=0;game.combat.combatant.actor=s.target;origin=await use(s);await save(s,origin);game.combat.turn=1;game.combat.combatant.actor=s.caster;assert.ok(await use(s,s.drain));
s=setup();game.combat=null;origin=await use(s);await save(s,origin);assert.equal(await use(s,s.drain),undefined);game.time.worldTime+=6;assert.ok(await use(s,s.drain));assert.equal(await use(s,s.drain),undefined);
// Dialog retains native consumption fields and asks the one condition geometry cannot determine.
s=setup();class Base{async _prepareConsumptionContext(){return{fields:[],inputs:{createCheckboxInput(){}}};}}
const dialog={applicationClass:Base},msg={};prepareEnervationDialog(s.cast,{},dialog,msg);const window=new dialog.applicationClass();window.config={};const context=await window._prepareConsumptionContext({},{});assert.equal(context.fields.length,1);assert.equal(context.fields[0].name,"spikependium.enervationClear");assert.equal(msg.hasConsumption,true);
console.log("Enervation: native consume/refund and effect dependence, DEX success/failure, subsequent own turns, pure source-bound necrotic damage, native reductions/rounding/threshold/temp HP/overkill, atomic heal recovery, duplicates and privacy passed.");
