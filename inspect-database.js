import mongoDbService from "./services/mongoDbService.js";
import logger from "./logger.js";

async function inspectDatabase() {
  try {
    logger.info("🔍 Inspecting MongoDB Database Structure...");

    // Connect to main-data database
    await mongoDbService.connect("main-data", "temp");

    // Get all collections
    const collections = await mongoDbService.db.listCollections().toArray();
    logger.info(
      `📋 Found ${collections.length} collections in 'main-data' database`
    );

    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      logger.separator.hash();
      logger.info(`📄 Collection: ${collectionName}`);

      try {
        // Connect to specific collection
        await mongoDbService.connect("main-data", collectionName);

        // Get collection stats
        const stats = await mongoDbService.collection.stats();
        logger.info(
          `📊 Stats: ${stats.count} documents, ${Math.round(stats.size / 1024)} KB`
        );

        // Get first 3 documents as examples
        const sampleDocs = await mongoDbService.collection
          .find({})
          .limit(3)
          .toArray();

        logger.info(`📝 Sample Documents (showing ${sampleDocs.length}):`);
        sampleDocs.forEach((doc, index) => {
          logger.info(`   ${index + 1}. Document ID: ${doc._id}`);

          // Show key fields
          Object.keys(doc).forEach((key) => {
            if (key !== "_id") {
              const value = doc[key];
              const displayValue =
                typeof value === "string" && value.length > 50
                  ? value.substring(0, 50) + "..."
                  : value;
              logger.info(`      ${key}: ${displayValue}`);
            }
          });
        });

        // Get indexes
        const indexes = await mongoDbService.collection.listIndexes().toArray();
        if (indexes.length > 1) {
          // More than just _id index
          logger.info(`🔗 Indexes (${indexes.length}):`);
          indexes.forEach((index) => {
            logger.info(`   - ${index.name}: ${JSON.stringify(index.key)}`);
          });
        }

        // Show schema analysis
        if (sampleDocs.length > 0) {
          const schema = analyzeSchema(sampleDocs);
          logger.info(`🏗️ Schema Analysis:`);
          Object.entries(schema).forEach(([field, info]) => {
            logger.info(
              `   ${field}: ${info.type} (examples: ${info.examples.slice(0, 2).join(", ")})`
            );
          });
        }
      } catch (error) {
        logger.error(
          `❌ Error inspecting collection ${collectionName}:`,
          error.message
        );
      }
    }

    logger.separator.hash();
    logger.success("✅ Database inspection completed!");
  } catch (error) {
    logger.error("❌ Database inspection failed:", error);
  } finally {
    await mongoDbService.disconnect();
    process.exit(0);
  }
}

function analyzeSchema(documents) {
  const schema = {};

  documents.forEach((doc) => {
    Object.keys(doc).forEach((key) => {
      if (!schema[key]) {
        schema[key] = {
          type: typeof doc[key],
          examples: [],
        };
      }

      const value = doc[key];
      if (
        schema[key].examples.length < 3 &&
        !schema[key].examples.includes(value)
      ) {
        schema[key].examples.push(value);
      }
    });
  });

  return schema;
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

// Run the inspection
logger.info("🚀 Starting Database Inspection...");
inspectDatabase();
