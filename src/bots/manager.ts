import { fork, ChildProcess } from 'child_process';
import path from 'path';
import { eventBus } from '../events/bus';
import { BotMessage } from './bot';
import { messageTypes } from '../types/messages';
import { logBotEvent } from '../logging';
import { SolanaTxEvent } from '../events/bridge';

const {
  BOT_SPAWN,
  BOT_STOP,
  SOLANA_TX_EVENT,
  BOT_LOG_EVENT,
  BOT_STATUS_UPDATE,
  BOT_TRADE_NOTIFICATION,
  SOLANA_TX_EVENT_FOR_BOT,
} = messageTypes;

export type BotInfo = {
  botId: string;
  strategy: string;
};

export type BotLogEvent = {
  type: typeof BOT_LOG_EVENT;
  payload: BotInfo & {
    info: string;
  };
};

export type Bot = {
  process: ChildProcess;
} & BotInfo;

const bots: Map<string, Bot> = new Map();

const sendToBotProcess = ({
  type,
  payload
}: BotMessage, botProcess: ChildProcess) => {
  botProcess.send({
    type,
    payload,
  });
};

export const spawnBot = (botId: string, strategy: string) => {
  console.log(`Spawning bot ${botId} with strategy ${strategy}`);

  if (bots.has(botId)) {
    console.log(`Bot ${botId} already exists. Skipping spawn.`);
    return;
  }

  const botScript = path.resolve(__dirname, './bot.js');
  const botProcess = fork(botScript);

  const keypair = `keypair-${botId}`;

  sendToBotProcess({
    type: BOT_SPAWN,
    payload: {
      botId,
      keypair,
      strategy,
    }
  }, botProcess);

  botProcess.on('message', (message: BotMessage) => {
    const { type, payload } = message;
    if (!payload) return;

    switch (type) {
      case BOT_STATUS_UPDATE:
        const existingBot = bots.get(botId);

        if (existingBot) {
          bots.set(botId, {
            ...existingBot,
            ...payload,
          });

          eventBus.emit(BOT_STATUS_UPDATE, {
            type: BOT_STATUS_UPDATE,
            payload
          });
        }
        break;

      case BOT_TRADE_NOTIFICATION:
        console.log(`Bot ${botId} trade notification: ${payload}`);

        eventBus.emit(BOT_TRADE_NOTIFICATION, {
          type: BOT_TRADE_NOTIFICATION,
          payload
        });
        break;

      case BOT_LOG_EVENT:
        console.log(`received log event from bot ${botId}:`, payload);
        eventBus.emit(BOT_LOG_EVENT, {
          type: BOT_LOG_EVENT,
          payload: {
            botId,
            strategy,
            info: payload.info,
            data: payload.data,
          }
        });

      default:
        console.warn(`Unhandled message type: ${type}`);
        break;
    }
  });

  botProcess.on('exit', (code) => {
    const exitMessage = code === 0 ? 'stopped successfully' : `crashed with code ${code}`;

    logBotEvent({
      botId,
      strategy,
      info: `Bot ${botId} ${exitMessage}`
    });

    bots.delete(botId);
  });

  bots.set(botId, {
    process: botProcess,
    strategy,
    botId,
  });

  logBotEvent({
    botId,
    strategy,
    info: `Bot spawned with strategy ${strategy}`,
  });
};

export const stopBot = (botId: string) => {
  const bot = bots.get(botId);
  if (bot) {
    sendToBotProcess({
      type: BOT_STOP,
      payload: {
        botId
      }
    }, bot.process);
    // bot.process.kill();
  } else {
    logBotEvent({
      botId,
      strategy: 'N/A',
      info: `Bot ${botId} not found`
    });
  }
};

eventBus.on(SOLANA_TX_EVENT, (event: SolanaTxEvent) => {
  for (const [botId, botInfo] of bots) {
    botInfo.process.send({
      type: SOLANA_TX_EVENT_FOR_BOT,
      payload: {
        ...event.payload,
        botId,
        strategy: botInfo.strategy,
      }
    });
  }
});