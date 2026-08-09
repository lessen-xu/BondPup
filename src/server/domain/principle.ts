import { appendOp, DecisionStory, MoneyPrinciple, MoneyState } from "@/contracts";
import { DomainError } from "@/contracts/errors";
import { reviewedCount } from "@/server/domain/story";
import { validatePrincipleStatement } from "@/server/safety/validate";

/**
 * 金钱原则:用户拥有、可撤回的长期记忆,不是模型总结的人格。
 * 触发 = ≥3 条已完成回看的故事;只有确认或修改后才 confirmed;
 * 冲突原则并列不覆盖(都留着、标时间,由用户选)。
 */

export function principleEligible(state: MoneyState): boolean {
  return reviewedCount(state) >= 3;
}

/** 候选原则的证据池:最近 3 条已回看的故事 + 已确认原则(生成时用于防重复) */
export function principleContext(state: MoneyState): {
  evidence: DecisionStory[];
  existingStatements: string[];
} {
  const reviewed = state.stories.filter((s) => s.status === "reviewed");
  return {
    evidence: reviewed.slice(-3),
    existingStatements: state.principles
      .filter((p) => p.status === "confirmed" || p.status === "edited")
      .map((p) => p.statement),
  };
}

export interface BuildCandidateRequest {
  statement: string;
  evidenceIds: string[];
  expectedStateVersion: number;
  idempotencyKey: string;
}

export interface PrincipleWriteResult {
  state: MoneyState;
  principle: MoneyPrinciple;
  idempotent?: boolean;
}

/** 写入一条候选原则(校验在编排层完成,这里只负责状态写入) */
export function buildCandidate(state: MoneyState, req: BuildCandidateRequest): PrincipleWriteResult {
  const id = `principle-${req.idempotencyKey}`;
  if (state.appliedOps.includes(req.idempotencyKey)) {
    const existing = state.principles.find((p) => p.id === id);
    if (existing) return { state, principle: existing, idempotent: true };
  }
  if (req.expectedStateVersion !== state.stateVersion) {
    throw new DomainError(
      "state_conflict",
      `stateVersion 不匹配:期望 ${req.expectedStateVersion},当前 ${state.stateVersion}`
    );
  }
  const principle = MoneyPrinciple.parse({
    id,
    statement: req.statement,
    evidenceIds: req.evidenceIds,
    status: "candidate",
    userEdited: false,
    createdAt: new Date().toISOString(),
  });
  const newState = MoneyState.parse({
    ...state,
    stateVersion: state.stateVersion + 1,
    principles: [...state.principles, principle],
    appliedOps: appendOp(state.appliedOps, req.idempotencyKey),
  });
  return { state: newState, principle };
}

export interface ResolvePrincipleRequest {
  id: string;
  /** 像我 / 改说法 / 暂不确定 */
  decision: "like_me" | "edit" | "defer";
  /** decision=edit 时的用户文字;改过后的文字优先 */
  editedText?: string;
  expectedStateVersion: number;
  idempotencyKey: string;
}

export function resolvePrinciple(state: MoneyState, req: ResolvePrincipleRequest): PrincipleWriteResult {
  const existing = state.principles.find((p) => p.id === req.id);
  if (state.appliedOps.includes(req.idempotencyKey) && existing) {
    return { state, principle: existing, idempotent: true };
  }
  if (req.expectedStateVersion !== state.stateVersion) {
    throw new DomainError(
      "state_conflict",
      `stateVersion 不匹配:期望 ${req.expectedStateVersion},当前 ${state.stateVersion}`
    );
  }
  if (!existing) {
    throw new DomainError("not_found", "没有找到这条原则");
  }
  if (req.decision === "edit") {
    if (!req.editedText?.trim()) {
      throw new DomainError("validation_error", "改说法需要新的文字");
    }
    // 用户的文字优先,但同样不能是贴标签/说教式的句子——引用时是小狗在复述它
    const failures = validatePrincipleStatement(req.editedText);
    if (failures.length > 0) {
      throw new DomainError("validation_error", `这个说法先不能用:${failures.map((f) => f.message).join(";")}`);
    }
  }
  const principle = MoneyPrinciple.parse({
    ...existing,
    status: req.decision === "like_me" ? "confirmed" : req.decision === "edit" ? "edited" : "deferred",
    ...(req.decision === "edit"
      ? { statement: req.editedText!.trim(), userEdited: true }
      : {}),
  });
  const newState = MoneyState.parse({
    ...state,
    stateVersion: state.stateVersion + 1,
    principles: state.principles.map((p) => (p.id === principle.id ? principle : p)),
    appliedOps: appendOp(state.appliedOps, req.idempotencyKey),
  });
  return { state: newState, principle };
}

export interface RemovePrincipleRequest {
  id: string;
  expectedStateVersion: number;
  idempotencyKey: string;
}

/**
 * 删除一条原则(任何 status 都可删——候选和暂不确定的同样属于用户)。
 * 「这条不像我,我可以删掉」是"原则归用户所有"最直接的证明;删除后不再被引用。
 */
export function removePrinciple(
  state: MoneyState,
  req: RemovePrincipleRequest
): { state: MoneyState; idempotent?: boolean } {
  if (state.appliedOps.includes(req.idempotencyKey)) {
    return { state, idempotent: true };
  }
  if (req.expectedStateVersion !== state.stateVersion) {
    throw new DomainError(
      "state_conflict",
      `stateVersion 不匹配:期望 ${req.expectedStateVersion},当前 ${state.stateVersion}`
    );
  }
  if (!state.principles.some((p) => p.id === req.id)) {
    throw new DomainError("not_found", "没有找到这条原则");
  }
  const newState = MoneyState.parse({
    ...state,
    stateVersion: state.stateVersion + 1,
    principles: state.principles.filter((p) => p.id !== req.id),
    appliedOps: appendOp(state.appliedOps, req.idempotencyKey),
  });
  return { state: newState };
}

/** 回应引用用的已确认原则(折叠显示、可展开、可改、可删——UI 责任) */
export function confirmedPrinciples(state: MoneyState): MoneyPrinciple[] {
  return state.principles.filter((p) => p.status === "confirmed" || p.status === "edited");
}
