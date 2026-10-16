import fs from "node:fs";
import assert from "node:assert/strict";
import { recordFateWindow, prepareFateDialog, captureFate, prepareFateUpdates, recordFateConsumption, recordFateUsage,
  fateReroll, resumeFate, fateDeltaLabel } from "../scripts/arcana-fate.mjs";
import { prepareReactionUpdates, recordReaction, recordReactionConsumption, reactionAvailable } from "../scripts/reactions.mjs";
import { nativeConsume, nativeRefund, getDeltas, nativeSaveRollFailure } from "./data/dnd5e-reaction-native.mjs";
import { nativeD20ConfigureModifiers } from "./data/dnd5e-arcana-native.mjs";
import { nativeConsumeSpellSlots } from "./data/dnd5e-relentless-native.mjs";
import { makeFateDie, nativeFateAttackTargets, nativeFateToMessage, setFateRollHost } from "./data/dnd5e-fate-native.mjs";

const docs = pack => fs.readdirSync(`packs/_source/${pack}`).map(f => JSON.parse(fs.readFileSync(`packs/_source/${pack}/${f}`, "utf8")));
const doc = docs("spells").find(d => d.flags?.spikependium?.key === "spell:au-fates-intertwined");
assert.ok(doc); assert.equal(doc.name, "Переплетение судьбы"); assert.equal(doc.system.source.page, "44");
assert.equal(doc.system.level, 7); assert.equal(doc.system.school, "div"); assert.deepEqual(doc.system.properties, ["somatic"]);
const castData = Object.values(doc.system.activities)[0];
assert.equal(castData.type, "utility"); assert.equal(castData.activation.type, "reaction"); assert.equal(castData.range.value, "60");
assert.match(castData.activation.condition, /проваливает/);
assert.equal(castData.consumption.spellSlot, true); assert.match(doc.system.description.value, /6к10/);
const journal = docs("rules").find(d => d.flags?.spikependium?.key === "journal:au-spell-lists");
assert.deepEqual(journal.pages.filter(p => p.system.spells.includes(`Compendium.spikependium.spells.Item.${doc._id}`)).map(p => p.system.identifier).sort(), ["bard", "cleric", "warlock", "wizard"]);
const clone = structuredClone, get = (o,p) => p.split(".").reduce((o,k) => o?.[k],o);
const set = (o,p,v) => { const a=p.split("."), k=a.pop(); a.reduce((o,k)=>o[k]??={},o)[k]=v; };
const list = a => Object.assign(a,{get(id){return this.find(v=>v.id===id);}});
const flat = (o,p="",out={}) => { for(const [k,v] of Object.entries(o)){ const q=p?`${p}.${k}`:k;
  if(v&&Object.getPrototypeOf(v)===Object.prototype)flat(v,q,out);else out[q]=v; } return out; };
Number.isNumeric = n => (typeof n === "number" || typeof n === "string" && n.trim() !== "") && Number.isFinite(Number(n));
Math.clamp = (n,min,max) => Math.min(max,Math.max(min,n));
Array.prototype.findSplice ??= function(fn){const i=this.findIndex(fn);if(i>=0)this.splice(i,1);};
let world, counter, warnings, d20Count, tempCount, nextDie, nextTemp, fail, updates, hook;
globalThis.fromUuidSync = uuid => world.get(uuid);
globalThis.ui = { notifications: { warn:m=>warnings.push(m), error:m=>warnings.push(m) } };
globalThis.foundry = {utils:{getProperty:get,setProperty:set,flattenObject:flat,randomID:()=>String(++counter).padStart(16,"0"),
  isEmpty:o=>!Object.keys(o).length,mergeObject:(a,b)=>({...a,...b})},data:{fields:{StringField:class {constructor(o){Object.assign(this,o);}},BooleanField:class {},NumberField:class {}}}};
globalThis.ActiveEffect={implementation:{getEffectStart:()=>({time:game.time.worldTime})}};
globalThis.dnd5e={utils:{convertLength:(n,from,to)=>from===to?n:from==="m"?n/0.3048:n*0.3048}};
globalThis.canvas={ready:true};
class HostDie {constructor(data){Object.assign(this,{number:1,faces:20,options:{},modifiers:[],results:[]},data);} get total(){return this.results.find(r=>r.active)?.result;} }
const Die=makeFateDie(HostDie);
class D20 {
  static ADV_MODE={NORMAL:0,ADVANTAGE:1,DISADVANTAGE:-1};
  constructor(formula,data={},options={}) {this.formula=formula;this.data=clone(data);this.options=clone(options);this._evaluated=false;
    this.d20=new Die({options:{},modifiers:[]}); if(!this.options.configured)nativeD20ConfigureModifiers.call(this);}
  resetFormula() { this.formula=`1d20${this.d20.modifiers.join("")} + ${this.data.bonus??4}`; }
  get validD20Roll(){return this.d20.isValid;}
  get isFailure(){return nativeSaveRollFailure.call(this);}
  get isCritical(){return this.d20.isCriticalSuccess;}
  get isFumble(){return this.d20.isCriticalFailure;}
  async evaluate(){d20Count++;this._evaluated=this.d20._evaluated=true;const result=Math.max(this.options.minimum??1,nextDie);
    this.d20.results=[{result,active:true}];this.total=result+(this.data.bonus??4);return this;}
  toJSON(){return {class:"D20Roll",formula:this.formula,data:clone(this.data),options:clone(this.options),evaluated:this._evaluated,total:this.total,
    terms:[{class:"D20Die",number:this.d20.number,faces:20,modifiers:clone(this.d20.modifiers),options:clone(this.d20.options),results:clone(this.d20.results)}]};}
  static fromData(json){const r=new this(json.formula,json.data,json.options);r._evaluated=json.evaluated;r.total=json.total;
    r.d20=new Die(clone(json.terms[0]));r.d20._evaluated=json.evaluated;return r;}
}
class Basic {
  constructor(formula){this.formula=formula;this.options={};this._evaluated=false;}
  async evaluate(){tempCount++;this._evaluated=true;this.total=nextTemp;return this;}
  toJSON(){return {class:"BasicRoll",formula:this.formula,options:{},evaluated:this._evaluated,total:this.total,terms:[]};}
  static fromData(d){return Object.assign(new this(d.formula),{_evaluated:d.evaluated,total:d.total,options:d.options});}
  static _prepareMessageData(){}
  static getMessageMode(){return "public";}
  static toMessage(...args){return nativeFateToMessage.call(this,...args);}
}
setFateRollHost(Basic);
globalThis.CONFIG={Dice:{D20Roll:D20,BasicRoll:Basic},sounds:{dice:"dice"},DND5E:{spellLevels:Object.fromEntries(Array.from({length:10},(_,i)=>[i,String(i)]))}};
globalThis.CONST={DICE_ROLL_MODES:{BLIND:"blindroll"}};
globalThis.ChatMessage={getSpeaker:({actor,token})=>({actor:actor.id,token:token?.id})};
class MessageHost {constructor(data){Object.assign(this,data);} toObject(){return {...this};}
  static async create(data){return hook.message({...data,author:game.user});} }
globalThis.getDocumentClass=()=>MessageHost;
class Dialog {constructor(config){this.config=config;}async _prepareConsumptionContext(context){return context;}}
function setup({type="save",other=true,targetDC=15,bonus=4,die=5,disadvantage=false,temp=0,activeGM=false}={}) {
  world=new Map();counter=0;warnings=[];d20Count=tempCount=0;nextDie=17;nextTemp=35;fail=null;updates=[];
  const player={id:"owner"},gm={id:"gm",isGM:true,isActiveGM:true},users=list([player,gm]);users.activeGM=activeGM?gm:null;
  function actor(id){const a={id,uuid:`Actor.${id}`,name:id,documentName:"Actor",isOwner:true,flags:{},effects:list([]),statuses:new Set(),
    system:{isCreature:true,attributes:{hp:{temp},},spells:{spell7:{value:2,max:2}}},testUserPermission:u=>!!u&&(u.isGM||u.id==="owner"),
    async update(data){if(fail==="actor"){fail=null;throw Error("actor");}for(const [p,v]of Object.entries(data))set(this,p,clone(v));updates.push(clone(data));}};
    world.set(a.uuid,a);return a;}
  const caster=actor("caster"),target=other?actor("target"):caster;
  globalThis.game={user:player,userId:player.id,users,combats:[],combat:null,messages:list([]),scenes:[],time:{worldTime:100}};
  const scene={flags:{},grid:{units:"ft",measurePath:([a,b])=>({distance:Math.hypot(a.x-b.x,a.y-b.y,a.elevation-b.elevation)})}};game.scenes.push(scene);
  const token=(a,x)=>({id:a.id,uuid:`Scene.scene.Token.${a.id}`,actor:a,parent:scene,x,y:0,elevation:0,
    getOccupiedGridSpaceOffsets(){return [];},getCenterPoint(){return {x:this.x,y:0,elevation:this.elevation};}});
  const source=token(caster,0),destination=other?token(target,60):source;for(const t of [source,destination])world.set(t.uuid,t);
  function message(data){const id=`message${++counter}`;const m={id,uuid:`ChatMessage.${id}`,flags:{},blind:false,whisper:[],system:{},rolls:[],...data,
    getAssociatedActor:()=>data.actor,getAssociatedToken:()=>data.token,getAssociatedActivity:()=>data.activity,
    updateSource(data){for(const [p,v]of Object.entries(data))set(this,p,v);},
    canUserModify(u){return !!u&&(u.isGM||u.id===this.author?.id);},
    async update(data){if(fail==="card"){fail=null;throw Error("card");}for(const [p,v]of Object.entries(data))set(this,p,v);},
    async setFlag(module,p,v){if(fail==="flag"||fail==="result"&&p==="fateResult"){fail=null;throw Error("flag");}set(this.flags,`${module}.${p}`,clone(v));}};
    world.set(m.uuid,m);game.messages.push(m);recordFateWindow(m);return m;}
  hook={message};
  const original=new D20("1d20 + @bonus",{bonus},{target:targetDC,disadvantage,criticalSuccess:20,criticalFailure:1});
  original._evaluated=original.d20._evaluated=true;original.total=die+bonus;original.d20.results=[{result:die,active:true}];
  const card=message({type,actor:target,token:destination,author:player,rolls:[original],system:{forceSuccess:false,displayResult:true,targets:[]}});
  if(type==="attack"){
    const victim=actor("victim"),t=token(victim,61);world.set(t.uuid,t);card.system.targets=[{actor:victim.uuid,token:t.uuid,ac:targetDC}];
    Object.defineProperty(card.system,"evaluatedTargets",{get:()=>nativeFateAttackTargets.call({parent:card,targets:card.system.targets})});
  }
  const item={...clone(doc),id:doc._id,uuid:`${caster.uuid}.Item.${doc._id}`};
  const activity={...clone(castData),id:castData._id,uuid:`${item.uuid}.Activity.${castData._id}`,item,actor:caster,getUsageToken:()=>source};
  item.system.activities=new Map([[activity.id,activity]]);for(const d of [item,activity])world.set(d.uuid,d);
  const config={consume:{action:true,spellSlot:true},spikependium:{fateRoll:card.uuid,fateConsent:true}};
  const msg={data:{system:{}}};
  globalThis.Hooks={call:(name,a,c,m)=>{if(name==="dnd5e.preActivityConsumption")return captureFate(a,c,m);
    if(name==="dnd5e.postActivityConsumption"){recordFateConsumption(a,c,m);recordReactionConsumption(a,c,m);}return true;}};
  activity._prepareUsageUpdates=async c=>{const u={actor:{},item:[],create:[],delete:[],rolls:[]};
    await nativeConsumeSpellSlots.call({actor:caster,resolveLevel:()=>7,resolveCost:async()=>({total:1})},c,u);
    return prepareFateUpdates(activity,c,prepareReactionUpdates(activity,c,u));};
  async function use(){const u=await nativeConsume.call(activity,config,msg,async u=>{const delta=getDeltas(caster,u.actor);await caster.update(u.actor);return {actor:delta,item:{}};});
    if(!u)return;recordReaction(activity,msg);recordFateUsage(activity,msg);return message({...msg.data,type:"usage",actor:caster,author:player,activity});}
  async function refund(origin){await nativeRefund.call(activity,origin.system.deltas,async u=>caster.update(u.actor));}
  return {caster,target,card,source,destination,activity,config,msg,use,refund,gm,player,scene,message};
}
{
  const h=setup(),dialog={applicationClass:Dialog};prepareFateDialog(h.activity,h.config,dialog);assert.equal(dialog.configure,true);
  const context=await new dialog.applicationClass(h.config)._prepareConsumptionContext({fields:[],inputs:{}});assert.equal(context.fields.length,3);
  const origin=await h.use();assert.equal(h.caster.system.spells.spell7.value,1);assert.equal(reactionAvailable(h.caster),false);
  assert.deepEqual(origin.system.targets,[{actor:h.target.uuid,token:h.destination.uuid}]);
  await resumeFate(origin);assert.equal(h.card.rolls[0].total,21);assert.equal(h.card.rolls[0].options.advantageMode,1);
  assert.equal(h.target.system.attributes.hp.temp,35);assert.equal(game.messages.filter(m=>m.flags.spikependium?.fateTempRoll).length,1);
  assert.equal(d20Count,1);assert.equal(tempCount,1);await resumeFate();assert.equal(d20Count,1);
  h.target.system.attributes.hp.temp=3;await resumeFate();assert.equal(h.target.system.attributes.hp.temp,3,"повтор не восстанавливает потраченные временные хиты");
  await h.refund(origin);assert.equal(h.caster.system.spells.spell7.value,2);assert.equal(reactionAvailable(h.caster),true);
  assert.equal(h.card.rolls[0].total,21);assert.equal(h.target.system.attributes.hp.temp,3,"возврат ресурсов не отменяет разрешённый исход");
  assert.equal(fateDeltaLabel.call({keyPath:`flags.spikependium.fateCasts.${origin.flags.spikependium.fateCast.event}.active`},()=>({})).label,"Переплетение судьбы");
}
for(const type of ["check","save","attack"]){const h=setup({type});const origin=await h.use();await resumeFate(origin);assert.equal(h.target.system.attributes.hp.temp,35,type);}
for(const temp of [0,60]){const h=setup({temp});const o=await h.use();await resumeFate(o);assert.equal(h.target.system.attributes.hp.temp,Math.max(35,temp));}
{
  const h=setup({disadvantage:true});const origin=await h.use();await resumeFate(origin);assert.equal(h.card.rolls[0].options.advantageMode,0);
}
{
  const h=setup();nextDie=2;const o=await h.use();await resumeFate(o);assert.equal(h.target.system.attributes.hp.temp,0);assert.equal(h.card.rolls[0].total,6,"проваленный новый бросок обязателен");
}
{
  const h=setup({type:"check",targetDC:null});assert.equal(await h.use(),undefined);h.config.spikependium.fateDC=15;
  const o=await h.use();await resumeFate(o);assert.equal(h.target.system.attributes.hp.temp,35);
}
for(const step of ["flag","result","card","actor"]){const h=setup();const o=await h.use();fail=step;await assert.rejects(resumeFate(o));await resumeFate();
  assert.equal(h.target.system.attributes.hp.temp,35);assert.equal(h.card.rolls[0].total,21);assert.equal(d20Count,1);
  assert.equal(game.messages.filter(m=>m.flags.spikependium?.fateTempRoll).length,1,step);}
{
  const h=setup();h.card.whisper=["owner","gm"];const o=await h.use();assert.deepEqual(o.whisper,["owner","gm"]);
  await resumeFate(o);const card=game.messages.find(m=>m.flags.spikependium?.fateTempRoll);assert.deepEqual(card.whisper,o.whisper);
}
{
  const h=setup();h.source.hidden=true;const o=await h.use();assert.equal(o.blind,true);assert.deepEqual(o.whisper,["gm"]);
}
{
  const h=setup({activeGM:true});const o=await h.use();await resumeFate(o);assert.equal(d20Count,0);
  game.user=h.gm;await resumeFate();assert.equal(h.target.system.attributes.hp.temp,35);
}
for(const mutate of [h=>{h.config.spikependium.fateConsent=false;},h=>{game.time.worldTime++;},h=>{h.destination.x=60.1;},
  h=>{h.destination.elevation=1;},h=>{h.target.isOwner=false;},h=>{h.card.author={id:"outsider"};},
  h=>{h.card.rolls[0].total=20;},h=>{h.card.system.forceSuccess=true;},h=>{h.card.blind=true;},h=>{h.msg.create=false;},
  h=>{h.card.rolls.push(h.card.rolls[0]);},h=>{h.card.system.displayResult=false;},h=>{h.message({...h.card,id:undefined,uuid:undefined});}]){
  const h=setup();mutate(h);assert.equal(await h.use(),undefined);assert.equal(h.caster.system.spells.spell7.value,2);
}
{
  const h=setup();h.scene.grid.units="m";h.destination.x=18.288;assert.ok(await h.use());
}
{
  const h=setup();const o=await h.use();h.card.rolls[0].total++;await resumeFate(o);assert.equal(d20Count,0);assert.equal(h.target.system.attributes.hp.temp,0);
}
{
  const h=setup();const o=await h.use();await Promise.all([resumeFate(o),resumeFate(o),resumeFate(o)]);assert.equal(d20Count,1);assert.equal(h.target.system.attributes.hp.temp,35);
}
{
  const h=setup();const o=await h.use();o.system.deltas.actor=[];await resumeFate(o);assert.equal(d20Count,0);
}
{
  const h=setup();const o=await h.use();o.flags.spikependium.fateStarted=true;await resumeFate(o);
  assert.equal(d20Count,0,"после утраты несохранённого результата повторного переброска нет");assert.ok(warnings.some(w=>w.includes("не сохранился")));
}
{
  const h=setup();h.caster.system.spells.spell7.value=0;await assert.rejects(h.use());assert.equal(reactionAvailable(h.caster),true);
}
{
  const h=setup({type:"check"});h.card.system.type="initiative";assert.equal(await h.use(),undefined,"инициатива не бывает проваленным тестом");
}
{
 const h=setup({other:false});h.message({type:"save",actor:h.caster,token:h.source,author:h.player,rolls:[h.card.rolls[0]],
  system:{ability:"con"},flags:{spikependium:{painCastCheck:{event:"check"}}}});
 assert.ok(await h.use(),"проверка сотворения под болью не вытесняет исходный триггер реакции");
}
console.log("Переплетение судьбы: штатные расход/возврат реакции и ячейки, проверки/спасброски/атаки, native преимущество/помеха, СЛ/КД, 6к10 временных хитов без накопления/повторов, свежесть/дальность/высота/метры, приватность/авторство, отмена/сбои/параллельные карточки и проверка под болью: OK.");
