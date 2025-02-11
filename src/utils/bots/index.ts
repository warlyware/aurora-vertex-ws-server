import { Bot } from "../../bots/manager";
import { getGqlClient } from "../../graphql/client";
import { ADD_WALLET } from "../../graphql/mutations/add-wallet";
import { UPDATE_BOT_SETTINGS } from "../../graphql/mutations/update-bot-settings";
import { GET_BOT_BY_ID } from "../../graphql/queries/get-bot-by-id";
import { GET_BOTS_BY_USER_ID } from "../../graphql/queries/get-bots-by-user-id";
import { GET_WALLET_BY_ADDRESS } from "../../graphql/queries/get-wallet-by-address";
import { isValidPublicKey } from "../solana";
import { Response } from "express";
type BotSettings = {
  priorityFeeInLamports?: number;
  buyRatio?: number;
  ejectWalletAddress?: string;
  ejectWalletId?: string;
}


export const addWallet = async (botId: string, address: string) => {
  const client = await getGqlClient();

  const { wallets }: {
    wallets: {
      address: string;
      id: string;
    }[];
  } = await client.request({
    document: GET_WALLET_BY_ADDRESS,
    variables: {
      address,
    },
  });

  let walletId: string;

  if (wallets?.length > 0) {
    console.log("Wallet already exists, using existing wallet");

    walletId = wallets[0].id;
  } else {
    const {
      insert_wallets_one,
    }: {
      insert_wallets_one: {
        address: string;
        id: string;
      };
    } = await client.request({
      document: ADD_WALLET,
      variables: {
        address,
      },
    });

    walletId = insert_wallets_one.id;
  }

  return walletId;
}

export const updateBotSettings = async (botId: string, botSettings: BotSettings, res?: Response) => {
  const client = await getGqlClient();

  console.log({ botSettings });

  if (botSettings.ejectWalletAddress) {
    const walletId = await addWallet(botId, botSettings.ejectWalletAddress);

    if (!isValidPublicKey(botSettings.ejectWalletAddress)) {
      if (res) {
        res.status(400).json({
          error: "Invalid eject wallet address",
        });
      }
      return;
    }

    botSettings.ejectWalletId = walletId;
    delete botSettings.ejectWalletAddress;
  }

  const { update_bots_by_pk }: {
    update_bots_by_pk: {
      id: string;
      createdAt: string;
      updatedAt: string;
      buyRatio: number;
      ejectWallet: {
        address: string;
      }
      botWallet: {
        wallet: {
          address: string;
        }
      }
    }[]
  } =
    await client.request({
      document: UPDATE_BOT_SETTINGS,
      variables: {
        botId,
        botSettings,
      },
    });

  if (res) {
    res.status(200).json({
      updatedBotSettings: update_bots_by_pk,
    });
  }

  return update_bots_by_pk;
}

export const getBotsByUserId = async (userId: string) => {
  const client = await getGqlClient();

  const { bots }: { bots: Bot[] } = await client.request({
    document: GET_BOTS_BY_USER_ID,
    variables: {
      userId,
    },
  });

  return bots;
}

export const getBotById = async (botId: string) => {
  const client = await getGqlClient();

  const { bots_by_pk }: { bots_by_pk: Bot } = await client.request({
    document: GET_BOT_BY_ID,
    variables: {
      botId,
    },
  });

  return bots_by_pk;
}
