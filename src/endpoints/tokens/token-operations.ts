import { Connection, PublicKey } from "@solana/web3.js";
import { Router, Request, Response } from "express";
import { AURORA_VERTEX_API_KEY, AURORA_VERTEX_API_URL } from "../../constants";
import axios from "axios";

// TODO: Implement proper check for Raydium liquidity
const isTokenOnRaydium = async (mintAddress: string): Promise<boolean> => {
  // Stub implementation
  // Could potentially:
  // 1. Check if token has a Raydium pool
  // 2. Check token metadata for known flags
  // 3. Query token list or cache
  return false;
};

interface TokenSaleResult {
  mint: string;
  amount: string;
  success: boolean;
  error?: string;
  signature?: string;
}

interface SaleResults {
  successful: TokenSaleResult[];
  failed: TokenSaleResult[];
  totalSuccessful: number;
  totalFailed: number;
}

export function setupTokenOperationsRoutes(router: Router) {
  router.post('/buy-token', async (req: Request, res: Response) => {
    const {
      botId,
      mintAddress,
      amountInLamports,
      apiKey,
      priorityFeeInLamports,
      destinationAddress,
      shouldAutoSell,
      autoSellDelayInMs,
      isPostBondingCurve = false,
    } = req.body;

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
      // If we know it's post bonding curve, go straight to Raydium
      if (isPostBondingCurve) {
        const raydiumResponse = await axios.post(`${AURORA_VERTEX_API_URL}/buy-on-raydium`, {
          botId,
          mintAddress,
          amountInLamports,
          apiKey,
          priorityFeeInLamports,
          destinationAddress,
          shouldAutoSell,
          autoSellDelayInMs,
        });

        return res.status(200).json(raydiumResponse.data);
      }

      // Otherwise try PumpFun first
      const pumpFunResponse = await axios.post(`${AURORA_VERTEX_API_URL}/buy-on-pumpfun`, {
        botId,
        mintAddress,
        amountInLamports,
        apiKey,
        priorityFeeInLamports,
        destinationAddress,
        shouldAutoSell,
        autoSellDelayInMs,
      }).catch(async (error) => {
        if (error.response?.data?.error === "Curve is complete") {
          console.log("Token is post bonding curve, trying Raydium");

          const raydiumResponse = await axios.post(`${AURORA_VERTEX_API_URL}/buy-on-raydium`, {
            botId,
            mintAddress,
            amountInLamports,
            apiKey,
            priorityFeeInLamports,
            destinationAddress,
            shouldAutoSell,
            autoSellDelayInMs,
          });

          return raydiumResponse;
        }
        throw error;
      });

      res.status(200).json(pumpFunResponse.data);
    } catch (error) {
      console.error('Error buying token:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : error,
      });
    }
  });

  router.post('/sell-token', async (req: Request, res: Response) => {
    const {
      botId,
      mintAddress,
      tokenAmount,
      apiKey,
      priorityFeeInLamports,
      sellAll = false,
      isPostBondingCurve = false,
    } = req.body;

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

    if (!botId || !mintAddress) {
      return res.status(400).json({
        error: "Missing required parameters",
        status: 400,
      });
    }

    try {
      // If we know it's post bonding curve, go straight to Raydium
      if (isPostBondingCurve) {
        const raydiumResponse = await axios.post(`${AURORA_VERTEX_API_URL}/sell-on-raydium`, {
          botId,
          mintAddress,
          tokenAmount,
          apiKey,
          priorityFeeInLamports,
          sellAll,
        });

        return res.status(200).json(raydiumResponse.data);
      }

      // Otherwise try PumpFun first
      const pumpFunResponse = await axios.post(`${AURORA_VERTEX_API_URL}/sell-on-pumpfun`, {
        botId,
        mintAddress,
        tokenAmount,
        apiKey,
        priorityFeeInLamports,
        sellAll,
      }).catch(async (error) => {
        if (error.response?.data?.error === "Curve is complete") {
          console.log("Token is post bonding curve, trying Raydium");

          const raydiumResponse = await axios.post(`${AURORA_VERTEX_API_URL}/sell-on-raydium`, {
            botId,
            mintAddress,
            tokenAmount,
            apiKey,
            priorityFeeInLamports,
            sellAll,
          });

          return raydiumResponse;
        }
        throw error;
      });

      res.status(200).json(pumpFunResponse.data);
    } catch (error) {
      console.error('Error selling token:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : error,
      });
    }
  });

  router.post('/sell-all-tokens', async (req: Request, res: Response) => {
    const {
      botId,
      apiKey,
      priorityFeeInLamports,
      isPostBondingCurve = false,
    } = req.body;

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
      // If we know it's post bonding curve, go straight to Raydium
      if (isPostBondingCurve) {
        const raydiumResponse = await axios.post(`${AURORA_VERTEX_API_URL}/sell-all-on-raydium`, {
          botId,
          apiKey,
          priorityFeeInLamports,
        });

        return res.status(200).json(raydiumResponse.data);
      }

      // Try PumpFun first
      const pumpFunResponse = await axios.post(`${AURORA_VERTEX_API_URL}/sell-all-on-pumpfun`, {
        botId,
        apiKey,
        priorityFeeInLamports,
      });

      // Check if any tokens failed due to "Curve is complete"
      const pumpFunResults = pumpFunResponse.data.results as SaleResults;
      const curveCompleteTokens = pumpFunResults.failed.filter(
        (result: TokenSaleResult) => result.error === "Curve is complete"
      );

      // If we have any tokens that failed due to curve completion, try them on Raydium
      if (curveCompleteTokens.length > 0) {
        console.log("Some tokens are post bonding curve, trying Raydium for those");

        // Try selling the curve complete tokens on Raydium
        const raydiumResponse = await axios.post(`${AURORA_VERTEX_API_URL}/sell-all-on-raydium`, {
          botId,
          apiKey,
          priorityFeeInLamports,
        });

        // Merge results, keeping successful PumpFun sales and updating Curve Complete ones with Raydium results
        const raydiumResults = raydiumResponse.data.results as SaleResults;

        // Keep track of which mints were successfully sold on Raydium
        const raydiumSuccessMints = new Set(raydiumResults.successful.map((r: TokenSaleResult) => r.mint));

        // Update final results
        const finalResults = {
          successful: [
            ...pumpFunResults.successful,
            ...raydiumResults.successful
          ],
          failed: [
            // Keep PumpFun failures that weren't "Curve is complete"
            ...pumpFunResults.failed.filter((r: TokenSaleResult) => r.error !== "Curve is complete"),
            // Add Raydium failures for tokens that weren't successfully sold
            ...raydiumResults.failed.filter((r: TokenSaleResult) => !raydiumSuccessMints.has(r.mint))
          ]
        };

        return res.status(200).json({
          success: true,
          results: {
            ...finalResults,
            totalSuccessful: finalResults.successful.length,
            totalFailed: finalResults.failed.length
          }
        });
      }

      // If no curve complete tokens, just return PumpFun results
      return res.status(200).json(pumpFunResponse.data);
    } catch (error) {
      console.error('Error selling all tokens:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : error,
      });
    }
  });
} 