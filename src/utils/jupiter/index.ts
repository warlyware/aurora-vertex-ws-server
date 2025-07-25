import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import fetch from "cross-fetch";
import { Wallet } from "@project-serum/anchor";
import bs58 from "bs58";
import { RPC_ENDPOINT, SOL_TOKEN_ADDRESS } from "../../constants";

type IndexedRouteMap = {
  mintKeys: string[];
  indexedRouteMap: { [key: string]: number[] };
};

type GeneratedRouteMap = { [mintAddress: string]: string[] };

export const handleSwap = async ({
  inputMint = SOL_TOKEN_ADDRESS,
  outputMint,
  amount,
  slippageBps = 50, // 0.5%
}: {
  inputMint: string;
  outputMint: string;
  amount: string | number;
  slippageBps: number;
}) => {
  if (!outputMint || !amount) {
    throw new Error("Missing required parameters");
  }

  console.log(1);

  const connection = new Connection(RPC_ENDPOINT, "confirmed");

  const wallet = new Wallet(
    Keypair.fromSecretKey(
      bs58.decode(process.env.AURORA_VERTEX_PRIVATE_KEY || "")
    )
  );

  console.log(2);

  console.log(3);

  console.log(5);

  const quoteResponse = await (
    await fetch(
      `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`
    )
  ).json();

  console.log({ quoteResponse });

  // get serialized transactions for the swap
  const { swapTransaction } = await (
    await fetch("https://quote-api.jup.ag/v6/swap", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // quoteResponse from /quote api
        quoteResponse,
        // user public key to be used for the swap
        userPublicKey: wallet.publicKey.toString(),
        // auto wrap and unwrap SOL. default is true
        wrapAndUnwrapSol: true,
        // feeAccount is optional. Use if you want to charge a fee.  feeBps must have been passed in /quote API.
        // feeAccount: "fee_account_public_key"
      }),
    })
  ).json();

  // deserialize the transaction
  const swapTransactionBuf = Buffer.from(swapTransaction, "base64");
  var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
  console.log(transaction);

  // sign the transaction
  transaction.sign([wallet.payer]);

  // Execute the transaction
  const rawTransaction = transaction.serialize();
  const txid = await connection.sendRawTransaction(rawTransaction, {
    skipPreflight: true,
    maxRetries: 2,
  });
  await connection.confirmTransaction(txid);
  console.log(`https://solscan.io/tx/${txid}`);

  return { txid };
};
