import { incapacitated, tokensDistance } from "./effects.mjs";
import { abolethUnderwater } from "./aboleth-water.mjs";
import { automaticMucusTargets } from "./aboleth-cloud.mjs";
import { automaticSoulClawTargets } from "./soul-claw.mjs";
import { soulPrisonReturnUpdate } from "./soul-prison.mjs";
import { defensiveCharmEnabled } from "./performer-defense.mjs";

const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const syncing = new Map(), healing = new Set();
const abilities = { "aboleth-dominate": "wis", "aboleth-curse": "con", "aboleth-water-poison": "con",
  "performer-charmed": "wis", "performer-frightened": "wis", "performer-defense": "wis", "arcanaloth-banishing": "cha", "archhag-wave": "dex", "bugbear-grab": "dex" };
// shortcut: смену плана пока разрешает Мастер; добавить явные сведения о планах сцен.
const key = actor => actor.uuid.replaceAll(".", "_");
const kind = activity => ["actor:mm25:aboleth", "actor:mm25:performer-virtuoso", "actor:mm25:performer-legend", "actor:mm25:arcanaloth", "actor:mm25:archhag", "actor:mm25:bugbear-stalker"]
  .includes(activity?.actor?.flags.spikependium?.key) ? activity.flags.spikependium?.monsterAction : undefined;
const authority = origin => game.users.activeGM ? game.user.isActiveGM : origin.author?.id === game.user.id;
const live = effect => effect.active && !effect.duration.expired;
function soulTome(actor) {
  return actor.items.find(item => item.system.identifier === "arcanaloth-soul-tome" && item.system.quantity > 0 && item.system.hp.value > 0
    && !item.flags.spikependium?.soulTome?.destroyed);
}
export function monsterLegendaryRecovery(wrapped, periods, results) {
  if (!["actor:mm25:aboleth", "actor:mm25:archhag"].includes(this.parent.flags.spikependium?.key)) return wrapped(periods, results);
  // Книга восстанавливает действия в начале хода; штатный NPC dnd5e восстанавливает их в конце.
  const adjusted = periods.filter(period => period !== "turnEnd");
  if (periods.includes("turnStart")) adjusted.push("turnEnd");
  return wrapped(adjusted, results);
}
function sourceToken(activity, message) {
  const speaker = message?.data?.speaker;
  if (speaker?.scene && speaker?.token) return resolve(`Scene.${speaker.scene}.Token.${speaker.token}`);
  if (activity.actor.token) return activity.actor.token;
  const controlled = (globalThis.canvas?.tokens?.controlled ?? []).map(t => t.document ?? t).filter(t => t.actor?.uuid === activity.actor.uuid);
  if (controlled.length === 1) return controlled[0];
  const tokens = activity.actor.getActiveTokens?.(false, true) ?? [];
  return tokens.length === 1 ? tokens[0] : undefined;
}
export function abolethMemoryTarget(activity, source, target) {
  if (!source?.actor || source.actor.uuid !== activity.actor.uuid || !target?.actor || source.parent !== target.parent) return false;
  const distance = tokensDistance(source, target);
  if (!Number.isFinite(distance) || distance > 30) return false;
  return target.actor.effects.some(effect => live(effect) && (
    (effect.statuses.has("grappled") && effect.flags.spikependium?.arcanaSpiritGrab?.source === source.uuid
      && effect.flags.spikependium.arcanaSpiritGrab.target === target.uuid)
    || (effect.statuses.has("charmed") && effect.flags.spikependium?.monsterEffect === "aboleth-dominate"
      && resolve(effect.system.origin?.activity)?.actor?.uuid === activity.actor.uuid)));
}
export function canUseMonsterActivity(activity, config, message) {
  const action = kind(activity), actor = activity?.actor;
  if (!action && !(["actor:mm25:aboleth", "actor:mm25:archhag"].includes(actor?.flags.spikependium?.key) && activity.activation.type === "legendary")) return true;
  if (action === "arcanaloth-banishing" && automaticSoulClawTargets(activity, config)) return true;
  if (incapacitated(actor) || actor.system.attributes.hp.value <= 0) return false;
  if (action?.startsWith("performer-")) return true;
  if (activity.activation.type === "legendary" && game.combat?.started && game.combat.combatant?.actor?.uuid === actor.uuid) {
    ui.notifications.warn("Легендарное действие выполняется после хода другого существа."); return false;
  }
  if (actor.flags.spikependium?.key === "actor:mm25:archhag") return true;
  if (["aboleth-projection", "aboleth-water-poison"].includes(action) && !(actor.system.resources.lair.value && actor.system.resources.lair.inside)) {
    ui.notifications.warn("Эта способность доступна аболету в его логове."); return false;
  }
  if (action === "aboleth-projection" || !action) return true;
  if (action === "aboleth-curse" && !abolethUnderwater(actor)) {
    ui.notifications.warn("Облако слизи работает под водой. Сначала отметьте аболета кнопкой «Цель под водой» в карточке «Вода и увлажнение кожи»."); return false;
  }
  const automatic = automaticMucusTargets(activity, config);
  const source = automatic?.source ?? sourceToken(activity, message), targets = automatic?.tokens ?? (message?.data?.system?.targets
    ? message.data.system.targets.map(target => resolve(target.token)) : [...game.user.targets].map(target => target.document ?? target));
  if (action === "arcanaloth-banishing" && !soulTome(actor)?.system.equipped) return false;
  const maximum = action === "aboleth-curse" ? Infinity : 1;
  const valid = source?.actor?.uuid === actor.uuid && targets.length >= 1 && targets.length <= maximum && targets.every(target => {
    if (!target?.actor?.system.isCreature || target.parent !== source.parent) return false;
    if (["aboleth-memories", "aboleth-drain"].includes(action)) return abolethMemoryTarget(activity, source, target);
    if (action === "aboleth-water-poison") return target.actor.uuid !== actor.uuid;
    const distance = tokensDistance(source, target);
    return Number.isFinite(distance) && distance <= (["aboleth-curse", "arcanaloth-banishing"].includes(action) ? 5 : 30);
  });
  if (!valid) ui.notifications.warn(["aboleth-memories", "aboleth-drain"].includes(action)
    ? "Выберите одну цель в 30 футах, схваченную или очарованную именно этим аболетом."
    : "Выберите подходящие токены в области или дистанции способности.");
  return !!valid;
}
export function recordMonsterEffect(activity, message) {
  const action = kind(activity);
  if (!abilities[action] || !activity.actor.isOwner) return;
  const source = activity.applicableEffects.find(effect => effect.flags.spikependium?.monsterEffect === action);
  if (!source || !Number.isFinite(activity.save.dc.value)) return;
  const automatic = action === "arcanaloth-banishing" && automaticSoulClawTargets(activity, {
    spikependium: { soulClawEvent: message.data?.flags?.spikependium?.soulClawCast?.event } });
  const tome = action === "arcanaloth-banishing" ? automatic ? resolve(automatic.tome.uuid) : soulTome(activity.actor) : null;
  if (action === "arcanaloth-banishing" && (!tome || (!automatic && !tome.system.equipped))) return;
  foundry.utils.setProperty(message, "data.flags.spikependium.monsterCast", { kind: action, actor: activity.actor.uuid,
    activity: activity.uuid, effect: source.uuid, dc: activity.save.dc.value, time: game.time.worldTime,
    sourceToken: sourceToken(activity, message)?.uuid ?? null,
    start: ActiveEffect.implementation.getEffectStart(), targets: structuredClone(message.data?.system?.targets ?? []),
    ...(tome ? { tome: { uuid: tome.uuid, generation: tome.flags.spikependium?.soulTome?.generation ?? "initial" } } : {}) });
}
export async function syncMonsterEffects(message) {
  if (message?.flags?.spikependium?.abolethRepeat || message?.flags?.spikependium?.soulPrisonRepeat) return;
  const origin = message?.type === "usage" ? message : message?.type === "save" ? message.getOriginatingMessage() : null;
  const receipt = origin?.flags.spikependium?.monsterCast, activity = resolve(receipt?.activity), caster = activity?.actor;
  if (!receipt || !authority(origin) || kind(activity) !== receipt.kind || caster?.uuid !== receipt.actor
    || !caster.testUserPermission(origin.author, "OWNER") || !abilities[receipt.kind]) return;
  const source = activity.applicableEffects.find(effect => effect.uuid === receipt.effect && effect.flags.spikependium?.monsterEffect === receipt.kind);
  if (!source) return;
  if (syncing.has(origin.uuid)) { syncing.get(origin.uuid).pending = true; return; }
  const state = { pending: true }; syncing.set(origin.uuid, state);
  try {
    do {
      state.pending = false;
      for (const target of receipt.targets) {
        const actor = resolve(target.actor);
        if (!actor?.isOwner || !actor.system.isCreature) continue;
        const save = origin.getAssociatedRolls("save").filter(card => !card.flags?.spikependium?.abolethRepeat && !card.flags?.spikependium?.soulPrisonRepeat && card.system.ability === abilities[receipt.kind]
          && card.getAssociatedActor()?.uuid === actor.uuid && card.getAssociatedToken()?.uuid === target.token).at(-1);
        const roll = save?.rolls?.[0];
        if (!save?.author || (!save.author.isGM && !actor.testUserPermission(save.author, "OWNER"))
          || !(roll instanceof CONFIG.Dice.D20Roll) || !roll._evaluated || roll.options.target !== receipt.dc) continue;
        const path = `flags.spikependium.monsterTargets.${key(actor)}.processed`;
        const existing = actor.effects.find(effect => effect.system.origin?.message === origin.uuid && effect.flags.spikependium?.monsterEffect === receipt.kind);
        const success = save.system.forceSuccess || !roll.isFailure;
        const tome = receipt.kind === "arcanaloth-banishing" ? resolve(receipt.tome?.uuid) : null;
        const expired = (receipt.kind === "aboleth-water-poison" && game.time.worldTime >= receipt.time + 3600)
          || (receipt.kind === "arcanaloth-banishing" && (!tome || tome.actor?.uuid !== caster.uuid
            || tome.system.identifier !== "arcanaloth-soul-tome" || tome.system.quantity <= 0 || tome.system.hp.value <= 0
            || tome.flags.spikependium?.soulTome?.destroyed || receipt.tome.generation !== (tome.flags.spikependium?.soulTome?.generation ?? "initial")));
        const dead = receipt.kind === "aboleth-dominate" && caster.statuses.has("dead");
        const canceled = receipt.kind === "performer-defense" && !defensiveCharmEnabled(origin);
        if ((success && receipt.kind !== "archhag-wave") || expired || dead || canceled) {
          if (!existing && origin.flags.spikependium.monsterTargets?.[key(actor)]?.processed) continue;
          const operations = [
            ...(existing ? [{ action: "delete", documentName: "ActiveEffect", parent: actor, ids: [existing.id] }] : []),
            { action: "update", documentName: "ChatMessage", updates: [{ _id: origin.id, [path]: true }] }
          ];
          if (receipt.kind === "arcanaloth-banishing" && existing)
            await actor.performBulkUpdate({ actor: soulPrisonReturnUpdate(existing, success ? "initial-save" : "tome"), operations });
          else await foundry.documents.modifyBatch(operations);
          continue;
        }
        if (origin.flags.spikependium.monsterTargets?.[key(actor)]?.processed) continue;
        const ci = actor.system.traits.ci.value, statuses = [...source.statuses];
        const immune = receipt.kind !== "arcanaloth-banishing" && (ci.has("ALL") || statuses.some(status => ci.has(status)));
        const operations = [];
        const ongoingCurse = receipt.kind === "aboleth-curse" && actor.effects.some(effect => effect.active && !effect.duration.expired
          && effect.statuses.has("cursed") && effect.flags.spikependium?.monsterEffect === "aboleth-curse");
        if (!immune && !existing && !ongoingCurse) {
          const tray = new dnd5e.applications.components.EffectApplicationElement(); tray.chatMessage = origin;
          const { action, data } = await tray._prepareEffectData(source, actor);
          if (!authority(origin) || !actor.isOwner) return;
          data.start = receipt.start;
          if (receipt.kind === "bugbear-grab") {
            const token = resolve(target.token), owner = resolve(receipt.sourceToken);
            const size = ["tiny", "sm", "med"].includes(actor.system.traits.size);
            if (!owner || owner.actor?.uuid !== caster.uuid || !token || !size
              || tokensDistance(owner, token) == null || tokensDistance(owner, token) > 10
              || incapacitated(caster) || caster.system.attributes.hp.value <= 0) {
              await foundry.documents.modifyBatch([{ action: "update", documentName: "ChatMessage", updates: [{ _id: origin.id, [path]: true }] }]);
              continue;
            }
            data.flags.spikependium ??= {};
            data.flags.spikependium.arcanaSpiritGrab = { source: owner.uuid, target: token.uuid, dc: 13, reach: 10 };
          }
          if (receipt.kind === "arcanaloth-banishing") {
            data.statuses = statuses.filter(status => !ci.has("ALL") && !ci.has(status));
            const token = resolve(target.token);
            data.flags.spikependium ??= {};
            data.flags.spikependium.soulPrison = { tome: receipt.tome.uuid, generation: receipt.tome.generation, dc: receipt.dc,
              phase: "awaiting-transfer", target: target.token,
              privacy: { whisper: [...(origin.whisper ?? [])], blind: !!origin.blind, hidden: !!token?.hidden || !!resolve(receipt.sourceToken)?.hidden },
              return: token && { token: token.uuid, scene: token.parent.uuid ?? `Scene.${token.parent.id}`,
                ...Object.fromEntries(["x", "y", "elevation", "level", "hidden"].map(field => [field, token[field]])) } };
          }
          if (receipt.kind === "aboleth-curse") {
            data.flags.spikependium ??= {};
            data.flags.spikependium.abolethCursePrivacy = { whisper: [...(origin.whisper ?? [])], blind: !!origin.blind,
              hidden: !!resolve(receipt.sourceToken)?.hidden };
          }
          operations.push({ action, documentName: "ActiveEffect", parent: actor,
            ...(action === "create" ? { data: [data] } : { updates: [data] }) });
        }
        operations.push({ action: "update", documentName: "ChatMessage", updates: [{ _id: origin.id, [path]: true }] });
        await foundry.documents.modifyBatch(operations);
      }
    } while (state.pending && authority(origin));
  } finally { syncing.delete(origin.uuid); }
}
export async function monsterDrainHealing(activity, config, results) {
  const message = results?.message;
  if (kind(activity) !== "aboleth-drain" || !activity.actor.isOwner || message?.author?.id !== game.user.id
    || message.flags.spikependium?.monsterDrainHealing || healing.has(message.uuid)) return;
  const heal = [...activity.item.system.activities].find(a => a.type === "heal" && a.target.affects.type === "self");
  if (!heal) return;
  healing.add(message.uuid);
  try {
    await message.setFlag("spikependium", "monsterDrainHealing", "opening");
    const token = sourceToken(activity), actor = activity.actor;
    await heal.rollDamage({ scaling: 0, isCritical: false }, {}, { data: { system: { origin: message.id,
      targets: [{ actor: actor.uuid, ...(token ? { token: token.uuid } : {}), name: actor.name, img: actor.img }] } } });
    await message.setFlag("spikependium", "monsterDrainHealing", "opened");
  } finally { healing.delete(message.uuid); }
}
export async function endDeadAbolethCharms() {
  if (!game.user.isActiveGM) return;
  const actors = new Map([...game.actors, ...[...game.scenes].flatMap(scene => [...scene.tokens].map(token => token.actor))]
    .filter(Boolean).map(actor => [actor.uuid, actor]));
  for (const actor of actors.values()) for (const effect of [...actor.effects]) {
    if (!actor.isOwner || effect.flags.spikependium?.monsterEffect !== "aboleth-dominate") continue;
    const caster = resolve(effect.system.origin?.activity)?.actor;
    if (caster?.statuses.has("dead")) await effect.delete();
  }
}
export function monsterError(error) {
  console.error("Spikependium: механики чудовищ", error);
  ui.notifications.error("Не удалось завершить механику чудовища. Проверьте карточку и эффекты на листе; подробности в консоли.");
}
