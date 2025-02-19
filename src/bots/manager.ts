import { fork, ChildProcess } from 'child_process';
import path from 'path';
import { eventBus } from '../events/bus';
import { BotMessage } from './bot';
import { messageTypes } from '../types/messages';
import { logBotEvent } from '../logging';
import { SolanaTxEvent } from '../events/bridge';
import { BotStrategy, getBotById } from '../utils/bots';
import { getWsClientByUserId } from '..';

const {
  BOT_SPAWN,
  BOT_STOP,
  SOLANA_TX_EVENT,
  BOT_LOG_EVENT,
  BOT_STATUS_UPDATE,
  BOT_TRADE_NOTIFICATION,
  SOLANA_TX_EVENT_FOR_BOT,
} = messageTypes;

export type Trader = {
  id: string;
  name: string;
  wallet: {
    id: string;
    address: string;
  }
}

export type BotInfo = {
  id: string;
  strategy: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
  ejectWallet: {
    id: string;
    address: string;
  };
  botWallet: {
    wallet: {
      keypair: {
        publicKey: string;
      };
    };
  };
  user: {
    id: string;
  };
  activeTraderStrategyUnion?: {
    strategy: BotStrategy;
    trader: Trader;
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

export const spawnBot = async (botId: string, userId: string) => {
  console.log(`Spawning bot ${botId} with strategy`);

  if (bots.has(botId)) {
    console.log(`Bot ${botId} already exists. Skipping spawn.`);
    return;
  }

  const botInfo = await getBotById(botId);
  const strategy = botInfo?.activeTraderStrategyUnion?.strategy;

  console.log({ strategy: botInfo?.activeTraderStrategyUnion?.strategy });

  if (!botInfo) {
    console.log(`Bot ${botId} not found. Skipping spawn.`);
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
    }
  }, botProcess);

  botProcess.on('message', (message: BotMessage) => {
    const { type, payload } = message;
    const bot = bots.get(payload.botId);

    if (!bot) return;

    const wsClient = getWsClientByUserId(bot.userId);
    if (wsClient) {
      wsClient.send(JSON.stringify({ type, payload }));
    }

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
        eventBus.emit(BOT_LOG_EVENT, {
          type: BOT_LOG_EVENT,
          payload: {
            ...payload,
            botId,
            strategy,
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
      info: `${botInfo.name} quit: ${exitMessage}`
    });

    bots.delete(botId);
  });

  bots.set(botId, {
    ...botInfo,
    process: botProcess,
    userId,
  });

  const wsClient = getWsClientByUserId(botInfo.user.id);
  if (wsClient) {
    wsClient.send(JSON.stringify({
      type: BOT_STATUS_UPDATE,
      payload: {
        botId,
        status: 'spawned'
      }
    }));
  }

  logBotEvent({
    botId,
    info: `
${botInfo.name} spawned

${JSON.stringify(strategy, null, 2)}
    `,
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