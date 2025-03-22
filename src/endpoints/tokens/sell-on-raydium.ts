import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getKeysFromDb } from "../../utils/wallets";
import { Router, Request, Response } from "express";
import { AURORA_VERTEX_API_KEY, RPC_ENDPOINT } from "../../constants";
import { getSPLBalance } from "../../utils/solana";
import axios from "axios";

const GMGN_API_HOST = 'https://gmgn.ai';
const DEFAULT_SLIPPAGE = 1; // 1%
const SOL_MINT = 'So11111111111111111111111111111111111111112';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const executeRaydiumSell = async (
  fromKeypair: Keypair,
  mintAddress: string,
  tokenAmount: string,
  slippage: number = DEFAULT_SLIPPAGE
) => {
  const fromAddress = fromKeypair.publicKey.toString();

  // For sells, we swap from token to SOL (reverse of buy)
  const quoteUrl = `${GMGN_API_HOST}/defi/router/v1/sol/tx/get_swap_route?` +
    `token_in_address=${mintAddress}&` +
    `token_out_address=${SOL_MINT}&` +
    `in_amount=${tokenAmount}&` +
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

export function setupSellOnRaydiumRoute(router: Router) {
  router.post('/sell-on-raydium', async (req: Request, res: Response) => {
    const {
      botId,
      mintAddress,
      tokenAmount,
      apiKey,
      priorityFeeInLamports,
      sellAll = false,
    } = req.body;

    console.log("Sell on raydium", {
      botId,
      mintAddress,
      tokenAmount,
      priorityFeeInLamports,
      sellAll,
    });

    if (apiKey !== AURORA_VERTEX_API_KEY) {
      return res.status(401).json({
        error: "Invalid API key",
        status: 401,
      });
    }

    if (!sellAll && !tokenAmount) {
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
      const { keypair: fromKeypair, publicKey } = await getKeysFromDb(botId);
      const fromPubkey = new PublicKey(publicKey);
      const mint = new PublicKey(mintAddress);

      // Get current balance
      const connection = new Connection(RPC_ENDPOINT);
      const { baseAmount: currentBalance } = await getSPLBalance(connection, mint, fromPubkey);

      if (!currentBalance || BigInt(currentBalance) <= BigInt(0)) {
        return res.status(400).json({
          success: false,
          error: "No token balance to sell",
          currentBalance: currentBalance?.toString(),
        });
      }

      // If sellAll is true, use entire balance, otherwise use specified amount
      const amountToSell = sellAll ? currentBalance : tokenAmount;

      // Verify balance is sufficient if not selling all
      if (!sellAll && BigInt(currentBalance) < BigInt(amountToSell)) {
        return res.status(400).json({
          success: false,
          error: "Insufficient token balance for sell",
          currentBalance: currentBalance?.toString(),
          requestedAmount: amountToSell.toString(),
        });
      }

      const result = await executeRaydiumSell(
        fromKeypair,
        mintAddress,
        amountToSell.toString(),
        DEFAULT_SLIPPAGE
      );

      if (result.success) {
        res.status(200).json({
          success: true,
          sellSignature: result.signature,
          amountSold: amountToSell.toString(),
        });
      } else {
        console.log("Sell failed", result);

        res.status(500).json({
          success: false,
          error: "Sell failed",
        });
      }
    } catch (error) {
      console.error('Error selling:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : error,
      });
    }
  });

  router.post('/sell-all-on-raydium', async (req: Request, res: Response) => {
    const {
      botId,
      apiKey,
      priorityFeeInLamports,
    } = req.body;

    console.log("Sell all on raydium", {
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
      const { keypair: fromKeypair, publicKey } = await getKeysFromDb(botId);
      const fromPubkey = new PublicKey(publicKey);
      const connection = new Connection(RPC_ENDPOINT);

      // Get all token accounts
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        fromPubkey,
        { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
      );

      const results = [];
      for (const account of tokenAccounts.value) {
        const tokenBalance = BigInt(account.account.data.parsed.info.tokenAmount.amount);
        const mint = new PublicKey(account.account.data.parsed.info.mint);

        if (tokenBalance > 0n) {
          try {
            const result = await executeRaydiumSell(
              fromKeypair,
              mint.toString(),
              tokenBalance.toString(),
              DEFAULT_SLIPPAGE
            );

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