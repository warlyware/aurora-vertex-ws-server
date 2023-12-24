"use strict";
import WebSocket from "ws";
import { messageTypes } from "./types/messages";
import { setupApp, setupEventListeners } from "./setup";
import { getQuoteFromJupiter } from "./utils/coins/get-quote-from-jupiter";
import { setupMemoryWatcher } from "./watchers/memory";
import { setupFolderWatchers } from "./watchers/folders";

const { wss } = setupApp();

wss.on("connection", function (ws: WebSocket) {
  console.log("Client connected");

  setupEventListeners(ws);
  const id = setupMemoryWatcher(ws);
  setupFolderWatchers(ws);

  ws.on("close", function () {
    console.log("stopping client interval");
    clearInterval(id);
  });
});
