import axios from "axios";
import { getJupiterPriceUrl } from "../urls";

export const getPriceFromJupiter = async ({ address }: { address: string }) => {
  const url = getJupiterPriceUrl({
    addresses: [address],
    vsTokenAddress: "USDC",
  });

  console.log({ url });

  const { data } = await axios.get(url);

  console.log({ data });

  return data;
};
