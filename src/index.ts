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
  ws.on("message", async function (message: string) {
    const { type, payload } = JSON.parse(message);

    switch (type) {
      case COIN_QUOTE_REQUEST: {
        const { inputMint, outputMint, amount } = payload;

        try {
          const quote = await getQuoteFromJupiter({
            inputMint,
            outputMint,
            amount,
          });

          ws.send(JSON.stringify(quote));
        } catch (error) {
          console.error({ error });
        }
        break;
      }
      default: {
        console.log("No handler for this type of message");
      }
    }
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
