import assert from "node:assert/strict";
import { dropVestigeGear } from "../scripts/vestige.mjs";
import { updateCompanions } from "../scripts/companions.mjs";

const collection = data => Object.assign(data, { get(id) { return this.find(d => d.id === id); }, has(id) { return this.some(d => d.id === id); } });
const item = data => ({ id: data._id, system: data.system, toObject: () => structuredClone(data) });
let createdActors, createdTokens, stageFailure, createFailure, tokenFailure, deleteFailure, coinFailure, duringCreate;
globalThis.game = { user: { isActiveGM: true }, actors: [] };
globalThis.foundry = { utils: { deepClone: structuredClone } };
globalThis.ui = { notifications: { error() {} } };
const originalLog = console.error; console.error = () => {};
const coins = { cp: 10, sp: 0, ep: 0, gp: 12, pp: 0 };
const gear = [{ _id: "bag", name: "Bag", type: "container", system: { quantity: 1 } },
  { _id: "blade", name: "Sword", type: "weapon", system: { quantity: 1, container: "bag", equipped: true }, effects: [{ _id: "enchantment" }] }];
let source, token, scene;
const reset = () => {
  createdActors = createdTokens = 0; stageFailure = createFailure = tokenFailure = deleteFailure = coinFailure = false;
  duringCreate = undefined; game.user.isActiveGM = true; game.actors = [];
  source = { uuid: "Scene.test.Token.vestige.Actor.source", name: "Vestige", isOwner: true,
    flags: { spikependium: { key: "actor:vestige-celestial" } }, system: { currency: { ...coins } },
    items: collection([...gear.map(item), item({ _id: "strike", type: "feat", system: {} })]),
    async deleteEmbeddedDocuments(type, ids) {
      assert.equal(type, "Item"); if (deleteFailure) throw Error("delete failed");
      this.items = collection(this.items.filter(i => !ids.includes(i.id)));
    },
    async update(data) { if (coinFailure) throw Error("coin update failed"); this.system.currency = data["system.currency"]; }
  };
  scene = { tokens: collection([]), async createEmbeddedDocuments(type, data) {
    assert.equal(type, "Token"); if (tokenFailure) throw Error("token failed");
    createdTokens++; assert.equal(data[0].hidden, true); assert.equal(data[0].elevation, 15); assert.equal(data[0].level, "upper");
    const t = { ...data[0], id: "lootToken" }; this.tokens.push(t); return [t];
  } };
  token = { id: "vestige", uuid: "Scene.test.Token.vestige", flags: {}, actor: source, parent: scene, x: 100, y: 200,
    elevation: 15, level: "upper", hidden: true };
  scene.tokens.push(token);
};
globalThis.Actor = { implementation: { async create(data, options) {
  if (createFailure) throw Error("creation failed");
  assert.equal(options.keepId, true); assert.equal(data.type, "group"); assert.deepEqual(data.ownership, { default: 0 });
  createdActors++;
  const loot = { id: "lootActor", uuid: "Actor.lootActor", isOwner: true, system: structuredClone(data.system),
    flags: structuredClone(data.flags), items: collection(data.items.map(item)),
    async getTokenDocument(options) { return { toObject: () => ({ ...options, actorId: this.id }) }; },
    async setFlag(scope, key, value) { if (stageFailure) throw Error("receipt failed"); this.flags[scope].vestigeDrop.state = value; }
  };
  game.actors.push(loot); if (duringCreate) await duringCreate(); return loot;
} } };

reset();
assert.equal(await dropVestigeGear(token), true);
assert.equal(createdActors, 1); assert.equal(createdTokens, 1);
assert.deepEqual(game.actors[0].items.map(i => i.id), ["bag", "blade"]);
assert.deepEqual(source.items.map(i => i.id), ["strike"], "врождённые действия остаются на спутнике");
assert.equal(game.actors[0].items.get("blade").system.container, "bag", "вложенность сохраняется вместе с ID");
assert.deepEqual(game.actors[0].items.get("blade").toObject().effects, [{ _id: "enchantment" }]);
assert.deepEqual(game.actors[0].system.currency, coins);
assert.equal(source.system.currency.gp, 0);
assert.equal(game.actors[0].flags.spikependium.vestigeDrop.state, "done");
assert.equal(await dropVestigeGear(token), true); assert.equal(createdActors, 1); assert.equal(createdTokens, 1);
reset(); source.items = collection([source.items.get("strike")]); source.system.currency = { gp: 0 };
assert.equal(await dropVestigeGear(token), true); assert.equal(createdActors, 0);
for (const cause of ["create", "token", "delete", "coin", "receipt"]) {
  reset(); createFailure = cause === "create"; tokenFailure = cause === "token"; deleteFailure = cause === "delete";
  coinFailure = cause === "coin"; stageFailure = cause === "receipt";
  assert.equal(await dropVestigeGear(token), false);
  if (["create", "token", "delete"].includes(cause)) assert.equal(source.items.has("blade"), true);
  if (cause !== "create") assert.equal(game.actors[0].items.has("blade"), true, "постоянная копия сохраняется после частичной ошибки");
  createFailure = tokenFailure = deleteFailure = coinFailure = stageFailure = false;
  assert.equal(await dropVestigeGear(token), true, "повтор завершает незавершённую передачу");
  assert.equal(createdActors, 1); assert.equal(createdTokens, 1);
}
reset(); duringCreate = () => { source.items.get("blade").toObject = () => ({ ...gear[1], name: "changed" }); };
assert.equal(await dropVestigeGear(token), false); assert.equal(source.items.has("blade"), true);
reset(); duringCreate = () => { source.system.currency.gp = 100; };
assert.equal(await dropVestigeGear(token), false); assert.equal(source.system.currency.gp, 100);
reset(); duringCreate = async () => { assert.equal(await dropVestigeGear(token), false); };
assert.equal(await dropVestigeGear(token), true); assert.equal(createdActors, 1);
for (const variant of ["bruiser", "flyer", "skulker"]) {
  reset(); source.flags.spikependium.key = `actor:au-combat-familiar-${variant}`;
  assert.equal(await dropVestigeGear(token), true); assert.equal(createdActors, 1); assert.equal(createdTokens, 1);
  assert.equal(source.items.has("blade"), false); assert.deepEqual(source.system.currency, { cp:0,sp:0,ep:0,gp:0,pp:0 });
}
reset(); game.user.isActiveGM = false;
assert.equal(await dropVestigeGear(token), false); assert.equal(createdActors, 0);
reset(); source.isOwner = false;
assert.equal(await dropVestigeGear(token), false); assert.equal(createdActors, 0);
reset(); source.flags.spikependium.key = "actor:reanimated-companion";
assert.equal(await dropVestigeGear(token), true); assert.equal(createdActors, 0);
reset();
source.flags.dnd5e = { summon: { origin: "Actor.owner.Item.vestige" } };
source.system.attributes = { hp: { value: 0 } };
globalThis.fromUuidSync = () => ({ uuid: "Actor.owner.Item.vestige", actor: { uuid: "Actor.owner", flags: {}, statuses: new Set(), items: [] } });
game.scenes = [scene];
let removed = [];
scene.deleteEmbeddedDocuments = async (type, ids) => { assert.equal(type, "Token"); removed.push(...ids);
  scene.tokens = collection(scene.tokens.filter(t => !ids.includes(t.id))); };
deleteFailure = true;
await updateCompanions(source);
assert.deepEqual(removed, [], "ошибка передачи снаряжения блокирует удаление токена при 0 хитов");
assert.equal(scene.tokens.has(token.id), true);
deleteFailure = false;
await updateCompanions(source);
assert.deepEqual(removed, [token.id]);
assert.equal(scene.tokens.has("lootToken"), true);
assert.equal(game.actors[0].items.has("blade"), true);
assert.equal(createdActors, 1); assert.equal(createdTokens, 1);
console.error = originalLog;
console.log("Снаряжение реликта: вещи, контейнеры/зачарования и монеты, врождённые действия, положение/скрытость, постоянная копия, безопасный повтор частичных ошибок, права и конкурентные вызовы: OK.");
