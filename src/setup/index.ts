"use strict";
import express from "express";
import path from "path";
import { createServer } from "http";
import WebSocket from "ws";
import { messageGroups, messageTypes } from "../types/messages";
import { getClient } from "../utils/tg";
import { getCoinInfo } from "../utils/coins";
import { setupBotManager } from "../bots";
import { setupSolanaWatchers } from "../watchers/solana";
import { setupWalletBalancesRoute } from "../endpoints/wallets/get-wallet-balances";
import cors from "cors";
import { setupTransferSolRoute } from "../endpoints/tokens/transfer-sol";
import { setupBuyOnPumpfunRoute } from "../endpoints/tokens/buy-on-pumpfun";
import { setupSellOnPumpfunRoute } from "../endpoints/tokens/sell-on-pumpfun";
import { setupTransferSplTokensRoute } from "../endpoints/tokens/transfer-spl-tokens";
import { setupEventBusListeners } from "../events/bridge";
import { setupUpdateBotSettingsRoute } from "../endpoints/bots/update-bot-settings";
import { setupCreateWalletRoute } from "../endpoints/wallets/create-wallet";
import { setupCreateBotRoute } from "../endpoints/bots/create-bot";
import { setupBuyOnRaydiumRoute } from "../endpoints/tokens/buy-on-raydium";
import { setupSellOnRaydiumRoute } from "../endpoints/tokens/sell-on-raydium";
import { setupTokenOperationsRoutes } from "../endpoints/tokens/token-operations";
const {
  GET_COIN_INFO,
  PING,
  PONG,
  TG_GET_ME,
  TG_GET_CHATS,
} = messageTypes;

export const setupApp = () => {
  const app = express();
  app.use(express.static(path.join(__dirname, "../../public")));
  const server = createServer(app);
  const router = express.Router();
  const wss = new WebSocket.Server({ server });

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(cors({
    origin: [
      "http://localhost:3000",
      "https://auroravertex.click",
      "https://fake.finance"
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }));

  setupWalletBalancesRoute(router);
  setupTransferSolRoute(router);
  setupBuyOnPumpfunRoute(router);
  setupSellOnPumpfunRoute(router);
  setupBuyOnRaydiumRoute(router);
  setupSellOnRaydiumRoute(router);
  setupTransferSplTokensRoute(router);
  setupTokenOperationsRoutes(router);
  setupEventBusListeners();
  setupUpdateBotSettingsRoute(router);
  setupCreateWalletRoute(router);
  setupCreateBotRoute(router);

  app.use(router);

  server.listen(3002, function () {
    console.log("Listening on http://0.0.0.0:3002");
  });

  return { app, wss, server };
};

export const setupEventListeners = (
  ws: WebSocket,
  botManager: ReturnType<typeof setupBotManager>,
  solanaWatchers: ReturnType<typeof setupSolanaWatchers>
) => {
  ws.on("message", async function (message: string) {
    const { type, payload, clientSentTime } = JSON.parse(message);

    const { BOTS, SOLANA } = messageGroups;

    switch (type) {
      case PING: {
        const serverReceivedTime = Date.now();
        ws.send(
          JSON.stringify({
            type: PONG,
            payload: {
              clientSentTime,
              serverReceivedTime,
              serverSentTime: Date.now(),
            },
          })
        );
        break;
      }

      case BOTS.find((group) => group === type): {
        botManager.handleMessage({ type, payload });
        break;
      }

      case SOLANA.find((group) => group === type): {
        if (!solanaWatchers) {
          console.error("Solana watchers not initialized");
          return;
        }
        solanaWatchers.handleMessage({ type, payload }, ws);
        break;
      }

      case TG_GET_ME: {
        try {
          const tgClient = await getClient();

          const me = await tgClient.invoke({ _: 'getMe' });
          console.log('My user:', me);


          ws.send(JSON.stringify({
            type: TG_GET_ME,
            payload: {
              me,
            },
          }));
        } catch (error) {
          console.error({ error });
        }
        break;
      }
      case TG_GET_CHATS: {
        try {
          const tgClient = await getClient();

          const chats = await tgClient.invoke({ _: 'getChats' });
          console.log('Chats:', chats);

          ws.send(JSON.stringify({
            type: TG_GET_CHATS,
            payload: {
              chats,
            },
          }));
        }
        catch (error) {
          console.error({ error });
        }
        break;
      }
      case GET_COIN_INFO: {
        const coinInfo = await getCoinInfo(payload.address);

        ws.send(
          JSON.stringify({
            type: GET_COIN_INFO,
            payload: {
              timestamp: Date.now(),
              coinInfo,
            },
          })
        );
        break;
      }
      default: {
        console.log("No handler for this type of message");
      }
    }
  });
};
