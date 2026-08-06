import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { Cents, JarKind, MoneyState } from "@/contracts";
import { DomainError } from "@/contracts/errors";
import { LivingItems } from "@/server/domain/living";
import { commitJarDebit, undoJarDebit } from "@/server/domain/debit";
import { detectSafetyRisk, recordSafetyEvent, safetyReplyFor } from "@/server/safety/risk";
import { applyJarPlan } from "@/lib/plan/apply-jar-plan";
import { createInitialMoneyState } from "@/lib/mock/money-state";

/**
 * MCP 工具面(2026-08-06 冻结,≤5 个,读写分明):
 * 工具直接包装确定性工具层(server/domain),不复制 Agent 逻辑,无需模型密钥即可走通。
 * 评测路径:create_money_session → plan_jars → record_money_moment → confirm_jar_action → get_money_overview。
 */

/**
 * 同实例会话缓存(Vercel 实例间不共享内存)。
 * 主路径:每个响应回传完整 moneyState,客户端把上一步返回的 state 链回来;
 * 缓存 miss 时自动用初始态重建,不报错。
 */
const sessions = new Map<string, MoneyState>();

/**
 * moneyState 用 unknown 承接、运行时再 parse:
 * 完整 MoneyState 的 JSON Schema 重复内嵌 5 个工具会让 tools/list 膨胀数十 KB,
 * 校验严格度不变(resolveState 里 MoneyState.parse),只是不在 schema 里展开。
 */
const SessionRef = {
  sessionId: z.string().optional(),
  moneyState: z
    .unknown()
    .optional()
    .describe("上一步响应返回的完整 moneyState,原样链回(跨实例的主路径)"),
};

function resolveState(ref: { sessionId?: string; moneyState?: unknown }): {
  sessionId: string;
  state: MoneyState;
} {
  const sessionId = ref.sessionId ?? randomUUID();
  let state: MoneyState;
  if (ref.moneyState !== undefined) {
    const parsed = MoneyState.safeParse(ref.moneyState);
    if (!parsed.success) {
      throw new DomainError("validation_error", "moneyState 不合法:请原样链回上一步响应里的 moneyState");
    }
    state = parsed.data;
  } else {
    state = sessions.get(sessionId) ?? createInitialMoneyState();
  }
  return { sessionId, state };
}

function remember(sessionId: string, state: MoneyState): void {
  sessions.set(sessionId, state);
  if (sessions.size > 500) {
    const oldest = sessions.keys().next().value;
    if (oldest) sessions.delete(oldest);
  }
}

/** 幂等与乐观锁:两个字段对评测方可选;带了就严格执行 */
function checkWriteMeta(
  state: MoneyState,
  meta: { expectedStateVersion?: number; idempotencyKey?: string }
): "apply" | "idempotent" {
  if (meta.idempotencyKey && state.appliedOps.includes(meta.idempotencyKey)) return "idempotent";
  if (meta.expectedStateVersion !== undefined && meta.expectedStateVersion !== state.stateVersion) {
    throw new DomainError(
      "state_conflict",
      `stateVersion 不匹配:期望 ${meta.expectedStateVersion},当前 ${state.stateVersion}`
    );
  }
  return "apply";
}

function ok(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload) }] };
}

function fail(e: unknown) {
  const api =
    e instanceof DomainError
      ? e.toApiError()
      : { code: "internal_error" as const, message: e instanceof Error ? e.message : String(e) };
  return { content: [{ type: "text" as const, text: JSON.stringify(api) }], isError: true };
}

const JAR_LABEL: Record<JarKind, string> = {
  living: "生活罐",
  comfort: "安心罐",
  dream: "梦想罐",
  future: "未来罐",
};

function fmtYuan(cents: number): string {
  return cents % 100 === 0 ? `${cents / 100} 元` : `${(cents / 100).toFixed(2)} 元`;
}

const DreamGoalInput = z.object({
  name: z.string().min(1),
  amount: Cents,
  saved: Cents.default(0),
  monthsRemaining: z.number().int().min(0),
});

export function registerBondPupTools(server: McpServer): void {
  server.registerTool(
    "create_money_session",
    {
      title: "创建慢慢会话",
      description:
        "创建一个新的陪伴会话。返回 sessionId 与初始 moneyState。后续工具可传 sessionId,或直接把上一步返回的 moneyState 链回来(跨实例的主路径)。",
      inputSchema: z.object({ displayName: z.string().optional() }),
    },
    async ({ displayName }) => {
      try {
        const sessionId = randomUUID();
        const state = createInitialMoneyState(displayName);
        remember(sessionId, state);
        return ok({
          sessionId,
          greeting: "我是慢慢,一只可以聊钱的小狗。想先说说这个月想怎么过吗?",
          moneyState: state,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "plan_jars",
    {
      title: "四罐分配(恒等式)",
      description:
        "按四罐恒等式计算本月安排:生活.planned + 安心.planned + 梦想月供 + 未来.planned = 可安排金额;余数进安心罐;未来罐默认 0 且永不自动接收。金额一律为分(非负整数)。默认只预览(不改状态);confirm=true 才写入(乐观锁 + 幂等,幂等键未提供时服务端生成并随响应返回)。",
      inputSchema: z.object({
        ...SessionRef,
        disposable: Cents,
        livingPlanned: Cents.optional(),
        livingItems: LivingItems.optional(),
        dreamGoal: DreamGoalInput.optional(),
        futurePlanned: Cents.default(0),
        confirm: z
          .boolean()
          .default(false)
          .describe("false=只预览不写状态;true=用户已确认,写入并盖 confirmedAt"),
        expectedStateVersion: z.number().int().min(1).optional(),
        idempotencyKey: z.string().optional(),
      }),
    },
    async (input) => {
      try {
        const { sessionId, state } = resolveState(input);
        if (!input.confirm) {
          // 预览:金额=代码算,结果=用户确认——确认前状态一个字节都不动
          remember(sessionId, state);
          const { plan, note } = applyJarPlan({
            baseState: state,
            disposable: input.disposable,
            livingPlanned: input.livingPlanned,
            livingItems: input.livingItems,
            dreamGoal: input.dreamGoal,
            futurePlanned: input.futurePlanned,
          });
          return ok({
            sessionId,
            preview: true,
            plan,
            note,
            requiresConfirmation: true,
            howToConfirm: "确认无误后用相同参数加 confirm:true 再调一次",
            moneyState: state,
          });
        }
        if (checkWriteMeta(state, input) === "idempotent") {
          return ok({ sessionId, idempotent: true, moneyState: state });
        }
        const idempotencyKey = input.idempotencyKey ?? randomUUID();
        const { state: newState, plan, note } = applyJarPlan({
          baseState: state,
          disposable: input.disposable,
          livingPlanned: input.livingPlanned,
          livingItems: input.livingItems,
          dreamGoal: input.dreamGoal,
          futurePlanned: input.futurePlanned,
          idempotencyKey,
          confirmed: true,
        });
        remember(sessionId, newState);
        return ok({
          sessionId,
          confirmed: true,
          plan,
          note,
          idempotencyKey,
          moneyState: newState,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "record_money_moment",
    {
      title: "说一笔钱",
      description:
        "接住一笔消费或情绪:给出候选罐建议(无明确依据时默认安心罐),不改任何余额。真正扣罐需调用 confirm_jar_action。不带金额时按「只说说」处理。只读。",
      inputSchema: z.object({
        ...SessionRef,
        description: z.string().min(1),
        amount: Cents.optional(),
        jarHint: JarKind.optional(),
      }),
    },
    async (input) => {
      try {
        const { sessionId, state } = resolveState(input);
        // 安全红线输入闸:命中即不给罐子建议,返回安全回应并留审计(不含原文)
        const hit = detectSafetyRisk(input.description);
        if (hit) {
          const reply = safetyReplyFor(hit.riskType);
          const audited = recordSafetyEvent(state, hit, "mcp_record_money_moment_safety_reply");
          remember(sessionId, audited);
          return ok({
            sessionId,
            safety: reply.safety,
            reply: reply.text,
            moneyState: audited,
          });
        }
        remember(sessionId, state);
        if (input.amount === undefined) {
          return ok({
            sessionId,
            mode: "note_only",
            reply: "听起来这件事在你心里放了一会儿了。可以只说说,不改余额;想记的话告诉我金额。",
            moneyState: state,
          });
        }
        const candidateJar: JarKind = input.jarHint ?? "comfort";
        return ok({
          sessionId,
          pendingAction: { jarKind: candidateJar, amount: input.amount },
          requiresConfirmation: true,
          reply: `我先按${JAR_LABEL[candidateJar]}记这 ${fmtYuan(input.amount)},可以吗?也可以换个罐子,或者只说说、不改余额。`,
          moneyState: state,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "confirm_jar_action",
    {
      title: "确认扣罐 / 撤销",
      description:
        "确认 record_money_moment 的候选动作并扣罐(actual 增加),返回新 moneyState 与撤销令牌;传 undoToken 则撤销对应扣罐。confirm=false 表示只说说、不改余额。写操作:乐观锁 + 幂等;允许 actual 超过计划(不评判);绝不静默扣另一个罐。",
      inputSchema: z.object({
        ...SessionRef,
        jarKind: JarKind.optional(),
        amount: Cents.optional(),
        confirm: z.boolean().default(true),
        undoToken: z.string().optional(),
        storyId: z.string().optional(),
        expectedStateVersion: z.number().int().min(1).optional(),
        idempotencyKey: z.string().optional(),
      }),
    },
    async (input) => {
      try {
        const { sessionId, state } = resolveState(input);
        if (input.undoToken) {
          const undone = undoJarDebit(state, input.undoToken);
          remember(sessionId, undone);
          return ok({
            sessionId,
            undone: true,
            reply: "好,这笔当作没记过。",
            moneyState: undone,
          });
        }
        if (!input.confirm) {
          remember(sessionId, state);
          return ok({
            sessionId,
            mode: "note_only",
            reply: "好,只说说,不改余额。",
            moneyState: state,
          });
        }
        if (input.jarKind === undefined || input.amount === undefined) {
          throw new DomainError("validation_error", "确认扣罐需要 jarKind 与 amount");
        }
        const idempotencyKey = input.idempotencyKey ?? randomUUID();
        const result = commitJarDebit(state, {
          jarKind: input.jarKind,
          amount: input.amount,
          storyId: input.storyId,
          expectedStateVersion: input.expectedStateVersion ?? state.stateVersion,
          idempotencyKey,
        });
        remember(sessionId, result.state);
        return ok({
          sessionId,
          reply: `已从${JAR_LABEL[input.jarKind]}记下 ${fmtYuan(input.amount)}。想撤销随时说。`,
          idempotencyKey,
          undoToken: result.undoToken,
          ...(result.overPlan > 0
            ? { overPlanNote: `这个月${JAR_LABEL[input.jarKind]}记的比计划多了 ${fmtYuan(result.overPlan)},数字我先记着,不急着调整。` }
            : {}),
          ...(result.idempotent ? { idempotent: true } : {}),
          moneyState: result.state,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_money_overview",
    {
      title: "查看四罐状态",
      description:
        "读取当前会话的周期、罐子计划/实际、结余碎钻与已确认原则。只读,不改状态。金额单位为分,展示层除以 100。",
      inputSchema: z.object({ ...SessionRef }),
    },
    async (input) => {
      try {
        const { sessionId, state } = resolveState(input);
        remember(sessionId, state);
        return ok({
          sessionId,
          cycle: state.cycle,
          jars: state.jars.map((j) => ({
            kind: j.kind,
            label: j.label,
            planned: j.planned,
            actual: j.actual,
            updatedAt: j.updatedAt,
            ...(j.goal ? { goal: j.goal } : {}),
          })),
          leftover: state.leftover.amount,
          principles: state.principles
            .filter((p) => p.status === "confirmed" || p.status === "edited")
            .map((p) => p.statement),
          unit: "分(cents);展示层 ÷100 为元",
          moneyState: state,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );
}
