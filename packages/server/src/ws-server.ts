import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";

const HEARTBEAT_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;

interface ClientInfo {
  id: string;
  ws: WebSocket;
  isAlive: boolean;
  pongTimer: ReturnType<typeof setTimeout> | null;
}

export interface TetrisWebSocketServer {
  /** Number of currently connected clients */
  clientCount: number;
  /** Gracefully shut down the server, closing all connections */
  close(): void;
}

export function createWebSocketServer(
  httpServer: HttpServer,
): TetrisWebSocketServer {
  const wss = new WebSocketServer({ server: httpServer });
  const clients = new Map<string, ClientInfo>();

  const heartbeatInterval = setInterval(() => {
    for (const client of clients.values()) {
      if (!client.isAlive) {
        // Previous ping was never answered — terminate
        console.log(`Client ${client.id}: heartbeat timeout, terminating`);
        client.ws.terminate();
        continue;
      }

      client.isAlive = false;
      client.ws.ping();

      // Set a pong deadline
      client.pongTimer = setTimeout(() => {
        if (!client.isAlive) {
          console.log(`Client ${client.id}: pong timeout, terminating`);
          client.ws.terminate();
        }
      }, PONG_TIMEOUT_MS);
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on("connection", (ws) => {
    const id = randomUUID();
    const client: ClientInfo = { id, ws, isAlive: true, pongTimer: null };
    clients.set(id, client);
    console.log(`Client ${id}: connected (total: ${clients.size})`);

    ws.on("pong", () => {
      client.isAlive = true;
      if (client.pongTimer) {
        clearTimeout(client.pongTimer);
        client.pongTimer = null;
      }
    });

    ws.on("message", (data) => {
      let parsed: unknown;
      try {
        const text =
          typeof data === "string" ? data : (data as Buffer).toString("utf-8");
        parsed = JSON.parse(text);
      } catch {
        console.warn(`Client ${id}: malformed message (not valid JSON)`);
        return;
      }
      // Protocol handling will be added in a future PR.
      // For now, just log that we received a valid message.
      console.log(`Client ${id}: message received`, parsed);
    });

    ws.on("close", (code, reason) => {
      cleanup(client);
      console.log(
        `Client ${id}: disconnected (code=${code}, reason=${reason.toString("utf-8") || "none"}, remaining: ${clients.size})`,
      );
    });

    ws.on("error", (err) => {
      console.error(`Client ${id}: error`, err.message);
      cleanup(client);
    });
  });

  function cleanup(client: ClientInfo) {
    if (client.pongTimer) {
      clearTimeout(client.pongTimer);
      client.pongTimer = null;
    }
    clients.delete(client.id);
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
    wss.close();
  }

  return {
    get clientCount() {
      return clients.size;
    },
    close,
  };
}
