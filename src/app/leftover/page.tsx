/* eslint-disable @next/next/no-img-element --
   碎钻堆与野餐垫是手绘 PNG,页面保留原图比例与纸张纹理。 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { JarKind } from "@/contracts";
import { LoadingState } from "@/components/LoadingState";
import { LEFTOVER_TIER_IMAGES } from "@/components/Leftover";
import { MoneyAmountInput } from "@/components/MoneyAmountInput";
import { leftoverTier } from "@/lib/leftover-tier";
import { formatYuanFromCents } from "@/lib/money/amount-text";
import { useMoneyState } from "@/lib/state/money-store";
import { moveLeftover } from "@/server/domain/leftover";
import { LEFTOVER_PAGE } from "@/mock/剧本";

const JAR_ORDER: JarKind[] = ["living", "comfort", "dream", "future"];

/** "2026-07" → "7 月";跨年份保守显示全称 */
function cycleLabel(cycle: string, currentCycle: string | undefined): string {
  const [year, month] = cycle.split("-");
  const [currentYear] = (currentCycle ?? "").split("-");
  const monthText = `${Number(month)} 月`;
  return year === currentYear ? monthText : `${year} 年 ${monthText}`;
}

type Step = "view" | "jar" | "amount" | "confirm" | "done";

export default function LeftoverPage() {
  const router = useRouter();
  const { state, ready, commit } = useMoneyState();
  const [step, setStep] = useState<Step>("view");
  const [toKind, setToKind] = useState<JarKind | null>(null);
  const [moveAmount, setMoveAmount] = useState(0);
  const [movedNote, setMovedNote] = useState("");
  const [moveFailed, setMoveFailed] = useState(false);

  if (!ready) return <LoadingState />;

  const leftover = state?.leftover ?? { amount: 0, history: [] };
  const tier = leftoverTier(leftover.amount);
  const jarLabel = (kind: JarKind) => state?.jars.find((jar) => jar.kind === kind)?.label ?? kind;
  const targetLabel = toKind ? jarLabel(toKind) : "";

  function confirmMove() {
    if (!state || !toKind) return;
    try {
      const result = moveLeftover(state, {
        toKind,
        amount: moveAmount,
        expectedStateVersion: state.stateVersion,
        idempotencyKey: globalThis.crypto.randomUUID(),
      });
      commit(result.state);
      setMovedNote(result.movedNote);
      setMoveFailed(false);
      setStep("done");
    } catch {
      setMoveFailed(true);
      setStep("view");
      setToKind(null);
    }
  }

  return (
    <main className="stage-shell flow-layout-shell">
      <section className="simple-page leftover-page-shell" aria-label={LEFTOVER_PAGE.title}>
        <button className="simple-back" type="button" onClick={() => router.push("/")}>{LEFTOVER_PAGE.back}</button>
        {/* 一档一张完整图,不叠加(叠加会露出紧裁图的硬边);large 用带留白阴影的完整版。
            三档大小 = 三档宽度;为 0 不显示钻石(spec:变少不失落,为 0 不显示) */}
        {tier && (
          <section className={`leftover-art leftover-art-${tier}`} aria-hidden="true">
            <img className="leftover-nest-art" src={tier === "large" ? "/assets/leftover-nest.png" : LEFTOVER_TIER_IMAGES[tier]} alt="" />
          </section>
        )}
        {leftover.amount === 0 && step !== "done" && <p className="leftover-line">{LEFTOVER_PAGE.empty}</p>}

        {leftover.amount > 0 && step === "view" && (
          <section className="leftover-body">
            <p className="leftover-line">{LEFTOVER_PAGE.intro}</p>
            <p className="leftover-line leftover-amount">{LEFTOVER_PAGE.amountLine.replace("{amount}", formatYuanFromCents(leftover.amount))}</p>
            <ul className="leftover-history">
              {leftover.history.map((entry, index) => (
                <li key={`${entry.cycle}-${entry.fromJar}-${index}`}>
                  {LEFTOVER_PAGE.fromLine
                    .replace("{cycle}", cycleLabel(entry.cycle, state?.cycle?.cycle))
                    .replace("{jar}", jarLabel(entry.fromJar))
                    .replace("{amount}", formatYuanFromCents(entry.amount))}
                </li>
              ))}
            </ul>
            <p className="leftover-line leftover-hint">{LEFTOVER_PAGE.hint}</p>
            {moveFailed && <p className="leftover-line leftover-hint" aria-live="polite">{LEFTOVER_PAGE.moveFailed}</p>}
            <div className="decision-options leftover-options">
              <button className="decision-option" type="button" onClick={() => { setMoveFailed(false); setStep("jar"); }}>{LEFTOVER_PAGE.moveEntry}</button>
            </div>
          </section>
        )}

        {step === "jar" && (
          <section className="leftover-body">
            <p className="leftover-line">{LEFTOVER_PAGE.chooseJar}</p>
            <div className="decision-options decision-source-options leftover-options">
              {JAR_ORDER.map((kind) => (
                <button className="decision-option" type="button" key={kind} onClick={() => { setToKind(kind); setMoveAmount(leftover.amount); setStep("amount"); }}>{jarLabel(kind)}</button>
              ))}
            </div>
          </section>
        )}

        {step === "amount" && (
          <section className="leftover-body">
            <p className="leftover-line">{LEFTOVER_PAGE.amountQuestion}</p>
            <MoneyAmountInput autoFocus value={moveAmount} onChange={setMoveAmount} ariaLabel={LEFTOVER_PAGE.amountQuestion} />
            <div className="decision-options leftover-options">
              <button className="decision-option" type="button" onClick={() => { setMoveAmount(leftover.amount); setStep("confirm"); }}>{LEFTOVER_PAGE.amountAll}</button>
              <button className="decision-option" type="button" onClick={() => { if (moveAmount > 0 && moveAmount <= leftover.amount) setStep("confirm"); }}>{LEFTOVER_PAGE.amountNext}</button>
            </div>
          </section>
        )}

        {step === "confirm" && toKind && (
          <section className="leftover-body">
            <p className="leftover-line">{LEFTOVER_PAGE.confirm.replace("{amount}", formatYuanFromCents(moveAmount)).replace("{jar}", targetLabel)}</p>
            <div className="decision-options leftover-options">
              <button className="decision-option" type="button" onClick={confirmMove}>{LEFTOVER_PAGE.confirmYes}</button>
              <button className="decision-option" type="button" onClick={() => setStep("jar")}>{LEFTOVER_PAGE.confirmNo}</button>
            </div>
          </section>
        )}

        {step === "done" && (
          <section className="leftover-body">
            <p className="leftover-line" aria-live="polite">{movedNote}</p>
            {leftover.amount > 0 && <p className="leftover-line leftover-amount">{LEFTOVER_PAGE.amountLine.replace("{amount}", formatYuanFromCents(leftover.amount))}</p>}
            <div className="decision-options leftover-options">
              <button className="decision-option" type="button" onClick={() => { setStep("view"); setToKind(null); }}>{LEFTOVER_PAGE.title}</button>
              <button className="decision-option" type="button" onClick={() => router.push("/")}>{LEFTOVER_PAGE.back}</button>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
