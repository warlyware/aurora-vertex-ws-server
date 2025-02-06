import { Keypair, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { helius } from "../../utils/wallets";
import { Router, Request, Response } from "express";
import { AURORA_VERTEX_API_KEY } from "../../constants";
import { GET_KEYPAIR_BY_BOT_ID } from "../../graphql/queries/get-keypair-by-bot-id";
import { getGqlClient } from "../../graphql/client";
import { getStringFromByteArrayString } from "../../utils/solana";

export const getKeypairFromDb = async (botId: string) => {
  const client = await getGqlClient();

  const { bots }: {
    bots: {
      id: string;
      botWallet: {
        wallet: {
          keypair: {
            privateKey: string;
            publicKey: string;
          }
        }
      }
    }[]
  } =
    await client.request({
      document: GET_KEYPAIR_BY_BOT_ID,
      variables: {
        botId,
      },
    });

  const keypair = bots[0]?.botWallet?.wallet?.keypair;

  console.log({ keypair });

  if (!keypair) {
    throw new Error("Keypair not found");
  }

  return keypair;
}

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
        privateKey,
        publicKey,
      } = await getKeypairFromDb(botId);
      console.log({ privateKey });

      const byteValues = privateKey.split(",").map(Number);
      const secretKey = Uint8Array.from(byteValues);
      const fromKeypair = Keypair.fromSecretKey(secretKey);
      const fromPubkey = new PublicKey(publicKey);
      const toPubkey = new PublicKey(toAddress);

      const instructions: TransactionInstruction[] = [
        SystemProgram.transfer({
          fromPubkey: fromPubkey,
          toPubkey: toPubkey,
          lamports: amountInLamports
        }),
      ];

      console.log('instructions formed');

      const transactionSignature = await helius.rpc.sendSmartTransaction(instructions, [
        fromKeypair,
      ]);
      console.log(`Successful transfer: ${transactionSignature}`);

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

