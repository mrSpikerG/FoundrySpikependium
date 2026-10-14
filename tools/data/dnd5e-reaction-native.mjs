/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/
// https://github.com/foundryvtt/dnd5e/blob/87e94dbd9f930135e0694cd7e7d49f210603cd2c/module/documents/activity/mixin.mjs
// https://github.com/foundryvtt/dnd5e/blob/87e94dbd9f930135e0694cd7e7d49f210603cd2c/module/data/chat-message/fields/deltas-field.mjs
// https://github.com/foundryvtt/dnd5e/blob/87e94dbd9f930135e0694cd7e7d49f210603cd2c/module/dice/basic-roll.mjs
// https://github.com/foundryvtt/dnd5e/blob/87e94dbd9f930135e0694cd7e7d49f210603cd2c/module/applications/dice/d20-configuration-dialog.mjs
// Only the private Core update call is injected as applyUpdates.
export async function nativeBuildEvaluate(rolls, config={}, message={}) {
    if ( config.evaluate !== false ) {
      for ( const roll of rolls ) await roll.evaluate();
    }
  }
export function nativeSaveRollFailure() {
    if ( !this._evaluated ) return;
    if ( !Number.isNumeric(this.options.target) ) return false;
    return this.total < this.options.target;
  }
export function nativeD20FinalizeConfig(config, action) {
    let advantageMode = CONFIG.Dice.D20Roll.ADV_MODE.NORMAL;
    if ( action === "advantage" ) advantageMode = CONFIG.Dice.D20Roll.ADV_MODE.ADVANTAGE;
    else if ( action === "disadvantage" ) advantageMode = CONFIG.Dice.D20Roll.ADV_MODE.DISADVANTAGE;
    for ( const roll of config.rolls ?? [] ) {
      roll.options ??= {};
      roll.options.advantageMode = advantageMode;
    }
  }
export function getDeltas(dataModel, updates) {
    updates = foundry.utils.flattenObject(updates);
    const deltas = [];
    for ( const [keyPath, value] of Object.entries(updates) ) {
      let currentValue;
      if ( keyPath.startsWith("system.activities") ) {
        const [id, ...kp] = keyPath.slice(18).split(".");
        currentValue = foundry.utils.getProperty(dataModel.system.activities?.get(id) ?? {}, kp.join("."));
      }
      else currentValue = foundry.utils.getProperty(dataModel, keyPath);

      const delta = value - currentValue;
      if ( delta && !Number.isNaN(delta) ) deltas.push({ keyPath, delta });
    }
    return deltas;
  }
export async function nativeConsume(usageConfig, messageConfig, applyUpdates) {
      /**
       * A hook event that fires before an item's resource consumption is calculated.
       * @function dnd5e.preActivityConsumption
       * @memberof hookEvents
       * @param {Activity} activity                           Activity being activated.
       * @param {ActivityUseConfiguration} usageConfig        Configuration data for the activation.
       * @param {ActivityMessageConfiguration} messageConfig  Configuration info for the created chat message.
       * @returns {boolean}  Explicitly return `false` to prevent activity from being activated.
       */
      if ( Hooks.call("dnd5e.preActivityConsumption", this, usageConfig, messageConfig) === false ) return false;

      const updates = await this._prepareUsageUpdates(usageConfig);
      if ( !updates ) return false;

      /**
       * A hook event that fires after an item's resource consumption is calculated, but before any updates are
       * performed.
       * @function dnd5e.activityConsumption
       * @memberof hookEvents
       * @param {Activity} activity                           Activity being activated.
       * @param {ActivityUseConfiguration} usageConfig        Configuration data for the activation.
       * @param {ActivityMessageConfiguration} messageConfig  Configuration info for the created chat message.
       * @param {ActivityUsageUpdates} updates                Updates to apply to the actor and other documents.
       * @returns {boolean}  Explicitly return `false` to prevent activity from being activated.
       */
      if ( Hooks.call("dnd5e.activityConsumption", this, usageConfig, messageConfig, updates) === false ) return false;

      const consumed = await applyUpdates(updates);
      if ( !foundry.utils.isEmpty(consumed) ) {
        foundry.utils.setProperty(messageConfig, "data.system.deltas", consumed);
      }
      if ( usageConfig.cause?.activity ) {
        foundry.utils.setProperty(messageConfig, "data.system.cause", usageConfig.cause.activity);
      }

      /**
       * A hook event that fires after an item's resource consumption is calculated and applied.
       * @function dnd5e.postActivityConsumption
       * @memberof hookEvents
       * @param {Activity} activity                           Activity being activated.
       * @param {ActivityUseConfiguration} usageConfig        Configuration data for the activation.
       * @param {ActivityMessageConfiguration} messageConfig  Configuration info for the created chat message.
       * @param {ActivityUsageUpdates} updates                Applied updates to the actor and other documents.
       * @returns {boolean}  Explicitly return `false` to prevent activity from being activated.
       */
      if ( Hooks.call("dnd5e.postActivityConsumption", this, usageConfig, messageConfig, updates) === false ) return false;

      return updates;
    }
export async function nativeRefund(consumed, applyUpdates) {
      const updates = {
        activity: {}, actor: {}, create: consumed.deleted ?? [], delete: consumed.created ?? [], item: []
      };
      for ( const { keyPath, delta } of consumed.actor ?? [] ) {
        const value = foundry.utils.getProperty(this.actor, keyPath) - delta;
        if ( !Number.isNaN(value) ) updates.actor[keyPath] = value;
      }
      for ( const [id, changes] of Object.entries(consumed.item ?? {}) ) {
        const item = this.actor.items.get(id);
        if ( !item ) continue;
        const itemUpdate = {};
        for ( const { keyPath, delta } of changes ) {
          let currentValue;
          if ( keyPath.startsWith("system.activities") ) {
            const [id, ...kp] = keyPath.slice(18).split(".");
            currentValue = foundry.utils.getProperty(item.system.activities?.get(id) ?? {}, kp.join("."));
          } else currentValue = foundry.utils.getProperty(item, keyPath);
          const value = currentValue - delta;
          if ( !Number.isNaN(value) ) itemUpdate[keyPath] = value;
        }
        if ( !foundry.utils.isEmpty(itemUpdate) ) {
          itemUpdate._id = id;
          updates.item.push(itemUpdate);
        }
      }
      await applyUpdates(updates);
    }
export function nativeEffectChanges(effect, { chatMessage, target }={}) {
      const changes = {};
      if ( !effect.duration.expiry ) {
        if ( !Number.isFinite(effect.duration.value) ) {
          const duration = this.duration?.getEffectData();
          if ( !foundry.utils.isEmpty(duration) ) changes.duration = duration;
        } else if ( effect.duration.units !== "turns" ) {
          changes.duration = { expiry: "turnStart" };
        }
      }
      return changes;
    }
