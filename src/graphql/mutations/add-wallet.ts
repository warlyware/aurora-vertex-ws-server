import { gql } from "graphql-tag";

export const ADD_WALLET = gql`
  mutation ADD_WALLET($address: String!, $keypairId: uuid, $userId: uuid) {
    insert_wallets_one(
      object: { address: $address, keypairId: $keypairId, userId: $userId }
    ) {
      id
      address
      isActiveWallet
    }
  }
`;
