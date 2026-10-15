/* 花田喝水 · 大脑：喝水让小花开 */
const KEY = "flower-water-v1";   // 手机本地小仓库的名字，和待办版分开，互不干扰
const DAY_START = 7;             // 喝水窗口：早上 7 点开始算
const DAY_END = 22;              // 晚上 10 点结束

const todayMlEl = document.getElementById("today-ml");
const goalMlEl = document.getElementById("goal-ml");
const pctEl = document.getElementById("pct");
const barFillEl = document.getElementById("bar-fill");
const nudgeEl = document.getElementById("nudge");
const logListEl = document.getElementById("log-list");
const emptyTipEl = document.getElementById("empty-tip");
const streakEl = document.getElementById("streak");
const weekEl = document.getElementById("week-chart");
const petals = document.querySelectorAll("#petals .vivid");
const goalInput = document.getElementById("goal-input");

let store = load();

/* ---------- 存取：整个 App 的数据就是这一个小对象 ---------- */
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY)) || {};
    return { goal: s.goal || 2000, days: s.days || {} };
  } catch { return { goal: 2000, days: {} }; }
}
function save() {
  localStorage.setItem(KEY, JSON.stringify(store));
}
function todayKey(d) {
  d = d || new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function dayTotal(key) {
  return (store.days[key] || []).reduce((a, e) => a + e.ml, 0);
}

/* ---------- 记录一杯水（快捷按钮和滑块都走这里） ---------- */
const SCALE = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66, 1318.51]; // 五声音阶上行
let actx = null;
/* 水滴钢琴：用代码直接合成钢琴味，不用传音频文件；第几杯就弹第几个音，越喝越高 */
function piano(freq) {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    const t0 = actx.currentTime;
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.015);  // 像琴键敲下去，起音快
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4); // 尾音慢慢消失
    g.connect(actx.destination);
    [[1, "triangle", 0.6], [2, "sine", 0.25], [1.005, "sine", 0.2]].forEach(function (cfg) {
      const o = actx.createOscillator();
      o.type = cfg[1]; o.frequency.value = freq * cfg[0];
      const og = actx.createGain(); og.gain.value = cfg[2];
      o.connect(og); og.connect(g);
      o.start(t0); o.stop(t0 + 1.5);
    });
  } catch (e) {}
}
function addWater(ml) {
  const key = todayKey();
  if (!store.days[key]) store.days[key] = [];
  store.days[key].push({ ts: Date.now(), ml });  // ts 是时间戳，删除时用来认出它
  piano(SCALE[(store.days[key].length - 1) % SCALE.length]); // 第 n 杯弹第 n 个音
  save();
  render();   // 界面立刻重画：数字、花、进度条一起动
}
document.querySelector(".add").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-ml]");
  if (!btn) return;
  addWater(parseInt(btn.dataset.ml, 10));
});

/* ---------- 自定义一杯：滑块 0~500ml，每格 50 ---------- */
const slider = document.getElementById("ml-slider");
const mlVal = document.getElementById("ml-val");
slider.addEventListener("input", () => {
  mlVal.textContent = slider.value + " ml";  // 手指一动数字就变
});
document.getElementById("ml-add").addEventListener("click", () => {
  const ml = parseInt(slider.value, 10);
  if (!ml) return;  // 滑到 0 就不记了
  addWater(ml);
});

/* ---------- 背景音乐：浏览器规定，必须点了屏幕才能出声 ---------- */
const bgmEl = document.getElementById("bgm");
const bgmBtn = document.getElementById("bgm-toggle");
let bgmOn = true;
try { bgmOn = localStorage.getItem("flower-water-bgm") !== "off"; } catch (e) {}
bgmEl.volume = 0.45;
function refreshBgmBtn() { bgmBtn.textContent = bgmOn ? "🔊" : "🔇"; }
document.addEventListener("pointerdown", function kick() {
  document.removeEventListener("pointerdown", kick);
  if (bgmOn) bgmEl.play().catch(() => {});  // 第一次触碰时起音乐
});
bgmBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  bgmOn = !bgmOn;
  try { localStorage.setItem("flower-water-bgm", bgmOn ? "on" : "off"); } catch (e2) {}
  if (bgmOn) bgmEl.play().catch(() => {}); else bgmEl.pause();
  refreshBgmBtn();
});
refreshBgmBtn();

/* ---------- 删除一条记录（点错了可以反悔） ---------- */
logListEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-ts]");
  if (!btn) return;
  const key = todayKey();
  store.days[key] = (store.days[key] || []).filter((x) => String(x.ts) !== btn.dataset.ts);
  save();
  render();
});

/* ---------- 改每日目标 ---------- */
document.getElementById("goal-save").addEventListener("click", () => {
  let v = parseInt(goalInput.value, 10);
  if (!v || v < 500) v = 500;       // 目标太小没有意义，兜底 500
  if (v > 5000) v = 5000;           // 太大喝不完，兜底 5000
  store.goal = v;
  save();
  render();
});

/* ---------- 督促语：拿"应该喝到的量"和"实际喝到的量"比 ---------- */
function nudgeText(total, goal) {
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  const expected = Math.min(Math.max((h - DAY_START) / (DAY_END - DAY_START), 0), 1); // 按时间算应该喝了多少
  const actual = total / goal;
  if (actual >= 1) return "今日目标达成！小花开得正艳 🎉";
  if (total === 0) return "新的一天，陪小花喝第一口水 🌱";
  if (actual >= expected) return "节奏刚刚好，继续保持 🌼";
  if (actual >= expected * 0.5) return "稍微落后一点点，来一口 💧";
  return "小花快渴扁了，救救它 💧";
}

/* ---------- 连续达标天数：从昨天往前数，断了就停 ---------- */
function calcStreak() {
  let n = 0;
  const d = new Date();
  if (dayTotal(todayKey(d)) < store.goal) d.setDate(d.getDate() - 1); // 今天还没达标就从昨天开始数
  while (dayTotal(todayKey(d)) >= store.goal) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* ---------- 把数据画成界面 ---------- */
function render() {
  const key = todayKey();
  const total = dayTotal(key);
  const goal = store.goal;
  const ratio = Math.min(total / goal, 1);

  // 数字 + 进度条
  todayMlEl.textContent = total;
  goalMlEl.textContent = goal;
  pctEl.textContent = Math.round(ratio * 100) + "%";
  barFillEl.style.width = (ratio * 100) + "%";

  // 花开：8 片花瓣按进度依次变粉
  const bloom = ratio * petals.length;
  petals.forEach((p, i) => {
    p.style.opacity = Math.min(Math.max(bloom - i, 0), 1); // 第 i 片花了多少就开多少
  });

  // 督促语
  nudgeEl.textContent = nudgeText(total, goal);

  // 今日记录（新的在上面）
  const entries = (store.days[key] || []).slice().reverse();
  logListEl.innerHTML = "";
  for (const en of entries) {
    const li = document.createElement("li");
    const t = new Date(en.ts);
    const hh = String(t.getHours()).padStart(2, "0"), mm = String(t.getMinutes()).padStart(2, "0");
    li.innerHTML = '<span class="t">' + hh + ":" + mm + '</span>' +
      '<span class="m">+' + en.ml + " ml</span>" +
      '<button class="icon-btn" data-ts="' + en.ts + '" aria-label="删除">✕</button>';
    logListEl.appendChild(li);
  }
  emptyTipEl.style.display = entries.length ? "none" : "block";

  // 连续打卡
  streakEl.textContent = calcStreak();

  // 近 7 天小柱子
  weekEl.innerHTML = "";
  const d = new Date();
  const bars = [];
  for (let i = 6; i >= 0; i--) {
    const dd = new Date(d); dd.setDate(dd.getDate() - i);
    bars.push({ k: todayKey(dd), label: (dd.getMonth() + 1) + "/" + dd.getDate() });
  }
  for (const b of bars) {
    const r = Math.min(dayTotal(b.k) / goal, 1);
    const col = document.createElement("div");
    col.className = "wcol";
    col.innerHTML = '<div class="wbar"><div class="wfill" style="height:' + Math.round(r * 100) + '%"></div></div>' +
      '<span>' + b.label + "</span>";
    weekEl.appendChild(col);
  }

  goalInput.value = goal;
}

/* PWA：注册 service worker，离线也能打开 */
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

render();
