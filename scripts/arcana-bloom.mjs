const KEY = "spell:au-wither-and-bloom";
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const captured = new WeakMap(), prepared = new WeakMap(), using = new Set(), applying = new Set();
// shortcut: simultaneous owners on different clients share native non-atomic updates; arbitrate concurrent payments with the GM.
const isCast = a => a?.type === "save" && a.item.flags.spikependium?.key === KEY;
const request = a => a?.item?.flags?.spikependium?.bloomHealing;
const castPath = nonce => `flags.spikependium.bloomCasts.${nonce}.spent`;
const healPath = nonce => `flags.spikependium.bloomHealing.${nonce}`;
const countDice = dice => Object.values(dice).reduce((n, value) => n + value, 0);
function diceChoices(actor) {
  if (actor.system.isNPC) {
    const hd = actor.system.attributes.hd;
    return hd.value > 0 ? { [`d${hd.denomination}`]: hd.value } : {};
  }
  const result = {};
  for (const cls of Object.values(actor.classes)) {
    const hd = cls.system.hd;
    if (hd.value > 0) result[hd.denomination] = (result[hd.denomination] ?? 0) + hd.value;
  }
  return result;
}
function selectedToken(activity, uuid) {
  const source = activity.getUsageToken(), target = resolve(uuid);
  return source && target?.actor?.system.isCreature && target.parent === source.parent ? target : undefined;
}
function castInfo(origin) {
  const frame = origin?.flags?.spikependium?.bloomCast, activity = origin?.getAssociatedActivity?.({ scaled: true });
  if (origin?.type !== "usage" || !isCast(activity) || !frame || !/^[A-Za-z0-9]{16}$/.test(frame.nonce)
    || activity.uuid !== frame.activity || !activity.actor || activity.actor.uuid !== frame.caster || !origin.author
    || !activity.actor.testUserPermission(origin.author, "OWNER") || !Number.isInteger(frame.level)
    || frame.level < 2 || frame.level > 9 || !Number.isInteger(frame.mod)) return;
  const stored = activity.actor.flags.spikependium?.bloomCasts?.[frame.nonce];
  if (stored?.spent !== 1 || Object.entries(frame).some(([key, value]) => stored[key] !== value)) return;
  const target = resolve(frame.token);
  return target?.actor?.uuid === frame.recipient ? { frame, activity, target, origin } : undefined;
}
function inArea(info) {
  const area = info.origin.flags.spikependium.bloomArea, scene = resolve(area?.scene);
  const combat = resolve(info.frame.combat);
  if (!scene || info.target.parent !== scene || game.time.worldTime !== info.frame.time
    || (info.frame.combat && (!combat?.started || `${combat.round}:${combat.turn}` !== info.frame.turn))) return false;
  const region = new CONFIG.Region.documentClass(area.data, { parent: scene });
  const points = info.target.getOccupiedGridSpaceOffsets().map(offset => scene.grid.getCenterPoint(offset));
  if (!points.length) points.push(info.target.getCenterPoint());
  return points.some(point => region.testPoint({ ...point, elevation: info.target.elevation, level: info.target.level }));
}
function validPlan(info, actor, dice) {
  if (!info || actor.uuid !== info.frame.recipient || !dice || !Object.keys(dice).length) return false;
  const available = diceChoices(actor), count = countDice(dice);
  return count >= 1 && count <= info.frame.level - 1 && Object.entries(dice).every(([denom, n]) =>
    /^d(4|6|8|10|12|20)$/.test(denom) && Number.isInteger(n) && n >= 1 && n <= (available[denom] ?? 0));
}
function healingFormula(dice, mod) {
  return `max(0, ${[...Object.entries(dice).map(([denom, n]) => `${n}${denom}`), String(mod)].join(" + ")})`;
}
export function prepareBloomDialog(activity, config, dialog) {
  if (!isCast(activity)) return;
  const source = activity.getUsageToken();
  if (!source) return;
  config.spikependium = { ...config.spikependium, bloomTarget: config.spikependium?.bloomTarget ?? "none" };
  const Base = dialog.applicationClass; dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      context.fields.push({ name: "spikependium.bloomTarget", value: this.config.spikependium.bloomTarget,
        field: new foundry.data.fields.StringField({ label: "Увядание и цветение: получатель лечения в будущей сфере",
          choices: { none: "Без лечения", ...Object.fromEntries([...source.parent.tokens]
            .filter(t => t.actor?.system.isCreature && (game.user.isGM || t.object?.isVisible)).map(t => [t.uuid, t.name])) } }) });
      context.hasConsumption = true; return context;
    }
  };
}
export function captureBloom(activity, config) {
  captured.delete(activity);
  if (!isCast(activity) || !config.spikependium?.bloomTarget || config.spikependium.bloomTarget === "none") return;
  const target = selectedToken(activity, config.spikependium.bloomTarget), mod = activity.getRollData().mod;
  if (!target || !Number.isInteger(mod)) { ui.notifications.warn("Цветение: получатель или заклинательная характеристика недоступны."); return false; }
  const combat = game.combat?.started ? game.combat : null;
  captured.set(activity, { nonce: foundry.utils.randomID(), activity: activity.uuid, caster: activity.actor.uuid,
    token: target.uuid, recipient: target.actor.uuid, level: activity.item.system.level, mod,
    time: game.time.worldTime, combat: combat?.uuid ?? null, turn: combat ? `${combat.round}:${combat.turn}` : null });
}
export function canUseBloom(activity, config = {}) {
  if (activity?.flags?.spikependium?.bloomTemplate) {
    ui.notifications.warn("Для лечения используйте кнопку в исходной карточке Увядания и цветения."); return false;
  }
  const data = request(activity);
  if (!data) return true;
  const info = castInfo(resolve(data.origin)), actor = activity.actor;
  const state = info && actor.flags.spikependium?.bloomHealing?.[info.frame.nonce];
  const indexes = activity.consumption.targets.map((_, index) => index);
  const resources = config.consume === true || config.consume?.resources === true
    || (Array.isArray(config.consume?.resources) && indexes.every(i => config.consume.resources.includes(i)));
  if (activity.item.flags.spikependium?.key === "arcana:bloom" && actor.isOwner && validPlan(info, actor, data.dice)
    && inArea(info) && !state?.spent && !state?.applied && resources && /^[A-Za-z0-9]{16}$/.test(data.attempt)
    && activity.healing.custom.enabled && activity.healing.custom.formula === healingFormula(data.dice, info.frame.mod)) return true;
  ui.notifications.warn("Цветение: нужны собственные непотраченные кости, выбранный получатель в исходной сфере и разрешение лечения. Оплаченное лечение продолжайте из его карточки.");
  return false;
}
export function prepareBloomUpdates(activity, config, updates) {
  prepared.delete(activity);
  const frame = captured.get(activity);
  if (isCast(activity) && frame) {
    updates.actor[`flags.spikependium.bloomCasts.${frame.nonce}`] = { ...frame, spent: 1 };
    prepared.set(activity, { path: castPath(frame.nonce), frame });
  }
  const data = request(activity);
  if (!data) return updates;
  if (!canUseBloom(activity, config)) return false;
  const info = castInfo(resolve(data.origin)), path = healPath(info.frame.nonce);
  updates.actor[`${path}.spent`] = 1; updates.actor[`${path}.attempt`] = data.attempt;
  prepared.set(activity, { path: `${path}.spent` });
  return updates;
}
export function recordBloomConsumption(activity, _config, message) {
  const data = prepared.get(activity); prepared.delete(activity);
  if (!data || foundry.utils.getProperty(activity.actor, data.path) !== 1) return;
  const deltas = ((message.data.system ??= {}).deltas ??= {}).actor ??= [];
  if (!deltas.some(d => d.keyPath === data.path)) deltas.push({ keyPath: data.path, delta: 1 });
  if (data.frame) {
    foundry.utils.setProperty(message, "data.flags.spikependium.bloomCast", data.frame);
    foundry.utils.setProperty(message, "data.flags.dnd5e.item.data", activity.item.toObject());
  }
}
export async function recordBloomArea(activity, _config, results) {
  const origin = results?.message, info = castInfo(origin), region = results?.templates?.[0];
  if (!info || !isCast(activity) || origin.author.id !== game.user.id || !region) return;
  await origin.setFlag("spikependium", "bloomArea", { scene: region.parent.uuid, data: region.toObject() });
}
export function registerBloomDice() {
  CONFIG.DND5E.activityConsumptionTypes.spikependiumBloomHitDice = {
    label: "Кости хитов получателя", async consume(config, updates) {
      const data = request(this.activity), info = castInfo(resolve(data?.origin));
      const cost = (await this.resolveCost({ config, rolls: updates.rolls })).total;
      if (!validPlan(info, this.actor, data?.dice) || cost !== data.dice[this.target])
        throw new dnd5e.dataModels.activity.ConsumptionError("Цветение: неверный расход костей хитов.");
      if (!this.actor.system.isNPC) return CONFIG.DND5E.activityConsumptionTypes.hitDice.consume.call(this, config, updates);
      const hd = this.actor.system.attributes.hd;
      updates.actor["system.attributes.hd.spent"] = hd.spent + cost;
    }, consumptionLabels() { return { label: `Потратить ${this.value}${this.target} получателя`, hint: "Увядание и цветение" }; }
  };
}
export function bloomChatButtons(wrapped, message) {
  const buttons = wrapped(message);
  return isCast(this) && message?.flags?.spikependium?.bloomCast
    ? [...buttons, { action: "bloomHealing", label: { value: "Лечение: кости получателя" }, icon: "fa-solid fa-heart" }] : buttons;
}
export async function bloomChatAction(wrapped, event, target, message) {
  if (target.dataset.action !== "bloomHealing") return wrapped(event, target, message);
  const info = castInfo(message), actor = info?.target.actor;
  if (!info || !actor?.isOwner || !inArea(info)) { ui.notifications.warn("Цветение: получить лечение может владелец выбранной цели или Мастер, пока разрешается исходное накладывание."); return; }
  if (using.has(actor.uuid)) return;
  using.add(actor.uuid);
  try {
    const choices = diceChoices(actor), escape = foundry.utils.escapeHTML;
    const dice = await foundry.applications.api.DialogV2.wait({ rejectClose: false, window: { title: "Цветение: кости получателя" },
      content: `<p>${escape(actor.name)}: до ${info.frame.level - 1} костей; модификатор заклинателя ${info.frame.mod} добавляется один раз.</p>`
        + Object.entries(choices).map(([denom, n]) => `<label>${denom} (${n}) <input name="bloom-${denom}" type="number" min="0" max="${n}" value="0" step="1"></label>`).join(""),
      buttons: [{ action: "heal", label: "Потратить кости и лечиться", default: true,
        callback: (_event, button) => Object.fromEntries(Object.keys(choices).map(denom => [denom, Number(button.form.elements[`bloom-${denom}`].value)]).filter(([, n]) => n !== 0)) }] });
    if (!dice) return;
    if (!validPlan(info, actor, dice)) { ui.notifications.warn("Выберите доступные кости в пределах уровня исходной ячейки."); return; }
    const template = [...info.activity.item.system.activities].find(a => a.flags?.spikependium?.bloomTemplate);
    if (!template) return;
    const data = template.toObject(); delete data.flags.spikependium.bloomTemplate;
    data.healing.custom = { enabled: true, formula: healingFormula(dice, info.frame.mod) };
    data.consumption.targets = Object.entries(dice).map(([denom, n]) => ({ type: "spikependiumBloomHitDice", target: denom, value: String(n), scaling: {} }));
    const frame = { origin: message.uuid, dice, attempt: foundry.utils.randomID() };
    const item = new CONFIG.Item.documentClass({ name: "Увядание и цветение: лечение", type: "feat", img: info.activity.item.img,
      system: { identifier: "bloom-healing", source: structuredClone(info.activity.item._source.system.source), activities: { [data._id]: data } },
      flags: { spikependium: { key: "arcana:bloom", bloomHealing: frame } } }, { parent: actor });
    await item.system.activities.get(data._id).use({ scaling: false, consume: { resources: true } }, {}, { data: {
      speaker: ChatMessage.getSpeaker({ actor, token: info.target, scene: info.target.parent }),
      flags: { spikependium: { bloomHealing: frame }, dnd5e: { item: { data: item.toObject() } } }
    } });
  } finally { using.delete(actor.uuid); }
}
function paidHealing(message) {
  const usage = message?.type === "usage" ? message : message?.getOriginatingMessage?.();
  const activity = usage?.getAssociatedActivity?.(), data = request(activity), info = castInfo(resolve(data?.origin)), actor = activity?.actor;
  const state = info && actor?.flags.spikependium?.bloomHealing?.[info.frame.nonce];
  const entries = Object.entries(data?.dice ?? {});
  return info && activity.item.flags.spikependium?.key === "arcana:bloom" && usage.author
    && actor.uuid === info.frame.recipient && actor.testUserPermission(usage.author, "OWNER")
    && entries.length && entries.every(([denom, n]) => /^d(4|6|8|10|12|20)$/.test(denom) && Number.isInteger(n) && n >= 1)
    && countDice(data.dice) <= info.frame.level - 1
    && activity.healing.custom.enabled && activity.healing.custom.formula === healingFormula(data.dice, info.frame.mod)
    && state?.spent === 1 && state.attempt === data.attempt && !state.applied ? { actor, usage, info, data } : undefined;
}
export async function rollBloomHealing(wrapped, config = {}, dialog = {}, message = {}) {
  const data = request(this);
  if (!data) return wrapped(config, dialog, message);
  const id = config.event?.target?.closest("[data-message-id]")?.dataset.messageId ?? message.data?.system?.origin;
  const paid = paidHealing(game.messages.get(id));
  if (!paid || paid.data.attempt !== data.attempt || paid.data.origin !== data.origin || paid.actor.uuid !== this.actor.uuid) {
    ui.notifications.warn("Цветение: эта карточка лечения не оплачена, отменена или уже применена."); return;
  }
  const source = paid.info.activity.item.toObject(), activity = this.toObject();
  source._id = foundry.utils.randomID();
  source.system.level = paid.info.frame.level;
  source.system.activities = { [activity._id]: activity };
  const item = new CONFIG.Item.documentClass(source, { parent: paid.info.activity.actor });
  return item.system.activities.get(activity._id).rollDamage(config, dialog, foundry.utils.mergeObject({
    data: { speaker: ChatMessage.getSpeaker({ actor: paid.actor, token: paid.info.target, scene: paid.info.target.parent }),
      system: { origin: paid.usage.id, targets: [{ actor: paid.actor.uuid, token: paid.info.target.uuid,
        name: paid.info.target.name, img: paid.info.target.texture?.src }] },
      flags: { dnd5e: { item: { data: item.toObject() } } } }
  }, message));
}
function validHealingRoll(message, paid) {
  const roll = message?.rolls?.[0];
  return !!paid && message.type === "healing" && message.author && paid.actor.testUserPermission(message.author, "OWNER")
    && message.rolls.length === 1 && roll instanceof CONFIG.Dice.DamageRoll && roll._evaluated
    && roll.options.type === "healing" && Number.isFinite(roll.total) && roll.total >= 0;
}
export function recordBloomHealing(actor, _amount, updates, options) {
  const message = options.originatingMessage;
  if (!request(message?.getOriginatingMessage?.()?.getAssociatedActivity?.())) return;
  const paid = paidHealing(message);
  if (!validHealingRoll(message, paid) || paid.actor.uuid !== actor.uuid) return false;
  updates[`${healPath(paid.info.frame.nonce)}.applied`] = 1;
}
export async function syncBloomHealing(message) {
  const paid = message?.type === "healing" && paidHealing(message);
  if (!paid || applying.has(paid.actor.uuid) || !paid.actor.isOwner
    || (game.users.activeGM ? !game.user.isActiveGM : message.author?.id !== game.user.id)
    || !validHealingRoll(message, paid)) return;
  applying.add(paid.actor.uuid);
  try {
    await paid.actor.applyDamage([{ value: message.rolls[0].total, type: "healing" }], { originatingMessage: message });
  } finally { applying.delete(paid.actor.uuid); }
}
export async function resumeBloomHealing() {
  if (!game.user.isActiveGM) return;
  for (const message of game.messages) if (message.type === "healing" && paidHealing(message)) await syncBloomHealing(message);
}
