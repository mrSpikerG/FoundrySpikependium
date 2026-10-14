import { attackSource, attackSignature, guardianRawTarget, guardianRecords } from "./attack-source.mjs";
import { reactionAvailable } from "./reactions.mjs";
import { chooseGuardian } from "./dragonmark-guardian.mjs";
import { syncMonsterEffects } from "./monster-effects.mjs";

const working = new Set();
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const feature = actor => actor?.flags?.spikependium?.key === "actor:mm25:performer-legend"
  ? [...actor.items].flatMap(i => [...(i.system.activities ?? [])]).find(a => a.type === "save"
    && a.id === "GdX6hhPAfHHCNApc" && a.activation.type === "reaction") : undefined;
const isDefense = activity => activity?.id === "GdX6hhPAfHHCNApc" && feature(activity.actor)?.uuid === activity.uuid;
const turn = () => game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : null;
function rawHits(attack) {
  if (attack?.type !== "attack" || attack.rolls?.length !== 1
    || !attack.getAssociatedActor?.()?.testUserPermission(attack.author, "OWNER")
    || guardianRecords(attack).some(r => ["prompted", "moving", "stopped"].includes(r.state))) return [];
  const roll = attack.rolls[0];
  if (!(roll instanceof CONFIG.Dice.D20Roll) || !roll._evaluated) return [];
  return attack.system.targets.map(original => ({ original, target: guardianRawTarget(attack, original) }))
    .filter(({ original, target }) => target !== original || (Number.isFinite(target.ac)
      && (roll.isCritical || (!roll.isFumble && roll.total >= target.ac))))
    .map(({ target }) => resolve(target.token)).filter(t => t?.actor);
}
function binding(attack, token) {
  const hits = rawHits(attack).filter(t => t.actor.uuid === token?.actor?.uuid), attacker = attack?.getAssociatedToken?.();
  if (hits.length !== 1 || hits[0].uuid !== token.uuid || !attacker?.actor?.system.isCreature
    || attack.system.targets.filter(t => resolve(t.token)?.actor?.uuid === token.actor.uuid).length > 1) return;
  return { attack: attack.uuid, signature: attackSignature(attack), targets: JSON.stringify(attack.system.targets),
    target: token.uuid, actor: token.actor.uuid, attacker: attacker.actor.uuid, attackerToken: attacker.uuid };
}
const same = (a, b) => !!a && !!b && ["attack", "signature", "targets", "target", "actor", "attacker", "attackerToken"].every(k => a[k] === b[k]);
function valid(attack, token, record) {
  return record && record.attack === attack?.uuid && record.actor === token?.actor?.uuid && record.target === token?.uuid
    && record.signature === attackSignature(attack) && record.targets === JSON.stringify(attack.system.targets)
    && attack.getAssociatedToken()?.uuid === record.attackerToken && attack.getAssociatedActor()?.uuid === record.attacker;
}
function recordFor(attack, token) { return token?.actor?.flags?.spikependium?.defensiveCharms?.[attack?.id]; }
function originFor(record) {
  if (!record?.event) return;
  const actor = resolve(record?.actor);
  return record && [...game.messages].find(message => message.type === "usage" && message.author
    && actor?.testUserPermission(message.author, "OWNER") && message.flags?.spikependium?.defensiveCharm?.event === record.event
    && message.flags.spikependium.defensiveCharm.actor === record.actor && message.flags.spikependium.defensiveCharm.attack === record.attack
    && message.flags.spikependium?.reaction?.id === record.reaction
    && message.flags.spikependium?.monsterCast?.kind === "performer-defense"
    && message.flags.spikependium.monsterCast.actor === record.actor && message.flags.spikependium.monsterCast.dc === 17
    && message.flags.spikependium.monsterCast.targets?.length === 1
    && message.flags.spikependium.monsterCast.targets[0].actor === record.attacker
    && message.flags.spikependium.monsterCast.targets[0].token === record.attackerToken);
}
function saveFor(origin, record) {
  const attacker = resolve(record?.attacker);
  return origin?.getAssociatedRolls("save").filter(card => card.system.ability === "wis"
    && card.getAssociatedActor()?.uuid === record.attacker && card.getAssociatedToken()?.uuid === record.attackerToken
    && card.rolls[0] instanceof CONFIG.Dice.D20Roll && card.rolls[0]._evaluated && card.rolls[0].options.target === 17
    && card.author && (card.author.isGM || attacker?.testUserPermission(card.author, "OWNER"))).at(-1);
}
export function defensiveCharmOutcome(attack, target) {
  const token = resolve(target?.token), record = recordFor(attack, token);
  if (!valid(attack, token, record)) return;
  if (record.active !== 1) return "hit";
  const save = saveFor(originFor(record), record);
  return save ? (save.system.forceSuccess || !save.rolls[0].isFailure ? "hit" : "miss") : "pending";
}
function fresh(attack) {
  const stamp = attack.flags?.spikependium?.guardianAttack;
  return stamp && stamp.time === game.time.worldTime && stamp.turn === turn();
}
export function defensiveCharmWaiting(attack, target) {
  const outcome = defensiveCharmOutcome(attack, target);
  if (outcome) return outcome === "pending";
  const token = resolve(target?.token), actor = token?.actor;
  return actor?.flags?.spikependium?.key === "actor:mm25:performer-legend" && !!game.users?.activeGM && fresh(attack) && !!feature(actor) && actor.system.attributes.hp.value > 0
    && reactionAvailable(actor) && !!binding(attack, token);
}
export function defensiveCharmEnabled(origin) {
  const receipt = origin?.flags?.spikependium?.defensiveCharm;
  if (!receipt) return true; // Earlier manual copies retain their native effect behavior.
  const actor = resolve(receipt.actor), record = actor?.flags.spikependium?.defensiveCharms?.[receipt.attack?.split(".").at(-1)];
  return !!record && record.event === receipt.event && record.active === 1;
}
export function prepareDefenseUpdates(activity, config, updates) {
  const choice = config.spikependium?.defensiveCharm;
  if (!isDefense(activity) || !choice) return updates;
  const attack = resolve(choice.attack), token = resolve(choice.target), current = binding(attack, token);
  const id = updates.actor["flags.spikependium.reactionId"], reaction = updates.actor[`flags.spikependium.reactionCasts.${id}`];
  if (!same(choice, current) || !reaction || reaction.spent !== 1 || activity.save.dc.value !== 17) return false;
  updates.actor[`flags.spikependium.defensiveCharms.${attack.id}`] = { ...current, event: choice.event, reaction: id, active: 1 };
  return updates;
}
export function recordDefenseConsumption(activity, config, message) {
  const choice = config.spikependium?.defensiveCharm, attack = resolve(choice?.attack);
  const record = activity.actor?.flags?.spikependium?.defensiveCharms?.[attack?.id];
  if (!isDefense(activity) || !record || record.event !== choice?.event || record.active !== 1) return;
  const path = `flags.spikependium.defensiveCharms.${attack.id}.active`;
  message.data.system.deltas ??= { actor: [], item: {} };
  const deltas = message.data.system.deltas.actor ??= [];
  if (!deltas.some(d => d.keyPath === path)) deltas.push({ keyPath: path, delta: 1 });
}
export function recordDefenseUsage(activity, message) {
  if (!isDefense(activity)) return;
  const event = message.data?.flags?.spikependium?.defensiveCharm?.event;
  const record = Object.values(activity.actor.flags.spikependium?.defensiveCharms ?? {})
    .find(r => r.active === 1 && r.event === event && r.reaction === activity.actor.flags.spikependium?.reactionId);
  if (record) foundry.utils.setProperty(message, "data.flags.spikependium.defensiveCharm", {
    actor: record.actor, attack: record.attack, event: record.event });
}
export function defenseDeltaLabel(wrapped, ...args) {
  const data = wrapped(...args);
  if (/^flags\.spikependium\.defensiveCharms\.[^.]+\.active$/.test(this.keyPath)) data.label = "Защитное обворожение";
  return data;
}
export async function defensiveCharmUse(wrapped, config = {}, dialog = {}, message = {}) {
  if (!isDefense(this) || config.consume === false || config.consume?.action === false) return wrapped(config, dialog, message);
  if (!this.actor.isOwner || !reactionAvailable(this.actor)) return;
  let choice = config.spikependium?.defensiveCharm;
  if (!choice) {
    const choices = [...game.messages].reverse().filter(m => game.user.isGM || m.isContentVisible)
      .flatMap(attack => rawHits(attack).filter(t => t.actor.uuid === this.actor.uuid)
        .map(token => ({ attack, choice: binding(attack, token) }))).filter(c => c.choice).slice(0, 10);
    if (!choices.length) { ui.notifications.warn("Нет однозначного штатного попадания по артисту. Разрешите реакцию вручную."); return; }
    const selected = await foundry.applications.api.DialogV2.wait({ window: { title: "Защитное обворожение: попадание" },
      content: `<p>Выберите ещё не разрешённое попадание.</p><select name="attack">${choices.map(c =>
        `<option value="${c.attack.id}">${foundry.utils.escapeHTML(c.attack.getAssociatedActor().name)} — ${foundry.utils.escapeHTML(c.attack.getAssociatedActivity()?.name ?? "Атака")}</option>`).join("")}</select>`,
      buttons: [{ action: "defend", label: "Применить реакцию", callback: (event, button) => button.form.elements.attack.value },
        { action: "cancel", label: "Отмена", callback: () => null }], close: () => null });
    choice = choices.find(c => c.attack.id === selected)?.choice;
    if (!choice) return;
  }
  const attack = resolve(choice.attack), target = resolve(choice.target), attacker = resolve(choice.attackerToken);
  if (!same(choice, binding(attack, target))) return;
  choice = { ...choice, event: choice.event ?? foundry.utils.randomID() };
  const hidden = attack.blind || attack.whisper?.length || target.hidden || attacker.hidden;
  const privacy = hidden ? { whisper: attack.whisper?.length ? [...attack.whisper] : game.users.filter(u => u.isGM).map(u => u.id), blind: !!attack.blind } : {};
  return wrapped({ ...config, spikependium: { ...config.spikependium, defensiveCharm: choice } }, dialog,
    { ...message, ...(hidden ? { rollMode: "gm" } : {}), data: { ...message.data, ...privacy,
      flags: { ...message.data?.flags, spikependium: { ...message.data?.flags?.spikependium,
        defensiveCharm: { actor: choice.actor, attack: choice.attack, event: choice.event } } },
      speaker: ChatMessage.getSpeaker({ actor: this.actor, token: target, scene: target.parent }),
      system: { ...message.data?.system, targets: [{ actor: attacker.actor.uuid, token: attacker.uuid, name: attacker.name, img: attacker.texture?.src }] } } });
}
async function refresh(attack, token, record) {
  const origin = originFor(record), save = saveFor(origin, record);
  if (record.active === 1 && !save) return;
  const result = JSON.stringify([record.active, save?.uuid, save?.system.forceSuccess, save?.rolls[0].toJSON()]);
  if (record.resolved === result) return;
  await token.actor.setFlag("spikependium", `defensiveCharms.${attack.id}.resolved`, result);
  if (attack.isOwner) await attack.setFlag("spikependium", "defenseRefresh", foundry.utils.randomID());
}
export async function chooseDefensiveCharm(attack) {
  if (attack?.type !== "attack" || resolve(attack.uuid) !== attack || working.has(attack.uuid) || (game.users.activeGM && !game.user.isActiveGM)) return;
  working.add(attack.uuid);
  try {
    await chooseGuardian(attack);
    for (const token of rawHits(attack)) {
      const actor = token.actor;
      if (!actor.isOwner || !feature(actor)) continue;
      const choice = binding(attack, token);
      if (!choice) continue;
      let record = recordFor(attack, token);
      if (!record && fresh(attack) && actor.system.attributes.hp.value > 0 && reactionAvailable(actor)) {
        if (!await foundry.applications.api.DialogV2.confirm({ window: { title: "Защитное обворожение" },
          content: "<p>По легендарному артисту попала атака. Потратить реакцию на спасбросок атакующего против отмены попадания и Очарования?</p>" })) {
          await actor.setFlag("spikependium", `defensiveCharms.${attack.id}`, { ...choice, active: 0 });
        } else await feature(actor).use({ spikependium: { defensiveCharm: choice }, consume: { action: true, resources: true, spellSlot: false } });
        record = recordFor(attack, token);
      }
      if (!valid(attack, token, record)) continue;
      const origin = originFor(record), attacker = resolve(record.attackerToken);
      if (record.active === 1 && origin && !saveFor(origin, record) && !record.started && attacker?.actor?.isOwner) {
        await actor.setFlag("spikependium", `defensiveCharms.${attack.id}.started`, true);
        await attacker.actor.rollSavingThrow({ ability: "wis", target: 17 }, { configure: false }, {
          rollMode: origin.blind || origin.whisper?.length || attacker.hidden || token.hidden ? "gm" : "public",
          data: { whisper: [...(origin.whisper ?? [])], blind: !!origin.blind,
            speaker: ChatMessage.getSpeaker({ actor: attacker.actor, token: attacker, scene: attacker.parent }),
            system: { origin: origin.id }, flavor: "Защитное обворожение — спасбросок атакующего" } });
      }
      if (origin) await syncMonsterEffects(origin);
      await refresh(attack, token, recordFor(attack, token));
    }
  } finally { working.delete(attack.uuid); }
}
export async function resumeDefensiveCharms(message) {
  if (message?.type === "attack") return chooseDefensiveCharm(message);
  const origin = message?.type === "save" ? message.getOriginatingMessage() : message;
  const receipt = origin?.flags?.spikependium?.defensiveCharm;
  if (receipt) return chooseDefensiveCharm(resolve(receipt.attack));
  if (message) return;
  for (const attack of game.messages) if (attack.type === "attack" && (fresh(attack) || attack.flags.spikependium?.defenseRefresh)) await chooseDefensiveCharm(attack);
}
export async function resumeActorDefense(actor) {
  for (const record of Object.values(actor?.flags?.spikependium?.defensiveCharms ?? {})) {
    const attack = resolve(record.attack);
    attack?.render?.(false);
    if (attack) await chooseDefensiveCharm(attack);
  }
}
export async function clearDeletedDefense(attack) {
  if (attack?.type !== "attack" || (game.users.activeGM && !game.user.isActiveGM)) return;
  const actors = new Set([...game.actors, ...[...game.scenes].flatMap(scene => [...scene.tokens].map(t => t.actor))].filter(Boolean));
  // Removing a chat card must not end a paid charm before its native duration expires.
  for (const actor of actors) if (actor.isOwner && actor.flags?.spikependium?.defensiveCharms?.[attack.id]?.active === 0)
    await actor.update({ [`flags.spikependium.defensiveCharms.-=${attack.id}`]: null });
}
export async function defensiveCharmDamage(wrapped, damages, options = {}) {
  const attack = attackSource(options.originatingMessage);
  if (!attack || this.flags?.spikependium?.key !== "actor:mm25:performer-legend" || !this.isOwner) return wrapped(damages, options);
  await chooseDefensiveCharm(attack);
  const targets = rawHits(attack).filter(t => t.actor.uuid === this.uuid);
  if (targets.length !== 1) return wrapped(damages, options);
  const target = { token: targets[0].uuid }, outcome = defensiveCharmOutcome(attack, target);
  if (outcome === "miss") return this;
  if (defensiveCharmWaiting(attack, target)) {
    ui.notifications.warn("Сначала разрешите спасбросок Защитного обворожения из его карточки. Урон пока не применён."); return this;
  }
  return wrapped(damages, options);
}
