/* eslint-disable @next/next/no-img-element --
   手绘场景资产使用绝对定位与百分比尺寸,next/image 的容器约束
   会破坏舞台布局。资产已预先压缩,尺寸可控。 */
"use client";

import { useEffect, useRef, useState } from "react";
import { DOG_STATE_ASSETS, 互动姿态, type DogState } from "@/config/dog-states";
import { useDogState } from "@/lib/state/dog-state";
import { OUTFIT_ITEMS } from "@/lib/outfit-items";
import { script } from "@/mock/script";
import type { 页面主体 } from "@/config/dog-states";

type DogProps = {
  page: keyof typeof 页面主体;
  state?: DogState;
  message: string | null;
  onActivate?: () => void;
  talkMode?: boolean;
  /** 已装备的配饰 id(state.outfit.equipped);不传就是不戴 */
  outfit?: readonly string[];
  alias?: string;
};

const visiblePokeStates = 互动姿态.filter((dogState) => dogState !== "think");

function dogImageSource(dogState: DogState) {
  return DOG_STATE_ASSETS[dogState];
}

export function Dog({ page, state, message, onActivate, talkMode = false, outfit, alias = "慢慢" }: DogProps) {
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
              {/* 配饰只在 idle 姿态叠加:pos 是按 idle 立绘标的百分比,
                  其他姿态换了图且带 --dog-pose-scale(1.03~1.21),叠上去会错位。
                  首页常态就是 idle,think/ears/jump 只是一两秒的过场。 */}
              {displayedState === "idle" && outfit && outfit.length > 0 && OUTFIT_ITEMS.filter((item) => outfit.includes(item.id)).map((item) => (
                <img
                  key={item.id}
                  className="outfit-item-overlay"
                  src={item.image}
                  alt=""
                  aria-hidden="true"
                  style={{ top: item.pos.top, left: item.pos.left, width: item.pos.width, transform: item.pos.rotate ? `rotate(${item.pos.rotate})` : undefined }}
                />
              ))}
            </span>
          </span>
        </span>
      </button>
    </div>
  );
}
