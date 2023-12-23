import { createJupiterApiClient } from "@jup-ag/api";

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

  const jupiterQuoteApi = createJupiterApiClient();
  const quote = await jupiterQuoteApi.quoteGet({
    inputMint,
    outputMint,
    amount,
  });

  return quote;
};
