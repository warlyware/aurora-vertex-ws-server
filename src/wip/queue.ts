/**
 * Trading queue system for automated cryptocurrency trading
 * Tracks and manages buy/sell signals based on mirroring a high-win-rate wallet
 */

// Define token and transaction types
type TokenAddress = string;
type WalletAddress = string;
type TransactionHash = string;

// Tracking our wallet's position for a token
interface OurPosition {
  amountOwned: number;
  cumulativeBought: number;
  pendingBuys: PendingBuy[];
  pendingSells: PendingSell[];
  buyHistory: CompletedTransaction[];
  sellHistory: CompletedTransaction[];
}

// Tracking target wallet's position
interface TargetPosition {
  amountOwned: number;
  cumulativeBought: number;
  lastUpdated: number; // timestamp
}

// Pending transactions
interface PendingBuy {
  id: string;
  tokenAddress: TokenAddress;
  solAmount: number;
  timestamp: number;
  status: 'initiated' | 'pending' | 'confirming' | 'completed' | 'failed';
  txHash?: TransactionHash;
  tokenAmount?: number;
}

interface PendingSell {
  id: string;
  tokenAddress: TokenAddress;
  timestamp: number;
  status: 'queued' | 'initiated' | 'pending' | 'completed' | 'failed';
  amountToSell?: number;
  remainingToSell?: number; // Track how much still needs to be sold after partial sells
  txHash?: TransactionHash;
}

interface CompletedTransaction {
  tokenAddress: TokenAddress;
  tokenAmount: number;
  solAmount: number;
  timestamp: number;
  txHash: TransactionHash;
}

// Simplified data structures - just one pair of wallets
let OUR_WALLET_ADDRESS: string;
let TARGET_WALLET_ADDRESS: string;

// Main data structures for tracking positions
const ourPositions: Record<TokenAddress, OurPosition> = {};
const targetPositions: Record<TokenAddress, TargetPosition> = {};

/**
 * Initialize tracking for a token in our wallet
 */
const initializeOurToken = (tokenAddress: TokenAddress): void => {
  if (!ourPositions[tokenAddress]) {
    ourPositions[tokenAddress] = {
      amountOwned: 0,
      cumulativeBought: 0,
      pendingBuys: [],
      pendingSells: [],
      buyHistory: [],
      sellHistory: [],
    };
  }
};

/**
 * Initialize tracking for a token in the target wallet
 */
const initializeTargetToken = (tokenAddress: TokenAddress): void => {
  if (!targetPositions[tokenAddress]) {
    targetPositions[tokenAddress] = {
      amountOwned: 0,
      cumulativeBought: 0,
      lastUpdated: Date.now(),
    };
  }
};

/**
 * Get our position for a specific token
 */
const getOurPosition = (tokenAddress: TokenAddress): OurPosition | undefined => {
  return ourPositions[tokenAddress];
};

/**
 * Get target wallet's position for a specific token
 */
const getTargetPosition = (tokenAddress: TokenAddress): TargetPosition | undefined => {
  return targetPositions[tokenAddress];
};

/**
 * Set up the system with our wallet and target wallet addresses
 */
const startMirroring = (targetWalletAddress: string, ourWalletAddress: string): void => {
  // Store wallet addresses
  TARGET_WALLET_ADDRESS = targetWalletAddress;
  OUR_WALLET_ADDRESS = ourWalletAddress;

  // Set up periodic reconciliation
  setInterval(() => {
    reconcileAllPositions();
  }, 30 * 1000); // Every 30 seconds
};

/**
 * Execute a token purchase based on observed activity from target wallet
 */
const triggerTokenBuy = async ({
  tokenAddress,
  maxSolSpend,
}: {
  tokenAddress: TokenAddress;
  maxSolSpend: number;
}): Promise<string> => {
  // Initialize token tracking if needed
  initializeOurToken(tokenAddress);

  // Create a pending transaction
  const pendingId = `buy-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const pendingTx: PendingBuy = {
    id: pendingId,
    tokenAddress,
    solAmount: maxSolSpend,
    timestamp: Date.now(),
    status: 'initiated',
  };

  // Add to pending buys
  ourPositions[tokenAddress].pendingBuys.push(pendingTx);

  // Start the purchase process
  try {
    // Start the purchase process asynchronously
    executeTokenPurchase(pendingId).catch(console.error);
    return pendingId;
  } catch (error) {
    console.error(`Failed to initiate purchase for ${tokenAddress}:`, error);
    updatePendingBuyStatus(pendingId, 'failed');
    throw error;
  }
};

/**
 * Execute the actual token purchase
 */
const executeTokenPurchase = async (pendingId: string): Promise<void> => {
  // Find the pending transaction
  const pendingTx = findPendingBuy(pendingId);
  if (!pendingTx) {
    console.error(`No pending transaction found with ID ${pendingId}`);
    return;
  }

  const { tokenAddress, solAmount } = pendingTx;

  try {
    // Update status to pending
    updatePendingBuyStatus(pendingId, 'pending');

    // Execute the purchase
    const result = await performPurchase({ tokenAddress, sol: solAmount });

    // Update the pending transaction with results
    updatePendingBuy(pendingId, {
      status: 'confirming',
      txHash: result.transactionHash,
    });

    // Wait for confirmation
    await waitForTransactionConfirmation(result.transactionHash);

    // Get our position
    const position = getOurPosition(tokenAddress);
    if (position) {
      // Update status to completed
      updatePendingBuy(pendingId, {
        status: 'completed',
        tokenAmount: result.amountPurchased,
      });

      // Update owned amount and cumulative purchased
      position.amountOwned += result.amountPurchased;
      position.cumulativeBought += result.amountPurchased;

      // Add to buy history
      position.buyHistory.push({
        tokenAddress,
        tokenAmount: result.amountPurchased,
        solAmount,
        timestamp: Date.now(),
        txHash: result.transactionHash,
      });

      // After a successful purchase, reconcile positions to check if we need to sell
      await reconcileTokenPosition(tokenAddress);

      // Check for any partial sells waiting for this buy to complete
      await processWaitingPartialSells(tokenAddress);
    }
  } catch (error) {
    console.error(`Purchase failed for ${tokenAddress}:`, error);
    updatePendingBuyStatus(pendingId, 'failed');
  }
};

/**
 * Find a pending buy by ID
 */
const findPendingBuy = (pendingId: string): PendingBuy | undefined => {
  for (const tokenAddress in ourPositions) {
    const position = ourPositions[tokenAddress];
    const pendingTx = position.pendingBuys.find((tx) => tx.id === pendingId);
    if (pendingTx) return pendingTx;
  }
  return undefined;
};

/**
 * Update status of a pending buy
 */
const updatePendingBuyStatus = (pendingId: string, status: PendingBuy['status']): void => {
  const pendingTx = findPendingBuy(pendingId);
  if (pendingTx) {
    pendingTx.status = status;
  }
};

/**
 * Update fields of a pending buy
 */
const updatePendingBuy = (pendingId: string, updates: Partial<PendingBuy>): void => {
  const pendingTx = findPendingBuy(pendingId);
  if (pendingTx) {
    Object.assign(pendingTx, updates);
  }
};

/**
 * Calculate our current ownership percentage (how much we still own compared to total bought)
 */
const calculateCurrentPercentage = (position: OurPosition): number => {
  if (position.cumulativeBought === 0) return 0;
  return (position.amountOwned / position.cumulativeBought) * 100;
};

/**
 * Calculate our projected percentage after pending transactions
 */
const calculateProjectedPercentage = (position: OurPosition): number => {
  if (position.cumulativeBought === 0) return 0;

  // Calculate expected buys
  const pendingBuysAmount = position.pendingBuys
    .filter((buy) => ['initiated', 'pending', 'confirming'].includes(buy.status))
    .reduce((sum, buy) => {
      // For buys that haven't completed, we can only estimate
      // Use tokenAmount if available, otherwise estimate based on SOL
      if (buy.tokenAmount) {
        return sum + buy.tokenAmount;
      }
      // Rough estimate based on SOL amount
      return sum + buy.solAmount * 100; // Simplified estimation
    }, 0);

  // Calculate expected sells
  const pendingSellsAmount = position.pendingSells
    .filter((sell) => ['queued', 'initiated', 'pending'].includes(sell.status))
    .reduce((sum, sell) => {
      return sum + (sell.remainingToSell || sell.amountToSell || 0);
    }, 0);

  // Calculate projected owned amount
  const projectedOwned = position.amountOwned + pendingBuysAmount - pendingSellsAmount;

  // Calculate projected cumulative bought
  const projectedCumulative = position.cumulativeBought + pendingBuysAmount;

  // Calculate projected percentage
  if (projectedCumulative === 0) return 0;
  return (projectedOwned / projectedCumulative) * 100;
};

/**
 * Process any partial sells that were waiting for buys to complete
 */
const processWaitingPartialSells = async (tokenAddress: TokenAddress): Promise<void> => {
  const position = getOurPosition(tokenAddress);
  if (!position) return;

  // Look for sells with remaining amounts to sell
  const waitingSells = position.pendingSells.filter(
    (sell) => sell.status === 'completed' && (sell.remainingToSell || 0) > 0.000001
  );

  if (waitingSells.length === 0) return;

  console.log(`Found ${waitingSells.length} waiting partial sells to process after buy completion`);

  for (const waitingSell of waitingSells) {
    const remainingToSell = waitingSell.remainingToSell || 0;
    if (remainingToSell > 0.000001) {
      console.log(`Processing remaining sell of ${remainingToSell} tokens for ${tokenAddress}`);

      // Trigger a new sell for the remaining amount
      try {
        await triggerTokenSell({
          tokenAddress,
          amountToSell: remainingToSell,
        });

        // Clear the remaining amount since we've now triggered a new sell for it
        waitingSell.remainingToSell = 0;
      } catch (error) {
        console.error(`Failed to process waiting partial sell: ${error}`);
      }
    }
  }
};

/**
 * Trigger a token sell based on target wallet movements
 */
const triggerTokenSell = async ({
  tokenAddress,
  amountToSell,
}: {
  tokenAddress: TokenAddress;
  amountToSell: number;
}): Promise<string> => {
  // Initialize if needed
  initializeOurToken(tokenAddress);

  // Get our position
  const position = getOurPosition(tokenAddress);
  if (!position) {
    throw new Error(`No position found for ${tokenAddress}`);
  }

  // Check if we have enough tokens available or if we need partial sell
  const availableBalance = position.amountOwned;
  let sellNow = amountToSell;
  let remainingToSell = 0;

  if (amountToSell > availableBalance) {
    // Check if we have pending buys that will provide the tokens later
    const pendingBuysAmount = position.pendingBuys
      .filter((buy) => ['initiated', 'pending', 'confirming'].includes(buy.status))
      .reduce((sum, buy) => {
        if (buy.tokenAmount) {
          return sum + buy.tokenAmount;
        }
        return sum + buy.solAmount * 100; // Estimate
      }, 0);

    if (pendingBuysAmount > 0) {
      console.log(
        `Need to sell ${amountToSell} but only have ${availableBalance} available with ${pendingBuysAmount} pending`
      );

      // Sell what we can now, queue the rest for after buys complete
      sellNow = availableBalance;
      remainingToSell = amountToSell - availableBalance;

      console.log(`Will sell ${sellNow} now and ${remainingToSell} after pending buys complete`);
    } else {
      // No pending buys, just sell what we have
      console.log(
        `Can only sell ${availableBalance} of desired ${amountToSell} tokens due to balance limits`
      );
      sellNow = availableBalance;
    }
  }

  // Skip if immediate sell amount is too small
  if (sellNow < 0.000001) {
    console.log(`Immediate sell amount too small, skipping`);

    // If we have remaining to sell later, still create a tracking record
    if (remainingToSell > 0.000001) {
      const pendingSellId = `sell-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const pendingSell: PendingSell = {
        id: pendingSellId,
        tokenAddress,
        timestamp: Date.now(),
        status: 'completed', // Mark as completed with nothing sold now
        amountToSell: 0, // Nothing sold immediately
        remainingToSell, // Track what needs to be sold later
      };

      position.pendingSells.push(pendingSell);
      return pendingSellId;
    }

    throw new Error('Sell amount too small');
  }

  // Create a pending sell
  const pendingSellId = `sell-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const pendingSell: PendingSell = {
    id: pendingSellId,
    tokenAddress,
    timestamp: Date.now(),
    status: 'queued',
    amountToSell: sellNow,
    remainingToSell,
  };

  // Add to pending sells
  position.pendingSells.push(pendingSell);

  // Execute the sell immediately
  try {
    executeTokenSell(pendingSellId).catch(console.error);
    return pendingSellId;
  } catch (error) {
    console.error(`Failed to initiate sell for ${tokenAddress}:`, error);
    throw error;
  }
};

/**
 * Execute the actual token sell
 */
const executeTokenSell = async (sellId: string): Promise<void> => {
  // Find the pending sell
  let tokenAddress: TokenAddress | undefined;
  let pendingSell: PendingSell | undefined;

  for (const token in ourPositions) {
    const position = ourPositions[token];
    const sellIndex = position.pendingSells.findIndex((sell) => sell.id === sellId);
    if (sellIndex >= 0) {
      tokenAddress = token;
      pendingSell = position.pendingSells[sellIndex];
      break;
    }
  }

  if (!tokenAddress || !pendingSell || !pendingSell.amountToSell) {
    console.error(`No valid pending sell found with ID ${sellId}`);
    return;
  }

  const amountToSell = pendingSell.amountToSell;

  try {
    pendingSell.status = 'pending';

    // Perform the actual sell
    const sellResult = await performTokenSell({
      tokenAddress,
      tokenAmount: amountToSell,
    });

    // Update the pending sell with results
    pendingSell.status = 'completed';
    pendingSell.txHash = sellResult.transactionHash;

    // Update token balance
    const position = ourPositions[tokenAddress];
    position.amountOwned -= amountToSell;

    // Add to sell history
    position.sellHistory.push({
      tokenAddress,
      tokenAmount: amountToSell,
      solAmount: sellResult.solReceived,
      timestamp: Date.now(),
      txHash: sellResult.transactionHash,
    });

    // Reconcile again after selling
    reconcileTokenPosition(tokenAddress);
  } catch (error) {
    console.error(`Sell failed for ${tokenAddress}:`, error);
    pendingSell.status = 'failed';
  }
};

/**
 * The core reconciliation function - compare our position with target wallet's
 * and sell down if we're ahead (never buy up)
 */
const reconcileTokenPosition = async (tokenAddress: TokenAddress): Promise<void> => {
  // Initialize tracking if needed
  initializeOurToken(tokenAddress);
  initializeTargetToken(tokenAddress);

  // Get positions
  const ourPosition = getOurPosition(tokenAddress);
  const targetPosition = getTargetPosition(tokenAddress);

  if (!ourPosition || !targetPosition) {
    console.error(`Missing position data for reconciliation`);
    return;
  }

  // Get actual balances from blockchain
  const ourActualBalance = await getCurrentBalance({
    walletAddress: OUR_WALLET_ADDRESS,
    tokenAddress,
  });

  const targetActualBalance = await getCurrentBalance({
    walletAddress: TARGET_WALLET_ADDRESS,
    tokenAddress,
  });

  // Update our position
  const ourPreviousBalance = ourPosition.amountOwned;
  ourPosition.amountOwned = ourActualBalance;

  // Update target position
  const targetPreviousBalance = targetPosition.amountOwned;
  targetPosition.amountOwned = targetActualBalance;

  // If this is first time tracking target wallet with this token
  if (targetPosition.cumulativeBought === 0 && targetActualBalance > 0) {
    targetPosition.cumulativeBought = targetActualBalance;
    console.log(
      `First time tracking ${tokenAddress} in target wallet. Initial balance: ${targetActualBalance}`
    );
    return; // Need more history before making decisions
  }

  // Track target wallet balance changes
  if (Math.abs(targetActualBalance - targetPreviousBalance) > 0.0001) {
    // Target wallet bought more
    if (targetActualBalance > targetPreviousBalance) {
      const newPurchase = targetActualBalance - targetPreviousBalance;
      targetPosition.cumulativeBought += newPurchase;
      console.log(`Target wallet bought ${newPurchase} more ${tokenAddress}`);
    }
    // Target wallet sold some
    else if (targetActualBalance < targetPreviousBalance) {
      const soldAmount = targetPreviousBalance - targetActualBalance;
      console.log(`Target wallet sold ${soldAmount} of ${tokenAddress}`);
    }
  }

  // Calculate percentages
  // For target wallet: how much they still hold versus total bought
  const targetPercentage =
    targetPosition.cumulativeBought > 0
      ? (targetPosition.amountOwned / targetPosition.cumulativeBought) * 100
      : 0;

  // For our wallet: current and projected positions
  const ourCurrentPercentage = calculateCurrentPercentage(ourPosition);
  const ourProjectedPercentage = calculateProjectedPercentage(ourPosition);

  console.log(
    `${tokenAddress} positions - Target: ${targetPercentage.toFixed(2)}% held, ` +
      `Our current: ${ourCurrentPercentage.toFixed(2)}%, ` +
      `Our projected: ${ourProjectedPercentage.toFixed(2)}%`
  );

  // IMPORTANT: Only sell if our projected position is ahead of target
  // We never buy to match their position
  const THRESHOLD = 5; // 5% threshold to reduce noise
  if (ourProjectedPercentage > targetPercentage + THRESHOLD) {
    console.log(
      `Our projected position (${ourProjectedPercentage.toFixed(2)}% held) is ` +
        `higher than target position (${targetPercentage.toFixed(2)}% held), need to sell down`
    );

    // Calculate how much we should have after selling
    const targetAmountToHold = (ourPosition.cumulativeBought * targetPercentage) / 100;

    // Calculate how much to sell
    const amountToSell = Math.max(0, ourPosition.amountOwned - targetAmountToHold);

    if (amountToSell > 0.000001) {
      console.log(`Selling ${amountToSell} tokens to match target position`);
      await triggerTokenSell({
        tokenAddress,
        amountToSell,
      });
    }
  } else {
    console.log(`No need to sell: Our position is aligned with or below target wallet`);
  }

  // Special case: Target wallet sold everything - we should too
  if (
    targetActualBalance < 0.000001 &&
    ourActualBalance > 0 &&
    targetPosition.cumulativeBought > 0
  ) {
    console.log(`Target wallet sold ALL of ${tokenAddress}, triggering full sell`);

    // Cancel any pending sells - we're going to sell everything
    ourPosition.pendingSells = ourPosition.pendingSells.filter(
      (sell) => !['queued', 'initiated'].includes(sell.status)
    );

    // Trigger a 100% sell
    await triggerTokenSell({
      tokenAddress,
      amountToSell: ourPosition.amountOwned,
    });
  }
};

/**
 * Reconcile all token positions
 */
const reconcileAllPositions = async (): Promise<void> => {
  for (const tokenAddress in ourPositions) {
    await reconcileTokenPosition(tokenAddress);
  }
};

/**
 * Wait for transaction confirmation
 */
const waitForTransactionConfirmation = async (txHash: string): Promise<void> => {
  // Simulate waiting for blockchain confirmation
  await new Promise((resolve) => setTimeout(resolve, 1000));
  // In production, this would poll the blockchain until the transaction is confirmed
  return;
};

/**
 * Mock function for performing a purchase
 */
const performPurchase = async ({
  tokenAddress,
  sol,
}: {
  tokenAddress: TokenAddress;
  sol: number;
}): Promise<{ amountPurchased: number; transactionHash: string }> => {
  // Simulate purchase with random slippage
  await new Promise((resolve) => setTimeout(resolve, 500));

  const slippage = 0.95 + Math.random() * 0.05; // 95-100% of expected amount
  return {
    amountPurchased: sol * 100 * slippage, // Simulate exchange rate with slippage
    transactionHash: `0x${Math.random().toString(36).substring(2, 15)}`,
  };
};

/**
 * Simulate a token sell
 */
const performTokenSell = async ({
  tokenAddress,
  tokenAmount,
}: {
  tokenAddress: TokenAddress;
  tokenAmount: number;
}): Promise<{ transactionHash: string; solReceived: number }> => {
  // Simulate a sell transaction
  await new Promise((resolve) => setTimeout(resolve, 500));

  return {
    transactionHash: `0x${Math.random().toString(36).substring(2, 15)}`,
    solReceived: tokenAmount * 0.01, // Simulate exchange rate
  };
};

/**
 * Mock function to get current token balance
 */
const getCurrentBalance = async ({
  walletAddress,
  tokenAddress,
}: {
  walletAddress: WalletAddress;
  tokenAddress: TokenAddress;
}): Promise<number> => {
  // In production, this would query the blockchain for the current balance
  return 0; // Mock return
};

/**
 * Remove completed transactions to keep memory usage reasonable
 */
const cleanupCompletedTransactions = (): void => {
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();

  for (const tokenAddress in ourPositions) {
    const position = ourPositions[tokenAddress];

    // Remove completed buys older than 1 day
    position.pendingBuys = position.pendingBuys.filter(
      (tx) => tx.status !== 'completed' || now - tx.timestamp < ONE_DAY
    );

    // Remove completed sells older than 1 day
    position.pendingSells = position.pendingSells.filter(
      (tx) =>
        tx.status !== 'completed' ||
        now - tx.timestamp < ONE_DAY ||
        (tx.remainingToSell && tx.remainingToSell > 0.000001) // Keep if waiting to sell more
    );
  }
};

/**
 * Initialize the system with the wallet addresses
 */
const initialize = (targetWalletAddress: string, ourWalletAddress: string): void => {
  // Store the wallet addresses
  TARGET_WALLET_ADDRESS = targetWalletAddress;
  OUR_WALLET_ADDRESS = ourWalletAddress;

  // Start mirroring
  startMirroring(targetWalletAddress, ourWalletAddress);

  // Set up periodic cleanup
  setInterval(() => {
    cleanupCompletedTransactions();
  }, 6 * 60 * 60 * 1000); // Every 6 hours
};

export {
  triggerTokenBuy,
  triggerTokenSell,
  reconcileTokenPosition,
  reconcileAllPositions,
  initialize,
  cleanupCompletedTransactions,
};
