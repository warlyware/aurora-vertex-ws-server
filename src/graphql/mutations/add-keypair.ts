import { gql } from "graphql-tag";

export const ADD_KEYPAIR = gql`
  mutation ADD_KEYPAIR($keypair: keypairs_insert_input = {}) {
    insert_keypairs_one(object: $keypair) {
      id
      publicKey
      privateKey
    }
  }
`;
