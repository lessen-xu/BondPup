import { describe, expect, it } from "vitest";
import { generatePrincipleCandidate } from "@/server/agent";
import { applyJarPlan } from "@/lib/plan/apply-jar-plan";
import { completeReview, createDecisionStory } from "../story";
import {
  buildCandidate,
  confirmedPrinciples,
  principleEligible,
  removePrinciple,
  resolvePrinciple,
} from "../principle";

/** 造 n 条已回看的故事(action 全为 defer) */
function stateWithReviewed(n: number) {
  let state = applyJarPlan({ disposable: 650000, livingPlanned: 220000 }).state;
  for (let i = 0; i < n; i++) {
    state = createDecisionStory(state, {
      intent: `犹豫 ${i}`,
      action: "defer",
      expectedStateVersion: state.stateVersion,
      idempotencyKey: `c${i}`,
    }).state;
    state = completeReview(state, {
      storyId: `story-c${i}`,
      happened: true,
      feelingNote: "第二天还是想要,买了不后悔",
      expectedStateVersion: state.stateVersion,
      idempotencyKey: `r${i}`,
    }).state;
  }
  return state;
}

describe("原则触发与生成编排", () => {
  it("2 条已回看 → 不触发;3 条 → 触发", async () => {
    expect(principleEligible(stateWithReviewed(2))).toBe(false);
    expect(await generatePrincipleCandidate(stateWithReviewed(2))).toBeNull();
    const s3 = stateWithReviewed(3);
    expect(principleEligible(s3)).toBe(true);
    const candidate = await generatePrincipleCandidate(s3);
    expect(candidate).not.toBeNull();
    expect(candidate!.evidenceIds).toHaveLength(3);
    expect([...candidate!.statement].length).toBeLessThanOrEqual(25);
  });

  it("生成不合格 → 重试一次;两次都不合格 → 静默返回 null", async () => {
    const s = stateWithReviewed(3);
    const bad = { statement: "你应该少花点,加油", evidenceIds: ["story-c0", "story-c1"] };
    const good = { statement: "我放一晚再决定,好像更踏实", evidenceIds: ["story-c0", "story-c1"] };
    let calls = 0;
    const healed = await generatePrincipleCandidate(s, async () => {
      calls++;
      return calls === 1 ? bad : good;
    });
    expect(calls).toBe(2);
    expect(healed?.statement).toBe(good.statement);
    const dropped = await generatePrincipleCandidate(s, async () => bad);
    expect(dropped).toBeNull();
  });

  it("生成抛错同样重试后静默", async () => {
    const s = stateWithReviewed(3);
    const dropped = await generatePrincipleCandidate(s, async () => {
      throw new Error("model_timeout");
    });
    expect(dropped).toBeNull();
  });
});

describe("候选写入与三动作", () => {
  it("像我 → confirmed 并被引用;冲突原则并列不覆盖", () => {
    let state = stateWithReviewed(3);
    state = buildCandidate(state, {
      statement: "我放一晚再决定,好像更踏实",
      evidenceIds: ["story-c0", "story-c1"],
      expectedStateVersion: state.stateVersion,
      idempotencyKey: "p1",
    }).state;
    state = resolvePrinciple(state, {
      id: "principle-p1",
      decision: "like_me",
      expectedStateVersion: state.stateVersion,
      idempotencyKey: "p1-resolve",
    }).state;
    // 一条语义相反的原则:两条并存,都不被覆盖
    state = buildCandidate(state, {
      statement: "我想要的当下就买,好像更痛快",
      evidenceIds: ["story-c1", "story-c2"],
      expectedStateVersion: state.stateVersion,
      idempotencyKey: "p2",
    }).state;
    state = resolvePrinciple(state, {
      id: "principle-p2",
      decision: "like_me",
      expectedStateVersion: state.stateVersion,
      idempotencyKey: "p2-resolve",
    }).state;
    expect(state.principles).toHaveLength(2);
    expect(confirmedPrinciples(state)).toHaveLength(2);
  });

  it("改说法 → edited、userEdited、新文字优先;暂不确定 → deferred 不被引用", () => {
    let state = stateWithReviewed(3);
    state = buildCandidate(state, {
      statement: "我放一晚再决定,好像更踏实",
      evidenceIds: ["story-c0", "story-c1"],
      expectedStateVersion: state.stateVersion,
      idempotencyKey: "p1",
    }).state;
    const edited = resolvePrinciple(state, {
      id: "principle-p1",
      decision: "edit",
      editedText: "我睡一觉起来再决定",
      expectedStateVersion: state.stateVersion,
      idempotencyKey: "e1",
    });
    expect(edited.principle.status).toBe("edited");
    expect(edited.principle.userEdited).toBe(true);
    expect(edited.principle.statement).toBe("我睡一觉起来再决定");
    expect(confirmedPrinciples(edited.state)).toHaveLength(1);

    let s2 = stateWithReviewed(3);
    s2 = buildCandidate(s2, {
      statement: "我放一晚再决定,好像更踏实",
      evidenceIds: ["story-c0", "story-c1"],
      expectedStateVersion: s2.stateVersion,
      idempotencyKey: "p1",
    }).state;
    const deferred = resolvePrinciple(s2, {
      id: "principle-p1",
      decision: "defer",
      expectedStateVersion: s2.stateVersion,
      idempotencyKey: "d1",
    });
    expect(deferred.principle.status).toBe("deferred");
    expect(confirmedPrinciples(deferred.state)).toHaveLength(0);
  });

  it("改说法也过语句校验:说教式文字被拒", () => {
    let state = stateWithReviewed(3);
    state = buildCandidate(state, {
      statement: "我放一晚再决定,好像更踏实",
      evidenceIds: ["story-c0", "story-c1"],
      expectedStateVersion: state.stateVersion,
      idempotencyKey: "p1",
    }).state;
    try {
      resolvePrinciple(state, {
        id: "principle-p1",
        decision: "edit",
        editedText: "你应该少花点",
        expectedStateVersion: state.stateVersion,
        idempotencyKey: "e-bad",
      });
      expect.unreachable();
    } catch (e) {
      expect((e as import("@/contracts/errors").DomainError).code).toBe("validation_error");
    }
  });
});

describe("主闭环集成:决定 → 回看 → 候选 → 确认 → 引用", () => {
  it("从零到一条被引用的原则", async () => {
    let state = stateWithReviewed(3);
    const candidate = await generatePrincipleCandidate(state);
    expect(candidate).not.toBeNull();
    state = buildCandidate(state, {
      statement: candidate!.statement,
      evidenceIds: candidate!.evidenceIds,
      expectedStateVersion: state.stateVersion,
      idempotencyKey: "flow-p",
    }).state;
    state = resolvePrinciple(state, {
      id: "principle-flow-p",
      decision: "like_me",
      expectedStateVersion: state.stateVersion,
      idempotencyKey: "flow-r",
    }).state;
    const cited = confirmedPrinciples(state);
    expect(cited).toHaveLength(1);
    expect(cited[0].evidenceIds.length).toBeGreaterThanOrEqual(2);
  });
});

describe("removePrinciple 删除(原则归用户所有,任何状态可删)", () => {
  function withConfirmed() {
    let state = stateWithReviewed(3);
    state = buildCandidate(state, {
      statement: "我放一晚再决定,好像更踏实",
      evidenceIds: state.stories.slice(0, 2).map((s) => s.id),
      expectedStateVersion: state.stateVersion,
      idempotencyKey: "del-build",
    }).state;
    state = resolvePrinciple(state, {
      id: "principle-del-build",
      decision: "like_me",
      expectedStateVersion: state.stateVersion,
      idempotencyKey: "del-resolve",
    }).state;
    return state;
  }

  it("删除后不再出现、不再被引用,版本 +1", () => {
    const state = withConfirmed();
    expect(confirmedPrinciples(state)).toHaveLength(1);
    const r = removePrinciple(state, {
      id: "principle-del-build",
      expectedStateVersion: state.stateVersion,
      idempotencyKey: "del-1",
    });
    expect(r.state.principles).toHaveLength(0);
    expect(confirmedPrinciples(r.state)).toHaveLength(0);
    expect(r.state.stateVersion).toBe(state.stateVersion + 1);
  });

  it("幂等重放;删不存在的 → not_found", () => {
    const state = withConfirmed();
    const r = removePrinciple(state, {
      id: "principle-del-build",
      expectedStateVersion: state.stateVersion,
      idempotencyKey: "del-1",
    });
    const replay = removePrinciple(r.state, {
      id: "principle-del-build",
      expectedStateVersion: 999,
      idempotencyKey: "del-1",
    });
    expect(replay.idempotent).toBe(true);
    try {
      removePrinciple(r.state, {
        id: "principle-nope",
        expectedStateVersion: r.state.stateVersion,
        idempotencyKey: "del-2",
      });
      expect.unreachable();
    } catch (e) {
      expect((e as import("@/contracts/errors").DomainError).code).toBe("not_found");
    }
  });
});
