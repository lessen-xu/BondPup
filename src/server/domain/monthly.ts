import { z } from "zod";
import { Cents } from "@/contracts/money";
import { DomainError } from "@/contracts/errors";

const MonthlyInput = z.object({
  goal: z.object({ amount: Cents, saved: Cents }),
  monthsRemaining: z.number().int(),
});
export type MonthlyInput = z.input<typeof MonthlyInput>;

/**
 * 月供 = round(max(0, 目标金额 − 已存) ÷ max(1, 剩余月数))。
 * 只在跨周期(CYCLE_REVIEW)时重算为候选,周期内永不重算;
 * 结果不截断(月供 > 可安排金额的取舍由 computeJars.shortfall 暴露,职责分离)。
 */
export function computeMonthlyContribution(input: MonthlyInput): number {
  const parsed = MonthlyInput.safeParse(input);
  if (!parsed.success) {
    throw new DomainError("validation_error", "金额必须是非负整数(单位:分)", parsed.error.issues);
  }
  const { goal, monthsRemaining } = parsed.data;
  const remaining = Math.max(0, goal.amount - goal.saved);
  return Math.round(remaining / Math.max(1, monthsRemaining));
}
