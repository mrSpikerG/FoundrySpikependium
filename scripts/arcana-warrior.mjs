export function magicWarriorAdd(wrapped, actor, itemData, ...args) {
  if (itemData?.flags?.spikependium?.key !== "feat:magic-warrior") return wrapped(actor, itemData, ...args);
  const data = foundry.utils.deepClone(itemData), level = actor.system.details.level;
  if (!Number.isInteger(level) || level < 0 || level > 20) throw Error("Магический воин: неизвестен уровень персонажа");
  const choice = data.system.advancement.find(a => a.type === "ItemChoice");
  choice.configuration.choices = { 0: { count: 2, replacement: false },
    ...Object.fromEntries(Array.from({ length: 20 - level }, (_, i) => [String(level + i + 1), { count: 0, replacement: true }])) };
  return wrapped(actor, data, ...args);
}
