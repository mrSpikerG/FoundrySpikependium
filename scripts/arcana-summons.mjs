import { attackSource } from "./attack-source.mjs";
import { attackHitTargets } from "./companions.mjs";
import { incapacitated, tokensDistance } from "./effects.mjs";
import { monsterGrappleRule, monsterGrappleAvailable } from "./monster-actions.mjs";

const casts = new WeakMap(), applying = new Set(), grappleQueues = new Map();
const keys = new Set(["spell:au-summon-plant", "spell:au-summon-dinosaur"]);
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const supported = activity => activity?.type === "summon" && keys.has(activity.item.flags.spikependium?.key);
const summonDC = activity => {
  const data = activity.getRollData();
  return activity.flat?.save ?? data.abilities?.[activity.ability]?.dc ?? data.attributes?.spell?.dc;
};
export function arcanaSpiritDC(token) {
  const stored = token?.flags.spikependium?.arcanaSummon?.dc;
  if (Number.isFinite(stored) && stored > 0) return stored;
  const summon = token?.actor?.flags.dnd5e?.summon;
  const activity = summon?.origin && summon.activity && resolve(`${summon.origin}.Activity.${summon.activity}`);
  const current = activity?.getRollData ? summonDC(activity) : undefined;
  if (Number.isFinite(current) && current > 0) return current;
  const prof = token?.actor?.system.attributes.prof;
  return Number.isFinite(summon?.mod) && Number.isFinite(prof) ? 8 + prof + summon.mod : undefined;
}
const valid = (activity, receipt) => supported(activity) && receipt?.activity === activity.uuid && receipt.caster === activity.actor.uuid
  && receipt.item === activity.item.uuid && receipt.level === activity.item.system.level && Number.isFinite(receipt.end)
  && game.time.worldTime < receipt.end && resolve(receipt.concentration)?.active
  && resolve(receipt.concentration)?.flags.dnd5e?.activity?.uuid === activity.uuid;

export function recordArcanaSummonCast(activity, message) {
  if (!supported(activity) || !activity.actor.isOwner) return;
  const concentration = activity.actor.effects.get(message.data.system.concentration);
  if (!concentration?.active || concentration.flags.dnd5e?.activity?.uuid !== activity.uuid) return;
  const speaker = message.data.speaker;
  const receipt = { caster: activity.actor.uuid, activity: activity.uuid, item: activity.item.uuid, level: activity.item.system.level,
    concentration: concentration.uuid, dc: summonDC(activity), end: game.time.worldTime + 3600,
    casterToken: activity.actor.token?.uuid ?? (speaker?.scene && speaker.token ? `Scene.${speaker.scene}.Token.${speaker.token}` : null) };
  casts.set(activity, receipt);
  foundry.utils.setProperty(message, "data.flags.spikependium.arcanaSummon", receipt);
}

export async function arcanaSummonChatAction(wrapped, event, target, message) {
  if (!supported(this) || target.dataset.action !== "placeSummons") return wrapped(event, target, message);
  const previous = casts.get(this);
  casts.set(this, message.flags.spikependium?.arcanaSummon);
  try { return await wrapped(event, target, message); }
  finally { if (previous) casts.set(this, previous); else casts.delete(this); }
}

export function canPlaceArcanaSpirit(activity) {
  if (!supported(activity)) return true;
  const receipt = casts.get(activity);
  if (!valid(activity, receipt) || resolve(receipt.concentration)?.flags.spikependium?.arcanaSummonPlaced
    || [...game.scenes].some(scene => [...scene.tokens].some(token => token.flags.spikependium?.arcanaSummon?.concentration === receipt.concentration))) {
    ui.notifications.warn("Этот призыв уже размещён или его концентрация закончилась. Для нового духа сотворите заклинание снова."); return false;
  }
  return true;
}

export function prepareArcanaSpirit(activity, profile, config) {
  if (!supported(activity)) return;
  const receipt = casts.get(activity);
  if (!valid(activity, receipt)) return false;
  config.tokenUpdates["flags.spikependium.arcanaSummon"] = structuredClone(receipt);
}

export async function recordArcanaSpiritPlaced(activity, profile, tokens) {
  if (!supported(activity)) return;
  for (const token of tokens) {
    const receipt = token.flags.spikependium?.arcanaSummon, concentration = resolve(receipt?.concentration);
    if (valid(activity, receipt) && concentration?.isOwner && !concentration.flags.spikependium?.arcanaSummonPlaced)
      await concentration.setFlag("spikependium", "arcanaSummonPlaced", true);
  }
}

export function recordArcanaSpiritAttack(message) {
  const activity = message.getAssociatedActivity(), actor = activity?.actor;
  const spirit = /^actor:au-(plant|dinosaur)-/.test(actor?.flags.spikependium?.key ?? "")
    && ["au-spores", "au-dinosaur-bite", "au-dinosaur-gore"].includes(activity?.item.system.identifier);
  const hag = actor?.flags.spikependium?.key === "actor:mm25:archhag" && activity?.item.system.identifier === "archhag-spectral-claws";
  const assassin = actor?.flags.spikependium?.key === "actor:mm25:assassin" && activity?.item.system.identifier === "assassin-shortsword";
  if (message.type !== "attack" || (!spirit && !hag && !assassin && !monsterGrappleRule(activity))
    || !actor.testUserPermission(message.author ?? game.user, "OWNER")) return;
  const scene = message.getAssociatedToken()?.parent;
  message.updateSource({ "flags.spikependium.arcanaSpiritAttack": { source: actor.uuid, item: activity.item.uuid,
    start: ActiveEffect.implementation.getEffectStart(),
    poisoned: Object.fromEntries([...(scene ? scene.tokens : [])].filter(token => token.actor && message.system.targets.some(target => target.token === token.uuid))
      .map(token => [token.actor.uuid, token.actor.statuses.has("poisoned")])) } });
}

export function prepareArcanaSpiritDamage(config, dialog, message) {
  const activity = config.subject;
  if (activity?.item.system.identifier !== "au-spores" || activity.type !== "attack") return;
  const origin = attackSource({ flags: { spikependium: { attackSource: message.data?.flags?.spikependium?.attackSource } }, getAssociatedActivity: () => activity });
  const record = origin?.flags.spikependium?.arcanaSpiritAttack, targets = message.data?.system?.targets ?? [];
  for (const roll of config.rolls) { roll.parts = roll.parts.filter(part => part !== "@spikependiumSpores"); delete roll.data.spikependiumSpores; }
  if (!record || record.source !== activity.actor.uuid || record.item !== activity.item.uuid || !targets.length
    || !targets.every(target => record.poisoned[resolve(target.token)?.actor?.uuid] === true)) return;
  config.rolls[0].parts.push("@spikependiumSpores"); config.rolls[0].data.spikependiumSpores = "3d4";
}

export async function applyArcanaSpiritHits(message, chargeTargets = []) {
  const source = message?.getAssociatedToken?.(), activity = message?.getAssociatedActivity?.();
  if (!monsterGrappleRule(activity)?.limit || !source) return applySpiritHits(message, chargeTargets);
  const previous = grappleQueues.get(source.uuid) ?? Promise.resolve();
  const task = previous.catch(() => {}).then(() => applySpiritHits(message, chargeTargets));
  grappleQueues.set(source.uuid, task);
  try { return await task; }
  finally { if (grappleQueues.get(source.uuid) === task) grappleQueues.delete(source.uuid); }
}
async function applySpiritHits(message, chargeTargets) {
  const record = message?.flags.spikependium?.arcanaSpiritAttack;
  if (!record || message.type !== "attack" || (game.users.activeGM ? !game.user.isActiveGM : message.author?.id !== game.user.id)) return;
  const activity = message.getAssociatedActivity(), source = message.getAssociatedToken();
  if (activity?.actor?.uuid !== record.source || activity.item.uuid !== record.item || !source?.actor?.isOwner || source.actor.uuid !== record.source
    || incapacitated(source.actor) || source.actor.system.attributes.hp.value <= 0) return;
  const identifier = activity.item.system.identifier, sizes = ["tiny", "sm", "med", "lg", "huge", "grg"], grabRule = monsterGrappleRule(activity);
  const hag = activity.actor.flags.spikependium?.key === "actor:mm25:archhag" && identifier === "archhag-spectral-claws";
  const assassin = activity.actor.flags.spikependium?.key === "actor:mm25:assassin" && identifier === "assassin-shortsword";
  const grabs = identifier === "au-dinosaur-bite" || !!grabRule;
  if (!activity.actor.testUserPermission(message.author, "OWNER") || (!grabRule && !hag && !assassin
    && (!/^actor:au-(plant|dinosaur)-/.test(activity.actor.flags.spikependium?.key ?? "")
      || !["au-spores", "au-dinosaur-bite", "au-dinosaur-gore"].includes(identifier)))) return;
  for (const { token } of attackHitTargets(message)) {
    const actor = token.actor, key = actor.uuid.replaceAll(".", "_"), event = `${message.uuid}:${key}`;
    if (!actor.isOwner || message.flags.spikependium.arcanaSpiritApplied?.[key] || applying.has(event)) continue;
    const size = sizes.indexOf(actor.system.traits.size);
    const wasPoisoned = record.poisoned[actor.uuid] ?? actor.statuses.has("poisoned");
    const eligible = assassin ? true : identifier === "au-spores" ? wasPoisoned === false
      : grabs ? size >= 0 && size <= sizes.indexOf(grabRule?.maxSize ?? "lg")
        : hag ? size >= 0 && size <= 3
        : identifier === "au-dinosaur-gore" && size >= 0 && size <= 4 && (message.flags.spikependium.monsterDive?.targets.includes(token.uuid) || chargeTargets.includes(token.uuid));
    if ((identifier === "au-dinosaur-gore" || hag) && !eligible) continue;
    const status = assassin || identifier === "au-spores" ? "poisoned" : grabs ? "grappled" : "prone";
    const effect = activity.item.effects.find(effect => effect.statuses.has(status));
    if (!effect) continue;
    applying.add(event);
    try {
      const operations = [], ci = actor.system.traits.ci.value;
      if (eligible && (!grabs || monsterGrappleAvailable(activity, source, token))
        && !ci.has("ALL") && !ci.has(status)) {
        const tray = new dnd5e.applications.components.EffectApplicationElement(); tray.chatMessage = message.getOriginatingMessage();
        const { action, data } = await tray._prepareEffectData(effect, actor);
        data.statuses = data.statuses.filter(status => !ci.has(status));
        if (identifier === "au-spores" || assassin) data.start = record.start;
        if (grabs) {
          data.flags.spikependium ??= {}; data.flags.spikependium.arcanaSpiritGrab = { source: source.uuid, target: token.uuid,
            dc: grabRule?.dc ?? arcanaSpiritDC(source), ...(grabRule ? { reach: grabRule.reach } : {}) };
        }
        operations.push({ action, documentName: "ActiveEffect", parent: actor, ...(action === "create" ? { data: [data] } : { updates: [data] }) });
      }
      operations.push({ action: "update", documentName: "ChatMessage", updates: [{ _id: message.id, [`flags.spikependium.arcanaSpiritApplied.${key}`]: true,
        ...(identifier === "au-spores" && record.poisoned[actor.uuid] == null ? { "flags.spikependium.arcanaSpiritAttack.poisoned": { ...message.flags.spikependium.arcanaSpiritAttack.poisoned, [actor.uuid]: wasPoisoned } } : {}) }] });
      await foundry.documents.modifyBatch(operations);
    } finally { applying.delete(event); }
  }
}

export async function applyArcanaCharge(message) {
  if (message?.type !== "damage" || !message.rolls.some(roll => roll instanceof CONFIG.Dice.DamageRoll && roll._evaluated && roll.options.spikependiumCharge)
    || (game.users.activeGM ? !game.user.isActiveGM : message.author?.id !== game.user.id)) return;
  const activity = message.getAssociatedActivity(), attack = attackSource(message);
  if (!attack || activity?.item.system.identifier !== "au-dinosaur-gore" || activity.actor.flags.spikependium?.key !== "actor:au-dinosaur-triceratops"
    || !activity.actor.testUserPermission(message.author, "OWNER")) return;
  const targets = message.system.targets ?? [];
  const hits = attackHitTargets(attack).filter(({ token }) => targets.some(target => target.token === token.uuid && target.actor === token.actor.uuid)).map(hit => hit.token.uuid);
  await applyArcanaSpiritHits(attack, hits);
}

export function sortArcanaSpirits(wrapped, a, b) {
  const anchor = c => {
    const caster = resolve(c.flags.spikependium?.arcanaCasterCombatant);
    return caster?.parent === this && caster.initiative === c.initiative ? caster : c;
  };
  const first = anchor(a), second = anchor(b);
  if (first === a && second === b) return wrapped(a, b);
  if (first === second) {
    if (a === first) return -1;
    if (b === second) return 1;
    return wrapped(a, b);
  }
  return wrapped(first, second);
}

let checking = false, pending = false;
export async function updateArcanaSpirits() {
  if (game.users.activeGM && !game.user.isActiveGM) return;
  pending = true;
  if (checking) return;
  checking = true;
  try {
    do {
      pending = false;
      const seen = new Set();
      for (const scene of game.scenes) for (const token of [...scene.tokens]) {
        if (!game.user.isActiveGM) continue;
        const receipt = token.flags.spikependium?.arcanaSummon, actor = token.actor;
        if (!receipt || !/^actor:au-(plant|dinosaur)-/.test(actor?.flags.spikependium?.key ?? "")
          || actor.flags.dnd5e?.summon?.origin !== receipt.item) continue;
        const concentration = resolve(receipt.concentration);
        if (concentration?.isOwner && !concentration.flags.spikependium?.arcanaSummonPlaced)
          await concentration.setFlag("spikependium", "arcanaSummonPlaced", true);
        if (seen.has(receipt.concentration) || actor.system.attributes.hp.value <= 0 || actor.statuses.has("dead") || !concentration?.active || game.time.worldTime >= receipt.end) {
          await scene.deleteEmbeddedDocuments("Token", [token.id]); continue;
        }
        seen.add(receipt.concentration);
        const casterToken = resolve(receipt.casterToken);
        for (const combat of game.combats) {
          if (combat.scene?.id !== scene.id) continue;
          const casters = combat.combatants.filter(c => c.actor?.uuid === receipt.caster && (!casterToken || c.token?.uuid === casterToken.uuid));
          if (casters.length !== 1 || !Number.isFinite(casters[0].initiative)) continue;
          const caster = casters[0], own = combat.combatants.find(c => c.token?.uuid === token.uuid);
          if (own) {
            if (own.initiative !== caster.initiative || own.flags.spikependium?.arcanaCasterCombatant !== caster.uuid)
              await own.update({ initiative: caster.initiative, "flags.spikependium.arcanaCasterCombatant": caster.uuid });
          } else await combat.createEmbeddedDocuments("Combatant", [{ actorId: actor.id, tokenId: token.id, sceneId: scene.id,
            initiative: caster.initiative, flags: { spikependium: { arcanaCasterCombatant: caster.uuid } } }]);
        }
      }
      const actors = new Set([...game.actors, ...[...game.scenes].flatMap(scene => [...scene.tokens].map(token => token.actor))].filter(Boolean));
      for (const actor of actors) for (const effect of [...actor.effects]) {
        const grab = effect.flags.spikependium?.arcanaSpiritGrab;
        if (!grab || !actor.isOwner) continue;
        const source = resolve(grab.source), target = resolve(grab.target), distance = source && target ? tokensDistance(source, target) : null;
        if (!source?.actor || incapacitated(source.actor) || source.actor.system.attributes.hp.value <= 0 || !effect.statuses.has("grappled")
          || !target?.actor || target.actor.uuid !== actor.uuid || source.parent !== target.parent || (distance != null && distance > (grab.reach ?? 10))) await effect.delete();
      }
    } while (pending && (!game.users.activeGM || game.user.isActiveGM));
  } finally { checking = false; }
}
