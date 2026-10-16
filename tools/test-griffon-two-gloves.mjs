import fs from 'node:fs';
import assert from 'node:assert/strict';
import { GRIFFON_TWO_GLOVES } from '../src/content/griffons-saddlebag-two-gloves.mjs';
import { canUseGauntlet, prepareGauntletUpdates, gauntletMovement, gauntletCachedSpell, gauntletSpellChanges, gauntletEffectSuppression, gauntletDamageParts, markGauntletDamage, healingGloveApplication, resetHealingGlove } from '../scripts/griffon-two-gloves.mjs';
import { nativeGloveCachedSpellData, nativeGloveSpellChanges } from './data/dnd5e-gloves-native.mjs';
import { nativeConsume, nativeRefund, getDeltas } from './data/dnd5e-reaction-native.mjs';
import { nativeUsesConsumption, nativeRecoverUses } from './data/dnd5e-monsters-native.mjs';
import { nativeCalculateDamage, nativeApplyDamage } from './data/dnd5e-guardian-native.mjs';
import { calculateCompanionDamage } from '../scripts/companions.mjs';
import { nativeSummonChanges } from './data/dnd5e-summon-native.mjs';
const clone=structuredClone,get=(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o),set=(o,p,v)=>{const a=p.split('.'),last=a.pop();a.reduce((v,k)=>v[k]??={},o)[last]=v;};
const flat=(o,p='',out={})=>{for(const[k,v]of Object.entries(o)){const key=p?`${p}.${k}`:k;if(v&&Object.getPrototypeOf(v)===Object.prototype)flat(v,key,out);else out[key]=v;}return out;};
const list=values=>Object.assign(values,{get(id){return this.find(i=>i.id===id);},getByType(type){return this.filter(a=>a.type===type);}});
const world=new Map(),read=pack=>fs.readdirSync(`packs/_source/${pack}`).map(f=>JSON.parse(fs.readFileSync(`packs/_source/${pack}/${f}`,'utf8')));
const records=read('items'),docs=new Map(records.map(d=>[d.flags?.spikependium?.key,d])),actors=read('creatures');
const folders=new Map(records.filter(d=>d._key.startsWith('!folders!')).map(d=>[d._id,d]));
const evidence=JSON.parse(fs.readFileSync('tools/data/griffon-two-gloves.json','utf8')),babele=JSON.parse(fs.readFileSync('babele/ru/spikependium.items.json','utf8'));
const inventory=JSON.parse(fs.readFileSync('tools/data/external-content-inventory.json','utf8')).sources.find(s=>s.id==='GS2');
const acts=d=>Object.values(d.system.activities),doc=id=>docs.get(`item:gs2:${id}`);
for(const[en,id]of GRIFFON_TWO_GLOVES){const d=doc(id),e=evidence.entries.find(e=>e.key===d.flags.spikependium.key);assert.ok(e);assert.match(e.sha256,/^[a-f0-9]{64}$/);assert.equal(d.flags.spikependium.originalName,en);assert.match(babele.entries[d._id].name,/[а-яё]/i);assert.equal(d.system.source.rules,'2014');assert.equal(d.system.source.custom,e.url);assert.equal(inventory.entries.find(e=>e.key===d.flags.spikependium.key).status,'imported-partial-automation');assert.equal(folders.get(d.folder).name,'Перчатки и рукавицы');assert.equal(folders.get(folders.get(d.folder).folder).name,'Сумка грифона — книга 2');assert.ok(d.system.price.value>0&&d.system.weight.value>0);for(const a of acts(d)){assert.equal(a.consumption.spellSlot,false);for(const e of a.effects??[])assert.ok(d.effects.some(f=>f._id===e._id));if(a.type==='cast')assert.ok(evidence.spells.some(s=>s.uuid===a.spell.uuid&&s.document.system.source.rules==='2014'));}}
assert.equal(evidence.entries.length,9);assert.equal(evidence.actors.length,2);
globalThis.foundry={utils:{getProperty:get,setProperty:set,flattenObject:flat,isEmpty:o=>!Object.keys(o).length,deepClone:clone,getType:o=>Array.isArray(o)?'Array':o?.constructor?.name}};
globalThis.game={user:{id:'gm',isActiveGM:true,isGM:true},users:{activeGM:{}},actors:[],scenes:[],messages:[]};
globalThis.ui={notifications:{warn(){}}};globalThis.fromUuidSync=uuid=>world.get(uuid);globalThis.fromUuid=async uuid=>world.get(uuid);
globalThis._loc=s=>s;
globalThis.CONFIG={DND5E:{damageTypes:{fire:{},necrotic:{},force:{},psychic:{},bludgeoning:{}},healingTypes:{healing:{},temphp:{}},movementTypes:{walk:{},burrow:{},climb:{},fly:{},swim:{}}},Dice:{BasicRoll:{replaceFormulaData:(text,data)=>String(text??'').replace(/@([\w.]+)/g,(_,p)=>get(data,p)??0)}}};
Math.clamp=(n,min,max)=>Math.min(max,Math.max(min,n));Number.isNumeric=n=>typeof n==='number'&&Number.isFinite(n);
let cancel=false;
globalThis.Hooks={call:(name,...args)=>name==='dnd5e.activityConsumption'?!cancel:name==='dnd5e.preApplyDamage'?healingGloveApplication(...args):true,callAll(){}};
function owned(id){const item=clone(doc(id));Object.assign(item,{id:item._id,uuid:`Actor.owner.Item.${item._id}`,isOwner:true,identifier:item.system.identifier});item.system.equipped=true;item.system.attuned=true;
 Object.defineProperty(item.system.uses,'value',{get(){return Number(this.max)-this.spent;}});
 const actor={uuid:'Actor.owner',isOwner:true,items:list([item]),effects:list([]),flags:{spikependium:{}},testUserPermission:()=>true,classes:{bard:{system:{levels:10,spellcasting:{progression:'full'}}}}};item.actor=actor;item.system.activities=list(acts(item).map(a=>Object.assign(a,{id:a._id,uuid:`${item.uuid}.Activity.${a._id}`,item,actor})));
 for(const a of item.system.activities){Object.defineProperty(a.uses,'value',{get(){return Number(this.max)-this.spent;}});world.set(a.uuid,a);}world.set(item.uuid,item);return item;}
const activity=(item,p)=>item.system.activities.find(p),byName=(item,word)=>activity(item,a=>a.name.includes(word));
const updates=()=>({actor:{},item:[],activity:{},create:[],delete:[],rolls:[]});
function apply(a,u){const changes={};for(const d of u.item)for(const[p,v]of Object.entries(d))if(p!=='_id')changes[p]=v;for(const[p,v]of Object.entries(u.activity))changes[`system.activities.${a.id}.${p}`]=v;
 const deltas=getDeltas(a.item,changes);for(const[p,v]of Object.entries(changes)){const m=p.match(/^system.activities\.([^.]+)\.(.+)$/);if(m)set(a.item.system.activities.get(m[1]),m[2],v);else set(a.item,p,v);}return{actor:[],item:{[a.item.id]:deltas}};}
async function use(a,{pay=true,fail=false,cached=false}={}){const subject=cached?{...a,actor:a.actor,item:{type:'spell'},getLinkedActivity:()=>a}:a;subject._prepareUsageUpdates=async config=>{const u=updates();if(pay)for(const c of a.consumption.targets){const uses=c.type==='itemUses'?a.item.system.uses:a.uses;const value=await nativeUsesConsumption.call({resolveCost:async()=>({total:Number(c.value)})},{},{uses,type:'glove',rolls:u.rolls,delta:{}});if(c.type==='itemUses')u.item.push({_id:a.item.id,'system.uses.spent':value.spent});else if(cached)u.item.push({_id:a.item.id,[`system.activities.${a.id}.uses.spent`]:value.spent});else u.activity['uses.spent']=value.spent;}return prepareGauntletUpdates(subject,config,u);};
 cancel=fail;const message={data:{system:{}}},u=await nativeConsume.call(subject,{},message,x=>apply(a,x));cancel=false;return u?{u,deltas:message.data.system.deltas}:false;}
async function refund(a,r){await nativeRefund.call(a,{actor:[],item:r.deltas.item},u=>apply(a,u));}
{
 const item=owned('arcanist-gauntlets'),one=activity(item,a=>a.flags.spikependium.gloveBudget===1),four=activity(item,a=>a.flags.spikependium.gloveBudget===4),five=activity(item,a=>a.flags.spikependium.gloveBudget===5);
 assert.equal(await use(one,{pay:false}),false);assert.equal(await use(one,{fail:true}),false);assert.equal(item.system.uses.spent,0);assert.equal(one.uses.spent,0);
 const first=await use(one);assert.equal(item.system.uses.spent,1);assert.equal(one.uses.spent,1);await assert.rejects(()=>use(one));await assert.rejects(()=>use(five));
 const next=await use(four);assert.equal(item.system.uses.spent,5);await refund(four,next);assert.equal(item.system.uses.spent,1);assert.equal(four.uses.spent,0);await refund(one,first);assert.equal(item.system.uses.spent,0);assert.equal(one.uses.spent,0);
 await use(five);const day=new Map([['day',1]]),recovered=await nativeRecoverUses.call({uses:item.system.uses,parent:item},day);assert.equal(recovered.updates.spent,0);const perLevel=await nativeRecoverUses.call({uses:five.uses,item},day);assert.equal(perLevel.updates.spent,0);
}
{
 const item=owned('great-badger'),normal=activity(item,a=>a.flags?.spikependium?.badgerClaws==='normal'),empowered=activity(item,a=>a.flags?.spikependium?.badgerClaws==='empowered'),power=activity(item,a=>a.type==='transform');
 assert.equal(canUseGauntlet(empowered),false);assert.notEqual(canUseGauntlet(normal),false);const paid=await use(power);assert.equal(item.system.uses.spent,1);await refund(power,paid);assert.equal(item.system.uses.spent,0);
 const e={active:true,duration:{expired:false},flags:{spikependium:{gloveBadger:true}},system:{origin:{activity:power.uuid}}};item.actor.effects.push(e);
 assert.equal(canUseGauntlet(normal),false);assert.notEqual(canUseGauntlet(empowered),false);assert.equal(empowered.attack.critical.threshold,19);assert.equal(empowered.attack.bonus,'1');assert.equal(empowered.damage.parts[0].bonus,'@mod+1');
 const model={parent:item.actor,attributes:{movement:{speeds:{walk:30,burrow:20,climb:0,fly:0,swim:0}}}};gauntletMovement.call(model,()=>{});assert.equal(model.attributes.movement.speeds.burrow,40);assert.equal(model.attributes.movement.max,40);e.duration.expired=true;assert.equal(canUseGauntlet(empowered),false);
 item.system.attuned=false;assert.equal(canUseGauntlet(normal),false);item.system.attuned=true;item.system.equipped=false;assert.equal(canUseGauntlet(power),false);
}
for(const id of ['salamander','mourning-gauntlets','mimicry']){
 const item=owned(id);
 for(const a of item.system.activities.filter(a=>a.type==='cast')){
  const raw=evidence.spells.find(s=>s.uuid===a.spell.uuid).document,base=clone(raw);a.relativeUUID=`.Item.${item.id}.Activity.${a.id}`;a.constructor={ENCHANTMENT_ID:'gloveEnchantment'};a.toObject=()=>({activation:clone(a.activation),duration:clone(a.duration),range:clone(a.range),target:clone(a.target)});
  a.getSpellChanges=()=>gauntletSpellChanges.call(a,()=>nativeGloveSpellChanges.call(a));
  const original={effects:base.effects.map(e=>({toObject:()=>clone(e)})),clone(changes){const d=clone(base);for(const[p,v]of Object.entries(changes))set(d,p,clone(v));return{toObject:()=>d};}};world.set(a.spell.uuid,original);
  const cache=await gauntletCachedSpell.call(a,()=>nativeGloveCachedSpellData.call(a));assert.match(cache.name,/[а-яё]/i);assert.match(cache.system.description.value,/[а-яё]/i);assert.equal(cache._stats.compendiumSource,a.spell.uuid);assert.equal(cache.system.source.rules,'2014');assert.equal(cache.system.source.custom,item.system.source.custom);assert.equal(cache.system.sourceItem,`equipment:${item.system.identifier}`);
  assert.deepEqual(base,raw,'cache cannot mutate the installed SRD document');const changes=cache.effects.at(-1).system.changes;
  if(id==='salamander'){assert.ok(changes.some(c=>c.key==='system.properties'&&c.value==='-concentration'));assert.equal(a.spell.level,4);}
  if(id==='mourning-gauntlets'){assert.ok(changes.some(c=>c.key==='activities[attack].attack.bonus'&&c.value==='8'));if(a.flags.spikependium.gloveCantripDice)assert.equal(JSON.parse(changes.find(c=>c.key==='activities[attack].damage.parts').value)[0].scaling.mode,'');else if(a.flags.spikependium.gloveSpell==='Chill Touch'){assert.ok(!changes.some(c=>c.key==='activities[attack].damage.parts'));assert.equal(Object.values(cache.system.activities)[0].damage.parts[0].scaling.mode,'whole');}}
  if(id==='mimicry'){for(const s of Object.values(cache.system.activities).filter(a=>a.type==='summon'))for(const p of s.profiles)assert.ok(evidence.actors.some(r=>r.uuid===p.uuid));}
 }
}
{
 const item=owned('mimicry'),hand=activity(item,a=>a.flags.spikependium.gloveDaily),spell=await use(hand,{cached:true});assert.equal(hand.uses.spent,1);assert.equal(item.system.uses.spent,0,'daily Hand is independent of five charges');await refund(hand,spell);assert.equal(hand.uses.spent,0);assert.equal(await use(hand,{cached:true,pay:false}),false);
 item.actor.classes={};assert.equal(canUseGauntlet(hand),false);
}
{
 const item=owned('traitor'),enchant=activity(item,a=>a.type==='enchant'),w={type:'weapon',system:{equipped:true},actor:item.actor,effects:[]},e={flags:{spikependium:{traitorWeapon:true}},disabled:false,isSuppressed:false,system:{origin:{activity:enchant.uuid}}};w.effects.push(e);e.parent=w;
 const part={number:1,denomination:8,types:['slashing'],base:true,clone(data){return{...this,...clone(data)};}},poison={...part,types:['poison'],base:false},a={item:w,getActionType:mode=>mode==='thrown'?'rwak':'mwak'};
 const result=gauntletDamageParts.call(a,()=>[part,poison],{});assert.deepEqual(part.types,['slashing']);assert.deepEqual(result[0].types,['necrotic']);assert.equal(result[1],poison);assert.deepEqual(result[2].types,['fire']);assert.equal(result[2].number,1);assert.equal(result[2].denomination,8);assert.equal(result[2].base,false);
 assert.equal(gauntletDamageParts.call(a,()=>[part],{attackMode:'thrown'}).length,1);assert.equal(gauntletEffectSuppression.call(e,()=>false),false);item.system.attuned=false;assert.equal(gauntletEffectSuppression.call(e,()=>false),true);assert.equal(gauntletDamageParts.call(a,()=>[part],{}).length,1);item.system.attuned=true;w.system.equipped=false;assert.equal(gauntletEffectSuppression.call(e,()=>false),true);
}
function target(){const t={isOwner:true,flags:{spikependium:{}},items:[],statuses:new Set(),system:{attributes:{hp:{value:10,max:20,effectiveMax:20,temp:0,tempmax:0,damage:10}},traits:{dr:{value:new Set(['necrotic'])}},_source:{attributes:{hp:{tempmax:0}}}},getRollData(){return this.system;},changeIsIgnored:()=>false,
 changeHasEffect(kind,d,{options}){if(options.ignore===true||options.ignore?.[kind]===true||options.ignore?.[kind]?.has(d.type))return false;return kind==='resistance'&&d.type==='necrotic'||kind==='immunity'&&this.immune&&d.type==='necrotic';},async update(u){if(this.fail)throw Error('HP write failed');for(const[p,v]of Object.entries(u))set(this,p,v);this.system.attributes.hp.damage=20-this.system.attributes.hp.value;}};t.calculateDamage=(d,o)=>calculateCompanionDamage.call(t,(d,o)=>nativeCalculateDamage.call(t,d,o),d,o);return t;}
{
 const item=owned('healing-gloves'),a=activity(item,a=>a.type==='heal'),card={author:{id:'caster'},getAssociatedActivity:()=>a},t=target();item.actor.isOwner=false;
 await nativeApplyDamage.call(t,[{type:'healing',value:4}],{originatingMessage:card});assert.equal(t.system.attributes.hp.value,14);assert.equal(t.flags.spikependium.healingGloveUsed,1);await nativeApplyDamage.call(t,[{type:'healing',value:4}],{originatingMessage:card});assert.equal(t.system.attributes.hp.value,14);
 await resetHealingGlove(t,{}, {type:'short'});assert.equal(t.flags.spikependium.healingGloveUsed,0);t.fail=true;await assert.rejects(()=>nativeApplyDamage.call(t,[{type:'healing',value:4}],{originatingMessage:card}));assert.equal(t.flags.spikependium.healingGloveUsed,0);t.fail=false;
 item.actor.testUserPermission=()=>false;await nativeApplyDamage.call(t,[{type:'healing',value:4}],{originatingMessage:card});assert.equal(t.system.attributes.hp.value,14);item.actor.testUserPermission=()=>true;
 t.system.attributes.hp.value=20;t.system.attributes.hp.damage=0;await nativeApplyDamage.call(t,[{type:'healing',value:4}],{originatingMessage:card});assert.equal(t.flags.spikependium.healingGloveUsed,0);
 t.system.attributes.hp.value=10;t.system.attributes.hp.damage=10;item.system.equipped=false;await nativeApplyDamage.call(t,[{type:'healing',value:4}],{originatingMessage:card});assert.equal(t.system.attributes.hp.value,10);
 item.system.equipped=true;const marked={data:{}};markGauntletDamage({subject:a},{},marked);assert.equal(marked.data.flags.spikependium.healingGloveBonus.item,item.uuid);
 const orphan={author:card.author,flags:marked.data.flags};await nativeApplyDamage.call(t,[{type:'healing',value:4}],{originatingMessage:orphan});assert.equal(t.system.attributes.hp.value,10,'orphaned receipt cannot bypass recipient limit');
 const wrong={...card,flags:clone(marked.data.flags)};wrong.flags.spikependium.healingGloveBonus.activity='Actor.other.Item.other.Activity.other';await nativeApplyDamage.call(t,[{type:'healing',value:4}],{originatingMessage:wrong});assert.equal(t.system.attributes.hp.value,10);
 card.flags=marked.data.flags;await nativeApplyDamage.call(t,[{type:'healing',value:4}],{originatingMessage:card});assert.equal(t.system.attributes.hp.value,14);
 item.actor.items.length=0;assert.equal(canUseGauntlet(a),false,'deleted source is unavailable');
}
{
 const item=owned('mourning-gauntlets'),a=activity(item,a=>a.type==='cast'),cached={item:{type:'spell'},getLinkedActivity:()=>a},message={data:{}};markGauntletDamage({subject:cached},{},message);assert.equal(message.data.flags.spikependium.ignoreNecroticResistance,true);
 const t=target(),source={flags:message.data.flags};assert.equal(t.calculateDamage([{type:'necrotic',value:10}],{}).amount,5);assert.equal(t.calculateDamage([{type:'necrotic',value:10}],{originatingMessage:source}).amount,10);t.immune=true;assert.equal(t.calculateDamage([{type:'necrotic',value:10}],{originatingMessage:source}).amount,0);
}
globalThis.ActiveEffect=class{constructor(data){this.data=data;}toObject(){return clone(this.data);}};globalThis._loc=s=>s;globalThis.staticID=s=>s;globalThis.Roll=class{constructor(formula,data){this.total=Number(CONFIG.Dice.BasicRoll.replaceFormulaData(formula,data));}async evaluate(){return this;}};
{
 const record=evidence.actors.find(a=>a.name==='arcane-hand'),doc=actors.find(a=>`Compendium.spikependium.creatures.Actor.${a._id}`===record.uuid);assert.ok(doc);assert.ok(doc.folder);assert.equal(doc.system.abilities.str.value,26);assert.equal(doc.system.attributes.ac.flat,20);assert.equal(doc.prototypeToken.actorLink,false);
 const summoned=clone(doc);summoned.classes={};summoned.items=list(summoned.items.map(i=>({...i,id:i._id,effects:[],system:{...i.system,hasAttack:Object.values(i.system.activities).some(a=>a.type==='attack'),activities:list(Object.values(i.system.activities))}})));for(const i of summoned.items)Object.defineProperty(i.system.activities,'size',{get(){return this.length;}});summoned.getRollData=()=>summoned.system;
 const cast=evidence.spells.find(s=>s.name==='Arcane Hand'),summon=Object.values(cast.document.system.activities)[0],result=await nativeSummonChanges.call({...summon,flat:{attack:8,save:16},creatureTypes:new Set(),creatureSizes:new Set(),relevantLevel:5,item:{uuid:'Actor.bard.Item.hand'},id:summon._id,uuid:'Actor.bard.Item.hand.Activity.summon',getRollData:()=>({mod:3,attributes:{hp:{max:61},prof:4}}),getApplicableEffects:async()=>[]},summoned,summon.profiles[0],{});
 assert.equal(result.actorUpdates['system.attributes.hp.max'],61);assert.equal(result.actorUpdates['system.attributes.hp.value'],61);assert.equal(result.actorUpdates['flags.dnd5e.summon'].mod,3);assert.ok(result.actorUpdates.items[0].effects[0].system.changes.some(c=>c.key==='activities[attack].attack.bonus'&&c.value===8));
 const crush=doc.items.flatMap(i=>Object.values(i.system.activities)).find(a=>a.name==='Сдавить уже схваченную цель');assert.match(crush.damage.parts[0].bonus,/flags.dnd5e.summon.mod/);
}
console.log('GS2 gloves: nine Russian sources/folders and two linked hands, original 2014 cached Cast data, fixed item cantrip scaling, charges/day-level budgets/refunds/cancellation, badger attack gates and speed, typed traitor enchantment and suppression, native necrotic resistance/immunity, atomic recipient healing/rest limit and native summoned Hand HP/attack/mod passed.');
