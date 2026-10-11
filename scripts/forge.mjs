import { BLUEPRINTS, TINKER_ITEMS, FORGE_BASES } from "./generated.mjs";

export function knownBlueprints(actor) {
  const level = actor.classes.artificer?.system.levels ?? 0;
  return actor.items.filter(i => i.flags.spikependium?.blueprint?.minimum <= level);
}

export function prepareBlueprintAdvancement(manager) {
  const flow = manager.step?.flow;
  const advancement = flow?.advancement;
  if (advancement?.configuration.restriction?.subtype !== "magicBlueprint") return;
  advancement.updateSource({ "configuration.pool": BLUEPRINTS.filter(p => p.minimum <= Number(flow.level))
    .map(p => ({ uuid: p.blueprintUuid })) });
  flow.pool = undefined;
}

export function forgeBudget(actor) {
  const level = actor.classes.artificer?.system.levels ?? 0;
  const maximum = level < 2 ? 0 : level < 6 ? 2 : level < 10 ? 3 : level < 14 ? 4 : level < 18 ? 5 : 6;
  const rest = actor.flags.spikependium?.longRest ?? "";
  const saved = actor.flags.spikependium?.forgeCrafts?.[rest || "initial"] ?? {};
  const plans = Object.keys(saved).filter(id => saved[id] > 0);
  return { maximum, rest, plans };
}

export function suitableForgeBase(base, sourceType, category) {
  if (base.type !== sourceType) return false;
  if (!category || category === "weapon") return true;
  return category === "armor" ? ["light", "medium", "heavy"].includes(base.category) : base.category === category;
}

export async function appendForgeFields(activity, config, context) {
  const mode = activity.flags.spikependium?.forge;
  if (!["mundane", "replicate", "transmute"].includes(mode)) return context;
  const { StringField, BooleanField } = foundry.data.fields;
  const field = (name, label, choices, value) => context.fields.push({ name: `spikependium.forge.${name}`,
    value: choices.some(c => c.value === value) ? value : choices[0]?.value,
    field: new StringField({ label, required: true, blank: false, choices: Object.fromEntries(choices.map(c => [c.value, c.label])) }) });
  const selection = config.spikependium?.forge ?? {};
  if (mode === "mundane") {
    field("item", "Создаваемый предмет", TINKER_ITEMS.map(i => ({ value: i.uuid, label: i.name })), selection.item ?? TINKER_ITEMS[0].uuid);
  } else {
    const plans = knownBlueprints(activity.actor);
    field("plan", "Изученный чертёж", plans.map(i => ({ value: i.id, label: i.name })), selection.plan ?? plans[0]?.id);
    const plan = plans.find(i => i.id === (selection.plan ?? plans[0]?.id))?.flags.spikependium.blueprint;
    if (plan) {
      const source = await fromUuid(plan.uuid);
      const enchant = source?.system.activities.find(a => a.type === "enchant");
      if (enchant && !plan.profile) field("profile", "Вариант зачарования", enchant.effects.map(p => ({ value: p._id,
        label: source.effects.get(p._id)?.name ?? p._id })), selection.profile ?? enchant.effects[0]?._id);
      if (enchant && (plan.profile || !source.system.type?.value)) {
        const bases = FORGE_BASES.filter(b => suitableForgeBase(b, source.type, plan.baseCategory));
        field("base", "Базовый предмет", bases.map(b => ({ value: b.uuid, label: b.name })), selection.base ?? bases[0]?.uuid);
      }
      context.fields.push({ name: "spikependium.forge.attune", value: selection.attune ?? false,
        input: context.inputs.createCheckboxInput, field: new BooleanField({ label: "Настроиться сразу после создания" }) });
    }
    if (mode === "replicate") {
      const budget = forgeBudget(activity.actor);
      context.notes.push({ type: "info", message: `После отдыха осталось создать: ${Math.max(0, budget.maximum - budget.plans.length)}. Один предмет на каждый различный чертёж.` });
    }
  }
  context.hasConsumption = true;
  return context;
}

export async function prepareForgeCreation(activity, config, updates) {
  const mode = activity.flags.spikependium?.forge;
  if (!["mundane", "replicate", "transmute"].includes(mode)) return updates;
  const actor = activity.actor;
  const selection = config.spikependium?.forge ?? {};
  let blueprint;
  let choice;
  const budget = forgeBudget(actor);
  if (mode === "mundane") choice = TINKER_ITEMS.find(i => i.uuid === selection.item);
  else {
    blueprint = knownBlueprints(actor).find(i => i.id === selection.plan);
    if (blueprint && (mode === "transmute" || (budget.plans.length < budget.maximum && !budget.plans.includes(blueprint.id)))) choice = blueprint.flags.spikependium.blueprint;
  }
  if (!choice) {
    ui.notifications.warn("Выберите допустимый предмет или изученный чертёж; проверьте лимит после отдыха.");
    return false;
  }
  const source = await fromUuid(choice.uuid);
  if (source?.documentName !== "Item") throw new Error(`Missing item ${choice.uuid}`);
  const enchant = source.system.activities?.find(a => a.type === "enchant");
  const profile = choice.profile ?? selection.profile ?? enchant?.effects[0]?._id;
  if (enchant && !enchant.effects.some(p => p._id === profile)) {
    ui.notifications.warn("Выберите допустимый вариант зачарования.");
    return false;
  }
  let base = source;
  if (enchant && (choice.profile || !source.system.type?.value)) {
    if (!FORGE_BASES.some(b => b.uuid === selection.base && suitableForgeBase(b, source.type, choice.baseCategory))) return false;
    base = await fromUuid(selection.base);
    if (!base || enchant.canEnchant(base) !== true) {
      ui.notifications.warn("Этот базовый предмет не подходит для выбранного зачарования.");
      return false;
    }
  }
  const data = base.toObject();
  delete data._key;
  data._id = foundry.utils.randomID();
  data.folder = null;
  data.sort = 0;
  data.system.quantity = 1;
  if (choice.profile && data.system.activities) for (const a of Object.values(data.system.activities))
    if (a.type === "enchant") a.effects = a.effects.filter(p => p._id === choice.profile);
  data.flags ??= {};
  data.flags.spikependium = { ...data.flags.spikependium, forged: { owner: actor.uuid, plan: blueprint?.id ?? null,
    rest: budget.rest, created: Date.now(), temporary: mode === "mundane", pending: !!enchant } };
  data._stats = { ...data._stats, compendiumSource: base.uuid, duplicateSource: null };
  if (mode === "replicate" && selection.attune) {
    const used = actor.items.filter(i => i.system.attuned).length;
    if (used >= actor.system.attributes.attunement.max) {
      ui.notifications.warn("Достигнут предел настройки на магические предметы.");
      return false;
    }
    data.system.attuned = true;
  }
  updates.create.push(data);
  if (mode === "replicate") updates.actor[`flags.spikependium.forgeCrafts.${budget.rest || "initial"}.${blueprint.id}`] = 1;
  if (enchant) updates.spikependium = { ...updates.spikependium, forge: { id: data._id, uuid: choice.uuid, profile,
    strict: base !== source } };
  return updates;
}

export async function finishForge(activity, config, results) {
  const forge = results.updates?.spikependium?.forge;
  if (!forge) return;
  const source = await fromUuid(forge.uuid);
  const enchant = source.system.activities.find(a => a.type === "enchant");
  const holder = forge.holder ? await fromUuid(forge.holder) : activity.actor;
  const item = holder?.items.get(forge.id);
  if (!item) throw new Error("Created item is missing");
  const effect = await enchant.applyEnchantment(forge.profile, item, { chatMessage: results.message, strict: forge.strict });
  if (!effect) throw new Error("Enchantment was not applied");
  await item.setFlag("spikependium", "forged.pending", false);
}

export function obsoleteForgeItems(owner, items, time = 0) {
  const budget = forgeBudget(owner);
  const known = new Set(knownBlueprints(owner).map(i => i.id));
  const forged = items.filter(i => i.flags.spikependium?.forged?.owner === owner.uuid);
  const obsolete = forged.filter(i => {
    const tag = i.flags.spikependium.forged;
    if (Number.isFinite(tag.expires) && tag.expires <= time) return true;
    return tag.temporary ? tag.rest !== budget.rest : !known.has(tag.plan);
  });
  const active = forged.filter(i => !i.flags.spikependium.forged.temporary && !i.flags.spikependium.forged.pending && !obsolete.includes(i))
    .sort((a, b) => a.flags.spikependium.forged.created - b.flags.spikependium.forged.created);
  return [...obsolete, ...active.slice(0, Math.max(0, active.length - budget.maximum))];
}

let checking = false;
let pending = false;
export async function cleanForgeItems() {
  if (!game.user.isActiveGM) return;
  pending = true;
  if (checking) return;
  checking = true;
  try {
    do {
      pending = false;
      const actors = [...new Set([...game.actors, ...[...game.scenes].flatMap(s => s.tokens.map(t => t.actor))].filter(Boolean))];
      const items = actors.flatMap(a => [...a.items]);
      for (const owner of actors.filter(a => a.statuses.has("dead"))) {
        const dying = items.filter(i => i.flags.spikependium?.forged?.owner === owner.uuid
          && !i.flags.spikependium.forged.temporary && i.flags.spikependium.forged.expires == null);
        if (!dying.length) continue;
        const rolls = await CONFIG.Dice.BasicRoll.build({ subject: owner, hookNames: ["formula"], rolls: [{ parts: ["1d4"] }] },
          { configure: false }, { create: true, data: { type: "generic", flavor: "Дней до исчезновения копий магических предметов",
            speaker: ChatMessage.getSpeaker({ actor: owner }) } });
        if (!rolls?.length) throw new Error("Death expiry roll was cancelled");
        const expires = game.time.worldTime + rolls[0].total * 86400;
        for (const item of dying) await item.setFlag("spikependium", "forged.expires", expires);
      }
      const obsolete = actors.flatMap(owner => obsoleteForgeItems(owner, items, game.time.worldTime));
      for (const actor of actors) {
        const ids = obsolete.filter(i => i.actor === actor).map(i => i.id);
        if (!ids.length) continue;
        const contents = actor.items.filter(i => ids.includes(i.system.container)).map(i => ({ _id: i.id, "system.container": null }));
        if (contents.length) await actor.updateEmbeddedDocuments("Item", contents);
        await actor.deleteEmbeddedDocuments("Item", ids);
      }
    } while (pending);
  } catch (error) {
    console.error("Spikependium: исчезновение созданных предметов", error);
    ui.notifications.error("Не удалось завершить магию созданного предмета. Подробности в консоли.");
  } finally { checking = false; }
}
