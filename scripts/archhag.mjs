import { tokensDistance, incapacitated } from "./effects.mjs";

const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const live = effect => effect.active && !effect.duration.expired;
function sourceToken(activity, message) {
  const speaker = message?.data?.speaker;
  if (speaker?.scene && speaker?.token) return resolve(`Scene.${speaker.scene}.Token.${speaker.token}`);
  if (activity.actor.token) return activity.actor.token;
  const controlled = (globalThis.canvas?.tokens?.controlled ?? []).map(t => t.document ?? t).filter(t => t.actor?.uuid === activity.actor.uuid);
  if (controlled.length === 1) return controlled[0];
  const tokens = activity.actor.getActiveTokens?.(false, true) ?? [];
  return tokens.length === 1 ? tokens[0] : undefined;
}
export function isHag(actor) {
  return !!actor?.system.isCreature && (/^actor:mm25:.*hag$/.test(actor.flags?.spikependium?.key ?? "")
    || (["fey", "fiend"].includes(actor.system.details?.type?.value)
      && [actor.name, actor.flags?.spikependium?.originalName].some(name => /\bhag\b|\barchhag\b|карг/i.test(name ?? ""))));
}
export function covenAvailable(source) {
  if (!source?.actor || ![-1, 1].includes(source.disposition)) return false;
  const actors = new Set();
  for (const token of source.parent.tokens) {
    const distance = tokensDistance(source, token);
    if (token.actor?.uuid !== source.actor.uuid && token.disposition === source.disposition && isHag(token.actor)
      && !token.actor.statuses.has("dead") && Number.isFinite(distance) && distance <= 30) actors.add(token.actor.uuid);
  }
  return actors.size >= 2;
}
export function prepareCovenDialog(activity, config, dialog) {
  if (activity?.actor?.flags?.spikependium?.key !== "actor:mm25:archhag" || activity.item.system.identifier !== "archhag-coven") return;
  const Base = dialog.applicationClass;
  if (!Base) return;
  dialog.configure = true;
  dialog.applicationClass = class extends Base {
    async _prepareConsumptionContext(context, options) {
      context = await super._prepareConsumptionContext(context, options);
      context.fields.push({ name: "spikependium.covenManual", value: this.config.spikependium?.covenManual ?? false,
        field: new foundry.data.fields.BooleanField({ label: "Подтверждаю двух других союзных карг в 30 футах",
          hint: "Для нейтральных токенов, необычных союзов, переименованных карг или игры без карты. Общее применение расходуется штатно." }),
        input: context.inputs.createCheckboxInput });
      return context;
    }
  };
}
export function cursedByArchhag(actor, source) {
  return actor.effects.some(effect => live(effect) && effect.flags.spikependium?.archhagCurse
    && effect.statuses.has("cursed") && (effect.system.origin?.actor === source.actor.uuid
      || resolve(effect.system.origin?.activity)?.actor?.uuid === source.actor.uuid));
}
export function prepareArchhagTargets(activity, config, dialog, message) {
  if (activity?.actor?.flags?.spikependium?.key !== "actor:mm25:archhag" || activity.item.system.identifier !== "archhag-witch-strike") return;
  const source = sourceToken(activity, message);
  if (source?.actor?.uuid !== activity.actor.uuid) return;
  const targets = [...source.parent.tokens].filter(token => {
    const distance = tokensDistance(source, token);
    return token.actor?.system.isCreature && !token.actor.statuses.has("dead") && (game.user.isGM || !token.hidden)
      && Number.isFinite(distance) && distance <= 60 && cursedByArchhag(token.actor, source);
  });
  message.data ??= {}; message.data.system ??= {};
  message.data.system.targets = targets.map(token => ({ actor: token.actor.uuid, token: token.uuid, name: token.name, img: token.texture?.src }));
  if (source.hidden || targets.some(token => token.hidden)) {
    message.rollMode = "gm";
    message.data.whisper = game.users.filter(user => user.isGM).map(user => user.id);
  }
}
export function canUseArchhag(activity, config, dialogOrMessage, usageMessage) {
  const actor = activity?.actor;
  if (!actor) return true;
  if (activity.item.type === "spell" && activity.item.system.properties.has("vocal")
    && actor.effects.some(effect => live(effect) && effect.flags.spikependium?.noVerbalSpells)) {
    ui.notifications.warn("Проклятие Скороговорки запрещает заклинания со словесным компонентом."); return false;
  }
  if (actor.flags?.spikependium?.key !== "actor:mm25:archhag") return true;
  if (incapacitated(actor) || actor.system.attributes.hp.value <= 0) return false;
  const identifier = activity.item.system.identifier;
  if (!["archhag-coven", "archhag-witch-strike"].includes(identifier)) return true;
  // shortcut: Foundry dispositions/names cannot express every coven; explicit confirmation covers narrative allies.
  if (identifier === "archhag-coven" && (usageMessage || config?.spikependium?.covenManual === true)) return true;
  const message = usageMessage ?? dialogOrMessage, source = sourceToken(activity, message);
  if (!source?.actor || source.actor.uuid !== actor.uuid) return false;
  if (identifier === "archhag-coven") {
    if (covenAvailable(source)) return true;
    ui.notifications.warn("Для Магии ковена нужны две другие союзные карги в 30 футах. Проверьте токены, имена карг и принадлежность сторон."); return false;
  }
  const targets = message?.data?.system?.targets ? message.data.system.targets.map(t => resolve(t.token))
    : [...game.user.targets].map(t => t.document ?? t);
  if (targets.length && targets.every(token => {
    const distance = token && tokensDistance(source, token);
    return token?.actor && token.parent === source.parent && Number.isFinite(distance) && distance <= 60 && cursedByArchhag(token.actor, source);
  })) return true;
  ui.notifications.warn("Для Удара ведьмы выберите существ в 60 футах, проклятых именно этой каргой."); return false;
}
