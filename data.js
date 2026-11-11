/* Данные игры «Смена на ПВЗ»: смены, типы клиентов, сценарии обслуживания. */
window.PVZ = (function () {
  "use strict";

  /* ---------- случайные числа ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeRng(seed) {
    const r = mulberry32(seed);
    r.int = (n) => Math.floor(r() * n);
    r.pick = (arr) => arr[r.int(arr.length)];
    r.chance = (p) => r() < p;
    r.shuffle = (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = r.int(i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    return r;
  }

  /* ---------- справочники ---------- */
  const FIRST_M = ["Иван", "Пётр", "Сергей", "Андрей", "Максим", "Дмитрий", "Алексей", "Артём", "Николай", "Роман", "Егор", "Павел"];
  const FIRST_F = ["Мария", "Анна", "Ольга", "Елена", "Ирина", "Светлана", "Наталья", "Дарья", "Юлия", "Ксения", "Полина", "Алина"];
  const LAST = ["Соколов", "Иванова", "Петров", "Кузнецова", "Смирнов", "Морозова", "Волков", "Зайцева", "Орлов", "Киселёва", "Фёдоров", "Лебедева", "Гусев", "Титова"];

  const CITIES = ["Москва", "Санкт-Петербург", "Новосибирск", "Казань", "Екатеринбург", "Нижний Новгород", "Краснодар", "Владивосток", "Томск", "Сочи", "Пермь", "Самара"];
  const CATEGORIES = [
    { name: "Книги", weight: 3 },
    { name: "Одежда", weight: 4 },
    { name: "Электроника", weight: 4 },
    { name: "Бытовая техника", weight: 3 },
    { name: "Косметика", weight: 3 },
    { name: "Товары для дома", weight: 3 },
    { name: "Спорт", weight: 2 },
    { name: "Детские товары", weight: 2 }
  ];
  const STATUS_READY = "Готов к выдаче";
  const STATUS_WAY = "В пути";
  const STATUS_STOCK = "Прибыл на склад";
  const STATUS_RETURN = "Оформлен возврат";

  /* ---------- типы клиентов ---------- */
  const ARCHETYPES = {
    friendly: { id: "friendly", title: "Добрый клиент", mood: "happy", patience: 60, skin: "#f7c9a4", shirt: "#7dd3fc", desc: "Приятный человек, улыбается, благодарит за помощь." },
    neutral: { id: "neutral", title: "Обычный клиент", mood: "neutral", patience: 48, skin: "#e8b48c", shirt: "#a3b7c9", desc: "Нейтрален, торопится по своим делам." },
    busy: { id: "busy", title: "Занятой клиент", mood: "neutral", patience: 32, skin: "#d9a06a", shirt: "#94a3b8", desc: "Спешит: у него всего несколько минут." },
    confused: { id: "confused", title: "Растерянный клиент", mood: "neutral", patience: 44, skin: "#f0bd97", shirt: "#c4b5fd", desc: "Путает номера и описания, нужно разобраться терпеливо." },
    conflicting: { id: "conflicting", title: "Конфликтный клиент", mood: "angry", patience: 54, skin: "#e0a878", shirt: "#ef4444", desc: "Раздражён: требует решения и не любит ждать." },
    vip: { id: "vip", title: "Клиент с VIP-картой", mood: "happy", patience: 42, skin: "#f2c6a0", shirt: "#fbbf24", desc: "Постоянный клиент: ждёт приоритета и вежливого общения." }
  };

  /* ---------- реплики сотрудника ---------- */
  const PHRASES = {
    calm: [
      "Понимаю, ситуация неприятная. Давайте разберёмся вместе.",
      "Прошу прощения за неудобства. Сейчас всё посмотрим.",
      "Спасибо, что рассказали. Давайте решим это на месте."
    ],
    blame: [
      "У нас всё по правилам, так уж в Озоне.",
      "Это не к нам, звоните в поддержку.",
      "Это виноват курьер, с ним и разбирайтесь."
    ],
    solve: [
      "Проверю трек-номер по системе и перезвоню вам в течение часа.",
      "Оформлю возврат средств — деньги вернутся на карту.",
      "Посылка готова к выдаче, вот ваш заказ.",
      "Выдаю посылку, проверьте содержимое, пожалуйста."
    ],
    refuse: [
      "Ничего я для вас сделать не могу.",
      "Возврат не оформлю, упаковка вскрыта.",
      "Такого заказа у нас нет, ищите сами."
    ]
  };

  /* ---------- смены ---------- */
  const SHIFTS = [
    {
      id: "morning",
      name: "Утро, будний день",
      subtitle: "Первый рабочий день",
      clients: 5,
      start: "09:00",
      end: "15:00",
      basePay: 2200,
      conflictChance: 0.15,
      types: ["pickup", "pickup", "pickup", "status", "return"]
    },
    {
      id: "day",
      name: "День, будний день",
      subtitle: "Обед и конфликты",
      clients: 7,
      start: "10:00",
      end: "18:00",
      basePay: 2800,
      conflictChance: 0.35,
      types: ["pickup", "pickup", "status", "pickup", "return", "complaint", "pickup"]
    },
    {
      id: "friday",
      name: "Вечер пятницы",
      subtitle: "Все хотят забрать заказы",
      clients: 9,
      start: "14:00",
      end: "22:00",
      basePay: 3400,
      conflictChance: 0.5,
      types: ["pickup", "complaint", "pickup", "status", "pickup", "return", "pickup", "complaint", "pickup"]
    },
    {
      id: "saturday",
      name: "Суббота, пик продаж",
      subtitle: "Очередь до закрытия",
      clients: 12,
      start: "09:00",
      end: "21:00",
      basePay: 4200,
      conflictChance: 0.65,
      types: ["pickup", "pickup", "complaint", "pickup", "status", "pickup", "return", "pickup", "complaint", "pickup", "pickup", "complaint"]
    }
  ];

  /* ---------- генерация заказов ---------- */
  function pickCategory(rng) {
    const total = CATEGORIES.reduce((s, c) => s + c.weight, 0);
    let r = rng() * total;
    for (const c of CATEGORIES) {
      r -= c.weight;
      if (r <= 0) return c.name;
    }
    return CATEGORIES[0].name;
  }

  function makeOrder(rng, index, status, usedCodes) {
    const female = rng.chance(0.5);
    const name = (female ? rng.pick(FIRST_F) : rng.pick(FIRST_M)) + " " + rng.pick(LAST);
    let code;
    do {
      code = String(1000 + rng.int(8999));
    } while (usedCodes && usedCodes.has(code));
    if (usedCodes) usedCodes.add(code);
    return {
      id: "Заказ № " + code,
      code: code,
      holder: name,
      city: rng.pick(CITIES),
      category: pickCategory(rng),
      status: status,
      weight: (0.4 + rng() * 8).toFixed(1) + " кг",
      pack: rng.pick(["коробка", "пакет", "конверт", "тяжёлая коробка"]),
      shelf: rng.pick(["A", "B", "C", "D"]),
      row: 1 + rng.int(4),
      delivered: false,
      returned: false,
      claimed: false
    };
  }

  /* ---------- сценарии клиентов ---------- */
  function greetLine(rng, arch, order) {
    const lines = {
      friendly: [
        "Здравствуйте! Как у вас тут уютно, я к вам за посылкой.",
        "Здравствуйте! Вы, наверное, помните меня, я в прошлый раз забирал заказ.",
        "Здравствуйте! Хорошего вам дня, у меня всего один вопросик."
      ],
      neutral: [
        "Здравствуйте. Забрать посылку, пожалуйста.",
        "Добрый день. Мне нужно получить заказ.",
        "Здравствуйте, я по заказу."
      ],
      busy: [
        "Быстро, пожалуйста, у меня через десять минут встреча.",
        "Здравствуйте, я в спешке — забрать заказ и бежать.",
        "Быстрее, пожалуйста, очередь растёт."
      ],
      confused: [
        "Здравствуйте... Я, кажется, не помню номер. Но там точно моя фамилия.",
        "Здравствуйте! Я не помню, что заказывал, но точно пришло. Поможете разобраться?",
        "Здравствуйте. У меня несколько заказов, и я уже не соображаю, какой мой."
      ],
      conflicting: [
        "Ну наконец-то! Я стою тут уже двадцать минут! Где моя посылка?",
        "Слушайте, в третий раз звоню — никто ничего не может сказать!",
        "Я не понимаю, за что я должен здесь стоять и объяснять!"
      ],
      vip: [
        "Здравствуйте! У меня VIP-карта, я надеюсь, для меня найдут быстро.",
        "Здравствуйте. Я у вас постоянно забираю заказы, привык, что всё быстро.",
        "Добрый день! Я тут по своим, все знают."
      ]
    };
    return rng.pick(lines[arch.id] || lines.neutral);
  }

  function pickupScript(rng, arch, order) {
    const steps = [];
    steps.push({ type: "say", text: greetLine(rng, arch, order), mood: arch.mood });

    if (arch.id === "confused") {
      steps.push({
        type: "say",
        text: "Заказ точно отправили из " + order.city + ", там " + order.category.toLowerCase() + ", упаковка — " + order.pack + ", " + order.weight + ".",
        mood: "neutral"
      });
    } else {
      steps.push({
        type: "say",
        text: "Номер заказа — " + order.code + ".",
        mood: arch.mood
      });
    }

    steps.push({
      type: "match",
      title: "Найдите заказ на складе",
      hint: arch.id === "confused"
        ? "Ориентируйтесь на город и категорию товара."
        : "Сверьте номер на посылке с номером клиента.",
      targetId: order.id,
      candidates: "ready"
    });

    steps.push({
      type: "choice",
      prompt: "Клиент ждёт ответа. Что скажете?",
      options: [
        { text: "Вот ваша посылка, проверьте, пожалуйста, содержимое.", ok: true, score: 30, reply: "Спасибо большое, всё на месте!" },
        { text: "Подпишите здесь, и всё готово.", ok: false, partial: true, score: 10, reply: "Угу, ладно..." },
        { text: "Я не могу её выдать, у меня нет вашей посылки.", ok: false, score: 0, reply: "Что?.. Тогда зачем я тут стоял?" }
      ]
    });
    return steps;
  }

  function statusScript(rng, arch, order) {
    const steps = [];
    steps.push({ type: "say", text: greetLine(rng, arch, order), mood: arch.mood });
    steps.push({
      type: "say",
      text: "Подскажите, где моя посылка? В приложении пишут, что заказ в пути, а вы мне то же самое говорите.",
      mood: arch.mood
    });
    steps.push({
      type: "choice",
      prompt: "Что ответите? Посмотрите статус заказа в системе слева.",
      options: [
        { text: "Ваш заказ «" + order.status + "». Как только придёт — придёт уведомление, заберёте у нас.", ok: true, score: 25, reply: "Понятно, спасибо, что прояснили." },
        { text: "Не знаю, проверяйте в приложении.", ok: false, partial: true, score: 8, reply: "Ну... ладно." },
        { text: "Такого заказа у нас нет, вы перепутали пункт.", ok: false, score: 0, reply: "Я не перепутал! Там моя фамилия стояла!" }
      ]
    });
    return steps;
  }

  function returnScript(rng, arch, order) {
    const reasons = [
      { key: "size", say: "Не подошёл размер, хочу вернуть. Упаковка не вскрыта, всё целое.", okText: "Оформляю возврат: деньги придут на карту в течение трёх дней.", wrongText: "Вернуть не могу, размер не подошёл — это не причина.", reply: "Хорошо, тогда жду возврата." },
      { key: "damaged", say: "Пришло повреждённым: коробка мятая, а внутри трещина. Хочу вернуть деньги.", okText: "Оформляю претензию по повреждению: сделаю акт и верну средства.", wrongText: "У нас всё пришло целым, это при доставке.", reply: "Ну вот, я же говорил, что трещина!" },
      { key: "opened", say: "Я уже вскрывал, но товар целый, просто передумал. Хочу вернуть.", okText: "Хорошо, оформляю возврат, раз упаковка вскрыта, но товар целый.", wrongText: "Вскрытый товар вернуть нельзя, уважаемый клиент.", reply: "Товар целый же! Не виноват, что я его открыл." },
      { key: "mind", say: "Просто передумал, хочу вернуть. Упаковка вскрыта, примерял.", okText: "Оформляю возврат с открытой упаковкой, отмечу это в акте.", wrongText: "Раз вскрыли — возврат невозможен.", reply: "Ну примерил же я!.." }
    ];
    const reason = rng.pick(reasons);
    const steps = [];
    steps.push({ type: "say", text: greetLine(rng, arch, order), mood: arch.mood });
    steps.push({ type: "say", text: reason.say, mood: arch.id === "conflicting" ? "angry" : arch.mood });
    steps.push({
      type: "choice",
      prompt: "Как оформите возврат?",
      options: [
        { text: reason.okText, ok: true, score: 30, reply: reason.reply },
        { text: "Давайте вы уточните у поддержки, я не оформляю возвраты.", ok: false, partial: true, score: 6, reply: "Какой поддержки?.. Уже неделю жду." },
        { text: reason.wrongText, ok: false, score: 0, reply: "Вы что?! Это же незаконно!" }
      ]
    });
    return steps;
  }

  function complaintScript(rng, arch, order) {
    const steps = [];
    steps.push({
      type: "say",
      text: "Здравствуйте. Я жду заказ уже неделю, в приложении статус не меняется, в поддержке отвечают роботом. Деньги хочу назад.",
      mood: "angry"
    });
    steps.push({
      type: "choice",
      prompt: "Клиент раздражён. С чего начнёте?",
      options: [
        { text: "Понимаю, ситуация неприятная. Давайте разберёмся вместе.", ok: true, score: 20, reply: "Ну вот, наконец-то нормальный разговор." },
        { text: "У нас всё по правилам, так уж в Озоне.", ok: false, score: 0, reply: "Отличное правило. Мне оно помогает?" },
        { text: "Это виноват курьер, звоните в него.", ok: false, score: 0, reply: "Звоню. Никто не берёт трубку. Как всегда." }
      ]
    });
    steps.push({
      type: "choice",
      when: function (ctx) {
        return ctx.anger >= 1;
      },
      prompt: "Клиент не остыл. Ваш ответ не помог — что дальше?",
      options: [
        { text: "Позвоню старшему смены, пусть разберётся лично с вашей ситуацией.", ok: true, score: 30, reply: "Пусть приходит. Только я жду ответа, а не извинений.", escalate: true },
        { text: "Извините, но решение принимает поддержка, я ничего не могу.", ok: false, score: 0, reply: "Тогда я не знаю, кому тут вообще жаловаться." },
        { text: "Вы могли бы просто подождать, срок доставки ещё не вышел.", ok: false, score: 0, reply: "Неделю жду! И что, ещё ждать?" }
      ]
    });
    steps.push({
      type: "choice",
      prompt: "Клиент ждёт решения. Что предложите?",
      options: [
        { text: "Проверю трек-номер по системе и перезвоню вам в течение часа.", ok: true, score: 30, reply: "Хорошо, жду звонка. Только не забудьте.", promise: true },
        { text: "Оформлю возврат средств прямо сейчас, если хотите.", ok: false, partial: true, score: 8, reply: "Ну... вы же не можете так просто вернуть. Ладно, жду звонка." },
        { text: "Ничего сделать не могу, ждите как все.", ok: false, score: 0, reply: "Понятно. Тогда я больше не приду." }
      ]
    });
    return steps;
  }

  function buildScript(rng, kind, arch, order) {
    if (kind === "status") return statusScript(rng, arch, order);
    if (kind === "return") return returnScript(rng, arch, order);
    if (kind === "complaint") return complaintScript(rng, arch, order);
    return pickupScript(rng, arch, order);
  }

  /* ---------- сборка смены ---------- */
  function buildShift(defIndex, seed) {
    const def = SHIFTS[defIndex];
    const rng = makeRng(seed);

    const orders = [];
    const usedCodes = new Set();
    for (let i = 0; i < 16; i++) {
      // первые 11 — на складе, остальные в пути / на других складах
      const status = i < 11 ? STATUS_READY : rng.pick([STATUS_WAY, STATUS_STOCK, STATUS_WAY, STATUS_RETURN]);
      orders.push(makeOrder(rng, i, status, usedCodes));
    }

    const clients = [];
    const freeReady = rng.shuffle(orders.filter((o) => o.status === STATUS_READY));
    const freeOthers = rng.shuffle(orders.filter((o) => o.status !== STATUS_READY));
    for (let i = 0; i < def.clients; i++) {
      let kind = def.types[i % def.types.length];
      if (rng.chance(def.conflictChance) && kind !== "complaint") {
        kind = rng.chance(0.5) ? "complaint" : "return";
      }
      let archId = "neutral";
      if (kind === "complaint") archId = "conflicting";
      else if (kind === "pickup") archId = rng.pick(["friendly", "friendly", "neutral", "neutral", "busy", "confused", "vip"]);
      else if (kind === "status") archId = rng.pick(["neutral", "busy", "friendly", "confused"]);
      else archId = rng.pick(["neutral", "friendly", "busy", "vip"]);

      const arch = ARCHETYPES[archId];
      let order;
      if (kind === "pickup") {
        // каждому клиенту на выдачу — свой заказ со склада, чтобы номера не путались
        order = freeReady.pop();
        if (!order) {
          order = makeOrder(rng, i, STATUS_READY, usedCodes);
          orders.push(order);
        }
      } else {
        // вопросы и возвраты — по заказам, которых ещё нет на пункте
        order = freeOthers.pop() || orders[(i + 3) % orders.length];
      }

      clients.push({
        id: i,
        name: order.holder,
        arch: arch,
        kind: kind,
        order: order,
        steps: buildScript(rng, kind, arch, order),
        patience: arch.patience + rng.int(10),
        anger: 0,
        mood: arch.mood,
        result: null
      });
    }

    // поставка от курьера на середине смены
    const delivery = (function () {
      const count = 3 + rng.int(3);
      const boxes = [];
      const letters = "ABCDEFG";
      for (let i = 0; i < count; i++) {
        boxes.push({ code: letters[i] + "-" + String(10 + rng.int(89)), weight: (0.3 + rng() * 6).toFixed(1) + " кг" });
      }
      const waybill = boxes.map((b) => b.code);
      const short = rng.chance(0.55);
      if (short) {
        // в накладной есть позиция, которой нет в поставке
        const missing = letters[count] + "-" + String(10 + rng.int(89));
        waybill.push(missing);
        waybill.sort();
      }
      return { boxes: boxes, waybill: waybill, checked: false, marked: null };
    })();

    return {
      def: def,
      defIndex: defIndex,
      orders: orders,
      clients: clients,
      delivery: delivery,
      shelf: orders.filter((o) => o.status === STATUS_READY).map((o) => o.id)
    };
  }

  return {
    SHIFTS: SHIFTS,
    ARCHETYPES: ARCHETYPES,
    STATUS_READY: STATUS_READY,
    STATUS_WAY: STATUS_WAY,
    STATUS_STOCK: STATUS_STOCK,
    STATUS_RETURN: STATUS_RETURN,
    PHRASES: PHRASES,
    buildShift: buildShift,
    makeRng: makeRng
  };
})();
