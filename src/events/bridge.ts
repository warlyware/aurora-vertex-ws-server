import { sendToConnectedClients } from "..";
import { eventBus } from "./bus";
import { BotLogEvent } from "../bots/manager";
import { AuroraMessage } from "../types/messages";
import { messageTypes } from "../types/messages";
import { SolanaTxNotificationFromHeliusEvent, SolanaTxNotificationFromHeliusWithTimestamp } from "../types/solana";

const { SOLANA_TX_EVENT, SOLANA_TX_EVENT_FOR_BOT } = messageTypes;

export type SolanaTxEvent = {
  type: typeof SOLANA_TX_EVENT;
  payload: SolanaTxNotificationFromHeliusWithTimestamp;
};

export type SolanaTxEventForBot = {
  type: typeof SOLANA_TX_EVENT_FOR_BOT;
  payload: SolanaTxNotificationFromHeliusWithTimestamp & {
    botId: string;
    strategy: string;
  };
};

const broadcastToWebSocketClients = (message: AuroraMessage) => {
  sendToConnectedClients(message);
};

const { SOLANA_TX_NOTIFICATION_FROM_HELIUS, BOT_LOG_EVENT, SERVER_LOG_EVENT } = messageTypes;

eventBus.on(SOLANA_TX_NOTIFICATION_FROM_HELIUS, (event: SolanaTxNotificationFromHeliusEvent) => {
  const solanaTxEvent: SolanaTxEvent = {
    type: SOLANA_TX_EVENT,
    payload: event.payload
  };

  eventBus.emit(SOLANA_TX_EVENT, solanaTxEvent);
  broadcastToWebSocketClients(solanaTxEvent);
});

eventBus.on(BOT_LOG_EVENT, (event: BotLogEvent) => {
  broadcastToWebSocketClients(event);
});

eventBus.on(SERVER_LOG_EVENT, (event: AuroraMessage) => {
  broadcastToWebSocketClients(event);
});
