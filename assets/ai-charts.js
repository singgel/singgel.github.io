"use strict";

const CHART_DAY = 86400000;
const MODEL_COLORS = ["#d34e31", "#497ba3", "#23877c", "#8a6aac", "#b68a24", "#6f7e87"];

function chartDate(value) {
  if (typeof value !== "string" || !/(Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) return null;
  const original = value.slice(0, 10);
  if (!/^\d{4}-\d\d-\d\d$/.test(original) || new Date(`${original}T00:00:00Z`).toISOString().slice(0, 10) !== original) return null;
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const get = (name) => parts.find((part) => part.type === name).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function resetURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && ["x.com", "twitter.com"].includes(url.hostname) && /^\/thsottiaux\/status\/\d{10,25}$/.test(url.pathname) ? `https://x.com${url.pathname}` : null;
  } catch { return null; }
}

function resetEvents(history, discovery = {}) {
  const events = new Map();
  const sources = new Set();
  const facts = new Set();
  const verified = (Array.isArray(history?.events) ? history.events : []).slice().sort((a, b) => Number(b?.state === "confirmed") - Number(a?.state === "confirmed"));
  for (const event of verified) {
    if (!event?.id || !chartDate(event.published_at) || !["reset", "card"].includes(event.kind) || !["confirmed", "announced"].includes(event.state) || !Array.isArray(event.sources) || !event.sources.length || event.sources.some((source) => !resetURL(source?.url))) continue;
    const key = `verified:${event.id}`;
    if (events.has(key)) continue;
    if (event.sources.some((source) => facts.has(`${event.kind}:${resetURL(source.url)}`))) continue;
    events.set(key, { ...event, day: chartDate(event.published_at) });
    event.sources.forEach((source) => { sources.add(resetURL(source.url)); facts.add(`${event.kind}:${resetURL(source.url)}`); });
  }
  for (const item of discovery.entries || []) {
    const url = resetURL(item.url);
    if (!url || sources.has(url) || !chartDate(item.published_at)) continue;
    sources.add(url);
    events.set(`candidate:${url}`, { id: url, kind: "unknown", state: "unconfirmed", published_at: item.published_at, day: chartDate(item.published_at), summary: "发现重置关键词，事件类型与适用范围仍待核实。", scope: "尚未核实", sources: [{ url, role: "candidate" }] });
  }
  return [...events.values()].sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
}

function resetWindow(events, now = Date.now()) {
  const confirmed = events.filter((event) => event.state === "confirmed" && Date.parse(event.published_at) <= now);
  const latest = confirmed.find((event) => event.kind === "reset");
  const hours = latest ? Math.max(0, (now - Date.parse(latest.published_at)) / 3600000) : null;
  const recent = confirmed.filter((event) => now - Date.parse(event.published_at) <= 90 * CHART_DAY);
  return { latest, hours, resets: recent.filter((event) => event.kind === "reset").length, cards: recent.filter((event) => event.kind === "card").length };
}

function calendarDays(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Invalid calendar month");
  const first = new Date(`${month}-01T00:00:00Z`);
  const start = first.getTime() - ((first.getUTCDay() + 6) % 7) * CHART_DAY;
  return Array.from({ length: 42 }, (_, index) => new Date(start + index * CHART_DAY).toISOString().slice(0, 10));
}

function benchmarkPoints(benchmark) {
  if (!benchmark || !Array.isArray(benchmark.entries)) return [];
  const seen = new Set();
  return benchmark.entries.filter((point) => {
    const identity = point && `${point.series_id || `${point.model}|${point.harness || ""}|${point.agent_version || ""}`}|${point.effort || ""}`;
    if (typeof point?.model !== "string" || typeof point.family !== "string" || !Number.isFinite(point.score) || point.score < 0 || point.score > 100 || !Number.isFinite(point.cost_usd) || point.cost_usd <= 0 || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  }).map((point) => ({ ...point, cost_cny: point.cost_usd * 6.6862 }));
}

function createAICharts(doc, win, clock = Date.now) {
  if (!doc.getElementById("reset-pulse")) return null;
  const get = (id) => doc.getElementById(id);
  const node = (tag, text, className) => {
    const element = doc.createElement(tag);
    if (text !== undefined) element.textContent = String(text);
    if (className) element.className = className;
    return element;
  };
  const format = (value) => new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
  let history = { events: [] };
  let discovery = {};
  let benchmark = null;
  let events = [];
  let selected = chartDate(new Date(clock()).toISOString());
  let month = selected.slice(0, 7);
  let period = 14;
  const hidden = new Set();
  const charts = new Map();
  let suspended = false;
  let disposed = false;
  function plot(id, config) {
    if (suspended || disposed) return;
    charts.get(id)?.destroy();
    if (typeof win.Chart !== "function") return;
    config.options = { responsive: true, maintainAspectRatio: false, animation: false, ...config.options };
    charts.set(id, new win.Chart(get(id), config));
  }
  function palette() {
    const styles = win.getComputedStyle?.(doc.documentElement);
    return { ink: styles?.getPropertyValue("--ink").trim() || "#222725", muted: styles?.getPropertyValue("--muted").trim() || "#606760", line: styles?.getPropertyValue("--line").trim() || "#d8dbd2" };
  }
  function renderCalendar() {
    get("reset-month").textContent = month.replace("-", " 年 ") + " 月";
    get("reset-calendar").replaceChildren(...calendarDays(month).map((day) => {
      const records = events.filter((event) => event.day === day);
      const button = node("button", undefined, `reset-day${day.slice(0, 7) === month ? "" : " reset-outside"}`);
      button.type = "button";
      button.setAttribute("aria-label", `${day}${records.length ? `，${records.length} 条记录` : "，未收录记录"}`);
      button.setAttribute("aria-pressed", String(day === selected));
      button.append(node("span", Number(day.slice(8))));
      if (records.length) button.append(node("small", records.some((event) => event.kind === "card") ? "发卡" : records.some((event) => event.state === "confirmed") ? "确认" : "待核实"));
      button.addEventListener("click", () => select(day));
      return button;
    }));
  }
  function renderDetails() {
    const records = events.filter((event) => event.day === selected);
    get("reset-selected").textContent = selected;
    get("reset-selection-status").textContent = `${records.length} 条已收录记录 · 北京时间`;
    const cards = records.map((event) => {
      const card = node("article", undefined, "reset-event");
      const label = event.state === "confirmed" ? "原帖已确认" : event.state === "announced" ? "曾有预告 · 完成待核实" : "关键词线索 · 待核实";
      card.append(node("p", label, "reset-event-state"), node("h4", event.kind === "card" ? "重置卡发放" : event.kind === "reset" ? "重置公告" : "待核实线索"), node("p", event.summary), node("p", `适用范围：${event.scope}`, "ai-caption"), node("p", `原帖时间 ${format(event.published_at)}${event.timestamp_basis === "snowflake" ? " · 由帖文 ID 推导" : ""}；不是个人到账时间。`, "ai-caption"));
      event.sources.forEach((source) => {
        const a = node("a", source.role === "confirmation" ? "查看确认原帖 ↗" : source.role === "candidate" ? "查看待核实原帖 ↗" : "查看预告原帖 ↗", "text-link");
        a.href = resetURL(source.url); a.target = "_blank"; a.rel = "noopener noreferrer"; card.append(a);
      });
      return card;
    });
    get("reset-event-details").replaceChildren(...(cards.length ? cards : [node("p", "本站未收录这一天的事件，不代表当天没有重置。", "ai-caption")]));
  }
  function select(day) { selected = day; month = day.slice(0, 7); renderCalendar(); renderDetails(); }
  function renderReset() {
    if (suspended || disposed) return;
    events = resetEvents(history, discovery);
    const now = clock();
    const state = resetWindow(events, now);
    get("reset-elapsed").textContent = state.hours === null ? "—" : state.hours < 1 ? "< 1h" : `${state.hours.toFixed(1)}h`;
    get("reset-last").textContent = state.latest ? `最近确认 ${format(state.latest.published_at)}` : "尚无已核验的重置确认";
    get("reset-count").textContent = state.resets;
    get("reset-card-count").textContent = state.cards;
    get("reset-record-count").textContent = events.length;
    get("reset-curated-at").textContent = history.reviewed_at ? `人工核验 ${format(history.reviewed_at)}` : "历史记录尚未加载";
    const colors = palette();
    const elapsed = state.hours === null ? 0 : Math.min(state.hours / 48, 1);
    plot("reset-gauge", { type: "doughnut", data: { datasets: [{ data: [elapsed, 1 - elapsed], backgroundColor: ["#10b6bf", colors.line], borderWidth: 0, borderRadius: 10 }] }, options: { cutout: "86%", plugins: { legend: { display: false }, tooltip: { enabled: false } } } });
    const min = now - period * CHART_DAY;
    const max = now + 2 * CHART_DAY;
    const visible = events.filter((event) => Date.parse(event.published_at) >= min && Date.parse(event.published_at) <= now);
    const groups = [
      { label: "确认重置", color: "#10aeb7", match: (event) => event.kind === "reset" && event.state === "confirmed", y: 1 },
      { label: "确认发卡", color: "#bd8b35", match: (event) => event.kind === "card" && event.state === "confirmed", y: .72 },
      { label: "预告 / 待核实", color: "#8f79ac", match: (event) => event.state !== "confirmed", y: .46 },
    ];
    const datasets = groups.map((group) => ({ label: group.label, borderColor: group.color, backgroundColor: group.color, pointRadius: 6, pointHoverRadius: 9, showLine: true, borderWidth: 2, data: visible.filter(group.match).sort((a, b) => Date.parse(a.published_at) - Date.parse(b.published_at)).flatMap((event) => [{ x: Date.parse(event.published_at), y: 0, event }, { x: Date.parse(event.published_at), y: group.y, event }, { x: Date.parse(event.published_at), y: null }]) }));
    plot("reset-pulse", { type: "scatter", data: { datasets }, plugins: [{ id: "observationWindow", beforeDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      const x = scales.x.getPixelForValue(now);
      ctx.save(); ctx.fillStyle = "rgba(16,174,183,.055)"; ctx.fillRect(x, chartArea.top, chartArea.right - x, chartArea.bottom - chartArea.top); ctx.strokeStyle = "#26a275"; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = colors.muted; ctx.font = "11px sans-serif"; ctx.fillText("Now", x + 5, chartArea.top + 14); ctx.fillText("未来 48h · 未知", Math.min(x + 5, chartArea.right - 100), chartArea.bottom - 12); ctx.restore();
    } }], options: { layout: { padding: { top: 16, right: 12 } }, scales: { x: { type: "linear", min, max, ticks: { maxTicksLimit: 9, color: colors.muted, callback: (value) => chartDate(new Date(value).toISOString()).slice(5).replace("-", "/") }, grid: { color: colors.line } }, y: { min: 0, max: 1.18, display: false } }, plugins: { legend: { position: "bottom", labels: { color: colors.ink, usePointStyle: true, boxWidth: 7, padding: 18 } }, tooltip: { filter: (item) => item.raw.y > 0, callbacks: { title: (items) => items[0] ? format(items[0].raw.event.published_at) : "", label: (item) => item.raw.event.summary } } }, onClick: (_event, active, chart) => { if (active[0]) select(chart.data.datasets[active[0].datasetIndex].data[active[0].index].event.day); } } });
    renderCalendar(); renderDetails();
  }
  function renderBenchmark() {
    if (suspended || disposed) return;
    const all = benchmarkPoints(benchmark);
    const harness = get("model-harness").value || "all";
    const points = all.filter((point) => harness === "all" || point.harness === harness);
    const families = [...new Set(points.map((point) => point.family))];
    get("model-chart-state").textContent = points.length ? `${benchmark.name} ${benchmark.version} · ${points.length} 个公开样本（非完整排行）${benchmark.status === "stale" ? " · 读取失败，保留旧结果" : ""}` : "此范围暂无成本数据，可切换 Agent 或查看下方 Arena 偏好榜。";
    get("model-chart-date").textContent = benchmark?.checked_at ? `读取 ${format(benchmark.checked_at)} · 非实时 API 报价` : "";
    get("model-toggles").replaceChildren(...families.map((family, index) => {
      const button = node("button", family, "model-toggle");
      button.type = "button"; button.style.borderColor = MODEL_COLORS[index % MODEL_COLORS.length]; button.setAttribute("aria-pressed", String(!hidden.has(family)));
      button.addEventListener("click", () => { hidden.has(family) ? hidden.delete(family) : hidden.add(family); renderBenchmark(); });
      return button;
    }));
    const colors = palette();
    const series = [...new Set(points.map((point) => point.series_id || point.model))];
    const datasets = series.map((id) => {
      const members = points.filter((point) => (point.series_id || point.model) === id);
      const family = members[0].family;
      const index = families.indexOf(family);
      return { label: members[0].model, hidden: hidden.has(family), data: members.sort((a, b) => a.cost_cny - b.cost_cny).map((point) => ({ x: point.cost_cny, y: point.score, ...point })), borderColor: MODEL_COLORS[index % MODEL_COLORS.length], backgroundColor: MODEL_COLORS[index % MODEL_COLORS.length], pointStyle: ["circle", "rect", "triangle", "rectRot", "crossRot", "star"][index % 6], pointRadius: 7, pointHoverRadius: 10, borderWidth: 2, showLine: members.length > 1 };
    });
    const pointLabels = { id: "pointLabels", afterDatasetsDraw(chart) {
      const { ctx, chartArea } = chart;
      const boxes = [];
      let labelled = 0;
      ctx.save(); ctx.font = `${chart.width < 500 ? 10 : 11}px sans-serif`; ctx.fillStyle = colors.ink; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      chart.data.datasets.forEach((dataset, index) => {
        if (dataset.hidden) return;
        chart.getDatasetMeta(index).data.forEach((point, pointIndex) => {
          if (chart.width < 500 && labelled >= 6) return;
          const text = dataset.data[pointIndex].model;
          const width = ctx.measureText(text).width;
          for (const [dx, dy] of [[10, -10], [10, 20], [-width - 10, -10], [-width - 10, 20]]) {
            const x = Math.max(chartArea.left, Math.min(point.x + dx, chartArea.right - width));
            const y = Math.max(chartArea.top + 12, Math.min(point.y + dy, chartArea.bottom - 4));
            const box = { left: x - 3, right: x + width + 3, top: y - 12, bottom: y + 4 };
            if (boxes.some((old) => box.left < old.right && box.right > old.left && box.top < old.bottom && box.bottom > old.top)) continue;
            ctx.fillText(text, x, y); boxes.push(box); labelled += 1; break;
          }
        });
      });
      ctx.restore();
    } };
    const costs = points.map((point) => point.cost_cny);
    plot("model-cost-chart", { type: "scatter", data: { datasets }, plugins: [pointLabels], options: { layout: { padding: { top: 20, right: 12 } }, scales: { x: { type: get("model-cost-scale").value, ...(costs.length ? { min: get("model-cost-scale").value === "linear" ? 0 : Math.min(...costs) * .8, max: Math.max(...costs) * 1.2 } : {}), title: { display: true, text: "平均单任务成本 / CNY（越左越便宜）", color: colors.muted }, ticks: { color: colors.muted, callback: (value) => `¥${Number(value).toFixed(value < 1 ? 2 : 1)}`, maxTicksLimit: 9 }, grid: { color: colors.line } }, y: { min: 0, max: 100, title: { display: true, text: "完整任务成功率 / %（越高越好）", color: colors.muted }, ticks: { color: colors.muted, callback: (value) => `${value}%` }, grid: { color: colors.line } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { title: (items) => items[0]?.raw.model || "", label: (item) => [`成功率 ${item.raw.score.toFixed(2)}%`, `¥${item.raw.cost_cny.toFixed(3)} / task`, `$${item.raw.cost_usd.toFixed(3)} / task`, `${item.raw.harness || ""} ${item.raw.agent_version || ""} · ${item.raw.effort || ""}`, `${item.raw.n_trials || "—"} 次运行（含失败）`] } } } } });
    get("model-cost-table").replaceChildren(...points.map((point) => { const row = node("tr"); row.append(node("td", point.model), node("td", `${point.score.toFixed(2)}%`), node("td", `¥${point.cost_cny.toFixed(3)}`)); return row; }));
  }
  async function readJSON(url) {
    const controller = new AbortController();
    const timer = win.setTimeout(() => controller.abort(), 8000);
    try { const response = await win.fetch(url, { cache: "no-cache", signal: controller.signal }); if (!response.ok) throw new Error("Chart source unavailable"); return await response.json(); }
    finally { win.clearTimeout(timer); }
  }
  get("model-cost-scale").addEventListener("change", renderBenchmark);
  get("model-harness").addEventListener("change", renderBenchmark);
  get("reset-period").addEventListener("change", () => { period = Number(get("reset-period").value); renderReset(); });
  get("reset-today").addEventListener("click", () => select(chartDate(new Date(clock()).toISOString())));
  get("reset-latest").addEventListener("click", () => { if (events[0]) select(events[0].day); });
  for (const [id, direction] of [["reset-prev-month", -1], ["reset-next-month", 1]]) get(id).addEventListener("click", () => { const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + direction); month = date.toISOString().slice(0, 7); renderCalendar(); });
  let observer;
  let timer = null;
  if (win.MutationObserver) { observer = new win.MutationObserver(() => { renderReset(); renderBenchmark(); }); observer.observe(doc.documentElement, { attributes: true, attributeFilter: ["data-theme"] }); }
  const onClose = () => { suspended = true; charts.forEach((chart) => chart.destroy()); charts.clear(); observer?.disconnect(); if (timer !== null) win.clearInterval(timer); timer = null; };
  const resume = () => { if (disposed) return; suspended = false; if (timer === null && win.setInterval) timer = win.setInterval(renderReset, 60000); observer?.observe(doc.documentElement, { attributes: true, attributeFilter: ["data-theme"] }); renderReset(); renderBenchmark(); };
  const onShow = (event) => { if (event.persisted) resume(); };
  const destroy = () => { disposed = true; onClose(); win.removeEventListener?.("pagehide", onClose); win.removeEventListener?.("pageshow", onShow); };
  win.addEventListener?.("pagehide", onClose);
  win.addEventListener?.("pageshow", onShow);
  if (win.setInterval) timer = win.setInterval(renderReset, 60000);
  const ready = Promise.allSettled([
    readJSON("data/reset-history.json").then((value) => { if (value.schema_version !== 1 || !Array.isArray(value.events)) throw new Error("Invalid reset history"); history = value; renderReset(); }),
    readJSON("data/benchmark.json").then((value) => { if (!benchmark) benchmark = value; renderBenchmark(); }),
  ]);
  renderReset();
  return { ready, update(data) { if (disposed) return; discovery = data.resets || {}; if (data.benchmark?.entries?.length) benchmark = data.benchmark; renderReset(); renderBenchmark(); }, destroy };
}

if (typeof module !== "undefined") module.exports = { chartDate, resetURL, resetEvents, resetWindow, calendarDays, benchmarkPoints, createAICharts };
