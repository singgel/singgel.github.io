const { test } = require("node:test");
const assert = require("node:assert/strict");
const { setImmediate } = require("node:timers/promises");
const { copyAccountId, initSocialAccounts } = require("../assets/socials.js");

test("copy writes the complete account number as text", async () => {
  const copied = [];
  const navigator = { clipboard: { writeText: async (value) => copied.push(value) } };
  assert.equal(await copyAccountId(navigator, "53454430349"), true);
  assert.deepEqual(copied, ["53454430349"]);
});

test("missing, denied and inaccessible clipboard support return a recoverable failure", async () => {
  for (const navigator of [
    undefined,
    {},
    { clipboard: {} },
    { clipboard: { writeText: async () => { throw new Error("permission denied"); } } },
    { get clipboard() { throw new Error("clipboard unavailable"); } },
  ]) {
    assert.equal(await copyAccountId(navigator, "2608737253"), false);
  }
});

function fixture(navigator) {
  const button = new EventTarget();
  button.dataset = { copyAccount: "2608737253", status: "account-status", platform: "小红书" };
  button.hidden = true;
  const status = { textContent: "也可以选中或长按号码复制。" };
  const doc = {
    querySelectorAll: () => [button],
    getElementById: (id) => {
      assert.equal(id, "account-status");
      return status;
    },
  };
  initSocialAccounts(doc, { navigator });
  return { button, status };
}

test("a pending copy disables its button and announces success only after completion", async () => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const page = fixture({ clipboard: { writeText: () => pending } });
  assert.equal(page.button.hidden, false);
  page.button.dispatchEvent(new Event("click"));
  assert.equal(page.button.disabled, true);
  assert.equal(page.status.textContent, "正在复制账号…");
  finish();
  await setImmediate();
  assert.equal(page.button.disabled, false);
  assert.equal(page.status.textContent, "账号已复制，请到小红书 App 搜索用户。");
});

test("copy failure preserves manual selection instructions and allows retry", async () => {
  const page = fixture({ clipboard: { writeText: async () => { throw new Error("denied"); } } });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    page.button.dispatchEvent(new Event("click"));
    await setImmediate();
    assert.equal(page.button.disabled, false);
    assert.equal(page.status.textContent, "复制未成功，请手动复制账号 2608737253。");
  }
});
