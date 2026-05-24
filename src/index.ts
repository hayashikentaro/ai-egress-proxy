import { loadConfig } from "./config.js";
import { createAppServer } from "./server.js";

const config = loadConfig();
const server = createAppServer(config);

server.listen(config.port, config.host, () => {
  console.log(
    JSON.stringify({
      event: "server.started",
      host: config.host,
      port: config.port,
      allowedHosts: [...config.allowedHosts]
    })
  );
});

