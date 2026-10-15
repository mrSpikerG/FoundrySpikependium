const pending = new WeakMap(), casts = new WeakMap(), placing = new Set(), using = new Set();
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const kind = activity => activity?.type === "summon" && activity.flags.spikependium?.alchemistCompanion;
const tokens = () => [...(game.scenes ?? [])].flatMap(s => [...s.tokens]);
const path = frame => `flags.spikependium.alchemistSummons.${frame.id}.paid`;
const read = (obj, key) => foundry.utils.getProperty(obj, key);
const unique = id => ["homunculus", "golem"].includes(id);
const ownedCompanion = (owner, id) => tokens().some(t => t.actor?.flags.spikependium?.alchemistCompanion?.owner === owner
  && t.actor.flags.spikependium.alchemistCompanion.kind === id);
// shortcut: owners on different clients can race native resource updates; the GM arbitrates concurrent uses.
export async function alchemistCreationUse(wrapped, ...args) {
  if (!kind(this) && !this.flags.spikependium?.alchemistRecipe) return wrapped(...args);
  if (using.has(this.actor.uuid)) { ui.notifications.warn("Сначала завершите уже открытое приготовление или выпуск существа."); return; }
  using.add(this.actor.uuid);
  try { return await wrapped(...args); }
  finally { using.delete(this.actor.uuid); }
}
function valid(activity) {
  const id = kind(activity), frame = casts.get(activity), actor = activity.actor;
  return !!(id && frame && actor?.isOwner && frame.owner === actor.uuid && frame.activity === activity.uuid && frame.kind === id
    && (frame.end === null || game.time.worldTime < frame.end)
    && read(actor, path(frame)) === 1 && !read(actor, `flags.spikependium.alchemistSummons.${frame.id}.placed`)
    && !tokens().some(t => t.flags.spikependium?.alchemistCompanion?.id === frame.id)
    && (!unique(id) || !ownedCompanion(actor.uuid, id)));
}
export function canUseAlchemistCompanion(activity) {
  const id = kind(activity); if (!id) return;
  if (!activity.actor?.isOwner || (unique(id) && ownedCompanion(activity.actor.uuid, id))) {
    ui.notifications.warn("У вас уже есть это существо на сцене, включая сохранённое тело. Используйте прежнее тело для оживления."); return false;
  }
}
export async function prepareAlchemistCreation(activity, config, updates) {
  const recipe = activity.flags.spikependium?.alchemistRecipe;
  if (!recipe) return updates;
  const actor = activity.actor, resource = actor.items.find(i => i.system.identifier === "alchemist-reagents");
  const update = resource && updates.item.find(i => i._id === resource.id);
  if (!actor.isOwner || !resource || update?.["system.uses.spent"] !== resource.system.uses.spent + recipe.cost) {
    ui.notifications.warn("Для приготовления нужно оплатить полную стоимость костями реагентов."); return false;
  }
  const jugs = actor.items.filter(i => i.flags?.spikependium?.alchemistVessel?.jug && i.system.quantity > 0);
  if (recipe.jug && (jugs.length > 1 || jugs.some(i => i.system.quantity !== 1 || i.system.uses.spent < 1))) {
    ui.notifications.warn("Нужен единственный пустой кувшин. Сначала освободите содержимое или исправьте лишние копии."); return false;
  }
  const source = await fromUuid(recipe.uuid);
  if (source?.type !== "consumable" || !source.flags.spikependium?.alchemistVessel) throw Error("Missing alchemist vessel template");
  const data = source.toObject(); delete data._key; data.folder = null; data.sort = 0;
  data.flags.spikependium.alchemistMaker = actor.uuid;
  data._stats = { ...data._stats, compendiumSource: source.uuid, duplicateSource: null };
  if (recipe.jug && jugs.length) updates.item.push({ _id: jugs[0].id, name: data.name, img: data.img, system: data.system,
    "flags.spikependium.alchemistVessel": data.flags.spikependium.alchemistVessel, "flags.spikependium.alchemistMaker": actor.uuid });
  else { data._id = foundry.utils.randomID(); updates.create.push(data); }
  return updates;
}
export function prepareAlchemistSummonUpdates(activity, _config, updates) {
  pending.delete(activity); const id = kind(activity); if (!id) return updates;
  if (canUseAlchemistCompanion(activity) === false) return false;
  const item = activity.item, actor = activity.actor;
  if (!unique(id)) {
    const update = updates.item.find(i => i._id === item.id);
    const paid = updates.delete.includes(item.id) || update?.["system.uses.spent"] === item.system.uses.spent + 1
      || (update?.["system.quantity"] === item.system.quantity - 1 && update?.["system.uses.spent"] === 0);
    if (!paid || !item.flags.spikependium?.alchemistVessel) {
      ui.notifications.warn("Выпуск слизи требует расхода одного полного сосуда."); return false;
    }
  }
  const frame = { id: foundry.utils.randomID(), owner: actor.uuid, activity: activity.uuid, kind: id,
    maker: item.flags.spikependium?.alchemistMaker ?? null, end: unique(id) ? null : game.time.worldTime + 3600 };
  updates.actor[path(frame)] = 1; pending.set(activity, frame); return updates;
}
export function requireAlchemistSummonMessage(activity, _config, message) {
  if (kind(activity) && message.create === false) {
    ui.notifications.warn("Нужна карточка в чате для подтверждения выпуска и отмены расхода."); return false;
  }
}
export function recordAlchemistSummon(activity, _config, message) {
  const frame = pending.get(activity); pending.delete(activity);
  if (!frame || read(activity.actor, path(frame)) !== 1) return;
  const deltas = ((message.data.system ??= {}).deltas ??= {}).actor ??= [];
  if (!deltas.some(d => d.keyPath === path(frame))) deltas.push({ keyPath: path(frame), delta: 1 });
  foundry.utils.setProperty(message, "data.flags.spikependium.alchemistCompanion", frame);
  foundry.utils.setProperty(message, "data.flags.dnd5e.item.data", activity.item.toObject());
  casts.set(activity, frame);
}
export async function alchemistSummonChatAction(wrapped, event, target, message) {
  if (!kind(this) || target.dataset.action !== "placeSummons") return wrapped(event, target, message);
  const previous = casts.get(this); casts.set(this, message.flags.spikependium?.alchemistCompanion);
  try { return await wrapped(event, target, message); }
  finally { if (previous) casts.set(this, previous); else casts.delete(this); }
}
export async function placeAlchemistSummons(wrapped, options) {
  const id = kind(this); if (!id) return wrapped(options);
  const frame = casts.get(this), lock = unique(id) ? `${this.actor?.uuid}:${id}` : frame?.id;
  if (!valid(this) || placing.has(lock)) {
    ui.notifications.warn("Этот выпуск уже размещён, отменён или выполняется. Для спутника проверьте прежнее тело."); return;
  }
  placing.add(lock);
  try { return await wrapped(options); }
  finally { placing.delete(lock); }
}
export function canPlaceAlchemistCompanion(activity, profile) {
  if (!kind(activity)) return;
  if (!valid(activity) || profile.count !== "1" || !activity.profiles.some(p => p._id === profile._id && p.uuid === profile.uuid)) return false;
}
export function prepareAlchemistCompanion(activity, profile, config) {
  if (!kind(activity)) return;
  if (canPlaceAlchemistCompanion(activity, profile) === false) return false;
  const frame = casts.get(activity), key = config.actor.flags.spikependium?.key;
  if (key !== `actor:alchemist-${frame.kind}`) return false;
  config.actorUpdates["flags.spikependium.alchemistCompanion"] = structuredClone(frame);
  config.tokenUpdates["flags.spikependium.alchemistCompanion"] = structuredClone(frame);
  const maker = resolve(frame.maker), rider = maker?.items.some(i => i.system.identifier === "alchemist-discovery-ooze-rider"
    || i.system.identifier === "alchemist-research-discovery-ooze-rider");
  if (unique(frame.kind) || !rider || (maker.classes?.alchemist?.system.levels ?? 0) < 13) return;
  const prof = maker.system.attributes.prof;
  if (!Number.isInteger(prof) || prof < 2 || prof > 6) return;
  config.actorUpdates["system.attributes.movement.speeds.walk"] = String(Math.max(30, Number(config.actor.system.attributes.movement.speeds.walk)));
  const bonus = config.actor.system.attributes.init?.roll?.bonus;
  config.actorUpdates["system.attributes.init.roll.bonus"] = [bonus, prof].filter(v => v !== undefined && v !== "").join(" + ");
  for (const item of config.actor.items) for (const a of item.system.activities) {
    if (!["attack", "save", "damage"].includes(a.type) || !a.damage.parts.length) continue;
    const parts = a.toObject().damage.parts, part = parts[0];
    if (part.custom.enabled) part.custom.formula = `(${part.custom.formula}) + ${prof}`;
    else part.bonus = [part.bonus, prof].filter(v => v !== "").join(" + ");
    let update = config.actorUpdates.items.find(i => i._id === item.id);
    if (!update) config.actorUpdates.items.push(update = { _id: item.id });
    update[`system.activities.${a.id}.damage.parts`] = parts;
  }
}
export async function recordAlchemistCompanionPlaced(activity, _profile, placed) {
  if (!kind(activity) || !placed.length) return;
  const frame = casts.get(activity);
  if (frame && placed.some(t => t.flags.spikependium?.alchemistCompanion?.id === frame.id))
    await activity.actor.setFlag("spikependium", `alchemistSummons.${frame.id}.placed`, 1);
}
let cleaning = false;
export async function cleanAlchemistCompanions() {
  if (cleaning) return;
  cleaning = true;
  try {
    for (const token of tokens()) {
      const frame = token.flags.spikependium?.alchemistCompanion, owner = resolve(frame?.owner);
      if (!frame || (game.users.activeGM ? !game.user.isActiveGM : !owner?.isOwner)) continue;
      if ((frame.end !== null && game.time.worldTime >= frame.end) || (owner && read(owner, path(frame)) !== 1)) await token.delete();
    }
  } finally { cleaning = false; }
}
