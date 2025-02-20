import { WebSocket } from "ws";
import dayjs from "dayjs";
export const setupMemoryWatcher = (ws: WebSocket) => {
  const id = setInterval(function () {
    ws.send(JSON.stringify(process.memoryUsage()), function () {
      //
      // Ignoring errors.
      //
    });
  }, 1000 * 60 * 5); // 5 minutes

  console.log(`${dayjs().format('YYYY-MM-DD HH:mm:ss')} Client connected`);

  return id;
};
