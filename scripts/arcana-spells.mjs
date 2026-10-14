const KINDS = { "spell:au-iron-body": "iron-body", "spell:au-invulnerability": "invulnerability",
  "spell:au-zone-of-amity": "zone-of-amity",
  "spell:au-aura-of-evasion": "aura-of-evasion",
  "spell:au-lightning-ring":"lightning-ring", "spell:au-grave-ground":"grave-ground",
  "spell:au-instill-doubt": "instill-doubt", "spell:au-fractured-perception": "fractured-perception",
  "spell:au-mesmerizing-mirrors": "mesmerizing-mirrors", "spell:au-confusing-terrain": "confusing-terrain", "spell:au-putrid-burst": "putrid-burst",
  "spell:au-vision-of-ages": "vision-of-ages", "spell:au-catnap": "catnap", "spell:au-dissonant-tune": "dissonant-tune" };
const ABILITIES = { "instill-doubt": "wis", "fractured-perception": "int", "mesmerizing-mirrors": "int", "confusing-terrain": "int", "putrid-burst": "con", "vision-of-ages": "int", "dissonant-tune": "con" };
const MAX_TARGETS = { "mesmerizing-mirrors": 3, "confusing-terrain": 3, "putrid-burst": Infinity, catnap: 9, "dissonant-tune": Infinity };
const CONDITION = { "mesmerizing-mirrors": "stunned", "putrid-burst": "poisoned", "vision-of-ages": "paralyzed", catnap: "unconscious" };
const NON_CONCENTRATION = { "putrid-burst": 60, "vision-of-ages": 60, catnap: 600, "zone-of-amity": 600 };
const CURED = new Set(["paralyzed", "petrified", "poisoned"]);
const SELF = new Set(["invulnerability","lightning-ring","grave-ground","zone-of-amity","aura-of-evasion"]);
const syncing = new Map(), curing = new Set(), rolling = new Set();
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const kind = activity => activity?.type !== "damage" && !activity?.flags?.spikependium?.arcanaShakeTemplate && !activity?.flags?.spikependium?.arcanaStage
  && activity?.item?.type === "spell" ? KINDS[activity.item.flags.spikependium?.key] : undefined;
const live = effect => !!effect?.active && !effect.duration.expired && !(Number.isFinite(effect.duration.remaining) && effect.duration.remaining <= 0);
const actors = () => new Map([...game.actors, ...[...game.scenes].flatMap(scene => [...scene.tokens].map(t => t.actor))]
  .filter(Boolean).map(actor => [actor.uuid, actor]));
const updateValue = (data, path) => Object.hasOwn(data, path) ? data[path] : foundry.utils.getProperty(data, path);
const targetKey = actor => actor.uuid.replaceAll(".", "_");
const targetFlag = (origin, actor, flag) => MAX_TARGETS[origin.flags.spikependium.arcanaCast.kind]
  ? origin.flags.spikependium.arcanaTargets?.[targetKey(actor)]?.[flag] : origin.flags.spikependium[`arcana${flag}`];
const setTargetFlag = (origin, actor, flag, value) => origin.setFlag("spikependium", MAX_TARGETS[origin.flags.spikependium.arcanaCast.kind]
  ? `arcanaTargets.${targetKey(actor)}.${flag}` : `arcana${flag}`, value);
const immune = (actor, spell) => !!CONDITION[spell] && (actor.system.traits.ci?.value.has(CONDITION[spell]) || actor.system.traits.ci?.value.has("ALL"));

export function arcanaSpellSuppression(wrapped, ...args) {
  const spell = this.flags.spikependium?.arcanaSpell, actor = this.actor;
  if (spell === "dissonant-tune" && actor?.system.attributes.concentration?.ability && actor.system.attributes.concentration.ability !== "con") return true;
  if (!spell || !actor || (!MAX_TARGETS[spell] && !CONDITION[spell])) return wrapped(...args);
  if (immune(actor, spell) || (CONDITION[spell] && !this.statuses.has(CONDITION[spell]))) return true;
  const candidates = actor.effects.filter(effect => effect.flags.spikependium?.arcanaSpell === spell
    && !effect.disabled && !effect.duration.expired && !(Number.isFinite(effect.duration.remaining) && effect.duration.remaining <= 0)
    && (!CONDITION[spell] || effect.statuses.has(CONDITION[spell]))
    && (!effect.system.origin?.message || concentrating(arcanaCast(resolve(effect.system.origin.message)), resolve(effect.system.origin.message))));
  candidates.sort((a, b) => (b.flags.dnd5e?.spellLevel ?? 0) - (a.flags.dnd5e?.spellLevel ?? 0)
    || (b.start?.time ?? 0) - (a.start?.time ?? 0) || b.id.localeCompare(a.id));
  return (candidates.length > 0 && candidates[0] !== this) || wrapped(...args);
}

export function registerArcanaMaterials() {
  CONFIG.DND5E.activityConsumptionTypes.spikependiumMaterial = {
    label: "Запас расходуемого компонента", consume: consumeArcanaMaterial,
    consumptionLabels() {
      const required = this.item.system.properties.has("material") && this.item.system.materials.consumed;
      const supply = this.item.system.materials.supply;
      return { label: "Расходовать материальный компонент", hint: `Запас в заклинании: ${supply}. Один комплект на накладывание.`,
        warn: required && supply < 1 };
    }
  };
}
export async function consumeArcanaMaterial(config, updates) {
  const item = this.item;
  if (item.type !== "spell" || !item.system.properties.has("material") || !item.system.materials.consumed) return;
  const cost = (await this.resolveCost({ config, delta: { item: item.id, keyPath: "system.materials.supply" }, rolls: updates.rolls })).total;
  const supply = item.system.materials.supply;
  if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(supply) || supply < cost) {
    throw new dnd5e.dataModels.activity.ConsumptionError("Недостаточно расходуемого компонента. Укажите число комплектов в поле «Запас материалов» заклинания.");
  }
  const existing = updates.item.find(update => update._id === item.id);
  if (existing) existing["system.materials.supply"] = supply - cost;
  else updates.item.push({ _id: item.id, "system.materials.supply": supply - cost });
}

export function canUseArcanaSpell(activity) {
  // shortcut: комбинированные умения без отдельного действия Рывок разрешает Мастер; расширить при появлении штатного выбора действия в dnd5e.
  if (activity?.actor?.effects?.some(effect => effect.flags.spikependium?.arcanaSpell === "confusing-terrain" && live(effect))
    && (activity.item?.system.identifier === "dash" || activity.identifier === "dash"
      || (activity.type === "utility" && activity.item?.type === "feat" && ["dash", "рывок"].includes((activity.name ?? "").toLowerCase())))) {
    ui.notifications.warn("Неясная местность: Рывок недоступен, пока действует эффект."); return false;
  }
  const spell = kind(activity);
  if (!spell || SELF.has(spell)) return true;
  const targets = [...game.user.targets].map(token => token.document ?? token);
  if (spell === "catnap" && targets.some(target => target.actor?.flags.spikependium?.catnap?.used)) {
    ui.notifications.warn("Дрёма: одна из целей уже получила отдых от этого заклинания и должна завершить долгий отдых."); return false;
  }
  const max = MAX_TARGETS[spell] ?? 1;
  if (targets.length >= 1 && targets.length <= max && targets.every(target => target.actor?.system.isCreature)
    && new Set(targets.map(target => target.actor.uuid)).size === targets.length) return true;
  ui.notifications.warn(max === 1 ? "Выберите ровно один токен существа для этого заклинания."
    : Number.isFinite(max) ? `Выберите от одного до ${max} токенов существ.` : "Выберите токены существ в области заклинания.");
  return false;
}

export function recordArcanaCast(activity, message) {
  const spell = kind(activity);
  if (!spell || !activity.actor?.isOwner) return;
  const effect = activity.applicableEffects.find(e => e.flags.spikependium?.arcanaSpell === spell);
  if (!effect) return;
  foundry.utils.setProperty(message, "data.flags.spikependium.arcanaCast", { kind: spell, caster: activity.actor.uuid,
    activity: activity.uuid, effect: effect.toObject(), effectUuid: effect.uuid,
    dc: ABILITIES[spell] ? activity.save.dc.value : null, level: activity.item.system.level,
    time: game.time.worldTime, start: ActiveEffect.implementation.getEffectStart(),
    targets: SELF.has(spell)?[]:structuredClone(message.data?.system?.targets ?? []) });
  if (spell === "dissonant-tune") foundry.utils.setProperty(message, "data.flags.spikependium.arcanaCast.targetConcentration",
    (message.data?.system?.targets ?? []).map(target => ({ actor: target.actor,
      effects: resolve(target.actor)?.effects.filter(effect => effect.active && effect.system.type === "concentrating").map(effect => effect.uuid) ?? [] })));
  foundry.utils.setProperty(message, "data.flags.dnd5e.item.data", activity.item.toObject());
}

export function arcanaCast(origin) {
  const receipt = origin?.flags.spikependium?.arcanaCast, activity = origin?.getAssociatedActivity({ scaled: true });
  const caster = resolve(receipt?.caster);
  if (origin?.type !== "usage" || !receipt || kind(activity) !== receipt.kind || activity.uuid !== receipt.activity
    || !caster || !origin.author || !caster.testUserPermission(origin.author, "OWNER")
    || receipt.effect?.flags?.spikependium?.arcanaSpell !== receipt.kind) return;
  const source = activity.applicableEffects.find(effect => effect.id === receipt.effect._id
    && effect.flags.spikependium?.arcanaSpell === receipt.kind);
  if (!source || source.uuid !== receipt.effectUuid) return;
  if (!Array.isArray(receipt.targets) || (!SELF.has(receipt.kind) && receipt.targets.length > (MAX_TARGETS[receipt.kind] ?? 1))) return;
  if (receipt.kind === "catnap" && (!Number.isInteger(receipt.level) || receipt.level < 3 || receipt.level > 9 || receipt.targets.length > receipt.level)) return;
  const concentration = caster.effects.get(origin.system.concentration);
  return { receipt, activity, source, caster, concentration };
}
function arbitrate(origin) {
  return game.users.activeGM ? game.user.isActiveGM : origin.author?.id === game.user.id;
}
const concentrating = (info, origin) => NON_CONCENTRATION[info?.receipt.kind]
  ? Number.isFinite(info.receipt.time) && game.time.worldTime < info.receipt.time + NON_CONCENTRATION[info.receipt.kind]
  : !!info?.concentration && info.caster.effects.get(origin.system.concentration) === info.concentration && live(info.concentration);
export function arcanaEffectCast(effect) {
  const actor = effect?.actor, origin = resolve(effect?.system.origin?.message), info = arcanaCast(origin);
  if (!info || !actor || !live(effect) || !concentrating(info, origin) || targetFlag(origin, actor, "Ended")
    || effect.flags.spikependium?.arcanaSpell !== info.receipt.kind
    || !(SELF.has(info.receipt.kind) ? actor.uuid === info.caster.uuid : info.receipt.targets.some(target => target.actor === actor.uuid))) return;
  return { ...info, actor, origin };
}
export async function endArcanaEffect(effect) {
  const info = arcanaEffectCast(effect);
  if (!info || !info.actor.isOwner) return;
  const path = MAX_TARGETS[info.receipt.kind] ? `flags.spikependium.arcanaTargets.${targetKey(info.actor)}.Ended` : "flags.spikependium.arcanaEnded";
  await foundry.documents.modifyBatch([
    { action: "update", documentName: "ChatMessage", updates: [{ _id: info.origin.id, [path]: true }] },
    { action: "delete", documentName: "ActiveEffect", parent: info.actor, ids: [effect.id] }
  ]);
}
export function canConsumeArcanaSpell(activity, config, message) {
  if (kind(activity) !== "catnap") return true;
  const targets = message.data?.system?.targets ?? [];
  if (targets.length > activity.item.system.level || targets.some(target => resolve(target.actor)?.flags.spikependium?.catnap?.used)) {
    ui.notifications.warn("Дрёма: выбранная ячейка не поддерживает столько целей или одна из целей уже получила этот отдых."); return false;
  }
  return true;
}
async function visionExhaustion(effect, event) {
  if (!game.user.isActiveGM || effect.flags.spikependium?.arcanaExhaustionEvent === event || !arcanaEffectCast(effect)) return;
  const actor = effect.actor;
  if (actor.system.traits.ci?.value.has("exhaustion") || actor.system.traits.ci?.value.has("ALL")
    || actor.effects.some(e => e.flags.spikependium?.arcanaSpell === "iron-body" && live(e))) {
    await effect.setFlag("spikependium", "arcanaExhaustionEvent", event); return;
  }
  const id = dnd5e.utils.staticID("dnd5eexhaustion"), existing = actor.effects.get(id);
  const operations = [];
  if (existing) operations.push({ action: "update", documentName: "ActiveEffect", parent: actor,
    updates: [{ _id: existing.id, "system.level": Math.min(6, (existing.system.level ?? 0) + 1) }] });
  else {
    const condition = await ActiveEffect.implementation.fromStatusEffect("exhaustion"), data = condition.toObject();
    data._id = id; data.system.level = 1;
    operations.push({ action: "create", documentName: "ActiveEffect", parent: actor, keepId: true, data: [data] });
  }
  if (!game.user.isActiveGM || !arcanaEffectCast(effect) || effect.flags.spikependium?.arcanaRepeatRequest?.event !== event) return;
  operations.push({ action: "update", documentName: "ActiveEffect", parent: actor,
    updates: [{ _id: effect.id, "flags.spikependium.arcanaExhaustionEvent": event }] });
  await foundry.documents.modifyBatch(operations);
}
function latestSave(origin, actor, target, receipt) {
  return origin.getAssociatedRolls("save").filter(message => !message.flags.spikependium?.arcanaRepeat
    && message.system.ability === ABILITIES[receipt.kind] && message.getAssociatedActor()?.uuid === actor.uuid
    && (!target?.token || message.getAssociatedToken()?.uuid === target.token)).at(-1);
}
function outcome(message, actor, ability, dc) {
  const roll = message?.rolls[0];
  if (!message?.author || (!message.author.isGM && !actor.testUserPermission(message.author, "OWNER"))
    || message.system.ability !== ability || !(roll instanceof CONFIG.Dice.D20Roll) || !roll._evaluated
    || !Number.isFinite(dc) || roll.options.target !== dc) return;
  return message.system.forceSuccess || !roll.isFailure ? "success" : "failure";
}

async function apply(origin, actor, target, info) {
  if (!actor.isOwner || !concentrating(info, origin)) return;
  const existing = actor.effects.find(e => e.system.origin?.message === origin.uuid && e.flags.spikependium?.arcanaSpell === info.receipt.kind);
  if (existing) {
    await cureIronBody(existing);
    if (!targetFlag(origin, actor, "Applied")) await setTargetFlag(origin, actor, "Applied", true);
    return;
  }
  if (targetFlag(origin, actor, "Applied") || targetFlag(origin, actor, "Ended")) return;
  if (info.receipt.kind === "catnap" && actor.flags.spikependium?.catnap?.used) {
    await setTargetFlag(origin, actor, "Applied", true); return;
  }
  if (immune(actor, info.receipt.kind)) { await setTargetFlag(origin, actor, "Applied", true); return; }
  // The native tray refreshes the same profile; an older card must not replace a newer cast.
  if (actor.effects.some(e => e._stats?.duplicateSource === info.receipt.effectUuid
    && (resolve(e.system.origin?.message)?.timestamp ?? 0) > origin.timestamp)) return;
  const tray = new dnd5e.applications.components.EffectApplicationElement();
  tray.chatMessage = origin;
  const { action, data } = await tray._prepareEffectData(info.source, actor);
  if (!arbitrate(origin) || !concentrating(info, origin) || !actor.isOwner) return;
  if (ABILITIES[info.receipt.kind]) {
    const saved = latestSave(origin, actor, target, info.receipt);
    if (outcome(saved, actor, ABILITIES[info.receipt.kind], info.receipt.dc) !== "failure") return;
  }
  data.system.magical = true;
  if (NON_CONCENTRATION[info.receipt.kind]) data.start = info.receipt.start;
  const effects = action === "create" ? await actor.createEmbeddedDocuments("ActiveEffect", [data])
    : await actor.updateEmbeddedDocuments("ActiveEffect", [data]);
  for (const effect of effects) await cureIronBody(effect);
  await setTargetFlag(origin, actor, "Applied", true);
}

export async function syncArcanaCast(message) {
  if (!message || message.flags.spikependium?.arcanaRepeat) return;
  const origin = message.type === "usage" ? message : message.type === "save" ? message.getOriginatingMessage() : null;
  const info = arcanaCast(origin);
  if (!info || !arbitrate(origin)) return;
  const running = syncing.get(origin.uuid);
  if (running) { running.pending = true; return; }
  const state = { pending: true }; syncing.set(origin.uuid, state);
  try {
    do {
      state.pending = false;
      if (info.receipt.kind === "dissonant-tune" && game.time.worldTime < info.receipt.time + 60) {
        for (const target of info.receipt.targets) {
          if (!arbitrate(origin)) return;
          const actor = resolve(target.actor);
          if (!actor?.isOwner || targetFlag(origin, actor, "ConcentrationBroken")
            || outcome(latestSave(origin, actor, target, info.receipt), actor, "con", info.receipt.dc) !== "failure") continue;
          const saved = info.receipt.targetConcentration?.find(target => target.actor === actor.uuid);
          const ids = (saved?.effects ?? []).map(uuid => resolve(uuid)).filter(effect => effect?.actor?.uuid === actor.uuid && effect.active && effect.system.type === "concentrating").map(effect => effect.id);
          await foundry.documents.modifyBatch([
            ...(ids.length ? [{ action: "delete", documentName: "ActiveEffect", parent: actor, ids }] : []),
            { action: "update", documentName: "ChatMessage", updates: [{ _id: origin.id, [`flags.spikependium.arcanaTargets.${targetKey(actor)}.ConcentrationBroken`]: true }] }
          ]);
        }
      }
      if (!concentrating(info, origin) || !arbitrate(origin)) return;
      const targets = SELF.has(info.receipt.kind) ? [{ actor: info.caster.uuid }] : info.receipt.targets;
      const visited = new Set();
      for (const target of targets) {
        const actor = resolve(target.actor);
        if (!actor?.isOwner || !actor.system.isCreature || visited.has(actor.uuid) || targetFlag(origin, actor, "Ended")) continue;
        visited.add(actor.uuid);
        const ability = ABILITIES[info.receipt.kind];
        const result = ability ? outcome(latestSave(origin, actor, target, info.receipt), actor, ability, info.receipt.dc) : "failure";
        if (!result) continue;
        if (result === "success") {
          const ids = actor.effects.filter(e => e.system.origin?.message === origin.uuid).map(e => e.id);
          if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
          if (targetFlag(origin, actor, "Applied")) await setTargetFlag(origin, actor, "Applied", false);
          if (info.receipt.kind === "fractured-perception" && concentrating(info, origin)) await info.concentration.delete();
        } else await apply(origin, actor, target, info);
      }
    } while (state.pending);
  } finally { syncing.delete(origin.uuid); }
}

export async function cureIronBody(effect) {
  const actor = effect?.actor, origin = resolve(effect?.system.origin?.message), info = arcanaCast(origin);
  if (!actor?.isOwner || effect.flags.spikependium?.arcanaSpell !== "iron-body" || !live(effect)
    || !info || info.receipt.kind !== "iron-body" || !arbitrate(origin)
    || info.receipt.targets[0]?.actor !== actor.uuid || effect.flags.spikependium?.arcanaCured === origin.uuid || curing.has(effect.uuid)) return;
  curing.add(effect.uuid);
  try {
    for (const condition of [...actor.effects]) {
      if (condition === effect || ![...condition.statuses].some(status => CURED.has(status))) continue;
      const statuses = [...condition.statuses].filter(status => !CURED.has(status));
      if (condition.type === "condition" || (!statuses.length && !condition.system.changes?.length)) await condition.delete();
      else await condition.update({ statuses });
    }
    await effect.setFlag("spikependium", "arcanaCured", origin.uuid);
  } finally { curing.delete(effect.uuid); }
}

export function guardIronExhaustion(effect, data) {
  const actor = effect.actor;
  if (!actor || !actor.effects.some(e => e.flags.spikependium?.arcanaSpell === "iron-body" && live(e))) return;
  if ((updateValue(data, "type") ?? effect.type) !== "condition"
    || (updateValue(data, "system.type") ?? effect.system.type) !== "exhaustion") return;
  if ((updateValue(data, "disabled") ?? effect.disabled) || (updateValue(data, "duration.expired") ?? effect.duration.expired)) return;
  const level = updateValue(data, "system.level") ?? effect.system.level ?? 1;
  if (level > (actor.system.attributes.exhaustion ?? 0)) {
    ui.notifications.warn("Железное тело: уровень истощения не может увеличиться, пока защитный эффект активен.");
    return false;
  }
}

export async function syncArcanaRepeat(message) {
  const request = message?.flags.spikependium?.arcanaRepeat;
  if (!request || message.type !== "save" || !game.user.isActiveGM || !message.author?.isGM) return;
  const effect = resolve(request.effect), actor = effect?.actor, origin = resolve(effect?.system.origin?.message), info = arcanaCast(origin);
  if (!info || !actor?.isOwner || actor.uuid !== request.actor || !live(effect) || !concentrating(info, origin)
    || request.origin !== origin.uuid || request.event !== effect.flags.spikependium?.arcanaRepeatRequest?.event
    || message.getOriginatingMessage()?.uuid !== origin.uuid || message.getAssociatedActor()?.uuid !== actor.uuid
    || request.dc !== info.receipt.dc || request.ability !== ABILITIES[info.receipt.kind]) return;
  if (outcome(message, actor, request.ability, request.dc) === "success") {
    await endArcanaEffect(effect);
  } else if (info.receipt.kind === "vision-of-ages" && outcome(message, actor, request.ability, request.dc) === "failure") {
    await visionExhaustion(effect, request.event);
  }
}

async function rollRepeat(effect, request) {
  if (!game.user.isActiveGM || rolling.has(effect.uuid) || !live(effect)) return;
  const actor = effect.actor, origin = resolve(effect.system.origin?.message), info = arcanaCast(origin);
  if (!info || !concentrating(info, origin) || !actor.isOwner || !ABILITIES[info.receipt.kind] || info.receipt.kind === "dissonant-tune") return;
  const findCard = () => game.messages.find(m => m.author?.isGM && m.type === "save"
    && m.flags.spikependium?.arcanaRepeat?.event === request.event
    && m.flags.spikependium.arcanaRepeat.effect === effect.uuid && m.flags.spikependium.arcanaRepeat.origin === origin.uuid);
  const existing = findCard();
  rolling.add(effect.uuid);
  try {
    if (existing) await syncArcanaRepeat(existing);
    else {
      const token = resolve(request.token);
      const hidden = token?.hidden || origin.blind || origin.whisper.length;
      await actor.rollSavingThrow({ ability: ABILITIES[info.receipt.kind], target: info.receipt.dc }, { configure: false }, {
        rollMode: hidden ? "gm" : "public", data: {
          speaker: ChatMessage.getSpeaker({ actor, token, scene: token?.parent }),
          flavor: `${foundry.utils.escapeHTML(info.activity.item.name)} — повторный спасбросок в конце хода`,
          ...(origin.whisper.length ? { whisper: [...origin.whisper], blind: origin.blind } : {}),
          system: { origin: origin.id }, flags: { spikependium: { arcanaRepeat: { ...request, effect: effect.uuid,
            actor: actor.uuid, origin: origin.uuid, dc: info.receipt.dc, ability: ABILITIES[info.receipt.kind] } } }
        }
      });
      const card = findCard();
      if (card) await syncArcanaRepeat(card);
      else ui.notifications.warn("Повторный спасбросок не создал карточку. Разрешите его вручную на листе цели.");
    }
    if (info.receipt.kind === "vision-of-ages" && resolve(effect.uuid) === effect
      && outcome(findCard(), actor, "int", info.receipt.dc) === "failure" && effect.flags.spikependium?.arcanaExhaustionEvent !== request.event) return;
    if (game.user.isActiveGM && resolve(effect.uuid) === effect)
      await effect.setFlag("spikependium", "arcanaRepeatRequest", { ...request, pending: false });
  } finally { rolling.delete(effect.uuid); }
}

export async function arcanaEndTurn(wrapped, combatant) {
  // shortcut: вне боя нет события конца хода; спасбросок разрешает Мастер, пока не появится общий отсчёт раундов вне боя.
  const result = await wrapped(combatant);
  if (!game.user.isActiveGM || !combatant?.actor || !Number.isInteger(this.previous?.round) || this.previous.round < 1) return result;
  const actor = combatant.actor;
  for (const effect of [...actor.effects]) {
    if (!ABILITIES[effect.flags.spikependium?.arcanaSpell] || effect.flags.spikependium.arcanaSpell === "dissonant-tune" || !live(effect)) continue;
    const event = `${this.id}:${this.previous.round}:${this.previous.turn}:${combatant.id}:${effect.uuid}`;
    if (effect.flags.spikependium?.arcanaRepeatRequest?.event === event) continue;
    const request = { event, token: combatant.token?.uuid, pending: true };
    try {
      await effect.setFlag("spikependium", "arcanaRepeatRequest", request);
      await rollRepeat(effect, request);
    } catch (error) { arcanaSpellError(error); }
  }
  return result;
}

export async function resumeArcanaSpells() {
  if (!game.user.isActiveGM) return;
  for (const origin of game.messages) if (origin.flags.spikependium?.arcanaCast) await syncArcanaCast(origin);
  for (const actor of actors().values()) for (const effect of [...actor.effects]) {
    await cureIronBody(effect);
    const request = effect.flags.spikependium?.arcanaRepeatRequest;
    if (request?.pending) await rollRepeat(effect, request);
  }
}

export function arcanaSpellError(error) {
  console.error("Spikependium: заклинания Неудержимой магии", error);
  ui.notifications.error("Не удалось завершить эффект заклинания. Проверьте его штатную карточку и эффекты на листе; подробности в консоли.");
}
