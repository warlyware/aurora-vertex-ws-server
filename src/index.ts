"use strict";

import "dotenv/config";
import WebSocket from "ws";
import { setupApp, setupEventListeners } from "./setup";
import { setupMemoryWatcher } from "./watchers/memory";
import { setupFolderWatchers } from "./watchers/folders";
import { setupSolanaWatchers } from "./watchers/solana";

const { wss } = setupApp();

export const clients = new Set<WebSocket>();

export const logToClient = (message: string) => {
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
};

wss.on("connection", async function (ws: WebSocket) {
  console.log("Client connected");

  const id = setupMemoryWatcher(ws);
  setupFolderWatchers(ws);
  setupEventListeners(ws);
  setupSolanaWatchers(ws);
  // await createTgClient(ws);

  clients.add(ws);

  ws.on("close", async function () {
    console.log("stopping client interval");
    clearInterval(id);
    clients.delete(ws);
  });
});


