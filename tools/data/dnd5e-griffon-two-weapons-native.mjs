/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Source: foundryvtt/dnd5e 87e94dbd9f930135e0694cd7e7d49f210603cd2c.
Exact method bodies; localization/formatting and host services are supplied by tests.
*/
// foundryvtt/dnd5e, commit 87e94dbd9f930135e0694cd7e7d49f210603cd2c.
// Native usage scaling body unchanged; DamageRoll.fromConfig injects the superclass call.
    export async function nativeTwoWeaponScaling(usageConfig, messageConfig, item) {
      const levelingFlag = this.item.getFlag("dnd5e", "spellLevel");
      if ( levelingFlag ) {
        usageConfig.scaling = Math.max(0, levelingFlag.value - levelingFlag.base);
      } else if ( this.isSpell ) {
        const level = this.actor.system.spells?.[usageConfig.spell?.slot]?.level;
        if ( level ) usageConfig.scaling = level - item.system.level;
      }

      if ( usageConfig.scaling ) {
        foundry.utils.setProperty(messageConfig, "data.system.scaling", usageConfig.scaling);
        if ( usageConfig.scaling !== item.flags.dnd5e?.scaling ) {
          item.actor._embeddedPreparation = true;
          item.updateSource({ "flags.dnd5e.scaling": usageConfig.scaling });
          delete item.actor._embeddedPreparation;
          item.prepareFinalAttributes();
        }
      }
    }
  export function nativeTwoWeaponDamageConfig(config, process, parentFromConfig) {
    if ( process.critical ) {
      config = foundry.utils.deepClone(config);
      config.options ??= {};
      config.options.critical = foundry.utils.mergeObject(
        process.critical, config.options.critical ?? {}, { inplace: false }
      );
    }
    return parentFromConfig(config, process);
  }
