import { gql } from "graphql-tag";

export const GET_KEYPAIR_BY_BOT_ID = gql`
  query GET_KEYPAIR_BY_BOT_ID($botId: uuid!) {
    bots(where: { id: { _eq: $botId } }) {
      id
      ownerId
      botWallet {
        wallet {
          keypair {
            privateKey
            publicKey
          }
        }
      }
    }
  }
`;
