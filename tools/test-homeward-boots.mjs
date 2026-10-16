import {homewardUse,canUseHomeward,prepareHomewardUpdates,recordHomewardConsumption,resumeHomeward,forgetHomewardCard} from '../scripts/homeward-boots.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {canUseBoots,bootsUse,prepareBootsUpdates,xornSpent,recoverBootsPeriods,bootsEffectSuppression,bootsEffectChange,prepareBootsCheck,bootsLight,bootsCachedSpell,syncBoots} from '../scripts/griffon-two-boots.mjs';
import {canUseGriffonItem} from '../scripts/griffon-items.mjs';
import {prepareGriffonTwoUpdates,recordGriffonCooldown,canUseGriffonTwo,syncGriffonTwo} from '../scripts/griffon-two-items.mjs';
import {nativeArcanistUse} from './data/dnd5e-arcanist-native.mjs';
import {nativeUsageConfig,nativeUsageUpdates,nativeConsumeItemUses,nativeMergeUpdates,nativeUsesConsumption,nativeRecoverUses} from './data/dnd5e-monsters-native.mjs';
import {nativeConsume,nativeRefund,getDeltas} from './data/dnd5e-reaction-native.mjs';
import {nativeThwackMessageConfig} from './data/dnd5e-thwack-native.mjs';
import {nativeGriffonCastChanges} from './data/dnd5e-griffon-native.mjs';
import {nativeGloveCachedSpellData} from './data/dnd5e-gloves-native.mjs';
import {nativeBeltRecovery} from './data/dnd5e-belts-native.mjs';
import {syncWeaponLights} from '../scripts/griffon-weapon-lights.mjs';
const evidence=JSON.parse(fs.readFileSync('tools/data/griffon-two-boots.json','utf8')),rows=fs.readdirSync('packs/_source/items').map(f=>JSON.parse(fs.readFileSync(`packs/_source/items/${f}`,'utf8'))),docs=new Map(rows.map(d=>[d.flags?.spikependium?.key,d])),folders=new Map(rows.filter(d=>d._key.startsWith('!folders!')).map(d=>[d._id,d])),names=JSON.parse(fs.readFileSync('babele/ru/spikependium.items.json','utf8')).entries;
assert.equal(evidence.entries.length,6);for(const e of evidence.entries){const d=docs.get(e.key);assert.ok(d,e.key);assert.equal(names[d._id].name,e.name.slice(0,e.name.lastIndexOf(' [')));assert.equal(d.system.source.rules,'2014');assert.equal(d.system.source.custom,e.url);assert.equal(d.system.rarity,e.rarity);assert.equal(d.system.attunement,e.attunement);assert.match(e.sha256,/^[a-f0-9]{64}$/);assert.ok(d.system.weight.value>0&&d.system.price.value>0);assert.equal(folders.get(d.folder).name,'Обувь');assert.equal(folders.get(folders.get(d.folder).folder).name,'Сумка грифона — книга 2');}
const plain=o=>o&&Object.getPrototypeOf(o)===Object.prototype,clone=o=>Array.isArray(o)?o.map(clone):o instanceof Set?new Set(o):plain(o)?Object.fromEntries(Object.entries(o).map(([k,v])=>[k,clone(v)])):o;
const get=(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o),set=(o,p,v)=>{const a=p.split('.'),last=a.pop();a.reduce((v,k)=>v[k]??={},o)[last]=v;};
function merge(a,b,{inplace=true}={}){if(!inplace)a=clone(a);for(const[k,v]of Object.entries(b??{})){if(k.includes('.'))set(a,k,clone(v));else if(plain(v)){if(!plain(a[k]))a[k]={};merge(a[k],v);}else a[k]=clone(v);}return a;}
const flat=(o,p='',r={})=>{for(const[k,v]of Object.entries(o)){const a=p?`${p}.${k}`:k;if(plain(v))flat(v,a,r);else r[a]=v;}return r;};
class Collection extends Map{[Symbol.iterator](){return this.values();}find(f){return[...this].find(f);}some(f){return[...this].some(f);}filter(f){return[...this].filter(f);}}
const world=new Map(),gm={id:'gm',isGM:true};let serial=0,die=2,rolls=0,cancel=false,edit=null,failPublish=false,failWrite=false;
globalThis.foundry={utils:{getProperty:get,setProperty:set,flattenObject:flat,deepClone:clone,mergeObject:merge,isEmpty:o=>!Object.keys(o).length,getType:o=>typeof o==='function'?'function':Array.isArray(o)?'Array':plain(o)?'Object':o?.constructor?.name,expandObject:o=>merge({},o),randomID:()=>`B${String(++serial).padStart(15,'0')}`}};
let itemWriteHook=null,beforePublish=null;
globalThis.game={user:{...gm,isActiveGM:true},users:{activeGM:gm},actors:[],scenes:[],messages:new Collection(),time:{worldTime:1000},settings:{get:()=>false},i18n:{localize:s=>s,format:s=>s}};
globalThis.ui={notifications:{warn(){},error(){}}};globalThis.fromUuidSync=u=>world.get(u);globalThis.fromUuid=async u=>world.get(u);globalThis.TargetsField={getDescriptors:()=>[]};globalThis.UsesField={recoverUses:nativeRecoverUses};globalThis._loc=s=>s;globalThis.formatNumber=String;globalThis.ConsumptionError=class extends Error{};Number.isNumeric=n=>typeof n==='number'&&Number.isFinite(n);Math.clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
class BasicRoll{constructor(formula){this.formula=formula;}async evaluate(){rolls++;this.total=die;this._evaluated=true;return this;}static replaceFormulaData(s,d){return String(s??'').replace(/@([\w.]+)/g,(_,p)=>get(d,p)??0);}}
globalThis.CONFIG={Dice:{BasicRoll},DND5E:{activityActivationTypes:{action:{consume:{property:'attributes.actions.action'}},bonus:{consume:{property:'attributes.actions.bonus'}}},movementUnits:{ft:{},m:{}}}};globalThis.dnd5e={utils:{defaultUnits:()=> 'ft',convertLength:(n,_from,to)=>to==='m'?n*0.3:n}};
globalThis.Hooks={call(name,...a){if(['dnd5e.preUseActivity','dnd5e.preActivityConsumption'].includes(name))return canUseHomeward(...a)!==false&&canUseBoots(...a)!==false&&canUseGriffonItem(...a)!==false&&canUseGriffonTwo(...a)!==false;if(name==='dnd5e.activityConsumption')return!cancel;if(name==='dnd5e.postActivityConsumption'){recordGriffonCooldown(...a);recordHomewardConsumption(...a);}return true;},callAll(){}};
const allTokens=()=>[...game.scenes].flatMap(s=>[...s.tokens]);
const usage=u=>{const x={...clone(u),max:Number(u.max)||0};Object.defineProperty(x,'value',{get(){return this.max-this.spent;}});return x;};
class Dialog{static async create(a,c){await edit?.(a,c);}}
class Item{
 constructor(raw,actor){Object.assign(this,clone(raw),{id:raw._id,actor,isOwner:true,isEmbedded:true,uuid:`${actor.uuid}.Item.${raw._id}`});this.system.uses=usage(this.system.uses);this.system.properties=new Set(this.system.properties);const rows=Object.values(this.system.activities);this.system.activities=new Collection(rows.map(a=>[a._id,new Activity(a,this)]));}
 toObject(){const system={...this.system,uses:{...this.system.uses},activities:Object.fromEntries([...this.system.activities].map(a=>[a.id,a.toObject()]))};return clone({_id:this.id,name:this.name,type:this.type,flags:this.flags,system});}clone(){return new Item(this.toObject(),this.actor);}getFlag(ns,k){return this.flags[ns]?.[k];}async update(u){if(failWrite)throw Error('write failed');await itemWriteHook?.(this,u);merge(this,u);}
}
class Activity{
 constructor(raw,item){this.raw=clone(raw);Object.assign(this,clone(raw),{id:raw._id,item,actor:item.actor,uuid:`${item.uuid}.Activity.${raw._id}`,metadata:{usage:{dialog:Dialog}}});this.uses=usage(this.uses);this.flags??={};this.consumption.targets=this.consumption.targets.map(c=>({...c,hasZeroCost:()=>false,consume:(cfg,u)=>nativeConsumeItemUses.call({actor:this.actor,item:this.item,activity:this,target:c.target,_usesConsumption:(config,o)=>nativeUsesConsumption.call({resolveCost:async()=>({total:Number(c.value)})},config,o)},cfg,u)}));}
 get canUse(){return true;}get isSpell(){return false;}get requiresSpellSlot(){return false;}get requiresConcentration(){return false;}get canScale(){return false;}getLinkedActivity(){return this.linked;}getRollData(){return this.actor.system;}toObject(){return{...clone(this.raw),uses:{...this.uses}};}
 _prepareUsageConfig(c){return nativeUsageConfig.call(this,c);}_requiresConfigurationDialog(){return true;}async _prepareUsageScaling(){}async _prepareUsageUpdates(c){let u=await nativeUsageUpdates.call(this,c);if(u)u=await prepareGriffonTwoUpdates(this,c,u);if(u)u=prepareBootsUpdates(this,c,u);return u&&prepareHomewardUpdates(this,c,u);}
 consume(c,m){return nativeConsume.call(this,c,m,u=>{nativeMergeUpdates.call(this,u);return apply(this.actor,u);});}_finalizeMessageConfig(c,m,r){return nativeThwackMessageConfig.call(this,c,m,r);}
 async _createUsageMessage(m){await beforePublish?.(this,m);if(failPublish)throw Error('publish failed');const id=`card${++serial}`,card={id,uuid:`ChatMessage.${id}`,type:'usage',flags:m.data.flags??{},system:m.data.system??{},rolls:m.data.rolls??[],author:game.user,whisper:m.data.whisper??[],rollMode:m.rollMode,getAssociatedActivity:()=>this.actor.items.get(this.item.id).system.activities.get(this.id)};world.set(card.uuid,card);game.messages.set(id,card);return card;}async _finalizeUsage(){}_triggerSubsequentActions(){}createConsumedFlag(){return null;}
 use(...args){return homewardUse.call(this,(...home)=>bootsUse.call(this,(...a)=>nativeArcanistUse.call(this,...a),...home),...args);}
}
function apply(actor,u){if(failWrite)throw Error('write failed');const d={actor:getDeltas(actor,u.actor),item:{}};for(const[p,v]of Object.entries(flat(u.actor)))set(actor,p,v);for(const row of u.item){const i=actor.items.get(row._id),values=Object.fromEntries(Object.entries(row).filter(([k])=>k!=='_id'));d.item[i.id]=getDeltas(i,values);merge(i,values);}return d;}
function setup(){world.clear();game.messages.clear();game.scenes=[];rolls=0;die=2;cancel=failPublish=failWrite=false;edit=null;game.time.worldTime=1000;const actor={id:'boots',uuid:'Actor.boots',isOwner:true,flags:{},effects:[],classes:{},items:new Collection(),statuses:new Set(),system:{attributes:{actions:{action:usage({max:1,spent:0}),bonus:usage({max:1,spent:0})}}}};game.actors=[actor];world.set(actor.uuid,actor);const items={};for(const row of evidence.entries){const i=new Item(docs.get(row.key),actor);i.system.equipped=i.system.attuned=true;actor.items.set(i.id,i);world.set(i.uuid,i);for(const a of i.system.activities)world.set(a.uuid,a);items[row.key.split(':').at(-1)]=i;}actor.testUserPermission=u=>['gm','owner'].includes(u?.id);actor.getActiveTokens=()=>allTokens().filter(t=>t.actor===actor);return{actor,...items};}
const command=(i,c)=>i.system.activities.find(a=>a.flags.spikependium.bootCommand===c),refund=async(a,m)=>{await nativeRefund.call(a,m.system.deltas,u=>apply(a.actor,u));m.system.deltas=null;},nextTurn=a=>{a.system.attributes.actions.action.spent=0;a.system.attributes.actions.bonus.spent=0;};

// Region transport below is an API-contract host, not Foundry's proprietary implementation.
let moveCalls=0,createCalls=0,failMove='',failRegion=false,failDelete=false,afterCreate=null;
const warnings=[],errors=[];ui.notifications.warn=m=>warnings.push(m);ui.notifications.error=m=>warnings.push(m);
function actorCopy(a,uuid){const copy={...a,uuid,system:clone(a.system),flags:clone(a.flags),effects:clone(a.effects),items:new Collection()};copy.getActiveTokens=()=>allTokens().filter(t=>t.actor===copy);for(const old of a.items){const i=new Item(old.toObject(),copy);copy.items.set(i.id,i);world.set(i.uuid,i);for(const act of i.system.activities)world.set(act.uuid,act);}world.set(copy.uuid,copy);return copy;}
function token(scene,actor,{linked=true,x=0,y=0,id=`T${++serial}`}={}){const t={id,uuid:`${scene.uuid}.Token.${id}`,parent:scene,actor,x,y,elevation:0,level:'floor',width:1,height:1,isOwner:true,linked,flags:{},object:{controlled:true},getCenterPoint(p={}){return{x:(p.x??this.x)+scene.grid.size/2,y:(p.y??this.y)+scene.grid.size/2};}};scene.tokens.set(id,t);world.set(t.uuid,t);return t;}
class Region{
 constructor(data,scene){Object.assign(this,clone(data));this.id=`R${++serial}`;this.uuid=`${scene.uuid}.Region.${this.id}`;this.parent=scene;this.levels=new Set(this.levels);this.behaviors=new Collection();}
 async setFlag(ns,p,v){set(this,`flags.${ns}.${p}`,clone(v));}
 async createEmbeddedDocuments(type,data){assert.equal(type,'RegionBehavior');for(const d of data){assert.equal(d.type,'teleportToken');assert.equal(d.system.destinations.length,1);this.behaviors.set(`B${++serial}`,clone(d));}return [...this.behaviors];}
 async delete(){if(failDelete)throw Error('region delete failed');this.parent.regions.delete(this.id);world.delete(this.uuid);}
 async teleportTokens(tokens,options){moveCalls++;assert.equal(options.placement,'random');assert.equal(options.snap,true);assert.equal(options.avoidOccupied,true);assert.equal(options.level,'floor');const map=new Map();if(failMove==='before')throw Error('core move failed');for(const t of tokens){const point=this.shapes[0];if(t.parent===this.parent){t.x=point.x-this.parent.grid.size/2;t.y=point.y-this.parent.grid.size/2;merge(t,options.updateData.get(t));map.set(t,t);}else{const actor=t.linked?t.actor:actorCopy(t.actor,`${this.parent.uuid}.Token.new.Actor.${t.actor.id}`),moved=token(this.parent,actor,{linked:t.linked,x:point.x-this.parent.grid.size/2,y:point.y-this.parent.grid.size/2});moved.flags=clone(t.flags);merge(moved,options.updateData.get(t));t.parent.tokens.delete(t.id);world.delete(t.uuid);map.set(t,moved);}}if(failMove==='after')throw Error('core completed but reply failed');return map;}
}
function scene(name,units='ft'){const s={id:name,uuid:`Scene.${name}`,grid:{size:100,distance:units==='ft'?5:1.5,units},levels:new Collection([['floor',{id:'floor'}]]),tokens:new Collection(),regions:new Collection(),async createEmbeddedDocuments(type,data){assert.equal(type,'Region');if(failRegion)throw Error('region create failed');const out=[];for(const d of data){createCalls++;const r=new Region(d,this);this.regions.set(r.id,r);world.set(r.uuid,r);out.push(r);}await afterCreate?.(out);return out;}};game.scenes.push(s);world.set(s.uuid,s);return s;}
function homeSetup(options={}){const s=setup();itemWriteHook=beforePublish=null;game.users.filter=fn=>[gm,{id:'owner'},{id:'outsider'}].filter(fn);game.user={...gm,isActiveGM:true};game.users.activeGM=gm;game.combat=null;game.combats=new Collection();moveCalls=createCalls=0;failMove='';failRegion=failDelete=false;afterCreate=null;warnings.length=errors.length=0;const a=scene('origin'),b=scene('destination',options.units??'ft'),t=token(a,s.actor,options);globalThis.canvas={scene:a};if(options.linked===false){game.actors=[];s.actor.uuid=`${a.uuid}.Token.${t.id}.Actor.${s.actor.id}`;for(const i of s.actor.items){i.uuid=`${s.actor.uuid}.Item.${i.id}`;world.set(i.uuid,i);for(const act of i.system.activities){act.uuid=`${i.uuid}.Activity.${act.id}`;world.set(act.uuid,act);}}}return{...s,a,b,t,i:s.homeward};}
const homeAction=(i,c)=>i.system.activities.find(a=>a.flags.spikependium.homewardCommand===c),request=i=>Object.values(i.flags.spikependium.homeRequests).at(-1),savedCircle=i=>world.get(i.flags.spikependium.homeAnchor);
async function save(s){nextTurn(s.actor);const result=await homeAction(s.i,'anchor').use();assert.ok(result?.message);assert.equal(request(s.i).state,'done');return result;}
const logError=console.error;console.error=(...e)=>errors.push(e);
try{
{
 const s=homeSetup();const saved=await save(s),circle=savedCircle(s.i);assert.equal(circle.parent,s.a);assert.equal(circle.shapes[0].x,50);assert.equal(circle.shapes[0].radius,100,'permanent circle uses the original ten-foot diameter');assert.equal(circle.behaviors.size,0,'normal circles cannot enter this destination through a behavior on the permanent circle');assert.deepEqual(saved.message.whisper,['gm','owner']);assert.equal(saved.message.rollMode,'gm');s.t.x=500;nextTurn(s.actor);const result=await homeAction(s.i,'return').use();assert.ok(result?.message);assert.equal(moveCalls,1);assert.equal(rolls,1);assert.equal(result.message.rolls[0].formula,'1d3');assert.equal(s.t.x,0);assert.equal(request(s.i).state,'done');const portal=[...s.a.regions].find(r=>r!==circle);assert.equal(portal.shapes[0].radius,50,'return portal has a five-foot diameter');assert.deepEqual([...portal.behaviors][0].system.destinations,[circle.uuid]);await resumeHomeward();await resumeHomeward();assert.equal(moveCalls,1);assert.equal(rolls,1);nextTurn(s.actor);assert.equal(await homeAction(s.i,'return').use(),undefined);assert.equal(moveCalls,1);game.time.worldTime+=6;await resumeHomeward();assert.equal(s.a.regions.size,1);assert.equal(s.i.system.uses.spent,1);game.time.worldTime+=2*86400-6;await syncGriffonTwo();assert.equal(s.i.system.uses.spent,0);
}
{
 const s=homeSetup();await save(s);const old=savedCircle(s.i);s.t.x=300;await save(s);assert.notEqual(savedCircle(s.i),old);assert.equal(world.has(old.uuid),false);assert.equal(s.a.regions.size,1);s.t.x=600;nextTurn(s.actor);await homeAction(s.i,'return').use();assert.equal(s.t.x,300);s.t.x=900;await save(s);assert.equal(savedCircle(s.i).shapes[0].x,950,'first word remains available while return cooldown is active');assert.equal(s.i.system.uses.spent,1);
}
{
 const s=homeSetup();await save(s);await savedCircle(s.i).delete();nextTurn(s.actor);assert.equal(await homeAction(s.i,'return').use(),undefined);assert.equal(s.i.system.uses.spent,0);assert.equal(s.actor.system.attributes.actions.action.spent,0);assert.equal(rolls,0);assert.equal(moveCalls,0);assert.equal(s.a.regions.size,0,'a washed circle does not recreate itself');
}
{
 const s=homeSetup();cancel=true;await homeAction(s.i,'anchor').use();assert.equal(createCalls,0);assert.equal(s.i.flags.spikependium.homeKey,undefined);cancel=false;await save(s);nextTurn(s.actor);cancel=true;await homeAction(s.i,'return').use();assert.equal(moveCalls,0);assert.equal(s.i.system.uses.spent,0);cancel=false;edit=()=>savedCircle(s.i).delete();nextTurn(s.actor);await homeAction(s.i,'return').use();assert.equal(moveCalls,0);assert.equal(s.i.system.uses.spent,0,'source lost in the dialog cannot consume the item');
}
{
 const s=homeSetup();game.user={id:'owner',isGM:false,isActiveGM:false};const result=await homeAction(s.i,'anchor').use();assert.ok(result.message);assert.equal(createCalls,0);await refund(homeAction(s.i,'anchor'),result.message);game.user={...gm,isActiveGM:true};await resumeHomeward();assert.equal(createCalls,0);assert.equal(request(s.i).state,'cancelled');
}
{
 const s=homeSetup();game.user={id:'owner',isGM:false,isActiveGM:false};const result=await homeAction(s.i,'anchor').use();game.messages.delete(result.message.id);world.delete(result.message.uuid);game.user={...gm,isActiveGM:true};await forgetHomewardCard(result.message);await resumeHomeward();assert.equal(createCalls,0);assert.equal(request(s.i).state,'manual');assert.ok(warnings.length);
}
{
 const s=homeSetup();game.users.activeGM=null;game.user={id:'owner',isGM:false,isActiveGM:false};assert.equal(await homeAction(s.i,'anchor').use(),undefined);assert.equal(s.actor.system.attributes.actions.action.spent,0);assert.equal(createCalls,0);
}
for(const linked of [true,false]){
 const s=homeSetup({linked}),original=s.actor;s.actor.system.attributes.hp={value:11,max:37};s.actor.flags.thirdParty={value:9};s.actor.effects=[{name:'Persistent effect',flags:{external:true}}];canvas.scene=s.b;s.t.parent.tokens.delete(s.t.id);world.delete(s.t.uuid);s.t.parent=s.b;s.t.uuid=`${s.b.uuid}.Token.${s.t.id}`;s.b.tokens.set(s.t.id,s.t);world.set(s.t.uuid,s.t);await save(s);const circle=savedCircle(s.i);assert.equal(circle.parent,s.b);s.t.parent.tokens.delete(s.t.id);world.delete(s.t.uuid);s.t.parent=s.a;s.t.uuid=`${s.a.uuid}.Token.${s.t.id}`;s.a.tokens.set(s.t.id,s.t);world.set(s.t.uuid,s.t);canvas.scene=s.a;nextTurn(s.actor);const result=await homeAction(s.i,'return').use();assert.ok(result.message);assert.equal(moveCalls,1);assert.equal(s.a.tokens.size,0);assert.equal(s.b.tokens.size,1);const arrived=[...s.b.tokens][0],i=arrived.actor.items.get(s.i.id);assert.equal(linked?arrived.actor===original:arrived.actor!==original,true);assert.equal(arrived.actor.system.attributes.hp.value,11);assert.equal(arrived.actor.flags.thirdParty.value,9);assert.deepEqual(arrived.actor.effects,[{name:'Persistent effect',flags:{external:true}}]);assert.equal(i.system.uses.spent,1);assert.equal(request(i).state,'done');await resumeHomeward();assert.equal(moveCalls,1,'copied ActorDelta request state cannot teleport a second time');
}
{
 const s=homeSetup();await save(s);s.t.x=400;nextTurn(s.actor);failMove='before';await homeAction(s.i,'return').use();assert.equal(request(s.i).state,'manual');assert.equal(s.t.x,400);failMove='';await resumeHomeward();assert.equal(moveCalls,1,'ambiguous failed movement never repeats automatically');
}
{
 const s=homeSetup();await save(s);s.t.x=400;nextTurn(s.actor);failMove='after';await homeAction(s.i,'return').use();assert.equal(s.t.x,0);assert.equal(request(s.i).state,'moving');failMove='';await resumeHomeward();assert.equal(request(s.i).state,'done');assert.equal(moveCalls,1,'a persisted arrival marker settles the same use without another teleport');assert.equal(rolls,1);
}
{
 const s=homeSetup();await save(s);s.t.x=400;nextTurn(s.actor);let failed=false;itemWriteHook=(i,u)=>{if(!failed&&Object.entries(u).some(([k,v])=>k.endsWith('.state')&&v==='done'&&request(i).command==='return')){failed=true;throw Error('final write failed');}};await homeAction(s.i,'return').use();assert.equal(request(s.i).state,'moving');itemWriteHook=null;game.time.worldTime+=100;await resumeHomeward();assert.equal(request(s.i).state,'done');const until=Object.values(s.i.flags.spikependium.griffonCooldowns).at(-1).until;assert.equal(until,1000+2*86400,'settling a delayed receipt must not restart the cooldown');assert.equal(moveCalls,1);assert.equal(rolls,1);
}
{
 const s=homeSetup();await save(s);const old=savedCircle(s.i);s.t.x=200;failDelete=true;await save(s).catch(()=>{});assert.equal(s.a.regions.size,2);assert.equal(request(s.i).state,'anchorCleanup');failDelete=false;await resumeHomeward();assert.equal(request(s.i).state,'done');assert.equal(s.a.regions.size,1);assert.equal(world.has(old.uuid),false);assert.equal(createCalls,2);
}
{
 const s=homeSetup();await save(s);s.t.x=300;game.combat={id:'combat',started:true,round:2,turn:0,turns:[{id:'wearer',actor:s.actor},{id:'other',actor:{uuid:'Actor.other'}}]};game.combats.set('combat',game.combat);nextTurn(s.actor);await homeAction(s.i,'return').use();const portal=[...s.a.regions].find(r=>r.flags.spikependium.homeward.kind==='portal');game.combat.turn=1;await resumeHomeward();assert.ok(s.a.regions.get(portal.id));game.combat.round=3;game.combat.turn=0;await resumeHomeward();assert.ok(s.a.regions.get(portal.id),'portal lasts through the wearer’s next turn');game.combat.turn=1;await resumeHomeward();assert.equal(s.a.regions.get(portal.id),undefined);
}
{
 const s=homeSetup({units:'m'});canvas.scene=s.b;s.t.parent.tokens.delete(s.t.id);s.t.parent=s.b;s.b.tokens.set(s.t.id,s.t);await save(s);assert.equal(savedCircle(s.i).shapes[0].radius,100,'ten-foot destination diameter converts to scene meters');
}
{
 const s=homeSetup();failPublish=true;await assert.rejects(()=>homeAction(s.i,'anchor').use(),/publish failed/);assert.equal(createCalls,0);assert.equal(s.actor.system.attributes.actions.action.spent,1);failPublish=false;await resumeHomeward();assert.equal(request(s.i).state,'pending');assert.equal(createCalls,0,'missing publication proof cannot create a hidden circle');assert.ok(warnings.length);
}
{
 const s=homeSetup();await save(s);s.t.x=300;nextTurn(s.actor);game.user={id:'owner',isGM:false,isActiveGM:false};const result=await homeAction(s.i,'return').use();assert.equal(moveCalls,0);await refund(homeAction(s.i,'return'),result.message);game.user={...gm,isActiveGM:true};await resumeHomeward();assert.equal(moveCalls,0);assert.equal(request(s.i).state,'cancelled');await syncGriffonTwo();assert.equal(s.i.system.uses.spent,0);
}
{
 const s=homeSetup();await save(s);const copy=actorCopy(s.actor,'Actor.copied');game.actors.push(copy);s.t.x=300;nextTurn(s.actor);assert.equal(await homeAction(s.i,'return').use(),undefined,'two copied physical identities require GM resolution');assert.equal(moveCalls,0);assert.equal(s.i.system.uses.spent,0);
}
{
 const s=homeSetup();game.user={id:'owner',isGM:false,isActiveGM:false};const result=await homeAction(s.i,'anchor').use();result.message.author={id:'outsider'};game.user={...gm,isActiveGM:true};await resumeHomeward();assert.equal(createCalls,0);assert.equal(request(s.i).state,'pending','a foreign card cannot authorize or cancel another owner’s pending scene mutation');await forgetHomewardCard(result.message);assert.equal(request(s.i).state,'pending');result.message.author=gm;await resumeHomeward();assert.equal(request(s.i).state,'done');assert.equal(createCalls,1);
}
{
 const s=homeSetup();beforePublish=async()=>{await resumeHomeward();assert.equal(request(s.i).state,'pending','remote item updates before the usage card cannot abort the transaction');};afterCreate=()=>resumeHomeward();await save(s);s.t.x=200;nextTurn(s.actor);await homeAction(s.i,'return').use();assert.equal(request(s.i).state,'done');assert.equal(createCalls,2);assert.equal(moveCalls,1);assert.equal(rolls,1,'reentrant scene notifications do not duplicate a paid return');
}
{
 const s=homeSetup();await save(s);game.combat={id:'combat',started:true,round:1,turn:0,turns:[{id:'wearer',actor:s.actor}]};game.combats.set('combat',game.combat);s.t.x=200;nextTurn(s.actor);await homeAction(s.i,'return').use();const portal=[...s.a.regions].find(r=>r.flags.spikependium.homeward.kind==='portal');game.combats.delete('combat');await resumeHomeward();assert.ok(s.a.regions.get(portal.id),'deleting combat does not instantly erase a newly opened portal');game.time.worldTime+=6;await resumeHomeward();assert.equal(s.a.regions.get(portal.id),undefined);
}
{
 const s=homeSetup();await save(s);s.t.x=200;nextTurn(s.actor);await homeAction(s.i,'return').use();const model={parent:s.i,uses:s.i.system.uses,activities:s.i.system.activities};const recovered=await recoverBootsPeriods.call(model,p=>nativeBeltRecovery.call(model,p),new Map([['lr',1],['dawn',1]]));await s.i.update(recovered.updates);await syncGriffonTwo();assert.equal(s.i.system.uses.spent,1,'rest and dawn cannot bypass the real multi-day cooldown');
}
{
 const s=homeSetup();for(const plan of [undefined,{}, {command:'anchor'}, {command:'anchor',key:'bad',nonce:'bad',frame:{}}])assert.equal(canUseHomeward(homeAction(s.i,'anchor'),{spikependium:{homeward:plan}}),false,'malformed external configurations fail before any mutation');assert.equal(createCalls,0);
}
}finally{console.error=logError;}
console.log('Homeward boots: paid native anchor/return, exact linked regions and five-foot portal, cross-scene core transport contract and synthetic actor state, private receipts, cooldown/refund/cancel, washed circle, duplicate sources, interrupted arrival/cleanup and next-turn expiry passed. Core Region internals are mocked; live Foundry not run.');
