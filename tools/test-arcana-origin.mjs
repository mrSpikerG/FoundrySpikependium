import assert from "node:assert/strict";
import fs from "node:fs";
import { prepareOriginCheck, buildOriginCheck, finalizeOriginCheck, canUseOriginInspiration, applyOriginInspiration } from "../scripts/arcana-origin.mjs";
import { prepareDragonmarkCheck, buildDragonmarkCheck } from "../scripts/dragonmark-rolls.mjs";

const docs = fs.readdirSync("packs/_source/feats").filter(f => f.startsWith("feat-magic-speaker_") || f.startsWith("feat-magic-undertaker_"))
  .map(f => JSON.parse(fs.readFileSync("packs/_source/feats/" + f, "utf8")));
assert.equal(docs.length, 2);
for (const doc of docs) { assert.equal(doc.system.source.book, "AU"); assert.equal(doc.system.source.page, "28"); assert.equal(doc.system.type.subtype, "origin"); }
const speaker = docs.find(d => d.system.identifier === "magic-speaker"), undertaker = docs.find(d => d.system.identifier === "magic-undertaker");
assert.deepEqual(speaker.system.advancement[0].configuration.spell.ability, ["int", "wis", "cha"]);
assert.equal(speaker.system.advancement[0].configuration.items[0].uuid, "Compendium.dnd5e.spells24.Item.phbsplViciousMoc");
const choice = undertaker.system.advancement[0].configuration;
assert.equal(choice.allowDrops, true); assert.deepEqual(choice.restriction.list, ["wizard", "cleric"]);
assert.deepEqual(choice.restriction.school, ["nec"]); assert.equal(choice.restriction.level, "0"); assert.equal(choice.choices[0].count, 1);
assert.deepEqual(choice.spell.ability, ["int", "wis", "cha"]);
const inspirationData = Object.values(undertaker.system.activities)[0];
assert.equal(inspirationData.uses.max, "1"); assert.equal(inspirationData.uses.recovery[0].period, "lr");
assert.equal(inspirationData.flags.spikependium.heroicInspirationSelf, true);

globalThis.ui = { notifications: { warn() {} } };
globalThis.foundry = { data: { fields: { StringField: class { constructor(o) { Object.assign(this, o); } } } } };
class Dialog {
  constructor(config) { this.config = config; }
  async _prepareConfigurationContext(context) { return context; }
  _buildConfig(roll) { return roll; }
}
globalThis.CONFIG = { Dice: { D20Roll: { DefaultConfigurationDialog: Dialog } } };
const actor = { isOwner: true, items: docs.map(d => ({ ...d, uuid: `Actor.pc.Item.${d._id}` })) };
const pcSpeaker = actor.items.find(d => d.system.identifier === "magic-speaker"), pcUndertaker = actor.items.find(d => d.system.identifier === "magic-undertaker");
for (const [skill, ability, feat] of [["dec", "cha", pcSpeaker], ["itm", "cha", pcSpeaker], ["per", "cha", pcSpeaker],
  ["his", "int", pcUndertaker], ["med", "wis", pcUndertaker]]) {
  const config = { subject: actor, skill }, dialog = { applicationClass: Dialog }; prepareOriginCheck(config, dialog);
  const instance = new dialog.applicationClass(config);
  const context = await instance._prepareConfigurationContext({ fields: [] }); assert.equal(context.fields.length, 1);
  config.spikependium.originIntuition = feat.uuid;
  const roll = { parts: ["@nativeBonus"], data: { abilityId: ability }, options: {} };
  buildOriginCheck(config, roll); buildOriginCheck(config, roll);
  assert.deepEqual(roll.parts, ["@nativeBonus", "@spikependiumOriginIntuition"]); assert.equal(roll.data.spikependiumOriginIntuition, "1d4");
  assert.equal(finalizeOriginCheck([roll], config), undefined);
  roll.data.abilityId = "str"; buildOriginCheck(config, roll); assert.deepEqual(roll.parts, ["@nativeBonus"]);
  assert.equal(finalizeOriginCheck([roll], config), false);
}
for (const config of [{ subject: actor, skill: "arc" }, { subject: { ...actor, isOwner: false }, skill: "dec" },
  { subject: actor, tool: "thief" }, { subject: { isOwner: true, items: [] }, skill: "med" }]) {
  const dialog = { applicationClass: Dialog }; prepareOriginCheck(config, dialog); assert.equal(dialog.configure, undefined);
}
actor.items.push({ uuid: "Actor.pc.Item.hospitality", name: "Mark of Hospitality", flags: { spikependium: { key: "feat:hospitality" } } });
const combined = { subject: actor, skill: "per" }, dialog = { applicationClass: Dialog };
prepareOriginCheck(combined, dialog); prepareDragonmarkCheck(combined, dialog);
const instance = new dialog.applicationClass(combined), context = await instance._prepareConfigurationContext({ fields: [] });
assert.equal(context.fields.length, 2, "независимые бонусы имеют отдельные поля");
combined.spikependium.originIntuition = pcSpeaker.uuid; combined.spikependium.intuition = "Actor.pc.Item.hospitality:4";
const stacked = { parts: [], data: { abilityId: "cha" }, options: {} }; buildOriginCheck(combined, stacked); buildDragonmarkCheck(combined, stacked);
assert.deepEqual(stacked.parts, ["@spikependiumOriginIntuition", "@spikependiumIntuition"]);
let updates = [];
const owner = { uuid: "Actor.pc", isOwner: true, flags: {}, async update(data) { updates.push(data); this.flags.spikependium = { originInspiration: data["flags.spikependium.originInspiration"] }; } };
const activity = { ...inspirationData, id: inspirationData._id, actor: owner, item: { id: undertaker._id, flags: undertaker.flags } };
assert.equal(canUseOriginInspiration(activity, {}), false);
assert.equal(canUseOriginInspiration(activity, { spikependium: { stabilizedWithHelp: true } }), true);
const message = { id: "usage", system: { deltas: { item: { [undertaker._id]: [{ keyPath: `system.activities.${activity.id}.uses.spent`, delta: 1 }] } } } };
await applyOriginInspiration(activity, {}, { message }); await applyOriginInspiration(activity, {}, { message });
assert.equal(updates.length, 1); assert.equal(updates[0]["system.attributes.inspiration"], true);
assert.equal(updates[0]["flags.spikependium.originInspiration"], "usage");
owner.isOwner = false; await applyOriginInspiration(activity, {}, { message: { ...message, id: "other" } }); assert.equal(updates.length, 1);
console.log("Неудержимая магия: источники, выбор характеристики и некромантии, нативный к4 без дублей и с меткой, отмена/условия, Героическое вдохновение после расхода: OK.");
