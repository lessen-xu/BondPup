import type { JarKind, MoneyState } from "@/contracts";
import { Cents } from "@/contracts/money";
import { DomainError } from "@/contracts/errors";

/**
 * 决策预览(确定性,只读,不调模型):金额=代码算,前端不做任何算术。
 * 硬规则:可自由支配的钱 = 安心罐;生活罐永不计入「可以买」。
 * 差额来源只是把取舍露出来——不预选、不推荐、不按金额排序(罐子固有顺序);
 * 真正扣钱仍走 commitJarDebit,由用户确认。
 */

export interface DecisionSource {
  jarKind: JarKind;
  label: string;
  /** 该罐当前可动用的部分(planned − actual,分) */
  amount: number;
}

export interface DecisionPreview {
  comfortAvailable: number;
  /** 买了之后安心罐还剩(不够时为 0) */
  remaining: number;
  /** 差多少(够则为 0) */
  shortfall: number;
  /** shortfall > 0 时的差额来源选项(不含安心罐;为 0 的罐子不列) */
  sources: DecisionSource[];
  /** 来源里有梦想罐时:对目标时间的可解释影响(给两个方向,不催) */
  goalImpact?: string;
}

function fmtYuan(cents: number): string {
  return cents % 100 === 0 ? `${cents / 100} 元` : `${(cents / 100).toFixed(2)} 元`;
}

export function previewDecision(state: MoneyState, input: { amount: number }): DecisionPreview {
  if (!Cents.safeParse(input.amount).success || input.amount === 0) {
    throw new DomainError("validation_error", "金额必须是正整数(单位:分)");
  }
  const availableOf = (kind: JarKind): number => {
    const jar = state.jars.find((j) => j.kind === kind);
    return jar ? Math.max(0, jar.planned - jar.actual) : 0;
  };
  const comfortAvailable = availableOf("comfort");
  const remaining = Math.max(0, comfortAvailable - input.amount);
  const shortfall = Math.max(0, input.amount - comfortAvailable);

  let sources: DecisionSource[] = [];
  let goalImpact: string | undefined;
  if (shortfall > 0) {
    sources = state.jars
      // 安心罐是被扣的主体不列;未来罐只进不出,永不作为差额来源(冻结规则)
      .filter((j) => j.kind !== "comfort" && j.kind !== "future")
      .map((j) => ({ jarKind: j.kind, label: j.label, amount: Math.max(0, j.planned - j.actual) }))
      .filter((s) => s.amount > 0);
    const dream = state.jars.find((j) => j.kind === "dream");
    if (dream?.goal && sources.some((s) => s.jarKind === "dream")) {
      const fromDream = Math.min(shortfall, Math.max(0, dream.planned - dream.actual));
      const monthly = dream.planned;
      const delayMonths = monthly > 0 ? Math.ceil(fromDream / monthly) : null;
      goalImpact =
        delayMonths !== null
          ? `从「${dream.goal.name}」出这 ${fmtYuan(fromDream)},这个月给它少放一些;按现在的月供,到达时间大约往后 ${delayMonths} 个月。也可以之后哪个月多放一点补回来,两个都行。`
          : `从「${dream.goal.name}」出这 ${fmtYuan(fromDream)},这个月给它少放一些。之后哪个月多放一点就能补回来。`;
    }
  }
  return { comfortAvailable, remaining, shortfall, sources, goalImpact };
}
