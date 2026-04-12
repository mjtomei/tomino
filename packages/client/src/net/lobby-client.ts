import { useState, useEffect, useRef, useCallback } from "react";
import type {
  GarbageBatch,
  GameStateSnapshot,
  PlayerId,
  PlayerInfo,
  PlayerStats,
  RatingChange,
  RoomState,
  RoomId,
  ErrorCode,
  TargetingStrategyType,
  TargetingSettings,
} from "@tetris/shared";
import { ClientSocket } from "./client-socket";
import {
  DEFAULT_HANDICAP_SETTINGS,
  type HandicapSettingsValues,
} from "../ui/HandicapSettings";
import { DEFAULT_TARGETING_SETTINGS } from "../ui/TargetingSettingsPanel";
import type { GameSessionData } from "./game-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LobbyView = "name-input" | "menu" | "joining" | "waiting" | "countdown" | "playing" | "results";

/** Data stored when the local player is eliminated. */
export interface EliminationData {
  placement: number;
}

/** Data stored when the game ends. */
export interface GameEndData {
  winnerId: PlayerId;
  placements: Record<PlayerId, number>;
  stats: Record<PlayerId, PlayerStats>;
  /** Rating changes per player, populated when ratingUpdate message arrives. */
  ratingChanges?: Record<PlayerId, RatingChange>;
}

/** Tracks rematch voting status. */
export interface RematchVoteData {
  /** Player IDs who have voted for rematch. */
  votes: PlayerId[];
  /** Total players who need to vote. */
  totalPlayers: number;
}

export interface PlayerTargetingState {
  strategy: TargetingStrategyType;
  targetPlayerId?: PlayerId;
}

export interface PlayerAttackPower {
  multiplier: number;
  koCount: number;
}

export interface LobbyState {
  view: LobbyView;
  room: RoomState | null;
  error: string | null;
  connectionState: "disconnected" | "connecting" | "connected";
  /** Current countdown value (3, 2, 1, 0). Null when not in countdown. */
  countdownValue: number | null;
  /** Game session data, set when gameStarted is received. */
  gameSession: GameSessionData | null;
  /** Latest snapshots for remote players, keyed by playerId. */
  opponentStates: Record<PlayerId, GameStateSnapshot>;
  /** Pending garbage for the local player (from authoritative server snapshots). */
  localPendingGarbage: GarbageBatch[];
  /** Per-player targeting state. */
  targetingStates: Record<PlayerId, PlayerTargetingState>;
  /** Per-player attack power. */
  attackPowers: Record<PlayerId, PlayerAttackPower>;
  /** Targeting settings for the current game. */
  targetingSettings: TargetingSettings | null;
  /** Set when the local player is eliminated but game continues. */
  localElimination: EliminationData | null;
  /** Set when the game ends (all but one eliminated). */
  gameEndData: GameEndData | null;
  /** Rematch vote status, set when rematch voting is in progress. */
  rematchVotes: RematchVoteData | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLAYER_NAME_KEY = "tetris-player-name";

function getDefaultServerUrl(): string {
  const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
  return `ws://${host}:3001`;
}

// ---------------------------------------------------------------------------
// Persisted player name
// ---------------------------------------------------------------------------

export function loadPlayerName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(PLAYER_NAME_KEY) ?? "";
}

export function savePlayerName(name: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PLAYER_NAME_KEY, name);
}

// ---------------------------------------------------------------------------
// Generate a per-session player ID (unique per tab)
// ---------------------------------------------------------------------------

let sessionPlayerId: string | null = null;

function getSessionPlayerId(): string {
  if (!sessionPlayerId) {
    sessionPlayerId = crypto.randomUUID();
  }
  return sessionPlayerId;
}

/** Build a PlayerInfo from the current session. */
export function makePlayerInfo(name: string): PlayerInfo {
  return { id: getSessionPlayerId(), name };
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export interface UseLobbyResult {
  state: LobbyState;
  playerName: string;
  setPlayerName: (name: string) => void;
  confirmName: (name?: string) => void;
  createRoom: () => void;
  joinRoom: (roomId: RoomId) => void;
  leaveRoom: () => void;
  requestRematch: () => void;
  startGame: () => void;
  openJoinDialog: () => void;
  closeJoinDialog: () => void;
  clearError: () => void;
  handicapSettings: HandicapSettingsValues;
  updateHandicapSettings: (settings: HandicapSettingsValues) => void;
  lobbyTargetingSettings: TargetingSettings;
  updateTargetingSettings: (settings: TargetingSettings) => void;
  setTargetingStrategy: (strategy: TargetingStrategyType) => void;
  setManualTarget: (targetPlayerId: PlayerId) => void;
  socket: ClientSocket | null;
}

export function useLobby(serverUrl?: string): UseLobbyResult {
  const url = serverUrl ?? getDefaultServerUrl();
  const socketRef = useRef<ClientSocket | null>(null);
  const [socket, setSocket] = useState<ClientSocket | null>(null);

  const [playerName, setPlayerNameRaw] = useState(loadPlayerName);
  const [state, setState] = useState<LobbyState>({
    view: loadPlayerName() ? "menu" : "name-input",
    room: null,
    error: null,
    connectionState: "disconnected",
    countdownValue: null,
    gameSession: null,
    opponentStates: {},
    localPendingGarbage: [],
    targetingStates: {},
    attackPowers: {},
    targetingSettings: null,
    localElimination: null,
    gameEndData: null,
    rematchVotes: null,
  });

  const [handicapSettings, setHandicapSettings] = useState<HandicapSettingsValues>(
    () => ({ ...DEFAULT_HANDICAP_SETTINGS }),
  );

  const [lobbyTargetingSettings, setLobbyTargetingSettings] = useState<TargetingSettings>(
    () => ({ ...DEFAULT_TARGETING_SETTINGS }),
  );

  // Keep a ref so callbacks can read latest state without re-subscribing
  const stateRef = useRef(state);
  stateRef.current = state;
  const nameRef = useRef(playerName);
  nameRef.current = playerName;
  const handicapRef = useRef(handicapSettings);
  handicapRef.current = handicapSettings;
  const targetingRef = useRef(lobbyTargetingSettings);
  targetingRef.current = lobbyTargetingSettings;

  // ---- Socket lifecycle ----
  useEffect(() => {
    const socket = new ClientSocket();
    socketRef.current = socket;
    setSocket(socket);

    socket.onConnection((connState) => {
      setState((prev) => ({ ...prev, connectionState: connState }));
      if (connState === "disconnected") {
        const view = stateRef.current.view;
        if (view === "waiting" || view === "countdown" || view === "playing" || view === "results") {
          setState((prev) => ({
            ...prev,
            view: "menu",
            room: null,
            error: "Disconnected from server",
            countdownValue: null,
            gameSession: null,
            opponentStates: {},
            localPendingGarbage: [],
            targetingStates: {},
            attackPowers: {},
            targetingSettings: null,
            localElimination: null,
            gameEndData: null,
            rematchVotes: null,
          }));
        }
      }
    });

    socket.on("roomCreated", (msg) => {
      setState((prev) => ({ ...prev, view: "waiting", room: msg.room, error: null }));
    });

    socket.on("roomUpdated", (msg) => {
      setState((prev) => {
        // When joining, the server confirms with a roomUpdated containing full state
        if (prev.view === "joining") {
          return { ...prev, view: "waiting", room: msg.room, error: null };
        }
        // Rematch accepted or player left during vote: return to waiting room
        if (prev.view === "results" && msg.room.status === "waiting") {
          return {
            ...prev,
            view: "waiting",
            room: msg.room,
            gameSession: null,
            opponentStates: {},
            localPendingGarbage: [],
            targetingStates: {},
            attackPowers: {},
            targetingSettings: null,
            localElimination: null,
            gameEndData: null,
            rematchVotes: null,
          };
        }
        return { ...prev, room: msg.room };
      });
      // Sync handicap settings from room state (for non-host players)
      if (msg.room.handicapSettings) {
        setHandicapSettings({
          ...msg.room.handicapSettings,
          ratingVisible: msg.room.ratingVisible ?? true,
        });
      }
      if (msg.room.targetingSettings) {
        setLobbyTargetingSettings(msg.room.targetingSettings);
      }
    });

    socket.on("playerJoined", (msg) => {
      setState((prev) => {
        if (!prev.room || prev.room.id !== msg.roomId) return prev;
        // Avoid duplicates
        if (prev.room.players.some((p) => p.id === msg.player.id)) return prev;
        return {
          ...prev,
          room: { ...prev.room, players: [...prev.room.players, msg.player] },
        };
      });
    });

    socket.on("playerLeft", (msg) => {
      setState((prev) => {
        if (!prev.room || prev.room.id !== msg.roomId) return prev;
        const nextOpponents = { ...prev.opponentStates };
        delete nextOpponents[msg.playerId];
        return {
          ...prev,
          room: {
            ...prev.room,
            players: prev.room.players.filter((p) => p.id !== msg.playerId),
          },
          opponentStates: nextOpponents,
        };
      });
    });

    socket.on("countdown", (msg) => {
      setState((prev) => {
        if (!prev.room || prev.room.id !== msg.roomId) return prev;
        return { ...prev, view: "countdown", countdownValue: msg.count };
      });
    });

    socket.on("gameStarted", (msg) => {
      const localId = getSessionPlayerId();
      const initialOpponentStates: Record<PlayerId, GameStateSnapshot> = {};
      for (const [pid, state] of Object.entries(msg.initialStates)) {
        if (pid !== localId) initialOpponentStates[pid] = state;
      }
      setState((prev) => {
        if (!prev.room || prev.room.id !== msg.roomId) return prev;
        return {
          ...prev,
          view: "playing",
          countdownValue: null,
          gameSession: {
            seed: msg.seed,
            playerIndexes: msg.playerIndexes,
            initialStates: msg.initialStates,
            handicapModifiers: msg.handicapModifiers,
            handicapMode: msg.handicapMode,
          },
          opponentStates: initialOpponentStates,
          localPendingGarbage: [],
          targetingStates: {},
          attackPowers: {},
          targetingSettings: msg.targetingSettings ?? null,
          localElimination: null,
          gameEndData: null,
          rematchVotes: null,
        };
      });
    });

    socket.on("targetingUpdated", (msg) => {
      setState((prev) => {
        if (!prev.room || prev.room.id !== msg.roomId) return prev;
        return {
          ...prev,
          targetingStates: {
            ...prev.targetingStates,
            [msg.playerId]: {
              strategy: msg.strategy,
              targetPlayerId: msg.targetPlayerId,
            },
          },
        };
      });
    });

    socket.on("attackPowerUpdated", (msg) => {
      setState((prev) => {
        if (!prev.room || prev.room.id !== msg.roomId) return prev;
        return {
          ...prev,
          attackPowers: {
            ...prev.attackPowers,
            [msg.playerId]: {
              multiplier: msg.multiplier,
              koCount: msg.koCount,
            },
          },
        };
      });
    });

    socket.on("gameStateSnapshot", (msg) => {
      const localId = getSessionPlayerId();
      if (msg.playerId === localId) {
        // Extract local player's pending garbage from authoritative snapshot.
        setState((prev) => {
          if (!prev.room || prev.room.id !== msg.roomId) return prev;
          return { ...prev, localPendingGarbage: msg.state.pendingGarbage };
        });
        return;
      }
      setState((prev) => {
        if (!prev.room || prev.room.id !== msg.roomId) return prev;
        return {
          ...prev,
          opponentStates: {
            ...prev.opponentStates,
            [msg.playerId]: msg.state,
          },
        };
      });
    });

    socket.on("gameOver", (msg) => {
      const localId = getSessionPlayerId();
      if (msg.playerId !== localId) return;
      setState((prev) => {
        if (!prev.room || prev.room.id !== msg.roomId) return prev;
        return {
          ...prev,
          localElimination: { placement: msg.placement },
        };
      });
    });

    socket.on("gameEnd", (msg) => {
      setState((prev) => {
        if (!prev.room || prev.room.id !== msg.roomId) return prev;
        return {
          ...prev,
          view: "results",
          gameEndData: {
            winnerId: msg.winnerId,
            placements: msg.placements,
            stats: msg.stats,
          },
        };
      });
    });

    socket.on("rematchUpdate", (msg) => {
      setState((prev) => {
        if (!prev.room || prev.room.id !== msg.roomId) return prev;
        return {
          ...prev,
          rematchVotes: {
            votes: msg.votes,
            totalPlayers: msg.totalPlayers,
          },
        };
      });
    });

    socket.on("ratingUpdate", (msg) => {
      setState((prev) => {
        if (!prev.room || prev.room.id !== msg.roomId) return prev;
        if (!prev.gameEndData) return prev;
        return {
          ...prev,
          gameEndData: {
            ...prev.gameEndData,
            ratingChanges: msg.changes,
          },
        };
      });
    });

    socket.on("error", (msg) => {
      const errorText = formatError(msg.code, msg.message);
      setState((prev) => {
        // If joining failed, go back to join dialog
        if (prev.view === "joining") {
          return { ...prev, view: "joining", error: errorText };
        }
        // If game was cancelled during countdown, return to waiting
        if (prev.view === "countdown") {
          return { ...prev, view: "waiting", countdownValue: null, error: errorText };
        }
        return { ...prev, error: errorText };
      });
    });

    socket.on("disconnected", () => {
      setState((prev) => ({
        ...prev,
        view: "menu",
        room: null,
        error: "Server disconnected",
        countdownValue: null,
        gameSession: null,
        opponentStates: {},
        localPendingGarbage: [],
        targetingStates: {},
        attackPowers: {},
        targetingSettings: null,
        localElimination: null,
        gameEndData: null,
        rematchVotes: null,
      }));
    });

    socket.connect(url);

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [url]);

  // ---- Actions ----

  const setPlayerName = useCallback((name: string) => {
    setPlayerNameRaw(name);
  }, []);

  const confirmName = useCallback((nameOverride?: string) => {
    const trimmed = (nameOverride ?? nameRef.current).trim().slice(0, 20);
    if (!trimmed) return;
    savePlayerName(trimmed);
    setPlayerNameRaw(trimmed);
    setState((prev) => ({ ...prev, view: "menu", error: null }));
  }, []);

  const createRoom = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const player = makePlayerInfo(nameRef.current);
    socket.send({
      type: "createRoom",
      config: { name: `${nameRef.current}'s Room`, maxPlayers: 4 },
      player,
    });
  }, []);

  const joinRoom = useCallback((roomId: RoomId) => {
    const socket = socketRef.current;
    if (!socket) return;
    const player = makePlayerInfo(nameRef.current);
    setState((prev) => ({ ...prev, view: "joining", error: null }));
    socket.send({ type: "joinRoom", roomId, player });
  }, []);

  const leaveRoom = useCallback(() => {
    const socket = socketRef.current;
    const room = stateRef.current.room;
    if (!socket || !room) return;
    socket.send({ type: "leaveRoom", roomId: room.id });
    setState((prev) => ({
      ...prev,
      view: "menu",
      room: null,
      error: null,
      opponentStates: {},
      localPendingGarbage: [],
      targetingStates: {},
      attackPowers: {},
      targetingSettings: null,
      localElimination: null,
      gameEndData: null,
      gameSession: null,
      rematchVotes: null,
    }));
    setHandicapSettings({ ...DEFAULT_HANDICAP_SETTINGS });
    setLobbyTargetingSettings({ ...DEFAULT_TARGETING_SETTINGS });
  }, []);

  const requestRematch = useCallback(() => {
    const socket = socketRef.current;
    const room = stateRef.current.room;
    if (!socket || !room) return;
    socket.send({ type: "requestRematch", roomId: room.id });
  }, []);

  const startGame = useCallback(() => {
    const socket = socketRef.current;
    const room = stateRef.current.room;
    if (!socket || !room) return;
    const { ratingVisible: _, ...hSettings } = handicapRef.current;
    socket.send({
      type: "startGame",
      roomId: room.id,
      handicapSettings: hSettings,
    });
  }, []);

  const updateHandicapSettings = useCallback((settings: HandicapSettingsValues) => {
    setHandicapSettings(settings);
    const socket = socketRef.current;
    const room = stateRef.current.room;
    if (!socket || !room) return;
    const { ratingVisible, ...hSettings } = settings;
    socket.send({
      type: "updateRoomSettings",
      roomId: room.id,
      handicapSettings: hSettings,
      ratingVisible,
    });
  }, []);

  const openJoinDialog = useCallback(() => {
    setState((prev) => ({ ...prev, view: "joining", error: null }));
  }, []);

  const closeJoinDialog = useCallback(() => {
    setState((prev) => ({ ...prev, view: "menu", error: null }));
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const updateTargetingSettings = useCallback((settings: TargetingSettings) => {
    setLobbyTargetingSettings(settings);
    const socket = socketRef.current;
    const room = stateRef.current.room;
    if (!socket || !room) return;
    const { ratingVisible, ...hSettings } = handicapRef.current;
    socket.send({
      type: "updateRoomSettings",
      roomId: room.id,
      handicapSettings: hSettings,
      ratingVisible,
      targetingSettings: settings,
    });
  }, []);

  const setTargetingStrategy = useCallback((strategy: TargetingStrategyType) => {
    const socket = socketRef.current;
    const room = stateRef.current.room;
    if (!socket || !room) return;
    socket.send({ type: "setTargetingStrategy", roomId: room.id, strategy });
  }, []);

  const setManualTarget = useCallback((targetPlayerId: PlayerId) => {
    const socket = socketRef.current;
    const room = stateRef.current.room;
    if (!socket || !room) return;
    socket.send({ type: "setManualTarget", roomId: room.id, targetPlayerId });
  }, []);

  return {
    state,
    playerName,
    setPlayerName,
    confirmName,
    createRoom,
    joinRoom,
    leaveRoom,
    requestRematch,
    startGame,
    openJoinDialog,
    closeJoinDialog,
    clearError,
    handicapSettings,
    updateHandicapSettings,
    lobbyTargetingSettings,
    updateTargetingSettings,
    setTargetingStrategy,
    setManualTarget,
    socket,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatError(code: ErrorCode, message: string): string {
  const labels: Record<ErrorCode, string> = {
    ROOM_NOT_FOUND: "Room not found",
    ROOM_FULL: "Room is full",
    GAME_IN_PROGRESS: "Game already in progress",
    NOT_HOST: "Only the host can do that",
    NOT_IN_ROOM: "Not in a room",
    INVALID_MESSAGE: "Invalid request",
    INTERNAL_ERROR: "Server error",
  };
  return labels[code] ?? message;
}
