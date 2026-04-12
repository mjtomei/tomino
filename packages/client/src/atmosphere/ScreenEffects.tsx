/**
 * ScreenEffects — wraps the game layout with danger vignette, screen
 * shake, and line-clear flash overlays. Effects are driven by the
 * atmosphere engine for continuous state (danger) and discrete events
 * (lineClear, garbageReceived); hard-drop shake is triggered
 * imperatively by GameShell via `useScreenEffectsTrigger`.
 */

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAtmosphere } from "./use-atmosphere.js";
import { useTheme } from "./theme-context.js";
import {
  computeVignetteOpacity,
  computeVignetteColor,
  computeShakeMagnitude,
  computeFlashOpacity,
  decayTransient,
  SHAKE_HALF_LIFE_MS,
  FLASH_HALF_LIFE_MS,
} from "./screen-effects.js";

export interface ScreenEffectsHandle {
  triggerHardDropShake(): void;
}

interface ScreenEffectsContextValue {
  triggerHardDropShake(): void;
}

const ScreenEffectsContext = createContext<ScreenEffectsContextValue | null>(null);

export function useScreenEffectsTrigger(): ScreenEffectsContextValue {
  return (
    useContext(ScreenEffectsContext) ?? {
      triggerHardDropShake: () => {},
    }
  );
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export interface ScreenEffectsProps {
  children: ReactNode;
}

export const ScreenEffects = forwardRef<ScreenEffectsHandle, ScreenEffectsProps>(
  function ScreenEffects({ children }, ref) {
    const atmosphere = useAtmosphere();
    const { theme } = useTheme();
    const reducedMotion = useMemo(prefersReducedMotion, []);

    // Transient effect values, mutated by RAF without re-rendering
    // every frame — we only setState when values change materially.
    const shakeRef = useRef(0);
    const flashRef = useRef(0);
    const [, forceRender] = useState(0);
    const lastFrameRef = useRef<number>(0);
    const rafRef = useRef<number>(0);

    // Apply atmosphere events to transient channels.
    useEffect(() => {
      if (atmosphere.events.length === 0) return;
      let shakeBump = 0;
      let flashBump = 0;
      for (const e of atmosphere.events) {
        if (e.type === "lineClear" || e.type === "tetris" || e.type === "tSpin") {
          flashBump = Math.max(flashBump, computeFlashOpacity(e.magnitude));
        }
        if (e.type === "garbageReceived") {
          shakeBump = Math.max(
            shakeBump,
            computeShakeMagnitude("garbageReceived", e.magnitude),
          );
        }
      }
      if (shakeBump > shakeRef.current) shakeRef.current = shakeBump;
      if (flashBump > flashRef.current) flashRef.current = flashBump;
      if (shakeBump > 0 || flashBump > 0) forceRender((n) => (n + 1) & 0xffff);
    }, [atmosphere.events]);

    const triggerHardDropShake = useCallback(() => {
      const m = computeShakeMagnitude("hardDrop", 1);
      if (m > shakeRef.current) shakeRef.current = m;
      forceRender((n) => (n + 1) & 0xffff);
    }, []);

    useImperativeHandle(
      ref,
      () => ({ triggerHardDropShake }),
      [triggerHardDropShake],
    );

    // Decay loop. Runs only while a transient value is non-zero.
    useEffect(() => {
      const tick = (timestamp: number) => {
        if (lastFrameRef.current === 0) lastFrameRef.current = timestamp;
        const dt = timestamp - lastFrameRef.current;
        lastFrameRef.current = timestamp;

        shakeRef.current = decayTransient(shakeRef.current, dt, SHAKE_HALF_LIFE_MS);
        flashRef.current = decayTransient(flashRef.current, dt, FLASH_HALF_LIFE_MS);
        forceRender((n) => (n + 1) & 0xffff);

        if (shakeRef.current > 0 || flashRef.current > 0) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          lastFrameRef.current = 0;
          rafRef.current = 0;
        }
      };

      // Kick off a frame if we have pending transients and no loop running.
      if ((shakeRef.current > 0 || flashRef.current > 0) && rafRef.current === 0) {
        rafRef.current = requestAnimationFrame(tick);
      }

      return () => {
        if (rafRef.current !== 0) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
          lastFrameRef.current = 0;
        }
      };
    });

    const vignetteOpacity = computeVignetteOpacity(atmosphere.danger);
    const vignetteColor = computeVignetteColor(
      theme.palette.accent,
      atmosphere.danger,
    );

    const shakePx = reducedMotion ? 0 : shakeRef.current;
    const shakeX = shakePx > 0 ? (Math.random() * 2 - 1) * shakePx : 0;
    const shakeY = shakePx > 0 ? (Math.random() * 2 - 1) * shakePx : 0;

    const flashOpacity = reducedMotion
      ? Math.min(flashRef.current, 0.2)
      : flashRef.current;

    const contextValue = useMemo<ScreenEffectsContextValue>(
      () => ({ triggerHardDropShake }),
      [triggerHardDropShake],
    );

    return (
      <ScreenEffectsContext.Provider value={contextValue}>
        <div
          className="screen-effects-root"
          data-testid="screen-effects"
          data-vignette-opacity={vignetteOpacity.toFixed(3)}
          data-shake={shakePx.toFixed(3)}
          data-flash={flashOpacity.toFixed(3)}
          style={{ position: "relative" }}
        >
          <div
            className="screen-effects-shake"
            style={{
              transform: `translate(${shakeX.toFixed(2)}px, ${shakeY.toFixed(2)}px)`,
              willChange: shakePx > 0 ? "transform" : undefined,
            }}
          >
            {children}
          </div>

          {/* Vignette overlay — radial dark-red gradient from edges. */}
          <div
            className="screen-effects-vignette"
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              opacity: vignetteOpacity,
              background: `radial-gradient(ellipse at center, transparent 45%, ${vignetteColor} 105%)`,
              transition: "opacity 120ms linear",
            }}
          />

          {/* White flash overlay — fades out on line clear. */}
          <div
            className="screen-effects-flash"
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              opacity: flashOpacity,
              background: "#ffffff",
            }}
          />
        </div>
      </ScreenEffectsContext.Provider>
    );
  },
);
