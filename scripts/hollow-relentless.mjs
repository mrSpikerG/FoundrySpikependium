import { hollowTransformation } from "./hollow-warden.mjs";

const KEY = "subclass:hollow-warden:ancient-endurance", MAIN = "zdFRWJNT6dAXUTOU", PACT = "gkEfwcrtaiSM5o2l";
const damage = new WeakMap(), queues = new Map(), asking = new Set(), publishing = new Set();
// shortcut: разные клиенты используют неатомарные обновления dnd5e; одновременный урон одному листу должен разрешать один Мастер.
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const value = (data, path) => data[path] ?? foundry.utils.getProperty(data, path);
const feature = actor => actor?.items?.find(i => i.flags.spikependium?.key === KEY);
const applicable = actor => actor?.isOwner && (actor.classes.ranger?.system.levels ?? 0) >= 15 && feature(actor)
  && actor.system.attributes.hp.value > 0 && !actor.statuses.has("dead") && hollowTransformation(actor);
const isRelentless = activity => [MAIN, PACT].includes(activity?.id) && activity.item.flags.spikependium?.key === KEY;

export function canUseRelentless(activity, config = {}) {
  if (!isRelentless(activity)) return true;
  const id = config.spikependium?.relentlessReceipt;
  if (config.consume === false && publishing.has(id) && activity.actor.flags.spikependium?.relentless?.[id]?.spent === 1) return true;
  ui.notifications.warn("Неослабевающая охота предлагается до падения до 0 хитов. Используйте применение урона или правку хитов; старая карточка не даёт нового спасения.");
  return false;
}
export function recordRelentlessDamage(actor, amount, updates) {
  const context = damage.get(actor);
  if (context) Object.assign(context, { amount, updates });
}
export async function relentlessApplyDamage(wrapped, damages, options = {}) {
  if (!feature(this)) return wrapped(damages, options);
  const previous = queues.get(this.uuid);
  const task = (async () => {
    if (previous) await previous.catch(() => {});
    const context = {}; damage.set(this, context);
    try { return await wrapped(damages, options); } finally { damage.delete(this); }
  })();
  queues.set(this.uuid, task);
  try { return await task; } finally { if (queues.get(this.uuid) === task) queues.delete(this.uuid); }
}
function slots(actor, item) {
  const found = [];
  const activity = item.system.activities.get(MAIN);
  if (!activity) return found;
  for (let level = 4; level <= 9; level++) {
    const slot = actor.system.spells[`spell${level}`];
    if (slot?.value > 0) found.push({ key: `spell${level}`, level, count: slot.value, activity });
  }
  const pact = actor.system.spells.pact, forwarded = item.system.activities.get(PACT);
  if (forwarded && pact?.level >= 4 && pact.level <= 9 && pact.value > 0)
    found.push({ key: "pact", level: pact.level, count: pact.value, activity: forwarded });
  return found;
}
function owner(actor) {
  return game.users.filter(u => u.active && !u.isGM && actor.testUserPermission(u, "OWNER")).sort((a, b) => a.id.localeCompare(b.id))[0] ?? game.user;
}
function refund(actor, changed) {
  return Object.entries(actor.flags.spikependium?.relentless ?? {}).some(([id, record]) => record.spent > 0
    && value(changed, `flags.spikependium.relentless.${id}.spent`) === 0);
}
function maximum(actor, changed) {
  const hp = actor.system.attributes.hp, raw = actor.system._source.attributes.hp;
  const tempmax = value(changed, "system.attributes.hp.tempmax") ?? raw.tempmax;
  const max = value(changed, "system.attributes.hp.max") ?? hp.max;
  return Math.max(0, hp.effectiveMax + tempmax - raw.tempmax + max - hp.max);
}
export async function relentlessUpdate(wrapped, changed = {}, options = {}) {
  if (value(changed, "system.attributes.hp.value") !== 0 || !applicable(this) || refund(this, changed)) return wrapped(changed, options);
  const hp = this.system.attributes.hp, max = maximum(this, changed), context = damage.get(this);
  const actual = context?.updates === changed ? context : undefined;
  const lethal = actual && actual.amount - Math.min(hp.temp, Math.max(0, actual.amount)) >= hp.value + max;
  const dead = value(changed, "statuses")?.includes?.("dead") || value(changed, "flags.spikependium.soulInstantDeath") > 0;
  if (lethal || dead || max <= 0) return wrapped(changed, options);
  const item = feature(this), available = slots(this, item);
  if (!available.length) return wrapped(changed, options);
  if (asking.has(this.uuid)) { ui.notifications.warn("Сначала завершите уже открытый выбор Неослабевающей охоты."); return; }
  const form = hollowTransformation(this), before = { value: hp.value, temp: hp.temp, maximum: hp.effectiveMax };
  asking.add(this.uuid);
  try {
    const selected = await foundry.applications.api.DialogV2.query(owner(this), "input", {
      window: { title: "Неослабевающая охота" }, rejectClose: false,
      content: `<p>${foundry.utils.escapeHTML(this.name)} опускается до 0 хитов в трансформации. Потратить ячейку и вместо этого получить хиты?</p><select name="slot"><option value="">Не применять</option>${available.map(s => `<option value="${s.key}">${s.key === "pact" ? "Магия договора" : "Ячейка"} ${s.level} уровня: ${Math.min(max, 5 * s.level)} хитов (доступно ${s.count})</option>`).join("")}</select>`
        + (actual ? "" : '<label><input type="checkbox" name="instant"> Это мгновенная смерть; способность не применяется</label>')
    });
    if (this.system.attributes.hp.value !== before.value || this.system.attributes.hp.temp !== before.temp
      || this.system.attributes.hp.effectiveMax !== before.maximum || hollowTransformation(this) !== form || feature(this) !== item) {
      ui.notifications.warn("Лист или трансформация изменились во время выбора. Исходное изменение хитов отменено; примените его снова к текущему состоянию."); return;
    }
    if (!selected?.slot || selected.instant === true) return wrapped(changed, options);
    const slot = slots(this, item).find(s => s.key === selected.slot && available.some(old => old.key === s.key && old.level === s.level));
    if (!slot) { ui.notifications.warn("Выбранная ячейка недоступна. Неослабевающая охота не применена."); return wrapped(changed, options); }
    const path = `system.spells.${slot.key}.value`;
    if (value(changed, `system.spells.${slot.key}`) !== undefined || value(changed, path) !== undefined) {
      ui.notifications.warn("Это изменение листа одновременно меняет выбранные ячейки. Разрешите падение хитов отдельно."); return;
    }
    const usage = { consume: { action: false, resources: true, spellSlot: false }, scaling: slot.level - 4 };
    let paid;
    try { paid = await slot.activity._prepareUsageUpdates(usage, { returnErrors: true }); }
    catch (error) { console.error("Spikependium: расход Неослабевающей охоты", error);
      ui.notifications.error("Не удалось подготовить ячейку. Способность не применена; исходное падение хитов сохраняется."); return wrapped(changed, options); }
    if (!paid || Array.isArray(paid) || paid.item?.length || paid.create?.length || paid.delete?.length
      || paid.actor?.[path] !== this.system.spells[slot.key].value - 1) {
      ui.notifications.warn("Не удалось подготовить штатный расход ячейки. Способность не применена; исходное падение хитов сохраняется."); return wrapped(changed, options);
    }
    if (this.system.attributes.hp.value !== before.value || this.system.attributes.hp.temp !== before.temp
      || this.system.attributes.hp.effectiveMax !== before.maximum || hollowTransformation(this) !== form) {
      ui.notifications.warn("Лист изменился при подготовке ячейки. Повторите исходное изменение хитов."); return;
    }
    const id = foundry.utils.randomID(), saved = Math.min(max, 5 * slot.level);
    const record = { id, actor: this.uuid, author: game.user.id, level: slot.level, slot: slot.key, saved,
      activity: item.system.activities.get(MAIN).uuid, item: item.toObject(), spent: 1, card: "pending" };
    const data = { ...changed, ...paid.actor, "system.attributes.hp.value": saved,
      [`flags.spikependium.relentless.${id}`]: record };
    if (changed.system?.attributes?.hp) data.system = foundry.utils.deepClone(changed.system);
    if (data.system?.attributes?.hp) data.system.attributes.hp.value = saved;
    const opts = { ...options, spikependium: { ...options.spikependium,
      relentless: { id, amount: actual?.amount ?? before.value, temp: before.temp } },
      dnd5e: { ...options.dnd5e, concentrationCheck: false } };
    const result = await wrapped(data, opts);
    const actor = resolve(this.uuid) ?? this;
    if (actor.flags.spikependium?.relentless?.[id]?.spent === 1) {
      const protectedMark = actor.items.some(i => i.system.identifier === "relentless-hunter")
        && actor.concentration.effects.size === 1 && hollowTransformation(actor);
      if (actual?.amount > 0 && !game.settings.get("dnd5e", "disableConcentration") && !protectedMark
        && actor.effects.some(e => e.uuid === form.uuid && e.active)) {
        try { await actor.challengeConcentration({ dc: actor.getConcentrationDC(actual.amount) }); }
        catch (error) { console.error("Spikependium: концентрация после Неослабевающей охоты", error);
          ui.notifications.error("Спасение и ячейка записаны. Проверьте концентрацию по исходному урону вручную."); }
      }
      try { await publishRelentless(actor, id); } catch (error) {
        console.error("Spikependium: карточка Неослабевающей охоты", error);
        ui.notifications.error("Ячейка и хиты записаны, но карточка не создана. Она будет восстановлена при следующем подключении.");
      }
    }
    return result;
  } finally { asking.delete(this.uuid); }
}
export function relentlessOnUpdate(wrapped, changed, options, userId) {
  const receipt = options.spikependium?.relentless;
  if (receipt && this.flags.spikependium?.relentless?.[receipt.id]?.spent === 1 && options.dnd5e?.hp) {
    const curr = this.system.attributes.hp, tempLost = receipt.temp - curr.temp;
    options.dnd5e.hp.value = curr.value + receipt.amount - tempLost;
    options.dnd5e.hp.temp = receipt.temp;
    // Replacement HP is not healing: preserve native damage notifications using the actual damage amount.
  }
  return wrapped(changed, options, userId);
}
export function relentlessDeltaLabel(wrapped, ...args) {
  const data = wrapped(...args);
  if (/^flags\.spikependium\.relentless\.[A-Za-z0-9]{16}\.spent$/.test(this.keyPath)) data.label = "Неослабевающая охота";
  return data;
}
async function publishRelentless(actor, id) {
  const record = actor.flags.spikependium?.relentless?.[id];
  if (!actor.isOwner || record?.spent !== 1 || record.card === "done" || publishing.has(id)) return;
  if (game.users.activeGM ? !game.user.isActiveGM : game.user.id !== record.author) return;
  publishing.add(id);
  try {
    const existing = game.messages.find(m => m.flags.spikependium?.relentlessReceipt === id);
    if (!existing) {
      const item = feature(actor) ?? new CONFIG.Item.documentClass(record.item, { parent: actor });
      const activity = item.system.activities.get(MAIN);
      const result = await activity.use({ consume: false, subsequentActions: false, scaling: record.level - 4,
        spikependium: { relentlessReceipt: id } }, { configure: false }, { data: {
        flags: { spikependium: { relentlessReceipt: id }, dnd5e: { item: { data: record.item } } },
        system: { deltas: { actor: [{ keyPath: `system.spells.${record.slot}.value`, delta: -1 },
          { keyPath: "system.attributes.hp.value", delta: record.saved },
          { keyPath: `flags.spikependium.relentless.${id}.spent`, delta: 1 }], item: {} } },
        flavor: `Неослабевающая охота: вместо 0 хитов — ${record.saved}; ячейка ${record.level} уровня` }
      });
      if (!result?.message) throw Error("Не создана карточка Неослабевающей охоты");
    }
    await actor.setFlag("spikependium", `relentless.${id}.card`, "done");
  } finally { publishing.delete(id); }
}
export async function resumeRelentless() {
  const actors = new Set([...game.actors, ...[...game.scenes].flatMap(s => [...s.tokens].map(t => t.actor))]);
  for (const actor of actors) if (actor?.isOwner) for (const [id, record] of Object.entries(actor.flags.spikependium?.relentless ?? {}))
    if (record.card === "pending" && record.spent === 1) await publishRelentless(actor, id);
}
