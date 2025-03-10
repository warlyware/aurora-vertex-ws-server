import { Router, Request, Response } from "express";
import { AURORA_VERTEX_API_KEY } from "../../constants";
import { createWallet } from "../../utils/wallets";
import { createBot, createBotWallet } from "../../utils/bots";
import { UPDATE_BOT_SETTINGS } from "../../graphql/mutations/update-bot-settings";
import { getGqlClient } from "../../graphql/client";

export function setupCreateBotRoute(router: Router) {
  router.post('/create-bot', async (req: Request, res: Response) => {
    const client = await getGqlClient();
    const { name, apiKey, userId } = req.body;

    if (apiKey !== AURORA_VERTEX_API_KEY) {
      return res.status(401).json({
        error: "Invalid API key",
        status: 401,
      });
    }

    const wallet: {
      id: string;
      address: string;
    } = await createWallet(userId);

    if (!wallet) {
      return res.status(500).json({
        error: "Error creating wallet",
        status: 500,
      });
    }

    try {

      const bot = await createBot(userId, wallet.id, name);

      if (!bot) {
        return res.status(500).json({
          error: "Error creating bot",
          status: 500,
        });
      }

      const botWallet = await createBotWallet(bot.id, wallet.id);

      if (!botWallet) {
        return res.status(500).json({
          error: "Error creating bot wallet",
          status: 500,
        });
      }

      await client.request({
        // update bot with bot wallet id
        document: UPDATE_BOT_SETTINGS,
        variables: {
          botId: bot.id,
          botSettings: {
            botWalletId: botWallet.id,
          },
        },
      });

      return res.status(200).json({
        bot,
        botWallet,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        error: "Error creating bot",
        status: 500,
      });
    }
  });
}