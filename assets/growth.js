"use strict";

const GROWTH_SKILLS = {
  c: { name: "C", icon: "devicon/c.svg" },
  java: { name: "Java", icon: "devicon/java.svg" },
  netty: { name: "Netty", icon: "network.svg" },
  mysql: { name: "MySQL", icon: "devicon/mysql.svg" },
  kafka: { name: "Kafka", icon: "devicon/apachekafka.svg" },
  hbase: { name: "HBase", icon: "database.svg" },
  redis: { name: "Redis", icon: "devicon/redis.svg" },
  spring: { name: "Spring Cloud", icon: "devicon/spring.svg" },
  grpc: { name: "gRPC", icon: "devicon/grpc.svg" },
  envoy: { name: "Envoy", icon: "devicon/envoy.svg" },
  go: { name: "Go", icon: "devicon/go.svg" },
  kitex: { name: "Kitex", icon: "network.svg" },
  p4: { name: "P4", icon: "chip.svg" },
  bgp: { name: "BGP", icon: "network.svg" },
  dpdk: { name: "DPDK", icon: "chip.svg" },
  ovs: { name: "OVS", icon: "network.svg" },
  ipv6: { name: "IPv6", icon: "network.svg" },
  linux: { name: "Linux", icon: "devicon/linux.svg" },
  vpc: { name: "VPC", icon: "network.svg" },
  nat: { name: "NAT", icon: "network.svg" },
  lb: { name: "LB", icon: "network.svg" },
  observability: { name: "可观测性", icon: "radar.svg" },
  failover: { name: "故障切换", icon: "radar.svg" },
};

const GROWTH_STAGES = [
  { title: "连接与消息", land: "新手村", boss: "连接怪", period: "2015.06 — 2018.04", place: "CATARC", description: "从车联网与分布式后端出发，把连接、消息和存储串起来。", skills: ["c", "java", "netty", "mysql"], link: "https://github.com/singgel/Netty-SkillTree" },
  { title: "数据管道", land: "数据之河", boss: "数据乱流", period: "2018.05 — 2019.04", place: "易车 · 大数据", description: "走进推荐系统和数据管道，让消息、存储与缓存协同工作。", skills: ["java", "kafka", "hbase", "redis"], link: "https://github.com/singgel/BIGDATA_LINE" },
  { title: "服务治理", land: "治理森林", boss: "调用迷雾", period: "2019.04 — 2022.03", place: "雪球 · 基础设施", favoriteCompany: "雪球", description: "把视野从单个服务扩展到中间件平台、服务治理与可观测性。", skills: ["spring", "grpc", "envoy", "redis", "kafka"], link: "https://github.com/singgel/envoy-infra" },
  { title: "并发与缓存", land: "缓存城堡", boss: "缓存风暴", period: "2022.04 — 2022.06", place: "字节跳动 · People Platform", favoriteCompany: "字节跳动", description: "在 HR 中台服务重构与高并发缓存中，继续积累 Go 后端工程经验。", skills: ["go", "java", "kitex", "redis", "mysql"], link: "https://github.com/singgel/singgel.github.io/blob/master/docs/profile.md" },
  { title: "云网络", land: "网络迷宫", boss: "路由迷宫", period: "2022.07 — 2026.04", place: "京东云 · IaaS 网络", description: "探索 SDN 控制面、可编程网关与数据平面，从路由走向整张网络。", skills: ["go", "p4", "bgp", "dpdk", "ovs", "ipv6", "linux"], link: "https://github.com/singgel/igw-p4" },
  { title: "可靠性", land: "云端远征", boss: "未知山峰", period: "2026.05 — 至今", place: "字节跳动 · Data DCS", favoriteCompany: "字节跳动", description: "继续探索分布式云服务与基础设施，把后端、云网络和可靠性连接起来。", skills: ["go", "vpc", "nat", "lb", "observability", "failover"], link: "https://github.com/singgel/iaas-network", ongoing: true },
];

const GROWTH_DELAYS = { ready: 650, battle: 1450, won: 1700 };

function initialAdventure() {
  return { stage: 0, phase: "ready", completed: [], playing: false };
}

function finishStage(state) {
  return { ...state, phase: "won", completed: [...new Set([...state.completed, state.stage])] };
}

function reduceAdventure(state, action, count = GROWTH_STAGES.length) {
  switch (action.type) {
    case "play":
      return { ...(state.phase === "finished" ? initialAdventure() : state), playing: true };
    case "pause":
      return { ...state, playing: false };
    case "restart":
      return initialAdventure();
    case "select":
      if (!Number.isInteger(action.stage) || action.stage < 0 || action.stage >= count) return state;
      return { ...state, stage: action.stage, phase: "ready", playing: false };
    case "next":
      if (state.stage >= count - 1) return state;
      return { ...state, stage: state.stage + 1, phase: "ready", playing: false };
    case "light":
      return { ...finishStage(state), playing: false };
    case "tick":
      if (!state.playing) return state;
      if (state.phase === "ready") return { ...state, phase: "battle" };
      if (state.phase === "battle") return finishStage(state);
      if (state.phase === "won") {
        return state.stage < count - 1
          ? { ...state, stage: state.stage + 1, phase: "ready" }
          : { ...state, phase: "finished", playing: false };
      }
      return state;
    default:
      return state;
  }
}

function unlockedSkills(completed) {
  return new Set(completed.flatMap((stage) => GROWTH_STAGES[stage].skills));
}

function createAdventureController({ render, setTimer, clearTimer, now }) {
  let state = initialAdventure();
  let timer = null;
  let deadline = 0;
  let remaining = null;
  let generation = 0;

  function stopTimer(preserveTime) {
    generation += 1;
    if (timer !== null) {
      if (preserveTime) remaining = Math.max(0, deadline - now());
      clearTimer(timer);
      timer = null;
    }
    if (!preserveTime) remaining = null;
  }

  function schedule() {
    if (!state.playing) return;
    const delay = remaining ?? GROWTH_DELAYS[state.phase];
    remaining = null;
    deadline = now() + delay;
    const token = generation;
    timer = setTimer(() => {
      if (token !== generation) return;
      timer = null;
      state = reduceAdventure(state, { type: "tick" });
      render(state);
      schedule();
    }, delay);
  }

  function dispatch(action) {
    if (action.type === "pause") stopTimer(true);
    else if (action.type !== "play") stopTimer(false);
    else if (state.playing) return;
    state = reduceAdventure(state, action);
    render(state);
    schedule();
  }

  render(state);
  return { dispatch, getState: () => state, dispose: () => { stopTimer(false); state = reduceAdventure(state, { type: "pause" }); render(state); } };
}

function initGrowth(doc, win) {
  const root = doc.getElementById("growth-adventure");
  if (!root) return;
  const motion = typeof win.matchMedia === "function" ? win.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const play = doc.getElementById("growth-play");
  const next = doc.getElementById("growth-next");
  const restart = doc.getElementById("growth-restart");
  const loadout = doc.getElementById("growth-loadout");
  const bag = doc.getElementById("growth-inventory");
  const levels = Array.from(root.querySelectorAll("[data-growth-stage]"));
  const status = doc.getElementById("growth-status");
  const scene = doc.getElementById("growth-scene");
  const bagItems = new Map();
  let shownStage = -1;
  let firstVisit = true;

  function skillBadge(id) {
    const item = doc.createElement("li");
    const image = doc.createElement("img");
    image.src = `assets/icons/${GROWTH_SKILLS[id].icon}`;
    image.alt = "";
    image.width = 30;
    image.height = 30;
    image.loading = "lazy";
    const name = doc.createElement("span");
    name.textContent = GROWTH_SKILLS[id].name;
    item.append(image, name);
    return item;
  }

  Object.keys(GROWTH_SKILLS).forEach((id) => {
    const item = skillBadge(id);
    item.className = "growth-skill";
    item.dataset.unlocked = "false";
    bagItems.set(id, item);
    bag.append(item);
  });

  function render(state) {
    const stage = GROWTH_STAGES[state.stage];
    root.dataset.phase = state.phase;
    root.dataset.playing = String(state.playing);
    root.dataset.stage = String(state.stage);
    doc.getElementById("growth-level").textContent = `LV.${String(state.stage + 1).padStart(2, "0")}`;
    doc.getElementById("growth-land").textContent = stage.land;
    doc.getElementById("growth-boss").textContent = stage.boss;
    doc.getElementById("growth-loot").textContent = stage.ongoing ? "✧ NEXT QUEST!" : "✧ SKILL GET!";
    doc.getElementById("growth-title").textContent = stage.title;
    doc.getElementById("growth-period").textContent = stage.period;
    doc.getElementById("growth-place").textContent = stage.place;
    const favorite = doc.getElementById("growth-favorite");
    favorite.hidden = !stage.favoriteCompany;
    favorite.textContent = stage.favoriteCompany ? `我最喜爱的公司：${stage.favoriteCompany}` : "";
    doc.getElementById("growth-description").textContent = stage.description;
    const link = doc.getElementById("growth-source");
    link.href = stage.link;
    link.textContent = "相关公开资料 ↗";
    if (shownStage !== state.stage) {
      loadout.replaceChildren(...stage.skills.map(skillBadge));
      shownStage = state.stage;
    }
    levels.forEach((button, index) => {
      button.setAttribute("aria-pressed", String(index === state.stage));
      const favoriteCompany = GROWTH_STAGES[index].favoriteCompany;
      button.setAttribute("aria-label", `第 ${index + 1} 关 · ${GROWTH_STAGES[index].title}${favoriteCompany ? `，我最喜爱的公司：${favoriteCompany}` : ""}${state.completed.includes(index) ? "，已点亮" : ""}`);
      button.dataset.completed = String(state.completed.includes(index));
    });
    const unlocked = unlockedSkills(state.completed);
    bagItems.forEach((item, id) => {
      item.dataset.unlocked = String(unlocked.has(id));
      item.setAttribute("aria-label", `${GROWTH_SKILLS[id].name}，${unlocked.has(id) ? "已点亮" : "待点亮"}`);
    });
    doc.getElementById("growth-skill-count").textContent = `已点亮 ${unlocked.size} / ${bagItems.size}`;
    doc.getElementById("growth-progress").textContent = `成长回放 ${state.completed.length} / ${GROWTH_STAGES.length}`;
    scene.setAttribute("aria-label", `${stage.land}：大闸蟹迎战${stage.boss}${stage.favoriteCompany ? `，我最喜爱的公司：${stage.favoriteCompany}` : ""}`);
    next.disabled = state.stage === GROWTH_STAGES.length - 1;
    play.disabled = Boolean(motion?.matches && state.phase === "won");
    play.textContent = motion?.matches
      ? (state.phase === "won" ? "本关已点亮" : "点亮本关")
      : (state.playing ? "暂停冒险" : state.phase === "finished" ? "再玩一遍" : state.phase === "ready" ? "开始冒险" : "继续冒险");
    const message = state.phase === "finished"
      ? (state.completed.length === GROWTH_STAGES.length ? "六关回放完成，下一座山峰仍在探索。" : "本段回放完成，可选择其他关卡继续点亮。")
      : state.phase === "won"
        ? (stage.ongoing ? "开启新的远征，成长仍在继续。" : `本关点亮：${stage.skills.map((id) => GROWTH_SKILLS[id].name).join(" / ")}`)
        : state.phase === "battle" ? `正在挑战${stage.boss}…` : `第 ${state.stage + 1} 关 · ${stage.title}`;
    status.textContent = state.playing ? message : `${message}${motion?.matches ? "（减少动态效果模式）" : ""}`;
  }

  const controller = createAdventureController({
    render,
    setTimer: (callback, delay) => win.setTimeout(callback, delay),
    clearTimer: (id) => win.clearTimeout(id),
    now: () => win.Date.now(),
  });
  function interact(action) {
    firstVisit = false;
    controller.dispatch(action);
  }
  play.addEventListener("click", () => interact({ type: motion?.matches ? "light" : controller.getState().playing ? "pause" : "play" }));
  next.addEventListener("click", () => interact({ type: "next" }));
  restart.addEventListener("click", () => interact({ type: "restart" }));
  levels.forEach((button) => button.addEventListener("click", () => interact({ type: "select", stage: Number(button.dataset.growthStage) })));
  doc.addEventListener("visibilitychange", () => { if (doc.hidden) controller.dispatch({ type: "pause" }); });
  win.addEventListener("pagehide", () => controller.dispatch({ type: "pause" }));
  motion?.addEventListener?.("change", () => controller.dispatch({ type: "pause" }));
  if (typeof win.IntersectionObserver === "function") {
    const observer = new win.IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.25) controller.dispatch({ type: "pause" });
        else if (firstVisit) {
          firstVisit = false;
          if (!motion?.matches && !doc.hidden) controller.dispatch({ type: "play" });
        }
      });
    }, { threshold: 0.25 });
    observer.observe(scene);
  }
  doc.getElementById("growth-history").open = false;
  root.hidden = false;
  return controller;
}

if (typeof document !== "undefined") initGrowth(document, window);
if (typeof module !== "undefined") module.exports = { GROWTH_SKILLS, GROWTH_STAGES, GROWTH_DELAYS, initialAdventure, reduceAdventure, unlockedSkills, createAdventureController, initGrowth };
