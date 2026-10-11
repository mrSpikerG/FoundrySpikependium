import { prepareForgeCreation } from "./forge.mjs";
import { prepareTinkering } from "./tinker.mjs";
import { prepareStorage, prepareStoredUsage } from "./storage.mjs";
import { prepareCompanionDeath, prepareLifeTransfer, isLifeTransfer } from "./companions.mjs";
import { prepareWhispersChoice } from "./whispers.mjs";
import { prepareDetectionUpdates } from "./dragonmark-detection.mjs";
import { prepareStormUpdates } from "./dragonmark-storm.mjs";
import { prepareFindingUpdates } from "./dragonmark-finding.mjs";
import { prepareHospitalityUpdates } from "./dragonmark-hospitality.mjs";
import { prepareExtraTargetUpdates } from "./dragonmark-targets.mjs";
import { preparePassageUpdates } from "./dragonmark-passage.mjs";
import { prepareMakingUpdates } from "./dragonmark-making.mjs";
import { prepareMovementUpdates } from "./dragonmark-movement.mjs";
import { prepareReactionUpdates } from "./reactions.mjs";

export function showResourceConsumption(activity, config, message) {
  const deltas = message.data?.system?.deltas;
  const resources = [...(deltas?.actor ?? []), ...Object.values(deltas?.item ?? {}).flat()];
  if (resources.some(d => d.keyPath.endsWith(".spent") && d.delta > 0)) {
    config.hasConsumption = true;
    message.hasConsumption = true;
  }
}

export function hitDieChoices(actor) {
  const available = new Map();
  for (const cls of Object.values(actor.classes)) {
    const { denomination, value } = cls.system.hd;
    if (value > 0) available.set(denomination, (available.get(denomination) ?? 0) + value);
  }
  return [...available].sort(([a], [b]) => Number(a.slice(1)) - Number(b.slice(1)))
    .map(([value, count]) => ({ value, label: `${value} (${count})` }));
}

export function hitDieOutcome(mode, value, temporary = 0) {
  if (!["surge", "inspiration"].includes(mode) || !Number.isInteger(value) || value < 1) return null;
  const temp = mode === "inspiration" || value % 2 === 0;
  return { value, damage: mode === "inspiration" || !temp ? value : 0,
    updates: temp ? { "system.attributes.hp.temp": Math.max(temporary, value) } : {} };
}

export function limitRestoration(activity, updates) {
  if (!activity.item.flags.spikependium?.key) return true;
  for (const update of updates.item) {
    const resource = activity.actor.items.get(update._id);
    const spent = update["system.uses.spent"];
    if (spent == null || !resource?.system.uses || spent >= resource.system.uses.spent) continue;
    if (resource.system.uses.spent === 0) return false;
    update["system.uses.spent"] = Math.max(0, spent);
  }
  for (const [path, value] of Object.entries(updates.actor)) {
    const match = path.match(/^system\.spells\.(spell[1-9]|pact)\.value$/);
    if (!match) continue;
    const slot = activity.actor.system.spells[match[1]];
    if (!slot || value <= slot.value) continue;
    const drainPath = `flags.spikependium.drainedSlots.${match[1]}`;
    const added = Math.max(0, (updates.actor[drainPath] ?? 0) - (activity.actor.flags.spikependium?.drainedSlots?.[match[1]] ?? 0));
    const maximum = slot.max + added;
    if (slot.value >= maximum) return false;
    updates.actor[path] = Math.min(maximum, value);
  }
  return true;
}

export async function prepareResourceUpdates(wrapped, config, ...args) {
  const targets = this.consumption.targets;
  const selected = config.spikependium?.hitDie;
  const consumesHitDie = config.consume !== false && targets.some((t, index) => t.type === "hitDice"
    && (config.consume === true || config.consume?.resources === true || config.consume?.resources?.includes(index)));
  if (selected && consumesHitDie) {
    if (!hitDieChoices(this.actor).some(c => c.value === selected)) {
      ui.notifications.warn("Выбранная кость хитов недоступна.");
      return false;
    }
    this.updateSource({ "consumption.targets": targets.map(t => ({ ...t.toObject(),
      ...(t.type === "hitDice" ? { target: selected } : {}) })) });
  }
  let updates = await wrapped(config, ...args);
  if (updates && !Array.isArray(updates)) {
    try {
      if (this.item.flags.spikependium?.key === "artificer:flash-of-genius" && config.spikependium?.flashFailure === true
        && (this.actor.classes.artificer?.system.levels ?? 0) >= 20 && this.actor.items.some(i => i.system.attuned)) {
        for (const update of updates.item) if (update._id === this.item.id) delete update["system.uses.spent"];
        updates.item = updates.item.filter(update => Object.keys(update).length > 1);
      }
      updates = this.flags.spikependium?.forge === "transmute" ? updates : await prepareForgeCreation(this, config, updates);
      if (updates) updates = await prepareTinkering(this, config, updates);
      if (updates) updates = await prepareStorage(this, config, updates);
      if (updates) updates = prepareStoredUsage(this, config, updates);
      if (updates) updates = prepareCompanionDeath(this, config, updates);
      if (updates) updates = await prepareLifeTransfer(this, config, updates);
      if (updates) updates = prepareWhispersChoice(this, config, updates);
      if (updates) updates = prepareDetectionUpdates(this, config, updates);
      if (updates) updates = prepareStormUpdates(this, config, updates);
      if (updates) updates = prepareFindingUpdates(this, config, updates);
      if (updates) updates = prepareHospitalityUpdates(this, config, updates);
      if (updates) updates = prepareExtraTargetUpdates(this, config, updates);
      if (updates) updates = await preparePassageUpdates(this, config, updates);
      if (updates) updates = prepareMakingUpdates(this, config, updates);
      if (updates) updates = prepareMovementUpdates(this, config, updates);
      if (updates) updates = prepareReactionUpdates(this, config, updates);
      if (updates && (this.flags.spikependium?.forge || isLifeTransfer(this))) updates.spikependium = { ...updates.spikependium,
        numericFlags: Object.entries(updates.actor).filter(([path, value]) => path.startsWith("flags.spikependium.") && typeof value === "number")
          .map(([keyPath, value]) => ({ keyPath, delta: value - (foundry.utils.getProperty(this.actor, keyPath) ?? 0) })) };
    }
    catch (error) {
      console.error("Spikependium: подготовка создаваемого предмета", error);
      ui.notifications.error("Не удалось подготовить операцию с предметом. Ресурсы не списаны.");
      return false;
    }
  }
  const mode = this.flags.spikependium?.hitDieOutcome;
  if (!updates || Array.isArray(updates) || !mode) return updates;
  const consumed = updates.item.find(update => {
    const cls = this.actor.items.get(update._id);
    return cls?.type === "class" && (update["system.hd.spent"] ?? update.system?.hd?.spent) > cls.system.hd.spent;
  });
  if (!consumed) return updates;
  const die = this.actor.items.get(consumed._id).system.hd.denomination;
  const roll = await new CONFIG.Dice.BasicRoll(`1${die}`, this.getRollData(), { flavor: "Кость хитов" }).evaluate();
  const result = hitDieOutcome(mode, roll.total, this.actor.system.attributes.hp.temp);
  if (!result) throw new Error("Invalid hit die outcome");
  Object.assign(updates.actor, result.updates);
  updates.rolls.push(roll);
  updates.spikependium = { hitDie: result };
  return updates;
}

export async function postHitDieDamage(activity, config, results) {
  const result = results.updates?.spikependium?.hitDie;
  if (!result?.damage) return;
  // Постоянное число сохраняет результат потраченной кости; нативная карточка учитывает сопротивления цели.
  await CONFIG.Dice.DamageRoll.build({ subject: activity, hookNames: ["damage"],
    rolls: [{ parts: [String(result.damage)], options: { type: "force", types: ["force"] } }]
  }, { configure: false }, { create: true, data: {
    type: "damage", flavor: `${activity.item.name} — результат кости хитов`,
    speaker: ChatMessage.getSpeaker({ actor: activity.actor }),
    system: { ...activity.messageSources, origin: results.message?.id, targets: results.message?.system.targets ?? [] }
  } });
}
