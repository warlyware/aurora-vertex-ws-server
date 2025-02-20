import { messageTypes } from "../types/messages";
import { TxAction } from "../utils/solana/get-actions-from-tx";
import { SolanaTxNotificationFromHeliusWithTimestamp } from "../types/solana";
import { BotStrategy, getActiveStrategy, getBotById, getTargetTraderAddress } from "../utils/bots";
import { BotInfo } from "./manager";
import dayjs from "dayjs";
import { getAbbreviatedAddress } from "../utils/solana";

const { BOT_SPAWN,
  BOT_STATUS_UPDATE,
  BOT_TRADE_NOTIFICATION,
  BOT_STOP,
  SOLANA_TX_EVENT_FOR_BOT,
  BOT_LOG_EVENT
} = messageTypes;

const logToTerminal = (message: string) => {
  console.log(`${dayjs().format('YYYY-MM-DD HH:mm:ss')} ${message}`);
};

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
    profit?: number;
  }
}

type TokenSession = {
  mint: string;
  effectiveRatio: number;
  lastBuyPrice?: number;
  totalBought: number;
  totalSold: number;
  trades: {
    type: 'BUY' | 'SELL';
    price: number;
    amount: number;
    timestamp: number;
  }[];
  profit: number;
}

const getShouldExecuteTrade = (event: {
  actions: TxAction[];
  tx: SolanaTxNotificationFromHeliusWithTimestamp;
}, session: {
  bot: BotInfo | null;
  strategy: BotStrategy | null;
  tokens: { [tokenMint: string]: TokenSession };
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

  let mainAction: TxAction | undefined;
  const isPumpFunBuy = event.actions?.some(action => action.type === 'PUMPFUN_BUY');
  const isPumpFunSell = event.actions?.some(action => action.type === 'PUMPFUN_SELL');

  if (isPumpFunBuy || isPumpFunSell) {
    mainAction = event.actions?.find(action => action.type === 'PUMPFUN_BUY' || action.type === 'PUMPFUN_SELL');
  }

  if (!mainAction) {
    console.error('No trade action found');
    return false;
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

    if (!session.tokens[mainAction.tokenMint]) {
      session.tokens[mainAction.tokenMint] = {
        mint: mainAction.tokenMint,
        effectiveRatio: effectiveTradeRatio,
        totalBought: 0,
        totalSold: 0,
        trades: [],
        profit: 0
      };
    } else {
      session.tokens[mainAction.tokenMint].effectiveRatio = effectiveTradeRatio;
    }
  }

  if (!mainAction?.tokenMint) {
    console.error('No token mint found');
    return false;
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
      } else if (!session.tokens[mainAction.tokenMint]?.totalBought) {
        shouldExecuteTrade = false;
      } else {
        shouldExecuteTrade = true;
      }
      break;
    default:
      shouldExecuteTrade = false;
      break;
  }

  //   if (shouldExecuteTrade) {
  //     info = `
  // I am bot ${session.bot?.name} and I am considering a ${mainAction?.type} copytrade.
  // The original trade is for ${mainAction?.tokenAmount} ${mainAction?.tokenMint} costing ${mainAction?.solChange} SOL.
  // The current intendedTradeRatio is ${intendedTradeRatio}, therefore I will only buy up to ${amountToBuy} SOL.
  //   `
  //   } else {
  //     info = `
  // I am bot ${session.bot?.name} and I SKIPPING THIS ${mainAction?.type} copytrade.
  // `
  //   }

  // sendToBotManager({
  //   type: BOT_LOG_EVENT,
  //   payload: {
  //     botId: session.bot?.id,
  //     strategy: session.strategy?.name,
  //     info,
  //     data: {
  //       txSignature,
  //       isPumpFunBuy,
  //       isPumpFunSell,
  //       mainAction,
  //     }
  //   }
  // });

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
    tokens: { [tokenMint: string]: TokenSession };
    profit: number;
  } = {
    bot: null,
    strategy: null,
    targetTraderAddress: null,
    tokenEffectiveRatios: {},
    tokens: {},
    profit: 0
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
    tokens: { [tokenMint: string]: TokenSession };
    profit: number;
  }) => {
    const mainAction = payload.actions?.find(action =>
      action.type === 'PUMPFUN_BUY' || action.type === 'PUMPFUN_SELL'
    );

    if (!mainAction?.tokenMint || !mainAction.solChange || !mainAction.tokenAmount) {
      console.error('Missing required trade information');
      return;
    }

    const tradeType = mainAction.type === 'PUMPFUN_BUY' ? 'BUY' : 'SELL';
    const price = Math.abs(mainAction.solChange / mainAction.tokenAmount);
    const amount = Math.abs(mainAction.tokenAmount);

    const tokenSession = session.tokens[mainAction.tokenMint];
    if (tokenSession) {
      if (tradeType === 'BUY') {
        tokenSession.lastBuyPrice = price;
        tokenSession.totalBought += amount;
      } else {
        tokenSession.totalSold += amount;
      }

      tokenSession.trades.push({
        type: tradeType,
        price,
        amount,
        timestamp: Date.now()
      });

      const profit = tokenSession.lastBuyPrice
        ? ((price - tokenSession.lastBuyPrice) / tokenSession.lastBuyPrice) * 100
        : 0;

      let info = `EXECUTING ${tradeType}`;

      if (profit !== 0) {
        session.profit += profit;
        info += ` || Est. profit: ${profit.toFixed(2)}% ${profit > 0 ? '🟢' : '🔴'}`;
        info += ` || Total: ${session.profit.toFixed(2)}%`;
      }

      sendToBotManager({
        type: BOT_LOG_EVENT,
        payload: {
          botId: payload.botId,
          info,
        },
      });
    }

    updateStats({
      timestamp: Date.now(),
      price,
      quantity: amount,
      type: tradeType,
      tokenMint: mainAction.tokenMint
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

    logToTerminal(`Solana tx received ${getAbbreviatedAddress(event.payload.tx.params.result.signature)}`);

    let shouldExecuteTrade = false;
    if (traderAddress !== session.targetTraderAddress) {
      // logToTerminal(`Skipping trade`);
      shouldExecuteTrade = false;
    } else {
      shouldExecuteTrade = getShouldExecuteTrade(event.payload, session);
    }

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
          profit: session.profit,
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
            profit: session.profit,
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
