import {arcanaCast} from "./arcana-spells.mjs";

const KEY="spell:au-illusory-dragon",elements=new Set(['acid','cold','fire','lightning','necrotic','poison']);
const captured=new WeakMap(),prepared=new WeakMap(),using=new Set(),syncing=new Set(),saveWindows=new WeakMap();
const resolve=id=>id&&fromUuidSync(id,{strict:false});
const live=e=>e?.active&&!e.duration.expired&&!(Number.isFinite(e.duration.remaining)&&e.duration.remaining<=0);
const stage=a=>a?.item?.flags.spikependium?.dragonStudy&&a.type==='check'?'study':a?.item?.type==='spell'&&a.item.flags.spikependium?.key===KEY?a.flags?.spikependium?.dragonStage:null;
const phase=()=>game.combat?.started?{combat:game.combat.uuid,round:game.combat.round,turn:game.combat.turn}:{time:game.time.worldTime};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const path=id=>`flags.spikependium.dragonUses.${id}.active`;
const authority=origin=>game.users.activeGM?game.user.isActiveGM:origin.author?.id===game.user.id;
function paid(origin,refund=false){
 const r=origin?.flags.spikependium?.dragonUse,a=origin?.getAssociatedActivity?.({scaled:true}),caster=resolve(r?.caster),record=caster?.flags.spikependium?.dragonUses?.[r?.event];
 if(origin?.type!=='usage'||!r||!/^[A-Za-z0-9]{16}$/.test(r.event)||!['cast','fear','move','breath','study'].includes(r.stage)||!Number.isFinite(r.time)
  ||!a||stage(a)!==r.stage||a.uuid!==r.activity||a.actor?.uuid!==r.caster||!origin.author||!caster.testUserPermission(origin.author,'OWNER')
  ||record?.active!==1&&!(refund&&record?.active===0)||!same(record.data?.[0],r)||!origin.system.deltas?.actor?.some(d=>d.keyPath===path(r.event)&&d.delta===1)
  ||!Array.isArray(r.targets)||origin.system.targets?.length!==r.targets.length||!origin.system.targets.every(t=>r.targets.some(v=>v.actor===t.actor&&v.token===t.token)))return;
 return {r,a,caster,record,origin};
}
export const dragonCastPaid=origin=>{const i=paid(origin);return i?.r.stage==='cast'&&!i.record.ended;};
function source(origin){const i=paid(origin),arcana=arcanaCast(origin);return i?.r.stage==='cast'&&!i.record.ended&&arcana?.receipt.kind==='illusory-dragon'
 &&live(arcana.concentration)&&game.time.worldTime<i.r.time+60?{...i,...arcana}:undefined;}
function boundRoot(info){const r=paid(resolve(info?.r.source));return r?.r.stage==='cast'&&(info.r.stage==='study'||r.a.item.uuid===info.a.item.uuid)?r:undefined;}
export const dragonFearPaid=origin=>{const i=paid(origin);return i?.r.stage==='fear'&&!i.record.fearEnded&&boundRoot(i)&&!!source(resolve(i.r.source));};
function current(a){for(const e of a.actor.effects){if(e.flags.spikependium?.arcanaSpell!=='illusory-dragon'||!live(e))continue;const i=source(resolve(e.system.origin?.message));if(i?.a.item.uuid===a.item.uuid)return i;}}
function area(root){const r=resolve(root?.origin.flags.spikependium?.dragonArea);return r?.documentName==='Region'&&r.getFlag('dnd5e','activity')===root.a.uuid?r:undefined;}
function roots(){return game.messages.map(m=>source(m)).filter(i=>i&&area(i)&&(game.user.isGM||!i.origin.blind&&(!i.origin.whisper.length||i.origin.whisper.includes(game.user.id))));}
function knowledge(effect){const stamp=effect.flags.spikependium?.dragonKnowledge,i=paid(resolve(stamp?.usage),true),root=source(resolve(i?.r.source));return root&&i.r.stage==='study'&&i.record.learned===1&&i.r.caster===effect.actor?.uuid&&stamp.event===i.r.event?{...i,root}:undefined;}
function knows(actor,root){return !!actor?.effects.some(e=>e.flags.spikependium?.dragonKnowledgeProfile&&live(e)&&knowledge(e)?.root.origin.uuid===root.origin.uuid);}
function eligible(a,r){
 if(!a.actor.isOwner||!same(r.phase,phase()))return false;
 if(r.stage==='cast')return elements.has(r.element)&&Number.isInteger(r.dc)&&r.dc>0&&!a.item.flags.spikependium?.dragonRetained;
 const root=source(resolve(r.source));if(!root||!area(root)||r.stage!=='study'&&root.a.item.uuid!==a.item.uuid)return false;
 if(r.stage==='study')return r.targets.length===1&&r.targets[0].actor===a.actor.uuid&&r.targets[0].token===r.token&&!knows(a.actor,root);
 if(r.stage==='move')return true;
 if(!r.targets.length||new Set(r.targets.map(t=>t.actor)).size!==r.targets.length||r.targets.some(t=>{const token=resolve(t.token);return token?.actor?.uuid!==t.actor||!token.actor.system.isCreature||token.parent!==area(root).parent;}))return false;
 if(r.stage==='breath')return a.flags.spikependium.dragonElement===root.r.element;
 return r.stage==='fear'&&r.targets.length===1&&same(r.phase,root.r.phase)&&!Object.values(a.actor.flags.spikependium?.dragonUses??{}).some(rec=>rec.data?.[0]?.stage==='fear'&&rec.data[0].source===r.source&&rec.data[0].targets.some(t=>t.actor===r.targets[0].actor));
}
export function prepareDragon(a,config,dialog){
 const kind=stage(a);if(!kind)return;
 if(kind==='cast'&&a.item.flags.spikependium?.dragonRetained){ui.notifications.warn('Временная копия хранит созданную иллюзию и не даёт нового сотворения.');return false;}
 const Base=dialog.applicationClass;dialog.configure=true;
 if(kind==='study')config.spikependium={...config.spikependium,dragonOrigin:config.spikependium?.dragonOrigin??roots().at(-1)?.origin.uuid??''};
 dialog.applicationClass=class extends Base{async _prepareConsumptionContext(context,options){
  context=await super._prepareConsumptionContext(context,options);
  if(kind==='cast')context.fields.push({name:'spikependium.dragonElement',value:this.config.spikependium?.dragonElement??'fire',field:new foundry.data.fields.StringField({label:'Неизменная стихия дыхания',choices:{acid:'Кислота',cold:'Холод',fire:'Огонь',lightning:'Электричество',necrotic:'Некротическая энергия',poison:'Яд'}})});
  if(kind==='study')context.fields.push({name:'spikependium.dragonOrigin',value:this.config.spikependium?.dragonOrigin??'',field:new foundry.data.fields.StringField({label:'Исследуемый дракон',choices:{'':'Выберите активную иллюзию',...Object.fromEntries(roots().map(i=>[i.origin.uuid,`${i.a.item.name} — ${i.caster.name??i.caster.id}`]))}})});
  context.fields.push({name:'spikependium.dragonConfirmed',value:this.config.spikependium?.dragonConfirmed??false,field:new foundry.data.fields.BooleanField({label:kind==='cast'?'Вижу свободное место в 120 футах':kind==='fear'?'Это враг, видевший именно появление иллюзии':kind==='study'?'Я исследую выбранную иллюзию действием Изучение':'Путь до 60 футов, Конус из положения иллюзии и выбранные цели проверены'}),input:context.inputs.createCheckboxInput});
  context.hasConsumption=true;return context;
 }};
}
export async function dragonScaling(wrapped,config,message,item){
 const kind=stage(this);if(kind&&kind!=='cast'){
  const root=kind==='study'?source(resolve(config.spikependium?.dragonOrigin)):current(this);if(!root)return false;
  const prefix=`system.activities.${this.id??this._id}`;
  if(kind==='study')item.updateSource({[`${prefix}.check.dc.calculation`]:'',[`${prefix}.check.dc.formula`]:String(root.r.dc)});
  else if(this.type==='save')item.updateSource({[`${prefix}.save.dc.calculation`]:'',[`${prefix}.save.dc.formula`]:String(root.r.dc)});
 }
 return wrapped(config,message,item);
}
export function captureDragon(a,config,message){
 captured.delete(a);const kind=stage(a);if(!kind)return;
 if(message.message){ui.notifications.warn('После возврата используйте новое действие на листе; прежние последствия сверяет Мастер.');return false;}
 const token=a.getUsageToken?.(),root=kind==='cast'?null:kind==='study'?source(resolve(config.spikependium?.dragonOrigin)):current(a),data=a.getRollData();
 const targets=['cast','move'].includes(kind)?(message.data?.system?.targets??[]).map(t=>({actor:t.actor,token:t.token})):kind==='study'?[{actor:a.actor.uuid,token:token?.uuid}]:[...game.user.targets].map(t=>{t=t.document??t;return {actor:t.actor?.uuid,token:t.uuid};});
 const r={event:null,stage:kind,caster:a.actor.uuid,activity:a.uuid,time:game.time.worldTime,phase:phase(),start:ActiveEffect.implementation.getEffectStart(),token:token?.uuid,source:root?.origin.uuid??null,
  targets,element:kind==='cast'?config.spikependium?.dragonElement??'fire':root?.r.element,dc:kind==='cast'?(a.flat?.save??data.abilities?.[a.spellcastingAbility??a.ability]?.dc??data.attributes?.spell?.dc):root?.r.dc};
 if(!token||token.actor?.uuid!==a.actor.uuid||message.create===false||config.spikependium?.dragonConfirmed!==true||!eligible(a,r)
  ||message.data?.system?.targets&&(message.data.system.targets.length!==targets.length||!message.data.system.targets.every(t=>targets.some(v=>v.actor===t.actor&&v.token===t.token)))||kind==='study'&&a.check.dc.value!==r.dc){ui.notifications.warn('Иллюзорный дракон: проверьте активное сотворение, стихию, цели и подтверждение условий. Первоначальный страх доступен только при появлении, один раз для каждого врага.');return false;}
 captured.set(a,r);
 if(token.hidden||targets.some(t=>resolve(t.token)?.hidden)||root?.origin.blind||root?.origin.whisper.length){message.data??={};message.data.whisper=root?.origin.whisper.length?[...root.origin.whisper]:game.users.filter(u=>u.isGM).map(u=>u.id);message.data.blind=!!token.hidden||targets.some(t=>resolve(t.token)?.hidden)||!!root?.origin.blind;}
}
export function prepareDragonUpdates(a,_config,updates){
 prepared.delete(a);if(!stage(a))return updates;const saved=captured.get(a);if(!saved||!eligible(a,saved))return false;
 const r={...saved,event:foundry.utils.randomID()};updates.actor[`flags.spikependium.dragonUses.${r.event}`]={data:[r],active:1};
 if(r.stage==='cast'&&updates.delete.includes(a.item.id)){
  updates.delete=updates.delete.filter(id=>id!==a.item.id);r.retained=true;let item=updates.item.find(i=>i._id===a.item.id);if(!item)updates.item.push(item={_id:a.item.id});
  item['flags.spikependium.dragonRetained']=true;item['flags.spikependium.dragonRetainedFor']=r.event;item['flags.spikependium.dragonRetainedUntil']=r.time+60;item['flags.dnd5e.-=cachedFor']=null;item['system.prepared']=1;
 }
 prepared.set(a,r);return updates;
}
export function recordDragonConsumption(a,_config,message){const r=prepared.get(a);if(!r||foundry.utils.getProperty(a.actor,path(r.event))!==1)return;const deltas=((message.data.system??={}).deltas??={}).actor??=[];if(!deltas.some(d=>d.keyPath===path(r.event)))deltas.push({keyPath:path(r.event),delta:1});}
export function recordDragonUsage(a,message){const r=prepared.get(a);prepared.delete(a);if(!r||foundry.utils.getProperty(a.actor,path(r.event))!==1)return;
 foundry.utils.setProperty(message,'data.flags.spikependium.dragonUse',r);foundry.utils.setProperty(message,'data.flags.dnd5e.item.data',a.item.toObject());
 if(r.stage==='fear')foundry.utils.setProperty(message,'data.system.concentration',source(resolve(r.source))?.concentration.id);
}
export async function dragonUse(wrapped,...args){if(!stage(this))return wrapped(...args);if(using.has(this.actor.uuid))return;using.add(this.actor.uuid);try{return await wrapped(...args);}finally{using.delete(this.actor.uuid);}}
export async function recordDragonArea(a,_config,result){if(stage(a)!=='cast')return;const root=source(result?.message),region=result?.templates?.[0];if(!root||!region||result.templates.length!==1||region.getFlag('dnd5e','activity')!==a.uuid||!a.actor.isOwner)return;await root.origin.setFlag('spikependium','dragonArea',region.uuid);}
export async function bindDragonArea(a,templates){if(stage(a)!=='cast')return;const root=current(a);if(root&&!root.origin.flags.spikependium?.dragonArea)await recordDragonArea(a,{}, {message:root.origin,templates});}
export async function syncDragon(){
 const actors=new Map([...game.actors,...[...game.scenes].flatMap(s=>[...s.tokens].map(t=>t.actor))].filter(Boolean).map(a=>[a.uuid,a]));
 for(const a of actors.values()){
  if(a.effects.some(e=>e.flags.spikependium?.dragonKnowledgeProfile||e.flags.spikependium?.arcanaSpell==='illusory-dragon-fear'))a.reset();
  if(!a.isOwner)continue;
  for(const item of [...a.items]){const f=item.flags.spikependium,r=a.flags.spikependium?.dragonUses?.[f?.dragonRetainedFor]?.data?.[0];
   if(f?.key!==KEY||!f.dragonRetained||!r?.retained||r.stage!=='cast'||r.caster!==a.uuid||typeof r.activity!=='string'||!r.activity.startsWith(`${item.uuid}.Activity.`)||f.dragonRetainedUntil!==r.time+60||game.time.worldTime<f.dragonRetainedUntil||syncing.has(item.uuid))continue;
   const origin=game.messages.find(m=>m.flags.spikependium?.dragonUse?.event===r.event);if(!paid(origin,true)||!authority(origin))continue;
   syncing.add(item.uuid);try{await a.deleteEmbeddedDocuments('Item',[item.id]);}finally{syncing.delete(item.uuid);}
  }
 }
 if(!game.user.isActiveGM)return;
 for(const origin of game.messages){const i=paid(origin,true);if(i?.r.stage!=='cast')continue;const region=area(i);if(!region||syncing.has(region.uuid))continue;
  if(!i.caster.effects.get(origin.system.concentration)||game.time.worldTime>=i.r.time+60){syncing.add(region.uuid);try{await i.caster.update({[`flags.spikependium.dragonUses.${i.r.event}.ended`]:true});await region.parent.deleteEmbeddedDocuments('Region',[region.id]);}finally{syncing.delete(region.uuid);}}
 }
}
export function dragonSuppression(wrapped,...args){const native=wrapped(...args);return this.flags.spikependium?.dragonKnowledgeProfile&&!knowledge(this)||native;}
function rollOrigin(message){const v=message.data?.system?.origin;return typeof v==='string'?game.messages.get(v):v;}
function saveInfo(config,message){const origin=rollOrigin(message),i=paid(origin),actor=config.subject?.actor??config.subject;
 if(!i||!['fear','breath'].includes(i.r.stage)||config.ability!==(i.r.stage==='fear'?'wis':'int')||!i.r.targets.some(t=>t.actor===actor?.uuid))return;
 const root=source(resolve(i.r.source));if(!root)return;
 const repeat=i.r.stage==='fear'&&origin.getAssociatedRolls('save').some(m=>m.getAssociatedActor()?.uuid===actor.uuid&&m.system.ability==='wis'&&m.rolls[0]?._evaluated);
 return {i,root,actor,repeat,known:knows(actor,root)};
}
function advantage(options){options.disadvantage||=options.advantageMode===-1;options.advantage=true;if(options.advantageMode!==undefined)options.advantageMode=options.disadvantage?0:1;}
export function prepareDragonSave(config,dialog,message){
 const i=saveInfo(config,message);if(!i)return;
 if(i.i.r.stage==='fear'&&i.i.record.fearEnded){ui.notifications.warn('Страх этого дракона для цели уже закончился.');return false;}
 saveWindows.set(config,{usage:i.i.origin.uuid,known:i.known,repeat:i.repeat});
 if(i.known&&(i.repeat||i.i.r.stage==='breath')){config.spikependium={...config.spikependium,dragonAdvantage:true};for(const r of config.rolls)advantage(r.options??={});}
 if(i.repeat){const Base=dialog.applicationClass??CONFIG.Dice.D20Roll.DefaultConfigurationDialog;dialog.configure=true;dialog.applicationClass=class extends Base{async _prepareConfigurationContext(context,options){context=await super._prepareConfigurationContext(context,options);context.fields.push({name:'spikependium.dragonRepeatConfirmed',value:this.config.spikependium?.dragonRepeatConfirmed??false,field:new foundry.data.fields.BooleanField({label:'Конец хода цели: она не видит иллюзорного дракона'})});return context;}
  _buildConfig(roll,formData,index){roll=super._buildConfig(roll,formData,index);this.config.spikependium={...this.config.spikependium,dragonRepeatConfirmed:formData?.get('spikependium.dragonRepeatConfirmed')??this.config.spikependium?.dragonRepeatConfirmed??false};return roll;}
 };}
}
export function buildDragonSave(config,roll){if(config.spikependium?.dragonAdvantage)advantage(roll.options??={});}
export function finalizeDragonSave(_rolls,config,_dialog,message){const prior=saveWindows.get(config);if(!prior)return;const i=saveInfo(config,message);
 if(!i||i.i.origin.uuid!==prior.usage||i.known!==prior.known||i.repeat!==prior.repeat||i.repeat&&config.spikependium?.dragonRepeatConfirmed!==true){ui.notifications.warn('Проверьте условие повторного спасброска и состояние распознавания дракона.');return false;}}
export function prepareDragonStudyRoll(config,_dialog,message){const origin=rollOrigin(message),i=paid(origin);if(origin?.flags.spikependium?.dragonUse?.stage!=='study')return;if(!i)return false;
 const actor=config.subject?.actor??config.subject;if(actor?.uuid!==i.r.caster||config.skill!=='inv'||config.ability&&config.ability!=='int'||i.record.studyResolved){ui.notifications.warn('Изучение требует одной проверки Интеллекта (Расследование) самого оплатившего действие наблюдателя. Для новой попытки используйте новое Действие.');return false;}}
export async function dragonStudyRoll(wrapped,config={},dialog={},message={}){
 const origin=rollOrigin(message),i=paid(origin);if(origin?.flags.spikependium?.dragonUse?.stage!=='study')return wrapped(config,dialog,message);if(!i||message.create===false)return [];
 const key=`study:${i.r.event}`;
 if(this.uuid!==i.r.caster||!this.isOwner||!source(resolve(i.r.source))||i.record.studyStarted||i.record.studyResolved||using.has(key)){
  ui.notifications.warn('Изучение уже разрешено или его начатый бросок утрачен. Новая попытка требует нового Действия; утраченный исход восстанавливает Мастер.');return [];
 }
 using.add(key);
 try{
  await this.update({[`flags.spikependium.dragonUses.${i.r.event}.studyStarted`]:true});
  const result=await wrapped(config,dialog,message);
  const cards=origin.getAssociatedRolls('skill').filter(m=>m.getAssociatedActor()?.uuid===this.uuid);
  if(cards.length)for(const card of cards)await syncDragonRoll(card);
  else if(!result?.length)await this.update({[`flags.spikependium.dragonUses.${i.r.event}.studyStarted`]:false});
  else ui.notifications.warn('Результат Изучения не сохранился. Мастер восстанавливает исход без автоматического переброска.');
  return result;
 }finally{using.delete(key);}
}
export async function syncDragonRoll(card){
 if(!['save','skill'].includes(card?.type))return;const origin=card.getOriginatingMessage(),i=paid(origin);if(!i||!['fear','study'].includes(i.r.stage)||!authority(origin))return;
 const root=source(resolve(i.r.source)),actor=card.getAssociatedActor?.(),roll=card.rolls[0];if(!root||!actor?.isOwner||!card.author||!actor.testUserPermission(card.author,'OWNER')||!(roll instanceof CONFIG.Dice.D20Roll)||!roll._evaluated||!Number.isFinite(roll.total)||roll.options.target!==root.r.dc)return;
 if(card.type==='save'&&i.r.stage==='fear'&&card.system.ability==='wis'&&i.r.targets.some(t=>t.actor===actor.uuid)&&(card.system.forceSuccess||!roll.isFailure)){
  await i.caster.update({[`flags.spikependium.dragonUses.${i.r.event}.fearEnded`]:true});
  const ids=actor.effects.filter(e=>e.system.origin?.message===origin.uuid).map(e=>e.id);if(ids.length)await actor.deleteEmbeddedDocuments('ActiveEffect',ids);return;
 }
 if(i.r.stage!=='study'||card.type!=='skill'||actor.uuid!==i.r.caster||card.system.skill!=='inv'||card.system.ability!=='int')return;
 const saved=i.record.studyResult;if(saved&&saved.message!==card.uuid)return;
 const success=saved?saved.success:card.system.forceSuccess||!roll.isFailure;
 if(!saved)await actor.update({[`flags.spikependium.dragonUses.${i.r.event}.studyResult`]:{message:card.uuid,success},[`flags.spikependium.dragonUses.${i.r.event}.studyResolved`]:true});
 if(!success)return;
 await actor.update({[`flags.spikependium.dragonUses.${i.r.event}.learned`]:1});if(origin.flags.spikependium?.dragonKnowledgeApplied||syncing.has(origin.uuid))return;syncing.add(origin.uuid);
 try{
  const profile=root.a.item.effects.find(e=>e.flags.spikependium?.dragonKnowledgeProfile),exists=actor.effects.some(e=>e.flags.spikependium?.dragonKnowledge?.event===i.r.event);if(!profile)return;
  if(!exists){const tray=new dnd5e.applications.components.EffectApplicationElement();tray.chatMessage=origin;const {action,data}=await tray._prepareEffectData(profile,actor);
   data.duration={value:60,units:'seconds',expiry:null,expired:false};data.start=root.r.start;
   foundry.utils.setProperty(data,'flags.spikependium.dragonKnowledge',{usage:origin.uuid,event:i.r.event});foundry.utils.setProperty(data,'flags.dnd5e.dependentOn',root.concentration.uuid);foundry.utils.setProperty(data,'system.origin.effect',root.concentration.uuid);
   if(action==='create')await actor.createEmbeddedDocuments('ActiveEffect',[data]);else await actor.updateEmbeddedDocuments('ActiveEffect',[data]);
  }
  await origin.setFlag('spikependium','dragonKnowledgeApplied',true);
 }finally{syncing.delete(origin.uuid);}
}
export async function resumeDragon(){for(const card of game.messages)await syncDragonRoll(card);await syncDragon();}
export async function dragonDamage(wrapped,config={},dialog={},message={}){
 if(stage(this)!=='breath')return wrapped(config,dialog,message);
 const id=config.event?.target?.closest('[data-message-id]')?.dataset.messageId,origin=id?game.messages.get(id):rollOrigin(message),i=paid(origin),root=boundRoot(i);
 if(!i||!root||i.a.uuid!==this.uuid||root.r.element!==this.flags.spikependium.dragonElement||!this.actor.isOwner){ui.notifications.warn('Бросайте дыхание из оплаченной карточки выбранной стихии дракона.');return;}
 message=foundry.utils.deepClone(message);foundry.utils.setProperty(message,'data.flags.spikependium.dragonDamage',{usage:origin.uuid,event:i.r.event});foundry.utils.setProperty(message,'data.system.origin',origin.id);foundry.utils.setProperty(message,'data.system.targets',structuredClone(origin.system.targets));
 if(origin.whisper.length){foundry.utils.setProperty(message,'data.whisper',[...origin.whisper]);message.rollMode='gm';}if(origin.blind){foundry.utils.setProperty(message,'data.blind',true);message.rollMode='blind';}return wrapped(config,dialog,message);
}
export function guardDragonDamage(actor,amount,updates,options){const card=options.originatingMessage,a=card?.getAssociatedActivity?.(),binding=card?.flags.spikependium?.dragonDamage;if(stage(a)!=='breath'&&!binding)return;
 const i=paid(resolve(binding?.usage)),root=boundRoot(i);if(card?.type!=='damage'||!i||!root||binding.event!==i.r.event||a?.uuid!==i.a.uuid||!i.r.targets.some(t=>t.actor===actor.uuid)||!card.author||!i.caster.testUserPermission(card.author,'OWNER')||actor.flags.spikependium?.dragonDamageApplied?.[i.r.event]||!Number.isFinite(amount)||amount<0||!card.rolls.length||!card.rolls.every(r=>r instanceof CONFIG.Dice.DamageRoll&&r._evaluated&&Number.isFinite(r.total)&&r.options.type===root.r.element)){ui.notifications.warn('Неверная стихия или цель, отменённый расход либо уже применённое дыхание дракона.');return false;}
 updates[`flags.spikependium.dragonDamageApplied.${i.r.event}`]=1;
}
export function dragonDeltaLabel(wrapped,...args){const result=wrapped(...args);if(/^flags\.spikependium\.dragonUses\.[A-Za-z0-9]{16}\.active$/.test(this.keyPath))result.label='Иллюзорный дракон: применение';return result;}
function fearEffects(config){const actor=config.subject?.actor??config.subject;return actor?.effects.filter(e=>e.flags.spikependium?.arcanaSpell==='illusory-dragon-fear'&&live(e)&&dragonFearPaid(resolve(e.system.origin?.message)))??[];}
export function prepareDragonFearTest(config,dialog){
 if(!fearEffects(config).length)return;config.spikependium={...config.spikependium,dragonFearVisible:config.spikependium?.dragonFearVisible??false};
 const Base=dialog.applicationClass??CONFIG.Dice.D20Roll.DefaultConfigurationDialog;dialog.configure=true;dialog.applicationClass=class extends Base{
  async _prepareConfigurationContext(context,options){context=await super._prepareConfigurationContext(context,options);context.fields.push({name:'spikependium.dragonFearVisible',value:this.config.spikependium.dragonFearVisible,field:new foundry.data.fields.BooleanField({label:'Сейчас вижу хотя бы одного дракона, вызывающего этот страх'})});return context;}
  _buildConfig(roll,formData,index){roll=super._buildConfig(roll,formData,index);this.config.spikependium.dragonFearVisible=formData?.get('spikependium.dragonFearVisible')??this.config.spikependium.dragonFearVisible;return roll;}
 };
}
export function buildDragonFearTest(config,roll){
 const options=roll.options??={},previous=options.spikependiumDragonFear;
 if(previous&&options.disadvantage===true&&options.advantageMode===previous.appliedMode)for(const[key,value]of Object.entries(previous.before)){if(value===undefined)delete options[key];else options[key]=value;}
 delete options.spikependiumDragonFear;
 if(!config.spikependium?.dragonFearVisible||!fearEffects(config).length)return;
 const before={advantage:options.advantage,disadvantage:options.disadvantage,advantageMode:options.advantageMode};options.advantage||=options.advantageMode===1;options.disadvantage=true;if(options.advantageMode!==undefined)options.advantageMode=options.advantage?0:-1;
 options.spikependiumDragonFear={before,appliedMode:options.advantageMode};
}
export function finalizeDragonFearTest(_rolls,config){if(config.spikependium?.dragonFearVisible&&!fearEffects(config).length){ui.notifications.warn('Страх Иллюзорного дракона изменился. Повторите бросок с актуальными условиями.');return false;}}
