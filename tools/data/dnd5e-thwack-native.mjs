/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Source: foundryvtt/dnd5e 87e94dbd9f930135e0694cd7e7d49f210603cd2c.
Exact method bodies; localization/formatting and host services are supplied by tests.
*/
// Exact ActivityMixin._finalizeMessageConfig at the pinned commit.
export function nativeThwackMessageConfig(usageConfig, messageConfig, results) {
      messageConfig.data.rolls = (messageConfig.data.rolls ?? []).concat(results.updates.rolls);
      if ( this.metadata.usage.applyEffectsInChat ) {
        const effects = this.applicableEffects?.map(e => e.relativeUUID);
        if ( effects ) foundry.utils.setProperty(messageConfig.data, "system.effects", effects);
      }
    }

