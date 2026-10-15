import { attackHitTargets } from "./companions.mjs";
import { attackSource } from "./attack-source.mjs";

// shortcut: simultaneous owners on different clients can race native resource updates; the GM arbitrates concurrent uses.
const using = new Set(), prepared = new WeakMap();
const key = activity => activity?.item?.flags.spikependium?.key ?? "";
const data = activity => /^(alchemist:bombs|alchemist:(?:special-)?formula:[\w-]+|alchemist:discovery:fire-eater)$/.test(key(activity)) ? activity.flags?.spikependium?.alchemistBomb : null;
const splash = activity => /^(alchemist:bombs|alchemist:(?:special-)?formula:[\w-]+)$/.test(key(activity)) && activity.flags?.spikependium?.alchemistSplash;
const get = (object, path) => foundry.utils.getProperty(object, path);
const castPath = nonce => `flags.spikependium.bombCasts.${nonce}.spent`;
function turn(activity) {
  const actor = activity.actor;
  const combats = game.combats.filter(c => c.started && c.getCombatantsByActor(actor).length);
  const combat = combats.includes(game.combat) ? game.combat : combats.length === 1 ? combats[0] : undefined;
  if (combats.length && !combat) return false;
  return combat ? `${combat.id}-r${combat.round}-t${combat.turn}` : null;
}
export async function alchemistBombUse(wrapped, ...args) {
  if (!data(this) && !splash(this)) return wrapped(...args);
  if (using.has(this.actor.uuid)) { ui.notifications.warn("Сначала завершите уже открытое применение бомбы."); return; }
  using.add(this.actor.uuid);
  try { return await wrapped(...args); }
  finally { using.delete(this.actor.uuid); }
}
function damageSource(activity, message) {
  if (message?.type !== "damage" || message.isContentVisible === false || !message.author || !activity.actor.testUserPermission(message.author, "OWNER")) return;
  const original = message.getAssociatedActivity?.(), usage = message.getOriginatingMessage?.();
  if (original?.item.id !== activity.item.id || original.actor?.uuid !== activity.actor.uuid) return;
  const receipt = paidAlchemistBomb(original, usage);
  if (!receipt || (receipt.turn && receipt.turn !== turn(original))) return;
  const attack = attackSource(message), hits = attack && attackHitTargets(attack);
  if (attack?.isContentVisible === false || hits?.length !== 1) return;
  const totals = new Map();
  for (const roll of message.rolls) {
    if (!(roll instanceof CONFIG.Dice.DamageRoll) || !roll._evaluated || !Number.isFinite(roll.total) || roll.total < 0
      || !(roll.options.type in CONFIG.DND5E.damageTypes)) return;
    totals.set(roll.options.type, (totals.get(roll.options.type) ?? 0) + roll.total);
  }
  if (!totals.size) return;
  const ratio = activity.flags.spikependium.alchemistSplash?.fullDamage ? 1 : 0.5;
  const parts = [...totals].map(([type, total]) => ({ custom: { enabled: true, formula: String(Math.floor(total * ratio)) }, number: null, denomination: null, bonus: "", types: [type], scaling: { mode: "", number: null, formula: "" } }));
  return { receipt, parts, primary: hits[0].token.uuid };
}
export function prepareAlchemistSplashDialog(activity, config, dialog) {
  if (!splash(activity)) return;
  const choices = Object.fromEntries([...game.messages.values()].slice(-50).filter(message => damageSource(activity, message)
    && !get(activity.actor, `flags.spikependium.bombSplashes.${message.getOriginatingMessage().flags.spikependium.alchemistBomb.nonce}.spent`))
    .map(message => [message.id, `${message.flavor || activity.item.name}: ${message.rolls.reduce((total, roll) => total + roll.total, 0)}`]));
  if (!Object.keys(choices).length) { ui.notifications.warn("Нет оплаченного попадания этой бомбой с исходным броском урона в текущем ходу."); return false; }
  config.spikependium = { ...config.spikependium, usageChoice: true };
  const Base = dialog.applicationClass; dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      context.fields.push({ field: new foundry.data.fields.StringField({ label: "Исходный урон попавшей бомбы", required: true, blank: false, choices }),
        name: "spikependium.bombDamage", value: this.config.spikependium?.bombDamage ?? Object.keys(choices).at(-1) });
      return context;
    }
  };
}
export function prepareAlchemistBombUpdates(activity, _config, updates) {
  prepared.delete(activity);
  if (splash(activity)) {
    const id = _config.spikependium?.bombDamage, source = damageSource(activity, game.messages.get(id));
    if (_config.consume === false || !source || get(activity.actor, `flags.spikependium.bombSplashes.${source.receipt.nonce}.spent`)) {
      ui.notifications.warn("Взрыв требует ещё не использованного попадания и его исходного урона. Повторный бросок урона не нужен."); return false;
    }
    const nonce = foundry.utils.randomID(), frame = { nonce, actor: activity.actor.uuid, source: id, original: source.receipt.nonce };
    updates.actor[`flags.spikependium.bombSplashes.${frame.original}.spent`] = 1;
    updates.actor[`flags.spikependium.bombSplashCasts.${nonce}.spent`] = 1;
    activity.updateSource({ "damage.parts": source.parts });
    prepared.set(activity, frame); return updates;
  }
  const bomb = data(activity); if (!bomb) return updates;
  const actor = activity.actor;
  if (key(activity) === "alchemist:special-formula:painkiller" && Object.entries(actor.flags.spikependium?.painkillerUntil ?? {}).some(([nonce, until]) => until > game.time.worldTime && get(actor, castPath(nonce)) === 1)) {
    ui.notifications.warn("После болеутоляющей бомбы должна пройти одна минута."); return false;
  }
  const resource = actor.items.find(i => i.type === "feat" && i.system.identifier === "alchemist-bombs");
  const update = resource && updates.item.find(i => i._id === resource.id);
  const paid = update?.["system.uses.spent"] ?? update?.system?.uses?.spent;
  if (!actor.isOwner || !resource || paid !== resource.system.uses.spent + 1) {
    ui.notifications.warn("Применение требует расхода одной бомбы из общего запаса."); return false;
  }
  const current = bomb.charged ? turn(activity) : null;
  const turnPath = current && `flags.spikependium.bombTurns.${current}`;
  if (current === false || (turnPath && get(actor, turnPath) >= 1)) {
    ui.notifications.warn("В этом ходу бомба уже заряжалась. При нескольких боях выберите бой алхимика."); return false;
  }
  const nonce = foundry.utils.randomID();
  updates.actor[castPath(nonce)] = 1;
  if (key(activity) === "alchemist:special-formula:painkiller") updates.actor[`flags.spikependium.painkillerUntil.${nonce}`] = game.time.worldTime + 60;
  if (turnPath) updates.actor[turnPath] = 1;
  prepared.set(activity, { nonce, actor: actor.uuid, item: activity.item.id, activity: activity.id, resource: resource.id, charged: !!bomb.charged, turn: current });
  return updates;
}
export function validateAlchemistSplashTargets(activity, config, message) {
  if ((data(activity) || splash(activity)) && message.create === false) {
    ui.notifications.warn("Бомба требует карточки расхода в чате, чтобы сохранялись оплата и возможность отмены."); return false;
  }
  if (!splash(activity)) return;
  const source = damageSource(activity, game.messages.get(config.spikependium?.bombDamage));
  const targets = message.data.system?.targets;
  if (!source || !targets?.length || targets.some(target => target.token === source.primary)) {
    ui.notifications.warn("Для взрыва выделите остальных существ в области, исключив уже поражённую основную цель."); return false;
  }
}
export function recordAlchemistBomb(activity, _config, message, updates) {
  const receipt = prepared.get(activity); prepared.delete(activity);
  const splashPath = receipt?.source && `flags.spikependium.bombSplashCasts.${receipt.nonce}.spent`;
  if (!receipt || get(activity.actor, splashPath || castPath(receipt.nonce)) !== 1) return;
  const deltas = ((message.data.system ??= {}).deltas ??= {}).actor ??= [];
  const paths = splashPath ? [splashPath, `flags.spikependium.bombSplashes.${receipt.original}.spent`]
    : [castPath(receipt.nonce), ...(receipt.turn ? [`flags.spikependium.bombTurns.${receipt.turn}`] : []), ...(key(activity) === "alchemist:special-formula:painkiller" ? [`flags.spikependium.painkillerUntil.${receipt.nonce}`] : [])];
  for (const path of paths) if (Number.isFinite(updates.actor[path]) && updates.actor[path] !== 0 && !deltas.some(d => d.keyPath === path)) deltas.push({ keyPath: path, delta: updates.actor[path] });
  foundry.utils.setProperty(message, `data.flags.spikependium.${splashPath ? "alchemistSplash" : "alchemistBomb"}`, receipt);
  if (splashPath) foundry.utils.setProperty(message, "data.flags.dnd5e.item.data", activity.item.toObject());
}
export function paidAlchemistBomb(activity, message) {
  const receipt = message?.flags.spikependium?.alchemistBomb;
  if (!data(activity) || message?.type !== "usage" || !message.author || !activity.actor.testUserPermission(message.author, "OWNER")
    || receipt?.actor !== activity.actor.uuid || receipt.item !== activity.item.id || receipt.activity !== activity.id
    || !/^[A-Za-z0-9]{16}$/.test(receipt.nonce ?? "") || get(activity.actor, castPath(receipt.nonce)) !== 1
    || !message.system.deltas?.item?.[receipt.resource]?.some(d => d.keyPath === "system.uses.spent" && d.delta === 1)) return;
  return receipt;
}
export function guardAlchemistBombRoll(config, _dialog, message) {
  const activity = config.subject; if (!data(activity) && !splash(activity)) return;
  const origin = game.messages.get(message.data?.system?.origin);
  const usage = origin?.type === "usage" ? origin : origin?.getOriginatingMessage?.();
  if (splash(activity)) {
    const frame = usage?.flags.spikependium?.alchemistSplash;
    const source = damageSource(activity, game.messages.get(frame?.source));
    if (!source || frame?.actor !== activity.actor.uuid || frame.original !== source.receipt.nonce || !/^[A-Za-z0-9]{16}$/.test(frame?.nonce ?? "")
      || get(activity.actor, `flags.spikependium.bombSplashCasts.${frame.nonce}.spent`) !== 1
      || get(activity.actor, `flags.spikependium.bombSplashes.${frame.original}.spent`) !== 1) {
      ui.notifications.warn("Карточка взрыва отменена, исходная бомба отменена либо закончился её ход."); return false;
    }
    for (const roll of config.rolls ?? []) if (roll.parts) {
      const type = roll.options?.type, part = source.parts.find(p => p.types.includes(type));
      if (!part) return false;
      roll.parts = [part.custom.formula];
      roll.options.isCritical = false;
    }
    config.isCritical = false;
    return;
  }
  const receipt = paidAlchemistBomb(activity, usage);
  if (!receipt || (receipt.turn && receipt.turn !== turn(activity))) {
    ui.notifications.warn("Сначала используйте бомбу с листа: требуется действующий расход бомбы и зарядки этого хода."); return false;
  }
}
export function alchemistBombDeltaLabel(wrapped, ...args) {
  const result = wrapped(...args);
  if (/^flags\.spikependium\.bombTurns\./.test(this.keyPath)) result.label = "Зарядка бомбы в этом ходу";
  if (/^flags\.spikependium\.bombCasts\./.test(this.keyPath)) result.label = "Оплаченное применение бомбы";
  if (/^flags\.spikependium\.bombSplashes\./.test(this.keyPath)) result.label = "Взрыв попавшей бомбы";
  if (/^flags\.spikependium\.bombSplashCasts\./.test(this.keyPath)) result.label = "Карточка взрыва";
  if (/^flags\.spikependium\.painkillerUntil\./.test(this.keyPath)) result.label = "Болеутоляющая бомба: минута до повторного применения";
  return result;
}
export function restoreAlchemistSplash(wrapped, options) {
  const activity = wrapped(options);
  const origin = this.type === "usage" ? this : this.getOriginatingMessage?.();
  const frame = origin?.flags.spikependium?.alchemistSplash, cached = origin?.getFlag("dnd5e", "item.data");
  const parts = cached?.system?.activities?.[activity?.id]?.damage?.parts;
  if (!splash(activity) || frame?.actor !== activity.actor?.uuid || cached?._id !== activity.item.id || !parts?.length) return activity;
  return activity.item.clone({ [`system.activities.${activity.id}.damage.parts`]: parts }, { keepId: true }).system.activities.get(activity.id);
}
