const resolve = uuid => uuid && fromUuidSync(uuid, { strict: false });
const pending = new WeakMap(), using = new Set();
let syncing = false;
const state = message => message?.flags?.spikependium?.riptideShot;
function info(message) {
  const s = state(message), actor = resolve(s?.actor), receipt = actor?.flags.spikependium?.riptideReceipts?.[s?.nonce];
  if (!s || message.getAssociatedActor()?.uuid !== actor?.uuid || receipt?.paid !== 1
    || !message.system.deltas?.actor?.some(d => d.keyPath === `flags.spikependium.riptideReceipts.${s.nonce}.paid` && d.delta === 1)) return;
  return { s, actor, receipt };
}
export function validRiptideWave(activity, config = {}) {
  const message = resolve(config.spikependium?.riptideShot), data = info(message);
  return !!data && data.s.due === true && data.receipt.resolved !== 1 && activity.actor?.uuid === data.actor.uuid
    && activity.flags?.spikependium?.riptideWave === true && activity.item.id === data.s.item._id && activity.id === data.s.wave;
}
export function canUseRiptide(activity, config = {}) {
  if (!activity.flags?.spikependium?.riptideWave) return;
  if (!validRiptideWave(activity, config)) { ui.notifications.warn("Волну разрешайте из оплаченной карточки выстрела, когда наступит следующий ваш ход."); return false; }
}
export function prepareRiptideUpdates(activity, config, updates) {
  const f = activity.flags?.spikependium;
  if (f?.riptideStart) {
    const nonce = foundry.utils.randomID(), path = `flags.spikependium.riptideReceipts.${nonce}.paid`;
    (updates.actor ??= {})[path] = 1;
    const c = game.combat;
    pending.set(activity, { nonce, path, source: true, item: activity.item.toObject?.(),
      start: { time: game.time.worldTime, combat: c?.started ? c.id : null, round: c?.round, turn: c?.turn } });
  } else if (f?.riptideWave) {
    if (!validRiptideWave(activity, config)) return false;
    const shot = resolve(config.spikependium.riptideShot), nonce = state(shot).nonce, path = `flags.spikependium.riptideReceipts.${nonce}.resolved`;
    (updates.actor ??= {})[path] = 1; pending.set(activity, { nonce, path, shot: shot.uuid });
  }
  return updates;
}
export function recordRiptideConsumption(activity, _config, message) {
  const receipt = pending.get(activity); if (!receipt) return; pending.delete(activity);
  const deltas = (((message.data.system ??= {}).deltas ??= {}).actor ??= []);
  const existing = deltas.find(d => d.keyPath === receipt.path);
  if (existing) existing.delta = 1; else deltas.push({ keyPath: receipt.path, delta: 1 });
  ((message.data.flags ??= {}).spikependium ??= {}).riptideReceipt = receipt;
}
export async function finishRiptideUse(activity, results) {
  const message = results?.message, receipt = message?.flags?.spikependium?.riptideReceipt;
  if (!receipt || !activity.actor?.isOwner) return;
  if (receipt.source && activity.flags?.spikependium?.riptideStart) {
    const item = activity.actor.items.get(activity.item.id) ?? activity.item;
    const wave = (receipt.item ? Object.values(receipt.item.system.activities) : [...item.system.activities])
      .find(a => a.flags?.spikependium?.riptideWave); if (!wave) return;
    const template = results.templates?.[0], token = activity.getUsageToken?.(), scene = template?.parent ?? token?.parent;
    if (template) await template.setFlag("spikependium", "riptideShot", message.uuid);
    await message.setFlag("spikependium", "riptideShot", { actor: activity.actor.uuid, nonce: receipt.nonce, item: receipt.item ?? item.toObject(), wave: wave.id ?? wave._id,
      scene: scene?.uuid, template: template?.uuid, point: template ? { x: template.x, y: template.y } : null,
      start: receipt.start });
  } else if (receipt.shot) {
    const shot = resolve(receipt.shot), template = resolve(state(shot)?.template);
    if (info(shot)?.receipt.resolved === 1 && template?.flags.spikependium?.riptideShot === shot.uuid && template.isOwner) await template.delete();
  }
}
export async function useRiptideWave(message) {
  const data = info(message); if (!data || !data.s.due || data.receipt.resolved === 1 || !data.actor.isOwner || using.has(message.uuid)) return;
  if (data.s.scene && canvas.scene?.uuid !== data.s.scene) { ui.notifications.warn("Перейдите на сцену области арбалета-тягуна, чтобы выбрать текущие цели волны."); return; }
  using.add(message.uuid);
  try {
    await message.setFlag("spikependium", "riptideAttempted", true);
    const item = new CONFIG.Item.documentClass(data.s.item, { parent: data.actor }), activity = item.system.activities.get(data.s.wave);
    if (!activity) throw Error("Не найден сохранённый профиль волны арбалета-тягуна.");
    await activity.use({ create: { measuredTemplate: false }, spikependium: { riptideShot: message.uuid } }, {}, {
      data: { speaker: ChatMessage.getSpeaker({ actor: data.actor, scene: resolve(data.s.scene) }), flags: { dnd5e: { item: { data: item.toObject() } } } }
    });
  } catch (error) {
    const latest = info(message);
    if (latest?.receipt.resolved === 1 && ![...game.messages].some(m => m.flags.spikependium?.riptideReceipt?.shot === message.uuid))
      await latest.actor.update({ [`flags.spikependium.riptideReceipts.${latest.s.nonce}.resolved`]: 0 });
    throw error;
  } finally { using.delete(message.uuid); }
}
async function due(message, start) {
  const data = info(message); if (!data || data.receipt.resolved === 1) return;
  const s = data.s;
  if (!s.due) {
    const combat = s.start.combat && game.combats?.get(s.start.combat);
    const ready = combat?.started ? start?.actor?.uuid === s.actor && start.combat.id === combat.id
      && (start.combat.current.round > s.start.round || (start.combat.current.round === s.start.round && start.combat.current.turn > s.start.turn))
      : game.time.worldTime >= s.start.time + 6;
    if (!ready) return;
    await message.setFlag("spikependium", "riptideShot.due", true);
  }
  if (!message.flags.spikependium.riptideAttempted && (!s.scene || canvas.scene?.uuid === s.scene)) await useRiptideWave(message);
}
export async function riptideStartTurn(wrapped, combatant, ...args) {
  const result = await wrapped(combatant, ...args);
  if (!game.user.isActiveGM || !Number.isInteger(this.current?.round) || this.current.round < 1) return result;
  for (const message of game.messages) if (state(message)?.actor === combatant?.actor?.uuid) await due(message, { combat: this, actor: combatant.actor });
  return result;
}
export async function syncRiptide() {
  if (syncing || !game.user.isActiveGM) return; syncing = true;
  try {
    for (const message of game.messages) if (state(message)) {
      const s = state(message);
      if (!info(message)) {
        const template = resolve(s.template);
        if (template?.isOwner && template.flags.spikependium?.riptideShot === message.uuid) await template.delete();
      } else await due(message);
    }
  } finally { syncing = false; }
}
export function riptideButtons(message, html) {
  const data = info(message);
  if (!data?.actor.isOwner || !message.isOwner || !message.isContentVisible || !data.s.due || data.receipt.resolved === 1) return;
  const root = html instanceof HTMLElement ? html : html[0]; if (!root || root.querySelector(".spikependium-riptide")) return;
  const button = document.createElement("button"); button.type = "button"; button.className = "spikependium-riptide"; button.textContent = "Начало следующего хода: разрешить волну";
  button.addEventListener("click", () => { button.disabled = true; useRiptideWave(message).catch(error => console.error("Spikependium: волна арбалета", error)).finally(() => { button.disabled = false; }); }); root.append(button);
}
