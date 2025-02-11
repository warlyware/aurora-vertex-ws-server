import { Keypair, PublicKey } from "@solana/web3.js";
import base58 from "bs58";
import { DEFAULT_DECIMALS, PumpFunSDK } from "pumpdotfun-sdk";
import { Connection } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { getKeysFromDb } from "../wallets";
import { Transaction, VersionedTransaction } from '@solana/web3.js';
import { sha256 } from "js-sha256";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

let pumpFunSdk: PumpFunSDK;

export class AnchorWallet implements Wallet {
  constructor(private nodeWallet: NodeWallet) { }

  get payer() {
    return this.nodeWallet.payer;
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof Transaction) {
      return this.nodeWallet.signTransaction(tx) as Promise<T>;
    }
    throw new Error('VersionedTransaction not supported');
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    return Promise.all(txs.map(tx => this.signTransaction(tx)));
  }

  get publicKey() {
    return this.nodeWallet.publicKey;
  }
}

export const getPumpFunSdk = async (botId: string) => {
  if (pumpFunSdk) return pumpFunSdk;

  if (!process.env.HELIUS_API_KEY_2) {
    throw new Error("HELIUS_API_KEY_2 is not set");
  }
  const { keypair: fromKeypair } = await getKeysFromDb(botId);
  const nodeWallet = new NodeWallet(fromKeypair);
  const wallet = new AnchorWallet(nodeWallet);
  const provider = new AnchorProvider(
    new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY_2}`),
    wallet,
    { commitment: "confirmed" }
  );

  pumpFunSdk = new PumpFunSDK(provider);
  return pumpFunSdk;
}


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

export const getSPLBalance = async (
  connection: Connection,
  mintAddress: PublicKey,
  pubKey: PublicKey,
  allowOffCurve: boolean = false
) => {
  const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");

  let returnValue = {
    amount: null,
    baseAmount: null
  } as {
    amount: number | null,
    baseAmount: string | null
  };

  try {
    let ata = getAssociatedTokenAddressSync(mintAddress, pubKey, allowOffCurve);
    const balance = await connection.getTokenAccountBalance(ata, "processed");
    returnValue = {
      amount: balance.value.uiAmount,
      baseAmount: balance.value.amount
    }
  } catch (e) { }
  return returnValue;
};

export const printSPLBalance = async (
  connection: Connection,
  mintAddress: PublicKey,
  user: PublicKey,
  info: string = ""
) => {
  const balance = await getSPLBalance(connection, mintAddress, user);
  if (balance?.amount === null) {
    console.log(
      `${info ? info + " " : ""}${user.toBase58()}:`,
      "No Account Found"
    );
  } else {
    console.log(`${info ? info + " " : ""}${user.toBase58()}:`, balance?.amount);
  }
};

export const baseToValue = (base: number, decimals: number): number => {
  return base * Math.pow(10, decimals);
};

export const valueToBase = (value: number, decimals: number): number => {
  return value / Math.pow(10, decimals);
};

//i.e. account:BondingCurve
export function getDiscriminator(name: string) {
  return sha256.digest(name).slice(0, 8);
}

export const getPriorityFeeEstimate = async (transaction: Transaction) => {
  if (!process.env.RPC_ENDPOINT) {
    throw new Error("RPC_ENDPOINT is not set");
  }

  const response = await fetch(process.env.RPC_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "1",
      method: "getPriorityFeeEstimate",
      params: [
        {
          transaction: bs58.encode(transaction.serialize()), // Pass the serialized transaction in Base58
          options: { includeAllPriorityFeeLevels: true },
        },
      ],
    }),
  });
  const data = await response.json();
  console.log(
    "Fee in function for",
    data.result
  );
  return data.result;
}

export const getAbbreviatedAddress = (
  address?: string | PublicKeyCredential | null,
  identifierLength: number = 6
) => {
  if (!address) return "";
  // check if it's a solana public key
  if (typeof address !== "string") {
    address = address.toString();
  }

  if (!address) return "";
  return `${address.slice(0, identifierLength)}...${address.slice(
    address.length - identifierLength
  )}`;
};