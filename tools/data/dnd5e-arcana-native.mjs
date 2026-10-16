/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
// MIT: foundryvtt/dnd5e 87e94dbd9f930135e0694cd7e7d49f210603cd2c; unchanged method bodies.
let convertLength, defaultUnits, simplifyBonus, ConditionData;
// https://github.com/foundryvtt/dnd5e/blob/87e94dbd9f930135e0694cd7e7d49f210603cd2c/module/dice/d20-roll.mjs
export function nativeD20ConfigureModifiers() {
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
export function setMovementContext(context) { ({convertLength, defaultUnits, simplifyBonus, ConditionData} = context); }
export class NativeAdvantageModeField {
_applyChangeAdd(value, delta, model, change) {
    // Add a source of advantage or disadvantage.
    if ( (delta !== -1) && (delta !== 1) ) return value;
    const counts = this.constructor.getCounts(model, change.key);
    if ( delta === 1 ) counts.advantages.count++;
    else counts.disadvantages.count++;
    return this.constructor.resolveMode(model, change, counts);
  }
static combineFields(model, keyPaths, counts={}) {
    counts = foundry.utils.mergeObject({
      override: null,
      advantages: { count: 0, suppressed: false },
      disadvantages: { count: 0, suppressed: false }
    }, counts);
    for ( const kp of keyPaths ) {
      const c = this.getCounts(model, kp);
      const src = foundry.utils.getProperty(model._source, kp) ?? 0;
      if ( c.override !== null ) counts.override = c.override;
      if ( c.advantages.suppressed ) counts.advantages.suppressed = true;
      if ( c.disadvantages.suppressed ) counts.disadvantages.suppressed = true;
      counts.advantages.count += c.advantages.count + Number(src === 1);
      counts.disadvantages.count += c.disadvantages.count + Number(src === -1);
    }
    return {
      advantage: (((counts.advantages.count > 0) && (counts.override === null)) || (counts.override === 1))
        && !counts.advantages.suppressed,
      disadvantage: (((counts.disadvantages.count > 0) && (counts.override === null)) || (counts.override === -1))
        && !counts.disadvantages.suppressed,
      mode: this.resolveMode(model, null, counts)
    };
  }
static getCounts(model, keyPath) {
    keyPath = foundry.utils.getType(keyPath) === "Object" ? keyPath.key : keyPath;
    const parentKey = keyPath.substring(0, keyPath.lastIndexOf("."));
    const roll = foundry.utils.getProperty(model, parentKey) ?? {};
    return roll.modeCounts ??= {
      override: null,
      advantages: { count: 0, suppressed: false },
      disadvantages: { count: 0, suppressed: false }
    };
  }
static resolveMode(model, keyPath, counts) {
    keyPath = foundry.utils.getType(keyPath) === "Object" ? keyPath.key : keyPath;
    const { override, advantages, disadvantages } = counts ?? this.getCounts(model, keyPath);
    if ( override !== null ) return override;
    const src = foundry.utils.getProperty(model._source, keyPath) ?? 0;
    const advantageCount = advantages.suppressed ? 0 : Math.max(0, advantages.count + Number(src === 1));
    const disadvantageCount = disadvantages.suppressed ? 0 : Math.max(0, disadvantages.count + Number(src === -1));
    return Math.sign(advantageCount) - Math.sign(disadvantageCount);
  }
}
export function nativeEffectDuration() {
    let { expiry, value, units } = this;
    if ( !Number.isNumeric(value) ) return expiry ? { expiry, value: null } : {};
    if ( expiry && !ActiveEffect.implementation.expirySupportsDuration(expiry) ) return { expiry, value: null };
    switch ( units ) {
      case "turn": units = "turns"; break;
      case "round": units = "rounds"; break;
      case "second": units = "seconds"; break;
      case "minute": units = "minutes"; break;
      case "hour": units = "hours"; break;
      case "day": units = "days"; break;
      case "month": units = "months"; break;
      case "year": units = "years"; break;
      default: return expiry ? { expiry, value: null } : {};
    }
    if ( units !== "turns" ) expiry ??= "turnStart";
    return { value, units, expiry };
  }
export function nativeAppliedEffectChanges(effect, { chatMessage, target }={}) {
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
export async function nativeIncreaseExhaustion(levels=1) {
    if ( !this.hasLevels ) return this;
    const level = Math.clamp(this.level + levels, 0, this.maxLevel);
    await this.parent.update({ "system.level": level }, { dnd5e: { originalLevel: this.level }});
    return this.parent;
  }
export function nativePrepareMovement(rollData=this.parent.getRollData()) {
    const statuses = this.parent.statuses;
    const noMovement = this.parent.hasConditionEffect("noMovement");
    const crawl = this.parent.hasConditionEffect("crawl");
    const speeds = this.attributes.movement.speeds;
    for ( const type of Object.keys(CONFIG.DND5E.movementTypes) ) {
      if ( noMovement || (crawl && (type !== "walk")) ) speeds[type] = 0;
      else speeds[type] = Math.max(0, simplifyBonus(speeds[type], rollData));
      if ( type === "walk" ) this.attributes.movement.speed = speeds.walk;
    }

    const halfMovement = this.parent.hasConditionEffect("halfMovement");
    const encumbered = statuses.has("encumbered");
    const heavilyEncumbered = statuses.has("heavilyEncumbered");
    const exceedingCarryingCapacity = statuses.has("exceedingCarryingCapacity");
    const units = this.attributes.movement.units ??= defaultUnits("length");

    let reduction = statuses.reduce((acc, status) => {
      const immune = this.traits?.ci?.value?.has(status);
      if ( immune ) return acc;

      const speed = CONFIG.DND5E.conditionTypes[status]?.reduction?.speed ?? 0;
      const level = ConditionData.hasLevels(status)
        ? this.parent.system.conditions[status] ?? 0
        : Boolean(statuses.has(status));
      return acc + (level * speed);
    }, 0);
    if ( ((this.attributes.ac?.equippedArmor?.system.strength ?? 0) > (this.abilities?.str?.value ?? Infinity))
      && !this.parent.flags.dnd5e?.ignoreArmorSpeedReduction && this.isCreature ) {
      reduction += CONFIG.DND5E.armorSpeedReduction;
    }
    reduction = convertLength(reduction, CONFIG.DND5E.defaultUnits.length.imperial, units);
    const bonus = simplifyBonus(this.attributes.movement.bonus, rollData);
    const multiplier = this.attributes.movement.multiplier * (halfMovement ? 0.5 : 1);
    this.attributes.movement.max = 0;
    for ( const type of Object.keys(CONFIG.DND5E.movementTypes) ) {
      let speed = Math.max(0, speeds[type] - reduction);
      if ( (speed * multiplier) > 0 ) {
        speed = Math.max(0, speed + bonus) * multiplier;
        if ( heavilyEncumbered ) {
          speed = Math.max(0, speed - (CONFIG.DND5E.encumbrance.speedReduction.heavilyEncumbered[units] ?? 0));
        } else if ( encumbered ) {
          speed = Math.max(0, speed - (CONFIG.DND5E.encumbrance.speedReduction.encumbered[units] ?? 0));
        }
        if ( exceedingCarryingCapacity ) {
          speed = Math.min(speed, CONFIG.DND5E.encumbrance.speedReduction.exceedingCarryingCapacity[units] ?? 0);
        }
        speeds[type] = speed;
      } else {
        speeds[type] = 0;
      }
      this.attributes.movement.max = Math.max(speeds[type], this.attributes.movement.max);
      if ( type === "walk" ) this.attributes.movement.speed = speeds[type];
    }
    const baseSpeed = this._source.attributes.movement.speeds.walk || this.attributes.movement.fromSpecies?.walk;
    this.attributes.movement.slowed = speeds.walk <= (simplifyBonus(baseSpeed, rollData) / 2);
    this.attributes.movement.speeds.jump = (this.abilities?.str.value ?? 0) / 2;
  }
export async function nativeRest(config, result={}) {
    if ( (foundry.utils.getType(this.system.rest) === "function")
      && (await this.system.rest(config, result) === false) ) return;

    result = foundry.utils.mergeObject({
      type: config.type,
      deleteItems: [],
      deltas: {
        hitPoints: 0,
        hitDice: 0
      },
      newDay: config.newDay === true,
      request: config.request,
      rolls: [],
      updateData: {},
      updateItems: []
    }, result);
    result.clone ??= this.clone();
    if ( "dhp" in result ) result.deltas.hitPoints = result.dhp;
    if ( "dhd" in result ) result.deltas.hitDice = result.dhd;

    this._getRestHitDiceRecovery(config, result);
    this._getRestHitPointRecovery(config, result);
    this._getRestResourceRecovery(config, result);
    this._getRestSpellRecovery(config, result);
    await this._getRestItemUsesRecovery(config, result);

    result.dhp = result.deltas.hitPoints;
    result.dhd = result.deltas.hitDice;
    result.longRest = result.type === "long";

    if ( config.exhaustionDelta && !result.clone.hasConditionEffect("malnourished")
      && !result.clone.hasConditionEffect("dehydrated") ) {
      const path = "system.attributes.exhaustion";
      const value = foundry.utils.getProperty(result.clone, path) ?? 0;
      foundry.utils.mergeObject(result.updateData, { [path]: Math.max(0, value + config.exhaustionDelta) });
    }

    /**
     * A hook event that fires after rest result is calculated, but before any updates are performed.
     * @function dnd5e.preRestCompleted
     * @memberof hookEvents
     * @param {Actor5e} actor             The actor that is being rested.
     * @param {RestResult} result         Details on the rest to be completed.
     * @param {RestConfiguration} config  Configuration data for the rest occurring.
     * @returns {boolean}                 Explicitly return `false` to prevent the rest updates from being performed.
     */
    if ( Hooks.call("dnd5e.preRestCompleted", this, result, config) === false ) return result;

    // Expire active effects
    const expiryEvents = CONFIG.DND5E.restTypes[config.type ?? "long"]?.expiryEvents ?? [];
    let operations = [];
    if ( expiryEvents.length ) {
      const expired = new Map();
      const expireEffect = effect => {
        if ( expiryEvents.includes(effect.duration.expiry) ) expired.getOrInsert(effect.parent, []).push(effect.id);
      };
      for ( const effect of this.effects ) {
        if ( !effect.getFlag("dnd5e", "dependentOn") ) expireEffect(effect);
      }
      for ( const item of this.items ) {
        for ( const effect of item.effects ) {
          if ( effect.getFlag("dnd5e", "dependentOn") ) continue;
          if ( effect.isAppliedEnchantment ) expireEffect(effect);
        }
      }
      operations = expired.entries()
        .map(([parent, ids]) => ({ action: "delete", documentName: "ActiveEffect", ids, parent }))
        .toArray();
    }

    // Perform updates
    await this.performBulkUpdate(
      { actor: result.updateData, delete: result.deleteItems, item: result.updateItems, operations }, { isRest: true }
    );

    // Advance the game clock
    if ( config.advanceTime && (config.duration > 0) && game.user.isGM ) await game.time.advance(60 * config.duration);

    // Display a Chat Message summarizing the rest effects
    if ( config.chat ) result.message = await this._displayRestResultMessage(config, result);

    /**
     * A hook event that fires when the rest process is completed for an actor.
     * @function dnd5e.restCompleted
     * @memberof hookEvents
     * @param {Actor5e} actor             The actor that just completed resting.
     * @param {RestResult} result         Details on the rest completed.
     * @param {RestConfiguration} config  Configuration data for that occurred.
     */
    Hooks.callAll("dnd5e.restCompleted", this, result, config);

    if ( config.advanceBastionTurn && game.user.isGM && game.settings.get("dnd5e", "bastionConfiguration").enabled
      && this.itemTypes.facility.length ) await dnd5e.bastion.advanceAllFacilities(this);

    // Return data summarizing the rest effects
    return result;
  }
export function nativePerformBulkUpdate(
    { operations=[], ...updates }, { createOptions={}, deleteOptions={}, updateOptions={}, ...options }={}
  ) {
    if ( !foundry.utils.isEmpty(updates.actor) ) operations.push(this.parent
      ? {
        action: "update", documentName: "ActorDelta", parent: this.parent,
        updates: [{ ...updates.actor, _id: this.parent.delta.id }], ...options
      }
      : { action: "update", documentName: "Actor", updates: [{ _id: this.id, ...updates.actor }], ...options }
    );
    if ( !foundry.utils.isEmpty(updates.create) ) operations.push({
      action: "create", documentName: "Item", data: updates.create, parent: this, keepId: true,
      ...options, ...createOptions
    });
    if ( !foundry.utils.isEmpty(updates.delete) ) operations.push({
      action: "delete", documentName: "Item", ids: updates.delete, parent: this,
      ...options, ...deleteOptions
    });
    if ( !foundry.utils.isEmpty(updates.item) ) operations.push({
      action: "update", documentName: "Item", updates: updates.item, parent: this,
      ...options, ...updateOptions
    });
    return foundry.documents.modifyBatch(operations);
  }
export function nativeRestResourceRecovery({ recoverShortRestResources, recoverLongRestResources, ...config }={}, result={}) {
    recoverShortRestResources ??= config.type === "short";
    recoverLongRestResources ??= config.type === "long";
    for ( let [k, r] of Object.entries(this.system.resources ?? {}) ) {
      if ( Number.isNumeric(r.max) && ((recoverShortRestResources && r.sr) || (recoverLongRestResources && r.lr)) ) {
        result.updateData[`system.resources.${k}.value`] = Number(r.max);
      }
    }
  }
export function nativeRestSpellRecovery({ recoverShort, recoverLong, ...config }={}, result={}) {
    const restConfig = CONFIG.DND5E.restTypes[config.type];
    if ( !this.system.spells ) return;
    const types = restConfig.recoverSpellSlotTypes;
    if ( !types?.size ) return;
    for ( const [key, slot] of Object.entries(this.system.spells) ) {
      if ( !types.has(slot.type) ) continue;
      result.updateData[`system.spells.${key}.value`] = slot.max;
    }
  }
export async function nativeRestItemRecovery({
    recoverShortRestUses, recoverLongRestUses, recoverDailyUses, ...config
  }={}, result={}) {
    const restConfig = CONFIG.DND5E.restTypes[config.type];
    let recovery = Array.from(restConfig.recoverPeriods ?? []).map(p => [p, 1]);
    if ( recoverShortRestUses ) recovery.unshift(["sr", 1]);
    if ( recoverLongRestUses ) recovery.unshift(["lr", 1]);
    if ( (recoverDailyUses || config.newDay) && dnd5e.settings.calendarConfig.manualRecovery ) {
      const days = (dnd5e.settings.restVariant === "gritty") && (config.type === "long") ? 7 : 1;
      recovery.unshift(["day", days], ["dawn", days], ["dusk", days]);
    }
    recovery = new Map(recovery);

    result.updateItems ??= [];
    result.rolls ??= [];
    for ( const item of this.items ) {
      if ( item.isHidden || (foundry.utils.getType(item.system.recoverUses) !== "function") ) continue;
      const { updates, rolls, destroy } = await item.system.recoverUses(recovery);
      if ( destroy ) {
        result.deleteItems.push(item.id);
      } else if ( !foundry.utils.isEmpty(updates) ) {
        const updateTarget = result.updateItems.find(i => i._id === item.id);
        if ( updateTarget ) foundry.utils.mergeObject(updateTarget, updates);
        else result.updateItems.push({ _id: item.id, ...updates });
      }
      result.rolls.push(...rolls);
    }
  }

// https://github.com/foundryvtt/dnd5e/blob/87e94dbd9f930135e0694cd7e7d49f210603cd2c/module/documents/active-effect.mjs
export function nativeLanternExpiry(Base) { return class extends Base {
  isExpiryEvent(event, context={}) {
    const special = this.specialDuration;
    if ( !special ) return super.isExpiryEvent(event, context);

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
}; }

// Exact method from module/data/item/templates/activities.mjs at the same pinned commit.
export function nativeDeleteCachedActivities(options, userId) {
    if ( (userId !== game.user.id) || !this.parent.isEmbedded ) return;

    // If item has any Cast activities, clean up any cached spells
    const spellIds = this.activities.getByType("cast").map(a => a.cachedSpell?.id).filter(_ => _);
    if ( spellIds.length ) this.parent.actor.deleteEmbeddedDocuments("Item", spellIds);
}

// Exact method from module/documents/actor/actor.mjs at the same pinned commit.
export async function nativeDuelUpdateDowned(options) {
    const { autoApplyDowned } = dnd5e.settings;
    if ( autoApplyDowned === "none" ) return;
    const hp = this.system.attributes?.hp;
    if ( !hp ) return;

    // If non-zero, remove any auto-downed effects
    if ( hp.value ) {
      const autoEffects = this.effects.filter(e => e.getFlag("dnd5e", "autoDowned"));
      return this.deleteEmbeddedDocuments("ActiveEffect", autoEffects.map(e => e.id));
    }
    const conditionEffects = this.effects.documentsByType.condition;
    const isDead = conditionEffects.some(e => e.system.type === "dead");
    const isUnconscious = conditionEffects.some(e => e.system.type === "unconscious");

    // Do not auto-apply statuses outside of combat or if already dead
    if ( !this.inCombat || isDead ) return;
    const failedDeathSaves = this.system.attributes.death.failure >= 3;
    let toApply = null;
    if ( this.type === "npc" ) {
      if ( !this.system.traits.important ) toApply = "dead";
      else if ( autoApplyDowned !== "deadOnly" ) toApply = failedDeathSaves ? "dead" : "unconscious";
    } else if ( (this.type === "character") && (autoApplyDowned === "all") ) {
      toApply = failedDeathSaves ? "dead" : "unconscious";
    }
    if ( !toApply || ((toApply === "unconscious") && isUnconscious) ) return;
    const effect = await ActiveEffect.implementation.fromStatusEffect(toApply);
    const flags = { dnd5e: { autoDowned: true } };
    if ( toApply === "dead" ) flags.core = { overlay: true };
    effect.updateSource({ flags });
    return ActiveEffect.implementation.create(effect, { parent: this, keepId: true });
}

let SteelActiveEffect, SteelItem;
export function setSteelMindNativeHost(effect,item) { SteelActiveEffect=effect; SteelItem=item; }

// documents/actor/actor.mjs: get concentration(); unchanged body (class import names injected above).
export function nativeSteelConcentration() {
    if ( this._lazy.concentration !== undefined ) return this._lazy.concentration;
    const concentration = this._lazy.concentration = {
      items: new Set(),
      effects: new Set()
    };

    const limit = this.system.attributes?.concentration?.limit ?? 0;
    if ( !limit ) return concentration;

    for ( const effect of this.effects ) {
      if ( !effect.active || !effect.statuses.has(CONFIG.specialStatusEffects.CONCENTRATING) ) continue;
      const data = effect.getFlag("dnd5e", "item");
      concentration.effects.add(effect);
      if ( data ) {
        let item = this.items.get(data.id);
        if ( !item && (foundry.utils.getType(data.data) === "Object") ) {
          item = new Item.implementation(data.data, { keepId: true, parent: this });
        }
        if ( item ) concentration.items.add(item);
      }
    }
    return concentration;
  }

// documents/actor/actor.mjs: async endConcentration(target); unchanged body (class import names injected above).
export async function nativeSteelEndConcentration(target) {
    let effect;
    const { effects } = this.concentration;

    if ( !target ) {
      return effects.reduce(async (acc, effect) => {
        acc = await acc;
        return acc.concat(await this.endConcentration(effect));
      }, []);
    }

    if ( foundry.utils.getType(target) === "string" ) effect = effects.find(e => e.id === target);
    else if ( target instanceof SteelActiveEffect ) effect = effects.has(target) ? target : null;
    else if ( target instanceof SteelItem ) {
      effect = effects.find(e => {
        const data = e.getFlag("dnd5e", "item") ?? {};
        return (data.id === target._id) || (data.data?._id === target._id);
      });
    }
    if ( !effect ) return [];

    /**
     * A hook that is called before a concentration effect is deleted.
     * @function dnd5e.preEndConcentration
     * @memberof hookEvents
     * @param {Actor5e} actor             The actor ending concentration.
     * @param {SteelActiveEffect} effect     The ActiveEffect that will be deleted.
     * @returns {boolean}                 Explicitly return false to prevent the effect from being deleted.
     */
    if ( Hooks.call("dnd5e.preEndConcentration", this, effect) === false) return [];

    await effect.delete();

    /**
     * A hook that is called after a concentration effect is deleted.
     * @function dnd5e.endConcentration
     * @memberof hookEvents
     * @param {Actor5e} actor             The actor ending concentration.
     * @param {SteelActiveEffect} effect     The ActiveEffect that was deleted.
     */
    Hooks.callAll("dnd5e.endConcentration", this, effect);

    return [effect];
  }

// documents/actor/actor.mjs: async challengeConcentration({ dc=10, ability=null }={}); unchanged body (class import names injected above).
export async function nativeSteelChallenge({ dc=10, ability=null }={}) {
    const isConcentrating = this.concentration.effects.size > 0;
    if ( !isConcentrating ) return null;

    const button = { dc, format: "short", type: "concentration" };
    if ( ability in CONFIG.DND5E.abilities ) button.ability = ability;

    return ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor: this }),
      system: { broadcast: false, buttons: [button] },
      type: "prompt",
      whisper: game.users.filter(user => this.testUserPermission(user, "OWNER"))
    });
  }

// documents/actor/actor.mjs: async promptConcentrationEnd(); unchanged body (class import names injected above).
export async function nativeSteelPrompt() {
    const isConcentrating = this.concentration.effects.size > 0;
    if ( !isConcentrating ) return null;

    return ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor: this }),
      system: { broadcast: false, buttons: [{ type: "endConcentration" }] },
      type: "prompt",
      whisper: game.users.filter(user => this.testUserPermission(user, "OWNER"))
    });
  }

// documents/active-effect.mjs: _shouldPromptConcentrationEnd(); unchanged body (class import names injected above).
export function nativeSteelShouldPrompt() {
    if ( !this.active || !(this.parent instanceof Actor) ) return false;
    if ( dnd5e.settings.disableConcentration || !this.actor.concentration.effects.size ) return false;

    return this.statuses.has("dead") || this.statuses.has("incapacitated");
  }
