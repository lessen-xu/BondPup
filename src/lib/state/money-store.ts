"use client";

import { useCallback, useSyncExternalStore } from "react";
import { MoneyState } from "@/contracts";
import { cycleAfter, mockMoneyState } from "@/lib/mock/money-state";

/**
 * 前端 localStorage 是 MoneyState 的真源;服务端不持久化。
 * 只存必要结构化状态与短摘要(长度上限在 contracts 层强制),
 * 不存真实姓名/证件/银行账户/完整倾诉原文。
 * 聊钱对话仅保留用户侧截断片段(story.noteQuotes,≤120 字 × ≤6 条),
 * 不存狗的回复与完整对话记录——边界与用途见 contracts/story。
 */
const STORAGE_KEY = "bondpup.moneyState.v1";
const DEMO_KEY = "bondpup.moneyState.demo.v1";
const ONBOARDING_DRAFT_KEY = "onboarding-draft";

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

function readStoredState(key: string): MoneyState | null {
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    return MoneyState.parse(JSON.parse(raw));
  } catch {
    // 结构不合法(契约升级或被手改)→ 视为无状态,不崩
    return null;
  }
}

export function loadMoneyState(): MoneyState | null {
  if (typeof window === "undefined") return null;
  // 旧版本演示数据写在真实键上(同键覆盖时代的遗留)——搬回演示键,免得冒充真实数据
  const legacy = readStoredState(STORAGE_KEY);
  if (legacy?.demo) {
    window.localStorage.setItem(DEMO_KEY, JSON.stringify(legacy));
    window.localStorage.removeItem(STORAGE_KEY);
  }
  // 演示数据在独立键;存在则演示态优先(保持「演示持续到显式退出」的既有行为)
  return readStoredState(DEMO_KEY) ?? readStoredState(STORAGE_KEY);
}

export function saveMoneyState(state: MoneyState): void {
  const parsed = MoneyState.parse(state);
  // 按 demo 标志路由到各自的键:演示与真实数据物理隔离,互不覆盖
  window.localStorage.setItem(parsed.demo ? DEMO_KEY : STORAGE_KEY, JSON.stringify(parsed));
  cached = parsed;
  notify();
}

/** 附属键:不属于 MoneyState,但「清空」承诺覆盖它们(材料写的是「一键清空」,不能留尾巴)。
 *  键名与 src/lib/agent/client.ts(TRACE_KEY)、src/app/talk/page.tsx(TALK_DRAFT_KEY)保持一致 */
const AGENT_TRACE_KEY = "bondpup.agentTrace.v1";
const TALK_DRAFT_KEY = "bondpup.unfinishedTalk";

export function clearMoneyState(): void {
  // 演示态退出只删演示键,真实数据不受影响;真实态清空才删真实键
  if (window.localStorage.getItem(DEMO_KEY) !== null) {
    window.localStorage.removeItem(DEMO_KEY);
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
    // 真实态清空连附属数据一起:调用轨迹(不含用户文本)与聊天草稿(含用户输入)
    window.localStorage.removeItem(AGENT_TRACE_KEY);
    window.sessionStorage.removeItem(TALK_DRAFT_KEY);
  }
  window.sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
  cached = undefined; // 重新加载:退出演示后若有真实数据则回落到它
  notify();
}

/** 演示模式:载入合成示例(demo:true,独立键存储,退出即回落真实数据)。
 *  周期动态设为上个月:「新的一个月了」入口与周期回顾在演示里始终可见(复赛演示需求);
 *  罐子 updatedAt 一并刷成当前时间:mock 里是固定日期,放久了会越过决策页
 *  的 7 天余额新鲜度阈值(BuyDecisionFlow 的 staleBalance),把三个动作按钮
 *  整体藏掉——演示主线会断在「现在大概还剩多少」这一屏且无路可走。
 *  这里是事件时调用(enterDemo/进入 ?demo=1),不在渲染路径,允许取当前时间。 */
export function loadDemoState(): MoneyState {
  const now = new Date().toISOString();
  const demo = MoneyState.parse({
    ...mockMoneyState,
    cycle: mockMoneyState.cycle ? { ...mockMoneyState.cycle, cycle: cycleAfter(-1) } : null,
    jars: mockMoneyState.jars.map((jar) => ({ ...jar, updatedAt: now })),
  });
  saveMoneyState(demo);
  return demo;
}

/** 数据导入(配对导出,构成完整的「可复制」闭环);非法结构抛错由调用方接住 */
export function importMoneyStateJson(raw: string): MoneyState {
  const parsed = MoneyState.parse(JSON.parse(raw));
  saveMoneyState(parsed);
  return parsed;
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
