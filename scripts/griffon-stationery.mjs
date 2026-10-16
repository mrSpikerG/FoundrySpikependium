const kind=item=>item?.flags?.spikependium?.stationery;
const flags=item=>item.flags.spikependium;
const command=activity=>activity.flags?.spikependium?.stationeryCommand;
const affected=new Set(['celestial','elemental','fey','fiend','undead']);
let syncing=false;
export function candleSpent(item,now=game.time.worldTime) {
 const f=flags(item);return Math.min(3600,item.system.uses.spent+(f.antiLightOn?Math.max(0,now-f.antiLightSince):0));
}
function tokenFor(actor) {
 if(actor.token?.parent===canvas.scene)return actor.token;
 const tokens=(actor.getActiveTokens?.(false,true)??[]).filter(t=>t.parent===canvas.scene);
 const controlled=tokens.filter(t=>t.object?.controlled);
 return controlled.length===1?controlled[0]:tokens.length===1?tokens[0]:undefined;
}
export function canUseStationery(activity,_config,_dialog,message) {
 const item=activity?.item,id=kind(item),c=command(activity);if(!id)return;
 if(!item.actor?.isOwner||item.system.quantity!==1){ui.notifications.warn('Для применения нужна одна принадлежащая вам запись предмета; разделите стопку.');return false;}
 let valid=true;
 if(id==='anti-light')valid=c==='light'? !flags(item).antiLightOn&&candleSpent(item)<3600:c==='snuff'?!!flags(item).antiLightOn:c==='cover'?!flags(item).antiLightCovered:c==='uncover'?!!flags(item).antiLightCovered:false;
 if(id==='secret-scribe')valid=({blue:0,orange:1,copy:2})[c]===flags(item).scribePhase;
 if(id==='null-chalk')valid=c==='initialize'?!flags(item).chalkInitialized:!!flags(item).chalkInitialized;
 if(!valid){ui.notifications.warn('Действие недоступно в текущем состоянии предмета.');return false;}
 if(message&&c){if(message.create===false)return false;message.hasConsumption=true;}
}
export async function prepareStationeryUpdates(activity,config,updates) {
 const item=activity?.item,id=kind(item),c=command(activity);if(!id)return updates;
 if(canUseStationery(activity)===false)return false;
 const changes={};
 if(id==='anti-light') {
  const spent=candleSpent(item),on=c==='light'?1:c==='snuff'?0:flags(item).antiLightOn;
  Object.assign(changes,{'system.uses.spent':spent,'flags.spikependium.antiLightOn':on,'flags.spikependium.antiLightSince':on?game.time.worldTime:0});
  if(c==='cover'||c==='uncover')changes['flags.spikependium.antiLightCovered']=c==='cover'?1:0;
  if(c==='light') {
   const token=tokenFor(item.actor);if(token)changes['flags.spikependium.antiLightToken']=token.uuid;
   else {changes['flags.spikependium.antiLightToken']='';ui.notifications.warn('Единственный токен не определён: источник тьмы разместите вручную.');}
  }
 }else if(id==='secret-scribe')changes['flags.spikependium.scribePhase']=({blue:1,orange:2,copy:0})[c];
 else if(c==='initialize') {
  const roll=await new CONFIG.Dice.BasicRoll('1d4+1',{}, {flavor:'Обнуляющий мел: число кусочков'}).evaluate();
  if(!Number.isInteger(roll.total)||roll.total<2||roll.total>5)throw Error('Некорректное число кусочков Обнуляющего мела');
  updates.rolls.push(roll);Object.assign(changes,{'system.uses.max':String(roll.total),'flags.spikependium.chalkInitialized':1});
 }else if(c==='draw'&&updates.item.find(i=>i._id===item.id)?.['system.uses.spent']!==item.system.uses.spent+1)return false;
 if(Object.keys(changes).length){let update=updates.item.find(i=>i._id===item.id);if(!update)updates.item.push(update={_id:item.id});Object.assign(update,changes);}
 return updates;
}
export function prepareChalkSave(config,_dialog,message) {
 // shortcut: the GM confirms the physical line and first crossing; replace with region receipts when line regions exist.
 const activity=game.messages.get(message.data?.system?.origin)?.getAssociatedActivity?.();if(!activity?.flags?.spikependium?.nullChalkCrossing)return;
 const actor=config.subject?.actor??(config.subject?.documentName==='Actor'?config.subject:undefined);
 if(actor&&!affected.has(actor.system.details?.type?.value)){ui.notifications.warn('Тип существа не подтверждён как затрагиваемый линией Обнуляющего мела. Проверьте тип перед спасброском.');return false;}
}
export function stationeryDeltaLabel(wrapped,...args) {
 const result=wrapped(...args),labels={antiLightOn:'Пламя Свечи анти-света',antiLightCovered:'Непрозрачное покрытие свечи',antiLightSince:'Начало учёта горения',scribePhase:'Фаза связанных свечей',chalkInitialized:'Содержимое мешочка мела определено'};
 if(this.keyPath?.startsWith('flags.spikependium.')&&labels[this.keyPath.slice(19)])result.label=labels[this.keyPath.slice(19)];return result;
}
export async function syncStationery() {
 if(syncing||(game.users.activeGM?!game.user.isActiveGM:!game.user.isGM))return;syncing=true;
 try {
  const actors=new Map([...(game.actors??[]),...[...(game.scenes??[])].flatMap(s=>[...s.tokens].map(t=>t.actor))].filter(Boolean).map(a=>[a.uuid,a]));
  const candles=[...actors.values()].flatMap(a=>[...a.items]).filter(i=>kind(i)==='anti-light');
  for(const item of candles)if(item.isOwner&&flags(item).antiLightOn) {
   const spent=candleSpent(item);
   if(spent>item.system.uses.spent)await item.update({'system.uses.spent':spent,'flags.spikependium.antiLightOn':spent<3600?1:0,'flags.spikependium.antiLightSince':spent<3600?game.time.worldTime:0});
  }
  for(const scene of game.scenes??[]) {
   const desired=new Map();
   for(const item of candles) {
    const f=flags(item),token=f.antiLightToken&&fromUuidSync(f.antiLightToken,{strict:false});
    if(!f.antiLightOn||f.antiLightCovered||!item.system.equipped||item.system.quantity!==1||candleSpent(item)>=3600||token?.parent!==scene||token.actor?.uuid!==item.actor.uuid||!(scene.grid.units in CONFIG.DND5E.movementUnits))continue;
    const radius=dnd5e.utils.convertLength(10,'ft',scene.grid.units);
    desired.set(item.uuid,{x:token.x+token.width*scene.grid.size/2,y:token.y+token.height*scene.grid.size/2,
     config:{negative:true,bright:radius,dim:radius,angle:360,attenuation:0,priority:0},flags:{spikependium:{antiLightCandle:item.uuid}}});
   }
   const seen=new Set();
   for(const light of scene.lights) {
    const key=light.flags.spikependium?.antiLightCandle;if(!key)continue;
    const data=desired.get(key);
    if(!data||seen.has(key)){await light.delete();continue;}seen.add(key);
    if(light.x!==data.x||light.y!==data.y||Object.entries(data.config).some(([k,v])=>light.config[k]!==v))await light.update(data);
   }
   for(const[key,data]of desired)if(!seen.has(key))await scene.createEmbeddedDocuments('AmbientLight',[data]);
  }
 }finally{syncing=false;}
}
