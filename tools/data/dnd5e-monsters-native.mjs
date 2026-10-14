/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Source: foundryvtt/dnd5e 87e94dbd9f930135e0694cd7e7d49f210603cd2c.
Exact method bodies; localization/formatting and host services are supplied by tests.
*/
export class ConsumptionError extends Error {}
const _loc = key => game.i18n.localize(key);
const formatNumber = n => String(n);
// module/data/activity/fields/consumption-targets-field.mjs at the same pinned commit.
export async function nativeConsumeMaterial(config, updates) {
    const item = this.actor.items.get(this.target);
    if ( !item ) throw new ConsumptionError(_loc("DND5E.CONSUMPTION.Warning.MissingItem", {
      activity: this.activity.name, item: this.item.name
    }));

    const delta = { item: item.id, keyPath: "system.quantity" };
    const cost = (await this.resolveCost({ config, delta, rolls: updates.rolls })).total;

    let warningMessage;
    if ( cost > 0 && !item.system.quantity ) warningMessage = "DND5E.CONSUMPTION.Warning.None";
    else if ( cost > item.system.quantity ) warningMessage = "DND5E.CONSUMPTION.Warning.NotEnough";
    if ( warningMessage ) throw new ConsumptionError(_loc(warningMessage, {
      available: formatNumber(item.system.quantity), cost: formatNumber(cost),
      type: _loc("DND5E.CONSUMPTION.Type.Material.Warning", { name: item.name })
    }));

    const newQuantity = item.system.quantity - cost;
    if ( (newQuantity === 0) && item.system.uses?.autoDestroy ) {
      updates.delete.push(item.id);
    } else {
      const itemUpdate = { "system.quantity": newQuantity };
      const itemIndex = updates.item.findIndex(i => i._id === item.id);
      if ( itemIndex === -1 ) updates.item.push({ _id: item.id, ...itemUpdate });
      else foundry.utils.mergeObject(updates.item[itemIndex], itemUpdate);
    }
  }
export function nativeSpellChanges() {
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
export function nativeUsageConfig(config) {
      config = foundry.utils.deepClone(config);
      const linked = this.getLinkedActivity(config.cause?.activity);

      if ( config.create !== false ) {
        config.create ??= {};
        config.create.measuredTemplate ??= !!this.target.template.type && this.target.prompt;
        // TODO: Handle permissions checks in `ActivityUsageDialog`
      }

      const ignoreLinkedConsumption = this.isSpell && !this.consumption.spellSlot;
      if ( config.consume !== false ) {
        const activationConfig = CONFIG.DND5E.activityActivationTypes[this.activation.type] ?? {};
        const hasActionConsumption = activationConfig.consume
          && (activationConfig.consume.canConsume?.(this) !== false);
        const hasResourceConsumption = !!this.consumption.targets.find(c => !c.hasZeroCost(config));
        const hasLinkedConsumption = (linked?.consumption.targets.length > 0) && !ignoreLinkedConsumption;
        const hasSpellSlotConsumption = this.requiresSpellSlot && this.consumption.spellSlot;
        config.consume ??= {};
        config.consume.action ??= hasActionConsumption;
        config.consume.resources ??= Array.from(this.consumption.targets.entries())
          .filter(([, target]) => !target.combatOnly || this.actor.inCombat)
          .map(([index]) => index);
        config.consume.spellSlot ??= !linked && hasSpellSlotConsumption;
        config.hasConsumption = hasActionConsumption || hasResourceConsumption || hasLinkedConsumption
          || (!linked && hasSpellSlotConsumption);
      }

      const levelingFlag = this.item.getFlag("dnd5e", "spellLevel");
      if ( levelingFlag ) {
        // Handle fixed scaling from spell scrolls
        config.scaling = false;
        config.spell ??= {};
        config.spell.slot = levelingFlag.value;
      }

      else {
        const canScale = linked ? linked.consumption.scaling.allowed : this.canScale;
        const linkedDelta = (linked?.spell?.level ?? Infinity) - this.item.system.level;
        if ( !canScale ) config.scaling = false;
        else if ( Number.isFinite(linkedDelta) ) config.scaling ??= linkedDelta;

        if ( this.requiresSpellSlot ) {
          const { level, method } = this.item.system;
          const model = CONFIG.DND5E.spellcasting[method];
          config.spell ??= {};
          config.spell.slot ??= linked?.spell?.level
            ? `spell${linked.spell.level}`
            : (model?.getSpellSlotKey(level) ?? `spell${level}`);
          const scaling = (this.actor.system.spells?.[config.spell.slot]?.level ?? 0) - this.item.system.level;
          if ( scaling > 0 ) config.scaling ??= scaling;
        }
        config.scaling ??= 0;
      }

      if ( this.requiresConcentration && !game.settings.get("dnd5e", "disableConcentration") ) {
        config.concentration ??= {};
        config.concentration.begin ??= true;
        const { effects } = this.actor.concentration;
        const limit = this.actor.system.attributes?.concentration?.limit ?? 0;
        if ( limit && (limit <= effects.size) ) config.concentration.end ??= effects.find(e => {
          const data = e.flags.dnd5e?.item?.data ?? {};
          return (data === this.id) || (data._id === this.id);
        })?.id ?? effects.first()?.id ?? null;
      }

      if ( linked ) {
        config.cause ??= {};
        config.cause.activity ??= linked.relativeUUID;
        config.cause.resources ??= (linked.consumption.targets.length > 0) && !ignoreLinkedConsumption;
      }

      return config;
    }
export async function nativeUsageUpdates(config, { returnErrors=false }={}) {
      const updates = { activity: {}, actor: {}, create: [], delete: [], item: [], rolls: [] };
      if ( config.consume === false ) return updates;
      const errors = [];

      // Handle auto consumption.
      const activationConfig = CONFIG.DND5E.activityActivationTypes[this.activation.type];
      if ( ((config.consume === true) || config.consume.action) && activationConfig?.consume ) {
        const { property } = activationConfig.consume;
        const valueProperty = `${property}.value`;
        const containsConsumption = this.consumption.targets.find(t => {
          return (t.type === "attribute") && (t.target === valueProperty);
        });
        const count = this.activation.value ?? 1;
        const current = foundry.utils.getProperty(this.actor.system, property);
        if ( current && !containsConsumption ) {
          let message;
          if ( current.value < 1 ) message = "DND5E.ACTIVATION.Warning.NoActions";
          else if ( count > current.value ) message = "DND5E.ACTIVATION.Warning.NotEnoughActions";
          if ( message ) {
            const err = new ConsumptionError(_loc(message, {
              type: activationConfig.label,
              required: formatNumber(count),
              available: formatNumber(current.value)
            }));
            errors.push(err);
          } else {
            updates.actor[`system.${property}.spent`] = current.spent + count;
          }
        }
      }

      // Handle consumption targets
      if ( (config.consume === true) || config.consume.resources ) {
        const indexes = (config.consume === true) || (config.consume.resources === true)
          ? this.consumption.targets.keys() : config.consume.resources;
        for ( const index of indexes ) {
          const target = this.consumption.targets[index];
          if ( target.hasZeroCost(config) ) continue;
          try {
            await target.consume(config, updates);
          } catch (err) {
            if ( err instanceof ConsumptionError ) errors.push(err);
            else throw err;
          }
        }
      }

      // Handle consumption on a linked activity
      if ( config.cause ) {
        const linkedActivity = this.getLinkedActivity(config.cause.activity);
        if ( linkedActivity ) {
          const consume = {
            resources: (config.consume === true) || (config.cause?.resources === true)
              ? linkedActivity.consumption.targets.keys() : config.cause?.resources,
            spellSlot: false
          };
          const usageConfig = foundry.utils.mergeObject(config, { consume, cause: false }, { inplace: false });
          const results = await linkedActivity._prepareUsageUpdates(usageConfig, { returnErrors: true });
          if ( foundry.utils.getType(results) === "Object" ) {
            linkedActivity._mergeActivityUpdates(results);
            foundry.utils.mergeObject(updates.actor, results.actor);
            updates.delete.push(...results.delete);
            updates.item.push(...results.item);
            updates.rolls.push(...results.rolls);
            // Mark this item for deletion if it is linked to a cast activity that will be deleted
            const otherLinkedActivity = linkedActivity.type === "forward"
              ? linkedActivity.item.system.activities.get(linkedActivity.activity.id) : linkedActivity;
            if ( updates.delete.includes(linkedActivity.item.id)
              && (this.item.getFlag("dnd5e", "cachedFor") === otherLinkedActivity?.relativeUUID) ) {
              updates.delete.push(this.item.id);
            }
          } else if ( results?.length ) {
            errors.push(...results);
          }
        }
      }

      // Handle spell slot consumption
      else if ( ((config.consume === true) || config.consume.spellSlot)
        && this.requiresSpellSlot && this.consumption.spellSlot ) {
        const spellcasting = CONFIG.DND5E.spellcasting[this.item.system.method];
        const effectiveLevel = this.item.system.level + (config.scaling ?? 0);
        const slot = config.spell?.slot ?? spellcasting?.getSpellSlotKey(effectiveLevel) ?? this.item.system.method;
        const slotData = this.actor.system.spells?.[slot];
        if ( slotData ) {
          if ( slotData.value ) {
            const newValue = Math.max(slotData.value - 1, 0);
            foundry.utils.mergeObject(updates.actor, { [`system.spells.${slot}.value`]: newValue });
          } else {
            const err = new ConsumptionError(_loc("DND5E.SpellCastNoSlots", {
              name: this.item.name, level: slotData.label
            }));
            errors.push(err);
          }
        }
      }

      // Ensure concentration can be handled
      if ( config.concentration?.begin ) {
        const { effects } = this.actor.concentration;
        // Ensure existing concentration effect exists when replacing concentration
        if ( config.concentration.end ) {
          const replacedEffect = effects.find(i => i.id === config.concentration.end);
          if ( !replacedEffect ) errors.push(
            new ConsumptionError(_loc("DND5E.CONCENTRATION.Warning.MissingItem"))
          );
        }

        // Cannot begin more concentrations than the limit
        else if ( effects.size >= this.actor.system.attributes?.concentration?.limit ) errors.push(
          new ConsumptionError(_loc("DND5E.CONCENTRATION.Limit.Reached"))
        );
      }

      if ( !returnErrors ) errors.forEach(err => ui.notifications.error(err.message, { console: false }));
      return errors.length ? returnErrors ? errors : false : updates;
    }
export function nativeMergeUpdates(updates) {
      if ( foundry.utils.isEmpty(updates.activity) ) return;
      const itemIndex = updates.item.findIndex(i => i._id === this.item.id);
      const keyPath = `system.activities.${this.id}`;
      const activityUpdates = foundry.utils.expandObject(updates.activity);
      if ( itemIndex === -1 ) updates.item.push({ _id: this.item.id, [keyPath]: activityUpdates });
      else updates.item[itemIndex][keyPath] = activityUpdates;
    }
export async function nativeConsumeActivityUses(config, updates) {
    const result = await this._usesConsumption(config, {
      uses: this.activity.uses,
      type: _loc("DND5E.CONSUMPTION.Type.ActivityUses.Warning", {
        activity: this.activity.name, item: this.item.name
      }),
      rolls: updates.rolls,
      delta: { item: this.item.id, keyPath: `system.activities.${this.activity.id}.uses.spent` }
    });
    if ( result ) foundry.utils.mergeObject(updates.activity, { "uses.spent": result.spent });
  }
export async function nativeUsesConsumption(config, { uses, type, rolls, delta }) {
    const cost = (await this.resolveCost({ config, delta, rolls })).total;

    let warningMessage;
    if ( cost > 0 && !uses.value ) warningMessage = "DND5E.CONSUMPTION.Warning.None";
    else if ( cost > uses.value ) warningMessage = "DND5E.CONSUMPTION.Warning.NotEnough";
    if ( warningMessage ) throw new ConsumptionError(
      _loc(warningMessage, { type, cost: formatNumber(cost), available: formatNumber(uses.value) })
    );

    return { spent: uses.spent + cost };
  }

// module/data/shared/uses-field.mjs
export async function nativeRecoverUses(periods, rollData={}) {
    if ( foundry.utils.getType(periods) === "Array" ) {
      foundry.utils.logCompatibilityWarning(
        "The periods parameter of `recoverUses` is now a mapping of periods to times triggered.",
        { since: "DnD5e 6.0", until: "DnD5e 6.2" }
      );
      periods = new Map(periods.map(p => [p, 1]));
    }

    if ( !this.uses?.recovery.length ) return false;

    // Search the recovery profiles in order to find the first matching period,
    // and then find the first profile that uses that recovery period
    let count;
    let profile;
    findPeriod: {
      for ( const [period, periodCount] of periods.entries() ) {
        if ( periodCount < 1 ) continue;
        for ( const recovery of this.uses.recovery ) {
          if ( recovery.period === period ) {
            count = periodCount;
            profile = recovery;
            break findPeriod;
          }
        }
      }
    }
    if ( !profile ) return false;

    const updates = {};
    const rolls = [];
    const item = this.item ?? this.parent;

    if ( profile.type === "recoverAll" ) {
      if ( this.uses.spent !== 0 ) updates.spent = 0;
    } else if ( profile.type === "loseAll" ) {
      if ( this.uses.spent !== this.uses.max ) updates.spent = this.uses.max;
    } else if ( profile.formula ) {
      let roll;
      let total;
      try {
        const delta = this.parent instanceof Item
          ? { item: this.parent.id, itemUuid: this.parent.uuid, keyPath: "system.uses.spent" }
          : { item: this.item.id, itemUuid: this.item.uuid, keyPath: `system.activities.${this.id}.uses.spent` };
        roll = new CONFIG.Dice.BasicRoll(profile.formula, rollData, { delta });
        if ( count > 1 ) {
          const minRoll = await roll.clone().evaluate({ minimize: true });
          roll.alter(Math.min(count, Math.ceil(this.uses.max / (minRoll.total || 1))), 0, { multiplyNumeric: true });
        }
        total = (await roll.evaluate()).total;
      } catch (err) {
        Hooks.onError("UsesField#recoverUses", err, {
          msg: _loc("DND5E.ItemRecoveryFormulaWarning", {
            name: item.name, formula: profile.formula, uuid: this.uuid ?? item.uuid
          }),
          log: "error",
          notify: "error"
        });
        return false;
      }

      const newSpent = Math.clamp(this.uses.spent - total, 0, this.uses.max);
      if ( newSpent !== this.uses.spent ) {
        updates.spent = newSpent;
        if ( !roll.isDeterministic ) rolls.push(roll);
      }
    }

    return foundry.utils.isEmpty(updates) ? false : { updates, rolls };
  }




// MM recharge and attack configuration fixtures.
export async function nativeRollRecharge(config={}, dialog={}, message={}) {
    const uses = this.system ? this.system.uses : this.uses;
    const recharge = uses?.recovery.find(({ period }) => period === "recharge");
    if ( !recharge || !uses?.spent ) return;

    const rollConfig = foundry.utils.mergeObject({
      rolls: [{
        parts: ["1d6"],
        data: this.getRollData(),
        options: {
          delta: this instanceof Item ? { item: this.id, keyPath: "system.uses.spent" }
            : { item: this.item.id, keyPath: `system.activities.${this.id}.uses.spent` },
          target: parseInt(recharge.formula)
        }
      }]
    }, config);
    rollConfig.hookNames = [...(config.hookNames ?? []), "recharge"];
    rollConfig.subject = this;

    const dialogConfig = foundry.utils.mergeObject({ configure: false }, dialog);

    const sources = this instanceof Item ? {
      item: {
        compendiumSource: this._stats?.compendiumSource, id: this.id, img: this.img, name: this.name, type: this.type,
        uuid: this.uuid
      }
    } : this.messageSources;
    const messageConfig = foundry.utils.mergeObject({
      create: true,
      data: {
        speaker: ChatMessage.getSpeaker({ actor: this.actor, token: this.actor.token }),
        system: sources,
        type: "recharge"
      },
      rollMode: CONFIG.Dice.BasicRoll.getMessageMode()
    }, message);

    const rolls = await CONFIG.Dice.BasicRoll.buildConfigure(rollConfig, dialogConfig, messageConfig);
    await CONFIG.Dice.BasicRoll.buildEvaluate(rolls, rollConfig, messageConfig);
    if ( !rolls.length ) return;
    messageConfig.data.flavor = _loc("DND5E.ItemRechargeCheck", {
      name: this.name,
      result: _loc(`DND5E.ItemRecharge${rolls[0].isSuccess ? "Success" : "Failure"}`)
    });
    await CONFIG.Dice.BasicRoll.buildPost(rolls, rollConfig, messageConfig);

    const updates = {};
    if ( rolls[0].isSuccess ) {
      if ( this instanceof Item ) updates["system.uses.spent"] = 0;
      else updates["uses.spent"] = 0;
    }

    /**
     * A hook event that fires after an Item or Activity has rolled to recharge, but before any usage changes have
     * been made.
     * @function dnd5e.rollRecharge
     * @memberof hookEvents
     * @param {BasicRoll[]} rolls             The resulting rolls.
     * @param {object} data
     * @param {Item5e|Activity} data.subject  Item or Activity for which the roll was performed.
     * @param {object} data.updates           Updates to be applied to the subject.
     * @returns {boolean}                     Explicitly return `false` to prevent updates from being performed.
     */
    if ( Hooks.call("dnd5e.rollRecharge", rolls, { subject: this, updates }) === false ) return rolls;
    if ( Hooks.call("dnd5e.rollRechargeV2", rolls, { subject: this, updates }) === false ) return rolls;

    if ( (rollConfig.apply !== false) && !foundry.utils.isEmpty(updates) ) await this.update(updates);

    /**
     * A hook event that fires after an Item or Activity has rolled recharge and usage updates have been performed.
     * @function dnd5e.postRollRecharge
     * @memberof hookEvents
     * @param {BasicRoll[]} rolls     The resulting rolls.
     * @param {object} data
     * @param {Actor5e} data.subject  Item or Activity for which the roll was performed.
     */
    Hooks.callAll("dnd5e.postRollRecharge", rolls, { subject: this });

    return { rolls, updates };
  }
export function nativeFormulaMultiply(value, delta, model, change) {
    if ( !value ) return value;
    if ( new Roll(value).terms.length > 1 ) value = `(${value})`;
    if ( new Roll(delta).terms.length > 1 ) delta = `(${delta})`;
    return `${value} * ${delta}`;
  }

export function nativeConfigureD20Modifiers() {
    if ( !this.validD20Roll ) return;

    if ( this.options.advantageMode === undefined ) {
      const { advantage, disadvantage } = this.options;
      if ( advantage && !disadvantage ) this.options.advantageMode = this.constructor.ADV_MODE.ADVANTAGE;
      else if ( !advantage && disadvantage ) this.options.advantageMode = this.constructor.ADV_MODE.DISADVANTAGE;
      else this.options.advantageMode = this.constructor.ADV_MODE.NORMAL;
    }

    // Determine minimum, taking reliable talent into account
    let minimum = this.options.minimum;
    if ( this.options.reliableTalent ) minimum = Math.max(minimum ?? -Infinity, 10);

    // Directly modify the d20
    this.d20.applyFlag("elvenAccuracy", this.options.elvenAccuracy === true);
    this.d20.applyFlag("halflingLucky", this.options.halflingLucky === true);
    this.d20.applyAdvantage(this.options.advantageMode);
    this.d20.applyRange({ minimum, maximum: this.options.maximum });

    // Assign critical and fumble thresholds
    if ( this.options.criticalSuccess ) this.d20.options.criticalSuccess = this.options.criticalSuccess;
    if ( this.options.criticalFailure ) this.d20.options.criticalFailure = this.options.criticalFailure;
    if ( this.options.target ) this.d20.options.target = this.options.target;

    // Re-compile the underlying formula
    this.resetFormula();

    // Mark configuration as complete
    this.options.configured = true;
  }
let Proficiency, AttributesFields, MovementField, SensesField;
export function setNPCContext(context) { ({Proficiency, AttributesFields, MovementField, SensesField} = context); }

export function nativeNPCBaseData() {
    // Determine hit dice denomination & max from hit points formula
    const [, max, denomination] = this.attributes.hp.formula?.match(/(\d*)d(\d+)/i) ?? [];
    this.attributes.hd.max = Number(max ?? 0);
    this.attributes.hd.denomination = Number(denomination ?? CONFIG.DND5E.actorSizes[this.traits.size]?.hitDie ?? 4);

    for ( const item of this.parent.items ) {
      // Class levels & hit dice
      if ( item.type === "class" ) {
        const classLevels = parseInt(item.system.levels) ?? 1;
        this.details.level += classLevels;
        this.attributes.hd.max += classLevels;
      }
    }

    const lairAdjustment = Number(this.resources.lair.value && this.resources.lair.inside);

    // Kill Experience
    this.details.xp ??= {};
    this.details.xp.value = this.parent.getCRExp(this.details.cr === null ? null : this.details.cr + lairAdjustment);

    // Legendary Resistances/Actions
    this.resources.legact.lr = true;
    this.resources.legres.lr = true;
    if ( this.resources.legact.max ) this.resources.legact.max += lairAdjustment;
    if ( this.resources.legres.max ) this.resources.legres.max += lairAdjustment;

    // Proficiency
    if ( this.details.cr === null ) this.attributes.prof = null;
    else this.attributes.prof = Proficiency.calculateMod(Math.max(this.details.cr, this.details.level, 1));

    // Spellcaster Level
    if ( this.attributes.spellcasting && !Number.isNumeric(this.attributes.spell.level) ) {
      this.attributes.spell.level = Math.max(this.details.cr, 1);
    }

    AttributesFields.prepareBaseArmorClass.call(this);
    AttributesFields.prepareBaseEncumbrance.call(this);
    MovementField._shim(this.attributes.movement);
    SensesField._shim(this.attributes.senses);
    this.shimBonusData();
  }
export async function nativeCombatRecovery(types) {
    for ( const combatant of this.combatants ) {
      if ( combatant.isDefeated ) continue;
      const periods = Object.entries(types).filter(([, v]) => (v === true) || (v === combatant)).map(([k]) => k);
      if ( periods.length ) await combatant.recoverCombatUses(periods);
    }
  }
export async function nativeNPCCombatRecovery(periods, results) {
    // Reset legendary actions at the start of a combat encounter or at the end of the creature's turn
    if ( this.resources.legact.max && (periods.includes("encounter") || periods.includes("turnEnd")) ) {
      results.actor["system.resources.legact.spent"] = 0;
    }
  }
export async function nativeNPCResistSave(message) {
    if ( this.resources.legres.value === 0 ) throw new Error("No legendary resistances remaining.");
    if ( message.type !== "save" ) throw new Error("Chat message must contain a save roll.");
    if ( message.system.resisted ) throw new Error("Save has already been resisted.");
    const actorUpdate = { "system.resources.legres.spent": this.resources.legres.spent + 1 };
    const messageUpdate = { _id: message.id, "system.resisted": true };

    // Legendary resistance turns the failed save into a success: revert this save's failure and credit a success
    // (which may stabilize the creature at three).
    if ( message.system.type === "death" ) {
      const priorFailure = message.system.deltas?.actor
        ?.find(d => d.keyPath === "system.attributes.death.failure")?.delta ?? 0;
      const failure = this.attributes.death.failure - priorFailure;
      const { outcome, updates } = AttributesFields.applyDeathSaveResult({
        failure, success: this.attributes.death.success
      }, { isSuccess: true });
      updates["system.attributes.death.failure"] ??= failure;
      Object.assign(actorUpdate, updates);
      messageUpdate["system.deltas"] = _replace(ActorDeltasField.getDeltas(this.parent, { actor: updates, item: [] }));
      messageUpdate["system.outcome"] = outcome;
    }

    await this.parent.performBulkUpdate({
      actor: actorUpdate,
      operations: [{ action: "update", documentName: "ChatMessage", updates: [messageUpdate] }]
    });
  }
export function nativeSaveForceSuccess() {
    return this.resisted;
  }

// module/data/activity/fields/consumption-targets-field.mjs; unchanged pinned method body.
export async function nativeConsumeHitDice(config, updates) {
    const cost = (await this.resolveCost({ config, rolls: updates.rolls })).total;

    const denom = !["smallest", "largest"].includes(this.target) ? this.target : false;
    const validClasses = Object.values(this.actor.classes).filter(cls => {
      return !denom || (cls.system.hd.denomination === denom);
    });
    const total = validClasses.reduce((count, cls) => count + cls.system.hd.value, 0);

    if ( !denom ) validClasses.sort((lhs, rhs) => {
      const sort = lhs.system.hd.denomination.localeCompare(rhs.system.hd.denomination, "en", { numeric: true });
      return (this.target === "smallest") ? sort : sort * -1;
    });

    let warningMessage;
    if ( !validClasses.length ) warningMessage = "DND5E.CONSUMPTION.Warning.MissingHitDice";
    else if ( (cost > 0) && !total ) warningMessage = "DND5E.CONSUMPTION.Warning.None";
    else if ( total < cost ) warningMessage = "DND5E.CONSUMPTION.Warning.NotEnough";
    if ( warningMessage ) {
      const denomination = !["smallest", "largest"].includes(this.target) ? this.target : "";
      throw new ConsumptionError(_loc(warningMessage, {
        available: formatNumber(total), cost: formatNumber(cost), denomination,
        type: _loc("DND5E.CONSUMPTION.Type.HitDice.Warning", { denomination })
      }));
    }

    let toConsume = cost;
    for ( const cls of validClasses ) {
      const available = toConsume > 0 ? cls.system.hd.value : toConsume < 0 ? -cls.system.hd.spent : 0;
      const delta = toConsume > 0 ? Math.min(toConsume, available) : Math.max(toConsume, available);
      const itemUpdate = { "system.hd.spent": cls.system.hd.spent + delta };
      if ( delta !== 0 ) {
        const itemIndex = updates.item.findIndex(i => i._id === cls.id);
        if ( itemIndex === -1 ) updates.item.push({ _id: cls.id, ...itemUpdate });
        else foundry.utils.mergeObject(updates.item[itemIndex], itemUpdate);
        toConsume -= delta;
        if ( toConsume === 0 ) break;
      }
    }
  }

// module/documents/activity/heal.mjs; unchanged pinned method bodies.
export function nativeHealingActivity(Parent) { return class extends Parent {
  async rollDamage(config={}, dialog={}, message={}) {
    const messageConfig = foundry.utils.mergeObject({
      "data.type": "healing"
    }, message);
    return super.rollDamage(config, dialog, messageConfig);
  }
  async _triggerSubsequentActions(config, results) {
    this.rollDamage({ event: config.event }, {}, { data: { system: { origin: results.message?.id } } });
  }
}; }

// module/applications/advancement/advancement-manager.mjs; unchanged pinned method body.
export function nativeAdvancementLevelSteps(classItem, levelDelta) {
    const raceItem = this.clone.system?.details?.race instanceof Item ? this.clone.system.details.race : null;
    const pushSteps = (flows, data) => this.steps.push(...flows.map(flow => ({ flow, ...data })));
    const getItemFlows = (characterLevel, classLevel) => this.clone.items.contents.flatMap(i => {
      if ( ["class", "subclass", "race"].includes(i.type) ) return [];
      if ( ["class", "subclass"].includes(i.system.advancementRootItem?.type) && i.system.advancementClassLinked ) {
        const rootClass = i.system.advancementRootItem.class ?? i.system.advancementRootItem;
        if ( rootClass !== classItem ) return [];
        return this.constructor.flowsForLevel(i, classLevel);
      }
      return this.constructor.flowsForLevel(i, characterLevel);
    });

    // Level increased
    for ( let offset = 1; offset <= levelDelta; offset++ ) {
      const classLevel = classItem.system.levels + offset;
      const characterLevel = (this.actor.system.details.level ?? 0) + offset;
      const stepData = {
        type: "forward", class: { item: classItem, level: classLevel }, level: characterLevel
      };
      pushSteps(this.constructor.flowsForLevel(raceItem, characterLevel), stepData);
      pushSteps(this.constructor.flowsForLevel(classItem, classLevel), stepData);
      pushSteps(this.constructor.flowsForLevel(classItem.subclass, classLevel), stepData);
      pushSteps(getItemFlows(characterLevel, classLevel), stepData);
    }

    // Level decreased
    for ( let offset = 0; offset > levelDelta; offset-- ) {
      const classLevel = classItem.system.levels + offset;
      const characterLevel = (this.actor.system.details.level ?? 0) + offset;
      const stepData = {
        type: "reverse", class: {item: classItem, level: classLevel}, automatic: true, level: characterLevel
      };
      pushSteps(getItemFlows(characterLevel, classLevel).reverse(), stepData);
      pushSteps(this.constructor.flowsForLevel(classItem.subclass, classLevel).reverse(), stepData);
      pushSteps(this.constructor.flowsForLevel(classItem, classLevel).reverse(), stepData);
      pushSteps(this.constructor.flowsForLevel(raceItem, characterLevel).reverse(), stepData);
      if ( classLevel === 1 ) this.steps.push({ type: "delete", item: classItem, automatic: true });
    }

    // Ensure the class level ends up at the appropriate point
    this.steps.push({
      type: "forward", automatic: true,
      class: { item: classItem, level: classItem.system.levels += levelDelta },
      level: (this.actor.system.details.level ?? 0) + levelDelta
    });

    return this;
  }

// module/documents/advancement/item-choice.mjs; unchanged pinned method body.
export function nativeItemChoiceCounts(level) {
    const current = Object.keys(this.value.added[level] ?? {}).length;
    const replacement = !!this.configuration.choices[level]?.replacement && !!this.value.replaced[level];
    const max = (this.configuration.choices[level]?.count ?? 0) + (replacement ? 1 : 0);
    return {
      current, max, replacement,
      full: current >= max
    };
  }

// module/data/item/feat.mjs; unchanged pinned getter body.
export function nativeFeatClassLinked() {
    return this.type.value !== "feat";
  }
