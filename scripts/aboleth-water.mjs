const water = actor => actor.flags.spikependium?.abolethWater?.underwater;
export const hasAbolethCurse = actor => actor?.effects.some(effect => effect.active && !effect.duration.expired
  && effect.statuses.has("cursed") && effect.flags.spikependium?.monsterEffect === "aboleth-curse");
const controls = activity => activity?.actor?.flags.spikependium?.key === "actor:mm25:aboleth"
  && (activity.flags.spikependium?.abolethWaterControls || activity.flags.spikependium?.monsterAction === "aboleth-curse");
const actions = { abolethEnterWater: true, abolethLeaveWater: false, abolethMoistenSkin: "wet" };
export function abolethWaterButtons(wrapped, ...args) {
  const buttons = wrapped(...args);
  if (!controls(this)) return buttons;
  return [...buttons,
    { action: "abolethEnterWater", icon: "fa-solid fa-water", label: { value: "Цель под водой" } },
    { action: "abolethLeaveWater", icon: "fa-solid fa-person-walking", label: { value: "Цель вне воды" } },
    { action: "abolethMoistenSkin", icon: "fa-solid fa-droplet", label: { value: "Увлажнить кожу цели" } }
  ];
}
export async function abolethWaterAction(wrapped, event, target, message) {
  const action = target.dataset.action;
  if (!Object.hasOwn(actions, action)) return wrapped(event, target, message);
  if (!controls(this)) return;
  const tokens = canvas.tokens.controlled.map(token => token.document ?? token);
  const actor = tokens.length === 1 ? tokens[0].actor : undefined;
  if (!actor?.isOwner || !actor.system.isCreature) {
    ui.notifications.warn("Выберите один доступный вам токен существа, чтобы отметить воду или увлажнение кожи."); return;
  }
  const now = game.time.worldTime;
  if (!Number.isFinite(now)) return;
  if (actions[action] === "wet") {
    if (!hasAbolethCurse(actor)) { ui.notifications.warn("У выбранной цели нет активного проклятия слизистого облака."); return; }
    await actor.update({ "flags.spikependium.abolethWetAt": now,
      "flags.spikependium.abolethWetHistory": [...new Set([...(actor.flags.spikependium?.abolethWetHistory ?? []), now])] });
    ui.notifications.info?.("Кожа выбранной цели увлажнена.");
  } else {
    const history = actor.flags.spikependium?.abolethWaterHistory ?? [];
    await actor.update({ "flags.spikependium.abolethWater": { underwater: actions[action], changed: now },
      "flags.spikependium.abolethWaterHistory": [...history, { underwater: actions[action], changed: now }] });
    ui.notifications.info?.(actions[action] ? "Выбранная цель отмечена под водой." : "Выбранная цель отмечена вне воды.");
  }
}
export function restrictAbolethHealing(actor, damages, options = {}) {
  if (!hasAbolethCurse(actor) || water(actor) === true) return;
  for (const damage of damages) {
    if (["temphp", "maximum"].includes(damage.type)) continue;
    const multiplier = options.multiplier ?? 1;
    const inversion = damage.type === "healing" && options.invertHealing !== false ? -1 : 1;
    if (damage.value * multiplier * inversion < 0) damage.value = 0;
  }
}
export function guardAbolethHPUpdate(actor, changed) {
  if (!hasAbolethCurse(actor) || water(actor) === true) return;
  const path = "system.attributes.hp.value", flat = Object.hasOwn(changed, path);
  const value = flat ? changed[path] : changed.system?.attributes?.hp?.value;
  if (!Number.isFinite(value) || value <= actor.system.attributes.hp.value) return;
  if (flat) changed[path] = actor.system.attributes.hp.value;
  else changed.system.attributes.hp.value = actor.system.attributes.hp.value;
  ui.notifications.warn(water(actor) === false ? "Проклятие аболета: восстановление хитов возможно только под водой."
    : "Проклятие аболета: укажите «Цель под водой» в карточке воды, прежде чем восстанавливать хиты.");
}
export const abolethUnderwater = actor => water(actor) === true;
