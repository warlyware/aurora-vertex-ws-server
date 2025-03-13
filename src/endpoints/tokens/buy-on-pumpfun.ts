import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { getKeysFromDb, helius } from "../../utils/wallets";
import { Router, Request, Response } from "express";
import { AURORA_VERTEX_API_KEY, AURORA_VERTEX_API_URL } from "../../constants";
import { PumpFunSDK } from "pumpdotfun-sdk";
import { getPumpFunSdk, getSPLBalance, printSPLBalance } from "../../utils/solana";
import { sendSplTokens } from "../../utils/tokens";
import axios from "axios";

const SLIPPAGE_BASIS_POINTS = 1000n;

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

const MAX_RETRIES = 25;
const RETRY_DELAY_MS = 500;

const retryBuy = async (
  sdk: PumpFunSDK,
  buyerAccount: Keypair,
  mint: PublicKey,
  amountInLamports: number,
  priorityFeeInLamports: number,
  retryCount = 0
): Promise<any> => {
  try {
    return await buyTokens(sdk, buyerAccount, mint, amountInLamports, priorityFeeInLamports);
  } catch (error) {
    if (error instanceof Error &&
      error.message.includes("Bonding curve account not found") &&
      retryCount < MAX_RETRIES) {
      console.log(`Retry attempt ${retryCount + 1} of ${MAX_RETRIES}`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      return retryBuy(sdk, buyerAccount, mint, amountInLamports, priorityFeeInLamports, retryCount + 1);
    }
    throw error;
  }
};

export function setupBuyOnPumpfunRoute(router: Router) {
  router.post('/buy-on-pumpfun', async (req: Request, res: Response) => {
    const {
      botId,
      mintAddress,
      amountInLamports,
      apiKey,
      priorityFeeInLamports,
      destinationAddress,
      shouldAutoSell,
      autoSellDelayInMs = 0
    } = req.body;

    console.log("Buy on pumpfun", {
      botId,
      mintAddress,
      amountInLamports,
      priorityFeeInLamports,
      destinationAddress,
    });

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

      const result = await retryBuy(sdk, fromKeypair, new PublicKey(mintAddress), amountInLamports, priorityFeeInLamports);

      console.log("Buy result", result);

      if (result.success) {
        if (shouldAutoSell) {
          console.log("Auto selling tokens");

          const balance = await getSPLBalance(sdk.connection, new PublicKey(mintAddress), fromPubkey);

          if (autoSellDelayInMs) {
            await new Promise(resolve => setTimeout(resolve, autoSellDelayInMs));
          }

          const response = await axios.post(`${AURORA_VERTEX_API_URL}/sell-on-pumpfun`, {
            botId,
            mintAddress,
            tokenAmount: balance?.baseAmount,
            apiKey: AURORA_VERTEX_API_KEY,
            priorityFeeInLamports: priorityFeeInLamports
          }).catch(error => {
            console.error('Error executing sell order:', error.message);
            return;
          });

          console.log("Sell result", response?.data);

        } else if (destinationAddress) {
          console.log("Sending to destination address", destinationAddress);

          const toPubkey = new PublicKey(destinationAddress);
          const mint = new PublicKey(mintAddress);

          const balance = await getSPLBalance(sdk.connection, new PublicKey(mintAddress), fromPubkey);
          console.log("Balance after buy", balance.amount, balance.baseAmount);

          if (balance?.baseAmount && Number(balance?.baseAmount) > 0) {

            const sendSignature = await sendSplTokens(fromKeypair, toPubkey, mint, balance?.baseAmount || 0);
            console.log("Send signature", sendSignature);
            res.status(200).json({
              success: true,
              buySignature: result.signature,
              sendSignature,
            });
          }
        } else {
          res.status(200).json({
            success: true,
            buySignature: result.signature,
          });
        }
      }

      // if (destinationAddress && result.success) {
      //   const toPubkey = new PublicKey(destinationAddress);
      //   const mint = new PublicKey(mintAddress);

      //   const sendSignature = await sendSplTokens(fromKeypair, toPubkey, mint, result.amount);

      //   res.status(200).json({
      //     success: true,
      //     buySignature: result.signature,
      //     sendSignature,
      //   });
      // } else if (result.success) {
      // printSPLBalance(sdk.connection, mintAddress, fromPubkey);
      // const { amount, baseAmount } = await getSPLBalance(sdk.connection, new PublicKey(mintAddress), fromPubkey);
      // console.log("Balance after buy", amount);
      // console.log("Bonding curve after buy", await sdk.getBondingCurveAccount(
      //   new PublicKey(mintAddress)
      // ));

      // let sendSignature = null;
      // if (destinationAddress && baseAmount) {
      //   const toPubkey = new PublicKey(destinationAddress);
      //   const mint = new PublicKey(mintAddress);

      //   sendSignature = await sendSplTokens(fromKeypair, toPubkey, mint, baseAmount);
      // }

      // res.status(200).json({
      //   success: true,
      //   buySignature: result.signature,
      //   // sendSignature
      // });
      // } else {
      //   console.log("Buy failed", result);

      //   res.status(500).json({
      //     success: false,
      //     error: result,
      //   });
      // }
    } catch (error) {
      if (error instanceof Error && error.message.includes("Curve is complete")) {
        console.log("Curve is complete, need to use Raydium");
        res.status(500).json({
          success: false,
          error: "Curve is complete",
        });
      } else if (error instanceof Error && error.message.includes("Bonding curve account not found")) {
        console.log("Bonding curve account not found after all retries");
        res.status(500).json({
          success: false,
          error: "Bonding curve account not found after all retries",
        });
      } else {
        console.error('Error buying:', error);
        res.status(500).json({
          success: false,
          error: error,
        });
      }
    }
  });
}

