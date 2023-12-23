"use strict";
import WebSocket from "ws";
import { messageTypes } from "./types/messages";
import { setupApp } from "./setup";
import { getQuoteFromJupiter } from "./utils/coins/get-quote-from-jupiter";
import { setupMemoryWatcher } from "./watchers/memory";
import { setupFolderWatchers } from "./watchers/folders";

const { GENERIC_MESSAGE, COIN_QUOTE_REQUEST } = messageTypes;

const { wss } = setupApp();

// EXAMPLE REQUEST FROM CLIENT
// {
//   "type": "COIN_COST_REQUEST",
//   "payload": {
//     "inputMint": "6qE6Ys9ZJzZ3eJx3f1zF1wY1q3QZd1Jz3z3Z1Jz3z3Z",
//     "outputMint": "6qE6Ys9ZJzZ3eJx3f1zF1wY1q3QZd1Jz3z3Z1Jz3z3Z",
//     "amount": 100
//   }
// }

export const setupEventListeners = (ws: WebSocket) => {
  ws.on(COIN_QUOTE_REQUEST, async function (payload: string) {
    const { inputMint, outputMint, amount } = JSON.parse(payload);

    const quote = await getQuoteFromJupiter({
      inputMint,
      outputMint,
      amount,
    });

    ws.send(JSON.stringify(quote));
  });

  ws.on(GENERIC_MESSAGE, function (payload: string) {
    console.log("received: %s", payload);
  });

  // on anything else, just log it
  ws.on("message", function (payload: string) {
    console.log("received: %s", payload);
  });
};

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
