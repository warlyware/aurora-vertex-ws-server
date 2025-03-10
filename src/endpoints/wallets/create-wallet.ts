import { Router, Request, Response } from "express";
import { AURORA_VERTEX_API_KEY } from "../../constants";
import { createWallet } from "../../utils/wallets";

export function setupCreateWalletRoute(router: Router) {
  router.post('/create-wallet', async (req: Request, res: Response) => {
    const { userId, apiKey } = req.body;

    if (apiKey !== AURORA_VERTEX_API_KEY) {
      return res.status(401).json({
        error: "Invalid API key",
        status: 401,
      });
    }

    await createWallet(userId, res);
  });
}