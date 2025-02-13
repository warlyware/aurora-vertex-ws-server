import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAbbreviatedAddress } from ".";
import { SolanaTxNotificationFromHeliusEvent } from "../../types/solana";

// Constants matching frontend
const PHOTON_PROGRAM_ID = 'BSfD6SHZigAfDWSjzD5Q41jw8LmKwtmjskPH9XW1mrRW';
const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const RAYDIUM_V4_SWAP_PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const SPL_TOKEN_TRANSFER_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const RAYDIUM_FEE_COLLECTION_ACCOUNT = 'AVUCZyuT35YSuj4RH7fwiyPu82Djn2Hfg7y2ND2XcnZH';
const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
const PUMPFUN_FEE_COLLECTION_ACCOUNT = 'CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM';
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

export type TxAction = {
  type: 'PUMPFUN_BUY' | 'PUMPFUN_SELL' | 'RAYDIUM_SWAP' | 'TOKEN_TRANSFER' | 'SOL_TRANSFER';
  source: string;
  destination?: string;
  solAmount?: number;    // For SOL transfers and swaps
  tokenAmount?: number;  // For token transfers and swaps
  tokenMint?: string;
  description: string;
  rawInfo?: any;
}

const handleRaydiumSwap = (result: any): TxAction => {
  const innerInstructions = result.transaction.meta?.innerInstructions?.map((ix: any) => ix.instructions).flat();
  const accountKeys = result.transaction.transaction.message.accountKeys;

  const txOwner = accountKeys[0]?.pubkey;
  const ownerPostTokenBalances = result.transaction.meta?.postTokenBalances.filter(
    (balance: any) => balance.owner === txOwner
  );

  const swapIxs = innerInstructions
    .filter((ix: any) => ix?.parsed?.type === 'transfer')
    .filter((ix: any) => ix?.parsed?.info?.destination !== RAYDIUM_FEE_COLLECTION_ACCOUNT);

  const getAccountDataSizeIx = innerInstructions.find((ix: any) => ix?.parsed?.type === 'getAccountDataSize');
  const createAccountIx = innerInstructions.find((ix: any) => ix?.parsed?.type === 'createAccount');

  const splMint = getAccountDataSizeIx?.parsed?.info?.mint || ownerPostTokenBalances?.[0]?.mint;
  const ata = createAccountIx?.parsed?.info?.newAccount;

  const ownerPartOfSwap = swapIxs.find((ix: any) => ix?.parsed?.info?.authority === txOwner);
  const otherPartOfSwap = swapIxs.find((ix: any) => ix?.parsed?.info?.authority !== txOwner);
  const splTokenAmount = ownerPartOfSwap?.parsed?.info?.amount;
  const lamportAmount = otherPartOfSwap?.parsed?.info?.amount / LAMPORTS_PER_SOL;

  // TODO: Fix this
  return {
    type: 'RAYDIUM_SWAP',
    source: txOwner,
    destination: txOwner,
    solAmount: lamportAmount,
    tokenAmount: splTokenAmount,
    tokenMint: splMint,
    description: `WRONG: ${getAbbreviatedAddress(txOwner)} swapped ${splTokenAmount} ${getAbbreviatedAddress(splMint)} for ${lamportAmount} SOL`,
    rawInfo: {
      ownerPostTokenBalances,
      splMint,
      splTokenAmount,
      lamportAmount,
      txOwner
    }
  };
};

export const getActionsFromTx = (event: SolanaTxNotificationFromHeliusEvent): TxAction[] => {
  const actions: TxAction[] = [];
  const result = event.payload?.params?.result;

  if (!result?.transaction?.transaction?.message?.instructions) return actions;

  const mainInstructions = result.transaction.transaction.message.instructions;
  const innerInstructions = result.transaction.meta?.innerInstructions || [];
  const accountKeys = result.transaction.transaction.message.accountKeys;
  const logs = result.transaction.meta?.logMessages || [];

  // Find any instruction set (main or inner) that contains a Pumpfun program call
  const findPumpfunIx = (instructions: any[]) =>
    instructions.find(ix => ix.programId === PUMPFUN_PROGRAM_ID);

  // Look in main instructions
  const mainPumpfunIx = findPumpfunIx(mainInstructions);

  // Look in inner instructions
  const innerPumpfunSet = innerInstructions.find(ixSet =>
    findPumpfunIx(ixSet.instructions)
  );

  if (mainPumpfunIx || innerPumpfunSet) {
    // Get all relevant instructions (main + inner) for this action
    const relevantInstructions = innerPumpfunSet?.instructions || mainInstructions;

    // Find the transfers
    const solTransfer = relevantInstructions.find(ix =>
      ix.programId === '11111111111111111111111111111111' &&
      ix.parsed?.type === 'transfer' &&
      ix.parsed.info.destination !== PUMPFUN_FEE_COLLECTION_ACCOUNT
    );

    const tokenTransfer = relevantInstructions.find(ix =>
      ix.programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' &&
      ix.parsed?.type === 'transfer'
    );

    if (solTransfer && tokenTransfer) {
      const trader = accountKeys[0].pubkey;
      const solAmount = solTransfer?.parsed?.info?.lamports / LAMPORTS_PER_SOL;
      const tokenAmount = Number(tokenTransfer?.parsed?.info?.amount);
      const tokenMint = result.transaction.meta?.postTokenBalances?.[0]?.mint;

      // Determine if it's a buy or sell based on the SOL flow
      const isBuy = solTransfer.parsed?.info?.source === trader;

      actions.push({
        type: isBuy ? 'PUMPFUN_BUY' : 'PUMPFUN_SELL',
        source: trader,
        destination: trader,
        solAmount: solAmount,
        tokenAmount: tokenAmount,
        tokenMint: tokenMint,
        description: `${getAbbreviatedAddress(trader)} ${isBuy ? 'bought' : 'sold'} ${tokenAmount} ${getAbbreviatedAddress(tokenMint)} ${isBuy ? 'for' : 'and received'} ${solAmount} SOL`,
        rawInfo: {
          solTransfer,
          tokenTransfer,
          postTokenBalances: result.transaction.meta?.postTokenBalances
        }
      });
    }
  }

  // Process token transfers
  mainInstructions.forEach(ix => {
    if (ix.programId === TOKEN_PROGRAM_ID && ix.parsed?.type === 'transfer') {
      const { source, destination, amount, authority } = ix.parsed.info;
      const tokenMint = result.transaction.meta?.preTokenBalances?.find(
        balance => balance.accountIndex === accountKeys.findIndex(key => key.pubkey === source)
      )?.mint;

      if (tokenMint) {
        const decimals = result.transaction.meta?.preTokenBalances?.[0]?.uiTokenAmount?.decimals || 6;
        const tokenAmount = Number(amount) / Math.pow(10, decimals);

        actions.push({
          type: 'TOKEN_TRANSFER',
          source: authority,
          destination: result.transaction.meta?.postTokenBalances?.find(
            balance => balance.accountIndex === accountKeys.findIndex(key => key.pubkey === destination)
          )?.owner || destination,
          tokenAmount: tokenAmount,
          tokenMint: tokenMint,
          description: `${getAbbreviatedAddress(authority)} transferred ${tokenAmount} ${getAbbreviatedAddress(tokenMint)} to ${getAbbreviatedAddress(destination)}`,
          rawInfo: {
            instruction: ix,
            tokenBalances: {
              pre: result.transaction.meta?.preTokenBalances,
              post: result.transaction.meta?.postTokenBalances
            }
          }
        });
      }
    }
    // Process SOL transfers
    else if (ix.programId === SYSTEM_PROGRAM_ID && ix.parsed?.type === 'transfer') {
      const { source, destination, lamports } = ix.parsed.info;
      const solAmount = lamports / LAMPORTS_PER_SOL;

      actions.push({
        type: 'SOL_TRANSFER',
        source,
        destination,
        solAmount,
        description: `${getAbbreviatedAddress(source)} transferred ${solAmount} SOL to ${getAbbreviatedAddress(destination)}`,
        rawInfo: {
          instruction: ix,
          balances: {
            pre: result.transaction.meta?.preBalances,
            post: result.transaction.meta?.postBalances
          }
        }
      });
    }
  });

  return actions;
};