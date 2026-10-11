import assert from "node:assert/strict";
import fs from "node:fs";
import { dragonmarkChoices, prepareDragonmarkCheck, buildDragonmarkCheck, finalizeDragonmarkCheck,
  prepareDragonmarkHealing, finalizeDragonmarkHealing, canUseDragonmarkActivity, fortitudeChoices, prepareFortitudeSave,
  buildFortitudeSave, finalizeFortitudeSave, consumeFortitudeSave, canConsumeFortitude } from "../scripts/dragonmark-rolls.mjs";

class Dialog {
  async _prepareConfigurationContext() { return { fields: [] }; }
  _buildConfig(roll) { return roll; }
}
globalThis.CONFIG = { Dice: { D20Roll: { DefaultConfigurationDialog: Dialog }, DamageRoll: { DefaultConfigurationDialog: Dialog } } };
globalThis.foundry = { data: { fields: { StringField: class { constructor(data) { Object.assign(this,data); } }, BooleanField: class { constructor(data) { Object.assign(this,data); } } } } };
globalThis.ui = { notifications: { warn() {}, error() {} } };
const docs = fs.readdirSync("packs/_source/feats").map(f => JSON.parse(fs.readFileSync(`packs/_source/feats/${f}`,"utf8")));
const feat = key => { const doc=docs.find(d=>d.flags?.spikependium?.key===key);assert(doc,key);return {...doc,uuid:`Actor.pc.Item.${doc._id}`}; };
const actor = (id,greater=false) => ({uuid:"Actor.pc",isOwner:true,items:[feat(`feat:${id}`),...(greater?[feat(`feat:greater-${id}`)]:[])]});
const roll = ability => ({parts:["@mod","1d4"],data:{abilityId:ability},options:{advantageMode:1,minimum:10}});
const cases = {
  detection:{prc:"wis",ins:"wis"}, finding:{prc:"wis",sur:"wis"}, handling:{nat:"int",ani:"wis"}, healing:{med:"wis"},
  hospitality:{per:"cha"}, making:{arc:"int"}, passage:{ath:"str",acr:"dex"}, scribing:{his:"int"},
  sentinel:{prc:"wis",ins:"wis"}, shadow:{ste:"dex",prf:"cha"}, storm:{acr:"dex"}, warding:{inv:"int"}
};
for(const[id,skills]of Object.entries(cases))for(const[skill,ability]of Object.entries(skills)){
  const process={subject:actor(id),skill,ability};const choice=dragonmarkChoices(process,ability)[0];assert(choice);
  assert.equal(choice.die,"1d4");assert.equal(dragonmarkChoices(process,"con").length,0);
  process.spikependium={intuition:choice.value};const built=roll(ability);buildDragonmarkCheck(process,built);
  assert.equal(built.data.spikependiumIntuition,"1d4");assert.equal(built.parts.filter(p=>p==="@spikependiumIntuition").length,1);
  buildDragonmarkCheck(process,built);assert.equal(built.parts.filter(p=>p==="@spikependiumIntuition").length,1);
  assert.equal(built.parts.filter(p=>p==="1d4").length,1,"ситуационная кость из другого источника сохраняется");
  assert.equal(built.options.advantageMode,1);assert.equal(built.options.minimum,10);
  assert.equal(finalizeDragonmarkCheck([built],process),undefined);
  process.spikependium.intuition="none";buildDragonmarkCheck(process,built);assert.equal(built.data.spikependiumIntuition,undefined);
  assert.equal(built.parts.includes("@spikependiumIntuition"),false);
}
for(const[id,tool,ability]of [["healing","herb","int"],["hospitality","cook","wis"],["hospitality","brewer","str"],
  ["scribing","calligrapher","cha"],["storm","navg","wis"],["warding","thief","dex"]])
  assert.equal(dragonmarkChoices({subject:actor(id),tool},ability).length,1,`${id}:${tool}`);
assert.equal(dragonmarkChoices({subject:actor("healing"),tool:"herb"},"wis").length,0);
for(const tool of ["alchemist","brewer","calligrapher","carpenter","cartographer","cobbler","cook","glassblower","jeweler",
  "leatherworker","mason","painter","potter","smith","tinker","weaver","woodcarver"])
  assert.equal(dragonmarkChoices({subject:actor("making"),tool},"con").length,1);
for(const tool of ["herb","thief","lute","navg"])
  assert.equal(dragonmarkChoices({subject:actor("making"),tool},"int").length,0);
assert.equal(dragonmarkChoices({subject:actor("handling"),skill:"nat"},"wis").length,0);
assert.deepEqual(dragonmarkChoices({subject:actor("detection"),ability:"wis"}),[],"обычная проверка без навыка/инструмента не получает кость");
assert.deepEqual(dragonmarkChoices({subject:{isOwner:true}}),[]);
const greater={subject:actor("detection",true),skill:"prc",ability:"wis"};
assert.deepEqual(dragonmarkChoices(greater).map(c=>c.die),["1d4","1d6"]);
const dialog={configure:false};prepareDragonmarkCheck(greater,dialog);assert.equal(dialog.configure,true);
const app=new dialog.applicationClass();app.config=greater;const fields=await app._prepareConfigurationContext({});
assert.equal(fields.fields[0].name,"spikependium.intuition");assert.equal(Object.keys(fields.fields[0].field.choices).length,3);
const choice=dragonmarkChoices(greater).find(c=>c.die==="1d6");const form=new Map([["spikependium.intuition",choice.value]]);
const built=app._buildConfig(roll("wis"),form,0);buildDragonmarkCheck(greater,built);assert.equal(built.data.spikependiumIntuition,"1d6");
assert.equal(finalizeDragonmarkCheck([built],greater),undefined);
const wrongAbility=app._buildConfig(roll("int"),form,0);buildDragonmarkCheck(greater,wrongAbility);
assert.equal(wrongAbility.options.spikependiumIntuition,undefined);assert.equal(finalizeDragonmarkCheck([wrongAbility],greater),false);
greater.subject.items.pop();assert.equal(finalizeDragonmarkCheck([built],greater),false,"удаление усиления отменяет к6 до вычисления");
greater.subject.items=[];assert.equal(finalizeDragonmarkCheck([built],greater),false);assert.equal(finalizeDragonmarkCheck([],greater),undefined);
greater.subject=actor("detection",true);greater.subject.isOwner=false;assert.deepEqual(dragonmarkChoices(greater),[]);
const noMatch={applicationClass:Dialog,configure:false};prepareDragonmarkCheck({subject:actor("detection"),skill:"arc"},noMatch);assert.equal(noMatch.configure,false);
const two={subject:{isOwner:true,items:[feat("feat:detection"),feat("feat:sentinel")]},skill:"prc",ability:"wis"};
assert.equal(dragonmarkChoices(two).length,2);two.spikependium={intuition:dragonmarkChoices(two)[1].value};
const single=roll("wis");buildDragonmarkCheck(two,single);assert.equal(single.parts.filter(p=>p==="@spikependiumIntuition").length,1);

const healer={isOwner:true,items:[feat("feat:greater-healing")]};
assert.equal(canUseDragonmarkActivity({id:"mE12AOxwORthnXw7",item:healer.items[0]}),false);
assert.equal(canUseDragonmarkActivity({id:"kUcyr43Tp0Bee6IW",item:healer.items[0]}),true);
assert.equal(canUseDragonmarkActivity(undefined),true);
const activity={actor:healer,item:{type:"spell",system:{identifier:"cure-wounds"},flags:{}}};
const healingProcess={subject:activity,rolls:[{options:{type:"healing"}},{options:{type:"fire"}}]};
const healingDialog={configure:false};prepareDragonmarkHealing(healingProcess,healingDialog);assert.equal(healingDialog.configure,true);
const healingApp=new healingDialog.applicationClass();healingApp.config=healingProcess;
const healingFields=await healingApp._prepareConfigurationContext({});assert.equal(healingFields.fields[0].value,false);
const healRow=healingApp._buildConfig({parts:["2d8","@mod"],data:{},options:{type:"healing"}},new Map([["spikependium.improvedCure",true]]),0);
const fireRow=healingApp._buildConfig({parts:["1d6"],data:{},options:{type:"fire"}},new Map([["spikependium.improvedCure",true]]),1);
const healingRoll={options:healRow.options,dice:[{modifiers:[]},{modifiers:["min4"]}],resetFormula(){this.reset=true;}};
const fireRoll={options:fireRow.options,dice:[{modifiers:[]}]};
assert.equal(finalizeDragonmarkHealing([healingRoll,fireRoll],healingProcess),undefined);
assert.deepEqual(healingRoll.dice.map(d=>d.modifiers),[["min3"],["min4","min3"]]);assert.equal(healingRoll.reset,true);
assert.deepEqual(fireRoll.dice[0].modifiers,[]);finalizeDragonmarkHealing([healingRoll],healingProcess);
assert.equal(healingRoll.dice[0].modifiers.filter(m=>m==="min3").length,1);
healer.items=[];assert.equal(finalizeDragonmarkHealing([healingRoll],healingProcess),false);
assert.equal(finalizeDragonmarkHealing([],healingProcess),undefined);
for(const invalid of ["other-spell","stored","unowned","no-feat","temporary","actor"]){
  const process=structuredClone(healingProcess);process.subject.actor.items=[feat("feat:greater-healing")];process.spikependium={};
  if(invalid==="other-spell")process.subject.item.system.identifier="healing-word";
  if(invalid==="stored")process.subject.item.flags.spikependium={storedSpell:{}};
  if(invalid==="unowned")process.subject.actor.isOwner=false;if(invalid==="no-feat")process.subject.actor.items=[];
  if(invalid==="temporary")process.rolls=[{options:{type:"temphp"}}];if(invalid==="actor")process.subject=healer;
  const options={configure:false};prepareDragonmarkHealing(process,options);assert.equal(options.configure,false,invalid);
}
const fortitudeId="ImKAekqLG7w1vBHg";
function saver(greater=false) {
  const pc=actor("aberrant-dragonmark");if(greater)pc.items.push(feat("feat:greater-aberrant"));
  const mark=pc.items[0];mark.system.uses={max:3,spent:0,get value(){return this.max-this.spent;}};
  const native={id:fortitudeId,item:mark,actor:pc};
  mark.clone=(data,options)=>{
    assert.equal(options.keepId,true);assert.deepEqual(Object.keys(data),[`system.activities.${fortitudeId}.consumption.targets`]);
    const targets=data[`system.activities.${fortitudeId}.consumption.targets`];assert.equal(targets.length,1);
    assert.equal(targets[0].type,"itemUses");assert.equal(targets[0].target,"");assert.deepEqual(targets[0].scaling,{});
    return {system:{activities:new Map([[fortitudeId,{...native,async consume(usage,message){
      assert.deepEqual(usage.consume,{resources:true,spellSlot:false,action:false});
      assert.equal(canConsumeFortitude(native,usage),true,"собственный расход не блокируется");
      if(pc.consumeGate)await pc.consumeGate;
      if(pc.consumeError)throw new Error("storage failed");if(pc.cancelConsumption)return false;
      const count=Number(targets[0].value);assert(mark.system.uses.value>=count);
      mark.system.uses.spent+=count;pc.consumptions=(pc.consumptions??0)+1;
      message.data??={};message.data.system={deltas:{item:{[mark._id]:[{keyPath:"system.uses.spent",delta:count}]}}};
      return {item:[{_id:mark._id,"system.uses.spent":mark.system.uses.spent}]};
    }}]])}};
  };
  return {subject:pc,ability:"con",hookNames:["SavingThrow","d20Test"]};
}
const saveRoll=()=>({...roll("con"),data:{roll:{ability:"con"}}});
const selectSave=(process,die="1d4")=>{process.spikependium={fortitude:fortitudeChoices(process).find(c=>c.die===die).value};const result=saveRoll();buildFortitudeSave(process,result);return result;};
const evaluate=async rolls=>{for(const r of rolls){r._evaluated=true;r.total=17;}};
const baseSave=saver();assert.deepEqual(fortitudeChoices(baseSave).map(c=>c.die),["1d4"]);
const concentration=saver();concentration.hookNames.unshift("concentration");concentration.saveType="concentration";
const concentrationRoll=selectSave(concentration);await consumeFortitudeSave(evaluate,[concentrationRoll],concentration,{});
assert.equal(concentrationRoll._evaluated,true);assert.equal(concentration.subject.items[0].system.uses.spent,1);
for(const invalid of ["dex","skill","unowned","no-feat","exhausted","greater-only"]){
  const process=saver(true);if(invalid==="dex")process.ability="dex";
  if(invalid==="skill")process.hookNames=["AbilityCheck"];if(invalid==="unowned")process.subject.isOwner=false;
  if(invalid==="no-feat")process.subject.items=[];if(invalid==="exhausted")process.subject.items[0].system.uses.spent=3;
  if(invalid==="greater-only")process.subject.items.shift();
  assert.deepEqual(fortitudeChoices(process),[],invalid);const options={configure:false};prepareFortitudeSave(process,options);assert.equal(options.configure,false);
}
const boostedSave=saver(true),saveDialog={configure:false};prepareFortitudeSave(boostedSave,saveDialog);assert.equal(saveDialog.configure,true);
const saveApp=new saveDialog.applicationClass();saveApp.config=boostedSave;
const saveFields=await saveApp._prepareConfigurationContext({});assert.equal(saveFields.fields[0].name,"spikependium.fortitude");
assert.equal(Object.keys(saveFields.fields[0].field.choices).length,3);
const saveChoice=fortitudeChoices(boostedSave).find(c=>c.die==="1d6");
const boostedRoll=saveApp._buildConfig(saveRoll(),new Map([["spikependium.fortitude",saveChoice.value]]),0);
buildFortitudeSave(boostedSave,boostedRoll);buildFortitudeSave(boostedSave,boostedRoll);
assert.equal(boostedRoll.data.spikependiumFortitude,"1d6");assert.equal(boostedRoll.parts.filter(p=>p==="@spikependiumFortitude").length,1);
assert.equal(boostedRoll.parts.filter(p=>p==="1d4").length,1);assert.equal(boostedRoll.options.advantageMode,1);assert.equal(boostedRoll.options.minimum,10);
assert.equal(finalizeFortitudeSave([boostedRoll],boostedSave),undefined);
const saveMessage={};await consumeFortitudeSave(evaluate,[boostedRoll],boostedSave,saveMessage);
assert.equal(boostedRoll._evaluated,true);assert.equal(boostedRoll.options.spikependiumFortitude.consumed,true);
assert.equal(boostedSave.subject.items[0].system.uses.spent,1);assert.equal(saveMessage.data.system.deltas.item[boostedSave.subject.items[0]._id][0].delta,1);
const repeated=[boostedRoll];await consumeFortitudeSave(evaluate,repeated,boostedSave,{});assert.equal(repeated.length,0);assert.equal(boostedSave.subject.items[0].system.uses.spent,1);
const noBonus=saver();noBonus.spikependium={fortitude:"none"};const ordinary=saveRoll();await consumeFortitudeSave(evaluate,[ordinary],noBonus,{});assert(ordinary._evaluated);assert.equal(noBonus.subject.items[0].system.uses.spent,0);
const canceled=saver();selectSave(canceled);await consumeFortitudeSave(evaluate,[],canceled,{});assert.equal(canceled.subject.items[0].system.uses.spent,0);
const preview=saver(),previewRoll=selectSave(preview);preview.evaluate=false;await consumeFortitudeSave(async()=>{},[previewRoll],preview,{});assert.equal(preview.subject.items[0].system.uses.spent,0);
const batch=saver(true),batchRolls=[selectSave(batch,"1d6"),selectSave(batch,"1d6")];assert.equal(finalizeFortitudeSave(batchRolls,batch),undefined);
await consumeFortitudeSave(evaluate,batchRolls,batch,{});assert.equal(batch.subject.items[0].system.uses.spent,2);assert.equal(batch.subject.consumptions,1);
const tooMany=saver(),many=Array.from({length:4},()=>selectSave(tooMany));assert.equal(finalizeFortitudeSave(many,tooMany),false);
await consumeFortitudeSave(evaluate,many,tooMany,{});assert.equal(many.length,0);assert.equal(tooMany.subject.items[0].system.uses.spent,0);
for(const invalid of ["removed","greater-removed","changed-ability","wrong-roll","no-charge","unowned","forged"]){
  const process=saver(true),result=selectSave(process,"1d6");
  if(invalid==="removed")process.subject.items=[];if(invalid==="greater-removed")process.subject.items.pop();
  if(invalid==="changed-ability")process.ability="wis";if(invalid==="wrong-roll")result.data.roll.ability="wis";
  if(invalid==="no-charge")process.subject.items[0].system.uses.spent=3;if(invalid==="unowned")process.subject.isOwner=false;
  if(invalid==="forged")result.options.spikependiumFortitude.value="other";
  assert.equal(finalizeFortitudeSave([result],process),false,invalid);
  const rows=[result];await consumeFortitudeSave(evaluate,rows,process,{});assert.equal(rows.length,0);assert.equal(result._evaluated,undefined);
}
const reset=saver(),resetRoll=selectSave(reset);reset.spikependium.fortitude="none";buildFortitudeSave(reset,resetRoll);
assert.equal(resetRoll.data.spikependiumFortitude,undefined);assert.equal(resetRoll.options.spikependiumFortitude,undefined);
assert.equal(resetRoll.parts.includes("@spikependiumFortitude"),false);
const cancelCost=saver(),costRows=[selectSave(cancelCost)];cancelCost.subject.cancelConsumption=true;
await consumeFortitudeSave(evaluate,costRows,cancelCost,{});assert.equal(costRows.length,0);assert.equal(cancelCost.subject.items[0].system.uses.spent,0);
const errorLog=console.error;console.error=()=>{};
const failed=saver(),failedRolls=[selectSave(failed)];failed.subject.consumeError=true;
await consumeFortitudeSave(evaluate,failedRolls,failed,{});assert.equal(failedRolls.length,0);assert.equal(failed.subject.items[0].system.uses.spent,0);
failed.subject.consumeError=false;await consumeFortitudeSave(evaluate,[selectSave(failed)],failed,{});assert.equal(failed.subject.items[0].system.uses.spent,1,"ошибка освобождает резерв");
const failureAfterCost=saver(),errorRows=[selectSave(failureAfterCost)];await consumeFortitudeSave(async()=>{throw new Error("evaluation failed");},errorRows,failureAfterCost,{});
assert.equal(errorRows.length,0);assert.equal(failureAfterCost.subject.items[0].system.uses.spent,1,"ошибка после расхода не возвращает ресурс без проверки");console.error=errorLog;
const concurrent=saver(true),waiting=[selectSave(concurrent,"1d6")];let release;
concurrent.subject.consumeGate=new Promise(resolve=>{release=resolve;});const pending=consumeFortitudeSave(evaluate,waiting,concurrent,{});
const manual={id:fortitudeId,item:concurrent.subject.items[0],actor:concurrent.subject};assert.equal(canConsumeFortitude(manual,{}),false);
assert.equal(canConsumeFortitude({id:"SrLGmFwOubXHyFLk",item:concurrent.subject.items[1],actor:concurrent.subject},{}),false);
assert.equal(canConsumeFortitude({...manual,id:"ZFebWGfJfJUzDtXB"},{}),true);
const overlap=[selectSave(concurrent)];await consumeFortitudeSave(evaluate,overlap,concurrent,{});assert.equal(overlap.length,0);
release();await pending;assert.equal(concurrent.subject.items[0].system.uses.spent,1);assert.equal(canConsumeFortitude(manual,{}),true);
const hooks=new Map(),init=[];globalThis.Hooks={on(name,fn){const list=hooks.get(name)??[];list.push(fn);hooks.set(name,list);},once(name,fn){if(name==="init")init.push(fn);}};
await import("../scripts/spikependium.mjs");
for(const[name,fn]of [["dnd5e.preRollAbilityCheckV2",prepareDragonmarkCheck],["dnd5e.postBuildAbilityCheckRollConfig",buildDragonmarkCheck],
  ["dnd5e.postAbilityCheckRollConfiguration",finalizeDragonmarkCheck],["dnd5e.preRollDamageV2",prepareDragonmarkHealing],["dnd5e.postDamageRollConfiguration",finalizeDragonmarkHealing],
  ["dnd5e.preUseActivity",canUseDragonmarkActivity],["dnd5e.preRollSavingThrowV2",prepareFortitudeSave],
  ["dnd5e.postBuildSavingThrowRollConfig",buildFortitudeSave],["dnd5e.postSavingThrowRollConfiguration",finalizeFortitudeSave],
  ["dnd5e.preActivityConsumption",canConsumeFortitude]])assert(hooks.get(name).includes(fn));
const registrations=new Map();globalThis.libWrapper={register(module,target,callback){assert(!registrations.has(target));registrations.set(target,callback);}};
CONFIG.DND5E={activityTypes:{},sourceBooks:{},featureTypes:{feat:{subtypes:{}},class:{subtypes:{}}}};
globalThis.dnd5e={registry:{spellLists:{register(){}}}};init.at(-1)();
const combinedEvaluate = registrations.get("CONFIG.Dice.D20Roll.buildEvaluate");
const integratedSave = saver(true), integratedRoll = selectSave(integratedSave, "1d6"), integratedMessage = {};
await combinedEvaluate(evaluate, [integratedRoll], integratedSave, integratedMessage);
assert.equal(integratedRoll._evaluated, true);
assert.equal(integratedSave.subject.items[0].system.uses.spent, 1);
assert.equal(integratedMessage.data.system.deltas.item[integratedSave.subject.items[0]._id][0].delta, 1);
console.log("Метки: 12 интуиций и 17 инструментов, допустимые характеристики, выбор к4/к6/отказ, пересборка без дублей, сохранение других бонусов и отмена устаревших окон; Улучшенное исцеление: только Лечение ран, выбор, нативный min3 без дублей, смешанные типы и отсутствие черты: OK.");
console.log("Аберрантная стойкость: к4/к6 внутри спасброска Телосложения, нативный общий расход и дельты, отказ/отмена/предпросмотр без расхода, несколько бросков, пересборка, удаление черты/усиления, недоступные заряды, ошибки и конкурентные окна: OK.");
