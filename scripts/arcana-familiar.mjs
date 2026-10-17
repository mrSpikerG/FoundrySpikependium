import { tokensDistance, incapacitated } from "./effects.mjs";

const FEAT = "feat:familiar-friend", reservations = new Map(), originalOptions = new WeakMap();
const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const feature = actor => actor?.items?.find(i => i.flags.spikependium?.key === FEAT);
const resource = actor => feature(actor)?.system.activities.find(a => a.flags.spikependium?.familiarHelp);
const familiarSpell = activity => activity?.type === "summon" && activity.item?.type === "spell" && activity.item.system.identifier === "find-familiar";

export function prepareFamiliarToken(activity, _profile, config) {
  if(familiarSpell(activity)&&activity.actor)config.actorUpdates["flags.spikependium.nativeFamiliar"]={caster:activity.actor.uuid,source:activity.item.uuid};
  const feat = feature(activity.actor), level = activity.actor?.system.details.level;
  if (!familiarSpell(activity) || !feat || !Number.isSafeInteger(level) || level < 1) return;
  const hp = config.actor.system.attributes.hp, updates = config.actorUpdates;
  if (!Number.isFinite(hp.value) || !Number.isFinite(hp.max)) return false;
  if (updates.effects.some(e => e.flags?.spikependium?.familiarFriendHP)) return;
  const bonus = 2 * level;
  const previous = config.actor.effects.filter(e => e.active && e.flags.spikependium?.familiarFriendHP)
    .reduce((n, e) => n + 2 * e.flags.spikependium.familiarFriendHP.level, 0);
  const hpField = !foundry.utils.isEmpty(config.actor.classes ?? {}) && !config.actor._source.system.attributes.hp.max ? "bonuses.overall" : "max";
  updates.effects.push({ _id: "spikeFamiliarHP0", name: "Друг фамильяра: укреплённый фамильяр", type: "base", transfer: false, disabled: false,
    img: "icons/magic/life/heart-glowing-red.webp", statuses: [],
    system: { origin: { activity: activity.uuid }, changes: [{ key: `system.attributes.hp.${hpField}`, type: "add", value: String(bonus), priority: null }] },
    flags: { spikependium: { familiarFriendHP: { caster: activity.actor.uuid, feat: feat.uuid, level } } } });
  updates["system.attributes.hp.value"] = Math.max(0, (updates["system.attributes.hp.value"] ?? hp.value) + bonus - previous);
}

function helpers(config) {
  const actor = config.subject, skill = config.skill, use = resource(actor);
  if (!actor?.isOwner || config.tool || !skill || !(actor.system.skills[skill]?.value >= 1) || !(use?.uses.value > 0) || !canvas.ready) return [];
  const sources = dnd5e.utils.getSceneTargets(actor).map(t => t.document ?? t).filter(t => t.actor?.uuid === actor.uuid && t.parent === canvas.scene);
  return [...canvas.scene.tokens].filter(token => {
    if (!token.actor) return false;
    const summon = token.actor.flags.dnd5e?.summon;
    const spell = resolve(summon?.origin);
    if (spell?.system.identifier !== "find-familiar" || spell.actor?.uuid !== actor.uuid) return false;
    if (!(token.actor.system.attributes?.hp?.value > 0) || !token.actor.testUserPermission(game.user, "LIMITED")) return false;
    return sources.some(source => { const distance = tokensDistance(source, token); return distance != null && distance <= 5; });
  });
}

export function prepareFamiliarCheck(config, dialog) {
  const available = helpers(config);
  if (!available.length) return;
  config.spikependium = { ...config.spikependium, familiarHelp: config.spikependium?.familiarHelp ?? "none" };
  const Base = dialog.applicationClass ?? CONFIG.Dice.D20Roll.DefaultConfigurationDialog;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConfigurationContext(context, options) {
      context = await super._prepareConfigurationContext(context, options);
      context.fields.push({ name: "spikependium.familiarHelp", value: this.config.spikependium.familiarHelp,
        field: new foundry.data.fields.StringField({ label: "Друг-помощник: преимущество",
          choices: { none: "Не применять", ...Object.fromEntries(helpers(this.config).map(t => [t.uuid, t.name])) },
          hint: "Один расходуемый при броске заряд. Требуются владение навыком и фамильяр в пределах 5 футов." }) });
      return context;
    }
    _buildConfig(roll, formData, index) {
      roll = super._buildConfig(roll, formData, index);
      this.config.spikependium.familiarHelp = formData?.get("spikependium.familiarHelp") ?? this.config.spikependium.familiarHelp;
      return roll;
    }
  };
}

export function buildFamiliarCheck(config, roll) {
  const old = originalOptions.get(roll);
  if (old) {
    for (const [key, value] of Object.entries(old)) { if (value === undefined) delete roll.options[key]; else roll.options[key] = value; }
    delete roll.options.spikependiumFamiliar; originalOptions.delete(roll);
  }
  const selected = config.spikependium?.familiarHelp;
  if (!helpers(config).some(t => t.uuid === selected)) return;
  const o = roll.options;
  originalOptions.set(roll, { advantage: o.advantage, disadvantage: o.disadvantage, advantageMode: o.advantageMode });
  o.disadvantage ||= o.advantageMode === -1;
  o.advantage = true;
  if (o.advantageMode !== undefined) o.advantageMode = o.disadvantage ? 0 : 1;
  o.spikependiumFamiliar = selected;
}

function valid(rolls, config) {
  const selected = config.spikependium?.familiarHelp;
  return rolls.length && helpers(config).some(t => t.uuid === selected)
    && rolls.every(r => !r._evaluated && r.options.spikependiumFamiliar === selected && r.options.advantage === true);
}
export function finalizeFamiliarCheck(rolls, config) {
  if (!rolls.length || !config.spikependium?.familiarHelp || config.spikependium.familiarHelp === "none" || valid(rolls, config)) return;
  ui.notifications.warn("Фамильяр отошёл, нет владения навыком или применения закончились. Повторите проверку без этой помощи.");
  return false;
}
export function canUseFamiliarHelp(activity, config = {}) {
  if (activity?.item?.flags.spikependium?.key !== FEAT || !activity.flags.spikependium?.familiarHelp) return;
  if (reservations.has(activity.actor.uuid) && config.spikependium?.familiarHelpReservation === reservations.get(activity.actor.uuid)) return;
  ui.notifications.warn("Друг-помощник выбирается в штатном окне проверки навыка.");
  return false;
}
export async function consumeFamiliarHelp(wrapped, rolls, config = {}, message = {}, ...args) {
  if (!rolls.length || !config.spikependium?.familiarHelp || config.spikependium.familiarHelp === "none" || config.evaluate === false)
    return wrapped(rolls, config, message, ...args);
  const actor = config.subject;
  if (!valid(rolls, config) || reservations.has(actor.uuid) || message.create === false) { rolls.splice(0); return; }
  const reservation = Symbol(); reservations.set(actor.uuid, reservation);
  try {
    const updates = await resource(actor).consume({ consume: { resources: true, spellSlot: false, action: false },
      spikependium: { familiarHelpReservation: reservation } }, message);
    if (!updates) { rolls.splice(0); return; }
    foundry.utils.setProperty(message, "data.flags.spikependium.familiarHelp", { familiar: config.spikependium.familiarHelp, skill: config.skill });
    return await wrapped(rolls, config, message, ...args);
  } catch (error) {
    rolls.splice(0); console.error("Spikependium: Друг-помощник", error);
    ui.notifications.error("Не удалось завершить проверку с фамильяром. Проверьте расход применения перед повтором.");
  } finally { reservations.delete(actor.uuid); }
}

export async function cleanArcanaDodge() {
  if (game.users.activeGM ? !game.user.isActiveGM : !game.user.isGM) return;
  const actors = new Set([...game.actors, ...[...game.scenes].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean));
  for (const actor of actors) {
    if (!actor.isOwner || !incapacitated(actor) && actor.system.attributes.movement?.max !== 0) continue;
    const ids = actor.effects.filter(e => e.flags.spikependium?.arcanaDodge).map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  }
}
