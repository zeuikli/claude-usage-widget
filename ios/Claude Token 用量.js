// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-brown; icon-glyph: chart-bar;
// Claude token 用量小工具。資料來自 Mac 上 ~/.claude/token-usage/export_usage.py
// 寫到 iCloud Drive 的 claude-usage.json（Mac 每 5 分鐘更新一次）。
// 小工具參數（長按 → 編輯小工具 → Parameter）：留空＝用量、趣味、更多、狀態、寵物、額度。

const fm = FileManager.iCloud();
const path = fm.joinPath(fm.documentsDirectory(), "claude-usage.json");

// ---------- 共用 ----------
// Large widgets use bigger type and more room (set in build()).
let BIG = false;
const S = (small, big) => BIG ? big : small;
const C = {
  bg: Color.dynamic(new Color("#faf9f5"), new Color("#1f1e1d")),
  card: Color.dynamic(new Color("#f0ede4"), new Color("#2b2a27")),
  text: Color.dynamic(new Color("#1f1e1d"), new Color("#f5f4ef")),
  dim: Color.dynamic(new Color("#73726c"), new Color("#a3a29c")),
  track: new Color("#9a9893", 0.25),
  actual: new Color("#d97757"),
  cache: new Color("#6a9bcc"),
  good: new Color("#5fa55a"),
  warn: new Color("#e0a050"),
  bad: new Color("#d0554a"),
};

// ---------- 設定（存在 iCloud 的 Scriptable 資料夾，App 與小工具共用；在 App 裡執行腳本即可修改） ----------
const VERSION = "2026.11.27.8";
const REPO = "zeuikli/claude-usage-widget";
const SETTINGS_PATH = fm.joinPath(fm.documentsDirectory(), "claude-usage-settings.json");
const STATE_PATH = fm.joinPath(fm.documentsDirectory(), "claude-usage-state.json");
const DEFAULTS = {
  notifyReset: true,       // 5 小時／每週額度重置時推播
  notifyHigh: true,        // 5 小時額度超過門檻時推播
  highAt: 80,              // 門檻（%）
  notifyWaiting: true,     // 有 session 等你回應時推播
  transparent: false,      // 透明背景（iOS 27.2 以上）
  theme: "default",        // default | warm | night
  weeklyReminder: false,   // 每週額度超過門檻時建一則提醒事項
  calendarReset: false,    // 每週額度重置時間寫進行事曆
  checkUpdates: true,      // 每 12 小時查一次 GitHub 有沒有新版
  refreshButton: true,     // 點標題列就地重畫（iOS 17 以上）
};
function readJSON(p) {
  try { return fm.fileExists(p) ? JSON.parse(fm.readString(p)) || {} : {}; } catch (e) { return {}; }
}
function writeJSON(p, v) { try { fm.writeString(p, JSON.stringify(v)); } catch (e) { console.log("寫入失敗：" + e); } }
const SETTINGS = Object.assign({}, DEFAULTS, readJSON(SETTINGS_PATH));
const MEMO = readJSON(STATE_PATH);    // what has already been notified / created, and the update check

// Themes change the palette and the widget background; the transparent style shows the wallpaper.
function applyTheme(w) {  // returns true when it set a gradient background
  if (SETTINGS.theme === "night") {
    Object.assign(C, { bg: new Color("#141a33"), card: new Color("#ffffff", 0.08), text: new Color("#f3f1ea"),
                       dim: new Color("#aab0c6"), track: new Color("#ffffff", 0.18) });
    const g = new LinearGradient();
    g.colors = [new Color("#232c57"), new Color("#0d1124")];
    g.locations = [0, 1];
    w.backgroundGradient = g;
    return true;
  } else if (SETTINGS.theme === "warm") {
    const g = new LinearGradient();
    g.colors = [Color.dynamic(new Color("#f7cdb4"), new Color("#4a2a1e")), Color.dynamic(new Color("#faf9f5"), new Color("#1f1e1d"))];
    g.locations = [0, 0.75];
    w.backgroundGradient = g;
    C.card = Color.dynamic(new Color("#ffffff", 0.55), new Color("#ffffff", 0.07));
  }
  if (SETTINGS.transparent) {
    w.backgroundStyle = "transparent";   // iOS / iPadOS 27.2+; ignored before
    C.card = Color.dynamic(new Color("#ffffff", 0.45), new Color("#000000", 0.3));
  }
  return SETTINGS.theme === "warm";
}

// Apple's SF Symbols; falls back to a text glyph if the symbol is missing.
function sym(stack, name, size, color, fallback) {
  try {
    const s = SFSymbol.named(name);
    if (s) {
      s.applyFont(Font.boldSystemFont(size));
      const i = stack.addImage(s.image);
      i.imageSize = new Size(size * 1.1, size * 1.1);
      i.tintColor = color;
      return i;
    }
  } catch (e) {}
  return label(stack, fallback || "•", size, color, "bold");
}

function fmt(n) {
  if (n >= 1e8) return (n / 1e8).toFixed(n >= 1e10 ? 0 : 1) + "億";
  if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e6 ? 0 : 1) + "萬";
  return String(n);
}
function change(cur, prev) {
  if (!prev) return "";
  const p = Math.round((cur / prev - 1) * 100);
  return (p >= 0 ? "↑" : "↓") + Math.abs(p) + "%";
}
function num(n) { return Number(n).toLocaleString("en-US"); }
function usd(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
function md(s) { return s.slice(5).replace("-", "/").replace(/^0/, "").replace("/0", "/"); }
function shortTime(iso) { const df = new DateFormatter(); df.dateFormat = "M/d HH:mm"; return df.string(new Date(iso)); }
function hourName(h) {
  if (h === 0) return "午夜 12 點";
  if (h < 6) return "凌晨 " + h + " 點";
  if (h < 12) return "上午 " + h + " 點";
  if (h === 12) return "中午 12 點";
  if (h < 18) return "下午 " + (h - 12) + " 點";
  return "晚上 " + (h - 12) + " 點";
}

// weight: "bold" | "round" (big rounded numbers) | undefined
function label(stack, text, size, color, weight) {
  const t = stack.addText(text);
  t.font = weight === "round" ? Font.boldRoundedSystemFont(size) : weight === "bold" ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.6;
  return t;
}

// Content width inside a medium/large widget (padding 14 on each side). Measured on a 402 pt iPhone:
// medium and large widgets are 360 pt wide, so 332 pt of content; a wider fixed-size row makes iOS
// shrink every text in it.
function contentWidth() {
  const sw = Math.min(Device.screenSize().width, Device.screenSize().height);
  return Math.round(sw * 0.895) - 28;
}

function newImage(w, h) {
  const dc = new DrawContext();
  dc.size = new Size(w, h);
  dc.opaque = false;
  dc.respectScreenScale = true;
  return dc;
}
function addImg(stack, img, w, h) {
  const i = stack.addImage(img);
  i.imageSize = new Size(w, h);
  i.leftAlignImage();
  return i;
}

// Header: ✻ title ……… 3 分鐘前（orange after 90 minutes）
function header(w, d, title) {
  const h = w.addStack();
  h.centerAlignContent();
  sym(h, "sparkle", S(12, 14), C.actual, "✻");
  h.addSpacer(4);
  label(h, title, S(12, 14), C.text, "bold");
  h.addSpacer();
  if (d) ageLabel(h, d, S(10, 11));
  // Tapping the title bar reloads the widget in place (a stack action, iOS 17+), so you need not open Scriptable.
  // The system refresh button (addRefreshButton) is a 40 pt circle that made iOS shrink the whole page,
  // so the bar itself is the button and a small ↻ glyph only marks it. The render ignores the action id.
  // Older Scriptable versions lack the method, so check before calling.
  if (SETTINGS.refreshButton && typeof h.setAction === "function") {
    h.addSpacer(3);
    sym(h, "arrow.clockwise", S(9, 10), C.dim, "↻");
    h.setAction("重新整理", { id: "refresh" });
  }
  return h;
}
// Live date text: iOS redraws it every second on its own, so it stays right between widget refreshes.
// style: "relative" (「3 分鐘」) or "timer" (「1:45:12」). The box has a fixed width because a live date
// text otherwise takes all the room it can get.
function liveDate(stack, date, style, size, color, width, weight) {
  const box = stack.addStack();
  box.size = new Size(width, 0);
  const t = box.addDate(date);
  if (style === "timer") t.applyTimerStyle(); else t.applyRelativeStyle();
  t.font = weight === "bold" ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.7;
  t.rightAlignText();
  return t;
}
// Time left until x resets, ticking: 「1:45:12」. Only under 24 hours (a timer reads badly beyond that).
function canTick(x) {
  if (!x || !x.resets || x.source === "desktop") return false;
  const ms = new Date(x.resets) - Date.now();
  return ms > 0 && ms < 86400000;
}
// Plain text, worked out when the widget is drawn. (A live relative date follows the phone's region
// format and came out as 「20 min, 44 sec前」.)
function ageLabel(stack, d, size) {
  const gen = new Date(d.generated);
  const mins = Math.max(0, Math.round((Date.now() - gen.getTime()) / 60000));
  const color = mins > 90 ? C.warn : C.dim;
  const text = mins < 1 ? "剛剛" : mins < 60 ? mins + " 分鐘前" : mins < 1440 ? Math.floor(mins / 60) + " 小時前" : shortTime(d.generated);
  label(stack, text, size, color);
}

function card(parent, width, pad) {
  const s = parent.addStack();
  s.layoutVertically();
  s.backgroundColor = C.card;
  s.cornerRadius = S(10, 12);
  const p = pad || S([6, 8, 6, 8], [9, 10, 9, 10]);
  s.setPadding(p[0], p[1], p[2], p[3]);
  if (width) s.size = new Size(width, 0);
  return s;
}
function tile(parent, title, value, sub, color, width, valueSize) {
  const s = card(parent, width);
  label(s, title, S(10, 11), color, "bold");
  if (BIG) s.addSpacer(2);
  label(s, value, valueSize || S(19, 22), C.text, "round");
  if (sub) label(s, sub, S(9, 10), C.dim);
  return s;
}
// A row of n equal tiles across the content width.
function tiles(w, items, width, valueSize) {
  const row = w.addStack();
  row.spacing = S(6, 8);
  const tw = Math.floor((width - S(6, 8) * (items.length - 1)) / items.length);
  items.forEach(([t, v, s, c]) => tile(row, t, v, s, c, tw, valueSize));
  return row;
}

function oldData(w, title, d, msg) {
  header(w, d, title);
  w.addSpacer(8);
  label(w, msg || "這份資料還沒有這一頁", 13, C.text, "bold");
  // Say which copy the phone has, so it is clear the phone is behind (not the Mac).
  const t = label(w, "手機上的資料是 " + (d ? shortTime(d.generated) : "舊的") + " 產生的，早於這一頁上線。Mac 每 5 分鐘更新；" +
    "點一下小工具會打開 Scriptable 重新讀取，回到主畫面就會出現。", 10, C.dim);
  t.lineLimit = 4;
  w.addSpacer();
}

// ---------- 圖 ----------
function bars(values, color, w, h, highlight) {
  const dc = newImage(w, h);
  const max = Math.max(...values, 1), gap = values.length > 24 ? 2 : 2.5;
  const bw = (w - gap * (values.length - 1)) / values.length;
  values.forEach((v, i) => {
    const bh = Math.max(v > 0 ? 2 : 0, (v / max) * h);
    const p = new Path();
    p.addRoundedRect(new Rect(i * (bw + gap), h - bh, bw, bh), 1.5, 1.5);
    dc.addPath(p);
    dc.setFillColor(i === highlight ? C.actual : color);
    dc.fillPath();
  });
  return dc.getImage();
}
// Bars plus labels underneath: [index, text] pairs.
function labeledBars(values, color, w, h, ticks, highlight) {
  const dc = newImage(w, h + 12);
  const max = Math.max(...values, 1), gap = 2;
  const bw = (w - gap * (values.length - 1)) / values.length;
  values.forEach((v, i) => {
    const bh = Math.max(v > 0 ? 2 : 0, (v / max) * h);
    const p = new Path();
    p.addRoundedRect(new Rect(i * (bw + gap), h - bh, bw, bh), 1.5, 1.5);
    dc.addPath(p);
    dc.setFillColor(i === highlight ? C.actual : color);
    dc.fillPath();
  });
  dc.setFont(Font.systemFont(9));
  dc.setTextColor(Color.gray());
  ticks.forEach(([i, text]) => {
    const x = i * (bw + gap);
    if (i === values.length - 1) { dc.setTextAlignedRight(); dc.drawTextInRect(text, new Rect(x + bw - 40, h + 2, 40, 11)); }
    else if (i === 0) { dc.setTextAlignedLeft(); dc.drawTextInRect(text, new Rect(0, h + 2, 40, 11)); }
    else { dc.setTextAlignedCenter(); dc.drawTextInRect(text, new Rect(x + bw / 2 - 20, h + 2, 40, 11)); }
  });
  return dc.getImage();
}
function dailyChart(w, d, key, color, cw, ch) {
  const n = d.daily.length;
  addImg(w, labeledBars(d.daily.map(x => x[key]), color, cw, ch,
    [[0, md(d.daily[0].date)], [Math.floor(n / 2), md(d.daily[Math.floor(n / 2)].date)], [n - 1, md(d.daily[n - 1].date)]]), cw, ch + 12);
}
function hourChart(w, d, cw, ch) {
  const vals = d.hours.map(x => x[0]);
  addImg(w, labeledBars(vals, C.cache, cw, ch, [[0, "0"], [6, "6"], [12, "12"], [18, "18"], [23, "23"]],
    vals.indexOf(Math.max(...vals))), cw, ch + 12);
}
function progress(width, pct, color, h) {
  const dc = newImage(width, h);
  const t = new Path();
  t.addRoundedRect(new Rect(0, 0, width, h), h / 2, h / 2);
  dc.addPath(t);
  dc.setFillColor(C.track);
  dc.fillPath();
  if (pct > 0) {
    const f = new Path();
    f.addRoundedRect(new Rect(0, 0, Math.max(h, width * Math.min(pct, 100) / 100), h), h / 2, h / 2);
    dc.addPath(f);
    dc.setFillColor(color);
    dc.fillPath();
  }
  return dc.getImage();
}
// Name ███████ value rows.
function rankBars(list, w, rowH, nameW, fmtValue, fontSize) {
  const fs = fontSize || 10;
  const dc = newImage(w, rowH * list.length);
  const max = Math.max(...list.map(x => x[1]), 1);
  const numW = 46, barW = w - nameW - numW - 6;
  list.forEach(([name, n], i) => {
    const y = i * rowH;
    dc.setFont(Font.systemFont(fs));
    dc.setTextColor(Color.gray());
    dc.setTextAlignedLeft();
    const ty = y + (rowH - fs * 1.25) / 2;
    dc.drawTextInRect(name, new Rect(0, ty, nameW - 4, rowH));
    const p = new Path();
    const bh = Math.min(rowH - 7, fs * 0.9);
    p.addRoundedRect(new Rect(nameW, y + (rowH - bh) / 2, Math.max(3, n / max * barW), bh), bh / 2, bh / 2);
    dc.addPath(p);
    dc.setFillColor(i === 0 ? C.actual : C.cache);
    dc.fillPath();
    dc.setTextAlignedRight();
    dc.drawTextInRect(fmtValue(n), new Rect(w - numW, ty, numW, rowH));
  });
  return dc.getImage();
}
// Ring gauge with the percentage in the middle.
function ring(size, pct, color, sub) {
  const dc = newImage(size, size);
  const lw = Math.max(5, size * 0.11), r = (size - lw) / 2, cx = size / 2, cy = size / 2;
  const arc = (from, to, col) => {
    const p = new Path();
    const steps = Math.max(2, Math.ceil((to - from) * 60));
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + 2 * Math.PI * (from + (to - from) * i / steps);
      const pt = new Point(cx + r * Math.cos(a), cy + r * Math.sin(a));
      if (i === 0) p.move(pt); else p.addLine(pt);
    }
    dc.addPath(p);
    dc.setStrokeColor(col);
    dc.setLineWidth(lw);
    dc.strokePath();
  };
  arc(0, 1, C.track);
  if (pct > 0) arc(0, Math.min(pct, 100) / 100, color);
  dc.setTextAlignedCenter();
  dc.setFont(Font.boldRoundedSystemFont(size * 0.25));
  dc.setTextColor(color);
  dc.drawTextInRect(pct + "%", new Rect(0, cy - size * (sub ? 0.2 : 0.16), size, size * 0.34));
  if (sub) {
    dc.setFont(Font.systemFont(size * 0.12));
    dc.setTextColor(Color.gray());
    dc.drawTextInRect(sub, new Rect(0, cy + size * 0.1, size, size * 0.2));
  }
  return dc.getImage();
}

// ---------- 額度與心跳 ----------
function limitColor(p) { return p >= 80 ? C.bad : p >= 50 ? C.warn : C.good; }
function limitPct(x) { return x.resets && new Date(x.resets) <= Date.now() ? 0 : x.percent; }
function resetText(x, short) {
  if (x.source === "desktop") return (short ? "舊紀錄 " : "Desktop 舊紀錄 ") + shortTime(x.at);
  if (!x.resets) return "";
  const t = new Date(x.resets), mins = Math.round((t - Date.now()) / 60000);
  if (mins <= 0) return "已重置";
  const left = mins >= 60 ? Math.floor(mins / 60) + " 小時 " + (mins % 60) + " 分" : mins + " 分";
  if (mins < 1440) {
    const df = new DateFormatter();
    df.dateFormat = "HH:mm";
    return short ? left + "後重置" : df.string(t) + " 重置・還有 " + left;
  }
  const wd = "日一二三四五六"[t.getDay()];
  return short ? "週" + wd + "重置" : "週" + wd + " " + shortTime(x.resets).split(" ")[1] + " 重置";
}
function mainLimits(d) { return (d.limits || []).filter(x => !x.label.startsWith("每週 ")); }
// 「5 小時 10%・2 小時後重置｜每週 13%」
function limitsLine(w, d, size) {
  const L = mainLimits(d);
  if (!L.length) return;
  const r = w.addStack();
  r.centerAlignContent();
  L.forEach((x, i) => {
    if (i) label(r, "｜", size, C.dim);
    const p = limitPct(x);
    label(r, x.label + " ", size, C.dim);
    label(r, p + "%", size, limitColor(p), "bold");
    if (i === 0) label(r, "・" + resetText(x, true), size, C.dim);
  });
}
function limitRow(w, x, width) {
  const p = limitPct(x);
  const h = w.addStack();
  h.centerAlignContent();
  label(h, x.label, S(11, 13), C.text, "bold");
  h.addSpacer(6);
  label(h, p + "%", S(11, 13), limitColor(p), "bold");
  h.addSpacer();
  if (canTick(x)) {
    const df = new DateFormatter();
    df.dateFormat = "HH:mm";
    label(h, df.string(new Date(x.resets)) + " 重置・還有 ", S(9, 11), C.dim);
    liveDate(h, new Date(x.resets), "timer", S(9, 11), C.dim, S(9, 11) * 3.6);
  } else label(h, resetText(x, false), S(9, 11), C.dim);
  w.addSpacer(S(3, 5));
  addImg(w, progress(width, p, limitColor(p), S(6, 8)), width, S(6, 8));
}

function heartbeat(d) {
  const h = d.heartbeat;
  if (!h) return { ok: false, known: false, short: "沒有心跳資料", text: "還沒有心跳資料" };
  // Judge the heartbeat against the moment the Mac wrote this data, not the phone's clock: when the phone
  // shows an old copy (iOS refreshed late, iCloud slow), that is stale data, not a stopped heartbeat.
  // How old the data itself is shows in the header (orange after 90 minutes).
  const age = (new Date(d.generated).getTime() - new Date(h.beat).getTime()) / 60000;
  const problems = [];
  if (age > 6) problems.push("心跳停了 " + Math.round(age) + " 分鐘（Mac 可能睡著）");
  if (!h.app_running) problems.push(h.paused ? "Claude 沒開（已暫停自動重開）" : "Claude 沒開");
  if (h.rc_serve === false) problems.push("Remote Control 關著");
  if (!h.online) problems.push("連不到 Anthropic");
  if (!h.keep_awake && h.on_ac && h.keep_awake_expected !== false) problems.push("防睡眠沒在跑");
  if (problems.length) return { ok: false, known: true, short: problems[0].replace(/（.*）/, ""), text: problems.join("・") };
  return { ok: true, known: true, short: "連線正常",
    text: "Claude 開著・Remote Control 服務中" + (h.on_ac ? "・插電不睡" : "・用電池（會睡）") };
}
function heartbeatLine(w, d, size, short) {
  const hb = heartbeat(d);
  const r = w.addStack();
  r.centerAlignContent();
  sym(r, hb.ok ? "heart.fill" : hb.known ? "heart.slash.fill" : "heart", size, hb.ok ? C.good : hb.known ? C.bad : C.dim, "♥");
  r.addSpacer(4);
  label(r, short ? hb.short : hb.text, size, hb.ok ? C.dim : C.text);
  return r;
}

// ---------- 狀態 ----------
const STATE = {
  question: ["等你回答", C.warn],
  approval: ["可能等核可", C.warn],
  decide: ["等你決定", C.warn],
  unread: ["有新回覆", C.cache],
  running: ["執行中", C.good],
};
const STATE_ICON = { question: "questionmark.circle.fill", approval: "hand.raised.fill", decide: "exclamationmark.circle.fill",
                     unread: "envelope.badge.fill", running: "bolt.fill" };
function counts(d) {
  const live = d.live || [];
  return {
    waiting: live.filter(x => ["question", "approval", "decide"].includes(x.state)).length,
    unread: live.filter(x => x.state === "unread").length,
    running: live.filter(x => x.state === "running").length,
  };
}
function sessionCard(w, x, width, withAsk) {
  const st = STATE[x.state] || [x.state, C.dim];
  const c = w.addStack();
  c.backgroundColor = C.card;
  c.cornerRadius = S(8, 10);
  if (BIG) c.setPadding(8, 10, 8, 10); else c.setPadding(5, 8, 5, 8);
  c.size = new Size(width, 0);
  c.layoutVertically();
  // Tap a row (medium/large) to open that session through Remote Control in the Claude app.
  if (x.bridge && /^session_[A-Za-z0-9]+$/.test(x.bridge)) c.url = "https://claude.ai/code/" + x.bridge;
  const r = c.addStack();
  r.centerAlignContent();
  sym(r, STATE_ICON[x.state] || "circle.fill", S(10, 12), st[1], "●");
  r.addSpacer(S(5, 7));
  // A long title gives way (slight shrink, then …) so the state on the right always shows.
  label(r, x.title, S(11, 13), C.text).minimumScaleFactor = 0.85;
  r.addSpacer();
  label(r, st[0], S(10, 12), st[1], "bold");
  if (withAsk && x.ask) { if (BIG) c.addSpacer(2); label(c, x.ask, S(9, 11), C.dim); }
}

function drawPet(mood, remoteOn, S) {
  const dc = new DrawContext();
  dc.size = new Size(S, S);
  dc.opaque = false;
  dc.respectScreenScale = true;
  const k = S / 100;
  const R = (x, y, w, h) => new Rect(x * k, y * k, w * k, h * k);
  const P = (x, y) => new Point(x * k, y * k);
  const body = new Color("#d97757"), dark = new Color("#3b2a22"), cheek = new Color("#f2a594");
  const bob = mood === "call" ? -4 : mood === "sleep" || mood === "sleepy" ? 3 : 0;

  // Antenna (the Remote Control): green with signal arcs when on, grey when off.
  dc.setStrokeColor(dark);
  dc.setLineWidth(2 * k);
  const ant = new Path();
  ant.move(P(50, 30 + bob));
  ant.addQuadCurve(P(56, 12 + bob), P(46, 20 + bob));
  dc.addPath(ant);
  dc.strokePath();
  dc.setFillColor(remoteOn ? new Color("#5fa55a") : new Color("#9a9893"));
  dc.fillEllipse(R(52, 6 + bob, 9, 9));
  if (remoteOn) {
    dc.setStrokeColor(new Color("#5fa55a"));
    dc.setLineWidth(1.6 * k);
    [7, 12].forEach(r => {
      const a = new Path();
      a.move(P(56.5 + r * 0.7, 10.5 + bob - r * 0.7));
      a.addQuadCurve(P(56.5 + r * 0.7, 10.5 + bob + r * 0.7), P(56.5 + r * 1.25, 10.5 + bob));
      dc.addPath(a);
      dc.strokePath();
    });
  }

  // Feet, arms, body.
  dc.setFillColor(body);
  dc.fillEllipse(R(30, 84, 14, 9));
  dc.fillEllipse(R(56, 84, 14, 9));
  if (mood === "call") dc.fillEllipse(R(77, 34 + bob, 12, 20));   // waving arm up
  else dc.fillEllipse(R(78, 56 + bob, 12, 16));
  dc.fillEllipse(R(10, 56 + bob, 12, 16));
  dc.fillEllipse(R(16, 28 + bob, 68, 60));

  // Eyes.
  dc.setFillColor(dark);
  dc.setStrokeColor(dark);
  dc.setLineWidth(2.4 * k);
  const eyeY = 50 + bob;
  if (mood === "sleep" || mood === "sleepy") {
    [36, 58].forEach(x => {
      const e = new Path();
      e.move(P(x, eyeY));
      e.addQuadCurve(P(x + 8, eyeY), P(x + 4, eyeY + 4));
      dc.addPath(e);
      dc.strokePath();
    });
  } else if (mood === "happy" || mood === "chill") {
    [36, 58].forEach(x => {
      const e = new Path();
      e.move(P(x, eyeY + 2));
      e.addQuadCurve(P(x + 8, eyeY + 2), P(x + 4, eyeY - 4));
      dc.addPath(e);
      dc.strokePath();
    });
  } else {
    const big = mood === "call" ? 11 : 9;
    [40, 62].forEach(x => {
      dc.setFillColor(dark);
      dc.fillEllipse(R(x - big / 2, eyeY - big / 2, big, big));
      dc.setFillColor(Color.white());
      dc.fillEllipse(R(x - big / 2 + 2, eyeY - big / 2 + 1.5, big / 3, big / 3));
    });
  }
  // Cheeks and mouth.
  dc.setFillColor(cheek);
  dc.fillEllipse(R(26, 57 + bob, 10, 6));
  dc.fillEllipse(R(66, 57 + bob, 10, 6));
  dc.setFillColor(dark);
  if (mood === "call") dc.fillEllipse(R(47, 60 + bob, 7, 7));
  else if (mood === "sleep" || mood === "sleepy") dc.fillEllipse(R(48, 62 + bob, 5, 3));
  else {
    const m = new Path();
    m.move(P(46, 61 + bob));
    m.addQuadCurve(P(56, 61 + bob), P(51, 66 + bob));
    dc.setLineWidth(2 * k);
    dc.addPath(m);
    dc.strokePath();
  }

  // Extras by mood.
  dc.setFont(Font.boldSystemFont(14 * k));
  if (mood === "call") {
    dc.setFillColor(new Color("#e0a050"));
    dc.fillEllipse(R(2, 8, 22, 22));
    dc.setTextColor(Color.white());
    dc.drawText("!", P(10, 9.5));
  } else if (mood === "sleep" || mood === "sleepy") {
    dc.setTextColor(new Color("#6a9bcc"));
    dc.setFont(Font.boldSystemFont(11 * k));
    dc.drawText("Z", P(74, 18));
    dc.setFont(Font.boldSystemFont(8 * k));
    dc.drawText("z", P(84, 10));
  } else if (mood === "work") {
    dc.setFillColor(new Color("#6a9bcc"));
    const drop = new Path();
    drop.move(P(80, 30));
    drop.addQuadCurve(P(80, 42), P(74, 40));
    drop.addQuadCurve(P(80, 30), P(86, 40));
    dc.addPath(drop);
    dc.fillPath();
  } else if (mood === "happy") {
    dc.setTextColor(new Color("#e0a050"));
    dc.setFont(Font.boldSystemFont(12 * k));
    dc.drawText("✦", P(4, 22));
    dc.drawText("✦", P(84, 24));
  }
  return dc.getImage();
}

// ---------- 頁面 ----------
function usagePage(w, d, family) {
  const L = d.last30, P = d.prev30;
  const cacheShare = L.total ? Math.round(L.cache / L.total * 1000) / 10 : 0;
  if (family === "small") {
    header(w, d, "Claude");
    w.addSpacer(6);
    label(w, "近 30 天實際使用", 10, C.actual, "bold");
    label(w, fmt(L.actual), 26, C.text, "round");
    label(w, "快取 " + fmt(L.cache) + "・今天 " + fmt(d.today.actual), 9, C.dim);
    w.addSpacer();
    addImg(w, bars(d.daily.map(x => x.actual), C.actual, 146, 22), 146, 22);
    const five = mainLimits(d)[0];
    if (five) {
      w.addSpacer(6);
      const r = w.addStack();
      r.centerAlignContent();
      label(r, five.label + " ", 9, C.dim);
      label(r, limitPct(five) + "%", 9, limitColor(limitPct(five)), "bold");
      r.addSpacer(5);
      addImg(r, progress(80, limitPct(five), limitColor(limitPct(five)), 5), 80, 5);
    }
    return;
  }
  const cw = contentWidth();
  header(w, d, "Claude 用量");
  w.addSpacer(6);
  tiles(w, [
    ["近 30 天實際", fmt(L.actual), "比前 30 天 " + change(L.actual, P.actual), C.actual],
    ["快取", fmt(L.cache), "占全部 " + cacheShare + "%", C.cache],
    ["今天", fmt(d.today.actual), "快取 " + fmt(d.today.cache), C.actual],
  ], cw);
  if (family === "medium") {
    w.addSpacer(6);
    dailyChart(w, d, "actual", C.actual, cw, 26);
    w.addSpacer(3);
    limitsLine(w, d, 10);
    w.addSpacer();
    return;
  }
  w.addSpacer(16);
  label(w, "每日實際使用", 12, C.dim, "bold");
  w.addSpacer(6);
  dailyChart(w, d, "actual", C.actual, cw, 92);
  w.addSpacer();
  mainLimits(d).forEach((x, i) => { if (i) w.addSpacer(12); limitRow(w, x, cw); });
}

function funPage(w, d, family) {
  if (!d.hours || !d.busiest) return oldData(w, "Claude 趣味", d);
  const vals = d.hours.map(x => x[0]);
  const peak = vals.indexOf(Math.max(...vals));
  const days = ["一", "二", "三", "四", "五", "六", "日"];
  const wk = d.weekdays || [];
  const topDay = wk.indexOf(Math.max(...wk));
  const saved = d.cost_nocache_usd ? Math.round((1 - d.cost_usd / d.cost_nocache_usd) * 100) : 0;
  if (family === "small") {
    header(w, d, "趣味");
    w.addSpacer(6);
    label(w, "連續使用", 10, C.actual, "bold");
    label(w, d.streak + " 天", 26, C.text, "round");
    label(w, "30 天裡用了 " + d.active_days + " 天", 9, C.dim);
    w.addSpacer();
    const r = w.addStack();
    r.centerAlignContent();
    label(r, "快取省下 ", 10, C.dim);
    label(r, saved + "%", 13, C.cache, "round");
    w.addSpacer(4);
    addImg(w, bars(vals, C.cache, 146, 18, peak), 146, 18);
    return;
  }
  const cw = contentWidth();
  header(w, d, "Claude 趣味統計");
  w.addSpacer(6);
  tiles(w, [
    ["連續使用", d.streak + " 天", "30 天用了 " + d.active_days + " 天", C.actual],
    ["最常用的時段", hourName(peak), "最常在星期" + days[topDay], C.actual],
    ["快取省下", saved + "%", "估 " + usd(d.cost_usd) + "／" + usd(d.cost_nocache_usd), C.cache],
  ], cw);
  w.addSpacer(family === "large" ? 16 : 6);
  if (family === "large") { label(w, "一天裡各時段的回覆數", 12, C.dim, "bold"); w.addSpacer(6); }
  hourChart(w, d, cw, family === "large" ? 56 : 28);
  if (family === "medium") { w.addSpacer(); return; }

  w.addSpacer();
  const app = d.apps || {}, appTotal = (app.Desktop || 0) + (app.CLI || 0);
  const tw = Math.floor((cw - 8) / 2);
  const g1 = w.addStack(); g1.spacing = 8;
  tile(g1, "最忙的一天", md(d.busiest.date), "實際 " + fmt(d.busiest.actual), C.actual, tw, 20);
  tile(g1, "最長的一次回覆", fmt((d.longest_reply || [0])[0]) + " token", "一次寫出的量", C.actual, tw, 20);
  w.addSpacer(8);
  const g2 = w.addStack(); g2.spacing = 8;
  const top = (d.projects || [])[0];
  tile(g2, "最常待的專案", top ? top[0] : "—", top ? num(top[2]) + " 次回覆" : "", C.cache, tw, 17);
  tile(g2, "Desktop／CLI", appTotal ? Math.round((app.Desktop || 0) / appTotal * 100) + "%／" + Math.round((app.CLI || 0) / appTotal * 100) + "%" : "—",
    "占實際使用", C.cache, tw, 20);
}

const TOOL_NAMES = {
  Bash: "終端機指令", Read: "讀檔", Edit: "改檔", Write: "寫新檔", Grep: "搜尋程式碼", Glob: "找檔案",
  control: "操作模擬器", Monitor: "盯著背景工作", Agent: "派出子代理", SubagentHandback: "子代理交回",
  WebSearch: "上網搜尋", WebFetch: "讀網頁", ToolSearch: "找工具", TaskStop: "停止背景工作",
  Artifact: "發布頁面", Skill: "叫用技能", advisor: "請教顧問",
};
function morePage(w, d, family) {
  if (!d.tools) return oldData(w, "Claude 花絮", d);
  const L = d.last30;
  const vals = (d.hours || []).map(x => x[0]);
  const allR = vals.reduce((a, b) => a + b, 0) || 1;
  const night = Math.round(vals.slice(0, 6).reduce((a, b) => a + b, 0) / allR * 100);
  const wk = d.weekdays || [];
  const weekend = Math.round(((wk[5] || 0) + (wk[6] || 0)) / allR * 100);
  const perDay = Math.round(d.tool_calls / Math.max(1, d.active_days));
  const subShare = Math.round(d.subagent_replies / allR * 100);
  const tools = d.tools.map(([n, c]) => [TOOL_NAMES[n] || n, c]);
  if (family === "small") {
    header(w, d, "花絮");
    w.addSpacer(6);
    label(w, "動手次數", 10, C.actual, "bold");
    label(w, fmt(d.tool_calls), 26, C.text, "round");
    label(w, "每天約 " + num(perDay) + " 次", 9, C.dim);
    w.addSpacer();
    label(w, "最常：" + tools[0][0] + " " + fmt(tools[0][1]), 10, C.text);
    w.addSpacer(2);
    const r = w.addStack();
    r.centerAlignContent();
    label(r, "夜貓指數 ", 10, C.dim);
    label(r, night + "%", 13, C.cache, "round");
    return;
  }
  const cw = contentWidth();
  header(w, d, "Claude 花絮");
  w.addSpacer(6);
  tiles(w, [
    ["動手次數", fmt(d.tool_calls), "每天約 " + num(perDay) + " 次", C.actual],
    ["對話", d.sessions + " 個", "子代理回覆占 " + subShare + "%", C.actual],
    ["夜貓指數", night + "%", "凌晨 0–5 點的回覆", C.cache],
  ], cw);
  w.addSpacer(family === "large" ? 16 : 7);
  if (family === "large") { label(w, "最常用的工具", 12, C.dim, "bold"); w.addSpacer(6); }
  const n = family === "large" ? 4 : 3, rh = family === "large" ? 22 : 15;
  addImg(w, rankBars(tools.slice(0, n), cw, rh, family === "large" ? 96 : 84, fmt, family === "large" ? 12 : 10), cw, rh * n);
  if (family === "medium") { w.addSpacer(); return; }

  w.addSpacer();
  const tw = Math.floor((cw - 8) / 2);
  const ls = d.longest_session || [0, "", ""];
  const books = L.output / 100000;
  const g = w.addStack(); g.spacing = 8;
  tile(g, "最長的對話", num(ls[0]) + " 次回覆", (ls[1] || "") + (ls[2] ? "・" + md(ls[2]) : ""), C.actual, tw, 20);
  tile(g, "30 天寫出", (books >= 10 ? Math.round(books) : books.toFixed(1)) + " 本書", "一本 10 萬字粗估", C.cache, tw, 20);
}

function statusPage(w, d, family) {
  w.url = "claude://";  // tap outside a session row: open the Claude app
  if (!d.live) return oldData(w, "Claude 狀態", d);
  const c = counts(d), live = d.live;
  if (family === "small") {
    header(w, d, "狀態");
    w.addSpacer(8);
    const r = w.addStack();
    [["等你", c.waiting, c.waiting ? C.warn : C.dim], ["新回覆", c.unread, C.cache], ["執行中", c.running, C.good]].forEach(([t, n, col], i) => {
      if (i) r.addSpacer();
      const s = r.addStack();
      s.layoutVertically();
      label(s, String(n), 26, col, "round");
      label(s, t, 9, C.dim, "bold");
    });
    w.addSpacer();
    heartbeatLine(w, d, 10, true);
    w.addSpacer(3);
    const five = mainLimits(d)[0];
    if (five) label(w, five.label + " " + limitPct(five) + "%・" + resetText(five, true), 9, C.dim);
    return;
  }
  const cw = contentWidth();
  header(w, d, "Claude 工作狀態");
  w.addSpacer(6);
  tiles(w, [
    ["等你回應", c.waiting + " 個", "", c.waiting ? C.warn : C.dim],
    ["有新回覆", c.unread + " 個", "", C.cache],
    ["執行中", c.running + " 個", "", C.good],
  ], cw, family === "large" ? 22 : 16);
  w.addSpacer(family === "large" ? 14 : 6);
  const max = family === "large" ? 4 : 2;
  if (!live.length) label(w, "目前沒有執行中或等你回應的 session", family === "large" ? 13 : 11, C.dim);
  live.slice(0, max).forEach(x => { sessionCard(w, x, cw, family === "large"); w.addSpacer(family === "large" ? 8 : 4); });
  if (live.length > max) label(w, "還有 " + (live.length - max) + " 個", family === "large" ? 11 : 9, C.dim);
  w.addSpacer();
  if (family === "large") {
    heartbeatLine(w, d, 12, !heartbeat(d).ok);  // problems: the first one only, so the line fits
    w.addSpacer(6);
    limitsLine(w, d, 12);
  } else {
    const f = w.addStack();
    f.centerAlignContent();
    heartbeatLine(f, d, 9, true);
    f.addSpacer();
    const five = mainLimits(d)[0];
    if (five) label(f, five.label + " " + limitPct(five) + "%・" + resetText(five, true), 9, C.dim);
  }
}

// ---- 寵物頁：小克 ----
function petMood(d) {
  const c = counts(d);
  const mins = (Date.now() - new Date(d.generated).getTime()) / 60000;
  const h = new Date().getHours();
  if (mins > 90) return { mood: "sleepy", text: "Mac 好像睡著了，我也有點睏……" };
  if (c.waiting) return { mood: "call", text: "主人～有 " + c.waiting + " 個 session 在等你回應！" };
  if (c.running) return { mood: "work", text: c.running + " 個 session 努力中，我在旁邊加油" };
  if (c.unread) return { mood: "happy", text: "有 " + c.unread + " 個新回覆，快來看看～" };
  if (h < 6) return { mood: "sleep", text: "大家都休息了……Zzz" };
  return { mood: "chill", text: "今天也一起加油吧！" };
}
function statBar(parent, name, pct, color, note, width) {
  const r = parent.addStack();
  r.centerAlignContent();
  const n = r.addStack();
  n.size = new Size(S(28, 32), 0);
  label(n, name, S(9, 11), C.dim, "bold");
  addImg(r, progress(width, pct, color, S(6, 7)), width, S(6, 7));
  r.addSpacer(5);
  if (note && note.tick) {  // live countdown until the 5-hour window refills
    liveDate(r, new Date(note.tick), "timer", S(9, 10), C.dim, S(9, 10) * 3.6);
    label(r, " 後回滿", S(9, 10), C.dim);
  } else label(r, note, S(9, 10), C.dim);
}
function petPage(w, d, family) {
  w.url = "claude://";  // tap: open the Claude app, where Remote Control sessions are
  if (!("live" in d) || !("remote_sessions" in d)) return oldData(w, "小克", d, "小克還在睡");
  const m = petMood(d);
  const hb = heartbeat(d);
  const remoteOn = d.remote_sessions > 0 && (!hb.known || hb.ok);
  const L = d.last30;
  const avg = L.actual / Math.max(1, d.active_days || 1);
  const full = Math.min(100, Math.round(d.today.actual / Math.max(1, avg) * 100));
  const lv = Math.floor(Math.sqrt(L.replies / 10));
  const five = (d.limits || []).find(x => x.label === "5 小時");
  const hp = five ? 100 - limitPct(five) : null;

  if (family === "small") {
    const top = w.addStack();
    top.addSpacer();
    addImg(top, drawPet(m.mood, remoteOn, 84), 84, 84);
    top.addSpacer();
    w.addSpacer(2);
    const t = label(w, m.text, 10, C.text, "bold");
    t.lineLimit = 2;
    t.centerAlignText();
    w.addSpacer();
    if (hp !== null) {
      const r = w.addStack();
      r.addSpacer();
      label(r, "體力 " + hp + "%・Lv." + lv, 9, C.dim);
      r.addSpacer();
    }
    return;
  }
  const cw = contentWidth();
  const big = family === "large" ? 112 : 96;
  const row = w.addStack();
  row.centerAlignContent();
  addImg(row, drawPet(m.mood, remoteOn, big), big, big);
  row.addSpacer(10);
  const col = row.addStack();
  col.layoutVertically();
  const nameRow = col.addStack();
  nameRow.centerAlignContent();
  label(nameRow, "小克", S(15, 18), C.actual, "bold");
  nameRow.addSpacer(6);
  label(nameRow, "Lv." + lv, S(11, 13), C.dim, "bold");
  col.addSpacer(S(4, 6));
  const colW = cw - big - 14;  // 4 pt to spare so iOS never has to shrink this column
  const bubble = card(col, colW, S([5, 8, 5, 8], [7, 10, 7, 10]));
  const t = label(bubble, m.text, S(11, 13), C.text, "bold");
  t.lineLimit = 2;
  col.addSpacer(S(6, 10));
  const bw = colW - S(28, 32) - S(92, 100);
  if (hp !== null) statBar(col, "體力", hp, limitColor(100 - hp), five.source === "desktop" ? "舊紀錄" : hp >= 100 ? "滿滿的" : canTick(five) ? { tick: five.resets } : resetText(five, true).replace("重置", "回滿"), bw);
  col.addSpacer(S(3, 6));
  statBar(col, "飽足", full, C.actual, "吃了 " + fmt(d.today.actual), bw);
  col.addSpacer(S(3, 6));
  const ant = col.addStack();
  ant.centerAlignContent();
  const an = ant.addStack();
  an.size = new Size(S(28, 32), 0);
  label(an, "天線", S(9, 11), C.dim, "bold");
  label(ant, remoteOn ? d.remote_sessions + " 個 session 可遙控" : hb.known && !hb.ok ? hb.short : "沒有開 Remote Control", S(9, 10),
    remoteOn ? C.good : hb.known && !hb.ok ? C.bad : C.dim, "bold");

  if (family === "large") {
    w.addSpacer(16);
    // Sessions waiting on you first, then the running ones; at most three rows.
    const order = { question: 0, approval: 0, decide: 0, unread: 1, running: 2 };
    const rows = (d.live || []).slice().sort((a, b) => order[a.state] - order[b.state]).slice(0, 3);
    if (rows.length) {
      label(w, "小克幫你看著", 12, C.dim, "bold");
      w.addSpacer(6);
      rows.forEach((x, i) => { if (i) w.addSpacer(8); sessionCard(w, x, cw, false); });
    } else label(w, "沒有在跑或等你的 session，小克在發呆。", 13, C.dim);
    w.addSpacer();
    const f = w.addStack();
    f.centerAlignContent();
    heartbeatLine(f, d, 11, true);
    f.addSpacer();
    ageLabel(f, d, 11);
  }
}

// At the current pace, how full the window will be when it resets (null when too early to tell).
function pace(x, windowHours) {
  if (!x.resets || x.source === "desktop") return null;
  const left = (new Date(x.resets) - Date.now()) / 3600000, used = windowHours - left;
  if (left <= 0 || used < 0.25) return null;
  return Math.min(999, Math.round(limitPct(x) / used * windowHours));
}

function limitsPage(w, d, family) {
  w.url = "claude://";
  if (!("limits" in d)) return oldData(w, "Claude 額度", d);
  const list = d.limits || [];
  if (!list.length) return oldData(w, "Claude 額度", d, "這次沒讀到額度");
  const main = mainLimits(d);
  if (family === "small") {
    header(w, d, "額度");
    w.addSpacer(6);
    const r = w.addStack();
    main.slice(0, 2).forEach((x, i) => {
      if (i) r.addSpacer();
      const s = r.addStack();
      s.layoutVertically();
      s.centerAlignContent();
      addImg(s, ring(64, limitPct(x), limitColor(limitPct(x))), 64, 64);
      s.addSpacer(3);
      label(s, x.label, 10, C.text, "bold");
    });
    w.addSpacer();
    if (main[0]) label(w, main[0].label + "：" + resetText(main[0], true), 9, C.dim);
    if (main[1]) label(w, main[1].label + "：" + resetText(main[1], true), 9, C.dim);
    return;
  }
  const cw = contentWidth();
  header(w, d, "Claude 方案額度");
  w.addSpacer(family === "large" ? 10 : 6);
  const size = family === "large" ? 76 : 62;
  const half = Math.floor((cw - 8) / 2);
  const r = w.addStack();
  r.spacing = 8;
  main.slice(0, 2).forEach(x => {
    const c = r.addStack();
    c.size = new Size(half, 0);
    c.centerAlignContent();
    const p = limitPct(x);
    addImg(c, ring(size, p, limitColor(p)), size, size);
    c.addSpacer(8);
    const t = c.addStack();
    t.layoutVertically();
    label(t, x.label, S(12, 15), C.text, "bold");
    t.addSpacer(S(2, 4));
    const rs = resetText(x, true);
    // Large: just the time left (「1 小時 49 分」) so it fits beside the ring; medium keeps 「還有 …」.
    const left = rs.endsWith("後重置") ? rs.replace("後重置", "") : rs;
    if (canTick(x)) {
      const lr = t.addStack();
      lr.centerAlignContent();
      if (!BIG) label(lr, "還有 ", S(10, 12), limitColor(p), "bold");
      liveDate(lr, new Date(x.resets), "timer", S(10, 13), limitColor(p), S(10, 13) * 3.8, "bold");
    } else label(t, x.source === "desktop" ? "舊紀錄" : BIG || !rs.endsWith("後重置") ? left : "還有 " + left, S(10, 12), limitColor(p), "bold");
    if (x.resets && x.source !== "desktop") {
      const df = new DateFormatter();
      df.dateFormat = new Date(x.resets) - Date.now() < 86400000 ? "HH:mm" : "M/d HH:mm";
      label(t, df.string(new Date(x.resets)) + " 重置", S(9, 11), C.dim);
    } else if (x.at) label(t, shortTime(x.at), S(9, 11), C.dim);
  });
  const extra = list.filter(x => x.label.startsWith("每週 "));
  w.addSpacer(family === "large" ? 18 : 6);
  if (family === "medium") {
    heartbeatLine(w, d, 9, false);
    w.addSpacer();
    return;
  }
  const paces = main.slice(0, 2).map(x => [x, pace(x, x.label === "5 小時" ? 5 : 168)]).filter(([, p]) => p !== null);
  if (paces.length) {
    const tw = Math.floor((cw - 8 * (paces.length - 1)) / paces.length);
    const pr = w.addStack();
    pr.spacing = 8;
    paces.forEach(([x, p]) => tile(pr, x.label + "照這速度", "約 " + p + "%", p >= 100 ? "會在重置前用完" : "重置時會用到", limitColor(p), tw, 20));
    w.addSpacer(16);
  }
  extra.forEach(x => { limitRow(w, x, cw); });
  w.addSpacer();
  if (list[0].source === "desktop") label(w, "Claude Code 沒回應，暫時用 Desktop 最後一筆紀錄", 11, C.warn);
  else heartbeatLine(w, d, 11, true);
}

// ---- 日曆：半年熱力圖 ----
function calendarGrid(cal, weeks, width, gap, showMonths) {
  const cell = (width - gap * (weeks - 1)) / weeks;
  const top = showMonths ? 13 : 0;
  const dc = newImage(width, top + cell * 7 + gap * 6);
  const today = new Date(cal[cal.length - 1][0] + "T12:00:00");
  const wd = (today.getDay() + 6) % 7;                   // Monday = 0
  const start = new Date(today.getTime() - ((weeks - 1) * 7 + wd) * 86400000);
  const byDate = {};
  cal.forEach(([day, v]) => { byDate[day] = v; });
  const nz = cal.map(x => x[1]).filter(v => v > 0).sort((a, b) => a - b);
  const q = f => nz.length ? nz[Math.min(nz.length - 1, Math.floor(nz.length * f))] : 1;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const alpha = v => v <= 0 ? 0 : v <= cuts[0] ? 0.3 : v <= cuts[1] ? 0.5 : v <= cuts[2] ? 0.75 : 1;
  dc.setFont(Font.systemFont(9));
  dc.setTextColor(Color.gray());
  let lastMonth = -1;
  for (let col = 0; col < weeks; col++) {
    for (let row = 0; row < 7; row++) {
      const t = new Date(start.getTime() + (col * 7 + row) * 86400000);
      if (t > today) continue;
      const key = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
      const a = alpha(byDate[key] || 0);
      const p = new Path();
      p.addRoundedRect(new Rect(col * (cell + gap), top + row * (cell + gap), cell, cell), cell * 0.22, cell * 0.22);
      dc.addPath(p);
      dc.setFillColor(a ? new Color("#d97757", a) : C.track);
      dc.fillPath();
      if (showMonths && row === 0 && t.getMonth() !== lastMonth) {
        if (col > 0 && col < weeks - 1) dc.drawText((t.getMonth() + 1) + "月", new Point(col * (cell + gap), 0));
        lastMonth = t.getMonth();
      }
    }
  }
  return dc.getImage();
}
function calendarPage(w, d, family) {
  if (!d.calendar) return oldData(w, "Claude 日曆", d);
  const cal = d.calendar;
  if (family === "small") {
    header(w, d, "日曆");
    w.addSpacer(6);
    const cw = 146;
    const img = calendarGrid(cal.slice(-84), 12, cw, 2, false);
    addImg(w, img, cw, img.size.height);
    w.addSpacer();
    const r = w.addStack();
    r.centerAlignContent();
    label(r, "連續 ", 10, C.dim);
    label(r, d.streak + " 天", 13, C.actual, "round");
    label(r, "・最長 " + d.best_streak, 10, C.dim);
    return;
  }
  const cw = contentWidth();
  const active = cal.filter(x => x[1] > 0).length;
  header(w, d, "Claude 日曆");
  w.addSpacer(family === "large" ? 10 : 6);
  if (family === "large") {
    tiles(w, [
      ["目前連續", d.streak + " 天", "今天也有用", C.actual],
      ["最長連續", (d.best_streak || d.streak) + " 天", "有紀錄以來", C.actual],
      ["半年用了", active + " 天", "共 " + cal.length + " 天", C.cache],
    ], cw);
    w.addSpacer(14);
  }
  // Large: 20 weeks so the squares are bigger and easier to read; medium fits half a year.
  const weeks = family === "large" ? 20 : 26;
  const img = calendarGrid(cal.slice(-(weeks * 7)), weeks, cw, family === "large" ? 3 : 2, true);
  addImg(w, img, cw, img.size.height);
  if (family === "large") w.addSpacer(); else w.addSpacer(4);  // large: legend sits at the bottom
  if (family === "medium") {
    label(w, "近半年用了 " + active + " 天・目前連續 " + d.streak + " 天・最長 " + (d.best_streak || d.streak) + " 天", 10, C.dim);
    w.addSpacer();
    return;
  }
  // Busiest week of the half year.
  let best = [0, 0];
  for (let i = 0; i + 7 <= cal.length; i += 7) {
    const sum = cal.slice(i, i + 7).reduce((a, x) => a + x[1], 0);
    if (sum > best[0]) best = [sum, i];
  }
  const legend = w.addStack();
  legend.centerAlignContent();
  label(legend, "最忙的一週：" + md(cal[best[1]][0]) + " 起，實際使用 " + fmt(best[0]), 11, C.text);
  legend.addSpacer();
  label(legend, "少 ", 9, C.dim);
  [0.3, 0.5, 0.75, 1].forEach(a => {
    const dc = newImage(10, 10);
    const p = new Path();
    p.addRoundedRect(new Rect(0, 0, 10, 10), 2.2, 2.2);
    dc.addPath(p);
    dc.setFillColor(new Color("#d97757", a));
    dc.fillPath();
    addImg(legend, dc.getImage(), 10, 10);
    legend.addSpacer(2);
  });
  label(legend, " 多", 9, C.dim);
  w.addSpacer();
}

// ---- 鎖定畫面（iOS 16 以上：圓形、長方形、單行） ----
// iOS tints lock screen widgets itself, so everything is drawn in white.
function monoRing(size, pct, center, sub) {
  const dc = newImage(size, size);
  const lw = size * 0.12, r = (size - lw) / 2, c = size / 2;
  const arc = (to, col) => {
    const p = new Path();
    const steps = Math.max(2, Math.ceil(to * 60));
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + 2 * Math.PI * to * i / steps;
      const pt = new Point(c + r * Math.cos(a), c + r * Math.sin(a));
      if (i === 0) p.move(pt); else p.addLine(pt);
    }
    dc.addPath(p);
    dc.setStrokeColor(col);
    dc.setLineWidth(lw);
    dc.strokePath();
  };
  arc(1, new Color("#ffffff", 0.3));
  if (pct > 0) arc(Math.min(pct, 100) / 100, Color.white());
  dc.setTextAlignedCenter();
  dc.setTextColor(Color.white());
  dc.setFont(Font.boldRoundedSystemFont(size * 0.28));
  dc.drawTextInRect(center, new Rect(0, c - size * 0.2, size, size * 0.34));
  dc.setFont(Font.systemFont(size * 0.13));
  dc.drawTextInRect(sub, new Rect(0, c + size * 0.1, size, size * 0.2));
  return dc.getImage();
}
function lockPage(w, d, family) {
  w.setPadding(0, 0, 0, 0);  // iOS draws no widget background on the lock screen
  const white = Color.white(), soft = new Color("#ffffff", 0.75);
  const five = mainLimits(d)[0], week = mainLimits(d)[1];
  const c = counts(d);
  const p5 = five ? limitPct(five) : null;
  if (family === "accessoryInline") {
    const parts = [];
    if (five) parts.push("5h " + p5 + "%");
    if (week) parts.push("週 " + limitPct(week) + "%");
    if (c.waiting) parts.push("等你 " + c.waiting);
    else if (c.running) parts.push("跑 " + c.running);
    label(w, "✻ " + (parts.length ? parts.join("・") : fmt(d.today.actual) + " token"), 12, white);
    return;
  }
  if (family === "accessoryCircular") {
    w.addAccessoryWidgetBackground = true;
    const r = w.addStack();
    r.addSpacer();
    addImg(r, monoRing(56, p5 || 0, p5 === null ? "—" : p5 + "%", c.waiting ? "等你 " + c.waiting : "5 小時"), 56, 56);
    r.addSpacer();
    return;
  }
  // accessoryRectangular
  const h = w.addStack();
  h.centerAlignContent();
  label(h, "✻ Claude", 12, white, "bold");
  h.addSpacer();
  if (c.waiting) label(h, "等你 " + c.waiting, 11, white, "bold");
  else if (c.running) label(h, "執行中 " + c.running, 11, soft);
  w.addSpacer(2);
  if (five) {
    const r = w.addStack();
    r.centerAlignContent();
    label(r, "5 小時 " + p5 + "%", 12, white, "bold");
    r.addSpacer();
    if (canTick(five)) liveDate(r, new Date(five.resets), "timer", 11, soft, 46);
    w.addSpacer(3);
    const dc = newImage(150, 5);
    const t = new Path();
    t.addRoundedRect(new Rect(0, 0, 150, 5), 2.5, 2.5);
    dc.addPath(t);
    dc.setFillColor(new Color("#ffffff", 0.3));
    dc.fillPath();
    if (p5 > 0) {
      const f = new Path();
      f.addRoundedRect(new Rect(0, 0, Math.max(5, 150 * Math.min(p5, 100) / 100), 5), 2.5, 2.5);
      dc.addPath(f);
      dc.setFillColor(white);
      dc.fillPath();
    }
    addImg(w, dc.getImage(), 150, 5);
    w.addSpacer(3);
  }
  label(w, (week ? "每週 " + limitPct(week) + "%・" : "") + "今天 " + fmt(d.today.actual), 11, soft);
}

// A sentence for Siri / Shortcuts: limits with time left, then who is waiting.
function spokenSummary(d) {
  if (!d) return "現在讀不到 Claude 的用量資料。";
  const parts = [];
  mainLimits(d).forEach(x => {
    let s = x.label + "用了百分之" + limitPct(x);
    if (canTick(x)) {
      const m = Math.round((new Date(x.resets) - Date.now()) / 60000);
      s += "，" + (m >= 60 ? Math.floor(m / 60) + " 小時 " : "") + (m % 60) + " 分後重置";
    }
    parts.push(s);
  });
  const c = counts(d);
  if (c.waiting) parts.push("有 " + c.waiting + " 個 session 在等你回應");
  if (c.running) parts.push(c.running + " 個 session 在執行");
  if (!c.waiting && !c.running) parts.push("目前沒有 session 在跑");
  parts.push("今天用了 " + fmt(d.today.actual) + " token");
  return "Claude 狀態：" + parts.join("；") + "。";
}

// ---- 洞察：每則回覆背後發生了什麼（近 30 天） ----
function modelName(m) {
  const x = String(m).replace("claude-", "").split("-");
  return x[0].charAt(0).toUpperCase() + x[0].slice(1) + " " + x.slice(1).join(".");
}
function pct(a, b) { return b ? Math.round(a / b * 1000) / 10 : 0; }
function insightPage(w, d, family) {
  const i = d.insights;
  if (!i || !i.prompts) return oldData(w, "Claude 洞察", d);
  const L = d.last30;
  const perPrompt = Math.round(L.replies / i.prompts);
  const turns = (i.stop_end_turn || 0) + (i.stop_tool_use || 0);
  const toolsPerTurn = i.stop_end_turn ? Math.round(i.stop_tool_use / i.stop_end_turn) : 0;
  const thinkShare = Math.round(pct(i.thinking_tokens, L.output));
  const okRate = i.tool_results ? Math.round((1 - i.tool_errors / i.tool_results) * 1000) / 10 : 100;
  const sec = ms => (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + " 秒";
  if (family === "small") {
    header(w, d, "洞察");
    w.addSpacer(6);
    label(w, "你說一句，它回", 10, C.actual, "bold");
    label(w, perPrompt + " 次", 26, C.text, "round");
    label(w, "近 30 天 " + num(i.prompts) + " 句話", 9, C.dim);
    w.addSpacer();
    const r = w.addStack();
    r.centerAlignContent();
    label(r, "思考占輸出 ", 10, C.dim);
    label(r, thinkShare + "%", 13, C.cache, "round");
    return;
  }
  const cw = contentWidth();
  header(w, d, "Claude 洞察");
  w.addSpacer(family === "large" ? 10 : 6);
  tiles(w, [
    ["你說一句，它回", perPrompt + " 次", "近 30 天 " + num(i.prompts) + " 句話", C.actual],
    ["思考占輸出", thinkShare + "%", "中位數想 " + sec(i.think_ms_median), C.cache],
    ["工具成功率", okRate + "%", num(i.tool_errors) + " 次出錯", okRate >= 97 ? C.good : C.warn],
  ], cw);
  if (family === "medium") {
    w.addSpacer(8);
    label(w, "每回合平均動手 " + toolsPerTurn + " 次・被你中斷 " + (i.interrupts || 0) + " 次・壓縮對話 " + (i.compactions || 0) + " 次", 10, C.dim);
    const top = (i.sub_models || [])[0], subTotal = (i.sub_models || []).reduce((a, x) => a + x[1], 0);
    if (top) {
      w.addSpacer(3);
      label(w, "子代理最常用 " + modelName(top[0]) + "（" + Math.round(top[1] / subTotal * 100) + "%）・自動核准 " + num(i.perm_accept || 0) + " 次", 10, C.dim);
    }
    w.addSpacer();
    return;
  }
  w.addSpacer(14);
  label(w, "子代理用的模型", 12, C.dim, "bold");
  w.addSpacer(6);
  const sm = (i.sub_models || []).slice(0, 4).map(([m, n]) => [modelName(m), n]);
  if (sm.length) addImg(w, rankBars(sm, cw, 20, 96, num, 12), cw, 20 * sm.length);
  w.addSpacer();
  const tw = Math.floor((cw - 8) / 2);
  const g1 = w.addStack(); g1.spacing = 8;
  tile(g1, "自動核准", num(i.perm_accept || 0) + " 次", "你親手核准 " + num(i.perm_user || 0) + "・擋下 " + num(i.perm_reject || 0), C.good, tw, 18);
  tile(g1, "壓縮對話", (i.compactions || 0) + " 次", "通常在 " + fmt(i.compact_tokens_median || 0) + " token 時", C.cache, tw, 18);
  w.addSpacer(8);
  const g2 = w.addStack(); g2.spacing = 8;
  tile(g2, "每回合動手", toolsPerTurn + " 次", "被你中斷 " + (i.interrupts || 0) + " 次", C.actual, tw, 18);
  const v = i.versions || [];
  tile(g2, "Claude Code 版本", v.length ? v[2] + " 個" : "—", v.length ? v[0] + " → " + v[1] : "", C.actual, tw, 18);
}

// ---- 速度：各模型 tok/s（近 30 天中位數） ----
// speed rows: [model, replies, end-to-end, generation, time to first token (s), thinking, tool input]
function speedPage(w, d, family) {
  const sp = ((d.insights || {}).speed || []).filter(x => x[3]);
  if (!sp.length) return oldData(w, "Claude 速度", d);
  const main = sp[0], fastest = sp.slice().sort((a, b) => b[3] - a[3])[0];
  const tps = n => n === null || n === undefined ? "—" : Math.round(n) + "";
  if (family === "small") {
    header(w, d, "速度");
    w.addSpacer(6);
    label(w, modelName(main[0]) + " 生成", 10, C.actual, "bold");
    const r = w.addStack();
    r.centerAlignContent();
    label(r, tps(main[3]), 28, C.text, "round");
    r.addSpacer(3);
    label(r, "tok/s", 11, C.dim, "bold");
    label(w, "等第一個字 " + main[4] + " 秒", 9, C.dim);
    w.addSpacer();
    label(w, "最快：" + modelName(fastest[0]) + " " + tps(fastest[3]), 10, C.text);
    return;
  }
  const cw = contentWidth();
  header(w, d, "Claude 速度");
  w.addSpacer(family === "large" ? 10 : 6);
  if (family === "large") {
    tiles(w, [
      ["最常用・" + modelName(main[0]), tps(main[3]) + " tok/s", num(main[1]) + " 次回覆", C.actual],
      ["最快・" + modelName(fastest[0]), tps(fastest[3]) + " tok/s", "生成速度", C.good],
      ["等第一個字", main[4] + " 秒", modelName(main[0]) + " 中位數", C.cache],
    ], cw, 20);
    w.addSpacer(14);
    label(w, "生成速度（tok/s，扣掉等第一個字的時間）", 12, C.dim, "bold");
    w.addSpacer(6);
  }
  const n = family === "large" ? 5 : 4, rh = family === "large" ? 22 : 21;
  const list = sp.slice(0, n).map(x => [modelName(x[0]), x[3]]);
  addImg(w, rankBars(list, cw, rh, family === "large" ? 96 : 90, v => Math.round(v) + "", family === "large" ? 12 : 11), cw, rh * list.length);
  if (family === "medium") { w.addSpacer(); label(w, "中位數・近 30 天・tok/s", 9, C.dim); return; }
  w.addSpacer();
  sp.slice(0, 2).forEach(x => {
    label(w, modelName(x[0]) + "　思考 " + tps(x[5]) + "・工具輸入 " + tps(x[6]) + "・含等待 " + tps(x[2]) + " tok/s", 11, C.dim);
    w.addSpacer(3);
  });
}

// ---------- 通知、提醒事項、行事曆、版本檢查（每次腳本執行時順便做；任何一項失敗都不影響小工具） ----------
async function notify(id, title, body, opts) {
  const n = new Notification();
  n.identifier = id;
  n.title = title;
  n.body = body;
  n.threadIdentifier = "claude-usage";
  n.sound = (opts && opts.sound) || "default";
  if (opts && opts.at) n.setTriggerDate(opts.at);
  if (opts && opts.url) { n.openURL = opts.url; n.addAction("打開 session", opts.url); }
  await n.schedule();
}
async function sideEffects(d) {
  if (!d) return;
  const now = Date.now();
  const main = mainLimits(d).filter(x => x.source !== "desktop");
  // 1. Reset reminders are scheduled ahead for the exact reset time (same identifier = rescheduled, not duplicated).
  for (const x of main) {
    const id = "claude-reset-" + (x.label === "5 小時" ? "5h" : "week");
    try {
      if (SETTINGS.notifyReset && x.resets && new Date(x.resets) > now && x.percent > 0) {
        await notify(id, "Claude " + x.label + "額度回滿了", "剛重置，可以繼續放心用。", { at: new Date(x.resets), sound: "complete" });
      } else await Notification.removePending([id]);
    } catch (e) { console.log("排定重置通知失敗：" + e); }
  }
  // 2. High use: once per 5-hour window.
  const five = main.find(x => x.label === "5 小時");
  if (SETTINGS.notifyHigh && five && limitPct(five) >= SETTINGS.highAt && MEMO.highFor !== five.resets) {
    try {
      await notify("claude-high", "Claude 5 小時額度用了 " + limitPct(five) + "%", resetText(five, false) + "。", {});
      MEMO.highFor = five.resets;
    } catch (e) { console.log("高用量通知失敗：" + e); }
  }
  // 3. A session waiting on you: once per session and turn.
  if (SETTINGS.notifyWaiting) {
    const seen = new Set(MEMO.waited || []);
    for (const x of (d.live || []).filter(x => ["question", "approval", "decide"].includes(x.state))) {
      const key = x.title + "|" + x.at;
      if (seen.has(key)) continue;
      try {
        const url = x.bridge && /^session_[A-Za-z0-9]+$/.test(x.bridge) ? "https://claude.ai/code/" + x.bridge : "claude://";
        await notify("claude-wait-" + key, "「" + x.title + "」" + STATE[x.state][0], x.ask || "點一下打開 Claude 回應。", { url });
        seen.add(key);
      } catch (e) { console.log("等待通知失敗：" + e); }
    }
    MEMO.waited = [...seen].slice(-50);
  }
  // 8. Reminders and calendar (asks for permission the first time; turn on in the settings page).
  const week = main.find(x => x.label === "每週");
  if (SETTINGS.weeklyReminder && week && limitPct(week) >= SETTINGS.highAt && MEMO.reminderFor !== week.resets) {
    try {
      const r = new Reminder();
      r.title = "Claude 每週額度已用 " + limitPct(week) + "%";
      r.notes = resetText(week, false);
      r.dueDate = new Date(now + 60 * 60 * 1000);
      r.calendar = await Calendar.defaultForReminders();
      r.save();
      MEMO.reminderFor = week.resets;
    } catch (e) { console.log("建立提醒事項失敗：" + e); }
  }
  if (SETTINGS.calendarReset && week && week.resets && MEMO.eventFor !== week.resets) {
    try {
      const ev = new CalendarEvent();
      ev.title = "Claude 每週額度重置";
      ev.startDate = new Date(week.resets);
      ev.endDate = new Date(new Date(week.resets).getTime() + 15 * 60 * 1000);
      ev.calendar = await Calendar.defaultForEvents();
      ev.save();
      MEMO.eventFor = week.resets;
    } catch (e) { console.log("寫入行事曆失敗：" + e); }
  }
  // 5. New version on GitHub? Only reads a tiny text file, at most every 12 hours; nothing is sent.
  if (SETTINGS.checkUpdates && (!MEMO.checkedAt || now - MEMO.checkedAt > 12 * 3600 * 1000)) {
    await checkUpdate();
  }
  writeJSON(STATE_PATH, MEMO);
}
async function checkUpdate() {
  try {
    const r = new Request("https://raw.githubusercontent.com/" + REPO + "/main/VERSION");
    r.timeoutInterval = 8;
    const v = (await r.loadString()).trim();
    if (/^\d{4}\.\d{1,2}\.\d{1,2}(\.\d+)?$/.test(v)) { MEMO.latest = v; MEMO.checkedAt = Date.now(); }
  } catch (e) { console.log("檢查更新失敗：" + e); }
}
function newer(a, b) {  // is version a newer than b?
  const x = String(a || "").split(".").map(Number), y = String(b || "").split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}
function hasUpdate() { return SETTINGS.checkUpdates && newer(MEMO.latest, VERSION); }

// Replace this script with the newest one from GitHub (only when you tap it in the settings page).
async function selfUpdate() {
  const r = new Request("https://raw.githubusercontent.com/" + REPO + "/main/ios/" + encodeURIComponent("Claude Token 用量.js"));
  r.timeoutInterval = 20;
  const code = await r.loadString();
  if (!code.includes("Script.setWidget") || !code.includes("const VERSION")) throw new Error("下載的內容不像這個小工具");
  // A page copy ("Claude Token 用量・速度") updates the main script; the Mac rewrites the copies from it.
  const own = module.filename;
  const target = fm.fileName(own).includes("・") ? fm.joinPath(fm.documentsDirectory(), MAIN_SCRIPT + ".js") : own;
  fm.writeString(target, code);
}

// ---------- App 裡的設定頁 ----------
async function info(title, message) {
  const a = new Alert();
  a.title = title;
  a.message = message;
  a.addAction("好");
  await a.present();
}
async function settingsPage(data) {
  const t = new UITable();
  t.showSeparators = true;
  const save = () => writeJSON(SETTINGS_PATH, SETTINGS);
  const header = text => { const r = new UITableRow(); r.isHeader = true; r.addText(text); t.addRow(r); };
  const action = (title, sub, fn, dismiss) => {
    const r = new UITableRow();
    r.height = sub ? 60 : 44;
    r.addText(title, sub);
    r.dismissOnSelect = !!dismiss;
    r.onSelect = async () => { await fn(); render(); };
    t.addRow(r);
  };
  const toggle = (key, title, sub) => action((SETTINGS[key] ? "☑︎  " : "☐  ") + title, sub, () => { SETTINGS[key] = !SETTINGS[key]; save(); });
  const preview = async (page, fam) => {
    BIG = fam === "large";
    const w = build(page, data, fam);
    if (fam === "accessoryRectangular") await w.presentAccessoryRectangular();
    else if (fam === "accessoryCircular") await w.presentAccessoryCircular();
    else if (fam === "small") await w.presentSmall();
    else if (fam === "medium") await w.presentMedium();
    else await w.presentLarge();
  };
  // One row per page: its name, then 小／中／大 buttons that open that size's preview.
  const sizeRow = (name, page) => {
    const r = new UITableRow();
    r.height = 48;
    const n = r.addText(name);
    n.widthWeight = 40;
    [["小", "small"], ["中", "medium"], ["大", "large"]].forEach(([label, fam]) => {
      const b = r.addButton(label);
      b.widthWeight = 20;
      b.centerAligned();
      b.onTap = async () => { await preview(page, fam); render(); };
    });
    t.addRow(r);
  };
  function render() {
    t.removeAllRows();
    header("預覽（點小／中／大）");
    PAGES.forEach(([name, page]) => sizeRow(name, page));
    action("鎖定畫面・長方形", null, () => preview(usagePage, "accessoryRectangular"));
    action("鎖定畫面・圓形", null, () => preview(usagePage, "accessoryCircular"));
    header("通知");
    toggle("notifyReset", "額度重置時通知", "5 小時與每週額度回滿的那一刻（事先排好，時間準）");
    toggle("notifyHigh", "5 小時額度用到 " + SETTINGS.highAt + "% 時通知", "每個 5 小時區段最多一次");
    action("　門檻：" + SETTINGS.highAt + "%（點一下切換 70／80／90）", null, () => {
      SETTINGS.highAt = SETTINGS.highAt >= 90 ? 70 : SETTINGS.highAt + 10; save(); });
    toggle("notifyWaiting", "有 session 等你回應時通知", "小工具刷新時才會發現，可能晚幾分鐘");
    // iOS usually shows no banner for an app that is open in front, so the test fires 5 s later:
    // schedule it, then go to the Home Screen or lock the phone.
    action("送一則測試通知（5 秒後）", "按下後回到主畫面或鎖定螢幕", async () => {
      try {
        await notify("claude-test", "Claude 用量小工具", "通知正常運作。", { at: new Date(Date.now() + 5000) });
        await info("已排定測試通知", "5 秒後送出。請現在回到主畫面或鎖定螢幕；App 開在前景時 iOS 通常不會跳出橫幅。");
      } catch (e) { await info("排定失敗", String(e)); }
    });
    action("查看已排定與已送出的通知", "確認通知有沒有排上", async () => {
      try {
        const pending = await Notification.allPending(), delivered = await Notification.allDelivered();
        const line = n => "・" + n.title + (n.nextTriggerDate ? "（" + shortTime(n.nextTriggerDate.toISOString()) + "）" : "");
        await info("通知", "已排定 " + pending.length + " 則\n" + pending.map(line).join("\n") +
          "\n\n通知中心裡還有 " + delivered.length + " 則\n" + delivered.slice(0, 5).map(line).join("\n"));
      } catch (e) { await info("讀取失敗", String(e)); }
    });
    header("外觀");
    toggle("transparent", "透明背景", "顯示桌布（iOS 27.2 以上才有效）");
    toggle("refreshButton", "點標題列重新整理 ↻", "點小工具最上面那一列就地重畫，不必打開 Scriptable（iOS 17 以上）");
    action("主題：" + ({ default: "預設", warm: "暖橘漸層", night: "夜空" }[SETTINGS.theme] || "預設") + "（點一下切換）", null, () => {
      const order = ["default", "warm", "night"]; SETTINGS.theme = order[(order.indexOf(SETTINGS.theme) + 1) % order.length]; save(); });
    header("提醒事項與行事曆");
    toggle("weeklyReminder", "每週額度用到 " + SETTINGS.highAt + "% 時建提醒事項", "第一次會詢問提醒事項權限");
    toggle("calendarReset", "把每週額度重置時間寫進行事曆", "第一次會詢問行事曆權限");
    header("版本");
    toggle("checkUpdates", "自動檢查新版", "每 12 小時讀一次 GitHub 上的版本號，不傳出任何資料");
    action("目前 " + VERSION + (MEMO.latest ? "・GitHub 最新 " + MEMO.latest : ""), "點一下立刻檢查", async () => {
      await checkUpdate(); writeJSON(STATE_PATH, MEMO); });
    if (hasUpdate()) action("更新到 " + MEMO.latest, "從 GitHub 下載新版取代這個腳本，完成後重新執行", async () => {
      try { await selfUpdate(); const a = new Alert(); a.title = "已更新"; a.message = "請關掉後重新執行腳本。"; a.addAction("好"); await a.present(); }
      catch (e) { const a = new Alert(); a.title = "更新失敗"; a.message = String(e); a.addAction("好"); await a.present(); } }, true);
    t.reload();
  }
  render();
  await t.present(true);
}

// ---------- 主程式 ----------
const PAGES = [["用量", usagePage], ["趣味", funPage], ["更多", morePage], ["狀態", statusPage], ["寵物", petPage], ["額度", limitsPage], ["日曆", calendarPage], ["洞察", insightPage], ["速度", speedPage]];
// Page copies made by the Mac are named "Claude Token 用量・<頁名>", so they pick their page from their own name
// and the Parameter field can stay empty. A typed Parameter still wins.
const MAIN_SCRIPT = "Claude Token 用量";
function pageFromName() {
  const n = String(Script.name() || "");
  const i = n.lastIndexOf("・");
  return i >= 0 ? n.slice(i + 1) : "";
}
function pickPage(param) {
  const p = String(param || "").replace(/\s+/g, "").toLowerCase();
  if (p.includes("速度") || p.includes("speed")) return speedPage;
  if (p.includes("洞察") || p.includes("insight")) return insightPage;
  if (p.includes("日曆") || p.includes("calendar")) return calendarPage;
  if (p.includes("額度") || p.includes("limit")) return limitsPage;
  if (p.includes("寵物") || p.includes("小克") || p.includes("pet")) return petPage;
  if (p.includes("狀態") || p.includes("status")) return statusPage;
  if (p.includes("更多") || p.includes("more")) return morePage;
  if (p.includes("趣") || p.includes("fun")) return funPage;
  return usagePage;
}
function newWidget() {
  const w = new ListWidget();
  w.setPadding(12, 14, 12, 14);
  w.refreshAfterDate = nextRefresh(null);
  return w;
}

// iCloud may hand back nothing while the Mac is rewriting the file or the copy is not downloaded yet,
// so fall back to the last good copy kept on the phone.
async function loadData() {
  const local = FileManager.local();
  const cache = local.joinPath(local.cacheDirectory(), "claude-usage-last-good.json");
  try {
    if (fm.fileExists(path)) {
      await fm.downloadFileFromiCloud(path);
      const d = JSON.parse(fm.readString(path) || "null");
      if (d && d.last30 && d.daily) {
        local.writeString(cache, JSON.stringify(d));
        return d;
      }
    }
  } catch (e) {
    console.log("讀取 claude-usage.json 失敗：" + e);
  }
  if (local.fileExists(cache)) {
    try { return JSON.parse(local.readString(cache)); } catch (e) {}
  }
  return null;
}

// Ask iOS to refresh in 5 minutes, or 30 s after the next limit resets if that comes sooner,
// so a reset shows up as 0% without waiting. iOS treats this as a hint and may come later.
// If the copy iCloud handed us is already old (the phone had not downloaded the Mac's newer file yet),
// the download has just been requested, so ask iOS to come back in 2 minutes instead of 5.
function nextRefresh(data) {
  const stale = data && data.generated && Date.now() - new Date(data.generated).getTime() > 10 * 60 * 1000;
  let t = Date.now() + (stale ? 2 : 5) * 60 * 1000;
  ((data && data.limits) || []).forEach(x => {
    const r = x.resets ? new Date(x.resets).getTime() + 30000 : 0;
    if (r > Date.now() && r < t) t = r;
  });
  return new Date(t);
}

function build(page, data, family) {
  // iPad extra large sizes (9): use the roomy large layout; it sits centred in the wider widget.
  if (family === "extraLarge" || family === "extraLargePortrait") family = "large";
  BIG = family === "large";
  const w = newWidget();
  if (!String(family).startsWith("accessory")) {  // the lock screen keeps the system's own background
    if (!applyTheme(w)) w.backgroundColor = C.bg;  // a gradient theme sets its own background
  }
  w.refreshAfterDate = nextRefresh(data);
  if (!data) {
    header(w, null, "Claude");
    w.addSpacer(8);
    label(w, "暫時讀不到用量資料", 13, C.text, "bold");
    const t = label(w, "iCloud 可能還在同步，稍後會自動重試；也可以點一下小工具重新執行。", 10, C.dim);
    t.lineLimit = 3;
    w.addSpacer();
  } else if (String(family).startsWith("accessory")) {
    lockPage(w, data, family);  // lock screen: one design for every parameter
  } else {
    page(w, data, family);
    if (hasUpdate() && family !== "small") {
      w.addSpacer(2);
      const u = w.addStack();
      u.addSpacer();
      sym(u, "arrow.down.circle.fill", 9, C.cache, "↓");
      u.addSpacer(3);
      label(u, "有新版 " + MEMO.latest + "，在 Scriptable 執行腳本即可更新", 8, C.cache);
    }
  }
  return w;
}

const data = await loadData();
if (config.runsInWidget) {
  Script.setWidget(build(pickPage(args.widgetParameter || pageFromName()), data, config.widgetFamily || "large"));
  try { await sideEffects(data); } catch (e) { console.log(e); }
} else if (!config.runsInApp) {
  // Run from Shortcuts or Siri: no menu; loading the data above already refreshed the phone's cached copy.
  // Hand back a sentence Siri can read out.
  Script.setShortcutOutput(spokenSummary(data));
  if (config.runsWithSiri) Speech.speak(spokenSummary(data));  // (4) Siri reads it out, no extra Shortcuts action needed
  try { await sideEffects(data); } catch (e) { console.log(e); }
} else {
  // Run inside the app: the settings page (previews, notifications, look, reminders, updates).
  try { await sideEffects(data); } catch (e) { console.log(e); }
  await settingsPage(data);
}
Script.complete();
