import assert from "node:assert/strict";
import fs from "node:fs";
import { SCHOOL_ADEPTS } from "../src/content/arcana-unleashed-schools.mjs";
import { schoolASICanImprove, schoolASIApply, schoolGrantApply, syncSchoolSpells, canUseSchoolSpell, schoolSlotRecharge, prepareSchoolConcentration, buildSchoolConcentration, finalizeSchoolConcentration } from "../scripts/arcana-schools.mjs";
import { nativeSchoolGrantApply, nativeSchoolCreateItemData, nativeSchoolSpellChanges } from "./data/dnd5e-schools-native.mjs";
import { nativeMagusASIApply } from "./data/dnd5e-magus-native.mjs";
import { nativePerformBulkUpdate } from "./data/dnd5e-arcana-native.mjs";
import { getDeltas, nativeRefund } from "./data/dnd5e-reaction-native.mjs";
const docs=fs.readdirSync("packs/_source/feats").map(f=>JSON.parse(fs.readFileSync(`packs/_source/feats/${f}`,"utf8"))).filter(d=>d.flags?.spikependium?.schoolAdept);
assert.equal(docs.length,8);const SRD=JSON.parse(fs.readFileSync("tools/data/srd.json","utf8"));
const clone=structuredClone,get=(o,p)=>p.split(".").reduce((o,k)=>o?.[k],o);
const set=(o,p,v)=>{const a=p.split("."),k=a.pop();a.reduce((o,k)=>o[k]??={},o)[k]=clone(v);};
const merge=(o,data)=>{for(const[p,v]of Object.entries(data)){if(p.includes("."))set(o,p,v);else if(v&&Object.getPrototypeOf(v)===Object.prototype)merge(o[p]??={},v);else o[p]=clone(v);}return o;};
const list=a=>Object.assign(a,{get(id){return this.find(i=>i.id===id);},has(id){return !!this.get(id);}});
const flat=(o,p="",out={})=>{for(const[k,v]of Object.entries(o)){const q=p?`${p}.${k}`:k;if(v&&Object.getPrototypeOf(v)===Object.prototype)flat(v,q,out);else out[q]=v;}return out;};
Set.prototype.first??=function(){return this.values().next().value;};
let serial=0,world=new Map(),warnings=[],fail=null,createdCount=0;
globalThis.foundry={utils:{getProperty:get,setProperty:set,deepClone:clone,isEmpty:o=>!o||!Object.keys(o).length,flattenObject:flat,randomID:()=>String(++serial).padStart(16,"0")}};
globalThis.ui={notifications:{warn:m=>warnings.push(m)}};
globalThis.fromUuidSync=uuid=>world.get(uuid);
globalThis.fromUuid=async uuid=>world.get(uuid);
globalThis.CONFIG={DND5E:{abilities:Object.fromEntries(["str","dex","con","int","wis","cha"].map(a=>[a,{}])),spellcasting:{spell:{slots:true}}}};
class Source {
 constructor(data){this.data=clone(data);}
 clone(update){return new Source(merge(clone(this.data),update));}
 toObject(){return clone(this.data);}
}
for(const [name,meta]of Object.entries(SRD.spells))world.set(`Compendium.dnd5e.spells24.Item.${meta.id}`,new Source({_id:meta.id,name,type:"spell",flags:{},_stats:{compendiumSource:null},system:{level:meta.level,school:meta.school,prepared:0,ability:"",activities:{},description:{value:name}}}));
class Item {
 constructor(data,actor){this.actor=actor;this.setData(data);}
 setData(data){this.data=clone(data);this.id=data._id;this.name=data.name;this.uuid=`${this.actor.uuid}.Item.${this.id}`;this.type=data.type;this.flags=this.data.flags??={};this._stats=this.data._stats??={};this.system=this.data.system;this.identifier=this.system.identifier;
  if(this.system.advancement)this.system.advancement=this.system.advancement.map(a=>new Advancement(a,this));}
 getFlag(m,k){return this.flags[m]?.[k];}
 toObject(){const data={...this.data,flags:this.flags,system:{...this.system}};data.system.advancement=this.system.advancement?.map(a=>a.toObject());return clone(data);}
 updateSource(update){this.setData(merge(this.toObject(),update));}
}
class Advancement {
 constructor(data,item){this.data=clone(data);this.id=data._id;this.item=item;this.actor=item.actor;this.type=data.type;this.value=this.data.value??={};this.configuration=this.data.configuration;
  if(this.configuration.spell){this.configuration.spell.ability=new Set(this.configuration.spell.ability);this.configuration.spell.item=item;this.configuration.spell.applySpellChanges=nativeSchoolSpellChanges;}}
 storagePath(){return "value.added";}
 createItemData(...args){return nativeSchoolCreateItemData.call(this,...args);}
 apply(...args){return schoolGrantApply.call(this,(...a)=>nativeSchoolGrantApply.call(this,...a),...args);}
 updateSource(update){merge(this.data,update);this.value=this.data.value;}
 toObject(){const d={...this.data,value:this.value,configuration:{...this.configuration}};
  if(d.configuration.spell){d.configuration.spell={...d.configuration.spell,ability:[...d.configuration.spell.ability]};delete d.configuration.spell.item;delete d.configuration.spell.applySpellChanges;}return clone(d);}
}
class Actor {
 constructor(items,slots={spell1:{value:0,max:2}}){this.id="actor";this.uuid="Actor.actor";this.documentName="Actor";this.isOwner=true;this.effects=[];
  this.system={spells:clone(slots),abilities:Object.fromEntries(["str","dex","con","int","wis","cha"].map(a=>[a,{value:12,max:20,mod:1}]))};this.items=list(items.map(d=>new Item(d,this)));}
 testUserPermission(user){return user?.isGM||user?.id==="owner";}
 clone(){return new Actor(this.items.map(i=>i.toObject()),this.system.spells);}
 updateSource(update){for(const[p,v]of Object.entries(update)){if(p==="items"){for(const d of v){const item=this.items.get(d._id);if(item)item.updateSource(d);else this.items.push(new Item(d,this));}}else set(this,p,v);}}
 async updateEmbeddedDocuments(type,updates){assert.equal(type,"Item");for(const u of updates)this.items.get(u._id).updateSource(u);}
 performBulkUpdate(...args){return nativePerformBulkUpdate.call(this,...args);}
}
foundry.documents={modifyBatch:async operations=>{if(fail==="before"){fail=null;throw Error("before");}for(const op of operations){assert.equal(op.documentName,"Item");
 if(op.action==="create"){for(const d of op.data){assert.ok(!op.parent.items.has(d._id));op.parent.items.push(new Item(d,op.parent));createdCount++;}if(fail==="afterCreate"){fail=null;throw Error("afterCreate");}}
 else if(op.action==="update")await op.parent.updateEmbeddedDocuments("Item",op.updates);else assert.fail(op.action);}}};
function setup(doc=docs[0],slots){serial=0;warnings=[];fail=null;createdCount=0;const actor=new Actor([doc],slots),gm={id:"gm",active:true,isGM:true,isActiveGM:true},owner={id:"owner",active:true};
 const users=[gm,owner];users.activeGM=gm;globalThis.game={user:gm,users,actors:[actor],scenes:[],items:{fromCompendium:()=>({_stats:{}})}};return actor;}
const granted=actor=>actor.items.filter(i=>i.type==="spell");
for(const doc of docs){const info=doc.flags.spikependium.schoolAdept,source=SCHOOL_ADEPTS.find(s=>s.school===info.school);
 assert.equal(doc.name,`Адепт школы ${source.name}`);assert.equal(doc.system.source.page,String(source.page));assert.equal(doc.system.prerequisites.level,4);
 assert.deepEqual(doc.system.prerequisites.items,["feat:spellcasting","feat:pact-magic"]);assert.ok(doc.folder);assert.equal(info.spells.length,5);
 const [asi,grant]=doc.system.advancement;assert.equal(asi.configuration.points,1);assert.equal(asi.configuration.cap,1);assert.equal(asi.configuration.max,20);assert.deepEqual(asi.configuration.locked,["str","dex","con"]);
 assert.equal(grant.type,"ItemGrant");assert.equal(grant.configuration.spell.prepared,2);
 for(const [i,e]of info.spells.entries()){assert.equal(e.level,i+1);assert.equal(e.uuid,`Compendium.dnd5e.spells24.Item.${SRD.spells[source.spells[i]].id}`);assert.ok(world.has(e.uuid));}
 for(const ability of ["int","wis","cha"]){const actor=setup(doc);actor.system._source={abilities:clone(actor.system.abilities)};actor.updateSource=function(u){for(const[p,v]of Object.entries(u))set(this,p,v);};
  const host={actor,configuration:asi.configuration,value:{},allowFeat:false,canImprove:a=>!asi.configuration.locked.includes(a),updateSource(u){Object.assign(this,u);}};
  await nativeMagusASIApply.call(host,0,{assignments:{[ability]:1}},{initial:true});assert.equal(actor.system.abilities[ability].value,13);assert.deepEqual(host.value.assignments,{[ability]:1});}
 for(const slots of [{spell1:{value:0,max:2}},{pact:{value:0,max:2,level:3}},{spell1:{value:0,max:2},spell4:{value:0,max:1}},{spell5:{value:0,max:1}}]){
  const actor=setup(doc,slots);await syncSchoolSpells(actor);const cap=Math.max(...Object.entries(slots).map(([k,v])=>k==="pact"?v.level:Number(k.slice(5))));
  assert.equal(granted(actor).length,cap);for(const s of granted(actor)){assert.equal(s.system.prepared,2);assert.equal(s.system.sourceItem,`feat:school-adept-${info.school}`);assert.equal(canUseSchoolSpell({item:s,actor}),undefined);}
  const ids=granted(actor).map(i=>i.id);await syncSchoolSpells(actor);assert.deepEqual(granted(actor).map(i=>i.id),ids);
 }
}
{
 const actor=setup();const feat=actor.items[0],a=feat.system.advancement.find(a=>a.type==="ItemGrant");await a.apply(0,{}, {initial:true});assert.equal(granted(actor).length,1,"первоначальный штатный шаг не выдаёт заклинания высоких уровней");
 actor.system.spells.spell5={value:0,max:1};await syncSchoolSpells(actor);assert.equal(granted(actor).length,5);
 const high=granted(actor).find(s=>s.system.level===5);high.system.description.value="Изменение игрока";const id=high.id;
 delete actor.system.spells.spell5;await syncSchoolSpells(actor);assert.equal(high.system.prepared,0);assert.equal(canUseSchoolSpell({item:high,actor}),false);assert.equal(actor.items.get(id).system.description.value,"Изменение игрока");
 actor.system.spells.pact={max:2,value:0,level:5};await syncSchoolSpells(actor);assert.equal(actor.items.get(id).system.prepared,2);assert.equal(granted(actor).length,5);
 actor.items=list(actor.items.filter(i=>i.id!==feat.id));assert.equal(canUseSchoolSpell({item:high,actor}),false,"удалённая черта больше не разрешает свою копию заклинания");
}
for(const stage of ["before","afterCreate"]){const actor=setup();fail=stage;await assert.rejects(syncSchoolSpells(actor));await syncSchoolSpells(actor);assert.equal(granted(actor).length,1,stage);assert.equal(createdCount,1,"после частичного сбоя лишняя копия не создаётся");}
{
 const actor=setup();await Promise.all([syncSchoolSpells(actor),syncSchoolSpells(actor)]);assert.equal(granted(actor).length,1);
 actor.items=list(actor.items.filter(i=>i.type!=="spell"));await syncSchoolSpells(actor);assert.equal(granted(actor).length,1,"пропавшая выданная копия восстанавливается");
}
{
 const actor=setup();game.users.activeGM=null;game.user=game.users[1];game.users[0].active=false;await syncSchoolSpells(actor);assert.equal(granted(actor).length,1,"активный владелец может получить заклинания без Мастера");
}
{
 const actor=setup();game.user=game.users[1];await syncSchoolSpells(actor);assert.equal(granted(actor).length,0,"при активном Мастере обработку выполняет он");
}
{
 const actor=setup(docs[0],{}),a=actor.items[0].system.advancement[1];await a.apply(0,{}, {initial:true});
 assert.equal(granted(actor).length,0);assert.deepEqual(a.value.added,{},"пустой доступный список завершает штатный шаг без выдачи высоких заклинаний");
 const b=setup().items[0].system.advancement[1];await b.apply(0,{});assert.equal(granted(b.actor).length,0,"сохранён контракт native неинициального apply без selected");
}
{
 const actor=setup(),saved=globalThis.fromUuid;globalThis.fromUuid=async uuid=>{actor.items=list([]);return world.get(uuid);};
 await syncSchoolSpells(actor);assert.equal(granted(actor).length,0,"удалённая во время загрузки черта не выдаёт осиротевшие заклинания");globalThis.fromUuid=saved;
}
{
 const actor=setup(),saved=globalThis.fromUuid;globalThis.fromUuid=async()=>null;await assert.rejects(syncSchoolSpells(actor),/Не найдено/);assert.equal(granted(actor).length,0);globalThis.fromUuid=saved;
}
for(const initial of [19,20,22]){
 const actor=setup();actor.system.abilities.int={value:initial,max:23};actor.system._source={abilities:actor.system.abilities};
 const host={actor,item:actor.items[0],configuration:actor.items[0].system.advancement[0].configuration,value:{},allowFeat:false,
  updateSource(u){Object.assign(this,u);},canImprove(ability){return schoolASICanImprove.call(this,()=>true,ability);}};
 assert.equal(host.canImprove("str"),false);assert.equal(host.canImprove("int"),initial<20);
 const use=assignments=>schoolASIApply.call(host,(...a)=>nativeMagusASIApply.call(host,...a),0,{type:"asi",assignments},{initial:true});
 if(initial===19){await use({int:1});assert.equal(actor.system.abilities.int.value,20);assert.equal(host.canImprove("int"),true,"выбранное повышение можно отменить в окне");
  assert.throws(()=>use({int:1}));await use({int:-1});assert.equal(actor.system.abilities.int.value,19);}
 else assert.throws(()=>use({int:1}));
 assert.throws(()=>use({str:1}));assert.throws(()=>use({wis:2}));
}
{
 const host={item:{type:"class"}};assert.equal(schoolASICanImprove.call(host,()=>"native","str"),"native");
 assert.equal(schoolASICanImprove.call({item:{type:"feat",flags:docs[0].flags}},()=>true,"int"),true,"редактор черты в компендиуме доступен без персонажа");
 assert.equal(schoolASIApply.call(host,()=>"native",0,{type:"feat"}),"native","чужие и классовые ASI не изменяются");
 const doc=docs.find(d=>d.flags.spikependium.schoolAdept.school==="enc"),actor=setup(doc,{spell2:{max:2,value:0}});
 await syncSchoolSpells(actor);assert.ok(!granted(actor).some(s=>s.system.identifier==="hold-person"||s.name==="Hold Person"));
 actor.system.spells.spell3={max:1,value:0};await syncSchoolSpells(actor);assert.equal(granted(actor).find(s=>s.name==="Hold Person").system.level,2);
}
{
 const doc=docs.find(d=>d.flags.spikependium.schoolAdept.school==="div"),actor=setup(doc);actor.items[0].system.uses.spent=1;
 const activity={actor,item:{type:"spell",system:{school:"div"}}},u={actor:{"system.spells.spell1.value":1},item:[]};actor.system.spells.spell1.value=2;
 schoolSlotRecharge(activity,{},u);assert.equal(u.item[0]["system.uses.spent"],0);
 const deltas={actor:getDeltas(actor,u.actor),item:{[actor.items[0].id]:getDeltas(actor.items[0],u.item[0])}};
 actor.system.spells.spell1.value=1;actor.items[0].system.uses.spent=0;
 await nativeRefund.call(activity,deltas,async updates=>{for(const[p,v]of Object.entries(updates.actor))set(actor,p,v);for(const d of updates.item)actor.items.get(d._id).updateSource(d);});
 assert.equal(actor.items[0].system.uses.spent,1);assert.equal(actor.system.spells.spell1.value,2);
 for(const school of ["nec","div"]){const next={actor:{},item:[]};activity.item.system.school=school;schoolSlotRecharge(activity,{},next);assert.equal(next.item.length,0,"без оплаченной ячейки восстановления нет");}
}
{
 const actor=setup(docs.find(d=>d.flags.spikependium.schoolAdept.school==="con")),feat=actor.items[0];feat.system.advancement[0].value.assignments={wis:1};actor.system.abilities.wis.mod=3;
 const activity={uuid:"Item.spell.Activity.cast",item:{system:{school:"con"}}};world.set(activity.uuid,activity);
 const effect={active:true,duration:{},system:{type:"concentrating"},flags:{dnd5e:{activity:{uuid:activity.uuid}}}};actor.effects=[effect];
 const config={subject:actor,isConcentration:true,ability:"con",rolls:[{parts:["@mod"],data:{}}]};prepareSchoolConcentration(config);prepareSchoolConcentration(config);
 assert.deepEqual(config.rolls[0].parts,["@mod","@spikependiumSteadfastConjuration"]);assert.equal(config.rolls[0].data.spikependiumSteadfastConjuration,3);
 assert.equal(finalizeSchoolConcentration(config.rolls,config),undefined);effect.active=false;assert.equal(finalizeSchoolConcentration(config.rolls,config),false);effect.active=true;
 config.rolls[0].data.abilityId="wis";buildSchoolConcentration(config,config.rolls[0]);assert.deepEqual(config.rolls[0].parts,["@mod"]);delete config.rolls[0].data.abilityId;
 for(const mutate of [()=>{config.ability="wis";},()=>{activity.item.system.school="evo";},()=>{effect.active=false;},()=>{actor.effects.push(effect);}]){
  config.ability="con";activity.item.system.school="con";effect.active=true;actor.effects=[effect];config.rolls=[{parts:[],data:{}}];mutate();prepareSchoolConcentration(config);assert.equal(config.rolls[0].parts.length,0);}
}
console.log("Адепты школ: 8 русских черт/40 ссылок, native ASI и ItemGrant, ячейки/договор/мультикласс без зависимости от остатка, выдача/потеря/возврат/сохранение правок, повтор/частичный сбой/владелец, концентрация Призыва, восстановление Прорицания и штатная отмена: OK. Прочие условные механики остаются ручными.");
