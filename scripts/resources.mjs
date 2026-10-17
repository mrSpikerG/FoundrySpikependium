import { prepareForgeCreation } from "./forge.mjs";
import { prepareFocusUpdates } from "./griffon-foci.mjs";
import { prepareStaffUpdates } from "./griffon-staves.mjs";
import { prepareStaffHitUpdates } from "./griffon-staff-hits.mjs";
import { prepareStaffFollowupUpdates } from "./griffon-staff-followups.mjs";
import { prepareThwackUpdates } from "./griffon-thwack.mjs";
import { prepareStationeryUpdates } from "./griffon-stationery.mjs";
import { prepareGauntletUpdates } from "./griffon-two-gloves.mjs";
import { prepareCloakUpdates } from "./griffon-two-cloaks.mjs";
import { preparePotionBreakUpdates } from "./potion-belt-breakage.mjs";
import { prepareBootsUpdates } from "./griffon-two-boots.mjs";
import { prepareHomewardUpdates } from "./homeward-boots.mjs";
import { prepareBeltUpdates } from "./griffon-two-belts.mjs";
import { prepareArcanistUpdates } from "./arcanist-casting.mjs";
import { prepareFocusCastingUpdates } from "./griffon-focus-casting.mjs";
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
import { prepareDodgeUpdates } from "./performer-dodge.mjs";
import { prepareDefenseUpdates } from "./performer-defense.mjs";
import { prepareRavenousUpdates } from "./hollow-ravenous.mjs";
import { prepareHollowActionUpdates } from "./hollow-aura.mjs";
import { prepareOriginSaveBoostUpdates } from "./arcana-save-boost.mjs";
import { prepareArcanaStageUpdates } from "./arcana-stages.mjs";
import { prepareBansheeUpdates } from "./arcana-banshee.mjs";
import { prepareWaveUpdates } from "./arcana-waves.mjs";
import { prepareEnervationUpdates } from "./arcana-enervation.mjs";
import { prepareEnthrallmentUpdates } from "./arcana-enthrallment.mjs";
import { prepareLanternUpdates } from "./arcana-lantern.mjs";
import { prepareDistanceUpdates } from "./arcana-distance.mjs";
import { prepareDragonUpdates } from "./arcana-dragon.mjs";
import { prepareDuelUpdates } from "./arcana-duel.mjs";
import { prepareFateUpdates } from "./arcana-fate.mjs";
import { prepareForeknowledgeUpdates } from "./arcana-foreknowledge.mjs";
import {preparePainCastingUpdates} from "./pain-casting.mjs";
import { prepareCombatFamiliarUpdates } from "./combat-familiar.mjs";
import { prepareOtherworldlyUpdates } from "./otherworldly-familiar.mjs";
import { prepareElementalUpdates } from "./elemental-familiar.mjs";
import { prepareWarlikeUpdates } from "./warlike-familiar.mjs";
import { prepareTrickUpdates } from "./spell-trickster.mjs";
import { schoolSlotRecharge } from "./arcana-schools.mjs";
import { prepareSchoolBenefitUpdates } from "./school-cast-benefits.mjs";
import { prepareSpellMightUpdates } from "./arcana-spell-might.mjs";
import { prepareCunningUpdates } from "./cunning-actions.mjs";
import { prepareBloomUpdates } from "./arcana-bloom.mjs";
import { prepareAnimationUpdates } from "./magus-animation.mjs";
import { prepareAlchemistBombUpdates } from "./alchemist-bombs.mjs";
import { prepareAlchemistCreation, prepareAlchemistSummonUpdates } from "./alchemist-creatures.mjs";
import { prepareGriffonTwoUpdates } from "./griffon-two-items.mjs";
import { prepareGriffonArmorUpdates } from "./griffon-armor.mjs";
import { prepareSweetUpdates } from "./griffon-sweets.mjs";
import { prepareGriffonShieldUpdates } from "./griffon-two-shields.mjs";
import { prepareGriffonTwoArmorUpdates } from "./griffon-two-armor.mjs";
import { prepareConditionalArmorUpdates } from "./griffon-conditional-armor.mjs";
import { prepareArtifactArmorUpdates } from "./griffon-artifact-armor.mjs";
import { prepareTwoWeaponUpdates } from "./griffon-two-weapons.mjs";
import { prepareConjurerRecharge } from "./book-conjurer.mjs";
import { prepareDurableUpdates } from "./conjurer-durable.mjs";

export function grantedSpellUsageConfig(wrapped, ...args) {
  const config = wrapped(...args), item = this.item;
  if (item?.type !== "spell" || config.consume === false) return config;
  const [featId, advancementId] = item.flags.dnd5e?.advancementOrigin?.split(".") ?? [];
  const feat = this.actor?.items.get(featId);
  const advancement = feat?.system.advancement?.find(a => (a.id ?? a._id) === advancementId);
  const uses = advancement?.configuration.spell?.uses;
  const added = advancement?.value.added ?? {};
  const granted = advancement?.type === "ItemGrant" ? Object.hasOwn(added, item.id)
    : advancement?.type === "ItemChoice" && Object.values(added).some(ids => Object.hasOwn(ids, item.id));
  if (!feat?.flags.spikependium?.key || !granted || !uses?.max || !uses.per || uses.requireSlot) return config;
  const linked = this.getLinkedActivity(config.cause?.activity);
  if (linked?.type !== "forward" || linked.item.uuid !== item.uuid
    || !linked.consumption.targets.some(t => t.type === "itemUses" && !t.target && Number(t.value) === 1)) return config;
  // Native Forward disables base resources as well as slots; these grants waive only the slot.
  config.consume = { ...config.consume, resources: true, spellSlot: false };
  config.cause.resources = true;
  return config;
}

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
      if (updates) updates = prepareOriginSaveBoostUpdates(this, config, updates);
      if (updates) updates = prepareArcanaStageUpdates(this, config, updates);
      if (updates) updates = prepareBansheeUpdates(this, config, updates);
      if (updates) updates = prepareWaveUpdates(this, config, updates);
      if (updates) updates = prepareEnervationUpdates(this, config, updates);
      if (updates) updates = prepareEnthrallmentUpdates(this, config, updates);
      if (updates) updates = prepareLanternUpdates(this, config, updates);
      if (updates) updates = prepareDistanceUpdates(this, config, updates);
      if (updates) updates = prepareDragonUpdates(this, config, updates);
      if (updates) updates = prepareDuelUpdates(this, config, updates);
      if (updates) updates = prepareFateUpdates(this, config, updates);
      if (updates) updates = prepareForeknowledgeUpdates(this, config, updates);
      if (updates) updates = prepareCombatFamiliarUpdates(this, config, updates);
      if (updates) updates = prepareOtherworldlyUpdates(this, config, updates);
      if (updates) updates = prepareElementalUpdates(this, config, updates);
      if (updates) updates = prepareWarlikeUpdates(this, config, updates);
      if (updates) updates = prepareBloomUpdates(this, config, updates);
      if (updates) updates = prepareAnimationUpdates(this, config, updates);
      if (updates) updates = prepareAlchemistBombUpdates(this, config, updates);
      if (updates) updates = await prepareAlchemistCreation(this, config, updates);
      if (updates) updates = prepareAlchemistSummonUpdates(this, config, updates);
      if (updates) updates = await prepareGriffonTwoUpdates(this, config, updates);
      if (updates) updates = await prepareTwoWeaponUpdates(this, config, updates);
      if (updates) updates = await prepareFocusUpdates(this, config, updates);
      if (updates) updates = prepareStaffUpdates(this, config, updates);
      if (updates) updates = prepareStaffHitUpdates(this, config, updates);
      if (updates) updates = prepareStaffFollowupUpdates(this, config, updates);
      if (updates) updates = await prepareThwackUpdates(this, config, updates);
      if (updates) updates = await prepareStationeryUpdates(this, config, updates);
      if (updates) updates = prepareGauntletUpdates(this, config, updates);
      if (updates) updates = prepareCloakUpdates(this, config, updates);
      if (updates) updates = prepareBeltUpdates(this, config, updates);
      if (updates) updates = prepareBootsUpdates(this, config, updates);
      if (updates) updates = prepareHomewardUpdates(this, config, updates);
      if (updates) updates = await preparePotionBreakUpdates(this, config, updates);
      if (updates) updates = await prepareFocusCastingUpdates(this, config, updates);
      if (updates) updates = prepareGriffonArmorUpdates(this, config, updates);
      if (updates) updates = prepareGriffonShieldUpdates(this, config, updates);
      if (updates) updates = prepareGriffonTwoArmorUpdates(this, config, updates);
      if (updates) updates = prepareConditionalArmorUpdates(this, config, updates);
      if (updates) updates = prepareArtifactArmorUpdates(this, config, updates);
      if (updates) updates = await prepareSweetUpdates(this, config, updates);
      if (updates) updates = prepareCunningUpdates(this, config, updates);
      if (updates) updates = prepareDodgeUpdates(this, config, updates);
      if (updates) updates = prepareDefenseUpdates(this, config, updates);
      if (updates) updates = prepareRavenousUpdates(this, config, updates);
      if (updates) updates = prepareHollowActionUpdates(this, config, updates);
      if (updates) updates = await prepareArcanistUpdates(this, config, updates);
      if (updates) updates = schoolSlotRecharge(this, config, updates);
      if (updates) updates = prepareSchoolBenefitUpdates(this, config, updates);
      if (updates) updates = prepareSpellMightUpdates(this, config, updates);
      if (updates) updates = preparePainCastingUpdates(this,config,updates);
      if (updates) updates = prepareTrickUpdates(this,config,updates);
      if (updates) updates = prepareConjurerRecharge(this,config,updates);
      if (updates) updates = prepareDurableUpdates(this,config,updates);
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
