import { prepareLanternDialog, captureLantern, recordLanternConsumption, recordLanternUsage, recordLanternDeath, lanternUse, lanternConsume, endDeletedLantern, syncLanterns, refundLantern, lanternRollDamage, guardLanternApplication, lanternGuardSuppression, syncLanternGuard, resumeLanternGuards, lanternStartTurn, prepareLanternAttack, buildLanternAttack, finalizeLanternAttack, lanternDeltaLabel } from "./arcana-lantern.mjs";
import {prepareDistanceDialog,captureDistance,recordDistanceConsumption,recordDistanceUsage,distanceUse,recordDistanceArea,syncDistanceRegions,resumeDistanceEffects,distanceSuppression,distanceTerrain,distanceSpeedChange,distanceExpiry,distanceEndTurn,distanceDeltaLabel,distanceDamage,guardDistanceDamage,bindDistanceArea} from "./arcana-distance.mjs";
import {prepareDuel,captureDuel,recordDuelConsumption,recordDuelUsage,duelUse,recordDuelArea,bindDuelArea,duelSuppression,recordDuelZero,duelDeadCreation,breakDuelStable,duelDowned,duelRegionEvent,syncDuels,duelDeltaLabel} from "./arcana-duel.mjs";
import {prepareDragon,dragonScaling,captureDragon,recordDragonConsumption,recordDragonUsage,dragonUse,recordDragonArea,bindDragonArea,syncDragon,resumeDragon,dragonSuppression,prepareDragonSave,buildDragonSave,finalizeDragonSave,prepareDragonStudyRoll,syncDragonRoll,dragonDamage,guardDragonDamage,dragonDeltaLabel,prepareDragonFearTest,buildDragonFearTest,finalizeDragonFearTest,dragonStudyRoll} from "./arcana-dragon.mjs";
// Spikependium — интеграция с системой dnd5e и модулем Babele.
import { SPELL_LISTS, SOURCE_BOOKS } from "./generated.mjs";
import { canUseHomeward, recordHomewardConsumption, resumeHomeward, homewardDeltaLabel, forgetHomewardCard } from "./homeward-boots.mjs";
import { canUseBoots, recoverBootsPeriods, bootsEffectSuppression, bootsEffectChange, prepareBootsCheck, bootsCachedSpell, bootsDeltaLabel, syncBoots } from "./griffon-two-boots.mjs";
import { canUsePotionBreak, recordPotionBreakConsumption, capturePotionBreaks, updatePotionBreakSource, resumePotionBreaks } from "./potion-belt-breakage.mjs";
import { canUseBelt, preparePotionUse, recordBeltConsumption, prepareHellHoundAttack, hellHoundDamage, beltDamageParts, beltCalculateDamage, recordTrollZero, applyBeltDamage, prepareTrollHealing, applyTrollHealing, beltStartTurn, beltCombatRecovery, recoverBeltPeriods, beltDeltaLabel } from "./griffon-two-belts.mjs";
import { prepareArcanistUse, recordArcanistConsumption, arcanistConsume, guardArcanistRoll, guardArcanistDamage, arcanistDeltaLabel } from "./arcanist-casting.mjs";
import { canUseCloak, prepareCloakSummon, prepareCloakCheck, cloakEffectSuppression, cloakEffectChange, cloakDeltaLabel, cloakCachedSpell, recordCloakDeath, syncCloaks } from "./griffon-two-cloaks.mjs";
import { canUseStationery, prepareChalkSave, syncStationery, stationeryDeltaLabel } from "./griffon-stationery.mjs";
import { canUseGauntlet, guardGauntletRoll, gauntletCachedSpell, gauntletSpellChanges, gauntletEffectSuppression, gauntletDamageParts, gauntletMovement, markGauntletDamage, healingGloveApplication, resetHealingGlove } from "./griffon-two-gloves.mjs";
import { prepareFocusCasting, recordFocusCasting, focusBladeSuccess, chooseFireWandSave, refreshFocusSaves, guardWhispersRoll,
  restoreWhispersActivity, restoreWhispersItem, focusCastingDeltaLabel } from "./griffon-focus-casting.mjs";
import { canUseGriffonFocus, guardFocusAttunement, guardFocusRoll, prepareFocusWeapon, focusDamageParts, focusSpellChanges, focusEffectSuppression } from "./griffon-foci.mjs";
import { canUseStaff, staffDamageParts, staffAttackConfig, staffAttackRoll, staffDeltaLabel, recordStaffCalculation, applyStaffLightning, recordStaffConsumption } from "./griffon-staves.mjs";
import { prepareStaffHitUse, recordStaffHitConsumption, staffHitDamage, allowStaffHitDamage, staffHitDamageParts, staffHitDamagePart,
  recordStaffDrainCalculation, guardStaffHitApplication, resumeStaffDrains, staffHitDeltaLabel } from "./griffon-staff-hits.mjs";
import { prepareStaffFollowupUse, recordStaffFollowupConsumption, guardStaffFollowupRoll, prepareCraterSave, guardStaffFollowupDamage,
  staffFollowupAttack, staffFollowupDeltaLabel } from "./griffon-staff-followups.mjs";
import { prepareThwackUse, recordThwackConsumption, thwackApplyDamage, markThwackDamage, thwackCounterAttack, thwackCounterDamage,
  thwackDamagePart, guardThwackCounterDamage, refreshThwack, thwackDeltaLabel } from "./griffon-thwack.mjs";
import { alchemistBombUse, recordAlchemistBomb, guardAlchemistBombRoll, prepareAlchemistSplashDialog, alchemistBombDeltaLabel, validateAlchemistSplashTargets, restoreAlchemistSplash,
  prepareAlchemistReagentDamage, alchemistBlastShieldSuccess, alchemistBlastShieldDamage } from "./alchemist-bombs.mjs";
import { prepareAlchemistReagentDialog } from "./alchemist-reagents.mjs";
import { canUseAlchemistDiscovery, firebrandDamageChanges, alchemistDiscoveryPrerequisites } from "./alchemist-discoveries.mjs";
import { alchemistAllowFeat, alchemistASIContext, alchemistASIDrop, alchemistASIRender,
  alchemistReplacementContext, alchemistReplaceDiscovery, alchemistRestoreDiscovery } from "./alchemist-advancements.mjs";
import { canUseAlchemistSpecialty, prepareDynamoChoice, dynamoMaxSpellLevel } from "./alchemist-subclasses.mjs";
import { guardGraftEquip, canUseGraft } from "./alchemist-grafts.mjs";
import { chooseOwlbearSuccess, anglerNetRange, cleanGriffonTwoArmor } from "./griffon-two-armor.mjs";
import { scorpioEquipment, prepareConditionalArmorSave, cleanConditionalArmor, refreshScornedArmor, guardWildskinEffect } from "./griffon-conditional-armor.mjs";
import { prepareMyceliaIdentity, guardMyceliaEquip, guardMyceliaDelete, recordMyceliaCalculation, recordMyceliaDamage, guardMyceliaHPUpdate, myceliaDeleted, syncMycelia } from "./griffon-mycelia.mjs";
import { artifactCalculateDamage, mourningApplyDamage, recordPhoenixDrop, phoenixActorUpdate, canUseArtifactArmor, preparePhoenixHealing, guardPhoenixHealing,
  recordPhoenixRoll, prepareMourningAttack, mourningAuraDamage, chooseMourningSave, cleanArtifactArmor, recoverArtifactPeriods } from "./griffon-artifact-armor.mjs";
import { canUseGriffonTwo, guardGriffonCasterAttunement, recordGriffonCooldown, recoverGriffonPeriods, syncGriffonTwo,
  discardVolleyOnMove, prepareImmutability, chooseImmutability, prepareSolarAttack, prepareSolarDamage,
  recordHealerHeroism, applyHealerHeroism } from "./griffon-two-items.mjs";
import { guardGriffonAttunement, resetGriffonChoice, prepareEldritchAttack, prepareEldritchDamage, prepareEldritchSave, prepareCatnipCheck } from "./griffon-rings.mjs";
import { canUseGriffonSweet, canConsumeGriffonSweet, prepareSweetDialog, recordSweetUse, prepareSweetSave, prepareSweetCheck, prepareSweetDamage, guardSweetMissiles, cleanSweets } from "./griffon-sweets.mjs";
import { canUseGriffonWeapon, griffonAmmoAttackConfig, griffonWeaponAttack, griffonWeaponDamage, griffonWeaponDamageParts, griffonAmmoDamagePart,
  cleanGriffonWeapons, prepareRunicConcentration, guardHealingAmmunition, applyGriffonAmmoHits, recordBloodDrain, applyBloodDrain } from "./griffon-weapons.mjs";
import { processGriffonWeaponHits, resumeGriffonWeaponHits, griffonPurgingButtons, recordWeaponBiteDamage } from "./griffon-hit-triggers.mjs";
import { griffonWeaponStartTurn, recordGriffonWeaponTick, resumeGriffonWeaponTicks, returnPurgingDaggers } from "./griffon-weapon-periodic.mjs";
import { canUseGriffonTwoShield, guardBrambleEquip, cleanGriffonTwoShields, prepareFeywatchCheck, prepareFeywatchSave, prepareShieldBane,
  shieldD20Evaluate, recordMonsterTamerDamage, recordMonsterTamerReturn, applyMonsterTamerDamage } from "./griffon-two-shields.mjs";
import { canUseGriffonArmor, guardGriffonShieldEquip, prepareBattlechefSave, prepareStarmetalThrow, recordFrostReturn, applyFrostReturn,
  griffonShortRest, prepareMoonHitDie, cleanGriffonArmorProfiles, endBarricadeOnMove, guardDarkFathomSave, guardDarkFathomDamage, guardDarkFathomEffect } from "./griffon-armor.mjs";
import { canUseAlchemistCompanion, requireAlchemistSummonMessage, recordAlchemistSummon, alchemistSummonChatAction,
  placeAlchemistSummons, canPlaceAlchemistCompanion, prepareAlchemistCompanion, recordAlchemistCompanionPlaced,
  cleanAlchemistCompanions, alchemistCreationUse } from "./alchemist-creatures.mjs";
import { prepareMagusDiceDialog, registerMagusDice, recordMagusDice, prepareMagusDiceHealing, canConsumeMagusSpell, guardMagusHealing } from "./magus-spells.mjs";
import { prepareAnimationDialog, recordAnimation, animationChatAction, canPlaceAnimation, prepareAnimationToken, animationPlaced,
  animatedWeaponChanges, canUseAnimatedItem, guardAnimatedEquip, registerAnimatedStrike, canConsumeAnimatedStrike, recordAnimatedStrike, guardAnimatedAttack, preserveAnimatedThrownWeapon,
  promptAnimatedAttacks, animatedShieldChanges, animatedShieldCondition, refreshAnimatedShields, endAnimationAtZero } from "./magus-animation.mjs";
import { prepareSummon, canRefuel, hasReanimatedCompanion } from "./summons.mjs";
import { prepareFeatSave, preparePactUsage, prepareGrantedSpell, prepareSpiritsGuidance, prepareAbilityAdvancement, prepareFormConsumption, toggleRadiantLight, conditionalState, applyTurnLimit, prepareUpdatedSpell, validateMutableForm, magusMaskSpellChanges } from "./mechanics.mjs";
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
import { cleanGriffonSight, tectonicMovement } from "./griffon-wearables.mjs";
import { canUseTwoWeapon, canEnchantKinetic, prepareTwoWeaponModel, twoWeaponAttackConfig, twoWeaponAttack,
  twoWeaponDamage, twoWeaponDamageParts, twoWeaponDamagePart, twoWeaponEndTurn, cleanTwoWeapons, recordEruptionHit, refreshTwoWeapons } from "./griffon-two-weapons.mjs";
import { processTwoWeaponHits, recordCovoltDamage, resumeTwoWeaponHits } from "./griffon-two-weapon-hits.mjs";
import { processMedzoDamage, recordMedzoDamage, medzoButtons, prepareMedzoAdvantage, medzoAttackEvaluate, medzoDamageEvaluate, consumeMedzoAdvantage, resumeMedzo, cleanMedzoProfiles } from "./griffon-medzo.mjs";
import { syncWeaponLights } from "./griffon-weapon-lights.mjs";
import { recordRiptideConsumption, riptideStartTurn, syncRiptide, riptideButtons } from "./griffon-riptide.mjs";
Hooks.on("dnd5e.preUseActivity", prepareFocusCasting);
Hooks.on("dnd5e.postActivityConsumption", recordFocusCasting);
Hooks.on("createChatMessage", card => { if (card.flags.spikependium?.focusCasting) refreshFocusSaves(card).catch(error => console.error("Spikependium: карточка применения палочки", error)); });
Hooks.on("createChatMessage", card => chooseFireWandSave(card).catch(error => console.error("Spikependium: концентрация Огненной палочки", error)));
for (const hook of ["updateActor", "updateActorDelta"]) Hooks.on(hook, (document, changes) => refreshFocusSaves(document, changes).catch(error => console.error("Spikependium: обновление концентрации палочки", error)));
Hooks.on("dnd5e.preRollAttackV2", guardWhispersRoll);
Hooks.on("dnd5e.preRollDamageV2", guardWhispersRoll);
Hooks.on("dnd5e.postActivityConsumption", recordRiptideConsumption);
Hooks.on("renderChatMessageHTML", riptideButtons);
for (const hook of ["ready", "canvasReady", "updateWorldTime", "updateActor", "updateActorDelta", "updateChatMessage", "deleteCombat"])
  Hooks.on(hook, () => syncRiptide().catch(error => console.error("Spikependium: очередь волн", error)));
Hooks.on("dnd5e.preApplyDamage", recordMedzoDamage);
Hooks.on("dnd5e.preRollAttackV2", prepareMedzoAdvantage);
Hooks.on("renderChatMessageHTML", medzoButtons);
for (const hook of ["createChatMessage", "updateChatMessage"]) Hooks.on(hook, message => {
  processMedzoDamage(message).catch(error => console.error("Spikependium: совпадения Медзо", error));
  consumeMedzoAdvantage(message).catch(error => console.error("Spikependium: преимущество Медзо", error));
});
for (const hook of ["ready", "canvasReady"]) Hooks.on(hook, () => resumeMedzo().catch(error => console.error("Spikependium: очередь Медзо", error)));
for (const hook of ["ready", "updateCombat", "deleteCombat", "updateChatMessage"])
  Hooks.on(hook, () => cleanMedzoProfiles().catch(error => console.error("Spikependium: сроки эффектов Медзо", error)));
for (const hook of ["ready", "canvasReady", "updateWorldTime", "updateItem", "deleteItem", "updateActiveEffect", "createActiveEffect", "deleteActiveEffect", "updateActor", "updateActorDelta", "createToken", "updateToken"])
  Hooks.on(hook, () => syncWeaponLights().catch(error => console.error("Spikependium: свет оружия", error)));
Hooks.on("dnd5e.preUseActivity", canUseStaff);
Hooks.on("dnd5e.preUseActivity", canUseStationery);
Hooks.on("dnd5e.preUseActivity", canUseGauntlet);
Hooks.on("dnd5e.preUseActivity", canUseCloak);
Hooks.on("dnd5e.preUseActivity", canUseBelt);
Hooks.on("dnd5e.preUseActivity", canUseBoots);
Hooks.on("dnd5e.preUseActivity", canUseHomeward);
Hooks.on("dnd5e.preActivityConsumption", canUseHomeward);
Hooks.on("dnd5e.postActivityConsumption", recordHomewardConsumption);
Hooks.on("deleteChatMessage",card=>forgetHomewardCard(card).catch(error=>console.error("Spikependium: удалена карточка возвращения",error)));
for(const hook of ["ready","createChatMessage","updateChatMessage","deleteChatMessage","updateItem","createRegion","updateRegion","deleteRegion","createToken","deleteToken","updateWorldTime","updateCombat","deleteCombat"])Hooks.on(hook,()=>resumeHomeward().catch(error=>console.error("Spikependium: круги возвращения",error)));
Hooks.on("dnd5e.preActivityConsumption", canUseBoots);
for(const hook of ["dnd5e.preRollAbilityCheckV2","dnd5e.preRollSkillV2"])Hooks.on(hook,prepareBootsCheck);
for(const hook of ["ready","canvasReady","updateWorldTime","updateItem","deleteItem","updateActor","updateActorDelta"])Hooks.on(hook,()=>syncBoots().catch(error=>console.error("Spikependium: обувь",error)));
Hooks.on("dnd5e.preUseActivity", canUsePotionBreak);
Hooks.on("dnd5e.postActivityConsumption",recordPotionBreakConsumption);
Hooks.on("createChatMessage",card=>{capturePotionBreaks(card).catch(error=>console.error("Spikependium: проверка разбития",error));if(card.flags?.spikependium?.potionBreakCheck)resumePotionBreaks(card).catch(error=>console.error("Spikependium: бутылка",error));});
Hooks.on("updateChatMessage",card=>updatePotionBreakSource(card).catch(error=>console.error("Spikependium: источник разбития",error)));
Hooks.on("deleteChatMessage",card=>resumePotionBreaks(card).catch(error=>console.error("Spikependium: удалённый источник разбития",error)));
for(const hook of ["ready","updateItem","deleteItem"])Hooks.on(hook,()=>resumePotionBreaks().catch(error=>console.error("Spikependium: ожидающие бутылки",error)));
Hooks.on("dnd5e.preUseActivity", preparePotionUse);
Hooks.on("dnd5e.postActivityConsumption",recordBeltConsumption);
Hooks.on("dnd5e.preRollAttackV2",prepareHellHoundAttack);
Hooks.on("dnd5e.preRollDamageV2",prepareTrollHealing);
Hooks.on("dnd5e.preApplyDamage",applyBeltDamage);
Hooks.on("preUpdateActor",recordTrollZero);
Hooks.on("preUpdateActorDelta",(delta,changes)=>recordTrollZero(delta.parent.actor,changes));
for(const hook of ["createChatMessage","updateChatMessage"])Hooks.on(hook,card=>applyTrollHealing(card).catch(error=>console.error("Spikependium: регенерация пояса",error)));
Hooks.on("ready",()=>{for(const card of game.messages??[])applyTrollHealing(card).catch(error=>console.error("Spikependium: повтор регенерации",error));});
Hooks.on("dnd5e.preActivityConsumption", canUseCloak);
Hooks.on("dnd5e.preSummon", canUseCloak);
Hooks.on("dnd5e.preSummonToken", prepareCloakSummon);
for(const hook of ["dnd5e.preRollAbilityCheckV2","dnd5e.preRollSkillV2"])Hooks.on(hook,prepareCloakCheck);
for(const hook of ["updateActor","updateActorDelta"])Hooks.on(hook,(...args)=>recordCloakDeath(...args).then(()=>syncCloaks()).catch(error=>console.error("Spikependium: гибель скакуна",error)));
for(const hook of ["ready","canvasReady","updateWorldTime","updateItem","deleteItem","createToken","updateToken","deleteToken","createActiveEffect","updateActiveEffect","deleteActiveEffect"])
  Hooks.on(hook,()=>syncCloaks().catch(error=>console.error("Spikependium: плащи и скакун",error)));
Hooks.on("dnd5e.preUseActivity",prepareArcanistUse);
Hooks.on("dnd5e.postActivityConsumption",recordArcanistConsumption);
for(const hook of ["dnd5e.preRollAttackV2","dnd5e.preRollDamageV2"])Hooks.on(hook,guardArcanistRoll);
Hooks.on("dnd5e.preApplyDamage",guardArcanistDamage);
Hooks.on("dnd5e.preActivityConsumption", canUseGauntlet);
for(const hook of ["dnd5e.preRollAttackV2","dnd5e.preRollDamageV2"])Hooks.on(hook,guardGauntletRoll);
Hooks.on("dnd5e.preRollDamageV2",markGauntletDamage);
Hooks.on("dnd5e.preApplyDamage",healingGloveApplication);
Hooks.on("dnd5e.restCompleted",(...args)=>resetHealingGlove(...args).catch(error=>console.error("Spikependium: отдых получателя лечения",error)));
Hooks.on("dnd5e.preActivityConsumption", canUseStationery);
Hooks.on("dnd5e.preRollSavingThrowV2", prepareChalkSave);
for(const hook of ["ready","canvasReady","updateWorldTime","updateToken","deleteToken","createItem","updateItem","deleteItem","updateActor","updateActorDelta"])
  Hooks.on(hook,()=>syncStationery().catch(error=>console.error("Spikependium: свечи",error)));
Hooks.on("dnd5e.postActivityConsumption", recordStaffConsumption);
Hooks.on("dnd5e.preUseActivity", prepareStaffHitUse);
Hooks.on("dnd5e.postActivityConsumption", recordStaffHitConsumption);
Hooks.on("dnd5e.preUseActivity", prepareStaffFollowupUse);
Hooks.on("dnd5e.postActivityConsumption", recordStaffFollowupConsumption);
Hooks.on("dnd5e.preUseActivity", prepareThwackUse);
Hooks.on("dnd5e.postActivityConsumption", recordThwackConsumption);
Hooks.on("dnd5e.preApplyDamage", markThwackDamage);
Hooks.on("dnd5e.preApplyDamage", guardThwackCounterDamage);
for(const hook of ["updateActor","updateActorDelta","createChatMessage","updateChatMessage","deleteChatMessage"])
  Hooks.on(hook,(...args)=>refreshThwack(...args).catch(error=>console.error("Spikependium: парирование посохом",error)));
Hooks.on("dnd5e.preRollDamageV2", guardStaffFollowupRoll);
Hooks.on("dnd5e.preRollSavingThrowV2", prepareCraterSave);
Hooks.on("dnd5e.preApplyDamage", guardStaffFollowupDamage);
Hooks.on("dnd5e.calculateDamage", recordStaffDrainCalculation);
Hooks.on("dnd5e.preApplyDamage", guardStaffHitApplication);
for (const hook of ["ready", "updateActor", "updateActorDelta", "dnd5e.applyDamage"])
  Hooks.on(hook, () => resumeStaffDrains().catch(error => console.error("Spikependium: высасывающий посох", error)));
Hooks.on("dnd5e.calculateDamage", recordStaffCalculation);
Hooks.on("dnd5e.applyDamage", (...args) => applyStaffLightning(...args).catch(error => console.error("Spikependium: Громобойный посох", error)));
Hooks.on("dnd5e.preUseActivity", canUseTwoWeapon);
Hooks.on("dnd5e.canEnchant", canEnchantKinetic);
Hooks.on("dnd5e.preApplyDamage", recordCovoltDamage);
for (const hook of ["createChatMessage", "updateChatMessage"]) Hooks.on(hook, message => {
  recordEruptionHit(message).catch(error => console.error("Spikependium: тление молота", error));
  processTwoWeaponHits(message).catch(error => console.error("Spikependium: попадания оружия GS2", error));
});
for (const hook of ["ready", "canvasReady"]) Hooks.on(hook, () => resumeTwoWeaponHits().catch(error => console.error("Spikependium: очередь оружия GS2", error)));
for (const hook of ["ready", "updateItem", "updateCombat", "deleteCombat"]) Hooks.on(hook, () => cleanTwoWeapons().catch(error => console.error("Spikependium: сроки оружия GS2", error)));
for (const hook of ["updateCombat", "deleteCombat"]) Hooks.on(hook, refreshTwoWeapons);
for (const hook of ["ready", "canvasReady", "updateItem", "deleteItem"])
  Hooks.on(hook, () => cleanGriffonSight().catch(error => console.error("Spikependium: зрение отиуга", error)));
Hooks.on("dnd5e.preUseActivity", canUseGriffonItem);
Hooks.on("dnd5e.preUseActivity", canUseGriffonWeapon);
Hooks.on("dnd5e.preUseActivity", canUseGriffonTwoShield);
Hooks.on("createChatMessage", message => chooseOwlbearSuccess(message).catch(error => console.error("Spikependium: доспех совомеда", error)));
Hooks.on("preCreateActiveEffect", guardWildskinEffect);
Hooks.on("dnd5e.preUseActivity", canUseArtifactArmor);
Hooks.on("dnd5e.preApplyDamage", recordPhoenixDrop);
Hooks.on("dnd5e.preApplyDamage", guardPhoenixHealing);
Hooks.on("dnd5e.preRollDamageV2", preparePhoenixHealing);
Hooks.on("dnd5e.preRollAttackV2", prepareMourningAttack);
Hooks.on("dnd5e.preCalculateDamage", mourningAuraDamage);
for (const hook of ["createChatMessage", "updateChatMessage"]) Hooks.on(hook, card => recordPhoenixRoll(card).catch(error => console.error("Spikependium: бросок Феникса", error)));
Hooks.on("createChatMessage", card => chooseMourningSave(card).catch(error => console.error("Spikependium: спасение скорбстали", error)));
for (const hook of ["ready", "canvasReady", "updateWorldTime", "updateActor", "updateActorDelta", "updateItem", "deleteItem", "updateActiveEffect", "deleteActiveEffect"])
  Hooks.on(hook, () => cleanArtifactArmor().catch(error => console.error("Spikependium: ауры доспехов", error)));
Hooks.on("preCreateItem", prepareMyceliaIdentity);
Hooks.on("preUpdateItem", guardMyceliaEquip);
Hooks.on("preDeleteItem", guardMyceliaDelete);
Hooks.on("dnd5e.calculateDamage", recordMyceliaCalculation);
Hooks.on("dnd5e.preApplyDamage", recordMyceliaDamage);
Hooks.on("preUpdateActor", guardMyceliaHPUpdate);
Hooks.on("preUpdateActorDelta", (delta, changes) => guardMyceliaHPUpdate(delta.parent.actor, changes));
Hooks.on("deleteItem", item => myceliaDeleted(item).catch(error => console.error("Spikependium: прекращение настройки мицелия", error)));
for (const hook of ["ready", "canvasReady", "createItem", "updateItem", "updateActor", "updateActorDelta", "updateWorldTime", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"])
  Hooks.on(hook, () => syncMycelia().catch(error => console.error("Spikependium: мицелиевый доспех", error)));
Hooks.on("dnd5e.preRollSavingThrowV2", prepareConditionalArmorSave);
for (const hook of ["ready", "canvasReady", "createItem", "updateItem", "deleteItem", "updateActor", "updateActorDelta", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"])
  Hooks.on(hook, () => cleanConditionalArmor().catch(error => console.error("Spikependium: условные доспехи", error)));
for (const hook of ["canvasReady", "createToken", "updateToken", "deleteToken", "updateActor", "updateActorDelta", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"])
  Hooks.on(hook, refreshScornedArmor);
for (const hook of ["ready", "canvasReady", "updateItem", "deleteItem", "updateActor", "updateActorDelta"])
  Hooks.on(hook, () => cleanGriffonTwoArmor().catch(error => console.error("Spikependium: доспехи второй книги", error)));
Hooks.on("preUpdateItem", guardBrambleEquip);
Hooks.on("dnd5e.preRollSavingThrowV2", prepareFeywatchSave);
for (const hook of ["dnd5e.preRollAbilityCheckV2", "dnd5e.preRollSkillV2"]) Hooks.on(hook, prepareFeywatchCheck);
for (const hook of ["dnd5e.preRollAttackV2", "dnd5e.preRollAbilityCheckV2", "dnd5e.preRollSkillV2", "dnd5e.preRollInitiativeV2"]) Hooks.on(hook, prepareShieldBane);
Hooks.on("dnd5e.preApplyDamage", recordMonsterTamerDamage);
Hooks.on("dnd5e.preApplyDamage", recordMonsterTamerReturn);
for (const hook of ["dnd5e.applyDamage", "updateActor"]) Hooks.on(hook, actor => applyMonsterTamerDamage(actor).catch(error => console.error("Spikependium: щит укротителя", error)));
for (const hook of ["ready", "canvasReady", "updateWorldTime", "updateCombat", "updateItem", "deleteItem", "updateActor", "deleteActiveEffect", "updateActiveEffect"])
  Hooks.on(hook, () => cleanGriffonTwoShields().catch(error => console.error("Spikependium: щиты второй книги", error)));
Hooks.on("dnd5e.preApplyDamage", recordWeaponBiteDamage);
Hooks.on("dnd5e.preApplyDamage", recordGriffonWeaponTick);
Hooks.on("renderChatMessageHTML", griffonPurgingButtons);
for (const hook of ["createChatMessage", "updateChatMessage"])
  Hooks.on(hook, message => processGriffonWeaponHits(message).catch(error => console.error("Spikependium: срабатывание кинжала", error)));
for (const hook of ["ready", "canvasReady"]) Hooks.on(hook, async () => {
  try { await resumeGriffonWeaponHits(); await resumeGriffonWeaponTicks(); } catch (error) { console.error("Spikependium: продолжение эффектов оружия", error); }
});
for (const hook of ["ready", "canvasReady", "deleteActiveEffect", "updateActiveEffect"])
  Hooks.on(hook, () => returnPurgingDaggers().catch(error => console.error("Spikependium: извлечение кинжала", error)));
Hooks.on("dnd5e.preRollSavingThrowV2", prepareRunicConcentration);
Hooks.on("dnd5e.preApplyDamage", guardHealingAmmunition);
Hooks.on("dnd5e.preApplyDamage", recordBloodDrain);
Hooks.on("dnd5e.applyDamage", (...args) => applyBloodDrain(...args).catch(error => console.error("Spikependium: кинжал кровавого мага", error)));
for (const hook of ["createChatMessage", "updateChatMessage"])
  Hooks.on(hook, message => applyGriffonAmmoHits(message).catch(error => console.error("Spikependium: кислотный боеприпас", error)));
for (const hook of ["ready", "canvasReady", "updateWorldTime", "updateCombat", "deleteCombat"])
  Hooks.on(hook, () => cleanGriffonWeapons().catch(error => console.error("Spikependium: возвращение боеприпаса", error)));
Hooks.on("dnd5e.preUseActivity", canUseGriffonTwo);
Hooks.on("dnd5e.preUseActivity", canUseGriffonSweet);
Hooks.on("dnd5e.preActivityConsumption", canConsumeGriffonSweet);
Hooks.on("dnd5e.preUseActivity", prepareSweetDialog);
Hooks.on("dnd5e.postActivityConsumption", recordSweetUse);
Hooks.on("dnd5e.preRollSavingThrowV2", prepareSweetSave);
Hooks.on("dnd5e.preRollAbilityCheckV2", prepareSweetCheck);
Hooks.on("dnd5e.preRollDamageV2", prepareSweetDamage);
Hooks.on("dnd5e.preApplyDamage", guardSweetMissiles);
for (const hook of ["ready", "canvasReady", "updateWorldTime", "updateCombat", "deleteCombat", "updateItem", "updateActor"])
  Hooks.on(hook, () => cleanSweets().catch(error => console.error("Spikependium: расходники и сладости", error)));
Hooks.on("dnd5e.preUseActivity", canUseGriffonArmor);
Hooks.on("preUpdateItem", guardGriffonShieldEquip);
Hooks.on("dnd5e.preRollSavingThrowV2", prepareBattlechefSave);
Hooks.on("dnd5e.preRollAttackV2", prepareStarmetalThrow);
Hooks.on("dnd5e.preApplyDamage", recordFrostReturn);
Hooks.on("dnd5e.applyDamage", (...args) => applyFrostReturn(...args).catch(error => console.error("Spikependium: обмороженный баклер", error)));
Hooks.on("dnd5e.preRollHitDieV2", prepareMoonHitDie);
Hooks.on("dnd5e.preRollSavingThrowV2", guardDarkFathomSave);
Hooks.on("dnd5e.preApplyDamage", guardDarkFathomDamage);
Hooks.on("preCreateActiveEffect", guardDarkFathomEffect);
for (const hook of ["ready", "canvasReady", "updateItem", "deleteItem", "updateActor", "deleteActiveEffect", "updateActiveEffect"])
  Hooks.on(hook, () => cleanGriffonArmorProfiles().catch(error => console.error("Spikependium: профили щитов и доспехов", error)));
Hooks.on("updateToken", (...args) => endBarricadeOnMove(...args).catch(error => console.error("Spikependium: баррикада", error)));
Hooks.on("preUpdateItem", guardGriffonCasterAttunement);
Hooks.on("dnd5e.postActivityConsumption", recordGriffonCooldown);
Hooks.on("dnd5e.preRollSavingThrowV2", prepareImmutability);
Hooks.on("createChatMessage", message => chooseImmutability(message).catch(error => console.error("Spikependium: неизменность", error)));
Hooks.on("dnd5e.preRollAttackV2", prepareSolarAttack);
Hooks.on("dnd5e.preRollDamageV2", prepareSolarDamage);
Hooks.on("dnd5e.preApplyDamage", recordHealerHeroism);
Hooks.on("dnd5e.applyDamage", (...args) => applyHealerHeroism(...args).catch(error => console.error("Spikependium: героизм целителя", error)));
for (const hook of ["ready", "canvasReady", "updateWorldTime", "updateItem", "updateActor", "updateActorDelta", "updateCombat", "deleteCombat"])
  Hooks.on(hook, () => syncGriffonTwo().catch(error => console.error("Spikependium: сроки предметов грифона", error)));
Hooks.on("updateToken", (...args) => discardVolleyOnMove(...args).catch(error => console.error("Spikependium: временный боеприпас", error)));
Hooks.on("preUpdateItem", guardGriffonAttunement);
Hooks.on("updateItem", (...args) => resetGriffonChoice(...args).catch(error => console.error("Spikependium: выбор кольца", error)));
Hooks.on("dnd5e.preRollAttackV2", prepareEldritchAttack);
Hooks.on("dnd5e.preRollDamageV2", prepareEldritchDamage);
Hooks.on("dnd5e.preRollSavingThrowV2", prepareEldritchSave);
Hooks.on("dnd5e.preRollAbilityCheckV2", prepareCatnipCheck);
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
import { prepareFamiliarToken, prepareFamiliarCheck, buildFamiliarCheck, finalizeFamiliarCheck, canUseFamiliarHelp,
  consumeFamiliarHelp, cleanArcanaDodge } from "./arcana-familiar.mjs";
import { prepareBansheeDialog, captureBansheeCast, recordBansheeConsumption, recordBansheeUsage,
  resolveBansheeCast, resumeBansheeCasts, guardBansheeDamage } from "./arcana-banshee.mjs";
import { prepareWaveDialog, captureWavePulse, recordWaveConsumption, recordWaveUsage, syncWavePulse, resumeWaves,
  cleanWaves, waveUse, waveSuppression, prepareWaveExhaustion, changeWaveExhaustion, syncWaveBaseCondition } from "./arcana-waves.mjs";
import { recordArtistIllusion, prepareArtistDialog, captureArtistInspiration, recordArtistInspiration,
  syncArtistInspiration, resumeArtistInspirations } from "./arcana-artist.mjs";
import { prepareAmityCheck, buildAmityCheck, finalizeAmityCheck } from "./arcana-amity.mjs";
import { monsterEvasionDamage } from "./monster-evasion.mjs";
import { prepareEvasionSave, buildEvasionSave, finalizeEvasionSave } from "./arcana-evasion.mjs";
import { magicWarriorAdd } from "./arcana-warrior.mjs";
import { schoolASICanImprove, schoolASIApply, schoolGrantApply, syncSchoolSpells, canUseSchoolSpell, prepareSchoolConcentration, buildSchoolConcentration, finalizeSchoolConcentration, schoolError } from "./arcana-schools.mjs";
import { prepareSchoolBenefitDialog, captureSchoolBenefit, recordSchoolBenefitConsumption, recordSchoolBenefitUsage,
  resumeSchoolBenefits, schoolSpeedSuppression, schoolSpeedChange, cleanSchoolSpeed, schoolBenefitDeltaLabel, schoolBenefitError } from "./school-cast-benefits.mjs";
import { prepareBloomDialog, captureBloom, canUseBloom, recordBloomConsumption, recordBloomArea, registerBloomDice,
  bloomChatButtons, bloomChatAction, syncBloomHealing, recordBloomHealing, resumeBloomHealing, rollBloomHealing } from "./arcana-bloom.mjs";
import { prepareBugbearGrab, canUseBugbearGrab } from "./bugbear-grab.mjs";
import { cunningUse, recordCunningConsumption, cunningDeltaLabel } from "./cunning-actions.mjs";
import { recordDisengageUse, syncDisengage, cleanDisengage, resumeDisengage } from "./cunning-disengage.mjs";
import { prepareHideDialog, canUseHide, recordHideUse, rollHide, canRollHide, syncHide, endHideOnAttack, endHideOnSpell, cleanHide, resumeHide } from "./cunning-hide.mjs";
import { canUseOriginSurge, prepareOriginSurge, finalizeOriginSurge, consumeOriginSurge } from "./arcana-surge.mjs";
import { anatomyStrideChange, prepareAnatomySave, buildAnatomySave, finalizeAnatomySave } from "./arcana-anatomy.mjs";
import {preparePainTarget,capturePainTarget,painMovement,preparePainD20,preparePainSave,
  finalizePainD20,finalizePainSave,refreshPainActors} from "./power-word-pain.mjs";
import {preparePainCasting,painConsume,recordPainCastingConsumption,recordPainCastingCard,resumePainFailures,painCastingDeltaLabel} from "./pain-casting.mjs";
import {preserveModuleMessagePrivacy} from "./message-privacy.mjs";
import { steelMindChallenge, steelMindRoll, steelMindPrompt, guardSteelMindSave, syncSteelMind, steelMindError } from "./arcana-steel-mind.mjs";
Hooks.on("dnd5e.preRollSavingThrowV2", guardSteelMindSave);
for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "updateActor", "updateActorDelta",
  "createItem", "updateItem", "deleteItem", "createToken", "updateToken", "dnd5e.beginConcentrating"])
  Hooks.on(hook, document => syncSteelMind(document).catch(steelMindError));
for (const hook of ["ready", "canvasReady", "updateUser"])
  Hooks.on(hook, () => syncSteelMind().catch(steelMindError));
import { arcanaStageLinkedActivity, retainedSpellBulkUpdate, canUseArcanaStage, prepareArcanaStage, captureArcanaStage, recordDetonateCast, prepareDetonateSave, arcanaStageScaling,
  recordArcanaStageConsumption,arcanaStageDeltaLabel,prepareGroundDamage,groundDamage } from "./arcana-stages.mjs";
import { recordOriginSaveWindow, prepareOriginSaveBoost, captureOriginSaveBoost, recordOriginSaveBoostConsumption,
  recordOriginSaveBoostUsage, canRollOriginSaveBoost, rollOriginSaveBoost, resumeOriginSaveBoosts,
  originSaveBoostDeltaLabel, originSaveBoostError, resilientSaveUse } from "./arcana-save-boost.mjs";
import { recordFateWindow, prepareFateDialog, captureFate, recordFateConsumption, recordFateUsage, resumeFate,
  fateDeltaLabel, fateError } from "./arcana-fate.mjs";
import { recordForeknowledgeWindow, prepareForeknowledgeDialog, captureForeknowledge, recordForeknowledgeConsumption, recordForeknowledgeUsage,
  resumeForeknowledge, foreknowledgeDeltaLabel, foreknowledgeError } from "./arcana-foreknowledge.mjs";
import { canUseCombatFamiliar, canConsumeCombatFamiliar, prepareCombatFamiliarDialog, recordCombatFamiliarConsumption, recordCombatFamiliarCast,
  canPlaceCombatFamiliar, prepareCombatFamiliarToken, recordCombatFamiliarPlaced, combatFamiliarChatAction,
  updateCombatFamiliars, combatFamiliarDeltaLabel } from "./combat-familiar.mjs";

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
Hooks.on("dnd5e.preSummon", canPlaceAnimation);
Hooks.on("dnd5e.preSummonToken", prepareAnimationToken);
Hooks.on("dnd5e.postSummon", (...args) => animationPlaced(...args).catch(error => console.error("Spikependium: запись оживлённого предмета", error)));
Hooks.on("dnd5e.postActivityConsumption", recordAnimation);
Hooks.on("dnd5e.postActivityConsumption", recordAnimatedStrike);
Hooks.on("dnd5e.preUseActivity", canUseAnimatedItem);
Hooks.on("dnd5e.preActivityConsumption", canConsumeAnimatedStrike);
Hooks.on("dnd5e.preRollAttackV2", guardAnimatedAttack);
Hooks.on("dnd5e.postActivityConsumption", recordAlchemistBomb);
Hooks.on("dnd5e.preUseActivity", canUseAlchemistDiscovery);
Hooks.on("dnd5e.preUseActivity", canUseGriffonFocus);
Hooks.on("preUpdateItem", guardFocusAttunement);
Hooks.on("dnd5e.preRollAttackV2", guardFocusRoll);
Hooks.on("dnd5e.preRollDamageV2", (config, dialog, message) => allowStaffHitDamage(config, message) ? undefined : guardFocusRoll(config, dialog, message));
Hooks.on("dnd5e.preUseActivity", canUseAlchemistSpecialty);
Hooks.on("dnd5e.preUseActivity", canUseGraft);
Hooks.on("preUpdateItem", guardGraftEquip);
Hooks.on("dnd5e.preUseActivity", canUseAlchemistCompanion);
Hooks.on("dnd5e.activityConsumption", requireAlchemistSummonMessage);
Hooks.on("dnd5e.postActivityConsumption", recordAlchemistSummon);
Hooks.on("dnd5e.preSummon", canPlaceAlchemistCompanion);
Hooks.on("dnd5e.preSummonToken", prepareAlchemistCompanion);
Hooks.on("dnd5e.postSummon", (...args) => recordAlchemistCompanionPlaced(...args).catch(error => console.error("Spikependium: спутник алхимика", error)));
for (const hook of ["ready", "canvasReady", "updateWorldTime", "updateActor", "updateActorDelta"])
  Hooks.on(hook, () => cleanAlchemistCompanions().catch(error => console.error("Spikependium: срок жизни слизи", error)));
Hooks.on("dnd5e.activityConsumption", validateAlchemistSplashTargets);
Hooks.on("dnd5e.preRollAttackV2", guardAlchemistBombRoll);
Hooks.on("dnd5e.preRollDamageV2", guardAlchemistBombRoll);
Hooks.on("dnd5e.preRollDamageV2", prepareAlchemistReagentDamage);
Hooks.on("dnd5e.rollAttackV2", preserveAnimatedThrownWeapon);
Hooks.on("preUpdateItem", guardAnimatedEquip);
Hooks.on("preUpdateActor", endAnimationAtZero);
Hooks.on("preUpdateActorDelta", (delta, data) => endAnimationAtZero(delta.parent.actor, data));
Hooks.on("updateCombat", (...args) => promptAnimatedAttacks(...args).catch(error => console.error("Spikependium: атака оживлённого оружия", error)));
for (const hook of ["ready", "canvasReady", "updateWorldTime", "createToken", "updateToken", "deleteToken", "updateActor", "deleteActor", "updateActorDelta", "updateItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"])
  Hooks.on(hook, refreshAnimatedShields);
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

Hooks.on("dnd5e.preUseActivity", prepareBansheeDialog);
Hooks.on("dnd5e.preUseActivity", prepareSchoolBenefitDialog);
Hooks.on("dnd5e.preActivityConsumption", captureSchoolBenefit);
Hooks.on("dnd5e.postActivityConsumption", recordSchoolBenefitConsumption);
Hooks.on("dnd5e.preCreateUsageMessage", recordSchoolBenefitUsage);
for (const hook of ["createChatMessage", "updateChatMessage", "updateActor", "updateActorDelta"])
  Hooks.on(hook,document=>resumeSchoolBenefits(document).catch(schoolBenefitError));
for (const hook of ["ready", "canvasReady", "updateUser"])
  Hooks.on(hook,()=>resumeSchoolBenefits().catch(schoolBenefitError));
for (const hook of ["ready", "canvasReady", "updateUser", "updateWorldTime", "updateCombat", "deleteCombat", "updateCombatant", "deleteCombatant", "updateActor", "updateActorDelta", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "updateChatMessage", "deleteChatMessage"])
  Hooks.on(hook,()=>cleanSchoolSpeed().catch(schoolBenefitError));
Hooks.on("dnd5e.preUseActivity", canUseSchoolSpell);
Hooks.on("dnd5e.preActivityConsumption", canUseSchoolSpell);
Hooks.on("dnd5e.preRollSavingThrowV2", prepareSchoolConcentration);
Hooks.on("dnd5e.postBuildSavingThrowRollConfig", buildSchoolConcentration);
Hooks.on("dnd5e.postSavingThrowRollConfiguration", finalizeSchoolConcentration);
for (const hook of ["createItem", "updateItem", "deleteItem", "updateActor", "updateActorDelta"])
  Hooks.on(hook, document => syncSchoolSpells(document).catch(schoolError));
for (const hook of ["ready", "canvasReady", "updateUser"])
  Hooks.on(hook, () => syncSchoolSpells().catch(schoolError));
Hooks.on("dnd5e.preUseActivity", canUseCombatFamiliar);
Hooks.on("dnd5e.preUseActivity", prepareCombatFamiliarDialog);
Hooks.on("dnd5e.preActivityConsumption", canConsumeCombatFamiliar);
Hooks.on("dnd5e.postActivityConsumption", recordCombatFamiliarConsumption);
Hooks.on("dnd5e.preCreateUsageMessage", recordCombatFamiliarCast);
Hooks.on("dnd5e.preSummon", canPlaceCombatFamiliar);
Hooks.on("dnd5e.preSummonToken", prepareCombatFamiliarToken);
Hooks.on("dnd5e.postSummon", (...args) => recordCombatFamiliarPlaced(...args).catch(arcanaSpellError));
for (const hook of ["ready", "canvasReady", "updateUser", "dnd5e.postSummon", "updateWorldTime", "updateActor", "updateActorDelta", "createChatMessage", "updateChatMessage", "createCombat", "updateCombat", "createCombatant", "updateCombatant", "updateToken", "deleteToken"])
  Hooks.on(hook, () => updateCombatFamiliars().catch(arcanaSpellError));
Hooks.on("preCreateChatMessage", recordFateWindow);
Hooks.on("preCreateChatMessage", recordForeknowledgeWindow);
Hooks.on("dnd5e.preUseActivity", prepareForeknowledgeDialog);
Hooks.on("dnd5e.preActivityConsumption", captureForeknowledge);
Hooks.on("dnd5e.postActivityConsumption", recordForeknowledgeConsumption);
Hooks.on("dnd5e.preCreateUsageMessage", recordForeknowledgeUsage);
for(const hook of ["createChatMessage","updateChatMessage","updateActor","updateActorDelta"])
  Hooks.on(hook,document=>resumeForeknowledge(document).catch(foreknowledgeError));
for(const hook of ["ready","canvasReady","updateUser"])
  Hooks.on(hook,()=>resumeForeknowledge().catch(foreknowledgeError));
Hooks.on("dnd5e.preUseActivity", prepareFateDialog);
Hooks.on("dnd5e.preActivityConsumption", captureFate);
Hooks.on("dnd5e.postActivityConsumption", recordFateConsumption);
Hooks.on("dnd5e.preCreateUsageMessage", recordFateUsage);
for (const hook of ["createChatMessage", "updateChatMessage", "updateActor", "updateActorDelta"])
  Hooks.on(hook, document => resumeFate(document).catch(fateError));
for (const hook of ["ready", "canvasReady", "updateUser"])
  Hooks.on(hook, () => resumeFate().catch(fateError));
import { prepareEnervationDialog, captureEnervation, recordEnervationConsumption, recordEnervationUsage, enervationDamage, guardEnervationDamage, serializeEnervationDamage, resumeEnervationHealing, cleanEnervation, enervationDeltaLabel } from "./arcana-enervation.mjs";
import { prepareEnthrallment, captureEnthrallment, recordEnthrallmentConsumption, recordEnthrallmentUsage, syncEnthrallmentSave, guardEnthrallmentDamage, enthrallmentEndTurn, resumeEnthrallment, enthrallmentDeltaLabel } from "./arcana-enthrallment.mjs";
Hooks.on("dnd5e.preUseActivity", prepareLanternDialog);
Hooks.on("dnd5e.preUseActivity", prepareDistanceDialog);
Hooks.on("dnd5e.preUseActivity", prepareDragon);
Hooks.on("dnd5e.preActivityConsumption", captureDragon);
Hooks.on("dnd5e.postActivityConsumption", recordDragonConsumption);
Hooks.on("dnd5e.preCreateUsageMessage", recordDragonUsage);
Hooks.on("dnd5e.postUseActivity",(...args)=>recordDragonArea(...args).catch(arcanaSpellError));
Hooks.on("dnd5e.postCreateMeasuredTemplate",(...args)=>bindDragonArea(...args).catch(arcanaSpellError));
Hooks.on("dnd5e.preRollSavingThrowV2",prepareDragonSave);
Hooks.on("dnd5e.postBuildSavingThrowRollConfig",buildDragonSave);
Hooks.on("dnd5e.postSavingThrowRollConfiguration",finalizeDragonSave);
Hooks.on("dnd5e.preRollSkillV2",prepareDragonStudyRoll);
for(const type of ["Attack","AbilityCheck","Skill","Tool"]){
 Hooks.on(`dnd5e.preRoll${type}V2`,prepareDragonFearTest);
 Hooks.on(`dnd5e.postBuild${type}RollConfig`,buildDragonFearTest);
 Hooks.on(`dnd5e.post${type}RollConfiguration`,finalizeDragonFearTest);
}
Hooks.on("dnd5e.preApplyDamage",guardDragonDamage);
for(const hook of ["createChatMessage","updateChatMessage"])
 Hooks.on(hook,message=>syncDragonRoll(message).then(()=>syncDragon()).catch(arcanaSpellError));
for(const hook of ["ready","canvasReady","updateUser"])
 Hooks.on(hook,()=>resumeDragon().catch(arcanaSpellError));
for(const hook of ["updateActor","updateActorDelta","createActiveEffect","updateActiveEffect","deleteActiveEffect","updateWorldTime"])
 Hooks.on(hook,()=>syncDragon().catch(arcanaSpellError));
Hooks.on("dnd5e.preActivityConsumption", captureDistance);
Hooks.on("dnd5e.postActivityConsumption", recordDistanceConsumption);
Hooks.on("dnd5e.preCreateUsageMessage", recordDistanceUsage);
Hooks.on("dnd5e.postUseActivity",(...args)=>recordDistanceArea(...args).catch(arcanaSpellError));
Hooks.on("dnd5e.postCreateMeasuredTemplate",(...args)=>bindDistanceArea(...args).catch(arcanaSpellError));
for(const hook of ["createChatMessage","updateChatMessage"])
  Hooks.on(hook,message=>resumeDistanceEffects(message).then(()=>syncDistanceRegions()).catch(arcanaSpellError));
for(const hook of ["ready","canvasReady","updateUser"])
  Hooks.on(hook,()=>resumeDistanceEffects().then(()=>syncDistanceRegions()).catch(arcanaSpellError));
for(const hook of ["createRegion","updateRegion","deleteRegion","createActiveEffect","updateActiveEffect","deleteActiveEffect","updateActor","updateActorDelta","updateWorldTime","updateCombat"])
  Hooks.on(hook,()=>syncDistanceRegions().catch(arcanaSpellError));
Hooks.on("dnd5e.preActivityConsumption", captureLantern);
Hooks.on("dnd5e.postActivityConsumption", recordLanternConsumption);
Hooks.on("dnd5e.preCreateUsageMessage", recordLanternUsage);
Hooks.on("preCreateActiveEffect", recordLanternDeath);
Hooks.on("preUpdateActiveEffect", recordLanternDeath);
Hooks.on("deleteActiveEffect",effect=>endDeletedLantern(effect).catch(arcanaSpellError));
Hooks.on("dnd5e.preApplyDamage", guardLanternApplication);
Hooks.on("dnd5e.preApplyDamage", guardDistanceDamage);
Hooks.on("dnd5e.preRollAttackV2", prepareLanternAttack);
Hooks.on("dnd5e.postAttackRollConfiguration", finalizeLanternAttack);
for(const hook of ["createChatMessage","updateChatMessage"])
  Hooks.on(hook,message=>syncLanternGuard(message).then(()=>syncLanterns()).catch(arcanaSpellError));
for(const hook of ["ready","canvasReady","updateUser"])
  Hooks.on(hook,()=>resumeLanternGuards().catch(arcanaSpellError));
for(const hook of ["ready","canvasReady","updateUser","updateWorldTime","updateActor","updateActorDelta","updateItem","createActiveEffect","updateActiveEffect","deleteActiveEffect","updateToken","deleteToken"])
  Hooks.on(hook,()=>syncLanterns().catch(arcanaSpellError));
Hooks.on("dnd5e.preUseActivity", prepareEnthrallment);
Hooks.on("dnd5e.preActivityConsumption", captureEnthrallment);
Hooks.on("dnd5e.postActivityConsumption", recordEnthrallmentConsumption);
Hooks.on("dnd5e.preCreateUsageMessage", recordEnthrallmentUsage);
Hooks.on("dnd5e.preApplyDamage", guardEnthrallmentDamage);
for(const hook of ["createChatMessage","updateChatMessage"])
  Hooks.on(hook,message=>syncEnthrallmentSave(message).catch(arcanaSpellError));
for(const hook of ["ready","canvasReady","updateUser","updateWorldTime","updateActor","updateActorDelta"])
  Hooks.on(hook,()=>resumeEnthrallment().catch(arcanaSpellError));
Hooks.on("dnd5e.preUseActivity", prepareEnervationDialog);
Hooks.on("dnd5e.preActivityConsumption", captureEnervation);
Hooks.on("dnd5e.postActivityConsumption", recordEnervationConsumption);
Hooks.on("dnd5e.preCreateUsageMessage", recordEnervationUsage);
Hooks.on("dnd5e.preApplyDamage", guardEnervationDamage);
for(const hook of ["ready","canvasReady","updateUser","updateActor","updateActorDelta"])
  Hooks.on(hook,()=>resumeEnervationHealing().catch(arcanaSpellError));
for(const hook of ["ready","canvasReady","updateWorldTime","updateToken","deleteToken","updateChatMessage","updateActiveEffect","deleteActiveEffect","updateActor","updateActorDelta"])
  Hooks.on(hook,()=>cleanEnervation().catch(arcanaSpellError));
Hooks.on("dnd5e.preUseActivity", prepareWaveDialog);
Hooks.on("dnd5e.preActivityConsumption", captureWavePulse);
Hooks.on("dnd5e.postActivityConsumption", recordWaveConsumption);
Hooks.on("dnd5e.preCreateUsageMessage", recordWaveUsage);
for (const hook of ["createChatMessage", "updateChatMessage"])
  Hooks.on(hook, message => syncWavePulse(message).catch(arcanaSpellError));
for (const hook of ["ready", "canvasReady", "updateUser"])
  Hooks.on(hook, () => resumeWaves().catch(arcanaSpellError));
for (const hook of ["updateWorldTime", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "updateActor", "updateActorDelta"])
  Hooks.on(hook, () => cleanWaves().catch(arcanaSpellError));
Hooks.on("dnd5e.preApplyDamage", guardBansheeDamage);
Hooks.on("dnd5e.preActivityConsumption", captureBansheeCast);
Hooks.on("dnd5e.postActivityConsumption", recordBansheeConsumption);
Hooks.on("dnd5e.preCreateUsageMessage", recordBansheeUsage);
Hooks.on("dnd5e.preCreateUsageMessage", recordArcanaCast);
for (const hook of ["createChatMessage", "updateChatMessage"])
  Hooks.on(hook, message => resolveBansheeCast(message).catch(arcanaSpellError));
for (const hook of ["ready", "canvasReady", "updateUser"])
  Hooks.on(hook, () => resumeBansheeCasts().catch(arcanaSpellError));
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
Hooks.on("dnd5e.preRollAbilityCheckV2", prepareFamiliarCheck);
Hooks.on("dnd5e.postBuildAbilityCheckRollConfig", buildFamiliarCheck);
Hooks.on("dnd5e.postAbilityCheckRollConfiguration", finalizeFamiliarCheck);
Hooks.on("dnd5e.preSummonToken", prepareFamiliarToken);
Hooks.on("dnd5e.preUseActivity", canUseFamiliarHelp);
Hooks.on("dnd5e.preActivityConsumption", canUseFamiliarHelp);
for (const hook of ["ready", "updateActor", "updateActorDelta", "createActiveEffect", "updateActiveEffect"])
  Hooks.on(hook, () => cleanArcanaDodge().catch(error => console.error("Spikependium: Уклонение", error)));
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
Hooks.on("dnd5e.preUseActivity",preparePainTarget);
Hooks.on("dnd5e.preUseActivity",preparePainCasting);
Hooks.on("dnd5e.postActivityConsumption",recordPainCastingConsumption);
Hooks.on("dnd5e.postCreateUsageMessage",(a,card)=>recordPainCastingCard(a,card).catch(error=>console.error("Spikependium: карточка попытки под болью",error)));
for(const hook of ["updateActor","updateActorDelta"])
  Hooks.on(hook,document=>resumePainFailures(document).catch(error=>console.error("Spikependium: неудачная попытка под болью",error)));
for(const hook of ["ready","canvasReady","updateUser"])
  Hooks.on(hook,()=>resumePainFailures().catch(error=>console.error("Spikependium: восстановление попытки под болью",error)));
Hooks.on("dnd5e.preActivityConsumption",capturePainTarget);
for(const type of ["Attack","AbilityCheck","Skill","Tool","InitiativeDialog","DeathSave"]){
  Hooks.on(`dnd5e.preRoll${type}V2`,preparePainD20);
  Hooks.on(`dnd5e.post${type}RollConfiguration`,finalizePainD20);
}
Hooks.on("dnd5e.preRollSavingThrowV2",preparePainSave);
Hooks.on("dnd5e.postSavingThrowRollConfiguration",finalizePainSave);
for(const hook of ["ready","canvasReady","updateUser","updateWorldTime","updateChatMessage","deleteChatMessage","deleteActor"])
  Hooks.on(hook,refreshPainActors);
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
Hooks.on("dnd5e.preAdvancementManagerRender", prepareDynamoChoice);
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
Hooks.on("preUpdateActor",recordDuelZero);
Hooks.on("preUpdateActorDelta",(delta,changed)=>recordDuelZero(delta.parent.actor,changed));
Hooks.on("dnd5e.preUseActivity",prepareDuel);
Hooks.on("dnd5e.preActivityConsumption",captureDuel);
Hooks.on("dnd5e.postActivityConsumption",recordDuelConsumption);
Hooks.on("dnd5e.preCreateUsageMessage",recordDuelUsage);
Hooks.on("dnd5e.postUseActivity",(...args)=>recordDuelArea(...args).catch(arcanaSpellError));
Hooks.on("dnd5e.postCreateMeasuredTemplate",(...args)=>bindDuelArea(...args).catch(arcanaSpellError));
Hooks.on("dnd5e.preApplyDamage",breakDuelStable);
for(const hook of ["ready","canvasReady","updateUser","createChatMessage","updateChatMessage","updateActor","updateActorDelta","createActiveEffect","updateActiveEffect","deleteActiveEffect","updateToken","createToken","deleteToken","updateRegion","deleteRegion","updateWorldTime"])
 Hooks.on(hook,()=>syncDuels().catch(arcanaSpellError));
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
  if (prepareAlchemistSplashDialog(activity, config, dialog) === false) return false;
  prepareAlchemistReagentDialog(activity, config, dialog);
  prepareMagusDiceDialog(activity, config, dialog);
  prepareAnimationDialog(activity, config, dialog);
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
  libWrapper.register(MODULE_ID, "dnd5e.documents.advancement.ItemGrantAdvancement.prototype.apply", schoolGrantApply, "WRAPPER");
  libWrapper.register(MODULE_ID, "dnd5e.documents.advancement.AbilityScoreImprovementAdvancement.prototype.canImprove", schoolASICanImprove, "WRAPPER");
  libWrapper.register(MODULE_ID, "dnd5e.documents.advancement.AbilityScoreImprovementAdvancement.prototype.apply", schoolASIApply, "WRAPPER");
  registerArcanaMaterials();
  registerBloomDice();
  registerMagusDice();
  registerAnimatedStrike();
  libWrapper.register(MODULE_ID, "CONFIG.Combat.documentClass.prototype._onEndTurn", function(wrapped, ...args) {
    return soulPrisonEndTurn.call(this, (...prison) => soulTomeEndTurn.call(this, (...next) => abolethEndTurn.call(this, (...inner) => arcanaEndTurn.call(this, (...forward) => enthrallmentEndTurn.call(this, (...enthrall) => distanceEndTurn.call(this,(...distance)=>twoWeaponEndTurn.call(this, wrapped, ...distance),...enthrall), ...forward), ...inner), ...next), ...prison), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Combat.documentClass.prototype._sortCombatants", sortArcanaSpirits, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.summon.documentClass.prototype._onChatAction", function(wrapped, ...args) {
    return combatFamiliarChatAction.call(this, (...familiar) => alchemistSummonChatAction.call(this, (...alchemist) => animationChatAction.call(this, (...next) => arcanaSummonChatAction.call(this, wrapped, ...next), ...alchemist), ...familiar), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.summon.documentClass.prototype.getChanges", animatedWeaponChanges, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.attack.documentClass.prototype._usageChatButtons", escapeChatButtons, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.attack.documentClass.prototype._onChatAction", escapeChatAction, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Combat.documentClass.prototype._recoverUses", beltCombatRecovery, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Combat.documentClass.prototype._onStartTurn", function(wrapped, ...args) {
    return beltStartTurn.call(this, (...belt)=>arcanaStartTurn.call(this, (...next) => griffonWeaponStartTurn.call(this, (...forward) => lanternStartTurn.call(this, (...lantern) => riptideStartTurn.call(this, wrapped, ...lantern), ...forward), ...next), ...belt), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.dataModels.npc.prototype.recoverCombatUses", monsterLegendaryRecovery, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Item.dataModels.equipment.prototype.recoverUses", function(wrapped, ...args) {
    return recoverBootsPeriods.call(this, (...boots)=>recoverBeltPeriods.call(this, (...belt)=>recoverArtifactPeriods.call(this, (...artifact) => recoverGriffonPeriods.call(this, wrapped, ...artifact), ...belt), ...boots), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Item.dataModels.equipment.prototype.prepareDerivedData", scorpioEquipment, "WRAPPER");
  for (const type of ["attack", "save"])
    libWrapper.register(MODULE_ID, `CONFIG.DND5E.activityTypes.${type}.documentClass.prototype._setOverride`, anglerNetRange, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.initiateRest", griffonShortRest, "WRAPPER");
  for (const type of ["character", "npc"])
    libWrapper.register(MODULE_ID, `CONFIG.Actor.dataModels.${type}.prototype.prepareDerivedData`, function(wrapped,...args){return painMovement.call(this,(...pain)=>gauntletMovement.call(this,(...gloves)=>tectonicMovement.call(this,wrapped,...gloves),...pain),...args);}, "WRAPPER");
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
    libWrapper.register(MODULE_ID, `CONFIG.DND5E.activityTypes.${type}.documentClass.prototype.consume`, function(wrapped,...args){
      return painConsume.call(this,(...pain)=>arcanistConsume.call(this,(...lantern)=>lanternConsume.call(this,wrapped,...lantern),...pain),...args);
    }, "WRAPPER");
    libWrapper.register(MODULE_ID, `CONFIG.DND5E.activityTypes.${type}.documentClass.prototype.refund`, function(wrapped, ...args) {
      return refundResearch.call(this, (...outer) => refundArcanaEscape.call(this,
        (...next) => refundTinkering.call(this, (...lantern) => refundLantern.call(this, wrapped, ...lantern), ...next), ...outer), ...args);
    }, "WRAPPER");
    libWrapper.register(MODULE_ID, `CONFIG.DND5E.activityTypes.${type}.documentClass.prototype._prepareConsumeResourceUsageConfig`, restoreForgeSelection, "WRAPPER");
    libWrapper.register(MODULE_ID, `CONFIG.DND5E.activityTypes.${type}.documentClass.prototype.getRollData`, storedActivityRollData, "WRAPPER");
    libWrapper.register(MODULE_ID, `CONFIG.DND5E.activityTypes.${type}.documentClass.prototype.getLinkedActivity`, arcanaStageLinkedActivity, "WRAPPER");
  }
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype._prepareSpellcasting", addDrainedSlots, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.calculateDamage", function(wrapped, ...args) {
    return beltCalculateDamage.call(this, (...belt)=>alchemistBlastShieldDamage.call(this, (...bomb) => artifactCalculateDamage.call(this, (...artifact) => monsterEvasionDamage.call(this, (...next) => calculateCompanionDamage.call(this, wrapped, ...next), ...artifact), ...bomb), ...belt), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.ChatMessage.dataModels.save.prototype.forceSuccess", function(wrapped, ...args) {
    return focusBladeSuccess.call(this, (...focus) => alchemistBlastShieldSuccess.call(this, wrapped, ...focus), ...args);
  }, "WRAPPER");
  for(const type of ["save","damage"])
    libWrapper.register(MODULE_ID, `CONFIG.DND5E.activityTypes.${type}.documentClass.prototype.rollDamage`, function(wrapped,...args){return lanternRollDamage.call(this,(...lantern)=>enervationDamage.call(this,(...distance)=>distanceDamage.call(this,(...dragon)=>dragonDamage.call(this,wrapped,...dragon),...distance),...lantern),...args);}, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.applyDamage", function(wrapped, ...args) {
    return abolethApplyDamage.call(this, (...damage) => guardianApplyDamage.call(this, (...forward) => defensiveCharmDamage.call(this, (...defense) => thwackApplyDamage.call(this, (...parry) => performerDodgeDamage.call(this, (...dodge) => ravenousApplyDamage.call(this,
      (...inner) => relentlessApplyDamage.call(this, (...artifact) => mourningApplyDamage.call(this, (...serial) => serializeEnervationDamage.call(this, wrapped, ...serial), ...artifact), ...inner), ...dodge), ...parry), ...defense), ...forward), ...damage), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.update", function(wrapped, ...args) {
    return relentlessUpdate.call(this, (...artifact) => phoenixActorUpdate.call(this, wrapped, ...artifact), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype._onUpdate", relentlessOnUpdate, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.ChatMessage.documentClass.prototype.applyChatCardDamage", guardianCardDamage, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.ChatMessage.dataModels.attack.prototype.evaluatedTargets", guardianEvaluatedTargets, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.attack.documentClass.prototype.rollDamage", function(wrapped, ...args) {
    return captureAttackDamage.call(this, (...forward) => thwackCounterDamage.call(this, (...parry) => staffHitDamage.call(this, (...hit) => twoWeaponDamage.call(this, (...next) => hellHoundDamage.call(this, (...belt)=>griffonWeaponDamage.call(this, wrapped, ...belt), ...next), ...hit), ...parry), ...forward), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.attack.documentClass.prototype._getDamageParts", function(wrapped, ...args) {
    return beltDamageParts.call(this, (...belt)=>gauntletDamageParts.call(this, (...gloves) => staffHitDamageParts.call(this, (...hit) => staffDamageParts.call(this, (...staff) => focusDamageParts.call(this, (...focus) => twoWeaponDamageParts.call(this, (...next) => griffonWeaponDamageParts.call(this, wrapped, ...next), ...focus), ...staff), ...hit), ...gloves), ...belt), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.attack.documentClass.prototype._processDamagePart", function(wrapped, ...args) {
    return thwackDamagePart.call(this, (...parry) => staffHitDamagePart.call(this, (...hit) => twoWeaponDamagePart.call(this, (...next) => griffonAmmoDamagePart.call(this, wrapped, ...next), ...hit), ...parry), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.attack.documentClass.prototype._buildAttackConfig", function(wrapped, ...args) {
    return staffAttackConfig.call(this, (...staff) => twoWeaponAttackConfig.call(this, (...next) => griffonAmmoAttackConfig.call(this, (...lantern) => buildLanternAttack.call(this, wrapped, ...lantern), ...next), ...staff), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Item.dataModels.weapon.prototype.prepareDerivedData", function(wrapped, ...args) {
    return prepareFocusWeapon.call(this, (...focus) => prepareTwoWeaponModel.call(this, wrapped, ...focus), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Dice.DamageRoll.build", finishConduitRoll, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Dice.DamageRoll.buildEvaluate", function(wrapped, ...args) {
    return groundDamage.call(this, (...next) => consumeOriginSurge.call(this, (...forward) => medzoDamageEvaluate.call(this, wrapped, ...forward), ...next), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Dice.D20Roll.buildEvaluate", function(wrapped, ...args) {
    return consumeFamiliarHelp.call(this, (...familiar) => medzoAttackEvaluate.call(this, (...medzo) => shieldD20Evaluate.call(this, (...shield) => consumeMakingAttack.call(this, (...forward) => consumeFortitudeSave.call(this, wrapped, ...forward), ...shield), ...medzo), ...familiar), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.enchant.documentClass.prototype.applyEnchantment", applyMakingEnchantment, "WRAPPER");
  libWrapper.register(MODULE_ID, "dnd5e.dataModels.actor.AttributesFields.prepareExhaustionLevel", prepareWaveExhaustion, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.ActiveEffect.dataModels.condition._applyDelta", changeWaveExhaustion, "WRAPPER");
  for (const method of ["_onCreateDescendantDocuments", "_onDeleteDescendantDocuments"])
    libWrapper.register(MODULE_ID, `CONFIG.Actor.documentClass.prototype.${method}`, syncWaveBaseCondition, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.ActiveEffect.documentClass.prototype.isSuppressed", function(wrapped, ...args) {
    return schoolSpeedSuppression.call(this, (...school) => waveSuppression.call(this, (...wave) => bootsEffectSuppression.call(this, (...boots)=>cloakEffectSuppression.call(this, (...cloaks) => gauntletEffectSuppression.call(this, (...gloves) => focusEffectSuppression.call(this, (...focus) => arcanaSpellSuppression.call(this, (...outer) => hollowArmorSuppression.call(this,
      (...forward) => makingSuppression.call(this, (...lantern) => lanternGuardSuppression.call(this, (...distance)=>distanceSuppression.call(this,(...dragon)=>dragonSuppression.call(this,(...duel)=>duelSuppression.call(this,wrapped,...duel),...dragon),...distance), ...lantern), ...forward), ...outer), ...focus), ...gloves), ...cloaks), ...boots), ...wave), ...school), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.ActiveEffect.documentClass.applyChange", function(wrapped,...args){
    return schoolSpeedChange.call(this, (...school) => bootsEffectChange.call(this,(...boots)=>cloakEffectChange.call(this,(...cloak)=>anatomyStrideChange.call(this,(...next)=>makingEffectChange.call(this,(...distance)=>distanceSpeedChange.call(this,wrapped,...distance),...next),...cloak),...boots),...school), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, 'CONFIG.RegionBehavior.dataModels["dnd5e.difficultTerrain"].prototype._getTerrainEffects', distanceTerrain, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.ActiveEffect.documentClass.prototype.isExpiryEvent", distanceExpiry, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.performBulkUpdate", retainedSpellBulkUpdate, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.rollSkill", dragonStudyRoll, "MIXED");
  libWrapper.register(MODULE_ID, "CONFIG.ActiveEffect.documentClass.prototype._preCreate", duelDeadCreation, "MIXED");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.updateDowned", duelDowned, "MIXED");
  libWrapper.register(MODULE_ID, "CONFIG.Region.documentClass.prototype._handleEvent", duelRegionEvent, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Combatant.documentClass.prototype.getInitiativeRoll", combatantDetectionInitiative, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.applyActiveEffects", function(wrapped, ...args) {
    return finalizeStormMovement.call(this, (...forward) => prepareFindingActorEffects.call(this, wrapped, ...forward), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.ChatMessage.documentClass.prototype.getAssociatedActivity", function(wrapped, options) {
    return restoreWhispersActivity.call(this, next => restoreAlchemistSplash.call(this, forward => restoreConduitActivity.call(this, wrapped, forward), next), options);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.ChatMessage.documentClass.prototype.getAssociatedItem", restoreWhispersItem, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Item.documentClass.prototype._preUpdate", preserveStoredCache, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Item.documentClass.prototype.getRollData", storedItemRollData, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.cast.documentClass.prototype.getCachedSpellData", function(wrapped,...args){return bootsCachedSpell.call(this,(...boots)=>cloakCachedSpell.call(this,(...cloaks)=>gauntletCachedSpell.call(this,(...gloves)=>storedCachedSpell.call(this,wrapped,...gloves),...cloaks),...boots),...args);}, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.cast.documentClass.prototype.getSpellChanges", function(wrapped, ...args) {
    return gauntletSpellChanges.call(this,(...gloves)=>focusSpellChanges.call(this, (...focus) => magusMaskSpellChanges.call(this, wrapped, ...focus), ...gloves), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.cast.documentClass.prototype.prepareFinalData", prepareStoredCast, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.heal.documentClass.prototype.rollDamage", function(wrapped, ...args) {
    return rollBloomHealing.call(this, (...bloom) => rollRavenousHealing.call(this, (...forward) => rollLifeHealing.call(this, (...lantern) => lanternRollDamage.call(this, wrapped, ...lantern), ...forward), ...bloom), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.save.documentClass.prototype.getDamageConfig", bigExplosionDamageConfig, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.save.documentClass.prototype.getAppliedEffectChanges", thinEffectChanges, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.attack.documentClass.prototype.rollAttack", function(wrapped, config, ...args) {
    return thwackCounterAttack.call(this, (...parry) => staffFollowupAttack.call(this, (...followup) => staffAttackRoll.call(this, (...staffArgs) => twoWeaponAttack.call(this, (...twoArgs) => griffonWeaponAttack.call(this, (...weaponArgs) => handlingRollAttack.call(this, (next, ...forward) => isHandlingAttack(this, next)
      ? wrapped(next, ...forward) : rollCompanionStrike.call(this, wrapped, next, ...forward), ...weaponArgs), ...twoArgs), ...staffArgs), ...followup), ...parry), config, ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.getRollData", function(wrapped, ...args) {
    const data = wrapped(...args);
    data.spikependium = conditionalState(this, data);
    data.spikependium.makingArmor = makingArmorState(this);
    return data;
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.ActiveEffect.dataModels.enchantment.prototype._applyLegacy", firebrandDamageChanges, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Item.dataModels.feat.prototype.validatePrerequisites", alchemistDiscoveryPrerequisites, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.advancementTypes.AbilityScoreImprovement.documentClass.prototype.allowFeat", alchemistAllowFeat, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.advancementTypes.AbilityScoreImprovement.documentClass.metadata.apps.flow.prototype._prepareContentContext", alchemistASIContext, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.advancementTypes.AbilityScoreImprovement.documentClass.metadata.apps.flow.prototype._onDrop", alchemistASIDrop, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.advancementTypes.AbilityScoreImprovement.documentClass.metadata.apps.flow.prototype._onRender", alchemistASIRender, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.advancementTypes.ItemChoice.documentClass.metadata.apps.flow.prototype._prepareContentContext", alchemistReplacementContext, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.advancementTypes.ItemChoice.documentClass.prototype.apply", alchemistReplaceDiscovery, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.advancementTypes.ItemChoice.documentClass.prototype._restoreReplacedItem", alchemistRestoreDiscovery, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.advancementTypes.ItemChoice.documentClass.metadata.apps.flow.prototype._maxSpellSlotLevel", dynamoMaxSpellLevel, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.ActiveEffect.dataModels.base.prototype.evaluateCondition", function(wrapped, data) {
    return animatedShieldCondition.call(this, next => prepareVestigeAuraCondition.call(this,
      inner => prepareAuraCondition.call(this, wrapped, inner), next), data);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.utility.documentClass.prototype.getAppliedEffectChanges", function(wrapped, ...args) {
    return animatedShieldChanges.call(this, (...next) => extraTargetEffectChanges.call(this, (...forward) => vestigeCurseChanges.call(this,
      (...inner) => vestigeAuraEffectChanges.call(this, wrapped, ...inner), ...forward), ...next), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.ActiveEffect.documentClass.prototype._preDelete", prepareShadowConcentrationDelete, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.challengeConcentration", steelMindChallenge, "MIXED");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.rollConcentration", steelMindRoll, "MIXED");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.promptConcentrationEnd", steelMindPrompt, "MIXED");
  libWrapper.register(MODULE_ID, "CONFIG.Token.objectClass.prototype._getMovementCostFunction", function(wrapped, ...args) {
    return handlingMovementCost.call(this, (...forward) => movementMarkCost.call(this, wrapped, ...forward), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Token.documentClass.prototype.updateFalling", handlingFalling, "WRAPPER");
  for (const type of Object.keys(CONFIG.DND5E.activityTypes))
    libWrapper.register(MODULE_ID, `CONFIG.DND5E.activityTypes.${type}.documentClass.prototype._prepareUsageScaling`, function(wrapped,...args){return arcanaStageScaling.call(this,(...dragon)=>dragonScaling.call(this,wrapped,...dragon),...args);}, "WRAPPER");
  for (const type of Object.keys(CONFIG.DND5E.activityTypes))
    libWrapper.register(MODULE_ID, `CONFIG.DND5E.activityTypes.${type}.documentClass.prototype.use`, function(wrapped, config, ...args) {
      return waveUse.call(this, (waveConfig, ...waveArgs) => defensiveCharmUse.call(this, (defense, ...inner) => performerDodgeUse.call(this, (dodge, ...outer) => hollowActionUse.call(this, (next, ...forward) => reactionUse.call(this, (cunning, ...rest) => cunningUse.call(this, (boost,...tail)=>griffonUse.call(this,(next,...rest)=>resilientSaveUse.call(this,(...bomb)=>alchemistBombUse.call(this,(...craft)=>alchemistCreationUse.call(this,(...lantern)=>lanternUse.call(this,(...distance)=>distanceUse.call(this,(...dragon)=>dragonUse.call(this,(...duel)=>duelUse.call(this,wrapped,...duel),...dragon),...distance),...lantern),...craft),...bomb),next,...rest),boost,...tail), cunning, ...rest), next, ...forward), dodge, ...outer), defense, ...inner), waveConfig, ...waveArgs), config, ...args);
    }, "WRAPPER");
  libWrapper.register(MODULE_ID, "dnd5e.dataModels.chatMessage.fields.IndividualDeltaField.processDelta", function(wrapped, ...args) {
    return painCastingDeltaLabel.call(this, (...pain) => foreknowledgeDeltaLabel.call(this, (...prescience) => schoolBenefitDeltaLabel.call(this, (...school) => combatFamiliarDeltaLabel.call(this, (...familiar) => fateDeltaLabel.call(this, (...fate) => arcanaStageDeltaLabel.call(this,(...stage)=>originSaveBoostDeltaLabel.call(this,(...bonus)=>defenseDeltaLabel.call(this, (...defense) => relentlessDeltaLabel.call(this, (...outer) => hollowActionDeltaLabel.call(this,
      (...forward) => reactionDeltaLabel.call(this, (...cunning) => cunningDeltaLabel.call(this, (...bomb) => alchemistBombDeltaLabel.call(this, (...focus) => focusCastingDeltaLabel.call(this, (...staff) => staffDeltaLabel.call(this, (...hit) => staffHitDeltaLabel.call(this, (...followup) => staffFollowupDeltaLabel.call(this, (...parry) => thwackDeltaLabel.call(this, (...stationery) => stationeryDeltaLabel.call(this, (...arcanist) => arcanistDeltaLabel.call(this, (...cloak) => cloakDeltaLabel.call(this, (...belt)=>beltDeltaLabel.call(this, (...boots)=>bootsDeltaLabel.call(this, (...home)=>homewardDeltaLabel.call(this, (...enervation) => enervationDeltaLabel.call(this, (...enthrall) => enthrallmentDeltaLabel.call(this, (...lantern) => lanternDeltaLabel.call(this, (...distance)=>distanceDeltaLabel.call(this,(...dragon)=>dragonDeltaLabel.call(this,(...duel)=>duelDeltaLabel.call(this,wrapped,...duel),...dragon),...distance), ...lantern), ...enthrall), ...enervation), ...home), ...boots), ...belt), ...cloak), ...arcanist), ...stationery), ...parry), ...followup), ...hit), ...staff), ...focus), ...bomb), ...cunning), ...forward), ...outer), ...defense), ...bonus), ...stage), ...fate), ...familiar), ...school), ...prescience), ...pain), ...args);
  }, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.summon.documentClass.prototype._prepareUsageConfig", prepareVestigeRestConfig, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.summon.documentClass.prototype._finalizeMessageConfig", recordVestigeFormConfig, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.DND5E.activityTypes.summon.documentClass.prototype.placeSummons", function(wrapped, ...args) {
    return placeAlchemistSummons.call(this, (...next) => placeVestigeRestForm.call(this, wrapped, ...next), ...args);
  }, "WRAPPER");
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

Hooks.on("dnd5e.preCreateUsageMessage",preserveModuleMessagePrivacy);
