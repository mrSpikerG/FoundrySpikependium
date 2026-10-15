import assert from "node:assert/strict";
import fs from "node:fs";
import { canUseGriffonItem, finishGriffonUse, griffonUse } from "../scripts/griffon-items.mjs";
import { nativeGriffonArmorClass, nativeEquipmentProficiency } from "./data/dnd5e-griffon-native.mjs";
import { nativeUsesConsumption, nativeRecoverUses } from "./data/dnd5e-monsters-native.mjs";
import { monsterEvasionDamage } from "../scripts/monster-evasion.mjs";
const read = pack => fs.readdirSync(`packs/_source/${pack}`).filter(f => f.endsWith(".json"))
  .map(f => JSON.parse(fs.readFileSync(`packs/_source/${pack}/${f}`, "utf8")));
const items = read("items").filter(d => /^item:gs[12]:/.test(d.flags?.spikependium?.key ?? ""));
assert.equal(items.length, 129);
for (const item of items) {
  assert.ok(item.folder); assert.ok(item.system.price.value > 0); assert.ok(item.system.weight.value > 0);
  assert.ok(item.system.description.value.includes("оценочн") || item.system.description.value.includes("по обычному амулету"));
  assert.ok(item.system.source.custom.startsWith("https://rpgd100.ru/content_pages/catalog_index?"));
  assert.equal(item.system.source.page, "");
  assert.equal(item.system.source.rules, item.system.source.book === "GS1" ? "2024" : "2014");
  assert.ok(!item.system.description.value.includes("в UA цена"));
}
const mage = items.find(i => i.flags.spikependium.key === "item:gs2:mageplate");
assert.equal(mage.system.uses.max, "3"); assert.equal(mage.system.uses.recovery[0].period, "dawn");
for (const [i, action] of Object.values(mage.system.activities).entries()) {
  assert.equal(action.type, "transform"); assert.equal(action.activation.type, "bonus");
  assert.equal(action.consumption.spellSlot, false); assert.equal(action.consumption.targets[0].value, String(i + 1));
  assert.ok(action.visibility.requireAttunement);
  const effect = mage.effects.find(e => e._id === action.effects[0]._id);
  assert.equal(effect.duration.value, 60); assert.equal(effect.transfer, false);
  assert.equal(effect.system.changes[0].key, "system.attributes.ac.formulas");
  assert.equal(effect.system.changes[0].type, "add"); assert.equal(effect.system.changes[0].value, String(16 + i));
}
globalThis.foundry = { utils: { iterateEntries: Object.entries, buildRelativeUuid: (uuid, parent) => uuid.replace(parent, ""), isEmpty: x => Object.keys(x).length === 0, getType: x => Array.isArray(x) ? "Array" : typeof x } };
globalThis.CONFIG = { DND5E: { armorClasses: { unarmored: { formula: "10 + @abilities.dex.mod" }, armored: { formula: "@attributes.ac.armor + @attributes.ac.dex", armored: true } },
  armorTypes: { heavy: {}, shield: {} }, armorProficienciesMap: {}, healingTypes: {} } };
globalThis.Roll = class { constructor(formula) { this.formula = formula; } evaluateSync() { this.total = this.formula.split("+").map(Number).reduce((a, b) => a + b, 0); return this; } };
for (const [dex, armor, shield, expected] of [[0, 0, 0, 16], [7, 0, 0, 17], [0, 18, 0, 18], [0, 0, 2, 18]]) {
  const ac = { calcs: new Set(["unarmored", "armored"]), formulas: [{ formula: "16", label: "Кольцо" }], base: -Infinity, armor: 10, shield: 0, cover: 0, min: 0, bonus: 0, override: null };
  const model = { attributes: { ac }, abilities: { dex: { mod: dex } }, parent: { _preparationWarnings: [], coverBonus: 0,
    itemTypes: { equipment: [ ...(armor ? [{ name: "Латы", system: { equipped: true, type: { value: "heavy" }, armor: { value: armor }, properties: new Set() } }] : []),
      ...(shield ? [{ name: "Щит", system: { equipped: true, type: { value: "shield" }, armor: { value: shield } } }] : []) ] } } };
  nativeGriffonArmorClass.call(model, model); assert.equal(ac.value, expected); assert.deepEqual(model.parent._preparationWarnings, []);
}
const brawler = items.find(i => i.flags.spikependium.key === "item:gs2:brawler");
assert.equal(nativeEquipmentProficiency.call(brawler.system), 1, "ring attacks retain native proficiency");
const punch = Object.values(brawler.system.activities)[0];
assert.equal(punch.attack.ability, "str"); assert.equal(punch.damage.includeBase, false);
assert.equal(punch.damage.parts[0].number, 1); assert.equal(punch.damage.parts[0].denomination, 4);
assert.equal(punch.damage.parts[0].bonus, "@mod");
const charges = { max: 3, spent: 0, value: 3, recovery: mage.system.uses.recovery };
const paid = await nativeUsesConsumption.call({ resolveCost: async () => ({ total: 3 }) }, {}, { uses: charges, type: "заряды", rolls: [], delta: {} });
assert.equal(paid.spent, 3);
await assert.rejects(() => nativeUsesConsumption.call({ resolveCost: async () => ({ total: 2 }) }, {}, { uses: { ...charges, spent: 2, value: 1 }, type: "заряды", rolls: [], delta: {} }));
assert.deepEqual((await nativeRecoverUses.call({ uses: { ...charges, spent: 3 } }, new Map([["dawn", 1]]))).updates, { spent: 0 });
globalThis.ui = { notifications: { warn() {} } };
let removed = 0;
const actor = { uuid: "Actor.user", isOwner: true, statuses: new Set(["prone"]), effects: [], toggleStatusEffect: async (id, options) => { assert.equal(id, "prone"); assert.deepEqual(options, { active: false }); removed++; } };
const use = { actor, uuid: "Actor.user.Item.amulet.Activity.stand", item: { actor, flags: { spikependium: { key: "item:gs2:buoyancy" } }, system: { equipped: true } } };
assert.equal(canUseGriffonItem(use), true);
use.item.system.equipped = false; assert.equal(canUseGriffonItem(use), false); use.item.system.equipped = true;
actor.statuses.clear(); assert.equal(canUseGriffonItem(use), false); actor.statuses.add("prone");
await finishGriffonUse(use, {}, {}); assert.equal(removed, 0);
await finishGriffonUse(use, {}, { message: {} }); assert.equal(removed, 0, "cancelled form leaves prone intact");
actor.effects.push({ active: true, flags: { spikependium: { griffonBuoyancy: true } }, system: { origin: { activity: use.uuid } } });
await finishGriffonUse(use, {}, { message: {} }); assert.equal(removed, 1);
actor.effects[0].system.origin.activity = ".Item.amulet.Activity.stand";
await finishGriffonUse(use, {}, { message: {} }); assert.equal(removed, 2, "native forms store an actor-relative activity UUID");
actor.effects = [];
const returned = await griffonUse.call(use, async () => { assert.equal(removed, 2); actor.effects.push({ active: true, flags: { spikependium: { griffonBuoyancy: true } }, system: { origin: { activity: ".Item.amulet.Activity.stand" } } }); return { message: {} }; }, {});
assert.ok(returned.message); assert.equal(removed, 3, "standing follows the completed native form, not the earlier postUseActivity hook");
use.item.system.attunement = "required"; assert.equal(canUseGriffonItem(use), false); use.item.system.attuned = true; assert.equal(canUseGriffonItem(use), true);
const classes = read("classes"), alchemist = classes.find(d => d.flags?.spikependium?.key === "class:alchemist");
assert.equal(alchemist.system.hd.denomination, "d6");
assert.equal(alchemist.system.advancement.find(a => a.type === "Subclass").level, 2);
assert.deepEqual(alchemist.system.advancement.filter(a => a.type === "AbilityScoreImprovement").map(a => a.level), [4, 8, 12, 16, 19]);
assert.deepEqual(alchemist.system.advancement.find(a => a.type === "Trait" && a.title === "Три навыка").configuration.choices[0].count, 3);
const bombs = classes.find(d => d.flags?.spikependium?.key === "alchemist:bombs");
assert.equal(bombs.system.uses.max, "10 + 2 * @classes.alchemist.levels");
assert.deepEqual(bombs.system.uses.recovery.map(r => r.period), ["sr", "lr"]);
assert.equal(Object.values(bombs.system.activities).filter(a => a.type === "attack").length, 4);
const evasionFeature = classes.find(d => d.flags?.spikependium?.key === "alchemist:evasion");
assert.equal(evasionFeature.effects[0].transfer, true); assert.deepEqual(Object.keys(evasionFeature.system.activities), []);
const target = { flags: { spikependium: {} }, statuses: new Set(), effects: [{ active: true, flags: { spikependium: { monsterEvasion: true } } }],
  items: [{ flags: { spikependium: { key: "alchemist:evasion" } } }], uuid: "Actor.alchemist" };
const caster = { testUserPermission: () => true };
const origin = { author: {}, system: { outcomes: new Map([[target.uuid, "failure"]]) }, getAssociatedActivity: () => ({ type: "save", actor: caster, save: { ability: new Set(["dex"]) }, damage: { onSave: "half" } }) };
const options = { originatingMessage: { getOriginatingMessage: () => origin }, multiplier: 1 };
assert.equal(monsterEvasionDamage.call(target, (damage, config) => config.multiplier, [{ value: 20, type: "fire" }], options), 0.5);
target.appliedEffects = target.effects; target.effects = [];
assert.equal(monsterEvasionDamage.call(target, (damage, config) => config.multiplier, [{ value: 20, type: "fire" }], options), 0.5, "passive item effects apply without a separate activation");
target.appliedEffects[0].active = false;
assert.equal(monsterEvasionDamage.call(target, (damage, config) => config.multiplier, [{ value: 20, type: "fire" }], options), 1);
target.appliedEffects[0].active = true;
target.items = []; assert.equal(monsterEvasionDamage.call(target, (damage, config) => config.multiplier, [{ value: 20, type: "fire" }], options), 1);
console.log("Griffon/Alchemist: source editions, native AC/proficiency/charge recovery, equipment/attunement gate, buoyancy, class advancements and owned Evasion passed.");
