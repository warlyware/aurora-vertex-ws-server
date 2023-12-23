"use strict";
import express from "express";
import path from "path";
import { createServer } from "http";
import WebSocket from "ws";

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
