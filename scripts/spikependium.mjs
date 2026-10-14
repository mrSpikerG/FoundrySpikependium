// Spikependium — интеграция с системой dnd5e и модулем Babele.
import { SPELL_LISTS, SOURCE_BOOKS } from "./generated.mjs";
import { prepareMagusDiceDialog, registerMagusDice, recordMagusDice, prepareMagusDiceHealing, canConsumeMagusSpell, guardMagusHealing } from "./magus-spells.mjs";
import { prepareSummon, canRefuel, hasReanimatedCompanion } from "./summons.mjs";
import { prepareFeatSave, preparePactUsage, prepareGrantedSpell, prepareSpiritsGuidance, prepareAbilityAdvancement, prepareFormConsumption, toggleRadiantLight, conditionalState, applyTurnLimit, prepareUpdatedSpell, validateMutableForm } from "./mechanics.mjs";
import { prepareChoiceDialog, applyChoiceConsumption, refundResearch } from "./choices.mjs";
import { prepareAuraCondition, refreshSceneAuras, endEffectsOnDamage, endSceneEffects, applySelfEffects } from "./effects.mjs";
import { prepareResourceUpdates, postHitDieDamage, limitRestoration, showResourceConsumption } from "./resources.mjs";
import { commandCompanion, canCompanionAct, updateCompanions, recordCompanionRest, recordCompanionDeath, canUseCompanionDeath, recordCompanionStatus, isLifeTransfer, prepareCompanionUsage, rollLifeHealing, canCreateCompanionMessage, prepareCompanionDamage, calculateCompanionDamage, rollCompanionStrike, prepareCompanionAbsorption, bigExplosionDamageConfig, validateExplosionBonus, recordWetHits, triggerWetResponses } from "./companions.mjs";
import { prepareBlueprintAdvancement, finishForge, cleanForgeItems } from "./forge.mjs";
import { addDrainedSlots, expireDrainedSlots, recordForgeConsumption, restoreForgeSelection, refundTinkering, recordSoulDamage, resetSoulDeath } from "./tinker.mjs";
import { storedCachedSpell, storedItemRollData, storedActivityRollData, prepareStoredCast, canUseStoredSpell, preserveStoredCache, cleanStoredCaches } from "./storage.mjs";
import { canUseConduitActivity, recordConduitCast, prepareConduitRoll, finalizeConduitRoll, finishConduitRoll, prepareConduitCastingDialog, requireConduitCastingDialog, prepareConduitCasting, describeConduitCasting, restoreConduitActivity, conduitUsageToken, validateConduitTemplate, attachConduitTemplate } from "./conduit.mjs";
import { prepareWhispersDialog, chooseWhispersAfterRest, describeWhispers } from "./whispers.mjs";
import { chooseThinFear, syncThinFear, thinEffectChanges, prepareThinSave } from "./thin.mjs";
import { recordStrikeHits, applyStrikeHits, prepareOpportunityRoll, validateOpportunityRoll } from "./opportunity.mjs";
import { registerPushMovement, recordBigPush, chooseBigPush, bigPushSnapshots } from "./push.mjs";
import { canUseVestigePocket, canSummonVestige, canConsumeVestigeSummon, handleVestigePocket, endDeadOwnerPockets } from "./pocket.mjs";
import { canUseVestigeAura, recordVestigeAuraUsage, activateVestigeAura, vestigeAuraUsageToken, validateVestigeAuraTemplate, attachVestigeAuraTemplate, vestigeAuraEffectChanges, prepareVestigeAuraCondition, recordVestigeSurvival, finishVestigeSurvival, upgradeVestigeAuraEffects, endExpiredVestigeAuras } from "./vestige-aura.mjs";
import { canUseVestigeRestForm, recordVestigeFormConfig, prepareVestigeRestConfig, placeVestigeRestForm, createVestigeRestForm, finishVestigeForms, resumeVestigeFormRequests, offerVestigeFormAfterRest, canModifyVestigeForm, rememberVestigeType, endDeletedVestigeForm } from "./vestige-forms.mjs";
import { recordVestigeRest, finishVestigeRecovery, recordVestigeCunning, recordVestigePowerSpent } from "./vestige-rest.mjs";
import { canUseVestigePower, recordVestigePower, vestigeCurseChanges, applyVestigeCurse, prepareVestigeCurseAttack, finalizeVestigeCurseAttack, recordVestigeTouch, finishVestigeTouch } from "./vestige-powers.mjs";
import { registerVestigeSwapMovement, canUseVestigeSwap, recordVestigeSwap, handleVestigeSwap, resumeVestigeSwaps, canActDuringVestigeSwap } from "./vestige-swap.mjs";
import { prepareDragonmarkCheck, buildDragonmarkCheck, finalizeDragonmarkCheck, prepareDragonmarkHealing, finalizeDragonmarkHealing, canUseDragonmarkActivity,
  prepareFortitudeSave, buildFortitudeSave, finalizeFortitudeSave, consumeFortitudeSave, canConsumeFortitude } from "./dragonmark-rolls.mjs";
import { canUseDetectionModifier, prepareDetectionDialog, applyDetectionInitiative, finalizeDetectionInitiative,
  combatantDetectionInitiative } from "./dragonmark-detection.mjs";
import { canUseStormModifier, prepareStormDialog, prepareStormConcentration, finalizeStormMovement } from "./dragonmark-storm.mjs";
import { canUseFindingModifier, captureFindingTarget, prepareFindingConcentration, prepareFindingActorEffects,
  refreshFindingTargets, observeFindingHp, guardFindingUpdate } from "./dragonmark-finding.mjs";
import { canUseHospitalityModifier, prepareHospitalityDialog, captureHospitalityTargets, recordHospitalityCast,
  applyHospitalityCast, resumeHospitalityCasts } from "./dragonmark-hospitality.mjs";
import { canUseExtraTargetModifier, prepareExtraTargetDialog, captureExtraTargets, recordExtraTargetCast, extraTargetEffectChanges,
  applyExtraTargetCast, resumeExtraTargetCasts, endWardingOnArmor, prepareExtraTargetConcentration } from "./dragonmark-targets.mjs";
import { captureShadowSpell, recordShadowSpell, prepareShadowAttack, finalizeShadowAttack, finishShadowAttack,
  applyShadowEndingMessage, recordShadowDamage, finishShadowDamage, prepareShadowConcentrationDelete,
  endShadowConcentration, resumeShadowEndings } from "./dragonmark-shadow.mjs";
import { registerPassageMovement, canUsePassageModifier, preparePassageDialog, capturePassage, recordPassageCast,
  passageChatButtons, applyPassageCast, resumePassageCasts, canActDuringPassage } from "./dragonmark-passage.mjs";
import { canUseMakingModifier, prepareMakingDialog, recordMakingCast, applyMakingEnchantment, prepareMakingEnchantment,
  makingSuppression, makingEffectChange, makingArmorState, prepareMakingAttack, buildMakingAttack, finalizeMakingAttack,
  consumeMakingAttack, refreshMaking } from "./dragonmark-making.mjs";
import { canUseMovementModifier, prepareMovementDialog, captureMovementTarget, recordMovementCast,
  applyMovementCast, resumeMovementCasts, movementMarkCost, refreshMovementMarks } from "./dragonmark-movement.mjs";
import { canUseReaction, reactionUse, recordReaction, recordReactionConsumption, reactionDeltaLabel, finishReaction, resumeReactions } from "./reactions.mjs";
import { performerDodgeUse, performerDodgeDamage } from "./performer-dodge.mjs";
import { canUseGriffonItem, griffonUse } from "./griffon-items.mjs";
Hooks.on("dnd5e.preUseActivity", canUseGriffonItem);
import { canUseArchhag, prepareArchhagTargets, prepareCovenDialog } from "./archhag.mjs";
import { defensiveCharmUse, defensiveCharmDamage, recordDefenseUsage, recordDefenseConsumption,
  defenseDeltaLabel, resumeDefensiveCharms, resumeActorDefense, clearDeletedDefense } from "./performer-defense.mjs";
import { registerHandlingMovement, canUseHandlingModifier, recordHandlingHits, chooseHandling, isHandlingAttack, validateHandlingAttack,
  handlingRollAttack, resumeHandling, handlingFalling, handlingMovementCost, handlingHits } from "./dragonmark-handling.mjs";
import { registerGuardianMovement, canUseGuardian, prepareGuardianDialog, recordGuardianAttack, chooseGuardian, resumeGuardian,
  guardianApplyDamage, guardianCardDamage } from "./dragonmark-guardian.mjs";
import { captureAttackDamage, guardianEvaluatedTargets, guardianRecords } from "./attack-source.mjs";
import { wetHitSnapshots } from "./companions.mjs";
import { strikeHitSnapshots } from "./opportunity.mjs";
import { prepareHollowConcentration, hollowArmorSuppression } from "./hollow-warden.mjs";
import { recordRavenousHit, canUseRavenous, prepareRavenousDialog, recordRavenousUse, rollRavenousHealing,
  ravenousApplyDamage, recordRavenousHealing, chooseRavenousHeal } from "./hollow-ravenous.mjs";
import { prepareOriginCheck, buildOriginCheck, finalizeOriginCheck, prepareOriginInspirationDialog,
  canUseOriginInspiration, applyOriginInspiration, prepareOriginGrantedAbility } from "./arcana-origin.mjs";
import { recordArtistIllusion, prepareArtistDialog, captureArtistInspiration, recordArtistInspiration,
  syncArtistInspiration, resumeArtistInspirations } from "./arcana-artist.mjs";
import { prepareAmityCheck, buildAmityCheck, finalizeAmityCheck } from "./arcana-amity.mjs";
import { monsterEvasionDamage } from "./monster-evasion.mjs";
import { prepareEvasionSave, buildEvasionSave, finalizeEvasionSave } from "./arcana-evasion.mjs";
import { magicWarriorAdd } from "./arcana-warrior.mjs";
import { prepareBloomDialog, captureBloom, canUseBloom, recordBloomConsumption, recordBloomArea, registerBloomDice,
  bloomChatButtons, bloomChatAction, syncBloomHealing, recordBloomHealing, resumeBloomHealing, rollBloomHealing } from "./arcana-bloom.mjs";
import { prepareBugbearGrab, canUseBugbearGrab } from "./bugbear-grab.mjs";
import { cunningUse, recordCunningConsumption, cunningDeltaLabel } from "./cunning-actions.mjs";
import { recordDisengageUse, syncDisengage, cleanDisengage, resumeDisengage } from "./cunning-disengage.mjs";
import { prepareHideDialog, canUseHide, recordHideUse, rollHide, canRollHide, syncHide, endHideOnAttack, endHideOnSpell, cleanHide, resumeHide } from "./cunning-hide.mjs";
import { canUseOriginSurge, prepareOriginSurge, finalizeOriginSurge, consumeOriginSurge } from "./arcana-surge.mjs";
import { anatomyStrideChange, prepareAnatomySave, buildAnatomySave, finalizeAnatomySave } from "./arcana-anatomy.mjs";
import { canUseArcanaStage, prepareArcanaStage, captureArcanaStage, recordDetonateCast, prepareDetonateSave, arcanaStageScaling,
  recordArcanaStageConsumption,arcanaStageDeltaLabel,prepareGroundDamage,groundDamage } from "./arcana-stages.mjs";
import { recordOriginSaveWindow, prepareOriginSaveBoost, captureOriginSaveBoost, recordOriginSaveBoostConsumption,
  recordOriginSaveBoostUsage, canRollOriginSaveBoost, rollOriginSaveBoost, resumeOriginSaveBoosts,
  originSaveBoostDeltaLabel, originSaveBoostError, resilientSaveUse } from "./arcana-save-boost.mjs";

import { recordMonsterMovement, endMonsterApproach, recordMonsterAttack, prepareMonsterDamage, useMonsterMultiattack, prepareMonsterAttack, prepareMonsterSave, canUseMonsterWeapon } from "./monster-actions.mjs";
import { canUseMonsterActivity, recordMonsterEffect, syncMonsterEffects, monsterDrainHealing, endDeadAbolethCharms, monsterLegendaryRecovery, monsterError } from "./monster-effects.mjs";
import { recordAbolethCalculation, recordAbolethDamage, abolethApplyDamage, syncAbolethRepeat, resumeAbolethDomination } from "./aboleth-domination.mjs";
import { abolethWaterButtons, abolethWaterAction, restrictAbolethHealing, guardAbolethHPUpdate } from "./aboleth-water.mjs";
import { recordAbolethCurseDamage, resumeAbolethCurse } from "./aboleth-curse.mjs";
import { abolethEndTurn, resumeMucusCloud } from "./aboleth-cloud.mjs";
import { recordSoulTomeDestruction, finishSoulTomeDestruction, resumeSoulTomes, releaseSoulTomePrisons, soulTomeEndTurn, prepareSoulTomeRest, renderSoulTomeDamage, soulTomeError } from "./soul-tome.mjs";
import { recordSoulClawAttack, syncSoulClawAttack, resumeSoulClawAttacks } from "./soul-claw.mjs";
import { soulPrisonButtons, soulPrisonAction, syncSoulPrisonRepeat, soulPrisonEndTurn, resumeSoulPrisonRepeats } from "./soul-prison.mjs";
import { canUseArcanaSpell, recordArcanaCast, syncArcanaCast, syncArcanaRepeat, cureIronBody,
  guardIronExhaustion, arcanaEndTurn, resumeArcanaSpells, arcanaSpellError, registerArcanaMaterials, arcanaSpellSuppression, canConsumeArcanaSpell } from "./arcana-spells.mjs";
import { arcanaStartTurn, resumeArcanaTicks, recordArcanaTickDamage } from "./arcana-periodic.mjs";
import { observeCatnap, prepareCatnapRest, finishCatnap, canUseArcanaShake, awakeningChatButtons, awakeningChatAction, finishArcanaShake } from "./arcana-awakening.mjs";
import { recordArcanaSummonCast, arcanaSummonChatAction, canPlaceArcanaSpirit, prepareArcanaSpirit, sortArcanaSpirits, updateArcanaSpirits,
  recordArcanaSpiritAttack, prepareArcanaSpiritDamage, applyArcanaSpiritHits, recordArcanaSpiritPlaced, applyArcanaCharge } from "./arcana-summons.mjs";
import { escapeChatButtons, escapeChatAction, canPayArcanaEscape, recordArcanaEscapePayment, finishArcanaEscape, escapePaymentButtons, refundArcanaEscape } from "./arcana-spirit-actions.mjs";

Hooks.on("dnd5e.preUseActivity", canPayArcanaEscape);
Hooks.on("dnd5e.preActivityConsumption", canPayArcanaEscape);
Hooks.on("dnd5e.activityConsumption", recordArcanaEscapePayment);
for (const hook of ["createChatMessage", "updateChatMessage"]) Hooks.on(hook, message => {
  finishArcanaEscape(message).catch(arcanaSpellError);
  applyArcanaCharge(message).catch(arcanaSpellError);
});
for (const hook of ["ready", "canvasReady"]) Hooks.on(hook, () => {
  for (const message of game.messages) {
    if (message.flags.spikependium?.arcanaEscape) finishArcanaEscape(message).catch(arcanaSpellError);
    if (message.type === "damage" && message.flags.spikependium?.attackSource) applyArcanaCharge(message).catch(arcanaSpellError);
  }
});

Hooks.on("dnd5e.preCreateUsageMessage", recordArcanaSummonCast);
Hooks.on("dnd5e.preSummon", canPlaceArcanaSpirit);
Hooks.on("dnd5e.preSummonToken", prepareArcanaSpirit);
Hooks.on("dnd5e.postSummon", (...args) => recordArcanaSpiritPlaced(...args).catch(arcanaSpellError));
Hooks.on("preCreateChatMessage", recordArcanaSpiritAttack);
Hooks.on("preCreateChatMessage", recordSoulClawAttack);
for (const hook of ["createChatMessage", "updateChatMessage"]) Hooks.on(hook, message => syncSoulClawAttack(message).catch(monsterError));
for (const hook of ["ready", "canvasReady", "updateScene"]) Hooks.on(hook, () => resumeSoulClawAttacks().catch(monsterError));
Hooks.on("dnd5e.preUseActivity", canUseMonsterActivity);
Hooks.on("dnd5e.preActivityConsumption", canUseMonsterActivity);
Hooks.on("dnd5e.preUseActivity", (activity, config, dialog, message) => {
  prepareCovenDialog(activity, config, dialog);
  prepareArchhagTargets(activity, config, dialog, message);
  return canUseArchhag(activity, config, dialog, message);
});
Hooks.on("dnd5e.preActivityConsumption", canUseArchhag);
Hooks.on("dnd5e.preCreateUsageMessage", recordMonsterEffect);
Hooks.on("dnd5e.preCreateUsageMessage", recordDefenseUsage);
Hooks.on("dnd5e.postActivityConsumption", recordDefenseConsumption);
for (const hook of ["createChatMessage", "updateChatMessage", "deleteChatMessage"])
  Hooks.on(hook, message => resumeDefensiveCharms(message).catch(monsterError));
Hooks.on("ready", () => resumeDefensiveCharms().catch(monsterError));
Hooks.on("updateActor", actor => resumeActorDefense(actor).catch(monsterError));
Hooks.on("updateToken", token => resumeActorDefense(token.actor).catch(monsterError));
Hooks.on("deleteChatMessage", message => clearDeletedDefense(message).catch(monsterError));
Hooks.on("dnd5e.postUseActivity", (...args) => monsterDrainHealing(...args).catch(monsterError));
for (const hook of ["createChatMessage", "updateChatMessage"]) Hooks.on(hook, message => syncMonsterEffects(message).catch(monsterError));
Hooks.on("ready", () => { for (const message of game.messages) if (message.flags.spikependium?.monsterCast) syncMonsterEffects(message).catch(monsterError); });
for (const hook of ["ready", "updateActor", "updateActorDelta", "updateActiveEffect", "createActiveEffect"])
  Hooks.on(hook, () => endDeadAbolethCharms().catch(monsterError));
Hooks.on("dnd5e.preApplyDamage", recordAbolethDamage);
Hooks.on("dnd5e.calculateDamage", recordAbolethCalculation);
Hooks.on("dnd5e.preCalculateDamage", restrictAbolethHealing);
Hooks.on("dnd5e.preApplyDamage", recordAbolethCurseDamage);
for (const hook of ["ready", "canvasReady", "createChatMessage", "updateChatMessage"])
  Hooks.on(hook, () => resumeMucusCloud().catch(monsterError));
for (const hook of ["ready", "canvasReady", "updateWorldTime", "updateActor", "updateActorDelta", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"])
  Hooks.on(hook, () => resumeAbolethCurse().catch(monsterError));
Hooks.on("preUpdateActor", guardAbolethHPUpdate);
Hooks.on("preUpdateActorDelta", (delta, changed) => guardAbolethHPUpdate(delta.parent.actor, changed));
for (const hook of ["createChatMessage", "updateChatMessage"]) Hooks.on(hook, message => syncAbolethRepeat(message).catch(monsterError));
for (const hook of ["ready", "canvasReady", "updateWorldTime", "updateToken", "deleteToken", "updateActor", "updateActorDelta", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"])
  Hooks.on(hook, () => resumeAbolethDomination().catch(monsterError));
Hooks.on("dnd5e.preRollAttackV2", prepareMonsterAttack);
Hooks.on("dnd5e.preRollAttackV2", config => canUseMonsterWeapon(config.subject));
Hooks.on("dnd5e.preRollSavingThrowV2", prepareMonsterSave);
Hooks.on("dnd5e.preUseActivity", prepareBloomDialog);
Hooks.on("dnd5e.preActivityConsumption", captureBloom);
Hooks.on("dnd5e.preActivityConsumption", canUseBloom);
Hooks.on("dnd5e.postActivityConsumption", recordBloomConsumption);
Hooks.on("dnd5e.postUseActivity", (...args) => recordBloomArea(...args).catch(monsterError));
Hooks.on("dnd5e.preApplyDamage", recordBloomHealing);
for (const event of ["createChatMessage", "updateChatMessage"])
  Hooks.on(event, message => syncBloomHealing(message).catch(monsterError));
for (const event of ["ready", "updateUser"])
  Hooks.on(event, () => resumeBloomHealing().catch(monsterError));
Hooks.on("dnd5e.preRollSavingThrowV2", prepareEvasionSave);
Hooks.on("dnd5e.postBuildSavingThrowRollConfig", buildEvasionSave);
Hooks.on("dnd5e.postSavingThrowRollConfiguration", finalizeEvasionSave);
Hooks.on("dnd5e.preUseActivity", canUseMonsterWeapon);
Hooks.on("preUpdateItem", recordSoulTomeDestruction);
Hooks.on("dnd5e.renderChatMessage", renderSoulTomeDamage);
Hooks.on("updateItem", item => finishSoulTomeDestruction(item).then(() => releaseSoulTomePrisons(item)).catch(soulTomeError));
Hooks.on("dnd5e.preRestCompleted", prepareSoulTomeRest);
for (const hook of ["ready", "canvasReady"]) Hooks.on(hook, () => resumeSoulTomes().catch(soulTomeError));
for (const hook of ["createChatMessage", "updateChatMessage"]) Hooks.on(hook, message => syncSoulPrisonRepeat(message).catch(soulTomeError));
for (const hook of ["ready", "canvasReady", "updateUser"]) Hooks.on(hook, () => resumeSoulPrisonRepeats().catch(soulTomeError));
Hooks.on("dnd5e.preRollDamageV2", prepareArcanaSpiritDamage);
for (const hook of ["createChatMessage", "updateChatMessage"]) Hooks.on(hook, message => applyArcanaSpiritHits(message).catch(arcanaSpellError));
for (const hook of ["ready", "canvasReady"]) Hooks.on(hook, () => {
  for (const message of game.messages) if (message.flags.spikependium?.arcanaSpiritAttack) applyArcanaSpiritHits(message).catch(arcanaSpellError);
});
for (const hook of ["dnd5e.postSummon", "ready", "canvasReady", "updateWorldTime", "updateActor", "updateActorDelta", "createActiveEffect", "deleteActiveEffect", "updateActiveEffect", "createCombatant", "updateCombatant", "createCombat", "updateToken", "deleteToken"])
  Hooks.on(hook, () => updateArcanaSpirits().catch(arcanaSpellError));

Hooks.on("dnd5e.preCreateUsageMessage", recordArcanaCast);
Hooks.on("dnd5e.preActivityConsumption", canConsumeArcanaSpell);
Hooks.on("dnd5e.preUseActivity", canUseArcanaShake);
Hooks.on("dnd5e.preActivityConsumption", canUseArcanaShake);
Hooks.on("dnd5e.preRestCompleted", prepareCatnapRest);
for (const hook of ["createChatMessage", "updateChatMessage"]) Hooks.on(hook, message => finishArcanaShake(message).catch(arcanaSpellError));
for (const hook of ["createActiveEffect", "updateActiveEffect"]) Hooks.on(hook, effect => observeCatnap(effect).then(() => finishCatnap()).catch(arcanaSpellError));
Hooks.on("deleteActiveEffect", effect => observeCatnap(effect, true).then(() => finishCatnap()).catch(arcanaSpellError));
for (const hook of ["updateWorldTime", "updateActor", "updateActorDelta", "updateItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"])
  Hooks.on(hook, () => finishCatnap().catch(arcanaSpellError));
for (const hook of ["ready", "canvasReady"]) Hooks.on(hook, () => finishCatnap(true).catch(arcanaSpellError));
for (const hook of ["ready", "canvasReady"]) Hooks.on(hook, () => {
  for (const message of game.messages) if (message.flags.spikependium?.arcanaShake) finishArcanaShake(message).catch(arcanaSpellError);
});
for (const hook of ["createChatMessage", "updateChatMessage", "deleteChatMessage"]) Hooks.on(hook, message => {
  syncArcanaCast(message).catch(arcanaSpellError);
  syncArcanaRepeat(message).catch(arcanaSpellError);
});
for (const hook of ["createActiveEffect", "updateActiveEffect"]) Hooks.on(hook, effect => cureIronBody(effect).catch(arcanaSpellError));
Hooks.on("preCreateActiveEffect", guardIronExhaustion);
Hooks.on("preUpdateActiveEffect", guardIronExhaustion);
for (const hook of ["ready", "canvasReady"]) Hooks.on(hook, () => resumeArcanaSpells().catch(arcanaSpellError));
for (const hook of ["ready", "canvasReady"]) Hooks.on(hook, () => resumeArcanaTicks().catch(arcanaSpellError));
Hooks.on("dnd5e.preApplyDamage", recordArcanaTickDamage);
import { relentlessApplyDamage, relentlessUpdate, relentlessOnUpdate, recordRelentlessDamage, canUseRelentless, resumeRelentless, relentlessDeltaLabel } from "./hollow-relentless.mjs";

Hooks.on("dnd5e.preApplyDamage", recordRelentlessDamage);
Hooks.on("dnd5e.preUseActivity", canUseRelentless);
Hooks.on("dnd5e.preActivityConsumption", canUseRelentless);
for (const hook of ["updateActor", "updateActorDelta", "ready", "canvasReady"]) Hooks.on(hook, () => resumeRelentless().catch(error => {
  console.error("Spikependium: Неослабевающая охота", error);
  ui.notifications.error("Не удалось восстановить карточку Неослабевающей охоты. Проверьте записанные хиты и ячейки.");
}));
import { startHollowAuras, syncHollowAura, prepareHollowSave, resumeHollowAuras, canUseHollowAction, hollowActionUse,
  recordHollowActionConsumption, hollowActionDeltaLabel, prepareHollowDamage, recordHollowDamage, hollowAuraChatButtons, hollowAuraChatAction, endHollowAuraEffects } from "./hollow-aura.mjs";

function hollowAuraError(error) { console.error("Spikependium: Тревожная аура", error); ui.notifications.error("Не удалось завершить последствия ауры. Проверьте карточку начала хода; Мастер может завершить её или отметить ручное разрешение."); }
Hooks.on("updateCombat", (...args) => startHollowAuras(...args).catch(hollowAuraError));
Hooks.on("preCreateChatMessage", prepareHollowSave);
for (const hook of ["createChatMessage", "updateChatMessage", "deleteChatMessage"]) Hooks.on(hook, message => syncHollowAura(message).catch(hollowAuraError));
for (const hook of ["ready", "canvasReady"]) Hooks.on(hook, () => resumeHollowAuras().catch(hollowAuraError));
for (const hook of ["updateCombat", "deleteCombat", "deleteToken", "ready", "canvasReady"]) Hooks.on(hook, () => endHollowAuraEffects().catch(hollowAuraError));
Hooks.on("dnd5e.preUseActivity", canUseHollowAction);
Hooks.on("dnd5e.preActivityConsumption", canUseHollowAction);
Hooks.on("dnd5e.postActivityConsumption", recordHollowActionConsumption);
Hooks.on("dnd5e.preRollDamageV2", prepareHollowDamage);
Hooks.on("dnd5e.preApplyDamage", recordHollowDamage);

Hooks.on("recordToken", recordMonsterMovement);
Hooks.on("preCreateChatMessage", recordMonsterAttack);
Hooks.on("createChatMessage", endMonsterApproach);
Hooks.on("dnd5e.preRollDamageV2", prepareMonsterDamage);
Hooks.on("dnd5e.postUseActivity", (...args) => useMonsterMultiattack(...args).catch(error => {
  console.error("Spikependium: мультиатака", error);
  ui.notifications.error("Не удалось завершить мультиатаку. Проверьте уже выполненные атаки в чате; оставшиеся действия доступны на листе.");
}));

const MODULE_ID = "spikependium";
Hooks.on("dnd5e.preBeginConcentrating", prepareHollowConcentration);
Hooks.on("preCreateChatMessage", recordRavenousHit);
Hooks.on("dnd5e.preUseActivity", prepareRavenousDialog);
Hooks.on("dnd5e.preActivityConsumption", canUseRavenous);
Hooks.on("dnd5e.preCreateUsageMessage", recordRavenousUse);
Hooks.on("dnd5e.preApplyDamage", recordRavenousHealing);
Hooks.on("dnd5e.preRollAbilityCheckV2", prepareOriginCheck);
Hooks.on("dnd5e.postBuildAbilityCheckRollConfig", buildOriginCheck);
Hooks.on("dnd5e.postAbilityCheckRollConfiguration", finalizeOriginCheck);
Hooks.on("dnd5e.preRollAbilityCheckV2", prepareAmityCheck);
Hooks.on("dnd5e.postBuildAbilityCheckRollConfig", buildAmityCheck);
Hooks.on("dnd5e.postAbilityCheckRollConfiguration", finalizeAmityCheck);
Hooks.on("dnd5e.preUseActivity", prepareOriginInspirationDialog);
Hooks.on("dnd5e.preUseActivity", prepareArtistDialog);
Hooks.on("dnd5e.preUseActivity", prepareBugbearGrab);
Hooks.on("dnd5e.preActivityConsumption", canUseBugbearGrab);
Hooks.on("dnd5e.postActivityConsumption", recordCunningConsumption);
Hooks.on("dnd5e.preCreateUsageMessage", recordDisengageUse);
Hooks.on("dnd5e.preUseActivity", prepareHideDialog);
Hooks.on("dnd5e.preActivityConsumption", canUseHide);
Hooks.on("dnd5e.preCreateUsageMessage", recordHideUse);
Hooks.on("dnd5e.preRollAbilityCheckV2", canRollHide);
Hooks.on("dnd5e.postUseActivity", (...args) => rollHide(...args).catch(monsterError));
Hooks.on("dnd5e.postUseActivity", activity => endHideOnSpell(activity).catch(monsterError));
Hooks.on("dnd5e.rollAttack", (...args) => endHideOnAttack(...args).catch(monsterError));
for (const hook of ["createChatMessage", "updateChatMessage"])
  Hooks.on(hook, message => syncHide(message).catch(monsterError));
for (const hook of ["updateActor", "updateActorDelta"])
  Hooks.on(hook, () => cleanHide().catch(monsterError));
for (const hook of ["ready", "updateUser"])
  Hooks.on(hook, () => resumeHide().catch(monsterError));
for (const hook of ["createChatMessage", "updateChatMessage"])
  Hooks.on(hook, message => syncDisengage(message).catch(monsterError));
for (const hook of ["updateCombat", "deleteCombat", "updateWorldTime", "updateActor", "updateActorDelta"])
  Hooks.on(hook, () => cleanDisengage().catch(monsterError));
for (const hook of ["ready", "updateUser"])
  Hooks.on(hook, () => resumeDisengage().catch(monsterError));
Hooks.on("dnd5e.preActivityConsumption", captureArtistInspiration);
Hooks.on("dnd5e.preCreateUsageMessage", recordArtistIllusion);
Hooks.on("dnd5e.preCreateUsageMessage", recordArtistInspiration);
const artistError = error => {
  console.error("Spikependium: Вдохновляющая магия", error);
  ui.notifications.error("Не удалось передать Героическое вдохновение. Проверьте отметку на листе союзника и карточку расхода.");
};
for (const hook of ["createChatMessage", "updateChatMessage"])
  Hooks.on(hook, message => syncArtistInspiration(message).catch(artistError));
Hooks.on("ready", () => resumeArtistInspirations().catch(artistError));
Hooks.on("dnd5e.preUseActivity", prepareOriginGrantedAbility);
Hooks.on("dnd5e.preActivityConsumption", prepareOriginGrantedAbility);
Hooks.on("dnd5e.preActivityConsumption", canUseOriginSurge);
Hooks.on("dnd5e.preUseActivity", canUseOriginSurge);
Hooks.on("dnd5e.preRollDamageV2", prepareOriginSurge);
Hooks.on("dnd5e.postDamageRollConfiguration", finalizeOriginSurge);
Hooks.on("dnd5e.preRollSavingThrowV2", prepareAnatomySave);
Hooks.on("dnd5e.postBuildSavingThrowRollConfig", buildAnatomySave);
Hooks.on("dnd5e.postSavingThrowRollConfiguration", finalizeAnatomySave);
Hooks.on("dnd5e.preUseActivity",canUseArcanaStage);
Hooks.on("dnd5e.preUseActivity",prepareArcanaStage);
Hooks.on("dnd5e.preActivityConsumption",captureArcanaStage);
Hooks.on("dnd5e.preCreateUsageMessage",recordDetonateCast);
Hooks.on("dnd5e.postActivityConsumption",recordArcanaStageConsumption);
Hooks.on("dnd5e.preRollSavingThrowV2",prepareDetonateSave);
Hooks.on("preCreateChatMessage", recordOriginSaveWindow);
Hooks.on("dnd5e.preUseActivity", prepareOriginSaveBoost);
Hooks.on("dnd5e.preActivityConsumption", captureOriginSaveBoost);
Hooks.on("dnd5e.postActivityConsumption", recordOriginSaveBoostConsumption);
Hooks.on("dnd5e.preCreateUsageMessage", recordOriginSaveBoostUsage);
Hooks.on("dnd5e.preRollFormulaV2", canRollOriginSaveBoost);
Hooks.on("dnd5e.postUseActivity", (...args)=>rollOriginSaveBoost(...args).catch(originSaveBoostError));
for(const hook of ["createChatMessage","updateChatMessage","updateActor","updateActorDelta","ready"])
  Hooks.on(hook,document=>resumeOriginSaveBoosts(document).catch(originSaveBoostError));
Hooks.on("dnd5e.preActivityConsumption", canUseOriginInspiration);
Hooks.on("dnd5e.postUseActivity", (...args) => applyOriginInspiration(...args).catch(error => {
  console.error("Spikependium: Понимание смерти", error);
  ui.notifications.error("Не удалось выдать Героическое вдохновение. Проверьте карточку расхода и отметку вдохновения на листе.");
}));

Hooks.once("init", registerHandlingMovement);
Hooks.once("init", registerGuardianMovement);
Hooks.on("dnd5e.preUseActivity", prepareGuardianDialog);
Hooks.on("dnd5e.preActivityConsumption", canUseGuardian);
Hooks.on("preCreateChatMessage", recordGuardianAttack);
for (const hook of ["ready", "canvasReady"]) Hooks.on(hook, () => resumeGuardian().catch(error => {
  console.error("Spikependium: продолжение Защитника", error);
  ui.notifications.error("Обмен Защитника не завершён. Проверьте токены и карточку расхода перед применением урона.");
}));
Hooks.on("dnd5e.preUseActivity", canUseHandlingModifier);
Hooks.on("dnd5e.preActivityConsumption", canUseHandlingModifier);
Hooks.on("preCreateChatMessage", recordHandlingHits);
Hooks.on("createChatMessage", async message => {
  if (message.type !== "attack") return;
  try {
    await chooseGuardian(message);
    if (guardianRecords(message).some(r => ["prompted", "moving", "stopped"].includes(r.state))) return;
    if (game.user.isActiveGM && guardianRecords(message).some(r => r.state === "done"))
      await message.update({ "flags.spikependium.handlingHits": handlingHits(message), "flags.spikependium.wetHits": wetHitSnapshots(message),
        "flags.spikependium.strikeHits": strikeHitSnapshots(message), "flags.spikependium.bigPushHits": bigPushSnapshots(message) });
    await chooseRavenousHeal(message);
    await chooseHandling(message);
    await triggerWetResponses(message);
    await applyStrikeHits(message);
    await chooseBigPush(message);
  } catch (error) {
    console.error("Spikependium: последствия попадания", error);
    ui.notifications.error("Не удалось завершить реакцию или последствия попадания. Проверьте карточку расхода и токены перед применением урона; автоматического повтора нет.");
  }
});
Hooks.on("dnd5e.preRollAttackV2", validateHandlingAttack);
Hooks.on("dnd5e.postAttackRollConfiguration", (_rolls, config) => validateHandlingAttack(config));
for (const hook of ["ready", "canvasReady"]) Hooks.on(hook, () => resumeHandling().catch(error => console.error("Spikependium: продолжение Укрощения", error)));

Hooks.on("dnd5e.preUseActivity", canUseReaction);
Hooks.on("dnd5e.preActivityConsumption", canUseReaction);
Hooks.on("dnd5e.preCreateUsageMessage", recordReaction);
Hooks.on("dnd5e.postActivityConsumption", recordReactionConsumption);
function reactionError(error) {
  console.error("Spikependium: учёт реакции", error);
  ui.notifications.error("Не удалось обновить отметку реакции. Проверьте активные эффекты персонажа; уже оплаченное действие не повторяется.");
}
Hooks.on("dnd5e.postUseActivity", activity => { finishReaction(activity).catch(reactionError); });
Hooks.on("dnd5e.postActivityConsumption", activity => { finishReaction(activity).catch(reactionError); });
for (const hook of ["ready", "canvasReady", "updateCombat", "deleteCombat", "updateWorldTime"])
  Hooks.on(hook, () => resumeReactions().catch(reactionError));
for (const hook of ["updateActor", "updateActorDelta"]) Hooks.on(hook, (actor, changes) => {
  if (Object.keys(changes).some(k => k.startsWith("flags.spikependium.reaction"))
    || Object.keys(changes.flags?.spikependium ?? {}).some(k => k.startsWith("reaction"))) resumeReactions().catch(reactionError);
});

Hooks.on("dnd5e.preUseActivity", canUseMovementModifier);
Hooks.on("dnd5e.preActivityConsumption", canUseMovementModifier);
Hooks.on("dnd5e.preCreateUsageMessage", recordMovementCast);
function movementMarkError(error) {
  console.error("Spikependium: знаки движения", error);
  ui.notifications.error("Не удалось применить знак движения. Проверьте цель и права; повторное применение уже снятого знака блокируется.");
}
Hooks.on("createChatMessage", message => applyMovementCast(message).catch(movementMarkError));
for (const hook of ["ready", "canvasReady"]) Hooks.on(hook, () => resumeMovementCasts().catch(movementMarkError));
for (const hook of ["canvasReady", "updateCombat", "updateWorldTime", "updateToken", "updateActor", "updateActorDelta"])
  Hooks.on(hook, () => refreshMovementMarks());
for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"])
  Hooks.on(hook, effect => { if (effect.flags.spikependium?.movementMark) refreshMovementMarks(true); });

Hooks.on("dnd5e.preUseActivity", canUseMakingModifier);
Hooks.on("dnd5e.preActivityConsumption", canUseMakingModifier);
Hooks.on("dnd5e.preCreateUsageMessage", recordMakingCast);
Hooks.on("dnd5e.preApplyEnchantment", prepareMakingEnchantment);
Hooks.on("dnd5e.preRollAttackV2", prepareMakingAttack);
Hooks.on("dnd5e.postBuildAttackRollConfig", buildMakingAttack);
Hooks.on("dnd5e.postAttackRollConfiguration", finalizeMakingAttack);
function checkMaking() {
  refreshMaking().catch(error => {
    console.error("Spikependium: обновление Магического оружия", error);
    ui.notifications.error("Не удалось обновить Магическое оружие. Проверьте зачарование, эффект КД и текущий ход.");
  });
}
for (const hook of ["ready", "canvasReady", "updateCombat", "deleteCombat", "updateWorldTime", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "createItem", "updateItem", "deleteItem"]) Hooks.on(hook, checkMaking);
for (const hook of ["updateActor", "updateActorDelta"]) Hooks.on(hook, (actor, changes) => {
  if (Object.keys(changes).some(k => k.startsWith("flags.spikependium.making"))
    || Object.keys(changes.flags?.spikependium ?? {}).some(k => k.startsWith("making"))) checkMaking();
});
Hooks.on("createChatMessage", message => { if (message.flags.spikependium?.makingCast) checkMaking(); });

Hooks.on("dnd5e.preUseActivity", canUsePassageModifier);
Hooks.on("dnd5e.preActivityConsumption", canUsePassageModifier);
Hooks.on("dnd5e.preActivityConsumption", canActDuringPassage);
Hooks.on("dnd5e.preCreateUsageMessage", recordPassageCast);
function passageError(error) {
  console.error("Spikependium: Вдохновлённый путь", error);
  ui.notifications.error("Не удалось завершить Вдохновлённый путь. Проверьте оба токена и сохранённую запись телепортации.");
}
Hooks.on("createChatMessage", message => applyPassageCast(message).catch(passageError));
for (const hook of ["ready", "canvasReady"]) Hooks.on(hook, () => resumePassageCasts().catch(passageError));

Hooks.on("dnd5e.preUseActivity", canUseDragonmarkActivity);
Hooks.on("dnd5e.preUseActivity", canUseDetectionModifier);
Hooks.on("dnd5e.preUseActivity", canUseStormModifier);
Hooks.on("dnd5e.preActivityConsumption", canUseStormModifier);
Hooks.on("dnd5e.preBeginConcentrating", prepareStormConcentration);
Hooks.on("dnd5e.preUseActivity", canUseFindingModifier);
Hooks.on("dnd5e.preUseActivity", canUseHospitalityModifier);
Hooks.on("dnd5e.preActivityConsumption", canUseHospitalityModifier);
Hooks.on("dnd5e.preCreateUsageMessage", recordHospitalityCast);
Hooks.on("createChatMessage", message => applyHospitalityCast(message).catch(error => {
  console.error("Spikependium: Улучшенное радушие", error);
  ui.notifications.error("Не удалось закончить Улучшенное радушие. Проверьте цели и счётчик; уже применённые эффекты не повторяются.");
}));
for (const hook of ["ready", "canvasReady"]) Hooks.on(hook, () => resumeHospitalityCasts()
  .catch(error => console.error("Spikependium: продолжение Улучшенного радушия", error)));
Hooks.on("dnd5e.preUseActivity", canUseExtraTargetModifier);
Hooks.on("dnd5e.preActivityConsumption", canUseExtraTargetModifier);
Hooks.on("dnd5e.preCreateUsageMessage", recordExtraTargetCast);
Hooks.on("dnd5e.preBeginConcentrating", prepareExtraTargetConcentration);
Hooks.on("dnd5e.preActivityConsumption", captureShadowSpell);
Hooks.on("dnd5e.preCreateUsageMessage", recordShadowSpell);
Hooks.on("dnd5e.preRollAttackV2", prepareShadowAttack);
Hooks.on("dnd5e.postAttackRollConfiguration", finalizeShadowAttack);
function shadowError(error) {
  console.error("Spikependium: окончание Улучшенной тени / Письма", error);
  ui.notifications.error("Не удалось закончить Улучшенную тень или знак Письма. Проверьте эффекты и концентрацию; новое накладывание сохраняется.");
}
Hooks.on("dnd5e.rollAttackV2", (...args) => finishShadowAttack(...args).catch(shadowError));
Hooks.on("createChatMessage", message => applyShadowEndingMessage(message).catch(shadowError));
Hooks.on("dnd5e.preApplyDamage", recordShadowDamage);
function checkShadowDamage(actor) {
  finishShadowDamage(actor).catch(shadowError);
}
Hooks.on("updateActor", checkShadowDamage);
Hooks.on("updateActorDelta", delta => checkShadowDamage(delta.parent.actor));
for (const hook of ["ready", "canvasReady"]) Hooks.on(hook, () => resumeShadowEndings()
  .catch(shadowError));
for (const hook of ["updateWorldTime", "updateCombat"]) Hooks.on(hook, () => endShadowConcentration()
  .catch(shadowError));
Hooks.on("deleteActiveEffect", effect => {
  const marker = effect.flags.spikependium?.improvedShadow;
  if (marker) endShadowConcentration(fromUuidSync(marker.caster, { strict: false }))
    .catch(shadowError);
  if (marker) checkShadowDamage();
});
Hooks.on("updateActiveEffect", effect => {
  if (effect.flags.spikependium?.improvedShadowCaster) endShadowConcentration(effect.parent)
    .catch(shadowError);
});
Hooks.on("createChatMessage", message => applyExtraTargetCast(message).catch(error => {
  console.error("Spikependium: дополнительная цель заклинания метки", error);
  ui.notifications.error("Не удалось закончить улучшение заклинания метки. Проверьте эффекты на выбранных целях и расход применения.");
}));
for (const hook of ["ready", "canvasReady"]) Hooks.on(hook, () => resumeExtraTargetCasts()
  .catch(error => console.error("Spikependium: продолжение улучшения заклинания метки", error)));
function checkWardingArmor(actor) {
  endWardingOnArmor(actor).catch(error => console.error("Spikependium: окончание Доспехов мага при надевании доспеха", error));
}
Hooks.on("updateActor", checkWardingArmor);
Hooks.on("updateActorDelta", delta => checkWardingArmor(delta.parent.actor));
for (const hook of ["createItem", "updateItem", "deleteItem"]) Hooks.on(hook, item => {
  if (item.actor) checkWardingArmor(item.actor);
});
Hooks.on("dnd5e.preActivityConsumption", canUseFindingModifier);
Hooks.on("dnd5e.preBeginConcentrating", prepareFindingConcentration);
Hooks.on("preUpdateActiveEffect", guardFindingUpdate);
for (const hook of ["ready", "canvasReady", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "updateWorldTime", "updateActor", "updateActorDelta", "deleteActor", "deleteToken"])
  Hooks.on(hook, refreshFindingTargets);
function recordFindingHp(actor) {
  observeFindingHp(actor).catch(error => {
    console.error("Spikependium: хиты цели улучшенной Метки охотника", error);
    ui.notifications.error("Не удалось записать хиты цели метки. Перед переносом проверьте её падение до 0 хитов.");
  });
}
Hooks.on("updateActor", recordFindingHp);
Hooks.on("updateActorDelta", delta => recordFindingHp(delta.parent.actor));
Hooks.on("ready", () => recordFindingHp());
for (const hook of ["createActiveEffect", "updateActiveEffect"]) Hooks.on(hook, effect => {
  if (effect.flags.spikependium?.improvedFinding) recordFindingHp();
});
Hooks.on("dnd5e.preActivityConsumption", canUseDetectionModifier);
Hooks.on("dnd5e.postInitiativeDialogRollConfiguration", finalizeDetectionInitiative);
Hooks.on("dnd5e.preRollInitiative", applyDetectionInitiative);
Hooks.on("dnd5e.preActivityConsumption", canConsumeFortitude);
Hooks.on("dnd5e.preRollSavingThrowV2", prepareFortitudeSave);
Hooks.on("dnd5e.postBuildSavingThrowRollConfig", buildFortitudeSave);
Hooks.on("dnd5e.postSavingThrowRollConfiguration", finalizeFortitudeSave);
Hooks.on("dnd5e.preRollAbilityCheckV2", prepareDragonmarkCheck);
Hooks.on("dnd5e.postBuildAbilityCheckRollConfig", buildDragonmarkCheck);
Hooks.on("dnd5e.postAbilityCheckRollConfiguration", finalizeDragonmarkCheck);
Hooks.on("dnd5e.preRollDamageV2", prepareDragonmarkHealing);
Hooks.on("dnd5e.postDamageRollConfiguration", finalizeDragonmarkHealing);

Hooks.once("init", registerPushMovement);
Hooks.once("init", registerVestigeSwapMovement);
Hooks.once("init", registerPassageMovement);
Hooks.on("dnd5e.preCreateUsageMessage", recordVestigeSwap);
Hooks.on("dnd5e.preActivityConsumption", canUseVestigeSwap);
Hooks.on("dnd5e.preActivityConsumption", canActDuringVestigeSwap);
Hooks.on("createChatMessage", message => handleVestigeSwap(message).catch(error => console.error("Spikependium: начало Дьявольской замены", error)));
for (const hook of ["ready", "canvasReady", "stopToken"])
  Hooks.on(hook, () => resumeVestigeSwaps().catch(error => console.error("Spikependium: продолжение Дьявольской замены", error)));

Hooks.on("dnd5e.preSummonToken", prepareSummon);
Hooks.on("dnd5e.preSummon", canSummonVestige);
Hooks.on("dnd5e.preSummonToken", canSummonVestige);
Hooks.on("dnd5e.preActivityConsumption", canConsumeVestigeSummon);
Hooks.on("dnd5e.preSummon", activity => {
  if (!hasReanimatedCompanion(activity, game.scenes)) return;
  ui.notifications.warn("У вас уже есть живой Реанимированный спутник.");
  return false;
});
for (const hook of ["updateActor", "createToken", "deleteToken", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "canvasReady", "ready"]) Hooks.on(hook, updateCompanions);
Hooks.on("dnd5e.restCompleted", (actor, result, config) => {
  recordCompanionRest(actor, result, config).then(() => recordVestigeRest(actor, result, config))
    .then(() => config.type === "long" && offerVestigeFormAfterRest(actor))
    .catch(error => console.error("Spikependium: завершение отдыха и выбор формы спутников", error));
  chooseWhispersAfterRest(actor, result, config).catch(error => {
    console.error("Spikependium: выбор Шёпота мёртвых", error);
    ui.notifications.error("Не удалось закончить выбор Шёпота мёртвых после отдыха. Подробности в консоли.");
  });
});
Hooks.on("preCreateItem", prepareGrantedSpell);
Hooks.on("dnd5e.preUseActivity", prepareSpiritsGuidance);
Hooks.on("preUpdateItem", prepareUpdatedSpell);
Hooks.on("dnd5e.preAdvancementManagerRender", prepareAbilityAdvancement);
Hooks.on("dnd5e.preAdvancementManagerRender", prepareBlueprintAdvancement);
Hooks.on("dnd5e.preRestCompleted", expireDrainedSlots);
Hooks.on("dnd5e.preApplyDamage", recordSoulDamage);
Hooks.on("dnd5e.preApplyDamage", prepareCompanionAbsorption);
Hooks.on("dnd5e.preApplyDamage", recordVestigeTouch);
Hooks.on("dnd5e.preCreateUsageMessage", recordVestigePower);
Hooks.on("dnd5e.preActivityConsumption", canUseVestigePower);
Hooks.on("createChatMessage", message => applyVestigeCurse(message).catch(error => {
  console.error("Spikependium: Проклятое воззвание", error);
  ui.notifications.error("Не удалось применить проклятие реликта. Проверьте эффект на цели и используйте карточку действия.");
}));
for (const hook of ["ready", "updateActor", "updateActorDelta"])
  Hooks.on(hook, () => finishVestigeTouch().catch(error => console.error("Spikependium: Исцеляющее касание", error)));
Hooks.on("dnd5e.preRollAttackV2", prepareVestigeCurseAttack);
Hooks.on("dnd5e.postAttackRollConfiguration", finalizeVestigeCurseAttack);
Hooks.on("dnd5e.preUseLinkedSpell", canUseStoredSpell);
Hooks.on("deleteActiveEffect", effect => {
  cleanStoredCaches(effect.actor).catch(error => console.error("Spikependium: очистка завершённого хранения", error));
});
Hooks.on("preUpdateActor", resetSoulDeath);
Hooks.on("preUpdateActor", recordCompanionDeath);
Hooks.on("preUpdateActorDelta", (delta, changed) => recordCompanionDeath(delta.parent.actor, changed));
Hooks.on("preUpdateActor", recordVestigeSurvival);
Hooks.on("preUpdateActorDelta", (delta, changed) => recordVestigeSurvival(delta.parent.actor, changed));
Hooks.on("preUpdateActor", canModifyVestigeForm);
Hooks.on("preUpdateActorDelta", delta => canModifyVestigeForm(delta.parent.actor));
Hooks.on("updateActorDelta", (delta, changed) => updateCompanions(delta.parent.actor, changed));
for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) Hooks.on(hook, effect => {
  recordCompanionStatus(effect).catch(error => console.error("Spikependium: состояние спутника", error));
});
Hooks.on("dnd5e.postActivityConsumption", recordForgeConsumption);
Hooks.on("dnd5e.postActivityConsumption", showResourceConsumption);
Hooks.on("dnd5e.preCreateUsageMessage", prepareCompanionUsage);
Hooks.on("dnd5e.preCreateUsageMessage", recordConduitCast);
Hooks.on("dnd5e.preCreateUsageMessage", describeConduitCasting);
Hooks.on("dnd5e.preCreateUsageMessage", describeWhispers);
Hooks.on("dnd5e.preCreateUsageMessage", recordVestigeAuraUsage);
Hooks.on("dnd5e.preActivityConsumption", prepareConduitCasting);
Hooks.on("dnd5e.preActivityConsumption", captureFindingTarget);
Hooks.on("dnd5e.preActivityConsumption", captureHospitalityTargets);
Hooks.on("dnd5e.preActivityConsumption", captureExtraTargets);
Hooks.on("dnd5e.preActivityConsumption", capturePassage);
Hooks.on("dnd5e.preActivityConsumption", captureMovementTarget);
Hooks.on("dnd5e.preCreateMeasuredTemplate", validateConduitTemplate);
Hooks.on("dnd5e.preSummon", validateConduitTemplate);
Hooks.on("dnd5e.preSummonToken", validateConduitTemplate);
Hooks.on("dnd5e.createMeasuredTemplate", attachConduitTemplate);
Hooks.on("dnd5e.preCreateMeasuredTemplate", validateVestigeAuraTemplate);
Hooks.on("dnd5e.createMeasuredTemplate", attachVestigeAuraTemplate);
Hooks.on("preCreateChatMessage", canCreateCompanionMessage);
Hooks.on("preCreateChatMessage", recordWetHits);
Hooks.on("preCreateChatMessage", recordStrikeHits);
Hooks.on("preCreateChatMessage", recordBigPush);
Hooks.on("createChatMessage", handleVestigePocket);
Hooks.on("createChatMessage", activateVestigeAura);
Hooks.on("createChatMessage", message => createVestigeRestForm(message).catch(error => {
  console.error("Spikependium: выбор новой формы реликта", error);
  ui.notifications.error("Не удалось подготовить новую форму реликта. Прежний лист не удаляется.");
}));
for (const hook of ["ready", "updateActor", "updateActorDelta"])
  Hooks.on(hook, () => finishVestigeForms().catch(error => console.error("Spikependium: завершение новой формы", error)));
Hooks.on("deleteToken", token => endDeletedVestigeForm(token).then(finishVestigeForms).catch(error => console.error("Spikependium: удаление незавершённой формы", error)));
for (const hook of ["ready", "canvasReady"])
  Hooks.on(hook, () => resumeVestigeFormRequests().catch(error => console.error("Spikependium: отложенный выбор формы реликта", error)));
Hooks.on("createToken", token => rememberVestigeType(token).catch(error => console.error("Spikependium: выбранная форма реликта", error)));
Hooks.on("dnd5e.postUseActivity", (...args) => recordVestigeCunning(...args).catch(error => console.error("Spikependium: Магическая хитрость реликта", error)));
Hooks.on("updateItem", (item, changed) => recordVestigePowerSpent(item, changed).catch(error => console.error("Spikependium: расход Божественной силы", error)));
for (const hook of ["updateActor", "updateActorDelta", "ready"])
  Hooks.on(hook, () => finishVestigeRecovery().catch(error => console.error("Spikependium: восстановление Божественной силы", error)));
for (const hook of ["updateActor", "updateActorDelta", "ready"])
  Hooks.on(hook, () => finishVestigeSurvival().catch(error => console.error("Spikependium: завершение спасения реликтом", error)));
for (const hook of ["createActiveEffect", "ready"])
  Hooks.on(hook, () => upgradeVestigeAuraEffects().catch(error => console.error("Spikependium: условия прежней ауры", error)));
for (const hook of ["deleteActiveEffect", "updateActiveEffect", "updateWorldTime", "ready"])
  Hooks.on(hook, () => endExpiredVestigeAuras().catch(error => console.error("Spikependium: завершение ауры реликта", error)));
for (const hook of ["updateActor", "updateActorDelta", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "ready"])
  Hooks.on(hook, () => endDeadOwnerPockets().catch(error => console.error("Spikependium: смерть хозяина реликта", error)));
Hooks.on("dnd5e.preRollAttackV2", prepareOpportunityRoll);
Hooks.on("dnd5e.postAttackRollConfiguration", validateOpportunityRoll);
Hooks.on("preCreateChatMessage", prepareThinSave);
Hooks.on("updateCombat", (...args) => chooseThinFear(...args).catch(error => {
  console.error("Spikependium: начало хода для пугающей эманации", error);
  ui.notifications.error("Не удалось обработать начало хода для пугающей эманации. Используйте действие спутника вручную.");
}));
for (const hook of ["createChatMessage", "updateChatMessage", "deleteChatMessage"]) Hooks.on(hook, syncThinFear);
Hooks.on("dnd5e.preRollDamageV2", prepareCompanionDamage);
Hooks.on("dnd5e.preRollDamageV2", prepareMagusDiceHealing);
Hooks.on("dnd5e.postActivityConsumption", recordMagusDice);
Hooks.on("dnd5e.preActivityConsumption", canConsumeMagusSpell);
Hooks.on("dnd5e.preApplyDamage", guardMagusHealing);
Hooks.on("dnd5e.preRollDamageV2", prepareConduitRoll);
Hooks.on("dnd5e.preRollDamageV2", prepareGroundDamage);
Hooks.on("dnd5e.postDamageRollConfiguration", finalizeConduitRoll);
Hooks.on("dnd5e.postDamageRollConfiguration", validateExplosionBonus);
for (const hook of ["createItem", "deleteItem", "updateItem", "updateActor", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "updateWorldTime", "ready"]) Hooks.on(hook, cleanForgeItems);
Hooks.on("dnd5e.preActivityConsumption", prepareFormConsumption);
Hooks.on("dnd5e.preActivityConsumption", (activity, config) => {
  if (validateMutableForm(activity, config)) return;
  ui.notifications.warn("Сначала примените Изменчивую форму.");
  return false;
});
Hooks.on("updateToken", refreshSceneAuras);
Hooks.on("canvasReady", refreshSceneAuras);
Hooks.on("updateWorldTime", refreshSceneAuras);
for (const hook of ["updateToken", "canvasReady", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "updateActor"])
  Hooks.on(hook, endSceneEffects);
for (const hook of ["createToken", "deleteToken", "updateActor"]) Hooks.on(hook, refreshSceneAuras);
for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) Hooks.on(hook, refreshSceneAuras);
Hooks.on("dnd5e.applyDamage", (actor, damage, options = {}) => {
  endEffectsOnDamage(actor, options.spikependiumAbsorption?.damage ?? damage).catch(error => console.error("Spikependium: снятие эффектов после урона", error));
});
Hooks.on("dnd5e.activityConsumption", (activity, config, message, updates) => {
  if (applyChoiceConsumption(activity, config, message, updates) === false) return false;
  if (!limitRestoration(activity, updates)) {
    ui.notifications.warn("Этот ресурс уже полностью восстановлен.");
    return false;
  }
  if (commandCompanion(activity, config, message, updates) === false) return false;
  return applyTurnLimit(activity, config, message, updates);
});
Hooks.on("dnd5e.postUseActivity", activity => {
  if (activity.flags?.spikependium?.action !== "radiant-light") return;
  toggleRadiantLight(activity).catch(error => {
    console.error("Spikependium: не удалось переключить свет оружия", error);
    ui.notifications.error("Не удалось переключить свет оружия. Подробности в консоли.");
  });
});
Hooks.on("dnd5e.postUseActivity", (activity, config, results) => {
  finishForge(activity, config, results).catch(error => {
    console.error("Spikependium: создание магического предмета", error);
    ui.notifications.error("Не удалось закончить зачарование созданного предмета. Подробности в консоли; расход можно отменить в карточке действия.");
  });
});
Hooks.on("dnd5e.postUseActivity", (activity, config, results) => {
  postHitDieDamage(activity, config, results).catch(error => {
    console.error("Spikependium: результат кости хитов", error);
    ui.notifications.error("Не удалось создать карточку урона кости хитов. Подробности в консоли.");
  });
});
Hooks.on("dnd5e.postUseActivity", (activity, config, results) => {
  applySelfEffects(activity, config, results).catch(error => {
    console.error("Spikependium: применение личной формы", error);
    ui.notifications.error("Не удалось применить эффект формы. Подробности в консоли.");
  });
});
Hooks.on("dnd5e.preUseActivity", (activity, config, dialog, message) => {
  if (!canUseArcanaSpell(activity)) return false;
  if (!canUseVestigePocket(activity) || !canSummonVestige(activity) || !canUseVestigeAura(activity)
    || !canUseVestigeRestForm(activity) || !canUseVestigePower(activity) || !canActDuringVestigeSwap(activity) || !canUseVestigeSwap(activity)
    || activity.actor?.token?.flags.spikependium?.vestigeFormPending) return false;
  if (!canUseConduitActivity(activity)) return false;
  if (!canUseStoredSpell(activity, config)) return false;
  if (!canUseCompanionDeath(activity, config)) {
    ui.notifications.warn("Взрыв спутника ещё не доступен или уже сработал.");
    return false;
  }
  if (activity.flags.spikependium?.forge || isLifeTransfer(activity)) {
    config.hasConsumption = true;
    message.hasConsumption = true;
  }
  if (!isHandlingAttack(activity, config) && !canCompanionAct(activity, fromUuidSync, game.combat)) {
    ui.notifications.warn("Сначала отдайте спутнику приказ в свой ход. При недееспособности хозяина приказ не требуется.");
    return false;
  }
  if (activity.type === "summon" && hasReanimatedCompanion(activity, game.scenes)) {
    ui.notifications.warn("У вас уже есть живой Реанимированный спутник. Сначала отзовите его.");
    return false;
  }
  prepareChoiceDialog(activity, config, dialog);
  prepareMagusDiceDialog(activity, config, dialog);
  prepareDetectionDialog(activity, config, dialog);
  prepareStormDialog(activity, config, dialog);
  prepareHospitalityDialog(activity, config, dialog);
  prepareExtraTargetDialog(activity, config, dialog);
  preparePassageDialog(activity, config, dialog);
  prepareMakingDialog(activity, config, dialog);
  prepareMovementDialog(activity, config, dialog);
  if (prepareWhispersDialog(activity, config, dialog) === false) return false;
  prepareConduitCastingDialog(activity, config, dialog);
  prepareFeatSave(activity);
  if (!preparePactUsage(activity, config)) {
    ui.notifications.warn("Уровень ячейки Магии договора ниже требуемого для этого действия.");
    return false;
  }
  if (canRefuel(activity)) return;
  ui.notifications.warn("Кольцо восстанавливает только потраченную ячейку 1–3 уровня.");
  return false;
});

Hooks.once("init", () => {
  libWrapper.register(MODULE_ID, "dnd5e.applications.advancement.AdvancementManager.forItemAdd", magicWarriorAdd, "WRAPPER");
  registerArcanaMaterials();
  registerBloomDice();
  registerMagusDice();
  libWrapper.register(MODULE_ID, "CONFIG.Combat.documentClass.prototype._onEndTurn", function(wrapped, ...args) {
    return soulPrisonEndTurn.call(this, (...prison) => soulTomeEndTurn.call(this, (...next) => abolethEndTurn.call(this, (...inner) => arcanaEndTurn.call(this, wrapped, ...inner), ...next), ...prison), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Combat.documentClass.prototype._sortCombatants", sortArcanaSpirits, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.summon.documentClass.prototype._onChatAction", arcanaSummonChatAction, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.attack.documentClass.prototype._usageChatButtons", escapeChatButtons, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.attack.documentClass.prototype._onChatAction", escapeChatAction, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Combat.documentClass.prototype._onStartTurn", arcanaStartTurn, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.dataModels.npc.prototype.recoverCombatUses", monsterLegendaryRecovery, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.teleport.documentClass.prototype._usageChatButtons", passageChatButtons, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.save.documentClass.prototype._usageChatButtons", function(wrapped, ...args) {
    return bloomChatButtons.call(this, (...bloom) => soulPrisonButtons.call(this, (...prison) => abolethWaterButtons.call(this, (...water) => awakeningChatButtons.call(this, (...next) => hollowAuraChatButtons.call(this, (...escape) => escapeChatButtons.call(this, wrapped, ...escape), ...next), ...water), ...prison), ...bloom), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.save.documentClass.prototype._onChatAction", function(wrapped, ...args) {
    return bloomChatAction.call(this, (...bloom) => soulPrisonAction.call(this, (...prison) => abolethWaterAction.call(this, (...water) => awakeningChatAction.call(this, (...next) => hollowAuraChatAction.call(this, (...escape) => escapeChatAction.call(this, wrapped, ...escape), ...next), ...water), ...prison), ...bloom), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.utility.documentClass.prototype._usageChatButtons", function(wrapped, ...args) {
    return abolethWaterButtons.call(this, (...water) => escapePaymentButtons.call(this, (...next) => awakeningChatButtons.call(this, wrapped, ...next), ...water), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.utility.documentClass.prototype._onChatAction", function(wrapped, ...args) {
    return abolethWaterAction.call(this, (...next) => awakeningChatAction.call(this, wrapped, ...next), ...args);
  }, "WRAPPER");
  for (const type of Object.keys(CONFIG.DND5E.activityTypes)) {
    libWrapper.register(MODULE_ID, `CONFIG.DND5E.activityTypes.${type}.documentClass.prototype._requiresConfigurationDialog`, requireConduitCastingDialog, "WRAPPER");
    libWrapper.register(MODULE_ID, `CONFIG.DND5E.activityTypes.${type}.documentClass.prototype.getUsageToken`, function(wrapped, ...args) {
      return vestigeAuraUsageToken.call(this, (...forward) => conduitUsageToken.call(this, wrapped, ...forward), ...args);
    }, "WRAPPER");
    libWrapper.register(MODULE_ID,
    `CONFIG.DND5E.activityTypes.${type}.documentClass.prototype._prepareUsageUpdates`, prepareResourceUpdates, "WRAPPER");
    libWrapper.register(MODULE_ID, `CONFIG.DND5E.activityTypes.${type}.documentClass.prototype.refund`, function(wrapped, ...args) {
      return refundResearch.call(this, (...outer) => refundArcanaEscape.call(this,
        (...next) => refundTinkering.call(this, wrapped, ...next), ...outer), ...args);
    }, "WRAPPER");
    libWrapper.register(MODULE_ID, `CONFIG.DND5E.activityTypes.${type}.documentClass.prototype._prepareConsumeResourceUsageConfig`, restoreForgeSelection, "WRAPPER");
    libWrapper.register(MODULE_ID, `CONFIG.DND5E.activityTypes.${type}.documentClass.prototype.getRollData`, storedActivityRollData, "WRAPPER");
  }
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype._prepareSpellcasting", addDrainedSlots, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.calculateDamage", function(wrapped, ...args) {
    return monsterEvasionDamage.call(this, (...next) => calculateCompanionDamage.call(this, wrapped, ...next), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.applyDamage", function(wrapped, ...args) {
    return abolethApplyDamage.call(this, (...damage) => guardianApplyDamage.call(this, (...forward) => defensiveCharmDamage.call(this, (...defense) => performerDodgeDamage.call(this, (...dodge) => ravenousApplyDamage.call(this,
      (...inner) => relentlessApplyDamage.call(this, wrapped, ...inner), ...dodge), ...defense), ...forward), ...damage), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.update", relentlessUpdate, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype._onUpdate", relentlessOnUpdate, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.ChatMessage.documentClass.prototype.applyChatCardDamage", guardianCardDamage, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.ChatMessage.dataModels.attack.prototype.evaluatedTargets", guardianEvaluatedTargets, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.attack.documentClass.prototype.rollDamage", captureAttackDamage, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Dice.DamageRoll.build", finishConduitRoll, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Dice.DamageRoll.buildEvaluate", function(wrapped, ...args) {
    return groundDamage.call(this, (...next) => consumeOriginSurge.call(this, wrapped, ...next), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Dice.D20Roll.buildEvaluate", function(wrapped, ...args) {
    return consumeMakingAttack.call(this, (...forward) => consumeFortitudeSave.call(this, wrapped, ...forward), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.enchant.documentClass.prototype.applyEnchantment", applyMakingEnchantment, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.ActiveEffect.documentClass.prototype.isSuppressed", function(wrapped, ...args) {
    return arcanaSpellSuppression.call(this, (...outer) => hollowArmorSuppression.call(this,
      (...forward) => makingSuppression.call(this, wrapped, ...forward), ...outer), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.ActiveEffect.documentClass.applyChange", function(wrapped,...args){
    return anatomyStrideChange.call(this,(...next)=>makingEffectChange.call(this,wrapped,...next),...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Combatant.documentClass.prototype.getInitiativeRoll", combatantDetectionInitiative, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.applyActiveEffects", function(wrapped, ...args) {
    return finalizeStormMovement.call(this, (...forward) => prepareFindingActorEffects.call(this, wrapped, ...forward), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.ChatMessage.documentClass.prototype.getAssociatedActivity", restoreConduitActivity, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Item.documentClass.prototype._preUpdate", preserveStoredCache, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Item.documentClass.prototype.getRollData", storedItemRollData, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.cast.documentClass.prototype.getCachedSpellData", storedCachedSpell, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.cast.documentClass.prototype.prepareFinalData", prepareStoredCast, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.heal.documentClass.prototype.rollDamage", function(wrapped, ...args) {
    return rollBloomHealing.call(this, (...bloom) => rollRavenousHealing.call(this, (...forward) => rollLifeHealing.call(this, wrapped, ...forward), ...bloom), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.save.documentClass.prototype.getDamageConfig", bigExplosionDamageConfig, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.save.documentClass.prototype.getAppliedEffectChanges", thinEffectChanges, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.attack.documentClass.prototype.rollAttack", function(wrapped, config, ...args) {
    return handlingRollAttack.call(this, (next, ...forward) => isHandlingAttack(this, next)
      ? wrapped(next, ...forward) : rollCompanionStrike.call(this, wrapped, next, ...forward), config, ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.getRollData", function(wrapped, ...args) {
    const data = wrapped(...args);
    data.spikependium = conditionalState(this, data);
    data.spikependium.makingArmor = makingArmorState(this);
    return data;
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.ActiveEffect.dataModels.base.prototype.evaluateCondition", function(wrapped, data) {
    return prepareVestigeAuraCondition.call(this, next => prepareAuraCondition.call(this, wrapped, next), data);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.utility.documentClass.prototype.getAppliedEffectChanges", function(wrapped, ...args) {
    return extraTargetEffectChanges.call(this, (...forward) => vestigeCurseChanges.call(this,
      (...inner) => vestigeAuraEffectChanges.call(this, wrapped, ...inner), ...forward), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.ActiveEffect.documentClass.prototype._preDelete", prepareShadowConcentrationDelete, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Token.objectClass.prototype._getMovementCostFunction", function(wrapped, ...args) {
    return handlingMovementCost.call(this, (...forward) => movementMarkCost.call(this, wrapped, ...forward), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Token.documentClass.prototype.updateFalling", handlingFalling, "WRAPPER");
  for (const type of Object.keys(CONFIG.DND5E.activityTypes))
    libWrapper.register(MODULE_ID, `CONFIG.DND5E.activityTypes.${type}.documentClass.prototype._prepareUsageScaling`, arcanaStageScaling, "WRAPPER");
  for (const type of Object.keys(CONFIG.DND5E.activityTypes))
    libWrapper.register(MODULE_ID, `CONFIG.DND5E.activityTypes.${type}.documentClass.prototype.use`, function(wrapped, config, ...args) {
      return defensiveCharmUse.call(this, (defense, ...inner) => performerDodgeUse.call(this, (dodge, ...outer) => hollowActionUse.call(this, (next, ...forward) => reactionUse.call(this, (cunning, ...rest) => cunningUse.call(this, (boost,...tail)=>griffonUse.call(this,(next,...rest)=>resilientSaveUse.call(this,wrapped,next,...rest),boost,...tail), cunning, ...rest), next, ...forward), dodge, ...outer), defense, ...inner), config, ...args);
    }, "WRAPPER");
  libWrapper.register(MODULE_ID, "dnd5e.dataModels.chatMessage.fields.IndividualDeltaField.processDelta", function(wrapped, ...args) {
    return arcanaStageDeltaLabel.call(this,(...stage)=>originSaveBoostDeltaLabel.call(this,(...bonus)=>defenseDeltaLabel.call(this, (...defense) => relentlessDeltaLabel.call(this, (...outer) => hollowActionDeltaLabel.call(this,
      (...forward) => reactionDeltaLabel.call(this, (...cunning) => cunningDeltaLabel.call(this, wrapped, ...cunning), ...forward), ...outer), ...defense), ...bonus), ...stage), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.summon.documentClass.prototype._prepareUsageConfig", prepareVestigeRestConfig, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.summon.documentClass.prototype._finalizeMessageConfig", recordVestigeFormConfig, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.summon.documentClass.prototype.placeSummons", placeVestigeRestForm, "WRAPPER");
  const cfg = CONFIG.DND5E;

  // Источники (книги) для поля «Источник» на листах предметов.
  Object.assign(cfg.sourceBooks, SOURCE_BOOKS);

  // Новые категории черт из UA.
  cfg.featureTypes.feat.subtypes.dragonmark = `${MODULE_ID}.FeatType.Dragonmark`;
  cfg.featureTypes.feat.subtypes.wildTalent = `${MODULE_ID}.FeatType.WildTalent`;
  cfg.featureTypes.feat.subtypes.villainousPath = `${MODULE_ID}.FeatType.VillainousPath`;
  cfg.featureTypes.class.subtypes.psionicDiscipline = `${MODULE_ID}.FeatureType.PsionicDiscipline`;
  cfg.featureTypes.class.subtypes.magicBlueprint = "Изученный чертёж";

  // Спутники-конструкты/нежить из подклассов используют стандартные типы, дополнительных не требуется.

  // Списки заклинаний Изобретателя и Псионика (и дополнения к спискам других классов).
  for ( const uuid of SPELL_LISTS ) dnd5e.registry.spellLists.register(uuid);
});

// Регистрация переводов компендиумов в Babele: базовые имена хранятся на английском (оригинал UA),
// Babele подставляет русские названия и умеет показывать оригинал рядом (настройка Babele «Показывать оригинальное имя»).
Hooks.once("babele.init", babele => {
  babele.register({ module: MODULE_ID, lang: "ru", dir: "babele/ru" });
});
