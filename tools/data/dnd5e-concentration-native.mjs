/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/
// Exact dnd5e 6.0.6 body, commit 87e94dbd9f930135e0694cd7e7d49f210603cd2c. Localization is provided by the host.
export function nativeConcentrationData(activity, data={}) {
    const item = activity?.item;
    if ( !item?.isEmbedded || !activity.duration.concentration ) {
      throw new Error("You may not begin concentrating on this item!");
    }

    const statusEffect = CONFIG.statusEffects[CONFIG.specialStatusEffects.CONCENTRATING];
    const effectData = foundry.utils.mergeObject({
      ...statusEffect,
      name: `${_loc("EFFECT.DND5E.StatusConcentrating")}: ${item.name}`,
      description: `<p>${_loc("DND5E.CONCENTRATION.Description", {
        name: item.name,
        type: _loc(`TYPES.Item.${item.type}`)
      })}</p><hr><p>@Embed[${item.uuid} inline]</p>`,
      duration: activity.duration.getEffectData(),
      "flags.dnd5e": {
        activity: {
          type: activity.type, id: activity.id, uuid: activity.uuid
        },
        item: {
          type: item.type, id: item.id, uuid: item.uuid,
          data: !item.actor.items.has(item.id) ? item.toObject() : undefined
        }
      },
      origin: item.uuid,
      statuses: [statusEffect.id].concat(statusEffect.statuses ?? []),
      system: {
        type: "concentrating"
      }
    }, data, {inplace: false});
    delete effectData.id;
    if ( item.type === "spell" ) effectData["flags.dnd5e.spellLevel"] = item.system.level;

    return effectData;
  }
