const { test } = require("node:test");
const assert = require("node:assert/strict");
const { initBookmarks, normalizeSearch } = require("../assets/bookmarks.js");

class Element extends EventTarget {
  constructor(properties = {}) {
    super();
    Object.assign(this, { hidden: false, open: false, dataset: {}, textContent: "" }, properties);
  }
  focus() { this.focused = true; }
}

function fixture() {
  const input = new Element({ value: "" });
  const clear = new Element();
  const status = new Element();
  const empty = new Element({ hidden: true });
  const search = new Element({ hidden: true });
  const items = [
    { title: "Redis 入门", path: "学习 / redis", url: "https://example.com/a" },
    { title: "协议追踪", path: "SDN / Linux", url: "http://network.example.org/b" },
    { title: "Tool", path: "TOOLS", url: "https://example.org/c" },
  ].map(({ title, path, url }) => {
    const item = new Element({ textContent: title, dataset: { folder: path } });
    item.querySelector = () => ({ href: url });
    return item;
  });
  const folders = [[0], [0], [1], [2]].map((indices, i) => {
    const folder = new Element({ open: i === 0 });
    folder.group = new Element();
    folder.closest = () => folder.group;
    folder.querySelectorAll = () => indices.map((index) => items[index]);
    return folder;
  });
  const section = {
    querySelector: (selector) => ({ input, ".bookmark-clear": clear, ".bookmark-status": status, ".bookmark-empty": empty, ".bookmark-search": search })[selector],
    querySelectorAll: (selector) => selector === ".bookmark-item" ? items : folders,
  };
  const doc = { getElementById: () => section };
  const type = (value) => { input.value = value; input.dispatchEvent(new Event("input")); };
  return { doc, input, clear, status, empty, search, items, folders, type };
}

test("search normalizes full-width characters, case, and whitespace", () => {
  assert.equal(normalizeSearch("  ＲＥＤＩＳ  "), "redis");
});

test("search matches titles, Chinese folders and domains, requiring every term", () => {
  const page = fixture();
  initBookmarks(page.doc);
  assert.equal(page.search.hidden, false);
  assert.equal(page.status.textContent, "共 3 条收藏 · 按原目录整理");
  for (const query of ["ＲＥＤＩＳ", "学习", "example.com", "学习 Redis"]) {
    page.type(query);
    assert.deepEqual(page.items.map((item) => item.hidden), [false, true, true]);
    assert.equal(page.status.textContent, "找到 1 条收藏");
    assert.deepEqual(page.folders.map((folder) => folder.group.hidden), [false, false, true, true]);
    assert.ok(page.folders[0].open && page.folders[1].open);
  }
  page.type("SDN network");
  assert.deepEqual(page.items.map((item) => item.hidden), [true, false, true]);
});

test("zero results and clearing restore the original expansion and focus", () => {
  const page = fixture();
  initBookmarks(page.doc);
  page.type("no-match");
  assert.equal(page.empty.hidden, false);
  assert.equal(page.status.textContent, "找到 0 条收藏");
  assert.ok(page.folders.every((folder) => folder.group.hidden));
  page.type("Redis");
  page.clear.dispatchEvent(new Event("click"));
  assert.equal(page.input.value, "");
  assert.equal(page.input.focused, true);
  assert.equal(page.clear.disabled, true);
  assert.equal(page.empty.hidden, true);
  assert.deepEqual(page.folders.map((folder) => folder.open), [true, false, false, false]);
  assert.ok(page.items.every((item) => !item.hidden));
  assert.ok(page.folders.every((folder) => !folder.group.hidden));
  page.folders[2].open = true;
  page.type("Tool");
  page.type("   ");
  assert.equal(page.folders[2].open, true);
});

test("pages without the bookmark section need no initialization", () => {
  assert.doesNotThrow(() => initBookmarks({ getElementById: () => null }));
});
