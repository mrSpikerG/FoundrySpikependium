// Общий конструктор подкласса: создаёт умения в своей папке и сам подкласс с выдачей умений и заклинаний.
import { feature, subclassItem, folder, md, spellTable } from "../../tools/lib/docs.mjs";

/**
 * o: {
 *   key, cls: "Бард", clsGen: "барда" (род. падеж для «уровня …»), classIdentifier, name, en, identifier, img, book, page,
 *   tagline, intro, note (примечание дизайнера), spells: { уровень: [названия] }, spellsTable, spellsName, spellsEn,
 *   spellAbility, features: [{ id, level, name, en, img, desc|html, uses, acts, effects }], extraAdvancement
 * }
 */
export function makeSubclass(o) {
  const parent = [o.cls, o.group].filter(Boolean).join("/");
  const subFolder = folder("subclasses", `${parent}/${o.name}`);
  const clsFolder = folder("subclasses", parent);
  const grants = {};
  const add = (lvl, key) => (grants[lvl] ??= []).push(key);

  // Умение «Заклинания подкласса» — всегда на 3 уровне, с таблицей.
  if ( o.spells ) {
    const key = `${o.key}:spells`;
    const tableName = o.spellsTable ?? `Заклинания ${o.spellsGen ?? o.name.toLowerCase()}`;
    feature({
      key, pack: "subclasses", folder: subFolder, book: o.book, page: o.page, level: 3, requirements: o.name,
      name: o.spellsName ?? `Заклинания: ${o.name}`, identifier: `${o.identifier}-spells`,
      img: o.spellsImg ?? "icons/sundries/books/book-embossed-jewel-gold-purple",
      html: md(`Когда вы достигаете уровня ${o.clsGen}, указанного в таблице «${tableName}», эти заклинания считаются для вас всегда подготовленными.`)
        + spellTable(tableName, o.spells, [`Уровень ${o.clsGen}`, "Заклинания"])
    });
    add(3, key);
  }

  for ( const f of o.features ) {
    const key = `${o.key}:${f.id}`;
    feature({
      levelClass: o.classIdentifier, ...f, key, pack: "subclasses", folder: subFolder, book: f.book ?? o.book, page: f.page ?? o.page,
      requirements: o.name, identifier: f.identifier ?? f.id
    });
    add(f.level, key);
  }

  const desc = [
    o.tagline ? `*${o.tagline}*` : "",
    o.intro ?? "",
    o.note ? `<aside class="notable"><p><strong>Примечание дизайнера.</strong> ${o.note}</p></aside>` : "",
    "*Перевод: Koroz.*"
  ].filter(Boolean).join("\n\n");

  return subclassItem({
    key: o.key, folder: clsFolder, name: o.name, en: o.en, identifier: o.identifier, classIdentifier: o.classIdentifier,
    img: o.img, book: o.book, page: o.page, desc, features: grants, spells: o.spells, spellAbility: o.spellAbility,
    extraAdvancement: o.extraAdvancement, spellcasting: o.spellcasting
  });
}
