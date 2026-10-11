/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/
// Exact dnd5e 6.0.6 bodies, commit 87e94dbd9f930135e0694cd7e7d49f210603cd2c.
export async function nativeApplyDamage(damages, options={}) {
    const hp = this.system.attributes.hp;
    const hpSource = this.system._source.attributes.hp;
    if ( !hp ) return this; // Group actors don't have HP at the moment

    if ( Number.isNumeric(damages) ) {
      damages = [{ value: damages }];
      options.ignore ??= true;
    }

    damages = this.calculateDamage(damages, options);
    if ( !damages ) return this;

    const { amount, temp, tempMax } = damages;
    const deltaTemp = amount > 0 ? Math.min(hp.temp, amount) : 0;
    const deltaHP = Math.clamp(amount - deltaTemp, -hp.damage + tempMax, hp.value - tempMax);
    const updates = {
      "system.attributes.hp.temp": hp.temp - deltaTemp,
      "system.attributes.hp.tempmax": hpSource.tempmax - tempMax,
      "system.attributes.hp.value": hp.value - deltaHP
    };

    if ( temp > updates["system.attributes.hp.temp"] ) updates["system.attributes.hp.temp"] = temp;

    /**
     * A hook event that fires before damage is applied to an actor.
     * @param {Actor5e} actor                     Actor the damage will be applied to.
     * @param {number} amount                     Amount of damage that will be applied.
     * @param {object} updates                    Distinct updates to be performed on the actor.
     * @param {DamageApplicationOptions} options  Additional damage application options.
     * @returns {boolean}                         Explicitly return `false` to prevent damage application.
     * @function dnd5e.preApplyDamage
     * @memberof hookEvents
     */
    if ( Hooks.call("dnd5e.preApplyDamage", this, amount, updates, options) === false ) return this;

    // Delegate damage application to a hook
    // TODO: Replace this in the future with a better modifyTokenAttribute function in the core
    if ( Hooks.call("modifyTokenAttribute", {
      attribute: "attributes.hp",
      value: amount,
      isDelta: false,
      isBar: true
    }, updates) === false ) return this;

    const context = options.origin?.getFlag?.("dnd5e", "context");
    await this.update(updates, context ? { dnd5e: context } : {});

    /**
     * A hook event that fires after damage has been applied to an actor.
     * @param {Actor5e} actor                     Actor that has been damaged.
     * @param {number} amount                     Amount of damage that has been applied.
     * @param {DamageApplicationOptions} options  Additional damage application options.
     * @function dnd5e.applyDamage
     * @memberof hookEvents
     */
    Hooks.callAll("dnd5e.applyDamage", this, amount, options);

    return this;
  }
export function nativeCardDamage(li, multiplier) {
    const damages = aggregateDamageRolls(this.rolls, { respectProperties: true }).map(roll => ({
      value: Math.max(0, roll.total) * (roll.options.type in CONFIG.DND5E.healingTypes ? -1 : 1),
      type: roll.options.type,
      properties: new Set(roll.options.properties ?? [])
    }));
    return Promise.all(canvas.tokens.controlled.map(t => {
      return t.actor?.applyDamage(damages, { multiplier, isDelta: true, originatingMessage: this });
    }));
  }
export function nativeEvaluatedTargets() {
    const roll = this.parent.rolls[0];
    if ( !(roll instanceof CONFIG.Dice.D20Roll) ) return [];
    return this.targets.map(target => ({
      ...target,
      isMiss: (target.ac === null) || (!roll.isCritical && ((roll.total < target.ac) || roll.isFumble))
    }));
  }

// The private trait checks are injected as changeHasEffect/changeIsIgnored.
export function nativeCalculateDamage(damages, options={}) {
    damages = foundry.utils.deepClone(damages);
    damages.amount = 0;
    damages.temp = 0;
    damages.tempMax = 0;

    /**
     * A hook event that fires before damage amount is calculated for an actor.
     * @param {Actor5e} actor                     The actor being damaged.
     * @param {DamageDescription[]} damages       Damage descriptions.
     * @param {DamageApplicationOptions} options  Additional damage application options.
     * @returns {boolean}                         Explicitly return `false` to prevent damage application.
     * @function dnd5e.preCalculateDamage
     * @memberof hookEvents
     */
    if ( Hooks.call("dnd5e.preCalculateDamage", this, damages, options) === false ) return false;

    const multiplier = options.multiplier ?? 1;
    const { isHealing } = options.originatingMessage?.system ?? {};
    const treatAs = isHealing === undefined ? (options.only ?? "damage") : isHealing ? "healing" : "damage";

    const skipped = type => {
      if ( type === "maximum" ) return options.only ? options.only !== treatAs : false;
      if ( options.only === "damage" ) return type in CONFIG.DND5E.healingTypes;
      if ( options.only === "healing" ) return type in CONFIG.DND5E.damageTypes;
      return false;
    };

    const dm = this.system.traits?.dm ?? {};
    const rollData = this.getRollData({ deterministic: true });
    const modifications = Object.entries(dm.amount ?? {}).reduce((obj, [type, formula]) => {
      obj[type] = simplifyBonus(formula, rollData);
      return obj;
    }, {});
    const applyModification = (d, type=d.type) => {
      if ( !modifications[type] || this.changeIsIgnored("modification", type, { options }) ) return;
      const originalValue = d.value;
      if ( Math.sign(d.value) !== Math.sign(d.value + modifications[type]) ) d.value = 0;
      else d.value += modifications[type];
      (d.active[type === "ALL" ? "all" : "type"] ??= {}).modification = true;
      modifications[type] += originalValue - d.value;
    };

    damages.forEach(d => {
      d.active ??= {};

      // Skip damage types with immunity
      if ( skipped(d.type) || this.changeHasEffect("immunity", d, { options }) ) {
        d.value = 0;
        d.active.multiplier = 0;
        return;
      }

      // Apply damage modification
      if ( !CONFIG.DND5E.damageTypes[d.type]?.isPhysical || !d.properties?.size
        || !dm.bypasses?.intersection(d.properties).size ) {
        applyModification(d);
        if ( !(d.type in CONFIG.DND5E.healingTypes) ) applyModification(d, "ALL");
      }

      let damageMultiplier = multiplier;
      let appliedDamage = d.value * multiplier;

      // Apply damage resistance
      if ( this.changeHasEffect("resistance", d, { options }) ) {
        damageMultiplier /= 2;
        appliedDamage = Math.trunc(appliedDamage / 2);
      }

      // Apply damage vulnerability
      if ( this.changeHasEffect("vulnerability", d, { options }) ) {
        damageMultiplier *= 2;
        appliedDamage *= 2;
      }

      // Negate healing types
      if ( (options.invertHealing !== false) && ((d.type === "healing")
        || ((d.type === "maximum") && (treatAs === "healing"))) ) {
        damageMultiplier *= -1;
        appliedDamage *= -1;
      }

      d.value = appliedDamage;
      d.active.multiplier = (d.active.multiplier ?? 1) * damageMultiplier;
      if ( d.type === "temphp" ) damages.temp += d.value;
      else if ( d.type === "maximum" ) damages.tempMax += d.value;
      else damages.amount += d.value;
    });

    if ( damages.tempMax < 0 ) damages.amount += damages.tempMax;
    damages.amount = Math.trunc(damages.amount);

    // Apply damage threshold
    if ( ((damages.amount > 0) && (damages.amount < (this.system.attributes?.hp?.dt ?? -Infinity)))
      && !((options.ignore === true) || options.ignore?.threshold) ) {
      damages.amount = 0;
      damages.forEach(d => {
        d.value = 0;
        d.active.multiplier = 0;
        d.active.threshold = true;
      });
    }

    /**
     * A hook event that fires after damage values are calculated for an actor.
     * @param {Actor5e} actor                     The actor being damaged.
     * @param {DamageSummary} damages             Damage descriptions.
     * @param {DamageApplicationOptions} options  Additional damage application options.
     * @returns {boolean}                         Explicitly return `false` to prevent damage application.
     * @function dnd5e.calculateDamage
     * @memberof hookEvents
     */
    if ( Hooks.call("dnd5e.calculateDamage", this, damages, options) === false ) return false;

    return damages;
  }
