import { SOL_TOKEN_ADDRESS } from "../../constants";
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

export const getPricesFromRaydiumUrl = ({}) => {
  return `https://api.raydium.io/v2/main/price`;
};

export const getAmmPoolsFromRaydiumUrl = ({}) => {
  return `https://api.raydium.io/v2/ammV3/ammPools`;
};

export const getRugCheckInfoUrl = (address: string) => {
  return `https://rugcheck.xyz/tokens/${address}`;
};

export const getPriceInfoFromCoinGeckoUrl = (address: string) => {
  return `https://api.coingecko.com/api/v3/coins/solana/market_chart?vs_currency=usd&days=1`;
};

// export const getGeckoPriceUrl = ({ addresses }: { addresses: string[] }) => {
//   const addressesString = addresses.join(",");
//   return `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${addressesString}&vs_currencies=usd`;
// };

export const getTokenRatingFromDexScreenerUrl = (address: string) => {
  return `https://cfw.dexscreener.com/sc/dex:solana:${address}`;
};

export const getQuoteFromJupiterUrl = ({
  inputMint = SOL_TOKEN_ADDRESS,
  outputMint,
  amount,
}: {
  inputMint: string;
  outputMint: string;
  amount: string | number;
}) => {
  if (!inputMint || !outputMint || !amount) {
    throw new Error("Missing inputMint, outputMint, or amount");
  }
  if (typeof amount === "number") {
    amount = amount.toString();
  }
  return `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=1`;
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

export const getPriceInfoFromDexscreenerUrl = (address: string) => {
  return `https://api.dexscreener.com/latest/dex/tokens/${address}`;
};
