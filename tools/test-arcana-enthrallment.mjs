import assert from "node:assert/strict";
import fs from "node:fs";
import {prepareEnthrallment,captureEnthrallment,prepareEnthrallmentUpdates,recordEnthrallmentConsumption,recordEnthrallmentUsage,
 enthrallmentCastPaid,enthrallmentImmune,syncEnthrallmentSave,guardEnthrallmentDamage,enthrallmentEndTurn,resumeEnthrallment} from "../scripts/arcana-enthrallment.mjs";
import {recordArcanaCast,syncArcanaCast,arcanaEffectCast,arcanaEndTurn,arcanaSpellSuppression} from "../scripts/arcana-spells.mjs";
import {nativeApplyDamage,nativeCalculateDamage} from "./data/dnd5e-guardian-native.mjs";
import {nativeConsume,nativeRefund,getDeltas} from "./data/dnd5e-reaction-native.mjs";
import {prepareEffectData} from "./data/dnd5e-effect-application.mjs";
import {nativeAppliedEffectChanges} from "./data/dnd5e-arcana-native.mjs";
const read=pack=>fs.readdirSync(`packs/_source/${pack}`).map(f=>JSON.parse(fs.readFileSync(`packs/_source/${pack}/${f}`,"utf8")));
const doc=read("spells").find(d=>d.flags?.spikependium?.key==="spell:au-enthrallment");assert.ok(doc);
assert.equal(doc.name,"Заворожение");assert.equal(doc.system.source.page,"40");assert.equal(doc.system.level,7);assert.equal(doc.system.school,"enc");
assert.equal(doc.system.range.units,"self");assert.ok(doc.system.properties.includes("concentration"));assert.equal(doc.system.duration.value,"1");
const [initial,select,tick]=Object.values(doc.system.activities);
assert.deepEqual(initial.save.ability,["cha"]);assert.deepEqual(select.save.ability,["cha"]);assert.equal(initial.range.value,"60");
assert.equal(select.consumption.spellSlot,false);assert.equal(select.activation.type,"action");assert.equal(select.duration.concentration,false);
assert.equal(tick.damage.parts[0].number,4);assert.equal(tick.damage.parts[0].denomination,8);assert.equal(tick.damage.parts[0].scaling.number,1);
assert.equal(tick.consumption.spellSlot,false);assert.deepEqual(doc.effects[0].statuses,["charmed","incapacitated"]);
assert.ok(doc.system.description.value.includes("[[/damage 4d8 type=psychic]]"));
const lists=read("rules").find(d=>d.flags?.spikependium?.key==="journal:au-spell-lists");
assert.deepEqual(lists.pages.filter(p=>p.system.spells.includes(`Compendium.spikependium.spells.Item.${doc._id}`)).map(p=>p.system.identifier).sort(),["bard","warlock","wizard"]);
const clone=structuredClone,get=(o,p)=>p.split(".").reduce((v,k)=>v?.[k],o),set=(o,p,v)=>{const ks=p.split("."),k=ks.pop();ks.reduce((v,k)=>v[k]??={},o)[k]=v;};
const merge=(a,b)=>{for(const[k,v]of Object.entries(b)){if(k.includes("."))set(a,k,clone(v));else if(v&&Object.getPrototypeOf(v)===Object.prototype)merge(a[k]??={},v);else a[k]=clone(v);}return a;};
const flat=(o,p="",r={})=>{for(const[k,v]of Object.entries(o)){const key=p?`${p}.${k}`:k;if(v&&Object.getPrototypeOf(v)===Object.prototype)flat(v,key,r);else r[key]=v;}return r;};
const list=a=>Object.assign(a,{get(id){return this.find(v=>v.id===id);}});
let serial=0,world,cancelPayment=false,cancelHP=false,failRoll=false,failChat=false,notices=[],rolled=[];
const gm={id:"gm",isGM:true,isActiveGM:true,active:true};
globalThis.fromUuidSync=uuid=>world.get(uuid);
globalThis.foundry={utils:{getProperty:get,setProperty:set,mergeObject:merge,deepClone:clone,flattenObject:flat,isEmpty:o=>!o||!Object.keys(o).length,randomID:()=>String(++serial).padStart(16,"0")},data:{fields:{BooleanField:class{constructor(o){Object.assign(this,o);}}}}};
globalThis.ui={notifications:{warn:m=>notices.push(m),error:m=>notices.push(m)}};
globalThis.ChatMessage={getSpeaker:({actor})=>({actor:actor.id})};
class D20{constructor(total,dc=16){this.total=total;this.options={target:dc};this._evaluated=true;}get isFailure(){return this.total<this.options.target;}}
class Damage{constructor(total,type="psychic"){this.total=total;this.options={type};this._evaluated=true;}}
globalThis.CONFIG={Dice:{D20Roll:D20,DamageRoll:Damage},DND5E:{damageTypes:{psychic:{}},healingTypes:{healing:{},temphp:{}}}};
Math.clamp=(v,min,max)=>Math.min(max,Math.max(min,v));Number.isNumeric=n=>typeof n==="number"&&Number.isFinite(n);globalThis.simplifyBonus=n=>Number(n)||0;
globalThis.Hooks={call(h,...args){if(h==="dnd5e.preActivityConsumption")return captureEnthrallment(...args);if(h==="dnd5e.activityConsumption"&&cancelPayment)return false;
 if(h==="dnd5e.postActivityConsumption")recordEnthrallmentConsumption(...args);if(h==="dnd5e.preApplyDamage")return guardEnthrallmentDamage(...args);if(h==="modifyTokenAttribute"&&cancelHP)return false;return true;},callAll(){}};
class Effect{
 constructor(data,parent){Object.assign(this,clone(data));this.id=data._id??`effect${++serial}`;this.uuid=`${parent.uuid}.ActiveEffect.${this.id}`;this.parent=parent;this.actor=parent.actor??parent;
 this.flags??={};this.system??={};this.duration??={};this.statuses=new Set(data.statuses??[]);this._stats??={};world.set(this.uuid,this);}
 get active(){return !this.disabled&&!this.duration.expired&&!arcanaSpellSuppression.call(this,()=>false);}
 toObject(){return {_id:this.id,name:this.name,flags:clone(this.flags),system:clone(this.system),duration:clone(this.duration),statuses:[...this.statuses]};}
 static getEffectStart(){return {time:game.time.worldTime};}static forApplication(c){return c;}
 async setFlag(scope,key,v){if(this.failAck&&v.pending===false){this.failAck=false;throw Error("effect ack failed");}set(this.flags,`${scope}.${key}`,clone(v));}
 async delete(){this.actor.effects.splice(this.actor.effects.indexOf(this),1);world.delete(this.uuid);}
}
globalThis.ActiveEffect={implementation:Effect};
globalThis.dnd5e={utils:{convertLength:n=>n},applications:{components:{EffectApplicationElement:class{async _prepareEffectData(e,a){return prepareEffectData.call(this,e,a,x=>x);}}}}};
function actor(id){const a={id,uuid:`Actor.${id}`,documentName:"Actor",flags:{},effects:list([]),items:list([]),isOwner:true,statuses:new Set(),testUserPermission:u=>u?.isGM||u?.id==="owner",
 system:{isCreature:true,attributes:{hp:{value:60,max:100,damage:40,temp:0,tempmax:0}},_source:{attributes:{hp:{tempmax:0}}},traits:{ci:{value:new Set()}}},getRollData:()=>({}),changeIsIgnored:()=>false};
 a.changeHasEffect=(kind,d)=>d.type==="psychic"&&(kind==="immunity"&&a.immune||kind==="resistance"&&a.resist);
 a.calculateDamage=(d,o)=>nativeCalculateDamage.call(a,d,o);a.applyDamage=(d,o)=>nativeApplyDamage.call(a,d,o);
 a.update=async u=>{if(a.fail){a.fail=false;throw Error("HP write failed");}merge(a,u);a.system.attributes.hp.damage=a.system.attributes.hp.max-a.system.attributes.hp.value;return a;};
 a.createEmbeddedDocuments=async(_type,rows)=>rows.map(d=>{const e=new Effect(d,a);a.effects.push(e);return e;});
 a.updateEmbeddedDocuments=async(_type,rows)=>rows.map(d=>{const e=a.effects.get(d._id);merge(e,d);return e;});
 a.deleteEmbeddedDocuments=async(_type,ids)=>{for(const e of [...a.effects])if(ids.includes(e.id))await e.delete();};
 game.actors.push(a);world.set(a.uuid,a);return a;}
function message(type,a,data={}){const id=`message${++serial}`,m={id,uuid:`ChatMessage.${id}`,timestamp:serial,type,activity:a,author:gm,flags:{},system:{},rolls:[],whisper:[],...data,
 getAssociatedActivity(){return this.activity;},getAssociatedActor(){return this.actor??this.activity.actor;},getAssociatedItem(){return this.activity.item;},getAssociatedToken(){return this.token;},
 getOriginatingMessage(){return game.messages.get(this.system.origin);},getAssociatedRolls(kind){return game.messages.filter(c=>c.type===kind&&c.system.origin===this.id);},async setFlag(scope,key,v){set(this.flags,`${scope}.${key}`,v);}};
 world.set(m.uuid,m);game.messages.push(m);return m;}
function setup(level=7){world=new Map();cancelPayment=cancelHP=failRoll=failChat=false;notices=[];rolled=[];
 globalThis.game={user:gm,users:list([gm]),actors:[],scenes:[],messages:list([]),time:{worldTime:100},combat:{id:"fight",uuid:"Combat.fight",started:true,round:1,turn:0,previous:{round:1,turn:0}}};game.users.activeGM=gm;world.set(game.combat.uuid,game.combat);
 const caster=actor("caster"),target=actor("target"),other=actor("other");const scene={grid:{units:"ft",getCenterPoint:o=>({x:o.x,y:0}),measurePath:([a,b])=>({distance:Math.hypot(a.x-b.x,a.elevation-b.elevation)})},tokens:list([])};
 const token=(name,actor,x)=>{const t={uuid:`Scene.test.Token.${name}`,actor,parent:scene,x,elevation:0,name,texture:{src:"icon"},getOccupiedGridSpaceOffsets(){return[{x:this.x}];}};world.set(t.uuid,t);scene.tokens.push(t);return t;};
 const sourceToken=token("caster",caster,0),targetToken=token("target",target,5),otherToken=token("other",other,50);game.scenes.push(scene);game.user.targets=new Set([targetToken]);game.combat.combatant={actor:caster,token:sourceToken};
 const item=clone(doc);item.id=item._id;item.uuid=`${caster.uuid}.Item.${item.id}`;item.actor=caster;item._source={system:{level:7}};item.system.level=level;item.toObject=()=>clone(doc);item.effects=list(doc.effects.map(d=>new Effect(d,item)));world.set(item.uuid,item);caster.items.push(item);
 const acts=Object.values(doc.system.activities).map(d=>({...clone(d),uuid:`${item.uuid}.Activity.${d._id}`,actor:caster,item,applicableEffects:item.effects,getUsageToken:()=>sourceToken}));item.system.activities=list(acts);
 for(const a of acts){if(a.type==="save"){a.save.dc={value:16};a.getAppliedEffectChanges=nativeAppliedEffectChanges;a.duration.getEffectData=()=>({value:60,units:"seconds"});}
  world.set(a.uuid,a);a._prepareUsageUpdates=async cfg=>prepareEnthrallmentUpdates(a,cfg,{actor:{},item:[],activity:{},create:[],delete:[],rolls:[]});}
 acts[2].rollDamage=async(config,dialog,msg)=>{rolled.push({config:clone(config),dialog:clone(dialog),mode:msg.rollMode});if(failRoll)throw Error("damage roll failed");if(failChat)return;
  return [message("damage",acts[2],{...msg.data,rolls:[new Damage((4+config.scaling)*3)]})];};
 const concentration=new Effect({_id:"concentration",system:{type:"concentrating"},duration:{},flags:{}},caster);caster.effects.push(concentration);
 return {caster,target,other,sourceToken,targetToken,otherToken,item,cast:acts[0],select:acts[1],damage:acts[2],concentration};}
async function use(s,a=s.cast,config={spikependium:{enthrallmentVisible:true}}){const t=[...game.user.targets][0],msg={data:{system:{targets:t?[{actor:t.actor.uuid,token:t.uuid}]:[]}}};
 const ok=await nativeConsume.call(a,config,msg,async u=>{const deltas={actor:getDeltas(s.caster,u.actor)};await s.caster.update(u.actor);return deltas;});if(!ok)return;
 recordEnthrallmentUsage(a,msg);recordArcanaCast(a,msg);const card=message("usage",a,msg.data);if(a===s.cast)card.system.concentration=s.concentration.id;return card;}
async function save(s,origin,total=8,extra={}){const t=world.get(origin.system.targets[0].token),card=message("save",origin.activity,{actor:t.actor,token:t,system:{ability:"cha",origin:origin.id},rolls:[new D20(total)],...extra});await syncEnthrallmentSave(card);await syncArcanaCast(card);return card;}
function next(s){game.combat.round++;game.time.worldTime+=6;game.combat.combatant={actor:s.caster,token:s.sourceToken};}
async function end(s,token=s.targetToken){const c=game.combat;c.previous={round:c.round,turn:c.turn};return enthrallmentEndTurn.call(c,async()=>"native",{id:token.name,actor:token.actor,token});}
const dot=()=>game.messages.filter(m=>m.type==="damage").at(-1);

// Native consumption delta and native effect-application dependency; both conditions belong to the paid target.
let s=setup(),origin=await use(s);assert.ok(enthrallmentCastPaid(origin));assert.equal(origin.system.deltas.actor.length,1);
assert.match(origin.system.deltas.actor[0].keyPath,/\.active$/);await save(s,origin);assert.equal(s.target.effects.length,1);assert.ok(arcanaEffectCast(s.target.effects[0]));
assert.deepEqual([...s.target.effects[0].statuses],["charmed","incapacitated"]);assert.equal(s.target.effects[0].flags.dnd5e.dependentOn,s.concentration.uuid);
assert.equal(await end(s),"native");assert.equal(s.target.system.attributes.hp.value,48);assert.equal(rolled.length,1);assert.equal(rolled[0].config.isCritical,false);
await end(s);await resumeEnthrallment();assert.equal(s.target.system.attributes.hp.value,48,"one end-turn cannot apply damage twice");
const card=dot();await s.target.applyDamage([{type:"psychic",value:12}],{originatingMessage:card});assert.equal(s.target.system.attributes.hp.value,48);
// Initial success preserves concentration, but blocks this creature for this cast even after message deletion.
s=setup();origin=await use(s);const success=await save(s,origin,20);assert.ok(enthrallmentImmune(origin));assert.equal(s.target.effects.length,0);assert.equal(s.caster.effects.length,1);
game.messages.splice(game.messages.indexOf(success),1);next(s);assert.equal(await use(s,s.select),undefined);
// Each subsequent own turn chooses a different creature without another spell slot or ending older targets.
s=setup();origin=await use(s);await save(s,origin);game.user.targets=new Set([s.otherToken]);assert.equal(await use(s,s.select),undefined);next(s);
let selection=await use(s,s.select);assert.ok(selection);assert.equal(selection.system.concentration,origin.system.concentration);assert.equal(selection.flags.spikependium.enthrallmentUse.source,origin.uuid);
await save(s,selection);assert.equal(s.other.effects.length,1);assert.equal(s.target.effects.length,1);assert.equal(await use(s,s.select),undefined);
next(s);game.user.targets=new Set([s.targetToken]);assert.equal(await use(s,s.select),undefined,"already enthralled creature is not a new target");
// A hazard save uses its own original card. Success is remembered and cannot be undone by an older failed roll.
await save(s,origin,20);assert.equal(s.target.effects.length,0);assert.equal(s.other.effects.length,1);assert.equal(await use(s,s.select),undefined);
await save(s,origin,8);assert.equal(s.target.effects.length,0);assert.ok(enthrallmentImmune(origin));
s=setup(9);origin=await use(s);await save(s,origin);next(s);game.user.targets=new Set([s.otherToken]);selection=await use(s,s.select);assert.equal(selection.system.scaling,2);assert.equal(selection.flags.spikependium.arcanaCast.level,9);await save(s,selection);s.otherToken.x=5;await end(s,s.otherToken);assert.equal(rolled[0].config.scaling,2);assert.equal(s.other.system.attributes.hp.value,42);
// Charm immunity; no automatic end-turn CHA save is invented.
s=setup();s.target.system.traits.ci.value.add("charmed");origin=await use(s);await save(s,origin);assert.equal(s.target.effects.length,0);await end(s);assert.equal(rolled.length,0);
s=setup();origin=await use(s);await save(s,origin);let calls=0;await arcanaEndTurn.call({id:"fight",previous:{round:1,turn:0}},async()=>calls++,{actor:s.target,token:s.targetToken});assert.equal(calls,1);assert.equal(origin.getAssociatedRolls("save").length,1);
// Actual native resistance/immunity/threshold/temp HP and slot-scaled damage configuration.
for(const [mode,level,loss]of[["plain",7,12],["plain",8,15],["plain",9,18],["resist",7,6],["immune",7,0],["threshold",7,0],["temp",7,0]]){
 s=setup(level);origin=await use(s);await save(s,origin);if(mode==="threshold")s.target.system.attributes.hp.dt=20;else if(mode==="temp")s.target.system.attributes.hp.temp=20;else s.target[mode]=true;
 await end(s);assert.equal(s.target.system.attributes.hp.value,60-loss,`${mode}/${level}`);assert.equal(rolled[0].config.scaling,level-7);
}
// No movement/visibility/range-60 condition is invented after application; only distance 5 at end matters.
s=setup();origin=await use(s);await save(s,origin);s.targetToken.x=6;await end(s);assert.equal(rolled.length,0);s.targetToken.x=0;s.targetToken.elevation=6;game.combat.turn++;await end(s);assert.equal(rolled.length,0);
s.targetToken.elevation=0;s.targetToken.x=5;game.combat.turn++;await end(s);assert.equal(rolled.length,1);
s=setup();origin=await use(s);await save(s,origin);const duplicate={...s.targetToken,uuid:"Scene.test.Token.duplicate"};world.set(duplicate.uuid,duplicate);await end(s,duplicate);assert.equal(rolled.length,0);
s=setup();origin=await use(s);await save(s,origin);world.delete(s.sourceToken.uuid);await end(s);assert.equal(rolled.length,0);
s=setup();origin=await use(s);await save(s,origin);await s.concentration.delete();await end(s);assert.equal(rolled.length,0);
// Native refunds stop old actions/effects. A refunded selection leaves older paid targets intact.
s=setup();origin=await use(s);await save(s,origin);next(s);game.user.targets=new Set([s.otherToken]);selection=await use(s,s.select);await save(s,selection);
await nativeRefund.call(s.select,selection.system.deltas,async u=>s.caster.update(u.actor));assert.equal(enthrallmentCastPaid(selection),false);assert.equal(s.other.effects[0].active,false);assert.equal(s.target.effects[0].active,true);
await nativeRefund.call(s.cast,origin.system.deltas,async u=>s.caster.update(u.actor));await resumeEnthrallment();assert.equal(s.caster.effects.length,0);assert.equal(s.target.effects[0].active,false);
// Failed native HP update retries the saved roll; acknowledgement failure cannot reapply damage.
s=setup();origin=await use(s);await save(s,origin);s.target.fail=true;const oldError=console.error;console.error=()=>{};try{await end(s);}finally{console.error=oldError;}assert.equal(s.target.system.attributes.hp.value,60);assert.equal(rolled.length,1);await resumeEnthrallment();assert.equal(s.target.system.attributes.hp.value,48);assert.equal(rolled.length,1);
s=setup();origin=await use(s);await save(s,origin);s.target.effects[0].failAck=true;console.error=()=>{};try{await end(s);}finally{console.error=oldError;}assert.equal(s.target.system.attributes.hp.value,48);await resumeEnthrallment();assert.equal(s.target.system.attributes.hp.value,48);
// An unsaved roll is never rolled again; a pending old end-turn never deals late damage automatically.
s=setup();origin=await use(s);await save(s,origin);failChat=true;await end(s);failChat=false;await resumeEnthrallment();assert.equal(rolled.length,1);assert.equal(s.target.system.attributes.hp.value,60);assert.ok(notices.some(n=>n.includes("не сохранён")));
s=setup();origin=await use(s);await save(s,origin);s.target.fail=true;console.error=()=>{};try{await end(s);}finally{console.error=oldError;}game.combat.previous.turn++;await resumeEnthrallment();assert.equal(s.target.system.attributes.hp.value,60);assert.equal(s.target.effects[0].flags.spikependium.enthrallmentTick.manual,true);
// Hidden/private casts preserve audience; invalid/non-GM/manual card applications cannot masquerade as a tick.
s=setup();origin=await use(s);await save(s,origin);origin.whisper=["gm"];origin.blind=true;await end(s);assert.equal(rolled[0].mode,"blind");assert.deepEqual(dot().whisper,["gm"]);assert.equal(dot().blind,true);
const bad=message("damage",s.damage,{rolls:[new Damage(20)]});await s.target.applyDamage([{type:"psychic",value:20}],{originatingMessage:bad});assert.equal(s.target.system.attributes.hp.value,48);
s=setup();origin=await use(s);await save(s,origin);game.user={id:"owner",isGM:false};await end(s);assert.equal(rolled.length,0);game.user=gm;
s=setup();cancelPayment=true;assert.equal(await use(s),undefined);assert.equal(s.caster.flags.spikependium,undefined);
s=setup();assert.equal(await use(s,s.cast,{}),undefined);s.targetToken.x=61;assert.equal(await use(s),undefined);s.targetToken.x=5;s.targetToken.elevation=61;assert.equal(await use(s),undefined);
s=setup();origin=await use(s);await save(s,origin);game.time.worldTime+=60;await resumeEnthrallment();assert.equal(s.caster.effects.length,0);
// A forged card cannot end an unrelated native concentration during cleanup.
s=setup();origin=await use(s);await save(s,origin);const forged=message("usage",s.cast,{author:{id:"intruder"},system:clone(origin.system),flags:clone(origin.flags)});forged.flags.spikependium.enthrallmentUse.event="invalid";await resumeEnthrallment();assert.equal(s.caster.effects.length,1);
// Native action dialog; helper damage is not a freely repeatable inventory action.
s=setup();class Base{async _prepareConsumptionContext(){return{fields:[],inputs:{createCheckboxInput(){}}};}}
const dialog={applicationClass:Base},msg={};prepareEnthrallment(s.cast,{},dialog,msg);const window=new dialog.applicationClass();window.config={};assert.equal((await window._prepareConsumptionContext({},{})).fields[0].name,"spikependium.enthrallmentVisible");assert.equal(msg.hasConsumption,true);assert.equal(prepareEnthrallment(s.damage,{},dialog,{}),false);
console.log("Enthrallment: native payment/refund and dependent conditions, target selection and per-cast save immunity, end-turn damage/range/height/exact tokens, slot scaling, native reductions, saved-roll recovery, no replay/late/unsaved rerolls, audience and forged-card guards passed.");
