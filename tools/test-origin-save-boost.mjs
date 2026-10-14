import assert from "node:assert/strict";
import fs from "node:fs";
import { recordOriginSaveWindow, prepareOriginSaveBoost, captureOriginSaveBoost, prepareOriginSaveBoostUpdates,
  recordOriginSaveBoostConsumption, recordOriginSaveBoostUsage, canRollOriginSaveBoost, originSaveBoostRoll,
  applyOriginSaveBoost, rollOriginSaveBoost, resumeOriginSaveBoosts, originSaveBoostDeltaLabel, resilientSaveUse } from "../scripts/arcana-save-boost.mjs";
import { prepareReactionUpdates, recordReaction, recordReactionConsumption, reactionAvailable, canUseReaction } from "../scripts/reactions.mjs";
import { nativeConsume, nativeRefund, getDeltas, nativeSaveRollFailure, nativeD20FinalizeConfig } from "./data/dnd5e-reaction-native.mjs";
import { anatomyStrideChange, prepareAnatomySave, buildAnatomySave, finalizeAnatomySave } from "../scripts/arcana-anatomy.mjs";
import { nativePrepareMovement, setMovementContext } from "./data/dnd5e-arcana-native.mjs";
const file=fs.readdirSync("packs/_source/feats").find(f=>f.startsWith("feat-magic-omen_"));
const data=JSON.parse(fs.readFileSync("packs/_source/feats/"+file,"utf8"));
assert.equal(data.system.source.book,"AU");assert.equal(data.system.source.page,"28");
assert.equal(data.system.type.subtype,"origin");
assert.equal(data.system.advancement[0].configuration.items[0].uuid,"Compendium.dnd5e.spells24.Item.phbsplGuidance00");
assert.deepEqual(data.system.advancement[0].configuration.spell.ability,["int","wis","cha"]);
const actionData=Object.values(data.system.activities)[0];
assert.equal(actionData.activation.type,"reaction");assert.equal(actionData.uses.max,"@prof");
assert.equal(actionData.range.value,"30");assert.equal(actionData.range.units,"ft");
assert.equal(actionData.uses.recovery[0].period,"lr");assert.equal(actionData.roll.formula,"1d4");
assert.equal(actionData.consumption.targets[0].type,"activityUses");
const get=(obj,path)=>path.split(".").reduce((o,k)=>o?.[k],obj);
const set=(obj,path,value)=>{const keys=path.split("."),last=keys.pop();keys.reduce((o,k)=>o[k]??={},obj)[last]=structuredClone(value);};
const flatten=(obj,prefix="",out={})=>{for(const [key,value] of Object.entries(obj)){
  const path=prefix+key;if(value&&typeof value==="object"&&!Array.isArray(value))flatten(value,path+".",out);else out[path]=value;
}return out;};
const list=items=>Object.assign(items,{get(id){return this.find(i=>i.id===id);}});
Number.isNumeric=n=>(typeof n==="number"||typeof n==="string"&&n.trim()!=="")&&Number.isFinite(Number(n));
class D20 {
  constructor(json){this.json=structuredClone(json);this._evaluated=json.evaluated;this.options=this.json.options;this.total=json.total;this.formula=json.formula;}
  get isFailure(){return nativeSaveRollFailure.call(this);}
  toJSON(){return structuredClone(this.json);}
  static fromData(json){return new this(json);}
}
class Dialog {constructor(config){this.config=config;}async _prepareConsumptionContext(context){return context;}}
let documents=new Map(),counter=0,warnings=[],writes=0,dieRolls=0,failBatch=false;
globalThis.fromUuidSync=uuid=>documents.get(uuid);
globalThis.ui={notifications:{warn(s){warnings.push(s);},error(){}}};
globalThis.CONFIG={Dice:{D20Roll:D20}};
globalThis.foundry={utils:{getProperty:get,setProperty:set,flattenObject:flatten,isEmpty:o=>!Object.keys(o).length,
  randomID:()=>`BOOST${String(++counter).padStart(11,"0")}`},data:{fields:{StringField:class {constructor(o){Object.assign(this,o);}},BooleanField:class {}}},
  dice:{terms:{OperatorTerm:class {constructor(o){this.operator=o.operator;}toJSON(){return {class:"OperatorTerm",operator:this.operator,options:{}};}}}},
  documents:{async modifyBatch(operations){if(failBatch){failBatch=false;throw Error("batch");}
    for(const operation of operations){assert.equal(operation.documentName,"ChatMessage");for(const update of operation.updates){
      const card=game.messages.get(update._id);assert.ok(card);writes++;
      for(const [path,value] of Object.entries(update)){if(path==="_id")continue;
        if(path==="rolls")card.rolls=value;else set(card,path,value);
      }
    }}
  }}};
globalThis.ActiveEffect={implementation:{getEffectStart:()=>({time:game.time.worldTime})}};
globalThis.canvas={ready:false};
globalThis.dnd5e={utils:{convertLength:(v,u)=>u==="m"?v/0.3048:v}};
function setup(other=false,doc=data){
  documents=new Map();warnings=[];writes=0;dieRolls=0;failBatch=false;
  const player={id:"player",isGM:false},gm={id:"gm",isGM:true,isActiveGM:true},users=[player,gm];users.activeGM=null;
  const actor={uuid:"Actor.caster",id:"caster",name:"Провидец",isOwner:true,flags:{},effects:list([]),statuses:new Set(),
    system:{isCreature:true},testUserPermission:u=>u?.isGM||u?.id===player.id};
  const target=other?{...actor,uuid:"Scene.test.Token.target.Actor.target",id:"target",name:"Союзник",flags:{},statuses:new Set()}:actor;
  const scene={uuid:"Scene.test",grid:{units:"ft",measurePath:([a,b])=>({distance:Math.hypot(b.x-a.x,b.y-a.y,(b.elevation??0)-(a.elevation??0))})}};
  const token=(id,owner,x)=>({uuid:`Scene.test.Token.${id}`,actor:owner,parent:scene,x,elevation:0,
    getOccupiedGridSpaceOffsets:()=>[],getCenterPoint(){return {x:this.x,y:0,elevation:this.elevation};}});
  const source=token("caster",actor,0),destination=other?token("target",target,30):source;
  const chosenAction=Object.values(doc.system.activities)[0];
  const feat={...structuredClone(doc),id:doc._id,uuid:`${actor.uuid}.Item.${doc._id}`};
  const activity={...structuredClone(chosenAction),id:chosenAction._id,uuid:`${feat.uuid}.Activity.${chosenAction._id}`,item:feat,actor,
    getUsageToken:()=>source};
  Object.defineProperty(activity.uses,"value",{get:()=>3-activity.uses.spent});
  feat.system.activities=new Map([[activity.id,activity]]);actor.items=list([feat]);
  globalThis.game={user:player,users,combats:[],combat:null,time:{worldTime:100},messages:list([])};
  const save={id:"save",uuid:"ChatMessage.save",type:"save",author:player,whisper:[],blind:false,flags:{},
    system:{type:"ability",forceSuccess:false,displayResult:true},rolls:[new D20({class:"D20Roll",formula:"1d20 + 4",data:{},
      evaluated:true,total:11,options:{target:14,advantageMode:0},terms:[{class:"D20Die",number:1,faces:20,
        results:[{result:7,active:true}],options:{}},{class:"OperatorTerm",operator:"+",options:{}},{class:"NumericTerm",number:4,options:{}}]})],
    getAssociatedActor:()=>target,getAssociatedToken:()=>destination,canUserModify:u=>u?.isGM||u?.id===player.id,
    updateSource(update){for(const [p,v]of Object.entries(update))set(this,p,v);}};
  recordOriginSaveWindow(save);game.messages.push(save);
  for(const doc of [actor,target,source,destination,feat,activity,save])documents.set(doc.uuid,doc);
  const config={consume:{action:true,resources:true},spikependium:{originSave:save.uuid,originSaveVisible:other}};
  const message={data:{system:{}}};
  globalThis.Hooks={call(name,a,c,m){
    if(name==="dnd5e.preActivityConsumption")return canUseReaction(a,c)&&captureOriginSaveBoost(a,c,m)!==false;
    if(name==="dnd5e.postActivityConsumption"){recordOriginSaveBoostConsumption(a,c,m);recordReactionConsumption(a,c,m);}return true;
  }};
  activity._prepareUsageUpdates=async cfg=>{
    const updates={actor:{},activity:{"uses.spent":activity.uses.spent+1},item:[],create:[],delete:[],rolls:[]};
    if(!cfg.consume.resources||!activity.uses.value)updates.activity={};
    const reacted=prepareReactionUpdates(activity,cfg,updates);
    return reacted&&prepareOriginSaveBoostUpdates(activity,cfg,reacted);
  };
  const apply=async updates=>{
    const deltas={actor:getDeltas(actor,updates.actor),item:{[feat.id]:getDeltas(feat,{[`system.activities.${activity.id}.uses.spent`]:updates.activity["uses.spent"]})}};
    for(const [p,v]of Object.entries(updates.actor))set(actor,p,v);
    activity.uses.spent=updates.activity["uses.spent"];return deltas;
  };
  const use=async()=>{
    const updates=await nativeConsume.call(activity,config,message,apply);if(!updates)return;
    recordReaction(activity,message);recordOriginSaveBoostUsage(activity,message);
    const origin={id:`usage${counter}`,uuid:`ChatMessage.usage${counter}`,type:"usage",author:player,
      ...structuredClone(message.data),getAssociatedActivity:()=>activity,
      updateSource(update){for(const [p,v]of Object.entries(update))set(this,p,v);},
      async setFlag(module,p,v){set(this,`flags.${module}.${p}`,v);}};
    recordOriginSaveWindow(origin);game.messages.push(origin);documents.set(origin.uuid,origin);
    return origin;
  };
  activity.rollFormula=async(_cfg,_dialog,chat)=>{
    assert.equal(canRollOriginSaveBoost({subject:activity},{},chat),undefined);dieRolls++;
    const faces=activity.roll.formula==="1d6"?6:4,total=faces===6?5:3;
    const json={class:"BasicRoll",formula:activity.roll.formula,evaluated:true,total,options:{},terms:[{class:"Die",number:1,faces,
      results:[{result:total,active:true}],options:{}}]};
    const origin=game.messages.get(chat.data.system.origin);
    const card={id:`die${counter}`,uuid:`ChatMessage.die${counter}`,type:"generic",author:player,flags:{},...chat.data,
      rolls:[{_evaluated:true,total,formula:activity.roll.formula,toJSON:()=>structuredClone(json)}],getAssociatedActivity:()=>activity,
      getOriginatingMessage:()=>origin,updateSource(update){for(const [p,v]of Object.entries(update))set(this,p,v);}};
    recordOriginSaveWindow(card);game.messages.push(card);documents.set(card.uuid,card);return card.rolls;
  };
  const refund=async origin=>nativeRefund.call(activity,origin.system.deltas,async updates=>{
    for(const [p,v]of Object.entries(updates.actor))set(actor,p,v);
    for(const item of updates.item)activity.uses.spent=item[`system.activities.${activity.id}.uses.spent`];
  });
  return {actor,target,activity,save,config,message,use,refund,player,gm,source,destination,scene};
}
let f=setup();const firstDie=structuredClone(f.save.rolls[0].toJSON().terms[0]);
const dialog={applicationClass:Dialog};prepareOriginSaveBoost(f.activity,f.config,dialog);
const context=await new dialog.applicationClass(f.config)._prepareConsumptionContext({fields:[],inputs:{createCheckboxInput(){}}});
assert.equal(context.fields[0].field.choices[f.save.uuid],"Провидец");
assert.equal(f.activity.uses.spent,0);assert.equal(reactionAvailable(f.actor),true,"opening/cancelling a dialog spends nothing");
let origin=await f.use();assert.ok(origin);assert.equal(f.activity.uses.spent,1);assert.equal(reactionAvailable(f.actor),false);
assert.ok(origin.system.deltas.actor.some(d=>d.keyPath.endsWith(".active")&&d.delta===1));
assert.ok(origin.system.deltas.actor.some(d=>d.keyPath.includes("reactionCasts")&&d.delta===1));
await rollOriginSaveBoost(f.activity,{}, {message:origin});assert.equal(dieRolls,1);assert.equal(f.save.rolls[0].total,14);
assert.equal(f.save.rolls[0].isFailure,false);assert.deepEqual(f.save.rolls[0].toJSON().terms[0],firstDie,"original d20 results are preserved");
await rollOriginSaveBoost(f.activity,{}, {message:origin});await resumeOriginSaveBoosts();assert.equal(dieRolls,1);assert.equal(writes,2);
assert.equal(canRollOriginSaveBoost({subject:f.activity},{},{data:{system:{origin:origin.id}}}),false);
await f.refund(origin);await resumeOriginSaveBoosts(f.actor);assert.equal(f.save.rolls[0].total,11);assert.equal(f.save.rolls[0].isFailure,true);
assert.equal(f.activity.uses.spent,0);assert.equal(reactionAvailable(f.actor),true);assert.equal(dieRolls,1);
await applyOriginSaveBoost(origin);assert.equal(f.save.rolls[0].total,11,"refunded receipt does not reapply an old bonus");
assert.deepEqual(originSaveBoostDeltaLabel.call({keyPath:`flags.spikependium.saveBoosts.${origin.flags.spikependium.originSaveBoost.event}.active`},()=>({label:"raw"})),{label:"Бонус спасброска"});
f=setup(true);assert.equal(captureOriginSaveBoost(f.activity,f.config,f.message),undefined);
f.destination.x=31;assert.equal(captureOriginSaveBoost(f.activity,f.config,f.message),false);
f.destination.x=0;f.destination.elevation=31;assert.equal(captureOriginSaveBoost(f.activity,f.config,f.message),false);
f.destination.elevation=0;f.destination.parent={};assert.equal(captureOriginSaveBoost(f.activity,f.config,f.message),false);
f.destination.parent=f.scene;f.scene.grid.units="m";f.destination.x=9.144;assert.equal(captureOriginSaveBoost(f.activity,f.config,f.message),undefined);
f.destination.x=9.15;assert.equal(captureOriginSaveBoost(f.activity,f.config,f.message),false);
f=setup(true);f.config.spikependium.originSaveVisible=false;assert.equal(await f.use(),undefined);assert.equal(f.activity.uses.spent,0);
f=setup();const linked={...f.source,uuid:"Scene.test.Token.linked",x:31};f.save.getAssociatedToken=()=>linked;
assert.equal(await f.use(),undefined,"linked copies of one Actor still use the physical 30-foot limit");
linked.x=30;assert.equal(await f.use(),undefined,"a different linked token requires visibility confirmation");
f.config.spikependium.originSaveVisible=true;assert.ok(await f.use());
f=setup();game.time.worldTime++;assert.equal(await f.use(),undefined);
f=setup();f.save.system.forceSuccess=true;assert.equal(await f.use(),undefined);
f=setup();f.save.system.displayResult=false;assert.equal(await f.use(),undefined);
f=setup();f.save.blind=true;assert.equal(await f.use(),undefined);
f=setup();f.save.whisper=["gm"];f.save.author=f.gm;assert.equal(await f.use(),undefined);
f=setup();f.save.rolls[0].options.target=null;assert.equal(await f.use(),undefined);
f=setup();f.actor.statuses.add("stunned");assert.equal(await f.use(),undefined);
f=setup();f.config.consume.action=false;assert.equal(await f.use(),undefined);assert.equal(f.activity.uses.spent,0);
f=setup();f.config.consume.resources=false;assert.equal(await f.use(),undefined);assert.equal(f.activity.uses.spent,0);
f=setup();f.message.create=false;assert.equal(await f.use(),undefined);
f=setup(true);f.save.canUserModify=u=>u.isGM;assert.equal(await f.use(),undefined);
f=setup(true);game.users.activeGM=f.gm;f.save.canUserModify=u=>u.isGM;origin=await f.use();
await rollOriginSaveBoost(f.activity,{}, {message:origin});assert.equal(dieRolls,1);assert.equal(f.save.rolls[0].total,11);
game.user=f.gm;await resumeOriginSaveBoosts();assert.equal(f.save.rolls[0].total,14);
f=setup();f.save.whisper=["player","gm"];origin=await f.use();origin.whisper=[];recordOriginSaveWindow(origin);
assert.deepEqual(origin.whisper,["player","gm"]);await rollOriginSaveBoost(f.activity,{}, {message:origin});
assert.deepEqual(game.messages.find(c=>c.type==="generic").whisper,["player","gm"]);
f=setup();origin=await f.use();failBatch=true;await assert.rejects(()=>rollOriginSaveBoost(f.activity,{}, {message:origin}),/batch/);
assert.equal(f.save.rolls[0].total,11);await resumeOriginSaveBoosts();assert.equal(f.save.rolls[0].total,14);assert.equal(dieRolls,1);
f=setup();origin=await f.use();await rollOriginSaveBoost(f.activity,{}, {message:origin});
f.save.rolls=[new D20({...f.save.rolls[0].toJSON(),total:20})];await f.refund(origin);await resumeOriginSaveBoosts();
assert.equal(f.save.rolls[0].total,20,"external reroll is never overwritten by an old refund");
const warned=warnings.length;await resumeOriginSaveBoosts();assert.equal(warnings.length,warned,"review warning is not repeated");
f=setup();f.save.system.type="death";origin=await f.use();await rollOriginSaveBoost(f.activity,{}, {message:origin});
assert.equal(f.save.rolls[0].total,14);assert.ok(warnings.some(w=>w.includes("испытания смерти")));
f=setup();f.save.system.type="concentration";f.save.system.concentrationBroken=true;
origin=await f.use();await rollOriginSaveBoost(f.activity,{}, {message:origin});
assert.equal(f.save.system.concentrationBroken,true);assert.ok(warnings.some(w=>w.includes("прерванной концентрации")));
f=setup();f.save.rolls[0]=new D20({...f.save.rolls[0].toJSON(),options:{target:"14",advantageMode:1}});
origin=await f.use();await rollOriginSaveBoost(f.activity,{}, {message:origin});
assert.equal(f.save.rolls[0].options.target,"14");assert.equal(f.save.rolls[0].options.advantageMode,1);assert.equal(f.save.rolls[0].total,14);
game.time.worldTime=106;await resumeOriginSaveBoosts();assert.equal(f.save.rolls[0].total,14,"an instantaneous bonus survives the next reaction window");
f=setup();origin=await f.use();f.save.system.forceSuccess=true;await rollOriginSaveBoost(f.activity,{}, {message:origin});
assert.equal(f.save.rolls[0].total,14);assert.equal(f.save.system.forceSuccess,true,"a separate legendary resistance is preserved");
f=setup();origin=await f.use();f.save.rolls=[new D20({...f.save.rolls[0].toJSON(),total:19})];
await rollOriginSaveBoost(f.activity,{}, {message:origin});assert.equal(f.save.rolls[0].total,19);assert.ok(warnings.length);
f=setup();origin=await f.use();await rollOriginSaveBoost(f.activity,{}, {message:origin});
await f.refund(origin);await resumeOriginSaveBoosts({documentName:"ActorDelta",parent:{actor:f.actor}});assert.equal(f.save.rolls[0].total,11);
f=setup();origin=await f.use();await rollOriginSaveBoost(f.activity,{}, {message:origin});
await f.refund(origin);origin.system.deltas=null;await resumeOriginSaveBoosts(origin);
assert.equal(f.save.rolls[0].total,11,"refund still removes the bonus after the native card clears its deltas");
const base=new D20({class:"D20Roll",formula:"2d20kh + 4",data:{},evaluated:true,total:11,options:{target:16,advantageMode:1},
  terms:[{class:"D20Die",number:2,faces:20,modifiers:["kh"],results:[{result:7,active:true},{result:2,active:false}],options:{criticalFailure:1}}]});
const bonus={total:3,terms:[{class:"Die",number:1,faces:4,results:[{result:3,active:true}],options:{}}]};
const combined=originSaveBoostRoll(JSON.stringify(base.toJSON()),[bonus,bonus]);
assert.equal(combined.total,17);assert.equal(combined.isFailure,false);assert.deepEqual(combined.toJSON().terms[0],base.toJSON().terms[0]);
assert.equal(base.total,11,"serialized reconstruction leaves the original immutable roll untouched");
{
  const path=fs.readdirSync("packs/_source/feats").find(f=>f.startsWith("feat-transformed-anatomy_"));
  const anatomy=JSON.parse(fs.readFileSync("packs/_source/feats/"+path,"utf8"));
  assert.equal(anatomy.system.source.book,"AU");assert.equal(anatomy.system.source.page,"29");
  assert.equal(anatomy.system.type.subtype,"origin");
  const stride=anatomy.effects[0];assert.equal(stride.transfer,true);assert.equal(stride.system.changes.length,1);
  assert.equal(stride.system.changes[0].key,"system.attributes.movement.bonus");assert.equal(stride.system.changes[0].value,"5");
  assert.equal(stride.flags.spikependium.anatomyStride,true);
  const change={...stride.system.changes[0],effect:stride};
  dnd5e.utils.convertLength=(value,from,to)=>from===to?value:from==="ft"&&to==="m"?value*0.3048:value/0.3048;
  dnd5e.utils.defaultUnits=()=>"ft";
  for(const units of ["ft","m",null]){
    const model={documentName:"Actor",system:{attributes:{movement:{units}}}};
    const result=anatomyStrideChange((_model,c)=>c,model,change);
    assert.equal(Number(result.value),units==="m"?1.524:5);assert.equal(change.value,"5","the stored effect stays in feet");
  }
  dnd5e.utils.defaultUnits=()=>"m";
  assert.equal(Number(anatomyStrideChange((_m,c)=>c,{documentName:"Actor",system:{attributes:{movement:{units:null}}}},change).value),1.524);
  dnd5e.utils.defaultUnits=()=>"ft";
  assert.equal(anatomyStrideChange((_m,c)=>c,{documentName:"Item"},change),change);
  assert.equal(anatomyStrideChange((_m,c)=>c,{documentName:"Actor"},{...change,effect:{flags:{}}}).value,"5");
  CONFIG.DND5E={movementTypes:{walk:{},burrow:{},climb:{},fly:{},swim:{}},defaultUnits:{length:{imperial:"ft"}},conditionTypes:{}};
  setMovementContext({convertLength:(v)=>v,defaultUnits:()=>"ft",simplifyBonus:v=>Number(v)||0,ConditionData:{hasLevels:()=>false}});
  for(const multiplier of [1,0.5]){
    const speeds={walk:30,burrow:0,climb:20,fly:60,swim:0};
    const model={attributes:{movement:{speeds:{...speeds},bonus:5,multiplier,units:"ft"}},_source:{attributes:{movement:{speeds}}},
      parent:{statuses:{has:()=>false,reduce:(_fn,v)=>v},hasConditionEffect:()=>false,flags:{}},traits:{}};
    nativePrepareMovement.call(model,{});
    assert.equal(model.attributes.movement.speeds.walk,35*multiplier);assert.equal(model.attributes.movement.speeds.fly,65*multiplier);
    assert.equal(model.attributes.movement.speeds.burrow,0);assert.equal(model.attributes.movement.speeds.swim,0);
  }
  for(const ability of ["str","dex","int","wis","cha"]){
    f=setup(false,anatomy);f.save.system.ability=ability;assert.equal(await f.use(),undefined);assert.equal(f.activity.uses.spent,0);
  }
  f=setup(true,anatomy);f.save.system.ability="con";assert.equal(await f.use(),undefined,"anatomy cannot boost someone else's Constitution save");
  f=setup(false,anatomy);f.save.system.ability="con";
  const prompt={applicationClass:Dialog};prepareOriginSaveBoost(f.activity,f.config,prompt);
  const fields=await new prompt.applicationClass(f.config)._prepareConsumptionContext({fields:[],inputs:{createCheckboxInput(){}}});
  assert.equal(fields.fields.length,1,"self-only reaction does not require a visibility checkbox");
  origin=await f.use();await rollOriginSaveBoost(f.activity,{}, {message:origin});assert.equal(f.save.rolls[0].total,14);
  await f.refund(origin);origin.system.deltas=null;await resumeOriginSaveBoosts();assert.equal(f.save.rolls[0].total,11);
  class SaveDialog {
    constructor(config){this.config=config;}
    async _prepareConfigurationContext(context){return context;}
    _buildConfig(roll){return roll;}
    _finalizeConfig(config,action){nativeD20FinalizeConfig(config,action);}
  }
  CONFIG.Dice.D20Roll.ADV_MODE={NORMAL:0,ADVANTAGE:1,DISADVANTAGE:-1};
  CONFIG.Dice.D20Roll.DefaultConfigurationDialog=SaveDialog;
  for(const [spell,mode,selected,button,expected]of [
    ["polymorph",0,null,"normal",1],["true-polymorph",-1,null,"normal",0],
    ["fireball",0,true,"normal",1],["fireball",0,false,"normal",0],
    ["polymorph",0,false,"normal",0],["polymorph",0,true,"disadvantage",0],
    ["polymorph",1,true,"advantage",1]
  ]){
    f=setup(false,anatomy);
    const source={id:"spell",getAssociatedItem:()=>({type:"spell",system:{identifier:spell}})};game.messages.push(source);
    const config={subject:f.actor,rolls:[{options:{advantageMode:mode},data:{},parts:["1d20"]}]},dialog={applicationClass:SaveDialog};
    prepareAnatomySave(config,dialog,{data:{system:{origin:"spell"}}});
    assert.equal(config.spikependium.forcedForm,["polymorph","true-polymorph"].includes(spell));
    const instance=new dialog.applicationClass(config),ctx=await instance._prepareConfigurationContext({fields:[]});
    assert.equal(ctx.fields.length,1);
    const final=structuredClone({...config,subject:null});final.subject=config.subject;
    instance._finalizeConfig(final,button);
    const raw=instance._buildConfig(final.rolls[0],{get:()=>selected},0);buildAnatomySave(config,raw);
    assert.equal(raw.options.advantageMode,expected);
    assert.equal(finalizeAnatomySave([{options:raw.options}],config),undefined);
  }
  f=setup(false,anatomy);let config={subject:f.actor,rolls:[{options:{advantageMode:0}}],spikependium:{forcedForm:true}};
  const fast={configure:false};prepareAnatomySave(config,fast,{data:{}});assert.equal(fast.configure,false);
  buildAnatomySave(config,config.rolls[0]);assert.equal(config.rolls[0].options.advantageMode,1,"native fast-forward still receives the source of advantage");
  f.actor.items=[];assert.equal(finalizeAnatomySave([{options:config.rolls[0].options}],config),false);
  const ordinary={subject:{...f.actor,isOwner:false},rolls:[]},unchanged={};prepareAnatomySave(ordinary,unchanged,{data:{}});
  assert.equal(unchanged.applicationClass,undefined);
}
{
  const file=fs.readdirSync("packs/_source/feats").find(f=>f.startsWith("feat-spell-resilient_"));
  const resilient=JSON.parse(fs.readFileSync("packs/_source/feats/"+file,"utf8"));
  assert.deepEqual([resilient.system.source.book,resilient.system.source.page,resilient.system.prerequisites.level], ["AU","32",4]);
  const [asi,resistance]=resilient.system.advancement;
  assert.equal(asi.type,"AbilityScoreImprovement");assert.deepEqual(asi.configuration.locked,["str","int","wis","cha"]);
  assert.equal(asi.configuration.points,1);assert.equal(asi.configuration.cap,1);assert.equal(asi.configuration.max,20);
  assert.equal(resistance.type,"Trait");assert.deepEqual(resistance.configuration.choices,[{count:1,pool:["dr:thunder","dr:radiant","dr:necrotic","dr:psychic"]}]);
  const a=Object.values(resilient.system.activities)[0];assert.equal(a.activation.type,"special");assert.equal(a.roll.formula,"1d6");assert.equal(a.uses.max,"@prof");
  let f=setup(false,resilient);
  assert.equal(await f.use(),undefined,"nonmagical saving throw is rejected before spending anything");assert.equal(f.activity.uses.spent,0);
  f.config.spikependium.originSaveMagical=true;
  f.actor.effects.push({active:true,duration:{},flags:{spikependium:{noReactions:true}}});
  assert.equal(reactionAvailable(f.actor),false);
  const dialog={applicationClass:Dialog};prepareOriginSaveBoost(f.activity,f.config,dialog);
  const fields=await new dialog.applicationClass(f.config)._prepareConsumptionContext({fields:[],inputs:{createCheckboxInput(){}}});
  assert.equal(fields.fields.length,2);assert.equal(fields.fields[1].name,"spikependium.originSaveMagical");
  let origin=await f.use();assert.ok(origin);assert.equal(f.activity.uses.spent,1);
  assert.equal(origin.flags.spikependium.originSaveBoost.reaction,null);assert.equal(f.actor.flags.spikependium.reactionId,undefined);
  await rollOriginSaveBoost(f.activity,{}, {message:origin});assert.equal(dieRolls,1);assert.equal(f.save.rolls[0].total,16);
  assert.equal(f.save.rolls[0].formula,"1d20 + 4 + 1d6");assert.equal(f.save.rolls[0].isFailure,false);
  await rollOriginSaveBoost(f.activity,{}, {message:origin});await resumeOriginSaveBoosts();assert.equal(dieRolls,1);
  await f.refund(origin);await resumeOriginSaveBoosts(f.actor);assert.equal(f.save.rolls[0].total,11);assert.equal(f.activity.uses.spent,0);
  assert.equal(reactionAvailable(f.actor),false,"bonus and refund do not spend or restore reactions");
  f=setup(false,resilient);f.save.getOriginatingMessage=()=>({getAssociatedItem:()=>({type:"spell"})});
  origin=await f.use();assert.ok(origin,"linked native spells qualify without the manual checkbox");
  f=setup(true,resilient);f.config.spikependium.originSaveMagical=true;
  assert.equal(await f.use(),undefined,"this feat cannot boost another creature's save");
  f=setup(false,resilient);f.config.spikependium.originSaveMagical=true;game.time.worldTime++;
  assert.equal(await f.use(),undefined,"stale saves spend no uses");
  f=setup(false,resilient);f.config.spikependium.originSaveMagical=true;f.save.rolls[0].options.target=30;
  origin=await f.use();await rollOriginSaveBoost(f.activity,{}, {message:origin});assert.equal(f.save.rolls[0].isFailure,true);
  assert.equal(await f.use(),undefined,"one failed save cannot consume repeated d6 bonuses from the same feat");assert.equal(f.activity.uses.spent,1);
  await f.refund(origin);await resumeOriginSaveBoosts(f.actor);assert.ok(await f.use(),"refund permits a new use on the original failed save");
  f=setup(false,resilient);let unlock;const waiting=new Promise(resolve=>{unlock=resolve;});let calls=0;
  const pendingUse=resilientSaveUse.call(f.activity,async()=>{calls++;await waiting;return true;},f.config);
  assert.equal(await resilientSaveUse.call(f.activity,()=>{calls++;},f.config),undefined);assert.equal(calls,1);
  unlock();assert.equal(await pendingUse,true);
  assert.equal(await resilientSaveUse.call(f.activity,()=>true,f.config),true,"closing the first dialog releases the guard");
}
console.log("Spell Resilient: native ASI/resistance choices, self-only magic gate, d6 without action/reaction, original d20, use/refund and replay guards passed.");
console.log("Arcane Omen: native use/reaction consumption and refund, original d20/DC, single d4, privacy, 30 feet/height/metres, ownership/GM, cancellation, stale cards and recovery passed.");
console.log("Transformed Anatomy: native speed bonus/units/multipliers, conditional advantage and disadvantage, fast-forward, self-only Constitution reaction, native refund and stale feature checks passed.");
