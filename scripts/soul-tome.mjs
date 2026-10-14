import { releaseSoulPrison } from "./soul-prison.mjs";

const working = new Set();
const applying = new Map();
const releasing = new Set();
const supported = item => item?.type === "equipment" && item.system.identifier === "arcanaloth-soul-tome"
  && item.actor?.flags.spikependium?.key === "actor:mm25:arcanaloth";
const state = item => item.flags.spikependium?.soulTome;
const allActors = () => new Map([...game.actors, ...[...game.scenes].flatMap(scene => [...scene.tokens].map(token => token.actor))]
  .filter(Boolean).map(actor => [actor.uuid, actor]));
const authority = actor => actor.isOwner && (game.users.activeGM ? game.user.isActiveGM
  : game.users.filter(user => user.active && actor.testUserPermission(user, "OWNER")).sort((a, b) => a.id.localeCompare(b.id))[0]?.id === game.user.id);

export function recordSoulTomeDestruction(item, changed) {
  if (!supported(item) || state(item)?.destroyed) return;
  const hp = foundry.utils.getProperty(foundry.utils.expandObject(changed), "system.hp.value");
  if (hp !== 0 || !(item.system.hp.value > 0)) return;
  changed["flags.spikependium.soulTome"] = { generation: foundry.utils.randomID(), destroyed: true, deathProcessed: false };
}
export async function finishSoulTomeDestruction(item) {
  const actor = item?.actor;
  if (!supported(item) || !authority(actor) || working.has(actor.uuid)) return;
  working.add(actor.uuid);
  let failed = false;
  try {
    // Старые копии без квитанции мигрируют только при уже нулевых ПЗ фолианта.
    if (item.system.hp.value === 0 && !state(item)?.destroyed) await item.update({ "flags.spikependium.soulTome": {
      generation: foundry.utils.randomID(), destroyed: true, deathProcessed: false } });
    const receipt = structuredClone(state(item));
    if (!receipt?.destroyed || receipt.deathProcessed) return;
    const dead = actor.statuses.has("dead") ? null : (await ActiveEffect.implementation.fromStatusEffect("dead")).toObject();
    if (!authority(actor) || actor.items.get(item.id) !== item || state(item)?.generation !== receipt.generation
      || !state(item).destroyed || state(item).deathProcessed) return;
    if (dead) { dead._id = foundry.utils.randomID(); dead.origin = item.uuid; }
    await actor.performBulkUpdate({ actor: { "system.attributes.hp.value": 0 },
      item: [{ _id: item.id, "system.hp.value": 0, "system.quantity": 0,
        "flags.spikependium.soulTome": { ...receipt, deathProcessed: true } }],
      operations: dead ? [{ action: "create", documentName: "ActiveEffect", parent: actor, data: [dead], keepId: true }] : [] });
  } catch (error) { failed = true; throw error; }
  finally {
    working.delete(actor.uuid);
    if (!failed && authority(actor)) for (const pending of actor.items)
      if (supported(pending) && state(pending)?.destroyed && !state(pending).deathProcessed) await finishSoulTomeDestruction(pending);
  }
}
export async function resumeSoulTomes() {
  for (const actor of allActors().values()) for (const item of actor.items)
    if (supported(item)) { await finishSoulTomeDestruction(item); await releaseSoulTomePrisons(item); }
}
export async function releaseSoulTomePrisons(item) {
  if (!supported(item)) return;
  for (const actor of allActors().values()) {
    if (!authority(actor)) continue;
    for (const effect of [...actor.effects]) {
      const prison = effect.flags?.spikependium?.soulPrison;
      if (prison?.tome !== item.uuid || releasing.has(effect.uuid)
        || (!state(item)?.destroyed && item.system.hp.value > 0 && prison.generation === (state(item)?.generation ?? "initial"))) continue;
      releasing.add(effect.uuid);
      try { await releaseSoulPrison(effect, "tome"); } finally { releasing.delete(effect.uuid); }
    }
  }
}
export async function soulTomeEndTurn(wrapped, combatant, ...args) {
  const result = await wrapped(combatant, ...args);
  if (!combatant || !Number.isInteger(this.previous?.round) || this.previous.round < 1) return result;
  const event = `${this.id}:${this.previous.round}:${this.previous.turn}:${combatant.id}`;
  const actors = new Map([...this.combatants].map(c => c.actor).filter(Boolean).map(actor => [actor.uuid, actor]));
  for (const actor of actors.values()) {
    if (applying.has(actor.uuid)) await applying.get(actor.uuid);
    if (!authority(actor)) continue;
    for (const item of actor.items) if (supported(item)) await finishSoulTomeDestruction(item);
    if (!authority(actor) || working.has(actor.uuid)) continue;
    working.add(actor.uuid);
    try {
      const updates = actor.items.filter(item => supported(item) && item.system.hp.value > 0 && item.system.quantity > 0
        && !state(item)?.destroyed && item.flags.spikependium?.soulTomeLastEnd !== event)
        .map(item => ({ _id: item.id, "system.hp.value": item.system.hp.max, "flags.spikependium.soulTomeLastEnd": event }));
      if (updates.length) await actor.performBulkUpdate({ item: updates });
    } finally {
      working.delete(actor.uuid);
      if (authority(actor)) for (const pending of actor.items)
        if (supported(pending) && state(pending)?.destroyed && !state(pending).deathProcessed) await finishSoulTomeDestruction(pending);
    }
  }
  return result;
}
export function prepareSoulTomeRest(actor, result, config) {
  if (!actor.isOwner || actor.flags.spikependium?.key !== "actor:mm25:arcanaloth" || !["short", "long"].includes(config.type)) return;
  if (applying.has(actor.uuid)) {
    ui.notifications.warn("Дождитесь применения урона к фолианту, затем повторите отдых."); return false;
  }
  const destroyed = actor.items.filter(item => supported(item) && (state(item)?.destroyed || item.system.hp.value === 0));
  if (destroyed.some(item => !state(item)?.destroyed || !state(item).deathProcessed)) {
    ui.notifications.warn("Сначала завершите последствия уничтожения фолианта; затем повторите отдых.");
    resumeSoulTomes().catch(soulTomeError);
    return false;
  }
  result.updateItems ??= [];
  for (const item of destroyed) {
    const update = result.updateItems.find(update => update._id === item.id) ?? { _id: item.id };
    if (!result.updateItems.includes(update)) result.updateItems.push(update);
    const cutoff = Math.max(item._stats?.modifiedTime ?? 0, ...[...game.messages].map(message => message._stats?.createdTime ?? 0));
    Object.assign(update, { "system.hp.value": item.system.hp.max, "system.quantity": 1, "system.equipped": true,
      "flags.spikependium.soulTome": { generation: foundry.utils.randomID(), destroyed: false, deathProcessed: false,
        damageCutoff: { time: cutoff, messages: [...game.messages].filter(message => message._stats?.createdTime === cutoff).map(message => message.id) } } });
  }
}
function damageCard(message) {
  return message?.type === "damage" && message.isContentVisible && game.messages.get(message.id) === message && message.rolls.length > 0
    && message.rolls.every(roll => roll instanceof CONFIG.Dice.DamageRoll && roll._evaluated && Number.isFinite(roll.total));
}
const damageSignature = message => JSON.stringify(message.rolls.map(roll => roll.toJSON()));
const generation = item => state(item)?.generation ?? "initial";
function damageable(item, message) {
  const cutoff = state(item)?.damageCutoff, time = message._stats?.createdTime;
  return supported(item) && authority(item.actor) && item.actor.items.get(item.id) === item && item.system.quantity > 0
    && item.system.hp.value > 0 && !state(item)?.destroyed && !item.flags.spikependium?.soulTomeDamage?.[message.id]
    && (!cutoff || time > cutoff.time || (time === cutoff.time && !cutoff.messages.includes(message.id)));
}
export async function applySoulTomeDamage(message, item, multiplier = 1, expected = {}) {
  const actor = item?.actor;
  if (!damageCard(message) || !damageable(item, message) || working.has(actor.uuid) || ![.25, .5, 1, 2].includes(multiplier)
    || (expected.generation && expected.generation !== generation(item))
    || (expected.signature && expected.signature !== damageSignature(message))) return false;
  const parts = dnd5e.dice.aggregateDamageRolls(message.rolls, { respectProperties: true }).map(roll => ({
    value: Math.max(0, roll.total), type: roll.options.type, properties: new Set(roll.options.properties ?? []) }));
  if (!parts.length || parts.some(part => !Number.isFinite(part.value)
    || (!(part.type in CONFIG.DND5E.damageTypes) && !(part.type in CONFIG.DND5E.healingTypes)))) return false;
  // Отдельный временный лист использует штатный расчёт урона объекта и не наследует устойчивости арканалота.
  const object = new CONFIG.Actor.documentClass({ name: item.name, type: "npc", system: {
    details: { type: { value: "custom", custom: "Магический объект" } },
    attributes: { hp: { value: item.system.hp.value, max: item.system.hp.max, dt: item.system.hp.dt ?? 0 } },
    traits: { di: { value: ["necrotic", "psychic", "poison"] } }
  } });
  const damage = object.calculateDamage(parts, { multiplier, only: "damage", originatingMessage: message });
  if (!damage || !Number.isFinite(damage.amount) || damage.amount < 0) return false;
  working.add(actor.uuid);
  let release; applying.set(actor.uuid, new Promise(resolve => { release = resolve; }));
  try {
    if (!damageCard(message) || !damageable(item, message)) return false;
    await item.update({ "system.hp.value": Math.max(0, item.system.hp.value - damage.amount),
      [`flags.spikependium.soulTomeDamage.${message.id}`]: true });
    return true;
  } finally {
    working.delete(actor.uuid);
    try { await finishSoulTomeDestruction(item); }
    finally { applying.delete(actor.uuid); release(); }
  }
}
export function renderSoulTomeDamage(message, html) {
  if (!damageCard(message) || html.querySelector(".spikependium-tome-damage")) return;
  if (![...allActors().values()].some(actor => actor.items.some(item => damageable(item, message)))) return;
  const button = document.createElement("button"); button.type = "button";
  button.classList.add("spikependium-tome-damage"); button.textContent = "Урон фолианту душ";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      if (!damageCard(message)) return;
      const signature = damageSignature(message);
      const candidates = [...allActors().values()].flatMap(actor => [...actor.items]).filter(item => damageable(item, message));
      const versions = new Map(candidates.map(item => [item.uuid, generation(item)]));
      if (!candidates.length) return;
      const escape = foundry.utils.escapeHTML;
      const selected = await foundry.applications.api.DialogV2.wait({ window: { title: "Урон фолианту душ" },
        content: "<p>Подтвердите попадание по фолианту (КБ 17) или допустимость воздействия на объект. Его иммунитеты будут учтены автоматически.</p>"
          + `<select name="tome" aria-label="Фолиант">${candidates.map(item => `<option value="${escape(item.uuid)}">${escape(item.actor.name)} — ${escape(item.name)} (${item.system.hp.value}/${item.system.hp.max} ПЗ)</option>`).join("")}</select>`
          + '<select name="multiplier" aria-label="Доля урона"><option value="1">Полный урон</option><option value="0.5">Половина</option><option value="0.25">Четверть</option><option value="2">Двойной урон</option></select>',
        buttons: [{ action: "apply", label: "Применить", callback: (event, button) => ({ uuid: button.form.elements.tome.value,
          multiplier: Number(button.form.elements.multiplier.value) }) }, { action: "cancel", label: "Отмена", callback: () => null }], close: () => null });
      const item = candidates.find(item => item.uuid === selected?.uuid);
      if (item) {
        if (await applySoulTomeDamage(message, item, selected.multiplier, { signature, generation: versions.get(item.uuid) }))
          ui.notifications.info(`${item.name}: ${item.system.hp.value}/${item.system.hp.max} ПЗ.`);
        else ui.notifications.warn("Карточка или фолиант изменились, либо этот урон уже применён. Проверьте текущее состояние.");
      }
    } catch (error) { soulTomeError(error); }
    finally { button.disabled = false; }
  });
  (html.querySelector(".card-buttons") ?? html.querySelector(".message-content") ?? html).append(button);
}
export function soulTomeError(error) {
  console.error("Spikependium: фолиант душ", error);
  ui.notifications.error("Не удалось завершить механику фолианта душ. Проверьте ПЗ фолианта и арканалота; подробности в консоли.");
}
