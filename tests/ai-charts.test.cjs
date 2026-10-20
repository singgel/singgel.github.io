const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chartDate, resetURL, resetEvents, resetWindow, calendarDays, benchmarkPoints, createAICharts } = require("../assets/ai-charts.js");
const history = JSON.parse(fs.readFileSync(`${__dirname}/../data/reset-history.json`, "utf8"));
const now = Date.parse("2026-10-20T08:00:00Z");

test("reset dates use Beijing day boundaries and reject dates without a timezone", () => {
  assert.equal(chartDate("2026-10-20T16:00:00Z"), "2026-10-21");
  assert.equal(chartDate("2026-10-21T00:00:00+08:00"), "2026-10-21");
  for (const value of [null, "bad", "2026-10-20", "2026-10-20T00:00:00", "2026-02-30T00:00:00Z"]) assert.equal(chartDate(value), null);
  assert.equal(resetURL("https://twitter.com/thsottiaux/status/2112432076767289678?x=1"), "https://x.com/thsottiaux/status/2112432076767289678");
  for (const url of ["https://x.com/other/status/2112432076767289678", "https://user:pw@x.com/thsottiaux/status/2112432076767289678", "javascript:alert(1)", "https://example.com"]) assert.equal(resetURL(url), null);
});

test("month grids handle leap years, Monday starts and year transitions", () => {
  assert.ok(calendarDays("2028-02").includes("2028-02-29"));
  assert.equal(calendarDays("2027-02").includes("2027-02-29"), false);
  assert.equal(calendarDays("2026-12").length, 42);
  assert.ok(calendarDays("2026-12").includes("2027-01-01"));
  assert.equal(new Date(`${calendarDays("2026-10")[0]}T00:00:00Z`).getUTCDay(), 1);
  assert.throws(() => calendarDays("2026-13"));
});

test("verified facts deduplicate original URLs without promoting keyword candidates", () => {
  const duplicate = structuredClone(history.events[0]);
  duplicate.id = "another-id";
  duplicate.sources[0].url = duplicate.sources[0].url.replace("x.com", "twitter.com");
  const events = resetEvents({ events: [...history.events, duplicate, { id: "invalid" }] }, { entries: [
    { url: history.events[0].sources[0].url, published_at: "2026-10-20T06:00:00Z" },
    { url: "https://x.com/thsottiaux/status/2112432076767289679", published_at: "2026-10-20T07:00:00Z" },
    { url: "https://x.com/thsottiaux/status/2112432076767289679", published_at: "2026-10-20T07:00:00Z" },
    { url: "javascript:bad", published_at: "bad" },
  ] });
  assert.equal(events.length, history.events.length + 1);
  assert.equal(events[0].state, "unconfirmed");
  assert.equal(events[0].kind, "unknown");
  assert.deepEqual(resetEvents({ events: {} }), []);
  const announced = { ...history.events[0], id: "old-announcement", state: "announced" };
  const merged = resetEvents({ events: [announced, history.events[0]] });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].state, "confirmed");
});

test("cards and overdue announcements never count as a confirmed reset or forecast", () => {
  const events = resetEvents(history);
  const state = resetWindow(events, now);
  assert.equal(state.resets, 4);
  assert.equal(state.cards, 1);
  assert.equal(state.latest.id, "tibo_2026_10_20");
  assert.ok(state.hours > 1 && state.hours < 2);
  assert.equal(events.find((event) => event.id === "tibo_2026_10_18").state, "announced");
  assert.equal(resetWindow(events, now + 100 * 86400000).resets, 0);
  assert.equal(resetWindow(events, Date.parse("2026-10-01T00:00:00Z")).latest, undefined);
  assert.equal(resetWindow([]).hours, null);
});

test("benchmark costs are numeric positive task costs, with explicit fixed currency conversion", () => {
  assert.deepEqual(benchmarkPoints(null), []);
  const data = { entries: [
    { model: "A", family: "One", score: 50, cost_usd: 1 },
    { model: "A", family: "One", score: 51, cost_usd: 2 },
    { model: "B", family: "Two", score: 100, cost_usd: .1 },
    { model: "C", family: "Two", score: 101, cost_usd: 1 },
    { model: "D", family: "Two", score: 50, cost_usd: 0 },
    { model: "E", family: "Two", score: "50", cost_usd: 1 },
  ] };
  assert.equal(benchmarkPoints(data).length, 2);
  assert.equal(benchmarkPoints(data)[0].cost_cny, 6.6862);
  data.entries.push({ model: "A", family: "One", harness: "different", score: 30, cost_usd: .4 });
  assert.equal(benchmarkPoints(data).length, 3);
});

class Element extends EventTarget {
  constructor() { super(); this.children = []; this.style = {}; this.attributes = {}; this.value = ""; }
  set textContent(value) { this.text = String(value); }
  get textContent() { return this.text || ""; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key, value) { this.attributes[key] = value; }
}
function fixture(failing = false) {
  const elements = new Map();
  const charts = [];
  const doc = { documentElement: new Element(), getElementById: (id) => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); }, createElement: () => new Element() };
  doc.getElementById("model-cost-scale").value = "logarithmic";
  doc.getElementById("reset-period").value = "14";
  const benchmark = { name: "Terminal-Bench", version: "4.0", harness: "same harness", checked_at: "2026-10-20T07:00:00Z", entries: [{ model: "A max", family: "One", series_id: "A", effort: "max", score: 50, cost_usd: 1 }, { model: "A high", family: "One", series_id: "A", effort: "high", score: 40, cost_usd: .5 }, { model: "B max", family: "One", series_id: "B", score: 35, cost_usd: .4 }] };
  class Chart { constructor(element, config) { this.element = element; this.config = config; this.destroyed = false; charts.push(this); } destroy() { this.destroyed = true; } }
  const win = { Chart, fetch: async (url) => { if (failing) throw new Error("offline"); return { ok: true, json: async () => url.includes("reset-history") ? history : benchmark }; }, setTimeout, clearTimeout };
  return { doc, win, charts, elements, benchmark };
}

test("dashboard selection, filters, source failure and chart lifecycle preserve verified history", async () => {
  const page = fixture();
  const app = createAICharts(page.doc, page.win, () => now);
  await app.ready;
  const get = page.doc.getElementById;
  assert.equal(get("reset-count").textContent, "4");
  assert.equal(get("reset-card-count").textContent, "1");
  assert.equal(get("reset-calendar").children.length, 42);
  assert.equal(get("model-cost-table").children.length, 3);
  const cost = page.charts.findLast((chart) => chart.element === get("model-cost-chart"));
  assert.equal(cost.config.data.datasets.length, 2);
  assert.equal(cost.config.data.datasets[1].showLine, false);
  get("model-toggles").children[0].dispatchEvent(new Event("click"));
  assert.equal(get("model-toggles").children[0].attributes["aria-pressed"], "false");
  get("model-cost-scale").value = "linear";
  get("model-cost-scale").dispatchEvent(new Event("change"));
  get("reset-prev-month").dispatchEvent(new Event("click"));
  assert.match(get("reset-month").textContent, /09/);
  get("reset-next-month").dispatchEvent(new Event("click"));
  const day = get("reset-calendar").children.find((button) => button.attributes["aria-label"].startsWith("2026-10-08"));
  day.dispatchEvent(new Event("click"));
  assert.equal(get("reset-selected").textContent, "2026-10-08");
  assert.match(get("reset-event-details").children[0].children[1].textContent, /重置卡/);
  get("reset-today").dispatchEvent(new Event("click"));
  get("reset-latest").dispatchEvent(new Event("click"));
  get("reset-period").value = "30";
  get("reset-period").dispatchEvent(new Event("change"));
  app.update({ resets: { status: "stale", entries: [] } });
  assert.equal(get("reset-count").textContent, "4");
  app.destroy();
  assert.ok(page.charts.every((chart) => chart.destroyed));
});

test("missing chart data never creates a reset probability or fabricated model score", async () => {
  const page = fixture(true);
  const app = createAICharts(page.doc, page.win, () => now);
  await app.ready;
  app.update({ resets: {} });
  assert.equal(page.doc.getElementById("reset-elapsed").textContent, "—");
  assert.match(page.doc.getElementById("model-chart-state").textContent, /暂无成本数据/);
  assert.equal(page.doc.getElementById("model-cost-table").children.length, 0);
  assert.equal(createAICharts({ getElementById: () => null }, {}), null);
  app.destroy();
});

test("pending fetches cannot recreate charts during page exit or after permanent disposal", async () => {
  for (const permanent of [false, true]) {
    const page = fixture();
    const events = new EventTarget();
    page.win.addEventListener = events.addEventListener.bind(events);
    page.win.removeEventListener = events.removeEventListener.bind(events);
    let release;
    const waiting = new Promise((resolve) => { release = resolve; });
    const read = page.win.fetch;
    page.win.fetch = async (...args) => { await waiting; return read(...args); };
    const app = createAICharts(page.doc, page.win, () => now);
    if (permanent) app.destroy(); else events.dispatchEvent(new Event("pagehide"));
    release();
    await app.ready;
    assert.ok(page.charts.every((chart) => chart.destroyed));
    const shown = new Event("pageshow");
    shown.persisted = true;
    events.dispatchEvent(shown);
    assert.equal(page.charts.some((chart) => !chart.destroyed), !permanent);
    app.destroy();
  }
});
