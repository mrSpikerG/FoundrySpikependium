import { knownBlueprints, prepareForgeCreation, finishForge } from "./forge.mjs";
import { tokenDistance } from "./effects.mjs";
import { appendStorageRefund } from "./storage.mjs";
import { appendLifeTransferRefund, isLifeTransfer } from "./companions.mjs";

export function replicas(actor, mode, actors = [...game.actors, ...[...game.scenes].flatMap(s => s.tokens.map(t => t.actor))]) {
  const known = new Set(knownBlueprints(actor).map(i => i.id));
  return [...new Set([actor, ...actors].filter(Boolean))].flatMap(a => [...a.items]).filter(item => {
    const tag = item.flags.spikependium?.forged;
    if (!tag || tag.owner !== actor.uuid || tag.temporary || tag.pending || !known.has(tag.plan)
      || (tag.expires != null && tag.expires <= game.time.worldTime) || !item.actor.isOwner) return false;
    if (mode === "charge") return item.system.uses?.max > 0 && item.system.uses.spent > 0
      && /\bcharges?\b|заряд/iu.test(item.system.description?.value ?? "");
    return mode !== "drain" || ["common", "uncommon", "rare"].includes(item.system.rarity);
  });
}

export function appendTinkerFields(activity, config, context) {
  const mode = activity.flags.spikependium?.forge;
  if (!["charge", "drain", "transmute", "sacrifice"].includes(mode)) return context;
  const items = replicas(activity.actor, mode);
  if (mode === "sacrifice") {
    for (const item of items.filter(i => ["uncommon", "rare"].includes(i.system.rarity))) {
      const key = item.uuid.replaceAll(".", "_");
      context.fields.push({ name: `spikependium.forge.sacrifice.${key}`, value: config.spikependium?.forge?.sacrifice?.[key] ?? false,
        field: new foundry.data.fields.BooleanField({ label: `${item.name} — ${item.actor.name}` }), input: context.inputs.createCheckboxInput });
    }
    context.notes.push({ type: "info", message: "Выберите необычные или редкие копии. Хиты изменятся на 20 за каждый предмет, в пределах максимума. Касание не требуется." });
    context.hasConsumption = true;
    return context;
  }
  context.fields.push({ name: "spikependium.forge.replica", value: config.spikependium?.forge?.replica ?? items[0]?.uuid,
    field: new foundry.data.fields.StringField({ label: "Созданная вами копия", required: true, blank: false,
      choices: Object.fromEntries(items.map(i => [i.uuid, `${i.name} — ${i.actor.name}`])) }) });
  context.notes.push({ type: "info", message: "Предмет должен быть в пределах 5 футов. Для предмета на чужом листе нужны права владельца или помощь Мастера." });
  context.hasConsumption = true;
  return context;
}

export async function prepareTinkering(activity, config, updates) {
  const mode = activity.flags.spikependium?.forge;
  if (mode === "sacrifice") return prepareSacrifice(activity, config, updates);
  if (!["charge", "drain", "transmute"].includes(mode)) return updates;
  const actor = activity.actor;
  const selection = config.spikependium?.forge ?? {};
  const item = replicas(actor, mode).find(i => i.uuid === selection.replica);
  if (!item || (actor.classes.artificer?.system.levels ?? 0) < 6) {
    ui.notifications.warn("Выберите доступную копию своего магического предмета.");
    return false;
  }
  const holder = item.actor;
  if (holder !== actor && tokenDistance(actor, holder) > 5) {
    ui.notifications.warn("Предмет находится дальше 5 футов.");
    return false;
  }
  const foreign = holder !== actor;
  const changes = [];
  const undo = { holder: holder.uuid, created: [], deleted: [], item: [], containers: [] };
  if (mode === "charge") {
    undo.charge = item.id;
    const paid = Object.entries(updates.actor).find(([path, value]) => {
      const key = path.match(/^system\.spells\.(spell[1-9]|pact)\.value$/)?.[1];
      return key && value === actor.system.spells[key]?.value - 1;
    });
    if (!paid) {
      ui.notifications.warn("Для закачки нужно потратить ячейку заклинания.");
      return false;
    }
    const key = paid[0].split(".")[2];
    const level = key === "pact" ? actor.system.spells.pact.level : Number(key.slice(5));
    if (!Number.isInteger(level) || level < 1 || level > 9) return false;
    const amount = Math.min(item.system.uses.spent, level);
    changes.push({ _id: item.id, "system.uses.spent": item.system.uses.spent - amount });
    if (foreign) undo.item.push({ _id: item.id, keyPath: "system.uses.spent", delta: -amount });
  } else {
    let replacement;
    if (mode === "drain") {
      if (Object.values(actor.flags.spikependium?.drainedSlots ?? {}).some(n => n > 0)) {
        ui.notifications.warn("Откачка уже использована после последнего продолжительного отдыха.");
        return false;
      }
      const key = item.system.rarity === "common" ? "spell1" : "spell2";
      updates.actor[`system.spells.${key}.value`] = actor.system.spells[key].value + 1;
      updates.actor[`flags.spikependium.drainedSlots.${key}`] = 1;
      undo.drain = { key, rest: actor.flags.spikependium?.longRest ?? "" };
    } else {
      const prepared = await prepareForgeCreation(activity, config, updates);
      if (!prepared) return false;
      replacement = updates.create.at(-1);
      const oldTag = item.flags.spikependium.forged;
      replacement.flags.spikependium.forged = { ...oldTag, plan: replacement.flags.spikependium.forged.plan,
        pending: replacement.flags.spikependium.forged.pending };
      replacement.system.container = item.system.container;
      replacement.system.equipped = item.system.equipped;
      if (selection.attune && holder.items.filter(i => i.system.attuned && i !== item).length >= holder.system.attributes.attunement.max) {
        ui.notifications.warn("Достигнут предел настройки у владельца предмета.");
        return false;
      }
      replacement.system.attuned = !!selection.attune;
      if (updates.spikependium?.forge) updates.spikependium.forge.holder = holder.uuid;
      if (foreign) {
        updates.create = updates.create.filter(i => i !== replacement);
        updates.operations ??= [];
        updates.operations.push({ action: "create", documentName: "Item", parent: holder, data: [replacement], keepId: true });
        undo.created.push(replacement._id);
      }
    }
    for (const content of holder.items.filter(i => i.system.container === item.id)) {
      const next = replacement?.type === "container" ? replacement._id : null;
      changes.push({ _id: content.id, "system.container": next });
      undo.containers.push({ id: content.id, before: item.id, after: next });
    }
    if (foreign) {
      updates.operations ??= [];
      updates.operations.push({ action: "delete", documentName: "Item", parent: holder, ids: [item.id] });
      undo.deleted.push(item.toObject());
    } else updates.delete.push(item.id);
  }
  if (foreign && changes.length) {
    updates.operations ??= [];
    updates.operations.push({ action: "update", documentName: "Item", parent: holder, updates: changes });
  } else updates.item.push(...changes);
  updates.spikependium = { ...updates.spikependium, tinkerUndo: undo };
  return updates;
}

export function prepareSacrifice(activity, config, updates) {
  const actor = activity.actor;
  const hp = actor.system.attributes.hp;
  if ((actor.classes.artificer?.system.levels ?? 0) < 20 || hp.value !== 0 || !Number.isFinite(hp.effectiveMax) || hp.effectiveMax <= 0 || actor.statuses.has("dead")
    || actor.system.attributes.death.failure >= 3 || actor.flags.spikependium?.soulInstantDeath === 1) {
    ui.notifications.warn("Обман смерти требует 0 хитов без мгновенной смерти персонажа.");
    return false;
  }
  const available = replicas(actor, "sacrifice").filter(i => ["uncommon", "rare"].includes(i.system.rarity));
  const selection = config.spikependium?.forge?.sacrifice ?? {};
  const keys = new Set(available.map(i => i.uuid.replaceAll(".", "_")));
  if (Object.entries(selection).some(([key, value]) => value && (value !== true || !keys.has(key)))) return false;
  const selected = available.filter(i => selection[i.uuid.replaceAll(".", "_")] === true);
  if (!selected.length) {
    ui.notifications.warn("Выберите хотя бы одну доступную необычную или редкую копию.");
    return false;
  }
  const undo = { holder: actor.uuid, created: [], deleted: [], item: [], containers: [], additional: [] };
  for (const holder of new Set(selected.map(i => i.actor))) {
    const ids = selected.filter(i => i.actor === holder).map(i => i.id);
    const record = holder === actor ? undo : { holder: holder.uuid, created: [], deleted: [], item: [], containers: [] };
    const contents = holder.items.filter(i => !ids.includes(i.id) && ids.includes(i.system.container));
    const changes = contents.map(i => ({ _id: i.id, "system.container": null }));
    record.containers = contents.map(i => ({ id: i.id, before: i.system.container, after: null }));
    if (holder === actor) {
      updates.delete.push(...ids);
      updates.item.push(...changes);
    } else {
      record.deleted = selected.filter(i => i.actor === holder).map(i => i.toObject());
      undo.additional.push(record);
      updates.operations ??= [];
      updates.operations.push({ action: "delete", documentName: "Item", parent: holder, ids });
      if (changes.length) updates.operations.push({ action: "update", documentName: "Item", parent: holder, updates: changes });
    }
  }
  const value = Math.min(hp.effectiveMax, 20 * selected.length);
  Object.assign(updates.actor, { "system.attributes.hp.value": value,
    "system.attributes.death.success": 0, "system.attributes.death.failure": 0 });
  undo.soul = { hp: value };
  updates.spikependium = { ...updates.spikependium, tinkerUndo: undo };
  return updates;
}

export function recordSoulDamage(actor, amount, updates) {
  if (!actor.items.some(i => i.flags.spikependium?.key === "artificer:soul-of-artifice")) return;
  const hp = actor.system.attributes.hp;
  if (updates["system.attributes.hp.value"] !== 0) return;
  if (hp.value === 0 && actor.flags.spikependium?.soulInstantDeath === 1) return;
  const remainder = amount - Math.min(Math.max(0, amount), hp.temp ?? 0) - hp.value;
  updates["flags.spikependium.soulInstantDeath"] = hp.effectiveMax > 0 && remainder >= hp.effectiveMax ? 1 : 0;
}

export function resetSoulDeath(actor, data) {
  const value = data["system.attributes.hp.value"] ?? data.system?.attributes?.hp?.value;
  if (value > 0 && actor.flags.spikependium?.soulInstantDeath) data["flags.spikependium.soulInstantDeath"] = 0;
}

export function addDrainedSlots(wrapped, ...args) {
  const result = wrapped(...args);
  for (const key of ["spell1", "spell2"]) if (this.flags.spikependium?.drainedSlots?.[key] === 1)
    this.system.spells[key].max += 1;
  return result;
}

export function expireDrainedSlots(actor, result, config) {
  if (config.type !== "long") return;
  for (const key of ["spell1", "spell2"]) {
    const count = actor.flags.spikependium?.drainedSlots?.[key] ?? 0;
    if (count !== 1) continue;
    result.updateData[`flags.spikependium.drainedSlots.${key}`] = 0;
    const path = `system.spells.${key}.value`;
    result.updateData[path] = Math.max(0, Math.min(actor.system.spells[key].max - count,
      result.updateData[path] ?? actor.system.spells[key].value));
  }
}

export function recordForgeConsumption(activity, config, message, updates) {
  if (!activity.flags.spikependium?.forge && activity.item.flags.spikependium?.key !== "artificer:flash-of-genius"
    && !updates.spikependium?.tinkerUndo) return;
  foundry.utils.setProperty(message, "data.flags.spikependium.forgeSelection", config.spikependium ?? {});
  foundry.utils.setProperty(message, "data.flags.spikependium.tinkerUndo", updates.spikependium?.tinkerUndo ?? null);
  const life = updates.spikependium?.tinkerUndo?.life;
  if (life) foundry.utils.setProperty(message, "data.flags.spikependium.lifeTransfer", { companion: life.companion, event: life.event });
  // Нативные дельты пропускают числовой флаг, если его прежнее значение отсутствовало.
  const deltas = foundry.utils.getProperty(message, "data.system.deltas");
  for (const change of updates.spikependium?.numericFlags ?? []) if (change.delta) {
    if (!deltas) throw new Error("Missing consumption deltas");
    deltas.actor ??= [];
    if (!deltas.actor.some(d => d.keyPath === change.keyPath)) deltas.actor.push(change);
  }
  if (message.message && updates.spikependium?.forge) finishForge(activity, config, { updates, message: message.message }).catch(error => {
    console.error("Spikependium: повторное зачарование", error);
    ui.notifications.error("Не удалось завершить зачарование; расход можно отменить в карточке.");
  });
}

export function restoreForgeSelection(wrapped, event, message) {
  const config = wrapped(event, message);
  if (this.flags.spikependium?.forge || isLifeTransfer(this) || this.item.flags.spikependium?.key === "artificer:flash-of-genius")
    config.spikependium = structuredClone(message.flags.spikependium?.forgeSelection ?? {});
  return config;
}

export async function refundTinkering(wrapped, consumed) {
  const message = game.messages.find(m => m.system.deltas === consumed);
  const undo = message?.flags.spikependium?.tinkerUndo;
  if (!undo) return wrapped(consumed);
  const refuse = text => { ui.notifications.warn(text); throw new Error(text); };
  if (undo.drain && ((this.actor.flags.spikependium?.longRest ?? "") !== undo.drain.rest
    || this.actor.flags.spikependium?.drainedSlots?.[undo.drain.key] !== 1))
    refuse("Ячейка от откачки уже исчезла после отдыха. Эта операция больше не отменяется.");
  if (undo.soul && (this.actor.system.attributes.hp.value !== undo.soul.hp || this.actor.statuses.has("dead")))
    refuse("После Обмана смерти хиты уже изменились. Отмену должен разрешить Мастер.");
  if ((consumed.created ?? []).some(id => !this.actor.items.has(id)) || (consumed.deleted ?? []).some(i => this.actor.items.has(i._id)))
    refuse("Созданный или исчезнувший предмет уже перемещён. Нужна помощь Мастера.");
  const updates = { actor: {}, create: consumed.deleted ?? [], delete: consumed.created ?? [], item: [], operations: [] };
  const subtract = (doc, changes) => Object.fromEntries(changes.map(({ keyPath, delta }) => {
    const value = keyPath.startsWith("system.activities.")
      ? foundry.utils.getProperty(doc.system.activities.get(keyPath.split(".")[2]), keyPath.split(".").slice(3).join("."))
      : foundry.utils.getProperty(doc, keyPath);
    return [keyPath, value - delta];
  }).filter(([, value]) => !Number.isNaN(value)));
  updates.actor = subtract(this.actor, consumed.actor ?? []);
  for (const [id, changes] of Object.entries(consumed.item ?? {})) {
    const item = this.actor.items.get(id);
    if (item) updates.item.push({ _id: id, ...subtract(item, changes) });
  }
  for (const record of [undo, ...(undo.additional ?? [])]) {
    const holder = await fromUuid(record.holder);
    if (!holder?.isOwner) refuse("Для отмены нужны права владельца предмета или помощь Мастера.");
    if (record.charge && !holder.items.has(record.charge)) refuse("Предмет с восстановленными зарядами уже перемещён. Нужна помощь Мастера.");
    if (record.created.some(id => !holder.items.has(id)) || record.deleted.some(i => holder.items.has(i._id)))
      refuse("Предмет уже перемещён или заменён. Отмену должен разрешить Мастер.");
    const changes = [];
    for (const change of record.item) {
      const item = holder.items.get(change._id);
      if (!item) refuse("Предмет с восстановленными зарядами уже отсутствует; нужна помощь Мастера.");
      changes.push({ _id: item.id, ...subtract(item, [change]) });
    }
    for (const c of record.containers) if (holder.items.get(c.id)?.system.container === c.after)
      changes.push({ _id: c.id, "system.container": c.before });
    // Новые вложения тоже сохраняются при отмене превращения контейнера.
    const removed = [...record.created, ...(holder === this.actor ? updates.delete : [])];
    for (const item of holder.items.filter(i => removed.includes(i.system.container) && !changes.some(c => c._id === i.id)))
      changes.push({ _id: item.id, "system.container": null });
    if (holder === this.actor) updates.item.push(...changes);
    else {
      if (record.created.length) updates.operations.push({ action: "delete", documentName: "Item", parent: holder, ids: record.created });
      if (record.deleted.length) updates.operations.push({ action: "create", documentName: "Item", parent: holder, data: record.deleted, keepId: true });
      if (changes.length) updates.operations.push({ action: "update", documentName: "Item", parent: holder, updates: changes });
    }
  }
  await appendStorageRefund(undo, updates);
  await appendLifeTransferRefund(this, undo, updates);
  await this.actor.performBulkUpdate(updates);
}
