
import { HELIUS_API_KEY } from "../../constants";
import { Helius } from "helius-sdk";
import { getGqlClient } from "../../graphql/client";
import { GET_KEYPAIR_BY_BOT_ID } from "../../graphql/queries/get-keypair-by-bot-id";
import { Keypair } from "@solana/web3.js";
import { ADD_WALLET } from "../../graphql/mutations/add-wallet";
import { ADD_KEYPAIR } from "../../graphql/mutations/add-keypair";
import { Response } from "express";

console.log({ HELIUS_API_KEY });
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

export const createWallet = async (userId: string, res?: Response) => {
  const client = await getGqlClient();


  const keypair = Keypair.generate();

  const publicKey = keypair.publicKey.toString();
  const privateKey = keypair.secretKey.toString();

  const {
    insert_keypairs_one,
  }: {
    insert_keypairs_one: {
      id: string;
      address: string;
    };
  } = await client.request({
    document: ADD_KEYPAIR,
    variables: {
      keypair: {
        privateKey,
        publicKey,
      },
    },
  });

  const keypairId = insert_keypairs_one.id;

  const {
    insert_wallets_one,
  }: {
    insert_wallets_one: {
      id: string;
      address: string;
      userId: string;
    };
  } = await client.request({
    document: ADD_WALLET,
    variables: {
      address: publicKey,
      keypairId,
      userId,
    },
  });

  if (res) {
    res.status(200).json({
      wallet: insert_wallets_one,
    });
  }

  return insert_wallets_one;
}