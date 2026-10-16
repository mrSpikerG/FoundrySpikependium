import { attackHitTargets } from "./companions.mjs";
import { attackSignature } from "./attack-source.mjs";

const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const family = item => item?.flags?.spikependium?.griffonWeapon;
const physical = activity => activity?.type === "attack" && activity.attack?.type.classification === "weapon";
const working = new Set();
const values = () => [...game.messages];
const tokenId = token => token.id ?? token.uuid.split(".").at(-1);
const key = (kind, hit) => `${kind}:${hit.index}:${tokenId(hit.token)}`;
const requests = message => message.flags.spikependium?.weaponTriggers ?? {};
const saveCard = event => values().find(m => m.type === "save" && m.author?.isGM && m.flags.spikependium?.weaponHitSave?.event === event);
function currentAttackTurn(roll) {
  const c = roll?.options?.spikependiumWeaponContext;
  return Number.isFinite(c?.time) && (c.combat ? game.combat?.id === c.combat && game.combat.round === c.round && game.combat.turn === c.turn : c.time === game.time.worldTime);
}
export function naturalWeaponTwenty(roll) {
  const dice = roll?.dice?.filter(d => d.faces === 20) ?? [];
  const results = dice.length === 1 ? dice[0].results.filter(r => r.active !== false && !r.discarded) : [];
  return results.length === 1 && results[0].result === 20;
}
export function griffonHitFrame(message, hit, kind, source = message.getAssociatedActivity().item) {
  const context = message.rolls[hit.index]?.options?.spikependiumWeaponContext ?? null;
  return { kind, event: `${message.uuid}:${key(kind, hit)}`, attack: message.uuid, signature: attackSignature(message),
    index: hit.index, actor: hit.token.actor.uuid, token: hit.token.uuid, source: source.uuid,
    start: context?.start ?? ActiveEffect.implementation.getEffectStart(), time: context?.time ?? game.time.worldTime, context };
}
function hitMatches(frame) {
  const message = resolve(frame.attack), activity = message?.getAssociatedActivity();
  if (!message || message.system.targets.length !== 1 || attackSignature(message) !== frame.signature || !physical(activity)) return false;
  return activity.item.uuid === frame.source && attackHitTargets(message).some(hit => hit.index === frame.index && hit.token.uuid === frame.token && hit.token.actor.uuid === frame.actor);
}
export function griffonHitInfo(effect) {
  const frame = effect?.flags.spikependium?.weaponHit;
  if (!frame || resolve(effect.uuid) !== effect || !["acidlight", "purging-dagger"].includes(frame.kind) || !effect.active || effect.duration.expired
    || effect.parent?.uuid !== frame.actor || resolve(frame.token)?.actor?.uuid !== frame.actor) return;
  const message = resolve(frame.attack);
  if (!message || message.system.targets.length !== 1 || attackSignature(message) !== frame.signature || !attackHitTargets(message).some(hit => hit.index === frame.index && hit.token.uuid === frame.token)) return;
  if (frame.kind === "acidlight") {
    const ammo = message.system.ammunitionItem;
    if (ammo?.flags.spikependium?.griffonAmmo !== "acidlight" || ammo.uuid !== frame.source || game.time.worldTime >= frame.time + 60) return;
    if (message.flags.spikependium?.acidlightEffects?.[effect.parent.id] !== effect.uuid) return;
  } else {
    const source = resolve(frame.source), embedded = source?.flags.spikependium?.purgingEmbedded;
    if (!hitMatches(frame) || family(source) !== "purging-dagger" || embedded?.effect !== effect.uuid || embedded.event !== frame.event) return;
  }
  return { frame, message, actor: effect.parent, token: resolve(frame.token) };
}
function validRequest(frame) {
  if (!hitMatches(frame)) return false;
  const source = resolve(frame.source) ?? resolve(frame.attack)?.getAssociatedActivity()?.item;
  if (family(source) !== frame.kind) return false;
  if (["frozen-dagger", "basilisk-dagger", "purging-dagger"].includes(frame.kind)
    && !naturalWeaponTwenty(resolve(frame.attack).rolls[frame.index])) return false;
  if (frame.kind === "basilisk-dagger" && !["tiny", "sm", "med", "lg"].includes(resolve(frame.actor)?.system.traits.size)) return false;
  if (frame.kind === "purging-dagger" && (!resolve(frame.source) || resolve(frame.actor)?.system.details.type?.value !== "undead")) return false;
  if (frame.kind === "spiderbite") {
    if (frame.pair?.length !== 2 || frame.pair[0].source === frame.pair[1].source || !frame.context?.own) return false;
    const sides = [];
    for (const p of frame.pair) {
      const a = resolve(p.attack)?.getAssociatedActivity(), c = p.context;
      if (!hitMatches(p) || family(a?.item) !== "spiderbite" || a.actor.uuid !== source.actor.uuid || p.actor !== frame.actor || p.token !== frame.token
        || !c?.own || c.combat !== frame.context.combat || c.round !== frame.context.round || c.turn !== frame.context.turn) return false;
      sides.push(a.item.flags.spikependium.key.split("-").at(-1));
    }
    if (!sides.includes("left") || !sides.includes("right")) return false;
  }
  return true;
}
function effectWindow(frame, expiry) {
  const context = frame.context, combat = game.combat;
  if (!context?.combat) return frame.time === game.time.worldTime;
  if (!combat?.started || combat.id !== context.combat) return false;
  const actor = ["sourceStart", "sourceEnd"].includes(expiry) ? resolve(frame.attack)?.getAssociatedActor() : resolve(frame.actor);
  const turns = combat.turns.map((c, i) => c.actor?.uuid === actor?.uuid ? i : -1).filter(i => i >= 0);
  if (turns.length !== 1) return false;
  const boundaryRound = context.round + (turns[0] <= context.turn ? 1 : 0);
  return combat.round < boundaryRound || (combat.round === boundaryRound && (expiry.endsWith("Start") ? combat.turn < turns[0] : combat.turn <= turns[0]));
}
export { effectWindow as griffonEffectWindow };
async function profile(frame, source, predicate) {
  const actor = resolve(frame.actor), message = resolve(frame.attack), template = source.effects.find(predicate);
  if (!template || actor.effects.some(e => e.flags.spikependium?.weaponHit?.event === frame.event)) return;
  if (template.duration.expiry && !effectWindow(frame, template.duration.expiry)) return;
  const tray = new dnd5e.applications.components.EffectApplicationElement(); tray.chatMessage = message;
  const prepared = await tray._prepareEffectData(template, actor);
  prepared.data.start = frame.start;
  prepared.data.flags.spikependium = { ...prepared.data.flags.spikependium, weaponHit: frame };
  if (frame.kind === "frozen-dagger" && template.system.changes.some(c => c.key === "system.attributes.movement.multiplier")) {
    const existing = actor.effects.find(e => e.active && !e.duration.expired && e.flags.spikependium?.weaponFrozenSlow);
    prepared.data.flags.spikependium.weaponFrozenSlow = true;
    if (existing) { prepared.action = "update"; prepared.data._id = existing.id; }
  }
  await foundry.documents.modifyBatch([{ action: prepared.action, documentName: "ActiveEffect", parent: actor,
    ...(prepared.action === "create" ? { data: [prepared.data] } : { updates: [prepared.data] }) }]);
}
async function nativeSave(frame, dc, ability = "con") {
  let card = saveCard(frame.event);
  if (!card) {
    const origin = resolve(frame.attack), actor = resolve(frame.actor);
    await actor.rollSavingThrow({ ability, target: dc }, { configure: false }, {
      rollMode: origin.blind || origin.whisper?.length || resolve(frame.token)?.hidden ? "gm" : "public", data: {
        flavor: `${origin.getAssociatedItem().name} — ${ability === "wis" ? "Мудрость" : "Телосложение"} СЛ ${dc}`,
        system: { origin: origin.id }, flags: { spikependium: { weaponHitSave: { event: frame.event, signature: frame.signature, actor: frame.actor, dc, ability } } },
        ...(origin.whisper?.length ? { whisper: [...origin.whisper], blind: origin.blind } : {})
      }
    });
    card = saveCard(frame.event);
  }
  const roll = card?.rolls[0], receipt = card?.flags.spikependium.weaponHitSave;
  if (!card || receipt.signature !== frame.signature || receipt.actor !== frame.actor || receipt.dc !== dc || (receipt.ability ?? "con") !== ability
    || !(roll instanceof CONFIG.Dice.D20Roll) || !roll._evaluated || !Number.isFinite(roll.total) || roll.options.target !== dc) return;
  return card.system.forceSuccess || card.system.resisted || !roll.isFailure;
}
export { profile as applyGriffonHitProfile, nativeSave as nativeGriffonHitSave };
export async function weaponDamageCard(frame, formula, type, flag, request) {
  let card = values().find(m => m.type === "damage" && m.author?.isGM && m.flags.spikependium?.[flag]?.event === request.event);
  if (card) return card;
  const origin = resolve(frame.attack);
  // Отдельный периодический урон не получает бонусы обычной атаки или критическое удвоение.
  await CONFIG.Dice.DamageRoll.build({ hookNames: ["damage"], isCritical: false, rolls: [{ parts: [formula], options: { type, types: [type] } }] }, { configure: false }, {
    create: true, rollMode: origin.blind || origin.whisper?.length || resolve(frame.token)?.hidden ? "gm" : "public", data: {
      type: "damage", speaker: ChatMessage.getSpeaker({ actor: origin.getAssociatedActor() }), flavor: `${origin.getAssociatedItem()?.name ?? "Оружие"} — ${formula}`,
      ...(origin.whisper?.length ? { whisper: [...origin.whisper], blind: origin.blind } : {}),
      system: { origin: origin.id, targets: [{ actor: frame.actor, token: frame.token }] }, flags: { spikependium: { [flag]: request } }
    }
  });
  return values().find(m => m.type === "damage" && m.author?.isGM && m.flags.spikependium?.[flag]?.event === request.event);
}
async function finishRequest(message, id) {
  const frame = requests(message)[id], lock = frame?.event;
  if (!game.user.isActiveGM || !frame || frame.done || working.has(lock) || !validRequest(frame)) return;
  const actor = resolve(frame.actor), source = resolve(frame.source) ?? message.getAssociatedItem();
  if (!actor?.isOwner) return;
  working.add(lock);
  try {
    if (frame.kind === "purging-dagger") {
      if (source.flags.spikependium?.purgingEmbedded && source.flags.spikependium.purgingEmbedded.event !== frame.event) return;
      await profile(frame, source, e => e.flags.spikependium?.griffonPurgingEmbedded);
      const embedded = actor.effects.find(e => e.flags.spikependium?.weaponHit?.event === frame.event);
      if (!embedded) return;
      await source.setFlag("spikependium", "purgingEmbedded", { effect: embedded.uuid, event: frame.event, thrown: frame.thrown });
    } else {
      let success = frame.saveSuccess;
      if (success === undefined) {
        success = await nativeSave(frame, frame.kind === "frozen-dagger" ? 12 : frame.kind === "basilisk-dagger" ? 15 : 13);
        if (success === undefined || !validRequest(frame)) return;
        await message.setFlag("spikependium", `weaponTriggers.${id}.saveSuccess`, success);
      }
      const immune = actor.system.traits.ci?.value;
      if (frame.kind === "frozen-dagger" && !immune?.has("paralyzed")) await profile(frame, source,
        e => success ? e.duration.expiry === "targetEnd" && !e.statuses.size : e.statuses.has("paralyzed"));
      if (frame.kind === "basilisk-dagger" && !success && !immune?.has("restrained")) await profile(frame, source, e => e.statuses.has("restrained"));
      if (frame.kind === "spiderbite" && !success) {
        if (!immune?.has("poisoned")) await profile(frame, source, e => e.statuses.has("poisoned"));
        const card = await weaponDamageCard(frame, "2d4", "poison", "weaponBiteDamage", { event: frame.event, attack: frame.attack, id });
        if (!card || !validRequest(frame)) return;
        await actor.applyDamage([{ type: "poison", value: card.rolls[0].total }], { originatingMessage: card });
        if (!actor.flags.spikependium?.weaponBites?.[message.id]?.[id]) return;
      }
    }
    await message.setFlag("spikependium", `weaponTriggers.${id}.done`, true);
  } finally { working.delete(lock); }
}
export function recordWeaponBiteDamage(actor, _amount, updates, options) {
  const card = options.originatingMessage, receipt = card?.flags.spikependium?.weaponBiteDamage;
  if (!receipt) return;
  const origin = resolve(receipt.attack), frame = origin && requests(origin)[receipt.id], roll = card.rolls[0];
  if (!game.user.isActiveGM || !card.author?.isGM || card.type !== "damage" || !frame || frame.kind !== "spiderbite"
    || frame.event !== receipt.event || frame.actor !== actor.uuid || !validRequest(frame) || frame.saveSuccess !== false
    || actor.flags.spikependium?.weaponBites?.[origin.id]?.[receipt.id] || card.system.origin !== origin.id
    || card.rolls.length !== 1 || !(roll instanceof CONFIG.Dice.DamageRoll) || !roll._evaluated || !Number.isFinite(roll.total) || roll.total < 0 || roll.options.type !== "poison") return false;
  updates[`flags.spikependium.weaponBites.${origin.id}.${receipt.id}`] = true;
}
async function spiderPairs(message) {
  const activity = message.getAssociatedActivity(), context = message.rolls[0]?.options?.spikependiumWeaponContext;
  const combat = game.combat, lock = `pairs:${activity.actor.uuid}`;
  if (!context?.own || combat?.id !== context.combat || combat.round !== context.round || combat.turn !== context.turn
    || combat.combatant?.actor?.uuid !== activity.actor.uuid || working.has(lock)) return;
  working.add(lock);
  try {
    const used = new Set(values().flatMap(m => Object.values(requests(m))).filter(r => r.kind === "spiderbite")
      .flatMap(r => r.pair?.map(p => `${p.attack}:${p.index}`) ?? []));
    const groups = new Map();
    for (const card of values().sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id))) {
      const a = card.type === "attack" && card.getAssociatedActivity();
      if (!physical(a) || family(a.item) !== "spiderbite" || a.actor.uuid !== activity.actor.uuid || card.system.targets.length !== 1) continue;
      for (const hit of attackHitTargets(card)) {
        const c = card.rolls[hit.index]?.options?.spikependiumWeaponContext;
        if (!c?.own || c.combat !== context.combat || c.round !== context.round || c.turn !== context.turn || used.has(`${card.uuid}:${hit.index}`)) continue;
        const side = a.item.flags.spikependium.key.endsWith("-left") ? "left" : a.item.flags.spikependium.key.endsWith("-right") ? "right" : null;
        if (!side) continue;
        let group = groups.get(hit.token.uuid); if (!group) groups.set(hit.token.uuid, group = { left: [], right: [] });
        group[side].push({ card, hit });
      }
    }
    for (const group of groups.values()) while (group.left.length && group.right.length) {
      const left = group.left.shift(), right = group.right.shift(), anchor = right.card.timestamp >= left.card.timestamp ? right : left;
      const id = `spider:${left.card.id}:${left.hit.index}:${right.card.id}:${right.hit.index}`;
      const frame = griffonHitFrame(anchor.card, anchor.hit, "spiderbite");
      frame.event = `${anchor.card.uuid}:${id}`; frame.pair = [griffonHitFrame(left.card, left.hit, "spiderbite"), griffonHitFrame(right.card, right.hit, "spiderbite")];
      await anchor.card.setFlag("spikependium", `weaponTriggers.${id}`, frame);
      await finishRequest(anchor.card, id);
    }
  } finally { working.delete(lock); }
}
export async function processGriffonWeaponHits(message) {
  if (!game.user.isActiveGM || message.type !== "attack") return;
  const activity = message.getAssociatedActivity(), id = family(activity?.item);
  if (!physical(activity) || !["frozen-dagger", "basilisk-dagger", "spiderbite", "purging-dagger"].includes(id)) return;
  if (id === "spiderbite") await spiderPairs(message);
  if (["frozen-dagger", "basilisk-dagger"].includes(id)) for (const hit of attackHitTargets(message)) {
    const context = message.rolls[hit.index]?.options?.spikependiumWeaponContext;
    if (!naturalWeaponTwenty(message.rolls[hit.index]) || !Number.isFinite(context?.time)) continue;
    const requestId = key(id, hit);
    const frame = griffonHitFrame(message, hit, id);
    if (!requests(message)[requestId] && effectWindow(frame, id === "basilisk-dagger" ? "sourceEnd" : "targetEnd"))
      await message.setFlag("spikependium", `weaponTriggers.${requestId}`, frame);
  }
  for (const id of Object.keys(requests(message))) await finishRequest(message, id);
}
export async function requestPurgingEmbed(message, index, token) {
  const activity = message.getAssociatedActivity(), hit = attackHitTargets(message).find(h => h.index === index && h.token.uuid === token);
  if ((!game.users.activeGM && !game.user.isActiveGM) || !currentAttackTurn(message.rolls[index]) || message.system.targets.length !== 1 || !activity?.actor.isOwner || family(activity.item) !== "purging-dagger" || !physical(activity) || !hit
    || !naturalWeaponTwenty(message.rolls[index]) || hit.token.actor.system.details.type?.value !== "undead" || activity.item.flags.spikependium?.purgingEmbedded) return;
  const id = key("purging-dagger", hit); if (requests(message)[id]) return;
  const frame = griffonHitFrame(message, hit, "purging-dagger"); frame.thrown = message.rolls[index].options.attackMode?.startsWith("thrown") ?? false;
  await message.setFlag("spikependium", `weaponTriggers.${id}`, frame);
  await processGriffonWeaponHits(message);
}
export function griffonPurgingButtons(message, html) {
  if ((!game.users.activeGM && !game.user.isActiveGM) || message.type !== "attack" || !message.isContentVisible || family(message.getAssociatedItem()) !== "purging-dagger" || !message.getAssociatedActor()?.isOwner || message.getAssociatedItem().flags.spikependium?.purgingEmbedded) return;
  const root = html instanceof HTMLElement ? html : html[0]; if (!root || root.querySelector(".spikependium-purging")) return;
  for (const hit of attackHitTargets(message)) {
    if (!currentAttackTurn(message.rolls[hit.index]) || !naturalWeaponTwenty(message.rolls[hit.index]) || hit.token.actor.system.details.type?.value !== "undead" || requests(message)[key("purging-dagger", hit)]) continue;
    const button = document.createElement("button"); button.type = "button"; button.className = "spikependium-purging"; button.textContent = "Оставить клинок в цели";
    button.addEventListener("click", () => requestPurgingEmbed(message, hit.index, hit.token.uuid).catch(error => console.error("Spikependium: вонзание кинжала", error)));
    root.append(button);
  }
}
export async function resumeGriffonWeaponHits() {
  if (!game.user.isActiveGM) return;
  for (const message of values()) if (Object.values(requests(message)).some(r => !r.done)) await processGriffonWeaponHits(message);
}
