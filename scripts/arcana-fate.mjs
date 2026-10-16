import { tokensDistance } from "./effects.mjs";
import { reactionAvailable } from "./reactions.mjs";
import { attackHitTargets } from "./companions.mjs";

const captured = new WeakMap(), prepared = new WeakMap(), rolled = new WeakMap(), running = new Set(), again = new Set();
// shortcut: simultaneous resource/temporary-HP updates on different clients use native non-atomic saves; coordinate such uses with the GM.
const supported = a => a?.type === "utility" && a.item?.flags.spikependium?.key === "spell:au-fates-intertwined"
  && a.flags.spikependium?.fatesIntertwined && a.activation.type === "reaction";
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const signature = card => JSON.stringify(card.rolls.map(r => r.toJSON()));
const turn = () => game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : null;
const visible = (card, user) => user && (user.isGM || !card.blind && (!card.whisper?.length || card.whisper.includes(user.id) || card.author?.id === user.id));
const authority = origin => game.users.activeGM ? game.user.isActiveGM : origin.author?.id === game.user.id;
function d20(card) {
  return ["check", "save", "attack"].includes(card?.type) && !(card.type === "check" && card.system.type === "initiative") && card.rolls?.length === 1
    && card.rolls[0] instanceof CONFIG.Dice.D20Roll && card.rolls[0]._evaluated && card.rolls[0].validD20Roll;
}
function success(card) {
  if (card.system.forceSuccess) return true;
  if (card.type === "attack") {
    if (card.system.targets?.length !== 1 || !Number.isFinite(card.system.targets[0].ac)) return;
    if (card.system.evaluatedTargets?.[0]?.isMiss) return false;
    return attackHitTargets(card).length ? true : undefined;
  }
  if (Number.isNumeric(card.rolls[0].options.target)) return !card.rolls[0].isFailure;
}
function fresh(card) {
  const stamp = card.flags.spikependium?.fateWindow;
  return stamp?.time === game.time.worldTime && stamp.turn === turn()
    && [...game.messages].filter(m => d20(m) && (m===card||!m.flags.spikependium?.painCastCheck)
      && m.getAssociatedActor()?.uuid === card.getAssociatedActor()?.uuid).at(-1) === card;
}
function inRange(a, card) {
  const source = a.getUsageToken?.(), token = card.getAssociatedToken?.();
  const distance = source && token && tokensDistance(source, token);
  return source?.actor?.uuid === a.actor.uuid && token?.actor?.uuid === card.getAssociatedActor()?.uuid
    && source.parent === token.parent && distance != null && distance <= 60;
}
function choices(a) {
  return a.actor?.isOwner && reactionAvailable(a.actor) ? [...game.messages].filter(card => d20(card) && fresh(card)
    && card.getAssociatedActor()?.system.isCreature && card.author && card.getAssociatedActor().testUserPermission(card.author, "OWNER")
    && visible(card, game.user) && (game.user.isGM || card.system.displayResult !== false) && inRange(a, card)
    && success(card) !== true && (card.type !== "attack" || card.system.targets?.length === 1 && Number.isFinite(card.system.targets[0].ac))) : [];
}
export function recordFateWindow(card) {
  if (["check", "save", "attack"].includes(card.type)) card.updateSource({ "flags.spikependium.fateWindow": { time: game.time.worldTime, turn: turn() } });
}
export function prepareFateDialog(a, config, dialog) {
  if (!supported(a)) return;
  const cards = choices(a); config.spikependium = { ...config.spikependium, fateRoll: config.spikependium?.fateRoll ?? cards.at(-1)?.uuid ?? "" };
  const Base = dialog.applicationClass; dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      context.fields.push({ name: "spikependium.fateRoll", value: this.config.spikependium.fateRoll,
        field: new foundry.data.fields.StringField({ label: "Переплетение судьбы: исходный провал", choices: { "": "Выберите свежий бросок",
          ...Object.fromEntries(cards.map(c => [c.uuid, `${c.getAssociatedActor().name}: ${c.rolls[0].total}`])) } }) },
      { name: "spikependium.fateConsent", value: this.config.spikependium?.fateConsent ?? false,
        field: new foundry.data.fields.BooleanField({ label: "Вижу существо; оно согласно перебросить и использовать новый результат" }), input: context.inputs.createCheckboxInput },
      { name: "spikependium.fateDC", value: this.config.spikependium?.fateDC ?? null,
        field: new foundry.data.fields.NumberField({ label: "СЛ по решению Мастера, если она отсутствует в исходной карточке", nullable: true, integer: true, min: 1 }) });
      context.hasConsumption = true; return context;
    }
  };
}
export function captureFate(a, config, message) {
  captured.delete(a); if (!supported(a)) return;
  const card = resolve(config.spikependium?.fateRoll), actor = card?.getAssociatedActor?.();
  const dc = Number.isNumeric(card?.rolls?.[0]?.options.target) ? Number(card.rolls[0].options.target) : config.spikependium?.fateDC;
  if (!choices(a).includes(card) || config.spikependium?.fateConsent !== true
    || success(card) === undefined && (!Number.isInteger(dc) || dc <= card.rolls[0].total)
    || message.create === false || !game.users.activeGM && (!actor.isOwner || !card.canUserModify(game.user, "update"))) {
    ui.notifications.warn("Переплетение судьбы: нужны свежий провал, токены в 60 футах, видимость, согласие и Мастер либо права на карточку и получателя."); return false;
  }
  captured.set(a, { card: card.uuid, signature: signature(card), caster: a.actor.uuid, target: actor.uuid, activity: a.uuid,
    sourceToken: a.getUsageToken().uuid, targetToken: card.getAssociatedToken().uuid, time: game.time.worldTime, turn: turn(),
    consent: true, dc: card.type === "attack" ? card.system.targets[0].ac : dc });
  if (card.whisper?.length || card.blind) { message.data ??= {}; message.data.whisper = [...(card.whisper ?? [])]; message.data.blind = !!card.blind; }
  if (a.getUsageToken().hidden || card.getAssociatedToken().hidden) {
    message.data ??= {}; message.data.whisper = game.users.filter(u => u.isGM).map(u => u.id); message.data.blind = true;
  }
}
export function prepareFateUpdates(a, _config, updates) {
  prepared.delete(a); if (!supported(a)) return updates;
  const r = captured.get(a), card = resolve(r?.card), reaction = updates.actor["flags.spikependium.reactionId"];
  if (!r || !choices(a).includes(card) || signature(card) !== r.signature || !reaction
    || updates.actor[`flags.spikependium.reactionCasts.${reaction}`]?.spent !== 1
    || r.sourceToken !== a.getUsageToken()?.uuid || r.targetToken !== card.getAssociatedToken()?.uuid) return false;
  const event = foundry.utils.randomID(), receipt = { ...r, reaction, event };
  updates.actor[`flags.spikependium.fateCasts.${event}`] = { ...receipt, active: 1 }; prepared.set(a, receipt); return updates;
}
export function recordFateConsumption(a, _config, message) {
  const r = prepared.get(a); if (!r || a.actor.flags.spikependium?.fateCasts?.[r.event]?.active !== 1) return;
  const path = `flags.spikependium.fateCasts.${r.event}.active`, deltas = message.data.system.deltas.actor ??= [];
  if (!deltas.some(d => d.keyPath === path)) deltas.push({ keyPath: path, delta: 1 });
}
export function recordFateUsage(a, message) {
  const r = prepared.get(a); prepared.delete(a);
  if (r && a.actor.flags.spikependium?.fateCasts?.[r.event]?.active === 1) {
    foundry.utils.setProperty(message, "data.flags.spikependium.fateCast", r);
    foundry.utils.setProperty(message, "data.system.targets", [{ actor: r.target, token: r.targetToken }]);
  }
}
function receiptFor(origin) {
  const r = origin?.flags.spikependium?.fateCast, caster = resolve(r?.caster), card = resolve(r?.card), a = origin?.getAssociatedActivity?.();
  const record = caster?.flags.spikependium?.fateCasts?.[r?.event], target = resolve(r?.target);
  if (origin?.type !== "usage" || !supported(a) || a.uuid !== r?.activity || a.actor.uuid !== r.caster || !record || record.active !== 1
    || !target || !d20(card) || !origin.author || !caster.testUserPermission(origin.author, "OWNER") || !visible(card, origin.author)
    || card.getAssociatedActor()?.uuid !== r.target || card.getAssociatedToken()?.uuid !== r.targetToken
    || card.getAssociatedToken()?.actor?.uuid !== r.target || r.consent !== true || !Number.isFinite(r.dc) || !/^[A-Za-z0-9]{16}$/.test(r.event)
    || JSON.stringify(r) !== JSON.stringify(Object.fromEntries(Object.entries(record).filter(([k]) => k !== "active")))
    || origin.flags.spikependium?.reaction?.id !== r.reaction
    || !origin.system.deltas?.actor?.some(d => d.keyPath === `flags.spikependium.fateCasts.${r.event}.active` && d.delta === 1)) return;
  return { r, caster, card, target };
}
export async function fateReroll(base, dc) {
  const options = { ...base.options, target: dc, configured: false, advantage: true, disadvantage: !!base.options.disadvantage || base.options.advantageMode === -1 };
  delete options.advantageMode;
  return new CONFIG.Dice.D20Roll(base.formula, base.data, options).evaluate();
}
async function apply(origin) {
  const info = receiptFor(origin); if (!info || !authority(origin)) return;
  const { r, card, target } = info;
  if (!card.canUserModify(game.user, "update") || !target.isOwner) return;
  let saved = origin.flags.spikependium.fateResult ?? rolled.get(origin);
  if (!saved) {
    if (signature(card) !== r.signature) { ui.notifications.warn("Исходный бросок изменился. Проверьте Переплетение судьбы вручную."); return; }
    if (origin.flags.spikependium.fateStarted) {
      ui.notifications.warn("Перебросок был начат, но его результат не сохранился. Мастер разрешает этот исход вручную; автоматического повторного броска нет."); return;
    }
    await origin.setFlag("spikependium", "fateStarted", true);
    const roll = await fateReroll(card.rolls[0], r.dc);
    const temp = await new CONFIG.Dice.BasicRoll("6d10").evaluate();
    saved = { roll: roll.toJSON(), temp: temp.toJSON(), signature: JSON.stringify([roll.toJSON()]) };
    rolled.set(origin, saved);
  }
  if (!origin.flags.spikependium.fateResult) {
    await origin.setFlag("spikependium", "fateResult", saved);
    rolled.delete(origin);
  }
  const state = card.flags.spikependium?.fateReplacement;
  if (state?.origin !== origin.uuid) {
    if (signature(card) !== r.signature) { ui.notifications.warn("Исходный бросок изменился. Сохранённый перебросок находится в карточке Переплетения судьбы."); return; }
    await card.update({ rolls: [CONFIG.Dice.D20Roll.fromData(saved.roll)], "flags.spikependium.fateReplacement": { origin: origin.uuid, expected: saved.signature } });
  } else if (state.expected !== signature(card)) {
    // shortcut: later independent rerolls need GM reconciliation; never overwrite a newer result or reclaim spent temporary HP.
    ui.notifications.warn("Переброшенный результат изменён другим способом; временные хиты сверяет Мастер."); return;
  }
  const result = success(card);
  if (result === undefined) return;
  if (result && !target.flags.spikependium?.fateTemp?.[origin.id]) {
    const temp = CONFIG.Dice.BasicRoll.fromData(saved.temp);
    if (!temp._evaluated || !Number.isInteger(temp.total) || temp.total < 6 || temp.total > 60) throw Error("Некорректный бросок временных хитов");
    if (!game.messages.some(m => m.flags.spikependium?.fateTempRoll === origin.uuid && (m.author?.isGM || m.author?.id === origin.author.id)))
      await CONFIG.Dice.BasicRoll.toMessage([temp], { type: "generic", system: { origin: origin.id },
        speaker: ChatMessage.getSpeaker({ actor: target, token: resolve(r.targetToken) }), flavor: "Переплетение судьбы: временные хиты",
        flags: { spikependium: { fateTempRoll: origin.uuid } }, whisper: [...(origin.whisper ?? [])], blind: !!origin.blind },
      { rollMode: origin.blind || origin.whisper?.length ? "gm" : "public" });
    await target.update({ "system.attributes.hp.temp": Math.max(target.system.attributes.hp.temp ?? 0, temp.total),
      [`flags.spikependium.fateTemp.${origin.id}`]: { source: origin.uuid, value: temp.total } });
  }
  if (!origin.flags.spikependium.fateResolved) await origin.setFlag("spikependium", "fateResolved", true);
}
export async function resumeFate(document) {
  const sources = [...game.messages].filter(m => m.flags.spikependium?.fateCast && authority(m)
    && (!document || document.uuid === m.uuid || document.uuid === m.flags.spikependium.fateCast.card
      || document.uuid === m.flags.spikependium.fateCast.caster || document.uuid === m.flags.spikependium.fateCast.target
      || document.documentName === "ActorDelta" && document.parent?.actor?.uuid === m.flags.spikependium.fateCast.caster));
  for (const origin of sources) {
    const key = origin.flags.spikependium.fateCast.card;
    if (running.has(key)) { again.add(key); continue; } running.add(key);
    try { do { again.delete(key); await apply(origin); } while (again.delete(key)); }
    finally { running.delete(key); }
  }
}
export function fateDeltaLabel(wrapped, ...args) {
  const data = wrapped(...args);
  if (/^flags\.spikependium\.fateCasts\.[A-Za-z0-9]{16}\.active$/.test(this.keyPath)) data.label = "Переплетение судьбы";
  return data;
}
export function fateError(error) {
  console.error("Spikependium: Переплетение судьбы", error);
  ui.notifications.error("Переплетение судьбы не завершено. Проверьте оплаченную карточку; при повторном подключении обработка продолжится без новой ячейки.");
}
