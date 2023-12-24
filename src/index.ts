"use strict";

import "dotenv/config";
import WebSocket from "ws";
import { setupApp, setupEventListeners } from "./setup";
import { setupMemoryWatcher } from "./watchers/memory";
import { setupFolderWatchers } from "./watchers/folders";

const { wss } = setupApp();

wss.on("connection", function (ws: WebSocket) {
  console.log("Client connected");

  const id = setupMemoryWatcher(ws);
  setupFolderWatchers(ws);
  setupEventListeners(ws);

  ws.on("close", function () {
    console.log("stopping client interval");
    clearInterval(id);
  });
});
