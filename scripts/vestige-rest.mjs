import { vestigeTokens, pocketArchives } from "./pocket.mjs";
import { isVestigePower } from "./summons.mjs";

const KEY = "subclass:vestige-patron:vestige-companion";
const recovering = new Set();
const feature = owner => owner.items.find(i => i.flags.spikependium?.key === KEY);

export async function recordVestigeRest(owner, result, config) {
  if (!["short", "long"].includes(config.type) || !feature(owner) || (owner.classes.warlock?.system.levels ?? 0) < 6) return;
  await owner.setFlag("spikependium", "vestigeRecovery", { event: foundry.utils.randomID(), state: "pending" });
}

async function restorePower(owner) {
  const item = feature(owner);
  if (!item || (owner.classes.warlock?.system.levels ?? 0) < 6) return;
  const actors = new Map([...vestigeTokens(item).map(t => t.actor), ...pocketArchives(item)
    .filter(a => a.flags.spikependium.vestigePocket.state === "pocket")].map(a => [a.uuid, a]));
  await owner.setFlag("spikependium", "vestigePowerSpent", 0);
  for (const actor of actors.values()) {
    const updates = actor.items.filter(i => isVestigePower(i) && i.system.uses.spent > 0)
      .map(i => ({ _id: i.id, "system.uses.spent": 0 }));
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  }
}

export async function finishVestigeRecovery() {
  if (!game.user.isActiveGM) return;
  const owners = new Map([...game.actors, ...[...game.scenes].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean).map(a => [a.uuid, a]));
  for (const owner of owners.values()) {
    const record = owner.flags.spikependium?.vestigeRecovery;
    if (record?.state !== "pending" || recovering.has(owner.uuid)) continue;
    recovering.add(owner.uuid);
    try {
      await restorePower(owner);
      if (owner.flags.spikependium?.vestigeRecovery?.event === record.event)
        await owner.setFlag("spikependium", "vestigeRecovery.state", "done");
    } finally { recovering.delete(owner.uuid); }
  }
}

export async function recordVestigeCunning(activity, config, results) {
  const owner = activity?.actor;
  if (activity?.item.system.identifier !== "magical-cunning" || !owner.isOwner
    || !feature(owner) || (owner.classes.warlock?.system.levels ?? 0) < 6) return;
  const event = results.message?.uuid ?? foundry.utils.randomID();
  if (owner.flags.spikependium?.vestigeRecovery?.event === event) return;
  await owner.setFlag("spikependium", "vestigeRecovery", { event, state: "pending" });
}

export async function recordVestigePowerSpent(item, changed) {
  if (!game.user.isActiveGM || !isVestigePower(item) || changed["system.uses.spent"] == null && changed.system?.uses?.spent == null) return;
  const source = item.actor, uuid = source?.flags.dnd5e?.summon?.origin;
  const origin = uuid && fromUuidSync(uuid);
  if (origin?.flags.spikependium?.key !== KEY || ![...vestigeTokens(origin).map(t => t.actor), ...pocketArchives(origin)].includes(source)) return;
  await origin.actor.setFlag("spikependium", "vestigePowerSpent", Math.min(1, Math.max(0, item.system.uses.spent)));
}
