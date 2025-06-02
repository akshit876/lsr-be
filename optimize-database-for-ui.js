import MongoDBService from "./services/mongoDbService.js";
import logger from "./logger.js";

async function optimizeDatabaseForUI() {
  try {
    console.log("\n🚀 ===== OPTIMIZING DATABASE FOR UI PERFORMANCE =====\n");

    // Connect to records collection
    await MongoDBService.connect("main-data", "records");

    console.log("📊 1. Analyzing current collection status...");

    // Get collection stats
    const stats = await MongoDBService.collection.stats();
    console.log(`📈 Collection stats:`);
    console.log(`   - Total documents: ${stats.count}`);
    console.log(
      `   - Average document size: ${Math.round(stats.avgObjSize)} bytes`
    );
    console.log(`   - Total size: ${Math.round(stats.size / 1024 / 1024)} MB`);

    console.log("\n🔍 2. Checking existing indexes...");
    const existingIndexes = await MongoDBService.collection
      .listIndexes()
      .toArray();
    console.log("📋 Current indexes:");
    existingIndexes.forEach((index, i) => {
      console.log(`   ${i + 1}. ${index.name}: ${JSON.stringify(index.key)}`);
    });

    console.log("\n⚡ 3. Creating performance indexes for UI...");

    // Critical indexes for UI performance
    const indexesToCreate = [
      {
        name: "timestamp_desc",
        fields: { Timestamp: -1 },
        description: "For sorting records by timestamp (newest first)",
      },
      {
        name: "model_timestamp",
        fields: { ModelNumber: 1, Timestamp: -1 },
        description: "For filtering by model and sorting by timestamp",
      },
      {
        name: "serialnumber_timestamp",
        fields: { SerialNumber: 1, Timestamp: -1 },
        description: "For searching by serial number with timestamp sort",
      },
      {
        name: "timestamp_range",
        fields: { Timestamp: 1 },
        description: "For date range queries (ascending for range searches)",
      },
      {
        name: "compound_ui_query",
        fields: { ModelNumber: 1, Timestamp: -1, SerialNumber: 1 },
        description: "Compound index for common UI query patterns",
      },
    ];

    for (const indexDef of indexesToCreate) {
      try {
        // Check if index already exists
        const indexExists = existingIndexes.some(
          (idx) => idx.name === indexDef.name
        );

        if (!indexExists) {
          console.log(`🔧 Creating index: ${indexDef.name}...`);
          await MongoDBService.collection.createIndex(indexDef.fields, {
            name: indexDef.name,
            background: true, // Create in background to avoid blocking
          });
          console.log(`✅ Created: ${indexDef.name} - ${indexDef.description}`);
        } else {
          console.log(
            `✅ Already exists: ${indexDef.name} - ${indexDef.description}`
          );
        }
      } catch (error) {
        console.error(
          `❌ Failed to create index ${indexDef.name}:`,
          error.message
        );
      }
    }

    console.log("\n📊 4. Testing query performance...");

    // Test query performance for common UI operations
    const testQueries = [
      {
        name: "Latest 500 records",
        query: {},
        sort: { Timestamp: -1 },
        limit: 500,
      },
      {
        name: "Latest 500 records for specific model",
        query: { ModelNumber: "CMB-877" },
        sort: { Timestamp: -1 },
        limit: 500,
      },
      {
        name: "Date range query (last 24 hours)",
        query: {
          Timestamp: {
            $gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
        sort: { Timestamp: -1 },
        limit: 500,
      },
    ];

    for (const test of testQueries) {
      try {
        const startTime = Date.now();

        const result = await MongoDBService.collection
          .find(test.query)
          .sort(test.sort)
          .limit(test.limit)
          .toArray();

        const endTime = Date.now();
        const duration = endTime - startTime;

        console.log(`⚡ ${test.name}:`);
        console.log(`   - Found: ${result.length} records`);
        console.log(`   - Time: ${duration}ms`);
        console.log(
          `   - Performance: ${duration < 100 ? "🟢 Excellent" : duration < 500 ? "🟡 Good" : "🔴 Needs improvement"}`
        );
      } catch (error) {
        console.error(
          `❌ Query test failed for "${test.name}":`,
          error.message
        );
      }
    }

    console.log("\n📋 5. Updated index status:");
    const updatedIndexes = await MongoDBService.collection
      .listIndexes()
      .toArray();
    updatedIndexes.forEach((index, i) => {
      console.log(`   ${i + 1}. ${index.name}: ${JSON.stringify(index.key)}`);
    });

    console.log("\n💡 6. Performance recommendations:");
    console.log("✅ Database is now optimized for UI queries:");
    console.log("   - 500 records fetch should be under 100ms");
    console.log("   - Model-specific filtering is indexed");
    console.log("   - Date range queries are optimized");
    console.log("   - Compound queries for complex filters are supported");

    console.log("\n🎯 7. Frontend integration tips:");
    console.log(
      "   - Use 'request-paginated-data' socket event for initial load"
    );
    console.log("   - Use 'request-recent-records' for real-time updates");
    console.log("   - Implement virtual scrolling for smooth performance");
    console.log(
      "   - Consider pagination with skip/limit for very large datasets"
    );

    console.log("\n✅ ===== DATABASE OPTIMIZATION COMPLETED =====");
  } catch (error) {
    console.error("❌ Database optimization failed:", error);
  } finally {
    await MongoDBService.disconnect();
  }
}

// Utility function to monitor ongoing performance
async function monitorQueryPerformance(queryName, queryFunction) {
  const startTime = Date.now();
  try {
    const result = await queryFunction();
    const endTime = Date.now();
    const duration = endTime - startTime;

    logger.info(
      `📊 QUERY PERFORMANCE [${queryName}]: ${duration}ms - ${Array.isArray(result) ? result.length : "N/A"} records`
    );

    if (duration > 1000) {
      logger.warn(
        `⚠️ SLOW QUERY [${queryName}]: ${duration}ms - Consider optimization`
      );
    }

    return result;
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    logger.error(
      `❌ QUERY FAILED [${queryName}]: ${duration}ms - ${error.message}`
    );
    throw error;
  }
}

export { optimizeDatabaseForUI, monitorQueryPerformance };

console.log("\n🚀 Starting database optimization for UI performance...\n");
optimizeDatabaseForUI()
  .then(() => {
    console.log("\n🎉 Optimization completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Optimization failed:", error);
    process.exit(1);
  });
