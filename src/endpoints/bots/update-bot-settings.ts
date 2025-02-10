import { Router, Request, Response } from "express";
import { AURORA_VERTEX_API_KEY } from "../../constants";
import { updateBotSettings } from "../../utils/bots";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
export function setupUpdateBotSettingsRoute(router: Router) {
  router.post('/update-bot-settings', async (req: Request, res: Response) => {
    const { botId, priorityFee: priorityFeeInSol, buyRatio, apiKey, ejectWalletAddress } = req.body;

    if (apiKey !== AURORA_VERTEX_API_KEY) {
      return res.status(401).json({
        error: "Invalid API key",
        status: 401,
      });
    }
    const priorityFeeInSolNumber = Number(priorityFeeInSol);
    const priorityFeeInLamports = priorityFeeInSolNumber * LAMPORTS_PER_SOL;

    const botSettings = {
      priorityFeeInLamports,
      buyRatio,
      ejectWalletAddress,
    }

    await updateBotSettings(botId, botSettings, res);
  });
}