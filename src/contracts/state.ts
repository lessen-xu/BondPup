import { z } from "zod";
import { BudgetCycle, Jar, JarKind, Leftover } from "./money";
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
    if (s.cycle) {
      const kindSet = new Set(kinds);
      for (const kind of JarKind.options) {
        if (!kindSet.has(kind)) {
          ctx.addIssue({ code: "custom", message: `有周期时四种罐子必须齐全,0 元也保留(缺 ${kind})` });
        }
      }
      // 四罐恒等式在 schema 层锁死(仅已确认周期:短缺预览态本来就带缺口,不写库):
      // MCP 依赖客户端链回状态,曾实测 Σplanned=650001、disposable=650000 的恶意状态被原样接受
      if (s.cycle.confirmedAt) {
        const planned = s.jars.reduce((a, j) => a + j.planned, 0);
        if (planned !== s.cycle.disposable) {
          ctx.addIssue({
            code: "custom",
            message: `四罐恒等式不成立:计划总和 ${planned} ≠ 可安排 ${s.cycle.disposable}`,
          });
        }
      }
    }
  });
export type MoneyState = z.infer<typeof MoneyState>;

/** 写操作公共入参:乐观锁 + 幂等。版本不符 → state_conflict;key 命中 appliedOps → 幂等返回当前态 */
export const WriteOpMeta = z.object({
  expectedStateVersion: z.number().int().min(1),
  idempotencyKey: z.string().min(1),
});
export type WriteOpMeta = z.infer<typeof WriteOpMeta>;

/**
 * 幂等键保留窗口。窗口外的旧 key 重放会被当作新操作——窗口越小重放越不安全
 * (曾经只留 20,第 21 次操作后重放旧 key 会二次扣款)。200 约 6KB,远低于请求体上限。
 */
export const OPS_WINDOW = 200;

/** 追加幂等键并裁剪到窗口:所有写操作统一走这里,不再各自 slice */
export function appendOp(ops: string[], key: string): string[] {
  return [...ops.slice(-(OPS_WINDOW - 1)), key];
}
