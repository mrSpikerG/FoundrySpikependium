const key="feat:transformed-anatomy";
function feature(actor) {return actor?.isOwner&&actor.items.find(i=>i.flags.spikependium?.key===key);}
export function anatomyStrideChange(wrapped,model,change,...args) {
  if(model?.documentName==="Actor"&&change.key==="system.attributes.movement.bonus"&&change.effect?.flags.spikependium?.anatomyStride){
    const units=model.system.attributes.movement.units??dnd5e.utils.defaultUnits("length");
    change={...change,value:String(dnd5e.utils.convertLength(5,"ft",units))};
  }
  return wrapped(model,change,...args);
}
export function prepareAnatomySave(config,dialog,message) {
  const feat=feature(config.subject);if(!feat)return;
  const id=message.data?.system?.origin;
  const origin=typeof id==="string"?game.messages.get(id):id;
  const item=origin?.getAssociatedItem?.();
  const known=item?.type==="spell"&&["polymorph","true-polymorph"].includes(item.system.identifier);
  config.spikependium={...config.spikependium,forcedForm:config.spikependium?.forcedForm??known,anatomyFeat:feat.uuid};
  for(const roll of config.rolls){roll.options??={};roll.options.disadvantage||=roll.options.advantageMode===-1;}
  const Base=dialog.applicationClass??CONFIG.Dice.D20Roll.DefaultConfigurationDialog;
  dialog.configure??=true;
  dialog.applicationClass=class extends Base {
    async _prepareConfigurationContext(context,options){
      context=await super._prepareConfigurationContext(context,options);
      context.fields.push({name:"spikependium.forcedForm",value:this.config.spikependium.forcedForm,
        field:new foundry.data.fields.BooleanField({label:"Преобразованная анатомия: эффект принудительно меняет форму",
          hint:"Добавляет источник преимущества к этому спасброску. Другие источники преимущества и помехи сохраняются."})});
      return context;
    }
    _buildConfig(roll,formData,index){
      roll=super._buildConfig(roll,formData,index);
      this.config.spikependium.forcedForm=formData?.get("spikependium.forcedForm")??this.config.spikependium.forcedForm;
      return roll;
    }
  };
}
export function buildAnatomySave(config,roll){
  if(!config.spikependium?.forcedForm||feature(config.subject)?.uuid!==config.spikependium?.anatomyFeat)return;
  roll.options??={};
  roll.options.disadvantage||=roll.options.advantageMode===-1;
  roll.options.advantage=true;
  roll.options.advantageMode=roll.options.disadvantage?0:1;
  roll.options.spikependiumAnatomy=config.spikependium.anatomyFeat;
}
export function finalizeAnatomySave(rolls,config){
  if(!config.spikependium?.forcedForm||!config.spikependium?.anatomyFeat||!rolls.length)return;
  const feat=feature(config.subject);
  if(feat?.uuid!==config.spikependium.anatomyFeat||rolls.some(r=>r.options.spikependiumAnatomy!==feat.uuid)){
    ui.notifications.warn("Преобразованная анатомия изменилась. Повторите спасбросок с актуальными условиями.");return false;
  }
}
