import { tokensDistance } from "./effects.mjs";

const FEAR_ID = "KutWcRCXPHmd74hD";
const prompting = new Set();
const applying = new Map();
const turnKey = combat => combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : null;
const isThinFear = activity => activity?.id === FEAR_ID
  && activity.actor.flags.spikependium?.key?.startsWith("actor:reanimated-companion:")
  && activity.actor.flags.spikependium.key.endsWith(":thin");
const fearImmune = actor => actor.system.traits?.ci?.value?.has("frightened") || actor.system.traits?.ci?.value?.has("ALL");

export function thinSources(target) {
  if (!target?.actor || target.actor.statuses.has("dead") || fearImmune(target.actor)) return [];
  return [...(target.parent?.tokens ?? [])].flatMap(source => {
    const actor = source.actor;
    if (actor?.system.attributes.hp?.value <= 0 || actor?.statuses.has("dead")) return [];
    const activity = actor ? [...actor.items].flatMap(i => [...i.system.activities]).find(isThinFear) : null;
    const distance = activity ? tokensDistance(source, target) : null;
    return activity && distance != null && distance <= 10 ? [{ source, activity }] : [];
  });
}

export function thinEffectChanges(wrapped, effect, options) {
  const changes = wrapped(effect, options);
  if (isThinFear(this) && effect.statuses.has("frightened") && effect.duration.expiry === "turnStart")
    changes.duration = { ...changes.duration, expiry: "targetStart", value: null };
  return changes;
}

export async function chooseThinFear(combat, changed, options = {}) {
  if (!game.user.isActiveGM || (!Object.hasOwn(changed, "round") && !Object.hasOwn(changed, "turn")) || options.direction < 0) return;
  const turn = turnKey(combat);
  const target = combat.combatant?.token;
  if (!turn || !target || combat.round < 1) return;
  const choices = thinSources(target);
  for (const { source, activity } of choices) {
    const event = `${turn}:${source.uuid}:${target.uuid}`;
    const decision = combat.flags.spikependium?.thinFear;
    if (prompting.has(event) || (decision?.turn === turn && decision.events.includes(event))
      || game.messages.some(m => m.flags.spikependium?.thinFear?.event === event)) continue;
    if (turnKey(combat) !== turn || !game.user.isActiveGM) return;
    const effect = activity.item.effects.find(e => e.statuses.has("frightened"));
    if (!effect || !Number.isFinite(activity.save.dc.value)) continue;
    prompting.add(event);
    try {
      await combat.setFlag("spikependium", "thinFear", { turn, events: [...(decision?.turn === turn ? decision.events : []), event] });
      if (turnKey(combat) !== turn || !game.user.isActiveGM) return;
      const creator = fromUuidSync(activity.actor.flags.dnd5e?.summon?.origin)?.actor;
      const owner = !target.hidden && !combat.combatant.hidden
        ? game.users.filter(u => u.active && !u.isGM && creator?.testUserPermission(u, "OWNER")).sort((a, b) => a.id.localeCompare(b.id))[0]
        : null;
      const selected = await foundry.applications.api.DialogV2.query(owner ?? game.user, "confirm", {
        window: { title: "Тощий спутник — пугающая эманация" }, rejectClose: false,
        content: `<p>${foundry.utils.escapeHTML(target.name)} начинает ход в пределах 10 футов от ${foundry.utils.escapeHTML(source.name)}. Потребовать спасбросок Мудрости?</p>`,
        yes: { label: "Применить страх", default: false }, no: { label: "Пропустить", default: true }
      });
      if (selected !== true) continue;
      if (!game.user.isActiveGM || turnKey(combat) !== turn || combat.combatant?.token?.uuid !== target.uuid
        || fromUuidSync(target.uuid) !== target || fromUuidSync(source.uuid) !== source
        || source.actor.system.attributes.hp.value <= 0 || source.actor.statuses.has("dead")) {
        ui.notifications.warn("Начало хода для пугающей эманации уже прошло или спутник исчез. Используйте действие вручную при необходимости.");
        continue;
      }
      const results = await activity.use({ consume: false, subsequentActions: false, create: { measuredTemplate: false } }, { configure: false }, {
        rollMode: target.hidden || combat.combatant.hidden ? "gm" : "public",
        data: { speaker: ChatMessage.getSpeaker({ actor: source.actor, token: source, scene: target.parent }),
          system: { targets: [{ actor: target.actor.uuid, token: target.uuid, name: target.name, img: target.texture.src,
            ac: target.actor.system.attributes.ac.value }] },
          flags: { spikependium: { thinFear: { event, turn, combat: combat.uuid, target: target.uuid,
            activity: activity.uuid, effect: effect.toObject(), effectUuid: effect.uuid, dc: activity.save.dc.value } },
            dnd5e: { item: { data: activity.item.toObject() } } } }
      });
      if (!results?.message) throw Error("Пугающая эманация не создала карточку спасброска");
    } catch (error) {
      if (!game.messages.some(m => m.flags.spikependium?.thinFear?.event === event)) {
        const current = combat.flags.spikependium?.thinFear;
        if (current?.turn === turn) await combat.setFlag("spikependium", "thinFear", { turn, events: current.events.filter(e => e !== event) });
      }
      console.error("Spikependium: пугающая эманация", error);
      ui.notifications.error("Не удалось закончить выбор пугающей эманации. Проверьте чат; при отсутствии карточки используйте действие на листе спутника.");
    } finally { prompting.delete(event); }
  }
}

export function prepareThinSave(message) {
  if (message.type !== "save" || message.system.ability !== "wis") return;
  const origin = message.getOriginatingMessage();
  const receipt = origin.flags.spikependium?.thinFear;
  if (!receipt || !origin.author?.isGM) return;
  const target = fromUuidSync(receipt.target);
  if (!target?.actor || message.speaker.actor !== target.actor.id) return;
  const source = { speaker: ChatMessage.getSpeaker({ actor: target.actor, token: target, scene: target.parent }) };
  if (origin.whisper.length) {
    source.whisper = message.whisper.length ? message.whisper.filter(id => origin.whisper.includes(id)) : [...origin.whisper];
    if (!source.whisper.length) source.whisper = [...origin.whisper];
    source.blind = message.blind || origin.blind;
  }
  message.updateSource(source);
}

export async function syncThinFear(message) {
  if (!game.user.isActiveGM || message.type !== "save") return;
  const origin = message.getOriginatingMessage();
  const receipt = origin.flags.spikependium?.thinFear;
  if (!receipt || !origin.author?.isGM || message.getAssociatedToken()?.uuid !== receipt.target) return;
  const task = applying.get(receipt.event);
  if (task) { task.pending = true; return; }
  const state = { pending: true };
  applying.set(receipt.event, state);
  try {
    do {
      state.pending = false;
      const target = fromUuidSync(receipt.target);
      const actor = target?.actor;
      if (!actor?.isOwner) return;
      const saves = origin.getAssociatedRolls("save").filter(m => m.getAssociatedToken()?.uuid === receipt.target && m.system.ability === "wis");
      const latest = saves.at(-1);
      const roll = latest?.rolls[0];
      if (roll && (!(roll instanceof CONFIG.Dice.D20Roll) || roll.options.target !== receipt.dc)) return;
      const failed = !!roll?.isFailure && !latest.system.forceSuccess;
      const owned = actor.effects.filter(e => e.flags.spikependium?.thinFear === receipt.event);
      if (!failed || fearImmune(actor)) {
        if (owned.length) await actor.deleteEmbeddedDocuments("ActiveEffect", owned.map(e => e.id));
        continue;
      }
      const combat = fromUuidSync(receipt.combat);
      if (turnKey(combat) !== receipt.turn || combat.combatant?.token?.uuid !== receipt.target) continue;
      if (owned.some(e => !e.disabled && !e.duration.expired)) continue;
      const activity = origin.getAssociatedActivity();
      const effect = activity?.item.effects.find(e => e.uuid === receipt.effectUuid) ?? new ActiveEffect.implementation(receipt.effect);
      const tray = new dnd5e.applications.components.EffectApplicationElement();
      tray.chatMessage = origin;
      const { action, data } = await tray._prepareEffectData(effect, actor);
      if (turnKey(combat) !== receipt.turn || fromUuidSync(receipt.target)?.actor !== actor) continue;
      if (latest.system.forceSuccess || fearImmune(actor)
        || origin.getAssociatedRolls("save").filter(m => m.getAssociatedToken()?.uuid === receipt.target && m.system.ability === "wis").at(-1) !== latest) {
        state.pending = true;
        continue;
      }
      data.duration = { ...data.duration, value: null, expiry: "targetStart", expired: false };
      data.start = ActiveEffect.implementation.getEffectStart(combat);
      data.flags = { ...data.flags, spikependium: { ...data.flags?.spikependium, thinFear: receipt.event } };
      data.system.origin = { ...data.system.origin, activity: receipt.activity, message: origin.uuid, profile: receipt.effect._id };
      if (action === "create") {
        data._stats = { ...data._stats, duplicateSource: receipt.effectUuid, compendiumSource: null };
        await actor.createEmbeddedDocuments("ActiveEffect", [data]);
      } else await actor.updateEmbeddedDocuments("ActiveEffect", [data]);
    } while (state.pending);
  } catch (error) {
    console.error("Spikependium: эффект пугающей эманации", error);
    ui.notifications.error("Не удалось обновить испуг от спутника. Используйте эффекты карточки спасброска; подробности в консоли.");
  } finally { applying.delete(receipt.event); }
}
