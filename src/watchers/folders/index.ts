import WebSocket from "ws";

export const setupFolderWatchers = (ws: WebSocket) => {
  const watcher = require("chokidar").watch("public", {
    ignored: /(^|[\/\\])\../,
    persistent: true,
  });

  const log = console.log.bind(console);

  // Add event listeners.
  watcher
    .on("add", function (path: string) {
      log(`File ${path} has been added`);
      ws.send("reload");
    })
    .on("change", function (path: string) {
      log(`File ${path} has been changed`);
      ws.send("reload");
    })
    .on("unlink", function (path: string) {
      log(`File ${path} has been removed`);
      ws.send("reload");
    })
    .on("error", function (error: any) {
      log(`Watcher error: ${error}`);
    });
};
