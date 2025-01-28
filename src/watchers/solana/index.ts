import WebSocket from 'ws';
import { messageTypes } from '../../types/messages';

const request = {
  "jsonrpc": "2.0",
  "id": 1,
  "method": "accountSubscribe",
  "params": [
    "DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj", // 🧠
    // "BieeZkdnBAgNYknzo3RH2vku7FcPkFZMZmRJANh2TpW",
    {
      "encoding": "jsonParsed"
    }
  ]
};

const { SOLANA_ACCOUNT_NOTIFICATION } = messageTypes;

export const setupSolanaWatchers = (ws: WebSocket) => {
  const heliusWs = new WebSocket(`wss://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`);


  const sendRequest = () => {
    heliusWs.send(JSON.stringify(request));
  }

  // const startPing = () => {
  //   setInterval(() => {
  //     if (heliusWs.readyState === WebSocket.OPEN) {
  //       heliusWs.ping();
  //       console.log('Ping sent');
  //     }
  //   }, 30000); // Ping every 30 seconds
  // }

  heliusWs.on('open', function open() {
    console.log('Helius WebSocket is open');
    sendRequest();
    // startPing();
  });

  heliusWs.on('message', function incoming(data) {
    const messageStr = data.toString('utf8');
    try {
      const messageObj = JSON.parse(messageStr);
      console.log('Received:', messageObj);

      ws.send(JSON.stringify({
        type: SOLANA_ACCOUNT_NOTIFICATION,
        payload: messageObj
      }));
    } catch (e) {
      console.error('Failed to parse JSON:', e);
    }
  });

  heliusWs.on('error', function error(err) {
    console.error('WebSocket error:', err);
  });

  heliusWs.on('close', function close() {
    console.log('WebSocket is closed');
  });
}
