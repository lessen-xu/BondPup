"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { JarKind } from "@/contracts/money";
import { useMoneyState } from "@/lib/state/money-store";
import { useAlias } from "@/lib/state/alias-store";
import { useDogActions } from "@/lib/state/dog-state";
import { formatYuan, parseAmountCents } from "@/mock/decision";
import { moneyNoteScript } from "@/mock/剧本";
import { commitJarDebit, undoJarDebit } from "@/server/domain/debit";
import { Dog } from "./Dog";
import { HandDrawnUnderline } from "./HandDrawnUnderline";

type NoteStep = "story" | "amount" | "jar" | "confirm" | "done" | "talk-only" | "undone";
type UndoToken = ReturnType<typeof commitJarDebit>["undoToken"];

export function MoneyNoteFlow() {
  const router = useRouter();
  const { alias } = useAlias();
  const { triggerAction } = useDogActions();
  const { state, ready, commit } = useMoneyState();
  const [step, setStep] = useState<NoteStep>("story");
  const [storyInput, setStoryInput] = useState("");
  const [story, setStory] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [jarKind, setJarKind] = useState<JarKind>("comfort");
  const [undoToken, setUndoToken] = useState<UndoToken | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedJar = useMemo(() => state?.jars.find((jar) => jar.kind === jarKind) ?? null, [jarKind, state]);

  if (!ready) return <main className="empty-home-loading">{moneyNoteScript.loading}</main>;

  function submitStory() {
    const nextStory = storyInput.trim();
    if (!nextStory) return;
    setStory(nextStory);
    setStep("amount");
  }

  function submitAmount() {
    const parsed = parseAmountCents(amountInput);
    if (parsed === null || parsed <= 0) return;
    setAmount(parsed);
    setError(null);
    setStep("confirm");
  }

  function chooseJar(nextKind: JarKind) {
    setJarKind(nextKind);
    setError(null);
    setStep("confirm");
  }

  function confirmDebit() {
    if (!state || amount === null) return;
    try {
      const result = commitJarDebit(state, {
        jarKind,
        amount,
        expectedStateVersion: state.stateVersion,
        idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `money-note-${Date.now()}`,
      });
      commit(result.state);
      triggerAction(result.proposedAction);
      setUndoToken(result.undoToken);
      setError(null);
      setStep("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : moneyNoteScript.fallbackError);
    }
  }

  function undo() {
    if (!state || !undoToken) return;
    commit(undoJarDebit(state, undoToken));
    setUndoToken(null);
    setStep("undone");
  }

  function back() {
    setError(null);
    if (step === "story") return router.push("/");
    if (step === "amount") return setStep("story");
    if (step === "jar") return setStep("amount");
    if (step === "confirm") return setStep("amount");
    router.push("/");
  }

  const confirmation = moneyNoteScript.confirm
    .replace("▢▢▢", amount === null ? "" : formatYuan(amount))
    .replace("{jarLabel}", selectedJar?.label ?? "罐子里");

  return (
    <main className="stage-shell flow-layout-shell">
      <section className="stage talk-page decision-page money-note-page" aria-label="有笔钱想说说">
        <button className="simple-back decision-back" type="button" aria-label={step === "story" ? moneyNoteScript.backHome : moneyNoteScript.back} onClick={back}>{moneyNoteScript.back}</button>
        <section className="dog-layer" aria-label={alias}><Dog page="对话" message={null} talkMode /></section>
        <section className="decision-dialog" aria-live="polite">
          {!state ? (
            <div className="decision-step"><p className="decision-dog-bubble">{moneyNoteScript.noState}</p><button className="decision-text-action" type="button" onClick={() => router.push("/start")}>{moneyNoteScript.goStart}<HandDrawnUnderline /></button></div>
          ) : (
            <>
              {step === "story" && <div className="decision-step"><p className="decision-dog-bubble">{moneyNoteScript.intro}</p><input className="decision-input" value={storyInput} onChange={(event) => setStoryInput(event.target.value)} placeholder={moneyNoteScript.storyPlaceholder} aria-label={moneyNoteScript.storyPlaceholder} /><button className="decision-text-action" type="button" onClick={submitStory}>{moneyNoteScript.storySubmit}<HandDrawnUnderline /></button></div>}
              {step === "amount" && <div className="decision-step"><p className="decision-user-bubble">{story}</p><p className="decision-dog-bubble">{moneyNoteScript.amountQuestion}</p><input className="decision-input" value={amountInput} onChange={(event) => setAmountInput(event.target.value)} placeholder={moneyNoteScript.amountPlaceholder} aria-label={moneyNoteScript.amountPlaceholder} inputMode="decimal" /><div className="decision-options"><button className="decision-option" type="button" onClick={submitAmount}>{moneyNoteScript.amountSubmit}</button><button className="decision-option" type="button" onClick={() => setStep("talk-only")}>{moneyNoteScript.talkOnly}</button></div></div>}
              {step === "jar" && <div className="decision-step"><p className="decision-dog-bubble">{moneyNoteScript.chooseJar}</p><div className="decision-options decision-source-options">{state.jars.map((jar) => <button key={jar.kind} className="decision-option" type="button" onClick={() => chooseJar(jar.kind)}>{jar.label}</button>)}</div></div>}
              {step === "confirm" && <div className="decision-step"><p className="decision-dog-bubble">{confirmation}</p>{error && <p className="talk-status">{error}</p>}<div className="decision-options decision-source-options"><button className="decision-option" type="button" onClick={confirmDebit}>{moneyNoteScript.confirmDebit}</button><button className="decision-option" type="button" onClick={() => setStep("jar")}>{moneyNoteScript.changeJar}</button><button className="decision-option" type="button" onClick={() => setStep("talk-only")}>{moneyNoteScript.talkOnly}</button></div></div>}
              {step === "done" && <div className="decision-step"><p className="decision-dog-bubble">{moneyNoteScript.saved}</p><button className="decision-text-action" type="button" onClick={undo}>{moneyNoteScript.undo}<HandDrawnUnderline /></button><button className="decision-text-action" type="button" onClick={() => router.push("/")}>{moneyNoteScript.backHome}<HandDrawnUnderline /></button></div>}
              {step === "talk-only" && <div className="decision-step"><p className="decision-dog-bubble">{moneyNoteScript.talkOnlySaved}</p><button className="decision-text-action" type="button" onClick={() => router.push("/")}>{moneyNoteScript.backHome}<HandDrawnUnderline /></button></div>}
              {step === "undone" && <div className="decision-step"><p className="decision-dog-bubble">{moneyNoteScript.undone}</p><button className="decision-text-action" type="button" onClick={() => router.push("/")}>{moneyNoteScript.backHome}<HandDrawnUnderline /></button></div>}
            </>
          )}
        </section>
      </section>
    </main>
  );
}
