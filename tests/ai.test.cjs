const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { safeLink, formatAITime, snapshotAge, rankingRows, newsRows, validateSnapshot, fetchAISnapshot, initAI } = require("../assets/ai.js");
const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/ai.json"), "utf8"));

class Element extends EventTarget {
  constructor() { super(); this.children = []; this.value = ""; this.textContent = ""; this.hidden = true; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
}
function fixture(fetch) {
  const ids = ["ai-ranking-rows", "ai-board", "ai-model-search", "ai-board-status", "ai-news-items", "ai-news-kind", "ai-news-search", "ai-news-status", "ai-reset-status", "ai-reset-detail", "ai-reset-items", "ai-source-status", "ai-refresh", "ai-status"];
  const elements = Object.fromEntries(ids.map((id) => [id, new Element()]));
  elements["ai-board"].value = "text";
  elements["ai-news-kind"].value = "all";
  const doc = { getElementById: (id) => elements[id], createElement: () => new Element() };
  const win = { fetch, setTimeout, clearTimeout };
  return { doc, win, elements };
}
const ok = async () => ({ ok: true, json: async () => structuredClone(snapshot) });

test("safe links and timestamps do not accept executable URLs or invalid dates", () => {
  assert.equal(safeLink("javascript:alert(1)"), null);
  assert.equal(safeLink("https://user:secret@example.com"), null);
  assert.equal(safeLink("https://example.com/a"), "https://example.com/a");
  assert.equal(safeLink("not a url"), null);
  assert.equal(formatAITime("bad"), "尚无成功读取");
  assert.match(formatAITime("2026-10-20T06:00:00Z"), /14:00/);
  const now = Date.parse("2026-10-20T06:00:00Z");
  assert.equal(snapshotAge("2026-10-20T05:00:00Z", now), "recent");
  assert.equal(snapshotAge("2026-10-19T05:00:00Z", now), "stale");
  assert.equal(snapshotAge("bad", now), "unknown");
  assert.equal(snapshotAge("2027-01-01", now), "unknown");
});

test("ranking search keeps original ranks and matches organization case-insensitively", () => {
  const board = { entries: [{ rank: 2, model: "Kimi K3", organization: "Moonshot" }, { rank: 5, model: "Other", organization: "Other" }] };
  assert.equal(rankingRows(board, " moonSHOT ")[0].rank, 2);
  assert.equal(rankingRows(board, "missing").length, 0);
  assert.deepEqual(rankingRows(null, ""), []);
});

test("news deduplicates URLs, sorts dates, preserves source state, and filters kind", () => {
  const feeds = [{ status: "stale", items: [
    { title: "Kimi", source: "Moonshot", kind: "tools", url: "https://example.com/a", published_at: "2026-10-19" },
    { title: "News", source: "OpenAI", kind: "news", url: "https://example.com/b", published_at: "2026-10-20" },
    { title: "duplicate", source: "x", url: "https://example.com/a", published_at: "2026-10-20" },
    { url: "javascript:bad", published_at: "2026-10-20" },
    { url: "https://example.com/bad-date", published_at: "bad" },
  ] }, { status: "unavailable" }];
  assert.equal(newsRows(feeds, "all", "")[0].title, "News");
  assert.equal(newsRows(feeds, "tools", "moon")[0].sourceStatus, "stale");
  assert.equal(newsRows(feeds, "all", "").length, 2);
});

test("invalid snapshots and malformed numeric scores fail before rendering", () => {
  assert.equal(validateSnapshot(snapshot), snapshot);
  assert.throws(() => validateSnapshot({}));
  const bad = structuredClone(snapshot);
  bad.boards[0].entries[0].score = "high";
  assert.throws(() => validateSnapshot(bad));
  bad.boards[0].entries = null;
  assert.throws(() => validateSnapshot(bad));
  const badFeed = structuredClone(snapshot);
  badFeed.feeds[0].items = {};
  assert.throws(() => validateSnapshot(badFeed));
  badFeed.feeds[0].items = [{ title: 1 }];
  assert.throws(() => validateSnapshot(badFeed));
  const badReset = structuredClone(snapshot);
  badReset.resets.entries = {};
  assert.throws(() => validateSnapshot(badReset));
});

test("HTTP errors and aborts reject while releasing the deadline timer", async () => {
  await assert.rejects(fetchAISnapshot({ fetch: async () => ({ ok: false }), setTimeout, clearTimeout }, "https://example.com"));
  const win = { setTimeout: (callback) => { callback(); return 1; }, clearTimeout: () => {}, fetch: async (_url, options) => { assert.equal(options.signal.aborted, true); throw new Error("aborted"); } };
  await assert.rejects(fetchAISnapshot(win, "https://example.com"));
});

test("page renders all sections and filters, with literal text rather than HTML injection", async () => {
  const data = structuredClone(snapshot);
  data.boards[0].entries[0].model = '<img src=x onerror="alert(1)">';
  const page = fixture(async () => ({ ok: true, json: async () => data }));
  const app = initAI(page.doc, page.win);
  await app.ready;
  assert.equal(page.elements["ai-ranking-rows"].children.length, 20);
  assert.equal(page.elements["ai-ranking-rows"].children[0].children[1].textContent, data.boards[0].entries[0].model);
  assert.match(page.elements["ai-reset-status"].textContent, /部分覆盖/);
  assert.equal(page.elements["ai-source-status"].children.length, 10);
  page.elements["ai-board"].value = "webdev";
  page.elements["ai-board"].dispatchEvent(new Event("change"));
  assert.equal(page.elements["ai-ranking-rows"].children.length, 20);
  page.elements["ai-model-search"].value = "no such model";
  page.elements["ai-model-search"].dispatchEvent(new Event("input"));
  assert.match(page.elements["ai-board-status"].textContent, /显示 0 项/);
  page.elements["ai-news-kind"].value = "tools";
  page.elements["ai-news-kind"].dispatchEvent(new Event("change"));
  page.elements["ai-news-search"].value = "no such news";
  page.elements["ai-news-search"].dispatchEvent(new Event("input"));
  assert.match(page.elements["ai-news-status"].textContent, /显示 0 条/);
  assert.equal(initAI({ getElementById: () => null }, {}), null);
});

test("remote failure uses the bundled snapshot and full failure preserves loaded content", async () => {
  let calls = 0;
  const page = fixture(async () => { calls += 1; if (calls === 1) throw new Error("remote"); return ok(); });
  const app = initAI(page.doc, page.win);
  await app.ready;
  assert.match(page.elements["ai-status"].textContent, /随站快照/);
  page.win.fetch = async () => { throw new Error("offline"); };
  await app.refresh();
  assert.match(page.elements["ai-status"].textContent, /继续显示/);
  assert.equal(page.elements["ai-ranking-rows"].children.length, 20);
  const empty = fixture(page.win.fetch);
  await initAI(empty.doc, empty.win).ready;
  assert.match(empty.elements["ai-status"].textContent, /暂时不可读/);
});

test("pending refresh does not start duplicate reads and reset failures stay explicit", async () => {
  let complete;
  let calls = 0;
  const waiting = new Promise((resolve) => { complete = resolve; });
  const page = fixture(async () => { calls += 1; await waiting; const data = structuredClone(snapshot); data.resets = { status: "stale" }; return { ok: true, json: async () => data }; });
  const app = initAI(page.doc, page.win);
  await app.refresh();
  assert.equal(calls, 1);
  complete();
  await app.ready;
  assert.match(page.elements["ai-reset-status"].textContent, /读取失败/);
  assert.match(page.elements["ai-reset-items"].children[0].textContent, /无法确认/);
  assert.equal(page.elements["ai-refresh"].disabled, false);
});

test("AI page assets and anchors exist and public data contains no private account usage", () => {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "ai.html"), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const match of html.matchAll(/<(?:a|link|script)\b[^>]*>/g)) {
    const tag = match[0];
    const target = tag.match(/(?:href|src)="([^"]+)"/)?.[1];
    if (!target) continue;
    if (target.startsWith("#")) assert.ok(ids.includes(target.slice(1)));
    else if (target.startsWith("https://")) { if (tag.startsWith("<a")) assert.match(tag, /rel="noopener noreferrer"/); }
    else assert.ok(fs.existsSync(path.join(root, target.split("?")[0])));
  }
  assert.match(html, /CC BY 4.0/);
  assert.equal(JSON.stringify(snapshot).includes("usedPercent"), false);
});
