import { attackSource, attackSignature } from "./attack-source.mjs";
import { attackHitTargets } from "./companions.mjs";
import { griffonHitFrame, applyGriffonHitProfile, griffonEffectWindow } from "./griffon-hit-triggers.mjs";

const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const family = item => item?.flags?.spikependium?.griffonTwoWeapon;
const frameOf = message => message?.flags?.spikependium?.medzoTriple;
const locks = new Set(), spent = new Set();
const rollSignature = rolls => JSON.stringify(rolls.map(r => r.toJSON()));
async function dieCard(frame, faces, message) {
  const flag = faces === 6 ? "medzoDamage" : "medzoReroll";
  const find = () => [...game.messages].find(m => m.flags.spikependium?.[flag]?.event === frame.event
    && m.flags.spikependium[flag].signature === frame.signature
    && (m.author?.isGM || m.author?.id === message.author?.id || resolve(frame.attack).getAssociatedActor()?.testUserPermission?.(m.author, "OWNER")));
  let card = find(); if (card) return card;
  await CONFIG.Dice.BasicRoll.build({ hookNames: ["formula"], rolls: [{ parts: [`1d${faces}`] }] }, { configure: false }, {
    create: true, rollMode: message.blind || message.whisper?.length ? "gm" : "public", data: {
      type: "generic", speaker: ChatMessage.getSpeaker({ actor: resolve(frame.attack).getAssociatedActor() }),
      flavor: faces === 6 ? "Медзо: к6 включается в общий урон оружия" : "Медзо: обязательная замена одной к4 исходного урона",
      flags: { spikependium: { [flag]: { event: frame.event, signature: frame.signature, damage: frame.damage, attack: frame.attack } } },
      ...(message.whisper?.length ? { whisper: [...message.whisper], blind: message.blind } : {})
    }
  });
  return find();
}
function extraRoll(card, original, event) {
  const data = foundry.utils.deepClone(card.rolls[0].toJSON()); data.class = CONFIG.Dice.DamageRoll.name;
  data.options = { ...foundry.utils.deepClone(original.options), configured: true, isCritical: false,
    spikependiumMedzoBase: false, spikependiumMedzoExtra: true, spikependiumMedzoExtraFor: event };
  return CONFIG.Dice.DamageRoll.fromData(data);
}
function replaceDie(roll, die, result) {
  // shortcut: custom formulas wrapping the base dice need a term-tree replacement rather than a top-level one.
  if (roll.terms[0] !== die) throw Error("Изменённая формула Медзо: замените одну к4 вручную и сохраните остальные кости.");
  const dieData = foundry.utils.deepClone(die.toJSON()), old = dieData.results.find(r => r.active !== false && !r.discarded);
  old.active = false; old.rerolled = true; dieData.results.push({ result, active: true });
  const terms = roll.terms.map(t => t.constructor.fromData(foundry.utils.deepClone(t === die ? dieData : t.toJSON())));
  return CONFIG.Dice.DamageRoll.fromTerms(terms, { ...roll.options, configured: true });
}
function base(message) {
  const rolls = message.rolls?.filter(r => r instanceof CONFIG.Dice.DamageRoll && r.options.spikependiumMedzoBase && r._evaluated);
  if (rolls?.length !== 1) return;
  const roll = rolls[0], die = roll.dice?.[0], results = die?.results?.filter(r => r.active !== false && !r.discarded);
  if (die?.faces === 4 && die.number === 3 && results?.length === 3 && Number.isFinite(roll.total)) return { roll, die, results };
}
function source(message) {
  const attack = attackSource(message), a = attack?.getAssociatedActivity();
  if (message?.type !== "damage" || family(a?.item) !== "medzo" || a.type !== "attack" || a.attack.type.classification !== "weapon"
    || attack.rolls.length !== 1 || attack.system.targets.length !== 1 || message.system.targets.length !== 1) return;
  if (message.author && a.actor?.testUserPermission && !a.actor.testUserPermission(message.author, "OWNER")) return;
  const hit = attackHitTargets(attack)[0], target = message.system.targets[0];
  if (!hit || target.token !== hit.token.uuid || target.actor !== hit.token.actor.uuid) return;
  return { attack, activity: a, hit, key: `hit-${hit.index}-${hit.token.id}` };
}
function valid(message, frame = frameOf(message)) {
  const info = source(message);
  return !!frame && !!info && info.attack.uuid === frame.attack && frame.signature === attackSignature(info.attack)
    && frame.damageSignature === rollSignature(message.rolls) && info.hit.token.uuid === frame.token && info.hit.token.actor.uuid === frame.actor
    && info.attack.flags.spikependium?.medzoTriples?.[info.key] === message.uuid && frame.value >= 1 && frame.value <= 4;
}
async function finish(message) {
  const frame = frameOf(message);
  if (!game.user.isActiveGM || !valid(message, frame) || frame.done || locks.has(frame.event)) return;
  locks.add(frame.event);
  try {
    const attack = resolve(frame.attack), item = attack.getAssociatedItem();
    if (!frame.extra) {
      const card = await dieCard(frame, 6, message);
      if (!card || !valid(message)) return;
      const extra = extraRoll(card, base(message).roll, frame.event), rolls = [...message.rolls, extra];
      await message.update({ rolls: rolls.map(r => r.toJSON()), "flags.spikependium.medzoTriple": {
        ...frameOf(message), extra: card.uuid, damageSignature: rollSignature(rolls)
      } });
    }
    if (frame.value === 2) await applyGriffonHitProfile(frame, item, e => e.flags.spikependium?.medzoNextAttack);
    if (frame.value === 3) await applyGriffonHitProfile(frame, item, e => e.flags.spikependium?.medzoDisadvantage
      || e.system.changes.some(c => c.key === "system.rolls.attack.roll.mode" && Number(c.value) === -1));
    if (frame.value === 4) ui.notifications.info(`${item.name}: если цель враждебна, у ног владельца появились 30 зм. Мастер, отметьте монеты на сцене; они ещё не в кошельке.`);
    await message.setFlag("spikependium", "medzoTriple.done", true);
  } finally { locks.delete(frame.event); }
}
export async function processMedzoDamage(message) {
  if (!game.user.isActiveGM) return;
  if (frameOf(message)) { await finish(message); return; }
  const info = source(message), b = base(message);
  if (!info || !b) return;
  const prepared = b.roll.options.spikependiumMedzoResolved;
  if (!prepared && !b.results.every(r => r.result === b.results[0].result)) return;
  if (prepared && (prepared.attack !== info.attack.uuid || prepared.signature !== attackSignature(info.attack)
    || message.rolls.filter(r => r.options.spikependiumMedzoExtraFor === prepared.event).length !== 1)) return;
  const value = prepared?.value ?? b.results[0].result;
  if (!Number.isInteger(value) || value < 1 || value > 4) return;
  const lock = `${info.attack.uuid}:${info.key}`; if (locks.has(lock)) return; locks.add(lock);
  try {
    const previous = info.attack.flags.spikependium?.medzoTriples?.[info.key];
    if (previous && previous !== message.uuid) return;
    if (!previous) await info.attack.setFlag("spikependium", `medzoTriples.${info.key}`, message.uuid);
    const frame = { ...griffonHitFrame(info.attack, info.hit, "medzo"), key: info.key, damage: message.uuid,
      damageSignature: rollSignature(message.rolls), value, choice: prepared?.choice ?? (value === 1 ? null : "none"), extra: prepared?.extra, reroll: prepared?.reroll };
    await message.setFlag("spikependium", "medzoTriple", frame);
  } finally { locks.delete(lock); }
  await finish(message);
}
export function recordMedzoDamage(actor, _amount, updates, options) {
  const card = options.originatingMessage;
  if (card?.flags.spikependium?.medzoReroll) { ui.notifications.warn("Эта к4 заменяет кость исходного урона; отдельно её не применяйте."); return false; }
  if (card?.flags.spikependium?.medzoDamage) { ui.notifications.warn("Эта к6 включена в исходную карточку Медзо; применяйте её общий урон."); return false; }
  const b = card && base(card), frame = frameOf(card);
  if (source(card) && (frame || (game.users.activeGM && b?.results.every(r => r.result === b.results[0].result)))) {
    const original = source(card), anchor = original.attack.flags.spikependium?.medzoTriples?.[original.key];
    if (anchor && anchor !== card.uuid) { ui.notifications.warn("Для этой атаки уже обработана карточка Медзо. Используйте её; замену уже применённого результата проверяет Мастер."); return false; }
    if (!valid(card, frame) || !frame.done) { ui.notifications.warn("Дождитесь обработки исходных костей Медзо Мастером."); return false; }
    if (frame.value === 1 && !frame.choice) {
      ui.notifications.warn("Медзо: сначала выберите на карточке урона «Оставить 3к4» или переброс одной к4."); return false;
    }
  }
}
function mayChoose(message) {
  return message?.isOwner && message.getAssociatedActor()?.isOwner && valid(message) && frameOf(message).value === 1 && !frameOf(message).choice;
}
export async function chooseMedzoDie(message, choice) {
  if (!["keep", "reroll"].includes(choice) || !mayChoose(message) || locks.has(`choice:${message.uuid}`)) return;
  locks.add(`choice:${message.uuid}`);
  try {
    if (choice === "keep") { await message.setFlag("spikependium", "medzoTriple.choice", "keep"); return; }
    const frame = frameOf(message), b = base(message);
    if (!b || !b.results.every(r => r.result === 1)) return;
    // shortcut: custom formulas wrapping the base dice need a term-tree replacement rather than a top-level one.
    if (b.roll.terms[0] !== b.die) { ui.notifications.warn("Формула урона изменена: замену одной к4 выполните вручную; остальные кости сохраните."); return; }
    const card = await dieCard(frame, 4, message);
    const reroll = card?.rolls[0];
    if (!mayChoose(message) || !card || card.rolls.length !== 1 || !(reroll instanceof CONFIG.Dice.BasicRoll) || !reroll._evaluated
      || !Number.isInteger(reroll.total) || reroll.total < 1 || reroll.total > 4 || card.flags.spikependium.medzoReroll.damage !== message.uuid) return;
    const replacement = replaceDie(b.roll, b.die, reroll.total);
    if (!replacement._evaluated) await replacement.evaluate({ allowInteractive: false });
    if (!replacement._evaluated || !Number.isFinite(replacement.total)) throw Error("Не удалось пересчитать урон Медзо; повторите выбор, к4 уже сохранена.");
    const rolls = message.rolls.map(r => r === b.roll ? replacement : r);
    await message.update({ rolls: rolls.map(r => r.toJSON()), "flags.spikependium.medzoTriple": {
      ...frameOf(message), damageSignature: rollSignature(rolls), choice: "reroll", reroll: card.uuid
    } });
  } finally { locks.delete(`choice:${message.uuid}`); }
}
export async function medzoDamageEvaluate(wrapped, rolls, config = {}, message = {}, ...args) {
  const result = await wrapped(rolls, config, message, ...args);
  if (config.evaluate === false || !config.subject?.actor?.isOwner || config.subject?.item?.flags.spikependium?.griffonTwoWeapon !== "medzo") return result;
  const proxy = { type: "damage", flags: message.data?.flags ?? {}, system: message.data?.system ?? {}, rolls,
    getAssociatedActivity: () => config.subject };
  const info = source(proxy), b = base(proxy);
  if (!info || !b || b.roll.options.spikependiumMedzoResolved || !b.results.every(r => r.result === b.results[0].result)) return result;
  const value = b.results[0].result, frame = griffonHitFrame(info.attack, info.hit, "medzo");
  if (![1, 2, 3, 4].includes(value)) return result;
  const card = await dieCard(frame, 6, info.attack); if (!card) throw Error("Не удалось сохранить дополнительную к6 Медзо.");
  let replacement = b.roll, choice = value === 1 ? "keep" : "none", reroll;
  if (value === 1 && await foundry.applications.api.DialogV2.confirm({ window: { title: "Медзо: три единицы" },
    content: "<p>На исходных 3к4 выпали три единицы. Перебросить одну к4? Новый результат обязателен; таблица повторно не запускается.</p>", rejectClose: false })) {
    const die = await dieCard(frame, 4, info.attack), roll = die?.rolls[0];
    if (!roll?._evaluated || !Number.isInteger(roll.total) || roll.total < 1 || roll.total > 4) throw Error("Не удалось сохранить замену к4 Медзо.");
    replacement = replaceDie(b.roll, b.die, roll.total); if (!replacement._evaluated) await replacement.evaluate({ allowInteractive: false });
    choice = "reroll"; reroll = die.uuid;
  }
  const index = rolls.indexOf(b.roll);
  if (!source(proxy)) throw Error("Исходная атака Медзо изменилась: проверьте новый бросок перед уроном.");
  replacement.options.spikependiumMedzoResolved = { value, event: frame.event, extra: card.uuid, choice, reroll,
    attack: info.attack.uuid, signature: attackSignature(info.attack) };
  rolls[index] = replacement; rolls.push(extraRoll(card, replacement, frame.event));
  return result;
}
export function medzoButtons(message, html) {
  if (!message.isContentVisible || !mayChoose(message)) return;
  const root = html instanceof HTMLElement ? html : html[0]; if (!root || root.querySelector(".spikependium-medzo")) return;
  for (const [choice, label] of [["keep", "Оставить 3к4"], ["reroll", "Медзо: перебросить одну к4"]]) {
    const button = document.createElement("button"); button.type = "button"; button.className = "spikependium-medzo"; button.textContent = label;
    button.addEventListener("click", () => { button.disabled = true; chooseMedzoDie(message, choice).catch(error => console.error("Spikependium: кости Медзо", error)).finally(() => { button.disabled = false; }); }); root.append(button);
  }
}
const effectStamp = e => JSON.stringify([e.uuid, e.flags.spikependium?.weaponHit?.event ?? e.system.origin?.message ?? e.start]);
function alreadyUsed(stamp) {
  return spent.has(stamp) || [...game.messages].some(m => m.type === "attack" && m.rolls.some(r => r instanceof CONFIG.Dice.D20Roll && r._evaluated
    && r.options.spikependiumMedzoAdvantage?.stamp === stamp));
}
export function prepareMedzoAdvantage(config, _dialog, message) {
  if (config.subject?.type !== "attack" || message.data?.system?.targets?.length !== 1 || !config.rolls[0]) return;
  const target = message.data.system.targets[0], actor = resolve(target.token)?.actor ?? resolve(target.actor);
  const effect = actor?.effects.find(e => e.active && !e.duration?.expired && e.flags.spikependium?.medzoNextAttack && !alreadyUsed(effectStamp(e)));
  if (!effect) return;
  const options = config.rolls[0].options ??= {};
  options.advantage ||= options.advantageMode === 1; options.disadvantage ||= options.advantageMode === -1;
  options.advantage = true; if (options.advantageMode !== undefined) options.advantageMode = options.disadvantage ? 0 : 1;
  options.spikependiumMedzoAdvantage = { effect: effect.uuid, stamp: effectStamp(effect), token: target.token, actor: actor.uuid };
}
export async function medzoAttackEvaluate(wrapped, rolls, config = {}, message = {}, ...args) {
  const selection = rolls[0]?.options.spikependiumMedzoAdvantage;
  if (!selection || config.evaluate === false) return wrapped(rolls, config, message, ...args);
  const effect = resolve(selection.effect), lock = `advantage:${selection.stamp}`;
  if (!effect?.active || effect.duration?.expired || effectStamp(effect) !== selection.stamp || alreadyUsed(selection.stamp) || locks.has(lock)
    || message.data?.system?.targets?.length !== 1 || message.data.system.targets[0].token !== selection.token) {
    rolls.splice(0); ui.notifications.warn("Преимущество Медзо уже использовано или цель изменилась. Повторите атаку."); return;
  }
  locks.add(lock);
  try {
    const result = await wrapped(rolls, config, message, ...args);
    if (rolls[0] instanceof CONFIG.Dice.D20Roll && rolls[0]._evaluated) spent.add(selection.stamp);
    return result;
  } finally { locks.delete(lock); }
}
export async function consumeMedzoAdvantage(message) {
  if (!game.user.isActiveGM || message.type !== "attack") return;
  const actor = message.getAssociatedActivity()?.actor ?? message.getAssociatedActor();
  if (!actor || (actor.testUserPermission && !actor.testUserPermission(message.author, "OWNER"))) return;
  for (const roll of message.rolls) {
    const selection = roll.options.spikependiumMedzoAdvantage, effect = resolve(selection?.effect);
    if (!(roll instanceof CONFIG.Dice.D20Roll) || !roll._evaluated || !effect || effectStamp(effect) !== selection.stamp || effect.parent.uuid !== selection.actor
      || message.system.targets.length !== 1 || message.system.targets[0].token !== selection.token) continue;
    await effect.delete();
  }
}
export async function resumeMedzo() {
  if (!game.user.isActiveGM) return;
  for (const message of game.messages) if (frameOf(message)) await finish(message);
}
export async function cleanMedzoProfiles() {
  if (!game.user.isActiveGM) return;
  const actors = new Map([...(game.actors ?? []), ...[...(game.scenes ?? [])].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean).map(a => [a.uuid, a]));
  for (const actor of actors.values()) for (const effect of [...actor.effects]) {
    const frame = effect.flags.spikependium?.weaponHit;
    if (frame?.kind !== "medzo") continue;
    if (!valid(resolve(frame.damage)) || !griffonEffectWindow(frame, "sourceEnd")) await effect.delete();
  }
}
