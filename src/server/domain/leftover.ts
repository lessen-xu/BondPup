import { JarKind, MoneyState } from "@/contracts";
import { Cents } from "@/contracts/money";
import { DomainError } from "@/contracts/errors";

/**
 * 结余碎钻:上期没花完的钱,不挂任何罐子名下。
 * 不自动转入任何罐、不计数、不庆祝、变少不失落、为 0 不显示(UI 责任)。
 * leftover.history 是「从哪来」的只追加明细;amount 是当前总额,挪走时只减 amount 不改写来源明细。
 */

export interface CycleLeftover {
  total: number;
  entries: { cycle: string; amount: number; fromJar: JarKind }[];
}

/** 当前周期各罐的正余数(planned − actual > 0);future 长期累计,不参与清算 */
export function computeCycleLeftover(state: MoneyState): CycleLeftover {
  const cycle = state.cycle?.cycle;
  if (!cycle) return { total: 0, entries: [] };
  const entries = state.jars
    .filter((j) => j.kind !== "future")
    .map((j) => ({ cycle, amount: Math.max(0, j.planned - j.actual), fromJar: j.kind }))
    .filter((e) => e.amount > 0);
  return { total: entries.reduce((s, e) => s + e.amount, 0), entries };
}

export interface MoveLeftoverRequest {
  toKind: JarKind;
  /** 可拆分:挪一部分,剩下的还在 */
  amount: number;
  expectedStateVersion: number;
  idempotencyKey: string;
}

export interface MoveLeftoverResult {
  state: MoneyState;
  /** UI 可直接用的一句话;挪走要说成好事(这个月更宽裕),不是失去 */
  movedNote: string;
  idempotent?: boolean;
}

/**
 * 由用户发起的碎钻移动(系统永不自动转):
 * living/comfort/future → planned 增加(本期可用变多);
 * dream → actual 增加(计入本期已放月供,跨周期折进 goal.saved)。
 * 有碎钻必有周期,有周期必四罐(schema 强制)——目标罐必然存在,缺罐即 not_found。
 */
export function moveLeftover(state: MoneyState, req: MoveLeftoverRequest): MoveLeftoverResult {
  if (!Cents.safeParse(req.amount).success || req.amount === 0) {
    throw new DomainError("validation_error", "金额必须是正整数(单位:分)");
  }
  if (state.appliedOps.includes(req.idempotencyKey)) {
    return { state, movedNote: "", idempotent: true };
  }
  if (req.expectedStateVersion !== state.stateVersion) {
    throw new DomainError(
      "state_conflict",
      `stateVersion 不匹配:期望 ${req.expectedStateVersion},当前 ${state.stateVersion}`
    );
  }
  if (req.amount > state.leftover.amount) {
    throw new DomainError("state_conflict", "碎钻里没有这么多");
  }
  const now = new Date().toISOString();
  let jars = state.jars;
  const target = jars.find((j) => j.kind === req.toKind);
  if (!target) {
    throw new DomainError("not_found", `还没有 ${req.toKind} 罐,先完成一次安排`);
  }
  if (req.toKind === "dream") {
    jars = jars.map((j) =>
      j.kind === "dream" ? { ...j, actual: j.actual + req.amount, updatedAt: now } : j
    );
  } else {
    jars = jars.map((j) =>
      j.kind === req.toKind ? { ...j, planned: j.planned + req.amount, updatedAt: now } : j
    );
  }
  const newState = MoneyState.parse({
    ...state,
    stateVersion: state.stateVersion + 1,
    jars,
    leftover: { ...state.leftover, amount: state.leftover.amount - req.amount },
    appliedOps: [...state.appliedOps.slice(-19), req.idempotencyKey],
  });
  return { state: newState, movedNote: "好,这个月就松一点了。" };
}
