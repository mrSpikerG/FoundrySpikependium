import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import {preserveModuleMessagePrivacy} from "../scripts/message-privacy.mjs";
import {preparePainCasting,painConsume,preparePainCastingUpdates,recordPainCastingConsumption,recordPainCastingCard,resumePainFailures,painCastingDeltaLabel} from "../scripts/pain-casting.mjs";
import {recordArcanaCast} from "../scripts/arcana-spells.mjs";
import {prepareReactionUpdates,recordReaction,recordReactionConsumption,reactionAvailable,reactionUse} from "../scripts/reactions.mjs";
import {nativeArcanistUse} from "./data/dnd5e-arcanist-native.mjs";
import {nativeUsageConfig,nativeUsageUpdates,nativeMergeUpdates} from "./data/dnd5e-monsters-native.mjs";
import {nativeTwoWeaponScaling} from "./data/dnd5e-griffon-two-weapons-native.mjs";
import {nativeConsume,nativeRefund,getDeltas,nativeSaveRollFailure} from "./data/dnd5e-reaction-native.mjs";
import {nativeThwackMessageConfig} from "./data/dnd5e-thwack-native.mjs";
const plain=o=>!!o&&Object.getPrototypeOf(o)===Object.prototype;
const clone=o=>Array.isArray(o)?o.map(clone):o instanceof Set?new Set(o):plain(o)?Object.fromEntries(Object.entries(o).map(([k,v])=>[k,clone(v)])):o;
const get=(o,p)=>p.split(".").reduce((o,k)=>o?.[k],o),set=(o,p,v)=>{const a=p.split("."),k=a.pop();a.reduce((o,k)=>o[k]??={},o)[k]=clone(v);};
const flat=(o,p="",out={})=>{for(const[k,v]of Object.entries(o)){const q=p?`${p}.${k}`:k;if(plain(v))flat(v,q,out);else out[q]=v;}return out;};
function merge(a,b,{inplace=true}={}){const out=inplace?a:clone(a);for(const[k,v]of Object.entries(b??{})){if(k.includes("."))set(out,k,v);else if(plain(v)){if(!plain(out[k]))out[k]={};merge(out[k],v);}else out[k]=clone(v);}return out;}
class Collection extends Map{[Symbol.iterator](){return this.values();}find(f){return[...this].find(f);}filter(f){return[...this].filter(f);}some(f){return[...this].some(f);}map(f){return[...this].map(f);}first(){return this.values().next().value;}}
let world,serial,saveTotal,saveCalls,failPay,failPublish,failMark,loseSave,cancelSave,cancelDialog,cancelPayment,editSave,counts,notices,defaultMode;
// Host contract from FVTT 14 ChatMessage.applyMode documentation (not a copied native method body).
function applyMode(data,mode=defaultMode){
 if(mode==="public"){data.whisper=[];data.blind=false;}
 else if(mode==="self"){data.whisper=[game.user.id];data.blind=false;}
 else if(["gm","blind"].includes(mode)){if(!data.whisper?.length)data.whisper=game.users.filter(u=>u.isGM).map(u=>u.id);data.blind=mode==="blind";}
 return data;
}
globalThis.fromUuidSync=uuid=>world.get(uuid);
globalThis.foundry={utils:{getProperty:get,setProperty:set,deepClone:clone,mergeObject:merge,flattenObject:flat,isEmpty:o=>!Object.keys(o).length,
 randomID:()=>String(++serial).padStart(16,"0"),escapeHTML:s=>String(s),getType:o=>Array.isArray(o)?"Array":plain(o)?"Object":o?.constructor?.name}};
globalThis.ui={notifications:{warn:m=>notices.push(m),error:m=>notices.push(m)}};
globalThis.ActiveEffect={implementation:{getEffectStart:()=>({time:game.time.worldTime})}};
globalThis.dnd5e={utils:{staticID:s=>crypto.createHash("sha256").update(s).digest("hex").slice(0,16)}};
globalThis.TargetsField={getDescriptors:()=>[]};globalThis._loc=s=>s;globalThis.formatNumber=String;globalThis.ConsumptionError=class extends Error{};
globalThis.ChatMessage={getSpeaker:({actor,token})=>({actor:actor.id,token:token?.uuid})};
Math.clamp=(n,min,max)=>Math.min(max,Math.max(min,n));Number.isNumeric=n=>typeof n==="number";
String.prototype.capitalize=function(){return this.charAt(0).toUpperCase()+this.slice(1);};
class D20{constructor(total,target){this.total=total;this.options={target};this._evaluated=true;}get isFailure(){return nativeSaveRollFailure.call(this);}}
class Dialog{static async create(){if(cancelDialog)throw Error("cancel");}}
function uses(d){const out=clone(d);Object.defineProperty(out,"value",{get(){return Number(this.max)-this.spent;}});return out;}
class ItemHost{
 constructor(data,{parent}){this.raw=clone(data);Object.assign(this,clone(data),{id:data._id,actor:parent,uuid:`${parent.uuid}.Item.${data._id}`,isEmbedded:true,isOwner:true});
  this.system.properties=new Set(data.system.properties??[]);this.system.uses=uses(data.system.uses??{max:"",spent:0});this.system.activities=new Collection();
  for(const a of Object.values(data.system.activities??{}))this.system.activities.set(a._id,new ActivityHost(a,this));}
 toObject(){return{...clone(this.raw),system:{...clone(this.raw.system),materials:clone(this.system.materials),uses:{max:this.system.uses.max,spent:this.system.uses.spent},activities:Object.fromEntries([...this.system.activities].map(a=>[a.id,a.toObject()]))}};}
 clone(){return new ItemHost(this.toObject(),{parent:this.actor});}getFlag(n,k){return this.flags?.[n]?.[k];}updateSource(d){for(const[p,v]of Object.entries(d)){set(this,p,v);set(this.raw,p,v);}}prepareFinalAttributes(){}
}
class ActivityHost{
 constructor(data,item){this.raw=clone(data);Object.assign(this,clone(data),{id:data._id,item,actor:item.actor,uuid:`${item.uuid}.Activity.${data._id}`});this.uses=uses(data.uses??{max:"",spent:0});this.metadata={usage:{dialog:Dialog}};
  this.consumption.targets=this.consumption.targets.map(t=>({...t,hasZeroCost:()=>false,consume:async(_c,u)=>{
    const changes={_id:item.id,"system.materials.supply":item.system.materials.supply-1,"system.uses.spent":item.system.uses.spent+1};u.item.push(changes);
  }}));}
 get canUse(){return true;}get isSpell(){return this.item.type==="spell";}get canScale(){return this.isSpell;}
 get requiresSpellSlot(){return this.isSpell&&this.item.system.level>0&&this.item.system.method==="spell";}
 get requiresConcentration(){return this.item.system.properties.has("concentration");}getLinkedActivity(id){return world.get(id??this.item.getFlag("dnd5e","cachedFor"));}get relativeUUID(){return this.uuid;}
 _mergeActivityUpdates(u){return nativeMergeUpdates.call(this,u);}
 getRollData(){return this.actor.system;}toObject(){return clone(this.raw);}updateSource(d){for(const[p,v]of Object.entries(d)){set(this,p,v);set(this.raw,p,v);}}
 _prepareUsageConfig(c){return nativeUsageConfig.call(this,c);}_requiresConfigurationDialog(){return true;}
 _prepareUsageScaling(c,m,i){return nativeTwoWeaponScaling.call(this,c,m,i);}
 async _prepareUsageUpdates(c){let u=await nativeUsageUpdates.call(this,c);if(!u)return u;u=prepareReactionUpdates(this,c,u);return u&&preparePainCastingUpdates(this,c,u);}
 consume(c,m){return painConsume.call(this,(c,m)=>nativeConsume.call(this,c,m,u=>apply(this.actor,u)),c,m);}
 _finalizeMessageConfig(...args){return nativeThwackMessageConfig.call(this,...args);}
 async _createUsageMessage(message){
  recordReaction(this,message);preserveModuleMessagePrivacy(this,message);const data=applyMode({...message.data,type:"usage",system:{...message.data.system,activity:{id:this.id},item:{uuid:this.item.uuid}},title:this.item.name},message.rollMode);
  if(message.create===false)return data;
  if(failPublish){failPublish=false;throw Error("publish");}
  const card=makeCard(data,this.actor);await recordPainCastingCard(this,card);return card;
 }
 async _finalizeUsage(){if(this.isSpell)counts.finalized++;}createConsumedFlag(){return null;}_triggerSubsequentActions(){if(this.isSpell)counts.subsequent++;}
 use(c={},d={},m={}){return reactionUse.call(this,(...args)=>nativeArcanistUse.call(this,...args),c,d,m);}
 async refund(card){await nativeRefund.call(this,card.system.deltas,u=>apply(this.actor,u));card.system.deltas=null;}
}
async function apply(actor,u){
 const deltas={actor:getDeltas(actor,u.actor),item:{}};await actor.update(u.actor);
 for(const d of u.item){const item=actor.items.get(d._id),v=Object.fromEntries(Object.entries(d).filter(([k])=>k!=="_id"));deltas.item[item.id]=getDeltas(item,v);for(const[p,n]of Object.entries(v))set(item,p,n);}
 return deltas;
}
function makeCard(data,actor,activity){
 const id=`card${++serial}`,card={id,uuid:`ChatMessage.${id}`,author:game.user,flags:{},rolls:[],system:{},whisper:[],blind:false,...data,
  getAssociatedActor:()=>actor,getAssociatedToken:()=>world.get(data.speaker?.token),
  getAssociatedActivity(){if(activity)return activity;const item=world.get(this.system.item?.uuid)??new ItemHost(this.flags.dnd5e.item.data,{parent:actor});return item.system.activities.get(this.system.activity.id);},
  getAssociatedRolls:t=>[...game.messages].filter(m=>m.type===t&&m.system.origin===id),
  getOriginatingMessage(){return game.messages.get(this.system.origin)??this;}};
 game.messages.set(id,card);world.set(card.uuid,card);return card;
}
const painDoc=fs.readdirSync("packs/_source/spells").map(f=>JSON.parse(fs.readFileSync(`packs/_source/spells/${f}`,"utf8"))).find(d=>d.flags?.spikependium?.key==="spell:au-power-word-pain");
function setup({activation="action",level=3,activeGM=false,concentration=true,pact=false}={}){
 world=new Map();serial=0;saveTotal=8;saveCalls=0;failPay=failPublish=failMark=loseSave=cancelSave=cancelDialog=cancelPayment=false;editSave=null;counts={concentrated:0,ended:0,subsequent:0,finalized:0};notices=[];defaultMode="public";
 const owner={id:"owner",active:true},gm={id:"gm",isGM:true,isActiveGM:true,active:activeGM},users=new Collection([[owner.id,owner],[gm.id,gm]]);users.activeGM=activeGM?gm:null;
 globalThis.game={user:owner,users,messages:new Collection(),actors:[],scenes:[],combats:[],combat:null,time:{worldTime:100},settings:{get:()=>false},i18n:{localize:s=>s,format:s=>s}};
 globalThis.CONFIG={Item:{documentClass:ItemHost},Dice:{D20Roll:D20,BasicRoll:{getMessageMode:()=>defaultMode}},DND5E:{activityActivationTypes:Object.fromEntries(["action","bonus","reaction"].map(t=>[t,{consume:{property:`attributes.actions.${t}`}}])),
  spellcasting:{spell:{exclusive:{spells:false,slots:false},getSpellSlotKey:n=>`spell${n}`},pact:{exclusive:{spells:false,slots:false},isSingleLevel:true}},spellLevels:{0:"0",3:"3",5:"5"}}};
 const actor={id:"caster",uuid:"Actor.caster",documentName:"Actor",name:"Заклинатель",isOwner:true,flags:{},items:new Collection(),effects:new Collection(),statuses:new Set(),
  system:{isCreature:true,attributes:{hp:{value:40},actions:Object.fromEntries(["action","bonus","reaction"].map(t=>[t,uses({max:1,spent:0})])),concentration:{limit:1}},spells:{}},
  testUserPermission:u=>u&&(u.isGM||u.id===owner.id),
  async update(d){if(failPay&&Object.keys(d).some(k=>/^flags\.spikependium\.painAttempts\..+\.spent$/.test(k))){failPay=false;throw Error("payment");}
    if(failMark&&Object.keys(d).some(k=>k.endsWith(".card"))){failMark=false;throw Error("card mark");}for(const[p,v]of Object.entries(flat(d)))set(this,p,v);},
  async setFlag(ns,path,value){await this.update({[`flags.${ns}.${path}`]:value});},
  async createEmbeddedDocuments(type,data){assert.equal(type,"ActiveEffect");return data.map(d=>{const e={...clone(d),id:d._id,actor:this,uuid:`${this.uuid}.ActiveEffect.${d._id}`,get active(){return !this.disabled&&!this.duration.expired;}};this.effects.set(e.id,e);return e;});},
  async deleteEmbeddedDocuments(type,ids){assert.equal(type,"ActiveEffect");for(const id of ids)this.effects.delete(id);},
  async rollSavingThrow(c,d,m){assert.equal(c.ability,"con");assert.equal(c.target,16);assert.equal(d.configure,false);saveCalls++;
    if(cancelSave)return[];if(loseSave)throw Error("save not published");const card=makeCard(applyMode({...m.data,type:"save",system:{...m.data.system,ability:"con"},rolls:[new D20(saveTotal,c.target)]},m.rollMode),this);
    if(editSave){const edit=editSave;editSave=null;await edit(card);}return card.rolls;}};
 actor.concentration={effects:new Collection([["old",{id:"old",flags:{dnd5e:{item:{data:{_id:"old"}}}}}]])};
 actor.beginConcentrating=async()=>{counts.concentrated++;return{id:"new"};};actor.endConcentration=async()=>{counts.ended++;return[];};
 const key=pact?"pact":`spell${Math.max(level,1)}`;actor.system.spells[key]={level:pact?5:Math.max(level,1),type:pact?"pact":"spell",value:2,max:2,label:key};
 game.actors.push(actor);world.set(actor.uuid,actor);
 const source={id:"painCaster",uuid:"Actor.painCaster",isOwner:true,flags:{},effects:new Collection(),testUserPermission:()=>true};world.set(source.uuid,source);game.actors.push(source);
 const profile={...clone(painDoc.effects[0]),id:painDoc.effects[0]._id,uuid:`${source.uuid}.Item.pain.ActiveEffect.${painDoc.effects[0]._id}`,toObject:()=>clone(painDoc.effects[0])};
 const painItem={type:"spell",flags:painDoc.flags,name:painDoc.name,uuid:`${source.uuid}.Item.pain`,system:{level:7},toObject:()=>clone(painDoc)};
 const painActivity={uuid:`${painItem.uuid}.Activity.cast`,item:painItem,actor:source,applicableEffects:[profile],save:{dc:{value:16}}};
 const message={data:{system:{targets:[{actor:actor.uuid,token:"Scene.scene.Token.caster"}]}}};recordArcanaCast(painActivity,message);
 const origin=makeCard({...message.data,type:"usage",author:owner},source,painActivity);
 const effect={id:"pain",uuid:`${actor.uuid}.ActiveEffect.pain`,actor,flags:{spikependium:{arcanaSpell:"power-word-pain"}},system:{origin:{message:origin.uuid}},duration:{expired:false,remaining:60},disabled:false,
  get active(){return !this.disabled;}};actor.effects.set(effect.id,effect);world.set(effect.uuid,effect);
 const token={uuid:"Scene.scene.Token.caster",actor,parent:{id:"scene"}};world.set(token.uuid,token);
 const spell=new ItemHost({_id:"spell",type:"spell",name:"Испытательное заклинание",img:"icons/svg/book.svg",flags:{spikependium:{}},system:{level,method:"spell",properties:concentration?["concentration"]:[],
  materials:{supply:2},uses:{max:"3",spent:0},activities:{cast:{_id:"cast",name:"Сотворить",type:"utility",activation:{type:activation,value:1},uses:{max:"",spent:0},
    consumption:{spellSlot:true,targets:[{type:"test-material",target:"",value:"1"}],scaling:{allowed:true,max:""}},target:{template:{type:""}},effects:[]}}}},{parent:actor});
 actor.items.set(spell.id,spell);world.set(spell.uuid,spell);world.set(spell.system.activities.get("cast").uuid,spell.system.activities.get("cast"));
 ActivityHost.prototype.getUsageToken=function(){return token;};
 globalThis.Hooks={call(name,...args){if(name==="dnd5e.preUseActivity")return preparePainCasting(...args);
  if(name==="dnd5e.activityConsumption")return !cancelPayment;
  if(name==="dnd5e.postActivityConsumption"){recordPainCastingConsumption(...args);recordReactionConsumption(...args);}return true;}};
 const activity=spell.system.activities.get("cast"),cast=(config={},dialog={},msg={})=>activity.use({spell:{slot:key},...config},{configure:false,...dialog},msg);
 return{actor,spell,activity,effect,origin,token,cast,key,owner,gm,slot:actor.system.spells[key]};
}
{
 const h=setup();await h.cast();assert.equal(saveCalls,1);assert.equal(h.slot.value,2);assert.equal(h.spell.system.materials.supply,2);assert.equal(h.spell.system.uses.spent,0);
 assert.equal(h.actor.system.attributes.actions.action.spent,1);assert.equal(counts.concentrated,0);assert.equal(counts.ended,0);assert.equal(counts.subsequent,0);assert.equal(counts.finalized,0);
 const cards=[...game.messages].filter(m=>m.flags.spikependium?.painCasting?.failed);assert.equal(cards.length,1);assert.equal(cards[0].getAssociatedActivity().item.type,"feat");
 await cards[0].getAssociatedActivity().refund(cards[0]);assert.equal(h.actor.system.attributes.actions.action.spent,0);assert.equal(h.slot.value,2);
 await resumePainFailures();assert.equal([...game.messages].filter(m=>m.flags.spikependium?.painCasting?.failed).length,1);
 await h.cast();assert.equal(saveCalls,2,"новая попытка после отмены не использует старую проверку");
}
{
 const h=setup();saveTotal=20;const r=await h.cast();assert.ok(r.message);assert.equal(saveCalls,1);assert.equal(h.slot.value,1);assert.equal(h.spell.system.materials.supply,1);
 assert.equal(h.spell.system.uses.spent,1);assert.equal(h.actor.system.attributes.actions.action.spent,1);assert.equal(counts.concentrated,1);assert.equal(counts.ended,1);assert.equal(counts.subsequent,1);
 assert.equal(h.effect.active,true,"успех проверки сотворения не прекращает боль");
}
for(const activation of ["bonus","reaction"]){
 const h=setup({activation});await h.cast();assert.equal(h.actor.system.attributes.actions[activation].spent,1);assert.equal(h.slot.value,2);
 const card=[...game.messages].find(m=>m.flags.spikependium?.painCasting?.failed);assert.ok(card);
 if(activation==="reaction")assert.equal(reactionAvailable(h.actor),false);
 await card.getAssociatedActivity().refund(card);assert.equal(h.actor.system.attributes.actions[activation].spent,0);if(activation==="reaction")assert.equal(reactionAvailable(h.actor),true);
}
for(const options of [{level:0},{pact:true}]){const h=setup(options);await h.cast();assert.equal(saveCalls,1);assert.equal(h.slot.value,2);assert.equal(h.actor.system.attributes.actions.action.spent,1);}
{
 const h=setup();await h.cast({consume:{spellSlot:false}});assert.equal(saveCalls,1);assert.equal(h.slot.value,2);assert.equal(h.actor.system.attributes.actions.action.spent,1);
}
{
 const h=setup();await h.cast({consume:false});assert.equal(h.actor.system.attributes.actions.action.spent,0);assert.equal(h.slot.value,2);
 const card=[...game.messages].find(m=>m.flags.spikependium?.painCasting?.failed);assert.match(card.flavor,/учёт действия отключён/);
}
for(const disabled of [true,false]){
 const h=setup();if(disabled)h.effect.disabled=true;else h.activity.updateSource({"consumption.spellSlot":false});
 await h.cast();assert.equal(saveCalls,0);assert.equal(counts.subsequent,1);
}
{
 const h=setup();cancelDialog=true;await h.cast({}, {configure:true});assert.equal(saveCalls,0);assert.equal(h.actor.flags.spikependium?.painAttempts,undefined);
}
for(const failure of ["payment","publish","mark"]){
 const h=setup();if(failure==="payment")failPay=true;if(failure==="publish")failPublish=true;if(failure==="mark")failMark=true;
 await h.cast();if(failure==="payment")await h.cast();else await resumePainFailures();
 assert.equal(saveCalls,1,failure);assert.equal(h.actor.system.attributes.actions.action.spent,1,failure);assert.equal(h.slot.value,2);
 assert.equal([...game.messages].filter(m=>m.flags.spikependium?.painCasting?.failed).length,1,failure);
}
{
 const h=setup();loseSave=true;await h.cast();loseSave=false;await h.cast();assert.equal(saveCalls,1);assert.equal(h.actor.system.attributes.actions.action.spent,0);assert.ok(notices.some(n=>n.includes("не сохранился")));
}
{
 const h=setup();cancelSave=true;await h.cast();assert.equal(h.actor.system.attributes.actions.action.spent,0);cancelSave=false;await h.cast();assert.equal(saveCalls,2);
}
{
 const h=setup();await Promise.all([h.cast(),h.cast()]);assert.equal(saveCalls,1);assert.equal(h.actor.system.attributes.actions.action.spent,1);
}
{
 const h=setup({activeGM:true});await h.cast();assert.equal([...game.messages].filter(m=>m.flags.spikependium?.painCasting?.failed).length,0);
 game.user=h.gm;await Promise.all([resumePainFailures(),resumePainFailures()]);assert.equal([...game.messages].filter(m=>m.flags.spikependium?.painCasting?.failed).length,1);
}
{
 const h=setup();h.token.hidden=true;await h.cast();for(const card of game.messages)if(card.flags.spikependium?.painCastCheck||card.flags.spikependium?.painCasting){assert.equal(card.blind,true);assert.deepEqual(card.whisper,["gm"]);}
}
{
 const h=setup();editSave=()=>{game.time.worldTime++;};await h.cast();assert.equal(h.actor.system.attributes.actions.action.spent,0);assert.equal(h.slot.value,2);
}
{
 const h=setup();cancelPayment=true;await h.cast();assert.equal(h.actor.system.attributes.actions.action.spent,0);cancelPayment=false;await h.cast();assert.equal(saveCalls,1);assert.equal(h.actor.system.attributes.actions.action.spent,1);
}
{
 const h=setup();await h.cast({}, {}, {create:false});assert.equal(saveCalls,0);assert.equal(h.slot.value,2);
}
{
 const h=setup();h.actor.system.attributes.actions.action.spent=1;await h.cast();assert.equal(saveCalls,0,"нет доступного действия — нет проверки и расхода");assert.equal(h.slot.value,2);
}
{
 const h=setup();saveTotal=20;cancelPayment=true;await h.cast();cancelPayment=false;await h.cast();assert.equal(saveCalls,1,"повтор оплаты использует сохранённый успешный спасбросок");assert.equal(h.slot.value,1);
}
{
 const h=setup();editSave=c=>{c.system.forceSuccess=true;};await h.cast();assert.equal(h.slot.value,1,"штатный принудительный успех спасброска учитывается");
}
{
 const h=setup();await h.cast();const card=[...game.messages].find(m=>m.flags.spikependium?.painCasting?.failed),helper=card.getAssociatedActivity();
 const config={consume:{action:true,resources:false,spellSlot:false,usage:false}},message={data:{system:{}}};
 assert.equal(await helper.consume(config,message),false,"оплаченная карточка не списывает действие второй раз");
 await helper.refund(card);assert.ok(await helper.consume(config,message));assert.equal(saveCalls,1,"повторный учёт ресурса не является новым сотворением");
 card.system.deltas=message.data.system.deltas;await helper.refund(card);assert.equal(h.actor.system.attributes.actions.action.spent,0);
}
{
 const h=setup({activeGM:true});await h.cast();const save=[...game.messages].find(m=>m.flags.spikependium?.painCastCheck);save.rolls[0].total=20;
 game.user=h.gm;await resumePainFailures();assert.equal([...game.messages].filter(m=>m.flags.spikependium?.painCasting?.failed).length,1,"карточка уже потраченного действия сохраняет исходный вердикт при поздней правке проверки");
}
{
 const h=setup();loseSave=true;await h.cast();loseSave=false;game.time.worldTime++;await h.cast();assert.equal(saveCalls,2);assert.ok(notices.some(n=>n.includes("прошлому моменту")));
}
{
 const h=setup();h.activity.updateSource({"consumption.spellSlot":false});await h.cast({spikependium:{painNewSpell:true}});assert.equal(saveCalls,1,"можно явно указать новое сотворение без расхода ячейки");assert.equal(h.actor.system.attributes.actions.action.spent,1);assert.equal(h.slot.value,2);
}
{
 const h=setup({activeGM:true});await h.cast();const save=[...game.messages].find(m=>m.flags.spikependium?.painCastCheck);game.messages.delete(save.id);world.delete(save.uuid);
 game.user=h.gm;await resumePainFailures();const card=[...game.messages].find(m=>m.flags.spikependium?.painCasting?.failed);assert.ok(card,"уже оплаченная попытка восстанавливает карточку и после удаления сохранённого спасброска");assert.match(card.flavor,/8, СЛ 16/);
 await card.getAssociatedActivity().refund(card);assert.equal(h.actor.system.attributes.actions.action.spent,0);
}
for(const total of [8,20]){
 const h=setup();saveTotal=total;
 const data=h.spell.toObject();data._id="wand";data.type="equipment";data.system.activities.cast.type="cast";data.system.activities.cast.spell={level:3};data.system.properties=[];
 const wand=new ItemHost(data,{parent:h.actor});h.actor.items.set(wand.id,wand);const linked=wand.system.activities.get("cast");world.set(linked.uuid,linked);
 h.spell.updateSource({"flags.dnd5e.cachedFor":linked.uuid});h.activity.updateSource({"consumption.targets":[]});
 await h.cast();assert.equal(saveCalls,1,"кэшированное заклинание проходит проверку до связанных затрат предмета");
 assert.equal(wand.system.uses.spent,total===20?1:0);assert.equal(wand.system.materials.supply,total===20?1:2);assert.equal(h.slot.value,2,"личная ячейка не заменяет оплату связанного предмета");
 assert.equal(counts.concentrated,total===20?1:0);
}
{
 const h=setup();h.activity.updateSource({"consumption.spellSlot":false});foundry.data={fields:{BooleanField:class{constructor(data){Object.assign(this,data);}}}};
 class DialogBase{constructor(config){this.config=config;}async _prepareConsumptionContext(c){return c;}}
 const config={hasConsumption:false},dialog={applicationClass:DialogBase},message={hasConsumption:false};preparePainCasting(h.activity,config,dialog,message);
 assert.equal(config.hasConsumption,true);assert.equal(message.hasConsumption,true);assert.equal(dialog.configure,true);
 const context=await new dialog.applicationClass(config)._prepareConsumptionContext({fields:[],inputs:{}});assert.equal(context.fields.length,1);assert.match(context.fields[0].field.label,/новое сотворение/);
}
for(const mode of ["gm","blind","self"]){
 const h=setup();defaultMode=mode;await h.cast();const cards=[...game.messages].filter(m=>m.flags.spikependium?.painCastCheck||m.flags.spikependium?.painCasting);
 assert.equal(cards.length,2);for(const card of cards){assert.deepEqual(card.whisper,mode==="self"?[h.owner.id]:[h.gm.id]);assert.equal(card.blind,mode==="blind");}
}
{
 const h=setup(),activity={item:{flags:{spikependium:{key:"example"}}}};
 const message={rollMode:"public",data:{blind:true,whisper:[h.gm.id]}};preserveModuleMessagePrivacy(activity,message);assert.equal(message.rollMode,"blind");
 const nonmodule={rollMode:"public",data:{blind:true}};preserveModuleMessagePrivacy({item:{flags:{}}},nonmodule);assert.equal(nonmodule.rollMode,"public");
 const privateMessage={rollMode:"public",data:{flags:{spikependium:{key:"helper"}},whisper:[h.owner.id]}};preserveModuleMessagePrivacy({item:{flags:{}}},privateMessage);assert.equal(privateMessage.rollMode,"gm");
 const blind={rollMode:"blind",data:{whisper:[h.gm.id]}};preserveModuleMessagePrivacy(activity,blind);assert.equal(blind.rollMode,"blind","явный скрытый режим не заменяется обычным шёпотом Мастеру");
}
console.log("Сотворение под болью: exact native use/scaling/payment/refund; CON pass/failure, action/bonus/reaction, cantrip/pact/free/custom/linked-item casts, preserved slots/materials/charges/concentration, visibility-mode contract, serialized/recovered attempts without extra saves/payments, active GM publication, lost save and stale moment: OK.");
