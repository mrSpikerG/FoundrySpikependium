import { tokensDistance } from "./effects.mjs";
// shortcut: simultaneous owners share native non-atomic updates; use one controller or GM arbitration until server-side locking is available.
const pending = new WeakMap(), casts = new WeakMap(), placements = new WeakMap(), prompted = new Set();
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const kind = activity => activity?.type === "summon" && ({ "spell:magus-animate-weapon": "weapon", "spell:magus-animate-shield": "shield" })[activity.item.flags.spikependium?.key];
const spentPath = frame => `flags.spikependium.animations.${frame.id}.spent`;
const sceneTokens = () => [...(game.scenes ?? [])].flatMap(scene => [...scene.tokens]);
function paid(frame) {
  const caster = resolve(frame?.caster);
  return frame && /^[A-Za-z0-9]{16}$/.test(frame.id ?? "") && caster
    && foundry.utils.getProperty(caster, spentPath(frame)) === 1 && game.time.worldTime < frame.end;
}
export function activeAnimation(actor) {
  const frame = actor?.flags.spikependium?.animation;
  return paid(frame) && !actor.flags.spikependium.animationEnded && actor.system.attributes.hp.value > 0 ? frame : undefined;
}
export function endAnimationAtZero(actor, data) {
  const hp = data["system.attributes.hp.value"] ?? data.system?.attributes?.hp?.value;
  if (actor?.flags.spikependium?.animation && Number.isFinite(hp) && hp <= 0) data["flags.spikependium.animationEnded"] = true;
}
function countAnimated(item) {
  return sceneTokens().filter(token => activeAnimation(token.actor)?.material === item.uuid).length;
}
export function animationMaterials(activity) {
  const type = kind(activity);
  if (!type) return [];
  return activity.actor.items.filter(item => item.isOwner && item.system.quantity > countAnimated(item)
    && (type === "weapon" ? item.type === "weapon" && !!item.system.type.value : item.type === "equipment" && item.system.type.value === "shield")
    && item.system.price.value * ({ cp: .01, sp: .1, ep: .5, gp: 1, pp: 10 }[item.system.price.denomination] ?? 0) >= 1);
}
export function prepareAnimationDialog(activity, config, dialog) {
  if (!kind(activity)) return;
  config.spikependium = { ...config.spikependium, usageChoice: true };
  const Base = dialog.applicationClass; dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      const items = animationMaterials(activity);
      context.fields.push({ name: "spikependium.animationMaterial", value: this.config.spikependium?.animationMaterial ?? items[0]?.id,
        field: new foundry.data.fields.StringField({ required: true, blank: false, label: "Оживляемый предмет (не менее 1 зм)",
          choices: Object.fromEntries(items.map(item => [item.id, item.name])) }) });
      context.notes.push({ type: "info", message: "Оригинал сохраняется в инвентаре и снимается с экипировки; пока предмет оживлён, его нельзя использовать отдельно." });
      context.hasConsumption = true; return context;
    }
  };
}
export function prepareAnimationUpdates(activity, config, updates) {
  pending.delete(activity);
  if (!kind(activity)) return updates;
  const material = animationMaterials(activity).find(item => item.id === config.spikependium?.animationMaterial);
  if (!material || !activity.actor.isOwner) {
    ui.notifications.warn("Выберите собственное доступное оружие или щит стоимостью не менее 1 зм."); return false;
  }
  const combat = game.combat?.started ? game.combat : null;
  const frame = { id: foundry.utils.randomID(), caster: activity.actor.uuid, activity: activity.uuid, material: material.uuid,
    kind: kind(activity), end: game.time.worldTime + 60, castCombat: combat?.id ?? null, castTurn: combat ? `${combat.round}:${combat.turn}` : null };
  updates.actor[spentPath(frame)] = 1;
  if (material.system.equipped && material.system.quantity === 1) updates.item.push({ _id: material.id, "system.equipped": false });
  pending.set(activity, frame); return updates;
}
export function recordAnimation(activity, _config, message) {
  const frame = pending.get(activity); pending.delete(activity);
  if (!frame || !paid(frame)) return;
  const deltas = ((message.data.system ??= {}).deltas ??= {}).actor ??= [];
  if (!deltas.some(delta => delta.keyPath === spentPath(frame))) deltas.push({ keyPath: spentPath(frame), delta: 1 });
  foundry.utils.setProperty(message, "data.flags.spikependium.animation", frame);
  foundry.utils.setProperty(message, "data.flags.dnd5e.item.data", activity.item.toObject());
  casts.set(activity, frame);
}
export async function animationChatAction(wrapped, event, target, message) {
  if (!kind(this)) return wrapped(event, target, message);
  const previous = casts.get(this); casts.set(this, message.flags.spikependium?.animation);
  try { return await wrapped(event, target, message); }
  finally { if (previous) casts.set(this, previous); else casts.delete(this); }
}
function validPlacement(activity) {
  if (!kind(activity)) return;
  const frame = casts.get(activity);
  if (!paid(frame) || frame.activity !== activity.uuid || frame.caster !== activity.actor.uuid
    || frame.kind !== kind(activity) || !animationMaterials(activity).some(item => item.uuid === frame.material)
    || activity.actor.flags.spikependium?.animations?.[frame.id]?.placed
    || sceneTokens().some(token => token.flags.spikependium?.animation?.id === frame.id)) {
    ui.notifications.warn("Этот оживлённый предмет уже размещён или накладывание завершилось/отменено."); return false;
  }
}
export function canPlaceAnimation(activity) {
  const result = validPlacement(activity);
  if (kind(activity) && result !== false) placements.delete(activity);
  return result;
}
export function prepareAnimationToken(activity, _profile, config) {
  if (!kind(activity)) return;
  if (validPlacement(activity) === false || placements.get(activity)) return false;
  const frame = casts.get(activity);
  placements.set(activity, frame.id);
  config.actorUpdates["flags.spikependium.animation"] = structuredClone(frame);
  config.tokenUpdates["flags.spikependium.animation"] = structuredClone(frame);
  config.tokenUpdates.name = resolve(frame.material)?.name ?? config.actor.name;
}
export async function animationPlaced(activity, _profile, tokens) {
  if (!kind(activity) || !activity.actor.isOwner) return;
  for (const token of tokens) {
    const frame = token.flags.spikependium?.animation;
    if (paid(frame)) await activity.actor.setFlag("spikependium", `animations.${frame.id}.placed`, true);
  }
}
export async function animatedWeaponChanges(wrapped, actor, profile, options) {
  if (kind(this) !== "weapon") return wrapped(actor, profile, options);
  const frame = casts.get(this), source = resolve(frame?.material);
  if (!paid(frame) || !animationMaterials(this).some(item => item.uuid === frame.material)) throw Error("Оживляемое оружие недоступно");
  const data = source.toObject();
  const ordinary = [...source.system.activities].find(a => a.type === "attack" && !a.consumption.targets.length);
  const original = ordinary && data.system.activities[ordinary.id];
  const parts = original?.damage?.parts ?? [];
  data.effects = (data.effects ?? []).filter(effect => effect.type === "enchantment" || effect.transfer === false);
  data.system.container = null; data.system.quantity = 1; data.system.equipped = true;
  data.system.range.reach = source.system.properties.has("rch") ? 10 : 5;
  data.system.activities = {};
  const Attack = CONFIG.DND5E.activityTypes.attack.documentClass;
  const attack = new Attack({ type: "attack", name: "Атака оживлённого оружия", img: source.img,
    activation: { type: "special", value: null, override: true },
    attack: { ability: "none", critical: original?.attack.critical, type: { value: original?.attack.type.value ?? (source.system.type.value.endsWith("R") ? "ranged" : "melee"), classification: "weapon" } },
    damage: { includeBase: original?.damage.includeBase ?? true, critical: original?.damage.critical, parts }, effects: original?.effects ?? [],
    consumption: { spellSlot: false, targets: [{ type: "spikependiumAnimatedStrike", target: "", value: "1", scaling: {} }] }
  }, { parent: source }).toObject();
  if (ordinary) attack._id = ordinary.id;
  data.system.activities[attack._id] = attack;
  data.flags ??= {}; data.flags.spikependium = { ...data.flags.spikependium, animatedWeapon: true };
  const staged = actor.clone({ items: [data] }, { keepId: true });
  const result = await wrapped(staged, profile, options);
  const changes = result.actorUpdates.items.find(item => item._id === data._id);
  const enchantment = changes?.effects?.find(effect => effect.type === "enchantment" && effect.system.origin?.activity === this.uuid);
  // dnd5e skips its damage bonus when an attack has only the weapon's base damage.
  if (enchantment && !enchantment.system.changes.some(change => change.key === "system.damage.bonus"))
    enchantment.system.changes.push({ _id: foundry.utils.randomID(), key: "system.damage.bonus", type: "add", value: String(this.getRollData().mod) });
  result.actorUpdates.items = [foundry.utils.mergeObject(staged.items.get(data._id).toObject(), changes ?? {}, { inplace: false })];
  return result;
}
export function canUseAnimatedItem(activity) {
  const frame = activity.actor?.flags.spikependium?.animation;
  if (frame && !activeAnimation(activity.actor)) {
    ui.notifications.warn("Оживление этого предмета закончилось."); return false;
  }
  const item = activity.item;
  const occupied = ["weapon", "equipment"].includes(item.type) ? countAnimated(item) : 0;
  if (!frame && occupied && item.system.quantity <= occupied) {
    ui.notifications.warn("Этот предмет сейчас оживлён. Используйте его токен, а не оригинал в инвентаре."); return false;
  }
}
export function guardAnimatedEquip(item, data) {
  if ((data["system.equipped"] ?? data.system?.equipped) !== true) return;
  const occupied = countAnimated(item);
  if (occupied && item.system.quantity <= occupied) {
    ui.notifications.warn("Предмет остаётся оживлённым; его нельзя снова экипировать."); return false;
  }
}
function turnKey(frame) {
  const caster = resolve(frame.caster), combat = game.combat;
  if (combat?.started) {
    if (combat.combatant?.actor?.uuid !== caster?.uuid || (frame.castCombat === combat.id && frame.castTurn === `${combat.round}:${combat.turn}`)) return;
    return `${combat.id}-${combat.round}-${combat.turn}`;
  }
  const turn = Math.floor((game.time.worldTime - (frame.end - 60)) / 6);
  return turn > 0 ? `outside-${turn}` : undefined;
}
export function registerAnimatedStrike() {
  CONFIG.DND5E.activityConsumptionTypes.spikependiumAnimatedStrike = {
    label: "Атака в начале хода заклинателя", consume(_config, updates) {
      const frame = activeAnimation(this.actor), key = frame && turnKey(frame);
      if (frame?.kind !== "weapon" || !key || this.actor.flags.spikependium?.animatedTurns?.[key]) throw new dnd5e.dataModels.activity.ConsumptionError("Оживлённое оружие атакует один раз в начале последующего хода заклинателя.");
      updates.actor[`flags.spikependium.animatedTurns.${key}`] = 1;
      updates.actor[`flags.spikependium.animatedAttacks.${foundry.utils.randomID()}.spent`] = 1;
    }, consumptionLabels() { return { label: "Использовать единственную атаку этого хода", hint: "Не расходует действие заклинателя." }; }
  };
}
export function canConsumeAnimatedStrike(activity, config) {
  if (!activity.item.flags.spikependium?.animatedWeapon) return;
  if (config.consume !== true && (config.consume?.resources !== true && !config.consume?.resources?.includes?.(0))) {
    ui.notifications.warn("Атака оживлённого оружия требует расхода единственной атаки этого хода."); return false;
  }
}
export function recordAnimatedStrike(activity, _config, message, updates) {
  if (!activity.item.flags.spikependium?.animatedWeapon) return;
  const deltas = ((message.data.system ??= {}).deltas ??= {}).actor ??= [];
  const paths = Object.keys(updates.actor), turn = paths.find(key => key.startsWith("flags.spikependium.animatedTurns.")),
    attempt = paths.find(key => key.startsWith("flags.spikependium.animatedAttacks."));
  for (const path of [turn, attempt].filter(Boolean)) {
    if (!deltas.some(delta => delta.keyPath === path)) deltas.push({ keyPath: path, delta: 1 });
  }
  if (turn && attempt) foundry.utils.setProperty(message, "data.flags.spikependium.animatedTurn", {
    actor: activity.actor.uuid, animation: activeAnimation(activity.actor)?.id, key: turn.split(".").at(-1), attempt: attempt.split(".").at(-2) });
}
export function guardAnimatedAttack(config, _dialog, message) {
  const activity = config.subject;
  if (!activity?.item) return;
  if (canUseAnimatedItem(activity) === false) return false;
  if (!activity.item.flags.spikependium?.animatedWeapon) return;
  const origin = game.messages.get(message.data?.system?.origin), usage = origin?.type === "usage" ? origin : origin?.getOriginatingMessage?.();
  const receipt = usage?.flags.spikependium?.animatedTurn, frame = activeAnimation(activity.actor);
  if (!receipt || receipt.actor !== activity.actor.uuid || receipt.animation !== frame?.id || receipt.key !== turnKey(frame)
    || activity.actor.flags.spikependium?.animatedTurns?.[receipt.key] !== 1
    || !/^[A-Za-z0-9]{16}$/.test(receipt.attempt ?? "") || activity.actor.flags.spikependium?.animatedAttacks?.[receipt.attempt]?.spent !== 1) {
    ui.notifications.warn("Запустите оплаченную атаку оживлённого оружия в текущем ходу заклинателя."); return false;
  }
}
export function preserveAnimatedThrownWeapon(_rolls, { subject, ammoUpdate }) {
  if (subject?.item.flags.spikependium?.animatedWeapon && activeAnimation(subject.actor) && ammoUpdate?.id === subject.item.id) {
    ammoUpdate.quantity = subject.item.system.quantity; ammoUpdate.destroy = false;
  }
}
export async function promptAnimatedAttacks(combat, changed) {
  if (!combat.started || combat !== game.combat || !combat.scene || !("round" in changed || "turn" in changed)) return;
  for (const token of [...combat.scene.tokens]) {
    const frame = activeAnimation(token.actor), key = frame && turnKey(frame), caster = resolve(frame?.caster);
    if (frame?.kind !== "weapon" || !key || token.actor.flags.spikependium?.animatedTurns?.[key]) continue;
    const owner = game.users.find(user => user.active && !user.isGM && caster.testUserPermission(user, "OWNER")) ?? game.users.activeGM;
    if (owner?.id !== game.user.id || prompted.has(`${token.uuid}:${key}`)) continue;
    prompted.add(`${token.uuid}:${key}`);
    if (await foundry.applications.api.DialogV2.confirm({ window: { title: "Оживлённое оружие" },
      content: `<p>Начало хода: выберите цель для ${foundry.utils.escapeHTML(token.name)}, затем подтвердите атаку.</p>` })) {
      const attack = token.actor.items.filter(item => item.flags.spikependium?.animatedWeapon).flatMap(item => [...item.system.activities]).find(a => a.type === "attack");
      await attack?.use({ consume: { action: false, resources: true, spellSlot: false } });
    }
  }
}

export function animatedShieldChanges(wrapped, effect, options = {}) {
  const changes = wrapped(effect, options);
  if (!effect.flags.spikependium?.animatedShield) return changes;
  const source = this.getUsageToken(), target = options.target;
  const descriptors = options.chatMessage?.system.targets?.filter(t => t.actor === target?.uuid) ?? [];
  const token = descriptors.length === 1 && resolve(descriptors[0].token);
  if (!source || !token) return { ...changes, disabled: true };
  if ([...token.parent.tokens].filter(other => other.actor?.uuid === target.uuid).length > 1) {
    ui.notifications.warn("У цели несколько связанных токенов на сцене: общий КД актёра нельзя изменить только для одного. Укажите +2 для нужного токена вручную.");
    return { ...changes, disabled: true };
  }
  changes.flags = foundry.utils.mergeObject(changes.flags ?? {}, { spikependium: { animatedShieldSource: source.uuid, animatedShieldTarget: token.uuid } });
  return changes;
}
function shieldEligible(effect) {
  if (effect.disabled || effect.duration.expired) return false;
  const source = resolve(effect.flags.spikependium?.animatedShieldSource), target = resolve(effect.flags.spikependium?.animatedShieldTarget);
  const frame = activeAnimation(source?.actor);
  const distance = source && target && tokensDistance(source, target);
  return frame?.kind === "shield" && target?.actor?.uuid === effect.parent.uuid && source.parent === target.parent
    && [...target.parent.tokens].filter(other => other.actor?.uuid === target.actor.uuid).length <= 1
    && !target.actor.items.some(item => item.type === "equipment" && item.system.type.value === "shield" && item.system.equipped)
    && distance != null && distance <= 5;
}
export function animatedShieldCondition(wrapped, data) {
  const effect = this.parent;
  if (!effect.flags.spikependium?.animatedShield) return wrapped(data);
  const selected = effect.parent.effects.filter(e => e.flags.spikependium?.animatedShield && shieldEligible(e)).sort((a, b) => a.id.localeCompare(b.id))[0];
  return wrapped({ ...data, spikependium: { ...data?.spikependium, animatedShieldAllowed: selected === effect } });
}
export function refreshAnimatedShields() {
  const actors = new Set([...(game.actors ?? []), ...sceneTokens().map(token => token.actor)].filter(Boolean));
  for (const actor of actors) if (actor.effects.some(e => e.flags.spikependium?.animatedShield)) { actor.reset(); actor.sheet?.render(false); }
}
