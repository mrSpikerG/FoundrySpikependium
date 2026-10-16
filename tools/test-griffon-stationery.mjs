import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GRIFFON_STATIONERY, define } from '../src/content/griffons-saddlebag-stationery.mjs';
import { REGISTRY, FOLDERS } from './lib/docs.mjs';
import { candleSpent, canUseStationery, prepareStationeryUpdates, prepareChalkSave, syncStationery } from '../scripts/griffon-stationery.mjs';
import { nativeRefund, getDeltas, nativeConsume } from './data/dnd5e-reaction-native.mjs';
import { nativeUsesConsumption } from './data/dnd5e-monsters-native.mjs';
import { nativeThwackMessageConfig } from './data/dnd5e-thwack-native.mjs';
define();
const clone=structuredClone,read=(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o),set=(o,p,v)=>{const a=p.split('.'),last=a.pop();a.reduce((v,k)=>v[k]??={},o)[last]=v;};
const flatten=(o,p='',out={})=>{for(const[k,v]of Object.entries(o)){const key=p?`${p}.${k}`:k;if(v&&Object.getPrototypeOf(v)===Object.prototype)flatten(v,key,out);else out[key]=v;}return out;};
const world=new Map();let rolled=0,total=4,cancel=false,serial=0;
globalThis.foundry={utils:{getProperty:read,setProperty:set,flattenObject:flatten,isEmpty:o=>!Object.keys(o).length}};
globalThis.ui={notifications:{warn(){}}};globalThis.canvas={scene:null};
globalThis.game={time:{worldTime:100},user:{isActiveGM:true,isGM:true},users:{activeGM:{}},scenes:[],actors:[],messages:new Map()};
globalThis.fromUuidSync=uuid=>world.get(uuid);
globalThis.dnd5e={utils:{convertLength:(n,_from,to)=>to==='m'?n*0.3048:n}};
globalThis.CONFIG={DND5E:{movementUnits:{ft:{},m:{}}},Dice:{BasicRoll:class{constructor(formula){this.formula=formula;}async evaluate(){rolled++;this.total=total;return this;}}}};
globalThis.Hooks={call(name,...args){if(name==='dnd5e.preActivityConsumption')return canUseStationery(args[0]);if(name==='dnd5e.activityConsumption'&&cancel)return false;return true;}};
const evidence=JSON.parse(fs.readFileSync('tools/data/griffon-stationery.json','utf8')),inv=JSON.parse(fs.readFileSync('tools/data/external-content-inventory.json','utf8')).sources.find(s=>s.id==='GS1');
const folders=new Map(FOLDERS.get('items').map(d=>[d._id,d])),get=id=>REGISTRY.get(`item:gs1:${id}`).doc;
for(const[en,id]of GRIFFON_STATIONERY) {
 const d=get(id),e=evidence.entries.find(e=>e.key===d.flags.spikependium.key);assert.ok(e);assert.match(e.sha256,/^[a-f0-9]{64}$/);
 assert.equal(d.flags.spikependium.originalName,en);assert.match(d.name,/[а-яё]/i);assert.equal(d.system.source.custom,e.url);assert.equal(d.system.source.rules,'2024');
 assert.equal(inv.entries.find(e=>e.key===d.flags.spikependium.key).status,'imported-partial-automation');
 assert.equal(folders.get(d.folder).name,'Свечи и письменные принадлежности');assert.equal(folders.get(folders.get(d.folder).folder).name,'Сумка грифона — книга 1');
 assert.ok(d.system.price.value>0);assert.ok(Number.isFinite(d.system.weight.value));assert.equal(d.system.weight.units,'lb');
 for(const a of Object.values(d.system.activities)){assert.equal(a.consumption.spellSlot,false);for(const e of a.effects)assert.ok(d.effects.some(f=>f._id===e._id));}
}
assert.equal(evidence.nativeCandle.document.system.source.rules,'2024');assert.equal(get('anti-light').system.weight.value,evidence.nativeCandle.document.system.weight.value);assert.equal(get('secret-scribe').system.weight.value,2*evidence.nativeCandle.document.system.weight.value);
assert.equal(get('anti-light').system.price.value,200);assert.equal(get('secret-scribe').system.price.value,4000);assert.equal(get('null-chalk').system.price.value,20000);
const list=a=>Object.assign(a,{get(id){return this.find(i=>i.id===id);}});
function owned(id) {
 const item=clone(get(id));Object.assign(item,{id:item._id,uuid:`Actor.owner.Item.${++serial}`,isOwner:true});
 Object.defineProperty(item.system.uses,'value',{get(){return Number(this.max)-this.spent;}});item.system.equipped=true;
 const actor={uuid:'Actor.owner',isOwner:true,items:list([item]),getActiveTokens:()=>[token]},token={uuid:`Scene.main.Token.${serial}`,actor,x:100,y:200,width:1,height:2,object:{controlled:false},parent:null};
 item.actor=actor;item.update=async changes=>{for(const[p,v]of Object.entries(changes))set(item,p,v);};
 for(const a of Object.values(item.system.activities))Object.assign(a,{item,actor});
 world.set(item.uuid,item);world.set(token.uuid,token);return {item,actor,token};
}
const activity=(item,c)=>Object.values(item.system.activities).find(a=>a.flags?.spikependium?.stationeryCommand===c);
const updates=()=>({item:[],actor:{},activity:{},create:[],delete:[],rolls:[]});
function apply(item,u){const deltas={actor:[],item:{}};for(const change of u.item){const values=Object.fromEntries(Object.entries(change).filter(([k])=>k!=='_id'));deltas.item[item.id]=getDeltas(item,values);for(const[p,v]of Object.entries(values))set(item,p,v);}return deltas;}
async function use(item,c,{pay=true,fail=false}={}) {
 const a=activity(item,c),config={},message={data:{}};if(canUseStationery(a,config,{},message)===false)return false;
 const snapshot=()=>({flags:clone(item.flags),max:item.system.uses.max,spent:item.system.uses.spent,quantity:item.system.quantity});const before=snapshot();
 a._prepareUsageUpdates=async()=>{const u=updates();if(c==='draw'&&pay){const cost=await nativeUsesConsumption.call({resolveCost:async()=>({total:1})},{},{uses:item.system.uses,type:'chalk',rolls:u.rolls,delta:{}});u.item.push({_id:item.id,'system.uses.spent':cost.spent});}return prepareStationeryUpdates(a,config,u);};
 cancel=fail;const u=await nativeConsume.call(a,config,message,x=>apply(item,x));cancel=false;
 if(!u){assert.deepEqual(snapshot(),before);return false;}
 nativeThwackMessageConfig.call({metadata:{usage:{}}},config,message,{updates:u});return {u,message,deltas:message.data.system.deltas};
}
async function refund(item,r){await nativeRefund.call({item,actor:item.actor},{actor:[],item:r.deltas.item},u=>apply(item,u));}
{
 const {item}=owned('secret-scribe');assert.equal(canUseStationery(activity(item,'orange')),false);
 const first=await use(item,'blue');assert.equal(item.flags.spikependium.scribePhase,1);assert.equal(canUseStationery(activity(item,'blue')),false);
 const next=await use(item,'orange');assert.equal(item.flags.spikependium.scribePhase,2);assert.equal(canUseStationery(activity(item,'blue')),false);
 const end=await use(item,'copy');assert.equal(item.flags.spikependium.scribePhase,0);await refund(item,end);assert.equal(item.flags.spikependium.scribePhase,2);await refund(item,next);assert.equal(item.flags.spikependium.scribePhase,1);await refund(item,first);assert.equal(item.flags.spikependium.scribePhase,0);
 await use(item,'blue',{fail:true});assert.equal(item.flags.spikependium.scribePhase,0);
 item.system.quantity=2;assert.equal(canUseStationery(activity(item,'blue')),false);item.system.quantity=1;item.actor.isOwner=false;assert.equal(canUseStationery(activity(item,'blue')),false);
}
{
 const {item}=owned('null-chalk');assert.equal(await use(item,'draw'),false);const initialRolls=rolled;
 const init=await use(item,'initialize');assert.equal(rolled,initialRolls+1);assert.equal(item.system.uses.max,'4');assert.equal(init.message.data.rolls.length,1);assert.equal(init.message.data.rolls[0].formula,'1d4+1');assert.equal(await use(item,'initialize'),false);
 assert.equal(await use(item,'draw',{pay:false}),false,'consumption cannot be disabled');assert.equal(await use(item,'draw',{fail:true}),false);
 const draw=await use(item,'draw');assert.equal(item.system.uses.spent,1);await refund(item,draw);assert.equal(item.system.uses.spent,0);
 for(let i=0;i<4;i++)assert.ok(await use(item,'draw'));assert.equal(item.system.uses.value,0);await assert.rejects(()=>use(item,'draw'));assert.equal(item.system.quantity,1);assert.equal(item.system.uses.autoDestroy,false);
 item.system.uses.spent=0;await refund(item,init);assert.equal(item.flags.spikependium.chalkInitialized,0);assert.equal(item.system.uses.max,0);
 total=9;await assert.rejects(()=>use(item,'initialize'),/Некорректное число/);total=4;
 const save=Object.values(item.system.activities).find(a=>a.type==='save');assert.equal(save.save.dc.formula,'16');assert.deepEqual(save.save.ability,['cha']);assert.equal(save.damage.onSave,'half');assert.equal(save.damage.parts[0].number,2);assert.equal(save.damage.parts[0].denomination,8);assert.deepEqual(save.damage.parts[0].types,['force']);
 const e=item.effects.find(e=>e._id===save.effects[0]._id);assert.equal(e.transfer,false);assert.equal(e.duration.expiry,'targetStart');assert.ok(e.system.changes.some(c=>c.key==='system.attributes.movement.multiplier'&&Number(c.value)===0));
 game.messages.set('line',{getAssociatedActivity:()=>save});for(const type of ['celestial','elemental','fey','fiend','undead','humanoid','beast','dragon']){const result=prepareChalkSave({subject:{documentName:'Actor',system:{details:{type:{value:type}}}}},{},{data:{system:{origin:'line'}}});assert.equal(result===false,['humanoid','beast','dragon'].includes(type));}
}
function scene(units='ft') {
 const s={grid:{units,size:100},lights:[],tokens:[],async createEmbeddedDocuments(type,data){assert.equal(type,'AmbientLight');for(const d of data){const light={...clone(d),async delete(){s.lights.splice(s.lights.indexOf(light),1);},async update(update){Object.assign(light,clone(update));}};s.lights.push(light);}return s.lights;}};return s;
}
{
 const {item,actor,token}=owned('anti-light'),s=scene();token.parent=s;s.tokens.push(token);canvas.scene=s;game.scenes=[s];game.actors=[actor];
 assert.equal(canUseStationery(activity(item,'light'),{},{},{create:false}),false);assert.equal(await use(item,'light',{fail:true}),false);assert.equal(item.flags.spikependium.antiLightOn,0);
 const on=await use(item,'light');assert.equal(item.flags.spikependium.antiLightToken,token.uuid);assert.equal(item.system.uses.spent,0);await syncStationery();assert.equal(s.lights.length,1);
 const light=s.lights[0];assert.equal(light.config.negative,true);assert.equal(light.config.bright,10);assert.equal(light.x,150);assert.equal(light.y,300);assert.equal(token.light,undefined,'ordinary token light untouched');
 await syncStationery();assert.equal(s.lights.length,1);token.x=400;await syncStationery();assert.equal(light.x,450);
 game.time.worldTime=160;assert.equal(candleSpent(item),60);await syncStationery();assert.equal(item.system.uses.spent,60);
 const covered=await use(item,'cover');await syncStationery();assert.equal(s.lights.length,0);game.time.worldTime=220;await syncStationery();assert.equal(item.system.uses.spent,120,'cover does not stop burning');
 await refund(item,covered);await syncStationery();assert.equal(s.lights.length,1);
 const off=await use(item,'snuff');await syncStationery();assert.equal(s.lights.length,0);game.time.worldTime=500;await syncStationery();assert.equal(candleSpent(item),120,'snuffed candle does not burn');
 const again=await use(item,'light');await syncStationery();await refund(item,again);await syncStationery();assert.equal(s.lights.length,0);assert.equal(item.flags.spikependium.antiLightOn,0);
 await use(item,'light');game.time.worldTime=600;await syncStationery();assert.equal(item.system.uses.spent,220);game.time.worldTime=550;await syncStationery();assert.equal(candleSpent(item),220,'time rewind cannot return already settled burn');game.time.worldTime=600;
 item.system.equipped=false;await syncStationery();assert.equal(s.lights.length,0);game.time.worldTime=650;await syncStationery();assert.equal(item.system.uses.spent,270,'unequipped burning still consumes time');item.system.equipped=true;
 s.grid.units='m';await syncStationery();assert.equal(s.lights[0].config.bright,3.048);s.lights.push({...s.lights[0],delete:async function(){s.lights.splice(s.lights.indexOf(this),1);}});await syncStationery();assert.equal(s.lights.length,1);
 game.user.isActiveGM=false;token.x=800;const old=s.lights[0].x;await syncStationery();assert.equal(s.lights[0].x,old,'one GM controls scene documents');game.user.isActiveGM=true;
 game.time.worldTime=5000;await syncStationery();assert.equal(item.system.uses.spent,3600);assert.equal(item.flags.spikependium.antiLightOn,0);assert.equal(s.lights.length,0);assert.equal(await use(item,'light'),false);
 // Other scene lights belong to the scene, never to this item.
 s.lights.push({flags:{},x:0,config:{}});await syncStationery();assert.equal(s.lights.length,1);
}
console.log('GS1 stationery: three Russian sources/folders/prices/native candle weight; one embedded chalk initialization die, native charge/refund/cancellation, target types and stopped-speed profile; scribe phases/refund; independent darkness source, movement/units/cover, paused and total burn, rewind/expiry/authority/duplicate cleanup passed.');
