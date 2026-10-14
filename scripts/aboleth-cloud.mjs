import { incapacitated, tokensDistance } from "./effects.mjs";
import { abolethUnderwater } from "./aboleth-water.mjs";

const active = new Map(), working = new Set();
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const stateFor = (combatant, event) => combatant.flags.spikependium?.mucusCloudEvents?.[event];
const saveState = (combatant, value) => combatant.setFlag("spikependium", `mucusCloudEvents.${value.event}`, value);
const supported = source => source?.actor?.flags.spikependium?.key === "actor:mm25:aboleth" && source.actor.isOwner
  && source.actor.system.attributes.hp.value > 0 && !incapacitated(source.actor) && abolethUnderwater(source.actor);
export function mucusTargets(source) {
  if (!supported(source)) return [];
  const seen = new Set();
  return [...source.parent.tokens].filter(target => {
    if (target.uuid === source.uuid || target.actor?.uuid === source.actor.uuid || !target.actor?.system.isCreature
      || target.actor.statuses.has("dead") || target.actor.statuses.has("coverTotal") || seen.has(target.actor.uuid)) return false;
    const distance = tokensDistance(source, target);
    if (!Number.isFinite(distance) || distance > 5) return false;
    const backend = CONFIG.Canvas.polygonBackends.move;
    const starts = source.getVisibilityTestPoints(), ends = target.getVisibilityTestPoints();
    const open = starts.some(start => ends.some(end => !backend.testCollision(start, end, {
      type: "move", mode: "any", scene: source.parent, level: source.parent.levels?.get(source.level)
    })));
    if (open) seen.add(target.actor.uuid);
    return open;
  });
}
export function automaticMucusTargets(activity, config) {
  const value = active.get(config?.spikependium?.mucusEvent);
  return value?.activity === activity?.uuid && value.source.actor.uuid === activity.actor.uuid ? value : undefined;
}
function saveCard(origin, token) {
  return origin.getAssociatedRolls("save").filter(card => card.system.ability === "con"
    && card.getAssociatedActor()?.uuid === token.actor.uuid && card.getAssociatedToken()?.uuid === token.uuid).at(-1);
}
async function process(combatant, receipt) {
  if (!game.user.isActiveGM || working.has(receipt.event)) return;
  const source = resolve(receipt.source), activity = resolve(receipt.activity);
  if (!source?.actor?.isOwner || source.actor.flags.spikependium?.key !== "actor:mm25:aboleth" || activity?.actor?.uuid !== source.actor.uuid) return;
  working.add(receipt.event);
  try {
    let origin = receipt.message && resolve(receipt.message);
    if (!origin) origin = game.messages.find(message => message.author?.isGM && message.type === "usage"
      && message.flags.spikependium?.mucusEvent === receipt.event);
    if (!origin && receipt.state === "pending") {
      await saveState(combatant, { ...receipt, state: "awaiting" });
      const tokens = receipt.targets.map(target => resolve(target.token)).filter(token => token?.actor && token.actor.uuid === receipt.targets.find(t => t.token === token.uuid).actor);
      active.set(receipt.event, { activity: activity.uuid, source, tokens });
      try {
        const results = await activity.use({ consume: false, subsequentActions: false, create: { measuredTemplate: false },
          spikependium: { mucusEvent: receipt.event } }, { configure: false }, {
          rollMode: receipt.hidden ? "gm" : "public", data: {
            speaker: ChatMessage.getSpeaker({ actor: source.actor, token: source, scene: source.parent }),
            system: { targets: receipt.targets }, flags: { spikependium: { mucusEvent: receipt.event } }
          }
        });
        origin = results?.message;
      } finally { active.delete(receipt.event); }
    }
    if (!origin) return;
    if (origin.getAssociatedActivity()?.uuid !== activity.uuid || origin.flags.spikependium?.monsterCast?.kind !== "aboleth-curse") return;
    const current = stateFor(combatant, receipt.event);
    if (!current) return;
    if (current.state !== "saving") await saveState(combatant, { ...current, message: origin.uuid, state: "saving" });
    for (const target of receipt.targets) {
      const token = resolve(target.token);
      if (!token?.actor?.isOwner || token.actor.uuid !== target.actor || saveCard(origin, token)) continue;
      const state = stateFor(combatant, receipt.event);
      if (!state || state.started?.[target.actor.replaceAll(".", "_")]) continue;
      const key = target.actor.replaceAll(".", "_");
      await saveState(combatant, { ...state, started: { ...state.started, [key]: true } });
      await token.actor.rollSavingThrow({ ability: "con", target: receipt.dc }, { configure: false }, {
        rollMode: receipt.hidden ? "gm" : "public", data: {
          speaker: ChatMessage.getSpeaker({ actor: token.actor, token, scene: token.parent }),
          flavor: "Облако слизи аболета — конец хода", system: { origin: origin.id }
        }
      });
    }
    const done = receipt.targets.every(target => { const token = resolve(target.token); return !token?.actor || !!saveCard(origin, token); });
    if (done) await saveState(combatant, { ...stateFor(combatant, receipt.event), state: "done" });
  } finally { working.delete(receipt.event); }
}
export async function abolethEndTurn(wrapped, combatant) {
  const result = await wrapped(combatant);
  const source = combatant?.token;
  if (!game.user.isActiveGM || !supported(source) || !Number.isInteger(this.previous?.round) || this.previous.round < 1) return result;
  const event = `${this.id}:${this.previous.round}:${this.previous.turn}:${combatant.id}`;
  if (stateFor(combatant, event)) return result;
  const activity = [...source.actor.items].flatMap(item => [...item.system.activities]).find(a => a.flags.spikependium?.monsterAction === "aboleth-curse");
  if (!activity || !Number.isFinite(activity.save.dc.value)) return result;
  const tokens = mucusTargets(source);
  if (!tokens.length) return result;
  const targets = tokens.map(token => ({ token: token.uuid, actor: token.actor.uuid, name: token.name, img: token.texture?.src }));
  const receipt = { event, activity: activity.uuid, source: source.uuid, targets, dc: activity.save.dc.value,
    hidden: !!source.hidden || !!combatant.hidden || tokens.some(token => token.hidden), state: "pending" };
  await saveState(combatant, receipt);
  await process(combatant, receipt);
  return result;
}
export async function resumeMucusCloud() {
  if (!game.user.isActiveGM) return;
  for (const combat of game.combats) for (const combatant of combat.combatants) {
    for (const receipt of Object.values(combatant.flags.spikependium?.mucusCloudEvents ?? {}))
      if (receipt.state !== "done") await process(combatant, receipt);
  }
}
