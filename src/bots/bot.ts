export type BotMessage = {
  type: 'start' | 'stop' | 'restart' | 'status';
  payload: {
    botId: string;
    keypair?: string;
    strategy?: string;
    info?: string;
  }
}

(() => {
  const MAX_TRADE_HISTORY_LENGTH = 1000;

  const status: {
    isActive: boolean;
    tradesExecuted: number;
    errors: number;
    lastTradeTime: number | null;
    tradeHistory: any[];
  } = {
    isActive: true,
    tradesExecuted: 0,
    errors: 0,
    lastTradeTime: null,
    tradeHistory: [],
  };

  const updateStats = (tradeDetails: any) => {
    status.tradesExecuted += 1;
    status.lastTradeTime = Date.now();
    status.tradeHistory.push(tradeDetails);

    if (status.tradeHistory.length > MAX_TRADE_HISTORY_LENGTH) {
      status.tradeHistory.shift();
    }
  };

  let statusReportInterval: NodeJS.Timeout;
  let mockTradeExecutionInterval: NodeJS.Timeout;

  const initTrading = (botId: string) => {
    const executeTradeLogic = () => {
      console.log(`[${botId}] Executing trading logic...`);
      process.send?.(`Executing trading logic...`);

      updateStats({
        time: Date.now(),
        price: Math.random() * 100,
        quantity: Math.random() * 10,
      });
    };

    mockTradeExecutionInterval = setInterval(executeTradeLogic, 5000);
  };

  const startBot = (botId: string, strategy: string, keypair: string) => {
    process.send?.(`Starting bot with strategy: ${strategy}`);

    initTrading(botId);

    statusReportInterval = setInterval(() => {
      process.send?.(`Bot status: ${JSON.stringify(status)}`);
    }, 1000);
  }

  process.on('message', (message: string) => {
    const { type, payload } = JSON.parse(message);
    const { botId, keypair, strategy } = payload;

    switch (type) {
      case 'start':
        if (!strategy || !keypair) {
          console.error(`Missing required parameters for starting bot`);
          return;
        }
        startBot(botId, strategy, keypair);
        break;
      default:
        console.log(`Unknown message message.type: ${type}`);
    }
  });

  const cleanup = () => {
    console.log(`Cleaning up before exit`);
    if (mockTradeExecutionInterval) {
      clearInterval(mockTradeExecutionInterval);
    }
    if (statusReportInterval) {
      clearInterval(statusReportInterval);
    }
    process.exit(0);
  };

  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
})();
