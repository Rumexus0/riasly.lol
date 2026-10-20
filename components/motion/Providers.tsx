"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { LazyMotion, MotionConfig, domAnimation } from "framer-motion";

import {
  applyMotionPref,
  readMotionPref,
  writeMotionPref,
  type MotionPref,
} from "@/lib/motion-pref";

type MotionContextValue = {
  pref: MotionPref;
  choose: (pref: MotionPref) => void;
};

const MotionContext = createContext<MotionContextValue>({
  pref: "system",
  choose: () => {},
});

/** The visitor's motion choice, and the only way to change it. */
export function useMotionPref(): MotionContextValue {
  return useContext(MotionContext);
}

// Loads only the DOM animation feature set (tree-shaken) and wraps the app once
// in the root layout. It is also the single owner of the motion preference:
// framer-motion components and app/globals.css must never disagree about whether
// this page animates, so both are driven from the state right below.
export default function Providers({ children }: { children: React.ReactNode }) {
  // "system" on the server AND on the client's first render — reading storage in
  // the initializer would desync hydration. The pre-paint script in
  // app/layout.tsx has already put the right html[data-motion] on the document
  // for CSS, so nothing flashes; this effect only has to catch framer-motion up.
  const [pref, setPref] = useState<MotionPref>("system");

  useEffect(() => {
    const stored = readMotionPref();
    // Re-assert the attribute in case the script was blocked (a future CSP, for
    // instance): the preference still applies, one frame later than ideal.
    applyMotionPref(stored);
    setPref(stored);
  }, []);

  const choose = useCallback((next: MotionPref) => {
    writeMotionPref(next);
    applyMotionPref(next);
    setPref(next);
  }, []);

  const value = useMemo(() => ({ pref, choose }), [pref, choose]);

  const reducedMotion =
    pref === "force" ? "never" : pref === "calm" ? "always" : "user";

  return (
    <MotionContext.Provider value={value}>
      <MotionConfig reducedMotion={reducedMotion}>
        <LazyMotion features={domAnimation} strict>
          {children}
        </LazyMotion>
      </MotionConfig>
    </MotionContext.Provider>
  );
}
