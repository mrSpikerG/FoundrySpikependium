import fs from "node:fs";
import assert from "node:assert/strict";
import { nativeConsume, nativeRefund } from "./data/dnd5e-reaction-native.mjs";
import { recordArtistIllusion, prepareArtistDialog, captureArtistInspiration, recordArtistInspiration,
  syncArtistInspiration, resumeArtistInspirations } from "../scripts/arcana-artist.mjs";

const file = fs.readdirSync("packs/_source/feats").find(f => f.startsWith("feat-magic-artist_"));
const item = JSON.parse(fs.readFileSync(`packs/_source/feats/${file}`, "utf8"));
assert.equal(item.system.source.book, "AU"); assert.equal(item.system.source.page, "28");
assert.equal(item.system.type.subtype, "origin");
assert.equal(item.system.advancement[0].configuration.items[0].uuid, "Compendium.dnd5e.spells24.Item.phbsplMinorIllus");
assert.deepEqual(item.system.advancement[0].configuration.spell.ability, ["int", "wis", "cha"]);
const data = Object.values(item.system.activities)[0];
assert.equal(data.activation.type, "special"); assert.equal(data.target.affects.type, "ally");
assert.equal(data.target.affects.count, "1"); assert.equal(data.range.value, "30");
assert.equal(data.uses.max, "1"); assert.equal(data.uses.recovery[0].period, "lr");
assert.equal(data.consumption.targets[0].type, "activityUses"); assert.equal(data.consumption.spellSlot, false);
const get = (o, p) => p.split(".").reduce((v, k) => v?.[k], o);
const set = (o, p, v) => { const keys = p.split("."), last = keys.pop(); keys.reduce((a, k) => a[k] ??= {}, o)[last] = v; };
globalThis.foundry = { utils: { setProperty: set, getProperty: get, isEmpty: o => !Object.keys(o).length },
  data: { fields: { StringField: class { constructor(o) { Object.assign(this, o); } }, BooleanField: class { constructor(o) { Object.assign(this, o); } } } } };
globalThis.ui = { notifications: { warn() {} } };
const objects = new Map(); globalThis.fromUuidSync = uuid => objects.get(uuid);
const author = { id: "owner" }, gm = { id: "gm" };
const caster = { uuid: "Actor.caster", isOwner: true, flags: {}, testUserPermission: u => u === author || u === gm, items: [item] };
item.id = item._id;
let grants = 0;
const ally = { uuid: "Actor.ally", isOwner: true, flags: {}, system: { isCreature: true, attributes: { inspiration: false } },
  async update(changes) { for (const [path, value] of Object.entries(changes)) set(this, path, value); grants++; } };
let units = "ft";
const scene = { grid: { get units() { return units; }, measurePath: ([a, b]) => ({ distance: Math.hypot(b.x - a.x, b.elevation - a.elevation) }) } };
const token = (uuid, actor, x) => ({ uuid, actor, x, elevation: 0, parent: scene,
  getOccupiedGridSpaceOffsets: () => [], getCenterPoint() { return { x: this.x, y: 0, elevation: this.elevation }; } });
const source = token("Scene.test.Token.caster", caster, 0), target = token("Scene.test.Token.ally", ally, 30);
for (const o of [source, target]) objects.set(o.uuid, o);
globalThis.game = { messages: [], user: { id: author.id, targets: new Set([target]) }, users: { activeGM: null }, time: { worldTime: 12 } };
globalThis.dnd5e = { utils: { convertLength: (v, from) => from === "m" ? v / 0.3048 : v,
  getSceneTargets: actor => actor === caster ? [{ document: source }] : [{ document: target }] } };
const spell = { type: "spell", name: "Малая иллюзия", flags: {}, system: { school: "ill", level: 0 } };
const cast = { actor: caster, item: spell, getUsageToken: () => source };
const castData = { data: { system: {} } }; recordArtistIllusion(cast, castData);
assert.equal(castData.data.flags.spikependium.artistIllusion.actor, caster.uuid);
objects.set("Compendium.spells.illusion", spell);
const linked = { type: "cast", actor: caster, item, spell: { uuid: "Compendium.spells.illusion" } };
const linkedData = { data: { system: {} } }; recordArtistIllusion(linked, linkedData);
assert.equal(linkedData.data.flags.spikependium.artistIllusion.token, source.uuid, "linked casts use the caster's body");
spell.system.level = 2; cast.consumption = { spellSlot: false, targets: [{ type: "itemUses", value: "1" }] };
const free = { data: { system: {} } }; recordArtistIllusion(cast, free);
assert.equal(free.data.flags.spikependium.artistIllusion.actor, caster.uuid, "an innate spell still counts as a cast");
cast.consumption.targets = []; const followup = { data: { system: {} } }; recordArtistIllusion(cast, followup);
assert.equal(followup.data.flags, undefined, "an ongoing spell's free utility action is not a new cast");
spell.system.level = 0;
const original = { id: "illusion", uuid: "ChatMessage.illusion", type: "usage", author, timestamp: Date.now(),
  flags: castData.data.flags, system: {}, getAssociatedActivity: () => cast, getAssociatedActor: () => caster };
game.messages.push(original); objects.set(original.uuid, original);
const activity = { ...structuredClone(data), id: data._id, actor: caster, item };
item.system.activities = new Map([[activity.id, activity]]);
Object.defineProperty(activity.uses, "value", { get: () => 1 - activity.uses.spent });
const config = { consume: { resources: true }, spikependium: { artistOrigin: original.uuid, artistVisible: true } };
const usage = () => ({ data: { system: { targets: [{ actor: ally.uuid, token: target.uuid }] } } });
assert.equal(captureArtistInspiration(activity, config, usage()), undefined);
class Dialog { constructor(config) { this.config = config; } async _prepareConsumptionContext(c) { return c; } }
const dialog = { applicationClass: Dialog }; prepareArtistDialog(activity, {}, dialog);
const context = await new dialog.applicationClass({ spikependium: {} })._prepareConsumptionContext({ fields: [], inputs: {} });
assert.equal(context.fields.length, 2); assert.equal(dialog.configure, true);
assert.equal(context.fields[0].field.choices[original.uuid], "Малая иллюзия");
for (const mutate of [() => { target.x = 31; }, () => { target.elevation = 5; }, () => { target.parent = {}; },
  () => { game.user.targets = new Set([source]); }, () => { game.user.targets.add(source); },
  () => { config.spikependium.artistVisible = false; }, () => { config.consume.resources = false; },
  () => { game.time.worldTime++; }, () => { original.timestamp -= 61000; }, () => { original.author = {}; },
  () => { spell.system.school = "evo"; }, () => { ally.isOwner = false; }]) {
  mutate(); assert.equal(captureArtistInspiration(activity, config, usage()), false);
  target.x = 30; target.elevation = 0; target.parent = scene; game.user.targets = new Set([target]);
  config.spikependium.artistVisible = true; config.consume.resources = true;
  game.time.worldTime = 12; original.timestamp = Date.now(); original.author = author; spell.system.school = "ill"; ally.isOwner = true;
}
units = "m"; target.x = 30 * 0.3048;
assert.equal(captureArtistInspiration(activity, config, usage()), undefined); units = "ft"; target.x = 30;
const staleTargets = usage(); staleTargets.data.system.targets[0].actor = "Actor.other";
assert.equal(captureArtistInspiration(activity, config, staleTargets), false);
const suppressed = usage(); suppressed.create = false;
assert.equal(captureArtistInspiration(activity, config, suppressed), false);
original.flags.spikependium.artistIllusion.paid = true;
assert.equal(captureArtistInspiration(activity, config, usage()), false, "a refunded original cast cannot grant inspiration");
original.system.deltas = { item: { spell: [{ keyPath: "system.uses.spent", delta: 1 }] } };
assert.equal(captureArtistInspiration(activity, config, usage()), undefined);
original.flags.spikependium.artistIllusion.paid = false;
activity._prepareUsageUpdates = async () => ({ activity: { "uses.spent": activity.uses.spent + 1 } });
globalThis.Hooks = { call: (name, ...args) => name === "dnd5e.preActivityConsumption" ? captureArtistInspiration(...args) : undefined };
const paid = usage();
await nativeConsume.call(activity, config, paid, async updates => {
  activity.uses.spent = updates.activity["uses.spent"];
  return { item: { [item.id]: [{ keyPath: `system.activities.${activity.id}.uses.spent`, delta: 1 }] } };
});
assert.equal(activity.uses.spent, 1); recordArtistInspiration(activity, paid);
const message = { id: "receipt", uuid: "ChatMessage.receipt", type: "usage", author, flags: paid.data.flags,
  system: paid.data.system, getAssociatedActivity: () => activity };
game.messages.push(message);
await syncArtistInspiration(message); await syncArtistInspiration(message); await resumeArtistInspirations();
assert.equal(grants, 1); assert.equal(ally.system.attributes.inspiration, true);
ally.system.attributes.inspiration = false; await syncArtistInspiration(message);
assert.equal(grants, 1, "replaying the paid card does not restore spent inspiration");
caster.items = new Map([[item.id, item]]);
await nativeRefund.call(activity, message.system.deltas, async updates => {
  activity.uses.spent = updates.item[0][`system.activities.${activity.id}.uses.spent`];
});
assert.equal(activity.uses.spent, 0);
const gmMessage = { ...message, id: "gmReceipt", uuid: "ChatMessage.gmReceipt" };
ally.isOwner = false; game.users.activeGM = gm;
await syncArtistInspiration(gmMessage); assert.equal(grants, 1);
game.user.id = gm.id; ally.isOwner = true;
await syncArtistInspiration(gmMessage); assert.equal(grants, 2, "active GM applies the recipient update once");
const refunded = { ...message, id: "refunded", uuid: "ChatMessage.refunded", system: { targets: message.system.targets, deltas: {} } };
await syncArtistInspiration(refunded); assert.equal(grants, 2);
const wrongTarget = { ...gmMessage, id: "wrong", uuid: "ChatMessage.wrong", flags: structuredClone(gmMessage.flags) };
wrongTarget.flags.spikependium.artistInspiration.actor = "Actor.other";
await syncArtistInspiration(wrongTarget); assert.equal(grants, 2);
target.x = 31; await syncArtistInspiration({ ...gmMessage, id: "distant", uuid: "ChatMessage.distant" }); assert.equal(grants, 2);
console.log("Магический художник: продвижение, иллюзия/видимость/дистанция, нативный расход и отмена, права и передача вдохновения без повторов: OK.");
