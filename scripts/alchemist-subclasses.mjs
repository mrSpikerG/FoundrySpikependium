export const dynamoSlotLevel = level => level >= 19 ? 4 : level >= 13 ? 3 : level >= 7 ? 2 : level >= 2 ? 1 : 0;
const isDynamo = advancement => advancement?.item?.flags?.spikependium?.key === "subclass:alchemist-dynamo-engineer";
export function dynamoMaxSpellLevel(wrapped, ...args) {
  if (!isDynamo(this.advancement)) return wrapped(...args);
  return dynamoSlotLevel(this.level || this.advancement.actor.classes.alchemist?.system.levels || 0);
}
export function prepareDynamoChoice(manager) {
  const flow = manager.step?.flow, adv = flow?.advancement;
  if (!isDynamo(adv) || adv.type !== "ItemChoice") return;
  const other = adv.item.system.advancement.some(a => a.id !== adv.id && a.type === "ItemChoice" && a.value.replaced?.[flow.level]);
  adv.updateSource({ [`configuration.choices.${flow.level}.replacement`]: flow.level > 2 && !other });
}
export function canUseAlchemistSpecialty(activity) {
  const key = activity?.item?.flags?.spikependium?.key ?? "";
  let required;
  if (key.startsWith("alchemist:special-formula:")) required = [...activity.item.system.prerequisites.items][0]?.slice(9);
  else required = key.match(/^subclass:(alchemist-[\w-]+):/)?.[1];
  if (!required) return;
  const actor = activity.actor;
  if (!actor?.isOwner || (actor.classes?.alchemist?.system.levels ?? 0) < (activity.item.system.prerequisites.level ?? 0)
    || !actor.items.some(i => i.type === "subclass" && i.system.identifier === required)) {
    ui.notifications.warn("Для этой особенности нужен указанный уровень алхимика и его специализация."); return false;
  }
  if (key === "subclass:alchemist-mutagenist:mutagen" && activity.type === "attack"
    && !(actor.appliedEffects ?? actor.effects).some(e => e.active && e.flags.spikependium?.mutagenAbility === "str")) {
    ui.notifications.warn("Природное оружие требует действующего силового мутагена."); return false;
  }
}
