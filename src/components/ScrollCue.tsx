"use client";

import { useEffect, useRef, useState } from "react";

export function ScrollCue({ activeKey }: { activeKey: number }) {
  const [cue, setCue] = useState({ overflow: false, top: 0, height: 0, left: 0, width: 0, bottom: 0, visible: false, atBottom: false });
  const fadeTimer = useRef<number | null>(null);

  useEffect(() => {
    const content = document.querySelector<HTMLElement>('.flow-screen:not([style*="display: none"]) .flow-content');
    if (!content) return;

    const measure = (show = false) => {
      const maxScroll = content.scrollHeight - content.clientHeight;
      const rect = content.getBoundingClientRect();
      if (maxScroll <= 1) {
        setCue((current) => ({ ...current, overflow: false, visible: false }));
        return;
      }
      const height = Math.max(18, (content.clientHeight / content.scrollHeight) * content.clientHeight);
      const top = rect.top + (content.scrollTop / maxScroll) * (content.clientHeight - height);
      setCue({ overflow: true, top, height, left: rect.right - 7, width: rect.width, bottom: rect.bottom, visible: show, atBottom: content.scrollTop >= maxScroll - 1 });
    };
    const onScroll = () => {
      measure(true);
      if (fadeTimer.current !== null) window.clearTimeout(fadeTimer.current);
      fadeTimer.current = window.setTimeout(() => setCue((current) => ({ ...current, visible: false })), 1500);
    };
    content.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(() => measure());
    observer.observe(content);
    measure(true);
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => {
      content.removeEventListener("scroll", onScroll);
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      if (fadeTimer.current !== null) window.clearTimeout(fadeTimer.current);
    };
  }, [activeKey]);

  if (!cue.overflow) return null;
  return <>
    <span className={`scroll-cue ${cue.visible ? "is-visible" : ""}`} style={{ top: cue.top, left: cue.left, height: cue.height }} aria-hidden="true" />
    <span className={`scroll-fade ${cue.atBottom ? "is-hidden" : ""}`} style={{ top: cue.bottom - 32, left: cue.left - cue.width + 7, width: cue.width - 7 }} aria-hidden="true" />
  </>;
}
