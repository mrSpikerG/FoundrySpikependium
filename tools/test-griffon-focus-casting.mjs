import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prepareFocusCasting, whispersCastingUse, prepareFocusCastingUpdates, recordFocusCasting, focusBladeSuccess,
  chooseFireWandSave, refreshFocusSaves, guardWhispersRoll, restoreWhispersItem, restoreWhispersActivity } from '../scripts/griffon-focus-casting.mjs';
import { prepareFocusUpdates, guardFocusRoll, canUseGriffonFocus } from '../scripts/griffon-foci.mjs';
import { prepareReactionUpdates, recordReactionConsumption, recordReaction } from '../scripts/reactions.mjs';
import { recordOriginSaveWindow } from '../scripts/arcana-save-boost.mjs';
import { canUseGriffonTwo, isGriffonSpellcaster } from '../scripts/griffon-two-items.mjs';
import { nativeConsume, nativeRefund, getDeltas, nativeSaveRollFailure } from './data/dnd5e-reaction-native.mjs';
import { nativeUsageUpdates, nativeUsesConsumption } from './data/dnd5e-monsters-native.mjs';
import { nativeConcentrationData } from './data/dnd5e-concentration-native.mjs';
const data=fs.readdirSync('packs/_source/items').map(f=>JSON.parse(fs.readFileSync(`packs/_source/items/${f}`,'utf8')));
const bases=JSON.parse(fs.readFileSync('tools/data/griffon-focus-bases.json','utf8')).records;
const clone=structuredClone,list=a=>Object.assign(a,{get(id){return this.find(d=>d.id===id);},has(id){return!!this.get(id);}});
const get=(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o);
function set(o,p,v){const keys=p.split('.'),last=keys.pop();const parent=keys.reduce((v,k)=>v[k]??={},o);if(last.startsWith('-='))delete parent[last.slice(2)];else parent[last]=clone(v);}
function merge(o,changes){for(const[p,v]of Object.entries(changes)){if(v&&Object.getPrototypeOf(v)===Object.prototype){const old=get(o,p);if(!old)set(o,p,{});merge(get(o,p),v);}else set(o,p,v);}return o;}
const flat=(o,p='',out={})=>{for(const[k,v]of Object.entries(o)){const name=p?`${p}.${k}`:k;if(v&&Object.getPrototypeOf(v)===Object.prototype)flat(v,name,out);else out[name]=v;}return out;};
let serial=0,die=20,answer,confirm=true,confirmHook,failApply=false,refreshed=[];const world=new Map();
globalThis.fromUuidSync=(uuid,options)=>world.get(uuid?.startsWith('.')?`${options?.relative?.uuid}${uuid}`:uuid);
globalThis.foundry={utils:{getProperty:get,setProperty:set,flattenObject:flat,isEmpty:o=>!Object.keys(o).length,randomID:()=>String(++serial).padStart(16,'0'),escapeHTML:s=>s.replaceAll('"','&quot;'),
  mergeObject:(o,v,{inplace=true}={})=>merge(inplace?o:clone(o),v)},applications:{api:{DialogV2:{async input(){return answer;},async confirm(){await confirmHook?.();return confirm;}}}}};
globalThis.ui={notifications:{warn(){},error(){}},chat:{async updateMessage(card){refreshed.push(card.uuid);}}};
Number.isNumeric=v=>v!==null&&v!==''&&Number.isFinite(Number(v));globalThis._loc=s=>s;
class D20{constructor(total=1,target=10){this.total=total;this.options={target};this._evaluated=true;}get isFailure(){return nativeSaveRollFailure.call(this);}toJSON(){return{total:this.total,options:this.options};}}
globalThis.CONFIG={Dice:{D20Roll:D20,BasicRoll:class{async evaluate(){this.total=die;return this;}}},DND5E:{activityActivationTypes:{action:{},reaction:{}},spellcasting:{spell:{getSpellSlotKey:n=>`spell${n}`}}},specialStatusEffects:{CONCENTRATING:'concentrating'},statusEffects:{concentrating:{id:'concentrating'}}};
globalThis.ActiveEffect={implementation:{getEffectStart:()=>({time:game.time.worldTime})}};
const user={id:'player',isGM:false};
globalThis.game={user,users:list([user]),messages:list([]),combats:[],time:{worldTime:0}};
globalThis.Hooks={call(name,...args){if(name==='dnd5e.postActivityConsumption'){recordFocusCasting(...args);recordReactionConsumption(...args);}return true;}};
function setup(){
 world.clear();game.messages.length=0;game.time.worldTime=0;die=20;answer=undefined;confirm=true;confirmHook=undefined;failApply=false;
 const actor={uuid:'Actor.hero',isOwner:true,flags:{spikependium:{}},statuses:new Set(),effects:list([]),items:list([]),concentration:{effects:new Set()},
  classes:{druid:{system:{levels:5,spellcasting:{progression:'full'}}}},system:{isCreature:true,spells:{spell1:{level:1,value:3},spell3:{level:3,value:3},spell5:{level:5,value:2},spell6:{level:6,value:1}}},testUserPermission:u=>u===user};
 function item(raw,owned=true){
  const d={id:raw._id,uuid:`${actor.uuid}.Item.${raw._id}`,type:raw.type,name:raw.name,actor,isEmbedded:true,_data:clone(raw),
   getFlag(namespace,path){return get(this.flags[namespace],path);},toObject(){const out=clone(this._data);out.system.uses.spent=this.system.uses.spent;return out;},
   clone(changes){const copy=item(this.toObject(),false);copy.updateSource(changes);return copy;},
   updateSource(changes){merge(this._data,changes);this.flags=clone(this._data.flags??{});this.system=clone(this._data.system);this.system.properties=new Set(this.system.properties??[]);this.system.uses??={};this.system.uses.max=Number(this.system.uses.max)||0;Object.defineProperty(this.system.uses,'value',{get(){return this.max-this.spent;}});
    this.system.activities=list(Object.values(this._data.system.activities??{}).map(a=>({...clone(a),id:a._id,item:this,actor,uuid:`${this.uuid}.Activity.${a._id}`})));}};
  d.updateSource({});if(owned){actor.items.push(d);world.set(d.uuid,d);for(const a of d.system.activities)world.set(a.uuid,a);}return d;
 }
 function wand(id){const d=item(data.find(d=>d.flags?.spikependium?.key===`item:gs1:${id}`));d.updateSource({'system.equipped':true,'system.attuned':true});for(const a of d.system.activities)world.set(a.uuid,a);return d;}
 const fire=wand('unbroken-fire'),whispers=wand('whispers');
 const source=fire.system.activities.find(a=>a.type==='cast'&&a.spell.uuid.endsWith('phbsplFlameBlade'));
 const blade=item({...clone(bases.find(r=>r.name==='Flame Blade').document),flags:{dnd5e:{cachedFor:source.uuid}}});
 const effectData=nativeConcentrationData({item:blade,id:'blade',type:'attack',uuid:`${blade.uuid}.Activity.blade`,duration:{concentration:true,getEffectData:()=>({value:600,units:'seconds'})}});
 const effect={active:true,uuid:'Actor.hero.ActiveEffect.blade',flags:effectData['flags.dnd5e']?{dnd5e:effectData['flags.dnd5e']}:{},getFlag(namespace,path){return get(this.flags[namespace],path);}};
 actor.concentration.effects.add(effect);
 function save(){const card={id:`save${++serial}`,uuid:`ChatMessage.save${serial}`,type:'save',author:user,whisper:[],blind:false,flags:{spikependium:{}},system:{type:'concentration',ability:'con'},rolls:[new D20()],getAssociatedActor:()=>actor,updateSource(changes){merge(this,changes);}};
  Object.defineProperty(card.system,'forceSuccess',{get(){return focusBladeSuccess.call({parent:card,type:this.type,ability:this.ability},()=>!!this.resisted);}});
  recordOriginSaveWindow(card);game.messages.push(card);world.set(card.uuid,card);return card;}
 async function apply(updates){const deltas={actor:getDeltas(actor,updates.actor),item:{}};for(const[p,v]of Object.entries(updates.actor))set(actor,p,v);if(failApply)throw Error('fixture partial update');
  for(const u of updates.item){const target=actor.items.get(u._id),changes={...u};delete changes._id;deltas.item[u._id]=getDeltas(target,changes);target.updateSource(changes);}return deltas;}
 function ready(a){
  a.requiresSpellSlot=a.item.type==='spell'&&a.item.system.level>0;
  a.consumption.spellSlot??=a.item.type==='spell';
  a.consumption.targets=(a.consumption.targets??[]).map(t=>({...t,hasZeroCost:()=>false,async consume(config,updates){const resource=a.item.actor.items.get(a.item.id),uses=resource.system.uses;const result=await nativeUsesConsumption.call({resolveCost:async()=>({total:Number(t.value)})},config,{uses,type:'wand',rolls:updates.rolls,delta:{}});updates.item.push({_id:resource.id,'system.uses.spent':result.spent});}}));
  a._prepareUsageUpdates=async config=>{let updates=await nativeUsageUpdates.call(a,config);if(!updates)return updates;updates=prepareReactionUpdates(a,config,updates);if(!updates)return updates;updates=await prepareFocusUpdates(a,config,updates);return updates&&prepareFocusCastingUpdates(a,config,updates);};
  return a;
 }
 async function use(a,config={consume:{action:true,resources:true,spellSlot:true},scaling:0,spell:{slot:'spell3'}},message={create:true,data:{system:{}}}){
  ready(a);if(prepareFocusCasting(a,config,{},message)===false)return{result:false,message};
  const result=await nativeConsume.call(a,config,message,apply);if(result===false)return{result,message};recordReaction(a,message);
  const card={id:`use${++serial}`,uuid:`ChatMessage.use${serial}`,type:'usage',author:user,flags:message.data.flags??{},system:message.data.system,getAssociatedActor:()=>actor};card.getOriginatingMessage=()=>card;game.messages.push(card);world.set(card.uuid,card);return{result,message,card};
 }
 function spell(name='Fireball'){const d=item(clone(bases.find(r=>r.name===name).document));const working=d.clone({});return{original:d,working,activity:working.system.activities[0]};}
 return{actor,fire,whispers,blade,effect,save,use,apply,spell,ready};
}
{
 const h=setup(),card=h.save(),action=h.fire.system.activities.find(a=>a.flags.spikependium?.focusBladeSuccess);assert.ok(action);
 const p=await h.use(action);assert.notEqual(p.result,false);assert.equal(h.fire.system.uses.spent,1);assert.equal(card.system.forceSuccess,true);assert.equal(card.rolls[0].total,1,'native result is forced without rewriting the original die');
 await refreshFocusSaves(p.card);assert.ok(refreshed.includes(card.uuid));
 const beforeRefresh=refreshed.length;await refreshFocusSaves(h.actor,{'system.attributes.hp.value':2});assert.equal(refreshed.length,beforeRefresh,'unrelated actor changes do not redraw historical saves');
 assert.equal(prepareFocusCasting(action,{}, {},{create:true,data:{}}),false,'the same failure cannot redeem another reaction');
 await nativeRefund.call(action,p.card.system.deltas,h.apply);assert.equal(h.fire.system.uses.spent,0);assert.equal(card.system.forceSuccess,false);assert.equal(h.actor.flags.spikependium.reactionCasts[p.card.flags.spikependium.focusCasting.reaction].spent,0);
}
{
 const h=setup(),card=h.save(),action=h.fire.system.activities.find(a=>a.flags.spikependium?.focusBladeSuccess);
 h.fire.updateSource({'system.uses.spent':6});die=1;const p=await h.use(action);assert.ok(p.card);assert.equal(h.fire.system.quantity,0);assert.equal(card.system.forceSuccess,true,'last-charge destruction does not revoke its paid success');
 card.rolls[0].total=2;assert.equal(card.system.forceSuccess,false,'an edited source die cannot borrow a previous success');
}
for(const change of [h=>h.actor.concentration.effects.add({...h.effect,uuid:'other'}),h=>h.blade.flags.dnd5e.cachedFor='unknown',h=>h.fire.updateSource({'system.equipped':false}),h=>h.actor.statuses.add('incapacitated')]){
 const h=setup();h.save();change(h);const action=h.fire.system.activities.find(a=>a.flags.spikependium?.focusBladeSuccess);assert.equal(prepareFocusCasting(action,{}, {},{create:true,data:{}}),false);assert.equal(h.fire.system.uses.spent,0);
}
{
 const h=setup(),card=h.save();game.time.worldTime=1;const action=h.fire.system.activities.find(a=>a.flags.spikependium?.focusBladeSuccess);assert.equal(prepareFocusCasting(action,{}, {},{create:true,data:{}}),false);
 game.time.worldTime=0;h.save();assert.equal(prepareFocusCasting(action,{spikependium:{focusBladeSave:card.uuid}}, {},{create:true,data:{}}),false,'only the newest save is reactive');
}
{
 const h=setup(),card=h.save(),action=h.fire.system.activities.find(a=>a.flags.spikependium?.focusBladeSuccess);failApply=true;
 await assert.rejects(h.use(action),/partial update/);assert.equal(card.system.forceSuccess,false,'a partial write without a published paid card grants no free success');
}
{
 const h=setup(),card=h.save();let calls=0;
 const a=h.fire.system.activities.find(a=>a.flags.spikependium?.focusBladeSuccess);a.use=async config=>{calls++;return h.use(a,{consume:{action:true,resources:true},...config});};confirm=false;
 await chooseFireWandSave(card);assert.equal(calls,0);confirm=true;confirmHook=()=>h.fire.updateSource({'system.attuned':false});await chooseFireWandSave(card);assert.equal(calls,0,'confirmation revalidates the held wand before use');
}
{
 const h=setup(),card=h.save(),a=h.fire.system.activities.find(a=>a.flags.spikependium?.focusBladeSuccess);let calls=0;
 a.use=async config=>{calls++;return h.use(a,{consume:{action:true,resources:true},...config});};await chooseFireWandSave(card);assert.equal(calls,1);assert.equal(card.system.forceSuccess,true,'the automatic confirmation delegates to the same paid native use');
}
{
 const h=setup(),s=h.spell();answer=null;let called=false;
 await whispersCastingUse.call(s.activity,()=>{called=true;},{});assert.equal(called,false,'cancelled choice does not cast or pay');
 answer={wand:''};await whispersCastingUse.call(s.activity,c=>{assert.equal(c.spikependium.focusWhispers,false);called=true;},{});assert.equal(called,true);
 answer={wand:h.whispers.uuid};let config;await whispersCastingUse.call(s.activity,c=>{config=c;},{consume:{action:true,resources:true,spellSlot:true},scaling:0,spell:{slot:'spell3'}});
 const p=await h.use(s.activity,config);assert.ok(p.card);assert.equal(h.actor.system.spells.spell3.value,2);assert.equal(h.whispers.system.uses.spent,3);assert.equal(s.original.system.properties.has('vocal'),true);assert.equal(s.working.system.properties.has('vocal'),false);
 const resolved=restoreWhispersItem.call(p.card,()=>s.original,{});assert.equal(resolved.system.properties.has('vocal'),false);assert.equal(s.original.system.properties.has('vocal'),true);
 const associated=restoreWhispersActivity.call(p.card,()=>s.original.system.activities[0],{});assert.equal(associated.item.system.properties.has('vocal'),false);
 const configRoll={subject:s.original.system.activities[0],event:{target:{closest:()=>({dataset:{messageId:p.card.id}})}}};assert.notEqual(guardWhispersRoll(configRoll,{},{}),false);
 await nativeRefund.call(s.activity,p.card.system.deltas,h.apply);assert.equal(h.whispers.system.uses.spent,0);assert.equal(h.actor.system.spells.spell3.value,3);assert.equal(guardWhispersRoll(configRoll,{},{}),false);
 assert.equal(restoreWhispersItem.call(p.card,()=>s.original,{}),s.original,'refunded casting does not retain hidden component suppression');
}
for(const[level,cost]of [[0,0],[3,3],[5,5]]){
 const h=setup(),s=h.spell(level===0?'Produce Flame':'Fireball');h.whispers.updateSource({'system.uses.spent':7-cost});die=1;
 const p=await h.use(s.activity,{consume:{action:true,resources:true,spellSlot:level!==0},scaling:level===5?2:0,spell:{slot:`spell${level||5}`},spikependium:{focusWhispers:h.whispers.uuid}});
 assert.ok(p.card);assert.equal(p.card.flags.spikependium.focusCasting.level,level);assert.equal(h.whispers.system.uses.spent,7);assert.equal(h.whispers.flags.spikependium.focusRuin,cost?1:0,'only a real final charge triggers destruction');
}
for(const mutate of [()=>({spell:{slot:'spell6'},scaling:3}),h=>{h.whispers.updateSource({'system.uses.spent':6});return{};},()=>({consume:false})]){
 const h=setup(),s=h.spell(),config={consume:{action:true,resources:true,spellSlot:true},scaling:0,spell:{slot:'spell3'},spikependium:{focusWhispers:h.whispers.uuid},...mutate(h)};
 const before=clone(h.actor.system.spells),p=await h.use(s.activity,config);assert.equal(p.result,false);assert.deepEqual(h.actor.system.spells,before,'invalid silent casting cannot spend any slot');
}
{
 const h=setup(),card=h.save(),action=h.fire.system.activities.find(a=>a.flags.spikependium?.focusBladeSuccess);card.whisper=['player','gm'];
 const message={create:true,data:{system:{},whisper:['gm'],blind:true}};assert.notEqual(prepareFocusCasting(action,{}, {},message),false);assert.deepEqual(message.data.whisper,['gm']);assert.equal(message.data.blind,true,'a stricter requested audience is preserved');
 assert.equal((await h.use(action,{consume:{action:false,resources:true}})).result,false,'charge consumption cannot bypass the required reaction');assert.equal(h.fire.system.uses.spent,0);
}
{
 const h=setup(),s=h.spell();h.actor.effects.push({active:true,flags:{spikependium:{griffonHushedMute:true}},duration:{}});
 const config={spikependium:{focusWhispers:h.whispers.uuid}},message={create:true,data:{}};assert.notEqual(prepareFocusCasting(s.activity,config,{},message),false);assert.notEqual(canUseGriffonTwo(s.activity),false,'silence sees only the working spell without verbal components');
 const originalActivity=s.original.system.activities[0];assert.equal(canUseGriffonTwo(originalActivity),false,'the original spell still requires its verbal component');
 h.actor.classes={};h.actor.items=list([{type:'spell',system:{sourceItem:'weapon:griffon-reverent'}}]);assert.equal(isGriffonSpellcaster(h.actor),false,'borrowed magic-weapon spells do not qualify a noncaster for attunement');
}
{
 const h=setup(),root=h.fire.system.activities.find(a=>a.flags.spikependium?.focusCantripDice===2),child=h.spell('Produce Flame').activity;
 h.fire.updateSource({'system.uses.spent':6});h.ready(root);die=1;
 const u=await root._prepareUsageUpdates({consume:{resources:true},scaling:0});assert.equal(u.rolls.length,1);
 child.getLinkedActivity=()=>root;await prepareFocusUpdates(child,{},u);assert.equal(u.rolls.length,1,'linked Cast consumption rolls the final-charge check once, on its source only');
 await h.apply(u);assert.equal(h.fire.system.quantity,0);
 assert.equal(guardFocusRoll({subject:child},{},{}),false,'the missing focus cannot start a fresh unassociated roll');
 const past={id:'cast',type:'usage',author:user,getAssociatedActivity:()=>child};game.messages.push(past);
 assert.notEqual(guardFocusRoll({subject:child},{},{data:{system:{origin:past.id}}}),false,'an already cast linked spell can resolve its own card after final-charge destruction');
 const orphan=h.spell('Produce Flame').activity;orphan.item.flags.dnd5e={cachedFor:'unknown'};orphan.item.system.sourceItem='equipment:griffon-unbroken-fire';assert.equal(canUseGriffonFocus(orphan),false,'an orphaned cached spell cannot become free ordinary spellcasting');
}
console.log('Focus casting: native concentration provenance, paid reaction/charge and forced success, refund/last-charge/cancel/stale/partial-write guards; working-copy verbal removal, actual slot-level costs 0–5, native slot/refund, cancelled-card guards and silence compatibility passed.');
