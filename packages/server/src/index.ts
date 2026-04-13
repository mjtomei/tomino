import { join } from "node:path";
import express from "express";
import { createServer } from "node:http";
import { createWebSocketServer } from "./ws-server.js";
import { JsonSkillStore } from "./skill-store.js";
import { createStatsRouter } from "./stats-routes.js";
import { loadBalancingConfig } from "./balancing-init.js";

const PORT = parseInt(process.env["PORT"] ?? "3001", 10);
const DATA_DIR = process.env["DATA_DIR"] ?? "data";

const balancingConfig = loadBalancingConfig(DATA_DIR);

const app = express();
const store = new JsonSkillStore(join(DATA_DIR, "ratings.json"));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(createStatsRouter(store));

const httpServer = createServer(app);
const wsServer = createWebSocketServer(httpServer, { skillStore: store, balancingConfig });

httpServer.listen(PORT, () => {
  console.log(`Tomino server listening on http://localhost:${PORT}`);
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
