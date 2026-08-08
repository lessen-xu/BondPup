"use client";

import { useCallback, useSyncExternalStore } from "react";
import { MoneyState } from "@/contracts";
import { mockMoneyState } from "@/lib/mock/money-state";

/**
 * 前端 localStorage 是 MoneyState 的真源;服务端不持久化。
 * 只存必要结构化状态与短摘要(长度上限在 contracts 层强制),
 * 不存真实姓名/证件/银行账户/完整倾诉原文。
 */
const STORAGE_KEY = "bondpup.moneyState.v1";

let cached: MoneyState | null | undefined;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): MoneyState | null {
  if (cached === undefined) cached = loadMoneyState();
  return cached;
}

export function loadMoneyState(): MoneyState | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const state = MoneyState.parse(JSON.parse(raw));
    if (!state.cycle || state.jars.some((jar) => jar.kind === "future")) return state;
    return MoneyState.parse({
      ...state,
      jars: [...state.jars, {
        id: "jar-future",
        kind: "future",
        label: "未来罐",
        renamable: false,
        planned: 0,
        actual: 0,
        updatedAt: state.cycle.updatedAt,
      }],
    });
  } catch {
    // 结构不合法(契约升级或被手改)→ 视为无状态,不崩
    return null;
  }
}

export function saveMoneyState(state: MoneyState): void {
  const parsed = MoneyState.parse(state);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  cached = parsed;
  notify();
}

export function clearMoneyState(): void {
  window.localStorage.removeItem(STORAGE_KEY);
  cached = null;
  notify();
}

/** 演示模式:载入合成示例(demo:true,与真实数据同键互斥,清空即退出) */
export function loadDemoState(): MoneyState {
  const demo = MoneyState.parse({ ...mockMoneyState });
  saveMoneyState(demo);
  return demo;
}

/** 数据导出(法规「可复制」义务):A 端做成下载/复制按钮即可 */
export function exportMoneyStateJson(state: MoneyState): string {
  return JSON.stringify(MoneyState.parse(state), null, 2);
}

export function useMoneyState() {
  // useSyncExternalStore:hydration 安全(服务端快照 null/false),不在 effect 里同步 setState
  const state = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  const commit = useCallback((next: MoneyState) => {
    saveMoneyState(next);
  }, []);

  const reset = useCallback(() => {
    clearMoneyState();
  }, []);

  const enterDemo = useCallback(() => {
    loadDemoState();
  }, []);

  return { state, ready, commit, reset, enterDemo };
}
