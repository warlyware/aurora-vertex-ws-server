import { Router, Request, Response } from "express";
import { AURORA_VERTEX_API_KEY } from "../../constants";
import { updateBotSettings } from "../../utils/bots";

export function setupUpdateBotSettingsRoute(router: Router) {
  router.post('/update-bot-settings', async (req: Request, res: Response) => {
    const { botId, apiKey, ejectWalletAddress } = req.body;

    if (apiKey !== AURORA_VERTEX_API_KEY) {
      return res.status(401).json({
        error: "Invalid API key",
        status: 401,
      });
    }

    await updateBotSettings(botId, {
      ejectWalletAddress,
    }, res);
  });
}