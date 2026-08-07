import type { MoneyState } from "@/contracts";

/**
 * 临时实现,仅用于显示,等后端 previewDecision 上线后
 * 整个文件删掉,只改这一处 import。
 *
 * 这里刻意只做安心罐余额与购买金额的纯减法。来源选项和目标影响
 * 属于业务规则,在后端函数上线前保持 undefined,不在前端猜测。
 */

export interface PreviewDecisionResult {
  comfortAvailable: number;
  remaining: number;
  shortfall: number;
  sources: ReadonlyArray<{ id: string; label: string }> | undefined;
  goalImpact: string | undefined;
}

export interface PreviewDecisionInput {
  amount: number;
}

export function previewDecisionLocal(state: MoneyState, input: PreviewDecisionInput): PreviewDecisionResult {
  const comfortJar = state.jars.find((jar) => jar.kind === "comfort");
  const comfortAvailable = (comfortJar?.planned ?? 0) - (comfortJar?.actual ?? 0);
  const { amount } = input;

  return {
    comfortAvailable,
    remaining: Math.max(0, comfortAvailable - amount),
    shortfall: Math.max(0, amount - comfortAvailable),
    sources: undefined,
    goalImpact: undefined,
  };
}
