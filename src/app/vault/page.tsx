/* eslint-disable @next/next/no-img-element --
   纸条与小金库是手绘 PNG,页面需要保留原图比例与纸张纹理。 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dog } from "@/components/Dog";
import { LoadingState } from "@/components/LoadingState";
import { useMoneyState } from "@/lib/state/money-store";
import { resolvePrinciple } from "@/server/domain/principle";
import { script, withAlias } from "@/mock/script";
import { CARDS_PAGE, moneyNoteScript, PRINCIPLE_CANDIDATE } from "@/mock/剧本";

export default function VaultPage() {
  const router = useRouter();
  const { state, ready, commit } = useMoneyState();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const alias = state?.profile.dogName?.trim() || "慢慢";

  if (!ready) return <LoadingState />;

  const principleCards = (state?.principles ?? [])
    .map((principle) => ({
      id: principle.id,
      type: "principle" as const,
      title: "我的金钱原则",
      body: principle.statement,
      status: principle.status,
      label: principle.status === "candidate"
        ? CARDS_PAGE.labels.candidate
        : principle.status === "confirmed"
        ? CARDS_PAGE.labels.confirmed
        : principle.status === "edited"
          ? CARDS_PAGE.labels.edited
          : CARDS_PAGE.labels.unsure,
    }));
  const cards = [{
    id: "welcome",
    type: "welcome" as const,
    title: withAlias(script.firstRecord.title, alias),
    body: script.firstRecord.body,
    label: CARDS_PAGE.labels.welcome,
  }, ...principleCards];
  const expandedCard = cards.find((card) => card.id === expandedId) ?? null;

  function applyPrinciple(id: string, decision: "like_me" | "edit" | "defer") {
    if (!state) return;
    const principle = state.principles.find((item) => item.id === id);
    if (!principle) return;
    if (decision === "edit" && editingId !== id) {
      setEditingId(id);
      setEditText(principle.statement);
      return;
    }
    try {
      const result = resolvePrinciple(state, {
        id,
        decision,
        ...(decision === "edit" ? { editedText: editText } : {}),
        expectedStateVersion: state.stateVersion,
        idempotencyKey: globalThis.crypto.randomUUID(),
      });
      commit(result.state);
      setEditingId(null);
      setEditText("");
    } catch {
      setEditingId(null);
    }
  }

  function renderPrincipleCard(principle: (typeof principleCards)[number]) {
    const isCandidate = principle.status === "candidate";
    const content = <article className="principle-card"><p>{principle.label}</p><strong>{principle.title}</strong><span>{principle.body}</span>{isCandidate && <div className="principle-card-actions" onClick={(event) => event.stopPropagation()}>{editingId === principle.id ? <><input className="principle-card-edit-input" value={editText} onChange={(event) => setEditText(event.target.value)} aria-label={principle.body} /><button type="button" onClick={() => applyPrinciple(principle.id, "edit")}>{PRINCIPLE_CANDIDATE.saveEdit}</button><button type="button" onClick={() => applyPrinciple(principle.id, "defer")}>{PRINCIPLE_CANDIDATE.actions.defer}</button></> : <><button type="button" onClick={() => applyPrinciple(principle.id, "like_me")}>{PRINCIPLE_CANDIDATE.actions.like}</button><button type="button" onClick={() => applyPrinciple(principle.id, "edit")}>{PRINCIPLE_CANDIDATE.actions.edit}</button><button type="button" onClick={() => applyPrinciple(principle.id, "defer")}>{PRINCIPLE_CANDIDATE.actions.defer}</button></>}</div>}</article>;
    if (isCandidate) return <div className="principle-card-button" key={principle.id}>{content}</div>;
    return <button className="principle-card-button" type="button" key={principle.id} onClick={() => setExpandedId(principle.id)} aria-label={`放大${principle.title}`}>{content}</button>;
  }

  return (
    <main className="stage-shell flow-layout-shell">
      <section className="simple-page vault-page-shell" aria-label={withAlias(moneyNoteScript.vault.title, alias)}>
        <button className="vault-back back-arrow-button" type="button" onClick={() => router.push("/")} aria-label="返回首页"><span className="back-arrow-icon" aria-hidden="true" /></button>
        <header className="vault-heading">
          <h1>{withAlias(moneyNoteScript.vault.title, alias)}</h1>
          <p>{CARDS_PAGE.greeting}</p>
        </header>
        <section className="vault-card-section" aria-label="纪念卡">
          <div className="vault-paper-board">
            {cards.filter((card) => card.type === "welcome").map((card) => <button className="principle-card-button vault-welcome-card-button" type="button" key={card.id} onClick={() => setExpandedId(card.id)} aria-label="放大纪念卡"><article className="principle-card vault-welcome-card"><span>{card.body}</span></article></button>)}
            {principleCards.map(renderPrincipleCard)}
          </div>
        </section>
        <div className="vault-art-stack">
          <section className="vault-illustration vault-box-art" aria-hidden="true"><img src="/assets/小金库.png" alt="" /></section>
          <section className="vault-illustration vault-dog-art" aria-label={alias}><Dog page="原则卡" alias={alias} message={null} /></section>
        </div>
        {expandedCard && (
          <div className="principle-card-backdrop" role="dialog" aria-modal="true" aria-label="放大的纸条" onClick={() => setExpandedId(null)}>
            <div className="principle-card-dialog" onClick={(event) => event.stopPropagation()}>
              <button className="simple-back principle-card-close" type="button" onClick={() => setExpandedId(null)} aria-label="关闭纸条">关闭</button>
              <article className={`principle-card principle-card-expanded ${expandedCard.type === "welcome" ? "vault-welcome-card" : ""}`}>
                {expandedCard.type !== "welcome" && <><p>{expandedCard.label}</p><strong>{expandedCard.title}</strong></>}
                <span>{expandedCard.body}</span>
              </article>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
