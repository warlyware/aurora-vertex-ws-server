import { fork, ChildProcess } from 'child_process';
import path from 'path';
import { sendToConnectedClients } from '..';
import { BotMessage } from './bot';
import { messageTypes } from '../types/messages';

const { BOT_NOTIFICATION, BOT_SPAWN, BOT_STOP } = messageTypes;

const bots: Map<string, {
  process: ChildProcess,
  strategy: string
}> = new Map();

const sendToBotProcess = ({
  type,
  payload
}: BotMessage, botProcess: ChildProcess) => {
  botProcess.send(JSON.stringify({
    type,
    payload,
  }));
};

export const spawnBot = (botId: string, strategy: string) => {
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

  botProcess.on('message', (message: string) => {
    sendToConnectedClients(JSON.parse(message));
  });

  botProcess.on('exit', (code) => {
    const exitMessage = code === 0 ? 'stopped successfully' : `crashed with code ${code}`;
    sendToConnectedClients({
      type: BOT_NOTIFICATION,
      payload: {
        botId,
        info: `Bot ${botId} ${exitMessage}`
      }
    });

    bots.delete(botId);
  });

  bots.set(botId, {
    process: botProcess,
    strategy,
  });

  sendToConnectedClients({
    type: BOT_NOTIFICATION,
    payload: {
      botId,
      info: `Bot ${botId} spawned`
    }
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
    sendToConnectedClients({
      type: BOT_NOTIFICATION,
      payload: {
        botId,
        info: `Bot ${botId} not found`
      }
    });
  }
};