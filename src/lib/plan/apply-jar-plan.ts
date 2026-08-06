import { MoneyState } from "@/contracts";
import { computeJars, type ComputeJarsResult } from "@/server/domain/jars";
import { computeLivingJar, type LivingItems } from "@/server/domain/living";
import { computeMonthlyContribution } from "@/server/domain/monthly";
import { createInitialMoneyState, currentCycleId, cycleAfter } from "@/lib/mock/money-state";

/**
 * 四罐方案的唯一来源:MCP 的 plan_jars 与起点⑥⑦页面都调这里,算法永远一致。
 * 纯函数,不做 I/O;金额一律为分。
 */

export interface DreamGoalPlanInput {
  name: string;
  amount: number;
  saved: number;
  monthsRemaining: number;
}

export interface ApplyJarPlanInput {
  baseState?: MoneyState | null;
  disposable: number;
  livingPlanned?: number;
  /** 起点④「帮我算一下」清单;与 livingPlanned 二选一,都给时以 livingPlanned 为准 */
  livingItems?: LivingItems;
  dreamGoal?: DreamGoalPlanInput;
  futurePlanned?: number;
  idempotencyKey?: string;
  /** 起点⑦用户确认时为 true → 写入 cycle.confirmedAt(改过并确认才算数) */
  confirmed?: boolean;
}

export interface ApplyJarPlanResult {
  state: MoneyState;
  plan: ComputeJarsResult & { dreamMonthly: number };
  note: string;
}

function fmtYuan(cents: number): string {
  return cents % 100 === 0 ? `${cents / 100} 元` : `${(cents / 100).toFixed(2)} 元`;
}

export function applyJarPlan(input: ApplyJarPlanInput): ApplyJarPlanResult {
  const base = input.baseState ?? createInitialMoneyState();
  const livingPlanned =
    input.livingPlanned ?? (input.livingItems ? computeLivingJar(input.livingItems) : 0);
  const dreamMonthly = input.dreamGoal
    ? computeMonthlyContribution({
        goal: { amount: input.dreamGoal.amount, saved: input.dreamGoal.saved },
        monthsRemaining: input.dreamGoal.monthsRemaining,
      })
    : 0;
  const r = computeJars({
    disposable: input.disposable,
    livingPlanned,
    dreamMonthly,
    futurePlanned: input.futurePlanned ?? 0,
  });

  const now = new Date().toISOString();
  const actualOf = (kind: string) => base.jars.find((j) => j.kind === kind)?.actual ?? 0;
  const jars = [
    {
      id: "jar-living",
      kind: "living",
      label: "生活罐",
      renamable: false,
      planned: r.living,
      actual: actualOf("living"),
      updatedAt: now,
    },
    {
      id: "jar-comfort",
      kind: "comfort",
      label: "安心罐",
      renamable: false,
      planned: r.comfort,
      actual: actualOf("comfort"),
      updatedAt: now,
    },
    ...(input.dreamGoal
      ? [
          {
            id: "jar-dream",
            kind: "dream",
            label: input.dreamGoal.name,
            renamable: true,
            planned: r.dream,
            actual: actualOf("dream"),
            updatedAt: now,
            goal: {
              name: input.dreamGoal.name,
              amount: input.dreamGoal.amount,
              saved: input.dreamGoal.saved,
              targetMonth: cycleAfter(input.dreamGoal.monthsRemaining),
            },
          },
        ]
      : []),
    ...(r.future > 0
      ? [
          {
            id: "jar-future",
            kind: "future",
            label: "未来罐",
            renamable: false,
            planned: r.future,
            actual: actualOf("future"),
            updatedAt: now,
          },
        ]
      : []),
  ];

  const state = MoneyState.parse({
    ...base,
    stateVersion: base.stateVersion + 1,
    cycle: {
      cycle: currentCycleId(),
      disposable: input.disposable,
      updatedAt: now,
      ...(input.confirmed ? { confirmedAt: now } : {}),
    },
    jars,
    appliedOps: input.idempotencyKey
      ? [...base.appliedOps.slice(-19), input.idempotencyKey]
      : base.appliedOps,
  });

  const note =
    r.shortfall > 0
      ? `按这个安排会差 ${fmtYuan(r.shortfall)}。差的部分放在哪里由你来定,我不会自动动别的罐子。`
      : `剩下的 ${fmtYuan(r.comfort)} 进了安心罐——这是这个月可以不愧疚地用在当下的部分。`;

  return { state, plan: { ...r, dreamMonthly }, note };
}
