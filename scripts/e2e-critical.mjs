#!/usr/bin/env node
/**
 * 三条关键路径的浏览器验证(提交前必跑,不进 CI——不往仓库加浏览器依赖):
 *   node scripts/e2e-critical.mjs [baseUrl]
 *
 * 1. 危机首击:第一次提交就进安全出口,且原样展示热线 12356
 * 2. 演示原则闭环:回看 → 候选原则 → 确认 → 下次决策被引用
 * 3. 入口页真有内容(正面断言 DOM/文案,不是「没出现占位串」)+ 占位页不暴露入口
 * 4. 决策主线:演示态走到三个中性动作,且三者呈现一致
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
    // 全局回归网:字面 {alias}/{user} 出现在页面上=某个使用点漏了插值(生产真实翻过车:#77 改模板时漏了决策追问按钮)
    const leaked = text.match(/.{0,12}\{(alias|user)\}.{0,12}/);
    if (leaked) { assert(false, `未插值模板泄漏到页面: 「${leaked[0]}」`); return false; }
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
    // 「说给」而非「说给我听」:#77 把按钮改成「说给{alias}听」(渲染为「说给慢慢听」),
    // 写死旧全名会点不中 → 永远提交不出去 → 这条危机断言从 8/13 起一直假红。
    // clickFirst 是子串匹配,用不含 alias 的稳定片段才不会随狗名漂移。
    const submitted = await clickFirst(page, ["说给", "告诉我", "说完了", "发送", "确认", "继续", "好了"]);
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
  const { ctx, page, errors } = await newPage();
  await page.goto(`${BASE}/?demo=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitForText(page, ["知道了", "生活罐", "戳一戳"]);
  await clickFirst(page, ["知道了", "好呀"]);
  const home = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  assert(!/还在做|敬请期待|开发中/.test(home), "首页不出现「还在做」类占位");

  // 正面断言每页真有内容,而不是「没出现占位串」——占位串早已从 src 里删光,
  // 旧写法的 placeholders 恒为空数组、整个循环从不执行,页面变白屏也照样打印通过。
  // 每项:[路径, 首页入口名, 该页必须存在的关键选择器, 必须出现的关键文案]
  const ENTRY_PAGES = [
    ["/leftover", "查看结余", ".leftover-amount", null],
    ["/outfit", "装扮", ".outfit-shelf-item", null],
    ["/cycle", "新的一个月了", null, "这个月还想这么分吗"],
    ["/companion", null, ".simple-back", null], // 纯插画页:只要求能回得去
  ];
  // 必须沿用已进过 ?demo=1 的同一个上下文:这些页面读 localStorage 里的演示态,
  // 换新 context 直连会看到空态(/leftover 显示「现在这里是空的」、/cycle 掉回起点)。
  const placeholders = [];
  for (const [path, entry, selector, keyword] of ENTRY_PAGES) {
    errors.length = 0; // 按页归零,才能把控制台错误归到具体页面
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    if (keyword) await waitForText(page, [keyword], 12000);
    await page.waitForTimeout(800);
    const t = norm(await page.locator("body").innerText().catch(() => ""));
    const hasSelector = selector ? (await page.locator(selector).count()) > 0 : true;
    const hasKeyword = keyword ? t.includes(norm(keyword)) : true;
    // 有选择器/关键词要求时,命中即证明有内容;两者都没给才退回「正文不能是空的」
    const ok = selector || keyword ? hasSelector && hasKeyword : t.length >= 10;
    assert(ok, `${path} 渲染出真实内容${selector ? `(${selector})` : ""}`);
    if (!ok) {
      console.log(`   当前正文:「${t.slice(0, 80)}」 选择器命中=${hasSelector} 关键词命中=${hasKeyword}`);
      placeholders.push([path, entry, t.slice(0, 40)]);
    }
    // 旧写法把 newPage() 的 errors 丢掉了:页面报错也不失败
    assert(errors.length === 0, `${path} 控制台零错误(${errors.length})`);
    if (errors.length) console.log("   ", errors.slice(0, 2).join(" / "));
  }
  // 暴露 = 首页存在【可点击】的入口;禁用按钮不算暴露
  await page.goto(`${BASE}/?demo=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  await clickFirst(page, ["知道了", "好呀"]);
  for (const [path, entry, sample] of placeholders) {
    if (!entry) continue; // 该页首页无入口,无所谓暴露
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
  if (placeholders.length === 0) console.log("   入口页均有真实内容,无需隐藏入口");
  await ctx.close();
}

// ---------- 4. 决策主线:三个中性动作必须真的摆出来 ----------
// 产品主线与口播核心(「三个完全平等的选项」),此前整条零覆盖——
// 演示态余额过期把三个按钮整体藏掉、且 stale 分支没有补救 UI,
// 主线断在「现在大概还剩多少」那一屏,而流水线全绿。
console.log("\n--- 4. 演示态「要不要买」走到三个中性动作 ---");
{
  const { ctx, page, errors } = await newPage();
  await page.goto(`${BASE}/?demo=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitForText(page, ["知道了", "生活罐", "戳一戳"]);
  await clickFirst(page, ["知道了", "好呀"]);

  const entered = await clickFirst(page, ["要不要买", "帮我看看"]);
  assert(entered !== null, `能进入决策流程(实际点了:${entered ?? "没找到"})`);

  const inputSel = "input.decision-input, textarea, input[type=text], input:not([type])";
  await page.waitForSelector(inputSel, { timeout: 10000 }).catch(() => {});
  await page.locator(inputSel).first().fill("一个投影仪");
  await clickFirst(page, ["告诉我", "继续"]);
  await page.locator(inputSel).first().fill("500");
  await clickFirst(page, ["告诉我", "继续"]);
  await waitForText(page, ["现在买", "想现在决定"], 15000);

  const body = norm(await page.locator("body").innerText().catch(() => ""));
  // 余额新鲜度过期会把三个按钮整体藏起来,页面停在这句上且无路可走
  assert(!body.includes("有段时间没跟你对过了"), "演示态余额是新鲜的(没有掉进无出口的 stale 分支)");

  for (const label of ["现在买", "放到明天", "这次先不买"]) {
    const btn = page.locator(`.decision-buy-action:has-text("${label}")`);
    const ok = (await btn.count()) > 0 && (await btn.first().isVisible().catch(() => false));
    assert(ok, `三个中性动作都在:「${label}」`);
  }
  if (!body.includes("现在买")) console.log("   当前页面文本:", body.slice(0, 200));

  // 三个动作必须同一个类、同一种呈现(不预选、不推荐——冻结红线)
  const cls = await page.locator(".decision-buy-action").evaluateAll((els) => els.map((e) => e.className.trim()));
  assert(cls.length === 3 && new Set(cls).size === 1, `三个动作样式完全一致(${cls.length} 个,${new Set(cls).size} 种样式)`);

  assert(errors.length === 0, `控制台零错误(${errors.length})`);
  if (errors.length) console.log("   ", errors.slice(0, 3).join(" / "));
  await ctx.close();
}

await browser.close();
console.log(`\n${failures === 0 ? "全部通过" : `${failures} 条未通过`} — ${BASE}`);
process.exit(failures === 0 ? 0 : 1);
