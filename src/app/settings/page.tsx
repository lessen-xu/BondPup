"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { clearMoneyState, exportMoneyStateJson, useMoneyState } from "@/lib/state/money-store";
import { DEMO, SETTINGS } from "@/mock/剧本";

export default function SettingsPage() {
  const router = useRouter();
  const { state, enterDemo } = useMoneyState();
  const [clearPending, setClearPending] = useState(false);

  function exportData() {
    if (!state) return;
    const blob = new Blob([exportMoneyStateJson(state)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bondpup-money-state.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function clearData() {
    clearMoneyState();
    setClearPending(false);
    router.push("/");
  }

  return <main className="stage-shell flow-layout-shell"><section className="simple-page simple-page-shell"><button className="simple-back" type="button" onClick={() => router.push("/")}>返回首页</button><h1>{SETTINGS.title}</h1><div className="settings-list"><button type="button" disabled={!state} onClick={exportData}>{SETTINGS.exportData}</button><button className="clear-action" type="button" disabled={!state} onClick={() => setClearPending(true)}>{SETTINGS.clearData}</button><button type="button" onClick={() => { enterDemo(); router.push("/"); }}>{DEMO.entryDemo}</button></div>{clearPending && <section className="confirm-copy" aria-live="polite"><p>{SETTINGS.clearConfirm}</p><div className="decision-options"><button type="button" onClick={clearData}>{SETTINGS.clearYes}</button><button type="button" onClick={() => setClearPending(false)}>{SETTINGS.clearNo}</button></div></section>}</section></main>;
}
