import { Keypair, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { getKeypairFromSecretKey, getKeysFromDb, helius } from "../../utils/wallets";
import { Router, Request, Response } from "express";
import { AURORA_VERTEX_API_KEY } from "../../constants";

export function setupTransferSolRoute(router: Router) {
  router.post('/transfer-sol', async (req: Request, res: Response) => {
    const { botId, toAddress, amountInLamports, apiKey } = req.body;

    if (apiKey !== AURORA_VERTEX_API_KEY) {
      return res.status(401).json({
        error: "Invalid API key",
        status: 401,
      });
    }

    if (!botId || !toAddress || !amountInLamports) {
      return res.status(400).json({
        error: "Missing required parameters",
        status: 400,
      });
    }

    try {
      const {
        publicKey,
        keypair: fromKeypair,
      } = await getKeysFromDb(botId);

      const fromPubkey = new PublicKey(publicKey);
      const toPubkey = new PublicKey(toAddress);

      const instructions: TransactionInstruction[] = [
        SystemProgram.transfer({
          fromPubkey: fromPubkey,
          toPubkey: toPubkey,
          lamports: amountInLamports
        }),
      ];

      const transactionSignature = await helius.rpc
        .sendSmartTransaction(instructions, [
          fromKeypair,
        ]);

      res.status(200).json({
        success: true,
        transactionSignature: transactionSignature,
      });
    } catch (error) {
      console.error('Error transferring SOL:', error);

      res.status(500).json({
        success: false,
        error: error,
      });
    }
  });
}

