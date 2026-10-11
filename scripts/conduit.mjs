import { tokensDistance } from "./effects.mjs";

const LEGACY_BONUS_ID = "rCW8TiR18Bvn7OkU";
const claims = new Set();
const turnKey = () => game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : null;

export function castingToken(activity, token) {
  if (token?.actor?.uuid === activity.actor.uuid) return token;
  const receipt = activity.item.flags.spikependium?.conduitCasting;
  const origin = token?.actor?.flags.dnd5e?.summon?.origin;
  return token && receipt?.owner === activity.actor.uuid && receipt.companion === token.uuid
    && (activity.actor.classes.artificer?.system.levels ?? 0) >= 5
    && token.actor.flags.spikependium?.key?.startsWith("actor:reanimated-companion:conduit")
    && token.actor.system.attributes.hp.value > 0 && !token.actor.statuses.has("dead") && !token.actor.statuses.has("antimagic")
    && origin && fromUuidSync(origin, { strict: false })?.actor?.uuid === activity.actor.uuid ? token : undefined;
}

export function conduitOrigins(activity) {
  if (activity?.item?.type !== "spell" || activity.item.flags.spikependium?.storedSpell
    || !activity.actor?.isOwner || (activity.actor.classes.artificer?.system.levels ?? 0) < 5 || !canvas.ready) return [];
  return [...(canvas.scene?.tokens ?? [])].filter(token => token.actor?.flags.spikependium?.key?.startsWith("actor:reanimated-companion:conduit")
    && token.actor.system.attributes.hp.value > 0 && !token.actor.statuses.has("dead")
    && token.actor.flags.dnd5e?.summon?.origin
    && fromUuidSync(token.actor.flags.dnd5e.summon.origin)?.actor?.uuid === activity.actor.uuid);
}

export function prepareConduitCastingDialog(activity, config, dialog) {
  if (!conduitOrigins(activity).length) return;
  config.spikependium = { ...config.spikependium, conduitCastingChoice: true,
    conduitOrigin: config.spikependium?.conduitOrigin ?? "self" };
  const Base = dialog.applicationClass;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      context.fields.push({ name: "spikependium.conduitOrigin", value: this.config.spikependium.conduitOrigin,
        field: new foundry.data.fields.StringField({ label: "Пространство накладывания", required: true, blank: false,
          hint: "Магический проводник меняет пространство накладывания. Используются ваши чувства, параметры и концентрация.",
          choices: { self: "Собственное пространство", ...Object.fromEntries(conduitOrigins(activity).map(t => [t.uuid, t.name])) } }) });
      context.hasConsumption = true;
      return context;
    }
  };
}

export function requireConduitCastingDialog(wrapped, config) {
  return !!config.spikependium?.conduitCastingChoice || !!config.spikependium?.usageChoice || wrapped(config);
}

export function prepareConduitCasting(activity, config, message) {
  const selected = config.spikependium?.conduitOrigin ?? activity.item.flags.spikependium?.conduitCasting?.companion ?? "self";
  if (selected === "self") {
    if (activity.item.flags.spikependium?.conduitCasting) activity.item.updateSource({ "flags.spikependium.-=conduitCasting": null });
    if (message.data?.flags?.spikependium) delete message.data.flags.spikependium.conduitCasting;
    return;
  }
  const token = conduitOrigins(activity).find(t => t.uuid === selected);
  if (!token) {
    ui.notifications.warn("Выбранный Проводник больше недоступен. Повторите накладывание и выберите пространство.");
    return false;
  }
  const receipt = { owner: activity.actor.uuid, companion: token.uuid, activity: activity.uuid };
  // Выбор принадлежит копии предмета для этого накладывания, а не предмету на листе.
  activity.item.updateSource({ "flags.spikependium.conduitCasting": receipt });
  foundry.utils.setProperty(message, "data.flags.spikependium.conduitCasting", receipt);
}

export function describeConduitCasting(activity, message) {
  const receipt = message.data.flags?.spikependium?.conduitCasting;
  if (!receipt) return;
  const token = fromUuidSync(receipt.companion);
  (message.data.system.properties ??= []).push({ type: "text", text: `Из пространства Проводника (${token?.name ?? "спутник"}); собственные чувства` });
}

export function restoreConduitActivity(wrapped, options) {
  const activity = wrapped(options);
  const receipt = this.flags.spikependium?.conduitCasting;
  if (!activity || !receipt || receipt.owner !== activity.actor?.uuid || receipt.activity !== activity.uuid || activity.item.type !== "spell") return activity;
  return activity.item.clone({ "flags.spikependium.conduitCasting": receipt }, { keepId: true }).system.activities.get(activity.id);
}

export function conduitUsageToken(wrapped, ...args) {
  const receipt = this.item.flags.spikependium?.conduitCasting;
  if (!receipt) return wrapped(...args);
  return conduitOrigins(this).find(t => t.uuid === receipt.companion);
}

export function validateConduitTemplate(activity) {
  if (!activity.item.flags.spikependium?.conduitCasting || activity.getUsageToken()) return;
  ui.notifications.warn("Проводник этого накладывания больше недоступен на текущей сцене. Повторите накладывание и выберите пространство.");
  return false;
}

export function attachConduitTemplate(activity, regions) {
  if (!activity.item.flags.spikependium?.conduitCasting) return;
  if (validateConduitTemplate(activity) === false) return false;
  const token = activity.getUsageToken();
  for (const region of regions) {
    foundry.utils.setProperty(region, "flags.dnd5e.origin", token.uuid);
    for (const shape of region.shapes) {
      if (shape.type !== "emanation") continue;
      Object.assign(shape.base, { x: token.x, y: token.y, width: token.width, height: token.height, shape: token.shape });
      region.attachment = { ...region.attachment, token: activity.target.template.stationary ? undefined : token.id };
    }
  }
}

function artificerDamage(activity) {
  const spell = activity?.item;
  return spell?.type === "spell" && ["evo", "nec"].includes(spell.system.school)
    && spell.system.classIdentifier === "artificer" && !spell.flags.spikependium?.storedSpell;
}

export function canUseConduitActivity(activity) {
  if (activity?.id !== LEGACY_BONUS_ID || !activity.actor?.flags.spikependium?.key?.startsWith("actor:reanimated-companion")) return true;
  ui.notifications.warn("Бонус Магического проводника выбирается в окне урона заклинания Изобретателя на листе хозяина.");
  return false;
}

export function recordConduitCast(activity, message) {
  if (!artificerDamage(activity)) return;
  foundry.utils.setProperty(message, "data.flags.spikependium.conduitCast", {
    owner: activity.actor.uuid, turn: turnKey(), event: foundry.utils.randomID() });
}

function usageMessage(config, message) {
  const id = message.data?.system?.origin ?? config.event?.target?.closest("[data-message-id]")?.dataset.messageId;
  let usage = typeof id === "string" ? game.messages.get(id) : id;
  const seen = new Set();
  while (usage && !seen.has(usage)) {
    seen.add(usage);
    if (usage.flags?.spikependium?.conduitCast) return usage;
    const origin = usage.system?.origin;
    usage = typeof origin === "string" ? game.messages.get(origin) : origin;
  }
}

function usedConduit(actor, limit) {
  return actor.flags.spikependium?.conduitTurn === limit || game.messages.some(message => {
    const receipt = message.flags.spikependium?.conduit;
    return receipt?.owner === actor.uuid && receipt.limit === limit;
  });
}

export function conduitEligibility(activity, usage) {
  const actor = activity?.actor;
  const cast = usage?.flags.spikependium?.conduitCast;
  if (!actor?.isOwner || !artificerDamage(activity) || (actor.classes.artificer?.system.levels ?? 0) < 5
    || !cast || cast.owner !== actor.uuid || cast.turn !== turnKey()) return null;
  const limit = cast.turn ?? cast.event;
  if (usedConduit(actor, limit)) return null;
  const token = usage.getAssociatedToken?.();
  if (!token?.parent?.grid) return null;
  const companion = [...token.parent.tokens].find(t => t.actor?.flags.spikependium?.key?.startsWith("actor:reanimated-companion:conduit")
    && t.actor.system.attributes.hp.value > 0 && !t.actor.statuses.has("dead")
    && t.actor.flags.dnd5e?.summon?.origin && fromUuidSync(t.actor.flags.dnd5e.summon.origin)?.actor?.uuid === actor.uuid
    && tokensDistance(token, t) <= 120);
  const bonus = actor.system.abilities.int.mod;
  return companion && Number.isFinite(bonus) ? { owner: actor.uuid, companion: companion.uuid, cast: usage.id, limit, bonus } : null;
}

export function prepareConduitRoll(config, dialog, message) {
  if (!canUseConduitActivity(config.subject)) return false;
  const usage = usageMessage(config, message);
  const eligible = conduitEligibility(config.subject, usage);
  if (!eligible || message.data?.type === "healing") return;
  const choices = Object.fromEntries((config.rolls ?? []).map((roll, index) => [String(index),
    `${index + 1}: ${CONFIG.DND5E.damageTypes[roll.options?.type]?.label ?? roll.options?.type ?? "урон"}`])
    .filter(([index]) => !(config.rolls[Number(index)].options?.type in CONFIG.DND5E.healingTypes)));
  if (!Object.keys(choices).length) return;
  const part = config.spikependium?.conduitPart ?? "none";
  config.spikependium = { ...config.spikependium, conduit: { ...eligible, part } };
  const Base = dialog.applicationClass ?? CONFIG.Dice.DamageRoll.DefaultConfigurationDialog;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConfigurationContext(context, options) {
      context = await super._prepareConfigurationContext(context, options);
      const currentChoices = Object.fromEntries(Object.keys(choices).map(index => {
        const type = this.rolls?.[Number(index)]?.options.type ?? config.rolls[Number(index)].options?.type;
        return [index, `${Number(index) + 1}: ${CONFIG.DND5E.damageTypes[type]?.label ?? type ?? "урон"}`];
      }));
      context.fields.push({ name: "spikependium.conduitPart", value: this.config.spikependium.conduit.part,
        field: new foundry.data.fields.StringField({ label: `Магический проводник (${eligible.bonus >= 0 ? "+" : ""}${eligible.bonus})`,
          hint: "Добавить модификатор Интеллекта к одному компоненту урона, один раз в ход.", required: true, blank: false,
          choices: { none: "Не добавлять", ...currentChoices } }) });
      return context;
    }

    _buildConfig(roll, formData, index) {
      roll = super._buildConfig(roll, formData, index);
      const selection = formData?.get("spikependium.conduitPart") ?? this.config.spikependium.conduit.part;
      this.config.spikependium.conduit.part = selection;
      return buildConduitBonus(this.config, roll, index);
    }
  };
}

export function buildConduitBonus(process, roll, index) {
  const selection = process.spikependium?.conduit;
  roll.parts = roll.parts.filter(part => part !== "@spikependiumConduit");
  if (selection?.part === String(index) && !(roll.options.type in CONFIG.DND5E.healingTypes)) {
    roll.parts.push("@spikependiumConduit");
    roll.data.spikependiumConduit = selection.bonus;
    roll.options.spikependiumConduit = selection.bonus;
  } else {
    delete roll.options.spikependiumConduit;
    delete roll.data.spikependiumConduit;
  }
  return roll;
}

export function finalizeConduitRoll(rolls, config, dialog, message) {
  const selected = config.spikependium?.conduit;
  if (!selected || selected.part === "none" || !rolls.length) return;
  const index = Number(selected.part);
  const eligible = conduitEligibility(config.subject, game.messages.get(selected.cast));
  if (!/^\d+$/.test(selected.part) || !Number.isInteger(index) || !rolls[index]
    || eligible?.companion !== selected.companion || eligible.bonus !== selected.bonus
    || rolls.filter(r => r.options.spikependiumConduit != null).length !== 1 || rolls[index].options.spikependiumConduit !== selected.bonus
    || claims.has(selected.owner)) {
    ui.notifications.warn("Магический проводник уже использован или условия изменились. Повторите бросок без бонуса.");
    return false;
  }
  if (message.create === false || config.evaluate === false) return;
  claims.add(selected.owner);
  selected.claimed = true;
  foundry.utils.setProperty(message, "data.flags.spikependium.conduit", { ...eligible, part: index });
}

export async function finishConduitRoll(wrapped, config = {}, dialog = {}, message = {}) {
  try {
    const rolls = await wrapped(config, dialog, message);
    const selected = config.spikependium?.conduit;
    if (selected?.claimed && message.document?.flags.spikependium?.conduit) {
      const actor = config.subject.actor;
      try { await actor.setFlag("spikependium", "conduitTurn", selected.limit); }
      catch (error) {
        console.error("Spikependium: счётчик Магического проводника", error);
        ui.notifications.error("Бонус Проводника применён, но счётчик не сохранён. До конца хода расход отслеживается по карточке урона.");
      }
    }
    return rolls;
  } finally {
    const selected = config.spikependium?.conduit;
    if (selected?.claimed) { claims.delete(selected.owner); delete selected.claimed; }
  }
}
