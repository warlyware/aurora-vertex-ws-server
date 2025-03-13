import { messageTypes } from "../types/messages";
import { TxAction } from "../utils/solana/get-actions-from-tx";
import { SolanaTxNotificationFromHeliusWithTimestamp } from "../types/solana";
import { BotStrategy, getActiveStrategy, getBotById, getTargetTraderAddress } from "../utils/bots";
import { BotInfo } from "./manager";
import dayjs from "dayjs";
import { getAbbreviatedAddress, getSPLBalance } from "../utils/solana";
import axios from "axios";
import { AURORA_VERTEX_API_KEY, AURORA_VERTEX_API_URL } from "../constants";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Connection, PublicKey } from "@solana/web3.js";
import { logServerEvent } from "../logging";
const { BOT_SPAWN,
  BOT_STATUS_UPDATE,
  BOT_STOP,
  SOLANA_TX_EVENT_FOR_BOT,
  BOT_LOG_EVENT
} = messageTypes;

const logToTerminal = (message: string) => {
  console.log(`${dayjs().format('YYYY-MM-DD HH:mm:ss')} ${message}`);

  logServerEvent(message);
};

// Local version of logBotEvent that sends through the IPC channel
const logBotEvent = (bot: BotInfo, payload: { info: string; meta?: any }) => {
  sendToBotManager({
    type: BOT_LOG_EVENT,
    payload: {
      botId: bot.id,
      ...payload
    }
  });
};

export type BotMessage = {
  type: typeof BOT_STATUS_UPDATE | typeof BOT_SPAWN | typeof BOT_STOP;
  payload: {
    status?: any;
    tradeHistory?: any;
    lastTradeTime?: any;
    errors?: any;
    tradesExecuted?: any;
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

const getShouldExecuteTrade = (mainAction: TxAction, session: {
  profit: number;
  bot: BotInfo | null;
  strategy: BotStrategy | null;
  tokens: { [tokenMint: string]: TokenSession };
}) => {
  const {
    shouldCopyBuys,
    shouldCopySells,
    intendedTradeRatio
  } = session.strategy || {};
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
    const isBuy = mainAction.type === 'PUMPFUN_BUY';
    const lamportsChange = Math.abs(mainAction.solChange) * LAMPORTS_PER_SOL;
    const lamoportsMaxBuyAmount = (session.strategy?.maxBuyAmount || 0) * LAMPORTS_PER_SOL;
    const originalTradeAmount = isBuy ? lamportsChange : Math.abs(mainAction.tokenAmount ?? 0);
    const intendedTradeAmount = originalTradeAmount * effectiveTradeRatio;
    amountToBuy = Math.min(intendedTradeAmount, lamoportsMaxBuyAmount);

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

  if (shouldExecuteTrade && mainAction?.tokenMint && mainAction.solChange && mainAction.tokenAmount) {
    const tradeType = mainAction.type === 'PUMPFUN_BUY' ? 'BUY' : 'SELL';
    const price = Math.abs(mainAction.solChange / mainAction.tokenAmount);
    const originalTradeAmount = Math.abs(mainAction.tokenAmount);
    const effectiveTradeRatio = session.tokens[mainAction.tokenMint]?.effectiveRatio ?? 0;

    if (!effectiveTradeRatio) {
      console.error('No effective trade ratio found, aborting trade');
      return false;
    }

    const amount = Math.abs(originalTradeAmount * effectiveTradeRatio);

    // Update token session
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

      if (profit !== 0) {
        session.profit += profit;
      }
    }
  }

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

  const executeTradeLogic = async (payload: {
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

    const effectiveTradeRatio = session.tokens[mainAction.tokenMint]?.effectiveRatio ?? 0;
    const lamportsChange = Math.abs(mainAction.solChange) * LAMPORTS_PER_SOL;

    const {
      maxBuyAmount,
      stopLossPercentage,
      takeProfitPercentage,
      slippagePercentage,
      priorityFee,
      intendedTradeRatio,
      shouldCopyBuys,
      shouldCopySells,
      shouldEjectOnBuy,
      shouldEjectOnCurve,
      shouldSellOnCurve,
      shouldAutoSell,
      autoSellDelayInMs
    } = session.strategy || {};

    const lamoportsMaxBuyAmount = (maxBuyAmount || 0) * LAMPORTS_PER_SOL;

    const ejectWalletAddress = session.bot?.ejectWallet?.address;

    // Declare variables outside if/else block so they're available for logging
    let amount: number;
    let originalTradeAmount: number;
    let intendedTradeAmount: number;

    if (mainAction.type === 'PUMPFUN_BUY') {
      originalTradeAmount = lamportsChange;
      intendedTradeAmount = originalTradeAmount * effectiveTradeRatio;
      amount = Math.floor(Math.min(intendedTradeAmount, lamoportsMaxBuyAmount)); // Ensure whole number for lamports
    } else {
      // For sells, work directly with token amounts and keep them as whole numbers
      originalTradeAmount = Math.abs(mainAction.tokenAmount);
      intendedTradeAmount = originalTradeAmount * effectiveTradeRatio;
      amount = Math.floor(intendedTradeAmount); // Ensure whole number for tokens
    }

    if (!session.bot) {
      console.error('No bot found');
      return;
    }

    if (tradeType === 'BUY' && !shouldCopyBuys) {
      return;
    }

    if (tradeType === 'SELL' && (!shouldCopySells && !shouldSellOnCurve && !shouldAutoSell)) {
      return;
    }

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

      logBotEvent(session.bot, {
        info,
      });
    }

    console.log("Executing trade", {
      timestamp: Date.now(),
      price,
      quantity: amount,
      lamportsChange,
      lamoportsMaxBuyAmount,
      originalTradeAmount,
      intendedTradeAmount,
      effectiveTradeRatio,
      type: tradeType,
      tokenMint: mainAction.tokenMint
    });

    let buySignature: string | undefined;
    let sendSignature: string | undefined;

    const bot = session.bot;
    if (tradeType === 'BUY') {
      logBotEvent(bot, {
        info: `Attempting to buy ${amount / LAMPORTS_PER_SOL} SOL of ${mainAction.tokenMint}`,
        meta: {
          price,
          quantity: amount,
          lamportsChange,
          lamoportsMaxBuyAmount,
          originalTradeAmount,
          intendedTradeAmount,
          effectiveTradeRatio,
          type: tradeType,
          tokenMint: mainAction.tokenMint
        }
      });

      logToTerminal(`Attempting to buy ${amount / LAMPORTS_PER_SOL} SOL of ${mainAction.tokenMint}`);

      const response = await axios.post(`${AURORA_VERTEX_API_URL}/buy-on-pumpfun`, {
        botId: payload.botId,
        mintAddress: mainAction.tokenMint,
        amountInLamports: amount,
        apiKey: AURORA_VERTEX_API_KEY,
        priorityFeeInLamports: session.strategy?.priorityFee,
        destinationAddress: (!shouldAutoSell && shouldEjectOnBuy && ejectWalletAddress) ? ejectWalletAddress : undefined,
        shouldAutoSell,
        autoSellDelayInMs
      }).catch(error => {
        console.error('Error executing buy order:', error.message);

        logBotEvent(bot, {
          info: `Buy order error: ${error.message}`,
          meta: {
            error: error.message,
            buySignature: buySignature,
            sendSignature: sendSignature
          }
        });

        status.errors += 1;
        return;
      });

      if (response?.data?.buySignature) {
        buySignature = response.data.buySignature;
      }

      if (response?.data?.sendSignature) {
        sendSignature = response.data.sendSignature;
      }

      logBotEvent(session.bot, {
        info: `Buy order response: ${JSON.stringify(response?.data)}`,
        meta: {
          response: response?.data,
          buySignature: response?.data?.buySignature,
          sendSignature: response?.data?.sendSignature,
          mintAddress: mainAction.tokenMint,
          amountInLamports: amount,
          destinationAddress: shouldEjectOnBuy && ejectWalletAddress ? ejectWalletAddress : undefined
        }
      });

      logToTerminal(`Buy order response: ${JSON.stringify(response?.data)}`);
    } else {
      logBotEvent(bot, {
        info: `Attempting to sell ${amount} tokens of ${mainAction.tokenMint}`,
        meta: {
          price,
          quantity: amount,
          type: tradeType,
          tokenMint: mainAction.tokenMint
        }
      });

      const response = await axios.post(`${AURORA_VERTEX_API_URL}/sell-on-pumpfun`, {
        botId: payload.botId,
        mintAddress: mainAction.tokenMint,
        tokenAmount: amount,
        apiKey: AURORA_VERTEX_API_KEY,
        priorityFeeInLamports: session.strategy?.priorityFee
      }).catch(error => {
        console.error('Error executing sell order:', error.message);
        status.errors += 1;
        return;
      });

      console.log("Sell order response", response?.data);

      logBotEvent(session.bot, {
        info: `Sell order response: ${JSON.stringify(response?.data)}`,
        meta: {
          response: response?.data,
          sellSignature: response?.data?.sellSignature,
          mintAddress: mainAction.tokenMint,
          tokenAmount: amount,
        }
      });
    }

    updateStats({
      timestamp: Date.now(),
      price,
      quantity: amount,
      type: tradeType,
      tokenMint: mainAction.tokenMint
    });

    logBotEvent(session.bot, {
      info: `${tradeType} executed: ${amount} tokens at ${price} SOL`,
      meta: {
        timestamp: Date.now(),
        price,
        quantity: amount,
        type: tradeType,
        tokenMint: mainAction.tokenMint,
        profit: session.profit,
        shouldEjectOnBuy,
        buySignature,
        sendSignature
      }
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
      let mainAction: TxAction | undefined;
      const isPumpFunBuy = event.payload.actions?.some(action => action.type === 'PUMPFUN_BUY');
      const isPumpFunSell = event.payload.actions?.some(action => action.type === 'PUMPFUN_SELL');

      if (isPumpFunBuy || isPumpFunSell) {
        mainAction = event.payload.actions?.find(action => action.type === 'PUMPFUN_BUY' || action.type === 'PUMPFUN_SELL');
      }

      console.log("Main action", {
        isPumpFunBuy,
        isPumpFunSell,
        sig: event.payload.tx.params.result.signature,
        mainAction
      });

      if (!mainAction) {
        console.error('No main action found');
        return;
      }

      shouldExecuteTrade = getShouldExecuteTrade(mainAction, session);
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
      // kill bot
      process.exit(0);
      return;
    }

    logBotEvent(session.bot, {
      info: `${session.bot?.name} started!`
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
