import { fork, ChildProcess } from 'child_process';
import path from 'path';

const bots: Map<string, ChildProcess> = new Map();

export const spawnBot = (botId: string, keypair: string, strategy: string) => {
  const botScript = path.resolve(__dirname, './bot.js');
  const botProcess = fork(botScript);

  botProcess.send({
    botId,
    keypair,
    strategy,
  });

  botProcess.on('message', (message) => {
    console.log(`[Bot ${botId}] Message:`, message);
  });

  botProcess.on('exit', (code) => {
    console.error(`[Bot ${botId}] Exited with code ${code}`);
    bots.delete(botId);
  });

  bots.set(botId, botProcess);
  console.log(`Bot ${botId} spawned.`);
};

export const stopBot = (botId: string) => {
  const botProcess = bots.get(botId);
  if (botProcess) {
    botProcess.kill();
    console.log(`Bot ${botId} stopped.`);
  } else {
    console.error(`Bot ${botId} not found.`);
  }
};

export const restartBot = (botId: string, keypair: string, strategy: string) => {
  stopBot(botId);
  spawnBot(botId, keypair, strategy);
};
