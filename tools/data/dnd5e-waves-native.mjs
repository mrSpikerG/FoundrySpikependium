/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
// MIT: foundryvtt/dnd5e 87e94dbd9f930135e0694cd7e7d49f210603cd2c. Exact bodies; host services are supplied by tests.
let ActiveEffect5e,ConditionData;
export function setWaveNativeContext(c){({ActiveEffect5e,ConditionData}=c);}
export function nativeWaveExhaustion() {
    this.attributes.exhaustion = this.parent.effects.get(ActiveEffect5e.ID.EXHAUSTION)?.system.level ?? 0;
  }
export function nativeWaveReductions() {
    if ( this._lazy.conditionRollReductions !== undefined ) return this._lazy.conditionRollReductions;
    const immunities = this.system.traits?.ci?.value ?? new Set();
    return this._lazy.conditionRollReductions = this.statuses.difference(immunities).reduce((obj, status) => {
      const reduction = CONFIG.DND5E.conditionTypes[status]?.reduction?.rolls ?? 0;
      const levels = ConditionData.hasLevels(status) ? this.system.conditions[status] ?? 0 : 1;
      if ( reduction && levels ) obj[status] = -levels * reduction;
      return obj;
    }, {});
  }
  export function nativeWaveRollParts(parts, data) {
    for ( const [status, reduction] of Object.entries(this.conditionRollReductions) ) {
      parts.push(`@reductions.${status}`);
      data.reductions ??= {};
      data.reductions[status] = reduction;
    }
  }
export class NativeWaveCondition {
static hasLevels(type) {
    const config = CONFIG.DND5E.conditionTypes[type];
    return Number.isFinite(config?.levels);
  }
get hasLevels() {
    return ConditionData.hasLevels(this.type);
  }
get maxLevel() {
    return this.hasLevels
      ? CONFIG.DND5E.conditionTypes[this.type].levels
      : null;
  }
async decrease(levels=1) {
    if ( !this.hasLevels ) return this;
    await this.parent.update({ "system.level": this.level - levels }, { dnd5e: { originalLevel: this.level }});
    return this.parent;
  }
async increase(levels=1) {
    if ( !this.hasLevels ) return this;
    const level = Math.clamp(this.level + levels, 0, this.maxLevel);
    await this.parent.update({ "system.level": level }, { dnd5e: { originalLevel: this.level }});
    return this.parent;
  }
static async _applyDelta(statusId, actor, { levels=1 }={}) {
    const effect = actor.effects.get(dnd5e.utils.staticID(`dnd5e${statusId}`));

    // Increase level of existing effect.
    if ( effect && (levels > 0) ) return effect.system.increase(levels);

    // Create new effect with level.
    if ( levels > 0 ) {
      const effect = await getDocumentClass("ActiveEffect").fromStatusEffect(statusId);
      const data = foundry.utils.mergeObject(effect.toObject(), {
        _id: dnd5e.utils.staticID(`dnd5e${statusId}`),
        "system.level": levels
      });
      return getDocumentClass("ActiveEffect").create(data, { parent: actor, keepId: true });
    }

    // Decrease level (possibly delete).
    if ( effect && (levels < 0) ) {
      const nLevel = effect.system.level + levels;
      if ( nLevel <= 0 ) {
        await effect.delete();
        return effect;
      }
      return effect.system.decrease(Math.abs(levels));
    }
  }
}
class HostActor { _onCreateDescendantDocuments(){} _onDeleteDescendantDocuments(){} async _clearFavorites(){} }
export class NativeWaveActor extends HostActor {
async _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
    super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    if ( userId === game.userId ) {
      if ( (collection === "effects") && documents.find(d => d.id === ActiveEffect5e.ID.EXHAUSTION)
        && !this._source.system.attributes?.exhaustion ) {
        await this.update({ "system.attributes.exhaustion": 1 });
      }
      if ( collection === "items" ) await this.updateEncumbrance(options);
    }
  }
async _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
    super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
    if ( userId === game.userId ) {
      if ( (collection === "effects") && ids.includes(ActiveEffect5e.ID.EXHAUSTION) ) {
        await this.update({ "system.attributes.exhaustion": 0 });
      }
      if ( collection === "items" ) await this.updateEncumbrance(options);
      await this._clearFavorites(documents);
    }
  }
async _onUpdateExhaustion(data, options) {
    const originalExhaustion = foundry.utils.getProperty(options, "dnd5e.originalExhaustion");
    const level = foundry.utils.getProperty(data, "system.attributes.exhaustion");
    const delta = level - originalExhaustion;
    if ( delta ) ConditionData._applyDelta("exhaustion", this, { levels: delta });
  }
}
