import assert from "node:assert/strict";
import fs from "node:fs";
import {hasSteelMind,steelMindChallenge,steelMindRoll,steelMindPrompt,guardSteelMindSave,syncSteelMind} from "../scripts/arcana-steel-mind.mjs";
import {nativeSteelConcentration,nativeSteelEndConcentration,nativeSteelChallenge,nativeSteelPrompt,nativeSteelShouldPrompt,setSteelMindNativeHost} from "./data/dnd5e-arcana-native.mjs";
import {nativeOnUpdateHP} from "./data/dnd5e-relentless-native.mjs";
import {nativeMagusASIApply} from "./data/dnd5e-magus-native.mjs";
const docs=fs.readdirSync("packs/_source/feats").map(f=>JSON.parse(fs.readFileSync(`packs/_source/feats/${f}`,"utf8")));
const doc=docs.find(d=>d.flags?.spikependium?.key==="feat:au-boon-of-steel-mind");assert.ok(doc);
assert.equal(doc.name,"Дар стального разума");assert.equal(doc.system.source.book,"AU");assert.equal(doc.system.source.page,"33");
assert.equal(doc.system.type.subtype,"epicBoon");assert.equal(doc.system.prerequisites.level,19);assert.ok(doc.folder);
const folders=fs.readdirSync("packs/_source/feats").map(f=>JSON.parse(fs.readFileSync(`packs/_source/feats/${f}`,"utf8")));
assert.equal(folders.find(d=>d._id===doc.folder).name,"Эпические дары");
const asi=doc.system.advancement[0];assert.equal(asi.type,"AbilityScoreImprovement");assert.equal(asi.configuration.points,1);
assert.equal(asi.configuration.cap,1);assert.equal(asi.configuration.max,30);assert.deepEqual(asi.configuration.locked,[]);
assert.equal(doc.effects.length,1);assert.equal(doc.effects[0].transfer,true);assert.equal(doc.effects[0].flags.spikependium.steelMind,true);
const clone=structuredClone,get=(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o),set=(o,p,v)=>{const path=p.split('.'),key=path.pop();path.reduce((v,k)=>v[k]??={},o)[key]=v;};
Set.prototype.reduce??=function(fn,initial){return [...this].reduce(fn,initial);};
Set.prototype.find??=function(fn){return [...this].find(fn);};
globalThis.foundry={utils:{getType:v=>typeof v==="string"?"string":v?.constructor===Object?"Object":typeof v,isEmpty:o=>!o||!Object.keys(o).length,getProperty:get,setProperty:set}};
let serial=0,prompts=[],notices=[],deleted=[],veto=false,failOn=null,hold=null,endCalls=0;
class ItemHost {}
class EffectHost {
 constructor(actor,{concentration=false,statuses=[],steel=false,id}={}){this.parent=this.actor=actor;this.id=id??`effect${++serial}`;this.uuid=`${actor.uuid}.ActiveEffect.${this.id}`;
  this.statuses=new Set(statuses);if(concentration)this.statuses.add("concentrating");this.flags={spikependium:steel?{steelMind:true}:{}};this.disabled=false;this.isSuppressed=false;this.duration={expired:false};this.dependents=[];}
 get active(){return !this.disabled&&!this.isSuppressed;}
 getFlag(scope,key){return this.flags[scope]?.[key];}
 _shouldPromptConcentrationEnd(){return nativeSteelShouldPrompt.call(this);}
 async delete(){if(failOn===this.id){failOn=null;throw Error("delete interrupted");}this.parent.effects.splice(this.parent.effects.indexOf(this),1);this.parent._lazy={};deleted.push(this.id,...this.dependents);}
}
class ActorHost {
 constructor(uuid="Actor.hero",steel=true){this.documentName="Actor";this.uuid=uuid;this.id="hero";this.isOwner=true;this.effects=[];this.items=new Map();this._lazy={};this.system={attributes:{concentration:{limit:1},hp:{value:20,temp:0,effectiveMax:20}}};
  if(steel)this.appliedEffects=[new EffectHost(this,{steel:true})];else this.appliedEffects=[];}
 get statuses(){return new Set(this.effects.filter(e=>e.active&&!e.duration.expired).flatMap(e=>[...e.statuses]));}
 get concentration(){return nativeSteelConcentration.call(this);}
 add(data){const e=new EffectHost(this,data);this.effects.push(e);this._lazy={};return e;}
 challengeConcentration(...args){return steelMindChallenge.call(this,(...a)=>nativeSteelChallenge.call(this,...a),...args);}
 promptConcentrationEnd(...args){return steelMindPrompt.call(this,(...a)=>nativeSteelPrompt.call(this,...a),...args);}
 async endConcentration(...args){endCalls++;if(hold)await hold;if(veto)return [];return nativeSteelEndConcentration.call(this,...args);}
 testUserPermission(){return true;}
 async updateBloodied(){} async updateDowned(){} _displayTokenEffect(){} getConcentrationDC(damage){return Math.max(10,Math.floor(damage/2));}
}
setSteelMindNativeHost(EffectHost,ItemHost);globalThis.Actor=ActorHost;
globalThis.CONFIG={specialStatusEffects:{CONCENTRATING:"concentrating"},DND5E:{abilities:{str:{},dex:{},con:{},int:{},wis:{},cha:{}}}};
globalThis.ChatMessage={implementation:{create:async data=>{prompts.push(data);return data;},getSpeaker:({actor})=>({actor:actor.id})}};
globalThis.dnd5e={settings:{disableConcentration:false}};
globalThis.Hooks={call:()=>true,callAll:()=>{}};
globalThis.ui={notifications:{info:m=>notices.push(m)}};
function setup(steel=true){serial=0;prompts=[];notices=[];deleted=[];veto=false;failOn=null;hold=null;endCalls=0;
 const actor=new ActorHost("Actor.hero",steel),gm={id:"gm",isGM:true,isActiveGM:true,active:true},users=[gm];users.activeGM=gm;
 globalThis.game={user:gm,userId:gm.id,users,actors:[actor],scenes:[],settings:{get:()=>false}};return actor;}
for(const ability of ["str","dex","con","int","wis","cha"])for(const initial of [19,29,30]){
 const actor=setup();actor.system.abilities={[ability]:{value:initial,max:20}};actor.system._source={abilities:clone(actor.system.abilities)};actor.updateSource=u=>{for(const[p,v]of Object.entries(u))set(actor,p,v);};
 const host={actor,configuration:asi.configuration,value:{},allowFeat:false,canImprove:()=>true,updateSource(u){Object.assign(this,u);}};
 await nativeMagusASIApply.call(host,0,{assignments:{[ability]:1}},{initial:true});assert.equal(actor.system.abilities[ability].value,Math.min(30,initial+1));
}
{
 const a=setup(false);a.add({concentration:true});await a.challengeConcentration({dc:17,ability:"wis"});assert.equal(prompts[0].system.buttons[0].dc,17);
 await a.promptConcentrationEnd();assert.equal(prompts[1].system.buttons[0].type,"endConcentration");
 let calls=0;assert.equal(steelMindRoll.call(a,()=>++calls),1);assert.equal(calls,1);assert.equal(guardSteelMindSave({subject:a,isConcentration:true}),undefined);
}
{
 const a=setup();a.add({concentration:true});assert.ok(hasSteelMind(a));assert.equal(await a.challengeConcentration({dc:99}),null);assert.equal(prompts.length,0);
 assert.equal(steelMindRoll.call(a,()=>assert.fail("must not roll")),null);assert.equal(notices.length,1);
 for(const data of [{isConcentration:true},{saveType:"concentration"},{rolls:[{options:{isConcentration:true}}]}])assert.equal(guardSteelMindSave({subject:a,...data}),false);
 assert.equal(guardSteelMindSave({subject:a,ability:"con",rolls:[{options:{}}]}),undefined,"ordinary CON saves remain available");
 for(const [oldHP,hp,oldTemp,temp]of [[20,10,0,0],[20,20,8,0]]){
  a.system.attributes.hp={value:hp,temp,effectiveMax:20};await nativeOnUpdateHP.call({parent:a,attributes:a.system.attributes},{system:{attributes:{hp:{value:hp,temp}}}},{dnd5e:{hp:{value:oldHP,temp:oldTemp}}},"gm");
 }
 assert.equal(prompts.length,0,"native HP damage and temporary HP damage never prompt a save");assert.equal(a.concentration.effects.size,1);
}
for(const state of ["incapacitated","paralyzed","stunned"]){
 const a=setup();a.add({concentration:true});const e=a.add({statuses:[state,"incapacitated"]});assert.equal(e._shouldPromptConcentrationEnd(),true);
 await a.promptConcentrationEnd();await syncSteelMind(e);assert.equal(prompts.length,0);assert.equal(a.concentration.effects.size,1);assert.equal(endCalls,0);
}
for(const state of ["petrified","unconscious","dead"]){
 const a=setup(),first=a.add({concentration:true}),second=a.add({concentration:true});first.dependents=["dependent effect","region"];
 const e=a.add({statuses:[state,"incapacitated"]});await a.promptConcentrationEnd();await syncSteelMind(e);assert.equal(a.concentration.effects.size,0);
 assert.ok(deleted.includes(first.id)&&deleted.includes(second.id)&&deleted.includes("dependent effect")&&deleted.includes("region"));assert.equal(prompts.length,0);
 await e.delete();await syncSteelMind(a);assert.equal(a.concentration.effects.size,0,"healing does not recreate old concentration");
}
for(const field of ["disabled","isSuppressed","expired"]){
 const a=setup();a.add({concentration:true});const profile=a.appliedEffects[0];if(field==="expired")profile.duration.expired=true;else profile[field]=true;
 assert.equal(hasSteelMind(a),false);await a.challengeConcentration();assert.equal(prompts.length,1);a.add({statuses:["unconscious","incapacitated"]});await a.promptConcentrationEnd();assert.equal(prompts.length,2);assert.equal(endCalls,0);
}
{
 const a=setup(),old=a.add({concentration:true});await a.endConcentration(old.id);assert.equal(a.concentration.effects.size,0,"native replacement remains available");
 const current=a.add({concentration:true});await current.delete();assert.equal(a.concentration.effects.size,0,"native expiry/manual removal remains available");
 a.add({concentration:true});await a.endConcentration();assert.equal(a.concentration.effects.size,0,"GM can end concentration manually");
}
{
 const a=setup(),first=a.add({concentration:true}),second=a.add({concentration:true});a.add({statuses:["dead"]});failOn=second.id;
 await assert.rejects(syncSteelMind(a),/interrupted/);assert.ok(deleted.includes(first.id));assert.equal(a.concentration.effects.size,1);
 await syncSteelMind(a);assert.equal(a.concentration.effects.size,0);assert.equal(deleted.filter(id=>id===first.id).length,1);
}
{
 const a=setup();a.add({concentration:true});a.add({statuses:["unconscious"]});veto=true;await syncSteelMind(a);assert.equal(endCalls,1);assert.equal(a.concentration.effects.size,1);
 veto=false;await syncSteelMind(a);assert.equal(a.concentration.effects.size,0);
}
{
 const a=setup();a.add({concentration:true});a.add({statuses:["dead"]});let release;hold=new Promise(r=>release=r);
 const pending=syncSteelMind(a);await syncSteelMind(a);assert.equal(endCalls,1);release();await pending;assert.equal(a.concentration.effects.size,0);
}
{
 const a=setup();a.add({concentration:true});a.add({statuses:["dead"]});game.user={id:"owner",isActiveGM:false,active:true};await syncSteelMind(a);assert.equal(endCalls,0,"owner does not duplicate active GM");
 const owner=game.user,other={id:"otherOwner",active:true};game.users=[owner,other];game.users.activeGM=null;
 a.isOwner=false;await syncSteelMind(a);assert.equal(endCalls,0);a.isOwner=true;game.user=other;await syncSteelMind(a);assert.equal(endCalls,0,"second active owner does not duplicate first");
 game.user=owner;await syncSteelMind(a);assert.equal(a.concentration.effects.size,0,"first active owner works without GM");
}
{
 const a=setup(false);a.add({concentration:true});a.add({statuses:["dead"]});await syncSteelMind(a);assert.equal(endCalls,0,"other actors keep native behavior");
 const synthetic=new ActorHost("Scene.hidden.Token.unlinked.Actor.hero");synthetic.add({concentration:true});synthetic.add({statuses:["unconscious"]});
 await syncSteelMind({documentName:"ActorDelta",parent:{actor:synthetic}});assert.equal(synthetic.concentration.effects.size,0,"ActorDelta resolves its synthetic actor");
 synthetic.add({concentration:true});game.scenes=[{tokens:[{actor:synthetic}]}];await syncSteelMind();assert.equal(synthetic.concentration.effects.size,0);assert.equal(a.concentration.effects.size,1);
}
const main=fs.readFileSync("scripts/spikependium.mjs","utf8");
for(const name of ["steelMindChallenge","steelMindRoll","steelMindPrompt","guardSteelMindSave","syncSteelMind"])assert.ok(main.includes(name));
for(const method of ["challengeConcentration","rollConcentration","promptConcentrationEnd"])assert.ok(main.includes(`CONFIG.Actor.documentClass.prototype.${method}`));
console.log("Дар стального разума: PDF/папка/19 уровень, штатный выбор любой характеристики до 30; native HP/временные Хиты, проверки концентрации, состояния, окончание/замена/длительность, переключение эффекта, ActorDelta/скрытая сцена, права и восстановление после сбоя: OK.");
