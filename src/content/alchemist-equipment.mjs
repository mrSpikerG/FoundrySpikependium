import inventory from "../../tools/data/alchemist-starting-gear.json" with { type: "json" };
import { makeId } from "../../tools/lib/core.mjs";

export function alchemistStartingEquipment() {
  const out = [];
  const group = (name, type = "OR", parent = "") => {
    const _id = makeId(`alchemist:equipment:${name}`);
    out.push({ _id, type, group: parent, sort: (out.length + 1) * 100000, requiresProficiency: false }); return _id;
  };
  const item = (name, parent = "", count = null) => {
    const gear = inventory.gear.find(g => g.name === name); if (!gear) throw Error(`Нет стартового предмета алхимика: ${name}`);
    out.push({ _id: makeId(`alchemist:equipment:${parent}:${name}`), type: "linked", key: gear.uuid, count, group: parent, sort: (out.length + 1) * 100000, requiresProficiency: false });
  };
  const weapons = group("weapons"), crossbow = group("crossbow-and-bolts", "AND", weapons);
  item("Light Crossbow", crossbow); item("Bolts", crossbow, 20);
  for (const weapon of inventory.gear.filter(g => g.simple)) item(weapon.name, weapons);
  const pack = group("pack"); item("Explorer's Pack", pack); item("Scholar's Pack", pack);
  item("Alchemist's Supplies");
  const reagent = group("reagent"); for (const name of ["Acid", "Alchemist's Fire", "Poison, Basic"]) item(name, reagent);
  item("Leather Armor"); item("Dagger");
  return out;
}
