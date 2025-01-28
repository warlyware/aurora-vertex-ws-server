process.on('message', (config: { botId: string; keypair: string; strategy: string }) => {
  const { botId, keypair, strategy } = config;

  console.log(`[${botId}] Starting bot with strategy: ${strategy}`);

  const executeLogic = () => {
    console.log(`[${botId}] Executing trading logic with keypair: ${keypair}`);
    process.send?.(`[${botId}] Trade executed`);
  };

  setInterval(executeLogic, 5000);
});
