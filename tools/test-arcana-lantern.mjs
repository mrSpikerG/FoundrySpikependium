import fs from "node:fs";
import assert from "node:assert/strict";
import {captureLantern,prepareLanternDialog,prepareLanternUpdates,recordLanternConsumption,recordLanternUsage,lanternCastPaid,recordLanternDeath,
 lanternUse,lanternConsume,endDeletedLantern,syncLanterns,refundLantern,lanternRollDamage,guardLanternApplication,lanternGuardSuppression,syncLanternGuard,resumeLanternGuards,
 lanternStartTurn,prepareLanternAttack,buildLanternAttack,finalizeLanternAttack} from "../scripts/arcana-lantern.mjs";
import {recordArcanaCast,syncArcanaCast,arcanaSpellSuppression} from "../scripts/arcana-spells.mjs";
import {serializeEnervationDamage} from "../scripts/arcana-enervation.mjs";
import {arcanaStageLinkedActivity} from "../scripts/arcana-stages.mjs";
import {nativeConsume,nativeRefund,getDeltas} from "./data/dnd5e-reaction-native.mjs";
import {nativeUsesConsumption,nativeUsageConfig,nativeUsageUpdates} from "./data/dnd5e-monsters-native.mjs";
import {nativeApplyDamage,nativeCalculateDamage} from "./data/dnd5e-guardian-native.mjs";
import {prepareEffectData} from "./data/dnd5e-effect-application.mjs";
import {nativeAppliedEffectChanges,nativeLanternExpiry,nativeD20ConfigureModifiers} from "./data/dnd5e-arcana-native.mjs";
import {radiantLightUpdate} from "../scripts/mechanics.mjs";
const read=p=>fs.readdirSync(`packs/_source/${p}`).map(f=>JSON.parse(fs.readFileSync(`packs/_source/${p}/${f}`,"utf8")));
const doc=read("spells").find(d=>d.flags?.spikependium?.key==="spell:au-spirit-lantern");assert.ok(doc);
assert.equal(doc.name,"Фонарь духов");assert.equal(doc.system.source.page,"45");assert.equal(doc.system.level,5);assert.equal(doc.system.school,"nec");
assert.equal(doc.system.duration.value,"10");assert.ok(!doc.system.properties.includes("concentration"));assert.equal(doc.system.materials.consumed,false);
assert.equal(doc.system.uses.max,"0");assert.equal(doc.system.uses.spent,0);assert.deepEqual(doc.system.uses.recovery,[]);
const by=Object.fromEntries(Object.values(doc.system.activities).map(a=>[a.flags.spikependium.lanternStage,a]));
for(const stage of ["collect","end"]){assert.equal(by[stage].activation.type,"");assert.equal(by[stage].activation.override,true);}
for(const stage of ["collect","drain","restore","protect","end"]){assert.equal(by[stage].duration.units,"inst");assert.equal(by[stage].duration.override,true);}
for(const stage of ["drain","restore","protect"]){assert.equal(by[stage].activation.type,"bonus");assert.equal(by[stage].consumption.spellSlot,false);assert.equal(by[stage].consumption.targets[0].type,"itemUses");}
assert.deepEqual(by.drain.save.ability,["con"]);assert.equal(by.drain.damage.onSave,"half");assert.equal(by.drain.damage.parts[0].number,4);assert.equal(by.drain.damage.parts[0].bonus,"@mod");
assert.equal(by.restore.healing.number,4);assert.deepEqual(by.restore.healing.types,["healing"]);assert.equal(by.restore.healing.bonus,"@mod");
const guard=doc.effects.find(e=>e.flags.spikependium?.lanternGuardProfile);assert.equal(guard.duration.expiry,"sourceStart");assert.deepEqual(guard.statuses,[]);assert.deepEqual(guard.system.changes,[]);
const lists=read("rules").find(d=>d.flags?.spikependium?.key==="journal:au-spell-lists");assert.deepEqual(lists.pages.filter(p=>p.system.spells.includes(`Compendium.spikependium.spells.Item.${doc._id}`)).map(p=>p.system.identifier).sort(),["artificer","cleric","warlock","wizard"]);
const clone=structuredClone,get=(o,p)=>p.split(".").reduce((v,k)=>v?.[k],o),set=(o,p,v)=>{const ks=p.split("."),k=ks.pop(),parent=ks.reduce((v,k)=>v[k]??={},o);if(k.startsWith("-="))delete parent[k.slice(2)];else parent[k]=v;};
const merge=(a,b)=>{for(const[k,v]of Object.entries(b)){if(k.includes("."))set(a,k,clone(v));else if(v&&Object.getPrototypeOf(v)===Object.prototype)merge(a[k]??={},v);else a[k]=clone(v);}return a;};
const flat=(o,p="",r={})=>{for(const[k,v]of Object.entries(o)){const key=p?`${p}.${k}`:k;if(v&&Object.getPrototypeOf(v)===Object.prototype)flat(v,key,r);else r[key]=v;}return r;};
const list=a=>Object.assign(a,{get(id){return this.find(v=>v.id===id);}});
let world,serial=0,notices=[],cancelPay=false,cancelHP=false;
const gm={id:"gm",active:true,isGM:true,isActiveGM:true};
globalThis.fromUuidSync=uuid=>world.get(uuid);
globalThis.foundry={utils:{getProperty:get,setProperty:set,mergeObject:merge,deepClone:clone,flattenObject:flat,getType:o=>Array.isArray(o)?"Array":o&&typeof o==="object"?"Object":typeof o,isEmpty:o=>!o||!Object.keys(o).length,randomID:()=>String(++serial).padStart(16,"0")},data:{fields:{BooleanField:class{constructor(o){Object.assign(this,o);}}}}};
globalThis.ui={notifications:{warn:m=>notices.push(m),error:m=>notices.push(m)}};
class D20{static ADV_MODE={NORMAL:0,ADVANTAGE:1,DISADVANTAGE:-1};constructor(options={}){this.options=options;this.validD20Roll=true;this.d20={applyAdvantage:m=>this.mode=m,applyFlag(){},applyRange(){},options:{},modifiers:[]};}resetFormula(){}}
class Damage{constructor(total,type){this.total=total;this.options={type};this._evaluated=true;}}
globalThis.CONFIG={Dice:{D20Roll:D20,DamageRoll:Damage},DND5E:{movementUnits:{ft:{},m:{}},damageTypes:{necrotic:{}},healingTypes:{healing:{},temphp:{}}}};
Math.clamp=(v,min,max)=>Math.min(max,Math.max(min,v));Number.isNumeric=n=>typeof n==="number"&&Number.isFinite(n);globalThis.simplifyBonus=n=>Number(n)||0;
globalThis.Hooks={call(h,...args){if(h==="dnd5e.preActivityConsumption")return captureLantern(...args);if(h==="dnd5e.activityConsumption"&&cancelPay)return false;if(h==="dnd5e.postActivityConsumption")recordLanternConsumption(...args);if(h==="dnd5e.preApplyDamage")return guardLanternApplication(...args);if(h==="modifyTokenAttribute"&&cancelHP)return false;return true;},callAll(){}};
class Effect{
 constructor(data,parent){Object.assign(this,clone(data));this.id=data._id??`effect${++serial}`;this.uuid=`${parent.uuid}.ActiveEffect.${this.id}`;this.parent=parent;this.actor=parent.actor??parent;this.flags??={};this.system??={};this.duration??={};this.start??={};this.statuses=new Set(data.statuses??[]);this._stats??={};world.set(this.uuid,this);}
 get active(){return !this.disabled&&!this.duration.expired&&!arcanaSpellSuppression.call(this,()=>lanternGuardSuppression.call(this,()=>false));}
 toObject(){return {_id:this.id,name:this.name,flags:clone(this.flags),system:clone(this.system),duration:clone(this.duration),statuses:[...this.statuses]};}
 static getEffectStart(){return {time:game.time.worldTime,combat:game.combat?.uuid??null,round:game.combat?.round??null,turn:game.combat?.turn??null};}static forApplication(c){return c;}
 updateSource(u){merge(this,u);}
 async update(u){merge(this,u);this.actor.reset();}
 async delete(){this.actor.effects.splice(this.actor.effects.indexOf(this),1);world.delete(this.uuid);this.actor.reset();}
}
globalThis.ActiveEffect={implementation:Effect};
globalThis.dnd5e={utils:{convertLength:(n,from,to)=>from===to?n:from==="ft"?n*.3048:n/.3048},applications:{components:{EffectApplicationElement:class{async _prepareEffectData(e,a){return prepareEffectData.call(this,e,a,x=>x);}}}}};
function actor(id,type="humanoid"){const a={id,uuid:`Actor.${id}`,documentName:"Actor",flags:{},effects:list([]),items:list([]),statuses:new Set(),mod:3,isOwner:true,testUserPermission:u=>u?.isGM||u?.id==="owner",
 system:{isCreature:true,details:{type:{value:type}},attributes:{hp:{value:40,max:100,damage:60,temp:0,tempmax:0}},_source:{attributes:{hp:{tempmax:0}}},traits:{ci:{value:new Set()}}},getRollData:()=>({}),changeIsIgnored:()=>false};
 a.changeHasEffect=(kind,d)=>d.type==="necrotic"&&(kind==="immunity"&&a.immune||kind==="resistance"&&a.resist);
 a.calculateDamage=(d,o)=>nativeCalculateDamage.call(a,d,o);a.applyDamage=(d,o)=>serializeEnervationDamage.call(a,(...args)=>nativeApplyDamage.call(a,...args),d,o);
 a.reset=()=>{a.statuses=new Set(a.effects.filter(e=>e.active).flatMap(e=>[...e.statuses]));};
 a.update=async u=>{if(a.fail){a.fail=false;throw Error("actor write failed");}merge(a,u);a.system.attributes.hp.damage=a.system.attributes.hp.max-a.system.attributes.hp.value;return a;};
 a.createEmbeddedDocuments=async(_type,rows)=>{if(a.failEffect){a.failEffect=false;throw Error("effect failed");}return rows.map(d=>{const e=new Effect(d,a);a.effects.push(e);a.reset();return e;});};
 a.updateEmbeddedDocuments=async(_type,rows)=>rows.map(d=>{const e=a.effects.get(d._id);merge(e,d);a.reset();return e;});
 a.deleteEmbeddedDocuments=async(type,ids)=>{if(type==="Item"){for(const item of [...a.items])if(ids.includes(item.id)){a.items.splice(a.items.indexOf(item),1);world.delete(item.uuid);}return;}for(const e of [...a.effects])if(ids.includes(e.id))await e.delete();};
 game.actors.push(a);world.set(a.uuid,a);return a;}
function message(type,a,data={}){const id=`message${++serial}`,m={id,uuid:`ChatMessage.${id}`,type,activity:a,timestamp:serial,author:gm,flags:{},system:{},rolls:[],whisper:[],...data,
 getAssociatedActivity(){return this.activity;},getAssociatedActor(){return this.activity.actor;},getAssociatedItem(){return this.activity.item;},getOriginatingMessage(){return game.messages.get(this.system.origin);},
 async update(u){merge(this,u);return this;},async setFlag(scope,key,v){if(this.failFlag){this.failFlag=false;throw Error("message flag failed");}set(this.flags,`${scope}.${key}`,v);}};world.set(m.uuid,m);game.messages.push(m);return m;}
function setup(mod=3){world=new Map();notices=[];cancelPay=cancelHP=false;
 globalThis.game={user:gm,users:list([gm]),actors:[],scenes:[],messages:list([]),time:{worldTime:100},combat:{id:"fight",uuid:"Combat.fight",started:true,round:1,turn:0,current:{round:1,turn:0}}};game.users.activeGM=gm;
 const caster=actor("caster"),foe=actor("foe"),undead=actor("undead","undead"),ally=actor("ally"),attacker=actor("attacker");caster.mod=mod;
 const scene={grid:{units:"ft",getCenterPoint:o=>({x:o.x,y:0}),measurePath:([a,b])=>({distance:Math.hypot(a.x-b.x,a.elevation-b.elevation)})},tokens:list([])};
 const token=(name,a,x)=>{const t={uuid:`Scene.test.Token.${name}`,actor:a,parent:scene,x,elevation:0,name,hidden:false,isOwner:true,flags:{},light:{bright:5,dim:10,color:"baseline",toObject(){return{bright:this.bright,dim:this.dim,color:this.color};}},getOccupiedGridSpaceOffsets(){return[{x:this.x}];},async update(u){merge(this,u);}};world.set(t.uuid,t);scene.tokens.push(t);return t;};
 const sourceToken=token("caster",caster,0),foeToken=token("foe",foe,20),undeadToken=token("undead",undead,30),allyToken=token("ally",ally,10);game.scenes.push(scene);game.user.targets=new Set([foeToken]);
 const item=clone(doc);item.id=item._id;item.uuid=`${caster.uuid}.Item.${item.id}`;item.actor=caster;item._uses={max:"0",spent:0};
 item.system.uses={recovery:[]};Object.defineProperties(item.system.uses,{max:{get:()=>+item._uses.max},spent:{get:()=>item._uses.spent},value:{get:()=>Math.clamp(+item._uses.max-item._uses.spent,0,+item._uses.max)}});
 item.update=async u=>{if(item.fail){item.fail=false;throw Error("item write failed");}if(u["system.uses.max"]!==undefined)item._uses.max=String(u["system.uses.max"]);if(u["system.uses.spent"]!==undefined){assert.ok(u["system.uses.spent"]>=0);item._uses.spent=u["system.uses.spent"];}for(const[k,v]of Object.entries(u))if(k!=="_id"&&!k.startsWith("system.uses."))set(item,k,clone(v));return item;};
 item.toObject=()=>({...clone(doc),system:{...clone(doc.system),uses:{...item._uses,recovery:[]}}});item.effects=list(doc.effects.map(d=>new Effect(d,item)));caster.items.push(item);world.set(item.uuid,item);
 const acts=Object.fromEntries(Object.values(doc.system.activities).map(d=>{const a={...clone(d),uuid:`${item.uuid}.Activity.${d._id}`,item,actor:caster,getUsageToken:()=>sourceToken,getRollData:()=>({mod:caster.mod}),getAppliedEffectChanges:nativeAppliedEffectChanges};
  a.applicableEffects=a.effects.map(p=>item.effects.get(p._id));a.duration.getEffectData=()=>({value:600,units:"seconds"});if(a.save)a.save.dc={value:16};
  a._prepareUsageUpdates=async config=>{const updates={actor:{},item:[],activity:{},create:[],delete:[...(a.deleteOnCast??[])],rolls:[]};if(a.consumption.targets.some(t=>t.type==="itemUses")&&config.consume?.resources!==false){const used=await nativeUsesConsumption.call({resolveCost:async()=>({total:1})},{},{uses:item.system.uses,type:"fragment",rolls:[],delta:{}});updates.item.push({_id:item.id,"system.uses.spent":used.spent});}return prepareLanternUpdates(a,config,updates);};
  world.set(a.uuid,a);return[d.flags.spikependium.lanternStage,a];}));item.system.activities=list(Object.values(acts));
 game.combat.combatant={actor:caster,token:sourceToken};game.combat.getCombatantsByActor=a=>a===caster?[game.combat.combatant]:[];world.set(game.combat.uuid,game.combat);
 return {caster,foe,undead,ally,attacker,sourceToken,foeToken,undeadToken,allyToken,item,acts};}
async function use(s,stage="cast",target=s.foeToken,config={spikependium:{lanternConfirmed:true}}){game.user.targets=new Set(target?[target]:[]);const a=s.acts[stage];return lanternUse.call(a,async()=>{
 const msg={data:{system:{targets:["cast","end"].includes(stage)?[]:[{actor:target.actor.uuid,token:target.uuid}]}}};
 const ok=await nativeConsume.call(a,config,msg,async u=>{const deltas={actor:getDeltas(s.caster,u.actor),item:{}};for(const row of u.item)deltas.item[row._id]=getDeltas(s.item,Object.fromEntries(Object.entries(row).filter(([k])=>k!=="_id")));
  for(const row of u.item)await s.item.update(row);await s.caster.update(u.actor);await s.caster.deleteEmbeddedDocuments("Item",u.delete);return deltas;});if(!ok)return;
 recordLanternUsage(a,msg);recordArcanaCast(a,msg);const card=message("usage",a,msg.data);await syncArcanaCast(card);await syncLanternGuard(card);await syncLanterns();return card;
 });}
async function dead(s,a=s.foe,t=s.foeToken){const e=new Effect({statuses:["dead"],system:{type:"dead"}},a);recordLanternDeath(e,{});a.effects.push(e);a.reset();return e;}
async function fragment(s,a=s.foe,t=s.foeToken){await dead(s,a,t);return use(s,"collect",t);}
async function roll(origin,total){let card;await lanternRollDamage.call(origin.activity,async(_config,_dialog,msg)=>{card=message("damage",origin.activity,{...msg.data,system:{...msg.data.system,isHealing:origin.flags.spikependium.lanternUse.stage==="restore"},rolls:[new Damage(total,origin.flags.spikependium.lanternUse.stage==="restore"?"healing":"necrotic")]});},{},{},{data:{system:{origin:origin.id}}});return card;}
async function apply(s,card,target=s.undead){await target.applyDamage([{type:card.rolls[0].options.type,value:card.rolls[0].total}],{originatingMessage:card});}
async function refund(s,card){return refundLantern.call(card.activity,async changes=>nativeRefund.call(card.activity,changes,async u=>{for(const row of u.item)await s.item.update(row);await s.caster.update(u.actor);}),card.system.deltas);}
async function recount(s,card,config={consume:true}){const a=card.activity,msg={message:card};const ok=await lanternConsume.call(a,async(cfg,m)=>nativeConsume.call(a,cfg,m,async u=>{
 const deltas={actor:getDeltas(s.caster,u.actor),item:{}};for(const row of u.item)deltas.item[row._id]=getDeltas(s.item,Object.fromEntries(Object.entries(row).filter(([k])=>k!=="_id")));
 for(const row of u.item)await s.item.update(row);await s.caster.update(u.actor);return deltas;
}),config,msg);if(ok)await card.update(msg.data);await syncLanterns();return !!ok;}
const stock=s=>s.item.system.uses.value;

// Native empty stock and light, actual death snapshot, one fragment per death and shared native spending.
let s=setup(),origin=await use(s);assert.ok(lanternCastPaid(origin));assert.equal(stock(s),0);assert.equal(s.sourceToken.light.dim,60);assert.equal(s.sourceToken.light.bright,5);
assert.ok(!origin.system.deltas.actor.some(d=>d.keyPath.endsWith("lanternCurrent")),"metadata pointer is not a numeric resource");
s.foe.system.attributes.hp.value=0;assert.equal(await use(s,"collect"),undefined,"zero HP is not proof of death");const death=await dead(s);assert.ok(death.flags.spikependium.lanternDeath);
assert.equal(await use(s,"collect",s.foeToken,{}),undefined);const collected=await use(s,"collect");assert.ok(collected);assert.equal(stock(s),1);assert.equal(await use(s,"collect"),undefined);
const drain=await use(s,"drain",s.undeadToken);assert.ok(drain);assert.equal(stock(s),0);assert.equal(await use(s,"drain",s.undeadToken),undefined);
const damage=await roll(drain,15);s.undead.resist=true;await apply(s,damage);assert.equal(s.undead.system.attributes.hp.value,33);assert.equal(s.caster.system.attributes.hp.value,40,"life drain does not heal the caster");await apply(s,damage);assert.equal(s.undead.system.attributes.hp.value,33);
await refund(s,drain);assert.equal(stock(s),1);const oldHP=s.undead.system.attributes.hp.value;await apply(s,damage);assert.equal(s.undead.system.attributes.hp.value,oldHP);
// Native healing is restricted to Undead, preserves its type and cannot be applied twice or to someone else.
assert.equal(await use(s,"restore",s.allyToken),undefined);const heal=await use(s,"restore",s.undeadToken);const healing=await roll(heal,18);await apply(s,healing);assert.equal(s.undead.system.attributes.hp.value,51);
await apply(s,healing);assert.equal(s.undead.system.attributes.hp.value,51);await apply(s,healing,s.ally);assert.equal(s.ally.system.attributes.hp.value,40);
// Moving a corpse into range after death never produces a fragment; moving out after a recorded death does not rewrite its position at death.
s=setup();origin=await use(s);s.foeToken.x=61;await dead(s);s.foeToken.x=5;assert.equal(await use(s,"collect"),undefined);
s=setup();origin=await use(s);await dead(s);s.foeToken.x=100;assert.ok(await use(s,"collect"));
// Full-at-death, multiple pending deaths, and later expenditures cannot create retroactive extra capacity.
s=setup(1);origin=await use(s);await dead(s);await dead(s,s.ally,s.allyToken);assert.ok(await use(s,"collect"));assert.equal(await use(s,"collect",s.allyToken),undefined);
const paidDrain=await use(s,"drain",s.undeadToken);assert.ok(paidDrain);assert.equal(await use(s,"collect",s.allyToken),undefined,"a later spend cannot make room for a past death");
s=setup(1);origin=await use(s);await fragment(s);await dead(s,s.ally,s.allyToken);assert.equal(s.ally.effects[0].flags.spikependium?.lanternDeath,undefined,"full lantern records no collection candidate");
// Capacity tracks the modifier without granting free souls; reducing it enforces the new maximum.
s=setup(3);origin=await use(s);await fragment(s);await fragment(s,s.ally,s.allyToken);assert.equal(stock(s),2);s.caster.mod=5;await syncLanterns();assert.equal(s.item.system.uses.max,5);assert.equal(stock(s),2);s.caster.mod=1;await syncLanterns();assert.equal(stock(s),1);
s=setup(-1);origin=await use(s);assert.equal(s.item.system.uses.max,0);await dead(s);assert.equal(await use(s,"collect"),undefined);
// Bonus use requires the native cost; native cancellation and return roll back the shared counter and claim.
s=setup();origin=await use(s);await fragment(s);assert.equal(await use(s,"drain",s.undeadToken,{consume:{resources:false},spikependium:{lanternConfirmed:true}}),undefined);assert.equal(stock(s),1);
cancelPay=true;assert.equal(await use(s,"restore",s.undeadToken),undefined);assert.equal(stock(s),1);cancelPay=false;
const credit=game.messages.find(m=>m.flags.spikependium?.lanternUse?.stage==="collect");await refund(s,credit);assert.equal(stock(s),0);assert.ok(await use(s,"collect"));assert.equal(stock(s),1);
// Concurrent applications use the existing source-bound spell queue and one atomic HP marker.
const paid=await use(s,"drain",s.undeadToken),typed=await roll(paid,15);await Promise.all([apply(s,typed),apply(s,typed)]);assert.equal(s.undead.system.attributes.hp.value,25);
// A new cast starts empty. Returning an older cast or effect must not credit its souls to the new one.
s=setup();origin=await use(s);await fragment(s);const oldUse=await use(s,"drain",s.undeadToken);const newer=await use(s);assert.equal(stock(s),0);await refund(s,oldUse);assert.equal(stock(s),0);await refund(s,origin);assert.equal(stock(s),0);assert.ok(lanternCastPaid(newer));
// Ending the lantern clears stock/light, and native undo of that ending restores them before the original deadline.
s=setup();origin=await use(s);await fragment(s);await s.sourceToken.update(radiantLightUpdate(s.sourceToken,"other-light",20,40,true));const end=await use(s,"end",null);assert.equal(stock(s),0);assert.equal(s.sourceToken.light.dim,40);assert.equal(lanternCastPaid(origin),false);
await refund(s,end);await syncLanterns();assert.equal(stock(s),1);assert.equal(s.sourceToken.light.dim,60);game.time.worldTime+=600;await syncLanterns();assert.equal(stock(s),0);assert.equal(s.sourceToken.light.dim,40);assert.equal(s.sourceToken.light.bright,20);
assert.equal(await recount(s,origin),false,"recount cannot restart an expired spell");
s=setup();origin=await use(s);await fragment(s);const aura=s.caster.effects.find(e=>e.flags.spikependium?.arcanaSpell==="spirit-lantern");await aura.delete();await endDeletedLantern(aura);assert.equal(stock(s),0);assert.equal(s.sourceToken.light.dim,10);assert.equal(lanternCastPaid(origin),false);
// Native resource recount reuses the old paid event/time, never a new casting or a second application of its result.
s=setup();origin=await use(s);const originalEvent=origin.flags.spikependium.lanternUse.event;await refund(s,origin);game.time.worldTime++;assert.ok(await recount(s,origin));assert.equal(origin.flags.spikependium.lanternUse.event,originalEvent);assert.equal(origin.flags.spikependium.lanternUse.time,100);assert.ok(lanternCastPaid(origin));assert.equal(await recount(s,origin),false);
await fragment(s);const earlier=await use(s,"drain",s.undeadToken),earlierRoll=await roll(earlier,15);await apply(s,earlierRoll);await refund(s,earlier);assert.ok(await recount(s,earlier));await apply(s,earlierRoll);assert.equal(s.undead.system.attributes.hp.value,25);assert.equal(stock(s),0);
s=setup();origin=await use(s);const earlierCredit=await fragment(s);await refund(s,earlierCredit);assert.equal(stock(s),0);assert.ok(await recount(s,earlierCredit));assert.equal(stock(s),1);assert.equal(await recount(s,earlierCredit),false);
const former=origin;await use(s);await refund(s,former);assert.equal(await recount(s,former),false,"an older casting cannot replace the current one through resource recount");
// Metric light and three-dimensional death ranges use the existing native distance/light helpers.
s=setup();s.sourceToken.parent.grid.units="m";s.foeToken.x=19;origin=await use(s);assert.ok(Math.abs(s.sourceToken.light.dim-18.288)<1e-9);await dead(s);assert.equal(await use(s,"collect"),undefined);
s=setup();origin=await use(s);s.foeToken.x=0;s.foeToken.elevation=61;await dead(s);assert.equal(await use(s,"collect"),undefined);
s=setup();origin=await use(s);s.foe.statuses.add("dead");const nativeDeath=await dead(s);assert.ok(nativeDeath.flags.spikependium.lanternDeath,"first real death document is recorded even when derived statuses were prepared earlier");nativeDeath.flags.spikependium.lanternDeath.event="bad.path";assert.equal(await use(s,"collect"),undefined);nativeDeath.flags.spikependium.lanternDeath.candidates={};assert.equal(await use(s,"collect"),undefined);
s=setup();origin=await use(s);const toggled=new Effect({statuses:["dead"],disabled:true,system:{type:"dead"}},s.foe);s.foe.effects.push(toggled);s.foe.reset();const updates={disabled:false};recordLanternDeath(toggled,updates);assert.ok(updates["flags.spikependium.lanternDeath"]);await toggled.update(updates);assert.ok(await use(s,"collect"));
// Guard profile has native sourceStart expiry and explicit paid provenance, without Dodge or unrelated save bonuses.
s=setup();origin=await use(s);await fragment(s);const ward=await use(s,"protect",s.allyToken);let protection=s.ally.effects.find(e=>e.flags.spikependium?.lanternGuardProfile);assert.ok(protection?.active);assert.equal(protection.duration.expiry,"sourceStart");assert.equal(protection.system.origin.activity,s.acts.protect.uuid);assert.equal(stock(s),0);
const attack={type:"attack",actor:s.attacker},messageConfig={data:{system:{targets:[{actor:s.ally.uuid,token:s.allyToken.uuid}]}}},config={subject:attack,rolls:[{options:{advantageMode:1}}]};
prepareLanternAttack(config,{},messageConfig);assert.equal(config.rolls[0].options.disadvantage,true);assert.equal(config.rolls[0].options.advantageMode,0);
const built={options:{advantageMode:1}};buildLanternAttack.call(attack,()=>{},config,built,null);assert.equal(built.options.advantageMode,0);const d20=new D20(built.options);nativeD20ConfigureModifiers.call(d20);assert.equal(d20.mode,0,"native advantage and disadvantage cancel");
assert.notEqual(finalizeLanternAttack([],config,{},messageConfig),false);protection.disabled=true;assert.equal(finalizeLanternAttack([],config,{},messageConfig),false);protection.disabled=false;
const ordinary={subject:attack,rolls:[{options:{}}]};prepareLanternAttack(ordinary,{}, {data:{system:{targets:[{actor:s.undead.uuid,token:s.undeadToken.uuid}]}}});assert.notEqual(finalizeLanternAttack([],ordinary),false);
const selfAttack={subject:{type:"attack",actor:s.ally},rolls:[{options:{}}]};prepareLanternAttack(selfAttack,{},messageConfig);assert.equal(selfAttack.rolls[0].options.disadvantage,undefined);
assert.equal(prepareLanternAttack({subject:attack,rolls:[{options:{}}]}, {},{data:{system:{targets:[{actor:s.ally.uuid,token:s.allyToken.uuid},{actor:s.undead.uuid,token:s.undeadToken.uuid}]}}}),false);
// Exact native pseudo-expiry method: only next source turn in the correct combat, and native time advance out of combat.
const Expiry=nativeLanternExpiry(class{isExpiryEvent(){return false;}}),expiry=Object.assign(new Expiry(),{specialDuration:"sourceStart",actor:{inCombat:true},start:{combat:game.combat,round:1,turn:0},getSourceActor:()=>s.caster});
assert.equal(expiry.isExpiryEvent("turnStart",{combat:game.combat,round:1,turn:0}),false);assert.equal(expiry.isExpiryEvent("turnStart",{combat:game.combat,round:2,turn:0}),true);assert.equal(expiry.isExpiryEvent("turnEnd",{combat:game.combat,round:2,turn:0}),false);expiry.actor.inCombat=false;assert.equal(expiry.isExpiryEvent("updateWorldTime"),true);
// A failed guard write recovers once; a next source turn invalidates even a guard not yet published.
s=setup();origin=await use(s);await fragment(s);s.ally.failEffect=true;await assert.rejects(()=>use(s,"protect",s.allyToken));assert.equal(stock(s),0);await resumeLanternGuards();assert.ok(s.ally.effects.some(e=>e.active&&e.flags.spikependium?.lanternGuardProfile));
s=setup();origin=await use(s);await fragment(s);s.ally.failEffect=true;await assert.rejects(()=>use(s,"protect",s.allyToken));game.combat.round=2;game.combat.current={round:2,turn:0};await lanternStartTurn.call(game.combat,async()=>{},game.combat.combatant);await resumeLanternGuards();assert.equal(s.ally.effects.length,0);
s=setup();origin=await use(s);await fragment(s);const refundedGuard=await use(s,"protect",s.allyToken);await refund(s,refundedGuard);game.combat.round=2;game.combat.current={round:2,turn:0};await lanternStartTurn.call(game.combat,async()=>{},game.combat.combatant);assert.ok(await recount(s,refundedGuard));assert.equal(s.ally.effects[0].active,false,"recount does not refresh a guard whose source turn has passed");
// Native linked-spell configuration keeps item charges on the initial cast. A bonus fragment use/recount does not charge the parent again.
s=setup();origin=await use(s);await fragment(s);const linkedCard=await use(s,"drain",s.undeadToken);await refund(s,linkedCard);
CONFIG.DND5E.activityActivationTypes={bonus:{}};CONFIG.DND5E.spellcasting={spell:{slots:true,getSpellSlotKey:n=>`spell${n}`}};
let parentCalls=0;const parent={relativeUUID:"Item.rod.Activity.cast",spell:{level:5},consumption:{targets:[{}],scaling:{allowed:false}},async _prepareUsageUpdates(){parentCalls++;return{actor:{},item:[],activity:{},rolls:[],create:[],delete:[]};},_mergeActivityUpdates(){}};
const child=s.acts.drain;child.isSpell=true;child.requiresSpellSlot=true;child.item.flags.dnd5e={cachedFor:parent.relativeUUID};child.item.getFlag=(scope,key)=>get(child.item.flags,`${scope}.${key}`);child.getLinkedActivity=relative=>arcanaStageLinkedActivity.call(child,()=>parent,relative);
child.consumption.targets[0].hasZeroCost=()=>false;child.consumption.targets[0].consume=async(_cfg,u)=>{const result=await nativeUsesConsumption.call({resolveCost:async()=>({total:1})},{},{uses:s.item.system.uses,type:"fragment",rolls:[],delta:{}});u.item.push({_id:s.item.id,"system.uses.spent":result.spent});};
const nativeConfig=nativeUsageConfig.call(child,{});assert.equal(nativeConfig.cause,undefined);assert.equal(nativeConfig.consume.spellSlot,false);
assert.equal(child.getLinkedActivity(parent.relativeUUID),null);const otherLink={relativeUUID:"Item.other.Activity.cost"};assert.equal(arcanaStageLinkedActivity.call(child,()=>otherLink,otherLink.relativeUUID),otherLink,"an explicit unrelated cause keeps its own costs");
const initial={...child,consumption:{...child.consumption,spellSlot:true}};assert.equal(arcanaStageLinkedActivity.call(initial,()=>parent),parent,"initial casting retains the parent cost");
const ordinaryLinked={...child,flags:{}};assert.equal(arcanaStageLinkedActivity.call(ordinaryLinked,()=>parent),parent,"ordinary activities retain their linked costs");
child._prepareUsageUpdates=async cfg=>prepareLanternUpdates(child,cfg,await nativeUsageUpdates.call(child,cfg));
assert.ok(await recount(s,linkedCard,{consume:true,cause:{activity:parent.relativeUUID,resources:true}}));assert.equal(parentCalls,0);assert.equal(stock(s),0);
// A consumed source may delete its cached spell. Keep only this active lantern copy, without granting another cast.
s=setup();s.item.flags.dnd5e={cachedFor:"Item.scroll.Activity.cast"};s.caster.items.push({id:"scroll",uuid:"Actor.caster.Item.scroll",flags:{}});s.acts.cast.deleteOnCast=[s.item.id,"scroll"];
origin=await use(s);assert.equal(s.caster.items.get("scroll"),undefined);assert.ok(s.caster.items.get(s.item.id));assert.equal(s.item.flags.dnd5e.cachedFor,undefined);assert.equal(s.item.flags.spikependium.lanternRetained,true);assert.equal(s.item.system.prepared,1);
await fragment(s);assert.equal(stock(s),1);assert.equal(await use(s,"cast"),undefined);const stopped=await use(s,"end",null);assert.ok(s.caster.items.get(s.item.id));await refund(s,stopped);await syncLanterns();assert.equal(stock(s),1);
game.time.worldTime+=600;await syncLanterns();assert.equal(s.caster.items.get(s.item.id),undefined,"only the validated temporary item is removed at its original deadline");
// Hidden sources remain private; unbound, forged, wrong-type and refunded healing/damage cards cannot apply.
s=setup();s.sourceToken.hidden=true;origin=await use(s);assert.equal(origin.blind,true);await fragment(s);const privateUse=await use(s,"restore",s.undeadToken),privateHeal=await roll(privateUse,18);assert.equal(privateHeal.blind,true);assert.deepEqual(privateHeal.whisper,["gm"]);
privateHeal.author={id:"intruder"};await apply(s,privateHeal);assert.equal(s.undead.system.attributes.hp.value,40);privateHeal.author=gm;privateHeal.rolls[0].options.type="necrotic";await apply(s,privateHeal);assert.equal(s.undead.system.attributes.hp.value,40);
s=setup();origin=await use(s);await fragment(s);const p=await use(s,"restore",s.undeadToken),h=await roll(p,18);s.undead.system.details.type.value="humanoid";await apply(s,h);assert.equal(s.undead.system.attributes.hp.value,40);
// Ordinary actors without a lantern are inert, and confirmation is a native dialog field.
s=setup();message("usage",s.acts.cast);await syncLanterns();assert.equal(s.sourceToken.light.dim,10);class Base{async _prepareConsumptionContext(){return{fields:[],inputs:{createCheckboxInput(){}}};}}
const dialog={applicationClass:Base},msg={};prepareLanternDialog(s.acts.collect,{},dialog,msg);const window=new dialog.applicationClass();window.config={};assert.equal((await window._prepareConsumptionContext({},{})).fields[0].name,"spikependium.lanternConfirmed");assert.equal(msg.hasConsumption,true);
console.log("Spirit Lantern: native empty/shared stock and refund, death-time/capacity snapshots and no retroactive souls, typed CON damage/Undead healing and atomic applications, preserved shared light/metres, dynamic capacity, paid sourceStart guard, native advantage cancellation/window checks, late guard recovery and provenance passed.");

