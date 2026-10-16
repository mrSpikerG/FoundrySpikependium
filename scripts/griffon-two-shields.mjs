import { attackSource, attackSignature } from "./attack-source.mjs";
import { attackHitTargets } from "./companions.mjs";
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const family = item => item?.flags?.spikependium?.griffonTwoShield;
const held = item => item?.system.equipped && (item.system.attunement !== "required" || item.system.attuned);
const effects = actor => actor?.appliedEffects ?? actor?.effects ?? [];
const source = (effect, actor) => effect.system.origin?.activity && fromUuidSync(effect.system.origin.activity, { relative: actor, strict: false });
const active = effect => effect?.active && !effect.duration?.expired;
const owns = (actor, id) => actor?.items?.some(i => family(i) === id && held(i));
const actorOf = config => config.subject?.actor ?? (config.subject?.documentName === "Actor" ? config.subject : undefined);
const actors = () => new Set([...(game.actors ?? []), ...[...(game.scenes ?? [])].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean));
const locks = new Set();
let cleaning = false;
export function shieldUnheldUse(activity) {
  const id = family(activity.item), f = activity.flags?.spikependium ?? {};
  return (id === "bramble" && f.brambleEnd) || (id === "storm-eye" && (f.stormAugury || f.stormRefill)) || (id === "pisces" && f.piscesWater);
}

export function canUseGriffonTwoShield(activity) {
  const root = activity.getLinkedActivity?.() ?? activity, item = root.item, actor = root.actor, flags = root.flags?.spikependium ?? {};
  if (effects(actor).some(e => active(e) && e.flags.spikependium?.griffonSkyglider)
    && [activity.item.system.identifier, activity.visibility?.identifier].includes("dash")) { ui.notifications.warn("С крыльями щита нельзя совершать Рывок."); return false; }
  if (family(item) === "bramble" && flags.brambleEnd && !item.flags.spikependium.brambleArea) return false;
  if (family(item) === "storm-eye" && flags.stormAugury && (item.system.equipped || item.system.container)) {
    ui.notifications.warn("Для Гадания положите щит плашмя на землю и выньте из контейнера."); return false;
  }
  if (family(item) === "pisces" && flags.piscesWater && item.flags.spikependium.piscesCooldown > game.time.worldTime) {
    ui.notifications.warn("Карпы не могут ожить до истечения 24 часов после применения."); return false;
  }
  if (family(item) === "spiritwalker" && !(actor.system.attributes.hp.value === 0)) {
    ui.notifications.warn("Отделение духа этой кирасой начинается при 0 хитах."); return false;
  }
  if (flags.arborDamage && !effects(actor).some(e => active(e) && e.flags.spikependium?.griffonArborWall && source(e, actor)?.item.uuid === item.uuid)) return false;
}
export function prepareGriffonShieldUpdates(activity, config, updates) {
  const root = activity.getLinkedActivity?.(config.cause?.activity) ?? activity, flags = root.flags?.spikependium ?? {};
  if (flags.stormRefill && family(root.item) === "storm-eye") {
    const augury = root.item.system.activities.find(a => a.flags.spikependium?.stormAugury);
    if (!augury || !(augury.uses.spent > 0)) return false;
    let update = updates.item.find(i => i._id === root.item.id); if (!update) updates.item.push(update = { _id: root.item.id });
    update[`system.activities.${augury.id}.uses.spent`] = 0;
    return updates;
  }
  if (!flags.griffonShieldPaid || !family(root.item)) return updates;
  const path = flags.shieldActivityResource ? `system.activities.${root.id}.uses.spent` : "system.uses.spent";
  const spent = flags.shieldActivityResource ? root.uses.spent : root.item.system.uses.spent;
  const itemUpdate = updates.item.find(i => i._id === root.item.id);
  const value = itemUpdate?.[path] ?? (flags.shieldActivityResource ? itemUpdate?.[`system.activities.${root.id}`]?.uses?.spent
    ?? (root === activity ? updates.activity?.["uses.spent"] ?? updates.activity?.uses?.spent : undefined) : undefined);
  if (value !== spent + 1) return false;
  return updates;
}
export function guardBrambleEquip(item, changes) {
  if (family(item) === "bramble" && item.flags.spikependium.brambleArea
    && (changes["system.equipped"] ?? changes.system?.equipped) === true
    && !("flags.spikependium.-=brambleArea" in changes)) {
    ui.notifications.warn("Щит сейчас является областью шипов; сначала окончите её."); return false;
  }
}
export async function finishGriffonShieldUse(activity, results) {
  if (!results?.message || !activity.actor?.isOwner) return;
  const item = activity.item, id = family(item), flags = activity.flags?.spikependium ?? {}, actor = activity.actor;
  if (id === "bramble" && flags.brambleGrow) {
    const delta = results.message.system.deltas?.item?.[item.id]?.find(d => /^flags\.spikependium\.griffonCooldowns\.[^.]+\.paid$/.test(d.keyPath) && d.delta === 1);
    const nonce = delta?.keyPath.split(".")[3], receipt = nonce && item.flags.spikependium.griffonCooldowns?.[nonce];
    if (receipt?.paid === 1 && receipt.until > game.time.worldTime) await item.update({ "system.equipped": false, "flags.spikependium.brambleArea": { nonce, until: receipt.until } });
  }
  if (id === "bramble" && flags.brambleEnd && item.flags.spikependium.brambleArea) {
    const { nonce } = item.flags.spikependium.brambleArea;
    await item.update({ "system.equipped": true, "flags.spikependium.-=brambleArea": null, [`flags.spikependium.griffonCooldowns.${nonce}.until`]: game.time.worldTime });
  }
  if (id === "pisces" && flags.piscesWater && !(item.flags.spikependium.piscesCooldown > game.time.worldTime))
    await item.update({ "system.uses.spent": 0, "flags.spikependium.piscesReady": game.time.worldTime + 86400 });
  if (id === "skyglider" && flags.skygliderEnd) {
    const ids = actor.effects.filter(e => e.flags.spikependium?.griffonSkyglider && source(e, actor)?.item.uuid === item.uuid).map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  }
}
export function finishSkygliderMovement(model) {
  const actor = model.parent;
  if (!effects(actor).some(e => active(e) && e.flags.spikependium?.griffonSkyglider && held(source(e, actor)?.item))) return;
  const movement = model.attributes.movement;
  movement.speeds.fly = Math.min(30, movement.speeds.fly);
  movement.max = Math.max(0, ...Object.keys(CONFIG.DND5E.movementTypes).map(t => movement.speeds[t] ?? 0));
}
export async function cleanGriffonTwoShields() {
  if (cleaning || (game.users.activeGM && !game.user.isActiveGM)) return;
  cleaning = true;
  try {
    for (const actor of actors()) {
      if (!actor.isOwner) continue;
      for (const item of actor.items) {
        const brambles = item.flags.spikependium?.brambleArea;
        if (family(item) === "bramble" && brambles && (!(item.flags.spikependium.griffonCooldowns?.[brambles.nonce]?.paid === 1) || brambles.until <= game.time.worldTime))
          await item.update({ "flags.spikependium.-=brambleArea": null });
        if (family(item) === "pisces" && item.flags.spikependium.piscesReady && item.flags.spikependium.piscesReady <= game.time.worldTime)
          await item.update({ "system.uses.spent": 1, "flags.spikependium.piscesReady": 0 });
      }
      for (const e of [...actor.effects]) if (e.flags.spikependium?.griffonArborWall) {
        const item = source(e, actor)?.item, concentration = resolve(e.system.origin?.effect);
        if (!held(item) && typeof actor.endConcentration === "function") {
          if (concentration?.parent === actor) await actor.endConcentration(concentration);
          else if (item) await actor.endConcentration(item);
        }
      }
      const ids = actor.effects.filter(e => {
        const flags = e.flags.spikependium ?? {};
        if (flags.griffonSkyglider || flags.griffonArborWall) return !held(source(e, actor)?.item);
        if (flags.griffonSpiritwalker) return !held(source(e, actor)?.item) || (actor.system.attributes.hp.value > 0 && !actor.statuses.has("unconscious"));
        if (flags.griffonJusticarPulse) {
          const start = e.start;
          if (!start?.combat) return game.time.worldTime >= (start?.time ?? Infinity) + 6;
          const combat = typeof start.combat === "object" ? start.combat : resolve(start.combat);
          return !combat?.started || start.round !== combat.round || start.turn !== combat.turn;
        }
        return false;
      }).map(e => e.id);
      if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
      await applyMonsterTamerDamage(actor);
    }
  } finally { cleaning = false; }
}
function feyBonus(config, eligible) {
  for (const r of config.rolls) {
    r.parts = (r.parts ?? []).filter(p => p !== "@spikependiumFeywatch"); if (r.data) delete r.data.spikependiumFeywatch;
    if (eligible && owns(config.subject, "feywatch")) { r.parts.push("@spikependiumFeywatch"); (r.data ??= {}).spikependiumFeywatch = 5; }
  }
}
export function prepareFeywatchSave(config, _dialog, message) {
  const activity = game.messages.get(message.data?.system?.origin)?.getAssociatedActivity();
  const profiles = activity?.applicableEffects ?? activity?.effects?.map(e => activity.item.effects.get(e._id)) ?? [];
  feyBonus(config, profiles.some(e => e?.statuses?.has("charmed")));
}
export function prepareFeywatchCheck(config, _dialog, message) {
  const activity = game.messages.get(message.data?.system?.origin)?.getAssociatedActivity();
  feyBonus(config, activity?.type === "check" && activity.item.type === "spell" && activity.item.system.school === "ill");
}
export function prepareShieldBane(config) {
  const actor = actorOf(config), curses = effects(actor).filter(e => active(e) && e.flags.spikependium?.griffonShieldBane);
  const first = config.rolls?.[0]; if (!first) return;
  first.parts = (first.parts ?? []).filter(p => p !== "@spikependiumShieldBane");
  first.options ??= {}; delete first.options.spikependiumShieldBane; if (first.data) delete first.data.spikependiumShieldBane;
  if (!actor?.isOwner || !curses.length) return;
  first.parts.push("@spikependiumShieldBane"); (first.data ??= {}).spikependiumShieldBane = "-1d4";
  first.options.spikependiumShieldBane = curses.map(e => e.uuid);
}
export function piscesTwentyData(roll) {
  if (!(roll instanceof CONFIG.Dice.D20Roll) || !roll._evaluated || !Number.isFinite(roll.total)) return;
  const data = foundry.utils.deepClone(roll.toJSON()), die = data.terms?.[0]; if (die?.faces !== 20) return;
  const selected = die.results.filter(r => r.active !== false && !r.discarded);
  if (selected.length !== 1 || selected[0].result !== 1) return;
  const counted = selected[0].count ?? 1;
  if (!Number.isFinite(counted) || counted < 1 || counted > 20 || (counted !== 1 && !die.modifiers?.some(m => /^min\d/.test(m)))) return;
  selected[0].result = 20; if (selected[0].count != null) selected[0].count = 20;
  data.total += 20 - counted; return data;
}
export async function shieldD20Evaluate(wrapped, rolls, config = {}, message = {}, ...args) {
  const actor = actorOf(config), curseIds = rolls[0]?.options.spikependiumShieldBane ?? [], lock = curseIds.length && `bane:${actor?.uuid}`;
  if (config.evaluate === false) return wrapped(rolls, config, message, ...args);
  if (lock && (locks.has(lock) || !actor?.isOwner || curseIds.some(id => !active(resolve(id))))) {
    rolls.splice(0); ui.notifications.warn("Проклятие уже использовано другим броском; повторите бросок."); return;
  }
  if (lock) locks.add(lock);
  try {
    const result = await wrapped(rolls, config, message, ...args);
    if (lock && rolls.some(r => r instanceof CONFIG.Dice.D20Roll && r._evaluated)) await actor.deleteEmbeddedDocuments("ActiveEffect", curseIds.map(id => resolve(id)?.id).filter(Boolean));
    if (!actor?.isOwner || !(config.hookNames ?? []).some(n => ["attack", "abilityCheck", "skill", "savingThrow", "deathSave", "initiative"].includes(n))) return result;
    for (let index = 0; index < rolls.length; index++) {
      let data = piscesTwentyData(rolls[index]); if (!data) continue;
      const item = actor.items.find(i => family(i) === "pisces" && held(i) && i.system.uses.value > 0 && i.flags.spikependium.piscesReady > game.time.worldTime && !(i.flags.spikependium.piscesCooldown > game.time.worldTime));
      if (!item || locks.has(item.uuid)) continue;
      locks.add(item.uuid);
      try {
        if (!await foundry.applications.api.DialogV2.confirm({ window: { title: "Щит Рыб" }, content: "<p>Карпы могут заменить выпавшую единицу на двадцатку. Применить свойство щита? После применения оно недоступно 24 часа.</p>" })) continue;
        data = piscesTwentyData(rolls[index]);
        if (!data || !actor.isOwner || actor.items.get(item.id) !== item || !held(item) || !(item.system.uses.value > 0) || !(item.flags.spikependium.piscesReady > game.time.worldTime)) continue;
        data.options ??= {}; data.options.spikependiumPisces = { item: item.uuid, original: 1 };
        const replacement = CONFIG.Dice.D20Roll.fromData(data);
        if (!(replacement instanceof CONFIG.Dice.D20Roll) || !replacement._evaluated || replacement.total !== data.total || replacement.d20?.total !== 20)
          throw Error("Не удалось восстановить изменённую к20; свойство щита не потрачено.");
        await item.update({ "system.uses.spent": 1, "flags.spikependium.piscesReady": 0, "flags.spikependium.piscesCooldown": game.time.worldTime + 86400 });
        rolls[index] = replacement;
      } finally { locks.delete(item.uuid); }
    }
    return result;
  } finally { if (lock) locks.delete(lock); }
}
export function recordMonsterTamerDamage(actor, amount, _updates, options) {
  const origin = attackSource(options.originatingMessage);
  const activity = origin?.getAssociatedActivity(), caster = activity?.actor;
  if (!(amount > 0) || !owns(actor, "monster-tamer") || !actor.isOwner || !origin || !["beast", "monstrosity"].includes(caster?.system.details.type?.value)
    || !["mwak", "msak"].includes(activity.getActionType?.(origin.system.mode)) || !attackHitTargets(origin).some(h => h.token.actor.uuid === actor.uuid)) return;
  _updates[`flags.spikependium.monsterTamerPending.${origin.id}`] = { attack: origin.uuid, signature: attackSignature(origin), defender: actor.uuid, caster: caster.uuid };
}
function tamerInfo(frame) {
  const origin = resolve(frame?.attack), defender = resolve(frame?.defender), caster = resolve(frame?.caster), activity = origin?.getAssociatedActivity();
  if (!origin || !defender || !caster || attackSignature(origin) !== frame.signature || activity?.actor.uuid !== caster.uuid
    || !["beast", "monstrosity"].includes(caster.system.details.type?.value) || !["mwak", "msak"].includes(activity.getActionType?.(origin.system.mode))
    || !attackHitTargets(origin).some(h => h.token.actor.uuid === defender.uuid)
    || JSON.stringify(defender.flags.spikependium?.monsterTamerPending?.[origin.id]) !== JSON.stringify(frame)) return;
  return { origin, defender, caster, path: `flags.spikependium.monsterTamerReturns.${origin.id}.${defender.id}`,
    done: caster.flags.spikependium?.monsterTamerReturns?.[origin.id]?.[defender.id] };
}
export function recordMonsterTamerReturn(actor, _amount, updates, options) {
  const card = options.originatingMessage, frame = card?.flags.spikependium?.monsterTamerReturn;
  if (!frame) return;
  const info = tamerInfo(frame), roll = card.rolls[0];
  if (!info || info.done || info.caster.uuid !== actor.uuid || card.type !== "damage" || (game.users.activeGM && (!game.user.isActiveGM || !card.author?.isGM))
    || card.rolls.length !== 1 || !(roll instanceof CONFIG.Dice.DamageRoll) || !roll._evaluated || roll.options.type !== "psychic" || !Number.isFinite(roll.total) || roll.total < 0) return false;
  updates[info.path] = true;
}
export async function applyMonsterTamerDamage(actor) {
  if (!actor.isOwner || !Object.keys(actor.flags.spikependium?.monsterTamerPending ?? {}).length || (game.users.activeGM && !game.user.isActiveGM) || locks.has(`tamer:${actor.uuid}`)) return;
  locks.add(`tamer:${actor.uuid}`);
  try {
    for (const frame of Object.values(actor.flags.spikependium?.monsterTamerPending ?? {})) {
      const info = tamerInfo(frame); if (!info || info.done || !info.caster.isOwner) continue;
      const matches = m => m.type === "damage" && (!game.users.activeGM || m.author?.isGM) && m.flags.spikependium?.monsterTamerReturn?.attack === frame.attack && m.flags.spikependium.monsterTamerReturn.defender === actor.uuid;
      let card = [...game.messages].find(matches);
      if (!card) {
        await CONFIG.Dice.DamageRoll.build({ hookNames: ["damage"], isCritical: false, rolls: [{ parts: ["1d4"], options: { type: "psychic" } }] }, { configure: false }, { create: true,
          rollMode: info.origin.blind || info.origin.whisper?.length ? "gm" : "public", data: { type: "damage", speaker: ChatMessage.getSpeaker({ actor }),
            flavor: "Щит укротителя монстров — ответный психический урон", system: { targets: [{ actor: info.caster.uuid }] },
            ...(info.origin.whisper?.length ? { whisper: [...info.origin.whisper], blind: info.origin.blind } : {}), flags: { spikependium: { monsterTamerReturn: frame } } } });
        card = [...game.messages].find(matches);
      }
      const roll = card?.rolls[0]; if (!roll || card.rolls.length !== 1 || !tamerInfo(frame) || roll.options.type !== "psychic" || !Number.isFinite(roll.total)) continue;
      await info.caster.applyDamage([{ type: "psychic", value: roll.total }], { originatingMessage: card });
    }
  } finally { locks.delete(`tamer:${actor.uuid}`); }
}
