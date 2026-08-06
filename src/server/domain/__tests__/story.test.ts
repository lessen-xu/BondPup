import { describe, expect, it } from "vitest";
import { DomainError } from "@/contracts/errors";
import { applyJarPlan } from "@/lib/plan/apply-jar-plan";
import { completeReview, createDecisionStory, dueReviews, reviewedCount } from "../story";

function base() {
  return applyJarPlan({ disposable: 650000, livingPlanned: 220000 }).state;
}

describe("createDecisionStory", () => {
  it("创建:id 由 idempotencyKey 决定,reviewAt = now + 1 天", () => {
    const s = base();
    const before = Date.now();
    const r = createDecisionStory(s, {
      intent: "犹豫要不要买外套",
      action: "defer",
      amount: 40000,
      candidateJar: "comfort",
      reviewInDays: 1,
      expectedStateVersion: s.stateVersion,
      idempotencyKey: "k1",
    });
    expect(r.story.id).toBe("story-k1");
    expect(r.story.status).toBe("open");
    const reviewAt = new Date(r.story.reviewAt!).getTime();
    expect(reviewAt - before).toBeGreaterThan(86000000);
    expect(r.state.stateVersion).toBe(s.stateVersion + 1);
  });

  it("幂等重放返回同一条故事", () => {
    const s = base();
    const r1 = createDecisionStory(s, {
      intent: "x",
      action: "note_only",
      expectedStateVersion: s.stateVersion,
      idempotencyKey: "k1",
    });
    const r2 = createDecisionStory(r1.state, {
      intent: "x",
      action: "note_only",
      expectedStateVersion: 999,
      idempotencyKey: "k1",
    });
    expect(r2.idempotent).toBe(true);
    expect(r2.state.stories).toHaveLength(1);
  });
});

describe("completeReview", () => {
  it("回看完成:status → reviewed,outcome 落地,计数 +1", () => {
    const { state } = createDecisionStory(base(), {
      intent: "x",
      action: "buy_now",
      reviewInDays: 1,
      expectedStateVersion: 1 + 1,
      idempotencyKey: "k1",
    });
    expect(reviewedCount(state)).toBe(0);
    const r = completeReview(state, {
      storyId: "story-k1",
      happened: true,
      actualAmount: 40000,
      feelingNote: "买了,穿了三次,值",
      expectedStateVersion: state.stateVersion,
      idempotencyKey: "k2",
    });
    expect(r.story.status).toBe("reviewed");
    expect(r.story.outcome?.happened).toBe(true);
    expect(reviewedCount(r.state)).toBe(1);
  });

  it("重复回看同一条 → state_conflict;不存在 → not_found", () => {
    let { state } = createDecisionStory(base(), {
      intent: "x",
      action: "skip_this_time",
      expectedStateVersion: 2,
      idempotencyKey: "k1",
    });
    state = completeReview(state, {
      storyId: "story-k1",
      happened: false,
      expectedStateVersion: state.stateVersion,
      idempotencyKey: "k2",
    }).state;
    try {
      completeReview(state, {
        storyId: "story-k1",
        happened: true,
        expectedStateVersion: state.stateVersion,
        idempotencyKey: "k3",
      });
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).code).toBe("state_conflict");
    }
    try {
      completeReview(state, {
        storyId: "story-nope",
        happened: true,
        expectedStateVersion: state.stateVersion,
        idempotencyKey: "k4",
      });
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).code).toBe("not_found");
    }
  });
});

describe("dueReviews", () => {
  it("只返回到期且未回看的;不约回看的不出现", () => {
    let { state } = createDecisionStory(base(), {
      intent: "约了回看",
      action: "defer",
      reviewInDays: 1,
      expectedStateVersion: 2,
      idempotencyKey: "k1",
    });
    state = createDecisionStory(state, {
      intent: "只说说",
      action: "note_only",
      expectedStateVersion: state.stateVersion,
      idempotencyKey: "k2",
    }).state;
    expect(dueReviews(state, new Date())).toHaveLength(0);
    const dayAfter = new Date(Date.now() + 2 * 86400000);
    const due = dueReviews(state, dayAfter);
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe("story-k1");
  });
});
