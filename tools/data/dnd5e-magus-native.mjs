/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/
// MIT: foundryvtt/dnd5e 87e94dbd9f930135e0694cd7e7d49f210603cd2c.
// Exact Filter module and ASI/Trait method bodies; host Trait services are injected.
/**
 * @import { FilterDescription } from "./_types.mjs";
 */

/**
 * Class for storing a filter definition for easy evaluation.
 */
export class Filter {
  constructor(definition) {
    this.#definition = definition;
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The underlying filter definition.
   * @type {FilterDescription|FilterDescription[]}
   */
  #definition;

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Check some data against the filter to determine if it matches.
   * @param {object} data  Arbitrary data object to check.
   * @returns {boolean}
   */
  check(data) {
    try {
      if ( foundry.utils.isEmpty(this.#definition) ) return true;
      else return performCheck(data, this.#definition);
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  /* -------------------------------------------- */

  /**
   * Evaluate the callback for each individual filter, returning early if the callback returns `true` for any filter.
   * @param {Function} cb
   * @returns {boolean}
   */
  some(cb) {
    return _some(cb, this.#definition);
  }
}

/* -------------------------------------------- */
/*  Checking Functions                          */
/* -------------------------------------------- */

/**
 * Check some data against a filter to determine if it matches.
 * @param {object} data                                   Data to check.
 * @param {FilterDescription|FilterDescription[]} filter  Filter to compare against.
 * @returns {boolean}
 * @throws
 */
export function performCheck(data, filter=[]) {
  if ( Array.isArray(filter) ) return AND(data, filter);
  return _check(data, filter.k, filter.v, filter.o);
}

/* -------------------------------------------- */

/**
 * Determine the unique keys referenced by a set of filters.
 * @param {FilterDescription[]} filter  Filter to examine.
 * @returns {Set<string>}
 */
export function uniqueKeys(filter=[]) {
  const keys = new Set();
  const _uniqueKeys = filters => {
    for ( const f of filters ) {
      const operator = f.o in OPERATOR_FUNCTIONS;
      if ( operator && Array.isArray(f.v) ) _uniqueKeys(f.v);
      else if ( f.o === "NOT" ) _uniqueKeys([f.v]);
      else if ( !operator ) keys.add(f.k);
    }
  };
  _uniqueKeys(filter);
  return keys;
}

/* -------------------------------------------- */

/**
 * Internal check implementation.
 * @param {object} data                 Data to check.
 * @param {string} [keyPath]            Path to individual piece within data to check.
 * @param {*} value                     Value to compare against or additional filters.
 * @param {string} [operation="exact"]  Checking function to use.
 * @returns {boolean}
 * @internal
 * @throws
 */
function _check(data, keyPath, value, operation="exact") {
  const operator = OPERATOR_FUNCTIONS[operation];
  if ( operator ) return operator(data, value);

  const comparison = COMPARISON_FUNCTIONS[operation];
  if ( !comparison ) throw new Error(`Comparison function "${operation}" could not be found.`);
  return comparison(foundry.utils.getProperty(data, keyPath), value);
}

/* -------------------------------------------- */

/**
 * Evaluate the callback for each individual filter, returning early if the callback returns `true` for any filter.
 * @param {Function} cb
 * @param {FilterDescription|FilterDescription[]} filter
 * @returns {boolean}
 * @internal
 */
function _some(cb, filter=[]) {
  if ( Array.isArray(filter) && filter.some(f => _some(cb, f)) ) return true;
  if ( !foundry.utils.isPlainObject(filter) ) return false;
  if ( cb(filter) === true ) return true;
  if ( filter.o in OPERATOR_FUNCTIONS ) return _some(cb, filter.v);
  return false;
}

/* -------------------------------------------- */
/*  Operator Functions                          */
/* -------------------------------------------- */

/**
 * Operator functions.
 * @enum {Function}
 */
export const OPERATOR_FUNCTIONS = {
  AND, NAND, OR, NOR, XOR, NOT
};

/* -------------------------------------------- */

/**
 * Perform an AND check against all filters.
 * @param {object} data                 Data to check.
 * @param {FilterDescription[]} filter  Filter to compare against.
 * @returns {boolean}
 */
export function AND(data, filter) {
  return filter.every(({k, v, o}) => _check(data, k, v, o));
}

/* -------------------------------------------- */

/**
 * Perform an NAND check against all filters.
 * @param {object} data                 Data to check.
 * @param {FilterDescription[]} filter  Filter to compare against.
 * @returns {boolean}
 */
export function NAND(data, filter) {
  return !filter.every(({k, v, o}) => _check(data, k, v, o));
}

/* -------------------------------------------- */

/**
 * Perform an OR check against all filters.
 * @param {object} data                 Data to check.
 * @param {FilterDescription[]} filter  Filter to compare against.
 * @returns {boolean}
 */
export function OR(data, filter) {
  return filter.some(({k, v, o}) => _check(data, k, v, o));
}

/* -------------------------------------------- */

/**
 * Perform an NOR check against all filters.
 * @param {object} data                 Data to check.
 * @param {FilterDescription[]} filter  Filter to compare against.
 * @returns {boolean}
 */
export function NOR(data, filter) {
  return !filter.some(({k, v, o}) => _check(data, k, v, o));
}

/* -------------------------------------------- */

/**
 * Perform an XOR check against all filters.
 * @param {object} data                 Data to check.
 * @param {FilterDescription[]} filter  Filter to compare against.
 * @returns {boolean}
 */
export function XOR(data, filter) {
  if ( !filter.length ) return false;
  let currentResult = _check(data, filter[0].k, filter[0].v, filter[0].o);
  for ( let i = 1; i < filter.length; i++ ) {
    const { k, v, o } = filter[i];
    currentResult ^= _check(data, k, v, o);
  }
  return Boolean(currentResult);
}

/* -------------------------------------------- */

/**
 * Invert the result of a nested check,
 * @param {object} data               Data to check.
 * @param {FilterDescription} filter  Filter to compare against.
 * @returns {boolean}
 */
export function NOT(data, filter) {
  const { k, v, o } = filter;
  return !_check(data, k, v, o);
}

/* -------------------------------------------- */
/*  Comparison Functions                        */
/* -------------------------------------------- */

/**
 * Currently supported comparison functions.
 * @enum {Function}
 */
export const COMPARISON_FUNCTIONS = {
  exact, contains, icontains, startswith, istartswith, endswith, iendswith,
  empty, has, hasany, hasall, subsetof, in: in_, gt, gte, lt, lte
};

/* -------------------------------------------- */

/**
 * Check for an exact match. The default comparison mode if none is provided.
 * @param {*} data
 * @param {*} value
 * @returns {boolean}
 */
export function exact(data, value) {
  return data === value;
}

/* -------------------------------------------- */

/**
 * Check that data contains value.
 * @param {*} data
 * @param {*} value
 * @returns {boolean}
 */
export function contains(data, value) {
  return String(data).includes(String(value));
}

/* -------------------------------------------- */

/**
 * Case-insensitive check that data contains value.
 * @param {*} data
 * @param {*} value
 * @returns {boolean}
 */
export function icontains(data, value) {
  return contains(String(data).toLocaleLowerCase(game.i18n.lang), String(value).toLocaleLowerCase(game.i18n.lang));
}

/* -------------------------------------------- */

/**
 * Check that data starts with value.
 * @param {*} data
 * @param {*} value
 * @returns {boolean}
 */
export function startswith(data, value) {
  return String(data).startsWith(String(value));
}

/* -------------------------------------------- */

/**
 * Case-insensitive check that data starts with value.
 * @param {*} data
 * @param {*} value
 * @returns {boolean}
 */
export function istartswith(data, value) {
  return startswith(String(data).toLocaleLowerCase(game.i18n.lang), String(value).toLocaleLowerCase(game.i18n.lang));
}

/* -------------------------------------------- */

/**
 * Check that data ends with value.
 * @param {*} data
 * @param {*} value
 * @returns {boolean}
 */
export function endswith(data, value) {
  return String(data).endsWith(String(value));
}

/* -------------------------------------------- */

/**
 * Case-insensitive check that data ends with value.
 * @param {*} data
 * @param {*} value
 * @returns {boolean}
 */
export function iendswith(data, value) {
  return endswith(String(data).toLocaleLowerCase(game.i18n.lang), String(value).toLocaleLowerCase(game.i18n.lang));
}

/* -------------------------------------------- */

/**
 * Check if the data is empty.
 * @param {*} data
 * @param {*} value
 * @returns {boolean}
 */
export function empty(data, value=true) {
  return ((data === "") || foundry.utils.isEmpty(data)) === value;
}

/* -------------------------------------------- */

/**
 * Check that the data collection has the provided value.
 * @param {*} data
 * @param {*} value
 * @returns {boolean}
 */
export function has(data, value) {
  // If the value is another filter description, apply that check against each member of the collection
  if ( foundry.utils.getType(value) === "Object" ) {
    switch ( foundry.utils.getType(data) ) {
      case "Array":
      case "Set": return !!data.find(d => performCheck(d, value));
      default: return false;
    }
  } else return in_(value, data);
}

/* -------------------------------------------- */

/**
 * Check that the data collection has any of the provided values.
 * @param {*} data
 * @param {*} value
 * @returns {boolean}
 */
export function hasany(data, value) {
  return Array.from(value).some(v => has(data, v));
}

/* -------------------------------------------- */

/**
 * Check that the data collection has all of the provided values.
 * @param {*} data
 * @param {*} value
 * @returns {boolean}
 */
export function hasall(data, value) {
  return Array.from(value).every(v => has(data, v));
}

/* -------------------------------------------- */

/**
 * Check that the data collection is a subset of the provided values.
 * @param {*} data
 * @param {*} value
 * @returns {boolean}
 */
export function subsetof(data, value) {
  const type = foundry.utils.getType(data);
  if ( (type !== "Array") && (type !== "Set") ) return false;
  return Array.from(data).every(d => in_(d, value));
}

/* -------------------------------------------- */

/**
 * Check that data matches one of the provided values.
 * @param {*} data
 * @param {*} value
 * @returns {boolean}
 */
export function in_(data, value) {
  switch ( foundry.utils.getType(value) ) {
    case "Array": return value.includes(data);
    case "Set": return value.has(data);
    default: return false;
  }
}

/* -------------------------------------------- */

/**
 * Check that value is greater than data.
 * @param {*} data
 * @param {*} value
 * @returns {boolean}
 */
export function gt(data, value) {
  return data > value;
}

/* -------------------------------------------- */

/**
 * Check that value is greater than or equal to data.
 * @param {*} data
 * @param {*} value
 * @returns {boolean}
 */
export function gte(data, value) {
  return data >= value;
}

/* -------------------------------------------- */

/**
 * Check that value is less than data.
 * @param {*} data
 * @param {*} value
 * @returns {boolean}
 */
export function lt(data, value) {
  return data < value;
}

/* -------------------------------------------- */

/**
 * Check that value is less than or equal to data.
 * @param {*} data
 * @param {*} value
 * @returns {boolean}
 */
export function lte(data, value) {
  return data <= value;
}

export async function nativeMagusASIApply(level, data, options={}) {
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

export function nativeMagusASIPoints() {
    return {
      assigned: Object.entries(this.value.assignments ?? {}).reduce((n, [abl, c]) => {
        if ( this.canImprove(abl) ) n += c;
        return n;
      }, 0),
      total: this.configuration.points + Object.entries(this.configuration.fixed).reduce((t, [abl, v]) => {
        if ( this.canImprove(abl) ) t += v;
        return t;
      }, 0)
    };
  }

let Trait;
const filteredKeys=(data, predicate)=>Object.keys(data).filter(k=>predicate(data[k]));
export function setMagusTraitHost(host) { Trait=host; }
export async function nativeMagusTraitSelected() {
    const selected = new Set();
    const available = new Set();

    // If "default" mode is selected, return all traits
    // If any other mode is selected, only return traits that support expertise or mastery
    const traitTypes = this.configuration.mode === "default" ? Object.keys(CONFIG.DND5E.traits).filter(k => k !== "dm")
      : filteredKeys(CONFIG.DND5E.traits, t => t[this.configuration.mode === "mastery" ? "mastery" : "expertise"]);

    for ( const trait of traitTypes ) {
      const actorValues = await Trait.actorValues(this.actor, trait);
      const choices = await Trait.choices(trait, { prefixed: true });
      for ( const key of choices.asSet() ) {
        const value = actorValues[key] ?? 0;
        if ( this.configuration.mode === "default" ) {
          if ( value >= 1 ) selected.add(key);
          else available.add(key);
        } else if ( this.configuration.mode === "mastery" ) {
          const split = key.split(":");
          split.pop();
          const category = split.join(":");
          if ( value === 2 ) selected.add(key);
          if ( (value === 1) || (actorValues[category] === 1) ) available.add(key);
        } else {
          if ( value === 2 ) selected.add(key);
          if ( (this.configuration.mode === "expertise") && (value === 1) ) available.add(key);
          else if ( (this.configuration.mode !== "expertise") && (value < 2) ) available.add(key);
        }
      }
    }

    return { selected, available };
  }



// Exact native method body; host services are injected.
export async function nativeMagusTraitApply(level, data, options={}) {
    if ( options.initial ) data = await this.automaticApplicationValue(level, { initial: true });

    const updates = {};
    const chosen = new Set(this.value.chosen ?? []);
    const keys = data.chosen ? data.chosen : data.key ? [data.key] : null;
    if ( !keys ) return;

    for ( const key of keys ) {
      chosen.add(key);
      const keyPath = this.configuration.mode === "mastery" ? "system.traits.weaponProf.mastery.value"
        : Trait.changeKeyPath(key);
      let existingValue = updates[keyPath] ?? foundry.utils.getProperty(this.actor, keyPath);

      if ( ["Array", "Set"].includes(foundry.utils.getType(existingValue)) ) {
        existingValue = new Set(existingValue);
        existingValue.add(key.split(":").pop());
        updates[keyPath] = Array.from(existingValue);
      } else if ( (this.configuration.mode !== "expertise") || (existingValue !== 0) ) {
        updates[keyPath] = (this.configuration.mode === "default")
          || ((this.configuration.mode === "upgrade") && (existingValue === 0)) ? 1 : 2;
      }

      if ( key.startsWith("tool") ) {
        const toolId = key.split(":").pop();
        const ability = CONFIG.DND5E.tools[toolId]?.ability;
        const kp = `system.tools.${toolId}.ability`;
        if ( ability && !foundry.utils.hasProperty(this.actor, kp) ) updates[kp] = ability;
      }
    }

    this.actor.updateSource(updates);
    this.updateSource({ "value.chosen": chosen });
  }

