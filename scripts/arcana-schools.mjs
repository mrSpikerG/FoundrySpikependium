const school = item => item?.type === "feat" && item.flags.spikependium?.schoolAdept;
const maxSlot = actor => Math.max(0, ...Object.entries(actor.system.spells ?? {}).filter(([key,s]) => /^(spell[1-9]|pact)$/.test(key) && s.max > 0)
  .map(([key,s]) => key === "pact" ? s.level ?? 0 : Number(key.slice(5))));
const allowed = (item, actor) => school(item)?.spells.filter(s => s.level <= maxSlot(actor)).map(s => s.uuid) ?? [];
const resolve = uuid => uuid && fromUuidSync(uuid,{strict:false});
const grant = item => item.system.advancement.find(a => a.type === "ItemGrant");
const authority = actor => game.users.activeGM ? game.user.isActiveGM : [...game.users].filter(u => u.active && actor.testUserPermission(u,"OWNER"))
  .sort((a,b) => a.id.localeCompare(b.id))[0]?.id === game.user.id;
export function schoolASICanImprove(wrapped,ability) {
  if (!school(this.item) || !this.actor) return wrapped(ability);
  return ["int","wis","cha"].includes(ability)
    && (this.actor.system._source.abilities[ability].value < 20 || (this.value.assignments?.[ability] ?? 0) > 0) && wrapped(ability);
}
export function schoolASIApply(wrapped,level,data,options={}) {
  if (!school(this.item)) return wrapped(level,data,options);
  if (data.type === "feat") throw Error("Адепт школы позволяет только +1 к Интеллекту, Мудрости или Харизме");
  const previous = this.value.assignments ?? {}, deltas = data.assignments ?? {};
  const next = {...previous};
  for (const [ability,delta] of Object.entries(deltas)) {
    if (!delta) continue;
    if (!["int","wis","cha"].includes(ability) || !Number.isInteger(delta)
      || delta > 0 && this.actor.system._source.abilities[ability].value + delta > 20) throw Error("Адепт школы: недопустимое повышение характеристики или превышение 20");
    next[ability] = (next[ability] ?? 0) + delta;
  }
  if (Object.values(next).some(n => n < 0 || n > 1) || Object.values(next).reduce((sum,n)=>sum+n,0) > 1)
    throw Error("Адепт школы даёт суммарно одно очко характеристики");
  return wrapped(level,data,options);
}
export async function schoolGrantApply(wrapped, level, data = {}, options = {}) {
  if (!school(this.item)) return wrapped(level, data, options);
  const available = allowed(this.item, this.actor), choices = data.selected ?? (options.initial ? this.configuration.items.map(s => s.uuid) : Object.keys(data.retainedData ?? {}));
  const selected = choices.filter(uuid => available.includes(uuid)), result = await wrapped(level, { ...data, selected }, options);
  if (!selected.length && !Object.hasOwn(this.value,"added")) {
    this.updateSource({"value.added":{}}); return {...result,"value.added":{}};
  }
  return result;
}
const running = new Set(), pending = new Set();
async function syncActor(actor) {
  if (!actor?.isOwner || !actor.items.some(school) || !authority(actor)) return;
  if (running.has(actor.uuid)) { pending.add(actor.uuid); return; } running.add(actor.uuid);
  try { do {
    pending.delete(actor.uuid);
    for (const feat of actor.items.filter(school)) {
      const available = allowed(feat, actor), advancement = grant(feat); if (!advancement) continue;
      const root = `${feat.id}.${advancement.id}`, spellUUIDs = school(feat).spells.map(s => s.uuid);
      const linked = actor.items.filter(i => i.type === "spell" && i.flags.dnd5e?.advancementOrigin === root
        && spellUUIDs.includes(i.flags.dnd5e?.sourceId ?? i._stats?.compendiumSource));
      const added = Object.fromEntries(linked.map(i => [i.id,i.flags.dnd5e?.sourceId ?? i._stats.compendiumSource]));
      const missing = available.filter(uuid => !Object.values(added).includes(uuid));
      const repair = JSON.stringify(advancement.value.added ?? {}) !== JSON.stringify(added);
      const signature = JSON.stringify(feat.toObject().system.advancement), itemUpdates = [];
      for (const [id,uuid] of Object.entries(added)) {
        const item = actor.items.get(id);
        if (!item || item.flags.dnd5e?.advancementOrigin !== `${feat.id}.${advancement.id}`) continue;
        const prepared = available.includes(uuid) ? 2 : 0;
        if (item.system.prepared !== prepared) itemUpdates.push({_id:id,"system.prepared":prepared});
      }
      if (missing.length || repair) {
        const clone = actor.clone({}, {keepId:true}), cloned = clone.items.get(feat.id), a = grant(cloned);
        const data = cloned.toObject().system.advancement; data.find(v => v._id === a.id).value.added = added;
        cloned.updateSource({"system.advancement":data});
        if (missing.length) await grant(cloned).apply(0,{selected:missing},{initial:true});
        const created = [...clone.items].filter(i => !actor.items.has(i.id) && i.flags.dnd5e?.advancementOrigin === `${feat.id}.${advancement.id}`).map(i => i.toObject());
        if (missing.some(uuid => !created.some(i => i.flags.dnd5e?.sourceId === uuid))) throw Error("Не найдено одно из заклинаний Адепта школы в установленной библиотеке dnd5e");
        if (JSON.stringify(feat.toObject().system.advancement) !== signature || JSON.stringify(available) !== JSON.stringify(allowed(feat,actor))) { pending.add(actor.uuid); continue; }
        if (actor.items.get(feat.id) !== feat || !authority(actor)) continue;
        if (created.length || repair) await actor.performBulkUpdate({create:created,item:[...itemUpdates,{_id:feat.id,"system.advancement":cloned.toObject().system.advancement}]});
      } else if (itemUpdates.length) await actor.updateEmbeddedDocuments("Item",itemUpdates);
    }
  } while (pending.delete(actor.uuid)); } finally {running.delete(actor.uuid);}
}
export async function syncSchoolSpells(document) {
  const actor = document?.documentName === "ActorDelta" ? document.parent?.actor : document?.documentName === "Actor" ? document : document?.actor;
  if (document && !actor) return;
  const actors = actor ? [actor] : [...new Map([...game.actors,...[...game.scenes].flatMap(s => [...s.tokens].map(t => t.actor))].filter(Boolean).map(a=>[a.uuid,a])).values()];
  for (const a of actors) await syncActor(a);
}
export function canUseSchoolSpell(activity) {
  const item = activity?.item, id = item?.flags.dnd5e?.advancementOrigin;
  if (!id || item.type !== "spell" || !item.system.sourceItem?.startsWith("feat:school-adept-")) return;
  const feat = activity.actor?.items.get(id.split(".")[0]), info = school(feat);
  if (info && allowed(feat,activity.actor).includes(item.flags.dnd5e?.sourceId ?? item._stats?.compendiumSource)) return;
  ui.notifications.warn("Заклинание Адепта школы недоступно: нет исходной черты или ячеек нужного уровня."); return false;
}
export function schoolSlotRecharge(activity, _config, updates) {
  // shortcut: concurrent casts on different clients share native non-atomic resource saves; coordinate simultaneous uses with the GM.
  if (activity.item?.type !== "spell" || activity.item.system.school !== "div") return updates;
  const adepts = activity.actor.items.filter(i => school(i)?.school === "div" && i.system.uses.spent > 0);
  if (!adepts.length) return updates;
  const paid = Object.entries(foundry.utils.flattenObject(updates.actor)).some(([path,value]) => /^system\.spells\.(spell[1-9]|pact)\.value$/.test(path)
    && Number.isFinite(value) && value < foundry.utils.getProperty(activity.actor,path));
  if (!paid) return updates;
  for (const item of adepts) {
    let update = updates.item.find(u => u._id === item.id); if (!update) updates.item.push(update = {_id:item.id});
    update["system.uses.spent"] = 0;
  }
  return updates;
}
function concentrationBonus(config) {
  if (!(config.isConcentration || config.saveType === "concentration") || config.ability !== "con") return;
  const actor = config.subject, feat = actor.items.find(i => school(i)?.school === "con"); if (!feat) return;
  const effects = actor.effects.filter(e => e.active && !e.duration.expired && !(Number.isFinite(e.duration.remaining) && e.duration.remaining <= 0) && e.system.type === "concentrating");
  // shortcut: several simultaneous concentrations require separate saves; keep their shared roll under GM control.
  if (effects.length !== 1) return;
  const origin = effects[0].flags.dnd5e?.activity?.uuid, activity = resolve(origin);
  if (activity?.item?.system.school !== "con") return;
  const assignments = feat.system.advancement.find(a => a.type === "AbilityScoreImprovement")?.value.assignments ?? {};
  const ability = ["int","wis","cha"].find(a => assignments[a] === 1), bonus = actor.system.abilities[ability]?.mod;
  if (!Number.isFinite(bonus)) return;
  return { feat:feat.uuid, spell:origin, ability, bonus };
}
export function prepareSchoolConcentration(config) {
  const info = concentrationBonus(config);
  for (const roll of config.rolls ?? []) {
    roll.parts = (roll.parts ?? []).filter(p => p !== "@spikependiumSteadfastConjuration");
    roll.data ??= {}; delete roll.data.spikependiumSteadfastConjuration;
    roll.options ??= {}; delete roll.options.spikependiumSteadfastConjuration;
    if (!info) continue;
    roll.parts.push("@spikependiumSteadfastConjuration"); roll.data.spikependiumSteadfastConjuration = info.bonus;
    roll.options.spikependiumSteadfastConjuration = info;
  }
}
export function buildSchoolConcentration(config,roll) {
  prepareSchoolConcentration({...config,ability:roll.data?.abilityId ?? config.ability,rolls:[roll]});
}
export function finalizeSchoolConcentration(rolls,config) {
  for (const roll of rolls) {
    const marked = roll.options.spikependiumSteadfastConjuration; if (!marked) continue;
    const info = concentrationBonus({...config,ability:roll.data?.abilityId ?? config.ability});
    if (JSON.stringify(info) !== JSON.stringify(marked) || roll.data.spikependiumSteadfastConjuration !== info?.bonus) {
      ui.notifications.warn("Стойкий призыв: концентрация или выбранная характеристика изменились. Повторите спасбросок."); return false;
    }
  }
}
export function schoolError(error) {
  console.error("Spikependium: Адепты школ",error);
  ui.notifications.error("Не удалось обновить заклинания Адепта школы. Проверьте шаг выдачи заклинаний на черте; повторное подключение продолжит обработку.");
}
