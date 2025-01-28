import { WebSocket } from "ws";
import { messageTypes } from "../types/messages";
import { restartBot, spawnBot, stopBot } from "./manager";

const {
  BOT_SPAWN,
  BOT_STOP,
  BOT_RESTART,
} = messageTypes;

export const setupBotManager = (ws: WebSocket) => {
  ws.on("message", async function (message: string) {
    const { type, payload } = JSON.parse(message);

    console.log({
      type,
      payload,
    });

    switch (type) {
      case BOT_SPAWN: {
        const { botId, strategy } = payload;
        spawnBot(botId, strategy);
        break;
      }
      case BOT_STOP: {
        const { botId } = payload;
        stopBot(botId);
        break;
      }
      case BOT_RESTART: {
        const { botId } = payload;
        restartBot(botId);
        break;
      }
    }
  });
}