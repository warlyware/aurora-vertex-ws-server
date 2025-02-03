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
const processedSignatures = new Set<string>();
const TX_EXPIRATION_TIME = 60000; // 1 minute
let firstHeartbeatReceived = false;

const recentTxCache = new Map<string, SolanaTxNotificationType>();
// Use one timestamp for transaction messages...
let lastReceivedTxTimestamp = Date.now();
// And a separate one for heartbeat (clock sysvar) messages.
let lastHeartbeatTimestamp = Date.now();

let lastRestartTimestamp: number | null = null;
let isReconnecting = false;

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

const logEvent = (event: string) => {
  console.log(`${dayjs().format('YYYY-MM-DD HH:mm:ss')} - ${event}`);
};

const storeTransaction = async (signature: string, transaction: any) => {
  if (!process.env.IS_PRODUCTION || !redis) return;
  await redis.set(`tx:${signature}`, JSON.stringify(transaction));
};

const restoreTransactions = async () => {
  if (!process.env.IS_PRODUCTION || !redis) return;
  const keys = await redis.keys('tx:*');
  const transactions = keys.length > 0 ? await redis.mget(...keys) : [];

  const AMOUNT_TO_SEND_TO_CLIENT = 300;
  const keysToSend = keys.slice(-AMOUNT_TO_SEND_TO_CLIENT);

  for (let i = 0; i < keysToSend.length; i++) {
    const key = keys[i];
    const transaction = transactions[i];
    if (transaction) {
      const parsedTx = JSON.parse(transaction);
      recentTxCache.set(key.split(':')[1], parsedTx);
    }
  }
};

export const setupSolanaWatchers = (clients: Set<WebSocket>) => {
  if (heliusWs) return;

  const wsInstance = new WebSocket(
    `wss://atlas-mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
  );

  (wsInstance as any).hasLoggedReconnect = false;

  const closeWebSocket = () => {
    if (!heliusWs) return;
    heliusWs.removeAllListeners();
    heliusWs.close();
    heliusWs = null;
  };

  const reconnect = (clients: Set<WebSocket>) => {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('Max reconnect attempts reached. Stopping.');
      return;
    }
    if (isReconnecting) {
      console.warn("Primary WebSocket already reconnecting, skipping...");
      return;
    }
    isReconnecting = true;
    const delay = Math.min(5000 * (2 ** reconnectAttempts), 60000);
    reconnectAttempts++;
    console.log(`Reconnecting Primary WebSocket in ${delay / 1000}s...`);
    setTimeout(() => {
      closeWebSocket();
      setupSolanaWatchers(clients);
      setTimeout(() => {
        isReconnecting = false;
      }, 1000);
    }, delay);
  };

  const checkConnectionHealth = async (clients: Set<WebSocket>) => {
    const MAX_SILENCE_DURATION = 10000;
    const threshold = MAX_SILENCE_DURATION;

    const lastEffectiveTimestamp = Math.max(lastReceivedTxTimestamp, lastHeartbeatTimestamp);

    if (!firstHeartbeatReceived) {
      logEvent("Waiting for initial heartbeat...");
      return;
    }

    if (isReconnecting) {
      if (!(wsInstance as any).hasLoggedReconnect) {
        logEvent(`Skipping connection health check: Primary is already reconnecting`);
        (wsInstance as any).hasLoggedReconnect = true;
      }
      return;
    } else {
      (wsInstance as any).hasLoggedReconnect = false;
    }

    if (Date.now() - lastEffectiveTimestamp > threshold) {
      isReconnecting = true;
      logEvent('No heartbeat or transaction received in last 10 seconds. Restarting WebSocket...');
      closeWebSocket();
      await new Promise((resolve) => setTimeout(resolve, 500));
      lastRestartTimestamp = Date.now();
      setupSolanaWatchers(clients);
    }
  };

  wsInstance.on('open', () => {
    logEvent(`Helius Primary WebSocket is open`);
    isReconnecting = false;
    // Reset both timestamps
    lastReceivedTxTimestamp = Date.now();
    lastHeartbeatTimestamp = Date.now();
    restoreTransactions();
    reconnectAttempts = 0;

    // --- Send two subscription messages ---
    // 1. Subscribe to transaction notifications (as before)
    wsInstance.send(JSON.stringify({
      "jsonrpc": "2.0",
      "id": `aurora-tx-${Date.now()}`,
      "method": "transactionSubscribe",
      "params": [
        {
          "vote": false,
          "failed": false,
          "accountInclude": [
            "DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj",
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
    logEvent(`Subscribed to transaction notifications`);

    wsInstance.send(JSON.stringify({
      "jsonrpc": "2.0",
      "id": `aurora-heartbeat-${Date.now()}`,
      "method": "accountSubscribe",
      "params": [
        "SysvarC1ock11111111111111111111111111111111",
        {
          "commitment": "processed",
          "encoding": "jsonParsed"
        }
      ]
    }));
    logEvent(`Subscribed to heartbeat (clock sysvar)`);

    // --- Set up intervals ---
    const pingInterval = setInterval(() => {
      if (wsInstance?.readyState === WebSocket.OPEN) {
        wsInstance.ping();
      }
    }, 30000);

    const healthCheckInterval = setInterval(async () => {
      await checkConnectionHealth(clients);
    }, 5000);

    wsInstance.on('close', (code, reason) => {
      clearInterval(pingInterval);
      clearInterval(healthCheckInterval);
      logEvent(`Helius Primary WebSocket closed. Attempting to reconnect...`);
      logEvent(`Code ${code}, Reason: ${reason}`);
      reconnect(clients);
    });
  });

  wsInstance.on('message', (data) => {
    try {
      const parsed = JSON.parse(data.toString('utf8'));

      if (!parsed?.params?.error) {
        logEvent(`ERROR: ${JSON.stringify(parsed.params.error)}`);
        return;
      }

      if (
        parsed?.params?.result &&
        parsed?.params?.result?.value?.data?.program === 'sysvar' &&
        parsed?.params?.result?.value?.data?.parsed?.type === 'clock'
      ) {
        lastHeartbeatTimestamp = Date.now();

        if (!firstHeartbeatReceived) {
          firstHeartbeatReceived = true;
          logEvent("Initial heartbeat received");
        }
        return;
      }

      // Otherwise, treat the message as a transaction notification.
      const messageObj: SolanaTxNotificationType['payload'] = parsed;

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

      logEvent(`Caching transaction ${messageObj.params.result.signature}`);
      recentTxCache.set(messageObj.params.result.signature, payloadWithTimestamp);
      storeTransaction(messageObj.params.result.signature, payloadWithTimestamp);
      pruneOldTransactions();
      lastReceivedTxTimestamp = Date.now();

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
    logEvent(`Primary WS Error: ${err}`);
    reconnect(clients);
  });

  wsInstance.on('close', (code, reason) => {
    logEvent(`Helius Primary WebSocket closed. Attempting to reconnect...`);
    logEvent(`Code ${code}, Reason: ${reason}`);
    reconnect(clients);
  });

  heliusWs = wsInstance;

  return {
    restoreTransactionsForClient(ws: WebSocket) {
      logEvent(`Restoring ${recentTxCache.size} transactions for new client`);
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
          logEvent(`Unknown message type: ${type}`);
          break;
      }
    }
  };
};
