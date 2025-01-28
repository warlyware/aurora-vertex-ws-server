import { fork, ChildProcess } from 'child_process';
import path from 'path';
import { logToClient } from '..';

const bots: Map<string, {
  process: ChildProcess,
  strategy: string
}> = new Map();

export const spawnBot = (botId: string, strategy: string) => {
  const botScript = path.resolve(__dirname, './bot.js');
  const botProcess = fork(botScript);

  const keypair = `keypair-${botId}`;

  botProcess.send({
    botId,
    keypair,
    strategy,
  });

  botProcess.on('message', (message) => {
    logToClient(`[${botId}] ${message}`);
  });

  botProcess.on('exit', (code) => {
    logToClient(`[Bot ${botId}] Exited with code ${code}`);
    bots.delete(botId);
  });

  bots.set(botId, {
    process: botProcess,
    strategy,
  });

  logToClient(`Bot ${botId} spawned.`);
};

export const stopBot = (botId: string) => {
  const bot = bots.get(botId);
  if (bot) {
    bot.process.kill();
    logToClient(`Bot ${botId} stopped.`);
  } else {
    logToClient(`Bot ${botId} not found.`);
  }
};

export const restartBot = (botId: string) => {
  stopBot(botId);
  const strategy = bots.get(botId)?.strategy;
  if (!strategy) {
    logToClient(`Bot ${botId} has no strategy, aborting restart.`);
    return;
  }
  spawnBot(botId, strategy);
};
