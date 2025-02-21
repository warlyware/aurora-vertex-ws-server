import 'dotenv/config';
import WebSocket from 'ws';
import { messageTypes } from '../../types/messages';
import { redis } from '../../redis';
import { logServerEvent } from '../../logging';
import { SolanaTxNotificationFromHelius, SolanaTxNotificationFromHeliusWithTimestamp } from '../../types/solana';
import { eventBus } from '../../events/bus';
import { sendToConnectedClients } from '../..';
import dayjs from 'dayjs';
const { SOLANA_TX_NOTIFICATION_FROM_HELIUS, SERVER_LOG_EVENT, SOLANA_TX_EVENT } = messageTypes;

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
  'DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj',
  '6LChaYRYtEYjLEHhzo4HdEmgNwu2aia8CM8VhR9wn6n7',
  '6eDPccEWC1BbJXBdEHA3pc2NjThZwAf5n3wb9rxkmuaf',
  'CotYDUwu4c3a73Hya3Tjm7u9gzmZweoKip2kQyuyhAEF',
  'HLLXwFZN9CHTct5K4YpucZ137aji27EkkJ1ZaZE7JVmk',
  '7EHzMDNuY6gKbbeXZUxkTwfyA9jonsfjzFGurRfzwNjo'
];

const logToTerminal = (message: string) => {
  console.log(`${dayjs().format('YYYY-MM-DD HH:mm:ss')} ${message}`);
};


const storeTransaction = async (signature: string, transaction: any) => {
  if (!process.env.IS_PRODUCTION || !redis) return;
  await redis.set(`tx:${signature}`, JSON.stringify(transaction));
};

type HeliusConnectionMetrics = {
  lastConnectedAt: number | null;
  disconnectionCount: number;
  reconnectionAttempts: number;
  totalUptime: number;
  lastDisconnectReason?: string;
  heartbeatStats: {
    total: number;
    missed: number;
  };
  transactionStats: {
    total: number;
    lastReceivedAt: number | null;
  };
  latencyStats: {
    current: number | null;    // Current round-trip time
    average: number | null;    // Average of round-trip times
    samples: number;          // Number of measurements
  };
}

const metrics: HeliusConnectionMetrics = {
  lastConnectedAt: null,
  disconnectionCount: 0,
  reconnectionAttempts: 0,
  totalUptime: 0,
  heartbeatStats: {
    total: 0,
    missed: 0,
  },
  transactionStats: {
    total: 0,
    lastReceivedAt: null,
  },
  latencyStats: {
    current: null,
    average: null,
    samples: 0
  }
};

const resetMetrics = () => {
  metrics.lastConnectedAt = null;
  metrics.disconnectionCount = 0;
  metrics.reconnectionAttempts = 0;
  metrics.totalUptime = 0;
  metrics.lastDisconnectReason = undefined;
  metrics.heartbeatStats = {
    total: 0,
    missed: 0,
  };
  metrics.transactionStats = {
    total: 0,
    lastReceivedAt: null,
  };
  metrics.latencyStats = {
    current: null,
    average: null,
    samples: 0
  };
};

export const setupSolanaWatchers = (clients: Map<string, WebSocket>) => {
  if (heliusWs) return;

  resetMetrics();

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

  const reconnect = (clients: Map<string, WebSocket>) => {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logToTerminal('Max reconnect attempts reached. Stopping.');
      return;
    }
    if (isReconnecting) {
      logToTerminal(`Primary WebSocket already reconnecting, skipping...`);
      return;
    }
    isReconnecting = true;
    const delay = Math.min(5000 * (2 ** reconnectAttempts), 60000);
    reconnectAttempts++;
    logToTerminal(`Reconnecting Primary WebSocket in ${delay / 1000}s...`);
    setTimeout(() => {
      closeWebSocket();
      setupSolanaWatchers(clients);
      setTimeout(() => {
        isReconnecting = false;
      }, 1000);
    }, delay);
  };

  const checkConnectionHealth = async (clients: Map<string, WebSocket>) => {
    const MAX_SILENCE_DURATION = 10000;
    const threshold = MAX_SILENCE_DURATION;

    const lastEffectiveTimestamp = Math.max(lastReceivedTxTimestamp, lastHeartbeatTimestamp);

    if (!firstHeartbeatReceived) {
      metrics.heartbeatStats.missed++;
      logServerEvent("Waiting for initial heartbeat...");
      logToTerminal("Waiting for initial heartbeat...");
      return;
    }

    if (isReconnecting) {
      if (!(wsInstance as any).hasLoggedReconnect) {
        logServerEvent(`Skipping connection health check: Primary is already reconnecting`);
        logToTerminal(`Skipping connection health check: Primary is already reconnecting`);
        (wsInstance as any).hasLoggedReconnect = true;
      }
      return;
    } else {
      (wsInstance as any).hasLoggedReconnect = false;
    }

    if (Date.now() - lastEffectiveTimestamp > threshold) {
      metrics.heartbeatStats.missed++;
      isReconnecting = true;
      logServerEvent('No heartbeat or transaction received in last 10 seconds. Restarting WebSocket...');
      logToTerminal('No heartbeat or transaction received in last 10 seconds. Restarting WebSocket...');
      closeWebSocket();
      await new Promise((resolve) => setTimeout(resolve, 500));
      lastRestartTimestamp = Date.now();
      setupSolanaWatchers(clients);
    }
  };

  wsInstance.on('open', () => {
    metrics.lastConnectedAt = Date.now();
    metrics.reconnectionAttempts = 0;
    logServerEvent(`Helius Primary WebSocket is open`);
    logToTerminal('Helius Primary WebSocket is open');
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
    logToTerminal('Subscribed to transaction notifications');
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
    logToTerminal('Subscribed to heartbeat (clock sysvar)');

    let lastPingSentTime: number | null = null;
    let pingInterval: NodeJS.Timeout;

    const clearIntervals = () => {
      clearInterval(pingInterval);
      clearInterval(healthCheckInterval);
      clearInterval(metricsInterval);
    };

    pingInterval = setInterval(() => {
      if (wsInstance?.readyState !== WebSocket.OPEN) {
        clearIntervals();
        return;
      }
      lastPingSentTime = Date.now();
      wsInstance.ping();
    }, 15000);

    const healthCheckInterval = setInterval(async () => {
      await checkConnectionHealth(clients);
    }, 5000);

    const metricsInterval = setInterval(() => {
      if (metrics.lastConnectedAt) {
        metrics.totalUptime = Date.now() - metrics.lastConnectedAt;
      }
      logServerEvent(`Helius Connection Metrics: ${JSON.stringify(metrics, null, 2)}`);
    }, 60000);

    wsInstance.on('close', (code, reason) => {
      clearIntervals();
      metrics.disconnectionCount++;
      metrics.lastDisconnectReason = `Code ${code}, Reason: ${reason}`;
      logServerEvent(`Helius Primary WebSocket closed. Attempting to reconnect...`);
      logServerEvent(`Code ${code}, Reason: ${reason}`);
      logToTerminal(`Helius Primary WebSocket closed. Attempting to reconnect...`);
      logToTerminal(`Code ${code}, Reason: ${reason}`);
      reconnect(clients);
    });

    wsInstance.on('pong', () => {
      const pongTime = Date.now();

      if (lastPingSentTime) {
        const roundTrip = pongTime - lastPingSentTime;

        metrics.latencyStats.current = roundTrip;
        metrics.latencyStats.samples++;

        if (metrics.latencyStats.average === null) {
          metrics.latencyStats.average = roundTrip;
        } else {
          metrics.latencyStats.average = Math.round(
            (metrics.latencyStats.average + roundTrip) / 2
          );
        }
      }
    });
  });

  wsInstance.on('message', (data) => {
    try {
      const parsed = JSON.parse(data.toString('utf8'));

      if (parsed?.params?.error) {
        const errorMessage = JSON.stringify(parsed.params.error);
        metrics.lastDisconnectReason = errorMessage;
        logServerEvent(`ERROR: ${errorMessage}`);
        logToTerminal(`ERROR: ${errorMessage}`);
        reconnect(clients);
        return;
      }

      if (
        parsed?.params?.result &&
        parsed?.params?.result?.value?.data?.program === 'sysvar' &&
        parsed?.params?.result?.value?.data?.parsed?.type === 'clock'
      ) {
        metrics.heartbeatStats.total++;
        lastHeartbeatTimestamp = Date.now();

        if (!firstHeartbeatReceived) {
          firstHeartbeatReceived = true;
          logServerEvent("Initial heartbeat received");
          logToTerminal("Initial heartbeat received");
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

      metrics.transactionStats.total++;
      metrics.transactionStats.lastReceivedAt = Date.now();

    } catch (e) {
      logToTerminal(`Failed to parse JSON: ${e}`);
    }
  });

  wsInstance.on('error', (err) => {
    const errorMessage = err.toString();
    metrics.lastDisconnectReason = errorMessage;
    logToTerminal(`Primary WS Error: ${errorMessage}`);
    logServerEvent(`Primary WS Error: ${errorMessage}`);
    reconnect(clients);
  });

  wsInstance.on('close', (code, reason) => {
    logServerEvent(`Helius Primary WebSocket closed. Attempting to reconnect...`);
    logServerEvent(`Code ${code}, Reason: ${reason}`);
    logToTerminal(`Helius Primary WebSocket closed. Attempting to reconnect...`);
    logToTerminal(`Code ${code}, Reason: ${reason}`);
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

      for (const tx of transactions) {
        if (tx) {
          sendToConnectedClients({
            type: SOLANA_TX_EVENT,
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
      const logsToSend = sortedLogs.slice(-AMOUNT_TO_SEND_TO_CLIENT).map(log => log.replace('log:', ''));
      const logsData = logsToSend.length > 0 ? await redis.mget(...logsToSend) : [];

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
