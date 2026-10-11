import { WILD_TALENTS, DRAGONMARK_TABLES } from "./generated.mjs";
import { noOpportunityAttacks } from "./opportunity.mjs";
import { hasStormFlight, stormFlightSpeed } from "./dragonmark-storm.mjs";

export function conditionalState(actor, data) {
  const armor = actor.items.filter(i => i.type === "equipment" && i.system.equipped
    && ["light", "medium", "heavy"].includes(i.system.type.value));
  const tokens = actor.items.find(i => i.flags.spikependium?.key === "subclass:phantom:tokens-of-the-departed");
  const maximum = Number(data.scale?.phantom?.trinkets ?? tokens?.system.uses.max ?? 0);
  return { unarmored: !armor.length, lightArmorAllowed: !armor.some(i => i.system.type.value !== "light"),
    noOpportunityAttacks: noOpportunityAttacks(actor),
    hasSoulToken: !!tokens && maximum > tokens.system.uses.spent,
    mutableActive: (actor.effects ?? []).some(e => e.flags.spikependium?.mutableForm && !e.disabled && !e.duration.expired),
    ...(hasStormFlight(actor) ? { stormFlightSpeed: stormFlightSpeed(actor) } : {}) };
}

export function applyTurnLimit(activity, config, message, updates, combat = game.combat) {
  if (!activity.flags?.spikependium?.oncePerTurn || !combat?.started) return;
  if (activity.transform?.mode === "form" && activity.transform.formless && config.transform?.profile === "") return;
  if (activity.flags.spikependium.ownTurn && combat.combatant?.actor?.uuid !== activity.actor.uuid) {
    ui.notifications.warn("Это действие можно использовать только в свой ход.");
    return false;
  }
  const turn = `${combat.id}:${combat.round}:${combat.turn}`;
  const key = activity.flags.spikependium.group ?? `${activity.item.id}${activity.id}`;
  if (activity.actor.flags.spikependium?.turnUses?.[key] === turn) {
    ui.notifications.warn("Это действие уже использовано в текущем ходу.");
    return false;
  }
  updates.actor[`flags.spikependium.turnUses.${key}`] = turn;
}

export function prepareUpdatedSpell(item, data) {
  if (item.type !== "spell" || item.system.sourceItem !== "feat:lich-ascension") return;
  const ability = data["system.ability"] ?? data.system?.ability;
  if (!["int", "wis", "cha"].includes(ability)) return;
  const maximum = data["system.uses.max"] ?? data.system?.uses?.max ?? item._source.system.uses.max;
  if (!/^max\(1, @(attributes\.spell|abilities\.(int|wis|cha))\.mod\)$/.test(maximum)) return;
  if (data.system?.uses) data.system.uses.max = `max(1, @abilities.${ability}.mod)`;
  else data["system.uses.max"] = `max(1, @abilities.${ability}.mod)`;
}

export function prepareGrantedSpell(item, data) {
  if (item.type !== "spell") return;
  const source = data.system?.sourceItem ?? item.system.sourceItem;
  const ability = data.system?.ability ?? item.system.ability;
  if (source === "feat:lich-ascension" && ["int", "wis", "cha"].includes(ability)
    && (data.system?.uses?.max ?? item.system.uses.max) === "max(1, @attributes.spell.mod)")
    item.updateSource({ "system.uses.max": `max(1, @abilities.${ability}.mod)` });
  if (!WILD_TALENTS.includes(source)) return;
  const properties = data.system?.properties ?? [...item.system.properties];
  item.updateSource({ "system.properties": properties.filter(p => !["vocal", "material"].includes(p)) });
}

export function prepareFeatSave(activity) {
  if (activity.item.flags.spikependium?.key !== "feat:undead-grasp" || activity.type !== "save") return;
  const ability = activity.item.system.advancement.find(a => ["ItemGrant", "ItemChoice"].includes(a.type) && a.value?.ability)?.value.ability;
  if (["int", "wis", "cha"].includes(ability)) activity.updateSource({ "save.dc.calculation": ability });
}

export function preparePactUsage(activity, config) {
  if (!config.cause?.activity) return true;
  const pact = activity.getLinkedActivity(config.cause.activity)?.flags.spikependium?.pact;
  if (!pact) return true;
  const level = activity.actor.system.spells.pact?.level ?? 0;
  if (level < pact.minimum) return false;
  config.scaling = level - pact.minimum;
  return true;
}

export function prepareAbilityAdvancement(manager) {
  const advancement = manager.step?.flow?.advancement;
  const item = advancement?.item;
  if (["potent-dragonmark", "boon-of-siberys"].includes(item?.system.identifier) && advancement.type === "ItemGrant") {
    const marks = manager.clone.items.filter(i => i.system.type?.subtype === "dragonmark");
    const uuids = [...new Set(marks.flatMap(m => DRAGONMARK_TABLES[m.system.identifier] ?? []))];
    const ability = marks.flatMap(m => m.system.advancement ?? []).find(a => a.value?.ability)?.value.ability;
    advancement.updateSource({ "configuration.items": uuids.map(uuid => ({ uuid, optional: false })),
      "configuration.optional": false, ...(ability ? { "configuration.spell.ability": [ability] } : {}) });
  }
  if (item?.flags.spikependium?.key && ["dragonmark", "wildTalent"].includes(item.system.type?.subtype)
    && ["ItemGrant", "ItemChoice"].includes(advancement.type)) {
    const index = item.system.advancement.findIndex(a => a.id === advancement.id);
    const previous = item.system.advancement.slice(0, Math.max(0, index)).find(a => a.value?.ability);
    if (previous) advancement.updateSource({ "configuration.spell.ability": [previous.value.ability] });
  }
  if (advancement?.type !== "AbilityScoreImprovement"
    || advancement.item.flags.spikependium?.key !== "feat:potent-dragonmark") return;
  const abilities = ["str", "dex", "con", "int", "wis", "cha"];
  const allowed = new Set();
  for (const item of manager.clone.items) {
    if (item.system.type?.subtype !== "dragonmark") continue;
    if (item.system.identifier === "aberrant-dragonmark") allowed.add("con");
    for (const grant of item.system.advancement ?? []) {
      if (!["ItemGrant", "ItemChoice"].includes(grant.type)) continue;
      if (abilities.includes(grant.value?.ability)) allowed.add(grant.value.ability);
    }
  }
  // shortcut: метки из сторонних модулей без сохранённого выбора характеристики требуют ручной проверки.
  if (!allowed.size) return;
  advancement.updateSource({ "configuration.locked": abilities.filter(a => !allowed.has(a)) });
}

export function prepareFormConsumption(activity, config) {
  if (activity.item.flags.spikependium?.key && activity.transform?.mode === "form"
    && activity.transform.formless && config.transform?.profile === "") config.consume = false;
}

export function validateMutableForm(activity, config) {
  if (!activity.flags.spikependium?.requiresMutable) return true;
  if (activity.transform?.formless && config.transform?.profile === "") return true;
  return activity.actor.effects.some(e => e.flags.spikependium?.mutableForm && !e.disabled && !e.duration.expired);
}

export function radiantLightUpdate(token, itemUuid, bright = 30, dim = 60) {
  const previous = token.flags.spikependium?.radiantLight;
  if (previous) {
    const items = previous.items ?? [previous.itemUuid];
    const remaining = items.includes(itemUuid) ? items.filter(id => id !== itemUuid) : [...items, itemUuid];
    if (!remaining.length) return { "light.bright": previous.light.bright, "light.dim": previous.light.dim, "flags.spikependium.-=radiantLight": null };
    return { "light.bright": Math.max(token.light.bright, bright), "light.dim": Math.max(token.light.dim, dim),
      "flags.spikependium.radiantLight": { ...previous, items: remaining } };
  }
  return {
    "light.bright": Math.max(token.light.bright, bright), "light.dim": Math.max(token.light.dim, dim),
    "flags.spikependium.radiantLight": { itemUuid, light: token.light.toObject() }
  };
}

export async function toggleRadiantLight(activity) {
  const tokens = activity.actor?.getActiveTokens(false, true).filter(t => t.isOwner) ?? [];
  if (!tokens.length) {
    ui.notifications.warn("Для света оружия нужен принадлежащий вам токен на текущей сцене.");
    return;
  }
  const units = canvas.grid.units;
  if (!(units in CONFIG.DND5E.movementUnits)) {
    ui.notifications.warn("Укажите единицы сетки сцены из dnd5e (например, ft или m), чтобы рассчитать свет оружия.");
    return;
  }
  const bright = dnd5e.utils.convertLength(30, "ft", units);
  const dim = dnd5e.utils.convertLength(60, "ft", units);
  for (const token of tokens) await token.update(radiantLightUpdate(token, activity.item.uuid, bright, dim));
}
