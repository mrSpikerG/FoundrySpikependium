import { tokensDistance } from "./effects.mjs";
import { vestigeTokens, vestigeLocked, pocketVestigeAfterSurvival, endVestigeAura } from "./pocket.mjs";

const COMPANION = "subclass:vestige-patron:vestige-companion";
const AURA = "subclass:vestige-patron:aura-of-power";
const AURA_ID = "YpjaiBgRIFECoh2H", SAVE_ID = "OYs3klGoRTdWQLNp";
const CONDITIONS = JSON.stringify({ k: "spikependium.vestigeAuraActive", v: true });
const applying = new Set(), saving = new Set(), upgrading = new Set();
const ending = new Set();
const feature = (owner, key) => owner?.items.find(i => i.flags.spikependium?.key === key);
const auraActivity = a => a?.id === AURA_ID && a.item.flags.spikependium?.key === AURA;
const live = e => !e.disabled && !e.duration.expired && !(Number.isFinite(e.duration.remaining) && e.duration.remaining <= 0);

function sourceFor(owner, effect) {
  const item = feature(owner, COMPANION);
  if (!item || vestigeLocked(item) || owner.statuses.has("dead")) return;
  const tokens = vestigeTokens(item);
  if (tokens.length !== 1) return;
  const token = tokens[0];
  if (token.actor.system.attributes.hp.value <= 0 || token.actor.statuses.has("dead") || token.actor.statuses.has("antimagic")) return;
  const recorded = effect?.flags.spikependium?.vestigeAura?.token;
  return !recorded || recorded === token.uuid ? token : undefined;
}

export function vestigeAuraActive(effect) {
  const uuid = effect.system.origin?.activity;
  if (!uuid) return false;
  const origin = fromUuidSync(uuid, { strict: false });
  if (!auraActivity(origin) || !live(effect) || effect.parent.statuses.has("antimagic")) return false;
  const owner = origin.actor;
  const tracker = owner.effects.find(e => e.system.origin?.activity === origin.uuid && live(e));
  const source = tracker && sourceFor(owner, tracker);
  if (!source) return false;
  return source.parent.tokens.some(t => t.actor?.uuid === effect.parent.uuid && t.level === source.level
    && tokensDistance(source, t) != null && tokensDistance(source, t) <= 30);
}

export function prepareVestigeAuraCondition(wrapped, data) {
  if (!this.parent.flags.spikependium?.vestigeAura) return wrapped(data);
  return wrapped({ ...data, spikependium: { ...data?.spikependium, vestigeAuraActive: vestigeAuraActive(this.parent) } });
}

export function canUseVestigeAura(activity) {
  if (activity?.actor?.flags.spikependium?.key?.startsWith("actor:vestige-")) {
    const uuid = activity.actor.flags.dnd5e?.summon?.origin;
    const item = uuid && fromUuidSync(uuid, { strict: false });
    if (item && vestigeLocked(item)) {
      ui.notifications.warn("После спасения хозяина реликт отправляется в измерение и не действует до продолжительного отдыха.");
      return false;
    }
  }
  if (activity?.id === SAVE_ID && activity.item.flags.spikependium?.key === AURA) {
    ui.notifications.warn("Спасение аурой выполняется автоматически при снижении хитов до 0; отдельное лечение не требуется.");
    return false;
  }
  if (!auraActivity(activity)) return true;
  const valid = (activity.actor.classes.warlock?.system.levels ?? 0) >= 10
    && activity.actor.system.abilities.cha.mod > 0 && sourceFor(activity.actor);
  if (!valid) ui.notifications.warn("Для ауры нужен один проявленный живой реликт, 10 уровень колдуна и положительная длительность по Харизме.");
  return !!valid;
}

export function vestigeAuraUsageToken(wrapped, ...args) {
  return auraActivity(this) ? sourceFor(this.actor) : wrapped(...args);
}

export function validateVestigeAuraTemplate(activity) {
  if (!auraActivity(activity)) return;
  const token = sourceFor(activity.actor);
  if (!canvas.ready || !token || token.parent !== canvas.scene) {
    ui.notifications.warn("Шаблон ауры размещается на активной сцене реликта.");
    return false;
  }
}

export function attachVestigeAuraTemplate(activity, regions) {
  if (!auraActivity(activity)) return;
  const token = sourceFor(activity.actor);
  if (!token || !canvas.ready || token.parent !== canvas.scene) return false;
  for (const region of regions) {
    foundry.utils.setProperty(region, "flags.dnd5e.origin", token.uuid);
    for (const shape of region.shapes) {
      if (shape.type !== "emanation") continue;
      Object.assign(shape.base, { x: token.x, y: token.y, width: token.width, height: token.height, shape: token.shape });
      region.attachment = { ...region.attachment, token: token.id };
    }
  }
}

export function recordVestigeAuraUsage(activity, message) {
  if (!auraActivity(activity)) return;
  foundry.utils.setProperty(message, "data.flags.spikependium.vestigeAura", {
    token: sourceFor(activity.actor)?.uuid, rest: activity.actor.flags.spikependium?.longRest ?? "", start: game.time.worldTime
  });
}

export function vestigeAuraEffectChanges(wrapped, effect, options = {}) {
  const changes = wrapped(effect, options);
  if (!auraActivity(this)) return changes;
  const receipt = options.chatMessage?.flags.spikependium?.vestigeAura;
  return foundry.utils.mergeObject(changes, {
    flags: { spikependium: { vestigeAura: { token: receipt?.token ?? sourceFor(this.actor)?.uuid } } },
    system: { conditions: CONDITIONS, magical: true },
    duration: { value: Math.max(0, this.actor.system.abilities.cha.mod) * 3600, units: "seconds", expiry: null },
    start: { ...ActiveEffect.implementation.getEffectStart(), time: receipt?.start ?? game.time.worldTime }
  });
}

export async function activateVestigeAura(message) {
  if (!game.user.isActiveGM || message.type !== "usage" || message.flags.spikependium?.vestigeAuraApplied || applying.has(message.id)) return;
  const activity = message.getAssociatedActivity();
  if (!auraActivity(activity) || !message.author || !activity.actor.testUserPermission(message.author, "OWNER") || !canUseVestigeAura(activity)) return;
  applying.add(message.id);
  try {
    const token = sourceFor(activity.actor), profile = activity.item.effects.find(e => activity.effects.some(p => p._id === e.id));
    const receipt = message.flags.spikependium?.vestigeAura;
    if (receipt && (receipt.token !== token.uuid || receipt.rest !== (activity.actor.flags.spikependium?.longRest ?? ""))) return;
    if (!profile) throw Error("Отсутствует профиль ауры");
    const targets = new Map([[activity.actor.uuid, activity.actor], [token.actor.uuid, token.actor]]);
    for (const target of message.system.targets) {
      const t = target.token && fromUuidSync(target.token);
      if (t?.parent === token.parent && t.actor?.system.isCreature) targets.set(t.actor.uuid, t.actor);
    }
    const tray = new dnd5e.applications.components.EffectApplicationElement();
    tray.chatMessage = message;
    for (const actor of targets.values()) {
      const { action, data } = await tray._prepareEffectData(profile, actor);
      if (!game.user.isActiveGM || sourceFor(activity.actor)?.uuid !== token.uuid) return;
      if (action === "create") await actor.createEmbeddedDocuments("ActiveEffect", [data]);
      else await actor.updateEmbeddedDocuments("ActiveEffect", [data]);
    }
    await message.setFlag("spikependium", "vestigeAuraApplied", true);
  } catch (error) {
    console.error("Spikependium: проявление ауры реликта", error);
    ui.notifications.error("Не удалось закончить применение ауры. Проверьте эффекты и используйте штатную кнопку карточки для выбранных союзников.");
  } finally { applying.delete(message.id); }
}

export async function upgradeVestigeAuraEffects() {
  if (!game.user.isActiveGM) return;
  const actors = new Map([...game.actors, ...[...game.scenes].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean).map(a => [a.uuid, a]));
  for (const actor of actors.values()) for (const effect of actor.effects) {
    if (effect.flags.spikependium?.vestigeAura || upgrading.has(effect.uuid)) continue;
    const uuid = effect.system.origin?.activity;
    if (!uuid) continue;
    const origin = fromUuidSync(uuid, { strict: false });
    if (!auraActivity(origin)) continue;
    upgrading.add(effect.uuid);
    try {
      await effect.update({ "system.conditions": CONDITIONS, "system.magical": true,
        "flags.spikependium.vestigeAura": { token: sourceFor(origin.actor)?.uuid } });
    } finally { upgrading.delete(effect.uuid); }
  }
}

export async function endExpiredVestigeAuras() {
  if (!game.user.isActiveGM) return;
  const owners = new Map([...game.actors, ...[...game.scenes].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean).map(a => [a.uuid, a]));
  for (const owner of owners.values()) {
    const aura = feature(owner, AURA), item = feature(owner, COMPANION);
    if (!aura || !item || ending.has(owner.uuid)) continue;
    // Отключённый эффект можно включить обратно; истёкший или удалённый заканчивает ауру.
    const exists = owner.effects.some(e => e.system.origin?.activity === `${aura.uuid}.Activity.${AURA_ID}` && !e.duration.expired
      && !(Number.isFinite(e.duration.remaining) && e.duration.remaining <= 0));
    if (exists) continue;
    ending.add(owner.uuid);
    try { await endVestigeAura(owner); }
    finally { ending.delete(owner.uuid); }
  }
}

export function recordVestigeSurvival(owner, changed) {
  const value = changed["system.attributes.hp.value"] ?? changed.system?.attributes?.hp?.value;
  if (!owner.isOwner || value !== 0 || !(owner.system.attributes.hp.value > 0) || owner.statuses.has("dead")
    || (owner.classes.warlock?.system.levels ?? 0) < 10) return;
  const aura = feature(owner, AURA), item = feature(owner, COMPANION);
  if (!aura || !item || vestigeLocked(item)) return;
  const effect = owner.effects.find(e => e.system.origin?.activity === `${aura.uuid}.Activity.${AURA_ID}` && vestigeAuraActive(e));
  const token = effect && sourceFor(owner, effect);
  const hp = (owner.classes.warlock?.system.levels ?? 0) + owner.system.abilities.cha.mod;
  if (!token || !Number.isFinite(hp) || hp <= 0) return;
  if (Object.hasOwn(changed, "system.attributes.hp.value")) changed["system.attributes.hp.value"] = Math.min(hp, owner.system.attributes.hp.effectiveMax);
  else foundry.utils.setProperty(changed, "system.attributes.hp.value", Math.min(hp, owner.system.attributes.hp.effectiveMax));
  foundry.utils.setProperty(changed, "flags.spikependium.vestigeSave", { origin: item.uuid, token: token.uuid,
    rest: owner.flags.spikependium?.longRest ?? "", event: foundry.utils.randomID(), state: "pending" });
  foundry.utils.setProperty(changed, "system.attributes.death.success", 0);
  foundry.utils.setProperty(changed, "system.attributes.death.failure", 0);
  if (owner.flags.spikependium?.soulInstantDeath || changed["flags.spikependium.soulInstantDeath"])
    changed["flags.spikependium.soulInstantDeath"] = 0;
}

export async function finishVestigeSurvival() {
  if (!game.user.isActiveGM) return;
  const owners = new Map([...game.actors, ...[...game.scenes].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean).map(a => [a.uuid, a]));
  for (const owner of owners.values()) {
    const record = owner.flags.spikependium?.vestigeSave;
    if (record?.state !== "pending" || saving.has(owner.uuid)) continue;
    const item = feature(owner, COMPANION);
    if (!item || item.uuid !== record.origin || !feature(owner, AURA) || (owner.classes.warlock?.system.levels ?? 0) < 10) continue;
    saving.add(owner.uuid);
    try {
      if (await pocketVestigeAfterSurvival(item, record) && owner.flags.spikependium?.vestigeSave?.event === record.event)
        await owner.setFlag("spikependium", "vestigeSave.state", "done");
    } catch (error) {
      console.error("Spikependium: спасение аурой реликта", error);
      ui.notifications.error("Хиты сохранены, но уход реликта не завершён. Возвращение заблокировано до отдыха; проверьте исходный и сохранённый листы.");
    } finally { saving.delete(owner.uuid); }
  }
}
