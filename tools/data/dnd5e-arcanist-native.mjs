/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Source: foundryvtt/dnd5e 87e94dbd9f930135e0694cd7e7d49f210603cd2c.
Exact method bodies; localization/formatting and host services are supplied by tests.
*/
// Exact methods from dnd5e 87e94dbd9f930135e0694cd7e7d49f210603cd2c. Host document operations are injected by tests.
export async function nativeArcanistUse(usage={}, dialog={}, message={}) {
      if ( !this.item.isEmbedded ) return;
      if ( !this.item.isOwner ) {
        ui.notifications.error("DND5E.DocumentUseWarn", { localize: true });
        return;
      }
      if ( !this.canUse ) {
        ui.notifications.error("DND5E.ACTIVITY.Warning.UsageNotAllowed", { localize: true });
        return;
      }

      // Create an item clone to work with throughout the rest of the process
      let item = this.item.clone({}, { keepId: true });
      let activity = item.system.activities.get(this.id);

      const usageConfig = activity._prepareUsageConfig(usage);

      const dialogConfig = foundry.utils.mergeObject({
        configure: true,
        applicationClass: this.metadata.usage.dialog
      }, dialog);

      const messageConfig = foundry.utils.mergeObject({
        create: true,
        data: {
          system: { targets: TargetsField.getDescriptors() }
        },
        hasConsumption: usageConfig.hasConsumption
      }, message);

      /**
       * A hook event that fires before an activity usage is configured.
       * @function dnd5e.preUseActivity
       * @memberof hookEvents
       * @param {Activity} activity                           Activity being used.
       * @param {ActivityUseConfiguration} usageConfig        Configuration info for the activation.
       * @param {ActivityDialogConfiguration} dialogConfig    Configuration info for the usage dialog.
       * @param {ActivityMessageConfiguration} messageConfig  Configuration info for the created chat message.
       * @returns {boolean}  Explicitly return `false` to prevent activity from being used.
       */
      if ( Hooks.call("dnd5e.preUseActivity", activity, usageConfig, dialogConfig, messageConfig) === false ) return;

      // Display configuration window if necessary
      if ( dialogConfig.configure && activity._requiresConfigurationDialog(usageConfig) ) {
        try {
          await dialogConfig.applicationClass.create(activity, usageConfig, dialogConfig.options);
        } catch {
          return;
        }
      }

      // Handle scaling
      await activity._prepareUsageScaling(usageConfig, messageConfig, item);
      activity = item.system.activities.get(this.id);

      // Handle consumption
      const updates = await activity.consume(usageConfig, messageConfig);
      if ( updates === false ) return;
      const results = { effects: [], templates: [], updates };

      // Create concentration effect & end previous effects
      if ( usageConfig.concentration?.begin ) {
        const effect = await item.actor.beginConcentrating(activity, { "flags.dnd5e.scaling": usageConfig.scaling });
        if ( effect ) {
          results.effects ??= [];
          results.effects.push(effect);
          foundry.utils.setProperty(messageConfig.data, "system.concentration", effect.id);
        }
        if ( usageConfig.concentration?.end ) {
          const deleted = await item.actor.endConcentration(usageConfig.concentration.end);
          results.effects.push(...deleted);
        }
      }

      // Create chat message
      activity._finalizeMessageConfig(usageConfig, messageConfig, results);
      results.message = await activity._createUsageMessage(messageConfig);

      // Perform any final usage steps
      await activity._finalizeUsage(usageConfig, results);

      /**
       * A hook event that fires when an activity is activated.
       * @function dnd5e.postUseActivity
       * @memberof hookEvents
       * @param {Activity} activity                     Activity being activated.
       * @param {ActivityUseConfiguration} usageConfig  Configuration data for the activation.
       * @param {ActivityUsageResults} results          Final details on the activation.
       * @returns {boolean}  Explicitly return `false` to prevent any subsequent actions from being triggered.
       */
      if ( Hooks.call("dnd5e.postUseActivity", activity, usageConfig, results) === false ) return results;

      // Trigger any primary action provided by this activity
      if ( usageConfig.subsequentActions !== false ) {
        const deltas = results.message?.system?.deltas ?? results.message?.data?.system?.deltas;
        const consumed = this.createConsumedFlag(this.actor, deltas);
        if ( consumed ) item.updateSource({ "flags.dnd5e.consumed": consumed });
        activity._triggerSubsequentActions(usageConfig, results);
      }

      return results;
    }

export async function nativeArcanistScalingContext(context, options) {
    context.hasScaling = true;
    context.notes = [];
    if ( !this._shouldDisplay("scaling") ) {
      context.hasScaling = false;
      return context;
    }

    const scale = (context.linkedActivity ?? this.activity).consumption.scaling;
    const rollData = (context.linkedActivity ?? this.activity).getRollData({ deterministic: true });

    if ( this.activity.requiresSpellSlot && context.linkedActivity && (this.config.scaling !== false) ) {
      const max = simplifyBonus(scale.max, rollData);
      const minimumLevel = context.linkedActivity.spell?.level ?? this.item.system.level ?? 1;
      const maximumLevel = scale.allowed ? scale.max ? minimumLevel + max - 1 : Infinity : minimumLevel;
      const spellSlotOptions = Object.entries(CONFIG.DND5E.spellLevels).map(([level, label]) => {
        if ( (Number(level) < minimumLevel) || (Number(level) > maximumLevel) ) return null;
        return { value: `spell${level}`, label };
      }).filter(_ => _);
      context.spellSlots = {
        field: new StringField({ required: true, blank: false, label: _loc("DND5E.SpellCastUpcast") }),
        name: "spell.slot",
        value: this.config.spell?.slot,
        options: spellSlotOptions
      };
    }

    else if ( this.activity.requiresSpellSlot && (this.config.scaling !== false) ) {
      const minimumLevel = this.item.system.level ?? 1;
      const maximumLevel = Object.values(this.actor.system.spells)
        .reduce((max, d) => d.max ? Math.max(max, d.level) : max, 0);
      const spellMethod = CONFIG.DND5E.spellcasting[this.item.system.method];

      const consumeSlot = (this.config.consume === true) || this.config.consume?.spellSlot;
      let spellSlotValue = this.actor.system.spells[this.config.spell?.slot]?.value || !consumeSlot
        ? this.config.spell.slot : null;
      const spellSlotOptions = Object.entries(this.actor.system.spells).map(([value, slot]) => {
        if ( !slot.max || (slot.level < minimumLevel) || (slot.level > maximumLevel) || !slot.type ) return null;
        if ( spellMethod?.exclusive.spells && (this.item.system.method !== slot.type) ) return null;
        const model = CONFIG.DND5E.spellcasting[slot.type];
        if ( model?.exclusive.slots && (this.item.system.method !== slot.type) ) return null;
        const label = _loc(`DND5E.SpellLevel${slot.type.capitalize()}`, {
          level: model?.isSingleLevel ? slot.level : slot.label,
          n: slot.value
        });
        // Set current value if applicable.
        const disabled = (slot.value === 0) && consumeSlot;
        if ( !disabled && !spellSlotValue ) spellSlotValue = value;
        return { value, label, disabled, selected: spellSlotValue === value };
      }).filter(_ => _);

      context.spellSlots = {
        field: new StringField({ required: true, blank: false, label: _loc("DND5E.SpellCastUpcast") }),
        name: "spell.slot",
        value: spellSlotValue,
        options: spellSlotOptions
      };

      if ( !spellSlotOptions.some(o => !o.disabled) ) context.notes.push({
        type: "warn", message: _loc("DND5E.SpellCastNoSlotsLeft", {
          name: this.item.name
        })
      });
    }

    else if ( scale.allowed && (this.config.scaling !== false) ) {
      const max = scale.max ? simplifyBonus(scale.max, rollData) : Infinity;
      if ( max > 1 ) context.scaling = {
        field: new NumberField({ min: 1, max, label: _loc("DND5E.ScalingValue") }),
        name: "scalingValue",
        // Config stores the scaling increase, but scaling value (increase + 1) is easier to understand in the UI
        value: Math.clamp((this.config.scaling ?? 0) + 1, 1, max),
        max,
        showRange: Number.isFinite(max)
      };
      else context.hasScaling = false;
    }

    else {
      context.hasScaling = false;
    }

    return context;
  }

