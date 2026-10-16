const mycelia = item => item?.flags?.spikependium?.griffonTwoArmor === "mycelia";
const worn = item => mycelia(item) && item.system.equipped && item.system.attuned;
const armor = actor => actor?.items?.find(worn);
const identity = item => item?.flags?.spikependium?.myceliaIdentity;
const read = (data, key) => Object.hasOwn(data, key) ? data[key] : key.split(".").reduce((v, k) => v?.[k], data);
const tempPath = "system.attributes.hp.temp", tagPath = "flags.spikependium.myceliaTHP", healPath = "flags.spikependium.myceliaHeal";
const calculated = new WeakMap();
const confirmations = new Set();
const dead = actor => actor.statuses?.has("dead");
const clone = item => item.actor?.flags?.dnd5e?.originalActor && item.flags.spikependium.myceliaState?.actor !== item.actor.uuid;
export function prepareMyceliaIdentity(item) {
  if (!mycelia(item) || !item.actor) return;
  if (!identity(item) || item.actor.items.some(i => i.id !== item.id && mycelia(i) && identity(i) === identity(item)))
    item.updateSource({ "flags.spikependium.myceliaIdentity": foundry.utils.randomID(), "flags.spikependium.myceliaState": null });
}
export function myceliaTempActive(actor) {
  const tag = actor.flags?.spikependium?.myceliaTHP;
  return !!tag?.identity && actor.system?.attributes?.hp?.temp > 0 && actor.items.some(i => worn(i) && identity(i) === tag.identity);
}
export function myceliaWithdrawalActive(actor) {
  const debts = Object.values(actor.flags?.spikependium?.myceliaDebts ?? {});
  return debts.some(d => Number.isFinite(d.until) && d.until > game.time.worldTime && !actor.items.some(i => mycelia(i) && i.system.attuned && identity(i) === d.identity));
}
export function guardMyceliaEquip(item, changes) {
  if (!mycelia(item) || !item.actor || clone(item)) return;
  const state = item.flags.spikependium.myceliaState;
  const bound = (state?.actor === item.actor.uuid && state.bound && !state.released) || (item.system.equipped && item.system.attuned && !state?.released);
  if (bound && !dead(item.actor) && read(changes, "system.equipped") === false) {
    ui.notifications.warn("Мицелиевый доспех нельзя снять до смерти или Снятия проклятия. После подтверждённой магии используйте кнопку освобождения."); return false;
  }
  if (read(changes, "system.attuned") === true && !item.system.attuned)
    changes["flags.spikependium.myceliaState"] = { actor: item.actor.uuid, attuned: true, cycle: foundry.utils.randomID(), bound: !!(read(changes, "system.equipped") ?? item.system.equipped), released: false };
  else if (!state && item.system.attuned) changes["flags.spikependium.myceliaState"] = { actor: item.actor.uuid, attuned: true, cycle: foundry.utils.randomID(), bound: !!item.system.equipped, released: false };
}
export function guardMyceliaDelete(item) {
  if (!mycelia(item) || !item.actor || clone(item)) return;
  const state = item.flags.spikependium.myceliaState;
  if (!dead(item.actor) && ((state?.bound && !state.released && state.actor === item.actor.uuid) || (item.system.equipped && item.system.attuned && !state?.released))) {
    ui.notifications.warn("Проклятый мицелиевый доспех сначала нужно освободить от привязки; удаление предмета её не обходит."); return false;
  }
}
export function recordMyceliaCalculation(actor, damages, options) {
  if (!armor(actor) && !actor.flags?.spikependium?.myceliaTHP) return;
  let map = calculated.get(options); if (!map) calculated.set(options, map = new Map()); map.set(actor.uuid, damages.temp);
}
function magical(origin) {
  const item = origin?.getAssociatedItem?.() ?? origin?.getAssociatedActivity?.()?.item;
  return item?.type === "spell" || item?.system.properties?.has?.("mgc") || origin?.rolls?.some(r => r.options?.properties?.includes?.("mgc") || r.options?.properties?.has?.("mgc"));
}
export function recordMyceliaDamage(actor, amount, updates, options) {
  const item = armor(actor), old = actor.flags?.spikependium?.myceliaTHP;
  if (!item && !old) return;
  const hp = actor.system.attributes.hp, remaining = hp.temp - (amount > 0 ? Math.min(hp.temp, amount) : 0);
  const incoming = calculated.get(options)?.get(actor.uuid) ?? 0; calculated.get(options)?.delete(actor.uuid);
  updates[tagPath] = old && remaining > 0 && !(incoming > remaining) ? { ...old, remaining } : null;
  const healed = updates["system.attributes.hp.value"] - hp.value;
  if (item && identity(item) && healed > 0) {
    const origin = options.originatingMessage?.getOriginatingMessage?.() ?? options.originatingMessage;
    updates[healPath] = { event: foundry.utils.randomID(), identity: identity(item), source: origin?.uuid ?? "", amount: healed,
      magical: !!magical(origin), pending: true, claimed: false };
  } else if (actor.flags?.spikependium?.myceliaHeal && !actor.flags.spikependium.myceliaHeal.claimed)
    updates[healPath] = { ...actor.flags.spikependium.myceliaHeal, claimed: true };
}
function grant(updates, frame, actor) {
  const amount = Math.min(15, Math.floor(frame.amount / 2)), current = Number(read(updates, tempPath) ?? actor.system.attributes.hp.temp);
  if (amount > 0 && amount >= current) {
    updates[tempPath] = amount; updates[tagPath] = { identity: frame.identity, event: frame.event, source: frame.source, remaining: amount };
  }
}
export function guardMyceliaHPUpdate(actor, changes) {
  const old = actor.flags?.spikependium?.myceliaTHP, frame = read(changes, healPath), value = read(changes, tempPath);
  if (old && value !== undefined && read(changes, tagPath) === undefined) {
    const current = actor.system.attributes.hp.temp;
    changes[tagPath] = value > 0 && value < current ? { ...old, remaining: value } : null;
  }
  const next = read(changes, tagPath);
  if (next && value !== undefined && next.remaining !== value) changes[tagPath] = null;
  if (frame?.pending && Number.isFinite(read(changes, "system.attributes.hp.value"))) {
    frame.amount = Math.max(0, read(changes, "system.attributes.hp.value") - actor.system.attributes.hp.value); frame.pending = false;
    const item = armor(actor);
    if (item && identity(item) === frame.identity && frame.magical) { grant(changes, frame, actor); frame.claimed = true; }
    changes[healPath] = frame;
  } else if (!frame && actor.flags?.spikependium?.myceliaHeal && !actor.flags.spikependium.myceliaHeal.claimed
    && (value !== undefined || read(changes, "system.attributes.hp.value") !== undefined)) changes[healPath] = { ...actor.flags.spikependium.myceliaHeal, claimed: true };
}
export function myceliaUnattunedUse(activity) { return mycelia(activity?.item) && activity.flags?.spikependium?.myceliaRelease; }
export async function finishMyceliaUse(activity, _config, results) {
  const item = activity.item, actor = activity.actor, flags = activity.flags?.spikependium ?? {};
  if (!results?.message || !actor?.isOwner || !mycelia(item)) return;
  if (confirmations.has(actor.uuid)) return;
  confirmations.add(actor.uuid);
  try {
  if (flags.myceliaRelease) {
    if (await foundry.applications.api.DialogV2.confirm({ window: { title: "Освобождение от мицелия" }, content: "<p>Снятие проклятия или аналогичная магия уже применены? Подтверждение разрешит снять этот доспех.</p>" }))
      await item.setFlag("spikependium", "myceliaState", { ...item.flags.spikependium.myceliaState, actor: actor.uuid, released: true });
  }
  if (flags.myceliaHealing && worn(item)) {
    const frame = foundry.utils.deepClone(actor.flags?.spikependium?.myceliaHeal);
    if (!frame || frame.claimed || frame.pending || !(frame.amount > 0) || frame.identity !== identity(item)) return;
    if (!await foundry.applications.api.DialogV2.confirm({ window: { title: "Мицелиевое лечение" }, content: `<p>Последнее зарегистрированное лечение восстановило ${frame.amount} хитов. Оно было магическим? Выдать до ${Math.min(15, Math.floor(frame.amount / 2))} временных хитов от мицелия?</p>` })) return;
    if (!worn(item) || JSON.stringify(actor.flags.spikependium.myceliaHeal) !== JSON.stringify(frame) || frame.claimed) return;
    const updates = { [healPath]: { ...frame, magical: true, claimed: true } }; grant(updates, frame, actor); await actor.update(updates);
  }
  } finally { confirmations.delete(actor.uuid); }
}
const allActors = () => new Map([...(game.actors ?? []), ...[...(game.scenes ?? [])].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean).map(a => [a.uuid, a]));
async function addWithdrawal(item, state) {
  const actor = item.actor, id = identity(item); if (!id || !state?.cycle || actor.flags.spikependium?.myceliaDebts?.[state.cycle]) return;
  const roll = await new CONFIG.Dice.BasicRoll("2d6+6").evaluate(), days = roll.total;
  if (!Number.isInteger(days) || days < 8 || days > 18) throw Error("Неверный срок отвыкания мицелия");
  await actor.update({ [`flags.spikependium.myceliaDebts.${state.cycle}`]: { identity: id, name: item.name, until: game.time.worldTime + days * 86400, days, roll: roll.toJSON() } });
}
export async function myceliaDeleted(item) {
  if (!mycelia(item) || !item.actor?.isOwner || clone(item) || (game.users.activeGM && !game.user.isActiveGM)) return;
  const state = item.flags.spikependium.myceliaState;
  if (item.system.attuned || state?.attuned) await addWithdrawal(item, state ?? { cycle: foundry.utils.randomID() });
  await syncMycelia();
}
let syncing = false;
export async function syncMycelia() {
  if (syncing || (game.users.activeGM && !game.user.isActiveGM)) return;
  syncing = true;
  try {
    for (const actor of allActors().values()) {
      if (!actor.isOwner) continue;
      for (const item of actor.items) {
        if (!mycelia(item) || clone(item)) continue;
        if (!identity(item)) await item.setFlag("spikependium", "myceliaIdentity", foundry.utils.randomID());
        const old = item.flags.spikependium.myceliaState, previous = old?.actor === actor.uuid ? old : null;
        const state = { ...previous, actor: actor.uuid, attuned: !!item.system.attuned };
        if (state.attuned && !previous?.attuned) Object.assign(state, { cycle: foundry.utils.randomID(), bound: false, released: false });
        if (state.attuned && item.system.equipped) state.bound = true;
        if (dead(actor)) state.released = true;
        if (previous?.attuned && !state.attuned) await addWithdrawal(item, previous);
        if (JSON.stringify(state) !== JSON.stringify(old)) await item.setFlag("spikependium", "myceliaState", state);
      }
      const updates = {};
      for (const [key, debt] of Object.entries(actor.flags.spikependium?.myceliaDebts ?? {}))
        if (debt.until <= game.time.worldTime || actor.items.some(i => mycelia(i) && i.system.attuned && identity(i) === debt.identity)) updates[`flags.spikependium.myceliaDebts.-=${key}`] = null;
      if (Object.keys(updates).length) await actor.update(updates);
      const existing = actor.effects.filter(e => e.flags.spikependium?.myceliaWithdrawal);
      const debts = Object.values(actor.flags.spikependium?.myceliaDebts ?? {}), until = Math.max(0, ...debts.map(d => d.until));
      const description = "Телосложение −2, минимум 1. Повторная настройка на тот же физический доспех отменяет его срок; другой доспех его не снимает. Повторные штрафы не складываются. Общий таймер действует до последнего оставшегося срока.<ul>" + debts.map(d => `<li>${String(d.name ?? "Мицелиевый доспех").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}: исходный срок ${d.days} дней.</li>`).join("") + "</ul>";
      if (myceliaWithdrawalActive(actor) && !existing.length) await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: "Мицелий: отвыкание", type: "base", img: "icons/magic/nature/mushroom-glow-blue.webp", transfer: false, disabled: false,
        system: { conditions: JSON.stringify({ k: "spikependium.myceliaWithdrawal", v: true }), changes: [{ _id: foundry.utils.randomID(), key: "system.abilities.con.value", value: "2 >=1", type: "subtract", phase: "initial", priority: null }] },
        duration: { value: until - game.time.worldTime, units: "seconds", expiry: null, expired: false }, start: ActiveEffect.implementation.getEffectStart(),
        flags: { spikependium: { myceliaWithdrawal: true, myceliaUntil: until } }, description
      }]);
      if (myceliaWithdrawalActive(actor) && existing.length && (existing[0].flags.spikependium.myceliaUntil !== until || existing[0].description !== description))
        await existing[0].update({ description, "duration.value": until - game.time.worldTime, start: ActiveEffect.implementation.getEffectStart(), "flags.spikependium.myceliaUntil": until, "duration.expired": false });
      if (!myceliaWithdrawalActive(actor) && existing.length) await actor.deleteEmbeddedDocuments("ActiveEffect", existing.map(e => e.id));
      else if (existing.length > 1) await actor.deleteEmbeddedDocuments("ActiveEffect", existing.slice(1).map(e => e.id));
    }
  } finally { syncing = false; }
}
