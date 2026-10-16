const reagent = actor => actor.items.find(i => i.type === "feat" && i.flags.spikependium?.key === "alchemist:reagents" && i.system.identifier === "alchemist-reagents");
function eligible(activity) {
  return activity.flags?.spikependium?.alchemistBomb?.charged
    && (activity.damage?.parts?.length || (activity.type === "heal" && activity.item.flags.spikependium?.key === "alchemist:special-formula:painkiller"));
}
export function prepareAlchemistReagentDialog(activity, config, dialog) {
  if (!activity.actor || !eligible(activity)) return;
  const resource = reagent(activity.actor);
  if (!resource || (activity.actor.classes?.alchemist?.system.levels ?? 0) < 3) return;
  const Base = dialog.applicationClass;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      context.fields.push({ name: "spikependium.bombReagents", value: this.config.spikependium?.bombReagents ?? 0,
        field: new foundry.data.fields.NumberField({ label: "Кости реагентов к10", integer: true, min: 0,
          max: Math.max(0, Math.min(activity.actor.system.attributes.prof, resource.system.uses.value)), required: true }) });
      return context;
    }
  };
}
export function prepareAlchemistReagentUpdates(activity, config, updates) {
  const raw = config.spikependium?.bombReagents ?? 0;
  const count = (typeof raw === "number" || (typeof raw === "string" && /^\d+$/.test(raw))) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(count) || count < 0) { ui.notifications.warn("Укажите целое неотрицательное число костей реагентов."); return false; }
  if (!count) return;
  const actor = activity.actor, resource = reagent(actor), prof = actor.system.attributes?.prof;
  if (!actor.isOwner || !eligible(activity) || (actor.classes?.alchemist?.system.levels ?? 0) < 3 || !resource || !Number.isFinite(prof) || count > prof) {
    ui.notifications.warn("Реагенты доступны для урона заряженной бомбы с 3-го уровня алхимика, не больше бонуса владения."); return false;
  }
  let update = updates.item.find(i => i._id === resource.id);
  const spent = resource.system.uses.spent, pending = update?.["system.uses.spent"] ?? update?.system?.uses?.spent ?? spent, max = Number(resource.system.uses.max);
  if (!Number.isFinite(spent) || !Number.isFinite(pending) || !Number.isFinite(max) || pending < spent || pending + count > max) {
    ui.notifications.warn("Недостаточно оставшихся костей реагентов."); return false;
  }
  if (!update) updates.item.push(update = { _id: resource.id });
  if (update.system?.uses?.spent !== undefined) update.system.uses.spent = pending + count;
  else update["system.uses.spent"] = pending + count;
  return { resource: resource.id, count, cost: pending + count - spent };
}
export function paidAlchemistReagents(receipt, message) {
  const r = receipt?.reagents;
  return !r || (receipt.charged && Number.isSafeInteger(r.count) && r.count > 0 && Number.isSafeInteger(r.cost) && r.cost >= r.count
    && message.system.deltas?.item?.[r.resource]?.some(d => d.keyPath === "system.uses.spent" && d.delta === r.cost));
}
export function addAlchemistReagentDamage(config, receipt) {
  for (const roll of config.rolls ?? []) {
    const prior = roll.options?.spikependiumAlchemistReagents;
    if (!prior) continue;
    if (roll.parts?.[prior.index] !== prior.term) { ui.notifications.warn("Части урона изменились. Откройте бросок бомбы заново."); return false; }
    roll.parts.splice(prior.index, 1); delete roll.options.spikependiumAlchemistReagents;
  }
  if (!receipt.reagents) return;
  const damage = (config.rolls ?? []).filter(r => Array.isArray(r.parts)
    && (r.options?.type in CONFIG.DND5E.damageTypes || (config.subject.type === "heal" && r.options?.type === "temphp")));
  if (damage.length !== 1) { ui.notifications.warn("Реагенты требуют одного однозначного исходного броска урона бомбы."); return false; }
  const roll = damage[0], term = `${receipt.reagents.count}d10`;
  roll.options.spikependiumAlchemistReagents = { nonce: receipt.nonce, term, index: roll.parts.length };
  roll.parts.push(term);
}
