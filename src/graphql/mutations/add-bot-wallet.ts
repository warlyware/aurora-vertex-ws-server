import { gql } from "graphql-tag";

export const ADD_BOT_WALLET = gql`
  mutation ADD_BOT_WALLET($botWallet: botWallets_insert_input!) {
    insert_botWallets_one(object: $botWallet) {
      id
    }
  }
`;
