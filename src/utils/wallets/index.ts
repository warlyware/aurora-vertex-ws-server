
import { HELIUS_API_KEY } from "../../constants";
import { Helius } from "helius-sdk";

export const helius = new Helius(HELIUS_API_KEY);

export async function fetchTokenAccountsDas(address: string) {
  try {
    const res = await helius.rpc.getTokenAccounts({
      owner: address,
    });

    const tokens = res?.token_accounts?.map((token) => ({
      address: token.address,
      mint: token.mint,
      owner: token.owner,
      amount: token.amount,
      delegated_amount: token.delegated_amount,
      frozen: token.frozen,
    }));

    return tokens;
  } catch (error) {
    console.error('Error fetching asset information:', error);
  }
}