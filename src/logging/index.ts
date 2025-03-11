import { eventBus } from "../events/bus";
import { messageTypes } from "../types/messages";
import { redis } from "../redis";
import { BotInfo } from "../bots/manager";
const { SERVER_LOG_EVENT, BOT_LOG_EVENT } = messageTypes;

type ServerLogEvent = {
  type: typeof SERVER_LOG_EVENT;
  payload: string;
};

export type BotLogEvent = {
  type: typeof BOT_LOG_EVENT;
  payload: {
    botId: string;
    info: string;
    data?: any;
  };
};

const storeLog = async (event: string) => {
  if (!process.env.IS_PRODUCTION || !redis) return;
  await redis.set(`log:${Date.now()}`, event);
};

export const logServerEvent = (event: ServerLogEvent['payload']) => {
  eventBus.emit(SERVER_LOG_EVENT, {
    type: SERVER_LOG_EVENT,
    payload: event
  });

  storeLog(`server:${event}`);
};

export const logBotEvent = (bot: BotInfo, payload: BotLogEvent['payload']) => {
  const event = {
    type: BOT_LOG_EVENT,
    payload: {
      ...payload,
      userId: bot.user.id
    }
  };

  eventBus.emit(BOT_LOG_EVENT, event);
  storeLog(`bot:${JSON.stringify(event)}`);
};
