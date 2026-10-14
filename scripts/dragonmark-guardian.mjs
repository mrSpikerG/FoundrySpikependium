import { attackHitTargets } from "./companions.mjs";
import { tokensDistance, incapacitated } from "./effects.mjs";
import { occupied } from "./push.mjs";
import { reactionAvailable } from "./reactions.mjs";
import { attackSource, attackSignature, guardianRecords } from "./attack-source.mjs";

const KEY = "feat:sentinel", MOD = "tIDVcbZ4hC7dTkU1", ACTION = "spikependiumGuardian";
const running = new Map(), using = new Map(), applying = new WeakMap(), resolving = new Set(), finishing = new Set();
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const turn = () => game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : null;
const position = t => Object.fromEntries(["x", "y", "elevation", "level", "width", "height", "depth", "shape"].map(k => [k, t[k]]));
const same = (t, p) => t && p && Object.entries(position(t)).every(([k, v]) => p[k] === v);
const moving = t => ["planned", "pending", "paused"].includes(t.movement?.state);
const protectedScene = s => !game.users.some(u => !u.isGM && s.canUserModify(u, "update"));
const feature = actor => actor?.items.find(i => i.flags.spikependium?.key === KEY)?.system.activities.get(MOD);
function pair(guardian, victim) {
  const activity = feature(guardian?.actor), distance = guardian && victim && tokensDistance(guardian, victim);
  return activity?.uses.value > 0 && guardian !== victim && guardian.actor.uuid !== victim.actor?.uuid
    && guardian.actor.system.attributes.hp.value > 0 && !incapacitated(guardian.actor) && reactionAvailable(guardian.actor)
    && victim.actor?.system.isCreature && guardian.parent === victim.parent && guardian.level === victim.level
    && distance != null && distance <= 5 && !moving(guardian) && !moving(victim);
}
export function registerGuardianMovement() {
  CONFIG.Token.movement.actions[ACTION] = { ...CONFIG.Token.movement.actions.blink, label: "Бдительный защитник",
    canSelect: false, teleport: true, measure: false, terrainAction: null, costMultiplier: 0, getCostFunction: () => () => 0 };
}
export function recordGuardianAttack(message) {
  if (message.type !== "attack") return;
  message.updateSource({ "flags.spikependium.guardianAttack": { time: game.time.worldTime, turn: turn(),
    targets: message.system.targets.map(t => ({ token: t.token, from: position(resolve(t.token) ?? {}) })) } });
}
export function canUseGuardian(activity, config = {}) {
  if (activity?.id !== MOD || activity.item.flags.spikependium?.key !== KEY) return true;
  const grant = using.get(activity.actor.uuid);
  if (grant?.activity === activity && config.spikependium?.guardian === grant.id && game.user.isActiveGM) return true;
  if (config.spikependium?.guardianManual === true) return true;
  ui.notifications.warn("Бдительный защитник предлагается после штатного попадания по существу рядом с вами. Для обмена местами и перенаправления удара нужен подключённый Мастер на этой сцене.");
  return false;
}
export function prepareGuardianDialog(activity, config, dialog) {
  if (activity?.id !== MOD || activity.item.flags.spikependium?.key !== KEY || using.get(activity.actor.uuid)?.activity === activity) return;
  const Base = dialog.applicationClass;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      context.fields.push({ name: "spikependium.guardianManual", value: this.config.spikependium?.guardianManual ?? false,
        field: new foundry.data.fields.BooleanField({ label: "Разрешить обмен и перенаправление удара вручную",
          hint: "Используйте при отсутствии Мастера, нескольких бросках в одной карточке или неизвестном КД. Подтверждаю видимое попадание по существу в пределах 5 футов. Реакция и применение расходуются штатно; токены, получателя урона и последствия удара меняет Мастер или владелец." }), input: context.inputs.createCheckboxInput });
      context.hasConsumption = true;
      return context;
    }
  };
}
function swapPlan(guardian, victim) {
  const first = position(guardian), second = position(victim);
  const move = (token, source, target, original) => {
    const size = token.getSize();
    return { ...original, x: target.getCenterPoint().x - size.width / 2, y: target.getCenterPoint().y - size.height / 2,
      elevation: source.elevation, level: source.level };
  };
  return { first, second, toGuardian: move(guardian, second, victim, first), toVictim: move(victim, first, guardian, second) };
}
function validHit(message, record) {
  const victim = resolve(record.victim), guardian = resolve(record.guardian);
  return record.time === game.time.worldTime && record.turn === turn() && record.signature === attackSignature(message)
    && same(victim, record.second) && same(guardian, record.first) && pair(guardian, victim)
    && message.system.targets.some(t => t.token === record.victim && Number.isFinite(t.ac)
      && (message.rolls[record.index].isCritical || (!message.rolls[record.index].isFumble && message.rolls[record.index].total >= t.ac)));
}
function pendingDecision(attack, actor) {
  const snapshot = attack.flags.spikependium?.guardianAttack;
  if (!game.users.activeGM || attack.rolls.length !== 1 || !snapshot || snapshot.time !== game.time.worldTime || snapshot.turn !== turn()) return false;
  return attackHitTargets(attack, { ignoreDefense: true }).some(({ token: victim }) => victim.actor.uuid === actor.uuid && protectedScene(victim.parent)
    && !guardianRecords(attack).some(r => r.victim === victim.uuid)
    && attack.system.targets.filter(t => t.actor === actor.uuid).length === 1
    && same(victim, snapshot.targets.find(t => t.token === victim.uuid)?.from)
    && victim.parent.tokens.some(t => pair(t, victim) && !attack.system.targets.some(target => target.actor === t.actor.uuid)));
}
async function resolveStopped(scene, id, record) {
  const key = `${scene.uuid}:${id}`;
  if (resolving.has(key) || !game.user.isActiveGM || !protectedScene(scene) || !canvas.ready || canvas.scene !== scene) return;
  resolving.add(key);
  try {
    const answer = await foundry.applications.api.DialogV2.input({ window: { title: "Защитник: обмен остановлен" }, rejectClose: false,
      content: '<p>Штатное движение или соединение прервало обмен. Проверьте токены, попадание и последствия регионов. Разрешите удар вручную, затем подтвердите получателя урона. Расходы сохраняются; при необходимости верните их из карточки применения.</p>'
        + '<div class="form-group"><label>Решение Мастера</label><select name="result"><option value="">Оставить нерешённым</option><option value="done">Удар принимает Защитник</option><option value="skip">Удар принимает первоначальная цель</option></select></div>', ok: { label: "Подтвердить" } });
    if (!game.user.isActiveGM || !["done", "skip"].includes(answer?.result)
      || scene.flags.spikependium?.guardianHits?.[id]?.state !== "stopped") return;
    const attack = resolve(record.attack);
    if (answer.result === "done" && (!attack || !record.guardianActor || !record.target || record.signature !== attackSignature(attack))) return;
    await scene.setFlag("spikependium", `guardianHits.${id}.state`, answer.result);
    resolve(record.attack)?.render(false);
  } finally { resolving.delete(key); }
}
async function finish(scene, id, record) {
  const key = `${scene.uuid}:${id}`;
  if (finishing.has(key)) return;
  finishing.add(key);
  try { return await finishMovement(scene, id, record); } finally { finishing.delete(key); }
}
async function finishMovement(scene, id, record) {
  if (!game.user.isActiveGM || !protectedScene(scene) || !game.users.get(record.author)?.isGM || record.state !== "moving"
    || !canvas.ready || canvas.scene !== scene) return;
  const guardian = resolve(record.guardian), victim = resolve(record.victim);
  if (!guardian || !victim || guardian.parent !== scene || victim.parent !== scene
    || guardian.actor.uuid !== record.guardianActor || victim.actor.uuid !== record.victimActor) throw Error("Участники обмена изменились");
  if ([guardian, victim].some(moving)) return;
  const instructions = {};
  for (const [token, from, to] of [[guardian, record.first, record.toGuardian], [victim, record.second, record.toVictim]]) {
    if (same(token, to)) continue;
    if (!same(token, from) || (token.movement?.state === "stopped" && token.movement.updateOptions?.spikependium?.guardian === id)
      || occupied(token, to, [guardian, victim])) {
      await scene.setFlag("spikependium", `guardianHits.${id}.state`, "stopped");
      ui.notifications.warn("Обмен Защитника остановлен. Мастер должен проверить токены и разрешить удар вручную; автоматического повторения нет.");
      await resolveStopped(scene, id, scene.flags.spikependium.guardianHits[id]);
      return;
    }
    instructions[token.id] = { destination: { x: to.x, y: to.y, elevation: to.elevation, level: to.level, action: ACTION, explicit: true } };
  }
  if (Object.keys(instructions).length) {
    const results = await scene.moveTokens(instructions, { autoRotate: false, showRuler: false,
      constrainOptions: { ignoreWalls: true, ignoreCost: true, ignoreTokens: true }, spikependium: { guardian: id } });
    if (Object.keys(instructions).some(tokenId => results[tokenId] !== true)
      || !same(guardian, record.toGuardian) || !same(victim, record.toVictim)) {
      await scene.setFlag("spikependium", `guardianHits.${id}.state`, "stopped");
      ui.notifications.warn("Штатное движение остановило обмен Защитника. Проверьте последствия регионов и разрешите удар вручную.");
      await resolveStopped(scene, id, scene.flags.spikependium.guardianHits[id]);
      return;
    }
  }
  await scene.setFlag("spikependium", `guardianHits.${id}.state`, "done");
  resolve(record.attack)?.render(false);
}
async function choose(message) {
  if (message.type !== "attack" || !game.user.isActiveGM || !canvas.ready || message.rolls.length !== 1) return;
  const activity = message.getAssociatedActivity();
  if (!message.author || !activity?.actor?.testUserPermission(message.author, "OWNER")) return;
  const snapshot = message.flags.spikependium?.guardianAttack;
  if (!snapshot || snapshot.time !== game.time.worldTime || snapshot.turn !== turn()) return;
  const signature = attackSignature(message);
  for (const { index, token: victim } of attackHitTargets(message, { ignoreDefense: true })) {
    const scene = victim.parent, id = `${message.id}:${index}:${victim.id}`;
    if (scene !== canvas.scene || !protectedScene(scene)) continue;
    if (!same(victim, snapshot.targets.find(t => t.token === victim.uuid)?.from)) continue;
    let saved = scene.flags.spikependium?.guardianHits?.[id];
    if (saved) { await finish(scene, id, saved); continue; }
    // shortcut: Actor.applyDamage has no token selector; duplicate actor targets need manual interception.
    if (message.system.targets.filter(t => t.actor === victim.actor.uuid).length !== 1) continue;
    const guardians = [...scene.tokens].filter(t => pair(t, victim) && !message.system.targets.some(target => target.actor === t.actor.uuid));
    if (!guardians.length) continue;
    const pending = { attack: message.uuid, signature, index, victim: victim.uuid, victimActor: victim.actor.uuid,
      second: position(victim), time: game.time.worldTime, turn: turn(), author: game.user.id, state: "prompted" };
    await scene.setFlag("spikependium", `guardianHits.${id}`, pending);
    let accepted = false;
    try {
      for (const guardian of guardians) {
        if (!pair(guardian, victim)) continue;
        const owner = game.users.find(u => u.active && !u.isGM && guardian.actor.testUserPermission(u, "OWNER"));
        const safe = !message.blind && !message.whisper?.length && !victim.hidden && !guardian.hidden;
        const user = safe && owner ? owner : game.user;
        const consent = await foundry.applications.api.DialogV2.query(user, "confirm", { window: { title: "Бдительный защитник" }, rejectClose: false,
          content: `<p>${foundry.utils.escapeHTML(guardian.name)}: поменяться местами с ${foundry.utils.escapeHTML(victim.name)} и принять попадание? Подтверждаю, что вижу это существо собственными чувствами и попадание не отменено. Расходуются реакция и одно применение до продолжительного отдыха.</p>` });
        if (!consent) continue;
        const plan = swapPlan(guardian, victim);
        const record = { ...pending, ...plan, guardian: guardian.uuid, guardianActor: guardian.actor.uuid,
          target: dnd5e.dataModels.chatMessage.fields.TargetsField.getDescriptors([guardian])[0] };
        if (!game.user.isActiveGM || !validHit(message, record)
          || occupied(guardian, plan.toGuardian, [guardian, victim]) || occupied(victim, plan.toVictim, [guardian, victim])) continue;
        const cost = feature(guardian.actor);
        using.set(guardian.actor.uuid, { activity: cost, id });
        let result;
        try {
          result = await cost.use({ consume: { action: true, resources: true, spellSlot: false }, scaling: false, subsequentActions: false,
            spikependium: { guardian: id } }, { configure: false }, { data: { speaker: ChatMessage.implementation.getSpeaker({ actor: guardian.actor, token: guardian }),
              flags: { spikependium: { guardian: id } } } });
        } finally { using.delete(guardian.actor.uuid); }
        const reaction = result?.message?.flags.spikependium?.reaction?.id;
        const paid = guardian.actor.flags.spikependium?.reactionCasts?.[reaction];
        const delta = result?.message?.system.deltas?.item?.[cost.item.id];
        if (!result?.message || paid?.spent !== 1 || guardian.actor.flags.spikependium?.reactionId !== reaction
          || !delta?.some(d => d.keyPath === `system.activities.${MOD}.uses.spent` && d.delta === 1)) continue;
        // Payment is committed before movement. A region stopping either token does not repeat or refund the reaction.
        if (!game.user.isActiveGM || record.time !== game.time.worldTime || record.turn !== turn()
          || record.signature !== attackSignature(message) || !same(guardian, record.first) || !same(victim, record.second)) {
          await cost.refund(result.message.system.deltas); await result.message.update({ "system.deltas": null }); continue;
        }
        accepted = true;
        await scene.setFlag("spikependium", `guardianHits.${id}`, { ...record, payment: result.message.uuid, state: "moving" });
        await finish(scene, id, scene.flags.spikependium.guardianHits[id]);
        break;
      }
    } finally {
      if (!accepted && scene.flags.spikependium?.guardianHits?.[id]?.state === "prompted")
        await scene.setFlag("spikependium", `guardianHits.${id}.state`, "skip");
    }
  }
}
export async function chooseGuardian(message) {
  if (running.has(message.id)) return running.get(message.id);
  const task = choose(message); running.set(message.id, task);
  try { return await task; } finally { running.delete(message.id); }
}
export async function resumeGuardian() {
  if (!game.user.isActiveGM) return;
  for (const scene of game.scenes) for (const [id, record] of Object.entries(scene.flags.spikependium?.guardianHits ?? {})) {
    if (record.state === "moving") await finish(scene, id, record);
    else if (record.state === "prompted") {
      // An interrupted prompt is never replayed after a reconnect; the GM decides how the unresolved attack is handled.
      await scene.setFlag("spikependium", `guardianHits.${id}.state`, "stopped");
    }
    if (scene.flags.spikependium?.guardianHits?.[id]?.state === "stopped") await resolveStopped(scene, id, scene.flags.spikependium.guardianHits[id]);
  }
}
export async function guardianApplyDamage(wrapped, damages, options = {}) {
  const message = options.originatingMessage, attack = attackSource(message);
  if (!attack) {
    if (message?.flags.spikependium?.attackSource) { ui.notifications.warn("Исходный бросок атаки изменён или удалён. Разрешите этот урон вручную."); return; }
    return wrapped(damages, options);
  }
  if (running.has(attack.id)) await running.get(attack.id);
  if (pendingDecision(attack, this)) {
    ui.notifications.warn("У цели есть Бдительный защитник рядом. Дождитесь решения Мастера по этой реакции; урон пока не применён."); return;
  }
  const records = guardianRecords(attack), relevant = records.filter(r => [r.victimActor, r.guardianActor].includes(this.uuid));
  if (relevant.some(r => ["prompted", "moving", "stopped"].includes(r.state))) {
    ui.notifications.warn("Сначала Мастер должен закончить или разрешить обмен Бдительного защитника. Урон пока не применён."); return;
  }
  const record = relevant.find(r => r.state === "done" && r.victimActor === this.uuid);
  const batch = applying.get(message);
  if (!record) {
    if (relevant.some(r => r.state === "done" && r.guardianActor === this.uuid)) {
      if (batch?.has(this.uuid)) return;
      batch?.add(this.uuid);
    }
    return wrapped(damages, options);
  }
  const guardian = resolve(record.guardian)?.actor;
  if (record.signature !== attackSignature(attack) || guardian?.uuid !== record.guardianActor || !guardian.isOwner) {
    ui.notifications.warn("Этот удар перенаправлен на Защитника. Урон должен применить его владелец или Мастер из исходной карточки."); return;
  }
  if (batch?.has(guardian.uuid)) return;
  return guardian.applyDamage(damages, options);
}
export async function guardianCardDamage(wrapped, ...args) {
  if (applying.has(this)) return;
  applying.set(this, new Set());
  try { return await wrapped(...args); } finally { applying.delete(this); }
}
