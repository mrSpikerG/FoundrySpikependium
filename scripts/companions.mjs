import { incapacitated, tokensDistance } from "./effects.mjs";
import { guardianTarget, guardianRecords } from "./attack-source.mjs";
import { dropVestigeGear } from "./vestige.mjs";
import { endVestigeAura, pendingVestigeForm } from "./pocket.mjs";

const EXPLOSION_ID = "ouJq9QTnoBzasU2E";
const LIFE_TRANSFER_ID = "iGYlP2dh1dU2ViW7";
const CONDUIT_BONUS_ID = "rCW8TiR18Bvn7OkU";
const STRIKE_ID = "8FKHvTEMzK92yKo4";
const SECOND_STRIKE_ID = "8I7DzW0U2d8CuWql";
const exploding = new Set();
const striking = new Set();
const wetResponses = new Set();
const isExplosion = activity => activity?.flags?.spikependium?.companionAction === "death-explosion" || activity?.id === EXPLOSION_ID;
export const isLifeTransfer = activity => activity.flags?.spikependium?.companionAction === "transfer-life" || activity.id === LIFE_TRANSFER_ID;

const combatTurn = combat => combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : null;

export function companionInt(actor, fallback) {
  const origin = actor.flags.dnd5e?.summon?.origin;
  const current = origin ? fromUuidSync(origin)?.actor?.system.abilities?.int?.mod : null;
  return [current, actor.flags.spikependium?.companionInt, fallback].find(Number.isFinite);
}

export function bigExplosionDamageConfig(wrapped, config = {}, options = {}) {
  const prepared = wrapped(config, options);
  if (!isExplosion(this) || !this.actor.flags.spikependium?.key?.includes(":big-")) return prepared;
  const part = this.damage.parts[0];
  if (!part?.bonus || part.custom.enabled || !Number.isFinite(Number(part.bonus))) return prepared;
  const scaling = prepared.scaling ?? prepared.rolls[0]?.data?.scaling;
  if (prepared.rolls[0]?.parts[0] !== part.scaledFormula(scaling, options.formulaOptions)) return prepared;
  // У старых спутников бонус уже записан в формуле; переносим его в выбор, сохраняя остальные слагаемые.
  prepared.rolls[0].parts[0] = part.clone({ bonus: "" }).scaledFormula(scaling, options.formulaOptions);
  prepared.spikependium = { ...prepared.spikependium, explosionInt: companionInt(this.actor, Number(part.bonus)) };
  return prepared;
}

export function prepareExplosionBonus(config, dialog) {
  const activity = config.subject;
  if (!activity || !isExplosion(activity) || !activity.actor.flags.spikependium?.key?.includes(":big-")) return;
  const bonus = companionInt(activity.actor, config.spikependium?.explosionInt);
  if (!Number.isFinite(bonus) || !config.rolls?.length) return;
  // Пользовательская формула с оставшимся бонусом требует обычного ситуационного поля.
  if (activity.damage.parts[0]?.bonus && config.spikependium?.explosionInt == null) return;
  config.spikependium = { ...config.spikependium, explosionInt: bonus, explosionBonus: config.spikependium?.explosionBonus ?? false };
  const Base = dialog.applicationClass ?? CONFIG.Dice.DamageRoll.DefaultConfigurationDialog;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConfigurationContext(context, options) {
      context = await super._prepareConfigurationContext(context, options);
      context.fields.push({ name: "spikependium.explosionBonus", value: this.config.spikependium.explosionBonus,
        field: new foundry.data.fields.BooleanField({ label: `Крупный: добавить Интеллект (${bonus >= 0 ? "+" : ""}${bonus})` }),
        input: context.inputs.createCheckboxInput });
      return context;
    }

    _buildConfig(roll, formData, index) {
      roll = super._buildConfig(roll, formData, index);
      const selected = formData?.get("spikependium.explosionBonus") ?? this.config.spikependium.explosionBonus;
      this.config.spikependium.explosionBonus = selected === true || selected === "true";
      roll.parts = roll.parts.filter(p => p !== "@spikependiumExplosionInt");
      delete roll.options.spikependiumExplosionInt;
      delete roll.data.spikependiumExplosionInt;
      if (index === 0 && this.config.spikependium.explosionBonus && !(roll.options.type in CONFIG.DND5E.healingTypes)) {
        roll.parts.push("@spikependiumExplosionInt");
        roll.data.spikependiumExplosionInt = roll.options.spikependiumExplosionInt = bonus;
      }
      return roll;
    }
  };
}

export function validateExplosionBonus(rolls, config) {
  if (config.spikependium?.explosionInt == null || !config.spikependium.explosionBonus || !rolls.length) return;
  const bonus = companionInt(config.subject.actor, config.spikependium.explosionInt);
  if (bonus !== config.spikependium.explosionInt || rolls[0]?.options.spikependiumExplosionInt !== bonus) {
    ui.notifications.warn("Бонус Интеллекта для Взрыва изменился. Повторите бросок.");
    return false;
  }
}

export function attackHitTargets(message, { ignoreDefense = false } = {}) {
  if (message.type !== "attack") return [];
  if (guardianRecords(message).some(r => ["prompted", "moving", "stopped"].includes(r.state))) return [];
  const hits = [];
  for (const [index, roll] of message.rolls.entries()) {
    if (!(roll instanceof CONFIG.Dice.D20Roll) || !roll._evaluated) continue;
    for (const original of message.system.targets) {
      const target = guardianTarget(message, original, index);
      if (target.isMiss || (!ignoreDefense && index === 0 && defensiveCharmWaiting(message, target))) continue;
      if (target === original && (!Number.isFinite(target.ac) || (!roll.isCritical && (roll.isFumble || roll.total < target.ac)))) continue;
      const token = target.token ? fromUuidSync(target.token) : null;
      if (token?.actor) hits.push({ index, target, token });
    }
  }
  return hits;
}

export function wetHitSnapshots(message) {
  if (message.type !== "attack") return [];
  const attacker = message.getAssociatedToken();
  if (!attacker?.parent?.grid || !["character", "npc"].includes(attacker.actor.type)) return [];
  const hits = [];
  for (const { index, token } of attackHitTargets(message)) {
    const actor = token.actor;
    const key = actor.flags.spikependium?.key ?? "";
    const distance = tokensDistance(attacker, token);
    if (!key.startsWith("actor:reanimated-companion:") || !key.endsWith(":wet") || actor.system.attributes.hp.value <= 0
      || actor.statuses.has("dead") || distance == null || distance > 10) continue;
    const activity = [...actor.items].flatMap(i => [...i.system.activities]).find(a => a.id === "V1Ih7mjczKLWA8EK");
    const bonus = companionInt(actor, Number(activity?.damage.parts[0]?.custom.formula));
    if (!activity || !Number.isFinite(bonus) || bonus <= 0) continue;
    hits.push({ index, token: token.uuid, actor: actor.uuid, bonus, item: activity.item.toObject(), sources: activity.messageSources,
      speaker: ChatMessage.getSpeaker({ actor, token, scene: token.parent }),
      target: { actor: attacker.actor.uuid, token: attacker.uuid, name: attacker.name, img: attacker.texture.src,
        ac: attacker.actor.system.attributes.ac.value } });
  }
  return hits;
}

export function recordWetHits(message) {
  const hits = wetHitSnapshots(message);
  if (hits.length) message.updateSource({ "flags.spikependium.wetHits": hits });
}

export async function triggerWetResponses(message) {
  if (!game.user.isActiveGM || message.type !== "attack") return;
  for (const hit of message.flags.spikependium?.wetHits ?? wetHitSnapshots(message)) {
    const event = `${message.id}:${hit.index}:${hit.token}`;
    if (wetResponses.has(event) || game.messages.some(m => m.flags.spikependium?.wetResponse === event)) continue;
    wetResponses.add(event);
    try {
      const activity = fromUuidSync(hit.sources.activity.uuid);
      const response = { rollMode: message.blind ? "blind" : message.whisper?.length ? "gm" : "public",
        data: { type: "damage", speaker: hit.speaker, whisper: [...(message.whisper ?? [])], blind: message.blind ?? false,
        flavor: "Влажный спутник — кислотный ответ",
        system: { ...hit.sources, origin: message.id, targets: [hit.target] },
        flags: { spikependium: { wetResponse: event }, dnd5e: { item: { data: hit.item } } } } };
      await CONFIG.Dice.DamageRoll.build({ subject: activity, hookNames: ["damage"], critical: { allow: false },
        rolls: [{ parts: [String(hit.bonus)], options: { type: "acid", types: ["acid"] } }]
      }, { configure: false }, response);
      if (!response.document) throw new Error("Кислотный ответ не создал карточку урона");
    } catch (error) {
      console.error("Spikependium: кислотный ответ спутника", error);
      ui.notifications.error("Не удалось создать кислотный ответ. Используйте действие на листе спутника; проверьте, не появилась ли карточка в чате.");
    } finally { wetResponses.delete(event); }
  }
}

export async function rollCompanionStrike(wrapped, config = {}, dialog = {}, message = {}) {
  const actor = this.actor;
  const key = actor?.flags.spikependium?.key ?? "";
  const turn = combatTurn(game.combat);
  if (!key.startsWith("actor:reanimated-companion") || ![STRIKE_ID, SECOND_STRIKE_ID].includes(this.id) || !turn)
    return wrapped(config, dialog, message);
  const origin = actor.flags.dnd5e?.summon?.origin;
  if (!origin) return wrapped(config, dialog, message);
  const creator = origin ? fromUuidSync(origin) : null;
  const commanded = creator?.actor.flags.spikependium?.companionCommands?.[creator.id] === turn;
  const maximum = key.includes(":fury") && commanded ? 2 : 1;
  const used = actor.flags.spikependium.strikes;
  const count = used?.turn === turn ? used.count : 0;
  const requested = Math.max(1, config.rolls?.length ?? 1);
  if (!actor.isOwner || !creator?.actor || game.combat.combatant?.actor?.uuid !== creator.actor.uuid
    || !canCompanionAct(this, fromUuidSync, game.combat) || actor.system.attributes.hp.value <= 0 || incapacitated(actor)
    || count + requested > maximum || (this.id === SECOND_STRIKE_ID && (maximum !== 2 || count !== 1)) || striking.has(actor.uuid)) {
    ui.notifications.warn("Удар требует живого действующего спутника, хода хозяина и приказа. Второй удар Ярости доступен после первого, всего не более двух; без приказа при недееспособности хозяина — один.");
    return null;
  }
  striking.add(actor.uuid);
  foundry.utils.setProperty(message, "data.flags.spikependium.companionStrike", { actor: actor.uuid, turn });
  try {
    const rolls = await wrapped(config, dialog, message);
    if (rolls?.length && combatTurn(game.combat) === turn) {
      const current = actor.flags.spikependium.strikes;
      await actor.update({ "flags.spikependium.strikes": { turn, count: (current?.turn === turn ? current.count : 0) + rolls.length } });
    }
    return rolls;
  } finally { striking.delete(actor.uuid); }
}

export function prepareCompanionDamage(config, dialog, message) {
  prepareExplosionBonus(config, dialog);
  const activity = config.subject;
  const actor = activity?.actor;
  if (!actor?.flags.spikependium?.key?.startsWith("actor:reanimated-companion") || activity.id === CONDUIT_BONUS_ID) return;
  const origin = actor.flags.dnd5e?.summon?.origin;
  const level = actor.flags.spikependium.companionLevel
    ?? (origin ? fromUuidSync(origin)?.actor?.classes.artificer?.system.levels : 0);
  // Снимок сохраняет правило урона после удаления токена или исходного действия.
  foundry.utils.setProperty(message, "data.flags.spikependium.ignoreNecroticResistance", level >= 15);
}

export function calculateCompanionDamage(wrapped, damages, options = {}) {
  delete options.spikependiumAbsorption;
  let absorbing = false;
  if (this.flags.spikependium?.key?.startsWith("actor:reanimated-companion")
    && this.system.attributes.hp.value > 0 && !this.statuses.has("dead"))
    damages = damages.map(d => {
      if (d.type !== "lightning" || d.value <= 0) return d;
      absorbing = true;
      return { ...d, value: options.multiplier < 0 ? -d.value : d.value, type: "healing", spikependiumAbsorption: true };
    });
  const source = options.originatingMessage ?? options.origin;
  const types = source?.flags?.spikependium?.ignoreResistanceTypes;
  const bypass = new Set((Array.isArray(types) ? types : []).filter(t => ["necrotic", "poison", "psychic"].includes(t)));
  if (source?.flags?.spikependium?.ignoreNecroticResistance) bypass.add("necrotic");
  const piercing = damages.some(d => bypass.has(d.type))
    && options.ignore !== true && options.ignore?.resistance !== true;
  if (!absorbing && !piercing) return wrapped(damages, options);
  const ignored = new Set(piercing ? options.ignore?.resistance || [] : []);
  if (piercing) for (const type of bypass) ignored.add(type);
  const nativeOptions = { ...options, ignore: options.ignore === true ? true : { ...options.ignore,
    ...(piercing ? { resistance: ignored } : {}), ...(absorbing ? { threshold: true } : {}) } };
  const resistance = this.system.traits?.dr;
  const original = resistance?.value;
  // Нативный ALL проверяется отдельно: разворачиваем его только на время синхронного расчёта.
  if (piercing && original?.has("ALL") && !ignored.has("ALL")) resistance.value = new Set([...original].filter(t => t !== "ALL")
      .concat([...Object.keys(CONFIG.DND5E.damageTypes), ...damages.map(d => d.type)].filter(t => !bypass.has(t) && !(t in CONFIG.DND5E.healingTypes))));
  let result;
  try { result = wrapped(damages, nativeOptions); }
  finally { if (resistance) resistance.value = original; }
  if (!result || !absorbing) return result;
  let damage = Math.trunc(result.filter(d => !d.spikependiumAbsorption && !["temphp", "maximum"].includes(d.type))
    .reduce((n, d) => n + d.value, Math.min(0, result.tempMax)));
  if (damage > 0 && damage < (this.system.attributes.hp.dt ?? -Infinity) && options.ignore !== true && !options.ignore?.threshold) {
    damage = 0;
    for (const d of result.filter(d => !d.spikependiumAbsorption)) {
      d.value = 0;
      Object.assign(d.active, { multiplier: 0, threshold: true });
    }
  }
  const healing = Math.trunc(-result.filter(d => d.spikependiumAbsorption).reduce((n, d) => n + d.value, 0));
  result.amount = damage - healing;
  options.spikependiumAbsorption = { damage, healing, temp: result.temp, tempMax: result.tempMax };
  return result;
}

export function prepareCompanionAbsorption(actor, amount, updates, options) {
  const absorption = options.spikependiumAbsorption;
  if (!absorption || absorption.healing <= 0 || absorption.damage <= 0) return;
  const hp = actor.system.attributes.hp;
  const tempSpent = Math.min(hp.temp, absorption.damage);
  const hpSpent = absorption.damage - tempSpent;
  // Остальные типы сначала расходуют временные хиты; поглощённое электричество лечит обычные хиты.
  updates["system.attributes.hp.temp"] = Math.max(hp.temp - tempSpent, absorption.temp);
  updates["system.attributes.hp.value"] = Math.max(0, Math.min(hp.value + hp.damage - absorption.tempMax, hp.value - hpSpent + absorption.healing));
}

export function lifeCompanions(owner) {
  return [...new Map([...game.scenes].flatMap(scene => [...scene.tokens].map(t => t.actor)).filter(actor => actor?.isOwner
    && actor.flags.spikependium?.key?.startsWith("actor:reanimated-companion")
    && actor.system.attributes.hp.value > 0 && !actor.statuses.has("dead")
    && actor.flags.dnd5e?.summon?.origin
    && fromUuidSync(actor.flags.dnd5e?.summon?.origin)?.actor?.uuid === owner.uuid).map(actor => [actor.uuid, actor])).values()];
}

export function appendLifeTransferFields(activity, config, context) {
  if (!isLifeTransfer(activity)) return context;
  const companions = lifeCompanions(activity.actor);
  context.fields.push({ name: "spikependium.companion", value: companions.some(a => a.uuid === config.spikependium?.companion)
    ? config.spikependium.companion : companions[0]?.uuid,
  field: new foundry.data.fields.StringField({ label: "Спутник для Передачи жизни", required: true, blank: false,
    choices: Object.fromEntries(companions.map(a => [a.uuid, `${a.name} (${a.system.attributes.hp.value} хитов)`])) }) });
  context.notes.push({ type: "info", message: companions.length
    ? "Когда вы получаете урон: реакция убивает выбранного спутника и запускает Взрыв. Лечение применяется штатной кнопкой dnd5e только к вам."
    : "Нет живого Реанимированного спутника, к которому у вас есть права владельца. Обратитесь к Мастеру." });
  context.hasConsumption = true;
  return context;
}

const companionUpdate = (actor, changes) => actor.parent
  ? { action: "update", documentName: "ActorDelta", parent: actor.parent, updates: [{ _id: actor.parent.delta.id, ...changes }] }
  : { action: "update", documentName: "Actor", updates: [{ _id: actor.id, ...changes }] };

export async function prepareLifeTransfer(activity, config, updates) {
  if (!isLifeTransfer(activity)) return updates;
  const owner = activity.actor;
  const companions = lifeCompanions(owner);
  const companion = companions.find(a => a.uuid === config.spikependium?.companion)
    ?? (!config.spikependium?.companion && companions.length === 1 ? companions[0] : null);
  if (!owner.isOwner || (owner.classes.artificer?.system.levels ?? 0) < 15 || incapacitated(owner) || !companion) {
    ui.notifications.warn("Передача жизни требует 15 уровня изобретателя, возможности действовать и выбора своего живого спутника с правами владельца.");
    return false;
  }
  const event = foundry.utils.randomID();
  const dead = (await ActiveEffect.implementation.fromStatusEffect("dead")).toObject();
  dead._id = foundry.utils.randomID();
  dead.origin = activity.uuid;
  updates.operations ??= [];
  updates.operations.push(companionUpdate(companion, { "system.attributes.hp.value": 0,
    "flags.spikependium.lifeTransfer": event, "flags.spikependium.deathExplosion": "pending" }),
  { action: "create", documentName: "ActiveEffect", parent: companion, data: [dead], keepId: true });
  // Числовая дельта сохраняет штатную кнопку отмены даже без учёта реакций в системе.
  const path = `flags.spikependium.companionLifeUses.${activity.item.id}`;
  updates.actor[path] = (foundry.utils.getProperty(owner, path) ?? 0) + 1;
  updates.spikependium = { ...updates.spikependium, tinkerUndo: { holder: owner.uuid,
    created: [], deleted: [], item: [], containers: [], life: { companion: companion.uuid, event, deadEffect: dead._id,
      hp: companion.system.attributes.hp.value, ownerHP: owner.system.attributes.hp.value, rest: owner.flags.spikependium?.longRest ?? "" } } };
  return updates;
}

function lifeLink(message) {
  const seen = new Set();
  while (message && !seen.has(message)) {
    seen.add(message);
    const link = message.flags?.spikependium?.lifeTransfer;
    if (link) return link;
    const origin = message.system?.origin;
    message = typeof origin === "string" ? game.messages.get(origin) : origin;
  }
}

function activeLifeTransfer(link) {
  if (typeof link?.companion !== "string" || typeof link?.event !== "string") return false;
  const companion = fromUuidSync(link.companion);
  return companion?.flags.spikependium?.lifeTransfer === link.event && companion.system.attributes.hp.value === 0;
}

export function canCreateCompanionMessage(message) {
  const strike = message.flags?.spikependium?.companionStrike;
  if (strike) {
    const actor = typeof strike.actor === "string" ? fromUuidSync(strike.actor) : null;
    const origin = actor?.flags.dnd5e?.summon?.origin;
    const originItem = origin ? fromUuidSync(origin) : null;
    const creator = originItem?.actor;
    if (strike.turn !== combatTurn(game.combat) || !actor || actor.system.attributes.hp.value <= 0 || incapacitated(actor)
      || !creator || game.combat.combatant?.actor?.uuid !== creator.uuid
      || (!incapacitated(creator) && creator.flags.spikependium?.companionCommands?.[originItem.id] !== strike.turn)) {
      ui.notifications.warn("Ход или состояние спутника уже изменились. Повторите бросок Ужасающего удара в ход хозяина.");
      return false;
    }
  }
  const link = lifeLink(message);
  if (!link || activeLifeTransfer(link)) return;
  ui.notifications.warn("Передача жизни уже отменена или спутник оживлён. Эта карточка больше не действует.");
  return false;
}

export function prepareCompanionUsage(activity, message) {
  if (isLifeTransfer(activity)) foundry.utils.setProperty(message, "data.system.targets", lifeHealingTargets(activity.actor));
  if (isExplosion(activity) && activity.actor.flags.spikependium?.lifeTransfer)
    foundry.utils.setProperty(message, "data.flags.spikependium.lifeTransfer", {
      companion: activity.actor.uuid, event: activity.actor.flags.spikependium.lifeTransfer });
}

function lifeHealingTargets(actor) {
  const token = actor.isToken ? actor.token : actor.getActiveTokens(false, true)[0];
  return [{ actor: actor.uuid, ...(token ? { token: token.uuid } : {}), name: actor.name, img: actor.img,
    ac: actor.system.attributes.ac.value }];
}

export function rollLifeHealing(wrapped, config = {}, dialog = {}, message = {}) {
  if (!isLifeTransfer(this)) return wrapped(config, dialog, message);
  const id = message.data?.system?.origin ?? config.event?.target?.closest("[data-message-id]")?.dataset.messageId;
  const usage = game.messages.get(id);
  const link = lifeLink(usage);
  if (!link || !usage.system.deltas || !activeLifeTransfer(link)) {
    ui.notifications.warn("Сначала примените Передачу жизни; лечение выполняется из её действующей карточки.");
    return;
  }
  foundry.utils.setProperty(message, "data.system.targets", lifeHealingTargets(this.actor));
  foundry.utils.setProperty(message, "data.system.origin", usage.id);
  foundry.utils.setProperty(message, "data.flags.spikependium.lifeTransfer", link);
  return wrapped(config, dialog, message);
}

export async function appendLifeTransferRefund(activity, undo, updates) {
  if (!undo.life) return;
  const life = undo.life;
  const owner = activity.actor;
  const companion = await fromUuid(life.companion);
  if (!companion?.isOwner || !activeLifeTransfer(life)
    || !companion.flags.dnd5e?.summon?.origin || fromUuidSync(companion.flags.dnd5e.summon.origin)?.actor?.uuid !== owner.uuid
    || (owner.flags.spikependium?.longRest ?? "") !== life.rest || owner.statuses.has("dead")
    || owner.system.attributes.hp.value !== life.ownerHP || lifeCompanions(owner).length)
    throw new Error("Спутник, хиты хозяина или призыв уже изменились. Отмену Передачи жизни должен выполнить Мастер.");
  const related = game.messages.filter(message => {
    const link = lifeLink(message);
    return link?.companion === life.companion && link.event === life.event;
  });
  if (exploding.has(companion.uuid) || (game.users?.activeGM && (companion.flags.spikependium.deathExplosion === "pending"
    || (companion.flags.spikependium.deathExplosion === "done" && !related.some(m => m.flags.spikependium?.deathExplosion)))))
    throw new Error("Дождитесь создания карточки Взрыва, затем повторите отмену.");
  if (related.some(m => m.rolls?.length || m.system?.outcomes?.size || Object.keys(m.system?.outcomes ?? {}).length))
    throw new Error("Для Передачи жизни или Взрыва уже выполнены броски. Их последствия должен отменить Мастер.");
  if (companion.effects.some(e => e.id !== life.deadEffect && !e.disabled && e.statuses.has("dead")))
    throw new Error("На спутнике появилось другое состояние смерти. Нужна помощь Мастера.");
  const unused = related.filter(m => !m.flags.spikependium?.tinkerUndo?.life);
  if (unused.some(m => !m.canUserModify(game.user, "delete"))) throw new Error("Для удаления карточки Взрыва при отмене нужны права Мастера.");
  if (unused.length) updates.operations.push({ action: "delete", documentName: "ChatMessage", ids: unused.map(m => m.id) });
  if (companion.effects.has(life.deadEffect)) updates.operations.push({ action: "delete", documentName: "ActiveEffect", parent: companion, ids: [life.deadEffect] });
  updates.operations.push(companionUpdate(companion, { "system.attributes.hp.value": life.hp,
    "flags.spikependium.lifeTransfer": "", "flags.spikependium.deathExplosion": "" }));
}

export function recordCompanionDeath(actor, changed) {
  if (!actor?.flags.spikependium?.key?.startsWith("actor:reanimated-companion")) return;
  const hp = changed["system.attributes.hp.value"] ?? foundry.utils.getProperty(changed, "system.attributes.hp.value")
    ?? actor.system.attributes.hp.value;
  const statuses = changed.statuses ?? actor.statuses;
  const dead = hp <= 0 || new Set(statuses).has("dead");
  const wasDead = actor.system.attributes.hp.value <= 0 || actor.statuses.has("dead");
  if (dead && !wasDead) changed["flags.spikependium.deathExplosion"] = "pending";
  else if (!dead && wasDead) {
    changed["flags.spikependium.deathExplosion"] = "";
    changed["flags.spikependium.lifeTransfer"] = "";
  }
}

export async function recordCompanionStatus(effect) {
  const actor = effect.parent;
  if (!game.user.isActiveGM || actor?.documentName !== "Actor"
    || !actor.flags.spikependium?.key?.startsWith("actor:reanimated-companion")) return;
  const state = actor.flags.spikependium.deathExplosion;
  if (actor.system.attributes.hp.value > 0 && !actor.statuses.has("dead")) {
    if (state) await actor.setFlag("spikependium", "deathExplosion", "");
    if (actor.flags.spikependium.lifeTransfer) await actor.setFlag("spikependium", "lifeTransfer", "");
  } else if (effect.statuses.has("dead") && !state) await actor.setFlag("spikependium", "deathExplosion", "pending");
}

export function canUseCompanionDeath(activity, config = {}) {
  if (!isExplosion(activity)) return true;
  const state = activity.actor.flags.spikependium?.deathExplosion;
  return (activity.actor.system.attributes.hp.value <= 0 || activity.actor.statuses.has("dead"))
    && state !== "done" && (state !== "pending" || !game.users?.activeGM || config.spikependium?.deathExplosion === true);
}

export function prepareCompanionDeath(activity, config, updates) {
  if (!isExplosion(activity)) return updates;
  if (!canUseCompanionDeath(activity, config)) {
    ui.notifications.warn("Взрыв доступен при смерти спутника и только один раз до его оживления.");
    return false;
  }
  updates.actor["flags.spikependium.deathExplosion"] = "done";
  return updates;
}

export function explosionTargets(source, scene) {
  if (!scene.grid && (!canvas.ready || canvas.scene !== scene)) return [];
  return scene.tokens.filter(token => token !== source && ["character", "npc"].includes(token.actor?.type)
    && tokensDistance(source, token) <= 10).map(token => ({ actor: token.actor.uuid, token: token.uuid,
    name: token.name, img: token.texture.src, ac: token.actor.statuses.has("coverTotal") ? null : token.actor.system.attributes.ac.value }));
}

export async function triggerCompanionDeath(actor, source, scene) {
  if (!game.user.isActiveGM || exploding.has(actor.uuid) || actor.flags.spikependium?.deathExplosion !== "pending"
    || (!scene.grid && (!canvas.ready || canvas.scene !== scene))) return;
  const activity = [...actor.items].flatMap(item => [...item.system.activities]).find(isExplosion);
  if (!activity) {
    await actor.setFlag("spikependium", "deathExplosion", "failed");
    ui.notifications.warn("У Реанимированного спутника отсутствует действие Взрыв. Обновите его запись из компендиума.");
    return;
  }
  exploding.add(actor.uuid);
  const event = foundry.utils.randomID();
  try {
    const results = await activity.use({ consume: false, create: { measuredTemplate: false }, subsequentActions: false,
      spikependium: { deathExplosion: true } }, { configure: false }, { data: {
        speaker: ChatMessage.getSpeaker({ actor, token: source, scene }),
        flags: { spikependium: { deathExplosion: event }, dnd5e: { item: { data: activity.item.toObject() } } },
        system: { targets: explosionTargets(source, scene) }
      } });
    if (!results?.message) throw new Error("Взрыв не создал карточку действия");
    if (actor.flags.spikependium.deathExplosion === "pending") await actor.setFlag("spikependium", "deathExplosion", "done");
  } catch (error) {
    const cardCreated = game.messages.some(message => message.flags.spikependium?.deathExplosion === event);
    if (["pending", "done"].includes(actor.flags.spikependium.deathExplosion))
      await actor.setFlag("spikependium", "deathExplosion", cardCreated ? "done" : "failed");
    console.error("Spikependium: взрыв спутника", error);
    ui.notifications.error(cardCreated ? "Взрыв создал карточку, но завершился с ошибкой. Используйте уже созданную карточку."
      : "Не удалось запустить Взрыв спутника. Его можно применить вручную на листе спутника.");
  } finally { exploding.delete(actor.uuid); }
}

const COMMAND_KEYS = new Set(["actor:purple-dragon-companion"]);
export function commandCompanion(activity, config, message, updates, combat = game.combat) {
  if (activity.flags.spikependium?.companionAction !== "command") return;
  if (combat?.started && combat.combatant?.actor?.uuid !== activity.actor.uuid) {
    ui.notifications.warn("Приказ спутнику доступен в ваш ход.");
    return false;
  }
  updates.actor[`flags.spikependium.companionCommands.${activity.item.id}`] = combat?.started
    ? `${combat.id}:${combat.round}:${combat.turn}` : "outside-combat";
}

export function canCompanionAct(activity, resolve, combat) {
  const key = activity.actor?.flags.spikependium?.key ?? "";
  if (!(COMMAND_KEYS.has(key) || key.startsWith("actor:reanimated-companion") || key.startsWith("actor:vestige-"))
    || !combat?.started || ["reaction", "turnStart", "turnEnd"].includes(activity.activation.type)
    || (activity.activation.type !== "action" && activity.type !== "attack")) return true;
  const uuid = activity.actor.flags.dnd5e?.summon?.origin;
  if (!uuid) return true;
  const origin = uuid ? resolve(uuid) : null;
  if (!origin?.actor) return false;
  if (incapacitated(origin.actor)) return true;
  const turn = `${combat.id}:${combat.round}:${combat.turn}`;
  return origin.actor.flags.spikependium?.companionCommands?.[origin.id] === turn;
}

export function companionEnd(token, resolve, restedActor) {
  const actor = token.actor;
  const key = actor?.flags.spikependium?.key ?? "";
  if (!key.startsWith("actor:vestige-") && !key.startsWith("actor:reanimated-companion")) return null;
  const origin = resolve(actor.flags.dnd5e?.summon?.origin);
  if (!origin?.actor) return null;
  const dead = origin.actor.statuses.has("dead");
  if (key.startsWith("actor:vestige-")) return dead || actor.system.attributes.hp.value <= 0 ? "dismiss" : null;
  if (restedActor === origin.actor.uuid || (actor.flags.spikependium.createdLongRest != null
    && actor.flags.spikependium.createdLongRest !== (origin.actor.flags.spikependium?.longRest ?? ""))) return "dismiss";
  return dead && actor.system.attributes.hp.value > 0 ? "kill" : null;
}

let checking = false;
let pending = false;
const rests = new Set();
export async function updateCompanions(actor, data = {}) {
  if (!game.user.isActiveGM) return;
  if (data["flags.spikependium.longRest"] || data.flags?.spikependium?.longRest) rests.add(actor.uuid);
  pending = true;
  if (checking) return;
  checking = true;
  try {
    do {
      pending = false;
      const completedRests = new Set(rests);
      rests.clear();
      for (const scene of game.scenes) {
        const dismiss = [];
        for (const token of scene.tokens) {
          if (token.actor?.flags.spikependium?.deathExplosion === "pending") await triggerCompanionDeath(token.actor, token, scene);
          const uuid = token.actor?.flags.dnd5e?.summon?.origin;
          const origin = uuid ? fromUuidSync(uuid) : null;
          if (origin && token.actor.flags.spikependium?.key?.startsWith("actor:vestige-") && pendingVestigeForm(origin)) continue;
          const end = companionEnd(token, fromUuidSync, completedRests.has(origin?.actor?.uuid) ? origin.actor.uuid : null);
          if (end === "dismiss" && token.actor.flags.spikependium?.key?.startsWith("actor:vestige-")) await endVestigeAura(origin.actor);
          if (end === "dismiss" && await dropVestigeGear(token)) dismiss.push(token.id);
          else if (end === "kill") await token.actor.update({ "system.attributes.hp.value": 0 });
        }
        if (dismiss.length) await scene.deleteEmbeddedDocuments("Token", dismiss);
      }
    } while (pending);
  } catch (error) {
    console.error("Spikependium: завершение призывов", error);
    ui.notifications.error("Не удалось завершить призыв спутника. Подробности в консоли.");
  } finally { checking = false; }
}

export async function recordCompanionRest(actor, result, config) {
  if (config.type !== "long") return;
  // Обновление владельца доставляет завершение отдыха Мастеру, даже если игрок отключил карточку отдыха.
  await actor.setFlag("spikependium", "longRest", foundry.utils.randomID());
}
import { defensiveCharmWaiting } from "./performer-defense.mjs";

