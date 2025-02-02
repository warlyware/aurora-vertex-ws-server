import WebSocket from 'ws';
import { messageTypes } from '../../types/messages';
import { SolanaTxNotificationType } from '../../types/solana';
import dayjs from 'dayjs';

const { SOLANA_TX_NOTIFICATION } = messageTypes;

const MAX_CACHE_SIZE = 1000;
const MAX_RECONNECT_ATTEMPTS = 10;
let reconnectAttempts = 0;
let heliusWs: WebSocket | null = null;
let heliusBackupWs: WebSocket | null = null;
const processedSignatures = new Set<string>();
const TX_EXPIRATION_TIME = 30 * 1000; // 1 minute

const recentTxCache = new Map<string, SolanaTxNotificationType>();

const pruneOldTransactions = () => {
  while (recentTxCache.size > MAX_CACHE_SIZE) {
    const oldestKey = recentTxCache.keys().next().value;
    if (oldestKey) {
      recentTxCache.delete(oldestKey);
    }
  }
};

const closeWebSocket = () => {
  if (heliusWs) {
    heliusWs.removeAllListeners();
    heliusWs.close();
    heliusWs = null;
  }
};

const logEvent = (event: string) => {
  console.log(`${dayjs().format('YYYY-MM-DD HH:mm:ss')} - ${event}`);
}

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
    setupSolanaWatchers(clients);
  }, delay);
};

export const setupSolanaWatchers = (clients: Set<WebSocket>, isBackup = false) => {
  if (heliusWs && !isBackup) return;
  if (isBackup && heliusBackupWs) return;

  const wsInstance = new WebSocket(
    `wss://atlas-mainnet.helius-rpc.com/?api-key=${isBackup ? process.env.HELIUS_API_KEY_2 : process.env.HELIUS_API_KEY}`
  );

  wsInstance.on('open', () => {
    logEvent(`Helius ${isBackup ? "Backup" : "Primary"} WebSocket is open`);
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

    setInterval(() => {
      if (wsInstance?.readyState === WebSocket.OPEN) {
        wsInstance.ping();
      }
    }, 15000);
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

      logEvent(`Caching transaction at ${payloadWithTimestamp.payload.timestamp}: ${messageObj.params.result.signature}`);
      recentTxCache.set(messageObj.params.result.signature, payloadWithTimestamp);
      pruneOldTransactions();

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
    logEvent(`${isBackup ? "Backup" : "Primary"} WS Error: ${err}`);

    reconnect(clients);
  });

  wsInstance.on('close', (code, reason) => {
    // console.warn(`Helius WebSocket closed: Code ${code}, Reason: ${reason}`);
    logEvent(`Helius ${isBackup ? "Backup" : "Primary"} WebSocket closed. Attempting to reconnect...`);
    logEvent(`Code ${code}, Reason: ${reason}`);

    reconnect(clients);
  });

  if (isBackup) {
    heliusBackupWs = wsInstance;
  } else {
    heliusWs = wsInstance;
  }

  return {
    checkConnectionHealth: () => {
      const MAX_SILENCE_DURATION = 120000;

      const firstValue = recentTxCache.size ? recentTxCache.values().next().value : null;
      const lastMessageTime = firstValue ? firstValue.payload.timestamp : 0;
      if (heliusWs && lastMessageTime && Date.now() - lastMessageTime > MAX_SILENCE_DURATION) {
        logEvent('No messages received in 2 minutes. Restarting WebSocket...');
        closeWebSocket();
        setupSolanaWatchers(clients);
      }

      return true;
    },
    restoreTransactionsForClient(ws: WebSocket) {
      logEvent(`Restoring ${recentTxCache.size} transactions for new client`);
      for (const cachedTx of recentTxCache.values()) {
        ws.send(JSON.stringify(cachedTx));
      }
    },
    setupBackupConnection: () => {
      logEvent('Setting up backup connection');

      setupSolanaWatchers(clients);
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
