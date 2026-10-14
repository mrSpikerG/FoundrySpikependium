import assert from "node:assert/strict";
import fs from "node:fs";
import { prepareStormDialog, prepareStormUpdates, prepareStormConcentration, canUseStormModifier,
  stormFlightSpeed, hasStormFlight, finalizeStormMovement } from "../scripts/dragonmark-storm.mjs";
import { prepareResourceUpdates } from "../scripts/resources.mjs";
import { conditionalState } from "../scripts/mechanics.mjs";

const mod="N4bBDcVzqAboKo1G";
const doc=JSON.parse(fs.readFileSync(`packs/_source/feats/${fs.readdirSync("packs/_source/feats").find(f=>f.startsWith("feat-greater-storm_"))}`,"utf8"));
assert.equal(doc.system.activities[mod].uses.max,"1");assert.equal(doc.system.activities[mod].uses.recovery[0].period,"lr");
globalThis.ui={notifications:{warn(){},error(){}}};
globalThis.foundry={data:{fields:{BooleanField:class{constructor(data){Object.assign(this,data);}}}}};
globalThis.dnd5e={utils:{convertLength(value,from,to){const units={ft:1,m:10/3};return value*units[from]/units[to];},
  simplifyBonus(value,data){if(typeof value==="number")return value;const match=/^max\((\d+), @spikependium.stormFlightSpeed\)$/.exec(value);
    assert(match,`native final-phase formula: ${value}`);return Math.max(Number(match[1]),data.spikependium.stormFlightSpeed);}}};
const list=items=>Object.assign(items,{get(id){return this.find(i=>i.id===id);}});
function caster(){
  const resource={...structuredClone(doc.system.activities[mod]),id:mod,uses:{max:1,spent:0,get value(){return this.max-this.spent;}}};
  const item={...structuredClone(doc),id:doc._id,uuid:`Actor.pc.Item.${doc._id}`,system:{activities:new Map([[mod,resource]])}};
  const actor={uuid:"Actor.pc",isOwner:true,items:list([item]),effects:[],statuses:new Set(),
    system:{attributes:{movement:{speeds:{walk:30,fly:0},units:"ft",max:30}}},
    hasConditionEffect(type){return this.statuses.has(type);},getRollData(){return {attributes:this.system.attributes,spikependium:conditionalState(this,{})};}};
  return {id:"gustActivity",uuid:"Actor.pc.Item.spell.Activity.gustActivity",flags:{},consumption:{targets:[]},actor,
    item:{type:"spell",flags:{},system:{identifier:"gust-of-wind"}},
    duration:{concentration:true,getEffectData(){return {value:1,units:"minutes",expiry:"turnStart"};}}};
}
class UsageDialog{async _prepareConsumptionContext(){return {fields:[],inputs:{createCheckboxInput(){}},notes:[]};}}
const activity=caster(),config={},dialog={configure:false,applicationClass:UsageDialog};
prepareStormDialog(activity,config,dialog);assert.equal(dialog.configure,true);const app=new dialog.applicationClass();app.config=config;
const context=await app._prepareConsumptionContext({});assert.equal(context.fields[0].name,"spikependium.improvedStorm");
assert.equal(context.fields[0].value,false);assert.equal(context.hasConsumption,true);
assert.equal(canUseStormModifier({id:mod,item:activity.actor.items[0]}),false);assert.equal(canUseStormModifier(activity),true);assert.equal(canUseStormModifier(undefined),true);
const updates=()=>({actor:{},item:[{_id:"spell","system.uses.spent":1}],create:[],delete:[],rolls:[]});
const improved={spikependium:{improvedStorm:true},concentration:{begin:true}};
const nativeData=()=>({type:"condition",system:{type:"concentrating",changes:[{key:"existing",value:"1"}]},statuses:["concentrating"],"flags.dnd5e":{item:{uuid:"spell"}}});
const unchanged=updates();assert.equal(prepareStormUpdates(activity,{},unchanged),unchanged);assert.equal(unchanged.item.length,1);
const before=nativeData();prepareStormConcentration(activity.actor,activity.item,before,activity);assert.equal(before.system.changes.length,1);
const changed=await prepareResourceUpdates.call(activity,async()=>updates(),improved);assert(changed);assert.equal(changed.item.length,2);
assert.equal(changed.item[0]["system.uses.spent"],1);assert.equal(changed.item[1][`system.activities.${mod}.uses.spent`],1);
assert.equal(activity.actor.items[0].system.activities.get(mod).uses.spent,0,"подготовка не расходует применения заранее");
const unpaid=nativeData();prepareStormConcentration(activity.actor,activity.item,unpaid,activity);assert.equal(unpaid.system.changes.length,1,"без подтверждённого расхода полёт не выдаётся");
prepareStormUpdates(activity,improved,updates());activity.actor.items[0].system.activities.get(mod).uses.spent=1;
const concentration=nativeData();prepareStormConcentration(activity.actor,activity.item,concentration,activity);
assert.equal(concentration.type,"condition");assert.equal(concentration.system.type,"concentrating");assert.deepEqual(concentration.statuses,["concentrating"]);
assert.deepEqual(concentration["flags.dnd5e"],{item:{uuid:"spell"}});assert.equal(concentration["flags.spikependium.improvedStorm"],true);
assert.equal(concentration.system.changes.length,2);assert.deepEqual(concentration.system.changes[1],{
  key:"system.attributes.movement.speeds.fly",value:"@spikependium.stormFlightSpeed",type:"upgrade",phase:"final",
  conditions:JSON.stringify({o:"NOT",v:{k:"statuses.antimagic",v:1}})});
assert.equal(concentration.system.magical,undefined,"антимагия подавляет изменение полёта, сохраняя штатную концентрацию");
const twice=nativeData();prepareStormConcentration(activity.actor,activity.item,twice,activity);assert.equal(twice.system.changes.length,1);
for(const invalid of ["stored","spell","unowned","no-feat","exhausted","duration","not-concentration","begin-disabled"]){
  const a=caster(),use=structuredClone(improved);if(invalid==="stored")a.item.flags.spikependium={storedSpell:{}};
  if(invalid==="spell")a.item.system.identifier="wind-wall";if(invalid==="unowned")a.actor.isOwner=false;
  if(invalid==="no-feat")a.actor.items=list([]);if(invalid==="exhausted")a.actor.items[0].system.activities.get(mod).uses.spent=1;
  if(invalid==="duration")a.duration.getEffectData=()=>({});if(invalid==="not-concentration")a.duration.concentration=false;
  if(invalid==="begin-disabled")use.concentration.begin=false;
  const plan=updates();assert.equal(prepareStormUpdates(a,use,plan),false,invalid);assert.equal(plan.item.length,1);
  if(["stored","spell","unowned","no-feat","exhausted"].includes(invalid)){const options={configure:false,applicationClass:UsageDialog};prepareStormDialog(a,{},options);assert.equal(options.configure,false);}
}
for(const invalid of ["declined","deleted","changed-owner","changed-item","wrong-counter"]){
  const a=caster();prepareStormUpdates(a,improved,updates());const resource=a.actor.items[0].system.activities.get(mod);resource.uses.spent=1;
  if(invalid==="declined")prepareStormUpdates(a,{},updates());if(invalid==="deleted")a.actor.items=[];
  if(invalid==="wrong-counter")resource.uses.spent=0;
  const data=nativeData();prepareStormConcentration(invalid==="changed-owner"?{}:a.actor,invalid==="changed-item"?{}:a.item,data,a);
  assert.equal(data.system.changes.length,1,invalid);
}
const pc=caster().actor;pc.effects=[{flags:{spikependium:{improvedStorm:true}},active:true,duration:{expired:false,remaining:60}}];
assert.equal(hasStormFlight(pc),true);assert.equal(stormFlightSpeed(pc),15);assert.equal(conditionalState(pc,{}).stormFlightSpeed,15);
for(const[speed,expected]of [[45,22],[60,30],[0,0],[-5,0],["not-prepared",0]]){pc.system.attributes.movement.speeds.walk=speed;assert.equal(stormFlightSpeed(pc),expected);}
pc.system.attributes.movement.units="m";pc.system.attributes.movement.speeds.walk=9;assert.equal(stormFlightSpeed(pc),4.5);
pc.system.attributes.movement.speeds.walk=13.5;assert.equal(stormFlightSpeed(pc),6.6,"округление происходит в футах книги");
pc.system.attributes.movement.units="ft";pc.system.attributes.movement.speeds.walk=30;
for(const status of ["noMovement","crawl","antimagic"]){pc.statuses.add(status);assert.equal(stormFlightSpeed(pc),0,status);pc.statuses.clear();}
pc.effects[0].active=false;assert.equal(hasStormFlight(pc),false);assert.equal(conditionalState(pc,{}).stormFlightSpeed,undefined);pc.effects[0].active=true;
pc.effects[0].duration.expired=true;assert.equal(hasStormFlight(pc),false);pc.effects[0].duration.expired=false;
pc.effects[0].duration.remaining=0;assert.equal(hasStormFlight(pc),false);pc.effects[0].duration.remaining=60;
pc.system.attributes.movement.speeds.fly="max(0, @spikependium.stormFlightSpeed)";
assert.equal(finalizeStormMovement.call(pc,()=>"native", "final"),"native");assert.equal(pc.system.attributes.movement.speeds.fly,15);assert.equal(pc.system.attributes.movement.max,30);
pc.system.attributes.movement.speeds.walk=90;pc.system.attributes.movement.speeds.fly="max(0, @spikependium.stormFlightSpeed)";
finalizeStormMovement.call(pc,()=>{},"final");assert.equal(pc.system.attributes.movement.speeds.fly,45);assert.equal(pc.system.attributes.movement.max,90);
pc.system.attributes.movement.speeds.walk=30;pc.system.attributes.movement.max=30;
pc.system.attributes.movement.speeds.fly="max(60, @spikependium.stormFlightSpeed)";finalizeStormMovement.call(pc,()=>{},"final");
assert.equal(pc.system.attributes.movement.speeds.fly,60,"более высокая существующая скорость полёта сохраняется");assert.equal(pc.system.attributes.movement.max,60);
pc.system.attributes.movement.speeds.fly=60;pc.statuses.add("antimagic");finalizeStormMovement.call(pc,()=>{},"final");assert.equal(pc.system.attributes.movement.speeds.fly,60);
pc.statuses.clear();pc.effects=[];pc.system.attributes.movement.speeds.fly=0;finalizeStormMovement.call(pc,()=>{},"final");assert.equal(pc.system.attributes.movement.speeds.fly,0);
pc.effects=[{flags:{spikependium:{improvedStorm:true}},active:true,duration:{expired:false}}];pc.system.attributes.movement.speeds.fly="not-yet-prepared";
finalizeStormMovement.call(pc,()=>{},"initial");assert.equal(pc.system.attributes.movement.speeds.fly,"not-yet-prepared");

const hooks=new Map(),init=[];globalThis.Hooks={on(name,fn){const callbacks=hooks.get(name)??[];callbacks.push(fn);hooks.set(name,callbacks);},once(name,fn){if(name==="init")init.push(fn);}};
await import("../scripts/spikependium.mjs");for(const[name,fn]of [["dnd5e.preUseActivity",canUseStormModifier],
  ["dnd5e.preActivityConsumption",canUseStormModifier],["dnd5e.preBeginConcentrating",prepareStormConcentration]])assert(hooks.get(name).includes(fn));
const registrations=new Map();globalThis.libWrapper={register(module,target,fn){assert(!registrations.has(target));registrations.set(target,fn);}};
globalThis.CONFIG={DND5E:{activityConsumptionTypes:{},activityTypes:{},sourceBooks:{},featureTypes:{feat:{subtypes:{}},class:{subtypes:{}}}}};
dnd5e.registry={spellLists:{register(){}}};init.at(-1)();
pc.statuses.clear();pc.system.attributes.movement.speeds.fly="max(0, @spikependium.stormFlightSpeed)";
assert.equal(registrations.get("CONFIG.Actor.documentClass.prototype.applyActiveEffects").call(pc,()=>"native","final"),"native");
assert.equal(pc.system.attributes.movement.speeds.fly,15,"общая обёртка сохраняет финальную подготовку полёта");
console.log("Улучшенный шторм: выбор при накладывании и совместный расход, проверка оплаты и отмены, полёт в штатной концентрации без отдельного эффекта, динамическая половина скорости/округление/метры, более быстрый полёт, антимагия и условия движения, окончание/подавление и правильная числовая подготовка финальной фазы: OK.");
