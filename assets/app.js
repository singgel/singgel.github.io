"use strict";

function preferredTheme(storage, systemDark) {
  try {
    const saved = storage.getItem("singgel-theme");
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // Theme switching also works when browser storage is unavailable.
  }
  return systemDark ? "dark" : "light";
}

function matchesCategory(category, filter) {
  return filter === "all" || category === filter;
}

function initSite(doc, win) {
  const themeButton = doc.querySelector(".theme-toggle");
  const systemTheme = typeof win.matchMedia === "function" ? win.matchMedia("(prefers-color-scheme: dark)") : null;
  const systemDark = systemTheme ? systemTheme.matches : false;
  let storage;
  try {
    storage = win.localStorage;
  } catch {
    storage = { getItem: () => null, setItem: () => {} };
  }
  let userSelectedTheme = false;
  try {
    userSelectedTheme = ["light", "dark"].includes(storage.getItem("singgel-theme"));
  } catch {
    // With no saved preference, follow the system until a theme is selected.
  }
  function applyTheme(theme) {
    doc.documentElement.dataset.theme = theme;
    themeButton.setAttribute("aria-pressed", String(theme === "dark"));
    themeButton.setAttribute("aria-label", theme === "dark" ? "切换到浅色主题" : "切换到深色主题");
    doc.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#171c1a" : "#f6f5f0";
  }
  applyTheme(preferredTheme(storage, systemDark));
  if (systemTheme && typeof systemTheme.addEventListener === "function") {
    systemTheme.addEventListener("change", (event) => {
      if (!userSelectedTheme) applyTheme(event.matches ? "dark" : "light");
    });
  }
  themeButton.hidden = false;
  themeButton.addEventListener("click", () => {
    userSelectedTheme = true;
    const theme = doc.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(theme);
    try {
      storage.setItem("singgel-theme", theme);
    } catch {
      // Keep the selected theme for this visit even if it cannot be saved.
    }
  });

  const filters = doc.querySelector(".filters");
  if (!filters) return;
  const buttons = Array.from(filters.querySelectorAll("button"));
  const projects = Array.from(doc.querySelectorAll(".project-card"));
  filters.hidden = false;
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.filter;
      buttons.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      let visibleCount = 0;
      projects.forEach((project) => {
        const visible = matchesCategory(project.dataset.category, filter);
        project.hidden = !visible;
        if (visible) visibleCount += 1;
      });
      doc.getElementById("project-status").textContent = `已显示 ${visibleCount} 个${filter === "all" ? "" : button.textContent}项目`;
    });
  });
}

if (typeof document !== "undefined") initSite(document, window);
if (typeof module !== "undefined") module.exports = { preferredTheme, matchesCategory, initSite };
