import { loadConfig } from "./config.js";
import { createStore } from "./store/index.js";
import { createApp } from "./app.js";

const config = loadConfig(); // throws and prints clear error if invalid
const store = await createStore(config.storageType, config.dbPath);
const app = createApp(config, store);
app.listen(config.port, () => {
  console.log(`[relay] Listening on :${config.port}`);
});
