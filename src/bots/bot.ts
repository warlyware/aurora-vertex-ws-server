import { messageTypes } from "../types/messages";
import { TxAction } from "../utils/solana/get-actions-from-tx";
import { SolanaTxNotificationFromHeliusWithTimestamp } from "../types/solana";

const { BOT_SPAWN,
  BOT_STATUS_UPDATE,
  BOT_TRADE_NOTIFICATION,
  BOT_STOP,
  SOLANA_TX_EVENT_FOR_BOT,
  BOT_LOG_EVENT
} = messageTypes;

export type BotMessage = {
  type: typeof BOT_STATUS_UPDATE | typeof BOT_TRADE_NOTIFICATION | typeof BOT_SPAWN | typeof BOT_STOP;
  payload: {
    botId: string;
    keypair?: string;
    strategy?: string;
    info?: string;
    timestamp?: number;
    price?: number;
    quantity?: number;
    isActive?: boolean;
    message?: string;
    data?: any;
    actions?: TxAction[];
    tx?: SolanaTxNotificationFromHeliusWithTimestamp | undefined;
  }
}

const sendToBotManager = (message: BotMessage) => {
  process.send?.(message);
};

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

  const executeTradeLogic = (botId: string, strategy: string) => {
    console.log(`[${botId}] Executing trading logic...`);
    sendToBotManager({
      type: BOT_TRADE_NOTIFICATION,
      payload: {
        botId,
        timestamp: Date.now(),
        price: Math.random() * 100,
        quantity: Math.random() * 10,
      },
    });

    updateStats({
      timestamp: Date.now(),
      price: Math.random() * 100,
      quantity: Math.random() * 10,
    });
  };

  let statusReportInterval: NodeJS.Timeout;

  const handleSolanaEvent = (event: {
    type: typeof SOLANA_TX_EVENT_FOR_BOT;
    payload: {
      tx: SolanaTxNotificationFromHeliusWithTimestamp;
      actions: TxAction[];
      botId: string;
      strategy: string;
    }
  }) => {
    const txSignature = event.payload.tx?.params?.result?.signature;
    console.log('handleSolanaEvent', event.payload);

    let mainAction: TxAction | undefined;
    const isPumpFunBuy = event.payload.actions?.some(action => action.type === 'PUMPFUN_BUY');
    const isPumpFunSell = event.payload.actions?.some(action => action.type === 'PUMPFUN_SELL');

    if (isPumpFunBuy || isPumpFunSell) {
      mainAction = event.payload.actions?.find(action => action.type === 'PUMPFUN_BUY' || action.type === 'PUMPFUN_SELL');
    }

    const testRatio = 0.2;

    sendToBotManager({
      type: BOT_LOG_EVENT,
      payload: {
        botId: event.payload.botId,
        strategy: event.payload.strategy,
        info: mainAction?.description,
        data: event.payload
      }
    });

    const shouldExecuteTrade = false;

    if (shouldExecuteTrade) {
      executeTradeLogic(event.payload.botId, event.payload.strategy);
    }
  };

  const startBot = (botId: string) => {
    sendToBotManager({
      type: BOT_STATUS_UPDATE,
      payload: {
        ...status,
        botId,
      },
    });

    statusReportInterval = setInterval(() => {
      sendToBotManager({
        type: BOT_STATUS_UPDATE,
        payload: {
          ...status,
          botId,
        },
      });
    }, 1000);
  }

  process.on('message', async (message: BotMessage) => {
    const { type, payload } = message;
    const { botId, keypair, strategy } = payload;

    switch (type) {
      case BOT_SPAWN:
        if (!keypair) {
          console.error(`Missing required parameters for starting bot`);
          return;
        }

        startBot(botId);
        break;
      case BOT_STOP:
        console.log(`Stopping bot ${botId}`);
        cleanup();

        sendToBotManager({
          type: BOT_STATUS_UPDATE,
          payload: {
            ...status,
            isActive: false,
            info: `Bot stopped successfully`,
            botId,
          },
        });

        process.exit(0);
        break;
      case SOLANA_TX_EVENT_FOR_BOT:
        handleSolanaEvent({
          type: SOLANA_TX_EVENT_FOR_BOT,
          payload: {
            tx: payload.tx!,
            actions: payload.actions || [],
            botId: payload.botId,
            strategy: payload.strategy || 'default'
          }
        });
        break;
      default:
        console.log(`Unknown message message.type: ${type}`);
    }
  });

  const cleanup = () => {
    console.log(`Cleaning up before exit`);
    if (statusReportInterval) {
      clearInterval(statusReportInterval);
    }
  };

  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
})();
