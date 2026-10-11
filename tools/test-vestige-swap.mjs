import assert from "node:assert/strict";
import { registerVestigeSwapMovement, canUseVestigeSwap, recordVestigeSwap, handleVestigeSwap, resumeVestigeSwaps, canActDuringVestigeSwap } from "../scripts/vestige-swap.mjs";

const clone = structuredClone, list = a => Object.assign(a,{get(id){return this.find(d=>d.id===id);}});
const set = (o,p,v) => {const keys=p.split('.');for(const k of keys.slice(0,-1))o=o[k]??={};o[keys.at(-1)]=v;};
const gm={id:'gm',isGM:true,isActiveGM:true,targets:new Set()},player={id:'player',isGM:false,targets:new Set()};
let docs,scene,source,owner,item,activity,moves,fail,stop,duringMove;
globalThis.CONFIG={Token:{movement:{actions:{blink:{walls:null,teleport:true}}}}};
globalThis.ui={notifications:{warn(){},error(){}}};
globalThis.foundry={utils:{setProperty:set}};
globalThis.dnd5e={utils:{convertLength:(v,from,to)=>from===to?v:from==='ft'?v*0.3048:v/0.3048}};
globalThis.fromUuidSync=uuid=>docs.get(uuid);
const actor=(id,key)=>({id,uuid:`Actor.${id}`,type:'npc',name:id,flags:{spikependium:{key}},statuses:new Set(),
  system:{isCreature:true,attributes:{hp:{value:20}}},testUserPermission:u=>u?.isGM||u?.id==='player'});
const token=(id,a,x)=>{const t={id,uuid:`Scene.test.Token.${id}`,actor:a,parent:scene,flags:{},x,y:0,elevation:0,level:'base',width:1,height:1,depth:1,shape:0,rotation:37,hidden:false,isOwner:true,
  getCenterPoint(){return{x:this.x+this.width*50,y:this.y+this.height*50,elevation:this.elevation};},
  getOccupiedGridSpaceOffsets(p={}){return Array.from({length:this.width*this.height},(_,n)=>({i:(p.y??this.y)/100+Math.floor(n/this.width),j:(p.x??this.x)/100+n%this.width}));},getSize(){return{width:this.width*100,height:this.height*100};}};
  scene.tokens.push(t);docs.set(t.uuid,t);return t;};
const reset=()=>{docs=new Map();moves=[];fail=null;stop=false;duringMove=undefined;gm.targets=new Set();
  globalThis.game={user:gm,users:list([gm,player]),actors:[],scenes:[],messages:[],time:{worldTime:100},combat:null};
  scene={id:'test',uuid:'Scene.test',flags:{},tokens:[],canUserModify:u=>u.isGM,grid:{units:'ft',distance:5,size:100,
    getCenterPoint:({i,j})=>({x:j*100+50,y:i*100+50}),
    measurePath:([a,b])=>({distance:Math.hypot((a.x-b.x)/100*scene.grid.distance,(a.y-b.y)/100*scene.grid.distance,(a.elevation??0)-(b.elevation??0))})},
    async setFlag(scope,p,v){if(fail===p){fail=null;throw Error('storage failed');}set(this.flags,`${scope}.${p}`,clone(v));},
    async moveTokens(instructions,options){moves.push(clone(instructions));assert.equal(options.autoRotate,false);assert.equal(options.showRuler,false);
      assert.equal(options.constrainOptions.ignoreWalls,true);assert.equal(options.constrainOptions.ignoreTokens,true);assert.equal(options.constrainOptions.ignoreCost,true);
      const results={};for(const[id,instruction]of Object.entries(instructions)){assert.equal(instruction.destination.action,'spikependiumSwap');
        if(stop){results[id]=false;continue;}
        const t=scene.tokens.find(t=>t.id===id);Object.assign(t,instruction.destination);results[id]=true;
        if(fail==='partial'){fail=null;throw Error('one moved');}}
      if(duringMove)await duringMove();return results;}};
  game.scenes=[scene];docs.set(scene.uuid,scene);globalThis.canvas={ready:true,scene};
  source=token('source',actor('fiend','actor:vestige-fiend'),0);owner=token('owner',actor('owner'),400);
  owner.actor.type='character';item={uuid:'Actor.owner.Item.vestige',actor:owner.actor,flags:{spikependium:{key:'subclass:vestige-patron:vestige-companion'}}};docs.set(item.uuid,item);
  source.actor.flags.dnd5e={summon:{origin:item.uuid}};game.actors=[source.actor,owner.actor];
  activity={id:'rD9bLz1LEKGMNjZ9',actor:source.actor,activation:{type:'bonus'},getUsageToken:()=>source};};
const message=(id='swap')=>{const config={data:{}};recordVestigeSwap(activity,config);const m={id,uuid:`ChatMessage.${id}`,type:'usage',flags:config.data.flags??{},author:player,getAssociatedActivity:()=>activity};game.messages.push(m);return m;};
const original=console.error;console.error=()=>{};
registerVestigeSwapMovement();assert.equal(CONFIG.Token.movement.actions.spikependiumSwap.teleport,true);assert.equal(CONFIG.Token.movement.actions.spikependiumSwap.measure,false);
assert.equal(CONFIG.Token.movement.actions.spikependiumSwap.getCostFunction()(),0);assert.equal(CONFIG.Token.movement.actions.spikependiumSwap.canSelect,false);
reset();assert.equal(canUseVestigeSwap(activity),true);const m=message();await handleVestigeSwap(m);
assert.equal(source.x,400);assert.equal(owner.x,0);assert.equal(moves.length,1);assert.deepEqual(Object.keys(moves[0]).sort(),['owner','source']);
assert.equal(source.rotation,37);assert.equal(owner.rotation,37);assert.equal(scene.flags.spikependium.vestigeSwaps.swap.state,'done');
await handleVestigeSwap(m);await resumeVestigeSwaps();assert.equal(moves.length,1,'повтор не меняет участников обратно');
reset();owner.x=1200;assert.equal(canUseVestigeSwap(activity),true);owner.x++;assert.equal(canUseVestigeSwap(activity),false);owner.x=1200;owner.elevation=1;assert.equal(canUseVestigeSwap(activity),false);
reset();scene.grid.units='m';scene.grid.distance=1.524;owner.x=1200;assert.equal(canUseVestigeSwap(activity),true);owner.x=1201;assert.equal(canUseVestigeSwap(activity),false);
reset();owner.level='upper';owner.elevation=10;const upper=message();await handleVestigeSwap(upper);assert.equal(source.level,'upper');assert.equal(source.elevation,10);assert.equal(owner.level,'base');assert.equal(owner.elevation,0);
reset();owner.width=2;owner.height=2;await handleVestigeSwap(message());assert.equal(owner.width,2);assert.equal(source.width,1);
reset();source.width=2;token('blocker',actor('blocker'),500);assert.equal(canUseVestigeSwap(activity),false,'учитывается весь размер в месте назначения');
reset();const second=token('second',owner.actor,600);assert.equal(canUseVestigeSwap(activity),false);gm.targets.add(second);const selected=message();await handleVestigeSwap(selected);assert.equal(source.x,600);assert.equal(second.x,0);assert.equal(owner.x,400);
for(const reason of ['dead','antimagic','incapacitated','moving']){reset();if(reason==='dead')owner.actor.statuses.add('dead');if(reason==='antimagic')source.actor.statuses.add('antimagic');
  if(reason==='incapacitated')source.actor.statuses.add('incapacitated');if(reason==='moving')source.movement={state:'paused'};assert.equal(canUseVestigeSwap(activity),false);}
for(const reason of ['position','time','turn','rest','recovery']){reset();const stale=message();if(reason==='position')owner.x=500;if(reason==='time')game.time.worldTime++;
  if(reason==='turn')game.combat={started:true,id:'combat',round:1,turn:0};if(reason==='rest')owner.actor.flags.spikependium.longRest='next';if(reason==='recovery')owner.actor.flags.spikependium.vestigeRecovery={event:'next'};
  await handleVestigeSwap(stale);assert.equal(moves.length,0);}
reset();const forged=message();forged.author={id:'intruder'};await handleVestigeSwap(forged);assert.equal(moves.length,0);
reset();const payload=message();payload.flags.spikependium.vestigeSwapRequest.toOwner.x=9999;await handleVestigeSwap(payload);assert.equal(owner.x,0,'конечные точки рассчитывает Мастер, не флаги игрока');
reset();const missing=message();missing.flags.spikependium.vestigeSwapRequest.first={};await handleVestigeSwap(missing);assert.equal(moves.length,0,'неполный снимок не подтверждает исходное положение');
reset();const unprotected=message();scene.canUserModify=()=>true;await handleVestigeSwap(unprotected);assert.equal(moves.length,0);
reset();const noGM=message();game.user=player;await handleVestigeSwap(noGM);assert.equal(moves.length,0);game.user=gm;await resumeVestigeSwaps();assert.equal(moves.length,1);
reset();const inactive=message();canvas.scene={};await handleVestigeSwap(inactive);assert.equal(moves.length,0);canvas.scene=scene;await resumeVestigeSwaps();assert.equal(moves.length,1);
reset();fail='vestigeSwaps.swap';await assert.rejects(handleVestigeSwap(message()));assert.equal(moves.length,0);await resumeVestigeSwaps();assert.equal(moves.length,1);
reset();fail='partial';await handleVestigeSwap(message());assert.equal(source.x,400);assert.equal(owner.x,400);assert.equal(scene.flags.spikependium.vestigeSwaps.swap.state,'moving');
assert.equal(canActDuringVestigeSwap({actor:owner.actor,activation:{type:'action'}}),false);assert.equal(canActDuringVestigeSwap({actor:owner.actor,activation:{type:'reaction'}}),true);
await resumeVestigeSwaps();assert.equal(moves.length,2);assert.deepEqual(Object.keys(moves[1]),['owner']);assert.equal(source.x,400);assert.equal(owner.x,0);assert.equal(scene.flags.spikependium.vestigeSwaps.swap.state,'done');
reset();fail='vestigeSwaps.swap.state';await handleVestigeSwap(message());assert.equal(moves.length,1);await resumeVestigeSwaps();assert.equal(moves.length,1,'ошибка квитанции не повторяет уже завершённую телепортацию');
reset();stop=true;await handleVestigeSwap(message());assert.equal(scene.flags.spikependium.vestigeSwaps.swap.state,'stopped');stop=false;await resumeVestigeSwaps();assert.equal(moves.length,1);
reset();fail='partial';await handleVestigeSwap(message());source.x=700;await resumeVestigeSwaps();assert.equal(scene.flags.spikependium.vestigeSwaps.swap.state,'stopped');assert.equal(moves.length,1,'другое перемещение не перезаписывается');
reset();fail='partial';await handleVestigeSwap(message());owner.movement={state:'paused'};await resumeVestigeSwaps();assert.equal(moves.length,1,'приостановленное движение не запускается заново');
owner.movement={state:'stopped',updateOptions:{spikependium:{vestigeSwap:'swap'}}};await resumeVestigeSwaps();assert.equal(moves.length,1);assert.equal(scene.flags.spikependium.vestigeSwaps.swap.state,'stopped','остановку штатного движения после переподключения сохраняем');
reset();let release;const wait=new Promise(r=>{release=r;});duringMove=()=>wait;const first=handleVestigeSwap(message());await Promise.resolve();await Promise.resolve();
await handleVestigeSwap(message('duplicate'));release();await first;assert.equal(moves.length,1);assert.equal(Object.keys(scene.flags.spikependium.vestigeSwaps).length,1);
console.error=original;
console.log('Дьявольская замена: два токена одним штатным движением, 60 футов/высота/метры/уровни/размер, хозяин и права, защищённые точки, повтор без обратного обмена, частичная ошибка и квитанция, остановка и конкурентные карточки: OK.');
