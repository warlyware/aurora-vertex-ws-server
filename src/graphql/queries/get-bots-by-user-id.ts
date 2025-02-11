import { gql } from "graphql-tag";

export const GET_BOTS_BY_USER_ID = gql`
query GET_BOTS_BY_USER_ID($userId: uuid) {
  bots(where: {ownerId: {_eq: $userId}}) {
    id
    name
    createdAt
    updatedAt
    buyRatio
    priorityFeeInLamports
    ejectWallet {
      id  
      address
    }
    botWallet {
      wallet {
        keypair {
          publicKey
        }
      }
    }
    user {
      id
    }
  }
}`;
