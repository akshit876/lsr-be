import logger from "../../logger.js";

export function setupShutdownHandlers(scanner) {
  if (!scanner.shutdownHandlersSet) {
    process.on("SIGINT", async () => {
      logger.section("Shutdown Sequence - SIGINT");
      await scanner.cleanupResources();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      logger.section("Shutdown Sequence - SIGTERM");
      await scanner.cleanupResources();
      process.exit(0);
    });

    scanner.shutdownHandlersSet = true;
    logger.success("Shutdown handlers configured");
  }
}
