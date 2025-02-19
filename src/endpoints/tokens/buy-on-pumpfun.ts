import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { getKeysFromDb, helius } from "../../utils/wallets";
import { Router, Request, Response } from "express";
import { AURORA_VERTEX_API_KEY } from "../../constants";
import { PumpFunSDK } from "pumpdotfun-sdk";
import { getPumpFunSdk, getSPLBalance, printSPLBalance } from "../../utils/solana";
import { sendSplTokens } from "../../utils/tokens";

const SLIPPAGE_BASIS_POINTS = 300n;

const calculatePriorityFees = (priorityFeeInLamports: number) => {
  const PUMPFUN_BUY_UNIT_LIMIT = 180_000;
  const unitPrice = Math.floor(priorityFeeInLamports / PUMPFUN_BUY_UNIT_LIMIT);

  return {
    unitLimit: PUMPFUN_BUY_UNIT_LIMIT,
    unitPrice
  };
};

const buyTokens = async (
  sdk: PumpFunSDK,
  buyerAccount: Keypair,
  mint: PublicKey,
  amountInLamports: number,
  priorityFeeInLamports: number
) => {
  const buyResults = await sdk.buy(
    buyerAccount,
    mint,
    BigInt(amountInLamports),
    SLIPPAGE_BASIS_POINTS,
    calculatePriorityFees(priorityFeeInLamports),
  );

  return buyResults;
};

export function setupBuyOnPumpfunRoute(router: Router) {
  router.post('/buy-on-pumpfun', async (req: Request, res: Response) => {
    const { botId,
      mintAddress,
      amountInLamports,
      apiKey,
      priorityFeeInLamports,
      destinationAddress,
    } = req.body;

    if (apiKey !== AURORA_VERTEX_API_KEY) {
      return res.status(401).json({
        error: "Invalid API key",
        status: 401,
      });
    }

    if (!botId ||
      !mintAddress ||
      !amountInLamports ||
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

      const result = await buyTokens(sdk, fromKeypair, new PublicKey(mintAddress), amountInLamports, priorityFeeInLamports);

      if (result.success) {
        printSPLBalance(sdk.connection, mintAddress, fromPubkey);
        const { amount, baseAmount } = await getSPLBalance(sdk.connection, new PublicKey(mintAddress), fromPubkey);
        console.log("Balance after buy", amount);
        console.log("Bonding curve after buy", await sdk.getBondingCurveAccount(
          new PublicKey(mintAddress)
        ));

        let sendSignature = null;
        if (destinationAddress && baseAmount) {
          const toPubkey = new PublicKey(destinationAddress);
          const mint = new PublicKey(mintAddress);

          sendSignature = await sendSplTokens(fromKeypair, toPubkey, mint, baseAmount);
        }

        res.status(200).json({
          success: true,
          buySignature: result.signature,
          sendSignature
        });
      } else {
        console.log("Buy failed", result);

        res.status(500).json({
          success: false,
          error: result,
        });
      }
    } catch (error) {
      console.error('Error buying:', error);

      res.status(500).json({
        success: false,
        error: error,
      });
    }
  });
}

