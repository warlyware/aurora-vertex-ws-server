import { Day, Month, Year } from "../../constants/datetime";

export const getBrowserLikeHeaders = () => {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.5",
  };
};

export const getLiquidityPoolsFromRaydiumUrl = ({
  year,
  month,
  day,
}: {
  year: Year;
  month: Month;
  day: Day;
}) => {
  return `https://api.raydium.io/v2/sdk/liquidity/date/${year}-${month}-${day}`;
};

export const getRugCheckInfoUrl = (address: string) => {
  return `https://rugcheck.xyz/tokens/${address}`;
};

export const getGeckoPriceUrl = ({ addresses }: { addresses: string[] }) => {
  const addressesString = addresses.join(",");
  return `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${addressesString}&vs_currencies=usd`;
};

export const getTokenRatingFromDexScreenerUrl = (address: string) => {
  return `https://cfw.dexscreener.com/sc/dex:solana:${address}`;
};

export const getJupiterPriceUrl = ({
  addresses,
  vsTokenAddress,
}: {
  addresses: string[];
  vsTokenAddress: string;
}) => {
  const addressesString = addresses.join(",");
  return `https://price.jup.ag/v4/price?ids=${addressesString}&vsToken=${vsTokenAddress}`;
};
