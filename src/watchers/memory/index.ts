import { WebSocket } from "ws";

export const setupMemoryWatcher = (ws: WebSocket) => {
  return setInterval(function () {
    ws.send(JSON.stringify(process.memoryUsage()), function () {
      // Ignoring errors.
    });
  }, 1000 * 60 * 5); // 5 minutes
};
