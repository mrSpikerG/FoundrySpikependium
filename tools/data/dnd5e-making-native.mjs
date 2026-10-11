/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Source: foundryvtt/dnd5e 87e94dbd9f930135e0694cd7e7d49f210603cd2c.
Methods from module/data/activity/attack-data.mjs, module/dice/basic-roll.mjs, module/dice/d20-roll.mjs, module/documents/active-effect.mjs.
Only unused expiry super delegation and damage base delegation are adapted; dependencies are supplied by tests.
*/
let D20RollModificationField;
export function setModificationField(field) { D20RollModificationField = field; }
export function constructParts(parts, data={}) {
    const finalParts = [];
    for ( const [key, value] of Object.entries(parts) ) {
      if ( !value && (value !== 0) ) continue;
      finalParts.push(`@${key}`);
      foundry.utils.setProperty(data, key, value);
    }
    return { parts: finalParts, data };
  }
export function getAttackData({ ability, ammunition, attackMode, situational }={}) {
    const rollData = this.getRollData({ roll: { ability, attackMode } });
    if ( this.attack.flat ) return CONFIG.Dice.BasicRoll.constructParts({ toHit: this.attack.bonus }, rollData);

    const weapon = this.item.system;
    const ammo = this.actor?.items.get(ammunition)?.system;
    const { bonus } = this.actor ? D20RollModificationField.combineFields(this.actor.system, [
      `abilities.${rollData.roll.ability}.attack.roll`,
      "rolls.attack", `rolls.attack.${this.getActionType(attackMode)}`
    ], { rules: { category: "attack", actor: this.actor, item: this.item, rollData } }) : {};
    const { parts, data } = CONFIG.Dice.BasicRoll.constructParts({
      mod: rollData.roll.ability ? rollData.mod : null,
      prof: weapon.prof?.term,
      bonus: this.attack.bonus,
      weaponMagic: weapon.magicAvailable ? weapon.magicalBonus : null,
      ammoMagic: ammo?.magicAvailable ? ammo.magicalBonus : null,
      ruleBonus: bonus,
      situational
    }, rollData);

    // Add exhaustion reduction
    this.actor?.addConditionRollReduction(parts, data);

    return { data, parts };
  }
export function fromConfig(config, process) {
    const formula = [new CONFIG.Dice.D20Die().formula].concat(config.parts ?? []).join(" + ");
    config.options.criticalSuccess ??= CONFIG.Dice.D20Die.CRITICAL_SUCCESS_TOTAL;
    config.options.criticalFailure ??= CONFIG.Dice.D20Die.CRITICAL_FAILURE_TOTAL;
    config.options.halflingLucky ??= process.halflingLucky;
    config.options.reliableTalent ??= process.reliableTalent;
    config.options.target ??= process.target;
    return new this(formula, config.data, config.options);
  }
export function isExpiryEvent(event, context={}) {
    const special = this.specialDuration;
    if ( !special ) return false;

    // Out of combat, any time advancement expires the effect
    if ( (event === "updateWorldTime") && !this.actor?.inCombat ) return true;

    // Skip irrelevant events
    const isStart = special.endsWith("Start");
    if ( event !== (isStart ? "turnStart" : "turnEnd") ) return false;

    // These expiries are only driven by the combat they were created in
    if ( !this.start.combat ) return true;
    const combat = context.combat ?? game.combat;
    if ( combat !== this.start.combat ) return false;

    // Re-derive the expiry-relevant combatant; affected actor for "target" or originating actor for "source"
    // If they have left combat, expire once we are past the creation round
    const origin = special.startsWith("target") ? this.actor : this.getSourceActor();
    const [combatant] = combat.getCombatantsByActor(origin);
    if ( !combatant ) return this.start.round < context.round;

    // Only the origin's own turn edge triggers expiry
    const originTurn = isStart ? (combat.combatant === combatant) : (combat.previous.combatantId === combatant.id);
    if ( !originTurn ) return false;

    // Skip the turn the effect was applied on
    return (this.start.round !== context.round) || (this.start.turn !== context.turn);
  }
export function processDamagePart(damage, rollConfig, rollData, index=0, options={}, baseProcessDamagePart, simplifyBonus) {
    if ( !damage.base ) return baseProcessDamagePart.call(this, damage, rollConfig, rollData, index, options);

    // Swap base damage for versatile if two-handed attack is made on versatile weapon
    if ( this.item.system.isVersatile && (rollConfig.attackMode === "twoHanded") ) {
      const versatile = this.item.system.damage.versatile.clone(this.item.system.damage.versatile);
      versatile.base = true;
      versatile.denomination ||= damage.steppedDenomination();
      versatile.number ||= damage.number;
      versatile.types = damage.types;
      damage = versatile;
    }

    const roll = baseProcessDamagePart.call(this, damage, rollConfig, rollData, index, options);
    roll.base = true;

    if ( this.item.type === "weapon" ) {
      // Ensure `@mod` is present in damage unless it is positive and an off-hand attack or damage is a flat value
      const isDeterministic = new Roll(roll.parts[0]).isDeterministic;
      const includeMod = (!rollConfig.attackMode?.endsWith("offhand") || (roll.data.mod < 0)) && !isDeterministic
        && !((this.attack.type.classification === "spell") && (this.item.system.type.value === "natural"));
      if ( includeMod && !roll.parts.some(p => p.includes("@mod")) ) roll.parts.push("@mod");

      // Add magical bonus
      const magicalBonus = simplifyBonus(this.item.system.magicalBonus, rollData);
      if ( magicalBonus && this.item.system.magicAvailable ) {
        roll.parts.push("@magicalBonus");
        roll.data.magicalBonus = magicalBonus;
      }

      // Add ammunition bonus
      const ammo = rollConfig.ammunition?.system;
      const ammoMagicalBonus = simplifyBonus(ammo?.magicalBonus, rollData);
      if ( ammo?.magicAvailable && ammoMagicalBonus ) {
        roll.parts.push("@ammoBonus");
        roll.data.ammoBonus = ammoMagicalBonus;
      }
    }

    const criticalBonusDice = this.actor?.getFlag("dnd5e", "meleeCriticalDamageDice") ?? 0;
    if ( (this.getActionType(rollConfig.attackMode) === "mwak") && (parseInt(criticalBonusDice) !== 0) ) {
      foundry.utils.setProperty(roll, "options.critical.bonusDice", criticalBonusDice);
    }

    return roll;
  }
