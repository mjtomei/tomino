import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { BOARD_WIDTH, VISIBLE_HEIGHT } from "@tetris/shared";
import type { RuleSet, GameModeConfig, GameState, GarbageBatch, InputAction } from "@tetris/shared";
import { TetrisEngine, modernRuleSet } from "@tetris/shared";
import { BoardCanvas } from "./BoardCanvas.js";
import type { HandicapIndicatorData } from "./HandicapIndicator.js";
import { ScoreDisplay } from "./ScoreDisplay.js";
import { NextQueue } from "./NextQueue.js";
import { HoldDisplay } from "./HoldDisplay.js";
import { HandicapIndicator } from "./HandicapIndicator.js";
import { GarbageMeter } from "./GarbageMeter.js";
import { Overlay } from "./Overlay.js";
import { StartScreen } from "./StartScreen.js";
import { SoundManager } from "../audio/sounds.js";
import type { SoundEvent } from "../audio/sounds.js";
import { useTheme } from "../atmosphere/theme-context.js";
import type { GameClient } from "../net/game-client.js";
import { useAtmosphereUpdater, useAtmosphereReset } from "../atmosphere/use-atmosphere.js";
import { useMusicSync } from "../audio/use-music.js";
import { gameStateToSignals } from "../atmosphere/signals.js";
import { ParticleSystem } from "../atmosphere/particle-system.js";
import { ParticleCanvas } from "../atmosphere/ParticleCanvas.js";
import { BoardEffects } from "../atmosphere/board-effects.js";
import { EventBurstCanvas } from "../atmosphere/EventBurstCanvas.js";
import { MULTIPLAYER_MODE_CONFIG } from "../engine/engine-proxy.js";
import { snapshotToGameState } from "../net/snapshot-adapter.js";
import "./GameShell.css";

const BOARD_EFFECTS_CELL_SIZE = 30;
const BOARD_EFFECTS_WIDTH = BOARD_WIDTH * BOARD_EFFECTS_CELL_SIZE;
const BOARD_EFFECTS_HEIGHT = VISIBLE_HEIGHT * BOARD_EFFECTS_CELL_SIZE;

declare global {
  interface Window {
    __boardEffects__?: { count: number; lastEvents: unknown[] };
  }
}

function isBoardEffectsDev(): boolean {
  try {
    const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
    if (!env) return false;
    return env.DEV === true || env.MODE === "test";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Key bindings
// ---------------------------------------------------------------------------

const KEY_MAP: Record<string, string> = {
  ArrowLeft: "moveLeft",
  ArrowRight: "moveRight",
  ArrowDown: "softDrop",
  ArrowUp: "rotateCW",
  KeyZ: "rotateCCW",
  KeyX: "rotateCW",
  KeyC: "hold",
  ShiftLeft: "hold",
  ShiftRight: "hold",
  Space: "hardDrop",
  Escape: "pause",
  KeyP: "pause",
};

// ---------------------------------------------------------------------------
// Sound diffing
// ---------------------------------------------------------------------------

function detectSoundEvents(prev: GameState | null, curr: GameState): SoundEvent[] {
  if (!prev) return [];
  const events: SoundEvent[] = [];

  if (curr.status === "gameOver" && prev.status !== "gameOver") {
    events.push("gameOver");
    return events;
  }

  // Line clear
  const linesDiff = curr.scoring.lines - prev.scoring.lines;
  if (linesDiff > 0) {
    const key = `lineClear${Math.min(linesDiff, 4)}` as SoundEvent;
    events.push(key);
  }

  // Level up
  if (curr.scoring.level > prev.scoring.level) {
    events.push("levelUp");
  }

  // Piece lock: detect via queue shift (next piece consumed from queue).
  // Comparing piece type alone misses locks when consecutive pieces share a type.
  const queueShifted =
    prev.queue.length > 0 &&
    curr.queue.length > 0 &&
    prev.queue[prev.queue.length - 1] !== curr.queue[curr.queue.length - 1];
  if (prev.currentPiece != null && linesDiff === 0 && queueShifted) {
    events.push("lock");
  }

  // Hold used
  if (curr.hold !== prev.hold && curr.hold != null) {
    events.push("hold");
  }

  return events;
}

// ---------------------------------------------------------------------------
// DAS/ARR state
// ---------------------------------------------------------------------------

interface DASState {
  key: string | null;
  action: string | null;
  dasTimer: number;
  arrTimer: number;
  dasTriggered: boolean;
}

/** Actions that fire once per keypress (no auto-repeat). */
const SINGLE_FIRE_ACTIONS: ReadonlySet<string> = new Set([
  "rotateCW", "rotateCCW", "hardDrop", "hold",
]);

/** Reset DAS to neutral. */
function resetDAS(): DASState {
  return { key: null, action: null, dasTimer: 0, arrTimer: 0, dasTriggered: false };
}

// ---------------------------------------------------------------------------
// GameShell
// ---------------------------------------------------------------------------

export interface GameShellProps {
  seed?: number;
  onBack?: () => void;
  /** Pending incoming garbage (multiplayer only). */
  pendingGarbage?: GarbageBatch[];
  /** Handicap indicator data. If undefined, no indicator is shown. */
  handicap?: HandicapIndicatorData;
  /** Multiplayer game client. When provided, GameShell runs in multiplayer mode. */
  gameClient?: GameClient;
}

export function GameShell({ seed, onBack, pendingGarbage, handicap, gameClient }: GameShellProps) {
  // ---------------------------------------------------------------------------
  // Multiplayer mode — delegates to GameClient for input + state
  // ---------------------------------------------------------------------------
  if (gameClient) {
    return (
      <MultiplayerGameShell
        gameClient={gameClient}
        pendingGarbage={pendingGarbage}
        handicap={handicap}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Solo mode — standalone TetrisEngine
  // ---------------------------------------------------------------------------
  return (
    <SoloGameShell
      seed={seed}
      onBack={onBack}
      pendingGarbage={pendingGarbage}
      handicap={handicap}
    />
  );
}

// ===========================================================================
// MultiplayerGameShell
// ===========================================================================

function MultiplayerGameShell({
  gameClient,
  pendingGarbage,
  handicap,
}: {
  gameClient: GameClient;
  pendingGarbage?: GarbageBatch[];
  handicap?: HandicapIndicatorData;
}) {
  const [gameState, setGameState] = useState<GameState>(() =>
    snapshotToGameState(gameClient.getRenderSnapshot(), 0),
  );
  const clientRef = useRef(gameClient);
  clientRef.current = gameClient;
  const rafRef = useRef<number>(0);
  const prevTimeRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const prevStateRef = useRef<GameState | null>(null);
  const soundRef = useRef<SoundManager | null>(null);
  const dasRef = useRef<DASState>(resetDAS());
  const firedKeysRef = useRef<Set<string>>(new Set());
  const atmosphereUpdate = useAtmosphereUpdater();
  useMusicSync(gameState.scoring.level, gameState.status);

  const { genreId, theme } = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;

  const particleSystemRef = useRef<ParticleSystem | null>(null);
  if (particleSystemRef.current == null) {
    particleSystemRef.current = new ParticleSystem({
      bounds: {
        minX: -BOARD_EFFECTS_CELL_SIZE,
        minY: -BOARD_EFFECTS_CELL_SIZE,
        maxX: BOARD_EFFECTS_WIDTH + BOARD_EFFECTS_CELL_SIZE,
        maxY: BOARD_EFFECTS_HEIGHT + BOARD_EFFECTS_CELL_SIZE,
      },
    });
  }
  const boardEffectsRef = useRef<BoardEffects | null>(null);
  if (boardEffectsRef.current == null) {
    boardEffectsRef.current = new BoardEffects({
      system: particleSystemRef.current,
      cellSize: BOARD_EFFECTS_CELL_SIZE,
      getTheme: () => themeRef.current,
    });
  }

  const mpRuleSet = useMemo(() => modernRuleSet(), []);
  const mpModeConfig = MULTIPLAYER_MODE_CONFIG;

  // Sound manager
  useEffect(() => {
    soundRef.current = new SoundManager(genreId);
    return () => {
      soundRef.current?.dispose();
      soundRef.current = null;
    };
    // Genre changes are propagated via the effect below so we don't recreate
    // the AudioContext on every theme switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    soundRef.current?.setGenreId(genreId);
  }, [genreId]);

  const sendAction = useCallback((action: string) => {
    if (VALID_INPUT_ACTIONS.has(action)) {
      clientRef.current.sendInput(action as InputAction);
    }
  }, []);

  // DAS/ARR processing for multiplayer
  const processDAS = useCallback((deltaMs: number) => {
    const das = dasRef.current;
    if (!das.key || !das.action) return;
    const action = das.action;
    if (action !== "moveLeft" && action !== "moveRight") return;

    const rSet = mpRuleSet;
    if (!das.dasTriggered) {
      das.dasTimer += deltaMs;
      if (das.dasTimer >= rSet.das) {
        das.dasTriggered = true;
        das.arrTimer = 0;
        sendAction(action);
      }
    } else {
      if (rSet.arr === 0) {
        for (let i = 0; i < 10; i++) sendAction(action);
      } else {
        das.arrTimer += deltaMs;
        while (das.arrTimer >= rSet.arr) {
          das.arrTimer -= rSet.arr;
          sendAction(action);
        }
      }
    }
  }, [sendAction, mpRuleSet]);

  // Game loop — advance tick + render predicted state
  useEffect(() => {
    startTimeRef.current = performance.now();

    const loop = (timestamp: number) => {
      if (prevTimeRef.current === 0) {
        prevTimeRef.current = timestamp;
      }
      const delta = timestamp - prevTimeRef.current;
      prevTimeRef.current = timestamp;

      processDAS(delta);
      clientRef.current.advanceTick(delta);

      const elapsedMs = timestamp - startTimeRef.current;
      const snapshot = clientRef.current.getRenderSnapshot();
      const state = snapshotToGameState(snapshot, elapsedMs);

      // Sound events
      const sounds = detectSoundEvents(prevStateRef.current, state);
      for (const s of sounds) {
        soundRef.current?.play(s);
      }

      // Board visual effects (line clear / lock / tetris)
      boardEffectsRef.current?.onFrame(prevStateRef.current, state);
      if (isBoardEffectsDev() && typeof window !== "undefined") {
        window.__boardEffects__ = {
          count: particleSystemRef.current?.count() ?? 0,
          lastEvents: boardEffectsRef.current?.debug.lastEvents ?? [],
        };
      }

      prevStateRef.current = state;

      atmosphereUpdate(
        gameStateToSignals(state, { pendingGarbage: snapshot.pendingGarbage }),
      );

      setGameState(state);

      if (!snapshot.isGameOver) {
        rafRef.current = requestAnimationFrame(loop);
      }
    };

    prevTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafRef.current);
  }, [processDAS]);

  // Keyboard handler (multiplayer — no pause)
  useEffect(() => {
    const firedKeys = firedKeysRef.current;

    const handleKeyDown = (e: KeyboardEvent) => {
      const action = KEY_MAP[e.code];
      if (!action) return;
      e.preventDefault();
      if (e.repeat) return;

      // No pause in multiplayer
      if (action === "pause") return;

      // Single-fire actions: gate through firedKeys to prevent double-fire
      if (SINGLE_FIRE_ACTIONS.has(action)) {
        if (firedKeys.has(e.code)) return;
        firedKeys.add(e.code);
      }

      // DAS for lateral movement
      if (action === "moveLeft" || action === "moveRight") {
        dasRef.current = {
          key: e.code,
          action,
          dasTimer: 0,
          arrTimer: 0,
          dasTriggered: false,
        };
      }

      // Board effect: capture hard drop intent before sending.
      if (action === "hardDrop") {
        boardEffectsRef.current?.onHardDropIntent(
          snapshotToGameState(clientRef.current.getRenderSnapshot(), 0),
        );
      }

      sendAction(action);

      // Play move/rotate sounds
      if (action === "moveLeft" || action === "moveRight") {
        soundRef.current?.play("move");
      } else if (action === "rotateCW" || action === "rotateCCW") {
        soundRef.current?.play("rotate");
      } else if (action === "hardDrop") {
        soundRef.current?.play("hardDrop");
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      firedKeys.delete(e.code);
      const das = dasRef.current;
      if (das.key === e.code) {
        dasRef.current = resetDAS();
      }
    };

    const handleBlur = () => {
      firedKeys.clear();
      dasRef.current = resetDAS();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      firedKeys.clear();
    };
  }, [sendAction]);

  return (
    <div className="game-shell" data-testid="game-shell">
      <div className="game-layout">
        <div className="game-left-panel">
          <HoldDisplay hold={gameState.hold} holdUsed={gameState.holdUsed} ruleSet={mpRuleSet} />
          <ScoreDisplay scoring={gameState.scoring} modeConfig={mpModeConfig} elapsedMs={gameState.elapsedMs} />
          {handicap && <HandicapIndicator handicap={handicap} />}
        </div>

        <div className="game-board-container" data-testid="game-board">
          {pendingGarbage && pendingGarbage.length > 0 && (
            <GarbageMeter pendingGarbage={pendingGarbage} cellSize={30} />
          )}
          <BoardCanvas state={gameState} showSidePanels={false} />
          <ParticleCanvas
            system={particleSystemRef.current!}
            width={BOARD_EFFECTS_WIDTH}
            height={BOARD_EFFECTS_HEIGHT}
          />
          <EventBurstCanvas width={BOARD_EFFECTS_WIDTH} height={BOARD_EFFECTS_HEIGHT} />
        </div>

        <div className="game-right-panel">
          <NextQueue queue={gameState.queue} ruleSet={mpRuleSet} />
        </div>
      </div>
    </div>
  );
}

/** Valid input actions that can be sent to GameClient. */
const VALID_INPUT_ACTIONS = new Set<string>([
  "moveLeft", "moveRight", "rotateCW", "rotateCCW", "rotate180",
  "softDrop", "hardDrop", "hold",
]);

// ===========================================================================
// SoloGameShell (original logic, unchanged)
// ===========================================================================

function SoloGameShell({
  seed,
  onBack,
  pendingGarbage,
  handicap,
}: {
  seed?: number;
  onBack?: () => void;
  pendingGarbage?: GarbageBatch[];
  handicap?: HandicapIndicatorData;
}) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [ruleSet, setRuleSet] = useState<RuleSet | null>(null);
  const [modeConfig, setModeConfig] = useState<GameModeConfig | null>(null);

  const engineRef = useRef<TetrisEngine | null>(null);
  const rafRef = useRef<number>(0);
  const prevTimeRef = useRef<number>(0);
  const prevStateRef = useRef<GameState | null>(null);
  const soundRef = useRef<SoundManager | null>(null);
  const dasRef = useRef<DASState>(resetDAS());
  const firedKeysRef = useRef<Set<string>>(new Set());

  const atmosphereUpdate = useAtmosphereUpdater();
  const atmosphereReset = useAtmosphereReset();
  useMusicSync(gameState?.scoring.level ?? 1, gameState?.status);
  const { genreId: soloGenreId, theme: soloTheme } = useTheme();
  const themeRef = useRef(soloTheme);
  themeRef.current = soloTheme;

  const particleSystemRef = useRef<ParticleSystem | null>(null);
  if (particleSystemRef.current == null) {
    particleSystemRef.current = new ParticleSystem({
      bounds: {
        minX: -BOARD_EFFECTS_CELL_SIZE,
        minY: -BOARD_EFFECTS_CELL_SIZE,
        maxX: BOARD_EFFECTS_WIDTH + BOARD_EFFECTS_CELL_SIZE,
        maxY: BOARD_EFFECTS_HEIGHT + BOARD_EFFECTS_CELL_SIZE,
      },
    });
  }
  const boardEffectsRef = useRef<BoardEffects | null>(null);
  if (boardEffectsRef.current == null) {
    boardEffectsRef.current = new BoardEffects({
      system: particleSystemRef.current,
      cellSize: BOARD_EFFECTS_CELL_SIZE,
      getTheme: () => themeRef.current,
    });
  }

  // Initialize sound manager
  useEffect(() => {
    soundRef.current = new SoundManager(soloGenreId);
    return () => {
      soundRef.current?.dispose();
      soundRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    soundRef.current?.setGenreId(soloGenreId);
  }, [soloGenreId]);

  // Start a new game
  const startGame = useCallback((rs: RuleSet, mc: GameModeConfig) => {
    setRuleSet(rs);
    setModeConfig(mc);

    const engine = new TetrisEngine({
      ruleSet: rs,
      modeConfig: mc,
      seed: seed ?? Math.floor(Math.random() * 2 ** 32),
    });
    engine.start();
    engineRef.current = engine;
    prevStateRef.current = null;
    dasRef.current = resetDAS();
    firedKeysRef.current.clear();
    atmosphereReset();
    boardEffectsRef.current?.clear();

    setGameState(engine.getState());
  }, [seed, atmosphereReset]);

  // Return to start screen
  const handlePlayAgain = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    engineRef.current = null;
    setGameState(null);
    setRuleSet(null);
    setModeConfig(null);
  }, []);

  const handleResume = useCallback(() => {
    engineRef.current?.resume();
  }, []);

  const handleQuit = useCallback(() => {
    engineRef.current?.quit();
  }, []);

  // Game loop
  useEffect(() => {
    if (!engineRef.current || !gameState) return;
    if (gameState.status === "gameOver") return;

    const loop = (timestamp: number) => {
      const engine = engineRef.current;
      if (!engine) return;

      if (prevTimeRef.current === 0) {
        prevTimeRef.current = timestamp;
      }

      const delta = timestamp - prevTimeRef.current;
      prevTimeRef.current = timestamp;

      // DAS/ARR processing
      if (engine.getState().status === "playing") {
        processDAS(engine, delta);
      }

      const state = engine.tick(delta);

      // Sound events
      const sounds = detectSoundEvents(prevStateRef.current, state);
      for (const s of sounds) {
        soundRef.current?.play(s);
      }

      // Board visual effects (line clear / lock / tetris)
      boardEffectsRef.current?.onFrame(prevStateRef.current, state);
      if (isBoardEffectsDev() && typeof window !== "undefined") {
        window.__boardEffects__ = {
          count: particleSystemRef.current?.count() ?? 0,
          lastEvents: boardEffectsRef.current?.debug.lastEvents ?? [],
        };
      }

      prevStateRef.current = state;

      // Atmosphere engine feed (solo mode).
      atmosphereUpdate(
        gameStateToSignals(state, {
          pendingGarbage,
          lastLineClear: engine.consumeLineClearEvent(),
        }),
      );

      setGameState(state);

      if (state.status !== "gameOver") {
        rafRef.current = requestAnimationFrame(loop);
      }
    };

    prevTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafRef.current);
  }, [gameState?.status]);

  // DAS/ARR processing
  const processDAS = (engine: TetrisEngine, deltaMs: number) => {
    const das = dasRef.current;
    if (!das.key || !das.action) return;

    const rSet = engine.ruleSet;
    const action = das.action;

    if (action !== "moveLeft" && action !== "moveRight") return;

    if (!das.dasTriggered) {
      das.dasTimer += deltaMs;
      if (das.dasTimer >= rSet.das) {
        das.dasTriggered = true;
        das.arrTimer = 0;
        executeAction(engine, action);
      }
    } else {
      if (rSet.arr === 0) {
        // Instant: move to wall
        for (let i = 0; i < 10; i++) {
          executeAction(engine, action);
        }
      } else {
        das.arrTimer += deltaMs;
        while (das.arrTimer >= rSet.arr) {
          das.arrTimer -= rSet.arr;
          executeAction(engine, action);
        }
      }
    }
  };

  const executeAction = (engine: TetrisEngine, action: string) => {
    switch (action) {
      case "moveLeft": engine.moveLeft(); break;
      case "moveRight": engine.moveRight(); break;
      case "softDrop": engine.softDrop(); break;
      case "hardDrop": engine.hardDrop(); break;
      case "rotateCW": engine.rotateCW(); break;
      case "rotateCCW": engine.rotateCCW(); break;
      case "hold": engine.hold(); break;
    }
  };

  // Keyboard handler
  useEffect(() => {
    const firedKeys = firedKeysRef.current;

    const handleKeyDown = (e: KeyboardEvent) => {
      const action = KEY_MAP[e.code];
      if (!action) return;
      e.preventDefault();
      if (e.repeat) return;

      const engine = engineRef.current;
      if (!engine) return;

      const status = engine.getState().status;

      // Pause toggle
      if (action === "pause") {
        if (status === "playing") engine.pause();
        else if (status === "paused") engine.resume();
        setGameState(engine.getState());
        return;
      }

      if (status !== "playing") return;

      // Single-fire actions: gate through firedKeys to prevent double-fire
      if (SINGLE_FIRE_ACTIONS.has(action)) {
        if (firedKeys.has(e.code)) return;
        firedKeys.add(e.code);
      }

      // DAS for lateral movement
      if (action === "moveLeft" || action === "moveRight") {
        dasRef.current = {
          key: e.code,
          action,
          dasTimer: 0,
          arrTimer: 0,
          dasTriggered: false,
        };
      }

      // Board effect: capture hard drop intent before executing.
      if (action === "hardDrop") {
        boardEffectsRef.current?.onHardDropIntent(engine.getState());
      }

      // Execute immediately
      executeAction(engine, action);

      // Play move/rotate sounds
      if (action === "moveLeft" || action === "moveRight") {
        soundRef.current?.play("move");
      } else if (action === "rotateCW" || action === "rotateCCW") {
        soundRef.current?.play("rotate");
      } else if (action === "hardDrop") {
        soundRef.current?.play("hardDrop");
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      firedKeys.delete(e.code);
      const das = dasRef.current;
      if (das.key === e.code) {
        dasRef.current = resetDAS();
      }
    };

    const handleBlur = () => {
      firedKeys.clear();
      dasRef.current = resetDAS();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      firedKeys.clear();
    };
  }, []);

  // Show start screen if no game active
  if (!gameState || !ruleSet || !modeConfig) {
    return (
      <div className="game-shell">
        {onBack && (
          <button className="back-btn" onClick={onBack} data-testid="back-btn">
            &larr; Back
          </button>
        )}
        <StartScreen onStart={startGame} />
      </div>
    );
  }

  return (
    <div className="game-shell" data-testid="game-shell">
      {onBack && (
        <button className="back-btn" onClick={onBack} data-testid="back-btn">
          &larr; Back
        </button>
      )}
      <div className="game-layout">
        <div className="game-left-panel">
          <HoldDisplay hold={gameState.hold} holdUsed={gameState.holdUsed} ruleSet={ruleSet} />
          <ScoreDisplay scoring={gameState.scoring} modeConfig={modeConfig} elapsedMs={gameState.elapsedMs} />
          {handicap && <HandicapIndicator handicap={handicap} />}
        </div>

        <div className="game-board-container" data-testid="game-board">
          {pendingGarbage && pendingGarbage.length > 0 && (
            <GarbageMeter pendingGarbage={pendingGarbage} cellSize={30} />
          )}
          <BoardCanvas state={gameState} showSidePanels={false} />
          <ParticleCanvas
            system={particleSystemRef.current!}
            width={BOARD_EFFECTS_WIDTH}
            height={BOARD_EFFECTS_HEIGHT}
          />
          <EventBurstCanvas width={BOARD_EFFECTS_WIDTH} height={BOARD_EFFECTS_HEIGHT} />
          <Overlay
            state={gameState}
            modeConfig={modeConfig}
            onResume={handleResume}
            onPlayAgain={handlePlayAgain}
            onQuit={handleQuit}
          />
        </div>

        <div className="game-right-panel">
          <NextQueue queue={gameState.queue} ruleSet={ruleSet} />
        </div>
      </div>
    </div>
  );
}
