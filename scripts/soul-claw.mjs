import { attackSignature } from "./attack-source.mjs";
import { attackHitTargets } from "./companions.mjs";
import { syncMonsterEffects } from "./monster-effects.mjs";
import { chooseGuardian } from "./dragonmark-guardian.mjs";
import { chooseDefensiveCharm } from "./performer-defense.mjs";

const working = new Set(), active = new Map();
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const generation = item => item.flags.spikependium?.soulTome?.generation ?? "initial";
const controller = attack => game.users.activeGM ? game.user.isActiveGM
  : attack?.author?.id === game.user.id && attack.getAssociatedActivity()?.actor?.isOwner;
const claw = activity => activity?.type === "attack" && activity.actor?.flags.spikependium?.key === "actor:mm25:arcanaloth"
  && activity.item.system.identifier === "arcanaloth-banishing-claw";
function valid(attack) {
  const receipt = attack?.flags?.spikependium?.soulClawAttack, activity = attack?.getAssociatedActivity?.(), tome = resolve(receipt?.tome?.uuid);
  return attack?.type === "attack" && claw(activity) && activity.actor.uuid === receipt?.actor && activity.uuid === receipt.activity
    && attack.author && activity.actor.testUserPermission(attack.author, "OWNER") && receipt.signature === attackSignature(attack)
    && receipt.targets === JSON.stringify(attack.system.targets)
    && tome?.actor?.uuid === receipt.actor && tome.system.identifier === "arcanaloth-soul-tome" && tome.system.hp.value > 0
    && tome.system.quantity > 0 && !tome.flags.spikependium?.soulTome?.destroyed && generation(tome) === receipt.tome.generation;
}
export function recordSoulClawAttack(message) {
  const activity = message?.getAssociatedActivity?.();
  if (message.type !== "attack" || !claw(activity) || !activity.actor.testUserPermission(message.author ?? game.user, "OWNER")) return;
  const tome = activity.actor.items.find(item => item.system.identifier === "arcanaloth-soul-tome" && item.system.equipped
    && item.system.quantity > 0 && item.system.hp.value > 0 && !item.flags.spikependium?.soulTome?.destroyed);
  if (!tome) return;
  message.updateSource({ "flags.spikependium.soulClawAttack": { actor: activity.actor.uuid, activity: activity.uuid,
    source: message.getAssociatedToken()?.uuid, signature: attackSignature(message), targets: JSON.stringify(message.system.targets),
    tome: { uuid: tome.uuid, generation: generation(tome) } } });
}
export function automaticSoulClawTargets(activity, config) {
  const entry = active.get(config?.spikependium?.soulClawEvent);
  return entry?.activity === activity?.uuid && entry.source?.actor?.uuid === activity.actor.uuid && valid(entry.attack) ? entry : undefined;
}
function saveCard(origin, target, dc) {
  return origin.getAssociatedRolls("save").filter(card => card.system.ability === "cha"
    && !card.flags?.spikependium?.soulPrisonRepeat
    && card.getAssociatedActor()?.uuid === target.actor.uuid && card.getAssociatedToken()?.uuid === target.uuid
    && card.rolls[0] instanceof CONFIG.Dice.D20Roll && card.rolls[0]._evaluated && card.rolls[0].options.target === dc
    && card.author && (card.author.isGM || target.actor.testUserPermission(card.author, "OWNER"))).at(-1);
}
export async function syncSoulClawAttack(attack) {
  if (!controller(attack) || !valid(attack) || working.has(attack.uuid)) return;
  const receipt = attack.flags.spikependium.soulClawAttack, source = resolve(receipt.source), weapon = attack.getAssociatedActivity().item;
  const activity = [...weapon.system.activities].find(a => a.flags.spikependium?.monsterAction === "arcanaloth-banishing");
  if (!activity || !source?.actor?.isOwner || source.actor.uuid !== receipt.actor || !Number.isFinite(activity.save.dc.value)) return;
  working.add(attack.uuid);
  try {
    await chooseGuardian(attack);
    await chooseDefensiveCharm(attack);
    if (!controller(attack) || !valid(attack)) return;
    for (const hit of attackHitTargets(attack)) {
      const target = hit.token;
      if (!target.actor.isOwner || !target.actor.system.isCreature || target.actor.statuses.has("dead")) continue;
      const key = `${hit.index}_${target.uuid.replaceAll(".", "_")}`, event = `${attack.uuid}:${key}`;
      const read = () => attack.flags.spikependium?.soulClawCasts?.[key];
      const write = value => attack.setFlag("spikependium", `soulClawCasts.${key}`, value);
      if (read()?.state === "done") continue;
      if (!read()) await write({ state: "pending", target: target.uuid, actor: target.actor.uuid, dc: activity.save.dc.value });
      if (!controller(attack) || !valid(attack) || read().target !== target.uuid || read().actor !== target.actor.uuid) return;
      let origin = game.messages.find(message => message.type === "usage" && (message.author?.isGM || message.author?.id === attack.author.id)
        && message.flags?.spikependium?.soulClawCast?.event === event);
      const privacy = { ...(attack.whisper?.length ? { whisper: [...attack.whisper], blind: !!attack.blind } : {}) };
      const hidden = source.hidden || target.hidden || attack.blind || attack.whisper?.length;
      if (!origin && read().state === "pending") {
        await write({ ...read(), state: "awaiting" });
        active.set(event, { activity: activity.uuid, source, targets: [target], attack, tome: receipt.tome });
        try {
          const used = await activity.use({ consume: false, subsequentActions: false, create: { measuredTemplate: false },
            spikependium: { soulClawEvent: event } }, { configure: false }, { rollMode: hidden ? "gm" : "public", data: {
              ...privacy, speaker: ChatMessage.getSpeaker({ actor: source.actor, token: source, scene: source.parent }),
              system: { targets: [{ actor: target.actor.uuid, token: target.uuid, name: target.name, img: target.texture?.src }] },
              flags: { spikependium: { soulClawCast: { event, attack: attack.uuid } } }
            } });
          origin = used?.message;
        } finally { active.delete(event); }
      }
      if (!origin) continue; // Неизвестный сбой без карточки требует ручного разрешения, а не повторного броска.
      const cast = origin.flags.spikependium?.monsterCast;
      if (cast?.activity !== activity.uuid || cast.kind !== "arcanaloth-banishing" || cast.tome?.uuid !== receipt.tome.uuid
        || cast.tome.generation !== receipt.tome.generation || cast.targets?.length !== 1 || cast.targets[0].token !== target.uuid
        || cast.targets[0].actor !== target.actor.uuid || cast.dc !== read().dc) continue;
      let saved = saveCard(origin, target, read().dc);
      if (!saved && !read().started && controller(attack) && valid(attack)) {
        await write({ ...read(), state: "saving", started: true, origin: origin.uuid });
        await target.actor.rollSavingThrow({ ability: "cha", target: read().dc }, { configure: false }, {
          rollMode: hidden ? "gm" : "public", data: { ...privacy,
            speaker: ChatMessage.getSpeaker({ actor: target.actor, token: target, scene: target.parent }),
            flavor: "Изгоняющий коготь — спасбросок после попадания", system: { origin: origin.id } }
        });
        saved = saveCard(origin, target, read().dc);
      }
      if (!saved) continue;
      await syncMonsterEffects(saved);
      if (origin.flags.spikependium.monsterTargets?.[target.actor.uuid.replaceAll(".", "_")]?.processed)
        await write({ ...read(), state: "done", origin: origin.uuid });
    }
  } finally { working.delete(attack.uuid); }
}
export async function resumeSoulClawAttacks() {
  if (game.users.activeGM && !game.user.isActiveGM) return;
  for (const message of game.messages) if (message.flags?.spikependium?.soulClawAttack) await syncSoulClawAttack(message);
}
