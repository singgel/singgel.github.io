"use strict";

const AI_LIVE_DATA = "https://raw.githubusercontent.com/singgel/singgel.github.io/refs/heads/data/ai/data/ai.json";

function safeLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function formatAITime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "尚无成功读取";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function snapshotAge(value, now = Date.now()) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > now + 60000) return "unknown";
  return now - timestamp > 3 * 60 * 60 * 1000 ? "stale" : "recent";
}

function rankingRows(board, query) {
  const needle = query.trim().toLocaleLowerCase();
  return (board?.entries || []).filter((row) => `${row.model} ${row.organization}`.toLocaleLowerCase().includes(needle));
}

function newsRows(feeds, kind, query) {
  const needle = query.trim().toLocaleLowerCase();
  const seen = new Set();
  return feeds.flatMap((feed) => (feed.items || []).map((item) => ({ ...item, sourceStatus: feed.status })))
    .filter((item) => {
      if (!safeLink(item.url) || !Number.isFinite(Date.parse(item.published_at)) || seen.has(item.url)) return false;
      seen.add(item.url);
      return (kind === "all" || item.kind === kind) && `${item.title} ${item.source}`.toLocaleLowerCase().includes(needle);
    }).sort((left, right) => Date.parse(right.published_at) - Date.parse(left.published_at)).slice(0, 24);
}

function validateSnapshot(data) {
  if (data?.schema_version !== 1 || !Number.isFinite(Date.parse(data.updated_at)) || !Array.isArray(data.boards) || !Array.isArray(data.feeds) || !data.resets) {
    throw new Error("Invalid AI snapshot");
  }
  for (const board of data.boards) {
    if (!Array.isArray(board.entries) && board.status !== "unavailable") throw new Error("Missing ranking entries");
    for (const row of board.entries || []) {
      if (typeof row.model !== "string" || ![row.rank, row.score, row.lower, row.upper, row.votes].every(Number.isFinite)) throw new Error("Invalid ranking entry");
    }
  }
  for (const feed of data.feeds) {
    if (feed.items !== undefined && !Array.isArray(feed.items)) throw new Error("Invalid feed items");
    for (const item of feed.items || []) {
      if (typeof item.title !== "string" || typeof item.source !== "string" || !safeLink(item.url) || !Number.isFinite(Date.parse(item.published_at))) throw new Error("Invalid feed entry");
    }
  }
  if (data.resets.entries !== undefined && !Array.isArray(data.resets.entries)) throw new Error("Invalid reset entries");
  return data;
}

async function fetchAISnapshot(win, url) {
  const controller = new AbortController();
  const timer = win.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await win.fetch(url, { cache: "no-cache", signal: controller.signal });
    if (!response.ok) throw new Error("Snapshot unavailable");
    return validateSnapshot(await response.json());
  } finally { win.clearTimeout(timer); }
}

function initAI(doc, win) {
  if (!doc.getElementById("ai-ranking-rows")) return null;
  const get = (id) => doc.getElementById(id);
  const node = (tag, text, className) => {
    const element = doc.createElement(tag);
    if (text !== undefined) element.textContent = String(text);
    if (className) element.className = className;
    return element;
  };
  const link = (text, url, className) => {
    const href = safeLink(url);
    if (!href) return node("span", text, className);
    const element = node("a", text, className);
    element.href = href;
    element.target = "_blank";
    element.rel = "noopener noreferrer";
    return element;
  };
  const charts = typeof win.createAICharts === "function" ? win.createAICharts(doc, win) : null;
  let data = null;
  let busy = false;

  function renderRanking() {
    const board = data.boards.find((item) => item.id === get("ai-board").value);
    const rows = rankingRows(board, get("ai-model-search").value);
    const elements = rows.map((row) => {
      const tr = node("tr");
      const model = node("td", row.model);
      model.append(node("small", row.organization));
      const score = node("td");
      score.append(node("strong", row.score.toFixed(1)), node("small", `${row.lower.toFixed(1)}–${row.upper.toFixed(1)}`));
      tr.append(node("td", String(row.rank).padStart(2, "0")), model, score, node("td", row.votes.toLocaleString("zh-CN"), "ai-votes"));
      return tr;
    });
    get("ai-ranking-rows").replaceChildren(...elements);
    const state = board?.status === "ok" ? "读取成功" : board?.status === "stale" ? "读取失败，保留旧榜" : "暂不可用";
    get("ai-board-status").textContent = `${state} · 来源发布日期 ${board?.published_at || "未知"} · 显示 ${rows.length} 项（保留原榜名次）`;
    if (!rows.length) {
      const row = node("tr");
      const cell = node("td", "没有匹配项，可清空搜索或访问原榜。", "ai-empty");
      cell.colSpan = 4;
      row.append(cell);
      get("ai-ranking-rows").append(row);
    }
  }

  function renderNews() {
    const rows = newsRows(data.feeds, get("ai-news-kind").value, get("ai-news-search").value);
    get("ai-news-items").replaceChildren(...rows.map((item) => {
      const card = node("article", undefined, "ai-news-card");
      const kind = item.kind === "news" ? "官方新闻" : /alpha|beta|preview|\brc\b/i.test(item.title) ? "预发布动态" : "工具版本";
      card.append(node("p", `${item.source} · ${kind} · ${formatAITime(item.published_at)}${item.sourceStatus === "stale" ? " · 缓存" : ""}`, "ai-news-meta"));
      const heading = node("h3");
      heading.append(link(item.title, item.url));
      card.append(heading, link("阅读原文 ↗", item.url, "text-link"));
      return card;
    }));
    get("ai-news-status").textContent = `显示 ${rows.length} 条 · 保留原文标题与发布时间`;
    if (!rows.length) get("ai-news-items").append(node("p", "没有匹配的动态，试试其他关键词。", "ai-empty"));
  }

  function renderReset() {
    const reset = data.resets;
    const success = reset.status === "partial";
    get("ai-reset-status").textContent = success ? `部分覆盖 · 读取 ${reset.observed_posts} 条近期原帖` : reset.status === "stale" ? "本次读取失败 · 保留上次线索" : "公开原帖暂不可读";
    get("ai-reset-detail").textContent = `最近尝试 ${formatAITime(reset.checked_at)}；成功读取 ${formatAITime(reset.last_success_at)}。仅检查公开页面返回的近期帖子，不能据此判断完整公告范围。`;
    const items = (reset.entries || []).filter((item) => safeLink(item.url)).map((item) => {
      const card = node("div", undefined, "ai-reset-item");
      const time = node("time", formatAITime(item.published_at));
      time.dateTime = item.published_at;
      card.append(time, link("重置原帖线索 · 范围待核实 ↗", item.url));
      return card;
    });
    get("ai-reset-items").replaceChildren(...items);
    if (!items.length) get("ai-reset-items").append(node("p", success ? "本批帖子未命中重置关键词，不代表没有重置公告。" : "当前无法确认新公告，直接打开原始时间线查看。", "ai-caption"));
  }

  function render() {
    renderRanking();
    renderNews();
    renderReset();
    charts?.update(data);
    const parts = [...data.boards, ...data.feeds, { ...data.resets, name: "Tibo 公开原帖" }];
    const labels = { ok: "读取成功", partial: "部分覆盖", stale: "读取失败，保留旧数据", unavailable: "暂不可用" };
    get("ai-source-status").replaceChildren(...parts.map((part) => node("li", `${part.name} · ${labels[part.status] || "未知"} · 成功读取 ${formatAITime(part.last_success_at)}`)));
  }

  async function refresh() {
    if (busy) return;
    busy = true;
    get("ai-refresh").disabled = true;
    get("ai-status").textContent = "正在读取最新公开快照…";
    try {
      let source = "最新快照";
      let next;
      try { next = await fetchAISnapshot(win, `${AI_LIVE_DATA}?refresh=${Date.now()}`); }
      catch { next = await fetchAISnapshot(win, "data/ai.json"); source = "随站快照"; }
      data = next;
      render();
      const age = snapshotAge(data.updated_at);
      get("ai-status").textContent = `${source} · ${formatAITime(data.updated_at)} 北京时间 · ${age === "recent" ? "约每小时检查来源" : "已超过预期刷新时间，请核对来源状态"}`;
    } catch {
      get("ai-status").textContent = data ? "刷新失败，继续显示本次已读取的数据。" : "数据暂时不可读，可通过下方来源链接阅读原文。";
    } finally {
      busy = false;
      get("ai-refresh").disabled = false;
    }
  }
  get("ai-refresh").hidden = false;
  get("ai-refresh").addEventListener("click", refresh);
  get("ai-board").addEventListener("change", () => { if (data) renderRanking(); });
  get("ai-model-search").addEventListener("input", () => { if (data) renderRanking(); });
  get("ai-news-kind").addEventListener("change", () => { if (data) renderNews(); });
  get("ai-news-search").addEventListener("input", () => { if (data) renderNews(); });
  return { ready: refresh(), refresh };
}

if (typeof document !== "undefined") initAI(document, window);
if (typeof module !== "undefined") module.exports = { safeLink, formatAITime, snapshotAge, rankingRows, newsRows, validateSnapshot, fetchAISnapshot, initAI };
