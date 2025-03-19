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
      // First try PumpFun
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
        // If PumpFun fails with "Curve is complete", try Raydium
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
      // First try PumpFun
      const pumpFunResponse = await axios.post(`${AURORA_VERTEX_API_URL}/sell-on-pumpfun`, {
        botId,
        mintAddress,
        tokenAmount,
        apiKey,
        priorityFeeInLamports,
        sellAll,
      }).catch(async (error) => {
        // If PumpFun fails with "Curve is complete", try Raydium
        console.log("PumpFun error", error.response?.data);
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

          return {
            ...raydiumResponse.data,
            venue: "raydium",
          };
        }
        throw error;
      });

      res.status(200).json({
        ...pumpFunResponse,
        venue: "pumpfun",
      });
    } catch (error) {
      console.error('Error selling token:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : error,
      });
    }
  });
} 