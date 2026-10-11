import assert from "node:assert/strict";
import { prepareHollowConcentration, hollowArmorSuppression } from "../scripts/hollow-warden.mjs";
import { nativeConcentrationData } from "./data/dnd5e-concentration-native.mjs";
const KEY = "subclass:hollow-warden:wrath-of-the-wilds";
let documents = new Map(); globalThis.fromUuidSync = uuid => documents.get(uuid);
globalThis._loc = key => key;
globalThis.CONFIG = { specialStatusEffects: { CONCENTRATING: 0 }, statusEffects: [{ id: "concentrating", type: "condition", system: { type: "concentrating" } }] };
globalThis.foundry = { utils: { mergeObject(a, b) {
  const merge = (a, b) => { for (const [key, value] of Object.entries(b)) {
    if (value && typeof value === "object" && !Array.isArray(value)) merge(a[key] ??= {}, value); else a[key] = structuredClone(value);
  } return a; }; return merge(structuredClone(a), b);
} } };
function setup() {
  documents = new Map();
  const actor = { isOwner: true, items: [{ flags: { spikependium: { key: KEY } } }], effects: [], statuses: new Set() };
  const item = { type: "spell", system: { identifier: "hunters-mark" }, flags: {}, uuid: "Actor.pc.Item.mark" };
  const activity = { actor, item };
  documents.set(item.uuid, item);
  const manual = { uuid: "Actor.pc.Item.wrath.Activity.transform", item: actor.items[0] }; documents.set(manual.uuid, manual);
  const effect = { parent: actor, system: { origin: { activity: manual.uuid }, changes: [{ key: "system.attributes.ac.bonus" }] } };
  return { actor, item, activity, effect };
}
let s = setup();
s.item.actor = s.actor; s.item.isEmbedded = true; s.item.id = "mark"; s.item.system.level = 1;
s.actor.items.has = id => id === s.item.id;
s.activity.id = "markActivity"; s.activity.uuid = `${s.item.uuid}.Activity.markActivity`; s.activity.type = "utility";
s.activity.duration = { concentration: true, getEffectData: () => ({ value: 3600, units: "seconds" }) };
const data = nativeConcentrationData(s.activity, { system: { changes: [{ key: "existing" }] } });
prepareHollowConcentration(s.actor, s.item, data, s.activity);
assert.equal(data.type, "condition"); assert.equal(data.system.type, "concentrating"); assert.equal(data.duration.value, 3600);
assert.equal(data["flags.dnd5e"].item.uuid, s.item.uuid); assert.equal(data.origin, s.item.uuid);
assert.equal(data.system.changes.length, 2); assert.equal(data["flags.spikependium.hollowWrath"], true);
assert.deepEqual(data.system.changes[1], { key: "system.attributes.ac.bonus", value: "+ max(1, @abilities.wis.mod)", type: "add", phase: "base",
  conditions: JSON.stringify({ o: "NOT", v: { k: "statuses.antimagic", v: 1 } }) });
assert.equal(hollowArmorSuppression.call(s.effect, () => false), true, "ручная броня без концентрации не действует");
const concentrating = { system: { type: "concentrating" }, flags: { dnd5e: { item: { uuid: s.item.uuid } } }, duration: { expired: false }, disabled: false };
s.actor.effects.push(concentrating);
assert.equal(hollowArmorSuppression.call(s.effect, () => false), false, "совместимость с прежним накладыванием");
concentrating.flags.spikependium = { hollowWrath: true };
assert.equal(hollowArmorSuppression.call(s.effect, () => false), true, "новая концентрация не удваивает ручной бонус");
delete concentrating.flags.spikependium; concentrating.duration.expired = true;
assert.equal(hollowArmorSuppression.call(s.effect, () => false), true); concentrating.duration.expired = false;
s.actor.statuses.add("antimagic"); assert.equal(hollowArmorSuppression.call(s.effect, () => false), true);
s.actor.statuses.clear(); assert.equal(hollowArmorSuppression.call(s.effect, () => true), true, "штатное подавление сохраняется");
documents.delete(s.item.uuid); concentrating.flags.dnd5e.item.data = { type: "spell", system: { identifier: "hunters-mark" } };
assert.equal(hollowArmorSuppression.call(s.effect, () => false), false, "снимок удалённого заклинания в нативной концентрации");
for (const reason of ["no-feat", "other-spell", "stored", "unowned", "wrong-actor", "wrong-item"]) {
  s = setup(); const data = { system: { changes: [] } }; let actor = s.actor, item = s.item;
  if (reason === "no-feat") s.actor.items = []; if (reason === "other-spell") s.item.system.identifier = "hex";
  if (reason === "stored") s.item.flags.spikependium = { storedSpell: {} }; if (reason === "unowned") s.actor.isOwner = false;
  if (reason === "wrong-actor") actor = {}; if (reason === "wrong-item") item = {};
  prepareHollowConcentration(actor, item, data, s.activity); assert.equal(data.system.changes.length, 0, reason);
}
s = setup(); s.effect.system.origin.activity = "unrelated"; assert.equal(hollowArmorSuppression.call(s.effect, () => false), false);
console.log("Древняя броня: нативная концентрация Метки охотника, динамическая Мудрость, прекращение/антимагия, старые копии без двойного бонуса: OK.");
