/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/
// MIT: foundryvtt/dnd5e 87e94dbd9f930135e0694cd7e7d49f210603cd2c; unchanged native method bodies.
export async function nativeSchoolGrantApply(level, {ability,retainedData={},selected,skipExisting=true}={},options={}) {
    if ( options.initial ) {
      ability ??= retainedData.ability ?? this.value.ability ?? this.configuration.spell?.ability?.first();
      selected ??= this.configuration.items?.reduce((arr, { optional, uuid }) => {
        if ( !this.configuration.optional || !optional ) arr.push(uuid);
        return arr;
      }, []) ?? [];
    }
    selected ??= Object.keys(retainedData);

    const added = foundry.utils.getProperty(this, this.storagePath(level)) ?? {};
    if ( ability && (ability !== this.value?.ability) ) {
      for ( const id of Object.keys(added) ) {
        const item = this.actor.items.get(id);
        if ( item?.type === "spell" ) item.updateSource({ "system.ability": ability });
      }
    }

    const items = [];
    const itemUpdates = {};
    const existing = new Set(Object.values(added));
    for ( const uuid of selected ) {
      if ( existing.has(uuid) && skipExisting ) continue;
      let itemData = retainedData.items?.find(i => i.flags?.dnd5e?.sourceId ?? i._stats?.compendiumSource);
      if ( !itemData ) {
        itemData = await this.createItemData(uuid);
        if ( !itemData ) continue;
      }
      if ( itemData.type === "spell" ) this.configuration.spell?.applySpellChanges(itemData, {
        ability: ability ?? this.value?.ability
      });

      items.push(itemData);
      itemUpdates[itemData._id] = uuid;
      options.firstCreatedItem ??= itemData._id;
    }

    const updates = {};
    if ( ability ) updates["value.ability"] = ability;
    if ( items.length ) {
      this.actor.updateSource({ items });
      updates[this.storagePath(level)] = itemUpdates;
    }
    this.updateSource(updates);

    return updates;
}
export async function nativeSchoolCreateItemData(uuid,id) {
    const source = await fromUuid(uuid);
    if ( !source ) return null;
    const { _stats } = game.items.fromCompendium(source);
    const advancementOrigin = `${this.item.id}.${this.id}`;
    return source.clone({
      _stats,
      _id: id ?? foundry.utils.randomID(),
      "flags.dnd5e.sourceId": uuid,
      "flags.dnd5e.advancementOrigin": advancementOrigin,
      "flags.dnd5e.advancementRoot": this.item.getFlag("dnd5e", "advancementRoot") ?? advancementOrigin
    }, { keepId: true }).toObject();
}
export function nativeSchoolSpellChanges(itemData,{ability}={}) {
    ability = this.ability.size ? this.ability.has(ability) ? ability : this.ability.first() : null;
    if ( ability ) foundry.utils.setProperty(itemData, "system.ability", ability);

    if ( this.method ) {
      foundry.utils.setProperty(itemData, "system.method", this.method);
      foundry.utils.setProperty(itemData, "system.prepared", this.prepared);
    }

    // Set spell source based on the item identifier.
    if ( this.item ) foundry.utils.setProperty(itemData, "system.sourceItem", `${this.item.type}:${this.item.identifier}`);

    if ( this.uses.max && this.uses.per ) {
      foundry.utils.setProperty(itemData, "system.uses.max", this.uses.max);
      itemData.system.uses.recovery ??= [];
      itemData.system.uses.recovery.push({ period: this.uses.per, type: "recoverAll" });

      const spellcasting = CONFIG.DND5E.spellcasting[itemData.system.method];
      const createForwardActivity = !this.uses.requireSlot && spellcasting?.slots;

      for ( const activity of Object.values(itemData.system.activities ?? {}) ) {
        if ( !activity.consumption?.spellSlot ) continue;

        // Create a forward activity
        if ( createForwardActivity ) {
          const newActivity = {
            _id: foundry.utils.randomID(),
            type: "forward",
            name: `${activity.name ?? _loc(
              CONFIG.DND5E.activityTypes[activity.type]?.documentClass.metadata.title
            )} (${_loc("DND5E.ADVANCEMENT.SPELLCONFIG.FreeCasting").toLowerCase()})`,
            sort: (activity.sort ?? 0) + 1,
            activity: {
              id: activity._id
            },
            consumption: {
              targets: [{ type: "itemUses", target: "", value: "1" }]
            }
          };
          foundry.utils.setProperty(itemData, `system.activities.${newActivity._id}`, newActivity);
        }

        // Modify existing activity
        else {
          const activityData = foundry.utils.deepClone(activity);
          activityData.consumption.targets ??= [];
          activityData.consumption.targets.push({ type: "itemUses", target: "", value: "1" });
          foundry.utils.setProperty(itemData, `system.activities.${activityData._id}`, activityData);
        }
      }
    }
}
