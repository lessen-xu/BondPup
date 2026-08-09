import { z } from "zod";
import { AgentReply } from "@/contracts";

/**
 * Agent 任务面(模型只做这些;金额永远不经过模型):
 * - decompose_wish:起点第③步,把模糊愿望拆成 3-4 条可修改的「在意的事」
 * - companion_reply:点小狗/决策/说一笔时的短回应(≤3 句,先情绪后数字)
 * - generate_principle:基于 ≥3 条已回看故事生成一条候选原则(证据必须可追溯)
 */
export const DecomposeWishInput = z.object({
  task: z.literal("decompose_wish"),
  wish: z.string().min(1).max(500),
  nearChoice: z.string().max(100).optional(),
  goal: z.object({
    name: z.string().max(100),
    amount: z.number().int().nonnegative(),
    monthsRemaining: z.number().int().positive(),
  }).optional(),
});

export const CompanionReplyInput = z.object({
  task: z.literal("companion_reply"),
  scene: z.enum(["greet", "decision", "note", "review_note"]),
  userText: z.string().max(500).optional(),
  /**
   * 厚上下文:模型手上没东西只能说套话(用户实测反馈「像过家家」)。
   * 全部可选,前端有什么传什么;金额一律为分,由 prompts 层格式化成文本再进 prompt。
   */
  stateSummary: z
    .object({
      comfortAvailable: z.number().int().optional(),
      /** 这次要买的差额(分),由前端 previewDecision 算好传入——模型不做算术 */
      shortfall: z.number().int().optional(),
      jars: z
        .array(
          z.object({
            kind: z.string().max(20),
            label: z.string().max(30),
            planned: z.number().int(),
            actual: z.number().int(),
          })
        )
        .max(4)
        .optional(),
      hasCycle: z.boolean().optional(),
      updatedAt: z.string().optional(),
    })
    .optional(),
  /** 已确认的金钱原则原文(她自己确认过的话) */
  principles: z.array(z.string().max(60)).max(5).optional(),
  /** 起点问卷「在意的事」 */
  concerns: z.array(z.string().max(100)).max(6).optional(),
  /** 最近的相关决定故事(带结果与感受);模型只在真相关时引用 */
  recentStories: z
    .array(
      z.object({
        intent: z.string().max(120),
        action: z.string().max(30),
        happened: z.boolean().optional(),
        feelingNote: z.string().max(200).optional(),
        amount: z.number().int().optional(),
      })
    )
    .max(3)
    .optional(),
  /** 这次的物品与金额(分) */
  item: z.object({ name: z.string().max(120), amount: z.number().int().optional() }).optional(),
  context: z.object({
    item: z.string().max(120),
    action: z.string().max(80),
    outcome: z.string().max(200),
  }).optional(),
});

export const GeneratePrincipleInput = z.object({
  task: z.literal("generate_principle"),
  /** 已回看故事的最小摘要(不传完整倾诉原文);上限防公开 API 被灌超长上下文 */
  stories: z
    .array(
      z.object({
        id: z.string().max(150),
        intent: z.string().max(200),
        action: z.string().max(30),
        happened: z.boolean().optional(),
        feelingNote: z.string().max(300).optional(),
      })
    )
    .min(3)
    .max(12),
  /** 已确认原则(防重复;冲突时并列不覆盖,由用户选) */
  existingStatements: z.array(z.string().max(60)).max(20).default([]),
  /**
   * 起点问卷「在意的事」(profile.expressionPrefs):只作理解这个人的背景,
   * 不能被引用成原则、不能作 evidence——校验层只认 stories 里的 id
   */
  concerns: z.array(z.string().max(100)).max(6).default([]),
  /**
   * 两轮生成都不合规时是否用确定性候选兜底。默认 false = v7.4「宁缺毋滥」:
   * 再失败就不提。演示模式由前端显式传 true(评委路径不断)。
   */
  deterministicFallback: z.boolean().default(false),
  /** 重试轮次(校验失败重试一次时 +1,让生成结果变化) */
  attempt: z.number().int().min(0).default(0),
});

export const AgentTaskInput = z.discriminatedUnion("task", [
  DecomposeWishInput,
  CompanionReplyInput,
  GeneratePrincipleInput,
]);
export type AgentTaskInput = z.infer<typeof AgentTaskInput>;

export const DecomposeWishOutput = z.object({
  concerns: z.array(z.string().min(1)).min(3).max(4),
});
export type DecomposeWishOutput = z.infer<typeof DecomposeWishOutput>;

export const GeneratePrincipleOutput = z.object({
  /** 第一人称、描述倾向、带暂时语气、≤25 字(校验在 safety 层强制) */
  statement: z.string().min(1),
  evidenceIds: z.array(z.string()).min(2).max(3),
});
export type GeneratePrincipleOutput = z.infer<typeof GeneratePrincipleOutput>;

export type AgentTaskOutput =
  | { task: "decompose_wish"; result: DecomposeWishOutput }
  | { task: "companion_reply"; result: AgentReply }
  | { task: "generate_principle"; result: GeneratePrincipleOutput };
