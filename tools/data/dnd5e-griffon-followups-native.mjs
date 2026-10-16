/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Source: foundryvtt/dnd5e 87e94dbd9f930135e0694cd7e7d49f210603cd2c.
Exact method bodies; localization/formatting and host services are supplied by tests.
*/
// Exact CastActivity.use and BasicRoll.buildPost at the pinned commit. Host services supplied by tests.
export async function nativeStaffCastUse(usage={}, dialog={}, message={}) {
    if ( !this.item.isEmbedded || this.item.pack ) return;
    if ( !this.item.isOwner ) {
      ui.notifications.error("DND5E.DocumentUseWarn", { localize: true });
      return;
    }

    /**
     * A hook event that fires before a linked spell is used by a Cast activity.
     * @function dnd5e.preUseLinkedSpell
     * @memberof hookEvents
     * @param {CastActivity} activity                                Cast activity being used.
     * @param {Partial<ActivityUseConfiguration>} usageConfig        Configuration info for the activation.
     * @param {Partial<ActivityDialogConfiguration>} dialogConfig    Configuration info for the usage dialog.
     * @param {Partial<ActivityMessageConfiguration>} messageConfig  Configuration info for the created chat message.
     * @returns {boolean}  Explicitly return `false` to prevent activity from being used.
     */
    if ( Hooks.call("dnd5e.preUseLinkedSpell", this, usage, dialog, message) === false ) return;

    let spell = this.cachedSpell;
    if ( !spell ) {
      [spell] = await this.actor.createEmbeddedDocuments("Item", [await this.getCachedSpellData()]);
    }

    const results = await spell.use({ ...usage, legacy: false }, dialog, message);

    /**
     * A hook event that fires after a linked spell is used by a Cast activity.
     * @function dnd5e.postUseLinkedSpell
     * @memberof hookEvents
     * @param {CastActivity} activity                          Activity being activated.
     * @param {Partial<ActivityUseConfiguration>} usageConfig  Configuration data for the activation.
     * @param {ActivityUsageResults} results                   Final details on the activation.
     */
    if ( results ) Hooks.callAll("dnd5e.postUseLinkedSpell", this, usage, results);

    return results;
  }

export async function nativeStaffRollPost(rolls, config, message) {
    message.data = foundry.utils.expandObject(message.data ?? {});
    const messageId = config.event?.target?.closest("[data-message-id]")?.dataset.messageId;
    if ( messageId ) foundry.utils.setProperty(message.data, "system.origin", messageId);

    // Attack & Damage store their origin directly on message.data and do not have a config.event. We retrieve
    // those here.
    const origin = foundry.utils.getProperty(message.data, "system.origin");
    // Store in roll options so that it can be serialized.
    if ( origin ) rolls?.forEach(r => r.options.originatingMessage ??= origin);

    if ( rolls?.length && (config.evaluate !== false) ) {
      message[message.create !== false ? "document" : "data"] = await this.toMessage(
        rolls, message.data, { create: message.create, rollMode: message.rollMode }
      );
      if ( message.document ) rolls.forEach(r => r.parent = message.document);
    }

    return message.document;
  }

export function nativeStaffLinkedActivity(relativeUUID) {
      if ( !this.actor ) return null;
      relativeUUID ??= this.item.getFlag("dnd5e", "cachedFor");
      return fromUuidSync(relativeUUID, { relative: this.actor, strict: false });
    }
