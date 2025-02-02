"use strict";

import "dotenv/config";
import WebSocket from "ws";
import { setupApp, setupEventListeners } from "./setup";
import { setupMemoryWatcher } from "./watchers/memory";
import { setupFolderWatchers } from "./watchers/folders";
import { setupSolanaWatchers } from "./watchers/solana";
import { setupBotManager } from "./bots";
import { BotMessage } from "./bots/bot";

const { wss } = setupApp();

export const clients = new Set<WebSocket>();

export const sendToConnectedClients = (message: BotMessage) => {
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }
};

const botManager = setupBotManager();
const solanaWatchers = setupSolanaWatchers(clients);

setTimeout(() => {
  if (!solanaWatchers?.backupExists()) {
    setupSolanaWatchers(clients, true);
  } else {
    console.log("Backup WebSocket already exists. Skipping startup.");
  }
}, 10000);

wss.on("connection", async function (ws: WebSocket) {
  console.log("Client connected");

  clients.add(ws);

  const id = setupMemoryWatcher(ws);
  setupFolderWatchers(ws);
  setupEventListeners(ws, botManager, solanaWatchers);
  if (solanaWatchers) {
    solanaWatchers.restoreTransactionsForClient(ws);
  }
  // await createTgClient(ws);

  ws.on("close", async function () {
    console.log("stopping client interval");
    clearInterval(id);
    clients.delete(ws);
  });
});


