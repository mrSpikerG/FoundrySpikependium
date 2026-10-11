/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
// MIT: https://github.com/foundryvtt/dnd5e/blob/87e94dbd9f930135e0694cd7e7d49f210603cd2c/module/applications/components/effect-application.mjs
// Native method body unchanged; localization is supplied as a test argument.
export async function prepareEffectData(effect, actor, _loc) {
    const originActor = this.chatMessage.getAssociatedActor();
    const concentration = originActor?.effects.get(this.chatMessage.system.concentration);
    const item = this.chatMessage.getAssociatedItem({ scaled: true });
    const activity = this.chatMessage.getAssociatedActivity({ scaled: true });
    const sourceKey = effect.inCompendium ? "compendiumSource" : "duplicateSource";
    if ( !game.user.isGM && !actor.isOwner ) {
      throw new Error(_loc("DND5E.EFFECT.Application.Warning.Ownership"));
    }

    // Get any effect changes provided by the activity & add flags
    const changes = activity?.getAppliedEffectChanges(effect, { chatMessage: this.chatMessage, target: actor }) ?? {};
    foundry.utils.mergeObject(changes, {
      flags: {
        dnd5e: {
          dependentOn: concentration?.uuid,
          scaling: this.chatMessage.system.scaling,
          spellLevel: this.chatMessage.system.level
        }
      },
      system: {
        origin: {
          [activity ? "activity" : "item"]: activity ? activity.uuid : item?.uuid,
          effect: concentration?.uuid,
          message: this.chatMessage.uuid,
          profile: activity
            ? activity.effects?.find(e => (e.uuid === effect.uuid) || (e._id === effect.id))?._id : undefined
        }
      }
    });

    // Enable an existing effect on the target if it originated from this effect
    const existingEffect = actor.effects.find(e => e._stats[sourceKey] === effect.uuid);
    if ( existingEffect ) {
      return { action: "update", data: foundry.utils.mergeObject({
        _id: existingEffect.id,
        disabled: false,
        duration: {
          expired: false
        },
        start: effect.constructor.getEffectStart()
      }, changes) };
    }

    // Otherwise, create a new effect on the target
    const effectData = foundry.utils.mergeObject({
      ...effect.toObject(),
      disabled: false,
      transfer: false,
      _stats: {
        [sourceKey]: effect.uuid,
        [effect.inCompendium ? "duplicateSource" : "compendiumSource"]: null
      }
    }, changes);

    effectData.system.changes = await ActiveEffect.implementation.forApplication(
      effectData.system.changes,
      activity ?? item ?? originActor,
      actor
    );

    return { action: "create", data: effectData };
}
