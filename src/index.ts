"use strict";

import "dotenv/config";
import { parse } from 'url';
import WebSocket from "ws";
import { setupApp, setupEventListeners } from "./setup";
import { setupMemoryWatcher } from "./watchers/memory";
import { setupFolderWatchers } from "./watchers/folders";
import { setupSolanaWatchers } from "./watchers/solana";
import { setupBotManager } from "./bots";
import { AuroraMessage } from "./types/messages";
import { initRedis } from "./redis";
import dayjs from "dayjs";

const { wss } = setupApp();

export const clients = new Map<string, WebSocket>();

// Initialize Solana watcher immediately on server start
// const solanaWatchers = setupSolanaWatchers(clients);
const botManager = setupBotManager();
let solanaWatchers: ReturnType<typeof setupSolanaWatchers> | undefined;

// if (process.env.IS_PRODUCTION) {
if (true) {
  solanaWatchers = setupSolanaWatchers(clients);
}

initRedis();

wss.on("connection", async function (ws: WebSocket, req) {
  const parsedUrl = parse(req.url || '', true);
  const authKey = parsedUrl?.query?.auth;
  const userId = parsedUrl?.query?.userId as string;

  if (!authKey || authKey !== process.env.AURORA_VERTEX_API_KEY) {
    console.error("Client not authorized");
    ws.close();
    return;
  }

  if (!userId) {
    console.error("No userId provided");
    ws.close();
    return;
  }

  // Move connection logging here
  console.log(`${dayjs().format('YYYY-MM-DD HH:mm:ss')} Client connected: ${userId}`);
  clients.set(userId, ws);

  const memoryWatcherId = setupMemoryWatcher(ws);
  setupFolderWatchers(ws);
  setupEventListeners(ws, botManager, solanaWatchers);
  if (solanaWatchers) {
    solanaWatchers.sendRestoredTransactionsToClient(ws);
    solanaWatchers.sendRestoredLogsToClient(ws);
  }
  // await createTgClient(ws);

  ws.on("close", async function () {
    console.log(`${dayjs().format('YYYY-MM-DD HH:mm:ss')} Client disconnected: ${userId}`);
    clearInterval(memoryWatcherId);
    clients.delete(userId);
  });
});

export const sendToConnectedClients = (message: AuroraMessage, userId?: string) => {
  if (userId) {
    const client = clients.get(userId);
    if (client?.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  } else {
    for (const client of clients.values()) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    }
  }
};

export const getWsClientByUserId = (userId: string) => {
  return clients.get(userId);
};


