"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMoneyState } from "@/lib/state/money-store";
import { buildCycleReviewProposal, confirmCycleReview, type CycleReviewProposal } from "@/server/domain/cycle";
import { computeMonthlyContribution } from "@/server/domain/monthly";
import { LoadingState } from "./LoadingState";
import { MoneyAmountInput } from "./MoneyAmountInput";
import { CYCLE_REVIEW, ERRORS } from "@/mock/剧本";

/** 周期回顾:不重走起点,带上期数字问「还想这么分吗」。
 *  金额全部来自 domain 纯函数(buildCycleReviewProposal / computeMonthlyContribution / confirmCycleReview),
 *  组件只做展示与确认;确认前不写任何状态。 */

type Step = "reached" | "deadline" | "direction" | "edit" | "done";
/** 月供策略:keep=接受新月供;extend=把时间往后挪一个月(月供按 +1 月重算);useNow=期限到了就用现在这些(月供 0) */
type MonthlyChoice = "keep" | "extend" | "useNow" | null;

const fmt = (cents: number) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(cents / 100);

export function CycleReviewFlow() {
  const router = useRouter();
  const { state, ready, commit } = useMoneyState();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    update();
  }, []);

  const proposal = useMemo<CycleReviewProposal | null>(() => {
    if (!state || !now) return null;
    try {
      return buildCycleReviewProposal(state, now);
    } catch {
      return null; // 没有周期或还在当前周期
    }
  }, [state, now]);

  const [chosenStep, setChosenStep] = useState<Step | null>(null);
  const [monthlyChoice, setMonthlyChoice] = useState<MonthlyChoice>(null);
  const [editDisposable, setEditDisposable] = useState(0);
  const [editLiving, setEditLiving] = useState(0);
  const [editMonthly, setEditMonthly] = useState(0);
  const [editFuture, setEditFuture] = useState(0);
  const [failed, setFailed] = useState(false);
  const [doneLeftover, setDoneLeftover] = useState(0);

  // 初始分支是派生值(目标达成 → 期限已到 → 常规问句),用户动作后才落到显式 step
  const step: Step | null = chosenStep ?? (proposal ? (proposal.goalReached ? "reached" : proposal.deadlinePassed ? "deadline" : "direction") : null);
  const setStep = setChosenStep;

  /** 进编辑屏时才用提案值初始化输入框 */
  function enterEdit() {
    if (!proposal) return;
    setEditDisposable(proposal.disposablePrevious);
    setEditLiving(proposal.livingPlanned);
    setEditMonthly(monthlyChoice === "extend" ? (extendedMonthly ?? proposal.dreamMonthly ?? 0) : proposal.dreamMonthly ?? 0);
    setEditFuture(proposal.futurePlanned);
    setChosenStep("edit");
  }

  // 状态存在但当前不需要回顾 → 回首页;完全没状态 → 起点
  useEffect(() => {
    if (!ready || !now) return;
    if (!state) { router.replace("/start"); return; }
    if (!proposal && step !== "done") router.replace("/");
  }, [ready, now, state, proposal, step, router]);

  if (!ready || !now || (!proposal && step !== "done")) return <LoadingState />;

  const goalName = state?.jars.find((j) => j.kind === "dream")?.goal?.name ?? state?.jars.find((j) => j.kind === "dream")?.label ?? "梦想罐";

  /** 往后挪一个月后的月供(纯函数重算,不改状态) */
  const extendedMonthly = proposal?.dreamSavedAfterFold !== null && proposal !== null && state?.jars.find((j) => j.kind === "dream")?.goal
    ? computeMonthlyContribution({
        goal: { amount: state.jars.find((j) => j.kind === "dream")!.goal!.amount, saved: proposal.dreamSavedAfterFold },
        monthsRemaining: (proposal.monthsRemaining ?? 0) + 1,
      })
    : null;

  /** monthlyChoice → confirm 参数(月供与挪期);null 走提案原值 */
  function monthlyParams(): { dreamMonthly?: number; extendMonths?: number } {
    if (!proposal) return {};
    if (proposal.dreamMonthly === null) return {};
    if (monthlyChoice === "extend") return { dreamMonthly: extendedMonthly ?? proposal.dreamMonthly, extendMonths: 1 };
    if (monthlyChoice === "useNow") return { dreamMonthly: 0 };
    return { dreamMonthly: proposal.dreamMonthly };
  }

  function confirm(override?: { disposable: number; living: number; dreamMonthly: number; future: number }) {
    if (!state || !proposal) return;
    setFailed(false);
    try {
      const params = override
        ? { disposable: override.disposable, livingPlanned: override.living, dreamMonthly: proposal.dreamMonthly === null ? undefined : override.dreamMonthly, futurePlanned: override.future, ...(monthlyChoice === "extend" ? { extendMonths: 1 } : {}) }
        : { disposable: proposal.disposablePrevious, livingPlanned: proposal.livingPlanned, futurePlanned: proposal.futurePlanned, ...monthlyParams() };
      const result = confirmCycleReview(state, {
        ...params,
        expectedStateVersion: state.stateVersion,
        idempotencyKey: globalThis.crypto.randomUUID(),
        now: new Date(),
      });
      setDoneLeftover(proposal.leftover.total);
      commit(result.state);
      setStep("done");
    } catch {
      setFailed(true);
    }
  }

  const editComfort = editDisposable - editLiving - (proposal?.dreamMonthly === null ? 0 : editMonthly) - editFuture;
  const previousRows = proposal
    ? [
        { label: "生活罐", amount: proposal.livingPlanned },
        { label: "安心罐", amount: proposal.comfortPrevious },
        ...(proposal.previousDreamMonthly !== null ? [{ label: `「${goalName}」月供`, amount: proposal.previousDreamMonthly }] : []),
        { label: "未来罐", amount: proposal.futurePlanned },
      ]
    : [];

  return (
    <main className="stage-shell flow-layout-shell">
      <section className="simple-page cycle-review-page" aria-label="月度回顾">
        <button className="simple-back" type="button" onClick={() => router.push("/")}>{CYCLE_REVIEW.done.home}</button>

        {step === "reached" && proposal && (
          <section className="cycle-step" aria-live="polite">
            <p className="cycle-line">{CYCLE_REVIEW.goalReached.line.replace("{goal}", goalName)}</p>
            <p className="cycle-sub">{CYCLE_REVIEW.goalReached.note}</p>
            <div className="decision-options"><button type="button" onClick={() => setStep("direction")}>{CYCLE_REVIEW.goalReached.keep}</button></div>
          </section>
        )}

        {step === "deadline" && proposal && (
          <section className="cycle-step" aria-live="polite">
            <p className="cycle-line">{CYCLE_REVIEW.deadlinePassed.line.replace("{goal}", goalName).replace("{amount}", fmt((state!.jars.find((j) => j.kind === "dream")!.goal!.amount) - (proposal.dreamSavedAfterFold ?? 0)))}</p>
            <div className="decision-options">
              <button type="button" onClick={() => { setMonthlyChoice("extend"); setStep("direction"); }}>{CYCLE_REVIEW.deadlinePassed.extend}</button>
              <button type="button" onClick={() => { setMonthlyChoice("useNow"); setStep("direction"); }}>{CYCLE_REVIEW.deadlinePassed.useNow}</button>
            </div>
          </section>
        )}

        {step === "direction" && proposal && (
          <section className="cycle-step" aria-live="polite">
            <p className="cycle-line">{CYCLE_REVIEW.entry.label}{CYCLE_REVIEW.entry.sub}</p>
            <p className="cycle-sub">{CYCLE_REVIEW.direction.previous}</p>
            <ul className="cycle-previous">
              {previousRows.map((row) => <li key={row.label}><span>{row.label}</span><strong>{fmt(row.amount)} 元</strong></li>)}
            </ul>
            {proposal.monthlyDirection === "up" && monthlyChoice === null && (
              <>
                <p className="cycle-sub">{CYCLE_REVIEW.direction.monthlyUp.replace("{goal}", goalName).replace("{amount}", fmt(proposal.dreamMonthly ?? 0))}</p>
                <div className="decision-options">
                  <button type="button" onClick={() => setMonthlyChoice("keep")}>{CYCLE_REVIEW.direction.keepMonthly}</button>
                  <button type="button" onClick={() => setMonthlyChoice("extend")}>{CYCLE_REVIEW.direction.extendMonth}</button>
                </div>
              </>
            )}
            <div className="decision-options">
              <button type="button" disabled={proposal.monthlyDirection === "up" && monthlyChoice === null} onClick={() => confirm()}>{CYCLE_REVIEW.direction.same}</button>
              <button type="button" onClick={enterEdit}>{CYCLE_REVIEW.direction.change}</button>
            </div>
            {failed && <p className="cycle-sub">{ERRORS.validation.line} {ERRORS.validation.sub}</p>}
          </section>
        )}

        {step === "edit" && proposal && (
          <section className="cycle-step" aria-live="polite">
            <label className="cycle-edit-row"><span>{CYCLE_REVIEW.edit.disposable}</span><MoneyAmountInput value={editDisposable} onChange={setEditDisposable} placeholder="0" /></label>
            <label className="cycle-edit-row"><span>生活罐</span><MoneyAmountInput value={editLiving} onChange={setEditLiving} placeholder="0" /></label>
            {proposal.dreamMonthly !== null && <label className="cycle-edit-row"><span>{CYCLE_REVIEW.edit.dreamMonthly.replace("{goal}", goalName)}</span><MoneyAmountInput value={editMonthly} onChange={setEditMonthly} placeholder="0" /></label>}
            <label className="cycle-edit-row"><span>未来罐</span><MoneyAmountInput value={editFuture} onChange={setEditFuture} placeholder="0" /></label>
            <p className="cycle-sub">{editComfort >= 0 ? CYCLE_REVIEW.edit.comfortNote.replace("{amount}", fmt(editComfort)) : `${ERRORS.validation.line} ${ERRORS.validation.sub}`}</p>
            <div className="decision-options">
              <button type="button" disabled={editComfort < 0} onClick={() => confirm({ disposable: editDisposable, living: editLiving, dreamMonthly: editMonthly, future: editFuture })}>{CYCLE_REVIEW.edit.confirm}</button>
              <button type="button" onClick={() => { setStep("direction"); setFailed(false); }}>{CYCLE_REVIEW.edit.back}</button>
            </div>
            {failed && <p className="cycle-sub">{ERRORS.validation.line} {ERRORS.validation.sub}</p>}
          </section>
        )}

        {step === "done" && (
          <section className="cycle-step" aria-live="polite">
            <p className="cycle-line">{CYCLE_REVIEW.done.line}</p>
            {doneLeftover > 0 && <p className="cycle-sub">{CYCLE_REVIEW.done.leftoverNote.replace("{amount}", fmt(doneLeftover))}</p>}
            <div className="decision-options"><button type="button" onClick={() => router.push("/")}>{CYCLE_REVIEW.done.home}</button></div>
          </section>
        )}
      </section>
    </main>
  );
}
