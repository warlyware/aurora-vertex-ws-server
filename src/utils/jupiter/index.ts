import axios from "axios";
import { getJupiterPriceUrl, getQuoteFromJupiterUrl } from "../urls";

export const getPriceFromJupiter = async ({ address }: { address: string }) => {
  const url = getQuoteFromJupiterUrl({
    inputMint: "USDC",
    outputMint: address,
    amount: 1,
  });

  console.log({ url });

  const { data } = await axios.get(url);

  console.log({ data });

  return data;
};
