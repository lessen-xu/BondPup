"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { StoryAction } from "@/contracts";
import { createDecisionStory } from "@/server/domain/story";
import { loadMoneyState, useMoneyState } from "@/lib/state/money-store";
import { previewDecision } from "@/lib/plan/preview-decision";
import { formatYuan, parseAmountCents } from "@/mock/decision";
import { DAILY_DECISION, DECISION_BALANCE, ERRORS } from "@/mock/剧本";
import { setDogThinking } from "@/lib/state/dog-state";
import { Dog } from "./Dog";
import { HandDrawnUnderline } from "./HandDrawnUnderline";
import { LoadingState } from "./LoadingState";

type BuyStep = "item" | "price" | "checking" | "arrange" | "confirm" | "done";

const ACTIONS: Array<{ key: StoryAction; label: string }> = [
  { key: "buy_now", label: DAILY_DECISION.actions.buy },
  { key: "defer", label: DAILY_DECISION.actions.defer },
  { key: "skip_this_time", label: DAILY_DECISION.actions.skip },
];

function isStateConflict(cause: unknown): boolean {
  return Boolean(cause && typeof cause === "object" && "code" in cause && cause.code === "state_conflict");
}

function replaceAlias(text: string, alias: string, user = "你"): string {
  return text.replaceAll("{alias}", alias).replaceAll("{user}", user);
}

export function BuyDecisionFlow({ initialItem = "" }: { initialItem?: string }) {
  const router = useRouter();
  const { state, ready, commit } = useMoneyState();
  const alias = state?.profile.dogName?.trim() || "慢慢";
  const user = state?.profile.displayName?.trim() || "你";
  const [step, setStep] = useState<BuyStep>("item");
  const [itemInput, setItemInput] = useState(initialItem);
  const [item, setItem] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [preview, setPreview] = useState<ReturnType<typeof previewDecision> | null>(null);
  const [previewIssue, setPreviewIssue] = useState(false);
  const [proposedAction, setProposedAction] = useState<StoryAction | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dogState, setDogState] = useState<"ears" | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => () => setDogThinking(false), []);
  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    const timer = window.setTimeout(updateNow, 0);
    const interval = window.setInterval(updateNow, 60_000);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); };
  }, []);

  const displayPrice = amount === null ? "" : formatYuan(amount);
  const comfortJar = state?.jars.find((jar) => jar.kind === "comfort") ?? null;
  const staleBalance = now !== null && comfortJar !== null
    && now - Date.parse(comfortJar.updatedAt) > 7 * 24 * 60 * 60 * 1000;
  const comfortText = useMemo(() => {
    if (!preview || amount === null) return null;
    if (preview.shortfall > 0) {
      return replaceAlias(DAILY_DECISION.shortfall, alias, user)
        .replace("{shortfall}", formatYuan(preview.shortfall));
    }
    if (staleBalance) {
      return DECISION_BALANCE.stale.line.replace("{balance}", formatYuan(preview.comfortAvailable));
    }
    return DECISION_BALANCE.fresh
      .replace("{balance}", formatYuan(preview.comfortAvailable))
      .replace("{remain}", formatYuan(preview.remaining));
  }, [alias, amount, preview, staleBalance, user]);

  function submitItem() {
    const next = itemInput.trim();
    if (!next) return;
    setItem(next);
    setStep("price");
  }

  function submitPrice() {
    const parsed = parseAmountCents(priceInput);
    if (parsed === null || parsed <= 0) {
      setError(`${ERRORS.validation.line} ${ERRORS.validation.sub}`);
      return;
    }
    setAmount(parsed);
    setError(null);
    if (!state) return;
    setStep("checking");
    setPreviewIssue(false);
    setDogThinking(true);
    window.setTimeout(() => {
      try {
        setPreview(previewDecision(state, { amount: parsed }));
      } catch {
        setPreviewIssue(true);
      } finally {
        setDogThinking(false);
        setStep("arrange");
      }
    }, 0);
  }

  function chooseAction(action: StoryAction) {
    setProposedAction(action);
    setIdempotencyKey(globalThis.crypto.randomUUID());
    setError(null);
    setStep("confirm");
  }

  function confirmAction() {
    if (!state || amount === null || !proposedAction || !idempotencyKey || submitting) return;
    setSubmitting(true);
    try {
      const result = createDecisionStory(state, {
        intent: item,
        action: proposedAction,
        amount,
        reviewInDays: proposedAction === "defer" ? 1 : 3,
        expectedStateVersion: state.stateVersion,
        idempotencyKey,
      });
      commit(result.state);
      setError(null);
      setDogThinking(false);
      setDogState("ears");
      window.setTimeout(() => setDogState(null), 1200);
      setStep("done");
    } catch (cause) {
      if (isStateConflict(cause)) {
        const latest = loadMoneyState();
        if (latest) commit(latest);
        setError(`${ERRORS.conflict.line} ${ERRORS.conflict.sub}`);
      } else {
        setError(`${ERRORS.validation.line} ${ERRORS.validation.sub}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function back() {
    setError(null);
    if (step === "item") return router.push("/");
    if (step === "price") return setStep("item");
    if (step === "arrange") return setStep("price");
    if (step === "confirm") { setIdempotencyKey(null); return setStep("arrange"); }
    router.push("/");
  }

  if (!ready) return <LoadingState />;
  if (!state) {
    return <main className="stage-shell flow-layout-shell"><section className="stage talk-page decision-page"><button className="simple-back decision-back" type="button" onClick={() => router.push("/")} aria-label="返回首页">返回首页</button><p className="decision-dog-bubble">{replaceAlias(DAILY_DECISION.noState, alias)}</p><div className="decision-options"><button className="decision-text-action" type="button" onClick={() => router.push("/start")}>{DAILY_DECISION.start}<HandDrawnUnderline /></button><button className="decision-text-action" type="button" onClick={() => router.push("/")}>{DAILY_DECISION.browse}<HandDrawnUnderline /></button></div></section></main>;
  }

  const actionLabel = ACTIONS.find((entry) => entry.key === proposedAction)?.label ?? "";
  return (
    <main className="stage-shell flow-layout-shell">
      <section className="stage talk-page decision-page buy-decision-page" aria-label={DAILY_DECISION.entry}>
        <button className="simple-back decision-back" type="button" onClick={back} aria-label="返回上一步">返回上一步</button>
        <section className="dog-layer" aria-label={alias}><Dog page="对话" state={dogState ?? undefined} alias={alias} message={null} talkMode /></section>
        <section className="decision-dialog" aria-live="polite">
          {step === "item" && <div className="decision-step"><p className="decision-dog-bubble">{replaceAlias(DAILY_DECISION.intro, alias)}</p><input autoFocus className="decision-input" value={itemInput} onChange={(event) => setItemInput(event.target.value)} placeholder={DAILY_DECISION.itemPlaceholder} aria-label={DAILY_DECISION.itemPlaceholder} /><p className="talk-status">{DAILY_DECISION.itemHint}</p><button className="decision-text-action" type="button" onClick={submitItem}>{DAILY_DECISION.itemNext}<HandDrawnUnderline /></button></div>}
          {step === "price" && <div className="decision-step"><p className="decision-dog-bubble">{replaceAlias(DAILY_DECISION.priceQuestion, alias)}</p><input autoFocus className="decision-input" value={priceInput} onChange={(event) => { setPriceInput(event.target.value); setError(null); }} placeholder={DAILY_DECISION.pricePlaceholder} aria-label={DAILY_DECISION.pricePlaceholder} inputMode="decimal" />{error && <p className="talk-status">{error}</p>}<button className="decision-text-action" type="button" onClick={submitPrice}>{DAILY_DECISION.itemNext}<HandDrawnUnderline /></button><button className="decision-text-action" type="button" onClick={() => setPriceInput("")}>{DAILY_DECISION.unsure}<HandDrawnUnderline /></button></div>}
          {step === "checking" && <div className="decision-step"><p className="decision-dog-bubble money-note-thinking-bubble" aria-hidden="true"> </p></div>}
          {step === "arrange" && previewIssue && <div className="decision-step"><p className="decision-dog-bubble">{ERRORS.timeout.line}</p><p className="decision-dog-bubble">{ERRORS.timeout.sub}</p><button className="decision-text-action" type="button" onClick={() => setStep("price")}>{ERRORS.timeout.retry}<HandDrawnUnderline /></button></div>}
          {step === "arrange" && preview && amount !== null && <div className="decision-step"><p className="decision-dog-bubble">{comfortText}</p><p className="decision-dog-bubble">{DAILY_DECISION.arrange}</p><div className="decision-plain-summary"><p>{DAILY_DECISION.summaryItem.replace("{item}", item).replace("{price}", displayPrice)}</p><p>{DAILY_DECISION.summaryComfort.replace("{remain}", formatYuan(preview.remaining))}</p></div>{preview.shortfall > 0 && <><p className="decision-dog-bubble">{replaceAlias(DAILY_DECISION.shortfall, alias).replace("{shortfall}", formatYuan(preview.shortfall))}</p><div className="decision-options decision-source-options">{preview.sources.map((source) => <button key={source.jarKind} className="decision-option" type="button">{source.label}</button>)}</div>{preview.goalImpact && <p className="talk-status">{preview.goalImpact}</p>}</>}{!staleBalance && <p className="decision-dog-bubble">{DAILY_DECISION.arrangeQuestion}</p>}<div className="decision-options decision-buy-actions">{ACTIONS.map((action) => <button key={action.key} className="decision-buy-action" type="button" onClick={() => chooseAction(action.key)}>{action.label}<HandDrawnUnderline /></button>)}</div></div>}
          {step === "confirm" && <div className="decision-step"><p className="decision-dog-bubble">{replaceAlias(DAILY_DECISION.confirmQuestion, alias)}</p><p className="decision-plain-summary">{item} {displayPrice}元 · {actionLabel}</p>{error && <p className="talk-status">{error}</p>}<div className="decision-options"><button className="decision-text-action" type="button" disabled={submitting} onClick={confirmAction}>{DAILY_DECISION.confirm}<HandDrawnUnderline /></button><button className="decision-text-action" type="button" disabled={submitting} onClick={() => { setIdempotencyKey(null); setStep("arrange"); }}>{DAILY_DECISION.modify}<HandDrawnUnderline /></button><button className="decision-text-action" type="button" disabled={submitting} onClick={() => { setIdempotencyKey(null); setStep("arrange"); }}>{DAILY_DECISION.cancel}<HandDrawnUnderline /></button></div></div>}
          {step === "done" && <div className="decision-step"><p className="decision-dog-bubble">{replaceAlias(DAILY_DECISION.closing, alias)}</p><button className="decision-text-action" type="button" onClick={() => router.push("/")}>首页<HandDrawnUnderline /></button></div>}
        </section>
      </section>
    </main>
  );
}
