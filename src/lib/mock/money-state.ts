import { MoneyState } from "@/contracts";

/** 当前周期 "YYYY-MM" */
export function currentCycleId(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 从当前周期往后 n 个月的周期 id */
export function cycleAfter(months: number, from: Date = new Date()): string {
  return currentCycleId(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, 1)));
}

/** 全新会话的初始状态:无周期、无罐子(无罐子也能和小狗说话,只是不能报告确定余额) */
export function createInitialMoneyState(displayName?: string): MoneyState {
  const now = new Date().toISOString();
  return MoneyState.parse({
    stateVersion: 1,
    profile: { ...(displayName ? { displayName } : {}), createdAt: now },
    cycle: null,
    jars: [],
    leftover: { amount: 0, history: [] },
    stories: [],
    principles: [],
    outfit: { owned: [], equipped: [], unlockSource: {}, assetsVersion: 1 },
    appliedOps: [],
    demo: true,
  });
}

const T = "2026-08-06T09:00:00.000Z";

/**
 * 合成示例数据(demo:true 明确标识,与真实数据分离):
 * 工资 6500 元的第一次安排 —— 恒等式 2200 + 3500 + 800 + 0 = 6500(单位:元;存储为分)。
 * 首屏只生成三个罐子;未来罐 0 显示为可点入口,不出现在 jars 里。
 * 模块加载即 parse:contracts 一旦漂移,这里最先报错。
 */
export const mockMoneyState: MoneyState = MoneyState.parse({
  stateVersion: 1,
  profile: { displayName: "示例用户", createdAt: T },
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
      goal: { name: "去看海", amount: 960000, saved: 0, targetMonth: "2027-07" },
    },
  ],
  leftover: { amount: 0, history: [] },
  stories: [],
  principles: [],
  outfit: { owned: [], equipped: [], unlockSource: {}, assetsVersion: 1 },
  appliedOps: [],
  demo: true,
});
