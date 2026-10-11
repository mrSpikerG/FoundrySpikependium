import { tokenDistance } from "./effects.mjs";

const worldActors = () => [...new Set([...game.actors, ...[...game.scenes].flatMap(s => s.tokens.map(t => t.actor))].filter(Boolean))];

export function storageTarget(item) {
  return (item.type === "weapon" && ["simpleM", "simpleR", "martialM", "martialR"].includes(item.system.type.value))
    || item.system.properties?.has("foc") || (item.type === "tool" && (["art", "music"].includes(item.system.type.value)
      || item.system.identifier === "thieves-tools"));
}

export function storageSpell(spell) {
  return spell?.type === "spell" && [1, 2, 3].includes(spell.system.level)
    && spell.system.activation.type === "action" && spell.system.activation.value === 1 && !spell.system.materials.consumed;
}

export async function storableSpells(actor) {
  const registry = dnd5e.registry.spellLists;
  const subclasses = actor.items.filter(i => i.type === "subclass" && i.system.classIdentifier === "artificer");
  const lists = [registry.forType("class:artificer"), ...subclasses.map(i => registry.forType("subclass", i.system.identifier))].filter(Boolean);
  const spells = (await Promise.all(lists.map(l => l.getSpells()))).flat();
  for (const spell of actor.items.filter(i => i.type === "spell")) {
    const source = actor.items.find(i => `${i.type}:${i.system.identifier}` === spell.system.sourceItem);
    if (source && ((source.type === "class" && source.system.identifier === "artificer") || subclasses.includes(source)
      || subclasses.some(s => source.flags.spikependium?.key?.startsWith(`subclass:${s.system.identifier}:`)))) spells.push(spell);
  }
  const unique = new Map();
  for (const spell of spells.filter(storageSpell)) if (!unique.has(spell._stats?.compendiumSource ?? spell.uuid))
    unique.set(spell._stats?.compendiumSource ?? spell.uuid, spell);
  return [...unique.values()];
}

export async function appendStorageFields(activity, config, context) {
  if (activity.flags.spikependium?.forge !== "store-spell") return context;
  const targets = worldActors().flatMap(a => [...a.items]).filter(i => i.actor.isOwner && storageTarget(i));
  const spells = await storableSpells(activity.actor);
  const selection = config.spikependium?.forge ?? {};
  for (const [key, label, choices] of [["target", "Оружие или фокусировка", targets], ["spell", "Заклинание изобретателя", spells]])
    context.fields.push({ name: `spikependium.forge.${key}`, value: choices.some(i => i.uuid === selection[key]) ? selection[key] : choices[0]?.uuid,
      field: new foundry.data.fields.StringField({ label, required: true, blank: false,
        choices: Object.fromEntries(choices.map(i => [i.uuid, key === "target" ? `${i.name} — ${i.actor.name}` : `${i.name} (${i.system.level} ур.)`])) }) });
  context.notes.push({ type: "info", message: "После продолжительного отдыха коснитесь выбранного предмета. Воспроизведения расходуются на самом предмете; ячейки носителя не тратятся." });
  context.hasConsumption = true;
  return context;
}

export async function prepareStorage(activity, config, updates) {
  if (activity.flags.spikependium?.forge !== "store-spell") return updates;
  const actor = activity.actor;
  const selection = config.spikependium?.forge ?? {};
  const item = worldActors().flatMap(a => [...a.items]).find(i => i.uuid === selection.target && i.actor.isOwner && storageTarget(i));
  const spell = (await storableSpells(actor)).find(s => s.uuid === selection.spell);
  const paid = updates.item.some(i => i._id === activity.item.id && i["system.uses.spent"] === activity.item.system.uses.spent + 1);
  if (!item || !spell || !paid || (actor.classes.artificer?.system.levels ?? 0) < 11) {
    ui.notifications.warn("Выберите допустимый предмет и заклинание, списав использование после отдыха.");
    return false;
  }
  if (item.actor !== actor && tokenDistance(actor, item.actor) > 5) {
    ui.notifications.warn("Выбранный предмет находится дальше 5 футов.");
    return false;
  }
  const previous = worldActors().flatMap(a => [...a.items]).flatMap(i => i.effects
    .filter(e => e.flags.spikependium?.storage?.owner === actor.uuid).map(effect => ({ item: i, effect })));
  if (previous.some(p => !p.item.actor.isOwner) || (previous.length && !game.users.activeGM)) {
    ui.notifications.warn("Для завершения прежнего хранения нужны права на предметы и подключённый Мастер.");
    return false;
  }
  const effectId = foundry.utils.randomID();
  const mod = actor.system.abilities.int.mod;
  const prof = actor.system.attributes.prof;
  const stored = { owner: actor.uuid, abilityMod: mod, proficiency: prof, spellData: spell.toObject() };
  const Cast = CONFIG.DND5E.activityTypes.cast.documentClass;
  const cast = new Cast({ type: "cast", name: `Воспроизвести: ${spell.name}`, img: spell.img,
    activation: { type: "action", value: 1, override: true },
    consumption: { spellSlot: false, targets: [{ type: "activityUses", target: "", value: "1", scaling: {} }], scaling: { allowed: false } },
    uses: { max: String(Math.max(2, 2 * mod)), spent: 0, recovery: [] },
    spell: { uuid: spell.uuid, level: spell.system.level, ability: "int", properties: ["vocal", "somatic", "material"], spellbook: true,
      challenge: { override: true, attack: String(prof + mod), save: String(8 + prof + mod) } },
    flags: { dnd5e: { dependentOn: effectId }, spikependium: { storedSpell: stored } }
  }, { parent: item }).toObject();
  const effect = { _id: effectId, name: `Хранящий заклинания предмет: ${spell.name}`, img: spell.img,
    type: "enchantment", transfer: true, disabled: false, system: { magical: false, changes: [], origin: { activity: activity.uuid } },
    flags: { spikependium: { storage: { owner: actor.uuid } } } };
  const undo = { holder: actor.uuid, created: [], deleted: [], item: [], containers: [], storage: [] };
  updates.operations ??= [];
  for (const oldItem of new Set(previous.map(p => p.item))) {
    const effects = previous.filter(p => p.item === oldItem).map(p => p.effect);
    const acts = oldItem.system.activities.filter(a => effects.some(e => e.id === a.flags.dnd5e?.dependentOn));
    const changes = Object.fromEntries(acts.map(a => [`system.activities.-=${a.id}`, null]));
    undo.storage.push({ item: oldItem.uuid, effects: effects.map(e => e.toObject()), activities: acts.map(a => a.toObject()), created: [] });
    updates.operations.push({ action: "delete", documentName: "ActiveEffect", parent: oldItem, ids: effects.map(e => e.id) });
    if (acts.length) updates.operations.push({ action: "update", documentName: "Item", parent: oldItem.actor, updates: [{ _id: oldItem.id, ...changes }] });
  }
  undo.storage.push({ item: item.uuid, effects: [], activities: [], created: [{ effect: effectId, activity: cast._id }] });
  updates.operations.push({ action: "create", documentName: "ActiveEffect", parent: item, data: [effect], keepId: true });
  updates.operations.push({ action: "update", documentName: "Item", parent: item.actor,
    updates: [{ _id: item.id, [`system.activities.${cast._id}`]: cast }] });
  updates.spikependium = { ...updates.spikependium, tinkerUndo: undo };
  return updates;
}

export async function storedCachedSpell(wrapped, ...args) {
  const stored = this.flags.spikependium?.storedSpell;
  if (!stored) return wrapped(...args);
  const original = new CONFIG.Item.documentClass(stored.spellData);
  const data = original.clone({ effects: [...original.effects.map(e => e.toObject()), {
    _id: this.constructor.ENCHANTMENT_ID, type: "enchantment", name: "Воспроизведение сохранённого заклинания",
    system: { changes: this.getSpellChanges(), origin: { activity: this.uuid } }, transfer: true
  }], flags: { dnd5e: { cachedFor: this.relativeUUID }, spikependium: { storedSpell: {
    owner: stored.owner, abilityMod: stored.abilityMod, proficiency: stored.proficiency
  } } }, "system.sourceItem": `${this.item.type}:${this.item.identifier}`, _stats: { compendiumSource: this.spell.uuid } }).toObject();
  data.folder = null;
  data.system.uses = { max: "", spent: 0, recovery: [] };
  return data;
}

function maintainsStoredSpell(actor, id) {
  return actor.concentration.effects.some(effect => {
    const source = effect.flags.dnd5e?.item;
    return source?.id === id || source?.data?._id === id;
  });
}

export async function preserveStoredCache(wrapped, changed, options, ...args) {
  const result = await wrapped(changed, options, ...args);
  if (result === false || !this.actor || !options.dnd5e?.removedCachedItems) return result;
  // Удаление нативного кэша завершает концентрацию; уже воспроизведённый эффект должен продолжаться.
  options.dnd5e.removedCachedItems = options.dnd5e.removedCachedItems.filter(id => {
    const item = this.actor.items.get(id);
    return !item?.flags.spikependium?.storedSpell || !maintainsStoredSpell(this.actor, id);
  });
  return result;
}

export async function cleanStoredCaches(actor) {
  if (!actor?.isOwner || (game.users.activeGM && !game.user.isActiveGM)) return;
  const obsolete = actor.items.filter(item => item.flags.spikependium?.storedSpell && item.flags.dnd5e?.cachedFor
    && !fromUuidSync(item.flags.dnd5e.cachedFor, { relative: actor, strict: false }) && !maintainsStoredSpell(actor, item.id));
  if (obsolete.length) await actor.deleteEmbeddedDocuments("Item", obsolete.map(i => i.id));
}

export function storedItemRollData(wrapped, ...args) {
  const data = wrapped(...args);
  const stored = this.flags.spikependium?.storedSpell;
  if (!stored) return data;
  data.abilities = { ...data.abilities, int: { ...data.abilities?.int, mod: stored.abilityMod } };
  data.attributes = { ...data.attributes, spell: { ...data.attributes?.spell, mod: stored.abilityMod } };
  return data;
}

export function storedActivityRollData(wrapped, ...args) {
  const data = wrapped(...args);
  const stored = this.item.flags.spikependium?.storedSpell;
  if (stored) data.mod = stored.abilityMod;
  return data;
}

export function prepareStoredCast(wrapped, ...args) {
  const result = wrapped(...args);
  if (this.flags.spikependium?.storedSpell) {
    this.visibility.requireMagic = false;
    this.visibility.requireAttunement = false;
  }
  return result;
}

export function storedCooldownReady(marker, combat) {
  // shortcut: при перестановке инициативы после применения начало следующего хода проверяет Мастер; для этого нужен отдельный трекер событий боя.
  if (!combat?.started || !marker?.round || marker.combat !== combat.id) return true;
  const turns = combat.turns.map((c, index) => ({ actor: c.actor?.uuid, index })).filter(c => c.actor === marker.holder);
  if (!turns.length) return false;
  return turns.some(({ index }) => combat.round > marker.round + (marker.turn - 1 >= index ? 1 : 0)
    || (combat.round === marker.round + (marker.turn - 1 >= index ? 1 : 0) && combat.turn >= index));
}

function storedOrigin(activity, config = {}) {
  return activity.flags.spikependium?.storedSpell ? activity : activity.getLinkedActivity?.(config.cause?.activity);
}

export function canUseStoredSpell(activity, config = {}) {
  const cast = storedOrigin(activity, config);
  if (activity.item.flags.spikependium?.storedSpell && activity.consumption.spellSlot !== false && !cast?.flags.spikependium?.storedSpell) {
    ui.notifications.warn("Предмет с сохранённым заклинанием уже отсутствует.");
    return false;
  }
  if (!cast?.flags.spikependium?.storedSpell) return true;
  if (activity.type !== "cast" && activity.consumption.spellSlot === false) return true;
  if (cast.dependentOrigin?.active !== true || cast.uses.spent >= cast.uses.max) {
    ui.notifications.warn("Сохранённое заклинание отключено или его применения закончились.");
    return false;
  }
  if (!storedCooldownReady(cast.item.flags.spikependium?.storedCooldown?.[cast.id], game.combat)) {
    ui.notifications.warn("Повторное воспроизведение доступно с начала следующего хода предыдущего носителя.");
    return false;
  }
  return true;
}

export function prepareStoredUsage(activity, config, updates) {
  const cast = storedOrigin(activity, config);
  if (!cast?.flags.spikependium?.storedSpell || activity.consumption.spellSlot === false) return updates;
  if (!canUseStoredSpell(activity, config)) return false;
  const path = `system.activities.${cast.id}.uses.spent`;
  if (!updates.item.some(i => i._id === cast.item.id && (i[path]
    ?? foundry.utils.getProperty(i[`system.activities.${cast.id}`], "uses.spent")
    ?? foundry.utils.getProperty(i, path)) === cast.uses.spent + 1)) {
    ui.notifications.warn("Для воспроизведения спишите одно применение сохранённого заклинания.");
    return false;
  }
  const before = cast.item.flags.spikependium?.storedCooldown?.[cast.id] ?? null;
  const marker = game.combat?.started
    ? { combat: game.combat.id, holder: activity.actor.uuid, round: game.combat.round, turn: game.combat.turn + 1 } : before;
  const update = updates.item.find(i => i._id === cast.item.id);
  if (game.combat?.started) Object.assign(update, { [`flags.spikependium.storedCooldown.${cast.id}`]: marker });
  updates.spikependium = { ...updates.spikependium, tinkerUndo: { holder: activity.actor.uuid, created: [], deleted: [], item: [], containers: [],
    storedUse: { item: cast.item.uuid, activity: cast.id, before, after: marker, spent: cast.uses.spent + 1 } } };
  return updates;
}

export async function appendStorageRefund(undo, updates) {
  const refuse = text => { ui.notifications.warn(text); throw new Error(text); };
  if (undo.storedUse) {
    const item = await fromUuid(undo.storedUse.item);
    const use = undo.storedUse;
    if (!item?.actor.isOwner || item.actor.uuid !== undo.holder || !item.system.activities.has(use.activity)
      || item.system.activities.get(use.activity).uses.spent !== use.spent
      || JSON.stringify(item.flags.spikependium?.storedCooldown?.[use.activity] ?? null) !== JSON.stringify(use.after))
      refuse("Предмет или ход уже изменился. Отмену воспроизведения должен выполнить Мастер.");
    updates.item.push({ _id: item.id, ...(use.before ? { [`flags.spikependium.storedCooldown.${use.activity}`]: use.before }
      : { [`flags.spikependium.storedCooldown.-=${use.activity}`]: null }) });
  }
  for (const record of undo.storage ?? []) {
    const item = await fromUuid(record.item);
    if (!item?.actor.isOwner) refuse("Для отмены вложения нужны права на прежний и новый предметы.");
    if (!game.users.activeGM) refuse("Для отмены зачарования нужен подключённый Мастер.");
    if (record.effects.some(e => item.effects.has(e._id)) || record.activities.some(a => item.system.activities.has(a._id))
      || record.created.some(c => !item.effects.has(c.effect) || !item.system.activities.has(c.activity)
        || item.system.activities.get(c.activity).uses.spent !== 0))
      refuse("Сохранённое заклинание уже использовано или предмет изменён. Нужна помощь Мастера.");
    const changes = Object.fromEntries([...record.created.map(c => [`system.activities.-=${c.activity}`, null]),
      ...record.activities.map(a => [`system.activities.${a._id}`, a])]);
    if (record.created.length) updates.operations.push({ action: "delete", documentName: "ActiveEffect", parent: item, ids: record.created.map(c => c.effect) });
    if (record.effects.length) updates.operations.push({ action: "create", documentName: "ActiveEffect", parent: item, data: record.effects, keepId: true });
    if (Object.keys(changes).length) updates.operations.push({ action: "update", documentName: "Item", parent: item.actor, updates: [{ _id: item.id, ...changes }] });
  }
}
