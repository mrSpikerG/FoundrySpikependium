const KEY = "subclass:phantom:whispers-of-the-dead";
const restChoices = new Map();
const choiceLabels = new WeakMap();

export function isWhispers(activity) {
  return activity?.item?.flags.spikependium?.key === KEY && activity.flags?.spikependium?.whispers === true;
}

export function whispersChoices(actor) {
  const choices = {};
  for (const [id, config] of Object.entries(CONFIG.DND5E.skills)) {
    if (!/^[a-z0-9_-]+$/i.test(id) || ["__proto__", "constructor", "prototype"].includes(id)) continue;
    if ((actor.system.skills[id]?.value ?? 0) < 1) choices[`skills:${id}`] = `Навык: ${config.label}`;
  }
  for (const id of new Set([...Object.keys(CONFIG.DND5E.tools), ...Object.keys(actor.system.tools)])) {
    if (!/^[a-z0-9_-]+$/i.test(id) || ["__proto__", "constructor", "prototype"].includes(id)) continue;
    if ((actor.system.tools[id]?.value ?? 0) < 1)
      choices[`tool:${id}`] = `Инструмент: ${dnd5e.documents.Trait.keyLabel(id, { trait: "tool" })}`;
  }
  return choices;
}

function currentRest(activity, config) {
  const rest = restChoices.get(activity.actor.uuid);
  return rest && rest.item === activity.item.id && rest.event === config.spikependium?.whispersRest && !rest.used ? rest : null;
}

export function prepareWhispersDialog(activity, config, dialog) {
  if (!isWhispers(activity)) return;
  if (!currentRest(activity, config)) {
    ui.notifications.warn("Шёпот мёртвых выбирается в окне после завершения короткого или продолжительного отдыха.");
    return false;
  }
  const Base = dialog.applicationClass;
  config.spikependium = { ...config.spikependium, usageChoice: true };
  config.scaling = 0;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      context.fields.push({ name: "spikependium.whispersChoice", value: this.config.spikependium.whispersChoice ?? "keep",
        field: new foundry.data.fields.StringField({ required: true, blank: false, label: "Знание призрака",
          hint: "Новое владение заменяет прежнее владение от Шёпота мёртвых. Отказ сохраняет прежний выбор.",
          choices: { keep: "Сохранить прежний выбор", ...whispersChoices(activity.actor) } }) });
      context.hasConsumption = true;
      return context;
    }
  };
}

export function prepareWhispersChoice(activity, config, updates) {
  if (!isWhispers(activity)) return updates;
  const rest = currentRest(activity, config);
  const item = activity.actor.items.get(activity.item.id);
  const selected = config.spikependium?.whispersChoice ?? "keep";
  const choices = whispersChoices(activity.actor);
  if (!rest || !item?.isOwner || item.flags.spikependium?.key !== KEY || (selected !== "keep" && !Object.hasOwn(choices, selected))) {
    if (rest && item?.isOwner && item.flags.spikependium?.key === KEY) rest.retry = true;
    ui.notifications.warn("Выбор Шёпота мёртвых устарел или владение уже получено. Повторите выбор после отдыха.");
    return false;
  }
  if (selected !== "keep") {
    const [trait, id] = selected.split(":");
    const path = trait === "tool" ? "tools" : "skills";
    if (trait === "tool" && !activity.actor.system.tools[id]) updates.actor[`system.tools.${id}`] = {
      value: 0, ability: CONFIG.DND5E.tools[id]?.ability ?? "int"
    };
    const previous = item.effects.filter(effect => effect.flags.spikependium?.whispers);
    updates.operations ??= [];
    const data = {
      name: `${item.name}: ${choices[selected]}`, img: item.img, type: "base", transfer: true, disabled: false,
      system: { origin: { item: item.uuid }, changes: [{ key: `system.${path}.${id}.value`, type: "upgrade", value: "1", phase: "initial" }] },
      flags: { spikependium: { whispers: selected } },
      description: "Временное владение от Шёпота мёртвых. Сохраняется до нового выбора после отдыха."
    };
    if (previous.length) {
      updates.operations.push({ action: "update", documentName: "ActiveEffect", parent: item, updates: [{ ...data, _id: previous[0].id }] });
      if (previous.length > 1) updates.operations.push({ action: "delete", documentName: "ActiveEffect", parent: item, ids: previous.slice(1).map(e => e.id) });
    } else updates.operations.push({ action: "create", documentName: "ActiveEffect", parent: item, data: [data] });
  }
  choiceLabels.set(activity, selected === "keep" ? "Прежнее владение сохранено" : choices[selected]);
  rest.used = true;
  return updates;
}

export function describeWhispers(activity, message) {
  if (!isWhispers(activity)) return;
  const label = choiceLabels.get(activity);
  if (label) (message.data.system.properties ??= []).push({ type: "text", text: label });
}

export async function chooseWhispersAfterRest(actor, result, config) {
  if (!["short", "long"].includes(config.type) || !actor.isOwner) return;
  let item = actor.items.find(item => item.flags.spikependium?.key === KEY);
  if (!item) return;
  // Старые экземпляры получают действие только на рабочей копии; лист не перезаписывается.
  if (!item.system.activities.some(a => a.flags.spikependium?.whispers)) item = item.clone({
    "system.activities.v0lv6SAkNAzgyNAg": { _id: "v0lv6SAkNAzgyNAg", type: "utility", name: "Выбрать знание призрака",
      activation: { type: "special" }, flags: { spikependium: { whispers: true } } }
  }, { keepId: true });
  const activity = item.system.activities.find(a => a.flags.spikependium?.whispers);
  const rest = { item: item.id, event: foundry.utils.randomID(), used: false };
  restChoices.set(actor.uuid, rest);
  try {
    do {
      rest.retry = false;
      await activity.use({ spikependium: { whispersRest: rest.event, whispersChoice: "keep" } });
    } while (rest.retry && restChoices.get(actor.uuid) === rest);
  } finally {
    if (restChoices.get(actor.uuid) === rest) restChoices.delete(actor.uuid);
  }
}
