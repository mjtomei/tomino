/**
 * React bindings for the MusicEngine.
 *
 * <MusicProvider> owns a single engine instance per page. useMusic()
 * returns controls (mute, volume, genre). useMusicSync() is called from
 * the game loop each frame to push the latest level + atmosphere state
 * into the engine so it can drive layers/tempo/events.
 *
 * In dev/test builds the engine readout is mirrored on window.__music__
 * so e2e tests can poll it without DOM introspection.
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
import { MusicEngine, type MusicEngineReadout } from "./music-engine.js";
import { useAtmosphere } from "../atmosphere/use-atmosphere.js";
import { useTheme } from "../atmosphere/theme-context.js";
import type { AtmosphereState, AtmosphereEvent } from "../atmosphere/types.js";

const VOLUME_KEY = "tomino.music.volume";
const MUTED_KEY = "tomino.music.muted";

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
    __music__?: MusicEngineReadout;
  }
}

interface MusicContextValue {
  engine: MusicEngine;
  muted: boolean;
  volume: number;
  setMuted: (muted: boolean) => void;
  setVolume: (v: number) => void;
}

const MusicContext = createContext<MusicContextValue | null>(null);

function readInitialVolume(): number {
  if (typeof localStorage === "undefined") return 0.8;
  const v = localStorage.getItem(VOLUME_KEY);
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.8;
}

function readInitialMuted(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(MUTED_KEY) === "1";
}

export interface MusicProviderProps {
  children: ReactNode;
}

export function MusicProvider({ children }: MusicProviderProps) {
  const { genreId } = useTheme();
  const engineRef = useRef<MusicEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new MusicEngine(genreId);
    engineRef.current.setVolume(readInitialVolume());
    engineRef.current.setMuted(readInitialMuted());
  }
  const [muted, setMutedState] = useState<boolean>(readInitialMuted);
  const [volume, setVolumeState] = useState<number>(readInitialVolume);

  // Propagate genre changes.
  useEffect(() => {
    engineRef.current?.setGenre(genreId);
  }, [genreId]);

  const setMuted = useCallback((next: boolean) => {
    engineRef.current?.setMuted(next);
    setMutedState(next);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(MUTED_KEY, next ? "1" : "0");
    }
  }, []);

  const setVolume = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(1, next));
    engineRef.current?.setVolume(clamped);
    setVolumeState(clamped);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(VOLUME_KEY, String(clamped));
    }
  }, []);

  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
      if (isDevOrTest() && typeof window !== "undefined") {
        delete window.__music__;
      }
    };
  }, []);

  const value = useMemo<MusicContextValue>(
    () => ({ engine: engineRef.current!, muted, volume, setMuted, setVolume }),
    [muted, volume, setMuted, setVolume],
  );

  return createElement(MusicContext.Provider, { value }, children);
}

export function useMusic(): Omit<MusicContextValue, "engine"> {
  const ctx = useContext(MusicContext);
  if (!ctx) {
    throw new Error("useMusic must be used inside <MusicProvider>");
  }
  const { muted, volume, setMuted, setVolume } = ctx;
  return { muted, volume, setMuted, setVolume };
}

/**
 * Drive the music engine from the game loop.
 *
 * Call once per render in the game shell with the current game level
 * and game status. The hook reads atmosphere state from context and
 * pushes it to the engine. Music starts when status transitions to
 * "playing" and stops on pause / gameOver.
 */
export function useMusicSync(
  level: number,
  status: "playing" | "paused" | "gameOver" | "ready" | string | undefined,
): void {
  const ctx = useContext(MusicContext);
  const atmosphere = useAtmosphere();

  useEffect(() => {
    if (!ctx) return;
    if (status === "playing") {
      ctx.engine.start();
    } else {
      ctx.engine.stop();
    }
  }, [ctx, status]);

  useEffect(() => {
    if (!ctx) return;
    ctx.engine.sync(level, atmosphere);
    if (isDevOrTest() && typeof window !== "undefined") {
      window.__music__ = ctx.engine.getReadout();
    }
  }, [ctx, level, atmosphere]);
}

/**
 * Drive ambient music on non-game screens (menu/lobby/waiting/results).
 *
 * When `view` is one of the menu views, starts the engine in ambient
 * mode (attenuated master gain) and feeds it a low-intensity state so
 * only the base drone layer plays. On `playing`/`countdown`, exits
 * ambient mode and stops — GameShell's useMusicSync then owns the
 * engine for the duration of the match.
 */
const MENU_ATMOSPHERE_STATE: AtmosphereState = {
  intensity: 0.15,
  danger: 0,
  momentum: 0.05,
  flow: { active: false, level: 0, sustainedMs: 0 },
  events: [],
};

export function useMenuMusic(
  view: string | undefined,
  winnerBurst: boolean = false,
): void {
  const ctx = useContext(MusicContext);

  useEffect(() => {
    if (!ctx) return;
    const isMenu =
      view === "menu" ||
      view === "name-input" ||
      view === "joining" ||
      view === "waiting" ||
      view === "results";
    if (isMenu) {
      ctx.engine.setAmbient(true);
      ctx.engine.start();
      const entryEvents: AtmosphereEvent[] =
        view === "results" && winnerBurst
          ? [{ type: "quad", magnitude: 4 }]
          : [];
      const state: AtmosphereState =
        entryEvents.length > 0
          ? { ...MENU_ATMOSPHERE_STATE, events: entryEvents }
          : MENU_ATMOSPHERE_STATE;
      ctx.engine.sync(1, state);
      if (isDevOrTest() && typeof window !== "undefined") {
        window.__music__ = ctx.engine.getReadout();
      }
    } else {
      ctx.engine.setAmbient(false);
      ctx.engine.stop();
    }
  }, [ctx, view, winnerBurst]);
}

/**
 * Test/dev helper: feed a synthesized AtmosphereState into the engine.
 * Not used in production code; exported for debugging panels.
 */
export function driveMusicDirect(
  ctx: MusicContextValue,
  level: number,
  state: AtmosphereState,
): void {
  ctx.engine.sync(level, state);
}
