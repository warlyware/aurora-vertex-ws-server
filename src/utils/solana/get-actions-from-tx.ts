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
  type: 'PUMPFUN_BUY' | 'PUMPFUN_SELL' | 'RAYDIUM_BUY' | 'RAYDIUM_SELL' | 'TOKEN_TRANSFER' | 'SOL_TRANSFER';
  source: string;
  destination?: string;
  solAmount?: number;    // For SOL transfers and swaps
  tokenAmount?: number;  // For token transfers and swaps
  tokenMint?: string;
  description: string;
  rawInfo?: any;
  solChange?: number;
}

export const getActionsFromTx = (event: SolanaTxNotificationFromHeliusEvent): TxAction[] => {
  const actions: TxAction[] = [];
  const result = event.payload?.params?.result;

  if (!result?.transaction?.transaction?.message?.instructions) return actions;

  const mainInstructions = result.transaction.transaction.message.instructions;
  const innerInstructions = result.transaction.meta?.innerInstructions || [];
  const accountKeys = result.transaction.transaction.message.accountKeys;
  const logs = result.transaction.meta?.logMessages || [];

  // Find any instruction set (main or inner) that contains a Raydium swap
  const findRaydiumIx = (instructions: any[]) =>
    instructions.find(ix => ix.programId === RAYDIUM_V4_SWAP_PROGRAM_ID);

  // Look in main instructions
  const mainRaydiumIx = findRaydiumIx(mainInstructions);

  // Look in inner instructions
  const innerRaydiumSet = innerInstructions.find(ixSet =>
    findRaydiumIx(ixSet.instructions)
  );

  if (mainRaydiumIx || innerRaydiumSet) {
    console.log('Found Raydium instruction');
    const trader = accountKeys[0].pubkey;
    const preBalance = result.transaction.meta?.preBalances[0] || 0;
    const postBalance = result.transaction.meta?.postBalances[0] || 0;
    const solChange = (postBalance - preBalance) / LAMPORTS_PER_SOL;

    // Find token transfer in inner instructions
    const tokenTransfers = innerInstructions
      .flatMap(ixSet => ixSet.instructions)
      .filter(ix =>
        ix.programId === TOKEN_PROGRAM_ID &&
        ix.parsed?.type === 'transfer'
      );

    // Get token balances for the trader
    const preTokenBalances = result.transaction.meta?.preTokenBalances || [];
    const postTokenBalances = result.transaction.meta?.postTokenBalances || [];
    const tokenBalanceChanges = postTokenBalances.map(post => {
      const pre = preTokenBalances.find(pre => pre.mint === post.mint);
      return {
        mint: post.mint,
        change: post.uiTokenAmount.uiAmount - (pre?.uiTokenAmount.uiAmount || 0)
      };
    }).filter(change => change.change !== 0);

    const boughtToken = tokenBalanceChanges.find(change => change.change > 0);
    const soldToken = tokenBalanceChanges.find(change => change.change < 0);

    // If we're buying a token with SOL
    if (Math.abs(solChange) > 0 && boughtToken) {
      actions.push({
        type: 'RAYDIUM_BUY',
        source: trader,
        solChange,
        tokenAmount: Math.abs(boughtToken.change),
        tokenMint: boughtToken.mint,
        description: `${getAbbreviatedAddress(trader)} bought ${Math.abs(boughtToken.change)} ${getAbbreviatedAddress(boughtToken.mint)} for ${Math.abs(solChange)} SOL`,
        rawInfo: { tokenTransfers, tokenBalanceChanges }
      });
    }
    // If we're selling a token for SOL
    else if (Math.abs(solChange) > 0 && soldToken) {
      actions.push({
        type: 'RAYDIUM_SELL',
        source: trader,
        solChange,
        tokenAmount: Math.abs(soldToken.change),
        tokenMint: soldToken.mint,
        description: `${getAbbreviatedAddress(trader)} sold ${Math.abs(soldToken.change)} ${getAbbreviatedAddress(soldToken.mint)} for ${Math.abs(solChange)} SOL`,
        rawInfo: { tokenTransfers, tokenBalanceChanges }
      });
    }
  }

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
    console.log('Found PumpFun instruction');
    const isSell = logs.some(log => log.includes('Instruction: Sell'));
    const isBuy = logs.some(log => log.includes('Instruction: Buy'));

    if (isSell || isBuy) {
      console.log(`PumpFun action type: ${isBuy ? 'PUMPFUN_BUY' : 'PUMPFUN_SELL'}`);
      const trader = accountKeys[0].pubkey;
      const preBalance = result.transaction.meta?.preBalances[0] || 0;
      const postBalance = result.transaction.meta?.postBalances[0] || 0;
      const solChange = (postBalance - preBalance) / LAMPORTS_PER_SOL;

      // Find token transfer in inner instructions
      const tokenTransfer = innerPumpfunSet?.instructions.find(ix =>
        ix.programId === TOKEN_PROGRAM_ID &&
        ix.parsed?.type === 'transfer'
      );

      const tokenAmount = Number(tokenTransfer?.parsed?.info?.amount);
      const tokenMint = result.transaction.meta?.preTokenBalances?.[0]?.mint;

      actions.push({
        type: isBuy ? 'PUMPFUN_BUY' : 'PUMPFUN_SELL',
        source: trader,
        destination: trader,
        solAmount: Math.abs(solChange),
        solChange,
        tokenAmount,
        tokenMint,
        description: isBuy
          ? `${getAbbreviatedAddress(trader)} bought ${tokenAmount} ${getAbbreviatedAddress(tokenMint)} for ${Math.abs(solChange)} SOL`
          : `${getAbbreviatedAddress(trader)} sold ${tokenAmount} ${getAbbreviatedAddress(tokenMint)} for ${Math.abs(solChange)} SOL`,
        rawInfo: { tokenTransfer, balanceChange: solChange }
      });
    }
  }

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

  // Add debug log for final actions
  console.log('Final actions:', actions.map(a => a.type));

  return actions;
};