import 'dotenv/config';
import WebSocket from 'ws';
import { messageTypes } from '../../types/messages';
import { SolanaTxNotificationType } from '../../types/solana';
import dayjs from 'dayjs';
import Redis from 'ioredis';

const { SOLANA_TX_NOTIFICATION } = messageTypes;

const MAX_CACHE_SIZE = 1000;
const MAX_RECONNECT_ATTEMPTS = 10;
let reconnectAttempts = 0;
let heliusWs: WebSocket | null = null;
let heliusBackupWs: WebSocket | null = null;
const processedSignatures = new Set<string>();
const TX_EXPIRATION_TIME = 60000; // 1 minute

const recentTxCache = new Map<string, SolanaTxNotificationType>();
let lastReceivedMessageTimestamp = Date.now();


let redis: Redis | null = null;

(() => {
  console.log('process.env.IS_PRODUCTION:', !!process.env.IS_PRODUCTION);

  if (process.env.IS_PRODUCTION) {
    redis = new Redis();
    console.log('✅ Redis connected in production mode');
  } else {
    console.log('🚨 Redis not connected in development mode');
  }
})();

const pruneOldTransactions = () => {
  while (recentTxCache.size > MAX_CACHE_SIZE) {
    const oldestKey = recentTxCache.keys().next().value;
    if (oldestKey) {
      recentTxCache.delete(oldestKey);
    }
  }
};

const logEvent = (event: string, isBackup: boolean) => {
  if (isBackup) {
    console.log(`BACKUP: ${dayjs().format('YYYY-MM-DD HH:mm:ss')} - ${event}`);
    return;
  }
  console.log(`PRIMARY: ${dayjs().format('YYYY-MM-DD HH:mm:ss')} - ${event}`);
}

const storeTransaction = async (signature: string, transaction: any) => {
  if (!process.env.IS_PRODUCTION || !redis) return;

  await redis.set(`tx:${signature}`, JSON.stringify(transaction));
};

const restoreTransactions = async () => {
  if (!process.env.IS_PRODUCTION || !redis) return;

  const keys = await redis.keys('tx:*');
  const transactions = keys.length > 0 ? await redis.mget(...keys) : [];

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const transaction = transactions[i];

    if (transaction) {
      const parsedTx = JSON.parse(transaction);
      recentTxCache.set(key.split(':')[1], parsedTx);
    }
  }
}

export const setupSolanaWatchers = (clients: Set<WebSocket>, isBackup = false) => {
  if (heliusWs && !isBackup) return;
  if (isBackup && heliusBackupWs) return;

  const wsInstance = new WebSocket(
    `wss://atlas-mainnet.helius-rpc.com/?api-key=${isBackup ? process.env.HELIUS_API_KEY_2 : process.env.HELIUS_API_KEY}`
  );

  const closeWebSocket = () => {
    if (!heliusWs && !heliusBackupWs) return;

    if (heliusWs && !isBackup) {
      heliusWs.removeAllListeners();
      heliusWs.close();
      heliusWs = null;
    }
    if (heliusBackupWs && isBackup) {
      heliusBackupWs.removeAllListeners();
      heliusBackupWs.close();
      heliusBackupWs = null;
    }
  };

  const reconnect = (clients: Set<WebSocket>) => {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('Max reconnect attempts reached. Stopping.');
      return;
    }

    console.log(`Attempting to reconnect...`);

    const delay = Math.min(5000 * (2 ** reconnectAttempts), 60000);
    reconnectAttempts++;

    setTimeout(() => {
      console.log(`Reconnecting in ${delay / 1000}s...`);
      closeWebSocket();
      setupSolanaWatchers(clients, isBackup);
    }, delay);
  };

  wsInstance.on('open', () => {
    logEvent(`Helius ${isBackup ? "Backup" : "Primary"} WebSocket is open`, isBackup);

    if (!isBackup) restoreTransactions();

    reconnectAttempts = 0;

    wsInstance!.send(JSON.stringify({
      "jsonrpc": "2.0",
      "id": `aurora-${Date.now()}`,
      "method": "transactionSubscribe",
      "params": [
        {
          "vote": false,
          "failed": false,
          "accountInclude": [
            "DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj"
            // "6LChaYRYtEYjLEHhzo4HdEmgNwu2aia8CM8VhR9wn6n7", // high activity
            // "6eDPccEWC1BbJXBdEHA3pc2NjThZwAf5n3wb9rxkmuaf", // high activity
            // "BieeZkdnBAgNYknzo3RH2vku7FcPkFZMZmRJANh2TpW",  
          ]
        },
        {
          "commitment": "processed",
          "encoding": "jsonParsed",
          "transactionDetails": "full",
          "showRewards": true,
          "maxSupportedTransactionVersion": 0
        }
      ]
    }));

    logEvent(`Subscribed to transaction notifications`, isBackup);

    setInterval(() => {
      if (wsInstance?.readyState === WebSocket.OPEN) {
        wsInstance.ping();
      }
    }, 30000);

    const checkConnectionHealth = async (clients: Set<WebSocket>) => {
      const MAX_SILENCE_DURATION = 120000;
      if (Date.now() - lastReceivedMessageTimestamp > MAX_SILENCE_DURATION) {
        logEvent('No messages received in 2 minutes. Restarting WebSocket...', isBackup);
        await new Promise((resolve) => setTimeout(resolve, isBackup ? 10000 : 0));
        closeWebSocket();
        await new Promise((resolve) => setTimeout(resolve, isBackup ? 500 : 0));
        setupSolanaWatchers(clients, isBackup);
      }
    };

    setInterval(() => {
      checkConnectionHealth(clients);
    }, 60000);
  });

  wsInstance.on('message', (data) => {
    try {
      const messageObj: SolanaTxNotificationType['payload'] = JSON.parse(data.toString('utf8'));

      if (
        !messageObj.params?.result?.signature ||
        processedSignatures.has(messageObj.params?.result?.signature)
      ) {
        return;
      }

      processedSignatures.add(messageObj.params.result.signature);

      setTimeout(() => {
        processedSignatures.delete(messageObj.params.result.signature);
      }, TX_EXPIRATION_TIME);

      const payloadWithTimestamp: SolanaTxNotificationType = {
        type: SOLANA_TX_NOTIFICATION,
        payload: {
          timestamp: Date.now(),
          ...messageObj
        }
      };

      logEvent(`Caching transaction ${messageObj.params.result.signature}`, isBackup);
      recentTxCache.set(messageObj.params.result.signature, payloadWithTimestamp);
      storeTransaction(messageObj.params.result.signature, payloadWithTimestamp);
      pruneOldTransactions();
      lastReceivedMessageTimestamp = Date.now();

      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(payloadWithTimestamp));
        }
      }
    } catch (e) {
      console.error('Failed to parse JSON:', e);
    }
  });

  wsInstance.on('error', (err) => {
    logEvent(`${isBackup ? "Backup" : "Primary"} WS Error: ${err}`, isBackup);

    reconnect(clients);
  });

  wsInstance.on('close', (code, reason) => {
    // console.warn(`Helius WebSocket closed: Code ${code}, Reason: ${reason}`);
    logEvent(`Helius ${isBackup ? "Backup" : "Primary"} WebSocket closed. Attempting to reconnect...`, isBackup);
    logEvent(`Code ${code}, Reason: ${reason}`, isBackup);

    reconnect(clients);
  });

  if (isBackup) {
    heliusBackupWs = wsInstance;
  } else {
    heliusWs = wsInstance;
  }

  return {
    backupExists: () => !!heliusBackupWs,

    restoreTransactionsForClient(ws: WebSocket) {
      logEvent(`Restoring ${recentTxCache.size} transactions for new client`, isBackup);
      for (const cachedTx of recentTxCache.values()) {
        ws.send(JSON.stringify(cachedTx));
      }
    },

    handleMessage: async (message: { type: string; payload: string }, ws: WebSocket) => {
      const { type, payload } = message;

      switch (type) {
        case SOLANA_TX_NOTIFICATION:
          break;
        default:
          logEvent(`Unknown message type: ${type}`, isBackup);
          break;
      }
    }
  };
};
