import { tokensDistance } from "./effects.mjs";

const KEY = "feat:magic-artist", captured = new WeakMap(), applying = new Set();
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const isArtist = a => a?.item?.flags.spikependium?.key === KEY && a.flags.spikependium?.artistInspiration;
const turn = () => game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : null;
function illusion(activity) {
  if (activity?.type === "cast") return resolve(activity.spell?.uuid)?.system?.school === "ill";
  return activity?.item?.type === "spell" && activity.item.system.school === "ill"
    && (activity.item.system.level === 0 || activity.consumption?.spellSlot === true || activity.consumption?.targets?.length > 0);
}
export function recordArtistIllusion(activity, message) {
  if (!illusion(activity) || !activity.actor.items.some(i => i.flags.spikependium?.key === KEY)) return;
  foundry.utils.setProperty(message, "data.flags.spikependium.artistIllusion", {
    actor: activity.actor.uuid, token: dnd5e.utils.getSceneTargets(activity.actor)[0]?.document?.uuid,
    time: game.time.worldTime, turn: turn(), paid: !!message.data.system.deltas
      && Object.values(message.data.system.deltas).some(v => Array.isArray(v) ? v.length : Object.values(v ?? {}).some(d => d.length))
  });
}
function origins(activity, fresh = true) {
  return [...game.messages].filter(m => {
    const receipt = m.flags.spikependium?.artistIllusion;
    return m.type === "usage" && receipt?.actor === activity.actor.uuid
      && m.getAssociatedActor()?.uuid === activity.actor.uuid && illusion(m.getAssociatedActivity())
      && m.author && activity.actor.testUserPermission(m.author, "OWNER")
      && (!receipt.paid || Object.values(m.system.deltas ?? {}).some(v => Array.isArray(v) ? v.length : Object.values(v ?? {}).some(d => d.length)))
      && (!fresh || (receipt.time === game.time.worldTime && receipt.turn === turn()
        && Number.isFinite(m.timestamp) && Date.now() - m.timestamp >= 0 && Date.now() - m.timestamp <= 60000));
  });
}
export function prepareArtistDialog(activity, config, dialog) {
  if (!isArtist(activity)) return;
  const available = origins(activity), Base = dialog.applicationClass;
  config.spikependium = { ...config.spikependium, artistOrigin: config.spikependium?.artistOrigin ?? available.at(-1)?.uuid ?? "" };
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      context.fields.push({ name: "spikependium.artistOrigin", value: this.config.spikependium.artistOrigin,
        field: new foundry.data.fields.StringField({ label: "Только что наложенная иллюзия", choices: {
          "": "Сначала наложите иллюзию", ...Object.fromEntries(available.map(m => [m.uuid, m.getAssociatedActivity().item.name])) } }) },
      { name: "spikependium.artistVisible", value: this.config.spikependium?.artistVisible ?? false,
        field: new foundry.data.fields.BooleanField({ label: "Выбранный союзник видит вас" }), input: context.inputs.createCheckboxInput });
      context.hasConsumption = true; return context;
    }
  };
}
export function captureArtistInspiration(activity, config, message) {
  captured.delete(activity);
  if (!isArtist(activity)) return;
  const origin = resolve(config.spikependium?.artistOrigin), source = resolve(origin?.flags.spikependium?.artistIllusion?.token);
  const targets = [...game.user.targets].map(t => t.document ?? t), target = targets[0];
  const descriptors = message.data?.system?.targets;
  const valid = activity.actor.isOwner && activity.uses.value > 0 && message.create !== false
    && config.consume !== false && config.consume?.resources !== false && config.spikependium?.artistVisible === true
    && origins(activity).includes(origin) && source?.actor?.uuid === activity.actor.uuid
    && targets.length === 1 && target?.actor?.system?.isCreature && target.actor.uuid !== activity.actor.uuid
    && tokensDistance(source, target) != null && tokensDistance(source, target) <= 30
    && (!descriptors || (descriptors.length === 1 && descriptors[0].actor === target.actor.uuid
      && (!descriptors[0].token || descriptors[0].token === target.uuid)))
    && (game.users.activeGM || target.actor.isOwner);
  if (!valid) {
    ui.notifications.warn("Вдохновляющая магия: нужна свежая иллюзия, один видящий вас союзник в 30 футах, доступное применение и Мастер либо права на лист союзника.");
    return false;
  }
  captured.set(activity, { origin: origin.uuid, source: source.uuid, target: target.uuid, actor: target.actor.uuid });
}
export function recordArtistInspiration(activity, message) {
  if (!isArtist(activity)) return;
  const receipt = captured.get(activity); captured.delete(activity);
  if (receipt) foundry.utils.setProperty(message, "data.flags.spikependium.artistInspiration", receipt);
}
export async function syncArtistInspiration(message) {
  const receipt = message?.flags?.spikependium?.artistInspiration, activity = message?.getAssociatedActivity?.();
  if (!receipt || !isArtist(activity) || message.type !== "usage" || !message.author
    || !activity.actor.testUserPermission(message.author, "OWNER") || applying.has(message.uuid)) return;
  const target = resolve(receipt.target), source = resolve(receipt.source), actor = target?.actor;
  const responsible = game.users.activeGM ?? message.author;
  const cost = message.system.deltas?.item?.[activity.item.id];
  const origin = resolve(receipt.origin), descriptors = message.system.targets;
  if (responsible.id !== game.user.id || !actor?.isOwner || actor.uuid !== receipt.actor
    || !actor.system.isCreature || actor.uuid === activity.actor.uuid || source?.actor?.uuid !== activity.actor.uuid
    || origin?.flags.spikependium?.artistIllusion?.token !== source.uuid
    || tokensDistance(source, target) == null || tokensDistance(source, target) > 30
    || (descriptors && (descriptors.length !== 1 || descriptors[0].actor !== actor.uuid
      || (descriptors[0].token && descriptors[0].token !== target.uuid)))
    || !origins(activity, false).some(m => m.uuid === receipt.origin)
    || !cost?.some(d => d.keyPath === `system.activities.${activity.id}.uses.spent` && d.delta === 1)
    || actor.flags.spikependium?.artistInspirations?.[message.id]) return;
  // shortcut: refunded inspiration may already have been spent; reconcile the ally's mark manually.
  applying.add(message.uuid);
  try {
    await actor.update({ "system.attributes.inspiration": true, [`flags.spikependium.artistInspirations.${message.id}`]: true });
  } finally { applying.delete(message.uuid); }
}
export async function resumeArtistInspirations() {
  for (const message of game.messages) if (message.flags.spikependium?.artistInspiration) await syncArtistInspiration(message);
}
