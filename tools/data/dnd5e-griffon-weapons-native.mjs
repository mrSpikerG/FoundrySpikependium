/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Source: foundryvtt/dnd5e 87e94dbd9f930135e0694cd7e7d49f210603cd2c.
Methods from module/documents/activity/attack.mjs, module/data/activity/attack-data.mjs and module/data/activity/base-activity.mjs.
*/
// Pinned native AttackActivity.rollAttack/_buildAttackConfig and AttackData._getDamageParts.
// Only super._getDamageParts is supplied by the test; UI dependencies are injected.
let TargetsField, D20RollModificationField, AttackRollConfigurationDialog, _loc;
export function setNativeAmmoContext(c) { ({ TargetsField, D20RollModificationField, AttackRollConfigurationDialog, _loc } = c); }
export async function nativeAmmoRollAttack(config={}, dialog={}, message={}) {
    const targets = TargetsField.getDescriptors();

    if ( (this.item.type === "weapon") && (this.item.system.quantity === 0) ) {
      ui.notifications.warn("DND5E.ATTACK.Warning.NoQuantity", { localize: true });
    }

    const buildConfig = this._buildAttackConfig.bind(this);

    const rollConfig = foundry.utils.mergeObject({
      ability: this.item.getFlag("dnd5e", `last.${this.id}.ability`),
      ammunition: this.item.getFlag("dnd5e", `last.${this.id}.ammunition`),
      attackMode: this.item.getFlag("dnd5e", `last.${this.id}.attackMode`),
      halflingLucky: this.actor?.getFlag("dnd5e", "halflingLucky"),
      mastery: this.item.getFlag("dnd5e", `last.${this.id}.mastery`),
      target: targets.length === 1 ? targets[0].ac : undefined
    }, config);

    const abilityOptions = this._getAbilityOptions();
    if ( abilityOptions.length && !abilityOptions.find(a => a.value === rollConfig.ability) ) {
      rollConfig.ability = abilityOptions[0]?.value;
    }
    const ammunitionOptions = this.item.system.ammunitionOptions ?? [];
    if ( ammunitionOptions.length ) ammunitionOptions.unshift({ value: "", label: "" });
    if ( rollConfig.ammunition === undefined ) rollConfig.ammunition = ammunitionOptions?.[1]?.value;
    else if ( !ammunitionOptions?.find(m => m.value === rollConfig.ammunition) ) {
      rollConfig.ammunition = ammunitionOptions?.[0]?.value;
    }
    const attackModeOptions = this.item.system.attackModes;
    if ( !attackModeOptions?.find(m => m.value === rollConfig.attackMode) ) {
      rollConfig.attackMode = attackModeOptions?.[0]?.value;
    }
    const masteryOptions = this.item.system.masteryOptions;
    if ( !masteryOptions?.find(m => m.value === rollConfig.mastery) ) {
      rollConfig.mastery = masteryOptions?.[0]?.value;
    }

    const rollData = this.getRollData({ roll: { ability: rollConfig.ability, attackMode: rollConfig.attackMode } });
    const { advantage, disadvantage } = this.actor ? D20RollModificationField.combineFields(this.actor.system, [
      `abilities.${rollConfig.ability}.attack.roll`,
      "rolls.attack", `rolls.attack.${this.getActionType(rollConfig.attackMode)}`
    ], { rules: { category: "attack", actor: this.actor, item: this.item, rollData } }) : {};

    rollConfig.hookNames = [...(config.hookNames ?? []), "attack", "d20Test"];
    rollConfig.rolls = [CONFIG.Dice.D20Roll.mergeConfigs({
      options: {
        advantage, disadvantage,
        ammunition: rollConfig.ammunition,
        attackMode: rollConfig.attackMode,
        criticalSuccess: this.criticalThreshold,
        mastery: rollConfig.mastery
      }
    }, config.rolls?.shift())].concat(config.rolls ?? []);
    rollConfig.subject = this;

    const dialogConfig = foundry.utils.mergeObject({
      applicationClass: AttackRollConfigurationDialog,
      options: {
        abilityOptions,
        ammunitionOptions: rollConfig.ammunition !== false ? ammunitionOptions : [],
        attackModeOptions,
        buildConfig,
        masteryOptions: (masteryOptions?.length > 1) && !config.mastery ? masteryOptions : [],
        position: {
          top: config.event ? config.event.clientY - 80 : null,
          left: window.innerWidth - 710
        },
        window: {
          title: _loc("DND5E.AttackRoll"),
          subtitle: this.item.name,
          icon: this.item.img
        }
      }
    }, dialog);

    const messageConfig = foundry.utils.mergeObject({
      create: true,
      data: {
        flavor: `${this.item.name} - ${_loc("DND5E.AttackRoll")}`,
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        system: { ...this.messageSources, targets },
        type: "attack"
      }
    }, message);

    const rolls = await CONFIG.Dice.D20Roll.buildConfigure(rollConfig, dialogConfig, messageConfig);
    await CONFIG.Dice.D20Roll.buildEvaluate(rolls, rollConfig, messageConfig);
    if ( !rolls.length ) return null;
    const { ability, ammunition, mastery, attackMode: mode } = rolls[0].options;
    for ( const [key, value] of Object.entries({ ability, ammunition, mastery, mode }) ) {
      if ( value ) foundry.utils.setProperty(messageConfig.data, `system.${key}`, value);
    }
    await CONFIG.Dice.D20Roll.buildPost(rolls, rollConfig, messageConfig);

    const flags = {};
    let ammoUpdate = null;

    const canUpdate = this.item.isOwner && !this.item.inCompendium;
    if ( rolls[0].options.ability ) flags.ability = rolls[0].options.ability;
    if ( rolls[0].options.ammunition ) {
      const ammo = this.actor?.items.get(rolls[0].options.ammunition);
      if ( ammo ) {
        if ( !ammo.system.properties?.has("ret") ) {
          ammoUpdate = { id: ammo.id, quantity: Math.max(0, ammo.system.quantity - 1) };
          ammoUpdate.destroy = ammo.system.uses.autoDestroy && (ammoUpdate.quantity === 0);
        }
        flags.ammunition = rolls[0].options.ammunition;
      }
    } else if ( rolls[0].options.attackMode?.startsWith("thrown") && !this.item.system.properties?.has("ret") ) {
      ammoUpdate = { id: this.item.id, quantity: Math.max(0, this.item.system.quantity - 1) };
    } else if ( !rolls[0].options.ammunition && dialogConfig.options?.ammunitionOptions?.length ) {
      flags.ammunition = "";
    }
    if ( rolls[0].options.attackMode ) flags.attackMode = rolls[0].options.attackMode;
    else if ( rollConfig.attackMode ) rolls[0].options.attackMode = rollConfig.attackMode;
    if ( rolls[0].options.mastery ) flags.mastery = rolls[0].options.mastery;
    if ( canUpdate && !foundry.utils.isEmpty(flags) && (this.actor && this.actor.items.has(this.item.id)) ) {
      await this.item.setFlag("dnd5e", `last.${this.id}`, flags);
    }

    /**
     * A hook event that fires after an attack has been rolled but before any ammunition is consumed.
     * @function dnd5e.rollAttack
     * @memberof hookEvents
     * @param {D20Roll[]} rolls                        The resulting rolls.
     * @param {object} data
     * @param {AttackActivity|null} data.subject       The Activity that performed the attack.
     * @param {AmmunitionUpdate|null} data.ammoUpdate  Any updates related to ammo consumption for this attack.
     */
    Hooks.callAll("dnd5e.rollAttack", rolls, { subject: this, ammoUpdate });
    Hooks.callAll("dnd5e.rollAttackV2", rolls, { subject: this, ammoUpdate });

    // Commit ammunition consumption on attack rolls resource consumption if the attack roll was made
    if ( canUpdate && ammoUpdate?.destroy ) {
      // If ammunition was deleted, store a copy of it in the roll message
      const deleted = [this.actor.items.get(ammoUpdate.id).toObject()];
      const messageId = messageConfig.data?.system?.origin
        ?? rollConfig.event?.target.closest("[data-message-id]")?.dataset.messageId;
      const attackMessage = dnd5e.registry.messages.get(messageId, "attack")?.pop();
      await attackMessage?.update({ "system.deltas": { deleted } });
      await this.actor.deleteEmbeddedDocuments("Item", [ammoUpdate.id]);
    }
    else if ( canUpdate && ammoUpdate ) await this.actor?.updateEmbeddedDocuments("Item", [
      { _id: ammoUpdate.id, "system.quantity": ammoUpdate.quantity }
    ]);

    /**
     * A hook event that fires after an attack has been rolled and ammunition has been consumed.
     * @function dnd5e.postRollAttack
     * @memberof hookEvents
     * @param {D20Roll[]} rolls                   The resulting rolls.
     * @param {object} data
     * @param {AttackActivity|null} data.subject  The activity that performed the attack.
     */
    Hooks.callAll("dnd5e.postRollAttack", rolls, { subject: this });

    return rolls;
  }
export function nativeAmmoBuildConfig(process, config, formData, index) {
    const ability = formData?.get("ability") ?? process.ability;
    const ammunition = formData?.get("ammunition") ?? process.ammunition;
    const attackMode = formData?.get("attackMode") ?? process.attackMode;
    const mastery = formData?.get("mastery") ?? process.mastery;

    let { parts, data } = this.getAttackData({ ability, ammunition, attackMode });
    const { maximum, minimum } = this.actor ? D20RollModificationField.combineFields(this.actor.system, [
      `abilities.${ability}.attack.roll`,
      "rolls.attack", `rolls.attack.${this.getActionType(attackMode)}`
    ], { rules: { category: "attack", actor: this.actor, item: this.item, rollData: data } }) : {};
    const options = CONFIG.Dice.D20Roll.mergeOptions({
      elvenAccuracy: this.actor?.getFlag("dnd5e", "elvenAccuracy")
        && CONFIG.DND5E.characterFlags.elvenAccuracy.abilities.includes(ability),
      maximum,
      minimum
    }, config.options);
    if ( ability !== undefined ) options.ability = ability;
    if ( ammunition !== undefined ) options.ammunition = ammunition;
    if ( attackMode !== undefined ) options.attackMode = attackMode;
    if ( mastery !== undefined ) options.mastery = mastery;

    config.parts = [...(config.parts ?? []), ...parts];
    config.data = { ...data, ...(config.data ?? {}) };
    config.options = options;
  }
export function nativeAmmoDamageParts(config={}, baseParts) {
    const ammo = config.ammunition?.system;
    const parts = baseParts(config);
    if ( !ammo?.damage.base.formula ) return parts;

    const basePartIndex = parts.findIndex(i => i.base);
    const damage = ammo.damage.base.clone(ammo.damage.base);

    // If mode is "replace" and base part is present, replace the base part
    if ( ammo.damage.replace & (basePartIndex !== -1) ) {
      damage.base = true;
      parts.splice(basePartIndex, 1, damage);
    }

    // Otherwise stick the ammo damage after base part (or as first part)
    else {
      damage.ammo = true;
      parts.splice(basePartIndex + 1, 0, damage);
    }

    return parts;
  }
export function nativeAmmoBaseDamagePart(damage, rollConfig, rollData, index=0, { formulaOptions, rules }={}) {
    const scaledFormula = damage.scaledFormula(rollConfig.scaling ?? rollData.scaling, formulaOptions);
    const parts = scaledFormula ? [scaledFormula] : [];
    const lastType = this.item.getFlag("dnd5e", `last.${this.id}.damageType.${index}`);
    // Fall back to the item's base damage type when this part specifies none (e.g. weapon/ammo base damage).
    let { types } = damage;
    if ( !types.size && this.item.system.offersBaseDamage && (this.constructor.damageRuleCategory !== "healing") ) {
      types = this.item.system.damage.base.types;
    }
    const data = { ...rollData, roll: foundry.utils.deepClone(rollData.roll ?? {}) };
    data.roll.damage ??= {};
    data.roll.damage.type = (types.has(lastType) ? lastType : null) ?? types.first();

    if ( index === 0 ) {
      const actionType = this.getActionType(rollConfig.attackMode);
      const bonus = foundry.utils.getProperty(this.actor ?? {}, `system.rolls.damage.${actionType}.bonus`);
      if ( bonus && !/^0+$/.test(bonus) ) parts.push(bonus);
      if ( this.item.system.damage?.bonus ) parts.push(String(this.item.system.damage.bonus));
    }

    if ( rules ) {
      const ruleBonus = AppliedRules.createIterator(rules.bonus)
        .filterWith(data, { consumed: rules.consumed })
        .toFormula();
      if ( ruleBonus ) {
        data.ruleBonus = ruleBonus;
        parts.push("@ruleBonus");
      }
    }

    return {
      data, parts,
      options: {
        type: data.roll.damage.type,
        types: Array.from(types),
        properties: data.roll.properties
      }
    };
  }
