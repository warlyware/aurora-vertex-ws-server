import { PublicKey } from "@solana/web3.js";

export const isValidPublicKey = (address: string) => {
  try {
    new PublicKey(address);
    return true;
  } catch (e) {
    return false;
  }
}