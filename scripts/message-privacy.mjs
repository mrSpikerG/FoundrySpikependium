// FVTT 14: https://foundryvtt.com/api/classes/foundry.documents.ChatMessage.html#applyMode-1
export function preserveModuleMessagePrivacy(activity,message){
  const data=message.data;
  if(!activity?.item?.flags?.spikependium&&!data?.flags?.spikependium)return;
  if(data?.blind===true||["blind","blindroll"].includes(message.rollMode))message.rollMode="blind";
  else if(data?.whisper?.length)message.rollMode="gm";
}
