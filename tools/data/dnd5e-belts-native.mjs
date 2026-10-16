/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Source: foundryvtt/dnd5e 87e94dbd9f930135e0694cd7e7d49f210603cd2c.
Exact method bodies; localization/formatting and host services are supplied by tests.
*/
// Exact HealActivity.rollDamage from foundryvtt/dnd5e 87e94dbd9f930135e0694cd7e7d49f210603cd2c, module/documents/activity/heal.mjs.
// The superclass is supplied by tests.
export function nativeBeltHeal(Base){return class extends Base{
  async rollDamage(config={}, dialog={}, message={}) {
    const messageConfig = foundry.utils.mergeObject({
      "data.type": "healing"
    }, message);
    return super.rollDamage(config, dialog, messageConfig);
  }

};}
// Exact ActivitiesTemplate.recoverUses from the same revision, module/data/item/templates/activities.mjs. Host UsesField is supplied by tests.
export async function nativeBeltRecovery(periods, rollData) {
    if ( foundry.utils.getType(periods) === "Array" ) {
      foundry.utils.logCompatibilityWarning(
        "The periods parameter of `recoverUses` is now a mapping of periods to times triggered.",
        { since: "DnD5e 6.0", until: "DnD5e 6.2" }
      );
      periods = new Map(periods.map(p => [p, 1]));
    }

    const updates = {};
    const rolls = [];
    const autoRecharge = game.settings.get("dnd5e", "autoRecharge");
    const shouldRecharge = periods.has("turnStart") && this.parent.actor.system.isNPC && (autoRecharge !== "no");
    const recharge = async doc => {
      const config = { apply: false };
      const message = { create: autoRecharge !== "silent" };
      // TODO: Roll multiple times if multiple `turnStarts` are present
      const result = await UsesField.rollRecharge.call(doc, config, {}, message);
      if ( result ) {
        if ( doc instanceof Item ) foundry.utils.mergeObject(updates, result.updates);
        else foundry.utils.mergeObject(updates, { [`system.activities.${doc.id}`]: result.updates });
        rolls.push(...result.rolls);
      }
    };

    if ( !rollData && this.uses.recovery.some(u => u.type === "formula") ) rollData = this.parent.getRollData();

    const result = await UsesField.recoverUses.call(this, periods, rollData);
    if ( result ) {
      foundry.utils.mergeObject(updates, { "system.uses": result.updates });
      rolls.push(...result.rolls);
    }
    if ( shouldRecharge ) await recharge(this.parent);

    const destroy = this.uses.autoDestroy && this.uses.recovery.some(r => r.type === "loseAll")
      && (updates.system?.uses?.spent >= this.uses.max);

    for ( const activity of this.activities ) {
      if ( activity.dependentOrigin?.active === false ) continue;
      if ( !rollData && activity.uses?.recovery.some(u => u.type === "formula") ) rollData = this.parent.getRollData();
      const result = await UsesField.recoverUses.call(activity, periods, rollData);
      if ( result ) {
        foundry.utils.mergeObject(updates, { [`system.activities.${activity.id}.uses`]: result.updates });
        rolls.push(...result.rolls);
      }
      if ( shouldRecharge ) await recharge(activity);
    }

    return { updates, rolls, destroy };
  }

// Exact Combat5e._onStartTurn from the same revision, module/documents/combat.mjs. The superclass is supplied by tests.
export function nativeBeltCombat(Base){return class extends Base{
  async _onStartTurn(combatant) {
    await super._onStartTurn(combatant);
    this._recoverUses({ turn: true, turnStart: combatant });
  }

};}
