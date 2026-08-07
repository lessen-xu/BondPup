/* eslint-disable @next/next/no-img-element --
   纸条与小金库是手绘 PNG,页面需要保留原图比例与纸张纹理。 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dog } from "@/components/Dog";
import { LoadingState } from "@/components/LoadingState";
import { useMoneyState } from "@/lib/state/money-store";
import { script, withAlias } from "@/mock/script";
import { CARDS_PAGE, moneyNoteScript } from "@/mock/剧本";

export default function VaultPage() {
  const router = useRouter();
  const { state, ready } = useMoneyState();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const alias = state?.profile.displayName?.trim() || "慢慢";

  if (!ready) return <LoadingState />;

  const principleCards = (state?.principles ?? [])
    .filter((principle) => principle.status !== "candidate")
    .map((principle) => ({
      id: principle.id,
      type: "principle" as const,
      title: "我的金钱原则",
      body: principle.statement,
      label: principle.status === "confirmed"
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

  return (
    <main className="stage-shell flow-layout-shell">
      <section className="simple-page vault-page-shell" aria-label={withAlias(moneyNoteScript.vault.title, alias)}>
        <button className="simple-back home-link" type="button" onClick={() => router.push("/")} aria-label="返回首页">回家</button>
        <header className="vault-heading">
          <h1>{withAlias(moneyNoteScript.vault.title, alias)}</h1>
          <p>{CARDS_PAGE.greeting}</p>
        </header>
        <section className="vault-card-section" aria-label="起点卡">
          <div className="vault-paper-board">
            {cards.filter((card) => card.type === "welcome").map((card) => <button className="principle-card-button" type="button" key={card.id} onClick={() => setExpandedId(card.id)} aria-label={`放大${card.title}`}><article className="principle-card"><p>{card.label}</p><strong>{card.title}</strong><span>{card.body}</span></article></button>)}
          </div>
        </section>
        {principleCards.length > 0 ? <section className="vault-card-section" aria-label="原则卡"><div className="vault-paper-board">{principleCards.map((card) => <button className="principle-card-button" type="button" key={card.id} onClick={() => setExpandedId(card.id)} aria-label={`放大${card.title}`}><article className="principle-card"><p>{card.label}</p><strong>{card.title}</strong><span>{card.body}</span></article></button>)}</div></section> : <p className="vault-empty-copy">{CARDS_PAGE.empty}</p>}
        <section className="vault-illustration" aria-hidden="true"><img src="/assets/小金库.png" alt="" /></section>
        <section className="vault-illustration" aria-label={alias}><Dog page="原则卡" alias={alias} message={null} /></section>
        {expandedCard && (
          <div className="principle-card-backdrop" role="dialog" aria-modal="true" aria-label="放大的纸条" onClick={() => setExpandedId(null)}>
            <div className="principle-card-dialog" onClick={(event) => event.stopPropagation()}>
              <button className="simple-back principle-card-close" type="button" onClick={() => setExpandedId(null)} aria-label="关闭纸条">关闭</button>
              <article className="principle-card principle-card-expanded">
                <p>{expandedCard.label}</p>
                <strong>{expandedCard.title}</strong>
                <span>{expandedCard.body}</span>
              </article>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
