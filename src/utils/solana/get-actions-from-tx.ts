import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { SolanaTxEventForBot } from "../../events/bridge";
import { getAbbreviatedAddress } from ".";

// Constants matching frontend
const PHOTON_PROGRAM_ID = 'BSfD6SHZigAfDWSjzD5Q41jw8LmKwtmjskPH9XW1mrRW';
const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const RAYDIUM_V4_SWAP_PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const SPL_TOKEN_TRANSFER_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const RAYDIUM_FEE_COLLECTION_ACCOUNT = 'AVUCZyuT35YSuj4RH7fwiyPu82Djn2Hfg7y2ND2XcnZH';
const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
const PUMPFUN_FEE_COLLECTION_ACCOUNT = 'CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM';

type TxAction = {
  type: 'SOL_TRANSFER' | 'SPL_TOKEN_TRANSFER' | 'PUMPFUN_FEE' | 'PUMPFUN_BUY' | 'PUMPFUN_SELL' | 'PUMPFUN_CREATE' | 'PHOTON_ACTION' | 'RAYDIUM_SWAP' | 'PUMPFUN_UNKNOWN';
  source?: string;
  destination?: string;
  amount?: number;
  mint?: string;
  isInnerInstruction?: boolean;
  rawInfo?: any;
  description: string;
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

export const getTxActions = (event: SolanaTxEventForBot): TxAction[] => {
  const actions: TxAction[] = [];
  const seenInnerInstructions = new Set();

  const result = event.payload?.params?.result;
  if (!result?.transaction?.transaction?.message?.instructions) return actions;

  const instructions = result.transaction.transaction.message.instructions;
  const logs = result.transaction.meta?.logMessages;

  // Process main instructions
  for (const instruction of instructions) {
    const programId = instruction.programId;
    const parsed = instruction.parsed;

    switch (programId) {
      case '11111111111111111111111111111111':
        if (parsed?.type === 'transfer') {
          actions.push({
            type: 'SOL_TRANSFER',
            source: parsed.info.source,
            amount: parsed.info.lamports / LAMPORTS_PER_SOL,
            description: `${getAbbreviatedAddress(parsed.info.source)} sent ${parsed.info.lamports / LAMPORTS_PER_SOL} SOL to ${getAbbreviatedAddress(parsed.info.destination)}`
          });
        }
        break;

      case SPL_TOKEN_TRANSFER_PROGRAM_ID:
        if (parsed?.type === 'transfer') {
          actions.push({
            type: 'SPL_TOKEN_TRANSFER',
            source: parsed.info.source,
            destination: parsed.info.wallet,
            amount: parsed.info.amount,
            mint: parsed.info.mint,
            description: `${getAbbreviatedAddress(parsed.info.source)} sent ${parsed.info.amount} ${getAbbreviatedAddress(parsed.info.mint)} to ${getAbbreviatedAddress(parsed.info.wallet)}`
          });
        }
        break;

      case PHOTON_PROGRAM_ID:
        actions.push({
          type: 'PHOTON_ACTION',
          description: 'Photon action'
        });
        break;

      case RAYDIUM_V4_SWAP_PROGRAM_ID:
        actions.push(handleRaydiumSwap(result));
        break;
    }
  }

  // Process inner instructions
  const innerInstructionsCollections = result.transaction.meta?.innerInstructions;
  if (innerInstructionsCollections) {
    for (const collection of innerInstructionsCollections) {
      for (const instruction of collection.instructions) {
        const programId = instruction.programId;
        const parsed = instruction.parsed;

        // Create unique key for deduplication
        const source = parsed?.info?.source || 'unknown';
        const destination = parsed?.info?.destination || 'unknown';
        const amount = parsed?.info?.amount ? Number(parsed.info.amount) : 0;
        const instructionKey = `${programId}-${parsed?.type}-${source}-${destination}-${amount}`;

        if (seenInnerInstructions.has(instructionKey)) continue;
        seenInnerInstructions.add(instructionKey);

        switch (programId) {
          case SYSTEM_PROGRAM_ID:
            if (parsed?.type === 'transfer') {
              console.log('TRANSFER action', {
                instruction: JSON.stringify(instruction),
              })

              if (instruction.accounts?.includes(PUMPFUN_FEE_COLLECTION_ACCOUNT)) {
                actions.push({
                  type: 'PUMPFUN_FEE',
                  source: instruction.accounts?.[0],
                  destination: instruction.accounts?.[1],
                  amount: instruction.parsed?.info?.lamports / LAMPORTS_PER_SOL,
                  description: `${getAbbreviatedAddress(instruction.accounts?.[0])} sent ${instruction.parsed?.info?.lamports / LAMPORTS_PER_SOL} SOL to ${getAbbreviatedAddress(instruction.accounts?.[1])}`,
                  rawInfo: {
                    instruction: JSON.stringify(instruction),
                  }
                })
              }

              actions.push({
                type: 'SOL_TRANSFER',
                source: instruction.accounts?.[0],
                destination: instruction.accounts?.[1],
                amount: instruction.parsed?.info?.lamports / LAMPORTS_PER_SOL,
                description: `${getAbbreviatedAddress(instruction.accounts?.[0])} sent ${instruction.parsed?.info?.lamports / LAMPORTS_PER_SOL} SOL to ${getAbbreviatedAddress(instruction.accounts?.[1])}`,
                rawInfo: {
                  instruction: JSON.stringify(instruction),
                }
              })
            }
            break;
          case PUMPFUN_PROGRAM_ID:
            console.log('PUMPFUN action', {
              instruction: JSON.stringify(instruction),
            })
            if (parsed?.type === 'transfer' || collection.instructions[1]?.parsed?.type === 'transfer') {
              const transferInstruction = collection.instructions.find(ix => ix.parsed?.type === 'transfer');

              let actionType: TxAction['type'] = 'PUMPFUN_UNKNOWN';
              logs?.forEach(log => {
                if (log.includes('Sell')) actionType = 'PUMPFUN_SELL';
                if (log.includes('Buy')) actionType = 'PUMPFUN_BUY';
                if (log.includes('CreateIdempotent')) actionType = 'PUMPFUN_CREATE';
              });

              actions.push({
                type: actionType,
                source: transferInstruction?.parsed?.info?.source,
                destination: collection.instructions[2]?.parsed?.info?.authority,
                amount: transferInstruction?.parsed?.info?.amount,
                mint: instruction.accounts?.[2],
                isInnerInstruction: true,
                description: `${getAbbreviatedAddress(transferInstruction?.parsed?.info?.source)} ${actionType} ${transferInstruction?.parsed?.info?.amount} ${getAbbreviatedAddress(instruction.accounts?.[2])}`,
                rawInfo: {
                  transferInstruction,
                  actionType,
                  logs
                }
              });
            }
            break;

          case RAYDIUM_V4_SWAP_PROGRAM_ID:
            actions.push(handleRaydiumSwap(result));
            break;
        }
      }
    }
  }

  // Deduplicate Raydium swaps since they might be detected in both main and inner instructions
  return actions.filter((action, index, self) =>
    index === self.findIndex((t) => (
      t.type === action.type &&
      t.source === action.source &&
      t.destination === action.destination &&
      t.amount === action.amount
    ))
  );
};