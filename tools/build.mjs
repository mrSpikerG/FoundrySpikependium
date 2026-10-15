// Сборка модуля Spikependium: генерирует документы, компилирует компендиумы LevelDB,
// файлы перевода Babele и служебный скрипт со ссылками на списки заклинаний.
//
// Запуск: npm run build
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { MODULE_ID, BOOKS, getMissingIcons, getMissingRefs, ARTIFICER_CATALOG } from "./lib/core.mjs";
import { PACKS, REGISTRY, FOLDERS, EN_NAMES, uuidOf } from "./lib/docs.mjs";
import { enrichDocument } from "./lib/mechanics.mjs";
import { DRAGONMARK_TABLES } from "../src/content/feats.mjs";
import { BLUEPRINTS } from "../src/content/artificer.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = ["spells", "spells-psion-update", "arcana-unleashed-spells", "arcana-unleashed-spells-2", "arcana-unleashed-spells-3", "arcana-unleashed-summons", "creatures", "creatures-2", "monsters-mm25", "monsters-performers-mm25", "monsters-arcanaloth-mm25", "monsters-archhag-mm25", "monsters-assassins-bugbears-mm25", "monsters-bandits-mm25", "artificer", "psion", "subclasses-artificer",
  "subclasses-psion", "subclasses-fr", "subclasses-horror", "subclasses-arcane", "subclasses-villain", "subclasses-mystic",
  "feats", "feats-villain", "arcana-unleashed-feats", "items", "griffons-saddlebag", "griffons-saddlebag-rings", "griffons-saddlebag-two-rings", "griffons-saddlebag-wearables", "griffons-saddlebag-armor", "griffons-saddlebag-sweets", "griffons-saddlebag-weapons", "griffons-saddlebag-two-shields", "griffons-saddlebag-two-armor", "griffons-saddlebag-two-weapons", "griffonid", "subclasses-griffon", "alchemist", "alchemist-formulas", "alchemist-discoveries", "subclasses-alchemist", "alchemist-special-formulas", "alchemist-grafts", "alchemist-creatures", "magus-spells", "magus", "subclasses-magus", "journals"];

assert.equal(new Set(CONTENT).size, CONTENT.length, "Повторный раздел библиотеки");
for (const file of fs.readdirSync(path.join(ROOT, "src/content")).filter(name => name.endsWith(".mjs"))) {
  if (/^export\s+(?:async\s+)?function\s+define\b/m.test(fs.readFileSync(path.join(ROOT, "src/content", file), "utf8")))
    assert.ok(CONTENT.includes(file.slice(0, -4)), `Готовый раздел ${file} не подключён к библиотеке`);
}

/* -------------------------------------------- */
/*  1. Определение содержимого                  */
/* -------------------------------------------- */

const context = {};
for ( const name of CONTENT ) {
  const file = path.join(ROOT, "src/content", `${name}.mjs`);
  assert.ok(fs.existsSync(file), `Отсутствует обязательный раздел src/content/${name}.mjs`);
  const mod = await import(`../src/content/${name}.mjs`);
  await mod.define(context);
}

/* -------------------------------------------- */
/*  2. Разрешение ссылок и запись исходников    */
/* -------------------------------------------- */

const resolveRefs = obj => JSON.parse(JSON.stringify(obj).replace(/@@REF:([^@]+)@@/g, (_, key) => uuidOf(key)));

const SRC = path.join(ROOT, "packs/_source");
const OUT = path.join(ROOT, "packs");
// Очищаем содержимое, а не саму папку: на Windows открытая в терминале папка не удаляется.
fs.mkdirSync(SRC, { recursive: true });
for ( const entry of fs.readdirSync(SRC) ) fs.rmSync(path.join(SRC, entry), { recursive: true, force: true });

const counts = {};
for ( const pack of Object.keys(PACKS) ) fs.mkdirSync(path.join(SRC, pack), { recursive: true });

const slug = s => s.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40);

for ( const [key, { pack, doc }] of REGISTRY ) {
  const data = enrichDocument(resolveRefs(doc));
  // Базовое имя — оригинальное английское (Babele переводит его на русский), если оно известно.
  const en = data.flags?.[MODULE_ID]?.originalName;
  if ( en ) data.name = en;
  fs.writeFileSync(path.join(SRC, pack, `${slug(key)}_${data._id}.json`), JSON.stringify(data, null, 2));
  counts[pack] = (counts[pack] ?? 0) + 1;
}
for ( const [pack, folders] of FOLDERS ) {
  for ( const f of folders ) fs.writeFileSync(path.join(SRC, pack, `folder_${f._id}.json`), JSON.stringify(f, null, 2));
}

/* -------------------------------------------- */
/*  3. Компиляция LevelDB                       */
/* -------------------------------------------- */

for ( const pack of Object.keys(PACKS) ) {
  const dest = path.join(OUT, pack);
  fs.rmSync(dest, { recursive: true, force: true });
  await compilePack(path.join(SRC, pack), dest, { log: false });
}

/* -------------------------------------------- */
/*  4. Babele                                   */
/* -------------------------------------------- */

const BABELE = path.join(ROOT, "babele/ru");
fs.rmSync(path.join(ROOT, "babele"), { recursive: true, force: true });
fs.mkdirSync(BABELE, { recursive: true });
for ( const [pack, cfg] of Object.entries(PACKS) ) {
  const entries = {};
  for ( const [id, { ru }] of Object.entries(EN_NAMES.get(pack) ?? {}) ) entries[id] = { name: ru };
  const folders = {};
  for ( const f of FOLDERS.get(pack) ?? [] ) folders[f.name] = f.name;
  const file = { label: cfg.label, folders, entries };
  fs.writeFileSync(path.join(BABELE, `${MODULE_ID}.${pack}.json`), JSON.stringify(file, null, 2));
}

/* -------------------------------------------- */
/*  5. Сгенерированные константы для скрипта    */
/* -------------------------------------------- */

const spellLists = [];
const wildTalents = [];
for ( const [key, { doc }] of REGISTRY ) {
  if (doc.system?.type?.subtype === "wildTalent") wildTalents.push(`feat:${doc.system.identifier}`);
  if ( !doc.pages ) continue;
  doc.pages.forEach(p => { if ( p.type === "spells" ) spellLists.push(`${uuidOf(key)}.JournalEntryPage.${p._id}`); });
}
fs.writeFileSync(path.join(ROOT, "scripts/generated.mjs"),
  `// Файл создаётся сборщиком (tools/build.mjs). Не редактируйте вручную.\n`
  + `export const SPELL_LISTS = ${JSON.stringify(spellLists, null, 2)};\n\n`
  + `export const WILD_TALENTS = ${JSON.stringify(wildTalents, null, 2)};\n\n`
  + `export const DRAGONMARK_TABLES = ${JSON.stringify(DRAGONMARK_TABLES, null, 2)};\n\n`
  + `export const BLUEPRINTS = ${JSON.stringify(BLUEPRINTS.map(p => ({ ...p, blueprintUuid: uuidOf(p.key), uuid: p.moduleKey ? uuidOf(p.moduleKey) : p.uuid })), null, 2)};\n\n`
  + `export const TINKER_ITEMS = ${JSON.stringify(ARTIFICER_CATALOG.mundane, null, 2)};\n\n`
  + `export const FORGE_BASES = ${JSON.stringify(ARTIFICER_CATALOG.bases, null, 2)};\n\n`
  + `export const SOURCE_BOOKS = ${JSON.stringify(BOOKS, null, 2)};\n`);

/* -------------------------------------------- */
/*  6. module.json                              */
/* -------------------------------------------- */

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "module.json"), "utf8"));
manifest.packs = Object.entries(PACKS).map(([name, cfg]) => ({
  name, label: cfg.label, path: `packs/${name}`, type: cfg.type, system: "dnd5e",
  ownership: { PLAYER: "OBSERVER", ASSISTANT: "OWNER" }, flags: {}
}));
manifest.packFolders = [{ name: "Spikependium", sorting: "m", color: "#3d1f5c", packs: Object.keys(PACKS), folders: [] }];
fs.writeFileSync(path.join(ROOT, "module.json"), JSON.stringify(manifest, null, 2) + "\n");

/* -------------------------------------------- */
/*  7. Отчёт                                    */
/* -------------------------------------------- */

console.log("Документы по компендиумам:", counts);
const icons = getMissingIcons();
if ( icons.length ) console.warn(`! Иконки не найдены в списке Foundry/dnd5e (${icons.length}):\n  ${icons.join("\n  ")}`);
const refs = getMissingRefs();
if ( refs.length ) console.log(`Ссылки без цели в SRD (${refs.length}) — показаны курсивом:\n  ${refs.sort().join("\n  ")}`);
await import("./content-status.mjs");
console.log("Готово.");
