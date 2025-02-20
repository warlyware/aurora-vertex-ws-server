import { messageTypes } from "../types/messages";
import { spawnBot, stopBot } from "./manager";

const { BOT_SPAWN, BOT_STOP } = messageTypes;

export const setupBotManager = () => {
  console.log("Bot Manager initialized");

  return {
    handleMessage: async (message: {
      type: string;
      payload: any;
    }) => {
      const { type, payload } = message;

      switch (type) {
        case BOT_SPAWN: {
          const { botId, userId } = payload;
          spawnBot(botId, userId);
          break;
        }
        case BOT_STOP: {
          const { botId } = payload;
          stopBot(botId);
          break;
        }
        default:
          // console.warn("Unhandled message type:", type);
          break;
      }
    },
  };
};