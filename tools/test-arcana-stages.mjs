import assert from "node:assert/strict";
import fs from "node:fs";
import { canUseArcanaStage,prepareArcanaStage,captureArcanaStage,recordDetonateCast,prepareDetonateSave,
  prepareArcanaStageUpdates,recordArcanaStageConsumption,arcanaStageDeltaLabel,prepareGroundDamage,groundDamage } from "../scripts/arcana-stages.mjs";
import { nativeRefund, nativeBuildEvaluate } from "./data/dnd5e-reaction-native.mjs";
import { nativeCalculateDamage, nativeApplyDamage } from "./data/dnd5e-guardian-native.mjs";
const docs=fs.readdirSync("packs/_source/spells").filter(f=>f.startsWith("spell-au-")).map(f=>JSON.parse(fs.readFileSync("packs/_source/spells/"+f,"utf8")));
const find=id=>docs.find(d=>d.system.identifier===id),acts=d=>Object.values(d.system.activities);
for(const [id,level,page,school]of [["detonate",9,39,"evo"],["lightning-ring",8,43,"evo"],["grave-ground",5,42,"nec"],
  ["negative-energy-flood",5,44,"nec"],["wither-and-bloom",2,45,"nec"]]){
  const d=find(id);assert.ok(d);assert.equal(d.system.level,level);assert.equal(d.system.source.book,"AU");
  assert.equal(d.system.source.page,String(page));assert.equal(d.system.school,school);assert.ok(d.folder);
}
const detonate=find("detonate"),[seed,burst]=acts(detonate);
assert.equal(seed.save.ability[0],"con");assert.equal(seed.range.value,"500");assert.equal(seed.damage.parts[0].number,10);
assert.equal(seed.damage.parts[0].denomination,10);assert.deepEqual(seed.damage.parts[0].types,["fire"]);
assert.equal(burst.save.ability[0],"dex");assert.equal(burst.target.template.size,"60");assert.equal(burst.consumption.spellSlot,false);
const ring=find("lightning-ring"),[cast,pulse,line]=acts(ring);
assert.equal(ring.system.activation.type,"bonus");assert.equal(ring.system.duration.value,"10");assert.equal(cast.target.template.size,"10");
assert.deepEqual(pulse.damage.parts.map(p=>p.types[0]),["lightning","thunder"]);assert.equal(pulse.save.ability[0],"con");
assert.equal(line.save.ability[0],"dex");assert.equal(line.target.template.size,"60");assert.equal(line.target.template.width,"5");
assert.ok(ring.effects.some(e=>e.statuses.includes("deafened")&&e.duration.value===60));
for(const a of [pulse,line]){assert.equal(a.consumption.spellSlot,false);assert.equal(a.duration.concentration,false);}
const ground=find("grave-ground");assert.equal(acts(ground)[1].save.ability[0],"str");assert.equal(acts(ground)[1].damage.onSave,"none");
const flood=find("negative-energy-flood"),[living,undead]=acts(flood);
assert.equal(living.damage.parts[0].number,3);assert.equal(living.damage.parts[0].bonus,"25");assert.equal(living.damage.onSave,"half");
assert.deepEqual(undead.healing.types,["temphp"]);assert.equal(undead.healing.number,3);assert.equal(undead.healing.scaling.mode,"");
const bloom=find("wither-and-bloom");assert.equal(bloom.system.properties.includes("concentration"),false);
assert.equal(acts(bloom)[0].damage.parts[0].number,3);assert.equal(acts(bloom)[0].target.template.size,"10");
const rules=fs.readdirSync("packs/_source/rules").filter(f=>f.startsWith("journal-au-spell-lists_")).map(f=>JSON.parse(fs.readFileSync("packs/_source/rules/"+f,"utf8")))[0];
assert.equal(rules.pages.length,8);
for(const [id,classes]of [["detonate",["wizard","warlock","sorcerer"]],["lightning-ring",["wizard","druid","warlock","sorcerer"]],
  ["grave-ground",["wizard","cleric","warlock"]],["negative-energy-flood",["wizard","warlock"]],["wither-and-bloom",["wizard","druid","sorcerer"]]]){
  for(const page of rules.pages){const data=page.system;assert.equal(page.type,"spells");
    assert.equal(data.spells.includes(`Compendium.spikependium.spells.Item.${find(id)._id}`),classes.includes(data.identifier));
  }
}
const get=(o,p)=>p.split(".").reduce((v,k)=>v?.[k],o),set=(o,p,v)=>{const keys=p.split("."),last=keys.pop();keys.reduce((a,k)=>a[k]??={},o)[last]=v;};
globalThis.ui={notifications:{warn(){}}};globalThis.foundry={utils:{setProperty:set,getProperty:get,isEmpty:o=>!Object.keys(o).length}};
const actor={uuid:"Actor.caster",flags:{},testUserPermission:u=>u?.id==="caster"},victim={uuid:"Actor.victim",system:{isCreature:true,details:{type:{value:"humanoid"}}}};
const scene={grid:{units:"ft",measurePath:([a,b])=>({distance:Math.hypot(a.x-b.x,(a.elevation??0)-(b.elevation??0))})}};
const token=(id,x)=>({uuid:`Scene.s.Token.${id}`,name:id,actor:id==="victim"?victim:{uuid:`Actor.${id}`,system:{isCreature:true}},parent:scene,x,elevation:0,
  getOccupiedGridSpaceOffsets:()=>[],getCenterPoint(){return{x:this.x,y:0,elevation:this.elevation};}});
const primary=token("victim",0),other=token("other",60),lookup=new Map([[primary.uuid,primary],[other.uuid,other]]);
globalThis.fromUuidSync=id=>lookup.get(id);globalThis.canvas={ready:false};globalThis.dnd5e={utils:{convertLength:v=>v}};
const initial={...seed,actor,item:{type:"spell",uuid:"Actor.caster.Item.spell",flags:detonate.flags}},stage={...burst,actor,item:initial.item};
const saved={data:{system:{targets:[{actor:victim.uuid,token:primary.uuid}]}}};recordDetonateCast(initial,saved);
const origin={id:"detonateOrigin00",uuid:"ChatMessage.detonateOrigin00",type:"usage",flags:saved.data.flags,author:{id:"caster"},getAssociatedActivity:()=>initial};
lookup.set(origin.uuid,origin);globalThis.game={user:{targets:new Set([other])},messages:Object.assign([origin],{get(id){return this.find(m=>m.id===id);}})};
assert.equal(canUseArcanaStage(initial),true);game.user.targets.add(primary);assert.equal(canUseArcanaStage(initial),false);game.user.targets=new Set([other]);
const cfg={spikependium:{detonateOrigin:origin.uuid,detonateDowned:true}},msg={data:{system:{deltas:{actor:[],item:{}}}}};
assert.equal(captureArcanaStage(stage,cfg,msg),undefined);let updates=prepareArcanaStageUpdates(stage,cfg,{actor:{}});assert.ok(updates);
for(const [p,v]of Object.entries(updates.actor))set(actor,p,v);recordArcanaStageConsumption(stage,cfg,msg);
assert.equal(msg.data.system.deltas.actor[0].delta,1);assert.equal(captureArcanaStage(stage,cfg,msg),false);
await nativeRefund.call({actor},msg.data.system.deltas,async result=>{for(const [p,v]of Object.entries(result.actor))set(actor,p,v);});
assert.equal(captureArcanaStage(stage,cfg,msg),undefined);
game.user.targets=new Set([primary]);assert.equal(captureArcanaStage(stage,cfg,msg),false);
game.user.targets=new Set([other]);other.x=61;assert.equal(captureArcanaStage(stage,cfg,msg),false);other.x=60;
const burstCard={id:"burst",author:{id:"caster"},flags:msg.data.flags,getAssociatedActivity:()=>stage};game.messages.push(burstCard);
for(const [mode,expected]of [[0,-1],[1,0],[-1,-1]]){
  const config={ability:"dex",rolls:[{options:{advantageMode:mode}}]};prepareDetonateSave(config,{}, {data:{system:{origin:"burst"}}});
  assert.equal(config.rolls[0].options.advantageMode,expected);
}
for(const type of ["undead","humanoid"]){victim.system.details.type.value=type;game.user.targets=new Set([primary]);
  assert.equal(canUseArcanaStage({...living,actor,item:{flags:flood.flags,type:"spell"}}),type!=="undead");
  assert.equal(canUseArcanaStage({...undead,actor,item:{flags:flood.flags,type:"spell"}}),type==="undead");
}
const alive={...living,actor,item:{flags:flood.flags,type:"spell"}};
assert.equal(captureArcanaStage(alive,{}, {data:{system:{targets:[{actor:"Actor.wrong"}]}}}),false);
assert.equal(arcanaStageDeltaLabel.call({keyPath:"flags.spikependium.detonateBursts.AbCdEfGh12345678.spent"},()=>({label:"raw"})).label,"Взрыв Детонации");
console.log("Arcana additions: source data, native staged saves/damage/temp HP, concentration actions, class lists, burst radius/exclusion/one-use/refund and conditional disadvantage passed.");
{
  const profile = ground.effects.find(e => e.flags?.spikependium?.graveGroundWeakness);
  assert.ok(profile); assert.equal(profile.duration.expiry, "targetEnd");
  let penalties = 0, posted = [], dieResult = 4;
  class NumericTerm {
    constructor({ number, options = {} }) { this.number = number; this.options = options; }
    get total() { return this.number; } get flavor() { return this.options.flavor; }
    toJSON() { return { class: "NumericTerm", number: this.number, options: this.options }; }
  }
  class OperatorTerm {
    constructor({ operator }) { this.operator = operator; }
    toJSON() { return { class: "OperatorTerm", operator: this.operator, options: {} }; }
  }
  class DiceTerm {
    constructor(data) { Object.assign(this, data); this.options ??= {}; }
    get total() { return this.results.reduce((n, r) => n + r.result, 0); } get flavor() { return this.options.flavor; }
    getTooltipData() { return { rolls: this.results, icon: "dice", method: "default" }; }
    toJSON() { return { class: "DiceTerm", number: this.number, faces: this.faces, results: this.results, options: this.options }; }
  }
  class Damage {
    constructor(total, type, terms = [new NumericTerm({ number: total })]) {
      this.total = total; this.options = { type, properties: ["mgc"], configured: true, preprocessed: true };
      this.terms = terms; this._evaluated = false; this.formula = String(total); this.evaluations = 0;
    }
    async evaluate() { this.evaluations++; this._evaluated = true; return this; }
    toJSON() { return structuredClone({ class: "DamageRoll", total: this.total, options: this.options,
      terms: this.terms.map(t => t.toJSON()), evaluated: this._evaluated, formula: this.formula }); }
    static fromData(data) {
      assert.equal(data.options.configured, true, "critical damage was already configured before reduction");
      const roll = new this(data.total, data.options.type, data.terms.map(t => foundry.dice.terms.RollTerm.fromData(t)));
      roll.options = data.options; roll._evaluated = data.evaluated; roll.formula = data.formula; return roll;
    }
    static fromTerms(terms, options) {
      let total = 0, sign = 1;
      for (const term of terms) { if (term instanceof OperatorTerm) sign = term.operator === "-" ? -1 : 1; else total += sign * term.total; }
      const roll = new this(total, options.type, terms); roll.options = options; roll._evaluated = true; return roll;
    }
  }
  class Basic {
    constructor(formula) { assert.equal(formula, "1d6"); this.formula = formula; }
    async evaluate() { penalties++; this.total = dieResult; return this; }
    toJSON() { return { class: "BasicRoll", formula: this.formula, total: this.total, evaluated: true,
      terms: [{ class: "DiceTerm", number: 1, faces: 6, results: [{ result: this.total, active: true }] }] }; }
    async toMessage(data, options) { posted.push({ data, options }); }
  }
  foundry.utils.deepClone = structuredClone;
  foundry.dice = { terms: { NumericTerm, OperatorTerm, DiceTerm, PoolTerm: class {}, RollTerm: {
    fromData(data) { return data.class === "OperatorTerm" ? new OperatorTerm(data) : data.class === "DiceTerm" ? new DiceTerm(data) : new NumericTerm(data); }
  } } };
  foundry.data = { fields: { StringField: class { constructor(data) { Object.assign(this, data); } } } };
  globalThis.CONFIG = { Dice: { DamageRoll: Damage, BasicRoll: Basic }, DND5E: {
    damageTypes: { piercing: {}, poison: {}, fire: {}, cold: {} }, healingTypes: { healing: {}, temphp: {} } } };
  const { default: aggregateDamageRolls } = await import("./data/dnd5e-damage-aggregation-native.mjs");
  dnd5e.dice = { aggregateDamageRolls };
  const effect = { uuid: "Actor.weak.ActiveEffect.e", flags: { spikependium: { graveGroundWeakness: true } }, active: true, duration: {}, system: {} };
  const weak = { uuid: "Actor.weak", documentName: "Actor", effects: [effect] };
  lookup.set(weak.uuid, weak);
  const components = rolls => aggregateDamageRolls(rolls).map(r => ({ value: Math.max(0, r.total), type: r.options.type, properties: new Set(r.options.properties) }));
  class Dialog { constructor(config) { this.config = config; } async _prepareConfigurationContext(c) { return c; } _buildConfig(r) { return r; } }
  const setupDamage = (rolls, extra = {}) => {
    const config = { subject: { actor: weak, type: "attack" }, rolls: rolls.map(r => ({ parts: [r.formula], options: r.options })), ...extra };
    const dialog = { applicationClass: Dialog }, message = { data: { speaker: { actor: "weak" }, system: { origin: "usage" } } };
    prepareGroundDamage(config, dialog, message); return { config, dialog, message, rolls };
  };
  let test = setupDamage([new Damage(3, "piercing"), new Damage(10, "poison")]);
  const context = await new test.dialog.applicationClass(test.config)._prepareConfigurationContext({ fields: [] });
  assert.equal(context.fields[0].field.choices["1"], "10");
  await groundDamage(nativeBuildEvaluate, test.rolls, test.config, test.message);
  assert.deepEqual(components(test.rolls).map(p => [p.type, p.value]), [["piercing", 0], ["poison", 9]]);
  assert.equal(penalties, 1, "one d6 for the entire damage group"); assert.equal(test.message.data.flags.spikependium.groundDamage.applied, 4);
  const hp = { value: 40, max: 40, temp: 2, tempmax: 0, damage: 0 };
  const target = { system: { attributes: { hp }, _source: { attributes: { hp } }, traits: {} }, getRollData: () => ({}), changeIsIgnored: () => false,
    changeHasEffect: (kind, damage) => kind === "resistance" && damage.type === "poison", calculateDamage: nativeCalculateDamage,
    async update(data) { for (const [p, v] of Object.entries(data)) set(this, p, v); } };
  Number.isNumeric = n => typeof n === "number"; Math.clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  globalThis.Hooks = { call: () => true, callAll() {} };
  assert.equal(nativeCalculateDamage.call(target, components(test.rolls), {}).amount, 4, "reduction precedes resistance and rounding");
  await nativeApplyDamage.call(target, components(test.rolls), {}); assert.deepEqual([hp.value, hp.temp], [38, 0]);
  test = setupDamage([new Damage(3, "piercing"), new Damage(10, "poison")]);
  new test.dialog.applicationClass(test.config)._buildConfig({}, new Map([["spikependium.groundDamageFirst", "1"]]));
  await groundDamage(nativeBuildEvaluate, test.rolls, test.config, test.message);
  assert.deepEqual(components(test.rolls).map(p => [p.type, p.value]), [["piercing", 3], ["poison", 6]]);
  assert.equal(nativeCalculateDamage.call(target, components(test.rolls), {}).amount, 6);
  test = setupDamage([new Damage(2, undefined, [new NumericTerm({ number: 2, options: { flavor: "fire" } }), new OperatorTerm({ operator: "+" }),
    new NumericTerm({ number: 6, options: { flavor: "cold" } })])]);
  test.rolls[0].total = 8;
  await groundDamage(nativeBuildEvaluate, test.rolls, test.config, test.message);
  assert.deepEqual(components(test.rolls).map(p => [p.type, p.value]), [["fire", 0], ["cold", 4]], "inline flavored components retain their damage types");
  test = setupDamage([new Damage(12, undefined, [new NumericTerm({ number: 2, options: { flavor: "fire" } }), new OperatorTerm({ operator: "+" }),
    new NumericTerm({ number: 10, options: { flavor: "healing" } })])]);
  await groundDamage(nativeBuildEvaluate, test.rolls, test.config, test.message);
  assert.deepEqual(components(test.rolls).map(p => [p.type, p.value]), [["fire", 0], ["healing", 10]]);
  const critDie = new DiceTerm({ number: 2, faces: 8, results: [{ result: 4 }, { result: 5 }], options: {} });
  test = setupDamage([new Damage(13, "piercing", [critDie, new OperatorTerm({ operator: "+" }), new NumericTerm({ number: 4 })])]);
  test.rolls[0].options.isCritical = true; test.rolls[0].options.critical = { multiplier: 3, multiplyNumeric: true, powerfulCritical: true };
  await groundDamage(nativeBuildEvaluate, test.rolls, test.config, test.message);
  assert.equal(test.rolls[0].total, 9); assert.equal(test.rolls[0].terms[0].number, 2); assert.deepEqual(test.rolls[0].terms[0].results, critDie.results);
  assert.equal(test.rolls[0].options.isCritical, true); assert.deepEqual(test.rolls[0].options.properties, ["mgc"]);
  test = setupDamage([new Damage(2, "piercing")]); await groundDamage(nativeBuildEvaluate, test.rolls, test.config, test.message);
  assert.equal(test.rolls[0].total, 0); assert.equal(test.message.data.flags.spikependium.groundDamage.applied, 2);
  const beforePreview = penalties;
  test = setupDamage([new Damage(10, "piercing")], { evaluate: false }); await groundDamage(nativeBuildEvaluate, test.rolls, test.config, test.message);
  assert.equal(penalties, beforePreview); assert.equal(test.rolls[0]._evaluated, false);
  for (const type of ["healing", "temphp"]) {
    test = setupDamage([new Damage(10, type)]); await groundDamage(nativeBuildEvaluate, test.rolls, test.config, test.message); assert.equal(test.rolls[0].total, 10);
  }
  for (const state of [{ active: false, duration: {} }, { active: true, duration: { expired: true } }, { active: true, duration: { remaining: 0 } }]) {
    Object.assign(effect, state); test = setupDamage([new Damage(10, "piercing")]);
    await groundDamage(nativeBuildEvaluate, test.rolls, test.config, test.message); assert.equal(test.rolls[0].total, 10);
  }
  effect.active = true; effect.duration = {};
  weak.effects.push({ ...effect, uuid: "Actor.weak.ActiveEffect.other" });
  const beforeDuplicate = penalties; test = setupDamage([new Damage(10, "piercing")]); effect.active = false;
  await groundDamage(nativeBuildEvaluate, test.rolls, test.config, test.message); assert.equal(penalties, beforeDuplicate + 1, "another active copy preserves one non-stacking penalty");
  weak.effects = [effect]; effect.active = true;
  const legacyActivity = { type: "save", flags: { spikependium: { arcanaStage: "grave-ground" } }, item: { type: "spell", flags: ground.flags } };
  lookup.set("Item.legacy.Activity.hands", legacyActivity); effect.flags = {}; effect.system.origin = { activity: "Item.legacy.Activity.hands" };
  test = setupDamage([new Damage(10, "piercing")]); await groundDamage(nativeBuildEvaluate, test.rolls, test.config, test.message); assert.equal(test.rolls[0].total, 6, "existing world effects are recognized by native source activity");
  test = setupDamage([new Damage(10, "piercing")], { subject: weak }); await groundDamage(nativeBuildEvaluate, test.rolls, test.config, test.message); assert.equal(test.rolls[0].total, 6);
  test = setupDamage([new Damage(10, "piercing")], { subject: undefined }); test.message.data.whisper = ["gm"]; test.message.data.blind = true; test.message.rollMode = "blind";
  await groundDamage(nativeBuildEvaluate, test.rolls, test.config, test.message);
  assert.equal(test.rolls[0].total, 6); assert.deepEqual(posted.at(-1).data.whisper, ["gm"]); assert.equal(posted.at(-1).data.blind, true); assert.equal(posted.at(-1).options.rollMode, "blind");
  const beforeVirtual = posted.length; test = setupDamage([new Damage(10, "piercing")]); test.message.create = false;
  await groundDamage(nativeBuildEvaluate, test.rolls, test.config, test.message); assert.equal(posted.length, beforeVirtual);
  const existing = test.rolls[0].total; await groundDamage(async () => {}, test.rolls, test.config, test.message); assert.equal(test.rolls[0].total, existing, "already reduced rolls are not reduced again");
  test = setupDamage([new Damage(10, "piercing")]); dieResult = 7;
  await assert.rejects(() => groundDamage(nativeBuildEvaluate, test.rolls, test.config, test.message)); assert.equal(test.rolls[0].total, 10);
}
console.log("Grave Ground: native evaluation/aggregation/damage, one d6, mixed-type allocation/spill, critical preservation, healing exclusion, effect expiry/legacy lookup and private dice passed.");
