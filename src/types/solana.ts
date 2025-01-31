import { AuroraMessage, messageTypes } from "./messages";

const { SOLANA_TX_NOTIFICATION } = messageTypes;

type SolanaTxNotificationFromHelius = {
  timestamp?: number;
  jsonrpc: "2.0";
  method: "transactionNotification";
  params: {
    subscription: number;
    result: {
      transaction: {
        transaction: {
          signatures: string[];
          message: {
            accountKeys: Array<{
              pubkey: string;
              writable: boolean;
              signer: boolean;
              source: "transaction";
            }>;
            recentBlockhash: string;
            instructions: Array<{
              program?: string;
              programId: string;
              accounts?: string[];
              data?: string;
              parsed?: {
                info: Record<string, any>;
                type: string;
              };
              stackHeight: number | null;
            }>;
          };
        };
        meta: {
          err: any | null;
          status: { Ok: null } | Record<string, any>;
          fee: number;
          preBalances: number[];
          postBalances: number[];
          innerInstructions: Array<{
            index: number;
            instructions: Array<{
              program: string;
              programId: string;
              parsed?: {
                info: Record<string, any>;
                type: string;
              };
              accounts?: string[];
              data?: string;
              stackHeight?: number;
            }>;
          }>;
          logMessages: string[];
          preTokenBalances: Array<{
            accountIndex: number;
            mint: string;
            uiTokenAmount: {
              uiAmount: number;
              decimals: number;
              amount: string;
              uiAmountString: string;
            };
            owner: string;
            programId: string;
          }>;
          postTokenBalances: Array<{
            accountIndex: number;
            mint: string;
            uiTokenAmount: {
              uiAmount: number;
              decimals: number;
              amount: string;
              uiAmountString: string;
            };
            owner: string;
            programId: string;
          }>;
          rewards: any[];
          computeUnitsConsumed: number;
        };
        version: "legacy";
      };
      signature: string;
      slot: number;
    };
  };
};

export type SolanaTxNotificationType = {
  type: typeof SOLANA_TX_NOTIFICATION;
  payload: SolanaTxNotificationFromHelius;
};