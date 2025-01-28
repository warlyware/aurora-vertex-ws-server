let interval: NodeJS.Timeout;

process.on('message', (config: { botId: string; keypair: string; strategy: string }) => {
  const { botId, keypair, strategy } = config;

  process.send?.(`Starting bot with strategy: ${strategy}`);

  const executeLogic = () => {
    console.log(`[${botId}] Executing trading logic...`);
    process.send?.(`Executing trading logic...`);
  };

  interval = setInterval(executeLogic, 5000);
});

const cleanup = () => {
  console.log(`Cleaning up before exit`);
  if (interval) {
    clearInterval(interval);
  }
  process.exit(0);
};

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
