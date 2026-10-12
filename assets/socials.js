"use strict";

async function copyAccountId(navigator, account) {
  try {
    if (typeof navigator?.clipboard?.writeText !== "function") return false;
    await navigator.clipboard.writeText(account);
    return true;
  } catch {
    return false;
  }
}

function initSocialAccounts(doc, win) {
  doc.querySelectorAll("[data-copy-account]").forEach((button) => {
    button.hidden = false;
    button.addEventListener("click", async () => {
      button.disabled = true;
      const status = doc.getElementById(button.dataset.status);
      status.textContent = "正在复制账号…";
      const copied = await copyAccountId(win.navigator, button.dataset.copyAccount);
      status.textContent = copied
        ? `账号已复制，请到${button.dataset.platform} App 搜索用户。`
        : `复制未成功，请手动复制账号 ${button.dataset.copyAccount}。`;
      button.disabled = false;
    });
  });
}

if (typeof document !== "undefined") initSocialAccounts(document, window);
if (typeof module !== "undefined") module.exports = { copyAccountId, initSocialAccounts };
