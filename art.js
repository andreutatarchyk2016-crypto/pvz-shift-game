/* Рисование сцены пункта выдачи: зал, полки с посылками, клиенты, курьер. */
window.PVZArt = (function () {
  "use strict";

  const W = 960;
  const H = 540;

  const SHELF = { x: 46, y: 126, w: 400, h: 288, rows: 3, cols: 3 };
  const SLOT = { w: 118, h: 78 };
  const FLOOR_Y = 428;
  const WINDOW = { x: 596, y: 118, w: 336, h: 310 };
  const COUNTER_Y = 470;
  const STAND_Y = 428;

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawRoom(ctx, t) {
    // стена
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1b2438");
    g.addColorStop(0.62, "#243049");
    g.addColorStop(1, "#161d2c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // мягкий свет сверху
    const lamp = ctx.createRadialGradient(W * 0.5, 30, 20, W * 0.5, 30, 420);
    lamp.addColorStop(0, "rgba(120,190,255,0.20)");
    lamp.addColorStop(1, "rgba(120,190,255,0)");
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, W, 420);

    // пол
    const fg = ctx.createLinearGradient(0, FLOOR_Y, 0, H);
    fg.addColorStop(0, "#1a2234");
    fg.addColorStop(1, "#0e1420");
    ctx.fillStyle = fg;
    ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const x = (i * 130 - 60) % W;
      ctx.beginPath();
      ctx.moveTo(x, FLOOR_Y);
      ctx.lineTo(x + 60, H);
      ctx.stroke();
    }
    // плинтус
    ctx.fillStyle = "#2b3852";
    ctx.fillRect(0, FLOOR_Y - 8, W, 8);

    // постер
    ctx.save();
    ctx.translate(W - 300, 58);
    ctx.fillStyle = "#0f172a";
    roundRect(ctx, -52, -38, 104, 84, 10);
    ctx.fill();
    ctx.strokeStyle = "#2b3a58";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 19px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ПВЗ", 0, -8);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText("пункт выдачи", 0, 10);
    ctx.fillStyle = "#fbbf24";
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillText("09:00–21:00", 0, 30);
    ctx.restore();

    // настенные часы
    ctx.save();
    ctx.translate(W - 300, 190);
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 2;
    const a = (t * 0.4) % (Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * 15, Math.sin(a) * 15);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a * 0.2 + 1) * 9, Math.sin(a * 0.2 + 1) * 9);
    ctx.stroke();
    ctx.restore();
  }

  function drawShelfFrame(ctx) {
    ctx.fillStyle = "#1c2436";
    roundRect(ctx, SHELF.x - 12, SHELF.y - 34, SHELF.w + 24, SHELF.h + 56, 12);
    ctx.fill();
    ctx.strokeStyle = "#2c3852";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#8fb6d8";
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("СКЛАД ПУНКТА", SHELF.x + 130, SHELF.y - 14);

    for (let r = 0; r < SHELF.rows; r++) {
      const y = SHELF.y + 12 + r * (SLOT.h + 10);
      ctx.fillStyle = "#2b3852";
      roundRect(ctx, SHELF.x - 6, y + SLOT.h - 6, SHELF.w + 12, 10, 4);
      ctx.fill();
    }
  }

  function slotRect(index) {
    const col = index % SHELF.cols;
    const row = Math.floor(index / SHELF.cols);
    return {
      x: SHELF.x + col * (SLOT.w + 12),
      y: SHELF.y + 12 + row * (SLOT.h + 10),
      w: SLOT.w,
      h: SLOT.h
    };
  }

  function fitText(ctx, text, maxWidth) {
    let t = String(text);
    if (ctx.measureText(t).width <= maxWidth) return t;
    while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) t = t.slice(0, -1);
    return t + "…";
  }

  function drawParcel(ctx, r, label, sub, opts) {
    const o = opts || {};
    const subs = Array.isArray(sub) ? sub : sub ? [sub] : [];
    const inner = r.w - 24;
    ctx.save();
    // коробка
    const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    g.addColorStop(0, o.color || "#c98a4b");
    g.addColorStop(1, "#a66b34");
    ctx.fillStyle = g;
    roundRect(ctx, r.x + 6, r.y + 14, r.w - 12, r.h - 14, 6);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 2;
    ctx.stroke();
    // скотч
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(r.x + 6, r.y + 30, r.w - 12, 7);
    // наклейка с номером
    ctx.fillStyle = "#f8fafc";
    roundRect(ctx, r.x + 12, r.y + 40, inner, 26, 4);
    ctx.fill();
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(fitText(ctx, label, inner - 10), r.x + r.w / 2, r.y + 58);
    // подписи
    if (subs.length) {
      ctx.fillStyle = "#ffe9cf";
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText(fitText(ctx, subs[0], inner), r.x + r.w / 2, r.y + 76);
    }
    if (subs.length > 1) {
      ctx.fillStyle = "rgba(255,255,255,0.66)";
      ctx.font = "9px system-ui, sans-serif";
      ctx.fillText(fitText(ctx, subs[1], inner), r.x + r.w / 2, r.y + 88);
    }
    if (o.status) {
      const tone = o.status === "Готов к выдаче" ? "#22c55e" : o.status === "В пути" ? "#38bdf8" : o.status === "Оформлен возврат" ? "#f87171" : "#fbbf24";
      ctx.fillStyle = tone;
      roundRect(ctx, r.x + 12, r.y + 15, inner, 13, 4);
      ctx.fill();
      ctx.fillStyle = "#0b1120";
      ctx.font = "bold 9px system-ui, sans-serif";
      ctx.fillText(fitText(ctx, o.status, inner - 6), r.x + r.w / 2, r.y + 24);
    }
    if (o.highlight) {
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 3;
      roundRect(ctx, r.x + 3, r.y + 11, r.w - 6, r.h - 11, 7);
      ctx.stroke();
    }
    if (o.dim) {
      ctx.fillStyle = "rgba(10,14,22,0.62)";
      roundRect(ctx, r.x + 3, r.y + 11, r.w - 6, r.h - 11, 7);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWindow(ctx) {
    // окно выдачи в дальней стене
    ctx.save();
    ctx.fillStyle = "#0d1422";
    roundRect(ctx, WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h, 14);
    ctx.fill();
    ctx.strokeStyle = "#2b3a58";
    ctx.lineWidth = 3;
    ctx.stroke();
    const g = ctx.createLinearGradient(WINDOW.x, WINDOW.y, WINDOW.x, WINDOW.y + WINDOW.h);
    g.addColorStop(0, "#12203a");
    g.addColorStop(1, "#0a1220");
    ctx.fillStyle = g;
    roundRect(ctx, WINDOW.x + 6, WINDOW.y + 6, WINDOW.w - 12, WINDOW.h - 12, 10);
    ctx.fill();
    // отражение
    ctx.fillStyle = "rgba(148,197,255,0.05)";
    ctx.beginPath();
    ctx.moveTo(WINDOW.x + 30, WINDOW.y + WINDOW.h - 8);
    ctx.lineTo(WINDOW.x + 140, WINDOW.y + 8);
    ctx.lineTo(WINDOW.x + 196, WINDOW.y + 8);
    ctx.lineTo(WINDOW.x + 86, WINDOW.y + WINDOW.h - 8);
    ctx.closePath();
    ctx.fill();
    // свет из окна на пол
    const spill = ctx.createLinearGradient(0, WINDOW.y + WINDOW.h, 0, FLOOR_Y);
    spill.addColorStop(0, "rgba(125,211,252,0.10)");
    spill.addColorStop(1, "rgba(125,211,252,0)");
    ctx.fillStyle = spill;
    ctx.fillRect(WINDOW.x, WINDOW.y + WINDOW.h, WINDOW.w, FLOOR_Y - (WINDOW.y + WINDOW.h));
    ctx.restore();
  }

  function drawCounter(ctx) {
    // прилавок сотрудника — передний план, внизу кадра
    ctx.fillStyle = "#1b2438";
    ctx.fillRect(0, COUNTER_Y, W, H - COUNTER_Y);
    ctx.fillStyle = "#33415f";
    roundRect(ctx, -10, COUNTER_Y - 16, W + 20, 28, 6);
    ctx.fill();
    // терминал на прилавке
    ctx.fillStyle = "#0f172a";
    roundRect(ctx, 486, COUNTER_Y - 60, 92, 48, 6);
    ctx.fill();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#38bdf8";
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ТЕРМИНАЛ", 532, COUNTER_Y - 32);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("ВАШЕ РАБОЧЕЕ МЕСТО", 170, COUNTER_Y + 26);
  }

  function drawPerson(ctx, x, groundY, opts) {
    const o = opts || {};
    const s = o.scale || 1;
    const bob = o.bob || 0;
    const skin = o.skin || "#f0bd97";
    const shirt = o.shirt || "#38bdf8";
    ctx.save();
    ctx.translate(x, groundY + bob);

    // тень
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(0, 2, 34 * s, 8 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // ноги
    ctx.fillStyle = "#28324a";
    roundRect(ctx, -20 * s, -56 * s, 15 * s, 56 * s, 5 * s);
    ctx.fill();
    roundRect(ctx, 5 * s, -56 * s, 15 * s, 56 * s, 5 * s);
    ctx.fill();

    // корпус
    ctx.fillStyle = shirt;
    roundRect(ctx, -26 * s, -124 * s, 52 * s, 72 * s, 12 * s);
    ctx.fill();

    // руки
    ctx.fillStyle = shirt;
    roundRect(ctx, -38 * s, -118 * s, 14 * s, 56 * s, 7 * s);
    ctx.fill();
    roundRect(ctx, 24 * s, -118 * s, 14 * s, 56 * s, 7 * s);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(-31 * s, -60 * s, 8 * s, 0, Math.PI * 2);
    ctx.arc(31 * s, -60 * s, 8 * s, 0, Math.PI * 2);
    ctx.fill();

    // голова
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, -144 * s, 26 * s, 0, Math.PI * 2);
    ctx.fill();

    // волосы
    ctx.fillStyle = o.hair || "#3f3a4d";
    ctx.beginPath();
    ctx.arc(0, -150 * s, 26 * s, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-26 * s, -152 * s, 52 * s, 8 * s);

    // глаза
    const eyeY = -142 * s;
    ctx.fillStyle = "#1f2937";
    if (o.mood === "angry") {
      ctx.save();
      ctx.translate(-9 * s, eyeY);
      ctx.rotate(-0.35);
      ctx.fillRect(-7 * s, -1.5 * s, 14 * s, 3 * s);
      ctx.restore();
      ctx.save();
      ctx.translate(9 * s, eyeY);
      ctx.rotate(0.35);
      ctx.fillRect(-7 * s, -1.5 * s, 14 * s, 3 * s);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(-9 * s, eyeY, 3.2 * s, 0, Math.PI * 2);
      ctx.arc(9 * s, eyeY, 3.2 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    // рот
    ctx.strokeStyle = "#7c2d12";
    ctx.lineWidth = 2.4 * s;
    ctx.beginPath();
    if (o.mood === "happy") {
      ctx.arc(0, -132 * s, 9 * s, 0.15 * Math.PI, 0.85 * Math.PI);
    } else if (o.mood === "angry") {
      ctx.arc(0, -124 * s, 9 * s, 1.15 * Math.PI, 1.85 * Math.PI);
    } else {
      ctx.moveTo(-7 * s, -132 * s);
      ctx.lineTo(7 * s, -132 * s);
    }
    ctx.stroke();

    // бейдж / карта
    if (o.badge) {
      ctx.fillStyle = "#fbbf24";
      roundRect(ctx, 8 * s, -104 * s, 16 * s, 12 * s, 3 * s);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCourier(ctx, x, groundY, boxes, t) {
    ctx.save();
    drawPerson(ctx, x, groundY, { skin: "#d9a06a", shirt: "#ef4444", hair: "#2f2a3a", mood: "neutral", scale: 0.96 });
    const n = Math.min(boxes, 4);
    for (let i = 0; i < n; i++) {
      const bx = x - 46 + i * 24;
      const by = groundY - 128 - (i % 2) * 6;
      ctx.fillStyle = i % 2 ? "#b5763c" : "#cf9048";
      roundRect(ctx, bx, by, 34, 26, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (boxes > 4) {
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("+" + (boxes - 4), x, groundY - 166);
    }
    ctx.restore();
  }

  function drawBubble(ctx, x, y, lines, tone) {
    if (!lines || !lines.length) return;
    ctx.save();
    ctx.font = "14px system-ui, sans-serif";
    let maxW = 0;
    for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);
    const w = maxW + 28;
    const h = lines.length * 20 + 18;
    const bx = Math.min(Math.max(x - w / 2, 10), W - w - 10);
    ctx.fillStyle = "rgba(15,23,42,0.94)";
    roundRect(ctx, bx, y - h, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = tone === "angry" ? "#f87171" : tone === "happy" ? "#4ade80" : "#38bdf8";
    ctx.lineWidth = 2;
    ctx.stroke();
    // хвостик
    ctx.beginPath();
    ctx.moveTo(x - 8, y);
    ctx.lineTo(x, y + 12);
    ctx.lineTo(x + 8, y);
    ctx.closePath();
    ctx.fillStyle = "rgba(15,23,42,0.94)";
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e2e8f0";
    ctx.textAlign = "left";
    ctx.fillText(lines[0], bx + 14, y - h + 22);
    for (let i = 1; i < lines.length; i++) {
      ctx.fillText(lines[i], bx + 14, y - h + 22 + i * 20);
    }
    ctx.restore();
  }

  function drawFloating(ctx, floaters) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 20px system-ui, sans-serif";
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, 1 - f.life / f.max);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - (f.max - f.life) * 0.6);
    }
    ctx.restore();
  }

  return {
    W: W,
    H: H,
    SHELF: SHELF,
    FLOOR_Y: FLOOR_Y,
    COUNTER_Y: COUNTER_Y,
    STAND_Y: STAND_Y,
    slotRect: slotRect,
    drawRoom: drawRoom,
    drawWindow: drawWindow,
    drawShelfFrame: drawShelfFrame,
    drawParcel: drawParcel,
    drawCounter: drawCounter,
    drawPerson: drawPerson,
    drawCourier: drawCourier,
    drawBubble: drawBubble,
    drawFloating: drawFloating,
    roundRect: roundRect
  };
})();
