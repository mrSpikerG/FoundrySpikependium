const isClass = item => item?.flags?.spikependium?.key === "class:alchemist";
const isASI = a => a?.type === "AbilityScoreImprovement" && isClass(a.item);
const featsAllowed = () => dnd5e.settings.rulesVersion === "modern" || game.settings.get("dnd5e", "allowFeats");
const locks = new WeakSet();
const advances = item => [...item.system.advancement];
function discoveryChoice(item) {
  return advances(item).find(a => a.id === item.flags.spikependium.alchemistDiscoveryChoice)
    ?? advances(item).find(a => a.type === "ItemChoice" && a.title === "Известные открытия");
}
const isChoice = a => a?.type === "ItemChoice" && isClass(a.item) && discoveryChoice(a.item)?.id === a.id;
const pool = item => new Set(discoveryChoice(item)?.configuration.pool.map(p => p.uuid) ?? []);
function extras(item) {
  const allowed = pool(item), rows = [];
  for (const a of advances(item)) if (isASI(a) && a.value.type === "feat")
    for (const [id, uuid] of Object.entries(a.value.feat ?? {})) if (allowed.has(uuid)) rows.push({ advancement: a, level: a.level, id, uuid });
  return rows;
}
const valueData = a => a.value.toObject();
function replacedExtra(a) {
  const row = extras(a.item).find(e => e.advancement.id === a.id), choice = discoveryChoice(a.item);
  return row && !a.actor.items.has(row.id) && Object.values(choice.value.replaced).some(r => r.original === row.id);
}
function eligible(document, actor, level, current) {
  if (!/^alchemist:discovery:/.test(document?.flags?.spikependium?.key ?? "")) return false;
  const context = { actor, level, added: document.uuid === current ? [document] : [] };
  return [...document.system.validatePrerequisites(context).values()].every(p => p.valid !== false);
}
export function alchemistAllowFeat(wrapped, ...args) {
  return isASI(this) || wrapped(...args);
}
export async function alchemistASIContext(wrapped, context, ...args) {
  const result = await wrapped(context, ...args);
  if (isASI(this.advancement) && !featsAllowed()) context.showBrowseButton = !!this.feat;
  return result;
}
export async function alchemistASIDrop(wrapped, ...args) {
  if (isASI(this.advancement) && replacedExtra(this.advancement)) {
    ui.notifications.warn("Сначала отмените замену этого открытия в продвижении более позднего уровня."); return false;
  }
  if (isASI(this.advancement) && !featsAllowed()) {
    ui.notifications.warn("Черты отключены в этом мире. Для дополнительного открытия используйте кнопку выбора открытия."); return false;
  }
  return wrapped(...args);
}
export async function chooseExtraDiscovery(flow) {
  const a = flow.advancement;
  if (!isASI(a) || !a.actor?.isOwner || locks.has(a)) return;
  if (replacedExtra(a)) { ui.notifications.warn("Сначала отмените замену этого открытия в продвижении более позднего уровня."); return; }
  locks.add(a);
  try {
    const before = valueData(a), current = Object.values(before.feat ?? {})[0], level = Number(flow.level);
    const documents = (await Promise.all([...pool(a.item)].map(uuid => fromUuid(uuid)))).filter(d => eligible(d, a.actor, level, current))
      .sort((x, y) => x.name.localeCompare(y.name, "ru"));
    if (!documents.length) { ui.notifications.warn("Нет подходящих неизученных открытий для этого уровня алхимика и специализации."); return; }
    const selected = await foundry.applications.api.DialogV2.input({ window: { title: "Открытие вместо повышения характеристик" }, rejectClose: false,
      content: `<div class="form-group"><label>Дополнительное открытие</label><select name="discovery">${documents.map(d => `<option value="${foundry.utils.escapeHTML(d.uuid)}" ${d.uuid === current ? "selected" : ""}>${foundry.utils.escapeHTML(d.name)}</option>`).join("")}</select></div>`,
      ok: { label: "Выбрать открытие" } });
    if (!selected?.discovery) return;
    const document = documents.find(d => d.uuid === selected.discovery);
    if (!document || !a.actor.isOwner || !isASI(a) || replacedExtra(a) || JSON.stringify(valueData(a)) !== JSON.stringify(before)
      || !pool(a.item).has(document.uuid) || !eligible(document, a.actor, level, current)) {
      ui.notifications.warn("Выбор или требования изменились. Откройте выбор открытия заново."); return;
    }
    if (before.type === "feat" && current === document.uuid) return;
    const retained = await a.reverse(level);
    try {
      await a.apply(level, { type: "feat", uuid: document.uuid });
      const selectedId = Object.keys(a.value.feat ?? {})[0];
      if (!selectedId || !a.actor.items.has(selectedId)) throw Error("Открытие не добавлено: прежний выбор будет восстановлен.");
    } catch (error) {
      await a.reverse(level);
      await a.apply(level, { ...retained, uuid: Object.values(retained.feat ?? {})[0] });
      throw error;
    }
    flow.render();
  } finally { locks.delete(a); }
}
export async function clearExtraDiscovery(flow) {
  const a = flow.advancement;
  if (!isASI(a) || !a.actor?.isOwner || locks.has(a) || !extras(a.item).some(e => e.advancement.id === a.id)) return;
  if (replacedExtra(a)) { ui.notifications.warn("Сначала отмените замену этого открытия в продвижении более позднего уровня."); return; }
  locks.add(a);
  try { await a.reverse(flow.level); flow.render(); } finally { locks.delete(a); }
}
export async function alchemistASIRender(wrapped, ...args) {
  const result = await wrapped(...args), a = this.advancement;
  if (!isASI(a)) return result;
  const root = this.element.querySelector(".standard-form") ?? this.element;
  root.querySelector(".spikependium-discovery-choice")?.remove();
  const controls = document.createElement("div"); controls.className = "spikependium-discovery-choice form-group";
  const chosen = extras(a.item).find(e => e.advancement.id === a.id), item = chosen && a.actor.items.get(chosen.id);
  const label = document.createElement("label"); label.textContent = item ? `Дополнительное открытие: ${item.name}` : "Открытие вместо повышения характеристик";
  const choose = document.createElement("button"); choose.type = "button"; choose.textContent = "Выбрать открытие";
  choose.disabled = !!replacedExtra(a);
  choose.addEventListener("click", () => chooseExtraDiscovery(this).catch(error => { console.error("Spikependium: выбор открытия", error); ui.notifications.error(error.message); }));
  controls.append(label, choose);
  if (chosen) {
    const clear = document.createElement("button"); clear.type = "button"; clear.textContent = "Отменить выбор открытия";
    clear.addEventListener("click", () => clearExtraDiscovery(this).catch(error => console.error("Spikependium: отмена открытия", error))); controls.append(clear);
  }
  root.append(controls);
  if (replacedExtra(a) || (!featsAllowed() && (!this.feat || chosen))) root.querySelector(".feat-section")?.remove();
  return result;
}
export async function alchemistReplacementContext(wrapped, context, ...args) {
  const result = await wrapped(context, ...args), a = this.advancement;
  if (!isChoice(a)) return result;
  const sections = [...context.sections], extraSections = new Map();
  for (const row of extras(a.item).filter(e => e.level < this.level)) {
    const item = a.actor.items.get(row.id), source = item ?? this.pool.find(d => d.uuid === row.uuid);
    if (!source) continue;
    let section = extraSections.get(row.level);
    if (!section) extraSections.set(row.level, section = { header: `Уровень ${row.level}: дополнительное открытие`, items: [] });
    if (section.items.some(i => i.id === row.id)) continue;
    const replaced = Object.entries(a.value.replaced).find(([, r]) => r.original === row.id);
    section.items.push({ id: row.id, uuid: row.uuid, name: source.name, img: source.img,
      checked: a.value.replaced[this.level]?.original === row.id, replaced: !!replaced,
      previouslyReplaced: replaced ? Number(replaced[0]) !== this.level : !item });
    if (item) ((this.retained ??= {})[row.level] ??= {})[row.id] ??= item;
  }
  context.sections = [...sections.filter(s => !s.isCurrentLevel), ...extraSections.values(), ...sections.filter(s => s.isCurrentLevel)];
  return result;
}
export async function alchemistReplaceDiscovery(wrapped, level, data, ...args) {
  if (!isChoice(this)) return wrapped(level, data, ...args);
  const original = data.replace ?? data.retainedData?.replaced?.original;
  const row = extras(this.item).find(e => e.id === original && e.level < level);
  if (!row) return wrapped(level, data, ...args);
  if (!this.actor.items.has(row.id)) throw Error("Это дополнительное открытие уже заменено или удалено.");
  const existed = this.value.added[row.level] !== undefined;
  this.updateSource({ [`value.added.${row.level}.${row.id}`]: row.uuid });
  try { return await wrapped(level, data, ...args); }
  finally {
    const value = valueData(this);
    delete value.added[row.level]?.[row.id];
    if (!existed && !Object.keys(value.added[row.level] ?? {}).length) delete value.added[row.level];
    this.updateSource({ value }, { recursive: false });
  }
}
export async function alchemistRestoreDiscovery(wrapped, level, originalId, retainedItems = {}) {
  const row = isChoice(this) && extras(this.item).find(e => e.id === originalId && e.level === level);
  if (!row) return wrapped(level, originalId, retainedItems);
  const data = (Array.isArray(retainedItems) ? retainedItems.find(i => i._id === originalId) : retainedItems[level]?.[originalId]?.toObject())
    ?? await row.advancement.createItemData(row.uuid, originalId);
  if (data) {
    data.flags ??= {}; data.flags.dnd5e ??= {};
    data.flags.dnd5e.advancementOrigin = `${this.item.id}.${row.advancement.id}`;
    data.flags.dnd5e.advancementRoot = this.item.getFlag("dnd5e", "advancementRoot") ?? data.flags.dnd5e.advancementOrigin;
    this.actor.updateSource({ items: [data] });
  }
}
