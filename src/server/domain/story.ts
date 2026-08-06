import { DecisionStory, JarKind, MoneyState, StoryAction } from "@/contracts";
import { DomainError } from "@/contracts/errors";

/**
 * 决策故事生命周期。三种决定(现在买/放到明天/这次先不买)没有高下,
 * 回看关注实际发生了什么,不统计用户忍住了多少次。
 * 写操作与 debit 同款:乐观锁 + 幂等(story id 由 idempotencyKey 决定,重放可寻回)。
 */

export interface CreateStoryRequest {
  intent: string;
  action: StoryAction;
  amount?: number;
  candidateJar?: JarKind;
  confirmedJar?: JarKind;
  emotionSummary?: string;
  /** 用户同意的回看时间(1 天或 3 天);不约则不设 reviewAt,提醒可关闭 */
  reviewInDays?: 1 | 3;
  expectedStateVersion: number;
  idempotencyKey: string;
}

export interface StoryWriteResult {
  state: MoneyState;
  story: DecisionStory;
  idempotent?: boolean;
}

export function createDecisionStory(state: MoneyState, req: CreateStoryRequest): StoryWriteResult {
  const id = `story-${req.idempotencyKey}`;
  if (state.appliedOps.includes(req.idempotencyKey)) {
    const existing = state.stories.find((s) => s.id === id);
    if (existing) return { state, story: existing, idempotent: true };
  }
  if (req.expectedStateVersion !== state.stateVersion) {
    throw new DomainError(
      "state_conflict",
      `stateVersion 不匹配:期望 ${req.expectedStateVersion},当前 ${state.stateVersion}`
    );
  }
  const now = new Date();
  const story = DecisionStory.parse({
    id,
    intent: req.intent,
    ...(req.amount !== undefined ? { amount: req.amount } : {}),
    ...(req.candidateJar ? { candidateJar: req.candidateJar } : {}),
    ...(req.confirmedJar ? { confirmedJar: req.confirmedJar } : {}),
    action: req.action,
    ...(req.reviewInDays
      ? { reviewAt: new Date(now.getTime() + req.reviewInDays * 86400000).toISOString() }
      : {}),
    ...(req.emotionSummary ? { emotionSummary: req.emotionSummary } : {}),
    status: "open",
    createdAt: now.toISOString(),
  });
  const newState = MoneyState.parse({
    ...state,
    stateVersion: state.stateVersion + 1,
    stories: [...state.stories, story],
    appliedOps: [...state.appliedOps.slice(-19), req.idempotencyKey],
  });
  return { state: newState, story };
}

export interface CompleteReviewRequest {
  storyId: string;
  /** 当时的决定实际发生了吗 */
  happened: boolean;
  actualAmount?: number;
  feelingNote?: string;
  expectedStateVersion: number;
  idempotencyKey: string;
}

export function completeReview(state: MoneyState, req: CompleteReviewRequest): StoryWriteResult {
  const existing = state.stories.find((s) => s.id === req.storyId);
  if (state.appliedOps.includes(req.idempotencyKey) && existing) {
    return { state, story: existing, idempotent: true };
  }
  if (req.expectedStateVersion !== state.stateVersion) {
    throw new DomainError(
      "state_conflict",
      `stateVersion 不匹配:期望 ${req.expectedStateVersion},当前 ${state.stateVersion}`
    );
  }
  if (!existing) {
    throw new DomainError("not_found", "没有找到这条故事");
  }
  if (existing.status === "reviewed") {
    throw new DomainError("state_conflict", "这条故事已经回看过了");
  }
  const now = new Date().toISOString();
  const story = DecisionStory.parse({
    ...existing,
    status: "reviewed",
    outcome: {
      reviewedAt: now,
      happened: req.happened,
      ...(req.actualAmount !== undefined ? { actualAmount: req.actualAmount } : {}),
      ...(req.feelingNote ? { feelingNote: req.feelingNote } : {}),
    },
  });
  const newState = MoneyState.parse({
    ...state,
    stateVersion: state.stateVersion + 1,
    stories: state.stories.map((s) => (s.id === story.id ? story : s)),
    appliedOps: [...state.appliedOps.slice(-19), req.idempotencyKey],
  });
  return { state: newState, story };
}

/** 到期待回看的故事(FOLLOWUP 状态的数据源) */
export function dueReviews(state: MoneyState, now: Date = new Date()): DecisionStory[] {
  const t = now.toISOString();
  return state.stories.filter((s) => s.status === "open" && s.reviewAt !== undefined && s.reviewAt <= t);
}

/** 原则触发条件的分子:必须是有结果的回看,不是 3 次决定 */
export function reviewedCount(state: MoneyState): number {
  return state.stories.filter((s) => s.status === "reviewed").length;
}
