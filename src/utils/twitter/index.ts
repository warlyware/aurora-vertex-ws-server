import { Client } from "twitter-api-sdk";

export async function getTweets() {
  if (!process.env.TWITTER_API_BEARER_TOKEN) {
    throw new Error("TWITTER_API_BEARER_TOKEN is not set");
  }

  const client = new Client(process.env.TWITTER_API_BEARER_TOKEN);

  const tweets = client.tweets.tweetsRecentSearch({
    query: "(from:solsniperr OR from:SolanaSensei) -is:retweet",
    expansions: ["author_id"],
    "user.fields": ["created_at", "public_metrics", "url"],
  });

  for await (const tweet of tweets) {
    console.log(tweet);
  }
}
