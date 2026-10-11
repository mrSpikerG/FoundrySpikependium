// Реестр документов и конструкторы предметов, актёров и журналов.
import {
  MODULE_ID, makeId, stats, icon, source, srdSpellUuid, srdItemUuid, noteMissingRef, cond,
  activities, advItemGrant, advHP, advTrait, advASI, advSubclass, spellConfig, effect
} from "./core.mjs";
import { SPELL_NAMES, ITEM_NAMES } from "../../src/names.mjs";

/* -------------------------------------------- */
/*  Компендиумы                                 */
/* -------------------------------------------- */

export const PACKS = {
  classes: { label: "Классы", type: "Item" },
  subclasses: { label: "Подклассы", type: "Item" },
  feats: { label: "Черты", type: "Item" },
  spells: { label: "Заклинания", type: "Item" },
  items: { label: "Магические предметы", type: "Item" },
  creatures: { label: "Существа и спутники", type: "Actor" },
  rules: { label: "Правила и списки", type: "JournalEntry" }
};

const DOC_PREFIX = { Item: "items", Actor: "actors", JournalEntry: "journal" };

/** key → { pack, doc } */
export const REGISTRY = new Map();
/** pack → [folder docs] */
export const FOLDERS = new Map();
/** русское имя заклинания модуля → key */
const MODULE_SPELLS = new Map();
/** Английские имена для Babele: pack → { _id: { name } } */
export const EN_NAMES = new Map();

export const ref = key => `@@REF:${key}@@`;

export function uuidOf(key) {
  const entry = REGISTRY.get(key);
  if ( !entry ) throw new Error(`Неизвестная ссылка на документ: ${key}`);
  return `Compendium.${MODULE_ID}.${entry.pack}.${PACKS[entry.pack].type}.${entry.doc._id}`;
}

function register(pack, key, doc) {
  if ( REGISTRY.has(key) ) throw new Error(`Повторный ключ документа: ${key}`);
  REGISTRY.set(key, { pack, doc });
  return doc;
}

/* -------------------------------------------- */
/*  Папки                                       */
/* -------------------------------------------- */

const FOLDER_IDS = new Map();

/** Создаёт (или возвращает) папку внутри компендиума. path = "Изобретатель/Умения" */
export function folder(pack, folderPath, o = {}) {
  const full = `${pack}/${folderPath}`;
  if ( FOLDER_IDS.has(full) ) return FOLDER_IDS.get(full);
  const parts = folderPath.split("/");
  const name = parts.pop();
  const parent = parts.length ? folder(pack, parts.join("/")) : null;
  const _id = makeId(`folder:${full}`);
  const list = FOLDERS.get(pack) ?? [];
  list.push({
    _id, name, type: PACKS[pack].type, folder: parent, sorting: o.sorting ?? "a",
    sort: o.sort ?? (list.length + 1) * 100000, color: o.color ?? null, description: "", flags: {}, _stats: stats(),
    _key: `!folders!${_id}`
  });
  FOLDERS.set(pack, list);
  FOLDER_IDS.set(full, _id);
  return _id;
}

/* -------------------------------------------- */
/*  Разметка текста                             */
/* -------------------------------------------- */

/** Ссылка на заклинание по русскому названию: SRD, модуль или курсив. */
export function spellLink(ruName, display) {
  display ??= ruName;
  const moduleKey = MODULE_SPELLS.get(ruName);
  if ( moduleKey ) return `@UUID[${ref(moduleKey)}]{${display}}`;
  const en = SPELL_NAMES[ruName];
  const uuid = en ? srdSpellUuid(en) : null;
  if ( uuid ) return `@UUID[${uuid}]{${display}}`;
  noteMissingRef("заклинание вне SRD", ruName);
  return `<em>${display}</em>`;
}

/** UUID заклинания для выдачи (только SRD и модуль). */
export function spellUuid(ruName) {
  const moduleKey = MODULE_SPELLS.get(ruName);
  if ( moduleKey ) return ref(moduleKey);
  const en = SPELL_NAMES[ruName];
  return en ? srdSpellUuid(en) : null;
}

export function itemLink(ruName, display) {
  display ??= ruName;
  const en = ITEM_NAMES[ruName];
  const uuid = en ? srdItemUuid(en) : null;
  if ( uuid ) return `@UUID[${uuid}]{${display}}`;
  return display;
}

/**
 * Мини-разметка:
 *  - абзацы разделяются пустой строкой;
 *  - **жирный**, *курсив*;
 *  - строки «- » — маркированный список;
 *  - [[Заклинание]] или [[Заклинание|текст]] — ссылка на заклинание;
 *  - {{Предмет}} — ссылка на магический предмет SRD;
 *  - <<frightened|испуганный>> — ссылка на правило состояния;
 *  - строки, начинающиеся с «<», вставляются как есть (HTML).
 */
export function md(text) {
  if ( !text ) return "";
  const inline = s => s
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, n, d) => n.trim().startsWith("/") ? match : spellLink(n.trim(), d?.trim()))
    .replace(/\{\{([^}|]+)(?:\|([^}]+))?\}\}/g, (_, n, d) => itemLink(n.trim(), d?.trim()))
    .replace(/<<([a-zA-Z]+)\|([^>]+)>>/g, (_, id, ru) => cond(id, ru))
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  const blocks = text.trim().split(/\n\s*\n/);
  return blocks.map(block => {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    if ( lines[0].startsWith("<") ) return inline(lines.join(""));
    if ( lines.every(l => l.startsWith("- ")) ) {
      return `<ul>${lines.map(l => `<li><p>${inline(l.slice(2))}</p></li>`).join("")}</ul>`;
    }
    if ( lines[0].startsWith("### ") ) {
      const [h, ...rest] = lines;
      return `<h3>${inline(h.slice(4))}</h3>${rest.length ? `<p>${inline(rest.join(" "))}</p>` : ""}`;
    }
    return `<p>${inline(lines.join(" "))}</p>`;
  }).join("");
}

/** Таблица «Уровень — Заклинания» со ссылками. */
export function spellTable(caption, rows, header = ["Уровень", "Заклинания"]) {
  const body = Object.entries(rows).map(([lvl, list]) =>
    `<tr><td>${lvl}</td><td>${list.map(n => spellLink(n)).join(", ")}</td></tr>`).join("");
  return `<table><caption>${caption}</caption><thead><tr><th>${header[0]}</th><th>${header[1]}</th></tr></thead><tbody>${body}</tbody></table>`;
}

/** Простая таблица из массива строк. */
export function table(caption, header, rows) {
  const cap = caption ? `<caption>${caption}</caption>` : "";
  return `<table>${cap}<thead><tr>${header.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${
    rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

/* -------------------------------------------- */
/*  Общие части предметов                       */
/* -------------------------------------------- */

/** Действиям без собственной иконки назначается иконка предмета. */
function fillActivityIcons(system, img) {
  for ( const a of Object.values(system.activities ?? {}) ) if ( !a.img ) a.img = img;
}

function itemBase(pack, key, o, type, system) {
  if (pack === "items") system.description.value += `<p><em>Цена: ориентир по редкости из правил 2024 года${type === "weapon" || o.baseItem ? " плюс стоимость базового предмета" : ""}; в UA цена не указана. ${type === "weapon" ? "Это шаблон зачарования: вес и урон берутся от выбранного оружия." : o.weightNote ?? (o.weight == null ? "Вес в UA не указан; значение 0 — техническое, задайте его по решению Мастера." : "Вес взят у базового предмета.")}</em></p>`;
  const _id = makeId(`item:${key}`);
  fillActivityIcons(system, icon(o.img));
  const effects = (o.effects ?? []).map(e => ({ ...e, _key: `!items.effects!${_id}.${e._id}` }));
  const doc = {
    _id,
    name: o.name,
    type,
    img: icon(o.img),
    system,
    effects,
    folder: o.folder ?? null,
    sort: o.sort ?? 0,
    ownership: { default: 0 },
    flags: { [MODULE_ID]: { key, ...(o.en ? { originalName: o.en } : {}) }, ...(o.flags ?? {}) },
    _stats: stats(),
    _key: `!items!${_id}`
  };
  if ( o.en ) {
    const names = EN_NAMES.get(pack) ?? {};
    names[_id] = { ru: o.name, en: o.en };
    EN_NAMES.set(pack, names);
  }
  return register(pack, key, doc);
}

function description(o) {
  return { value: o.html ?? md(o.desc), chat: "" };
}

/* -------------------------------------------- */
/*  Умения и черты (тип feat)                   */
/* -------------------------------------------- */

/**
 * Умение класса/подкласса/черта.
 * o: { key, pack, folder, name, en, img, desc|html, book, page, typeValue, subtype, level, requirements,
 *      repeatable, uses, acts, effects, advancement, identifier, properties }
 */
export function feature(o) {
  if ( o.levelClass ) {
    for ( const a of o.acts ?? [] ) {
      const lvl = a.visibility?.level;
      if ( lvl && ((lvl.min != null) || (lvl.max != null)) && !a.visibility.identifier ) a.visibility.identifier = o.levelClass;
      const ability = { artificer: "int", psion: "int", wizard: "int", cleric: "wis", druid: "wis", ranger: "wis", bard: "cha", paladin: "cha", sorcerer: "cha", warlock: "cha" }[o.levelClass];
      if (ability && a.save?.dc.calculation === "spellcasting") a.save.dc.calculation = ability;
    }
  }
  const system = {
    description: description(o),
    source: source(o.book, o.page),
    identifier: o.identifier ?? "",
    type: { value: o.typeValue ?? "class", subtype: o.subtype ?? "" },
    requirements: o.requirements ?? "",
    prerequisites: { level: o.level ?? null, repeatable: !!o.repeatable, items: o.prerequisiteItems ?? [] },
    uses: o.uses ?? { max: "", spent: 0, recovery: [] },
    activities: activities(o.acts),
    properties: o.properties ?? [],
    advancement: o.advancement ?? [],
    enchant: {}
  };
  return itemBase(o.pack ?? "classes", o.key, o, "feat", system);
}

/** Черта (feat) — обёртка над feature. */
export function feat(o) {
  return feature({ pack: "feats", typeValue: "feat", ...o });
}

/* -------------------------------------------- */
/*  Классы и подклассы                          */
/* -------------------------------------------- */

/**
 * Стартовое снаряжение «Выберите А или Б».
 * itemsA: [{ uuid, count }], goldA, goldB — золото в вариантах.
 */
export function startingEquipmentAB(key, itemsA, goldA, goldB) {
  const id = s => makeId(`start:${key}:${s}`);
  const or = id("or"), and = id("and");
  const out = [
    { _id: or, type: "OR", group: "", sort: 100000, requiresProficiency: false },
    { _id: and, type: "AND", group: or, sort: 200000, requiresProficiency: false }
  ];
  itemsA.forEach((it, i) => out.push({
    _id: id(`a${i}`), type: "linked", key: it.uuid, count: it.count ?? null, group: and,
    sort: 300000 + i * 1000, requiresProficiency: false
  }));
  if ( goldA ) out.push({ _id: id("ga"), type: "currency", key: "gp", count: goldA, group: and, sort: 390000, requiresProficiency: false });
  out.push({ _id: id("gb"), type: "currency", key: "gp", count: goldB, group: or, sort: 400000, requiresProficiency: false });
  return out;
}

/**
 * o.features: { уровень: [ключи умений] }
 * o.traits: массив advTrait
 * o.scales: массив advScale
 */
export function classItem(o) {
  const adv = [advHP(`${o.key}:hp`)];
  for ( const [lvl, keys] of Object.entries(o.features ?? {}) ) {
    adv.push(advItemGrant(`${o.key}:features:${lvl}`, Number(lvl), keys.map(ref), { title: "Умения класса" }));
  }
  for ( const lvl of o.asi ?? [4, 8, 12, 16] ) adv.push(advASI(`${o.key}:asi:${lvl}`, lvl));
  if ( o.epicBoon ) adv.push(advASI(`${o.key}:asi:19`, 19, { title: "Эпическая черта", hint: "Вы получаете эпическую черту или другую черту по вашему выбору, требованиям которой вы соответствуете. Рекомендуется черта Дар устойчивости к энергиям." }));
  adv.push(advSubclass(`${o.key}:subclass`, o.subclassLevel ?? 3));
  adv.push(...(o.traits ?? []), ...(o.scales ?? []), ...(o.extraAdvancement ?? []));
  const system = {
    description: description(o),
    source: source(o.book, o.page),
    identifier: o.identifier,
    levels: 1,
    hd: { denomination: o.hd, spent: 0, additional: "" },
    advancement: adv,
    spellcasting: o.spellcasting ?? { progression: "none", ability: "", preparation: { formula: "" } },
    startingEquipment: o.startingEquipment ?? [],
    wealth: o.wealth ?? "",
    primaryAbility: { value: o.primaryAbility ?? [], all: true },
    properties: []
  };
  return itemBase("classes", o.key, o, "class", system);
}

/**
 * o.features: { уровень: [ключи] }
 * o.spells: { уровень класса: [русские названия заклинаний] } — всегда подготовленные
 */
export function subclassItem(o) {
  const adv = [];
  for ( const [lvl, keys] of Object.entries(o.features ?? {}) ) {
    adv.push(advItemGrant(`${o.key}:features:${lvl}`, Number(lvl), keys.map(ref), { title: "Умения подкласса" }));
  }
  for ( const [lvl, names] of Object.entries(o.spells ?? {}) ) {
    const uuids = names.map(spellUuid).filter(Boolean);
    if ( !uuids.length ) continue;
    adv.push(advItemGrant(`${o.key}:spells:${lvl}`, Number(lvl), uuids, {
      title: "Всегда подготовленные заклинания", spell: spellConfig({ abilities: o.spellAbility ? [o.spellAbility] : [] })
    }));
  }
  adv.push(...(o.extraAdvancement ?? []));
  const system = {
    description: description(o),
    source: source(o.book, o.page),
    identifier: o.identifier,
    classIdentifier: o.classIdentifier,
    advancement: adv,
    spellcasting: o.spellcasting ?? { progression: "none", ability: "", preparation: { formula: "" } }
  };
  return itemBase("subclasses", o.key, o, "subclass", system);
}

/* -------------------------------------------- */
/*  Заклинания                                  */
/* -------------------------------------------- */

const COMPONENTS = { В: "vocal", С: "somatic", М: "material" };

/**
 * o: { key, name, en, level, school, img, desc, activation, range, rangeUnits, components: "ВСМ", materials,
 *      consumed, cost, duration, durationValue, concentration, ritual, target, acts }
 */
export function spell(o) {
  const props = [...(o.components ?? "")].map(c => COMPONENTS[c]).filter(Boolean);
  if ( o.concentration ) props.push("concentration");
  if ( o.ritual ) props.push("ritual");
  const system = {
    description: description(o),
    source: source(o.book, o.page),
    identifier: o.identifier ?? "",
    activation: { type: o.activation ?? "action", value: o.activationValue ?? 1, condition: o.condition ?? o.acts?.[0]?.activation.condition ?? "" },
    duration: { value: o.durationValue != null ? String(o.durationValue) : "", units: o.duration ?? "inst" },
    level: o.level,
    materials: { value: o.materials ?? "", consumed: !!o.consumed, cost: o.cost ?? 0, supply: 0 },
    method: "spell",
    prepared: 0,
    properties: props,
    range: { value: o.range != null ? String(o.range) : "", units: o.rangeUnits ?? "ft", special: "" },
    school: o.school,
    sourceItem: "",
    target: o.target ?? structuredClone(o.acts?.[0]?.target) ?? { affects: { type: "", count: "", choice: false, special: "" }, template: { type: "", size: "", units: "ft", contiguous: false, count: "" } },
    uses: { max: "", spent: 0, recovery: [] },
    activities: activities(o.acts),
    ability: ""
  };
  const doc = itemBase("spells", o.key, o, "spell", system);
  MODULE_SPELLS.set(o.name, o.key);
  return doc;
}

/* -------------------------------------------- */
/*  Снаряжение                                  */
/* -------------------------------------------- */

/**
 * Чудесный предмет / кольцо / щит.
 * o: { key, name, en, img, desc, rarity, attunement ("" | "required" | "optional"), equipType, baseItem,
 *      armorValue, magicalBonus, uses, acts, effects, weight, price }
 */
export function equipment(o) {
  const system = {
    description: description(o),
    source: source(o.book, o.page),
    identifier: o.identifier ?? "",
    identified: true,
    unidentified: { description: "" },
    container: null,
    quantity: 1,
    weight: { value: o.weight ?? 0, units: "lb" },
    price: { value: o.price ?? 0, denomination: "gp" },
    rarity: o.rarity ?? "",
    attunement: o.attunement ?? "",
    attuned: false,
    equipped: false,
    armor: { value: o.armorValue ?? null, magicalBonus: o.magicalBonus ?? null, dex: null },
    hp: { value: null, max: null, dt: null, conditions: "" },
    type: { value: o.equipType ?? "trinket", baseItem: o.baseItem ?? "" },
    properties: o.properties ?? ["mgc"],
    strength: null,
    proficient: null,
    uses: o.uses ?? { max: "", spent: 0, recovery: [] },
    activities: activities(o.acts)
  };
  if (o.equipType === "tool") {
    delete system.armor;
    delete system.hp;
    delete system.strength;
    system.type = { value: "art", baseItem: "" };
    Object.assign(system, { ability: "", bonus: "", chatFlavor: "" });
  }
  return itemBase("items", o.key, o, o.equipType === "tool" ? "tool" : "equipment", system);
}

/**
 * Магическое оружие-шаблон: зачарование накладывается на обычное оружие (как в SRD dnd5e).
 * o.enchant: { suffix, changes: [...], riders: [ids действий] }
 */
export function weaponTemplate(o) {
  const system = {
    description: description(o),
    source: source(o.book, o.page),
    identifier: o.identifier ?? "",
    identified: true,
    unidentified: { description: "" },
    container: null,
    quantity: 1,
    weight: { value: 0, units: "lb" },
    price: { value: o.price ?? 0, denomination: "gp" },
    rarity: o.rarity ?? "",
    attunement: o.attunement ?? "",
    attuned: false,
    equipped: false,
    armor: { value: null },
    hp: { value: null, max: null, dt: null, conditions: "" },
    type: { value: o.weaponType ?? "", baseItem: "" },
    ammunition: {},
    damage: {
      base: { number: null, denomination: 0, types: [], custom: { enabled: false }, scaling: { number: 1 }, bonus: "" },
      versatile: { number: null, denomination: null, types: [], custom: { enabled: false }, scaling: { number: 1 } }
    },
    magicalBonus: o.magicalBonus ?? null,
    properties: ["mgc"],
    proficient: null,
    range: { value: null, long: null, reach: null, units: "" },
    mastery: "",
    uses: o.uses ?? { max: "", spent: 0, recovery: [] },
    activities: activities(o.acts)
  };
  return itemBase("items", o.key, o, "weapon", system);
}

/** Действие зачарования, переносящее эффект enchantEffect (и действия-«наездники») на выбранное оружие. */
export function enchantActivity(key, effectId, o = {}) {
  return {
    _id: makeId(`activity:${key}`),
    type: "enchant",
    name: o.name ?? "",
    img: "",
    sort: 0,
    activation: { type: o.activation ?? "", value: o.activation ? 1 : null, condition: "", override: !!o.activation },
    consumption: { targets: [], scaling: { allowed: false, max: "" }, spellSlot: true },
    description: { chatFlavor: "", value: "" },
    duration: { value: "", units: "inst", special: "", override: false, concentration: false },
    effects: [{ _id: effectId, level: { min: null, max: null }, riders: { activity: o.riders ?? [], effect: o.riderEffects ?? [], item: [] } }],
    range: { value: "", units: "", special: "", override: false },
    target: { template: { count: "", contiguous: false, type: "", size: "", width: "", height: "", units: "ft" }, affects: { count: "", type: "", choice: false, special: "" }, prompt: true, override: false },
    uses: { spent: 0, recovery: [], max: "" },
    enchant: { self: !!o.self },
    restrictions: { allowMagical: !!o.allowMagical, categories: o.categories ?? ["simpleM", "simpleR", "martialM", "martialR"], properties: o.properties ?? [], type: o.type ?? "weapon" },
    visibility: { identifier: "", level: { min: null, max: null }, requireAttunement: !!o.requireAttunement, requireIdentification: false, requireMagic: !!o.requireAttunement }
  };
}

export function enchantEffect(key, name, changes, img) {
  const e = effect(key, { name, img, changes, transfer: true, disabled: true });
  e.type = "enchantment";
  return e;
}

/* -------------------------------------------- */
/*  Существа                                    */
/* -------------------------------------------- */

/**
 * NPC-актёр (призыв/спутник).
 * o: { key, name, en, img, size, type, alignment, ac, acCalc, hp, hpFormula, movement, abilities, saves, senses,
 *      languages, di, dr, ci, items: [feature-like objects], bio, cr }
 */
export function npc(o) {
  const _id = makeId(`actor:${o.key}`);
  const abil = {};
  for ( const [k, v] of Object.entries(o.abilities) ) {
    abil[k] = { value: v, proficient: (o.saves ?? []).includes(k) ? 1 : 0, max: null, bonuses: { check: "", save: "" } };
  }
  const items = (o.items ?? []).map((it, i) => {
    const iid = makeId(`actor-item:${o.key}:${i}`);
    const itemImg = icon(it.img ?? "icons/svg/upgrade.svg");
    const acts = activities(it.acts);
    for ( const a of Object.values(acts) ) if ( !a.img ) a.img = itemImg;
    return {
      _id: iid,
      name: it.name,
      type: "feat",
      img: itemImg,
      system: {
        description: { value: it.html ?? md(it.desc), chat: "" },
        source: source(o.book, o.page),
        identifier: "",
        type: { value: "monster", subtype: "" },
        requirements: "",
        prerequisites: { level: null, repeatable: false, items: [] },
        uses: it.uses ?? { max: "", spent: 0, recovery: [] },
        activities: acts,
        properties: [],
        advancement: [],
        enchant: {}
      },
      effects: (it.effects ?? []).map(e => ({ ...e, _key: `!actors.items.effects!${_id}.${iid}.${e._id}` })),
      folder: null,
      sort: (i + 1) * 100000,
      ownership: { default: 0 },
      flags: {},
      _stats: stats(),
      _key: `!actors.items!${_id}.${iid}`
    };
  });
  const doc = {
    _id,
    name: o.name,
    type: "npc",
    img: icon(o.img),
    system: {
      abilities: abil,
      attributes: {
        // dnd5e 6: естественный доспех — calcs ["natural"] + flat; произвольная формула — formulas.
        ac: o.acFormula
          ? { calcs: [], flat: o.ac ?? 10, override: null, formulas: [{ formula: o.acFormula, label: o.acLabel ?? "Естественный доспех", armored: null, shielded: null }] }
          : { calcs: ["natural"], flat: o.ac ?? 10, override: null, formulas: [] },
        hp: { value: o.hp ?? 1, max: o.hp ?? 1, temp: 0, tempmax: 0, formula: o.hpFormula ?? "" },
        movement: {
          speeds: Object.fromEntries(Object.entries({ walk: o.movement?.walk ?? 30, fly: o.movement?.fly, swim: o.movement?.swim, climb: o.movement?.climb })
            .filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])),
          units: "ft", hover: !!o.movement?.hover, bonus: "", special: "", ignoredDifficultTerrain: []
        },
        senses: { ranges: { darkvision: o.senses?.darkvision ?? null, blindsight: o.senses?.blindsight ?? null, tremorsense: null, truesight: null }, units: "ft", special: o.senses?.special ?? "" },
        spellcasting: o.spellcasting ?? ""
      },
      details: {
        biography: { value: o.bio ?? "", public: "" },
        alignment: o.alignment ?? "Нейтральный",
        type: { value: o.creatureType ?? "construct", subtype: "", swarm: "", custom: "" },
        cr: o.cr ?? 0,
        habitat: { custom: "", value: [] },
        treasure: { value: [] }
      },
      traits: {
        size: o.size ?? "med",
        di: { value: o.di ?? [], bypasses: [], custom: "" },
        dr: { value: o.dr ?? [], bypasses: [], custom: "" },
        dv: { value: [], bypasses: [], custom: "" },
        ci: { value: o.ci ?? [], custom: "" },
        languages: { value: o.languages ?? [], custom: o.languagesCustom ?? "", communication: o.telepathy ? { telepathy: { value: o.telepathy, units: "ft" } } : {} }
      },
      source: source(o.book, o.page)
    },
    prototypeToken: {
      name: o.name, displayName: 20, actorLink: false, disposition: 1,
      texture: { src: icon(o.img) }, width: o.tokenSize ?? 1, height: o.tokenSize ?? 1
    },
    items,
    effects: (o.effects ?? []).map(e => ({ ...e, _key: `!actors.effects!${_id}.${e._id}` })),
    folder: o.folder ?? null,
    sort: o.sort ?? 0,
    ownership: { default: 0 },
    flags: { [MODULE_ID]: { key: o.key, ...(o.en ? { originalName: o.en } : {}) } },
    _stats: stats(),
    _key: `!actors!${_id}`
  };
  if ( o.en ) {
    const names = EN_NAMES.get("creatures") ?? {};
    names[_id] = { ru: o.name, en: o.en };
    EN_NAMES.set("creatures", names);
  }
  return register("creatures", o.key, doc);
}

/* -------------------------------------------- */
/*  Журналы                                     */
/* -------------------------------------------- */

/**
 * o.pages: [{ name, html } | { name, spells: { type, identifier, uuids, unlinked } }]
 */
export function journal(o) {
  const _id = makeId(`journal:${o.key}`);
  const pages = o.pages.map((p, i) => {
    const pid = makeId(`page:${o.key}:${i}`);
    const base = {
      _id: pid, name: p.name, sort: (i + 1) * 100000, ownership: { default: -1 }, flags: {},
      title: { show: true, level: 1 }, image: {}, video: { controls: true, volume: 0.5 }, src: null, category: null,
      _stats: stats(), _key: `!journal.pages!${_id}.${pid}`
    };
    if ( p.spells ) {
      return {
        ...base, type: "spells", text: { format: 1 },
        system: {
          type: p.spells.type ?? "class", identifier: p.spells.identifier, grouping: p.spells.grouping ?? "level",
          description: { value: p.html ?? "" },
          spells: p.spells.uuids,
          unlinkedSpells: (p.spells.unlinked ?? []).map((s, j) => ({
            _id: makeId(`unlinked:${o.key}:${i}:${j}`), identifier: "", name: s.name,
            system: { level: s.level, school: s.school ?? "" },
            source: { book: s.book ?? "", page: "", custom: s.custom ?? "", uuid: "" }
          }))
        }
      };
    }
    return { ...base, type: "text", text: { format: 1, content: p.html } };
  });
  const doc = {
    _id, name: o.name, pages, folder: o.folder ?? null, categories: [], sort: o.sort ?? 0,
    ownership: { default: 0 }, flags: { [MODULE_ID]: { key: o.key } }, _stats: stats(), _key: `!journal!${_id}`
  };
  return register("rules", o.key, doc);
}

export function journalPageUuid(key, index) {
  const entry = REGISTRY.get(key);
  return `${uuidOf(key)}.JournalEntryPage.${entry.doc.pages[index]._id}`;
}

/* -------------------------------------------- */
/*  Общие фрагменты для подклассов              */
/* -------------------------------------------- */

/** Умение «Заклинания подкласса» с таблицей. */
export function subclassSpellsFeature(o) {
  const html = md(o.intro ?? `Когда вы достигаете уровня ${o.classGenitive}, указанного в таблице «${o.tableName}», эти заклинания считаются для вас всегда подготовленными.`)
    + spellTable(o.tableName, o.spells);
  return feature({ ...o, html });
}

export { effect };
