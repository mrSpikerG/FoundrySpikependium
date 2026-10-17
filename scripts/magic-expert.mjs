const KEY="feat:au-magic-expert",ABILITIES=["int","wis","cha"],NAMES={int:"Интеллект",wis:"Мудрость",cha:"Харизма"},LISTS={"class:cleric":"Жрец","class:druid":"Друид","class:wizard":"Волшебник"};
const expert=item=>item?.flags?.spikependium?.key===KEY;
const choice=a=>a?.type==="ItemChoice"&&expert(a.item);
function sources(actor){
 const out=[];
 for(const feat of actor.items.filter(i=>i.type==="feat"&&i.system.identifier==="magic-initiate")){
  const a=feat.system.advancement.find(a=>a.type==="ItemChoice"&&a.configuration.restriction.level==="0"),ability=a?.value.ability;
  if(!ABILITIES.includes(ability))continue;
  const spells=Object.values(a.value.added??{}).flatMap(v=>Object.keys(v)).map(id=>actor.items.get(id))
   .filter(i=>i?.type==="spell"&&i.system.level===0&&i.flags.dnd5e?.advancementOrigin===`${feat.id}.${a.id??a._id}`);
  if(spells.length!==2||spells.some(s=>s.system.ability!==ability))continue;
  for(const list of a.configuration.restriction.list){const registry=dnd5e.registry.spellLists.forType(list);
   if(LISTS[list]&&registry&&spells.every(s=>registry.has(s)))out.push({initiate:feat.id,list,ability,label:`${feat.name} — ${LISTS[list]} (${NAMES[ability]})`});
  }
 }return out;
}
function binding(item,actor){
 const saved=item.flags?.spikependium?.magicExpert;
 return sources(actor).find(s=>s.initiate===saved?.initiate&&s.list===saved.list&&s.ability===saved.ability);
}
async function configure(actor,itemData){
 const candidates=sources(actor);if(!candidates.length)throw Error("Знаток магии: сначала завершите штатный выбор двух заговоров, списка и характеристики в черте Посвящённый в магию.");
 let source=candidates[0];
 if(candidates.length>1){const escape=foundry.utils.escapeHTML;
  const selected=await foundry.applications.api.DialogV2.input({window:{title:"Знаток магии: исходный список"},rejectClose:false,
   content:`<p>Выберите список, который вы действительно выбрали для заговоров Посвящённого в магию. Пересечение списков само по себе не определяет прежний выбор.</p><div class="form-group"><label>Черта и список</label><select name="source">${candidates.map((s,i)=>`<option value="${i}">${escape(s.label)}</option>`).join("")}</select></div>`,ok:{label:"Использовать этот список"}});
  source=candidates.find((_s,i)=>String(i)===selected?.source);if(!source)throw Error("Выбор списка Знатока магии отменён; черта не добавлена.");
 }
 if(!actor.isOwner||!sources(actor).some(s=>JSON.stringify(s)===JSON.stringify(source)))throw Error("Посвящённый в магию или права изменились; добавьте Знатока магии заново.");
 const level=actor.system.details.level;if(!Number.isInteger(level)||level<0||level>20)throw Error("Знаток магии: неизвестен уровень персонажа.");
 const data=foundry.utils.deepClone(itemData);data.flags.spikependium.magicExpert={initiate:source.initiate,list:source.list,ability:source.ability};
 const a=data.system.advancement.find(a=>a.type==="ItemChoice");a.configuration.restriction.list=[source.list];a.configuration.spell.ability=[source.ability];
 a.configuration.choices={0:{count:2,replacement:false},...Object.fromEntries(Array.from({length:20-level},(_,i)=>[level+i+1,{count:0,replacement:true}]))};return data;
}
export async function magicExpertDrop(wrapped,event,data,...args){return wrapped(event,expert(data)?await configure(this.inventorySource,data):data,...args);}
export async function magicExpertCreate(wrapped,...args){
 const data=await wrapped(...args);return expert(data)&&!data.flags.spikependium.magicExpert?configure(this.actor,data):data;
}
async function spellLevel(a,level,original){
 if(Number(level)===0){const known=await Promise.all(Object.values(a.value.added[0]??{}).map(uuid=>fromUuid(uuid)));
  if(known.some(s=>s?.type!=="spell"))throw Error("Не найдено ранее выбранное заклинание Знатока магии.");
  return [1,2].find(l=>!known.some(s=>s.system.level===l));
 }
 original??=a.value.replaced[level]?.original;if(!original)return;
 const row=Object.entries(a.value.added).find(([l,ids])=>Number(l)<Number(level)&&Object.hasOwn(ids,original));
 if(!row||Object.entries(a.value.replaced).some(([l,r])=>Number(l)!==Number(level)&&r.original===original))throw Error("Это заклинание недоступно для замены Знатоком магии.");
 const spell=await fromUuid(row[1][original]);if(spell?.type!=="spell"||![1,2].includes(spell.system.level))throw Error("Не найден исходный уровень заменяемого заклинания Знатока магии.");
 return spell.system.level;
}
function restrictions(a,source,level){
 a.updateSource({"configuration.restriction.list":[source.list],"configuration.restriction.level":level?String(level):"",
  "configuration.spell.ability":[source.ability]});
}
export async function magicExpertContext(wrapped,...args){
 if(choice(this.advancement)){const a=this.advancement,source=binding(a.item,a.actor);if(!source)throw Error("Знаток магии: исходная черта, список или характеристика изменились.");
  restrictions(a,source,await spellLevel(a,this.level));
 }return wrapped(...args);
}
export function magicExpertCounts(wrapped,level){
 const counts=wrapped(level);if(choice(this)&&Number(level)===0&&counts.current===0)return {...counts,max:1,full:false};return counts;
}
export async function magicExpertApply(wrapped,level,data={},options={}){
 if(!choice(this))return wrapped(level,data,options);
 const source=binding(this.item,this.actor);if(!source)throw Error("Знаток магии: исходная черта, список или характеристика изменились.");
 if(data.ability&&data.ability!==source.ability)throw Error("Знаток магии использует характеристику Посвящённого в магию.");
 if(!this.configuration.choices[level])throw Error("На этом уровне у Знатока магии нет шага выбора или замены.");
 const original=data.replace??data.retainedData?.replaced?.original,target=await spellLevel(this,level,original);
 const selected=data.selected??(options.initial?[]:Object.keys(data.retainedData??{}).filter(k=>!['items','ability','replaced'].includes(k)));
 if(original&&this.getCounts(level).current>0&&this.value.replaced[level]?.original!==original)throw Error("Сначала отмените уже выбранную замену на этом уровне.");
 if(selected.length>1||selected.length&&(!target||this.getCounts(level).full))throw Error("Выберите только одно разрешённое заклинание; при повышении уровня сначала отметьте заменяемое.");
 for(const uuid of selected){const spell=await fromUuid(uuid);if(spell?.type!=="spell"||spell.system.level!==target||!dnd5e.registry.spellLists.forType(source.list)?.has(spell))throw Error("Знаток магии: неверный уровень или список выбранного заклинания.");}
 if(!binding(this.item,this.actor)||JSON.stringify(binding(this.item,this.actor))!==JSON.stringify(source))throw Error("Источник Знатока магии изменился во время выбора.");
 restrictions(this,source,target);return wrapped(level,{...data,selected,ability:source.ability},options);
}
export function canUseMagicExpertSpell(activity){
 const item=activity?.item;if(item?.type!=="spell"||item.system.sourceItem!=="feat:magic-expert")return;
 const [id,advance]=item.flags.dnd5e?.advancementOrigin?.split(".")??[],feat=activity.actor?.items.get(id),source=feat&&binding(feat,activity.actor);
 const a=feat?.system.advancement.find(a=>(a.id??a._id)===advance);
 if(expert(feat)&&source&&a?.type==="ItemChoice"&&item.system.ability===source.ability&&Object.values(a.value.added).some(ids=>Object.hasOwn(ids,item.id)))return;
 ui.notifications.warn("Знаток магии: проверьте исходную черту Посвящённый в магию, её список/характеристику и шаг выдачи заклинания.");return false;
}
