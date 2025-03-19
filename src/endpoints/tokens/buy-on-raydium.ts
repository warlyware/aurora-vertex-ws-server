import { Keypair, LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getKeysFromDb } from "../../utils/wallets";
import { Router, Request, Response } from "express";
import { AURORA_VERTEX_API_KEY, AURORA_VERTEX_API_URL } from "../../constants";
import { getSPLBalance } from "../../utils/solana";
import axios from "axios";
import { sendSplTokens } from "../../utils/tokens";
import { Connection } from "@solana/web3.js";

const GMGN_API_HOST = 'https://gmgn.ai';
const DEFAULT_SLIPPAGE = 1; // 1%
const SOL_MINT = 'So11111111111111111111111111111111111111112';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const executeRaydiumTrade = async (
  fromKeypair: Keypair,
  mintAddress: string,
  amountInLamports: number,
  slippage: number = DEFAULT_SLIPPAGE
) => {
  const fromAddress = fromKeypair.publicKey.toString();

  // Get quote and unsigned transaction
  const quoteUrl = `${GMGN_API_HOST}/defi/router/v1/sol/tx/get_swap_route?` +
    `token_in_address=${SOL_MINT}&` +
    `token_out_address=${mintAddress}&` +
    `in_amount=${amountInLamports}&` +
    `from_address=${fromAddress}&` +
    `slippage=${slippage}`;

  const route = await axios.get(quoteUrl);

  if (!route.data?.data?.raw_tx?.swapTransaction) {
    throw new Error('Failed to get swap route');
  }

  // Sign transaction
  const swapTransactionBuf = Buffer.from(route.data.data.raw_tx.swapTransaction, 'base64');
  const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
  transaction.sign([fromKeypair]);
  const signedTx = Buffer.from(transaction.serialize()).toString('base64');

  // Submit transaction
  const submitResponse = await axios.post(
    `${GMGN_API_HOST}/defi/router/v1/sol/tx/submit_signed_transaction`,
    { signed_tx: signedTx },
    { headers: { 'content-type': 'application/json' } }
  );

  if (!submitResponse.data?.data?.hash) {
    throw new Error('Failed to submit transaction');
  }

  const hash = submitResponse.data.data.hash;
  const lastValidBlockHeight = route.data.data.raw_tx.lastValidBlockHeight;

  // Poll for transaction status
  while (true) {
    const statusUrl = `${GMGN_API_HOST}/defi/router/v1/sol/tx/get_transaction_status?` +
      `hash=${hash}&last_valid_height=${lastValidBlockHeight}`;

    const status = await axios.get(statusUrl);

    if (status.data?.data?.success) {
      return {
        success: true,
        signature: hash
      };
    }

    if (status.data?.data?.expired) {
      throw new Error('Transaction expired');
    }

    await sleep(1000);
  }
};

export function setupBuyOnRaydiumRoute(router: Router) {
  router.post('/buy-on-raydium', async (req: Request, res: Response) => {
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

    console.log("Buy on raydium", {
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

    if (!botId || !mintAddress || !amountInLamports) {
      return res.status(400).json({
        error: "Missing required parameters",
        status: 400,
      });
    }

    try {
      const { keypair: fromKeypair, publicKey } = await getKeysFromDb(botId);
      const fromPubkey = new PublicKey(publicKey);

      const result = await executeRaydiumTrade(
        fromKeypair,
        mintAddress,
        amountInLamports
      );

      if (result.success) {
        if (shouldAutoSell) {
          const connection = new Connection('https://api.mainnet-beta.solana.com');
          const balance = await getSPLBalance(connection, new PublicKey(mintAddress), fromPubkey);
          console.log('Balance', balance);

          console.log("Auto selling tokens with delay of", autoSellDelayInMs);

          if (autoSellDelayInMs) {
            await sleep(autoSellDelayInMs);
          }

          const response = await axios.post(`${AURORA_VERTEX_API_URL}/sell-on-raydium`, {
            botId,
            mintAddress,
            tokenAmount: balance?.baseAmount,
            apiKey: AURORA_VERTEX_API_KEY,
            priorityFeeInLamports
          }).catch(error => {
            console.error('Error executing sell order:', error.message);
            return;
          });

          console.log("Sell result", response?.data);
        } else if (destinationAddress) {
          console.log("Sending to destination address", destinationAddress);

          const toPubkey = new PublicKey(destinationAddress);
          const mint = new PublicKey(mintAddress);

          const connection = new Connection('https://api.mainnet-beta.solana.com');
          const balance = await getSPLBalance(connection, mint, fromPubkey);
          console.log("Balance after buy", balance.amount, balance.baseAmount);

          if (balance?.baseAmount && Number(balance?.baseAmount) > 0) {
            const sendSignature = await sendSplTokens(fromKeypair, toPubkey, mint, balance?.baseAmount);
            console.log("Send signature", sendSignature);

            res.status(200).json({
              success: true,
              buySignature: result.signature,
              sendSignature,
            });
            return;
          }
        }

        res.status(200).json({
          success: true,
          buySignature: result.signature,
        });
      } else {
        res.status(500).json({
          success: false,
          error: "Trade failed",
        });
      }
    } catch (error) {
      console.error('Error buying:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : error,
      });
    }
  });
} 