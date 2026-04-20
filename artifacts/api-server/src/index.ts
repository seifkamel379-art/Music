import app from "./app";
import { logger } from "./lib/logger";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const rawPort = process.env["PORT"] ?? "8080";
const port = Number(rawPort);

async function verifyRuntimeTool(command: string, args: string[]) {
  try {
    await execFileAsync(command, args, { timeout: 20000 });
    logger.info({ command }, "Runtime tool OK");
  } catch (err) {
    logger.warn({ err, command }, "Runtime tool unavailable – stream/download routes may not work");
  }
}

async function start() {
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  verifyRuntimeTool("yt-dlp", ["--version", "--no-update"]).catch(() => {});
  verifyRuntimeTool("ffmpeg", ["-version"]).catch(() => {});

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
