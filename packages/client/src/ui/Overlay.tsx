import type { GameState, GameModeConfig, EndReason } from "@tomino/shared";
import { formatTime } from "./formatTime.js";

export interface OverlayProps {
  state: GameState;
  modeConfig: GameModeConfig;
  onResume: () => void;
  onPlayAgain: () => void;
  onQuit: () => void;
  onOpenSettings?: () => void;
}

function endReasonText(reason: EndReason | undefined, mode: string): string {
  switch (reason) {
    case "topOut":
      return "TOP OUT";
    case "goalReached":
      if (mode === "sprint") return "SPRINT COMPLETE!";
      if (mode === "ultra") return "TIME'S UP!";
      return "GOAL REACHED!";
    case "quit":
      return "GAME QUIT";
    default:
      return "GAME OVER";
  }
}

function PauseOverlay({
  onResume,
  onQuit,
  onOpenSettings,
}: {
  onResume: () => void;
  onQuit: () => void;
  onOpenSettings?: () => void;
}) {
  return (
    <div className="overlay" data-testid="pause-overlay">
      <div className="overlay-content">
        <h2 className="overlay-title">PAUSED</h2>
        <div className="overlay-buttons">
          <button className="overlay-btn" onClick={onResume}>RESUME</button>
          {onOpenSettings && (
            <button
              className="overlay-btn overlay-btn-secondary"
              data-testid="pause-settings-btn"
              onClick={onOpenSettings}
            >
              SETTINGS
            </button>
          )}
          <button className="overlay-btn overlay-btn-secondary" onClick={onQuit}>QUIT</button>
        </div>
      </div>
    </div>
  );
}

function GameOverOverlay({
  state,
  modeConfig,
  onPlayAgain,
}: {
  state: GameState;
  modeConfig: GameModeConfig;
  onPlayAgain: () => void;
}) {
  const title = endReasonText(state.endReason, modeConfig.mode);

  const isSprintComplete = modeConfig.mode === "sprint" && state.endReason === "goalReached";
  const isUltra = modeConfig.mode === "ultra";

  return (
    <div className="overlay" data-testid="gameover-overlay">
      <div className="overlay-content">
        <h2 className="overlay-title">{title}</h2>
        <div className="overlay-stats">
          {isSprintComplete && (
            <div className="overlay-stat highlight">
              <span className="stat-label">TIME</span>
              <span className="stat-value">{formatTime(state.elapsedMs)}</span>
            </div>
          )}
          {isUltra && (
            <div className="overlay-stat highlight">
              <span className="stat-label">SCORE</span>
              <span className="stat-value">{state.scoring.score.toLocaleString()}</span>
            </div>
          )}
          {!isUltra && (
            <div className="overlay-stat">
              <span className="stat-label">SCORE</span>
              <span className="stat-value">{state.scoring.score.toLocaleString()}</span>
            </div>
          )}
          <div className="overlay-stat">
            <span className="stat-label">LINES</span>
            <span className="stat-value">{state.scoring.lines}</span>
          </div>
          <div className="overlay-stat">
            <span className="stat-label">LEVEL</span>
            <span className="stat-value">{state.scoring.level}</span>
          </div>
          {!isSprintComplete && (
            <div className="overlay-stat">
              <span className="stat-label">TIME</span>
              <span className="stat-value">{formatTime(state.elapsedMs)}</span>
            </div>
          )}
        </div>
        <div className="overlay-buttons">
          <button className="overlay-btn" onClick={onPlayAgain}>PLAY AGAIN</button>
        </div>
      </div>
    </div>
  );
}

export function Overlay({ state, modeConfig, onResume, onPlayAgain, onQuit, onOpenSettings }: OverlayProps) {
  if (state.status === "paused") {
    return <PauseOverlay onResume={onResume} onQuit={onQuit} onOpenSettings={onOpenSettings} />;
  }

  if (state.status === "gameOver") {
    return <GameOverOverlay state={state} modeConfig={modeConfig} onPlayAgain={onPlayAgain} />;
  }

  return null;
}
