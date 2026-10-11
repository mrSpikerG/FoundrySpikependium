import { tokensDistance, incapacitated } from "./effects.mjs";
import { castingToken } from "./conduit.mjs";

const KEY = "feat:greater-hospitality", MOD = "oojjUEphFaXcEJ6Z", ABILITY = "Fz3gJ2wsGQjsGvqN";
const MENTAL = ["int", "wis", "cha"], prepared = new WeakMap(), captured = new WeakMap(), running = new Set();
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const protectedScene = scene => !game.users.some(u => !u.isGM && scene.canUserModify(u, "update"));
const turn = () => game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : null;
function enhancement(activity) {
  if (activity?.item?.type !== "spell" || activity.item.system.identifier !== "purify-food-and-drink"
    || activity.item.flags.spikependium?.storedSpell || !activity.actor?.isOwner) return;
  const item = activity.actor.items.find(i => i.flags.spikependium?.key === KEY), resource = item?.system.activities.get(MOD);
  return resource ? { item, resource } : undefined;
}
export function hospitalityAbility(item) {
  const advancement = item?.system.advancement?.find(a => (a.id ?? a._id) === ABILITY);
  return advancement?.value.ability ?? item?.flags.spikependium?.hospitalityAbility;
}
function validTarget(source, descriptor) {
  const token = resolve(descriptor.token), distance = source && token && tokensDistance(source, token);
  return token?.actor?.system.isCreature && token.actor.uuid === descriptor.actor && token.parent === source?.parent
    && !token.actor.statuses.has("antimagic") && !token.actor.statuses.has("dead") && distance != null && distance <= 30 ? token : undefined;
}

export function canUseHospitalityModifier(activity) {
  if (activity?.id !== MOD || activity.item.flags.spikependium?.key !== KEY) return true;
  ui.notifications.warn("Улучшенное радушие выбирается при накладывании Очищения пищи и питья.");
  return false;
}
export function prepareHospitalityDialog(activity, config, dialog) {
  const selected = enhancement(activity);
  if (!(selected?.resource.uses.value > 0)) return;
  config.spikependium = { ...config.spikependium, usageChoice: true };
  const Base = dialog.applicationClass;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      context.fields.push({ name: "spikependium.improvedHospitality", value: this.config.spikependium?.improvedHospitality ?? false,
        field: new foundry.data.fields.BooleanField({ label: "Улучшенное радушие",
          hint: "До открытия окна отметьте выбранных существ в пределах 30 футов от пространства накладывания. Расходуется применение усиленной метки: истощение −1 и временные хиты от выбранной характеристики." }),
        input: context.inputs.createCheckboxInput });
      if (!hospitalityAbility(selected.item)) context.fields.push({ name: "spikependium.hospitalityAbility",
        value: this.config.spikependium?.hospitalityAbility ?? "", field: new foundry.data.fields.StringField({
          label: "Характеристика радушия — выбор один раз", choices: { "": "Выберите характеристику",
            ...Object.fromEntries(MENTAL.map(k => [k, CONFIG.DND5E.abilities[k].label])) } }) });
      context.hasConsumption = true;
      return context;
    }
  };
}
export function captureHospitalityTargets(activity, config, message) {
  captured.delete(activity);
  if (!config.spikependium?.improvedHospitality) return;
  const source = castingToken(activity, activity.getUsageToken()), descriptors = message?.data?.system?.targets;
  if (!(enhancement(activity)?.resource.uses.value > 0) || activity.actor.statuses.has("antimagic") || incapacitated(activity.actor) || !source
    || !Array.isArray(descriptors) || !descriptors.length || !descriptors.every(d => validTarget(source, d))
    || ((!game.users.activeGM || !protectedScene(source.parent)) && !descriptors.every(d => resolve(d.actor)?.isOwner))) {
    ui.notifications.warn("Для радушия нужны выбранные живые существа в пределах 30 футов от пространства накладывания и активный Мастер либо права владельца на все цели. Проверьте сцену и антимагию.");
    return false;
  }
  captured.set(activity, { source: source.uuid, targets: [...new Map(descriptors.map(d => [d.actor, { actor: d.actor, token: d.token }])).values()] });
}
export function prepareHospitalityUpdates(activity, config, updates) {
  prepared.delete(activity);
  if (!config.spikependium?.improvedHospitality) return updates;
  const selected = enhancement(activity), snapshot = captured.get(activity), source = resolve(snapshot?.source);
  const saved = hospitalityAbility(selected?.item), ability = saved ?? config.spikependium.hospitalityAbility;
  const modifier = activity.actor.system.abilities?.[ability]?.mod, proficiency = activity.actor.system.attributes.prof;
  if (!(selected?.resource.uses.value > 0) || !MENTAL.includes(ability) || !Number.isFinite(modifier) || !Number.isFinite(proficiency)
    || (saved && config.spikependium.hospitalityAbility && config.spikependium.hospitalityAbility !== saved)
    || !snapshot || !castingToken(activity, source) || activity.actor.statuses.has("antimagic") || incapacitated(activity.actor)
    || !snapshot.targets.every(d => validTarget(source, d))) {
    ui.notifications.warn("Радушие недоступно: проверьте выбранную характеристику, применение метки, токен и дистанцию до целей.");
    return false;
  }
  const { item, resource } = selected, id = foundry.utils.randomID();
  const local = !game.users.activeGM || !protectedScene(source.parent);
  if (local && !snapshot.targets.every(d => resolve(d.actor)?.isOwner)) return false;
  const data = { caster: activity.actor.uuid, spell: activity.item.uuid, feat: item.id, source: source.uuid, scene: source.parent.uuid,
    ability, local, amount: Math.max(0, proficiency + modifier), time: game.time.worldTime, turn: turn(), targets: snapshot.targets.map(d => {
      const actor = resolve(d.actor), exhaustion = actor.effects.find(e => e.type === "condition" && e.system.type === "exhaustion");
      return { ...d, exhaustion: exhaustion ? { uuid: exhaustion.uuid, created: exhaustion._stats.createdTime } : null };
    }) };
  let update = updates.item.find(u => u._id === item.id);
  if (!update) { update = { _id: item.id }; updates.item.push(update); }
  const spent = resource.uses.spent + 1;
  update[`system.activities.${MOD}.uses.spent`] = spent;
  if (!saved) update["flags.spikependium.hospitalityAbility"] = ability;
  updates.actor[`flags.spikependium.hospitalityCasts.${id}`] = data;
  prepared.set(activity, { id, data, spent });
  return updates;
}
export function recordHospitalityCast(activity, message) {
  const selected = prepared.get(activity);
  if (!selected) return;
  prepared.delete(activity);
  const current = enhancement(activity), record = activity.actor.flags.spikependium?.hospitalityCasts?.[selected.id];
  if (current?.resource.uses.spent !== selected.spent || current.item.id !== selected.data.feat
    || JSON.stringify(record) !== JSON.stringify(selected.data)) return;
  foundry.utils.setProperty(message, "data.flags.spikependium.hospitalityCast", { id: selected.id, caster: activity.actor.uuid });
}

async function finishHospitality(scene, id, job) {
  if (job.state !== "pending" || !protectedScene(scene) || !game.users.get(job.author)?.isGM || !game.user.isActiveGM
    || running.has(id)) return;
  running.add(id);
  try {
    for (const entry of job.targets) {
      if (!game.user.isActiveGM) return;
      if (scene.flags.spikependium.hospitality[id].done?.includes(entry.actor)) continue;
      await benefit(scene, id, job.amount, entry);
      const done = scene.flags.spikependium.hospitality[id].done ?? [];
      await scene.setFlag("spikependium", `hospitality.${id}.done`, [...new Set([...done, entry.actor])]);
    }
    await scene.setFlag("spikependium", `hospitality.${id}.state`, "done");
  } finally { running.delete(id); }
}

async function benefit(scene, id, amount, entry) {
  const actor = resolve(entry.actor), token = resolve(entry.token);
  if (!actor?.system.isCreature || token?.actor?.uuid !== entry.actor || token.parent !== scene
    || actor.statuses.has("antimagic") || actor.statuses.has("dead") || actor.flags.spikependium?.hospitalityReceipts?.[id]) return;
  if (!actor.isOwner) throw Error("Радушие: нет права изменять цель");
  const updates = { "system.attributes.hp.temp": Math.max(actor.system.attributes.hp.temp, amount),
    [`flags.spikependium.hospitalityReceipts.${id}`]: true };
  const exhaustion = resolve(entry.exhaustion?.uuid);
  // Updating the native attribute synchronizes the leveled exhaustion effect in dnd5e.
  if (exhaustion?.parent === actor && exhaustion._stats.createdTime === entry.exhaustion.created
    && actor.system.attributes.exhaustion > 0) updates["system.attributes.exhaustion"] = actor.system.attributes.exhaustion - 1;
  await actor.update(updates);
  if (!actor.flags.spikependium?.hospitalityReceipts?.[id]) throw Error("Радушие: запись цели отклонена");
}

export async function applyHospitalityCast(message) {
  if (message.type !== "usage" || !message.author) return;
  const request = message.flags.spikependium?.hospitalityCast, activity = message.getAssociatedActivity();
  if (!request || !/^[A-Za-z0-9]{16}$/.test(request.id) || !enhancement(activity)
    || activity.actor.uuid !== request.caster || !activity.actor.testUserPermission(message.author, "OWNER")) return;
  const record = activity.actor.flags.spikependium?.hospitalityCasts?.[request.id], scene = resolve(record?.scene);
  if (!record || record.completed || record.caster !== request.caster || record.spell !== activity.item.uuid
    || !scene || (!record.local && !protectedScene(scene)) || record.feat !== enhancement(activity).item.id) return;
  if (record.local ? message.author.id !== game.user.id : !game.user.isActiveGM) return;
  const previous = scene.flags.spikependium?.hospitality?.[request.id];
  if (previous) return finishHospitality(scene, request.id, previous);
  const source = resolve(record.source), receipt = message.system.deltas?.item?.[record.feat];
  if (!receipt?.some(d => d.keyPath === `system.activities.${MOD}.uses.spent` && d.delta === 1)
    || !castingToken(activity, source) || source.parent !== scene
    || (!record.started && (record.time !== game.time.worldTime || record.turn !== turn()))
    || !MENTAL.includes(record.ability) || !Number.isInteger(record.amount) || record.amount < 0
    || (!record.started && record.ability !== hospitalityAbility(enhancement(activity).item))
    || (!record.started && record.amount !== Math.max(0, activity.actor.system.attributes.prof + activity.actor.system.abilities[record.ability].mod))
    || !record.targets.length || (!record.started && !record.targets.every(d => validTarget(source, d))) || running.has(request.id)) return;
  if (record.local) {
    if (!record.targets.every(d => resolve(d.actor)?.isOwner)) return;
    running.add(request.id);
    try {
      await activity.actor.setFlag("spikependium", `hospitalityCasts.${request.id}.started`, true);
      for (const entry of record.targets) await benefit(scene, request.id, record.amount, entry);
      await activity.actor.setFlag("spikependium", `hospitalityCasts.${request.id}.completed`, true);
    } finally { running.delete(request.id); }
    return;
  }
  running.add(request.id);
  try {
    await scene.setFlag("spikependium", `hospitality.${request.id}`, { ...record, author: game.user.id, state: "pending", done: [] });
  } finally { running.delete(request.id); }
  await finishHospitality(scene, request.id, scene.flags.spikependium.hospitality[request.id]);
}
export async function resumeHospitalityCasts() {
  if (game.user.isActiveGM) for (const scene of game.scenes) for (const [id, job] of Object.entries(scene.flags.spikependium?.hospitality ?? {}))
    await finishHospitality(scene, id, job);
  for (const message of game.messages) if (message.flags.spikependium?.hospitalityCast) await applyHospitalityCast(message);
}
