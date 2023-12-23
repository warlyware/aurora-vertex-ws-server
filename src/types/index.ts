export type GetTokenListFromBirdEyeInput = {
  sortBy?: "v24hUSD" | "mc" | "v24hChangePercent";
  sortType?: "asc" | "desc";
  offset?: number;
  limit?: number;
};

export type BirdEyeToken = {
  address: string;
  decimals: number;
  lastTradeUnixTime: number;
  liquidity: number;
  logoURI: string;
  mc: number;
  name: string;
  symbol: string;
  v24hChangePercent: number;
  v24hUSD: number;
};

export type GetTokenListFromBirdEyeResponse = {
  status: number;
  updateUnixTime: number;
  updateTime: string;
  total: number;
  coins: BirdEyeToken[];
};

export type BirdEyeTokenListResponse = {
  updateUnixTime: number;
  updateTime: string;
  tokens: BirdEyeToken[];
  total: number;
};

type DexscreenerCoinGeckoCoinInfo = {
  id: string;
  url: string;
  description: string;
  maxSupply: number;
  totalSupply: number;
  circulatingSupply: number;
  websites: [{ label: string; url: string }];
  social: [{ type: string; url: string }, { type: string; url: string }];
  imageUrl: string;
  categories: string[];
};

export type DexscreenerCoinInfo = {
  id: string;
  chain: { id: string };
  address: string;
  name: string;
  symbol: string;
  description: string;
  websites: string[];
  socials: { type: string; url: string }[];
  lockedAddresses: string[];
  supplies: {
    totalSupply: number;
    burnedSupply: number;
    lockedSupply: number;
    circulatingSupply: number;
    updatedAt: string;
  };
  createdAt: string;
  updatedAt: string;
  image: string;
};

export type DexscreenerCoinInfoResponse = {
  schemaVersion: string;
  cg?: DexscreenerCoinGeckoCoinInfo;
  gp?: unknown;
  ts?: unknown;
  cmc?: unknown;
  ti?: DexscreenerCoinInfo;
  ds?: DexscreenerCoinInfo;
  isBoostable: boolean;
};

export type GetTokenInfoFromDexscreenerResponse = {
  socials: { type: string; url: string }[];
  description: string;
  name: string;
  symbol: string;
  image: string;
  website: {
    url: string;
    label: string;
  };
  lockedAddresses: string[];
  totalSupply: number | undefined;
  burnedSupply: number | undefined;
  lockedSupply: number | undefined;
  circulatingSupply: number | undefined;
};
