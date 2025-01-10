"use strict";

import "dotenv/config";
import WebSocket from "ws";
import { setupApp, setupEventListeners } from "./setup";
import { setupMemoryWatcher } from "./watchers/memory";
import { setupFolderWatchers } from "./watchers/folders";
import { createTgClient } from "./utils/tg";


const { wss } = setupApp();

wss.on("connection", async function (ws: WebSocket) {
  console.log("Client connected");

  const id = setupMemoryWatcher(ws);
  setupFolderWatchers(ws);
  setupEventListeners(ws);
  await createTgClient(ws);

  ws.on("close", async function () {
    console.log("stopping client interval");
    clearInterval(id);
  });
});
