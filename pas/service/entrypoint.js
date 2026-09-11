"use strict";
const { loadConfig } = require("./config");
const { startService } = require("./server");

async function main() {
  if (process.versions.node.split(".")[0] !== "20") throw new Error("Node 20 required");
  const service = await startService(loadConfig());
  // Only fixed lifecycle labels and local port. Never log requests or exception text.
  process.stdout.write(JSON.stringify({ event: "PAS_READY", port: service.port }) + "\n");
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    await service.shutdown();
    process.stdout.write(JSON.stringify({ event: "PAS_STOPPED" }) + "\n");
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
if (require.main === module) main().catch(() => {
  process.stderr.write("PAS_STARTUP_FAILED\n"); process.exitCode = 1;
});
module.exports = { main };
