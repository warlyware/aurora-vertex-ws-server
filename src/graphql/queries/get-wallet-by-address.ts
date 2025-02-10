import { gql } from "graphql-tag";

export const GET_WALLET_BY_ADDRESS = gql`
  query GET_WALLET_BY_ADDRESS($address: String!) {
    wallets(where: {address: {_eq: $address}}) {
      id
      address
    }
  }
`;
