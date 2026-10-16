import fs from "node:fs";
import assert from "node:assert/strict";
import {recordForeknowledgeWindow,prepareForeknowledgeDialog,captureForeknowledge,prepareForeknowledgeUpdates,recordForeknowledgeConsumption,
  recordForeknowledgeUsage,foreknowledgeRoll,resumeForeknowledge,foreknowledgeDeltaLabel} from "../scripts/arcana-foreknowledge.mjs";
import {prepareReactionUpdates,recordReaction,recordReactionConsumption,reactionAvailable} from "../scripts/reactions.mjs";
import {nativeConsume,nativeRefund,getDeltas,nativeSaveRollFailure} from "./data/dnd5e-reaction-native.mjs";
import {nativeD20ConfigureModifiers} from "./data/dnd5e-arcana-native.mjs";
import {nativeConsumeSpellSlots} from "./data/dnd5e-relentless-native.mjs";
import {makeFateDie,nativeFateAttackTargets} from "./data/dnd5e-fate-native.mjs";
const docs=pack=>fs.readdirSync(`packs/_source/${pack}`).map(f=>JSON.parse(fs.readFileSync(`packs/_source/${pack}/${f}`,"utf8")));
const doc=docs("spells").find(d=>d.flags?.spikependium?.key==="spell:au-moment-of-prescience");
assert.ok(doc);assert.equal(doc.name,"Момент предвидения");assert.equal(doc.system.source.page,"43");
assert.equal(doc.system.level,8);assert.equal(doc.system.school,"div");assert.deepEqual(doc.system.properties,["vocal","somatic"]);
const cast=Object.values(doc.system.activities)[0];assert.equal(cast.activation.type,"reaction");assert.equal(cast.range.units,"self");
assert.equal(cast.consumption.spellSlot,true);assert.equal(doc.system.duration.units,"inst");
const journal=docs("rules").find(d=>d.flags?.spikependium?.key==="journal:au-spell-lists");
assert.deepEqual(journal.pages.filter(p=>p.system.spells.includes(`Compendium.spikependium.spells.Item.${doc._id}`)).map(p=>p.system.identifier),["wizard"]);
assert.ok(docs("spells").find(d=>d._key.startsWith("!folders!")&&d._id===doc.folder&&d.name==="8 уровень"));
const clone=structuredClone,get=(o,p)=>p.split(".").reduce((o,k)=>o?.[k],o);
const set=(o,p,v)=>{const a=p.split("."),k=a.pop();a.reduce((o,k)=>o[k]??={},o)[k]=clone(v);};
const list=a=>Object.assign(a,{get(id){return this.find(d=>d.id===id);}});
const flat=(o,p="",out={})=>{for(const[k,v]of Object.entries(o)){const q=p?`${p}.${k}`:k;if(v&&Object.getPrototypeOf(v)===Object.prototype)flat(v,q,out);else out[q]=v;}return out;};
Number.isNumeric=n=>(typeof n==="number"||typeof n==="string"&&n.trim()!=="")&&Number.isFinite(Number(n));
Math.clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
Array.prototype.findSplice??=function(fn){const i=this.findIndex(fn);if(i>=0)this.splice(i,1);};
let world,counter,warnings,fail;
globalThis.fromUuidSync=uuid=>world.get(uuid);
globalThis.ui={notifications:{warn:m=>warnings.push(m),error:m=>warnings.push(m)}};
globalThis.foundry={utils:{getProperty:get,setProperty:set,flattenObject:flat,randomID:()=>String(++counter).padStart(16,"0"),isEmpty:o=>!Object.keys(o).length},
 data:{fields:{StringField:class{constructor(o){Object.assign(this,o);}},NumberField:class{}}}};
globalThis.ActiveEffect={implementation:{getEffectStart:()=>({time:game.time.worldTime})}};
class HostDie{constructor(data){Object.assign(this,{number:1,faces:20,options:{},modifiers:[],results:[]},data);}get total(){return this.results.filter(r=>r.active!==false&&!r.discarded).reduce((n,r)=>n+(r.count??r.result),0);}}
const Die=makeFateDie(HostDie);
class D20{
 static ADV_MODE={NORMAL:0,ADVANTAGE:1,DISADVANTAGE:-1};
 constructor(formula,data={},options={}){this.formula=formula;this.data=clone(data);this.options=clone(options);this._evaluated=false;this.extra=[];
  this.d20=new Die({options:{},modifiers:[]});if(!this.options.configured)nativeD20ConfigureModifiers.call(this);}
 resetFormula(){this.formula=`1d20${this.d20.modifiers.join("")} + ${this.data.bonus??4}`;}
 get validD20Roll(){return this.d20.isValid;}
 get isFailure(){return nativeSaveRollFailure.call(this);}
 get isCritical(){return this.d20.isCriticalSuccess;}
 get isFumble(){return this.d20.isCriticalFailure;}
 async evaluate(){throw Error("Момент предвидения не должен бросать новые кубики");}
 toJSON(){return{class:"D20Roll",formula:this.formula,data:clone(this.data),options:clone(this.options),evaluated:this._evaluated,total:this.total,
  terms:[{class:"D20Die",number:this.d20.number,faces:20,modifiers:clone(this.d20.modifiers),options:clone(this.d20.options),results:clone(this.d20.results)},...clone(this.extra)]};}
 static fromData(d){const r=new this(d.formula,d.data,d.options);r._evaluated=d.evaluated;r.total=d.total;r.d20=new Die(clone(d.terms[0]));r.d20._evaluated=d.evaluated;r.extra=clone(d.terms.slice(1));return r;}
}
globalThis.CONFIG={Dice:{D20Roll:D20},DND5E:{spellLevels:Object.fromEntries(Array.from({length:10},(_,i)=>[i,String(i)]))}};
class Dialog{constructor(config){this.config=config;}async _prepareConsumptionContext(c){return c;}}
function setup({type="save",incoming=false,die=5,bonus=4,dc=15,activeGM=false}={}){
 world=new Map();counter=0;warnings=[];fail=null;const player={id:"owner"},gm={id:"gm",isGM:true,isActiveGM:true},users=list([player,gm]);users.activeGM=activeGM?gm:null;
 function actor(id){const a={id,uuid:`Actor.${id}`,documentName:"Actor",name:id,flags:{},effects:list([]),statuses:new Set(),isOwner:true,
  system:{isCreature:true,spells:{spell8:{value:2,max:2}}},testUserPermission:u=>!!u&&(u.isGM||u.id==="owner"),
  async update(d){if(fail==="actor"){fail=null;throw Error("actor");}for(const[p,v]of Object.entries(d))set(this,p,v);}};world.set(a.uuid,a);return a;}
 const caster=actor("caster"),attacker=incoming?actor("attacker"):caster,victim=incoming?caster:actor("victim");
 globalThis.game={user:player,userId:player.id,users,combats:[],combat:null,messages:list([]),scenes:[],time:{worldTime:100}};
 const scene={flags:{}};game.scenes.push(scene);
 const token=a=>({id:a.id,uuid:`Scene.scene.Token.${a.id}`,actor:a,parent:scene});
 const source=token(caster),attacking=incoming?token(attacker):source,target=incoming?source:token(victim);
 for(const t of [source,attacking,target])world.set(t.uuid,t);
 function message(data){const id=`message${++counter}`,m={id,uuid:`ChatMessage.${id}`,flags:{},rolls:[],system:{},whisper:[],blind:false,...data,
  getAssociatedActor:()=>data.actor,getAssociatedToken:()=>data.token,getAssociatedActivity:()=>data.activity,
  updateSource(d){for(const[p,v]of Object.entries(d))set(this,p,v);},canUserModify:u=>!!u&&(u.isGM||u.id===data.author?.id),
  async update(d){if(fail==="card"){fail=null;throw Error("card");}for(const[p,v]of Object.entries(d)){if(p==="rolls")this.rolls=v;else set(this,p,v);}},
  async setFlag(m,p,v){if(fail==="flag"){fail=null;throw Error("flag");}set(this.flags,`${m}.${p}`,v);}};
  world.set(m.uuid,m);game.messages.push(m);recordForeknowledgeWindow(m);return m;}
 const roll=new D20("1d20 + @bonus",{bonus},{target:dc,criticalSuccess:20,criticalFailure:1});
 roll._evaluated=roll.d20._evaluated=true;roll.total=die+bonus;roll.d20.results=[{result:die,active:true}];
 const card=message({type,actor:attacker,token:attacking,author:player,rolls:[roll],system:{forceSuccess:false,displayResult:true,targets:type==="attack"?[{actor:victim.uuid,token:target.uuid,ac:dc}]:[]}});
 if(type==="attack")Object.defineProperty(card.system,"evaluatedTargets",{get:()=>nativeFateAttackTargets.call({parent:card,targets:card.system.targets})});
 const item={...clone(doc),id:doc._id,uuid:`${caster.uuid}.Item.${doc._id}`};
 const a={...clone(cast),id:cast._id,uuid:`${item.uuid}.Activity.${cast._id}`,actor:caster,item,getUsageToken:()=>source};
 item.system.activities=new Map([[a.id,a]]);world.set(item.uuid,item);world.set(a.uuid,a);
 const config={consume:{action:true,spellSlot:true},spikependium:{foreknowledgeRoll:`${card.uuid}:0`}},msg={data:{system:{}}};
 globalThis.Hooks={call:(name,a,c,m)=>{if(name==="dnd5e.preActivityConsumption")return captureForeknowledge(a,c,m);
  if(name==="dnd5e.postActivityConsumption"){recordForeknowledgeConsumption(a,c,m);recordReactionConsumption(a,c,m);}return true;}};
 a._prepareUsageUpdates=async c=>{const u={actor:{},item:[],rolls:[]};if(c.consume!==false&&c.consume?.spellSlot!==false)
  await nativeConsumeSpellSlots.call({actor:caster,resolveLevel:()=>8,resolveCost:async()=>({total:1})},c,u);
  return prepareForeknowledgeUpdates(a,c,prepareReactionUpdates(a,c,u));};
 async function use(){const u=await nativeConsume.call(a,config,msg,async u=>{const delta=getDeltas(caster,u.actor);await caster.update(u.actor);return{actor:delta,item:{}};});
  if(!u)return;recordReaction(a,msg);recordForeknowledgeUsage(a,msg);return message({...msg.data,type:"usage",actor:caster,author:player,activity:a});}
 const refund=o=>nativeRefund.call(a,o.system.deltas,async u=>caster.update(u.actor));
 return{caster,attacker,victim,source,attacking,target,a,card,roll,config,msg,use,refund,message,player,gm};
}
for(const type of ["check","save","attack"]){
 const h=setup({type}),d={applicationClass:Dialog};prepareForeknowledgeDialog(h.a,h.config,d);assert.equal(d.configure,true);
 const c=await new d.applicationClass(h.config)._prepareConsumptionContext({fields:[]});assert.equal(c.fields.length,2);
 const o=await h.use();assert.equal(h.caster.system.spells.spell8.value,1);assert.equal(reactionAvailable(h.caster),false);
 await resumeForeknowledge(o);assert.equal(h.card.rolls[0].d20.total,20);assert.equal(h.card.rolls[0].total,24);
 if(type==="attack")assert.equal(h.card.system.evaluatedTargets[0].isMiss,false);else assert.equal(h.card.rolls[0].isFailure,false);
 await resumeForeknowledge();assert.equal(h.card.rolls[0].total,24);
 await h.refund(o);await resumeForeknowledge(h.caster);assert.equal(h.card.rolls[0].total,9);assert.equal(h.card.rolls[0].d20.total,5);
 assert.equal(h.caster.system.spells.spell8.value,2);assert.equal(reactionAvailable(h.caster),true);
 assert.equal(foreknowledgeDeltaLabel.call({keyPath:`flags.spikependium.foreknowledge.${o.flags.spikependium.foreknowledge.event}.active`},()=>({})).label,"Момент предвидения");
}
{
 const h=setup({type:"attack",incoming:true,die:20,bonus:100,dc:15}),o=await h.use();await resumeForeknowledge(o);
 assert.equal(h.card.rolls[0].total,101);assert.equal(h.card.rolls[0].isFumble,true);assert.equal(h.card.system.evaluatedTargets[0].isMiss,true,"к20=1 даёт штатный промах даже с большим модификатором");
 await h.refund(o);await resumeForeknowledge();assert.equal(h.card.rolls[0].d20.total,20);assert.equal(h.card.rolls[0].isCritical,true);
}
{
 const h=setup();h.roll.d20.results.unshift({result:19,active:false,discarded:true});h.roll.d20.modifiers=["dis"];
 h.roll.extra=[{class:"OperatorTerm",operator:"+"},{class:"Die",faces:4,results:[{result:3,active:true}]}];h.roll.total+=3;
 const o=await h.use();await resumeForeknowledge(o);assert.equal(h.card.rolls[0].total,27);assert.equal(h.card.rolls[0].d20.results[0].result,19);
 assert.equal(h.card.rolls[0].d20.results[0].discarded,true);assert.deepEqual(h.card.rolls[0].extra,h.roll.extra,"остальные кубики сохраняются");
}
{
 const h=setup({die:2});h.roll.d20.modifiers=["min10"];h.roll.d20.results[0].count=10;h.roll.total=14;
 const o=await h.use();await resumeForeknowledge(o);assert.equal(h.card.rolls[0].total,24);assert.equal(h.card.rolls[0].d20.total,20);
}
{
 const h=setup();const other=D20.fromData(h.roll.toJSON());other.total=7;other.d20.results[0].result=3;h.card.rolls.push(other);h.config.spikependium.foreknowledgeRoll=`${h.card.uuid}:1`;
 const o=await h.use();await resumeForeknowledge(o);assert.equal(h.card.rolls[0].total,9);assert.equal(h.card.rolls[1].total,24,"меняется только выбранный бросок общей карточки");
 await h.refund(o);await resumeForeknowledge();assert.equal(h.card.rolls[1].total,7);
}
for(const dc of [null,undefined]){
 const h=setup({dc});h.roll.options.target=dc;assert.equal(await h.use(),undefined);h.config.spikependium.foreknowledgeDC=15;
 const o=await h.use();await resumeForeknowledge(o);assert.equal(h.card.rolls[0].total,24);assert.equal(h.card.rolls[0].options.target,15);
}
for(const mutate of [h=>{h.roll.total=20;},h=>{h.card.system.forceSuccess=true;},h=>{h.card.system.type="initiative";h.card.type="check";},
 h=>{game.time.worldTime++;},h=>{h.card.blind=true;},h=>{h.card.system.displayResult=false;},h=>{h.card.author={id:"stranger"};},
 h=>{h.msg.create=false;},h=>{h.roll.d20.results.push({result:2,active:true});},h=>{h.roll.d20.faces=12;},
 h=>{h.config.consume={action:false};},h=>{h.config.spikependium.foreknowledgeRoll=`${h.card.uuid}:99`;}]){
 const h=setup();mutate(h);assert.equal(await h.use(),undefined);assert.equal(h.caster.system.spells.spell8.value,2);
}
{
 const h=setup({type:"attack",incoming:true,die:5});assert.equal(await h.use(),undefined,"входящий промах не является триггером");
}
{
 const h=setup({type:"attack",incoming:true,die:17});h.a.getUsageToken=()=>({...h.source,uuid:"Scene.scene.Token.other"});assert.equal(await h.use(),undefined,"другой токен того же персонажа не подменяет получателя атаки");
}
{
 const h=setup();h.a.getUsageToken=()=>null;const o=await h.use();await resumeForeknowledge(o);assert.equal(h.card.rolls[0].total,24,"собственный тест без сцены работает");
}
for(const stage of ["card","actor","flag"]){
 const h=setup(),o=await h.use();fail=stage;await assert.rejects(resumeForeknowledge(o));await resumeForeknowledge();
 assert.equal(h.card.rolls[0].total,24);assert.equal(h.caster.flags.spikependium.foreknowledge[o.flags.spikependium.foreknowledge.event].appliedOrigin,o.uuid,stage);
 assert.equal(o.flags.spikependium.foreknowledgeApplied,true);
}
{
 const h=setup(),o=await h.use();await Promise.all([resumeForeknowledge(o),resumeForeknowledge(o)]);assert.equal(h.card.rolls[0].total,24);
 const copy=h.message({...o,uuid:"ChatMessage.copy",flags:clone(o.flags)});delete copy.flags.spikependium.foreknowledgeApplied;
 await resumeForeknowledge(copy);assert.equal(copy.flags.spikependium.foreknowledgeApplied,undefined,"копия старой карточки не получает чужое применение");
}
{
 const h=setup(),o=await h.use();await h.refund(o);await resumeForeknowledge();assert.equal(h.card.rolls[0].total,9,"отменённое до разрешения применение не меняет исходный бросок");
}
{
 const h=setup(),o=await h.use();await resumeForeknowledge(o);h.card.rolls[0].total=31;await h.refund(o);await resumeForeknowledge();assert.equal(h.card.rolls[0].total,31,"отмена не затирает более новое изменение");
 const count=warnings.length;await resumeForeknowledge();assert.equal(warnings.length,count,"повторное уведомление не создаётся");
}
{
 const h=setup(),o=await h.use();game.time.worldTime++;await resumeForeknowledge(o);assert.equal(h.card.rolls[0].total,9,"новая первичная замена не применяется задним числом");
}
for(const mutate of [o=>{o.system.deltas.actor=[];},o=>{o.author={id:"stranger"};},o=>{o.flags.spikependium.foreknowledge.value=1;}]){
 const h=setup(),o=await h.use();mutate(o);await resumeForeknowledge(o);assert.equal(h.card.rolls[0].total,9);
}
{
 const h=setup({activeGM:true}),o=await h.use();await resumeForeknowledge(o);assert.equal(h.card.rolls[0].total,9);
 game.user=h.gm;await resumeForeknowledge();assert.equal(h.card.rolls[0].total,24,"чужую карточку разрешает активный Мастер");
}
{
 const h=setup();h.card.whisper=["owner","gm"];const o=await h.use();assert.deepEqual(o.whisper,["owner","gm"]);
}
{
 const h=setup();h.source.hidden=true;const o=await h.use();assert.equal(o.blind,true);assert.deepEqual(o.whisper,["gm"]);
}
{
 const h=setup();h.config.consume={spellSlot:false};const o=await h.use();await resumeForeknowledge(o);assert.equal(h.card.rolls[0].total,24);assert.equal(h.caster.system.spells.spell8.value,2,"легальное бесплатное сотворение сохраняет расход реакции");
}
{
 const h=setup({type:"attack",incoming:true,die:17,activeGM:true}),o=await h.use();game.user=h.gm;
 h.a.getUsageToken=()=>({...h.source,uuid:"Scene.scene.Token.controlledByGM"});await resumeForeknowledge(o);
 assert.equal(h.card.rolls[0].d20.total,1,"у Мастера используется исходный токен игрока, а не текущий контролируемый токен");
}
for(const advance of [false,true]){
 const h=setup({activeGM:true}),combat={uuid:"Combat.source",started:true,round:1,turn:0,getCombatantsByActor:a=>a===h.caster?[{token:h.source}]:[]};
 game.combats.push(combat);world.set(combat.uuid,combat);game.combat=combat;recordForeknowledgeWindow(h.card);
 const o=await h.use();game.user=h.gm;game.combat={uuid:"Combat.other",started:true,round:8,turn:6};if(advance)combat.turn++;
 await resumeForeknowledge(o);assert.equal(h.card.rolls[0].d20.total,advance?5:20,"момент определяется исходным боем без зависимости от интерфейса Мастера");
}
{
 const h=setup();const combat={uuid:"Combat.source",started:true,round:1,turn:0,getCombatantsByActor:()=>[{token:h.source}]};game.combats.push(combat);world.set(combat.uuid,combat);recordForeknowledgeWindow(h.card);
 const o=await h.use();await resumeForeknowledge(o);await h.refund(o);fail="card";await assert.rejects(resumeForeknowledge());await resumeForeknowledge();assert.equal(h.card.rolls[0].total,9,"сбой отмены продолжает восстановление без нового расхода");
}
{
 const h=setup({type:"attack",incoming:true,die:17});h.card.system.targets.push({actor:h.victim.uuid,token:h.target.uuid,ac:12});
 const o=await h.use();await resumeForeknowledge(o);assert.equal(h.card.system.evaluatedTargets.every(t=>t.isMiss),true,"меняется общий бросок атаки для всех его целей");
}
{
 const h=setup();h.roll._evaluated=false;assert.equal(foreknowledgeRoll(h.roll,20),undefined);h.roll._evaluated=true;assert.equal(foreknowledgeRoll(h.roll,17),undefined);
 h.roll.d20.results[0].count=19;assert.equal(foreknowledgeRoll(h.roll,20),undefined,"нестандартный счётчик успехов не трактуется как обычная грань к20");
}
{
 const h=setup({dc:30}),o=await h.use();await resumeForeknowledge(o);assert.equal(h.card.rolls[0].total,24);assert.equal(h.card.rolls[0].isFailure,true,"замена грани не означает автоматического успеха проверки с высокой СЛ");
}
{
 const h=setup(),combat={uuid:"Combat.actorOnly",started:true,round:1,turn:0,getCombatantsByActor:()=>[{actor:h.caster}]};
 game.combats.push(combat);world.set(combat.uuid,combat);recordForeknowledgeWindow(h.card);const o=await h.use();combat.turn++;
 await resumeForeknowledge(o);assert.equal(h.card.rolls[0].total,9,"граница хода учитывается и у участника боя без токена");
}
for(const selectCheck of [false,true]){
 const h=setup(),check=h.message({type:"save",actor:h.caster,token:h.source,author:h.player,rolls:[h.roll],system:{ability:"con"},
  flags:{spikependium:{painCastCheck:{event:"check"}}}});
 if(selectCheck)h.config.spikependium.foreknowledgeRoll=`${check.uuid}:0`;
 assert.ok(await h.use(),"доступен исходный триггер или сама проваленная проверка под болью");
}
console.log("Момент предвидения: PDF/список/папка, native ячейка/реакция/возврат, собственные тесты/атаки и входящие попадания, к20=20/1 с модификаторами/прочими кубиками/критом, общие карточки, исходный бой/токен, свежесть/приватность/права, сбои/повторы/отмена без перезаписи новых изменений и проверка под болью: OK.");
