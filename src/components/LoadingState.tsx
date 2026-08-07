"use client";

import { Dog } from "./Dog";
import { ERRORS } from "@/mock/剧本";

export function LoadingState() {
  return (
    <main className="empty-home-loading" aria-live="polite">
      <div className="loading-dog"><Dog page="首页" alias="慢慢" state="idle" message={null} /></div>
      <p>{ERRORS.loading.line}</p>
    </main>
  );
}
