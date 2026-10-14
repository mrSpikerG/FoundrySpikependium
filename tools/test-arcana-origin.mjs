import assert from "node:assert/strict";
import fs from "node:fs";
import { prepareOriginCheck, buildOriginCheck, finalizeOriginCheck, canUseOriginInspiration, applyOriginInspiration, prepareOriginGrantedAbility } from "../scripts/arcana-origin.mjs";
import { prepareDragonmarkCheck, buildDragonmarkCheck } from "../scripts/dragonmark-rolls.mjs";
import { prepareOriginSurge, buildOriginSurge, finalizeOriginSurge, consumeOriginSurge, canUseOriginSurge } from "../scripts/arcana-surge.mjs";
import { nativeConsume, nativeRefund, getDeltas, nativeBuildEvaluate } from "./data/dnd5e-reaction-native.mjs";

const docs = fs.readdirSync("packs/_source/feats").filter(f => f.startsWith("feat-magic-speaker_") || f.startsWith("feat-magic-undertaker_"))
  .map(f => JSON.parse(fs.readFileSync("packs/_source/feats/" + f, "utf8")));
assert.equal(docs.length, 2);
for (const doc of docs) { assert.equal(doc.system.source.book, "AU"); assert.equal(doc.system.source.page, "28"); assert.equal(doc.system.type.subtype, "origin"); }
const speaker = docs.find(d => d.system.identifier === "magic-speaker"), undertaker = docs.find(d => d.system.identifier === "magic-undertaker");
assert.deepEqual(speaker.system.advancement[0].configuration.spell.ability, ["int", "wis", "cha"]);
assert.equal(speaker.system.advancement[0].configuration.items[0].uuid, "Compendium.dnd5e.spells24.Item.phbsplViciousMoc");
const choice = undertaker.system.advancement[0].configuration;
assert.equal(choice.allowDrops, true); assert.deepEqual(choice.restriction.list, ["wizard", "cleric"]);
assert.deepEqual(choice.restriction.school, ["nec"]); assert.equal(choice.restriction.level, "0"); assert.equal(choice.choices[0].count, 1);
assert.deepEqual(choice.spell.ability, ["int", "wis", "cha"]);
const inspirationData = Object.values(undertaker.system.activities)[0];
assert.equal(inspirationData.uses.max, "1"); assert.equal(inspirationData.uses.recovery[0].period, "lr");
assert.equal(inspirationData.flags.spikependium.heroicInspirationSelf, true);

globalThis.ui = { notifications: { warn() {} } };
const wardFile = fs.readdirSync("packs/_source/feats").find(f => f.startsWith("feat-magic-ward_"));
const ward = JSON.parse(fs.readFileSync("packs/_source/feats/" + wardFile, "utf8"));
assert.equal(ward.system.source.book, "AU"); assert.equal(ward.system.source.page, "27");
assert.equal(ward.system.type.subtype, "origin");
const wardCast = Object.values(ward.system.activities).find(a => a.type === "cast");
const wardHelp = Object.values(ward.system.activities).find(a => a.type === "heal");
assert.equal(wardCast.spell.uuid, "Compendium.dnd5e.spells24.Item.phbsplResistance");
assert.equal(wardCast.activation.type, "bonus"); assert.equal(wardCast.spell.level, 0);
assert.equal(wardCast.uses.max, "@prof"); assert.equal(wardCast.uses.recovery[0].period, "lr");
assert.equal(wardCast.consumption.targets[0].type, "activityUses");
assert.equal(wardCast.consumption.spellSlot, false); assert.equal(wardCast.spell.spellbook, false);
assert.deepEqual(wardCast.spell.properties, [], "no concentration or component exemptions are invented");
assert.equal(wardHelp.activation.type, "action"); assert.equal(wardHelp.target.affects.type, "ally");
assert.equal(wardHelp.healing.custom.formula, "@prof"); assert.deepEqual(wardHelp.healing.types, ["temphp"]);
assert.equal(wardHelp.consumption.targets.length, 0, "Help has no daily limit");
assert.deepEqual(ward.system.advancement[0].configuration.spell.ability, ["int", "wis", "cha"]);
for (const ability of ["int", "wis", "cha", "str", ""]) {
  const item = structuredClone(ward), updated = [];
  item.system.advancement[0].value.ability = ability;
  const action = { ...structuredClone(wardCast), item, updateSource(data) { updated.push(data); } };
  const valid = ["int", "wis", "cha"].includes(ability);
  assert.equal(prepareOriginGrantedAbility(action), valid ? undefined : false);
  assert.deepEqual(updated, valid ? [{ "spell.ability": ability }] : []);
}
assert.equal(prepareOriginGrantedAbility({ ...wardCast, item: speaker }), undefined);
globalThis.foundry = { data: { fields: { StringField: class { constructor(o) { Object.assign(this, o); } } } } };
class Dialog {
  constructor(config) { this.config = config; }
  async _prepareConfigurationContext(context) { return context; }
  _buildConfig(roll) { return roll; }
}
globalThis.CONFIG = { Dice: { D20Roll: { DefaultConfigurationDialog: Dialog } } };
const actor = { isOwner: true, items: docs.map(d => ({ ...d, uuid: `Actor.pc.Item.${d._id}` })) };
const pcSpeaker = actor.items.find(d => d.system.identifier === "magic-speaker"), pcUndertaker = actor.items.find(d => d.system.identifier === "magic-undertaker");
for (const [skill, ability, feat] of [["dec", "cha", pcSpeaker], ["itm", "cha", pcSpeaker], ["per", "cha", pcSpeaker],
  ["his", "int", pcUndertaker], ["med", "wis", pcUndertaker]]) {
  const config = { subject: actor, skill }, dialog = { applicationClass: Dialog }; prepareOriginCheck(config, dialog);
  const instance = new dialog.applicationClass(config);
  const context = await instance._prepareConfigurationContext({ fields: [] }); assert.equal(context.fields.length, 1);
  config.spikependium.originIntuition = feat.uuid;
  const roll = { parts: ["@nativeBonus"], data: { abilityId: ability }, options: {} };
  buildOriginCheck(config, roll); buildOriginCheck(config, roll);
  assert.deepEqual(roll.parts, ["@nativeBonus", "@spikependiumOriginIntuition"]); assert.equal(roll.data.spikependiumOriginIntuition, "1d4");
  assert.equal(finalizeOriginCheck([roll], config), undefined);
  roll.data.abilityId = "str"; buildOriginCheck(config, roll); assert.deepEqual(roll.parts, ["@nativeBonus"]);
  assert.equal(finalizeOriginCheck([roll], config), false);
}
for (const config of [{ subject: actor, skill: "arc" }, { subject: { ...actor, isOwner: false }, skill: "dec" },
  { subject: actor, tool: "thief" }, { subject: { isOwner: true, items: [] }, skill: "med" }]) {
  const dialog = { applicationClass: Dialog }; prepareOriginCheck(config, dialog); assert.equal(dialog.configure, undefined);
}
actor.items.push({ uuid: "Actor.pc.Item.hospitality", name: "Mark of Hospitality", flags: { spikependium: { key: "feat:hospitality" } } });
const combined = { subject: actor, skill: "per" }, dialog = { applicationClass: Dialog };
prepareOriginCheck(combined, dialog); prepareDragonmarkCheck(combined, dialog);
const instance = new dialog.applicationClass(combined), context = await instance._prepareConfigurationContext({ fields: [] });
assert.equal(context.fields.length, 2, "независимые бонусы имеют отдельные поля");
combined.spikependium.originIntuition = pcSpeaker.uuid; combined.spikependium.intuition = "Actor.pc.Item.hospitality:4";
const stacked = { parts: [], data: { abilityId: "cha" }, options: {} }; buildOriginCheck(combined, stacked); buildDragonmarkCheck(combined, stacked);
assert.deepEqual(stacked.parts, ["@spikependiumOriginIntuition", "@spikependiumIntuition"]);
let updates = [];
const owner = { uuid: "Actor.pc", isOwner: true, flags: {}, async update(data) { updates.push(data); this.flags.spikependium = { originInspiration: data["flags.spikependium.originInspiration"] }; } };
const activity = { ...inspirationData, id: inspirationData._id, actor: owner, item: { id: undertaker._id, flags: undertaker.flags } };
assert.equal(canUseOriginInspiration(activity, {}), false);
assert.equal(canUseOriginInspiration(activity, { spikependium: { stabilizedWithHelp: true } }), true);
const message = { id: "usage", system: { deltas: { item: { [undertaker._id]: [{ keyPath: `system.activities.${activity.id}.uses.spent`, delta: 1 }] } } } };
await applyOriginInspiration(activity, {}, { message }); await applyOriginInspiration(activity, {}, { message });
assert.equal(updates.length, 1); assert.equal(updates[0]["system.attributes.inspiration"], true);
assert.equal(updates[0]["flags.spikependium.originInspiration"], "usage");
owner.isOwner = false; await applyOriginInspiration(activity, {}, { message: { ...message, id: "other" } }); assert.equal(updates.length, 1);
{
  const file = fs.readdirSync("packs/_source/feats").find(f => f.startsWith("feat-magic-overloaded_"));
  const data = JSON.parse(fs.readFileSync("packs/_source/feats/" + file, "utf8"));
  assert.equal(data.system.source.book, "AU"); assert.equal(data.system.source.page, "29");
  assert.equal(data.system.advancement[0].configuration.items[0].uuid, "Compendium.dnd5e.spells24.Item.phbsplFireBolt00");
  const resourceData = Object.values(data.system.activities)[0];
  assert.equal(resourceData.uses.max, "1"); assert.equal(resourceData.uses.recovery[0].period, "lr");
  const get = (obj,path) => path.split(".").reduce((o,k) => o?.[k],obj);
  const set = (obj,path,value) => { const keys=path.split("."), last=keys.pop(); keys.reduce((o,k)=>o[k]??={},obj)[last]=value; };
  const flatten = (obj,prefix="",result={}) => { for(const [k,v] of Object.entries(obj)) {
    const p=prefix+k; if(v&&typeof v==="object"&&!Array.isArray(v))flatten(v,p+".",result); else result[p]=v;
  } return result; };
  foundry.utils = { getProperty: get, setProperty: set, flattenObject: flatten, isEmpty: o=>!Object.keys(o).length };
  CONFIG.DND5E = { healingTypes: { healing:{},temphp:{} }, damageTypes: { fire:{label:"Огонь"},cold:{label:"Холод"} } };
  CONFIG.Dice.DamageRoll = { DefaultConfigurationDialog: Dialog };
  const pc = { uuid:"Actor.surge",isOwner:true,system:{attributes:{prof:3}},testUserPermission:()=>true };
  const feat = { ...data,id:data._id,uuid:`${pc.uuid}.Item.${data._id}` };
  const resource = { ...resourceData,id:resourceData._id,item:feat,actor:pc };
  Object.defineProperty(resource.uses,"value",{get:()=>1-resource.uses.spent});
  feat.system.activities = new Map([[resource.id,resource]]);
  feat.system.activities.find = fn=>[...feat.system.activities.values()].find(fn);
  pc.items = new Map([[feat.id,feat]]); pc.items.find = fn=>[...pc.items.values()].find(fn);
  const spell = {type:"spell",system:{school:"evo"}};
  const action = {uuid:"Actor.surge.Item.spell.Activity.damage",actor:pc,item:spell};
  const cast = {id:"cast",type:"usage",author:{id:"owner"},system:{},getAssociatedActor:()=>pc,getAssociatedActivity:()=>action};
  globalThis.game = {messages:new Map([[cast.id,cast]])};
  globalThis.Hooks = {call:(hook,a,c)=>hook!=="dnd5e.preActivityConsumption"||canUseOriginSurge(a,c)};
  let consumed=0;
  resource._prepareUsageUpdates = async()=>resource.uses.value>0?{activity:{"uses.spent":resource.uses.spent+1}}:false;
  resource.consume = (config,message)=>nativeConsume.call(resource,config,message,async updates=>{
    const deltas=getDeltas(feat,{[`system.activities.${resource.id}.uses.spent`]:updates.activity["uses.spent"]});
    resource.uses.spent=updates.activity["uses.spent"]; consumed++;
    return {actor:[],item:{[feat.id]:deltas}};
  });
  const build = (type="fire",bonus=true)=>{
    const rolls=[type,"cold"].map(t=>({parts:["1d6"],data:{},options:{type:t},async evaluate(){this._evaluated=true;}}));
    const config={subject:action,rolls},message={data:{system:{origin:cast.id}}},dialog={applicationClass:Dialog};
    prepareOriginSurge(config,dialog,message);
    if(bonus)config.spikependium.originSurge.part="0";
    rolls.forEach((r,i)=>buildOriginSurge(config,r,i));
    return {rolls,config,message,dialog};
  };
  let test=build();
  assert.equal(test.dialog.configure,true);
  const prompt=await new test.dialog.applicationClass(test.config)._prepareConfigurationContext({fields:[]});
  assert.equal(prompt.fields[0].field.choices.none,"Не применять");
  buildOriginSurge(test.config,test.rolls[0],0);
  assert.deepEqual(test.rolls[0].parts,["1d6","@spikependiumOriginSurge"]);
  assert.deepEqual(test.rolls[1].parts,["1d6"]);
  assert.equal(finalizeOriginSurge(test.rolls,test.config),undefined);
  assert.equal(canUseOriginSurge(resource,{}),false);
  assert.equal(consumed,0,"opening/configuring or abandoning a dialog does not spend a use");
  const preview=build(); preview.config.evaluate=false;
  await consumeOriginSurge(nativeBuildEvaluate,preview.rolls,preview.config,preview.message);
  assert.equal(consumed,0); assert.equal(preview.rolls[0]._evaluated,undefined);
  const noBonus=build("fire",false);
  await consumeOriginSurge(nativeBuildEvaluate,noBonus.rolls,noBonus.config,noBonus.message);
  assert.equal(consumed,0); assert.equal(noBonus.rolls[0]._evaluated,true);
  const second=build();
  await consumeOriginSurge(nativeBuildEvaluate,test.rolls,test.config,test.message);
  assert.equal(consumed,1); assert.equal(test.rolls[0]._evaluated,true); assert.equal(resource.uses.spent,1);
  assert.equal(test.message.data.flags.spikependium.originSurge.bonus,3);
  assert.equal(test.message.data.system.deltas.item[feat.id][0].keyPath,`system.activities.${resource.id}.uses.spent`);
  assert.equal(finalizeOriginSurge(second.rolls,second.config),false);
  await consumeOriginSurge(nativeBuildEvaluate,second.rolls,second.config,second.message);
  assert.equal(second.rolls.length,0); assert.equal(consumed,1);
  await nativeRefund.call(action,test.message.data.system.deltas,async updates=>{
    assert.equal(updates.item[0]._id,feat.id);
    resource.uses.spent=updates.item[0][`system.activities.${resource.id}.uses.spent`];
  });
  assert.equal(resource.uses.spent,0,"native damage-card refund restores the feature's use");
  const healing=build("healing"); assert.equal(finalizeOriginSurge(healing.rolls,healing.config),false);
  assert.deepEqual(healing.rolls[0].parts,["1d6"]);
  test=build(); pc.system.attributes.prof=4; assert.equal(finalizeOriginSurge(test.rolls,test.config),false);
  pc.system.attributes.prof=3;
  for(const mutate of [()=>{spell.system.school="con";},()=>{pc.isOwner=false;},()=>{cast.type="attack";},()=>{cast.getAssociatedActor=()=>({uuid:"Actor.other"});}]){
    mutate(); const dialog={applicationClass:Dialog};
    prepareOriginSurge({subject:action,rolls:[{options:{type:"fire"}}]},dialog,{data:{system:{origin:"cast"}}});
    assert.equal(dialog.configure,undefined);
    spell.system.school="evo";pc.isOwner=true;cast.type="usage";cast.getAssociatedActor=()=>pc;
  }
  const missing={applicationClass:Dialog}; prepareOriginSurge({subject:action,rolls:[{options:{type:"fire"}}]},missing,{data:{}});
  assert.equal(missing.configure,undefined);
  const reset=build(); reset.config.spikependium.originSurge.part="none"; buildOriginSurge(reset.config,reset.rolls[0],0);
  assert.deepEqual(reset.rolls[0].parts,["1d6"]);
  const first=build(), competing=build(); let release;
  const nativeResourceConsume=resource.consume;
  resource.consume=async (...args)=>{await new Promise(resolve=>{release=resolve;});return nativeResourceConsume(...args);};
  const held=consumeOriginSurge(nativeBuildEvaluate,first.rolls,first.config,first.message);
  while(!release)await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(resource.uses.spent,0,"resource is still available during pending consumption");
  await consumeOriginSurge(nativeBuildEvaluate,competing.rolls,competing.config,competing.message);
  assert.equal(competing.rolls.length,0); release();await held;assert.equal(consumed,2);
}
console.log("Неудержимая магия: выбор характеристик, Сопротивление бонусным действием, Помощь с временными хитами, к4, Вдохновение, Всплеск мощи с нативным расходом/отменой и без дублей: OK.");
