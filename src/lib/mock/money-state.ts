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

/**
 * 合成示例数据(demo:true 明确标识,与真实数据分离):
 * 工资 6500 元的第一次安排 —— 恒等式 2200 + 3500 + 800 + 0 = 6500(单位:元;存储为分)。
 * 四罐常驻:未来罐未启用时以 planned 0 存在于 jars,前端按数组渲染、不做缺失兜底。
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
      actual: 0,
      updatedAt: T,
    },
    {
      id: "jar-comfort",
      kind: "comfort",
      label: "安心罐",
      renamable: false,
      planned: 350000,
      actual: 0,
      updatedAt: T,
    },
    {
      id: "jar-dream",
      kind: "dream",
      label: "去看海",
      renamable: true,
      planned: 80000,
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
  leftover: { amount: 0, history: [] },
  stories: [],
  principles: [],
  outfit: { owned: [], equipped: [], unlockSource: {}, assetsVersion: 1 },
  appliedOps: [],
  demo: true,
});
