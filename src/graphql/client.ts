export const getGqlClient = async () => {
  const { GraphQLClient } = await import("graphql-request");

  return new GraphQLClient(
    process.env.GRAPHQL_API_ENDPOINT!,
    {
      headers: {
        "x-hasura-admin-secret": process.env.HASURA_GRAPHQL_ADMIN_SECRET!,
      },
    }
  );
};
