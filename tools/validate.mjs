// Проверка собранных исходников компендиумов (packs/_source) без запуска Foundry.
// Запуск: npm run validate
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BOOKS } from "./lib/core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "packs/_source");
const SRD = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/data/srd.json"), "utf8"));
const webSources = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, "tools/data/external-content-inventory.json"), "utf8")).sources
  .map(s => [s.id, new Set([...(s.entries ? s.entries.map(e => e.url) : [s.url]), ...(s.characterOptions ? [s.characterOptions.url] : [])])]));
const ICONS = new Set(fs.readFileSync(path.join(ROOT, "tools/data/icons.txt"), "utf8").split(/\r?\n/).filter(Boolean));
const nativeCandleWeight = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/data/griffon-stationery.json"), "utf8")).nativeCandle.document.system.weight.value;
const nativeWeights = new Map([["item:gs1:anti-light", nativeCandleWeight], ["item:gs1:secret-scribe", 2 * nativeCandleWeight]]);
const coverageUrls = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, "tools/data/arcana-unleashed-coverage.json"), "utf8")).chapterSnapshots.map(s => s.url));

const ID = /^[A-Za-z0-9]{16}$/;
const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);
const bookPages = { "MM25": 385, "AU": 160, "UA-EB": 16, "UA-FR": 10, "UA-HS": 9, "UA-PS": 13, "UA-PU": 15, "UA-AS": 10, "UA-AU": 9, "UA-MS": 6, "UA-VO": 11, "UA-VO2": 5 };
function checkSource(where, source) {
  if (!source || !BOOKS[source.book]) return err(where, "нет известного источника");
  if (source.book === "AU" && source.page === "" && coverageUrls.has(source.custom)) {
    if (source.rules !== "2024") err(where, "неверная редакция Неудержимой магии");
    return;
  }
  if (source.book === "PHB24" && source.custom === "https://next.dnd.su/spells/10523-friends/" && source.page === "") {
    if (source.rules !== "2024") err(where, "неверная редакция Книги игрока");
    return;
  }
  if (["GS1", "GS2", "VSS", "EfC", "TT", "CAB", "MM14"].includes(source.book)) {
    if (!webSources.get(["EfC", "TT", "CAB"].includes(source.book) ? "VSS" : source.book)?.has(source.custom)) err(where, "нет точной ссылки на карточку в реестре веб-источника");
    if (source.page !== "") err(where, "номер страницы веб-источника не подтверждён");
    if (source.rules !== (source.book === "GS1" ? "2024" : "2014")) err(where, "неверная редакция веб-источника");
    return;
  }
  const page = Number(source.page);
  if (!Number.isInteger(page) || page < 1 || page > (source.book === "MAGUS-PT3" ? 17 : bookPages[source.book])) err(where, `страница вне документа: ${source.page}`);
  if (source.book === "AU" && page > 45 && page < 151) err(where, "эта страница отсутствует в предоставленном PDF Неудержимой магии");
  if (source.rules !== "2024") err(where, "неверная редакция правил");
}

// SRD-идентификаторы, на которые разрешено ссылаться.
const srdIds = new Set([
  JSON.parse(fs.readFileSync(path.join(ROOT, "tools/data/griffon-two-boots.json"), "utf8")).spell.uuid,
  ...JSON.parse(fs.readFileSync(path.join(ROOT, "tools/data/griffon-two-cloaks.json"), "utf8")).spells.map(s => s.uuid),
  ...JSON.parse(fs.readFileSync(path.join(ROOT, "tools/data/griffon-two-gloves.json"), "utf8")).spells.map(s => s.uuid),
  ...JSON.parse(fs.readFileSync(path.join(ROOT, "tools/data/griffon-two-weapon-bases.json"), "utf8")).spells.map(s => s.uuid),
  ...Object.values(SRD.spells).map(s => `Compendium.dnd5e.spells24.Item.${s.id}`),
  ...Object.values(SRD.items).map(s => `Compendium.dnd5e.equipment24.Item.${s.id}`),
  ...JSON.parse(fs.readFileSync(path.join(ROOT, "tools/data/alchemist-starting-gear.json"), "utf8")).gear.map(g => g.uuid),
  ...["phbarmStuddedLea", "phbwepDagger0000", "phbtulThievesToo", "phbagDungeoneers", "phbwepSpear00000",
    "phbwepLightCross", "phbamoBolts00000", "phbagCaseCrossbo"].map(id => `Compendium.dnd5e.equipment24.Item.${id}`)
]);

// Загрузка документов.
const docs = new Map();      // uuid → doc
const byPack = {};
for ( const pack of fs.readdirSync(SRC) ) {
  byPack[pack] = [];
  for ( const file of fs.readdirSync(path.join(SRC, pack)) ) {
    const data = JSON.parse(fs.readFileSync(path.join(SRC, pack, file), "utf8"));
    byPack[pack].push({ file, data });
  }
}
const TYPE = { species: "Item", classes: "Item", subclasses: "Item", feats: "Item", spells: "Item", items: "Item", creatures: "Actor", rules: "JournalEntry", tables: "RollTable" };
for ( const [pack, list] of Object.entries(byPack) ) {
  const ids = new Set();
  for ( const { file, data } of list ) {
    if ( !ID.test(data._id) ) err(file, `некорректный _id «${data._id}»`);
    if ( ids.has(data._id) ) err(file, `повтор _id ${data._id}`);
    ids.add(data._id);
    if ( !data._key ) err(file, "нет _key");
    if ( !data._key?.startsWith("!folders!") ) docs.set(`Compendium.spikependium.${pack}.${TYPE[pack]}.${data._id}`, data);
  }
}

// Проверки отдельного документа.
function checkItem(where, item) {
  const effectIds = new Set((item.effects ?? []).map(e => e._id));
  for ( const e of item.effects ?? [] ) {
    if ( !ID.test(e._id) ) err(where, `эффект с некорректным _id ${e._id}`);
    for ( const c of e.system?.changes ?? [] ) if ( !ID.test(c._id) ) err(where, `изменение эффекта с некорректным _id`);
    if ( e.img && !e.img.startsWith("modules/") && !ICONS.has(e.img) ) warn(where, `иконка эффекта не найдена: ${e.img}`);
  }
  const acts = item.system?.activities ?? {};
  for (const m of (item.system?.description?.value ?? "").matchAll(/\[\[\/(?:item|damage|heal|save) activity=([^\]]+)\]\]/g))
    if (!acts[m[1]]) err(where, `кликабельная ссылка на отсутствующее действие ${m[1]}`);
  for ( const [k, a] of Object.entries(acts) ) {
    if ( k !== a._id ) err(where, `ключ действия ${k} не совпадает с _id ${a._id}`);
    if ( !ID.test(a._id) ) err(where, `действие с некорректным _id ${a._id}`);
    for ( const e of a.effects ?? [] ) if ( !effectIds.has(e._id) ) err(where, `действие «${a.name}» ссылается на отсутствующий эффект ${e._id}`);
    for ( const r of a.effects?.flatMap(e => e.riders?.activity ?? []) ?? [] ) if ( !acts[r] ) err(where, `наездник ${r} отсутствует среди действий`);
    for ( const r of a.effects?.flatMap(e => e.riders?.effect ?? []) ?? [] ) if ( !effectIds.has(r) ) err(where, `отсутствует эффект зачарования ${r}`);
    if ( a.type === "summon" ) for ( const p of a.profiles ) if ( !docs.has(p.uuid) ) err(where, `профиль призыва ссылается на неизвестный ${p.uuid}`);
    if ( a.type === "cast" && !srdIds.has(a.spell.uuid) && !docs.has(a.spell.uuid) ) err(where, `cast ссылается на неизвестное заклинание ${a.spell.uuid}`);
    if ( a.type === "transform" ) for ( const p of a.profiles ) if ( p.uuid && !docs.has(p.uuid) ) err(where, `превращение ссылается на неизвестного ${p.uuid}`);
    if (a.type === "forward" && !acts[a.activity?.id]) err(where, "переадресация ссылается на отсутствующее действие");
    for ( const t of a.consumption?.targets ?? [] ) if ( !["itemUses", "activityUses", "spellSlots", "hitDice", "attribute", "material", "spikependiumMaterial", "spikependiumMagusHitDice", "spikependiumAnimatedStrike"].includes(t.type) ) err(where, `неизвестный тип расхода ${t.type}`);
    for (const t of a.consumption?.targets ?? []) if (t.type === "spikependiumMaterial"
      && (item.type !== "spell" || !item.system.materials?.consumed || !item.system.properties.includes("material") || t.value !== "1"))
      err(where, "расход компонента требует заклинания с расходуемым материалом и стоимостью 1 комплект");
    for (const t of a.consumption?.targets ?? []) if (t.type === "spellSlots" && !/^[1-9]$/.test(t.target)) err(where, `неверная ячейка: ${t.target}`);
    for (const t of a.consumption?.targets ?? []) {
      if (t.type === "itemUses" && !t.target && !item.system.uses?.max) err(where, "расход предмета без счётчика применений");
      if (t.type === "activityUses" && !a.uses?.max) err(where, "расход действия без счётчика применений");
      if (t.type === "spellSlots" && Number(t.value) > 0 && (!a.consumption.scaling.allowed || t.scaling.mode !== "level"))
        err(where, "уровень расходуемой ячейки не связан с выбранным усилением");
    }
    if (a.type === "summon") {
      if (a.summon.mode !== "" || !a.profiles.length) err(where, "неверный режим фиксированного призыва");
      for (const p of a.profiles) {
        if (docs.get(p.uuid)?.type !== "npc") err(where, "призываемый документ не NPC");
        if (p.count !== "1") err(where, "UA-призыв должен создавать одно существо");
        if (p.level.min != null && p.level.max != null && p.level.min > p.level.max) err(where, "перевёрнутые уровни профиля");
      }
    }
  }
  const advIds = new Set();
  if (item.type === "feat" && item.system.type?.value === "feat"
    && /<strong>Увеличение характеристики\.<\/strong>/.test(item.system.description.value)
    && !item.system.advancement.some(a => a.type === "AbilityScoreImprovement"))
    err(where, "повышение характеристики описано, но нет встроенного шага AbilityScoreImprovement");
  for ( const adv of item.system?.advancement ?? [] ) {
    if ( !ID.test(adv._id) ) err(where, `продвижение с некорректным _id ${adv._id}`);
    if ( advIds.has(adv._id) ) err(where, `повтор _id продвижения ${adv._id}`);
    advIds.add(adv._id);
    if (adv.type === "AbilityScoreImprovement") {
      const c = adv.configuration;
      const abilities = ["str", "dex", "con", "int", "wis", "cha"];
      if (!Number.isInteger(c.points) || c.points < 0 || !Number.isInteger(c.cap) || c.cap < 1)
        err(where, "некорректные очки повышения характеристики");
      if ((c.locked ?? []).some(a => !abilities.includes(a))) err(where, "неизвестная заблокированная характеристика");
      if (!c.points && !Object.values(c.fixed ?? {}).some(v => v > 0)) err(where, "пустое повышение характеристики");
    }
    const uuids = [...(adv.configuration?.items ?? []), ...(adv.configuration?.pool ?? [])].map(i => i.uuid);
    if ( adv.type === "ItemChoice" && !adv.configuration.pool.length && !adv.configuration.restriction.list.length && adv.configuration.type !== "spell" ) warn(where, `выбор «${adv.title}» без вариантов`);
    const dragonTable = ["potent-dragonmark", "boon-of-siberys"].includes(item.system.identifier)
      && adv.title === "Подготовка драконьих заклинаний" && adv.configuration.optional;
    const abilities = adv.configuration?.spell?.ability ?? [];
    const abilityChoice = new Set(abilities).size > 1 && abilities.every(a => ["str", "dex", "con", "int", "wis", "cha"].includes(a));
    if ( adv.type === "ItemGrant" && !adv.configuration.items.length && !dragonTable && !abilityChoice ) err(where, `пустая выдача «${adv.title}»`);
    for ( const u of uuids ) if ( !docs.has(u) && !srdIds.has(u) ) err(where, `продвижение «${adv.title}» ссылается на неизвестный ${u}`);
  }
  if ( item.img && !item.img.startsWith("modules/") && !ICONS.has(item.img) ) warn(where, `иконка не найдена: ${item.img}`);
}

function checkHtml(where, html) {
  if ( typeof html !== "string" || !html ) return;
  for ( const tag of ["p", "strong", "em", "table", "tr", "td", "th", "ul", "li", "h3", "aside"] ) {
    const open = (html.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
    const close = (html.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
    if ( open !== close ) err(where, `несбалансированный тег <${tag}>: ${open} открыт, ${close} закрыт`);
  }
  for ( const m of html.matchAll(/@UUID\[([^\]]+)\]/g) ) {
    const u = m[1];
    if ( u.startsWith("Compendium.spikependium.") && !docs.has(u.split(".").slice(0, 5).join(".")) ) err(where, `ссылка на неизвестный документ модуля ${u}`);
    if ( u.startsWith("Compendium.dnd5e.") && !srdIds.has(u) ) err(where, `ссылка на неизвестный документ SRD ${u}`);
  }
  const prose = html.replace(/\[\[\/(?:r|item|damage|heal|save)\s+[^\]]+\]\](?:\{[^}]*\})?/g, "");
  if ( /\*\*|\[\[|\]\]|<<|>>/.test(prose) ) warn(where, "в HTML осталась необработанная разметка");
}

for ( const [pack, list] of Object.entries(byPack) ) {
  const folderIds = new Set(list.filter(d => d.data._key.startsWith("!folders!")).map(d => d.data._id));
  for ( const { file, data } of list ) {
    const where = `${pack}/${file}`;
    const raw = JSON.stringify(data);
    if ( /"undefined"|NaN|\[object Object\]|@@REF/.test(raw) ) err(where, "в данных найдено undefined/NaN/[object Object]/@@REF");
    if ( data.folder && !folderIds.has(data.folder) ) err(where, `папка ${data.folder} не найдена`);
    if ( data._key.startsWith("!folders!") ) continue;
    if (!data.folder) err(where, "документ должен находиться в папке компендиума");
    if (data.system?.source) checkSource(where, data.system.source);
    if (pack === "items") {
      if (!Number.isFinite(data.system.price.value) || data.system.price.value <= 0 || data.system.price.denomination !== "gp") err(where, "нет корректной цены в зм");
      if (!Number.isFinite(data.system.weight.value) || data.system.weight.value < 0 || data.system.weight.units !== "lb") err(where, "неверный вес");
      if (data.type !== "weapon" && data.system.weight.value === 0 && nativeWeights.get(data.flags.spikependium?.key) !== 0) err(where, "не заполнен вес физического предмета");
    }
    if ( TYPE[pack] === "Item" ) { checkItem(where, data); checkHtml(where, data.system?.description?.value); }
    if ( TYPE[pack] === "Actor" ) {
      for (const e of data.effects ?? []) {
        if (!ID.test(e._id) || e._key !== `!actors.effects!${data._id}.${e._id}`) err(where, "неверный ключ эффекта существа");
      }
      for ( const it of data.items ?? [] ) {
        checkSource(`${where} → ${it.name}`, it.system.source); checkItem(`${where} → ${it.name}`, it); checkHtml(`${where} → ${it.name}`, it.system.description.value);
        for (const activity of Object.values(it.system.activities ?? {})) {
          const rule = activity.flags?.spikependium?.multiattack;
          if (!rule) continue;
          const scaled = rule.count === "spell" && /^actor:au-(plant|dinosaur|combat-familiar)-/.test(data.flags.spikependium?.key ?? "");
          if (!scaled && (!Number.isSafeInteger(rule.count) || rule.count < 1)) err(where, "неверное число атак мультиатаки");
          const weapons = rule.weapons ?? [rule.weapon];
          if (!Array.isArray(weapons) || !weapons.length || new Set(weapons).size !== weapons.length
            || weapons.some(identifier => !data.items.some(i => i.system.identifier === identifier && Object.values(i.system.activities).some(a => a.type === "attack"))))
            err(where, "мультиатака ссылается на отсутствующую атаку");
          if (rule.optionalSpell && !data.items.some(i => Object.values(i.system.activities).some(a => a.type === "cast" && a.spell.uuid === rule.optionalSpell)))
            err(where, "мультиатака ссылается на отсутствующее действие заклинания");
          for (const [identifier, limit] of Object.entries(rule.attackLimits ?? {}))
            if (!weapons.includes(identifier) || !Number.isSafeInteger(limit) || limit < 1 || limit > rule.count)
              err(where, "неверный лимит замены атаки мультиатаки");
          if (rule.finishers && (!Array.isArray(rule.finishers) || !rule.finishers.length
            || rule.finishers.some(identifier => !data.items.some(i => i.system.identifier === identifier
              && Object.values(i.system.activities).some(a => a.type === "save")))))
            err(where, "мультиатака ссылается на отсутствующее завершающее действие");
        }
      }
      checkHtml(where, data.system.details.biography.value);
    }
    if ( TYPE[pack] === "JournalEntry" ) {
      for ( const p of data.pages ) {
        checkHtml(`${where} → ${p.name}`, p.text?.content ?? p.system?.description?.value);
        for ( const u of p.system?.spells ?? [] ) if ( !docs.has(u) && !srdIds.has(u) ) err(where, `список заклинаний: неизвестный ${u}`);
      }
    }
    if (TYPE[pack] === "RollTable") {
      checkSource(where, data.flags.spikependium?.source); checkHtml(where, data.description);
      if (data._key !== `!tables!${data._id}` || data.formula !== `1d${data.results.length}` || !data.replacement || !data.displayRoll)
        err(where, "неверная формула или режим случайной таблицы");
      const ids = new Set();
      for (const [index, result] of data.results.entries()) {
        if (!ID.test(result._id) || ids.has(result._id) || result._key !== `!tables.results!${data._id}.${result._id}`)
          err(where, "неверный идентификатор результата таблицы");
        ids.add(result._id);
        if (result.type !== "text" || result.weight !== 1 || result.drawn || JSON.stringify(result.range) !== JSON.stringify([index + 1, index + 1]))
          err(where, "неверный диапазон или тип результата таблицы");
        if (!result.description) err(where, "пустое описание результата таблицы");
        checkHtml(where, result.description);
      }
    }
  }
}

// Ссылки в формулах (@scale, @classes, @abilities и т. д.).
{
  const scales = new Set(["monk.die", "monk.focus", "bard.inspiration", "barbarian.rage-damage", "sorcerer.points", "cleric.channel-divinity", "paladin.channel-divinity"]);
  for ( const list of Object.values(byPack) ) for ( const { data } of list ) {
    if ( !["class", "subclass"].includes(data.type) ) continue;
    for ( const adv of data.system.advancement ?? [] ) {
      if ( adv.type === "ScaleValue" && adv.configuration.identifier ) scales.add(`${data.system.identifier}.${adv.configuration.identifier}`);
    }
  }
  const CLASSES = new Set(["artificer", "psion", "barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard",
    ...[...docs.values()].filter(d => d.type === "class").map(d => d.system.identifier)]);
  const ABIL = new Set(["str", "dex", "con", "int", "wis", "cha"]);
  const OK = [/^@prof$/, /^@scaling$/, /^@mod$/, /^@item\.(uses\.(spent|max|value)|level)$/, /^@attributes\.(spell\.mod|movement\.(walk|max)|hp\.max|hd\.\w+)$/, /^@details\.level$/, /^@spikependium\.alchemistBombDC$/, /^@flags\.dnd5e\.summon\.mod$/];
  const checkFormula = (where, formula) => {
    if ( typeof formula !== "string" || !formula.includes("@") ) return;
    for ( const m of formula.matchAll(/@[a-zA-Z][\w.-]*/g) ) {
      const ref = m[0].replace(/\.$/, "");
      let ok = OK.some(r => r.test(ref));
      let mm;
      if ( (mm = ref.match(/^@scale\.([\w-]+)\.([\w-]+)(?:\.(faces|number|die))?$/)) ) ok = scales.has(`${mm[1]}.${mm[2]}`);
      else if ( (mm = ref.match(/^@classes\.([\w-]+)\.levels$/)) ) ok = CLASSES.has(mm[1]);
      else if ( (mm = ref.match(/^@abilities\.(\w+)\.(mod|value|max)$/)) ) ok = ABIL.has(mm[1]);
      if ( !ok ) err(where, `неизвестная ссылка в формуле: ${ref} (в «${formula}»)`);
    }
  };
  const walkFormulas = (where, obj, path = "") => {
    if ( obj === null || typeof obj !== "object" ) return;
    for ( const [k, v] of Object.entries(obj) ) {
      const p = path ? `${path}.${k}` : k;
      if ( typeof v === "string" && /(formula|max|value|bonus|count|ac|hp|attackDamage|healing|scalingMax)$/.test(k) && !/description|text|content|name|label|changes/.test(p) ) checkFormula(`${where} [${p}]`, v);
      else walkFormulas(where, v, p);
    }
  };
  for ( const [pack, list] of Object.entries(byPack) ) for ( const { file, data } of list ) {
    if ( data._key.startsWith("!folders!") ) continue;
    const items = [data, ...(data.items ?? [])];
    for ( const it of items ) {
      if ( !it.system ) continue;
      walkFormulas(`${pack}/${file} → ${it.name}`, { uses: it.system.uses, activities: it.system.activities, advancement: (it.system.advancement ?? []).map(a => a.configuration?.spell ?? {}) });
      if ( it.system.spellcasting?.preparation?.formula ) checkFormula(`${pack}/${file}`, it.system.spellcasting.preparation.formula);
    }
  }
}

// Итог.
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "module.json"), "utf8"));
const library = manifest.packFolders?.find(folder => folder.name === "Spikependium");
for (const pack of manifest.packs) if (!library?.packs?.includes(pack.name))
  err("module.json", `компендиум ${pack.name} должен входить в папку библиотеки Spikependium`);
const total = Object.values(byPack).reduce((n, l) => n + l.length, 0);
console.log(`Проверено записей: ${total}`);
if ( warnings.length ) console.log(`Предупреждения (${warnings.length}):\n  ${warnings.join("\n  ")}`);
if ( errors.length ) {
  console.error(`ОШИБКИ (${errors.length}):\n  ${errors.join("\n  ")}`);
  process.exit(1);
}
console.log("Ошибок не найдено.");
