"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Stage } from "@/components/Stage";
import { LoadingState } from "@/components/LoadingState";
import { TextEntry } from "@/components/TextEntry";
import { useMoneyState } from "@/lib/state/money-store";
import { DEMO } from "@/mock/剧本";

export default function HomePage() {
  const router = useRouter();
  const { state, ready, enterDemo } = useMoneyState();
  const [demoIntro, setDemoIntro] = useState(false);
  const [demoApplied, setDemoApplied] = useState(false);
  const demoRequested = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1";

  useEffect(() => {
    if (!ready || !demoRequested || demoApplied) return;
    const timer = window.setTimeout(() => {
      enterDemo();
      setDemoIntro(true);
      setDemoApplied(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [demoApplied, demoRequested, enterDemo, ready]);

  if (!ready || (demoRequested && !demoApplied)) return <LoadingState />;
  if (state) return <Stage state={state} demoIntro={demoIntro} onDismissDemoIntro={() => setDemoIntro(false)} />;

  return (
    <main className="empty-home-shell">
      <section className="empty-home" aria-label="慢慢首页">
        <div className="empty-home-entries">
          <TextEntry onClick={() => router.push("/start")}>{DEMO.entryFresh}</TextEntry>
          <TextEntry onClick={() => { enterDemo(); setDemoIntro(true); }}>{DEMO.entryDemo}</TextEntry>
        </div>
      </section>
    </main>
  );
}
