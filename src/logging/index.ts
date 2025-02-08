import { eventBus, redis } from "..";
import { messageTypes } from "../types/messages";
import { BotLogEvent } from "../bots/manager";

const { SERVER_LOG_EVENT, BOT_LOG_EVENT } = messageTypes;

type ServerLogEvent = {
  type: typeof SERVER_LOG_EVENT;
  payload: string;
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

export const logBotEvent = (payload: BotLogEvent['payload']) => {
  const event = {
    type: BOT_LOG_EVENT,
    payload
  };

  eventBus.emit(BOT_LOG_EVENT, event);
  storeLog(`bot:${JSON.stringify(event)}`);
};
