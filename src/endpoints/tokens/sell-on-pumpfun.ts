import { Keypair, PublicKey } from "@solana/web3.js";
import { getKeysFromDb } from "../../utils/wallets";
import { Router, Request, Response } from "express";
import { AURORA_VERTEX_API_KEY } from "../../constants";
import { PumpFunSDK } from "pumpdotfun-sdk";
import { getPumpFunSdk, getSPLBalance, printSPLBalance } from "../../utils/solana";

const DEFAULT_SLIPPAGE_BASIS_POINTS = 2000n;

const calculatePriorityFees = (priorityFeeInLamports: number) => {
  const PUMPFUN_SELL_UNIT_LIMIT = 180_000;
  const unitPrice = Math.floor(priorityFeeInLamports / PUMPFUN_SELL_UNIT_LIMIT);

  return {
    unitLimit: PUMPFUN_SELL_UNIT_LIMIT,
    unitPrice
  };
};

const sellTokens = async (
  sdk: PumpFunSDK,
  sellerAccount: Keypair,
  mint: PublicKey,
  tokenAmount: bigint,
  priorityFeeInLamports: number
) => {
  const sellResults = await sdk.sell(
    sellerAccount,
    mint,
    tokenAmount,
    DEFAULT_SLIPPAGE_BASIS_POINTS,
    calculatePriorityFees(priorityFeeInLamports),
  );

  return sellResults;
};

const sellAllTokens = async (
  sdk: PumpFunSDK,
  sellerAccount: Keypair,
  priorityFeeInLamports: number
) => {
  const tokenAccounts = await sdk.connection.getParsedTokenAccountsByOwner(
    sellerAccount.publicKey,
    { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
  );

  const results = [];
  for (const account of tokenAccounts.value) {
    const tokenBalance = BigInt(account.account.data.parsed.info.tokenAmount.amount);
    const mint = new PublicKey(account.account.data.parsed.info.mint);

    if (tokenBalance > 0n) {
      try {
        const result = await sellTokens(sdk, sellerAccount, mint, tokenBalance, priorityFeeInLamports);
        results.push({
          mint: mint.toString(),
          amount: tokenBalance.toString(),
          success: result.success,
          signature: result.signature,
        });
      } catch (error) {
        results.push({
          mint: mint.toString(),
          amount: tokenBalance.toString(),
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  return results;
};

export function setupSellOnPumpfunRoute(router: Router) {
  router.post('/sell-on-pumpfun', async (req: Request, res: Response) => {
    const {
      botId,
      mintAddress,
      tokenAmount,
      apiKey,
      priorityFeeInLamports,
    } = req.body;

    console.log("Sell on pumpfun", {
      botId,
      mintAddress,
      tokenAmount,
      priorityFeeInLamports,
    });

    if (apiKey !== AURORA_VERTEX_API_KEY) {
      return res.status(401).json({
        error: "Invalid API key",
        status: 401,
      });
    }

    if (!tokenAmount) {
      return res.status(400).json({
        error: "Invalid token amount",
        status: 400,
      });
    }

    if (!botId ||
      !mintAddress ||
      priorityFeeInLamports === undefined ||
      priorityFeeInLamports < 0 ||
      priorityFeeInLamports === null
    ) {
      return res.status(400).json({
        error: "Missing required parameters",
        status: 400,
      });
    }

    try {
      const sdk = await getPumpFunSdk(botId);
      const { keypair: fromKeypair, publicKey } = await getKeysFromDb(botId);
      const fromPubkey = new PublicKey(publicKey);
      const mint = new PublicKey(mintAddress);

      const sellAmount = BigInt(tokenAmount);

      const { baseAmount: currentBalance } = await getSPLBalance(sdk.connection, mint, fromPubkey);
      if (!currentBalance || BigInt(currentBalance) < sellAmount) {
        return res.status(400).json({
          success: false,
          error: "Insufficient token balance for sell",
          currentBalance: currentBalance?.toString(),
          requestedAmount: sellAmount.toString(),
        });
      }

      const result = await sellTokens(sdk, fromKeypair, mint, sellAmount, priorityFeeInLamports);

      if (result.success) {
        // printSPLBalance(sdk.connection, mintAddress, fromPubkey);
        // const { amount } = await getSPLBalance(sdk.connection, mint, fromPubkey);
        // console.log("Balance after sell", amount);
        // console.log("Bonding curve after sell", await sdk.getBondingCurveAccount(mint));

        res.status(200).json({
          success: true,
          sellSignature: result.signature,
        });
      } else {
        console.log("Sell failed", result);

        // retry 2 more times
        for (let i = 0; i < 2; i++) {
          console.log("Retrying sell", i + 1);
          const result = await sellTokens(sdk, fromKeypair, mint, sellAmount, priorityFeeInLamports);
          if (result.success) {
            res.status(200).json({
              success: true,
              sellSignature: result.signature,
            });
          }
        }

        res.status(500).json({
          success: false,
          error: "Sell failed",
        });
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("Curve is complete")) {
        console.log("Curve is complete, need to use Raydium");
        res.status(500).json({
          success: false,
          error: "Curve is complete",
        });
      } else {
        console.error('Error selling:', error);
        res.status(500).json({
          success: false,
          error: error,
        });
      }
    }
  });

  router.post('/sell-all-on-pumpfun', async (req: Request, res: Response) => {
    const {
      botId,
      apiKey,
      priorityFeeInLamports,
    } = req.body;

    console.log("Sell all on pumpfun", {
      botId,
      priorityFeeInLamports,
    });

    if (apiKey !== AURORA_VERTEX_API_KEY) {
      return res.status(401).json({
        error: "Invalid API key",
        status: 401,
      });
    }

    if (!botId ||
      priorityFeeInLamports === undefined ||
      priorityFeeInLamports < 0 ||
      priorityFeeInLamports === null
    ) {
      return res.status(400).json({
        error: "Missing required parameters",
        status: 400,
      });
    }

    try {
      const sdk = await getPumpFunSdk(botId);
      const { keypair: fromKeypair } = await getKeysFromDb(botId);

      const results = await sellAllTokens(sdk, fromKeypair, priorityFeeInLamports);

      const successfulSells = results.filter(r => r.success);
      const failedSells = results.filter(r => !r.success);

      res.status(200).json({
        success: true,
        results: {
          successful: successfulSells,
          failed: failedSells,
          totalSuccessful: successfulSells.length,
          totalFailed: failedSells.length,
        }
      });
    } catch (error) {
      console.error('Error selling all tokens:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : error,
      });
    }
  });
}