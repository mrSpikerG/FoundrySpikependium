const KEY = "feat:greater-storm", MOD = "N4bBDcVzqAboKo1G";
const prepared = new WeakMap();
function enhancement(activity) {
  if (activity?.item?.type !== "spell" || activity.item.system.identifier !== "gust-of-wind"
    || activity.item.flags.spikependium?.storedSpell || !activity.actor?.isOwner) return;
  const item = activity.actor.items.find(i => i.flags.spikependium?.key === KEY);
  const resource = item?.system.activities.get(MOD);
  return resource ? { item, resource } : undefined;
}

export function canUseStormModifier(activity) {
  if (activity?.id !== MOD || activity.item.flags.spikependium?.key !== KEY) return true;
  ui.notifications.warn("Улучшенный шторм выбирается при накладывании Порыва ветра.");
  return false;
}

export function prepareStormDialog(activity, config, dialog) {
  if (!(enhancement(activity)?.resource.uses.value > 0)) return;
  config.spikependium = { ...config.spikependium, usageChoice: true };
  const Base = dialog.applicationClass;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      context.fields.push({ name: "spikependium.improvedStorm", value: this.config.spikependium?.improvedStorm ?? false,
        field: new foundry.data.fields.BooleanField({ label: "Улучшенный шторм",
          hint: "Расходуется применение усиленной метки. Скорость полёта равна половине скорости; требуется штатное начало концентрации." }),
        input: context.inputs.createCheckboxInput });
      context.hasConsumption = true;
      return context;
    }
  };
}

export function prepareStormUpdates(activity, config, updates) {
  prepared.delete(activity);
  if (!config.spikependium?.improvedStorm) return updates;
  const selected = enhancement(activity), duration = activity.duration?.getEffectData();
  if (!(selected?.resource.uses.value > 0) || config.concentration?.begin !== true || !activity.duration.concentration
    || !Number.isFinite(duration?.value) || duration.value <= 0) {
    ui.notifications.warn("Улучшенный шторм недоступен: проверьте заклинание, длительность, применение метки и начало концентрации.");
    return false;
  }
  const { item, resource } = selected;
  let update = updates.item.find(u => u._id === item.id);
  if (!update) { update = { _id: item.id }; updates.item.push(update); }
  const spent = resource.uses.spent + 1;
  update[`system.activities.${MOD}.uses.spent`] = spent;
  prepared.set(activity, { item: item.uuid, spent });
  return updates;
}

export function prepareStormConcentration(actor, item, data, activity) {
  const selected = prepared.get(activity);
  if (!selected) return;
  prepared.delete(activity);
  const current = enhancement(activity);
  if (actor !== activity.actor || item !== activity.item || current?.item.uuid !== selected.item
    || current.resource.uses.spent !== selected.spent) return;
  data.system ??= {};
  data.system.changes ??= [];
  data.system.changes.push({ key: "system.attributes.movement.speeds.fly", value: "@spikependium.stormFlightSpeed",
    type: "upgrade", phase: "final", conditions: JSON.stringify({ o: "NOT", v: { k: "statuses.antimagic", v: 1 } }) });
  data["flags.spikependium.improvedStorm"] = true;
}

export function hasStormFlight(actor) {
  return actor?.effects?.some(e => e.flags.spikependium?.improvedStorm && e.active && !e.duration.expired
    && !(Number.isFinite(e.duration.remaining) && e.duration.remaining <= 0)) ?? false;
}

export function stormFlightSpeed(actor) {
  const movement = actor.system.attributes.movement;
  const speed = Number(movement.speeds.walk);
  if (!Number.isFinite(speed) || actor.statuses.has("antimagic") || actor.hasConditionEffect("noMovement")
    || actor.hasConditionEffect("crawl")) return 0;
  const units = movement.units ?? "ft";
  // Round in the book's feet, then return to the actor's movement units.
  const feet = dnd5e.utils.convertLength(Math.max(0, speed), units, "ft");
  return dnd5e.utils.convertLength(Math.floor(feet / 2), "ft", units);
}

export function finalizeStormMovement(wrapped, phase, ...args) {
  const result = wrapped(phase, ...args);
  if (phase !== "final" || !hasStormFlight(this)) return result;
  const movement = this.system.attributes.movement;
  // FormulaField leaves final-phase upgrades as strings, after native movement preparation.
  movement.speeds.fly = dnd5e.utils.simplifyBonus(movement.speeds.fly, this.getRollData({ deterministic: true }));
  movement.max = Math.max(movement.max, ...Object.values(movement.speeds).filter(Number.isFinite));
  return result;
}
