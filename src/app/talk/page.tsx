"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Dog } from "@/components/Dog";
import { TextEntry } from "@/components/TextEntry";
import { MoneyNoteFlow } from "@/components/MoneyNoteFlow";
import { BuyDecisionFlow } from "@/components/BuyDecisionFlow";
import { LoadingState } from "@/components/LoadingState";
import { useMoneyState } from "@/lib/state/money-store";
import { script } from "@/mock/script";
import { DAILY_TALK } from "@/mock/剧本";

const TALK_DRAFT_KEY = "bondpup.unfinishedTalk";

function replaceNames(text: string, alias: string, user: string): string {
  return text.replaceAll("{alias}", alias).replaceAll("{user}", user);
}

function TalkLanding() {
  const router = useRouter();
  const { state } = useMoneyState();
  const alias = state?.profile.dogName?.trim() || "慢慢";
  const user = state?.profile.displayName?.trim() || "你";
  const [input, setInput] = useState("");
  const [message, setMessage] = useState(replaceNames(DAILY_TALK.prompt, alias, user));
  const [detected, setDetected] = useState<"decision" | "note" | null>(null);
  const silenceShown = useRef(false);

  useEffect(() => {
    const saved = window.sessionStorage.getItem(TALK_DRAFT_KEY);
    if (!saved) return;
    const timer = window.setTimeout(() => {
      setInput(saved);
      setMessage(replaceNames(DAILY_TALK.return, alias, user));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [alias, user]);

  useEffect(() => {
    if (silenceShown.current) return;
    const timer = window.setTimeout(() => {
      silenceShown.current = true;
      setMessage(replaceNames(DAILY_TALK.silence, alias, user));
    }, 45_000);
    return () => window.clearTimeout(timer);
  }, [alias, input, user]);

  function finishDraft() {
    window.sessionStorage.removeItem(TALK_DRAFT_KEY);
  }

  function submitFreeTalk() {
    const text = input.trim();
    if (!text) return;
    const isDecision = DAILY_TALK.triggers.decision.some((word) => text.includes(word));
    const isNote = DAILY_TALK.triggers.note.some((word) => text.includes(word));
    if (isDecision || isNote) {
      setDetected(isDecision ? "decision" : "note");
      setMessage(replaceNames(DAILY_TALK.detected, alias, user));
      return;
    }
    finishDraft();
    router.push(`/talk?topic=money&draft=${encodeURIComponent(text)}`);
  }

  function openDetected(together: boolean) {
    const text = input.trim();
    finishDraft();
    if (!together || detected === "note") router.push(`/talk?topic=money&draft=${encodeURIComponent(text)}`);
    else router.push(`/talk?mode=buy&draft=${encodeURIComponent(text)}`);
  }

  return (
    <main className="stage-shell flow-layout-shell">
      <section className="stage talk-page" aria-label={`和${alias}聊天`}>
        <button className="simple-back decision-back back-arrow-button" type="button" onClick={() => router.push("/")} aria-label="返回首页"><span className="back-arrow-icon" aria-hidden="true" /></button>
        <section className="dog-layer" aria-label={alias}>
          <Dog page="对话" alias={alias} message={message} talkMode />
        </section>
        <section className="talk-actions" aria-label="对话入口">
          <TextEntry onClick={() => { finishDraft(); router.push("/talk?mode=buy"); }}>{script.home.buyEntry}</TextEntry>
          <TextEntry onClick={() => { finishDraft(); router.push("/talk?topic=money"); }}>{script.home.moneyEntry}</TextEntry>
        </section>
        {detected && <section className="talk-actions" aria-label="话题选择"><TextEntry onClick={() => openDetected(true)}>{DAILY_TALK.together}</TextEntry><TextEntry onClick={() => openDetected(false)}>{DAILY_TALK.casual}</TextEntry></section>}
        <form className="talk-record" onSubmit={(event) => { event.preventDefault(); submitFreeTalk(); }}><input value={input} onChange={(event) => { setInput(event.target.value); window.sessionStorage.setItem(TALK_DRAFT_KEY, event.target.value); }} placeholder={replaceNames(DAILY_TALK.freePlaceholder, alias, user)} aria-label={replaceNames(DAILY_TALK.freePlaceholder, alias, user)} /><button type="submit">{DAILY_TALK.submit}</button></form>
        <button className="talk-companion-entry" type="button" onClick={() => router.push("/companion")}>陪伴</button>
      </section>
    </main>
  );
}

function TalkPageInner() {
  const params = useSearchParams();
  const draft = params.get("draft") ?? "";
  if (params.get("topic") === "money") return <MoneyNoteFlow initialStory={draft} />;
  if (params.get("mode") === "buy") return <BuyDecisionFlow initialItem={draft} />;
  return <TalkLanding />;
}

export default function TalkPage() {
  return <Suspense fallback={<LoadingState />}><TalkPageInner /></Suspense>;
}
