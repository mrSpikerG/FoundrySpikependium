import { isVestigePower } from "./summons.mjs";

const dropping = new Set();
const IMAGE = "icons/containers/bags/pack-engraved-leather-tan.webp";
const comparable = data => JSON.stringify(data, (key, value) => key === "_stats" ? undefined : value);
const physicalItems = actor => actor.items.filter(item => item.system.quantity != null);

export async function dropVestigeGear(token) {
  const source = token.actor;
  if (!source?.flags.spikependium?.key?.startsWith("actor:vestige-")) return true;
  if (!game.user.isActiveGM || !source.isOwner || dropping.has(source.uuid)) return false;
  dropping.add(source.uuid);
  try {
    const power = source.items.find(isVestigePower), uuid = source.flags.dnd5e?.summon?.origin;
    const origin = uuid && fromUuidSync(uuid);
    if (power && origin?.flags.spikependium?.key === "subclass:vestige-patron:vestige-companion") {
      const pending = origin.actor.flags.spikependium?.vestigeRecovery?.state === "pending";
      await origin.actor.setFlag("spikependium", "vestigePowerSpent", pending ? 0 : Math.min(1, Math.max(0, power.system.uses.spent)));
    }
    let loot = game.actors.find(a => a.flags.spikependium?.vestigeDrop?.source === token.uuid
      && a.flags.spikependium.vestigeDrop.state === "prepared");
    const items = physicalItems(source).map(i => i.toObject());
    const currency = foundry.utils.deepClone(source.system.currency);
    if (!loot && !items.length && !Object.values(currency).some(n => n > 0)) return true;
    if (!loot) {
      // Сначала постоянная копия у Мастера: исходные вещи остаются целы при ошибке создания или размещения.
      loot = await Actor.implementation.create({ name: `${source.name} — оставленное снаряжение`, type: "group", img: IMAGE,
        ownership: { default: 0 }, items, system: { currency },
        prototypeToken: { name: "Оставленное снаряжение", actorLink: true, texture: { src: IMAGE }, width: 1, height: 1 },
        flags: { spikependium: { vestigeDrop: { source: token.uuid, actor: source.uuid, state: "prepared", items, currency } } }
      }, { keepId: true });
      if (!loot) throw Error("Не удалось сохранить снаряжение реликта");
    }
    const record = loot.flags.spikependium.vestigeDrop;
    if (record.actor !== source.uuid || !loot.isOwner) throw Error("Источник сохранённого снаряжения изменился");
    for (const item of record.items) {
      const current = source.items.get(item._id);
      const copied = loot.items.get(item._id);
      if (!copied || comparable(copied.toObject()) !== comparable(item)
        || (current && comparable(current.toObject()) !== comparable(item))) throw Error("Снаряжение изменилось во время исчезновения");
    }
    const currentCoins = source.system.currency;
    if (Object.values(currentCoins).some(n => n > 0) && comparable(currentCoins) !== comparable(record.currency))
      throw Error("Монеты реликта изменились во время исчезновения");
    if (comparable(loot.system.currency) !== comparable(record.currency)) throw Error("Сохранённые монеты уже изменены");
    if (!token.parent.tokens.some(t => t.id === token.id && t.actor.uuid === source.uuid)) throw Error("Исходный токен исчез до передачи снаряжения");
    if (!token.parent.tokens.some(t => t.actorId === loot.id)) {
      const data = (await loot.getTokenDocument({ x: token.x, y: token.y, elevation: token.elevation,
        level: token.level, hidden: token.hidden, actorLink: true })).toObject();
      const created = await token.parent.createEmbeddedDocuments("Token", [data], { dnd5e: { autoRollNPCHP: "no" } });
      if (!created.length) throw Error("Не удалось оставить снаряжение на сцене");
    }
    const ids = record.items.map(i => i._id).filter(id => source.items.has(id));
    if (ids.some(id => comparable(source.items.get(id).toObject()) !== comparable(record.items.find(i => i._id === id))))
      throw Error("Снаряжение изменилось во время размещения");
    if (ids.length) await source.deleteEmbeddedDocuments("Item", ids);
    if (Object.values(source.system.currency).some(n => n > 0) && comparable(source.system.currency) !== comparable(record.currency))
      throw Error("Монеты изменились до завершения передачи");
    const zero = Object.fromEntries(Object.keys(record.currency).map(key => [key, 0]));
    if (Object.values(source.system.currency).some(n => n > 0)) await source.update({ "system.currency": zero });
    if (physicalItems(source).length || Object.values(source.system.currency).some(n => n > 0))
      throw Error("Не удалось завершить передачу снаряжения");
    await loot.setFlag("spikependium", "vestigeDrop.state", "done");
    return true;
  } catch (error) {
    console.error("Spikependium: оставленное снаряжение реликта", error);
    ui.notifications.error("Исчезновение реликта остановлено: не удалось закончить передачу снаряжения. Проверьте исходный лист и сохранённый инвентарь в разделе персонажей перед ручными действиями.");
    return false;
  } finally { dropping.delete(source.uuid); }
}
