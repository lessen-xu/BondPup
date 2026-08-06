import { JarKind, MoneyState } from "@/contracts";
import { Cents } from "@/contracts/money";
import { DomainError } from "@/contracts/errors";

const UNDO_PREFIX = "undo:v1:";

export interface DebitRequest {
  jarKind: JarKind;
  /** 单位:分 */
  amount: number;
  storyId?: string;
  expectedStateVersion: number;
  idempotencyKey: string;
}

export interface DebitResult {
  state: MoneyState;
  /** 自包含撤销令牌(服务端不存扣账历史):undo:v1:{jarKind}:{amount}:{idempotencyKey} */
  undoToken: string;
  /** 扣后 actual 超出 planned 的部分;>0 时 UI 温和呈现,不评判、不阻止 */
  overPlan: number;
  idempotent?: boolean;
}

/**
 * 扣罐(actual += amount)。乐观锁 + 幂等;罐子必须已存在;
 * 允许 actual 超过 planned(记录事实,不说「超支/不够」);永不级联到其他罐。
 */
export function commitJarDebit(state: MoneyState, req: DebitRequest): DebitResult {
  if (!Cents.safeParse(req.amount).success) {
    throw new DomainError("validation_error", "金额必须是非负整数(单位:分)");
  }
  const undoToken = `${UNDO_PREFIX}${req.jarKind}:${req.amount}:${req.idempotencyKey}`;
  if (state.appliedOps.includes(req.idempotencyKey)) {
    return { state, undoToken, overPlan: 0, idempotent: true };
  }
  if (req.expectedStateVersion !== state.stateVersion) {
    throw new DomainError(
      "state_conflict",
      `stateVersion 不匹配:期望 ${req.expectedStateVersion},当前 ${state.stateVersion}`
    );
  }
  const jar = state.jars.find((j) => j.kind === req.jarKind);
  if (!jar) {
    throw new DomainError("not_found", `还没有 ${req.jarKind} 罐,先完成一次安排`);
  }
  const now = new Date().toISOString();
  const newActual = jar.actual + req.amount;
  const newState = MoneyState.parse({
    ...state,
    stateVersion: state.stateVersion + 1,
    jars: state.jars.map((j) =>
      j.kind === req.jarKind ? { ...j, actual: newActual, updatedAt: now } : j
    ),
    appliedOps: [...state.appliedOps.slice(-19), req.idempotencyKey],
  });
  return { state: newState, undoToken, overPlan: Math.max(0, newActual - jar.planned) };
}

/** 撤销一笔扣罐:令牌自包含;key 必须还在 appliedOps 里(防伪造/重复撤销) */
export function undoJarDebit(state: MoneyState, undoToken: string): MoneyState {
  if (!undoToken.startsWith(UNDO_PREFIX)) {
    throw new DomainError("validation_error", "撤销令牌不合法");
  }
  const rest = undoToken.slice(UNDO_PREFIX.length);
  const first = rest.indexOf(":");
  const second = rest.indexOf(":", first + 1);
  if (first < 0 || second < 0) {
    throw new DomainError("validation_error", "撤销令牌不合法");
  }
  const kindParsed = JarKind.safeParse(rest.slice(0, first));
  const amount = Number(rest.slice(first + 1, second));
  const key = rest.slice(second + 1);
  if (!kindParsed.success || !Cents.safeParse(amount).success || !key) {
    throw new DomainError("validation_error", "撤销令牌不合法");
  }
  if (!state.appliedOps.includes(key)) {
    throw new DomainError("not_found", "没有找到这笔可撤销的记录");
  }
  const jar = state.jars.find((j) => j.kind === kindParsed.data);
  if (!jar) {
    throw new DomainError("not_found", `还没有 ${kindParsed.data} 罐`);
  }
  if (jar.actual < amount) {
    throw new DomainError("state_conflict", "当前数字对不上,这笔撤销不了");
  }
  const now = new Date().toISOString();
  return MoneyState.parse({
    ...state,
    stateVersion: state.stateVersion + 1,
    jars: state.jars.map((j) =>
      j.kind === kindParsed.data ? { ...j, actual: j.actual - amount, updatedAt: now } : j
    ),
    appliedOps: state.appliedOps.filter((k) => k !== key),
  });
}
