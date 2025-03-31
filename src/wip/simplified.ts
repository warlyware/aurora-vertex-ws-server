/**
 * @cursor prompt: (leave my notes at the top)

I'm building a trading strategy where we try to mimic solana wallet trasaction on DEX exchanges. Assume I already have funcitons to buy and sell. This library will just output the amount to by and sell and call those functions (which you can stub).

My theory is that we only really need to track two amounts, the cumulative bought and sold. There are also two critical junctures, after a buy completes - this can be a long lived transaction on a blockchain so more sells could have come in while waiting, so we check here, and the other juncture is actually seeing a sell. S oat each critical juncture, we call reconcileTokenPosition to make sure our holdings matches theres, but note that we will never buy up if they don't match, we will only sell down. Buying up could cause us to lose a lot of money, so we only sell down on reconcile.

Review my notes and prompt, and let m eknow if you agree with the strategy. If so, implement it in typescript.

 ************
 * @note
 * Record<mirrorWalletAddress: string, {
 *   [tokenAddress: string]: {
 *     mirrorWalletCumulativeTokenBought: number;
 *     mirrorWalletCumulativeTokenSold: number;
 *     mirrorWalletCumulativeSolSpent: number;
 *     mirrorWalletCumulativeSolReceived: number;
 *     personalWalletCumulativeTokenBought: number;
 *     personalWalletCumulativeTokenSold: number;
 *     personalWalletCumulativeSolSpent: number;
 *     personalWalletCumulativeSolReceived: number;
 *   }
 * }>
 *
 * ----
 *
 * mirrorWalletBuy(walletAddress: string, tokenAddress: string, amountInSol: number, tokenReceived: number)
 *  - update mirrorWalletCumulativeSolSpent
 *  - update mirrorWalletCumulativeTokenBought
 *  - eagerly try to assume the amount of token we'll buy, and once the buy is complete, update it to the actual amount (subtract original and add amount from transaction)
 *  - start a purchase
 *  - Once purchase is complete, call reconcileTokenPosition(walletAddress, tokenAddress)
 *
 * mirrorWalletSell(walletAddress: string, tokenAddress: string, amountInToken: number)
 *  - update mirrorWalletCumulativeSolReceived
 *  - update mirrorWalletCumulativeTokenSold
 *  - call reconcileTokenPosition(walletAddress, tokenAddress)
 *
 * reconcileTokenPosition(walletAddress: string, tokenAddress: string)
 *  - calculate the current percentage of the token that the mirror wallet owns
 *  - if the projected percentage is greater than the current percentage, we do nothing. We won't reconcile upward because this could lead to increased costs from things like slippage. Buying up when not seeing a buy signal could cost us a lot of money.
 *  - if the projected percentage is less than the current percentage, sell the token to match their ownership percentage
 *  - Eagerly update our cumulative positions since we may be waiting on buys or sells and more can come in
 *
 * Note: The amount of tokens we purchase isn't known at buy time, it will depend on the bonding curve and slippage
 * So we must use our best guess if we're waiting on buys to complete
 */

// Types for our trading system
type TokenPosition = {
  mirrorWalletCumulativeTokenBought: number;
  mirrorWalletCumulativeTokenSold: number;
  mirrorWalletCumulativeSolSpent: number;
  mirrorWalletCumulativeSolReceived: number;
  personalWalletCumulativeTokenBought: number;
  personalWalletCumulativeTokenSold: number;
  personalWalletCumulativeSolSpent: number;
  personalWalletCumulativeSolReceived: number;
};

type WalletPositions = Record<string, Record<string, TokenPosition>>;

// Stub functions for actual DEX interactions
async function executeBuyOrder(
  tokenAddress: string,
  amountInSol: number
): Promise<{ tokenReceived: number; solSpent: number }> {
  // Stub: In reality, this would interact with the DEX
  return { tokenReceived: amountInSol * 1000, solSpent: amountInSol }; // Dummy conversion rate
}

async function executeSellOrder(
  tokenAddress: string,
  amountInToken: number
): Promise<{ solReceived: number }> {
  // Stub: In reality, this would interact with the DEX
  return { solReceived: amountInToken / 1000 }; // Dummy conversion rate
}

class TradingStrategy {
  private positions: WalletPositions = {};
  private pendingBuys: Map<string, Promise<void>> = new Map();

  private getOrCreatePosition(walletAddress: string, tokenAddress: string): TokenPosition {
    if (!this.positions[walletAddress]) {
      this.positions[walletAddress] = {};
    }
    if (!this.positions[walletAddress][tokenAddress]) {
      this.positions[walletAddress][tokenAddress] = {
        mirrorWalletCumulativeTokenBought: 0,
        mirrorWalletCumulativeTokenSold: 0,
        mirrorWalletCumulativeSolSpent: 0,
        mirrorWalletCumulativeSolReceived: 0,
        personalWalletCumulativeTokenBought: 0,
        personalWalletCumulativeTokenSold: 0,
        personalWalletCumulativeSolSpent: 0,
        personalWalletCumulativeSolReceived: 0,
      };
    }
    return this.positions[walletAddress][tokenAddress];
  }

  private calculateCurrentHoldings(position: TokenPosition, isMirrorWallet: boolean): number {
    const bought = isMirrorWallet
      ? position.mirrorWalletCumulativeTokenBought
      : position.personalWalletCumulativeTokenBought;
    const sold = isMirrorWallet
      ? position.mirrorWalletCumulativeTokenSold
      : position.personalWalletCumulativeTokenSold;
    return bought - sold;
  }

  async mirrorWalletBuy(
    walletAddress: string,
    tokenAddress: string,
    amountInSol: number,
    estimatedTokenReceived: number
  ): Promise<void> {
    const position = this.getOrCreatePosition(walletAddress, tokenAddress);

    // Update mirror wallet position eagerly with estimated amounts
    position.mirrorWalletCumulativeSolSpent += amountInSol;
    position.mirrorWalletCumulativeTokenBought += estimatedTokenReceived;

    // Execute our buy order and store the promise
    const buyPromise = (async () => {
      try {
        // Execute the buy order
        const { tokenReceived, solSpent } = await executeBuyOrder(tokenAddress, amountInSol);

        // Adjust our position with actual amounts (remove estimate, add actual)
        position.mirrorWalletCumulativeTokenBought -= estimatedTokenReceived;
        position.mirrorWalletCumulativeTokenBought += tokenReceived;

        // Reconcile after the buy completes
        await this.reconcileTokenPosition(walletAddress, tokenAddress);
      } catch (error) {
        console.error('Buy order failed:', error);
        // Rollback the eager updates
        position.mirrorWalletCumulativeSolSpent -= amountInSol;
        position.mirrorWalletCumulativeTokenBought -= estimatedTokenReceived;
      }
    })();

    this.pendingBuys.set(`${walletAddress}-${tokenAddress}`, buyPromise);
    await buyPromise;
    this.pendingBuys.delete(`${walletAddress}-${tokenAddress}`);
  }

  async mirrorWalletSell(
    walletAddress: string,
    tokenAddress: string,
    amountInToken: number
  ): Promise<void> {
    const position = this.getOrCreatePosition(walletAddress, tokenAddress);

    // Update mirror wallet position
    position.mirrorWalletCumulativeTokenSold += amountInToken;

    // Execute the sell and update received SOL
    const { solReceived } = await executeSellOrder(tokenAddress, amountInToken);
    position.mirrorWalletCumulativeSolReceived += solReceived;

    // Reconcile after the sell
    await this.reconcileTokenPosition(walletAddress, tokenAddress);
  }

  async reconcileTokenPosition(walletAddress: string, tokenAddress: string): Promise<void> {
    const position = this.getOrCreatePosition(walletAddress, tokenAddress);

    // Wait for any pending buys to complete
    const pendingBuy = this.pendingBuys.get(`${walletAddress}-${tokenAddress}`);
    if (pendingBuy) {
      await pendingBuy;
    }

    const mirrorWalletHoldings = this.calculateCurrentHoldings(position, true);
    const personalWalletHoldings = this.calculateCurrentHoldings(position, false);

    // Calculate the target percentage based on mirror wallet
    const mirrorWalletPercentage =
      mirrorWalletHoldings / (position.mirrorWalletCumulativeTokenBought || 1);
    const personalWalletPercentage =
      personalWalletHoldings / (position.personalWalletCumulativeTokenBought || 1);

    // Only sell down if we're holding more than the mirror wallet percentage
    if (personalWalletPercentage > mirrorWalletPercentage) {
      const targetHoldings = position.personalWalletCumulativeTokenBought * mirrorWalletPercentage;
      const amountToSell = personalWalletHoldings - targetHoldings;

      if (amountToSell > 0) {
        const { solReceived } = await executeSellOrder(tokenAddress, amountToSell);
        position.personalWalletCumulativeTokenSold += amountToSell;
        position.personalWalletCumulativeSolReceived += solReceived;
      }
    }
  }
}

export default TradingStrategy;
