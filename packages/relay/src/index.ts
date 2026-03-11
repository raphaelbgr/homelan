import http from "node:http";
import { loadConfig } from "./config.js";
import { createStore } from "./store/index.js";
import { createApp, createRelayHandler } from "./app.js";

const config = loadConfig(); // throws and prints clear error if invalid
const store = await createStore(config.storageType, config.dbPath);
const app = createApp(config, store);

const server = http.createServer(app);

const relayHandler = createRelayHandler(config);
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/relay") {
    relayHandler(req, socket, head);
  } else {
    socket.destroy();
  }
});

server.listen(config.port, () => {
  console.log(`[relay] Listening on :${config.port}`);
});
