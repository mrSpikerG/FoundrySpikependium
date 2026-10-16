import { radiantLightUpdate } from "./mechanics.mjs";
import { stormStaffGlowing } from "./griffon-staves.mjs";
import { bootsLight } from "./griffon-two-boots.mjs";

let syncing = false;
const active = item => item.system.equipped && (item.system.attunement !== "required" || item.system.attuned);
function feet(item) {
  if (bootsLight(item)) return bootsLight(item);
  const f = item.flags.spikependium;
  if (stormStaffGlowing(item)) return 10;
  if (f?.griffonFocus === "whispers" && f.focusFlame && !f.focusRuin) return 5;
  if (f?.griffonTwoWeapon === "first-light" && f.firstLightOn) return 20;
  if (f?.griffonTwoWeapon === "pumpkin" && f.pumpkinNight) return 20;
  if (f?.griffonTwoWeapon === "eclipse" && f.eclipseMoonlight) return 15;
}
export async function syncWeaponLights() {
  if (syncing || (game.users.activeGM && !game.user.isActiveGM)) return; syncing = true;
  try {
    for (const scene of game.scenes ?? []) {
      const units = scene.grid.units; if (!(units in CONFIG.DND5E.movementUnits)) continue;
      const convert = ft => dnd5e.utils.convertLength(ft, "ft", units), legacy = { bright: convert(30), dim: convert(60) };
      for (const token of scene.tokens) {
        if (!token.isOwner) continue;
        const desired = new Map([...(token.actor?.items ?? [])].filter(active).filter(i => feet(i))
          .map(i => [`gs2-light:${i.uuid}`, { bright: convert(feet(i)), dim: convert(feet(i) * 2) }]));
        const previous = token.flags.spikependium?.radiantLight, old = previous?.items ?? (previous ? [previous.itemUuid] : []);
        for (const id of new Set([...old.filter(id => id?.startsWith("gs2-light:")), ...desired.keys()])) {
          const value = desired.get(id), update = radiantLightUpdate(token, id, value?.bright ?? 0, value?.dim ?? 0, !!value, legacy);
          if (update["light.bright"] === token.light.bright && update["light.dim"] === token.light.dim
            && JSON.stringify(update["flags.spikependium.radiantLight"]) === JSON.stringify(token.flags.spikependium?.radiantLight)) continue;
          await token.update(update);
        }
      }
    }
  } finally { syncing = false; }
}
