/* eslint-disable @next/next/no-img-element --
   手绘场景资产使用绝对定位与百分比尺寸,next/image 的容器约束
   会破坏舞台布局。资产已预先压缩,尺寸可控。 */
"use client";

import { useEffect, useRef, useState } from "react";
import { DOG_STATE_ASSETS, 互动姿态, type DogState } from "@/config/dog-states";
import { useDogState } from "@/lib/state/dog-state";
import { script } from "@/mock/script";
import type { 页面主体 } from "@/config/dog-states";

type DogProps = {
  page: keyof typeof 页面主体;
  state?: DogState;
  message: string | null;
  onActivate?: () => void;
  talkMode?: boolean;
  accessory?: "scarf" | "flower" | "hat" | null;
  alias?: string;
};

const visiblePokeStates = 互动姿态.filter((dogState) => dogState !== "think");

function dogImageSource(dogState: DogState) {
  return DOG_STATE_ASSETS[dogState];
}

export function Dog({ page, state, message, onActivate, talkMode = false, accessory = null, alias = "慢慢" }: DogProps) {
  const [pokeState, setPokeState] = useState<DogState | null>(null);
  const activeState = useDogState(page, state, pokeState);
  const [displayedState, setDisplayedState] = useState(activeState);
  const [previousState, setPreviousState] = useState<DogState | null>(null);
  const [pokeCount, setPokeCount] = useState(0);
  const [pokeMessage, setPokeMessage] = useState<string | null>(null);
  const fadeTimer = useRef<number | null>(null);
  const stateUpdateTimer = useRef<number | null>(null);
  const pokeStateTimer = useRef<number | null>(null);
  const activateTimer = useRef<number | null>(null);
  const pokePoseIndex = useRef(0);

  useEffect(() => {
    if (activeState === displayedState) return;
    if (stateUpdateTimer.current) window.clearTimeout(stateUpdateTimer.current);
    stateUpdateTimer.current = window.setTimeout(() => {
      setPreviousState(displayedState);
      setDisplayedState(activeState);
      stateUpdateTimer.current = null;
      if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
      fadeTimer.current = window.setTimeout(() => {
        setPreviousState(null);
        fadeTimer.current = null;
      }, 150);
    }, 0);
    return () => {
      if (stateUpdateTimer.current) {
        window.clearTimeout(stateUpdateTimer.current);
        stateUpdateTimer.current = null;
      }
    };
  }, [activeState, displayedState]);

  useEffect(() => () => {
    if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
    if (stateUpdateTimer.current) window.clearTimeout(stateUpdateTimer.current);
    if (pokeStateTimer.current) window.clearTimeout(pokeStateTimer.current);
    if (activateTimer.current) window.clearTimeout(activateTimer.current);
  }, []);

  function triggerPokePose() {
    const nextState = visiblePokeStates[pokePoseIndex.current % visiblePokeStates.length];
    pokePoseIndex.current += 1;
    setPokeState(nextState);
    if (pokeStateTimer.current) window.clearTimeout(pokeStateTimer.current);
    pokeStateTimer.current = window.setTimeout(() => {
      setPokeState(null);
      pokeStateTimer.current = null;
    }, 700);
  }

  function handleClick() {
    triggerPokePose();
    if (onActivate) {
      if (activateTimer.current) return;
      activateTimer.current = window.setTimeout(() => {
        activateTimer.current = null;
        onActivate();
      }, 300);
      return;
    }
    if (!talkMode) return;
    const nextCount = pokeCount + 1;
    setPokeCount(nextCount);
    if (nextCount >= 3) {
      const responses = script.home.pokeResponses;
      setPokeMessage(responses[Math.floor(Math.random() * responses.length)]);
      setPokeCount(0);
      window.setTimeout(() => setPokeMessage(null), 1500);
    }
  }

  return (
    <div className="dog">
      {message && <p className="dog-message-bubble">{message}</p>}
      {pokeMessage && <p className="poke-bubble" aria-live="polite">{pokeMessage}</p>}
      <button className="dog-hit-area" type="button" onClick={handleClick} aria-label={`和${alias}说话`}>
        <span className="dog-breathe">
          <span className={`dog-react dog-react-${displayedState}`}>
            <span className="dog-state-frame">
              {previousState && <img className={`dog-state-image dog-state-${previousState} dog-state-image-previous`} src={dogImageSource(previousState)} alt="" aria-hidden="true" />}
              <img key={displayedState} className={`dog-state-image dog-state-${displayedState} dog-state-image-current`} src={dogImageSource(displayedState)} alt={alias} />
              {accessory && <img className={`dog-accessory dog-accessory-${accessory}`} src={`/assets/配饰${accessory === "scarf" ? "围巾" : accessory === "flower" ? "小花" : "帽子"}.png`} alt="" aria-hidden="true" />}
            </span>
          </span>
        </span>
      </button>
    </div>
  );
}
