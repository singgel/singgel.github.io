"use strict";

function normalizeSearch(value) {
  return value.normalize("NFKC").toLocaleLowerCase().trim();
}

function initBookmarks(doc) {
  const section = doc.getElementById("bookmarks");
  if (!section) return;
  const input = section.querySelector("input");
  const clear = section.querySelector(".bookmark-clear");
  const status = section.querySelector(".bookmark-status");
  const empty = section.querySelector(".bookmark-empty");
  const items = Array.from(section.querySelectorAll(".bookmark-item"));
  const folders = Array.from(section.querySelectorAll(".bookmark-folder"));
  const index = items.map((item) => normalizeSearch(`${item.textContent} ${item.dataset.folder} ${item.querySelector("a").href}`));
  let previousOpen = null;

  const applySearch = () => {
    const terms = normalizeSearch(input.value).split(/\s+/).filter(Boolean);
    const searching = terms.length > 0;
    if (searching && !previousOpen) previousOpen = folders.map((folder) => folder.open);
    let count = 0;
    items.forEach((item, i) => {
      item.hidden = !terms.every((term) => index[i].includes(term));
      if (!item.hidden) count += 1;
    });
    folders.forEach((folder, i) => {
      const matches = Array.from(folder.querySelectorAll(".bookmark-item")).some((item) => !item.hidden);
      folder.closest(".bookmark-group").hidden = searching && !matches;
      if (searching) folder.open = matches;
      else if (previousOpen) folder.open = previousOpen[i];
    });
    if (!searching) previousOpen = null;
    clear.disabled = !searching;
    empty.hidden = count > 0;
    status.textContent = searching ? `找到 ${count} 条收藏` : `共 ${items.length} 条收藏 · 按原目录整理`;
  };

  section.querySelector(".bookmark-search").hidden = false;
  input.addEventListener("input", applySearch);
  clear.addEventListener("click", () => {
    input.value = "";
    applySearch();
    input.focus();
  });
  applySearch();
}

if (typeof document !== "undefined") initBookmarks(document);
if (typeof module !== "undefined") module.exports = { normalizeSearch, initBookmarks };
