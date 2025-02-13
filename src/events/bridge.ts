import { sendToConnectedClients } from "..";
import { eventBus } from "./bus";
import { AuroraMessage } from "../types/messages";
import { messageTypes } from "../types/messages";
import { SolanaTxNotificationFromHeliusEvent, SolanaTxNotificationFromHeliusWithTimestamp } from "../types/solana";
import { BotLogEvent } from "../logging";
import { getActionsFromTx, TxAction } from "../utils/solana/get-actions-from-tx";

const { SOLANA_TX_EVENT, BOT_STATUS_UPDATE } = messageTypes;

export type SolanaTxEvent = {
  type: typeof SOLANA_TX_EVENT;
  payload: {
    tx: SolanaTxNotificationFromHeliusWithTimestamp;
    actions: TxAction[];
  };
};

export type SolanaTxEventForBot = {
  type: typeof SOLANA_TX_EVENT;
  payload: SolanaTxNotificationFromHeliusWithTimestamp & {
    botId: string;
    strategy: string;
    actions: TxAction[];
    data: {
      tx: SolanaTxNotificationFromHeliusWithTimestamp;
      actions: {
        type: string;
        description: string;
        rawInfo: any;
      }[];
    };
  };
};

const broadcastToWebSocketClients = (message: AuroraMessage) => {
  sendToConnectedClients(message);
};

const { SOLANA_TX_NOTIFICATION_FROM_HELIUS, BOT_LOG_EVENT, SERVER_LOG_EVENT } = messageTypes;

export const setupEventBusListeners = () => {
  eventBus.on(SOLANA_TX_NOTIFICATION_FROM_HELIUS, (event: SolanaTxNotificationFromHeliusEvent) => {
    const actions = getActionsFromTx(event);

    const solanaTxEvent: SolanaTxEvent = {
      type: SOLANA_TX_EVENT,
      payload: {
        tx: event.payload,
        actions,
      }
    };

    eventBus.emit(SOLANA_TX_EVENT, solanaTxEvent);
    broadcastToWebSocketClients(solanaTxEvent);
  });

  eventBus.on(BOT_STATUS_UPDATE, (event: BotLogEvent) => {
    broadcastToWebSocketClients(event);
  });

  eventBus.on(BOT_LOG_EVENT, (event: BotLogEvent) => {
    broadcastToWebSocketClients(event);
  });

  eventBus.on(SERVER_LOG_EVENT, (event: AuroraMessage) => {
    broadcastToWebSocketClients(event);
  });
};
