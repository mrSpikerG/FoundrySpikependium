/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Source: foundryvtt/dnd5e 87e94dbd9f930135e0694cd7e7d49f210603cd2c.
Exact method bodies; localization/formatting and host services are supplied by tests.
*/
// Exact method bodies from pinned dnd5e 6.0.6; only host services are injected.
let DamageData;
export function setAlchemistNativeContext(context) { ({ DamageData } = context); }
const _loc = key => key;
const formatNumber = value => String(value);

// module/documents/active/effect.mjs
export async function nativeAlchemistForApplication(changes, origin, target) {
    const oData = origin?.getRollData() ?? {};
    const tData = target?.getRollData() ?? {};

    changes = foundry.utils.deepClone(changes ?? []);
    for ( const change of changes ) {
      // TODO: Evaluate properties in objects, as this may be valid json.
      if ( typeof change.value !== "string" ) continue;

      // TODO: Evaluate dice formulas.
      switch ( change.replacement ) {
        case "origin":
          change.value = Roll.replaceFormulaData(change.value, oData);
          break;
        case "target":
          change.value = Roll.replaceFormulaData(change.value, tData);
          break;
      }
    }

    return changes;
  }

// module/data/active/effect/enchantment.mjs
export function nativeAlchemistLegacyEnchantment(item, change, changes) {
    const applyField = (model, c) => ActiveEffect.implementation.applyChangeField(model, c);
    let key = change.key.replace("system.", "");
    switch ( change.key ) {
      case "system.ability":
        for ( const activity of item.system.activities?.getByTypes("attack") ?? [] ) {
          changes[`system.activities.${activity.id}.attack.abilities`] = applyField(
            activity, { ...change, key: "attack.abilities" }
          );
        }
        return false;
      case "system.attack.bonus":
      case "system.attack.flat":
        for ( const activity of item.system.activities?.getByTypes("attack") ?? [] ) {
          changes[`system.activities.${activity.id}.${key}`] = applyField(
            activity, { ...change, key }
          );
        }
        return false;
      case "system.damageBonus":
        change.key = "system.damage.bonus";
        break;
      case "system.damage.parts":
        try {
          let damage;
          const parsed = typeof change.value === "string" ? JSON.parse(change.value) : change.value;
          if ( foundry.utils.getType(parsed) === "Object" ) damage = new DamageData(parsed);
          else damage = new DamageData({ custom: { enabled: true, formula: parsed[0][0] }, types: [parsed[0][1]] });
          for ( const activity of item.system.activities?.getByTypes("attack", "damage", "save") ?? [] ) {
            const value = damage.clone();
            value.enchantment = true;
            value.locked = true;
            changes[`system.activities.${activity.id}.damage.parts`] = applyField(
              activity, { ...change, key, value }
            );
          }
          for ( const activity of item.system.activities?.getByTypes("heal") ?? [] ) {
            const value = damage.formula;
            const keyPath = `healing.${activity.healing.custom.enabled ? "custom.formula" : "bonus"}`;
            changes[`system.activities.${activity.id}.${keyPath}`] = applyField(
              activity, { ...change, key: keyPath, value }
            );
          }
        } catch {}
        return false;
      case "system.damage.types":
        const adjust = (damage, keyPath) =>
          applyField(damage, { ...change, key: "types", value: change.value });
        if ( item.system.damage?.base ) {
          changes["system.damage.base.types"] = adjust(item.system.damage.base, "system.damage.base");
        }
        for ( const activity of item.system.activities?.getByTypes("attack", "damage", "save") ?? [] ) {
          for ( const part of activity.damage.parts ) adjust(part);
          changes[`system.activities.${activity.id}.damage.parts`] = activity.damage.parts;
        }
        return false;
      case "system.save.dc":
      case "system.save.scaling":
        let value = change.value;
        if ( key === "save.dc" ) key = "save.dc.formula";
        else {
          key = "save.dc.calculation";
          if ( value === "flat" ) value = "";
          else if ( (value === "") && (item.type === "spell") ) value = "spellcasting";
        }
        for ( const activity of item.system.activities?.getByTypes("save") ?? [] ) {
          changes[`system.activities.${activity.id}.${key}`] = applyField(
            activity, { ...change, key, value }
          );
        }
        return false;
    }
  }

// module/data/item/feat.mjs
export function nativeAlchemistPrerequisites(context={}, _options={}) {
    if ( context instanceof Actor ) {
      foundry.utils.logCompatibilityWarning(
        "`FeatData#validatePrerequisites` has been renamed `assertPrerequisites`.",
        { since: "DnD5e 6.0", until: "DnD5e 7.0" }
      );
      return this.assertPrerequisites(context, _options);
    }

    const { actor, added=[], level=actor?.system?.details?.level } = context;
    const prerequisites = new Map();
    const legacy = (this.source.rules === "2014") || (dnd5e.settings.rulesVersion === "legacy") ? "Legacy" : "";

    // If a feature has a level pre-requisite, make sure it is less than or equal to current level
    if ( Number.isFinite(this.prerequisites.level) ) prerequisites.set("level", {
      label: _loc(`DND5E.Prerequisites.FIELDS.prerequisites.level.display${legacy}`, {
        level: formatNumber(this.prerequisites.level),
        levelOrdinal: formatNumber(this.prerequisites.level, { ordinal: true })
      }),
      quiet: true,
      valid: Number.isFinite(level) ? level >= this.prerequisites.level : null
    });

    // If a feature has item pre-requisites, make sure the other items exist on the actor
    if ( this.prerequisites.items.size ) prerequisites.set("items", {
      label: _loc("DND5E.Prerequisites.FIELDS.prerequisites.items.display", {
        items: game.i18n.getListFormatter({ type: "disjunction" }).format(
          Array.from(this.prerequisites.items).map(i => dnd5e.registry.items.get(i)?.name ?? i)
        )
      }),
      valid: actor ? Array.from(this.prerequisites.items).some(i => actor.identifiedItems.get(i)?.size) : null
    });

    // Check to ensure the item doesn't already exist on actor if it is not repeatable
    if ( actor && !this.prerequisites.repeatable && actor.sourcedItems?.get(this.parent.uuid)?.size
      && !added.find(a => a.uuid === this.parent.uuid) ) prerequisites.set("repeatable", {
      label: _loc("DND5E.Prerequisites.FIELDS.prerequisites.repeatable.display"),
      valid: false
    });

    return prerequisites;
  }
