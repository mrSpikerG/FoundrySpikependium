/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Source: foundryvtt/dnd5e 87e94dbd9f930135e0694cd7e7d49f210603cd2c.
Exact method bodies; localization/formatting and host services are supplied by tests.
*/

// The build-time deletion marker and host document services are supplied by tests.
export const _del = Symbol("delete");

export class NativeAlchemistASI {
  async apply(level, data, options={}) {
    const value = { type: data.type ?? this.value.type };
    if ( value.type && (data.type !== value.type) ) await this.reverse(level);

    if ( options.initial ) {
      if ( Object.values(this.configuration.fixed).some(v => v) ) {
        data.assignments = this.toObject().configuration.fixed;
      }
      if ( data.assignments || !this.allowFeat ) value.type = "asi";
      else value.type = null;
    }

    if ( (value.type === "asi") && !foundry.utils.isEmpty(data.assignments) ) {
      const updates = {};
      value.assignments = {};
      for ( let [key, delta] of Object.entries(data.assignments) ) {
        const ability = this.actor.system.abilities[key];
        const source = this.actor.system._source.abilities[key] ?? {};
        if ( !ability || !this.canImprove(key) ) continue;
        const max = Math.max(ability.max, this.configuration.max ?? -Infinity);
        delta = Math.min(delta, max - source.value);
        if ( delta ) {
          updates[`system.abilities.${key}.value`] = source.value + delta;
          value.assignments[key] = (this.value.assignments?.[key] ?? 0) + delta;
        }
      }
      if ( foundry.utils.isEmpty(value.assignments) ) delete value.assignments;
      this.actor.updateSource(updates);
    }

    else if ( (value.type === "feat") && data.uuid ) {
      if ( this.actor.items.get(Object.keys(this.value.feat ?? {})[0]) ) await this.reverse(this.level);

      let itemData = data.retainedItems?.[data.uuid];
      if ( !itemData ) itemData = await this.createItemData(data.uuid);
      if ( itemData ) {
        value.feat = { [itemData._id]: data.uuid };
        this.actor.updateSource({ items: [itemData] });
      }
    }

    this.updateSource({ value });
  }

  reverse(level, options={}) {
    const source = this.value.toObject();

    if ( this.value.type === "asi" ) {
      const updates = {};
      for ( const [key, change] of Object.entries(this.value.assignments ?? {}) ) {
        const ability = this.actor.system.toObject().abilities[key];
        if ( !ability || !this.canImprove(key) ) continue;
        updates[`system.abilities.${key}.value`] = ability.value - change;
      }
      this.actor.updateSource(updates);
    }

    else {
      const [id, uuid] = Object.entries(this.value.feat ?? {})[0] ?? [];
      const item = this.actor.items.get(id);
      if ( item ) source.retainedItems = { [uuid]: item.toObject() };
      this.actor.items.delete(id);
      this.actor.reset();
    }

    this.updateSource({
      value: { assignments: null, feat: null, type: null }
    });
    return source;
  }
}

export class NativeAlchemistGrant {
  async apply(level, { ability, retainedData={}, selected, skipExisting=true }={}, options={}) {
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

  reverse(level, options={}) {
    const keyPath = this.storagePath(level);
    const added = foundry.utils.getProperty(this.toObject(), keyPath) ?? {};
    let ids = options.uuid ? [Object.entries(added).find(([, v]) => v === options.uuid)?.[0]]
      : Object.keys(added);
    if ( !ids.length ) return;

    const items = [];
    for ( const id of ids ) {
      const item = this.actor.items.get(id);
      if ( item ) {
        items.push(item.toObject());
        items[item.flags.dnd5e?.sourceId ?? item._stats.compendiumSource ?? item.uuid] = item.toObject();
      }
      this.actor.items.delete(id);
      added[id] = _del;
    }

    this.actor.reset();
    if ( options.uuid ) this.updateSource({ [keyPath]: added });
    else this.updateSource({ [keyPath]: _del });
    return { ability: this.value?.ability, items };
  }

  storagePath(level) {
    return "value.added";
  }
}

export class NativeAlchemistChoice extends NativeAlchemistGrant {
  getCounts(level) {
    const current = Object.keys(this.value.added[level] ?? {}).length;
    const replacement = !!this.configuration.choices[level]?.replacement && !!this.value.replaced[level];
    const max = (this.configuration.choices[level]?.count ?? 0) + (replacement ? 1 : 0);
    return {
      current, max, replacement,
      full: current >= max
    };
  }

  storagePath(level) {
    return `value.added.${level}`;
  }

  async apply(level, { previousItems, replace: original, retainedData={}, ...data }, options={}) {
    let replacement;
    if ( retainedData.replaced ) ({ original, replacement } = retainedData.replaced);

    await super.apply(level, { ...data, retainedData, skipExisting: false }, options);

    if ( original ) {
      const replaced = this.value.replaced[level] ?? {};
      await this._restoreReplacedItem(replaced.level, replaced.original, previousItems ?? retainedData.items);
      const replacedLevel = Object.entries(this.value.added).reverse().reduce((level, [l, v]) => {
        if ( (original in v) && (Number(l) > level) ) return Number(l);
        return level;
      }, -Infinity);
      if ( Number.isFinite(replacedLevel) ) {
        this.actor.items.delete(original);
        this.actor.reset();
        this.updateSource({ [`value.replaced.${level}`]: { level: replacedLevel, original } });
      }
    }

    const replaced = this.value.replaced[level];
    if ( replaced && !replaced.replacement ) replacement ??= options.firstCreatedItem
      ?? (this.getCounts(level).full ? Object.keys(this.value.added[level] ?? {})[0] : undefined);
    if ( replacement ) this.updateSource({ [`value.replaced.${level}`]: { replacement } });

    await this._evaluatePrerequisites(level, { showMessage: true });
  }

  async reverse(level, { clearReplacement, previousItems, retainedData={}, skipEvaluation, ...options }={}) {
    const replaced = this.value.replaced[level];
    const restoreReplacedItem = replaced && (clearReplacement || foundry.utils.isEmpty(options));
    const uuid = this.value.added[level]?.[replaced?.replacement];
    const uuidIsReplacement = uuid === options.uuid;

    const counts = this.getCounts(level);
    if ( clearReplacement && counts.full ) {
      if ( uuid ) retainedData = (await super.reverse(level, { uuid })) ?? {};
    } else if ( !clearReplacement ) {
      retainedData = (await super.reverse(level, options)) ?? {};
    }

    if ( restoreReplacedItem ) {
      retainedData.replaced = replaced;
      await this._restoreReplacedItem(replaced.level, replaced.original, previousItems ?? retainedData.items);
    }

    if ( replaced && foundry.utils.isEmpty(options) ) {
      this.updateSource({ [`value.replaced.${level}`]: _del });
    } else if ( replaced && uuidIsReplacement ) {
      retainedData.replaced ??= replaced;
      this.updateSource({ [`value.replaced.${level}.replacement`]: _del });
    }

    if ( !skipEvaluation ) await this._evaluatePrerequisites(level);

    return retainedData;
  }

  async _evaluatePrerequisites(level, { showMessage=false }={}) {
    const added = Object.values(this.value.added[level] ?? {}).map(uuid => fromUuidSync(uuid));
    const replaced = this.actor.items.get(this.value.replaced[level]?.original);
    const removed = replaced ? [replaced] : [];

    for ( let i = 0; i < 100; i++ ) {
      const itemsBefore = Object.keys(this.value.added[level] ?? {}).length;
      for ( const [id, uuid] of Object.entries(this.value.added[level] ?? {}) ) {
        const item = this.actor.items.get(id);
        if ( !item ) continue;
        const isValid = item.system.assertPrerequisites?.(this.actor, {
          added, removed, level: level || this.actor.system.details?.level, showMessage
        }) ?? true;
        if ( isValid !== true ) await this.reverse(level, { skipEvaluation: true, uuid });
      }
      if ( itemsBefore === Object.keys(this.value.added[level] ?? {}).length ) break;
    }
  }

  async _restoreReplacedItem(level, originalId, retainedItems={}) {
    const uuid = this.value.added[level]?.[originalId];
    const itemData = (Array.isArray(retainedItems) ? retainedItems.find(i => i._id === originalId)
      : retainedItems[level]?.[originalId]?.toObject()) ?? await this.createItemData(uuid, originalId);
    if ( itemData ) {
      if ( itemData.type === "spell" ) {
        this.configuration.spell?.applySpellChanges?.(itemData, { ability: this.value.ability });
      }
      this.actor.updateSource({ items: [itemData] });
    }
  }
}
