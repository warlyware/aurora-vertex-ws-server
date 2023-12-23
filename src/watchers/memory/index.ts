import { WebSocket } from "ws";

export const setupMemoryWatcher = (ws: WebSocket) => {
  const id = setInterval(function () {
    ws.send(JSON.stringify(process.memoryUsage()), function () {
      //
      // Ignoring errors.
      //
    });
  }, 1000 * 60 * 5); // 5 minutes
  console.log("started client interval");

  return id;
};
