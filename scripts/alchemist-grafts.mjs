const slots = new Set(["arms", "skin", "head", "organs", "legs"]);
export function graftData(item) {
  return item?.flags?.spikependium?.key?.startsWith("item:alchemist-graft:") ? item.flags.spikependium.graft : undefined;
}
function heavyProficiency(actor) {
  const values = actor.system?.traits?.armorProf?.value;
  return values?.has?.("hvy") || values?.includes?.("hvy");
}
export function graftActiveState(actor) {
  const installed = actor.items.filter(item => graftData(item) && item.system.equipped && item.system.quantity > 0);
  return Object.fromEntries(installed.map(item => {
    const graft = graftData(item);
    const active = slots.has(graft.slot) && item.system.quantity > 0 && (!graft.heavy || heavyProficiency(actor))
      && (actor.flags?.spikependium?.key !== "actor:alchemist-golem" || installed.length <= 3)
      && !installed.some(other => other !== item && graftData(other).slot === graft.slot);
    return [item.system.identifier, !!active];
  }));
}
export function guardGraftEquip(item, changes) {
  const graft = graftData(item);
  if (!graft || !item.actor || (changes["system.equipped"] ?? changes.system?.equipped) !== true) return;
  if (item.actor.flags?.spikependium?.key === "actor:alchemist-golem"
    && item.actor.items.filter(other => other.id !== item.id && graftData(other) && other.system.equipped && other.system.quantity > 0).length >= 3) {
    ui.notifications.warn("У алхимического голема может быть не больше трёх трансплантатов."); return false;
  }
  if (!slots.has(graft.slot) || item.system.quantity <= 0) {
    ui.notifications.warn("У трансплантата должна быть допустимая часть тела и положительное количество."); return false;
  }
  if (graft.heavy && !heavyProficiency(item.actor)) {
    ui.notifications.warn("Для Чешуи дракона требуется владение тяжёлыми доспехами."); return false;
  }
  if (item.actor.items.some(other => other.id !== item.id && graftData(other)?.slot === graft.slot && other.system.equipped && other.system.quantity > 0)) {
    ui.notifications.warn("Эта часть тела уже занята трансплантатом. Сначала снимите прежний."); return false;
  }
}
export function canUseGraft(activity) {
  const item = activity.item, actor = activity.actor;
  if (graftData(item)) {
    if (!actor?.isOwner || !graftActiveState(actor)[item.system.identifier]) {
      ui.notifications.warn("Трансплантат должен быть установлен и восстановлен, отмечен экипированным и занимать свободную часть тела."); return false;
    }
  } else if (item.type === "spell" && ["feat:alchemist-graft-magic-synapses", "feat:alchemist-graft-magic-synapses-upgrade"].includes(item.system.sourceItem)) {
    const state = actor && graftActiveState(actor);
    if (!actor?.isOwner || !actor.items.some(i => graftData(i)?.id === "magic-synapses" && state[i.system.identifier])) {
      ui.notifications.warn("Этот заговор требует действующих установленных Магических синапсов."); return false;
    }
  }
}
