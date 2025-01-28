
import { HELIUS_API_KEY } from "../../constants";
import { Helius } from "helius-sdk";

const helius = new Helius(HELIUS_API_KEY);

console.log('HELIUS_API_KEY:', HELIUS_API_KEY);

async function fetchAssetByMint(mintAddress: string) {
  try {
    const asset = await helius.rpc.getAsset({
      id: mintAddress,
    });
    return asset;
  } catch (error) {
    console.error('Error fetching asset information:', error);
  }
}

export const getCoinInfo = async (mintAddress: string) => {
  // const testCoin = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'; // $BONK

  const asset = await fetchAssetByMint(mintAddress);
  return asset;
}