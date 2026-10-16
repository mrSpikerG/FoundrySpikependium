/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Source: foundryvtt/dnd5e 87e94dbd9f930135e0694cd7e7d49f210603cd2c.
Exact method bodies; localization/formatting and host services are supplied by tests.
*/
// Exact CreatureTemplate.prepareSkill from foundryvtt/dnd5e 87e94dbd9f930135e0694cd7e7d49f210603cd2c, module/data/actor/templates/creature.mjs.
// Host rule/proficiency services are supplied by tests.
export function nativeCloakSkill(skillId, {
    skillData, rollData, originalSkills, globalBonuses,
    globalCheckBonus, globalSkillBonus, ability
  }={}) {
    const flags = this.parent.flags.dnd5e ?? {};

    skillData ??= foundry.utils.deepClone(this.skills[skillId]);
    rollData ??= this.parent.getRollData();
    originalSkills ??= flags.originalActor ? game.actors?.get(flags.originalActor)?.system?.skills : null;
    globalBonuses ??= this.rolls.ability ?? {};
    globalCheckBonus ??= simplifyBonus(globalBonuses.check?.bonus, rollData);
    globalSkillBonus ??= simplifyBonus(globalBonuses.skill?.bonus, rollData);
    ability ??= skillData.ability;
    const abilityData = this.abilities[ability];
    skillData.ability = ability;
    const originalSkill = originalSkills?.[skillId];
    if ( originalSkill?.value >= 1 ) {
      skillData.merged = true;
      skillData.value = originalSkill?.value;
    }

    // Compute proficiency
    const calculatedProf = this.calculateAbilityCheckProficiency(
      skillData.value, skillData.ability, { skill: skillId }
    );
    skillData.prof = originalSkill?.prof?.multiplier > calculatedProf.multiplier
      ? originalSkill.prof.clone() : calculatedProf;

    // Complete roll data
    rollData = { ...rollData };
    rollData.roll = { ability, proficient: skillData.prof.multiplier >= 1, skill: skillId, type: "skill" };

    // Compute modifier
    const checkBonusAbl = simplifyBonus(abilityData?.check?.roll?.bonus, rollData);
    skillData.effectValue = skillData.value;
    const baseBonus = simplifyBonus(skillData.roll?.bonus, rollData);
    const ruleBonus = simplifyBonus(
      AppliedRules.collect("check:bonus", this.parent).filterWith(rollData).toFormula(), rollData
    );
    skillData.bonus = baseBonus + globalCheckBonus + checkBonusAbl + globalSkillBonus + ruleBonus;
    skillData.mod = abilityData?.mod ?? 0;
    skillData.value = skillData.proficient = skillData.prof.multiplier;
    skillData.total = skillData.mod + skillData.bonus + this.parent.conditionRollReduction;
    if ( Number.isNumeric(skillData.prof.term) ) skillData.total += skillData.prof.flat;

    // If we merged skills when transforming, take the highest bonus
    const difference = (originalSkill?.total ?? 0) - skillData.total;
    if ( originalSkill && (difference > 0) ) {
      skillData.roll.bonus = `${skillData.roll.bonus ?? ""} + ${difference}`;
      skillData.bonus += difference;
      skillData.total += difference;
    }

    const isLegacy = dnd5e.settings.rulesVersion === "legacy";
    if ( flags.remarkableAthlete
      && CONFIG.DND5E.characterFlags.remarkableAthlete.skills.includes(skillId) && !isLegacy ) {
      AdvantageModeField.setMode(this, `skills.${skillId}.roll.mode`, 1);
    }

    // Compute passive bonus
    const passive = flags.observantFeat && CONFIG.DND5E.characterFlags.observantFeat.skills.includes(skillId) ? 5 : 0;
    const passiveBonus = simplifyBonus(skillData.bonuses?.passive, rollData);
    const advantageMode = AdvantageModeField.combineFields(this, [
      `abilities.${ability}.check.roll.mode`, `skills.${skillId}.roll.mode`,
      "rolls.ability.check.mode", "rolls.ability.skill.mode"
    ], AppliedRules.collect("check:advantage", this.parent).filterWith(rollData).toAdvantageCounts())?.mode ?? 0;
    skillData.passive = CONFIG.DND5E.skillPassive.base + skillData.mod + skillData.bonus + skillData.prof.flat
      + passive + passiveBonus + (advantageMode * CONFIG.DND5E.skillPassive.modifier)
      + this.parent.conditionRollReduction;

    return skillData;
  }

