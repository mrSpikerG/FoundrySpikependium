const KEY="feat:au-boon-of-school-mastery",FREE="auSchoolRoutine0",ABILITIES=["int","wis","cha"];
const SCHOOLS={evo:"Воплощение",ill:"Иллюзия",nec:"Некромантия",abj:"Ограждение",enc:"Очарование",trs:"Преобразование",con:"Призыв",div:"Прорицание"};
const mastery=item=>item?.flags?.spikependium?.key===KEY;
const role=a=>a?.type==="ItemChoice"&&mastery(a.item)?Object.entries(a.item.flags.spikependium.schoolMasteryChoices??{}).find(([,id])=>id===(a.id??a._id))?.[0]:null;
const resolve=(uuid,relative)=>uuid&&fromUuidSync(uuid,{strict:false,...(relative?{relative}:{})});
const duplicate=(actor,school,except)=>actor.items.some(i=>i.id!==except&&mastery(i)&&i.flags.spikependium.schoolMastery?.school===school);
function classes(actor){
 const out=[];
 for(const c of actor.items.filter(i=>i.type==="class")){
  const casting=c.spellcasting??c.system.spellcasting;if(!casting||casting.progression==="none"||!ABILITIES.includes(casting.ability))continue;
  const lists=new Set(),own=`class:${c.system.identifier}`;
  if(dnd5e.registry.spellLists.forType(own))lists.add(own);
  else{
   const roots=[c.id,c.subclass?.id].filter(Boolean),features=actor.items.filter(i=>i.type==="feat"&&i.system.type?.value==="class"&&/(?:^|-)(spellcasting|pact-magic)$/.test(i.system.identifier)
    &&roots.includes((i.flags.dnd5e?.advancementRoot??i.flags.dnd5e?.advancementOrigin??"").split(".")[0]));
   for(const item of [c,c.subclass,...features].filter(Boolean))for(const a of item.system.advancement??[])if(a.type==="ItemChoice"&&a.configuration.type==="spell"&&a.configuration.restriction.level!=="0")
    for(const list of a.configuration.restriction.list)if(list.startsWith("class:")&&dnd5e.registry.spellLists.forType(list))lists.add(list);
  }
  for(const list of lists)out.push({class:c.id,list,ability:casting.ability,label:`${c.name} — ${dnd5e.registry.spellLists.forType(list).name??list}`});
 }return out;
}
function binding(item,actor){const saved=item?.flags?.spikependium?.schoolMastery;
 if(!mastery(item)||!SCHOOLS[saved?.school]||saved.caster!==actor?.uuid||duplicate(actor,saved.school,item.id))return;
 const source=classes(actor).find(s=>s.class===saved.class&&s.list===saved.list&&s.ability===saved.ability);
 return source?{...source,school:saved.school}:null;
}
async function configure(actor,itemData){
 if(!actor?.isOwner)throw Error("Дар освоения школы магии: нужен доступ владельца персонажа.");
 const schools=Object.keys(SCHOOLS).filter(s=>!duplicate(actor,s)),sources=classes(actor),escape=foundry.utils.escapeHTML;
 if(!schools.length)throw Error("Все восемь школ уже выбраны этим даром. Повтор требует новой школы.");
 if(!sources.length)throw Error("Дар освоения школы магии: не найден ваш заклинательный класс с зарегистрированным списком и характеристикой. Сначала настройте класс/подкласс и его список заклинаний.");
 const answer=await foundry.applications.api.DialogV2.input({window:{title:"Дар освоения школы магии"},rejectClose:false,
  content:`<p>Выберите новую школу и свой класс. Только рутинное заклинание ограничено списком этого класса; Фирменный арканум может быть из любого списка. Для атаки/СЛ используется характеристика выбранного класса; в тексте дара она не уточняется.</p><div class="form-group"><label>Освоенная школа</label><select name="school">${schools.map(s=>`<option value="${s}">${SCHOOLS[s]}</option>`).join('')}</select></div><div class="form-group"><label>Класс и список Рутинного сотворения</label><select name="classSource">${sources.map((s,i)=>`<option value="${i}">${escape(s.label)}</option>`).join('')}</select></div>`,ok:{label:"Настроить дар"}});
 const source=sources.find((_s,i)=>String(i)===answer?.classSource),school=answer?.school;
 if(!source||!schools.includes(school))throw Error("Выбор школы или класса отменён; дар не добавлен.");
 if(!actor.isOwner||duplicate(actor,school)||!classes(actor).some(s=>JSON.stringify(s)===JSON.stringify(source)))throw Error("Школы, класс или права изменились; добавьте дар заново.");
 const data=foundry.utils.deepClone(itemData);data.flags.spikependium.schoolMastery={caster:actor.uuid,school,class:source.class,list:source.list,ability:source.ability};
 for(const a of data.system.advancement){const kind=Object.entries(data.flags.spikependium.schoolMasteryChoices).find(([,id])=>id===a._id)?.[0];if(kind)configureChoice(a,kind,{...source,school},false);}
 for(const[id,a]of Object.entries(data.system.activities??{}))if(a.flags?.spikependium?.schoolMasteryRoutine)delete data.system.activities[id];
 return data;
}
function configureChoice(a,kind,source,live=true){
 const updates={"configuration.restriction.school":[source.school],"configuration.restriction.list":kind==="routine"?[source.list]:[],
  "configuration.restriction.level":kind==="routine"?"1":"available","configuration.spell.ability":[source.ability]};
 if(live)a.updateSource(updates);else for(const[path,value]of Object.entries(updates))foundry.utils.setProperty(a,path,value);
}
export async function schoolMasteryDrop(wrapped,event,data,...args){return wrapped(event,mastery(data)?await configure(this.inventorySource,data):data,...args);}
export async function schoolMasteryCreate(wrapped,...args){const data=await wrapped(...args);if(!mastery(data))return data;
 if(data.flags.spikependium.schoolMastery?.caster===this.actor.uuid&&binding(data,this.actor))return data;
 return configure(this.actor,data);
}
export function schoolMasteryMaxLevel(wrapped,...args){return role(this.advancement)==="signature"?7:wrapped(...args);}
export function schoolMasteryContext(wrapped,...args){
 const a=this.advancement,kind=role(a);if(kind){const source=binding(a.item,a.actor);if(!source)throw Error("Дар освоения школы магии: класс, характеристика или школа изменились.");configureChoice(a,kind,source);}
 return wrapped(...args);
}
function granted(feat,kind){
 const id=feat.flags.spikependium.schoolMasteryChoices?.[kind],a=feat.system.advancement.find(a=>(a.id??a._id)===id);
 const entries=Object.entries(a?.value.added?.[0]??{});if(entries.length!==1)return;
 const [spellId,uuid]=entries[0],spell=feat.actor.items.get(spellId);
 if(spell?.type!=="spell"||spell.flags.dnd5e?.advancementOrigin!==`${feat.id}.${id}`||(spell.flags.dnd5e?.sourceId??spell._stats?.compendiumSource)!==uuid)return;
 return{spell,uuid,a};
}
function routineData(spell,ability){return{_id:FREE,type:"cast",name:`Рутинное сотворение: ${spell.name}`,img:spell.img??"systems/dnd5e/icons/svg/activity/cast.svg",flags:{spikependium:{schoolMasteryRoutine:true}},
 activation:{type:spell.system.activation.type,value:spell.system.activation.value,condition:"",override:false},consumption:{targets:[],scaling:{allowed:false},spellSlot:false},
 duration:{override:false},range:{override:false},target:{override:false},spell:{ability,level:1,properties:["vocal","somatic","material"],spellbook:false,uuid:spell.uuid}};}
function refreshRoutine(feat,source){const r=granted(feat,"routine");if(r)feat.updateSource({[`system.activities.${FREE}`]:routineData(r.spell,source.ability)});}
export async function schoolMasteryApply(wrapped,level,data={},options={}){
 const kind=role(this);if(!kind)return wrapped(level,data,options);
 const source=binding(this.item,this.actor);if(!source)throw Error("Дар освоения школы магии: проверьте класс, школу и повторные дары.");
 if(Number(level)!==0||data.replace||data.retainedData?.replaced||data.ability&&data.ability!==source.ability)throw Error("Дар не даёт замен при повышении уровня и использует согласованную характеристику класса.");
 const selected=data.selected??(options.initial?[]:Object.keys(data.retainedData??{}).filter(k=>!['items','ability','replaced'].includes(k)));
 if(selected.length>1||selected.length&&this.getCounts(level).full)throw Error("Выберите одно заклинание в каждом шаге дара.");
 for(const uuid of selected){const s=await fromUuid(uuid);if(s?.type!=="spell"||s.system.school!==source.school||!Number.isInteger(s.system.level)
  ||(kind==="routine"?(s.system.level!==1||!dnd5e.registry.spellLists.forType(source.list)?.has(s)):(s.system.level<0||s.system.level>7)))throw Error("Заклинание не подходит по школе, уровню или списку класса для этого шага.");}
 if(!binding(this.item,this.actor)||JSON.stringify(binding(this.item,this.actor))!==JSON.stringify(source))throw Error("Источник дара изменился во время выбора.");
 configureChoice(this,kind,source);const result=await wrapped(level,{...data,selected,ability:source.ability},options);
 if(kind==="routine")refreshRoutine(this.item,source);
 else{
  const g=granted(this.item,"signature");if(g?.spell.system.level===0){const activities=foundry.utils.deepClone(g.spell.toObject().system.activities),add={};
   for(const [id,a]of Object.entries(activities)){if(a.type==="forward")continue;a.consumption??={targets:[]};a.consumption.spellSlot=true;
    const existing=Object.values(activities).find(f=>f.type==="forward"&&f.activity.id===id&&f.consumption.targets.some(t=>t.type==="itemUses"&&!t.target));
    if(existing)continue;const key=foundry.utils.randomID();add[key]={_id:key,type:"forward",name:`${a.name||g.spell.name} (бесплатно за Долгий отдых)`,activity:{id},consumption:{targets:[{type:"itemUses",target:"",value:"1"}]}};
   }g.spell.updateSource({"system.activities":{...activities,...add}});
  }
 }
 return result;
}
function freeInfo(a){
 if(a?.type==="cast"&&a.flags.spikependium?.schoolMasteryRoutine&&mastery(a.item))return{cast:a,feat:a.item};
 const item=a?.item,origin=item?.flags.dnd5e?.cachedFor&&resolve(item.flags.dnd5e.cachedFor,a.actor);
 if(origin?.type==="cast"&&origin.flags.spikependium?.schoolMasteryRoutine&&mastery(origin.item)&&item._stats?.compendiumSource===origin.spell.uuid)return{cast:origin,feat:origin.item};
}
function sourceOf(a){
 const free=freeInfo(a);if(free)return{...free,kind:"routine",...granted(free.feat,"routine"),free:true};
 const item=a?.item;if(item?.type!=="spell"||item.system.sourceItem!=="feat:boon-of-school-mastery")return;
 const [id,adv]=item.flags.dnd5e?.advancementOrigin?.split('.')??[],feat=a.actor?.items.get(id),kind=Object.entries(feat?.flags.spikependium?.schoolMasteryChoices??{}).find(([,v])=>v===adv)?.[0],g=kind&&granted(feat,kind);
 return mastery(feat)&&g?.spell.id===item.id?{feat,kind,...g}: {invalid:true};
}
function valid(a){const info=sourceOf(a);if(!info)return;const source=info.feat&&binding(info.feat,a.actor);
 if(info.invalid||!source||!a.actor.items.has(info.feat.id)||!info.spell||info.spell.system.school!==source.school||info.spell.system.ability!==source.ability
  ||(info.kind==="routine"?(info.spell.system.level!==1||!dnd5e.registry.spellLists.forType(source.list)?.has(info.spell)):info.spell.system.level<0||info.spell.system.level>7))return{invalid:true};
 if(info.free&&info.cast.item.uuid!==info.feat.uuid)return{invalid:true};
 return{...info,source};
}
export function prepareSchoolMastery(a,config={}){
 const i=valid(a);if(!i)return;if(i.invalid){ui.notifications.warn("Дар освоения школы магии: завершите шаги и проверьте исходную школу, класс и выданные копии заклинаний.");return false;}
 if(i.free){
  i.cast.updateSource({"spell.uuid":i.spell.uuid,"spell.ability":i.source.ability});
  if(a.type!=="cast"&&(a.item._stats?.compendiumSource!==i.spell.uuid||a.item.system.level!==1||config.consume?.spellSlot===true||Number(config.scaling)>0))return false;
 }
 if(!i.free&&i.kind==="signature"&&i.spell.system.level===0&&a.type!=="forward"){
  const cause=a.getLinkedActivity?.(config.cause?.activity);
  if(cause?.type!=="forward"||cause.item.uuid!==a.item.uuid||!cause.consumption.targets.some(t=>t.type==="itemUses"&&!t.target&&Number(t.value)===1)||config.consume===false||config.cause?.resources===false){ui.notifications.warn("Заговор Фирменного арканума сотворяется через предоставленное бесплатное применение за Долгий отдых.");return false;}
 }
}
export async function schoolMasteryUse(wrapped,config={},dialog={},message={}){
 const i=valid(this);if(!i)return wrapped(config,dialog,message);if(prepareSchoolMastery(this,config)===false)return;
 if(i.free)return wrapped({...config,scaling:0,consume:config.consume===false?false:{...config.consume,action:config.consume?.action??true,spellSlot:false}},
  {...dialog,options:{...dialog.options,display:{...dialog.options?.display,scaling:false,"consume.spellSlot":false}}},message);
 return wrapped({...config,consume:config.consume===false?false:{...config.consume,action:config.consume?.action??true}},dialog,message);
}
export async function schoolMasteryCachedSpell(wrapped,...args){
 const data=await wrapped(...args);if(!data||!this.flags.spikependium?.schoolMasteryRoutine||!mastery(this.item))return data;
 data.system.materials={value:"",consumed:false,cost:0,supply:0};data.system.level=1;
 for(const a of Object.values(data.system.activities))if(a.consumption?.targets)a.consumption.targets=a.consumption.targets.filter(t=>!["material","spikependiumMaterial"].includes(t.type)&&!(t.type==="attribute"&&t.target==="materials.supply"));
 return data;
}
