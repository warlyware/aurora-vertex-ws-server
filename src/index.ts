"use strict";

import "dotenv/config";
import WebSocket from "ws";
import { setupApp, setupEventListeners } from "./setup";
import { setupMemoryWatcher } from "./watchers/memory";
import { setupFolderWatchers } from "./watchers/folders";
import { setupSolanaWatchers } from "./watchers/solana";
import { setupBotManager } from "./bots";
import { messageGroups, messageTypes } from "./types/messages";

const { BOT_MESSAGE } = messageTypes;

const { wss } = setupApp();

export const clients = new Set<WebSocket>();

export const logToClient = (message: string) => {
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: BOT_MESSAGE,
        payload: {
          timestamp: Date.now(),
          message,
        },
      }));
    }
  }
};

const botManager = setupBotManager();
const solanaWatchers = setupSolanaWatchers();

wss.on("connection", async function (ws: WebSocket) {
  console.log("Client connected");

  const id = setupMemoryWatcher(ws);
  setupFolderWatchers(ws);
  setupEventListeners(ws, botManager, solanaWatchers);
  // await createTgClient(ws);

  clients.add(ws);

  ws.on("close", async function () {
    console.log("stopping client interval");
    clearInterval(id);
    clients.delete(ws);
  });
});


