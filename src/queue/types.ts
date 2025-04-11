export interface TradeJob {
  type: 'BUY' | 'SELL' | 'TEST';
  botId: string;
  userId: string;
  tokenMint: string;
  amount: number;
  price: number;
  strategy: {
    priorityFee: number;
    slippagePercentage: number;
    shouldAutoSell: boolean;
    autoSellDelayInMs: number;
  };
  metadata: {
    originalTx: string;
    timestamp: number;
  };
}

export interface TradeJobResult {
  success: boolean;
  signature?: string;
  error?: string;
} 