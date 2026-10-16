import fs from 'node:fs';
import assert from 'node:assert/strict';
import {prepareDistanceDialog,captureDistance,prepareDistanceUpdates,recordDistanceConsumption,recordDistanceUsage,distanceCastPaid,distanceUse,
 recordDistanceArea,bindDistanceArea,syncDistanceRegions,syncDistanceEffect,resumeDistanceEffects,distanceSuppression,distanceTerrain,distanceSpeedChange,distanceExpiry,distanceEndTurn,
 distanceDamage,guardDistanceDamage} from '../scripts/arcana-distance.mjs';
import {recordArcanaCast,syncArcanaCast,arcanaSpellSuppression} from '../scripts/arcana-spells.mjs';
import {nativeConsume,nativeRefund,getDeltas} from './data/dnd5e-reaction-native.mjs';
import {prepareEffectData} from './data/dnd5e-effect-application.mjs';
import {nativeAppliedEffectChanges,nativeLanternExpiry,nativePerformBulkUpdate,nativeDeleteCachedActivities} from './data/dnd5e-arcana-native.mjs';
import {retainedSpellBulkUpdate} from '../scripts/arcana-stages.mjs';
import {nativeGriffonTerrain} from './data/dnd5e-griffon-native.mjs';
import {nativeApplyDamage,nativeCalculateDamage} from './data/dnd5e-guardian-native.mjs';
import {serializeEnervationDamage} from '../scripts/arcana-enervation.mjs';
const docs=p=>fs.readdirSync(`packs/_source/${p}`).map(f=>JSON.parse(fs.readFileSync(`packs/_source/${p}/${f}`,'utf8'))),doc=docs('spells').find(d=>d.flags?.spikependium?.key==='spell:au-distance-distortion');
assert.ok(doc);assert.equal(doc.name,'Искажение дистанции');assert.equal(doc.system.source.page,'42');assert.equal(doc.system.source.book,'AU');assert.equal(doc.system.level,4);assert.equal(doc.system.school,'ill');assert.ok(doc.folder);
assert.equal(doc.system.duration.value,'10');assert.ok(doc.system.properties.includes('concentration'));assert.deepEqual(doc.system.properties.filter(v=>['vocal','somatic','material'].includes(v)),['vocal','somatic']);
const by=Object.fromEntries(Object.values(doc.system.activities).map(a=>[a.flags.spikependium.distanceStage,a]));assert.deepEqual(Object.keys(by),['cast','slow','fast']);
assert.equal(by.cast.target.template.size,'60');assert.equal(by.cast.range.value,'120');assert.equal(by.cast.duration.concentration,true);
for(const a of [by.slow,by.fast]){assert.equal(a.activation.type,'');assert.equal(a.activation.override,true);assert.equal(a.duration.units,'inst');assert.equal(a.duration.override,true);assert.equal(a.duration.concentration,false);assert.equal(a.consumption.spellSlot,false);assert.equal(a.range.units,'spec');}
assert.deepEqual(by.slow.save.ability,['int']);assert.equal(by.slow.damage.onSave,'none');assert.equal(by.slow.damage.parts[0].number,2);assert.equal(by.slow.damage.parts[0].denomination,10);assert.deepEqual(by.slow.damage.parts[0].types,['psychic']);assert.equal(by.slow.damage.parts[0].scaling.mode,'');
assert.ok(doc.system.description.value.includes('[[/damage 2d10 type=psychic]]'));assert.ok(doc.effects.every(e=>e.system.magical&&!e.transfer));
const listJournal=docs('rules').find(d=>d.flags?.spikependium?.key==='journal:au-spell-lists');for(const p of listJournal.pages)assert.equal(p.system.spells.includes(`Compendium.spikependium.spells.Item.${doc._id}`),['bard','wizard','artificer','warlock'].includes(p.system.identifier));
const clone=structuredClone,get=(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o),set=(o,p,v)=>{const a=p.split('.'),last=a.pop();a.reduce((v,k)=>v[k]??={},o)[last]=v;};
const merge=(a,b)=>{for(const[k,v]of Object.entries(b)){if(k.includes('.'))set(a,k,clone(v));else if(v&&Object.getPrototypeOf(v)===Object.prototype)merge(a[k]??={},v);else a[k]=clone(v);}return a;};
const flat=(o,p='',r={})=>{for(const[k,v]of Object.entries(o)){const key=p?`${p}.${k}`:k;if(v&&Object.getPrototypeOf(v)===Object.prototype)flat(v,key,r);else r[key]=v;}return r;};
const list=a=>Object.assign(a,{get(id){return this.find(v=>v.id===id);}});let world,serial=0,cancel=false;
const gm={id:'gm',isGM:true,isActiveGM:true,active:true};globalThis.fromUuidSync=id=>world.get(id);
globalThis.foundry={utils:{getProperty:get,setProperty:set,mergeObject:merge,deepClone:clone,flattenObject:flat,getType:o=>Array.isArray(o)?'Array':o&&typeof o==='object'?'Object':typeof o,isEmpty:o=>!o||!Object.keys(o).length,randomID:()=>String(++serial).padStart(16,'0')},data:{fields:{BooleanField:class{constructor(o){Object.assign(this,o);}}}}};
globalThis.ui={notifications:{warn(){},error(){}}};globalThis.canvas={tokens:{recalculatePlannedMovementPaths(){}}};globalThis.CONST={TOKEN_DISPOSITIONS:{SECRET:-2}};
class D20{constructor(failure=true){this._evaluated=true;this.isFailure=failure;this.total=failure?8:20;this.options={target:16};}}
class Damage{constructor(total=10,type='psychic'){this.total=total;this.options={type};this._evaluated=true;}}
globalThis.CONFIG={Dice:{D20Roll:D20,DamageRoll:Damage},DND5E:{damageTypes:{psychic:{}},healingTypes:{healing:{},temphp:{}}}};
Math.clamp=(v,min,max)=>Math.min(max,Math.max(min,v));Number.isNumeric=v=>typeof v==='number'&&Number.isFinite(v);globalThis.simplifyBonus=v=>Number(v)||0;
globalThis.Hooks={call(h,...args){if(h==='dnd5e.preActivityConsumption')return captureDistance(...args);if(h==='dnd5e.activityConsumption'&&cancel)return false;if(h==='dnd5e.postActivityConsumption')recordDistanceConsumption(...args);if(h==='dnd5e.preApplyDamage')return guardDistanceDamage(...args);return true;},callAll(){}};
class Effect{
 constructor(data,parent){Object.assign(this,clone(data));this.id=data._id??`effect${++serial}`;this.uuid=`${parent.uuid}.ActiveEffect.${this.id}`;this.actor=parent.actor??parent;this.parent=parent;this.system??={};this.flags??={};this.duration??={};this.start??={};this._stats??={};this.statuses=new Set(data.statuses??[]);world.set(this.uuid,this);}
 get active(){return !this.disabled&&!this.duration.expired&&!arcanaSpellSuppression.call(this,()=>distanceSuppression.call(this,()=>false));}
 toObject(){return {_id:this.id,name:this.name,system:clone(this.system),flags:clone(this.flags),duration:clone(this.duration),statuses:[...this.statuses]};}
 static getEffectStart(){return {time:game.time.worldTime,combat:game.combat?.uuid??null,round:game.combat?.round??null,turn:game.combat?.turn??null};}
 static forApplication(c){return c;}
 async update(u){merge(this,u);return this;}
}
globalThis.ActiveEffect={implementation:Effect};globalThis.dnd5e={utils:{convertLength:(n,from,to)=>from===to?n:from==='ft'?n*.3048:n/.3048},applications:{components:{EffectApplicationElement:class{async _prepareEffectData(e,a){return prepareEffectData.call(this,e,a,x=>x);}}}}};
function actor(id){const a={id,uuid:`Actor.${id}`,documentName:'Actor',flags:{},effects:list([]),items:list([]),isOwner:true,statuses:new Set(),testUserPermission:u=>u?.isGM||u?.id==='owner',
 system:{isCreature:true,attributes:{movement:{units:'ft',ignoredDifficultTerrain:new Set()},hp:{value:40,max:100,damage:60,temp:0,tempmax:0}},_source:{attributes:{hp:{tempmax:0}}},traits:{ci:{value:new Set()}}},getRollData:()=>({}),changeIsIgnored:()=>false,reset(){}};
 a.changeHasEffect=(kind,d)=>d.type==='psychic'&&(kind==='immunity'&&a.immune||kind==='resistance'&&a.resist);a.calculateDamage=(d,o)=>nativeCalculateDamage.call(a,d,o);a.applyDamage=(d,o)=>serializeEnervationDamage.call(a,(...args)=>nativeApplyDamage.call(a,...args),d,o);
 a.update=async u=>{merge(a,u);a.system.attributes.hp.damage=a.system.attributes.hp.max-a.system.attributes.hp.value;return a;};
 a.createEmbeddedDocuments=async(_type,rows)=>{if(a.failEffect){a.failEffect=false;throw Error('effect failed');}return rows.map(d=>{const e=new Effect(d,a);a.effects.push(e);return e;});};
 a.updateEmbeddedDocuments=async(_type,rows)=>rows.map(d=>{const e=a.effects.get(d._id);merge(e,d);return e;});world.set(a.uuid,a);game.actors.push(a);return a;
}
function message(type,a,data={}){const id=`message${++serial}`,m={id,uuid:`ChatMessage.${id}`,type,activity:a,author:gm,timestamp:serial,flags:{},system:{},rolls:[],whisper:[],...data,
 getAssociatedActivity(){return this.activity;},getAssociatedActor(){return this.activity.actor;},getAssociatedItem(){return this.activity.item;},getOriginatingMessage(){return game.messages.get(this.system.origin);},getAssociatedRolls(t){return game.messages.filter(m=>m.type===t&&m.system.origin===this.id);},
 async setFlag(scope,key,v){if(this.failFlag){this.failFlag=false;throw Error('flag failed');}set(this.flags,`${scope}.${key}`,v);},async update(u){merge(this,u);}};game.messages.push(m);world.set(m.uuid,m);return m;}
function setup(){world=new Map();cancel=false;globalThis.game={user:gm,users:list([gm]),actors:[],scenes:[],messages:list([]),time:{worldTime:100},combat:{id:'fight',uuid:'Combat.fight',started:true,round:1,turn:0,current:{round:1,turn:0},previous:{round:1,turn:0},turns:[],combatants:list([])}};game.users.activeGM=gm;
 const caster=actor('caster'),target=actor('target'),other=actor('other'),scene={uuid:'Scene.scene',grid:{units:'ft',getCenterPoint:o=>o},tokens:list([]),async deleteEmbeddedDocuments(type,ids){assert.equal(type,'Region');assert.deepEqual(ids,['area']);world.delete('Scene.scene.Region.area');}};game.scenes.push(scene);
 const token=(id,a,x)=>{const t={id,uuid:`Scene.scene.Token.${id}`,actor:a,parent:scene,x,y:0,elevation:0,level:'floor',getOccupiedGridSpaceOffsets(){return[{x:this.x,y:this.y}];},getCenterPoint(){return{x:this.x,y:this.y};}};world.set(t.uuid,t);scene.tokens.push(t);const c={id,actor:a,token:t};game.combat.turns.push(c);game.combat.combatants.push(c);return t;};
 const sourceToken=token('caster',caster,0),targetToken=token('target',target,60),otherToken=token('other',other,80);game.user.targets=new Set([targetToken]);world.set(game.combat.uuid,game.combat);
 const item={...clone(doc),id:doc._id,uuid:`${caster.uuid}.Item.${doc._id}`,actor:caster,toObject:()=>clone(doc)};item.effects=list(doc.effects.map(d=>new Effect(d,item)));caster.items.push(item);world.set(item.uuid,item);
 caster.deleteEmbeddedDocuments=async(type,ids)=>{assert.equal(type,'Item');for(const id of ids){const i=caster.items.get(id);caster.items.splice(caster.items.indexOf(i),1);world.delete(i.uuid);}};
 item.update=async u=>{for(const[k,v]of Object.entries(u))if(k==='flags.dnd5e.-=cachedFor')delete item.flags.dnd5e?.cachedFor;else if(k!=='_id')set(item,k,clone(v));};
 const acts=Object.fromEntries(Object.values(doc.system.activities).map(d=>{const a={...clone(d),item,actor:caster,uuid:`${item.uuid}.Activity.${d._id}`,getUsageToken:()=>sourceToken,getRollData:()=>({mod:3}),getAppliedEffectChanges:nativeAppliedEffectChanges};a.applicableEffects=a.effects.map(e=>item.effects.get(e._id));a.duration.getEffectData=()=>({value:600,units:'seconds'});if(a.save)a.save.dc={value:16};a._prepareUsageUpdates=async c=>prepareDistanceUpdates(a,c,{actor:{},item:[],activity:{},rolls:[],create:[],delete:[...(a.deleteOnCast??[])]});world.set(a.uuid,a);return[d.flags.spikependium.distanceStage,a];}));
 const region={id:'area',uuid:'Scene.scene.Region.area',documentName:'Region',parent:scene,behaviors:[],getFlag:(scope,k)=>scope==='dnd5e'&&k==='activity'?acts.cast.uuid:undefined,testPoint:p=>p.level==='floor'&&Math.hypot(p.x-60,p.y)<=60&&Math.abs(p.elevation)<=60,async createEmbeddedDocuments(_type,rows){this.behaviors.push(...rows);return rows;}};world.set(region.uuid,region);
 return {caster,target,other,sourceToken,targetToken,otherToken,item,acts,region};
}
async function use(s,kind='cast',token=s.targetToken,config={spikependium:{distanceConfirmed:true}}){const a=s.acts[kind];game.user.targets=new Set([token]);return distanceUse.call(a,async()=>{
 const msg={data:{system:{targets:kind==='cast'?[]:[{actor:token.actor.uuid,token:token.uuid}]}}};const ok=await nativeConsume.call(a,config,msg,async u=>{const deltas={actor:getDeltas(s.caster,u.actor),item:{}};for(const row of u.item)await s.item.update(row);await s.caster.update(u.actor);if(u.delete.length)await s.caster.deleteEmbeddedDocuments('Item',u.delete);return deltas;});if(!ok)return;
 recordDistanceUsage(a,msg);recordArcanaCast(a,msg);const card=message('usage',a,msg.data);
 if(kind==='cast'){const concentration=new Effect({system:{type:'concentrating'}},s.caster);s.caster.effects.push(concentration);card.system.concentration=concentration.id;await syncArcanaCast(card);await recordDistanceArea(a,{}, {message:card,templates:[s.region]});}
 await syncDistanceEffect(card);return card;
 });}
function save(card,s,fail=true){return message('save',{actor:s.target}, {system:{origin:card.id,ability:'int'},rolls:[new D20(fail)],getAssociatedToken:()=>s.targetToken});}
async function refund(s,card){await nativeRefund.call(card.activity,card.system.deltas,async u=>s.caster.update(u.actor));}
const marker=(s,kind)=>s.target.effects.find(e=>e.flags.spikependium?.distanceProfile===kind);
const turn=(n,round=1)=>{game.combat.round=round;game.combat.turn=n;game.combat.current={round,turn:n};};
let s=setup(),origin=await use(s);assert.ok(distanceCastPaid(origin));assert.equal(origin.flags.spikependium.distanceArea,s.region.uuid);assert.equal(s.region.behaviors.length,1);await syncDistanceRegions();assert.equal(s.region.behaviors.length,1);
delete origin.flags.spikependium.distanceArea;await bindDistanceArea(s.acts.cast,[s.region]);assert.equal(origin.flags.spikependium.distanceArea,s.region.uuid,'a later native template placement binds to the active cast');
let slow=await use(s,'slow');assert.ok(slow);assert.equal(await use(s,'fast'),undefined,'both variants share once per turn');game.time.worldTime++;assert.equal(await use(s,'slow'),undefined,'seconds do not create a new combat turn');
save(slow,s,false);await syncDistanceEffect(slow);assert.equal(marker(s,'slow'),undefined,'successful INT grants no difficult terrain');assert.equal(await use(s,'fast'),undefined,'success still uses the turn');
await refund(s,slow);slow=await use(s,'slow');save(slow,s,true);await syncDistanceEffect(slow);assert.ok(marker(s,'slow').active);
const terrain={behavior:{flags:s.region.behaviors[0].flags,parent:s.region},ignoredDispositions:new Set(),types:new Set(),magical:true};
const nativeTerrain=t=>nativeGriffonTerrain.call(terrain,t,{}),getTerrain=t=>distanceTerrain.call(terrain,nativeTerrain,t,{});assert.deepEqual(getTerrain(s.targetToken),[{name:'difficultTerrain'}]);assert.deepEqual(getTerrain(s.otherToken),[]);
s.target.system.attributes.movement.ignoredDifficultTerrain.add('magical');assert.deepEqual(getTerrain(s.targetToken),[]);s.target.system.attributes.movement.ignoredDifficultTerrain.clear();
const normal={...terrain,behavior:{flags:{}}};assert.deepEqual(distanceTerrain.call(normal,()=>['ordinary'],s.targetToken,{}),['ordinary']);
await refund(s,slow);assert.equal(marker(s,'slow').active,false);assert.deepEqual(getTerrain(s.targetToken),[]);
s=setup();origin=await use(s);s.targetToken.x=121;assert.equal(await use(s,'fast'),undefined);s.targetToken.x=120;assert.ok(await use(s,'fast'),'boundary included');
let fast=marker(s,'fast');assert.ok(fast.active);const applied={effect:fast,key:'system.attributes.movement.bonus',value:'20'};s.target.system.attributes.movement.units='m';assert.equal(distanceSpeedChange((_,c)=>c.value,s.target,applied),'6.096');assert.equal(applied.value,'20','profile not mutated');
const duplicate=new Effect({...fast.toObject(),_id:'zzzzzzzzzzzzzzzz'},s.target);duplicate.start=fast.start;s.target.effects.push(duplicate);assert.equal(s.target.effects.filter(e=>e.flags.spikependium?.distanceProfile==='fast'&&e.active).length,1,'equal-time speed effects do not stack');s.target.effects.splice(s.target.effects.indexOf(duplicate),1);
s.caster.effects.get(origin.system.concentration).disabled=true;assert.equal(fast.active,false);assert.equal(await use(s,'slow'),undefined);s.caster.effects.get(origin.system.concentration).disabled=false;assert.equal(fast.active,true);
await refund(s,origin);assert.equal(fast.active,false);assert.equal(distanceCastPaid(origin),false);
// Current vs next own turn, and no late effect creation after its deadline.
s=setup();origin=await use(s);turn(1);slow=await use(s,'slow');save(slow,s);await syncDistanceEffect(slow);const slowEffect=marker(s,'slow');game.combat.previous={round:1,turn:1,combatantId:'target'};
const Expiry=nativeLanternExpiry(class{isExpiryEvent(){return false;}}),nativeExpiry=Object.assign(new Expiry(),{specialDuration:'targetEnd',actor:s.target,start:{combat:game.combat,round:1,turn:1}});game.combat.getCombatantsByActor=a=>game.combat.turns.filter(c=>c.actor===a);
assert.equal(nativeExpiry.isExpiryEvent('turnEnd',{combat:game.combat,round:1,turn:1}),false);assert.equal(distanceExpiry.call(slowEffect,(...args)=>nativeExpiry.isExpiryEvent(...args),'turnEnd',{combat:game.combat,round:1,turn:1}),true);
await distanceEndTurn.call(game.combat,async()=>{},game.combat.turns[1]);assert.equal(slowEffect.active,false);
s=setup();origin=await use(s);turn(1);const fastCard=await use(s,'fast');fast=marker(s,'fast');game.combat.previous={round:1,turn:1,combatantId:'target'};await distanceEndTurn.call(game.combat,async()=>{},game.combat.turns[1]);assert.equal(fast.active,true);turn(1,2);game.combat.previous={round:2,turn:1,combatantId:'target'};await distanceEndTurn.call(game.combat,async()=>{},game.combat.turns[1]);assert.equal(fast.active,false);
s=setup();origin=await use(s);slow=await use(s,'slow');save(slow,s);turn(2);await resumeDistanceEffects();assert.equal(marker(s,'slow'),undefined,'late recovery does not recreate expired terrain');
// Payment cancellation, deletion of the usage card, no unbound/replayed costs, and preserved hidden modes.
s=setup();origin=await use(s);cancel=true;assert.equal(await use(s,'slow'),undefined);cancel=false;const original=await use(s,'fast');game.messages.splice(game.messages.indexOf(original),1);assert.equal(await use(s,'slow'),undefined,'deleting a card does not clear the turn ledger');
assert.equal(captureDistance(s.acts.fast,{}, {message:original}),false);s.targetToken.hidden=true;turn(2);const hidden=await use(s,'fast');assert.deepEqual(hidden.whisper,['gm']);assert.equal(hidden.blind,true);
const unbound=new Effect(doc.effects.find(e=>e.flags.spikependium?.distanceProfile==='fast'),s.target);assert.equal(unbound.active,false);
s=setup();origin=await use(s);s.target.failEffect=true;await assert.rejects(()=>use(s,'fast'));await resumeDistanceEffects();assert.equal(s.target.effects.length,1);await resumeDistanceEffects();assert.equal(s.target.effects.length,1);
// Source-bound psychic damage uses the real native damage application and shared atomic queue.
s=setup();origin=await use(s);slow=await use(s,'slow');save(slow,s);let damage;await distanceDamage.call(s.acts.slow,async(_c,_d,m)=>{damage=message('damage',s.acts.slow,{...m.data,rolls:[new Damage()]});},{},{},{data:{system:{origin:slow.id}}});
assert.ok(damage.flags.spikependium.distanceDamage);s.target.resist=true;await Promise.all([1,2].map(()=>s.target.applyDamage([{type:'psychic',value:10}],{originatingMessage:damage})));assert.equal(s.target.system.attributes.hp.value,35,'native resistance and no double application');
assert.equal(guardDistanceDamage(s.other,10,{}, {originatingMessage:damage}),false);await refund(s,slow);assert.equal(guardDistanceDamage(s.target,10,{}, {originatingMessage:damage}),false);
s=setup();origin=await use(s);s.caster.effects.get(origin.system.concentration).disabled=true;await syncDistanceRegions();assert.ok(world.has(s.region.uuid),'disabling preserves the region');s.caster.effects.get(origin.system.concentration).disabled=false;await refund(s,origin);await syncDistanceRegions();assert.ok(world.has(s.region.uuid),'resource refund alone does not delete geometry');
game.time.worldTime+=600;await syncDistanceRegions();assert.equal(world.has(s.region.uuid),false,'expiry removes only the bound region');
s=setup();origin=await use(s);s.caster.effects.splice(s.caster.effects.findIndex(e=>e.id===origin.system.concentration),1);await syncDistanceRegions();assert.equal(world.has(s.region.uuid),false,'ending concentration removes geometry');
s=setup();s.item.flags.dnd5e={cachedFor:'Item.scroll.Activity.cast'};s.acts.cast.deleteOnCast=[s.item.id];origin=await use(s);assert.equal(s.caster.items.length,1);assert.equal(s.item.flags.dnd5e.cachedFor,undefined);assert.equal(s.item.flags.spikependium.distanceRetained,true);assert.equal(await use(s),undefined,'retained actions do not grant a new cast');assert.ok(await use(s,'fast'));game.time.worldTime+=600;await syncDistanceRegions();assert.equal(s.caster.items.length,0,'only the retained spell is collected at its original deadline');
const cfg={},dialog={applicationClass:class{async _prepareConsumptionContext(){return {fields:[],inputs:{createCheckboxInput(){}}};}}};prepareDistanceDialog(s.acts.slow,cfg,dialog);const ctx=await new dialog.applicationClass()._prepareConsumptionContext.call({config:cfg},{});assert.equal(ctx.fields[0].name,'spikependium.distanceConfirmed');
// Exact native bulk ordering deletes an exhausted source before updating cached spells; parent cleanup must see the detached copy.
for(const kind of ['lantern','distance','dragon','duel']){
 const owner={id:'owner',items:new Map()},sourceItem={id:'scroll'},cached={id:'cached',flags:{dnd5e:{cachedFor:'scrollCast'}}};owner.items.set(sourceItem.id,sourceItem);owner.items.set(cached.id,cached);
 const cast={get cachedSpell(){return [...owner.items.values()].find(i=>i.flags?.dnd5e?.cachedFor==='scrollCast');}};
 const model={parent:{isEmbedded:true,actor:owner},activities:{getByType:()=>[cast]}};
 owner.deleteEmbeddedDocuments=async(type,ids,options={})=>{assert.equal(type,'Item');const deleted=[];for(const id of ids){const item=owner.items.get(id);if(!item)continue;owner.items.delete(id);deleted.push(item);if(id==='scroll')nativeDeleteCachedActivities.call(model,options,game.user.id);}return deleted;};
 foundry.documents={async modifyBatch(operations){const results=[];for(const op of operations){if(op.action==='delete')results.push(await op.parent.deleteEmbeddedDocuments(op.documentName,op.ids));else if(op.action==='update'&&op.documentName==='Item'){const changed=[];for(const row of op.updates){const i=owner.items.get(row._id);assert.ok(i);delete i.flags.dnd5e.cachedFor;changed.push(i);}results.push(changed);}}return results;}};
 const updates={actor:{},item:[{_id:'cached',[`flags.spikependium.${kind}Retained`]:true,'flags.dnd5e.-=cachedFor':null}],delete:['scroll']};
 const result=await retainedSpellBulkUpdate.call(owner,(...args)=>nativePerformBulkUpdate.call(owner,...args),updates,{deleteOptions:{render:false}});
 assert.equal(owner.items.has('cached'),true,`${kind}: source cleanup preserves the temporary spell`);assert.equal(owner.items.has('scroll'),false);assert.equal(result[0][0],sourceItem);assert.equal(result[1][0],cached,'native result order preserved');
}
console.log('Distance Distortion: native payment/refund and effect data, class folders, once-per-turn shared ledger, INT/no damage on success, conditional native terrain/ignoring, current/next own expiry, speed units, concentration, late recovery, psychic damage/replay guards, privacy and real cached-source deletion order passed.');
