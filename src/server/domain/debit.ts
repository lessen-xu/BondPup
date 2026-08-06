import type { JarKind, MoneyState } from "@/contracts";
import { DomainError } from "@/contracts/errors";

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
  undoToken: string;
}

/**
 * 扣罐(actual += amount)。计划 8/8 实现。
 * 冻结的行为约束:乐观锁(版本不符 → state_conflict)、幂等(key 命中 appliedOps → 返回当前态)、
 * 罐子不足时把取舍露给用户,绝不静默扣另一个罐(不级联)。
 */
export function commitJarDebit(_state: MoneyState, _req: DebitRequest): DebitResult {
  throw new DomainError("internal_error", "commitJarDebit 未实现(计划 8/8)");
}

export function undoJarDebit(_state: MoneyState, _undoToken: string): MoneyState {
  throw new DomainError("internal_error", "undoJarDebit 未实现(计划 8/8)");
}
