import mongoDbService from "./services/mongoDbService.js";
import logger from "./logger.js";
import fs from "fs";
import path from "path";

class DatabaseExporter {
  constructor() {
    this.exportData = {
      databases: {},
      timestamp: new Date().toISOString(),
      exportedBy: "Database Export Script v1.0",
    };
  }

  async exportDatabase(dbName) {
    try {
      logger.info(`📦 Exporting database: ${dbName}`);

      // Connect to the database
      await mongoDbService.connect(dbName, "temp");

      // Get database stats
      const dbStats = await mongoDbService.db.stats();
      logger.info(
        `📊 Database stats: ${dbStats.collections} collections, ${Math.round(dbStats.dataSize / 1024)} KB`
      );

      this.exportData.databases[dbName] = {
        stats: {
          collections: dbStats.collections,
          dataSize: dbStats.dataSize,
          indexes: dbStats.indexes,
        },
        collections: {},
      };

      // Get all collections
      const collections = await mongoDbService.db.listCollections().toArray();
      logger.info(
        `📋 Found ${collections.length} collections: ${collections.map((c) => c.name).join(", ")}`
      );

      // Export each collection
      for (const collectionInfo of collections) {
        await this.exportCollection(dbName, collectionInfo.name);
      }

      logger.success(`✅ Database ${dbName} exported successfully`);
    } catch (error) {
      logger.error(`❌ Error exporting database ${dbName}:`, error);
      throw error;
    }
  }

  async exportCollection(dbName, collectionName) {
    try {
      logger.info(`  📄 Exporting collection: ${collectionName}`);

      // Connect to the specific collection
      await mongoDbService.connect(dbName, collectionName);

      // Get collection stats
      const collectionStats = await mongoDbService.collection.stats();

      // Get sample documents (first 10)
      const sampleDocs = await mongoDbService.collection
        .find({})
        .limit(10)
        .toArray();

      // Get indexes
      const indexes = await mongoDbService.collection.listIndexes().toArray();

      // Store collection data
      this.exportData.databases[dbName].collections[collectionName] = {
        stats: {
          count: collectionStats.count,
          size: collectionStats.size,
          avgObjSize: Math.round(collectionStats.avgObjSize || 0),
        },
        indexes: indexes,
        sampleDocuments: sampleDocs,
        schema: this.analyzeSchema(sampleDocs),
      };

      logger.info(
        `    ✅ Exported ${sampleDocs.length} sample documents and ${indexes.length} indexes`
      );
    } catch (error) {
      logger.error(
        `    ❌ Error exporting collection ${collectionName}:`,
        error
      );
      // Continue with other collections
    }
  }

  analyzeSchema(documents) {
    if (documents.length === 0) return {};

    const schema = {};

    documents.forEach((doc) => {
      Object.keys(doc).forEach((key) => {
        if (!schema[key]) {
          schema[key] = {
            type: typeof doc[key],
            examples: [],
          };
        }

        // Add example values (max 3 unique examples)
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

  async saveExport() {
    try {
      const exportDir = "./database-exports";
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const exportFile = path.join(exportDir, `db-export-${timestamp}.json`);

      // Save detailed export
      fs.writeFileSync(exportFile, JSON.stringify(this.exportData, null, 2));
      logger.success(`📁 Export saved to: ${exportFile}`);

      // Generate replication script
      await this.generateReplicationScript(exportDir, timestamp);

      return exportFile;
    } catch (error) {
      logger.error("❌ Error saving export:", error);
      throw error;
    }
  }

  async generateReplicationScript(exportDir, timestamp) {
    const scriptFile = path.join(exportDir, `replicate-db-${timestamp}.js`);

    const scriptContent = `// Auto-generated Database Replication Script
// Generated on: ${new Date().toISOString()}
// Export contains: ${Object.keys(this.exportData.databases).join(", ")} databases

import { MongoClient } from "mongodb";

const exportData = ${JSON.stringify(this.exportData, null, 2)};

class DatabaseReplicator {
  constructor() {
    this.client = null;
  }

  async connect(uri = "mongodb://localhost:27017") {
    try {
      console.log("🔗 Connecting to MongoDB...");
      this.client = new MongoClient(uri);
      await this.client.connect();
      console.log("✅ Connected to MongoDB successfully");
    } catch (error) {
      console.error("❌ MongoDB connection error:", error);
      throw error;
    }
  }

  async replicateAllDatabases() {
    try {
      console.log("🚀 Starting database replication...");
      
      for (const [dbName, dbData] of Object.entries(exportData.databases)) {
        await this.replicateDatabase(dbName, dbData);
      }
      
      console.log("🎉 Database replication completed successfully!");
    } catch (error) {
      console.error("❌ Error during replication:", error);
      throw error;
    }
  }

  async replicateDatabase(dbName, dbData) {
    try {
      console.log(\`📦 Replicating database: \${dbName}\`);
      
      const db = this.client.db(dbName);
      
      for (const [collectionName, collectionData] of Object.entries(dbData.collections)) {
        await this.replicateCollection(db, collectionName, collectionData);
      }
      
      console.log(\`✅ Database \${dbName} replicated successfully\`);
    } catch (error) {
      console.error(\`❌ Error replicating database \${dbName}:\`, error);
      throw error;
    }
  }

  async replicateCollection(db, collectionName, collectionData) {
    try {
      console.log(\`  📄 Creating collection: \${collectionName}\`);
      
      // Create collection
      const collection = db.collection(collectionName);
      
      // Insert sample documents if any
      if (collectionData.sampleDocuments && collectionData.sampleDocuments.length > 0) {
        await collection.insertMany(collectionData.sampleDocuments);
        console.log(\`    ✅ Inserted \${collectionData.sampleDocuments.length} sample documents\`);
      }
      
      // Create indexes (skip default _id index)
      const customIndexes = collectionData.indexes.filter(index => index.name !== '_id_');
      for (const index of customIndexes) {
        try {
          await collection.createIndex(index.key, {
            name: index.name,
            unique: index.unique || false,
            sparse: index.sparse || false
          });
          console.log(\`    ✅ Created index: \${index.name}\`);
        } catch (indexError) {
          console.warn(\`    ⚠️ Index creation warning for \${index.name}:\`, indexError.message);
        }
      }
      
      console.log(\`    📊 Collection stats: \${collectionData.stats.count} docs, \${Math.round(collectionData.stats.size / 1024)} KB\`);
    } catch (error) {
      console.error(\`    ❌ Error creating collection \${collectionName}:\`, error);
      // Continue with other collections
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      console.log("👋 Disconnected from MongoDB");
    }
  }

  // Helper method to show export summary
  showExportSummary() {
    console.log("📋 Export Summary:");
    console.log(\`   Generated: \${exportData.timestamp}\`);
    console.log(\`   Databases: \${Object.keys(exportData.databases).length}\`);
    
    for (const [dbName, dbData] of Object.entries(exportData.databases)) {
      console.log(\`   \${dbName}:\`);
      console.log(\`     Collections: \${Object.keys(dbData.collections).length}\`);
      
      for (const [collName, collData] of Object.entries(dbData.collections)) {
        console.log(\`     - \${collName}: \${collData.sampleDocuments.length} sample docs, \${collData.indexes.length} indexes\`);
      }
    }
  }
}

// Main execution
async function replicateDatabase() {
  const replicator = new DatabaseReplicator();
  
  try {
    // Show what will be replicated
    replicator.showExportSummary();
    
    // Connect to MongoDB (change URI if needed)
    const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017";
    await replicator.connect(mongoUri);
    
    // Replicate all databases
    await replicator.replicateAllDatabases();
    
  } catch (error) {
    console.error("❌ Replication failed:", error);
    process.exit(1);
  } finally {
    await replicator.disconnect();
    process.exit(0);
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log("👋 Process interrupted, cleaning up...");
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log("👋 Process terminated, cleaning up...");
  process.exit(0);
});

// Run the replication
console.log("🚀 Starting Database Replication Script...");
replicateDatabase();
`;

    fs.writeFileSync(scriptFile, scriptContent);
    logger.success(`🔧 Replication script generated: ${scriptFile}`);

    // Also generate a simple README
    const readmeFile = path.join(exportDir, `README-${timestamp}.md`);
    const readmeContent = `# Database Export - ${timestamp}

## Overview
This export contains the database structure and sample data from your MongoDB instance.

## Files Generated
- \`db-export-${timestamp}.json\` - Complete export data
- \`replicate-db-${timestamp}.js\` - Replication script
- \`README-${timestamp}.md\` - This file

## Databases Exported
${Object.keys(this.exportData.databases)
  .map((db) => `- **${db}**`)
  .join("\n")}

## Collections Summary
${Object.entries(this.exportData.databases)
  .map(([dbName, dbData]) => {
    return `### ${dbName}\n${Object.entries(dbData.collections)
      .map(
        ([collName, collData]) =>
          `- **${collName}**: ${collData.sampleDocuments.length} sample documents, ${collData.indexes.length} indexes`
      )
      .join("\n")}`;
  })
  .join("\n\n")}

## How to Use on New Machine

1. **Copy files** to your new machine
2. **Install dependencies**:
   \`\`\`bash
   npm install mongodb
   \`\`\`
3. **Run replication**:
   \`\`\`bash
   node replicate-db-${timestamp}.js
   \`\`\`

## Configuration
The replication script will connect to \`mongodb://localhost:27017\` by default.
To use a different MongoDB URI, set the environment variable:
\`\`\`bash
MONGODB_URI="mongodb://your-server:27017" node replicate-db-${timestamp}.js
\`\`\`

## What Gets Replicated
- Database structure
- Collection schemas
- Sample documents (first 10 from each collection)
- Indexes (except default _id index)
- Collection statistics

## Notes
- This is sample data export, not a full backup
- Production data should use proper backup tools
- Always test replication on non-production systems first
`;

    fs.writeFileSync(readmeFile, readmeContent);
    logger.success(`📖 README generated: ${readmeFile}`);
  }
}

async function exportMainDatabases() {
  const exporter = new DatabaseExporter();

  try {
    logger.info("🚀 Starting MongoDB database export...");

    // Export main databases
    const databasesToExport = [
      "main-data",
      // Add more databases if needed
    ];

    for (const dbName of databasesToExport) {
      try {
        await exporter.exportDatabase(dbName);
      } catch (error) {
        logger.error(`Failed to export database ${dbName}:`, error);
        // Continue with other databases
      }
    }

    // Save the export
    const exportFile = await exporter.saveExport();

    logger.success("🎉 Database export completed successfully!");
    logger.info("📋 Export Summary:");
    logger.info(`   File: ${exportFile}`);
    logger.info(
      `   Databases: ${Object.keys(exporter.exportData.databases).length}`
    );

    // Show detailed summary
    for (const [dbName, dbData] of Object.entries(
      exporter.exportData.databases
    )) {
      logger.info(`   ${dbName}:`);
      logger.info(
        `     Collections: ${Object.keys(dbData.collections).length}`
      );

      for (const [collName, collData] of Object.entries(dbData.collections)) {
        logger.info(
          `     - ${collName}: ${collData.sampleDocuments.length} sample docs, ${collData.indexes.length} indexes`
        );
      }
    }
  } catch (error) {
    logger.error("❌ Export failed:", error);
    process.exit(1);
  } finally {
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

// Run the export
logger.info("🚀 Starting Database Export Script...");
exportMainDatabases();
