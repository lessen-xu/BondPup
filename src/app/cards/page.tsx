"use client";

import { useRouter } from "next/navigation";
import { useMoneyState } from "@/lib/state/money-store";
import { LoadingState } from "@/components/LoadingState";
import { ERRORS } from "@/mock/剧本";

export default function CardsPage() {
  const router = useRouter();
  const { state, ready } = useMoneyState();

  if (!ready) return <LoadingState />;

  return (
    <main className="stage-shell flow-layout-shell">
      <section className="simple-page cards-page" aria-label="收藏">
        <button className="simple-back" type="button" onClick={() => router.push("/")} aria-label="返回首页">返回首页</button>
        {state?.principles.length ? (
          <div className="review-record-list">
            {state.principles.map((principle) => (
              <article className="principle-card" key={principle.id}>
                <strong>{principle.statement}</strong>
              </article>
            ))}
          </div>
        ) : <p className="review-empty">{ERRORS.empty.cards}</p>}
      </section>
    </main>
  );
}
