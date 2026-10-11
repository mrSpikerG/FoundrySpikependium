const ARTISAN = ["alchemist", "brewer", "calligrapher", "carpenter", "cartographer", "cobbler", "cook", "glassblower",
  "jeweler", "leatherworker", "mason", "painter", "potter", "smith", "tinker", "weaver", "woodcarver"];
const RULES = {
  detection: { skills: { prc: "wis", ins: "wis" } },
  finding: { skills: { prc: "wis", sur: "wis" } },
  handling: { skills: { nat: "int", ani: "wis" } },
  healing: { skills: { med: "wis" }, tools: { herb: "int" } },
  hospitality: { skills: { per: "cha" }, tools: { cook: "", brewer: "" } },
  making: { skills: { arc: "int" }, tools: Object.fromEntries(ARTISAN.map(id => [id, ""])) },
  passage: { skills: { ath: "str", acr: "dex" } },
  scribing: { skills: { his: "int" }, tools: { calligrapher: "" } },
  sentinel: { skills: { ins: "wis", prc: "wis" } },
  shadow: { skills: { ste: "dex", prf: "cha" } },
  storm: { skills: { acr: "dex" }, tools: { navg: "" } },
  warding: { skills: { inv: "int" }, tools: { thief: "" } }
};
const BONUS = "@spikependiumIntuition";
const FORTITUDE = "@spikependiumFortitude";
const FORTITUDE_ID = "ImKAekqLG7w1vBHg";
const fortitudeReservations = new Map();
const feature = (actor, key) => actor?.items?.find(i => i.flags.spikependium?.key === key);

export function canConsumeFortitude(activity, config) {
  if (!(activity?.id === FORTITUDE_ID && activity.item.flags.spikependium?.key === "feat:aberrant-dragonmark")
    && !(activity?.id === "SrLGmFwOubXHyFLk" && activity.item.flags.spikependium?.key === "feat:greater-aberrant")) return true;
  const reservation = fortitudeReservations.get(activity.actor?.uuid);
  if (!reservation || config?.spikependium?.fortitudeReservation === reservation) return true;
  ui.notifications.warn("Аберрантная стойкость уже применяется в другом спасброске. Дождитесь его завершения.");
  return false;
}

export function fortitudeChoices(config) {
  if (!config.subject?.isOwner || config.ability !== "con" || !config.hookNames?.includes("SavingThrow")) return [];
  const mark = feature(config.subject, "feat:aberrant-dragonmark");
  if (!mark || !(mark.system.uses.value > 0)) return [];
  return (feature(config.subject, "feat:greater-aberrant") ? [4, 6] : [4])
    .map(die => ({ value: `${mark.uuid}:${die}`, feature: mark.uuid, die: `1d${die}`, name: `+1к${die}` }));
}

export function prepareFortitudeSave(config, dialog) {
  if (!fortitudeChoices(config).length) return;
  config.spikependium = { ...config.spikependium, fortitude: config.spikependium?.fortitude ?? "none" };
  const Base = dialog.applicationClass ?? CONFIG.Dice.D20Roll.DefaultConfigurationDialog;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConfigurationContext(context, options) {
      context = await super._prepareConfigurationContext(context, options);
      context.fields.push({ name: "spikependium.fortitude", value: this.config.spikependium.fortitude,
        field: new foundry.data.fields.StringField({ label: "Аберрантная стойкость", required: true, blank: false,
          hint: "Дополнительная кость в результате спасброска Телосложения. Расходуется одно применение за каждый бросок.",
          choices: { none: "Не применять", ...Object.fromEntries(fortitudeChoices(this.config).map(c => [c.value, c.name])) } }) });
      return context;
    }
    _buildConfig(roll, formData, index) {
      roll = super._buildConfig(roll, formData, index);
      this.config.spikependium.fortitude = formData?.get("spikependium.fortitude") ?? this.config.spikependium.fortitude;
      return roll;
    }
  };
}

export function buildFortitudeSave(process, roll) {
  if (!process.spikependium?.fortitude && !roll.options?.spikependiumFortitude) return;
  roll.parts = (roll.parts ?? []).filter(part => part !== FORTITUDE);
  delete roll.data.spikependiumFortitude;
  delete roll.options.spikependiumFortitude;
  const selected = fortitudeChoices(process).find(c => c.value === process.spikependium?.fortitude);
  if (!selected || (roll.data.roll?.ability && roll.data.roll.ability !== "con")) return;
  roll.parts.push(FORTITUDE);
  roll.data.spikependiumFortitude = selected.die;
  roll.options.spikependiumFortitude = { value: selected.value, feature: selected.feature, die: selected.die };
}

function validFortitudeSave(rolls, config) {
  const selected = fortitudeChoices(config).find(c => c.value === config.spikependium?.fortitude);
  const mark = feature(config.subject, "feat:aberrant-dragonmark");
  return selected && mark.system.uses.value >= rolls.length && rolls.every(roll => !roll._evaluated
    && (!roll.data.roll?.ability || roll.data.roll.ability === "con")
    && roll.options.spikependiumFortitude?.value === selected.value && roll.data.spikependiumFortitude === selected.die);
}

export function finalizeFortitudeSave(rolls, config) {
  if (!rolls.length || !config.spikependium?.fortitude || config.spikependium.fortitude === "none") return;
  if (!validFortitudeSave(rolls, config)) {
    ui.notifications.warn("Аберрантная стойкость недоступна: проверьте черту, усиление и оставшиеся применения. Повторите спасбросок.");
    return false;
  }
}

export async function consumeFortitudeSave(wrapped, rolls, config = {}, message = {}, ...args) {
  if (!rolls.length || config.evaluate === false || !config.spikependium?.fortitude || config.spikependium.fortitude === "none")
    return wrapped(rolls, config, message, ...args);
  const actor = config.subject;
  if (!validFortitudeSave(rolls, config) || fortitudeReservations.has(actor.uuid)) {
    rolls.splice(0);
    ui.notifications.warn("Аберрантная стойкость недоступна или уже используется. Повторите спасбросок.");
    return;
  }
  const reservation = Symbol();
  fortitudeReservations.set(actor.uuid, reservation);
  try {
    // The native item clone keeps its actor and writes consumption to the real embedded item.
    const mark = feature(actor, "feat:aberrant-dragonmark");
    const item = mark.clone({ [`system.activities.${FORTITUDE_ID}.consumption.targets`]: [
      { type: "itemUses", target: "", value: String(rolls.length), scaling: {} }
    ] }, { keepId: true });
    const activity = item.system.activities.get(FORTITUDE_ID);
    const updates = await activity.consume({ consume: { resources: true, spellSlot: false, action: false },
      spikependium: { fortitudeReservation: reservation } }, message);
    if (!updates) { rolls.splice(0); return; }
    for (const roll of rolls) roll.options.spikependiumFortitude.consumed = true;
    return await wrapped(rolls, config, message, ...args);
  } catch (error) {
    rolls.splice(0);
    console.error("Spikependium: Аберрантная стойкость", error);
    ui.notifications.error("Не удалось завершить спасбросок со Стойкостью. Проверьте счётчик применений перед повтором.");
  } finally {
    fortitudeReservations.delete(actor.uuid);
  }
}

export function canUseDragonmarkActivity(activity) {
  if (activity?.id !== "mE12AOxwORthnXw7" || activity.item.flags.spikependium?.key !== "feat:greater-healing") return true;
  ui.notifications.warn("Улучшенное исцеление выбирается в стандартном окне броска Лечения ран.");
  return false;
}

export function dragonmarkChoices(config, ability = null) {
  const actor = config.subject;
  if (!actor?.isOwner) return [];
  return Object.entries(RULES).flatMap(([id, rule]) => {
    const mark = feature(actor, `feat:${id}`);
    if (!mark) return [];
    const matches = (type, key) => key && Object.hasOwn(rule[type] ?? {}, key)
      && (ability === null || !rule[type][key] || ability === rule[type][key]);
    if (!matches("skills", config.skill) && !matches("tools", config.tool)) return [];
    const dice = feature(actor, `feat:greater-${id}`) ? [4, 6] : [4];
    return dice.map(die => ({ value: `${mark.uuid}:${die}`, feature: mark.uuid, die: `1d${die}`, name: `${mark.name} (+1к${die})` }));
  });
}

export function prepareDragonmarkCheck(config, dialog) {
  const choices = dragonmarkChoices(config);
  if (!choices.length) return;
  config.spikependium = { ...config.spikependium, intuition: config.spikependium?.intuition ?? "none" };
  const Base = dialog.applicationClass ?? CONFIG.Dice.D20Roll.DefaultConfigurationDialog;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConfigurationContext(context, options) {
      context = await super._prepareConfigurationContext(context, options);
      context.fields.push({ name: "spikependium.intuition", value: this.config.spikependium.intuition,
        field: new foundry.data.fields.StringField({ label: "Интуиция метки дракона", required: true, blank: false,
          hint: "Одна дополнительная кость в этой проверке. Характеристика должна соответствовать правилу вашей метки.",
          choices: { none: "Не добавлять", ...Object.fromEntries(dragonmarkChoices(this.config).map(c => [c.value, c.name])) } }) });
      return context;
    }
    _buildConfig(roll, formData, index) {
      roll = super._buildConfig(roll, formData, index);
      this.config.spikependium.intuition = formData?.get("spikependium.intuition") ?? this.config.spikependium.intuition;
      return roll;
    }
  };
}

export function buildDragonmarkCheck(process, roll) {
  if (!process.spikependium?.intuition && !roll.options?.spikependiumIntuition) return;
  roll.parts = (roll.parts ?? []).filter(part => part !== BONUS);
  delete roll.data.spikependiumIntuition;
  delete roll.options.spikependiumIntuition;
  const selected = dragonmarkChoices(process, roll.data.abilityId ?? process.ability ?? "")
    .find(c => c.value === process.spikependium?.intuition);
  if (!selected) return;
  roll.parts.push(BONUS);
  roll.data.spikependiumIntuition = selected.die;
  roll.options.spikependiumIntuition = { value: selected.value, feature: selected.feature, die: selected.die };
}

export function finalizeDragonmarkCheck(rolls, config) {
  const selected = config.spikependium?.intuition;
  if (!rolls.length || !selected || selected === "none") return;
  if (rolls.some(roll => {
    const choice = dragonmarkChoices(config, roll.data.abilityId ?? config.ability ?? "").find(c => c.value === selected);
    return !choice || roll.options.spikependiumIntuition?.value !== selected || roll.data.spikependiumIntuition !== choice.die;
  })) {
    ui.notifications.warn("Интуиция метки недоступна для этой характеристики или черта изменилась. Повторите проверку без бонуса либо выберите допустимую характеристику и кость.");
    return false;
  }
}

function healingMark(activity) {
  return activity?.item?.type === "spell" && activity.item.system.identifier === "cure-wounds"
    && !activity.item.flags.spikependium?.storedSpell && activity.actor?.isOwner
    ? feature(activity.actor, "feat:greater-healing") : null;
}

export function prepareDragonmarkHealing(config, dialog) {
  const mark = healingMark(config.subject);
  if (!mark || !config.rolls.some(r => r.options?.type === "healing")) return;
  config.spikependium = { ...config.spikependium, improvedCure: config.spikependium?.improvedCure ?? false };
  const Base = dialog.applicationClass ?? CONFIG.Dice.DamageRoll.DefaultConfigurationDialog;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConfigurationContext(context, options) {
      context = await super._prepareConfigurationContext(context, options);
      context.fields.push({ name: "spikependium.improvedCure", value: this.config.spikependium.improvedCure,
        field: new foundry.data.fields.BooleanField({ label: "Улучшенное исцеление",
          hint: "В Лечении ран считать 1 и 2 на костях восстановления хитов как 3." }) });
      return context;
    }
    _buildConfig(roll, formData, index) {
      roll = super._buildConfig(roll, formData, index);
      this.config.spikependium.improvedCure = formData?.get("spikependium.improvedCure") ?? this.config.spikependium.improvedCure;
      roll.options.spikependiumImprovedCure = this.config.spikependium.improvedCure === true && roll.options.type === "healing" ? mark.uuid : null;
      return roll;
    }
  };
}

export function finalizeDragonmarkHealing(rolls, config) {
  if (!rolls.length || !config.spikependium?.improvedCure) return;
  const mark = healingMark(config.subject), healing = rolls.filter(r => r.options.type === "healing");
  if (!mark || !healing.length || healing.some(r => r._evaluated || r.options.spikependiumImprovedCure !== mark.uuid)) {
    ui.notifications.warn("Улучшенное исцеление больше недоступно. Повторите бросок Лечения ран без улучшения.");
    return false;
  }
  for (const roll of healing) {
    for (const die of roll.dice) if (!die.modifiers.includes("min3")) die.modifiers.push("min3");
    roll.resetFormula();
  }
}
