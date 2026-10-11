import assert from "node:assert/strict";
import fs from "node:fs";
import { prepareDetectionDialog, prepareDetectionUpdates, canUseDetectionModifier, detectionBlocksAdvantage,
  applyDetectionInitiative, finalizeDetectionInitiative, combatantDetectionInitiative } from "../scripts/dragonmark-detection.mjs";
import { prepareResourceUpdates } from "../scripts/resources.mjs";

const list=items=>Object.assign(items,{get(id){return this.find(i=>i.id===id);}});
const mod="eGrjyYf6D9cgi0Bd";
const doc=JSON.parse(fs.readFileSync(`packs/_source/feats/${fs.readdirSync("packs/_source/feats").find(f=>f.startsWith("feat-greater-detection_"))}`,"utf8"));
assert.equal(doc.system.activities[mod].uses.max,"1");assert.equal(doc.system.activities[mod].uses.recovery[0].period,"lr");
function caster(){
  const resource={...structuredClone(doc.system.activities[mod]),id:mod,uses:{max:1,spent:0,get value(){return this.max-this.spent;}}};
  const item={...structuredClone(doc),id:doc._id,uuid:`Actor.caster.Item.${doc._id}`,system:{activities:new Map([[mod,resource]])}};
  const actor={uuid:"Actor.caster",isOwner:true,items:list([item]),effects:[],statuses:new Set()};
  const profile={id:"baseVision",uuid:"Actor.caster.Item.spell.ActiveEffect.baseVision",type:"base",inCompendium:false,
    system:{changes:[{key:"system.attributes.senses.special",type:"add",phase:"initial",value:";Invisible creatures"},
      {key:"system.attributes.senses.special",type:"add",phase:"initial",value:";Ethereal Plane"}]},
    toObject(){return {_id:this.id,system:structuredClone(this.system),flags:{custom:{preserved:true}},statuses:[]};}};
  return {id:"spellActivity",uuid:"Actor.caster.Item.spell.Activity.spellActivity",flags:{},consumption:{targets:[]},
    actor,item:{type:"spell",name:"See Invisibility",flags:{},system:{identifier:"see-invisibility"}},
    applicableEffects:[profile],duration:{getEffectData(){return {value:1,units:"hours",expiry:"turnStart"};}}};
}
globalThis.ui={notifications:{warn(){},error(){}}};
globalThis.ActiveEffect={implementation:{getEffectStart(){return {time:100};}}};
globalThis.foundry={data:{fields:{BooleanField:class{constructor(data){Object.assign(this,data);}}}}};
class UsageDialog{async _prepareConsumptionContext(){return {fields:[],inputs:{createCheckboxInput(){}},notes:[]};}}
const activity=caster(),config={},dialog={configure:false,applicationClass:UsageDialog};
prepareDetectionDialog(activity,config,dialog);assert.equal(dialog.configure,true);
const app=new dialog.applicationClass();app.config=config;const context=await app._prepareConsumptionContext({});
assert.equal(context.fields[0].name,"spikependium.improvedDetection");assert.equal(context.fields[0].value,false);assert.equal(context.hasConsumption,true);
assert.equal(canUseDetectionModifier({id:mod,item:activity.actor.items[0]}),false);
assert.equal(canUseDetectionModifier(activity),true);assert.equal(canUseDetectionModifier(undefined),true);
const updates=()=>({actor:{},item:[{_id:"spell","system.uses.spent":1}],create:[],delete:[],rolls:[]});
const unchanged=updates();assert.equal(prepareDetectionUpdates(activity,{},unchanged),unchanged);assert.equal(unchanged.operations,undefined);
const improved={spikependium:{improvedDetection:true}};
const changed=await prepareResourceUpdates.call(activity,async()=>updates(),improved);
assert(changed);assert.equal(changed.item.length,2);assert.equal(changed.item[0]["system.uses.spent"],1,"собственный расход заклинания сохраняется");
assert.equal(changed.item[1][`system.activities.${mod}.uses.spent`],1);
assert.equal(activity.actor.items[0].system.activities.get(mod).uses.spent,0,"подготовка не пишет счётчик заранее");
assert.equal(changed.operations.length,1);const operation=changed.operations[0];assert.equal(operation.parent,activity.actor);assert.equal(operation.documentName,"ActiveEffect");
assert.equal(operation.action,"create");const data=operation.data[0];assert.equal(data._id,undefined);assert.equal(data.transfer,false);
assert.deepEqual(data.start,{time:100});assert.deepEqual(data.duration,{value:1,units:"hours",expiry:"turnStart",expired:false});
assert.equal(data.system.magical,true);assert.equal(data.system.origin.activity,activity.uuid);assert.equal(data.system.origin.profile,"baseVision");
assert.equal(data.system.changes.length,3);assert.deepEqual(data.system.changes.slice(0,2),activity.applicableEffects[0].system.changes);
assert.deepEqual(data.system.changes[2],{key:"system.attributes.init.roll.mode",value:"1",type:"add",phase:"initial"});
assert.equal(data.flags.custom.preserved,true);assert.equal(data.flags.spikependium.improvedDetection,true);
assert.equal(data._stats.duplicateSource,activity.applicableEffects[0].uuid);
const merged=updates();merged.item.push({_id:activity.actor.items[0].id,other:"kept"});prepareDetectionUpdates(activity,improved,merged);
assert.equal(merged.item.length,2);assert.equal(merged.item[1].other,"kept");
for(const invalid of ["stored","spell","unowned","no-feat","exhausted","duration"]){
  const a=caster();if(invalid==="stored")a.item.flags.spikependium={storedSpell:{}};
  if(invalid==="spell")a.item.system.identifier="invisibility";if(invalid==="unowned")a.actor.isOwner=false;
  if(invalid==="no-feat")a.actor.items=list([]);if(invalid==="exhausted")a.actor.items[0].system.activities.get(mod).uses.spent=1;
  if(invalid==="duration")a.duration.getEffectData=()=>({});
  const plan=updates();assert.equal(prepareDetectionUpdates(a,improved,plan),false,invalid);assert.equal(plan.item.length,1);assert.equal(plan.operations,undefined);
  if(invalid!=="duration"){const options={configure:false,applicationClass:UsageDialog};prepareDetectionDialog(a,{},options);assert.equal(options.configure,false,invalid);}
}
activity.actor.effects=[{id:"old",flags:{spikependium:{improvedDetection:true}}},{id:"duplicate",flags:{spikependium:{improvedDetection:true}}}];
const replace=updates();prepareDetectionUpdates(activity,improved,replace);assert.equal(replace.operations[0].action,"update");
assert.equal(replace.operations[0].updates[0]._id,"old");assert.deepEqual(replace.operations[1].ids,["duplicate"]);
activity.actor.effects=[{id:"native",flags:{},_stats:{duplicateSource:activity.applicableEffects[0].uuid}}];
const native=updates();prepareDetectionUpdates(activity,improved,native);assert.equal(native.operations[0].action,"update");assert.equal(native.operations[0].updates[0]._id,"native");

const scene={tokens:list([]),grid:{units:"ft",measurePath([a,b]){return {distance:Math.hypot(a.x-b.x,a.y-b.y,a.elevation-b.elevation)};}}};
globalThis.canvas={ready:true,scene};globalThis.dnd5e={utils:{convertLength(value,from,to){assert.equal(to,"ft");return from==="m"?value/0.3048:value;}}};
globalThis.CONFIG={Dice:{D20Roll:{ADV_MODE:{NORMAL:0,ADVANTAGE:1,DISADVANTAGE:-1}}}};
function token(actor,x=0,disposition=1){const t={parent:scene,actor,x,y:0,elevation:0,level:"ground",disposition,
  getOccupiedGridSpaceOffsets(){return [];},getCenterPoint(){return {x:this.x,y:this.y,elevation:this.elevation};}};
  actor.token=t;actor.getActiveTokens=()=>[t];scene.tokens.push(t);return t;}
const owner=activity.actor;owner.effects=[{flags:{spikependium:{improvedDetection:true}},active:true,duration:{expired:false,remaining:3600}}];
const casterToken=token(owner,0,1),enemy={uuid:"Actor.enemy",effects:[],statuses:new Set()},enemyToken=token(enemy,30,-1);
const ally={uuid:"Actor.ally",effects:[],statuses:new Set()},allyToken=token(ally,5,1);
assert.equal(detectionBlocksAdvantage(enemy,enemyToken),true);assert.equal(detectionBlocksAdvantage(ally,allyToken),false);
assert.equal(detectionBlocksAdvantage(owner,casterToken),false);
enemyToken.x=30.01;assert.equal(detectionBlocksAdvantage(enemy,enemyToken),false);enemyToken.x=30;
enemyToken.elevation=1;assert.equal(detectionBlocksAdvantage(enemy,enemyToken),false);enemyToken.x=0;enemyToken.elevation=30;
assert.equal(detectionBlocksAdvantage(enemy,enemyToken),true);enemyToken.elevation=0;
enemyToken.level="upper";enemyToken.elevation=10;assert.equal(detectionBlocksAdvantage(enemy,enemyToken),true,"соседний этаж не исключает врага в радиусе");
enemyToken.elevation=31;assert.equal(detectionBlocksAdvantage(enemy,enemyToken),false);enemyToken.elevation=0;enemyToken.level="ground";
for(const side of [0,undefined]){casterToken.disposition=side;assert.equal(detectionBlocksAdvantage(enemy,enemyToken),false);}casterToken.disposition=1;
for(const side of [0,undefined]){enemyToken.disposition=side;assert.equal(detectionBlocksAdvantage(enemy,enemyToken),false);}enemyToken.disposition=-1;
owner.effects[0].active=false;assert.equal(detectionBlocksAdvantage(enemy,enemyToken),false);owner.effects[0].active=true;
owner.effects[0].duration.remaining=0;assert.equal(detectionBlocksAdvantage(enemy,enemyToken),false);owner.effects[0].duration.remaining=3600;
owner.effects[0].duration.expired=true;assert.equal(detectionBlocksAdvantage(enemy,enemyToken),false);owner.effects[0].duration.expired=false;
owner.statuses.add("antimagic");assert.equal(detectionBlocksAdvantage(enemy,enemyToken),false);owner.statuses.clear();
enemy.statuses.add("antimagic");assert.equal(detectionBlocksAdvantage(enemy,enemyToken),false);enemy.statuses.clear();
scene.grid.units="m";enemyToken.x=30*0.3048;assert.equal(detectionBlocksAdvantage(enemy,enemyToken),true);
enemyToken.x+=0.01;assert.equal(detectionBlocksAdvantage(enemy,enemyToken),false);scene.grid.units="ft";enemyToken.x=5;
scene.grid.getCenterPoint=offset=>({x:offset.j*5,y:offset.i*5});casterToken.getOccupiedGridSpaceOffsets=()=>[{i:0,j:0},{i:0,j:1},{i:0,j:2}];
enemyToken.x=40;assert.equal(detectionBlocksAdvantage(enemy,enemyToken),true);enemyToken.x=40.01;assert.equal(detectionBlocksAdvantage(enemy,enemyToken),false);
casterToken.getOccupiedGridSpaceOffsets=()=>[];enemyToken.x=5;
const roll=(mode=1,disadvantage=false)=>({options:{advantage:true,advantageMode:mode,disadvantage,minimum:10,maximum:19},
  configureModifiers(){this.configured=(this.configured??0)+1;}});
const advantage=roll();applyDetectionInitiative(enemy,advantage,enemyToken);assert.equal(advantage.options.advantage,false);assert.equal(advantage.options.advantageMode,0);
assert.equal(advantage.options.minimum,10);assert.equal(advantage.options.maximum,19);assert.equal(advantage.configured,1);
const disadvantage=roll(0,true);applyDetectionInitiative(enemy,disadvantage,enemyToken);assert.equal(disadvantage.options.advantageMode,-1);
const forced=roll(-1);applyDetectionInitiative(enemy,forced,enemyToken);assert.equal(forced.options.advantageMode,-1);
const completed=roll();completed._evaluated=true;applyDetectionInitiative(enemy,completed,enemyToken);assert.equal(completed.options.advantageMode,1);
const friendly=roll();applyDetectionInitiative(ally,friendly,allyToken);assert.equal(friendly.options.advantageMode,1);
const dialogRoll=roll();finalizeDetectionInitiative([dialogRoll],{subject:enemy});assert.equal(dialogRoll.options.advantageMode,0);
const bulk=roll();assert.equal(combatantDetectionInitiative.call({actor:enemy,token:enemyToken},()=>bulk),bulk);assert.equal(bulk.options.advantageMode,0);
enemyToken.x=100;const outside=roll();combatantDetectionInitiative.call({actor:enemy,token:enemyToken},()=>outside);assert.equal(outside.options.advantageMode,1);
enemyToken.x=5;const oldScene=enemyToken.parent;enemyToken.parent={tokens:list([enemyToken]),grid:scene.grid};
assert.equal(detectionBlocksAdvantage(enemy,enemyToken),false);enemyToken.parent=oldScene;
delete enemy.token;enemy.getActiveTokens=()=>[];assert.equal(detectionBlocksAdvantage(enemy),false);
enemy.getActiveTokens=()=>[enemyToken,{...enemyToken,x:100}];assert.equal(detectionBlocksAdvantage(enemy),false);
const specific=roll();combatantDetectionInitiative.call({actor:enemy,token:enemyToken},()=>specific);assert.equal(specific.options.advantageMode,0,"трекер использует токен конкретного участника");

const hooks=new Map(),init=[];globalThis.Hooks={on(name,fn){const callbacks=hooks.get(name)??[];callbacks.push(fn);hooks.set(name,callbacks);},once(name,fn){if(name==="init")init.push(fn);}};
await import("../scripts/spikependium.mjs");
for(const[name,fn]of [["dnd5e.preUseActivity",canUseDetectionModifier],["dnd5e.preActivityConsumption",canUseDetectionModifier],
  ["dnd5e.postInitiativeDialogRollConfiguration",finalizeDetectionInitiative],["dnd5e.preRollInitiative",applyDetectionInitiative]])assert(hooks.get(name).includes(fn));
const registrations=new Map();globalThis.libWrapper={register(module,target,fn){assert(!registrations.has(target));registrations.set(target,fn);}};
CONFIG.DND5E={activityTypes:{},sourceBooks:{},featureTypes:{feat:{subtypes:{}},class:{subtypes:{}}}};
dnd5e.registry={spellLists:{register(){}}};init.at(-1)();assert.equal(registrations.get("CONFIG.Combatant.documentClass.prototype.getInitiativeRoll"),combatantDetectionInitiative);
console.log("Улучшенное обнаружение: выбор при накладывании, общий расход с заклинанием, длительность и нативное преимущество, исходные чувства в одном эффекте, обновление без дублей, отказ/недоступные применения, враги/союзники/дистанция/высота/метры/уровни/подавление, окна и массовая инициатива: OK.");
