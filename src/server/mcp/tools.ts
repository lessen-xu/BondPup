import { createHmac, randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { Cents, JarKind, MoneyState } from "@/contracts";
import { DomainError } from "@/contracts/errors";
import { LivingItems } from "@/server/domain/living";
import { commitJarDebit, makeUndoToken, undoJarDebit } from "@/server/domain/debit";
import { buildCycleReviewProposal, confirmCycleReview, isNewCycle } from "@/server/domain/cycle";
import { moveLeftover } from "@/server/domain/leftover";
import { completeReview, createDecisionStory, dueReviews } from "@/server/domain/story";
import { buildCandidate, principleEligible, resolvePrinciple } from "@/server/domain/principle";
import { detectSafetyRisk, safetyReplyFor } from "@/server/safety/risk";
import { validatePrincipleCandidate } from "@/server/safety/validate";
import { generatePrincipleCandidate } from "@/server/agent";
import { runMockAgentTask } from "@/server/agent/mock";
import type { AgentTaskInput } from "@/server/agent/types";
import { applyJarPlan } from "@/lib/plan/apply-jar-plan";
import { createInitialMoneyState } from "@/lib/mock/money-state";

/**
 * MCP 工具面(≤5 个,读写分明):工具直接包装确定性工具层(server/domain),无需模型密钥即可走通。
 * 完整闭环:create_money_session → plan_jars(confirm) → record_money_moment → confirm_action(扣罐/回看/原则)
 * → get_money_overview(到期回看、候选原则、已确认原则引用)。
 * 写操作(确认/扣罐/撤销/回看/原则)强制 expectedStateVersion + idempotencyKey;预览与只读不需要。
 */

/**
 * 同实例会话缓存(Vercel 实例间不共享内存)。
 * 主路径:每个响应回传完整 moneyState,客户端把上一步返回的 state 链回来;
 * 缓存 miss 时自动用初始态重建,不报错。
 */
const sessions = new Map<string, MoneyState>();

/** overview 的候选原则生成器:确定性 Mock。公开只读工具不触发真实模型(防额度被反复消耗) */
const mockPrincipleGenerator = async (
  input: Extract<AgentTaskInput, { task: "generate_principle" }>
) => {
  const out = runMockAgentTask(input);
  if (out.task !== "generate_principle") throw new Error("unexpected mock output");
  return out.result;
};

/**
 * moneyState 用 unknown 承接、运行时再 parse:
 * 完整 MoneyState 的 JSON Schema 重复内嵌 5 个工具会让 tools/list 膨胀数十 KB,
 * 校验严格度不变(resolveState 里 MoneyState.parse),只是不在 schema 里展开。
 */
const SessionRef = {
  sessionId: z.string().max(100).optional(),
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
  } else if (ref.sessionId !== undefined && !sessions.has(ref.sessionId)) {
    // 会话丢失不能伪装成新用户:sessionId 只是同实例缓存句柄,跨实例必须链回 moneyState
    throw new DomainError(
      "not_found",
      "会话不在此实例:请把上一步响应里的完整 moneyState 链回来(sessionId 只是同实例缓存)"
    );
  } else {
    state = sessions.get(sessionId) ?? createInitialMoneyState();
  }
  return { sessionId, state };
}

/**
 * proposal 完整性签名:内容由 record_money_moment 签发,confirm 时验签,防改写/伪造。
 * 生产环境必须配置 PROPOSAL_SECRET,未配置时 fail closed(公开的开发缺省值等于没有签名)。
 */
const PROPOSAL_SECRET =
  process.env.PROPOSAL_SECRET ??
  (process.env.NODE_ENV === "production" ? null : "bondpup-dev-proposal-secret");

function signProposal(p: {
  proposalId: string;
  jarKind: string;
  amount: number;
  intent: string;
  stateVersion: number;
}): string {
  if (!PROPOSAL_SECRET) {
    throw new DomainError("internal_error", "服务端未配置 PROPOSAL_SECRET,候选动作签发与确认已停用");
  }
  return createHmac("sha256", PROPOSAL_SECRET)
    .update(`${p.proposalId}|${p.jarKind}|${p.amount}|${p.intent}|${p.stateVersion}`)
    .digest("hex")
    .slice(0, 32);
}

function remember(sessionId: string, state: MoneyState): void {
  sessions.set(sessionId, state);
  if (sessions.size > 500) {
    const oldest = sessions.keys().next().value;
    if (oldest) sessions.delete(oldest);
  }
}

/** 写操作元数据(冻结约定):确认/扣罐/撤销/回看/原则必须带两个字段,缺失即 validation_error */
function requireWriteMeta(
  state: MoneyState,
  meta: { expectedStateVersion?: number; idempotencyKey?: string }
): { expectedStateVersion: number; idempotencyKey: string; idempotent: boolean } {
  if (meta.expectedStateVersion === undefined || !meta.idempotencyKey) {
    throw new DomainError(
      "validation_error",
      "写操作必须带 expectedStateVersion(当前 moneyState.stateVersion)与 idempotencyKey(客户端生成的唯一串)"
    );
  }
  if (state.appliedOps.includes(meta.idempotencyKey)) {
    return {
      expectedStateVersion: meta.expectedStateVersion,
      idempotencyKey: meta.idempotencyKey,
      idempotent: true,
    };
  }
  if (meta.expectedStateVersion !== state.stateVersion) {
    throw new DomainError(
      "state_conflict",
      `stateVersion 不匹配:期望 ${meta.expectedStateVersion},当前 ${state.stateVersion}`
    );
  }
  return {
    expectedStateVersion: meta.expectedStateVersion,
    idempotencyKey: meta.idempotencyKey,
    idempotent: false,
  };
}

function ok(payload: Record<string, unknown>) {
  // text 与 structuredContent 同源:老客户端读 text,新客户端(2026-07-28)按 outputSchema 读结构化
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
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

/**
 * 输出 schema(2026-07-28 structuredContent):浅层结构化,分支差异字段全部 optional;
 * moneyState 与输入侧同一决策——unknown 承接,不在 schema 里展开(防 tools/list 膨胀数十 KB)。
 * looseObject:多出的字段原样透传,不因 schema 滞后而被剥掉。
 */
const MoneyStateOut = z
  .unknown()
  .describe("完整 moneyState,原样链回下一次调用(跨实例主路径)");

const SessionOut = z.looseObject({
  sessionId: z.string(),
  greeting: z.string(),
  moneyState: MoneyStateOut,
});

const PlanJarsOut = z.looseObject({
  sessionId: z.string(),
  preview: z.boolean().optional(),
  confirmed: z.boolean().optional(),
  idempotent: z.boolean().optional(),
  plan: z.unknown().optional(),
  note: z.unknown().optional(),
  requiresConfirmation: z.boolean().optional(),
  howToConfirm: z.string().optional(),
  moneyState: MoneyStateOut,
});

const MomentOut = z.looseObject({
  sessionId: z.string(),
  reply: z.string(),
  mode: z.string().optional(),
  proposal: z.unknown().optional().describe("候选动作,原样传给 confirm_action(confirm_debit)"),
  requiresConfirmation: z.boolean().optional(),
  safety: z.unknown().optional(),
  safetyEvent: z.unknown().optional(),
  moneyState: MoneyStateOut,
});

const ConfirmOut = z.looseObject({
  sessionId: z.string(),
  idempotent: z.boolean().optional(),
  reply: z.string().optional(),
  undoToken: z.string().optional(),
  storyId: z.string().optional(),
  undone: z.boolean().optional(),
  story: z.unknown().optional(),
  appliedDebit: z.unknown().optional(),
  reviewedCount: z.number().optional(),
  principle: z.unknown().optional(),
  overPlanNote: z.string().optional(),
  moneyState: MoneyStateOut,
});

const OverviewOut = z.looseObject({
  sessionId: z.string(),
  cycle: z.unknown().optional(),
  jars: z.array(z.unknown()),
  leftover: z.number(),
  leftoverHistory: z.unknown().optional(),
  cycleReview: z.unknown().optional(),
  dueReviews: z.array(z.unknown()),
  reviewedCount: z.number(),
  principleCandidate: z.unknown().optional(),
  principles: z.array(z.string()),
  unit: z.string(),
  moneyState: MoneyStateOut,
});

export function registerBondPupTools(server: McpServer): void {
  server.registerTool(
    "create_money_session",
    {
      title: "创建慢慢会话",
      description:
        "创建一个新的陪伴会话。返回 sessionId 与初始 moneyState。后续工具可传 sessionId,或直接把上一步返回的 moneyState 链回来(跨实例的主路径)。",
      inputSchema: z.object({ displayName: z.string().optional() }),
      outputSchema: SessionOut,
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
        "按四罐恒等式计算本月安排:生活.planned + 安心.planned + 梦想月供 + 未来.planned = 可安排金额;余数进安心罐;未来罐默认 0 且永不自动接收。金额一律为分(非负整数)。默认只预览(不改状态);confirm=true 才写入,写入必须带 expectedStateVersion 与 idempotencyKey。",
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
      outputSchema: PlanJarsOut,
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
        const meta = requireWriteMeta(state, input);
        if (meta.idempotent) {
          return ok({ sessionId, idempotent: true, moneyState: state });
        }
        const { state: newState, plan, note } = applyJarPlan({
          baseState: state,
          disposable: input.disposable,
          livingPlanned: input.livingPlanned,
          livingItems: input.livingItems,
          dreamGoal: input.dreamGoal,
          futurePlanned: input.futurePlanned,
          idempotencyKey: meta.idempotencyKey,
          confirmed: true,
        });
        remember(sessionId, newState);
        return ok({
          sessionId,
          confirmed: true,
          plan,
          note,
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
        "接住一笔消费或情绪:给出候选动作 proposal(无明确依据时默认安心罐),不改任何余额。真正扣罐需把 proposal 原样传给 confirm_action。不带金额时按「只说说」处理。只读。",
      inputSchema: z.object({
        ...SessionRef,
        description: z.string().min(1).max(500),
        amount: Cents.optional(),
        jarHint: JarKind.optional(),
      }),
      outputSchema: MomentOut,
    },
    async (input) => {
      try {
        const { sessionId, state } = resolveState(input);
        // 安全红线输入闸:命中即不给罐子建议,返回安全回应并留审计(不含原文)
        // 安全命中也保持只读(工具自述只读,且此路径无幂等键):返回审计草稿,由写路径落账
        const hit = detectSafetyRisk(input.description);
        if (hit) {
          const reply = safetyReplyFor(hit.riskType);
          remember(sessionId, state);
          return ok({
            sessionId,
            safety: reply.safety,
            reply: reply.text,
            safetyEvent: { ...hit, responseTaken: "mcp_record_money_moment_safety_reply" },
            moneyState: state,
          });
        }
        remember(sessionId, state);
        const intent = [...input.description].slice(0, 120).join("");
        if (input.amount === undefined) {
          return ok({
            sessionId,
            mode: "note_only",
            reply: "听起来这件事在你心里放了一会儿了。可以只说说,不改余额;想记的话告诉我金额。",
            moneyState: state,
          });
        }
        const candidateJar: JarKind = input.jarHint ?? "comfort";
        const proposalBody = {
          proposalId: randomUUID(),
          jarKind: candidateJar,
          amount: input.amount,
          intent,
          stateVersion: state.stateVersion,
        };
        return ok({
          sessionId,
          proposal: { ...proposalBody, sig: signProposal(proposalBody) },
          requiresConfirmation: true,
          reply: `我先按${JAR_LABEL[candidateJar]}记这 ${fmtYuan(input.amount)},可以吗?也可以换个罐子,或者只说说、不改余额。`,
          moneyState: state,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  const PendingProposal = z.object({
    proposalId: z.string().min(1),
    jarKind: JarKind,
    amount: Cents,
    intent: z.string().min(1).max(120),
    stateVersion: z.number().int().min(1),
    sig: z.string().min(1).describe("record_money_moment 签发的完整性签名,原样带回"),
  });

  server.registerTool(
    "confirm_action",
    {
      title: "确认动作(扣罐/撤销/决定/回看/原则/周期/碎钻)",
      description:
        "所有改变状态的用户确认动作走这里,按 action 区分:confirm_debit=确认 record_money_moment 返回的 proposal 并扣罐(可用 chosenJar 换罐);undo=按 undoToken 撤销扣罐并抹掉关联故事;note_only=只说说,记一条不改余额的故事;log_decision=记录一个购买决定(现在买/放到明天/这次先不买,不动余额);complete_review=完成一次回看(实际买了且当时未扣罐时,带 chosenJar 补记账);adopt_principle=对候选原则做 像我/改说法/暂不确定;confirm_cycle=新周期确认(月供重算、结余进碎钻);move_leftover=把碎钻挪进某个罐(可部分)。全部动作必须带 expectedStateVersion 与 idempotencyKey。",
      inputSchema: z.object({
        ...SessionRef,
        action: z.enum([
          "confirm_debit",
          "undo",
          "note_only",
          "log_decision",
          "complete_review",
          "adopt_principle",
          "confirm_cycle",
          "move_leftover",
        ]),
        proposal: PendingProposal.optional(),
        chosenJar: JarKind.optional(),
        reviewInDays: z.union([z.literal(1), z.literal(3)]).optional(),
        undoToken: z.string().max(200).optional(),
        intent: z.string().min(1).max(120).optional(),
        decisionAction: z.enum(["buy_now", "defer", "skip_this_time"]).optional(),
        amount: Cents.optional(),
        storyId: z.string().max(150).optional(),
        happened: z.boolean().optional(),
        actualAmount: Cents.optional(),
        feelingNote: z.string().max(200).optional(),
        candidate: z
          .object({ statement: z.string().min(1).max(50), evidenceIds: z.array(z.string()).min(2).max(3) })
          .optional(),
        decision: z.enum(["like_me", "edit", "defer"]).optional(),
        editedText: z.string().max(50).optional(),
        disposable: Cents.optional(),
        livingPlanned: Cents.optional(),
        dreamMonthly: Cents.optional(),
        extendMonths: z.number().int().min(0).max(24).optional(),
        futurePlanned: Cents.optional(),
        toKind: JarKind.optional(),
        expectedStateVersion: z.number().int().min(1),
        idempotencyKey: z.string().min(1).max(100),
      }),
      outputSchema: ConfirmOut,
    },
    async (input) => {
      try {
        const { sessionId, state } = resolveState(input);
        const meta = requireWriteMeta(state, input);
        if (meta.idempotent) {
          // 幂等重放从首次写入的故事恢复结果——不信任重放请求里的参数(chosenJar 可能被换)
          if (input.action === "confirm_debit") {
            const storyId = `story-${meta.idempotencyKey}:story`;
            const story = state.stories.find((s) => s.id === storyId);
            if (story?.confirmedJar && story.amount !== undefined) {
              return ok({
                sessionId,
                idempotent: true,
                undoToken: makeUndoToken(story.confirmedJar, story.amount, meta.idempotencyKey),
                storyId,
                moneyState: state,
              });
            }
          }
          return ok({ sessionId, idempotent: true, moneyState: state });
        }

        switch (input.action) {
          case "confirm_debit": {
            if (!input.proposal) {
              throw new DomainError("validation_error", "confirm_debit 需要 record_money_moment 返回的 proposal");
            }
            const { sig, ...proposalBody } = input.proposal;
            if (signProposal(proposalBody) !== sig) {
              throw new DomainError("validation_error", "proposal 不是本服务签发或内容被改动过,请重新说一笔");
            }
            if (input.proposal.stateVersion !== state.stateVersion) {
              throw new DomainError("state_conflict", "候选动作已过期:状态在这之后变过,请重新说一笔");
            }
            const jarKind = input.chosenJar ?? input.proposal.jarKind;
            const debit = commitJarDebit(state, {
              jarKind,
              amount: input.proposal.amount,
              expectedStateVersion: meta.expectedStateVersion,
              idempotencyKey: meta.idempotencyKey,
            });
            const { state: withStory, story } = createDecisionStory(debit.state, {
              intent: input.proposal.intent,
              action: "buy_now",
              amount: input.proposal.amount,
              candidateJar: input.proposal.jarKind,
              confirmedJar: jarKind,
              reviewInDays: input.reviewInDays,
              expectedStateVersion: debit.state.stateVersion,
              idempotencyKey: `${meta.idempotencyKey}:story`,
            });
            remember(sessionId, withStory);
            return ok({
              sessionId,
              reply: `已从${JAR_LABEL[jarKind]}记下 ${fmtYuan(input.proposal.amount)}。想撤销随时说。`,
              undoToken: debit.undoToken,
              storyId: story.id,
              ...(debit.overPlan > 0
                ? { overPlanNote: `这个月${JAR_LABEL[jarKind]}记的比计划多了 ${fmtYuan(debit.overPlan)},数字我先记着,不急着调整。` }
                : {}),
              moneyState: withStory,
            });
          }
          case "undo": {
            if (!input.undoToken) {
              throw new DomainError("validation_error", "undo 需要 undoToken");
            }
            const undone = undoJarDebit(state, input.undoToken, {
              expectedStateVersion: meta.expectedStateVersion,
              idempotencyKey: meta.idempotencyKey,
            });
            // 「这笔当作没记过」= 金额与故事一起抹掉,不留一条会进回看的孤儿故事
            const cleaned = MoneyState.parse({
              ...undone.state,
              stories: undone.state.stories.filter((s) => s.id !== `story-${undone.undoneKey}:story`),
            });
            remember(sessionId, cleaned);
            return ok({ sessionId, undone: true, reply: "好,这笔当作没记过。", moneyState: cleaned });
          }
          case "log_decision": {
            if (!input.intent || !input.decisionAction) {
              throw new DomainError("validation_error", "log_decision 需要 intent 与 decisionAction");
            }
            const { state: withStory, story } = createDecisionStory(state, {
              intent: input.intent,
              action: input.decisionAction,
              amount: input.amount,
              reviewInDays: input.reviewInDays,
              expectedStateVersion: meta.expectedStateVersion,
              idempotencyKey: meta.idempotencyKey,
            });
            remember(sessionId, withStory);
            const replies = {
              buy_now: "记下了。到时候看看它实际怎么样,就只是看看。",
              defer: "好,放到明天。到时候想聊就聊,不想聊也没关系。",
              skip_this_time: "记下了。先不买和买一样,都只是一个决定,回头看看就好。",
            } as const;
            return ok({
              sessionId,
              reply: replies[input.decisionAction],
              storyId: story.id,
              moneyState: withStory,
            });
          }
          case "note_only": {
            if (!input.intent) {
              throw new DomainError("validation_error", "note_only 需要 intent(想说的那件事,120 字内)");
            }
            const { state: withStory, story } = createDecisionStory(state, {
              intent: input.intent,
              action: "note_only",
              expectedStateVersion: meta.expectedStateVersion,
              idempotencyKey: meta.idempotencyKey,
            });
            remember(sessionId, withStory);
            return ok({
              sessionId,
              reply: "好,先说说就好,余额没动。",
              storyId: story.id,
              moneyState: withStory,
            });
          }
          case "complete_review": {
            if (!input.storyId || input.happened === undefined) {
              throw new DomainError("validation_error", "complete_review 需要 storyId 与 happened");
            }
            const { state: reviewed, story, appliedDebit } = completeReview(state, {
              storyId: input.storyId,
              happened: input.happened,
              actualAmount: input.actualAmount,
              feelingNote: input.feelingNote,
              debitJar: input.chosenJar,
              expectedStateVersion: meta.expectedStateVersion,
              idempotencyKey: meta.idempotencyKey,
            });
            remember(sessionId, reviewed);
            return ok({
              sessionId,
              reply: appliedDebit
                ? `记下了,这 ${fmtYuan(appliedDebit.amount)} 从${JAR_LABEL[appliedDebit.jarKind]}记了账。回看只是看看实际发生了什么。`
                : "记下了。回看只是看看实际发生了什么,三种决定没有高下。",
              story,
              ...(appliedDebit ? { appliedDebit } : {}),
              reviewedCount: reviewed.stories.filter((s) => s.status === "reviewed").length,
              moneyState: reviewed,
            });
          }
          case "adopt_principle": {
            if (!input.candidate || !input.decision) {
              throw new DomainError("validation_error", "adopt_principle 需要 candidate 与 decision");
            }
            const failures = validatePrincipleCandidate(input.candidate, state.stories);
            if (failures.length > 0) {
              throw new DomainError("validation_error", `候选原则不合规:${failures.map((f) => f.message).join(";")}`);
            }
            const built = buildCandidate(state, {
              statement: input.candidate.statement,
              evidenceIds: input.candidate.evidenceIds,
              expectedStateVersion: meta.expectedStateVersion,
              idempotencyKey: meta.idempotencyKey,
            });
            const resolved = resolvePrinciple(built.state, {
              id: built.principle.id,
              decision: input.decision,
              editedText: input.editedText,
              expectedStateVersion: built.state.stateVersion,
              idempotencyKey: `${meta.idempotencyKey}:resolve`,
            });
            remember(sessionId, resolved.state);
            return ok({
              sessionId,
              principle: resolved.principle,
              reply:
                input.decision === "defer"
                  ? "好,先放着,不确认就不会被用到。"
                  : "记住了。这句话以后只在合适的时候被引用,随时可以改或删。",
              moneyState: resolved.state,
            });
          }
          case "confirm_cycle": {
            if (input.disposable === undefined || input.livingPlanned === undefined) {
              throw new DomainError("validation_error", "confirm_cycle 需要 disposable 与 livingPlanned");
            }
            const { state: next } = confirmCycleReview(state, {
              disposable: input.disposable,
              livingPlanned: input.livingPlanned,
              dreamMonthly: input.dreamMonthly,
              extendMonths: input.extendMonths,
              futurePlanned: input.futurePlanned,
              expectedStateVersion: meta.expectedStateVersion,
              idempotencyKey: meta.idempotencyKey,
            });
            remember(sessionId, next);
            return ok({
              sessionId,
              reply: "新的一个月安排好了。上期没花完的都在那堆碎钻里,想挪再挪。",
              moneyState: next,
            });
          }
          case "move_leftover": {
            if (!input.toKind || input.amount === undefined) {
              throw new DomainError("validation_error", "move_leftover 需要 toKind 与 amount");
            }
            const moved = moveLeftover(state, {
              toKind: input.toKind,
              amount: input.amount,
              expectedStateVersion: meta.expectedStateVersion,
              idempotencyKey: meta.idempotencyKey,
            });
            remember(sessionId, moved.state);
            return ok({ sessionId, reply: moved.movedNote, moneyState: moved.state });
          }
        }
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_money_overview",
    {
      title: "查看状态与记忆",
      description:
        "读取当前会话的周期、罐子计划/实际、结余、到期待回看的故事、已确认原则;≥3 条已回看时附一条候选原则(未存储,确认走 confirm_action adopt_principle)。只读,不改状态。金额单位为分。",
      inputSchema: z.object({ ...SessionRef }),
      outputSchema: OverviewOut,
    },
    async (input) => {
      try {
        const { sessionId, state } = resolveState(input);
        remember(sessionId, state);
        const due = dueReviews(state);
        // 公开只读工具:候选原则固定用确定性 Mock 生成,不消耗真实模型额度(真模型走 /api/agent)
        const candidate = principleEligible(state)
          ? await generatePrincipleCandidate(state, mockPrincipleGenerator)
          : null;
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
          ...(state.leftover.amount > 0 ? { leftoverHistory: state.leftover.history } : {}),
          ...(state.cycle && isNewCycle(state)
            ? {
                cycleReview: {
                  ...buildCycleReviewProposal(state),
                  howToConfirm: "用 confirm_action(action=confirm_cycle) 确认新周期安排",
                },
              }
            : {}),
          dueReviews: due.map((s) => ({ storyId: s.id, intent: s.intent, reviewAt: s.reviewAt })),
          reviewedCount: state.stories.filter((s) => s.status === "reviewed").length,
          ...(candidate
            ? {
                principleCandidate: {
                  ...candidate,
                  howToAdopt: "用 confirm_action(action=adopt_principle, candidate, decision) 确认或修改",
                },
              }
            : {}),
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
