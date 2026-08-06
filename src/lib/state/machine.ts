import type { AppState } from "@/contracts";
import { DomainError } from "@/contracts/errors";

/**
 * 九态状态机转移表(v7.4)。UI 路由按这张表走,防止流程跳穿;
 * 任何态都能进 SAFETY_EXIT(安全红线随时可触发),SAFETY_EXIT 只回 HOME。
 */
export const APP_TRANSITIONS: Record<AppState, readonly AppState[]> = {
  ONBOARDING: ["HOME", "SAFETY_EXIT"],
  HOME: [
    "ONBOARDING",
    "DECISION",
    "DEDUCTION_CONFIRM",
    "CYCLE_REVIEW",
    "FOLLOWUP",
    "REVIEW",
    "PRINCIPLE",
    "SAFETY_EXIT",
  ],
  DECISION: ["DEDUCTION_CONFIRM", "HOME", "SAFETY_EXIT"],
  DEDUCTION_CONFIRM: ["HOME", "FOLLOWUP", "SAFETY_EXIT"],
  CYCLE_REVIEW: ["HOME", "SAFETY_EXIT"],
  FOLLOWUP: ["REVIEW", "HOME", "SAFETY_EXIT"],
  REVIEW: ["PRINCIPLE", "HOME", "SAFETY_EXIT"],
  PRINCIPLE: ["HOME", "SAFETY_EXIT"],
  SAFETY_EXIT: ["HOME"],
};

export function canTransition(from: AppState, to: AppState): boolean {
  return APP_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: AppState, to: AppState): void {
  if (!canTransition(from, to)) {
    throw new DomainError("state_conflict", `不允许的状态切换:${from} → ${to}`);
  }
}
