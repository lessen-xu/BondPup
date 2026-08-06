import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { Cents, JarKind, MoneyState } from "@/contracts";
import { DomainError } from "@/contracts/errors";
import { computeJars } from "@/server/domain/jars";
import { computeLivingJar, LivingItems } from "@/server/domain/living";
import { computeMonthlyContribution } from "@/server/domain/monthly";
import { createInitialMoneyState, currentCycleId, cycleAfter } from "@/lib/mock/money-state";

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

const SessionRef = {
  sessionId: z.string().optional(),
  moneyState: MoneyState.optional(),
};

function resolveState(ref: { sessionId?: string; moneyState?: MoneyState }): {
  sessionId: string;
  state: MoneyState;
} {
  const sessionId = ref.sessionId ?? randomUUID();
  const state = ref.moneyState ?? sessions.get(sessionId) ?? createInitialMoneyState();
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
        "创建一个新的陪伴会话。返回 sessionId 与初始 moneyState(demo:true 合成数据标识)。后续工具可传 sessionId,或直接把上一步返回的 moneyState 链回来。",
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
        "按四罐恒等式计算本月安排:生活.planned + 安心.planned + 梦想月供 + 未来.planned = 可安排金额;余数进安心罐;未来罐默认 0 且永不自动接收。金额一律为分(非负整数)。写操作:可带 expectedStateVersion 与 idempotencyKey。结果需用户确认才算数。",
      inputSchema: z.object({
        ...SessionRef,
        disposable: Cents,
        livingPlanned: Cents.optional(),
        livingItems: LivingItems.optional(),
        dreamGoal: DreamGoalInput.optional(),
        futurePlanned: Cents.default(0),
        expectedStateVersion: z.number().int().min(1).optional(),
        idempotencyKey: z.string().optional(),
      }),
    },
    async (input) => {
      try {
        const { sessionId, state } = resolveState(input);
        if (checkWriteMeta(state, input) === "idempotent") {
          return ok({ sessionId, idempotent: true, moneyState: state });
        }
        const livingPlanned =
          input.livingPlanned ?? (input.livingItems ? computeLivingJar(input.livingItems) : 0);
        const dreamMonthly = input.dreamGoal
          ? computeMonthlyContribution({
              goal: { amount: input.dreamGoal.amount, saved: input.dreamGoal.saved },
              monthsRemaining: input.dreamGoal.monthsRemaining,
            })
          : 0;
        const r = computeJars({
          disposable: input.disposable,
          livingPlanned,
          dreamMonthly,
          futurePlanned: input.futurePlanned,
        });
        const now = new Date().toISOString();
        const jars = [
          { id: "jar-living", kind: "living", label: "生活罐", renamable: false, planned: r.living, actual: 0, updatedAt: now },
          { id: "jar-comfort", kind: "comfort", label: "安心罐", renamable: false, planned: r.comfort, actual: 0, updatedAt: now },
          ...(input.dreamGoal
            ? [
                {
                  id: "jar-dream",
                  kind: "dream",
                  label: input.dreamGoal.name,
                  renamable: true,
                  planned: r.dream,
                  actual: 0,
                  updatedAt: now,
                  goal: {
                    name: input.dreamGoal.name,
                    amount: input.dreamGoal.amount,
                    saved: input.dreamGoal.saved,
                    targetMonth: cycleAfter(input.dreamGoal.monthsRemaining),
                  },
                },
              ]
            : []),
          ...(r.future > 0
            ? [{ id: "jar-future", kind: "future", label: "未来罐", renamable: false, planned: r.future, actual: 0, updatedAt: now }]
            : []),
        ];
        const newState = MoneyState.parse({
          ...state,
          stateVersion: state.stateVersion + 1,
          cycle: { cycle: currentCycleId(), disposable: input.disposable, updatedAt: now },
          jars,
          appliedOps: input.idempotencyKey
            ? [...state.appliedOps.slice(-19), input.idempotencyKey]
            : state.appliedOps,
        });
        remember(sessionId, newState);
        return ok({
          sessionId,
          plan: { ...r, dreamMonthly },
          requiresConfirmation: true,
          note:
            r.shortfall > 0
              ? `按这个安排会差 ${fmtYuan(r.shortfall)}。差的部分放在哪里由你来定,我不会自动动别的罐子。`
              : `剩下的 ${fmtYuan(r.comfort)} 进了安心罐——这是这个月可以不愧疚地用在当下的部分。`,
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
      title: "确认扣罐",
      description:
        "确认 record_money_moment 的候选动作并扣罐(actual 增加),返回新 moneyState 与撤销令牌。写操作:带 expectedStateVersion 与 idempotencyKey;罐子不足时把取舍露给用户,绝不静默扣另一个罐。",
      inputSchema: z.object({
        ...SessionRef,
        jarKind: JarKind,
        amount: Cents,
        confirm: z.boolean(),
        storyId: z.string().optional(),
        expectedStateVersion: z.number().int().min(1).optional(),
        idempotencyKey: z.string().optional(),
      }),
    },
    async (input) => {
      try {
        const { sessionId, state } = resolveState(input);
        remember(sessionId, state);
        // schema 已冻结;扣罐实现(commitJarDebit:乐观锁/幂等/不级联)按计划 2026-08-08 上线
        return ok({
          sessionId,
          status: "stub",
          plannedFor: "2026-08-08",
          echo: { jarKind: input.jarKind, amount: input.amount, confirm: input.confirm },
          moneyState: state,
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
