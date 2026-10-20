// riasly — client hook that keeps an author-chosen background media looping even
// when the source ignores the `loop` attribute (safari/end-of-file quirks).
"use client";

import { useCallback, useRef } from "react";

/**
 * Keeps an author-chosen background loop running forever.
 *
 * The `loop` attribute covers normal playback; the handlers below are
 * belt-and-braces for engines that ignore it, stall mid-buffer, or pause the
 * element while the tab is hidden. `play()` rejections (autoplay policies,
 * detached nodes) are swallowed, and the pause retry is bounded so a legitimate
 * pause can never turn into an infinite play/pause fight.
 */
export function useKeepPlaying<T extends HTMLVideoElement>() {
  const ref = useRef<T>(null);
  const tries = useRef(0);

  const keepPlaying = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const p = el.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }, []);

  const keepPlayingProps = {
    ref,
    onEnded: keepPlaying,
    onStalled: keepPlaying,
    onPlaying: () => {
      tries.current = 0;
    },
    onPause: () => {
      if (tries.current++ < 3) keepPlaying();
    },
  };

  return { ref, keepPlaying, keepPlayingProps };
}
