/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/
// MIT: foundryvtt/dnd5e 87e94dbd9f930135e0694cd7e7d49f210603cd2c; exact native class/method bodies.
export function makeFateDie(BasicDie) {
return class D20Die extends BasicDie {
  constructor({ number=1, faces=20, ...args }={}) {
    super({ number, faces, ...args });
  }

  /* -------------------------------------------- */

  /**
   * Critical success target if no critical failure is set in options.
   * @type {number}
   */
  static CRITICAL_SUCCESS_TOTAL = 20;

  /* -------------------------------------------- */

  /**
   * Critical failure target if no critical failure is set in options.
   * @type {number}
   */
  static CRITICAL_FAILURE_TOTAL = 1;

  /* -------------------------------------------- */

  /**
   * Is the result of this roll a critical success? Returns `undefined` if roll isn't evaluated.
   * @type {boolean|void}
   */
  get isCriticalSuccess() {
    if ( !this.isValid || !this._evaluated ) return;
    if ( !Number.isNumeric(this.options.criticalSuccess) ) return false;
    return this.total >= this.options.criticalSuccess;
  }

  /* -------------------------------------------- */

  /**
   * Is the result of this roll a critical failure? Returns `undefined` if roll isn't evaluated.
   * @type {boolean|void}
   */
  get isCriticalFailure() {
    if ( !this.isValid || !this._evaluated ) return;
    if ( !Number.isNumeric(this.options.criticalFailure) ) return false;
    return this.total <= this.options.criticalFailure;
  }

  /* -------------------------------------------- */

  /**
   * Is this a valid challenge die?
   * @type {boolean}
   */
  get isValid() {
    return this.faces === 20;
  }

  /* -------------------------------------------- */
  /*  Die Modification                            */
  /* -------------------------------------------- */

  /**
   * Apply advantage mode to this die.
   * @param {number} advantageMode  Advantage mode to apply.
   */
  applyAdvantage(advantageMode) {
    this.options.advantageMode = advantageMode;
    this.modifiers.findSplice(m => m.startsWith("adv") || m.startsWith("dis") || (m === "kh") || (m === "kl"));
    this.number = 1;
    if ( advantageMode === CONFIG.Dice.D20Roll.ADV_MODE.NORMAL ) return;
    const isAdvantage = advantageMode === CONFIG.Dice.D20Roll.ADV_MODE.ADVANTAGE;
    this.modifiers.push(`${isAdvantage ? "adv" : "dis"}${isAdvantage && this.options.elvenAccuracy ? "2" : ""}`);
  }

  /* -------------------------------------------- */

  /**
   * Set or unset the specified flag on this die.
   * @param {string} flag      Flag to apply.
   * @param {boolean} enabled  Is the flag enabled?
   */
  applyFlag(flag, enabled) {
    this.options[flag] = enabled;

    // Halfling Lucky, re-roll a natural 1 once
    if ( flag === "halflingLucky" ) {
      const index = this.modifiers.findIndex(m => m === "r1=1");
      if ( enabled && (index === -1) ) this.modifiers.push("r1=1");
      else if ( !enabled && (index !== -1) ) this.modifiers.splice(index, 1);
    }
  }

  /* -------------------------------------------- */

  /**
   * Apply a minimum or maximum value to this die.
   * @param {object} values
   * @param {number} [values.minimum]
   * @param {number} [values.maximum]
   */
  applyRange(values) {
    for ( let [key, value] of Object.entries(values) ) {
      if ( !Number.isFinite(value) ) value = undefined;
      this.options[key] = value;
      const mod = key.substring(0, 3);
      this.modifiers.findSplice(m => m.startsWith(mod));
      if ( value ) this.modifiers.push(`${mod}${value}`);
    }
  }
}

}
export function nativeFateAttackTargets() {
    const roll = this.parent.rolls[0];
    if ( !(roll instanceof CONFIG.Dice.D20Roll) ) return [];
    return this.targets.map(target => ({
      ...target,
      isMiss: (target.ac === null) || (!roll.isCritical && ((roll.total < target.ac) || roll.isFumble))
    }));
}
let BasicRoll;
export function setFateRollHost(host) { BasicRoll=host; }
export async function nativeFateToMessage(rolls,messageData={}, {rollMode,create=true}={}) {
    for ( const roll of rolls ) {
      if ( !roll._evaluated ) await roll.evaluate({ allowInteractive: rollMode !== CONST.DICE_ROLL_MODES.BLIND });
      rollMode ??= roll.options.rollMode;
    }
    rollMode ??= BasicRoll.getMessageMode();

    // Prepare chat data
    messageData = foundry.utils.mergeObject({ sound: CONFIG.sounds.dice }, messageData);
    this._prepareMessageData(rolls, messageData);
    messageData.rolls = rolls.map(r => this.fromData(r.toJSON()));

    // Process the chat data
    const cls = getDocumentClass("ChatMessage");
    const msg = new cls(messageData);

    // Either create or return the data
    if ( create ) return cls.create(msg.toObject(), { messageMode: rollMode });
    else {
      if ( rollMode ) msg.applyMode(rollMode);
      return msg.toObject();
    }
}
