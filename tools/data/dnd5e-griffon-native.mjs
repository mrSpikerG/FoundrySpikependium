// MIT: foundryvtt/dnd5e, commit 87e94dbd9f930135e0694cd7e7d49f210603cd2c.
// Exact method bodies from module/data/actor/templates/attributes.mjs and module/data/item/equipment.mjs.
const _loc = s => s;
const simplifyBonus = value => Number(value) || 0;
const AdvantageModeField = { setMode() {} };
const replaceFormulaData = (formula, data) => formula.replace(/@([a-zA-Z.]+)/g, (_, key) => key.split(".").reduce((v, k) => v[k], data));
export function nativeGriffonArmorClass(rollData) {
    const ac = this.attributes.ac;
    ac.label = "";
    ac.flat ||= 0;

    // Add formulas set by old-style AEs
    if ( ac.calc === "flat" ) ac.override = ac.flat;
    else if ( (ac.calc === "custom") && ac.formula ) ac.formulas.push({
      formula: ac.formula, label: _loc("DND5E.ARMORCLASS.Calculation.Custom")
    });
    else if ( ac.calc in CONFIG.DND5E.armorClasses ) ac.calcs.add(ac.calc);

    // Add selected formulas
    const baseFormulas = foundry.utils.iterateEntries(CONFIG.DND5E.armorClasses)
      .filter(([id]) => ac.calcs.has(id))
      .map(([id, data]) => ({ ...data, id, type: "base" }));
    ac.formulas.unshift(...baseFormulas);

    // Identify Equipped Items
    const { armors, shields } = this.parent.itemTypes.equipment.reduce((obj, equip) => {
      if ( !equip.system.equipped || !(equip.system.type.value in CONFIG.DND5E.armorTypes)) return obj;
      if ( equip.system.type.value === "shield" ) obj.shields.push(equip);
      else obj.armors.push(equip);
      return obj;
    }, { armors: [], shields: [] });

    // Equipped Armor
    if ( armors.length ) {
      if ( armors.length > 1 ) this.parent._preparationWarnings.push({
        message: _loc("DND5E.WarnMultipleArmor"), type: "warning"
      });
      ac.equippedArmor = armors[0];
      ac.armor = ac.equippedArmor.system.armor.value ?? ac.armor;
      if ( ac.equippedArmor.system.properties.has("stealthDisadvantage")
        && ("ste" in CONFIG.DND5E.skills)
        && this.skills ) {
        AdvantageModeField.setMode(this, "skills.ste.roll.mode", -1);
      }
    }

    // Equipped Shield
    if ( shields.length ) {
      if ( shields.length > 1 ) this.parent._preparationWarnings.push({
        message: _loc("DND5E.WarnMultipleShields"), type: "warning"
      });
      ac.equippedShield = shields[0];
      ac.shield = ac.equippedShield.system.armor.value ?? 0;
    }

    // If armor is equipped, prepare clamped abilities
    const isHeavy = ac.equippedArmor?.system.type.value === "heavy";
    ac.clamped = Object.entries(this.abilities).reduce((obj, [k, v]) => {
      obj[k] = isHeavy ? 0 : Math.min(v.mod, ac.equippedArmor?.system.armor.dex ?? Infinity);
      return obj;
    }, {});
    ac.dex = ac.clamped.dex;

    const validFormulas = ac.formulas.filter(formula => {
      if ( !formula.formula ) return false;
      if ( (typeof formula.armored === "boolean") && (formula.armored !== !!ac.equippedArmor) ) return false;
      if ( (typeof formula.shielded === "boolean") && (formula.shielded !== !!ac.equippedShield) ) return false;
      return true;
    });

    for ( const config of validFormulas ) {
      try {
        const replaced = replaceFormulaData(config.formula, rollData, {
          actor: this, missing: null, property: _loc("DND5E.ArmorClass")
        });
        const result = replaced ? new Roll(replaced).evaluateSync().total : 0;
        if ( result > ac.base ) {
          ac.activeFormula = config;
          ac.base = result;
          ac.calc = config.id ?? "custom";
          ac.formula = config.formula;
          if ( config.id === "armored" ) ac.label = ac.equippedArmor.name;
          else ac.label = config.label ?? "";
        }
      } catch {
        this.parent._preparationWarnings.push({
          message: _loc("DND5E.WarnBadACFormula", { formula: config.formula }), link: "armor", type: "error"
        });
      }
    }

    if ( !Number.isFinite(ac.base) ) {
      ac.base = ac.flat ?? 0;
      ac.calc = "natural";
      ac.formula = "@attributes.ac.flat";
    }

    ac.cover = Math.max(ac.cover, this.parent.coverBonus);
    ac.min = simplifyBonus(ac.min, rollData);
    ac.bonus = simplifyBonus(ac.bonus, rollData);
    if ( Number.isFinite(ac.override) ) ac.value = ac.override;
    else ac.value = Math.max(ac.min, ac.base + ac.shield + ac.bonus + ac.cover);
}
export function nativeEquipmentProficiency() {
    if ( Number.isFinite(this.proficient) ) return this.proficient;
    const actor = this.parent.actor;
    if ( !actor ) return 0;
    if ( actor.system.isNPC ) return 1; // NPCs are always considered proficient with any armor in their stat block.
    const config = CONFIG.DND5E.armorProficienciesMap;
    const itemProf = config[this.type.value];
    const actorProfs = actor.system.traits?.armorProf?.value ?? new Set();
    const isProficient = (itemProf === true) || actorProfs.has(itemProf) || actorProfs.has(this.type.baseItem);
    return Number(isProficient);
}

export function nativeGriffonEncumbrance(rollData, { validateItem }={}) {
    const config = CONFIG.DND5E.encumbrance;
    const encumbrance = this.attributes.encumbrance ??= {};
    const baseUnits = CONFIG.DND5E.encumbrance.baseUnits[this.parent.type]
      ?? CONFIG.DND5E.encumbrance.baseUnits.default;
    const unitSystem = game.settings.get("dnd5e", "metricWeightUnits") ? "metric" : "imperial";
    const { attributes } = this;

    // Get the total weight from items
    let weight = this.parent.items
      .filter(item => !item.container && (validateItem?.(item) ?? true))
      .reduce((weight, item) => weight + (item.system.totalWeightIn?.(baseUnits[unitSystem]) ?? 0), 0);

    // [Optional] add Currency Weight (for non-transformed actors)
    const currency = this.currency;
    if ( game.settings.get("dnd5e", "currencyWeight") && currency ) {
      const numCoins = Object.values(currency).reduce((val, denom) => val + Math.max(denom, 0), 0);
      const currencyPerWeight = config.currencyPerWeight[unitSystem];
      weight += convertWeight(
        numCoins / currencyPerWeight,
        config.baseUnits.default[unitSystem],
        baseUnits[unitSystem]
      );
    }

    // Determine the Encumbrance size class
    const keys = CONFIG.DND5E.actorSizes.orderedKeys;
    const index = keys.findIndex(k => k === this.traits.size);
    const sizeConfig = CONFIG.DND5E.actorSizes[
      keys[this.parent.flags.dnd5e?.powerfulBuild ? Math.min(index + 1, keys.length - 1) : index]
    ];
    const sizeMod = sizeConfig?.capacityMultiplier ?? sizeConfig?.token ?? 1;
    let maximumMultiplier;

    const calculateThreshold = threshold => {
      let base = this.abilities.str?.value ?? 10;
      const bonus = simplifyBonus(encumbrance.bonuses?.[threshold], rollData)
        + simplifyBonus(encumbrance.bonuses?.overall, rollData);
      let multiplier = simplifyBonus(encumbrance.multipliers[threshold], rollData)
        * simplifyBonus(encumbrance.multipliers.overall, rollData);
      if ( threshold === "maximum" ) maximumMultiplier = multiplier;
      if ( this.isVehicle ) {
        const { cargo } = attributes.capacity;
        base = convertWeight(cargo.value || Infinity, cargo.units, baseUnits[unitSystem]);
      }
      else multiplier *= (config.threshold[threshold]?.[unitSystem] ?? 1) * sizeMod;
      return (base * multiplier).toNearest(0.1) + bonus;
    };

    // Populate final Encumbrance values
    encumbrance.value = weight.toNearest(0.1);
    encumbrance.thresholds = {
      encumbered: calculateThreshold("encumbered"),
      heavilyEncumbered: calculateThreshold("heavilyEncumbered"),
      maximum: calculateThreshold("maximum")
    };
    encumbrance.max = encumbrance.thresholds.maximum;
    encumbrance.mod = (sizeMod * maximumMultiplier).toNearest(0.1);
    encumbrance.stops = {
      encumbered: Number.isFinite(encumbrance.max)
        ? Math.clamp((encumbrance.thresholds.encumbered * 100) / encumbrance.max, 0, 100)
        : 0,
      heavilyEncumbered: Number.isFinite(encumbrance.max)
        ? Math.clamp((encumbrance.thresholds.heavilyEncumbered * 100) / encumbrance.max, 0, 100)
        : 0
    };
    encumbrance.pct = Math.clamp((encumbrance.value * 100) / encumbrance.max, 0, 100);
    encumbrance.encumbered = encumbrance.value > encumbrance.heavilyEncumbered;
}

// Exact method from module/data/region-behavior/difficult-terrain.mjs at the same pinned commit.
export function nativeGriffonTerrain(token, segment) {
    const ignoredTypes = token.actor?.system.attributes?.movement?.ignoredDifficultTerrain ?? new Set();
    if ( token.disposition === CONST.TOKEN_DISPOSITIONS.SECRET ) return [];
    if ( this.ignoredDispositions.has(token.disposition) || ignoredTypes.has("all")
      || (this.types.size && !this.types.difference(ignoredTypes).size)
      || (ignoredTypes.has("magical") && this.magical)
      || (ignoredTypes.has("nonmagical") && !this.magical) ) return [];
    return [{ name: "difficultTerrain" }];
}

// Exact method from module/documents/activity/cast.mjs at the same pinned commit.
export function nativeGriffonCastChanges() {
    const changes = [{ key: "system.method", type: "override", value: "spell" }];
    const source = this.toObject();

    // Override spell details
    for ( const type of ["activation", "duration", "range", "target"] ) {
      if ( !this[type].override ) continue;
      const data = source[type];
      delete data.override;
      changes.push({ key: `system.${type}`, type: "override", value: JSON.stringify(data) });
    }

    // Set the casting ability
    if ( this.spell.ability ) changes.push(
      { key: "system.ability", type: "override", value: this.spell.ability }
    );

    // Remove ignored properties
    for ( const property of this.spell.properties ) {
      changes.push({ key: "system.properties", type: "add", value: `-${property}` });
    }

    // Set challenge overrides
    const challenge = this.spell.challenge;
    if ( challenge.override && challenge.attack ) changes.push(
      { key: "activities[attack].attack.bonus", type: "override", value: challenge.attack },
      { key: "activities[attack].attack.flat", type: "override", value: true },
      { key: "activities[summon].flat.attack", type: "override", value: challenge.attack }
    );
    if ( challenge.override && challenge.save ) changes.push(
      { key: "activities[save].save.dc.calculation", type: "override", value: "" },
      { key: "activities[save].save.dc.formula", type: "override", value: challenge.save },
      { key: "activities[summon].flat.save", type: "override", value: challenge.save }
    );

    return changes;
}

// Exact prepareMovement body at the pinned commit; tests below use imperial units and unlevelled conditions.
const convertLength = value => value, defaultUnits = () => "ft", ConditionData = { hasLevels: () => false };
export function nativeGriffonMovement(rollData=this.parent.getRollData()) {
    const statuses = this.parent.statuses;
    const noMovement = this.parent.hasConditionEffect("noMovement");
    const crawl = this.parent.hasConditionEffect("crawl");
    const speeds = this.attributes.movement.speeds;
    for ( const type of Object.keys(CONFIG.DND5E.movementTypes) ) {
      if ( noMovement || (crawl && (type !== "walk")) ) speeds[type] = 0;
      else speeds[type] = Math.max(0, simplifyBonus(speeds[type], rollData));
      if ( type === "walk" ) this.attributes.movement.speed = speeds.walk;
    }

    const halfMovement = this.parent.hasConditionEffect("halfMovement");
    const encumbered = statuses.has("encumbered");
    const heavilyEncumbered = statuses.has("heavilyEncumbered");
    const exceedingCarryingCapacity = statuses.has("exceedingCarryingCapacity");
    const units = this.attributes.movement.units ??= defaultUnits("length");

    let reduction = statuses.reduce((acc, status) => {
      const immune = this.traits?.ci?.value?.has(status);
      if ( immune ) return acc;

      const speed = CONFIG.DND5E.conditionTypes[status]?.reduction?.speed ?? 0;
      const level = ConditionData.hasLevels(status)
        ? this.parent.system.conditions[status] ?? 0
        : Boolean(statuses.has(status));
      return acc + (level * speed);
    }, 0);
    if ( ((this.attributes.ac?.equippedArmor?.system.strength ?? 0) > (this.abilities?.str?.value ?? Infinity))
      && !this.parent.flags.dnd5e?.ignoreArmorSpeedReduction && this.isCreature ) {
      reduction += CONFIG.DND5E.armorSpeedReduction;
    }
    reduction = convertLength(reduction, CONFIG.DND5E.defaultUnits.length.imperial, units);
    const bonus = simplifyBonus(this.attributes.movement.bonus, rollData);
    const multiplier = this.attributes.movement.multiplier * (halfMovement ? 0.5 : 1);
    this.attributes.movement.max = 0;
    for ( const type of Object.keys(CONFIG.DND5E.movementTypes) ) {
      let speed = Math.max(0, speeds[type] - reduction);
      if ( (speed * multiplier) > 0 ) {
        speed = Math.max(0, speed + bonus) * multiplier;
        if ( heavilyEncumbered ) {
          speed = Math.max(0, speed - (CONFIG.DND5E.encumbrance.speedReduction.heavilyEncumbered[units] ?? 0));
        } else if ( encumbered ) {
          speed = Math.max(0, speed - (CONFIG.DND5E.encumbrance.speedReduction.encumbered[units] ?? 0));
        }
        if ( exceedingCarryingCapacity ) {
          speed = Math.min(speed, CONFIG.DND5E.encumbrance.speedReduction.exceedingCarryingCapacity[units] ?? 0);
        }
        speeds[type] = speed;
      } else {
        speeds[type] = 0;
      }
      this.attributes.movement.max = Math.max(speeds[type], this.attributes.movement.max);
      if ( type === "walk" ) this.attributes.movement.speed = speeds[type];
    }
    const baseSpeed = this._source.attributes.movement.speeds.walk || this.attributes.movement.fromSpecies?.walk;
    this.attributes.movement.slowed = speeds.walk <= (simplifyBonus(baseSpeed, rollData) / 2);
    this.attributes.movement.speeds.jump = (this.abilities?.str.value ?? 0) / 2;
}

// Unchanged method body from module-documents-actor-actor.mjs at the pinned commit.
export async function nativeGriffonRollHitDie(config={}, dialog={}, message={}) {
    let formula;
    let oldFormat = false;

    let cls = null;

    // NPCs only have one denomination
    if ( this.system.isNPC ) {
      config.denomination = `d${this.system.attributes.hd.denomination}`;

      // If no hit dice are available, display an error notification
      if ( !this.system.attributes.hd.value ) {
        ui.notifications.error("DND5E.HitDiceNPCWarn", { format: { name: this.name } });
        return null;
      }
    }

    // Otherwise check classes
    else {
      // If no denomination was provided, choose the first available
      if ( !config.denomination ) {
        cls = this.system.attributes.hd.classes.find(c => c.system.hd.value);
        if ( !cls ) return null;
        config.denomination = cls.system.hd.denomination;
      }

      // Otherwise, locate a class (if any) which has an available hit die of the requested denomination
      else cls = this.system.attributes.hd.classes.find(i => {
        return (i.system.hd.denomination === config.denomination) && i.system.hd.value;
      });

      // If no class is available, display an error notification
      if ( !cls ) {
        ui.notifications.error("DND5E.HitDiceWarn", { format: { name: this.name, formula: config.denomination } });
        return null;
      }
    }
    const rulesVersion = dnd5e.settings.rulesVersion;
    const minimumValue = rulesVersion === "modern" ? 1 : 0;
    formula ??= `max(${minimumValue}, 1${config.denomination} + @abilities.con.mod)`;
    const rollConfig = foundry.utils.deepClone(config);
    rollConfig.hookNames = [...(config.hookNames ?? []), "hitDie"];
    rollConfig.rolls = [{ parts: [formula], data: this.getRollData() }].concat(config.rolls ?? []);
    rollConfig.subject = this;

    const dialogConfig = foundry.utils.mergeObject({
      configure: false
    }, dialog);

    const flavor = _loc("DND5E.HitDiceRoll");
    const messageConfig = foundry.utils.mergeObject({
      rollMode: CONFIG.Dice.BasicRoll.getMessageMode(),
      data: {
        speaker: ChatMessage.implementation.getSpeaker({actor: this}),
        flavor,
        title: `${flavor}: ${this.name}`,
        type: "hitDie"
      }
    }, message);

    const rolls = await CONFIG.Dice.BasicRoll.build(rollConfig, dialogConfig, messageConfig);
    if ( !rolls.length ) return null;
    const returnValue = oldFormat && rolls?.length ? rolls[0] : rolls;

    const updates = { actor: {}, class: {} };
    if ( rollConfig.modifyHitDice !== false ) {
      if ( cls ) updates.class["system.hd.spent"] = cls.system.hd.spent + 1;
      else updates.actor["system.attributes.hd.spent"] = this.system.attributes.hd.spent + 1;
    }
    const hp = this.system.attributes.hp;
    if ( rollConfig.modifyHitPoints !== false ) {
      const total = rolls.reduce((t, r) => t + r.total, 0);
      const calculated = this.calculateDamage([{ type: "healing", value: total }], { invertHealing: false });
      const dhp = Math.min(Math.max(0, hp.effectiveMax) - hp.value, calculated ? calculated.amount : total);
      updates.actor["system.attributes.hp.value"] = hp.value + dhp;
    }

    /**
     * A hook event that fires after a hit die has been rolled for an Actor, but before updates have been performed.
     * @function dnd5e.rollHitDie
     * @memberof hookEvents
     * @param {BasicRoll[]} rolls          The resulting rolls.
     * @param {object} data
     * @param {Actor5e} data.subject       Actor for which the hit die has been rolled.
     * @param {object} data.updates
     * @param {object} data.updates.actor  Updates that will be applied to the actor.
     * @param {object} data.updates.class  Updates that will be applied to the class.
     * @returns {boolean}                  Explicitly return `false` to prevent updates from being performed.
     */
    if ( Hooks.call("dnd5e.rollHitDie", rolls, { subject: this, updates }) === false ) return returnValue;
    if ( Hooks.call("dnd5e.rollHitDieV2", rolls, { subject: this, updates }) === false ) return returnValue;

    // Perform updates
    if ( !foundry.utils.isEmpty(updates.actor) ) await this.update(updates.actor);
    if ( !foundry.utils.isEmpty(updates.class) ) await cls.update(updates.class);

    /**
     * A hook event that fires after a hit die has been rolled for an Actor and updates have been performed.
     * @function dnd5e.postRollHitDie
     * @memberof hookEvents
     * @param {BasicRoll[]} rolls     The resulting rolls.
     * @param {object} data
     * @param {Actor5e} data.subject  Actor for which the roll was performed.
     */
    Hooks.callAll("dnd5e.postRollHitDie", rolls, { subject: this });

    return returnValue;
}

// Unchanged method body from module-dice-basic-roll.mjs at the pinned commit.
export async function nativeGriffonBasicConfigure(config={}, dialog={}, message={}) {
    config.hookNames = [...(config.hookNames ?? []), ""];

    /**
     * A hook event that fires before a roll is performed. Multiple hooks may be called depending on the rolling
     * method (e.g. `dnd5e.preRollSkill`, `dnd5e.preRollAbilityCheck`, `dnd5e.preRoll`). Exact contents of the
     * configuration object will also change based on the roll type, but the same objects will always be present.
     * @function dnd5e.preRoll
     * @memberof hookEvents
     * @param {BasicRollProcessConfiguration} config   Configuration data for the pending roll.
     * @param {BasicRollDialogConfiguration} dialog    Presentation data for the roll configuration dialog.
     * @param {BasicRollMessageConfiguration} message  Configuration data for the roll's message.
     * @returns {boolean}                              Explicitly return `false` to prevent the roll.
     */
    for ( const hookName of config.hookNames ) {
      if ( Hooks.call(`dnd5e.preRoll${hookName.capitalize()}`, config, dialog, message) === false ) return [];
      if ( Hooks.call(`dnd5e.preRoll${hookName.capitalize()}V2`, config, dialog, message) === false ) return [];
    }

    this.applyKeybindings(config, dialog, message);
    dialog.sheet ??= foundry.applications.instances.get(config.event?.target?.closest(".application")?.id);

    let rolls;
    if ( dialog.configure === false ) {
      rolls = config.rolls?.map((r, index) => {
        dialog.options?.buildConfig?.(config, r, null, index);
        for ( const hookName of config.hookNames ) {
          Hooks.callAll(`dnd5e.postBuild${hookName.capitalize()}RollConfig`, config, r, index);
        }
        return this.fromConfig(r, config);
      }) ?? [];
    } else {
      const DialogClass = dialog.applicationClass ?? this.DefaultConfigurationDialog;
      rolls = await DialogClass.configure(config, dialog, message);
    }

    // Store the roll type in roll.options so it can be accessed from only the roll
    const rollType = foundry.utils.getProperty(message, "data.type");
    if ( rollType && (rollType !== "base") ) rolls.forEach(roll => roll.options.rollType ??= rollType);

    /**
     * A hook event that fires after roll configuration is complete, but before the roll is evaluated.
     * Multiple hooks may be called depending on the rolling method (e.g. `dnd5e.postSkillCheckRollConfiguration`,
     * `dnd5e.postAbilityTestRollConfiguration`, and `dnd5e.postRollConfiguration` for skill checks). Exact contents of
     * the configuration object will also change based on the roll type, but the same objects will always be present.
     * @function dnd5e.postRollConfiguration
     * @memberof hookEvents
     * @param {BasicRoll[]} rolls                      Rolls that have been constructed but not evaluated.
     * @param {BasicRollProcessConfiguration} config   Configuration information for the roll.
     * @param {BasicRollDialogConfiguration} dialog    Configuration for the roll dialog.
     * @param {BasicRollMessageConfiguration} message  Configuration for the roll message.
     * @returns {boolean}                              Explicitly return `false` to prevent rolls.
     */
    for ( const hookName of config.hookNames ) {
      const name = `dnd5e.post${hookName.capitalize()}RollConfiguration`;
      if ( Hooks.call(name, rolls, config, dialog, message) === false ) return [];
    }

    return rolls;
}

// Exact equipment preparation method; shared description/weight/identification preparation is injected by tests.
export class NativeGriffonEquipment extends class { prepareDerivedData() {} } {
  prepareDerivedData() {
    super.prepareDerivedData();
    this.prepareDescriptionData();
    this.prepareIdentifiable();
    this.preparePhysicalData();
    this.prepareMountableData();
    const magicalBonus = simplifyBonus(this.armor.magicalBonus, this.parent.getRollData());
    if ( this.magicAvailable && magicalBonus ) this.armor.value += magicalBonus;
    this.type.label = CONFIG.DND5E.equipmentTypes[this.type.value]
      ?? _loc(CONFIG.Item.typeLabels.equipment);
    this.type.identifier = this.type.value === "shield"
      ? CONFIG.DND5E.shieldIds[this.type.baseItem]
      : CONFIG.DND5E.armorIds[this.type.baseItem];

    const labels = this.parent.labels ??= {};
    labels.armor = this.armor.value ? `${this.armor.value} ${_loc("DND5E.AC")}` : "";
  }
}
