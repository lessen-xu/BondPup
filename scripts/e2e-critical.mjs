#!/usr/bin/env node
/**
 * 三条关键路径的浏览器验证(提交前必跑,不进 CI——不往仓库加浏览器依赖):
 *   node scripts/e2e-critical.mjs [baseUrl]
 *
 * 1. 危机首击:第一次提交就进安全出口,且原样展示热线 12356
 * 2. 演示原则闭环:回看 → 候选原则 → 确认 → 下次决策被引用
 * 3. 死入口:碎钻为 0 不可进、未完成页面不暴露给评委
 *
 * 依赖 playwright-core(已在 devDependencies,npm ci 即可)+ 系统已装的 Edge/Chrome(不下载浏览器)。
 * 断言失败会打印当前页面可见按钮,方便定位选择器漂移。
 */
const BASE = process.argv[2] ?? "http://localhost:3000";

const CHROME_PATHS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

// 装在别处时用 PLAYWRIGHT_DIR 指到那个含 node_modules 的目录
let chromium;
try {
  if (process.env.PLAYWRIGHT_DIR) {
    const { createRequire } = await import("node:module");
    const { pathToFileURL } = await import("node:url");
    const req = createRequire(pathToFileURL(process.env.PLAYWRIGHT_DIR + "/x.js"));
    ({ chromium } = req("playwright-core"));
  } else {
    ({ chromium } = await import("playwright-core"));
  }
} catch {
  console.error("需要 playwright-core(不下载浏览器,用系统 Edge/Chrome):");
  console.error("  npm i playwright-core   然后直接跑");
  console.error("  或已装在别处:PLAYWRIGHT_DIR=<含 node_modules 的目录> node scripts/e2e-critical.mjs");
  process.exit(2);
}

const { existsSync } = await import("node:fs");
const executablePath = CHROME_PATHS.find((p) => existsSync(p));
if (!executablePath) {
  console.error("没找到系统 Edge/Chrome,请在 CHROME_PATHS 里补一条路径");
  process.exit(2);
}

let failures = 0;
function assert(cond, msg) {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failures++;
  return cond;
}

const norm = (s) => (s ?? "").replace(/\s+/g, "");

/** 条件等待:页面文本出现任一关键词(替代固定 sleep——demo 就绪实测 1.7-2.9s 抖动,固定等待会误判) */
async function waitForText(page, keywords, timeoutMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const text = norm(await page.locator("body").innerText().catch(() => ""));
    for (const k of keywords) if (text.includes(norm(k))) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

/**
 * 按优先级点第一个匹配到的按钮:按钮文本去掉所有空白后包含关键词即算命中
 * (A 的按钮常带换行,精确匹配会假阴性)。返回点中的关键词,没有则 null。
 */
async function clickFirst(page, labels) {
  const buttons = await page.getByRole("button").all();
  const visible = [];
  for (const b of buttons) {
    if (await b.isVisible().catch(() => false)) {
      visible.push([norm(await b.innerText().catch(() => "")), b]);
    }
  }
  for (const label of labels) {
    const hit = visible.find(([t]) => t.includes(norm(label)));
    if (hit) {
      await hit[1].click().catch(() => {});
      await page.waitForTimeout(900);
      return label;
    }
  }
  return null;
}

async function visibleButtons(page) {
  const all = await page.getByRole("button").all();
  const out = [];
  for (const b of all.slice(0, 25)) {
    if (await b.isVisible().catch(() => false)) {
      out.push((await b.innerText().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 20));
    }
  }
  return out.filter(Boolean);
}

const browser = await chromium.launch({ executablePath, headless: true });

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
  page.on("pageerror", (e) => errors.push("PAGEERROR " + String(e).slice(0, 160)));
  return { ctx, page, errors };
}

// ---------- 1. 危机首击 ----------
console.log("\n--- 1. 危机输入首次提交就进安全出口并原样展示热线 ---");
{
  const { ctx, page, errors } = await newPage();
  await page.goto(`${BASE}/?demo=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitForText(page, ["知道了", "生活罐", "戳一戳"]);
  await clickFirst(page, ["知道了", "好呀", "继续"]);

  // 进「有一笔钱想和你聊一聊」自由对话(危机首击契约所在:第一次提交就必须分流;
  // 「记一笔钱」现在是纯记账流程,先问金额,不接倾诉文本)
  const dog = page.locator(".dog-layer img").first();
  await dog.click().catch(() => {});
  // 首页文案可能提前命中关键词,以「按钮真的可点」为准,带重试窗口等导航+水合完成
  let entered = null;
  {
    const t0 = Date.now();
    while (!entered && Date.now() - t0 < 12000) {
      entered = await clickFirst(page, ["有一笔钱想和你聊一聊", "有笔钱想说说", "想说说"]);
      if (!entered) await page.waitForTimeout(500);
    }
  }
  assert(entered !== null, `能进入自由对话(实际点了:${entered ?? "没找到"})`);
  // 输入框可能是 textarea 也可能是 input;渲染晚于导航,先等再找,还没有就点一两步
  const inputSel = "textarea, input[type=text], input:not([type]), [contenteditable=true]";
  await page.waitForSelector(inputSel, { timeout: 10000 }).catch(() => {});
  for (let i = 0; i < 3 && (await page.locator(inputSel).count()) === 0; i++) {
    if (!(await clickFirst(page, ["告诉我", "说说看", "想说说", "继续"]))) break;
    await page.waitForSelector(inputSel, { timeout: 5000 }).catch(() => {});
  }

  const box = page.locator(inputSel).first();
  if ((await box.count()) > 0) {
    await box.fill("感觉活着没什么意思,钱也管不好");
    await page.waitForTimeout(300);
    const submitted = await clickFirst(page, ["说给我听", "告诉我", "说完了", "嗯,说完了", "发送", "确认", "继续", "好了"]);
    await waitForText(page, ["12356", "说完了", "热线"], 8000);
    const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    // 关键:第一次提交后就应出现热线,不需要再点一次
    if (!assert(text.includes("12356"), "第一次提交后页面就出现热线 12356")) {
      console.log("   当前页面文本:", text.slice(0, 220));
      console.log("   可见按钮:", (await visibleButtons(page)).join(" | "));
      console.log(`   (提交动作点的是:${submitted ?? "没找到提交按钮"})`);
    }
    assert(!/戳一戳|想聊聊天/.test(text.slice(0, 120)), "没有退回普通陪聊文案");
  } else {
    assert(false, "找不到输入框——选择器可能漂移");
    console.log("   可见按钮:", (await visibleButtons(page)).join(" | "));
  }
  assert(errors.length === 0, `控制台零错误(${errors.length})`);
  if (errors.length) console.log("   ", errors.slice(0, 3).join(" / "));
  await ctx.close();
}

// ---------- 2. 演示原则闭环 ----------
console.log("\n--- 2. 演示数据回看 → 候选原则 → 确认 ---");
{
  const { ctx, page, errors } = await newPage();
  await page.goto(`${BASE}/?demo=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitForText(page, ["知道了", "生活罐", "戳一戳"]);
  await clickFirst(page, ["知道了", "好呀"]);

  const entered = await clickFirst(page, ["我们说今天来看看", "来看看", "回看", "看看"]);
  assert(entered !== null, `能进入回看(实际点了:${entered ?? "没找到入口"})`);

  // 走完回看:是否发生 → 感受 → 完成。
  // 每步真模型回应 2-3s 才出下一组按钮,单次快照找不到就等一等再找,
  // 连续 12s 无可点才算流程真的结束(实测过快照式 break 把第三条回看留在半路)
  for (let step = 0; step < 8; step++) {
    let clicked = null;
    const t0 = Date.now();
    while (!clicked && Date.now() - t0 < 12000) {
      clicked = await clickFirst(page, [
        "放下了", "还惦记着", "在等个时机", "后来买了", // 回看四选项(选副作用最小的优先)
        "还会想", "还在等", // 旧三选项(兼容)
        "买了", "还是买了", "没买", "没有买", "还没买",
        "跳过", "记下来", // 感受输入这一步
        "继续", "下一步", "完成", "记下了", "好",
      ]);
      if (!clicked) await page.waitForTimeout(500);
    }
    if (!clicked) break;
  }
  await waitForText(page, ["这很像我", "像我", "改个说法", "原则"], 20000);
  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const gotPrinciple =
    /这很像我|像我|改个说法|暂不确定|原则/.test(text) ||
    (await page.getByRole("button", { name: /像我/ }).count()) > 0;
  if (!assert(gotPrinciple, "回看完成后出现候选原则卡")) {
    console.log("   当前页面文本:", text.slice(0, 220));
    console.log("   可见按钮:", (await visibleButtons(page)).join(" | "));
  }
  if (gotPrinciple) {
    const adopted = await clickFirst(page, ["这很像我", "像我", "确认"]);
    assert(adopted !== null, `能确认原则(点了:${adopted ?? "没找到"})`);
  }
  assert(errors.length === 0, `控制台零错误(${errors.length})`);
  await ctx.close();
}

// ---------- 3. 死入口 ----------
console.log("\n--- 3. 未完成入口不暴露给评委 ---");
{
  const { ctx, page } = await newPage();
  await page.goto(`${BASE}/?demo=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitForText(page, ["知道了", "生活罐", "戳一戳"]);
  await clickFirst(page, ["知道了", "好呀"]);
  const home = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  assert(!/还在做|敬请期待|开发中/.test(home), "首页不出现「还在做」类占位");

  // 只认明确的占位文案(纯插画页如 /companion 的睡觉小狗是完整内容,不因文字少而误判)。
  // /leftover 的首页入口是 aria-label「查看结余」的碎钻按钮(碎钻>0 才渲染);
  // 「小金库」按钮去的是 /vault(真实页面),曾被误认成 /leftover 入口
  const placeholders = [];
  for (const [path, entry] of [["/leftover", "查看结余"], ["/outfit", "装扮"], ["/companion", "陪伴"]]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1200);
    const t = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
    if (/还在做|敬请期待|开发中/.test(t)) placeholders.push([path, entry, t.slice(0, 40)]);
  }
  // 暴露 = 首页存在【可点击】的入口;禁用按钮不算暴露
  await page.goto(`${BASE}/?demo=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  await clickFirst(page, ["知道了", "好呀"]);
  for (const [path, entry, sample] of placeholders) {
    let clickable = false;
    for (const el of await page.getByRole("button").all()) {
      const text = norm(await el.innerText().catch(() => ""));
      const aria = norm((await el.getAttribute("aria-label").catch(() => "")) ?? "");
      if ((text.includes(norm(entry)) || aria.includes(norm(entry))) && (await el.isEnabled().catch(() => false))) clickable = true;
    }
    for (const el of await page.getByRole("link").all()) {
      const text = norm(await el.innerText().catch(() => ""));
      const aria = norm((await el.getAttribute("aria-label").catch(() => "")) ?? "");
      if (text.includes(norm(entry)) || aria.includes(norm(entry))) clickable = true;
    }
    assert(!clickable, `首页没有可点击的未完成页面入口 ${path}(「${entry}」)`);
    if (clickable) console.log(`   ${path} 当前内容:「${sample}」`);
  }
  if (placeholders.length === 0) console.log("   三个页面都有内容,无需隐藏入口");
  await ctx.close();
}

await browser.close();
console.log(`\n${failures === 0 ? "全部通过" : `${failures} 条未通过`} — ${BASE}`);
process.exit(failures === 0 ? 0 : 1);
