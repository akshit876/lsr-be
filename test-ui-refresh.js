import mongoDbService from "./services/mongoDbService.js";
import logger from "./logger.js";

async function testUIRefresh() {
  try {
    logger.info("🧪 Testing UI refresh mechanism...");

    // Connect to the database
    await mongoDbService.connect("main-data", "records");

    // Test 1: Check recent records
    logger.info("📋 Test 1: Fetching recent records...");
    const recentRecords = await mongoDbService.getRecentRecords(10);
    logger.info(`✅ Found ${recentRecords.length} recent records`);

    if (recentRecords.length > 0) {
      logger.info("📊 Latest record:");
      const latest = recentRecords[0];
      logger.info(`   - SerialNumber: ${latest.SerialNumber}`);
      logger.info(`   - MarkingData: ${latest.MarkingData}`);
      logger.info(`   - ScannerData: ${latest.ScannerData}`);
      logger.info(`   - Result: ${latest.Result}`);
      logger.info(`   - Timestamp: ${latest.Timestamp}`);
    }

    // Test 2: Test pagination
    logger.info("\n📋 Test 2: Testing pagination...");
    const paginatedResult = await mongoDbService.getRecordsForUI({
      limit: 5,
      skip: 0,
      sortBy: "Timestamp",
      sortOrder: -1,
    });

    logger.info(
      `✅ Pagination test: ${paginatedResult.data.length} records returned`
    );
    logger.info(`📊 Pagination info:`);
    logger.info(`   - Total records: ${paginatedResult.pagination.total}`);
    logger.info(`   - Current page: ${paginatedResult.pagination.currentPage}`);
    logger.info(`   - Total pages: ${paginatedResult.pagination.totalPages}`);

    // Test 3: Check for potential issues
    logger.info("\n📋 Test 3: Checking for potential refresh issues...");

    // Check if there are any records with null/empty MarkingData
    const nullMarkingData = await mongoDbService.collection.countDocuments({
      $or: [
        { MarkingData: null },
        { MarkingData: "" },
        { MarkingData: { $exists: false } },
      ],
    });

    if (nullMarkingData > 0) {
      logger.warn(
        `⚠️ Found ${nullMarkingData} records with null/empty MarkingData - these might affect UI display`
      );
    } else {
      logger.info("✅ All records have valid MarkingData");
    }

    // Check for very recent records (within last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const veryRecentRecords = await mongoDbService.collection.countDocuments({
      Timestamp: { $gte: fiveMinutesAgo },
    });

    logger.info(`📊 Records from last 5 minutes: ${veryRecentRecords}`);

    logger.info("\n✅ UI refresh test completed!");
    logger.info("💡 Recommendations for frontend:");
    logger.info("   1. Listen for 'csv-data' event for initial data load");
    logger.info(
      "   2. Listen for 'cycle-completed' event for automatic refresh"
    );
    logger.info(
      "   3. Listen for 'scan-cycle-completed' event for cycle status updates"
    );
    logger.info("   4. Use 'request-recent-records' for manual refresh");
    logger.info("   5. Implement auto-refresh every 30 seconds as fallback");
  } catch (error) {
    logger.error("❌ Error testing UI refresh:", error);
    process.exit(1);
  } finally {
    // Disconnect from database
    await mongoDbService.disconnect();
    process.exit(0);
  }
}

// Run the test
testUIRefresh();
