import { gql } from "graphql-tag";

export const UPDATE_BOT_SETTINGS = gql`
  mutation UPDATE_BOT_SETTINGS($botId: uuid!, $botSettings: bots_set_input!) {
    update_bots_by_pk(pk_columns: {id: $botId}, _set: $botSettings) {
      id
      createdAt
      updatedAt
      buyRatio
      priorityFeeInLamports
      ejectWallet {
        address
      }
      botWallet {
        wallet {
          address
        }
      }
    }
  }
`;
