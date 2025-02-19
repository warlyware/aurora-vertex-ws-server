import { messageTypes } from "../types/messages";
import { TxAction } from "../utils/solana/get-actions-from-tx";
import { SolanaTxNotificationFromHeliusWithTimestamp } from "../types/solana";
import { BotStrategy, getActiveStrategy, getBotById, getTargetTraderAddress } from "../utils/bots";
import { BotInfo } from "./manager";

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

const getShouldExecuteTrade = (event: {
  actions: TxAction[];
  tx: SolanaTxNotificationFromHeliusWithTimestamp;
}, session: {
  bot: BotInfo | null;
  strategy: BotStrategy | null;
  tokenEffectiveRatios: { [tokenMint: string]: number };
}) => {
  const {
    id,
    name,
    maxBuyAmount,
    stopLossPercentage,
    takeProfitPercentage,
    shouldCopyBuys,
    shouldCopySells,
    shouldEjectOnBuy,
    shouldEjectOnCurve,
    shouldSellOnCurve,
    slippagePercentage,
    priorityFee,
    intendedTradeRatio
  } = session.strategy || {};

  const txSignature = event.tx?.params?.result?.signature;
  console.log('handleSolanaEvent', event.tx);

  let mainAction: TxAction | undefined;
  const isPumpFunBuy = event.actions?.some(action => action.type === 'PUMPFUN_BUY');
  const isPumpFunSell = event.actions?.some(action => action.type === 'PUMPFUN_SELL');

  if (isPumpFunBuy || isPumpFunSell) {
    mainAction = event.actions?.find(action => action.type === 'PUMPFUN_BUY' || action.type === 'PUMPFUN_SELL');
  }

  if (!session.bot?.id) {
    console.error('No bot id found');
    return false;
  }

  let shouldExecuteTrade = false;
  let info: string | undefined;

  let amountToBuy = 0;
  let effectiveTradeRatio = intendedTradeRatio ?? 0;

  if (mainAction?.solChange && mainAction.tokenMint) {
    const originalTradeAmount = Math.abs(mainAction.solChange);
    const intendedTradeAmount = originalTradeAmount * effectiveTradeRatio;
    amountToBuy = Math.min(intendedTradeAmount, maxBuyAmount ?? 0);

    effectiveTradeRatio = amountToBuy / originalTradeAmount;
    session.tokenEffectiveRatios = session.tokenEffectiveRatios || {};
    session.tokenEffectiveRatios[mainAction.tokenMint] = effectiveTradeRatio;
  }

  switch (mainAction?.type) {
    case 'PUMPFUN_BUY':
      if (!shouldCopyBuys) {
        shouldExecuteTrade = false;
      } else {
        shouldExecuteTrade = true;
      }
      break;
    case 'PUMPFUN_SELL':
      if (!shouldCopySells) {
        shouldExecuteTrade = false;
      } else {
        shouldExecuteTrade = true;
      }
      break;
    default:
      shouldExecuteTrade = false;
      break;
  }

  info = `
I am bot ${session.bot?.name} and I am considering a ${mainAction?.type} copytrade.
The original trade is for ${mainAction?.tokenAmount} ${mainAction?.tokenMint} costing ${mainAction?.solChange} SOL.
The current maxBuyAmount is ${maxBuyAmount} SOL, therefore I will only buy up to ${maxBuyAmount} SOL.
The current stopLossPercentage is ${stopLossPercentage}, therefore I will sell if the price drops below ${stopLossPercentage}%.
The current takeProfitPercentage is ${takeProfitPercentage}, therefore I will sell if the price rises above ${takeProfitPercentage}%.
The current intendedTradeRatio is ${intendedTradeRatio}, therefore I will only buy up to ${amountToBuy} SOL.
  `

  sendToBotManager({
    type: BOT_LOG_EVENT,
    payload: {
      botId: session.bot?.id,
      strategy: session.strategy?.name,
      info,
      data: {
        txSignature,
        isPumpFunBuy,
        isPumpFunSell,
        mainAction,
      }
    }
  });

  return shouldExecuteTrade;
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

  const session: {
    bot: BotInfo | null;
    strategy: BotStrategy | null;
    targetTraderAddress: string | null;
    tokenEffectiveRatios: { [tokenMint: string]: number };
  } = {
    bot: null,
    strategy: null,
    targetTraderAddress: null,
    tokenEffectiveRatios: {},
  };

  const updateStats = (tradeDetails: any) => {
    status.tradesExecuted += 1;
    status.lastTradeTime = Date.now();
    status.tradeHistory.push(tradeDetails);

    if (status.tradeHistory.length > MAX_TRADE_HISTORY_LENGTH) {
      status.tradeHistory.shift();
    }
  };

  const executeTradeLogic = (payload: {
    tx: SolanaTxNotificationFromHeliusWithTimestamp;
    actions: TxAction[];
    botId: string;
    strategy: string;
  }, session: {
    bot: BotInfo | null;
    strategy: BotStrategy | null;
    targetTraderAddress: string | null;
    tokenEffectiveRatios: { [tokenMint: string]: number };
  }) => {
    // sendToBotManager({
    //   type: BOT_TRADE_NOTIFICATION,
    //   payload: {
    //     botId,
    //     timestamp: Date.now(),
    //     price: Math.random() * 100,
    //     quantity: Math.random() * 10,
    //   },
    // });
    sendToBotManager({
      type: BOT_LOG_EVENT,
      payload: {
        botId: payload.botId,
        info: `!!! Executing copytrade against ${payload.tx.params.result.signature} !!!`,
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
    let info: string | undefined;
    const traderAddress = event.payload.actions.find(action => action.type === 'PUMPFUN_BUY' || action.type === 'PUMPFUN_SELL')?.source;

    if (session.targetTraderAddress && traderAddress !== session.targetTraderAddress) {
      info = `Skipping trade, trader address ${traderAddress} does not match target trader address ${session.targetTraderAddress}`;
    }

    const shouldExecuteTrade = getShouldExecuteTrade(event.payload, session);

    if (shouldExecuteTrade) {
      executeTradeLogic(event.payload, session);
    }
  };

  const startBot = async (botId: string) => {
    session.bot = await getBotById(botId);
    session.strategy = await getActiveStrategy(session.bot);
    session.targetTraderAddress = await getTargetTraderAddress(session.bot);

    if (!session.strategy || !session.targetTraderAddress) {
      console.error(`No strategy or target trader address found for bot ${botId}`);
      return;
    }

    sendToBotManager({
      type: BOT_LOG_EVENT,
      payload: {
        botId,
        info: `Starting bot ${botId}`
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
    const { botId, keypair } = payload;

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
