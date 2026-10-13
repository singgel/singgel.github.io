const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { initSite, preferredTheme } = require("../assets/app.js");

class Element extends EventTarget {
  constructor(dataset = {}, textContent = "") {
    super();
    this.dataset = dataset;
    this.textContent = textContent;
    this.hidden = true;
    this.attributes = {};
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  click() { this.dispatchEvent(new Event("click")); }
}

function fixture({ saved = null, dark = false, storageThrows = false, writeThrows = false } = {}) {
  const button = new Element();
  const filters = new Element();
  const status = new Element();
  const meta = {};
  const buttons = ["all", "network", "backend", "data"].map((filter) => new Element({ filter }, filter));
  const projects = ["network", "backend", "data"].map((category) => new Element({ category }));
  projects.forEach((project) => { project.hidden = false; });
  filters.querySelectorAll = () => buttons;
  const doc = {
    documentElement: { dataset: {} },
    querySelector: (selector) => ({ ".theme-toggle": button, ".filters": filters, 'meta[name="theme-color"]': meta })[selector],
    querySelectorAll: () => projects,
    getElementById: () => status,
  };
  const values = new Map([["singgel-theme", saved]]);
  const media = new EventTarget();
  media.matches = dark;
  const win = {
    matchMedia: () => media,
    get localStorage() {
      if (storageThrows) throw new Error("storage disabled");
      return {
        getItem: (key) => values.get(key),
        setItem: (key, value) => {
          if (writeThrows) throw new Error("quota denied");
          values.set(key, value);
        },
      };
    },
  };
  return { doc, win, button, filters, buttons, projects, status, values, meta, media };
}

test("system theme changes are followed until the visitor chooses a theme", () => {
  const page = fixture();
  initSite(page.doc, page.win);
  const systemEvent = new Event("change");
  systemEvent.matches = true;
  page.media.dispatchEvent(systemEvent);
  assert.equal(page.doc.documentElement.dataset.theme, "dark");
  page.button.click();
  assert.equal(page.doc.documentElement.dataset.theme, "light");
  page.media.dispatchEvent(systemEvent);
  assert.equal(page.doc.documentElement.dataset.theme, "light");
});

test("theme uses a saved preference, updates accessible state, and persists a toggle", () => {
  const page = fixture({ saved: "dark" });
  initSite(page.doc, page.win);
  assert.equal(page.doc.documentElement.dataset.theme, "dark");
  assert.equal(page.button.attributes["aria-pressed"], "true");
  assert.equal(page.button.attributes["aria-label"], "切换到浅色主题");
  assert.equal(page.button.hidden, false);
  page.button.click();
  assert.equal(page.doc.documentElement.dataset.theme, "light");
  assert.equal(page.button.attributes["aria-pressed"], "false");
  assert.equal(page.button.attributes["aria-label"], "切换到深色主题");
  assert.equal(page.meta.content, "#f6f5f0");
  assert.equal(page.values.get("singgel-theme"), "light");
  page.button.click();
  assert.equal(page.meta.content, "#171c1a");
  assert.equal(page.values.get("singgel-theme"), "dark");
});

test("blocked storage and failed writes do not break the theme or other interactions", () => {
  for (const options of [{ storageThrows: true }, { writeThrows: true }]) {
    const page = fixture(options);
    initSite(page.doc, page.win);
    assert.doesNotThrow(() => page.button.click());
    assert.equal(page.doc.documentElement.dataset.theme, "dark");
    assert.equal(page.filters.hidden, false);
  }
});

test("invalid stored preference and failed reads fall back to the system preference", () => {
  assert.equal(preferredTheme({ getItem: () => "unexpected" }, true), "dark");
  assert.equal(preferredTheme({ getItem: () => { throw new Error(); } }, false), "light");
});

test("each project filter updates cards, selected buttons, and the live result count", () => {
  const page = fixture();
  initSite(page.doc, page.win);
  const expected = { network: 1, backend: 1, data: 1, all: 3 };
  for (const filter of ["network", "backend", "data", "all"]) {
    const selected = page.buttons.find((button) => button.dataset.filter === filter);
    selected.click();
    assert.equal(page.projects.filter((project) => !project.hidden).length, expected[filter]);
    assert.ok(page.projects.filter((project) => !project.hidden).every((project) => filter === "all" || project.dataset.category === filter));
    assert.equal(page.status.textContent, `已显示 ${expected[filter]} 个${filter === "all" ? "" : filter}项目`);
    assert.ok(page.buttons.every((button) => button.attributes["aria-pressed"] === String(button === selected)));
  }
});

test("HTML contains valid anchors and existing local assets, with safe external links", () => {
  const root = path.resolve(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const match of html.matchAll(/<(?:a|link|script)\b[^>]*>/g)) {
    const tag = match[0];
    const target = tag.match(/(?:href|src)="([^"]+)"/)?.[1];
    if (!target || target === "#") continue;
    if (target.startsWith("#")) assert.ok(ids.includes(target.slice(1)), target);
    else if (/^https?:\/\//.test(target)) {
      if (tag.startsWith("<a")) assert.match(tag, /rel="noopener noreferrer"/);
    } else assert.ok(fs.existsSync(path.join(root, target.split(/[?#]/)[0])), target);
  }
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /class="filters"[^>]* hidden/);
  assert.equal((html.match(/class="project-card/g) || []).length, 3);
});

test("visitors reach growth and representative work before reference collections", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const sections = [...html.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(sections, ["journey", "projects", "notes", "library", "bookmarks", "social", "about"]);
  assert.match(html, /class="button button-dark" href="#journey"/);
  const projects = html.slice(html.indexOf('id="projects"'), html.indexOf('id="notes"'));
  for (const repo of ["igw-p4", "grpc-infra", "flink-kafka-hbase"]) {
    assert.ok(projects.includes(`href="https://github.com/singgel/${repo}"`));
  }
});
