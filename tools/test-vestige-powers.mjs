import assert from "node:assert/strict";
import fs from "node:fs";
import { canUseVestigePower, recordVestigePower, vestigeCurseChanges, applyVestigeCurse, cursedAgainst,
  prepareVestigeCurseAttack, finalizeVestigeCurseAttack, recordVestigeTouch, finishVestigeTouch } from "../scripts/vestige-powers.mjs";

const clone=structuredClone, list=a=>Object.assign(a,{get(id){return this.find(d=>d.id===id);}});
const set=(o,path,value)=>{const keys=path.split('.');for(const k of keys.slice(0,-1))o=o[k]??={};o[keys.at(-1)]=value;};
const merge=(a,b)=>{for(const[k,v]of Object.entries(b))if(v&&typeof v==='object'&&!Array.isArray(v))merge(a[k]??={},v);else a[k]=clone(v);return a;};
const gm={id:'gm',isGM:true,isActiveGM:true,active:true,targets:new Set()}, player={id:'player',isGM:false,active:true};
let registry,source,target,owner,item,activity,scene,choice,queries,failReceipt,failDelete;
globalThis.foundry={utils:{setProperty:set,mergeObject:merge},data:{fields:{StringField:class{constructor(o){Object.assign(this,o);}}}},
  applications:{api:{DialogV2:{async query(user,type,options){assert.equal(user.id,'player');queries++;return choice;}}}}};
globalThis.ui={notifications:{warn(){}}};
globalThis.dnd5e={utils:{convertLength:(v,from,to)=>from==='m'?v/0.3048:v},applications:{components:{EffectApplicationElement:class{
  async _prepareEffectData(profile,actor){const data=merge(profile.toObject(),vestigeCurseChanges.call(activity,()=>({}),profile,{chatMessage:this.chatMessage,target:actor}));
    data.system.origin={message:this.chatMessage.uuid,profile:profile.id};return{action:'create',data};}
}}}};
globalThis.ActiveEffect={implementation:class{constructor(data){Object.assign(this,clone(data));this.id=data._id;}toObject(){return clone({...this});}static getEffectStart(){return{time:game.time.worldTime};}}};
globalThis.fromUuidSync=uuid=>registry.get(uuid);
const actor=(id,key)=>{const a={id,uuid:`Actor.${id}`,name:id,isOwner:true,flags:{spikependium:{key}},statuses:new Set(),effects:[],items:[],
  system:{isCreature:true,attributes:{hp:{value:10}}},testUserPermission:u=>u?.id==='gm'||u?.id==='player',
  async setFlag(scope,key,value){set(this.flags,`${scope}.${key}`,value);},
  async createEmbeddedDocuments(type,data){assert.equal(type,'ActiveEffect');return data.map(d=>effect(a,d._id,d));},
  async updateEmbeddedDocuments(){throw Error('unexpected update');}};registry.set(a.uuid,a);return a;};
const effect=(parent,id,data={})=>{const e={id,uuid:`${parent.uuid}.ActiveEffect.${id}`,parent,flags:{},duration:{expired:false},statuses:new Set(),system:{changes:[]},...data,
  async delete(){if(failDelete){failDelete=false;throw Error('delete failed');}parent.effects=parent.effects.filter(e=>e!==this);registry.delete(this.uuid);},
  async update(data){this.statuses=new Set(data.statuses);}};parent.effects.push(e);registry.set(e.uuid,e);return e;};
const token=(a,id,x)=>{const t={id,uuid:`Scene.test.Token.${id}`,actor:a,parent:scene,x,y:0,elevation:0,level:'base',flags:{},
  getOccupiedGridSpaceOffsets:()=>[],getCenterPoint(){return{x:this.x+50,y:50,elevation:this.elevation};}};registry.set(t.uuid,t);scene.tokens.push(t);return t;};
const templates=fs.readdirSync('packs/_source/creatures').filter(f=>f.startsWith('actor-vestige-')).map(f=>JSON.parse(fs.readFileSync(`packs/_source/creatures/${f}`)));
const reset=(mode='curse')=>{registry=new Map();queries=0;failReceipt=failDelete=false;choice={status:'poisoned'};
  globalThis.game={user:gm,users:list([gm,player]),actors:[],scenes:[],messages:list([]),time:{worldTime:100}};gm.targets=new Set();
  scene={tokens:[],grid:{units:'ft',measurePath:([a,b])=>({distance:Math.hypot((a.x-b.x)/100*5,(a.y-b.y)/100*5,(a.elevation??0)-(b.elevation??0))})}};game.scenes=[scene];
  owner=actor('owner');source=token(actor('source',`actor:vestige-${mode==='curse'?'undead':'celestial'}`),'source',0);target=token(actor('target'),'target',100);
  item={uuid:'Actor.owner.Item.feature',actor:owner,flags:{spikependium:{key:'subclass:vestige-patron:vestige-companion'}}};registry.set(item.uuid,item);
  source.actor.flags.dnd5e={summon:{origin:item.uuid}};game.actors=[owner,source.actor,target.actor];
  const profileData=templates.find(t=>t.flags.spikependium.key==='actor:vestige-undead').items.at(-1).effects[0];
  assert.equal(profileData.transfer,false);assert.equal(profileData.duration.value,60);
  const profile={id:profileData._id,toObject:()=>clone(profileData),flags:profileData.flags};
  activity={id:mode==='curse'?'74BTP7gJ0HYZzihk':'662KdJM55taoeTAL',actor:source.actor,item:{effects:[profile]},getUsageToken:()=>source};
  gm.targets.add(target);};
const descriptors=()=>[{token:target.uuid,actor:target.actor.uuid,name:'target'}];
const usage=()=>{const m={id:'usage',uuid:'ChatMessage.usage',type:'usage',author:player,system:{targets:descriptors()},flags:{},getAssociatedActivity:()=>activity,
  async setFlag(scope,key,value){if(failReceipt){failReceipt=false;throw Error('receipt failed');}set(this.flags,`${scope}.${key}`,value);}};
  const data={data:{system:{targets:descriptors()}}};recordVestigePower(activity,data);m.flags=data.data.flags??{};registry.set(m.uuid,m);game.messages.push(m);return m;};
const healing=()=>{const u=usage(),m={id:'healing',uuid:'ChatMessage.healing',type:'healing',system:{origin:u},flags:{},whisper:[]};registry.set(m.uuid,m);return m;};

reset();assert.equal(canUseVestigePower(activity),true);target.x=700;assert.equal(canUseVestigePower(activity),false);
target.x=600;assert.equal(canUseVestigePower(activity),true);target.elevation=1;assert.equal(canUseVestigePower(activity),false);
target.elevation=0;target.level='other';assert.equal(canUseVestigePower(activity),false);target.level='base';gm.targets.clear();assert.equal(canUseVestigePower(activity),false);
reset();const m=usage();await applyVestigeCurse(m);assert.equal(target.actor.effects.length,1);
const curse=target.actor.effects[0];assert.equal(curse.start.time,100);assert.equal(curse.duration.value,60);assert.equal(curse.duration.expiry,null);
assert.equal(cursedAgainst(target.actor,owner.uuid),true);assert.equal(cursedAgainst(target.actor,source.actor.uuid),true);assert.equal(cursedAgainst(target.actor,'Actor.other'),false);
const newForm=actor('new-relic','actor:vestige-fiend');newForm.flags.dnd5e={summon:{origin:item.uuid}};
assert.equal(cursedAgainst(target.actor,newForm.uuid),true,'смена ActorDelta не отменяет помеху против того же реликта');newForm.flags.dnd5e.summon.origin='another-feature';assert.equal(cursedAgainst(target.actor,newForm.uuid),false);
await applyVestigeCurse(m);assert.equal(target.actor.effects.length,1);
for(const state of ['disabled','isSuppressed']){curse[state]=true;assert.equal(cursedAgainst(target.actor,owner.uuid),false);curse[state]=false;}
game.time.worldTime=160;assert.equal(cursedAgainst(target.actor,owner.uuid),false);game.time.worldTime=100;
const config={subject:{actor:target.actor}},message={data:{system:{targets:[{actor:owner.uuid,token:'owner'}]}}};
prepareVestigeCurseAttack(config,{},message);assert.equal(config.spikependium.curseTarget,owner.uuid);
for(const advantage of [false,true]){let configured=0;const roll={options:{advantage,advantageMode:advantage?1:0},configureModifiers(){configured++;}};
  finalizeVestigeCurseAttack([roll],config,{},message);assert.equal(roll.options.advantageMode,advantage?0:-1);assert.equal(configured,1);}
const roll={options:{advantageMode:0},configureModifiers(){throw Error('unrelated attack altered');}};
finalizeVestigeCurseAttack([roll],{subject:{actor:target.actor},spikependium:{curseTarget:'Actor.other'}},{},{});
curse.disabled=true;finalizeVestigeCurseAttack([roll],config,{},message);curse.disabled=false;
class Base{constructor(config){this.config=config;}async _prepareConfigurationContext(c){return c;}_buildConfig(r){return r;}}
const mixed={subject:{actor:target.actor}},dialog={applicationClass:Base},multi={data:{system:{targets:[{actor:owner.uuid},{actor:'Actor.other'}]}}};
prepareVestigeCurseAttack(mixed,dialog,multi);assert.equal(dialog.configure,true);const sheet=new dialog.applicationClass(mixed);
assert.equal((await sheet._prepareConfigurationContext({fields:[]})).fields.length,1);sheet._buildConfig({},new Map([['spikependium.curseTarget',owner.uuid]]),0);
finalizeVestigeCurseAttack([{options:{},configureModifiers(){}}],mixed,{},multi);assert.deepEqual(multi.data.system.targets,[{actor:owner.uuid}]);
multi.data.system.targets=[{actor:owner.uuid},{actor:'Actor.other'}];mixed.spikependium.curseTarget='Actor.other';finalizeVestigeCurseAttack([roll],mixed,{},multi);
assert.deepEqual(multi.data.system.targets,[{actor:'Actor.other'}],'обычная атака по другой цели не применяет тот же бросок к защищённому хозяину');
reset();failReceipt=true;const failed=usage();await assert.rejects(applyVestigeCurse(failed));assert.equal(target.actor.effects.length,1);await applyVestigeCurse(failed);assert.equal(target.actor.effects.length,1);
reset();const forged=usage();forged.author={id:'intruder'};await applyVestigeCurse(forged);assert.equal(target.actor.effects.length,0);
reset();activity.item.effects=[];await applyVestigeCurse(usage());assert.equal(target.actor.effects.length,1,'старый статблок получает нативный профиль без перезаписи предметов');
reset();const stale=usage();game.time.worldTime=160;await applyVestigeCurse(stale);assert.equal(target.actor.effects.length,0);
reset();game.user={...player,targets:gm.targets};await applyVestigeCurse(usage());assert.equal(target.actor.effects.length,0);game.user=gm;

reset('touch');assert.equal(canUseVestigePower(activity),true);target.x=101;assert.equal(canUseVestigePower(activity),false);
gm.targets=new Set([source]);assert.equal(canUseVestigePower(activity),false);gm.targets=new Set([target]);target.x=100;
const blind=effect(target.actor,'blind',{statuses:new Set(['blinded','frightened'])}),poison=effect(target.actor,'poison',{statuses:new Set(['poisoned'])});
const h=healing(),updates={};recordVestigeTouch(target.actor,-10,updates,{origin:h});assert.equal(updates.flags.spikependium.vestigeTouch.effects.length,2);
merge(target.actor,updates);await finishVestigeTouch();assert.equal(queries,1);assert.equal(target.actor.effects.includes(poison),false);assert.deepEqual([...blind.statuses],['blinded','frightened']);
assert.equal(target.actor.flags.spikependium.vestigeTouch.state,'done');const repeated={};recordVestigeTouch(target.actor,-10,repeated,{origin:h});assert.deepEqual(repeated,{});
reset('touch');effect(target.actor,'blind',{statuses:new Set(['blinded','frightened'])});const one=healing(),oneUpdates={};recordVestigeTouch(target.actor,0,oneUpdates,{origin:one});merge(target.actor,oneUpdates);
await finishVestigeTouch();assert.equal(queries,0);assert.deepEqual([...target.actor.effects[0].statuses],['frightened'],'снятие ослепления не снимает испуг того же эффекта');
reset('touch');const old=effect(target.actor,'old',{statuses:new Set(['poisoned'])});const changed=healing(),changedUpdates={};recordVestigeTouch(target.actor,-5,changedUpdates,{origin:changed});merge(target.actor,changedUpdates);
await old.delete();const later=effect(target.actor,'later',{statuses:new Set(['poisoned'])});await finishVestigeTouch();assert(target.actor.effects.includes(later),'позднейшее отравление не лечится старым применением');
reset('touch');effect(target.actor,'poison',{statuses:new Set(['poisoned'])});const interrupted=healing(),interruptedUpdates={};recordVestigeTouch(target.actor,-5,interruptedUpdates,{origin:interrupted});merge(target.actor,interruptedUpdates);
failDelete=true;await assert.rejects(finishVestigeTouch());assert.equal(target.actor.flags.spikependium.vestigeTouch.selected,'poisoned');await finishVestigeTouch();assert.equal(target.actor.effects.length,0);
reset('touch');const bad=healing();for(const data of [{origin:{...bad,type:'damage'},amount:-5},{origin:bad,amount:5}]){const u={};recordVestigeTouch(target.actor,data.amount,u,{origin:data.origin});assert.deepEqual(u,{});}
reset('touch');const foreign=effect(owner,'foreign',{statuses:new Set(['poisoned'])});const secure=healing(),secureUpdates={};recordVestigeTouch(target.actor,-5,secureUpdates,{origin:secure});merge(target.actor,secureUpdates);
target.actor.flags.spikependium.vestigeTouch.effects.push({uuid:foreign.uuid,status:'poisoned'});await finishVestigeTouch();assert(owner.effects.includes(foreign),'флаг получателя не может снять эффект с чужого листа');
reset('touch');effect(target.actor,'blind',{statuses:new Set(['blinded'])});effect(target.actor,'poison',{statuses:new Set(['poisoned'])});const cancelled=healing(),cancelledUpdates={};
recordVestigeTouch(target.actor,-5,cancelledUpdates,{origin:cancelled});merge(target.actor,cancelledUpdates);choice=null;await finishVestigeTouch();assert.equal(target.actor.effects.length,2);
assert.equal(target.actor.flags.spikependium.vestigeTouch.state,'pending');choice={status:'poisoned'};await finishVestigeTouch();assert.equal(target.actor.effects.length,1);
reset('touch');effect(target.actor,'poison',{statuses:new Set(['poisoned'])});const offline=healing(),offlineUpdates={};recordVestigeTouch(target.actor,-5,offlineUpdates,{origin:offline});merge(target.actor,offlineUpdates);
game.user=player;await finishVestigeTouch();assert.equal(target.actor.effects.length,1);game.user=gm;await finishVestigeTouch();assert.equal(target.actor.effects.length,0,'очередь завершается после подключения Мастера');
console.log('Реликт: одна цель/касание/дистанция, нативное проклятие на минуту без дублей, помеха по хозяину и реликту с отменой преимуществом, выбор цели; исцеляющее касание снимает одно состояние, сохраняет другие, не лечит новое состояние старой карточкой и продолжает ошибку: OK.');
