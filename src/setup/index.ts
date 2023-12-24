"use strict";
import express from "express";
import path from "path";
import { createServer } from "http";
import WebSocket from "ws";
import { messageTypes } from "../types/messages";
import { getQuoteFromJupiter } from "../utils/coins/get-quote-from-jupiter";
import { getLiquidityPoolsFromRaydium } from "../utils/raydium/get-liquidity-pools-from-raydium";
import { scrapeRugCheck } from "../utils/rug-check";

const {
  COIN_QUOTE_REQUEST,
  GET_LIQUIDITY_POOLS_FROM_RAYDIUM,
  PING,
  PONG,
  GET_LIQUIDITY_POOLS_FROM_RAYDIUM_RESPONSE,
  GET_RUG_CHECK_INFO,
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

export const setupKeepAlive = (ws: WebSocket) => {
  ws.on(PING, function () {
    ws.send(JSON.stringify({ type: PONG }));
  });
};

export const setupEventListeners = (ws: WebSocket) => {
  ws.on("message", async function (message: string) {
    const { type, payload } = JSON.parse(message);

    switch (type) {
      case PING: {
        console.log("Received PING");
        ws.send(
          JSON.stringify({
            type: PONG,
            payload: {
              timestamp: Date.now(),
            },
          })
        );
        break;
      }
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
          const pools = await getLiquidityPoolsFromRaydium(payload);

          ws.send(
            JSON.stringify({
              type: GET_LIQUIDITY_POOLS_FROM_RAYDIUM_RESPONSE,
              payload: pools,
            })
          );
        } catch (error) {
          console.error({ error });
        }
        break;
      }
      case GET_RUG_CHECK_INFO: {
        try {
          const quote = await scrapeRugCheck(payload);

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
