/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
// MIT: foundryvtt/dnd5e 87e94dbd9f930135e0694cd7e7d49f210603cd2c; only superclass sorting delegation is supplied by the test host.
const _loc = key => key, staticID = key => key.slice(0,16), simplifyBonus = value => Number(value);
export async function nativeSummonChanges(actor, profile, options) {
    const actorUpdates = { effects: [], items: [] };
    const tokenUpdates = {};
    const rollData = { ...this.getRollData(), summon: actor.getRollData() };
    const prof = rollData.attributes?.prof ?? 0;

    // Add flags
    actorUpdates["flags.dnd5e.summon"] = {
      level: this.relevantLevel,
      mod: rollData.mod,
      origin: this.item.uuid,
      activity: this.id,
      profile: profile._id
    };

    // Match proficiency
    if ( this.match.proficiency ) {
      const proficiencyEffect = new ActiveEffect({
        _id: staticID("dnd5eMatchProficiency"),
        changes: [{
          key: "system.attributes.prof",
          type: "override",
          value: prof
        }],
        disabled: false,
        icon: "icons/skills/targeting/crosshair-bars-yellow.webp",
        name: _loc("DND5E.SUMMON.FIELDS.match.proficiency.label")
      });
      actorUpdates.effects.push(proficiencyEffect.toObject());
    }

    // Match disposition
    if ( this.match.disposition && this.actor ) {
      const { disposition } = this.actor.isToken ? this.actor.token : this.actor.prototypeToken;
      tokenUpdates.disposition = disposition;
    }

    // Add bonus to AC
    if ( this.bonuses.ac ) {
      const acBonus = new Roll(this.bonuses.ac, rollData);
      await acBonus.evaluate();
      if ( acBonus.total ) {
        if ( actor.system.attributes.ac.calc === "flat" ) {
          actorUpdates["system.attributes.ac.flat"] = (actor.system.attributes.ac.flat ?? 0) + acBonus.total;
        } else {
          actorUpdates.effects.push((new ActiveEffect({
            _id: staticID("dnd5eACBonus"),
            changes: [{
              key: "system.attributes.ac.bonus",
              type: "add",
              value: acBonus.total
            }],
            disabled: false,
            icon: "icons/magic/defensive/shield-barrier-blue.webp",
            name: _loc("DND5E.SUMMON.FIELDS.bonuses.ac.label")
          })).toObject());
        }
      }
    }

    // Add bonus to HD
    if ( this.bonuses.hd && actor.system.isNPC ) {
      const hdBonus = new Roll(this.bonuses.hd, rollData);
      await hdBonus.evaluate();
      if ( hdBonus.total ) {
        actorUpdates.effects.push((new ActiveEffect({
          _id: staticID("dnd5eHDBonus"),
          changes: [{
            key: "system.attributes.hd.max",
            type: "add",
            value: hdBonus.total
          }],
          disabled: false,
          icon: "icons/sundries/gaming/dice-runed-brown.webp",
          name: _loc("DND5E.SUMMON.FIELDS.bonuses.hd.label")
        })).toObject());
      }
    }

    // Add bonus to HP
    if ( this.bonuses.hp ) {
      const hpBonus = new Roll(this.bonuses.hp, rollData);
      await hpBonus.evaluate();

      // If non-zero hp bonus, apply as needed for this actor.
      // Note: Only unlinked actors will have their current HP set to their new max HP
      if ( hpBonus.total ) {

        // Helper function for modifying max HP ('bonuses.overall' or 'max')
        const maxHpEffect = hpField => {
          return (new ActiveEffect({
            _id: staticID("dnd5eHPBonus"),
            changes: [{
              key: `system.attributes.hp.${hpField}`,
              type: "add",
              value: hpBonus.total
            }],
            disabled: false,
            icon: "icons/magic/life/heart-glowing-red.webp",
            name: _loc("DND5E.SUMMON.FIELDS.bonuses.hp.label")
          })).toObject();
        };

        if ( !foundry.utils.isEmpty(actor.classes) && !actor._source.system.attributes.hp.max ) {
          // Actor has classes without a hard-coded max -- apply bonuses to 'overall'
          actorUpdates.effects.push(maxHpEffect("bonuses.overall"));
        } else if ( actor.prototypeToken.actorLink ) {
          // Otherwise, linked actors boost HP via 'max' AE
          actorUpdates.effects.push(maxHpEffect("max"));
        } else {
          // Unlinked actors assumed to always be "fresh" copies with bonus HP added to both
          // Max HP and Current HP
          actorUpdates["system.attributes.hp.max"] = actor.system.attributes.hp.max + hpBonus.total;
          actorUpdates["system.attributes.hp.value"] = actor.system.attributes.hp.value + hpBonus.total;
        }
      }
    }

    // Add temp HP
    if ( this.tempHP ) {
      const tempHP = new Roll(this.tempHP, rollData);
      await tempHP.evaluate();
      actorUpdates["system.attributes.hp.temp"] = tempHP.total;
    }

    // Change creature size
    if ( this.creatureSizes.size ) {
      const size = this.creatureSizes.has(options.creatureSize) ? options.creatureSize : this.creatureSizes.first();
      const config = CONFIG.DND5E.actorSizes[size];
      if ( config ) {
        actorUpdates["system.traits.size"] = size;
        tokenUpdates.width = config.token ?? 1;
        tokenUpdates.height = config.token ?? 1;
      }
    }

    // Change creature type
    if ( this.creatureTypes.size ) {
      const type = this.creatureTypes.has(options.creatureType) ? options.creatureType : this.creatureTypes.first();
      if ( actor.system.details?.race instanceof Item ) {
        actorUpdates.items.push({ _id: actor.system.details.race.id, "system.type.value": type });
      } else {
        actorUpdates["system.details.type.value"] = type;
      }
    }

    const attackDamageBonus = CONFIG.Dice.BasicRoll.replaceFormulaData(this.bonuses.attackDamage ?? "", rollData);
    const saveDamageBonus = CONFIG.Dice.BasicRoll.replaceFormulaData(this.bonuses.saveDamage ?? "", rollData);
    const healingBonus = CONFIG.Dice.BasicRoll.replaceFormulaData(this.bonuses.healing ?? "", rollData);
    for ( const item of actor.items ) {
      if ( !item.system.activities?.size ) continue;
      const changes = [];

      // Match attacks
      if ( this.match.attacks && item.system.hasAttack ) {
        let attack = this.flat?.attack;
        if ( (attack === undefined) || (attack === null) ) {
          const actionType = item.system.activities.getByType("attack")[0].actionType;
          const typeMapping = { mwak: "msak", rwak: "rsak" };
          const parts = [
            rollData.abilities?.[this.ability]?.mod,
            prof,
            CONFIG.Dice.BasicRoll.replaceFormulaData(
              rollData.rolls?.attack?.[typeMapping[actionType] ?? actionType]?.bonus ?? "", rollData
            )
          ].filter(p => p);
          attack = parts.join(" + ");
        }
        changes.push({
          key: "activities[attack].attack.bonus",
          type: "override",
          value: attack
        }, {
          key: "activities[attack].attack.flat",
          type: "override",
          value: true
        });
      }

      // Match saves
      if ( this.match.saves && item.hasSave ) {
        changes.push({
          key: "activities[save].save.dc.formula",
          type: "override",
          value: this.flat?.save ?? rollData.abilities?.[this.ability]?.dc ?? rollData.attributes.spell.dc
        }, {
          key: "activities[save].save.dc.calculation",
          type: "override",
          value: ""
        });
      }

      // Damage bonus
      let damageBonus;
      if ( item.hasAttack ) damageBonus = attackDamageBonus;
      else if ( item.hasSave ) damageBonus = saveDamageBonus;
      else if ( item.isHealing ) damageBonus = healingBonus;
      if ( damageBonus && item.system.activities.find(a => a.damage?.parts?.length || a.healing?.formula) ) {
        changes.push({
          key: "system.damage.bonus",
          type: "add",
          value: damageBonus
        });
      }

      if ( changes.length ) {
        const effect = (new ActiveEffect({
          _id: staticID("dnd5eItemChanges"),
          disabled: false,
          icon: "icons/skills/melee/strike-slashes-orange.webp",
          name: _loc("DND5E.SUMMON.ItemChanges.Label"),
          system: {
            changes,
            origin: { activity: this.uuid }
          },
          type: "enchantment",
          transfer: true
        })).toObject();
        actorUpdates.items.push({ _id: item.id, effects: [effect, ...item.effects.map(e => e.toObject())] });
      }
    }

    // Add applied effects
    actorUpdates.effects.push(...(await this.getApplicableEffects()).map(e => e.toObject()));

    return { actorUpdates, tokenUpdates };
  }
export function nativeBaseDamagePart(damage, rollConfig, rollData, index=0, { formulaOptions, rules }={}) {
    const scaledFormula = damage.scaledFormula(rollConfig.scaling ?? rollData.scaling, formulaOptions);
    const parts = scaledFormula ? [scaledFormula] : [];
    const lastType = this.item.getFlag("dnd5e", `last.${this.id}.damageType.${index}`);
    // Fall back to the item's base damage type when this part specifies none (e.g. weapon/ammo base damage).
    let { types } = damage;
    if ( !types.size && this.item.system.offersBaseDamage && (this.constructor.damageRuleCategory !== "healing") ) {
      types = this.item.system.damage.base.types;
    }
    const data = { ...rollData, roll: foundry.utils.deepClone(rollData.roll ?? {}) };
    data.roll.damage ??= {};
    data.roll.damage.type = (types.has(lastType) ? lastType : null) ?? types.first();

    if ( index === 0 ) {
      const actionType = this.getActionType(rollConfig.attackMode);
      const bonus = foundry.utils.getProperty(this.actor ?? {}, `system.rolls.damage.${actionType}.bonus`);
      if ( bonus && !/^0+$/.test(bonus) ) parts.push(bonus);
      if ( this.item.system.damage?.bonus ) parts.push(String(this.item.system.damage.bonus));
    }

    if ( rules ) {
      const ruleBonus = AppliedRules.createIterator(rules.bonus)
        .filterWith(data, { consumed: rules.consumed })
        .toFormula();
      if ( ruleBonus ) {
        data.ruleBonus = ruleBonus;
        parts.push("@ruleBonus");
      }
    }

    return {
      data, parts,
      options: {
        type: data.roll.damage.type,
        types: Array.from(types),
        properties: data.roll.properties
      }
    };
  }
export function nativeSortCombatants(a, b) {
    // Initiative takes top priority
    if ( a.initiative !== b.initiative ) return this.baseSort(a, b);

    // Separate out combatants with different base actors
    if ( !a.token?.baseActor || !b.token?.baseActor || (a.token?.baseActor !== b.token?.baseActor) ) {
      const name = c => `${c.token?.baseActor?.name ?? ""}.${c.token?.baseActor?.id ?? ""}`;
      return name(a).localeCompare(name(b), game.i18n.lang);
    }

    // Otherwise sort based on combatant name
    return a.name.localeCompare(b.name, game.i18n.lang);
  }
