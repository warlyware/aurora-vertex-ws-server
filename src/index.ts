"use strict";

import "dotenv/config";
import WebSocket from "ws";
import { setupApp, setupEventListeners } from "./setup";
import { setupMemoryWatcher } from "./watchers/memory";
import { setupFolderWatchers } from "./watchers/folders";
import { createTgClient } from "./utils/tg";
import { getTestAsset } from "./utils/coins";

const { wss } = setupApp();

export const activeSockets = new Set<WebSocket>();

getTestAsset();

wss.on("connection", async function (ws: WebSocket) {
  console.log("Client connected");

  const id = setupMemoryWatcher(ws);
  setupFolderWatchers(ws);
  setupEventListeners(ws);
  // await createTgClient(ws);

  activeSockets.add(ws);

  ws.on("close", async function () {
    console.log("stopping client interval");
    clearInterval(id);
    activeSockets.delete(ws);
  });
});
