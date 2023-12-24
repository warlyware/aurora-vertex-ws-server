import {
  DexscreenerCoinInfoResponse,
  GetTokenInfoFromDexscreenerResponse,
} from "../../types";
import { getBrowserLikeHeaders } from "../urls";

export const getTokenInfoFromDexscreener = async ({
  address,
}: {
  address: string;
}): Promise<GetTokenInfoFromDexscreenerResponse> => {
  if (!address) {
    throw new Error("No address provided");
  }

  const url = `https://io.dexscreener.com/dex/pair-details/v2/solana/${address}`;

  const res = await fetch(url, {
    headers: getBrowserLikeHeaders(),
  });

  let data: DexscreenerCoinInfoResponse;

  try {
    data = await res.json();
    console.log({ data });

    const { ds, cg, ti } = data;

    const socials = ds?.socials || cg?.social || ti?.socials || [];
    const description =
      ds?.description || cg?.description || ti?.description || "";
    const name = ds?.name || ti?.name || "";
    const symbol = ds?.symbol || ti?.symbol || "";
    const image = ds?.image || cg?.imageUrl || ti?.image || "";
    const website = ds?.websites?.[0]
      ? { url: ds.websites[0], label: "Default Label" }
      : cg?.websites?.[0]
      ? {
          url: cg.websites[0].url,
          label: cg.websites[0].label || "Default Label",
        }
      : ti?.websites?.[0]
      ? { url: ti.websites[0], label: "Default Label" }
      : { url: "", label: "" }; // Default to an empty object
    const lockedAddresses = ds?.lockedAddresses || ti?.lockedAddresses || [];
    const totalSupply =
      ds?.supplies.totalSupply ||
      cg?.totalSupply ||
      ti?.supplies.totalSupply ||
      undefined;
    const burnedSupply =
      ds?.supplies.burnedSupply || ti?.supplies.burnedSupply || undefined;
    const lockedSupply =
      ds?.supplies.lockedSupply || ti?.supplies.lockedSupply || undefined;
    const circulatingSupply =
      ds?.supplies.circulatingSupply ||
      ti?.supplies.circulatingSupply ||
      undefined;

    return {
      socials,
      description,
      name,
      symbol,
      image,
      website,
      lockedAddresses,
      totalSupply,
      burnedSupply,
      lockedSupply,
      circulatingSupply,
    };
  } catch (error) {
    throw new Error("Error fetching data from Dexscreener");
  }
};
