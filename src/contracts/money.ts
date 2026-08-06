import { z } from "zod";

/** 金额一律为「分」的非负整数;展示层 ÷100。全仓唯一金额定义,禁止在别处再定义。 */
export const Cents = z.number().int().min(0);
export type Cents = z.infer<typeof Cents>;

/** 四种罐子各至多一个:生活 / 安心 / 梦想(用户命名) / 未来 */
export const JarKind = z.enum(["living", "comfort", "dream", "future"]);
export type JarKind = z.infer<typeof JarKind>;

/** 周期标识,如 "2026-08" */
export const CycleId = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export type CycleId = z.infer<typeof CycleId>;

export const JarGoal = z.object({
  name: z.string().min(1),
  amount: Cents,
  saved: Cents,
  targetMonth: CycleId,
});
export type JarGoal = z.infer<typeof JarGoal>;

export const Jar = z
  .object({
    id: z.string().min(1),
    kind: JarKind,
    label: z.string().min(1),
    renamable: z.boolean(),
    planned: Cents,
    actual: Cents,
    updatedAt: z.iso.datetime(),
    goal: JarGoal.optional(),
  })
  .superRefine((jar, ctx) => {
    if (jar.goal && jar.kind !== "dream") {
      ctx.addIssue({ code: "custom", message: "goal 仅允许出现在梦想罐(kind=dream)上" });
    }
  });
export type Jar = z.infer<typeof Jar>;

export const BudgetCycle = z.object({
  cycle: CycleId,
  /** 本月可安排金额(恒等式右侧) */
  disposable: Cents,
  confirmedAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime(),
});
export type BudgetCycle = z.infer<typeof BudgetCycle>;

/** 上期结余「碎钻」:不挂任何罐子,不自动转入,不计数,不庆祝,为 0 不显示 */
export const Leftover = z.object({
  amount: Cents,
  history: z.array(
    z.object({
      cycle: CycleId,
      amount: Cents,
      fromJar: JarKind,
    })
  ),
});
export type Leftover = z.infer<typeof Leftover>;
