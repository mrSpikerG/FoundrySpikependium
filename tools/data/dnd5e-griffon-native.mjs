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
