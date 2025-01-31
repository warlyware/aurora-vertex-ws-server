import WebSocket from 'ws';
import { messageTypes } from '../../types/messages';
import { SolanaTxNotificationType } from '../../types/solana';

const transactionSubscribeRequest = {
  "jsonrpc": "2.0",
  "id": `aurora-${Date.now()}`,
  "method": "transactionSubscribe",
  "params": [
    {
      "vote": false,
      "failed": false,
      "accountInclude": [
        "DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj", // 🧠
        // "6LChaYRYtEYjLEHhzo4HdEmgNwu2aia8CM8VhR9wn6n7", // high activity
        // "6eDPccEWC1BbJXBdEHA3pc2NjThZwAf5n3wb9rxkmuaf", // high activity
        // "BieeZkdnBAgNYknzo3RH2vku7FcPkFZMZmRJANh2TpW",    
      ],
      // "accountExclude": [],
      // "accountRequired": []
    },
    {
      "commitment": "processed",
      "encoding": "jsonParsed",
      "transactionDetails": "full",
      "showRewards": true,
      "maxSupportedTransactionVersion": 0
    }
  ]
}

const { SOLANA_TX_NOTIFICATION } = messageTypes;

const recentTxCache = new Map<string, SolanaTxNotificationType>();

const MAX_CACHE_SIZE = 100; // Store last 100 transactions

const pruneOldTransactions = () => {
  if (recentTxCache.size > MAX_CACHE_SIZE) {
    const oldestKeys = Array.from(recentTxCache.keys()).slice(0, recentTxCache.size - MAX_CACHE_SIZE);
    oldestKeys.forEach(key => recentTxCache.delete(key));
  }
};

export const setupSolanaWatchers = (clients: Set<WebSocket>) => {
  const heliusWs = new WebSocket(
    `wss://atlas-mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
  );

  const initSubscriptions = () => {
    console.log('Sending transactionSubscribe request');
    heliusWs.send(JSON.stringify(transactionSubscribeRequest));
  }

  const startPing = () => {
    setInterval(() => {
      if (heliusWs.readyState === WebSocket.OPEN) {
        heliusWs.ping();
        console.log('Ping sent');
      }
    }, 30000); // Ping every 30 seconds
  }

  heliusWs.on('open', function open() {
    console.log('Helius WebSocket is open');
    startPing();
    initSubscriptions();
  });

  heliusWs.on('message', function incoming(data) {
    const messageStr = data.toString('utf8');
    try {
      const messageObj = JSON.parse(messageStr);
      console.log('Received:', messageObj);

      const payload = JSON.stringify({
        type: SOLANA_TX_NOTIFICATION,
        payload: {
          timestamp: Date.now(),
          ...messageObj
        }
      });

      if (messageObj.params?.result?.signature) {
        recentTxCache.set(messageObj.params.result.signature, messageObj);
        pruneOldTransactions();
      }

      console.log('clients:', clients.size);
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
          console.log('Sent payload');
        } else {
          console.warn("Skipping closed WebSocket");
        }
      }
    } catch (e) {
      console.error('Failed to parse JSON:', e);
    }
  });

  heliusWs.on('error', function error(err) {
    console.error('Helius WebSocket error:', err);
  });

  heliusWs.on('close', function close() {
    console.log('Helius WebSocket is closed');
  });

  return {
    restoreTransactionsForClient(ws: WebSocket) {
      console.log(`Restoring ${recentTxCache.size} transactions for new client`);
      for (const cachedTx of recentTxCache.values()) {
        ws.send(JSON.stringify({
          type: SOLANA_TX_NOTIFICATION,
          payload: {
            timestamp: Date.now(),
            ...cachedTx
          }
        }));
      }
    },

    handleMessage: async (
      message: { type: string, payload: string },
      ws: WebSocket
    ) => {
      const { type, payload } = message;

      console.log({ type, payload });

      switch (type) {
        case SOLANA_TX_NOTIFICATION: {
          break;
        }
        default:
          console.warn("Unhandled message type:", type);
          break;
      }
    }
  }
}
