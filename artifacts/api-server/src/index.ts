import app from "./app";
import { logger } from "./lib/logger";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const rawPort = process.env["PORT"] ?? "8080";
const port = Number(rawPort);

async function verifyRuntimeTool(command: string, args: string[]) {
  try {
    await execFileAsync(command, args, { timeout: 10000 });
  } catch (err) {
    logger.error({ err, command }, "Required runtime tool is unavailable");
    throw err;
  }
}

async function start() {
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  await verifyRuntimeTool("yt-dlp", ["--version"]);
  await verifyRuntimeTool("ffmpeg", ["-version"]);

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

start().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
