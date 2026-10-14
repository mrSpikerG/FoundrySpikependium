/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
// MIT: foundryvtt/dnd5e 87e94dbd9f930135e0694cd7e7d49f210603cd2c; unchanged skill/proficiency method bodies.
/**
 * Object describing the proficiency for a specific ability or skill.
 *
 * @param {number} proficiency   Actor's flat proficiency bonus based on their current level.
 * @param {number} multiplier    Value by which to multiply the actor's base proficiency value.
 * @param {boolean} [roundDown]  Should half-values be rounded up or down?
 */
class Proficiency {
  constructor(proficiency, multiplier, roundDown=true) {

    /**
     * Base proficiency value of the actor.
     * @type {number}
     * @private
     */
    this._baseProficiency = Number(proficiency ?? 0);

    /**
     * Value by which to multiply the actor's base proficiency value.
     * @type {number}
     */
    this.multiplier = Number(multiplier ?? 0);

    /**
     * Direction decimal results should be rounded ("up" or "down").
     * @type {string}
     */
    this.rounding = roundDown ? "down" : "up";
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Should only deterministic proficiency be returned, regardless of system settings?
   * @type {boolean}
   */
  deterministic = false;

  /* -------------------------------------------- */

  /**
   * Flat proficiency value regardless of proficiency mode.
   * @type {number}
   */
  get flat() {
    const roundMethod = (this.rounding === "down") ? Math.floor : Math.ceil;
    return roundMethod(this.multiplier * this._baseProficiency);
  }

  /* -------------------------------------------- */

  /**
   * Dice-based proficiency value regardless of proficiency mode.
   * @type {string}
   */
  get dice() {
    if ( (this._baseProficiency === 0) || (this.multiplier === 0) ) return "0";
    const roundTerm = (this.rounding === "down") ? "floor" : "ceil";
    if ( this.multiplier === 0.5 ) {
      return `${roundTerm}(1d${this._baseProficiency * 2} / 2)`;
    } else {
      return `${this.multiplier}d${this._baseProficiency * 2}`;
    }
  }

  /* -------------------------------------------- */

  /**
   * Either flat or dice proficiency term based on configured setting.
   * @type {string}
   */
  get term() {
    return (dnd5e.settings.proficiencyModifier === "dice") && !this.deterministic
      ? this.dice : String(this.flat);
  }

  /* -------------------------------------------- */

  /**
   * Whether the proficiency is greater than zero.
   * @type {boolean}
   */
  get hasProficiency() {
    return (this._baseProficiency > 0) && (this.multiplier > 0);
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Calculate an actor's proficiency modifier based on level or CR.
   * @param {number} level  Level or CR To use for calculating proficiency modifier.
   * @returns {number}      Proficiency modifier.
   */
  static calculateMod(level) {
    return Math.floor((level + 7) / 4);
  }

  /* -------------------------------------------- */

  /**
   * Return a clone of this proficiency with any changes applied.
   * @param {object} [updates={}]
   * @param {number} updates.proficiency  Actor's flat proficiency bonus based on their current level.
   * @param {number} updates.multiplier   Value by which to multiply the actor's base proficiency value.
   * @param {boolean} updates.roundDown   Should half-values be rounded up or down?
   * @returns {Proficiency}
   */
  clone({ proficiency, multiplier, roundDown }={}) {
    proficiency ??= this._baseProficiency;
    multiplier ??= this.multiplier;
    roundDown ??= this.rounding === "down";
    return new this.constructor(proficiency, multiplier, roundDown);
  }

  /* -------------------------------------------- */

  /**
   * Override the default `toString` method to return flat proficiency for backwards compatibility in formula.
   * @returns {string}  Either flat or dice proficiency term based on configured setting.
   */
  toString() {
    return this.term;
  }
}

let D20RollModificationField;
export function setSkillModificationField(field) { D20RollModificationField = field; }
export function nativeSkillConfig(type, hostActor, process, config, formData, index) {
    const abilityId = formData?.get("ability") ?? process.ability;
    const ability = this.system.abilities?.[abilityId];
    const { calculateSkillToolProficiency } = dnd5e.dataModels.actor.CommonTemplate;
    let prof = calculateSkillToolProficiency(this, abilityId, process);
    const originalProf = calculateSkillToolProficiency(hostActor, abilityId, process);
    if ( originalProf?.multiplier > prof.multiplier ) prof = originalProf;
    const rollData = this.getRollData({ roll: true });
    Object.assign(rollData.roll, {
      ability: abilityId,
      proficient: prof.multiplier >= 1,
      [type]: process[type],
      type: type
    });

    const { bonus, maximum, minimum } = D20RollModificationField.combineFields(this.system, [
      `abilities.${abilityId}.check.roll`,
      "rolls.ability.check",
      `rolls.ability.${type}`,
      `${type}s.${type === "skill" ? process.skill : process.tool}.roll`
    ], { rules: { category: "check", actor: this, rollData } });

    let { parts, data } = CONFIG.Dice.D20Roll.constructParts({
      mod: ability?.mod,
      prof: prof?.hasProficiency ? prof.term : null,
      extraBonus: process.bonus,
      ruleBonus: bonus
    }, { ...rollData });

    // Add condition reductions.
    this.addConditionRollReduction(parts, data);

    config.options = CONFIG.Dice.D20Roll.mergeOptions({ maximum, minimum }, config.options ?? {});
    config.parts = [...(config.parts ?? []), ...parts];
    config.data = { ...data, ...(config.data ?? {}) };
    config.data.abilityId = abilityId;
  }
export function nativeAbilityProficiency(multiplier, ability, options={}) {
    let roundDown = true;
    multiplier = Math.max(multiplier, this.rolls?.ability?.check?.proficiency ?? -Infinity);
    if ( options.skill ) multiplier = Math.max(multiplier, this.rolls?.ability?.skill?.proficiency ?? -Infinity);
    if ( (multiplier < 1) && ((dnd5e.settings.rulesVersion === "legacy") || options.skill) ) {
      if ( this.parent._isRemarkableAthlete(ability) ) {
        multiplier = .5;
        roundDown = false;
      }
      else if ( this.parent.flags.dnd5e?.jackOfAllTrades ) multiplier = .5;
    }
    return new Proficiency(this.attributes.prof, multiplier, roundDown);
  }
export function nativeSkillProficiency(actor, abilityId, options={}) {
    if ( !actor ) return null;
    const skill = actor.system.skills?.[options.skill];
    const tool = actor.system.tools?.[options.tool];
    const multiplier = Math.max(skill?.effectValue ?? 0, tool?.effectValue ?? 0);
    const calc = options.tool ? actor.system.calculateToolProficiency : actor.system.calculateAbilityCheckProficiency;
    return calc.call(actor.system, multiplier, abilityId, options);
  }
