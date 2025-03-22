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
  type: 'PUMPFUN_BUY' | 'PUMPFUN_SELL' | 'RAYDIUM_BUY' | 'RAYDIUM_SELL' | 'TOKEN_TRANSFER' | 'SOL_TRANSFER' | 'FEE_COLLECTION';
  source: string;
  destination?: string;
  solAmount?: number;    // For SOL transfers and swaps
  tokenAmount?: number;  // For token transfers and swaps
  tokenMint?: string;
  description: string;
  rawInfo?: any;
  solChange?: number;
  destinations?: string[]; // For fee collection transactions with multiple destinations
}

interface SystemTransferInfo {
  source: string;
  destination: string;
  lamports: number;
}

interface TokenTransferInfo {
  source: string;
  destination: string;
  amount: string;
  authority: string;
}

interface ParsedInstruction {
  programId: string;
  parsed?: {
    type: string;
    info: SystemTransferInfo | TokenTransferInfo;
  };
}

interface SystemInstruction extends ParsedInstruction {
  parsed?: {
    type: 'transfer';
    info: SystemTransferInfo;
  };
}

interface TokenInstruction extends ParsedInstruction {
  parsed?: {
    type: 'transfer';
    info: TokenTransferInfo;
  };
}

function isSystemTransferInfo(info: any): info is SystemTransferInfo {
  return 'lamports' in info;
}

function isTokenTransferInfo(info: any): info is TokenTransferInfo {
  return 'amount' in info && 'authority' in info;
}

export const getActionsFromTx = (event: SolanaTxNotificationFromHeliusEvent): TxAction[] => {
  const actions: TxAction[] = [];
  const result = event.payload?.params?.result;

  if (!result?.transaction?.transaction?.message?.instructions) return actions;

  const mainInstructions = result.transaction.transaction.message.instructions as ParsedInstruction[];
  const innerInstructions = result.transaction.meta?.innerInstructions || [];
  const accountKeys = result.transaction.transaction.message.accountKeys;
  const logs = result.transaction.meta?.logMessages || [];

  // Check for fee collection pattern (multiple 1-lamport transfers)
  const systemTransfers = mainInstructions.filter((ix): ix is SystemInstruction =>
    ix.programId === SYSTEM_PROGRAM_ID &&
    ix.parsed?.type === 'transfer' &&
    ix.parsed.info &&
    isSystemTransferInfo(ix.parsed.info)
  );

  if (systemTransfers.length > 10) {
    const allOneLamport = systemTransfers.every(ix => ix.parsed!.info.lamports === 1);
    const firstSource = systemTransfers[0]?.parsed?.info.source;
    const sameSource = firstSource && systemTransfers.every(ix =>
      ix.parsed!.info.source === firstSource
    );

    if (allOneLamport && sameSource) {
      console.log('Detected fee collection transaction');
      const destinations = systemTransfers.map(ix => ix.parsed!.info.destination);

      actions.push({
        type: 'FEE_COLLECTION',
        source: firstSource,
        destinations,
        solAmount: systemTransfers.length * 0.000000001,
        description: `${getAbbreviatedAddress(firstSource)} sent 1 lamport to ${systemTransfers.length} addresses for fee collection`,
        rawInfo: { systemTransfers }
      });

      return actions;
    }
  }

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

    console.log('Debug Raydium transaction:');
    console.log('SOL change:', solChange);
    console.log('Pre token balances:', JSON.stringify(preTokenBalances, null, 2));
    console.log('Post token balances:', JSON.stringify(postTokenBalances, null, 2));

    const tokenBalanceChanges = postTokenBalances.map(post => {
      const pre = preTokenBalances.find(pre => pre.mint === post.mint);
      const change = {
        mint: post.mint,
        change: post.uiTokenAmount.uiAmount - (pre?.uiTokenAmount.uiAmount || 0),
        preAmount: pre?.uiTokenAmount.uiAmount || 0,
        postAmount: post.uiTokenAmount.uiAmount
      };
      console.log('Token balance change:', JSON.stringify(change, null, 2));
      return change;
    }).filter(change => change.change !== 0);

    // Find the most significant token changes (ignoring small fee-related changes)
    const significantChanges = tokenBalanceChanges
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 2);

    console.log('Significant changes:', JSON.stringify(significantChanges, null, 2));

    // The largest change by magnitude should be the main token being traded
    const mainTokenChange = significantChanges[0];
    // The second largest should be the other side of the trade (SOL or other token)
    const secondaryTokenChange = significantChanges[1];

    if (!mainTokenChange || !secondaryTokenChange) {
      console.log('Not enough significant token changes found');
    } else {
      console.log('Full transaction analysis:', {
        solChange,
        mainTokenChange,
        secondaryTokenChange,
        allTokenChanges: tokenBalanceChanges,
        trader,
        preBalance,
        postBalance
      });

      // Find all token accounts owned by the trader
      const userPreTokenAccounts = preTokenBalances.filter(balance => balance.owner === trader);
      const userPostTokenAccounts = postTokenBalances.filter(balance => balance.owner === trader);

      // Calculate changes for each of the user's token accounts
      const userTokenChanges = userPreTokenAccounts.map(preAccount => {
        const postAccount = userPostTokenAccounts.find(post => post.mint === preAccount.mint);
        return {
          mint: preAccount.mint,
          preAmount: preAccount.uiTokenAmount.uiAmount,
          postAmount: postAccount?.uiTokenAmount.uiAmount || 0,
          change: (postAccount?.uiTokenAmount.uiAmount || 0) - preAccount.uiTokenAmount.uiAmount
        };
      });

      // Also check for any new token accounts that didn't exist before
      const newTokenAccounts = userPostTokenAccounts.filter(post =>
        !userPreTokenAccounts.some(pre => pre.mint === post.mint)
      ).map(post => ({
        mint: post.mint,
        preAmount: 0,
        postAmount: post.uiTokenAmount.uiAmount,
        change: post.uiTokenAmount.uiAmount
      }));

      const allUserChanges = [...userTokenChanges, ...newTokenAccounts];

      // Find the most significant change in the user's token accounts
      const mainUserChange = allUserChanges.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];

      console.log('User token changes:', {
        allChanges: allUserChanges,
        mainChange: mainUserChange
      });

      // For a buy: user's token balance for the traded token increases
      // For a sell: user's token balance for the traded token decreases
      const isBuy = mainUserChange && mainUserChange.change > 0;

      console.log('Trade detection:', {
        solChange,
        mainUserChange,
        isBuy,
        reasoning: `User's main token change is ${mainUserChange?.change} (${isBuy ? 'positive = buy' : 'negative = sell'})`
      });

      if (isBuy) {
        console.log('Detected Raydium buy - user token balance increased');
        actions.push({
          type: 'RAYDIUM_BUY',
          source: trader,
          solChange,
          tokenAmount: Math.abs(mainUserChange.change),
          tokenMint: mainUserChange.mint,
          description: `${getAbbreviatedAddress(trader)} bought ${Math.abs(mainUserChange.change)} ${getAbbreviatedAddress(mainUserChange.mint)} for ${Math.abs(solChange)} SOL`,
          rawInfo: { tokenTransfers, tokenBalanceChanges }
        });
      } else {
        console.log('Detected Raydium sell - user token balance decreased');
        actions.push({
          type: 'RAYDIUM_SELL',
          source: trader,
          solChange,
          tokenAmount: Math.abs(mainUserChange.change),
          tokenMint: mainUserChange.mint,
          description: `${getAbbreviatedAddress(trader)} sold ${Math.abs(mainUserChange.change)} ${getAbbreviatedAddress(mainUserChange.mint)} for ${Math.abs(solChange)} SOL`,
          rawInfo: { tokenTransfers, tokenBalanceChanges }
        });
      }
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
    if (ix.programId === TOKEN_PROGRAM_ID &&
      ix.parsed?.type === 'transfer' &&
      ix.parsed.info &&
      isTokenTransferInfo(ix.parsed.info)) {
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
    else if (ix.programId === SYSTEM_PROGRAM_ID &&
      ix.parsed?.type === 'transfer' &&
      ix.parsed.info &&
      isSystemTransferInfo(ix.parsed.info)) {
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