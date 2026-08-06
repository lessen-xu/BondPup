import { z } from "zod";
import { Cents } from "@/contracts/money";
import { DomainError } from "@/contracts/errors";

const ComputeJarsInput = z.object({
  /** 本月可安排金额 */
  disposable: Cents,
  livingPlanned: Cents,
  /** 梦想罐月供(由 computeMonthlyContribution 得出);无目标则 0 */
  dreamMonthly: Cents.default(0),
  /** 未来罐:默认 0,永不自动接收,只能用户主动填 */
  futurePlanned: Cents.default(0),
});
export type ComputeJarsInput = z.input<typeof ComputeJarsInput>;

export interface ComputeJarsResult {
  living: number;
  comfort: number;
  dream: number;
  future: number;
  /**
   * 缺口:living+dream+future 超出可安排金额的部分。
   * >0 时 comfort=0;取舍必须露给用户选来源,本函数绝不改动其他罐(不级联)。
   */
  shortfall: number;
}

/**
 * 四罐恒等式:living + comfort + dream + future === disposable(+shortfall 时差额可解释)。
 * 安心罐是被动余项(余数进安心罐,不进未来罐——不预设「存钱=好」)。
 */
export function computeJars(input: ComputeJarsInput): ComputeJarsResult {
  const parsed = ComputeJarsInput.safeParse(input);
  if (!parsed.success) {
    throw new DomainError("validation_error", "金额必须是非负整数(单位:分)", parsed.error.issues);
  }
  const { disposable, livingPlanned, dreamMonthly, futurePlanned } = parsed.data;
  const fixed = livingPlanned + dreamMonthly + futurePlanned;
  return {
    living: livingPlanned,
    comfort: Math.max(0, disposable - fixed),
    dream: dreamMonthly,
    future: futurePlanned,
    shortfall: Math.max(0, fixed - disposable),
  };
}
