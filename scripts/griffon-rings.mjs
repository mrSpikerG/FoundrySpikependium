const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const isActive = item => item?.system.equipped && (item.system.attunement !== "required" || item.system.attuned);
const key = item => item?.flags?.spikependium?.key;
const origin = message => game.messages.get(message.data?.system?.origin)?.getAssociatedActivity();
export function guardGriffonAttunement(item, changes) {
  const required = item.flags?.spikependium?.griffonClass;
  if (required && item.actor && (changes["system.attuned"] ?? changes.system?.attuned) === true
    && !(item.actor.classes?.[required]?.system.levels > 0)) {
    ui.notifications.warn("Настройка этого предмета требует указанного в описании класса."); return false;
  }
}
export async function resetGriffonChoice(item, changes, _options, userId) {
  if (userId === game.user.id && item.isOwner && key(item) === "item:gs1:seething"
    && (changes["system.attuned"] ?? changes.system?.attuned) === false && item.flags.spikependium.seethingType)
    await item.unsetFlag("spikependium", "seethingType");
}
function mark(target, caster) {
  if (!(caster?.classes?.warlock?.system.levels > 0) || caster.statuses.has("unconscious") || caster.statuses.has("dead")) return false;
  return (target?.appliedEffects ?? target?.effects ?? []).some(e => {
    if (!e.active || e.duration?.expired || !e.flags.spikependium?.griffonEldritchMark) return false;
    const uuid = e.system.origin?.activity, source = resolve(uuid?.startsWith(".") ? `${target.uuid}${uuid}` : uuid);
    return source?.actor?.uuid === caster.uuid && key(source.item) === "item:gs1:eldritch-ire" && isActive(source.item);
  });
}
function markedTargets(activity, message) {
  // shortcut: split rolls against mixed targets until native per-target attack/damage modifiers exist.
  const targets = message.data?.system?.targets ?? [];
  return activity?.actor?.isOwner && targets.length && targets.every(t => {
    const target = resolve(t.token)?.actor ?? resolve(t.actor); return mark(target, activity.actor);
  });
}
function bonus(roll, value) {
  roll.parts = roll.parts.filter(p => p !== "@spikependiumEldritchIre");
  roll.data ??= {}; roll.data.spikependiumEldritchIre = value; roll.parts.push("@spikependiumEldritchIre");
}
function clear(config) {
  for (const roll of config.rolls) { roll.parts = roll.parts.filter(p => p !== "@spikependiumEldritchIre"); if (roll.data) delete roll.data.spikependiumEldritchIre; }
}
export function prepareEldritchAttack(config, _dialog, message) {
  clear(config);
  if (markedTargets(config.subject, message)) for (const roll of config.rolls) bonus(roll, 1);
}
export function prepareEldritchDamage(config, _dialog, message) {
  clear(config);
  if (!markedTargets(config.subject, message)) return;
  const roll = config.rolls.find(r => !(r.options?.type in CONFIG.DND5E.healingTypes)); if (roll) bonus(roll, 1);
}
export function prepareEldritchSave(config, _dialog, message) {
  clear(config);
  const source = origin(message), actor = config.subject;
  if (!actor?.isOwner || source?.item?.type !== "spell" || !mark(actor, source.actor)) return;
  for (const roll of config.rolls) bonus(roll, -1);
}
export function prepareCatnipCheck(config, _dialog, message) {
  const source = origin(message);
  if (!config.subject?.isOwner || source?.actor?.uuid !== config.subject.uuid || key(source?.item) !== "item:gs1:catnip"
    || !source.flags.spikependium?.griffonCatnip || !isActive(source.item)) return;
  for (const roll of config.rolls) {
    roll.options ??= {}; roll.options.disadvantage ||= roll.options.advantageMode === -1; roll.options.advantage = true;
    if (roll.options.advantageMode !== undefined) roll.options.advantageMode = roll.options.disadvantage ? 0 : 1;
  }
}
