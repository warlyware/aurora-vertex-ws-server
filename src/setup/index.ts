"use strict";
import express from "express";
import path from "path";
import { createServer } from "http";
import WebSocket from "ws";
import { messageTypes } from "../types/messages";
import { getClient } from "../utils/tg";

const {
  PING,
  PONG,
  TG_GET_ME,
  TG_GET_CHATS
} = messageTypes;

export const setupApp = () => {
  const app = express();
  app.use(express.static(path.join(__dirname, "/public")));
  const server = createServer(app);
  const wss = new WebSocket.Server({ server });

  server.listen(3002, function () {
    console.log("Listening on http://0.0.0.0:3002");
  });

  return { app, wss, server };
};

export const setupEventListeners = (ws: WebSocket) => {
  ws.on("message", async function (message: string) {
    const { type, payload } = JSON.parse(message);

    console.log({
      type,
      payload,
    });

    switch (type) {
      case PING: {
        console.log("Received PING");
        ws.send(
          JSON.stringify({
            type: PONG,
            payload: {
              timestamp: Date.now(),
            },
          })
        );
        break;
      }
      case TG_GET_ME: {
        try {
          const tgClient = await getClient();

          const me = await tgClient.invoke({ _: 'getMe' });
          console.log('My user:', me);


          ws.send(JSON.stringify({
            type: TG_GET_ME,
            payload: {
              me,
            },
          }));
        } catch (error) {
          console.error({ error });
        }
        break;
      }
      case TG_GET_CHATS: {
        try {
          const tgClient = await getClient();

          const chats = await tgClient.invoke({ _: 'getChats' });
          console.log('Chats:', chats);

          ws.send(JSON.stringify({
            type: TG_GET_CHATS,
            payload: {
              chats,
            },
          }));
        }
        catch (error) {
          console.error({ error });
        }
        break;
      }
      default: {
        console.log("No handler for this type of message");
      }
    }
  });
};
