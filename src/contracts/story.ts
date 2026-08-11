import { z } from "zod";
import { Cents, JarKind } from "./money";

/** 三个中性动作 + 只说说不改余额 */
export const StoryAction = z.enum(["buy_now", "defer", "skip_this_time", "note_only", "pending_confirmation"]);
export type StoryAction = z.infer<typeof StoryAction>;

export const StoryOutcome = z.object({
  reviewedAt: z.iso.datetime(),
  happened: z.boolean(),
  actualAmount: Cents.optional(),
  /** 短摘要,不存完整倾诉原文(隐私约定,长度硬上限) */
  feelingNote: z.string().max(200).optional(),
});
export type StoryOutcome = z.infer<typeof StoryOutcome>;

/** 决策故事;原则触发条件 = status==="reviewed" 的故事 ≥3(必须有结果,不是 3 次决定) */
export const DecisionStory = z.object({
  id: z.string().min(1),
  /** 意图短摘要,不存完整倾诉原文 */
  intent: z.string().min(1).max(120),
  amount: Cents.optional(),
  candidateJar: JarKind.optional(),
  confirmedJar: JarKind.optional(),
  action: StoryAction,
  reviewAt: z.iso.datetime().optional(),
  outcome: StoryOutcome.optional(),
  emotionSummary: z.string().max(120).optional(),
  status: z.enum(["open", "pending", "reviewed"]),
  createdAt: z.iso.datetime(),
}).refine((story) => story.status !== "reviewed" || story.outcome !== undefined, {
  // 「已回看必有结果」在契约层锁死:completeReview 必写 outcome,唯一能造出
  // 无 outcome 的 reviewed 是导出 JSON 手改再导回——在 parse 边界直接拒绝,
  // 四处 status==="reviewed" 筛选(reviewedCount/证据池/ReviewFlow/evidence 校验)自动安全
  message: "已回看的故事必须带 outcome",
});
export type DecisionStory = z.infer<typeof DecisionStory>;

export const PrincipleStatus = z.enum(["candidate", "confirmed", "edited", "deferred"]);
export type PrincipleStatus = z.infer<typeof PrincipleStatus>;

/** 中文按码点计数;.max(25) 数的是 UTF-16 单元,会数错 */
const MAX_STATEMENT_CODEPOINTS = 25;

/** 金钱原则:必须来自 2-3 条已回看故事;冲突原则并列不覆盖(数组天然支持) */
export const MoneyPrinciple = z.object({
  id: z.string().min(1),
  statement: z
    .string()
    .min(1)
    .refine((s) => [...s].length <= MAX_STATEMENT_CODEPOINTS, {
      message: "原则不超过 25 字",
    }),
  evidenceIds: z
    .array(z.string().min(1))
    .min(2)
    .max(3)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "证据故事不得重复",
    }),
  status: PrincipleStatus,
  userEdited: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type MoneyPrinciple = z.infer<typeof MoneyPrinciple>;
