import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import { WebSocket } from "ws";
import { createWebSocketServer, type TetrisWebSocketServer } from "../ws-server.js";

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
}

function waitForClose(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    ws.on("close", () => resolve());
  });
}

describe("WebSocket Server", () => {
  let httpServer: HttpServer;
  let wsServer: TetrisWebSocketServer;
  let port: number;
  const openClients: WebSocket[] = [];

  function createClient(): WebSocket {
    const ws = new WebSocket(`ws://localhost:${port}`);
    openClients.push(ws);
    return ws;
  }

  beforeEach(async () => {
    httpServer = createServer();
    wsServer = createWebSocketServer(httpServer);
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        port = typeof addr === "object" && addr !== null ? addr.port : 0;
        resolve();
      });
    });
  });

  afterEach(async () => {
    for (const ws of openClients) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }
    openClients.length = 0;
    wsServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  describe("connection lifecycle", () => {
    it("accepts a new connection and tracks it", async () => {
      const ws = createClient();
      await waitForOpen(ws);
      expect(wsServer.clientCount).toBe(1);
    });

    it("cleans up on client disconnect", async () => {
      const ws = createClient();
      await waitForOpen(ws);
      expect(wsServer.clientCount).toBe(1);

      const closed = waitForClose(ws);
      ws.close();
      await closed;

      // Small delay for server-side cleanup
      await new Promise((r) => setTimeout(r, 50));
      expect(wsServer.clientCount).toBe(0);
    });

    it("handles rapid connect and disconnect", async () => {
      const ws = createClient();
      await waitForOpen(ws);
      ws.close();
      await waitForClose(ws);

      await new Promise((r) => setTimeout(r, 50));
      expect(wsServer.clientCount).toBe(0);
    });
  });

  describe("multiple simultaneous connections", () => {
    it("tracks multiple clients independently", async () => {
      const ws1 = createClient();
      const ws2 = createClient();
      const ws3 = createClient();

      await Promise.all([waitForOpen(ws1), waitForOpen(ws2), waitForOpen(ws3)]);
      expect(wsServer.clientCount).toBe(3);

      const closed2 = waitForClose(ws2);
      ws2.close();
      await closed2;
      await new Promise((r) => setTimeout(r, 50));

      expect(wsServer.clientCount).toBe(2);
    });
  });

  describe("heartbeat", () => {
    it("terminates clients that do not respond to ping", async () => {
      // Use fake timers to control heartbeat
      vi.useFakeTimers();

      const realHttpServer = createServer();
      const realWsServer = createWebSocketServer(realHttpServer);
      await new Promise<void>((resolve) => {
        realHttpServer.listen(0, resolve);
      });
      const addr = realHttpServer.address();
      const realPort = typeof addr === "object" && addr !== null ? addr.port : 0;

      const ws = new WebSocket(`ws://localhost:${realPort}`);
      openClients.push(ws);

      await vi.waitFor(() => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
      });
      expect(realWsServer.clientCount).toBe(1);

      // Disable the client's automatic pong response
      ws.removeAllListeners("ping");
      ws.on("ping", () => {
        // Intentionally do not pong
      });

      // Advance past heartbeat interval (30s) + pong timeout (10s)
      await vi.advanceTimersByTimeAsync(30_000 + 10_000 + 100);

      await vi.waitFor(() => {
        expect(realWsServer.clientCount).toBe(0);
      });

      vi.useRealTimers();
      realWsServer.close();
      await new Promise<void>((resolve) => realHttpServer.close(() => resolve()));
    });
  });

  describe("malformed message handling", () => {
    it("does not crash on non-JSON text messages", async () => {
      const ws = createClient();
      await waitForOpen(ws);

      ws.send("this is not json");

      // Send a valid message after to prove the connection is still alive
      await new Promise((r) => setTimeout(r, 100));
      expect(wsServer.clientCount).toBe(1);
      expect(ws.readyState).toBe(WebSocket.OPEN);
    });

    it("does not crash on binary messages", async () => {
      const ws = createClient();
      await waitForOpen(ws);

      ws.send(Buffer.from([0x00, 0x01, 0x02, 0xff]));

      await new Promise((r) => setTimeout(r, 100));
      expect(wsServer.clientCount).toBe(1);
      expect(ws.readyState).toBe(WebSocket.OPEN);
    });

    it("does not crash on empty messages", async () => {
      const ws = createClient();
      await waitForOpen(ws);

      ws.send("");

      await new Promise((r) => setTimeout(r, 100));
      expect(wsServer.clientCount).toBe(1);
    });
  });
});
