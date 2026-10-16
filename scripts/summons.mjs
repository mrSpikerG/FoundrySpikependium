// Дополнения к стандартному призыву dnd5e 6: правила спутников из UA.
const VESTIGE_POWERS = new Set(["662KdJM55taoeTAL", "rD9bLz1LEKGMNjZ9", "74BTP7gJ0HYZzihk"]);
export const isVestigePower = item => [...(item.system.activities?.values() ?? [])].some(a => VESTIGE_POWERS.has(a.id ?? a._id));

export function hasReanimatedCompanion(activity, scenes) {
  if (activity.item.flags.spikependium?.key !== "subclass:reanimator:reanimated-companion") return false;
  return [...scenes].some(scene => [...scene.tokens].some(token => token.actor?.system.attributes.hp.value > 0
    && token.actor.flags.dnd5e?.summon?.origin === activity.item.uuid
    && token.actor.flags.spikependium?.key?.startsWith("actor:reanimated-companion")));
}
export function canRefuel(activity) {
  if (activity.item.flags.spikependium?.key !== "item:spell-refueling-ring") return true;
  const target = activity.consumption.targets.find(t => t.type === "spellSlots" || t.target === "spells.pact.value");
  if (!target) return false;
  const pact = target.type === "attribute";
  const slot = activity.actor.system.spells[pact ? "pact" : `spell${target.target}`];
  const level = pact ? slot?.level : Number(target.target);
  return !!slot && level >= 1 && level <= 3 && slot.value < slot.max;
}

export function prepareSummon(activity, profile, config) {
  const key = config.actor.flags.spikependium?.key;
  const caster = activity.actor;
  const updates = config.actorUpdates;
  if (key?.startsWith("actor:reanimated-companion")) {
    updates["flags.spikependium.createdLongRest"] = caster.flags?.spikependium?.longRest ?? "";
    updates["flags.spikependium.companionLevel"] = caster.classes.artificer?.system.levels ?? 0;
    updates["flags.spikependium.companionInt"] = caster.system.abilities.int.mod;
  }
  const prof = caster.system.attributes.prof;
  const level = id => caster.classes[id]?.system.levels ?? 0;
  let checkBonus;
  if (key === "actor:homunculus-servant") checkBonus = activity.item.system.level;
  if (key?.startsWith("actor:au-combat-familiar-")) checkBonus = Math.floor(activity.item.system.level / 2);
  if (key === "actor:purple-dragon-companion") checkBonus = Math.floor(prof / 2);
  if (key?.startsWith("actor:vestige-")) checkBonus = prof;
  if (checkBonus != null) for (const ability of ["str", "dex", "con", "int", "wis", "cha"]) {
    updates[`system.abilities.${ability}.check.roll.bonus`] = String(checkBonus);
    updates[`system.abilities.${ability}.save.roll.bonus`] = String(checkBonus);
  }
  if (key?.startsWith("actor:au-dinosaur-")) for (const ability of ["str", "con"])
    updates[`system.abilities.${ability}.save.roll.bonus`] = String(Math.floor(activity.item.system.level / 2));

  // Изменения вкладываются в тот же набор обновлений, что и нативное зачарование атак.
  const itemUpdate = item => {
    let update = updates.items.find(i => i._id === item.id);
    if (!update) updates.items.push(update = { _id: item.id });
    return update;
  };
  for (const item of config.actor.items) {
    const acts = [...(item.system.activities?.values() ?? [])];
    if (key === "actor:purple-dragon-companion") {
      const update = itemUpdate(item);
      for (const effect of update.effects ?? []) for (const change of effect.system.changes) {
        if (change.key === "activities[attack].attack.bonus") change.value = String(3 + caster.system.abilities.int.mod);
      }
      for (const act of acts) if (act.type === "save") {
        const improved = !!act.damage.parts.length;
        if (improved !== (level("fighter") >= 7)) update[`system.activities.-=${act.id}`] = null;
      }
    }
    if (key?.startsWith("actor:reanimated-companion")) {
      for (const act of acts) if (act.type === "save" && act.damage.parts.length) {
        const parts = act.toObject().damage.parts;
        if (level("artificer") >= 15) parts[0].number = 4;
        if (key.includes(":big-")) parts[0].bonus = "";
        itemUpdate(item)[`system.activities.${act.id}.damage.parts`] = parts;
      }
      for (const act of acts) if (act.type === "damage") {
        const parts = act.toObject().damage.parts;
        parts[0].custom.formula = String(caster.system.abilities.int.mod);
        itemUpdate(item)[`system.activities.${act.id}.damage.parts`] = parts;
      }
    }
    if (key?.startsWith("actor:vestige-") && level("warlock") >= 6 && isVestigePower(item)) {
      itemUpdate(item)["system.uses.recovery"] = [{ period: "sr", type: "recoverAll" }];
    }
    if (key?.startsWith("actor:vestige-") && isVestigePower(item) && caster.flags?.spikependium?.vestigePowerSpent != null) {
      itemUpdate(item)["system.uses.spent"] = caster.flags.spikependium.vestigePowerSpent;
    }
  }
  if (key === "actor:purple-dragon-companion") {
    const fighter = level("fighter");
    updates["system.traits.size"] = fighter >= 15 ? "lg" : fighter >= 7 ? "med" : "sm";
    config.tokenUpdates.width = config.tokenUpdates.height = fighter >= 15 ? 2 : 1;
    if (fighter >= 15) {
      updates["system.attributes.movement.speeds.walk"] = "40";
      updates["system.attributes.movement.speeds.fly"] = "40";
    }
  }
}
