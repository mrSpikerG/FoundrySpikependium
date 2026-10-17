/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Source: foundryvtt/dnd5e 87e94dbd9f930135e0694cd7e7d49f210603cd2c.
Exact method bodies; localization/formatting and host services are supplied by tests.
*/

// Exact forNewItem from module/applications/advancement/advancement-manager.mjs.
export function nativeExpertForNewItem(actor, itemData, options={}) {
    const manager = new this(actor, options);

    // Prepare data for adding to clone
    const dataClone = foundry.utils.deepClone(itemData);
    dataClone._id = foundry.utils.randomID();
    if ( itemData.type === "class" ) {
      dataClone.system.levels = 0;
      if ( !manager.clone.system.details.originalClass ) {
        manager.clone.updateSource({ "system.details.originalClass": dataClone._id });
      }
    }

    // Add item to clone & get new instance from clone
    manager.clone.updateSource({ items: [dataClone] });
    const clonedItem = manager.clone.items.get(dataClone._id);

    // For class items, prepare level change data
    if ( itemData.type === "class" ) {
      return manager.createLevelChangeSteps(clonedItem, itemData.system?.levels ?? 1);
    }

    // All other items, just create some flows up to current character level (or class level for subclasses)
    Array.fromRange(this.currentLevel(clonedItem, manager.clone) + 1)
      .flatMap(l => this.flowsForLevel(clonedItem, l))
      .forEach(flow => manager.steps.push({ type: "forward", flow }));

    // Ensure the final level is indicated to ensure any synthetic steps end up at correct level
    if ( actor.system.details.level > 0 ) manager.steps.push({
      type: "forward", automatic: true, level: actor.system.details.level
    });

    return manager;
  }
// Exact _onDropSingleItem from module/applications/actor/api/base-actor-sheet.mjs; only its imported manager is injected.
export function nativeExpertDrop(AdvancementManager){return async function(event, itemData, { compendiumUuid, container=null }={}) {
    const actor = this.inventorySource;

    // Check to make sure items of this type are allowed on this actor
    if ( this.constructor.unsupportedItemTypes.has(itemData.type) ) {
      ui.notifications.warn("DND5E.ACTOR.Warning.InvalidItem", {
        format: {
          itemType: _loc(CONFIG.Item.typeLabels[itemData.type]),
          actorType: _loc(CONFIG.Actor.typeLabels[actor.type])
        }
      });
      return false;
    }

    // Create a Consumable spell scroll on the Inventory tab
    if ( (itemData.type === "spell")
      && ((this.tabGroups.primary === "inventory") || (actor.type === "vehicle")) ) {
      const scroll = compendiumUuid
        ? await Item5e.createScrollFromCompendiumSpell(compendiumUuid)
        : await Item5e.createScrollFromSpell(itemData);
      return scroll?.toObject?.() ?? false;
    }

    // Clean up data
    this._onDropResetData(event, itemData);

    // Stack identical consumables
    const stacked = this._onDropStackConsumables(event, itemData, { container });
    if ( stacked ) return false;

    // Bypass normal creation flow for any items with advancement
    if ( actor.system.metadata?.supportsAdvancement && !foundry.utils.isEmpty(itemData.system.advancement)
        && !game.settings.get("dnd5e", "disableAdvancements") ) {
      // Ensure that this item isn't violating the singleton rule
      const dataModel = CONFIG.Item.dataModels[itemData.type];
      const singleton = dataModel?.metadata.singleton ?? false;
      if ( singleton && actor.itemTypes[itemData.type].length ) {
        ui.notifications.error("DND5E.ACTOR.Warning.Singleton", {
          format: {
            itemType: _loc(CONFIG.Item.typeLabels[itemData.type]),
            actorType: _loc(CONFIG.Actor.typeLabels[actor.type])
          }
        });
        return false;
      }

      const manager = AdvancementManager.forNewItem(actor, itemData);
      if ( manager.steps.length ) {
        manager.render(true);
        return false;
      }
    }

    // Let specific item types apply any changes from a drop event
    CONFIG.Item.dataModels[itemData.type]?.onDropCreate?.(event, actor, itemData);

    return itemData;
  };}
