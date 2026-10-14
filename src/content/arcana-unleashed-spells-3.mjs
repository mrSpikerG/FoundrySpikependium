import { utility, effect } from "../../tools/lib/core.mjs";
import { spell, folder } from "../../tools/lib/docs.mjs";

export function define() {
  const evasion = effect("spell:au:aura-of-evasion", { name: "Аура увёртливости", transfer: false,
    img: "icons/magic/defensive/shield-barrier-glowing-triangle-blue", flags: { spikependium: { arcanaSpell: "aura-of-evasion" } } });
  evasion.system.magical = true;
  spell({ key: "spell:au-aura-of-evasion", identifier: "aura-of-evasion", name: "Аура увёртливости", book: "AU", page: 35,
    folder: folder("spells", "7 уровень", { sort: 8000 }), level: 7, school: "abj", img: evasion.img,
    rangeUnits: "self", components: "ВС", concentration: true, duration: "minute", durationValue: 1, effects: [evasion],
    desc: `*Списки: волшебник, колдун, чародей.*

В течение минуты концентрации от вас исходит 30-футовая эманация. Вы и ваши союзники внутри неё совершаете спасброски Ловкости с преимуществом. Если эффект позволяет спасброском Ловкости уменьшить урон вдвое, защищённое существо получает нулевой урон при успехе и половину при провале. Недееспособные существа этой защиты не получают.

**Применение.** Накладывание расходует ячейку и создаёт личный эффект с концентрацией. В обычном окне спасброска Ловкости выберите ауру и подтвердите союзность и распространение эманации до вашего токена. Для своей ауры подтверждение уже выбрано. Модуль проверяет конкретные токены, расстояние 30 футов с учётом высоты и единиц сцены, активность этого накладывания и недееспособность. Преимущество сочетается со штатной помехой. Урон из связанной карточки спасброска с правилом «половина при успехе» пересчитывается перед сопротивлениями и округлением. Несколько аур и Увёртливость не уменьшают его повторно. Другие характеристики и эффекты без такого спасброска не затрагиваются. Союзность и препятствия подтверждает Мастер; вне сцены спасбросок и уменьшение урона обрабатываются вручную.`,
    acts: [utility("spell:au-aura-of-evasion:cast", { name: "Создать ауру увёртливости", activation: "action", self: true,
      template: { type: "emanation", size: 30 }, duration: "minute", durationValue: 1, concentration: true, effects: [evasion._id] })]
  });
  const amity = effect("spell:au:zone-of-amity", { name: "Область дружелюбия", transfer: false,
    img: "icons/skills/social/diplomacy-handshake-yellow", flags: { spikependium: { arcanaSpell: "zone-of-amity" } } });
  amity.system.magical = true;
  spell({ key: "spell:au-zone-of-amity", identifier: "zone-of-amity", name: "Область дружелюбия", book: "AU", page: 44,
    folder: folder("spells", "4 уровень", { sort: 5000 }), level: 4, school: "enc", img: amity.img,
    rangeUnits: "self", components: "ВС", duration: "minute", durationValue: 10, effects: [amity],
    desc: `*Списки: бард, колдун.*

Пока заклинание активно, от вас исходит магическая область дружелюбия 60-футовой эманацией. Когда вы совершаете проверку характеристики, чтобы повлиять на существо в этой области, при результате к20 9 и ниже вы можете считать, что выпало 10.

**Применение.** Накладывание автоматически создаёт личный магический эффект на 10 минут без концентрации. Перед проверкой отметьте токен существа, на которое влияете. В обычном окне проверки выберите это существо и подтвердите, что проверка направлена на влияние на него. Модуль проверяет активность именно вашего накладывания и расстояние 60 футов с учётом высоты и единиц карты. Штатный минимум к20 становится равным 10; остальные бонусы, преимущество, помеха и более высокий минимум сохраняются. Эффект не даёт минимум 10 для всех проверок и не распространяется на атаки или спасброски. Влияние в данной ситуации разрешает Мастер.`,
    acts: [utility("spell:au-zone-of-amity:cast", { name: "Создать область дружелюбия", activation: "action", self: true,
      template: { type: "emanation", size: 60 }, duration: "minute", durationValue: 10, concentration: false, effects: [amity._id] })]
  });
}
