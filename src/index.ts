"use strict";

import express from "express";
import path from "path";
import { createServer } from "http";
import WebSocket from "ws";

const app = express();
app.use(express.static(path.join(__dirname, "/public")));

const server = createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", function (ws: WebSocket) {
  console.log("Client connected");

  // Send a hello world message to the client
  ws.send("Hello World", function () {
    // Ignoring errors.
  });

  const id = setInterval(function () {
    ws.send(JSON.stringify(process.memoryUsage()), function () {
      //
      // Ignoring errors.
      //
    });
  }, 100);
  console.log("started client interval");

  ws.on("close", function () {
    console.log("stopping client interval");
    clearInterval(id);
  });
});

server.listen(3002, function () {
  console.log("Listening on http://0.0.0.0:3002");
});
