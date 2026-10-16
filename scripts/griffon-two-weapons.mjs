import forms from "./data/griffon-two-weapon-forms.json" with { type: "json" };
import { attackSignature } from "./attack-source.mjs";
import { attackHitTargets } from "./companions.mjs";
import { hasGriffonClass } from "./griffon-rings.mjs";
import { canUseRiptide, prepareRiptideUpdates, finishRiptideUse } from "./griffon-riptide.mjs";

const kind = item => item?.flags?.spikependium?.griffonTwoWeapon;
const flags = item => item?.flags?.spikependium ?? {};
const canonical = item => item?.actor?.items?.get?.(item.id) ?? item;
const active = item => item?.system.equipped && (item.system.attunement !== "required" || item.system.attuned);
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const turn = () => game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : null;
const own = actor => !!game.combat?.started && game.combat.combatant?.actor?.uuid === actor?.uuid;
const same = frame => frame && (frame.turn ? frame.turn === turn() : frame.time === game.time.worldTime);
const snapshot = actor => ({ turn: turn(), own: own(actor), time: game.time.worldTime,
  combat: game.combat?.started ? game.combat.id : null, round: game.combat?.round, turnIndex: game.combat?.turn });
const locks = new Set(), ranges = new WeakMap();
let cleaning = false;
export const kineticString = item => [...(item?.effects ?? [])].some(e => e.active && !e.duration?.expired && e.flags?.spikependium?.kineticBowstring);
const kineticReady = item => kineticString(item) && active(item) && (!game.combat?.started || own(item.actor)) && !same(flags(item).kineticShot);
const warn = text => { ui.notifications.warn(text); return false; };
const pendingEruption = item => !!flags(item).eruptionReady && flags(item).eruptionReady.combat === game.combat?.id;
const sourceRoot = activity => activity.getLinkedActivity?.() ?? activity;
function priestRoot(activity) {
  return activity.actor?.items.find(i => kind(i) === "priest" && active(i));
}
export function canUseTwoWeapon(activity, config = {}) {
  if (activity.flags?.spikependium?.riptideWave) return canUseRiptide(activity, config);
  const root = sourceRoot(activity), item = canonical(root.item), f = root.flags?.spikependium ?? {};
  if (activity.item?.system.sourceItem === "weapon:griffon-gs2-priest" && (!priestRoot(activity) || kind(item) !== "priest"))
    return warn("Заклинание требует существующей булавы жреца и связи с её действием.");
  if (activity.item?.system.sourceItem === "weapon:griffon-gs2-eclipse" && kind(item) !== "eclipse")
    return warn("Клеймящая кара требует исходного копья затмения.");
  if (!kind(item)) return;
  if (f.gs2Charge && config.consume === false) return warn("Это действие требует расхода заряда.");
  if (kind(item) === "greatbow" && activity.actor.system.abilities.str.value < 13) return warn("Для этого лука нужна Сила 13.");
  if (activity.type === "attack" && kind(item) === "medzo" && flags(item).medzoJam) return warn("Арбалет заклинило до конца следующего вашего хода.");
  if (activity.type === "attack" && kind(item) === "eruptions" && pendingEruption(item)) return warn("Сначала разрешите извержение третьего хода.");
  if (f.gs2Erupt && !pendingEruption(item)) return warn("Извержение доступно в конце третьего хода тления.");
  if (f.wardancerBonus && (flags(item).wardancerGrip === "two" || !same(flags(item).wardancerAttack) || !own(activity.actor)))
    return warn("Сначала совершите одноручную рукопашную атаку копьём в действии Атака в свой ход.");
  if (f.greatbowSpearShot && game.combat?.started && (!own(activity.actor) || same(flags(item).greatbowShot))) return warn("Выстрел копьём доступен раз в свой ход.");
}
export function canEnchantKinetic(activity, item, errors) {
  if (!flags(activity.item).kineticBowstring && kind(activity.item) !== "kinetic") return;
  if (!["shortbow", "longbow", "lightcrossbow", "heavycrossbow", "handcrossbow"].includes(item.system.type?.baseItem))
    errors.push(new Error("Кинетическая тетива подходит только обычному луку или арбалету."));
}
export async function prepareTwoWeaponUpdates(activity, config, updates) {
  if (activity.flags?.spikependium?.riptideWave) return prepareRiptideUpdates(activity, config, updates);
  const root = activity.getLinkedActivity?.(config.cause?.activity) ?? activity, f = root.flags?.spikependium ?? {};
  if (!kind(root.item)) return updates;
  const item = activity.actor?.items.get(root.item.id);
  if (!item || item.uuid !== root.item.uuid || !item.actor?.isOwner || !item.system.equipped
    || (root.type !== "attack" && (!active(item) || !hasGriffonClass(item)))) return false;
  if (canUseTwoWeapon(root) === false) return false;
  if (f.gs2Charge) {
    if (!item.actor?.isOwner || updates.item.find(i => i._id === item.id)?.["system.uses.spent"] !== item.system.uses.spent + 1) return false;
    if (f.riptideStart && !updates.item.some(u => {
      const bolt = item.actor.items.get(u._id);
      return bolt?.type === "consumable" && bolt.system.type.value === "ammo" && bolt.system.type.subtype === "crossbowBolt"
        && u["system.quantity"] === bolt.system.quantity - 1;
    }) && !(updates.delete ?? []).some(id => {
      const bolt = item.actor.items.get(id);
      return bolt?.type === "consumable" && bolt.system.type.value === "ammo" && bolt.system.type.subtype === "crossbowBolt"
        && bolt.system.quantity === 1 && bolt.system.uses?.autoDestroy;
    })) return false;
  }
  return prepareRiptideUpdates(activity, config, updates);
}
export async function finishTwoWeaponUse(activity, results) {
  if (!results?.message || !activity.actor?.isOwner) return;
  await finishRiptideUse(activity, results);
  const root = sourceRoot(activity), item = canonical(root.item), f = root.flags?.spikependium ?? {};
  if (!kind(item)) return;
  if (f.priestForm) {
    const base = forms.find(r => r.system.type.baseItem === (item.system.type.baseItem === "mace" ? "quarterstaff" : "mace"));
    await item.update(Object.fromEntries(["type", "range", "damage", "mastery", "properties", "weight", "proficient", "ammunition"]
      .filter(k => base.system[k] !== undefined).map(k => [`system.${k}`, k === "properties" ? [...new Set([...base.system[k], "mgc"])] : structuredClone(base.system[k])])));
  }
  const change = {};
  if (f.pumpkinNight || f.pumpkinDay) change["flags.spikependium.pumpkinNight"] = !!f.pumpkinNight;
  if (f.firstLightOn || f.firstLightOff) change["flags.spikependium.firstLightOn"] = !!f.firstLightOn;
  if (f.eclipseMoonlight !== undefined) change["flags.spikependium.eclipseMoonlight"] = f.eclipseMoonlight;
  if (f.wardancerGrip) change["flags.spikependium.wardancerGrip"] = f.wardancerGrip;
  if (f.gs2Erupt) { change["flags.spikependium.-=eruptionReady"] = null; change["flags.spikependium.-=eruptionWarm"] = null; }
  if (Object.keys(change).length) await item.update(change);
  if (f.priestDestroy && activity.actor.items.get(item.id)) await item.delete();
}
export function prepareTwoWeaponModel(wrapped, ...args) {
  const prior = ranges.get(this);
  if (prior && this.range.value === prior.changed) this.range.value = prior.base;
  ranges.delete(this);
  const item = this.parent;
  if (kind(item) === "wardancer") {
    if (flags(item).wardancerGrip === "two") this.properties.delete("fin"); else this.properties.add("fin");
  }
  if (kind(item) === "first-light") this.damage.base.types = new Set([flags(item).firstLightOn ? "radiant" : "piercing"]);
  if (kineticReady(item)) {
    const base = Number(this.range.value);
    if (base > 0) { this.range.value = base * 2; ranges.set(this, { base, changed: base * 2 }); }
  }
  return wrapped(...args);
}
export function firstLightMovement(wrapped, ...args) {
  const actor = this.parent, c = game.combat, turns = c?.turns?.filter(t => t.actor?.uuid === actor?.uuid) ?? [];
  if (c?.started && c.round === 1 && turns.length === 1 && c.turns[0] === turns[0] && Number.isFinite(turns[0].initiative)
    && actor.items.some(i => kind(i) === "first-light" && active(i))) {
    const m = this.attributes.movement, bonus = m.bonus, added = dnd5e.utils.convertLength(15, "ft", m.units ?? "ft");
    m.bonus = `(${bonus || 0}) + ${added}`;
    try { return wrapped(...args); } finally { m.bonus = bonus; }
  }
  return wrapped(...args);
}
export function twoWeaponAttackConfig(wrapped, process, config, formData, ...args) {
  if (this.flags?.spikependium?.greatbowSpearShot) {
    if ((args[0] ?? 0) > 0) throw Error("Выстрел копьём — одна атака раз в свой ход.");
    process = { ...process, ammunition: false };
    if (formData) { const original = formData; formData = { get: key => key === "ammunition" ? false : original.get(key) }; }
  }
  const result = wrapped(process, config, formData, ...args), item = canonical(this.item), id = kind(item);
  if (!id && !kineticString(item)) return result;
  const state = snapshot(this.actor), c = game.combat;
  config.options.spikependiumTwoWeapon = { ...state, kinetic: (args[0] ?? 0) === 0 && kineticReady(item) && (!this.getActionType || this.getActionType(config.options.attackMode) === "rwak"), pumpkinNight: !!flags(item).pumpkinNight,
    eruption: id === "eruptions" && active(item) && !!c?.started && item.system.uses.value > 0 && !pendingEruption(item) };
  config.options.spikependiumWeaponContext = { combat: state.combat, round: state.round, turn: state.turnIndex, own: state.own,
    time: state.time, start: ActiveEffect.implementation.getEffectStart() };
  if (id === "wardancer" && flags(item).wardancerGrip !== "two" && config.options.attackMode === "twoHanded")
    throw Error("Сначала переключите копьё на хват двумя руками.");
  return result;
}
export async function twoWeaponAttack(wrapped, config = {}, ...args) {
  const item = canonical(this.item), id = kind(item), tracked = id || kineticString(item);
  if (!tracked) return wrapped(config, ...args);
  if (!this.actor?.isOwner || !item.system.equipped || canUseTwoWeapon(this) === false || locks.has(item.uuid)) return null;
  if (id === "wardancer" && flags(item).wardancerGrip !== "two" && config.attackMode === "twoHanded") return null;
  locks.add(item.uuid);
  try {
    let projectile;
    if (this.flags?.spikependium?.greatbowSpearShot) {
      const choices = this.actor.items.filter(i => i.type === "weapon" && ["spear", "javelin"].includes(i.system.type.baseItem) && i.system.quantity > 0);
      if (!choices.length) { warn("Нужно копьё или метательное копьё в инвентаре."); return null; }
      const selected = await foundry.applications.api.DialogV2.input({ window: { title: "Снаряд для великого лука" }, rejectClose: false,
        content: `<select name="projectile">${choices.map((i, n) => `<option value="${n}">${foundry.utils.escapeHTML(i.name)} (${i.system.quantity})</option>`).join("")}</select>`,
        ok: { label: "Выбрать" } });
      if (!selected || !choices[Number(selected.projectile)]) return null;
      projectile = choices[Number(selected.projectile)]; config = { ...config, ammunition: false };
      args[0] = { ...args[0], options: { ...args[0]?.options, ammunitionOptions: [] } };
      if (canUseTwoWeapon(this) === false || !item.system.equipped || this.actor.items.get(projectile.id) !== projectile || !(projectile.system.quantity > 0)) return null;
    }
    const before = snapshot(this.actor), rolls = await wrapped(config, ...args);
    if (!rolls?.length) return rolls;
    const roll = rolls[0], saved = roll.options?.spikependiumTwoWeapon, updates = {};
    if (saved?.kinetic) updates["flags.spikependium.kineticShot"] = before;
    if (id === "medzo" && rolls.some(r => r.dice?.filter(d => d.faces === 20).flatMap(d => d.results.filter(r => r.active !== false && !r.discarded)).some(r => r.result === 1)))
      updates["flags.spikependium.medzoJam"] = { ...before, ends: 0 };
    if (id === "wardancer" && !this.flags?.spikependium?.wardancerBonus && before.own && flags(item).wardancerGrip !== "two"
      && roll.options?.attackMode !== "twoHanded" && !roll.options?.attackMode?.includes("thrown")) updates["flags.spikependium.wardancerAttack"] = before;
    if (projectile) {
      if (this.actor.items.get(projectile.id) !== projectile || !(projectile.system.quantity > 0)) throw Error("Снаряд исчез во время броска; проверьте расход вручную.");
      await projectile.update({ "system.quantity": projectile.system.quantity - 1 });
      updates["flags.spikependium.greatbowShot"] = before;
    }
    if (Object.keys(updates).length) await item.update(updates);
    return rolls;
  } finally { locks.delete(item.uuid); }
}
export async function twoWeaponDamage(wrapped, config = {}, dialog = {}, message = {}) {
  const reference = message.data?.flags?.spikependium?.attackSource, origin = resolve(reference?.message);
  if (origin?.getAssociatedActivity()?.uuid === this.uuid && reference.signature === attackSignature(origin))
    config = { ...config, spikependiumTwoWeapon: origin.rolls[0]?.options?.spikependiumTwoWeapon };
  return wrapped(config, dialog, message);
}
export function twoWeaponDamagePart(wrapped, damage, config, rollData, index = 0, ...args) {
  const result = wrapped(damage, config, rollData, index, ...args);
  if (kind(this.item) === "medzo" && damage.base) {
    result.parts = result.parts.filter(p => p !== "@mod");
    result.options.critical = { ...result.options.critical, multiplier: 1, bonusDice: 0, bonusDamage: "", multiplyNumeric: false, powerfulCritical: false };
    result.options.spikependiumMedzoBase = true;
  }
  if (kind(this.item) === "wardancer" && this.flags?.spikependium?.wardancerBonus && damage.base)
    result.parts = result.parts.map(p => p.replace(/@mod\b/g, "min(0, @mod)"));
  return result;
}
export function twoWeaponDamageParts(wrapped, config = {}, ...args) {
  const parts = wrapped(config, ...args), state = config.spikependiumTwoWeapon;
  if (!parts.length || !state) return parts;
  const extra = (number, denomination, types) => {
    const part = parts[0].clone({ number, denomination, bonus: "", types, custom: { enabled: false } }); part.base = false; return part;
  };
  const result = [...parts];
  if (state.kinetic) {
    const base = parts.find(p => p.base);
    if (base?.denomination && base.number > 0) result.push(extra(1, base.denomination, [...base.types]));
  }
  if (kind(this.item) === "pumpkin" && state.pumpkinNight) result.push(extra(1, 4, ["fire"]));
  if (kind(this.item) === "eruptions" && state.eruption) result.push(extra(1, 6, ["fire"]));
  return result;
}
export async function recordEruptionHit(message) {
  if (!game.user.isActiveGM || message.type !== "attack") return;
  const activity = message.getAssociatedActivity(), item = canonical(activity?.item), state = message.rolls[0]?.options?.spikependiumTwoWeapon;
  if (kind(item) !== "eruptions" || !state?.eruption || !same(state) || !active(item) || flags(item).eruptionWarm || pendingEruption(item)
    || !attackHitTargets(message).length || item.system.uses.value <= 0) return;
  await item.setFlag("spikependium", "eruptionWarm", { ...state, ends: 0 });
}
export async function twoWeaponEndTurn(wrapped, combatant, ...args) {
  const result = await wrapped(combatant, ...args);
  if (!game.user.isActiveGM || !combatant?.actor || !Number.isInteger(this.previous?.round) || this.previous.round < 1) return result;
  const actor = combatant.actor, stamp = `${this.id}:${this.previous.round}:${this.previous.turn}:${combatant.id}`;
  for (const item of actor.items) {
    const jam = flags(item).medzoJam, warm = flags(item).eruptionWarm;
    if (jam?.combat === this.id && jam.last !== stamp) {
      const ends = jam.ends + 1;
      if (ends >= (jam.own ? 2 : 1)) await item.update({ "flags.spikependium.-=medzoJam": null });
      else await item.setFlag("spikependium", "medzoJam", { ...jam, ends, last: stamp });
    }
    if (warm?.combat !== this.id || warm.last === stamp || !active(item)) continue;
    const ends = warm.ends + 1;
    if (ends < 3) { await item.setFlag("spikependium", "eruptionWarm", { ...warm, ends, last: stamp }); continue; }
    await item.update({ "flags.spikependium.-=eruptionWarm": null, "flags.spikependium.eruptionReady": { combat: this.id } });
    const eruption = [...item.system.activities].find(a => a.flags?.spikependium?.gs2Erupt);
    if (eruption) await eruption.use();
  }
  return result;
}
export async function cleanTwoWeapons() {
  if (cleaning || (game.users.activeGM && !game.user.isActiveGM)) return; cleaning = true;
  try {
    const actors = new Map([...(game.actors ?? []), ...[...(game.scenes ?? [])].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean).map(a => [a.uuid, a]));
    for (const actor of actors.values()) if (actor.isOwner) for (const item of actor.items) {
      const update = {};
      for (const name of ["eruptionWarm", "eruptionReady", "medzoJam"]) if (flags(item)[name]
        && (!game.combat?.started || flags(item)[name].combat !== game.combat.id || (name.startsWith("eruption") && !active(item))))
        update[`flags.spikependium.-=${name}`] = null;
      if (Object.keys(update).length) await item.update(update);
    }
  } finally { cleaning = false; }
}
export function refreshTwoWeapons() {
  for (const actor of new Set([...(game.actors ?? []), ...[...(game.scenes ?? [])].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean)))
    if (actor.items.some(i => kind(i) === "first-light" || kineticString(i))) { actor.prepareData(); actor.render(false); }
}
