"use strict";

import "dotenv/config";
import { parse } from 'url';
import WebSocket from "ws";
import { setupApp, setupEventListeners } from "./setup";
import { setupMemoryWatcher } from "./watchers/memory";
import { setupFolderWatchers } from "./watchers/folders";
import { setupSolanaWatchers } from "./watchers/solana";
import { setupBotManager } from "./bots";
import { BotMessage } from "./bots/bot";
import { AuroraMessage } from "./types/messages";
import Redis from "ioredis";

const { wss } = setupApp();

export const clients = new Set<WebSocket>();

export const sendToConnectedClients = (message: AuroraMessage) => {
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }
};

export let redis: Redis | null = null;

(() => {
  console.log('process.env.IS_PRODUCTION:', !!process.env.IS_PRODUCTION);
  if (process.env.IS_PRODUCTION) {
    redis = new Redis();
    console.log('✅ Redis connected in production mode');
  } else {
    console.log('🚨 Redis not connected in development mode');
  }
})();

const botManager = setupBotManager();
let solanaWatchers: ReturnType<typeof setupSolanaWatchers> | undefined;

if (process.env.IS_PRODUCTION) {
  solanaWatchers = setupSolanaWatchers(clients);
}

wss.on("connection", async function (ws: WebSocket, req) {
  const parsedUrl = parse(req.url || '', true);
  const authKey = parsedUrl?.query?.auth;

  if (!authKey || authKey !== process.env.AURORA_VERTEX_API_KEY) {
    console.error("Client not authorized");
    ws.close();
    return;
  }

  clients.add(ws);

  const id = setupMemoryWatcher(ws);
  setupFolderWatchers(ws);
  setupEventListeners(ws, botManager, solanaWatchers);
  if (solanaWatchers) {
    solanaWatchers.sendRestoredTransactionsToClient(ws);
    solanaWatchers.sendRestoredLogsToClient(ws);
  }
  // await createTgClient(ws);

  ws.on("close", async function () {
    console.log("stopping client interval");
    clearInterval(id);
    clients.delete(ws);
  });
});


