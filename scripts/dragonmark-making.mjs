const KEY = "feat:greater-making", MOD = "XmyjP2cH9CkBmdgy";
const prepared = new WeakMap(), enchanting = new Set(), attacking = new Set();
let refreshing = false, pendingRefresh = false;
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const actors = () => [...new Map([...game.actors, ...[...game.scenes].flatMap(s => [...s.tokens].map(t => t.actor))]
  .filter(Boolean).map(a => [a.uuid, a])).values()];
const items = () => [...(game.items ?? []), ...actors().flatMap(a => [...a.items])];
const isSpell = a => a?.item?.type === "spell" && a.item.system.identifier === "magic-weapon"
  && !a.item.flags.spikependium?.storedSpell && a.type === "enchant";
const turn = () => game.combat?.started ? `${game.combat.uuid}:${game.combat.round}:${game.combat.turn}` : null;
const feature = a => a?.items.find(i => i.flags.spikependium?.key === KEY);
const resource = a => feature(a)?.system.activities.get(MOD);
const usable = e => !e.disabled && !e.duration.expired && !(Number.isFinite(e.duration.remaining) && e.duration.remaining <= 0);
const marked = e => e?.flags.spikependium?.magicWeapon;
const allocation = e => e?.flags.spikependium?.makingAllocation;
const currentCast = r => !!r?.id && resolve(r.caster)?.flags.spikependium?.makingGeneration === r.id;

export function canUseMakingModifier(activity) {
  if (activity?.id !== MOD || activity.item.flags.spikependium?.key !== KEY) return true;
  ui.notifications.warn("Улучшенное создание выбирается при накладывании Магического оружия.");
  return false;
}
export function prepareMakingDialog(activity, config, dialog) {
  if (!isSpell(activity) || !(resource(activity.actor)?.uses.value > 0)) return;
  config.spikependium = { ...config.spikependium, usageChoice: true };
  const Base = dialog.applicationClass;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      context.fields.push({ name: "spikependium.improvedMaking", value: this.config.spikependium?.improvedMaking ?? false,
        field: new foundry.data.fields.BooleanField({ label: "Улучшенное создание",
          hint: "Расходуется применение метки. При первой атаке этим оружием в свой ход можно перенести его бонус в КД до начала следующего хода." }),
        input: context.inputs.createCheckboxInput });
      context.hasConsumption = true;
      return context;
    }
  };
}
export function prepareMakingUpdates(activity, config, updates) {
  prepared.delete(activity);
  const improved = config.spikependium?.improvedMaking === true;
  if (!isSpell(activity)) return improved ? false : updates;
  const feat = feature(activity.actor), uses = resource(activity.actor), duration = activity.duration?.getEffectData();
  if (!activity.actor.isOwner || !Number.isFinite(duration?.value) || duration.value <= 0 || (improved && !(uses?.uses.value > 0))) {
    if (improved) ui.notifications.warn("Улучшенное создание недоступно: проверьте заклинание, длительность и применение метки.");
    return improved ? false : updates;
  }
  const id = foundry.utils.randomID(), data = { id, caster: activity.actor.uuid, spell: activity.item.uuid, activity: activity.id,
    improved, feat: improved ? feat.id : null, seconds: duration.convertTime({ to: "seconds" }).value,
    start: CONFIG.ActiveEffect.documentClass.getEffectStart() };
  if (!Number.isFinite(data.seconds) || data.seconds <= 0) return false;
  let spent;
  if (improved) {
    spent = uses.uses.spent + 1;
    let update = updates.item.find(u => u._id === feat.id);
    if (!update) { update = { _id: feat.id }; updates.item.push(update); }
    update[`system.activities.${MOD}.uses.spent`] = spent;
  }
  updates.actor["flags.spikependium.makingGeneration"] = id;
  updates.actor[`flags.spikependium.makingCasts.${id}`] = data;
  prepared.set(activity, { data, spent });
  return updates;
}
export function recordMakingCast(activity, message) {
  const saved = prepared.get(activity);
  if (!saved) return;
  prepared.delete(activity);
  const actual = activity.actor.flags.spikependium?.makingCasts?.[saved.data.id];
  if (!currentCast(saved.data) || JSON.stringify(actual) !== JSON.stringify(saved.data)
    || (saved.data.improved && (feature(activity.actor)?.id !== saved.data.feat || resource(activity.actor)?.uses.spent !== saved.spent))) return;
  foundry.utils.setProperty(message, "data.flags.spikependium.makingCast", { id: saved.data.id, caster: activity.actor.uuid });
  if (saved.data.improved) (message.data.system.properties ??= []).push({ type: "text", text: "Улучшенное создание" });
}
function paidCast(activity, message) {
  const ticket = message?.flags.spikependium?.makingCast, data = resolve(ticket?.caster)?.flags.spikependium?.makingCasts?.[ticket?.id];
  if (!isSpell(activity) || message?.type !== "usage" || !message.author || !/^[A-Za-z0-9]{16}$/.test(ticket?.id ?? "")
    || data?.id !== ticket.id || data.caster !== activity.actor.uuid || data.spell !== activity.item.uuid || data.activity !== activity.id
    || !currentCast(data) || !activity.actor.testUserPermission(message.author, "OWNER")
    || !Number.isFinite(data.start?.time) || data.start.time + data.seconds <= game.time.worldTime
    || (data.improved && !message.system.deltas?.item?.[data.feat]?.some(d => d.keyPath === `system.activities.${MOD}.uses.spent` && d.delta === 1))) return;
  return data;
}
export async function applyMakingEnchantment(wrapped, profile, item, options = {}) {
  if (!isSpell(this) || !options.chatMessage?.flags.spikependium?.makingCast) return wrapped(profile, item, options);
  const data = paidCast(this, options.chatMessage), key = data && `${data.caster}:${data.id}`;
  if (!data || !this.actor.isOwner || enchanting.has(key) || this.actor.flags.spikependium?.makingTargets?.[data.id]
    || items().some(i => i.effects.some(e => marked(e)?.id === data.id && marked(e)?.caster === data.caster))) {
    ui.notifications.warn("Магическое оружие: накладывание уже применено, отменено или заменено новым. Повторная карточка не зачаровывает другое оружие.");
    return null;
  }
  if (this.canEnchant(item, { chatMessage: options.chatMessage })?.length) return wrapped(profile, item, options);
  enchanting.add(key);
  const event = foundry.utils.randomID(), path = `makingTargets.${data.id}`;
  try {
    await this.actor.setFlag("spikependium", path, { event, item: item.uuid, profile, state: "pending" });
    if (this.actor.flags.spikependium.makingTargets[data.id]?.event !== event || !paidCast(this, options.chatMessage)) return null;
    const effect = await wrapped(profile, item, options);
    await this.actor.setFlag("spikependium", path, effect ? { event, item: effect.parent.uuid, effect: effect.uuid, state: "done" } : null);
    return effect;
  } catch (error) {
    if (!item.inCompendium && !items().some(i => i.effects.some(e => marked(e)?.id === data.id && marked(e)?.caster === data.caster))
      && this.actor.flags.spikependium?.makingTargets?.[data.id]?.event === event) {
      try { await this.actor.setFlag("spikependium", path, null); }
      catch (cleanupError) { console.error("Spikependium: квитанция зачарования", cleanupError); }
    }
    console.error("Spikependium: Магическое оружие", error);
    ui.notifications.error("Не удалось закончить зачарование. Проверьте оружие и карточку; уже созданное зачарование повторно не выдаётся.");
    return null;
  }
  finally { enchanting.delete(key); }
}
export function prepareMakingEnchantment(item, data, { activity, chatMessage }) {
  if (!isSpell(activity) || !chatMessage?.flags.spikependium?.makingCast) return;
  const cast = paidCast(activity, chatMessage), changes = data.system.changes.filter(c => c.key === "system.magicalBonus");
  const bonus = Number(changes[0]?.value);
  if (!cast) return false;
  if (item.type !== "weapon" || data.type !== "enchantment" || changes.length !== 1
    || changes[0].type !== "upgrade" || ![1, 2, 3].includes(bonus)) return cast.improved ? false : undefined;
  data.flags ??= {}; data.flags.spikependium ??= {};
  data.flags.spikependium.magicWeapon = { id: cast.id, caster: cast.caster, improved: cast.improved, bonus };
  data.start = cast.start;
  data.duration = { value: cast.seconds, units: "seconds", expiry: null, expired: false };
}
export function makingSuppression(wrapped, ...args) {
  return (marked(this) && !currentCast(marked(this))) || wrapped(...args);
}
function allocationLive(effect) {
  const r = allocation(effect);
  if (!r || effect.parent.uuid !== r.caster || !usable(effect) || !currentCast(r)) return false;
  const combat = resolve(r.combat);
  if (combat?.started) {
    if (combat.combatant?.actor?.uuid === r.caster && `${combat.uuid}:${combat.round}:${combat.turn}` !== r.turn) return false;
    if (!combat.getCombatantsByActor(effect.parent).length && combat.round > r.round) return false;
  } else if (game.time.worldTime !== r.time) return false;
  return true;
}
function castingAllocation(cast) {
  return resolve(cast?.caster)?.effects.find(e => allocation(e)?.id === cast.id && allocationLive(e));
}
export function makingEffectChange(wrapped, model, change, ...args) {
  const cast = marked(change.effect);
  if (model?.documentName === "Item" && change.key === "system.magicalBonus" && cast?.improved && currentCast(cast)) {
    const preview = model.flags.spikependium?.makingPreview, selected = castingAllocation(cast);
    const amount = preview?.id === cast.id && preview.caster === cast.caster ? preview.amount : allocation(selected)?.amount ?? 0;
    if (Number.isInteger(amount) && amount >= 0 && amount <= cast.bonus) change = { ...change, value: String(cast.bonus - amount) };
  }
  return wrapped(model, change, ...args);
}
export function makingArmorState(actor) {
  return Object.fromEntries(actor.effects.filter(e => allocation(e)).map(e => {
    const rule = allocation(e), held = actor.items.some(i => i.type === "weapon" && i.system.equipped && i.system.quantity > 0
      && i.effects.some(enchantment => marked(enchantment)?.id === rule.id && marked(enchantment)?.caster === actor.uuid
        && enchantment.active && usable(enchantment)));
    return [rule.id, allocationLive(e) && held ? 1 : 0];
  }));
}
function weaponCast(activity) {
  if (activity?.type !== "attack" || activity.item?.type !== "weapon" || !activity.actor?.isOwner) return;
  const item = activity.actor.items.get(activity.item.id);
  if (!item || item.system.quantity <= 0) return;
  const effect = item.effects.find(e => marked(e)?.improved && marked(e)?.caster === activity.actor.uuid && currentCast(marked(e)) && e.active && usable(e));
  return effect ? { item, effect, cast: marked(effect) } : undefined;
}
function firstAttack(activity, confirmed = false) {
  const selected = weaponCast(activity);
  if (!selected) return;
  const stamp = turn(), previous = activity.actor.flags.spikependium?.makingAttacks?.[selected.cast.id];
  if (stamp ? game.combat.combatant?.actor?.uuid !== activity.actor.uuid || previous?.turn === stamp
    : !confirmed || (previous?.turn === null && previous.time === game.time.worldTime)) return;
  return selected;
}
function previewBonus(activity, selected, amount, options) {
  const item = selected.item.clone({ "flags.spikependium.makingPreview": { id: selected.cast.id, caster: selected.cast.caster, amount } }, { keepId: true });
  return item.system.activities.get(activity.id)?.getAttackData({ ability: options.ability, ammunition: options.ammunition, attackMode: options.attackMode }).data.weaponMagic ?? 0;
}
export function prepareMakingAttack(config, dialog) {
  const selected = weaponCast(config.subject);
  if (!selected || (game.combat?.started && !firstAttack(config.subject))) return;
  config.spikependium = { ...config.spikependium, making: config.spikependium?.making ?? "0", makingCast: selected.cast.id,
    makingTurn: turn(), makingTime: game.time.worldTime };
  const Base = dialog.applicationClass ?? CONFIG.Dice.D20Roll.DefaultConfigurationDialog;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConfigurationContext(context, options) {
      context = await super._prepareConfigurationContext(context, options);
      context.fields.push({ name: "spikependium.making", value: this.config.spikependium.making,
        field: new foundry.data.fields.StringField({ label: "Улучшенное создание — первая атака своего хода", required: true, blank: false,
          choices: { "0": "Не переносить бонус", ...Object.fromEntries(Array.from({ length: selected.cast.bonus }, (_, n) => [String(n + 1), `+${n + 1} к КД; −${n + 1} к бонусу оружия`])) } }) });
      if (!game.combat?.started) context.fields.push({ name: "spikependium.makingFirstTurn", value: this.config.spikependium?.makingFirstTurn ?? false,
        field: new foundry.data.fields.BooleanField({ label: "Вне боя: это первая атака этим оружием в мой ход",
          hint: "Начало следующего хода обозначается продвижением игрового времени или снятием эффекта. Повтор в тот же момент не переносит бонус снова." }),
        input: context.inputs.createCheckboxInput });
      return context;
    }
    _buildConfig(roll, formData, index) {
      roll = super._buildConfig(roll, formData, index);
      this.config.spikependium.making = formData?.get("spikependium.making") ?? this.config.spikependium.making;
      this.config.spikependium.makingFirstTurn = formData?.get("spikependium.makingFirstTurn") ?? this.config.spikependium.makingFirstTurn;
      buildMakingAttack(this.config, roll);
      return roll;
    }
  };
}
export function buildMakingAttack(config, roll) {
  if (!config.spikependium?.makingCast) return;
  const selected = weaponCast(config.subject), amount = Number(config.spikependium.making);
  if (!selected || selected.cast.id !== config.spikependium.makingCast || !Number.isInteger(amount) || amount < 0 || amount > selected.cast.bonus) return;
  if (roll.parts?.includes("@weaponMagic")) roll.data.weaponMagic = previewBonus(config.subject, selected, amount, roll.options);
  roll.options.spikependiumMaking = { id: selected.cast.id, amount,
    weaponMagic: roll.parts?.includes("@weaponMagic") ? roll.data.weaponMagic : null };
}
export function finalizeMakingAttack(rolls, config) {
  if (!config.spikependium?.makingCast) return;
  if (rolls.some(r => r.options.spikependiumMaking?.id !== config.spikependium.makingCast
    || r.options.spikependiumMaking.amount !== Number(config.spikependium.making))) return false;
}
export async function consumeMakingAttack(wrapped, rolls, config = {}, message = {}, ...args) {
  if (!rolls.length || config.evaluate === false || !config.spikependium?.makingCast) return wrapped(rolls, config, message, ...args);
  const amount = Number(config.spikependium.making), actor = config.subject.actor;
  if (!game.combat?.started && !config.spikependium.makingFirstTurn && amount === 0) return wrapped(rolls, config, message, ...args);
  const selected = firstAttack(config.subject, config.spikependium.makingFirstTurn === true);
  if (!selected || selected.cast.id !== config.spikependium.makingCast || config.spikependium.makingTurn !== turn()
    || (!turn() && config.spikependium.makingTime !== game.time.worldTime) || !Number.isInteger(amount) || amount < 0 || amount > selected.cast.bonus
    || rolls.some(r => r._evaluated || r.options.spikependiumMaking?.id !== selected.cast.id || r.options.spikependiumMaking.amount !== amount)
    || attacking.has(actor.uuid)) {
    rolls.splice(0); ui.notifications.warn("Улучшенное создание: первая атака, бонус оружия или ход изменились. Повторите окно атаки."); return;
  }
  attacking.add(actor.uuid);
  const event = foundry.utils.randomID(), previous = actor.flags.spikependium?.makingAttacks?.[selected.cast.id] ?? null;
  const record = { event, turn: turn(), time: game.time.worldTime }, path = `makingAttacks.${selected.cast.id}`;
  let effect;
  try {
    await actor.setFlag("spikependium", path, record);
    if (amount) {
      const flag = { id: selected.cast.id, caster: actor.uuid, amount, event, turn: record.turn, time: record.time,
        combat: game.combat?.started ? game.combat.uuid : null, round: game.combat?.started ? game.combat.round : null };
      [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{ _id: event, name: `Улучшенное создание: +${amount} к КД`, type: "base",
        img: selected.effect.img, transfer: false, disabled: false, duration: { value: null, units: "seconds", expiry: "targetStart", expired: false },
        system: { magical: true, origin: { activity: selected.effect.system.origin.activity }, changes: [{ key: "system.attributes.ac.bonus", value: String(amount),
          type: "add", phase: "base", conditions: JSON.stringify({ k: `spikependium.makingArmor.${selected.cast.id}`, v: 1 }) }] },
        flags: { spikependium: { makingAllocation: flag } } }], { keepId: true });
      if (!effect) throw Error("Не создан эффект перераспределения");
    }
    if (actor.flags.spikependium?.makingAttacks?.[selected.cast.id]?.event !== event || record.turn !== turn()
      || (!record.turn && record.time !== game.time.worldTime) || !weaponCast(config.subject)) throw Error("Условия атаки изменились до броска");
    for (const roll of rolls) {
      const expected = roll.options.spikependiumMaking.weaponMagic;
      if (expected !== null && (previewBonus(config.subject, selected, amount, roll.options) !== expected || roll.data.weaponMagic !== expected))
        throw Error("Бонус оружия изменился после построения формулы");
      roll.options.spikependiumMaking.event = event;
    }
    config.subject.item.reset();
    return await wrapped(rolls, config, message, ...args);
  } catch (error) {
    console.error("Spikependium: перераспределение Магического оружия", error);
    ui.notifications.error("Не удалось закончить перераспределение бонуса. Проверьте эффект КД и первую атаку перед повтором.");
    if (!rolls.some(r => r._evaluated)) rolls.splice(0);
  } finally {
    try {
      if (!rolls.some(r => r._evaluated)) {
        if (effect && actor.effects.get(effect.id) === effect) await effect.delete();
        if (actor.flags.spikependium?.makingAttacks?.[selected.cast.id]?.event === event) await actor.setFlag("spikependium", path, previous);
      }
    } finally { attacking.delete(actor.uuid); }
  }
}
export async function refreshMaking() {
  pendingRefresh = true;
  if (refreshing) return;
  refreshing = true;
  try {
    do {
      pendingRefresh = false;
      for (const actor of actors()) {
        const expired = actor.effects.filter(e => allocation(e) && !allocationLive(e) && !e.disabled);
        if (actor.isOwner && (!game.users.activeGM || game.user.isActiveGM) && expired.length) await actor.deleteEmbeddedDocuments("ActiveEffect", expired.map(e => e.id));
      }
      for (const item of items()) {
        const ids = item.effects.filter(e => marked(e) && !currentCast(marked(e))).map(e => e.id);
        if (item.isOwner && (!game.users.activeGM || game.user.isActiveGM) && ids.length) await item.deleteEmbeddedDocuments("ActiveEffect", ids);
        if (item.effects.some(e => marked(e))) { item.reset(); item.sheet?.render(false); }
      }
      for (const actor of actors()) if (actor.effects.some(e => allocation(e))) { actor.reset(); actor.sheet?.render(false); }
    } while (pendingRefresh);
  } finally { refreshing = false; }
}
