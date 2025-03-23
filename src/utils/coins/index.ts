import { helius } from "../wallets";

// Utility function to add delay between requests
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Keep track of last request time
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 100;

async function fetchAssetByMint(mintAddress: string) {
  try {
    // Calculate time since last request
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;

    // If we need to wait, add delay
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await delay(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
    }

    // Update last request time
    lastRequestTime = Date.now();

    console.log({ helius });
    const asset = await helius.rpc.getAsset({
      id: mintAddress,
    });
    return asset;
  } catch (error: any) {
    if (error.response?.status === 429) {
      console.error('Rate limit exceeded, retrying after longer delay...');
      await delay(2000); // Wait 2 seconds on rate limit
      return fetchAssetByMint(mintAddress); // Retry the request
    }
    console.error('Error fetching asset information:', error);
  }
}

export const getCoinInfo = async (mintAddress: string) => {
  // const testCoin = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'; // $BONK

  const asset = await fetchAssetByMint(mintAddress);
  return asset;
}