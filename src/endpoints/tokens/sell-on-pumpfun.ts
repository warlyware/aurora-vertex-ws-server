import { Keypair, PublicKey } from "@solana/web3.js";
import { getKeysFromDb } from "../../utils/wallets";
import { Router, Request, Response } from "express";
import { AURORA_VERTEX_API_KEY } from "../../constants";
import { PumpFunSDK } from "pumpdotfun-sdk";
import { getPumpFunSdk, getSPLBalance, printSPLBalance } from "../../utils/solana";

const SLIPPAGE_BASIS_POINTS = 1000n;

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
    SLIPPAGE_BASIS_POINTS,
    calculatePriorityFees(priorityFeeInLamports),
  );

  return sellResults;
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

    if (!botId ||
      !mintAddress ||
      !tokenAmount ||
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

        res.status(500).json({
          success: false,
          error: result,
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
}