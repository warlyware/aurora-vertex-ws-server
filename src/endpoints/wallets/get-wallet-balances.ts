import { Router } from 'express';
import axios from 'axios';
import { RPC_ENDPOINT, AURORA_VERTEX_API_KEY } from '../../constants';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { getCoinInfo } from '../../utils/coins';

export type TokenBalance = {
  tokenAccount: string;
  mint: string;
  amount: number;
  decimals: number;
  symbol?: string;
  name?: string;
  image?: string;
  priceInUSD?: number;
};


interface TokenAmount {
  amount: string;
  decimals: number;
  uiAmount: number;
  uiAmountString: string;
}

interface TokenAccountInfo {
  isNative: boolean;
  mint: string;
  owner: string;
  state: string;
  tokenAmount: TokenAmount;
}

interface ParsedData {
  info: TokenAccountInfo;
  type: string;
}

interface AccountData {
  parsed: ParsedData;
  program: string;
  space: number;
}

interface Account {
  data: AccountData;
  executable: boolean;
  lamports: number;
  owner: string;
  rentEpoch: number;
  space: number;
}

interface TokenAccountResponse {
  account: Account;
  pubkey: string;
}

export function setupWalletBalancesRoute(router: Router) {
  router.get('/get-wallet-balances', async (req, res) => {
    const address = req.query.address as string;
    const apiKey = req.query.apiKey as string;

    if (!address || !apiKey) {
      return res.status(400).json({
        error: "Missing required parameters",
        status: 400,
      });
    }

    if (apiKey !== AURORA_VERTEX_API_KEY) {
      return res.status(401).json({
        error: "Invalid API key",
        status: 401,
      });
    }

    const connection = new Connection(RPC_ENDPOINT);

    async function getTokenMetadata(mint: string) {
      try {
        const info = await getCoinInfo(mint)
        return info;
      } catch (error) {
        console.error(`Error fetching metadata for ${mint}:`, error);
        return null;
      }
    }

    try {
      const response = await axios.post(RPC_ENDPOINT, {
        jsonrpc: "2.0",
        id: "get-token-accounts",
        method: "getTokenAccountsByOwner",
        params: [
          address,
          {
            programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"  // SPL Token Program ID
          },
          {
            encoding: "jsonParsed"
          }
        ]
      });

      if (!response.data.result) {
        return res.status(500).json({
          error: "No result from RPC",
          status: 500,
        });
      }

      const { value }: { value: TokenAccountResponse[] } = response.data.result;

      // Process token accounts sequentially instead of in parallel
      const balances: TokenBalance[] = [];
      for (const tokenAccount of value) {
        try {
          // Only fetch metadata for tokens with non-zero balance
          const amount = Number(tokenAccount.account.data.parsed.info.tokenAmount.amount);
          if (amount > 0) {
            const metadata = await getTokenMetadata(tokenAccount.account.data.parsed.info.mint);
            balances.push({
              tokenAccount: tokenAccount.pubkey,
              mint: tokenAccount.account.data.parsed.info.mint,
              amount,
              decimals: tokenAccount.account.data.parsed.info.tokenAmount.decimals,
              image: metadata?.content?.files?.[0]?.cdn_uri || metadata?.content?.json_uri || metadata?.content?.files?.[0]?.uri,
              name: metadata?.content?.metadata?.name,
              symbol: metadata?.content?.metadata?.symbol,
              priceInUSD: metadata?.token_info?.price_info?.price_per_token
            });
          }
        } catch (error) {
          console.error(`Error processing token account ${tokenAccount.pubkey}:`, error);
          // Continue processing other tokens even if one fails
          continue;
        }
      }

      const nativeBalance = await connection.getBalance(new PublicKey(address));
      return res.status(200).json({
        balances: {
          splTokens: balances,
          lamports: nativeBalance,
          sol: nativeBalance / LAMPORTS_PER_SOL,
        },
        status: 200,
      });

    } catch (error) {
      console.error('Error fetching token accounts:', error);
      return res.status(500).json({
        error: "Internal server error",
        status: 500,
      });
    }
  });

  return router;
}