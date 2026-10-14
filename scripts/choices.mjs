import { DRAGONMARK_TABLES } from "./generated.mjs";
import { hitDieChoices } from "./resources.mjs";
import { appendForgeFields } from "./forge.mjs";
import { appendTinkerFields } from "./tinker.mjs";
import { appendStorageFields } from "./storage.mjs";
import { appendLifeTransferFields, isLifeTransfer } from "./companions.mjs";
import { findingEnhancement } from "./dragonmark-finding.mjs";

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

export function restorationPlan(actor, selection = {}, { maximumLevel = 4, maximumTotal = 4, maximumCount = Infinity } = {}) {
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) return null;
  const updates = {};
  let total = 0, restored = 0;
  for (const [key, count] of Object.entries(selection)) {
    if (!/^spell[1-5]$|^pact$/.test(key)) return null;
    const slot = actor.system.spells[key];
    const level = key === "pact" ? slot?.level : Number(key.slice(5));
    const number = Number(count);
    if (!Number.isInteger(number) || number < 0) return null;
    if (!number) continue;
    if (!slot || !Number.isInteger(level) || level < 1 || level > maximumLevel
      || !Number.isInteger(slot.value) || slot.value < 0 || !Number.isInteger(slot.max) || number > slot.max - slot.value) return null;
    total += number * level;
    restored += number;
    updates[`system.spells.${key}.value`] = slot.value + number;
  }
  return total > 0 && total <= maximumTotal && restored <= maximumCount ? updates : null;
}

export function magusRecovery(actor) {
  const level = actor.classes?.magus?.system.levels;
  return Number.isInteger(level) && level >= 6 && level <= 20
    ? { maximumLevel: 5, maximumTotal: Math.ceil(level / 2) } : null;
}

export function refundResearch(wrapped, consumed, ...args) {
  if (["spell:au-mordenkainens-research", "magus:magical-recovery"].includes(this.item.flags.spikependium?.key)) {
    for (const { keyPath, delta } of consumed.actor ?? []) if (/^system\.spells\.(spell[1-5]|pact)\.value$/.test(keyPath) && delta > 0
      && foundry.utils.getProperty(this.actor, keyPath) < delta) {
      ui.notifications.warn("Восстановленные ячейки уже потрачены. Отмена не должна создавать отрицательный запас; разрешите изменение вручную."); return;
    }
  }
  return wrapped(consumed, ...args);
}

export function prepareChoiceDialog(activity, config, dialog) {
  const restoration = activity.item.flags.spikependium?.key === "feat:arcane-restoration";
  const research = activity.item.flags.spikependium?.key === "spell:au-mordenkainens-research";
  const magus = activity.item.flags.spikependium?.key === "magus:magical-recovery";
  const dragon = dragonSlot(activity);
  const hitDice = activity.consumption?.targets.some(t => t.type === "hitDice");
  const forge = !!activity.flags?.spikependium?.forge;
  const life = isLifeTransfer(activity);
  const finding = findingEnhancement(activity)?.resource.uses.value > 0;
  const guidance = activity.item.flags.spikependium?.key === "artificer:flash-of-genius"
    && (activity.actor.classes.artificer?.system.levels ?? 0) >= 20 && activity.actor.items.some(i => i.system.attuned);
  if (!restoration && !research && !magus && !dragon && !hitDice && !forge && !guidance && !life && !finding) return;
  config.spikependium = { ...config.spikependium, usageChoice: true };
  if (life || (forge && activity.flags.spikependium.forge !== "charge")) config.scaling = 0;
  const normalConsumption = structuredClone(config.consume);
  const normalCauseResources = config.cause?.resources;
  const normalScaling = config.scaling;
  const Base = dialog.applicationClass;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      if (life) context = appendLifeTransferFields(activity, this.config, context);
      if (forge) {
        context = appendTinkerFields(activity, this.config, context);
        context = await appendForgeFields(activity, this.config, context);
        context = await appendStorageFields(activity, this.config, context);
      }
      const { BooleanField, NumberField, StringField } = foundry.data.fields;
      if (finding) context.fields.push({ field: new BooleanField({ label: "Улучшенный поиск",
        hint: "Расходуется применение усиленной метки: выбранная цель не получает преимуществ невидимости на время концентрации. Выберите одну видимую цель до открытия окна." }),
        input: context.inputs.createCheckboxInput, name: "spikependium.improvedFinding", value: this.config.spikependium?.improvedFinding ?? false });
      if (guidance) context.fields.push({ field: new BooleanField({ label: "С бонусом проверка или спасбросок всё равно провален",
        hint: "Магическое руководство сохраняет использование Проблеска гениальности; реакция остаётся потраченной." }),
        input: context.inputs.createCheckboxInput, name: "spikependium.flashFailure", value: this.config.spikependium?.flashFailure ?? false });
      if (hitDice) {
        const choices = hitDieChoices(this.actor);
        context.fields.push({ field: new StringField({ label: "Кость хитов", required: true, blank: false,
          choices: Object.fromEntries(choices.map(c => [c.value, c.label])) }),
          name: "spikependium.hitDie",
          value: this.config.spikependium?.hitDie ?? choices[0]?.value });
      }
      if (restoration || research || magus) {
        const castLevel = research ? (this.actor.system.spells[this.config.spell?.slot]?.level ?? activity.item.system.level + (this.config.scaling ?? 0)) : 4;
        const recovery = magus ? magusRecovery(this.actor) : null;
        const maximum = magus ? (recovery?.maximumLevel ?? 0) : research ? (castLevel >= 8 ? 4 : castLevel >= 6 ? 3 : 2) : 4;
        const budget = magus ? (recovery?.maximumTotal ?? 0) : 4;
        for (const [key, slot] of Object.entries(this.actor.system.spells)) {
          const level = key === "pact" ? slot.level : Number(key.slice(5));
          if (!/^spell[1-5]$|^pact$/.test(key)
            || !level || level > maximum || slot.value >= slot.max) continue;
          context.fields.push({
            field: new NumberField({ integer: true, min: 0, max: Math.min(slot.max - slot.value, research ? 2 : Math.floor(budget / level)),
              label: `${key === "pact" ? "Магия договора" : "Ячейки"}: ${level} ур.` }),
            name: `spikependium.restore.${key}`, value: this.config.spikependium?.restore?.[key] ?? 0
          });
        }
        context.notes.push({ type: "info", message: research ? `Выберите одну или две потраченные ячейки не выше ${maximum}-го уровня.` : `Выберите потраченные ячейки. Сумма их уровней — не более ${budget}.${magus ? " Используйте после короткого отдыха; ячейки не выше 5-го уровня." : ""}` });
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
      } else if (dragon && this.config.spikependium?.dragonSlot) {
        data.consume = normalConsumption;
        if (this.config.cause) data.cause = { ...data.cause, resources: normalCauseResources };
        if (data.scaling == null) data.scaling = normalScaling;
      }
      return data;
    }
  };
}

export function applyChoiceConsumption(activity, config, message, updates) {
  if (["feat:arcane-restoration", "spell:au-mordenkainens-research", "magus:magical-recovery"].includes(activity.item.flags.spikependium?.key)) {
    const research = activity.item.flags.spikependium.key === "spell:au-mordenkainens-research", level = activity.item.system?.level;
    const magus = activity.item.flags.spikependium.key === "magus:magical-recovery";
    const recovery = magus ? magusRecovery(activity.actor) : null;
    if (magus && (!recovery || !updates.item.some(update => update._id === activity.item.id
      && update["system.uses.spent"] === activity.item.system.uses.spent + 1))) {
      ui.notifications.warn("Восстановление магии требует магуса 6-го уровня и расхода применения умения.");
      return false;
    }
    if (research && (!Number.isInteger(level) || level < 5 || level > 9)) return false;
    const plan = restorationPlan(activity.actor, config.spikependium?.restore, magus ? recovery : research
      ? { maximumLevel: level >= 8 ? 4 : level >= 6 ? 3 : 2, maximumTotal: Infinity, maximumCount: 2 } : {});
    if (!plan) {
      ui.notifications.warn(magus ? "Выберите доступные потраченные ячейки не выше 5-го уровня в пределах половины уровня магуса с округлением вверх." : research ? "Изыскания Морденкайнена: выберите одну или две доступные потраченные ячейки допустимого уровня." : "Выберите потраченные ячейки общей стоимостью от 1 до 4 уровней.");
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
