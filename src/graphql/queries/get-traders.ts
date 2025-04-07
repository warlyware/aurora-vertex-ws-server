import { gql } from "graphql-tag";

export const GET_TRADERS = gql`
  query GET_TRADERS {
    traders {
      id
      name
      createdAt
      wallet { 
        id
        address
      }
    }
  }
`;