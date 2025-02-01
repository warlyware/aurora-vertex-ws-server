import WebSocket from 'ws';
import { messageTypes } from '../../types/messages';
import { SolanaTxNotificationType } from '../../types/solana';

const { SOLANA_TX_NOTIFICATION } = messageTypes;

const MAX_CACHE_SIZE = 1000;
const MAX_RECONNECT_ATTEMPTS = 10;
let reconnectAttempts = 0;
let heliusWs: WebSocket | null = null;

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

export const setupSolanaWatchers = (clients: Set<WebSocket>) => {
  if (heliusWs) return;

  heliusWs = new WebSocket(
    `wss://atlas-mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
  );

  heliusWs.on('open', () => {
    console.log('Helius WebSocket is open');
    reconnectAttempts = 0;

    heliusWs!.send(JSON.stringify({
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
      if (heliusWs?.readyState === WebSocket.OPEN) {
        heliusWs.ping();
        console.log('Ping sent');
      }
    }, 30000);
  });

  heliusWs.on('message', (data) => {
    try {
      const messageObj: SolanaTxNotificationType['payload'] = JSON.parse(data.toString('utf8'));

      if (!messageObj.params?.result?.signature) return;

      const payloadWithTimestamp: SolanaTxNotificationType = {
        type: SOLANA_TX_NOTIFICATION,
        payload: {
          timestamp: Date.now(),
          ...messageObj
        }
      };

      console.log(`Caching transaction at ${payloadWithTimestamp.payload.timestamp}: ${messageObj.params.result.signature}`);
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

  heliusWs.on('error', (err) => {
    console.error('Helius WebSocket error:', err.message);

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('Max reconnect attempts reached. Stopping.');
      return;
    }

    const delay = Math.min(5000 * (2 ** reconnectAttempts), 60000);
    reconnectAttempts++;

    setTimeout(() => {
      console.log(`Reconnecting in ${delay / 1000}s...`);
      closeWebSocket();
      setupSolanaWatchers(clients);
    }, delay);
  });

  heliusWs.on('close', (code, reason) => {
    console.warn(`Helius WebSocket closed: Code ${code}, Reason: ${reason}`);

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('Max reconnect attempts reached. Stopping.');
      return;
    }

    setTimeout(() => {
      closeWebSocket();
      setupSolanaWatchers(clients);
    }, 500);
  });

  return {
    restoreTransactionsForClient(ws: WebSocket) {
      console.log(`Restoring ${recentTxCache.size} transactions for new client`);
      for (const cachedTx of recentTxCache.values()) {
        ws.send(JSON.stringify(cachedTx));
      }
    },

    handleMessage: async (message: { type: string; payload: string }, ws: WebSocket) => {
      const { type, payload } = message;

      console.log({ type, payload });

      switch (type) {
        case SOLANA_TX_NOTIFICATION:
          break;
        default:
          console.warn("Unhandled message type:", type);
          break;
      }
    }
  };
};
