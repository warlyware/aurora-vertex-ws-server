import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { helius } from "../wallets";

export const sendSplTokens = async (
  from: Keypair,
  to: PublicKey,
  mint: PublicKey,
  baseAmount: number | string
) => {
  const { getOrCreateAssociatedTokenAccount, createTransferInstruction } = await import("@solana/spl-token");

  if (!process.env.RPC_ENDPOINT) {
    throw new Error("RPC_ENDPOINT is not set");
  }

  const amountNumber = typeof baseAmount === "string" ? Number(baseAmount) : baseAmount;

  const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
    helius.connection,
    from,
    mint,
    from.publicKey
  );

  const toTokenAccount = await getOrCreateAssociatedTokenAccount(
    helius.connection,
    from,
    mint,
    to
  );

  const instructions: TransactionInstruction[] = [
    createTransferInstruction(
      fromTokenAccount.address,
      toTokenAccount.address,
      from.publicKey,
      amountNumber
    )
  ];

  const sig = await helius.rpc
    .sendSmartTransaction(instructions, [from]);

  return sig;
}