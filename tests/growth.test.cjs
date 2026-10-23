const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { GROWTH_SKILLS, GROWTH_STAGES, GROWTH_DELAYS, initialAdventure, reduceAdventure, unlockedSkills, createAdventureController, initGrowth } = require("../assets/growth.js");

function clock() {
  let time = 0;
  let serial = 0;
  const pending = new Map();
  return {
    now: () => time,
    setTimer: (callback, delay) => { const id = ++serial; pending.set(id, { callback, due: time + delay }); return id; },
    clearTimer: (id) => pending.delete(id),
    pending,
    advance: (duration) => {
      const target = time + duration;
      let steps = 0;
      while (true) {
        const next = [...pending].sort((a, b) => a[1].due - b[1].due)[0];
        if (!next || next[1].due > target) break;
        assert.ok(++steps < 100, "timer should eventually stop");
        time = next[1].due;
        pending.delete(next[0]);
        next[1].callback();
      }
      time = target;
    },
  };
}

test("chapter selection rejects invalid indexes and does not award unplayed chapters", () => {
  const start = initialAdventure();
  for (const stage of [-1, 6, 1.5, "2", undefined]) assert.equal(reduceAdventure(start, { type: "select", stage }), start);
  const selected = reduceAdventure({ ...start, playing: true }, { type: "select", stage: 4 });
  assert.deepEqual(selected, { stage: 4, phase: "ready", completed: [], playing: false });
  assert.equal(reduceAdventure(selected, { type: "unknown" }), selected);
  assert.equal(reduceAdventure({ ...selected, stage: 5 }, { type: "next" }).stage, 5);
  assert.equal(reduceAdventure(start, { type: "tick" }), start);
  assert.equal(reduceAdventure({ ...start, phase: "finished", playing: true }, { type: "tick" }).phase, "finished");
});

test("completed chapters and shared skills are deduplicated", () => {
  let state = reduceAdventure(initialAdventure(), { type: "light" });
  state = reduceAdventure(state, { type: "light" });
  assert.deepEqual(state.completed, [0]);
  assert.deepEqual(initialAdventure().completed, []);
  assert.equal(unlockedSkills([0, 1]).size, 7);
  assert.equal(unlockedSkills(GROWTH_STAGES.map((_, index) => index)).size, Object.keys(GROWTH_SKILLS).length);
});

test("one timer advances all six chapters and stops after a single complete replay", () => {
  const time = clock();
  const frames = [];
  const game = createAdventureController({ ...time, render: (state) => frames.push(state) });
  assert.equal(time.pending.size, 0);
  game.dispatch({ type: "play" });
  game.dispatch({ type: "play" });
  assert.equal(time.pending.size, 1);
  time.advance(30000);
  assert.deepEqual(game.getState(), { stage: 5, phase: "finished", completed: [0, 1, 2, 3, 4, 5], playing: false });
  assert.equal(time.pending.size, 0);
  assert.equal(frames.filter((state) => state.phase === "battle").length, 6);
  game.dispatch({ type: "play" });
  assert.deepEqual(game.getState(), { ...initialAdventure(), playing: true });
  game.dispose();
  assert.equal(time.pending.size, 0);
});

test("pause preserves the remaining battle time and restart invalidates stale callbacks", () => {
  const time = clock();
  const game = createAdventureController({ ...time, render: () => {} });
  game.dispatch({ type: "play" });
  time.advance(GROWTH_DELAYS.ready + 400);
  const stale = [...time.pending.values()][0].callback;
  game.dispatch({ type: "pause" });
  game.dispatch({ type: "pause" });
  time.advance(10000);
  assert.equal(game.getState().phase, "battle");
  game.dispatch({ type: "play" });
  time.advance(GROWTH_DELAYS.battle - 401);
  assert.equal(game.getState().phase, "battle");
  time.advance(1);
  assert.equal(game.getState().phase, "won");
  game.dispatch({ type: "restart" });
  stale();
  assert.deepEqual(game.getState(), initialAdventure());
  assert.equal(time.pending.size, 0);
});

class Element extends EventTarget {
  constructor() {
    super();
    this.dataset = {};
    this.attributes = {};
    this.children = [];
    this.textContent = "";
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  click() { if (!this.disabled) this.dispatchEvent(new Event("click")); }
}

function fixture({ reduced = false, observer = true, media = true } = {}) {
  const time = clock();
  const root = path.resolve(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const nodes = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => [match[1], new Element()]));
  const levels = GROWTH_STAGES.map((_, stage) => {
    const button = new Element();
    button.dataset.growthStage = String(stage);
    return button;
  });
  const panel = nodes.get("growth-adventure");
  panel.hidden = true;
  panel.querySelectorAll = () => levels;
  const doc = new EventTarget();
  doc.hidden = false;
  doc.getElementById = (id) => { assert.ok(nodes.has(id), id); return nodes.get(id); };
  doc.createElement = () => new Element();
  const motion = new EventTarget();
  motion.matches = reduced;
  const win = new EventTarget();
  win.Date = { now: time.now };
  win.setTimeout = time.setTimer;
  win.clearTimeout = time.clearTimer;
  if (media) win.matchMedia = () => motion;
  let intersect;
  if (observer) win.IntersectionObserver = class {
    constructor(callback) { intersect = callback; }
    observe(target) { assert.equal(target, nodes.get("growth-scene")); }
  };
  const game = initGrowth(doc, win);
  return { ...time, game, nodes, panel, doc, win, motion, levels, intersect: (visible, ratio = 1) => intersect([{ isIntersecting: visible, intersectionRatio: ratio }]) };
}

test("first visible visit plays once; offscreen, hidden pages and page exit pause without auto-resume", () => {
  const page = fixture();
  assert.equal(page.panel.hidden, false);
  assert.equal(page.nodes.get("growth-history").open, false);
  assert.equal(page.pending.size, 0);
  page.intersect(true, .1);
  assert.equal(page.pending.size, 0);
  page.intersect(true);
  page.advance(GROWTH_DELAYS.ready);
  assert.equal(page.panel.dataset.phase, "battle");
  page.intersect(false);
  assert.equal(page.pending.size, 0);
  page.intersect(true);
  assert.equal(page.game.getState().playing, false);
  page.nodes.get("growth-play").click();
  page.doc.hidden = true;
  page.doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(page.pending.size, 0);
  page.doc.hidden = false;
  page.doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(page.pending.size, 0);
  page.nodes.get("growth-play").click();
  page.win.dispatchEvent(new Event("pagehide"));
  assert.equal(page.pending.size, 0);
});

test("reduced motion offers immediate manual lighting with no animation timer", () => {
  const page = fixture({ reduced: true });
  page.intersect(true);
  assert.equal(page.nodes.get("growth-play").textContent, "点亮本关");
  page.nodes.get("growth-play").click();
  assert.equal(page.nodes.get("growth-play").disabled, true);
  assert.equal(page.nodes.get("growth-skill-count").textContent, "已点亮 4 / 23");
  assert.equal(page.pending.size, 0);
  assert.match(page.nodes.get("growth-status").textContent, /减少动态效果模式/);
  page.nodes.get("growth-next").click();
  assert.equal(page.game.getState().stage, 1);
  assert.equal(page.nodes.get("growth-play").disabled, false);
  page.motion.matches = false;
  page.motion.dispatchEvent(new Event("change"));
  page.nodes.get("growth-play").click();
  assert.equal(page.pending.size, 1);
  page.motion.matches = true;
  page.motion.dispatchEvent(new Event("change"));
  assert.equal(page.pending.size, 0);
});

test("manual play, selection, next and restart suppress later first-visit autoplay", () => {
  for (const action of ["growth-play", "growth-next", "growth-restart", "select"]) {
    const page = fixture();
    if (action === "select") page.levels[3].click();
    else page.nodes.get(action).click();
    page.intersect(false);
    page.intersect(true);
    assert.equal(page.game.getState().playing, false, action);
    assert.equal(page.pending.size, 0, action);
  }
});

test("manual selection pauses play and updates chapter, source, loadout and accessible state", () => {
  const page = fixture();
  page.intersect(true);
  page.levels[4].click();
  assert.equal(page.pending.size, 0);
  assert.equal(page.nodes.get("growth-title").textContent, "云网络");
  assert.equal(page.nodes.get("growth-loadout").children.length, 7);
  assert.equal(page.nodes.get("growth-source").href, GROWTH_STAGES[4].link);
  assert.equal(page.levels[4].attributes["aria-pressed"], "true");
  assert.equal(page.nodes.get("growth-skill-count").textContent, "已点亮 0 / 23");
  page.nodes.get("growth-play").click();
  page.nodes.get("growth-play").click();
  assert.equal(page.game.getState().playing, false);
  page.nodes.get("growth-play").click();
  page.advance(30000);
  assert.equal(page.nodes.get("growth-next").disabled, true);
  assert.match(page.nodes.get("growth-status").textContent, /本段回放完成/);
  page.nodes.get("growth-restart").click();
  assert.equal(page.nodes.get("growth-progress").textContent, "成长回放 0 / 6");
  assert.equal(page.nodes.get("growth-next").disabled, false);
});

test("manual controls also work without media queries or intersection observers", () => {
  const page = fixture({ media: false, observer: false });
  assert.equal(page.pending.size, 0);
  page.nodes.get("growth-play").click();
  page.advance(30000);
  assert.equal(page.nodes.get("growth-skill-count").textContent, "已点亮 23 / 23");
  assert.match(page.nodes.get("growth-status").textContent, /六关回放完成/);
  assert.equal(initGrowth({ getElementById: () => null }, {}), undefined);
});

test("favorite-company badges follow their chapters and clear when leaving them", () => {
  const page = fixture();
  const expected = [null, null, "雪球", "字节跳动", null, "字节跳动"];
  for (const stage of [2, 4, 3, 0, 5, 1]) {
    page.levels[stage].click();
    const badge = page.nodes.get("growth-favorite");
    const company = expected[stage];
    assert.ok(page.levels[stage].attributes["aria-label"].includes(GROWTH_STAGES[stage].place));
    assert.equal(badge.hidden, !company);
    assert.equal(badge.textContent, company ? `我最喜爱的公司：${company}` : "");
    for (const node of [page.levels[stage], page.nodes.get("growth-scene")]) {
      if (company) assert.ok(node.attributes["aria-label"].includes(`我最喜爱的公司：${company}`));
      else assert.doesNotMatch(node.attributes["aria-label"], /最喜爱/);
    }
    assert.deepEqual(page.game.getState().completed, []);
  }
});

test("technology badges have safe local assets and the original career history is readable without JS", () => {
  const root = path.resolve(__dirname, "..");
  for (const stage of GROWTH_STAGES) {
    assert.ok(stage.skills.length > 0);
    assert.match(stage.link, /^https:\/\/github\.com\/singgel\//);
    for (const id of stage.skills) assert.ok(GROWTH_SKILLS[id], id);
  }
  for (const skill of Object.values(GROWTH_SKILLS)) {
    const svg = fs.readFileSync(path.join(root, "assets/icons", skill.icon), "utf8");
    assert.match(svg, /<svg/);
    assert.doesNotMatch(svg, /<script|\bon\w+\s*=|(?:href|src)=["'](?:https?:|javascript:)/i);
  }
  assert.match(fs.readFileSync(path.join(root, "assets/icons/devicon/LICENSE"), "utf8"), /Copyright \(c\) 2015 konpa/);
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /id="growth-adventure"[^>]* hidden/);
  assert.match(html, /id="growth-history" open/);
  assert.match(html, /class="career-timeline"/);
  assert.equal(GROWTH_STAGES.filter((stage) => stage.ongoing).length, 1);
});
