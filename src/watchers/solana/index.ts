import 'dotenv/config';
import WebSocket from 'ws';
import { messageTypes } from '../../types/messages';
import { redis } from '../../redis';
import { logServerEvent } from '../../logging';
import { SolanaTxNotificationFromHelius, SolanaTxNotificationFromHeliusWithTimestamp } from '../../types/solana';
import { eventBus } from '../../events/bus';
import { sendToConnectedClients } from '../..';

const { SOLANA_TX_NOTIFICATION_FROM_HELIUS, SERVER_LOG_EVENT } = messageTypes;

const MAX_RECONNECT_ATTEMPTS = 10;
let reconnectAttempts = 0;
let heliusWs: WebSocket | null = null;
const processedSignatures = new Set<string>();
const TX_EXPIRATION_TIME = 60000; // 1 minute
let firstHeartbeatReceived = false;

let lastReceivedTxTimestamp = Date.now();
let lastHeartbeatTimestamp = Date.now();

let lastRestartTimestamp: number | null = null;
let isReconnecting = false;

const accountsToWatch = [
  'DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj', // Euris
  '6LChaYRYtEYjLEHhzo4HdEmgNwu2aia8CM8VhR9wn6n7',
];


const storeTransaction = async (signature: string, transaction: any) => {
  if (!process.env.IS_PRODUCTION || !redis) return;
  await redis.set(`tx:${signature}`, JSON.stringify(transaction));
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
      logServerEvent("Waiting for initial heartbeat...");
      return;
    }

    if (isReconnecting) {
      if (!(wsInstance as any).hasLoggedReconnect) {
        logServerEvent(`Skipping connection health check: Primary is already reconnecting`);
        (wsInstance as any).hasLoggedReconnect = true;
      }
      return;
    } else {
      (wsInstance as any).hasLoggedReconnect = false;
    }

    if (Date.now() - lastEffectiveTimestamp > threshold) {
      isReconnecting = true;
      logServerEvent('No heartbeat or transaction received in last 10 seconds. Restarting WebSocket...');
      closeWebSocket();
      await new Promise((resolve) => setTimeout(resolve, 500));
      lastRestartTimestamp = Date.now();
      setupSolanaWatchers(clients);
    }
  };

  wsInstance.on('open', () => {
    logServerEvent(`Helius Primary WebSocket is open`);
    isReconnecting = false;
    lastReceivedTxTimestamp = Date.now();
    lastHeartbeatTimestamp = Date.now();
    reconnectAttempts = 0;

    wsInstance.send(JSON.stringify({
      "jsonrpc": "2.0",
      "id": `aurora-tx-${Date.now()}`,
      "method": "transactionSubscribe",
      "params": [
        {
          "vote": false,
          "failed": false,
          "accountInclude": accountsToWatch
        },
        {
          "commitment": "processed", // as soon as possible
          "encoding": "jsonParsed",
          "transactionDetails": "full",
          "showRewards": true,
          "maxSupportedTransactionVersion": 0
        }
      ]
    }));
    logServerEvent(`Subscribed to transaction notifications`);

    wsInstance.send(JSON.stringify({
      "jsonrpc": "2.0",
      "id": `aurora-heartbeat-${Date.now()}`,
      "method": "accountSubscribe",
      "params": [
        "SysvarC1ock11111111111111111111111111111111",
        {
          "commitment": "finalized", // as stable as possible
          "encoding": "jsonParsed"
        }
      ]
    }));
    logServerEvent(`Subscribed to heartbeat (clock sysvar)`);

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
      logServerEvent(`Helius Primary WebSocket closed. Attempting to reconnect...`);
      logServerEvent(`Code ${code}, Reason: ${reason}`);
      reconnect(clients);
    });
  });

  wsInstance.on('message', (data) => {
    try {
      const parsed = JSON.parse(data.toString('utf8'));

      if (parsed?.params?.error) {
        logServerEvent(`ERROR: ${JSON.stringify(parsed.params.error)}`);
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
          logServerEvent("Initial heartbeat received");
        }
        return;
      }

      const messageObj: SolanaTxNotificationFromHelius = parsed;

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

      const payloadWithTimestamp: SolanaTxNotificationFromHeliusWithTimestamp = {
        timestamp: Date.now(),
        ...messageObj
      };

      logServerEvent(`Caching transaction ${messageObj.params.result.signature}`);
      storeTransaction(messageObj.params.result.signature, payloadWithTimestamp);
      lastReceivedTxTimestamp = Date.now();

      eventBus.emit(SOLANA_TX_NOTIFICATION_FROM_HELIUS, {
        type: SOLANA_TX_NOTIFICATION_FROM_HELIUS,
        payload: payloadWithTimestamp
      });

    } catch (e) {
      console.error('Failed to parse JSON:', e);
    }
  });

  wsInstance.on('error', (err) => {
    logServerEvent(`Primary WS Error: ${err}`);
    reconnect(clients);
  });

  wsInstance.on('close', (code, reason) => {
    logServerEvent(`Helius Primary WebSocket closed. Attempting to reconnect...`);
    logServerEvent(`Code ${code}, Reason: ${reason}`);
    reconnect(clients);
  });

  heliusWs = wsInstance;

  return {
    sendRestoredTransactionsToClient: async (ws: WebSocket) => {
      const AMOUNT_TO_SEND_TO_CLIENT = 100;
      if (!redis) return;
      logServerEvent(`Restoring transactions for new client`);
      const keys = await redis.keys('tx:*');
      const sortedKeys = keys.sort();
      const keysToSend = sortedKeys.slice(-AMOUNT_TO_SEND_TO_CLIENT);

      const transactions = keysToSend.length > 0 ? await redis.mget(...keysToSend) : [];
      console.log('number of transactions to send', transactions.length);
      for (const tx of transactions) {
        if (tx) {
          sendToConnectedClients({
            type: SOLANA_TX_NOTIFICATION_FROM_HELIUS,
            payload: tx
          });
        }
      }
    },
    sendRestoredLogsToClient: async (ws: WebSocket) => {
      const AMOUNT_TO_SEND_TO_CLIENT = 100;
      if (!redis) return;
      logServerEvent(`Restoring logs for new client`);
      const logs = await redis.keys('log:*');
      const sortedLogs = logs.sort();
      const logsToSend = sortedLogs.slice(-AMOUNT_TO_SEND_TO_CLIENT);
      const logsData = logsToSend.length > 0 ? await redis.mget(...logsToSend) : [];
      console.log('number of logs to send', logsData.length);
      for (let i = 0; i < logsToSend.length; i++) {
        sendToConnectedClients({
          type: SERVER_LOG_EVENT,
          payload: logsData[i] || ''
        });
      }
    },
    handleMessage: async (message: { type: string; payload: string }, ws: WebSocket) => {
      const { type, payload } = message;
      switch (type) {
        case SOLANA_TX_NOTIFICATION_FROM_HELIUS:
          break;
        default:
          logServerEvent(`Unknown message type: ${type}`);
          break;
      }
    }
  };
};
