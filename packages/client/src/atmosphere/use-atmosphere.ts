/**
 * React bindings for the AtmosphereEngine.
 *
 * Provides <AtmosphereProvider>, useAtmosphere() for readers, and
 * useAtmosphereUpdater() for the game loop to push signals each tick.
 *
 * In dev/test builds, the latest state is mirrored onto
 * window.__atmosphere__ so e2e tests can poll it without DOM introspection.
 */

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AtmosphereEngine } from "./atmosphere-engine.js";
import type { AtmosphereState, GameSignals } from "./types.js";
import { INITIAL_ATMOSPHERE_STATE } from "./types.js";

interface AtmosphereContextValue {
  state: AtmosphereState;
  update: (signals: GameSignals) => AtmosphereState;
  reset: () => void;
  signalsRef: { current: GameSignals | null };
}

const AtmosphereContext = createContext<AtmosphereContextValue | null>(null);

/** True for vitest runs and `vite dev`; false in production bundles. */
function isDevOrTest(): boolean {
  try {
    const env = (import.meta as unknown as { env?: Record<string, unknown> })
      .env;
    if (!env) return false;
    return env.DEV === true || env.MODE === "test";
  } catch {
    return false;
  }
}

declare global {
  interface Window {
    __atmosphere__?: AtmosphereState;
  }
}

export interface AtmosphereProviderProps {
  children: ReactNode;
}

export function AtmosphereProvider({ children }: AtmosphereProviderProps) {
  const engineRef = useRef<AtmosphereEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new AtmosphereEngine();
  }
  const [state, setState] = useState<AtmosphereState>(INITIAL_ATMOSPHERE_STATE);
  const signalsRef = useRef<GameSignals | null>(null);

  const update = useCallback((signals: GameSignals): AtmosphereState => {
    const engine = engineRef.current!;
    const prev = engine.getState();
    const next = engine.update(signals);
    signalsRef.current = signals;

    const changed =
      next.events.length > 0 ||
      Math.abs(next.intensity - prev.intensity) > 0.001 ||
      Math.abs(next.danger - prev.danger) > 0.001 ||
      Math.abs(next.momentum - prev.momentum) > 0.001 ||
      next.flow.active !== prev.flow.active ||
      Math.abs(next.flow.level - prev.flow.level) > 0.01;

    if (isDevOrTest() && typeof window !== "undefined") {
      window.__atmosphere__ = next;
    }

    if (changed) {
      setState(next);
    }
    return next;
  }, []);

  const reset = useCallback(() => {
    engineRef.current!.reset();
    signalsRef.current = null;
    setState(INITIAL_ATMOSPHERE_STATE);
    if (isDevOrTest() && typeof window !== "undefined") {
      window.__atmosphere__ = INITIAL_ATMOSPHERE_STATE;
    }
  }, []);

  const value = useMemo<AtmosphereContextValue>(
    () => ({ state, update, reset, signalsRef }),
    [state, update, reset],
  );

  // Clean up the dev/test global when the provider unmounts so stale state
  // from a previous test isn't observed by the next one.
  useEffect(() => {
    return () => {
      if (isDevOrTest() && typeof window !== "undefined") {
        delete window.__atmosphere__;
      }
    };
  }, []);

  return createElement(AtmosphereContext.Provider, { value }, children);
}

export function useAtmosphere(): AtmosphereState {
  const ctx = useContext(AtmosphereContext);
  if (!ctx) {
    throw new Error("useAtmosphere must be used inside <AtmosphereProvider>");
  }
  return ctx.state;
}

export function useAtmosphereUpdater(): (
  signals: GameSignals,
) => AtmosphereState {
  const ctx = useContext(AtmosphereContext);
  if (!ctx) {
    throw new Error(
      "useAtmosphereUpdater must be used inside <AtmosphereProvider>",
    );
  }
  return ctx.update;
}

export function useLatestSignalsRef(): { current: GameSignals | null } {
  const ctx = useContext(AtmosphereContext);
  if (!ctx) {
    throw new Error(
      "useLatestSignalsRef must be used inside <AtmosphereProvider>",
    );
  }
  return ctx.signalsRef;
}

export function useAtmosphereReset(): () => void {
  const ctx = useContext(AtmosphereContext);
  if (!ctx) {
    throw new Error(
      "useAtmosphereReset must be used inside <AtmosphereProvider>",
    );
  }
  return ctx.reset;
}
