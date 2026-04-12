import { useState, useEffect, useRef, useCallback } from "react";
import type { RuleSet, GameModeConfig, GameState, GameStatus } from "@tetris/shared";
import { TetrisEngine } from "@tetris/shared";
import { BoardCanvas } from "./BoardCanvas.js";
import { ScoreDisplay } from "./ScoreDisplay.js";
import { NextQueue } from "./NextQueue.js";
import { HoldDisplay } from "./HoldDisplay.js";
import { Overlay } from "./Overlay.js";
import { StartScreen } from "./StartScreen.js";
import { SoundManager } from "../audio/sounds.js";
import type { SoundEvent } from "../audio/sounds.js";
import "./GameShell.css";

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

// ---------------------------------------------------------------------------
// GameShell
// ---------------------------------------------------------------------------

export interface GameShellProps {
  seed?: number;
  onBack?: () => void;
}

export function GameShell({ seed, onBack }: GameShellProps) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [ruleSet, setRuleSet] = useState<RuleSet | null>(null);
  const [modeConfig, setModeConfig] = useState<GameModeConfig | null>(null);

  const engineRef = useRef<TetrisEngine | null>(null);
  const rafRef = useRef<number>(0);
  const prevTimeRef = useRef<number>(0);
  const prevStateRef = useRef<GameState | null>(null);
  const soundRef = useRef<SoundManager | null>(null);
  const dasRef = useRef<DASState>({ key: null, action: null, dasTimer: 0, arrTimer: 0, dasTriggered: false });
  const keysDownRef = useRef<Set<string>>(new Set());

  // Initialize sound manager
  useEffect(() => {
    soundRef.current = new SoundManager();
    return () => {
      soundRef.current?.dispose();
      soundRef.current = null;
    };
  }, []);

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
    dasRef.current = { key: null, action: null, dasTimer: 0, arrTimer: 0, dasTriggered: false };
    keysDownRef.current.clear();
    setGameState(engine.getState());
  }, [seed]);

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
      prevStateRef.current = state;

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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      const engine = engineRef.current;
      if (!engine) return;

      const action = KEY_MAP[e.code];
      if (!action) return;
      e.preventDefault();

      const status = engine.getState().status;

      // Pause toggle
      if (action === "pause") {
        if (status === "playing") engine.pause();
        else if (status === "paused") engine.resume();
        setGameState(engine.getState());
        return;
      }

      if (status !== "playing") return;

      keysDownRef.current.add(e.code);

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
      keysDownRef.current.delete(e.code);

      const das = dasRef.current;
      if (das.key === e.code) {
        dasRef.current = { key: null, action: null, dasTimer: 0, arrTimer: 0, dasTriggered: false };
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
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
        </div>

        <div className="game-board-container">
          <BoardCanvas state={gameState} />
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
