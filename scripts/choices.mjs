import { DRAGONMARK_TABLES } from "./generated.mjs";

export function dragonSlot(activity) {
  const baseLevel = activity.item._source?.system.level ?? activity.item.system.level;
  if (activity.item.type !== "spell" || !baseLevel) return null;
  const actor = activity.actor;
  const resource = actor.items.find(i => i.system.identifier === "potent-dragonmark");
  if (!resource) return null;
  const level = Math.min(5, Math.ceil(actor.system.details.level / 2));
  if (baseLevel > level) return null;
  const marks = actor.items.filter(i => i.system.type?.subtype === "dragonmark");
  const origin = activity.item._stats?.compendiumSource;
  if (!marks.some(mark => activity.item.system.sourceItem === `feat:${mark.system.identifier}`
    || (origin && DRAGONMARK_TABLES[mark.system.identifier]?.includes(origin)))) return null;
  return { resource, level };
}

export function restorationPlan(actor, selection = {}) {
  const updates = {};
  let total = 0;
  for (const [key, count] of Object.entries(selection)) {
    if (!["spell1", "spell2", "spell3", "spell4", "pact"].includes(key)) return null;
    const slot = actor.system.spells[key];
    const level = key === "pact" ? slot?.level : Number(key.slice(5));
    const number = Number(count);
    if (!Number.isInteger(number) || number < 0) return null;
    if (!number) continue;
    if (!slot || level < 1 || level > 4 || number > slot.max - slot.value) return null;
    total += number * level;
    updates[`system.spells.${key}.value`] = slot.value + number;
  }
  return total > 0 && total <= 4 ? updates : null;
}

export function prepareChoiceDialog(activity, config, dialog) {
  const restoration = activity.item.flags.spikependium?.key === "feat:arcane-restoration";
  const dragon = dragonSlot(activity);
  if (!restoration && !dragon) return;
  const Base = dialog.applicationClass;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      const { BooleanField, NumberField } = foundry.data.fields;
      if (restoration) {
        for (const [key, slot] of Object.entries(this.actor.system.spells)) {
          const level = key === "pact" ? slot.level : Number(key.slice(5));
          if (!["spell1", "spell2", "spell3", "spell4", "pact"].includes(key)
            || !level || level > 4 || slot.value >= slot.max) continue;
          context.fields.push({
            field: new NumberField({ integer: true, min: 0, max: Math.min(slot.max - slot.value, Math.floor(4 / level)),
              label: `${key === "pact" ? "Магия договора" : "Ячейки"}: ${level} ур.` }),
            name: `spikependium.restore.${key}`, value: this.config.spikependium?.restore?.[key] ?? 0
          });
        }
        context.notes.push({ type: "info", message: "Выберите потраченные ячейки. Сумма их уровней — не более 4." });
      }
      if (dragon) context.fields.push({
        field: new BooleanField({ label: `Ячейка драконьей магии (${dragon.level} ур.)`,
          hint: "Расходуется вместо обычной ячейки и бесплатного применения метки; усиливает заклинание до указанного уровня." }),
        input: context.inputs.createCheckboxInput, name: "spikependium.dragonSlot",
        value: this.config.spikependium?.dragonSlot ?? false
      });
      context.hasConsumption = true;
      return context;
    }

    async _prepareSubmitData(event, formData) {
      const data = await super._prepareSubmitData(event, formData);
      if (dragon && data.spikependium?.dragonSlot) {
        data.scaling = dragon.level - this.item._source.system.level;
        data.consume = { ...(typeof data.consume === "object" ? data.consume : {}), spellSlot: false, resources: false };
        if (this.config.cause) data.cause = { ...data.cause, resources: false };
      }
      return data;
    }
  };
}

export function applyChoiceConsumption(activity, config, message, updates) {
  if (activity.item.flags.spikependium?.key === "feat:arcane-restoration") {
    const plan = restorationPlan(activity.actor, config.spikependium?.restore);
    if (!plan) {
      ui.notifications.warn("Выберите потраченные ячейки общей стоимостью от 1 до 4 уровней.");
      return false;
    }
    // Восстановление и расход применения входят в одну нативную операцию с возможностью отмены.
    Object.assign(updates.actor, plan);
  }
  if (config.spikependium?.dragonSlot) {
    const dragon = dragonSlot(activity);
    if (!dragon || dragon.resource.system.uses.spent >= dragon.resource.system.uses.max
      || config.scaling !== dragon.level - activity.item._source.system.level) {
      ui.notifications.warn("Ячейка драконьей магии недоступна для этого заклинания.");
      return false;
    }
    let update = updates.item.find(i => i._id === dragon.resource.id);
    if (!update) updates.item.push(update = { _id: dragon.resource.id });
    update["system.uses.spent"] = dragon.resource.system.uses.spent + 1;
  }
}
