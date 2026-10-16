import { attackSource, guardianTarget } from "./attack-source.mjs";
import { attackHitTargets } from "./companions.mjs";
import { incapacitated, tokensDistance } from "./effects.mjs";

const paths = new Map(), boundaries = new Map(), running = new Set();
// shortcut: путь до подключения клиента не подтверждается автоматически; при восстановлении истории действий заменить ручное подтверждение.
const turn = () => game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : `time:${game.time.worldTime}`;
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
export function monsterGrappleRule(activity) {
  const rule = activity?.item.flags.spikependium?.monsterGrapple;
  if (!["attack", "save"].includes(activity?.type) || !rule) return;
  const key = activity.actor?.flags.spikependium?.key, identifier = activity.item.system.identifier;
  return (activity.type === "attack" && rule.maxSize === "lg" && ((key === "actor:mm25:ankheg" && identifier === "ankheg-bite" && rule.dc === 13 && rule.reach === 5)
    || (key === "actor:mm25:aboleth" && identifier === "aboleth-tentacle" && rule.dc === 14 && rule.reach === 15 && rule.limit === 4)))
    || (activity.type === "attack" && rule.maxSize === "med" && key === "actor:mm25:bugbear-warrior" && identifier === "bugbear-warrior-grab" && rule.dc === 12 && rule.reach === 10)
    || (activity.type === "save" && rule.maxSize === "med" && key === "actor:mm25:bugbear-stalker" && identifier === "bugbear-stalker-grab" && rule.dc === 13 && rule.reach === 10) ? rule : undefined;
}
export function monsterGrappleAvailable(activity, source, target) {
  const rule = monsterGrappleRule(activity);
  if (!rule?.limit) return true;
  const actors = new Map([...game.actors, ...[...game.scenes].flatMap(scene => [...scene.tokens].map(token => token.actor))]
    .filter(Boolean).map(actor => [actor.uuid, actor]));
  const grabs = [...actors.values()].flatMap(actor => [...actor.effects]).filter(effect => effect.active
    && effect.flags.spikependium?.arcanaSpiritGrab?.source === source.uuid && effect.statuses.has("grappled"));
  return grabs.some(effect => effect.flags.spikependium.arcanaSpiritGrab.target === target.uuid) || grabs.length < rule.limit;
}
export function prepareMonsterAttack(config, dialog, message) {
  const activity = config.subject, actor = activity?.actor, rule = monsterGrappleRule(activity);
  const ownGrab = activity?.item.flags.spikependium?.ownGrappleAdvantage === true && (
    (actor?.flags.spikependium?.key === "actor:mm25:bugbear-warrior" && activity.item.system.identifier === "bugbear-warrior-hammer")
    || (actor?.flags.spikependium?.key === "actor:mm25:bugbear-stalker" && activity.item.system.identifier === "bugbear-stalker-morningstar"));
  const pack = actor?.flags.spikependium?.key === "actor:mm25:hell-hound"
    && actor.items.some(item => item.flags.spikependium?.packTactics);
  if (activity?.type !== "attack" || !actor?.isOwner || (!rule?.advantage && !pack && !ownGrab)) return;
  const speaker = message.data?.speaker;
  const tokens = actor.getActiveTokens?.(false, true) ?? [];
  const source = speaker?.scene && speaker?.token ? resolve(`Scene.${speaker.scene}.Token.${speaker.token}`)
    : actor.token ?? (tokens.length === 1 ? tokens[0] : undefined);
  const targets = message.data?.system?.targets ?? [];
  if (source?.actor?.uuid !== actor.uuid || !targets.length) return;
  const eligible = target => {
    const token = resolve(target.token);
    if (!token?.actor || token.parent !== source.parent) return false;
    if ((rule?.advantage || ownGrab) && token.actor.effects.some(effect => effect.active && effect.statuses.has("grappled")
      && effect.flags.spikependium?.arcanaSpiritGrab?.source === source.uuid
      && effect.flags.spikependium.arcanaSpiritGrab.target === token.uuid
      && (ownGrab || effect.system.origin?.activity?.startsWith(`${activity.item.uuid}.Activity.`)))) return true;
    // shortcut: принадлежность токена определяет союзников; при нейтральных или разных сторонах подтвердить Преимущество в окне броска.
    return pack && [-1, 1].includes(source.disposition) && source.parent.tokens.some(ally => ally.uuid !== source.uuid
      && ally.uuid !== token.uuid && ally.disposition === source.disposition && ally.actor
      && !incapacitated(ally.actor) && ally.actor.system.attributes.hp.value > 0
      && Number.isFinite(tokensDistance(ally, token)) && tokensDistance(ally, token) <= 5);
  };
  if (!targets.every(eligible)) return;
  for (const roll of config.rolls) {
    roll.options ??= {};
    roll.options.disadvantage ||= roll.options.advantageMode === -1;
    roll.options.advantage = true;
    if (roll.options.advantageMode !== undefined) roll.options.advantageMode = roll.options.disadvantage ? 0 : 1;
  }
}
const diveSize = (rule, actor) => !rule.maxSize || (!!actor && ["tiny", "sm", "med", "lg", "huge"].includes(actor.system.traits.size));
const hasDive = actor => actor?.items.some(i => i.flags.spikependium?.dive);
const stamp = p => JSON.stringify([p?.movementId, p?.x, p?.y, p?.elevation, p?.level]);
function history(token) {
  return [...(token.movementHistory?.recorded?.waypoints ?? []), ...(token.movementHistory?.unrecorded?.waypoints ?? [])]
    .filter((p, i, all) => !i || stamp(p) !== stamp(all[i - 1]));
}
export function recordMonsterMovement(token) {
  if (!hasDive(token.actor)) return;
  const points = history(token), boundary = boundaries.get(token.uuid);
  if (points.length < 2) { paths.delete(token.uuid); boundaries.delete(token.uuid); return; }
  const index = boundary ? points.findLastIndex(p => stamp(p) === boundary) : -1;
  paths.set(token.uuid, { points: points.slice(index < 0 ? 0 : index).map(p => Object.fromEntries(
    ["x", "y", "elevation", "level", "width", "height", "depth", "shape", "action"].map(k => [k, p[k]]))), turn: turn() });
}
function endApproach(token) {
  if (!hasDive(token?.actor)) return;
  const points = history(token);
  if (points.length) boundaries.set(token.uuid, stamp(points.at(-1)));
  paths.delete(token.uuid);
}
export function endMonsterApproach(message) {
  const activity = message.getAssociatedActivity?.();
  if (message.type !== "attack" && !(message.type === "usage" && activity?.type !== "attack")) return;
  endApproach(message.getAssociatedToken?.());
}
function vector(a, b, grid) { return [b.x - a.x, b.y - a.y, (b.elevation - a.elevation) * grid.size / grid.distance]; }
const length = v => Math.hypot(...v), dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
const equal = (a, b) => ["level", "width", "height", "depth", "shape"].every(k => a[k] === b[k]);
export function diveToward(source, target, points, feet) {
  if (!points?.length || source.parent !== target.parent || source.level !== target.level) return false;
  const end = points.at(-1), grid = source.parent.grid;
  if (["x", "y", "elevation", "level"].some(k => end[k] !== source[k])) return false;
  const close = tokensDistance(source, target);
  if (close == null || close > 5) return false;
  let first = points.length - 1, direction;
  for (let i = points.length - 1; i > 0; i--) {
    const action = CONFIG.Token.movement.actions[points[i].action];
    if (!action?.measure || action.teleport || !equal(points[i], points[i - 1])) break;
    const segment = vector(points[i - 1], points[i], grid), distance = length(segment);
    if (!distance) { first = i - 1; continue; }
    direction ??= segment.map(n => n / distance);
    if (dot(segment, direction) < distance - 0.01) break;
    first = i - 1;
  }
  if (!direction || first === points.length - 1) return false;
  const measured = source.measureMovementPath(points.slice(first)).distance;
  if (dnd5e.utils.convertLength(measured, grid.units, "ft") + 0.001 < feet) return false;
  const origin = source.getCenterPoint(points[first]), goal = target.getCenterPoint();
  const towards = vector(origin, goal, grid), projection = dot(towards, direction);
  if (projection <= 0) return false;
  // Центры соседних клеток не обязаны лежать на одной линии: цель занимает пространство.
  const radius = Math.hypot(...Object.values(target.getSize())) / 2;
  return projection + radius >= length(vector(origin, source.getCenterPoint(), grid))
    && length(towards.map((n, i) => n - projection * direction[i])) <= radius + 0.01;
}
export function recordMonsterAttack(message) {
  if (message.type !== "attack") return;
  const activity = message.getAssociatedActivity(), source = message.getAssociatedToken();
  const dive = activity?.item.flags.spikependium?.dive, path = paths.get(source?.uuid);
  if (!dive || !path || path.turn !== turn() || !source?.actor?.testUserPermission(message.author ?? game.user, "OWNER")) return;
  const targets = attackHitTargets(message, { ignoreDefense: true }).filter(hit => diveSize(dive, hit.token.actor) && diveToward(source, hit.token, path.points, dive.feet)).map(hit => hit.token.uuid);
  if (targets.length) message.updateSource({ "flags.spikependium.monsterDive": { activity: activity.uuid, targets } });
}
function automaticDive(activity, message) {
  const saved = message.data?.flags?.spikependium?.attackSource;
  const attack = attackSource({ flags: { spikependium: { attackSource: saved } }, getAssociatedActivity: () => activity });
  const result = attack?.flags.spikependium?.monsterDive;
  if (result?.activity !== activity.uuid || !result.targets.length) return false;
  const targets = message.data?.system?.targets ?? [];
  const eligible = attack.system.targets.filter(t => result.targets.includes(t.token)).map(t => guardianTarget(attack, t).token);
  return targets.length > 0 && targets.every(t => eligible.includes(t.token));
}
function applyDive(roll, selected, formula = "1d4", eligible = roll.base, charge = false) {
  roll.parts = roll.parts.filter(p => p !== "@spikependiumDive");
  delete roll.data.spikependiumDive;
  if (roll.options) delete roll.options.spikependiumCharge;
  if (selected && eligible) {
    roll.parts.push("@spikependiumDive"); roll.data.spikependiumDive = formula;
    if (charge) { roll.options ??= {}; roll.options.spikependiumCharge = true; }
  }
}
export function prepareMonsterDamage(config, dialog, message) {
  const activity = config.subject;
  if (!activity?.item.flags.spikependium?.dive || activity.type !== "attack") return;
  const rule = activity.item.flags.spikependium.dive;
  const eligible = !(message.data?.system?.targets ?? []).some(target => {
    const actor = resolve(target.token)?.actor ?? resolve(target.actor);
    return actor && !diveSize(rule, actor);
  });
  config.spikependium = { ...config.spikependium, dive: config.spikependium?.dive ?? automaticDive(activity, message) };
  for (const [index, roll] of config.rolls.entries()) applyDive(roll, eligible && config.spikependium.dive === true, rule.formula, roll.base || (activity.item.type === "feat" && index === 0), activity.item.system.identifier === "au-dinosaur-gore");
  const Base = dialog.applicationClass ?? CONFIG.Dice.DamageRoll.DefaultConfigurationDialog;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConfigurationContext(context, options) {
      context = await super._prepareConfigurationContext(context, options);
      context.fields.push({ name: "spikependium.dive", value: this.config.spikependium.dive,
        field: new foundry.data.fields.BooleanField({ label: rule.label ?? "Лапы: движение 30 футов по прямой к цели перед попаданием",
          hint: `При подтверждении к основному урону добавляется ${rule.formula ?? "1d4"}. Если путь не записан или попадание разрешено вручную, подтвердите условие самостоятельно.` }) });
      return context;
    }
    _buildConfig(roll, formData, index) {
      roll = super._buildConfig(roll, formData, index);
      this.config.spikependium.dive = eligible && (formData?.get("spikependium.dive") ?? this.config.spikependium.dive);
      applyDive(roll, this.config.spikependium.dive === true, rule.formula, roll.base || (activity.item.type === "feat" && index === 0), activity.item.system.identifier === "au-dinosaur-gore");
      return roll;
    }
  };
}
function usable(actor) { return actor.isOwner && actor.system.attributes.hp.value > 0 && !incapacitated(actor); }
function hasSoulTome(actor) {
  return actor.items.some(item => item.system.identifier === "arcanaloth-soul-tome" && item.system.quantity > 0 && item.system.equipped
    && item.system.hp.value > 0 && !item.flags?.spikependium?.soulTome?.destroyed);
}
export function canUseMonsterWeapon(activity) {
  if (activity?.type !== "attack" || activity?.actor?.flags.spikependium?.key !== "actor:mm25:arcanaloth"
    || activity.item.system.identifier !== "arcanaloth-banishing-claw") return true;
  if (hasSoulTome(activity.actor)) return true;
  ui.notifications.warn("Изгоняющий коготь требует Фолиант душ: отметьте его как надетый и проверьте количество.");
  return false;
}
export function prepareMonsterSave(config, dialog, message) {
  const actor = config.subject;
  if (!actor?.isOwner || !actor.items?.some(item => item.flags.spikependium?.magicResistance)) return;
  // shortcut: магию без связанной карточки или свойства mgc подтверждают вручную; расширить при появлении штатной классификации источника.
  const origin = game.messages.get(message.data?.system?.origin), item = origin?.getAssociatedItem();
  if (item?.type !== "spell" && !item?.system?.properties?.has("mgc")) return;
  for (const roll of config.rolls) {
    roll.options ??= {};
    roll.options.disadvantage ||= roll.options.advantageMode === -1;
    roll.options.advantage = true;
    if (roll.options.advantageMode !== undefined) roll.options.advantageMode = roll.options.disadvantage ? 0 : 1;
  }
}
export async function useMonsterMultiattack(activity, config, results) {
  const rule = activity.flags.spikependium?.multiattack, actor = activity.actor;
  const level = actor.flags?.dnd5e?.summon?.level;
  const count = rule?.count === "spell" && /^actor:au-(plant|dinosaur|combat-familiar)-/.test(actor.flags?.spikependium?.key ?? "")
    && Number.isInteger(level) && level >= (actor.flags.spikependium.key.startsWith("actor:au-combat-familiar-") ? 2 : 5) && level <= 9 ? Math.floor(level / 2) : rule?.count;
  if (!rule || !Number.isSafeInteger(count) || count < 1 || !results?.message
    || results.message.flags.spikependium?.multiattack || results.message.author.id !== game.user.id || !usable(actor) || running.has(actor.uuid)) return;
  running.add(actor.uuid);
  let completed = 0, state = "stopped";
  const usedWeapons = new Map();
  try {
    await results.message.setFlag("spikependium", "multiattack", { state: "running", completed });
    for (let index = 0; index < count; index++) {
      const weapons = actor.items.filter(i => (rule.weapons ?? [rule.weapon]).includes(i.system.identifier)
        && (usedWeapons.get(i.system.identifier) ?? 0) < (rule.attackLimits?.[i.system.identifier] ?? Infinity)
        && (actor.flags?.spikependium?.key !== "actor:mm25:arcanaloth" || i.system.identifier !== "arcanaloth-banishing-claw" || hasSoulTome(actor)));
      const attacks = weapons.flatMap(weapon => [...weapon.system.activities].filter(a => a.type === "attack"));
      if (!usable(actor) || !attacks.length) return;
      const chosen = await foundry.applications.api.DialogV2.wait({ window: { title: `Мультиатака: атака ${index + 1} из ${count}` },
        content: `<p>Выберите цели на сцене и способ атаки.</p><select name="attack">${attacks.map(a => `<option value="${a.id}">${foundry.utils.escapeHTML(a.name)}</option>`).join("")}</select>`,
        buttons: [{ action: "attack", label: "Атаковать", callback: (event, button) => button.form.elements.attack.value },
          { action: "stop", label: "Завершить", callback: () => null }], close: () => null });
      const attack = attacks.find(a => a.id === chosen), weapon = weapons.find(i => i.system.activities.has(chosen));
      if (!attack || !usable(actor) || !actor.items.has(weapon.id)) return;
      const used = await attack.use({ consume: { action: false, resources: true, spellSlot: false }, subsequentActions: false }, {}, {});
      if (!used?.message) return;
      const rolls = await attack.rollAttack({}, {}, { data: { system: { origin: used.message.id } } });
      if (!rolls?.length) return;
      usedWeapons.set(weapon.system.identifier, (usedWeapons.get(weapon.system.identifier) ?? 0) + 1);
      completed++;
      await results.message.setFlag("spikependium", "multiattack", { state: "running", completed });
      const card = used.message.getAssociatedRolls?.("attack").at(-1);
      if (card && attackHitTargets(card).length) {
        const last = rolls[0];
        await attack.rollDamage({ isCritical: last.isCritical, ability: last.options?.ability, attackMode: last.options?.attackMode },
          last.isCritical ? { options: { defaultButton: "critical" } } : {}, { data: { system: { origin: card.id } } });
      }
    }
    const spell = rule.optionalSpell && [...actor.items].flatMap(i => [...(i.system.activities ?? [])])
      .find(a => a.type === "cast" && a.spell.uuid === rule.optionalSpell);
    if (spell && usable(actor) && await foundry.applications.api.DialogV2.confirm({ window: { title: "Мультиатака" }, content: "<p>Сотворить также Порыв ветра?</p>" }) && usable(actor))
      await spell.use({ consume: { action: false, resources: true, spellSlot: false } });
    if (rule.finishers?.length && usable(actor)) {
      const finishers = actor.items.filter(item => rule.finishers.includes(item.system.identifier)
        && (!item.system.uses.max || item.system.uses.value > 0)).flatMap(item => [...item.system.activities].filter(a => a.type === "save"));
      if (finishers.length) {
        const chosen = await foundry.applications.api.DialogV2.wait({ window: { title: "Мультиатака: завершающее действие" },
          content: `<p>Выберите подходящую цель и доступное действие.</p><select name="finisher">${finishers.map(a => `<option value="${a.id}">${foundry.utils.escapeHTML(a.name)}</option>`).join("")}</select>`,
          buttons: [{ action: "use", label: "Использовать", callback: (event, button) => button.form.elements.finisher.value },
            { action: "skip", label: "Завершить", callback: () => null }], close: () => null });
        const finisher = finishers.find(a => a.id === chosen);
        if (finisher && usable(actor)) await finisher.use({ consume: { action: false, resources: true, spellSlot: false } });
      }
    }
    state = "complete";
  } finally {
    running.delete(actor.uuid);
    await results.message.setFlag("spikependium", "multiattack", { state, completed });
  }
}
