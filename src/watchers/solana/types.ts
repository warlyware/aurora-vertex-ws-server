export type HeliusConnectionMetrics = {
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