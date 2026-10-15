import assert from "node:assert/strict";
import fs from "node:fs";
import { animationMaterials, prepareAnimationDialog, prepareAnimationUpdates, recordAnimation, animationChatAction,
  canPlaceAnimation, prepareAnimationToken, animationPlaced, animatedWeaponChanges, activeAnimation, canUseAnimatedItem,
  guardAnimatedEquip, registerAnimatedStrike, canConsumeAnimatedStrike, recordAnimatedStrike, guardAnimatedAttack, preserveAnimatedThrownWeapon,
  animatedShieldChanges, animatedShieldCondition, refreshAnimatedShields, promptAnimatedAttacks, endAnimationAtZero } from "../scripts/magus-animation.mjs";
import { nativeSummonChanges, nativeBaseDamagePart } from "./data/dnd5e-summon-native.mjs";
import { constructParts, getAttackData } from "./data/dnd5e-making-native.mjs";
import { nativeConsume, nativeRefund, getDeltas } from "./data/dnd5e-reaction-native.mjs";
import { nativeUsageUpdates, ConsumptionError } from "./data/dnd5e-monsters-native.mjs";
import { nativeGriffonArmorClass } from "./data/dnd5e-griffon-native.mjs";
const get=(o,p)=>p.split(".").reduce((v,k)=>v?.[k],o);
const set=(o,p,v)=>{const keys=p.split("."),last=keys.pop();keys.reduce((x,k)=>x[k]??={},o)[last]=v;};
const flat=(o,p="",r={})=>{for(const[k,v]of Object.entries(o)){const path=p?`${p}.${k}`:k;if(v&&Object.getPrototypeOf(v)===Object.prototype)flat(v,path,r);else r[path]=v;}return r;};
const merge=(a,b,{inplace=true}={})=>{if(!inplace)a=structuredClone(a);for(const[k,v]of Object.entries(b)){if(v&&Object.getPrototypeOf(v)===Object.prototype)merge(a[k]??={},v);else a[k]=v;}return a;};
const list=items=>Object.defineProperty(Object.assign(items,{get(id){return this.find(i=>i.id===id);},has(id){return !!this.get(id);},getByType(type){return this.filter(i=>i.type===type);}}),"size",{get(){return this.length;}});
let serial=0;const world=new Map();
globalThis.fromUuidSync=uuid=>world.get(uuid);
globalThis.foundry={utils:{getProperty:get,setProperty:set,flattenObject:flat,mergeObject:merge,escapeHTML:String,isEmpty:x=>!x||!Object.keys(x).length,randomID:()=>String(++serial).padStart(16,"0"),iterateEntries:Object.entries}};
globalThis.game={time:{worldTime:0},scenes:[],actors:[],messages:new Map(),i18n:{localize:x=>x},user:{id:"player"}};
globalThis.ui={notifications:{warn(){},error(){}}};
globalThis.dnd5e={dataModels:{activity:{ConsumptionError}},utils:{convertLength:x=>x}};
const evaluate=(formula,data)=>{const value=String(formula).replace(/@([\w.]+)/g,(_,p)=>get(data,p)??0);assert.match(value,/^[\d\s.+*/()-]*$/);return value?Function(`return (${value})`)():0;};
globalThis.Roll=class{constructor(formula,data={}){this.formula=formula;this.data=data;}async evaluate(){this.total=evaluate(this.formula,this.data);return this;}evaluateSync(){this.total=evaluate(this.formula,this.data);return this;}};
Roll.replaceFormulaData=(formula,data)=>String(formula).replace(/@([\w.]+)/g,(_,p)=>get(data,p)??0);
globalThis.ActiveEffect=class{constructor(data){this.data=data;}toObject(){return structuredClone(this.data);}};
globalThis.Item=class{};Set.prototype.first??=function(){return this.values().next().value;};
class HostAttack {
 constructor(data) { this.data={_id:foundry.utils.randomID(),...data}; }
 toObject() { return structuredClone(this.data); }
}
globalThis.CONFIG={Dice:{BasicRoll:Roll},DND5E:{
 activityConsumptionTypes:{},activityActivationTypes:{},spellcasting:{spell:{getSpellSlotKey:level=>`spell${level}`}},actorSizes:{sm:{token:1}},
 armorClasses:{unarmored:{formula:"10 + @abilities.dex.mod"}},armorTypes:{shield:{}},armorProficienciesMap:{},healingTypes:{},
 activityTypes:{attack:{documentClass:HostAttack}}
}};
CONFIG.Dice.BasicRoll.constructParts=constructParts; foundry.utils.deepClone=structuredClone;
const read=pack=>fs.readdirSync(`packs/_source/${pack}`).filter(f=>f.endsWith(".json")).map(f=>JSON.parse(fs.readFileSync(`packs/_source/${pack}/${f}`,"utf8")));
const base=read("creatures").find(d=>d.flags?.spikependium?.key==="actor:magus-animated-weapon");
const sources=JSON.parse(fs.readFileSync("tools/data/magus-animation-gear.json","utf8")).gear;
function weapon(data,caster){const raw=structuredClone(data);raw.system.equipped=true;raw.system.quantity=1;raw.system.description??={value:""};
 const item={...structuredClone(raw),id:raw._id,isOwner:true,actor:caster,uuid:`${caster.uuid}.Item.${raw._id}`,toObject:()=>structuredClone(raw)};
 item.system.properties=new Set(raw.system.properties);item.system.activities=list(Object.entries(raw.system.activities).map(([id,a])=>({...a,id})));
 item.effects=list([]);return item;}
const caster={uuid:"Actor.caster",id:"caster",isOwner:true,flags:{spikependium:{}},items:list([]),prototypeToken:{disposition:1},system:{spells:{spell2:{level:2,value:3,max:3}}},async setFlag(module,p,value){set(this,`flags.${module}.${p}`,value);}};
world.set(caster.uuid,caster);
function host(type="weapon"){
 const spell=read("spells").find(d=>d.flags?.spikependium?.key===`spell:magus-animate-${type}`),data=Object.values(spell.system.activities)[0];
 const a={...data,id:data._id,actor:caster,item:{...spell,uuid:`${caster.uuid}.Item.${spell._id}`,toObject:()=>structuredClone(spell)},uuid:`${caster.uuid}.Item.${spell._id}.Activity.${data._id}`,
  ability:"int",relevantLevel:2,creatureSizes:new Set(data.creatureSizes),creatureTypes:new Set(data.creatureTypes),getApplicableEffects:async()=>[],
  getRollData:()=>({mod:4,item:{level:2},attributes:{prof:3},abilities:{int:{mod:4}},rolls:{attack:{msak:{bonus:"1"},rsak:{bonus:"2"}}}}),
  _prepareUsageUpdates:async function(config){return prepareAnimationUpdates(this,config,await nativeUsageUpdates.call(this,config));},requiresSpellSlot:true};
 return a;
}
function apply(actor,updates){for(const[p,v]of Object.entries(updates.actor))set(actor,p,v);for(const update of updates.item){const item=actor.items.get(update._id);for(const[p,v]of Object.entries(update))if(p!=="_id")set(item,p,v);}}
globalThis.Hooks={call(name,a,config,message,updates){if(name==="dnd5e.postActivityConsumption")recordAnimation(a,config,message);return true;}};
const rapier=weapon(sources.find(i=>i.name==="Rapier"),caster);caster.items.push(rapier);world.set(rapier.uuid,rapier);
const a=host(), config={consume:{resources:true,spellSlot:true},spell:{slot:"spell2"},spikependium:{animationMaterial:rapier.id}},message={data:{system:{}}};
assert.equal(animationMaterials(a)[0],rapier);
const deltas=await nativeConsume.call(a,config,message,async updates=>{const deltas={actor:getDeltas(caster,updates.actor),item:{}};for(const update of updates.item)deltas.item[update._id]=getDeltas(caster.items.get(update._id),update);apply(caster,updates);return deltas;});
assert.ok(deltas);assert.equal(rapier.system.equipped,false);assert.equal(caster.system.spells.spell2.value,2);
const frame=message.data.flags.spikependium.animation;assert.equal(frame.material,rapier.uuid);assert.equal(canPlaceAnimation(a),undefined);
function actorDoc(data){const actor={...structuredClone(data),uuid:"Actor.template",flags:structuredClone(data.flags??{}),prototypeToken:{actorLink:false},getRollData:()=>({}),items:list([])};
 actor.system.isNPC=true;actor.system.attributes.ac.calc="natural";
 actor.items=list((data.items??[]).map(raw=>{const item={...structuredClone(raw),id:raw._id,effects:list((raw.effects??[]).map(e=>({toObject:()=>structuredClone(e)}))),toObject:()=>structuredClone(raw)};
  const activities=Object.entries(raw.system.activities).map(([id,a])=>({...a,id,actionType:a.attack?.type.value==="ranged"?"rwak":"mwak"}));
  item.system.activities=list(activities);item.system.hasAttack=activities.some(a=>a.type==="attack");item.hasAttack=item.system.hasAttack;return item;}));
 actor.clone=changes=>actorDoc({...structuredClone(data),...changes});return actor;}
const template=actorDoc(base),before=structuredClone(base);
const result=await animatedWeaponChanges.call(a,(actor,profile,options)=>nativeSummonChanges.call(a,actor,profile,options),template,a.profiles[0],{});
assert.deepEqual(base,before,"source template is never modified");assert.equal(template.items.length,0);
const animated=result.actorUpdates.items[0];assert.equal(animated.system.damage.base.denomination,8);assert.equal(animated.system.range.reach,5);assert.equal(animated.system.quantity,1);assert.equal(animated.system.equipped,true);
const changes=animated.effects.find(e=>e.type==="enchantment").system.changes;
assert.ok(changes.some(c=>c.key==="activities[attack].attack.bonus"&&c.value==="4 + 3 + 1"));
assert.ok(changes.some(c=>c.key==="system.damage.bonus"&&c.value==="4"));
const attackData=getAttackData.call({attack:{flat:true,bonus:changes.find(c=>c.key==="activities[attack].attack.bonus").value},getRollData:()=>({mod:99})});
assert.equal(evaluate(attackData.parts.join(" + "),attackData.data),8,"native flat spell attack never adds the construct's own ability");
assert.equal(Object.values(animated.system.activities)[0].attack.ability,"none");
const damageHost={id:"attack",actor:{},item:{getFlag:()=>null,system:{damage:{bonus:"4"}}},getActionType:()=>"mwak"};
const damage=nativeBaseDamagePart.call(damageHost,{types:new Set(["piercing"]),scaledFormula:()=>"1d8"},{},{},0);
assert.deepEqual(damage.parts,["1d8","4"]);
assert.deepEqual(nativeBaseDamagePart.call(damageHost,{types:new Set(["fire"]),scaledFormula:()=>"1d6"},{},{},1).parts,["1d6"],"the caster modifier is added once, not to every damage part");
assert.equal(Object.values(animated.system.activities)[0].consumption.targets[0].type,"spikependiumAnimatedStrike");
assert.equal(Object.keys(animated.system.activities)[0],rapier.system.activities[0].id,"activity IDs preserve intrinsic weapon enchantments");
const summoned=actorDoc({...base,items:result.actorUpdates.items});summoned.uuid="Scene.main.Token.weapon.Actor.summon";summoned.flags.spikependium.animation=frame;summoned.isOwner=true;
const scene={uuid:"Scene.main",tokens:[],grid:{units:"ft",measurePath:([start,end])=>({distance:Math.abs(start.x-end.x)})}};
function token(id,actor,x=0){const t={id,uuid:`Scene.main.Token.${id}`,actor,parent:scene,flags:{spikependium:{animation:frame}},name:id,x,getOccupiedGridSpaceOffsets:()=>[],getCenterPoint(){return{x:this.x,y:0};}};world.set(t.uuid,t);return t;}
const placed=token("weapon",summoned);scene.tokens.push(placed);game.scenes=[scene];world.set(summoned.uuid,summoned);
const tokenConfig={actor:template,actorUpdates:{},tokenUpdates:{}};scene.tokens=[];prepareAnimationToken(a,a.profiles[0],tokenConfig);
assert.equal(prepareAnimationToken(a,a.profiles[0],{actorUpdates:{},tokenUpdates:{}}),false,"one cast cannot create two placements in one native placement batch");
assert.equal(canPlaceAnimation(a),undefined,"a cancelled/failed native placement attempt can be retried");
assert.notEqual(prepareAnimationToken(a,a.profiles[0],{actorUpdates:{},tokenUpdates:{}}),false);
scene.tokens=[placed];assert.equal(tokenConfig.actorUpdates["flags.spikependium.animation"].id,frame.id);
await animationPlaced(a,a.profiles[0],[placed]);assert.equal(canPlaceAnimation(a),false);assert.equal(canUseAnimatedItem({actor:caster,item:rapier}),false);assert.equal(guardAnimatedEquip(rapier,{"system.equipped":true}),false);
assert.equal(animationMaterials(a).length,0);assert.equal(rapier.system.quantity,1);
registerAnimatedStrike();game.combat={id:"combat",started:true,round:2,turn:0,combatant:{actor:caster}};
const strike={actor:summoned,item:{flags:{spikependium:{animatedWeapon:true}}},uuid:`${summoned.uuid}.Item.weapon.Activity.attack`};
const strikeUpdates={actor:{}};const target={actor:summoned};CONFIG.DND5E.activityConsumptionTypes.spikependiumAnimatedStrike.consume.call(target,{},strikeUpdates);apply(summoned,{...strikeUpdates,item:[]});
assert.throws(()=>CONFIG.DND5E.activityConsumptionTypes.spikependiumAnimatedStrike.consume.call(target,{}, {actor:{}}));
assert.equal(canConsumeAnimatedStrike(strike,{consume:false}),false);
const strikeMessage={data:{system:{deltas:{actor:[]}}}};recordAnimatedStrike(strike,{},strikeMessage,strikeUpdates);
const usage={id:"strike",type:"usage",flags:strikeMessage.data.flags};game.messages.set(usage.id,usage);
assert.equal(guardAnimatedAttack({subject:strike},{},{data:{system:{origin:usage.id}}}),undefined);
assert.equal(guardAnimatedAttack({subject:strike},{},{data:{system:{}}}),false);
game.combat.turn=1;assert.equal(guardAnimatedAttack({subject:strike},{},{data:{system:{origin:usage.id}}}),false);game.combat.turn=0;
await nativeRefund.call(strike,strikeMessage.data.system.deltas,async updates=>apply(summoned,updates));
assert.equal(summoned.flags.spikependium.animatedTurns["combat-2-0"],0);
const again={actor:{}};CONFIG.DND5E.activityConsumptionTypes.spikependiumAnimatedStrike.consume.call(target,{},again);apply(summoned,{...again,item:[]});
const reactivation={data:{system:{deltas:{actor:[{keyPath:"flags.spikependium.animatedTurns.combat-2-0",delta:1}]}}}};recordAnimatedStrike(strike,{},reactivation,again);assert.ok(reactivation.data.flags.spikependium.animatedTurn,"refund/reuse retains a receipt when native numeric delta already exists");
assert.equal(guardAnimatedAttack({subject:strike},{},{data:{system:{origin:usage.id}}}),false,"a refunded old card cannot borrow a new activation's turn expense");
const thrown={id:"dagger",quantity:0,destroy:true};preserveAnimatedThrownWeapon([],{subject:{actor:summoned,item:{id:"dagger",system:{quantity:1},flags:{spikependium:{animatedWeapon:true}}}},ammoUpdate:thrown});assert.equal(thrown.quantity,1);assert.equal(thrown.destroy,false);
const arrow={id:"arrow",quantity:0,destroy:true};preserveAnimatedThrownWeapon([],{subject:{actor:summoned,item:{id:"bow",flags:{spikependium:{animatedWeapon:true}}}},ammoUpdate:arrow});assert.equal(arrow.quantity,0,"ordinary arrows are still consumed natively");
game.time.worldTime=60;assert.equal(activeAnimation(summoned),undefined);assert.equal(canUseAnimatedItem(strike),false);assert.equal(canUseAnimatedItem({actor:caster,item:rapier}),undefined);game.time.worldTime=0;
await nativeRefund.call(a,message.data.system.deltas,async updates=>apply(caster,updates));assert.equal(caster.system.spells.spell2.value,3);assert.equal(activeAnimation(summoned),undefined);
set(caster,`flags.spikependium.animations.${frame.id}.spent`,1);
let prompts=0,uses=0;const controller={id:"player",active:true,isGM:false};game.users=[controller];caster.testUserPermission=()=>true;
foundry.applications={api:{DialogV2:{confirm:async()=>{prompts++;return true;}}}};
summoned.items[0].system.activities[0].use=async()=>{uses++;};game.combat.scene=scene;game.combat.round=3;
await promptAnimatedAttacks(game.combat,{round:3});await promptAnimatedAttacks(game.combat,{round:3});assert.equal(prompts,1);assert.equal(uses,1,"one start-turn prompt, on the caster owner's client");
game.combat.round=4;foundry.applications.api.DialogV2.confirm=async()=>{prompts++;return false;};await promptAnimatedAttacks(game.combat,{round:4});assert.equal(uses,1,"cancelling a prompt does not attack");
game.user={id:"other"};game.combat.round=5;await promptAnimatedAttacks(game.combat,{round:5});assert.equal(prompts,2,"other clients do not duplicate the prompt");game.user=controller;
await promptAnimatedAttacks({...game.combat,scene:null},{turn:0});
const ally={uuid:"Actor.ally",items:list([]),effects:[],system:{attributes:{hp:{value:20}}},reset(){this.resets=(this.resets??0)+1;},sheet:{render(){}}};
const shieldActor={uuid:"Scene.main.Token.shield.Actor.shield",flags:{spikependium:{animation:{...frame,kind:"shield"}}},system:{attributes:{hp:{value:20}}}};
const shieldToken=token("shield",shieldActor),allyToken=token("ally",ally,5);world.set(shieldActor.uuid,shieldActor);
function shieldEffect(id,source=shieldToken){return{id,parent:ally,flags:{spikependium:{animatedShield:true,animatedShieldSource:source.uuid,animatedShieldTarget:allyToken.uuid}},duration:{expired:false},disabled:false};}
const e=shieldEffect("a");ally.effects=[e];
const allowed=effect=>animatedShieldCondition.call({parent:effect},data=>data.spikependium.animatedShieldAllowed,{});
assert.equal(allowed(e),true);allyToken.x=6;assert.equal(allowed(e),false);allyToken.x=5;
const ownShield={type:"equipment",system:{type:{value:"shield"},equipped:true}};ally.items.push(ownShield);assert.equal(allowed(e),false);ownShield.system.equipped=false;assert.equal(allowed(e),true);
const second=shieldEffect("b");ally.effects.push(second);assert.equal(allowed(e),true);assert.equal(allowed(second),false,"identical shields never stack");
scene.tokens.push(allyToken,token("other-ally",ally,20));assert.equal(allowed(e),false,"shared actor AC cannot leak to an out-of-range linked token");scene.tokens.splice(-2);
shieldActor.system.attributes.hp.value=0;assert.equal(allowed(e),false);shieldActor.system.attributes.hp.value=20;
const lethal={"system.attributes.hp.value":0};endAnimationAtZero(shieldActor,lethal);for(const[p,v]of Object.entries(lethal))set(shieldActor,p,v);
shieldActor.system.attributes.hp.value=20;assert.equal(activeAnimation(shieldActor),undefined,"healing an object after it reached zero does not restart the ended spell");
delete shieldActor.flags.spikependium.animationEnded;
game.time.worldTime=60;assert.equal(allowed(e),false);game.time.worldTime=0;
set(caster,`flags.spikependium.animations.${frame.id}.spent`,0);assert.equal(allowed(e),false);set(caster,`flags.spikependium.animations.${frame.id}.spent`,1);
const shieldProfile=read("creatures").find(d=>d.flags?.spikependium?.key==="actor:magus-animated-shield").items[0];assert.equal(shieldProfile.effects[0].system.changes[0].value,"2");
const applied=animatedShieldChanges.call({getUsageToken:()=>shieldToken},()=>({}),shieldProfile.effects[0],{target:ally,chatMessage:{system:{targets:[{actor:ally.uuid,token:allyToken.uuid}]}}});assert.equal(applied.flags.spikependium.animatedShieldSource,shieldToken.uuid);
assert.equal(animatedShieldChanges.call({getUsageToken:()=>shieldToken},()=>({}),shieldProfile.effects[0],{target:ally}).disabled,true);
game.actors=[ally];refreshAnimatedShields();assert.equal(ally.resets,1);
const ac={calcs:new Set(["unarmored"]),formulas:[],base:-Infinity,armor:10,shield:0,cover:0,min:0,bonus:allowed(e)?2:0,override:null};
nativeGriffonArmorClass.call({attributes:{ac},abilities:{dex:{mod:2}},parent:{itemTypes:{equipment:[]},_preparationWarnings:[],coverBonus:0}},{abilities:{dex:{mod:2}}});assert.equal(ac.value,14);
class Base{async _prepareConsumptionContext(context){return context;}}
foundry.data={fields:{StringField:class{constructor(config){Object.assign(this,config);}}}};
game.scenes=[];set(caster,`flags.spikependium.animations.${frame.id}.placed`,false);const dialog={applicationClass:Base};prepareAnimationDialog(a,config,dialog);const app=new dialog.applicationClass();app.config=config;
assert.ok((await app._prepareConsumptionContext({fields:[],notes:[]})).fields[0].field.choices[rapier.id]);
for(const data of sources.filter(i=>i.name!=="Rapier")){
 const item=weapon(data,caster);caster.items.push(item);world.set(item.uuid,item);
 const cfg={spikependium:{animationMaterial:item.id}};const updates=prepareAnimationUpdates(a,cfg,{actor:{},item:[]});apply(caster,updates);recordAnimation(a,cfg,{data:{system:{}}});
 const result=await animatedWeaponChanges.call(a,(actor,profile,opts)=>nativeSummonChanges.call(a,actor,profile,opts),template,a.profiles[0],{});
 assert.equal(result.actorUpdates.items[0].system.range.reach,item.name==="Whip"?10:5);
 const changes=result.actorUpdates.items[0].effects.find(e=>e.type==="enchantment").system.changes;
 assert.ok(changes.some(c=>c.key==="activities[attack].attack.bonus"&&c.value===(item.name==="Longbow"?"4 + 3 + 2":"4 + 3 + 1")));
}
const magicData=structuredClone(sources.find(i=>i.name==="Rapier"));magicData._id=foundry.utils.randomID();
const originalAttack=Object.values(magicData.system.activities)[0];originalAttack.attack.critical.threshold=19;
originalAttack.damage.parts=[{number:1,denomination:6,types:["fire"]}];originalAttack.effects=[{_id:"poison"}];
magicData.effects=[{_id:"enchant",type:"enchantment",transfer:true,system:{changes:[]}},{_id:"wielder",type:"base",transfer:true},{_id:"poison",type:"base",transfer:false}];
const magic=weapon(magicData,caster);caster.items.push(magic);world.set(magic.uuid,magic);
const magicConfig={spikependium:{animationMaterial:magic.id}},magicUpdates=prepareAnimationUpdates(a,magicConfig,{actor:{},item:[]});apply(caster,magicUpdates);recordAnimation(a,magicConfig,{data:{system:{}}});
const magicResult=await animatedWeaponChanges.call(a,(actor,p,options)=>nativeSummonChanges.call(a,actor,p,options),template,a.profiles[0],{});
const copied=magicResult.actorUpdates.items[0],copiedAttack=Object.values(copied.system.activities)[0];
assert.equal(copiedAttack.attack.critical.threshold,19);assert.deepEqual(copiedAttack.effects,[{_id:"poison"}]);
assert.ok(copied.effects.some(e=>e._id==="poison"));assert.ok(!copied.effects.some(e=>e._id==="wielder"),"wielder-only actor buffs do not change the construct's defined stats");
assert.equal(copied.effects.flatMap(e=>e.system?.changes??[]).filter(c=>c.key==="system.damage.bonus").length,1,"intrinsic extra damage does not double the caster modifier");
console.log("Animated items: native selected-weapon attacks/modifiers, original preservation/locking, summon replay/expiry, turn expense/refund and conditional nonstacking shield AC passed.");
