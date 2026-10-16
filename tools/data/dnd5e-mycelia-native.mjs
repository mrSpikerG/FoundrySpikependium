// MIT: foundryvtt/dnd5e, commit 87e94dbd9f930135e0694cd7e7d49f210603cd2c.
// Exact capped-number branch of module/documents/active-effect.mjs::applyChangeField.
// Foundry NumberField and super.applyChangeField are injected by the test boundary.
class NumberField {}
const simplifyBonus = value => Number(value);
export class NativeMyceliaNumberField extends NumberField { _replaceDataRefs(value) { return value; } }
export class NativeMyceliaEffect extends class { static applyChangeField(model, change) { model.value = Number(change.value); return model.value; } } {
 static applyChangeField(model, change, options={}) {
    let current = foundry.utils.getProperty(model, change.key);
    const { field, replacementData } = options;
    if ( (field instanceof NumberField)
      && (((change.type === "add") && change.value.includes?.("<="))
      || ((change.type === "subtract") && change.value.includes?.(">="))) ) {
      let [delta, limit] = change.value.split(/<=|>=/);
      try {
        delta = simplifyBonus(field._replaceDataRefs(delta, replacementData), {}, { strict: true });
        limit = simplifyBonus(field._replaceDataRefs(limit, replacementData), {}, { strict: true });
      } catch (err) {
        const warningHeader = change.effect ? `Active Effect (${change.effect.uuid}) | ` : "";
        console.warn(`${warningHeader} "${change.type}" change to ${change.key} failed to resolve: ${err.message}`);
        return current;
      }
      const result = change.type === "add"
        ? Math.max(current, Math.min(current + delta, limit))
        : Math.min(current, Math.max(current - delta, limit));
      return super.applyChangeField(model, { ...change, type: "override", value: result }, options);
    }
    throw Error('Expected native capped numeric change');
 }
}
