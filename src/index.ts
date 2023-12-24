"use strict";
import WebSocket from "ws";
import { setupApp, setupEventListeners, setupKeepAlive } from "./setup";
import { setupMemoryWatcher } from "./watchers/memory";
import { setupFolderWatchers } from "./watchers/folders";

const { wss } = setupApp();

wss.on("connection", function (ws: WebSocket) {
  console.log("Client connected");

  const id = setupMemoryWatcher(ws);
  setupFolderWatchers(ws);
  setupEventListeners(ws);
  setupKeepAlive(ws);

  ws.on("close", function () {
    console.log("stopping client interval");
    clearInterval(id);
  });
});
