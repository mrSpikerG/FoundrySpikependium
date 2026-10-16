import { tokensDistance } from "./effects.mjs";
import { dropVestigeGear } from "./vestige.mjs";

const KEY = "spell:au-combat-familiar", prefix = "actor:au-combat-familiar-", casts = new WeakMap(), prepared = new WeakMap();
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const spell = a => a?.item?.flags.spikependium?.key === KEY;
const supported = a => spell(a) && a.type === "summon";
const tokens = () => [...game.scenes].flatMap(s => [...s.tokens]);
function ordinary(caster) {
  const actors = new Map([...game.actors, ...tokens().map(t => t.actor)].filter(Boolean).map(a => [a.uuid, a]));
  return [...actors.values()].filter(a => { const origin = resolve(a.flags.dnd5e?.summon?.origin);
    return origin?.system.identifier === "find-familiar" && origin.actor?.uuid === caster.uuid; });
}
export function canUseCombatFamiliar(a) {
  if (!spell(a)) return;
  const known = ordinary(a.actor);
  if (a.flags?.spikependium?.enhanceCombatFamiliar) {
    const source = a.getUsageToken?.(), nearby = tokens().filter(t => {
      const distance = source && tokensDistance(source,t);
      return known.includes(t.actor) && distance != null && distance <= 10;
    });
    if (known.length === 1 && nearby.length === 1) return;
    ui.notifications.warn("Для ручного усиления нужен один связанный обычный фамильяр в 10 футах от токена заклинателя."); return false;
  }
  if (supported(a) && known.length) {
    ui.notifications.warn("У вас уже есть обычный фамильяр. Используйте действие усиления существующего фамильяра; второго создавать нельзя."); return false;
  }
}
export function canConsumeCombatFamiliar(a, config, message) {
  if (canUseCombatFamiliar(a) === false) return false;
  if (supported(a) && message.create === false) {
    ui.notifications.warn("Боевой фамильяр требует исходную карточку призыва."); return false;
  }
}
export function prepareCombatFamiliarDialog(a, _config, dialog) {
  if (!supported(a)) return;
  const Base = dialog.applicationClass; dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      context.fields.push({ name: "spikependium.combatFamiliarSpace", value: this.config.spikependium?.combatFamiliarSpace ?? false,
        field: new foundry.data.fields.BooleanField({ label: "Подтверждаю свободное место в 10 футах и отсутствие обычного фамильяра, включая скрытого или временно отпущенного" }),
        input: context.inputs.createCheckboxInput }); context.hasConsumption = true; return context;
    }
  };
}
export function prepareCombatFamiliarUpdates(a, config, updates) {
  prepared.delete(a); if (!supported(a)) return updates;
  if (!a.actor.isOwner || canUseCombatFamiliar(a) === false || config.spikependium?.combatFamiliarSpace !== true
    || !Number.isInteger(a.item.system.level) || a.item.system.level < 2 || a.item.system.level > 9) return false;
  const event = foundry.utils.randomID(), r = { event, caster: a.actor.uuid, activity: a.uuid, item: a.item.uuid,
    level: a.item.system.level, time: game.time.worldTime, end: game.time.worldTime + 3600 };
  updates.actor[`flags.spikependium.combatFamiliarCasts.${event}`] = { ...r, active: 1 };
  updates.actor["flags.spikependium.combatFamiliarCurrent"] = event; prepared.set(a,r); return updates;
}
export function recordCombatFamiliarConsumption(a, _config, message) {
  const r = prepared.get(a); if (!r || a.actor.flags.spikependium?.combatFamiliarCasts?.[r.event]?.active !== 1) return;
  const path = `flags.spikependium.combatFamiliarCasts.${r.event}.active`, deltas = message.data.system.deltas.actor ??= [];
  if (!deltas.some(d => d.keyPath === path)) deltas.push({ keyPath: path, delta: 1 });
}
export function recordCombatFamiliarCast(a, message) {
  const r = prepared.get(a); prepared.delete(a);
  if (!r || a.actor.flags.spikependium?.combatFamiliarCasts?.[r.event]?.active !== 1) return;
  casts.set(a,r); foundry.utils.setProperty(message,"data.flags.spikependium.combatFamiliar",r);
}
function valid(r, a) {
  const caster = resolve(r?.caster), record = caster?.flags.spikependium?.combatFamiliarCasts?.[r?.event];
  return caster && record?.active === 1 && caster.flags.spikependium.combatFamiliarCurrent === r.event
    && Number.isFinite(r.end) && game.time.worldTime < r.end && !caster.statuses.has("dead")
    && JSON.stringify(r) === JSON.stringify(Object.fromEntries(Object.entries(record).filter(([k]) => !["active","placed"].includes(k))))
    && (!a || supported(a) && a.uuid === r.activity && a.item.uuid === r.item && a.actor.uuid === r.caster && a.item.system.level === r.level);
}
export function canPlaceCombatFamiliar(a) {
  if (!supported(a)) return;
  const r = casts.get(a), caster = resolve(r?.caster);
  if (valid(r,a) && !ordinary(a.actor).length && !caster.flags.spikependium.combatFamiliarCasts[r.event].placed
    && !tokens().some(t => t.flags.spikependium?.combatFamiliar?.event === r.event)) return;
  ui.notifications.warn("Этот Боевой фамильяр уже размещён, заменён другим призывом или заклинание закончилось."); return false;
}
export function prepareCombatFamiliarToken(a, profile, config) {
  if (!supported(a)) return;
  if (canPlaceCombatFamiliar(a) === false || !config.actor.flags.spikependium?.key?.startsWith(prefix)
    || !a.profiles.some(p => p._id === profile._id && p.uuid === profile.uuid)) return false;
  config.tokenUpdates["flags.spikependium.combatFamiliar"] = structuredClone(casts.get(a));
}
export async function recordCombatFamiliarPlaced(a, _profile, placed) {
  if (!supported(a)) return;
  for (const token of placed) {
    const r = token.flags.spikependium?.combatFamiliar;
    if (valid(r,a) && a.actor.isOwner) await a.actor.update({ [`flags.spikependium.combatFamiliarCasts.${r.event}.placed`]: true });
  }
}
export async function combatFamiliarChatAction(wrapped, event, target, message) {
  if (!supported(this) || target.dataset.action !== "placeSummons") return wrapped(event,target,message);
  const r = message.flags.spikependium?.combatFamiliar;
  if (message.type !== "usage" || !message.author || !this.actor.testUserPermission(message.author,"OWNER")
    || !message.system.deltas?.actor?.some(d => d.keyPath === `flags.spikependium.combatFamiliarCasts.${r?.event}.active` && d.delta === 1)) return;
  const previous = casts.get(this); casts.set(this,r);
  try { return await wrapped(event,target,message); } finally { if (previous) casts.set(this,previous); else casts.delete(this); }
}
let running = false, pending = false;
export async function updateCombatFamiliars() {
  if (!game.user.isActiveGM) return;
  pending = true; if (running) return; running = true;
  try { do {
    pending = false; const seen = new Set();
    for (const token of tokens()) {
      const r = token.flags.spikependium?.combatFamiliar, actor = token.actor;
      if (!r || !actor?.flags.spikependium?.key?.startsWith(prefix) || actor.flags.dnd5e?.summon?.origin !== r.item) continue;
      if (!valid(r) || ordinary(resolve(r.caster)).length || actor.system.attributes.hp.value <= 0 || actor.statuses.has("dead") || seen.has(r.caster)) {
        if (await dropVestigeGear(token)) await token.parent.deleteEmbeddedDocuments("Token",[token.id]); continue;
      }
      seen.add(r.caster);
      const caster = resolve(r.caster), record = caster.flags.spikependium.combatFamiliarCasts[r.event];
      if (!record.placed && caster.isOwner) await caster.update({ [`flags.spikependium.combatFamiliarCasts.${r.event}.placed`]: true });
      // The familiar rolls its own initiative; it must never inherit the caster's initiative.
      for (const combat of game.combats) {
        if (!combat.started || combat.scene?.id !== token.parent.id || !combat.combatants.some(c => c.actor?.uuid === r.caster)) continue;
        let own = combat.combatants.find(c => c.token?.uuid === token.uuid);
        if (!own) [own] = await combat.createEmbeddedDocuments("Combatant",[{actorId:actor.id,tokenId:token.id,sceneId:token.parent.id}]);
        if (own && own.initiative == null) await combat.rollInitiative([own.id]);
      }
    }
  } while (pending && game.user.isActiveGM); } finally { running = false; }
}
export function combatFamiliarDeltaLabel(wrapped,...args) {
  const result = wrapped(...args);
  if (/^flags\.spikependium\.combatFamiliarCasts\.[A-Za-z0-9]{16}\.active$/.test(this.keyPath)) result.label = "Боевой фамильяр";
  return result;
}
