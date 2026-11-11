/* «Смена на ПВЗ» — движок игры: смена, клиенты, диалоги, задачи, итоги. */
(() => {
  "use strict";

  const D = window.PVZ;
  const ART = window.PVZArt;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = ART.W;
  const H = ART.H;

  const $ = (id) => document.getElementById(id);

  /* ---------- звук (WebAudio, без файлов) ---------- */
  const Sound = (function () {
    let ac = null;
    let enabled = true;
    function ctx() {
      if (!ac) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        ac = new Ctx();
      }
      if (ac.state === "suspended") ac.resume();
      return ac;
    }
    function tone(freq, duration, type, volume) {
      if (!enabled) return;
      const a = ctx();
      if (!a) return;
      const osc = a.createOscillator();
      const gain = a.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, a.currentTime);
      gain.gain.setValueAtTime(0.0001, a.currentTime);
      gain.gain.exponentialRampToValueAtTime(volume || 0.06, a.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + duration);
      osc.connect(gain);
      gain.connect(a.destination);
      osc.start();
      osc.stop(a.currentTime + duration + 0.02);
    }
    return {
      good: function () {
        tone(660, 0.12, "sine", 0.05);
        setTimeout(function () {
          tone(880, 0.14, "sine", 0.05);
        }, 90);
      },
      bad: function () {
        tone(220, 0.22, "square", 0.035);
      },
      click: function () {
        tone(520, 0.05, "triangle", 0.03);
      },
      bell: function () {
        tone(880, 0.09, "triangle", 0.04);
        setTimeout(function () {
          tone(1170, 0.12, "triangle", 0.03);
        }, 80);
      },
      toggle: function () {
        enabled = !enabled;
        return enabled;
      },
      get enabled() {
        return enabled;
      }
    };
  })();

  const ui = {
    shift: $("hud-shift"),
    clock: $("hud-clock"),
    rep: $("hud-rep"),
    repBar: $("rep-bar"),
    money: $("hud-money"),
    served: $("hud-served"),
    clientCard: $("client-card"),
    clientName: $("client-name"),
    clientType: $("client-type"),
    clientMood: $("client-mood"),
    patience: $("patience-bar"),
    orderCard: $("order-card"),
    speech: $("speech"),
    choices: $("choices"),
    todo: $("todo"),
    journal: $("journal"),
    overlay: $("overlay"),
    overlayBody: $("overlay-body"),
    screenTitle: $("screen-title"),
    screenSub: $("screen-sub"),
    screenActions: $("screen-actions"),
    screenExtra: $("screen-extra")
  };

  const state = {
    phase: "menu",
    shiftIndex: 0,
    fullscreen: false,
    shift: null,
    displayParcels: [],
    clientIndex: -1,
    client: null,
    step: null,
    mode: "idle",
    patience: 0,
    patienceMax: 1,
    anger: 0,
    rep: 70,
    money: 0,
    fines: 0,
    served: 0,
    happy: 0,
    problems: 0,
    promises: [],
    journal: [],
    stats: { issued: [], returns: 0, callbacks: 0, calls: 0 },
    floaters: [],
    courier: null,
    selected: -1,
    time: 0,
    clock: 0,
    totalMinutes: 360,
    nextClientIn: 0,
    pendingIntro: null,
    inventoryChecked: false
  };

  /* ---------- утилиты ---------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pad = (n) => String(n).padStart(2, "0");

  function clockText(minutes) {
    const total = minutes % (24 * 60);
    const h = Math.floor(total / 60);
    const m = Math.floor(total % 60);
    return pad(h) + ":" + pad(m);
  }

  function parseClock(text) {
    const parts = text.split(":");
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  function moneyText(value) {
    return (value >= 0 ? "" : "−") + Math.abs(Math.round(value)).toLocaleString("ru-RU") + " ₽";
  }

  function journal(text, tone) {
    state.journal.unshift({ text: text, tone: tone || "info", time: clockText(state.clock) });
    if (state.journal.length > 40) state.journal.pop();
    renderJournal();
  }

  function floater(text, color, x, y) {
    state.floaters.push({ text: text, color: color, x: x, y: y, life: 1.2, max: 1.2 });
  }

  /* ---------- экраны ---------- */
  function showScreen(title, sub, extraHtml, actions) {
    ui.screenTitle.textContent = title;
    ui.screenSub.textContent = sub || "";
    ui.screenExtra.innerHTML = extraHtml || "";
    ui.screenActions.innerHTML = "";
    (actions || []).forEach((a) => {
      const btn = document.createElement("button");
      btn.className = "btn" + (a.primary ? " primary" : "");
      btn.textContent = a.label;
      btn.onclick = a.onClick;
      ui.screenActions.appendChild(btn);
    });
    ui.overlay.classList.remove("hidden");
  }

  function hideScreen() {
    ui.overlay.classList.add("hidden");
  }

  /* ---------- меню ---------- */
  function showMenu() {
    state.phase = "menu";
    state.client = null;
    state.courier = null;
    state.displayParcels = [];
    const cards = D.SHIFTS.map((s, i) => {
      const done = readBest(i);
      return (
        '<button class="shift-card" data-shift="' + i + '">' +
        '<span class="shift-name">' + s.name + "</span>" +
        '<span class="shift-sub">' + s.subtitle + "</span>" +
        '<span class="shift-meta">🕘 ' + s.start + "–" + s.end + " · 👥 " + s.clients + " клиентов · 💰 " + moneyText(s.basePay) + "</span>" +
        (done ? '<span class="shift-best">лучший результат: ' + done.stars + " ★ · " + moneyText(done.money) + "</span>" : '<span class="shift-best dim">ещё не отработана</span>') +
        "</button>"
      );
    }).join("");

    const rules =
      "<div class='rules'>" +
      "<h3>Как работать на смене</h3>" +
      "<ol>" +
      "<li><b>Примите поставку</b> — сверьте накладную с коробками курьера и отметьте расхождение.</li>" +
      "<li><b>Обслуживайте клиентов</b> — находите нужный заказ на складе, отвечайте на вопросы, снимайте раздражение.</li>" +
      "<li><b>Держите обещания</b> — если пообещали перезвонить, сделайте это до конца смены.</li>" +
      "<li><b>Закройте смену</b> — сверьте остатки по системе и сдайте отчёт.</li>" +
      "</ol>" +
      "<p class='hint'>Репутация растёт от довольных клиентов и падает от ошибок. От неё зависит премия и звёзды в конце смены.</p>" +
      "</div>";

    showScreen(
      "Смена на ПВЗ",
      "Работа сотрудника пункта выдачи: выдача заказов, возвраты, жалобы и приёмка поставок.",
      "<div class='shift-list'>" + cards + "</div>" + rules,
      []
    );

    ui.screenExtra.querySelectorAll(".shift-card").forEach((btn) => {
      btn.onclick = () => startShift(parseInt(btn.dataset.shift, 10));
    });
  }

  function readBest(index) {
    try {
      const raw = localStorage.getItem("pvz-best-" + index);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeBest(index, result) {
    try {
      const prev = readBest(index);
      if (!prev || result.money > prev.money) {
        localStorage.setItem("pvz-best-" + index, JSON.stringify(result));
      }
    } catch (e) {
      /* приватный режим — просто не сохраняем */
    }
  }

  /* ---------- старт смены ---------- */
  function startShift(index) {
    state.shiftIndex = index;
    state.shift = D.buildShift(index, 1000 + index * 977 + Math.floor(Date.now() / 60000) % 9973);
    state.rep = 70;
    state.money = 0;
    state.fines = 0;
    state.served = 0;
    state.happy = 0;
    state.problems = 0;
    state.promises = [];
    state.journal = [];
    state.stats = { issued: [], returns: 0, callbacks: 0, calls: 0 };
    state.floaters = [];
    state.client = null;
    state.courier = null;
    state.displayParcels = [];
    state.selected = -1;
    state.inventoryChecked = false;
    state.totalMinutes = parseClock(state.shift.def.end) - parseClock(state.shift.def.start);
    state.clock = parseClock(state.shift.def.start);

    const def = state.shift.def;
    showScreen(
      def.name,
      def.subtitle,
      "<div class='brief'>" +
      "<div class='brief-row'><span>Смена</span><b>" + def.start + " – " + def.end + "</b></div>" +
      "<div class='brief-row'><span>Клиентов</span><b>" + def.clients + "</b></div>" +
      "<div class='brief-row'><span>Оклад</span><b>" + moneyText(def.basePay) + "</b></div>" +
      "<div class='brief-row'><span>Поставка</span><b>" + state.shift.delivery.boxes.length + " коробок</b></div>" +
      "</div>",
      [{ label: "Приступить к смене", primary: true, onClick: beginOpening }]
    );
  }

  /* ---------- открытие смены ---------- */
  function beginOpening() {
    hideScreen();
    state.phase = "opening";
    state.courier = { boxes: state.shift.delivery.boxes, count: state.shift.delivery.boxes.length };
    journal("Смена открыта, " + clockText(state.clock), "good");
    renderHud();
    setSpeech(
      "Доброе утро! Вы на смене в пункте выдачи. Для начала примите поставку у курьера — сверьте накладную с коробками."
    );
    ui.choices.innerHTML = "";
    addChoice("Принять поставку", () => supplyCheck());
    addChoice("Осмотреть склад", () => {
      state.displayParcels = buildShelfView(state.shift.orders.filter((o) => o.status === D.STATUS_READY).slice(0, 6));
      setSpeech("На полках " + state.shift.orders.filter((o) => o.status === D.STATUS_READY).length + " готовых заказов. Всё на месте, можно принимать поставку.");
      journal("Осмотрен склад", "info");
    });
  }

  /* ---------- приёмка поставки ---------- */
  function supplyCheck() {
    const delivery = state.shift.delivery;
    const missing = delivery.waybill.filter((code) => !delivery.boxes.some((b) => b.code === code));
    const list =
      "<div class='waybill'><h3>Накладная курьера</h3><ul>" +
      delivery.waybill.map((c) => "<li data-code='" + c + "'>" + c + "</li>").join("") +
      "</ul></div>" +
      "<div class='waybill boxes'><h3>Что привёз курьер</h3><ul>" +
      delivery.boxes.map((b) => "<li>" + b.code + " · " + b.weight + "</li>").join("") +
      "</ul></div>" +
      "<p class='hint'>Если накладная и коробки совпадают — нажмите «Всё сошлось». Если позиции не хватает — отметьте её в накладной.</p>";

    showScreen("Приёмка поставки", "Курьер ждёт, пока вы сверите накладную.", list, [
      { label: "Всё сошлось", primary: true, onClick: () => finishSupply(missing.length === 0 ? null : "__pick__", missing) }
    ]);

    ui.screenExtra.querySelectorAll(".waybill:not(.boxes) li").forEach((li) => {
      li.onclick = () => {
        if (missing.includes(li.dataset.code)) {
          finishSupply(li.dataset.code, missing);
        } else {
          li.classList.add("wrong");
          state.rep = clamp(state.rep - 2, 0, 100);
          state.fines += 50;
          renderHud();
          setSpeech("Эта позиция есть у курьера. Смотрите внимательнее.");
        }
      };
    });
  }

  function finishSupply(code, missing) {
    hideScreen();
    state.courier = null;
    if (missing.length === 0 && code === null) {
      state.money += 100;
      state.rep = clamp(state.rep + 2, 0, 100);
      journal("Поставка принята без расхождений", "good");
      setSpeech("Поставка принята, всё сошлось. Отлично, теперь можно открывать терминал.");
      floater("+100 ₽", "#4ade80", 700, 240);
      afterSupply();
    } else if (code && code !== "__pick__") {
      state.rep = clamp(state.rep + 1, 0, 100);
      state.money += 60;
      journal("Расхождение по поставке отмечено: " + code, "warn");
      setSpeech("Вы отметили недостающую позицию " + code + ". Отлично, за этот раз прощаем. Открывайте терминал.");
      floater("+60 ₽", "#fbbf24", 700, 240);
      afterSupply();
    } else {
      state.rep = clamp(state.rep - 4, 0, 100);
      state.fines += 100;
      journal("Принята поставка с расхождением — заявка не оформлена", "bad");
      setSpeech("Вы приняли поставку, не сверив накладную. Руководитель это увидит в журнале.");
      floater("−100 ₽", "#f87171", 700, 240);
      afterSupply();
    }
  }

  function afterSupply() {
    ui.choices.innerHTML = "";
    addChoice("Открыть терминал", () => {
      state.phase = "service";
      journal("Терминал открыт, клиенты допущены", "good");
      setSpeech("Терминал открыт. Первый клиент уже у окна.");
      state.nextClientIn = 1.2;
      state.mode = "waiting";
      renderHud();
    });
    renderHud();
  }

  /* ---------- склад ---------- */
  function buildShelfView(orders) {
    return orders.map((o, i) => ({ order: o, slot: i }));
  }

  const MAX_SLOTS = 9;

  function refreshShelfForClient() {
    const c = state.client;
    if (!c) return [];
    const others = state.shift.orders.filter(
      (o) => o.id !== c.order.id && !o.delivered && o.status === D.STATUS_READY
    );
    const confused = c.arch.id === "confused";
    let distractors;
    if (confused) {
      // растерянный клиент ориентируется по городу, категории и упаковке:
      // отвлекающие заказы не должны совпадать сразу по всем признакам
      distractors = others.filter((o) => !(o.city === c.order.city && o.category === c.order.category));
      const extra = others.filter((o) => o.city !== c.order.city && o.category !== c.order.category);
      while (distractors.length < MAX_SLOTS - 1 && extra.length) distractors.push(extra.pop());
    } else {
      distractors = others.slice(0, MAX_SLOTS - 1);
    }
    const view = buildShelfView([c.order].concat(distractors).slice(0, MAX_SLOTS));
    return view;
  }

  /* ---------- клиенты ---------- */
  function nextClient() {
    if (state.clientIndex + 1 >= state.shift.clients.length) {
      beginClosing();
      return;
    }
    state.clientIndex += 1;
    const c = state.shift.clients[state.clientIndex];
    state.client = c;
    state.stepIndex = 0;
    state.step = null;
    state.mode = "dialogue";
    state.patience = c.patience;
    state.patienceMax = c.patience;
    state.anger = 0;
    state.selected = -1;
    state.clock += state.totalMinutes * 0.55 / state.shift.clients.length;
    state.displayParcels = refreshShelfForClient();
    renderClientCard();
    renderOrderCard();
    renderHud();
    renderTodo();
    journal("Клиент: " + c.name + " (" + c.arch.title + ")", "info");
    Sound.bell();
    showStep();
  }

  function renderClientCard() {
    const c = state.client;
    if (!c) {
      ui.clientCard.classList.add("hidden");
      return;
    }
    ui.clientCard.classList.remove("hidden");
    ui.clientName.textContent = c.name;
    ui.clientType.textContent = c.arch.title;
    const mood = state.anger >= 2 ? "angry" : state.anger === 1 ? "tense" : c.arch.mood;
    ui.clientMood.textContent = mood === "angry" ? "😠 раздражён" : mood === "tense" ? "😕 напряжён" : mood === "happy" ? "😊 доволен" : "😐 спокоен";
    ui.clientMood.className = "mood " + mood;
  }

  function statusTone(status) {
    if (status === D.STATUS_READY) return "good";
    if (status === D.STATUS_RETURN) return "bad";
    return "warn";
  }

  function renderOrderCard() {
    const c = state.client;
    if (!c) {
      ui.orderCard.innerHTML = "<span class='k'>—</span><span class='v'>клиентов нет</span>";
      return;
    }
    const o = c.order;
    const confused = c.arch.id === "confused";
    const rows = [
      ["Номер", confused ? "не помнит" : o.code],
      ["Получатель", o.holder],
      ["Город", o.city],
      ["Категория", o.category],
      ["Вес", o.weight],
      ["Статус", o.status]
    ];
    ui.orderCard.innerHTML = rows
      .map((r) => '<span class="k">' + r[0] + '</span><span class="v ' + (r[0] === "Статус" ? statusTone(r[1]) : "") + '">' + escapeHtml(r[1]) + "</span>")
      .join("");
  }

  function showStep() {
    const c = state.client;
    if (!c) return;
    if (state.stepIndex >= c.steps.length) {
      finishClient();
      return;
    }
    let step = c.steps[state.stepIndex];
    // условные шаги показываются только когда выполнено условие
    while (step && typeof step.when === "function" && !step.when({ anger: state.anger, client: c })) {
      state.stepIndex += 1;
      if (state.stepIndex >= c.steps.length) {
        finishClient();
        return;
      }
      step = c.steps[state.stepIndex];
    }
    state.step = step;
    ui.choices.innerHTML = "";
    if (step.type === "say") {
      setSpeech(step.text);
      addChoice("Продолжить", () => advanceStep(), "Space");
    } else if (step.type === "choice") {
      setSpeech(step.prompt || step.text || "");
      step.options.forEach((opt, i) => {
        addChoice(opt.text, () => chooseOption(i), String(i + 1));
      });
    } else if (step.type === "match") {
      state.mode = "match";
      const confused = c.arch.id === "confused";
      const request = confused
        ? "Найдите заказ из города " + c.order.city + " (" + c.order.category.toLowerCase() + ")."
        : "Найдите заказ № " + c.order.code + " и выдайте его клиенту.";
      setSpeech(request + " Посылки лежат на полках слева — щёлкните по нужной.");
      state.selected = -1;
      state.displayParcels = refreshShelfForClient();
      addChoice("Не могу найти, спросить у клиента", () => {
        state.anger += 1;
        state.rep = clamp(state.rep - 2, 0, 100);
        state.fines += 40;
        journal("Клиенту пришлось уточнять, что выдать", "warn");
        setSpeech("Клиент повторяет: «" + request + "»");
        renderClientCard();
      });
    }
    renderHud();
  }

  function setSpeech(text) {
    ui.speech.textContent = text;
  }

  function addChoice(label, onClick, hotkey) {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.innerHTML = (hotkey ? '<span class="key">' + hotkey + "</span>" : "") + escapeHtml(label);
    btn.onclick = onClick;
    ui.choices.appendChild(btn);
    return btn;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function advanceStep() {
    state.stepIndex += 1;
    showStep();
  }

  function chooseOption(index) {
    const step = state.step;
    const opt = step.options[index];
    if (!opt) return;
    ui.choices.innerHTML = "";
    setSpeech(opt.reply);
    if (opt.ok) {
      state.rep = clamp(state.rep + 4, 0, 100);
      state.money += 120;
      if (state.anger > 0) state.anger -= 1;
      floater("+4 репутация", "#4ade80", 745, 200);
      journal("Клиент доволен: " + opt.text, "good");
      Sound.good();
    } else if (opt.partial) {
      state.rep = clamp(state.rep - 1, 0, 100);
      state.money += 40;
      journal("Ответ частично верный: " + opt.text, "warn");
    } else {
      state.rep = clamp(state.rep - 6, 0, 100);
      state.fines += 100;
      state.anger += 1;
      state.problems += 1;
      floater("−6 репутация", "#f87171", 745, 200);
      journal("Ошибка в разговоре: " + opt.text, "bad");
      Sound.bad();
    }
    if (opt.promise) {
      const p = {
        id: "p" + state.promises.length + "-" + state.clientIndex,
        text: "Перезвонить " + state.client.name + " по заказу №" + state.client.order.code
      };
      state.promises.push(p);
      renderTodo();
    }
    if (opt.escalate) {
      state.escalations = (state.escalations || 0) + 1;
      journal("Вызван старший смены", "warn");
    }
    if (opt.returnAccepted) state.stats.returns += 1;
    renderClientCard();
    renderHud();
    addChoice("Дальше", () => advanceStep(), "Space");
  }

  function finishClient() {
    const c = state.client;
    state.served += 1;
    if (state.anger >= 2) {
      state.problems += 1;
      state.rep = clamp(state.rep - 4, 0, 100);
      state.fines += 80;
      journal("Клиент ушёл раздражённым", "bad");
      floater("Клиент ушёл недовольным", "#f87171", 745, 190);
    } else {
      state.happy += 1;
      state.money += 150;
      journal("Клиент обслужен без замечаний", "good");
      floater("+150 ₽", "#4ade80", 745, 190);
    }
    state.client = null;
    state.mode = "waiting";
    state.nextClientIn = 1.4;
    ui.clientCard.classList.add("hidden");
    ui.choices.innerHTML = "";
    setSpeech("Клиент ушёл. Следующий подойдёт через пару минут.");
    renderHud();
  }

  function clientLeavesAngry() {
    const c = state.client;
    if (!c) return;
    state.problems += 1;
    state.rep = clamp(state.rep - 12, 0, 100);
    state.fines += 150;
    journal("Клиент не дождался: " + c.name + " ушёл недовольным", "bad");
    floater("Ушёл, не дождавшись!", "#f87171", 745, 190);
    state.client = null;
    state.mode = "waiting";
    state.nextClientIn = 1.6;
    ui.clientCard.classList.add("hidden");
    ui.choices.innerHTML = "";
    setSpeech("Клиент ушёл, не дождавшись обслуживания.");
    renderHud();
  }

  /* ---------- поиск заказа на полке ---------- */
  // при object-fit: contain картинка вписана по меньшей стороне — считаем смещение
  function canvasTransform() {
    const rect = canvas.getBoundingClientRect();
    if (!state.fullscreen) {
      return { rect: rect, scale: rect.width / W, offX: 0, offY: 0 };
    }
    const scale = Math.min(rect.width / W, rect.height / H);
    return {
      rect: rect,
      scale: scale,
      offX: (rect.width - W * scale) / 2,
      offY: (rect.height - H * scale) / 2
    };
  }

  function canvasPos(event) {
    const t = canvasTransform();
    return {
      x: (event.clientX - t.rect.left - t.offX) / t.scale,
      y: (event.clientY - t.rect.top - t.offY) / t.scale
    };
  }

  function parcelAt(pos) {
    for (let i = 0; i < state.displayParcels.length; i++) {
      const r = ART.slotRect(state.displayParcels[i].slot);
      if (pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h) return i;
    }
    return -1;
  }

  canvas.addEventListener("click", (event) => {
    if (state.mode !== "match") return;
    const pos = canvasPos(event);
    const index = parcelAt(pos);
    if (index < 0) return;
    const parcel = state.displayParcels[index];
    state.selected = index;
    if (parcel.order.id === state.client.order.id) {
      const order = state.client.order;
      order.delivered = true;
      state.stats.issued.push({ code: order.code, holder: order.holder });
      state.rep = clamp(state.rep + 3, 0, 100);
      state.money += 80;
      state.displayParcels = state.displayParcels.filter((p) => p.order.id !== order.id);
      floater("Выдано! +80 ₽", "#4ade80", ART.slotRect(parcel.slot).x + 50, ART.slotRect(parcel.slot).y + 20);
      journal("Выдан заказ №" + order.code + " (" + order.holder + ")", "good");
      Sound.good();
      setSpeech("Готово, заказ №" + order.code + " выдан. Клиент забирает покупку.");
      state.mode = "dialogue";
      ui.choices.innerHTML = "";
      addChoice("Дальше", () => advanceStep(), "Space");
      renderHud();
    } else {
      state.anger += 1;
      state.rep = clamp(state.rep - 3, 0, 100);
      state.fines += 60;
      floater("Это не тот заказ", "#f87171", ART.slotRect(parcel.slot).x + 50, ART.slotRect(parcel.slot).y + 20);
      journal("Ошибка: выдан неверный заказ №" + parcel.order.code, "bad");
      Sound.bad();
      setSpeech("Это не тот заказ! Клиент ждёт №" + state.client.order.code + ". Поищите ещё.");
      renderClientCard();
      renderHud();
    }
  });

  /* ---------- закрытие смены ---------- */
  function beginClosing() {
    state.phase = "closing";
    state.client = null;
    state.clientCard && ui.clientCard.classList.add("hidden");
    ui.choices.innerHTML = "";
    state.clock += state.totalMinutes * 0.2;
    setSpeech("Клиенты закончились. Осталось закрыть смену: выполнить обещания и сверить остатки.");
    renderClosingChoices();
    renderHud();
  }

  function renderClosingChoices() {
    ui.choices.innerHTML = "";
    const pending = state.promises.filter((p) => !p.done).length;
    if (!state.inventoryChecked) {
      addChoice("Сверить остатки по системе", () => inventoryCheck());
      addChoice("Закрыть смену в приложении", () => {
        setSpeech("Без сверки остатков смену не закроют — это видно в журнале.");
      });
    } else {
      addChoice("Закрыть смену в приложении", () => {
        if (pending > 0) {
          setSpeech("Сначала выполните обещания: их осталось " + pending + ". Руководитель проверит журнал звонков.");
          return;
        }
        finishShift();
      });
    }
    renderTodo();
  }

  function inventoryCheck() {
    const statements = buildStatements();
    const html =
      "<div class='statements'>" +
      statements.map((s, i) => "<button class='stmt' data-i='" + i + "'>" + s.text + "</button>").join("") +
      "</div>" +
      "<p class='hint'>Отметьте утверждения, которые верны, и нажмите «Сверить».</p>";
    showScreen("Инвентаризация", "Сверьте данные журнала с системой.", html, [
      { label: "Сверить", primary: true, onClick: () => checkStatements(statements) }
    ]);
    ui.screenExtra.querySelectorAll(".stmt").forEach((btn) => {
      btn.onclick = () => btn.classList.toggle("on");
    });
  }

  function buildStatements() {
    const list = [];
    const issued = state.stats.issued;
    const notIssued = state.shift.orders.filter((o) => o.status === D.STATUS_READY && !o.delivered);
    const left = notIssued.length;
    const callbacks = state.promises.filter((p) => p.done).length;

    if (issued.length) {
      const it = issued[issued.length - 1];
      list.push({ text: "Заказ №" + it.code + " выдан клиенту " + it.holder, truth: true });
    }
    if (notIssued.length) {
      const o = notIssued[0];
      list.push({ text: "Заказ №" + o.code + " (" + o.holder + ") остался на складе", truth: true });
      list.push({ text: "Заказ №" + o.code + " уже выдан клиенту", truth: false });
    }
    list.push({ text: "На складе осталось " + left + " готовых заказов", truth: true });
    list.push({ text: "Выполнено обещаний клиентам: " + callbacks + " из " + state.promises.length, truth: true });
    list.push({ text: "За всё время смены ошибок не было", truth: state.fines === 0 });
    if (state.promises.length === 0) {
      list.push({ text: "Клиентам, ожидающим звонка, обещаний не оставляли", truth: true });
    }
    return list;
  }

  function checkStatements(statements) {
    const picked = [];
    ui.screenExtra.querySelectorAll(".stmt").forEach((btn) => {
      if (btn.classList.contains("on")) picked.push(statements[parseInt(btn.dataset.i, 10)]);
    });
    const right = picked.filter((s) => s.truth).length;
    const wrong = picked.filter((s) => !s.truth).length;
    const missed = statements.filter((s) => s.truth && picked.indexOf(s) < 0).length;
    hideScreen();
    state.inventoryChecked = true;
    if (wrong === 0 && missed === 0) {
      state.rep = clamp(state.rep + 3, 0, 100);
      state.money += 200;
      journal("Остатки сходятся, инвентаризация пройдена", "good");
      floater("Остатки сошлись +200 ₽", "#4ade80", 700, 240);
      setSpeech("Отлично, остатки сошлись. Смена закрывается.");
    } else {
      state.rep = clamp(state.rep - 5, 0, 100);
      state.fines += 150;
      journal("Расхождение в остатках: ошибок " + wrong + ", пропущено " + missed, "bad");
      floater("Расхождение −150 ₽", "#f87171", 700, 240);
      setSpeech("В остатках есть расхождения. Отчёт придётся уточнять.");
    }
    renderHud();
    renderClosingChoices();
  }

  function finishShift() {
    state.phase = "report";
    const def = state.shift.def;
    const pending = state.promises.filter((p) => !p.done);
    if (pending.length) {
      state.fines += pending.length * 200;
      state.rep = clamp(state.rep - pending.length * 8, 0, 100);
    }
    const repBonus = state.rep >= 85 ? 500 : state.rep >= 60 ? 250 : 0;
    const total = def.basePay + state.money + repBonus - state.fines;
    const stars = state.rep >= 85 ? 3 : state.rep >= 60 ? 2 : 1;

    const result = { money: total, stars: stars, rep: Math.round(state.rep) };
    writeBest(state.shiftIndex, result);

    const lines = [
      ["Оклад", moneyText(def.basePay)],
      ["Клиентов обслужено", String(state.served + " / " + state.shift.clients.length)],
      ["Премии за клиентов", moneyText(state.money)],
      ["Премия за репутацию", moneyText(repBonus)],
      ["Штрафы и ошибки", moneyText(-state.fines)],
      ["Репутация пункта", Math.round(state.rep) + " / 100"]
    ];

    const html =
      "<div class='report'>" +
      "<div class='stars'>" + "★".repeat(stars) + "☆".repeat(3 - stars) + "</div>" +
      lines.map((l) => "<div class='brief-row'><span>" + l[0] + "</span><b>" + l[1] + "</b></div>").join("") +
      "<div class='total'><span>Итого за смену</span><b>" + moneyText(total) + "</b></div>" +
      (pending.length ? "<p class='hint bad'>Не выполнено обещаний: " + pending.length + ". Каждый срыв — минус 200 ₽ и репутация.</p>" : "") +
      "</div>";

    showScreen(
      total >= def.basePay ? "Смена закрыта" : "Смена закрыта с замечаниями",
      def.name + " · " + def.start + " – " + def.end,
      html,
      [
        { label: "Следующая смена", primary: true, onClick: () => startShift((state.shiftIndex + 1) % D.SHIFTS.length) },
        { label: "В меню", onClick: showMenu }
      ]
    );
    state.floaters = [];
  }

  /* ---------- интерфейс ---------- */
  function renderHud() {
    ui.shift.textContent = state.shift ? state.shift.def.name : "—";
    ui.clock.textContent = clockText(state.clock);
    ui.rep.textContent = Math.round(state.rep);
    ui.repBar.style.width = state.rep + "%";
    ui.repBar.className = "bar-fill " + (state.rep >= 70 ? "good" : state.rep >= 40 ? "warn" : "bad");
    ui.money.textContent = moneyText(state.money - state.fines);
    const total = state.shift ? state.shift.clients.length : 0;
    ui.served.textContent = state.served + " / " + total;
  }

  function renderTodo() {
    ui.todo.innerHTML = "";
    const items = [];
    items.push({ text: "Открыть смену", done: state.phase !== "menu" && state.phase !== "opening" });
    items.push({ text: "Принять поставку", done: state.phase === "service" || state.phase === "closing" || state.phase === "report" });
    items.push({
      text: "Обслужить клиентов: " + state.served + " / " + (state.shift ? state.shift.clients.length : 0),
      done: state.phase === "closing" || state.phase === "report"
    });
    state.promises.forEach((p) => items.push({ text: p.text, done: !!p.done, action: p.done ? null : "Позвонить", promise: p }));
    items.push({ text: "Сверить остатки", done: !!state.inventoryChecked });
    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = item.done ? "done" : "";
      li.innerHTML = '<span class="mark">' + (item.done ? "✔" : "•") + "</span>" + escapeHtml(item.text);
      if (item.action) {
        const btn = document.createElement("button");
        btn.className = "mini";
        btn.textContent = item.action;
        btn.onclick = () => completePromise(item.promise);
        li.appendChild(btn);
      }
      ui.todo.appendChild(li);
    });
  }

  function completePromise(promise) {
    if (!promise || promise.done) return;
    promise.done = true;
    state.stats.callbacks += 1;
    state.rep = clamp(state.rep + 3, 0, 100);
    state.money += 50;
    journal("Обещание выполнено: " + promise.text, "good");
    floater("Обещание выполнено +50 ₽", "#4ade80", 700, 240);
    renderTodo();
    renderHud();
    if (state.phase === "closing") {
      setSpeech("Позвонили и сообщили клиенту. Остальные дела на смену — в списке слева.");
    }
  }

  function renderJournal() {
    ui.journal.innerHTML = "";
    state.journal.slice(0, 12).forEach((entry) => {
      const li = document.createElement("li");
      li.className = entry.tone;
      li.innerHTML = '<span class="time">' + entry.time + "</span>" + escapeHtml(entry.text);
      ui.journal.appendChild(li);
    });
  }

  /* ---------- отрисовка ---------- */
  function draw() {
    const t = state.time;
    ctx.clearRect(0, 0, W, H);
    ART.drawRoom(ctx, t);
    ART.drawWindow(ctx);

    ART.drawShelfFrame(ctx);
    const confused = state.client && state.client.arch.id === "confused";
    state.displayParcels.forEach((p) => {
      const r = ART.slotRect(p.slot);
      const o = p.order;
      const label = confused ? o.category : o.code;
      const sub = confused ? [o.city, o.pack + " · " + o.weight] : [o.city, o.category + " · " + o.weight];
      ART.drawParcel(ctx, r, label, sub, {
        status: o.status,
        highlight: state.selected >= 0 && state.displayParcels[state.selected] === p && state.mode === "match"
      });
    });

    if (state.courier) {
      ART.drawCourier(ctx, 690, ART.STAND_Y, state.courier.count, t);
    }

    if (state.client) {
      const c = state.client;
      const mood = state.anger >= 2 ? "angry" : state.anger === 1 ? "neutral" : c.arch.mood;
      ART.drawPerson(ctx, 770, ART.STAND_Y, {
        skin: c.arch.skin,
        shirt: c.arch.shirt,
        hair: c.arch.id === "vip" ? "#5b4636" : "#3f3a4d",
        mood: mood,
        badge: c.arch.id === "vip",
        bob: Math.sin(t * 2) * 1.2
      });
    }

    // прилавок — передний план, перекрывает ноги клиента
    ART.drawCounter(ctx);

    if (state.client) {
      const bubble = currentBubble();
      if (bubble) ART.drawBubble(ctx, 770, ART.STAND_Y - 148, bubble, state.anger >= 2 ? "angry" : state.anger === 1 ? "neutral" : state.client.arch.mood);
    }
    ART.drawFloating(ctx, state.floaters);
  }

  function currentBubble() {
    if (!state.client) return null;
    const step = state.step;
    if (!step) return null;
    if (step.type === "say") return wrap(step.text, 26);
    if (step.type === "choice") {
      const c = state.client;
      const hint = c.arch.id === "conflicting" ? "Не задерживайте клиента!" : "";
      const lines = wrap(c.name.split(" ")[0] + ", " + (hint || "что скажете?"), 26);
      return lines;
    }
    if (step.type === "match") {
      return wrap(state.client.arch.id === "confused" ? "Я не помню номер, но это точно мой город." : "Мой заказ — № " + state.client.order.code + ".", 26);
    }
    return null;
  }

  function wrap(text, limit) {
    const words = String(text).split(" ");
    const lines = [];
    let line = "";
    for (const w of words) {
      if ((line + " " + w).trim().length > limit) {
        lines.push(line.trim());
        line = w;
      } else {
        line = (line + " " + w).trim();
      }
    }
    if (line) lines.push(line);
    return lines.slice(0, 3);
  }

  /* ---------- цикл ---------- */
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    state.time += dt;

    if (state.mode === "dialogue" && state.client && state.step && state.step.type !== "say") {
      const drain = state.client.arch.id === "busy" ? 1.4 : 1;
      state.patience -= dt * drain;
      if (state.patience <= 0) clientLeavesAngry();
      else ui.patience.style.width = clamp((state.patience / state.patienceMax) * 100, 0, 100) + "%";
    } else if (state.client) {
      ui.patience.style.width = clamp((state.patience / state.patienceMax) * 100, 0, 100) + "%";
    }

    if (state.mode === "waiting" && state.nextClientIn > 0) {
      state.nextClientIn -= dt;
      if (state.nextClientIn <= 0) {
        state.nextClientIn = 0;
        if (state.phase === "service") nextClient();
      }
    }

    for (let i = state.floaters.length - 1; i >= 0; i--) {
      state.floaters[i].life -= dt;
      if (state.floaters[i].life <= 0) state.floaters.splice(i, 1);
    }

    draw();
    requestAnimationFrame(loop);
  }

  /* ---------- клавиатура ---------- */
  const btnFullscreen = $("btn-fullscreen");
  const canvasWrap = $("canvas-wrap");
  const btnSound = $("btn-sound");

  btnSound.addEventListener("click", () => {
    const on = Sound.toggle();
    btnSound.textContent = on ? "🔊" : "🔇";
    if (on) Sound.click();
  });

  btnFullscreen.addEventListener("click", () => {
    state.fullscreen = !state.fullscreen;
    canvasWrap.classList.toggle("fullscreen", state.fullscreen);
    document.body.classList.toggle("fs-on", state.fullscreen);
    btnFullscreen.textContent = state.fullscreen ? "⛶ Свернуть" : "⛶ Развернуть";
  });

  window.addEventListener("keydown", (event) => {
    if (!ui.overlay.classList.contains("hidden")) {
      if (event.code === "Enter") {
        const primary = ui.screenActions.querySelector(".primary");
        if (primary) primary.click();
      }
      return;
    }
    const buttons = ui.choices.querySelectorAll(".choice");
    if (event.code === "Space" || event.code === "Enter") {
      event.preventDefault();
      if (buttons.length) buttons[0].click();
      return;
    }
    const num = event.code.indexOf("Digit") === 0 ? parseInt(event.code.slice(5), 10) : 0;
    if (num >= 1 && num <= 9 && buttons[num - 1]) {
      event.preventDefault();
      buttons[num - 1].click();
    }
  });

  /* ---------- старт ---------- */
  renderJournal();
  renderTodo();
  renderHud();
  showMenu();
  requestAnimationFrame(loop);

  // отладочный доступ (только по адресу с ?debug=1) — для автотестов
  if (location.search.indexOf("debug") >= 0) {
    window.__pvz = {
      state: state,
      pickByCode: function (code) {
        const idx = state.displayParcels.findIndex((p) => p.order.code === code);
        if (idx < 0) return false;
        const r = ART.slotRect(state.displayParcels[idx].slot);
        const t = canvasTransform();
        const x = t.rect.left + t.offX + (r.x + r.w / 2) * t.scale;
        const y = t.rect.top + t.offY + (r.y + r.h / 2) * t.scale;
        canvas.dispatchEvent(new MouseEvent("click", { clientX: x, clientY: y, bubbles: true }));
        return true;
      },
      snapshot: function () {
        return {
          phase: state.phase,
          mode: state.mode,
          rep: state.rep,
          money: state.money,
          fines: state.fines,
          served: state.served,
          client: state.client ? state.client.name : null,
          speech: ui.speech.textContent,
          shelf: state.displayParcels.map((p) => p.order.code)
        };
      },
      truths: function () {
        return buildStatements().map((s) => s.truth);
      }
    };
  }
})();
