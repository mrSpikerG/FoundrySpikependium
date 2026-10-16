// MIT: foundryvtt/dnd5e, commit 87e94dbd9f930135e0694cd7e7d49f210603cd2c.
// Exact _setOverride body from module/data/activity/base-activity.mjs.
const safePropertyExists = (obj, key) => key.split('.').reduce((value, part) => value?.[part], obj) !== undefined;
export function nativeArmorSetOverride(keyPath, item=this.item) {
    const obj = foundry.utils.getProperty(this, keyPath);
    Object.defineProperty(obj, "canOverride", {
      value: safePropertyExists(item.system, keyPath),
      configurable: true,
      enumerable: false
    });
    if ( obj.canOverride && !obj.override && !obj.overrideSet && !this.isRider ) {
      foundry.utils.mergeObject(obj, foundry.utils.getProperty(item.system, keyPath));
      Object.defineProperty(obj, "overrideSet", { value: true, configurable: true, enumerable: false });
    }
  }
