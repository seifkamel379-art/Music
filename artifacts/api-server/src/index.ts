import app from "./app";
import { logger } from "./lib/logger";
import { getClient } from "./lib/innertube";

const rawPort = process.env["PORT"] ?? "8080";
const port = Number(rawPort);

async function start() {
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });

  getClient()
    .then(() => logger.info("Innertube client pre-warmed"))
    .catch(e => logger.warn({ err: e }, "Innertube pre-warm failed (will retry on first request)"));
}

start().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
