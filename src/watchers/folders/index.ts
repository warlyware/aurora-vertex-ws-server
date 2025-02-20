import WebSocket from "ws";

export const setupFolderWatchers = (ws: WebSocket) => {
  const watcher = require("chokidar").watch("public", {
    ignored: /(^|[\/\\])\../,
    persistent: true,
  });

  // Add event listeners.
  watcher
    .on("add", function (path: string) {
      ws.send("reload");
    })
    .on("change", function (path: string) {
      ws.send("reload");
    })
    .on("unlink", function (path: string) {
      ws.send("reload");
    })
    .on("error", function (error: any) {
    });
};
