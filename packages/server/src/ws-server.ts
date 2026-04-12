import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "node:http";
import type { PlayerId, ServerMessage, SkillStore } from "@tetris/shared";
import { parseC2SMessage, serializeMessage } from "@tetris/shared";
import { RoomStore } from "./room-store.js";
import {
  handleCreateRoom,
  handleJoinRoom,
  handleLeaveRoom,
  handleStartGame,
  handleUpdateRoomSettings,
  handleDisconnect,
  type HandlerContext,
} from "./handlers/lobby-handlers.js";
import {
  handleGameDisconnect,
  handlePlayerInput,
  handleRejoinRoom,
  handleSetTargetingStrategy,
  handleSetManualTarget,
} from "./handlers/game-handlers.js";

const HEARTBEAT_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;

interface ClientInfo {
  /** Server-assigned connection ID (used internally). */
  connectionId: string;
  /** Player ID reported by the client (set on first createRoom/joinRoom). */
  playerId: PlayerId | null;
  ws: WebSocket;
  isAlive: boolean;
  pongTimer: ReturnType<typeof setTimeout> | null;
}

export interface TetrisWebSocketServer {
  /** Number of currently connected clients */
  clientCount: number;
  /** The shared room store */
  readonly roomStore: RoomStore;
  /** Look up the WebSocket for a player. */
  getSocketForPlayer(playerId: PlayerId): WebSocket | undefined;
  /** Gracefully shut down the server, closing all connections */
  close(): void;
}

let connectionCounter = 0;

export interface WebSocketServerOptions {
  skillStore?: SkillStore;
}

export function createWebSocketServer(
  httpServer: HttpServer,
  options: WebSocketServerOptions = {},
): TetrisWebSocketServer {
  const { skillStore } = options;
  const wss = new WebSocketServer({ server: httpServer });
  const clients = new Map<string, ClientInfo>();
  /** Reverse lookup: player ID → connection ID */
  const playerConnections = new Map<PlayerId, string>();
  const store = new RoomStore();

  const heartbeatInterval = setInterval(() => {
    for (const client of clients.values()) {
      if (!client.isAlive) {
        console.log(`Client ${client.connectionId}: heartbeat timeout, terminating`);
        client.ws.terminate();
        continue;
      }

      client.isAlive = false;
      client.ws.ping();

      client.pongTimer = setTimeout(() => {
        if (!client.isAlive) {
          console.log(`Client ${client.connectionId}: pong timeout, terminating`);
          client.ws.terminate();
        }
      }, PONG_TIMEOUT_MS);
    }
  }, HEARTBEAT_INTERVAL_MS);

  function getSocketForPlayer(playerId: PlayerId): WebSocket | undefined {
    const connId = playerConnections.get(playerId);
    if (!connId) return undefined;
    return clients.get(connId)?.ws;
  }

  function sendTo(playerId: PlayerId, msg: ServerMessage): void {
    const ws = getSocketForPlayer(playerId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(serializeMessage(msg));
    }
  }

  function broadcastToRoom(roomId: string, msg: ServerMessage): void {
    const room = store.getRoom(roomId);
    if (!room) return;
    const serialized = serializeMessage(msg);
    for (const player of room.players) {
      const ws = getSocketForPlayer(player.id);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(serialized);
      }
    }
  }

  function broadcastToRoomExcept(
    roomId: string,
    msg: ServerMessage,
    excludePlayerId: PlayerId,
  ): void {
    const room = store.getRoom(roomId);
    if (!room) return;
    const serialized = serializeMessage(msg);
    for (const player of room.players) {
      if (player.id === excludePlayerId) continue;
      const ws = getSocketForPlayer(player.id);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(serialized);
      }
    }
  }

  function makeContext(client: ClientInfo): HandlerContext | null {
    if (!client.playerId) return null;
    const playerId = client.playerId;
    return {
      playerId,
      send: (msg) => sendTo(playerId, msg),
      broadcastToRoom,
      broadcastToRoomExcept,
      skillStore,
    };
  }

  /** Register the player ID from a createRoom or joinRoom message. */
  function registerPlayer(client: ClientInfo, playerId: PlayerId): void {
    // If this connection was already associated with a different player, clean up
    if (client.playerId && client.playerId !== playerId) {
      playerConnections.delete(client.playerId);
    }
    client.playerId = playerId;
    playerConnections.set(playerId, client.connectionId);
  }

  wss.on("connection", (ws) => {
    const connectionId = `conn-${++connectionCounter}`;
    const client: ClientInfo = {
      connectionId,
      playerId: null,
      ws,
      isAlive: true,
      pongTimer: null,
    };
    clients.set(connectionId, client);
    console.log(`Client ${connectionId}: connected (total: ${clients.size})`);

    ws.on("pong", () => {
      client.isAlive = true;
      if (client.pongTimer) {
        clearTimeout(client.pongTimer);
        client.pongTimer = null;
      }
    });

    ws.on("message", (data) => {
      const text =
        typeof data === "string" ? data : (data as Buffer).toString("utf-8");
      const msg = parseC2SMessage(text);
      if (!msg) {
        console.warn(`Client ${connectionId}: malformed message`);
        return;
      }

      // Handle ping directly (no player ID needed)
      if (msg.type === "ping") {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(serializeMessage({ type: "pong", timestamp: msg.timestamp }));
        }
        return;
      }

      // Register player ID from messages that carry it
      if (
        msg.type === "createRoom" ||
        msg.type === "joinRoom" ||
        msg.type === "rejoinRoom"
      ) {
        registerPlayer(client, msg.player.id);
      }

      // All other messages require a player ID
      if (!client.playerId) {
        console.warn(`Client ${connectionId}: message before registration: ${msg.type}`);
        return;
      }

      const ctx = makeContext(client)!;

      switch (msg.type) {
        case "createRoom":
          handleCreateRoom(msg, ctx, store);
          break;
        case "joinRoom":
          handleJoinRoom(msg, ctx, store);
          break;
        case "leaveRoom":
          handleLeaveRoom(msg, ctx, store);
          break;
        case "startGame":
          handleStartGame(msg, ctx, store);
          break;
        case "updateRoomSettings":
          handleUpdateRoomSettings(msg, ctx, store);
          break;
        case "playerInput":
          handlePlayerInput(msg, client.playerId!, (code, message) => {
            ctx.send({ type: "error", code, message });
          });
          break;
        case "rejoinRoom":
          handleRejoinRoom(msg, client.playerId!, {
            broadcastToRoom,
            send: ctx.send,
          });
          break;
        case "setTargetingStrategy":
          handleSetTargetingStrategy(msg, client.playerId!, (code, message) => {
            ctx.send({ type: "error", code, message });
          });
          break;
        case "setManualTarget":
          handleSetManualTarget(msg, client.playerId!, (code, message) => {
            ctx.send({ type: "error", code, message });
          });
          break;
      }
    });

    function handleClientDisconnect(client: ClientInfo): void {
      if (client.playerId) {
        // If this connection has already been superseded by a newer one
        // for the same player (e.g. the client reconnected on a fresh
        // socket before our close event fired), do nothing player-level —
        // the newer connection now owns the mapping.
        const isStillActive =
          playerConnections.get(client.playerId) === client.connectionId;
        if (isStillActive) {
          const roomId = store.getRoomIdForPlayer(client.playerId);
          let pendingReconnect = false;
          if (roomId) {
            const result = handleGameDisconnect(
              client.playerId,
              roomId,
              { broadcastToRoom },
              store,
            );
            pendingReconnect = result.pendingReconnect;
          }
          if (!pendingReconnect) {
            handleDisconnect(client.playerId, { broadcastToRoom }, store);
          }
          playerConnections.delete(client.playerId);
        }
      }
      cleanup(client);
    }

    ws.on("close", (code, reason) => {
      handleClientDisconnect(client);
      console.log(
        `Client ${connectionId}: disconnected (code=${code}, reason=${reason.toString("utf-8") || "none"}, remaining: ${clients.size})`,
      );
    });

    ws.on("error", (err) => {
      console.error(`Client ${connectionId}: error`, err.message);
      handleClientDisconnect(client);
    });
  });

  function cleanup(client: ClientInfo) {
    if (client.pongTimer) {
      clearTimeout(client.pongTimer);
      client.pongTimer = null;
    }
    clients.delete(client.connectionId);
  }

  function close() {
    clearInterval(heartbeatInterval);
    for (const client of clients.values()) {
      if (client.pongTimer) {
        clearTimeout(client.pongTimer);
      }
      client.ws.close(1001, "Server shutting down");
    }
    clients.clear();
    playerConnections.clear();
    wss.close();
  }

  return {
    get clientCount() {
      return clients.size;
    },
    roomStore: store,
    getSocketForPlayer,
    close,
  };
}
