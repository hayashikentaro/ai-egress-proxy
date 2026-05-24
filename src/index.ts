import { loadConfig } from "./config.js";
import { configureAuditLog } from "./logging.js";
import { createAppServer } from "./server.js";

const config = loadConfig();
configureAuditLog(config.auditLogPath);
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
