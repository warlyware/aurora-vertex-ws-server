import { gql } from "graphql-tag";

export const ADD_BOT = gql`
  mutation ADD_BOT($bot: bots_insert_input!) {
    insert_bots_one(object: $bot) {
      id
    }
  }
`;
