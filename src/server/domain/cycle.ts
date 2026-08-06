import { MoneyState } from "@/contracts";
import { DomainError } from "@/contracts/errors";
import { computeMonthlyContribution } from "@/server/domain/monthly";
import { computeCycleLeftover, type CycleLeftover } from "@/server/domain/leftover";
import { applyJarPlan } from "@/lib/plan/apply-jar-plan";
import { currentCycleId } from "@/lib/mock/money-state";

/**
 * CYCLE_REVIEW:不重走起点,带上期数字问一句「这个月还想这么分吗」。
 * 触发:用户说工资到账,或新周期第一次打开时;不做定时推送。
 * 语义约定(v7.4 §8):dream.actual = 本周期已放入的月供,跨周期折进 goal.saved 再清零;
 * 月供跨周期重算、周期内永不重算;未来罐不动;上期结余并入碎钻。
 */

function monthsBetween(fromCycle: string, toCycle: string): number {
  const [fy, fm] = fromCycle.split("-").map(Number);
  const [ty, tm] = toCycle.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export function isNewCycle(state: MoneyState, now: Date = new Date()): boolean {
  return state.cycle !== null && state.cycle.cycle !== currentCycleId(now);
}

export interface CycleReviewProposal {
  previousCycle: string;
  newCycle: string;
  disposablePrevious: number;
  /** 沿用上期数字(候选,可改) */
  livingPlanned: number;
  comfortPrevious: number;
  futurePlanned: number;
  /** 梦想罐(无则全部为 null) */
  dreamMonthly: number | null;
  previousDreamMonthly: number | null;
  monthlyDirection: "up" | "down" | "same" | null;
  /** 折算后的累计(saved + 本期已放),确认时写回 goal.saved */
  dreamSavedAfterFold: number | null;
  monthsRemaining: number | null;
  /** 已有 ≥ 目标:达成——庆祝的是安排成了,不是「存得多真棒」 */
  goalReached: boolean;
  /** 期限已到还没到目标:不能说「没完成」,给「往后挪」或「就用现在这些」两个方向 */
  deadlinePassed: boolean;
  /** 上期结余(确认时并入碎钻) */
  leftover: CycleLeftover;
}

export function buildCycleReviewProposal(state: MoneyState, now: Date = new Date()): CycleReviewProposal {
  if (!state.cycle) {
    throw new DomainError("state_conflict", "还没有做过安排,走起点流程");
  }
  if (!isNewCycle(state, now)) {
    throw new DomainError("state_conflict", "还在当前周期,不需要月度回顾");
  }
  const newCycle = currentCycleId(now);
  const dream = state.jars.find((j) => j.kind === "dream");
  const goal = dream?.goal;
  let dreamMonthly: number | null = null;
  let savedAfterFold: number | null = null;
  let monthsRemaining: number | null = null;
  let goalReached = false;
  let deadlinePassed = false;
  if (dream && goal) {
    savedAfterFold = goal.saved + dream.actual;
    monthsRemaining = Math.max(0, monthsBetween(newCycle, goal.targetMonth));
    goalReached = savedAfterFold >= goal.amount;
    deadlinePassed = !goalReached && monthsBetween(newCycle, goal.targetMonth) <= 0;
    dreamMonthly = goalReached
      ? 0
      : computeMonthlyContribution({
          goal: { amount: goal.amount, saved: savedAfterFold },
          monthsRemaining,
        });
  }
  const previousDreamMonthly = dream?.planned ?? null;
  return {
    previousCycle: state.cycle.cycle,
    newCycle,
    disposablePrevious: state.cycle.disposable,
    livingPlanned: state.jars.find((j) => j.kind === "living")?.planned ?? 0,
    comfortPrevious: state.jars.find((j) => j.kind === "comfort")?.planned ?? 0,
    futurePlanned: state.jars.find((j) => j.kind === "future")?.planned ?? 0,
    dreamMonthly,
    previousDreamMonthly,
    monthlyDirection:
      dreamMonthly === null || previousDreamMonthly === null
        ? null
        : dreamMonthly > previousDreamMonthly
          ? "up"
          : dreamMonthly < previousDreamMonthly
            ? "down"
            : "same",
    dreamSavedAfterFold: savedAfterFold,
    monthsRemaining,
    goalReached,
    deadlinePassed,
    leftover: computeCycleLeftover(state),
  };
}

export interface ConfirmCycleReviewInput {
  /** 新周期可安排金额(工资到账后的数;不变就传上期的) */
  disposable: number;
  livingPlanned: number;
  /** 用户确认的月供;0 = 这个月一分不想放,完全合法,不追问 */
  dreamMonthly?: number;
  /** 把目标时间往后挪 n 个月(涨价提示的另一个方向) */
  extendMonths?: number;
  futurePlanned?: number;
  expectedStateVersion: number;
  idempotencyKey: string;
  now?: Date;
}

export interface ConfirmCycleReviewResult {
  state: MoneyState;
  idempotent?: boolean;
}

/** 用户确认后才写:折 saved、结余并入碎钻、actual 清零、按恒等式重建罐子 */
export function confirmCycleReview(state: MoneyState, input: ConfirmCycleReviewInput): ConfirmCycleReviewResult {
  if (state.appliedOps.includes(input.idempotencyKey)) {
    return { state, idempotent: true };
  }
  if (input.expectedStateVersion !== state.stateVersion) {
    throw new DomainError(
      "state_conflict",
      `stateVersion 不匹配:期望 ${input.expectedStateVersion},当前 ${state.stateVersion}`
    );
  }
  const now = input.now ?? new Date();
  if (!isNewCycle(state, now)) {
    throw new DomainError("state_conflict", "还在当前周期,不需要月度回顾");
  }
  const newCycle = currentCycleId(now);
  const dream = state.jars.find((j) => j.kind === "dream");
  const goal = dream?.goal;
  const lo = computeCycleLeftover(state);

  const base = MoneyState.parse({
    ...state,
    leftover: {
      amount: state.leftover.amount + lo.total,
      history: [...state.leftover.history, ...lo.entries],
    },
    jars: state.jars.map((j) => ({ ...j, actual: 0 })),
  });

  let dreamGoal;
  if (dream && goal) {
    const savedAfterFold = goal.saved + dream.actual;
    const monthsRemaining = Math.max(
      0,
      monthsBetween(newCycle, goal.targetMonth) + (input.extendMonths ?? 0)
    );
    dreamGoal = {
      name: goal.name,
      amount: goal.amount,
      saved: savedAfterFold,
      monthsRemaining,
    };
  }

  const { state: newState } = applyJarPlan({
    baseState: base,
    disposable: input.disposable,
    livingPlanned: input.livingPlanned,
    dreamGoal,
    dreamMonthlyOverride: dreamGoal ? input.dreamMonthly : undefined,
    futurePlanned: input.futurePlanned ?? state.jars.find((j) => j.kind === "future")?.planned ?? 0,
    idempotencyKey: input.idempotencyKey,
    confirmed: true,
    now,
  });
  return { state: newState };
}
