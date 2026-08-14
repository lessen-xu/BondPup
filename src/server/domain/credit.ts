import { JarKind, MoneyState } from "@/contracts";
import { Cents } from "@/contracts/money";
import { DomainError } from "@/contracts/errors";
import { appendOp } from "@/contracts/state";

export interface CreditRequest {
  jarKind: JarKind;
  amount: number;
  expectedStateVersion: number;
  idempotencyKey: string;
}

export interface CreditResult {
  state: MoneyState;
  idempotent?: boolean;
}

/** 新进账由用户选罐后确认:总收入与该罐 planned 同额增加,四罐恒等式保持不变。 */
export function commitJarCredit(state: MoneyState, req: CreditRequest): CreditResult {
  if (!Cents.safeParse(req.amount).success || req.amount === 0) {
    throw new DomainError("validation_error", "金额必须是正整数(单位:分)");  // copy-ok
  }
  if (state.appliedOps.includes(req.idempotencyKey)) return { state, idempotent: true };
  if (req.expectedStateVersion !== state.stateVersion) {
    throw new DomainError(
      "state_conflict",
      `stateVersion 不匹配:期望 ${req.expectedStateVersion},当前 ${state.stateVersion}`
    );
  }
  if (!state.cycle) throw new DomainError("not_found", "还没有这个月的安排");
  const jar = state.jars.find((item) => item.kind === req.jarKind);
  if (!jar) throw new DomainError("not_found", `还没有 ${req.jarKind} 罐`);

  const now = new Date().toISOString();
  return {
    state: MoneyState.parse({
      ...state,
      stateVersion: state.stateVersion + 1,
      cycle: {
        ...state.cycle,
        disposable: state.cycle.disposable + req.amount,
        updatedAt: now,
      },
      jars: state.jars.map((item) =>
        item.kind === req.jarKind
          ? { ...item, planned: item.planned + req.amount, updatedAt: now }
          : item
      ),
      appliedOps: appendOp(state.appliedOps, req.idempotencyKey),
    }),
  };
}
