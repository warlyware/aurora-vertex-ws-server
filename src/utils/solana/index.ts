import { PublicKey } from "@solana/web3.js";
import base58 from "bs58";

export const isValidPublicKey = (address: string) => {
  try {
    new PublicKey(address);
    return true;
  } catch (e) {
    return false;
  }
}

export const getStringFromByteArrayString = (byteArrayString: string) => {
  if (!byteArrayString?.length) return "";

  const byteValues = byteArrayString.split(",").map(Number);
  const buffer = Buffer.from(byteValues);
  const base58Signature = base58.encode(buffer);

  console.log(base58Signature);

  return base58Signature;
};
