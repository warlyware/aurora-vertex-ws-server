export const getGqlClient = async () => {
  const { GraphQLClient } = await import("graphql-request");
  const endpoint = process.env.GRAPHQL_API_ENDPOINT!;

  return new GraphQLClient(
    endpoint,
    {
      headers: {
        "x-hasura-admin-secret": process.env.HASURA_GRAPHQL_ADMIN_SECRET!,
      },
    }
  );
};
