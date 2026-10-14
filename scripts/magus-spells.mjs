import { tokensDistance } from "./effects.mjs";
const pending = new WeakMap();
const keys = new Set(["spell:magus-arcane-invigoration", "spell:magus-give-life"]);
export const magusDiceSpell = activity => activity?.type === "heal" && keys.has(activity.item.flags?.spikependium?.key);
const path = nonce => `flags.spikependium.magusDiceCasts.${nonce}.spent`;
const isTemp = activity => activity.item.flags.spikependium.key === "spell:magus-arcane-invigoration";

export function canConsumeMagusSpell(activity, config, message) {
  if (activity.item.flags.spikependium?.key === "spell:magus-strike-order") {
    const high = activity.duration.concentration;
    if (high !== (activity.item.system.level >= 6)) {
      ui.notifications.warn("Выберите способ Приказа атаковать, соответствующий ячейке: 3–5 либо 6+ с концентрацией."); return false;
    }
  }
  if (!magusDiceSpell(activity)) return;
  if (config.consume !== true && (!config.consume || config.consume === false || (config.consume.resources !== true
    && !config.consume.resources?.includes?.(0)))) {
    ui.notifications.warn("Это заклинание требует расхода выбранных костей хитов."); return false;
  }
  if (isTemp(activity)) return;
  const targets = message.data?.system?.targets ?? [], descriptor = targets[0];
  const target = descriptor?.actor && fromUuidSync(descriptor.actor, { strict: false });
  const token = descriptor?.token && fromUuidSync(descriptor.token, { strict: false }), source = activity.getUsageToken();
  if (targets.length !== 1 || !target?.system.isCreature || target.uuid === activity.actor.uuid
    || (source && token && (tokensDistance(source, token) == null || tokensDistance(source, token) > 5))) {
    ui.notifications.warn("Передача жизни требует одного другого существа в пределах касания (5 футов)."); return false;
  }
  config.spikependium = { ...config.spikependium, magusLifeTarget: target.uuid };
}

export function magusDiceChoices(actor) {
  if (actor.system.isNPC) {
    const hd = actor.system.attributes.hd;
    return hd && Number.isInteger(hd.value) && hd.value > 0 ? { [`d${hd.denomination}`]: hd.value } : {};
  }
  const choices = {};
  for (const cls of Object.values(actor.classes ?? {})) {
    const hd = cls.system.hd;
    if (/^d(?:6|8|10|12)$/.test(hd.denomination) && Number.isInteger(hd.value) && hd.value > 0)
      choices[hd.denomination] = (choices[hd.denomination] ?? 0) + hd.value;
  }
  return choices;
}
export function magusDiceLimit(activity, config = {}) {
  if (!magusDiceSpell(activity)) return 0;
  if (isTemp(activity)) {
    const item = activity.item, slot = activity.actor.system.spells?.[config.spell?.slot];
    const base = item._source?.system.level ?? item.system.level - (item.flags.dnd5e?.scaling || 0);
    const level = slot?.level ?? item.flags.dnd5e?.spellLevel?.value ?? base + (config.scaling || 0);
    return Number.isInteger(level) && level >= 2 && level <= 9 ? level : 0;
  }
  const level = activity.actor.system.details?.level ?? activity.actor.system.details?.spellLevel ?? 1;
  return Number.isInteger(level) && level >= 1 ? level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1 : 0;
}
export function magusDicePlan(activity, config = {}) {
  const selected = config.spikependium?.magusDice;
  if (!selected || typeof selected !== "object" || Array.isArray(selected)) return null;
  const available = magusDiceChoices(activity.actor), plan = {};
  let count = 0;
  for (const [denom, number] of Object.entries(selected)) {
    if (!/^d\d+$/.test(denom) || !Number.isInteger(number) || number < 0) return null;
    if (!number) continue;
    if (!available[denom] || number > available[denom]) return null;
    plan[denom] = number; count += number;
  }
  return count > 0 && count <= magusDiceLimit(activity, config) ? plan : null;
}
export function prepareMagusDiceDialog(activity, config, dialog) {
  if (!magusDiceSpell(activity)) return;
  config.spikependium = { ...config.spikependium, usageChoice: true };
  const Base = dialog.applicationClass;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      const limit = magusDiceLimit(activity, this.config);
      for (const [denom, count] of Object.entries(magusDiceChoices(this.actor))) context.fields.push({
        field: new foundry.data.fields.NumberField({ integer: true, min: 0, max: Math.min(count, limit), label: `${denom}: доступно ${count}` }),
        name: `spikependium.magusDice.${denom}`, value: this.config.spikependium?.magusDice?.[denom] ?? 0
      });
      context.notes.push({ type: "info", message: `Выберите от 1 до ${limit} своих костей хитов любых доступных размеров.${isTemp(activity) ? " Модификатор заклинательной характеристики добавляется один раз." : " Модификаторы не добавляются."}` });
      context.hasConsumption = true; return context;
    }
  };
}
export function registerMagusDice() {
  CONFIG.DND5E.activityConsumptionTypes.spikependiumMagusHitDice = {
    label: "Свои кости хитов для заклинания", async consume(config, updates) {
      const activity = this.activity; pending.delete(activity);
      const dice = magusDiceSpell(activity) && magusDicePlan(activity, config);
      if (!dice || !activity.actor.isOwner || (!isTemp(activity) && !config.spikependium?.magusLifeTarget))
        throw new dnd5e.dataModels.activity.ConsumptionError("Выберите доступные собственные кости хитов в пределах заклинания и получателя лечения.");
      if (this.actor.system.isNPC) {
        const hd = this.actor.system.attributes.hd;
        updates.actor["system.attributes.hd.spent"] = hd.spent + Object.values(dice).reduce((sum, n) => sum + n, 0);
      } else for (const [denom, count] of Object.entries(dice)) {
        await CONFIG.DND5E.activityConsumptionTypes.hitDice.consume.call({ actor: this.actor, target: denom,
          resolveCost: async () => ({ total: count }) }, config, updates);
      }
      const mod = isTemp(activity) ? activity.getRollData().mod : 0;
      if (!Number.isInteger(mod)) throw new dnd5e.dataModels.activity.ConsumptionError("Не определена заклинательная характеристика.");
      const formula = Object.entries(dice).map(([denom, n]) => `${n}${denom}`).concat(mod ? [String(mod)] : []).join(" + ");
      const roll = await new CONFIG.Dice.BasicRoll(formula, activity.getRollData(), { flavor: "Потраченные кости хитов" }).evaluate();
      if (!Number.isFinite(roll.total)) throw new Error("Invalid hit-dice roll");
      updates.rolls.push(roll);
      const receipt = { nonce: foundry.utils.randomID(), actor: this.actor.uuid, activity: activity.uuid,
        key: activity.item.flags.spikependium.key, target: isTemp(activity) ? this.actor.uuid : config.spikependium.magusLifeTarget,
        total: Math.max(0, roll.total), dice, mod };
      updates.actor[path(receipt.nonce)] = 1; pending.set(activity, receipt);
    }, consumptionLabels() { return { label: "Потратить выбранные кости хитов", hint: "Размеры и количество выбираются ниже." }; }
  };
}
export function recordMagusDice(activity, _config, message) {
  const receipt = pending.get(activity); pending.delete(activity);
  if (!receipt || foundry.utils.getProperty(activity.actor, path(receipt.nonce)) !== 1) return;
  const deltas = ((message.data.system ??= {}).deltas ??= {}).actor ??= [];
  if (!deltas.some(d => d.keyPath === path(receipt.nonce))) deltas.push({ keyPath: path(receipt.nonce), delta: 1 });
  foundry.utils.setProperty(message, "data.flags.spikependium.magusDice", receipt);
}
export function prepareMagusDiceHealing(config, _dialog, message) {
  const activity = config.subject;
  if (!magusDiceSpell(activity)) return;
  const origin = game.messages.get(message.data?.system?.origin), receipt = origin?.flags.spikependium?.magusDice;
  if (!activity.actor.isOwner || origin?.isContentVisible === false || !receipt || receipt.activity !== activity.uuid || receipt.actor !== activity.actor.uuid
    || receipt.key !== activity.item.flags.spikependium.key || !/^[A-Za-z0-9]{16}$/.test(receipt.nonce ?? "")
    || !Number.isFinite(receipt.total) || receipt.total < 0 || foundry.utils.getProperty(activity.actor, path(receipt.nonce)) !== 1) {
    ui.notifications.warn("Для лечения нужен исходный оплаченный бросок костей хитов; отменённое накладывание не подходит."); return false;
  }
  for (const roll of config.rolls) roll.parts = [String(receipt.total)];
}

export function guardMagusHealing(actor, amount, updates, options = {}) {
  if (amount < 0 && actor.statuses.has("restrained") && (actor.appliedEffects ?? actor.effects).some(e =>
    e.active && e.flags.spikependium?.magusGraveGrasp && e.statuses.has("restrained"))) {
    ui.notifications.warn("Могильная хватка: опутанная этим заклинанием цель не может восстанавливать хиты.");
    if (updates["system.attributes.hp.temp"] > actor.system.attributes.hp.temp) updates["system.attributes.hp.value"] = actor.system.attributes.hp.value;
    else return false;
  }
  const origin = options.originatingMessage?.getOriginatingMessage?.(), activity = origin?.getAssociatedActivity?.({ scaled: true });
  if (!activity) return;
  if (magusDiceSpell(activity)) {
    const receipt = origin.flags.spikependium?.magusDice;
    if (origin.isContentVisible === false || !receipt || receipt.actor !== activity.actor.uuid || receipt.target !== actor.uuid
      || !/^[A-Za-z0-9]{16}$/.test(receipt.nonce ?? "") || foundry.utils.getProperty(activity.actor, path(receipt.nonce)) !== 1) {
      ui.notifications.warn("Лечение требует оплаченного накладывания и выбранного получателя."); return false;
    }
  }
  if (activity.item.flags.spikependium?.key === "spell:magus-grave-bolt"
    && ((activity.type === "heal") !== (actor.system.details.type.value === "undead"))) {
    ui.notifications.warn("Могильный разряд лечит нежить и наносит урон остальным существам; выберите подходящую карточку."); return false;
  }
}
