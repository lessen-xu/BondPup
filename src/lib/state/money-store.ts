"use client";

import { useCallback, useEffect, useState } from "react";
import { MoneyState } from "@/contracts";
import { mockMoneyState } from "@/lib/mock/money-state";

/**
 * 前端 localStorage 是 MoneyState 的真源;服务端不持久化。
 * 只存必要结构化状态与短摘要,不存真实姓名/证件/银行账户/完整倾诉原文。
 */
const STORAGE_KEY = "bondpup.moneyState.v1";

export function loadMoneyState(): MoneyState | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return MoneyState.parse(JSON.parse(raw));
  } catch {
    // 结构不合法(契约升级或被手改)→ 视为无状态,不崩
    return null;
  }
}

export function saveMoneyState(state: MoneyState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(MoneyState.parse(state)));
}

export function clearMoneyState(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

/** 演示模式:载入合成示例(demo:true,与真实数据同键互斥,清空即退出) */
export function loadDemoState(): MoneyState {
  const demo = MoneyState.parse({ ...mockMoneyState });
  saveMoneyState(demo);
  return demo;
}

export function useMoneyState() {
  const [state, setState] = useState<MoneyState | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(loadMoneyState());
    setReady(true);
  }, []);

  const commit = useCallback((next: MoneyState) => {
    saveMoneyState(next);
    setState(next);
  }, []);

  const reset = useCallback(() => {
    clearMoneyState();
    setState(null);
  }, []);

  const enterDemo = useCallback(() => {
    setState(loadDemoState());
  }, []);

  return { state, ready, commit, reset, enterDemo };
}
