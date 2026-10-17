import fs from 'node:fs';import assert from 'node:assert/strict';
import {prepareSoothingHealing,finalizeSoothingHealing,soothingEvaluate,soothingDie} from '../scripts/soothing-beacon.mjs';
import {prepareFamiliarToken} from '../scripts/arcana-familiar.mjs';
import {nativeSpellMightBuildConfigure} from './data/dnd5e-arcana-native.mjs';
import {nativeGriffonRollHitDie} from './data/dnd5e-griffon-native.mjs';
import {nativeBuildEvaluate} from './data/dnd5e-reaction-native.mjs';
import {nativeMagusASIApply} from './data/dnd5e-magus-native.mjs';
import {nativeApplyDamage,nativeCalculateDamage} from './data/dnd5e-guardian-native.mjs';
const docs=fs.readdirSync('packs/_source/feats').map(f=>JSON.parse(fs.readFileSync(`packs/_source/feats/${f}`,'utf8'))),doc=docs.find(d=>d.flags?.spikependium?.key==='feat:au-soothing-familiar');assert.ok(doc);
assert.equal(doc.name,'Утешающий фамильяр');assert.equal(doc.system.source.book,'AU');assert.equal(doc.system.source.page,'32');assert.equal(doc.system.prerequisites.level,4);assert.deepEqual(doc.system.prerequisites.items,['feat:familiar-friend']);assert.ok(doc.folder);
const asi=doc.system.advancement[0];assert.equal(asi.configuration.points,1);assert.equal(asi.configuration.cap,1);assert.equal(asi.configuration.max,20);assert.deepEqual(asi.configuration.locked,[]);assert.equal(doc.effects[0].transfer,true);assert.equal(doc.effects[0].flags.spikependium.soothingBeacon,true);
const clone=structuredClone,get=(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o),set=(o,p,v)=>{const path=p.split('.'),key=path.pop();path.reduce((v,k)=>v[k]??={},o)[key]=v;};
const merge=(a,b)=>{for(const[p,v]of Object.entries(b)){if(p.includes('.'))set(a,p,clone(v));else if(v&&Object.getPrototypeOf(v)===Object.prototype)merge(a[p]??={},v);else a[p]=clone(v);}return a;};
const list=a=>Object.assign(a,{get(id){return this.find(i=>i.id===id);},has(id){return !!this.get(id);}});
String.prototype.capitalize??=function(){return this.charAt(0).toUpperCase()+this.slice(1);};Math.clamp??=(n,min,max)=>Math.min(max,Math.max(min,n));Number.isNumeric??=v=>Number.isFinite(Number(v));
let world,serial=0,select='first',cancel=false,afterChoice=null,postConfigure=null,notices=[],posted=[],extraDice=0;
globalThis.fromUuidSync=id=>world.get(id);globalThis.ui={notifications:{warn:m=>notices.push(m),error:m=>notices.push(m)}};
globalThis.foundry={utils:{getProperty:get,setProperty:set,deepClone:clone,isEmpty:o=>!o||!Object.keys(o).length,mergeObject:merge},applications:{instances:new Map()},data:{fields:{StringField:class{constructor(o){Object.assign(this,o);}}}}};
class Die{
 constructor(number,faces,root,modifiers=[]){Object.assign(this,{number,faces,_root:root,modifiers:[...modifiers],_evaluated:false});}
 async evaluate(){return soothingDie.call(this,async()=>{const floor=Math.max(0,...this.modifiers.filter(m=>/^min\d+$/.test(m)).map(m=>Number(m.slice(3))));this.total=Array.from({length:this.number},(_,i)=>Math.max(i%2+1,floor)).reduce((n,v)=>n+v,0);this._evaluated=true;return this;});}
}
// Core dice host preserves the documented _root contract; the dnd5e roll/HD/HP workflows are pinned native bodies.
class Basic{
 constructor(formula,data={},options={}){this.formula=formula;this.data=data;this.options=options;this._evaluated=false;this.nested=formula.startsWith('max(');this.inner=[];for(const m of formula.matchAll(/(\d+)d(\d+)/g))this.inner.push(new Die(+m[1],+m[2],this,options.modifiers));}
 get dice(){return this.nested&&!this._evaluated?[]:this.inner;}
 static getMessageMode(){return 'public';}static applyKeybindings(_c,d){d.configure??=true;}
 static fromConfig(c){return new this(c.parts.join(' + '),c.data??{},c.options??{});}
 async evaluate(){for(const d of this.inner)await d.evaluate();let i=0;const expression=this.formula.replace(/\d+d\d+/g,()=>String(this.inner[i++].total)).replace(/@([\w.]+)/g,(_,p)=>String(get(this.data,p)));
  const values=(this.nested?expression.slice(expression.indexOf(',')+1,-1):expression).match(/[+-]?\s*\d+/g)??[];this.total=values.reduce((n,v)=>n+Number(v.replaceAll(' ','')),0);if(this.nested)this.total=Math.max(Number(/^max\((\d+)/.exec(expression)[1]),this.total);this._evaluated=true;return this;}
 static async build(c,d={},m={}){const rolls=await nativeSpellMightBuildConfigure.call(this,c,d,m);await soothingEvaluate.call(this,async(...args)=>{await nativeBuildEvaluate(...args);if(extraDice){const side=new Die(1,6,new Basic('1d6'));await side.evaluate();assert.deepEqual(side.modifiers,[]);}},rolls,c,m);if(rolls.length)posted.push(clone(m));return rolls;}
}
class Damage extends Basic{}
class Dialog{
 constructor(config){this.config=config;}async _prepareConfigurationContext(c){return c;}_buildConfig(r){return r;}
 static async configure(c,d,m){if(cancel)return [];const view=new this(c),ctx=await view._prepareConfigurationContext({fields:[]});const field=ctx.fields.find(f=>f.name==='spikependium.soothingBeacon');assert.ok(field);assert.equal(field.value,'none');
  const key=select==='first'?Object.keys(field.field.choices).find(k=>k!=='none'):select;
  const rolls=c.rolls.map((r,i)=>this.rollClass.fromConfig(view._buildConfig(clone(r),new Map([['spikependium.soothingBeacon',key]]),i)));
  if(afterChoice){const fn=afterChoice;afterChoice=null;fn();}return rolls;}
}
Basic.DefaultConfigurationDialog=class extends Dialog{static rollClass=Basic;};Damage.DefaultConfigurationDialog=class extends Dialog{static rollClass=Damage;};
globalThis.CONFIG={Dice:{BasicRoll:Basic,DamageRoll:Damage},DND5E:{damageTypes:{fire:{}},healingTypes:{healing:{},temphp:{}}}};
globalThis.Hooks={call(n,...args){if(['dnd5e.preRollDamageV2','dnd5e.preRollHitDieV2'].includes(n))return prepareSoothingHealing(...args);if(['dnd5e.postDamageRollConfiguration','dnd5e.postHitDieRollConfiguration'].includes(n)){const ok=finalizeSoothingHealing(...args);if(postConfigure){const fn=postConfigure;postConfigure=null;fn();}return ok;}},callAll(){}};
globalThis.ChatMessage={implementation:{getSpeaker:({actor})=>({actor:actor.id})}};
function actor(id){const a={id,uuid:`Actor.${id}`,documentName:'Actor',isOwner:true,items:list([]),effects:[],flags:{},statuses:new Set(),system:{isCreature:true,details:{level:4},abilities:{con:{mod:2}},attributes:{hp:{value:5,max:20,effectiveMax:20,temp:0,tempmax:0}},_source:{attributes:{hp:{tempmax:0}}},traits:{ci:{value:new Set()}}},testUserPermission:()=>true,changeHasEffect:()=>false,changeIsIgnored:()=>false};
 Object.defineProperty(a.system.attributes.hp,'damage',{get(){return this.max-this.value;}});a.getRollData=()=>({abilities:clone(a.system.abilities)});a.update=async u=>{for(const[p,v]of Object.entries(u))set(a,p,v);};a.calculateDamage=(d,o)=>nativeCalculateDamage.call(a,d,o);a.applyDamage=(d,o)=>nativeApplyDamage.call(a,d,o);
 const cls={system:{hd:{value:2,spent:0,denomination:'d8'}},async update(u){this.system.hd.spent=u['system.hd.spent'];this.system.hd.value=2-this.system.hd.spent;}};a.system.attributes.hd={classes:[cls]};a.rollHitDie=(...args)=>nativeGriffonRollHitDie.call(a,...args);world.set(a.uuid,a);return a;}
function setup(units='ft'){world=new Map();serial=0;select='first';cancel=false;afterChoice=postConfigure=null;posted=[];notices=[];extraDice=0;const gm={id:'gm',isGM:true,isActiveGM:true,active:true},users=[gm,{id:'owner',active:true}];users.activeGM=gm;
 globalThis.game={user:gm,users,actors:[],scenes:[],messages:list([]),time:{worldTime:100}};globalThis.canvas={ready:true};
 const scale=units==='m'?.3048:1,scene={uuid:'Scene.test',tokens:list([]),grid:{units,getCenterPoint:o=>o,measurePath:([a,b])=>({distance:Math.hypot(a.x-b.x,a.y-b.y,a.elevation-b.elevation)})}};
 const caster=actor('caster'),healer=actor('healer'),familiar=actor('familiar'),recipient=actor('recipient');game.actors.push(caster,healer,familiar,recipient);game.scenes.push(scene);
 const token=(id,a,x)=>{const t={uuid:`${scene.uuid}.Token.${id}`,name:id,actor:a,parent:scene,x:x*scale,y:0,elevation:0,level:'ground',hidden:false,getOccupiedGridSpaceOffsets(){return[{x:this.x,y:this.y}];}};world.set(t.uuid,t);scene.tokens.push(t);return t;};
 const owner=token('owner',caster,120),source=token('familiar',familiar,0),roller=token('healer',healer,5),remote=token('recipient',recipient,500);
 const spell={type:'spell',uuid:`${caster.uuid}.Item.familiar`,actor:caster,system:{identifier:'find-familiar'}};world.set(spell.uuid,spell);familiar.flags.dnd5e={summon:{origin:spell.uuid}};
 const feat={...clone(doc),id:doc._id,uuid:`${caster.uuid}.Item.${doc._id}`,actor:caster};caster.items.push(feat);
 const beacon={...clone(doc.effects[0]),uuid:`${feat.uuid}.ActiveEffect.${doc.effects[0]._id}`,get active(){return !this.disabled&&!this.suppressed;}};caster.effects.push(beacon);world.set(beacon.uuid,beacon);
 globalThis.dnd5e={settings:{rulesVersion:'modern'},utils:{getSceneTargets:a=>scene.tokens.filter(t=>t.actor.uuid===a.uuid),convertLength:(n,from,to)=>from===to?n:from==='m'?n/.3048:n*.3048}};
 return{caster,healer,familiar,recipient,owner,source,roller,remote,scene,spell,feat,beacon,scale};}
async function healing(s,{types=['healing'],modifiers=[],parts=['2d4','2']}={}){const c={subject:{actor:s.healer},hookNames:['damage'],rolls:types.map(type=>({parts,data:{},options:{type,modifiers}}))};return Damage.build(c,{configure:false},{data:{type:'healing'}});}
for(const ability of ['str','dex','con','int','wis','cha']){const s=setup(),a=s.healer;a.system.abilities={[ability]:{value:19,max:20}};a.system._source.abilities=clone(a.system.abilities);a.updateSource=u=>{for(const[p,v]of Object.entries(u))set(a,p,v);};const host={actor:a,configuration:asi.configuration,value:{},allowFeat:false,canImprove:()=>true,updateSource(u){Object.assign(this,u);}};await nativeMagusASIApply.call(host,0,{assignments:{[ability]:1}},{initial:true});assert.equal(a.system.abilities[ability].value,20);}
let s=setup(),rolls=await healing(s);assert.equal(rolls[0].total,8);assert.deepEqual(rolls[0].dice[0].modifiers,['min3']);await s.recipient.applyDamage([{type:'healing',value:rolls[0].total}]);assert.equal(s.recipient.system.attributes.hp.value,13,'healed recipient need not be inside the emanation');
s=setup();rolls=await healing(s,{types:['healing','fire','temphp']});assert.deepEqual(rolls.map(r=>r.total),[8,5,5]);assert.deepEqual(rolls[1].dice[0].modifiers,[]);assert.deepEqual(rolls[2].dice[0].modifiers,[]);
s=setup();rolls=await s.healer.rollHitDie();assert.equal(rolls[0].total,5);assert.equal(rolls[0].inner[0].modifiers[0],'min3');assert.equal(s.healer.system.attributes.hp.value,10);assert.equal(s.healer.system.attributes.hd.classes[0].system.hd.spent,1);
s=setup();s.healer.system.abilities.con.mod=-5;rolls=await s.healer.rollHitDie();assert.equal(rolls[0].total,1,'native outer max(1, die + CON) is preserved');
s=setup();select='none';rolls=await s.healer.rollHitDie();assert.equal(rolls[0].total,3);assert.deepEqual(rolls[0].inner[0].modifiers,[]);
s=setup();cancel=true;assert.equal(await s.healer.rollHitDie(),null);assert.equal(s.healer.system.attributes.hp.value,5);assert.equal(s.healer.system.attributes.hd.classes[0].system.hd.spent,0);
s=setup();rolls=await healing(s,{modifiers:['min5']});assert.equal(rolls[0].total,12);assert.deepEqual(rolls[0].dice[0].modifiers,['min5']);
for(const change of [s=>s.roller.x=5.01*s.scale,s=>s.owner.x=120.01*s.scale,s=>s.roller.elevation=6*s.scale,s=>s.source.level='upper',s=>s.source.parent={tokens:[]},s=>s.familiar.system.attributes.hp.value=0,s=>s.familiar.statuses.add('dead'),s=>s.beacon.disabled=true,s=>s.beacon.suppressed=true,s=>s.beacon.duration.remaining=0,s=>s.caster.items.splice(0),s=>world.delete(s.spell.uuid)]){
 s=setup();change(s);rolls=await healing(s);assert.equal(rolls[0].total,5);assert.deepEqual(rolls[0].dice[0].modifiers,[]);
}
for(const change of [s=>s.source.x=30,s=>s.beacon.disabled=true]){s=setup();afterChoice=()=>change(s);assert.equal((await healing(s)).length,0);assert.equal(s.healer.system.attributes.hp.value,5);}
s=setup();postConfigure=()=>s.source.x=30;assert.equal((await healing(s)).length,0,'the beacon is checked immediately before evaluation too');
s=setup('m');rolls=await healing(s);assert.equal(rolls[0].total,8,'metric boundary conversions preserve both radii');
s=setup();s.caster.statuses.add('unconscious');rolls=await healing(s);assert.equal(rolls[0].total,8,'no unwritten consciousness restriction is added');
s=setup();s.source.hidden=true;rolls=await healing(s);assert.equal(rolls[0].total,8);assert.equal(posted[0].rollMode,'blind');assert.deepEqual(posted[0].data.whisper,['gm']);
s=setup();game.user=game.users[1];s.source.hidden=true;rolls=await healing(s);assert.equal(rolls[0].total,5);assert.equal(posted[0].data.flags?.spikependium?.soothingBeacon,undefined);
s=setup();game.user=game.users[1];s.caster.testUserPermission=()=>false;assert.equal((await healing(s))[0].total,5);
s=setup();const config={actor:s.familiar,actorUpdates:{effects:[]}},summon={type:'summon',actor:s.caster,item:s.spell};prepareFamiliarToken(summon,{},config);merge(s.familiar,config.actorUpdates);world.delete(s.spell.uuid);assert.equal((await healing(s))[0].total,8,'native ownership metadata survives cache deletion');
s=setup();world.delete(s.spell.uuid);s.familiar.effects.push({flags:{spikependium:{familiarFriendHP:{caster:s.caster.uuid}}},system:{origin:{activity:`${s.spell.uuid}.Activity.summon`}}});assert.equal((await healing(s))[0].total,8,'previous familiar-friend metadata remains compatible');
s=setup();extraDice=1;assert.equal((await healing(s))[0].total,8);const standalone=new Die(1,8,{options:clone(posted[0].data.flags)});await standalone.evaluate();assert.deepEqual(standalone.modifiers,[],'serialized flags cannot bless unrelated dice');
s=setup();const second={...s.source,uuid:'Scene.test.Token.second'};world.set(second.uuid,second);s.scene.tokens.push(second);assert.equal((await healing(s))[0].total,8,'overlapping beacons never add two minima');
s=setup();world.delete(s.spell.uuid);const r={event:'B'.repeat(16),caster:s.caster.uuid,item:`${s.caster.uuid}.Item.battle`,activity:`${s.caster.uuid}.Item.battle.Activity.cast`,level:2,time:100,end:3700};
s.familiar.flags.spikependium={key:'actor:au-combat-familiar-bruiser'};s.familiar.flags.dnd5e.summon.origin=r.item;s.source.flags={spikependium:{combatFamiliar:r}};s.caster.flags.spikependium={combatFamiliarCurrent:r.event,combatFamiliarCasts:{[r.event]:{...r,active:1,placed:true}}};assert.equal((await healing(s))[0].total,8);game.time.worldTime=3700;assert.equal((await healing(s))[0].total,5);
const main=fs.readFileSync('scripts/spikependium.mjs','utf8');assert.ok(main.includes('foundry.dice.terms.Die.prototype.evaluate'));assert.ok(main.includes('CONFIG.Dice.BasicRoll.buildEvaluate'));assert.ok(main.includes('postHitDieRollConfiguration'));
console.log('Утешающий фамильяр: PDF/ASI/папка, Find Familiar/старые связи/Боевой фамильяр, 5/120 футов/высота/метры/уровни, владелец и приватность; native HD/HP/отмена, вложенный max/CON, лечение без урона/Временных хитов, необязательность/минимум/не-сложение/временный контекст костей: OK.');
