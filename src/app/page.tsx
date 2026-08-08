"use client";

import { useEffect, useState } from "react";
import { Stage } from "@/components/Stage";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { LoadingState } from "@/components/LoadingState";
import { useMoneyState } from "@/lib/state/money-store";

export default function HomePage() {
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

  return <OnboardingFlow />;
}
