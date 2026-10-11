// Ядро сборщика Spikependium: идентификаторы, конструкторы документов, действий и эффектов.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MODULE_ID = "spikependium";
export const CORE_VERSION = "14.367";
export const SYSTEM_VERSION = "6.0.6";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const SRD = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/data/srd.json"), "utf8"));
const ICONS = new Set(fs.readFileSync(path.join(ROOT, "tools/data/icons.txt"), "utf8").split(/\r?\n/).filter(Boolean));

/* -------------------------------------------- */
/*  Идентификаторы                              */
/* -------------------------------------------- */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Детерминированный 16-символьный ID Foundry из строкового ключа. */
export function makeId(key) {
  const bytes = crypto.createHash("sha256").update(`${MODULE_ID}:${key}`).digest();
  let out = "";
  for ( let i = 0; i < 16; i++ ) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function stats() {
  return {
    compendiumSource: null, duplicateSource: null, exportSource: null,
    coreVersion: CORE_VERSION, systemId: "dnd5e", systemVersion: SYSTEM_VERSION,
    createdTime: 1760054400000, modifiedTime: 1760054400000, lastModifiedBy: null
  };
}

/* -------------------------------------------- */
/*  Иконки                                      */
/* -------------------------------------------- */

const missingIcons = new Set();

/** Проверяет, что иконка существует в Foundry/dnd5e; короткий путь дополняется до icons/... */
export function icon(p) {
  if ( !p ) return "";
  let full = p.startsWith("icons/") || p.startsWith("systems/") || p.startsWith("modules/") ? p : `icons/${p}`;
  if ( !/\.(webp|svg|png|jpg)$/.test(full) ) full += ".webp";
  if ( !full.startsWith("modules/") && !ICONS.has(full) ) missingIcons.add(full);
  return full;
}
export const getMissingIcons = () => [...missingIcons];

/* -------------------------------------------- */
/*  Ссылки на SRD                               */
/* -------------------------------------------- */

const missingRefs = new Set();

export function srdSpellUuid(enName) {
  const s = SRD.spells[enName];
  if ( !s ) return null;
  return `Compendium.dnd5e.spells24.Item.${s.id}`;
}

export function srdItemUuid(enName) {
  const s = SRD.items[enName];
  if ( !s ) return null;
  return `Compendium.dnd5e.equipment24.Item.${s.id}`;
}

export function noteMissingRef(kind, name) { missingRefs.add(`${kind}: ${name}`); }
export const getMissingRefs = () => [...missingRefs];

/** Ссылка-энричер на состояние: &Reference[frightened]{испуганный}. */
export const cond = (id, ru) => `&Reference[${id}]{${ru}}`;

/* -------------------------------------------- */
/*  Источники                                   */
/* -------------------------------------------- */

export const BOOKS = {
  "UA-EB": "UA 2024: Обновление Эберрона",
  "UA-FR": "UA 2025: Подклассы Забытых королевств",
  "UA-HS": "UA 2025: Жуткие подклассы",
  "UA-PS": "UA 2025: Псионик",
  "UA-PU": "UA 2025: Обновление псионика",
  "UA-AS": "UA 2025: Арканные подклассы",
  "UA-AU": "UA 2025: Арканное обновление",
  "UA-MS": "UA 2025: Мистические подклассы",
  "UA-VO": "UA 2026: Злодейские опции",
  "UA-VO2": "UA 2026: Злодейские опции 2"
};

export function source(book, page = "") {
  return { book, page: String(page), custom: "", rules: "2024", revision: 1, license: "" };
}

/* -------------------------------------------- */
/*  Ресурсы и расход                            */
/* -------------------------------------------- */

export const LR = { period: "lr", type: "recoverAll" };
export const SR = { period: "sr", type: "recoverAll" };
export const DAWN = (formula) => ({ period: "dawn", type: formula ? "formula" : "recoverAll", formula: formula ?? "" });
export const SR_ONE = { period: "sr", type: "formula", formula: "1" };

export function uses(max, ...recovery) {
  return { max: String(max), spent: 0, recovery };
}

/** Расход использований самого предмета. */
export const useSelf = (n = 1) => ({ type: "itemUses", value: String(n), target: "", scaling: {} });
/** Расход использований другого предмета по идентификатору (feat:psionic-power). */
export const useItem = (target, n = 1) => ({ type: "itemUses", value: String(n), target, scaling: {} });
/** Расход собственных использований действия (activity uses). */
export const useActivity = (n = 1) => ({ type: "activityUses", value: String(n), target: "", scaling: {} });
/** Расход ячейки заклинания определённого уровня (минимального). */
export const useSlot = (level, n = 1) => ({ type: "spellSlots", value: String(n), target: String(level), scaling: {} });
/** Расход костей хитов. */
export const useHitDice = (n = 1) => ({ type: "hitDice", value: String(n), target: "smallest", scaling: {} });
/** Расход очков чародейства (ресурс умения «Источник магии»). */
export const useSorcery = (n) => useItem("feat:font-of-magic", n);

/* -------------------------------------------- */
/*  Части урона                                 */
/* -------------------------------------------- */

/**
 * Часть урона. dmg("3d6", "psychic"), dmg("1d6 + @abilities.int.mod", "force"),
 * последним аргументом можно передать { scale: 1 } (+кость за уровень ячейки) или { cantrip: true }.
 */
export function dmg(formula, ...rest) {
  const opts = (rest.length && typeof rest.at(-1) === "object" && !Array.isArray(rest.at(-1))) ? rest.pop() : {};
  const types = rest.flat();
  const m = String(formula).replace(/\s+/g, "").match(/^(\d+)d(\d+)(?:\+(.+))?$/);
  const scaling = opts.cantrip ? { mode: "whole", number: null, formula: "" }
    : opts.scale ? { mode: "whole", number: opts.scale, formula: "" }
      : { mode: "", number: null, formula: "" };
  if ( m ) {
    return {
      custom: { enabled: false, formula: "" },
      number: Number(m[1]), denomination: Number(m[2]), bonus: m[3] ?? "",
      types, scaling
    };
  }
  return {
    custom: { enabled: true, formula: String(formula) },
    number: null, denomination: null, bonus: "",
    types, scaling
  };
}

/* -------------------------------------------- */
/*  Действия (activities)                       */
/* -------------------------------------------- */

/**
 * Базовые поля действия.
 * o.activation: action | bonus | reaction | special | minute | hour | "" (нет)
 */
function activityBase(type, key, o = {}) {
  const activation = o.activation ?? "";
  const timed = activation && !["special", ""].includes(activation);
  const template = o.template ?? {};
  const rangeUnits = o.rangeUnits ?? (o.range ? "ft" : (o.self ? "self" : (o.touch ? "touch" : "")));
  return {
    _id: makeId(`activity:${key}`),
    type,
    name: o.name ?? "",
    img: o.img ? icon(o.img) : "",
    sort: o.sort ?? 0,
    activation: {
      type: activation, value: o.activationValue ?? (timed ? 1 : null),
      condition: o.condition ?? "", override: o.activation != null || o.condition != null
    },
    consumption: {
      targets: o.consume ?? [],
      scaling: { allowed: !!o.scaling, max: o.scalingMax ?? "" },
      spellSlot: o.spellSlot ?? true
    },
    description: { chatFlavor: o.flavor ?? "", value: "" },
    duration: {
      value: o.durationValue != null ? String(o.durationValue) : "",
      units: o.duration ?? "inst", special: o.durationSpecial ?? "",
      override: o.duration != null || o.durationValue != null || o.concentration != null, concentration: !!o.concentration
    },
    effects: (o.effects ?? []).map(e => (typeof e === "string" ? { _id: e } : e)),
    range: { value: o.range != null ? String(o.range) : "", units: rangeUnits, special: o.rangeSpecial ?? "", override: o.range != null || o.rangeUnits != null || !!o.self || !!o.touch },
    target: {
      template: {
        count: "", contiguous: false, type: template.type ?? "", size: template.size != null ? String(template.size) : "",
        width: template.width != null ? String(template.width) : "", height: template.height != null ? String(template.height) : "", units: "ft"
      },
      affects: {
        count: o.count != null ? String(o.count) : (o.self ? "1" : ""), type: o.affects ?? (o.self ? "self" : ""),
        choice: !!o.choice, special: o.affectsSpecial ?? ""
      },
      prompt: true, override: o.template != null || o.affects != null || o.count != null || !!o.self
    },
    uses: { spent: 0, recovery: o.usesRecovery ?? [], max: o.usesMax != null ? String(o.usesMax) : "" },
    visibility: {
      identifier: "", level: { min: o.minLevel ?? null, max: o.maxLevel ?? null },
      requireAttunement: !!o.requireAttunement, requireIdentification: false, requireMagic: !!(o.requireMagic ?? o.requireAttunement)
    }
  };
}

export function utility(key, o = {}) {
  return {
    ...activityBase("utility", key, o),
    roll: { formula: o.roll ?? "", name: o.rollName ?? "", prompt: false, visible: !!o.roll }
  };
}

export function save(key, o = {}) {
  const abil = [o.ability].flat().filter(Boolean);
  const dc = o.dc ?? "spellcasting";
  const isAbility = ["str", "dex", "con", "int", "wis", "cha", "spellcasting"].includes(dc);
  return {
    ...activityBase("save", key, o),
    damage: { onSave: o.onSave ?? (o.damage?.length ? "half" : "none"), parts: o.damage ?? [] },
    save: {
      ability: abil,
      dc: { calculation: isAbility ? dc : "", formula: isAbility ? "" : String(dc) },
      bonus: ""
    }
  };
}

export function attack(key, o = {}) {
  return {
    ...activityBase("attack", key, o),
    attack: {
      ability: o.ability ?? "", bonus: o.bonus ?? "", critical: { threshold: o.critThreshold ?? null }, flat: !!o.flat,
      type: { value: o.attackType ?? "melee", classification: o.classification ?? "weapon" }
    },
    damage: { critical: { bonus: "" }, includeBase: o.includeBase ?? true, parts: o.damage ?? [] }
  };
}

export function damage(key, o = {}) {
  return {
    ...activityBase("damage", key, o),
    damage: { critical: { allow: !!o.critical, bonus: "" }, parts: o.damage ?? [] }
  };
}

export function heal(key, o = {}) {
  return {
    ...activityBase("heal", key, o),
    healing: dmg(o.formula, o.temp ? "temphp" : "healing")
  };
}

export function teleport(key, o = {}) {
  return {
    ...activityBase("teleport", key, { self: true, ...o }),
    teleport: { override: false, units: "ft", value: String(o.distance ?? "") }
  };
}

export function cast(key, spellUuid, o = {}) {
  const base = activityBase("cast", key, o);
  delete base.effects;
  return {
    ...base,
    spell: {
      ability: o.ability ?? "",
      challenge: { attack: "", save: "", override: false },
      level: o.level ?? null,
      // dnd5e хранит здесь исключённые компоненты; вызывающие функции задают оставшиеся.
      properties: ["vocal", "somatic", "material"].filter(p => !(o.properties ?? ["vocal", "somatic", "material"]).includes(p)),
      spellbook: o.spellbook ?? true,
      uuid: spellUuid
    }
  };
}

export function summon(key, profiles, o = {}) {
  const base = activityBase("summon", key, o);
  return {
    ...base,
    bonuses: {
      ac: o.ac ?? "", hd: o.hd ?? "", hp: o.hp ?? "",
      attackDamage: o.attackDamage ?? "", saveDamage: o.saveDamage ?? "", healing: o.healing ?? ""
    },
    creatureSizes: o.sizes ?? [],
    creatureTypes: o.types ?? [],
    match: { ability: o.ability ?? "", attacks: o.matchAttacks ?? true, disposition: true, proficiency: o.matchProficiency ?? true, saves: o.matchSaves ?? true },
    profiles: profiles.map((p, i) => ({
      _id: makeId(`summon-profile:${key}:${i}`), count: p.count ?? "1", name: p.name ?? "",
      uuid: p.uuid, cr: "", types: [], level: { min: p.min ?? null, max: p.max ?? null }
    })),
    summon: { prompt: true, mode: "" },
    visibility: { ...base.visibility, identifier: o.identifier ?? "" }
  };
}

/** Собирает объект activities из массива. */
export function activities(list = []) {
  const out = {};
  list.forEach((a, i) => { a.sort = a.sort || (i + 1) * 100000; out[a._id] = a; });
  return out;
}

/* -------------------------------------------- */
/*  Активные эффекты                            */
/* -------------------------------------------- */

/**
 * change(key, value, type="add")
 * type: add | override | upgrade | downgrade | multiply | custom
 */
export function change(key, value, type = "add") {
  return { key, value: String(value), type, priority: null, phase: "initial" };
}

/**
 * Активный эффект. transfer=true — постоянный эффект на владельце (пассивное умение),
 * transfer=false — эффект, накладываемый действием.
 */
export function effect(key, o = {}) {
  const _id = makeId(`effect:${key}`);
  return {
    _id,
    name: o.name,
    img: icon(o.img ?? "icons/svg/upgrade.svg"),
    type: "base",
    system: { changes: (o.changes ?? []).map((c, i) => ({ ...c, _id: makeId(`change:${key}:${i}`) })) },
    disabled: !!o.disabled,
    transfer: o.transfer ?? true,
    duration: {
      value: o.seconds ?? null, units: "seconds", expiry: o.expiry ?? null, expired: false
    },
    description: o.description ?? "",
    origin: null,
    statuses: o.statuses ?? [],
    tint: "#ffffff",
    flags: o.flags ?? {},
    sort: 0, start: null, showIcon: 1, folder: null,
    _stats: stats()
  };
}

/* -------------------------------------------- */
/*  Продвижения (advancement)                   */
/* -------------------------------------------- */

export function advItemGrant(key, level, uuids, o = {}) {
  return {
    _id: makeId(`adv:${key}`),
    type: "ItemGrant",
    configuration: {
      items: uuids.map(uuid => ({ uuid, optional: !!o.optional })),
      optional: !!o.optional,
      spell: o.spell ?? null
    },
    value: {},
    level,
    title: o.title ?? "",
    hint: o.hint ?? ""
  };
}

/** Конфигурация выдаваемых заклинаний: всегда подготовлены, опционально бесплатное накладывание. */
export function spellConfig({ abilities = [], always = true, uses = null, per = "", method = "spell" } = {}) {
  return {
    ability: abilities,
    method,
    prepared: always ? 2 : 0,
    uses: { max: uses ? String(uses) : "", per: uses ? per : "", requireSlot: false }
  };
}

export function advItemChoice(key, level, o = {}) {
  return {
    _id: makeId(`adv:${key}`),
    type: "ItemChoice",
    configuration: {
      allowDrops: o.allowDrops ?? true,
      choices: o.choices ?? { [String(level ?? 0)]: { count: o.count ?? 1, replacement: !!o.replacement } },
      pool: (o.pool ?? []).map(uuid => ({ uuid })),
      restriction: { type: o.restrictType ?? "", subtype: o.restrictSubtype ?? "", list: o.list ?? [], level: o.spellLevel ?? "", school: o.school ?? [] },
      spell: o.spell ?? null,
      type: o.type ?? "feat"
    },
    value: { added: {}, replaced: {} },
    level: level ?? undefined,
    title: o.title ?? "",
    hint: o.hint ?? ""
  };
}

export function advScale(key, identifier, title, scaleType, scale, o = {}) {
  const s = {};
  for ( const [lvl, v] of Object.entries(scale) ) {
    if ( scaleType === "dice" ) {
      const m = String(v).match(/^(\d*)d(\d+)$/);
      s[lvl] = { number: m[1] ? Number(m[1]) : null, faces: Number(m[2]), modifiers: [] };
    } else if ( scaleType === "distance" ) s[lvl] = { value: v };
    else s[lvl] = { value: v };
  }
  return {
    _id: makeId(`adv:${key}`),
    type: "ScaleValue",
    configuration: { identifier, type: scaleType, distance: { units: scaleType === "distance" ? "ft" : "" }, scale: s },
    value: {},
    title,
    hint: o.hint ?? ""
  };
}

export function advTrait(key, level, o = {}) {
  const adv = {
    _id: makeId(`adv:${key}`),
    type: "Trait",
    configuration: {
      mode: o.mode ?? "default",
      allowReplacements: !!o.allowReplacements,
      grants: o.grants ?? [],
      choices: (o.choices ?? []).map(c => ({ count: c.count, pool: c.pool }))
    },
    value: { chosen: [] },
    level,
    title: o.title ?? "",
    hint: o.hint ?? ""
  };
  if ( o.classRestriction ) adv.classRestriction = o.classRestriction;
  return adv;
}

export function advASI(key, level, o = {}) {
  return {
    _id: makeId(`adv:${key}`),
    type: "AbilityScoreImprovement",
    configuration: {
      points: o.points ?? 2,
      fixed: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0, ...(o.fixed ?? {}) },
      cap: o.cap ?? 2,
      locked: o.locked ?? [],
      recommendation: o.recommendation ?? null,
      max: o.max ?? null
    },
    value: {},
    level: level ?? undefined,
    title: o.title ?? "",
    hint: o.hint ?? ""
  };
}

export function advHP(key) {
  return { _id: makeId(`adv:${key}`), type: "HitPoints", configuration: {}, value: {}, title: "" };
}

export function advSubclass(key, level) {
  return { _id: makeId(`adv:${key}`), type: "Subclass", configuration: {}, value: { document: null, uuid: null }, level, title: "", hint: "" };
}
