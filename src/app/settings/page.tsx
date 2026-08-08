"use client";

import { useRouter } from "next/navigation";
import { useMoneyState } from "@/lib/state/money-store";
import { DEMO } from "@/mock/剧本";

export default function SettingsPage() {
  const router = useRouter();
  const { enterDemo } = useMoneyState();
  return <main className="stage-shell flow-layout-shell"><section className="simple-page"><button className="simple-back" type="button" onClick={() => router.push("/")}>返回首页</button><p>还在做</p><button type="button" onClick={() => { enterDemo(); router.push("/"); }}>{DEMO.entryDemo}</button></section></main>;
}
