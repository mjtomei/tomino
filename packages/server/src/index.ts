import express from "express";
import { createServer } from "node:http";
import { createWebSocketServer } from "./ws-server.js";

const PORT = parseInt(process.env["PORT"] ?? "3001", 10);

const app = express();

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const httpServer = createServer(app);
const wsServer = createWebSocketServer(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Tetris server listening on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
});

function shutdown() {
  console.log("Shutting down...");
  wsServer.close();
  httpServer.close(() => {
    console.log("Server stopped.");
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { app, httpServer, wsServer };
