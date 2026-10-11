// Нативные ссылки Foundry/dnd5e в описаниях, включая HTML и таблицы.
import { change, effect, makeId } from "./core.mjs";

const STOP = [change("system.attributes.movement.multiplier", 0, "override")];
// Явные эффекты из правил UA; упоминание состояния в описании само по себе не означает его наложение.
export const ACTIVITY_EFFECTS = {
  "arcane-archer:shot:banishing": { statuses: ["incapacitated"], expiry: "targetEnd", changes: STOP },
  "arcane-archer:shot:beguiling": { statuses: ["charmed"], expiry: "sourceStart" },
  "arcane-archer:shot:enfeebling": { statuses: ["poisoned"], expiry: "targetEnd" },
  "arcane-archer:shot:grasping": { statuses: ["restrained"], expiry: "sourceStart" },
  "arcane-archer:shot:shadow": { statuses: ["blinded"], expiry: "targetEnd" },
  "enchanter:hypnotic": { statuses: ["charmed", "incapacitated"], seconds: 60, changes: STOP, flags: { spikependium: { endsOnDamage: true } } },
  "enchanter:hypnotic:slot": { statuses: ["charmed", "incapacitated"], seconds: 60, changes: STOP, flags: { spikependium: { endsOnDamage: true } } },
  "magic-stealer:interrupt": { statuses: ["stunned"], expiry: "targetStart" },
  "lament:wail": { statuses: ["deafened"], seconds: 60 },
  "lament:terrify": { statuses: ["frightened"], expiry: "sourceStart" },
  "scion:strike-fear": { statuses: ["frightened"], seconds: 60 },
  "venom:breath": { statuses: ["frightened"], seconds: 60 },
  "winter-walker:retribution": { statuses: ["frightened"], expiry: "sourceEnd", changes: STOP },
  "lich:paralyze": { statuses: ["paralyzed"], expiry: "sourceStart" },
  "pestilence:burst:shock": { statuses: ["incapacitated"], expiry: "targetEnd", changes: STOP },
  "titan:shockwave": { statuses: ["prone"] },
  "titan:shockwave:slot": { statuses: ["prone"] },
  "titan:swallow": { statuses: ["blinded", "restrained"] },
  "actor:behemoth:rampage": { statuses: ["prone"] },
  "actor:leviathan:stench": { statuses: ["poisoned"], expiry: "targetStart" },
  "ancestral:majesty": { statuses: ["prone"], expiry: "sourceEnd" },
  "ancestral:majesty:fear": { statuses: ["frightened"], expiry: "sourceEnd" },
  "genies:smite:dao": { statuses: ["grappled", "restrained"] },
  "genies:smite:djinni": { expiry: "sourceEnd", changes: [
    change("system.traits.ci.value", "grappled"), change("system.traits.ci.value", "prone"), change("system.traits.ci.value", "restrained")
  ] },
  "genies:smite:marid": { statuses: ["prone"] },
  "demonic:aura:web": { statuses: ["restrained"] },
  "demonic:aura:slime": { statuses: ["prone"] },
  "demonic:aura:screams": { statuses: ["frightened"], expiry: "targetStart" },
  "demonic:aura:spores": { statuses: ["charmed"], expiry: "targetStart" },
  "demonic:aura:foliage": { statuses: ["poisoned"], expiry: "targetStart" },
  "psykinetic:acceleration": { expiry: "sourceStart", changes: [change("system.attributes.movement.speeds.walk", 10)] },
  "undead:dread:fear": { statuses: ["frightened"], expiry: "sourceEnd" },
  "hexblade:explosive": { expiry: "sourceStart", changes: [change("system.attributes.movement.bonus", "- 10")] },
  "hell-knight:minauros:poison": { statuses: ["poisoned"], expiry: "targetStart" },
  "psion:discipline:psionic-ward:use": { expiry: "sourceStart", changes: [
    change("system.traits.ci.value", "charmed"), change("system.traits.ci.value", "frightened"),
    change("system.abilities.int.save.roll.mode", 1)
  ] }
};
const EFFECT_BY_ACTIVITY = new Map(Object.entries(ACTIVITY_EFFECTS).map(([key, rule]) => [makeId(`activity:${key}`), { key, ...rule }]));
const DAMAGE_TYPES = {
  "дробящего": "bludgeoning", "колющего": "piercing", "рубящего": "slashing",
  "кислотой": "acid", "холодом": "cold", "огнём": "fire", "огнем": "fire",
  "электричеством": "lightning", "излучением": "radiant", "ядом": "poison", "звуком": "thunder",
  "некротической энергией": "necrotic", "психической энергией": "psychic", "силовым полем": "force"
};
export function inlineRolls(html = "") {
  // Не меняем атрибуты HTML, UUID, уже готовые броски и их подписи.
  return html.split(/(<[^>]*>|\[\[[\s\S]*?\]\](?:\{[^}]*\})?|@[A-Za-z]+\[[^\]]*\](?:\{[^}]*\})?)/g)
    .map((part, i) => i % 2 ? part : part.replace(/(?<![\wа-яё])(\d+[кd]\d+(?:\s*[+−-]\s*\d+)?)(?![\wа-яё])/giu,
      (label, dice, offset, text) => {
        const formula = label.replace(/[кКD]/g, "d").replace(/−/g, "-").replace(/\s/g, "");
        const after = text.slice(offset + label.length).toLowerCase();
        const type = Object.entries(DAMAGE_TYPES).find(([name]) => after.startsWith(` ${name} урона`) || after.startsWith(` урона ${name}`))?.[1];
        return `[[/${type ? `damage ${formula} type=${type}` : `r ${formula}`}]]{${label}}`;
      })).join("");
}

const LABELS = { attack: "Атаковать", check: "Проверка", damage: "Нанести урон", heal: "Лечение", save: "Применить", utility: "Использовать", forward: "Использовать", cast: "Наложить заклинание", summon: "Призвать", transform: "Изменить форму", enchant: "Зачаровать", teleport: "Телепортироваться" };

function enrichItem(item) {
  const acts = Object.values(item.system?.activities ?? {});
  for (const a of [...acts]) {
    const slot = a.consumption.targets.find(t => t.type === "spellSlots" && Number(t.value) > 0);
    if (!slot || Number(slot.target) > 5 || a.consumption.targets.some(t => t.type === "activityUses")) continue;
    const forward = {
      _id: makeId(`activity:${a._id}:pact`), type: "forward", name: `${a.name || item.name} (Магия договора)`,
      sort: a.sort + 1, img: a.img, activity: { id: a._id }, activation: { ...a.activation, override: false },
      consumption: { spellSlot: false, scaling: { allowed: false, max: "" }, targets: a.consumption.targets.map(t => t === slot
        ? { type: "attribute", target: "spells.pact.value", value: t.value, scaling: {} } : t) },
      visibility: { ...a.visibility, identifier: "warlock", level: { min: Number(slot.target) * 2 - 1, max: null } },
      flags: { spikependium: { pact: { minimum: Number(slot.target) } } }
    };
    item.system.activities[forward._id] = forward;
    acts.push(forward);
  }
  for (const a of acts) {
    if (/раз в ход|раз за ход|1\s*\/\s*ход/i.test(`${a.activation.condition} ${a.name}`)) {
      a.flags ??= {};
      a.flags.spikependium ??= {};
      a.flags.spikependium.oncePerTurn = true;
    }
    const rule = EFFECT_BY_ACTIVITY.get(a._id);
    if (!rule) continue;
    const e = effect(`automation:${rule.key}`, { ...rule, name: a.name || item.name, img: item.img, transfer: false,
      description: item.system.description.value });
    e._key = item._key.replace(/^!([^!]+)!/, "!$1.effects!") + `.${e._id}`;
    item.effects.push(e);
    a.effects.push({ _id: e._id, ...(a.type === "save" ? { onSave: false } : {}) });
  }
  const profiles = acts.filter(a => a.type === "enchant").flatMap(a => a.effects);
  if (profiles.length) {
    item.flags ??= {};
    item.flags.dnd5e ??= {};
    item.flags.dnd5e.riders = {
      activity: [...new Set(profiles.flatMap(e => e.riders.activity))],
      effect: [...new Set(profiles.flatMap(e => e.riders.effect))]
    };
  }
  for (const a of acts) {
    // Единственный источник эффекта позволяет снимать форму без дублирования эффектов.
    if (a.type === "utility" && a.target.affects.type === "self" && a.effects.length === 1
      && !a.roll.formula && !a.duration.concentration
      && acts.filter(other => other.effects?.some(e => e._id === a.effects[0]._id)).length === 1
      && item.effects?.some(e => e._id === a.effects[0]._id && !e.transfer)) {
      a.type = "transform";
      delete a.roll;
      a.profiles = [];
      a.settings = null;
      a.transform = { mode: "form", formless: true, customize: false, preset: "" };
      const e = item.effects.find(e => e._id === a.effects[0]._id);
      const seconds = { round: 6, minute: 60, hour: 3600, day: 86400 }[a.duration.units];
      if (e.duration?.value == null && !e.duration?.expiry && seconds && Number(a.duration.value) > 0)
        e.duration = { value: seconds * Number(a.duration.value), units: "seconds", expiry: e.duration?.expiry ?? "turnStart", expired: false };
    }
  }
  if (!acts.length) return;
  // Описание шаблона встраивается в другое оружие: относительные ссылки на его действия были бы неверны.
  if (item.type === "weapon" && !item.system.type.value) return;
  const links = acts.map(a => {
    const label = a.name || LABELS[a.type];
    let link = `[[/item activity=${a._id}]]{${label}}`;
    if (a.healing) link += ` · [[/heal activity=${a._id}]]{Бросок лечения}`;
    else if (a.damage?.parts.length || (a.type === "attack" && a.damage.includeBase && item.system.damage?.base?.number))
      link += ` · [[/damage activity=${a._id}]]{Бросок урона}`;
    if (a.type === "save") link += ` · [[/save activity=${a._id}]]{Спасбросок цели}`;
    return `<li>${link}</li>`;
  });
  item.system.description.value += `<h3>Действия</h3><ul>${links.join("")}</ul><p><em>Использование действия учитывает его расход ресурсов. Отдельный бросок урона или лечения только бросает кости. Временную форму можно снять, выбрав «Без формы»; остальные эффекты включаются и выключаются на вкладке эффектов.</em></p>`;
}

export function enrichDocument(doc) {
  if (doc.system?.activities) enrichItem(doc);
  for (const item of doc.items ?? []) enrichItem(item);
  const walk = obj => {
    if (!obj || typeof obj !== "object") return;
    for (const [key, value] of Object.entries(obj)) {
      if (key === "description" && typeof value === "string") obj[key] = inlineRolls(value);
      else if (key === "description" && typeof value?.value === "string") value.value = inlineRolls(value.value);
      else if (key === "biography") value.value = inlineRolls(value.value);
      else if (key === "text" && typeof value.content === "string") value.content = inlineRolls(value.content);
      else walk(value);
    }
  };
  walk(doc);
  return doc;
}
