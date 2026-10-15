const pending = new WeakMap(), using = new Set(), healing = new WeakMap(), granting = new Set();
const key = item => item?.flags?.spikependium?.key;
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const active = item => item?.system.equipped && (item.system.attunement !== "required" || item.system.attuned);
const effects = actor => actor.appliedEffects ?? actor.effects ?? [];
const ownedItem = (actor, id) => actor?.items?.find(i => key(i) === `item:gs2:${id}` && active(i));
const cooldowns = item => Object.entries(item.flags.spikependium?.griffonCooldowns ?? {});
const until = item => Math.max(0, ...cooldowns(item).filter(([, c]) => c.paid === 1).map(([, c]) => c.until));
const sourceItem = (e, actor) => {
  const uuid = e.system.origin?.activity; return resolve(uuid?.startsWith(".") ? `${actor.uuid}${uuid}` : uuid)?.item;
};
const formActive = (actor, flag, item) => effects(actor).some(e => e.active && e.flags.spikependium?.[flag] && sourceItem(e, actor)?.uuid === item.uuid);
export function isGriffonSpellcaster(actor) {
  return Object.values(actor?.classes ?? {}).some(c => c.system.spellcasting?.progression && c.system.spellcasting.progression !== "none")
    || actor?.items?.some(i => (i.type === "spell" && !/^(equipment:|consumable:|feat:griffon-sweet-bubble$)/.test(i.system.sourceItem ?? ""))
      || (i.type === "feat" && !i.flags?.spikependium?.sweetLoan && !i.flags?.spikependium?.sweetTemplate && [...(i.system.activities?.values?.() ?? Object.values(i.system.activities ?? {}))].some(a => a.type === "cast")));
}
export function guardGriffonCasterAttunement(item, changes) {
  if (item.flags?.spikependium?.griffonSpellcaster && item.actor && (changes["system.attuned"] ?? changes.system?.attuned) === true
    && !isGriffonSpellcaster(item.actor)) { ui.notifications.warn("Для настройки нужен персонаж, умеющий сотворять заклинания."); return false; }
}
export function canUseGriffonTwo(activity) {
  const root = activity.getLinkedActivity?.() ?? activity, item = root.item, actor = activity.actor, id = key(item), flags = root.flags?.spikependium ?? {};
  if (effects(actor ?? {}).some(e => e.active && e.flags.spikependium?.griffonHushedMute)
    && ((activity.item.type === "spell" && activity.item.system.properties.has("vocal")) || flags.griffonCommandWord)) {
    ui.notifications.warn("Действующее безмолвие запрещает вербальное колдовство и командные слова."); return false;
  }
  if (item.flags.spikependium?.griffonSpellcaster && !isGriffonSpellcaster(actor)) return false;
  if (id === "item:gs2:spirit-naga" && activity.type === "heal" && !actor?.statuses.has("dead")) {
    ui.notifications.warn("Это свойство используется после смерти, а не просто при 0 хитах."); return false;
  }
  if (flags.griffonCooldown && until(item) > game.time.worldTime) { ui.notifications.warn("Срок восстановления предмета ещё не прошёл."); return false; }
  if (flags.griffonLycanClaws && (!(actor.system.attributes.hp.value > 0) || !formActive(actor, "griffonLycanForm", item))) {
    ui.notifications.warn("Когти требуют активного звериного облика этого амулета."); return false;
  }
  if (key(activity.item) === "spell:gs2-solar-mark" && (activity.item.system.sourceItem !== "equipment:griffon-solar-sight" || !ownedItem(actor, "solar-sight"))) {
    ui.notifications.warn("Эта версия Метки охотника сотворяется только из настроенного кольца взора солара."); return false;
  }
  if (id === "item:gs2:hushed" && activity.type === "save" && !formActive(actor, "griffonHushedAura", item)) return false;
}
export async function prepareGriffonTwoUpdates(activity, config, updates) {
  const linked = activity.getLinkedActivity?.(config.cause?.activity);
  if (linked?.flags?.spikependium?.griffonCooldown && (until(linked.item) > game.time.worldTime
    || updates.item.find(i => i._id === linked.item.id)?.["system.uses.spent"] !== linked.item.system.uses.spent + 1)) return false;
  pending.delete(activity); const item = activity.item, flags = activity.flags?.spikependium ?? {}, actor = activity.actor;
  if (flags.volleyAmmo && key(item) === "item:gs2:volleys") {
    const template = await fromUuid(flags.volleyAmmo);
    if (!actor.isOwner || template?.type !== "consumable" || template.system.type.value !== "ammo"
      || !["arrow", "crossbowBolt"].includes(template.system.type.subtype)) throw Error("Invalid volley ammunition");
    const data = template.toObject(); data._id = foundry.utils.randomID(); delete data._key; data.folder = null; data.sort = 0;
    data.name = template.system.type.subtype === "arrow" ? "Призванная стрела кольца залпов" : "Призванный болт кольца залпов";
    data.system.quantity = 1; data.system.price.value = 0; data.system.uses.autoDestroy = true;
    data.system.source = item.toObject().system.source;
    data.system.properties = [...new Set([...data.system.properties, "mgc"])];
    data.system.description = { value: "<p>Временный магический боеприпас кольца залпов. Немедленно используйте в выстреле лука/арбалета; иначе он исчезает. После попадания или промаха исчезает. Продажной цены нет.</p>", chat: "" };
    const combat = game.combat?.started ? { id: game.combat.id, round: game.combat.round, turn: game.combat.turn } : null;
    data.flags ??= {}; data.flags.spikependium = { ...data.flags.spikependium, volleyAmmo: { ring: item.uuid, owner: actor.uuid, created: game.time.worldTime, combat } };
    for (const old of actor.items.filter(i => i.flags.spikependium?.volleyAmmo)) if (!updates.delete.includes(old.id)) updates.delete.push(old.id);
    updates.create.push(data);
  }
  if (!flags.griffonCooldown) return updates;
  const update = updates.item.find(i => i._id === item.id);
  if (!actor.isOwner || update?.["system.uses.spent"] !== item.system.uses.spent + 1 || until(item) > game.time.worldTime) return false;
  const nonce = foundry.utils.randomID(), pathRoot = `flags.spikependium.griffonCooldowns.${nonce}`;
  update[`${pathRoot}.paid`] = 1; update[`${pathRoot}.until`] = game.time.worldTime + flags.griffonCooldown;
  pending.set(activity, { nonce, path: `${pathRoot}.paid`, item: item.id }); return updates;
}
export function recordGriffonCooldown(activity, config, message) {
  const source = pending.has(activity) ? activity : activity.getLinkedActivity?.(config.cause?.activity);
  const receipt = pending.get(source); if (!receipt) return; pending.delete(source);
  const deltas = (((message.data.system ??= {}).deltas ??= {}).item ??= {})[receipt.item] ??= [];
  if (!deltas.some(d => d.keyPath === receipt.path)) deltas.push({ keyPath: receipt.path, delta: 1 });
}
export async function recoverGriffonPeriods(wrapped, periods, ...args) {
  const result = await wrapped(periods, ...args);
  if (key(this.parent) !== "item:gs2:lycanthrope" || !(periods instanceof Map) || !(periods.get("dusk") > 0)) return result;
  for (const [nonce, entry] of cooldowns(this.parent)) if (entry.paid === 1) result.updates[`flags.spikependium.griffonCooldowns.${nonce}.paid`] = 0;
  return result;
}
const allActors = () => new Map([...(game.actors ?? []), ...[...(game.scenes ?? [])].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean).map(a => [a.uuid, a]));
let syncing = false;
export async function syncGriffonTwo() {
  if (syncing) return; syncing = true;
  try {
  for (const actor of allActors().values()) {
    if (!actor.isOwner || (game.users.activeGM && !game.user.isActiveGM)) continue;
    for (const item of actor.items) {
      if (["item:gs2:gateway", "item:gs2:lycanthrope"].includes(key(item)) && cooldowns(item).length) {
        const spent = until(item) > game.time.worldTime ? 1 : 0; if (item.system.uses.spent !== spent) await item.update({ "system.uses.spent": spent });
      }
      const ammo = item.flags.spikependium?.volleyAmmo;
      const combat = ammo?.combat && game.combats.get(ammo.combat.id);
      if (ammo && (ammo.created < game.time.worldTime || ammo.owner !== actor.uuid || !active(resolve(ammo.ring))
        || (ammo.combat && (!combat || combat.round !== ammo.combat.round || combat.turn !== ammo.combat.turn)))) await item.delete();
    }
    if (actor.system.attributes?.hp?.value <= 0) for (const e of actor.effects) if (e.active && e.flags.spikependium?.griffonLycanForm) await e.delete();
  }
  } finally { syncing = false; }
}
export async function discardVolleyOnMove(token, changes, _options, userId) {
  if (userId === game.user.id && ["x", "y", "elevation", "level"].some(k => k in changes)) await discardAmmo({ actor: token.actor });
}
const bowAttack = activity => activity.type === "attack" && ["longbow", "shortbow", "lightcrossbow", "heavycrossbow", "handcrossbow"].includes(activity.item.system.type?.baseItem);
async function discardAmmo(activity) {
  const actor = activity.actor, ids = actor?.isOwner && actor.items?.filter(i => i.flags?.spikependium?.volleyAmmo).map(i => i.id);
  if (ids?.length) await actor.deleteEmbeddedDocuments("Item", ids);
}
// shortcut: simultaneous owners on separate clients can race native consumption; the GM arbitrates concurrent uses.
export async function griffonTwoUse(wrapped, ...args) {
  const root = this.getLinkedActivity?.() ?? this, tracked = this.type !== "cast" && activityTracked(root), id = root.item.uuid;
  if (tracked && using.has(id)) return;
  if (tracked) using.add(id);
  try {
    if (!this.flags?.spikependium?.volleyAmmo && !bowAttack(this)) await discardAmmo(this);
    const result = await wrapped(...args);
    if (bowAttack(this)) await discardAmmo(this);
    if (result?.message && key(this.item) === "item:gs2:lycanthrope" && this.activation.type === "bonus" && !this.flags.spikependium?.griffonCooldown)
      for (const e of this.actor.effects) if (e.active && e.flags.spikependium?.griffonLycanForm && sourceItem(e, this.actor)?.uuid === this.item.uuid) await e.delete();
    return result;
  } finally { if (tracked) using.delete(id); }
}
const activityTracked = a => !!a.flags?.spikependium?.griffonCooldown || !!a.flags?.spikependium?.volleyAmmo;
const saveOrigin = message => game.messages.get(message.data?.system?.origin)?.getAssociatedActivity();
function advantage(config) { for (const r of config.rolls) { r.options ??= {}; r.options.disadvantage ||= r.options.advantageMode === -1; r.options.advantage = true; if (r.options.advantageMode !== undefined) r.options.advantageMode = r.options.disadvantage ? 0 : 1; } }
export function prepareImmutability(config, _dialog, message) {
  const source = saveOrigin(message), actor = config.subject, level = game.messages.get(message.data?.system?.origin)?.system?.level ?? source?.item.system.level;
  if (!actor?.isOwner || !ownedItem(actor, "immutability") || source?.item?.type !== "spell" || source.item.system.school !== "trs" || level > 5) return;
  if (["enlarge-reduce", "levitate", "slow", "polymorph"].includes(source.item.system.identifier)) advantage(config);
}
export async function chooseImmutability(message) {
  if (message.type !== "save" || message.author?.id !== game.user.id || message.system.forceSuccess || !message.rolls[0]?.isFailure) return;
  const actor = message.getAssociatedActor(), source = game.messages.get(message.system.origin)?.getAssociatedActivity();
  if (!actor?.isOwner || !ownedItem(actor, "immutability") || source?.item.type !== "spell" || source.item.system.identifier !== "polymorph") return;
  if (await foundry.applications.api.DialogV2.confirm({ window: { title: "Амулет неизменности" }, content: "<p>Автоматически преуспеть против Превращения?</p>" })
    && ownedItem(actor, "immutability")) await message.update({ "system.resisted": true });
}
function solarMarked(activity, message) {
  if (!activity?.actor?.isOwner || !(activity.getActionType ? ["mwak", "rwak"].includes(activity.getActionType()) : ["weapon", "unarmed"].includes(activity.attack?.type.classification))) return false;
  const targets = message.data?.system?.targets ?? [], caster = activity.actor;
  return targets.length && ownedItem(caster, "solar-sight") && targets.every(t => {
    const target = resolve(t.token)?.actor ?? resolve(t.actor);
    return target && effects(target).some(e => {
      if (!e.active || e.duration?.expired || !e.flags.spikependium?.griffonSolarMark) return false;
      const uuid = e.system.origin?.activity, source = resolve(uuid?.startsWith(".") ? `${target.uuid}${uuid}` : uuid);
      return source?.actor?.uuid === caster.uuid && key(source.item) === "spell:gs2-solar-mark"
        && source.item.system.sourceItem === "equipment:griffon-solar-sight" && resolve(e.system.origin.effect)?.active;
    });
  });
}
export function prepareSolarAttack(config, _dialog, message) {
  for (const r of config.rolls) { r.parts = r.parts.filter(p => p !== "@spikependiumSolarAttack"); if (r.data) delete r.data.spikependiumSolarAttack; }
  if (solarMarked(config.subject, message)) for (const r of config.rolls) { r.parts.push("@spikependiumSolarAttack"); (r.data ??= {}).spikependiumSolarAttack = 2; }
}
export function prepareSolarDamage(config, _dialog, message) {
  for (const r of config.rolls) {
    r.options ??= {};
    r.parts = r.parts.filter(p => p !== "@spikependiumSolarDamage"); if (r.data) delete r.data.spikependiumSolarDamage;
    if (r.options.spikependiumSolar && r.options.type === "radiant") r.options.type = r.options.spikependiumSolar.type;
    delete r.options.spikependiumSolar;
  }
  if (!solarMarked(config.subject, message)) return;
  const r = config.rolls.find(r => !(r.options.type in CONFIG.DND5E.healingTypes)); if (!r) return;
  r.options.spikependiumSolar = { type: r.options.type }; r.options.type = "radiant"; r.parts.push("@spikependiumSolarDamage"); (r.data ??= {}).spikependiumSolarDamage = "1d6";
}
export function recordHealerHeroism(target, _amount, updates, options) {
  const origin = options.originatingMessage?.getOriginatingMessage?.(), activity = origin?.getAssociatedActivity(), caster = activity?.actor;
  if (!caster?.isOwner || caster.uuid === target.uuid || activity.activation.type !== "action" || !ownedItem(caster, "healer-heroism")) return;
  const before = target.system.attributes.hp.value, after = updates["system.attributes.hp.value"], mod = caster.getRollData().attributes?.spell?.mod;
  if (!(after > before) || !Number.isFinite(mod) || !origin.id) return;
  let map = healing.get(options); if (!map) healing.set(options, map = new Map()); map.set(target.uuid, { caster, before, activity, origin: origin.id, mod });
}
export async function applyHealerHeroism(target, _amount, options) {
  const frame = healing.get(options)?.get(target.uuid); healing.get(options)?.delete(target.uuid); if (!frame || !(target.system.attributes.hp.value > frame.before)) return;
  const { caster, origin, mod, activity } = frame, ring = ownedItem(caster, "healer-heroism"), lock = `${caster.uuid}:${origin}`;
  if (!ring || caster.flags.spikependium?.healerHeroism?.[origin] || granting.has(lock)) return;
  granting.add(lock);
  try {
    await caster.setFlag("spikependium", `healerHeroism.${origin}`, true);
    await caster.update({ "system.attributes.hp.temp": Math.max(caster.system.attributes.hp.temp, mod, 0) });
    const data = { name: "Героизм целителя: иммунитет к испугу", type: "base", img: ring.img, transfer: false, disabled: false,
      system: { origin: { activity: activity.uuid }, changes: [{ _id: foundry.utils.randomID(), key: "system.traits.ci.value", value: "frightened", type: "add", phase: "initial", priority: null }] },
      duration: { value: null, units: "seconds", expiry: "sourceEnd", expired: false }, start: ActiveEffect.implementation.getEffectStart(), flags: { spikependium: { healerHeroismRing: ring.uuid } } };
    const old = caster.effects.find(e => e.flags.spikependium?.healerHeroismRing === ring.uuid);
    if (old) await old.update(data); else await caster.createEmbeddedDocuments("ActiveEffect", [data]);
  } finally { granting.delete(lock); }
}
