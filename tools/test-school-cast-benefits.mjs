import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { SCHOOL_SPEED_PROFILE_UUID } from "../scripts/generated.mjs";
import { prepareSchoolBenefitDialog, captureSchoolBenefit, prepareSchoolBenefitUpdates, recordSchoolBenefitConsumption, recordSchoolBenefitUsage,
  resumeSchoolBenefits, schoolSpeedSuppression, schoolSpeedChange, cleanSchoolSpeed, schoolBenefitDeltaLabel } from "../scripts/school-cast-benefits.mjs";
import { nativeConsume, nativeRefund, getDeltas } from "./data/dnd5e-reaction-native.mjs";
import { nativeConsumeSpellSlots, nativeConsumeAttribute } from "./data/dnd5e-relentless-native.mjs";
import { nativePrepareMovement, setMovementContext } from "./data/dnd5e-arcana-native.mjs";
import { isExpiryEvent } from "./data/dnd5e-making-native.mjs";
const docs=fs.readdirSync("packs/_source/feats").map(f=>JSON.parse(fs.readFileSync(`packs/_source/feats/${f}`,"utf8"))).filter(d=>d.flags?.spikependium?.schoolAdept);
const clone=structuredClone,get=(o,p)=>p.split(".").reduce((o,k)=>o?.[k],o);
const set=(o,p,v)=>{const a=p.split("."),k=a.pop();a.reduce((o,k)=>o[k]??={},o)[k]=clone(v);};
const flat=(o,p="",out={})=>{for(const[k,v]of Object.entries(o)){const q=p?`${p}.${k}`:k;if(v&&Object.getPrototypeOf(v)===Object.prototype)flat(v,q,out);else out[q]=v;}return out;};
const list=a=>Object.assign(a,{get(id){return this.find(i=>i.id===id);},has(id){return !!this.get(id);}});
const id=s=>crypto.createHash("sha256").update(s).digest("hex").slice(0,16);
const convert=(n,from,to)=>from===to?n:from==="ft"?n*0.3048:n/0.3048;
let world,serial,notices,fail;
globalThis.fromUuidSync=uuid=>world.get(uuid);
globalThis.fromUuid=async uuid=>world.get(uuid);
globalThis.foundry={utils:{getProperty:get,setProperty:set,hasProperty:(o,p)=>get(o,p)!==undefined,flattenObject:flat,randomID:()=>String(++serial).padStart(16,"0"),escapeHTML:s=>s,isEmpty:o=>!o||!Object.keys(o).length},
 data:{fields:{StringField:class{constructor(d){Object.assign(this,d);}},BooleanField:class{}}}};
globalThis.ui={notifications:{warn:m=>notices.push(m)}};
globalThis.dnd5e={utils:{staticID:id,convertLength:convert,defaultUnits:()=>"ft"}};
globalThis.ActiveEffect={implementation:{getEffectStart:c=>({time:game.time.worldTime,combat:c?.id??null,round:c?.round??null,turn:c?.turn??null})}};
Math.clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
globalThis.CONFIG={DND5E:{spellLevels:Object.fromEntries(Array.from({length:10},(_,i)=>[i,String(i)])),conditionTypes:{},conditionEffects:{},
 movementTypes:{walk:{},fly:{},swim:{},climb:{},burrow:{}},defaultUnits:{length:{imperial:"ft"}},encumbrance:{speedReduction:{encumbered:{},heavilyEncumbered:{}}}}};
setMovementContext({convertLength:convert,defaultUnits:()=>"ft",simplifyBonus:n=>Number(n)||0,ConditionData:{hasLevels:()=>false}});
class StatusSet extends Set{difference(other){return new StatusSet([...this].filter(s=>!other.has(s)));}reduce(fn,v){return [...this].reduce(fn,v);}}
class Effect {
 constructor(data,parent){this.data=clone(data);this.id=data._id;this.parent=parent;this.actor=parent.documentName==="Actor"?parent:parent.actor;this.uuid=`${parent.uuid}.ActiveEffect.${this.id}`;
  this.flags=this.data.flags??={};this.system=this.data.system??={};this.duration=this.data.duration??={};this.disabled=!!data.disabled;this.start=this.data.start;world.set(this.uuid,this);}
 get active(){return !this.disabled&&!schoolSpeedSuppression.call(this,()=>false);}
 toObject(){return clone(this.data);}
}
class Actor {
 constructor(name){this.id=name;this.name=name;this.uuid=`Actor.${name}`;this.documentName="Actor";this.flags={};this.isOwner=true;this.effects=list([]);this.items=list([]);this.statuses=new StatusSet();
  this.system={parent:this,isCreature:true,attributes:{hp:{value:10,max:10,temp:0},movement:{}},traits:{ci:{value:new StatusSet()}},abilities:{str:{value:10}},conditions:{},_source:{attributes:{movement:{speeds:{walk:30}}}}};
  this.system.spells=Object.fromEntries(Array.from({length:9},(_,i)=>[`spell${i+1}`,{value:3,max:3}]));this.system.spells.pact={value:2,max:2,level:5};world.set(this.uuid,this);this.units="ft";this.reset();}
 hasConditionEffect(){return false;}
 testUserPermission(u){return u?.isGM||u?.id==="owner";}
 reset(){this.system.attributes.movement={units:this.units,speeds:{walk:convert(30,"ft",this.units),fly:convert(60,"ft",this.units),swim:0,climb:0,burrow:0},bonus:0,multiplier:1};
  for(const e of this.effects)if(e.active)for(const change of e.system.changes??[])schoolSpeedChange((model,c)=>{model.system.attributes.movement.bonus+=Number(c.value);},this,{...change,effect:e});
  nativePrepareMovement.call(this.system,{});}
 async update(data){if(fail==="ward"&&Object.hasOwn(data,"system.attributes.hp.temp")||fail==="applied"&&Object.keys(data).some(k=>k.endsWith(".applied"))){fail=null;throw Error("update");}for(const[p,v]of Object.entries(data))set(this,p,v);this.reset();}
 async createEmbeddedDocuments(type,data){assert.equal(type,"ActiveEffect");if(fail==="effect"){fail=null;throw Error("effect");}
  const created=data.map(d=>{assert.ok(!this.effects.has(d._id));const e=new Effect(d,this);this.effects.push(e);return e;});this.reset();return created;}
 async deleteEmbeddedDocuments(type,ids){assert.equal(type,"ActiveEffect");for(const e of this.effects.filter(e=>ids.includes(e.id))){this.effects.splice(this.effects.indexOf(e),1);world.delete(e.uuid);}this.reset();}
}
class Dialog{constructor(config){this.config=config;}async _prepareConsumptionContext(c){return c;}}
function setup(kind="abj",{self=false,level=3,pact=false,ownTurn=true,units="ft"}={}){
 world=new Map();serial=0;notices=[];fail=null;const gm={id:"gm",isGM:true,isActiveGM:true,active:true},owner={id:"owner",active:true},users=list([gm,owner]);users.activeGM=gm;
 globalThis.game={user:gm,userId:gm.id,users,actors:[],scenes:[],messages:list([]),combats:[],time:{worldTime:100}};
 const caster=new Actor("caster"),target=self?caster:new Actor("target");game.actors=[caster,...(self?[]:[target])];caster.units=units;caster.reset();
 const scene={id:"scene",uuid:"Scene.scene",grid:{units:"ft",measurePath:([a,b])=>({distance:Math.hypot(a.x-b.x,a.y-b.y,a.elevation-b.elevation)})}};
 const token=(actor,x)=>({uuid:`Scene.scene.Token.${actor.id}`,actor,parent:scene,x,y:0,elevation:0,getOccupiedGridSpaceOffsets(){return[];},getCenterPoint(){return{x:this.x,y:this.y,elevation:this.elevation};}});
 const source=token(caster,0),destination=self?source:token(target,30);scene.tokens=list([source,...(self?[]:[destination])]);game.scenes.push(scene);world.set(source.uuid,source);world.set(destination.uuid,destination);
 game.user.targets=new Set(self?[]:[destination]);
 const combat={id:"combat",uuid:"Combat.combat",started:true,round:1,turn:0,combatant:{actor:ownTurn?caster:target,token:ownTurn?source:destination}};
 world.set(combat.uuid,combat);game.combat=combat;game.combats.push(combat);
 const doc=docs.find(d=>d.flags.spikependium.schoolAdept.school===kind),feat={...clone(doc),id:doc._id,uuid:`${caster.uuid}.Item.${doc._id}`,actor:caster};
 feat.effects=list(doc.effects.map(d=>new Effect(d,feat)));caster.items.push(feat);world.set(feat.uuid,feat);
 const item={type:"spell",flags:{},system:{school:kind,level},uuid:`${caster.uuid}.Item.spell`,actor:caster};
 const a={type:"utility",uuid:`${item.uuid}.Activity.cast`,actor:caster,item,consumption:{spellSlot:true},getUsageToken:()=>source};world.set(a.uuid,a);
 const config={spell:{slot:pact?"pact":`spell${level}`},spikependium:{schoolWardTarget:self?caster.uuid:destination.uuid,schoolWardVisible:true}},msg={data:{system:{}}};
 globalThis.Hooks={call:(name,activity,c,m)=>{if(name==="dnd5e.preActivityConsumption")return captureSchoolBenefit(activity,c,m);
  if(name==="dnd5e.postActivityConsumption")recordSchoolBenefitConsumption(activity,c,m);return true;}};
 a._prepareUsageUpdates=async c=>{const u={actor:{},item:[],rolls:[]};if(c.consume!==false&&c.consume?.spellSlot!==false) {
  const slot=c.spell.slot;
  if(slot==="pact")await nativeConsumeAttribute.call({actor:caster,target:"spells.pact.value",resolveCost:async()=>({total:1})},c,u);
  else await nativeConsumeSpellSlots.call({actor:caster,resolveLevel:()=>Number(slot.slice(5)),resolveCost:async()=>({total:1})},c,u);
 }
  return prepareSchoolBenefitUpdates(a,c,u);};
 async function use({defer=false}={}){const update=await nativeConsume.call(a,config,msg,async u=>{const d=getDeltas(caster,u.actor);await caster.update(u.actor);return {actor:d,item:{}};});if(!update)return;
  recordSchoolBenefitUsage(a,msg);const i=String(++serial).padStart(16,"0"),origin={id:i,uuid:`ChatMessage.${i}`,type:"usage",author:owner,flags:{},...clone(msg.data),
   getAssociatedActivity:()=>a,async setFlag(m,p,v){if(fail==="receipt"){fail=null;throw Error("receipt");}set(this.flags,`${m}.${p}`,v);}};
  world.set(origin.uuid,origin);game.messages.push(origin);if(!defer)await resumeSchoolBenefits(origin);return origin;}
 const refund=o=>nativeRefund.call(a,o.system.deltas,async u=>caster.update(u.actor));
 return{caster,target,source,destination,scene,combat,a,feat,config,msg,use,refund,gm,owner};
}
{
 const h=setup(),d={applicationClass:Dialog};prepareSchoolBenefitDialog(h.a,h.config,d);assert.equal(d.configure,true);
 const c=await new d.applicationClass(h.config)._prepareConsumptionContext({fields:[],inputs:{}});assert.equal(c.fields.length,2);
 const o=await h.use();assert.equal(h.target.system.attributes.hp.temp,6);assert.equal(h.target.system.attributes.hp.value,10);assert.equal(h.caster.system.spells.spell3.value,2);
 h.target.system.attributes.hp.temp=1;await resumeSchoolBenefits();assert.equal(h.target.system.attributes.hp.temp,1,"потраченные временные хиты повторно не выдаются");
 await h.refund(o);assert.equal(h.caster.system.spells.spell3.value,3);assert.equal(h.target.system.attributes.hp.temp,1,"возврат ячейки не отнимает уже выданные временные хиты");
 assert.equal(schoolBenefitDeltaLabel.call({keyPath:`flags.spikependium.schoolBenefits.${o.flags.spikependium.schoolBenefit.event}.active`},()=>({})).label,"Польза Адепта школы");
}
for(const temp of [0,20]){const h=setup("abj",{self:true,level:5});h.caster.system.attributes.hp.temp=temp;await h.use();assert.equal(h.caster.system.attributes.hp.temp,Math.max(temp,10));}
{
 const h=setup("abj",{pact:true,level:5});await h.use();assert.equal(h.target.system.attributes.hp.temp,10);assert.equal(h.caster.system.spells.pact.value,1);
}
for(const mutate of [h=>{h.destination.x=30.1;},h=>{h.destination.elevation=1;},h=>{h.config.spikependium.schoolWardVisible=false;},
 h=>{game.users.activeGM=null;h.target.isOwner=false;},h=>{h.msg.create=false;}]){const h=setup();mutate(h);assert.equal(await h.use(),undefined);assert.equal(h.caster.system.spells.spell3.value,3);}
{
 const h=setup();h.scene.grid.units="m";h.destination.x=9.144;await h.use();assert.equal(h.target.system.attributes.hp.temp,6);
}
for(const kind of ["abj","trs"]){const h=setup(kind,{self:true});h.config.consume={spellSlot:false};const o=await h.use();assert.equal(o.flags.spikependium?.schoolBenefit,undefined);assert.equal(h.caster.effects.length,0);assert.equal(h.caster.system.attributes.hp.temp,0);}
for(const step of ["ward","receipt"]){const h=setup();fail=step;await assert.rejects(h.use());await resumeSchoolBenefits();assert.equal(h.target.system.attributes.hp.temp,6);
 h.target.system.attributes.hp.temp=0;await resumeSchoolBenefits();assert.equal(h.target.system.attributes.hp.temp,0);}
{
 const h=setup();const o=await h.use({defer:true});await h.refund(o);await resumeSchoolBenefits();assert.equal(h.target.system.attributes.hp.temp,0);
}
{
 const h=setup();const o=await h.use({defer:true});game.time.worldTime++;await resumeSchoolBenefits(o);await resumeSchoolBenefits(o);assert.equal(h.target.system.attributes.hp.temp,0);assert.equal(notices.length,1);
}
{
 const h=setup();const o=await h.use({defer:true});h.combat.turn++;await resumeSchoolBenefits(o);assert.equal(h.target.system.attributes.hp.temp,0,"первичная выдача не переносится на следующий ход без изменения часов");
}
{
 const h=setup();const o=await h.use({defer:true});await Promise.all([resumeSchoolBenefits(o),resumeSchoolBenefits(o)]);assert.equal(h.target.system.attributes.hp.temp,6);
}
{
 const h=setup();h.destination.hidden=true;const o=await h.use();assert.equal(o.blind,true);assert.deepEqual(o.whisper,["gm"]);
}
for(const mutate of [o=>{o.author={id:"stranger"};},o=>{o.system.deltas.actor=[];},o=>{o.flags.spikependium.schoolBenefit.amount=100;}]){
 const h=setup();const o=await h.use({defer:true});mutate(o);await resumeSchoolBenefits(o);assert.equal(h.target.system.attributes.hp.temp,0);}
{
 const h=setup("trs",{self:true,level:3});const o=await h.use();assert.equal(h.caster.effects.length,1);h.caster.reset();assert.equal(h.caster.system.attributes.movement.speeds.walk,45);assert.equal(h.caster.system.attributes.movement.speeds.fly,75);
 assert.equal(h.caster.system.attributes.movement.speeds.swim,0);const e=h.caster.effects[0];assert.equal(e.duration.expiry,"targetEnd");
 await resumeSchoolBenefits();assert.equal(h.caster.effects.length,1);e.disabled=true;await cleanSchoolSpeed();assert.equal(h.caster.effects.length,1,"выключенный эффект сохраняется до конца хода");assert.equal(h.caster.system.attributes.movement.speeds.walk,30);
 e.disabled=false;h.caster.reset();assert.equal(h.caster.system.attributes.movement.speeds.walk,45);
 await h.refund(o);await cleanSchoolSpeed();assert.equal(h.caster.effects.length,0);assert.equal(h.caster.system.attributes.movement.speeds.walk,30);
}
{
 const h=setup("trs",{self:true,units:"m",level:4});await h.use();h.caster.reset();assert.ok(Math.abs(h.caster.system.attributes.movement.speeds.walk-15.24)<1e-8);
 h.combat.turn=1;h.caster.reset();assert.ok(Math.abs(h.caster.system.attributes.movement.speeds.walk-9.144)<1e-8);await cleanSchoolSpeed();assert.equal(h.caster.effects.length,0);
}
for(const scope of ["other","none"]){const h=setup("trs",{self:false,ownTurn:scope!=="other"});if(scope==="none"){game.combats=[];game.combat=null;}const o=await h.use();assert.equal(o.flags.spikependium?.schoolBenefit,undefined);assert.equal(h.caster.effects.length,0);}
for(const stage of ["effect","applied","receipt"]){const h=setup("trs",{self:true});fail=stage;await assert.rejects(h.use());await resumeSchoolBenefits();assert.equal(h.caster.effects.length,1);h.caster.reset();assert.equal(h.caster.system.attributes.movement.speeds.walk,45);}
{
 const h=setup("trs",{self:true});const o=await h.use({defer:true});h.combat.turn++;await resumeSchoolBenefits(o);assert.equal(h.caster.effects.length,0);
}
{
 const h=setup("trs",{self:true});await h.use();await h.use();h.caster.reset();assert.equal(h.caster.system.attributes.movement.speeds.walk,45,"одинаковые усиления не складываются");
 h.config.spell.slot="spell5";h.a.item.system.level=5;const high=await h.use();h.caster.reset();assert.equal(h.caster.system.attributes.movement.speeds.walk,55,"действует большее усиление");
 await h.refund(high);h.caster.reset();assert.equal(h.caster.system.attributes.movement.speeds.walk,45,"после отмены большего остаётся меньшее");
 await cleanSchoolSpeed();assert.equal(h.caster.effects.length,2);
 const effect=h.caster.effects[0],row={id:"caster",actor:h.caster};h.combat.previous={combatantId:row.id};h.combat.getCombatantsByActor=()=>[row];
 const native={actor:h.caster,specialDuration:effect.duration.expiry,start:{...effect.start,combat:h.combat}};
 assert.equal(isExpiryEvent.call(native,"turnEnd",{combat:h.combat,round:1,turn:0}),false);
 assert.equal(isExpiryEvent.call(native,"turnEnd",{combat:h.combat,round:1,turn:1}),true,"штатное targetEnd заканчивается на границе своего хода");
 assert.equal(isExpiryEvent.call(native,"turnEnd",{combat:{},round:1,turn:1}),false);
 h.combat.turn=1;await cleanSchoolSpeed();assert.equal(h.caster.effects.length,0);
}
{
 const h=setup("abj",{self:true});game.combat=null;game.combats=[];h.a.getUsageToken=()=>null;await h.use();assert.equal(h.caster.system.attributes.hp.temp,6,"самозащита работает без сцены и токена");
}
{
 const h=setup();game.user=h.owner;const o=await h.use();assert.equal(h.target.system.attributes.hp.temp,0);game.user=h.gm;await resumeSchoolBenefits(o);assert.equal(h.target.system.attributes.hp.temp,6,"чужую цель обрабатывает активный Мастер");
}
{
 const h=setup("trs",{self:true});game.users.activeGM=null;game.user=h.owner;h.gm.active=false;const o=await h.use();assert.equal(h.caster.effects.length,1);
 await h.refund(o);await cleanSchoolSpeed();assert.equal(h.caster.effects.length,0,"без Мастера эффект снимает активный владелец");
}
{
 const h=setup();h.a.item.system.level=0;await h.use();assert.equal(h.target.system.attributes.hp.temp,0,"побочная трата ячейки при заговоре не даёт Защитные чары");
}
{
 const h=setup();h.a.consumption.spellSlot=false;await h.use();assert.equal(h.target.system.attributes.hp.temp,0,"трата ячейки сторонней особенностью не считается сотворением за ячейку");
}
for(const kind of ["abj","trs"]){
 const h=setup(kind,{self:true}),o=await h.use();if(kind==="abj")h.caster.system.attributes.hp.temp=0;else await h.caster.deleteEmbeddedDocuments("ActiveEffect",h.caster.effects.map(e=>e.id));
 const replay={...o,id:"replay",uuid:"ChatMessage.replay",flags:clone(o.flags)};delete replay.flags.spikependium.schoolBenefitProcessed;
 world.set(replay.uuid,replay);game.messages.push(replay);await resumeSchoolBenefits(replay);
 assert.equal(h.caster.system.attributes.hp.temp,0,"копия старой карточки не выдаёт временные хиты повторно");assert.equal(h.caster.effects.length,0,"копия старой карточки не восстанавливает удалённый эффект");
}
{
 const h=setup();h.msg.create=false;h.config.consume={spellSlot:false};assert.ok(await h.use());assert.equal(h.target.system.attributes.hp.temp,0,"сотворение без ячейки и карточки не блокируется");
}
{
 const h=setup();h.target.system.attributes.hp.value=0;await h.use();assert.equal(h.target.system.attributes.hp.value,0);assert.equal(h.target.system.attributes.hp.temp,6,"временные хиты не лечат и не возвращают сознание");
}
{
 const h=setup("trs",{self:true});const template=h.feat.effects[0];h.feat.effects=list([]);world.set(SCHOOL_SPEED_PROFILE_UUID,{effects:[template]});
 await h.use();assert.equal(h.caster.effects.length,1);assert.equal(h.caster.system.attributes.movement.speeds.walk,45,"старая черта использует актуальный профиль библиотеки без переимпорта");
}
{
 const h=setup("trs",{self:true});h.feat.effects=list([]);
 await assert.rejects(h.use(),/Не найден профиль/);assert.equal(h.caster.effects.length,0);assert.equal(h.caster.system.spells.spell3.value,2);
 assert.equal(game.messages.length,1,"при отсутствии библиотеки оплаченная карточка сохранена для продолжения");
}
for(const change of ["turn","refund"]){
 const h=setup("trs",{self:true});const template=h.feat.effects[0];h.feat.effects=list([]);
 globalThis.fromUuid=async()=>{if(change==="turn")h.combat.turn++;else await h.refund(game.messages.at(-1));return{effects:[template]};};
 try{await h.use();assert.equal(h.caster.effects.length,0,"состояние перепроверяется после загрузки профиля");}
 finally{globalThis.fromUuid=async uuid=>world.get(uuid);}
}
{
 const h=setup("trs",{self:true});game.combat={uuid:"Combat.other",started:true,round:8,turn:4,combatant:{actor:h.target}};
 await h.use();assert.equal(h.caster.effects.length,1,"выбор другого боя в интерфейсе не меняет свой ход исходного токена");
}
console.log("Польза Адептов: native ячейки/договор/возврат; Защитные чары 30 футов/метры/высота/видимость/права/приватность, больший запас и отсутствие повторной выдачи; скорость в свой ход, native движение/метры/режимы/переключение/конец хода/возврат, старые черты, исходные карточки/сбои/конкурентная обработка: OK.");
