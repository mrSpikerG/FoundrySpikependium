/*
Copyright 2021 Andrew Clayton

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/
// Native dnd5e bodies from https://github.com/foundryvtt/dnd5e/tree/87e94dbd9f930135e0694cd7e7d49f210603cd2c/module
// The private stored-item lookup is injected as storedItemData; the movement helper is made callable.
export function getActionType(attackMode="") {
    let actionType = this.actionType;
    if ( (actionType === "mwak") && (attackMode?.startsWith("thrown") || (attackMode === "ranged")) ) return "rwak";
    return actionType;
  }
export function nativeOccupyingTokens(gridSpace, token, { preview=false }={}) {
    const grid = canvas.grid;
    if ( grid.isGridless ) return [];
    const topLeft = grid.getTopLeftPoint(gridSpace);
    const rect = new PIXI.Rectangle(topLeft.x, topLeft.y, grid.sizeX, grid.sizeY);
    const lowerElevation = gridSpace.k * grid.distance;
    const upperElevation = (gridSpace.k + 1) * grid.distance;
    return game.canvas.tokens.quadtree.getObjects(rect, {
      collisionTest: ({ t }) => {
        // Ignore self
        if ( t === token ) return false;

        // Ignore tokens when moving together
        if ( canvas.tokens.controlled.includes(t) ) return false;

        // Always ignore hidden tokens
        if ( t.document.hidden ) return false;

        // If preview movement, don't reveal blocked or difficult terrain for non-visible tokens
        if ( preview && !t.visible ) return false;

        // Always ignore secret tokens
        if ( t.document.disposition === CONST.TOKEN_DISPOSITIONS.SECRET ) return false;

        // Ignore different elevation
        const occupiedElevation = t.document._source.elevation;
        if ( (occupiedElevation < lowerElevation) || (occupiedElevation >= upperElevation) ) return false;

        // Ensure space is actually occupied, not merely touching border of rectangle
        const gridSpaces = t.document.getOccupiedGridSpaceOffsets(t.document._source);
        return gridSpaces.some(coord => (coord.i === gridSpace.i) && (coord.j === gridSpace.j));
      }
    });
  }
export function nativeAssociatedItem({ scaled=false }={}, storedItemData) {
    const uuid = this.system.item?.uuid ?? this.getFlag("dnd5e", "item.uuid");
    const item = fromUuidSync(uuid, { strict: false });
    const scaling = scaled ? this.system.scaling : null;
    if ( item ) return scaling ? item.scaledClone(scaling) : item;
    const actor = this.getAssociatedActor();
    if ( !actor ) return;
    const storedData = storedItemData(this) ?? storedItemData(this.getOriginatingMessage());
    if ( storedData ) return new Item.implementation(storedData, { parent: actor }).scaledClone(scaling);
  }
// Native fall predicate; the private level-region check is injected.
export function nativeShouldFall(movement, inLevelChangeRegion) {
    if ( movement.passed.waypoints.at(-1)?.action === "climb" ) return false;
    if ( inLevelChangeRegion.call(this) ) return false;
    return this._isFalling({ position: movement.destination });
  }
