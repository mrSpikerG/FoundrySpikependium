/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Source: foundryvtt/dnd5e 87e94dbd9f930135e0694cd7e7d49f210603cd2c.
Exact method bodies; localization/formatting and host services are supplied by tests.
*/
// Exact CastActivity methods from dnd5e 87e94dbd9f930135e0694cd7e7d49f210603cd2c.
export async function nativeGloveCachedSpellData() {
    const originalSpell = await fromUuid(this.spell.uuid);
    if ( !originalSpell ) return;
    return originalSpell.clone({
      effects: [
        ...originalSpell.effects.map(e => e.toObject()),
        {
          _id: this.constructor.ENCHANTMENT_ID,
          type: "enchantment",
          name: _loc("DND5E.CAST.Enchantment.Name"),
          img: "systems/dnd5e/icons/svg/activity/cast.svg",
          system: {
            changes: this.getSpellChanges(),
            origin: {
              activity: this.uuid
            }
          },
          transfer: true
        }
      ],
      flags: {
        dnd5e: {
          cachedFor: this.relativeUUID
        }
      },
      "system.sourceItem": `${this.item.type}:${this.item.identifier}`,
      _stats: { compendiumSource: this.spell.uuid }
    }).toObject();
  }

export function nativeGloveSpellChanges() {
    const changes = [{ key: "system.method", type: "override", value: "spell" }];
    const source = this.toObject();

    // Override spell details
    for ( const type of ["activation", "duration", "range", "target"] ) {
      if ( !this[type].override ) continue;
      const data = source[type];
      delete data.override;
      changes.push({ key: `system.${type}`, type: "override", value: JSON.stringify(data) });
    }

    // Set the casting ability
    if ( this.spell.ability ) changes.push(
      { key: "system.ability", type: "override", value: this.spell.ability }
    );

    // Remove ignored properties
    for ( const property of this.spell.properties ) {
      changes.push({ key: "system.properties", type: "add", value: `-${property}` });
    }

    // Set challenge overrides
    const challenge = this.spell.challenge;
    if ( challenge.override && challenge.attack ) changes.push(
      { key: "activities[attack].attack.bonus", type: "override", value: challenge.attack },
      { key: "activities[attack].attack.flat", type: "override", value: true },
      { key: "activities[summon].flat.attack", type: "override", value: challenge.attack }
    );
    if ( challenge.override && challenge.save ) changes.push(
      { key: "activities[save].save.dc.calculation", type: "override", value: "" },
      { key: "activities[save].save.dc.formula", type: "override", value: challenge.save },
      { key: "activities[summon].flat.save", type: "override", value: challenge.save }
    );

    return changes;
  }

