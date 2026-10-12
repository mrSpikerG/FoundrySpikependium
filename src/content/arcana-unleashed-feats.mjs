import { advItemGrant, advItemChoice, spellConfig, srdSpellUuid, utility, LR, useActivity } from "../../tools/lib/core.mjs";
import { feat, folder } from "../../tools/lib/docs.mjs";

export function define() {
  const F = folder("feats", "Неудержимая магия/Происхождение");
  feat({ key: "feat:magic-speaker", name: "Магический оратор", identifier: "magic-speaker", subtype: "origin", folder: F,
    book: "AU", page: 28, img: "icons/skills/social/diplomacy-handshake-yellow",
    desc: "**Заговор.** Вы изучаете заговор [[Злая насмешка]]. Интеллект, Мудрость или Харизма является вашей заклинательной характеристикой для него (выберите при выборе черты).\n\n**Говорун.** Когда вы совершаете проверку Харизмы (Обман, Запугивание или Убеждение), вы можете бросить 1к4 и добавить результат к этой проверке.",
    advancement: [advItemGrant("au:magic-speaker:cantrip", 0, [srdSpellUuid("Vicious Mockery")], {
      title: "Заговор: Злая насмешка", spell: spellConfig({ abilities: ["int", "wis", "cha"] }) })]
  });
  const inspired = utility("au:magic-undertaker:inspiration", { name: "Понимание смерти", activation: "special",
    condition: "Вы успешно стабилизировали существо с 0 хитами действием Помощь", self: true,
    usesMax: 1, usesRecovery: [LR], consume: [useActivity()] });
  inspired.flags = { spikependium: { heroicInspirationSelf: true } };
  feat({ key: "feat:magic-undertaker", name: "Магический могильщик", identifier: "magic-undertaker", subtype: "origin", folder: F,
    book: "AU", page: 28, img: "icons/magic/death/skull-humanoid-crown-white-blue",
    desc: "**Заговор.** Вы изучаете один заговор школы некромантии из списка Волшебника или Жреца. Интеллект, Мудрость или Харизма является вашей заклинательной характеристикой для него (выберите при выборе черты).\n\n**Знания от мёртвых.** Когда вы совершаете проверку Интеллекта (История) или Мудрости (Медицина), вы можете бросить 1к4 и добавить результат к этой проверке.\n\n**Понимание смерти.** Когда вы совершаете действие Помощь для стабилизации существа с 0 хитами, вы получаете Героическое вдохновение. После использования этого преимущества вы должны завершить долгий отдых, чтобы воспользоваться им снова.",
    advancement: [advItemChoice("au:magic-undertaker:cantrip", 0, { title: "Заговор некромантии Волшебника или Жреца", count: 1,
      type: "spell", restrictType: "spell", list: ["wizard", "cleric"], spellLevel: "0", school: ["nec"],
      pool: [srdSpellUuid("Chill Touch"), srdSpellUuid("Spare the Dying")], spell: spellConfig({ abilities: ["int", "wis", "cha"] }),
      hint: "Выберите подходящий заговор; можно перетащить другой заговор некромантии из указанных списков своей книги." })],
    acts: [inspired]
  });
}
