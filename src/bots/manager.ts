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

export const spawnBot = async (botId: string) => {
  if (bots.has(botId)) {
    console.log(`Bot ${botId} already exists. Skipping spawn.`);
    return;
  }

  const botInfo = await getBotById(botId);
  const strategy = botInfo?.activeTraderStrategyUnion?.strategy;
  const userId = botInfo?.user?.id;
  console.log(`Spawning bot ${botId} for user ${userId}`);

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

  bots.set(botId, {
    ...botInfo,
    process: botProcess,
    userId,
  });

  botProcess.on('message', (message: BotMessage) => {
    // TODO: only send event to client if user owns the bot
    const { type, payload } = message;
    const bot = bots.get(payload.botId);

    if (!bot) return;

    const wsClient = getWsClientByUserId(bot.userId);
    if (wsClient) {
      // Add userId to payload for both BOT_LOG_EVENT and BOT_TRADE_NOTIFICATION
      const enrichedPayload = type === BOT_LOG_EVENT || type === BOT_TRADE_NOTIFICATION
        ? { ...payload, userId: bot.userId }
        : payload;
      wsClient.send(JSON.stringify({ type, payload: enrichedPayload }));
    }

    switch (type) {
      case BOT_STATUS_UPDATE:
        const existingBot = bots.get(botId);
        if (existingBot) {
          bots.set(botId, {
            ...existingBot,
            ...payload,
          });
        }
        break;

      case BOT_TRADE_NOTIFICATION:
      case BOT_LOG_EVENT:
        break;

      default:
        // console.warn(`Unhandled message type: ${type}`);
        break;
    }
  });

  botProcess.on('exit', (code) => {
    const exitMessage = code === 0 ? 'stopped successfully' : `crashed with code ${code}`;

    logBotEvent(botInfo, {
      botId,
      info: `${botInfo.name} quit: ${exitMessage}`
    });

    bots.delete(botId);
  });

  const wsClient = getWsClientByUserId(botInfo.user.id);
  if (wsClient) {
    wsClient.send(JSON.stringify({
      type: BOT_STATUS_UPDATE,
      payload: {
        botId,
        isActive: true,
      }
    }));
  }
};

export const stopBot = async (botId: string) => {
  const bot = bots.get(botId);
  const botInfo = await getBotById(botId);

  if (bot) {
    sendToBotProcess({
      type: BOT_STOP,
      payload: {
        botId
      }
    }, bot.process);
    // bot.process.kill();
  } else {
    logBotEvent(botInfo, {
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