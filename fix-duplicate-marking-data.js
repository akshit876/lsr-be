import mongoDbService from "./services/mongoDbService.js";
import logger from "./logger.js";

async function fixDuplicateMarkingData() {
  try {
    logger.info("🚀 Starting duplicate marking data cleanup process...");

    // Connect to the database
    await mongoDbService.connect("main-data", "records");

    // Step 1: Remove existing duplicates
    logger.info("📋 Step 1: Removing existing duplicate marking data...");
    const cleanupResult = await mongoDbService.removeDuplicateMarkingData(
      "main-data",
      "records"
    );

    if (cleanupResult.duplicateGroups > 0) {
      logger.info(
        `✅ Cleanup completed: Removed ${cleanupResult.removedCount} duplicate records from ${cleanupResult.duplicateGroups} groups`
      );
    } else {
      logger.info("✅ No duplicates found to clean up");
    }

    // Step 2: Create unique index
    logger.info("📋 Step 2: Creating unique index for MarkingData...");
    await mongoDbService.createUniqueIndexForMarkingData(
      "main-data",
      "records"
    );

    logger.info("🎉 Duplicate marking data fix completed successfully!");
    logger.info(
      "📝 From now on, the system will prevent duplicate marking data entries."
    );
  } catch (error) {
    logger.error("❌ Error fixing duplicate marking data:", error);
    process.exit(1);
  } finally {
    // Disconnect from database
    await mongoDbService.disconnect();
    process.exit(0);
  }
}

// Handle process termination
process.on("SIGINT", async () => {
  logger.info("👋 Process interrupted, cleaning up...");
  await mongoDbService.disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("👋 Process terminated, cleaning up...");
  await mongoDbService.disconnect();
  process.exit(0);
});

// Run the fix
fixDuplicateMarkingData();
