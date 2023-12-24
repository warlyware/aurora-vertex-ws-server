import { createJupiterApiClient } from "@jup-ag/api";
import { getBrowserLikeHeaders } from "../urls";

export const getQuoteFromJupiter = async ({
  inputMint,
  outputMint,
  amount,
}: {
  inputMint: string;
  outputMint: string;
  amount: number;
}) => {
  if (!inputMint || !outputMint || !amount) {
    throw new Error("Missing inputMint, outputMint, or amount");
  }

  //quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000&slippageBps=1

  const url = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=1`;

  const quote = await fetch(url, {
    headers: getBrowserLikeHeaders(),
  });

  console.log({ url });

  const quoteJson = await quote.json();

  console.log({ quoteJson });

  // const jupiterQuoteApi = createJupiterApiClient();
  // const quote = await jupiterQuoteApi.quoteGet({
  //   inputMint,
  //   outputMint,
  //   amount,
  // });

  return quoteJson;
};
