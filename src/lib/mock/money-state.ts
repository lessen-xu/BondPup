import { MoneyState } from "@/contracts";

/** 业务时区固定 Asia/Shanghai(UTC+8),不随部署环境(Vercel 是 UTC)漂移 */
const BUSINESS_TZ_OFFSET_MS = 8 * 3600_000;

function bizYearMonth(d: Date): { y: number; m: number } {
  const t = new Date(d.getTime() + BUSINESS_TZ_OFFSET_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() };
}

/** 当前周期 "YYYY-MM"(北京时间):月初 00:00-08:00 不能落到上个月 */
export function currentCycleId(d: Date = new Date()): string {
  const { y, m } = bizYearMonth(d);
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** 从当前周期往后 n 个月的周期 id */
export function cycleAfter(months: number, from: Date = new Date()): string {
  const { y, m } = bizYearMonth(from);
  const t = new Date(Date.UTC(y, m + months, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * 全新会话的初始状态:无周期、无罐子(无罐子也能和小狗说话,只是不能报告确定余额)。
 * 真实会话 demo:false;合成示例只有 mockMoneyState / enterDemo() 一条路(demo:true)。
 */
export function createInitialMoneyState(displayName?: string, dogName?: string): MoneyState {
  const now = new Date().toISOString();
  return MoneyState.parse({
    stateVersion: 1,
    profile: {
      ...(displayName ? { displayName } : {}),
      ...(dogName ? { dogName } : {}),
      createdAt: now,
    },
    cycle: null,
    jars: [],
    leftover: { amount: 0, history: [] },
    stories: [],
    principles: [],
    outfit: { owned: [], equipped: [], unlockSource: {}, assetsVersion: 1 },
    appliedOps: [],
    demo: false,
  });
}

const T = "2026-08-06T09:00:00.000Z";
const DEMO_DUE_REVIEW_AT = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

/**
 * 合成示例数据(demo:true 明确标识,与真实数据分离):
 * 工资 6500 元的第一次安排 —— 恒等式 2200 + 3500 + 800 + 0 = 6500(单位:元;存储为分)。
 * 四罐常驻:未来罐未启用时以 planned 0 存在于 jars,前端按数组渲染、不做缺失兜底。
 * 故事:两条已回看 + 一条已到期待回看,评审当场完成第三次回看即可看到候选原则闭环。
 * 模块加载即 parse:contracts 一旦漂移,这里最先报错。
 */
export const mockMoneyState: MoneyState = MoneyState.parse({
  stateVersion: 1,
  profile: { displayName: "示例用户", dogName: "慢慢", createdAt: T },
  cycle: { cycle: "2026-08", disposable: 650000, confirmedAt: T, updatedAt: T },
  jars: [
    {
      id: "jar-living",
      kind: "living",
      label: "生活罐",
      renamable: false,
      planned: 220000,
      // 上月房租吃饭已花 1900:周期回顾的「上月没花完」才是合理小数目,
      // 不然 actual 全 0 时整月 6500 全变碎钻,评委会当成 bug
      actual: 190000,
      updatedAt: T,
    },
    {
      id: "jar-comfort",
      kind: "comfort",
      label: "安心罐",
      renamable: false,
      planned: 350000,
      // 已花 2000(那双 399 的鞋 + 日常):余额 1500,评委输两三千就能看到
      // 差额来源分支——「从哪个罐子出」是决策流程最有说服力的画面
      actual: 200000,
      updatedAt: T,
    },
    {
      id: "jar-dream",
      kind: "dream",
      label: "去看海",
      renamable: true,
      planned: 80000,
      // 本期月供未放:让差额分支能给出「从『去看海』出」这个来源,
      // 选中它会显示对目标的影响提示——决策流程最有说服力的画面
      actual: 0,
      updatedAt: T,
      // 演示态:已存一期月供,还差 8800 元;(9600-800)÷11 个月 = 800 与月供自洽
      goal: { name: "去看海", amount: 960000, saved: 80000, targetMonth: "2027-07" },
    },
    {
      id: "jar-future",
      kind: "future",
      label: "未来罐",
      renamable: false,
      planned: 0,
      actual: 0,
      updatedAt: T,
    },
  ],
  // 上期(2026-07)结余 320 元:让「多周期 + 碎钻」在演示里可见(medium 档);
  // 首页碎钻按钮 amount>0 才渲染,demo 一进来就能点
  leftover: {
    amount: 32000,
    history: [
      { cycle: "2026-07", amount: 22000, fromJar: "comfort" },
      { cycle: "2026-07", amount: 10000, fromJar: "living" },
    ],
  },
  // 两条已回看 + 一条已到期:评审可当场完成第三次回看(reviewed≥3)触发候选原则
  stories: [
    {
      id: "story-demo-1",
      intent: "那双白色的鞋",
      amount: 39900,
      action: "defer",
      reviewAt: "2026-08-03T09:00:00.000Z",
      outcome: {
        reviewedAt: "2026-08-03T10:00:00.000Z",
        happened: true,
        feelingNote: "我还是觉得它好看，但买回来发现搭配的场合很少",
      },
      status: "reviewed",
      createdAt: "2026-08-02T09:00:00.000Z",
    },
    {
      id: "story-demo-2",
      intent: "一件外套",
      amount: 59900,
      action: "defer",
      reviewAt: "2026-08-05T09:00:00.000Z",
      outcome: {
        reviewedAt: "2026-08-05T12:00:00.000Z",
        happened: false,
        feelingNote: "想了三天，发现想不出什么时候会穿",
      },
      status: "reviewed",
      createdAt: "2026-08-04T09:00:00.000Z",
    },
    {
      id: "story-demo-3",
      intent: "一个投影仪",
      amount: 240000,
      action: "buy_now",
      reviewAt: DEMO_DUE_REVIEW_AT,
      status: "open",
      createdAt: "2026-08-06T09:00:00.000Z",
    },
  ],
  principles: [],
  outfit: { owned: [], equipped: [], unlockSource: {}, assetsVersion: 1 },
  appliedOps: [],
  demo: true,
});
