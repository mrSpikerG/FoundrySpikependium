/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Source: foundryvtt/dnd5e 87e94dbd9f930135e0694cd7e7d49f210603cd2c.
Exact bodies; localization, labels and fall-prone host are supplied by tests.
*/
import {ConsumptionError} from "./dnd5e-monsters-native.mjs";
const _loc = key => key;
const formatNumber = n => String(n);
const getHumanReadableAttributeLabel = value => value;
const applyFallProne = async actor => {};
// module/data/activity/fields/consumption-targets-field.mjs
export async function nativeConsumeSpellSlots(config, updates) {
    const levelNumber = Math.clamp(
      this.resolveLevel({ config, rolls: updates.rolls }), 1, Object.keys(CONFIG.DND5E.spellLevels).length - 1
    );
    const keyPath = `system.spells.spell${levelNumber}.value`;
    const cost = (await this.resolveCost({ config, delta: { keyPath }, rolls: updates.rolls })).total;

    // Check to see if enough slots are available at the specified level
    const levelData = this.actor.system.spells?.[`spell${levelNumber}`];
    const newValue = (levelData?.value ?? 0) - cost;
    let warningMessage;
    if ( !levelData?.max ) warningMessage = "DND5E.CONSUMPTION.Warning.MissingSpellSlot";
    else if ( (cost > 0) && !levelData.value ) warningMessage = "DND5E.CONSUMPTION.Warning.None";
    else if ( newValue < 0 ) warningMessage = "DND5E.CONSUMPTION.Warning.NotEnough";
    if ( warningMessage ) {
      const level = CONFIG.DND5E.spellLevels[levelNumber];
      const type = _loc("DND5E.CONSUMPTION.Type.SpellSlots.Warning", { level });
      throw new ConsumptionError(_loc(warningMessage, {
        type, level, cost: formatNumber(cost), available: formatNumber(levelData.value)
      }));
    }

    updates.actor[keyPath] = Math.max(0, newValue);
  }
// module/data/activity/fields/consumption-targets-field.mjs
export async function nativeConsumeAttribute(config, updates) {
    const keyPath = `system.${this.target}`;
    const cost = (await this.resolveCost({ config, delta: { keyPath }, rolls: updates.rolls })).total;

    const attribute = getHumanReadableAttributeLabel(this.target, { actor: this.actor });
    if ( !foundry.utils.hasProperty(this.actor, keyPath) ) throw new ConsumptionError(
      _loc("DND5E.CONSUMPTION.Warning.MissingAttribute", {
        activity: this.activity.name, attribute, item: this.item.name
      })
    );
    let current = foundry.utils.getProperty(this.actor, keyPath);

    let warningMessage;
    if ( (cost > 0) && !current ) warningMessage = "DND5E.CONSUMPTION.Warning.None";
    else if ( current < cost ) warningMessage = "DND5E.CONSUMPTION.Warning.NotEnough";
    if ( warningMessage ) throw new ConsumptionError(_loc(warningMessage, {
      available: formatNumber(current), cost: formatNumber(cost),
      type: _loc("DND5E.CONSUMPTION.Type.Attribute.Warning", { attribute })
    }));

    const adjustedKeyPath = keyPath.replace(/\.value$/, ".spent");
    const isSpent = (keyPath !== adjustedKeyPath) && !foundry.utils.hasProperty(this.actor._source, keyPath)
      && foundry.utils.hasProperty(this.actor._source, adjustedKeyPath);
    if ( isSpent ) {
      current = foundry.utils.getProperty(this.actor, adjustedKeyPath);
      updates.actor[adjustedKeyPath] = current + cost;
    } else updates.actor[keyPath] = current - cost;
  }
// module/data/actor/templates/attributes.mjs
export async function nativePreUpdateHP(changes, options, user) {
    const isDead = this.attributes.hp.value <= 0;
    if ( isDead && (foundry.utils.getProperty(changes, "system.attributes.hp.value") > 0) ) {
      foundry.utils.setProperty(changes, "system.attributes.death.success", 0);
      foundry.utils.setProperty(changes, "system.attributes.death.failure", 0);
    }
    foundry.utils.setProperty(options, "dnd5e.hp", { ...this.attributes.hp });
  }
// module/data/actor/templates/attributes.mjs
export async function nativeOnUpdateHP(changed, options, userId) {
    if ( !changed.system?.attributes?.hp ) return;
    if ( userId === game.userId ) {
      await this.parent.updateBloodied(options);
      await this.parent.updateDowned(options);
      await applyFallProne(this.parent, options);
    }

    const hp = options.dnd5e?.hp;
    if ( !hp || options.isRest || options.isAdvancement ) return;

    const curr = this.attributes.hp;
    const changes = {
      hp: curr.value - hp.value,
      temp: curr.temp - hp.temp
    };
    changes.total = changes.hp + changes.temp;
    if ( !Number.isInteger(changes.total) || (changes.total === 0) ) return;

    this.parent._displayTokenEffect(changes);
    if ( !game.settings.get("dnd5e", "disableConcentration") && (userId === game.userId)
      && (options.dnd5e?.concentrationCheck !== false)
      && (changes.total < 0) && ((changes.temp < 0) || (curr.value < curr.effectiveMax)) ) {
      this.parent.challengeConcentration({ dc: this.parent.getConcentrationDC(-changes.total) });
    }

    /**
     * A hook event that fires when an actor is damaged or healed by any means. The actual name
     * of the hook will depend on the change in hit points.
     * @function dnd5e.damageActor
     * @memberof hookEvents
     * @param {Actor5e} actor                                       The actor that had their hit points reduced.
     * @param {{hp: number, temp: number, total: number}} changes   The changes to hit points.
     * @param {object} update                                       The original update delta.
     * @param {string} userId                                       Id of the user that performed the update.
     */
    Hooks.callAll(`dnd5e.${changes.total > 0 ? "heal" : "damage"}Actor`, this.parent, changes, changed, userId);
  }
