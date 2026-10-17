import { combatFamiliarCaster } from "./combat-familiar.mjs";
const resolve=uuid=>uuid&&fromUuidSync(uuid,{strict:false});
export function familiarCaster(token){
 const origin=token.actor.flags.dnd5e?.summon?.origin,spell=resolve(origin);
 if(spell?.type==="spell"&&spell.system.identifier==="find-familiar"&&spell.actor)return spell.actor;
 const saved=token.actor.flags.spikependium?.nativeFamiliar,caster=resolve(saved?.caster);
 if(caster&&saved.source===origin&&typeof origin==="string"&&origin.startsWith(`${caster.uuid}.Item.`))return caster;
 if(typeof origin==="string")for(const e of token.actor.effects){const legacy=resolve(e.flags.spikependium?.familiarFriendHP?.caster);
  if(legacy&&origin.startsWith(`${legacy.uuid}.Item.`)&&e.system.origin?.activity?.startsWith(`${origin}.Activity.`))return legacy;
 }
 return combatFamiliarCaster(token);
}
