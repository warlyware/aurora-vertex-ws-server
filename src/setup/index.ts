"use strict";
import express from "express";
import path from "path";
import { createServer } from "http";
import WebSocket from "ws";
import { messageTypes } from "../types/messages";
import { getQuoteFromJupiter } from "../utils/coins/get-quote-from-jupiter";
import { getLiquidityPoolsFromRaydium } from "../utils/raydium/get-liquidity-pools-from-raydium";

const {
  GENERIC_MESSAGE,
  COIN_QUOTE_REQUEST,
  GET_LIQUIDITY_POOLS_FROM_RAYDIUM,
} = messageTypes;

export const setupApp = () => {
  const app = express();
  app.use(express.static(path.join(__dirname, "/public")));
  const server = createServer(app);
  const wss = new WebSocket.Server({ server });

  server.listen(3002, function () {
    console.log("Listening on http://0.0.0.0:3002");
  });

  return { app, wss, server };
};

export const setupEventListeners = (ws: WebSocket) => {
  ws.on("message", async function (message: string) {
    const { type, payload } = JSON.parse(message);

    switch (type) {
      case COIN_QUOTE_REQUEST: {
        try {
          const quote = await getQuoteFromJupiter(payload);

          ws.send(JSON.stringify(quote));
        } catch (error) {
          console.error({ error });
        }
        break;
      }
      case GET_LIQUIDITY_POOLS_FROM_RAYDIUM: {
        try {
          const { year, month, day } = payload;
          const pools = await getLiquidityPoolsFromRaydium({
            year,
            month,
            day,
          });

          ws.send(JSON.stringify(pools));
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
