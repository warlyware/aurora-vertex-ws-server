enum MessageType {
  FOLDER_CHANGE = "FOLDER_CHANGE",
  MEMORY_CHANGE = "MEMORY_CHANGE",
  PING = "PING",
  PONG = "PONG",
  GENERIC_MESSAGE = "GENERIC_MESSAGE",
  TG_GET_ME = "TG_GET_ME",
  TG_GET_CHATS = "TG_GET_CHATS",
  TG_CHAT_MESSAGE = "TG_CHAT_MESSAGE",
}

export const messageTypes = {
  MESSAGE_TYPE: MessageType,
  PING: MessageType.PING,
  PONG: MessageType.PONG,
  FOLDER_CHANGE: MessageType.FOLDER_CHANGE,
  MEMORY_CHANGE: MessageType.MEMORY_CHANGE,
  GENERIC_MESSAGE: MessageType.GENERIC_MESSAGE,
  TG_GET_ME: MessageType.TG_GET_ME,
  TG_GET_CHATS: MessageType.TG_GET_CHATS,
  TG_CHAT_MESSAGE: MessageType.TG_CHAT_MESSAGE,
};

export type AuroraMessage = {
  type: MessageType;
  payload: any;
};
