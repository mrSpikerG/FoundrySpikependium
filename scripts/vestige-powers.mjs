import { incapacitated, tokensDistance } from "./effects.mjs";
import { vestigeTokens, vestigeLocked, pendingVestigeForm } from "./pocket.mjs";

const CURSE = "74BTP7gJ0HYZzihk", TOUCH = "662KdJM55taoeTAL";
const CURSE_PROFILE = "vBCsQaJimSSW549k";
const FEATURE = "subclass:vestige-patron:vestige-companion";
const CONDITIONS = { blinded: "Ослеплённый", deafened: "Оглохший", poisoned: "Отравленный" };
const applying = new Set(), curing = new Set();
const kind = a => a?.id === CURSE && a.actor?.flags.spikependium?.key === "actor:vestige-undead" ? "curse"
  : a?.id === TOUCH && a.actor?.flags.spikependium?.key === "actor:vestige-celestial" ? "touch" : null;
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const active = e => !e.disabled && !e.isSuppressed && !e.duration.expired
  && !(Number.isFinite(e.duration.remaining) && e.duration.remaining <= 0);

function context(activity, targets) {
  const mode = kind(activity);
  if (!mode) return;
  const source = activity.getUsageToken(), item = resolve(activity.actor.flags.dnd5e?.summon?.origin);
  const target = targets.length === 1 ? resolve(targets[0].token) : null;
  const distance = source && target && tokensDistance(source, target);
  if (item?.flags.spikependium?.key !== FEATURE || source?.actor.uuid !== activity.actor.uuid
    || !vestigeTokens(item).includes(source) || item.actor.statuses.has("dead") || incapacitated(source.actor)
    || source.actor.system.attributes.hp.value <= 0 || source.actor.statuses.has("antimagic") || vestigeLocked(item) || pendingVestigeForm(item)
    || !target?.actor.system.isCreature || target.actor.uuid !== targets[0].actor || source.level !== target.level
    || distance == null || distance > (mode === "curse" ? 30 : 5)
    || (mode === "touch" && target.actor.uuid === source.actor.uuid)) return;
  return { source: source.uuid, owner: item.actor.uuid, origin: item.uuid, target: target.uuid, actor: target.actor.uuid,
    relic: source.actor.uuid, mode, time: game.time.worldTime };
}

export function canUseVestigePower(activity) {
  if (!kind(activity)) return true;
  const targets = [...game.user.targets].map(t => ({ token: (t.document ?? t).uuid, actor: (t.document ?? t).actor?.uuid }));
  if (context(activity, targets)) return true;
  ui.notifications.warn("Божественная сила: выберите одну допустимую цель на сцене живого реликта (касание — 5 футов, проклятие — 30 футов). Небожитель касается другого существа.");
  return false;
}

export function recordVestigePower(activity, message) {
  if (!kind(activity)) return;
  const record = context(activity, message.data.system.targets ?? []);
  if (record) foundry.utils.setProperty(message, "data.flags.spikependium.vestigePower", record);
}

export function vestigeCurseChanges(wrapped, effect, options = {}) {
  const changes = wrapped(effect, options);
  if (kind(this) !== "curse") return changes;
  const message = options.chatMessage, record = message?.flags.spikependium?.vestigePower;
  if (!record || record.mode !== "curse" || record.actor !== options.target?.uuid
    || record.relic !== this.actor.uuid || resolve(this.actor.flags.dnd5e?.summon?.origin)?.actor.uuid !== record.owner
    || game.time.worldTime - record.time < 0 || game.time.worldTime - record.time >= 60)
    throw Error("Проклятие доступно только выбранной цели этого применения в течение минуты");
  return foundry.utils.mergeObject(changes, {
    flags: { spikependium: { vestigeCurse: { owner: record.owner, relic: record.relic, origin: this.actor.flags.dnd5e.summon.origin } } },
    system: { magical: true }, start: { ...ActiveEffect.implementation.getEffectStart(), time: record.time },
    duration: { value: 60, units: "seconds", expiry: null, expired: false }
  });
}

export async function applyVestigeCurse(message) {
  if (!game.user.isActiveGM || message.type !== "usage" || message.flags.spikependium?.vestigeCurseApplied || applying.has(message.uuid)) return;
  const activity = message.getAssociatedActivity(), record = message.flags.spikependium?.vestigePower;
  if (kind(activity) !== "curse" || !record || !message.author || !activity.actor.testUserPermission(message.author, "OWNER")) return;
  const current = context(activity, message.system.targets);
  if (!current || ["source", "owner", "origin", "target", "actor", "relic", "mode"].some(k => current[k] !== record[k])
    || game.time.worldTime - record.time < 0 || game.time.worldTime - record.time >= 60) return;
  const target = resolve(record.target).actor;
  applying.add(message.uuid);
  try {
    if (!target.effects.some(e => e.system.origin?.message === message.uuid && e.flags.spikependium?.vestigeCurse)) {
      const profile = activity.item.effects.find(e => e.flags.spikependium?.vestigeCurse) ?? new ActiveEffect.implementation({
        _id: CURSE_PROFILE, name: "Проклятое воззвание", img: "icons/magic/unholy/hand-marked-pink.webp", type: "base",
        transfer: false, duration: { value: 60, units: "seconds", expiry: null, expired: false },
        flags: { spikependium: { vestigeCurse: {} } }, system: { changes: [] }
      }, { parent: activity.item });
      const tray = new dnd5e.applications.components.EffectApplicationElement(); tray.chatMessage = message;
      const { action, data } = await tray._prepareEffectData(profile, target);
      data.system.origin.profile = profile.id;
      if (!game.user.isActiveGM || resolve(record.target)?.actor !== target || game.time.worldTime - record.time >= 60) return;
      if (action === "create") await target.createEmbeddedDocuments("ActiveEffect", [data]);
      else await target.updateEmbeddedDocuments("ActiveEffect", [data]);
    }
    await message.setFlag("spikependium", "vestigeCurseApplied", true);
  } finally { applying.delete(message.uuid); }
}

export function cursedAgainst(actor, uuid) {
  const target = resolve(uuid);
  return (actor?.appliedEffects ?? actor?.effects ?? []).some(e => active(e) && e.flags.spikependium?.vestigeCurse
    && (e.start?.time == null || game.time.worldTime - e.start.time < 60)
    && ([e.flags.spikependium.vestigeCurse.owner, e.flags.spikependium.vestigeCurse.relic].includes(uuid)
      || !!e.flags.spikependium.vestigeCurse.origin && target?.flags.spikependium?.key?.startsWith("actor:vestige-")
        && target.flags.dnd5e?.summon?.origin === e.flags.spikependium.vestigeCurse.origin));
}

export function prepareVestigeCurseAttack(config, dialog, message) {
  const actor = config.subject?.actor;
  const effects = (actor?.appliedEffects ?? actor?.effects ?? []).filter(e => active(e) && e.flags.spikependium?.vestigeCurse);
  if (!effects.length) return;
  const targets = message.data?.system?.targets ?? [];
  if (targets.length === 1) { config.spikependium = { ...config.spikependium, curseTarget: targets[0].actor }; return; }
  const choices = targets.length ? {} : { other: "Другая цель (помеха проклятия не применяется)" };
  if (!targets.length) for (const e of effects) {
    const rule = e.flags.spikependium.vestigeCurse;
    const relic = rule.origin && [...game.scenes].flatMap(s => [...s.tokens]).find(t => t.actor?.flags.spikependium?.key?.startsWith("actor:vestige-")
      && t.actor.flags.dnd5e?.summon?.origin === rule.origin)?.actor;
    for (const uuid of [rule.owner, relic?.uuid ?? rule.relic]) choices[uuid] = resolve(uuid)?.name ?? (uuid === rule.owner ? "Хозяин реликта" : "Реликт");
  }
  for (const target of targets) choices[target.actor] = target.name;
  config.spikependium = { ...config.spikependium, curseTarget: targets[0]?.actor ?? "other" };
  const Base = dialog.applicationClass ?? CONFIG.Dice.D20Roll.DefaultConfigurationDialog;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConfigurationContext(context, options) {
      context = await super._prepareConfigurationContext(context, options);
      context.fields.push({ name: "spikependium.curseTarget", value: this.config.spikependium?.curseTarget ?? "other",
        field: new foundry.data.fields.StringField({ label: "Цель атаки: действует Проклятое воззвание", required: true, blank: false, choices }) });
      return context;
    }
    _buildConfig(roll, formData, index) {
      roll = super._buildConfig(roll, formData, index);
      this.config.spikependium = { ...this.config.spikependium, curseTarget: formData?.get("spikependium.curseTarget") ?? this.config.spikependium?.curseTarget };
      return roll;
    }
  };
}

export function finalizeVestigeCurseAttack(rolls, config, dialog, message) {
  const selected = config.spikependium?.curseTarget;
  if (!selected) return;
  if (message.data?.system?.targets?.length > 1 && message.data.system.targets.some(t => t.actor === selected))
    message.data.system.targets = message.data.system.targets.filter(t => t.actor === selected);
  if (!cursedAgainst(config.subject?.actor, selected)) return;
  for (const roll of rolls) {
    const advantage = roll.options.advantage || roll.options.advantageMode === 1;
    roll.options.disadvantage = true;
    roll.options.advantageMode = advantage ? 0 : -1;
    roll.configureModifiers();
  }
}

function touchUsage(message) {
  const usage = typeof message?.system?.origin === "string" ? game.messages.get(message.system.origin) : message?.system?.origin;
  return usage?.type === "usage" && kind(usage.getAssociatedActivity()) === "touch" ? usage : null;
}

export function recordVestigeTouch(actor, amount, updates, options) {
  const message = options.origin, usage = touchUsage(message), record = usage?.flags.spikependium?.vestigePower;
  if (!actor.isOwner || amount > 0 || message?.type !== "healing" || record?.mode !== "touch" || record.actor !== actor.uuid
    || actor.flags.spikependium?.vestigeTouch?.event === usage.uuid || actor.flags.spikependium?.vestigeTouch?.state === "pending") return;
  const effects = (actor.appliedEffects ?? actor.effects).filter(active).flatMap(e => [...e.statuses]
    .filter(s => Object.hasOwn(CONDITIONS, s)).map(status => ({ uuid: e.uuid, status })));
  foundry.utils.setProperty(updates, "flags.spikependium.vestigeTouch", { event: usage.uuid, message: message.uuid, state: "pending", effects });
}

export async function finishVestigeTouch() {
  if (!game.user.isActiveGM) return;
  const actors = new Map([...game.actors, ...[...game.scenes].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean).map(a => [a.uuid, a]));
  for (const actor of actors.values()) {
    const record = actor.flags.spikependium?.vestigeTouch;
    if (record?.state !== "pending" || curing.has(actor.uuid)) continue;
    const message = resolve(record.message), usage = touchUsage(message), power = usage?.flags.spikependium?.vestigePower;
    const activity = usage?.getAssociatedActivity();
    if (!power || power.actor !== actor.uuid || power.mode !== "touch" || record.event !== usage.uuid
      || !usage.author || !activity.actor.testUserPermission(usage.author, "OWNER")) continue;
    curing.add(actor.uuid);
    try {
      const owned = new Set(actor.appliedEffects ?? actor.effects);
      const available = record.effects.filter(e => Object.hasOwn(CONDITIONS, e.status)
        && owned.has(resolve(e.uuid)) && resolve(e.uuid).statuses.has(e.status) && active(resolve(e.uuid)));
      let selected = record.selected;
      if (selected && !Object.hasOwn(CONDITIONS, selected)) throw Error("Недопустимое состояние для Исцеляющего касания");
      if (!selected && available.length) {
        const choices = [...new Set(available.map(e => e.status))];
        if (choices.length === 1) selected = choices[0];
        else {
          const owner = resolve(power.owner);
          const user = !message.blind && !message.whisper?.length ? game.users.filter(u => u.active && !u.isGM && owner?.testUserPermission(u, "OWNER")).sort((a,b)=>a.id.localeCompare(b.id))[0] : null;
          const response = await foundry.applications.api.DialogV2.query(user ?? game.user, "input", { rejectClose: false,
            window: { title: "Исцеляющее касание — снять одно состояние" },
            content: '<div class="form-group"><label>Состояние</label><select name="status">' + choices.map(s=>`<option value="${s}">${CONDITIONS[s]}</option>`).join("") + '</select></div>',
            ok: { label: "Снять состояние" } });
          if (response == null || !game.user.isActiveGM || actor.flags.spikependium.vestigeTouch.event !== record.event) continue;
          if (!choices.includes(response.status)) continue;
          selected = response.status;
        }
        await actor.setFlag("spikependium", "vestigeTouch.selected", selected);
      }
      if (actor.flags.spikependium.vestigeTouch.event !== record.event) continue;
      for (const saved of available.filter(e => e.status === selected)) {
        const effect = resolve(saved.uuid);
        if (!game.user.isActiveGM) break;
        if (!effect?.statuses.has(selected) || !active(effect)) continue;
        if (effect.statuses.size === 1 && !effect.system.changes?.length) await effect.delete();
        else await effect.update({ statuses: [...effect.statuses].filter(s => s !== selected) });
      }
      if (game.user.isActiveGM) await actor.setFlag("spikependium", "vestigeTouch.state", "done");
    } finally { curing.delete(actor.uuid); }
  }
}
