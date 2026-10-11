/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/
// https://github.com/foundryvtt/dnd5e/blob/87e94dbd9f930135e0694cd7e7d49f210603cd2c/module/canvas/token.mjs
// Only the Core superclass call is injected as baseCost.
export function nativeMovementCost(options, baseCost) {
    const costFunction = baseCost(options);
    if ( game.settings.get("dnd5e", "movementAutomation") === "none" ) return costFunction;

    const ignoredDifficultTerrain = this.actor?.system.attributes?.movement?.ignoredDifficultTerrain ?? new Set();
    const ignoreDifficult = ["all", "nonmagical"].some(i => ignoredDifficultTerrain.has(i));
    const preview = options?.preview && canvas.visibility.tokenVision && !game.user.isGM;
    return (from, to, distance, segment) => {
      const cost = costFunction(from, to, distance, segment);

      // Terrain already difficult, no stacking
      if ( segment.terrain?.difficultTerrain ) return cost;

      // If ignoring all/nonmagical, don't consider tokens difficult terrain
      if ( ignoreDifficult ) return cost;

      // Check difficult due to occupied tokens
      if ( !this.layer.isOccupiedGridSpaceDifficult(to, this, { preview }) ) return cost;

      // Difficult terrain due to occupied grid space
      return cost + distance;
    };
  }
