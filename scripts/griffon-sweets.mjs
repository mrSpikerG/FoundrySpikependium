const pending = new WeakMap(), using = new Set(), finishing = new Set(), saving = new Set();
const key = item => item?.flags?.spikependium?.key;
const resolve = uuid => {
  if (typeof uuid !== "string" || !uuid) return undefined;
  try { return fromUuidSync(uuid, { strict: false }); } catch { return undefined; }
};
const receiptPath = nonce => `flags.spikependium.sweetReceipts.${nonce}`;
const receipts = actor => actor?.flags?.spikependium?.sweetReceipts ?? {};
const combatKey = () => game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : "";
const rootActivity = (a, config = {}) => a.getLinkedActivity?.(config.cause?.activity) ?? a;
const isStomach = kind => ["hasty", "kindle-egg", "tongue-twisty", "peppermince", "shielding-turtle"].includes(kind) || /^ooze-(white|black|blue|gray|gold|red|green|yellow)$/.test(kind);
const shieldProficient = actor => actor.system.isNPC || CONFIG.DND5E.armorProficienciesMap.shield === true || actor.system.traits?.armorProf?.value?.has(CONFIG.DND5E.armorProficienciesMap.shield);
function validReceipt(owner, nonce) {
  const seen = new Set();
  for (let depth = 0; depth < 8; depth++) {
    const actor = resolve(owner), r = receipts(actor)[nonce], id = `${owner}:${nonce}`;
    if (!r || r.paid !== 1 || seen.has(id)) return false;
    seen.add(id); if (!r.parent) return r;
    ({ owner, receipt: nonce } = r.parent);
  }
  return false;
}
function paid(activity, updates, cost = 1) {
  const item = activity.item, u = updates.item.find(i => i._id === item.id);
  return updates.delete.includes(item.id) || u?.["system.uses.spent"] === item.system.uses.spent + cost
    || (cost === 1 && u?.["system.quantity"] === item.system.quantity - 1 && u?.["system.uses.spent"] === 0);
}
function currentReceipt(item) {
  const loan = item?.flags?.spikependium?.sweetLoan; if (!loan || !validReceipt(loan.owner, loan.receipt)) return null;
  return receipts(resolve(loan.owner))[loan.receipt];
}
export function sweetActive(actor, kind, { raw = false } = {}) {
  return (actor?.effects ?? []).find(e => {
    if (!e.flags?.spikependium?.sweetStomach && !e.flags?.spikependium?.sweetTrick) return false;
    const nonce = e.flags?.spikependium?.sweetReceipt, r = receipts(actor)[nonce];
    if (!r || r.kind !== kind || !validReceipt(actor.uuid, nonce) || (r.until !== null && game.time.worldTime >= r.until)) return false;
    if (r.stomach && actor.flags.spikependium.sweetCurrent !== nonce) return false;
    return raw ? !e.disabled && !e.duration?.expired : e.active;
  });
}
export function sweetTurtleAC(actor) {
  const e = sweetActive(actor, "shielding-turtle", { raw: true }); if (!e) return false;
  const r = receipts(actor)[e.flags.spikependium.sweetReceipt], shield = actor.items.get(r.shield);
  return !!shield && shield.system.type?.value === "shield" && !shield.system.equipped && !shield.system.container
    && shieldProficient(actor) && !actor.items.some(i => i.system.type?.value === "shield" && i.system.equipped);
}
export function canUseGriffonSweet(activity, config = {}) {
  const root = rootActivity(activity, config), item = root.item, flags = root.flags?.spikependium ?? {}, loan = item.flags?.spikependium?.sweetLoan;
  if (["feat:griffon-sweet-bubble", "consumable:griffon-cookie-paper"].includes(activity.item.system.sourceItem) && root === activity) return false;
  if (key(activity.item) === "spell:gs1:levibubble" && (!loan || item.flags.spikependium.sweetTemplate !== "bubble")) return false;
  const origin = item.flags?.spikependium?.sweetOrigin;
  if (origin && !validReceipt(origin.owner, origin.receipt)) return false;
  if (!item.flags?.spikependium?.sweetTemplate) return;
  const r = currentReceipt(item); if (!r) { ui.notifications.warn("Сначала оплатите исходный расходник; прямой импорт служебного шаблона не даёт его эффект."); return false; }
  if (item.flags.spikependium.sweetTemplate === "paper") {
    if (flags.sweetCookieCharge) {
      if (!game.user.isGM || item.flags.spikependium.sweetCookieEnabled || !resolve(loan.owner)?.statuses.has("dead")) return false;
    } else if (!item.flags.spikependium.sweetCookieEnabled || game.time.worldTime >= item.flags.spikependium.sweetCookieUntil) return false;
    return;
  }
  if (loan.owner !== activity.actor.uuid) return false;
  if (flags.sweetRetry) return r.saveRequired && !r.saveCompleted ? undefined : false;
  if (r.until !== null && (r.kind === "recovery" ? game.time.worldTime !== r.start : game.time.worldTime >= r.until)) return false;
  if (r.kind === "recovery" && (r.closed || combatKey() !== r.combat)) return false;
  if (r.kind === "bubble" && game.time.worldTime < r.ready) { ui.notifications.warn("Ещё не прошла минута жевания в мировом времени."); return false; }
  if (flags.sweetKind && (!sweetActive(activity.actor, flags.sweetKind) || (flags.sweetCrush && r.crushed))) return false;
  if (flags.sweetPact && (activity.actor.system.spells.pact?.level !== loan.pactLevel || loan.pactLevel > 5)) return false;
}
export function canConsumeGriffonSweet(activity, config, message) {
  if (canUseGriffonSweet(activity, config) === false) return false;
  const root = rootActivity(activity, config);
  if (!root.flags?.spikependium?.sweetCookieCast) return;
  const loan = root.item.flags.spikependium.sweetLoan, targets = message.data?.system?.targets ?? [];
  if (targets.length !== 1 || targets[0].actor !== loan.owner) { ui.notifications.warn("Этот свиток действует только на адресата предсказания; укажите его единственной целью."); return false; }
}
export function prepareSweetDialog(activity, config, dialog) {
  if (activity.flags?.spikependium?.sweetEat !== "shielding-turtle") return;
  const Base = dialog.applicationClass; dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      const choices = { "": "Без щита за спиной — только штраф скорости" };
      for (const i of this.actor.items) if (i.system.type?.value === "shield" && !i.system.equipped && !i.system.container) choices[i.id] = i.name;
      context.fields.push({ name: "spikependium.sweetShield", value: this.config.spikependium?.sweetShield ?? "", field: new foundry.data.fields.StringField({ label: "Подтвердите щит за спиной", choices }) });
      return context;
    }
  };
}
async function cloneTemplate(uuid) {
  const doc = await fromUuid(uuid);
  if (!doc || !uuid.startsWith("Compendium.spikependium.") || !doc.flags.spikependium?.sweetTemplate) throw Error("Missing sweet template");
  const data = doc.toObject(); delete data._key; data._id = foundry.utils.randomID(); data.folder = null; data.sort = 0;
  data._stats = { ...data._stats, compendiumSource: doc.uuid, duplicateSource: null }; return data;
}
async function roll(formula, activity, updates) {
  const r = await new CONFIG.Dice.BasicRoll(formula, activity.getRollData()).evaluate();
  if (!Number.isFinite(r.total)) throw Error("Invalid sweet roll"); updates.rolls.push(r); return r.total;
}
export async function prepareSweetUpdates(activity, config, updates) {
  pending.delete(activity);
  const root = rootActivity(activity, config), rootFlags = root.flags?.spikependium ?? {}, loan = root.item.flags?.spikependium?.sweetLoan;
  if (loan && (rootFlags.sweetCredit || rootFlags.sweetCrush || root.type === "cast" || root.item.flags.spikependium.sweetTemplate === "breath")) {
    const cost = Number(root.consumption.targets.find(t => t.type === "itemUses" && !t.target)?.value);
    if (canUseGriffonSweet(activity, config) === false || !Number.isInteger(cost) || cost < 1 || cost > 5 || !paid(root, updates, cost)) return false;
  }
  const flags = activity.flags?.spikependium ?? {}, item = activity.item, actor = activity.actor;
  if (flags.sweetCookieCharge) {
    if (canUseGriffonSweet(activity, config) === false) return false;
    let update = updates.item.find(i => i._id === item.id); if (!update) updates.item.push(update = { _id: item.id });
    update["flags.spikependium.sweetCookieEnabled"] = 1; update["flags.spikependium.sweetCookieUntil"] = game.time.worldTime + 60; return updates;
  }
  if (flags.sweetCrush) {
    const nonce = loan.receipt, amount = await roll("1d6", activity, updates), path = receiptPath(nonce);
    updates.actor[`${path}.crushed`] = 1; updates.actor[`${path}.until`] = game.time.worldTime + 60;
    pending.set(activity, { actor: actor.uuid, nonce, kind: "peppermince", operation: "crush", amount }); return updates;
  }
  if (!flags.sweetEat) return updates;
  if (!actor.isOwner || !paid(activity, updates)) return false;
  const kind = flags.sweetEat, nonce = foundry.utils.randomID(), now = game.time.worldTime;
  const frame = { actor: actor.uuid, nonce, kind, operation: "eat", profile: flags.sweetProfile ?? null, extraProfile: flags.sweetExtraProfile ?? null };
  const receipt = { paid: 1, kind, start: now, until: flags.sweetDuration ? now + flags.sweetDuration : kind === "breath" ? now + 60 : kind === "recovery" ? now : isStomach(kind) ? now + 60 : null, stomach: isStomach(kind), crushed: 0, ready: kind === "bubble" ? now + 60 : now, combat: combatKey() };
  const parent = item.flags?.spikependium?.sweetOrigin ?? (item.flags?.spikependium?.sweetTemplate === "tricky" ? item.flags.spikependium.sweetLoan : null);
  if (parent) receipt.parent = { owner: parent.owner, receipt: parent.receipt };
  if (kind === "shielding-turtle") {
    receipt.shield = config.spikependium?.sweetShield ?? "";
    if (receipt.shield) {
      const s = actor.items.get(receipt.shield);
      if (!s || s.system.type.value !== "shield" || s.system.equipped || s.system.container || !shieldProficient(actor)) return false;
    }
  }
  const previous = actor.flags.spikependium?.sweetCurrent;
  receipt.saveRequired = receipt.stomach && !!previous && !!sweetActive(actor, receipts(actor)[previous]?.kind);
  if (receipt.stomach) {
    updates.actor["flags.spikependium.sweetCurrent"] = nonce;
    for (const old of actor.items.filter(i => i.flags.spikependium?.sweetLoan?.receipt === previous && i.flags.spikependium.sweetTemplate === "state")) updates.delete.push(old.id);
  }
  if (kind === "recovery") frame.budget = await roll("1d3 + 3", activity, updates);
  if (kind === "ooze-red") { const hp = await roll("1d8 + 4", activity, updates); updates.actor["system.attributes.hp.temp"] = Math.max(actor.system.attributes.hp.temp, hp); }
  if (kind === "cookie") {
    const prior = actor.flags.spikependium?.doomsdayFate;
    frame.fate = Number.isInteger(prior) && prior >= 1 && prior <= 20 ? prior : await roll("1d20", activity, updates);
    updates.actor["flags.spikependium.doomsdayFate"] = frame.fate;
  }
  if (kind === "tricky") {
    frame.trick = await roll("1d20", activity, updates); receipt.kind = frame.kind = `trick-${frame.trick}`; receipt.until = now + 60;
    frame.profile = item.effects.find(e => e.flags.spikependium?.sweetTrick === frame.trick)?.id;
    receipt.saveRequired = frame.trick === 1; receipt.gag = frame.trick === 1;
  }
  if (kind === "ooze-open") {
    for (let n = 0; n < 4; n++) {
      const color = await roll("1d8", activity, updates), uuid = flags.sweetBeanTemplates?.[color - 1], doc = uuid && await fromUuid(uuid);
      if (doc?.type !== "consumable" || !key(doc)?.startsWith("item:gs1:oozebean-")) throw Error("Missing fixed-colour bean");
      const data = doc.toObject(); delete data._key; data._id = foundry.utils.randomID(); data.folder = null; data.sort = 0;
      data.flags.spikependium.sweetOrigin = { owner: actor.uuid, receipt: nonce }; updates.create.push(data);
    }
  } else if (flags.sweetGrant) {
    const data = await cloneTemplate(flags.sweetGrant), role = data.flags.spikependium.sweetTemplate;
    data.flags.spikependium.sweetLoan = { owner: actor.uuid, receipt: nonce, kind: receipt.kind };
    data.system.source = item.toObject().system.source;
    if (role === "recovery") {
      data.system.uses.max = String(frame.budget); const pact = actor.system.spells.pact;
      for (const a of Object.values(data.system.activities)) if (a.flags?.spikependium?.sweetPact) {
        if (!(pact?.level >= 1 && pact.level <= 5 && pact.max > 0)) { delete data.system.activities[a._id]; continue; }
        a.consumption.targets[0].value = String(pact.level); data.flags.spikependium.sweetLoan.pactLevel = pact.level;
      }
    } else if (role === "breath") {
      const b = flags.sweetBreath; if (!["acid", "cold", "fire", "lightning", "poison"].includes(b?.type) || ![2, 3, 4].includes(b.dice) || ![13, 15, 16].includes(b.dc)) throw Error("Invalid dragon breath");
      for (const a of Object.values(data.system.activities)) { a.save.dc.formula = String(b.dc); a.damage.parts[0].number = b.dice; a.damage.parts[0].types = [b.type]; }
    } else if (role === "tricky") { data.system.uses.max = String(await roll("5d8 + 10", activity, updates)); data.system.weight.value = 0.5 + Number(data.system.uses.max) * 0.01; }
    else if (role === "state") {
      data.name = `Эффект: ${item.name}`; data.system.uses.max = kind === "peppermince" ? "1" : "";
      for (const a of Object.values(data.system.activities)) if (a.flags.spikependium?.sweetKind && a.flags.spikependium.sweetKind !== receipt.kind) delete data.system.activities[a._id];
    } else if (role === "paper") {
      const theme = data.flags.spikependium.sweetFates[frame.fate - 1]; data.system.description.value += `<p>Адресат: @UUID[${actor.uuid}]. Предсказание ${frame.fate}: ${foundry.utils.escapeHTML(theme)}.</p>`;
      delete data.flags.spikependium.sweetFates;
    }
    updates.create.push(data);
  }
  for (const [field, value] of Object.entries(receipt)) updates.actor[`${receiptPath(nonce)}.${field}`] = value;
  pending.set(activity, frame); return updates;
}
export function recordSweetUse(activity, config, message) {
  const source = pending.has(activity) ? activity : rootActivity(activity, config), frame = pending.get(source); pending.delete(source); if (!frame) return;
  foundry.utils.setProperty(message, "data.flags.spikependium.sweetUse", frame);
  if (frame.operation !== "eat") return;
  const deltas = ((message.data.system ??= {}).deltas ??= {}).actor ??= [], path = `${receiptPath(frame.nonce)}.paid`;
  if (!deltas.some(d => d.keyPath === path)) deltas.push({ keyPath: path, delta: 1 });
}
async function nativeProfile(effect, actor, activity, message, nonce, seconds) {
  const tray = new dnd5e.applications.components.EffectApplicationElement(); tray.chatMessage = message;
  const result = await tray._prepareEffectData(effect, actor); result.data.start = ActiveEffect.implementation.getEffectStart();
  result.data.duration = { ...result.data.duration, value: seconds ?? result.data.duration.value, expired: false };
  result.data.flags.spikependium ??= {}; result.data.flags.spikependium.sweetReceipt = nonce;
  return { action: result.action, documentName: "ActiveEffect", parent: actor, ...(result.action === "create" ? { data: [result.data] } : { updates: [result.data] }) };
}
async function stomachSave(actor, nonce, activity, message) {
  const r = receipts(actor)[nonce]; if (!r?.saveRequired || r.saveCompleted) return;
  const lock = `${actor.uuid}:${nonce}`; if (saving.has(lock)) return;
  saving.add(lock);
  try {
  let result = r.saveResult;
  if (!result) {
    const rolls = await actor.rollSavingThrow({ ability: "con", target: 13 }, { configure: false }, { data: { flavor: r.gag ? "Коварная конфета: Телосложение СЛ 13" : "Расстройство желудка: Телосложение СЛ 13" } });
    if (!rolls?.length) return;
    result = rolls[0].isFailure ? -1 : 1; await actor.update({ [`${receiptPath(nonce)}.saveResult`]: result });
  }
  if (result < 0 && r.gag) ui.notifications.warn("Коварная конфета: потратьте действие следующего хода на рвотные позывы и шатание.");
  if (result < 0 && !r.gag && !actor.system.traits?.ci?.value?.has("poisoned")) {
    const state = actor.items.find(i => i.flags.spikependium?.sweetLoan?.receipt === nonce && i.flags.spikependium.sweetTemplate === "state"), e = state?.effects.find(e => e.statuses.has("poisoned"));
    if (!e) throw Error("Missing stomach poison");
    const op = await nativeProfile(e, actor, activity, message, nonce, 60); op[op.action === "create" ? "data" : "updates"][0].flags.spikependium.sweetPoison = true;
    await foundry.documents.modifyBatch([op]);
  }
  await actor.update({ [`${receiptPath(nonce)}.saveCompleted`]: 1 });
  } finally { saving.delete(lock); }
}
export async function finishSweetUse(activity, results) {
  const actor = activity.actor, message = results?.message; if (!actor?.isOwner || !message) return;
  const frame = message.flags?.spikependium?.sweetUse;
  if (!frame && !actor.flags?.spikependium?.sweetReceipts) return;
  for (const i of actor.items ?? []) {
    const loan = i.flags.spikependium?.sweetLoan, r = loan && receipts(actor)[loan.receipt];
    if (r?.kind === "recovery" && loan.receipt !== frame?.nonce && !activity.flags?.spikependium?.sweetCredit) await actor.update({ [`${receiptPath(loan.receipt)}.closed`]: 1 });
  }
  const loan = rootActivity(activity).item.flags?.spikependium?.sweetLoan;
  if (activity.flags?.spikependium?.sweetRetry && loan) { await stomachSave(actor, loan.receipt, activity, message); return; }
  if (!frame || frame.actor !== actor.uuid || message.flags?.spikependium?.sweetApplied || finishing.has(message.uuid)) return;
  finishing.add(message.uuid);
  try {
    const r = receipts(actor)[frame.nonce]; if (!r || !validReceipt(actor.uuid, frame.nonce)) return;
    if (frame.operation === "crush") {
      if (!r.crunchDamageApplied) { await actor.applyDamage([{ type: "piercing", value: frame.amount }], { originatingMessage: message }); await actor.update({ [`${receiptPath(frame.nonce)}.crunchDamageApplied`]: 1 }); }
      const remaining = Math.max(0, r.until - game.time.worldTime);
      for (const e of actor.effects.filter(e => e.flags.spikependium?.sweetReceipt === frame.nonce && !e.flags.spikependium?.sweetPoison)) await e.update({ duration: { value: remaining, units: "seconds", expired: remaining === 0 }, start: ActiveEffect.implementation.getEffectStart() });
    } else if (frame.profile && (r.until === null || r.until > game.time.worldTime)) {
      const profile = activity.item.effects.get(frame.profile); if (!profile) throw Error("Missing sweet profile");
      const ops = [await nativeProfile(profile, actor, activity, message, frame.nonce, r.until === null ? null : r.until - game.time.worldTime)];
      if (frame.extraProfile) ops.push(await nativeProfile(activity.item.effects.get(frame.extraProfile), actor, activity, message, frame.nonce, r.until - game.time.worldTime));
      const updated = new Set(ops.flatMap(op => op.updates?.map(d => d._id) ?? []));
      const old = actor.effects.filter(e => !updated.has(e.id) && !e.flags.spikependium?.sweetPoison && e.flags.spikependium?.sweetReceipt && (r.stomach ? receipts(actor)[e.flags.spikependium.sweetReceipt]?.stomach : receipts(actor)[e.flags.spikependium.sweetReceipt]?.kind === r.kind)).map(e => e.id);
      if (old.length) ops.unshift({ action: "delete", documentName: "ActiveEffect", parent: actor, ids: old });
      await foundry.documents.modifyBatch(ops);
    }
    await stomachSave(actor, frame.nonce, activity, message);
    if (r.kind === "recovery") actor.items.find(i => i.flags.spikependium?.sweetLoan?.receipt === frame.nonce)?.sheet?.render(true);
    await message.update({ "flags.spikependium.sweetApplied": true });
  } finally { finishing.delete(message.uuid); }
}
export async function sweetUse(wrapped, ...args) {
  const kind = this.flags?.spikependium?.sweetEat, lock = (kind && isStomach(kind)) || this.flags?.spikependium?.sweetCrush ? this.actor?.uuid : null;
  if (lock && using.has(lock)) return;
  if (lock) using.add(lock);
  try { return await wrapped(...args); } finally { if (lock) using.delete(lock); }
}
function advantage(config) {
  for (const r of config.rolls) { r.options ??= {}; r.options.disadvantage ||= r.options.advantageMode === -1; r.options.advantage = true; if (r.options.advantageMode !== undefined) r.options.advantageMode = r.options.disadvantage ? 0 : 1; }
}
export function prepareSweetSave(config, _dialog, message) {
  if (!sweetActive(config.subject, "ooze-gray")) return;
  const activity = game.messages.get(message.data?.system?.origin)?.getAssociatedActivity();
  const profiles = activity?.applicableEffects ?? activity?.effects?.map(e => activity.item.effects.get(e._id)) ?? [];
  if (profiles.some(e => e?.statuses?.has("charmed") || e?.statuses?.has("frightened"))) advantage(config);
}
export function prepareSweetCheck(config, _dialog, message) {
  const activity = game.messages.get(message.data?.system?.origin)?.getAssociatedActivity(), actor = config.subject;
  if (activity?.flags?.spikependium?.sweetEscape && sweetActive(actor, "ooze-green") && ["grappled", "restrained"].some(s => actor.statuses.has(s))) advantage(config);
  if (activity?.flags?.spikependium?.sweetSinging && sweetActive(actor, "trick-17")) {
    const prof = actor.system.attributes.prof * (actor.system.skills.prf.value >= 1 ? 2 : 1);
    if (!Number.isFinite(prof)) return;
    for (const r of config.rolls) { r.parts = r.parts.filter(p => p !== "@prof" && p !== "@spikependiumSugarSinging"); r.parts.push("@spikependiumSugarSinging"); (r.data ??= {}).spikependiumSugarSinging = prof; }
  }
}
export function prepareSweetDamage(config) {
  for (const r of config.rolls) { r.parts = r.parts.filter(p => p !== "@spikependiumPeppermince"); if (r.data) delete r.data.spikependiumPeppermince; }
  const a = config.subject, e = sweetActive(a?.actor, "peppermince"), nonce = e?.flags.spikependium.sweetReceipt;
  if (!nonce || !receipts(a.actor)[nonce].crushed || (a.getActionType ? !["mwak", "rwak"].includes(a.getActionType()) : !["weapon", "unarmed"].includes(a.attack?.type.classification))) return;
  const r = config.rolls.find(r => ["piercing", "slashing"].includes(r.options?.type));
  if (r) { r.parts.push("@spikependiumPeppermince"); (r.data ??= {}).spikependiumPeppermince = 2; }
}
export function guardSweetMissiles(actor, amount, _updates, options) {
  const a = options.originatingMessage?.getOriginatingMessage?.()?.getAssociatedActivity();
  if (amount > 0 && sweetActive(actor, "ooze-yellow") && a?.item.type === "spell" && a.item.system.identifier === "magic-missile") return false;
}
let cleaning = false;
export async function cleanSweets() {
  if (cleaning || (game.users.activeGM && !game.user.isActiveGM)) return;
  cleaning = true;
  try {
    const actors = new Map([...(game.actors ?? []), ...[...(game.scenes ?? [])].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean).map(a => [a.uuid, a]));
    for (const actor of actors.values()) {
      if (!actor.isOwner) continue;
      const remove = [];
      for (const i of actor.items) {
        const origin = i.flags.spikependium?.sweetOrigin, loan = i.flags.spikependium?.sweetLoan, role = i.flags.spikependium?.sweetTemplate;
        if (origin && !validReceipt(origin.owner, origin.receipt)) { remove.push(i.id); continue; }
        if (!loan) continue;
        const r = currentReceipt(i);
        if (!r || (role === "paper" && i.flags.spikependium.sweetCookieEnabled && game.time.worldTime >= i.flags.spikependium.sweetCookieUntil)) { remove.push(i.id); continue; }
        if (role === "paper" || role === "tricky") continue;
        if (role === "state" && r.saveRequired && !r.saveCompleted) continue;
        if ((r.until !== null && (r.kind === "recovery" ? game.time.worldTime !== r.start : game.time.worldTime >= r.until))
          || (r.kind === "recovery" && (r.closed || combatKey() !== r.combat)) || (role === "bubble" && i.system.uses.spent >= 1)) remove.push(i.id);
      }
      if (remove.length) await actor.deleteEmbeddedDocuments("Item", remove);
      const effects = actor.effects.filter(e => {
        const nonce = e.flags.spikependium?.sweetReceipt; if (!nonce) return false;
        const r = receipts(actor)[nonce];
        return !r || !validReceipt(actor.uuid, nonce)
          || (e.flags.spikependium.sweetPoison && Number.isFinite(e.start?.time) && game.time.worldTime >= e.start.time + Number(e.duration.value))
          || (!e.flags.spikependium.sweetPoison && ((r.until !== null && game.time.worldTime >= r.until) || (r.stomach && actor.flags.spikependium.sweetCurrent !== nonce)));
      }).map(e => e.id);
      if (effects.length) await actor.deleteEmbeddedDocuments("ActiveEffect", effects);
    }
  } finally { cleaning = false; }
}
