import { tokensDistance } from "./effects.mjs";
import { hasGriffonClass } from "./griffon-rings.mjs";

const family = item => item?.flags?.spikependium?.griffonTwoArmor;
const worn = item => item?.system.equipped && (item.system.attunement !== "required" || item.system.attuned);
const effects = actor => actor?.appliedEffects ?? actor?.effects ?? [];
const actors = () => new Map([...(game.actors ?? []), ...[...(game.scenes ?? [])].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean).map(a => [a.uuid, a]));
const active = e => !e.disabled && !e.duration?.expired;
const pending = new WeakMap(), using = new Set();

export function armorUnattunedUse(activity) {
  return family(activity?.item) === "scorpio" && ["dim", "sun", "other"].includes(activity.flags?.spikependium?.scorpioLight);
}
export function scorpioEquipment(wrapped, ...args) {
  const result = wrapped(...args);
  if (family(this.parent) === "scorpio" && this.equipped && this.parent.flags.spikependium.scorpioLight === "dim") this.properties.delete("stealthDisadvantage");
  return result;
}
export function scorpioMovement(wrapped, ...args) {
  const movement = this.attributes?.movement;
  if (!movement || !this.parent?.items?.some(i => family(i) === "scorpio" && i.system.equipped && i.flags.spikependium.scorpioLight === "sun")) return wrapped(...args);
  const bonus = movement.bonus, penalty = dnd5e.utils.convertLength(5, "ft", movement.units ?? "ft");
  movement.bonus = `(${bonus || 0}) - ${penalty}`;
  try { return wrapped(...args); } finally { movement.bonus = bonus; }
}
export function scornedArmorBonus(actor) {
  const items = actor.items?.filter(i => family(i) === "scorned-heart" && worn(i)) ?? [];
  if (items.length !== 1 || !globalThis.canvas?.ready) return 0;
  const source = actor.getActiveTokens(false, true).map(t => t.document ?? t).filter(t => t.parent === canvas.scene);
  if (source.length !== 1) return 0;
  const allies = new Set(items[0].flags.spikependium.scornedAllies ?? []);
  let count = 0;
  for (const token of canvas.scene.tokens) {
    if (!allies.has(token.uuid) || !token.actor || token.actor.uuid === actor.uuid || token.actor.statuses?.has("dead")) continue;
    const distance = tokensDistance(source[0], token);
    if (Number.isFinite(distance) && distance <= 10) count++;
  }
  return Math.min(2, Math.floor(count / 2));
}
export function wildskinActive(actor) {
  if (!actor.flags?.dnd5e?.isPolymorphed || actor.system?.details?.type?.value !== "beast") return false;
  return effects(actor).some(e => {
    const receipt = e.flags?.spikependium?.wildskinGrant;
    if (!active(e) || !e.flags?.spikependium?.griffonWildskin || receipt?.target !== actor.uuid || typeof receipt.item !== "string" || typeof receipt.original !== "string") return false;
    const item = fromUuidSync(receipt.item, { strict: false });
    return item?.actor?.uuid === receipt.original && actor.flags.dnd5e.originalActor === item.actor.id && worn(item) && hasGriffonClass(item);
  });
}
export function finishWildskinArmorClass(model) {
  if (!wildskinActive(model.parent)) return;
  const ac = model.attributes.ac, value = 14 + Math.min(2, model.abilities.dex.mod);
  if (Number.isFinite(ac.value) && ac.value < value) {
    ac.value = value;
    if (Number.isFinite(ac.override)) ac.override = value;
    ac.label = "Доспех дикой шкуры";
  }
}
function validWildskin(actor, original) {
  return actor?.isOwner && actor.flags?.dnd5e?.isPolymorphed && actor.flags.dnd5e.originalActor === original.id
    && actor.system?.details?.type?.value === "beast" && actor.uuid !== original.uuid;
}
export async function wildskinUse(wrapped, config, ...args) {
  if (!this.flags?.spikependium?.wildskinGrant || family(this.item) !== "wildskin") return wrapped(config, ...args);
  if (using.has(this.item.uuid)) return;
  const candidates = new Map([...game.user.targets, ...(canvas?.tokens?.controlled ?? [])].map(t => t.actor).filter(a => validWildskin(a, this.actor)).map(a => [a.uuid, a]));
  if (candidates.size !== 1) { ui.notifications.warn("Выделите ровно свой звериный Дикий облик, созданный штатным превращением."); return; }
  const target = candidates.values().next().value;
  using.add(this.item.uuid);
  try { return await wrapped({ ...config, spikependium: { ...config?.spikependium, wildskinTarget: target.uuid } }, ...args); }
  finally { pending.delete(this); using.delete(this.item.uuid); }
}
export function prepareConditionalArmorUpdates(activity, config, updates) {
  if (!activity.flags?.spikependium?.wildskinGrant || family(activity.item) !== "wildskin") return updates;
  const target = config.spikependium?.wildskinTarget && fromUuidSync(config.spikependium.wildskinTarget, { strict: false });
  if (!activity.actor?.isOwner || !worn(activity.item) || !hasGriffonClass(activity.item) || !validWildskin(target, activity.actor)) return false;
  const update = updates.item.find(i => i._id === activity.item.id);
  if (update?.["system.uses.spent"] !== activity.item.system.uses.spent + 1) return false;
  const receipt = { target: target.uuid, item: activity.item.uuid, original: activity.actor.uuid, nonce: foundry.utils.randomID() };
  update["flags.spikependium.wildskinGrant"] = receipt; pending.set(activity, receipt);
  return updates;
}
export function guardWildskinEffect(effect) {
  if (!effect.flags?.spikependium?.griffonWildskin || effect.parent?.documentName !== "Actor") return;
  const actor = effect.parent, receipt = effect.flags.spikependium.wildskinGrant;
  if (receipt?.target !== actor?.uuid || typeof receipt?.item !== "string" || typeof receipt?.original !== "string" || !actor.flags?.dnd5e?.isPolymorphed || actor.system?.details?.type?.value !== "beast") return false;
}
export async function finishConditionalArmorUse(activity, _config, results) {
  if (!results?.message || !activity.actor?.isOwner) return;
  const item = activity.item, flags = activity.flags?.spikependium ?? {};
  if (armorUnattunedUse(activity)) await item.setFlag("spikependium", "scorpioLight", flags.scorpioLight);
  if (family(item) === "scorned-heart" && flags.scornedAllies)
    await item.setFlag("spikependium", "scornedAllies", [...new Set([...game.user.targets].map(t => t.document ?? t).filter(t => t.actor && t.actor.uuid !== activity.actor.uuid).map(t => t.uuid))]);
  if (!flags.wildskinGrant || family(item) !== "wildskin") return;
  const receipt = pending.get(activity), target = receipt && fromUuidSync(receipt.target, { strict: false });
  if (!validWildskin(target, activity.actor) || JSON.stringify(item.flags.spikependium.wildskinGrant) !== JSON.stringify(receipt)) return;
  const profile = item.effects.find(e => e.flags.spikependium?.griffonWildskin); if (!profile) return;
  const data = foundry.utils.mergeObject(profile.toObject(), activity.getAppliedEffectChanges(profile, { chatMessage: results.message, target }));
  delete data._id; data.transfer = false; data.disabled = false; data.start = ActiveEffect.implementation.getEffectStart(); data.duration.expired = false;
  data.flags.spikependium.wildskinGrant = receipt;
  data._stats = { ...data._stats, compendiumSource: null, duplicateSource: profile.uuid };
  data.system.origin = { activity: activity.uuid, profile: profile.id, message: results.message.uuid };
  data.system.changes = await ActiveEffect.implementation.forApplication(data.system.changes, activity, target);
  await target.createEmbeddedDocuments("ActiveEffect", [data]);
}
function saveMode(config, advantage) {
  for (const roll of config.rolls) {
    const o = roll.options ??= {};
    if (advantage) { o.disadvantage ||= o.advantageMode === -1; o.advantage = true; }
    else { o.advantage ||= o.advantageMode === 1; o.disadvantage = true; }
    if (o.advantageMode !== undefined) o.advantageMode = o.advantage && o.disadvantage ? 0 : advantage ? 1 : -1;
  }
}
export function prepareConditionalArmorSave(config, _dialog, message) {
  const actor = config.subject; if (!actor?.isOwner) return;
  const activity = game.messages.get(message.data?.system?.origin)?.getAssociatedActivity();
  const profiles = activity?.applicableEffects ?? activity?.effects?.map(e => activity.item.effects.get(e._id)) ?? [];
  const poisoned = profiles.some(e => e?.statuses?.has("poisoned")), charmed = profiles.some(e => e?.statuses?.has("charmed"));
  const parts = [...(activity?.damage?.parts ?? []), ...(activity?.damage?.includeBase ? [activity.item.system.damage?.base].filter(Boolean) : [])];
  if ((poisoned || parts.some(p => [...(p.types ?? [])].includes("poison"))) && actor.items.some(i => family(i) === "scorpio" && worn(i))) saveMode(config, true);
  if (charmed && effects(actor).some(e => e.active && active(e) && e.flags.spikependium?.scornedCurse)) saveMode(config, false);
}
let cleaning = false;
export async function cleanConditionalArmor() {
  if (cleaning || (game.users.activeGM && !game.user.isActiveGM)) return;
  cleaning = true;
  try {
    for (const actor of actors().values()) {
      if (!actor.isOwner) continue;
      for (const item of actor.items) {
        if (family(item) !== "scorned-heart") continue;
        const bound = item.flags.spikependium.scornedAttunedTo;
        if (actor.flags?.dnd5e?.originalActor && bound && bound !== actor.uuid) continue;
        if (!item.system.attuned) { if (bound) await item.unsetFlag("spikependium", "scornedAttunedTo"); continue; }
        if (bound === actor.uuid) continue;
        if (!actor.effects.some(e => e.flags.spikependium?.scornedCurseSource === item.uuid)) {
          const profile = item.effects.find(e => e.flags.spikependium?.scornedCurse); if (!profile) continue;
          const data = profile.toObject(); delete data._id; data.disabled = false; data.transfer = false; data.start = ActiveEffect.implementation.getEffectStart();
          data.flags.spikependium.scornedCurseSource = item.uuid;
          await actor.createEmbeddedDocuments("ActiveEffect", [data]);
        }
        await item.setFlag("spikependium", "scornedAttunedTo", actor.uuid);
      }
      const ids = actor.effects.filter(e => e.flags.spikependium?.griffonWildskin && (!wildskinActive(actor) || e.flags.spikependium.wildskinGrant?.target !== actor.uuid)).map(e => e.id);
      if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    }
  } finally { cleaning = false; }
}
let refreshing = false;
export function refreshScornedArmor() {
  if (refreshing || !globalThis.canvas?.ready) return;
  refreshing = true;
  try {
    for (const actor of actors().values()) if (actor.items.some(i => family(i) === "scorned-heart" && worn(i))) { actor.reset(); actor.sheet?.render(false); }
  } finally { refreshing = false; }
}
