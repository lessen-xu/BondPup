"use client";

import { useEffect, useSyncExternalStore } from "react";
import { 互动触发, 页面主体, type DogState } from "@/config/dog-states";

type DogSnapshot = { interaction: DogState | null; thinking: boolean };

const initialSnapshot: DogSnapshot = { interaction: null, thinking: false };
let snapshot = initialSnapshot;
const listeners = new Set<() => void>();

function emit(next: DogSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setInteraction(interaction: DogState | null) {
  if (snapshot.interaction !== interaction) emit({ ...snapshot, interaction });
}

export function setDogThinking(thinking: boolean) {
  if (snapshot.thinking !== thinking) emit({ ...snapshot, thinking });
}

export function useDogState(page: keyof typeof 页面主体, override?: DogState, pokeState?: DogState | null) {
  const current = useSyncExternalStore(subscribe, () => snapshot, () => initialSnapshot);
  const pageInteraction = page === "对话"
    ? 互动触发.开始对话
    : page === "回看"
      ? 互动触发.进入回看
      : null;

  useEffect(() => {
    const timer = window.setTimeout(() => setInteraction(pageInteraction), 0);
    return () => {
      window.clearTimeout(timer);
      if (snapshot.interaction === pageInteraction) setInteraction(null);
    };
  }, [pageInteraction]);

  if (current.thinking) return 互动触发.等待模型;
  return override ?? pokeState ?? current.interaction ?? pageInteraction ?? 页面主体[page];
}

/*
 * 不得因以下任何情况切换状态：
 * - 用户选了「这次先不买」或「放到明天」
 * - 存了钱 / 没存钱 / 花得多 / 花得少
 * - 连续登录天数、缺席时长、久未打开
 * - 罐子余额高低、目标完成进度
 * - 任何可被解读为「做得好 / 做得不好」的判断
 */
