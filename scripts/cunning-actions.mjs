import { incapacitated } from "./effects.mjs";

// shortcut: dnd5e resource updates are not atomic across clients; arbitrate concurrent owners with the GM if needed.
const prepared = new WeakMap(), using = new Set();
function supported(activity) {
  return activity?.activation?.type === "bonus"
    && !["cast","forward"].includes(activity.type)
    && (["actor:mm25:assassin", "actor:au-plant-vine"].includes(activity.actor?.flags.spikependium?.key)
      || activity.actor?.items?.some?.(i=>["feat:au-spell-trickster","feat:au-elemental-familiar","feat:au-boon-of-school-mastery","subclass:au-conjurer"].includes(i.flags.spikependium?.key))
      || activity.item?.flags.spikependium?.key === "feat:au-elemental-familiar" && activity.flags.spikependium?.elementalFamiliarCommand
      || activity.item?.flags.spikependium?.key === "feat:au-spell-trickster" && activity.flags.spikependium?.spellTrickEscape);
}
const exempt = config => config?.consume === false || config?.consume?.action === false;
export async function cunningUse(wrapped, config = {}, ...args) {
  if (!supported(this)) return wrapped(config, ...args);
  if (config.consume!==false)config={...config,consume:{...config.consume,action:config.consume?.action??true}};
  if(exempt(config))return wrapped(config,...args);
  if (using.has(this.actor.uuid)) {
    ui.notifications.warn("Сначала завершите уже открытое бонусное действие этого существа."); return;
  }
  using.add(this.actor.uuid);
  try { return await wrapped(config, ...args); }
  finally { using.delete(this.actor.uuid); }
}
export function prepareCunningMessage(activity,config,_dialog,message){
  if(supported(activity)&&!exempt(config)&&context(activity)){config.hasConsumption=true;message.hasConsumption=true;}
}
function context(activity) {
  const actor = activity.actor;
  const combats = game.combats.filter(c => c.started && c.getCombatantsByActor(actor).length);
  const combat = combats.includes(game.combat) ? game.combat : combats.length === 1 ? combats[0] : undefined;
  if (combats.length && !combat) return false;
  if (!combat) return null;
  if (combat.combatant?.actor?.uuid !== actor.uuid) return false;
  return `flags.spikependium.cunningActions.${combat.id}.r${combat.round}t${combat.turn}.spent`;
}
export function prepareCunningUpdates(activity, config, updates) {
  prepared.delete(activity);
  if (!supported(activity) || exempt(config)) return updates;
  if (!activity.actor.isOwner || incapacitated(activity.actor) || activity.actor.system.attributes.hp.value <= 0) return false;
  const path = context(activity);
  if (path === false || (path && foundry.utils.getProperty(activity.actor, path) >= 1)) {
    ui.notifications.warn("Бонусное действие уже израсходовано в этом ходу либо сейчас не ваш ход. Выберите бой этого существа.");
    return false;
  }
  // Outside combat there is no turn to charge; the activity still shows its bonus-action activation.
  const disengage = activity.flags?.spikependium?.cunningDisengage && path
    ? `flags.spikependium.disengageCasts.${foundry.utils.randomID()}.spent` : null;
  const hide = activity.flags?.spikependium?.cunningHide
    ? `flags.spikependium.hideCasts.${foundry.utils.randomID()}.spent` : null;
  if (path) updates.actor[path] = 1;
  if (disengage) updates.actor[disengage] = 1;
  if (hide) updates.actor[hide] = 1;
  prepared.set(activity, { path, disengage, hide }); return updates;
}
export function recordCunningConsumption(activity, _config, message) {
  const record = prepared.get(activity); prepared.delete(activity);
  if (!record) return;
  message.data.system.deltas ??= { actor: [], item: {} };
  const deltas = message.data.system.deltas.actor ??= [];
  for (const path of [record.path, record.disengage, record.hide].filter(Boolean)) {
    if (foundry.utils.getProperty(activity.actor, path) === 1 && !deltas.some(d => d.keyPath === path)) deltas.push({ keyPath: path, delta: 1 });
  }
  if (record.disengage) foundry.utils.setProperty(message, "data.flags.spikependium.disengagePayment", record.disengage);
  if (record.hide) foundry.utils.setProperty(message, "data.flags.spikependium.hidePayment", record.hide);
}
export function cunningDeltaLabel(wrapped, ...args) {
  const data = wrapped(...args);
  if (/^flags\.spikependium\.cunningActions\.[A-Za-z0-9]{16}\.r\d+t\d+\.spent$/.test(this.keyPath)) data.label = "Бонусное действие";
  if (/^flags\.spikependium\.disengageCasts\.[A-Za-z0-9]{16}\.spent$/.test(this.keyPath)) data.label = "Отступление";
  if (/^flags\.spikependium\.hideCasts\.[A-Za-z0-9]{16}\.spent$/.test(this.keyPath)) data.label = "Засада";
  return data;
}
export function refundCunning(wrapped,consumed,...args){
  const spent=consumed?.actor?.find(d=>/^flags\.spikependium\.cunningActions\.[A-Za-z0-9]{16}\.r\d+t\d+\.spent$/.test(d.keyPath)&&d.delta===1);
  const adjusted=spent&&spent.keyPath!==context(this)?{...consumed,actor:consumed.actor.filter(d=>d.keyPath!=="system.attributes.actions.bonus.spent")}:consumed;
  return wrapped(adjusted,...args);
}
