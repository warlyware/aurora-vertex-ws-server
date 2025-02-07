import { Keypair, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { getKeypairFromSecretKey, getKeysFromDb, helius } from "../../utils/wallets";
import { Router, Request, Response } from "express";
import { AURORA_VERTEX_API_KEY } from "../../constants";
import { sendSplTokens } from "../../utils/tokens";
import { getCoinInfo } from "../../utils/coins";

export function setupTransferSplTokensRoute(router: Router) {
  router.post('/transfer-spl-tokens', async (req: Request, res: Response) => {
    const { botId, toAddress, amount, apiKey, mintAddress } = req.body;

    if (apiKey !== AURORA_VERTEX_API_KEY) {
      return res.status(401).json({
        error: "Invalid API key",
        status: 401,
      });
    }

    if (!botId || !toAddress || !amount || !mintAddress) {
      return res.status(400).json({
        error: "Missing required parameters",
        status: 400,
      });
    }

    try {
      const {
        keypair: fromKeypair,
      } = await getKeysFromDb(botId);

      const toPubkey = new PublicKey(toAddress);
      const mint = new PublicKey(mintAddress);
      const info = await getCoinInfo(mintAddress);
      const decimals = info?.token_info?.decimals;

      if (!decimals) {
        return res.status(400).json({
          error: "Invalid mint address, no decimals found",
          status: 400,
        });
      }

      const transactionSignature = await sendSplTokens(
        fromKeypair,
        toPubkey,
        mint,
        amount * 10 ** decimals
      );

      res.status(200).json({
        success: true,
        transactionSignature: transactionSignature,
      });
    } catch (error) {
      console.error('Error transferring SPL tokens:', error);

      res.status(500).json({
        success: false,
        error: error,
      });
    }
  });
}

