
import { HELIUS_API_KEY } from "../../constants";
import { Helius } from "helius-sdk";
import { getGqlClient } from "../../graphql/client";
import { GET_KEYPAIR_BY_BOT_ID } from "../../graphql/queries/get-keypair-by-bot-id";
import { Keypair } from "@solana/web3.js";

export const helius = new Helius(HELIUS_API_KEY);

export async function fetchTokenAccountsDas(address: string) {
  try {
    const res = await helius.rpc.getTokenAccounts({
      owner: address,
    });

    const tokens = res?.token_accounts?.map((token) => ({
      address: token.address,
      mint: token.mint,
      owner: token.owner,
      amount: token.amount,
      delegated_amount: token.delegated_amount,
      frozen: token.frozen,
    }));

    return tokens;
  } catch (error) {
    console.error('Error fetching asset information:', error);
  }
}

export const getKeypairFromSecretKey = (secretKey: string) => {
  const byteValues = secretKey.split(",").map(Number);
  const secretKeyU8Array = Uint8Array.from(byteValues);
  return Keypair.fromSecretKey(secretKeyU8Array);
}

export const getKeysFromDb = async (botId: string) => {
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

  if (!keypair) {
    throw new Error("Keypair not found");
  }

  return {
    secretKey: keypair.privateKey,
    publicKey: keypair.publicKey,
    keypair: getKeypairFromSecretKey(keypair.privateKey),
  };
}