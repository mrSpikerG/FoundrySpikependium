import assert from "node:assert/strict";
import fs from "node:fs";
import { prepareSummon } from "../scripts/summons.mjs";
import { useMonsterMultiattack } from "../scripts/monster-actions.mjs";
import { canUseCombatFamiliar, canConsumeCombatFamiliar, prepareCombatFamiliarUpdates, recordCombatFamiliarConsumption, recordCombatFamiliarCast,
  canPlaceCombatFamiliar, prepareCombatFamiliarToken, recordCombatFamiliarPlaced, combatFamiliarChatAction, updateCombatFamiliars } from "../scripts/combat-familiar.mjs";
import { nativeSummonChanges } from "./data/dnd5e-summon-native.mjs";
import { nativeConsume, nativeRefund, getDeltas } from "./data/dnd5e-reaction-native.mjs";
import { nativeConsumeSpellSlots } from "./data/dnd5e-relentless-native.mjs";
const read=p=>fs.readdirSync(`packs/_source/${p}`).map(f=>JSON.parse(fs.readFileSync(`packs/_source/${p}/${f}`,"utf8")));
const doc=read("spells").find(d=>d.flags?.spikependium?.key==="spell:au-combat-familiar");
const forms=read("creatures").filter(d=>d.flags?.spikependium?.key?.startsWith("actor:au-combat-familiar-"));
assert.equal(forms.length,3);assert.equal(doc.system.school,"con");assert.equal(doc.system.source.page,"35");
assert.equal(doc.system.materials.cost,25);assert.equal(doc.system.materials.consumed,false);assert.ok(!doc.system.properties.includes("concentration"));
const [data,enhance]=Object.values(doc.system.activities);assert.equal(data.type,"summon");assert.equal(data.profiles.length,3);
assert.deepEqual(data.creatureTypes,["celestial","fey","fiend"]);assert.equal(enhance.type,"utility");assert.equal(enhance.consumption.spellSlot,true);
const lists=read("rules").find(d=>d.flags?.spikependium?.key==="journal:au-spell-lists");
assert.deepEqual(lists.pages.filter(p=>p.system.spells.includes(`Compendium.spikependium.spells.Item.${doc._id}`)).map(p=>p.system.identifier).sort(),["druid","warlock","wizard"]);
const clone=structuredClone,get=(o,p)=>p.split(".").reduce((o,k)=>o?.[k],o);
const set=(o,p,v)=>{const a=p.split("."),k=a.pop();a.reduce((o,k)=>o[k]??={},o)[k]=v;};
const list=a=>Object.assign(a,{get(id){return this.find(d=>d.id===id);},has(id){return !!this.get(id);},getByType(type){return this.filter(d=>d.type===type);}});
const flat=(o,p="",out={})=>{for(const[k,v]of Object.entries(o)){const q=p?`${p}.${k}`:k;if(v&&Object.getPrototypeOf(v)===Object.prototype)flat(v,q,out);else out[q]=v;}return out;};
let world=new Map(),serial=0,warnings=[],initiativeRolls=0;
globalThis.fromUuidSync=uuid=>world.get(uuid);
globalThis.foundry={utils:{getProperty:get,setProperty:set,flattenObject:flat,deepClone:clone,isEmpty:o=>!o||!Object.keys(o).length,randomID:()=>String(++serial).padStart(16,"0"),escapeHTML:s=>s},applications:{api:{DialogV2:{}}}};
globalThis.ui={notifications:{warn:m=>warnings.push(m),error:m=>warnings.push(m)}};
globalThis.CONFIG={DND5E:{actorSizes:{med:{token:1}},spellLevels:Object.fromEntries(Array.from({length:10},(_,i)=>[i,String(i)]))},Dice:{BasicRoll:{replaceFormulaData:(s,d)=>String(s).replace(/@([\w.]+)/g,(_,p)=>get(d,p)??0)}}};
Math.clamp=(n,min,max)=>Math.min(max,Math.max(min,n));Set.prototype.first??=function(){return this.values().next().value;};
globalThis.Roll=class{constructor(s,d){this.s=String(s).replace(/@([\w.]+)/g,(_,p)=>get(d,p)??0);}async evaluate(){assert.match(this.s,/^[\d .+*/()-]+$/);this.total=Function(`return (${this.s})`)();return this;}};
class Effect{constructor(d){this.d=clone(d);this.d.system??={changes:d.changes??[]};}toObject(){return clone(this.d);}}
globalThis.ActiveEffect=Effect;globalThis.Item=class{};
function actorData(d){const a={...clone(d),id:d._id,uuid:`Actor.${d._id}`,isOwner:true,statuses:new Set(),effects:list([]),classes:{},_source:d,getRollData:()=>({}),
  async update(u){for(const[p,v]of Object.entries(u))set(this,p,clone(v));},testUserPermission:u=>u?.isGM||u?.id==="owner"};
 a.system.isNPC=a.system.isCreature=true;
 a.items=list(d.items.map(i=>{const it={...clone(i),id:i._id,effects:[],system:{...clone(i.system)}};it.system.hasAttack=Object.values(it.system.activities).some(a=>a.type==="attack");it.hasAttack=it.system.hasAttack;
  it.system.activities=list(Object.values(it.system.activities).map(a=>({...a,id:a._id,actionType:"msak"})));Object.defineProperty(it.system.activities,"size",{get(){return this.length;}});return it;}));return a;}
for(const form of forms){assert.deepEqual(form.system.traits.ci.value,["frightened","charmed"]);assert.equal(form.system.attributes.senses.ranges.darkvision,60);
 assert.equal(form.system.abilities.dex.value,16);assert.equal(form.system.attributes.movement.speeds.swim,"30");
 const bruiser=form.name.includes("Громила"),flyer=form.name.includes("Летун");assert.equal(form.system.attributes.ac.flat,bruiser?13:11);assert.equal(form.system.attributes.hp.max,bruiser?30:20);
 assert.equal(form.system.attributes.movement.hover,flyer);assert.equal(form.system.attributes.movement.speeds.fly,flyer?"30":undefined);
 for(let level=2;level<=9;level++){const a=actorData(form),caster={prototypeToken:{disposition:1},classes:{},system:{attributes:{prof:4}}};
  const host={...clone(data),id:data._id,uuid:"Actor.caster.Item.spell.Activity.cast",actor:caster,item:{uuid:"Actor.caster.Item.spell",system:{level}},ability:"int",relevantLevel:level,
   creatureSizes:new Set(data.creatureSizes),creatureTypes:new Set(data.creatureTypes),getApplicableEffects:async()=>[],getRollData:()=>({item:{level},attributes:{prof:4,spell:{dc:16}},abilities:{int:{mod:4,dc:16}},mod:4})};
  const c={actor:a,...await nativeSummonChanges.call(host,a,data.profiles[0],{creatureType:"fiend"})};prepareSummon(host,data.profiles[0],c);
  assert.equal(c.actorUpdates["system.attributes.hp.max"]??form.system.attributes.hp.max,(bruiser?30:20)+5*(level-2));
  assert.equal(c.actorUpdates.effects.find(e=>e._id==="dnd5eACBonus").system.changes[0].value,level);
  assert.equal(c.actorUpdates["system.details.type.value"],"fiend");
  for(const ability of ["str","dex","con","int","wis","cha"]){assert.equal(c.actorUpdates[`system.abilities.${ability}.check.roll.bonus`],String(Math.floor(level/2)));assert.equal(c.actorUpdates[`system.abilities.${ability}.save.roll.bonus`],String(Math.floor(level/2)));}
  const changes=c.actorUpdates.items.flatMap(i=>i.effects.flatMap(e=>e.system.changes));assert.equal(changes.find(c=>c.key==="activities[attack].attack.bonus").value,"4 + 4");
  assert.equal(changes.find(c=>c.key==="system.damage.bonus").value,String(level));
 }
}
function setup(){world=new Map();serial=0;warnings=[];initiativeRolls=0;const gm={id:"gm",isGM:true,isActiveGM:true};globalThis.game={user:gm,users:{activeGM:gm},actors:[],scenes:[],combats:[],time:{worldTime:100}};
 const caster={id:"caster",uuid:"Actor.caster",flags:{},isOwner:true,statuses:new Set(),system:{spells:{spell2:{value:2,max:2}}},testUserPermission:()=>true,
  async update(u){for(const[p,v]of Object.entries(u))set(this,p,clone(v));}};world.set(caster.uuid,caster);game.actors.push(caster);
 const item={uuid:"Actor.caster.Item.spell",system:{level:2,identifier:"combat-familiar"},flags:clone(doc.flags),actor:caster};world.set(item.uuid,item);
 const a={...clone(data),id:data._id,uuid:`${item.uuid}.Activity.${data._id}`,actor:caster,item};world.set(a.uuid,a);
 const scene={id:"scene",tokens:list([]),async deleteEmbeddedDocuments(type,ids){assert.equal(type,"Token");this.tokens=list(this.tokens.filter(t=>!ids.includes(t.id)));}};game.scenes.push(scene);
 const config={spikependium:{combatFamiliarSpace:true}},message={data:{system:{}}};
 globalThis.Hooks={call:(name,a,c,m)=>{if(name==="dnd5e.preActivityConsumption")return canConsumeCombatFamiliar(a,c,m);if(name==="dnd5e.postActivityConsumption")recordCombatFamiliarConsumption(a,c,m);return true;}};
 a._prepareUsageUpdates=async cfg=>{const u={actor:{},item:[],rolls:[]};await nativeConsumeSpellSlots.call({actor:caster,resolveLevel:()=>2,resolveCost:async()=>({total:1})},cfg,u);return prepareCombatFamiliarUpdates(a,cfg,u);};
 async function use(){const u=await nativeConsume.call(a,config,message,async u=>{const d=getDeltas(caster,u.actor);await caster.update(u.actor);return {actor:d,item:{}};});if(!u)return;
  recordCombatFamiliarCast(a,message);return {type:"usage",author:game.user,flags:clone(message.data.flags),system:clone(message.data.system)};}
 function place(){const actor=actorData(forms[0]);actor.system.currency={gp:0};actor.flags.dnd5e={summon:{origin:item.uuid}};
  const c={actor,actorUpdates:{},tokenUpdates:{}};if(prepareCombatFamiliarToken(a,a.profiles[0],c)===false)return;
  const token={id:`familiar${++serial}`,uuid:`Scene.scene.Token.familiar${serial}`,actor,parent:scene,flags:{},actorId:actor.id};
  for(const[p,v]of Object.entries(c.tokenUpdates))set(token,p,v);scene.tokens.push(token);world.set(token.uuid,token);return token;}
 return {caster,a,scene,config,message,use,place};
}
{
 const h=setup(),origin=await h.use();assert.equal(h.caster.system.spells.spell2.value,1);assert.equal(canPlaceCombatFamiliar(h.a),undefined);
 const t=h.place();assert.ok(t);await recordCombatFamiliarPlaced(h.a,h.a.profiles[0],[t]);assert.equal(canPlaceCombatFamiliar(h.a),false);
 await updateCombatFamiliars();assert.equal(h.scene.tokens.length,1);game.time.worldTime=3700;await updateCombatFamiliars();assert.equal(h.scene.tokens.length,0);
 await nativeRefund.call(h.a,origin.system.deltas,async u=>h.caster.update(u.actor));assert.equal(h.caster.system.spells.spell2.value,2);assert.equal(canPlaceCombatFamiliar(h.a),false);
}
for(const cause of ["dead","zero","refund","replacement"]){const h=setup(),origin=await h.use();const t=h.place();
 if(cause==="dead")h.caster.statuses.add("dead");if(cause==="zero")t.actor.system.attributes.hp.value=0;
 if(cause==="refund")await nativeRefund.call(h.a,origin.system.deltas,async u=>h.caster.update(u.actor));
 if(cause==="replacement"){await h.use();assert.ok(h.place());}await updateCombatFamiliars();assert.equal(h.scene.tokens.length,cause==="replacement"?1:0,cause);}
{
 const h=setup();await h.use();h.place();h.caster.system.attributes={hp:{value:0}};await updateCombatFamiliars();assert.equal(h.scene.tokens.length,1,"0 Хитов заклинателя без смерти не завершает призыв");
 const source={uuid:"Item.find",system:{identifier:"find-familiar"},actor:h.caster};world.set(source.uuid,source);
 game.actors.push({uuid:"Actor.ordinary",flags:{dnd5e:{summon:{origin:source.uuid}}}});await updateCombatFamiliars();assert.equal(h.scene.tokens.length,0,"обычный фамильяр заменяет боевого");
}
{
 const h=setup();await h.use();const t=h.place();game.combats.push({id:"combat",started:true,scene:h.scene,combatants:[{actor:h.caster,initiative:19}],
  async createEmbeddedDocuments(type,[d]){assert.equal(type,"Combatant");const c={id:"familiar",actor:t.actor,token:t,initiative:null};this.combatants.push(c);return[c];},
  async rollInitiative([id]){assert.equal(id,"familiar");initiativeRolls++;this.combatants.at(-1).initiative=7;}});
 await updateCombatFamiliars();await updateCombatFamiliars();assert.equal(initiativeRolls,1);assert.equal(game.combats[0].combatants.at(-1).initiative,7);
}
{
 const h=setup();const original={uuid:"Item.find",system:{identifier:"find-familiar"},actor:h.caster};world.set(original.uuid,original);
 game.actors.push({uuid:"Actor.familiar",flags:{dnd5e:{summon:{origin:original.uuid}}}});assert.equal(canUseCombatFamiliar(h.a),false);assert.equal(await h.use(),undefined);
}
{
 const h=setup();h.message.create=false;assert.equal(await h.use(),undefined);assert.equal(h.caster.system.spells.spell2.value,2);
}
{
 const h=setup();h.config.spikependium.combatFamiliarSpace=false;assert.equal(await h.use(),undefined);assert.equal(h.caster.system.spells.spell2.value,2);
}
{
 const h=setup();const o=await h.use();let called=0;await combatFamiliarChatAction.call(h.a,()=>{called++;},null,{dataset:{action:"placeSummons"}},o);assert.equal(called,1);
 o.system.deltas.actor=[];await combatFamiliarChatAction.call(h.a,()=>{called++;},null,{dataset:{action:"placeSummons"}},o);assert.equal(called,1);
}
for(let level=2;level<=9;level++){
 const h=setup(),a=actorData(forms[0]);a.flags.dnd5e={summon:{level}};let count=0;
 const item=a.items.find(i=>i.system.identifier==="au-familiar-rend"),attack=item.system.activities[0];
 attack.item=item;attack.use=async()=>({message:{id:"usage"}});attack.rollAttack=async()=>{count++;return[{}];};
 foundry.applications.api.DialogV2.wait=async()=>attack.id;
 const action=a.items.find(i=>i.name==="Мультиатака").system.activities[0];action.actor=a;
 const message={author:game.user,flags:{},async setFlag(m,p,v){set(this.flags,`${m}.${p}`,v);}};
 await useMonsterMultiattack(action,{}, {message});assert.equal(count,Math.floor(level/2));
}
console.log("Боевой фамильяр: PDF/3 формы/типы/папки, native КД/Хиты/атака/урон/Талантливый 2–9, Мультиатака, оплата/возврат, один фамильяр/повтор/срок/смерть/0 Хитов, собственная инициатива: OK. Усиление обычного фамильяра и особое перемещение пока ручные.");
