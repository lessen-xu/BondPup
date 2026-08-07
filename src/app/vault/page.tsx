/* eslint-disable @next/next/no-img-element --
   纸条与小金库是手绘 PNG,页面需要保留原图比例与纸张纹理。 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dog } from "@/components/Dog";
import { LoadingState } from "@/components/LoadingState";
import { useMoneyState } from "@/lib/state/money-store";
import { script, withAlias } from "@/mock/script";
import { moneyNoteScript } from "@/mock/剧本";

export default function VaultPage() {
  const router = useRouter();
  const { state, ready } = useMoneyState();
  const [expanded, setExpanded] = useState(false);
  const alias = state?.profile.displayName?.trim() || "慢慢";

  if (!ready) return <LoadingState />;

  const noteText = state?.principles[0]?.statement || script.firstRecord.body;
  const noteTitle = state?.principles[0] ? "我的金钱原则" : "我们的第一张纸条";

  return (
    <main className="stage-shell flow-layout-shell">
      <section className="simple-page vault-page-shell" aria-label={withAlias(moneyNoteScript.vault.title, alias)}>
        <button className="simple-back" type="button" onClick={() => router.push("/")} aria-label="返回首页">返回首页</button>
        <header className="vault-heading">
          <h1>{withAlias(moneyNoteScript.vault.title, alias)}</h1>
          <p>{moneyNoteScript.vault.subtitle}</p>
        </header>
        <div className="vault-paper-board">
          <button className="principle-card-button" type="button" onClick={() => setExpanded(true)} aria-label="放大纸条">
            <article className="principle-card">
              <p>{noteTitle}</p>
              <strong>{noteText}</strong>
            </article>
          </button>
        </div>
        <section className="vault-illustration" aria-hidden="true"><img src="/assets/小金库.png" alt="" /></section>
        <section className="vault-illustration" aria-label={alias}><Dog page="原则卡" alias={alias} message={null} /></section>
        {expanded && (
          <div className="principle-card-backdrop" role="dialog" aria-modal="true" aria-label="放大的纸条" onClick={() => setExpanded(false)}>
            <div className="principle-card-dialog" onClick={(event) => event.stopPropagation()}>
              <button className="simple-back principle-card-close" type="button" onClick={() => setExpanded(false)} aria-label="关闭纸条">关闭</button>
              <article className="principle-card principle-card-expanded">
                <p>{noteTitle}</p>
                <strong>{noteText}</strong>
              </article>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
