import { z } from "zod";
import { BudgetCycle, Jar, Leftover } from "./money";
import { DecisionStory, MoneyPrinciple } from "./story";
import { OutfitState, SafetyEvent, UserProfile } from "./user";

/**
 * 顶层业务状态。真源在前端 localStorage(或评测方自持),服务端不持久化;
 * 写操作成功后返回 stateVersion+1 的完整新 state。
 */
export const MoneyState = z
  .object({
    stateVersion: z.number().int().min(1),
    profile: UserProfile,
    cycle: BudgetCycle.nullable(),
    jars: z.array(Jar),
    leftover: Leftover,
    stories: z.array(DecisionStory),
    principles: z.array(MoneyPrinciple),
    outfit: OutfitState,
    /** 最近应用过的 idempotencyKey,写操作去重用 */
    appliedOps: z.array(z.string()),
    /** 安全事件审计(不含用户原文;default 兼容旧状态) */
    safetyEvents: z.array(SafetyEvent).default([]),
    /** 合成数据明确标识(法规与评审要求);真实新会话为 false,仅演示模式为 true */
    demo: z.boolean(),
  })
  .superRefine((s, ctx) => {
    const kinds = s.jars.map((j) => j.kind);
    if (new Set(kinds).size !== kinds.length) {
      ctx.addIssue({ code: "custom", message: "每种罐子各至多一个(kind 不得重复)" });
    }
  });
export type MoneyState = z.infer<typeof MoneyState>;

/** 写操作公共入参:乐观锁 + 幂等。版本不符 → state_conflict;key 命中 appliedOps → 幂等返回当前态 */
export const WriteOpMeta = z.object({
  expectedStateVersion: z.number().int().min(1),
  idempotencyKey: z.string().min(1),
});
export type WriteOpMeta = z.infer<typeof WriteOpMeta>;
